import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SemanticSlider } from "@/features/kit-form/components/SemanticSlider";
import { STYLE_AXES } from "@/features/kit-form/lib/style-phrases";
import { useLibraryFile, useUserLibrary } from "@/lib/hooks";
import { CHROMA_HEX } from "@/lib/types/contract";
import { STYLE_PROMPT_PLACEHOLDER, brandColorPatch, useWorkflowProjectId, useWorkflowStore } from "../lib/model";
import { useWorkflowRefs } from "../lib/refs-sync";
import { RefChips } from "../components/RefChips";
import { SharedReferencePicker } from "../components/SharedReferencePicker";
import { Step } from "./BriefStep";

/** §W2A-3 — ô swatch phải VẼ RA màu đang chọn, và câu chú bên cạnh phải nói cùng
 *  một thứ. Trước đây swatch hardcode `bg-danger` (đỏ) còn câu chú cứng "Magenta
 *  mặc định" — hai chỗ cùng nói sai khi người dùng đổi chroma sang xanh lá. */
const CHROMA_LABEL = { magenta: "Magenta", green: "Xanh lá" } as const;

/** Trần ảnh mỗi ô thả — cùng số mà `ImageDropzone` dùng để cắt một lượt chọn. */
const MAX_REFS = 8;

/**
 * ══ MỘT KHỐI TẢI ẢNH, DÙNG HAI LẦN ═════════════════════════════════════════
 *
 * Chủ sản phẩm nhìn hai khối "Ảnh phong cách" / "Ảnh thương hiệu" và gọi đúng ba lỗi:
 *  ① vùng thả là một băng nét đứt cao lêu nghêu, nút "Chọn ảnh" mỗi khối một chỗ;
 *  ② ảnh đã tải nằm LƠ LỬNG bên ngoài vùng thả (khung `.dropfield` bị `border-0`);
 *  ③ card "Màu nền tách" chiếm nửa hàng mà chỉ có một dòng chữ.
 *
 * Cách chữa gốc của ①: hai khối là MỘT component dùng hai lần. Chép markup ra hai
 * chỗ chính là cách hai khối trôi lệch nhau lần trước — và một component thì không
 * có đường nào lệch được.
 *
 * ② được chữa bằng LƯỚI: vùng thả chính là lưới ảnh, mỗi ảnh một ô, và ô CUỐI là
 * "+ Thêm ảnh" (`ImageDropzone variant="tile"`). Không còn khái niệm "ảnh nằm dưới
 * vùng thả" để mà trôi. Nút ✕ chỉ hiện khi trỏ/tab vào đúng ảnh đó.
 *
 * Logic tải lên KHÔNG đổi một dòng: vẫn `refs.add()` → `POST /api/projects/:id/refs`,
 * vẫn `ImageDropzone` lọc định dạng/dung lượng, vẫn `RefChips` đọc từ đĩa.
 */
function RefUploadBlock({ label, hint, items, ready, fallback, onFiles, onRemove, pending, action, className }: {
  label: string;
  hint: string;
  items: Parameters<typeof RefChips>[0]["items"];
  ready: boolean;
  fallback: readonly { name: string }[];
  onFiles: (files: File[]) => void;
  onRemove: (name: string) => void;
  pending: boolean;
  /** Nút phụ của khối (vd "Chọn từ thư viện"). Vắng ⇒ hàng đầu vẫn giữ nguyên hình. */
  action?: React.ReactNode;
  className?: string;
}) {
  /* Đĩa là sự thật; chưa đọc được đĩa thì đếm theo bản nháp để con số không nhảy về 0
     trong lúc công cụ local chưa chạy (§W3-3). */
  const count = ready ? items.length : fallback.length;
  const full = count >= MAX_REFS;
  return (
    <div className={cn("ref-upload", className)}>
      <div className="ref-upload-head">
        <p className="field-label mb-0">{label}</p>
        <span className="ref-upload-count" aria-label={`${count} trên ${MAX_REFS} ảnh`}>{count}/{MAX_REFS}</span>
        {action}
      </div>
      <div className="dropfield reference-upload">
        <RefChips items={items} ready={ready} fallback={fallback} onRemove={onRemove} />
        {/* Đủ trần thì ô "+ Thêm ảnh" TẮT chứ không biến mất: chỗ trống biến mất là
            người dùng đi tìm xem nút của mình đâu. */}
        <ImageDropzone
          multiple
          variant="tile"
          showLocalPreview={false}
          maxFiles={MAX_REFS}
          disabled={full}
          label={full ? `Đủ ${MAX_REFS} ảnh` : "Thêm ảnh"}
          description={hint}
          state={pending ? "uploading" : "idle"}
          onFiles={onFiles}
        />
      </div>
      <p className="ref-upload-hint">{hint}</p>
    </div>
  );
}

