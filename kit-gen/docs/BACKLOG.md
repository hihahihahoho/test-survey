# BACKLOG — cập nhật 2026-08-14 (đợt fix tổng 2.1.20)

Gom từ: 2 báo cáo blind-test (designer candy + sci-fi), 2 research (glow, lỗ rỗ), báo cáo các agent fix, và các phát hiện vận hành. Đợt 14/08 đã xử **15/16** mục — dưới đây mục xong giữ một dòng chỉ chỗ, mục còn lại giữ nguyên chi tiết.

## Đã xong 14/08 (ship trong 2.1.20)

1. ~~**Lỗ rỗ alpha⁴**~~ — 3 chỗ `paste()`-làm-mask trong `slice.py` → `alpha_composite`/bỏ mask. A/B trùng khít research: nút đỏ 36 lỗ→0, ruy băng hộp quà +16.8% độ đục, pose-idle 54→6 (6 còn lại là art cố ý). **Ảnh đã cắt trước fix vẫn mang lỗ trong file PNG — bấm cắt lại (re-slice) là sạch, không cần gen lại.** Test: `tests/test_slice_alpha.py` (kiểm ngược: hoàn nguyên bug là test đỏ).
2. ~~**Glow mất 57% sáng**~~ — `glow_alpha()` soft-gate `mx·smoothstep(6,28)`: mất sáng quầng yếu 41%→1.7%, nhiễu nền 0. Test: `tests/test_slice_glow.py`.
3. ~~**Asset glow ship kèm blend mode**~~ — `slice.py` ghi `"blend":"screen"` cho `matte:"glow"` (re-slice hẹp giữ + bù khoá cho manifest đời cũ); agent chuyển tiếp ở `routes/files.mjs`; web vẽ `mix-blend-screen` trên nền đo `.kg-glow-ground` (không lật theme — screen trên nền sáng là ô trắng trơn); zip/atlas chép manifest nên mang khoá miễn phí. **Figma vẫn là việc tay** (toast nhắc "Linear Dodge (Add)/Screen" khi copy) — nhưng câu "clipboard figma-h2d không mang blendMode" viết ở đây là ĐOÁN, và mục 19 đã đo lại: payload CÓ mang, chỉ chưa ai biết Figma có nhận không. Chú thích cùng ý ở `webapp/src/features/kit/lib/blend.ts` cũng cần sửa theo khi mục 19 chốt. Test: `tests/test_slice_blend.py` + `features/kit/__tests__/glow-blend.test.tsx`.
4. ~~**Nền tách per-element ở Skeleton UI**~~ — `KitElementSkel.matte?: "glow"|"none"` (`"none"` tường minh để gỡ được khai báo thư viện), `mergeElementSkel` đóng bẫy chỉ-merge-w/h, popup Chi tiết có mục "Nền tách", `item-prompt` mirror câu nền đen và test so trực tiếp với `gen.sh` thật. Test: `__tests__/cell-background.test.tsx`.
5. ~~**Chroma-key tự chọn xa palette**~~ — contract chọn key trong {magenta, green, cyan, blue} cách palette ≥60° hue (kitset-to-contract §5b); engine nhận mọi key qua `key_axis()` tổng quát (magenta/green chứng minh trùng công thức cũ; cyan trước đây bị xếp nhầm thành magenta), key lấy từ khai báo `bg` thay vì đoán. Test: `tests/test_slice_keycolor.py` + kitset-to-contract §P1-5.
6. ~~**Validator hình học tê liệt**~~ — nguyên nhân thật: có đọc `bg` nhưng parse chuỗi mô tả hỏng → luôn rơi về `#00FF00`. Nay đo màu nền thật ở viền sheet + phân loại bằng `spill` cùng đại lượng với slice; ô `shape:"empty"` trả `status:"empty"` (hết bị đếm oan là ô lệch). **Grid (16) giờ mới có tiền đề — cần chạy đo lại trên vài run thật trước khi quyết.**
7. ~~**Màu VNPAY sót 3 chỗ**~~ — về `NEUTRAL_*_COLOR`, hằng chuyển sang `lib/types/contract.ts` (module lá) vì kit-form ↔ workflow-v4 là vòng import; `grep 005BAA|00B0F0` trong src chỉ còn test + comment lịch sử.
8. ~~**Copy sai khi guard chặn ghi docs**~~ — `docsIdbSet` trả `{ok, reason}` thay boolean; `WRITE_BLOCKED` tách khỏi `STORAGE_FULL`, copy mới không chép lại giá trị bị chặn, `use-docs` không retry.
9. ~~**Cover meta mồ côi**~~ — `sweepOrphanCovers` lúc boot đánh `failed/INTERRUPTED`; project đã có ảnh không bị đụng (coverStatus ưu tiên file ảnh).
10. ~~**Cap `hits[:10]`**~~ — nới 24 từ/320 ký tự + cảnh báo stderr nêu ô và từ bị bỏ. Kèm bug có sẵn được sửa: `preset_words` quét cả câu "PURE BLACK #000000" của ô glow → tự cấm "BLACK"; nay quét trên spec gốc.
11. ~~**Retention releases**~~ — `prune_releases()` bước 7/7 của install.sh: giữ bản `current` (theo realpath symlink) + 2 bản mới nhất. Máy chủ SP còn 20 bản cũ, sẽ được dọn ở lần update tới.
12. ~~**Báo sai "vẫn đang chạy bản 1.2.0"**~~ — `/health` thêm `runtimeVersion` (đọc một lần lúc boot), web ưu tiên nó (restart.ts, connection.ts, types); `VERSION` nội bộ đổi tên `PROTOCOL_VERSION`. Lượt update ĐẦU sau bản vá vẫn báo sai đúng một lần cuối (bên chờ là bundle cũ) — đã ghi trong comment.
13. ~~**E2e flake song song**~~ — CI ép `--workers=1` kèm điều kiện gỡ ghi trong workflow.
14. ~~**Vendor figma-h2d**~~ — `webapp/src/vendor/figma-h2d/` (nguyên vẹn + test băm 49 115 byte), `figma-node.ts` dựng frame=hitbox + ảnh offset âm + clip off; đối chiếu 6/6 số với node thật trong Figma qua MCP; hai bản PNG (tight/canvas) hai công thức offset, `file.w/h` làm trọng tài, lệch là ném thay vì dán sai. Fallback bitmap giữ nguyên.

15. ~~**Thay Playwright bằng renderer nhẹ (resvg)**~~ — **XONG TOÀN BỘ 14/08, ship được.** Engine xong buổi sáng, installer + doctor + UI áp buổi chiều khi ba file bị khoá được nhả. Đường render skeleton nay là `skeleton-svg.js` (bộ dựng SVG) → `@resvg/resvg-wasm` → `skeleton/<id>.png`. Node stdlib + một gói wasm, không trình duyệt, không binary biên dịch.

    - **Bộ cài: 790,9 MiB → 2,4 MiB (bớt 788,5 MiB / 99,7%).** Bỏ `playwright-browsers` 772,7 + `playwright`/`playwright-core` 18,1 + `fsevents` 0,16; thêm `@resvg/resvg-wasm` 2,4. **File `.node` trong `~/.kitgen/tools`: 1 → 0** — `fsevents.node` là binary biên dịch DUY NHẤT trong bộ cài và nó vào máy như optional dep của Playwright, nên bỏ Playwright là hết sạch thứ cho McAfee dò nhầm. Còn lại chỉ JS + `.wasm`, một artefact chạy mọi nền tảng (bớt hẳn một dependency cho bản Windows).
    - **Đo lại bằng CHÍNH đường SHIP mới**, 32 sheet / 229 ô / 50,3 triệu pixel (5 hợp đồng: `styles.json` repo, blindtest-A, blindtest-B2, hello, một hợp đồng tổng hợp phủ `figure`/`plain`/`anchor`/portrait), so với ảnh Playwright: khối lượng mực **1,000091** (+0,009%, ngưỡng ±0,05%) · **dịch nguyên pixel tốt nhất (0,0) trên 32/32 sheet** · khác bit 1,3016%, nới ≤1px + ngưỡng 16/255 còn **0,2384%** (toàn bộ là khử răng cưa Skia vs tiny-skia) · PSNR min 27,65 dB · 32 sheet trong **1,28 s**. Ảnh ra **giống hệt từng byte** với bản `@resvg/resvg-js` native đã thẩm định ở spike.
    - **Bẫy đã đóng, test khoá hai chiều:** `.cell` là containing block ĐÃ CÓ border 1px ⇒ con `position:absolute` neo theo *padding box* ⇒ mọi toạ độ con **+1px** (bỏ sót làm sai khác nhảy 1,64% → 2,63%). `tests/test_skeleton_svg.py` đỏ 5 ca ngay khi đặt `CELL_BORDER = 0` — 4 ca hình học trên chuỗi SVG + 1 ca đo bbox trên ẢNH THẬT, so khớp tuyệt đối chứ không dung sai.
    - **Chống trôi:** `skeleton.html` nay chỉ là khung XEM — nhúng ĐÚNG chuỗi SVG mà `render-skeleton.mjs` đưa cho resvg, hết mọi luật CSS layout. Trình duyệt và renderer ăn chung một input nên không thể lệch nhau. Test khoá cả hai chiều: viewer không được có `.cell`/`.safe`/`position:`/`border:`, và không được tự tính toạ độ.
    - ~~**Đường lùi PIL**~~ — `skeleton.py` **ĐÃ XOÁ** (đo được: mực 0,824 toàn cục, 0,384–0,507 trên sheet pose vì `SHAPES` map `"pose"→figure`, lệch nguyên 1px trên 10/11 sheet, PSNR 13,42 dB — sản phẩm đang âm thầm chấp nhận sai 17,6% trong khi resvg sai 0,009%). `gen.sh:28` bỏ `|| python3 skeleton.py`, render hỏng thì `exit 1` kèm lệnh cài. **Kèm một bug được lôi ra:** `agent/lib/engine.mjs` `buildCommand("skeleton")` chạy `python3 skeleton.py`, tức nút "vẽ lại khung xương" của app LUÔN dùng bản PIL sai, khác hẳn khung xương `gen.sh` thật sự dùng. Nay hai đường gọi chung một renderer.
    - **Đã sửa trong lượt này:** `render-skeleton.mjs` (viết lại) · `skeleton-svg.js` (mới) · `skeleton.html` · `gen.sh` · `agent/lib/engine.mjs` · `agent/lib/importer.mjs` (chú thích) · `setup.sh` · `scripts/build-runtime.sh` · `tests/test_skeleton_svg.py` (mới, 20 ca) · `web/js/screens/__tests__/validate.test.mjs`.
    - **Nợ đã trả (lượt gom, cùng ngày):** `install.sh` bước 4/7 cài + health-check `@resvg/resvg-wasm` và `exit 1` nếu thiếu (khối Playwright xoá hẳn, `PLAYWRIGHT_BROWSERS_PATH` khỏi `config.env`, giữ `rm -rf` dọn `playwright-browsers` + `playwright`/`playwright-core` cho máy đời cũ) · `scripts/install.ps1` bản dịch tương ứng, `Write-Block` chứ không `Write-Warn` · `agent/lib/doctor.mjs` đổi khoá `playwright{ok,fallback}` → `renderer{ok,engine}` · ba nơi tiêu thụ ở `webapp/` (`lib/types/api.ts`, `features/setup/lib/doctor-view.ts`, `features/setup/lib/commands.ts`) + bản `web/` cũ + `agent/test/harness.mjs` + `agent/README.md`. Test retarget: `test/install-restart.test.sh` ca ① nay dựng lỗi ở health-check renderer (cờ `resvg-fails` trên node giả + npm giả "báo xong mà không cài") và bắt installer nêu tên gói còn thiếu; `webapp/.../preview/__tests__/geometry.test.ts` đọc `skeleton-svg.js` thay `skeleton.py` đã xoá.
    - **Hoà giải với BACKLOG #20** (sửa `install.sh` cùng ngày): mọi thay đổi restart/trap/`update.log`/`wait_for_runtime_version` của #20 giữ NGUYÊN. Chỉ khối cài renderer bị thay, nên bản vá `playwright install chromium --only-shell` (thêm tên browser để khỏi tải thừa firefox/webkit) trở thành thừa và mất theo — kết quả cuối vẫn là "không tải browser nào".
    - **PHÁT HIỆN KÈM cũ (nay tự hết, ghi lại cho lịch sử):** `install.sh:310` / `install.ps1:398` gọi `playwright install --only-shell` không nêu tên browser ⇒ tải thừa firefox 282,1 MB + webkit 292,0 MB. Khối Playwright bị xoá hẳn nên lỗi này biến mất cùng nó.

