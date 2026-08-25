import * as React from "react";
import { AlertTriangle, Eye, Pencil, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyableCode } from "@/components/common/CopyableCode";
import { usePromptPreview } from "@/lib/hooks";
import type { PromptPreviewJob } from "@/lib/types/api";
import type { Contract } from "@/lib/types/contract";
import { useWorkflowProjectId, useWorkflowStore } from "../lib/model";
import { useKitsetContract } from "../lib/contract-sync";
import { isTweaked, promptPreviewProblem, sheetTitle } from "../lib/prompt-studio";

/**
 * PROMPT STUDIO — cửa duy nhất người dùng đọc được NGUYÊN VĂN chữ sẽ gửi cho máy vẽ,
 * và sửa được nó, **trước khi tiêu một lượt nào**.
 *
 * ══ VÌ SAO PANEL NÀY TỒN TẠI ═════════════════════════════════════════════════
 * Bốn bước trước là bốn lớp phiên dịch: thanh trượt → cụm tiếng Anh, món trong kho →
 * `spec` vật liệu, dáng → câu `POSE_SPEC`. Người dùng chọn "trẻ trung 6/7" rồi nhận về
 * một tấm ảnh, và giữa hai đầu ấy không có chỗ nào nhìn được. Khi ảnh ra sai, thứ duy
 * nhất họ chỉnh được là… kéo lại thanh trượt và trả thêm một lượt nữa để đoán.
 *
 * ══ HAI MỨC CAN THIỆP, CỐ Ý KHÔNG NGANG NHAU ═════════════════════════════════
 *  · "Chỉ đạo riêng cho tấm này" — ĐƯỜNG CHÍNH: một câu, cộng vào prompt, mọi thiết
 *    lập của bốn bước trước vẫn chạy. Ô input một dòng, không cần mở gì cả.
 *  · "Tự soạn toàn bộ prompt"    — nằm sau `<details>` và có cảnh báo, vì nó VÔ HIỆU
 *    HOÁ phong cách, màu, vật liệu, nhân vật của riêng tấm ấy. Ai chưa hiểu điều đó mà
 *    lỡ dùng thì sẽ ngồi sửa câu chữ mãi và không hiểu vì sao ảnh không đổi.
 *
 * ══ KHÔNG TIÊU MỘT LƯỢT NÀO ══════════════════════════════════════════════════
 * `POST /api/projects/:id/prompt-preview` chạy engine ở chế độ chỉ-lắp-prompt và dừng
 * TRƯỚC vòng gọi máy vẽ (`agent/routes/contract.mjs:85`). Đây là I/O đĩa, không phải
 * một lượt sinh ảnh — panel này không đi qua cửa tiêu quota nào.
 */
