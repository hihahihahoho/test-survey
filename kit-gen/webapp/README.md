# webapp/ — kit-gen v2 (React + shadcn/ui + TanStack)

Scaffold + design system. **Bản vanilla `web/` KHÔNG bị đụng tới** — vẫn là đường lùi.

## Chạy

```bash
cd webapp
npm install
npm run dev        # http://localhost:5173 (proxy /api,/health sang agent 8765)
npm run build      # tsc --noEmit && vite build → dist/
npm run typecheck  # tsc --noEmit
npm run contrast   # đo tương phản WCAG từ chính tokens.css
```

## Quy ước cho team màn — đọc trước khi viết dòng đầu tiên

### 1. Import

```ts
import { Button } from "@/components/ui/button";          // primitive shadcn
import { EmptyState, JobStatusBadge } from "@/components/common";  // nghiệp vụ
import { cn } from "@/lib/utils";
import { JOB_STATUS, mergeJobStatus } from "@/lib/status";
```

`@/` = `src/`. Đã cấu hình ở cả `vite.config.ts` và `tsconfig.json`.

### 2. Màu — CHỈ dùng tên semantic, CẤM hex thô

| Dùng | Đừng dùng |
|---|---|
| `bg-canvas / bg-surface / bg-raised / bg-overlay` | `bg-[#12161F]` |
| `text-fg-strong / text-fg / text-fg-muted` | `text-gray-400` |
| `text-fg-muted-raised` khi nền là raised/overlay | `text-fg-muted` (trượt 4.5:1 ở đó) |
| `text-accent-text` cho CHỮ/link | `text-accent` (nền đặc, làm chữ sẽ trượt) |
| `border-line-subtle / border-line / border-line-strong` | `border-gray-700` |
| `text-on-tint-ok` + `.kg-tint-ok` cho badge | `text-ok` trên nền tint |

Thêm/sửa token: **chỉ** ở `src/styles/tokens.css`, rồi chạy `npm run contrast`.
Script đọc thẳng file đó nên số đo không bao giờ lệch với CSS thật.

### 3. Khoảng cách · chữ · bán kính

- Spacing: thang Tailwind mặc định đã trùng thang 4px của §5.1 (`p-1`=4px … `p-16`=64px).
  Kích thước khung có tên riêng: `h-header`, `w-rail`, `w-tree`, `w-props`, `h-row`,
  `h-ctl-sm|md|lg`, `w-modal-sm|md|lg|xl`, `w-drawer`, `w-drawer-wide`, `w-toast`.
- Chữ: đúng 7 bậc — `text-display|title|subtitle|body|label|caption|mono`.
  **Sàn 12px**, không có bậc nào nhỏ hơn (đóng audit I3).
- Bán kính: `rounded-1` (4) · `rounded-2` (8) · `rounded-3` (12) · `rounded-full`.
- z-index: `z-sticky|rail|floatbar|dropdown|scrim|modal|drawer|toast|tooltip`.

### 4. Trạng thái job — KHÔNG tự chế nhãn

Mọi nhãn/icon/màu của 7 trạng thái job, 5 trạng thái run, 6 trạng thái agent nằm ở
`src/lib/status.ts`. Dùng `<JobStatusBadge status="stale" />`, đừng tự viết chữ
"Cần sinh lại" ở màn — đổi copy một chỗ là đổi cả app.

`mergeJobStatus([...])` gộp nhiều job theo đúng thứ tự ưu tiên §5.7.

### 5. Xác nhận thao tác phá huỷ — đúng mức ma sát

```tsx
// Xoá vào thùng rác (phục hồi được) → KHÔNG bắt gõ tên
<ConfirmDestructive title="Xoá project này?" description="…" onConfirm={…} />

// Xoá vĩnh viễn (không có đường về) → bắt gõ đúng tên
<ConfirmDestructive confirmText="tet-2026" actionLabel="Xoá vĩnh viễn" … />
```

### 6. State

- **Server state** → TanStack Query (`src/lib/query.ts`). Cache, invalidate, retry.
- **Client state** → Zustand (`src/stores/ui.ts`), persist key `kitgen.ui.v1`.
- **TUYỆT ĐỐI KHÔNG** để API key / token / nội dung `auth.json` vào store, localStorage,
  hay `console.log`. Store ghi thẳng ra localStorage, ai mở DevTools cũng đọc được.

### 7. Thêm route

1. Tạo `src/routes/<ten>.tsx`, export `Route = createRoute({ getParentRoute: () => rootRoute, path: "/…" })`.
2. Thêm 1 dòng import + 1 phần tử vào `src/routes`-tree ở `src/routeTree.ts`.

Khai báo tay (không dùng codegen) để xung đột merge giữa các team nhìn thấy rõ.

## Hai đường vào — đừng phá

`vite.config.ts` đặt `base: "./"`, và `index.html` có script nội tuyến đặt `<base href>`.
**Cần cả hai.** `base:"./"` một mình KHÔNG đủ: ở deep link `/app/p/tet26/design`,
`./assets/x.js` phân giải thành `/app/p/tet26/assets/x.js` → SPA fallback trả HTML →
`<script>` nhận HTML → **trang trắng**. Đây đúng là lỗi B2 trong `INTEGRATION.md §0`.
Tôi đã dựng HTTP server thật, tái hiện lỗi, rồi mới vá — xem `src/lib/basepath.ts`.

Yêu cầu phía agent: SPA fallback của `/app/**` phải trả `/app/index.html`.

## Trang showcase

`/__preview` — mọi component ở mọi trạng thái, kèm checklist a11y QA phải tự bấm.
