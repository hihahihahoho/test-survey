/**
 * features/kit/lib/image-source.ts — NGUỒN ẢNH CHO S5.
 *
 * ╔══ VÌ SAO KHÔNG GẮN THẲNG `api.files.thumbUrl()` VÀO `<img src>` ═══════════╗
 * ║ Vì nó trả 403. Tôi ĐO trên agent 1.2.0 thật (workspace tạm /tmp/kitws-s5b, ║
 * ║ cổng 8791, kit 9 file PNG do tôi dựng), không suy đoán:                    ║
 * ║                                                                            ║
 * ║  A) <img> từ trang Pages   (Sec-Fetch-Site: cross-site, không header)       ║
 * ║       GET …/files/kits/tet/01-btn-primary.png?w=256   → 403                 ║
 * ║  B) <img> từ bản /app      (Sec-Fetch-Site: same-origin, không header)      ║
 * ║       GET …/files/kits/tet/01-btn-primary.png?w=256   → 403                 ║
 * ║  C) fetch có X-KitGen-Client + Origin hợp lệ                                ║
 * ║       → 200 · Content-Type: image/png · ETag "1786001012269-223"            ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 * Lý do ở phía agent: `checkClientHeader` (agent/lib/security.mjs) chỉ miễn cho
 * `PUBLIC_PATHS = ["/bridge.html", "/app", "/favicon.ico"]`; `/api/projects/*` KHÔNG
 * nằm trong đó. Trình duyệt thì không cho đặt header tuỳ biến lên `<img src>`.
 * ⇒ Ảnh PHẢI đi qua transport rồi thành object URL. S1 đã gặp đúng việc này
 * (`features/projects/lib/agent-blob.ts`); tôi KHÔNG import file của họ vì đó là
 * nhánh của team khác, và S5 cần thêm 3 thứ mà bản của họ không có:
 *   ① HÀNG ĐỢI có giới hạn — kit thật >500 ảnh; agent rate-limit bucket "static"
 *      là 600 req/s nhưng trình duyệt + Pillow thì không, và mở 500 request song
 *      song sẽ làm treo cả app. Ở đây tối đa 6 request cùng lúc.
 *   ② HUỶ ĐƯỢC — ô cuộn ra khỏi màn thì bỏ hàng đợi, không tải nữa.
 *   ③ LRU có trần + đếm để lightbox (ảnh gốc) không đẩy hết thumbnail ra khỏi cache.
 *
 * TODO(NEEDS-s5-kit N1): khi R0 bổ sung `api.files.blob()` (hoặc agent cho `/files/`
 * vào publicPath chỉ-đọc) thì file này rút còn phần hàng đợi + LRU.
 */
import { httpGet } from "@/lib/api/client";
import { LIMITS } from "@/lib/api";

/** Song song tối đa. 6 = đúng trần kết nối HTTP/1.1 của trình duyệt cho một origin. */
const MAX_INFLIGHT = 6;
/**
 * Trần cache theo SỐ MỤC.
 *
 * ⚠️ Từ khi lưới phục vụ ẢNH GỐC (xem `KitImage`), con số này một mình KHÔNG còn
 * đủ: 400 mục thumbnail ≈ 8–32 MB, nhưng 400 mục ảnh gốc có thể là 400 × 1,5 MB
 * = 600 MB blob giữ sống vì object URL chỉ được `revoke` lúc bị đẩy ra. Nên có
 * thêm trần theo BYTE ở dưới, và mục nào cũng nhớ kích thước thật của nó.
 */
const MAX_CACHED = 400;
/**
 * Trần cache theo BYTE — đây mới là trần thật.
 *
 * 128 MB chọn theo số đo của một dự án thật (10 sheet thô 14,6 MB + 52 ô đã cắt
 * 10,1 MB = 25 MB): cả dự án nằm gọn trong cache, còn kit rất lớn thì bị đẩy dần
 * chứ không nuốt hết RAM. Bị đẩy ra chỉ có nghĩa là tải lại từ agent trên
 * localhost — rẻ, và không mất một pixel nào.
 */
const MAX_CACHED_BYTES = 128 * 1024 * 1024;

type Key = string;

interface Task {
  key: Key;
  url: string;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
  /** true ⇒ ô đã rời màn, đừng tải nữa. */
  cancelled: boolean;
}

/** Mục cache: object URL + số byte thật của blob (để tính trần theo byte). */
interface Cached { url: string; bytes: number }

