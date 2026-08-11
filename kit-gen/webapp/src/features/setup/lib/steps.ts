/**
 * features/setup/lib/steps.ts — 4 BƯỚC của wizard S0 + cầu nối sang store persist của R0.
 *
 * Thứ tự theo §3-S0: (1) Cài công cụ → (2) Kết nối → (3) Thư mục làm việc → (4) Tạo ảnh.
 *
 * ⚠️ LỆCH KIỂU VỚI R0 — ĐÃ GHI Ở teams/react/NEEDS-s0-setup.md (N1):
 * `lib/store/setup.ts` (chủ sở hữu: R0) khai enum bước là
 *      "download" | "run" | "connect" | "imagegen" | "done"
 * tức là một cách chia bước KHÁC: không có bước "thư mục làm việc", lại có bước "run"
 * (chạy script) mà spec gộp vào bước 1. Tôi KHÔNG được sửa file của R0, và cũng KHÔNG
 * được ghi giá trị ngoài enum: `persist.ts` dùng `z.enum(...)`, gặp giá trị lạ thì
 * `safeParse` fail và **toàn bộ khoá `kitgen.setup.v1` rơi về mặc định** — tức là mất
 * luôn cờ `completed`, user đã cài xong lại bị ném về wizard. Đã đọc kỹ persist.ts:246
 * (`storeSet` → fallback `defaultsFor`) nên đây là hậu quả thật, không phải phỏng đoán.
 *
 * ⇒ Giải pháp tạm trong nhánh mình: MAP hai chiều giữa bước UI và enum đã lưu.
 * Ô "run" (không dùng trong wizard 4 bước) được mượn để lưu bước "thư mục làm việc".
 * TODO(R0): thêm "workspace" vào enum `setupSchema.step` rồi bỏ hàm map này.
 */
import type { SetupStep as PersistedStep } from "@/lib/store";

/** Bước của wizard trên MÀN HÌNH (khác enum đã lưu — xem chú thích đầu file). */
export type WizardStep = "install" | "connect" | "workspace" | "imagegen";

export interface StepMeta {
  id: WizardStep;
  /** nhãn ngắn trên stepper — CÓ CHỮ, không chỉ số (§3-S0). */
  label: string;
  /** nhãn đủ nghĩa cho screen reader và tooltip. */
  long: string;
}

export const STEPS: readonly StepMeta[] = Object.freeze([
  { id: "install", label: "Cài công cụ", long: "Bước 1: tải và chạy script chuẩn bị máy" },
  { id: "connect", label: "Kết nối", long: "Bước 2: chờ công cụ local sẵn sàng" },
  { id: "workspace", label: "Thư mục", long: "Bước 3: chọn thư mục làm việc" },
  { id: "imagegen", label: "Tạo ảnh", long: "Bước 4: kiểm tra môi trường tạo ảnh" },
]);

export const STEP_IDS: readonly WizardStep[] = STEPS.map((s) => s.id);

export function stepIndex(id: WizardStep): number {
  const i = STEP_IDS.indexOf(id);
  return i === -1 ? 0 : i;
}

export function stepAt(i: number): WizardStep {
  return STEP_IDS[Math.min(Math.max(i, 0), STEP_IDS.length - 1)] as WizardStep;
}

export function stepMeta(id: WizardStep): StepMeta {
  return STEPS.find((s) => s.id === id) ?? (STEPS[0] as StepMeta);
}

export function isWizardStep(v: unknown): v is WizardStep {
  return typeof v === "string" && (STEP_IDS as readonly string[]).includes(v);
}

/* ═════════ Cầu nối với enum đã persist của R0 ═════════ */

const TO_PERSISTED: Record<WizardStep, PersistedStep> = {
  install: "download",
  connect: "connect",
  /** mượn ô "run" — R0 chưa có "workspace" (N1). */
  workspace: "run",
  imagegen: "imagegen",
};

const FROM_PERSISTED: Record<PersistedStep, WizardStep> = {
  download: "install",
  run: "workspace",
  connect: "connect",
  imagegen: "imagegen",
  /** đã xong hết ⇒ mở lại wizard thì đứng ở bước cuối, không rơi về bước 1. */
  done: "imagegen",
};

export function toPersistedStep(step: WizardStep): PersistedStep {
  return TO_PERSISTED[step];
}

export function fromPersistedStep(step: PersistedStep | string | undefined): WizardStep {
  if (typeof step === "string" && step in FROM_PERSISTED) {
    return FROM_PERSISTED[step as PersistedStep];
  }
  return "install";
}
