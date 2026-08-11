/**
 * features/projects/lib/agent-blob.ts — TẢI NHỊ PHÂN (zip xuất, ảnh bìa) qua transport.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG <a download> / <img src> THẲNG ═════════════════════════╗
 * ║ Điều hướng và tải subresource của TRÌNH DUYỆT không gửi được header tuỳ biến ║
 * ║ `X-KitGen-Client: 1` (§6.1 bắt buộc cho MỌI request). Agent chặn ở lớp 3.    ║
 * ║ ĐÃ ĐO THẬT, không suy đoán — agent 1.2.0 chạy tại 127.0.0.1:8791/8801:       ║
 * ║                                                                             ║
 * ║  $ curl -o /dev/null -w "%{http_code}" \                                    ║
 * ║      "http://127.0.0.1:8791/api/projects/<id>/export.zip?include=contract"   ║
 * ║    → 403   (ORIGIN_NOT_ALLOWED)                                             ║
 * ║  $ curl -H "X-KitGen-Client: 1" -H "Origin: http://localhost:8791" …         ║
 * ║    → 200, Content-Disposition: attachment; filename="kitgen-…-20260806.zip"  ║
 * ║                                                                             ║
 * ║  $ curl -H "Sec-Fetch-Site: same-origin" …/files/contract.json              ║
 * ║    → 403 {"code":"CLIENT_HEADER_REQUIRED"}      (đường vào /app/)            ║
 * ║  $ curl -H "Sec-Fetch-Site: cross-site"  …/files/contract.json              ║
 * ║    → 403 {"code":"ORIGIN_NOT_ALLOWED"}          (đường vào Pages)            ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 * Nghĩa là `api.files.thumbUrl()` (R0) KHÔNG gắn được vào `<img src>` — cả hai
 * đường vào đều 403. Đây là giải pháp TẠM trong nhánh S1: tải qua transport rồi
 * dựng object URL. Xem teams/react/NEEDS-s1-projects.md N2/N3 — đề nghị R0 bổ sung
 * `api.files.blob()`/`api.projects.exportBlob()` (hoặc agent cho `/files/` vào
 * publicPath chỉ-đọc) để bỏ file này đi.
 *
 * TODO(N2/N3): xoá file này khi R0 hoặc agent đóng một trong hai hướng trên.
 *
 * `httpGet` là module transport DUY NHẤT (§6.5-1) — nó tự gắn header, tự parse
 * envelope lỗi, tự kiểm protocol. Ở đây KHÔNG có `fetch()` trần.
 */
import { httpGet } from "@/lib/api/client";
import { LIMITS } from "@/lib/api";

/** Rút tên file từ `Content-Disposition` của agent (nguồn sự thật, §4.7). */
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

export interface DownloadResult {
  fileName: string;
  bytes: number;
}

/**
 * Tải một đường dẫn của agent về máy user dưới dạng file.
 * Dùng Blob + object URL: không gọi ra domain thứ ba nào (§8.2).
 */
export async function downloadPath(path: string, fallbackName: string): Promise<DownloadResult> {
  // kind "upload" = timeout 60s, KHÔNG retry — zip có thể vài trăm MB và
  // retry một lần tải dở là vô nghĩa (§6.1).
  const res = await httpGet<Response>(path, { raw: true, kind: "upload" });
  const blob = await res.blob();
  const fileName = filenameFrom(res, fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke muộn: Safari đọc blob sau khi click một nhịp.
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  return { fileName, bytes: blob.size };
}

/** Tải chuỗi thành file .txt (báo cáo nhập §4.6 bước 3). Không đụng mạng. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ═════════ Ảnh bìa: tải qua transport, cache object URL ═════════ */

const MAX_CACHED_THUMBS = 120;
const thumbs = new Map<string, Promise<string>>();

function cacheKey(projectId: string, relPath: string): string {
  return `${projectId}|${relPath}`;
}

/**
 * URL hiển thị được cho ảnh bìa. LUÔN xin bản `?w=256` (§6.5-5, đóng H4: v1 nạp
 * PNG 3.1 MB vào lưới).
 *
 * Object URL được cache theo (project, path) và cố ý KHÔNG revoke khi component
 * unmount: cùng một ảnh bìa xuất hiện lại mỗi lần lọc/sắp xếp, revoke sớm sẽ làm
 * ảnh nháy trắng mỗi lần gõ vào ô tìm. Trần 120 mục, quá thì bỏ mục cũ nhất.
 */
export function loadThumb(projectId: string, relPath: string): Promise<string> {
  const key = cacheKey(projectId, relPath);
  const hit = thumbs.get(key);
  if (hit) return hit;

  const p = (async () => {
    const safe = relPath.split("/").filter((s) => s !== "" && s !== ".");
    if (safe.some((s) => s === "..")) throw new Error("path-escape");
    const url =
      `/api/projects/${encodeURIComponent(projectId)}/files/` +
      `${safe.map(encodeURIComponent).join("/")}?w=${LIMITS.thumbWidth}`;
    const res = await httpGet<Response>(url, { raw: true, kind: "get" });
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  })();

  // Lỗi thì bỏ khỏi cache để lần sau (agent chạy lại) còn thử được.
  p.catch(() => thumbs.delete(key));

  thumbs.set(key, p);
  if (thumbs.size > MAX_CACHED_THUMBS) {
    const oldest = thumbs.keys().next();
    if (!oldest.done) {
      const old = thumbs.get(oldest.value);
      thumbs.delete(oldest.value);
      void old?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    }
  }
  return p;
}

/** Quên ảnh bìa của một project (sau khi xoá / đổi ảnh bìa). */
export function forgetThumbs(projectId: string): void {
  for (const key of [...thumbs.keys()]) {
    if (key.startsWith(`${projectId}|`)) {
      const old = thumbs.get(key);
      thumbs.delete(key);
      void old?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    }
  }
}