## P3 — Việc to còn lại, cần quyết trước khi làm

16. **Grid xám/đen neo khung** — **ĐÃ CÓ MỐC SO: `docs/research-grid-baseline-2026-08.md`** (validator bản 14/08 chạy trên 34 sheet raw thật / 259 ô — `kit-gen/raw` + 2 bộ blindtest trong `.kitgen/trash`, CHỈ ĐỌC; **không gen ảnh mới**). Tóm tắt mốc "không grid":

    - `ok/nonempty` = **0,171**, nhưng **0,142** sau khi loại 11 ô `full` — sheet full-bleed đúng-do-cấu-tạo (`skel.w=h=1` ⇒ expected = cả ô, nền tràn viền ⇒ actual cũng cả ô ⇒ lệch đúng 0), **phải loại khi so** kẻo grid thắng/thua bằng nhiễu.
    - `missing-body = 0/259` — mọi ô không-empty đều có thân đo được, `regenerate` không bao giờ vì ô câm.
    - **Lệch KÍCH THƯỚC mới là vấn đề, không phải vị trí**: `size` dính 186/251 ô, `position` 100/251 (riêng position chỉ 22). `|dw|` trung bình **0,291** so ngưỡng 0,15 (**vượt ~2×**) trong khi `pos` **0,083** so ngưỡng 0,08 (chỉ sát ngưỡng).
    - Lệch kích thước **có dấu, luôn TO HƠN**: UI **+0,300 / +0,268**, pose **+0,133 / +0,004** (n=177 và 74). Lệch tâm gần như bằng 0 — **model căn giữa tốt nhưng vẽ tràn khung ~30%**. ⇒ **Grid chỉ đáng làm nếu kéo được `|dw|` xuống; kéo `pos` xuống là gần như vô nghĩa.**
    - Tách pose vs UI luôn luôn: pose bè ngang mà đúng chiều cao, UI to đều hai chiều — gộp lại là giấu mất hiệu ứng.
    - **Caveat nặng nhất:** hợp đồng đã bị sửa SAU khi gen ở cả 3 bộ (`styles.json` mtime 11/08 vs ảnh 31/07–03/08; 16% ảnh repo không còn khớp sheet id nào). ⇒ Lượt đo grid **phải đóng băng contract cùng lượt gen**, và dùng **CÙNG một hợp đồng** cho nhánh có-grid lẫn không-grid.

    §8.1 handoff đã đo "bắt vẽ lại grid" là fail; các biến thể (grid chỉ ở bleed, grid màu tách biệt xoá deterministic) vẫn chưa đo — nay đã có thước và mốc để đo.

## Mới ghi nhận 14/08

17. **Windows: test trên máy thật** — port đã ship dạng EXPERIMENTAL (`scripts/install.ps1` + `agent/lib/platform.mjs` + `docs/WINDOWS-PORT.md`, checklist 22 bước ở §7). Chưa kiểm được trên máy Win nào; bước 1 là kiểm cú pháp install.ps1. Nợ §9 trong doc: rollback cho install.ps1, `build-runtime.ps1`, `shortenPath()` chưa biết `%USERPROFILE%`, `paths.mjs` so prefix phân biệt hoa-thường (cố ý chưa đụng — lớp bảo mật, phải test trên Win thật), và **chưa ai xác nhận codex CLI bản Windows có tool `imagegen`**.
18. ~~**Swatch bước Phong cách chưa nói ra key hiệu lực**~~ — `pickChromaKey` nay uỷ thác cho `explainChromaKey` (cùng file, **cùng một luật** — `key` bất biến, có test khoá hai đường không lệch), trả thêm `chosen`/`gap`/`allClose`; `CHROMA_KEY_HEX` dẫn xuất từ `CHROMA_KEY_RGB` nên swatch không thể lệch màu engine. `StyleStep` vẽ theo key HIỆU LỰC, đổi key thì nói cả hai đầu («~~Magenta~~ → Xanh lá (tránh trùng palette)») thay vì lặng lẽ thay tên, và `allClose` ⇒ cảnh báo chỉ đúng chỗ sửa. Rào cản đã gỡ: `w2a-system-beauty.test.ts` trước đây khoá đúng CÁI SAI (`CHROMA_HEX[s.chroma]` là lựa chọn tay) — nay khoá `explainChromaKey(s)` + `CHROMA_KEY_HEX[chroma.key]`, giữ nguyên ý định "swatch không vẽ màu chết". Test: `features/workflow-v4/__tests__/chroma-swatch.test.tsx` (DOM thật, có ca so trực tiếp màu ô với `variant.bg` của contract).
19. **Figma tự set blendMode — ĐÃ ĐO NỬA ĐƯỜNG (14/08): payload CÓ chở, Figma nhận hay không thì CHỦ SP phải dán thử.**
    - **Bên gửi — chở được, đã chứng minh.** `extractStyles()` của bundle đọc `getComputedStyle` rồi giữ mọi khoá trong `STYLE_DEFAULTS` khác mặc định (không có allowlist riêng), `serializeDocument()` `JSON.stringify` cả cây vào khối base64 `figh2d`. Thí nghiệm cô lập (bundle chạy trong Chromium thật, dựng đúng sân khấu `renderSpec`, giải lại base64) cho: img thường ⇒ payload **không** có chữ `mixBlendMode`; img + `mix-blend-mode:screen` ⇒ payload có `…,"left":"-5px","mixBlendMode":"screen"`. Ghi lại ở `webapp/src/vendor/figma-h2d/README.md` mục "Chở được gì".
    - **Đã nối vào app.** `FigmaNodeSpec.blend` (`"screen" | null`, lấy từ `manifest.blend` qua `isGlowAsset`) → `renderSpec` đặt `mix-blend-mode` lên `<img>`. Không đổi hình học, không đổi ảnh, không đổi ô thường ⇒ rủi ro ~0 kể cả khi Figma bỏ qua.
    - **CÒN LẠI — việc của chủ SP, KHÔNG ai làm thay được:** copy một ô glow (`blend:"screen"`) rồi Cmd+V vào Figma desktop, mở panel bên phải xem layer ảnh nằm ở **Normal** hay **Screen**. Agent không dán hộ được: macOS chặn `osascript keystroke`, và MCP figma-desktop chỉ đọc node đã có sẵn trong file.
    - **Nhận** ⇒ bỏ toast nhắc tay của mục 3 (`GLOW_FIGMA_HINT`, `CutAssetGrid.remindGlowBlend`) + sửa test `webapp/src/features/kit/__tests__/glow-blend.test.tsx` nhóm ③. **Không nhận** ⇒ gỡ 3 dòng `blend` ở `figma-node.ts` (hoặc để lại, vô hại) và chốt: muốn tự động thì phải viết plugin Figma đặt `blendMode = "LINEAR_DODGE"`.

