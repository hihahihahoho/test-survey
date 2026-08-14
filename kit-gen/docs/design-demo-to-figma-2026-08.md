# Thiết kế: Demo HTML → bắn cả màn hình sang Figma (backlog #21)

> Ngày: 2026-08-14
> Loại tài liệu: **thiết kế** — chưa viết một dòng code nào
> Trạng thái: chờ chủ sản phẩm trả lời 3 câu ở §11 trước khi vào lát 1
> Nhánh hiện tại: `feat/kitgen-local-runtime`
> Phạm vi: khảo sát bằng cách **đọc code thật** (mọi khẳng định có `file:dòng`), rồi đề
> xuất kiến trúc + thứ tự làm. Không sửa file nào ngoài chính tài liệu này.
> Đọc kèm: `docs/PRODUCT-SITEMAP.md` §12 và mục 2026-08-14 · `docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md` §3.3 · `docs/BACKLOG.md` mục 19 và 21 · `webapp/src/vendor/figma-h2d/README.md`

**Ý tưởng gốc, nguyên văn chủ sản phẩm:** *"dùng cái capture để về sau sẽ có demo html để
bắn ra figma chuẩn"* — skeleton đã biết ô nào ở đâu, asset đã cắt chuẩn hitbox ⇒ webapp
dựng một trang demo HTML thật, bấm một nút ra nguyên màn game trong Figma, mỗi thành phần
một node sửa được.

---

## 1. Tóm tắt cho người bận — ba câu

**① Việc này đã từng chạy được rồi.** `kit-gen/screens.html` là một prototype ĐẦY ĐỦ của
đúng feature #21: 4 màn game lắp từ asset đã cắt, nút *"📋 Copy CẢ 4 MÀN ra Figma"*, gọi
thẳng `figmaH2D.writeFigmaClipboard` (`screens.html:43`, `:255-266`). Không phải làm lại
từ số không — phải **port nó vào webapp và sửa 3 chỗ nó làm sai**.

**② Cái duy nhất còn thiếu là DỮ LIỆU BỐ CỤC, và nó không tồn tại ở bất kỳ đâu.** Toàn bộ
chuỗi skeleton (`styles.json` → contract → `slice.py` → `kits/manifest.json`) **không có
một trường `x`/`y`/`screen`/`z` nào**. Vị trí ô trên sheet suy ra từ *chỉ số mảng*
(`skeleton.py:106` `r, c = divmod(i, cols)`), và đó là vị trí trên **tấm gen ảnh**, không
liên quan gì tới vị trí trên **màn game**. `screens.html:154-226` phải bịa 100% toạ độ
bằng tay. ⇒ Feature #21 = **thêm một lớp dữ liệu mới**, không phải đọc lớp có sẵn.

**③ Encoder chở được cây lồng nhau và text node, nhưng có một cái bẫy chết người:
`border-image` (đường 9-slice của prototype) KHÔNG được nhúng ảnh vào payload** —
`ImageCollector.collectFor` chỉ quét `styles.backgroundImage`, không quét
`borderImageSource` (`figma-h2d.global.js:289-296`). Dán ra Figma là panel/nút **rỗng**.
Đây là lỗi im lặng, phải thiết kế để tránh ngay từ lát 1.

---

## 2. Cái đã có sẵn — prototype `screens.html`

`/Users/tungnt2/Documents/work/survey/kit-gen/screens.html` (281 dòng). Runbook xếp nó
vào "prototype, không phải app production" (`docs/DEVELOPMENT-AND-RELEASE-RUNBOOK.md:39`).

| Bộ phận | Dòng | Nó làm gì |
|---|---|---|
| Khung màn | `:26-28` | `.screen { width:400px; height:600px; overflow:hidden }`, nền `<img class="bg">` `object-fit:cover` |
| Đặt element | `:70-102` | `put(scr, name, {x, y, bw/bh/w/h, z, txt, nine})` — `x,y` = **% của khung**, trỏ vào **tâm SAFE ZONE** |
| Quy đổi safe zone | `:62-67` | `safeOf(a)` = `safe[0..1] − content_at[0..1]` ⇒ khung thân trong hệ toạ độ ảnh `tight/` |
| Bù lệch tâm | `:78-80` | `dx,dy` để tâm THÂN (không phải tâm bbox) rơi đúng `(x,y)` — decor tràn không xô layout |
| 9-slice | `:86-90` | `border-image: url(...) t r b l fill stretch` ⚠️ **đường hỏng, xem §4.4** |
| Text | `:94-100`, `:135-146` | DOM overlay `<div class="tx">` / `.free` |
| Mực tự động | `:104-133` | `lumOf()` đo độ sáng asset qua canvas ⇒ chữ tự chọn đen/trắng |
| 4 màn | `:154-231` | `scrHome` · `scrBoard` · `scrGift` · `scrEnvelope`, toạ độ hardcode |
| Copy | `:255-263` | `captureElement(scr)` cho từng màn ⇒ `writeFigmaClipboard(docs)` — **nhiều doc một lần** |

### 2.1 Ba chỗ prototype làm sai (phải sửa khi port)

1. **Tên màn bị mất.** `screens.html:259` gọi `captureElement(scr, { name: \`${KIT} · ${name}\` })`
   — nhưng `capture()` chỉ đọc `assertLayoutValid`, `skipRemoteAssetSerialization`,
   `timeoutSignal` (`figma-h2d.global.js:1172-1177`). Khoá `name` **bị bỏ qua hoàn toàn**.
   Tên node phải đi qua `aria-label` (§4.2), đúng như `copy-sprite-images.mjs:88` và
   `figma-node.ts:268` đang làm.
2. **9-slice bằng `border-image` không mang được ảnh** (§4.4).
3. **Khung element không phải hitbox.** `put()` cho div bằng cỡ **content bbox** rồi lấy
   `margin` kéo lại (`screens.html:75-85`). Hợp đồng §3.3 của repo lại nói frame **phải
   đúng safe zone**, ảnh đặt lệch âm (`docs/PRODUCT-SITEMAP.md:346-351`). Chủ sản phẩm
   cũng nói rõ *"mỗi element một frame safe-zone như cách dán lẻ"*. ⇒ dùng công thức của
   `figma-node.ts:198-215`, bỏ công thức của prototype.

---

## 3. Khảo sát nguồn dữ liệu

### 3.1 Nguồn layout — **không tồn tại**

Kiểm cả bốn tầng:

| Tầng | File:dòng | Có toạ độ màn không |
|---|---|---|
| Contract nguồn | `styles.json:12-22` — `{file, vi, spec, skel:{shape,w,h,slice9}}` | ✗ |
| Đè theo dự án | `webapp/src/features/workflow-v4/lib/model.ts:93` — `KitElementSkel = {w?, h?, matte?}` | ✗ |
| Schema đầy đủ | `webapp/src/lib/types/contract.ts:88-117` — `shape·w·h·slice9·free·matte·anchor·pose·plain` | ✗ |
| Sinh contract | `.../kitset-to-contract.ts:226-228` — `toComponent()` trả đúng 4 khoá | ✗ |
| Ảnh skeleton | `skeleton.py:106` `r,c = divmod(i, cols)`; `skeleton.html:44`; `slice.py:867-871` | ✗ (vị trí = chỉ số mảng) |
| Manifest cắt | `kits/manifest.json` — `canvas·cell·bleed·content·content_at·safe·slice9` | ✗ (toạ độ **trong ảnh ô**) |

`styles.json:2` nói thẳng: *"Thứ tự trong components = thứ tự ô row-major"*. `w`/`h` là
**phân số của kích thước Ô**, và element luôn bị **căn giữa ô** cứng (`skeleton.py:113-115`).
Bậc tự do vị trí duy nhất là `anchor:"bottom"`.

**Cái gần "màn" nhất** là id sheet do heuristic sinh ra — `nen` / `popup` / `ui` / `dao-cu`
(`kitset-to-contract.ts:721, 735, 757, 779`), phân loại bằng `skel.shape === "full"`
(`:702-704`) và **regex trên tên file** `/popup|modal|panel|ribbon/` (`:391`). Đó là phân
loại **để xếp tấm gen ảnh**, không phải "ô này thuộc màn Home". Một cái nền `nen` và một
cái nút `ui` không hề biết chúng cùng màn.

