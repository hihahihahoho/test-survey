# Handoff — Spritesheet, safe zone và Figma

> **LỖI THỜI MỘT PHẦN — 27/08/2026.** Tài liệu này mô tả cách lái model bằng **ảnh
> đính kèm** ("IMAGE 1 — contract skeleton"). Ảnh đó đã bỏ: engine không render và
> không đính khung xương nữa, prompt in thẳng toạ độ pixel của safe zone từng ô
> (`geometry.py`, dùng chung với `slice.py`). Xem đầu `docs/BACKLOG.md`.
>
> Phần **VẪN CÒN GIÁ TRỊ** và đã đi thẳng vào prompt hiện tại là §5.3 + §8.1: nói ra
> HẬU QUẢ ("phần mềm sẽ crop đúng bốn toạ độ này") thay vì ra lệnh "respect the frame",
> và cấm đích danh hành vi hỏng phổ biến nhất — model co mặt nội dung lại để nhét viền
> vào trong. `gen.sh` còn trích dẫn mục này ở khối neo hình học.


> Cập nhật: 2026-08-13  
> Trạng thái: spike đang thử nghiệm, chưa phải pipeline production hoàn tất  
> Nhánh hiện tại: `feat/kitgen-local-runtime`

## 1. Người đọc và việc cần làm sau khi đọc

Tài liệu này dành cho agent tiếp quản mà không có context của cuộc hội thoại trước.
Sau khi đọc, agent phải có thể:

1. Gen lại một spritesheet theo contract safe zone hiện tại.
2. Đo mức lệch giữa ảnh AI và contract.
3. Tách nền xanh, chuẩn bị manifest và copy chín asset sang Figma.
4. Biết phần nào đã chốt, phần nào mới là giả thuyết và không quay lại các hướng đã thất bại.

Tài liệu sản phẩm tổng quát nằm ở `kit-gen/docs/PRODUCT-SITEMAP.md`. File đó chứa
một số kết luận cũ về việc bảo toàn grid/gray underlay; khi có xung đột về spike
safe-zone, dùng trạng thái mới hơn trong tài liệu này.

Vị trí prototype, app React chính, runtime đã cài và quy trình Git/release nằm ở
`kit-gen/docs/DEVELOPMENT-AND-RELEASE-RUNBOOK.md`.

## 2. Tóm tắt trạng thái hiện tại

Pipeline đang thử nghiệm là:

```text
contract skeleton 3×3, 1536×1024
        +
ảnh reference phong cách
        ↓
imagegen sửa cả sheet trong một shot
        ↓
sheet nền chroma green 1536×1024
        ↓
validator đo mặt nội dung so với contract
        ↓
post-process deterministic theo contract
        ↓
9 PNG RGBA + manifest
        ↓
Figma: safe frame root → IMG raster, Clip content OFF
```

Bản gần nhất là **v15**:

- Chín element trên một sheet landscape `1536×1024`.
- Outer grid `3×3`.
- Mỗi ô có một silhouette xám và bốn guide cục bộ tạo inner crop/safe zone.
- AI phải tô mặt chức năng tím đúng vùng xám, đặt viền vàng và decoration ở ngoài.
- Background đầu ra phải là chroma green.
- Contract là nguồn tọa độ. Không suy safe zone từ ảnh AI để thay contract.

V15 đẹp và dễ đọc hơn bản 16 ô, nhưng **chưa pixel-perfect**. Phép đo thử nghiệm
cho sai số biên trung bình `23.2 px`, tệ nhất `52 px`. Vì vậy chưa được tuyên bố
“đã giải quyết safe zone”.

## 3. Các invariant đã chốt

### 3.1 Contract và reference có vai trò khác nhau

- **IMAGE 1 — contract skeleton:** quyết định canvas, outer cell, vị trí, kích thước,
  tỷ lệ, tâm và safe zone.
- **IMAGE 2 — style reference:** chỉ quyết định palette, chất liệu và ornament.
  Nó không được quyết định layout hoặc geometry.
- Ảnh mascot reference là một luồng khác, không thuộc spike UI element này.

### 3.2 Safe zone

