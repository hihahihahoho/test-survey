/**
 * features/design/lib/useDesignActions.ts — mọi HÀNH ĐỘNG của S3, gói thành một object.
 *
 * Vì sao tách khỏi màn: `DesignScreen.tsx` chỉ nên đọc như một bản mô tả bố cục. Toàn
 * bộ "bấm nút này thì contract biến đổi thế nào, có phải hỏi lại không" nằm ở đây, cạnh
 * `ops.ts` — nơi có test.
 *
 * LUẬT THAO TÁC PHÁ HUỶ (§5.5 + chốt X6): xoá SHEET / PHONG CÁCH / NHÂN VẬT phải qua
 * modal nói rõ hậu quả. Xoá 1 ELEMENT thì KHÔNG modal — nó chỉ biến ô thành ô trống,
 * hoàn tác được bằng ⌘Z ngay lập tức, và mỗi lần xoá một ô lại chặn một modal thì
 * dọn sheet 16 ô thành cực hình. Ma sát phải đúng với hậu quả.
 */
import * as React from "react";
import { slugify, type Component, type Sheet } from "@/lib/types/contract";
import type { DesignApi } from "../contracts";
import * as ops from "./ops";
import * as style from "./ops-style";
import type { Finding } from "./validate";

export interface ConfirmRequest {
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  onConfirm: () => void;
}

export interface DesignActions {
  /* sheet */
  addSheet: (kind: "blank" | "library" | "bg" | "pose") => void;
  renameSheet: (sheetId: string, newId: string) => void;
  patchSheet: (sheetId: string, patch: Record<string, unknown>, label?: string) => void;
  setSheetVariants: (sheetId: string, ids: string[]) => void;
  duplicateSheet: (sheetId: string) => void;
  deleteSheet: (sheetId: string) => void;
  moveSheet: (sheetId: string, delta: number) => void;
  resizeGrid: (sheetId: string, cols: number, rows: number, overflow: ops.OverflowMode) => void;
  /* element */
  patchCell: (sheetId: string, index: number, patch: Record<string, unknown>, label?: string) => void;
  deleteCell: (sheetId: string, index: number) => void;
  moveCell: (sheetId: string, from: number, to: number) => void;
  addElements: (sheetId: string, items: readonly Partial<Component>[], opts?: { toNewSheet?: boolean }) => void;
  resetCellToLib: (sheetId: string, index: number, lib: { spec?: string; skel?: Record<string, unknown> }) => void;
  /* phong cách & nhân vật */
  addVariant: () => void;
  patchVariant: (id: string, patch: Record<string, unknown>, label?: string) => void;
  renameVariantId: (oldId: string, newId: string) => void;
  patchBrand: (id: string, patch: Record<string, unknown>, label?: string) => void;
  duplicateVariant: (id: string) => void;
  deleteVariant: (id: string) => void;
  addCharacter: () => void;
  patchCharacter: (variantId: string, characterId: string, patch: Record<string, unknown>, label?: string) => void;
  togglePose: (variantId: string, characterId: string, pose: string) => void;
  deleteCharacter: (variantId: string, characterId: string) => void;
  /* nâng cao */
  patchSlice: (patch: { threshold?: number; grow_threshold?: number; bleed?: number; quality?: "fast" | "high" }) => void;
  /* thanh validate */
  quickFix: (f: Finding) => void;
}