Gợi ý bố cục duy nhất nằm trong **văn xuôi tiếng Anh của prompt**, ví dụ `styles.json:486`
*"podium area in the lower half… clear empty upper-middle area reserved for a title"* —
người đọc được, máy không parse được.

> **Hệ quả thiết kế:** feature #21 phải **định nghĩa và ship lớp `ScreenSpec` mới**.
> Không có đường tắt.

### 3.2 Cái CÓ sẵn và đủ dùng — hình học asset

`GET /api/projects/:id/kit` (`agent/routes/files.mjs:43`) đọc `<projectDir>/kits/manifest.json`
(`:48`), liệt kê `.png` (`:58-63`), đo cỡ pixel thật bằng `imageSize` (`:64-66`), khớp meta
bằng **tên cơ sở đã cắt `.png`** (`:72-75`), rồi phát ra mỗi file một bản ghi (`:76-103`):

| Trường | Đơn vị / ý nghĩa | Dùng cho demo |
|---|---|---|
| `safe` `[x,y,w,h]` | px trong hệ toạ độ **canvas của ô** — hitbox hợp đồng | **kích thước + gốc frame** |
| `contentAt` `[x,y]` | gốc ruột đã crop trong canvas | offset ảnh (thường âm) |
| `content` `[w,h]` | cỡ ruột = cỡ file `tight/*.png` | cỡ ảnh |
| `canvas` `[w,h]` | cell + 2×bleed = cỡ file `<file>.png` | công thức thứ hai |
| `w`,`h` | **px thật đọc từ header PNG** | trọng tài chọn công thức |
| `slice9` (manifest) | `[l,t,r,b]` insets | co giãn panel — ⚠️ §4.4 |
| `blend` | `"screen"` cho ô glow | §7 |
| `sheet` | id sheet | lọc / gợi ý vai trò |

Công thức đã đối chiếu 6/6 với node thật trong Figma (`figma-node.ts:12-20`, `:198-215`):

```
frame.w = safe.w × scale          image.x = (origin.x − safe.x) × scale   ← thường âm
frame.h = safe.h × scale          image.y = (origin.y − safe.y) × scale
                                  image.w/h = pixels × scale
clipsContent = false
```

`scale` từ `features/kit/lib/export-scale.ts:60-62`: mascot `1`, còn lại `0.5`.

**Khoá map ô skeleton ↔ asset: `component.file`** (chuỗi `variant → sheet.id →
component.file`). `slice.py:1129/1139` đặt tên file cắt ra **đúng bằng** `component.file`;
`result-copy.ts:56-68` khớp ngược lại bằng tên. `cellIndex` mà API trả về **luôn `null`**
vì `slice.py:1149` không ghi `idx` vào manifest (`files.mjs:84`). Mọi so khớp phải strip
tiền tố `tight/` và đuôi `.png`.

**Thiếu asset thì vẽ gì:** đã có sẵn 4 lớp placeholder, tái dùng được —
`CellGrid.tsx:263-271` rơi về `<Silhouette skel>` (khung xương SVG),
`MatrixTab.tsx:146-176` khung nét đứt + "chưa có", `KitImage.tsx:52-58` 5 trạng thái tải,
`figma-board.ts:229-236` khung nét đứt xám. **Với màn demo, quy tắc phải là: ô thiếu asset
thì BỎ QUA, không vẽ placeholder** — prototype đã chọn đúng (`screens.html:72`
`if (!a) return null`), vì một khung nét đứt dán vào Figma là rác, không phải thông tin.

### 3.3 URL ảnh — bắt buộc đi qua object URL

`<img src>` trỏ thẳng agent trả **403**: `PUBLIC_PATHS` không gồm `/api/projects/*`, đo và
ghi ở `features/kit/lib/image-source.ts:1-29`. Ảnh phải tải qua transport (header
`X-KitGen-Client`) rồi dựng `blob:` object URL (`image-source.ts:64-69`, `:158` cho bản đầy đủ).

Điều này **hợp với encoder**: `isRemoteUrl` trả `false` cho `blob:`
(`figma-h2d.global.js:213`) ⇒ ảnh luôn được `fetch()` lại và nhúng thật. Đường copy một ô
đang chạy chính là bằng chứng (`CutAssetGrid.tsx:268-290` → `loadFull` → `copyAssetAsFigmaNode`).

⚠️ Màn demo phải dùng `loadFull`, **không** `loadThumb` — thumbnail bị ép về `?w=256`
(`image-source.ts:152-153`) và sẽ dán ra Figma một màn mờ.

---

## 4. Encoder `figma-h2d` — ĐO ĐƯỢC GÌ, GIỚI HẠN THẬT

Đọc bundle `webapp/src/vendor/figma-h2d/figma-h2d.global.js` (1319 dòng, **không** minify).
Mọi mục dưới đây là đọc code, không phải suy đoán.

### 4.1 Cây lồng nhau — **chở được, không giới hạn độ sâu** ✅

`walkElement` đệ quy thẳng vào `el.childNodes` (`:1094`, qua `walkChildren:1057-1064`), có
cả shadow DOM (`:1091-1092`) và slot (`:1089-1090`). Node phát ra giữ nguyên `childNodes`
(`:1104-1116`). Không có bộ đếm độ sâu, không có cắt bớt. `screens.html` đã dựa vào chính
điều này: nó chụp cả `.screen` làm MỘT document.

Bị **bỏ** khỏi cây: `display:none` (`:1073`), `SKIP_TAGS = HEAD/SCRIPT/STYLE/NOSCRIPT`
(`:1030`), `<script>` và `[data-h2d-ignore="true"]` (`:903-905`). ⇒ có sẵn đường khai báo
"phần này chỉ để xem, đừng bắn sang Figma".

### 4.2 Tên node — chỉ đến từ `aria-*` và một allowlist ✅⚠️

`pickAttributes` (`:906-919`) giữ **duy nhất**: `ATTR_ALLOWLIST` (`:538` — `alt, checked,
currentSrc, disabled, for, href, id, multiple, placeholder, poster, readonly, rel,
required, role, selected, target, title, type, value`) **cộng mọi thuộc tính bắt đầu bằng
`aria-`** (`:910`).

- `data-name` **KHÔNG** được chở — nó còn bị loại tường minh khỏi marker
  (`KG_MARKER_SKIP`, `:920`).
- `data-slot` sinh `node.owningReactComponent = "kg:<slot>|…"` (`:921-942`, `:1118-1119`) —
  đây là cầu nối component của thiết kế hệ thống, **không phải** tên frame.
- ⇒ **Tên frame = `aria-label`.** Đúng thứ `copy-sprite-images.mjs:88` và
  `figma-node.ts:268` đang dùng. Prototype `screens.html:259` truyền `{name}` vào
  `captureElement` là vô hiệu (§2.1).

### 4.3 Text node — **chở được, có font** ✅

Text thật ra node riêng `NODE_TYPE.TEXT` kèm `text`, `rect`, `lineCount`
(`walkText:1049-1055`, `NODE_TYPE:881`). Các text node liền kề được gộp thành một run
(`groupChildren:1031-1048`). `FontCollector` đo và phát ra danh sách font
(`:94-207`, `:1187`), rồi `rewriteEmittedFontFamilies` viết lại family đã giải
(`:1219-1231`). `::before`/`::after` cũng ra node (`walkPseudo:977-1029`).

⇒ Chữ trong màn demo ("CHƠI NGAY", "1.250 ⭐", tên người chơi) sẽ sang Figma thành **text
node sửa được**, không phải ảnh. Đây là giá trị lớn nhất của feature so với đường bitmap.

⚠️ Font phải là font máy chủ sản phẩm có. Prototype dùng `system-ui` (`screens.html:16`);
Figma sẽ thay bằng font gần nhất và **layout chữ sẽ xê dịch**. Rủi ro R5.

### 4.4 ⛔ `border-image` — style chở được nhưng **ẢNH THÌ KHÔNG**

Đây là phát hiện quan trọng nhất của khảo sát.

