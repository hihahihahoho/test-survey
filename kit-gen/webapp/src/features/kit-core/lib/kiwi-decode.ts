/**
 * kiwi-decode.ts — ĐỌC «kiwi» BẰNG TAY, KHÔNG SINH MÃ, KHÔNG `eval`.
 *
 * ╔══ VÌ SAO TỰ VIẾT THAY VÌ THÊM `kiwi-schema` ══════════════════════════════╗
 * ║ Gói `kiwi-schema` (evanw, MIT) có đúng hai thứ ta cần: `decodeBinarySchema`║
 * ║ và `compileSchema`. Đã mở gói 0.5.0 ra đọc, không đoán:                    ║
 * ║   · `decodeBinarySchema` dài ~55 dòng, thuần đọc byte — chép lại được.     ║
 * ║   · `compileSchema` thì **sinh mã JS rồi chạy bằng `new Function(...)`**   ║
 * ║     (`kiwi-esm.js:486`). Đó chính là `eval` dưới một cái tên khác: nó chết  ║
 * ║     dưới mọi CSP nghiêm túc, và nhiệm vụ này cấm thẳng.                    ║
 * ║ Tức thêm dependency vẫn KHÔNG dùng được nửa quan trọng của nó, và nửa dùng  ║
 * ║ được thì ngắn hơn cái `package.json` cần sửa. Nên: tự viết, và **đọc bằng  ║
 * ║ bộ thông dịch** — duyệt định nghĩa lúc chạy thay vì sinh hàm giải mã.       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * MỌI QUY TẮC ĐỌC BYTE DƯỚI ĐÂY CHÉP TỪ `kiwi-esm.js` 0.5.0 (bb.ts + js.ts),
 * không phải từ trí nhớ:
 *  · varuint  LEB128 7 bit, dừng khi bit 8 tắt hoặc shift ≥ 35.
 *  · varint   zigzag trên varuint: lẻ ⇒ `~(v >>> 1)`, chẵn ⇒ `v >>> 1`.
 *  · varfloat byte đầu bằng 0 ⇒ 0.0; ngược lại 4 byte LE rồi XOAY
 *             `bits << 23 | bits >>> 9` mới là float32 thật.
 *  · string   UTF-8, KẾT THÚC BẰNG BYTE 0 (không có tiền tố độ dài).
 *  · byte[]   varuint độ dài rồi bấy nhiêu byte thô (`readByteArray`).
 *  · STRUCT   mọi trường theo đúng thứ tự khai, không mã trường, không kết thúc.
 *  · MESSAGE  vòng lặp `varuint` mã trường; **0 là hết**. Mã lạ ⇒ KHÔNG bỏ qua
 *             được (không có độ dài để nhảy) nên phải ném.
 *  · ENUM     varuint, tra ngược ra tên.
 *
 * File này THUẦN: không DOM, không mạng, không `fs`. Test chạy được ở môi
 * trường "node" của repo.
 */

/** Ba loại định nghĩa mà kiwi có. Thứ tự đúng bằng số `kind` trong lược đồ nhị phân. */
export const KIWI_KINDS = ["ENUM", "STRUCT", "MESSAGE"] as const;
export type KiwiKind = (typeof KIWI_KINDS)[number];

/** Tám kiểu dựng sẵn. Trong lược đồ nhị phân chúng là số ÂM: `~(-1) = 0` ⇒ `bool`. */
export const KIWI_BUILTINS = [
  "bool", "byte", "int", "uint", "float", "string", "int64", "uint64",
] as const;
export type KiwiBuiltin = (typeof KIWI_BUILTINS)[number];

export interface KiwiField {
  name: string;
  /** Tên kiểu (dựng sẵn hoặc tên một definition). `null` với trường của ENUM. */
  type: string | null;
  isArray: boolean;
  /** Mã trường (MESSAGE) hoặc giá trị (ENUM). STRUCT không dùng. */
  value: number;
}

export interface KiwiDefinition {
  name: string;
  kind: KiwiKind;
  fields: KiwiField[];
}

export interface KiwiSchema {
  definitions: KiwiDefinition[];
}

