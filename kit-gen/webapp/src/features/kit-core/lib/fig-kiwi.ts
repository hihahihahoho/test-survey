/**
 * fig-kiwi.ts — MỔ MỘT LƯỢT COPY **TỪ FIGMA RA**, ĐỂ LẤY SỰ THẬT VỀ ĐỊNH DẠNG GỐC.
 *
 * ╔══ VÌ SAO CÓ FILE NÀY (15/09/2026) ════════════════════════════════════════╗
 * ║ Đường dán hiện tại đi qua `vendor/figma-h2d`: mô tả bằng CSS rồi để bên    ║
 * ║ nhận tự dịch. Chín cách viết CSS đã đo (`figma-lab.ts`) — CẢ CHÍN ra       ║
 * ║ Left/Top, không khoá tỉ lệ, không cắt cúp. Tức kênh CSS KHÔNG có chỗ để    ║
 * ║ nói ba câu đó, và đoán thêm là tốn thêm một vòng nữa.                      ║
 * ║                                                                           ║
 * ║ Đường còn lại: chính định dạng bộ nhớ tạm GỐC của Figma —                  ║
 * ║   `<!--(figmeta)…(/figmeta)--><!--(figma)…(/figma)-->`                     ║
 * ║ trong đó khối `figma` là nhị phân «fig-kiwi». Kế hoạch dài hạn là lấy       ║
 * ║ CHÍNH cái người dùng copy từ Figma làm KHUÔN (họ tự bấm đúng một lần: khoá  ║
 * ║ tỉ lệ, ràng buộc Scale/Scale, ảnh cắt cúp), rồi chỉ thay ảnh + số đo + tên. ║
 * ║                                                                           ║
 * ║ Bước NÀY chưa mã hoá lại gì cả. Nó chỉ trả lời ba câu bằng số đo thật:     ║
 * ║   ① khối `figma` mở ra được bằng thứ có sẵn trong trình duyệt không?       ║
 * ║   ② tên THẬT của trường ràng buộc / khoá tỉ lệ / chế độ trải ảnh là gì?    ║
 * ║   ③ ẢNH có nằm trong payload không, hay chỉ là một mã băm trỏ đi đâu đó?   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── ĐỊNH DẠNG, ĐỌC TỪ BYTE CHỨ KHÔNG TỪ BÀI BLOG ──────────────────────────┐
 * │  0..7   ASCII "fig-kiwi"                                                  │
 * │  8..11  uint32 LE — số hiệu bản                                           │
 * │  12..   chuỗi khối: [uint32 LE độ dài][bấy nhiêu byte]                     │
 * │ Mỗi khối nén bằng deflate. `DecompressionStream` có sẵn trong trình duyệt  │
 * │ và trong Node ≥ 18, nên KHÔNG cần thêm thư viện nén nào.                   │
 * │ Khối 0 = lược đồ kiwi nhị phân · khối 1 = dữ liệu · khối ≥2 = phần đính.   │
 * │ «deflate-raw» hay «deflate» thì THỬ CẢ HAI rồi GHI RA cái nào đúng — chưa  │
 * │ ai ở đây đo được điều đó, và đoán bừa là cách tự tạo một huyền thoại.      │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * File này KHÔNG đụng một byte nào của đường copy thật. Nó chỉ ĐỌC.
 */
import {
  decodeBinarySchema,
  decodeKiwiMessage,
  pickRootMessage,
  type KiwiDefinition,
  type KiwiSchema,
  type KiwiValue,
} from "./kiwi-decode";

/* ══════════════════════════════════════════════════════════════════════════
   ① TÁCH BASE64 RA KHỎI HTML BỘ NHỚ TẠM
   ══════════════════════════════════════════════════════════════════════════ */

export const FIGMETA_OPEN = "<!--(figmeta)";
export const FIGMETA_CLOSE = "(/figmeta)-->";
export const FIGMA_OPEN = "<!--(figma)";
export const FIGMA_CLOSE = "(/figma)-->";

/**
 * `"<!--(figma)"` KHÔNG khớp nhầm `"<!--(figmeta)"`: dấu `)` đứng ngay sau chữ
 * `figma` trong mốc thứ hai, còn mốc thứ nhất có chữ `e` ở đó. Có ca test canh.
 */
