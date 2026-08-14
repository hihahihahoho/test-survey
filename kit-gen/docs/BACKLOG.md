# BACKLOG — cập nhật 2026-08-14

Gom từ: 2 báo cáo blind-test (designer candy + sci-fi), 2 research (glow, lỗ rỗ), báo cáo các agent fix, và các phát hiện vận hành. Mục nào có sẵn thiết kế/bằng chứng thì ghi kèm — làm là nhanh.

## P0 — Fix đã được validate, chỉ việc làm

1. **Lỗ rỗ trong lòng element (alpha⁴)** — 3 dòng `paste()` trong `slice.py` (dòng ~517/559/897) dùng chính ảnh làm mask → alpha bị bình phương 2 lần. Fix = `alpha_composite` (như `tools/safe_zone_asset.py:280` đã làm đúng). Đã A/B trên dữ liệu thật: 36 lỗ → 0; ruy băng hộp quà hồi +16.8% độ đục. Chi tiết: `docs/research-hole-artifacts-2026-08.md` (kèm 8 items xếp ưu tiên trong đó, gồm cả: ngưỡng `sref` đo từ viền model vẽ là bom hẹn giờ với art gần màu key; `slice.py` chưa có test coverage nào).
2. **Glow mất 57% độ sáng khi tách nền đen** — 1 dòng soft-gate trong `slice.py` (`a = mx·smoothstep(6,28)`): MAE 4.96→1.35, mất sáng 37%→0.6%. Chi tiết: `docs/research-glow-extraction-2026-08.md`.

## P1 — Thiết kế đã chốt hướng, cần làm

3. **Asset glow ship kèm blend mode, không bake alpha** — RGBA(alpha=max) + `plus-lighter` giống hệt từng bit nền-đen+additive (đã đo); thêm `blend: "screen"` vào manifest cho asset `matte:"glow"`; webapp preview dùng CSS `mix-blend-mode`; Figma cần plugin set `LINEAR_DODGE` sau paste (clipboard figma-h2d hiện KHÔNG gắn được blendMode — grep 0 hit).
4. **Setting chế độ nền per-element ở trang Skeleton UI** — mở rộng `matte:"glow"` có sẵn (KHÔNG dựng `bgMode` song song). Bẫy đã biết: `KitElementSkel` chỉ merge `w/h` tại `kitset-to-contract.ts` → field mới sẽ rơi im lặng nếu không sửa chỗ merge; `item-prompt.ts` phải mirror câu nền đen để preview không nói dối.
5. **Chọn màu chroma-key tự động XA palette style** — key magenta đá style neon magenta (prompt cấm màu gần key = tự cấm style); đổi key kéo theo `is_key_color()` trong slice.py, không chỉ thêm preset.
6. **Sửa vòng đo hình học trước, grid neo khung sau** — `validate_output_geometry.py` hardcode key xanh lá trong khi sheet magenta → 10/10 file `.geometry.json` vô giá trị. Chưa có số đo tin được thì chưa kết luận grid giúp hay hại (sai số thật đang 23–33px mean, pose tệ nhất, hai kiểu hỏng ngược chiều cùng tồn tại).

## P2 — Bug/nợ nhỏ đã biết chỗ

7. **Màu VNPAY còn sót 3 chỗ ngoài đường bug đã sửa**: `features/home/BrandScreen.tsx:95,106` · `features/design/components/StylesTab.tsx:261,268` · `features/kit-form/lib/form-model.ts:31`.
8. **Copy sai khi guard chặn ghi docs**: `docs-repo-local.ts:69` map mọi `false` thành "Máy đã hết chỗ lưu nháp" (STORAGE_FULL) kể cả khi nguyên nhân là giá trị bị chặn — cần mã lỗi riêng + copy mới trong `docs-errors.ts`.
9. **Cover job chỉ sống trong bộ nhớ** — agent restart giữa lúc vẽ thì meta kẹt `running`/trả `none`; nhẹ vì có nút vẽ lại, nhưng nên dọn meta mồ côi lúc boot.
10. **Bẫy cap `hits[:10]` trong gen.sh** — ô `08-progress-fill` đang đứng đúng 10/10 từ vật liệu bị hạ cấp; thêm 1 từ nữa vào spec là bị cắt âm thầm. Cân nhắc nới cap hoặc cảnh báo khi chạm.
11. **Retention cho `~/.kitgen/releases/`** — 20 bản × ~2.6MB tích mãi; sau update thành công giữ bản đang chạy + 1-2 bản rollback, xoá cũ hơn (sửa `install.sh`, ~10 dòng).
12. **E2e flake ở chế độ song song** — 2 ca `@visual` settings đỏ ngẫu nhiên khi `fullyParallel` (tái hiện cả trên baseline không patch); serial luôn xanh. Hoặc điều tra root cause, hoặc ép `--workers=1` trong CI cho ổn định.

## P3 — Việc to, cần quyết trước khi làm

13. **Vendor `figma-h2d` (~49KB) vào webapp** — để Copy Figma ra frame chuẩn safe-zone (frame đúng hitbox + ảnh offset âm + clip off) thay vì bitmap; dữ liệu safe/contentAt đã thông tới web từ 13/08. Chủ SP chưa chốt.
14. **Thay Playwright bằng renderer nhẹ (resvg/sharp)** — bỏ được ~220MB (headless-shell 196MB + playwright-core); đổi lại phải đảm bảo render skeleton HTML/SVG tương đương từng pixel. Cần spike so sánh ảnh trước.
15. **Grid xám/đen neo khung** — chỉ làm SAU khi (6) xong và có số liệu; §8.1 handoff đã đo "bắt vẽ lại grid" là fail, các biến thể (grid chỉ ở bleed, grid màu tách biệt xoá deterministic) chưa đo.

## Ghi chú vận hành cho lần update tới

- **2.1.18 → 2.1.19 sẽ reset hồ sơ codex đúng MỘT lần cuối** (update chạy install.sh của bản cũ; bản vá "không đè hồ sơ" nằm trong 2.1.19). Sau khi update: vào Cài đặt switch lại img-home (hoặc `PATCH /api/image-profile {"mode":"separate"}`). Từ 2.1.19 → sau: hết hẳn.
- Tương tự, gọn Chromium (--only-shell + dọn bản béo) và realpath codex trong config.env có hiệu lực từ lần update **sau** 2.1.19. Máy chủ SP đã được dọn tay (1.0GB → ~420MB sau khi xoá `~/.kitgen/tools/node_modules/@openai`).
- McAfee dò nhầm `rolldown-binding.darwin-arm64.node` (heuristic Artemis) và đã từng xoá file → cần thêm exclusion cho thư mục repo, không thì build hỏng ngẫu nhiên sau mỗi `npm install`.
