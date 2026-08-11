/**
 * features/projects/lib/create-mode.ts — HAI MODE LÀM VIỆC lúc tạo project.
 *
 * NGUỒN: UI-SPEC-V2 §1.1 (ba nguyên tắc) · §1.2 (wireframe dialog) · §1.4 (bốn trạng thái)
 *        · §0.1 (mode là thuộc tính của FILE CON, KHÔNG phải của project).
 *
 * BỐN LUẬT CỦA MODULE NÀY — cố tình để ở tầng logic thuần, không JSX, để test được
 * bằng `vitest` environment node và để B2 (prefill brief) dùng lại y nguyên:
 *
 *  1. **Mode KHÔNG đi vào `POST /api/projects`.** Hợp đồng §6.2 #8 giữ nguyên
 *     (`name/slug/template/firstVariant/tags`). Mode chỉ quyết định FILE CON ĐẦU TIÊN
 *     được tạo sau khi project thật đã tồn tại (§1.2 ghi chú thi công, FE2-PLAN N3).
 *  2. **Mặc định = `workflow`.** Đó là đường đã qua QA và có 8 màn thật (§1.1-3).
 *  3. **Mode đổi được sau này.** Một project chứa cả file canvas lẫn file workflow,
 *     nên câu chữ trên UI phải nói rõ "đổi ý lúc nào cũng được" — không doạ người dùng
 *     rằng đây là quyết định kiến trúc vĩnh viễn.
 *  4. **Preview phải nói THẬT.** Dòng preview chỉ liệt kê thứ chắc chắn xảy ra; phần
 *     phụ thuộc bước sau (nhập file, chọn project nguồn) phải nói là "sau bước tiếp theo".
 *     Không hứa "3 sheet · 25 ô" cho template không sinh ra chúng.
 */
import type { TemplateId } from "../dialogs/CreateParts";

export const CREATE_MODES = ["workflow", "canvas"] as const;
export type CreateMode = (typeof CREATE_MODES)[number];

/** §1.1-3: đường đã qua QA là mặc định, canvas là lựa chọn CÓ CHỦ Ý. */
export const DEFAULT_MODE: CreateMode = "workflow";

export function isCreateMode(v: unknown): v is CreateMode {
  return typeof v === "string" && (CREATE_MODES as readonly string[]).includes(v);
}

/** Nội dung hai thẻ mode — chốt trong spec §1.2, không để dev tự nghĩ câu chữ. */
export interface ModeCopy {
  id: CreateMode;
  title: string;
  /** 1–2 câu mô tả, đặt dưới tiêu đề thẻ. Dùng làm `aria-describedby`. */
  body: string;
  /** Dòng "↳ hợp khi…" — giúp chọn nhanh mà không phải đọc hết. */
  fit: string;
  /** Nhãn nhỏ góc thẻ. `null` = không có nhãn. */
  tag: string | null;
}

export const MODE_COPY: readonly ModeCopy[] = [
  {
    id: "canvas",
    title: "Bàn làm việc tự do",
    body: "Kéo ảnh tham khảo, xếp element, ghi chú tự do. Gom lại thành sheet khi sẵn sàng sinh ảnh.",
    fit: "hợp khi ý tưởng còn mờ",
    tag: null,
  },
  {
    id: "workflow",
    title: "Quy trình chuẩn",
    body: "Chọn element → sinh ảnh → cắt → tải kit. Từng bước rõ ràng, đã kiểm thử kỹ.",
    fit: "hợp khi đã biết cần gì",
    tag: "Mặc định",
  },
];

export function modeCopy(mode: CreateMode): ModeCopy {
  return MODE_COPY.find((m) => m.id === mode) ?? MODE_COPY[1]!;
}

/* ═════════════ FILE CON ĐẦU TIÊN ═════════════ */

/**
 * Kế hoạch file con đầu tiên. **Chỉ là DỮ LIỆU** — B1 không gọi `docsRepo`, việc tạo
 * thật là của B2 (FE2-PLAN §3-B2). Tách ra như vậy để hai task không tranh file và để
 * kế hoạch được kiểm bằng test thuần logic.
 */
