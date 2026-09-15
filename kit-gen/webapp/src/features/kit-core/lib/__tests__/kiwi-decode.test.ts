/**
 * kiwi-decode.test.ts — CANH BỘ ĐỌC «kiwi» VIẾT TAY.
 *
 * ┌── CA NÀO ĐÁNG CÓ, CA NÀO KHÔNG ──────────────────────────────────────────┐
 * │ Bộ đọc này chép quy tắc byte từ `kiwi-esm.js` 0.5.0. Chỗ dễ chép sai nhất │
 * │ KHÔNG phải vòng lặp — mà là bốn cái bẫy dưới đây, mỗi cái một ca riêng:   │
 * │   ① `varfloat` có lối tắt MỘT BYTE cho số 0. Đọc nhầm thành bốn byte là   │
 * │      lệch toàn bộ phần đuôi, và triệu chứng hiện ra ở một trường khác     │
 * │      hẳn — loại lỗi tốn nửa ngày để lần ngược.                            │
 * │   ② chuỗi KHÔNG có tiền tố độ dài, nó kết thúc bằng byte 0.               │
 * │   ③ `byte[]` KHÔNG phải mảng thường: nó là varuint độ dài + byte thô.     │
 * │   ④ MESSAGE gặp mã trường lạ thì KHÔNG nhảy qua được (không có độ dài),   │
 * │      nên phải NÉM. Một bộ đọc "rộng lượng" ở đây sẽ trả về nửa dữ liệu mà │
 * │      vẫn trông như thành công.                                            │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from "vitest";
import {
  KiwiReader,
  decodeBinarySchema,
  decodeKiwiMessage,
  pickRootMessage,
  type KiwiSchema,
} from "../kiwi-decode";
import { KiwiWriter, encodeBinarySchema, encodeKiwiMessage } from "./kiwi-write";
import { FIXTURE_MESSAGE, FIXTURE_SCHEMA, PNG_HEAD } from "./fig-fixture";

describe("đầu đọc byte — bốn cái bẫy của định dạng", () => {
  it("varuint / varint đi được cả số lớn lẫn số âm", () => {
    const w = new KiwiWriter().varUint(0).varUint(127).varUint(128).varUint(300000).varInt(-1).varInt(-70000).varInt(5);
    const r = new KiwiReader(w.bytes());
    expect([r.readVarUint(), r.readVarUint(), r.readVarUint(), r.readVarUint()]).toEqual([0, 127, 128, 300000]);
    expect([r.readVarInt(), r.readVarInt(), r.readVarInt()]).toEqual([-1, -70000, 5]);
  });

  it("① số 0 chỉ tốn MỘT byte, và số sau nó vẫn đọc đúng", () => {
    const w = new KiwiWriter().varFloat(0).varFloat(245).varFloat(-0.86);
    /* Nếu lối tắt bị bỏ qua thì byte đầu tiên bị đọc thành bốn byte và mọi số
       phía sau lệch — ca này bắt đúng chỗ đó bằng cách đặt số 0 lên ĐẦU. */
    const r = new KiwiReader(w.bytes());
    expect(r.readVarFloat()).toBe(0);
    expect(r.readVarFloat()).toBe(245);
    expect(r.readVarFloat()).toBeCloseTo(-0.86, 5);
  });

  it("② chuỗi kết thúc bằng byte 0, đọc được cả chữ có dấu", () => {
    const w = new KiwiWriter().string("tpl").string("khung ảnh").string("");
    const r = new KiwiReader(w.bytes());
    expect([r.readString(), r.readString(), r.readString()]).toEqual(["tpl", "khung ảnh", ""]);
  });

  it("③ byte[] là độ dài + byte thô, không phải mảng phần tử", () => {
    const payload = new Uint8Array(PNG_HEAD);
    const r = new KiwiReader(new KiwiWriter().byteArray(payload).varUint(9).bytes());
    expect([...r.readByteArray()]).toEqual(PNG_HEAD);
    expect(r.readVarUint()).toBe(9);
  });

  it("đọc quá cuối vùng byte thì NÉM, không trả 0", () => {
    expect(() => new KiwiReader(new Uint8Array(0)).readByte()).toThrow(/quá cuối/);
    expect(() => new KiwiReader(new Uint8Array([65, 66])).readString()).toThrow(/kết thúc/);
  });
});

