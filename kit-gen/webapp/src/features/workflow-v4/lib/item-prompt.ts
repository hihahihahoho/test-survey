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
 * │   · câu NỀN ĐEN của ô   →  `skel.matte == "glow"`  (gen.sh:480-488)       │
 * │   · câu TRONG SUỐT của ô →  `skel.matte == "glass"` (gen.sh:489-506)      │
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

/**
 * CHÉP NGUYÊN VĂN đoạn `gen.sh` nối vào `spec` của ô `matte:"glow"` (khối
 * `if comps[i]["skel"].get("matte") == "glow"`) — preview phải nối ở cùng chỗ,
 * cùng chữ.
 *
 * KHÔNG CÒN THAM SỐ MÀU KEY. Nền sheet nay là alpha thật, nên ô glow không được
 * vẽ trên tấm đen nữa: quầng sáng nằm sẵn trong kênh α, đủ cả dải mờ. Câu này vì
 * thế chỉ còn ra hợp đồng về ĐỘ TAN — sáng phải nhoè hết ra nền trong suốt.
 *
 * Vì sao phải mirror (research-glow-extraction §4.2 "Lỗ 3"): bật "nền đen cho hiệu ứng
 * phát sáng" là đổi HẲN câu lệnh gửi cho máy vẽ. Nếu panel "Prompt sẽ gửi đi" không đổi
 * một chữ thì nó đang nói dối về chính thứ nó tự nhận là bằng chứng — và người dùng sẽ
 * kết luận cái nút không có tác dụng gì.
 *
 * Đổi chữ ở `gen.sh` mà quên chỗ này ⇒ ca "khớp TỪNG CHỮ với gen.sh" trong
 * `__tests__/cell-background.test.tsx` đỏ (nó đọc `gen.sh` thật, không đọc trí nhớ).
 */
export function glowCellPrompt(): string {
  return " — LIGHT EFFECT: for THIS cell, ignore the rule about replacing the gray silhouette"
    + " with a continuous content surface: there is no surface here. The gray shape only marks"
    + " HOW FAR the light reaches; it is not an area to fill. This element is pure light. The"
    + " halo fades out by LOWERING ALPHA, not by painting paler pixels: at the outer edge the"
    + " alpha reaches 0 while the colour stays the light's own colour, so the fade is gradual"
    + " and never stops at a hard edge. There is NO plate of any kind behind the light — no"
    + " black, no white, no pale grey, and above all no checkerboard squares. Every pixel that"
    + " is not lit is simply unpainted";
}

/**
 * CHÉP NGUYÊN VĂN đoạn `gen.sh` nối vào `spec` của ô `matte:"glass"` (nhánh `elif` ngay
 * dưới nhánh glow, `gen.sh:489-506`), kể cả chỗ chèn TÊN MÀU KEY — cùng lý do mirror như
 * `glowCellPrompt`, và cùng ca test đọc `gen.sh` thật để bắt lệch chữ.
 *
 * Độ trong của kính trước đây đo GIÁN TIẾP — nền key lộ qua thân bao nhiêu thì trong
 * bấy nhiêu, `slice.py` giải ngược `C = α·F + (1−α)·K`. Với alpha thật, độ trong nằm
 * THẲNG trong kênh α, nên câu này ra hợp đồng ngay trên α.
 */
export function glassCellPrompt(): string {
  return " — SEE-THROUGH ELEMENT: the gray silhouette marks the pane, but 'replacing it with a"
    + " continuous content surface' here means a SEE-THROUGH surface, not a solid one. The body"
    + " of this element is a thin sheet of tinted glass. Draw it with a LOW ALPHA VALUE — about"
    + " 64 out of 255 for a clear pane, up to 128 for a strongly tinted one — keeping the glass's"
    + " own tint colour at that low alpha. Do NOT fake it with paint: no opaque fill, no white or"
    + " pale grey wash, and above all no checkerboard squares. Lower alpha, not lighter paint."
    + " Frame, rim, bevel and specular highlights stay fully opaque";
}

/** `true` khi ô là hiệu ứng phát sáng — quầng phải tan hết ra nền trong suốt. */
export function isGlowCell(skel: { matte?: unknown } | null | undefined): boolean {
  return skel?.matte === "glow";
}

/** `true` khi ô là element TRONG SUỐT — thân mang alpha một phần, không đục. */
export function isGlassCell(skel: { matte?: unknown } | null | undefined): boolean {
  return skel?.matte === "glass";
}

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
  const variant = contractVariants(contract)[0];
  const style = variant?.style ?? "";
  /* Cùng thứ tự if/elif của `gen.sh`: một ô chỉ nhận ĐÚNG MỘT câu phụ. */
  const extra = isGlowCell(component.skel) ? glowCellPrompt()
    : isGlassCell(component.skel) ? glassCellPrompt()
      : "";
  const line = `${index + 1}) ${component.spec}${extra}`;
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