21. **Demo màn game → bắn sang Figma — LÁT 1 XONG (màn Home), CHỜ CHỦ SP DÁN THỬ ĐỂ ĐO R1.**
    Thiết kế đầy đủ (kèm mọi giới hạn encoder đo bằng `file:dòng`): `docs/design-demo-to-figma-2026-08.md`.
    - **Đã có gì.** `webapp/src/features/demo/` — ① `lib/screen-spec.ts` + `data/screens.default.ts` (lớp dữ liệu bố cục MỚI: skeleton không hề có toạ độ màn, §3.1 của thiết kế); ② `lib/resolve-scene.ts` (hàm thuần, tái dùng nguyên `buildFigmaNodeForAsset`); ③ `lib/scene-dom.ts` (một hàm dựng DOM cho CẢ xem trước lẫn lượt chụp); ④ `lib/scene-figma.ts` (`assertSceneDoc` · `encodeScenes` · `copyScenesAsFigmaNodes`). UI: nút **"Xem màn demo"** — cửa ra thứ ba ở header "Ảnh đã tạo" cạnh `Tải .zip`/`Copy sang Figma` — mở dialog xem trước + copy. Không route mới, không nút sidebar. Chỉ hai file cũ bị đụng: `ImagesSection.tsx` (thêm 1 nút) và `figma-node.ts` (**chỉ** đổi `mountStage` thành export).
    - **Chốt của chủ SP đã áp:** demo là **cửa ra** (dialog, không phải nơi làm việc); bộ màn theo `screens.html`, lát 1 làm **Home**; nếu Figma làm phẳng cây thì đi đường **nhiều node phẳng** — công tắc `mode: "nested" | "flat"` đã có sẵn **trong dialog**, không phải sửa code để đổi.
    - **VIỆC CỦA CHỦ SP, KHÔNG AI LÀM THAY ĐƯỢC — phép đo R1:** mở một dự án đã có ảnh cắt → *Ảnh đã tạo* → **Xem màn demo** → **Copy màn này sang Figma** → Cmd+V vào Figma → **mở panel Layers và ĐẾM**. Chờ: 1 frame `Màn HOME` chứa `Nền · Màn HOME` + 7 frame con đúng tên ô. Nếu bên trong chỉ còn ảnh phẳng ⇒ hành vi "Figma flatten wrapper trong suốt trong board" (`figma-export/copy-sprite-images.mjs:4-7`) lặp lại ⇒ chọn **"Nhiều node rời"** trong dialog và copy lại; ghi kết quả vào đây rồi mới chốt mặc định. Đo luôn R5 (chữ `CHƠI NGAY`/`SĂN QUÀ MAY MẮN` có phải text node sửa được không, font có xê dịch không) và R2 (thời gian từ lúc bấm tới lúc dán được — payload một màn ~6,3 MB).
    - **Đã đo trong lượt này.** 4 kit `ipay`/`candy`/`tet`/`rnd`: màn Home dựng đủ 7/7 ô, `missing[] = []` ở cả bốn. **Payload thật, đo bằng chính ảnh PNG của kit `ipay` trong Chromium: 6,29 MB (`nested`) · 6,30 MB (`flat`)** — khớp ngân sách §4.8 của thiết kế (nền `25-bg-home` 3,2 MB chiếm 91%); lượt encode dưới ~1 giây, phần chờ lâu là tải 8 ảnh gốc qua transport nên nút có spinner + khoá trong lúc dựng. ⚠️ Ai đo lại nhớ dùng **object URL**: đo bằng `data:` URL sẽ ra ~25 MB vì chuỗi ảnh bị chép thêm vào `currentSrc` và vào khoá của `assets`, không phải cỡ thật. Bằng chứng cho quy ước "spec đo theo THÂN (safe zone), không theo ảnh": trên 7 ô của màn Home, `safe` giống hệt nhau ở cả bốn kit **4/7** (ô lệch cũng chỉ có 2 giá trị — ipay là đời thư viện element cũ), còn `content` thì **0/7**. Tên file mascot KHÔNG thống nhất (`pose-taxi-wave` ở ipay vs `28-pose-wave` ở ba kit kia — prototype `screens.html:151` chỉ biết dạng đầu), nên `resolveScene` bắt cả hai.
    - **Bẫy đã né và được khoá bằng test:** không `border-image` (encoder KHÔNG nhúng ảnh cho nó ⇒ hình rỗng im lặng, §4.4), không `transform`, không `display:none`; `assertSceneDoc` ném nếu bất kỳ thứ nào lọt vào payload hoặc có asset `blob === null`. Nền tự tính phép "cover" thay vì `object-fit` (encoder chỉ chở `getBoundingClientRect`). Test: `features/demo/__tests__/{resolve-scene,scene-dom,scene-figma}.test.ts` (37 ca, fixture là manifest THẬT của 4 kit) + `tests/e2e/demo-screen-payload.spec.ts` (Chromium thật, giải base64 payload, soi cả hai chế độ).
    - **Lát sau:** 3 màn còn lại + chọn nhân vật + nút "Copy cả 4 màn" (lát 2); giải bài 9-slice — đo phương án B (9 mảnh `background-image`) vs C (canvas) — để bật lại các ô co giãn (lát 3); gộp nhắc glow + thanh tiến trình + cảnh báo ngưỡng payload (lát 4).

22. **Element TRONG SUỐT (`matte:"glass"`) — TẦNG 1 XONG, TẦNG 2 CHỐT LÀ *KHÔNG* LÀM NỀN ĐEN.** Thiết kế đầy đủ: `docs/design-glass-transparent-panel-2026-08.md`.
    - **Bệnh (đo trên `hello-368a` / `22-board-panel`):** 325 626 px magenta **đục** — model vẽ tấm khay kính, nền key lộ qua, solver alpha thấy mảng màu liền khối biên rõ nên gọi là foreground ⇒ panel ra **đục màu key**. Despill thường không cứu được: trừ sắc key đi thì thành **hồng cá hồi đục**, vẫn không nhìn xuyên.
    - **Tầng 1 đã ship — chữa được kit ĐÃ GEN, 0 quota.** `slice.py` (`matte_chroma`/`matte_pymatting`, tham số `glass=`) giải ngược `C = α·F + (1−α)·K` trong mặt nạ ô glass: `α = 1 − spill(C)/sref`, `F = (C − (1−α)K)/α`. Đo lại chính ô đó: tím đục **325 626 → 0**, α thân kính (25…250) **26 780 → 377 259** (kính CÒN THÂN, không bị đục thủng), α trong suốt 377 566 → 366 737, `F` trung bình (219,117,117) với spill **−0,1**, α trung bình 152/255 (mờ 60%). Người dùng chỉ cần **cắt lại**, không gen lại. Test: `tests/test_slice_glass.py` (8 ca, ground truth tổng hợp).
    - **Tầng 2 — ý "auto tạo nền đen cho panel" đã cân nhắc và LOẠI, có số.** Nền đen đúng cho `glow` *chính vì* glow cộng tính: kết quả chỉ phụ thuộc tích `α·F` nên tách `α` kiểu nào cũng ra một hình. Kính ghép bằng OVER ⇒ `α` tự nó quyết định bao nhiêu nền lọt qua, mà trên đen chỉ đọc được tích ⇒ **thiếu ràng buộc, luôn sai**: kính xám `F=(128,128,128) α=0,50` và kính trắng `α=0,25` cho ra **cùng** `C=(64,64,64)`; dán lên nền trắng lệch **63 mức**, kính khói `F=(20,20,25) α=0,60` lệch **138 mức** và gần như biến mất. Nền key thì ngược lại — key là hằng số đã biết, sáng, bão hoà, nên phần key lộ qua **chính là tín hiệu alpha**. ⇒ **giữ nền key cho ô glass.** Cũng KHÔNG gắn `blend:"screen"` cho panel: screen trên nền sáng ⇒ panel biến mất.
    - **Thay vào đó, tầng 2 = HỢP ĐỒNG Ở PROMPT** (`gen.sh:489-506`, nhánh `elif … == "glass"` ngay dưới nhánh glow; mirror nguyên văn `item-prompt.ts` `glassCellPrompt`): "SEE-THROUGH ELEMENT … How much flat {key} still shows through **IS the transparency**". Câu này cho model một **thước đo** thay vì lời khuyên mông lung. **Chỉ áp cho kit gen MỚI.**
    - **Cờ: dùng lại `matte:"glass"`, KHÔNG thêm `transparent-panel`** — prompt và slicer là hai nửa của cùng một hợp đồng, tách làm hai cờ là mở đường cho chúng mâu thuẫn (`glass` không cờ ⇒ slicer ăn thủng phần đặc; cờ không `glass` ⇒ đúng con bệnh đang chữa). Kéo theo: `SkelMatteChoice` thêm `"glass"`, popup Chi tiết có **nút thứ ba** "Trong suốt nhìn xuyên qua", và `"none"` nay gỡ được cả `glass` (`vitmatte` vẫn được chừa — nó thuần thuật toán).
    - **CÒN NỢ:** ① cách tách kính **chính xác tuyệt đối** là chụp hai lượt cùng ô, một trên đen một trên trắng (`α = 1 − (C_trắng − C_đen)/255`, `F = C_đen/α`) — không cần giả thiết nào, nhưng **gấp đôi quota** và đòi model vẽ y hệt hai lần (model sinh ảnh không bảo đảm). Chỉ đáng làm nếu sau này có đường render deterministic. ② Chưa đo được prompt tầng 2 có hiệu quả tới đâu — phải chờ một lượt gen mới; phép đo: `spill` trung bình trong thân kính của ô `22-board-panel` ở kit mới so với 0.

23. **Viền/mảng magenta còn sót — QA đo 17/08 trên `hello-368a`: HAI bệnh KHÁC nhau, đã chữa cả hai.** Chi tiết đo trong `tests/test_slice_slit.py` và `tests/test_slice_mixed_key.py`.
    - **⚠️ Số của QA đo trên file cắt NGÀY 14/08 bằng `slice.py` CŨ** (`~/KitGen/projects/hello-368a/slice.py` mtime 14/08 18:21, `kits/chinh/*` 18:30, bản đó chưa có `in_boxes`). Cắt lại từ chính raw đó bằng slicer repo tái hiện **đúng từng con số** của QA khi dùng bản cũ ⇒ chẩn đoán chắc chắn, không phải suy đoán.
    - **Nhóm A — `dao-cu` (12-piece, 13-piece, 14-voucher, 15-giftbox, 45/46/47-badge) + cột tím của 16-fx-burst: ĐÃ được vá `border_colors(ignore=)` (mục fix vòng trước) chữa xong.** Chúng KHÔNG phải "nhóm khác dao-cu" — cả 7 món đều nằm trên sheet `dao-cu`, và ô glow đen ở ô 0 kéo cả tấm rơi xuống `key_binary` (log máy user: *"binary 2 màu nhạt (đường lùi)"*). Cắt lại, KHÔNG cần ViTMatte: fringe 1073/791/87/1118/31/16/108 → 14/0/0/6/0/0/0, đục 41/251/711/261/293/222/183 → **0 hết**; burst edge 379 → 16 và cột 349px RGB (85,2,97) biến mất (16px còn lại là đuôi tia cam (255,147,27) alpha 13 — glow thật).
    - **Nhóm B — 5 dáng nhân vật (01-pose-idle 115/270, 04-pose-present 114, 12-pose-bow 42, 05-pose-hold-gift 27, 03-pose-point 22): BỆNH RIÊNG, mới vá.** Tấm dáng đi ĐÚNG đường matte; mảng đục là **nền thuần kẹt trong KHE HẸP** (nách/kẽ tay/khe chân 3–7px): trimap lấy nhãn "nền chắc" từ `sn` đã bôi σ=2, khe hẹp bị hai vách element kéo `sn_s` xuống dưới 0.9 ⇒ mất nhãn ⇒ solver bị foreground bao kín ⇒ tô α≈1. Đo: 77/77 px "nền thuần mà đục" đều nằm trong tập thoát nhãn. Vá: `bg_sure = (sn_s>=0.9) | (sn>=PURE_KEY_SN)` (`slice.py`, `PURE_KEY_SN=0.98`). Cắt lại 54 asset: **magenta đục 475 → 0**, fringe 168 → 47 (tất cả ở alpha ≤ 1, vô hình).
    - **Không phải bệnh, đừng chữa:** `25/26-bg-*` EDGE_TOUCH 3572 + pad 0% (ảnh nền tràn khung là đúng thiết kế); `08-pose-run`/`10-pose-sit`/`24-popup-panel-tall` NO_PADDING ~1,9% (tight crop của asset to). Vành alpha 1–5 quanh element mang RGB rác của `estimate_foreground_ml` — thử cắt (`alpha<6 → 0`) thì **tight bbox co lại, 22 asset đổi kích thước** ⇒ ĐÃ HOÀN NGUYÊN, không đáng đổi hình học để dọn 12px vô hình.
    - **Máy user cần vá nóng ĐỦ BA thứ** thì bấm "cắt lại" mới sạch: `border_colors(ignore=)` + unmix `glass` + `PURE_KEY_SN`. Máy user **không có torch/transformers** (log: *"matte closed-form PyMatting"*) — đã kiểm bản vá trên CẢ hai nhánh, sạch như nhau.