describe("lược đồ nhị phân", () => {
  it("ghi rồi đọc lại ra ĐÚNG lược đồ ban đầu, kể cả kiểu trỏ tới định nghĩa khai sau", () => {
    const back = decodeBinarySchema(encodeBinarySchema(FIXTURE_SCHEMA));
    expect(back.definitions.map((d) => d.name)).toEqual(FIXTURE_SCHEMA.definitions.map((d) => d.name));
    expect(back).toEqual(FIXTURE_SCHEMA);
  });

  it("kiểu dựng sẵn ra đúng tên: float, string, bool, uint", () => {
    const back = decodeBinarySchema(encodeBinarySchema(FIXTURE_SCHEMA));
    const node = back.definitions.find((d) => d.name === "NodeChange");
    expect(node?.fields.find((f) => f.name === "proportionsConstrained")?.type).toBe("bool");
    expect(node?.fields.find((f) => f.name === "parentIndex")?.type).toBe("uint");
    expect(node?.fields.find((f) => f.name === "fillPaints")).toMatchObject({ type: "Paint", isArray: true });
  });

  it("đoán được định nghĩa gốc", () => {
    expect(pickRootMessage(FIXTURE_SCHEMA)).toBe("Message");
  });

  it("gốc không tên «Message» thì lấy cái KHÔNG ai trỏ tới", () => {
    const schema: KiwiSchema = {
      definitions: [
        { name: "Leaf", kind: "MESSAGE", fields: [{ name: "n", type: "uint", isArray: false, value: 1 }] },
        { name: "Root", kind: "MESSAGE", fields: [{ name: "leaf", type: "Leaf", isArray: false, value: 1 }] },
      ],
    };
    expect(pickRootMessage(schema)).toBe("Root");
  });
});

describe("bộ thông dịch — đọc dữ liệu theo lược đồ, không sinh mã", () => {
  const bytes = encodeKiwiMessage(FIXTURE_SCHEMA, "Message", FIXTURE_MESSAGE);

  it("đi hết khối, không thừa byte nào", () => {
    const { bytesLeft } = decodeKiwiMessage(FIXTURE_SCHEMA, "Message", bytes);
    /* Thừa byte = đã đọc sai ở đâu đó phía trên mà chưa kịp ném. Đây là cái
       cân duy nhất bắt được loại lỗi «giải xong mà vẫn sai». */
    expect(bytesLeft).toBe(0);
  });

  it("bảng liệt kê ra TÊN chứ không ra số — đó là thứ bước này đi tìm", () => {
    const { value } = decodeKiwiMessage(FIXTURE_SCHEMA, "Message", bytes);
    const nodes = value["nodeChanges"] as Record<string, unknown>[];
    expect(nodes[1]?.["horizontalConstraint"]).toBe("SCALE");
    expect(nodes[1]?.["verticalConstraint"]).toBe("SCALE");
    expect(nodes[1]?.["proportionsConstrained"]).toBe(true);
  });

  it("struct lồng, mảng message lồng và byte[] đều về đúng chỗ", () => {
    const { value } = decodeKiwiMessage(FIXTURE_SCHEMA, "Message", bytes);
    const nodes = value["nodeChanges"] as Record<string, unknown>[];
    expect(nodes[0]?.["size"]).toEqual({ x: 245, y: 85 });
    const paints = nodes[1]?.["fillPaints"] as Record<string, unknown>[];
    expect(paints[0]?.["imageScaleMode"]).toBe("CROP");
    expect(paints[0]?.["image"]).toEqual({ hash: "abc123" });
    expect(paints[0]?.["imageTransform"]).toEqual([1, 0, 0, 0, 1, 0]);
    const blobs = value["blobs"] as Record<string, unknown>[];
    expect([...(blobs[0]?.["bytes"] as Uint8Array)].slice(0, 8)).toEqual(PNG_HEAD);
  });

  it("④ mã trường lạ ⇒ NÉM, không im lặng trả về một nửa", () => {
    /* Một message chỉ khai mã trường 99 — không có trong lược đồ. Định dạng
       không chở độ dài nên không có cách nào nhảy qua; "rộng lượng" ở đây là
       nói dối. */
    const bad = new KiwiWriter().varUint(99).varUint(1).varUint(0).bytes();
    expect(() => decodeKiwiMessage(FIXTURE_SCHEMA, "Message", bad)).toThrow(/mã 99/);
  });

  it("mảng khai nhiều phần tử hơn số byte còn lại ⇒ NÉM chứ không cấp phát", () => {
    const bad = new KiwiWriter().varUint(2).varUint(4000000).bytes();
    expect(() => decodeKiwiMessage(FIXTURE_SCHEMA, "Message", bad)).toThrow(/nhiều hơn số byte/);
  });

  it("tên gốc không có trong lược đồ ⇒ NÉM", () => {
    expect(() => decodeKiwiMessage(FIXTURE_SCHEMA, "KhongCo", bytes)).toThrow(/KhongCo/);
  });
});
