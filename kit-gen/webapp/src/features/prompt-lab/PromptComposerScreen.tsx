import * as React from "react";
import { Copy, FlaskConical, Image as ImageIcon, LayoutGrid, Plus, Smile } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

import { OptionPill, PillButton, PillCaret, PillMenu, PillMenuItem } from "./components/pill-ui";
import { BrandColorPills } from "./components/BrandColorPills";
import { DocBlockView } from "./components/DocBlockView";
import { UiKitBlockView } from "./components/UiKitBlockView";
import { MascotBlockView } from "./components/MascotBlockView";
import { usePresets } from "./lib/presets-store";
import {
  initialComposer,
  newDocBlock,
  newMascotBlock,
  newUiKitBlock,
  type Block,
  type BlockKind,
  type ComposerState,
} from "./lib/composer-model";
import { countComposerImages, serializeComposer } from "./lib/serialize-composer";
import "./prompt-lab.css";

/**
 * PromptComposerScreen — bản DEMO "Prompt Composer" theo BLOCK.
 *
 * ╔══ ĐÂY LÀ LAB, KHÔNG PHẢI TÍNH NĂNG ═══════════════════════════════════════╗
 * ║ Không gọi API nào, không đọc/ghi workspace, không nằm trong sitemap §2.1,  ║
 * ║ không có link nào trong UI chính trỏ tới. Vào bằng URL trực tiếp:          ║
 * ║   /lab/prompt-composer                                                     ║
 * ║ Mục đích duy nhất: để team SỜ THỬ nhịp tương tác trước khi quyết có làm    ║
 * ║ thật hay không. Mọi thứ ở đây được phép vứt đi.                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ KIẾN TRÚC: REACT LO CẤU TRÚC, TIPTAP LO CÂU CHỮ ════════════════════════
 * Màn hình là một MẢNG BLOCK do React quản. Block Cảnh nền mount MỘT instance
 * TipTap; block Nhân vật mount một cho câu đầu thẻ (và thêm một cho mỗi dòng dáng
 * khi ở chế độ tự do); block Bộ UI ở chế độ khuôn không mount cái nào (nó là lưới
 * ô, không phải văn bản). Lý do đầy đủ nằm ở đầu `composer-model.ts` — tóm tắt: template
 * không lây giữa các block, xoá block = unmount, thứ tự block = thứ tự mảng, và
 * serialize = map qua mảng rồi ghép.
 *
 * ══ VÌ SAO CÂU MAD-LIB, KHÔNG PHẢI MỘT HÀNG <select> ═══════════════════════
 * Vì câu đó vẫn phải là VĂN BẢN. Người dùng phải xoá được nửa câu, viết thêm một
 * mệnh đề của riêng mình, Ctrl+Z, bôi đen copy cả đoạn — trong khi các pill vẫn
 * là dữ liệu có cấu trúc chứ không phải chữ. Đó đúng là định nghĩa của một
 * rich-text editor có custom node, và là thứ một hàng `<select>` cạnh mấy
 * `<input>` không bao giờ làm được.
 */

const ADD_ITEMS: { kind: BlockKind; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    kind: "background",
    label: "Background",
    hint: "Một tấm nền: khung cảnh, không khí, bố cục",
    icon: <ImageIcon aria-hidden className="size-4" />,
  },
  {
    kind: "uikit",
    label: "Bộ UI (spritesheet)",
    hint: "Danh sách element — hệ thống tự xếp lưới",
    icon: <LayoutGrid aria-hidden className="size-4" />,
  },
  {
    kind: "mascot",
    label: "Nhân vật",
    hint: "Một nhân vật, nhiều dáng — hệ thống tự xếp lưới",
    icon: <Smile aria-hidden className="size-4" />,
  },
];

