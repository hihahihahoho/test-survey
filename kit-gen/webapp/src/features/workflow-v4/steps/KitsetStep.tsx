import * as React from "react";
import { Check, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Silhouette } from "@/features/design/preview";
import { cn } from "@/lib/utils";
import { useElementLib, useUserLibrary } from "@/lib/hooks";
import { foldVi, fromAgentLib, loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { cellLabel, useWorkflowStore, type KitElementSkel } from "../lib/model";
import { CheckRow } from "../components/CheckRow";
import { GroupChips } from "../components/GroupChips";
import { ItemDetailDialog, SkelSizeFields } from "../components/ItemDetail";
import { SegChoice } from "../components/SegChoice";
import { useKitsetContract } from "../lib/contract-sync";
import { isGlassCell, isGlowCell, itemPromptFor } from "../lib/item-prompt";
import { mergeElementSkel } from "../lib/kitset-to-contract";
import { isPropElement, mergeElements, userUiElements } from "../lib/user-library";
import { Step } from "./BriefStep";
import { UI_STEP_LABEL } from "./Stepper";

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

  return (
    <Step
      headless={variant === "manage"}
      title={UI_STEP_LABEL}
      copy="Mặc định chọn hết — bỏ tick những thành phần dự án không cần."
    >
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
            </div>
            <div>
              <p className="text-label text-fg-strong">Mô tả gửi cho máy vẽ</p>
              <p className="mt-1 whitespace-pre-wrap text-body text-fg-muted">{detail.spec || "Thư viện chưa có mô tả cho thành phần này."}</p>
            </div>
          </div>
        </ItemDetailDialog>
      ) : null}
    </Step>
  );
}
