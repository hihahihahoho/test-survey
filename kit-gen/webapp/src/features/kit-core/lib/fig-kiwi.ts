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

export interface FigAnalysis {
  /** Mọi kiểu dữ liệu mà bộ nhớ tạm chào ra — in cả để biết còn cửa nào khác không. */
  clipboardTypes: string[];
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
  /** Mọi chỗ hỏng, viết ra hết — một bản phân tích im lặng còn tệ hơn không có. */
  errors: string[];
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Bản phân tích rỗng — dùng chung để mọi đường lỗi vẫn trả về đúng một hình dạng. */
function emptyAnalysis(types: string[], htmlChars: number): FigAnalysis {
  return {
    clipboardTypes: types,
    htmlChars,
    figmetaBase64Chars: 0,
    figmaBase64Chars: 0,
    figmeta: null,
    container: null,
    chunks: [],
    schema: null,
    message: null,
    errors: [],
  };
}

/**
 * Mổ một chuỗi HTML bộ nhớ tạm. KHÔNG ném: mọi hỏng hóc đi vào `errors` để phần
 * đọc được vẫn đọc được — một payload mở được nửa chừng vẫn nói được nhiều điều.
 */
export async function analyzeFigmaClipboardHtml(html: string, clipboardTypes: string[] = []): Promise<FigAnalysis> {
  const out = emptyAnalysis(clipboardTypes, html.length);
  const b64 = extractFigmaClipboardBase64(html);

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
    htmlChars: cut.htmlChars,
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