export interface FirstDocPlan {
  name: string;
  kind: CreateMode;
  /** Câu giải thích ngắn cho preview — cùng nguồn chữ với thứ sẽ tạo thật. */
  note: string;
}

export function firstDocPlan(mode: CreateMode): FirstDocPlan {
  return mode === "canvas"
    ? { name: "Bàn ý tưởng", kind: "canvas", note: "bàn làm việc trống, chưa sinh ảnh" }
    : { name: "Bộ kit chính", kind: "workflow", note: "mở thẳng vào quy trình 8 bước" };
}

/** Ý định chuyển sang bước sau khi project đã được tạo THẬT (B2/E1 tiêu thụ). */
export interface CreateIntent {
  template: TemplateId;
  mode: CreateMode;
  firstDoc: FirstDocPlan;
}

export function createIntent(template: TemplateId, mode: CreateMode): CreateIntent {
  return { template, mode, firstDoc: firstDocPlan(mode) };
}

/* ═════════════ PREVIEW KHÁC BIỆT THEO MODE ═════════════ */

export interface PreviewLine {
  /** Khoá ổn định để React `key` và để test bám vào, không bám vào câu chữ. */
  id: string;
  text: string;
  /** `true` ⇒ dòng nói về việc CHƯA chắc, xảy ra ở bước sau. UI hiện mờ hơn. */
  later?: boolean;
}

/** Nội dung khởi tạo phụ thuộc TEMPLATE, không phụ thuộc mode. */
function templateLine(template: TemplateId): PreviewLine {
  switch (template) {
    case "basic":
      return { id: "tpl", text: "Bản thiết kế mẫu: 3 sheet · 25 ô · 24 element + 1 nền" };
    case "blank":
      return { id: "tpl", text: "Bản thiết kế trống — bạn tự chọn element từ thư viện" };
    case "from-project":
      return { id: "tpl", text: "Nội dung sao từ project nguồn — chọn ở bước sau", later: true };
    case "import":
      return { id: "tpl", text: "Nội dung đọc từ tệp .zip / styles.json — chọn ở bước sau", later: true };
  }
}

/**
 * Ba đến bốn dòng "sẽ có gì sau khi bấm Tạo".
 *
 * Vì sao cần: bản v1 bắt người dùng đoán hậu quả của một nút. Với hai mode thì càng
 * phải nói trước — khác biệt giữa chúng nằm ở **màn mở ra sau đó**, thứ mà người dùng
 * không nhìn thấy lúc đang ở trong dialog.
 */
export function createPreview(template: TemplateId, mode: CreateMode): PreviewLine[] {
  const doc = firstDocPlan(mode);
  const lines: PreviewLine[] = [
    { id: "project", text: "Một thư mục project trên máy bạn" },
    templateLine(template),
    { id: "doc", text: `File đầu tiên «${doc.name}» — ${doc.note}` },
  ];
  lines.push(
    mode === "canvas"
      ? { id: "open", text: "Mở ra bàn làm việc: dán ảnh tham khảo, ghi chú, chưa tốn lượt sinh ảnh nào" }
      : { id: "open", text: "Mở ra quy trình chuẩn: chọn element trước, sinh ảnh sau khi bạn xác nhận số lượt" },
  );
  return lines;
}

/**
 * Ranh giới trung thực của FE-2 (FE2-PLAN §4): file con hiện lưu bằng IndexedDB trên
 * máy, chưa có API `/docs`. UI phải nói câu này, không được im lặng để người dùng tưởng
 * file đã nằm cùng chỗ với project.
 */
export const LOCAL_DOC_NOTE =
  "File con hiện được lưu trên trình duyệt của máy này (bản nháp cục bộ). Project và ảnh vẫn nằm trong thư mục trên đĩa.";

/** §1.1-1: câu trấn an bắt buộc — chọn mode KHÔNG phải quyết định vĩnh viễn. */
export const MODE_REASSURANCE =
  "Đổi ý lúc nào cũng được — một project chứa được cả hai loại file.";
