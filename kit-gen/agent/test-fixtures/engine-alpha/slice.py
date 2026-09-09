# SLICE GIẢ CHO TEST — cùng giao diện với slice.py thật:
#   · HERE = thư mục chứa script; đọc HERE/styles.json; ghi HERE/kits/<style>/*.png
#   · argv là TẬP CHÍNH XÁC các style cần cắt (không phải substring)
#   · `--sheet=<id>` (lặp được) thu hẹp về ĐÚNG một tấm — đường CẮT LŨY TIẾN mà agent
#     dùng ngay khi một tấm gen xong (slice.py thật: parse_cli + ONLY_SHEETS)
#   · merge kits/manifest.json: sheet KHÔNG cắt lượt này phải còn nguyên trong manifest,
#     nếu không thì cắt lũy tiến 3 lượt sẽ chỉ còn lại tấm cuối (bản thật: khối "GEN LẠI
#     MỘT NHÓM", slice.py:1181-1221)
#   · ghi manifest NGUYÊN TỬ (tmp + os.replace) như bản thật
# KHÁC: không tách alpha thật, chỉ ghi file rỗng để kiểm luồng.
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "styles.json")))

ONLY, ONLY_SHEETS = set(), set()
for _a in sys.argv[1:]:
    if _a.startswith("--sheet="):
        ONLY_SHEETS.add(_a[len("--sheet="):])
    elif _a.startswith("--sheets="):
        ONLY_SHEETS.update(s for s in _a[len("--sheets="):].split(",") if s)
    else:
        ONLY.add(_a)

mpath = os.path.join(HERE, "kits", "manifest.json")
os.makedirs(os.path.join(HERE, "kits"), exist_ok=True)
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {"styles": {}}
manifest.setdefault("styles", {})
for style in cfg["styles"]:
    sid = style["id"]
    if ONLY and sid not in ONLY:
        continue
    out = os.path.join(HERE, "kits", sid)
    os.makedirs(out, exist_ok=True)
    entry = {"sheets": {}, "assets": [], "empty_cells": []}
    done_sheets = set()
    for sh in cfg["sheets"]:
        if sh.get("styles") and sid not in sh["styles"]:
            continue
        if ONLY_SHEETS and sh["id"] not in ONLY_SHEETS:
            continue
        job = f"{sid}-{sh['id']}"
        if not os.path.exists(os.path.join(HERE, "raw", f"{job}.png")):
            print(f"⚠ bỏ qua {job}: chưa có raw/{job}.png")
            continue
        # NỀN ĐỤC ĐI THEO TỚI TẬN MANIFEST. Bản thật đọc kênh alpha của tấm; ở đây
        # nội dung ảnh giả đã nói sẵn ("PNGFAKE-DUC"). Đây là thứ DUY NHẤT còn nói
        # cho người dùng biết tấm này không có nền trong suốt, từ khi phép đo alpha
        # thôi chặn (chủ sản phẩm chốt 09/09/2026: "cứ để cho nó gen tự nhiên").
        raw_bytes = open(os.path.join(HERE, "raw", f"{job}.png"), "rb").read()
        mode = "rgb" if b"DUC" in raw_bytes else "alpha"
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
                "file": c["file"] + ".png", "sheet": sh["id"], "mode": mode,
                "canvas": [522, 348], "cell": [384, 256], "bleed": [69, 46],
                "content": [248, 110], "content_at": [137, 120],
                "safe": [111, 123, 300, 102],
            })
            n += 1
        entry["sheets"][sh["id"]] = {"mode": mode, "cut": n, "blobs": n}
        done_sheets.add(sh["id"])
        print(f"cắt {job}: {n} file")

    # GIỮ LẠI phần sheet không chạy lượt này (bản thật: slice.py "GEN LẠI MỘT NHÓM")
    prev = manifest["styles"].get(sid) or {}
    keep = [k for k in (prev.get("sheets") or {}) if k not in done_sheets]
    for k in keep:
        entry["sheets"][k] = prev["sheets"][k]
    for a in (prev.get("assets") or []):
        if a.get("sheet") in keep:
            entry["assets"].append(a)
    for e in (prev.get("empty_cells") or []):
        if isinstance(e, dict) and e.get("sheet") in keep:
            entry["empty_cells"].append(e)
    if keep:
        print(f"  ↺ {sid}: giữ nguyên {len(keep)} sheet không chạy lượt này ({', '.join(keep)})")

    manifest["styles"][sid] = entry

tmp = mpath + ".tmp"
json.dump(manifest, open(tmp, "w"), indent=1)
os.replace(tmp, mpath)
print("→ kits/manifest.json")
