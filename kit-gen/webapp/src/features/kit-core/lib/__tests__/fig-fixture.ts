/**
 * fig-fixture.ts — DỰNG MỘT LƯỢT DÁN «GIẢ MÀ ĐÚNG ĐỊNH DẠNG», **CHỈ CHO TEST**.
 *
 * ⚠️ KHÔNG phải file test và KHÔNG được import từ mã app.
 *
 * Payload thật của Figma không commit được vào repo (nặng, và là tài sản của
 * người khác), nên ca test dựng lấy một cái: cùng vỏ `fig-kiwi`, cùng cách nén,
 * cùng hình dạng lược đồ — chỉ nhỏ hơn. Lược đồ thử nghiệm cố ý đặt ĐÚNG những
 * cái tên mà bước này đi tìm (ràng buộc ngang/dọc, khoá tỉ lệ, cách trải ảnh)
 * để canh được phần chọn trường của bản tóm tắt.
 */
import { FIGMA_CLOSE, FIGMA_OPEN, FIGMETA_CLOSE, FIGMETA_OPEN } from "../fig-kiwi";
import type { KiwiSchema } from "../kiwi-decode";
import { encodeBinarySchema, encodeKiwiMessage, type PlainValue } from "./kiwi-write";

/** Bốn byte mở đầu của một tấm PNG — đủ để canh phần nhận mặt phần đính kèm. */
export const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const FIXTURE_SCHEMA: KiwiSchema = {
  definitions: [
    {
      name: "ConstraintType", kind: "ENUM",
      fields: [
        { name: "MIN", type: null, isArray: false, value: 0 },
        { name: "CENTER", type: null, isArray: false, value: 1 },
        { name: "MAX", type: null, isArray: false, value: 2 },
        { name: "STRETCH", type: null, isArray: false, value: 3 },
        { name: "SCALE", type: null, isArray: false, value: 4 },
      ],
    },
    {
      name: "ImageScaleMode", kind: "ENUM",
      fields: [
        { name: "FILL", type: null, isArray: false, value: 0 },
        { name: "FIT", type: null, isArray: false, value: 1 },
        { name: "TILE", type: null, isArray: false, value: 2 },
        { name: "STRETCH", type: null, isArray: false, value: 3 },
        { name: "CROP", type: null, isArray: false, value: 4 },
      ],
    },
    {
      name: "Vector", kind: "STRUCT",
      fields: [
        { name: "x", type: "float", isArray: false, value: 1 },
        { name: "y", type: "float", isArray: false, value: 2 },
      ],
    },
    {
      name: "Image", kind: "STRUCT",
      fields: [{ name: "hash", type: "string", isArray: false, value: 1 }],
    },
    {
      name: "Blob", kind: "STRUCT",
      fields: [{ name: "bytes", type: "byte", isArray: true, value: 1 }],
    },
    {
      name: "Paint", kind: "MESSAGE",
      fields: [
        { name: "type", type: "string", isArray: false, value: 1 },
        { name: "image", type: "Image", isArray: false, value: 2 },
        { name: "imageScaleMode", type: "ImageScaleMode", isArray: false, value: 3 },
        { name: "imageTransform", type: "float", isArray: true, value: 4 },
      ],
    },
    {
      name: "NodeChange", kind: "MESSAGE",
      fields: [
        { name: "type", type: "string", isArray: false, value: 1 },
        { name: "name", type: "string", isArray: false, value: 2 },
        { name: "size", type: "Vector", isArray: false, value: 3 },
        { name: "parentIndex", type: "uint", isArray: false, value: 4 },
        { name: "horizontalConstraint", type: "ConstraintType", isArray: false, value: 5 },
        { name: "verticalConstraint", type: "ConstraintType", isArray: false, value: 6 },
        { name: "proportionsConstrained", type: "bool", isArray: false, value: 7 },
        { name: "fillPaints", type: "Paint", isArray: true, value: 8 },
        { name: "frameMaskDisabled", type: "bool", isArray: false, value: 9 },
        /* Trường KHÔNG nằm trong danh sách quan tâm — có mặt để canh rằng bản
           tóm tắt lọc thật, chứ không phải chép nguyên node rồi khoe là đã lọc. */
        { name: "cornerRadius", type: "float", isArray: false, value: 10 },
      ],
    },
    {
      name: "Message", kind: "MESSAGE",
      fields: [
        { name: "type", type: "string", isArray: false, value: 1 },
        { name: "nodeChanges", type: "NodeChange", isArray: true, value: 2 },
        { name: "blobs", type: "Blob", isArray: true, value: 3 },
      ],
    },
  ],
};

