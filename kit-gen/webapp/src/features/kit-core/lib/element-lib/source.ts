/**
 * webapp/src/features/kit-core/lib/element-lib/source.ts (đổi nhà 08/09/2026)
 * ────────────────────────────────────────────────────────────────────────────
 * HAI NGUỒN THƯ VIỆN + chuẩn hoá + lọc/tìm kiếm. Thuần logic, không React —
 * để ca test chạy được ở môi trường "node" mà không cần DOM.
 *
 * NGUỒN 1 — "Bản đang dùng": `GET /api/element-lib` (#28) qua `useElementLib()` của R0.
 *   Đây là bản mà công cụ local thật sự dùng khi sinh ảnh ⇒ mặc định chọn cái này.
 * NGUỒN 2 — "Bản chuẩn hoá": `teams/t1-chuanhoa/element-lib-v2.json`, ĐÓNG GÓI SẴN
 *   trong bundle (`../data/element-lib-v2.json`).
 *
 *   Vì sao đóng gói thay vì gọi API: agent KHÔNG có endpoint nào phục vụ file đó
 *   (đã kiểm `agent/routes/contract.mjs` — `/api/element-lib` chỉ đọc
 *   `<workspace>/engine/element-lib.json` rồi tới `<repo>/element-lib.json`, không
 *   biết tới bản v2). Đường vào Cloudflare Pages lại không có agent lúc mở trang.
 *   File 17 KB, `resolveJsonModule` đã bật sẵn ⇒ import tĩnh là đường duy nhất luôn chạy.
 *   Bản copy nằm ở `library/data/element-lib-v2.json` (thư mục tôi sở hữu; brief cấm
 *   tôi sửa `element-lib.json` gốc và tôi cũng không đụng tới `teams/t1-chuanhoa/`).
 *   Đồng bộ được khoá bằng ca test đối chiếu TỪNG BYTE với bản gốc:
 *   `library/__tests__/lib-source.test.ts`.
 */
import type { ElementLib } from "@/lib/types/api";
import { isFileNameExempt } from "@/lib/types/contract";
import rawV2 from "./element-lib-v2.json";
import {
  NO_GROUP, groupLabel, libElementStrictSchema,
  type LibElement, type LibElementView, type LibSourceId,
} from "./types";

export interface NormalizedLib {
  elements: LibElement[];
  /** element bị bỏ vì không parse được — hiện thành cảnh báo, KHÔNG im lặng nuốt. */
  skipped: { file: string; reason: string }[];
  version: string | number | null;
}

/**
 * Dữ liệu thô (agent hoặc file đóng gói) → danh sách element dùng được.
 * Một element hỏng KHÔNG được làm chết 41 element còn lại (§6.5-6).
 */
export function normalizeLib(raw: unknown): NormalizedLib {
  const container = (raw ?? {}) as { version?: unknown; elements?: unknown };
  const list = Array.isArray(container.elements) ? container.elements : [];
  const elements: LibElement[] = [];
  const skipped: { file: string; reason: string }[] = [];

  for (const item of list) {
    const parsed = libElementStrictSchema.safeParse(item);
    if (parsed.success) {
      elements.push(parsed.data);
      continue;
    }
    const file = typeof (item as { file?: unknown })?.file === "string" ? (item as { file: string }).file : "(không rõ tên)";
    const first = parsed.error.issues[0];
    skipped.push({
      file,
      reason: first ? `${first.path.join(".") || "gốc"}: ${first.message}` : "dữ liệu không hợp lệ",
    });
  }

  const version =
    typeof container.version === "string" || typeof container.version === "number" ? container.version : null;
  return { elements, skipped, version };
}

/** Bản v2 đóng gói — parse một lần rồi giữ lại (module scope = cache tự nhiên). */
let v2Cache: NormalizedLib | null = null;
export function loadBundledV2(): NormalizedLib {
  v2Cache ??= normalizeLib(rawV2);
  return v2Cache;
}

