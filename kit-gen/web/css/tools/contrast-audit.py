#!/usr/bin/env python3
"""
contrast-audit.py — ĐO tương phản THẬT bằng cách PARSE web/css/tokens.css.

Khác `check-contrast.py` (của d1, hard-code sẵn giá trị): file này ĐỌC token từ
tokens.css nên nếu ai đổi token mà quên đo lại, script sẽ tự phát hiện.

Có 3 việc:
  1. parse `--name: value` cho cả 2 theme (dark / light)
  2. tự COMPOSITE màu rgba() lên nền bên dưới (badge tint 16% nằm trên 4 lớp nền)
  3. đo theo WCAG 2.1 relative luminance; ngưỡng 4.5 (chữ) / 3.0 (viền & icon)

Chạy:  python3 web/css/tools/contrast-audit.py [--md]
Thoát code 1 nếu có bất kỳ cặp nào FAIL.
"""
import re
import sys
import pathlib

TOKENS = pathlib.Path(__file__).resolve().parents[1] / "tokens.css"


# ── parse ────────────────────────────────────────────────────────────────────
def strip_comments(text):
    """Bỏ /* … */ TRƯỚC khi parse — nếu không, chú thích có dấu ';' và ':' sẽ bị
    hiểu thành khai báo và làm lệch giá trị token (đã cắn một lần)."""
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def parse_themes(text):
    """Trả {'dark': {...}, 'light': {...}}. Token khai ở :root chung đi vào cả hai."""
    text = strip_comments(text)
    themes = {"dark": {}, "light": {}}
    # tách theo từng block `selector { ... }`
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", text):
        sel, body = m.group(1), m.group(2)
        decls = dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", body))
        if not decls:
            continue
        if 'data-theme="light"' in sel:
            targets = ["light"]
        elif 'data-theme="dark"' in sel:
            targets = ["dark"]
        elif ":root" in sel:
            targets = ["dark", "light"]
        else:
            continue
        for t in targets:
            for k, v in decls.items():
                themes[t][k] = v.strip()
    return themes


def parse_color(v):
    """'#RRGGBB' -> (r,g,b,1.0);  'rgba(r,g,b,a)' -> (r,g,b,a);  None nếu không phải màu."""
    v = v.strip()
    m = re.fullmatch(r"#([0-9A-Fa-f]{6})", v)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    m = re.fullmatch(r"#([0-9A-Fa-f]{3})", v)
    if m:
        h = m.group(1)
        return tuple(int(c * 2, 16) for c in h) + (1.0,)
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)", v)
    if m:
        r, g, b = (float(m.group(i)) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) else 1.0
        return (r, g, b, a)
    return None


def over(fg, bg):
    """Alpha-composite fg lên bg (bg phải đục). Trả tuple RGB đục."""
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3))