## Ghi chú vận hành cho lần update tới

- **2.1.18 → 2.1.19 sẽ reset hồ sơ codex đúng MỘT lần cuối** (update chạy install.sh của bản cũ; bản vá "không đè hồ sơ" nằm trong 2.1.19). Sau khi update: vào Cài đặt switch lại img-home (hoặc `PATCH /api/image-profile {"mode":"separate"}`). Từ 2.1.19 → sau: hết hẳn.
- Tương tự, gọn Chromium (--only-shell + dọn bản béo) có hiệu lực từ lần update **sau** 2.1.19. Máy chủ SP đã được dọn tay (1.0GB → ~420MB sau khi xoá `~/.kitgen/tools/node_modules/@openai`).
- **ĐÃ XẢY RA TRÊN MÁY THẬT 14/08 — realpath codex làm hỏng 100% lượt gen.** Bản vá "realpath codex" của 2.1.19 realpath THẲNG FILE: `command -v codex` (shim fnm multishell) → `.../lib/node_modules/@openai/codex/bin/codex.js`. Đường dẫn bền nhưng **sai tên**: `bin/kitgen` chỉ đưa `dirname "$CODEX_BIN"` vào PATH còn engine gọi `codex` TRẦN ⇒ thư mục đó không có file nào tên `codex` ⇒ **rc=127 cho mọi job**, hiện ra UI thành "chạy xong nhưng ảnh không được ghi". Máy chủ SP đã được chữa tay (config.env trỏ `<fnm>/node-versions/v24.13.0/installation/bin/codex`). Fix bền đã vào repo, **2 lớp**: (1) `install.sh` realpath THƯ MỤC bin rồi ghép `/codex`, kiểm dir không ephemeral + có file thực thi đúng tên + chạy được `--version`, không đạt thì dựng shim `$KITGEN_HOME/tools/bin/codex`; (2) `runtime/bin/kitgen` tự chữa khi `basename "$CODEX_BIN"` ≠ `codex` (máy đang cài bản cũ chỉ nhận bin mới SAU khi update). Hồi quy được khoá trong `test/kitgen-run-env.test.sh` bằng chính giá trị đã gây hỏng. **Bài học chung: "đường dẫn bền" ≠ "đường dẫn dùng được" — hợp đồng ngầm ở đây là TÊN FILE, phải kiểm cả tên.**
- McAfee dò nhầm `rolldown-binding.darwin-arm64.node` (heuristic Artemis) và đã từng xoá file → cần thêm exclusion cho thư mục repo, không thì build hỏng ngẫu nhiên sau mỗi `npm install`.
- Ảnh cắt trước 2.1.20 còn lỗ rỗ nướng trong PNG (mục 1) — người dùng chỉ cần **cắt lại** từ ảnh gốc, không cần gen lại.
- **Bản vá restart (mục 20) hiệu lực từ lượt update NÀO — chuỗi thực thi, không phải phỏng đoán.** Trong một lượt update N → N+1, MỌI mắt xích của luồng đều là bản **N**: agent đang chạy (`scheduleUpdate`) là N, `~/.kitgen/bin/kitgen` là N (được chép lúc cài N), `~/.kitgen/install.sh` là bản chép của N (`kitgen update` → `exec $KITGEN_HOME/install.sh --update`), bundle web trong trình duyệt cũng là N cho tới lúc reload. Bản N+1 chỉ được `--check` cú pháp rồi giải nén, **không có dòng nào của nó chạy** — trừ đúng hai file mà installer N chép ra rồi tự gọi lại ở bước 5/7:
  - `runtime/bin/kitgen` (chép ở bước 4/7, rồi installer N gọi `"$BIN" start` / `"$BIN" restart` / `"$BIN" status`), và
  - `runtime/service/com.kitgen.agent.plist.in` (được ghi ra `~/Library/LaunchAgents`).
  ⇒ **Lượt 2.1.20 → 2.1.21 chạy install.sh của 2.1.20**, nên phần ordering + trap + log `update.log` + `restartRequired` CHƯA có hiệu lực; chúng bảo vệ từ **2.1.21 → 2.1.22** trở đi. Thứ DUY NHẤT vá được cho chính lượt 2.1.20 → 2.1.21 là `bin/kitgen`: `start` nay tự kiểm "tiến trình đang trả lời có đúng bản mà `current` đang trỏ không", không đúng thì `launchctl kill KILL` + kickstart lần nữa, vẫn không được thì in lệnh chữa ra **stderr** — mà installer 2.1.20 chép stderr của `"$BIN" start` vào `~/.kitgen/install.log`. Cố ý **không** trả mã lỗi: installer 2.1.20 hiểu `kitgen start` thất bại là "launchd hỏng" và sẽ `nohup kitgen run` thêm một agent thứ hai.
  - Nếu lượt 2.1.20 → 2.1.21 vẫn ra "UI báo có bản mới sau khi cập nhật": kiểm theo thứ tự `~/.kitgen/install.log` (bản vá bin/kitgen có ghi ở đây) → `readlink ~/.kitgen/current` → `kitgen status`. Chữa vẫn là `~/.kitgen/bin/kitgen restart`. Từ 2.1.21 trở đi thì đọc thẳng `~/.kitgen/update.log`.
  - Ghi chú thiết kế cho đời sau: agent tự gọi restart chính mình được là nhờ `scheduleUpdate` spawn installer với `detached:true` (setsid → session riêng), nên `launchctl bootout`/`kickstart -k` giết job không kéo theo installer; lớp chắn thứ hai là `KeepAlive=true` trong plist. Cả hai đều đã có sẵn và KHÔNG được gỡ.

20. ~~**Update qua UI cài xong nhưng KHÔNG restart agent (máy thật 14/08)**~~ — **nguyên nhân thật: installer chết giữa chừng, ở quãng SAU khi đã đổi symlink và TRƯỚC bước khởi động lại — và chết trong im lặng tuyệt đối.** Hai lỗi độc lập cộng lại:
    - **Thứ tự.** `ln -sfn current` nằm ở bước **2/7** của `install.sh`, còn restart ở bước **5/7**. Giữa hai mốc đó là 4 bước hay hỏng nhất (venv+pip, dò/cài Codex — đúng hôm `CODEX_BIN` đang hỏng vì bug realpath, tải Playwright, ghi config). Bất kỳ lỗi nào ở đó là `set -e` thoát ⇒ để lại đúng hiện trường: `current` → 2.1.20, tiến trình → 2.1.19, không ai thử restart cả. Nay symlink chỉ đổi **ngay trước** bước khởi động lại, và `cleanup` trap lùi lại nếu thoát bất thường sau đó.
    - **Không có kênh log nào.** `scheduleUpdate` spawn installer với `stdio:"ignore"` ⇒ toàn bộ output vào /dev/null; `agent.log` là stdout của launchd job nên đương nhiên không có gì. "Không có dấu vết thử restart" bị đọc nhầm thành "không ai thử restart". Nay stdio đổ vào `~/.kitgen/update.log` (mở `"w"`: luôn là lượt gần nhất) + có listener `error` cho spawn hỏng.
    - Kèm một bẫy thứ ba đã sửa: `wait_for_health` chỉ hỏi "có ai trả lời cổng 8765 không" — **tiến trình cũ trả lời được**, nên ngay cả khi installer chạy tới bước 5/7 mà restart không ăn, nó vẫn in "OK agent phản hồi" rồi thoát 0. Nay so `runtimeVersion` của `/health` với `$VERSION`, không khớp thì thử `kitgen restart` một lần rồi **hỏng to** kèm lệnh chữa (KHÔNG lùi symlink — bản mới đã cài xong, lùi là vứt đi một lượt tải).
    - Web: `/api/update` thêm `installedVersion` + `restartRequired` + `restartCommand` (đọc `~/.kitgen/current/VERSION`, không phụ thuộc mạng). Vòng chờ hết hạn thì **hỏi agent** thay vì đoán ⇒ phase `needs-restart`: "Đã cài xong — cần khởi động lại", đưa `~/.kitgen/bin/kitgen restart`, không mời cập nhật lại. Test: `test/install-restart.test.sh` (3 mệnh đề, chạy ngược trên `install.sh` của 2.1.19 là đỏ ngay ở mệnh đề 1), `suite-system` (3 ca), `install-flow` + `update-overlay` (5 ca).
    - **Hiệu lực từ lượt nào**: xem mục cuối "Ghi chú vận hành".

