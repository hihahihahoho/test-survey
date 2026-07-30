#!/usr/bin/env python3
"""Sinh preview.html — ma trận element × style (contract v3, nhiều sheet).
Mở trực tiếp bằng double-click được (chỉ dùng <img> tương đối, không fetch)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "styles.json")))
styles = [s for s in cfg["styles"] if os.path.isdir(os.path.join(HERE, "kits", s["id"]))]

sections = []
for sh in cfg["sheets"]:
    rows = []
    for comp in sh["components"]:
        cells = []
        for s in styles:
            rel = f'kits/{s["id"]}/{comp["file"]}.png'
            if os.path.exists(os.path.join(HERE, rel)):
                inner = f'<img src="{rel}" loading="lazy">'
            else:
                inner = '<span class=miss>thiếu</span>'
            cells.append(f'<td>{inner}</td>')
        rows.append(f'<tr><th>{comp["vi"]}<small>{comp["file"]}</small></th>{"".join(cells)}</tr>')
    head = "".join(
        f"<th>{s['vi']}<small style='display:block;font-family:monospace;font-weight:400'>{s['id']}</small></th>"
        for s in styles)
    grid = sh["grid"]
    sections.append(
        f'<h2>Sheet «{sh["id"]}» — lưới {grid["cols"]}×{grid["rows"]}</h2>'
        f'<table><thead><tr><th>Element</th>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table>')

sheets_raw = []
for s in styles:
    for sh in cfg["sheets"]:
        rel = f'raw/{s["id"]}-{sh["id"]}.png'
        if os.path.exists(os.path.join(HERE, rel)):
            sheets_raw.append(
                f'<figure><img src="{rel}" loading="lazy"><figcaption>{s["vi"]} · {sh["id"]}</figcaption></figure>')

n_comp = sum(len(sh["components"]) for sh in cfg["sheets"])
html = f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Game UI Kit v3 — {n_comp} element × {len(styles)} style</title>
<style>
 body{{font-family:-apple-system,Segoe UI,sans-serif;margin:24px;background:#fafafa;color:#202124}}
 h1{{font-size:20px}} h2{{font-size:16px;margin-top:36px}}
 p.note{{color:#5f6368;font-size:13px;max-width:70em}}
 table{{border-collapse:collapse}}
 th,td{{border:1px solid #e0e0e0;padding:8px;text-align:center;vertical-align:middle}}
 thead th{{background:#f1f3f4;font-size:13px}}
 tbody th{{background:#f8f9fa;font-size:13px;text-align:left;min-width:130px}}
 tbody th small{{display:block;color:#80868b;font-weight:400;font-family:monospace;font-size:11px}}
 td{{background:conic-gradient(#ddd 90deg,#fff 90deg 180deg,#ddd 180deg 270deg,#fff 270deg) 0 0/16px 16px}}
 td img{{max-width:170px;max-height:130px;display:block;margin:auto}}
 .miss{{color:#d93025;font-size:12px}}
 figure{{display:inline-block;margin:8px;max-width:400px}}
 figure img{{width:100%;border:1px solid #e0e0e0;border-radius:6px}}
 figcaption{{font-size:12px;color:#5f6368;margin-top:4px}}
</style></head><body>
<h1>Game UI Kit v3 — {n_comp} element × {len(styles)} style</h1>
<p class="note">Contract rút từ Figma game thật (VietinBank iPay "Mở túi - Khui quà").
Element cần code điều khiển được tách phần: progress = máng + thanh chạy, tab = thường + chọn,
mảnh ghép = sáng + khoá, túi = đóng + mở, mascot 3 pose, popup 2 khổ + ruy băng rời.
Cùng tên file giữa các thư mục <code>kits/&lt;style&gt;/</code>. Xem <a href="demo.html">demo.html</a>
để thấy bộ kit lắp thành game chạy được.</p>
{"".join(sections)}
<h2>Sprite sheet gốc</h2>
{"".join(sheets_raw)}
</body></html>"""

open(os.path.join(HERE, "preview.html"), "w").write(html)
print(f"→ preview.html ({len(styles)} style × {n_comp} element)")
