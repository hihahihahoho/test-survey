# SLICE GIẢ CHO TEST — cùng giao diện với slice.py thật:
#   · HERE = thư mục chứa script; đọc HERE/styles.json; ghi HERE/kits/<style>/*.png
#   · argv là TẬP CHÍNH XÁC các style cần cắt (không phải substring)
#   · merge kits/manifest.json
# KHÁC: không tách alpha thật, chỉ ghi file rỗng để kiểm luồng.
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "styles.json")))
ONLY = set(sys.argv[1:])
mpath = os.path.join(HERE, "kits", "manifest.json")
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {"styles": {}}
manifest.setdefault("styles", {})
for style in cfg["styles"]:
    sid = style["id"]
    if ONLY and sid not in ONLY:
        continue
    out = os.path.join(HERE, "kits", sid)
    os.makedirs(out, exist_ok=True)
    entry = {"sheets": {}, "assets": [], "empty_cells": []}
    for sh in cfg["sheets"]:
        if sh.get("styles") and sid not in sh["styles"]:
            continue
        job = f"{sid}-{sh['id']}"
        if not os.path.exists(os.path.join(HERE, "raw", f"{job}.png")):
            print(f"⚠ bỏ qua {job}: chưa có raw/{job}.png")
            continue
        n = 0
        os.makedirs(os.path.join(out, "tight"), exist_ok=True)
        for i, c in enumerate(sh["components"]):
            if c["skel"].get("shape") == "empty":
                entry["empty_cells"].append({"sheet": sh["id"], "cell": i})
                continue
            open(os.path.join(out, c["file"] + ".png"), "wb").write(b"PNGFAKE")
            # bản ôm sát, đúng như slice.py:950-953 thật
            open(os.path.join(out, "tight", c["file"] + ".png"), "wb").write(b"PNGFAKE")
            # ⚠️ HÌNH DẠNG PHẢI GIỐNG slice.py THẬT (dòng 963-966), nếu không test
            #    xanh mà sản phẩm đỏ — đúng chuyện đã xảy ra với `sheet: null`:
            #      · `file` KÈM đuôi ".png"
            #      · `cell` là KÍCH THƯỚC ô [w, h], KHÔNG phải chỉ số ô
            #      · có `safe` / `content_at` cho đường copy sang Figma
            entry["assets"].append({
                "file": c["file"] + ".png", "sheet": sh["id"],
                "canvas": [522, 348], "cell": [384, 256], "bleed": [69, 46],
                "content": [248, 110], "content_at": [137, 120],
                "safe": [111, 123, 300, 102],
            })
            n += 1
        entry["sheets"][sh["id"]] = {"mode": "fake", "cut": n, "blobs": n}
        print(f"cắt {job}: {n} file")
    manifest["styles"][sid] = entry
os.makedirs(os.path.join(HERE, "kits"), exist_ok=True)
json.dump(manifest, open(mpath, "w"), indent=1)
