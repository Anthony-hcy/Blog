# 合并 l3on.site 的文章进朋友圈数据（fcircle-data.json）
# l3on.site 服务器拒绝无浏览器 UA 的请求（FriendCircle/reqwest 默认 UA 被 403/404），
# 所以不走 FriendCircle 采集，而是这里用带浏览器 UA 的请求抓 /feed/（Atom），
# 解析后合并进 data.json，前端 /fcircle/ 正常显示。
# 用法：python scripts/fetch_l3on.py [data.json 路径，默认 site-root/fcircle-data.json]
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

L3ON_FEED = 'https://l3on.site/feed/'
L3ON_AUTHOR = 'l3on'
L3ON_AVATAR = 'https://bear-images.sfo2.cdn.digitaloceanspaces.com/lok/favicon.ico'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
DATA_PATH = sys.argv[1] if len(sys.argv) > 1 else 'site-root/fcircle-data.json'


def fetch_feed():
    last = None
    for _ in range(4):
        try:
            req = urllib.request.Request(L3ON_FEED, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            last = e
            import time
            time.sleep(2)
    raise last


def parse_feed(xml_text):
    root = ET.fromstring(xml_text)
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    items = []
    for e in root.findall('a:entry', ns):
        title = e.findtext('a:title', '', ns).strip()
        link_el = e.find('a:link', ns)
        link = link_el.get('href', '') if link_el is not None else ''
        published = e.findtext('a:published', '', ns) or e.findtext('a:updated', '', ns)
        updated = e.findtext('a:updated', '', ns) or published
        created = published[:10] if published else ''
        updated_day = updated[:10] if updated else created
        if title and link and created:
            items.append({'title': title, 'link': link, 'created': created, 'updated': updated_day})
    return items


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        data = json.load(f)
    # 移除旧的 l3on 条目
    data['article_data'] = [a for a in data['article_data'] if a.get('author') != L3ON_AUTHOR]
    base = max((int(a.get('floor', 0)) for a in data['article_data']), default=0)
    items = parse_feed(fetch_feed())
    new_rows = []
    for it in items:
        base += 1
        new_rows.append({
            'floor': base,
            'title': it['title'],
            'created': it['created'],
            'updated': it['updated'],
            'link': it['link'],
            'author': L3ON_AUTHOR,
            'avatar': L3ON_AVATAR,
        })
    data['article_data'].extend(new_rows)
    data['statistical_data']['article_num'] = len(data['article_data'])
    # friends/active 计数不在此脚本动（l3on 不算 SETTINGS_FRIENDS_LINKS 成员）
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(f'l3on merged: {len(new_rows)} entries (total {len(data["article_data"])})')


if __name__ == '__main__':
    main()