```js
// figma-h2d.global.js:289-296
collectFor(el, styles) {
  if (el instanceof HTMLImageElement) this.addImage(el.currentSrc);
  if (el instanceof HTMLVideoElement && el.poster) this.addImage(el.poster);
  const bg = styles.backgroundImage;                       // ← CHỈ backgroundImage
  if (bg) { for (const m of bg.matchAll(/url\("(.*?)"\)/g)) this.addImage(m[1]); }
}
```

Trong khi đó `borderImageSource` **có** trong `STYLE_DEFAULTS` (`:338`) ⇒ chuỗi
`url("blob:…")` đi vào `node.styles` bình thường. Kết quả: payload mang một URL mà Figma
không giải được, còn `assets` thì **không có blob nào cho nó**.

**Hậu quả:** mọi element `nine: true` của `screens.html:86-90` (panel BXH, hàng xếp hạng,
nút pill co giãn, board panel) dán ra Figma là **hình rỗng** — và **không có gì báo lỗi**:
`assertDocShape` chỉ kiểm `assets` nào `blob === null` (`figma-node.ts:295-298`), mà ở đây
asset còn không được tạo ra.

**Ba đường thoát, xếp theo mức rủi ro:**

| Đường | Cách làm | Đánh giá |
|---|---|---|
| **A. Không co giãn** (khuyến nghị lát 1) | Element dùng đúng cỡ safe zone × scale, `<img>` thật | 0 rủi ro, đúng hợp đồng §3.3, nhưng panel không ôm được nội dung |
| **B. 9 mảnh `background-image`** | Chia panel thành 9 div, mỗi div `background-image:url()` + `background-position/size` | `backgroundImage` **có** được quét (`:292-295`) ⇒ ảnh nhúng được. Đổi lại: 1 panel = 9 node trong Figma |
| **C. Rasterize sang `<canvas>`** | Vẽ 9-slice lên canvas; `walkElement:1087-1088` gọi `images.addCanvas(el)` ⇒ blob webp thật (`:283-287`, `:224-231`) | 1 node đẹp, ảnh chắc chắn nhúng. **Chưa đo** Figma dựng `placeholderUrl` ra sao ⇒ rủi ro R3 |

**Không** sửa bundle: `__tests__/vendor-integrity.test.ts` băm 49 115 byte đầu, sai một byte
là test đỏ (`vendor/figma-h2d/README.md`).

### 4.5 `overflow` và nền frame

- `overflow` mặc định `"visible"` (`:429`) ⇒ giá trị mặc định **không** được phát ra; chỉ
  khi đặt `hidden` mới có khoá. Prototype đặt `overflow:hidden` trên `.screen`
  (`screens.html:26`) ⇒ frame màn sẽ có **Clip content = ON** — **đúng ý** cho một màn game.
- ⚠️ Nhưng `assertDocShape` hiện **ném** khi thấy `overflow === "hidden"`
  (`figma-node.ts:294`, "sai hợp đồng §3.3"). Luật đó đúng cho **ô lẻ**, sai cho **màn**.
  ⇒ đường demo cần **hàm assert riêng**, không tái dùng `assertDocShape`.
- `backgroundColor` mặc định `rgba(0,0,0,0)` (`:322`) ⇒ đặt màu nền cho frame màn là chở
  được. Đây cũng là **thuốc thử cho rủi ro flatten** (§4.7).

### 4.6 Nhiều document một lần — **chở được, và giữ đúng vị trí** ✅

`toFigmaClipboardHtml(docs, …)` nhận **mảng** doc (`:1286-1296`), nối thành `[doc,doc,…]`
rồi base64. `copy-sprite-images.mjs` và `screens.html:255-260` đều dùng dạng nhiều doc.

Quan trọng: với root (không có `parentInverse`, không có `localMatrix`), `computeRect` trả
thẳng **toạ độ viewport tuyệt đối** `bcr.x/bcr.y` (`:858-861`). ⇒ **N document giữ nguyên
vị trí tương đối của chúng trên trang.** Đây chính là **phương án lùi B** khi Figma làm
phẳng cây lồng nhau (§4.7).

### 4.7 ⚠️ Rủi ro lớn nhất: Figma **làm phẳng wrapper trong suốt**

Không nằm trong bundle — đây là **hành vi bên nhận đã quan sát được**, ghi ở đầu
`figma-export/copy-sprite-images.mjs:4-7`:

> *"Figma flatten wrapper trong suốt khi nó nằm bên trong một board. Vì vậy mỗi safe frame
> phải là ROOT của một H2D document"*

Chính vì thế `copy-sprite-images.mjs` bỏ hẳn board và bắn 1 doc / 1 frame. Nhưng feature
#21 **cần** cây lồng nhau: màn là board, các safe-frame nằm bên trong — **đúng cái ca đã
từng bị làm phẳng**. Nếu hành vi đó lặp lại thì lời hứa *"mỗi thành phần là node riêng,
sửa được từng cái"* không giữ được.

Cách đo và hai nhánh xử lý: xem R1 ở §9.

### 4.8 Bảng giới hạn số — đo thật

| Giới hạn | Số | Nguồn |
|---|---|---|
| Timeout cả lượt duyệt cây | **10 s** | `DEFAULT_TIMEOUT_MS = 1e4` (`:884`, dùng ở `:1177`) |
| Timeout tải mỗi ảnh | **8 s** | `FETCH_TIMEOUT_MS = 8e3` (`:210`, `:250-262`) |
| Số khoá style theo dõi | **157** | `STYLE_DEFAULTS` (`:313-472`) |
| Trùng URL ảnh | **gộp làm một** | `addImage` bỏ qua URL đã có (`:279`) |
| Ảnh trong payload | **base64 hai lần** | blob → data URL (`serializeDocument:1272`), rồi cả `docArray` → base64 (`:1292`) |
| Kiểu blob bắt buộc | `{base64Blob, type}` | `:1266-1272` — trả chuỗi trần làm **hỏng cả lượt dán** |
| Ảnh tải hỏng | vào `assets[k].error`, doc vẫn "hợp lệ" | `:275`, `:280` — nên `assertDocShape` phải kiểm (`figma-node.ts:295-298`) |
| AVIF/HEIF | tự chuyển webp | `UNSUPPORTED_MIME` (`:209`, `:233-249`) |
| DOM phải có layout thật | `body` rect ≠ 0 | `assertLayout` (`:1131-1136`, `:1172`) |

**Ngân sách payload — đo trên kit `ipay` thật, đúng danh sách asset của `scrHome`:**

```
25-bg-home        3207.0 KB      ← nền chiếm 91%
10-popup-ribbon    111.6 KB
04-btn-circle       89.5 KB
pose-taxi-wave      57.8 KB
50-counter-pill     57.5 KB
01-btn-pill-red     49.0 KB
07-progress-track   28.2 KB
08-progress-fill    14.5 KB
─────────────────────────────
PNG thô            3.53 MB
+ base64 lần 1     4.71 MB   (data URL trong assets)
+ base64 lần 2     6.28 MB   ← đây là cỡ chuỗi HTML ghi vào clipboard
```

Một màn ≈ **6.3 MB clipboard**. Bốn màn một lượt ≈ **25 MB** (nền dùng chung được gộp nhờ
dedup `:279`, nên thực tế thấp hơn — nhưng vẫn cỡ chục MB). Rủi ro R2.

---

## 5. Kiến trúc dữ liệu đề xuất

```text
① NGUỒN — thuần data
   ScreenSpec (MỚI, tĩnh trong repo)   toạ độ % của khung màn
   + KitFile[]  ← GET /api/projects/:id/kit   safe·contentAt·content·canvas·blend
   + blob URL   ← loadFull()                  object URL, KHÔNG phải <img src>
        ↓
② SCENE GRAPH — HÀM THUẦN, test bằng số thật, không cần trình duyệt
   resolveScene(spec, files, poseFiles, char)
     ⋈ khớp bằng component.file        ⋈ scaleOf() 1 | 0.5
     → ResolvedLayer[]: left·top·frame.w/h·image.x/y/w/h·blend  (px tuyệt đối)
     → missing[]  ô kit không có       → glowFiles[]  ô cần nhắc blend
        ↓
③ DOM — sân khấu tàng hình (position:fixed; opacity:0)
   .demo-screen[aria-label]            ← ROOT của document, overflow:hidden
     └── .safe-frame[aria-label]       ← FRAME = HITBOX, left/top tính sẵn
           ├── img                     ← offset ÂM, max-width:none
           └── div                     ← text node
   LUẬT: 0 transform · 0 border-image · 0 display:none
        ↓
④ ENCODER — bên thứ ba, mọi lỗi NÉM ra ngoài
   captureElement() → H2DDocument → assertSceneDoc() → toFigmaClipboardHtml()
   1 document (nested)  hoặc  N+1 document (flat)   ← công tắc, xem R1
```