export function PromptComposerScreen() {
  const presets = usePresets();
  const [state, setState] = React.useState<ComposerState>(() => initialComposer(presets));
  const [addOpen, setAddOpen] = React.useState(false);

  const prompt = React.useMemo(() => serializeComposer(state, presets), [state, presets]);
  const imageCount = React.useMemo(() => countComposerImages(state), [state]);

  const addBlock = (kind: BlockKind) => {
    /* Ba loại, ba hàm dựng: `newDocBlock` nay chỉ còn dựng được Cảnh nền. */
    const block: Block =
      kind === "uikit" ? newUiKitBlock() : kind === "mascot" ? newMascotBlock() : newDocBlock(kind);
    setState((prev) => ({ ...prev, blocks: [...prev.blocks, block] }));
    setAddOpen(false);
  };

  /**
   * Sửa một block bằng HÀM CẬP NHẬT, không bằng giá trị mới.
   *
   * ┌── ĐO ĐƯỢC TRÊN TRÌNH DUYỆT, KHÔNG PHẢI LO XA ───────────────────────────┐
   * │ Bản đầu nhận thẳng `next: Block` do con tự dựng từ prop `block` của nó. │
   * │ Bấm "+ Nút bấm", "+ Icon tiền", "+ Thanh máu" thật nhanh (nhanh hơn một │
   * │ nhịp render) ⇒ CHỈ ô cuối sống sót: cả ba lần bấm đều đọc cùng một      │
   * │ `block.cells` cũ, nên lần sau ghi đè lần trước. Kiểm bằng ba cú `.click()`│
   * │ liên tiếp — 3 element thêm vào, 1 element hiện ra.                       │
   * │ Truyền hàm thì con KHÔNG cần biết trạng thái mới nhất: React đưa nó vào. │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const updateBlock = <T extends Block>(id: string, updater: (prev: T) => T) =>
    setState((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block) => (block.id === id ? updater(block as T) : block)),
    }));

  const removeBlock = (id: string) =>
    setState((prev) => ({ ...prev, blocks: prev.blocks.filter((block) => block.id !== id) }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Đã copy prompt", {
        description: imageCount > 0 ? `Nhớ đính kèm ${imageCount} ảnh tham chiếu vào khung chat.` : undefined,
      });
    } catch {
      /* Clipboard API đòi ngữ cảnh bảo mật (https hoặc localhost) và có thể bị
         từ chối quyền. Nói thẳng thay vì im lặng — người dùng đang đứng trước
         một panel có sẵn chữ, họ bôi đen copy tay được. */
      toast.error("Trình duyệt không cho copy tự động", {
        description: "Bôi đen phần 'Prompt xem trước' rồi copy tay giúp mình.",
      });
    }
  };

  return (
    /* `data-prompt-lab` ở gốc màn — cùng lý do với `PromptCanvasScreen`: luật vòng
       focus mảnh trong `prompt-lab.css` nay nói cho MỌI ô nhập của màn, không chỉ
       cho vùng contenteditable. */
    <div data-prompt-lab="" className="min-h-screen bg-canvas text-fg">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        {/* ── Nhãn lab: phải là thứ ĐẦU TIÊN đọc được trên trang ───────────── */}
        <div className="flex items-start gap-3 rounded-2 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-4 py-3">
          <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
          <div>
            <p className="text-subtitle text-fg-strong">🧪 Lab demo — chưa nối vào luồng tạo kit</p>
            <p className="text-body text-fg-muted">
              Trang này chỉ để thử nhịp tương tác. Không có gì được gửi đi; ảnh chọn vào chỉ sống trong tab này và mất
              khi tải lại trang. Riêng danh mục preset thì lưu trong trình duyệt của bạn.
            </p>
          </div>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-display-2 text-fg-strong">Prompt Composer</h1>
            <p className="text-body text-fg-muted">
              Đặt ngữ cảnh chung, rồi thêm từng block. Bấm pill để đổi; trong block tự do gõ{" "}
              <kbd className="rounded-1 border border-line bg-raised px-1.5 py-0.5 text-mono">/</kbd> để chèn pill.
            </p>
          </div>
          <Button variant="secondary" asChild>
            <Link to="/lab/prompt-composer/presets">Quản lý preset</Link>
          </Button>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* ── Cột trái: ngữ cảnh chung + danh sách block ──────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Ngữ cảnh chung là hàng pill REACT THUẦN, không phải một editor.
                Nó không có câu chữ để soạn — chỉ hai lựa chọn — nên mount một
                ProseMirror cho nó là trả giá một editor để lấy về hai dropdown. */}
            <section className="rounded-3 border border-line-subtle bg-surface p-5">
              <h2 className="mb-2 text-label uppercase tracking-wide text-fg-muted">Ngữ cảnh chung</h2>
              <p className="flex flex-wrap items-center gap-2 text-display font-normal text-fg-strong">
                <span>Bộ kit theme</span>
                <OptionPill
                  kind="theme"
                  value={state.themeValue}
                  onChange={(themeValue) => setState((prev) => ({ ...prev, themeValue }))}
                />
                <span>phong cách</span>
                <OptionPill
                  kind="style"
                  value={state.styleId}
                  onChange={(styleId) => setState((prev) => ({ ...prev, styleId }))}
                />
                <span>, màu thương hiệu</span>
                <BrandColorPills
                  colors={state.brandColors}
                  onChange={(updater) => setState((prev) => ({ ...prev, brandColors: updater(prev.brandColors) }))}
                />
                <span>.</span>
              </p>
              <p className="mt-2 text-caption text-fg-muted">
                Mọi block bên dưới kế thừa ngữ cảnh này; theme và phong cách thì từng block vẫn ghi đè riêng được.
              </p>
            </section>

            {state.blocks.map((block) => {
              const onDelete = () => removeBlock(block.id);
              if (block.kind === "uikit") {
                return (
                  <UiKitBlockView
                    key={block.id}
                    block={block}
                    onChange={(updater) => updateBlock(block.id, updater)}
                    onDelete={onDelete}
                  />
                );
              }
              if (block.kind === "mascot") {
                return (
                  <MascotBlockView
                    key={block.id}
                    block={block}
                    onChange={(updater) => updateBlock(block.id, updater)}
                    onDelete={onDelete}
                  />
                );
              }
              return (
                <DocBlockView
                  key={block.id}
                  block={block}
                  onChange={(updater) => updateBlock(block.id, updater)}
                  onDelete={onDelete}
                />
              );
            })}

            {/* ── Cửa DUY NHẤT để thêm cấu trúc ───────────────────────────── */}
            <div className="relative">
              <PillButton active={addOpen} onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
                <Plus aria-hidden className="size-4" />
                <span>Thêm block</span>
                <PillCaret />
              </PillButton>

              {addOpen && (
                <PillMenu label="Chọn loại block" onClose={() => setAddOpen(false)}>
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

          {/* ── Cột phải: prompt xem trước ──────────────────────────────────── */}
          <section className="sticky top-6 flex flex-col gap-3 rounded-3 border border-line-subtle bg-surface p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-title text-fg-strong">Prompt xem trước</h2>
              <span className="text-caption text-fg-muted">{prompt.length} ký tự</span>
            </div>

            <p className="text-caption text-fg-muted">
              Đây là CHÍNH XÁC chuỗi mà nút bên dưới copy — pill đã đổi thành cụm tiếng Anh.
            </p>

            {/* `whitespace-pre-wrap`: prompt có xuống dòng thật (mỗi block một
                đoạn), mất nó là mọi block dính thành một khối. */}
            <pre className="max-h-[60vh] min-h-32 flex-1 overflow-auto whitespace-pre-wrap rounded-2 border border-line-subtle bg-canvas p-4 text-mono text-fg">
              {prompt || "— chưa có gì —"}
            </pre>

            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-fg-muted">
                {imageCount > 0 ? `${imageCount} ảnh tham chiếu — đính kèm tay vào chat` : "Chưa có ảnh tham chiếu"}
              </span>
              <Button variant="primary" onClick={copy} disabled={!prompt}>
                <Copy aria-hidden />
                Copy prompt
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
