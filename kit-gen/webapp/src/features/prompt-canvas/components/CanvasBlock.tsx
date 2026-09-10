import * as React from "react";
import { AlertCircle, Check, Clock, Copy, Download, Loader2, RotateCw, Sparkles, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { KitImage } from "@/features/kit/components/KitImage";
/* Nút «Tải» dùng LẠI đường tải file của kit — nó đã đi qua transport có header
   `X-KitGen-Client` (đường thẳng tới agent trả 403, đo thật ở đầu `download.ts`)
   và tự đặt tên file theo `Content-Disposition`. Viết bản thứ hai ở đây là chép
   lại cả hai thứ ấy để rồi quên một cái. */
import { saveProjectFile } from "@/features/kit/lib/download";
import {
  DocBlockBody,
  DOC_BLOCK_TITLE,
} from "@/features/prompt-lab/components/DocBlockView";
import {
  UiKitBlockBadge,
  UiKitBlockBody,
  UI_KIT_BLOCK_TITLE,
} from "@/features/prompt-lab/components/UiKitBlockView";
import {
  MascotBlockBadge,
  MascotBlockBody,
  MASCOT_BLOCK_TITLE,
} from "@/features/prompt-lab/components/MascotBlockView";
import { ModeBadge } from "@/features/prompt-lab/components/BlockCard";
import type { Block, DocBlock, MascotBlock, UiKitBlock } from "@/features/prompt-lab/lib/composer-model";
import type { Sheet } from "@/lib/types/contract";
import type { PromptPreviewImage, PromptPreviewJob } from "@/lib/types/api";
import type { BlockPromptState } from "../lib/block-prompt";
import { copyImageBlob, copyProjectImage, copyPromptText } from "../lib/prompt-copy";
import { roleLabel, sheetImages, shortName } from "../lib/prompt-images";
import type { GenBlockState } from "../lib/gen-queue";
import { CARD, SECTION_LABEL } from "../lib/ui";
import { SheetResultSlot } from "./SheetResultSlot";

/**
 * CanvasBlock — VỎ CỦA MỘT THẺ TRÊN MÀN LÀM VIỆC THẬT.
 *
 * ╔══ VỎ NÀY KHÁC VỎ CỦA LAB Ở BA THỨ, VÀ CHỈ BA ════════════════════════════╗
 * ║  ① hai tab "Soạn | Prompt" — xem trước đúng chữ engine sẽ gửi cho TẤM NÀY; ║
 * ║  ② nút Vẽ + trạng thái hàng đợi (chờ · đang vẽ · xong · lỗi);              ║
 * ║  ③ ô ảnh kết quả của từng tấm mà thẻ sinh ra.                              ║
 * ║ RUỘT thì dùng nguyên của lab (`DocBlockBody` / `UiKitBlockBody` /           ║
 * ║ `MascotBlockBody`) — cùng một editor, cùng một luật đổi chế độ. Xem         ║
 * ║ `DocBlockView.tsx` để biết vì sao tách ruột khỏi vỏ thay vì chép.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ THỨ TƯ ĐÃ BỊ XOÁ: THANH «Ảnh dáng tự dựng» ════════════════════════════
 * Vỏ này từng có một thanh riêng cho thẻ Nhân vật: «Ảnh dáng tự dựng: [dáng]
 * [góc] sẽ dựng khi bấm Vẽ». Chủ sản phẩm: *"cái này là sao nhỉ, sao ko cho vào
 * trong chọn prompt cho tự nhiên?"*. Hai pill ấy nay là pill của TỪNG DÒNG DÁNG
 * trong thẻ (`MascotBlockBody`), và cả câu nói về ảnh manơcanh biến mất — nó là
 * chuyện nội bộ của công cụ, không phải một bước người dùng phải hiểu.
 */

export type BlockTab = "compose" | "prompt";

export interface CanvasBlockProps {
  projectId: string;
  block: Block;
  /** Tấm mà thẻ này sinh ra — rỗng nghĩa là chưa có gì để vẽ. */
  sheets: Sheet[];
  /**
   * Nhận HÀM cập nhật ở kiểu CHUNG `Block` — vỏ này vẽ cả ba loại thẻ, nên nó
   * không có một kiểu block cụ thể nào để khai. Mỗi nhánh tự thu hẹp lại đúng
   * kiểu của nó ngay chỗ dùng (xem `BlockBody`), và phép thu hẹp ấy an toàn vì
   * `block.kind` vừa được kiểm ngay dòng trên.
   */
  onChange: (updater: (prev: Block) => Block) => void;
  onDelete: () => void;
  gen: GenBlockState;
  onGen: () => void;
  onDequeue: () => void;
  /** Dừng lượt đang vẽ của thẻ này — xem `GenQueue.stop`. */
  onStop: () => void;
  /** Đang đợi agent xác nhận lệnh dừng. */
  stopping: boolean;
  prompt: BlockPromptState;
  /**
   * PROMPT TỔNG PHONG CÁCH (`variant.style`) — dựng ở màn, hiện ở tab Prompt.
   *
   * Đi bằng prop chứ không tự dựng ở đây: nó là câu của CẢ BỘ KIT (ngữ cảnh chung
   * + màu thương hiệu), không phải của thẻ này — vỏ thẻ không biết gì về hai thứ
   * ấy, và cho nó biết là mở đường cho ba thẻ dựng ra ba câu khác nhau.
   */
  styleLine: string;
  /** Người dùng MỞ tab Prompt hoặc bấm "Xem lại" — nơi gọi mới đi mạng. */
  onWantPrompt: () => void;
  /** Vân tay nội dung hiện tại — lệch với `prompt.hash` ⇒ bản đang xem đã cũ. */
  hash: string;
  /** Tăng lên = nạp lại nội dung vào editor (thẻ vừa bị sửa từ bên ngoài). */
  reloadSignal: number;
  /** Gọi khi vỏ thẻ tự sửa `doc` — màn tăng `reloadSignal` để ô soạn nạp lại. */
  onReload: () => void;
  /** Có lượt xem prompt khác đang chạy ⇒ nút này phải đợi. */
  promptBusy: boolean;
}

const GEN_HINT = "Vẽ ảnh bằng AI — tiêu lượt tạo.";

/** Tên thẻ theo loại — MỘT bảng, để vỏ không phải nối hai bảng bằng ba nhánh `if`. */
const BLOCK_TITLE: Record<Block["kind"], string> = {
  ...DOC_BLOCK_TITLE,
  uikit: UI_KIT_BLOCK_TITLE,
  mascot: MASCOT_BLOCK_TITLE,
};

export function CanvasBlock(props: CanvasBlockProps) {
  const { projectId, block, sheets, onDelete, gen, onGen, onDequeue, onStop, stopping, prompt, styleLine, onWantPrompt, hash, promptBusy } = props;
  const [tab, setTab] = React.useState<BlockTab>("compose");

  const title = BLOCK_TITLE[block.kind];
  const canGen = sheets.length > 0;
  const stale = prompt.status === "ready" && prompt.hash !== hash;

  const openPrompt = () => {
    setTab("prompt");
    /* Đi mạng Ở ĐÂY — trong trình xử lý sự kiện, không trong effect. Xem khối
       chú thích ①/②/③ ở `block-prompt.ts`. */
    if (canGen) onWantPrompt();
  };

  return (
    /* Vỏ thẻ dùng CHUNG hằng số với khối «Ngữ cảnh chung» của màn (`lib/ui.ts`):
       trước đây hai nơi tự gõ cùng một chuỗi class, và chuỗi ấy đã bắt đầu lệch. */
    <section className={CARD}>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className={SECTION_LABEL}>{title}</h3>
        {/* Thẻ Bộ UI đeo CẢ HAI badge: số element (nó có bao nhiêu món) và chế độ
            (nó đang ở khuôn hay đã bị chế). Từ đợt này block Bộ UI cũng có hai
            chế độ như hai thẻ kia, nên giấu badge chế độ đi là để người dùng
            phải mở thẻ ra mới biết mình đang ở đâu. */}
        {block.kind === "uikit" && <UiKitBlockBadge block={block} />}
        {block.kind === "mascot" && <MascotBlockBadge block={block} />}
        <ModeBadge mode={block.mode} />

        <div className="ml-auto flex items-center gap-2">
          {/* `h-8` khớp chiều cao nút `size="sm"` cạnh nó — hai control cùng hàng mà
              lệch 4px thì cả hàng trông như bị xô. */}
          <div role="tablist" aria-label={`Chế độ xem thẻ ${title}`} className="inline-flex h-8 items-center rounded-full border border-line-subtle p-0.5">
            <TabButton active={tab === "compose"} onClick={() => setTab("compose")}>Soạn</TabButton>
            <TabButton active={tab === "prompt"} onClick={openPrompt}>Prompt</TabButton>
          </div>
          <GenControl gen={gen} canGen={canGen} onGen={onGen} onDequeue={onDequeue} onStop={onStop} stopping={stopping} />
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Xoá thẻ ${title}`}
            className="inline-flex size-8 items-center justify-center rounded-1 text-fg-muted hover:bg-raised hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </div>
      </header>

      {tab === "compose" ? (
        <BlockBody {...props} />
      ) : (
        <PromptPanel
          projectId={projectId}
          prompt={prompt}
          styleLine={styleLine}
          stale={stale}
          canGen={canGen}
          busy={promptBusy}
          onWantPrompt={onWantPrompt}
          hash={hash}
        />
      )}

      {sheets.length > 0 && (
        <div className="mt-5 flex flex-col gap-4 border-t border-line-subtle pt-5">
          {sheets.map((sheet) => (
            <SheetResultSlot
              key={sheet.id}
              projectId={projectId}
              sheetId={sheet.id}
              runId={gen.runId}
              busy={gen.status === "running"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BlockBody({ block, onChange, reloadSignal }: CanvasBlockProps) {
  if (block.kind === "uikit") {
    return <UiKitBlockBody block={block} onChange={(updater) => onChange((prev) => updater(prev as UiKitBlock))} />;
  }
  if (block.kind === "mascot") {
    return (
      <MascotBlockBody
        block={block}
        onChange={(updater) => onChange((prev) => updater(prev as MascotBlock))}
        reloadSignal={reloadSignal}
      />
    );
  }
  return (
    <DocBlockBody
      block={block}
      onChange={(updater) => onChange((prev) => updater(prev as DocBlock))}
      reloadSignal={reloadSignal}
    />
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-caption transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        active ? "bg-raised text-fg-strong" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Nút Vẽ + trạng thái hàng đợi
   ══════════════════════════════════════════════════════════════════════════ */

function GenControl({ gen, canGen, onGen, onDequeue, onStop, stopping }: {
  gen: GenBlockState;
  canGen: boolean;
  onGen: () => void;
  onDequeue: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  if (gen.status === "queued") {
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
          <Clock aria-hidden className="size-4" />
          {gen.message}
        </span>
        <Button variant="ghost" size="sm" onClick={onDequeue}>Bỏ khỏi hàng</Button>
      </span>
    );
  }

  if (gen.status === "running") {
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-caption text-accent-text">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {gen.total > 0 ? `Đang vẽ ${gen.done}/${gen.total}` : gen.message}
        </span>
        {/* Dừng KHÔNG hoàn lại lượt đã tiêu — nói thẳng ở `title`, không ở một
            hộp xác nhận: người bấm Dừng đang sốt ruột, và cái họ cứu được là thời
            gian chờ của cả hàng phía sau. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onStop}
          disabled={stopping}
          title="Dừng lượt vẽ này. Lượt đã tiêu không hoàn lại; thẻ kế trong hàng sẽ chạy ngay."
        >
          {stopping ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Square aria-hidden className="size-3.5" />}
          {stopping ? "Đang dừng…" : "Dừng"}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {gen.status === "done" && (
        <span className="inline-flex items-center gap-1 text-caption text-ok">
          <Check aria-hidden className="size-4" />Đã vẽ xong
        </span>
      )}
      {gen.status === "fail" && (
        <span role="alert" className="inline-flex items-center gap-1 text-caption text-danger">
          <AlertCircle aria-hidden className="size-4" />{gen.message}
        </span>
      )}
      {/* NÚT PRIMARY DUY NHẤT của cả màn (§5.4 UX-SPEC: đúng một CTA accent mỗi
          màn — ở đây "màn" là một thẻ, vì mỗi thẻ là một đơn vị việc trọn vẹn).
          Nó cũng là control DUY NHẤT tiêu tiền, nên nó phải là thứ nổi nhất trên
          thẻ; mọi nút khác quanh nó đã hạ về `ghost`/`secondary`. */}
      <Button
        variant="primary"
        size="sm"
        onClick={onGen}
        disabled={!canGen}
        title={canGen ? GEN_HINT : "Thẻ này chưa có gì để vẽ"}
      >
        <Sparkles aria-hidden />
        Vẽ · tiêu lượt
      </Button>
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Tab "Prompt"
   ══════════════════════════════════════════════════════════════════════════ */

function PromptPanel({ projectId, prompt, styleLine, stale, canGen, busy, onWantPrompt, hash }: {
  projectId: string;
  prompt: BlockPromptState;
  /** Prompt tổng phong cách — `variant.style`, câu engine đặt ở đầu MỌI tấm. */
  styleLine: string;
  stale: boolean;
  canGen: boolean;
  busy: boolean;
  onWantPrompt: () => void;
  /** Vân tay nội dung hiện tại — đi thẳng xuống panel ảnh để nó biết lúc nào phải quên số đã đếm. */
  hash: string;
}) {
  if (!canGen) {
    return <p className="text-body text-fg-muted">Thẻ này chưa có nội dung nào nên chưa có prompt để xem.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* PROMPT TỔNG ĐỨNG ĐẦU, hiện NGAY — không đợi engine.
          ╔══ VÌ SAO NÓ Ở ĐÂY, TRÊN CẢ NÚT «Xem prompt» ═══════════════════════════╗
          ║ Chủ sản phẩm: *"prompt này phải copy cả prompt của phong cách — có     ║
          ║ prompt tổng"*. Câu này đi vào ĐẦU prompt của mọi tấm, nên nó là ngữ     ║
          ║ cảnh để đọc mọi thứ bên dưới. Và nó dựng được TẠI CHỖ (hàm thuần,      ║
          ║ không cần engine), nên bắt người dùng bấm một nút tốn vài chục giây    ║
          ║ mới thấy nó là bắt trả giá cho một thứ đã có sẵn trong tay.            ║
          ╚═══════════════════════════════════════════════════════════════════════╝ */}
      {styleLine && <StyleLine text={styleLine} />}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-caption text-fg-muted">
          Đây là chữ engine sẽ gửi cho tấm của thẻ này. Xem một lần là chạy engine thật — không tự chạy lại khi bạn gõ.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onWantPrompt}
          disabled={prompt.status === "loading" || busy}
        >
          {prompt.status === "ready" ? "Xem lại" : "Xem prompt"}
        </Button>
      </div>

      {stale && (
        <p className="text-caption text-warn">Bạn đã sửa thẻ sau lần xem này — bấm «Xem lại» để cập nhật.</p>
      )}

      {prompt.status === "loading" && (
        <p className="inline-flex items-center gap-2 text-body text-fg-muted">
          <Loader2 aria-hidden className="size-4 animate-spin" />{prompt.message}
        </p>
      )}

      {prompt.status === "error" && (
        /* MỘT HỘP LỖI PHẢI CÓ MỘT CÁI NÚT. Nút "Xem lại" ở hàng trên cũng thử lại
           được, nhưng nó nằm cách hộp lỗi cả một đoạn và lúc này đang mang chữ
           "Xem prompt" — người vừa đọc câu lỗi không nhận ra đó là đường đi tiếp.
           §3.9: mọi ca hỏng phải ra CHỮ **và** một lối thoát ngay tại chỗ. */
        <div role="alert" className="rounded-2 border border-danger/60 bg-danger/[var(--kg-tint-b)] px-4 py-3">
          <p className="text-body text-fg-strong">{prompt.message}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={onWantPrompt} disabled={busy}>
            <RotateCw aria-hidden strokeWidth={1.5} />
            Thử lại
          </Button>
          {prompt.details.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-caption text-fg-muted">Chi tiết</summary>
              <ul className="mt-1 space-y-0.5 text-caption text-fg-muted">
                {prompt.details.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {prompt.missing.length > 0 && (
        <p className="text-caption text-warn">Chưa xem trước được: {prompt.missing.join(", ")}</p>
      )}

      {prompt.jobs.map((item) => (
        <OnePrompt key={item.job} projectId={projectId} item={item} hash={hash} />
      ))}
    </div>
  );
}

/**
 * Khối «Prompt tổng phong cách» — BẢN XEM TRƯỚC, không phải chữ để dán.
 *
 * ╔══ VÌ SAO KHỐI NÀY KHÔNG CÒN DÍNH VÀO CHỮ COPY ═══════════════════════════╗
 * ║ Nó từng được NỐI LÊN ĐẦU chữ mà nút «Copy prompt» ghi ra, phòng khi engine ║
 * ║ trên máy người dùng là bản cũ chưa tự đặt câu phong cách. Bản engine mới   ║
 * ║ ĐÃ tự đặt — và kết quả là chủ sản phẩm copy một tấm rồi dán, thấy prompt   ║
 * ║ mở đầu bằng câu phong cách đời CŨ (tính ở đây), còn bên trong lại là câu   ║
 * ║ phong cách đời MỚI (của engine): hai mệnh đề chồng nhau, mâu thuẫn nhau,   ║
 * ║ và máy vẽ nghe câu nào cũng sai.                                          ║
 * ║ Nên nay chữ copy = ĐÚNG NGUYÊN VĂN prompt của engine, không thêm một ký    ║
 * ║ tự nào. Khối này vẫn ở lại vì nó trả lời một câu hỏi thật — "phong cách    ║
 * ║ chung của cả bộ đang là gì" — và trả lời được NGAY, không cần chạy engine. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function StyleLine({ text }: { text: string }) {
  return (
    /* `border-accent/60` + nền `tint-b` — ĐÚNG cặp mà mọi khối ghi chú nhấn mạnh
       khác đang dùng (`projects/dialogs/parts.tsx`, `design/safety/DraftBanner`).
       Không phải chuyện gu: `accent/40` tụt xuống 2.05 tương phản trên nền sáng,
       dưới ngưỡng 3.0 của cổng `npm run contrast` — viền mờ tới mức người mắt kém
       không thấy hộp này đóng khung tới đâu. */
    <div className="rounded-2 border border-accent/60 bg-accent/[var(--kg-tint-b)] px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={SECTION_LABEL}>Prompt tổng phong cách</span>
        <span className="text-caption text-fg-muted">engine đã đặt sẵn câu này trong prompt của mọi tấm</span>
        <CopyTextButton className="ml-auto" text={text} label="Copy prompt tổng" />
      </div>
      <p className="whitespace-pre-wrap text-mono text-fg">{text}</p>
    </div>
  );
}

/** Prompt nguyên văn của MỘT tấm + ảnh tham chiếu của nó. */
function OnePrompt({ projectId, item, hash }: { projectId: string; item: PromptPreviewJob; hash: string }) {
  /* Tên tấm rút ra TRƯỚC rồi mới ghép vào câu: cổng từ cấm §5.4 quét cả biểu thức
     bên trong chuỗi mẫu, nên `${item.sheet}` nằm giữa một câu tiếng Việt bị đọc là
     chữ kỹ thuật lọt ra UI. Rút ra ngoài thì câu chỉ còn chữ người dùng đọc được —
     và cũng dễ đọc hơn. */
  const name = item.sheet || item.job;
  /**
   * ẢNH ĐI KÈM — lọc từ chính bản kê engine đã ghi ra, không dựng lại.
   *
   * Thứ tự (ảnh của tấm → ảnh dáng → ảnh bố cục → ảnh thương hiệu → ảnh gợi hứng)
   * là quyết định của engine và đi thẳng qua agent tới đây; lý do đầy đủ nằm ở
   * `sheetImages` trong `lib/prompt-images.ts`, cùng với lý do bỏ ảnh khung xương.
   */
  const images = React.useMemo(() => sheetImages(item), [item]);

  const [copied, setCopied] = React.useState(false);

  /* Nhãn «Đã copy» tự tắt sau 2 giây. Dọn timer khi tắt sớm: người dùng đổi tab
     ngay sau khi bấm thì `setCopied` chạy trên một khối đã gỡ. */
  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copyText = async () => {
    try {
      /* NGUYÊN VĂN `item.prompt`, không nối gì thêm — xem khối chú thích của `StyleLine`. */
      await copyPromptText(item.prompt);
      setCopied(true);
    } catch (error) {
      toast.error("Không copy được prompt", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /* Con số rút ra ngoài chuỗi mẫu cho câu dưới đọc được thành một câu tiếng Việt
     trọn vẹn — cùng lý do với `name` ở trên. */
  const n = images.length;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <p className="text-caption text-fg-muted">{name}</p>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={copyText}>
          {copied ? <Check aria-hidden strokeWidth={1.5} /> : <Copy aria-hidden strokeWidth={1.5} />}
          {copied ? "Đã copy" : "Copy prompt"}
        </Button>
      </div>
      {n > 0 && (
        /* ╔══ VÌ SAO PHẢI CÓ MỘT DÒNG DẶN, VÀ VÌ SAO NÓ Ở NGAY CẠNH NÚT ═══════════╗
           ║ Nút này từng hứa chép cả chữ lẫn ảnh trong một lượt. Chỗ dán (khung    ║
           ║ chat của máy vẽ) chỉ lấy chữ và bỏ ảnh — im lặng — nên người dùng dán  ║
           ║ xong mới nhận được câu hỏi lại *"chưa có ảnh nguồn khả dụng"*. Nay ảnh ║
           ║ có đường riêng, và cái giá phải trả là người dùng phải biết mình còn   ║
           ║ một việc nữa. Câu dặn đứng ngay cạnh nút vì đó là chỗ duy nhất người   ║
           ║ ta còn đang nhìn khi bấm; đặt nó ở cuối panel ảnh là đặt sau lúc cần.  ║
           ╚═══════════════════════════════════════════════════════════════════════╝ */
        <p className="mb-1 text-caption text-fg-muted">
          Prompt này nhắc {n} ảnh tham chiếu — dán {n} ảnh vào chat trước, rồi dán prompt.
        </p>
      )}
      {/* `overflow-auto` là CUỘN, không phải cắt: prompt của một tấm UI kit dài
          vài chục dòng, và chủ sản phẩm cần đọc được TRỌN VẸN. Trần cao hơn trước
          (28rem) để phần lớn prompt vào vừa một màn mà không phải cuộn trong cuộn. */}
      <pre
        aria-label={`Prompt của tấm ${name}`}
        className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2 border border-line-subtle bg-canvas p-3 text-mono text-fg"
      >
        {item.prompt}
      </pre>
      {images.length > 0 && <SheetImages projectId={projectId} images={images} hash={hash} />}
    </div>
  );
}

/**
 * KHỐI «ẢNH ĐI KÈM» — thumbnail thật, không phải một dòng tên file.
 *
 * Bản trước chỉ liệt kê `refs/char-lan.png`. Với người đang hỏi "engine gửi đi cái
 * gì" thì một đường dẫn không trả lời được câu nào: ảnh mẫu có đúng con nhân vật
 * không, tấm dáng có đủ góc không — chỉ nhìn mới biết. Ảnh đi qua `KitImage`
 * (transport có header) vì `<img src>` thẳng tới agent trả 403.
 *
 * ══ MỖI Ô NÓI RA VAI CỦA MÌNH ═════════════════════════════════════════════
 * Nhân vật · Dáng · Phong cách · Thương hiệu · Bố cục. Bốn tấm ảnh vuông cạnh
 * nhau với tên file bị cắt cụt thì không tấm nào phân biệt được với tấm nào —
 * mà "engine gửi ảnh nào làm ảnh nhân vật" đúng là câu người dùng đang hỏi.
 * Vai do ENGINE khai (`prompts/<job>.refs`), web không tự suy: xem `prompt-images.ts`.
 *
 * Mọi ảnh ở đây đều được ĐÍNH THẲNG vào lời gọi image_gen — từ 10/09/2026 không
 * còn lối đi thứ hai nào (khối «ĐÍNH ẢNH LÀM MẤT NỀN TRONG SUỐT» ở gen.sh nói vì
 * sao), nên ô nào cũng có hai nút và không ô nào cần một chip trạng thái.
 *
 * ══ HAI NÚT MỖI ẢNH, VÀ VÌ SAO KHÔNG PHẢI MỘT ═════════════════════════════
 * «Copy ảnh» nhanh hơn, nhưng bộ nhớ tạm chỉ giữ được MỘT ảnh: dán bốn ảnh vào
 * chat là bốn vòng bấm-dán xen kẽ, và lỡ nhịp một cái thì mất dấu. «Tải» đưa cả
 * bốn file xuống máy để kéo thả một lượt. Hai thói quen khác nhau, cả hai đều
 * thật — bỏ cái nào cũng là bắt một nửa người dùng làm cách của nửa kia.
 */
function SheetImages({ projectId, images, hash }: {
  projectId: string;
  images: readonly PromptPreviewImage[];
  hash: string;
}) {
  /* Đếm theo ĐƯỜNG DẪN chứ không cộng dồn một con số: bấm «Copy ảnh» hai lần trên
     cùng một tấm là chuyện thường (dán hụt, dán nhầm ô), và một biến đếm sẽ báo
     «Đã copy ảnh 2/2» trong khi tấm thứ hai chưa hề được chạm tới. */
  const [copied, setCopied] = React.useState<readonly string[]>([]);

  /**
   * QUÊN SỐ ĐÃ ĐẾM KHI NỘI DUNG THẺ ĐỔI.
   *
   * `hash` đổi nghĩa là prompt đang xem không còn tả đúng thẻ nữa — số "đã copy
   * 3/4" của bản cũ mà còn nằm đó thì nó đang nói về những tấm ảnh của một lần
   * khác. Chỉnh state ngay trong lượt vẽ (thay vì `useEffect`) là cách React
   * khuyên cho đúng ca này: không có một khung hình nào hiện con số sai.
   */
  const [seenHash, setSeenHash] = React.useState(hash);
  if (seenHash !== hash) {
    setSeenHash(hash);
    setCopied([]);
  }

  const mark = (path: string) =>
    setCopied((prev) => (prev.includes(path) ? prev : [...prev, path]));

  const done = copied.length;

  return (
    <div className="mt-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <p className="text-caption text-fg-muted">Ảnh đi kèm ({images.length})</p>
        {done > 0 && (
          <span className="inline-flex items-center gap-1 text-caption text-ok">
            <Check aria-hidden className="size-4" />
            Đã copy ảnh {done}/{images.length}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <OneSheetImage
            key={image.path}
            projectId={projectId}
            image={image}
            index={index}
            onCopied={() => mark(image.path)}
          />
        ))}
      </div>
    </div>
  );
}

/** Một ô ảnh: thumbnail + vai + tên tệp, và hai nút để đưa ảnh sang chat. */
function OneSheetImage({ projectId, image, index, onCopied }: {
  projectId: string;
  image: PromptPreviewImage;
  index: number;
  onCopied: () => void;
}) {
  const vai = roleLabel(image.role);
  const ten = shortName(image.path);

  return (
    <figure className="w-32">
      <KitImage
        projectId={projectId}
        path={image.path}
        alt={`${vai}: ${ten}`}
        full={false}
        width={256}
        className="aspect-square w-32"
      />
      <figcaption className="mt-1 flex flex-col gap-1">
        <span className="text-caption text-fg">{vai}</span>
        {/* TÊN FILE, KHÔNG PHẢI ĐƯỜNG DẪN. Dòng cũ dán nguyên `refs/char-pose-sheet…`
            và ô rộng 128px cắt đúng phần phân biệt được ảnh nào với ảnh nào. */}
        <span className="truncate text-caption text-fg-muted" title={ten}>{ten}</span>
      </figcaption>
      <div className="mt-0.5 flex gap-1">
        <CopyImageButton projectId={projectId} path={image.path} index={index} onCopied={onCopied} />
        <SaveImageButton projectId={projectId} path={image.path} />
      </div>
    </figure>
  );
}

function CopyImageButton({ projectId, path, index, onCopied }: {
  projectId: string;
  path: string;
  index: number;
  /** Gọi CHỈ KHI ảnh thật sự vào bộ nhớ tạm — nhánh lùi về tải file không tính. */
  onCopied: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex-1"
      disabled={busy}
      aria-label={`Copy ảnh ${index + 1}`}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await copyProjectImage(projectId, path);
          const res = await copyImageBlob(blob, path.slice(path.lastIndexOf("/") + 1));
          if (res.outcome === "clipboard") {
            onCopied();
            toast.success(`Đã copy ảnh ${index + 1}`);
          } else {
            /* Máy không cho ghi ảnh vào bộ nhớ tạm ⇒ `copyImageBlob` đã TẢI file
               xuống. Nói đúng việc vừa xảy ra và KHÔNG tính vào số "đã copy":
               người dùng phải biết ảnh này nay nằm ở thư mục tải về, không nằm
               ở đầu ngón tay dán. */
            toast.warning("Đã tải ảnh về máy", { description: res.reason });
          }
        } catch (error) {
          toast.error("Không lấy được ảnh", {
            description: error instanceof Error ? error.message : String(error),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Copy aria-hidden strokeWidth={1.5} />
      Copy ảnh
    </Button>
  );
}

/** Tải một ảnh tham chiếu về máy — để kéo thả cả nhóm vào chat trong một lượt. */
function SaveImageButton({ projectId, path }: { projectId: string; path: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex-1"
      disabled={busy}
      aria-label={`Tải ảnh ${path}`}
      onClick={async () => {
        setBusy(true);
        try {
          const saved = await saveProjectFile(projectId, path);
          toast.success("Đã tải ảnh về máy", { description: saved.fileName });
        } catch (error) {
          toast.error("Không tải được ảnh", {
            description: error instanceof Error ? error.message : String(error),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download aria-hidden strokeWidth={1.5} />
      Tải
    </Button>
  );
}

/** Copy một đoạn chữ thuần — dùng cho khối prompt tổng. */
function CopyTextButton({ text, label, className }: { text: string; label: string; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Đã copy prompt tổng");
        } catch (error) {
          toast.error("Không copy được", {
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }}
    >
      <Copy aria-hidden strokeWidth={1.5} />
      {label}
    </Button>
  );
}
