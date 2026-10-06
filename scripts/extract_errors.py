# 从 FriendCircle 采集日志中提取失联友链明细，生成 site-root/fcircle-errors.json
# 用法：python scripts/extract_errors.py [采集日志路径] [输出 JSON 路径]
import json
import re
import sys

LOG_PATH = sys.argv[1] if len(sys.argv) > 1 else 'collect.log'
OUT_PATH = sys.argv[2] if len(sys.argv) > 2 else 'site-root/fcircle-errors.json'

raw = open(LOG_PATH, encoding='utf-8', errors='replace').read()
errors = []
# 失联友链明细 [ {name,link,avatar,error,createdAt} ]
m = re.search(r'失联友链明细\s*(\[.*?\])', raw, re.S)
if m:
    try:
        errors = json.loads(m.group(1))
    except Exception:
        # 兼容 ANSI 转义等干扰：清理后重试
        cleaned = re.sub(r'\x1b\[[0-9;]*m', '', m.group(1))
        try:
            errors = json.loads(cleaned)
        except Exception as e:
            print('parse errors failed:', e)

out = {'last_updated_time': None, 'errors': []}
for e in errors:
    out['errors'].append({
        'name': e.get('name', ''),
        'link': e.get('link', ''),
        'avatar': e.get('avatar', ''),
        'createdAt': e.get('createdAt', ''),
    })
    out['last_updated_time'] = e.get('createdAt')
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False)
print(f'errors extracted: {len(out["errors"])} -> {OUT_PATH}')