const cache = new Map<Key, Cached>();
/** Tổng byte đang giữ trong `cache` — cộng/trừ theo từng mục, không quét lại. */
let cachedBytes = 0;
const pending = new Map<Key, Promise<string>>();
const queue: Task[] = [];
let inflight = 0;

/**
 * ╔══ `version` — VÌ SAO KHOÁ CACHE PHẢI CÓ NÓ ═══════════════════════════════╗
 * ║ Đường dẫn ảnh KHÔNG ĐỔI giữa hai lượt vẽ: một tấm luôn là `raw/<tấm>.png`, ║
 * ║ một ô luôn là `kits/<phong cách>/<tên>.png`. Cache ở dưới khoá theo (dự án,║
 * ║ đường dẫn, bề rộng) ⇒ sau khi gen/cắt lại, ô nào đã từng hiện sẽ hiện lại   ║
 * ║ ĐÚNG ẢNH CŨ, và chỉ F5 mới chữa được — đúng lỗi chủ sản phẩm báo 07/09/2026.║
 * ║ Bản trước chữa bằng `forgetProject()` (dọn cả dự án) gọi lúc nghe tin ảnh   ║
 * ║ mới về. Nó không đủ, vì hai lý do có thật:                                  ║
 * ║  ① Tin ảnh mới về (`sheet.image`) tới TRƯỚC bước cắt. Giữa lúc ấy và lúc    ║
 * ║    cắt xong, lưới ô vẫn tải — và nạp lại ĐÚNG ô cũ vào cache vừa dọn.       ║
 * ║  ② Dọn cả dự án thì mọi tấm khác cũng mất ảnh và phải tải lại từ đầu.       ║
 * ║ `version` chữa tận gốc: nó là `mtime` của chính file (agent trả trong `#42`  ║
 * ║ và trong đường dẫn ảnh của lượt chạy). File đổi ⇒ khoá đổi ⇒ URL đổi ⇒ ảnh  ║
 * ║ mới. File không đổi ⇒ vẫn là cache hit, không có một byte nào tải thừa.     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
function keyOf(projectId: string, relPath: string, width: number | null, version: string | null): Key {
  return `${projectId}|${relPath}|${width ?? "full"}|${version ?? ""}`;
}

/**
 * Dựng URL API. KHÔNG dùng `api.files.thumbUrl()` vì hàm đó trả URL tuyệt đối kèm
 * base, còn transport lại tự ghép base ⇒ ghép hai lần. Ở đây trả đường dẫn tương đối
 * và để transport lo base + header, đúng §6.5-1 (một cửa transport duy nhất).
 * Chặn `..` giống `client.fileUrl` để bug tầng trên lộ ra ngay thay vì thành 400 âm thầm.
 */
export function filePath(
  projectId: string, relPath: string, width: number | null, version: string | null = null,
): string {
  const segs = String(relPath).split("/").filter((s) => s !== "" && s !== ".");
  if (segs.some((s) => s === "..")) throw new Error(`đường dẫn không hợp lệ: ${relPath}`);
  /* `v` ĐI VÀO URL, không chỉ vào khoá cache trong bộ nhớ. Agent bỏ qua tham số nó
     không đọc (`files.mjs` chỉ đọc `w`), nên đây là chỗ rẻ nhất để cắt luôn cả cache
     heuristic của trình duyệt: cùng một file mà mtime khác thì là một URL khác.
     Bỏ trống khi không biết phiên bản — hành vi y hệt bản trước, không xấu đi ca nào. */
  const q = [
    width === null ? null : `w=${encodeURIComponent(width)}`,
    version === null || version === "" ? null : `v=${encodeURIComponent(version)}`,
  ].filter((x) => x !== null).join("&");
  const path = `/api/projects/${encodeURIComponent(projectId)}/files/${segs.map(encodeURIComponent).join("/")}`;
  return q === "" ? path : `${path}?${q}`;
}

function pump(): void {
  while (inflight < MAX_INFLIGHT && queue.length > 0) {
    const task = queue.shift()!;
    if (task.cancelled) {
      pending.delete(task.key);
      task.reject(new DOMException("Đã bỏ tải vì ô rời khỏi màn", "AbortError"));
      continue;
    }
    inflight += 1;
    void (async () => {
      try {
        const res = await httpGet<Response>(task.url, { raw: true, kind: "get" });
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        remember(task.key, objectUrl, blob.size);
        task.resolve(objectUrl);
      } catch (e) {
        pending.delete(task.key);
        task.reject(e);
      } finally {
        inflight -= 1;
        pump();
      }
    })();
  }
}

