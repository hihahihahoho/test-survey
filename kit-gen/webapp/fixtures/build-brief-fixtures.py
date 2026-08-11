#!/usr/bin/env python3
"""Sinh lại 2 fixture brief intake (FE-1 · task C2).

CHẠY TỪ THƯ MỤC `kit-gen/`:  python3 webapp/fixtures/build-brief-fixtures.py

Đọc `teams/brief-intake/prefill-vcb.json` (thật) + `../surveys/vcb-brief-intake-2026.json`
(lấy NGUYÊN VĂN 5 điểm mâu thuẫn ở item q0001) rồi ghi ra:
  · brief-intake-vcb-missing22.json — sao nguyên văn, 22 field nhãn `trong` để trống
  · brief-intake-vcb-full.json      — 22 field đó được điền câu trả lời GIẢ LẬP (đánh dấu `FIXTURE — `)

Script DEV, không nằm trong bundle. Không ghi đè file nguồn.
"""
import json, collections
SRC = "teams/brief-intake/prefill-vcb.json"
FORM = "../surveys/vcb-brief-intake-2026.json"
d = json.load(open(SRC, encoding="utf8"))
secs = [k for k in d if not k.startswith("_")]

form = json.load(open(FORM, encoding="utf8"))
notice = next(i for i in form["items"] if i.get("itemId") == "q0001")
lines = [l.strip() for l in notice["description"].split("\n") if l.strip()]
conflicts = []
for l in lines:
    n, txt = l.split(". ", 1)
    conflicts.append({"index": int(n), "text": txt,
                      "source": "surveys/vcb-brief-intake-2026.json → item q0001 (khối NOTE đầu form)"})

def field(sec, fid, v):
    o = {"question": v["question"], "value": v["value"], "source": v["source"], "confidence": v["confidence"]}
    if v.get("note"): o["note"] = v["note"]
    return o

def bundle(about, filled):
    b = {
        "_about": about,
        "_form": "surveys/vcb-brief-intake-2026.json",
        "_prefill_source": "kit-gen/teams/brief-intake/prefill-vcb.json (72 field)",
        "_confidence_legend": d["_confidence_legend"],
        "formId": "vcb-brief-intake-2026",
        "sections": {},
        "conflicts": conflicts,
    }
    for s in secs:
        b["sections"][s] = {f: field(s, f, v) for f, v in d[s].items()}
    if filled:
        for s in secs:
            for f, v in b["sections"][s].items():
                if v["confidence"] == "trong":
                    v["value"] = ANSWERS[f]
                    v["confidence"] = "cao"
                    v["source"] = "FIXTURE — câu trả lời GIẢ LẬP của khách trong form, không phải dữ liệu thật"
                    v["note"] = "Giá trị bịa cho test bộ đủ; bản thiếu field là brief-intake-vcb-missing22.json"
                elif v["value"] in (None, "", []):
                    # `milestone_list` là ca THẬT lệch nhãn: confidence `thap` nhưng value null.
                    # Điền giá trị nhưng GIỮ NGUYÊN `thap` — nó vẫn phải là note-only.
                    v["value"] = ANSWERS[f]
                    v["source"] = "FIXTURE (giữ nguyên độ tin cậy thấp) — " + str(v["source"])
                    v["note"] = "Có câu trả lời nhưng độ tin cậy vẫn THẤP ⇒ vẫn là note-only"
    return b

ANSWERS = {
 "pic_client": "Chị Lan — Phòng Marketing VCB (Zalo nhóm dự án)",
 "has_urd": "Chưa có",
 "urd_link": "Chưa có",
 "deliverable": "Cả hai",
 "badge_list": "1. Giao dịch đầu tiên\n2. 10 giao dịch\n3. Chuyển tiền quốc tế\n4. Tiết kiệm online\n5. Thanh toán hoá đơn\n6. Nạp điện thoại\n7. Mở thẻ mới\n8. Đầu tư\n9. QR Pay\n10. Khách hàng thân thiết",
 "badge_count": 10,
 "storyline_desc": "Mỗi màn insight có 1 graphic cổ động minh hoạ đúng con số của màn đó, không nối thành truyện.",
 "wish_count": 8,
 "voucher_count": 3,
 "cash_tiers": 4,
 "gift_weight": "Tiền mặt: Rất lớn · Voucher: Vừa · Câu chúc: Nhỏ",
 "special_date": "Có — Giao thừa và mùng 1",
 "char_proportion": "Chibi 3 đầu",
 "style_direction": "Dân gian chibi màu nước",
 "ref_like_what": "Nhóm 1: bảng màu và nét cọ. Nhóm 2: bố cục gian hàng. Nhóm 3: không lấy.",
 "brand_guideline": "Chưa có bản dùng được, sẽ gửi sau",
 "legal_note": "Không dùng quốc kỳ, không dùng khí tài quân sự",
 "motion_format": "Lottie (JSON)",
 "need_sound": "Bên khách tự lo",
 "deadline_final": "2026-01-30",
 "budget_cap": 45,
 "pic_design": "Anh Tùng — team design (email nội bộ)",
 "milestone_list": "23/9 bàn giao 5 màn hình · 15/10 bàn giao 9 màn còn lại · 30/11 bàn giao bộ Game",
}
full = bundle("Bộ TRẢ LỜI ĐẦY ĐỦ (fixture): 72 field đều có giá trị. 50 field lấy nguyên từ prefill-vcb.json thật; 22 field vốn để trống được điền bằng câu trả lời GIẢ LẬP (source ghi rõ 'FIXTURE'). Dùng để test nhánh 'brief đã đủ'.", True)
part = bundle("Bộ TRẢ LỜI THIẾU (fixture): sao chép NGUYÊN VĂN prefill-vcb.json thật — 27 cao · 18 tb · 5 thấp · 22 TRỐNG chủ đích. Dùng để test nhánh 'brief còn lỗ hổng'.", False)
json.dump(full, open("webapp/fixtures/brief-intake-vcb-full.json","w",encoding="utf8"), ensure_ascii=False, indent=2)
json.dump(part, open("webapp/fixtures/brief-intake-vcb-missing22.json","w",encoding="utf8"), ensure_ascii=False, indent=2)
for name,b in (("full",full),("part",part)):
    c=collections.Counter(v["confidence"] for s in b["sections"].values() for v in s.values())
    print(name, sum(len(s) for s in b["sections"].values()), dict(c), "conflicts", len(b["conflicts"]))
