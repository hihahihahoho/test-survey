import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estimateRun, rangeMinutes } from "@/features/runs/lib/estimate";
import { STYLE_AXES } from "@/features/kit-form/lib/style-phrases";
import { useWorkflowStore, type KitElement, type WorkflowState } from "../lib/model";
import { useKitsetContract } from "../lib/contract-sync";
import { Step } from "./BriefStep";
import { UI_STEP_LABEL } from "./Stepper";

/**
 * Món SẼ ĐƯỢC VẼ THẬT: đã chọn **và** không phải món `mock`.
 * `wheel-board` mang nhãn "bỏ qua khi vẽ thật" ngay trong catalogue, nên đếm nó vào
 * ước lượng là app tự báo giá cao hơn thứ nó làm (§W1-11).
 */
export function drawableOf(elements: readonly KitElement[]): KitElement[] {
  return elements.filter((e) => e.selected && !e.mock);
}

/** Số lượt sinh ảnh — cùng một số cho thẻ ước lượng, dialog xác nhận và hàng nút. */
const MAX_PARALLEL_JOBS = 4;

/**
 * §W3-4 — DÒNG ƯỚC LƯỢNG, tính theo JOB của contract chứ không theo số element.
 *
 * Bệnh cũ: `selected.length` lượt và `× 2` phút. Sai **mô hình**, không phải sai số
 * học — `gen.sh` tính tiền theo **(phong cách × sheet)**, mà 7 món thật ra pack vào
 * vài sheet. W1 đã sửa phần trung thực (trừ món mock, thêm chữ "ước lượng"); con số
 * đúng phải chờ `buildKitsetContract` — nay đã có.
 *
 * `estimateRun` (`features/runs/lib/estimate.ts`) là nguồn duy nhất của hằng số:
 * `QUOTA_PER_JOB=[3,5]`, `SECONDS_PER_JOB=[90,150]`, và biết chia sóng theo `maxJobs`.
 * Hiển thị dạng KHOẢNG theo đúng `TRUTH.ESTIMATE_RANGE`.
 */
export function estimateLine(jobCount: number | null, fallbackElements: number): string {
  if (jobCount === null) {
    // Không có contract (bước render cô lập) — nói theo thứ biết chắc, không bịa số job.
    return `${fallbackElements} thành phần · ước lượng, có thể lệch`;
  }
  if (jobCount === 0) return "Chưa có thành phần nào · 0 lượt";
  const est = estimateRun(jobCount, MAX_PARALLEL_JOBS);
  return `${jobCount} lượt · ${rangeMinutes(est.seconds)} (ước lượng, có thể lệch)`;
}

/**
 * §W3-10 — recap phong cách liệt kê **các trục ĐÃ LỆCH khỏi mặc định**, kèm tên trục.
 * Trục còn ở nấc 4 (giữa) thì im lặng: nói "Trẻ trung 4/7" cho một trục chưa ai đụng
 * vào là làm loãng đúng thứ người ta vừa chỉnh.
 */
export function axisDigest(axes: Record<string, number>): string {
  const moved = STYLE_AXES.filter((a) => (axes[a.id] ?? 4) !== 4).map((a) => {
    const v = axes[a.id]!;
    return `${v < 4 ? a.left : a.right} ${v}/7`;
  });
  return moved.length === 0 ? "7 trục còn ở mặc định" : moved.join(" · ");
}

/** Dòng chính của thẻ recap Mascot. Tách ra để kiểm được mà không phải dựng cả bước 5. */
export function mascotRecapValue(s: Pick<WorkflowState, "mascotEnabled" | "mascotName" | "mascots">): string {
  if (!s.mascotEnabled) return "Không dùng";
  if (s.mascots.length > 1) return `${s.mascots.length} nhân vật`;
  return s.mascots[0]?.name.trim() || s.mascotName.trim() || "Đã bật";
}

