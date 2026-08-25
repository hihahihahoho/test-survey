import { describe, expect, it } from "vitest";
import type { Contract } from "@/lib/types";
import { cellRect, locateComponent, rawSheetPath } from "../result-copy";
import { kitFileSchema } from "@/lib/types/api";

const sheet = (id: string, files: string[], cols: number, rows: number) => ({
  id, orient: "landscape" as const, grid: { cols, rows }, cell_hint: "landscape 3:2 cell",
  components: files.map((file) => ({ file, vi: file, spec: file, skel: { shape: "rrect" as const, w: 0.8, h: 0.6 } })),
});

const contract = {
  schemaVersion: 4,
  sheets: [
    sheet("nen", ["01-bg-home", "02-bg-win"], 2, 1),
    sheet("ui", ["01-btn", "02-tab", "03-chip", "04-icon"], 2, 2),
  ],
  variants: [],
} as unknown as Contract;

describe("tọa độ ô lấy từ contract, không suy từ ảnh (§12)", () => {
  it("chia lưới đều theo kích thước THẬT của ảnh", () => {
    expect(cellRect({ cols: 2, rows: 2 }, 0, 1536, 1024)).toEqual({ x: 0, y: 0, w: 768, h: 512 });
    expect(cellRect({ cols: 2, rows: 2 }, 3, 1536, 1024)).toEqual({ x: 768, y: 512, w: 768, h: 512 });
    // ảnh model trả về không đúng khổ (handoff §8.1) vẫn cắt đúng ô, không scale lệch trục
    expect(cellRect({ cols: 2, rows: 2 }, 1, 1254, 1254)).toEqual({ x: 627, y: 0, w: 627, h: 627 });
  });

  it("chỉ số vượt lưới bị kẹp vào hàng cuối thay vì cắt ra ngoài ảnh", () => {
    expect(cellRect({ cols: 2, rows: 1 }, 5, 100, 50)).toMatchObject({ y: 0, h: 50 });
  });

  it("tìm đúng sheet + số thứ tự ô của một file đã cắt", () => {
    expect(locateComponent(contract, "03-chip")).toMatchObject({ index: 2 });
    expect(locateComponent(contract, "03-chip")?.sheet.id).toBe("ui");
    expect(locateComponent(contract, "01-bg-home.png")?.sheet.id).toBe("nen");
    expect(locateComponent(contract, "khong-co")).toBeNull();
  });

  it("sheetId thu hẹp được khi hai sheet trùng tên ô", () => {
    expect(locateComponent(contract, "01-btn", "ui")?.sheet.id).toBe("ui");
    expect(locateComponent(contract, "01-bg-home", "nen")?.sheet.id).toBe("nen");
  });

  it("đường dẫn sheet thô đúng quy ước job của gen.sh", () => {
    expect(rawSheetPath("chinh", "ui2")).toBe("raw/chinh-ui2.png");
  });
});

/**
 * HỒI QUY: agent LUÔN gửi `sheet: null` / `w: null` ở #42. Schema cũ khai `.optional()`
 * (không nhận `null`) ⇒ `parse()` ném ⇒ `AGENT_INTERNAL` ⇒ TOÀN BỘ đường "ảnh đã cắt"
 * chết: nút Tải .zip và Copy Figma vĩnh viễn khoá, màn kết quả chỉ còn sheet thô.
 */
describe("schema kit phải nhận hình dạng null của agent thật", () => {
  it("sheet/cellIndex/w/h = null vẫn parse được và về undefined", () => {
    const r = kitFileSchema.safeParse({
      file: "01-btn", path: "kits/chinh/01-btn.png", w: null, h: null, bytes: 120,
      sheet: null, cellIndex: null, empty: false, mtime: "2026-08-13T00:00:00Z",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.sheet).toBeUndefined();
    expect(r.success && r.data.w).toBeUndefined();
  });
});

/* ĐÃ GỠ: nhóm ca của `cutAssets`.
   Hàm đó là ruột của `kit-core/components/CutAssetGrid` — lưới ô đã cắt của trang
   "Ảnh đã tạo" đời wizard. Cả trang lẫn component đã bị xoá trong đợt IA prompt-first;
   lưới ô đã cắt nay là `SheetCellGrid`, và nó lọc/khử trùng bằng
   `prompt-canvas/lib/result/sheet-files.ts:cellsOfSheet` — đã có bộ ca riêng ở
   `lib/result/__tests__`. Giữ lại ca cho một hàm không còn tồn tại là để test xanh
   canh một thứ người dùng không gặp nữa. Ba hàm THUẦN của `result-copy.ts`
   (`cellRect`/`locateComponent`/`rawSheetPath`) vẫn được khoá nguyên ở trên. */