- Bốn guide cục bộ bao quanh silhouette xám tạo inner crop box.
- Mặt nội dung chức năng phải có cùng tâm và footprint với silhouette xám.
- Viền vàng nằm ngoài mặt nội dung, không được làm co mặt nội dung.
- Hoa, lá, jewel, butterfly và filigree là overflow decoration; chúng được nằm
  ngoài safe zone nhưng không được sang outer cell kế bên.
- Crop và frame dùng tọa độ contract, không dùng bbox AI làm nguồn sự thật.
- Không scale riêng trục X/Y để ép asset đạt contract.
- Asset lệch quá ngưỡng phải bị đánh dấu để gen lại.

### 3.3 Figma

- Artwork phải là **image node raster**.
- Safe zone/hitbox là một frame riêng.
- Frame có kích thước lấy từ contract và `Clip content = off`.
- Image được đặt theo offset để decoration tràn ra ngoài frame.
- Không biến image thành một frame giả và không kéo méo image.

### 3.4 Canvas sản phẩm

Canvas editor là mode khác, chưa thuộc pipeline gen sheet này. Trong sản phẩm
hiện tại Canvas phải disabled và ghi “Đang phát triển”.

## 4. Artifact v15 đang dùng

Tất cả đường dẫn dưới đây tính từ repo root.

| Vai trò | File |
|---|---|
| Contract 9 ô | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/skeleton-gray-nine-elements-v14.png` |
| Script tạo contract 9 ô | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/make-nine-element-reference.py` |
| Style reference | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/sheet-preserve-gray-underlay-v7.png` |
| Prompt mới nhất | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/prompt-nine-elements-crop-safe-v15.txt` |
| Ảnh AI v15 | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/sheet-nine-elements-crop-safe-v15.png` |
| Script đo alignment | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/measure-nine-element-alignment.py` |
| Script chuẩn bị Figma | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/prepare-nine-element-figma.py` |
| Manifest Figma | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/manifest-nine-elements-crop-safe-v15.json` |
| PNG đã tách | `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/assets/tight/` |
| Clipboard exporter | `kit-gen/figma-export/copy-sprite-images.mjs` |

Hai ảnh contract và output v15 đều đã được kiểm tra là `1536×1024`. Không resize
v15 trước khi overlay hoặc đo.

### 4.1 Chín element được chọn

Contract 3×3 chọn chín case đại diện từ contract 4×4 cũ, theo thứ tự:

| Ô | Tên export | Loại hình học |
|---:|---|---|
| 1 | `01-btn-pill-red` | pill |
| 2 | `16-fx-burst` | burst/free shape |
| 3 | `07-progress-track` | thanh pill dài |
| 4 | `04-btn-circle` | tròn |
| 5 | `11-digit-plate` | vuông bo góc |
| 6 | `10-popup-ribbon` | panel ngang |
| 7 | `12-piece-active` | component đặc biệt có attachment |
| 8 | `08-progress-fill` | thanh rất mảnh |
| 9 | `09-popup-panel-short` | panel lớn |

`make-nine-element-reference.py` lấy các cell nguồn `(0, 3, 4, 5, 6, 7, 8, 12, 15)`
từ contract 4×4, scale đồng đều vào cell 3×3 lớn hơn và vẽ lại outer grid.

## 5. Cách gen ảnh

### 5.1 Regenerate contract 9 ô

Từ repo root:

```bash
python3 kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/make-nine-element-reference.py
```

Kiểm tra kích thước:

```bash
sips -g pixelWidth -g pixelHeight \
  kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/skeleton-gray-nine-elements-v14.png
```

Kết quả phải là `1536×1024`.

### 5.2 Gen bằng built-in imagegen

Spike này dùng **built-in imagegen**, không dùng API/CLI. Không có shell command
nào trong repo tự gọi imagegen. Agent phải:

1. Đọc skill `imagegen`.
2. Dùng `view_image` để inspect hai input local.
3. Gọi imagegen với đúng thứ tự reference:
   - reference 1: contract 9 ô;
   - reference 2: style v7.
4. Dùng nguyên nội dung `prompt-nine-elements-crop-safe-v15.txt`.
5. Copy output từ vùng generated-images của Codex về file v15 trong workspace.
6. Kiểm tra output vẫn là `1536×1024` trước khi đo.

Tool call tương đương:

