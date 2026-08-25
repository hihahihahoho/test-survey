# `features/kit-core` — ruột chung của bộ kit (trước đây là `features/workflow-v4`)

## Thư mục này là gì

Mô hình dữ liệu, các phép biến đổi và các panel dùng chung cho **mọi** màn đụng
tới một bộ kit: contract, danh mục dáng/chất liệu/thể loại, dựng prompt cho từng
ô, đọc kết quả từ run, và cửa ra Figma.

Nó **không còn là một màn**. Không có `Screen` nào ở đây, và không nên có.

## Nó từ đâu ra (Wave 4·B, 2026-08-25)

Trước Wave 4, thư mục này tên `features/workflow-v4` và chứa **trình thuật sĩ 6
bước** — cửa chính cũ của `/k/:projectId`. Wave 1-3 thay cửa chính đó bằng màn
soạn prompt (`features/prompt-canvas`), và Wave 4·B dọn nốt phần còn lại.

Khảo sát trước khi cắt cho ra một kết quả **khác với dự đoán ban đầu**: phần lớn
`workflow-v4` không phải là wizard, mà là ruột chung mà bốn feature khác đang
dùng hằng ngày. Cụ thể `features/project` (màn `/p/:projectId`, vẫn LIVE) render
`steps/KitsetStep` + `steps/MascotStep`, `features/project/components/ProjectSettingsDialog`
render `steps/BriefStep` + `steps/StyleStep`, còn `lib/model` · `lib/contract-sync` ·
`lib/contract-import` là xương sống của `useProjectBuffer`.

Nên việc đã làm là **đổi tên thư mục cho đúng vai trò** rồi xoá đúng phần chết,
chứ không phải xoá cả thư mục:

| Đã XOÁ (chỉ wizard dùng)          | Vì sao chết                                  |
| --------------------------------- | -------------------------------------------- |
| `WorkflowScreen.tsx`              | cửa chính cũ, không route nào trỏ tới nữa    |
| `steps/Stepper.tsx`               | hàng 6 bước; chỉ `WorkflowScreen` render      |
| `steps/ReviewStep.tsx`            | bước "Kiểm tra" của wizard                    |
| `components/PromptStudio.tsx`     | chỉ `ReviewStep` dùng                         |
| `components/SyncBadge.tsx`        | chỉ `WorkflowScreen` dùng                     |
| `components/RunPanel.tsx`         | mồ côi từ trước, không ai import              |

Hằng `UI_STEP_LABEL` là thứ DUY NHẤT của `steps/Stepper.tsx` còn sống; nó dọn
sang `lib/labels.ts` — một module lá, để `ProjectScreen` import mà không kéo theo
`lib/model`.

## Vì sao `steps/` vẫn tên là `steps/`

Bốn file trong đó không còn là "bước" nữa — chúng là các panel mà màn dự án và
hộp thoại cài đặt render. Tên thư mục giữ nguyên **có chủ ý**: đổi tên chúng
trong cùng một lượt với việc đổi tên feature sẽ trộn hai thay đổi vào một diff và
làm việc review "cái gì thật sự bị xoá" trở nên không đọc được. Đổi tên `steps/`
là một lượt dọn riêng, rẻ, và làm được bất cứ lúc nào.

## Cổng đang canh thư mục này

- `scripts/check-no-gen.mjs` — `kit-core` là một trong bốn **vùng cấm** tiêu tiền
  (`useStartRun`, `kind:"gen"`). Wave 4·B thêm `prompt-canvas` vào cùng danh sách
  vì đó là cửa chính mới, và bắt cổng **đỏ** nếu một vùng cấm không tồn tại — để
  lần đổi tên sau không làm cổng xanh vì mù.
- `__tests__/cell-background.test.tsx` — đọc `kit-gen/gen.sh` và so từng byte với
  `lib/item-prompt.ts`. Hai file này **phải khớp**; đừng sửa một bên.
