import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Image as ImageIcon, LayoutGrid, Plus, Settings, Smile, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { AgentError } from "@/lib/api/client";
import { contractConflictDetailsSchema } from "@/lib/types/api";
import { useAgentStatus, useContract, useProject, useSaveContract } from "@/lib/hooks";
import type { Contract } from "@/lib/types/contract";

import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { createNav } from "@/features/projects/lib/nav";
import { useProjectDialogs } from "@/features/projects/lib/useProjectDialogs";
import { ProjectDialogs } from "@/features/projects/ProjectDialogs";
import { ProjectSettingsDialog } from "@/features/project/components/ProjectSettingsDialog";
import { CopyFigmaButton, DownloadKitButton } from "@/features/kit/components/KitExits";
import { DemoScreenButton } from "@/features/demo";

import { PillButton, PillCaret, PillMenu, PillMenuItem, useMenuFlip } from "@/features/prompt-lab/components/pill-ui";
import { ContextSection } from "./components/ContextSection";
import { usePresets } from "@/features/prompt-lab/lib/presets-store";
import {
  newDocBlock,
  newMascotBlock,
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
  composerStyleLine,
  composerToContract,
  narrowContractToSheets,
  type BlockSheets,
  type ComposerContractOptions,
} from "./lib/composer-to-contract";
import { jobIdOf, sheetsHash } from "./lib/block-jobs";
import { useBlockPrompts } from "./lib/block-prompt";
import { useGenQueue } from "./lib/gen-queue";
import { PAGE } from "./lib/ui";
import { ensurePoseRefs } from "./lib/pose-refs";

/**
 * PromptCanvasScreen — MÀN LÀM VIỆC DUY NHẤT của app.
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
 * ╔══ MỘT MÀN, VÀ NĂM CỬA RA NẰM GỌN TRÊN MỘT HÀNG ══════════════════════════╗
 * ║ Chủ sản phẩm chốt: *"bỏ giao diện này đi, chỉ có 1 giao diện prompt,       ║
 * ║ preview trực tiếp trên đấy"*. Màn «Kết quả & xuất kit» (`/p/:id`) đã bị    ║
 * ║ xoá; route của nó nay chỉ chuyển hướng về đây.                             ║
 * ║                                                                            ║
 * ║ Năm thứ màn ấy giữ (tải .zip · copy Figma cả bảng · xem màn demo · cài đặt ║
 * ║ dự án · xoá) chuyển sang `ExitRow` — MỘT hàng nút `sm`, tất cả `ghost`     ║
 * ║ hoặc `secondary`. Cố ý không có banner, không có thẻ, không có nút to:     ║
 * ║ chúng là việc làm MỘT LẦN ở cuối buổi, còn thứ người dùng làm cả buổi là   ║
 * ║ gõ chữ và bấm Vẽ. Nút primary DUY NHẤT của màn nằm trên thẻ («Vẽ · tiêu    ║
 * ║ lượt»); mọi thứ ở hàng này phải nhẹ hơn nó về thị giác.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CÓ MỘT CỬA HỎI TRƯỚC KHI CHO GÕ ════════════════════════════════
 * Tài liệu composer nằm trong `workflow-draft.json` — chính ô nhớ đang chứa bản
 * nháp WIZARD của những dự án làm bằng bản cũ. `migrateComposerDoc` đọc bản ấy ra
 * tài liệu RỖNG (đúng: dịch mò là bịa chữ vào miệng người dùng), nhưng cú
 * `setComposer` đầu tiên sẽ GHI ĐÈ lên nó. Nên trước khi cho gõ chữ đầu tiên,
 * màn hỏi một câu — và trong lúc chưa trả lời thì KHÔNG có một lượt ghi nào.
 *
 * ══ KHUNG TRANG ═══════════════════════════════════════════════════════════
 * `FloraShell` KHÔNG cấp padding nào cho `<main>`. Trước lượt này màn tự dựng một
 * `<div className="flex flex-col gap-4">` trần, nên nội dung dán sát mép trái cửa
 * sổ và trải hết bề ngang màn 27". Đó là lời chê *"sát sàn sạt, không có max
 * width"*. Hộp trang nay là `PAGE` — xem `lib/ui.ts` để biết vì sao 1120px.
 */

const ADD_ITEMS: { kind: BlockKind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: "background", label: "Cảnh nền", hint: "Một cảnh nền: khung cảnh, không khí, ảnh tham chiếu", icon: <ImageIcon aria-hidden className="size-4" /> },
  { kind: "uikit", label: "Bộ UI", hint: "Danh sách món giao diện — hệ thống tự xếp lưới", icon: <LayoutGrid aria-hidden className="size-4" /> },
  { kind: "mascot", label: "Nhân vật", hint: "Một nhân vật: dáng, biểu cảm, trang phục", icon: <Smile aria-hidden className="size-4" /> },
];

