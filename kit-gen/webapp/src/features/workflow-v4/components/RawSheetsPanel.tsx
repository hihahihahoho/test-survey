import * as React from "react";
import { AlertCircle, Check, Clock, Image as ImageIcon, Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KitImage } from "@/features/kit/components/KitImage";
import { diagnosisText } from "@/features/runs/lib/format";
import { GenerateDialog } from "@/features/runs";
import type { Contract, JobStatusValue } from "@/lib/types";
import { useRun, useRuns, useRunStream } from "@/lib/hooks";
import {
  generatedRuns, groupAnchorId, groupLabel, isRunLive, jobsForGroup, sheetLabel,
  type GeneratedResultItem, type ResultCategory, type ResultGroup,
} from "../lib/generated-results";

/**
 * ══ "ẢNH GỐC" — SHEET THÔ CỦA TỪNG LƯỢT TẠO ═════════════════════════════════
 *
 * Tách khỏi `GeneratedResults` vì nay nó có BA nơi gọi, không phải một:
 *  · tab "Ảnh gốc" của trang **Ảnh đã tạo** (cả sáu nhóm, xếp thành khối cuộn dọc);
 *  · tab "Ảnh gốc" của trang **Skeleton UI** (mọi nhóm TRỪ mascot);
 *  · tab "Ảnh gốc" của trang **Mascot** (chỉ nhóm mascot).
 * Ba bản sao của cùng khối này là ba cơ hội để trạng thái sheet ("đang chờ / đang tạo /
 * đã dừng") lệch nhau giữa các trang, nên nó là MỘT component nhận `category`.
 *
 * Ảnh ở đây còn nguyên nền chroma: đó là ảnh TRUNG GIAN của pipeline, dùng để đối
 * chiếu khi ô cắt ra trông sai — không phải sản phẩm. Trạng thái từng sheet đọc theo
 * VÒNG ĐỜI THẬT của run (`resultStateOf`), không đọc theo "có file hay không": vừa bấm
 * Tạo ảnh mà mọi thẻ đã đỏ "Chưa tạo được ảnh" là lời nói dối, không phải trạng thái.
 */

/** Một câu duy nhất cho MỌI nút vẽ lại của trang — không để ba chỗ nói ba kiểu. */
const REGEN_HINT = "Vẽ lại ảnh bằng AI — tiêu lượt tạo. Có bước xác nhận trước khi chạy.";

const STATE_UI = {
  queued: { icon: Clock, tone: "text-fg-muted", label: "Đang chờ" },
  running: { icon: Loader2, tone: "text-accent-text", label: "Đang tạo" },
  done: { icon: Check, tone: "text-ok", label: "Xong" },
  failed: { icon: AlertCircle, tone: "text-danger", label: "Lỗi" },
  cancelled: { icon: Square, tone: "text-warn", label: "Đã dừng" },
} as const;

