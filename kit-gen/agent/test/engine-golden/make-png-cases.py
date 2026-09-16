#!/usr/bin/env python3
"""Fixture cho CODEC PNG: mỗi ca là một file .png dựng THỦ CÔNG ở mức byte + đầu ra
`Image.open(f).convert("RGBA")` của Pillow trên chính nó. Dev-only.

VÌ SAO DỰNG THỦ CÔNG CHỨ KHÔNG NHỜ PILLOW GHI: Pillow chỉ ghi ra vài tổ hợp
(color type / bit depth / interlace) mà nó thích. Thứ cần kiểm là những tổ hợp
`slice.py` CÓ THỂ GẶP khi người dùng thả một tấm PNG lạ vào `raw/` — gray 16-bit,
palette + tRNS, LA 16-bit, Adam7. Dựng bằng zlib + struct thì mỗi ca là một câu tả
chính xác, và không có tổ hợp nào bị bỏ vì thư viện không chịu sinh ra nó.

Chạy: python3 make-png-cases.py <đích>
"""
import io, json, os, struct, sys, zlib
from PIL import Image


def chunk(t, d):
    c = t + d
    return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)


def png(w, h, depth, ctype, rows, plte=None, trns=None, interlace=0, filters=None):
    o = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, depth, ctype, 0, 0, interlace))
    if plte:
        o += chunk(b"PLTE", plte)
    if trns is not None:
        o += chunk(b"tRNS", trns)
    raw = b"".join(bytes([(filters or [0] * len(rows))[i]]) + r for i, r in enumerate(rows))
    return o + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def adam7_raw(px, W, H):
    passes = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
              (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
    raw = b""
    for x0, y0, dx, dy in passes:
        if len(range(x0, W, dx)) == 0 or len(range(y0, H, dy)) == 0:
            continue
        for y in range(y0, H, dy):
            raw += b"\x00" + b"".join(bytes(px[y][x]) for x in range(x0, W, dx))
    return raw


def build():
    c = {}
    PLTE = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 4, 5, 6])
    c["gray1"] = png(8, 1, 1, 0, [bytes([0b10110001])])
    c["gray1-trns"] = png(2, 1, 1, 0, [bytes([0b01000000])], trns=struct.pack(">H", 0))
    c["gray2"] = png(4, 1, 2, 0, [bytes([0b00011011])])
    c["gray4"] = png(4, 1, 4, 0, [bytes([0x0F, 0x8A])])
    # tRNS=8 KHÔNG ăn: Pillow so với mẫu ĐÃ quy về 8 bit (8 → 136), không so mẫu thô.
    c["gray4-trns-khong-an"] = png(4, 1, 4, 0, [bytes([0x0F, 0x8A])], trns=struct.pack(">H", 8))
    c["gray8"] = png(4, 1, 8, 0, [bytes([0, 1, 128, 255])])
    c["gray8-trns"] = png(4, 1, 8, 0, [bytes([0, 1, 128, 255])], trns=struct.pack(">H", 128))
    # 16-bit grayscale ⇒ mode I;16 ⇒ KẸP về 255, KHÔNG dịch bit; tRNS bị bỏ qua.
    c["gray16-kep"] = png(5, 1, 16, 0, [b"".join(struct.pack(">H", v) for v in (0, 1, 256, 32768, 65535))])
    c["gray16-trns-bi-bo"] = png(3, 1, 16, 0, [struct.pack(">HHH", 0, 258, 65535)],
                                 trns=struct.pack(">H", 258))
    c["rgb8"] = png(3, 1, 8, 2, [bytes([255, 0, 0, 0, 255, 0, 1, 2, 3])])
    c["rgb8-trns"] = png(3, 1, 8, 2, [bytes([255, 0, 0, 0, 255, 0, 1, 2, 3])],
                         trns=struct.pack(">HHH", 0, 255, 0))
    c["rgb16-dich-bit"] = png(2, 1, 16, 2, [struct.pack(">HHHHHH", 65535, 0, 258, 1, 32768, 65535)])
    c["pal1"] = png(2, 1, 1, 3, [bytes([0b01000000])], plte=PLTE[:6])
    c["pal2"] = png(4, 1, 2, 3, [bytes([0b00011011])], plte=PLTE)
    c["pal4"] = png(4, 1, 4, 3, [bytes([0x01, 0x23])], plte=PLTE)
    c["pal8"] = png(4, 1, 8, 3, [bytes([0, 1, 2, 3])], plte=PLTE)
    c["pal8-trns"] = png(4, 1, 8, 3, [bytes([0, 1, 2, 3])], plte=PLTE, trns=bytes([0, 128, 255]))
    c["la8"] = png(3, 1, 8, 4, [bytes([0, 0, 128, 128, 255, 255])])
    # LA 16-bit nạp thẳng thành RGBA (KHÔNG phải LA) — xem png.mjs ②.
    c["la16-thanh-rgba"] = png(2, 1, 16, 4, [struct.pack(">HHHH", 65535, 32768, 258, 65535)])
    c["rgba8"] = png(2, 1, 8, 6, [bytes([1, 2, 3, 4, 250, 251, 252, 253])])
    c["rgba16-dich-bit"] = png(2, 1, 16, 6,
                               [struct.pack(">HHHHHHHH", 65535, 0, 258, 32768, 1, 2, 3, 4)])

    # ── ảnh nhiều dòng: đủ cả năm filter + bản Adam7 CÙNG NỘI DUNG ────────────
    W, H = 9, 7
    px = [[((x * 29) % 256, (y * 53) % 256, (x * y * 13) % 256, (x + y * 31) % 256)
           for x in range(W)] for y in range(H)]
    rows = [bytes(b for p in row for b in p) for row in px]
    # ép mỗi dòng một filter khác nhau: dòng đầu phải là 0/1 (không có dòng trên).
    filters = [0, 1, 2, 3, 4, 2, 4]
    enc = []
    prev = bytes(len(rows[0]))
    for i, r in enumerate(rows):
        ft = filters[i]
        o = bytearray(len(r))
        for j in range(len(r)):
            a = r[j - 4] if j >= 4 else 0
            b = prev[j]
            cc = prev[j - 4] if j >= 4 else 0
            if ft == 0:
                v = r[j]
            elif ft == 1:
                v = r[j] - a
            elif ft == 2:
                v = r[j] - b
            elif ft == 3:
                v = r[j] - ((a + b) >> 1)
            else:
                p = a + b - cc
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - cc)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else cc)
                v = r[j] - pr
            o[j] = v & 0xFF
        enc.append(bytes(o))
        prev = r
    c["rgba8-du-nam-filter"] = png(W, H, 8, 6, enc, filters=filters)

    raw = adam7_raw(px, W, H)
    c["rgba8-adam7"] = (b"\x89PNG\r\n\x1a\n"
                        + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 1))
                        + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    return c


def main():
    dst = sys.argv[1]
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(dst):
        os.remove(os.path.join(dst, f))
    index = {}
    for name, blob in sorted(build().items()):
        open(os.path.join(dst, name + ".png"), "wb").write(blob)
        im = Image.open(io.BytesIO(blob))
        rgba = im.convert("RGBA")
        index[name] = {"mode": im.mode, "bands": list(im.getbands()),
                       "size": list(im.size),
                       "rgba": [v for p in rgba.getdata() for v in p]}
        print("  ·", name, im.mode, im.size)
    with open(os.path.join(dst, "expected.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("→", os.path.join(dst, "expected.json"), "(Pillow", Image.__version__ + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