```text
imagegen({
  referenced_image_paths: [
    ".../skeleton-gray-nine-elements-v14.png",
    ".../sheet-preserve-gray-underlay-v7.png"
  ],
  prompt: <toàn bộ prompt v15>
})
```

Built-in imagegen không có cache file theo tên. Nếu chạy lại script post-process
mà không gọi imagegen, script chỉ xử lý ảnh v15 cũ. Mỗi shot imagegen mới phải
được copy rõ ràng vào một filename mới hoặc thay file v15 khi người dùng yêu cầu.

### 5.3 Ý chính của prompt v15

Prompt giải thích mục đích thay vì chỉ ra lệnh “respect boundary”:

- Outer cell chứa toàn sprite.
- Bốn local guide tạo một inner crop box.
- Inner crop box là production safe zone; phần mềm sẽ crop theo đúng tọa độ này.
- Mặt tím phải nằm đúng tâm và phủ cùng footprint với vùng xám.
- Không được co mặt tím để nhường chỗ cho viền vàng.
- Viền vàng ở ngoài mặt tím; ornament ở ngoài viền.
- Nội dung bên trong safe zone phải sạch.
- Nền off-white phải thành chroma green phẳng.

Không rút prompt thành danh sách kích thước pixel. Model bám ý nghĩa “crop-safe
content area” tốt hơn khi hiểu hậu quả: lệch hoặc co mặt sẽ làm asset unusable.

## 6. Đo alignment

Chạy:

```bash
python3 \
  kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/measure-nine-element-alignment.py \
  kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/sheet-nine-elements-crop-safe-v15.png
```

Script hiện tại là **validator spike**, chưa phải validator production:

- Bbox kỳ vọng lấy từ gray/edge pixels của contract.
- Bbox thực tế flood-fill vùng tím chứa tâm mỗi cell.
- Output báo sai số left/top/right/bottom và max error mỗi cell.
- Nó đo mặt tím, không đánh giá ornament hoặc chất lượng matte.

Kết quả v15 đã ghi nhận:

| Ô | Sai số L/T/R/B | Max |
|---:|---:|---:|
| 1 | `+8/+4/-15/-5` | 15 px |
| 2 | `+27/+39/-28/-33` | 39 px |
| 3 | `+5/+5/-7/-4` | 7 px |
| 4 | `+10/+4/-10/-10` | 10 px |
| 5 | `+0/+0/-7/-4` | 7 px |
| 6 | `+14/+6/-20/-6` | 20 px |
| 7 | `+2/+52/-11/-11` | 52 px |
| 8 | `+17/+8/-28/-4` | 28 px |
| 9 | `+26/+6/-31/-22` | 31 px |

Trung bình max-edge error: `23.2 px`. Worst: `52 px`.

Dấu `+` ở left/top và dấu `-` ở right/bottom thường có nghĩa model đã **co mặt
nội dung vào trong**. Đây là lỗi chính hiện nay.

### 6.1 So với v14

V14 dùng cùng contract 9 ô nhưng prompt ít giải thích mục đích crop. Sai số trung
bình là `23.3 px`, worst `36 px`.

V15 cải thiện rõ ở một số hình cơ bản:

- Thanh pill dài: max error `28 → 7 px`.
- Hình tròn: `23 → 10 px`.
- Vuông bo góc: `10 → 7 px`.

Nhưng component đặc biệt và một số panel tệ hơn. Kết luận đúng là: giải thích
safe-zone giúp model hiểu hơn ở một số case, nhưng chưa ổn định toàn sheet.

## 7. Chuẩn bị asset và copy sang Figma

### 7.1 Chuẩn bị chín PNG + manifest

Chạy:

```bash
python3 \
  kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/prepare-nine-element-figma.py
```

Script làm các việc sau:

1. Đọc contract v14 và ảnh gen v15.
2. Chia canvas thành lưới 3×3.
3. Lấy safe box chính xác từ gray pixels của contract.
4. Loại chroma green bằng green dominance, không giả định một RGB duy nhất vì
   imagegen tạo nền quanh `(3,248,2)` với dao động nhỏ.
5. Loại pale neutral guide khỏi raster export.
6. Crop artwork thành PNG RGBA trong `assets/tight/`.
7. Ghi `content`, `content_at` và `safe` vào manifest.

