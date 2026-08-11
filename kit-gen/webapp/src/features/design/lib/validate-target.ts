/**
 * features/design/lib/validate-target.ts — KIỂU và TRA CỨU cho kết quả validate.
 *
 * Tách khỏi `validate.ts` (bộ luật) vì hai lý do thực tế:
 *  · giữ mỗi file dưới ~400 dòng
 *  · panel/lưới/cây chỉ cần TRA lỗi theo chỗ hiển thị, không cần biết luật; import
 *    từ đây thì chúng không kéo theo cả bộ luật + zod schema.
 *
 * `Target` là "chỗ hiển thị lỗi", không phải đường dẫn dữ liệu: `sheets[2].components[5]`
 * chỉ có nghĩa với lập trình viên, còn UI cần biết "sheet nào, ô số mấy, field nào".
 */
/** Nơi hiển thị lỗi — panel thuộc tính tra theo đây để gắn lỗi vào ĐÚNG field. */
export type Target =
  | { kind: "contract" }
  | { kind: "sheet"; sheetId: string; field?: string }
  | { kind: "element"; sheetId: string; index: number; field?: string }
  | { kind: "variant"; variantId: string; field?: string }
  | { kind: "character"; variantId: string; characterId: string; field?: string };

export interface Finding {
  /** V-01…V-08 hoặc mã phụ (SKEL_SHAPE, SKEL_MATTE…). Hiện trong panel dev, không ra thân UI. */
  rule: string;
  /** Câu tiếng Việt hiện thẳng cho user. */
  message: string;
  target: Target;
  severity: "error" | "warn";
  /** Gợi ý sửa 1 chạm (nút [Sửa thành «…»]) — màn tự quyết có hiện hay không. */
  fix?: { label: string; kind: "slug-sheet" | "slug-file" | "grid-fit" | "add-cells" | "trim-cells"; value?: string };
}

export interface ValidationResult {
  errors: Finding[];
  warnings: Finding[];
  /** tra cứu nhanh theo `targetKey()` — panel dùng để gắn lỗi inline. */
  byTarget: Map<string, Finding[]>;
  ok: boolean;
}

export function targetKey(t: Target | null | undefined): string {
  if (!t) return "contract";
  if (t.kind === "element") return `element:${t.sheetId}:${t.index}:${t.field ?? ""}`;
  if (t.kind === "sheet") return `sheet:${t.sheetId}:${t.field ?? ""}`;
  if (t.kind === "variant") return `variant:${t.variantId}:${t.field ?? ""}`;
  if (t.kind === "character") return `character:${t.variantId}:${t.characterId}:${t.field ?? ""}`;
  return "contract";
}

/** Lỗi/cảnh báo của ĐÚNG một field. Panel gọi hàm này cho từng ô nhập. */
export function issuesFor(r: ValidationResult | null | undefined, t: Target): Finding[] {
  return r?.byTarget.get(targetKey(t)) ?? [];
}

/** Câu đầu tiên để gắn dưới field (ưu tiên error hơn warning). */
export function messageFor(r: ValidationResult | null | undefined, t: Target): { text: string; severity: "error" | "warn" } | null {
  const list = issuesFor(r, t);
  const e = list.find((x) => x.severity === "error");
  if (e) return { text: e.message, severity: "error" };
  const w = list[0];
  return w ? { text: w.message, severity: "warn" } : null;
}

