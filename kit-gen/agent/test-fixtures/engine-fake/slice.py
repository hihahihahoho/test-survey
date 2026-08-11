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
        for i, c in enumerate(sh["components"]):
            if c["skel"].get("shape") == "empty":
                entry["empty_cells"].append({"sheet": sh["id"], "cell": i})
                continue
            open(os.path.join(out, c["file"] + ".png"), "wb").write(b"PNGFAKE")
            entry["assets"].append({"file": c["file"], "sheet": sh["id"], "cell": i})
            n += 1
        entry["sheets"][sh["id"]] = {"mode": "fake", "cut": n, "blobs": n}
        print(f"cắt {job}: {n} file")
    manifest["styles"][sid] = entry
os.makedirs(os.path.join(HERE, "kits"), exist_ok=True)
json.dump(manifest, open(mpath, "w"), indent=1)
