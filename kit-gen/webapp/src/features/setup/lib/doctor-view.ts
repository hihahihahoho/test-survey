/**
 * features/setup/lib/doctor-view.ts — biến `GET /api/doctor` (§6.2 #2) thành thứ hiển thị được.
 *
 * Thuần logic, không JSX ⇒ đọc và kiểm tra được mà không cần dựng DOM.
 *
 * BẢO MẬT — ba điều file này KHÔNG BAO GIỜ làm (arch §4.3, §4.4):
 *  · không đọc/hiện `authPresent` như một thứ "đăng nhập với tài khoản nào";
 *    nó chỉ là boolean `existsSync(auth.json)` do agent trả về, và ta chỉ dùng để
 *    chọn CÂU HƯỚNG DẪN, không bao giờ in ra kèm chi tiết tài khoản.
 *  · không hiện `codexHomeLabel` nếu nó không phải nhãn rút gọn `~/…` — path tuyệt đối
 *    chứa tên user là PII.
 *  · không tạo ra bất kỳ chuỗi nào có thể bị coi là secret rồi đem lưu.
 */
import { imageGenReasonText } from "@/lib/api";
import type { Doctor, ImageGenMode } from "@/lib/types/api";
import { INSTALL_CMD, codexPathFixCmd } from "./commands";

/** Nhãn rút gọn mới được hiện. Path tuyệt đối ⇒ bỏ (arch §4.3-5). */
export function safeHomeLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const s = label.trim();
  if (s === "") return null;
  return /^~(\/|$)/.test(s) ? s : null;
}

/** 3 KẾT CỤC của khối "Tạo ảnh AI" — đúng §3-S0 bước 4. */
export interface ImageGenOutcome {
  tone: "ok" | "warn";
  title: string;
  detail: string | null;
  /** true ⇒ hiện khối hướng dẫn CODEX_HOME riêng (CHỈ hướng dẫn, không tự động hoá). */
  needsFallback: boolean;
  mode: ImageGenMode;
  homeLabel: string | null;
}

export function imageGenOutcome(doctor: Doctor | null | undefined): ImageGenOutcome {
  const ig = doctor?.imageGen;
  const mode = (ig?.mode ?? "unknown") as ImageGenMode;
  const homeLabel = safeHomeLabel(ig?.codexHomeLabel);

  if (ig?.available === true) {
    return {
      tone: "ok",
      title:
        mode === "img-home"
          ? "Sẵn sàng (dùng home riêng cho tạo ảnh)"
          : "Sẵn sàng (dùng cấu hình mặc định)",
      detail: homeLabel ? `Cấu hình đang dùng: ${homeLabel}` : null,
      needsFallback: false,
      mode,
      homeLabel,
    };
  }

  return {
    tone: "warn",
    title: "Chưa tạo được ảnh",
    // Văn bản lấy từ bảng tĩnh của R0 (7 enum `details.reason`), KHÔNG tự viết copy lỗi.
    detail: imageGenReasonText(ig?.reason),
    needsFallback: true,
    mode: ig?.available === false ? mode : "unknown",
    homeLabel,
  };
}

/** Mode được phép ghi vào `kitgen.setup.v1` — 5 enum của arch §4.1, không hơn. */
export function persistableMode(doctor: Doctor | null | undefined): ImageGenMode {
  const ig = doctor?.imageGen;
  if (!ig) return "unknown";
  if (ig.available === false) return "unavailable";
  const m = ig.mode;
  return m === "default-home" || m === "img-home" || m === "profile-overlay" ? m : "unknown";
}

/** Một dòng của checklist "Máy của bạn". */
export interface CheckRow {
  key: string;
  ok: boolean;
  /** `null` = agent chưa khai mục này ⇒ hiện "chưa kiểm được", KHÔNG bịa ✓ hay ✗. */
  known: boolean;
  label: string;
  value: string;
  /** Hệ quả bằng tiếng Việt khi thiếu — user phải biết mất gì, không chỉ biết "thiếu". */
  consequence: string;
  cmd?: string;
}

function ver(v: unknown): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
}

