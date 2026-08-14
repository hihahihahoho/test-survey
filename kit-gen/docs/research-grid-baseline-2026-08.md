# Baseline hình học "KHÔNG GRID" — 2026-08-14

**Mục đích.** BACKLOG §16 muốn biết grid xám/đen neo khung giúp hay hại. Validator hình học
vừa được chữa sáng 14/08 (§6: đo màu nền thật, phân loại bằng `spill`, ô `empty` không bị
đếm oan) nên **mọi số đo trước đó đều vô giá trị**. Tài liệu này là **mốc so**: chạy validator
đã chữa trên TOÀN BỘ sheet raw thật còn tìm được trên máy, để mai đo biến thể grid trên cùng
thước đo.

**KHÔNG gen ảnh mới** — chỉ đo lại ảnh đã có (giữ quota).

---

## 1. Đo cái gì, bằng thước nào

Công cụ: `tools/validate_output_geometry.py` (bản 14/08), dung sai mặc định
`position_tolerance = .08`, `size_tolerance = .15`.

Với mỗi ô, validator trả `expected = [ex, ey, ew, eh]` và `actual = [ax, ay, aw, ah]`
tính bằng **pixel trong hệ toạ độ của Ô** (không phải của sheet). Từ đó:

| Đại lượng | Công thức | Ý nghĩa |
|---|---|---|
| `dxc`, `dyc` | `((a+size/2) − (e+size/2)) / cell_size` | lệch TÂM, đơn vị = bề rộng/cao ô |
| `pos` | `hypot(dxc, dyc)` | lệch vị trí tổng hợp |
| `dw`, `dh` | `(aw − ew) / ew`, `(ah − eh) / eh` | lệch kích thước, tương đối |

**Lưu ý về `pos`:** validator dựng `expected` luôn CĂN GIỮA ô
(`expected = ((cell_w − sw)/2, (cell_h − sh)/2, sw, sh)`), nên tâm hộp kỳ vọng **luôn trùng
tâm ô**. Vì vậy `dxc/dyc` ở trên đo đúng cùng một đại lượng mà validator dùng để gắn cờ
`position` — không có hai thước khác nhau. Hệ quả kèm theo: **validator không diễn đạt được
một ô cố ý lệch tâm**; hợp đồng nào muốn thế sẽ bị báo fail oan.

Ô `status:"empty"` (shape `empty`) không có thân để đo → loại khỏi mọi thống kê lệch, đếm riêng.

Phân lớp: **pose** = ô có `skel.shape == "pose"`; **UI** = tất cả phần còn lại
(`pill`/`bar`/`rrect`/`circle`/`burst`/`puzzle`/`figure`/`full`).

---

## 2. Dữ liệu tìm được

Đã quét (không suy đoán): `~/KitGen/projects/*/raw`, `~/KitGen/.kitgen/trash/*/raw` (CHỈ ĐỌC),
`~/KitGen/**/.history`, `kit-gen/raw`, `kit-gen/experiments`, `kit-gen/matte-compare`, `~/.kitgen`.

| Bộ | Nguồn | Sheet | Ô | Ghi chú |
|---|---|---|---|---|
| `repo-raw` | `kit-gen/raw/*.png` | 26 | 240 | engine CLI đời cũ, 31 file − 5 file không đo được |
| `blindtest-a` | `~/KitGen/.kitgen/trash/20260814-032314-blindtest-a-trung-thu-candy-83fe` | 5 | 9 | contract v4, đã xoá vào thùng rác |
| `blindtest-b2` | `~/KitGen/.kitgen/trash/20260814-032311-blindtest-b2-retry-fee3` | 3 | 10 | contract v4, **lượt retry** |
| **Tổng** | | **34** | **259** | 251 ô đo được + 8 ô `empty` |

Không có gì khác để đo: `~/KitGen/projects/ch-kit-1b95/raw` và `.../hello-dece/raw` **rỗng**,
3 project còn lại trong thùng rác cũng có `raw/` rỗng. `experiments/` và `matte-compare/` có PNG
nhưng `manifest.json` của chúng là metadata cắt ảnh của engine (`styles→sheets→{mode, bg_detected,
canvas, cell, bleed, blobs, cut}`), **không có `components`/`skel`** ⇒ validator không đo được.