function remember(key: Key, objectUrl: string, bytes: number): void {
  cache.set(key, { url: objectUrl, bytes });
  cachedBytes += bytes;
  pending.delete(key);
  /* Đẩy mục CŨ NHẤT ra cho tới khi lọt cả hai trần. Luôn giữ lại ít nhất một mục:
     ảnh vừa tải mà một mình đã vượt trần byte thì đẩy nó ra là vô nghĩa — ô đang
     hiện cần đúng nó, và vòng lặp sẽ quay lại tải rồi đẩy mãi. */
  while (cache.size > 1 && (cache.size > MAX_CACHED || cachedBytes > MAX_CACHED_BYTES)) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    evict(oldest.value);
  }
}

/** Bỏ một mục khỏi cache: trừ byte, `revoke` object URL. */
function evict(key: Key): void {
  const entry = cache.get(key);
  if (entry === undefined) return;
  cache.delete(key);
  cachedBytes -= entry.bytes;
  URL.revokeObjectURL(entry.url);
}

export interface LoadHandle {
  promise: Promise<string>;
  /** Bỏ tải nếu còn trong hàng đợi. Đang tải rồi thì cứ để xong (đã tốn công). */
  cancel: () => void;
}

/**
 * Lấy object URL của một ảnh trong project.
 * @param width `null` = ảnh GỐC (chỉ dùng ở lightbox — §6.5-5); còn lại là thumbnail.
 */
export function loadImage(
  projectId: string, relPath: string, width: number | null, version: string | null = null,
): LoadHandle {
  const key = keyOf(projectId, relPath, width, version);

  const hit = cache.get(key);
  if (hit !== undefined) {
    // Chạm lại để LRU coi là mới dùng.
    cache.delete(key);
    cache.set(key, hit);
    return { promise: Promise.resolve(hit.url), cancel: () => {} };
  }

  const inFlight = pending.get(key);
  if (inFlight !== undefined) return { promise: inFlight, cancel: () => {} };

  let task: Task | null = null;
  const promise = new Promise<string>((resolve, reject) => {
    task = { key, url: filePath(projectId, relPath, width, version), resolve, reject, cancelled: false };
    queue.push(task);
  });
  pending.set(key, promise);
  // `.catch` rỗng để một ô ảnh lỗi không thành unhandled rejection làm bẩn console.
  promise.catch(() => {});
  pump();

  return {
    promise,
    cancel: () => {
      if (task) task.cancelled = true;
    },
  };
}

/** Thumbnail cho lưới — LUÔN `?w=256` (§6.5-5, đóng H4). */
export function loadThumb(projectId: string, relPath: string, version: string | null = null): LoadHandle {
  return loadImage(projectId, relPath, LIMITS.thumbWidth, version);
}

/** Ảnh GỐC — chỉ lightbox và "xem pixel" được gọi. */
export function loadFull(projectId: string, relPath: string, version: string | null = null): LoadHandle {
  return loadImage(projectId, relPath, null, version);
}

/**
 * Quên ảnh của một project — LỐI DỌN THÔ, KHÔNG PHẢI CÁCH CHỮA ẢNH CŨ.
 *
 * Cách chữa là `version` (xem `keyOf`): mỗi ảnh mang `mtime` của chính nó, nên ảnh mới
 * có khoá mới mà không ai phải dọn gì. Hàm này ở lại cho ca "tôi không tin cái gì nữa"
 * — nút tải lại thủ công — và cho dự án mà agent đời cũ không trả `mtime`.
 * KHÔNG gọi nó theo sự kiện của lượt chạy: nó dọn CẢ dự án, tức mọi tấm khác cũng phải
 * tải lại từ đầu, và nếu gọi lúc `sheet.image` (trước bước cắt) thì lưới ô lập tức nạp
 * lại đúng ảnh cũ vào cache vừa dọn — dọn xong vẫn cũ.
 */
export function forgetProject(projectId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${projectId}|`)) evict(key);
  }
}

/** Chỉ dùng cho test/panel dev. */
export function cacheStats(): { cached: number; pending: number; queued: number; inflight: number } {
  return { cached: cache.size, pending: pending.size, queued: queue.length, inflight };
}
