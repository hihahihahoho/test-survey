import type { Contract } from "@/lib/types/contract";
import type { KitFile } from "@/lib/types";

export type ResultGroupKind = "background" | "interface" | "character" | "other";
export interface ResultGroup { id: string; label: string; kind: ResultGroupKind; files: KitFile[] }

function kindOf(id: string): ResultGroupKind {
  const key = id.toLowerCase();
  if (key.startsWith("bg") || key.includes("background")) return "background";
  if (key.startsWith("pose") || key.includes("character")) return "character";
  if (key === "main" || key.includes("ui") || key.includes("canvas")) return "interface";
  return "other";
}

const LABEL: Record<ResultGroupKind, string> = {
  background: "Màn nền",
  interface: "Giao diện",
  character: "Tư thế nhân vật",
  other: "Món khác",
};

export function groupResults(files: readonly KitFile[]): ResultGroup[] {
  const groups = new Map<string, KitFile[]>();
  for (const file of files) {
    const id = file.sheet?.trim() || "other";
    groups.set(id, [...(groups.get(id) ?? []), file]);
  }
  return [...groups].map(([id, items]) => {
    const kind = kindOf(id);
    const suffix = kind === "background" ? "" : ` · ${items.length} ${kind === "character" ? "ảnh" : "món"}`;
    return { id, kind, label: `${LABEL[kind]}${suffix}`, files: items };
  }).sort((a, b) => ["background", "interface", "character", "other"].indexOf(a.kind) - ["background", "interface", "character", "other"].indexOf(b.kind));
}

export function redrawJobs(contract: Contract | null, variantId: string | null): string[] {
  if (!contract || !variantId) return [];
  return contract.sheets.map((sheet) => `${variantId}-${sheet.id}`);
}
