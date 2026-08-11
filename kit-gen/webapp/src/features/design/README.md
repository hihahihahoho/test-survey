# S3 · Trình soạn bản thiết kế — `features/design/**`

Chủ sở hữu: **R2-P1** (khung + CRUD), TRỪ `safety/**` (R2-P2) và `library/**`,
`preview/**` (R2-P3). Hợp đồng liên nhóm: **`contracts.ts`** — đọc file đó trước.

## Bản đồ

```
DesignScreen.tsx          điều phối: tab · thanh lưu · 4 trạng thái · phím tắt · ⌘K
contracts.ts              HỢP ĐỒNG với R2-P2 / R2-P3 (DesignApi, props của 2 slot)
slots.tsx                 nạp safety/ + library/ bằng import.meta.glob (thiếu ⇒ bản tạm)

lib/
  shape-data.generated.ts SINH TỰ ĐỘNG — đừng sửa tay
  shapes.ts               whitelist shape · 19 dáng · silhouette SVG · px thật của ô
  ops.ts                  CRUD sheet/element (hàm THUẦN, trả `Op` có nhãn undo)
  ops-derive.ts           đếm lượt sinh ảnh (khớp `contractJobs()` của agent)
  ops-style.ts            CRUD phong cách · brand · nhân vật · tham số cắt
  validate.ts             8 luật V-01…V-08 + luật engine (matte, cờ bool, shape)
  validate-target.ts      kiểu `Target`/`Finding` + tra cứu lỗi theo field
  useDesignEditor.ts      nạp 1 lần · validate · lưu · beforeunload
  useDesignActions.tsx    nối hành động ↔ ops, kèm modal xác nhận
  useDesignShortcuts.ts   ⌘S ⌘Z ⇧⌘Z ⌘L [ ]

components/               3 vùng + 2 tab + dialog đổi lưới
scripts/extract-shapes.mjs  rút hằng số từ engine → shape-data.generated.ts
```

## Vì sao có `scripts/extract-shapes.mjs`

Brief yêu cầu *"đọc silhouettes.js/skeleton.py để lấy danh sách, không gõ tay"*.
Script rút whitelist shape, 19 dáng + 247 toạ độ khớp, `MATTE_VALUES`, và hằng số
`BLEED/DEFAULT_THRESHOLD/GROW_OFFSET` từ **mã nguồn thật**:

```bash
cd webapp && node src/features/design/scripts/extract-shapes.mjs
```

`__tests__/shape-source.test.ts` nạp `silhouettes.js` vào **scope riêng** (biến
`window` cục bộ, KHÔNG dùng `globalThis`) rồi so **từng ký tự** markup của 11 shape ×
3 kích thước × 2 chế độ + 19 dáng. Đây là điểm mà bản vanilla trượt: nó so
`globalThis.KITSIL` với chính nó nên luôn PASS trong khi mirror lệch 10/11 shape
(`teams/design/INTEGRATION.md §1.6`). Đã tự lật lại bản vá để chứng minh test có tác
dụng: đổi `stroke-width` 3→1.5 ⇒ 7 ca đỏ ngay.

## Chạy test

```bash
cd webapp
npx vitest run --config src/features/design/__tests__/vitest.config.ts      # 59 ca (node)
npx vitest run --config src/features/design/__tests__/vitest.dom.config.ts  # 29 ca (jsdom)
```

Config riêng vì `webapp/vitest.config.ts` thuộc R0 và chỉ nhận `src/lib/**`
(xem `teams/react/NEEDS-r2p1-design.md` N5).

## Ba chỗ dễ hiểu nhầm

1. **Ô trống không bị xoá khỏi mảng.** `components.length` LUÔN = `cols*rows` (V-04 =
   assert của `gen.sh`/`slice.py`). Xoá element ⇒ ô thành `{shape:"empty"}`, không dồn ô.
2. **Client không được nghiêm hơn agent.** Shape lạ chỉ CẢNH BÁO vì
   `agent/lib/validate.mjs` cũng chỉ cảnh báo. Chặn thứ agent cho qua = user kẹt.
3. **Tab Nâng cao nói thật.** `bleed`/`quality` KHÔNG có tác dụng (M4) — UI ghi rõ, và
   `tabs.dom.test.tsx` khoá lời cảnh báo đó lại để không ai xoá đi cho "đỡ xấu".
