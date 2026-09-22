/* @vitest-environment jsdom */
/**
 * THẺ HỎNG PHẢI ĐƯA ĐƯỢC LÝ DO RA KHỎI MÁY NGƯỜI DÙNG.
 *
 * ╔══ HIỆN TRƯỜNG ══════════════════════════════════════════════════════════╗
 * ║ Người dùng Windows: thẻ đỏ «1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ để   ║
 * ║ thử lại.» — bấm lại, hỏng lại. Lý do thật (`errorTail` agent đã gửi kèm)  ║
 * ║ nằm ngay trong bản kê lượt nhưng KHÔNG có bề mặt nào bày nó ra, nên cách  ║
 * ║ duy nhất là có người bảo họ đi đào `logs/<job>.log` trên đĩa.             ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 *
 * Bộ ca này soi đúng ba thứ NGƯỜI DÙNG chạm vào, ở tầng thật (vỏ thẻ → nút):
 *  ① nút chỉ có mặt khi thẻ ĐANG hỏng — không mọc ra ở thẻ vừa vẽ xong;
 *  ② bấm ⇒ clipboard nhận đúng khối chữ, và nút tự nói «Đã copy»;
 *  ③ trình duyệt không cho ghi ⇒ KHÔNG báo xong, mà bày chữ ra để copy tay
 *    (§3.9: "thao tác thất bại mà không phản hồi gì" là điều tuyệt đối cấm).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import type { Block, UiKitBlock } from "@/features/prompt-lab/lib/composer-model";
import type { GenBlockState } from "../../lib/gen-queue";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}

vi.mock("@/features/kit/components/KitImage", () => ({
  KitImage: (p: { path: string; alt: string }) => <img alt={p.alt} data-path={p.path} />,
}));
vi.mock("@/features/kit/lib/image-source", () => ({
  loadFull: () => ({ promise: Promise.resolve("blob:x"), cancel: () => {} }),
  forgetProject: vi.fn(),
}));
vi.mock("@/features/kit/lib/download", () => ({
  saveProjectFile: vi.fn(() => Promise.resolve({ fileName: "x.png", bytes: 1 })),
}));
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn(),
}));
vi.mock("@/features/kit/lib/figma-kit-doc", () => ({
  BOARD_W: 2400,
  packKitDoc: () => ({ groups: [], skipped: [], width: 2400, height: 100 }),
  cellsOf: () => [],
  copyKitDoc: () => Promise.resolve({ html: "", docs: 0, bytes: 0 }),
}));
vi.mock("@/features/kit/lib/figma-board", () => ({
  PHASE_LABEL: { 1: "a", 2: "b", 3: "c", 4: "d" },
  BoardCancelled: class BoardCancelled extends Error {},
  buildFigmaBoard: () => Promise.resolve({ outcome: "clipboard", files: 0, width: 1, height: 1 }),
}));

const CONTRACT = {
  schemaVersion: 4,
  variants: [{ id: "chinh", vi: "Chính", style: "x" }],
  sheets: [
    { id: "ui", grid: { cols: 2, rows: 2 }, canvas: "square", components: [] },
    { id: "ui2", grid: { cols: 2, rows: 2 }, canvas: "square", components: [] },
  ],
} as never;

/* MOCK MỘT PHẦN như `sheet-drawing.test.tsx`: vỏ thẻ thật kéo theo cả thư viện
   món của người dùng và trạng thái agent, không cái nào liên quan tới câu hỏi ở
   đây. `useAgentStatus` được ghim để dòng đầu của khối chữ đoán được từng chữ —
   thật thì nó là ô cửa nhìn vào vòng probe chung, và một vòng probe THẬT trong
   test là một request ra mạng cùng một cái đồng hồ chạy ngầm. */
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAgentStatus: () => ({
    status: { agentVersion: "3.0.3", workspaceLabel: "~/KitGen" },
    recheck: vi.fn(),
    runBridgeProbe: vi.fn(),
  }),
  useContract: () => ({ data: { version: 1, contract: CONTRACT } }),
  useProject: () => ({ data: { id: "p1", name: "Bộ kit thử", state: { jobs: { "chinh-ui": "ok", "chinh-ui2": "ok" } } } }),
  useKit: () => ({ data: { variant: "chinh", files: [] }, isLoading: false }),
  useRevealProject: () => ({ mutate: vi.fn() }),
  useRuns: () => ({ data: { items: [] } }),
  useRawHistory: () => ({ data: { items: [] }, isLoading: false }),
  useRestoreRaw: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRawHistory: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { CanvasBlock } = await import("../CanvasBlock");
const { newCell } = await import("@/features/prompt-lab/lib/composer-model");
const { composerBlockSheets } = await import("../../lib/composer-to-contract");

const PRESETS = seedPresets();
const IDS = ["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover", "trophy"];

function uiBlock(): UiKitBlock {
  return { id: "u1", kind: "uikit", mode: "template", cells: IDS.map((id) => newCell(id, PRESETS)) };
}

