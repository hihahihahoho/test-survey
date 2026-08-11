import * as React from "react";
import { RefreshCw, Copy, Check, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonPreview } from "@/features/design/preview";
import { useSliceRun } from "@/features/runs/lib/useSliceRun";
import { useGenerateRun } from "@/features/runs";
import { toast } from "@/components/ui/sonner";
import { useProject, useRuns } from "@/lib/hooks";
import { settingsDirty, useWorkflowProjectId, useWorkflowStore, versionLabel } from "../lib/model";
import { useKitsetContract } from "../lib/contract-sync";
import { RunPanel } from "../components/RunPanel";
import { Step } from "./BriefStep";

export function ResultStep() {
  const s = useWorkflowStore();
  const projectId = useWorkflowProjectId();
  const sync = useKitsetContract();
  const project = useProject(projectId);
  const latestRun = useRuns(projectId, 1).data?.items?.[0];
  const [copied, setCopied] = React.useState(false);
  const [sheetIdx, setSheetIdx] = React.useState(0);

  const active = s.versions.find((v) => v.id === s.activeVersion) ?? s.versions.at(-1);
  const dirty = settingsDirty(active, s);

  /**
   * §W3-8 — ô "Ngưỡng tách ảnh" đã có từ lâu nhưng KHÔNG có đường nào chạy lại slice:
   * chỉnh xong không làm được gì. `rawPresent` của agent là câu trả lời thật cho
   * "đã có ảnh để cắt chưa" — khoá nút kèm lý do thay vì để bấm rồi lỗi.
   */
  const rawPresent = project.data?.stats?.rawPresent ?? 0;
  const slice = useSliceRun(projectId, { hasRaw: rawPresent > 0 });
  const generate = useGenerateRun(projectId);

  React.useEffect(() => {
    if (!active || active.status !== "rendering" || !active.runId || !latestRun || latestRun.id !== active.runId) return;
    if (latestRun.status === "done") s.markVersionStatus(active.id, "ready");
    else if (["done-with-errors", "cancelled", "env-failed"].includes(latestRun.status)) {
      s.markVersionStatus(active.id, "failed");
    }
  }, [active?.id, active?.status, latestRun?.id, latestRun?.status]);

  const copy = () => {
    void navigator.clipboard?.writeText(s.stylePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * §W3-6 — PREVIEW THẬT.
   *
   * Bản cũ là `<div className="preview-wheel">◌</div>` + `<div>QUAY</div>`: một vòng
   * tròn và chữ QUAY vẽ cứng, **không đổi dù kitset có gì**. Nay khung xương dựng từ
   * chính contract của bước ③ bằng `SkeletonPreview` — cùng component mà trình soạn
   * contract dùng, nên cái người dùng thấy ở đây đúng bằng cái `skeleton.py` sẽ vẽ ra
   * làm ảnh ref cho `gen.sh`. Đổi kitset ở bước ③ ⇒ hình ở đây đổi theo. **0 đồng**:
   * render client, không một request nào.
   */
  const sheets = sync?.contract.sheets ?? [];
  const shown = sheets[Math.min(sheetIdx, Math.max(0, sheets.length - 1))] ?? null;

  return (
    <Step title="Ảnh đã tạo" copy="Xem kết quả hoặc tạo lại sau khi chỉnh sửa.">
      <div className="result-toolbar">
        <div className="w-64">
          <label className="field-label" htmlFor="version">Phiên bản</label>
          <Select value={s.activeVersion} onValueChange={(v) => s.restoreVersion(v)}>
            <SelectTrigger id="version"><SelectValue placeholder="Chưa có phiên bản" /></SelectTrigger>
            <SelectContent>
              {/* §W3-9 — nhãn phải ĐỌC ĐƯỢC: "v2 · 14:32 · đổi mô tả phong cách".
                  Trước đây cả dropdown chỉ có "v1", "v2" nên hai phiên bản không phân biệt được. */}
              {s.versions.map((v, i) => (
                <SelectItem key={v.id} value={v.id}>{versionLabel(v, s.versions[i - 1])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="secondary" disabled={generate.isPending || !sync} onClick={() => {
          if (!sync) return;
          void (async () => {
            const saved = await sync.saveNow();
            if (!saved) { toast.error("Chưa lưu được thay đổi nên chưa thể tạo lại."); return; }
            try {
              const run = await generate.startContract(sync.contract);
              s.addVersion(s.stylePrompt, "rendering", run.runId);
              toast.success("Đã bắt đầu tạo phiên bản mới.");
            } catch { toast.error("Chưa tạo lại được. Kiểm tra công cụ tạo ảnh."); }
          })();
        }}><RefreshCw aria-hidden />{generate.isPending ? "Đang bắt đầu…" : "Tạo lại"}</Button>
        <Button variant="ghost" onClick={copy}>{copied ? <><Check aria-hidden />Đã chép</> : <><Copy aria-hidden />Chép mô tả</>}</Button>
      </div>

      <div className="result-layout">
        <div className="result-preview">
          {/* P-SWEEP·2 — eyebrow rút còn hai chữ. Cùng khung hình này từng xướng tên
              một phiên bản BỐN lần: pill "1 phiên bản" ở hero → `<Select>` "v1 · 20:32
              · bản nháp" → eyebrow lặp y hệt chuỗi đó → câu chú cuối panel lặp lần
              thứ tư. `<Select>` là NGUỒN DUY NHẤT (nó vừa hiện vừa cho đổi); ba chỗ
              còn lại chỉ đọc lại nó. Ba chỗ kia đã gỡ, đây là chỗ thứ hai. */}
          <span className="eyebrow">Bộ khung</span>
          {shown ? (
            <>
              <div className="preview-art">
                <SkeletonPreview sheet={shown} className="size-full" />
              </div>
              {sheets.length > 1 && (
                <div className="preview-sheets" role="tablist" aria-label={`Chọn tấm để xem · ${sheets.length} tấm`}>
                  {sheets.map((sh, i) => (
                    /* P-SWEEP·bảng-5 — tab tấm đang xem dùng CÙNG tín hiệu "đang chọn"
                       với mọi màn: viền accent + chữ đậm, không nền accent đặc. */
                    <Button
                      key={sh.id}
                      size="sm"
                      role="tab"
                      aria-selected={i === sheetIdx}
                      variant="secondary"
                      className={i === sheetIdx ? "border-accent text-fg-strong" : undefined}
                      onClick={() => setSheetIdx(i)}
                    >
                      {sh.id}
                    </Button>
                  ))}
                </div>
              )}
              {/* P-SWEEP·8 — câu "N tấm · khung xương dựng từ kitset của bạn, đúng cái
                  máy sẽ dùng làm ảnh mẫu khi vẽ." ĐÃ XOÁ: người dùng đang NHÌN chính
                  khung xương đó, ngay dưới nhãn ghi "Khung xương", với hàng nút chọn
                  tấm bên cạnh. Câu này dạy lại đúng thứ hình vừa nói. Số tấm chuyển
                  vào `aria-label` của hàng chọn tấm để screen reader không mất gì. */}
            </>
          ) : (
            <>
              <div className="preview-art"><p className="muted">Chưa chọn thành phần UI nào.</p></div>
              <p className="muted">Quay lại Bộ khung UI để chọn ít nhất một mục.</p>
            </>
          )}
        </div>

        <aside className="settings-card">
          <div className="flex items-center justify-between gap-3">
            {/* P-SWEEP·3 — chuỗi gõ HOA bằng tay: `.eyebrow` đã bỏ `uppercase`, nhưng
                chữ hoa nằm trong chính literal thì CSS không cứu được. */}
            <span className="eyebrow">Chỉnh sửa</span>
            {dirty && <span className="status-pill">Cần tạo lại</span>}
          </div>
          <label className="field-label" htmlFor="result-prompt">Mô tả phong cách</label>
          <Textarea id="result-prompt" rows={4} value={s.stylePrompt} onChange={(e) => s.set({ stylePrompt: e.target.value })} />
          <label className="field-label" htmlFor="result-kitset">Mô tả bộ khung</label>
          {/* §W2B-6 — `truncate`: ở mobile ô này từng cắt NGANG GIỮA CHỮ (ảnh 29). */}
          <Input id="result-kitset" className="truncate" value={s.kitsetSummary} onChange={(e) => s.set({ kitsetSummary: e.target.value })} />
          <label className="field-label" htmlFor="result-mascot">Mascot</label>
          <Input id="result-mascot" value={s.mascotEnabled ? s.mascotName : "Không dùng"} onChange={(e) => s.set({ mascotName: e.target.value, mascotEnabled: true })} />

          {/**
           * §W2B-7 — "Ngưỡng tách ảnh" (số 1–255) và "Màu nền tách" là từ vựng của
           * chroma-key, không phải của người làm mini-game. Gập vào một khối "Nâng
           * cao" để đường chính chỉ còn thứ ai cũng hiểu.
           *
           * ⚠️ ĐỔI ĐIỀU KIỆN NGHIỆM THU của W3 #11: nút "Cắt lại" nay nằm SAU một
           * cú bấm "Nâng cao". Nó vẫn ở ngay cạnh ô ngưỡng — hai thứ đi cùng nhau —
           * và vẫn khoá kèm lý do khi chưa có ảnh raw. Đội mắt phải mở khối này
           * trước khi chụp ảnh `17`.
           */}
          <details className="advanced-fields">
            <summary>Nâng cao</summary>
            <label className="field-label" htmlFor="result-chroma">Màu nền tách</label>
            <Select value={s.chroma} onValueChange={(v) => s.set({ chroma: v as "magenta" | "green" })}>
              <SelectTrigger id="result-chroma"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="magenta">Magenta</SelectItem>
                <SelectItem value="green">Xanh lá</SelectItem>
              </SelectContent>
            </Select>
            <label className="field-label" htmlFor="result-threshold">Ngưỡng tách ảnh</label>
            <Input id="result-threshold" type="number" min={1} max={255} value={s.sliceThreshold} onChange={(e) => s.set({ sliceThreshold: Number(e.target.value) || 1 })} />
            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={rawPresent === 0 || slice.pending}
              title={rawPresent === 0 ? "Mở sau khi dự án có ảnh" : "Cắt lại bằng ngưỡng hiện tại · không tiêu lượt"}
              onClick={() => slice.run()}
            >
              <Scissors aria-hidden />{slice.pending ? "Đang cắt…" : "Cắt lại"}
            </Button>
          </details>
          {/* P-SWEEP·2 — câu "Thay đổi sẽ tạo phiên bản mới, không ghi đè v1 · 20:32 ·
              bản nháp." ĐÃ XOÁ. Đây là lần thứ TƯ cùng một chuỗi ký tự xuất hiện trong
              một khung hình, và nó dạy lại thứ nút "Render lại" ngay trên đầu panel
              vừa nói bằng hành động. */}
        </aside>
      </div>
      {/* §W3-9a — bấm "Cắt lại" xong phải NHÌN THẤY tiến trình, không mù. */}
      <RunPanel projectId={projectId} />
    </Step>
  );
}