**5 file bỏ qua** (đều thuộc `repo-raw`, đều 1536×1024, ngày 31/07–04/08):
`candy-pose`, `ipay-pose`, `rnd-pose`, `tet-pose` — id sheet `pose` không còn trong `styles.json`
hiện tại (chỉ còn `pose-lan`/`pose-soc`/`pose-taxi`); và `_smoke` — tên job không có dấu gạch nên
`partition('-')` cho sheet id rỗng. Tức **16% bộ repo không khớp nổi hợp đồng hiện hành** — chính
nó là bằng chứng contract đã trôi khỏi lượt chạy (xem §5).

Cả 34/34 sheet đều phân loại được bằng `key_mode = "spill"`, **không sheet nào rơi về `distance`**
— tức bản vá §6 hoạt động trên dữ liệu thật.

---

## 3. Bảng per sheet

`ok/regen/empty` đếm ô. `pos` và `|dw|`,`|dh|` chỉ tính trên ô đo được.

| job | bộ | grid | ô | ok/regen/empty | pos tb | pos max | \|dw\| tb | \|dw\| max | \|dh\| tb | \|dh\| max |
|---|---|---|---|---|---|---|---|---|---|---|
| candy-bg-home | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| candy-bg-play | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| candy-main | repo-raw | 4×4 | 16 | 1/15/0 | 0.059 | 0.112 | 0.311 | 1.118 | 0.333 | 0.971 |
| candy-main2 | repo-raw | 4×4 | 16 | 2/14/0 | 0.074 | 0.135 | 0.321 | 1.665 | 0.291 | 0.549 |
| candy-tall | repo-raw | 4×2 | 8 | 0/8/0 | 0.046 | 0.074 | 0.409 | 0.686 | 0.216 | 0.680 |
| ipay-bg-home | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| ipay-bg-play | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| ipay-main | repo-raw | 4×4 | 16 | 2/14/0 | 0.068 | 0.111 | 0.318 | 1.097 | 0.428 | 1.221 |
| ipay-main2 | repo-raw | 4×4 | 16 | 2/14/0 | 0.098 | 0.169 | 0.564 | 2.212 | 0.264 | 0.432 |
| ipay-pose-soc | repo-raw | 4×4 | 16 | 4/12/0 | 0.106 | 0.167 | 0.130 | 0.380 | 0.102 | 0.176 |
| ipay-pose-soc2 | repo-raw | 2×2 | 4 | 0/3/1 | 0.078 | 0.118 | 0.697 | 0.840 | 0.056 | 0.082 |
| ipay-pose-taxi | repo-raw | 4×4 | 16 | 3/13/0 | 0.105 | 0.257 | 0.190 | 0.309 | 0.104 | 0.210 |
| ipay-pose-taxi2 | repo-raw | 2×2 | 4 | 1/2/1 | 0.050 | 0.104 | 0.234 | 0.419 | 0.076 | 0.101 |
| ipay-tall | repo-raw | 4×2 | 8 | 2/6/0 | 0.074 | 0.110 | 0.370 | 0.809 | 0.178 | 0.621 |
| rnd-bg-home | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| rnd-bg-play | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| rnd-main | repo-raw | 4×4 | 16 | 2/14/0 | 0.083 | 0.183 | 0.267 | 1.022 | 0.366 | 1.494 |
| rnd-main2 | repo-raw | 4×4 | 16 | 1/15/0 | 0.093 | 0.153 | 0.356 | 1.569 | 0.210 | 0.419 |
| rnd-pose-soc | repo-raw | 4×4 | 16 | 0/16/0 | 0.147 | 0.278 | 0.272 | 0.771 | 0.119 | 0.403 |
| rnd-tall | repo-raw | 4×2 | 8 | 0/8/0 | 0.076 | 0.123 | 0.269 | 0.742 | 0.189 | 1.018 |
| tet-bg-home | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| tet-bg-play | repo-raw | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| tet-main | repo-raw | 4×4 | 16 | 5/11/0 | 0.075 | 0.160 | 0.285 | 1.131 | 0.341 | 1.140 |
| tet-main2 | repo-raw | 4×4 | 16 | 2/14/0 | 0.093 | 0.161 | 0.255 | 0.510 | 0.407 | 0.875 |
| tet-pose-lan | repo-raw | 4×4 | 16 | 0/16/0 | 0.124 | 0.220 | 0.263 | 0.539 | 0.089 | 0.288 |
| tet-tall | repo-raw | 4×2 | 8 | 2/6/0 | 0.063 | 0.087 | 0.356 | 0.667 | 0.230 | 1.096 |
| chinh-nen | blindtest-a | 1×1 | 1 | 1/0/0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| chinh-popup | blindtest-a | 1×1 | 1 | 1/0/0 | 0.005 | 0.005 | 0.008 | 0.008 | 0.027 | 0.027 |
| chinh-dao-cu | blindtest-a | 1×1 | 1 | 0/1/0 | 0.019 | 0.019 | 0.240 | 0.240 | 0.160 | 0.160 |
| chinh-dao-cu-doc | blindtest-a | 2×1 | 2 | 1/0/1 | 0.035 | 0.035 | 0.132 | 0.132 | 0.109 | 0.109 |
| chinh-pose-nhan-vat | blindtest-a | 2×2 | 4 | 1/1/2 | 0.042 | 0.043 | 0.224 | 0.319 | 0.029 | 0.029 |
| chinh-nen | blindtest-b2 | 2×1 | 2 | 0/2/0 | 0.003 | 0.004 | 0.157 | 0.158 | 0.060 | 0.060 |
| chinh-pose-nhan-vat | blindtest-b2 | 2×2 | 4 | 0/2/2 | 0.106 | 0.135 | 0.562 | 0.749 | 0.018 | 0.020 |
| chinh-ui | blindtest-b2 | 2×2 | 4 | 2/1/1 | 0.043 | 0.062 | 0.053 | 0.070 | 0.126 | 0.187 |

