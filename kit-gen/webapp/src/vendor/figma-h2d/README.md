# vendor/figma-h2d

Encoder clipboard **`figh2d`/`figmeta`** — thứ biến một cây DOM thành **node Figma
thật** (frame + image fill) khi dán bằng `Cmd+V`, thay vì một ảnh bitmap phẳng.

## Nguồn gốc

| | |
|---|---|
| File gốc trong repo | `kit-gen/figma-export/figma-h2d.global.js` |
| Commit đưa file vào repo | `7fe471f` — *"Skeleton ref cho codex, sheet 8 pose mascot, dán Figma ra node thật (figh2d)"* |
| Commit tiền thân | `0387b25` — *"Bê pipeline export Figma từ design-v3: capture IR + cầu nối canvas→display list"* |
| Kích thước bản gốc | **49 115 byte** |
| sha256 bản gốc | `735886cc915e8b0be3c366c75ece67c736fe2e227704304a4d4c4c28f00aec01` |
| Ngày vendor vào webapp | 2026-08-14 (P3-14, chủ sản phẩm đã duyệt) |

Bản gốc không có mã nguồn TypeScript đi kèm trong repo này — nó là **bundle đã
build** (esbuild IIFE, `src/index.ts` → `var figmaH2D = (() => { … })()`). Vì vậy
không nâng cấp bằng cách sửa tay; muốn đổi thì build lại từ repo `figma-h2d` gốc
rồi thay cả file.

## Đã vá gì

**Đúng một khối ở CUỐI file**, sau toàn bộ mã encoder:

```js
export default figmaH2D;
```

kèm chú thích giải thích. Không sửa, không xoá, không chèn một byte nào vào phần
encoder. `__tests__/vendor-integrity.test.ts` băm lại 49 115 byte đầu tiên của file
đã vendor và so với `sha256` ở bảng trên — sai một byte là test đỏ.

**Vì sao phải vá:** bundle là IIFE gán vào `var figmaH2D`. Trong một *classic
script* (`<script src=…>`) `var` ở top-level trở thành thuộc tính của `window` —
đó là cách `figma-export/copy-sprite-images.mjs` dùng nó (Playwright
`page.addScriptTag`). Nhưng Vite nạp file này như **ES module**, mà trong module
thì `var` chỉ nằm trong phạm vi module ⇒ không có đường nào lấy ra. Hai lựa chọn
khác đều tệ hơn:

- `import raw from "./…?raw"` + `new Function(raw)` — giữ nguyên 100% byte nhưng
  là `eval`, chết ngay ngày nào app dựng CSP.
- chèn `<script src>` lúc chạy — thêm một vòng mạng và một trạng thái toàn cục.

## Cách nạp

Không import file `.js` trực tiếp. Dùng `loadFigmaH2D()` trong `index.ts`:

```ts
import { loadFigmaH2D } from "@/vendor/figma-h2d";

const h2d = await loadFigmaH2D();          // chunk riêng, chỉ tải khi thật sự cần
const doc = await h2d.captureElement(frameEl);
const { html } = await h2d.toFigmaClipboardHtml([doc], { source: "kitgen-cut-asset" });
```

`import()` động ⇒ Vite tách thành chunk riêng (không nằm trong bundle khởi động),
và test thuần số học chạy ở `environment: "node"` không bao giờ chạm tới nó —
bundle đụng `window` / `document` / `Node` ngay khi thực thi.

`tsconfig.json` **không** bật `allowJs`, nên kiểu đến từ `figma-h2d.global.d.ts`
cạnh bên (TypeScript tự nối `foo.js` → `foo.d.ts`). File `.d.ts` đó chỉ mô tả bốn
hàm thật sự được dùng, không mô tả lại toàn bộ IR.

## Ràng buộc của encoder (đọc trước khi dùng)

1. **Element phải nằm trong document đã layout.** `capture()` gọi `assertLayout()`
   (`body.getBoundingClientRect()` phải khác 0), rồi `requestAnimationFrame`, rồi
   `getBoundingClientRect()` từng node. `display:none` hay node rời DOM ⇒ ném.
   Vì vậy `figma-node.ts` gắn frame vào `document.body` ở một sân khấu tàng hình
   (`position:fixed; opacity:0`) — **không** dùng `visibility:hidden`, vì
   `visibility` di truyền xuống con và sẽ bị chụp vào styles.
2. **Ảnh được `fetch()` lại từ `src`.** Object URL `blob:` cùng origin thì được;
   URL chéo origin không có CORS sẽ vào `assets` với `error` và Figma dán ra ô rỗng.
3. **Mỗi frame phải là ROOT của một document H2D.** Figma làm phẳng wrapper trong
   suốt khi nó nằm *bên trong* một board (ghi chú đầu `copy-sprite-images.mjs`).
4. **`overflow: visible` trên frame** ⇒ Figma đặt `Clip content = off`, tức phần
   ảnh tràn ra ngoài frame (đổ bóng, hoa lá) vẫn hiện.

## Ai đang dùng

- `src/features/workflow-v4/lib/figma-node.ts` — menu ⋯ → **Copy to Figma** của
  từng ô đã cắt.

Đường bitmap cũ (`features/kit/lib/figma-board.ts`) **vẫn giữ**, làm đường lùi khi
encoder ném.
