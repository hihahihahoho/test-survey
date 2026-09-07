/**
 * features/prompt-canvas/lib/result/sheet-files.ts
 * ────────────────────────────────────────────────────────────────────────────
 * ĐƯỜNG DẪN + LỌC Ô cho panel kết quả dưới chân mỗi block của Prompt Canvas.
 *
 * Phần THUẦN của panel: không chạm DOM, không gọi mạng, nên kiểm được bằng số
 * thật. Mọi thứ ở đây chỉ trả về **đường dẫn tương đối trong project** — đúng thứ
 * `#41 GET /api/projects/:id/files/*` nhận. Việc bọc thêm `/api/.../files/` là
 * của `features/kit/lib/image-source.ts:filePath`, KHÔNG lặp lại ở đây (ghép hai
 * lần là bug 400 PATH_ESCAPE mà `features/kit/lib/download.ts` đã kể lại).
 */
import type { KitFile } from "@/lib/types";

/**
 * ẢNH GỐC CỦA MỘT TẤM — hai nguồn, hai ý nghĩa KHÁC NHAU.
 *
 * ╔══ VÌ SAO KHÔNG CHỈ DÙNG `raw/` ═══════════════════════════════════════════╗
 * ║ `raw/<job>.png` là ảnh **hiện hành**: mỗi lượt gen lại ghi đè, và nút      ║
 * ║ "Khôi phục bản này" cũng ghi đè chính nó (agent/routes/runs.mjs:145-161).  ║
 * ║ Nghĩa là nó KHÔNG neo được vào một phiên bản: mở lại panel sau một lượt    ║
 * ║ gen khác thì ảnh đã là ảnh khác mà không có gì báo.                        ║
 * ║ `runs/<runId>/artifacts/<job>.png` thì BẤT BIẾN — agent chép sang đó lúc   ║
 * ║ kết lượt và không ai ghi đè. Có `runId` ⇒ dùng nó; không có ⇒ `raw/`.      ║
 * ║ Cả hai đều nằm trong `READABLE_TOP` của `agent/routes/files.mjs` nên đọc   ║
 * ║ được như nhau.                                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function rawSheetImagePath(job: string, runId?: string | null): string {
  const safeJob = String(job).trim();
  /* Câu lỗi nói bằng tiếng Việt, không mượn tên khoá kỹ thuật: câu này CÓ THỂ tới mắt
     người dùng qua toast lỗi, và cổng từ cấm §5.4 đọc đúng như vậy. */
  if (safeJob === "") throw new Error("thiếu tên lượt vẽ của tấm — không dựng được đường ảnh gốc");
  const run = typeof runId === "string" ? runId.trim() : "";
  return run === "" ? `raw/${safeJob}.png` : `runs/${run}/artifacts/${safeJob}.png`;
}

/* `skeletonImagePath()` ĐÃ BỎ. Nó dựng đường tới `skeleton/<sheetId>.png` — ảnh
   khung xương mà engine từng gửi kèm prompt. Engine thôi dựng ảnh ấy (vùng an
   toàn nay vào prompt bằng toạ độ số), nên hàm này chỉ còn dựng được đường tới
   một file không bao giờ tồn tại. Giữ lại là để dành một cái bẫy: agent VẪN mở
   thư mục `skeleton` cho phép đọc (`routes/files.mjs`), nên lượt xin sẽ không
   nổ ngay — nó chỉ trả về 404 ở một chỗ xa nơi gây ra lỗi. */

/** Tên ô đã bỏ tiền tố thư mục: `tight/01-btn` → `01-btn`. */
export function cellName(file: KitFile): string {
  const raw = String(file.file ?? "");
  return raw.slice(raw.lastIndexOf("/") + 1);
}

const isTight = (file: KitFile): boolean => String(file.file ?? "").startsWith("tight/");

