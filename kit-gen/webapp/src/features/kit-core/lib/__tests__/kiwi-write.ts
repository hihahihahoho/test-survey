/**
 * kiwi-write.ts — BỘ GHI «kiwi» TỐI THIỂU, **CHỈ DÙNG CHO TEST**.
 *
 * ⚠️ KHÔNG phải file test (không có `.test.ts`) và KHÔNG được import từ mã app.
 *
 * ┌── VÌ SAO PHẢI CÓ ─────────────────────────────────────────────────────────┐
 * │ Bộ đọc thật (`kiwi-decode.ts`) chép quy tắc byte từ `kiwi-esm.js` 0.5.0.   │
 * │ Muốn canh nó, phải có dữ liệu ĐÚNG ĐỊNH DẠNG để đưa vào — mà payload thật  │
 * │ của Figma thì không commit được (nặng, và là tài sản của người khác). Nên  │
 * │ bộ ghi này dựng dữ liệu tổng hợp: cùng quy tắc, ngược chiều.               │
 * │                                                                           │
 * │ Bộ ghi cũng chép từ CHÍNH `kiwi-esm.js` (phần `write*`), không phải viết   │
 * │ đối xứng theo trí nhớ của bộ đọc — nếu cả hai cùng sai một kiểu thì ca test│
 * │ vẫn xanh mà sản phẩm vẫn hỏng. Điểm neo là bản gốc, không phải file kia.   │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { KIWI_BUILTINS, KIWI_KINDS, type KiwiDefinition, type KiwiSchema } from "../kiwi-decode";

const i32 = new Int32Array(1);
const f32 = new Float32Array(i32.buffer);
const utf8 = new TextEncoder();

export class KiwiWriter {
  private out: number[] = [];

  bytes(): Uint8Array {
    return new Uint8Array(this.out);
  }

  byte(value: number): this {
    this.out.push(value & 255);
    return this;
  }

  raw(values: Uint8Array): this {
    for (const b of values) this.out.push(b);
    return this;
  }

  varUint(value: number): this {
    let v = value >>> 0;
    do {
      const b = v & 127;
      v >>>= 7;
      this.byte(v !== 0 ? b | 128 : b);
    } while (v !== 0);
    return this;
  }

  varInt(value: number): this {
    return this.varUint(((value << 1) ^ (value >> 31)) >>> 0);
  }

  varFloat(value: number): this {
    f32[0] = value;
    let bits = i32[0] as number;
    bits = (bits >>> 23) | (bits << 9);
    if ((bits & 255) === 0) return this.byte(0);
    return this.byte(bits).byte(bits >> 8).byte(bits >> 16).byte(bits >> 24);
  }

  /** Chuỗi UTF-8 + byte 0 kết thúc. */
  string(value: string): this {
    return this.raw(utf8.encode(value)).byte(0);
  }

  byteArray(value: Uint8Array): this {
    return this.varUint(value.length).raw(value);
  }
}

/** Mã kiểu trong lược đồ nhị phân: dựng sẵn là số ÂM, định nghĩa là chỉ số. */
export function typeCode(schema: KiwiSchema, type: string): number {
  const builtin = KIWI_BUILTINS.indexOf(type as (typeof KIWI_BUILTINS)[number]);
  if (builtin >= 0) return ~builtin;
  const index = schema.definitions.findIndex((d) => d.name === type);
  if (index < 0) throw new Error(`Lược đồ thử nghiệm thiếu «${type}».`);
  return index;
}

/** Ghi lược đồ nhị phân — nghịch đảo của `decodeBinarySchema`. */
export function encodeBinarySchema(schema: KiwiSchema): Uint8Array {
  const w = new KiwiWriter();
  w.varUint(schema.definitions.length);
  for (const def of schema.definitions) {
    w.string(def.name);
    w.byte(KIWI_KINDS.indexOf(def.kind));
    w.varUint(def.fields.length);
    for (const field of def.fields) {
      w.string(field.name);
      w.varInt(def.kind === "ENUM" || field.type === null ? 0 : typeCode(schema, field.type));
      w.byte(field.isArray ? 1 : 0);
      w.varUint(field.value);
    }
  }
  return w.bytes();
}

/** Giá trị đưa vào bộ ghi. `Uint8Array` chỉ hợp lệ ở trường `byte[]`. */
export type PlainValue =
  | boolean | number | string | Uint8Array
  | PlainValue[]
  | { [key: string]: PlainValue };

function findDef(schema: KiwiSchema, name: string): KiwiDefinition {
  const def = schema.definitions.find((d) => d.name === name);
  if (def === undefined) throw new Error(`Lược đồ thử nghiệm thiếu «${name}».`);
  return def;
}

function writeScalar(w: KiwiWriter, schema: KiwiSchema, type: string, value: PlainValue): void {
  switch (type) {
    case "bool": w.byte(value === true ? 1 : 0); return;
    case "byte": w.byte(value as number); return;
    case "int": w.varInt(value as number); return;
    case "uint": w.varUint(value as number); return;
    case "float": w.varFloat(value as number); return;
    case "string": w.string(value as string); return;
    default: break;
  }
  const def = findDef(schema, type);
  if (def.kind === "ENUM") {
    const field = def.fields.find((f) => f.name === value);
    if (field === undefined) throw new Error(`Bảng «${type}» không có «${String(value)}».`);
    w.varUint(field.value);
    return;
  }
  writeCompound(w, schema, def, value as Record<string, PlainValue>);
}

function writeField(w: KiwiWriter, schema: KiwiSchema, type: string, isArray: boolean, value: PlainValue): void {
  if (!isArray) {
    writeScalar(w, schema, type, value);
    return;
  }
  if (type === "byte") {
    w.byteArray(value as Uint8Array);
    return;
  }
  const items = value as PlainValue[];
  w.varUint(items.length);
  for (const item of items) writeScalar(w, schema, type, item);
}

function writeCompound(w: KiwiWriter, schema: KiwiSchema, def: KiwiDefinition, value: Record<string, PlainValue>): void {
  if (def.kind === "STRUCT") {
    for (const field of def.fields) {
      writeField(w, schema, field.type as string, field.isArray, value[field.name] as PlainValue);
    }
    return;
  }
  for (const field of def.fields) {
    const v = value[field.name];
    if (v === undefined) continue;
    w.varUint(field.value);
    writeField(w, schema, field.type as string, field.isArray, v);
  }
  w.varUint(0);
}

export function encodeKiwiMessage(schema: KiwiSchema, rootName: string, value: Record<string, PlainValue>): Uint8Array {
  const w = new KiwiWriter();
  writeCompound(w, schema, findDef(schema, rootName), value);
  return w.bytes();
}