---

## 4. Tổng hợp — MỐC SO CHO BIẾN THỂ GRID

`ok/nonempty` = ok ÷ (tổng ô − ô empty). Cột lệch chỉ tính trên ô đo được.

| phạm vi | lớp | ô | ok | regen | empty | ok/nonempty | pos tb | pos max | \|dw\| tb | \|dw\| max | \|dh\| tb | \|dh\| max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| repo-raw | tất cả | 240 | 37 | 201 | 2 | 0.155 | 0.086 | 0.278 | 0.296 | 2.212 | 0.234 | 1.494 |
| repo-raw | pose | 70 | 8 | 62 | 0 | 0.114 | 0.116 | 0.278 | 0.235 | 0.840 | 0.100 | 0.403 |
| repo-raw | UI | 170 | 29 | 139 | 2 | 0.173 | 0.074 | 0.183 | 0.322 | 2.212 | 0.290 | 1.494 |
| blindtest-a | tất cả | 9 | 4 | 2 | 3 | 0.667 | 0.024 | 0.043 | 0.138 | 0.319 | 0.059 | 0.160 |
| blindtest-b2 | tất cả | 10 | 2 | 5 | 3 | 0.286 | 0.050 | 0.135 | 0.228 | 0.749 | 0.076 | 0.187 |
| **TOÀN BỘ** | **tất cả** | **259** | **43** | **208** | **8** | **0.171** | **0.083** | **0.278** | **0.291** | **2.212** | **0.226** | **1.494** |
| **TOÀN BỘ** | **pose** | **74** | **9** | **65** | **0** | **0.122** | **0.113** | **0.278** | **0.244** | **0.840** | **0.096** | **0.403** |
| **TOÀN BỘ** | **UI** | **185** | **34** | **143** | **8** | **0.192** | **0.071** | **0.183** | **0.310** | **2.212** | **0.280** | **1.494** |

### Bốn sự thật rút ra từ bảng trên

1. **`missing-body` = 0 trên cả 259 ô.** Mọi ô không-empty đều có thân đo được. Nghĩa là
   `regenerate` **không bao giờ** vì ô trống câm — luôn vì vị trí/kích thước.
2. **Lệch KÍCH THƯỚC mới là vấn đề, không phải vị trí.** Histogram lý do:
   chỉ `size` 108 ô · `position`+`size` 78 ô · chỉ `position` 22 ô · không lý do 51 ô
   (43 ok + 8 empty). Tức `size` dính 186/251 ô đo được, `position` chỉ 100/251.
   Đối chiếu với dung sai: `pos` trung bình 0.083 so với ngưỡng 0.08 — **sát ngưỡng**;
   còn `|dw|` trung bình 0.291 so với ngưỡng 0.15 — **vượt gần 2×**.
3. **Lệch kích thước có DẤU: luôn TO HƠN.** `dw` trung bình có dấu **+0.300**,
   `dh` **+0.268** cho ô UI (n=177); pose **+0.133** / **+0.004** (n=74).
   Tranh UI tràn khỏi khung skeleton ~30%; pose thì đúng chiều cao nhưng bị bè ngang.
   Lệch tâm gần như không có (|trung bình có dấu của `dxc`| ≤ 0.02) — **model căn giữa tốt,
   nhưng vẽ to**. Đây chính là biến mà grid phải cải thiện; nếu grid chỉ kéo `pos` xuống mà
   không kéo `|dw|` xuống thì grid vô ích.
