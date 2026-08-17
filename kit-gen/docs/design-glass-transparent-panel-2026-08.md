# Element TRONG SUỐT — cờ, prompt, và vì sao nền đen KHÔNG dùng cho kính

*17/08/2026. Bối cảnh: chủ sản phẩm báo popup/khay trong kit `hello-368a` ra **đục màu
key** thay vì nhìn xuyên qua, và đề xuất: "chắc là mỗi element sẽ có flag kiểu transparent
panel chẳng hạn, để auto tạo nền đen thay vì nền kia?".*

Tài liệu này chốt ba thứ: **cờ nào**, **prompt nói gì**, **slicer tách kiểu gì** — và ghi
lại vì sao vế "auto tạo nền đen" là đúng cho `glow` nhưng **sai cho kính**.

---

## 1. Cờ: dùng lại `matte:"glass"`, KHÔNG thêm `transparent-panel`

`skel.matte` đã có sẵn `"glass"` trong thư viện (`element-lib-v2.json`: `03-btn-pill-outline`,
`22-board-panel`) với đúng nghĩa "món này nhìn xuyên qua được".

Thêm một cờ thứ hai sẽ tạo **hai nửa của cùng một hợp đồng mà rời nhau**, và cả hai kiểu
lệch đều hỏng im lặng:

| trạng thái | hậu quả |
|---|---|
| `transparent-panel` mà không `glass` | prompt bảo model để key lộ qua, slicer vẫn matte thường ⇒ ra **đục màu key** — đúng con bệnh đang chữa |
| `glass` mà không `transparent-panel` | slicer giải ngược alpha trên một ô model đã tô đặc ⇒ **ăn thủng** phần đặc bị ám key |

Một cờ ⇒ không có trạng thái lệch nào tồn tại được. Vì thế `"glass"` từ nay mang nghĩa ở
**cả hai đầu** (prompt + slicer), và điều đó kéo theo hai thay đổi nhỏ:

* `SkelMatteChoice` (`webapp/src/features/workflow-v4/lib/model.ts:84`) thành
  `"glow" | "glass" | "none"`, và popup Chi tiết có nút thứ ba **"Trong suốt nhìn xuyên
  qua"** (`steps/KitsetStep.tsx:272-321`). Trước đây `glass` là *thuật toán nội bộ của
  slicer*, người dùng không chọn được — nay nó là một câu mô tả **cái ô**, đúng loại câu
  hỏi mà popup này hỏi.
* `mergeElementSkel` (`lib/kitset-to-contract.ts:224-244`): `"none"` nay gỡ được **cả**
  `glow` lẫn `glass`. `"vitmatte"` vẫn được bảo vệ — nó thuần thuật toán, không có mặt nào
  ở prompt, popup không hỏi nên `"none"` không được phép hạ chất lượng tách của nó.

---

## 2. Vì sao KHÔNG đẩy kính lên nền đen

Đây là chỗ trực giác "nền đen của burst" **đảo chiều**. Ngắn gọn: nền đen đúng cho glow
*chính vì* glow cộng tính, và sai cho kính *chính vì* kính che.

**Trên nền đen, ảnh thu được là `C = α·F`.** Ba phương trình, bốn ẩn (`α`, `F_r`, `F_g`,
`F_b`) — thiếu một ràng buộc, luôn luôn.

* **Glow** ghép bằng **cộng** (`screen`). Kết quả cuối chỉ phụ thuộc **tích** `α·F`, nên
  chọn `α` kiểu nào cũng cho ra ĐÚNG một hình. Ước lượng `α = max(R,G,B)` của
  `glow_alpha()` (`slice.py:726-753`) không phải phỏng đoán may rủi — nó chỉ là **một cách
  viết** của cùng một tích. Thiếu ràng buộc mà vô hại.
* **Kính** ghép bằng **OVER**: `out = α·F + (1−α)·BG`. Ở đây `α` **tự nó** quyết định bao
  nhiêu nền lọt qua. Hai cặp `(α, F)` cùng tích cho ra **hai kết quả khác nhau** trên mọi
  nền không đen. Thiếu ràng buộc là chí mạng.

Hai ca đo bằng số, cùng dùng `α = max(RGB)` như glow:

| kính thật | trên đen `C` | đọc lại `α`, `F` | dán lên nền TRẮNG | đúng phải là | sai |
|---|---|---|---|---|---|
| xám trung tính `F=(128,128,128)`, `α=0,50` | `(64,64,64)` | `α=0,251`, `F=(255,255,255)` | **255** | 192 | **+63** |
| kính khói `F=(20,20,25)`, `α=0,60` | `(12,12,15)` | `α=0,059`, `F=(204,204,255)` | **252** | 114 | **+138** |

Nghĩa là: trên nền đen, **kính càng tối càng biến mất**, và mọi tấm kính đều bị đọc thành
"mờ hơn sự thật, màu sáng hơn sự thật". Đúng cái "thân kính" mà chủ sản phẩm dặn phải giữ
(*"đừng ép alpha=0 sạch — kính phải còn thân"*) là thứ nền đen xoá đi đầu tiên.

**Nền key thì ngược lại — nó là nền TỐT NHẤT cho kính.** Key là một hằng số **đã biết,
sáng, bão hoà**, nên phần key còn lộ qua thân kính **chính là tín hiệu alpha**:

