import * as React from "react";
import { Check, ImagePlus, Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Silhouette } from "@/features/design/preview";
import { cn } from "@/lib/utils";
import { useElementLib, useUserLibrary } from "@/lib/hooks";
import { foldVi, fromAgentLib, loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { cellLabel, useWorkflowProjectId, useWorkflowStore, type KitElementSkel } from "../lib/model";
import { CheckRow } from "../components/CheckRow";
import { GroupChips } from "../components/GroupChips";
import { ItemDetailDialog, SkelSizeFields } from "../components/ItemDetail";
import { SegChoice } from "../components/SegChoice";
import { useKitsetContract } from "../lib/contract-sync";
import { isGlassCell, isGlowCell, itemPromptFor } from "../lib/item-prompt";
import { GLASS_LEVELS, GLASS_LEVEL_VI, looksLikeGlass, mergeElementSkel } from "../lib/kitset-to-contract";
import { MATERIAL_PRESETS, materialPreset } from "../lib/materials";
import { useWorkflowRefs } from "../lib/refs-sync";
import { isPropElement, mergeElements, userUiElements } from "../lib/user-library";
import { Step } from "./BriefStep";
import { UI_STEP_LABEL } from "../lib/labels";

type GroupId = "background" | "popup" | "small-ui" | "props";

/**
 * ══ BỐN NHÓM, MỖI THÀNH PHẦN ĐÚNG MỘT NHÓM ══════════════════════════════════
 *
 * Bốn vị từ này trước đây **không loại trừ nhau**, và có đúng một nạn nhân:
 * `22-board-panel` ("Khay đựng túi"). Vị từ `popup` bắt chữ "panel"; `isPropElement`
 * (`lib/user-library.ts:19-21`) có `board-panel` trong danh sách trắng đạo cụ. Món ấy
 * vì thế hiện ở CẢ hai tab, dùng CHUNG một ô tick — bấm "Bỏ chọn nhóm này" bên Popup
 * thì số đếm Đạo cụ tự tụt 15→14 mà người dùng không đụng gì bên đó (cả ba người test
 * mù đều báo). Tổng bốn nhóm khi ấy là 43 trên một thư viện 42 món.
 *
 * Hai lớp sửa, cố ý xếp chồng:
 *  ① `groupOf` lấy **nhóm KHỚP ĐẦU TIÊN**. Đây là lớp cấu trúc: dù vị từ tương lai có
 *    chồng lấn thế nào, một thành phần vẫn chỉ rơi vào một nhóm, và tổng bốn nhóm
 *    luôn đúng bằng số món của catalogue.
 *  ② `popup` loại thẳng đạo cụ. Đây là lớp NGỮ NGHĨA, và nó quyết định `22-board-panel`
 *    về Đạo cụ chứ không về Popup: `board-panel` nằm trong danh sách trắng của
 *    `isPropElement` là một lựa chọn CÓ CHỦ Ý của tác giả danh sách ấy ("đạo cụ là
 *    object game độc lập"), còn `/panel/` chỉ là một mẩu regex quét tên. Cái cụ thể
 *    thắng cái quét.
 *
 * Bốn vị từ phủ kín catalogue: `shape === "full"` ⇒ Nền; mọi shape khác chắc chắn rơi
 * vào một trong ba nhóm còn lại (chúng chia nhau theo `isPropElement` và regex popup).
 * Nhóm này CHỈ là bộ lọc hiển thị — không có gì trong `buildKitsetContract` đọc nó, nên
 * đổi cách phân nhóm không đổi một byte nào của phạm vi gửi đi gen.
 */
const POPUP_RE = /popup|modal|panel|ribbon/;
const nameKey = (element: LibElement) => `${element.file} ${element.group ?? ""}`;

const GROUPS: ReadonlyArray<{
  id: GroupId;
  label: string;
  match: (element: LibElement) => boolean;
}> = [
  {
    id: "background",
    label: "Nền",
    match: (element) => element.skel.shape === "full" || /(^|-)bg-?|background/.test(nameKey(element)),
  },
  {
    id: "popup",
    label: "Popup",
    match: (element) => element.skel.shape !== "full" && POPUP_RE.test(nameKey(element)) && !isPropElement(element),
  },
  {
    id: "small-ui",
    label: "UI nhỏ",
    match: (element) => element.skel.shape !== "full" && !POPUP_RE.test(nameKey(element)) && !isPropElement(element),
  },
  {
    id: "props",
    label: "Đạo cụ",
    match: (element) => element.skel.shape !== "full" && isPropElement(element),
  },
];

/** Nhóm DUY NHẤT của một thành phần: khớp đầu tiên thắng. `null` = không nhóm nào nhận. */
export function groupOf(element: LibElement): GroupId | null {
  return GROUPS.find((item) => item.match(element))?.id ?? null;
}

function meta(element: LibElement) {
  return {
    label: element.vi,
    role: element.group ? `Nhóm ${element.group}` : "Thành phần giao diện",
    cell: cellLabel(element.cell ?? "landscape"),
  };
}

/**
 * ══ NẠP TỪ MOCKUP — ĐỢT 1, THỦ CÔNG VÀ NÓI THẲNG LÀ THỦ CÔNG ═══════════════
 *
 * Ý kiến 6 của team: "nạp từ mockup ra UI". Đợt này KHÔNG có nhận dạng tự động, và
 * dialog nói ra điều đó bằng chính hình dạng của nó: người dùng thả ảnh, rồi tự tick
 * những gì họ thấy trong ảnh. Đổi lại, cả hai nửa đều là đường ĐÃ CHẠY THẬT —
 *  · ảnh đi vào `refs.add(files,"inspo")`, tức ĐÚNG ống mà ô "Ảnh phong cách" của bước
 *    Phong cách đang dùng, nên ảnh hiện ra ở đó như một ảnh tham chiếu thường và đi
 *    tới `gen.sh` qua `variants[].inspo`;
 *  · tick đi vào `setElementsSelected`, tức đúng hành động của lưới chính.
 * Không có đường ống thứ hai nào được dựng cho tính năng này ⇒ đợt 2 (auto-detect) chỉ
 * cần thay phần "ai tick" bằng "máy tick", không phải viết lại chỗ nào khác.
 *
 * CỘNG THÊM, KHÔNG THAY THẾ: bấm Xong chỉ TICK những món đã chọn, không bỏ tick phần
 * còn lại. Một mockup là một màn hình, không phải toàn bộ bộ kit — hiểu nó là "chỉ giữ
 * bấy nhiêu" sẽ âm thầm vứt phần người dùng đã chọn ở lưới chính.
 */
function MockupImportDialog({ open, onOpenChange, catalogue, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogue: readonly LibElement[];
  onPick: (files: readonly string[]) => void;
}) {
  const projectId = useWorkflowProjectId();
  const refs = useWorkflowRefs(projectId);
  const workflow = useWorkflowStore();
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setAdded(0);
  }, [open]);

  /* Chép ĐÚNG luật của bước Phong cách: Blob đi tới đĩa, còn bản nháp chỉ giữ tên để
     offline vẫn thấy có gì đó (§W3-3). Hai chỗ cùng gọi một hook nên không thể lệch. */
  const takeFiles = (files: File[]) => {
    if (files.length === 0) return;
    refs.add(files, "inspo");
    workflow.set({
      styleRefs: [...workflow.styleRefs, ...files.map((file) => ({ name: file.name, kind: "style" as const }))],
    });
    setAdded((n) => n + files.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[min(46rem,calc(100dvh-2rem))]">
        <DialogHeader>
          <DialogTitle>Nạp từ mockup</DialogTitle>
          <DialogDescription>
            Thả ảnh màn hình mẫu, rồi tick những thứ bạn thấy trong ảnh. Đợt này bạn tự tick — bản sau sẽ tự nhận dạng.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          <div>
            <p className="text-label text-fg-strong">Ảnh mockup</p>
            <p className="mt-1 text-caption text-fg-muted">
              Tối đa 3 ảnh. Ảnh được lưu vào bộ ảnh phong cách của dự án, xem lại ở bước Phong cách.
            </p>
            <div className="dropfield mt-2">
              <ImageDropzone
                multiple
                maxFiles={3}
                showLocalPreview={false}
                label="Kéo ảnh mockup vào đây"
                description="Ảnh chụp màn hình hoặc bản thiết kế mẫu"
                state={refs.pending ? "uploading" : added > 0 ? "done" : "idle"}
                onFiles={takeFiles}
              />
            </div>
            {added > 0 ? <p className="mt-2 text-caption text-fg-muted">Đã gửi {added} ảnh vào bộ ảnh phong cách.</p> : null}
          </div>

          {GROUPS.map((group) => {
            const items = catalogue.filter((item) => groupOf(item) === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="text-label text-fg-strong">{group.label}</p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Chọn trong ${group.label}`}>
                  {items.map((item) => (
                    <SegChoice
                      key={item.file}
                      size="sm"
                      on={picked.has(item.file)}
                      onClick={() => setPicked((current) => {
                        const next = new Set(current);
                        if (next.has(item.file)) next.delete(item.file); else next.add(item.file);
                        return next;
                      })}
                    >
                      {item.vi}
                    </SegChoice>
                  ))}
                </div>
              </div>
            );
          })}
        </DialogBody>
        <DialogFooter className="border-t border-line-subtle">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            type="button"
            onClick={() => { onPick([...picked]); onOpenChange(false); }}
          >
            {picked.size > 0 ? `Xong — thêm ${picked.size} mục` : "Xong"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * HAI HÌNH THÁI CHO CÙNG MỘT MÀN.
 *
 * · `wizard` — bước ③ lúc tạo dự án: chỉ chọn/bỏ chọn. Người ta chưa có ảnh nào để
 *   so, nên đưa ô "Rộng %/Cao %" ra trước mặt là bắt quyết định thứ họ chưa hình dung.
 * · `manage` — tab **Settings** của trang Skeleton UI: cùng thẻ đó, cộng thêm MỘT nút
 *   Chi tiết trên thẻ. Đây là nơi người ta quay lại SAU khi đã nhìn ảnh thật và biết ô
 *   nào cần to/nhỏ lại.
 *
 * ══ MỌI Ô NHẬP NẰM TRONG POPUP, KHÔNG MỘT Ô NÀO TRẦN RA TRANG ═══════════════
 * Bản trước đặt hai ô "Rộng %"/"Cao %" + nút Chi tiết NGAY DƯỚI từng thẻ. Với 42 món
 * đó là 84 ô số xếp thành một bức tường, và chủ sản phẩm gọi đúng tên nó: "SETTING SAO
 * NÓ THÔ THẾ NÀY, KIỂU ĐỂ HẾT TRONG 1 CÁI POPUP THÔI, ĐỪNG LỘ RA NGOÀI". Nay thẻ chỉ
 * còn ba thứ — tên, hình silhouette, dấu tick — và TẤT CẢ control chỉnh (kích thước ô,
 * tick chọn, mô tả, prompt sẽ gửi đi) gom vào `ItemDetailDialog` mở từ nút Chi tiết.
 * Kích thước ô vì thế chỉ còn MỘT chỗ sửa, không phải hai chỗ phải giữ đồng bộ.
 *
 * Một component chứ không hai màn: hai bản sao của lưới 42 món là hai chỗ để luật
 * "mặc định chọn hết" và bộ lọc nhóm lệch nhau.
 */
export type KitsetVariant = "wizard" | "manage";

export function KitsetStep({ variant = "wizard", detailFooter }: {
  variant?: KitsetVariant;
  /** Hàng nút của panel chi tiết. Màn quản lý truyền `SaveBar`; wizard để trống. */
  detailFooter?: React.ReactNode;
} = {}) {
  const workflow = useWorkflowStore();
  const sync = useKitsetContract();
  const [detailFile, setDetailFile] = React.useState<string | null>(null);
  const [mockupOpen, setMockupOpen] = React.useState(false);
  const libraryQuery = useElementLib();
  const userLibrary = useUserLibrary();
  const catalogue = React.useMemo(() => {
    const current = libraryQuery.data ? fromAgentLib(libraryQuery.data).elements : [];
    const base = current.length ? current : loadBundledV2().elements;
    return mergeElements(userUiElements(userLibrary.data?.items ?? []), base);
  }, [libraryQuery.data, userLibrary.data?.items]);
  const [group, setGroup] = React.useState<GroupId>("background");
  const [query, setQuery] = React.useState("");
  /** Mọi id ĐANG CÓ MẶT trong catalogue được vẽ ra — đây là vũ trụ của màn này. */
  const catalogueFiles = React.useMemo(
    () => new Set(catalogue.map((element) => element.file)),
    [catalogue],
  );
  /**
   * §QA — CHỈ ĐẾM THỨ NGƯỜI DÙNG BẤM ĐƯỢC.
   *
   * Bản cũ đếm `workflow.elements` toàn store, mà store chứa cả thứ không có ô tick nào
   * trên màn: `PRESET_MISSING_DESIGN` nhồi `wheel-board` vào kitset (`lib/model.ts:170`)
   * còn `element-lib-v2.json` không có món ấy ⇒ dòng "N đã chọn" dư đúng +1 vĩnh viễn.
   * Bỏ tick sạch cả bốn nhóm vẫn thấy "1 đã chọn", và cả ba người test mù đều dừng lại
   * ở đó, lo bị tính tiền cho một thứ họ không tìm ra.
   *
   * Sửa ở tầng ĐẾM chứ không xoá `wheel-board` khỏi kitset, vì cùng một vết đau có
   * nguồn thứ hai: bộ khung người dùng tự thêm rồi xoá khỏi thư viện vẫn nằm lại trong
   * bản nháp đã lưu (`model.ts:531` persist `elements`) và cũng thành "ma" y hệt. Lọc
   * theo catalogue chữa cả hai bằng một luật, và không đụng vào `wheel-board` — món này
   * đang mang `mock:true`, `buildKitsetContract` đã loại nó khỏi contract kèm lý do
   * (`kitset-to-contract.ts:191`) nên phạm vi gen vốn đã đúng và phải giữ nguyên như thế.
   */
  const selected = React.useMemo(
    () => new Set(
      workflow.elements
        .filter((element) => element.selected && catalogueFiles.has(element.file))
        .map((element) => element.file),
    ),
    [workflow.elements, catalogueFiles],
  );
  const allFiles = React.useMemo(() => catalogue.map((element) => element.file), [catalogue]);

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
    return catalogue.filter((element) => groupOf(element) === current.id
      && (!folded || foldVi(`${element.vi} ${element.file}`).includes(folded)));
  }, [catalogue, current, query]);
  const shownFiles = React.useMemo(() => shown.map((element) => element.file), [shown]);
  const allShownOn = shownFiles.length > 0 && shownFiles.every((file) => selected.has(file));

  const overrides = React.useMemo(() => {
    const map = new Map<string, KitElementSkel>();
    for (const element of workflow.elements) if (element.skel) map.set(element.file, element.skel);
    return map;
  }, [workflow.elements]);
  const detail = detailFile ? catalogue.find((element) => element.file === detailFile) ?? null : null;
  /* Nền của ô ĐANG ÁP DỤNG = thư viện + lớp đè, trộn bằng đúng hàm của contract. Đọc
     thẳng `overrides.get(...)?.matte` thì ô nào thư viện đã khai `matte:"glow"` sẵn
     (element-lib có 1 món) sẽ hiện sai là "Nền thường" cho tới khi người dùng bấm. */
  const detailOverride = detail ? overrides.get(detail.file) : undefined;
  const detailSkel = detail ? (detailOverride ? mergeElementSkel(detail.skel, detailOverride) : detail.skel) : null;
  const glow = isGlowCell(detailSkel);
  const glass = isGlassCell(detailSkel);
  /* Chữ ĐANG NẰM TRONG Ô NHẬP = lớp đè nếu có, không thì bản của thư viện. Prefill bằng
     bản thư viện (chứ không để trống) là cố ý: người ta sửa một câu đã có dễ hơn nhiều
     so với viết lại từ đầu, và họ thấy ngay mình đang thay thế cái gì. */
  const detailText = detailOverride?.spec ?? detail?.spec ?? "";
  const detailEdited = detailOverride?.spec !== undefined;
  /* Gợi ý CHẤT LIỆU đọc chữ NGƯỜI DÙNG ĐANG THẤY, không đọc bản thư viện: sửa mô tả
     thành "khay kính mờ" mà dòng gợi ý vẫn im thì nó vô dụng đúng lúc cần nhất. */
  const suggestGlass = Boolean(detail) && !glow && !glass && looksLikeGlass(detailText);
  const material = detailOverride?.material ?? "";
  const materialIsPreset = materialPreset(material) !== null;

  return (
    <Step
      headless={variant === "manage"}
      title={UI_STEP_LABEL}
      copy="Mặc định chọn hết — bỏ tick những thành phần dự án không cần."
    >
      {/* Đứng TRÊN hàng chip nhóm: đây là cửa vào của cả màn ("tôi có ảnh mẫu, bắt đầu
          từ nó") chứ không phải một thao tác trên danh sách đang lọc. */}
      <div className="mb-4">
        <Button type="button" variant="secondary" size="sm" onClick={() => setMockupOpen(true)}>
          <ImagePlus aria-hidden />Nạp từ mockup
        </Button>
      </div>
      <MockupImportDialog
        open={mockupOpen}
        onOpenChange={setMockupOpen}
        catalogue={catalogue}
        onPick={(files) => { if (files.length > 0) workflow.setElementsSelected(files, true); }}
      />

      <GroupChips
        groups={GROUPS.map((item) => ({
          id: item.id,
          label: item.label,
          count: catalogue.filter((element) => groupOf(element) === item.id)
            .filter((element) => selected.has(element.file)).length,
        }))}
        value={group}
        onChange={(id) => setGroup(id as GroupId)}
        trailing={`${selected.size}/${allFiles.length} đã chọn`}
      />

      {/* Bốn nút hàng loạt, chia làm hai tầng rõ ràng — TOÀN BỘ trước, NHÓM sau.
          Cả ba người test mù đều xin cùng một thứ: muốn thử nhanh 1–2 món thì phải bấm
          "Bỏ chọn nhóm này" đủ bốn lần, vì mặc định là tick sẵn cả 42 món. Nút toàn cục
          cắt bốn cú bấm ấy còn một. Hai nút dưới vẫn chỉ tác động lên món ĐANG HIỆN
          (đã qua bộ lọc tìm kiếm) — đó là điểm khác nhau duy nhất, và nhãn nói ra nó. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button" variant="ghost" size="sm"
          disabled={allFiles.length === 0 || selected.size === allFiles.length}
          onClick={() => workflow.setElementsSelected(allFiles, true)}
        >
          Chọn tất cả {allFiles.length} thành phần
        </Button>
        <Button
          type="button" variant="ghost" size="sm"
          disabled={selected.size === 0}
          onClick={() => workflow.setElementsSelected(allFiles, false)}
        >
          Bỏ chọn tất cả
        </Button>
        <span className="text-caption text-fg-muted" aria-hidden>·</span>
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
          const override = overrides.get(element.file);
          /* Silhouette phải vẽ theo kích thước ĐANG ÁP DỤNG, không phải số của thư viện:
             sửa "Rộng %" mà hình xem trước đứng yên là bảo người ta tin vào con số suông.
             Trộn bằng ĐÚNG hàm mà `resolveKitset()` dùng — không spread tay một bản sao
             của luật trộn (bản sao đó không biết `matte:"none"` nghĩa là gì). */
          const skel = override ? mergeElementSkel(element.skel, override) : element.skel;
          const toggle = (
            <button
              type="button"
              className={cn(
                on ? "compact-element selected" : "compact-element",
                /* Chừa chỗ cho nút Chi tiết đè lên góc phải; không có `pr` này thì nút
                   nằm chồng lên dấu tick của chính thẻ. */
                variant === "manage" && "w-full pr-12",
              )}
              aria-pressed={on}
              onClick={() => workflow.toggleElement(element.file, meta(element))}
            >
              <span className="compact-element-art">
                <Silhouette
                  skel={skel}
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
          if (variant === "wizard") return <React.Fragment key={element.file}>{toggle}</React.Fragment>;
          return (
            <div key={element.file} className="relative min-w-0">
              {toggle}
              {/* Nút Chi tiết ĐÈ lên thẻ chứ không nằm dưới thẻ: nằm dưới thì nó là một
                  hàng control thứ hai của lưới, đúng thứ vừa bị dọn đi. */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2"
                aria-label={`Chi tiết ${element.vi}`}
                title={`Chi tiết ${element.vi}`}
                onClick={() => setDetailFile(element.file)}
              >
                <SlidersHorizontal aria-hidden />
              </Button>
            </div>
          );
        })}
      </section>

      {detail ? (
        <ItemDetailDialog
          open
          onOpenChange={(open) => { if (!open) setDetailFile(null); }}
          title={detail.vi}
          description={`${detail.group ? `Nhóm ${detail.group} · ` : ""}ô ${cellLabel(detail.cell ?? "landscape")} · ${detail.file}`}
          prompt={itemPromptFor(sync?.contract ?? null, detail.file)}
          promptEmptyReason="Thành phần này đang không được chọn nên chưa có ô nào trong bản thiết kế. Tick chọn nó rồi mở lại để xem prompt."
          footer={detailFooter ?? <Button type="button" variant="secondary" onClick={() => setDetailFile(null)}>Đóng</Button>}
        >
          <div className="space-y-4">
            {/* Tick chọn có ở CẢ hai nơi cùng một nguồn: dấu tick trên thẻ (thao tác
                nhanh) và hàng này (để sửa xong kích thước là bật/tắt được ngay, không
                phải đóng popup đi tìm lại đúng thẻ trong 42 món). */}
            <CheckRow
              id={`kitset-detail-${detail.file}`}
              checked={selected.has(detail.file)}
              onCheckedChange={() => workflow.toggleElement(detail.file, meta(detail))}
              label="Vẽ thành phần này"
              description="Bỏ tick để loại thành phần khỏi bản thiết kế của dự án."
            />
            <div>
              <p className="text-label text-fg-strong">Kích thước ô</p>
              <p className="mt-1 text-caption text-fg-muted">Phần trăm bề rộng và bề cao của ô. Bỏ trống để dùng số của thư viện chung.</p>
              <SkelSizeFields
                className="mt-3 max-w-xs"
                idPrefix={`detail-${detail.file}`}
                w={overrides.get(detail.file)?.w}
                h={overrides.get(detail.file)?.h}
                defaults={{ w: detail.skel.w ?? 0.8, h: detail.skel.h ?? 0.8 }}
                onChange={(patch) => workflow.setElementSkel(detail.file, patch)}
              />
            </div>
            {/* NỀN CỦA Ô — lựa chọn thứ hai của popup, ngay dưới kích thước ô.
                Ba nút loại-trừ-nhau (`SegChoice`, đúng tín hiệu "đang chọn" của cả
                app) chứ không phải dropdown "Kiểu tách nền / none-glow-glass" của màn
                cũ (`ElementProps.tsx`): ở trang này người dùng chọn CÁCH TÁCH bằng câu
                mô tả cái ô, không phải bằng tên thuật toán của slicer.
                `"vitmatte"` KHÔNG có nút — nó thuần thuật toán, thư viện tự khai. */}
            <div>
              <p className="text-label text-fg-strong">Nền tách</p>
              <p className="mt-1 text-caption text-fg-muted">
                Ô phát sáng (lửa, tia, hào quang): quầng sáng tan dần bằng cách hạ alpha về 0 mà vẫn giữ màu của chính ánh sáng — không có tấm nền nào phía sau.
                Ô trong suốt (kính, khay mờ): thân vẽ ở alpha thấp, độ trong nằm thẳng trong kênh alpha chứ không đo gián tiếp qua màu nền.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Nền tách">
                <SegChoice
                  on={!glow && !glass}
                  aria-label="Nền thường"
                  /* Thư viện vốn đã là nền thường ⇒ XOÁ lớp đè thay vì ghi `"none"`:
                     bản nháp không nên phình ra vì một giá trị trùng đúng mặc định. */
                  onClick={() => workflow.setElementSkel(detail.file, {
                    matte: detail.skel.matte === "glow" || detail.skel.matte === "glass" ? "none" : null,
                  })}
                >
                  Nền thường
                </SegChoice>
                <SegChoice
                  on={glow}
                  aria-label="Hiệu ứng phát sáng"
                  onClick={() => workflow.setElementSkel(detail.file, { matte: "glow" })}
                >
                  Hiệu ứng phát sáng
                </SegChoice>
                <SegChoice
                  on={glass}
                  aria-label="Trong suốt nhìn xuyên qua"
                  onClick={() => workflow.setElementSkel(detail.file, { matte: "glass" })}
                >
                  Trong suốt nhìn xuyên qua
                </SegChoice>
              </div>
              {/* ĐƯỜNG BỊ ĐỘNG của ý kiến 4: mô tả đã nói "kính" mà cách tách vẫn là nền
                  thường ⇒ ô sẽ ra một mảng ĐỤC. App NÓI RA chỗ lệch và đưa sẵn nút, chứ
                  KHÔNG tự bấm hộ — một mô tả nhắc tới "cửa sổ kính" của bối cảnh không
                  có nghĩa chính cái ô ấy trong suốt. */}
              {suggestGlass ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2 border border-line-subtle bg-raised p-2">
                  <p className="min-w-0 flex-1 text-caption text-fg-muted">
                    Chất liệu nghe như là kính — nên chọn Trong suốt để giữ được độ trong thật.
                  </p>
                  <Button
                    type="button" variant="secondary" size="sm"
                    onClick={() => workflow.setElementSkel(detail.file, { matte: "glass" })}
                  >
                    Áp Trong suốt
                  </Button>
                </div>
              ) : null}
              {/* Ba mức chỉ hiện khi ô ĐANG là kính: chọn "kính đậm" cho một ô nền thường
                  là một lựa chọn không đi tới đâu (xem `resolveElementSpec`). Bấm lại
                  đúng mức đang chọn ⇒ bỏ mức, ô về câu kính chung của `gen.sh`. */}
              {glass ? (
                <div className="mt-3">
                  <p className="text-caption text-fg-muted">Độ trong của kính</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Độ trong của kính">
                    {GLASS_LEVELS.map((level) => {
                      const on = detailOverride?.glassLevel === level;
                      return (
                        <SegChoice
                          key={level}
                          on={on}
                          aria-label={GLASS_LEVEL_VI[level]}
                          onClick={() => workflow.setElementSkel(detail.file, { glassLevel: on ? null : level })}
                        >
                          {GLASS_LEVEL_VI[level]}
                        </SegChoice>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            {/* CHẤT LIỆU — đường CHỦ ĐỘNG của ý kiến 4, đặt ngay cạnh Nền tách vì hai thứ
                đi đôi: chọn "Kính" là vừa nối chữ vào mô tả, vừa áp cách tách tương ứng.
                Chips chứ không dropdown: 10 lựa chọn ngắn, và chips dùng chung đúng tín
                hiệu "đang chọn" của cả app (`SegChoice`). */}
            <div>
              <p className="text-label text-fg-strong">Chất liệu</p>
              <p className="mt-1 text-caption text-fg-muted">
                Nối một câu chất liệu vào mô tả gửi đi, và áp sẵn cách tách hợp với nó. Bạn vẫn đổi lại cách tách bằng ba nút phía trên.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Chất liệu">
                <SegChoice
                  on={material === ""}
                  aria-label="Theo mô tả"
                  onClick={() => workflow.setElementSkel(detail.file, { material: null })}
                >
                  Theo mô tả
                </SegChoice>
                {MATERIAL_PRESETS.map((preset) => (
                  <SegChoice
                    key={preset.id}
                    on={material === preset.id}
                    aria-label={preset.vi}
                    /* Áp `suggestedMatte` NGAY tại cú bấm, không phải lúc dựng contract:
                       ba nút Nền tách phải hiện đúng thứ vừa xảy ra, và người dùng phải
                       đổi lại được. Áp ngầm ở tầng contract là lấy mất quyền đổi ấy. */
                    onClick={() => workflow.setElementSkel(detail.file, {
                      material: preset.id,
                      matte: preset.suggestedMatte === "none"
                        ? (detail.skel.matte === "glow" || detail.skel.matte === "glass" ? "none" : null)
                        : preset.suggestedMatte,
                    })}
                  >
                    {preset.vi}
                  </SegChoice>
                ))}
              </div>
              <div className="mt-3 max-w-sm">
                <Label htmlFor={`detail-${detail.file}-material`}>Hoặc tự gõ chất liệu (tiếng Anh)</Label>
                <Input
                  id={`detail-${detail.file}-material`}
                  value={materialIsPreset ? "" : material}
                  placeholder="brushed copper with soft patina"
                  onChange={(event) => workflow.setElementSkel(detail.file, { material: event.target.value })}
                />
              </div>
            </div>
            {/* MÔ TẢ — ô mạnh nhất của popup, nên nó đứng cuối, ngay trên khối "Prompt sẽ
                gửi đi" mà nó quyết định. `gen.sh` chèn đúng chuỗi này vào dòng `N) {spec}`,
                nên sửa ở đây là sửa THẲNG câu lệnh gửi cho máy vẽ — kể cả với hai ô nền
                (`25-bg-home`/`26-bg-play`), thứ trước đây không có đường nào sửa. */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-label text-fg-strong">
                  Mô tả gửi cho máy vẽ
                  {detailEdited ? <span className="ml-2 text-caption text-accent-text">✎ đã chỉnh</span> : null}
                </p>
                <Button
                  type="button" variant="ghost" size="sm"
                  disabled={!detailEdited}
                  onClick={() => workflow.setElementSkel(detail.file, { spec: null })}
                >
                  <RotateCcw aria-hidden />Khôi phục mặc định
                </Button>
              </div>
              <p className="mt-1 text-caption text-fg-muted">
                Chữ của thư viện chung được điền sẵn. Sửa ở đây chỉ đổi bản của dự án này; xoá hết chữ là quay về mặc định.
              </p>
              <Textarea
                className="mt-2"
                aria-label="Mô tả gửi cho máy vẽ"
                rows={4}
                value={detailText}
                placeholder={detail.spec || "Thư viện chưa có mô tả cho thành phần này."}
                /* Gõ lại ĐÚNG chữ của thư viện ⇒ xoá lớp đè, không giữ một bản sao trùng
                   mặc định. Nhờ vậy badge "đã chỉnh" không bao giờ nói dối. */
                onChange={(event) => workflow.setElementSkel(detail.file, {
                  spec: event.target.value === detail.spec ? null : event.target.value,
                })}
              />
            </div>
          </div>
        </ItemDetailDialog>
      ) : null}
    </Step>
  );
}