Manifest đặt `figmaScale = 0.375`. Cell 3×3 lớn hơn cell 4×4 cũ theo tỷ lệ `4/3`;
scale `0.375` đưa logical Figma size về cùng hệ với exporter cũ dùng `0.5`.

Lưu ý: alpha extraction hiện là heuristic đơn giản, chưa thay thế matte production
trong `kit-gen/slice.py`. Cần inspect fringe/glow trong Figma trước khi chốt.

### 7.2 Copy vào clipboard Figma

Sau khi prepare:

```bash
node kit-gen/figma-export/copy-sprite-images.mjs \
  kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/manifest-nine-elements-crop-safe-v15.json \
  crop-safe-v15
```

Kết quả đã được chạy thử thành công:

```text
✓ 9 root document: Frame safe-zone → IMG raster
✓ mọi frame clip content OFF; decoration giữ ngoài frame
✓ đã copy — mở Figma và bấm Cmd+V
```

Sau đó mở Figma và nhấn `Cmd+V`.

### 7.3 Exporter đã sửa gì

`copy-sprite-images.mjs` trước đây giả định cứng `16` asset và layout bốn cột.
Nó đã được sửa để:

- nhận số asset bất kỳ;
- đọc `figmaScale` từ manifest;
- đọc số cột từ `layout.columns`;
- tính số hàng/viewport động;
- validate số frame theo độ dài manifest thay vì `16/16`.

Thay đổi này là tracked nhưng hiện chưa commit.

## 8. Lịch sử thử nghiệm và kết luận

| Bản | Ý tưởng | Kết luận |
|---|---|---|
| v3–v7 | Giữ gray underlay/reference cũ | Geometry khá hơn shot tự do nhưng model vẫn diễn giải lại biên. V7 hiện chỉ dùng làm style reference. |
| v8 | Yêu cầu opacity guide bằng 0 và dùng center dots | Dot không khóa được bbox; bỏ. |
| v9 | Grid/gray trên nền xanh | Sai hướng ở thời điểm đó; model coi grid như artwork. |
| v10 | Nested grid: guide theo bbox trong từng outer cell | Làm ý tưởng safe-zone dễ nhìn hơn nhưng AI tự vẽ lại guide. |
| v11 | Nói gray silhouette chính là functional face | Khá hơn v10 nhưng vẫn lệch một số cell. |
| v12 | Canvas vuông 1536×1536 | Composition bị bí/nát; built-in output raw còn trả 1254×1254 nên overlay trực tiếp sai. Đã bỏ. |
| v13 | Chỉ sửa silhouette, không bắt AI giữ grid | Không tự sinh nested grid nữa, nhưng output nền trắng và geometry vẫn chỉ gần đúng. |
| v14 | Giảm từ 16 xuống 9, nền xanh | Composition tốt hơn; mean error 23.3 px, worst 36 px. |
| v15 | Giải thích crop-safe zone và layer content/rim/ornament | Một số shape tốt hơn rõ, nhưng chưa ổn định; mean 23.2 px, worst 52 px. |

### 8.1 Những điều đã học

- Prompt không thể biến imagegen thành renderer deterministic.
- AI thường coi silhouette xám là bbox của **toàn component**, rồi co mặt tím để
  nhét gold rim vào trong. V15 đã giảm hành vi này ở một số shape nhưng chưa hết.
- Yêu cầu AI “preserve/redraw grid exactly” khiến nó tái dựng hoặc nhân đôi grid.
- Square canvas không tự giải quyết geometry và làm composition kém hơn.
- Giảm density từ 16 xuống 9 giúp độ rõ/composition, nhưng không đủ để khóa tọa độ.
- Output native size phải khớp contract trước khi overlay. Không đánh giá một ảnh
  1254×1254 với contract 1536×1536 mà chưa chuẩn hóa.
- Contract + validator + regenerate mới là lớp đảm bảo; prompt chỉ tăng xác suất.

## 9. Quyết định production và giả thuyết còn mở

### Đã chốt

- Gen nguyên spritesheet để tiết kiệm lượt/token; không gen từng element làm luồng chính.
- Contract JSON/skeleton quyết định tọa độ safe zone.
- Output không đạt bị yêu cầu gen lại; không bóp méo để ép đạt.
- Chroma green được loại bằng post-process deterministic.
- Figma export là safe frame + IMG raster, clip off.
- Canvas editor không liên quan pipeline này.