export function useDesignActions(
  api: DesignApi,
  ask: (req: ConfirmRequest) => void,
  openResize: (sheetId: string) => void,
  openLibrary: () => void,
): DesignActions {
  const c = api.contract;
  const guard = <T extends unknown[]>(fn: (...a: T) => void) => (...a: T) => {
    if (api.readOnly || !api.contract) return;
    fn(...a);
  };

  return React.useMemo<DesignActions>(() => {
    const draft = () => api.contract!;

    const acts: DesignActions = {
      addSheet: guard((kind) => {
        if (kind === "library") {
          openLibrary();
          return;
        }
        if (kind === "bg") {
          api.apply(ops.addSheet(draft(), { id: "bg", cols: 1, rows: 1, orient: "portrait" }));
          return;
        }
        if (kind === "pose") {
          // 8 dáng là bố cục hay dùng nhất cho sheet dáng (4×2, khớp styles.json thật).
          const r = ops.addSheet(draft(), { id: "pose", cols: 4, rows: 2 });
          api.apply(r);
          return;
        }
        const r = ops.addSheet(draft(), { id: "sheet", cols: 4, rows: 4 });
        api.apply(r);
        // Mở luôn dialog đổi lưới: "sheet trống (chọn lưới)" của §3.2 hứa cho chọn lưới.
        const id = r.focus?.kind === "sheet" ? r.focus.sheetId : null;
        if (id) setTimeout(() => openResize(id), 0);
      }),

      renameSheet: guard((sheetId, newId) => api.apply(ops.renameSheet(draft(), sheetId, newId))),
      patchSheet: guard((sheetId, patch, label) => api.apply(ops.patchSheet(draft(), sheetId, patch as Partial<Sheet>, label))),
      setSheetVariants: guard((sheetId, ids) => api.apply(ops.setSheetVariants(draft(), sheetId, ids))),
      duplicateSheet: guard((sheetId) => api.apply(ops.duplicateSheet(draft(), sheetId))),
      moveSheet: guard((sheetId, delta) => api.apply(ops.moveSheet(draft(), sheetId, delta))),

      deleteSheet: guard((sheetId) => {
        const sh = ops.findSheet(draft(), sheetId);
        if (!sh) return;
        const n = ops.realCount(sh);
        const jobs = ops.jobCountOfSheet(draft(), sh);
        ask({
          title: `Xoá sheet «${sheetId}»?`,
          description: (
            <>
              Xoá <strong>{n} element</strong> trong sheet này
              {jobs > 0 ? ` và ${jobs} lượt sinh ảnh của nó` : ""}. Ảnh đã sinh trước đó vẫn nằm trên đĩa nhưng thành
              mồ côi. Hoàn tác được bằng ⌘Z khi chưa lưu.
            </>
          ),
          actionLabel: "Xoá sheet",
          onConfirm: () => api.apply(ops.removeSheet(draft(), sheetId)),
        });
      }),

      resizeGrid: guard((sheetId, cols, rows, overflow) =>
        api.apply(ops.resizeGrid(draft(), sheetId, cols, rows, { overflow })),
      ),

      patchCell: guard((sheetId, index, patch, label) =>
        api.apply(ops.patchCell(draft(), sheetId, index, patch as Partial<Component>, label)),
      ),
      // Không modal: chỉ biến ô thành trống, ⌘Z là đủ (ma sát đúng với hậu quả).
      deleteCell: guard((sheetId, index) => api.apply(ops.clearCell(draft(), sheetId, index))),
      moveCell: guard((sheetId, from, to) => api.apply(ops.swapCells(draft(), sheetId, from, to))),

      addElements: guard((sheetId, items, opts) => {
        if (opts?.toNewSheet || !sheetId) {
          const created = ops.addSheet(draft(), {
            id: "sheet",
            cols: 4,
            rows: Math.max(1, Math.ceil(items.length / 4)),
          });
          const newId = created.focus?.kind === "sheet" ? created.focus.sheetId : null;
          if (!newId) return;
          const filled = ops.addElements(created.contract, newId, items);
          api.apply({
            contract: filled.contract,
            label: `Thêm ${items.length} element vào sheet mới «${newId}»`,
            ...(filled.focus ? { focus: filled.focus } : {}),
          });
          return;
        }
        api.apply(ops.addElements(draft(), sheetId, items));
      }),

      resetCellToLib: guard((sheetId, index, lib) =>
        api.apply(
          ops.patchCell(
            draft(),
            sheetId,
            index,
            { spec: lib.spec ?? "", skel: (lib.skel ?? {}) as Component["skel"] },
            `Trả element ô ${index + 1} về bản gốc trong thư viện`,
          ),
        ),
      ),

      addVariant: guard(() => api.apply(style.addVariant(draft()))),
      patchVariant: guard((id, patch, label) => api.apply(style.patchVariant(draft(), id, patch, label))),
      renameVariantId: guard((oldId, newId) => api.apply(style.renameVariantId(draft(), oldId, newId))),
      patchBrand: guard((id, patch, label) => api.apply(style.patchBrand(draft(), id, patch, label))),
      duplicateVariant: guard((id) => api.apply(style.duplicateVariant(draft(), id))),

      deleteVariant: guard((id) => {
        const v = style.findVariant(draft(), id);
        if (!v) return;
        const jobs = ops.jobCountOfVariant(draft(), id);
        ask({
          title: `Xoá phong cách «${v.vi || id}»?`,
          description: (
            <>
              {jobs} ảnh đã sinh và các file đã cắt của phong cách này sẽ thành <strong>mồ côi</strong> — chúng không
              bị xoá khỏi đĩa, nhưng không còn thiết kế nào dùng tới. Sheet đang chỉ áp cho phong cách này sẽ chuyển
              sang áp cho mọi phong cách.
            </>
          ),
          actionLabel: "Xoá phong cách",
          onConfirm: () => api.apply(style.removeVariant(draft(), id)),
        });
      }),

      addCharacter: guard(() => {
        const first = (draft().variants ?? draft().styles ?? [])[0];
        if (!first) return;
        api.apply(style.addCharacter(draft(), first.id));
      }),
      patchCharacter: guard((variantId, characterId, patch, label) =>
        api.apply(style.patchCharacter(draft(), variantId, characterId, patch, label)),
      ),
      togglePose: guard((variantId, characterId, pose) =>
        api.apply(style.toggleCharacterPose(draft(), variantId, characterId, pose)),
      ),
      deleteCharacter: guard((variantId, characterId) => {
        ask({
          title: `Xoá nhân vật «${characterId}»?`,
          description: "Bộ dáng của nhân vật này cũng mất theo. Sheet dáng đang dùng nhân vật sẽ không sinh đúng nữa.",
          actionLabel: "Xoá nhân vật",
          onConfirm: () => api.apply(style.removeCharacter(draft(), variantId, characterId)),
        });
      }),

      patchSlice: guard((patch) => api.apply(style.patchSliceParams(draft(), patch))),

      quickFix: guard((f) => {
        const t = f.target;
        if (f.fix?.kind === "slug-sheet" && t.kind === "sheet") {
          api.apply(ops.renameSheet(draft(), t.sheetId, ops.uniqueId(slugify(t.sheetId), draft().sheets.map((s) => s.id))));
          return;
        }
        if (f.fix?.kind === "slug-file" && t.kind === "element") {
          const sh = ops.findSheet(draft(), t.sheetId);
          const comp = sh?.components[t.index];
          if (!comp) return;
          const base = slugify(comp.vi || comp.file || "element") || "element";
          api.apply(
            ops.patchCell(
              draft(),
              t.sheetId,
              t.index,
              { file: `${String(t.index + 1).padStart(2, "0")}-${base}` },
              `Sửa tên file ô ${t.index + 1}`,
            ),
          );
          return;
        }
        if ((f.fix?.kind === "add-cells" || f.fix?.kind === "trim-cells") && t.kind === "sheet") {
          const sh = ops.findSheet(draft(), t.sheetId);
          if (!sh) return;
          // Bù/cắt cho khớp lưới hiện tại — KHÔNG đổi cols/rows (user không yêu cầu).
          api.apply(ops.resizeGrid(draft(), t.sheetId, sh.grid.cols, sh.grid.rows, { overflow: "drop" }));
        }
      }),
    };
    return acts;
    // `c` nằm trong deps để mọi closure luôn thấy contract mới nhất.
  }, [api, ask, openLibrary, openResize, c]);
}
