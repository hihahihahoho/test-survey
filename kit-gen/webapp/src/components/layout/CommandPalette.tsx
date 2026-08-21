import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen, Boxes, Compass, Images, Keyboard, LayoutGrid, Pencil, Plus,
  RefreshCw, Settings, Terminal, Trash2, Upload, Wrench,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { KeyboardHint } from "@/components/common";
import { COMMAND_GROUPS, useScreenCommands, type Command, type CommandGroup as Grp } from "./command-registry";
import { UI_STEP_LABEL } from "@/features/workflow-v4/steps/Stepper";

/**
 * ⌘K BẢNG LỆNH (§2.3 + §7.1 MUST).
 *
 * Vì sao là MUST: §5.8-A6 đòi "điều hướng bàn phím đủ". Không có ⌘K thì các
 * hành động như "Tạo project", "Thùng rác", "Kiểm tra lại công cụ local" không
 * có đường bàn phím nào từ mọi màn.
 *
 * Hai nguồn lệnh gộp lại: lệnh toàn cục dựng ở đây + lệnh do màn đang mở tự
 * khai qua `useRegisterCommands` (registry). Màn nào chưa khai thì bảng vẫn đủ
 * phần toàn cục — không màn nào làm vỡ bảng lệnh của màn khác.
 *
 * §2.5-2: lệnh không dùng được ⇒ hiện mờ + badge "Cần công cụ local", KHÔNG ẩn.
 */
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId?: string;
  readOnly: boolean;
  onJumpProject: () => void;
  onRecheckAgent: () => void;
  onShortcutsHelp: () => void;
  /** S1 nghe sự kiện này để mở modal Tạo project (xem ghi chú dưới). */
  onCreateProject: () => void;
  onImportProject: () => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const {
    open, onOpenChange, projectId, readOnly,
    onJumpProject, onRecheckAgent, onShortcutsHelp, onCreateProject, onImportProject,
  } = props;

  const navigate = useNavigate();
  const screenCommands = useScreenCommands();

  const globalCommands = React.useMemo<Command[]>(() => {
    // §2.5-2: nêu LÝ DO thay vì bỏ lệnh khỏi danh sách.
    const gate = readOnly ? "Cần công cụ local đang chạy" : null;
    const go = (fn: () => void) => fn;
    const list: Command[] = [];

    if (projectId) {
      const p = { projectId };
      list.push(
        { id: "p.requirements", group: "Dự án", icon: LayoutGrid, label: "Dự án: Yêu cầu",
          run: go(() => void navigate({ to: "/p/$projectId", params: p, search: { settings: "requirements" } })) },
        { id: "p.style", group: "Dự án", icon: Pencil, label: "Dự án: Phong cách", hint: ["g", "d"], hintSequence: true,
          run: go(() => void navigate({ to: "/p/$projectId", params: p, search: { settings: "style" } })) },
        { id: "p.ui", group: "Dự án", icon: LayoutGrid, label: `Dự án: ${UI_STEP_LABEL}`,
          run: go(() => void navigate({ to: "/p/$projectId", params: p, search: { section: "skeleton" } })) },
        { id: "p.mascot", group: "Dự án", icon: Images, label: "Dự án: Mascot",
          run: go(() => void navigate({ to: "/p/$projectId", params: p, search: { section: "mascot" } })) },
        { id: "p.images", group: "Dự án", icon: Images, label: "Dự án: Ảnh đã tạo", hint: ["g", "r"], hintSequence: true,
          run: go(() => void navigate({ to: "/p/$projectId", params: p, search: { section: "images" } })) },
        { id: "p.settings", group: "Dự án", icon: Settings, label: "Dự án: Cài đặt", hint: ["g", "s"], hintSequence: true,
          run: go(() => void navigate({ to: "/p/$projectId", params: p, search: { settings: "requirements" } })) },
      );
    }

    list.push(
      { id: "project.create", group: "Dự án", icon: Plus, label: "Tạo dự án…", hint: ["n"],
        disabledReason: gate, run: onCreateProject },
      { id: "project.import", group: "Dự án", icon: Upload, label: "Nhập dự án từ tệp cũ…",
        disabledReason: gate, run: onImportProject },
      { id: "project.jump", group: "Dự án", icon: Compass, label: "Chuyển nhanh giữa dự án…", hint: ["mod", "P"],
        run: onJumpProject },

      { id: "nav.projects", group: "Điều hướng", icon: Boxes, label: "Về danh sách dự án", hint: ["g", "p"], hintSequence: true,
        run: go(() => void navigate({ to: "/" })) },
      { id: "nav.settings.agent", group: "Điều hướng", icon: Terminal, label: "Cài đặt · Công cụ local & Thư mục làm việc",
        run: go(() => void navigate({ to: "/settings", search: { tab: "agent" } })) },
      { id: "nav.settings.env", group: "Điều hướng", icon: Wrench, label: "Cài đặt · Môi trường và Tạo ảnh AI",
        run: go(() => void navigate({ to: "/settings", search: { tab: "env" } })) },
      { id: "nav.settings.prefs", group: "Điều hướng", icon: Settings, label: "Cài đặt · Ưu tiên (song song, tự cắt, giao diện)",
        run: go(() => void navigate({ to: "/settings", search: { tab: "prefs" } })) },
      { id: "nav.trash", group: "Điều hướng", icon: Trash2, label: "Thùng rác",
        run: go(() => void navigate({ to: "/trash" })) },
      { id: "nav.settings.about", group: "Điều hướng", icon: Settings, label: "Cài đặt · Phiên bản & quyền riêng tư",
        run: go(() => void navigate({ to: "/settings", search: { tab: "about" } })) },

      { id: "agent.recheck", group: "Công cụ local", icon: RefreshCw, label: "Kiểm tra lại công cụ local", run: onRecheckAgent },

      { id: "help.shortcuts", group: "Trợ giúp", icon: Keyboard, label: "Xem bảng phím tắt", hint: ["?"], run: onShortcutsHelp },
      /* INTEGRATION: `features/docs/**` có bảng tra 40+ mã lỗi nhưng trước đây không
         có lối vào nào từ ⌘K. §2.3 đòi "mọi hành động trong spec phải gọi được từ đây". */
      { id: "help.errors", group: "Trợ giúp", icon: BookOpen, label: "Tra cứu mã lỗi",
        keywords: "loi error ma code huong dan",
        run: go(() => void navigate({ to: "/settings", search: { tab: "env" } })) },
    );
    return list;
  }, [navigate, projectId, readOnly, onCreateProject, onImportProject, onJumpProject, onRecheckAgent, onShortcutsHelp]);

  const all = React.useMemo(() => [...screenCommands, ...globalCommands], [screenCommands, globalCommands]);

  const byGroup = React.useMemo(() => {
    const m = new Map<Grp, Command[]>();
    for (const g of COMMAND_GROUPS) m.set(g, []);
    for (const c of all) m.get(c.group ?? "Điều hướng")?.push(c);
    return m;
  }, [all]);

  const runCommand = (c: Command) => {
    if (c.disabledReason) return; // không chạy, cũng không đóng: user đọc được lý do
    onOpenChange(false);
    // Chạy SAU khi dialog đóng: focus trả về trigger trước, rồi màn mới nhận focus.
    setTimeout(() => {
      try {
        c.run();
      } catch (e) {
        console.error("[⌘K] lệnh lỗi:", c.id, e);
      }
    }, 0);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} label="Bảng lệnh" description="Tìm và chạy mọi hành động">
      <CommandInput placeholder="Gõ tên việc bạn muốn làm… (không cần dấu)" />
      <CommandList>
        <CommandEmpty>Không có lệnh nào khớp.</CommandEmpty>
        {COMMAND_GROUPS.map((g) => {
          const items = byGroup.get(g) ?? [];
          if (items.length === 0) return null;
          return (
            <CommandGroup key={g} heading={g}>
              {items.map((c) => {
                const Icon = c.icon;
                return (
                  <CommandItem
                    key={c.id}
                    value={`${c.label} ${c.keywords ?? ""}`}
                    onSelect={() => runCommand(c)}
                    aria-disabled={c.disabledReason ? true : undefined}
                    /* VERIFIER B1-sót: opacity-60 trên hàng bị khoá cho 3.06:1 (dark) / 2.42:1
                       (light) — đúng bệnh B1, chỉ khác chỗ. Đổi sang màu trung tính đặc
                       (fg-muted = 6.25:1 trên overlay dark · 5.21:1 light). */
                    className={c.disabledReason ? "text-fg-muted" : undefined}
                  >
                    {Icon ? <Icon aria-hidden /> : <span className="size-4" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.disabledReason && <Badge tone="warn">{c.disabledReason}</Badge>}
                    {c.hint && <KeyboardHint keys={c.hint} sequence={c.hintSequence ?? false} className="ml-auto" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