export function ReviewStep() {
  const s = useWorkflowStore();
  const sync = useKitsetContract();
  const selected = s.elements.filter((e) => e.selected);
  const drawable = drawableOf(s.elements);
  const skipped = selected.length - drawable.length;
  const styleDetail = `${axisDigest(s.styleAxes)} · Màu ${s.primaryColor} / ${s.secondaryColor}${s.styleAvoid ? ` · Tránh: ${s.styleAvoid}` : ""}`;
  const sheets = sync?.contract.sheets.length ?? null;
  return (
    <Step title="Kiểm tra" copy="Xem lại nội dung và số lượt trước khi tạo ảnh.">
      <div className="recap-grid">
        <Recap title="Dự án" value={s.kitName} detail={s.campaign || s.brief || "Chưa có mô tả"} />
        <Recap title="Phong cách" value={s.stylePrompt || "Chưa mô tả"} detail={styleDetail} />
        <Recap
          title={UI_STEP_LABEL}
          value={`${drawable.length} thành phần`}
          detail={[
            sheets === null ? "Chưa tính số sheet" : `${sheets} sheet`,
            skipped ? `${skipped} thành phần chưa có bộ khung` : null,
          ].filter(Boolean).join(" · ")}
        />
        {/* UI-FIX §3b — bước Mascot nay là DANH SÁCH, nên recap phải đếm được. Nói tên
            khi có đúng một con (thông tin nhiều hơn), nói số khi có nhiều. */}
        <Recap
          title="Mascot"
          value={mascotRecapValue(s)}
          detail={s.mascotEnabled ? `${s.mascotPoses.length} dáng · ${s.mascots.filter((m) => m.ref).length}/${Math.max(s.mascots.length, 1)} có ảnh mẫu` : "Không có tấm dáng nào"}
        />
      </div>
      {/* Nút chính KHÔNG ở đây — nó ở hàng nút cuối trang, đúng chỗ 4 bước trước đã dạy (§W1-10). */}
      <div className="review-estimate">
        <div>
          {/* P-SWEEP·8 — nhãn cũ là "Ước lượng trước khi vẽ", và ngay dưới nó dòng số
              đã tự ghi "(ước lượng, có thể lệch)": nói chữ "ước lượng" HAI LẦN trong
              6cm. Dòng số là chỗ phải giữ nguyên văn (luật §5.5 chống nói dối, có
              cổng canh), nên nhãn là cái nhường chỗ. */}
          <span className="eyebrow">Lượt tạo ảnh</span>
          <strong>{estimateLine(sync?.jobCount ?? null, drawable.length)}</strong>
        </div>
      </div>
    </Step>
  );
}

/**
 * Cửa sổ xác nhận Vẽ — mở từ hàng nút cuối trang.
 *
 * §W1-5 (vế bệnh nhân): thân dialog chỉ có **một dòng chữ**, nên nó KHÔNG được nằm trong
 * `<DialogBody>`. `DialogBody` là vùng cuộn; bọc một dòng vào đó rồi kẹp giữa hai hairline
 * full-bleed thì đọc ra một ô input bị khoá, không phải một câu trấn an.
 * Câu đó nay là `<p className="dialog-supporting">` nằm TRONG `<DialogHeader>`, ngay dưới
 * `<DialogDescription>`. Vế cái bẫy được sửa ở `components/ui/dialog.tsx`.
 */
export function DrawConfirmDialog({ open, onOpenChange, onConfirm, pending = false }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm?: () => void; pending?: boolean }) {
  const s = useWorkflowStore();
  const sync = useKitsetContract();
  const drawable = drawableOf(s.elements);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo ảnh?</DialogTitle>
          <DialogDescription>{drawable.length} thành phần · {estimateLine(sync?.jobCount ?? null, drawable.length)}.</DialogDescription>
          <p className="dialog-supporting">Ảnh cũ vẫn được giữ lại.</p>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            <ArrowLeft aria-hidden />Xem lại
          </Button>
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            <Sparkles aria-hidden />{pending ? "Đang bắt đầu…" : "Tạo ảnh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Recap({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="recap-card">
      <span className="eyebrow">{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