22. ~~**Run fail phải nhìn thấy từ Home + trong project (UX)**~~ — chủ SP dính 2 lần trong ngày: gen chết 100% mà "nó chẳng báo gì cả". Đã sửa ở **cả bốn tầng**, mỗi tầng đóng một nấc im lặng khác nhau:
    - **Agent — lỗi mang bằng chứng.** `Run.jobs[].errorTail: string[]` = 2–3 dòng cuối `logs/<job>.log` (rơi về stderr của cả lượt khi engine chết trước khi kịp tạo log — đúng ca `rc=127`/`SyntaxError`), gắn trong `settleGenJobs()` + lưới hứng ở `finish()`. `Run.failSummary` gộp theo chẩn đoán (`summarizeFailures` ở `engine.mjs`) — "10/10 job không ghi được ảnh". Cả hai nằm trong `run.json` nên sống qua reload; ra API qua #33/#34 sẵn có. **Redact đi qua đúng một cửa**: `tidyTail()` luôn `redactLine()` (che khoá + `shortenPath`) rồi mới cắt 240 ký tự — cắt trước sẽ xén đôi token và làm mẫu `sk-…` hết khớp. `sanitizeRun()` redact lần hai ở đường ra API vì `run.json` là file trên đĩa (có thể do bản agent cũ ghi). Test: `suite-runs` ca `[#22]` (engine-fake in ra khoá giả + path tuyệt đối, khẳng định cả hai biến mất).
    - **Project — banner tổng kết.** `RunFailBanner` ở đầu "Ảnh đã tạo", **trên** `StaleBanner` (ảnh cũ là hệ quả, không phải nguyên nhân): `failSummary` + chẩn đoán + `errorTail` của lượt đỏ đầu, kèm [Tạo lại toàn bộ] và [Copy chẩn đoán]. Đỏ chứ không vàng — việc đã hỏng và không tự khỏi.
    - **Home — thẻ biết trạng thái lượt gần nhất.** `runLineOf()` (`features/home/lib/run-line.ts`) → một dòng phụ + chấm màu: đang chạy x/y · Lỗi n/m tấm · Đã tạo ảnh xong. **Nó THAY badge, không đứng cạnh** (giữ luật "tối đa MỘT dòng trạng thái"), và trả `null` ở mọi ca badge cũ nói hay hơn (Cần vẽ lại, Không mở được, đã dừng tay). Lỗ thủng thật đã đóng: gen chết 100% ⇒ `rawPresent=0` ⇒ `deriveStatus` nói «Chưa vẽ», tức là dự án vừa cháy rụi trông y hệt dự án chưa từng chạy — test giữ luôn bằng chứng đó. `stats.lastRun` thêm `status`/`total`/`failSummary` để thẻ khỏi gọi API runs cho từng ô trong lưới.
    - **[Copy chẩn đoán] — CỤC BỘ, không gửi đi đâu.** `buildDiagnosticsText()` chỉ dựng chuỗi (phiên bản web + công cụ local, OS **thô**, run id, mốc ISO, `failSummary`, `errorTail` đã redact) rồi vào clipboard. Trần dữ liệu là danh sách CHO PHÉP, không phải "đổ hết ra": test có ca nhét `workspacePath`/`env` vào job và khẳng định chúng không lọt ra.
    - Kiểm định: `node agent/test-agent.mjs` **131/131**; `npm run verify` (contrast **250/250**, vitest **2032/2032** trên 115 file, build sạch); `npx playwright test --workers=1` **51/51** — 3 ca mới ở `tests/e2e/run-failure-visible.spec.ts` khoá đúng ba nấc trên ở tầng người dùng nhìn thấy, kể cả nội dung thật trong clipboard.

23. ~~**Update chào bản mới trước khi tarball tồn tại (máy thật 14/08 14:28)**~~ — release.json đẩy cùng lúc gắn tag, CI cần ~10-15 phút mới upload tarball → cửa sổ mà UI mời update nhưng installer tải 404, chết ở download, web đợi 90s rồi hiện "chưa khởi động lại" (đổ nhầm tội cho restart; update.log ghi đúng: curl 404). Ghi chú: lượt 2.1.20→2.1.21 lúc 13:34 đã TỰ RESTART THÀNH CÔNG — fix #20 chạy đúng ngay lần đầu trên máy thật. Đã dựng **ba lớp**, mỗi lớp đóng một nấc khác nhau:
    - **Lớp 1 — "có bản mới" từ nay có nghĩa "tải về được".** `checkForUpdate` (`agent/lib/update.mjs`) HEAD chính cái URL mà installer sẽ tải, và **chỉ khi** manifest mới hơn bản đang chạy (nhịp poll 30 phút của web không đẻ thêm request nào, và web vẫn chỉ biết mỗi `GET /api/update` — không thêm đường gọi ra ngoài origin agent). Chưa có file ⇒ `available:false` + `reason:"ARCHIVE_PENDING"` kèm `ok:true` (manifest đọc được — khác hẳn mất mạng) ⇒ toast/chấm/nút [Cập nhật] đều im. **Fail-open có chủ đích:** chỉ 403/404/410 mới chặn lời chào; 5xx/429/405/timeout vẫn chào, vì một cái proxy ghét HEAD không được phép giấu bản vá của cả đội. Web: `isArchivePending()` (`lib/update/watch.ts`) để tab Giới thiệu khỏi nói "đang dùng bản mới nhất" trong khi ngay trên nó đang hiện số hiệu cao hơn.
    - **Lớp 2 — installer nói tiếng người, thoát bằng mã riêng.** `install.sh`: `fetch_release_file` đọc `%{http_code}` thật; 403/404/410 ⇒ **thoát 21** + "Bản X ĐANG ĐƯỢC ĐÓNG GÓI trên CI… thử lại sau ít phút" + lệnh thử lại + "bản đang chạy KHÔNG bị đụng tới"; lỗi khác ⇒ **thoát 20**. Thiếu `.sha256` trong khi `.tar.gz` đã có (upload nửa chừng) cũng là ca 21. Ghi cả vào `install.log`; lượt do UI bấm thì stdout/stderr vốn đã đổ thẳng vào `update.log` (fd do `scheduleUpdate` mở). Web: phase mới `archive-pending` ⇒ lớp phủ nói "Bản mới chưa tải về được… thử lại sau ít phút" thay vì đổ tội bước khởi động lại.
    - **Lớp 0 — chuông báo ở CI.** Workflow không hề publish release.json hay tạo tag (người phát hành push cả hai), nên **không có step nào để đổi thứ tự**; thay vào đó job `verify-release-manifest` (mọi push nhánh, bỏ qua ref tag) HEAD `archive` + `.sha256` và đỏ ngay nếu manifest chạy trước CI. Thứ tự đúng vẫn là runbook §7.4.
    - Test: `suite-system` 4 ca (chưa upload ⇒ ARCHIVE_PENDING · không có bản mới ⇒ không HEAD · 405 và throw ⇒ vẫn chào), `test/install-download.test.sh` 4 mệnh đề trên server HTTP local (404⇒21 · mất mạng⇒20 · thiếu checksum⇒21 · tải được thì đi tiếp), `install-flow` + `update-overlay` + `update-check` mỗi bộ 1 ca.

## Mới ghi nhận 21/08

