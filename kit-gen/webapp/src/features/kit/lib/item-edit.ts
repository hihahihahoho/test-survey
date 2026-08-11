import type { Component, Contract, Sheet } from "@/lib/types";
import type { KitFile } from "@/lib/types";

export interface ItemLocation {
  sheet: Sheet;
  sheetIndex: number;
  itemIndex: number;
  item: Component;
}

export function locateItem(contract: Contract | null, file: KitFile | null): ItemLocation | null {
  if (!contract || !file?.sheet) return null;
  const sheetIndex = contract.sheets.findIndex((sheet) => sheet.id === file.sheet);
  if (sheetIndex < 0) return null;
  const sheet = contract.sheets[sheetIndex]!;
  const byIndex = typeof file.cellIndex === "number" ? file.cellIndex : -1;
  const itemIndex = byIndex >= 0 && byIndex < sheet.components.length
    ? byIndex
    : sheet.components.findIndex((item) => item.file === file.file);
  if (itemIndex < 0) return null;
  return { sheet, sheetIndex, itemIndex, item: sheet.components[itemIndex]! };
}

export function itemCount(location: ItemLocation | null): number {
  return location?.sheet.components.length ?? 0;
}

export function editItem(
  contract: Contract,
  location: ItemLocation,
  change: { spec: string; replacement?: Component; empty?: boolean },
): Contract {
  const next = structuredClone(contract);
  const current = next.sheets[location.sheetIndex]!.components[location.itemIndex]!;
  next.sheets[location.sheetIndex]!.components[location.itemIndex] = change.empty
    ? { file: "", vi: "", spec: "", skel: { shape: "empty" } }
    : change.replacement
      ? { ...structuredClone(change.replacement), spec: change.spec || change.replacement.spec }
      : { ...current, spec: change.spec };
  return next;
}
