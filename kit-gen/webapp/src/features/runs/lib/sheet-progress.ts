import type { Contract, Run, RunJob, Sheet } from "@/lib/types";
import { contractVariants, sheetVariantFilter } from "@/lib/types";

export interface SheetIdentity {
  variantId: string;
  variantLabel: string;
  sheetId: string;
  sheet: Sheet | null;
}

export type SheetProgressState = "waiting" | "drawing" | "awaiting-cut" | "done" | "failed";

/** Resolve against known variant ids, longest first; never split on the first dash. */
export function resolveSheetIdentity(job: RunJob, contract: Contract | null): SheetIdentity {
  const variants = contract ? contractVariants(contract) : [];
  const explicit = job.variant && job.sheet
    ? variants.find((variant) => variant.id === job.variant)
    : undefined;
  const matched = explicit ?? [...variants]
    .sort((a, b) => b.id.length - a.id.length)
    .find((variant) => job.job.startsWith(`${variant.id}-`));
  const variantId = job.variant ?? matched?.id ?? "";
  const sheetId = job.sheet ?? (matched ? job.job.slice(matched.id.length + 1) : job.job);
  const sheet = contract?.sheets.find((item) => {
    if (item.id !== sheetId) return false;
    const only = sheetVariantFilter(item);
    return only.length === 0 || only.includes(variantId);
  }) ?? null;
  return { variantId, variantLabel: matched?.vi || variantId, sheetId, sheet };
}

export function sheetProgressState(job: RunJob, run: Run): SheetProgressState {
  if (job.status === "failed") return "failed";
  if (run.status === "done" || run.status === "done-with-errors" || run.phase?.index === 2) {
    return job.status === "ok" ? "done" : job.status === "running" ? "drawing" : "waiting";
  }
  if (job.status === "ok") return "awaiting-cut";
  if (job.status === "running") return "drawing";
  return "waiting";
}

export function sheetDisplayName(identity: SheetIdentity): string {
  const sheet = identity.sheet;
  const fallback = identity.sheetId.replaceAll("-", " ");
  if (!sheet) return fallback;
  if (sheet.grid.cols === 1 && sheet.grid.rows === 1) return sheet.note || fallback;
  const count = sheet.components.filter((item) => item.skel.shape !== "empty").length;
  return `${count} ${identity.sheetId.startsWith("pose") ? "tư thế" : "món giao diện"}`;
}

export function friendlyDiagnosis(diagnosis: RunJob["diagnosis"]): string {
  if (diagnosis === "QUOTA_SUSPECTED") return "Đã hết lượt hỏi hôm nay.";
  if (diagnosis === "NO_ARTIFACT") return "Máy vẽ ra ảnh mờ hoặc không lưu được ảnh.";
  if (diagnosis === "NOT_LOGGED_IN") return "Máy không nhận ra ảnh nhân vật vì công cụ chưa sẵn sàng.";
  if (diagnosis === "TIMEOUT") return "Tấm này mất quá lâu nên đã dừng.";
  return "Tấm này chưa vẽ được. Bạn có thể xem máy nói gì rồi thử lại.";
}
