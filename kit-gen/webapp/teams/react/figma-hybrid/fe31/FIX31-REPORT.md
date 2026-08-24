# FIX31-REPORT

Ngày: 2026-08-07

## Đã thi công

- `/k/:id` không còn đi qua màn cũ/canvas/form sau khi tạo; route `src/routes/k.$projectId.tsx:1-28` render `StudioScreen`.
- Trang studio một mạch nằm ở `webapp/src/features/studio/StudioScreen.tsx:20-85`: bốn mục đọc dọc `Phong cách`, `Thương hiệu`, `Các món UI`, `Nhân vật`; mỗi mục có câu giải thích, khung minh hoạ/khung xương, nút cài đặt mở drawer.
- `Phong cách` có hai nhánh `Gõ mô tả` / `Ảnh tham khảo` tại `StudioScreen.tsx:74`; `Các món UI` dùng `Silhouette` và thư viện `ElementLibraryDrawer` của R0/R2 tại `StudioScreen.tsx:76,66`; nhân vật dùng thao tác contract hiện có tại `StudioScreen.tsx:77`.
- Thanh hành động đáy tái dùng `FloatingToolbar` tại `StudioScreen.tsx:64`: `Vẽ`, `Cắt`, `Copy sang Figma`, trạng thái tự lưu.
- Dialog Vẽ xác nhận phạm vi thật, giữ ảnh cũ và chặn nút khi doctor báo chưa bật tạo ảnh tại `StudioScreen.tsx:65,84-85`; không mount ma trận dialog sinh ảnh cũ trên route này.
- ⌘K đăng ký nhóm lệnh theo IA mới tại `StudioScreen.tsx:43-50`; không thêm lệnh điều hướng tới màn deprecated.
- Lỗi đọc project/editor dùng `ErrorState` + `devDetails`, không đẩy `error.message` vào thân UI; agent offline dùng `InlineBanner` và khoá hành động.

## Bằng chứng lệnh đã chạy

```text
$ npm run typecheck
> kitgen-webapp@2.0.0 typecheck
> tsc --noEmit
(exit 0)
```

```text
$ npm run verify
KẾT QUẢ: 270/270 PASS
KẾT QUẢ: 0 class chết (đã soi 210 class có rủi ro trong CSS 97 KB)
Test Files 76 passed (76)
Tests 1458 passed (1458)
✓ built in 1.41s
(exit 0)
```

- Contrast thật: dark/light đều `270/270 PASS`; các cặp FLORA chính gồm `#71D083` trên `#131416 = 9.70:1`, chữ `#FFFFFF` trên surface `18.43:1`, focus `9.70:1`.
- Đã chạy rà jargon trên đường studio: còn khoá kỹ thuật trong import/biến nội bộ (`contract`, `variant`, `sheet`, `job`, `run`) do component phải gọi type/hook API; copy user-facing chính dùng tiếng Việt. Chưa có test riêng chứng minh 0 chuỗi kỹ thuật trong bundle.

## Giới hạn còn lại

- Copy sang Figma hiện là mock clipboard danh sách món, chưa tạo clipboard Figma thật.
- Cài đặt ảnh tham khảo/ảnh brand trong drawer hiện là điểm mở vào luồng có sẵn, chưa thêm dropzone mới trong studio.
- Chưa chạy browser visual/axe trong lượt này; `npm run verify` là output thật của typecheck, contrast, deadclass, vitest và build.