/**
 * Ô ĐÃ CẮT CỦA ĐÚNG MỘT TẤM — nguồn của tab «Đã crop».
 *
 * Ba việc, đều bắt buộc, và đều lấy từ bài học của `CutAssetGrid.cutAssets`:
 *  ① **Lọc theo `file.sheet`** — `#42 GET …/kit` trả CẢ BỘ KIT (mọi tấm). Panel này
 *    nằm dưới chân MỘT block nên hiện nhầm ô của tấm khác là nói dối về chỗ đứng.
 *    Không dò contract ở đây: block đã biết `sheetId` của chính nó, không cần đoán.
 *  ② **Ưu tiên bản `tight/`** — `slice.py:950-953` ghi HAI file cho mỗi ô (bản canvas
 *    còn đệm bleed và bản `tight/` ôm sát ruột). Giữ cả hai thì mỗi ô hiện hai lần.
 *  ③ **Bỏ ô rỗng** — `empty` và các file `_empty*` là chỗ trống của lưới, không phải
 *    thành phẩm; đếm chúng vào là báo sai số ô cắt được.
 *
 * Thứ tự: theo `cellIndex` (đúng thứ tự ô trên tấm, khớp số hiện trong `SkeletonPreview`),
 * ô không có `cellIndex` xuống cuối và xếp theo tên — tất định, không phụ thuộc `readdir`.
 */
export function cellsOfSheet(files: readonly KitFile[], sheetId: string): KitFile[] {
  const id = String(sheetId ?? "");
  const mine = files.filter(
    (f) => String(f.sheet ?? "") === id && f.empty !== true && !cellName(f).startsWith("_empty"),
  );
  const tightNames = new Set(mine.filter(isTight).map(cellName));
  const picked = mine.filter((f) => isTight(f) || !tightNames.has(cellName(f)));
  const order = (f: KitFile): number =>
    typeof f.cellIndex === "number" && Number.isFinite(f.cellIndex) ? f.cellIndex : Number.MAX_SAFE_INTEGER;
  return [...picked].sort((a, b) => order(a) - order(b) || cellName(a).localeCompare(cellName(b)));
}

/** Tên file gợi ý khi tải nguyên tấm về máy (agent vẫn được quyền đặt tên khác). */
export function sheetDownloadName(job: string): string {
  return `${String(job).trim() || "sheet"}.png`;
}

