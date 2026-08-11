import type { LibElement } from "@/features/design/library/lib/types";
import type { LibraryItem } from "@/lib/types";

const DEFAULT_GEOMETRY = {
  background: { cell: "full", skel: { shape: "full", w: 1, h: 1 } },
  popup: { cell: "landscape", skel: { shape: "rrect", w: 0.82, h: 0.62, slice9: true } },
  small: { cell: "landscape", skel: { shape: "pill", w: 0.78, h: 0.5, slice9: true } },
} as const;

type UiLibraryGroup = keyof typeof DEFAULT_GEOMETRY;

function isUiLibraryGroup(value: LibraryItem["group"]): value is UiLibraryGroup {
  return value === "background" || value === "popup" || value === "small";
}

/** Bộ khung do người dùng thêm phải đi vào cùng pipeline với catalogue có sẵn. */
export function userUiElements(items: readonly LibraryItem[]): LibElement[] {
  return items
    .filter((item): item is LibraryItem & { kind: "ui"; group: UiLibraryGroup } => item.kind === "ui" && isUiLibraryGroup(item.group))
    .map((item) => {
      const fallback = DEFAULT_GEOMETRY[item.group];
      return {
        file: `90-custom-${item.id.replace(/^asset_/, "").slice(-12)}`,
        vi: item.name,
        spec: item.description || item.name,
        skel: item.skel ?? { ...fallback.skel },
        cell: item.cell ?? fallback.cell,
        // Mỗi mục là một nhóm độc lập: khi chia sheet, một mục tuỳ chỉnh không kéo
        // toàn bộ các mục cùng loại đi theo chỉ vì chúng đều do người dùng tạo.
        group: `custom-${item.id}`,
      };
    });
}

export function mergeElements(...sources: ReadonlyArray<readonly LibElement[] | undefined>): LibElement[] {
  const merged = new Map<string, LibElement>();
  for (const source of sources) {
    for (const element of source ?? []) if (!merged.has(element.file)) merged.set(element.file, element);
  }
  return [...merged.values()];
}

const POSE_ALIASES: Readonly<Record<string, string>> = {
  "đứng yên": "idle",
  "đứng chờ": "idle",
  vui: "cheer",
  "ăn mừng": "cheer",
  buồn: "sad",
  "giới thiệu": "present",
};

/** Dữ liệu mascot cũ có thể lưu nhãn tiếng Việt; contract cần id an toàn cho tên file. */
export function normalizePoseId(value: string): string {
  const clean = value.trim().toLocaleLowerCase("vi");
  const known = POSE_ALIASES[clean];
  if (known) return known;
  const slug = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return slug || "idle";
}

export function normalizedPoseIds(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizePoseId))].slice(0, 32);
}
