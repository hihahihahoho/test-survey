import * as React from "react";
import { Download, FolderOpen, Image as ImageIcon, Layers, Ruler, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOCUS } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
import { KitImage } from "@/features/kit/components/KitImage";
import { forgetProject, loadFull } from "@/features/kit/lib/image-source";
import { saveProjectFile } from "@/features/kit/lib/download";
import { poseFileSet } from "@/features/kit/lib/export-scale";
import { SkeletonPreview } from "@/features/design/preview/SkeletonPreview";
import { canvasOf } from "@/features/design/preview/geometry";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { useContract, useKit, useProject, useRevealProject } from "@/lib/hooks";
import type { Sheet } from "@/lib/types/contract";
import { cellsOfSheet, rawSheetImagePath } from "../../lib/result/sheet-files";
import { copySheetAsFigmaNode, measureImage } from "../../lib/result/sheet-figma";
import { PREVIEW_MAX_H, PREVIEW_MAX_PX } from "../../lib/ui";
import { SheetCellGrid } from "./SheetCellGrid";
import { SheetVersionBar } from "./SheetVersionBar";

/**
 * PANEL KẾT QUẢ dưới chân MỘT block của Prompt Canvas.
 *
 * ╔══ PHẠM VI — ĐỌC TRƯỚC KHI THÊM BẤT CỨ THỨ GÌ ════════════════════════════╗
 * ║ Chủ sản phẩm chốt: **3 tab xem + chọn phiên bản + Copy Figma + Tải về**.   ║
 * ║ KHÔNG có pipeline tách element mới ở đây. Mọi dữ liệu đã có sẵn:           ║
 * ║   · ảnh gốc     ← `raw/<job>.png` | `runs/<runId>/artifacts/<job>.png`     ║
 * ║   · khung xương ← `SkeletonPreview` (SVG thuần, KHÔNG cần mạng)            ║
 * ║   · ô đã crop   ← `#42 GET …/kit`, lọc theo `sheet`                        ║
 * ║   · phiên bản   ← `#39`/`#40` (3 đời)                                      ║
 * ║ Panel chỉ ghép chúng lại. Thêm một đường tính toán ảnh mới ở tầng webapp   ║
 * ║ là tạo bản thứ hai của sự thật, và bản thứ hai luôn là bản không ai đo.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO TAB MẶC ĐỊNH LÀ «ẢNH GỐC» ══════════════════════════════════════╗
 * ║ Engine bắn `sheet.image` NGAY khi ghi xong ảnh raw, rồi mới `sheet.ready`  ║
 * ║ sau bước cắt. Vừa gen xong mà mở thẳng vào tab «Đã crop» thì thứ người     ║
 * ║ dùng thấy là một khung trống — trong khi ảnh họ vừa chờ mấy phút ĐÃ có     ║
 * ║ rồi, chỉ nằm ở tab bên cạnh. Nên mặc định là tab CHẮC CHẮN CÓ HÀNG, và     ║
 * ║ nó cũng là tab đứng đầu để thứ tự nhìn khớp thứ tự dữ liệu về.             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ KHÔNG TỰ NGHE STREAM ══════════════════════════════════════════════════╗
 * ║ Màn cha đã có `useRunStream` cho cả lượt chạy. Mở thêm một stream nữa cho  ║
 * ║ mỗi block là N kết nối cho cùng một nguồn, và hai bên sẽ lệch nhau lúc     ║
 * ║ stream đứt/hạ xuống poll. Panel nhận `artifactPath` + `cutting` qua props. ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface SheetResultPanelProps {
  projectId: string;
  /** Id sheet trong contract — dùng để lọc ô đã cắt và vẽ khung xương. */
  sheetId: string;
  /** Tên job của tấm (`raw/<job>.png`). Thường là `<variant>-<sheetId>`. */
  job: string;
  /**
   * Có ⇒ ảnh gốc đọc từ `runs/<runId>/artifacts/` — BẤT BIẾN, không bị lượt gen sau
   * ghi đè. Không có ⇒ đọc `raw/<job>.png` (bản hiện hành).
   */
  runId?: string | null;
  /**
   * Sheet của contract cho `SkeletonPreview`. Truyền vào nếu màn cha đang giữ bản
   * SOẠN DỞ (canvas sửa mà chưa lưu) — bản soạn dở mới là thứ người dùng đang nhìn.
   * Bỏ trống ⇒ lấy sheet cùng `sheetId` trong contract ĐÃ LƯU.
   */
  sheet?: Sheet | null;
  /**
   * Đường ảnh mà `sheet.image` vừa báo (tương đối trong project). Đổi giá trị ⇒ panel
   * quên ảnh cũ trong cache và tải lại — cùng một đường dẫn `raw/<job>.png` sau một
   * lượt gen mới vẫn là BYTE KHÁC.
   */
  artifactPath?: string | null;
  /** true ⇒ đã có ảnh raw nhưng lượt chạy chưa tới `sheet.ready` (chưa cắt xong). */
  cutting?: boolean;
  /** true ⇒ tấm đang chạy: khoá các thao tác ghi (khôi phục phiên bản). */
  busy?: boolean;
  className?: string;
}