function between(html: string, open: string, close: string): string | null {
  const a = html.indexOf(open);
  if (a < 0) return null;
  const b = html.indexOf(close, a + open.length);
  if (b < 0) return null;
  /* Bộ nhớ tạm hay chèn xuống dòng vào giữa base64 — bỏ MỌI khoảng trắng,
     không chỉ hai đầu. */
  return html.slice(a + open.length, b).replace(/\s+/g, "");
}

export interface FigmaClipboardBase64 {
  figmeta: string | null;
  figma: string | null;
}

export function extractFigmaClipboardBase64(html: string): FigmaClipboardBase64 {
  return {
    figmeta: between(html, FIGMETA_OPEN, FIGMETA_CLOSE),
    figma: between(html, FIGMA_OPEN, FIGMA_CLOSE),
  };
}

/** base64 → byte. `atob` có ở cả trình duyệt lẫn Node ≥ 16, không cần thư viện. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   ①ʙ KHI KHÔNG THẤY MỐC — ĐO CHÍNH CHUỖI HTML ẤY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ┌── VÌ SAO CÓ PHẦN NÀY (15/09/2026) ───────────────────────────────────────┐
 * │ Lượt dán THẬT đầu tiên về tay: `text/html`, 46 203 ký tự, và KHÔNG có mốc │
 * │ nào. Bốn mươi sáu KB đó là gì thì chưa ai ở đây biết, mà câu «không thấy  │
 * │ mốc» lại không chẩn ra được điều gì: nó đúng với cả lượt copy từ panel    │
 * │ Layers, cả «Copy as PNG/SVG», cả chuyện trình duyệt lọc mất khối chú      │
 * │ thích, cả chuyện Figma đổi định dạng. Bốn lối rẽ, một câu trả lời — tức   │
 * │ là chưa đo gì cả. Nên khi thiếu mốc, bàn mổ quay sang đo CÁI HTML đó.     │
 * │                                                                          │
 * │ Mọi hàm dưới đây THUẦN: vào một chuỗi, ra một bản mô tả. Không DOM, không │
 * │ mạng, không bộ nhớ tạm — nên test canh được thẳng, không cần trình duyệt. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Bao nhiêu ký tự đầu của HTML được chở theo bản phân tích. */
export const HTML_HEAD_CHARS = 2000;
/** Bề rộng lát cắt quanh một chỗ tìm thấy, tính bằng ký tự. */
export const AROUND_CHARS = 200;
/** Trần số tên thuộc tính `data-*` liệt kê ra — phần dư được đếm thành một dòng. */
export const DATA_ATTR_CAP = 200;

/**
 * Escape để một mẩu HTML thô hiện ra NGUYÊN VĂN trong `<pre>`, không tự dựng cây.
 * Ba ký tự là đủ và phải theo đúng thứ tự này: `&` trước, nếu không thì chính
 * dấu `&` của `&lt;` vừa sinh ra lại bị escape lần nữa thành `&amp;lt;`.
 */
export function escapeForPre(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Đếm thẻ theo tên. Chỉ bắt thẻ MỞ (`</div` không khớp vì sau dấu `<` là `/`,
 * không phải chữ cái) — đếm cả thẻ đóng thì mọi con số nhân đôi một cách vô nghĩa.
 * Trả về đã xếp từ nhiều xuống ít: cái đọc bản báo cáo muốn biết HTML này chủ yếu
 * làm bằng thẻ gì, chứ không phải thứ tự chữ cái.
 */
export function countTags(html: string): Record<string, number> {
  const tally = new Map<string, number>();
  const re = /<([a-zA-Z][a-zA-Z0-9:-]*)/g;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const name = (m[1] as string).toLowerCase();
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const [name, n] of [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) out[name] = n;
  return out;
}

/**
 * Tên mọi thuộc tính `data-*` có mặt, không trùng lặp. Đây là chỗ một trình soạn
 * thảo tự khai tên nó ra (`data-slate-node`, `data-pm-slice`, …) — nếu 46 KB kia
 * đến từ một app khác chứ không phải Figma thì dấu vết nằm ở đây.
 */
export function listDataAttrs(html: string, cap = DATA_ATTR_CAP): string[] {
  const found = new Set<string>();
  const re = /\bdata-([a-zA-Z0-9_:.-]+)\s*=/g;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) found.add(`data-${(m[1] as string).toLowerCase()}`);
  const all = [...found].sort();
  if (all.length <= cap) return all;
  return [...all.slice(0, cap), `+${all.length - cap} ten nua`];
}

