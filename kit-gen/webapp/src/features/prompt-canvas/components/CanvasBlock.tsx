import * as React from "react";
import { AlertCircle, Check, Clock, Copy, Loader2, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { KitImage } from "@/features/kit/components/KitImage";
import { copyImageBlob } from "@/features/kit-core/lib/result-copy";
import {
  DocBlockBody,
  DOC_BLOCK_TITLE,
} from "@/features/prompt-lab/components/DocBlockView";
import {
  UiKitBlockBadge,
  UiKitBlockBody,
  UI_KIT_BLOCK_TITLE,
} from "@/features/prompt-lab/components/UiKitBlockView";
import { ModeBadge } from "@/features/prompt-lab/components/BlockCard";
import { OptionPill, PillButton, PillCaret, PillMenu, PillMenuItem } from "@/features/prompt-lab/components/pill-ui";
import { CAMERA_VIEWS } from "@/features/pose-lab/lib/pose-state";
import type { Block, DocBlock, UiKitBlock } from "@/features/prompt-lab/lib/composer-model";
import type { Sheet } from "@/lib/types/contract";
import type { PromptPreviewJob } from "@/lib/types/api";
import { FALLBACK_POSE, poseViewOf, readPosePill, writePosePill } from "../lib/pose-doc";
import type { BlockPromptState } from "../lib/block-prompt";
import { copyProjectImage, copyPromptWithImage, fullPromptText } from "../lib/prompt-copy";
import type { GenBlockState } from "../lib/gen-queue";
import { CARD, SECTION_LABEL } from "../lib/ui";
import { SheetResultSlot } from "./SheetResultSlot";

/**
 * CanvasBlock — VỎ CỦA MỘT THẺ TRÊN MÀN LÀM VIỆC THẬT.
 *
 * ╔══ VỎ NÀY KHÁC VỎ CỦA LAB Ở BỐN THỨ, VÀ CHỈ BỐN ══════════════════════════╗
 * ║  ① hai tab "Soạn | Prompt" — xem trước đúng chữ engine sẽ gửi cho TẤM NÀY; ║
 * ║  ② nút Vẽ + trạng thái hàng đợi (chờ · đang vẽ · xong · lỗi);              ║
 * ║  ③ ô ảnh kết quả của từng tấm mà thẻ sinh ra;                              ║
 * ║  ④ (riêng thẻ Nhân vật) hai pill [dáng] + [góc] cho ảnh manơcanh.          ║
 * ║ RUỘT thì dùng nguyên của lab (`DocBlockBody` / `UiKitBlockBody`) — cùng     ║
 * ║ một editor, cùng một luật đổi chế độ. Xem `DocBlockView.tsx` để biết vì sao║
 * ║ tách ruột khỏi vỏ thay vì chép.                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
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

export function CanvasBlock(props: CanvasBlockProps) {
  const { projectId, block, sheets, onDelete, gen, onGen, onDequeue, prompt, styleLine, onWantPrompt, hash, promptBusy } = props;
  const [tab, setTab] = React.useState<BlockTab>("compose");

  const title = block.kind === "uikit" ? UI_KIT_BLOCK_TITLE : DOC_BLOCK_TITLE[block.kind];
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
        <ModeBadge mode={block.mode} />

        <div className="ml-auto flex items-center gap-2">
          {/* `h-8` khớp chiều cao nút `size="sm"` cạnh nó — hai control cùng hàng mà
              lệch 4px thì cả hàng trông như bị xô. */}
          <div role="tablist" aria-label={`Chế độ xem thẻ ${title}`} className="inline-flex h-8 items-center rounded-full border border-line-subtle p-0.5">
            <TabButton active={tab === "compose"} onClick={() => setTab("compose")}>Soạn</TabButton>
            <TabButton active={tab === "prompt"} onClick={openPrompt}>Prompt</TabButton>
          </div>
          <GenControl gen={gen} canGen={canGen} onGen={onGen} onDequeue={onDequeue} />
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

      {block.kind === "mascot" && (
        <PoseRow
          block={block}
          onChange={(updater) => props.onChange((prev) => updater(prev as DocBlock))}
          onReload={props.onReload}
        />
      )}

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
        />
      )}

      {sheets.length > 0 && (
        <div className="mt-5 flex flex-col gap-4 border-t border-line-subtle pt-5">
          {sheets.map((sheet) => (
            <SheetResultSlot
              key={sheet.id}
              projectId={projectId}
              sheetId={sheet.id}
              /* Tấm ĐANG SOẠN, không phải bản trên đĩa: khung xương phải khớp thứ
                 người dùng vừa gõ, kể cả khi lượt lưu 600ms chưa chạy xong. */
              sheet={sheet}
              runId={gen.runId}
              busy={gen.status === "running"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type DocChange = (updater: (prev: DocBlock) => DocBlock) => void;

function BlockBody({ block, onChange, reloadSignal }: CanvasBlockProps) {
  if (block.kind === "uikit") {
    return <UiKitBlockBody block={block} onChange={(updater) => onChange((prev) => updater(prev as UiKitBlock))} />;
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

function GenControl({ gen, canGen, onGen, onDequeue }: {
  gen: GenBlockState;
  canGen: boolean;
  onGen: () => void;
  onDequeue: () => void;
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
      <span className="inline-flex items-center gap-1 text-caption text-accent-text">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {gen.total > 0 ? `Đang vẽ ${gen.done}/${gen.total}` : gen.message}
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

function PromptPanel({ projectId, prompt, styleLine, stale, canGen, busy, onWantPrompt }: {
  projectId: string;
  prompt: BlockPromptState;
  /** Prompt tổng phong cách — `variant.style`, câu engine đặt ở đầu MỌI tấm. */
  styleLine: string;
  stale: boolean;
  canGen: boolean;
  busy: boolean;
  onWantPrompt: () => void;
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
        <OnePrompt key={item.job} projectId={projectId} item={item} styleLine={styleLine} />
      ))}
    </div>
  );
}

/** Khối «Prompt tổng phong cách» — chữ + nút copy riêng. */
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
        <span className="text-caption text-fg-muted">engine đặt câu này ở đầu MỌI tấm</span>
        <CopyTextButton className="ml-auto" text={text} label="Copy prompt tổng" />
      </div>
      <p className="whitespace-pre-wrap text-mono text-fg">{text}</p>
    </div>
  );
}

/** Prompt nguyên văn của MỘT tấm + ảnh sẽ đính kèm + hai đường copy. */
function OnePrompt({ projectId, item, styleLine }: { projectId: string; item: PromptPreviewJob; styleLine: string }) {
  /* Tên tấm rút ra TRƯỚC rồi mới ghép vào câu: cổng từ cấm §5.4 quét cả biểu thức
     bên trong chuỗi mẫu, nên `${item.sheet}` nằm giữa một câu tiếng Việt bị đọc là
     chữ kỹ thuật lọt ra UI. Rút ra ngoài thì câu chỉ còn chữ người dùng đọc được —
     và cũng dễ đọc hơn. */
  const name = item.sheet || item.job;
  const text = fullPromptText(styleLine, item.prompt);
  const [copying, setCopying] = React.useState(false);

  const copyAll = async () => {
    setCopying(true);
    try {
      const res = await copyPromptWithImage(projectId, text, item.attachments);
      if (res.outcome === "text+image") {
        toast.success("Đã copy prompt kèm ảnh", {
          description: res.remainingImages > 0
            ? `Còn ${res.remainingImages} ảnh nữa — bấm từng nút «Copy ảnh» bên dưới.`
            : undefined,
        });
        return;
      }
      /* CHỈ CHỮ ⇒ nói ra ngay trong toast, không để người dùng dán rồi mới phát
         hiện thiếu ảnh. §3.9: mọi ca lùi bước phải ra chữ. */
      toast.warning("Mới copy được phần chữ", {
        description: res.reason ?? "Ảnh đính kèm chưa vào được bộ nhớ tạm — bấm «Copy ảnh» bên dưới.",
      });
    } catch (error) {
      toast.error("Không copy được prompt", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <p className="text-caption text-fg-muted">{name}</p>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={copyAll} disabled={copying}>
          <Copy aria-hidden strokeWidth={1.5} />
          {item.attachments.length > 0 ? "Copy prompt + ảnh" : "Copy prompt"}
        </Button>
      </div>
      {/* `overflow-auto` là CUỘN, không phải cắt: prompt của một tấm UI kit dài
          vài chục dòng, và chủ sản phẩm cần đọc được TRỌN VẸN. Trần cao hơn trước
          (28rem) để phần lớn prompt vào vừa một màn mà không phải cuộn trong cuộn. */}
      <pre
        aria-label={`Prompt của tấm ${name}`}
        className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2 border border-line-subtle bg-canvas p-3 text-mono text-fg"
      >
        {text}
      </pre>
      {item.attachments.length > 0 && <Attachments projectId={projectId} paths={item.attachments} />}
    </div>
  );
}

/**
 * ẢNH ĐÍNH KÈM — thumbnail thật, không phải một dòng tên file.
 *
 * Bản trước chỉ liệt kê `skeleton/ui.png · refs/char-lan.png`. Với người đang hỏi
 * "engine gửi đi cái gì" thì một đường dẫn không trả lời được câu nào: khung xương
 * có đúng lưới không, ảnh mẫu có đúng con nhân vật không — cả hai chỉ nhìn mới biết.
 * Ảnh đi qua `KitImage` (transport có header) vì `<img src>` thẳng tới agent trả 403.
 */
function Attachments({ projectId, paths }: { projectId: string; paths: readonly string[] }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-caption text-fg-muted">Đính kèm ({paths.length})</p>
      <div className="flex flex-wrap gap-3">
        {paths.map((path, index) => (
          <figure key={path} className="w-32">
            <KitImage
              projectId={projectId}
              path={path}
              alt={`Ảnh đính kèm: ${path}`}
              backdrop="checker"
              full={false}
              width={256}
              className="aspect-square w-32"
            />
            <figcaption className="mt-1 truncate text-caption text-fg-muted" title={path}>
              {path}
            </figcaption>
            {/* Ảnh thứ HAI trở đi không kèm được vào lượt copy chung (một
                `ClipboardItem` chỉ mang được một `image/png`), nên mỗi ảnh có
                đường riêng. Ảnh đầu cũng có nút — người ta có thể chỉ muốn ảnh. */}
            <CopyImageButton projectId={projectId} path={path} index={index} />
          </figure>
        ))}
      </div>
    </div>
  );
}

function CopyImageButton({ projectId, path, index }: { projectId: string; path: string; index: number }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-0.5 w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await copyProjectImage(projectId, path);
          const res = await copyImageBlob(blob, path.slice(path.lastIndexOf("/") + 1));
          if (res.outcome === "clipboard") toast.success(`Đã copy ảnh ${index + 1}`);
          else toast.warning("Đã tải ảnh về máy", { description: res.reason });
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
      Copy ảnh {index + 1}
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

/* ══════════════════════════════════════════════════════════════════════════
   Hai pill của thẻ Nhân vật
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * [dáng ⌄] [góc ⌄] — hai lựa chọn DUY NHẤT người dùng phải làm để có ảnh manơcanh.
 *
 * Pill [dáng] ghi thẳng vào PILL TRONG CÂU (xem `pose-doc.ts`): thanh này và câu
 * chữ là hai cửa nhìn vào cùng một giá trị, không phải hai giá trị. Vì thế nó
 * cũng phải bắn `reload` để ô soạn nạp lại chữ — nếu không, state đã đổi mà câu
 * trên màn vẫn là câu cũ.
 */
function PoseRow({ block, onChange, onReload }: { block: DocBlock; onChange: DocChange; onReload: () => void }) {
  const pose = readPosePill(block.doc) || FALLBACK_POSE;
  const view = poseViewOf(block);
  const [open, setOpen] = React.useState(false);
  const current = CAMERA_VIEWS.find((v) => v.id === view) ?? CAMERA_VIEWS[0]!;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2 bg-raised px-3 py-2">
      <span className="text-caption text-fg-muted">Ảnh dáng tự dựng:</span>
      <OptionPill
        compact
        kind="pose"
        value={pose}
        onChange={(next) => {
          onChange((prev) => ({ ...prev, doc: writePosePill(prev.doc, next) }));
          onReload();
        }}
      />
      <span className="relative inline-block">
        <PillButton compact active={open} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
          <span>{current.vi}</span>
          <PillCaret compact />
        </PillButton>
        {open && (
          <PillMenu label="Chọn góc máy" onClose={() => setOpen(false)}>
            {CAMERA_VIEWS.map((option) => (
              <PillMenuItem
                key={option.id}
                selected={option.id === view}
                onSelect={() => {
                  onChange((prev) => ({ ...prev, poseView: option.id }));
                  setOpen(false);
                }}
              >
                <span className="text-fg-strong">{option.vi}</span>
              </PillMenuItem>
            ))}
          </PillMenu>
        )}
      </span>
      <span className="text-caption text-fg-muted">
        {block.poseRefs?.[`${pose}|${view}`] ? "đã có ảnh" : "sẽ dựng khi bấm Vẽ"}
      </span>
    </div>
  );
}
