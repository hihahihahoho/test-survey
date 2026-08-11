/**
 * features/gen/lib/pack-model.ts — MÔ HÌNH của lớp phủ «Đóng gói» (UX-V3 §4.2, BA-V3 §3.4).
 *
 * «Đóng gói» **không tạo dữ liệu mới** — nó là **lọc + chuyển màn** (BA-V3 §3.4). Vì thế
 * module này chỉ biết ba việc: (a) trên bàn có gì tick được, (b) tick xong thì tổng là bao
 * nhiêu, (c) câu cảnh báo nào phải hiện **trước** khi chuyển màn.
 *
 * THUẦN HÀM: không React, không DOM, không mạng, **không import `lib/api/**`**.
 *
 * ⚠️ BA-V3 §3.4 + C-01: **FE tuyệt đối không tự huỷ lượt vẽ đang chạy.** Module này không
 * có, và không được có, bất kỳ khái niệm "cancel" nào. Có test khẳng định điều đó.
 */
import type { CanvasDoc, CanvasNode } from "@/features/docs/lib";
import { GEN_KIND_SPEC, isGenKind, type GenKind } from "./gen-kinds";

/** Lý do một thứ trên bàn KHÔNG đóng gói được. Chữ chốt của UX-V3 §4.2. */
export const PACK_NOTE_LOCKED = "Ghi chú chỉ để trên bàn, không vào bộ kit.";

/** Câu cảnh báo khi đang có lượt vẽ chạy (UX-V3 §4.2 / BA-V3 §3.4) — dán nguyên văn. */
export const PACK_WHILE_RUNNING =
  "Có 1 tấm đang vẽ. Tấm đó vẫn chạy tiếp; sửa lúc này sẽ khiến kết quả bị đánh dấu «cần vẽ lại».";

export interface PackItem {
  id: string;
  /** Chữ trên ô tick: «ảnh nền», «tư thế nhân vật», «ghi chú», «nhóm 6 món»… */
  label: string;
  /** `null` = không suy được lệnh nào đã sinh ra nó (thứ user tự kéo vào). */
  kind: GenKind | null;
  /**
   * Số món thứ này sẽ mang vào bộ kit.
   *
   * 🚩 NÓI THẬT: object do hộp GEN mock sinh ra **chưa được vẽ**, nên chưa ai biết nó ra
   * bao nhiêu món — ở đây tính **1**. Con số thật chỉ có sau khi máy vẽ và tách nền
   * (`#42`). Khi nối thật, chỗ này đọc số thật thay vì mặc định 1.
   */
  componentCount: number;
  /** Đã có ảnh thật chưa. Mock ⇒ luôn `false`, và lớp phủ phải nói ra. */
  drawn: boolean;
  /** Tick được không. `false` ⇒ hiện `lockedReason` cho cả mắt lẫn trình đọc màn hình. */
  selectable: boolean;
  lockedReason: string;
}

/** Ghi chú (`note`) không vào bộ kit được — luật cứng của §4.2. */
export function isPackable(node: CanvasNode): boolean {
  return node.type !== "note";
}

/** Suy lệnh gen đã sinh ra node từ id `mock-<kind>-<n>`. Không suy được ⇒ `null`. */
export function kindOfNode(node: CanvasNode): GenKind | null {
  const m = /^mock-([a-z]+)-\d+$/.exec(node.id);
  const raw = m?.[1];
  return isGenKind(raw) ? raw : null;
}

function labelOf(node: CanvasNode, kind: GenKind | null): string {
  if (node.type === "note") return "ghi chú";
  if (kind) return GEN_KIND_SPEC[kind].label.toLowerCase();
  return "thứ trên bàn";
}

/** Danh sách thứ trên bàn, đã kèm lý do khoá. Giữ NGUYÊN thứ tự node của bản canvas. */
export function packItems(canvas: CanvasDoc | null | undefined): PackItem[] {
  const nodes = canvas?.nodes ?? [];
  return nodes.map((n) => {
    const kind = kindOfNode(n);
    const packable = isPackable(n);
    return {
      id: n.id,
      label: labelOf(n, kind),
      kind,
      // TODO(wave nối thật · NEEDS-fe3-c N10): đọc số món thật từ `#42` sau khi tách nền.
      componentCount: 1,
      // `bind` khác null nghĩa là node đã nối với sản phẩm thật trong dự án.
      drawn: Boolean(n.bind),
      selectable: packable,
      lockedReason: packable ? "" : PACK_NOTE_LOCKED,
    };
  });
}

export interface PackSummary {
  /** Số thứ đã tick. */
  groups: number;
  /** Tổng số món sẽ vào bộ kit. */
  components: number;
  /** Số thứ đã tick nhưng CHƯA được vẽ ⇒ đóng gói sẽ phải vẽ trước. */
  undrawn: number;
  /** «Đã chọn 3 nhóm · 23 món» — chuỗi chốt §4.2. Chưa chọn gì ⇒ chuỗi rỗng. */
  line: string;
  /** «ⓘ 2 thứ chưa được vẽ. Đóng gói sẽ vẽ trước · ~2 lượt.» Rỗng = không cần cảnh báo. */
  undrawnNote: string;
  /** Bấm được nút «Đóng thành bộ kit» chưa. */
  canPack: boolean;
}

/**
 * Tổng của phần đã tick. `selected` là tập id — id lạ (node vừa bị xoá) bị **bỏ qua im
 * lặng** thay vì ném: lớp phủ mở lâu, bàn đổi bên dưới là chuyện bình thường.
 */
export function packSummary(items: readonly PackItem[], selected: ReadonlySet<string>): PackSummary {
  const picked = items.filter((i) => i.selectable && selected.has(i.id));
  const groups = picked.length;
  const components = picked.reduce((s, i) => s + i.componentCount, 0);
  const undrawn = picked.filter((i) => !i.drawn).length;
  return {
    groups,
    components,
    undrawn,
    line: groups === 0 ? "" : `Đã chọn ${groups} nhóm · ${components} món`,
    undrawnNote:
      undrawn === 0
        ? ""
        : `${undrawn} thứ đang chọn chưa được vẽ. Đóng gói sẽ vẽ trước · ~${undrawn} lượt.`,
    canPack: groups > 0,
  };
}

/** Bật/tắt một id. Trả `Set` MỚI (không sửa tại chỗ) để React thấy được thay đổi. */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Chọn tất cả thứ tick được (bỏ qua ghi chú). */
export function selectAllPackable(items: readonly PackItem[]): Set<string> {
  return new Set(items.filter((i) => i.selectable).map((i) => i.id));
}
