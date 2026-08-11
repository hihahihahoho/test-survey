import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SemanticSlider } from "@/features/kit-form/components/SemanticSlider";
import { STYLE_AXES } from "@/features/kit-form/lib/style-phrases";
import { CHROMA_HEX } from "@/lib/types/contract";
import { useWorkflowProjectId, useWorkflowStore } from "../lib/model";
import { useWorkflowRefs } from "../lib/refs-sync";
import { RefChips } from "../components/RefChips";
import { SharedReferencePicker } from "../components/SharedReferencePicker";
import { SegChoice } from "../components/SegChoice";
import { Step } from "./BriefStep";

/** §W2A-3 — ô swatch phải VẼ RA màu đang chọn, và câu chú bên cạnh phải nói cùng
 *  một thứ. Trước đây swatch hardcode `bg-danger` (đỏ) còn câu chú cứng "Magenta
 *  mặc định" — hai chỗ cùng nói sai khi người dùng đổi chroma sang xanh lá. */
const CHROMA_LABEL = { magenta: "Magenta", green: "Xanh lá" } as const;

export function StyleStep() {
  const s = useWorkflowStore();
  const projectId = useWorkflowProjectId();
  const refs = useWorkflowRefs(projectId);
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
  const byPrompt = s.styleMode === "prompt";
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
    <div className="segmented"><SegChoice on={byPrompt} onClick={() => s.set({ styleMode: "prompt" })}>Gõ mô tả</SegChoice><SegChoice on={!byPrompt} onClick={() => s.set({ styleMode: "inspo" })}>Dùng ảnh tham khảo</SegChoice></div>
    {byPrompt && <div className="style-axis-grid">{STYLE_AXES.map((axis) => <SemanticSlider key={axis.id} axis={axis} value={s.styleAxes[axis.id]} onChange={(value) => s.set({ styleAxes: { ...s.styleAxes, [axis.id]: value } })} />)}</div>}
    {/**
      * §W2A-3 — `<Input type="color">` đi qua `input.tsx` (`w-full h-ctl-md`) nên biến
      * thành một THANH ĐỎ BÃO HOÀ rộng 525px + một thanh vàng bên cạnh: vật xấu nhất
      * trong 29 ảnh (ảnh 09). `.color-field` đổi hình thái sang chấm tròn 36px + mã hex
      * mono — cùng lượng thông tin, bằng 1/14 diện tích, và thôi hét màu.
      */}
    <div className="style-fields"><div><Label htmlFor="workflow-primary">Màu chính</Label><div className="color-field"><Input id="workflow-primary" type="color" value={s.primaryColor} onChange={(e) => s.set({ primaryColor: e.target.value })} /><code>{s.primaryColor}</code></div></div><div><Label htmlFor="workflow-secondary">Màu phụ</Label><div className="color-field"><Input id="workflow-secondary" type="color" value={s.secondaryColor} onChange={(e) => s.set({ secondaryColor: e.target.value })} /><code>{s.secondaryColor}</code></div></div><div className="sm:col-span-2"><Label htmlFor="workflow-avoid">Điều không muốn thấy</Label><Input id="workflow-avoid" value={s.styleAvoid} onChange={(e) => s.set({ styleAvoid: e.target.value })} placeholder="Chibi quá trẻ con, viền đen dày" /></div></div>
    {byPrompt && <><label className="field-label" htmlFor="style-prompt">Mô tả phong cách</label><Textarea id="style-prompt" rows={5} value={s.stylePrompt} onChange={(e) => s.set({ stylePrompt: e.target.value })} /></>}
    {/**
      * §W2B-6 — `.dropfield` bọc NGOÀI: chip ảnh nay nằm TRONG khung của vùng thả
      * thay vì trôi ra dưới nó như rác (ảnh 09/12). Không nhét chip vào trong
      * `.dropzone` được vì `.dropzone` là `<button>` còn chip mang nút xoá —
      * `<button>` lồng `<button>` là HTML hỏng. Xem khối chú thích ở globals.css.
      */}
    <div className="upload-row"><div><div className="mb-2 flex items-center justify-between gap-3"><p className="field-label mb-0">Ảnh phong cách{!byPrompt && " · đang sử dụng"}</p><SharedReferencePicker group="style" onPick={(file) => addRefs([file], "style")} /></div><div className="dropfield"><ImageDropzone multiple label="Kéo ảnh phong cách vào đây" description="Moodboard, chất liệu và cách thể hiện." state={refs.pending ? "uploading" : refs.groups.inspo.length ? "done" : "idle"} onFiles={(files) => addRefs(files, "style")} /><RefChips items={refs.groups.inspo} ready={refs.ready} fallback={s.styleRefs} onRemove={refs.remove} /></div></div><div className="ref-note"><p className="field-label">Màu nền tách</p>{/* P-SWEEP·7 — swatch VUÔNG đứng INLINE ngay trước tên màu. Bản cũ là đĩa tròn
      32px có `mb-3`, nằm một mình trên một dòng riêng ⇒ lệch baseline với chữ bên
      cạnh và là hình tròn duy nhất giữa một trang toàn chữ nhật + hairline. */}<span className="swatch-row"><span className="color-swatch" style={{ background: CHROMA_HEX[s.chroma] }} aria-hidden /><span className="text-body text-fg-muted">{CHROMA_LABEL[s.chroma]} · có thể chỉnh ở bước Xem kết quả.</span></span></div></div>
    <div className="brand-ref"><p className="field-label">Ảnh thương hiệu</p><div className="dropfield"><ImageDropzone multiple label="Kéo ảnh thương hiệu vào đây" description="Logo, bảng màu hoặc hình ảnh nhận diện." state={refs.pending ? "uploading" : refs.groups.brand.length ? "done" : "idle"} onFiles={(files) => addRefs(files, "brand")} /><RefChips items={refs.groups.brand} ready={refs.ready} fallback={s.brandRefs} onRemove={refs.remove} /></div></div>
  </Step>;
}
