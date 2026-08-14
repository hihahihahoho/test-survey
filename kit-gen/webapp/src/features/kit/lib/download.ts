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

/**
 * TẢI `.zip` XUẤT của một dự án — **cửa duy nhất** cho nút "Tải .zip".
 *
 * ╔══ VÌ SAO PHẢI CÓ HÀM NÀY, THAY VÌ ĐỂ NƠI GỌI TỰ GHÉP ═════════════════════╗
 * ║ `exportZipPath` trả về một ĐƯỜNG DẪN API ĐẦY ĐỦ (`/api/projects/…/export   ║
 * ║ .zip?include=…`), còn `saveProjectFile` nhận một đường dẫn TƯƠNG ĐỐI TRONG ║
 * ║ DỰ ÁN rồi tự bọc thêm `/api/projects/<id>/files/…`. Ghép hai cái vào nhau  ║
 * ║ cho ra                                                                     ║
 * ║   /api/projects/p1/files/api/projects/p1/export.zip%3Finclude%3Dkits        ║
 * ║ — query bị `encodeURIComponent` nhốt vào MỘT segment, cả đường API bị lồng  ║
 * ║ dưới `/files/`. Agent trả **400 PATH_ESCAPE** (`routes/files.mjs`: chỉ      ║
 * ║ raw/kits/refs/skeleton/prompts/export/runs/cover mới đọc được, `api` thì    ║
 * ║ không), nên bấm nút KHÔNG có file nào rơi xuống — đúng thứ blind-test thấy. ║
 * ║ Hai hàm đó không được phép nối tiếp nhau; đây là chỗ nối đúng.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `variant = null` (mặc định) = MỌI phong cách. Đừng khoá cứng một id phong cách:
 * agent đối chiếu với `contract.variants` và trả **422 UNKNOWN_VARIANT** cho id lạ,
 * mà dự án không do wizard tạo thì không có phong cách `chinh` nào cả.
 */
export function saveExportZip(
  projectId: string,
  include: readonly string[],
  variant: string | null = null,
): Promise<SavedFile> {
  return savePath(exportZipPath(projectId, include, variant), zipFallbackName(projectId));
}

/** Tên file zip mặc định nếu agent không gửi Content-Disposition: `kitgen-<slug>-<yyyymmdd>.zip`. */
export function zipFallbackName(slug: string, now: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `kitgen-${slug || "project"}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.zip`;
}
