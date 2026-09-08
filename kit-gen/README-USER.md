# kit-gen — hướng dẫn dùng

Sinh trọn bộ ảnh giao diện (nút, popup, nhân vật, hiệu ứng) cho mini-game marketing bằng AI,
rồi tự động cắt rời từng ảnh có nền trong suốt để lập trình viên/designer dùng ngay.

**Bạn không cần biết lập trình.** Cần đúng 3 thứ:

- Máy **macOS** hoặc **Linux** (Windows chưa hỗ trợ).
- Một tài khoản **ChatGPT có tạo ảnh** — Plus, Pro hoặc Business. **Gói Free không tạo được ảnh.**
- Khoảng 15 phút cho lần đầu.

> **Dữ liệu của bạn ở đâu?** Toàn bộ project, ảnh và thiết kế nằm **trên máy bạn**, trong thư mục bạn
> tự chọn. Trang web chỉ là giao diện điều khiển; nó không có tài khoản, không lưu gì trên mạng.

---

## 5 bước để có ảnh đầu tiên

### Bước 1 — Lấy mã nguồn về máy

Mở **Terminal** (macOS: `Cmd`+`Space`, gõ `Terminal`, Enter) rồi dán:

```bash
git clone <địa-chỉ-repo> kit-gen
cd kit-gen
```

Nếu bạn được đưa file `.zip` thay vì địa chỉ git: giải nén, rồi `cd` vào thư mục vừa giải nén.
Cách chắc chắn không sai: gõ `cd ` (có dấu cách) rồi **kéo thả thư mục** từ Finder vào Terminal, Enter.

### Bước 2 — Chạy script cài đặt

```bash
bash setup.sh
```

Script sẽ hỏi bạn muốn đặt thư mục làm việc ở đâu. Cứ **Enter** để lấy gợi ý sẵn (`~/KitGen`).

Nó tự kiểm tra và chuẩn bị: Node.js, Python, các thư viện cắt ảnh, codex CLI, thư mục làm việc,
rồi bật công cụ local. **Mỗi bước đều in rõ OK hay lỗi; lỗi nào cũng kèm dòng "phải làm".**

Muốn xem trước script sẽ làm gì mà **chưa** thay đổi gì trên máy:

```bash
bash setup.sh --dry-run
```

Chạy lại `bash setup.sh` bất cứ lúc nào cũng an toàn — cái gì đã có nó chỉ báo "đã có".

### Bước 3 — Chọn cấu hình Codex tạo ảnh

Đây là bước duy nhất script **không** làm thay bạn, vì đăng nhập cần mở trình duyệt.

Installer hỏi một lần:

```text
1) Codex hiện tại (~/.codex) [mặc định]
2) Profile riêng (~/.codex-img)
```

Chỉ cần nhấn **Enter** để dùng Codex hiện tại. Đây là lựa chọn phù hợp với hầu hết người dùng.

Nếu Codex mặc định chưa đăng nhập, chạy:

```bash
codex login
```

Chỉ khi bạn chủ động chọn profile riêng mới dùng:

```bash
CODEX_HOME="$HOME/.codex-img" codex login
```

Trình duyệt mở ra → đăng nhập bằng tài khoản ChatGPT **có tạo ảnh**. Xong thì kiểm tra:

```bash
CODEX_HOME="$HOME/.codex-img" codex debug prompt-input | grep -c image_gen
```

Ra một số **lớn hơn 0** là được. Rồi chạy lại `bash setup.sh` để nó ghi nhận.

> **Khi nào cần `.codex-img` riêng?** Nếu máy bạn đang dùng codex với một API key riêng của
> công ty, tính năng tạo ảnh bị vô hiệu. Cách sạch nhất là cho việc-tạo-ảnh một chỗ đăng nhập **riêng**,
> thì có thể chọn option 2 để cấu hình codex sẵn có **không bị sửa một dòng nào**.
> Script không bao giờ đọc hay in thông tin đăng nhập của bạn — nó chỉ kiểm tra file có tồn tại hay chưa.

### Bước 4 — Mở giao diện

Cuối bước 2, script mở giao diện chạy tại máy:

```
http://127.0.0.1:8765/app/
```

React đã được GitHub Actions build sẵn trong bản phát hành. Máy bạn không cần build frontend, và giao diện
cùng origin với backend local nên không có mixed-content hay quyền Cloudflare truy cập localhost.

### Bước 5 — Tạo project và sinh ảnh

1. Bấm **Tạo project** → chọn mẫu **Kit cơ bản** (sẵn 3 sheet / 25 ô) → đặt tên.
2. Vào **Bản thiết kế** → tab **Phong cách** → thêm ít nhất một phong cách (màu sắc, chất liệu, cảm hứng).
3. Bấm **Sinh ảnh**. Một hộp thoại hiện ra cho bạn xem trước **số lượt sẽ chạy, thời gian ước lượng và
   cảnh báo quota** — đọc rồi mới xác nhận.
4. Xem tiến độ chạy trực tiếp. Xong thì ảnh được **tự động cắt** thành từng file rời.
5. Vào **Thư viện kit** để xem và tải về.

> 💡 **Lần đầu hãy chạy ít thôi** — chọn 1 phong cách × 1 sheet. Mỗi lượt tạo ảnh ăn quota ChatGPT
> **gấp 3–5 lần** một câu chat thường. Chạy cả bộ 28 lượt ngay lần đầu rất dễ hết quota giữa đường.

---

## Xử lý sự cố

### "Chưa thấy công cụ local" / trang không tải được dữ liệu

