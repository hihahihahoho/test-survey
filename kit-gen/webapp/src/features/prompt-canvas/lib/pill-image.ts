import type { RefKind } from "@/lib/types/api";
import { refPath } from "@/features/kit-core/lib/kitset-to-contract";

/**
 * pill-image.ts — ẢNH CỦA MỘT PILL SỐNG Ở ĐÂU, VÀ ĐI VÀO CONTRACT BẰNG GÌ.
 *
 * ╔══ MÓN NỢ ĐANG ĐƯỢC TRẢ Ở FILE NÀY ═══════════════════════════════════════╗
 * ║ Bản lab để ảnh trong `URL.createObjectURL(file)` và tự khai thẳng món nợ   ║
 * ║ đó ở `prompt-lab/lib/schema.ts`: "F5 là mất sạch ảnh — JSON tài liệu còn   ║
 * ║ một `blob:` chết". Món nợ ấy không phải chuyện thẩm mỹ, nó chặn ĐÚNG hai   ║
 * ║ việc mà wave này sinh ra để làm:                                          ║
 * ║   ① LƯU BỀN — tài liệu composer nay nằm trong project trên đĩa; một        ║
 * ║     `blob:abc-123` ghi xuống đĩa là một chuỗi rác cho máy khác đọc.        ║
 * ║   ② DỊCH RA CONTRACT — `sheet.ref` phải là đường dẫn TƯƠNG ĐỐI trong       ║
 * ║     project (`refs/<tên>`), vì `gen.sh` đính kèm ảnh theo đường dẫn ấy.    ║
 * ║     Không có byte nào trên đĩa thì không có gì để đính kèm.                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Nên pill nay giữ đúng thứ agent trả về sau khi ghi ảnh xuống `refs/`:
 * `{ refName, path }` — KHÔNG giữ byte, KHÔNG giữ URL trình duyệt.
 */

/**
 * Ảnh của một pill, sau khi đã nằm trên đĩa project.
 *
 * Hai trường, cố ý không gộp làm một:
 *  · `refName` — TÊN agent tự đặt (`char-lan.png`). Đây là khoá mà `#31 DELETE
 *    /refs/:name` và `refUsage()` (V-08 "ảnh đang được dùng") nói chuyện.
 *  · `path`    — `refs/<tên>`, thứ đi thẳng vào `sheet.ref` của contract và vào
 *    URL đọc ảnh `GET /api/projects/:id/files/<path>`.
 * Suy được cái này ra cái kia, nhưng suy ở 4 chỗ khác nhau là 4 chỗ để lệch.
 */
export interface PillImage {
  refName: string;
  path: string;
}

/**
 * VAI TRÒ của một tấm ảnh trong câu — thứ quyết định nó đi vào ĐÂU của contract.
 *
 * ╔══ VÌ SAO VAI TRÒ PHẢI ĐƯỢC GHI RA, KHÔNG SUY TỪ VỊ TRÍ ══════════════════╗
 * ║ `gen.sh` đính mọi ảnh vào cùng một danh sách `referenced_image_paths` và   ║
 * ║ gọi chúng theo VAI TRÒ trong prompt ("the attached character REFERENCE     ║
 * ║ PHOTO", "brand / inspiration reference images") — nó cố ý không đếm thứ tự ║
 * ║ nữa (xem khối «KHÔNG CÒN "The SECOND attached image"» ở gen.sh). Nhưng để  ║
 * ║ nói được vai trò thì contract phải xếp tấm ảnh vào đúng ô: `sheet.ref` cho ║
 * ║ nhân vật, `variant.brand.refs` cho logo, `variant.inspo` cho ảnh tả chủ đề ║
 * ║ hay lối vẽ. Một pill ảnh không khai vai trò thì bộ dịch chỉ còn cách đoán  ║
 * ║ theo chỗ nó đứng trong câu — mà chỗ đứng thì người dùng đổi được bằng một  ║
 * ║ nhịp mũi tên.                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Rỗng = ảnh của một thẻ (nhân vật / cảnh nền) — vai trò đã do CHỖ ĐẶT quyết
 * định (`sheet.ref` của chính tấm ấy), nên nó không cần tự khai thêm gì.
 */
export type PillImageRole = "" | "theme" | "style" | "character";

const ROLES: readonly string[] = ["theme", "style", "character"];

/** Vai trò khai trong attr của node. Giá trị lạ ⇒ rỗng, không đoán. */
export function readPillImageRole(attrs: Record<string, unknown> | null | undefined): PillImageRole {
  const raw = attrs?.["role"];
  return typeof raw === "string" && ROLES.includes(raw) ? (raw as PillImageRole) : "";
}

/** Pill chưa có ảnh. Đây là GIÁ TRỊ MẶC ĐỊNH của attr, không phải `null`. */
export const EMPTY_PILL_IMAGE: PillImage = { refName: "", path: "" };

/** Đã có ảnh thật trên đĩa chưa. `path` mới là thứ quyết định — xem `PillImage`. */
export function hasPillImage(image: PillImage | null | undefined): boolean {
  return !!image && image.path !== "";
}

/**
 * Đọc attr của node thành `PillImage`.
 *
 * PHÒNG THỦ, vì nguồn của nó là JSON đã lưu trên đĩa từ một đời code trước: tài
 * liệu cũ còn mang `refs: [{ url: "blob:…" }]`. Đọc ra ảnh rỗng là ĐÚNG cho ca
 * đó — ảnh ấy vốn đã chết từ lúc tab cũ đóng lại; giả vờ còn ảnh mới là nói dối.
 */
