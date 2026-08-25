import * as React from "react";
import { Image as ImageIcon, LayoutGrid, Plus, Smile } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { AgentError } from "@/lib/api/client";
import { contractConflictDetailsSchema } from "@/lib/types/api";
import { useContract, useProject, useSaveContract } from "@/lib/hooks";
import type { Contract } from "@/lib/types/contract";

import { OptionPill, PillButton, PillCaret, PillMenu, PillMenuItem } from "@/features/prompt-lab/components/pill-ui";
import { BrandColorPills } from "@/features/prompt-lab/components/BrandColorPills";
import { usePresets } from "@/features/prompt-lab/lib/presets-store";
import {
  newDocBlock,
  newUiKitBlock,
  type Block,
  type BlockKind,
  type ComposerState,
} from "@/features/prompt-lab/lib/composer-model";
import "@/features/prompt-lab/prompt-lab.css";

import { CanvasBlock } from "./components/CanvasBlock";
import { useComposerDoc } from "./lib/composer-doc";
import { PromptProjectContext } from "./lib/project-context";
import {
  composerBlockSheets,
  composerToContract,
  narrowContractToSheets,
  type BlockSheets,
  type ComposerContractOptions,
} from "./lib/composer-to-contract";
import { jobIdOf, sheetsHash } from "./lib/block-jobs";
import { useBlockPrompts } from "./lib/block-prompt";
import { useGenQueue } from "./lib/gen-queue";
import { ensurePoseRef } from "./lib/pose-refs";

/**
 * PromptCanvasScreen — MÀN LÀM VIỆC CHÍNH của một dự án, bản prompt-first.
 *
 * ╔══ ĐÂY LÀ BẢN THẬT CỦA DEMO `prompt-lab` ═════════════════════════════════╗
 * ║ Nhịp tương tác giữ nguyên (thẻ · câu mad-lib · pill · hai chế độ), và mã   ║
 * ║ của nhịp ấy cũng giữ nguyên: ruột thẻ là `DocBlockBody`/`UiKitBlockBody`   ║
 * ║ của lab, pill là `pill-ui` của lab, kho preset là kho của lab. Bốn thứ ĐỔI:║
 * ║  ① state ĐỌC/GHI QUA DỰ ÁN (`useComposerDoc`), không sống trong RAM tab;   ║
 * ║  ② mỗi thẻ có tab "Prompt" gọi engine thật cho ĐÚNG tấm của nó;            ║
 * ║  ③ mỗi thẻ có nút Vẽ, và một hàng đợi phía web vì agent chỉ cho 1 lượt;    ║
 * ║  ④ thẻ Nhân vật tự dựng ảnh dáng bằng manơcanh 3D lúc bấm Vẽ.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CÓ MỘT CỬA HỎI TRƯỚC KHI CHO GÕ ════════════════════════════════
 * Tài liệu composer nằm trong `workflow-draft.json` — chính ô nhớ đang chứa bản
 * nháp WIZARD của những dự án làm bằng bản cũ. `migrateComposerDoc` đọc bản ấy ra
 * tài liệu RỖNG (đúng: dịch mò là bịa chữ vào miệng người dùng), nhưng cú
 * `setComposer` đầu tiên sẽ GHI ĐÈ lên nó. Nên trước khi cho gõ chữ đầu tiên,
 * màn hỏi một câu — và trong lúc chưa trả lời thì KHÔNG có một lượt ghi nào.
 */

const ADD_ITEMS: { kind: BlockKind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: "background", label: "Cảnh nền", hint: "Một cảnh nền: khung cảnh, không khí, ảnh tham chiếu", icon: <ImageIcon aria-hidden className="size-4" /> },
  { kind: "uikit", label: "Bộ UI", hint: "Danh sách món giao diện — hệ thống tự xếp lưới", icon: <LayoutGrid aria-hidden className="size-4" /> },
  { kind: "mascot", label: "Nhân vật", hint: "Một nhân vật: dáng, biểu cảm, trang phục", icon: <Smile aria-hidden className="size-4" /> },
];