/**
 * KHUNG FIGMA = CỠ ĐẦU RA NGƯỜI DÙNG CHỌN, KHÔNG PHẢI HỘP ĐO ĐƯỢC.
 *
 * ╔══ BỆNH, ĐO TRÊN MANIFEST THẬT (dự án `test`, ô `03-avatar-frame`) ═══════╗
 * ║   "safe":         [276, 294, 303, 263]   ← LÕI MODEL VẼ RA, slice.py đo   ║
 * ║   "contractSafe": [301, 332, 251, 188]   ← HỘP MÀ PROMPT ĐÃ HỨA           ║
 * ║ `figma-node.ts:geometryOf` lấy `safe`, rồi tỉ lệ xuất 50% của màn kit cũ  ║
 * ║ nhân vào ⇒ frame dán ra Figma là 151,5×131,5. Người thiết kế vừa chọn cỡ  ║
 * ║ trong prompt, nhìn thấy `251x188` ở đó, rồi nhận về một con số thứ ba mà   ║
 * ║ không có gì giải thích.                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Ở màn prompt-first, khung phải là thứ NGƯỜI DÙNG ĐẶT. Lõi đo được vẫn còn nguyên
 * giá trị của nó (QA `sizeDeviation` đọc chênh lệch giữa hai hộp), nhưng nó là KẾT
 * QUẢ, không phải HỢP ĐỒNG; layout của app căn theo hợp đồng.
 *
 * ╔══ ĐÍCH LÀ `outSize`, `contractSafe` CHỈ LÀ ĐƯỜNG LÙI ═════════════════════╗
 * ║ Chủ sản phẩm chốt luật: *cỡ người dùng chọn = CỠ ĐẦU RA; máy vẽ luôn vẽ    ║
 * ║ max-fit trong ô để tối đa độ phân giải; co về là việc của code*. Nên hai   ║
 * ║ con số sống song song và KHÔNG được trộn:                                  ║
 * ║   · `contractSafe` = hộp max-fit trong ô lưới — thứ đi vào prompt và ở lại  ║
 * ║     làm số đo QA. Nó CỐ Ý to hơn cỡ đầu ra: xin model vẽ to rồi thu nhỏ    ║
 * ║     cho nét, chứ không xin nhỏ rồi phóng to cho vỡ.                        ║
 * ║   · `outSize` = cỡ thành phẩm phải có khi ra khỏi app (`component.out`).   ║
 * ║ ⇒ đích của phép co là `outSize`; thiếu nó (kit cắt bằng bản cũ) mới lấy    ║
 * ║ `contractSafe`; thiếu cả hai thì không co gì cả và NÓI RA.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ NỬA THỨ HAI, VÀ LÀ NỬA QUAN TRỌNG HƠN: PHẢI CO ẢNH ════════════════════╗
 * ║ Bản trước chỉ đổi khung rồi dán ảnh ở tỉ lệ 1. Chủ sản phẩm dán thử ô      ║
 * ║ «01-button» và thấy khung 263×262 (lõi model vẽ) chứ không phải 195×195 mà ║
 * ║ họ đã chọn, rồi nói đúng vào bản chất: *"cái element thật kia nó phải      ║
 * ║ scale safe zone chứ đúng không? không thể để nguyên cỡ 263 gốc mà ai gen   ║
 * ║ ra được"*.                                                                 ║
 * ║                                                                            ║
 * ║ MÁY VẼ KHÔNG BAO GIỜ VẼ ĐÚNG PIXEL. Prompt xin một nút 195×195, model trả  ║
 * ║ về một nút 263×262 — sai số ~35%, và đó là chuyện BÌNH THƯỜNG của mọi lượt ║
 * ║ vẽ, không phải một lượt hỏng. Dán nguyên px thì hoặc lõi tràn khỏi hộp     ║
 * ║ (Figma cắt mất), hoặc người thiết kế phải tự co tay từng ô. Vậy nên:       ║
 * ║   **co ảnh sao cho LÕI ĐO ĐƯỢC vừa khít CỠ ĐẦU RA**,                       ║
 * ║ trang trí (bóng, tia sáng, lá cờ…) tràn ra ngoài theo ĐÚNG cùng tỉ lệ.     ║
 * ║ `s = min(out.w/core.w, out.h/core.h)` — lấy `min` nên lõi không bao giờ    ║
 * ║ vượt hộp; đồng dạng nên không bao giờ méo. Trục còn dư thì chia đều hai    ║
 * ║ bên (căn giữa), vì không có thông tin nào nói lõi lệch về phía nào.        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO ĐỔI Ở ĐÂY CHỨ KHÔNG SỬA `geometryOf` ════════════════════════════
 * `figma-node.ts` đang phục vụ CẢ màn «Thư viện kit» cũ, nơi quy ước là hộp đo
 * được × 50%. Sửa trong đó là đổi hành vi của một màn không ai xin — và nó còn bị
 * bốn bộ test khoá theo hash. Nên phép co ở đây đi bằng CỬA CÓ SẴN của nó:
 *
 *   · `safe` ← một **hộp ảo trong không gian ảnh gốc**, cỡ `outSize / s`,
 *     căn giữa quanh lõi đo được;
 *   · tỉ lệ xuất của riêng ô ← `s`.
 *
 * `buildFigmaNodeForAsset` nhân cả hai lại và ra đúng ba con số mình cần:
 *     khung = safe × s = outSize                 ✓ đúng cỡ người dùng chọn
 *     ảnh   = content × s                        ✓ lõi vừa khít khung
 *     lệch  = (content_at − safe.xy) × s         ✓ trang trí tràn đúng chỗ
 * Không một dòng số học nào bị chép lại — nếu công thức của `figma-node.ts` đổi,
 * chỗ này đổi theo, không trôi khỏi nhau.
 */
export interface FittedCell {
  name: string;
  /** Tỉ lệ đã co, làm tròn thành phần trăm — chỉ để NÓI cho người dùng. */
  percent: number;
  /** Cỡ đầu ra của ô sau khi co (px, đã làm tròn) — cũng chỉ để NÓI. */
  w: number;
  h: number;
}

export interface ContractFramed {
  /** Ô đã đổi khung; thứ tự giữ nguyên đầu vào. */
  files: KitFile[];
  /**
   * Tên ô PHẢI dùng khung đo được vì manifest không có cả `outSize` lẫn
   * `contractSafe` (kit cắt bằng bản `slice.py` cũ). Nói ra chứ không nuốt: con số ở
   * Figma lúc ấy KHÁC con số người dùng đọc trong prompt, và họ có quyền biết vì sao.
   */
  measured: string[];
  /**
   * Tỉ lệ xuất của TỪNG Ô, khoá theo `path`. Mỗi ô một số riêng vì mỗi ô lệch cỡ
   * một kiểu — một tỉ lệ chung cho cả tấm là quay lại đúng cái bệnh đang chữa.
   * Ô vắng mặt ⇒ 1 (không có gì để co, hoặc không đo được).
   */
  scales: Map<string, number>;
  /** Ô đã bị co/giãn thật sự (≠ 1) — nguồn cho câu báo "co về đúng cỡ (k%)". */
  fitted: FittedCell[];
}