Ranh giới sao chép đúng `figma-node.ts`: phần ① ② là **hàm thuần, test được bằng số thật
không cần trình duyệt**; phần ③ ④ chạm DOM và **ném mọi lỗi ra ngoài** để nơi gọi rơi về
đường lùi và **nói rõ là đang dùng đường lùi**.

### 5.1 ① `ScreenSpec` — lớp dữ liệu MỚI

Đơn vị toạ độ: **% của khung màn**, trỏ vào **tâm safe zone** — giữ đúng quy ước prototype
(`screens.html:68-69`) vì nó bền với việc đổi cỡ màn và với việc asset đổi lượng decor.

```ts
/** Một màn demo. Toạ độ % ⇒ đổi khung 400×600 → 390×844 không phải sửa spec. */
interface ScreenSpec {
  id: string;                    // "home" | "board" | "gift" | "envelope"
  name: string;                  // "Màn HOME" — thành aria-label ⇒ TÊN FRAME (§4.2)
  size: { w: number; h: number };// 400×600 như prototype
  background?: string;           // component.file của ô shape:"full"
  dim?: boolean;                 // lớp tối đè nền (popup)
  nodes: readonly ScreenNode[];
}

interface ScreenNode {
  file: string;                  // KHOÁ MAP = component.file (§3.2), không đuôi .png
  x: number; y: number;          // % khung, tâm SAFE ZONE
  bw?: number; bh?: number;      // ép cỡ THÂN (px) — giữ tỉ lệ; ưu tiên hơn w/h
  z?: number;
  text?: { value: string; css?: string };
  role?: "pose";                 // ô mascot: file thật là pose-<char>-<pose>
}
```

**Nguồn của spec ở lát 1: một file tĩnh trong repo**, chép nguyên 4 màn của
`screens.html:154-226`. Điều này chỉ chạy được vì **tên file là từ vựng có kiểm soát**:
`element-lib-v2.json` khai 42 element với `file` cố định (`01-btn-pill-red`, `25-bg-home`,
`09-popup-panel-short`…), và `slice.py:1129` đặt tên ảnh cắt ra đúng bằng tên đó. ⇒ spec
viết một lần dùng được cho **mọi kit theo thư viện chuẩn**.

Ô nào kit không có ⇒ **bỏ qua node đó**, màn vẫn dựng (`screens.html:72`). Màn nào mất nền
⇒ **ẩn hẳn màn**, không dán một khung trống.

### 5.2 ② `ResolvedScene` — hàm thuần, nơi mọi con số được chốt

```ts
resolveScene(spec: ScreenSpec, files: KitFile[], poseFiles: Set<string>, char: string)
  → { name, size, layers: ResolvedLayer[], missing: string[] }
```

Mỗi `ResolvedLayer` **tái dùng nguyên `buildFigmaNodeForAsset`** (`figma-node.ts:198-215`)
để lấy `frame`/`image`/`clipsContent`/`blend`, rồi bọc thêm hai số vị trí:

```
layerScale = bw / safe.w            (ép cỡ thân; không có bw thì = 1)
frame.left = x% × size.w − frame.w × layerScale / 2
frame.top  = y% × size.h − frame.h × layerScale / 2
```

Vì frame **là** safe zone, phép "bù lệch tâm" `dx/dy` của prototype (`screens.html:78-80`)
**biến mất** — tâm frame chính là tâm thân. Đây là lý do kỹ thuật để bỏ công thức prototype
và theo hợp đồng §3.3: nó vừa đúng hơn, vừa đơn giản hơn.

`missing[]` trả về để UI nói được *"kit này thiếu 3 ô, màn vẫn dựng"* — không im lặng.

### 5.3 ③ DOM — ba luật cứng

```html
<div id="…stage" aria-hidden="true">              <!-- sân khấu: fixed, opacity 0 -->
  <div class="demo-screen" aria-label="Màn HOME"  <!-- ROOT của document -->
       style="position:relative;width:400px;height:600px;overflow:hidden;background:#0d0f16">
    <img alt="Nền · 25-bg-home" style="position:absolute;left:0;top:0;width:…;height:…">
    <div class="safe-frame" aria-label="01-btn-pill-red"      <!-- FRAME = HITBOX -->
         style="position:absolute;left:75px;top:534px;width:250px;height:85px">
      <img alt="Image · 01-btn-pill-red"
           style="position:absolute;left:-13px;top:-9px;width:…;height:…;max-width:none">
      <div aria-label="Nhãn · CHƠI NGAY" style="position:absolute;…">CHƠI NGAY</div>
    </div>
    …
  </div>
</div>
```

1. **Không `transform`.** `transform:translate(-50%,-50%)` của prototype (`screens.html:30`)
   kích hoạt nhánh ma trận của encoder: `computeLocalMatrix` (`:775-784`) →
   `centerSolve` + `buildQuad` (`:827-857`) ⇒ node mang thêm `rect.quad`. Không cần thiết,
   và là một nhánh chưa ai đo với Figma. Trừ đi bằng cách tính `left/top` sẵn ở tầng ②.
2. **Không `border-image`** (§4.4).
3. **Sân khấu tàng hình theo đúng `mountStage`** (`figma-node.ts:231-241`): `position:fixed;
   opacity:0` — **không** `display:none` (encoder ném, `:1073`/`:1131-1136`), **không**
   `visibility:hidden` (di truyền xuống con và bị chụp vào styles).

Cùng một hàm dựng DOM này phục vụ **cả bản xem trước trên màn hình lẫn bản đem chụp** —
một nguồn sự thật, không có chuyện "xem một đằng dán một nẻo".

### 5.4 ④ Encoder — API mới, KHÔNG tái dùng `copyAssetAsFigmaNode`

Trả lời thẳng câu hỏi trong đề bài: **cần API mới**, và lý do là kỹ thuật chứ không phải
thẩm mỹ.

| | `copyAssetAsFigmaNode` (có sẵn) | Đường demo (mới) |
|---|---|---|
| Chữ ký | `(asset: KitFile, imageUrl, kitMeta)` — **một ô** | cả một cảnh |
| Sân khấu | tự `mountStage` rồi `stage.remove()` (`:319-327`) | phải sống suốt lượt xem trước |
| Assert | `assertDocShape` **ném khi `overflow:hidden`** (`:294`) | màn **cần** clip ON (§4.5) |
| Số doc | luôn `[doc]` (`:323`) | 1 hoặc N tuỳ kết quả R1 |

**Tái dùng ở tầng dưới**, không ở tầng trên: `buildFigmaNodeForAsset`, `geometryOf`,
`FigmaNodeUnsupported`, `assetName`, `scaleOf` — tất cả đều đã export sẵn
(`figma-node.ts:57, 130, 152, 197`). Đó là chỗ nằm hết số học đã được đối chiếu 6/6 với
Figma; không được viết lại.

Hàm mới, đề xuất đặt cạnh nhau trong một module riêng:

```ts
export function buildSceneDom(scene: ResolvedScene, urls: Map<string,string>, stage): HTMLElement
export function assertSceneDoc(doc: H2DDocument, scene: ResolvedScene): void   // luật riêng, cho phép clip ON
export async function encodeScenes(scenes, mode: "nested" | "flat"): Promise<{html: string; docs: number}>
export async function copyScenesAsFigmaNodes(...): Promise<{screens: number; nodes: number}>
```

`mode` chính là công tắc cho hai nhánh của R1 (§9) — thiết kế sẵn, không phải sửa kiến trúc
sau khi đo.

---

## 6. Chỗ đặt UI

