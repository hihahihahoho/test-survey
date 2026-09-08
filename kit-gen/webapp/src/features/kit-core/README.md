# `features/kit-core` — ruột chung của bộ kit (trước đây là `features/workflow-v4`)

## Thư mục này là gì

Mô hình dữ liệu và các phép biến đổi dùng chung cho **mọi** màn đụng tới một bộ
kit: contract, danh mục dáng/chất liệu, dựng prompt cho từng ô, đọc kết quả từ
run, hình học ô/khung an toàn, và cửa ra Figma.

Nó **không còn là một màn**, và cũng **không còn một component React nào** — chỉ
`lib/`. Không có `Screen` nào ở đây, và không nên có.

## Nó từ đâu ra

Trước Wave 4, thư mục này tên `features/workflow-v4` và chứa trình thuật sĩ 6
bước — cửa chính cũ của `/k/:projectId`. Wave 1-3 thay cửa chính đó bằng màn soạn
prompt (`features/prompt-canvas`), Wave 4·B xoá phần chỉ-wizard và ĐỔI TÊN thư
mục cho đúng vai, đợt IA prompt-first xoá bốn `steps/` cuối cùng.

**Đợt 2 (08/09/2026)** — gộp sản phẩm về một màn soạn duy nhất — làm hai việc ở
đây, và cả hai đều là DỜI NHÀ chứ không phải viết mới:

| Vào kit-core từ đâu | Vì sao |
| ------------------- | ------ |
| `lib/{form-model,style-phrases}.ts` ← `features/kit-form/lib/` | `kit-form` bị xoá; `composer-to-contract` và `kitset-to-contract` vẫn cần schema form + câu chữ trục phong cách |
| `lib/{geometry,shapes,shape-data.generated}.ts` ← `features/design/{preview,lib}/` | `design` bị xoá; toạ độ ô/khung an toàn là luật của engine, không phải của một màn |
| `lib/idb.ts` ← `features/design/safety/` | chỉ còn `settings/PrefsTab` cần danh sách store để xoá |
| `lib/element-lib/{source,types}.ts` + `element-lib-v2.json` ← `features/design/library/` | danh mục element dùng chung, `design` không còn |

Rời khỏi kit-core cùng đợt: `genre-presets.ts` → `prompt-lab/lib/` (chỉ
`presets-store` dùng), phần sống của `result-copy.ts` (`copyImageBlob`) →
`prompt-canvas/lib/prompt-copy.ts`. Bị xoá hẳn: `item-prompt.ts` và `refs-sync.ts`
— hai file chỉ còn test soi gương với engine, mà bản engine chúng soi đã đổi.

`shape-data.generated.ts` là bảng ĐÃ ĐÓNG BĂNG: script sinh ra nó
(`design/scripts/extract-shapes.mjs`) đọc một `skeleton.py` không còn tồn tại,
nên script bị xoá và file dữ liệu ở lại như một hằng số chép tay được test canh.

## Còn lại đúng những gì, và ai đang dùng

| Module | Ai dùng |
| ------ | ------- |
| `kitset-to-contract.ts` | `prompt-canvas/lib/{composer-to-contract,block-jobs,pill-image}` |
| `model.ts` | kiểu `WorkflowState`/`StyleAxes` mà `kitset-to-contract` + `composer-to-contract` khai theo |
| `form-model.ts` · `style-phrases.ts` | `kitset-to-contract`, `prompt-canvas/lib/composer-to-contract` |
| `draft-storage.ts` | `lib/hooks/use-projects` (xoá/hoàn tác dự án phải dọn bản nháp) |
| `figma-node.ts` | `prompt-canvas/components/result/*`, `kit/lib/{figma-kit-doc,figma-board}` |
| `generated-results.ts` | `prompt-canvas/lib/gen-queue`, `kit/lib/figma-kit-doc` |
| `prompt-studio.ts` | `prompt-canvas/lib/block-prompt`, `lib/hooks/use-contract` |
| `geometry.ts` | `prompt-canvas/lib/{composer-to-contract,pose-sheet}`, `prompt-lab/lib/cell-size` |
| `shapes.ts` (+ `shape-data.generated.ts`) | `home/{LibraryScreen,components/Silhouette}`, `geometry.ts` |
| `glaze.ts` · `poses.ts` · `materials.ts` | `prompt-canvas/lib/composer-doc`, `prompt-lab/lib/pill-registry` |
| `user-library.ts` | `kitset-to-contract`, `home/LibraryScreen` |
| `element-lib/` | `user-library`, `model`, `kitset-to-contract`, `home/LibraryScreen` |
| `idb.ts` | `settings/tabs/PrefsTab` (nút "Xoá dữ liệu trình duyệt") |

Không còn dòng nào trong bảng này chỉ có test làm người dùng — ba dòng như vậy ở
bản README trước (`item-prompt`, `refs-sync`, `result-copy`) đã được xử lý ở Đợt 2
đúng như bản đó dặn.

## Cổng đang canh thư mục này

- `scripts/check-no-gen.mjs` — `kit-core` là một trong hai **vùng cấm** tiêu tiền
  (`useStartRun`, `kind:"gen"`), cùng `prompt-canvas`. Cổng **đỏ** nếu một vùng
  cấm không tồn tại — để lần đổi tên sau không làm cổng xanh vì mù. Cửa quota duy
  nhất của web nằm ngoài hai vùng đó, ở `lib/hooks/use-generate-run.ts`.
- `lib/__tests__/geometry.test.ts` — đọc `kit-gen/geometry.py` và so từng con số
  với `lib/geometry.ts`. Hai file này **phải khớp**; đừng sửa một bên.
- `lib/__tests__/shape-source.test.ts` — canh bảng pose/silhouette của `shapes.ts`.
