import { MousePointerSquareDashed } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/common";
import { contractVariants, type Character, type Contract, type Variant } from "@/lib/types/contract";
import type { Selection } from "@/lib/store";
import { findSheet } from "../lib/ops";
import type { ValidationResult } from "../lib/validate";
import { ElementProps } from "./ElementProps";
import { SheetProps } from "./SheetProps";
import { CharacterProps } from "./CharacterProps";

/**
 * VÙNG ③ — chọn 1 trong 4 dạng panel theo thứ đang chọn (§3-S3.4).
 * Dạng "Phong cách" nằm ở tab riêng nên ở đây chỉ dẫn user sang đó, không dựng lại.
 */
export interface PropsPanelProps {
  contract: Contract;
  selection: Selection;
  validation: ValidationResult;
  readOnly: boolean;
  readOnlyReason: string;
  extraShapes: readonly string[];
  libIndex: Map<string, { spec?: string; skel?: Record<string, unknown> }>;
  refUrlFor: (name: string | undefined) => string | null;
  handlers: {
    patchCell: (sheetId: string, index: number, patch: Record<string, unknown>, label?: string) => void;
    deleteCell: (sheetId: string, index: number) => void;
    resetCellToLib: (sheetId: string, index: number) => void;
    patchSheet: (sheetId: string, patch: Record<string, unknown>, label?: string) => void;
    renameSheet: (sheetId: string, newId: string) => void;
    setSheetVariants: (sheetId: string, ids: string[]) => void;
    resizeSheet: (sheetId: string) => void;
    deleteSheet: (sheetId: string) => void;
    genSheet: (sheetId: string) => void;
    sliceSheet: (sheetId: string) => void;
    patchCharacter: (variantId: string, characterId: string, patch: Partial<Character>, label?: string) => void;
    togglePose: (variantId: string, characterId: string, pose: string) => void;
    pickCharacterRef: (variantId: string, characterId: string) => void;
    deleteCharacter: (variantId: string, characterId: string) => void;
    goStyles: (variantId: string) => void;
  };
}

export function PropsPanel(props: PropsPanelProps) {
  const { contract, selection, validation, readOnly, readOnlyReason, handlers } = props;

  const body = (() => {
    if (selection.kind === "component") {
      const sheet = findSheet(contract, selection.sheetId);
      const comp = sheet?.components[selection.index];
      if (!sheet || !comp) return null;
      return (
        <ElementProps
          sheet={sheet}
          index={selection.index}
          comp={comp}
          validation={validation}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          extraShapes={props.extraShapes}
          libEntry={props.libIndex.get(comp.file) ?? null}
          onPatch={(patch, label) => handlers.patchCell(sheet.id, selection.index, patch as Record<string, unknown>, label)}
          onDelete={() => handlers.deleteCell(sheet.id, selection.index)}
          onResetToLib={
            props.libIndex.has(comp.file) ? () => handlers.resetCellToLib(sheet.id, selection.index) : undefined
          }
        />
      );
    }

    if (selection.kind === "sheet") {
      const sheet = findSheet(contract, selection.sheetId);
      if (!sheet) return null;
      return (
        <SheetProps
          contract={contract}
          sheet={sheet}
          validation={validation}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          onPatch={(patch, label) => handlers.patchSheet(sheet.id, patch as Record<string, unknown>, label)}
          onRename={(id) => handlers.renameSheet(sheet.id, id)}
          onSetVariants={(ids) => handlers.setSheetVariants(sheet.id, ids)}
          onResize={() => handlers.resizeSheet(sheet.id)}
          onDelete={() => handlers.deleteSheet(sheet.id)}
          onGenSheet={() => handlers.genSheet(sheet.id)}
          onSliceSheet={() => handlers.sliceSheet(sheet.id)}
        />
      );
    }

    if (selection.kind === "character") {
      const found = findCharacter(contract, selection.characterId);
      if (!found) return null;
      return (
        <CharacterProps
          variant={found.variant}
          character={found.character}
          validation={validation}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          refUrl={props.refUrlFor(found.character.ref ?? undefined)}
          onPatch={(patch, label) => handlers.patchCharacter(found.variant.id, found.character.id, patch, label)}
          onTogglePose={(pose) => handlers.togglePose(found.variant.id, found.character.id, pose)}
          onPickRef={() => handlers.pickCharacterRef(found.variant.id, found.character.id)}
          onDelete={() => handlers.deleteCharacter(found.variant.id, found.character.id)}
        />
      );
    }

    if (selection.kind === "variant") {
      return (
        <EmptyState
          icon={MousePointerSquareDashed}
          title="Phong cách sửa ở tab riêng"
          description="Art style, màu brand và nhân vật nằm trong tab «Phong cách»."
          action={
            <button
              type="button"
              className="text-accent-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              onClick={() => handlers.goStyles(selection.variantId)}
            >
              Mở tab Phong cách
            </button>
          }
        />
      );
    }

    return null;
  })();

  return (
    <ScrollArea className="h-full">
      <aside aria-label="Thuộc tính" className="flex flex-col gap-4 p-4">
        {body ?? (
          <EmptyState
            icon={MousePointerSquareDashed}
            title="Chưa chọn gì"
            description="Chọn một ô trong lưới hoặc một sheet ở cây bên trái để sửa thuộc tính."
            className="px-4 py-8"
          />
        )}
      </aside>
    </ScrollArea>
  );
}

/** Nhân vật nằm trong `variant.characters[]` — tìm cả hai để panel biết mình thuộc phong cách nào. */
export function findCharacter(
  contract: Contract,
  characterId: string,
): { variant: Variant; character: Character } | null {
  for (const v of contractVariants(contract)) {
    const ch = (v.characters ?? []).find((c) => c.id === characterId);
    if (ch) return { variant: v, character: ch };
  }
  return null;
}