/* ══════════════════════════════════════════════════════════════════════════
   ① ĐẦU ĐỌC BYTE
   ══════════════════════════════════════════════════════════════════════════ */

/** Bộ nhớ chung cho phép diễn giải lại 32 bit thành float32 — đúng cách `bb.ts` làm. */
const i32 = new Int32Array(1);
const f32 = new Float32Array(i32.buffer);

const utf8 = new TextDecoder("utf-8");

/** Đầu đọc một chiều. Mọi lỗi đều ném — im lặng trả 0 là cách nhanh nhất để đọc ra rác. */
export class KiwiReader {
  private readonly data: Uint8Array;
  private index = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /** Byte đã đọc — dùng để biết còn dư bao nhiêu sau khi giải xong một message. */
  get offset(): number {
    return this.index;
  }

  get remaining(): number {
    return this.data.length - this.index;
  }

  readByte(): number {
    if (this.index + 1 > this.data.length) throw new Error("Đọc quá cuối vùng byte.");
    return this.data[this.index++] as number;
  }

  readVarUint(): number {
    let value = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = this.readByte();
      value |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128 && shift < 35);
    return value >>> 0;
  }

  readVarInt(): number {
    const value = this.readVarUint() | 0;
    return value & 1 ? ~(value >>> 1) : value >>> 1;
  }

  readVarFloat(): number {
    if (this.index + 1 > this.data.length) throw new Error("Đọc quá cuối vùng byte.");
    const first = this.data[this.index] as number;
    /* Một byte 0 là cách kiwi viết số 0.0 — KHÔNG phải một float bốn byte toàn 0.
       Đọc nhầm chỗ này là lệch toàn bộ phần đuôi. */
    if (first === 0) {
      this.index += 1;
      return 0;
    }
    if (this.index + 4 > this.data.length) throw new Error("Đọc quá cuối vùng byte.");
    let bits = first
      | ((this.data[this.index + 1] as number) << 8)
      | ((this.data[this.index + 2] as number) << 16)
      | ((this.data[this.index + 3] as number) << 24);
    this.index += 4;
    bits = (bits << 23) | (bits >>> 9);
    i32[0] = bits;
    return f32[0] as number;
  }

  readVarUint64(): bigint {
    let value = 0n;
    let shift = 0n;
    let byte = 0;
    while (((byte = this.readByte()) & 128) !== 0 && shift < 56n) {
      value |= BigInt(byte & 127) << shift;
      shift += 7n;
    }
    value |= BigInt(byte) << shift;
    return value;
  }

  readVarInt64(): bigint {
    const value = this.readVarUint64();
    const sign = value & 1n;
    const half = value >> 1n;
    return sign ? ~half : half;
  }

  /** Chuỗi UTF-8 kết thúc bằng byte 0. Cắt rồi giải một lần bằng `TextDecoder`. */
  readString(): string {
    const start = this.index;
    let end = start;
    while (end < this.data.length && this.data[end] !== 0) end += 1;
    if (end >= this.data.length) throw new Error("Chuỗi không có byte kết thúc.");
    this.index = end + 1;
    return utf8.decode(this.data.subarray(start, end));
  }

  readByteArray(): Uint8Array {
    const length = this.readVarUint();
    const end = this.index + length;
    if (end > this.data.length) throw new Error("Mảng byte dài quá vùng còn lại.");
    const out = this.data.slice(this.index, end);
    this.index = end;
    return out;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ② LƯỢC ĐỒ NHỊ PHÂN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Giải khối đầu tiên của payload: chính bản mô tả mọi kiểu dữ liệu đi kèm.
 *
 * Nhờ khối này mà không cần biết trước Figma đặt tên trường là gì — thứ đang đi
 * tìm chính là tên thật của các trường ràng buộc / khoá tỉ lệ / chế độ trải ảnh.
 */
export function decodeBinarySchema(bytes: Uint8Array): KiwiSchema {
  const bb = new KiwiReader(bytes);
  const count = bb.readVarUint();
  const definitions: KiwiDefinition[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = bb.readString();
    const kindIndex = bb.readByte();
    const kind = KIWI_KINDS[kindIndex];
    if (kind === undefined) throw new Error(`Loại định nghĩa lạ: ${kindIndex}`);
    const fieldCount = bb.readVarUint();
    const fields: KiwiField[] = [];
    for (let j = 0; j < fieldCount; j += 1) {
      const fieldName = bb.readString();
      const rawType = bb.readVarInt();
      const isArray = (bb.readByte() & 1) !== 0;
      const value = bb.readVarUint();
      /* Giữ NGUYÊN số ở vòng này: kiểu có thể trỏ tới một definition khai sau,
         nên chỉ đổi số sang tên khi đã đọc hết danh sách. */
      fields.push({ name: fieldName, type: kind === "ENUM" ? null : (rawType as unknown as string), isArray, value });
    }
    definitions.push({ name, kind, fields });
  }
  for (const def of definitions) {
    for (const field of def.fields) {
      if (field.type === null) continue;
      const raw = field.type as unknown as number;
      if (raw < 0) {
        const builtin = KIWI_BUILTINS[~raw];
        if (builtin === undefined) throw new Error(`Kiểu dựng sẵn lạ: ${raw}`);
        field.type = builtin;
      } else {
        const target = definitions[raw];
        if (target === undefined) throw new Error(`Kiểu trỏ ra ngoài danh sách: ${raw}`);
        field.type = target.name;
      }
    }
  }
  return { definitions };
}

/* ══════════════════════════════════════════════════════════════════════════
   ③ BỘ THÔNG DỊCH — ĐỌC MESSAGE THEO LƯỢC ĐỒ, KHÔNG SINH MÃ
   ══════════════════════════════════════════════════════════════════════════ */

/** Giá trị đã giải. `Uint8Array` chỉ xuất hiện ở trường `byte[]`. */
export type KiwiValue =
  | boolean | number | string | Uint8Array
  | KiwiValue[]
  | { [key: string]: KiwiValue };

export interface KiwiDecodeOptions {
  /**
   * Trần số phần tử của MỘT mảng. Một byte hỏng ở chỗ độ dài là lời mời cấp phát
   * bốn tỉ phần tử; trần này biến cú treo máy thành một câu lỗi đọc được.
   * Mặc định: số byte còn lại (không mảng nào có thể nhiều phần tử hơn số byte).
   */
  maxArray?: number;
  /** Trần độ sâu lồng nhau — chặn lược đồ tự trỏ vòng. */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 64;

/** Tra cứu định nghĩa + bảng tra ngược của ENUM, dựng một lần cho cả lượt giải. */
class SchemaIndex {
  readonly byName = new Map<string, KiwiDefinition>();
  private readonly enums = new Map<string, Map<number, string>>();

  constructor(schema: KiwiSchema) {
    for (const def of schema.definitions) {
      this.byName.set(def.name, def);
      if (def.kind === "ENUM") {
        const table = new Map<number, string>();
        for (const field of def.fields) table.set(field.value, field.name);
        this.enums.set(def.name, table);
      }
    }
  }

  enumName(type: string, value: number): string {
    return this.enums.get(type)?.get(value) ?? `#${value}`;
  }
}

/** 64 bit về JSON: giữ `number` khi còn an toàn, ngược lại thành chuỗi thập phân. */
function narrow64(value: bigint): number | string {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value.toString();
}

function readScalar(bb: KiwiReader, index: SchemaIndex, type: string, depth: number, opts: KiwiDecodeOptions): KiwiValue {
  switch (type) {
    case "bool": return bb.readByte() !== 0;
    case "byte": return bb.readByte();
    case "int": return bb.readVarInt();
    case "uint": return bb.readVarUint();
    case "float": return bb.readVarFloat();
    case "string": return bb.readString();
    case "int64": return narrow64(bb.readVarInt64());
    case "uint64": return narrow64(bb.readVarUint64());
    default: break;
  }
  const def = index.byName.get(type);
  if (def === undefined) throw new Error(`Không có định nghĩa cho kiểu «${type}».`);
  if (def.kind === "ENUM") return index.enumName(type, bb.readVarUint());
  return readCompound(bb, index, def, depth + 1, opts);
}

function readField(
  bb: KiwiReader,
  index: SchemaIndex,
  field: KiwiField,
  depth: number,
  opts: KiwiDecodeOptions,
): KiwiValue {
  const type = field.type;
  if (type === null) throw new Error(`Trường «${field.name}» không có kiểu.`);
  if (field.isArray) {
    /* `byte[]` KHÔNG phải một mảng số: kiwi viết nó bằng `readByteArray`
       (varuint độ dài + byte thô). Đọc nhầm sang vòng lặp là lệch mọi thứ sau đó. */
    if (type === "byte") return bb.readByteArray();
    const count = bb.readVarUint();
    const cap = opts.maxArray ?? bb.remaining;
    if (count > cap) throw new Error(`Mảng «${field.name}» khai ${count} phần tử, nhiều hơn số byte còn lại.`);
    const out: KiwiValue[] = new Array<KiwiValue>(count);
    for (let i = 0; i < count; i += 1) out[i] = readScalar(bb, index, type, depth, opts);
    return out;
  }
  return readScalar(bb, index, type, depth, opts);
}

function readCompound(
  bb: KiwiReader,
  index: SchemaIndex,
  def: KiwiDefinition,
  depth: number,
  opts: KiwiDecodeOptions,
): Record<string, KiwiValue> {
  if (depth > (opts.maxDepth ?? DEFAULT_MAX_DEPTH)) {
    throw new Error(`Lồng quá sâu ở «${def.name}» — lược đồ có thể tự trỏ vòng.`);
  }
  const out: Record<string, KiwiValue> = {};
  if (def.kind === "STRUCT") {
    for (const field of def.fields) out[field.name] = readField(bb, index, field, depth, opts);
    return out;
  }
  for (;;) {
    const id = bb.readVarUint();
    if (id === 0) return out;
    const field = def.fields.find((f) => f.value === id);
    /* KHÔNG bỏ qua được trường lạ: định dạng không chở độ dài nên không biết nhảy
       bao nhiêu byte. Ném ở đây trung thực hơn là trả về một nửa dữ liệu. */
    if (field === undefined) throw new Error(`«${def.name}» không có trường mã ${id} — lược đồ và dữ liệu lệch nhau.`);
    out[field.name] = readField(bb, index, field, depth, opts);
  }
}

/**
 * Giải một khối dữ liệu theo lược đồ, bắt đầu từ definition tên `rootName`.
 * Trả luôn số byte đã dùng để người gọi biết còn dư (dư = đọc sai ở đâu đó).
 */
export function decodeKiwiMessage(
  schema: KiwiSchema,
  rootName: string,
  bytes: Uint8Array,
  opts: KiwiDecodeOptions = {},
): { value: Record<string, KiwiValue>; bytesRead: number; bytesLeft: number } {
  const index = new SchemaIndex(schema);
  const def = index.byName.get(rootName);
  if (def === undefined) throw new Error(`Lược đồ không có «${rootName}».`);
  if (def.kind === "ENUM") throw new Error(`«${rootName}» là một bảng liệt kê, không giải được thành cây.`);
  const bb = new KiwiReader(bytes);
  const value = readCompound(bb, index, def, 0, opts);
  return { value, bytesRead: bb.offset, bytesLeft: bb.remaining };
}

/**
 * Đoán definition gốc: ưu tiên đúng tên `Message` (tên Figma đang dùng), nếu
 * không có thì lấy MESSAGE nào KHÔNG bị definition nào khác trỏ tới.
 */
export function pickRootMessage(schema: KiwiSchema): string | null {
  const messages = schema.definitions.filter((d) => d.kind === "MESSAGE");
  if (messages.length === 0) return null;
  const exact = messages.find((d) => d.name === "Message");
  if (exact !== undefined) return exact.name;
  const referenced = new Set<string>();
  for (const def of schema.definitions) {
    for (const field of def.fields) {
      if (field.type !== null) referenced.add(field.type);
    }
  }
  const roots = messages.filter((d) => !referenced.has(d.name));
  return roots[0]?.name ?? messages[messages.length - 1]?.name ?? null;
}
