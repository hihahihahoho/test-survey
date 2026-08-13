import type { LibElement } from "@/features/design/library/lib/types";
import { CHROMA_PRESETS, contractVariants, type Contract } from "@/lib/types/contract";
import { newMascotId, type WorkflowMascot, type WorkflowState } from "./model";

function fileName(path: string | null | undefined): string {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

function cellOf(hint: string | undefined, shape: string): string {
  if (shape === "full") return "full";
  return hint?.includes("portrait") ? "portrait" : "landscape";
}

/** Giữ nguyên các component của contract nhập khi chuyển sang trình quản lý mới. */
export function importedElementsOf(contract: Contract | null | undefined): LibElement[] {
  if (!contract) return [];
  const out: LibElement[] = [];
  const seen = new Set<string>();
  for (const sheet of contract.sheets) {
    for (const component of sheet.components) {
      if (component.skel.shape === "empty" || component.skel.shape === "pose" || seen.has(component.file)) continue;
      seen.add(component.file);
      out.push({
        file: component.file,
        vi: component.vi || component.file,
        spec: component.spec,
        skel: { ...component.skel },
        cell: cellOf(sheet.cell_hint, component.skel.shape),
        group: sheet.id.startsWith("popup") ? "popup" : sheet.id.startsWith("nen") ? "background" : `import-${sheet.id}`,
      });
    }
  }
  return out;
}

/**
 * Chuyển có chủ ý một contract cũ sang những trường mà trình quản lý mới hiểu.
 * Chỉ dùng sau khi người dùng xác nhận; không tự ghi đè khi vừa mở dự án.
 */
export function workflowPatchFromContract(
  contract: Contract,
  projectName: string,
): Partial<WorkflowState> {
  const variant = contractVariants(contract)[0];
  const imported = importedElementsOf(contract);
  const character = variant?.characters?.[0] ?? null;
  const poses = contract.characterPoses.length
    ? contract.characterPoses
    : character?.poses ?? [];
  const inspo = (variant?.inspo ?? []).map(fileName).filter(Boolean).map((name) => ({ name, kind: "style" as const }));
  const brandRefs = (variant?.brand?.refs ?? []).map(fileName).filter(Boolean).map((name) => ({ name }));
  const mascotRef = fileName(character?.ref);
  /* Contract vốn giữ MẢNG nhân vật; bản cũ chỉ đọc con đầu rồi bỏ phần còn lại.
     Nay nhập đủ — bước Mascot đã là danh sách nên không còn chỗ nào phải cắt bớt. */
  const mascots: WorkflowMascot[] = (variant?.characters ?? []).map((c): WorkflowMascot => {
    const ref = fileName(c.ref);
    return { id: newMascotId(), name: c.vi ?? "", description: "", ref: ref ? { name: ref } : null };
  });

  return {
    kitName: projectName,
    stylePrompt: variant?.style ?? "",
    styleMode: variant?.styleMode === "inspo" ? "inspo" : "prompt",
    styleRefs: inspo,
    brandRefs,
    primaryColor: variant?.brand?.primary ?? "#005BAA",
    secondaryColor: variant?.brand?.secondary ?? "#00B0F0",
    chroma: variant?.bg === CHROMA_PRESETS.green || variant?.bg?.toLowerCase().includes("green") ? "green" : "magenta",
    sliceThreshold: contract.slice?.threshold ?? 120,
    kitsetSummary: "Bộ khung đã nhập",
    elements: imported.map((element) => ({
      file: element.file,
      label: element.vi,
      role: "Thành phần đã nhập",
      cell: element.cell === "portrait" ? "dọc" : element.skel.shape === "full" ? "tràn nền" : "ngang",
      selected: true,
    })),
    /* Kitset nhập từ contract là một danh sách CÓ CHỦ Ý. Bật cờ để `KitsetStep` không
       tick thêm 42 món của kho lên trên nó (UI-FIX §2). */
    kitsetTouched: true,
    mascotEnabled: poses.length > 0 || Boolean(character),
    mascotName: character?.vi ?? "",
    mascotRef: mascotRef ? { name: mascotRef } : null,
    mascots,
    mascotPoses: [...poses],
  };
}