```
C = α·F + (1−α)·K
spill(C) = α·spill(F) + (1−α)·sref        (spill tuyến tính trên trục key_axis)
spill(F) = 0   ← giả thiết Vlahos: kính không tự mang sắc key
⇒ α = 1 − spill(C)/sref          F = (C − (1−α)·K) / α
```

Đủ ràng buộc, giải ra được, không phải đoán. Đây chính là bản vá đã ship
(`slice.py`, `matte_chroma(..., glass=)` / `matte_pymatting(..., glass=)`).

> **Cách duy nhất tách kính CHÍNH XÁC tuyệt đối** là chụp hai lần cùng một ô, một trên đen
> một trên trắng: `α = 1 − (C_trắng − C_đen)/255`, `F = C_đen/α`. Không cần giả thiết nào.
> Nhưng nó **gấp đôi quota** và đòi model vẽ **y hệt** hai lần — thứ model sinh ảnh không
> bảo đảm. Xem BACKLOG.

### `blend:"screen"` cho panel?

**Không.** `slice.py` ghi `blend:"screen"` vào manifest cho ô `glow` vì ánh sáng ghép bằng
cộng. Kính ghép bằng OVER. Gắn `screen` cho panel sẽ làm nó **biến mất trên nền sáng**
(screen với nền trắng luôn ra trắng). Ô `glass` giữ blend thường; alpha thật đã nằm trong
PNG rồi, không cần chỉ dẫn ghép nào thêm.

---

## 3. Prompt: ra HỢP ĐỒNG, không đổi nền

Vì không đổi nền, việc của prompt là **bắt model tôn trọng đúng mô hình ở §2** — cụ thể là
đừng tô một mảng đục sau lưng tấm kính. Câu này nối vào spec của ô ở nhánh `elif` ngay dưới
nhánh glow (`gen.sh:489-506`), và được mirror nguyên văn ở
`webapp/src/features/workflow-v4/lib/item-prompt.ts` (`glassCellPrompt`):

> — SEE-THROUGH ELEMENT: this element is TRANSPARENT. Do NOT paint any opaque fill behind
> it or inside it: the *{key}* chroma-key background stays VISIBLE THROUGH the body of the
> element, covered only by the element's own thin tint. How much flat *{key}* still shows
> through IS the transparency — pure flat *{key}* reads as fully clear, a heavy opaque wash
> reads as a solid panel. Frame, rim, bevel, specular highlights and anything sitting ON TOP
> of it stay fully opaque.

Câu *"How much flat {key} still shows through IS the transparency"* là chỗ đắt nhất: nó nói
cho model biết **thước đo**, nên "vẽ trong suốt" thôi không còn là lời khuyên mông lung mà
thành một đại lượng model điều khiển được.

`if/elif` chứ không phải hai `if` rời: một ô chỉ nhận **đúng một** câu phụ. Chọn "nền đen"
cho một ô kính là chọn nền đen — có ca khoá ở `__tests__/cell-background.test.tsx`.

### Cái giá, nói thẳng

Element `glass` mà nghệ sĩ **cố ý** tô đúng màu key sẽ bị làm trong. Đó là cái giá của việc
khai `matte:"glass"`, và là lý do cờ này phải người-dùng-chọn-được chứ không bật ngầm theo
tên file.

---

## 4. Đường gen mới chỉ áp cho kit gen MỚI

`gen.sh` chỉ chạy lúc **sinh ảnh**. Kit đã gen xong không được lợi gì từ §3 — với chúng,
thứ chữa bệnh là bản vá slicer (§2), chạy lại `slice.py` trên raw sẵn có, **0 quota**. Đo
trên chính `22-board-panel` của `hello-368a`:

| | trước | sau |
|---|---|---|
| px magenta **đục** | 325 626 | **0** |
| α thân kính (25…250) | 26 780 | **377 259** |
| α trong suốt | 377 566 | 366 737 |
| `F` trung bình thu được | — | (219, 117, 117), spill **−0.1** |
| α trung bình | — | 152/255 (mờ 60%) |

Phần hồng còn lại trong thân kính là **sắc kính của chính model**, không phải spill (spill
đã về ~0). §3 là thứ làm nó nhạt đi ở lần gen sau.

---

## 5. File đã đụng

| file | việc |
|---|---|
| `gen.sh:489-506` | nhánh `elif … == "glass"` — câu SEE-THROUGH ELEMENT |
| `slice.py` `matte_chroma` / `matte_pymatting` (tham số `glass=`) | unmix `C = α·F + (1−α)·K` trong mặt nạ glass |
| `webapp/.../lib/item-prompt.ts` | `glassCellPrompt()`, `isGlassCell()`, nối vào `itemPromptFor` |
| `webapp/.../lib/model.ts:84` | `SkelMatteChoice` thêm `"glass"` |
| `webapp/.../lib/kitset-to-contract.ts:224-244` | `mergeElementSkel` nhận/gỡ `glass`, chừa `vitmatte` |
| `webapp/.../steps/KitsetStep.tsx:272-321` | nút thứ ba trong popup Chi tiết |
| `tests/test_slice_glass.py` | 8 ca — ground truth tổng hợp, giải ngược đúng `F0`/`α0` |
| `webapp/.../__tests__/cell-background.test.tsx` | ca UI + ca mirror TỪNG CHỮ với `gen.sh` thật |