4. **Sheet full-bleed là điểm cho không.** 10 sheet toàn ô `full` (`*-bg-home`, `*-bg-play`,
   `chinh-nen`), 11 ô. `full` có `skel.w=h=1` ⇒ `expected` = cả ô; nền tràn viền ⇒ `actual`
   cũng là cả ô ⇒ lệch đúng 0. 9/11 ô `full` là `ok` **do cấu tạo**. Bỏ 11 ô này ra, tỉ lệ
   `ok/nonempty` toàn bộ tụt **0.171 → 0.142** (34/240). Khi so với biến thể grid, **phải
   loại full-bleed** hoặc so riêng, nếu không grid sẽ "thắng/thua" bằng nhiễu.

### Histogram shape (toàn bộ 259 ô)

`rrect` 79 · `pose` 74 · `pill` 34 · `circle` 24 · `bar` 17 · `full` 11 · `puzzle` 8 ·
`empty` 8 · `burst` 4. Không có ô `figure` nào trong dữ liệu thật.

---

## 5. Caveat — đọc kỹ trước khi dùng số này

**a. Cỡ mẫu lệch nặng.** 93% số ô đến từ một bộ (`repo-raw`, 238 ô đo được).
`blindtest-a` là **9 ô** (6 đo được), `blindtest-b2` là **10 ô** (7 đo được). Các dòng
tách pose/UI của hai bộ này là mẫu 2 ô và 4 ô — **không có trọng số thống kê nào**.
Chỉ `repo-raw` (70 pose / 168 UI) mới đỡ nổi một con số.

**b. Hợp đồng đã trôi khỏi lượt chạy — đây là caveat nặng nhất.**
Ảnh `repo-raw` có mtime 2026-07-31 10:37 → 2026-08-03 14:48, nhưng `styles.json` dùng để
chấm chúng có mtime **2026-08-11 20:11** — sau ảnh mới nhất 8 ngày, và `styles.json.bak`
(2026-08-03 14:45) chứng minh hợp đồng ĐÃ bị sửa sau khi gen. Một phần con số `|dw|` lớn ở
§4 có thể chỉ là "đo ảnh cũ bằng thước mới". Hai bộ blindtest cũng vậy, còn tệ hơn: mỗi
project có 34–37 ảnh chụp `.history/contract/*.json`, và `contract.json` của blindtest-a có
mtime 18:32 — sau file PNG cuối cùng (17:45) 47 phút.
⇒ **Khi đo biến thể grid, PHẢI đóng băng contract cùng lượt gen** (chép contract vào cạnh
raw ngay khi gen xong), nếu không lần đo sau lại dính đúng lỗi này.

**c. Ba bộ không so được với nhau.** `repo-raw` là engine CLI/`gen.sh` đời cũ với
`element-lib.json` mức repo (03/08). Hai blindtest là contract webapp **schemaVersion 4**,
gen ngày 13/08 17:44–17:59, id sheet khác hẳn (`nen`/`popup`/`dao-cu`/`ui`/`pose-nhan-vat`).
`element-lib.json` thì trùng khít (cùng 16 084 byte) nên thư viện element không phải biến số,
nhưng pipeline prompt thì có. `blindtest-b2` còn là **lượt retry** theo đúng tên nó
(`project.json` name "BlindTest-B2 Retry"). Cả hai đều nằm trong **thùng rác** — là việc đã bị
xoá. ⇒ Dùng `repo-raw` làm mốc chính; hai blindtest chỉ để tham chiếu định tính.

**d. Hai job trùng tên khác sheet.** `chinh-nen` và `chinh-pose-nhan-vat` xuất hiện ở CẢ HAI
blindtest với hình học khác nhau. Trong CSV chúng chỉ phân biệt được bằng cột `set`/`project`.

**e. `styles.json` của repo có id sheet TRÙNG.** `pose-soc` và `pose-soc2` mỗi cái xuất hiện
**hai lần** trong danh sách 13 sheet; `next()` của validator lặng lẽ lấy cái đầu. Ở đây hai bản
trùng có cùng grid và cùng toàn ô `pose` nên không đổi số — nhưng đó là một cái bẫy đang nằm sẵn.