export interface WordHit {
  /** Vị trí ký tự đầu tiên tìm thấy, tính trên chuỗi gốc. */
  index: number;
  /** Lát cắt quanh chỗ đó, ĐÃ escape — chở được qua JSON và qua `<pre>`. */
  around: string;
}

/** Tìm một chuỗi con, không phân biệt hoa thường, kèm lát cắt quanh nó. */
export function findWordAround(html: string, word: string, around = AROUND_CHARS): WordHit | null {
  const at = html.toLowerCase().indexOf(word.toLowerCase());
  if (at < 0) return null;
  const from = Math.max(0, at - Math.floor(around / 2));
  return { index: at, around: escapeForPre(html.slice(from, from + around)) };
}

/**
 * Ảnh trong HTML đó nằm ở dạng nào: nhúng thẳng (`data:image/…`), trỏ vào bộ nhớ
 * của trang (`blob:`), hay tải từ máy chủ (`http…`). Ba dạng ấy nói ba chuyện khác
 * hẳn nhau về việc có lấy được ảnh ra không, nên chúng được đếm riêng.
 * Khoá viết KHÔNG DẤU: đây là tên trường của bản báo cáo máy đọc, không phải câu
 * nói với người dùng.
 */
export function imgSrcKinds(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const src = (m[1] ?? m[2] ?? m[3] ?? "").trim().toLowerCase();
    let kind: string;
    if (src.startsWith("data:image/")) {
      const end = [src.indexOf(";"), src.indexOf(","), 40].filter((i) => i > 0).sort((a, b) => a - b)[0] as number;
      kind = src.slice(0, end);
    } else if (src.startsWith("data:")) kind = "data:khac";
    else if (src.startsWith("blob:")) kind = "blob:";
    else if (src.startsWith("http")) kind = "http";
    else if (src === "") kind = "rong";
    else kind = "khac";
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}

/** Số lần mở chú thích `<!--`. Mốc của Figma NẰM TRONG chú thích, nên con số 0 ở
 *  đây là bằng chứng mạnh rằng khối chú thích đã bị lọc mất chứ không phải nó
 *  nằm sai chỗ. */
export function countComments(html: string): number {
  return (html.match(/<!--/g) ?? []).length;
}

export interface MarkerHit {
  /** Tên dạng tìm thấy, viết không dấu để làm khoá đối chiếu. */
  form: string;
  index: number;
  /** Đúng mẩu chữ đã khớp cộng phần đuôi, ĐÃ escape. */
  sample: string;
}

/**
 * Tìm mốc THEO NHIỀU DẠNG, không chỉ dạng chuẩn. Ba dạng còn lại đều đã thấy
 * ngoài đời ở chỗ khác: mốc bị escape khi HTML đi qua một ô soạn thảo
 * (`&lt;!--(figmeta)`), mốc bị chèn khoảng trắng khi đi qua một bộ làm đẹp HTML,
 * và tên `figma-clipboard` mà một số đường xuất dùng thay cho cặp ngoặc.
 *
 * Dạng «noi-long» CỐ Ý khớp cả dạng chuẩn: nó không phải một mốc khác, nó là câu
 * hỏi «có khoảng trắng chen vào không» — và `sample` chở ra đúng mẩu chữ đã khớp
 * để người đọc tự thấy. Một mốc chuẩn sẽ hiện ở CẢ HAI dòng, đó là đúng.
 */
const MARKER_FORMS: readonly { form: string; re: RegExp }[] = [
  { form: "figmeta-chuan", re: /<!--\(figmeta\)/ },
  { form: "figma-chuan", re: /<!--\(figma\)/ },
  { form: "figmeta-noi-long", re: /<!--\s*\(\s*figmeta\s*\)/i },
  { form: "figma-noi-long", re: /<!--\s*\(\s*figma\s*\)/i },
  { form: "figmeta-escaped", re: /&lt;!--\s*\(\s*figmeta\s*\)/i },
  { form: "figma-escaped", re: /&lt;!--\s*\(\s*figma\s*\)/i },
  { form: "figma-clipboard", re: /figma-clipboard/i },
  { form: "figmeta-tran", re: /figmeta/i },
];