### 6.1 Bốn ràng buộc cứng, đọc trước khi bàn

**① Chủ sản phẩm đã bác thẳng kiểu "bày control ra mặt tiền"** — nguyên văn ghi ở
`docs/PRODUCT-SITEMAP.md:522`:

> *"SETTING SAO NÓ THÔ THẾ NÀY, KIỂU ĐỂ HẾT TRONG 1 CÁI POPUP THÔI, ĐỪNG LỘ RA NGOÀI"*

Luật rút ra và đang có hiệu lực (`PRODUCT-SITEMAP.md:528-536`): thẻ trong lưới chỉ còn tên
+ hình + tick; nút **Chi tiết** đè góc thẻ là **cửa DUY NHẤT để chỉnh** (`:531`); và luật
này **được khoá bằng test quét cả lưới, không đếm tay** —
`features/workflow-v4/__tests__/cell-background.test.tsx:75` khẳng định trong lưới không
tồn tại một nút control nào. Màn demo phải sinh ra ở phía "trong popup" của ranh giới này.

**② Không được thêm route mới.** `webapp/src/routeTree.ts:34-36` viết tường minh: *"§2.1 có
ĐÚNG 8 màn … Mọi thứ còn lại là overlay của 8 màn đó — không thêm route mới mà không sửa
spec trước"*, và `:28-32` giới hạn quyền sửa file cho engineer app-shell. Bài học đã đắt:
7/20 route hiện tại đã thoái hoá thành `Navigate` (`routes/p.$projectId.kit.tsx:10`,
`routes/k.$projectId.canvas.tsx:8`, …).

**③ Sidebar dự án đã chốt "đúng bốn nút"** (`PRODUCT-SITEMAP.md:576`; mảng thật ở
`features/project/ProjectScreen.tsx:75-79` — `images` · `skeleton` · `mascot`, cộng nút
"Cài đặt style" mở dialog ở `:339-349`). Thêm nút thứ 5 = **phải sửa spec trước**.

**④ Canvas là vùng đã đóng băng.** *"Đang phát triển", nút disabled, không điều hướng*
(`PRODUCT-SITEMAP.md:353-365`), route đã `Navigate` (`routes/k.$projectId.canvas.tsx:8`).
Feature #21 **không được** hồi sinh Canvas — đó là một cam kết khác.

### 6.2 ✅ Phương án CHÍNH — cửa ra thứ ba ở header "Ảnh đã tạo", mở dialog

Hai cửa ra `Tải .zip` và `Copy sang Figma` đã được chốt nằm ở **header trang "Ảnh đã tạo"**
(`PRODUCT-SITEMAP.md:495`, `:580`; code `features/project/sections/ImagesSection.tsx:113-114`
→ `features/workflow-v4/components/KitExits.tsx`). Màn demo là **cửa ra thứ ba**, đứng đúng
chỗ đó.

```text
Trang "Ảnh đã tạo"  (?section=images)
└── header
      [Tải .zip]  [Copy sang Figma]  [Xem màn demo]  [Tạo ảnh]
                                          ↓ mở dialog (không đổi URL, không đổi ?section)
      Dialog "Màn demo"
        ├── tab màn        Home · Bảng xếp hạng · Mở quà · Mở lì xì
        ├── chọn nhân vật  taxi ▾
        ├── vùng cuộn      khung 400×600 dựng bằng CHÍNH DOM sẽ đem chụp
        ├── dòng cảnh báo  "kit này thiếu 2 ô — màn vẫn dựng"
        └── DialogFooter   [Copy màn này sang Figma]  [Copy cả 4 màn]
```

**Vì sao đây là phương án chính:**

1. **Đúng nguyên văn "để hết trong 1 cái popup, đừng lộ ra ngoài"** (§6.1①). Cả tính năng
   là **một nút + một dialog**: không mục sidebar thứ 5 (§6.1③), không route mới (§6.1②),
   không khái niệm mới trong sitemap.
2. **Đúng chỗ về mặt luồng.** Ba nút cùng một điều kiện mở — `useKit(projectId)` có file
   (`KitExits.tsx:31-32`, `:72-73`) — và cùng một câu khoá *"Mở sau khi dự án có ảnh đã cắt"*.
3. **Có mẫu để chép nguyên.** Khung dialog: `features/workflow-v4/components/ItemDetail.tsx:22-50`
   (`DialogContent size="lg"` `:37` · `DialogBody` `:42` · `DialogFooter` thật, không phải
   thanh `sticky` `:46` — luật `PRODUCT-SITEMAP.md:503`). Cách gọi + xếp vùng:
   `features/workflow-v4/steps/KitsetStep.tsx:239-307`. Footer **do nơi gọi truyền vào**
   (`ItemDetail.tsx:13-21`) — hợp với việc dialog demo có 2 nút copy riêng.
4. **Không đụng file đang nóng.** Chỉ thêm 1 dòng vào `ImagesSection.tsx`; **không** phải
   sửa `ProjectScreen.tsx`, `routeTree.ts` hay `search-schemas.ts` — cả ba đều đang có agent
   khác làm việc hoặc bị khoá quyền sửa (§8).
5. **Đóng gói được rủi ro.** Payload ~6 MB và lượt encode vài giây nằm gọn trong dialog có
   nút Huỷ, không làm nghẽn trang chính.

Wording theo bảng §15 của sitemap (`PRODUCT-SITEMAP.md:388-401`): nhãn **"Xem màn demo"** —
không dùng "preview", "scene", "mockup", "element". Toast thành công: *"Đã copy 1 màn · 12
thành phần — dán vào Figma (Ctrl/Cmd+V)."*

### 6.3 ⚠️ Phương án PHỤ — đích sidebar thứ 5 `?section=demo`

Chỉ chọn nếu chủ sản phẩm muốn màn demo là **nơi làm việc** (kéo thả chỉnh bố cục, lưu spec
theo dự án) chứ không phải một cửa ra. Khi đó nó cần địa chỉ riêng để quay lại và chia sẻ,
và dialog không còn hợp.

Cơ chế thì đã có sẵn và **không cần route mới**: thêm giá trị vào `PROJECT_SECTIONS`
(`webapp/src/routes/search-schemas.ts:141`), thêm mục vào `ProjectScreen.tsx:75-79`, mount
một `features/project/sections/DemoSection.tsx`. Link cũ vẫn resolve nhờ
`LEGACY_PROJECT_SECTIONS` (`:142`) và `resolveProjectView()` (`:189-200`).

Đổi lại phải trả ba khoản: **sửa spec trước** vì `PRODUCT-SITEMAP.md:576` chốt "sidebar vẫn
đúng bốn nút"; đụng `ProjectScreen.tsx` đang nóng; và phải trả lời tiếp *"sửa bố cục có
phải buffer không?"* theo luật *"Sửa là buffer — lưu mới là lưu"* (`PRODUCT-SITEMAP.md:505-511`,
`autosave: false`).

> **Khuyến nghị:** làm phương án chính trước. Nếu dùng thật rồi chủ sản phẩm muốn chỉnh bố
> cục thì mới nâng lên phương án phụ — lúc đó tầng ① ② ③ đã có sẵn, chỉ đổi vỏ. **Nhưng
> nếu chủ sản phẩm biết trước là muốn chỉnh được, phải nói ngay** (câu hỏi ② ở §11): tầng ①
> khi đó phải là dữ liệu lưu theo dự án **ngay từ lát 1**.

### 6.4 ❌ Ba chỗ đã cân nhắc và loại

| Chỗ | Vì sao loại |
|---|---|
| Tab thứ tư trong `ManageSection` (`ProjectScreen.tsx:535-549`) | Phá bộ "3 tab" mà chủ sản phẩm đọc nguyên văn (`PRODUCT-SITEMAP.md:540`), và `:549` chốt "hai tab xem không có hàng nút" |
| `features/canvas/` | Vùng đã đóng băng, §6.1④ |
| `features/kit/KitScreen.tsx` | Route đã `Navigate` (`routes/p.$projectId.kit.tsx:10`); lưới ô đã cắt thật sự nằm ở `CutAssetGrid.tsx`, mount qua `ImagesSection.tsx:130` |

---