def lum(c):
    def f(x):
        x = x / 255.0
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(fg, bg):
    l1, l2 = sorted((lum(fg), lum(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def hexs(c):
    return "#" + "".join(f"{round(x):02X}" for x in c[:3])


# ── ma trận cặp cần đo ───────────────────────────────────────────────────────
# 4 lớp nền của app (§5.3). Mọi chữ/viền phải đo trên lớp nền THẬT nó nằm lên.
LAYERS = ["--bg-canvas", "--bg-surface", "--bg-raised", "--bg-overlay"]

# (token chữ, các lớp nền hợp lệ theo LUẬT của tokens.css, ngưỡng)
TEXT_ON_LAYERS = [
    ("--fg-strong", LAYERS, 4.5),
    ("--fg-default", LAYERS, 4.5),
    # LUẬT tokens.css: --fg-muted CHỈ dùng trên canvas/surface
    ("--fg-muted", ["--bg-canvas", "--bg-surface"], 4.5),
    ("--fg-muted-raised", LAYERS, 4.5),
    # --accent-text là token DÙNG LÀM CHỮ. `--accent` không nằm ở đây vì sau lượt
    # a11y nó chỉ còn dùng cho NỀN ĐẶC (nút primary) và VIỀN → đo ở nhóm 1.4.11.
    ("--accent-text", LAYERS, 4.5),
    ("--ok", LAYERS, 4.5),
    ("--warn", LAYERS, 4.5),
    ("--danger", LAYERS, 4.5),
    ("--running", LAYERS, 4.5),
    ("--stale", LAYERS, 4.5),
]
# viền & icon mang thông tin: WCAG 1.4.11 ≥3:1
NONTEXT_ON_LAYERS = [
    ("--accent", LAYERS, 3.0),        # viền ô đang chọn / vạch rail / nền progress
    ("--line-default", LAYERS, 3.0),
    ("--line-strong", LAYERS, 3.0),
    ("--focus-ring", LAYERS, 3.0),
]
# ── QA-UX CAO-B · nhóm mà bản trước BỎ HẲN: trạng thái BỊ CHẶN (disabled) ────
# Lượt QA UX LEAD tìm ra: script cũ chỉ đo `token × 4 lớp nền phẳng`, không có khái
# niệm `opacity`. Trong khi đó 8 selector dùng `opacity: .45` cho trạng thái bị chặn
# — độ mờ tác động lên CẢ chữ lẫn nền nên tỉ lệ THẬT chỉ còn 1.89–2.45:1, tức là dưới
# cả ngưỡng 3:1 của thành phần UI, ở đúng trạng thái mặc định lúc mở app.
# Nay các selector đó dùng --fg-disabled/--bg-disabled; nhóm dưới đây ĐO chúng để
# lần sau ai hạ giá trị token là bị bắt tự động.
DISABLED_PAIRS = [
    ("--fg-disabled", LAYERS, 4.5),
]
# chữ bị chặn trên chính nền bị chặn (nút/ô nhập/dropzone có nền riêng)
DISABLED_ON_SOLID = [
    ("--fg-disabled", "--bg-disabled", 4.5),
]
# QA-UX TB-C · vòng đệm focus phải ≥3:1 với CẢ ring lẫn mọi nền nút đặc (WCAG 2.4.11).
FOCUS_GAP_PAIRS = [
    ("--focus-ring-gap", "--focus-ring", 3.0),
    ("--focus-ring-gap", "--accent", 3.0),
    ("--focus-ring-gap", "--danger-solid", 3.0),
]
# QA-UX THẤP-C · spinner: cung quay phải phân biệt được với vòng nền, nếu không thì
# người dùng thấy một vòng tròn mà không biết app đang bận hay đã đứng.
SPINNER_PAIRS = [
    ("--accent", "--line-subtle", 3.0),
]

# chữ trên nền đặc
ON_SOLID = [
    ("--fg-onAccent", "--accent", 4.5),
    ("--fg-onDanger", "--danger-solid", 4.5),
]
# badge: chữ --on-tint-X nằm trên (tint X 16% ⊕ mỗi lớp nền) → lấy TRƯỜNG HỢP XẤU NHẤT
BADGE_PAIRS = [
    ("--on-tint-never", "--muted-weak"),
    ("--on-tint-queued", "--default-weak"),
    ("--on-tint-running", "--running-weak"),
    ("--on-tint-accent", "--accent-weak"),
    ("--on-tint-ok", "--ok-weak"),
    ("--on-tint-warn", "--warn-weak"),
    ("--on-tint-stale", "--stale-weak"),
    ("--on-tint-danger", "--danger-weak"),
]

rows = []
fails = []


def add(theme, group, label, fg_hex, bg_hex, val, mn):
    ok = val + 1e-9 >= mn
    rows.append((theme, group, label, fg_hex, bg_hex, round(val, 2), mn, ok))
    if not ok:
        fails.append((theme, label, round(val, 2), mn))


def run(theme, tok):
    def col(name):
        c = parse_color(tok[name])
        if c is None:
            raise SystemExit(f"{name} không phải màu: {tok[name]!r}")
        return c

    for fgname, layers, mn in TEXT_ON_LAYERS:
        fg = col(fgname)
        for bgname in layers:
            bg = col(bgname)
            add(theme, "chữ trên nền", f"{fgname} on {bgname}", hexs(fg), hexs(bg),
                ratio(over(fg, bg), bg), mn)

    for fgname, layers, mn in NONTEXT_ON_LAYERS:
        fg = col(fgname)
        for bgname in layers:
            bg = col(bgname)
            add(theme, "viền/icon (1.4.11)", f"{fgname} on {bgname}", hexs(fg), hexs(bg),
                ratio(over(fg, bg), bg), mn)

    for fgname, bgname, mn in ON_SOLID:
        fg, bg = col(fgname), col(bgname)
        add(theme, "chữ trên nền đặc", f"{fgname} on {bgname}", hexs(fg), hexs(bg),
            ratio(over(fg, bg), bg), mn)

    # QA-UX CAO-B · trạng thái bị chặn
    for fgname, layers, mn in DISABLED_PAIRS:
        fg = col(fgname)
        for bgname in layers:
            bg = col(bgname)
            add(theme, "trạng thái bị chặn", f"{fgname} on {bgname}", hexs(fg), hexs(bg),
                ratio(over(fg, bg), bg), mn)
    for fgname, bgname, mn in DISABLED_ON_SOLID:
        fg, bg = col(fgname), col(bgname)
        add(theme, "trạng thái bị chặn", f"{fgname} on {bgname}", hexs(fg), hexs(bg),
            ratio(over(fg, bg), bg), mn)

    # QA-UX TB-C · vòng đệm ring focus (WCAG 2.4.11 Focus Appearance)
    for fgname, bgname, mn in FOCUS_GAP_PAIRS:
        fg, bg = col(fgname), col(bgname)
        add(theme, "ring focus (2.4.11)", f"{fgname} vs {bgname}", hexs(fg), hexs(bg),
            ratio(over(fg, bg), bg), mn)

    # QA-UX THẤP-C · spinner cung vs vòng
    for fgname, bgname, mn in SPINNER_PAIRS:
        fg, bg = col(fgname), col(bgname)
        add(theme, "spinner cung/vòng", f"{fgname} vs {bgname}", hexs(fg), hexs(bg),
            ratio(over(fg, bg), bg), mn)

    for fgname, tintname in BADGE_PAIRS:
        fg, tint = col(fgname), col(tintname)
        worst, worst_bg = None, None
        for bgname in LAYERS:
            base = col(bgname)
            eff = over(tint, base) + (1.0,)          # nền badge thật sau khi trộn
            r = ratio(over(fg, eff), eff)
            if worst is None or r < worst:
                worst, worst_bg = r, hexs(eff)
        add(theme, "chữ badge trên tint", f"{fgname} on {tintname} (xấu nhất)",
            hexs(fg), worst_bg, worst, 4.5)


def main():
    text = TOKENS.read_text(encoding="utf-8")
    themes = parse_themes(text)
    for theme in ("dark", "light"):
        run(theme, themes[theme])

    as_md = "--md" in sys.argv
    if as_md:
        print("| theme | hạng mục | cặp | chữ | nền thật | tỉ lệ | ngưỡng | kết quả |")
        print("|---|---|---|---|---|---|---|---|")
        for t, g, lbl, f, b, v, mn, ok in rows:
            print(f"| {t} | {g} | `{lbl}` | `{f}` | `{b}` | **{v}:1** | {mn}:1 | {'✅ PASS' if ok else '❌ FAIL'} |")
    else:
        cur = None
        for t, g, lbl, f, b, v, mn, ok in rows:
            if (t, g) != cur:
                cur = (t, g)
                print(f"\n=== {t.upper()} · {g} ===")
            print(f"{'PASS' if ok else 'FAIL'}  {lbl:46s} {f} on {b} = {v:6.2f} (min {mn})")

    print(f"\nTổng: {len(rows)} cặp · {len(rows) - len(fails)} pass · {len(fails)} fail")
    for t, lbl, v, mn in fails:
        print(f"  FAIL [{t}] {lbl} = {v} < {mn}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
