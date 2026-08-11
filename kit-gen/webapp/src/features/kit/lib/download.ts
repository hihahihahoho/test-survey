/**
 * features/kit/lib/download.ts — TẢI FILE của S5 (1 PNG · atlas · manifest · .zip kit).
 *
 * ╔══ VÌ SAO KHÔNG DÙNG `<a href download>` TRỰC TIẾP ═════════════════════════╗
 * ║ Điều hướng của trình duyệt không gắn được `X-KitGen-Client: 1`. ĐO THẬT     ║
 * ║ trên agent 1.2.0 (cổng 8791):                                              ║
 * ║   GET …/export.zip  (Sec-Fetch-Mode: navigate, không header)      → 403     ║
 * ║   GET …/export.zip  (X-KitGen-Client + Origin hợp lệ)             → 200,    ║
 * ║        4345 byte, magic "PK", Content-Disposition có filename               ║
 * ║ ⇒ phải tải qua transport rồi dựng object URL. Giống `agent-blob.ts` của S1;  ║
 * ║   tôi để bản của mình trong nhánh mình (NEEDS-s5-kit.md N1 đề nghị gộp).    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import { httpGet } from "@/lib/api/client";
import { filePath } from "./image-source";

/** Tên file do AGENT quyết (Content-Disposition) — nguồn sự thật, §4.7. */
function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers?.get?.("Content-Disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (!m?.[1]) return fallback;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke muộn: Safari đọc blob sau click một nhịp.
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export interface SavedFile {
  fileName: string;
  bytes: number;
}

/** Tải một đường dẫn của agent. `kind: "upload"` = timeout 60s, KHÔNG retry (§6.1). */
export async function savePath(path: string, fallbackName: string): Promise<SavedFile> {
  const res = await httpGet<Response>(path, { raw: true, kind: "upload" });
  const blob = await res.blob();
  const fileName = filenameFrom(res, fallbackName);
  saveBlob(blob, fileName);
  return { fileName, bytes: blob.size };
}

/** Tải 1 file trong project (PNG gốc, atlas.json, manifest.json…) — KHÔNG `?w=`. */
export function saveProjectFile(projectId: string, relPath: string): Promise<SavedFile> {
  const name = relPath.split("/").pop() ?? "file";
  return savePath(filePath(projectId, relPath, null), name);
}

/** #18 `export.zip`. `variant` rỗng = mọi phong cách. */
export function exportZipPath(
  projectId: string,
  include: readonly string[],
  variant: string | null,
): string {
  const usp = new URLSearchParams();
  usp.set("include", include.join(","));
  if (variant !== null && variant !== "") usp.set("variant", variant);
  return `/api/projects/${encodeURIComponent(projectId)}/export.zip?${usp.toString()}`;
}

/** Tên file zip mặc định nếu agent không gửi Content-Disposition: `kitgen-<slug>-<yyyymmdd>.zip`. */
export function zipFallbackName(slug: string, now: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `kitgen-${slug || "project"}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.zip`;
}
