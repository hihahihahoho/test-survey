import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { BlockEditor } from "@/features/prompt-lab/components/BlockEditor";
import { ModeToggle } from "@/features/prompt-lab/components/BlockCard";
import { BrandColorPills } from "@/features/prompt-lab/components/BrandColorPills";
import { BrandPickerPill, type BrandBinding } from "@/features/prompt-lab/components/BrandPickerPill";
import { RefImageBody } from "@/features/prompt-lab/components/RefImagePill";
import { BrandColorsProvider } from "@/features/prompt-lab/extensions/BrandPill";
import { BrandBindingProvider } from "@/features/prompt-lab/extensions/BrandProfilePill";
import { OptionPill } from "@/features/prompt-lab/components/pill-ui";
import {
  SCAFFOLD_CONTEXT,
  contextDoc,
  contextRefsOf,
  pillCustomOf,
  pillValuesOf,
} from "@/features/prompt-lab/lib/doc-templates";
import { freeText } from "@/features/prompt-lab/lib/serialize";
import type { BlockMode, ComposerState, ContextRef } from "@/features/prompt-lab/lib/composer-model";
import { uploadPillImage } from "../lib/pill-image";
import { CARD, SECTION_LABEL } from "../lib/ui";

/**
 * ContextSection — khối NGỮ CẢNH CHUNG, nay có đủ hai chế độ như mọi block khác.
 *
 * ╔══ VÌ SAO KHỐI NÀY XỨNG ĐÁNG CÓ CHẾ ĐỘ TỰ DO ═════════════════════════════╗
 * ║ Câu ở đây đi vào `variant.style`, tức là mệnh đề mà `gen.sh` chèn vào MỌI  ║
 * ║ tấm của bộ kit. Nó là câu có sức nặng lớn nhất trong cả tài liệu, và cho   ║
 * ║ tới lượt này nó là câu DUY NHẤT người dùng không được viết lại: hai        ║
 * ║ dropdown và một dãy màu, hết. Ai muốn nói "phong cách như poster phim thập ║
 * ║ niên 80, nhưng tiết chế" thì không có chỗ nào để gõ.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ CÂU NÀY NAY CÓ BỐN CHỖ CHỌN, VÀ ĐÓ LÀ TRẢ LỜI MỘT CÂU HỎI SẢN PHẨM ════╗
 * ║ *"chỗ thương hiệu có nên tách ra không nhỉ"* — không. Thương hiệu vào câu  ║
 * ║ như một pill nữa, đứng ngay trước bộ màu mà nó vừa đổ vào: đọc từ trái     ║
 * ║ sang là thấy quan hệ nhân quả («thương hiệu [X] với màu [●][●]»). Tách ra  ║
 * ║ một khối riêng thì quan hệ ấy phải được kể lại bằng một câu chú thích, mà  ║
 * ║ chú thích thì không ai đọc.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Tách thành file riêng vì nó có state riêng (hộp hỏi khi quay về khuôn) và một
 * cây JSX gấp ba lần bản cũ — nhét cả vào `PromptCanvasScreen` là đẩy một màn vốn
 * đã dài thêm 60 dòng nữa.
 */