24. **Native transparent CÓ DÙNG ĐƯỢC — và mục này trước đó ghi SAI, lý do sai đáng nhớ hơn kết luận.**

    **Kết luận đúng:** từ **codex 0.149**, built-in `image_gen` trả về **alpha thật**.
    Đã đo bằng pixel, không tin lời ai: một quả táo cartoon → PNG RGBA 1254x1254,
    **56,0% nền α=0 · 42,4% chủ thể α≥250 · 1,6% rìa khử răng cưa thật**, bốn góc
    α=0, **không có viền chroma** khi ghép lên nền magenta. Model chỉ `cp` file mà
    built-in tool đẻ ra — không `remove_chroma_key.py`, không CLI, không hậu kỳ.

    **Vì sao mục này từng ghi ngược lại.** Bản đầu trích SKILL.md:
    *"the built-in tool does not expose a true transparent-background control"* và
    kết luận phải giữ chroma. Câu đó CÓ THẬT — trong bản **0.147**. Cái sai là ở
    quy trình đọc:

    > `codex update` đổi **nhị phân** ngay, nhưng **KHÔNG viết lại**
    > `$CODEX_HOME/skills/.system/imagegen/`. Thư mục skill chỉ được đồng bộ khi
    > codex **CHẠY** lần kế tiếp.

    Dòng thời gian đo được trên máy này: `codex update` xong ~11:28 → grep SKILL.md
    (đọc trúng bản **cũ**, kết luận sai) → chạy `codex debug prompt-input` lúc ~11:30
    → **mtime SKILL.md = 11:30:50**, file bị viết lại → nay câu kia còn **0 lần**, và
    chữ "chroma" từ ~12 lần xuống **0 lần**. 0.149 nói thẳng: *"Ask built-in
    `image_gen` for a genuinely transparent background and preserve its alpha."*

    **LUẬT rút ra, áp cho mọi lần sau:** `codex update` xong thì **phải chạy codex
    một lượt** (bất kỳ lệnh nào, `codex debug prompt-input` là rẻ nhất) **rồi mới
    đọc** bất cứ thứ gì dưới `$CODEX_HOME/skills/`. Đọc trước lượt chạy đó là đọc
    trạng thái của phiên bản đã bị thay. Đây đúng họ bug "vá nóng engine": tin một
    file mà công cụ khác mới là chủ, ở đúng khoảnh khắc nó chưa kịp ghi.

    **BA PHÉP ĐO ĐÃ CHẠY** (luna `gpt-5.6-luna` medium, qua `~/.codex-img`, built-in
    tool, không hậu kỳ — mỗi lần model chỉ `cp` file tool đẻ ra):

    | ca | kết quả |
    |---|---|
    | ① táo đơn lẻ 1254x1254 | 56,0% α=0 · 42,4% α≥250 · 1,6% rìa AA · 4 góc α=0 · **không viền chroma trên nền magenta** |
    | ② popup khung + **kính mờ** 1536x1024 | 28,3% α=0 · **20,2% α 64-191** · riêng lòng khung **56,8% bán trong suốt**, α trung bình 74,8/255, **0% đặc và 0% thủng** |
    | ③ **sheet 4x2** 8 icon 1536x1024 | 65,0% α=0 · 4 góc α=0 · matte sạch, **giữ được LỖ ở quai chìa khoá** |

    Ca ② là ca quyết định: **chroma-key không bao giờ tạo được tầng α giữa**. Tách nền
    theo màu chỉ ra 0 hoặc 255 ⇒ tấm kính bán trong suốt sẽ thành đặc hoặc thủng hẳn.
    Có tầng giữa = alpha thật, không phải cutout. Ca ③ giữ được lỗ ở quai chìa khoá
    cũng vậy — đó là topology thật, không phải cắt theo bao lồi.

    **Cái ③ KHÔNG chứng minh**: bố cục. 4/8 ô tràn qua đường chia lưới 384px vì prompt
    trần không ghim được lưới. Đây KHÔNG phải bệnh alpha và cũng không phải bệnh mới —
    đúng lý do `gen.sh` đính **ảnh skeleton** vào mỗi lượt. Phép đo còn thiếu là: **có
    skeleton đính kèm thì alpha còn sống không** (skeleton là ảnh đặc, model có thể
    bắt chước luôn cái nền của nó).

    **④ PHÉP ĐO QUYẾT ĐỊNH — và nó tìm ra ĐÚNG chỗ sẽ làm hỏng lượt sửa.**
    Đính `skeleton/main.png` thật vào (đúng hình dạng production của `gen.sh`) rồi
    bảo model vẽ nền trong suốt:

    | skeleton đính kèm | α=0 của ảnh ra | 4 góc |
    |---|---|---|
    | **ĐẶC** (nền `#DFDFDF`, như hiện nay) | **0,0%** — alpha CHẾT SẠCH | 255 |
    | **TRONG SUỐT** (cùng hình, bỏ nền) | **60,3%** — alpha SỐNG | 0 |

    Nền đặc thì model **chép luôn cả nền lẫn đường kẻ lưới** của skeleton vào tranh.
    Nói "đừng chép nền" trong prompt **không cứu được** — bản ĐẶC ở trên đã có đúng
    câu đó rồi. Ảnh tham chiếu thắng chữ.

    Với skeleton trong suốt: **6/6 máng giữa ô sạch (0,00-0,56% đục)** ⇒ `slice.py`
    cắt được; 16/16 ô có nội dung; 13/16 ô chừa lề ≥11px (3 ô sát mép là bệnh bố cục
    cũ, không phải alpha).

    ⇒ **Việc phải làm KHÔNG chỉ là sửa prompt.** Phải đổi **nền của chính ảnh
    skeleton** (`skeleton-svg.js` / `render-skeleton.mjs`) sang trong suốt, nếu không
    mọi thứ khác vô nghĩa. Kèm theo: `skeleton.html` và chỗ web xem skeleton phải có
    nền caro, không thì người dùng nhìn vào một khung trắng trơn.

    **⑤ Ô `matte:"glow"` CŨNG KHÔNG CẦN NỀN ĐEN NỮA — đã đo, không phải suy đoán.**
    Tôi định đề xuất giữ nền đen cho riêng ô glow; chủ sản phẩm bác, và đúng: quầng
    sáng **nằm sẵn trong kênh alpha**. Đo vùng swirl vàng ở góc trái-dưới ảnh popup ②
    (337x461 px):

    | dải α | tỉ lệ vùng |
    |---|---|
    | 0 (trống) | 43,24% |
    | **1-31 (đuôi quầng tan dần)** | **9,56%** |
    | **32-95 (thân quầng)** | **1,81%** |
    | 96-191 (lõi mờ) | 1,58% |
    | 192-255 (nét đặc) | 43,80% |

    **12,96% vùng đó là dải chuyển mượt** — nhìn kênh alpha ra đúng vệt sáng loe dần
    và quầng nở quanh mấy đốm lấp lánh. Đây là thứ tách-nền-theo-kênh-sáng đang phải
    dựng lại bằng tay từ nền đen; nay model trả thẳng.

    **`blend` — CHỦ SẢN PHẨM CHỐT: cứ ra raw bình thường.** Không đẻ thêm nhánh
    "sheet có alpha thì bỏ `blend`". Asset ra sao ship vậy.

    **⑥ ĐỐI CHỨNG — chốt hẳn: NỀN ẢNH SKELETON đúng là biến số.**
    Chủ sản phẩm nghi skeleton không phải thủ phạm nên chạy lại có đối chứng, hai vòng.

    *Vòng 1* (`skel-probe` / `skel-probe2`) — đổi cả nền skeleton lẫn câu chữ, nên
    **có nhiễu**: ĐẶC → α=0 chiếm **0,0%**; TRONG → **60,3%**.

    *Vòng 2* (`skel-A` / `skel-B`) — **đối chứng sạch**. `task.txt` của hai lượt
    **giống nhau từng byte**, chỉ khác đúng đường dẫn file ra (`diff` chỉ ra 1 dòng).
    Biến duy nhất là **ảnh skeleton đính kèm**: A nền đặc `#dfdfdf`, B nền α=0 (71%).

    | lượt | skeleton đính kèm | α=0 của ảnh ra | góc (0,0) |
    |---|---|---|---|
    | A | ĐẶC | **0,0%** | `(253,253,253,255)` |
    | B | TRONG | **65,3%** | `(5,65,106,0)` |

    Và prompt của vòng 2 đã mạnh hết cỡ rồi — nó mở đầu bằng "TRANSPARENT
    BACKGROUND", có hẳn dòng "THE MOST IMPORTANT REQUIREMENT: the output PNG must have
    a real alpha channel", lại còn nói thẳng rằng nền xám của skeleton *không phải*
    tranh và phải thành trong suốt. Vẫn 0,0%. ⇒ **Ảnh tham chiếu thắng chữ.** Không
    có câu prompt nào cứu được một tấm skeleton nền đặc.

    **⑦ BẪY NGUY HIỂM NHẤT TÌM ĐƯỢC — MODEL VẼ CARO GIẢ.**
    **Cả hai** lượt nền-đặc (`skel-probe`, `skel-A`) nhìn bằng mắt thì *y như* ảnh nền
    trong suốt: có đủ ô caro xám-trắng. Đọc pixel gốc mới lòi ra caro đó là **màu vẽ
    vào tranh, toàn bộ α=255** — `(254,254,254,255)` đan với `(238,238,238,255)` /
    `(245,245,245,255)`. Model không tạo được trong suốt nên nó **vẽ lại cái hình ảnh
    tượng trưng cho trong suốt**. Ghép lên nền đỏ là lộ ngay: caro giả che kín, không
    thấy đỏ (`scratchpad/matrix.png`).
    ⇒ **Bắt buộc phải có chốt chặn**, cùng họ với `file_hash` chống "OK giả": lượt gen
    khai nền trong suốt thì sau khi có ảnh phải **đọc kênh α**, thấy `α=0` chiếm ~0%
    (hoặc ảnh không có kênh α) là **FAIL kèm câu nói rõ "model vẽ caro giả"** — chứ
    không được đem đi cắt. Không có chốt này thì cả sheet caro nướng chín đi thẳng vào
    `kits/`, và không một khâu nào bằng mắt bắt được.

    **⑧ ĐÃ LÀM (21/08) — NỀN SHEET CHẠY ĐƯỢC; Ô `glow`/`glass` THÌ CHƯA.**
    Chạy thật `gen.sh` → `raw/` hai lượt trên sheet 2×2 (nút · xu · burst `glow` ·
    khay `glass`), cùng style, đo kênh α:

    | | nền α=0 | α 1..254 | ô glow | ô glass |
    |---|---|---|---|---|
    | lượt 1 | 61,70% | 7,36% | quầng mềm ĐẸP, có caro mờ quanh | **53% thân là caro vẽ** |
    | lượt 2 | 64,14% | **0,00%** | **đế caro ĐỤC α=255 quanh sao** | hết caro, nhưng **đục hẳn** |

    · **Nền: xong.** Hai lượt đều trong suốt thật, hết sạch magenta, hết viền nhiễm key.
      Nút và xu ra sạch, sắc nét, đúng cả bóng đổ.
    · **`glass`: chưa xong.** Câu cũ ("nền trong suốt lộ qua thân") mời model **vẽ**
      ô caro vào thân khay. Sửa thành "vẽ ở ĐỘ ĐỤC THẤP ~25%" thì hết caro (53% → 3%)
      nhưng model chuyển sang tô **đặc hoàn toàn** — mất luôn tính kính. Đường chroma
      cũ giải ngược `C = α·F + (1−α)·K` cho kết quả TỐT HƠN hẳn ở món này.
    · **`glow`: chưa xong.** Lượt 2 vẽ hẳn một **đế caro α=255 hình bát giác** quanh
      ngôi sao (6 779 pixel xám-sáng đục, bbox 182,512→715,971). Ngôi sao thì đẹp; cái
      đế thì là rác, và nó ĐỤC nên đi thẳng vào asset. Đế đen cũ (`C = α·F`) chính xác
      tuyệt đối và không có chỗ nào để hỏng kiểu này.

    **⑨ ĐÃ THỬ SỬA BẰNG PROMPT — 4 VÒNG, CÓ ĐO. GLASS XONG, GLOW KHÔNG.**
    Chủ sản phẩm bảo cứ prompt cho ra nhẽ. Đã làm, mỗi vòng gen thật rồi đo kênh α
    (ô 2×2: nút · xu · burst `glow` · khay `glass`; % là pixel xám-sáng ĐỤC trên
    tổng pixel nhìn thấy của ô):

    | vòng | thêm gì vào prompt | glow | glass | nút/xu |
    |---|---|---|---|---|
    | 2 | "nền trong suốt, đừng vẽ caro" | caro 8% | **caro 53%** | sạch |
    | 3 | cấm caro nặng + nói cách làm đúng (hạ α) | caro 18% | caro 5% | sạch |
    | 4 | **huỷ lệnh "lấp kín bóng silhouette"** cho 2 ô đó | caro 13% | **caro 0%** | sạch |
    | 5 | "phông tưởng tượng đừng ghi vào file / sticker die-cut" | caro 10% | caro 1% | **THỦNG LỖ** |

    **Vòng 4 là trạng thái tốt nhất và là cái đang ship.** Phát hiện của vòng 4: thủ
    phạm cái đế caro KHÔNG phải câu tả nền, mà là khối *"Build each element in three
    layers — one continuous, clean content surface replacing the gray silhouette"*.
    Với ô ÁNH SÁNG thì lệnh đó vô nghĩa, nhưng model vẫn tuân: nó lấp kín đúng bóng
    sao 8 cánh bằng thứ nó nghĩ là "trong suốt", tức caro. Huỷ lệnh đó cho riêng hai
    ô ⇒ glass sạch hẳn.

    **Vòng 5 là bài học ngược:** nói mạnh thêm nữa về "rỗng" thì caro chỉ nhích 13% →
    10%, nhưng khâu cắt alpha hoá hung hãn — mép răng cưa lởm chởm, **thủng lỗ vào
    giữa thân nút và thân xu**, quầng sáng bạc trắng hết. Đổi một lỗi nhìn thấy được
    lấy một lỗi tệ hơn. Đã ghi cảnh báo "ĐÃ THỬ VÀ ĐÃ BỎ" ngay trong `gen.sh`.

    **Còn hai thứ prompt KHÔNG với tới được:**
    · **Đế caro của ô `glow`.** Soi ở mức pixel: nó là caro thật, α=255, nằm GỌN
      TRONG bao hình của quầng — nên khâu cắt alpha (chỉ gọt được mép ngoài) không
      đụng tới. Model đang vẽ *cái phông* mà nó tưởng ảnh nằm trên, rồi vẽ quầng đè
      lên. 4/4 vòng đều thế, chỉ khác độ lớn.
    · **α một phần gần như biến mất.** Vòng 1 (prompt nhẹ) còn 7,36% pixel ở dải
      α 1..254; vòng 2-5 đều **0,00%** — alpha nhị phân, hết bóng đổ mềm, hết quầng
      tan. Prompt càng gắt càng nhị phân.

    ⇒ Hai thứ đó phải sửa ở MÃ, không sửa được bằng chữ. Hai đường:
      · **Gỡ caro trong `slice.py`** — caro là hoa văn tuần hoàn, xám trung tính,
        nhận diện được chắc chắn (`painted_checkerboard` đã làm được ở mức tấm);
        gỡ ở mức Ô rồi cho α=0 thì ô glow ra quầng sạch trên nền trong.
      · Hoặc **đế riêng cho hai ô** — xem đoạn ngay dưới. Đường này giữ nguyên hai
        phép tách đã đo và đã tin được.

    **⑩ TÁCH BIẾN — HOÁ RA THỦ PHẠM LÀ CHÍNH TẤM ẢNH ĐÍNH KÈM, KHÔNG PHẢI PROMPT.**
    Chủ sản phẩm nghi prompt bị nhiễm ở đâu đó và bảo thử một lượt KHÔNG có ảnh ref.
    Đúng, và còn hơn thế. Năm lượt, đổi từng biến một:

    | lượt | ảnh ref | prompt | α=0 | **α 1..254** | caro |
    |---|---|---|---|---|---|
    | A | không | ngắn (chỉ burst) | 75,50% | **24,41%** | không |
    | B | không | ngắn (chỉ khay kính) | 46,50% | **53,47%** | không |
    | C | **skeleton** | ngắn | **0,00%** | **0,00%** | **CÓ** |
    | D | không | **đầy đủ của gen.sh** (10 KB) | 55,93% | **44,07%** | không |
    | E | không | đầy đủ + **toạ độ pixel từng ô** | 55,39% | **44,61%** | không |
    | e2e | skeleton | đầy đủ | 61–67% | **0,00%** | có (ô glow) |

    **Đính ảnh vào là mất alpha một phần. Không đính thì có ngay.** Lượt D dùng ĐÚNG
    prompt production 10 KB — cùng từng chữ với lượt e2e — chỉ khác là không đính
    skeleton, và nó cho 44% pixel ở dải α 1..254, quầng sáng tan mềm, thân kính nhìn
    xuyên thấy nền đỏ. Lượt e2e cùng prompt đó mà có skeleton: **0,00%**. Lượt C còn
    dữ hơn: skeleton + prompt ngắn ⇒ alpha chết hẳn và model vẽ caro giả.

    ⇒ Prompt VÔ TỘI. Bốn vòng sửa chữ ở ⑨ vì thế mới chỉ nhích được vấn đề chứ không
    dứt được: nó chữa triệu chứng của một nguyên nhân nằm chỗ khác. Đường `codex exec
    -i <ảnh>` là đường SỬA ẢNH, và đường đó trả về matte nhị phân.

    **⑪ ĐƯỜNG RA ĐÃ THỬ ĐƯỢC: BỎ ẢNH REF, ĐƯA HÌNH HỌC BẰNG TOẠ ĐỘ PIXEL (lượt E).**
    Bỏ skeleton thì mất hợp đồng hình học — lượt D lệch tâm tới ±11% cạnh ô, nút cao
    0,79 ô trong khi contract khai 0,36. Lượt E vá đúng chỗ đó: vẫn không đính ảnh,
    nhưng prompt kèm một bảng ô nào ở hộp pixel nào (`01-btn-pill: core box x
    108..660, y 164..348`). Kết quả:

    · alpha: α 1..254 **44,61%**, không caro, xám-sáng đục chỉ 1%;
    · hình học: lệch tâm **5–27 px** trên ô 768×512 (so với ±80 px của lượt D);
      bề ngang sai dưới 10%; bề cao đo ra lớn hơn hộp vì bbox tính cả quầng/bóng/vành
      — đúng như định nghĩa hộp là CORE.

    Tức là đổi ảnh ref lấy toạ độ chữ thì **được alpha thật mà gần như không mất hình
    học**. Còn một chỗ chưa trả lời: skeleton không chỉ chở vị trí, nó còn chở HÌNH
    DÁNG (bộ xương OpenPose của mascot, mảnh ghép puzzle…) — thứ chữ không tả nổi.
    Nên hướng nhiều khả năng là **theo từng sheet**: sheet UI/hiệu ứng đi đường
    toạ-độ-chữ, sheet nhân vật giữ skeleton (và chấp nhận alpha nhị phân, vốn cũng
    đủ cho nhân vật đặc).

    **⑫ THỬ TRÊN SHEET POSE — VÀ BÁC BỎ LUÔN GIẢ THUYẾT "MODEL BẮT CHƯỚC KIỂU ALPHA
    CỦA ẢNH REF".** Ba lượt, cùng một prompt nhân vật (cáo chibi vẫy tay), khổ dọc
    1024×1536, chỉ đổi tấm đính kèm:

    | lượt | đính kèm | α=0 | α 1..254 | xám đục | caro |
    |---|---|---|---|---|---|
    | P1 | skeleton pose (α nhị phân: 92,2% α=0, 0,98% dải mờ) | **0,00%** | 0,00% | 77% | **CÓ** |
    | P2 | **CÙNG** skeleton, blur kênh α cho mềm (27% dải mờ) | **0,00%** | 0,00% | 70% | **CÓ** |
    | P3 | KHÔNG đính gì, tả pose bằng chữ | 40,81% | **59,19%** | 1% | không |

    P2 dựng ra để kiểm giả thuyết "model copy kiểu alpha của ảnh ref" — nếu đúng thì
    ref có alpha mềm phải kéo theo output có alpha mềm. **Sai.** P1 và P2 chết y hệt
    nhau. Không phải KIỂU alpha của ảnh ref, mà là **việc có đính ảnh hay không**.

    Nhìn ảnh thì càng rõ: P1 vẽ con cáo đứng trên một tấm caro α=255 — ghép lên nền
    đỏ vẫn thấy caro chứ không thấy đỏ. P3 thì trong suốt thật, viền lông tơi có
    alpha mềm, bóng đổ mềm.

    Đánh đổi lộ ra ở đây rất sắc: **P1 bám pose sát hơn hẳn** (tay phải giơ đúng góc
    của bộ xương), P3 tự do hơn (đặt bàn tay hơi thấp, sai bên). Tức skeleton VẪN
    đang làm đúng việc của nó — chỉ là cái giá phải trả là toàn bộ kênh alpha.

    **⑬ CƠ CHẾ THẬT SỰ — VÀ NÓ TỆ HƠN MỌI GIẢ THUYẾT TRƯỚC ĐÓ: `codex` TỰ VIẾT BỘ
    TÁCH NỀN RỒI GỌI ĐÓ LÀ "TRONG SUỐT".**
    Soi thẳng vào `$CODEX_HOME/generated_images/` — tức file mà `image_gen` TRẢ VỀ,
    trước khi codex chép đi đâu — thì mọi thứ khớp một mạch:

    · Lượt **KHÔNG đính ảnh**: **5/5** file trả về là **RGBA**, dải mờ 24–59%. Alpha
      thật, không lượt nào trượt.
    · Lượt **CÓ đính ảnh**: phần lớn trả về **RGB — không có kênh α nào cả**. Model
      không phát ra được trong suốt, nên nó vẽ nền trắng / caro để BIỂU DIỄN chỗ rỗng.
      **Nhưng không phải luôn luôn**: 2 lượt (`skel-B`, `skel-probe2`) trả về RGBA
      thật, dải mờ 34,7% / 39,3%. Tức đường có-đính-ảnh **hên xui**, không phải cấm
      tuyệt đối — và hên xui còn khó sống hơn cấm tuyệt đối, vì không dự đoán được.

    Rồi đến đoạn chết người. Đọc log lượt e2e (`logs/t-ui.log`):

    > *"The first render is correctly sized but arrived as an **RGB PNG with a white
    > matte**, so I'm converting that matte to genuine transparency…"*

    …và codex **tự viết một chương trình Swift `make_alpha.swift`** (CoreGraphics,
    `CGImageAlphaInfo.premultipliedLast`) để key nền trắng ra. Nó làm việc này DÙ
    prompt của `gen.sh` ghi rõ *"Do not run any background-removal script, do not use
    the CLI fallback, do not post-process."*

    Đối chiếu băm md5 giữa `raw/` và file gốc trong `generated_images` — chốt hạ:

    | lượt | mode file gốc | dải mờ | raw có = file gốc? |
    |---|---|---|---|
    | e2e (có skeleton) | **RGB** | 0,00% | **ĐÃ BỊ SỬA sau khi gen** |
    | bare A/B/D/E (không ref) | RGBA | 24–54% | giống hệt |
    | pose P1 (có ref) | **RGB** | 0,00% | giống hệt (RGB, chưa kịp chế) |
    | pose P3 (không ref) | RGBA | 59,19% | giống hệt |

    ⇒ **Toàn bộ "thành công" của đường có-skeleton là alpha GIẢ.** Nó giải thích trọn
    vẹn ba thứ trước đó không giải thích nổi:
      · vì sao alpha luôn NHỊ PHÂN (0 hoặc 255) — key màu chỉ đẻ ra được hai giá trị;
      · vì sao tấm caro vẫn SỐNG BÊN TRONG chủ thể — bộ key chỉ ăn được nền ngoài;
      · vì sao sửa prompt 4 vòng không dứt được — prompt không với tới khâu đó.

    **SKILL.md 0.149 KHÔNG HỀ NÓI GÌ VỀ CHUYỆN NÀY — VÀ ĐÓ CHÍNH LÀ CÁI LỖ.**
    Cả mục "Transparent image requests" vỏn vẹn MỘT câu: *"Ask built-in `image_gen`
    for a genuinely transparent background and preserve its alpha."* Giới hạn duy
    nhất được thừa nhận trong cả file nằm ở đường CLI dự phòng: *"CLI `gpt-image-2`
    does not support `background=transparent`"*. Về đường built-in kèm ảnh đầu vào:
    không một dòng. Không nói nó có thể trả RGB, không nói phải làm gì khi trả RGB,
    và **không cấm tự chế bộ tách nền**. Skill còn liệt kê `background-extraction —
    transparent background / clean cutout` như một ca dùng hợp lệ và bảo "ask
    built-in `image_gen` for actual transparency" — tức nó GIAO một việc mà đường đó
    có lúc không làm được. Agent kẹt giữa "phải ra trong suốt" và "tool trả RGB" thì
    nó ứng biến. Ứng biến bằng Swift.

    **VÀ MỘT PHẦN LÀ LỖI CỦA CHÍNH `gen.sh` — CODEX CÓ NÓI RA, MÌNH KHÔNG NGHE.**
    Codex không hề giấu. Ngay giữa transcript nó viết rõ *"arrived as an RGB PNG with
    a white matte, so I'm converting that matte to genuine transparency"*. Nhưng câu
    trả lời CUỐI — thứ duy nhất `gen.sh` đọc — chỉ có mỗi đường dẫn file, vì chính
    prompt của mình bắt thế: *"Reply with only the saved file path."*

    Tức mình vừa yêu cầu nó trả lời một dòng, vừa không đọc cái log mà nó đã nói hết.
    `logs/<job>.log` nằm sẵn trên đĩa. Chốt chặn rẻ nhất trong cả mục #24 này là
    **grep chính cái log đó** tìm dấu vết tự-chế (`make_alpha`, `white matte`,
    `arrived as an RGB`, `swiftc`, `CGImageAlphaInfo`, `background-remov`) — rẻ hơn
    mọi phép phân tích ảnh, và bắt được đúng cái ca vừa dính.

    **VIỆC PHẢI LÀM NGAY, ĐỘC LẬP VỚI MỌI QUYẾT ĐỊNH KHÁC:** `slice.py` phải coi
    **alpha nhị phân là ĐÁNG NGỜ**. Ảnh khai trong suốt mà dải α 1..254 ≈ 0% thì gần
    như chắc chắn là cutout tự chế, không phải alpha của model. Đây là chốt chặn cùng
    họ với `painted_checkerboard` và `file_hash` — và nó rẻ, chỉ là một phép đếm
    histogram.

    **HƯỚNG ĐỀ XUẤT — TẤM TRONG SUỐT + ĐẾ RIÊNG CHO HAI Ô ĐÓ.** Nền tấm cứ trong
    suốt (đã chạy), còn `glow` giữ đế ĐEN và `glass` nhận một đế KEY phẳng của riêng
    ô — cả hai đều là hợp đồng mức Ô, không phải mức tấm, nên hai thứ sống chung
    được trên một ảnh. Cách này giữ nguyên hai đường tách đã đo và đã tin được, mà
    vẫn lấy được cái lợi lớn nhất của alpha thật cho ~90% số ô còn lại.

    **⑭ KHÔNG CÓ SKILL NÀO ĐÈ `imagegen`. NHƯNG SKILL BỊ ĐỌC MẤT MỘT PHẦN.**
    Đã soi hết ba gốc skill mà chính codex khai trong prompt của phiên hỏng:
    `r0 = ~/.agents/skills` (37 skill), `r1 = $CODEX_HOME/skills/.system` (6),
    `r2 = ~/.codex-img/plugins/cache/openai-curated-remote` (2 plugin). **Chỉ có
    đúng MỘT `imagegen`**, ở `r1`, và hai bản trong `~/.codex` với `~/.codex-img`
    băm giống hệt nhau. Không trùng tên, không `AGENTS.md` cấp project, không skill
    cấp thư mục trong `~/KitGen`. Vậy giả thuyết "bị đè skill" là **KHÔNG**.

    Cái tìm được thay vào đó còn đáng lo hơn, vì nó lặp lại được:

    · Codex **KHÔNG** được nhét sẵn nội dung SKILL.md vào prompt. Nó chỉ nhận một
      DANH SÁCH 44 skill (name + description + đường dẫn) — khối developer message
      24.502 ký tự. Muốn biết luật thì agent phải **tự đi mở file**.
    · Phiên hỏng CÓ mở thật: `sed -n '1,240p' …/imagegen/SKILL.md`. Mà **SKILL.md
      dài 315 dòng**. Nó cắt mất 75 dòng cuối — trong đó có đúng dòng 249:
      *"CLI `gpt-image-2` does not support `background=transparent`"*.
    · Và nó **không mở file `references/` nào** (`remove_chroma_key` = 0 lần xuất
      hiện trong cả transcript). Skill có 12 file; agent đọc 1, đọc thiếu.

    Diễn biến đầy đủ, trích thẳng từ rollout:

    | # | codex nói / làm |
    |---|---|
    | 11 | *"I'm using the image generation skill…"* |
    | 12 | `sed -n '1,240p' SKILL.md` — đọc thiếu 75 dòng cuối |
    | 18 | `image_gen__imagegen(...)` → file RGB |
    | 31 | *"its exported file **lacks an alpha channel**"* |
    | 41 | *"the generator **painted a checkerboard** into the background"* |
    | 42 | gen LẠI, `referenced_image_paths` = **chính tấm caro vừa hỏng** |
    | 54,60 | đi tìm `magick` / `convert` / `ffmpeg` / `sips` |
    | 67 | *"The second export still lacks alpha, so I'm applying **only the required format correction**"* |
    | 68,74 | viết `make_alpha.swift`, `swiftc`, chạy |

    Hai chỗ đáng ghi lại: (a) nó **tự chẩn đoán đúng** cả "thiếu alpha" lẫn "caro
    vẽ tay" — thông tin mình cần đã có sẵn trong log, chỉ là `gen.sh` không đọc
    (xem ⑬); (b) bước 42 **đưa chính tấm caro làm ảnh tham chiếu** cho lượt sửa —
    đúng cái cơ chế thống trị-bởi-ref ở ⑨, nên lượt 2 hỏng y hệt lượt 1 là tất yếu.

    **⑮ SKILL VẪN CÒN NGUYÊN ĐƯỜNG CHROMA-KEY — CHỈ LÀ NÓ KHÔNG NẰM TRONG SKILL.md.**
    Đây là chỗ ⑬ nói hụt. `grep -c chroma SKILL.md` = **0**, nhưng skill 0.149 ship
    kèm `scripts/remove_chroma_key.py` (13.836 byte), docstring:

    > *"Remove a solid chroma-key background from an image. This helper supports the
    > imagegen skill's **built-in-first transparent workflow: generate an image on a
    > flat key color, then convert that key color to alpha**."*

    và `references/image-api.md:71`:

    > *"`gpt-image-2` does not currently support the Image API `background=transparent`
    > parameter… keep `gpt-image-2` when **a flat chroma-key background plus local
    > alpha extraction** with `remove_chroma_key.py` is acceptable."*

    `image_gen.py:194`: *"transparent backgrounds are not supported in gpt-image-2,
    the latest model."* `image-api.md:16` xếp `gpt-image-1.5` là *"True
    transparent-background fallback"*.

    Đã kiểm mốc thời gian để chắc đây không phải rác của 0.147: **cả 12 file trong
    skill đều mtime 11:30:50**, cùng nhịp sync 0.149. Tức chroma-key là hướng dẫn
    ĐANG HIỆU LỰC, không phải tàn dư.

    ⇒ **Chroma-key mà `ad57396` vừa gỡ đi chính là quy trình mà OpenAI vẫn tài liệu
    hoá cho đường built-in.** Ba mảnh khớp thành một: model kèm ảnh ref hay trả RGB
    (⑬) · skill chính thức bảo cách xử là gen trên nền key phẳng rồi tách (⑮) ·
    kit-gen từ đầu làm đúng thế. Không tag release nào trước khi chốt lại hướng này.

    **⑯ ⑮ SAI. UPSTREAM ĐÃ CỐ Ý GIẾT ĐƯỜNG CHROMA CHO BUILT-IN — TỪ 10/08.**
    Chủ sản phẩm tìm ra commit, và tra `gh api` thì hết đường cãi:

    > `8cabf5a` — *"Use native transparency in the imagegen skill (#37788)"*, 2026-08-10
    > · *"Direct the built-in `image_gen` path to request transparent backgrounds and
    >   **preserve the generated alpha channel**."*
    > · *"**Remove** the built-in chroma-key generation and local background-removal
    >   workflow from the skill guidance and examples."*

    `gh api repos/openai/codex/compare/rust-v0.149.0...8cabf5a` → `status=behind,
    ahead=0, behind=519`, tức commit này là **tổ tiên của 0.149.0** — bản đang cài trên
    máy. Không phải "chưa tới", không phải "phải update skill": nó đã ở trong tay từ
    đầu. (`codex --version` = 0.149.0; `npm view @openai/codex version` = 0.149.0;
    0.150.0-alpha.* mới chỉ là prerelease.) Chính vì vậy `grep -c chroma SKILL.md` = 0.

    Vậy hai thứ tôi trưng ra ở ⑮ là **tàn dư, không phải hướng dẫn đang sống**: commit
    sửa đúng 5 file (SKILL.md + 4 file `references/`), **không đụng `scripts/`** — nên
    `remove_chroma_key.py` còn nằm đó với docstring cũ nói "built-in-first transparent
    workflow", và `image-api.md:71,73` còn nhắc chroma nhưng đã bị **thu hẹp vào đường
    CLI fallback tường minh** ("In explicit CLI/API fallback mode…"), không còn là lời
    khuyên cho đường built-in nữa. Tôi đọc docstring của một file bị bỏ quên rồi suy ra
    ý định của cả sản phẩm — đúng lại cái bẫy của [[kitgen-native-transparency-blocked]]:
    tin chữ trong file thay vì tra xem chữ đó còn hiệu lực không.

    **NHƯNG BÀI TOÁN KHÔNG VÌ THẾ MÀ DỄ ĐI — NÓ ĐỔI SANG DẠNG KHÓ HƠN.**
    Trước: "ta đi ngược tài liệu". Nay: "tài liệu bảo đường built-in ra alpha thật, mà
    ĐO ĐƯỢC nó không ra khi có ảnh đính kèm" (⑬: kèm ref ⇒ phần lớn trả RGB; codex bịt
    bằng `make_alpha.swift`). Upstream vừa **rút đi cái phao được phép dùng** trong khi
    lỗ thủng vẫn còn. Ba đường còn lại, không đường nào miễn phí:
      · **bỏ ảnh đính kèm** — alpha thật về đều (5/5 lượt), nhưng mất hợp đồng hình học;
        phải dựng lại bằng toạ độ pixel tường minh (probe E: sai số tâm 5–27px).
      · **giữ chroma-key của riêng kit-gen** — `slice.py` tự tách, không nhờ skill. Vẫn
        chạy được vì nó không phụ thuộc `remove_chroma_key.py`; chỉ là ta đi một đường
        mà upstream không còn đỡ lưng.
      · **CLI `gpt-image-1.5 --background transparent`** — đường DUY NHẤT được tài liệu
        công nhận là "true transparent", nhưng cần `OPENAI_API_KEY` và phải hỏi người
        dùng trước, tức phá mô hình "local-first, dùng phiên codex sẵn có".
    Chốt tạm cho 2.1.4x: **giữ chroma-key**, vì nó là đường duy nhất vừa đo được vừa
    không đòi thêm khoá API. Ghi lại đây để lần sau không ai lật lại bằng trí nhớ.