**f. `styles.json` dùng khoá `styles`, validator đọc `variants`.** Không có shim thì `variant`
ra `{}`, `parse_key` trả `None`, và key rơi về chế độ `distance`. Xem §6 để dựng shim.

---

## 6. Cách tái chạy

Bộ script lái nằm ngoài repo (thư mục scratchpad của lượt research, ephemeral). Dựng lại
mất vài phút — công thức đầy đủ:

**Bước 1 — shim cho hợp đồng engine.** `kit-gen/styles.json` dùng khoá `styles`, validator đọc
`variants`. Đọc-only trên bản gốc:

```python
import json
c = json.load(open("kit-gen/styles.json"))
json.dump({"sheets": c["sheets"], "variants": c["styles"]},
          open("repo_contract_shim.json", "w"), ensure_ascii=False)
```

**Bước 2 — chạy validator trên mọi ảnh.** Import làm module (nhanh hơn gọi CLI 34 lần);
nhớ `sys.dont_write_bytecode = True` để **không đẻ `.pyc` vào repo**:

```python
import sys; sys.dont_write_bytecode = True
import importlib.util, json
from pathlib import Path
from PIL import Image
spec = importlib.util.spec_from_file_location(
    "vog", "kit-gen/tools/validate_output_geometry.py")
vog = importlib.util.module_from_spec(spec); spec.loader.exec_module(vog)

for png, contract_path in ALL_PAIRS:           # xem §2 cho danh sách nguồn
    contract = json.loads(Path(contract_path).read_text())
    try:
        r = vog.validate(Image.open(png).convert("RGB"), contract, Path(png).stem)
    except ValueError as e:                     # 'unknown sheet: …' → ghi SKIPPED
        continue
    # r["cells"][i] có expected/actual/status/reasons → tính dxc,dyc,dw,dh như §1
```

Python: `python3` hệ thống có PIL 11.3.0 và chạy được; lượt đo này dùng
`~/KitGen/.venv/bin/python` (PIL 12.3.0). Toàn bộ 34 sheet mất **~28 giây**.

**Kiểm chứng một sheet bằng CLI** (khớp đến từng pixel với đường module):

```bash
cd kit-gen
python3 tools/validate_output_geometry.py \
  --image ~/KitGen/.kitgen/trash/20260814-032314-blindtest-a-trung-thu-candy-83fe/raw/chinh-popup.png \
  --contract ~/KitGen/.kitgen/trash/20260814-032314-blindtest-a-trung-thu-candy-83fe/contract.json \
  --job chinh-popup
```

**Vệ sinh:** không ghi gì vào `~/KitGen` (kể cả thùng rác) và không ghi gì vào repo. Lượt đo
này chạy lại cho ra CSV **giống bit** (đã kiểm md5).

---

## 7. So biến thể grid thế nào cho đúng

Khi có ảnh của biến thể grid (grid chỉ ở bleed / grid màu tách biệt xoá deterministic),
dùng đúng script trên và so với §4 theo thứ tự ưu tiên này:

1. **`|dw|`, `|dh|` trung bình có dấu** — biến chính. Mốc: UI **+0.300 / +0.268**,
   pose **+0.133 / +0.004**. Grid có công khi kéo được con số này về gần 0.
2. **`ok/nonempty` sau khi LOẠI ô `full`** — mốc **0.142** (34/240). Không dùng con số
   0.171 chưa loại, nó chứa 9 điểm cho không.
3. **`pos` trung bình** — mốc **0.083** (ngưỡng 0.08). Đây là biến grid dễ cải thiện nhất
   nhưng cũng ít quan trọng nhất, vì chỉ 22/251 ô fail vì RIÊNG vị trí.
4. **Tách pose vs UI luôn luôn.** Hai lớp lệch theo hai kiểu khác nhau (pose bè ngang,
   UI to đều hai chiều); gộp lại sẽ giấu mất hiệu ứng.
5. **Điều kiện tối thiểu để kết luận có ý nghĩa:** ≥ 2 variant × ≥ 3 sheet không-full-bleed,
   contract đóng băng cùng lượt gen (§5b), và **cùng một hợp đồng cho cả nhánh có-grid và
   không-grid** — nếu không thì lại đo hai thứ khác nhau như §5c.

§8.1 của `SPRITESHEET-SAFE-ZONE-HANDOFF.md` đã đo "bắt model vẽ lại grid" là **fail**;
tài liệu này không đụng tới kết luận đó — nó chỉ dựng mốc cho các biến thể chưa ai đo.
