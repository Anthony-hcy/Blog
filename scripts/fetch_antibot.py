# 合并需要浏览器 UA 或独立 feed 抓取的站点进朋友圈数据。
# FriendCircle/reqwest 在部分站点会被 403 或超时；这里用 urllib（失败再 curl）直接抓 feed，
# 成功后合并文章，并同步清除 fcircle-errors.json 里对应的失联记录。
# 用法：python scripts/fetch_antibot.py [data.json 路径 [fcircle-errors.json 路径]]
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
DATA_PATH = sys.argv[1] if len(sys.argv) > 1 else 'site-root/fcircle-data.json'
ERROR_PATH = sys.argv[2] if len(sys.argv) > 2 else str(Path(DATA_PATH).with_name('fcircle-errors.json'))

# (作者名, feed URL, 头像 URL, 格式)  格式: atom | rss
SITES = [
    ('l3on', 'https://l3on.site/feed/', 'https://bear-images.sfo2.cdn.digitaloceanspaces.com/lok/favicon.ico', 'atom'),
    ('绵绵小屋', 'https://zhangjet.com/feed', 'https://zhangjet.com/logo.gif', 'rss'),
    ('扶苏', 'https://pwsz.com/feed', 'https://weavatar.com/avatar/8e5566d153dba1c372c54eae02401d96?s=96&d=404', 'rss'),
    ('鹅玉', 'https://eyu.at/index.xml', 'https://eyu.at/favicon.png', 'rss'),
    # 微信公众号：fcircle_core 对 rss.jintiankansha.me 的拼接结果不一定稳，这里用完整 URL 直连兜底。
    # 作者名必须与 fc_settings.yaml 里的名字一致，成功后会按名字把失联记录清掉。
    ('数字生命卡兹克', 'http://rss.jintiankansha.me/rss/GM2DAOJSGV6GGZRWGY2DEODDMU2GCY3CGBSWEZTFGQ3TINZRGQYGGMJWHA2GMN3BGFTDGZBWME3A====', 'https://mmbiz.qpic.cn/mmbiz_png/OjgKEXmLURraibxGuHz6cfRAR74OFy6ib8iavRtmYufwwkQiczWlX1HRaicDTfBkQnZDdjM9PQibS2kh6gNt4gq20Vzw/0?wx_fmt=png', 'rss'),
    ('3号厅检票员工', 'http://rss.jintiankansha.me/rss/GI4TENJVGZ6DKYZQMFRDSODEGNRDEM3FHEZWMM3GGM3WEMZWMEYGKMDDG4YDKMBQMQ4TEZTDGFRA====', 'https://mmbiz.qpic.cn/mmbiz_png/76VlEREHvOz9kA8yuDjE0wvKPzQ1MmSZXQRzFibwwDOSibnQQFEGGFxheU8Z1WAicrC605ibepwDSLYbVV6eibPSMzg/0?wx_fmt=png', 'rss'),
]

# 部分海外 DNS 会把站点黑洞到 127.0.0.1；curl 备用通道固定到已验证的源站 IP。
# 正常 urllib 直连优先，IP 失效时仍保留原错误，不会清空旧文章。
RESOLVE = {
    'pwsz.com': '61.241.15.149',
}


def fetch(url):
    last = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            last = e
            import time
            time.sleep(2)
    try:
        host = urllib.parse.urlsplit(url).hostname
        command = ['curl', '-fsSL', '--max-time', '30', '-A', UA]
        if host in RESOLVE:
            command += ['--resolve', f'{host}:443:{RESOLVE[host]}']
        command.append(url)
        result = subprocess.run(
            command, capture_output=True, check=True, timeout=40,
        )
        return result.stdout.decode('utf-8', 'replace')
    except Exception as curl_error:
        detail = ''
        if isinstance(curl_error, subprocess.CalledProcessError) and curl_error.stderr:
            detail = curl_error.stderr.decode('utf-8', 'replace').strip()
        raise RuntimeError(f'urllib: {last}; curl: {detail or curl_error}')


def parse_atom(xml_text):
    root = ET.fromstring(xml_text)
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    items = []
    for e in root.findall('a:entry', ns):
        title = (e.findtext('a:title', '', ns) or '').strip()
        link_el = e.find('a:link', ns)
        link = link_el.get('href', '') if link_el is not None else ''
        published = e.findtext('a:published', '', ns) or e.findtext('a:updated', '', ns)
        updated = e.findtext('a:updated', '', ns) or published
        if title and link and published:
            items.append({'title': title, 'link': link, 'created': published[:10], 'updated': (updated or published)[:10]})
    return items


