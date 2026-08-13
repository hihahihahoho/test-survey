/**
 * item-prompt.ts — PROMPT THẬT SỰ ĐƯỢC GỬI ĐI, cho MỘT ô.
 *
 * ┌── VÌ SAO CHỈ ĐỌC ────────────────────────────────────────────────────────┐
 * │ Prompt cuối cùng do `gen.sh` dựng (khối python ở dòng 21–145): mỗi tấm    │
 * │ một file `prompts/<variant>-<sheet>.txt`. Module này KHÔNG dựng lại bản   │
 * │ thứ hai của cả file đó — làm vậy là tạo một sự thật song song, và nó sẽ   │
 * │ lệch ngay lần đầu ai đó sửa `gen.sh`. Nó chỉ rút ra ĐÚNG những mảnh mà    │
 * │ contract đang giữ và `gen.sh` chèn NGUYÊN VĂN:                            │
 * │   · dòng đánh số của ô  →  `f"{i + 1}) {spec}"`   (gen.sh:110-115)        │
 * │   · hướng canvas        →  `sheet.orient`         (gen.sh:35)             │
 * │   · loại ô              →  `sheet.cell_hint`      (gen.sh:43)             │
 * │   · dòng phong cách     →  `f"Art style: {s['style']}."` (gen.sh:137)     │
 * │   · ghi chú tấm dáng    →  `sheet.note`           (gen.sh:106)            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Vì thế UI hiện nó ở dạng **chỉ đọc + nút sao chép**: đây là bằng chứng, không phải
 * một ô nhập thứ hai để người dùng sửa rồi tưởng mình đã đổi được prompt.
 */
import type { Contract, Sheet } from "@/lib/types/contract";
import { contractVariants } from "@/lib/types/contract";

export interface ItemPrompt {
  /** Tấm chứa ô này (`nen`, `popup2`, `pose-nhan-vat`…). */
  sheetId: string;
  /** Vị trí ô trong lưới, đếm từ 1 — đúng con số `gen.sh` viết ra đầu dòng. */
  cellNumber: number;
  grid: { cols: number; rows: number };
  orient: "landscape" | "portrait";
  cellHint: string;
  /** Dòng mô tả của riêng ô này (`3) glossy red pill button…`). */
  line: string;
  /** Toàn bộ đoạn liên quan tới ô — thứ nút "Sao chép prompt" đưa vào clipboard. */
  text: string;
}

const orientLine = (orient: string) =>
  orient === "portrait" ? "Canvas orientation: PORTRAIT 1024x1536." : "Canvas orientation: LANDSCAPE 1536x1024.";

function findCell(contract: Contract, file: string): { sheet: Sheet; index: number } | null {
  for (const sheet of contract.sheets) {
    const index = sheet.components.findIndex((component) => component.file === file);
    if (index >= 0) return { sheet, index };
  }
  return null;
}

/**
 * Prompt của ô mang tên `file`. `null` khi ô chưa nằm trong contract — ví dụ thành phần
 * đang bị bỏ tick, hoặc mascot đang tắt. Nơi gọi phải NÓI RA điều đó thay vì hiện một
 * đoạn trống trông như prompt rỗng.
 */
export function itemPromptFor(contract: Contract | null | undefined, file: string): ItemPrompt | null {
  if (!contract) return null;
  const hit = findCell(contract, file);
  if (!hit) return null;
  const { sheet, index } = hit;
  const component = sheet.components[index]!;
  const style = contractVariants(contract)[0]?.style ?? "";
  const line = `${index + 1}) ${component.spec}`;
  const text = [
    orientLine(sheet.orient ?? "landscape"),
    `Sheet ${sheet.id} · grid ${sheet.grid.cols}×${sheet.grid.rows} · each cell is a ${sheet.cell_hint ?? "cell"}.`,
    "",
    line,
    "",
    sheet.note ?? "",
    style ? `Art style: ${style}.` : "",
  ].filter((part, i, all) => !(part === "" && all[i - 1] === "")).join("\n").trim();

  return {
    sheetId: sheet.id,
    cellNumber: index + 1,
    grid: { cols: sheet.grid.cols, rows: sheet.grid.rows },
    orient: sheet.orient === "portrait" ? "portrait" : "landscape",
    cellHint: sheet.cell_hint ?? "cell",
    line,
    text,
  };
}

/**
 * Tên ô của một dáng mascot trong contract. `kitset-to-contract` đánh số CHẠY XUYÊN các
 * tấm dáng (`01-pose-idle`, `05-pose-nhan-vat-2-cheer`), nên không đoán được bằng công
 * thức — phải dò trong contract. Đây là chỗ dò đó, để hai màn không tự chế hai cách.
 */
export function poseCellFile(contract: Contract | null | undefined, poseId: string, characterId?: string): string | null {
  if (!contract) return null;
  const suffix = characterId ? `-pose-${characterId}-${poseId}` : `-pose-${poseId}`;
  for (const sheet of contract.sheets) {
    const hit = sheet.components.find((component) => component.file.endsWith(suffix));
    if (hit) return hit.file;
  }
  return null;
}