function sheetsOf(block: Block) {
  return composerBlockSheets(
    {
      themeValue: "", styleId: PRESETS.styles[0]!.id, brandColors: [], themeCustom: "", styleCustom: "",
      brandId: "", contextRefs: [], brandAssets: {}, contextMode: "template", blocks: [block],
    },
    { presets: PRESETS },
  )[0]!.sheets;
}

/** Lượt vừa chết mang theo lý do của TỪNG tấm — đúng hình dạng `run.json` thật. */
const FAILED: GenBlockState = {
  status: "fail", phase: "fail", runId: "r-0034",
  message: "1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ để thử lại.",
  done: 0, total: 1, jobs: ["chinh-ui2"], requested: [], drawing: [], drawn: [],
  failures: [{ job: "chinh-ui2", diagnosis: "UNKNOWN", errorTail: ["rc=127", "codex: command not found"] }],
};

const DONE: GenBlockState = {
  status: "done", phase: "done", runId: "r-0034", message: "Đã vẽ xong",
  done: 1, total: 1, jobs: ["chinh-ui2"], requested: [], drawing: [], drawn: ["chinh-ui2"],
};

function mount(gen: GenBlockState) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /* Nền tảng máy chỉ có khi màn Cài đặt đã từng hỏi `/api/doctor` (endpoint bị
     CẤM poll). Gieo thẳng vào cache để soi đúng đường mà nút đọc. */
  qc.setQueryData(["doctor"], { os: "win32" });
  const block = uiBlock();
  return render(
    <QueryClientProvider client={qc}>
      <CanvasBlock
        projectId="hello-a262"
        block={block}
        sheets={sheetsOf(block) as never}
        onChange={() => {}}
        onDelete={() => {}}
        gen={gen}
        onGen={() => {}}
        onGenSheet={() => {}}
        onDequeue={() => {}}
        onStop={() => {}}
        stopping={false}
        prompt={{ status: "idle", jobs: [], missing: [], message: "", details: [], hash: "" } as never}
        styleLine=""
        onWantPrompt={() => {}}
        promptBusy={false}
        hash="h1"
        reloadSignal={0}
        copyShapeAsset={async () => ({ refName: "", path: "" })}
        onReload={() => {}}
      />
    </QueryClientProvider>,
  );
}

const copyButton = () => screen.getByRole("button", { name: /Copy lỗi|Đã copy/ });

let written: string[] = [];
/** `ok=false` = trình duyệt từ chối ghi (không phải secure context, hoặc chưa cấp quyền). */
function installClipboard(ok: boolean) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        if (!ok) throw new Error("NotAllowedError");
        written.push(text);
      }),
    },
  });
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  written = [];
  installClipboard(true);
});

describe("nút «Copy lỗi» cạnh dòng đỏ của thẻ", () => {
  it("chỉ có mặt khi thẻ đang hỏng", () => {
    mount(DONE);
    expect(screen.queryByRole("button", { name: /Copy lỗi/ })).toBeNull();
    cleanup();
    mount(FAILED);
    expect(copyButton()).toBeTruthy();
  });

  it("bấm ⇒ clipboard nhận đủ bốn phần, và nút xác nhận «Đã copy»", async () => {
    mount(FAILED);
    fireEvent.click(copyButton());

    await waitFor(() => expect(written).toHaveLength(1));
    const lines = written[0]!.split("\n");
    /* Dòng đầu: version công cụ local + nền tảng lấy từ cache doctor + mã dự án
       + mã lượt. Mốc thời gian là đồng hồ thật nên chỉ soi hình dạng. */
    expect(lines[0]).toMatch(/^KitGen v3\.0\.3 · win32 · project hello-a262 · run r-0034 · \d{4}-/);
    /* Câu thứ hai PHẢI y hệt câu đỏ người dùng đang nhìn — hai câu khác nhau cho
       cùng một lỗi là hai sự thật. */
    expect(lines[1]).toBe("1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ để thử lại.");
    expect(lines.slice(2)).toEqual([
      "— chinh-ui2: lỗi chưa rõ nguyên nhân",
      "  rc=127",
      "  codex: command not found",
      "log đầy đủ: ~/KitGen/projects/hello-a262/logs/chinh-ui2.log",
    ]);

    await waitFor(() => expect(screen.getByRole("button", { name: /Đã copy/ })).toBeTruthy());
  });

  it("clipboard bị từ chối ⇒ KHÔNG báo xong, bày nguyên khối chữ ra để copy tay", async () => {
    installClipboard(false);
    mount(FAILED);
    fireEvent.click(copyButton());

    await waitFor(() => expect(screen.getByText("Không copy được — chọn và copy tay")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Đã copy/ })).toBeNull();
    const box = screen.getByLabelText("Chi tiết lỗi để copy tay");
    expect(box.textContent).toContain("codex: command not found");
    expect(box.textContent).toContain("log đầy đủ: ~/KitGen/projects/hello-a262/logs/chinh-ui2.log");
  });
});