def parse_rss(xml_text):
    root = ET.fromstring(xml_text)
    items = []
    for e in root.iter('item'):
        title = (e.findtext('title') or '').strip()
        # 微信镜像偶尔把「分享摘要」塞进 title（含字面量 \n、动辄几百字），取第一段当标题；
        # 正常英文长标题不含换行，不会被误伤。
        if '\\n' in title:
            title = title.split('\\n')[0].strip()
        if '\n' in title or '\r' in title:
            title = re.split(r'[\r\n]', title)[0].strip()
        if len(title) > 120:
            title = title[:120].rstrip() + '…'
        link = (e.findtext('link') or e.findtext('guid') or '').strip()
        pub = e.findtext('pubDate') or e.findtext('dc:date')
        created, updated = '', ''
        if pub:
            try:
                dt = parsedate_to_datetime(pub)
                created = dt.strftime('%Y-%m-%d')
                updated = created
            except Exception:
                m = re.search(r'\d{4}-\d{2}-\d{2}', pub)
                if m:
                    created = m.group(0)
                    updated = created
        if title and link and created:
            items.append({'title': title, 'link': link, 'created': created, 'updated': updated})
    return items


def count_settings_links(path='fc_settings.yaml'):
    """读取 fc_settings.yaml 里 SETTINGS_FRIENDS_LINKS.list 的条目数（= 订阅数）。
    fcircle_core 只统计这份清单，本脚本兜底合并的站不参与它的计数。"""
    try:
        text = Path(path).read_text(encoding='utf-8')
        m = re.search(r'SETTINGS_FRIENDS_LINKS:.*?list:\s*\[(.*?)\n\s*\]', text, re.S)
        if not m:
            return None
        return len(re.findall(r'^\s*\["', m.group(1), re.M))
    except Exception:
        return None


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)
    error_payload = None
    if Path(ERROR_PATH).exists():
        with open(ERROR_PATH, encoding='utf-8') as f:
            error_payload = json.load(f)
    authors = [s[0] for s in SITES]
    succeeded = set()
    # 保留各站旧条目：抓取失败的站回填旧数据，避免网络波动时从朋友圈消失
    old_by_author = {}
    for a in data['article_data']:
        if a.get('author') in authors:
            old_by_author.setdefault(a['author'], []).append(a)
    data['article_data'] = [a for a in data['article_data'] if a.get('author') not in authors]
    base = max((int(a.get('floor', 0)) for a in data['article_data']), default=0)
    total = 0
    for author, feed_url, avatar, kind in SITES:
        try:
            xml_text = fetch(feed_url)
            items = parse_atom(xml_text) if kind == 'atom' else parse_rss(xml_text)
            succeeded.add(author)
        except Exception as e:
            print(f'{author}: skip ({e}), keep {len(old_by_author.get(author, []))} old entries')
            for old in old_by_author.get(author, []):
                base += 1
                old = dict(old)
                old['floor'] = base
                data['article_data'].append(old)
            continue
        rows = []
        for it in items:
            base += 1
            rows.append({
                'floor': base,
                'title': it['title'],
                'created': it['created'],
                'updated': it['updated'],
                'link': it['link'],
                'author': author,
                'avatar': avatar,
            })
        data['article_data'].extend(rows)
        total += len(rows)
        print(f'{author}: merged {len(rows)} entries')
    recovered = []
    if error_payload is not None:
        original_errors = error_payload.get('errors', [])
        recovered = [e.get('name', '') for e in original_errors if e.get('name') in succeeded]
        remaining = [e for e in original_errors if e.get('name') not in succeeded]
        error_payload['errors'] = remaining
        stats = data['statistical_data']
        stats['error_num'] = len(remaining)
        # 订阅数以 fc_settings.yaml 的清单为准：fcircle_core 只数这份清单，
        # 本脚本兜底合并的站（含新加的微信 RSS）不进它的统计，直接用清单长度最稳。
        configured = count_settings_links()
        if configured:
            stats['friends_num'] = configured
        stats['active_num'] = max(int(stats.get('friends_num', 0)) - len(remaining), 0)
    data['statistical_data']['article_num'] = len(data['article_data'])
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    if error_payload is not None:
        with open(ERROR_PATH, 'w', encoding='utf-8') as f:
            json.dump(error_payload, f, ensure_ascii=False)
    if recovered:
        print('recovered: ' + ', '.join(recovered))
    print(f'total merged: {total}, article_num={len(data["article_data"])}')


if __name__ == '__main__':
    main()