export function readPillImage(attrs: Record<string, unknown> | null | undefined): PillImage {
  const refName = typeof attrs?.["refName"] === "string" ? (attrs["refName"] as string) : "";
  const raw = typeof attrs?.["path"] === "string" ? (attrs["path"] as string) : "";
  /* `refPath()` vừa chuẩn hoá vừa CHẶN: `..`, `/` đứng đầu, thư mục con — mọi
     thứ không phải một tên ref hợp lệ đều thành chuỗi rỗng chứ không được "sửa
     cho hợp lệ" (bài học `refs/../gen.sh`, xem chú thích của chính hàm ấy). */
  const path = raw ? refPath(raw) : "";
  return path ? { refName: refName || path.slice("refs/".length), path } : EMPTY_PILL_IMAGE;
}

/* ══════════════════════════════════════════════════════════════════════════
   Nguồn ảnh → tệp gửi lên agent
   ══════════════════════════════════════════════════════════════════════════ */

/** Thứ một pill nhận vào: tệp người dùng thả, hoặc data URL của một khung đã chụp. */
export type PillImageSource = File | Blob | string;

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,/i;

/** Đuôi tệp theo MIME — chỉ ba kiểu agent nhận (`refs.mjs`: PNG/JPG/WebP). */
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * `data:image/png;base64,…` → `File`.
 *
 * ══ VÌ SAO GIẢI MÃ TAY CHỨ KHÔNG `await fetch(dataUrl)` ═══════════════════
 * `fetch` một data URL chạy được trên trình duyệt, nhưng nó biến một phép biến
 * đổi THUẦN thành một lời hứa phụ thuộc môi trường mạng — không test được ở môi
 * trường `node` và không nói được lỗi gì khi chuỗi hỏng. `atob` + `Uint8Array`
 * là đúng phép đang cần, đồng bộ, và có mặt ở cả hai môi trường.
 *
 * Ném khi chuỗi không phải data URL base64 của ảnh: đây là đường đi của
 * `capturePoseRef()` (pose-lab trả data URL), và một chuỗi hỏng phải nổ NGAY ở
 * đây chứ không được biến thành một request 400 khó hiểu.
 */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const head = DATA_URL_RE.exec(dataUrl);
  if (!head) throw new Error("Chuỗi ảnh không phải data URL");
  if (!head[2]) throw new Error("data URL phải mã hoá base64");
  const mime = (head[1] ?? "image/png").toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`Kiểu ảnh ${mime} không nhận — chỉ PNG/JPG/WebP`);

  const binary = atob(dataUrl.slice(head[0].length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  /* Đuôi tệp phải khớp MIME: agent kiểm MAGIC BYTES chứ không tin `Content-Type`,
     nhưng nó đặt tên tệp trên đĩa theo đuôi nó tự dò ra — tên gợi ý sai đuôi chỉ
     làm log khó đọc, không làm hỏng ảnh. Vẫn khớp cho sạch. */
  return new File([bytes], name.replace(/\.[a-z0-9]+$/i, "") + `.${ext}`, { type: mime });
}

export interface UploadPillImageOptions {
  /** Loại ảnh theo phân loại của agent. Ảnh trong pill mặc định là ảnh NHÂN VẬT. */
  kind?: RefKind;
  /** Tên gợi ý cho agent (`hintName`) — agent vẫn tự quyết tên cuối cùng. */
  hintName?: string;
}

/**
 * Đưa một ảnh của pill lên đĩa project, trả về đúng thứ pill cần giữ.
 *
 * `POST /api/projects/:id/refs` (multipart) — **client KHÔNG gửi `path`**, agent
 * tự đặt tên rồi trả `{ name, path }`. Đó là luật G1 của agent (`refs.mjs`), và
 * cũng là lý do hàm này trả về `PillImage` chứ không nhận vào một đường dẫn.
 *
 * ══ VÌ SAO `import()` ĐỘNG THAY VÌ IMPORT TĨNH `@/lib/api` ═════════════════
 * Để module này THUẦN ở tầng module: `prompt-lab/lib/serialize.ts` và bộ dịch
 * contract đều đọc `PillImage`, và cả hai chạy trong ca test môi trường `node`.
 * Kéo cả tầng transport (dò cổng, timeout, retry) vào chỉ để có một `interface`
 * là bắt mọi ca test logic gánh một thứ chúng không dùng.
 */
export async function uploadPillImage(
  projectId: string,
  source: PillImageSource,
  opts: UploadPillImageOptions = {},
): Promise<PillImage> {
  const hintName = opts.hintName ?? "";
  const file =
    typeof source === "string"
      ? dataUrlToFile(source, hintName || "pose-ref")
      : source instanceof File
        ? source
        : new File([source], hintName || "anh-tham-chieu.png", { type: source.type || "image/png" });

  const { api } = await import("@/lib/api");
  const res = await api.refs.add(projectId, file, opts.kind ?? "character", hintName || file.name);

  /* Đi qua `refPath()` một lần nữa dù agent vừa sinh ra chuỗi này: giá trị sắp
     được ghi vào `sheet.ref` của contract, và luật REF_PATH bị vi phạm thì cả
     `contractSchema.parse` lẫn agent đều từ chối LÚC LƯU — tức là rất xa chỗ gây
     ra lỗi. Chặn tại nguồn. */
  const path = refPath(res.path || res.name);
  if (!path) throw new Error(`Agent trả về đường dẫn ảnh không dùng được: ${res.path || res.name}`);
  return { refName: res.name, path };
}