type TabId = "raw" | "cut" | "skeleton";

export function SheetResultPanel({
  projectId, sheetId, job, runId = null, sheet = null,
  artifactPath = null, cutting = false, busy = false, className,
}: SheetResultPanelProps) {
  const [tab, setTab] = React.useState<TabId>("raw");
  const [zoom, setZoom] = React.useState(false);
  const [safeFrame, setSafeFrame] = React.useState(true);
  const [copying, setCopying] = React.useState(false);

  const contract = useContract(projectId);
  const kit = useKit(projectId);
  const reveal = useRevealProject(projectId);

  /**
   * ══ TẤM NÀY ĐÃ TỪNG ĐƯỢC VẼ CHƯA ═══════════════════════════════════════════
   *
   * Chủ sản phẩm mở một dự án mới và thấy ô ảnh đỏ *"Thiếu file · Thử lại"* dưới
   * MỌI thẻ. Ô ấy không nói dối — file `raw/<job>.png` đúng là không có — nhưng nó
   * trả lời SAI CÂU HỎI: chưa ai bấm Vẽ thì lấy đâu ra file, và không có gì để
   * "thử lại" cả. Một ô lỗi ở chỗ đáng lẽ là một lời mời khiến người dùng đi tìm
   * một hỏng hóc không tồn tại.
   *
   * `state.jobs[job]` của agent phân biệt được đúng chuyện đó: `"never"` (hoặc
   * vắng mặt) = CHƯA CHẠY LẦN NÀO, mọi giá trị khác = đã có một lượt chạm vào tấm
   * này. Nên `"never"` ⇒ khối rỗng mời bấm Vẽ; mọi giá trị khác mà thiếu file ⇒
   * ĐÚNG là lỗi, và ô đỏ kèm nút thử lại là câu trả lời đúng.
   *
   * Hai cửa lách, cả hai đều có thật:
   *  · `artifactPath` vừa được stream báo ⇒ ảnh có rồi, dù `#9` chưa mời lại;
   *  · `busy` (tấm đang chạy) ⇒ đừng nói "chưa vẽ" giữa lúc nó đang được vẽ.
   * `useProject` dùng CHUNG query key với màn cha nên không sinh request thứ hai.
   */
  const project = useProject(projectId);
  const jobState = project.data?.state?.jobs?.[job] ?? "never";
  const neverDrawn =
    jobState === "never" && !busy && !(typeof artifactPath === "string" && artifactPath !== "");

  /**
   * TÊN TẤM rút ra TRƯỚC rồi mới ghép vào câu — cùng lý do (và cùng cách) với `OnePrompt`
   * ở `CanvasBlock.tsx:300` và `stateOf` ở `lib/gen-queue.ts:167`.
   *
   * Cổng từ cấm §5.4 (`features/kitfile/__tests__/banned-scan.ts`) quét CẢ BIỂU THỨC nằm
   * trong chuỗi mẫu: một câu tiếng Việt có `${job}` bị đọc đúng như nó hiện ra — chữ kỹ
   * thuật lọt vào lời nói với người dùng. Rút ra ngoài thì câu chỉ còn chữ người đọc được,
   * và tên tấm (`sheetId`) vốn cũng dễ hiểu hơn tên lượt vẽ nội bộ.
   */
  const name = sheetId || job;

  /* `artifactPath` là sự thật do engine vừa báo; chỉ khi không có nó mới tự suy đường. */
  const rawPath = React.useMemo(
    () => (typeof artifactPath === "string" && artifactPath !== "" ? artifactPath : rawSheetImagePath(job, runId)),
    [artifactPath, job, runId],
  );

  /**
   * Đổi số này ⇒ `KitImage` mount lại và xin ảnh lần nữa.
   *
   * Cần vì cache của `image-source.ts` khoá theo (project, path, width) — mà
   * `raw/<job>.png` GIỮ NGUYÊN đường dẫn sau mỗi lượt gen và sau mỗi lần khôi phục.
   * Không dọn thì panel hiện lại đúng ảnh cũ, và người dùng kết luận là "gen không
   * ăn". `forgetProject` là cửa dọn DUY NHẤT được export; nó thô (dọn cả dự án) nhưng
   * chỉ chạy ở hai mốc hiếm và có thật: ảnh mới về, và khôi phục xong.
   */
  const [reloadKey, setReloadKey] = React.useState(0);
  const reloadImage = React.useCallback(() => {
    forgetProject(projectId);
    setReloadKey((n) => n + 1);
  }, [projectId]);
  React.useEffect(() => {
    if (artifactPath === null || artifactPath === "") return;
    reloadImage();
  }, [artifactPath, reloadImage]);

  const cells = React.useMemo(
    () => cellsOfSheet(kit.data?.files ?? [], sheetId),
    [kit.data?.files, sheetId],
  );
  const poseFiles = React.useMemo(
    () => poseFileSet(contract.data?.contract ?? null),
    [contract.data?.contract],
  );
  /* Sheet của contract ĐÃ LƯU là đường lùi; bản soạn dở (prop) luôn thắng. */
  const skeletonSheet = sheet ?? contract.data?.contract.sheets.find((s) => s.id === sheetId) ?? null;

  /**
   * COPY CẢ TẤM sang Figma.
   *
   * Đo cỡ ảnh THẬT trước khi dựng spec (`measureImage`) thay vì lấy khổ trong contract:
   * contract nói khổ *đáng lẽ*, còn `assertDocShape` bên trong encoder đo frame THẬT
   * và sẽ ném nếu lệch quá 1px. Lấy số sai ở đây = lỗi khó hiểu ở tận đáy encoder.
   */
  const copySheet = () => {
    setCopying(true);
    void (async () => {
      try {
        const url = await loadFull(projectId, rawPath).promise;
        const size = await measureImage(url);
        const spec = await copySheetAsFigmaNode(url, size, job);
        /* Số đo cũng rút ra trước: `spec.frame.w` nằm giữa câu tiếng Việt thì cổng §5.4
           đọc thấy chữ «frame» — và nó nói đúng, câu báo cho người dùng không nên có
           chữ ấy. Ở đây gọi bằng tiếng Việt: «khung». */
        const w = Math.round(spec.frame.w);
        const h = Math.round(spec.frame.h);
        toastSuccess(
          "Đã copy cả tấm sang Figma",
          `${name} · khung ${w}×${h}. Dán bằng Ctrl/Cmd+V.`,
        );
      } catch (err) {
        /* Không im lặng đổi sang bitmap: panel này không có đường lùi nào, và báo
           "đã copy" khi chưa copy được là lời nói dối tốn của người dùng cả buổi. */
        toastError(err, {});
      } finally {
        setCopying(false);
      }
    })();
  };

  const downloadSheet = () => {
    void saveProjectFile(projectId, rawPath)
      .then((saved) => toastSuccess("Đã tải ảnh gốc", saved.fileName))
      .catch((err: unknown) => toastError(err, {}));
  };

  return (
    <section className={cn("rounded-4 border border-line-subtle bg-surface p-3", className)} aria-label={`Kết quả tấm ${name}`}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="raw"><ImageIcon aria-hidden strokeWidth={1.5} />Ảnh gốc</TabsTrigger>
            <TabsTrigger value="cut">Đã crop{cells.length > 0 ? ` (${cells.length})` : ""}</TabsTrigger>
            <TabsTrigger value="skeleton">Khung xương</TabsTrigger>
          </TabsList>
          <SheetVersionBar projectId={projectId} job={job} name={name} busy={busy} onRestored={reloadImage} />
        </div>

        <TabsContent value="raw" className="mt-3">
          {neverDrawn ? (
            <NotDrawnYet what="Chưa vẽ tấm này" />
          ) : (
            <>
              {/* Bấm vào ảnh = xem ở độ nét thật. Lưới dùng bản `?w=512` cho nhẹ, còn popup
                  mới xin ảnh gốc — cùng quy ước với `AssetZoomDialog` của tab kết quả cũ. */}
              <button
                type="button"
                onClick={() => setZoom(true)}
                aria-label={`Phóng to ảnh gốc ${name}`}
                className={cn("block w-full", FOCUS)}
              >
                <KitImage
                  key={reloadKey}
                  projectId={projectId}
                  path={rawPath}
                  alt={`Ảnh gốc tấm ${name}`}
                  backdrop="checker"
                  full={false}
                  width={512}
                  className={cn(PREVIEW_MAX_H, "w-full")}
                  imgClassName={PREVIEW_MAX_H}
                />
              </button>
              <p className="mt-2 text-caption text-fg-muted">
                Bấm vào ảnh để phóng to ở độ nét thật.{" "}
                {runId === null || runId === ""
                  ? "Đây là bản hiện hành — mỗi lượt vẽ ghi đè lên nó."
                  : "Đây là ảnh của đúng lượt chạy này — không bị lượt sau ghi đè."}
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="cut" className="mt-3">
          {neverDrawn ? (
            <NotDrawnYet what="Chưa có ô nào để crop" />
          ) : (
            <SheetCellGrid
              projectId={projectId}
              cells={cells}
              cutting={cutting}
              loading={kit.isLoading}
              poseFiles={poseFiles}
            />
          )}
        </TabsContent>

        <TabsContent value="skeleton" className="mt-3">
          {skeletonSheet === null ? (
            <p className="text-body text-fg-muted">Chưa tìm thấy tấm «{sheetId}» trong bản thiết kế.</p>
          ) : (
            <>
              <div className="flex items-center justify-end">
                <Button
                  type="button" variant="ghost" size="sm"
                  aria-pressed={safeFrame}
                  onClick={() => setSafeFrame((on) => !on)}
                >
                  <Ruler aria-hidden strokeWidth={1.5} />
                  {safeFrame ? "Ẩn khung an toàn" : "Hiện khung an toàn"}
                </Button>
              </div>
              {/* SVG dựng tại chỗ: không tốn một request nào và luôn có, kể cả khi
                  agent chưa chạy. Đây là bố cục mà engine SẼ vẽ, không phải ảnh gen.

                  TRẦN CHIỀU CAO KHÔNG GẮN ĐƯỢC THẲNG LÊN `<svg>`: nó khai `w-full h-auto`
                  và tự cao theo `viewBox`, nên `max-h` trên chính nó chỉ CẮT hình. Cách
                  đúng là chặn BỀ NGANG của thẻ bọc bằng đúng tỉ lệ khổ ảnh:
                      rộng-tối-đa = 320px × (w ÷ h)
                  Số này tính từ `canvasOf` — CÙNG hàm mà svg dùng để dựng `viewBox`, nên
                  hai bên không bao giờ nói hai tỉ lệ khác nhau. Khung xương của sheet
                  1536×1024 vì thế cao đúng 320px thay vì gần 800px — đúng lời chê "xương
                  to quá". `w-full` giữ nguyên để ở màn hẹp nó vẫn co theo cột. */}
              <div
                className="mt-2 flex justify-center"
                style={{ maxWidth: `${Math.round(PREVIEW_MAX_PX * (canvasOf(skeletonSheet).w / canvasOf(skeletonSheet).h))}px` }}
              >
                <SkeletonPreview sheet={skeletonSheet} showIndex showSafeFrame={safeFrame} />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* HÀNG NÀY BIẾN MẤT KHI CHƯA CÓ ẢNH. Ba nút đều thao tác trên `raw/<job>.png`;
          bày chúng ra dưới một khối "chưa vẽ" là mời người dùng bấm ba lần để nhận ba
          thông báo lỗi. §2.5-2 cấm ẩn nút *có thể dùng được* — ở đây thì chưa có gì để
          dùng cả, và khối rỗng ngay trên đã nói rõ việc phải làm trước. */}
      {!neverDrawn && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={copySheet} disabled={copying} loading={copying}>
            <Layers aria-hidden strokeWidth={1.5} />
            Copy cả tấm sang Figma
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={downloadSheet}>
            <Download aria-hidden strokeWidth={1.5} />
            Tải PNG
          </Button>
          {/* `#21` mở đúng THƯ MỤC DỰ ÁN (agent bỏ qua `path` — projects.mjs:299-306),
              nên nhãn nói "thư mục dự án" chứ không hứa là trỏ thẳng vào file. */}
          <Button type="button" variant="ghost" size="sm" onClick={() => reveal.mutate(undefined)}>
            <FolderOpen aria-hidden strokeWidth={1.5} />
            Mở thư mục dự án
          </Button>
        </div>
      )}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent size="xl" className="!max-h-[min(90dvh,720px)]">
          <DialogHeader>
            <DialogTitle className="font-mono text-subtitle">{job}</DialogTitle>
            <DialogDescription>Ảnh gốc ở độ nét thật — {rawPath}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <KitImage
              key={`zoom-${reloadKey}`}
              projectId={projectId}
              path={rawPath}
              alt={`Ảnh gốc tấm ${name} ở độ nét thật`}
              backdrop="checker"
              eager
              className="w-full"
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * KHỐI RỖNG «CHƯA VẼ» — thay cho ô đỏ "Thiếu file · Thử lại".
 *
 * Nó KHÔNG có nút. Nút Vẽ nằm ở đầu thẻ, cách đây vài chục pixel, và nó là nút
 * primary duy nhất của thẻ — thêm một bản sao ở đây là hai CTA cho cùng một việc
 * và hai chỗ phải sửa mỗi khi luật "vẽ được hay chưa" đổi (thẻ rỗng, agent tắt,
 * đang có lượt khác chạy). Nên khối này chỉ CHỈ ĐƯỜNG, và nói đúng nút nào.
 */
function NotDrawnYet({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2 border border-dashed border-line-subtle bg-raised/40 px-4 py-8 text-center">
      <Sparkles aria-hidden strokeWidth={1.5} className="size-5 text-fg-muted" />
      <p className="text-body text-fg">{what}</p>
      <p className="text-caption text-fg-muted">Bấm «Vẽ · tiêu lượt» ở đầu thẻ để tạo ảnh cho tấm này.</p>
    </div>
  );
}
