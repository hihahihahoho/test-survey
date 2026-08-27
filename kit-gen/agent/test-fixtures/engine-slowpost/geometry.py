"""geometry.py của ENGINE GIẢ — chỉ để thoả hợp đồng "file bắt buộc", không tính toán gì.

`agent/lib/engine.mjs::ENGINE_FILES` khai `geometry.py` là BẮT BUỘC: engine thật có cả
`gen.sh` lẫn `slice.py` `import geometry` ngay dòng đầu, nên thiếu nó là lượt gen chết
bằng `ModuleNotFoundError` — một lỗi mà người dùng không đọc ra được điều gì. Bắt buộc
ở đó là đúng, và vì đúng nên fixture này cũng phải có file.

CỐ Ý KHÔNG CHÉP BẢN THẬT VÀO ĐÂY. `gen.sh`/`slice.py` của engine giả không hề import nó
(chúng chỉ ghi ra vài file rồi thoát — xem đầu `gen.sh` cạnh đây), nên một bản chép đầy
đủ sẽ là mã chết đi kèm lời hứa ngầm rằng nó được chạy. Thứ fixture cần chứng minh là
đường đi của AGENT: copy đủ file, spawn, đọc kết quả. Số học hình học thật được canh ở
`tests/test_geometry.py`, nơi nó chạy thật.
"""
