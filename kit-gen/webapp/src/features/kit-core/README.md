# `features/kit-core` — ruột chung của bộ kit (trước đây là `features/workflow-v4`)

## Thư mục này là gì

Mô hình dữ liệu và các phép biến đổi dùng chung cho **mọi** màn đụng tới một bộ
kit: contract, danh mục dáng/chất liệu/thể loại, dựng prompt cho từng ô, đọc kết
quả từ run, và cửa ra Figma.

Nó **không còn là một màn**, và từ đợt IA prompt-first thì cũng **không còn một
component React nào** — chỉ `lib/`. Không có `Screen` nào ở đây, và không nên có.

## Nó từ đâu ra (Wave 4·B → IA prompt-first, 2026-08-25)

Trước Wave 4, thư mục này tên `features/workflow-v4` và chứa **trình thuật sĩ 6
bước** — cửa chính cũ của `/k/:projectId`. Wave 1-3 thay cửa chính đó bằng màn
soạn prompt (`features/prompt-canvas`); Wave 4·B xoá phần chỉ-wizard
(`WorkflowScreen`, `steps/Stepper`, `steps/ReviewStep`,
`components/{PromptStudio,SyncBadge,RunPanel}`) và ĐỔI TÊN thư mục cho đúng vai.

Wave 4·B để lại bốn panel (`steps/{Kitset,Mascot,Brief,Style}Step`) cùng
`lib/{model,contract-sync,contract-import}` **vì một lý do duy nhất**: màn
`/p/:projectId` khi đó vẫn render chúng. Đợt IA prompt-first đóng nốt lý do ấy —
`/p` được viết lại thành màn **«Kết quả & xuất kit»** chỉ-xem, và lối soạn duy
nhất là `/k/:projectId`. Không còn ai render chúng ⇒ chúng bị xoá:

| Đã XOÁ ở đợt IA prompt-first        | Người dùng cuối của nó                     |
| ----------------------------------- | ------------------------------------------ |
| `steps/{Kitset,Mascot}Step.tsx`     | hai trang sửa được của `/p` (đã bỏ)        |
| `steps/{Brief,Style}Step.tsx`       | hai tab của `ProjectSettingsDialog` (đã bỏ) |
| `components/{CutAssetGrid,RawSheetsPanel,GeneratedResults}.tsx` | trang "Ảnh đã tạo" của `/p` (đã bỏ) |
| `components/{ItemDetail,GroupChips,CheckRow,SegChoice,MascotDialog,SharedReferencePicker,RefChips}.tsx` | chỉ bốn `steps/` trên dùng |
| `lib/contract-sync.ts`              | `useProjectBuffer` của `/p` (đã bỏ)        |
| `lib/contract-import.ts`            | dải "chuyển bản thiết kế cũ" của `/p` (đã bỏ) |
| `lib/labels.ts`                     | nhãn "UI Elements" của sidebar `/p` (đã bỏ) |

`components/KitExits.tsx` KHÔNG bị xoá mà **đổi nhà** sang
`features/kit/components/` — bốn thứ nó gọi đều là của `features/kit`, và người
dùng nó nay là màn kết quả. Xem khối chú thích đầu file đó.

## Còn lại đúng những gì, và ai đang dùng

Thư mục này nay **chỉ còn `lib/`** — không một component React nào.

| Module | Ai dùng |
| ------ | ------- |
| `kitset-to-contract.ts` | `prompt-canvas/lib/composer-to-contract`, `block-jobs`, `pill-image` |
| `model.ts` | kiểu `WorkflowState`/`StyleAxes` mà `kitset-to-contract` và `composer-to-contract` khai theo |
| `draft-storage.ts` | `lib/hooks/use-projects` (xoá/hoàn tác dự án phải dọn bản nháp) |
| `figma-node.ts` | `prompt-canvas/.../SheetCellGrid`, `kit/lib/figma-kit-doc`, `demo/lib/*` |
| `generated-results.ts` | `prompt-canvas/lib/gen-queue`, `kit/lib/figma-kit-doc` |
| `prompt-studio.ts` | `prompt-canvas/lib/block-prompt` |
| `genre-presets.ts` · `poses.ts` · `materials.ts` | `prompt-lab/lib/{presets-store,pill-registry}` |
| `user-library.ts` | `kitset-to-contract`, `home/LibraryScreen` |
| `item-prompt.ts` | `__tests__/cell-background` (gương soi với `gen.sh`) |
| `refs-sync.ts` | `lib/__tests__/{sync,agent-contract.integration}` |
| `result-copy.ts` | `lib/__tests__/result-copy` |

Ba dòng cuối nói thẳng: chúng **chưa có người dùng trong app**, chỉ còn test. Giữ
lại vì cả ba là hàm THUẦN mô tả luật của engine (`refs/<name>`, toạ độ ô, câu
prompt của `gen.sh`) — luật đó không chết theo màn, và dựng lại nó tốn hơn nhiều
so với việc để một file 160 dòng nằm yên. Nếu đợt sau vẫn không ai gọi tới, xoá
là quyết định đúng.

## Cổng đang canh thư mục này

- `scripts/check-no-gen.mjs` — `kit-core` là một trong bốn **vùng cấm** tiêu tiền
  (`useStartRun`, `kind:"gen"`). Wave 4·B thêm `prompt-canvas` vào cùng danh sách
  vì đó là cửa chính mới, và bắt cổng **đỏ** nếu một vùng cấm không tồn tại — để
  lần đổi tên sau không làm cổng xanh vì mù.
- `__tests__/cell-background.test.tsx` — đọc `kit-gen/gen.sh` và so từng byte với
  `lib/item-prompt.ts`. Hai file này **phải khớp**; đừng sửa một bên. (Nhóm ca ①
  của nó — đi qua UI của `steps/KitsetStep` — đã rút cùng lúc component bị xoá;
  lý do ghi ngay đầu file.)
