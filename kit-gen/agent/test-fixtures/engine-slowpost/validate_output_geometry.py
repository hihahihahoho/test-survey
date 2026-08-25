"""KIỂM HÌNH HỌC GIẢ — TREO VĨNH VIỄN, CÓ CHỦ Ý.

Mô phỏng đúng ca đã làm hỏng lượt gen thật: `validate_output_geometry.py` không trả về
(Pillow kẹt trên PNG hỏng, python bị antivirus giữ…). Trước bản vá, agent gọi công cụ này
NGAY TRƯỚC phép gán `j.artifact` và KHÔNG có trần thời gian ⇒ ảnh nằm sẵn trên đĩa mà web
không bao giờ thấy, và cả lượt chạy đứng ở "đang chạy" mãi mãi.

Ca test dùng file này để khoá hai lời hứa:
  ① trần `KITGEN_GEOMETRY_TIMEOUT_MS` cắt được nó (không còn treo vô hạn);
  ② một lượt kiểm hình học chết KHÔNG kéo theo lượt chạy — ảnh vẫn tới web đúng giờ,
     run vẫn đóng sổ "done", tấm chỉ mất phần `validation`.

Không in gì ra stdout: agent phải hiểu "không có JSON" là "không kiểm được", chứ không
được coi đó là lỗi của tấm ảnh.
"""
import time

while True:
    time.sleep(3600)