export interface PromptCanvasScreenProps {
  projectId: string;
  /**
   * Dialog «Cài đặt dự án» đang mở hay không — ĐỌC TỪ `?settings=` ở tầng route.
   *
   * ══ VÌ SAO TRẠNG THÁI NÀY ĐI BẰNG PROP, KHÔNG PHẢI `Route.useSearch()` ══════
   * `Route.useSearch()` gọi `useMatch`, và `useMatch` NÉM khi không có router phía
   * trên (`Cannot read properties of null (reading 'stores')`). Màn này được dựng
   * ngoài router ở hai chỗ có thật: bộ ca DOM của chính nó, và bất cứ ai muốn xem
   * nó riêng lẻ. Đọc URL ở tầng route rồi truyền xuống giữ cho màn dựng được ở mọi
   * nơi — và giữ đúng ranh giới vốn có: route biết về URL, màn biết về UI.
   *
   * Vắng cả hai prop ⇒ dialog sống trong state của tab. Đó là đường lùi cho ca
   * "dựng ngoài router", KHÔNG phải đường chính: route `/k/$projectId` luôn truyền.
   */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}

export function PromptCanvasScreen({ projectId, settingsOpen, onSettingsOpenChange }: PromptCanvasScreenProps) {
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

  /* Nút «Thêm thẻ» nằm CUỐI một trang cuộn dài, nên nó thường ở sát đáy khung
     nhìn: menu phải biết lật lên trên. Cùng cái móc mà bảng danh mục của thẻ Bộ
     UI dùng, không chép lại phép đo. */
  const { open: addOpen, setOpen: setAddOpen, dropUp: addDropUp, toggle: toggleAdd } = useMenuFlip();
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

  /* Câu phong cách của CẢ BỘ KIT — mỗi thẻ hiện lại nó ở đầu tab Prompt. Dựng MỘT
     lần ở đây (hàm thuần, rẻ) rồi truyền xuống: ba thẻ tự dựng là ba câu có quyền
     lệch nhau. Ném thì để rỗng — khối prompt tổng biến mất, còn cả màn vẫn dùng
     được; cùng tinh thần với `built` ngay trên. */
  const styleLine = React.useMemo(() => {
    try {
      return composerStyleLine(store.composer, contractOpts);
    } catch {
      return "";
    }
  }, [store.composer, contractOpts]);

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
        const outcome = await ensurePoseRefs(projectId, block, contractOpts);
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
    /* Ba loại thẻ, ba hàm dựng khác nhau — `DocBlock` nay CHỈ còn cảnh nền, nên
       không có nhánh "mặc định" nào đúng cho cả ba. */
    const block: Block =
      kind === "uikit" ? newUiKitBlock() : kind === "mascot" ? newMascotBlock() : newDocBlock(kind);
    edit((prev) => ({ ...prev, blocks: [...prev.blocks, block] }));
    setAddOpen(false);
  };

  if (store.loading) {
    return (
      <div className={PAGE}>
        <p className="text-body text-fg-muted">Đang mở bản soạn của dự án…</p>
      </div>
    );
  }

  return (
    <PromptProjectContext.Provider value={projectId}>
      {/* `data-prompt-lab` ở GỐC MÀN, không chỉ quanh mỗi ô soạn thảo. Nó là móc
          của `prompt-lab.css`, và từ lượt này file ấy còn mang luật vòng focus
          mảnh cho MỌI `<input>`/`<textarea>` của màn — ô ghi chú dòng element, ô
          tìm danh mục, hai ô số W×H của pill cỡ, ô hex màu thương hiệu. Đặt móc
          ở từng chỗ thì cứ thêm một ô nhập là thêm một chỗ dễ quên, và chỗ quên
          nào cũng hiện ra thành một vòng xanh 2px lạc lõng giữa màn. */}
      <div data-prompt-lab="" className={`${PAGE} flex flex-col gap-6`}>
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {/* `display-3` (22px) chứ không `DISPLAY` (32→44px): đây là một khu làm
                việc, không phải một trang giới thiệu. Tên dự án đã nằm trên topbar
                và trên `<title>`, nên H1 ở đây chỉ cần nói ĐANG LÀM GÌ. */}
            <h1 className="text-display-3 text-fg-strong">Soạn bộ kit</h1>
            <p className="mt-1 max-w-[68ch] text-body text-fg-muted">
              Đặt ngữ cảnh chung, rồi thêm từng thẻ. Mỗi thẻ có nút Vẽ riêng và tab Prompt để xem chữ engine sẽ gửi.
            </p>
          </div>
          <SaveState updatedAt={store.updatedAt} dirty={store.dirty} saving={store.saving} error={store.saveError} />
        </header>

        <ExitRow projectId={projectId} settingsOpen={settingsOpen} onSettingsOpenChange={onSettingsOpenChange} />

        {locked && <LegacyDraftGate onAccept={() => setReplaceOk(true)} />}

        {buildError && (
          <p role="alert" className="rounded-2 border border-danger/60 bg-danger/[var(--kg-tint-b)] px-4 py-3 text-body text-fg-strong">
            Bản thiết kế chưa dựng được: {buildError}
          </p>
        )}

        <ContextSection composer={store.composer} edit={edit} />

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
            styleLine={styleLine}
            onWantPrompt={() => wantPrompt(block.id)}
            promptBusy={prompts.busy}
            hash={sheetsHash(sheetsOf(block.id))}
            reloadSignal={reloads[block.id] ?? 0}
            onReload={() => setReloads((prev) => ({ ...prev, [block.id]: (prev[block.id] ?? 0) + 1 }))}
          />
        ))}

        {/* Lớp ĐỆM ở NGOÀI, lớp `relative` ôm SÁT nút — hai việc, hai thẻ.
            Gộp làm một (`relative pb-16`) là menu rơi xuống dưới cả 64px đệm, vì
            `top-[calc(100%+8px)]` đo từ đáy khối `relative` chứ không từ đáy nút:
            đó chính là con bọ "menu Thêm thẻ dính đáy màn hình". Xem `PillMenu`. */}
        <div className="pb-16">
          <span className="relative inline-block">
            <PillButton active={addOpen} onClick={toggleAdd} aria-expanded={addOpen} disabled={locked} className="text-body">
              <Plus aria-hidden className="size-4" />
              <span>Thêm thẻ</span>
              <PillCaret />
            </PillButton>

            {addOpen && (
              <PillMenu label="Chọn loại thẻ" dropUp={addDropUp} onClose={() => setAddOpen(false)}>
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
          </span>
        </div>
      </div>
    </PromptProjectContext.Provider>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Hàng cửa ra
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * NĂM CỬA RA của một dự án, gộp vào một hàng nút nhỏ.
 *
 * ╔══ VÌ SAO NÓ TỰ ĐI LẤY DỮ LIỆU CHỨ KHÔNG NHẬN PROP ═══════════════════════╗
 * ║ `useProject`/`useContract` ở đây trả về CÙNG cache TanStack mà màn cha    ║
 * ║ đang đọc (cùng query key) ⇒ không có request thứ hai. Đổi lại, cả khối    ║
 * ║ dialog nặng (`ProjectDialogs`: 7 dialog + wizard nhập) nằm gọn trong một  ║
 * ║ component có thể tháo ra nguyên khối, và thân màn soạn không phải mang    ║
 * ║ thêm sáu state chẳng liên quan gì tới việc soạn chữ.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Ba nút đầu đều **0 đồng** (đọc đĩa · canvas + clipboard) nên không cần `gate`;
 * hai nút cuối có thao tác GHI thật nên phải khoá kèm lý do khi agent chưa chạy
 * hoặc màn quá hẹp (§2.5-2).
 */
function ExitRow({ projectId, settingsOpen, onSettingsOpenChange }: {
  projectId: string;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const nav = React.useMemo(() => createNav(navigate), [navigate]);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);

  const project = useProject(projectId);
  const contract = useContract(projectId);
  /* Ảnh bìa (#42) hỏi theo phong cách đầu tiên — cùng quy ước với `useProjectData`. */
  const variantId = contract.data?.contract.variants?.[0]?.id;

  const all = React.useMemo(() => (project.data ? [project.data] : []), [project.data]);
  const dialogs = useProjectDialogs(all);

  /* Đường lùi khi không ai điều khiển từ ngoài — xem `PromptCanvasScreenProps`. */
  const [localSettings, setLocalSettings] = React.useState(false);
  const open = settingsOpen ?? localSettings;
  const setSettings = onSettingsOpenChange ?? setLocalSettings;

  const data = project.data;
  /* Chưa tải xong dự án ⇒ CHƯA vẽ hàng nút. Vẽ trước rồi bật sáng sau là hàng nút
     nhảy chỗ ngay dưới tay người dùng; và ba trong năm nút cần `project.name`. */
  if (!data) return null;

  const guard = {
    disabled: gate.readOnly,
    "aria-disabled": gate.readOnly || undefined,
    title: gate.readOnly ? gate.reason : undefined,
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle pb-4">
      <DownloadKitButton projectId={projectId} />
      <CopyFigmaButton projectId={projectId} kitName={data.name} />
      <DemoScreenButton projectId={projectId} />
      <span className="flex-1" />
      <Button variant="ghost" size="sm" onClick={() => setSettings(true)}>
        <Settings aria-hidden strokeWidth={1.5} />
        Cài đặt dự án
      </Button>
      <Button variant="ghost" size="sm" {...guard} onClick={() => dialogs.openDialog("delete", data)}>
        <Trash2 aria-hidden strokeWidth={1.5} />
        Xoá
      </Button>

      <ProjectSettingsDialog
        open={open}
        onOpenChange={setSettings}
        project={data}
        gate={gate}
        variantId={variantId}
        onDuplicate={() => { setSettings(false); dialogs.openDialog("duplicate", data); }}
        onExport={() => { setSettings(false); dialogs.openDialog("export", data); }}
        onDelete={() => { setSettings(false); dialogs.openDialog("delete", data); }}
      />

      <ProjectDialogs
        dialogs={dialogs}
        all={all}
        gate={gate}
        nav={nav}
        /* Xoá xong thì không còn màn nào để ở lại — về danh sách (§4.4). */
        onDeleted={() => void navigate({ to: "/" })}
      />
    </div>
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
    <div role="alertdialog" aria-label="Thay bản nháp cũ" className="flex flex-wrap items-center gap-4 rounded-3 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-4 py-3">
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