export function StyleStep() {
  const s = useWorkflowStore();
  const projectId = useWorkflowProjectId();
  const refs = useWorkflowRefs(projectId);
  const library = useUserLibrary();
  const libraryFile = useLibraryFile();
  /**
   * §W3-3 — Blob ĐI TỚI ĐĨA. Bản cũ `map(file => ({name: file.name}))` giữ mỗi cái tên
   * rồi vứt Blob, nên ảnh không bao giờ tới `gen.sh`. Bản nháp vẫn ghi tên (tiếng vọng
   * để offline còn thấy gì đó), nhưng sự thật nằm ở `projects/<id>/refs/`.
   */
  const addRefs = (files: FileList | File[] | null, kind: "style" | "brand") => {
    if (!files || files.length === 0) return;
    refs.add(files, kind === "style" ? "inspo" : "brand");
    const names = Array.from(files).map((file) => ({ name: file.name }));
    s.set(kind === "style"
      ? { styleRefs: [...s.styleRefs, ...names.map((n) => ({ ...n, kind: "style" as const }))] }
      : { brandRefs: [...s.brandRefs, ...names] });
  };
  /**
   * §W3-10 — segmented phải ĐỔI KHỐI THẬT. Trước đây chọn "Dùng ảnh tham khảo" mà 7
   * slider + ô mô tả vẫn hiện nguyên, nên hai lựa chọn trông như không khác gì nhau.
   * `studio.html` làm đúng: ẩn/hiện hẳn. `gen.sh:95,130` cũng chỉ dùng MỘT trong hai
   * (`styleMode == "inspo" and inspo` ⇒ bỏ qua `style`), nên hiện cả hai là nói dối.
   */
  const chooseBrand = async (brandId: string) => {
    const brand = library.data?.brands.find(item => item.id === brandId);
    if (!brand) return;
    s.set(brandColorPatch(brand, s));
    const assets = (library.data?.items ?? []).filter(item => brand.assetIds.includes(item.id));
    for (const item of assets) {
      const file = await libraryFile.mutateAsync(item);
      if (item.kind === "mascot") refs.add([file], "character");
      else refs.add([file], item.group === "brand-logo" ? "brand" : "inspo");
    }
  };
  return <Step title="Phong cách" copy="Chọn bằng mô tả hoặc ảnh tham chiếu.">
    {/**
      * P-SWEEP·8 — câu "(chọn 1 trong 2)" đã xoá: có ĐÚNG hai nút cạnh nhau, một cái
      * đang sáng — hình đã nói xong, chữ chỉ dạy lại.
      * P-SWEEP·bảng-5 — "đang chọn" nay là MỘT tín hiệu duy nhất trên toàn app:
      * viền accent 1px + chữ `fg-strong`, KHÔNG phải một chip nền xanh đặc. Trước đây
      * nút được chọn là `primary` (nền accent đặc) nên hai lựa chọn ngang hàng đọc ra
      * "một nút chính + một nút phụ" thay vì "hai lựa chọn, đang ở cái này".
      * `aria-pressed` mang nghĩa cho screen reader, không phụ thuộc màu (§5.8-A3).
      */}
    <section className="rounded-3 border border-line-subtle bg-raised p-4"><p className="field-label">Điền từ thương hiệu đã lưu</p><div className="grid gap-3 sm:grid-cols-2"><Select value={s.brandProfileId ?? "manual"} onValueChange={(value) => value === "manual" ? s.set({ brandProfileId: null }) : void chooseBrand(value)}><SelectTrigger aria-label="Điền từ thương hiệu"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Không dùng thương hiệu đã lưu</SelectItem>{(library.data?.brands ?? []).map(brand=><SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}</SelectContent></Select><p className="text-caption text-fg-muted">Điền sẵn bảng màu và ảnh; mọi nội dung bên dưới vẫn sửa hoặc tải thêm được.</p></div></section>
    {<div className="style-axis-grid">{STYLE_AXES.map((axis) => <SemanticSlider key={axis.id} axis={axis} value={s.styleAxes[axis.id]} onChange={(value) => s.set({ styleAxes: { ...s.styleAxes, [axis.id]: value } })} />)}</div>}
    {/**
      * §W2A-3 — `<Input type="color">` đi qua `input.tsx` (`w-full h-ctl-md`) nên biến
      * thành một THANH ĐỎ BÃO HOÀ rộng 525px + một thanh vàng bên cạnh: vật xấu nhất
      * trong 29 ảnh (ảnh 09). `.color-field` đổi hình thái sang chấm tròn 36px + mã hex
      * mono — cùng lượng thông tin, bằng 1/14 diện tích, và thôi hét màu.
      */}
    <div className="style-fields"><div><Label htmlFor="workflow-primary">Màu chính</Label><div className="color-field"><Input id="workflow-primary" type="color" value={s.primaryColor} onChange={(e) => s.set({ primaryColor: e.target.value })} /><code>{s.primaryColor}</code></div></div><div><Label htmlFor="workflow-secondary">Màu phụ</Label><div className="color-field"><Input id="workflow-secondary" type="color" value={s.secondaryColor} onChange={(e) => s.set({ secondaryColor: e.target.value })} /><code>{s.secondaryColor}</code></div></div><div className="sm:col-span-2"><Label htmlFor="workflow-avoid">Điều không muốn thấy</Label><Input id="workflow-avoid" value={s.styleAvoid} onChange={(e) => s.set({ styleAvoid: e.target.value })} placeholder="Chibi quá trẻ con, viền đen dày" /></div></div>
    {/**
      * §BUG-1 — ô này TRỐNG với bản nháp mới, và gợi ý cách viết bằng `placeholder`.
      * Trước đây nó khởi tạo bằng một câu tả nhận diện của một thương hiệu có thật;
      * người dùng thấy chữ sẵn trong ô thì tưởng đó là mặc định hợp lệ của app và
      * gen luôn. `placeholder` không bao giờ bị gửi đi — chỉ chữ người dùng gõ mới
      * vào contract. Gốc của mặc định nằm ở `model.ts: initialState()`.
      */}
    <><label className="field-label" htmlFor="style-prompt">Mô tả phong cách</label><Textarea id="style-prompt" rows={5} value={s.stylePrompt} placeholder={STYLE_PROMPT_PLACEHOLDER} onChange={(e) => s.set({ stylePrompt: e.target.value, styleMode: "prompt" })} /></>
    {/**
      * §W2B-6 (giữ nguyên luật, đổi hình thái) — thứ hiện ra sau khi thả phải nằm
      * TRONG khung `.dropfield`, không trôi ra ngoài như rác. Bản trước giữ luật ấy
      * bằng cách xếp [vùng thả] rồi [chip ảnh] theo chiều dọc trong cùng một khung —
      * nhưng `.reference-upload` lại gỡ hẳn viền/nền của khung đó, nên trên màn hình
      * chip vẫn đọc ra là "rác trôi dưới một băng nét đứt". Nay khung có viền thật và
      * CHÍNH NÓ là lưới ảnh: mỗi ảnh một ô, ô cuối là "+ Thêm ảnh".
      *
      * `.dropzone` vẫn là `<button>` nên chip (có nút xoá) KHÔNG được nằm trong nó —
      * ràng buộc HTML cũ không đổi, và đó là lý do lưới nằm ở lớp `.dropfield` bọc
      * ngoài chứ không nằm trong chính cái nút.
      */}
    <div className="upload-row">
      <RefUploadBlock
        label="Ảnh phong cách"
        hint="Moodboard, chất liệu và cách thể hiện."
        items={refs.groups.inspo}
        ready={refs.ready}
        fallback={s.styleRefs}
        pending={refs.pending}
        onFiles={(files) => addRefs(files, "style")}
        onRemove={refs.remove}
        action={<SharedReferencePicker group="style" onPick={(file) => addRefs([file], "style")} />}
      />
      <RefUploadBlock
        className="brand-ref"
        label="Ảnh thương hiệu"
        hint="Logo, bảng màu hoặc hình ảnh nhận diện."
        items={refs.groups.brand}
        ready={refs.ready}
        fallback={s.brandRefs}
        pending={refs.pending}
        onFiles={(files) => addRefs(files, "brand")}
        onRemove={refs.remove}
      />
    </div>
    {/**
      * MÀU NỀN TÁCH — MỘT HÀNG, KHÔNG PHẢI MỘT CARD.
      *
      * Trước đây đây là `.ref-note`: một card chiếm trọn cột phải của hàng tải ảnh để
      * chứa đúng một dòng chữ đọc-mà-không-bấm-được — nửa màn hình cho một câu chú.
      * Nay nó là một hàng `.swatch-row` (swatch vuông + chữ) nằm dưới hai khối tải ảnh,
      * và cột phải trả lại cho khối "Ảnh thương hiệu" để hai khối đồng nhất.
      *
      * P-SWEEP·7 — swatch VUÔNG đứng INLINE ngay trước tên màu, không phải đĩa tròn
      * 32px nằm một mình trên một dòng riêng.
      */}
    <p className="swatch-row"><span className="color-swatch" style={{ background: CHROMA_HEX[s.chroma] }} aria-hidden /><span className="text-body text-fg-muted">Màu nền tách: {CHROMA_LABEL[s.chroma]} · có thể chỉnh ở Cài đặt.</span></p>
  </Step>;
}