/** Hai node lồng nhau, đúng hình dạng mà khuôn thật sẽ có: khung ngoài + khung ảnh. */
export const FIXTURE_MESSAGE: Record<string, PlainValue> = {
  type: "NODE_CHANGES",
  nodeChanges: [
    {
      type: "FRAME",
      name: "tpl",
      size: { x: 245, y: 85 },
      parentIndex: 0,
      horizontalConstraint: "MIN",
      verticalConstraint: "MIN",
      proportionsConstrained: true,
      fillPaints: [],
      frameMaskDisabled: false,
      cornerRadius: 0,
    },
    {
      type: "FRAME",
      name: "image",
      size: { x: 246.71, y: 85.66 },
      parentIndex: 1,
      horizontalConstraint: "SCALE",
      verticalConstraint: "SCALE",
      proportionsConstrained: true,
      fillPaints: [
        {
          type: "IMAGE",
          image: { hash: "abc123" },
          imageScaleMode: "CROP",
          imageTransform: [1, 0, 0, 0, 1, 0],
        },
      ],
      frameMaskDisabled: false,
      cornerRadius: 0,
    },
  ],
  blobs: [{ bytes: new Uint8Array([...PNG_HEAD, 1, 2, 3]) }],
};

export const FIXTURE_META = { fileKey: "kitgen-test", pasteID: 42, dataType: "scene" };

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = source.pipeThrough(new CompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const parts: Uint8Array[] = [];
  const reader = out.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) parts.push(value);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  return joined;
}

/** Vỏ `fig-kiwi`: chữ ký + số hiệu bản + chuỗi `[uint32 LE độ dài][byte]`. */
export function packFigKiwi(version: number, chunks: readonly Uint8Array[]): Uint8Array {
  const total = 12 + chunks.reduce((n, c) => n + 4 + c.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) out[i] = "fig-kiwi".charCodeAt(i);
  view.setUint32(8, version, true);
  let at = 12;
  for (const chunk of chunks) {
    view.setUint32(at, chunk.length, true);
    at += 4;
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface FixtureClipboard {
  html: string;
  schemaBytes: Uint8Array;
  messageBytes: Uint8Array;
  packed: Uint8Array;
}

/** Một lượt dán hoàn chỉnh: HTML + hai khối đã nén, dùng chung cho nhiều ca. */
export async function buildFixtureClipboard(version = 21): Promise<FixtureClipboard> {
  const schemaBytes = encodeBinarySchema(FIXTURE_SCHEMA);
  const messageBytes = encodeKiwiMessage(FIXTURE_SCHEMA, "Message", FIXTURE_MESSAGE);
  const packed = packFigKiwi(version, [await deflateRaw(schemaBytes), await deflateRaw(messageBytes)]);
  const meta = bytesToBase64(new TextEncoder().encode(JSON.stringify(FIXTURE_META)));
  /* Xuống dòng giữa base64 là chuyện THẬT của bộ nhớ tạm — nhét vào đây để ca
     test đi qua đúng cái bẫy đó thay vì một chuỗi sạch sẽ không có ngoài đời. */
  const figma = bytesToBase64(packed).replace(/(.{76})/g, "$1\n");
  return {
    html: `<meta charset="utf-8">${FIGMETA_OPEN}${meta}${FIGMETA_CLOSE}${FIGMA_OPEN}${figma}${FIGMA_CLOSE}<span>x</span>`,
    schemaBytes,
    messageBytes,
    packed,
  };
}
