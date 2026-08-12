import * as React from "react";
import { Check, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Silhouette } from "@/features/design/preview";
import { useElementLib, useUserLibrary } from "@/lib/hooks";
import { foldVi, fromAgentLib, loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { cellLabel, useWorkflowStore } from "../lib/model";
import { mergeElements, userUiElements } from "../lib/user-library";
import { Step } from "./BriefStep";

type GroupId = "background" | "popup" | "small-ui" | "props";

const GROUPS: ReadonlyArray<{
  id: GroupId;
  label: string;
  match: (element: LibElement) => boolean;
}> = [
  {
    id: "background",
    label: "Nền",
    match: (element) => element.skel.shape === "full" || /(^|-)bg-?|background/.test(`${element.file} ${element.group ?? ""}`),
  },
  {
    id: "popup",
    label: "Popup",
    match: (element) => element.skel.shape !== "full" && /popup|modal|panel|ribbon/.test(`${element.file} ${element.group ?? ""}`),
  },
  {
    id: "small-ui",
    label: "UI nhỏ",
    match: (element) => element.skel.shape !== "full" && !/popup|modal|panel|ribbon|prop|item|decor|gift|coin|mascot/.test(`${element.file} ${element.group ?? ""}`),
  },
  {
    id: "props",
    label: "Đạo cụ",
    match: (element) => element.skel.shape !== "full" && /prop|item|decor|gift|coin|mascot/.test(`${element.file} ${element.group ?? ""}`),
  },
];

function meta(element: LibElement) {
  return {
    label: element.vi,
    role: element.group ? `Nhóm ${element.group}` : "Thành phần giao diện",
    cell: cellLabel(element.cell ?? "landscape"),
  };
}

export function KitsetStep() {
  const workflow = useWorkflowStore();
  const libraryQuery = useElementLib();
  const userLibrary = useUserLibrary();
  const catalogue = React.useMemo(() => {
    const current = libraryQuery.data ? fromAgentLib(libraryQuery.data).elements : [];
    const base = current.length ? current : loadBundledV2().elements;
    return mergeElements(userUiElements(userLibrary.data?.items ?? []), base);
  }, [libraryQuery.data, userLibrary.data?.items]);
  const [group, setGroup] = React.useState<GroupId>("background");
  const [query, setQuery] = React.useState("");
  const selected = React.useMemo(
    () => new Set(workflow.elements.filter((element) => element.selected).map((element) => element.file)),
    [workflow.elements],
  );
  const current = GROUPS.find((item) => item.id === group)!;
  const shown = React.useMemo(() => {
    const folded = foldVi(query);
    return catalogue.filter((element) => current.match(element)
      && (!folded || foldVi(`${element.vi} ${element.file}`).includes(folded)));
  }, [catalogue, current, query]);

  return (
    <Step title="Bộ khung UI" copy="Chọn các thành phần cần tạo.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {GROUPS.map((item) => {
          const count = catalogue.filter(item.match).filter((element) => selected.has(element.file)).length;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={group === item.id}
              onClick={() => setGroup(item.id)}
              className={`rounded-2 border px-3 py-2 text-label transition-colors ${group === item.id ? "border-accent bg-accent/[var(--kg-tint-a)] text-fg-strong" : "border-line-subtle text-fg hover:bg-raised"}`}
            >
              {item.label}{count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
        <span className="ml-auto text-caption tabular-nums text-fg-muted">{selected.size} đã chọn</span>
      </div>

      {selected.size > 0 && <div className="mb-4 rounded-3 border border-line-subtle bg-raised p-3"><span className="eyebrow">Sẽ tạo</span><p className="mt-1 text-caption text-fg-muted">{selected.size} thành phần đã chọn trong bộ khung.</p></div>}

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={`Tìm trong ${current.label}`}
          placeholder="Tìm thành phần…"
          className="pl-9"
        />
      </div>

      <section aria-label={current.label} className="compact-element-grid">
        {shown.map((element) => {
          const on = selected.has(element.file);
          return (
            <button
              key={element.file}
              type="button"
              className={on ? "compact-element selected" : "compact-element"}
              aria-pressed={on}
              onClick={() => workflow.toggleElement(element.file, meta(element))}
            >
              <span className="compact-element-art">
                <Silhouette
                  skel={element.skel}
                  orient={element.cell === "portrait" ? "portrait" : "landscape"}
                  uid={`pick-${element.file}`}
                />
              </span>
              <span className="min-w-0">
                <strong className="block truncate">{element.vi}</strong>
                <small>{cellLabel(element.cell ?? "landscape")}</small>
              </span>
              {on ? <Check aria-hidden /> : <Plus aria-hidden />}
            </button>
          );
        })}
      </section>
    </Step>
  );
}
