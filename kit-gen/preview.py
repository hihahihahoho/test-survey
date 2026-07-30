#!/usr/bin/env python3
"""Sinh preview.html — ma trận 12 component × 5 style để soi 'cùng nội dung, khác style'.
Mở trực tiếp bằng double-click được (chỉ dùng <img> tương đối, không fetch)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "styles.json")))
styles = [s for s in cfg["styles"] if os.path.isdir(os.path.join(HERE, "kits", s["id"]))]

rows = []
for comp in cfg["components"]:
    cells = []
    for s in styles:
        rel = f'kits/{s["id"]}/{comp["file"]}.png'
        if os.path.exists(os.path.join(HERE, rel)):
            inner = f'<img src="{rel}" loading="lazy">'
        else:
            inner = '<span class=miss>thiếu</span>'
        cells.append(f'<td>{inner}</td>')
    rows.append(f'<tr><th>{comp["vi"]}<small>{comp["file"]}</small></th>{"".join(cells)}</tr>')

sheets = "".join(
    f'<figure><img src="raw/{s["id"]}.png"><figcaption>{s["vi"]} · <code>raw/{s["id"]}.png</code></figcaption></figure>'
    for s in styles if os.path.exists(os.path.join(HERE, "raw", f'{s["id"]}.png')))

html = f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Game UI Kit — 12 component × {len(styles)} style</title>
<style>
 body{{font-family:-apple-system,Segoe UI,sans-serif;margin:24px;background:#fafafa;color:#202124}}
 h1{{font-size:20px}} h2{{font-size:16px;margin-top:36px}}
 p.note{{color:#5f6368;font-size:13px;max-width:70em}}
 table{{border-collapse:collapse}}
 th,td{{border:1px solid #e0e0e0;padding:8px;text-align:center;vertical-align:middle}}
 thead th{{background:#f1f3f4;font-size:13px}}
 tbody th{{background:#f8f9fa;font-size:13px;text-align:left;min-width:120px}}
 tbody th small{{display:block;color:#80868b;font-weight:400;font-family:monospace;font-size:11px}}
 td{{background:conic-gradient(#ddd 90deg,#fff 90deg 180deg,#ddd 180deg 270deg,#fff 270deg) 0 0/16px 16px}}
 td img{{max-width:170px;max-height:120px;display:block;margin:auto}}
 .miss{{color:#d93025;font-size:12px}}
 figure{{display:inline-block;margin:8px;max-width:420px}}
 figure img{{width:100%;border:1px solid #e0e0e0;border-radius:6px}}
 figcaption{{font-size:12px;color:#5f6368;margin-top:4px}}
</style></head><body>
<h1>Game UI Kit PoC — cùng 12 component, {len(styles)} style</h1>
<p class="note">Mỗi cột là một style sinh bằng codex image-gen từ CÙNG một prompt nội dung
(chỉ thay khối style). Mỗi hàng là một component cố định của mini-game campaign.
Ô caro = đã tách nền. Cùng tên file giữa các thư mục <code>kits/&lt;style&gt;/</code>.</p>
<table><thead><tr><th>Component</th>{"".join(f"<th>{s['vi']}<small style='display:block;font-family:monospace;font-weight:400'>{s['id']}</small></th>" for s in styles)}</tr></thead>
<tbody>{"".join(rows)}</tbody></table>
<h2>Sprite sheet gốc</h2>
{sheets}
</body></html>"""

open(os.path.join(HERE, "preview.html"), "w").write(html)
print(f"→ preview.html ({len(styles)} style × {len(cfg['components'])} component)")