Công cụ local (agent) phải **đang chạy** thì giao diện mới có dữ liệu. Kiểm tra:

```bash
curl -sS -H 'X-KitGen-Client: 1' -H 'Origin: http://127.0.0.1:8765' \
     http://127.0.0.1:8765/health
```

- Ra JSON có `"ok":true` → agent đang chạy, vấn đề ở trình duyệt (mục kế tiếp).
- Không kết nối được → agent chưa chạy. Bật lại:

```bash
cd kit-gen
bash setup.sh
```

Đóng Terminal là agent tắt theo. Mỗi lần khởi động lại máy thì chạy lại lệnh trên.

Nếu thấy báo cổng bị chiếm, đổi cổng:

```bash
bash setup.sh --port 8770
```

### Giao diện local không mở

KitGen chỉ dùng bản chạy tại máy; không có trang Internet gọi ngược vào localhost.
Nếu URL dưới đây không mở thì agent chưa chạy hoặc cổng đã đổi:

```
http://127.0.0.1:8765/app/
```

Chạy `kitgen status`, rồi `kitgen restart`. Nếu cổng không phải 8765, thay bằng cổng installer đã in ra.

### "Chưa có công cụ tạo ảnh" / thiếu image_gen

Nghĩa là codex trên máy chưa bật được tính năng tạo ảnh. Theo thứ tự:

1. **Gói ChatGPT của bạn là Free?** → Không có đường nào khác, phải nâng lên Plus/Pro/Business.
2. **Chưa đăng nhập?** → Làm lại **bước 3**.
3. **Đăng nhập rồi mà vẫn không được?** → Chạy 3 lệnh này rồi gửi kết quả cho người hỗ trợ:

```bash
CODEX_HOME="$HOME/.codex-img" codex login status
CODEX_HOME="$HOME/.codex-img" codex features list | grep image_generation
CODEX_HOME="$HOME/.codex-img" codex debug prompt-input | grep -c image_gen
```

4. Nghi ngờ đăng nhập cũ còn đọng lại:

```bash
CODEX_HOME="$HOME/.codex-img" codex logout
CODEX_HOME="$HOME/.codex-img" codex login
```

Lưu ý: **vẫn cắt được** ảnh đã có sẵn kể cả khi chưa tạo ảnh được. Chỉ chức năng *sinh ảnh mới* bị chặn.

### Hết quota tạo ảnh

Dấu hiệu: vài lượt xong bình thường rồi các lượt sau đồng loạt lỗi; giao diện hiện
"Có vẻ đã chạm giới hạn tạo ảnh của tài khoản ChatGPT".

Điều quan trọng: **ảnh đã sinh xong KHÔNG bị mất.** Chúng đã nằm trong project và được giữ lại.

Nên làm:

- **Đợi** quota hồi (theo chu kỳ của gói ChatGPT), rồi bấm **Thử lại lượt lỗi** — chỉ chạy lại phần thiếu,
  không làm lại từ đầu, không tốn quota cho ảnh đã có.
- **Giảm số lượt chạy song song** trong hộp thoại sinh ảnh (mặc định 4 → thử 2).
- Lần sau chia nhỏ: mỗi lần 1–2 phong cách thay vì cả bộ.

Vì mỗi lượt tạo ảnh ăn quota gấp 3–5 lần câu chat thường, một bộ 28 lượt tương đương khoảng
**84–140 câu chat**. Hãy tính trước.

### Thiếu thư viện cắt ảnh (Pillow)

Nếu script báo không cài được, thường là do mạng hoặc proxy công ty. Chạy lại:

```bash
"$HOME/KitGen/.venv/bin/python" -m pip install pillow
```

(thay `$HOME/KitGen` bằng thư mục làm việc của bạn). Log đầy đủ ở `<thư-mục-làm-việc>/.kitgen/pip-install.log`.

`pillow` là thư viện Python **duy nhất** công cụ cần.

### Muốn đổi thư mục làm việc

```bash
bash setup.sh --workspace ~/DuAnKhac
```

Thư mục cũ **không bị xoá**. Project là thư mục thật trên đĩa — copy một thư mục project sang
`projects/` của workspace khác là nó tự hiện trong giao diện.

---

## Những điều nên biết

| | |
|---|---|
| **Xoá project** | Vào thùng rác, giữ **30 ngày**, hoàn tác được. Không mất ngay. |
| **Đóng tab giữa lúc chạy** | Không sao. Mở lại thấy đúng tiến độ đang chạy. |
| **Ảnh đã tạo** | Được giữ 3 đời gần nhất — làm lại mà không thích thì khôi phục bản trước. |
| **Chia sẻ cho người khác** | Xuất project ra `.zip`, người kia nhập vào. |
| **Máy bạn có an toàn?** | Công cụ local chỉ nghe trên `127.0.0.1` (không ra mạng), không có tài khoản, không lưu mật khẩu. Nó chỉ trả lời đúng những trang web trong danh sách cho phép. |

## Các lệnh hay dùng

```bash
bash setup.sh                    # cài / kiểm tra / bật công cụ local
bash setup.sh --dry-run          # xem trước, không thay đổi gì
bash setup.sh --port 8770        # đổi cổng khi bị chiếm
bash setup.sh --install-app      # cài bản chạy tại máy vào thư mục làm việc
bash setup.sh --help             # xem hết tuỳ chọn
```

Cần thêm thông tin kỹ thuật: `agent/README.md` (công cụ local) · `DEPLOY.md` (đưa giao diện lên mạng).