export function ContextSection({
  composer,
  edit,
  brand,
  projectId,
}: {
  composer: ComposerState;
  edit: (updater: (prev: ComposerState) => ComposerState) => void;
  /**
   * Dây nối tới kho thương hiệu. VẮNG ⇒ pill thương hiệu không được vẽ.
   *
   * Tuỳ chọn vì khối này phải dựng được ở nơi KHÔNG có kho: bộ ca DOM của chính
   * nó, và bất cứ ai muốn xem nó riêng lẻ. Đọc kho là một `useQuery`, mà một
   * `useQuery` không có Provider thì NÉM — đặt nó trong đây là buộc mọi chỗ dựng
   * khối này phải dựng thêm nửa tầng dữ liệu của app.
   */
  brand?: BrandBinding;
  /** Dự án đang mở — cần để tải ảnh tham chiếu lên. Rỗng ⇒ không đính được ảnh. */
  projectId?: string;
}) {
  const [askReset, setAskReset] = React.useState(false);
  /* Pill nào đang tải ảnh lên (`theme`/`style`), rỗng = không có. Trạng thái của
     MÀN, không của tài liệu — cùng luật với `busy` trong `ImagePill`. */
  const [attaching, setAttaching] = React.useState("");
  const fileRole = React.useRef<"theme" | "style">("theme");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const doc = composer.contextDoc ?? contextDoc(composer);

  const pick = (next: BlockMode) => {
    if (next === composer.contextMode) return;
    if (next === "free") {
      /* Dựng câu khởi điểm TỪ trạng thái hiện tại, nên gạt công tắc là thấy đúng
         câu vừa đọc — chỉ khác ở chỗ giờ gõ được vào giữa. */
      edit((prev) => ({
        ...prev,
        contextMode: "free",
        contextDoc: prev.contextDoc ?? contextDoc(prev),
      }));
      return;
    }
    /* Quay về khuôn thì câu tự do bị bỏ ⇒ hỏi, nhưng CHỈ khi có chữ để mất. Hỏi
       thừa mỗi lần gạt là dạy người dùng bấm "Đồng ý" mà không đọc — cùng luật
       với block Bộ UI và block có câu chữ. */
    if (freeText(doc as never, SCAFFOLD_CONTEXT)) {
      setAskReset(true);
      return;
    }
    edit((prev) => ({ ...prev, contextMode: "template", contextDoc: undefined }));
  };

  /* ── Đính một tấm ảnh cho pill theme / phong cách ─────────────────────────
     Ở chế độ KHUÔN, câu là React thuần nên tấm ảnh không có node nào để nằm vào:
     nó đi thẳng vào `contextRefs`, đúng nguồn sự thật mà bộ dịch contract đọc.
     (Ở chế độ tự do thì node view của pill tự chèn một `imagePill` vào câu, rồi
     `adoptContextDoc` rút nó về đúng mảng ấy — hai đường, một đích.) */
  const attach = async (files: FileList | null) => {
    const file = files?.[0];
    const role = fileRole.current;
    if (!file || !projectId) return;
    setAttaching(role);
    try {
      const image = await uploadPillImage(projectId, file, { kind: "inspo", hintName: `${role}-ref-${file.name}` });
      edit((prev) => ({ ...prev, contextRefs: [...prev.contextRefs, { path: image.path, role }] }));
    } finally {
      setAttaching("");
    }
  };

  const askFile = (role: "theme" | "style") => {
    fileRole.current = role;
    fileRef.current?.click();
  };

  const dropRef = (path: string) =>
    edit((prev) => ({ ...prev, contextRefs: prev.contextRefs.filter((ref) => ref.path !== path) }));

  const shots = (role: ContextRef["role"]) =>
    composer.contextRefs.filter((ref) => ref.role === role && ref.path);

  return (
    <section className={CARD} aria-labelledby="kg-ctx-label">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="kg-ctx-label" className={SECTION_LABEL}>Ngữ cảnh chung</h2>
        <div className="ml-auto">
          <ModeToggle mode={composer.contextMode} onPick={pick} />
        </div>
      </div>

      {askReset && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-3 py-2">
          <span className="text-body text-fg-strong">Quay về template sẽ bỏ câu ngữ cảnh bạn đã viết.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAskReset(false)}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                edit((prev) => ({ ...prev, contextMode: "template", contextDoc: undefined }));
                setAskReset(false);
              }}
            >
              Quay về template
            </Button>
          </div>
        </div>
      )}

      {composer.contextMode === "free" ? (
        /* HAI Provider PHẢI bọc ngoài `BlockEditor`: node view của `brandPill` và
           `brandProfilePill` đều đọc dữ liệu sống qua context, và portal của TipTap
           là con của `EditorContent` trong cây React — xem `BrandPill.tsx`. */
        <BrandColorsProvider
          colors={composer.brandColors}
          onChange={(updater) => edit((prev) => ({ ...prev, brandColors: updater(prev.brandColors) }))}
        >
          <MaybeBrandProvider brand={brand}>
            <div data-prompt-lab="">
              <BlockEditor
                doc={doc}
                mode="free"
                /* Câu NÀY là câu duy nhất có đường đưa ảnh tới contract
                   (`variant.inspo`) — xem option `refs` của `OptionPill`. */
                refs
                /* KHÔNG nạp lại từ ngoài: ở khối này không có thanh công cụ nào sửa
                   `doc` sau lưng editor — pill nằm TRONG câu, và chúng tự cập nhật
                   tài liệu qua `updateAttributes`. */
                resetToken={0}
                placeholder="Viết câu tả cả bộ kit… (gõ / để chèn pill)"
                onChange={(next) => edit((prev) => adoptContextDoc(prev, next))}
              />
            </div>
          </MaybeBrandProvider>
        </BrandColorsProvider>
      ) : (
        /* `text-prose` (20px): CÙNG bậc mà editor của từng thẻ dùng. Trước lượt
           này khối ngữ cảnh là 24px còn nhãn của nó là 13px — hai đầu của thang
           chữ cạnh nhau trong một khối cao 120px. */
        <p className="flex flex-wrap items-center gap-x-2 gap-y-3 text-prose text-fg-strong">
          <span>Bộ kit theme</span>
          <OptionPill
            kind="theme"
            value={composer.themeValue}
            custom={composer.themeCustom}
            attaching={attaching === "theme"}
            onChange={(themeValue) => edit((prev) => ({ ...prev, themeValue }))}
            onCustom={(themeCustom) => edit((prev) => ({ ...prev, themeCustom }))}
            {...(projectId ? { onAttachRef: () => askFile("theme") } : {})}
          />
          {shots("theme").map((ref) => (
            <ContextShot key={ref.path} projectId={projectId ?? null} path={ref.path} onRemove={() => dropRef(ref.path)} />
          ))}

          <span>phong cách</span>
          <OptionPill
            kind="style"
            value={composer.styleId}
            custom={composer.styleCustom}
            attaching={attaching === "style"}
            onChange={(styleId) => edit((prev) => ({ ...prev, styleId }))}
            onCustom={(styleCustom) => edit((prev) => ({ ...prev, styleCustom }))}
            {...(projectId ? { onAttachRef: () => askFile("style") } : {})}
          />
          {shots("style").map((ref) => (
            <ContextShot key={ref.path} projectId={projectId ?? null} path={ref.path} onRemove={() => dropRef(ref.path)} />
          ))}

          <span>, thương hiệu</span>
          {brand ? <BrandPickerPill binding={brand} /> : <span className="text-fg-muted">—</span>}

          <span>với màu</span>
          <BrandColorPills
            colors={composer.brandColors}
            onChange={(updater) => edit((prev) => ({ ...prev, brandColors: updater(prev.brandColors) }))}
          />
          <span>.</span>
        </p>
      )}

      {/* MỘT ô chọn tệp cho cả hai pill — vai trò do `fileRole` quyết định lúc bấm.
          Hai ô là hai chỗ để quên `accept` khi thêm định dạng thứ tư. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void attach(event.target.files);
          event.target.value = "";
        }}
      />

      <p className="mt-3 text-caption text-fg-muted">
        Mọi thẻ bên dưới kế thừa ngữ cảnh này; theme và phong cách thì từng thẻ vẫn ghi đè riêng được.
      </p>
    </section>
  );
}

/**
 * Một tấm ảnh của câu, ở chế độ khuôn.
 *
 * Vỏ là một `<span>` chứ KHÔNG phải `PillButton`: cả pill này không có hành động
 * nào ngoài "bỏ tấm ảnh", mà cái nút bỏ đã nằm ngay trong ruột. Bọc thêm một
 * `<button>` ở ngoài là một vật bấm được mà bấm vào không xảy ra gì — và bàn phím
 * phải Tab qua nó để tới được cái nút thật.
 * Đổi ảnh thì bỏ tấm này rồi đính tấm khác qua mục «Đính ảnh tham chiếu» của pill
 * đứng ngay bên trái; hai cửa cho một việc là hai thứ phải học.
 */
function ContextShot({ projectId, path, onRemove }: { projectId: string | null; path: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-raised px-3 py-1 align-baseline">
      <RefImageBody projectId={projectId} image={{ refName: path.slice("refs/".length), path }} onRemove={onRemove} />
    </span>
  );
}

/** Bọc Provider CHỈ KHI có dây — node view tự nói ra khi thiếu, không cần vỏ giả. */
function MaybeBrandProvider({ brand, children }: { brand?: BrandBinding; children: React.ReactNode }) {
  if (!brand) return <>{children}</>;
  return <BrandBindingProvider value={brand}>{children}</BrandBindingProvider>;
}

/**
 * Nhận câu vừa gõ VÀ rút mọi thứ có cấu trúc về lại `ComposerState`.
 *
 * Cùng lý do với `syncCellFromDoc` của block Bộ UI: pill bấm trong chế độ tự do
 * chỉ đổi tài liệu, nên nếu không chảy ngược thì (1) quay về khuôn là mất lựa
 * chọn vừa bấm, và (2) mọi thẻ bên dưới vẫn kế thừa phong cách CŨ — vì chúng đọc
 * `styleId`, không đọc tài liệu này.
 *
 * ẢNH cũng phải chảy ngược, và vì một lý do nặng hơn: bộ dịch contract đọc
 * `contextRefs` cho CẢ HAI chế độ (xem `ContextRef`). Không rút thì một tấm ảnh
 * đính trong câu tự do sẽ nằm đó, hiện lên màn, và không bao giờ tới máy vẽ.
 * Ảnh do THƯƠNG HIỆU mang tới (`assetId`) được giữ nguyên — chúng không có mặt
 * trong câu, nên đọc câu ra là thấy chúng "đã biến mất".
 */
function adoptContextDoc(prev: ComposerState, next: JSONContent): ComposerState {
  const pills = pillValuesOf(next);
  const custom = pillCustomOf(next);
  return {
    ...prev,
    contextDoc: next,
    themeValue: pills.theme ?? prev.themeValue,
    styleId: pills.style ?? prev.styleId,
    /* Pill còn trong câu mà KHÔNG có chữ tự gõ ⇒ chữ cũ bị bỏ. Đó là chính xác
       điều người dùng vừa làm khi họ xoá trắng ô nhập trong pill. Pill bị xoá
       khỏi câu thì `pills.theme` cũng vắng ⇒ giữ nguyên cả hai. */
    themeCustom: pills.theme === undefined ? prev.themeCustom : (custom.theme ?? ""),
    styleCustom: pills.style === undefined ? prev.styleCustom : (custom.style ?? ""),
    contextRefs: [...prev.contextRefs.filter((ref) => ref.assetId), ...contextRefsOf(next)],
  };
}
