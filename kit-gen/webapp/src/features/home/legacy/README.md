# `features/home/legacy/` — bản lưu màn danh sách project TRƯỚC FE-3

`ProjectsScreen.before-fe3.tsx.txt` = nội dung của
`webapp/src/features/projects/ProjectsScreen.tsx` tại thời điểm H1 bắt đầu (254 dòng,
đúng bằng số dòng bản gốc).

## Vì sao có thư mục này

FE3-PLAN §0-N8 cấm xoá file trong đợt này. Nhưng `ProjectsScreen.tsx` là **entry
lazy-mount**: đường dẫn + tên export do `components/layout/screen-contract.ts` chốt, mà
file đó thuộc **glob E**, không phải glob H. H1 vì thế buộc phải **viết đè** nội dung file
entry (nay nó chỉ còn một dòng re-export sang `features/home`).

Bình thường bản cũ nằm trong lịch sử Git. Nhưng `webapp/` **vẫn untracked**
(`teams/react/NEEDS-fe3-s0.md` N3, chưa đóng) ⇒ **không có `git show` để lấy lại**.

## Giới hạn trung thực của bản lưu này

Tôi **không chứng minh được nó khớp từng byte** với bản gốc, vì bản gốc không có trong
Git để đối chiếu — đó chính là nội dung của N3. Thứ tôi kiểm được: cùng số dòng, cùng
dòng đầu, cùng dòng cuối, và không còn chuỗi `ProjectsScreenLegacy` nào (tên tạm dùng
lúc chép). Ai cần chắc chắn hơn thì phải đưa `webapp/` vào Git trước.

## Vì sao đuôi `.txt` chứ không phải `.tsx`

Bản cũ dùng import tương đối (`./components/ProjectsHeader`, `./lib/gate`…). Để nó ở thư
mục khác dưới đuôi `.tsx` thì `tsc` cố biên dịch và báo **26 lỗi** «không tìm thấy module»
— tôi đã thử, đó là output thật (xem `H1-REPORT.md` §4.2). Sửa các đường dẫn cho hết lỗi
thì nó **không còn là bản lưu** nữa.

Đuôi `.txt` giữ đúng ba tính chất cần có: không vào `tsc` · không vào bundle · đọc được.

## Quay về bản cũ thế nào

Chép thân file `.txt` đè lại `webapp/src/features/projects/ProjectsScreen.tsx`.
Mọi file nó cần (`components/Projects*.tsx`, `lib/*.ts`, `ProjectDialogs.tsx`) **vẫn nằm
nguyên trên đĩa, không file nào bị xoá hay bị sửa** — kiểm ở `H1-REPORT.md` §6.

⚠️ Đừng "dọn dẹp" thư mục này khi chưa có quyết định xoá thật — đó là wave sau (§0-N8).
