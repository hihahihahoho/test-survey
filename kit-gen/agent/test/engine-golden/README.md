# Golden của engine — MỐC ĐÃ ĐÓNG BĂNG, KHÔNG CÒN MÁY SINH LẠI

Thư mục này từng chứa bảy script **dev-only** sinh ra fixture golden trong
`agent/test-fixtures/engine-golden/`, `engine-golden-png/`, `engine-golden-slice/`,
`engine-resample/`. Cả bảy đều chạy **engine đời cũ** (`gen.sh` · `slice.py` ·
`geometry.py` · `validate_output_geometry.py`) hoặc **Pillow** để tạo ra bản gốc mà
bản JS phải khớp:

| script (đã xoá) | sinh ra gì | chạy bằng gì |
| --- | --- | --- |
| `make-golden.sh` | prompt golden (`engine-golden/*/expected/`) | `gen.sh` với `KITGEN_PROMPTS_ONLY=1` |
| `make-cases.py` | đầu vào ca cắt (styles.json · raw/*.png · steps.json) | Pillow |
| `make-golden-slice.sh` + `run-golden.py` | đầu ra cắt golden (`engine-golden-slice/*/expected/`) | `slice.py` + `validate_output_geometry.py` |
| `make-real-cases.mjs` | ca cắt dựng từ ảnh raw THẬT của một project dev | Node + `slice.py` |
| `make-png-cases.py` | ca codec PNG lạ (gray 16-bit, palette+tRNS, LA, Adam7) | zlib/struct + Pillow |
| `make-resample-golden.py` | băm pixel của phép resize Pillow (`engine-resample/pillow.json`) | Pillow |

**Vì sao xoá:** bước ⑤a của đợt port engine sang JS (16/09/2026) xoá hẳn engine
bash/python khỏi kho, cùng với Python khỏi installer. Một script sinh golden mà nguồn
sự thật của nó không còn tồn tại thì không sinh lại được gì — giữ lại chỉ là một lời
mời chạy một lệnh chắc chắn hỏng.

**Golden vẫn còn nguyên và vẫn là hợp đồng.** `suite-engine-prompt.mjs`,
`suite-engine-slice.mjs` và `suite-engine-gen.mjs` so từng byte / từng pixel bản JS với
các fixture đã commit; chúng không bao giờ gọi mấy script này, nên bộ test không cần
Python. Fixture đóng băng tại commit **b8bed60** (`test(engine-js): engine giả viết lại
bằng JS…`) — bản cuối cùng còn engine cũ trong kho.

**Cần sinh lại?** Đó gần như luôn là câu trả lời SAI: golden đỏ lên nghĩa là bản JS đã
trôi khỏi bản Python, và thứ phải sửa là bản JS. Nếu vẫn thật sự cần (ví dụ thêm một ca
đầu vào mới), lấy lại engine cũ + script từ lịch sử:

```sh
git checkout b8bed60 -- kit-gen/gen.sh kit-gen/cover.sh kit-gen/slice.py \
  kit-gen/geometry.py kit-gen/validate_output_geometry.py \
  kit-gen/agent/test/engine-golden
# … chạy script cần dùng (cần python3 + Pillow), rồi trả kho về nguyên trạng:
git checkout HEAD -- kit-gen/agent/test/engine-golden
git rm -f --ignore-unmatch kit-gen/gen.sh kit-gen/cover.sh kit-gen/slice.py \
  kit-gen/geometry.py kit-gen/validate_output_geometry.py
```

Và nói ra trong commit message vì sao mốc phải dịch — một golden đổi mà không kèm lý do
là một hợp đồng bị sửa sau lưng.