export function PromptStudio() {
  const s = useWorkflowStore();
  const projectId = useWorkflowProjectId();
  const sync = useKitsetContract();
  const preview = usePromptPreview(projectId);

  /* Không có contract (bước render CÔ LẬP trong test, hoặc contract chưa nạp xong) thì
     KHÔNG dựng panel: cả giá trị của nó là nói đúng chữ sẽ gửi, mà lúc này chưa có gì
     để nói. Nút xám kèm một câu hứa suông còn tệ hơn không có nút. */
  if (!sync) return null;

  const jobs = preview.data?.jobs ?? [];
  const problem = preview.error ? promptPreviewProblem(preview.error) : null;

  return (
    <section className="prompt-studio" aria-labelledby="prompt-studio-title">
      <div className="prompt-studio-head">
        <div>
          <span className="eyebrow">Prompt Studio</span>
          <strong id="prompt-studio-title">Xem đúng chữ sẽ gửi cho máy vẽ</strong>
          <p>Xem trước không tốn lượt nào. Sửa ở đây chỉ ảnh hưởng tấm bạn chọn.</p>
        </div>
        <Button
          variant="secondary"
          disabled={preview.isPending}
          onClick={() => preview.mutate(sync.contract)}
        >
          <Eye aria-hidden />
          {preview.isPending ? "Đang dựng prompt…" : jobs.length > 0 ? "Xem lại" : "Xem prompt sẽ gửi"}
        </Button>
      </div>

      {/* §3.9 luật ①: câu đời thường ở thân, chuỗi kỹ thuật nằm trong panel gập. */}
      {problem && (
        <div role="alert" className="prompt-studio-error">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-strong">{problem.message}</p>
            {problem.details.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-label text-fg-muted">Chi tiết cho lập trình viên</summary>
                <CopyableCode className="mt-2" value={problem.details.join("\n")} label="Chi tiết lỗi xem trước prompt" />
              </details>
            )}
          </div>
        </div>
      )}

      {/* Tấm engine không dựng nổi prompt phải được NÓI RA. Im lặng bỏ bớt một tấm là
          để người dùng tin bản xem trước này đủ, rồi bấm vẽ. */}
      {(preview.data?.missing.length ?? 0) > 0 && (
        <p className="prompt-studio-missing">
          Chưa xem trước được {preview.data!.missing.length} tấm: {preview.data!.missing.join(", ")}
        </p>
      )}

      {jobs.length > 0 && (
        <ul className="prompt-studio-list" role="list">
          {jobs.map((job) => (
            <li key={job.job}>
              <JobRow
                job={job}
                variantLabel={variantLabelOf(sync.contract, job.variant)}
                tweak={s.sheetPrompts[job.sheet]}
                onDirective={(text) => s.setSheetPrompt(job.sheet, { directive: text })}
                onOverride={(text) => s.setSheetPrompt(job.sheet, { promptOverride: text })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tên phong cách người dùng đặt; không tra được thì nói id — không bịa tên. */
function variantLabelOf(contract: Contract, variantId: string): string {
  const list = contract.variants ?? contract.styles ?? [];
  const hit = list.find((v) => v.id === variantId);
  return hit?.vi?.trim() || variantId;
}

/**
 * Một tấm trong danh sách. Gập lại theo mặc định: một bộ kit đầy đủ có hơn chục tấm,
 * mở hết ra là mười khối chữ dài xếp chồng và không đọc được cái nào.
 */
function JobRow({
  job, variantLabel, tweak, onDirective, onOverride,
}: {
  job: PromptPreviewJob;
  variantLabel: string;
  tweak: { directive?: string; promptOverride?: string } | undefined;
  onDirective: (text: string) => void;
  onOverride: (text: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const override = tweak?.promptOverride ?? "";
  /**
   * Bản nháp CỤC BỘ cho ô tự soạn — cố ý không ghi thẳng vào store theo từng phím.
   * Hai lý do, cả hai đều đo được: (a) mỗi phím gõ sẽ dựng lại contract và châm một
   * nhịp autosave ghi đĩa cho một prompt dài; (b) "tự soạn trọn prompt" là quyết định
   * phải CỐ Ý, nên nó cần một cú bấm, giống mọi hành động không hoàn tác dễ khác.
   * Prefill = bản đang dùng, không thì chính prompt engine vừa dựng — người ta sửa
   * một bản có sẵn, không viết lại từ trang trắng.
   */
  const [draft, setDraft] = React.useState(() => override || job.prompt);
  const tweaked = isTweaked(tweak);
  const bodyId = `prompt-studio-body-${job.job}`;

  return (
    <article className="prompt-studio-card">
      {/* `aria-label` viết tay, không để trình duyệt tự ghép: ruột nút là ba mẩu nằm sát
          nhau không dấu cách (`Nền` `nen` `Dự án mới`), nên tên tự tính ra dính liền
          ("Nềnnen…") — vừa khó nghe, vừa làm mọi phép tìm theo id tấm bắt nhầm hàng. */}
      <button
        type="button"
        className="prompt-studio-row"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${sheetTitle(job.sheet)} · ${job.sheet} · ${variantLabel}${tweaked ? " · đã chỉnh" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <strong>{sheetTitle(job.sheet)}</strong>
          <small>
            <code>{job.sheet}</code> · {variantLabel}
          </small>
        </span>
        {tweaked && (
          <Badge tone="accent">
            <Pencil aria-hidden />đã chỉnh
          </Badge>
        )}
      </button>

      {open && (
        <div id={bodyId} className="prompt-studio-body">
          <CopyableCode
            className="max-h-72 overflow-y-auto"
            value={job.prompt}
            label={`Prompt của tấm ${job.sheet}`}
          />

          {job.attachments.length > 0 && (
            <p className="prompt-studio-atts">
              <span className="eyebrow">Đính kèm</span>
              {job.attachments.map((a) => (
                <span key={a} className="prompt-studio-chip">{a}</span>
              ))}
            </p>
          )}

          <div className="prompt-studio-field">
            <Label htmlFor={`directive-${job.job}`}>Chỉ đạo riêng cho sheet này</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`directive-${job.job}`}
                value={tweak?.directive ?? ""}
                placeholder="Ví dụ: nút bấm dày hơn, viền vàng đậm"
                onChange={(e) => onDirective(e.target.value)}
              />
              {(tweak?.directive ?? "") !== "" && (
                <Button variant="ghost" size="sm" onClick={() => onDirective("")}>
                  <RotateCcw aria-hidden />Khôi phục
                </Button>
              )}
            </div>
            <small className="text-caption text-fg-muted">Câu này được cộng thêm vào prompt; mọi thiết lập của tấm vẫn giữ.</small>
          </div>

          <details className="advanced-fields">
            <summary>Nâng cao: tự soạn toàn bộ prompt</summary>
            <p className="prompt-studio-warn" role="note">
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              Tự soạn = BỎ QUA mọi thiết lập phong cách và thành phần của riêng tấm này. Chỉ dòng khổ giấy
              (<code>Canvas orientation:</code>) được giữ lại.
            </p>
            <Textarea
              id={`override-${job.job}`}
              aria-label={`Prompt tự soạn cho tấm ${job.sheet}`}
              rows={10}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOverride(draft)}>
                Dùng prompt tự soạn
              </Button>
              {override !== "" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { onOverride(""); setDraft(job.prompt); }}
                >
                  <RotateCcw aria-hidden />Bỏ prompt tự soạn
                </Button>
              )}
              {override !== "" && <span className="text-caption text-on-tint-warn">Tấm này đang dùng prompt tự soạn.</span>}
            </div>
          </details>
        </div>
      )}
    </article>
  );
}