/** Bản agent trả về (đã qua `elementLibSchema` của R0) → chuẩn hoá tiếp. */
export function fromAgentLib(data: ElementLib | undefined | null): NormalizedLib {
  return normalizeLib(data ?? { elements: [] });
}

/* ═════════════ Dựng view: nhóm, "đã có trong sheet", chuỗi tìm kiếm ═════════════ */

export interface BuildViewOptions {
  /** map `file` → danh sách id sheet đang chứa nó */
  usedByFile?: ReadonlyMap<string, readonly string[]>;
}

export function buildViews(elements: readonly LibElement[], opts: BuildViewOptions = {}): LibElementView[] {
  return elements.map((e) => {
    const groupKey = typeof e.group === "string" && e.group !== "" ? e.group : NO_GROUP;
    return {
      ...e,
      groupKey,
      groupLabel: groupLabel(groupKey),
      usedIn: [...(opts.usedByFile?.get(e.file) ?? [])],
      haystack: `${e.file} ${e.vi} ${e.spec} ${groupKey} ${groupLabel(groupKey)}`.toLowerCase(),
    };
  });
}

/** Danh sách nhóm để đổ vào bộ lọc, kèm số lượng. Sắp theo nhãn tiếng Việt. */
export interface GroupOption {
  key: string;
  label: string;
  count: number;
}

export function groupOptions(views: readonly LibElementView[]): GroupOption[] {
  const counter = new Map<string, number>();
  for (const v of views) counter.set(v.groupKey, (counter.get(v.groupKey) ?? 0) + 1);
  return [...counter.entries()]
    .map(([key, count]) => ({ key, label: groupLabel(key), count }))
    .sort((a, b) => {
      // "Không thuộc nhóm" luôn xuống cuối — nó là rổ còn lại, không phải một nhóm thật.
      if (a.key === NO_GROUP) return 1;
      if (b.key === NO_GROUP) return -1;
      return a.label.localeCompare(b.label, "vi");
    });
}

export interface FilterInput {
  query: string;
  /** `"all"` hoặc `groupKey` */
  group: string;
}

/**
 * Tìm kiếm + lọc nhóm (đóng issue audit "42 ô không tìm kiếm được").
 * Bỏ dấu tiếng Việt cả hai phía: gõ "nut do" phải ra "Nút đỏ (CTA)".
 */
export function filterViews(views: readonly LibElementView[], input: FilterInput): LibElementView[] {
  const q = foldVi(input.query.trim());
  return views.filter((v) => {
    if (input.group !== "all" && v.groupKey !== input.group) return false;
    if (q === "") return true;
    return foldVi(v.haystack).includes(q);
  });
}

/** Bỏ dấu + thường hoá. Cùng cách bỏ dấu với `slugify()` của R0 (NFD + đ→d). */
export function foldVi(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** map `file` → sheet nào đang dùng, dựng từ tóm tắt sheet mà màn cha truyền vào. */
export function usedByFileMap(sheets: readonly { id: string; files: readonly string[] }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const sh of sheets) {
    for (const f of sh.files) {
      const cur = m.get(f);
      if (cur) cur.push(sh.id);
      else m.set(f, [sh.id]);
    }
  }
  return m;
}

/**
 * Tên file KHÔNG hợp lệ theo V-01 sẽ bị chặn khi lưu. Thư viện chuẩn thì không dính,
 * nhưng thư viện do người dùng thay ở `<workspace>/engine/element-lib.json` thì có thể —
 * cảnh báo TRƯỚC khi thêm còn hơn để họ ăn lỗi 422 lúc lưu.
 */
export function invalidFileName(e: LibElement): boolean {
  if (isFileNameExempt(e.skel?.shape)) return false;
  return !/^[0-9]{2}-[a-z0-9-]+$/.test(e.file);
}

/** Nguồn nào đang dùng được → dựng segmented control. */
export function sourceAvailability(agent: NormalizedLib | null): Record<LibSourceId, boolean> {
  return { agent: (agent?.elements.length ?? 0) > 0, v2: loadBundledV2().elements.length > 0 };
}