## 7. Giao với backlog #19 (blendMode qua clipboard)

Mục #19 đang chờ **chủ sản phẩm dán thử một ô glow** để biết Figma có nhận `mixBlendMode`
hay không (`docs/BACKLOG.md` mục 19). Thiết kế này **không được chờ kết quả đó**, nên có
nhánh cho cả hai:

| | #19 kết luận **Figma NHẬN** | #19 kết luận **Figma KHÔNG nhận** |
|---|---|---|
| Tầng ② | giữ nguyên `blend` từ `buildFigmaNodeForAsset` (`figma-node.ts:211`) | giữ nguyên — vẫn là việc miễn phí |
| Tầng ③ | `mix-blend-mode:screen` trên `<img>` như `renderSpec:277` | giữ, vô hại |
| UI | **không** toast nhắc tay | dialog demo hiện **một** dòng nhắc chung ở chân, kiểu *"Ô phát sáng cần đặt Screen/Linear Dodge bằng tay"*, kèm **danh sách tên ô glow trong màn** |
| `CutAssetGrid` | gỡ `remindGlowBlend` (`:197-200`) + `GLOW_FIGMA_HINT` (`blend.ts:39-40`) | giữ nguyên |

**Điểm cần chú ý:** đường copy một ô bắn toast cho **từng** ô (`CutAssetGrid.tsx:257`,
`:279`). Một màn có 3 ô glow mà bắn 3 toast là phiền. ⇒ tầng ② phải trả về
`glowFiles: string[]` để dialog gộp thành **một** dòng. Đây là việc phải làm dù #19 ngã
về phía nào, nên **không chặn lát nào**.

Ngoài ra `mix-blend-mode` trong một cây lồng nhau còn dính `isolation` — encoder chở được
(`:402`) và thí nghiệm C của `vendor/figma-h2d/README.md` đã thấy `"isolation":"isolate"`
vào payload. Nhưng blend **trong** một frame có nền (màn demo có nền!) khác hẳn blend của
một ô đứng lẻ trên nền trong suốt. ⇒ đây là **câu hỏi mới**, không phải câu hỏi của #19;
xếp vào R6.

---

## 8. File sẽ tạo / sửa khi code

⚠️ **Cảnh báo va chạm.** Tại thời điểm viết, `git status` cho thấy 5 agent khác đang sửa
song song, trong đó có đúng những file mà feature này muốn đụng:
`webapp/src/features/workflow-v4/lib/figma-node.ts`,
`webapp/src/features/workflow-v4/components/CutAssetGrid.tsx`,
`webapp/src/features/workflow-v4/lib/kitset-to-contract.ts`,
`webapp/src/features/project/ProjectScreen.tsx`,
`webapp/src/vendor/figma-h2d/README.md`.
⇒ **Thiết kế cố ý dồn gần hết vào file MỚI**, và chỉ đụng file cũ ở những chỗ thêm-thuần-tuý.

### Tạo mới

| File | Vai trò | Lát |
|---|---|---|
| `webapp/src/features/demo/lib/screen-spec.ts` | kiểu `ScreenSpec`/`ScreenNode` + hằng khung màn | 1 |
| `webapp/src/features/demo/data/screens.default.ts` | 4 màn chép từ `screens.html:154-226` | 1 |
| `webapp/src/features/demo/lib/resolve-scene.ts` | ② hàm thuần: spec ⋈ `KitFile[]` ⋈ scale → px | 1 |
| `webapp/src/features/demo/lib/scene-dom.ts` | ③ dựng DOM (dùng chung xem trước + chụp) | 1 |
| `webapp/src/features/demo/lib/scene-figma.ts` | ④ `assertSceneDoc` · `encodeScenes` · `copyScenesAsFigmaNodes` | 1 |
| `webapp/src/features/demo/components/DemoScreenDialog.tsx` | dialog + tab màn + chọn nhân vật + 2 nút copy | 2 |
| `webapp/src/features/demo/components/DemoScreenButton.tsx` | nút "Xem màn demo" cho header | 2 |
| `webapp/src/features/demo/index.ts` | bề mặt export | 1 |
| `webapp/src/features/demo/__tests__/resolve-scene.test.ts` | số học, fixture **kit thật** | 1 |
| `webapp/src/features/demo/__tests__/scene-dom.test.tsx` | jsdom: không `transform`, không `border-image`, `aria-label` đúng | 1 |
| `webapp/src/features/demo/__tests__/scene-figma.test.ts` | `assertSceneDoc`: clip ON hợp lệ, asset lỗi ⇒ ném | 1 |
| `webapp/tests/e2e/demo-screen.spec.ts` | Chromium thật: bấm copy ⇒ payload giải được, đủ N frame | 3 |

Đặt ở `features/demo/` mới, **không** nhét vào `workflow-v4/` (đang nóng) cũng không vào
`features/canvas/` (Canvas là cam kết "Đang phát triển", `PRODUCT-SITEMAP.md:353-365`).

### Sửa file có sẵn — tối thiểu

| File | Sửa gì | Rủi ro va chạm |
|---|---|---|
| `features/project/sections/ImagesSection.tsx:113-114` | thêm `<DemoScreenButton>` cạnh 2 nút cũ | thấp — 1 dòng |
| `features/workflow-v4/lib/figma-node.ts` | **chỉ export thêm** `mountStage` (đang private, `:231`) | **đang nóng** — nếu kẹt thì chép 10 dòng sang `scene-dom.ts` kèm chú thích chỉ nguồn |
| `features/kit/lib/blend.ts` | thêm hằng câu nhắc glow **dạng gộp nhiều ô** | thấp |
| `docs/PRODUCT-SITEMAP.md` | thêm mô tả nút "Xem màn demo" ở §7 | thấp |
| `docs/BACKLOG.md` | #21 chuyển sang "đang làm" + link tài liệu này | **đang nóng** |

### Không đụng

`webapp/src/vendor/figma-h2d/figma-h2d.global.js` — hash-locked. `agent/` — feature này
**100% client-side**, không route mới, không gọi thêm API nào ngoài `#41`/`#42` đã có.

---

## 9. Thứ tự làm — bốn lát mỏng

Nguyên tắc: **lát 1 phải paste được MỘT màn đơn giản ra Figma thật.** Mọi thứ khác xếp sau.

### Lát 1 — một màn, không co giãn, dán được (❗cột mốc "thấy được")

**Chọn màn Home** vì nó dùng ít element nhất và **không cần 9-slice nếu bỏ `nine:true`** —
tránh sạch cái bẫy §4.4.

- ① `ScreenSpec` + **duy nhất màn `home`**, chép toạ độ từ `screens.html:154-169`.
- ② `resolveScene` gọi `buildFigmaNodeForAsset` cho từng node; test bằng fixture manifest
  thật (theo đúng lối `figma-node.test.ts:1-18` — *"không dùng số bịa"*).
- ③ `buildSceneDom`: `left/top` tính sẵn, `<img>` thật, **không** `border-image`,
  **không** `transform`.
- ④ `encodeScenes(scenes, "nested")` — 1 document, root là `.demo-screen`.
- UI tối giản: nút tạm trong dialog, hai tab chưa cần.
- **Nghiệm thu: chủ sản phẩm bấm copy, Cmd+V vào Figma, thấy 1 frame "Màn HOME" chứa nền +
  6-7 frame con đúng vị trí.** Đây cũng chính là **phép đo cho R1** (§4.7) — nếu các frame
  con bị làm phẳng, ta biết ngay ở lát 1 chứ không phải ở lát 4.

### Lát 2 — bốn màn + chữ + dialog thật

- 3 màn còn lại (`scrBoard`/`scrGift`/`scrEnvelope`, `screens.html:171-226`), **vẫn tạm bỏ**
  các node cần co giãn.
- Text node (§4.3) + chọn nhân vật (`pose-<char>-<pose>`, `screens.html:151`).
- `DemoScreenDialog` + `DemoScreenButton` vào header (`ImagesSection.tsx:113-114`).
- Báo cáo `missing[]`: *"kit này thiếu 3 ô — màn vẫn dựng"*.
- Nút "Copy cả 4 màn" ⇒ `toFigmaClipboardHtml` nhiều doc (§4.6).

