# Test của S1 (danh sách project + CRUD)

Hai bộ, chạy riêng vì `webapp/vitest.config.ts` (của R0) cố ý chỉ nhận
`src/lib/**` — xem `teams/react/NEEDS-s1-projects.md` mục **N9**.

## 1. Logic thuần — 55 ca, chạy được NGAY, không cần cài gì

```bash
cd webapp
npx vitest run --config src/features/projects/__tests__/vitest.config.ts
```

Phủ: lọc/tìm/sắp xếp, đếm chip khớp kết quả lọc, slug tiếng Việt, cache §2.5,
ma trận "agent chưa chạy" §4.9.

## 2. MOUNT THẬT trong DOM — 41 ca, CẦN cài thêm

Bộ này render màn thật bằng jsdom + @testing-library. Nó **chưa chạy được trên
máy sạch** vì `jsdom` và `@testing-library/react` chưa có trong
`webapp/package.json` (file đó thuộc R0, tôi không được sửa — N9).

```bash
cd webapp
./src/features/projects/__tests__/setup-dom-deps.sh    # cài + liên kết, chạy 1 lần
npx vitest run --config src/features/projects/__tests__/vitest.dom.config.ts
```

⚠ Phải là `@testing-library/react@^14` (bản cho React 18). Bản 16 đòi React 19 và
sẽ ném *"A React Element from an older version of React was rendered"*.

Phủ: màn mount không throw · 3 thẻ kể cả thẻ hỏng · badge run số thật · escape tên
(A12) · nút bị khoá KÈM LÝ DO khi agent tắt · không lộ chuỗi kỹ thuật ra thân UI ·
tạo/xoá/nhập đủ luồng · điều hướng bàn phím (A6) · nhãn ARIA (A5/A9).

## Cái này KHÔNG kiểm được ở đây

Không mở được trình duyệt thật trong môi trường hiện tại (sandbox chặn Chrome
đăng ký Mach port — chi tiết ở N10). Vì vậy **A1/A2 tương phản, A4 focus ring nhìn
thấy được, A10 reduced-motion, A11 zoom 200% / reflow 320px VẪN CHƯA ĐƯỢC KIỂM**
cho màn S1. Đừng ghi là đã đạt.
