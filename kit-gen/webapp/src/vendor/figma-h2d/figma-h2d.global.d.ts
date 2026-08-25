/**
 * Khai báo kiểu cho `figma-h2d.global.js` (bundle JS đã build, KHÔNG có .d.ts đi kèm).
 *
 * `tsconfig.json` không bật `allowJs` ⇒ TypeScript sẽ không đọc file .js; nó tìm
 * `figma-h2d.global.d.ts` cạnh bên. Đây chỉ là BỀ MẶT tối thiểu mà `features/
 * kit-core/lib/figma-node.ts` dùng — không mô tả lại toàn bộ IR của encoder, vì
 * mô tả nửa vời một IR 49 KB thì sai nhiều hơn đúng.
 */

/** Hình chữ nhật trong hệ toạ độ viewport, đơn vị px CSS. */
export interface H2DRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Một node trong cây IR. `nodeType` 1 = element, 3 = text. */
export interface H2DNode {
  nodeType: 1 | 3;
  id?: string;
  /** Tên thẻ IN HOA: `"DIV"`, `"IMG"`. Chỉ có ở node element. */
  tag?: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  rect?: H2DRect;
  childNodes?: H2DNode[];
  content?: string;
  [key: string]: unknown;
}

/** Kết quả `captureElement` — một "document" H2D, root là chính element được chụp. */
export interface H2DDocument {
  root: H2DNode;
  documentRect: H2DRect;
  viewportRect: H2DRect;
  devicePixelRatio: number;
  version: number;
  /** khoá = URL ảnh gốc, giá trị = blob đã tải (hoặc `error` khi tải hỏng). */
  assets: Map<string, { url: string; blob: Blob | null; error?: string }>;
  [key: string]: unknown;
}

export interface CaptureOptions {
  assertLayoutValid?: boolean;
  skipRemoteAssetSerialization?: boolean;
  timeoutSignal?: AbortSignal;
}

export interface ClipboardOptions {
  source?: string;
  capturedAtIso?: string;
  plain?: string;
}

export interface FigmaClipboardPayload {
  /** `<span data-metadata="…"></span><span data-h2d="…"></span>` — dán vào Figma. */
  html: string;
  plain: string;
}

export interface FigmaH2D {
  captureElement(el: Element, options?: CaptureOptions): Promise<H2DDocument>;
  captureDocument(doc?: Document, options?: CaptureOptions): Promise<H2DDocument>;
  toFigmaClipboardHtml(
    docs: readonly H2DDocument[],
    options?: ClipboardOptions,
  ): Promise<FigmaClipboardPayload>;
  writeFigmaClipboard(docs: readonly H2DDocument[], options?: ClipboardOptions): Promise<void>;
}

declare const figmaH2D: FigmaH2D;
export default figmaH2D;