### Lát 3 — co giãn (giải bài 9-slice) + e2e

- Đo phương án **B (9 mảnh `background-image`)** và **C (canvas)** của §4.4 bằng thí nghiệm
  cô lập, đúng lối đã dùng cho #19 (bundle chạy trong Chromium thật, giải lại base64 —
  `vendor/figma-h2d/README.md` mục "Chở được gì"). Chốt một đường.
- Bật lại các node co giãn (board panel, rank row, nút pill).
- `webapp/tests/e2e/demo-screen.spec.ts`.

### Lát 4 — hoàn thiện

- Gộp nhắc glow một dòng (§7), đóng nhánh theo kết quả #19.
- Thanh tiến trình + Huỷ cho lượt copy nhiều màn (theo mẫu `BoardProgress`,
  `figma-board.ts` / `KitExits.tsx:70-95`).
- Cảnh báo ngưỡng payload (R2).
- Cập nhật `PRODUCT-SITEMAP.md` + `BACKLOG.md`.

---

## 10. Rủi ro và **cách đo từng cái**

| # | Rủi ro | Vì sao tin là có thật | Cách đo | Nhánh nếu xấu |
|---|---|---|---|---|
| **R1** | **Figma làm phẳng frame con trong board** ⇒ mất lời hứa "mỗi thành phần một node" | Hành vi đã quan sát, ghi ở `copy-sprite-images.mjs:4-7`; chính vì nó mà bản sprite phải bắn 1 doc/1 frame | **Lát 1 chính là phép đo.** Dán ra Figma, mở panel Layers, đếm: 1 frame màn chứa N frame con, hay chỉ còn N ảnh phẳng? | `mode:"flat"` (§5.4): bắn **N+1 document** — nền + mỗi element một doc. `computeRect:858-861` cho root toạ độ viewport tuyệt đối ⇒ **vị trí vẫn đúng**, chỉ mất một tầng nhóm. Người dùng tự Cmd+G. Kiến trúc đã chừa sẵn công tắc |
| **R2** | **Payload quá to** ⇒ clipboard từ chối / Figma treo | Đo thật: 1 màn `ipay` = **6.28 MB** chuỗi HTML (§4.8); 4 màn cỡ chục MB | Tăng dần: 1 màn → 2 → 4, đo `html.length` và bấm giờ Cmd+V | ① mặc định copy **một màn**, "cả 4 màn" là lựa chọn có cảnh báo cỡ; ② hạ `scale` nền riêng; ③ cắt nền theo khung màn trước khi nhúng (nền `3.2 MB` chiếm **91%** payload — đây là đòn bẩy lớn nhất) |
| **R3** | **9-slice: không đường nào chắc chắn** | §4.4 — `border-image` chắc chắn hỏng; B đúng cơ chế nhưng ra 9 node; C dùng `placeholderUrl`/`rasterized:` mà **chưa ai đo Figma dựng ra sao** | Thí nghiệm cô lập lát 3 + dán thật một panel | Lùi về **A (không co giãn)** — vẫn ra màn đúng, chỉ là panel không ôm khít nội dung. Đây là lý do A được chọn cho lát 1 |
| **R4** | **Ảnh không nhúng được** ⇒ Figma ra frame rỗng | Encoder **nuốt** lỗi tải vào `assets[k].error` và vẫn trả doc "hợp lệ" (`:275`, `:280`); `fetch` mỗi ảnh timeout 8 s (`:210`) | `assertSceneDoc` kiểm **mọi** asset `blob !== null` trước khi ghi clipboard — chép luật từ `figma-node.ts:295-298` | Ném, rơi về đường lùi, **nói rõ** ô nào hỏng. Không bao giờ báo "đã copy" khi chưa |
| **R5** | **Chữ xê dịch trong Figma** | Font đo bằng `FontCollector` trên máy người dùng (`:94-207`); Figma thay font gần nhất | Dán thử, so ảnh chụp màn demo với node Figma | Dùng font phổ thông; chấp nhận sai lệch và **nói trước** trong dialog. Không đáng chặn feature |
| **R6** | **`mix-blend-mode` trong cây có nền** khác với ô lẻ trên nền trong suốt | #19 mới đo ô **lẻ**; blend trong frame có nền dính `isolation` (`:402`) | Đo cùng lượt dán của R1: đặt một ô glow lên nền trong màn demo | Bỏ blend ở đường demo, giữ nhắc tay gộp một dòng (§7) |
| **R7** | **Va chạm với 5 agent đang sửa song song** | `git status`: `figma-node.ts`, `CutAssetGrid.tsx`, `ProjectScreen.tsx`, `BACKLOG.md` đều đang dirty | — | §8 đã dồn vào file mới; chỗ duy nhất phải đụng `figma-node.ts` là **export thêm** `mountStage`, kẹt thì chép 10 dòng kèm chú thích chỉ nguồn |
| **R8** | **Spec tĩnh không khớp kit không theo thư viện chuẩn** | Khoá map là `component.file` (§3.2); dự án tự chọn element có thể thiếu/đổi tên | Chạy `resolveScene` trên cả 4 kit `ipay/candy/tet/rnd` + kit blindtest, đếm `missing[]` | Bỏ node thiếu, ẩn màn mất nền, hiện số ô thiếu. Nếu thiếu quá nửa ⇒ ẩn cả nút "Xem màn demo" thay vì mở ra một màn thủng lỗ chỗ |

---

## 11. Câu hỏi cho chủ sản phẩm — đúng ba câu

Ba câu này **chỉ chủ sản phẩm trả lời được**; mọi thứ còn lại kỹ thuật tự quyết được.

### ① Bốn màn của `screens.html` có còn đúng nhu cầu không?

`Home · Bảng xếp hạng · Mở quà · Mở lì xì` (`screens.html:228-231`) là bộ màn viết từ hồi
prototype. Lát 1 sẽ chép nguyên bố cục đó. **Nếu bộ màn thật mà designer cần là bộ khác**
(ví dụ: Onboarding, Thể lệ, Hết lượt, Chia sẻ), nói ngay — viết thêm một `ScreenSpec` rẻ,
nhưng làm xong 4 màn sai rồi mới đổi thì phí một lát.

### ② Màn demo là **cửa ra** hay **nơi làm việc**?

- **Cửa ra** (§6.2): một nút cạnh `Tải .zip`, mở dialog, xem rồi copy. Bố cục cố định,
  không sửa được. Rẻ, không đụng sitemap.
- **Nơi làm việc** (§6.3): đích sidebar thứ 5, kéo thả chỉnh vị trí, lưu bố cục theo dự án.
  Đắt hơn nhiều lần, **phải sửa spec sidebar trước** (`PRODUCT-SITEMAP.md:576`) và phải trả
  lời tiếp câu "sửa bố cục có phải buffer không" (`:505-511`).

Thiết kế đang **giả định là cửa ra**. Nếu thật ra chủ sản phẩm muốn sửa được bố cục thì
tầng ① phải chuyển từ hằng số trong repo sang dữ liệu lưu theo dự án **ngay từ lát 1** —
đổi sau thì phải viết lại.

### ③ Khi Figma làm phẳng frame con (R1), chọn đường nào?

Nếu phép đo ở lát 1 cho kết quả xấu, có hai kết cục và **cả hai đều dùng được**:

- **(a) N+1 node phẳng** — mỗi thành phần vẫn là một node riêng, đúng vị trí, sửa được
  từng cái; chỉ **không** được gói trong một frame "Màn HOME". Người dùng tự Cmd+G.
- **(b) Một frame màn duy nhất** — gọn gàng nhưng bên trong là ảnh phẳng, **không sửa được
  từng thành phần**.

Ý tưởng gốc nhấn mạnh *"mỗi thành phần là node riêng, đúng hitbox, sửa được từng cái"* ⇒
đội kỹ thuật sẽ **mặc định chọn (a)**. Cần chủ sản phẩm xác nhận thứ tự ưu tiên này đúng,
vì nó đổi cách nút được đặt tên và cách toast nói.

---

## 12. Đã chốt / Chưa chốt

### Đã chốt — đọc code ra số, không phải ý kiến

