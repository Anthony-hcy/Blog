# 合并需要浏览器 UA 或独立 feed 抓取的站点进朋友圈数据。
# FriendCircle/reqwest 在部分站点会被 403 或超时；这里用 urllib（失败再 curl）直接抓 feed，
# 成功后合并文章，并同步清除 fcircle-errors.json 里对应的失联记录。
# 用法：python scripts/fetch_antibot.py [data.json 路径 [fcircle-errors.json 路径]]
import json
import re
import subprocess
import sys
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
    ('一叶竹', 'https://iyyz.org/feed/', 'https://iyyz.org/tx.png', 'rss'),
    ('鹅玉', 'https://eyu.at/index.xml', 'https://eyu.at/favicon.png', 'rss'),
]


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
        result = subprocess.run(
            ['curl', '-fsSL', '--max-time', '30', '-A', UA, url],
            capture_output=True, check=True, timeout=40,
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