/**
 * DÒNG "codex CLI" — VÀ VÌ SAO NÓ KHÔNG CÒN CHỈ CÓ ✓/✗.
 *
 * ╔══ SỰ CỐ CÓ THẬT, ĐÃ PHẢI LÊN TẬN MÁY KHÁCH ═══════════════════════════════╗
 * ║ Dòng này báo ✓ "đã cài codex CLI". Khách mở Terminal gõ `codex` ⇒          ║
 * ║ **command not found**. Không mâu thuẫn: `ok` đo AGENT chạy được (nó kế     ║
 * ║ thừa PATH của phiên shell đã khởi động nó), còn khách gõ trong một shell   ║
 * ║ KHÁC. Standalone installer để binary ở `~/.local/bin` — thư mục không nằm  ║
 * ║ trong PATH mặc định của macOS — nên hai câu đó tách nhau rất dễ.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `ok` GIỮ NGUYÊN nghĩa cũ (agent chạy được ⇒ sinh ảnh được ⇒ không chặn wizard).
 * Cái thêm vào là NÓI THẬT phần còn lại: `value` ghi rõ Terminal chưa thấy, và
 * `cmd` đổi từ "cài lại codex" — vô ích, vì đã cài rồi — thành đúng dòng PATH cần
 * thêm. `shellOk == null` (Windows, shell treo) thì không đổi một chữ nào: im lặng
 * còn hơn báo Terminal hỏng dựa trên một phép dò thất bại.
 */
function codexRow(doctor: Doctor | null | undefined): CheckRow {
  const codex = doctor?.codex;
  const version = ver(codex?.version);
  const mismatch = codex?.ok === true && codex.shellOk === false;
  const dir = safeHomeLabel(codex?.shellDirLabel);
  return {
    key: "codex",
    ok: codex?.ok === true,
    known: codex !== undefined,
    label: "codex CLI",
    value: mismatch ? [version, "Terminal của bạn chưa thấy"].filter(Boolean).join(" · ") : version,
    consequence: mismatch
      ? "App sinh ảnh được, nhưng lệnh `codex` bạn gõ trong Terminal sẽ báo command not found — "
        + "thư mục chứa nó chưa nằm trong PATH."
      : "Không có codex thì không sinh được ảnh AI (phần còn lại vẫn dùng được).",
    cmd: mismatch && dir ? codexPathFixCmd(dir) : INSTALL_CMD.codex,
  };
}

/**
 * Checklist từng dòng ✓/✗ (§3-S0 bảng trạng thái `CODEX_MISSING` / `PY_DEPS_MISSING`).
 * Mỗi dòng thiếu đều có LỆNH SỬA — không có dòng nào chỉ báo lỗi rồi bỏ đó.
 */
export function checkRows(doctor: Doctor | null | undefined, workspaceFree?: string): CheckRow[] {
  const py = doctor?.python;
  const deps = py?.deps ?? {};
  const ws = doctor?.workspace;

  return [
    codexRow(doctor),
    {
      key: "node",
      ok: doctor?.node?.ok === true,
      known: doctor?.node !== undefined,
      label: "Node.js",
      value: ver(doctor?.node?.version),
      consequence: "Công cụ local cần Node ≥ 20 mới chạy được.",
      cmd: INSTALL_CMD.node,
    },
    {
      key: "python",
      ok: py?.ok === true,
      known: py !== undefined,
      label: "Python 3",
      value: [ver(py?.version), py?.venv ? "môi trường riêng" : ""].filter(Boolean).join(" · "),
      consequence: "Không có Python thì không cắt được sheet thành từng file PNG.",
      cmd: INSTALL_CMD.python,
    },
    {
      key: "pillow",
      ok: deps.pillow === true,
      known: py?.deps !== undefined,
      label: "Pillow",
      value: "",
      consequence: "Thiếu Pillow: không cắt ảnh và không tạo được ảnh thu nhỏ.",
      cmd: INSTALL_CMD.pyDeps,
    },
    {
      key: "numpy",
      ok: deps.numpy === true,
      known: py?.deps !== undefined,
      label: "numpy",
      value: "",
      consequence: "Thiếu numpy: chế độ tách nền nhanh không chạy được.",
      cmd: INSTALL_CMD.pyDeps,
    },
    {
      key: "renderer",
      ok: doctor?.renderer?.ok === true,
      known: doctor?.renderer !== undefined,
      label: "Trình render khung xương",
      value: ver(doctor?.renderer?.engine) || "@resvg/resvg-wasm",
      consequence: "Thiếu — KHÔNG gen được ảnh (không còn bản dự phòng).",
      cmd: INSTALL_CMD.resvg,
    },
    {
      key: "workspace",
      ok: ws?.writable === true,
      known: ws !== undefined,
      label: "Thư mục làm việc",
      value: [safeHomeLabel(ws?.label) ?? "", workspaceFree ?? ""].filter(Boolean).join(" · "),
      consequence: "Không ghi được thì không tạo được project nào.",
    },
  ];
}
