# 合并「反爬站点」的文章进朋友圈数据（fcircle-data.json）
# 这些站点用 FriendCircle/reqwest 请求会被拒（l3on.site: 拒绝无浏览器 UA；
# zhangjet.com: TLS 指纹级反爬，curl 也被拒），但 python urllib 可正常访问。
# 因此用 urllib（带浏览器 UA）抓它们的 feed，解析后合并进 data.json，
# 前端 /fcircle/ 正常显示。不占 SETTINGS_FRIENDS_LINKS 名额、不污染失联统计。
# 用法：python scripts/fetch_antibot.py [data.json 路径，默认 site-root/fcircle-data.json]
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
DATA_PATH = sys.argv[1] if len(sys.argv) > 1 else 'site-root/fcircle-data.json'

# (作者名, feed URL, 头像 URL, 格式)  格式: atom | rss
SITES = [
    ('l3on', 'https://l3on.site/feed/', 'https://bear-images.sfo2.cdn.digitaloceanspaces.com/lok/favicon.ico', 'atom'),
    ('绵绵小屋', 'https://zhangjet.com/feed', 'https://zhangjet.com/logo.gif', 'rss'),
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
    raise last


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
    authors = [s[0] for s in SITES]
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
    data['statistical_data']['article_num'] = len(data['article_data'])
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(f'total merged: {total}, article_num={len(data["article_data"])}')


if __name__ == '__main__':
    main()
