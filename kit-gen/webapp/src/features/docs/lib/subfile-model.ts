/**
 * features/docs/lib/subfile-model.ts — READ MODEL của thanh tab file con.
 *
 * TẦNG NÀY THUẦN HÀM, KHÔNG REACT, KHÔNG DOM, KHÔNG GỌI REPO. Lý do: mọi luật khó
 * (thứ tự tab, tab tràn, «không sheet tàng hình», phím tắt) đều kiểm được bằng test
 * node — không phải dựng jsdom mới biết mình đúng.
 *
 * NGUỒN: UI-SPEC-V2 §4.2 (file con là VIEW) · §4.3 (thanh tab kiểu Figma, quá 8 tab
 * thu gọn, «Tất cả N», phím tắt) · §4.5 (bất biến sheet không tàng hình).
 *
 * BA QUYẾT ĐỊNH, mỗi cái có lý do:
 *
 * 1. **Tab ảo «Tất cả sheet» LUÔN đứng đầu và không bao giờ bị đẩy vào phần tràn.**
 *    Nó là bảo hiểm của bất biến §4.5: kể cả khi mọi file con đều lọc hẹp, vẫn còn
 *    đúng một chỗ nhìn thấy toàn bộ sheet. Bảo hiểm mà giấu trong menu `»` thì hết là
 *    bảo hiểm. Hệ quả: khi project chưa có file con nào, thanh tab vẫn có đúng 1 tab
 *    dùng được ⇒ **không có màn trắng ở ca empty**.
 *
 * 2. **Tab đang mở LUÔN nhìn thấy được.** Nếu nó rơi vào phần tràn thì nó chiếm chỗ
 *    tab cuối cùng của phần hiện. Người dùng không bao giờ phải mở menu để biết mình
 *    đang đứng ở đâu (đúng tiêu chí FE2-PLAN §3-C1: ">8 tab thu gọn mà active tab vẫn thấy").
 *
 * 3. **Không lọc theo `trashedAt` ở đây bằng cách đoán** — `docsRepo.list()` mặc định
 *    đã bỏ file trong thùng rác. Ta vẫn lọc lần hai (rẻ) để nếu chỗ gọi lỡ truyền
 *    `includeTrashed: true` thì thanh tab không tự mọc file đã xoá.
 */
import {
  ALL_SHEETS_DOC_ID,
  isVirtualDoc,
  virtualAllSheetsDoc,
  type Doc,
  type DocColor,
  type DocKind,
} from "./index";

/** Quá ngần này tab thì tab cũ nhất thu vào menu `»` (§4.3). */
export const MAX_VISIBLE_TABS = 8;

export interface TabItem {
  id: string;
  name: string;
  kind: DocKind;
  color: DocColor;
  /** file hệ thống «Tất cả sheet»: không đổi tên, không xoá, không nhân bản. */
  virtual: boolean;
  /** có thay đổi chưa lưu ⇒ chấm `●` trên tab (§4.3). */
  dirty: boolean;
  /** số sheet đang thấy trong file này — dùng cho popover, không vẽ lên tab. */
  sheetCount: number;
  /** id sheet của file nhưng không còn trong contract ⇒ nhãn «mất liên kết» (§4.5). */
  staleCount: number;
  updatedAt: string;
}

export interface BuildTabsInput {
  docs: readonly Doc[];
  /** id sheet HIỆN CÓ trong contract. Agent chưa chạy ⇒ mảng rỗng, KHÔNG phải lỗi. */
  contractSheetIds: readonly string[];
  /** id các file đang có thay đổi chưa lưu (canvas shell / trình soạn báo lên). */
  dirtyIds?: readonly string[];
  /** dùng cho `createdAt/updatedAt` của tab ảo; truyền vào để test tất định. */
  now?: string;
}

/** Danh sách tab = [tab ảo «Tất cả sheet»] + file con chưa xoá, giữ nguyên thứ tự repo. */
export function buildTabs(input: BuildTabsInput): TabItem[] {
  const { docs, contractSheetIds, dirtyIds = [], now = "" } = input;
  const known = new Set(contractSheetIds);
  const dirty = new Set(dirtyIds);

  const toItem = (d: Doc): TabItem => {
    const ids = d.view?.sheetIds ?? [];
    const virtual = isVirtualDoc(d.id);
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      color: d.color,
      virtual,
      dirty: dirty.has(d.id) && !virtual,
      sheetCount: virtual ? contractSheetIds.length : ids.filter((id) => known.has(id)).length,
      staleCount: virtual ? 0 : ids.filter((id) => !known.has(id)).length,
      updatedAt: d.updatedAt,
    };
  };

  const real = docs
    .filter((d) => !d.trashedAt && !isVirtualDoc(d.id))
    .map(toItem);

  return [toItem(virtualAllSheetsDoc(contractSheetIds, now)), ...real];
}

/** Có file con do người dùng tạo không (tab ảo không tính) ⇒ quyết định copy ca empty. */
export function hasUserDocs(tabs: readonly TabItem[]): boolean {
  return tabs.some((t) => !t.virtual);
}

