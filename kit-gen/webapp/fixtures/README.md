# `webapp/fixtures/` — dữ liệu mẫu cho DEV/TEST (nhánh C, FE-1 · task C1)

**Fixture KHÔNG phải mock API.** FE-PLAN §4 nói rõ: *"Fixture (`webapp/fixtures/`) là dữ liệu test,
**không** phải mock API: không được import từ code chạy thật."*
⇒ Chỉ được `import`/đọc từ `src/**/__tests__/**` hoặc từ nhánh dev tường minh.
Test `docs-fixtures.test.ts` khoá điều kiện này lại bằng `grep` trên `src/` (trừ `__tests__`).

| File | Là gì | Dùng cho |
|---|---|---|
| `project-basic.json` | Contract của template `basic` **thật** — 3 sheet (`main` 4×4 · `tall` 4×2 · `bg-home` 1×1) = **25 ô** = 24 element + 1 nền, sinh từ `agent/templates/basic.json` + `element-lib.json` | Kiểm bất biến `sheetIds ⊆ contract.sheets[].id`; dựng màn S2–S5 khi không có agent |
| `docs-3files.json` | 3 file con: 1 `workflow` (`Bộ kit chính`, lọc `main`+`tall`) + 2 `canvas` (`Ý tưởng Tết` 4 node · `Nhân vật Lân` 2 node) | FE-2 thanh tab file con; test ghi→đọc→sửa→xoá→khôi phục |
| `canvas-200nodes.json` | 1 file canvas 200 node (40 frame + 160 ghi chú) | Đo hiệu năng canvas ở FE-3 |
| `brief-intake-vcb-full.json` | **(C2)** Bộ trả lời form intake ĐỦ — 72 field, 0 field trống. 50 field lấy nguyên từ `teams/brief-intake/prefill-vcb.json` thật; 22 field vốn trống được điền bằng câu trả lời **giả lập** (`source` bắt đầu bằng `FIXTURE — `) | Test nhánh "đầu bài đã đủ" của `lib/brief-read.ts` |
| `brief-intake-vcb-missing22.json` | **(C2)** Bộ trả lời THIẾU — sao nguyên văn `prefill-vcb.json`: cao 27 · tb 18 · thấp 5 · **trống 22** (23 field có value rỗng, xem ghi chú dưới) + 5 điểm mâu thuẫn nguyên văn | Test nhánh "đầu bài còn lỗ hổng", test luật note-only |

Năm file này **không chứa** secret, token, hay đường dẫn tuyệt đối — test `docs-fixtures.test.ts`
chạy `assertNoSecret` của R0 lên 3 fixture file-con, `brief-read.test.ts` chạy `assertNoSecret` lên 2 fixture intake.

## Ghi chú C2 — một chỗ lệch nhãn CÓ THẬT trong `prefill-vcb.json`

INTAKE-SPEC §1 ghi *"trống 22"*, và đúng là có **22** field mang nhãn `confidence: "trong"`.
Nhưng đếm theo **giá trị**, có **23** field rỗng: `sec_time.milestone_list` mang nhãn `thap`
mà `value: null`. Parser giữ đúng cả hai con số (`tally.trong = 22`, `missing.length = 23`)
thay vì làm tròn cho khớp tài liệu. Trong fixture bản ĐỦ, `milestone_list` được điền giá trị
nhưng **giữ nguyên** `confidence: "thap"` ⇒ nó vẫn là note-only, không bao giờ prefill.