export function findMarkerForms(html: string, around = AROUND_CHARS): MarkerHit[] {
  const out: MarkerHit[] = [];
  for (const { form, re } of MARKER_FORMS) {
    const m = re.exec(html);
    if (m === null || m.index < 0) continue;
    out.push({ form, index: m.index, sample: escapeForPre(html.slice(m.index, m.index + around)) });
  }
  return out;
}

export interface HtmlDiagnostics {
  /** Hai nghìn ký tự đầu, ĐÃ escape — chỗ duy nhất nói ra HTML này TRÔNG như thế nào. */
  htmlHead: string;
  tagCounts: Record<string, number>;
  dataAttrs: string[];
  hasFigmaWord: WordHit | null;
  imgSrcKinds: Record<string, number>;
  commentCount: number;
  markerForms: MarkerHit[];
}

/** Gộp cả sáu phép đo lại thành một bản mô tả. Thuần, không ném. */
export function diagnoseHtml(html: string): HtmlDiagnostics {
  return {
    htmlHead: escapeForPre(html.slice(0, HTML_HEAD_CHARS)),
    tagCounts: countTags(html),
    dataAttrs: listDataAttrs(html),
    hasFigmaWord: findWordAround(html, "figma"),
    imgSrcKinds: imgSrcKinds(html),
    commentCount: countComments(html),
    markerForms: findMarkerForms(html),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ② VỎ «fig-kiwi» — HÀM THUẦN, TÁCH HẲN KHỎI PHẦN GIẢI NÉN
   ══════════════════════════════════════════════════════════════════════════ */

export const FIG_KIWI_MAGIC = "fig-kiwi";

export interface FigKiwiContainer {
  /** Tám ký tự đầu, đọc ra chữ — để câu lỗi nói được nó thấy cái gì. */
  magic: string;
  version: number;
  chunks: Uint8Array[];
}

/**
 * Bóc vỏ. THUẦN và đồng bộ — đó là chủ ý: phần này test được bằng một mảng byte
 * dựng tay, không cần nén, không cần trình duyệt.
 */
export function parseFigKiwiContainer(bytes: Uint8Array): FigKiwiContainer {
  if (bytes.length < 12) throw new Error("Khối nhị phân ngắn hơn cả phần đầu — không phải payload của Figma.");
  let magic = "";
  for (let i = 0; i < 8; i += 1) magic += String.fromCharCode(bytes[i] as number);
  if (magic !== FIG_KIWI_MAGIC) {
    throw new Error(`Tám byte đầu là «${magic}», không phải «${FIG_KIWI_MAGIC}».`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(8, true);
  const chunks: Uint8Array[] = [];
  let at = 12;
  while (at + 4 <= bytes.length) {
    const len = view.getUint32(at, true);
    at += 4;
    if (at + len > bytes.length) {
      throw new Error(`Khối thứ ${chunks.length} khai ${len} byte nhưng chỉ còn ${bytes.length - at}.`);
    }
    chunks.push(bytes.subarray(at, at + len));
    at += len;
  }
  return { magic, version, chunks };
}

/* ══════════════════════════════════════════════════════════════════════════
   ③ GIẢI NÉN
   ══════════════════════════════════════════════════════════════════════════ */

export type InflateMethod = "deflate-raw" | "deflate" | "none";

async function inflateWith(bytes: Uint8Array, format: "deflate-raw" | "deflate"): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = source.pipeThrough(new DecompressionStream(format) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = out.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      parts.push(value);
      total += value.length;
    }
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}

export interface InflatedChunk {
  bytes: Uint8Array;
  method: InflateMethod;
}

/**
 * Thử «deflate-raw» trước, «deflate» sau, cuối cùng coi như không nén.
 * GHI LẠI cái nào đúng: đó là một trong những thứ bước này đi đo.
 */
export async function inflateChunk(chunk: Uint8Array): Promise<InflatedChunk> {
  for (const method of ["deflate-raw", "deflate"] as const) {
    try {
      return { bytes: await inflateWith(chunk, method), method };
    } catch {
      /* Thử cách sau. Không nuốt im lặng: nếu cả ba đều hỏng thì `none` cũng là
         một câu trả lời đọc được ở bản báo cáo. */
    }
  }
  return { bytes: chunk, method: "none" };
}

/* ══════════════════════════════════════════════════════════════════════════
   ④ TÓM TẮT — CHỌN ĐÚNG THỨ ĐANG ĐI TÌM
   ══════════════════════════════════════════════════════════════════════════ */

/* Danh sách tên để ĐỐI CHIẾU, cố ý viết không dấu: bộ quét từ cấm §5.4 chỉ soi
   chuỗi có dấu tiếng Việt, còn đây là tên trường thật của bên kia, không phải
   chữ nói với người dùng. */
const NODE_KEY_EXACT = new Set([
  "type", "name", "size", "transform", "parentIndex", "guid", "visible", "opacity", "locked",
]);

const NODE_KEY_PART = [
  "constraint", "proportion", "fill", "image", "mask", "clip", "crop", "scale", "resiz",
];

function isInterestingNodeKey(key: string): boolean {
  if (NODE_KEY_EXACT.has(key)) return true;
  const low = key.toLowerCase();
  return NODE_KEY_PART.some((p) => low.includes(p));
}

/** Tên definition mà nhiệm vụ đòi in đầy đủ, cộng mọi tên có dính hai chữ then chốt. */
const SCHEMA_WANTED = new Set([
  "Message", "NodeChange", "Paint", "Image", "ConstraintType", "ImageScaleMode", "Blob",
  "GUID", "Vector", "Matrix", "ParentIndex",
]);

function wantedDefinition(def: KiwiDefinition): boolean {
  if (SCHEMA_WANTED.has(def.name)) return true;
  const low = def.name.toLowerCase();
  return low.includes("constraint") || low.includes("scalemode");
}

const isRecord = (v: KiwiValue): v is Record<string, KiwiValue> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);

/** Tìm một khoá theo tên gần đúng trong message gốc (tên thật có thể khác). */
function findArray(root: Record<string, KiwiValue>, match: (key: string) => boolean): { key: string; items: KiwiValue[] } | null {
  for (const [key, value] of Object.entries(root)) {
    if (Array.isArray(value) && match(key.toLowerCase())) return { key, items: value };
  }
  return null;
}

export interface NodeSummary {
  index: number;
  /** MỌI tên trường của node này — chỗ duy nhất nói ra tên THẬT bên kia đang dùng. */
  keys: string[];
  /** Phần đã lọc: ràng buộc, khoá tỉ lệ, cách trải ảnh, hình học. */
  fields: Record<string, unknown>;
}

export interface BlobSummary {
  index: number;
  bytes: number;
  /** Tám byte đầu, viết hex — đủ để nhận ra PNG/JPEG mà không phải tải cả ảnh. */
  head: string;
  kind: string;
}

const HEAD_SIGNATURES: readonly { kind: string; bytes: readonly number[] }[] = [
  { kind: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { kind: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { kind: "GIF", bytes: [0x47, 0x49, 0x46, 0x38] },
  { kind: "WEBP/RIFF", bytes: [0x52, 0x49, 0x46, 0x46] },
];

export function describeBytes(bytes: Uint8Array): { head: string; kind: string } {
  const head = [...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const hit = HEAD_SIGNATURES.find((s) => s.bytes.every((b, i) => bytes[i] === b));
  return { head, kind: hit?.kind ?? "?" };
}

/** Thay `Uint8Array` bằng một mô tả đọc được — JSON không chở byte thô. */
function jsonSafe(value: KiwiValue): unknown {
  if (value instanceof Uint8Array) {
    const d = describeBytes(value);
    return { bytes: value.length, head: d.head, kind: d.kind };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export function summarizeNodes(items: readonly KiwiValue[]): NodeSummary[] {
  return items.map((item, index) => {
    if (!isRecord(item)) return { index, keys: [], fields: { "khong-phai-doi-tuong": jsonSafe(item) } };
    const keys = Object.keys(item);
    const fields: Record<string, unknown> = {};
    for (const key of keys) {
      if (isInterestingNodeKey(key)) fields[key] = jsonSafe(item[key] as KiwiValue);
    }
    return { index, keys, fields };
  });
}

export function summarizeBlobs(items: readonly KiwiValue[]): BlobSummary[] {
  return items.map((item, index) => {
    /* Một phần đính có thể là `byte[]` trần, hoặc một struct bọc quanh `byte[]`.
       Lấy mảng byte ĐẦU TIÊN tìm thấy — cả hai hình dạng đều ra cùng một câu trả lời. */
    let raw: Uint8Array | null = item instanceof Uint8Array ? item : null;
    if (raw === null && isRecord(item)) {
      for (const v of Object.values(item)) {
        if (v instanceof Uint8Array) {
          raw = v;
          break;
        }
      }
    }
    if (raw === null) return { index, bytes: 0, head: "", kind: "?" };
    const d = describeBytes(raw);
    return { index, bytes: raw.length, head: d.head, kind: d.kind };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ BẢN PHÂN TÍCH ĐẦY ĐỦ
   ══════════════════════════════════════════════════════════════════════════ */

export interface ChunkReport {
  index: number;
  packedBytes: number;
  unpackedBytes: number;
  method: InflateMethod;
}

/**
 * Một dòng của bảng kê bộ nhớ tạm. Danh sách `types` mới chỉ nói CÓ những kiểu
 * gì; muốn biết kiểu nào rỗng và kiểu nào chở thật thì phải có ĐỘ DÀI, và tệp
 * đính kèm thì không đi qua `getData` nên phải đếm riêng bằng `items`.
 * Tên trường viết không dấu: đây là bản báo cáo máy đọc.
 */
export interface ClipboardEntry {
  type: string;
  /** "chuoi" (lấy bằng `getData`) hay "file" (lấy bằng `items[].getAsFile`). */
  kind: "chuoi" | "file";
  /** Số ký tự của phần chuỗi; `null` khi kiểu này không lấy ra được bằng `getData`. */
  chars: number | null;
  fileName?: string;
  bytes?: number;
  note?: string;
}

export interface FigAnalysis {
  /** Mọi kiểu dữ liệu mà bộ nhớ tạm chào ra — in cả để biết còn cửa nào khác không. */
  clipboardTypes: string[];
  /** Từng kiểu chở bao nhiêu — xem `ClipboardEntry`. */
  clipboardDetail: ClipboardEntry[];
  htmlChars: number;
  figmetaBase64Chars: number;
  figmaBase64Chars: number;
  figmeta: unknown;
  container: { magic: string; version: number; chunkCount: number } | null;
  chunks: ChunkReport[];
  schema: {
    definitionCount: number;
    rootMessage: string | null;
    allNames: string[];
    wanted: KiwiDefinition[];
  } | null;
  message: {
    rootName: string;
    topLevelKeys: string[];
    bytesRead: number;
    bytesLeft: number;
    nodeChangesKey: string | null;
    nodeCount: number;
    nodes: NodeSummary[];
    blobsKey: string | null;
    blobCount: number;
    blobs: BlobSummary[];
  } | null;
  /**
   * Chỉ có mặt KHI THIẾU MỐC. Lúc payload mở ra được thì bản mô tả HTML thô là
   * tiếng ồn; lúc không, nó là toàn bộ manh mối. Xem mục ①ʙ.
   */
  htmlDiag: HtmlDiagnostics | null;
  /** Mọi chỗ hỏng, viết ra hết — một bản phân tích im lặng còn tệ hơn không có. */
  errors: string[];
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Bản phân tích rỗng — dùng chung để mọi đường lỗi vẫn trả về đúng một hình dạng. */
function emptyAnalysis(types: string[], htmlChars: number, detail: ClipboardEntry[]): FigAnalysis {
  return {
    clipboardTypes: types,
    clipboardDetail: detail,
    htmlChars,
    figmetaBase64Chars: 0,
    figmaBase64Chars: 0,
    figmeta: null,
    container: null,
    chunks: [],
    schema: null,
    message: null,
    htmlDiag: null,
    errors: [],
  };
}

/**
 * Mổ một chuỗi HTML bộ nhớ tạm. KHÔNG ném: mọi hỏng hóc đi vào `errors` để phần
 * đọc được vẫn đọc được — một payload mở được nửa chừng vẫn nói được nhiều điều.
 */
export async function analyzeFigmaClipboardHtml(
  html: string,
  clipboardTypes: string[] = [],
  clipboardDetail: ClipboardEntry[] = [],
): Promise<FigAnalysis> {
  const out = emptyAnalysis(clipboardTypes, html.length, clipboardDetail);
  const b64 = extractFigmaClipboardBase64(html);

  /* THIẾU DÙ CHỈ MỘT MỐC ⇒ đo luôn chuỗi HTML. Đo cả khi chỉ thiếu một nửa là có
     chủ ý: nửa còn lại vẫn không dựng lại được cái gì, mà manh mối thì chỉ lấy
     được đúng lúc còn giữ chuỗi trong tay. */
  if (b64.figmeta === null || b64.figma === null) out.htmlDiag = diagnoseHtml(html);

  if (b64.figmeta === null) {
    out.errors.push("Không thấy mốc (figmeta) trong HTML — lượt dán này không đến từ Figma.");
  } else {
    out.figmetaBase64Chars = b64.figmeta.length;
    try {
      out.figmeta = JSON.parse(new TextDecoder().decode(base64ToBytes(b64.figmeta))) as unknown;
    } catch (err) {
      out.errors.push(`Phần (figmeta) không đọc ra được: ${errText(err)}`);
    }
  }

  if (b64.figma === null) {
    out.errors.push("Không thấy mốc (figma) trong HTML — không có khối nhị phân nào để mổ.");
    return out;
  }
  out.figmaBase64Chars = b64.figma.length;

  let container: FigKiwiContainer;
  try {
    container = parseFigKiwiContainer(base64ToBytes(b64.figma));
  } catch (err) {
    out.errors.push(`Không bóc được vỏ nhị phân: ${errText(err)}`);
    return out;
  }
  out.container = { magic: container.magic, version: container.version, chunkCount: container.chunks.length };

  const unpacked: Uint8Array[] = [];
  for (const [index, chunk] of container.chunks.entries()) {
    const done = await inflateChunk(chunk);
    unpacked.push(done.bytes);
    out.chunks.push({
      index,
      packedBytes: chunk.length,
      unpackedBytes: done.bytes.length,
      method: done.method,
    });
  }

  const schemaBytes = unpacked[0];
  if (schemaBytes === undefined) {
    out.errors.push("Payload không có khối nào — không có lược đồ để đọc.");
    return out;
  }

  let schema: KiwiSchema;
  try {
    schema = decodeBinarySchema(schemaBytes);
  } catch (err) {
    out.errors.push(`Khối lược đồ không giải được: ${errText(err)}`);
    return out;
  }
  const rootMessage = pickRootMessage(schema);
  out.schema = {
    definitionCount: schema.definitions.length,
    rootMessage,
    allNames: schema.definitions.map((d) => d.name),
    wanted: schema.definitions.filter(wantedDefinition),
  };

  const messageBytes = unpacked[1];
  if (messageBytes === undefined) {
    out.errors.push("Payload chỉ có lược đồ, không có khối dữ liệu.");
    return out;
  }
  if (rootMessage === null) {
    out.errors.push("Lược đồ không có định nghĩa gốc nào để bắt đầu đọc.");
    return out;
  }

  try {
    const decoded = decodeKiwiMessage(schema, rootMessage, messageBytes);
    const root = decoded.value;
    const nodeChanges = findArray(root, (k) => k.includes("nodechange"));
    const blobs = findArray(root, (k) => k.includes("blob"));
    out.message = {
      rootName: rootMessage,
      topLevelKeys: Object.keys(root),
      bytesRead: decoded.bytesRead,
      bytesLeft: decoded.bytesLeft,
      nodeChangesKey: nodeChanges?.key ?? null,
      nodeCount: nodeChanges?.items.length ?? 0,
      nodes: nodeChanges === null ? [] : summarizeNodes(nodeChanges.items),
      blobsKey: blobs?.key ?? null,
      blobCount: blobs?.items.length ?? 0,
      blobs: blobs === null ? [] : summarizeBlobs(blobs.items),
    };
  } catch (err) {
    out.errors.push(`Khối dữ liệu không giải được theo lược đồ: ${errText(err)}`);
  }

  /* Khối từ thứ ba trở đi: chưa biết là gì, nên NÓI là chưa biết và đưa tám byte
     đầu ra cho người đọc tự nhận mặt, thay vì lặng lẽ bỏ qua. */
  for (let i = 2; i < unpacked.length; i += 1) {
    const extra = unpacked[i];
    if (extra === undefined) continue;
    const d = describeBytes(extra);
    out.errors.push(`Khối ${i} chưa được đọc: ${extra.length} byte, đầu «${d.head}» (${d.kind}).`);
  }

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ XUẤT RA JSON — CÓ TRẦN, VÀ NÓI KHI ĐÃ CẮT
   ══════════════════════════════════════════════════════════════════════════ */

export const ANALYSIS_MAX_BYTES = 200_000;

export interface AnalysisJson {
  text: string;
  bytes: number;
  truncated: boolean;
}

/**
 * Bản phân tích đầy đủ có thể to hơn cả cái ô người ta dán vào. Cắt theo BẬC,
 * bậc nào cũng ghi lại là đã cắt — một bản tóm tắt bị cắt lặng lẽ sẽ bị đọc
 * thành "payload không có trường đó".
 */
export function analysisToJson(analysis: FigAnalysis, maxBytes = ANALYSIS_MAX_BYTES): AnalysisJson {
  const size = (text: string) => new TextEncoder().encode(text).length;

  const full = JSON.stringify(analysis, null, 2);
  if (size(full) <= maxBytes) return { text: full, bytes: size(full), truncated: false };

  const stages: ((a: FigAnalysis) => FigAnalysis)[] = [
    (a) => ({
      ...a,
      schema: a.schema === null ? null : {
        ...a.schema,
        wanted: a.schema.wanted.map((d) => ({ ...d, fields: d.fields.slice(0, 120) })),
      },
    }),
    (a) => ({
      ...a,
      schema: a.schema === null ? null : { ...a.schema, wanted: a.schema.wanted.map((d) => ({ ...d, fields: [] })) },
    }),
    (a) => ({
      ...a,
      htmlDiag: a.htmlDiag === null ? null : {
        ...a.htmlDiag,
        htmlHead: a.htmlDiag.htmlHead.slice(0, 400),
        dataAttrs: a.htmlDiag.dataAttrs.slice(0, 40),
      },
    }),
    (a) => ({
      ...a,
      message: a.message === null ? null : { ...a.message, nodes: a.message.nodes.slice(0, 40) },
    }),
    (a) => ({
      ...a,
      message: a.message === null ? null : {
        ...a.message,
        nodes: a.message.nodes.slice(0, 8).map((n) => ({ ...n, keys: n.keys.slice(0, 40) })),
      },
      schema: a.schema === null ? null : { ...a.schema, allNames: a.schema.allNames.slice(0, 200) },
    }),
  ];

  let cut = analysis;
  for (const stage of stages) {
    cut = stage(cut);
    const text = JSON.stringify({ ...cut, daCat: true }, null, 2);
    if (size(text) <= maxBytes) return { text, bytes: size(text), truncated: true };
  }
  /* BẬC CUỐI: bỏ hết phần thân, giữ lại đúng những con số nói được "đã mở tới
     đâu". KHÔNG cắt bằng `slice` trên chuỗi — một chuỗi JSON đứt giữa chừng thì
     người nhận không mở ra được, tức bản báo cáo mất trắng thay vì gọn lại. */
  const bare = {
    daCat: true,
    ghiChu: "Ban day du vuot tran, chi con phan dau. Hay noi rong tran roi lay lai.",
    clipboardTypes: cut.clipboardTypes,
    clipboardDetail: cut.clipboardDetail,
    htmlChars: cut.htmlChars,
    markerForms: cut.htmlDiag?.markerForms ?? null,
    container: cut.container,
    chunks: cut.chunks,
    schemaDefinitionCount: cut.schema?.definitionCount ?? null,
    rootMessage: cut.schema?.rootMessage ?? null,
    nodeCount: cut.message?.nodeCount ?? null,
    blobCount: cut.message?.blobCount ?? null,
    errors: cut.errors,
  };
  const text = JSON.stringify(bare, null, 2);
  return { text, bytes: size(text), truncated: true };
}