### Chưa chốt

- `9 element/sheet` có phải default production hay chỉ là density test.
- Ngưỡng validator chính thức theo pixel hay theo phần trăm kích thước safe zone.
- Nên gen lại toàn sheet hay chỉ gen lại cell/sheet-family lỗi.
- Có nên chia sheet theo family hình học để model ít tự diễn giải:
  - pills và bars;
  - circles và squares;
  - panels;
  - components đặc biệt/free shapes.
- Matte production sẽ dùng trực tiếp `slice.py` hay một adapter riêng cho contract 3×3.

## 10. Next action đề xuất cho agent tiếp quản

Đừng sửa prompt ngay sau một shot duy nhất. Imagegen có stochastic variance.
Hành động kế tiếp nên là:

1. Gen thêm ít nhất một shot với **nguyên contract và prompt v15**.
2. Lưu thành filename mới, không ghi đè v15.
3. Chạy `measure-nine-element-alignment.py` trên shot mới.
4. Nếu pattern co mặt lặp lại ở cùng family, tạo contract 3×3 đồng nhất hình học:
   một sheet chỉ pill/bar, một sheet chỉ panel/square.
5. Giữ prompt crop-safe v15 gần như nguyên vẹn để chỉ test biến số “family đồng nhất”.
6. So mean/worst error với v15 trước khi kết luận.

Mục tiêu của test kế tiếp không phải “ảnh đẹp hơn”, mà là trả lời câu hỏi:

> Cùng một prompt, việc gom các shape cùng family có giảm sai số bbox một cách ổn
> định so với sheet chín loại trộn lẫn hay không?

## 11. Không làm

- Không dùng bản vuông v12 làm baseline.
- Không coi guide AI vẽ ra là tọa độ thật.
- Không suy safe zone production từ mặt tím AI.
- Không scale X/Y độc lập.
- Không nói v15 đã pixel-perfect.
- Không chạy `prepare-nine-element-figma.py` rồi tưởng nó đã gen ảnh mới; script
  chỉ xử lý file v15 đang có.
- Không dùng manifest 16 ô từ `sprite-sheet-fairy-gray-safe-v5` để export v15.
- Không chuyển sang API/CLI imagegen nếu người dùng chưa yêu cầu; spike này dùng
  built-in tool.
- Không sửa hoặc xoá các thay đổi unrelated trong worktree.

## 12. Trạng thái Git và lưu trữ

Tài liệu handoff này nằm trong `kit-gen/docs/` và được Git theo dõi khi commit.
Tuy nhiên, thư mục `kit-gen/experiments/` đang bị `.gitignore`. Toàn bộ prompt,
script, contract, output và manifest của spike chỉ tồn tại trong shared workspace,
không tự đi theo commit/push. Nếu cần bàn giao sang máy khác, phải có quyết định
rõ về việc force-add artifact nào hoặc chuyển các script cần giữ sang vị trí tracked.

Worktree hiện có:

- Thay đổi liên quan spike, tracked:
  - `kit-gen/figma-export/copy-sprite-images.mjs`.
- Thay đổi unrelated của người dùng, không được đụng tới:
  - `surveys/manifest.json`;
  - thư mục brief VCB mới;
  - `authoring/vcb-brief-intake-2026.mjs`;
  - `surveys/vcb-brief-intake-2026.json`.

`git diff --check` đã sạch tại thời điểm viết handoff.

## 13. Checklist một vòng test hoàn chỉnh

```text
[ ] Regenerate/inspect contract nếu contract thay đổi
[ ] View contract và style ref trước khi gọi imagegen
[ ] Gọi built-in imagegen với contract trước, style ref sau
[ ] Lưu shot mới vào workspace bằng filename versioned
[ ] Xác nhận output 1536×1024
[ ] Chạy validator bbox
[ ] Ghi mean/worst và lỗi theo cell
[ ] Chỉ khi cần test Figma: prepare PNG + manifest
[ ] Chạy clipboard exporter
[ ] Paste vào Figma, kiểm frame size, IMG node và Clip content OFF
[ ] Không kết luận từ cảm giác nếu chưa có phép đo
```
