def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    l1,l2=sorted((lum(a),lum(b)),reverse=True); return round((l1+0.05)/(l2+0.05),2)

fails=[]
def chk(label,a,b,mn):
    v=cr(a,b); ok=v>=mn
    if not ok: fails.append((label,v,mn))
    print(f"{'PASS' if ok else 'FAIL'}  {label:34s} {a} on {b} = {v:6.2f} (min {mn})")

print("=== DARK (surface #12161F) ===")
S="#12161F"
for n,c,m in [("fg-strong","#E8ECF4",4.5),("fg-default","#9AA4B8",4.5),("fg-muted","#767F95",4.5),
  ("accent","#4C8DFF",4.5),("focus-ring","#7FB0FF",3.0),("line-default","#6B7590",3.0),
  ("line-strong","#8B94A6",3.0),("ok","#5CE0AE",4.5),("warn/stale","#FFC24D",4.5),
  ("danger(text)","#FF9AA0",4.5),("running","#C77DFF",4.5),("fg-muted-raised","#99A1B3",4.5)]:
    chk(n,c,S,m)
chk("fg-onAccent on accent","#0B0E14","#4C8DFF",4.5)
chk("fg-onDanger on danger-solid","#FFFFFF","#B4232A",4.5)
print("-- dark: cũng phải đọc được trên canvas & raised & overlay --")
for bg in ("#0B0E14","#1A1F2A","#262C38"):
    chk(f"fg-strong on {bg}","#E8ECF4",bg,4.5)
    chk(f"fg-default on {bg}","#9AA4B8",bg,4.5)
    chk(f"fg-muted-raised on {bg}","#99A1B3",bg,4.5)
    chk(f"focus-ring on {bg}","#7FB0FF",bg,3.0)
    chk(f"line-default on {bg}","#6B7590",bg,3.0)

print("\n=== LIGHT (surface #F6F7FA) ===")
L="#F6F7FA"
for n,c,m in [("fg-strong","#131722",4.5),("fg-default","#4A5265",4.5),("fg-muted","#5C6577",4.5),
  ("accent","#1955C2",4.5),("focus-ring","#14489F",3.0),("line-default","#767F92",3.0),
  ("line-strong","#5E6779",3.0),("ok","#0B6B48",4.5),("warn/stale","#7A5000",4.5),
  ("danger","#A81F26",4.5),("running","#612C9E",4.5)]:
    chk(n,c,L,m)
chk("fg-onAccent on accent","#FFFFFF","#1955C2",4.5)
print("-- light: trên canvas/raised/overlay --")
for bg in ("#FFFFFF","#EDEFF4","#E2E5EC"):
    chk(f"fg-strong on {bg}","#131722",bg,4.5)
    chk(f"fg-default on {bg}","#4A5265",bg,4.5)
    chk(f"fg-muted on {bg}","#5C6577",bg,4.5)
    chk(f"line-default on {bg}","#767F92",bg,3.0)
    chk(f"accent on {bg}","#1955C2",bg,4.5)

print("\n=== đối chiếu bệnh v1 (audit I1) ===")
v=cr("#2f6fed","#2f3445"); print(f"{'PASS(expected FAIL)' if v<3 else 'UNEXPECTED'} v1 viền chọn = {v}")
print("\nTỔNG (phần §5.3):", "TẤT CẢ PASS" if not fails else f"{len(fails)} FAIL -> {fails}")


# ---------------------------------------------------------------------------
# BỔ SUNG: chữ badge nằm trên nền tint (màu trạng thái ở 16% dark / 12% light)
# phủ lên TỪNG lớp nền. §5.5 chỉ nói "nền = màu trạng thái 16% alpha", không
# nói dùng màu chữ nào; nếu dùng luôn --accent/--running thì TRƯỢT 4.5:1 trên
# --bg-overlay → vì thế tokens.css có bộ --on-tint-*.
def hx(h):
    h = h.lstrip('#'); return [int(h[i:i+2], 16) for i in (0, 2, 4)]
def over(fg, a, bg):
    f, b = hx(fg), hx(bg)
    return '#%02X%02X%02X' % tuple(round(f[i]*a + b[i]*(1-a)) for i in range(3))

print("\n=== DARK · chữ badge trên nền tint 16% (xấu nhất qua 4 lớp nền) ===")
DARK_BG = ('#0B0E14', '#12161F', '#1A1F2A', '#262C38')
dark_badges = [
    ("never",   "#767F95", "#A8B1C2"), ("queued",  "#9AA4B8", "#AEB6C6"),
    ("running", "#C77DFF", "#D6A0FF"), ("accent",  "#4C8DFF", "#8FBBFF"),
    ("ok",      "#5CE0AE", "#5CE0AE"), ("warn",    "#FFC24D", "#FFC24D"),
    ("danger",  "#FF9AA0", "#FF9AA0"),
]
for name, tint, text in dark_badges:
    worst = min(cr(text, over(tint, 0.16, bg)) for bg in DARK_BG)
    chk(f"badge {name} (--on-tint-{name})", text, over(tint, 0.16, '#262C38'), 4.5)

print("\n=== LIGHT · chữ badge trên nền tint 12% ===")
LIGHT_BG = ('#FFFFFF', '#F6F7FA', '#EDEFF4', '#E2E5EC')
light_badges = [
    ("never",   "#5C6577", "#474F5E"), ("running", "#612C9E", "#4F2482"),
    ("accent",  "#1955C2", "#14489F"), ("ok",      "#0B6B48", "#095739"),
    ("warn",    "#7A5000", "#664300"), ("danger",  "#A81F26", "#8E1A20"),
]
for name, tint, text in light_badges:
    chk(f"badge light {name}", text, over(tint, 0.12, '#E2E5EC'), 4.5)

print("\nTỔNG SAU BỔ SUNG:", "TẤT CẢ PASS" if not fails else f"{len(fails)} FAIL -> {fails}")