export function RawSheetsPanel({ projectId, contract, jobStates, category = "all", exclude, readOnly = false, emptyCopy }: {
  projectId: string;
  contract: Contract | null;
  jobStates: Record<string, JobStatusValue>;
  category?: ResultGroup;
  /**
   * Nhóm bị LOẠI khỏi khung nhìn. Trang Skeleton UI cần đúng "mọi tấm trừ mascot" —
   * tấm mascot đã có trang riêng, và để nó hiện ở cả hai trang là hai lối vào cho cùng
   * một thứ, đúng cái bẫy mà thanh "Ảnh thật | Skeleton" cũ đã mắc.
   */
  exclude?: ResultCategory;
  readOnly?: boolean;
  /** Câu hiện khi lượt tạo gần nhất không có sheet nào thuộc phạm vi này. */
  emptyCopy?: string;
}) {
  const query = useRuns(projectId, 20);
  const items = query.data?.items ?? [];

  /* Lượt gen mới nhất là lượt DUY NHẤT có thể còn sống. Mở stream cho đúng nó ⇒ thẻ đổi
     trạng thái ngay khi agent phát `job.started`/`job.done`, không phải đợi người dùng F5. */
  const newest = items.find((run) => run.kind === "gen") ?? null;
  const liveId = newest && isRunLive(newest.status) ? newest.id : null;
  const detail = useRun(liveId, { poll: false });
  useRunStream(liveId, { enabled: Boolean(liveId) });

  const merged = React.useMemo(
    () => items.map((run) => (detail.data && detail.data.id === run.id ? detail.data : run)),
    [items, detail.data],
  );
  const groups = generatedRuns(merged);

  const [versionId, setVersionId] = React.useState<string>("");
  const [selection, setSelection] = React.useState<{ jobs: string[]; label: string } | null>(null);
  React.useEffect(() => {
    if (groups.length && !groups.some((group) => group.id === versionId)) setVersionId(groups[0]!.id);
  }, [groups, versionId]);
  const visibleRuns = groups.filter((group) => group.id === (versionId || groups[0]?.id));

  const request = (jobs: string[], label: string) => {
    if (jobs.length) setSelection({ jobs, label });
  };

  /* Nút "tạo lại" của cả lượt phải NÓI ĐÚNG phạm vi nó sẽ chạy — nó chạy trên
     `visibleItems`, tức là đã trừ `exclude`, nên chữ "toàn bộ" chỉ đúng khi không lọc gì. */
  const scope = category !== "all"
    ? { button: "Tạo lại nhóm này", copy: `nhóm ${groupLabel(category)}` }
    : exclude
      ? { button: "Tạo lại phần đang xem", copy: "phần đang xem" }
      : { button: "Tạo lại toàn bộ", copy: "toàn bộ thành phẩm" };

  if (query.isLoading) return <p className="text-body text-fg-muted">Đang mở ảnh đã tạo…</p>;
  if (!groups.length) return <RawEmpty copy="Sheet gốc xuất hiện ở đây sau lượt tạo đầu tiên." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3 bg-surface p-3">
        <div>
          <p className="text-label text-fg-strong">Sheet gốc theo phiên bản</p>
          <p className="text-caption text-fg-muted">Ảnh còn nguyên nền chroma, dùng để đối chiếu. Ảnh cũ vẫn được giữ.</p>
          {/* ══ NÓI TRƯỚC NÚT NÀO TIÊU TIỀN ═════════════════════════════════════
              Hai trong ba người test mù dừng tay ở đây và ghi đúng một câu: "không
              phân biệt được nút nào tốn quota, nên tránh bấm cả nhóm". Trang này chỉ
              có MỘT loại nút hành động và cả ba biến thể của nó đều tên "Tạo lại…" —
              nhìn thì không có gì phân biệt với thao tác cắt (miễn phí) ở màn khác.
              Câu dưới đây mượn nguyên cách nói đã có ở `design/components/SheetProps.tsx:197`
              để hai màn dùng chung một thứ tiếng, và mỗi nút mang thêm `title` nói lại
              đúng điều đó khi rê chuột. */}
          <p className="mt-1 text-caption text-fg-muted">
            <strong className="font-medium text-fg">Tạo lại</strong> vẽ lại ảnh bằng AI — <strong className="font-medium text-fg">tiêu lượt</strong>, nên luôn có bước xác nhận.
            {" "}Xem ảnh, đổi phiên bản và cắt lại thì không tiêu lượt nào.
          </p>
        </div>
        <Select value={versionId || groups[0]?.id} onValueChange={setVersionId}>
          <SelectTrigger aria-label="Phiên bản ảnh" className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {groups.map((group, index) => (
              <SelectItem key={group.id} value={group.id}>
                {index === 0 ? "Mới nhất" : `Phiên bản ${groups.length - index}`} · {group.at ? new Date(group.at).toLocaleString("vi-VN") : group.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visibleRuns.map((run, runIndex) => {
        const visibleItems = run.items.filter((item) =>
          (category === "all" || item.category === category) && item.category !== exclude);
        const categories = [...new Set(visibleItems.map((item) => item.category))];
        return (
          <section key={run.id} className="space-y-4" aria-label={`Lần tạo ${run.id}`}>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{runIndex === 0 ? "Lần tạo gần nhất" : "Lần tạo trước"}</p>
                <h3 className="text-subtitle text-fg-strong">{run.at ? new Date(run.at).toLocaleString("vi-VN") : run.id}</h3>
              </div>
              <Button
                variant="secondary" size="sm" disabled={readOnly || run.live}
                title={REGEN_HINT}
                onClick={() => request(visibleItems.map((item) => item.job), scope.copy)}
              >
                <RefreshCw aria-hidden />{scope.button} · tiêu lượt
              </Button>
            </header>
            {visibleItems.length === 0
              ? <RawEmpty copy={emptyCopy ?? "Lượt tạo này không có sheet nào thuộc nhóm đang xem."} />
              : categories.map((itemCategory) => {
                const sheets = visibleItems.filter((item) => item.category === itemCategory);
                return (
                  /* `id` để `?group=` cũ cuộn tới đúng khối — chỉ MỘT lượt hiện tại một
                     thời điểm nên id không bao giờ trùng trong DOM. */
                  <div
                    key={itemCategory}
                    id={runIndex === 0 ? groupAnchorId(itemCategory) : undefined}
                    className="scroll-mt-20 rounded-4 border border-line-subtle bg-surface p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-label text-fg-strong">{groupLabel(itemCategory)}</h4>
                      <Button
                        variant="ghost" size="sm" disabled={readOnly || run.live}
                        title={REGEN_HINT}
                        onClick={() => request(jobsForGroup(run.items, itemCategory), `nhóm ${groupLabel(itemCategory)}`)}
                      >
                        <RefreshCw aria-hidden />Tạo lại nhóm · tiêu lượt
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {sheets.map((item) => (
                        <SheetCard
                          key={`${run.id}-${item.job}`} projectId={projectId} item={item} readOnly={readOnly}
                          onRegenerate={() => request([item.job], `tấm ${sheetLabel(item.sheet)}`)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
          </section>
        );
      })}

      <GenerateDialog
        open={selection !== null}
        onOpenChange={(open) => { if (!open) setSelection(null); }}
        projectId={projectId} contract={contract} jobStates={jobStates}
        initialJobs={selection?.jobs ?? null} readOnly={readOnly}
        readOnlyReason="Công cụ local chưa sẵn sàng"
      />
    </div>
  );
}

function RawEmpty({ copy }: { copy: string }) {
  return (
    <div className="rounded-4 border border-dashed border-line-subtle bg-surface p-8 text-center">
      <ImageIcon className="mx-auto size-6 text-fg-muted" aria-hidden />
      <p className="mt-3 text-label text-fg-strong">Chưa có ảnh gốc nào</p>
      <p className="mt-1 text-body text-fg-muted">{copy}</p>
    </div>
  );
}

/** Một sheet THÔ của một lần tạo — ảnh còn nền chroma, trạng thái theo vòng đời run. */
function SheetCard({ projectId, item, readOnly, onRegenerate }: {
  projectId: string;
  item: GeneratedResultItem;
  readOnly: boolean;
  onRegenerate: () => void;
}) {
  const ui = STATE_UI[item.state];
  const Icon = ui.icon;
  const label = sheetLabel(item.sheet);
  return (
    <article className="overflow-hidden rounded-3 border border-line-subtle bg-raised">
      {item.path ? (
        /* `width={512}`: đây là NGUYÊN một sheet thô (1536×1024) trải hết bề ngang thẻ.
           Bản 256px — mặc định đúng cho ô lưới nhỏ — ở đây là ảnh phóng to 2–3 lần trên
           màn thường và 4–6 lần trên màn retina, tức đúng cái "bé tí / mờ" đã báo. */
        <KitImage projectId={projectId} path={item.path} alt={label} backdrop="checker" eager width={512} className="aspect-[16/10] rounded-none border-0" />
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center bg-canvas text-center">
          <span>
            <Icon className={`mx-auto size-5 ${ui.tone}${item.state === "running" ? " animate-spin" : ""}`} aria-hidden />
            <span className="mt-2 block text-caption text-fg-muted">{stateCopy(item)}</span>
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 p-3">
        <Icon className={`size-4 shrink-0 ${ui.tone}${item.state === "running" ? " animate-spin" : ""}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg-strong">{label}</p>
          <p className="truncate text-caption text-fg-muted">{detailCopy(item)}</p>
        </div>
        <Button
          variant="ghost" size="icon-sm" aria-label={`Tạo lại ${label} — tiêu lượt`}
          title={REGEN_HINT}
          disabled={readOnly || item.state === "running" || item.state === "queued"}
          onClick={onRegenerate}
        >
          <RefreshCw aria-hidden />
        </Button>
      </div>
    </article>
  );
}

/** Câu trong ô ảnh khi chưa có ảnh — mỗi trạng thái một câu, không dùng chung câu lỗi. */
export function stateCopy(item: Pick<GeneratedResultItem, "state">): string {
  switch (item.state) {
    case "queued": return "Đang chờ tới lượt";
    case "running": return "Đang tạo ảnh…";
    case "cancelled": return "Đã dừng";
    case "done": return "Đã xong";
    default: return "Chưa tạo được ảnh";
  }
}

/** Dòng phụ dưới tên sheet: chỉ nói lý do khi THẬT SỰ lỗi. */
export function detailCopy(item: Pick<GeneratedResultItem, "state" | "diagnosis" | "geometryOk" | "invalidCells" | "variant">): string {
  if (item.state === "failed") return diagnosisText(item.diagnosis);
  if (item.state === "cancelled") return "Bạn đã dừng lượt này · tạo lại khi cần";
  if (item.state === "queued") return "Chưa tiêu lượt nào";
  if (item.state === "running") return "Đang gửi cho công cụ tạo ảnh";
  if (item.geometryOk === false) return `${item.invalidCells} ô lệch bộ khung · Cần tạo lại`;
  return item.variant || "Phong cách chính";
}
