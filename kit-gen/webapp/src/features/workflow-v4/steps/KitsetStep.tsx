import * as React from "react";
import { Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Silhouette } from "@/features/design/preview";
import { useElementLib, useUserLibrary } from "@/lib/hooks";
import { foldVi, fromAgentLib, loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { cellLabel, useWorkflowStore } from "../lib/model";
import { GroupChips } from "../components/GroupChips";
import { isPropElement, mergeElements, userUiElements } from "../lib/user-library";
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
    match: (element) => element.skel.shape !== "full" && !/popup|modal|panel|ribbon/.test(`${element.file} ${element.group ?? ""}`) && !isPropElement(element),
  },
  {
    id: "props",
    label: "Đạo cụ",
    match: (element) => element.skel.shape !== "full" && isPropElement(element),
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

  /**
   * UI-FIX §2 — **MẶC ĐỊNH CHỌN HẾT**, kể cả món kho chỉ biết lúc chạy.
   *
   * `defaultKitset()` trong `model.ts` chỉ tick được 42 món của bản ĐÓNG GÓI. Kho thật
   * ở đây là (bộ khung người dùng tự thêm) + (thư viện của agent), và cả hai chỉ về sau
   * một vòng mạng — món nào mới thấy mà kitset chưa biết thì tick luôn.
   *
   * `kitsetTouched` là cái phanh: vừa bỏ tick một món xong mà effect này chạy lại thì
   * món ấy sẽ được tick lại — đúng loại lỗi "app cãi người dùng". Cờ bật ngay ở cú bấm
   * đầu tiên (`toggleElement` / `setElementsSelected`), nên chuyện đó không xảy ra.
   */
  const { kitsetTouched, adoptCatalogue } = workflow;
  React.useEffect(() => {
    if (kitsetTouched || catalogue.length === 0) return;
    adoptCatalogue(catalogue.map((element) => ({ file: element.file, ...meta(element) })));
  }, [catalogue, kitsetTouched, adoptCatalogue]);

  const current = GROUPS.find((item) => item.id === group)!;
  const shown = React.useMemo(() => {
    const folded = foldVi(query);
    return catalogue.filter((element) => current.match(element)
      && (!folded || foldVi(`${element.vi} ${element.file}`).includes(folded)));
  }, [catalogue, current, query]);
  const shownFiles = React.useMemo(() => shown.map((element) => element.file), [shown]);
  const allShownOn = shownFiles.length > 0 && shownFiles.every((file) => selected.has(file));

  return (
    <Step title="Bộ khung UI" copy="Mặc định chọn hết — bỏ tick những thành phần dự án không cần.">
      <GroupChips
        groups={GROUPS.map((item) => ({
          id: item.id,
          label: item.label,
          count: catalogue.filter(item.match).filter((element) => selected.has(element.file)).length,
        }))}
        value={group}
        onChange={(id) => setGroup(id as GroupId)}
        trailing={`${selected.size} đã chọn`}
      />

      {/* Hai nút hàng loạt: bỏ cả nhóm rồi tick lại vài món là thao tác thật của người
          dùng, và nó phải rẻ hơn 16 cú bấm. Chỉ tác động lên món ĐANG HIỆN (đã lọc). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={allShownOn} onClick={() => workflow.setElementsSelected(shownFiles, true)}>
          Chọn tất cả trong {current.label}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={!shownFiles.some((file) => selected.has(file))} onClick={() => workflow.setElementsSelected(shownFiles, false)}>
          Bỏ chọn nhóm này
        </Button>
      </div>

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