- Skeleton **không** có toạ độ màn; feature #21 phải ship một lớp dữ liệu mới (§3.1).
- Khoá map ô ↔ asset là `component.file`; `cellIndex` luôn `null` (§3.2).
- Hình học frame/offset dùng lại `buildFigmaNodeForAsset`, không viết lại (§5.2).
- Encoder chở được cây lồng nhau và text node (§4.1, §4.3).
- `border-image` **không** nhúng được ảnh ⇒ cấm dùng (§4.4).
- Tên node chỉ đến từ `aria-label` (§4.2).
- Nhiều document giữ đúng vị trí tương đối (§4.6) ⇒ đường lùi R1 khả thi.
- Ảnh phải qua `loadFull` + object URL, không `<img src>` (§3.3).
- Chỗ đặt UI: cửa ra thứ ba ở header "Ảnh đã tạo" (§6.2).

### Chưa chốt — phải đo hoặc phải hỏi

- Figma có giữ frame con trong board không (R1) — **đo ở lát 1**.
- Đường 9-slice nào dùng được (R3) — **đo ở lát 3**.
- Ngưỡng payload thật của clipboard và Figma (R2) — **đo tăng dần**.
- `mix-blend-mode` trong cây có nền (R6) — **đo cùng lượt R1**.
- Bộ 4 màn có đúng nhu cầu không · demo là cửa ra hay nơi làm việc · ưu tiên khi R1 xấu —
  **ba câu ở §11, chỉ chủ sản phẩm trả lời được**.

---

## 13. Không làm

- **Không** sửa `webapp/src/vendor/figma-h2d/figma-h2d.global.js` — hash-locked 49 115 byte.
- **Không** thêm route mới (`routeTree.ts:34-36`).
- **Không** thêm nút thứ 5 vào sidebar dự án khi chưa sửa spec (`PRODUCT-SITEMAP.md:576`).
- **Không** hồi sinh `features/canvas/` — đang là cam kết "Đang phát triển".
- **Không** thêm route hay handler nào ở `agent/` — feature này 100% client-side.
- **Không** dùng `border-image`, `transform`, `display:none` trong DOM đem chụp (§5.3).
- **Không** dùng `loadThumb` cho màn demo — thumbnail bị ép `?w=256`.
- **Không** báo "đã copy" khi thật ra đã rơi về đường lùi — luật đã có ở
  `figma-node.ts:42-45` và `KitExits.tsx:99-100`.
- **Không** vẽ placeholder cho ô thiếu asset trong màn demo — bỏ qua node đó (§3.2).
- **Không** kết luận từ cảm giác nếu chưa có phép đo.

---

## 14. Checklist trước khi đóng lát 1

```text
[ ] resolveScene chạy trên fixture manifest THẬT, không số bịa (mẫu: figma-node.test.ts:1-18)
[ ] DOM đem chụp không chứa transform, border-image, display:none  (test quét DOM)
[ ] mọi .safe-frame có aria-label; tên frame trong payload đúng tên ô
[ ] assertSceneDoc: clip ON hợp lệ; asset blob === null ⇒ NÉM
[ ] chạy resolveScene trên cả 4 kit ipay/candy/tet/rnd, ghi lại missing[] từng kit
[ ] đo html.length của payload 1 màn, ghi con số vào doc này
[ ] CHỦ SP dán thật vào Figma và ĐẾM LAYER — đây là phép đo R1, không ai làm thay được
[ ] ghi kết quả R1 vào §10 rồi mới chọn mode "nested" hay "flat"
```

---

## 15. Phụ lục — trích dẫn gốc để tra ngược

| Khẳng định | Nguồn |
|---|---|
| Skeleton không có toạ độ; vị trí = chỉ số mảng | `skeleton.py:106`, `skeleton.html:44`, `slice.py:867-871`, `styles.json:2` |
| Contract chỉ có 4 khoá mỗi ô | `webapp/src/features/workflow-v4/lib/kitset-to-contract.ts:226-228` |
| `KitElementSkel` chỉ `w/h/matte` | `webapp/src/features/workflow-v4/lib/model.ts:93` |
| Phân loại sheet bằng regex tên file | `.../kitset-to-contract.ts:391`, `:702-704`, `:721-790` |
| `safe.w = skel.w × cell.w`, căn giữa ô | `slice.py:1069-1076`; `BLEED = 0.18` `slice.py:66` |
| Khoá map = `component.file` | `slice.py:1129`, `:1139`, `:1149`; `result-copy.ts:56-68`; `files.mjs:72-75` |
| `cellIndex` luôn null | `files.mjs:84` (manifest không ghi `idx`) |
| Ảnh phải qua object URL, `<img src>` ⇒ 403 | `features/kit/lib/image-source.ts:1-29`, `:64-69` |
| Công thức frame/offset đã đối chiếu 6/6 với Figma | `features/workflow-v4/lib/figma-node.ts:12-20`, `:198-215` |
| Tỉ lệ xuất: mascot 1, còn lại 0.5 | `features/kit/lib/export-scale.ts:34-36`, `:60-62` |
| Encoder đệ quy hết cây | `figma-h2d.global.js:1057-1064`, `:1094` |
| Tên node chỉ từ `aria-*` + allowlist; `data-name` bị loại | `:906-919`, `:920` |
| Text node thật + font | `:1049-1055`, `:881`, `:1187`, `:1219-1231` |
| `border-image` **không** được nhúng ảnh | `:289-296` vs `:338` |
| `overflow:hidden` chở được; `assertDocShape` lại ném | `:429` vs `figma-node.ts:294` |
| Nhiều doc giữ đúng vị trí (root = toạ độ viewport) | `:1286-1296`, `:858-861` |
| Figma làm phẳng wrapper trong suốt trong board | `figma-export/copy-sprite-images.mjs:4-7` |
| Timeout 10 s / 8 s; ảnh trùng URL gộp một | `:884`, `:210`, `:279` |
| Base64 hai lần | `:1272`, `:1292` |
| Prototype 4 màn + copy Figma | `screens.html:43`, `:154-231`, `:255-266` |
| `{name}` truyền vào `captureElement` bị bỏ qua | `screens.html:259` vs `:1167-1177` |
| Sidebar dự án 4 đích; 2 cửa ra ở header "Ảnh đã tạo" | `docs/PRODUCT-SITEMAP.md:488-496`, `:576`, `:580`; `ImagesSection.tsx:113-114` |
| **"ĐỂ HẾT TRONG 1 CÁI POPUP THÔI, ĐỪNG LỘ RA NGOÀI"** | `docs/PRODUCT-SITEMAP.md:522` (nguyên văn chủ sản phẩm) |
| Nút Chi tiết là cửa DUY NHẤT để chỉnh | `docs/PRODUCT-SITEMAP.md:531`; test quét lưới `cell-background.test.tsx:75` |
| Cấm thêm route mới khi chưa sửa spec | `webapp/src/routeTree.ts:28-32`, `:34-36` |
| Ba trục query thay cho route con | `webapp/src/routes/search-schemas.ts:141-144`, `:189-200` |
| Mẫu dialog để chép | `features/workflow-v4/components/ItemDetail.tsx:22-50`; cách gọi `steps/KitsetStep.tsx:239-307` |
| `DialogFooter` thật, không thanh sticky | `docs/PRODUCT-SITEMAP.md:503`; `components/ui/dialog.tsx:113`, `:119` |
| Bảng wording "Không dùng → Dùng" | `docs/PRODUCT-SITEMAP.md:388-401` |
| Lưới ô đã cắt nằm ở `CutAssetGrid`, không phải `KitScreen` | `CutAssetGrid.tsx:21-32`; `ImagesSection.tsx:130`; `routes/p.$projectId.kit.tsx:10` |
| Hợp đồng frame = hitbox, clip off | `docs/PRODUCT-SITEMAP.md:346-351` |
| Canvas là "Đang phát triển", không được hồi sinh | `docs/PRODUCT-SITEMAP.md:353-365`; `routes/k.$projectId.canvas.tsx:8` |
| #19 còn chờ chủ sản phẩm dán thử | `docs/BACKLOG.md` mục 19 |
| Vendor hash-locked 49 115 byte | `webapp/src/vendor/figma-h2d/README.md` |