/** `[x, y, w, h]` dùng được (đủ bốn số, `w`/`h` dương)? Cùng luật với `box4`. */
function usableBox(box: readonly number[] | undefined): boolean {
  if (box === undefined || box.length < 4) return false;
  const [, , w, h] = box;
  return typeof w === "number" && typeof h === "number" && w > 0 && h > 0;
}

/** `[x, y, w, h]` → object, chỉ khi cả bốn số dùng được. */
function boxOf(box: readonly number[] | undefined): { x: number; y: number; w: number; h: number } | null {
  if (!usableBox(box)) return null;
  const [x, y, w, h] = box as readonly number[];
  return { x: x ?? 0, y: y ?? 0, w: w as number, h: h as number };
}

/** `[w, h]` → object, chỉ khi cả hai số dương. `outSize` là CỠ, không phải hộp. */
function sizeOf(size: readonly number[] | undefined): { w: number; h: number } | null {
  if (size === undefined || size.length < 2) return null;
  const [w, h] = size;
  if (typeof w !== "number" || typeof h !== "number" || !(w > 0) || !(h > 0)) return null;
  return { w, h };
}

/**
 * Lệch dưới nửa phần trăm thì coi như không co: `0,998` in ra là «100%», và một câu
 * báo "đã co về 100%" chỉ làm người đọc dừng lại hỏi mình vừa đọc cái gì.
 */
const FIT_EPS = 0.005;

export function contractFramed(files: readonly KitFile[]): ContractFramed {
  const measured: string[] = [];
  const fitted: FittedCell[] = [];
  const scales = new Map<string, number>();

  const out = files.map((file) => {
    scales.set(file.path, 1);

    /* ĐÍCH: cỡ đầu ra người dùng chọn. `contractSafe` (hộp max-fit, cố ý to hơn) chỉ
       vào cuộc khi kit cắt bằng bản engine chưa ghi `outSize`. */
    const box = boxOf(file.contractSafe);
    const target = sizeOf(file.outSize) ?? (box === null ? null : { w: box.w, h: box.h });
    if (target === null) {
      /* Không biết cỡ đầu ra ⇒ giữ nguyên mọi thứ: khung là lõi đo được, tỉ lệ 1.
         Đoán một tỉ lệ ở đây là bịa ra một cỡ mà không ai hứa — và tỉ lệ 1 (chứ
         không phải quy ước 50% của màn kit cũ) mới là thứ màn này vẫn hứa. */
      measured.push(cellName(file));
      return file;
    }

    const core = boxOf(file.safe);
    if (core === null) {
      /* Biết cỡ đầu ra nhưng KHÔNG đo được lõi (slice.py không tách được ruột): không
         có gì để căn theo, nên giữ hành vi cũ — khung là hộp hợp đồng nếu có, tỉ lệ 1. */
      if (box === null) {
        measured.push(cellName(file));
        return file;
      }
      return { ...file, safe: [box.x, box.y, box.w, box.h] };
    }

    const s = Math.min(target.w / core.w, target.h / core.h);
    if (!Number.isFinite(s) || s <= 0) {
      return box === null ? file : { ...file, safe: [box.x, box.y, box.w, box.h] };
    }

    /* Hộp ảo: cỡ `outSize / s` (để nhân ngược lại ra đúng `outSize`), tâm trùng tâm
       lõi ⇒ phần dư của trục còn lại chia đều hai bên. Toạ độ x/y của `contractSafe`
       KHÔNG dùng tới: vị trí khung trên bàn Figma do lưới quyết định, còn thứ phải
       khớp là ẢNH so với KHUNG — và cái đó neo vào lõi. */
    const vw = target.w / s;
    const vh = target.h / s;
    scales.set(file.path, s);
    if (Math.abs(s - 1) > FIT_EPS) {
      fitted.push({
        name: cellName(file),
        percent: Math.round(s * 100),
        w: Math.round(target.w),
        h: Math.round(target.h),
      });
    }
    return {
      ...file,
      safe: [core.x + core.w / 2 - vw / 2, core.y + core.h / 2 - vh / 2, vw, vh],
    };
  });

  return { files: out, measured, scales, fitted };
}