export function PromptCanvasScreen({ projectId }: { projectId: string }) {
  const presets = usePresets();
  const store = useComposerDoc(projectId, presets);
  const project = useProject(projectId);
  const contractQuery = useContract(projectId);
  const saveContract = useSaveContract(projectId);

  /* Người dùng đã đồng ý thay bản nháp wizard cũ. State của TAB, không lưu đâu
     cả: một khi composer ghi lần đầu thì `docVersion` đã đúng và câu hỏi tự biến
     mất ở lần mở sau. */
  const [replaceOk, setReplaceOk] = React.useState(false);
  const locked = store.legacyDraft && !replaceOk;

  const [addOpen, setAddOpen] = React.useState(false);
  const [reloads, setReloads] = React.useState<Record<string, number>>({});

  /* Bản mới nhất NGOÀI vòng render: `prepare()` chạy bất đồng bộ vài giây sau cú
     bấm, và thứ nó phải dựng contract là chữ lúc PHÓNG, không phải chữ lúc bấm. */
  const composerRef = React.useRef(store.composer);
  composerRef.current = store.composer;

  /* `If-Match` của lần PUT tới. Ưu tiên số lớn hơn: sau một lượt lưu ta biết
     version mới NGAY, còn query thì phải đợi một vòng mời-lại. */
  const versionRef = React.useRef(0);
  React.useEffect(() => {
    const v = contractQuery.data?.version ?? 0;
    if (v > versionRef.current) versionRef.current = v;
  }, [contractQuery.data]);

  const contractOpts = React.useMemo<ComposerContractOptions>(
    () => ({ presets, kitName: project.data?.name ?? "" }),
    [presets, project.data],
  );

  /* Ánh xạ thẻ → tấm. Ném ⇒ giữ bản dựng được gần nhất và nói ra, thay vì để cả
     màn trắng: người dùng đang gõ dở một câu không được mất chỗ đang gõ. */
  const built = React.useMemo<{ sheets: BlockSheets[]; error: string }>(() => {
    try {
      return { sheets: composerBlockSheets(store.composer, contractOpts), error: "" };
    } catch (error) {
      return { sheets: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [store.composer, contractOpts]);
  const blockSheets = built.sheets;
  const buildError = built.error;

  const sheetsOf = React.useCallback(
    (blockId: string) => blockSheets.find((b) => b.blockId === blockId)?.sheets ?? [],
    [blockSheets],
  );

  /* ── Ghi contract lên đĩa ─────────────────────────────────────────────────
     XUNG ĐỘT thì GHI ĐÈ, có chủ ý và chỉ ở màn này: nguồn sự thật của một dự án
     prompt-first là TÀI LIỆU COMPOSER, còn `contract.json` là bản dịch sinh ra từ
     nó. Mở modal ba lựa chọn như S3 ở đây là hỏi người dùng chọn giữa bản dịch
     của họ và một bản dịch cũ hơn của chính họ. Bản cũ vẫn nằm trong
     `.history/contract/` của agent nên không mất gì. */
  const putContract = React.useCallback(
    async (contract: Contract) => {
      try {
        const res = await saveContract.mutateAsync({ version: versionRef.current, contract });
        versionRef.current = res.version;
        return;
      } catch (error) {
        if (!(error instanceof AgentError) || error.code !== "CONTRACT_CONFLICT") throw error;
        const parsed = contractConflictDetailsSchema.safeParse(error.details);
        if (!parsed.success) throw error;
        const res = await saveContract.mutateAsync({ version: parsed.data.serverVersion, contract });
        versionRef.current = res.version;
      }
    },
    [saveContract],
  );

  /* ── Việc phải làm ngay trước khi phóng một thẻ ──────────────────────────── */
  const prepare = React.useCallback(
    async (blockId: string): Promise<string[]> => {
      let state = composerRef.current;

      const block = state.blocks.find((b) => b.id === blockId);
      if (block && block.kind === "mascot") {
        const outcome = await ensurePoseRef(projectId, block);
        if (outcome.skipped) toast.warning("Vẽ không kèm ảnh dáng", { description: outcome.skipped });
        if (outcome.changed) {
          state = { ...state, blocks: state.blocks.map((b) => (b.id === blockId ? outcome.block : b)) };
          store.setComposer(state);
          setReloads((prev) => ({ ...prev, [blockId]: (prev[blockId] ?? 0) + 1 }));
        }
      }

      const mine = composerBlockSheets(state, contractOpts).find((b) => b.blockId === blockId);
      if (!mine || mine.sheets.length === 0) throw new Error("Thẻ này chưa có gì để vẽ — thêm nội dung trước đã.");

      await putContract(composerToContract(state, contractOpts));
      /* Ghi nốt tài liệu composer: bản trên đĩa và contract vừa PUT phải là cùng
         một đời, nếu không thì mở lại dự án sẽ thấy hai thứ tả hai bộ kit khác nhau. */
      store.flush();
      return mine.sheets.map((sheet) => jobIdOf(sheet.id));
    },
    [projectId, contractOpts, putContract, store],
  );

  const queue = useGenQueue(projectId, prepare);
  const prompts = useBlockPrompts(projectId);

  const wantPrompt = React.useCallback(
    (blockId: string) => {
      const mine = blockSheets.find((b) => b.blockId === blockId);
      if (!mine || mine.sheets.length === 0) return;
      const ids = mine.sheets.map((sheet) => sheet.id);
      try {
        const full = composerToContract(composerRef.current, contractOpts);
        prompts.request(blockId, sheetsHash(mine.sheets), narrowContractToSheets(full, ids));
      } catch (error) {
        toast.error("Chưa dựng được bản thiết kế để xem prompt", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [blockSheets, contractOpts, prompts],
  );

  /* ── Sửa tài liệu ─────────────────────────────────────────────────────────
     MỘT cửa duy nhất, và nó đi qua `locked`: mọi đường sửa (pill ngữ cảnh, thêm
     thẻ, gõ chữ trong thẻ) đều gọi hàm này, nên không có lối nào lách được câu
     hỏi "có thay bản nháp cũ không". */
  const edit = React.useCallback(
    (updater: (prev: ComposerState) => ComposerState) => {
      if (locked) return;
      store.setComposer(updater);
    },
    [locked, store],
  );

  const updateBlock = React.useCallback(
    <T extends Block>(id: string, updater: (prev: T) => T) =>
      edit((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === id ? updater(b as T) : b)) })),
    [edit],
  );

  const addBlock = (kind: BlockKind) => {
    const block: Block = kind === "uikit" ? newUiKitBlock() : newDocBlock(kind);
    edit((prev) => ({ ...prev, blocks: [...prev.blocks, block] }));
    setAddOpen(false);
  };

  if (store.loading) return <p className="text-body text-fg-muted">Đang mở bản soạn của dự án…</p>;

  return (
    <PromptProjectContext.Provider value={projectId}>
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-display-2 text-fg-strong">Soạn bộ kit</h1>
            <p className="text-body text-fg-muted">
              Đặt ngữ cảnh chung, rồi thêm từng thẻ. Mỗi thẻ có nút Vẽ riêng và tab Prompt để xem chữ engine sẽ gửi.
            </p>
          </div>
          <SaveState updatedAt={store.updatedAt} dirty={store.dirty} saving={store.saving} error={store.saveError} />
        </header>

        {locked && <LegacyDraftGate onAccept={() => setReplaceOk(true)} />}

        {buildError && (
          <p role="alert" className="rounded-2 border border-danger/60 bg-danger/[var(--kg-tint-b)] px-3 py-2 text-body text-fg-strong">
            Bản thiết kế chưa dựng được: {buildError}
          </p>
        )}

        <section className="rounded-3 border border-line-subtle bg-surface p-5">
          <h2 className="mb-2 text-label uppercase tracking-wide text-fg-muted">Ngữ cảnh chung</h2>
          <p className="flex flex-wrap items-center gap-2 text-display font-normal text-fg-strong">
            <span>Bộ kit theme</span>
            <OptionPill kind="theme" value={store.composer.themeValue} onChange={(themeValue) => edit((prev) => ({ ...prev, themeValue }))} />
            <span>phong cách</span>
            <OptionPill kind="style" value={store.composer.styleId} onChange={(styleId) => edit((prev) => ({ ...prev, styleId }))} />
            <span>, màu thương hiệu</span>
            <BrandColorPills
              colors={store.composer.brandColors}
              onChange={(updater) => edit((prev) => ({ ...prev, brandColors: updater(prev.brandColors) }))}
            />
            <span>.</span>
          </p>
          <p className="mt-2 text-caption text-fg-muted">
            Mọi thẻ bên dưới kế thừa ngữ cảnh này; theme và phong cách thì từng thẻ vẫn ghi đè riêng được.
          </p>
        </section>

        {store.composer.blocks.map((block) => (
          <CanvasBlock
            key={block.id}
            projectId={projectId}
            block={block}
            sheets={sheetsOf(block.id)}
            onChange={((updater: (prev: Block) => Block) => updateBlock(block.id, updater)) as never}
            onDelete={() => edit((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== block.id) }))}
            gen={queue.stateOf(block.id)}
            onGen={() => queue.enqueue(block.id)}
            onDequeue={() => queue.dequeue(block.id)}
            prompt={prompts.stateOf(block.id)}
            onWantPrompt={() => wantPrompt(block.id)}
            promptBusy={prompts.busy}
            hash={sheetsHash(sheetsOf(block.id))}
            reloadSignal={reloads[block.id] ?? 0}
            onReload={() => setReloads((prev) => ({ ...prev, [block.id]: (prev[block.id] ?? 0) + 1 }))}
          />
        ))}

        <div className="relative">
          <PillButton active={addOpen} onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen} disabled={locked}>
            <Plus aria-hidden className="size-4" />
            <span>Thêm thẻ</span>
            <PillCaret />
          </PillButton>

          {addOpen && (
            <PillMenu label="Chọn loại thẻ" onClose={() => setAddOpen(false)}>
              {ADD_ITEMS.map((item) => (
                <PillMenuItem key={item.kind} onSelect={() => addBlock(item.kind)}>
                  <span className="mt-0.5 text-fg-muted">{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg-strong">{item.label}</span>
                    <span className="block truncate text-caption text-fg-muted">{item.hint}</span>
                  </span>
                </PillMenuItem>
              ))}
            </PillMenu>
          )}
        </div>
      </div>
    </PromptProjectContext.Provider>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Hai mẩu chrome
   ══════════════════════════════════════════════════════════════════════════ */

/** "Đã lưu 14:32" — đọc từ `updatedAt` của chính tài liệu, không từ đồng hồ máy. */
function SaveState({ updatedAt, dirty, saving, error }: {
  updatedAt: string;
  dirty: boolean;
  saving: boolean;
  error: unknown;
}) {
  if (error) {
    return (
      <p role="alert" className="text-caption text-danger">
        Chưa lưu được — thay đổi vẫn còn trên máy này.
      </p>
    );
  }
  if (saving) return <p className="text-caption text-fg-muted">Đang lưu…</p>;
  if (dirty) return <p className="text-caption text-fg-muted">Có thay đổi chưa lưu</p>;
  if (!updatedAt) return <p className="text-caption text-fg-muted">Chưa lưu lần nào</p>;
  const at = new Date(updatedAt);
  const clock = Number.isNaN(at.getTime())
    ? updatedAt
    : `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return <p className="text-caption text-fg-muted">Đã lưu {clock}</p>;
}

/** Câu hỏi CHẶN — xem khối chú thích đầu file để biết vì sao nó chặn chứ không nhắc. */
function LegacyDraftGate({ onAccept }: { onAccept: () => void }) {
  return (
    <div role="alertdialog" aria-label="Thay bản nháp cũ" className="flex flex-wrap items-center gap-3 rounded-2 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-subtitle text-fg-strong">Dự án này đang có một bản nháp kiểu cũ</p>
        <p className="text-body text-fg-muted">
          Bản nháp 6 bước của trình thuật sĩ không đọc được bằng cách soạn prompt. Bắt đầu soạn ở đây sẽ THAY nó — thao
          tác này không hoàn tác được. Chưa bấm thì chưa có gì bị ghi đè.
        </p>
      </div>
      <Button variant="danger" onClick={onAccept}>Thay bằng bản soạn prompt</Button>
    </div>
  );
}