/** Id tab an toàn khi id yêu cầu không tồn tại (bị xoá / deep link sai) — không bao giờ `undefined`. */
export function resolveActiveId(tabs: readonly TabItem[], wanted: string | null | undefined): string {
  if (wanted && tabs.some((t) => t.id === wanted)) return wanted;
  return tabs[0]?.id ?? ALL_SHEETS_DOC_ID;
}

export interface SplitTabs {
  visible: TabItem[];
  overflow: TabItem[];
}

/**
 * Cắt danh sách tab thành phần HIỆN và phần TRÀN (menu `»`).
 * Bất biến (có test): tab ảo luôn ở `visible[0]`; tab đang mở luôn thuộc `visible`;
 * `visible ∪ overflow` = đúng tập ban đầu, không mất, không nhân đôi.
 */
export function splitTabs(
  tabs: readonly TabItem[],
  activeId: string,
  max: number = MAX_VISIBLE_TABS,
): SplitTabs {
  if (tabs.length <= max) return { visible: [...tabs], overflow: [] };

  const visible = tabs.slice(0, max);
  const overflow = tabs.slice(max);
  const idx = overflow.findIndex((t) => t.id === activeId);
  if (idx >= 0) {
    // Đổi chỗ: tab đang mở chiếm slot cuối của phần hiện, tab bị đẩy ra nằm đầu phần tràn.
    const pushed = visible[visible.length - 1]!;
    visible[visible.length - 1] = overflow[idx]!;
    overflow.splice(idx, 1);
    overflow.unshift(pushed);
  }
  return { visible, overflow };
}

/* ═════════ Popover «Tất cả N» — tìm kiếm + sắp xếp ═════════ */

export const DOC_SORTS = ["recent", "name", "kind"] as const;
export type DocSort = (typeof DOC_SORTS)[number];

export const DOC_SORT_LABEL: Record<DocSort, string> = {
  recent: "Sửa gần nhất",
  name: "Tên A→Z",
  kind: "Theo kiểu file",
};

/** Bỏ dấu tiếng Việt để gõ "y tuong" vẫn tìm ra "Ý tưởng Tết". */
export function foldVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/**
 * Lọc + sắp cho danh sách file. Tab ảo KHÔNG bị loại khỏi kết quả khi ô tìm rỗng
 * (nó là đường an toàn), nhưng có gõ tìm thì nó cũng phải khớp như mọi mục khác.
 */
export function queryTabs(
  tabs: readonly TabItem[],
  opts: { q?: string; sort?: DocSort } = {},
): TabItem[] {
  const q = foldVi(opts.q ?? "");
  const sort = opts.sort ?? "recent";
  const out = tabs.filter((t) => (q ? foldVi(t.name).includes(q) : true));
  const byName = (a: TabItem, b: TabItem) => a.name.localeCompare(b.name, "vi");
  out.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? -1 : 1; // tab ảo luôn đứng đầu
    if (sort === "name") return byName(a, b);
    if (sort === "kind") return a.kind === b.kind ? byName(a, b) : a.kind.localeCompare(b.kind);
    return b.updatedAt.localeCompare(a.updatedAt) || byName(a, b);
  });
  return out;
}

/* ═════════ Phím tắt (§4.3) ═════════ */

export type TabShortcut =
  | { type: "next" }
  | { type: "prev" }
  | { type: "index"; index: number }
  | { type: "new" };

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Ánh xạ tổ hợp phím → hành động. Trả `null` nếu không phải chord của ta —
 * chỗ gọi CHỈ được `preventDefault()` khi hàm này trả khác `null`, để không
 * nuốt phím của trình duyệt/hệ điều hành (rủi ro FE2-PLAN §6).
 *
 * `mod` = ⌘ trên macOS, Ctrl nơi khác. `⌃Tab` thì DÙNG Ctrl ở CẢ HAI hệ —
 * trên macOS ⌘Tab là chuyển ứng dụng của hệ điều hành, không bắt được.
 */
export function matchTabShortcut(e: KeyLike, isMac: boolean): TabShortcut | null {
  const mod = isMac ? e.metaKey === true : e.ctrlKey === true;

  if (e.key === "Tab" && e.ctrlKey === true && !e.altKey) {
    return e.shiftKey ? { type: "prev" } : { type: "next" };
  }
  if (mod && e.altKey && (e.key === "n" || e.key === "N")) return { type: "new" };
  if (mod && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
    return { type: "index", index: Number(e.key) - 1 };
  }
  return null;
}

/** Đang gõ trong ô nhập/vùng sửa được ⇒ KHÔNG bắt phím tắt (tiêu chí D1/C1). */
export function isTypingTarget(el: unknown): boolean {
  const node = el as { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null;
  if (!node || typeof node.tagName !== "string") return false;
  if (node.isContentEditable === true) return true;
  const tag = node.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return node.getAttribute?.("role") === "textbox";
}

/** Chỉ số tab kế tiếp/trước, có vòng lại đầu — dùng cho cả `⌃Tab` lẫn mũi tên ←/→. */
export function stepIndex(len: number, current: number, delta: number): number {
  if (len <= 0) return 0;
  return (current + delta + len) % len;
}
