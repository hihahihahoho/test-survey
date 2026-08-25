import * as React from "react";
import { AlertCircle, Check, Clock, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import type { GenBlockState } from "../lib/gen-queue";
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
  const { projectId, block, sheets, onDelete, gen, onGen, onDequeue, prompt, onWantPrompt, hash, promptBusy } = props;
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
    <section className="rounded-3 border border-line-subtle bg-surface p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-label uppercase tracking-wide text-fg-muted">{title}</h3>
        {block.kind === "uikit" ? <UiKitBlockBadge block={block} /> : <ModeBadge mode={block.mode} />}

        <div className="ml-auto flex items-center gap-2">
          <div role="tablist" aria-label={`Chế độ xem thẻ ${title}`} className="inline-flex rounded-full border border-line-subtle p-0.5">
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
        <PromptPanel prompt={prompt} stale={stale} canGen={canGen} busy={promptBusy} onWantPrompt={onWantPrompt} />
      )}

      {sheets.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line-subtle pt-4">
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
        "rounded-full px-2.5 py-0.5 text-caption transition-colors duration-fast",
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
      <Button
        variant="secondary"
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

function PromptPanel({ prompt, stale, canGen, busy, onWantPrompt }: {
  prompt: BlockPromptState;
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
        <div role="alert" className="rounded-2 border border-danger/60 bg-danger/[var(--kg-tint-b)] px-3 py-2">
          <p className="text-body text-fg-strong">{prompt.message}</p>
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

      {prompt.jobs.map((item) => <OnePrompt key={item.job} item={item} />)}
    </div>
  );
}

/** Prompt nguyên văn của MỘT tấm + danh sách ảnh sẽ đính kèm. */
function OnePrompt({ item }: { item: PromptPreviewJob }) {
  /* Tên tấm rút ra TRƯỚC rồi mới ghép vào câu: cổng từ cấm §5.4 quét cả biểu thức
     bên trong chuỗi mẫu, nên `${item.sheet}` nằm giữa một câu tiếng Việt bị đọc là
     chữ kỹ thuật lọt ra UI. Rút ra ngoài thì câu chỉ còn chữ người dùng đọc được —
     và cũng dễ đọc hơn. */
  const name = item.sheet || item.job;
  return (
    <div>
      <p className="mb-1 text-caption text-fg-muted">{name}</p>
      <pre
        aria-label={`Prompt của tấm ${name}`}
        className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2 border border-line-subtle bg-canvas p-3 text-mono text-fg"
      >
        {item.prompt}
      </pre>
      {item.attachments.length > 0 && (
        <p className="mt-1 text-caption text-fg-muted">Đính kèm: {item.attachments.join(" · ")}</p>
      )}
    </div>
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
