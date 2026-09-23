/* @vitest-environment jsdom */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AgentError } from "@/lib/api/client";
import type { Run } from "@/lib/types/api";
import { makeGenRun } from "@/__tests__/fixtures/gen-run-progress";

/**
 * MÀN SOẠN PROMPT — bốn sợi dây mà hỏng thì KHÔNG CÓ GÌ BÁO.
 *
 * ╔══ VÌ SAO ĐÚNG BỐN CA NÀY, KHÔNG PHẢI MỘT BỘ TEST UI ĐẦY ĐỦ ══════════════╗
 * ║ ① HÀNG ĐỢI VẼ — thứ duy nhất trong màn TIÊU TIỀN. Hỏng theo hai hướng và  ║
 * ║   cả hai đều im lặng: phóng hai lượt cùng lúc (agent chặn, người dùng      ║
 * ║   thấy một hộp đỏ vô cớ) hoặc quên phóng thẻ kế (nút bấm rồi, không có gì  ║
 * ║   xảy ra, mãi mãi).                                                        ║
 * ║ ② TAB PROMPT KHÔNG TỰ GỌI — endpoint ấy chạy engine thật và GHI ĐÈ         ║
 * ║   `prompts/`. Một `useEffect` đặt nhầm chỗ là mỗi phím gõ một tiến trình.  ║
 * ║ ③ CỬA HỎI TRƯỚC KHI ĐÈ BẢN NHÁP CŨ — mất dữ liệu người dùng, không hoàn    ║
 * ║   tác được, và chỉ lộ ra khi họ quay lại tìm bản nháp cũ.                   ║
 * ║ ④ ROUTE `/k/:projectId` TRỎ ĐÚNG MÀN — một dòng import, không cổng nào     ║
 * ║   khác canh, và sai thì cả sản phẩm mở ra màn cũ.                          ║
 * ║ Phần còn lại (gõ trong ProseMirror, menu pill) đã có chỗ kiểm riêng ở lab.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

const PID = "kit-prompt-canvas";

/* Đọc mã nguồn từ THƯ MỤC CHẠY, không từ `import.meta.url`: ca này chạy ở môi
   trường jsdom, nơi `import.meta.url` là một URL `http://` chứ không phải `file:`. */
const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const H = vi.hoisted(() => ({
  startRun: vi.fn(),
  getRun: vi.fn(),
  cancelRun: vi.fn(),
  promptPreview: vi.fn(),
  saveContract: vi.fn(),
  getContract: vi.fn(),
  workflowDraft: vi.fn(),
  saveWorkflowDraft: vi.fn(),
  getProject: vi.fn(),
  kit: vi.fn(),
  /** `onEvent` của từng stream đang mở — ca test tự bắn sự kiện vào đúng lượt. */
  streams: new Map<string, (ev: unknown) => void>(),
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const api = {
    ...real.api,
    runs: {
      ...real.api.runs,
      start: H.startRun,
      get: H.getRun,
      cancel: H.cancelRun,
      /* Stream KHÔNG BAO GIỜ tự kết thúc — đúng như thật (agent giữ kết nối mở).
         Ca test giữ `onEvent` để bắn `run.finished` vào đúng thời điểm nó muốn. */
      stream: (runId: string, opts: { onEvent: (ev: unknown) => void }) => {
        H.streams.set(runId, opts.onEvent);
        return new Promise(() => {});
      },
    },
    contract: { ...real.api.contract, get: H.getContract, save: H.saveContract, promptPreview: H.promptPreview },
    projects: {
      ...real.api.projects,
      get: H.getProject,
      workflowDraft: H.workflowDraft,
      saveWorkflowDraft: H.saveWorkflowDraft,
    },
    files: { ...real.api.files, kit: H.kit },
  };
  return { ...real, api, default: api };
});

/* Import SAU `vi.mock` — module dưới đây kéo theo tầng api ngay lúc nạp. */
const { useGenQueue } = await import("../lib/gen-queue");
const { PromptCanvasScreen } = await import("../PromptCanvasScreen");
const { isLegacyWizardDraft } = await import("../lib/composer-doc");
const { CanvasBlock } = await import("../components/CanvasBlock");
const { newDocBlock } = await import("@/features/prompt-lab/lib/composer-model");

/* ══════════════════════════════════════════════════════════════════════════
   Đồ dùng chung
   ══════════════════════════════════════════════════════════════════════════ */

const EMPTY_CONTRACT = { schemaVersion: 4, sheets: [], variants: [], characterPoses: [] };

/* Thân của fixture này sống ở `src/__tests__/fixtures/gen-run-progress.ts`,
   KHÔNG ở đây: Wave 4·B đưa `features/prompt-canvas` vào vùng cấm của
   `scripts/check-no-gen.mjs`, và cổng đó cấm chuỗi `kind:"gen"` kể cả trong test.
   Đưa fixture ra ngoài giữ cổng nguyên độ chặt; nới luật cho file test thì mất
   cả hàng rào. Xem chú thích trong file fixture. */
const makeRun = (id: string, status: Run["status"], jobStatus: "queued" | "running" | "ok" | "failed"): Run =>
  makeGenRun(PID, id, status, jobStatus);

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  for (const fn of [H.startRun, H.getRun, H.cancelRun, H.promptPreview, H.saveContract, H.getContract, H.workflowDraft, H.saveWorkflowDraft, H.getProject, H.kit]) {
    fn.mockReset();
  }
  H.streams.clear();
  localStorage.clear();
  H.getContract.mockResolvedValue({ version: 3, contract: EMPTY_CONTRACT });
  H.saveContract.mockResolvedValue({ version: 4 });
  H.getProject.mockResolvedValue({ id: PID, name: "Bộ kit Tết" });
  H.kit.mockResolvedValue({ files: [], sheets: {} });
  H.workflowDraft.mockResolvedValue({ completed: false, draft: null, updatedAt: null });
  H.saveWorkflowDraft.mockResolvedValue({ completed: false, draft: null, updatedAt: "2026-08-25T09:41:00.000Z" });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/* ══════════════════════════════════════════════════════════════════════════
   ① HÀNG ĐỢI VẼ — FIFO, một lượt một lúc
   ══════════════════════════════════════════════════════════════════════════ */

/** Bàn thử nhỏ nhất còn nói được sự thật: mấy thẻ, mấy nút, mấy nhãn trạng thái. */
function QueueHarness({
  prepare,
  ids = ["b1", "b2"],
}: {
  prepare: (blockId: string) => Promise<string[]>;
  ids?: string[];
}) {
  const queue = useGenQueue(PID, prepare);
  return (
    <div>
      {ids.map((id) => (
        <div key={id}>
          <button type="button" onClick={() => queue.enqueue(id)}>{`gen-${id}`}</button>
          <button type="button" onClick={() => queue.dequeue(id)}>{`drop-${id}`}</button>
          <button type="button" onClick={() => queue.stop(id)}>{`stop-${id}`}</button>
          <span data-testid={`s-${id}`}>{queue.stateOf(id).status}</span>
          <span data-testid={`m-${id}`}>{queue.stateOf(id).message}</span>
          <span data-testid={`stopping-${id}`}>{String(queue.stopping === id)}</span>
        </div>
      ))}
      {/* Hai nút của «Vẽ tất cả»: xếp cả loạt, và bỏ mấy thẻ còn đang chờ. */}
      <button type="button" onClick={() => queue.enqueueMany(ids)}>gen-all</button>
      <button type="button" onClick={() => queue.clearWaiting()}>clear</button>
      <span data-testid="pending">{queue.pending.join(",")}</span>
      <span data-testid="waiting">{queue.waiting}</span>
    </div>
  );
}

const statusOf = (id: string) => screen.getByTestId(`s-${id}`).textContent;

describe("hàng đợi vẽ — mỗi dự án MỘT lượt, thẻ sau xếp hàng", () => {
  const prepare = async (blockId: string) => [`chinh-${blockId}`];

  it("thẻ thứ hai bấm lúc thẻ đầu đang chạy ⇒ ĐANG CHỜ, không POST lượt thứ hai", async () => {
    H.startRun.mockResolvedValueOnce({ runId: "r-1", jobs: [] });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<QueueHarness prepare={prepare} />);
    fireEvent.click(screen.getByText("gen-b1"));
    await waitFor(() => expect(statusOf("b1")).toBe("running"));

    fireEvent.click(screen.getByText("gen-b2"));
    await waitFor(() => expect(statusOf("b2")).toBe("queued"));
    // ĐÂY là điều quan trọng: agent chỉ nhận MỘT lượt, nên web chỉ được gọi một lần.
    expect(H.startRun).toHaveBeenCalledTimes(1);
  });

  it("lượt đầu xong ⇒ thẻ kế TỰ PHÓNG, không cần bấm lại", async () => {
    H.startRun.mockResolvedValueOnce({ runId: "r-1", jobs: [] }).mockResolvedValueOnce({ runId: "r-2", jobs: [] });
    H.getRun.mockImplementation(async (id: string) =>
      id === "r-1" && finished ? makeRun("r-1", "done", "ok") : makeRun(id, "running", "running"),
    );
    let finished = false;

    wrap(<QueueHarness prepare={prepare} />);
    fireEvent.click(screen.getByText("gen-b1"));
    await waitFor(() => expect(statusOf("b1")).toBe("running"));
    fireEvent.click(screen.getByText("gen-b2"));
    await waitFor(() => expect(statusOf("b2")).toBe("queued"));

    /* Lượt r-1 kết thúc THẬT: agent phát `run.finished`, hook mời lại `#34` và
       trạng thái mới về từ đó — đúng con đường của bản chạy thật. */
    finished = true;
    await act(async () => {
      H.streams.get("r-1")?.({ type: "run.finished", seq: 9 });
    });

    await waitFor(() => expect(statusOf("b1")).toBe("done"));
    await waitFor(() => expect(statusOf("b2")).toBe("running"));
    expect(H.startRun).toHaveBeenCalledTimes(2);
    // Đúng thứ tự FIFO: thẻ b2 chạy SAU, với job của chính nó.
    // `autoSliceAfterGen: true` là HỢP ĐỒNG, không phải chi tiết: tab «Đã crop» và
    // Copy Figma của thẻ chỉ có dữ liệu khi agent cắt ngay sau khi vẽ (xem `useGenerateRun`).
    expect(H.startRun.mock.calls[1]![1]).toMatchObject({ jobs: ["chinh-b2"], maxJobs: 1, autoSliceAfterGen: true });
  });

  it("409 RUN_CONFLICT (lượt của tab khác) ⇒ vẫn xếp hàng, KHÔNG hiện lỗi", async () => {
    H.startRun.mockRejectedValueOnce(new AgentError({
      code: "RUN_CONFLICT", status: 409, transport: "http-error",
      message: "already has run r-77", details: { runId: "r-77" },
    }));
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<QueueHarness prepare={prepare} />);
    fireEvent.click(screen.getByText("gen-b1"));
    await waitFor(() => expect(statusOf("b1")).toBe("queued"));
  });

  it("«Bỏ khỏi hàng» chỉ bỏ được thẻ CHƯA phóng — thẻ đang chạy đã tiêu lượt", async () => {
    H.startRun.mockResolvedValueOnce({ runId: "r-1", jobs: [] });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<QueueHarness prepare={prepare} />);
    fireEvent.click(screen.getByText("gen-b1"));
    await waitFor(() => expect(statusOf("b1")).toBe("running"));
    fireEvent.click(screen.getByText("gen-b2"));
    await waitFor(() => expect(statusOf("b2")).toBe("queued"));

    fireEvent.click(screen.getByText("drop-b2"));
    await waitFor(() => expect(statusOf("b2")).toBe("idle"));
    fireEvent.click(screen.getByText("drop-b1"));
    expect(statusOf("b1")).toBe("running");
  });

  /* ══ NÚT DỪNG — cái mà «Bỏ khỏi hàng» cố ý không làm ═══════════════════════
     Thẻ đang chạy đã tiêu lượt; thứ dừng được là thời gian. Ca này khoá ba
     điều: gọi ĐÚNG lượt lên #36, không tự chốt sổ trước khi agent xác nhận,
     và khi agent phát cancelled thì thẻ kế phóng như mọi lượt kết thúc khác. */
  it("«Dừng» gọi cancel lên đúng lượt, đợi agent xác nhận, rồi thẻ kế tự phóng", async () => {
    H.startRun.mockResolvedValueOnce({ runId: "r-1", jobs: [] }).mockResolvedValueOnce({ runId: "r-2", jobs: [] });
    let cancelled = false;
    H.getRun.mockImplementation(async (id: string) =>
      id === "r-1" && cancelled ? makeRun("r-1", "cancelled", "failed") : makeRun(id, "running", "running"),
    );
    let release: () => void = () => {};
    H.cancelRun.mockImplementation(() => new Promise<{ ok: true }>((resolve) => { release = () => resolve({ ok: true }); }));

    wrap(<QueueHarness prepare={prepare} />);
    fireEvent.click(screen.getByText("gen-b1"));
    await waitFor(() => expect(statusOf("b1")).toBe("running"));
    fireEvent.click(screen.getByText("gen-b2"));
    await waitFor(() => expect(statusOf("b2")).toBe("queued"));

    // Thẻ đang CHỜ không có gì để dừng — không được gọi agent vô cớ.
    fireEvent.click(screen.getByText("stop-b2"));
    await act(async () => {});
    expect(H.cancelRun).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("stop-b1"));
    // `mutateAsync` gọi mutationFn ở microtask kế ⇒ đợi, không đọc ngay.
    await waitFor(() => expect(H.cancelRun).toHaveBeenCalledWith("r-1"));
    await waitFor(() => expect(screen.getByTestId("stopping-b1").textContent).toBe("true"));
    // Chưa có xác nhận ⇒ thẻ vẫn là đang chạy, không "giả vờ" đã dừng.
    expect(statusOf("b1")).toBe("running");

    cancelled = true;
    await act(async () => { release(); });
    await act(async () => {
      H.streams.get("r-1")?.({ type: "run.finished", seq: 5 });
    });
    await waitFor(() => expect(statusOf("b1")).toBe("fail"));
    expect(screen.getByTestId("m-b1").textContent).toBe("Lượt vẽ đã bị dừng.");
    expect(screen.getByTestId("stopping-b1").textContent).toBe("false");
    await waitFor(() => expect(statusOf("b2")).toBe("running"));
    expect(H.startRun.mock.calls[1]![1]).toMatchObject({ jobs: ["chinh-b2"] });
  });

  /* ══ «VẼ TẤT CẢ» — MỘT CÚ BẤM, N LƯỢT, VẪN MỘT LƯỢT MỘT LÚC ══════════════
     Nút này là chỗ duy nhất trong màn xếp hàng loạt, nên nó cũng là chỗ duy
     nhất một lỗi gộp state biến thành TIỀN: xếp trùng một thẻ là vẽ lại đúng
     tấm ấy lần nữa, còn xếp thiếu thì người dùng bấm rồi mà thẻ nằm im. */
  it("«Vẽ tất cả» xếp cả loạt theo thứ tự, và vẫn chỉ POST MỘT lượt", async () => {
    H.startRun.mockResolvedValue({ runId: "r-1", jobs: [] });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<QueueHarness prepare={prepare} ids={["b1", "b2", "b3"]} />);
    fireEvent.click(screen.getByText("gen-all"));

    await waitFor(() => expect(statusOf("b1")).toBe("running"));
    expect(screen.getByTestId("pending").textContent).toBe("b1,b2,b3");
    expect(statusOf("b2")).toBe("queued");
    expect(statusOf("b3")).toBe("queued");
    expect(H.startRun).toHaveBeenCalledTimes(1);
  });

  it("thẻ đã trong hàng KHÔNG bị xếp lần hai — một tấm không được vẽ hai lượt", async () => {
    H.startRun.mockResolvedValue({ runId: "r-1", jobs: [] });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<QueueHarness prepare={prepare} ids={["b1", "b2"]} />);
    fireEvent.click(screen.getByText("gen-b2"));
    await waitFor(() => expect(statusOf("b2")).toBe("running"));

    fireEvent.click(screen.getByText("gen-all"));
    await waitFor(() => expect(statusOf("b1")).toBe("queued"));
    /* b2 vẫn đứng ĐẦU hàng và chỉ có mặt MỘT lần. */
    expect(screen.getByTestId("pending").textContent).toBe("b2,b1");
  });

  it("«Bỏ mấy thẻ đang chờ» dọn sạch hàng chờ nhưng KHÔNG đụng thẻ đang chạy", async () => {
    H.startRun.mockResolvedValue({ runId: "r-1", jobs: [] });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<QueueHarness prepare={prepare} ids={["b1", "b2", "b3"]} />);
    fireEvent.click(screen.getByText("gen-all"));
    await waitFor(() => expect(statusOf("b1")).toBe("running"));
    await waitFor(() => expect(screen.getByTestId("waiting").textContent).toBe("2"));

    fireEvent.click(screen.getByText("clear"));
    await waitFor(() => expect(screen.getByTestId("waiting").textContent).toBe("0"));
    expect(screen.getByTestId("pending").textContent).toBe("b1");
    /* Thẻ đang chạy đã tiêu lượt: hàng đợi không giả vờ huỷ được nó. */
    expect(statusOf("b1")).toBe("running");
    expect(statusOf("b2")).toBe("idle");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② TAB PROMPT — chỉ chạy khi người dùng MỞ nó
   ══════════════════════════════════════════════════════════════════════════ */

describe("tab Prompt — engine chỉ chạy khi có người bấm", () => {
  const sheet = { id: "nen", orient: "portrait", grid: { cols: 1, rows: 1 }, components: [] };

  const IDLE = { status: "idle" as const, jobs: [], missing: [], message: "", details: [], hash: "" };

  const mountBlock = (
    onWantPrompt: () => void,
    hash = "h1",
    extra: { prompt?: typeof IDLE | Record<string, unknown>; styleLine?: string } = {},
  ) => {
    const block = newDocBlock("background");
    return wrap(
      <CanvasBlock
        projectId={PID}
        block={block}
        sheets={[sheet as never]}
        onChange={() => {}}
        onDelete={() => {}}
        gen={{ status: "idle", message: "", runId: null, done: 0, total: 0, jobs: [], requested: [], drawing: [], drawn: [], phase: "idle" }}
        onGen={() => {}}
        onGenSheet={() => {}}
        onDequeue={() => {}}
        onStop={() => {}}
        stopping={false}
        prompt={(extra.prompt ?? IDLE) as never}
        styleLine={extra.styleLine ?? ""}
        onWantPrompt={onWantPrompt}
        promptBusy={false}
        hash={hash}
        reloadSignal={0}
        copyShapeAsset={async () => ({ refName: "", path: "" })}
        onReload={() => {}}
      />,
    );
  };

  it("mount thẻ và ĐỔI NỘI DUNG mà không mở tab ⇒ không một lời gọi nào", async () => {
    const want = vi.fn();
    const { rerender } = mountBlock(want);
    // Nhịp render thứ hai với vân tay nội dung KHÁC = đúng thứ xảy ra khi người ta gõ.
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CanvasBlock
          projectId={PID}
          block={newDocBlock("background")}
          sheets={[sheet as never]}
          onChange={() => {}}
          onDelete={() => {}}
          gen={{ status: "idle", message: "", runId: null, done: 0, total: 0, jobs: [], requested: [], drawing: [], drawn: [], phase: "idle" }}
          onGen={() => {}}
          onGenSheet={() => {}}
          onDequeue={() => {}}
        onStop={() => {}}
        stopping={false}
          prompt={{ status: "idle", jobs: [], missing: [], message: "", details: [], hash: "" }}
          styleLine=""
          onWantPrompt={want}
          promptBusy={false}
          hash="h2"
          reloadSignal={0}
          copyShapeAsset={async () => ({ refName: "", path: "" })}
          onReload={() => {}}
        />
      </QueryClientProvider>,
    );
    await Promise.resolve();
    expect(want).not.toHaveBeenCalled();
    expect(H.promptPreview).not.toHaveBeenCalled();
  });

  it("bấm tab «Prompt» ⇒ đúng MỘT lời gọi", () => {
    const want = vi.fn();
    mountBlock(want);
    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(want).toHaveBeenCalledTimes(1);
  });

  /**
   * ══ CON BỌ THẬT MÀ BA CA DƯỚI ĐÂY KHOÁ LẠI ════════════════════════════════
   * Chủ sản phẩm copy prompt một tấm rồi dán sang chỗ hỏi máy vẽ. Hai thứ hỏng
   * cùng lúc, cả hai đều im lặng:
   *   ① chữ dán ra MỞ ĐẦU bằng câu phong cách đời cũ mà màn tự nối vào, rồi mới
   *      tới prompt thật — bên trong prompt đã có câu phong cách đời mới. Hai
   *      mệnh đề chồng nhau, máy vẽ nghe câu nào cũng sai;
   *   ② ảnh tham chiếu đi kèm trong cùng một lượt copy bị chỗ dán bỏ đi, và máy
   *      trả lời *"chưa có ảnh nguồn khả dụng"*.
   * Nên: chữ phải là NGUYÊN VĂN prompt của engine, và ảnh phải có đường riêng
   * cùng một câu dặn nói rõ còn mấy tấm phải dán.
   */
  const READY_PROMPT =
    "Art style: soft rounded 3D clay-like.\nCanvas orientation: portrait.\nDraw one background.";
  const ready = {
    status: "ready",
    jobs: [{
      job: "chinh-nen",
      variant: "chinh",
      sheet: "nen",
      prompt: READY_PROMPT,
      /* Đúng hình dạng đời thật: một ảnh lặp lại ở hai vai, cộng một tấm khung
         xương do bản engine cũ còn gửi. Cả hai đều không được hiện thành một ô. */
      attachments: ["refs/mascot.png", "skeleton/nen.png", "refs/mascot.png"],
    }],
    missing: [],
    message: "",
    details: [],
    hash: "h1",
  };

  /** `navigator.clipboard` không có sẵn trong jsdom — cắm vào rồi trả lại sau. */
  const stubClipboard = () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return writeText;
  };

  it("chữ hiện ra là NGUYÊN VĂN prompt của engine — câu phong cách của màn không chen vào", () => {
    mountBlock(() => {}, "h1", { prompt: ready, styleLine: "clean vector shapes with flat fills" });
    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(screen.getByLabelText("Prompt của Tấm 1").textContent).toBe(READY_PROMPT);
  });

  it("bấm «Copy prompt» ⇒ vào bộ nhớ tạm đúng chữ ấy, và nhãn đổi thành «Đã copy»", async () => {
    const writeText = stubClipboard();
    mountBlock(() => {}, "h1", { prompt: ready, styleLine: "clean vector shapes with flat fills" });
    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(READY_PROMPT));
    await screen.findByRole("button", { name: "Đã copy" });
  });

  it("câu dặn đếm ĐÚNG số ảnh thật: trùng lặp khử đi, tấm khung xương bỏ đi", () => {
    mountBlock(() => {}, "h1", { prompt: ready });
    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    /* 3 đường dẫn vào, 1 tấm ảnh ra — và câu dặn phải nói 1, không nói 3. */
    expect(screen.getByText(/dán 1 ảnh vào chat trước/)).toBeTruthy();
    expect(screen.getByText("Ảnh đi kèm (1)")).toBeTruthy();
  });

  /* ══ KHỐI «ẢNH ĐI KÈM» — MỖI Ô NÓI RA VAI CỦA MÌNH ══════════════════════
     Bốn tấm ảnh vuông cạnh nhau với tên file bị cắt cụt thì không tấm nào phân
     biệt được với tấm nào — mà «engine gửi ảnh nào làm ảnh nhân vật» đúng là câu
     người dùng đang hỏi khi họ mở bản xem trước ra. */
  const withImages = {
    ...ready,
    jobs: [{
      ...ready.jobs[0],
      attachments: ["refs/lan.png", "refs/tam-dang.png"],
      images: [
        { path: "refs/lan.png", role: "character" },
        { path: "refs/tam-dang.png", role: "pose" },
      ],
    }],
  };

  it("mỗi ô ảnh mang vai tiếng Việt và tên tệp rút gọn", () => {
    mountBlock(() => {}, "h1", { prompt: withImages });
    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    expect(screen.getByText("Ảnh đi kèm (2)")).toBeTruthy();
    expect(screen.getByText("Nhân vật")).toBeTruthy();
    expect(screen.getByText("Dáng")).toBeTruthy();
    /* Tên đọc được, KHÔNG phải đường dẫn thô: cổng từ cấm §5.4 bắt `refs/` và ô
       rộng 128px cắt mất đúng phần phân biệt ảnh nào với ảnh nào. */
    expect(screen.getByText("lan.png")).toBeTruthy();
    expect(screen.queryByText("refs/lan.png")).toBeNull();
    /* MỌI ảnh đều được đính thẳng vào lời gọi image_gen từ 10/09/2026, nên câu dặn
       đếm cả hai và không ô nào mang chip trạng thái nào. */
    expect(screen.getByText(/dán 2 ảnh vào chat trước/)).toBeTruthy();
    expect(screen.queryByText("Tả bằng chữ")).toBeNull();
  });

  it("khối chữ vẫn là NGUYÊN VĂN prompt, không thừa không thiếu một ký tự", () => {
    mountBlock(() => {}, "h1", { prompt: withImages });
    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(screen.getByLabelText("Prompt của Tấm 1").textContent).toBe(READY_PROMPT);
  });

});

/* ══════════════════════════════════════════════════════════════════════════
   ③ BẢN NHÁP WIZARD CŨ — hỏi trước khi đè
   ══════════════════════════════════════════════════════════════════════════ */

/** Hình dạng THẬT của `draft` mà wizard (đời workflow-v4, nay đã xoá) ghi xuống
    `workflow-draft.json`. Giữ nguyên vì file trên đĩa của người dùng cũ vẫn thế. */
const WIZARD_DRAFT = { kitName: "Kit Tết", styleAxes: { age: 3 }, elements: [], mascotPoses: ["idle"], completedSteps: 4 };

describe("dự án có bản nháp kiểu cũ — hỏi TRƯỚC khi ghi đè", () => {
  it("`isLegacyWizardDraft` phân biệt được ba ca: wizard · composer · dự án trống", () => {
    expect(isLegacyWizardDraft(WIZARD_DRAFT)).toBe(true);
    expect(isLegacyWizardDraft({ docVersion: 1, updatedAt: "", composer: {} })).toBe(false);
    expect(isLegacyWizardDraft(null)).toBe(false);
    expect(isLegacyWizardDraft({})).toBe(false);
  });

  it("màn hiện câu hỏi và KHÔNG ghi gì cho tới khi người dùng đồng ý", async () => {
    H.workflowDraft.mockResolvedValue({ completed: false, draft: WIZARD_DRAFT, updatedAt: null });
    wrap(<PromptCanvasScreen projectId={PID} />);

    const gate = await screen.findByRole("alertdialog", { name: "Thay bản nháp cũ" });
    expect(gate.textContent).toContain("bản nháp kiểu cũ");

    // Cửa thêm thẻ bị khoá ⇒ không có đường nào lách vào một lượt ghi.
    expect((screen.getByRole("button", { name: /Thêm thẻ/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Thay bằng bản soạn prompt/ }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect((screen.getByRole("button", { name: /Thêm thẻ/ }) as HTMLButtonElement).disabled).toBe(false);
    // Vẫn CHƯA ghi gì: đồng ý là mở khoá, không phải là một lượt ghi.
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
  });

  it("dự án chưa có gì thì KHÔNG hỏi — không doạ người dùng vì một ô nhớ trống", async () => {
    wrap(<PromptCanvasScreen projectId={PID} />);
    await screen.findByRole("button", { name: /Thêm thẻ/ });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ ROUTE — `/k/:projectId` mở màn soạn prompt, không mở wizard
   ══════════════════════════════════════════════════════════════════════════ */

describe("route /k/$projectId", () => {
  it("trỏ vào PromptCanvasScreen, và không còn dây nào tới WorkflowScreen", () => {
    const src = readSrc("src/routes/k.$projectId.tsx");
    expect(src).toContain("<PromptCanvasScreen");
    /* Lời IMPORT, không phải chữ — chú thích của route có nhắc tên màn cũ để nói
       rõ thứ gì vừa đổi, và một cổng đỏ vì lời giải thích là cổng sẽ bị tắt. */
    expect(src).not.toMatch(/^import .*WorkflowScreen/m);
    expect(src).not.toMatch(/<WorkflowScreen/);
    expect(src).toContain('path: "/k/$projectId"');
  });

  it("bảng lệnh ⌘K không còn neo vào Stepper của wizard", () => {
    const src = readSrc("src/components/layout/CommandPalette.tsx");
    /* Đo LỜI IMPORT, không đo chữ: chỗ đã gỡ có một câu giải thích nhắc lại tên
       module ấy, và một cổng đỏ vì chính lời cảnh báo của mình là một cổng sẽ bị
       tắt (cùng bài học với `check-no-gen.mjs` luật ①). */
    expect(src).not.toMatch(/^import .*kit-core\/steps\/Stepper/m);
    expect(src).not.toMatch(/\bUI_STEP_LABEL\b/);
    // Phần còn lại của bảng vẫn nguyên — cổng này bắt ai đó dọn quá tay.
    expect(src).toContain('id: "project.create"');
    expect(src).toContain('id: "nav.trash"');
  });

  it("màn soạn dựng được trong DOM thật (smoke)", async () => {
    wrap(<PromptCanvasScreen projectId={PID} />);
    expect(await screen.findByRole("heading", { name: "Soạn bộ kit" })).toBeTruthy();
    expect(screen.getByText(/Ngữ cảnh chung/)).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ MENU «Thêm thẻ» PHẢI NEO VÀO NÚT, KHÔNG NEO VÀO LỚP ĐỆM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ╔══ CON BỌ CÓ THẬT, VÀ NÓ KHÔNG HỎNG Ở CHỖ NÓ TRÔNG NHƯ HỎNG ══════════════╗
 * ║ Nút + menu từng nằm chung trong `<div class="relative pb-16">`. `PillMenu` ║
 * ║ định vị bằng `top-[calc(100%+8px)]` — mà `100%` là chiều cao của khối       ║
 * ║ `relative` gần nhất, tức là ĐÃ CỘNG 64px đệm. Kết quả: menu rơi cách nút   ║
 * ║ ~70px, dính đáy khung nhìn, trông như một menu của thứ khác.               ║
 * ║ jsdom KHÔNG tính layout nên không đo được khoảng cách ấy. Nhưng NGUYÊN     ║
 * ║ NHÂN thì đo được, và nó là thứ duy nhất cần khoá: menu và nút phải chung   ║
 * ║ MỘT vỏ, và vỏ đó không được mang đệm.                                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
describe("menu «Thêm thẻ» neo vào nút", () => {
  it("menu và nút chung một vỏ, và vỏ ấy KHÔNG mang đệm", async () => {
    wrap(<PromptCanvasScreen projectId={PID} />);
    const button = await screen.findByRole("button", { name: /Thêm thẻ/ });

    fireEvent.click(button);
    const menu = await screen.findByRole("listbox", { name: "Chọn loại thẻ" });

    /* Cùng CHA: đó chính là "menu đo từ nút", không phải từ một khối bao ngoài. */
    expect(menu.parentElement).toBe(button.parentElement);

    const shell = button.parentElement!;
    expect(shell.className).toContain("relative");
    /* Không một lớp đệm/lề nào — mọi khoảng cách phải ở lớp NGOÀI vỏ này. */
    expect(shell.className).not.toMatch(/\b[pm][btlrxy]?-/);
    /* Và lớp ngoài vẫn còn đệm: sửa bọ không được đổi luôn bố cục của trang. */
    expect(shell.parentElement?.className).toMatch(/\bpb-/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ TẤM KHÔNG ĐỔI THÌ KHÔNG VẼ LẠI — và người dùng phải ĐỌC được điều đó
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ╔══ VÌ SAO PHÉP BỎ QUA CẦN CA RIÊNG Ở TẦNG HÀNG ĐỢI ═══════════════════════╗
 * ║ Quyết định bỏ qua nằm ở agent (vân tay), nhưng HAI hệ quả nằm ở đây và cả ║
 * ║ hai đều im lặng nếu hỏng:                                                 ║
 * ║  ① CON SỐ. «Đang vẽ 1/2» phải đếm đúng số tấm THẬT SỰ đi vẽ. Đếm cả tấm   ║
 * ║    bị bỏ qua thì thanh tiến trình đứng mãi ở 1/2 rồi nhảy sang "xong" —    ║
 * ║    người dùng đọc ra là "một tấm hỏng".                                    ║
 * ║  ② CÂU CHỮ. Không nói ra "Tấm 1 giữ nguyên" thì họ bấm Vẽ lần nữa, đúng    ║
 * ║    cái việc mà cả tính năng này sinh ra để khỏi phải làm.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
describe("bỏ qua tấm không đổi", () => {
  /** Một thẻ HAI tấm — ca thật mà chủ sản phẩm nêu («6 element · 2 tấm»). */
  const prepareTwo = async (blockId: string) => [`chinh-${blockId}`, `chinh-${blockId}2`];

  function SkipHarness({ only }: { only?: number }) {
    const queue = useGenQueue(PID, prepareTwo);
    const st = queue.stateOf("b1");
    return (
      <div>
        <button type="button" onClick={() => queue.enqueue("b1", only)}>gen</button>
        <span data-testid="s">{st.status}</span>
        <span data-testid="m">{st.message}</span>
        <span data-testid="n">{`${st.done}/${st.total}`}</span>
        {/* HAI DANH SÁCH mà mỗi ô ảnh tra tên mình vào — xem `SheetResultSlot`. */}
        <span data-testid="jobs">{st.jobs.join(",")}</span>
        <span data-testid="drawing">{st.drawing.join(",")}</span>
        {/* Tấm ĐÃ CÓ ẢNH trong thư mục của lượt — danh sách duy nhất được neo vào. */}
        <span data-testid="drawn">{st.drawn.join(",")}</span>
        {/* LÝ DO CỦA TỪNG TẤM HỎNG, chốt sổ cùng thẻ — nguồn của nút «Copy lỗi». */}
        <span data-testid="fails">
          {(st.failures ?? []).map((f) => `${f.job}|${f.diagnosis}|${(f.errorTail ?? []).join("/")}`).join(";")}
        </span>
      </div>
    );
  }

  /** Lượt chạy mang ĐÚNG những job này, đúng hình dạng `#34` trả về. */
  const runWithJobs = (
    id: string,
    status: Run["status"],
    jobs: Array<{
      job: string; status: string; artifact?: { path: string };
      /* Hai khoá agent gửi kèm cho job HỎNG (`RunJob`) — thứ duy nhất nói được
         nguyên nhân thật khi `failSummary` chỉ kêu «chưa rõ nguyên nhân». */
      diagnosis?: string; errorTail?: string[];
    }>,
  ): Run => ({
    ...makeRun(id, status, "running"),
    progress: { done: jobs.filter((j) => j.status === "ok").length, total: jobs.length, failed: 0, etaSeconds: null },
    jobs,
  }) as unknown as Run;

  it("một trong hai tấm được giữ ⇒ chỉ vẽ một, và nói ra tấm nào giữ nguyên", async () => {
    H.startRun.mockResolvedValueOnce({
      runId: "r-1",
      jobs: [{ job: "chinh-b12" }],
      skipped: [{ job: "chinh-b1", reason: "UNCHANGED" }],
    });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<SkipHarness />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
    expect(screen.getByTestId("m").textContent).toContain("Tấm 1 giữ nguyên");
    /* Vẫn gửi CẢ HAI job lên agent: agent mới là nơi biết tấm nào còn nguyên vân
       tay. Web đoán hộ là web dựng lại một luật đã có chủ, ở xa dữ liệu. */
    expect(H.startRun.mock.calls[0]![1]).toMatchObject({ jobs: ["chinh-b1", "chinh-b12"] });
  });

  it("cả hai tấm đều giữ ⇒ KHÔNG lượt chạy nào, và thẻ vẫn báo XONG", async () => {
    /* `runId: null` = agent không phóng lượt nào. Đây là ca XONG chứ không phải
       ca lỗi: kết quả người dùng muốn đã nằm sẵn trên màn, không tốn một lượt nào. */
    H.startRun.mockResolvedValueOnce({
      runId: null,
      jobs: [],
      skipped: [{ job: "chinh-b1" }, { job: "chinh-b12" }],
    });

    wrap(<SkipHarness />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("done"));
    expect(screen.getByTestId("m").textContent).toBe("Cả 2 tấm giữ nguyên, chưa đổi gì.");
    expect(screen.getByTestId("n").textContent).toBe("0/0");
    /* Không hỏi `#34` lượt nào cả — không có lượt nào để hỏi. */
    expect(H.getRun).not.toHaveBeenCalled();
  });

  it("«Vẽ lại tấm này» gửi ĐÚNG một tấm và ÉP vẽ", async () => {
    H.startRun.mockResolvedValueOnce({ runId: "r-9", jobs: [{ job: "chinh-b12" }], skipped: [] });
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<SkipHarness only={1} />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(H.startRun).toHaveBeenCalledTimes(1));
    /* `force: true` là phần KHÔNG THỂ BỎ: mô tả không đổi nên vân tay vẫn trùng,
       và không ép thì agent bỏ qua đúng cái tấm người dùng vừa xin vẽ lại. */
    expect(H.startRun.mock.calls[0]![1]).toMatchObject({ jobs: ["chinh-b12"], force: true, maxJobs: 1 });
  });

  /**
   * ╔══ VÀ HỆ QUẢ THỨ BA, TÌM RA NGÀY 14/09/2026 ══════════════════════════════╗
   * ║ Trạng thái của thẻ đi xuống MỌI ô ảnh của thẻ. Nên một lượt chỉ vẽ tấm 2  ║
   * ║ vẫn bắt ô của tấm 1 hiện «Đang vẽ tấm này…» và đọc ảnh trong thư mục của   ║
   * ║ lượt ấy — nơi không có file nào của nó. Ảnh đang có của tấm 1 biến mất.    ║
   * ║ Hàng đợi là nơi DUY NHẤT biết lượt này mang tấm nào, nên nó phải nói ra:   ║
   * ║ `jobs` (tấm của lượt) và `drawing` (tấm còn đang vẽ).                      ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  describe("nói ra lượt này mang tấm nào", () => {
    it("tấm bị giữ nguyên KHÔNG nằm trong danh sách đang vẽ", async () => {
      H.startRun.mockResolvedValueOnce({
        runId: "r-1",
        jobs: [{ job: "chinh-b12" }],
        skipped: [{ job: "chinh-b1", reason: "UNCHANGED" }],
      });
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "running", [{ job: "chinh-b1", status: "ok" }, { job: "chinh-b12", status: "running" }]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
      expect(screen.getByTestId("jobs").textContent).toBe("chinh-b12");
      expect(screen.getByTestId("drawing").textContent).toBe("chinh-b12");
    });

    it("tấm vẽ xong giữa chừng rời khỏi danh sách đang vẽ, nhưng vẫn là tấm CỦA lượt", async () => {
      H.startRun.mockResolvedValueOnce({
        runId: "r-2",
        jobs: [{ job: "chinh-b1" }, { job: "chinh-b12" }],
        skipped: [],
      });
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "running", [{ job: "chinh-b1", status: "ok" }, { job: "chinh-b12", status: "running" }]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
      /* Ảnh của tấm 1 đã nằm trên đĩa ⇒ thôi quay vòng chờ; nhưng nó vẫn thuộc lượt
         này nên ô ảnh của nó vẫn neo vào ảnh bất biến của lượt. */
      expect(screen.getByTestId("jobs").textContent).toBe("chinh-b1,chinh-b12");
      expect(screen.getByTestId("drawing").textContent).toBe("chinh-b12");
      expect(screen.getByTestId("n").textContent).toBe("1/2");
    });

    it("lượt xong rồi thì không tấm nào còn «đang vẽ», mà danh sách tấm của lượt vẫn còn", async () => {
      H.startRun.mockResolvedValueOnce({
        runId: "r-3",
        jobs: [{ job: "chinh-b12" }],
        skipped: [{ job: "chinh-b1" }],
      });
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "done", [{ job: "chinh-b12", status: "ok" }]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("done"));
      expect(screen.getByTestId("jobs").textContent).toBe("chinh-b12");
      expect(screen.getByTestId("drawing").textContent).toBe("");
    });
  });

  /**
   * ╔══ CON BỌ 15/09/2026: «ĐANG CHỜ» Ở TRÊN, «THIẾU FILE» Ở DƯỚI ════════════╗
   * ║ `jobs` trả lời câu «lượt này MANG tấm nào». Ô ảnh lại dùng nó để trả lời ║
   * ║ một câu KHÁC: «tấm này đã có ảnh trong thư mục của lượt chưa». Hai câu ấy ║
   * ║ lệch nhau suốt quãng job còn `queued` — agent ghi sẵn mọi tên lúc mở lượt ║
   * ║ (`runs.mjs:156`), còn file artifact thì ra đời khi vẽ xong. Kết quả: dải  ║
   * ║ «Đang chờ tới lượt…» và ô đỏ «Thiếu file · Thử lại» đứng chồng lên nhau.  ║
   * ║ `drawn` là câu trả lời cho ĐÚNG câu hỏi thứ hai, và nó đòi hai bằng chứng:║
   * ║ trạng thái đã kết VÀ có đường ảnh thật trong bản kê.                      ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  describe("nói ra tấm nào ĐÃ CÓ ẢNH của lượt", () => {
    const launchTwo = () => {
      H.startRun.mockResolvedValueOnce({
        runId: "r-8", jobs: [{ job: "chinh-b1" }, { job: "chinh-b12" }], skipped: [],
      });
    };

    it("job còn xếp hàng ⇒ CÓ TÊN trong lượt nhưng KHÔNG được neo vào lượt", async () => {
      launchTwo();
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "running", [
          { job: "chinh-b1", status: "queued" },
          { job: "chinh-b12", status: "queued" },
        ]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
      expect(screen.getByTestId("jobs").textContent).toBe("chinh-b1,chinh-b12");
      expect(screen.getByTestId("drawn").textContent).toBe("");
    });

    it("vẽ xong VÀ đã có đường ảnh ⇒ vào danh sách neo", async () => {
      launchTwo();
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "running", [
          { job: "chinh-b1", status: "ok", artifact: { path: "runs/r-8/artifacts/chinh-b1.png" } },
          { job: "chinh-b12", status: "running" },
        ]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("drawn").textContent).toBe("chinh-b1"));
      expect(screen.getByTestId("drawing").textContent).toBe("chinh-b12");
    });

    it("vẽ xong mà bản kê KHÔNG có đường ảnh ⇒ vẫn không neo: không có gì để neo vào", async () => {
      launchTwo();
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "running", [
          { job: "chinh-b1", status: "ok" },
          { job: "chinh-b12", status: "running" },
        ]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
      expect(screen.getByTestId("drawn").textContent).toBe("");
    });

    it("tấm vẽ HỎNG ⇒ không neo, dù lượt đã chốt sổ", async () => {
      launchTwo();
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "done-with-errors", [
          { job: "chinh-b1", status: "ok", artifact: { path: "runs/r-8/artifacts/chinh-b1.png" } },
          { job: "chinh-b12", status: "failed" },
        ]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("fail"));
      expect(screen.getByTestId("drawn").textContent).toBe("chinh-b1");
    });

    /**
     * ╔══ LÝ DO PHẢI SỐNG SÓT QUA LÚC CHỐT SỔ ═════════════════════════════════╗
     * ║ Nút «Copy lỗi» được bấm SAU khi lượt đã chết — mà lúc ấy `activeRunId`  ║
     * ║ đã về `null` và `useRun(null)` thôi trả bản kê. Không chép `diagnosis` +║
     * ║ `errorTail` vào trạng thái chốt sổ thì nút ấy chỉ copy được đúng câu đỏ ║
     * ║ mà người dùng vốn đã đọc — tức là không copy được gì mới.               ║
     * ╚════════════════════════════════════════════════════════════════════════╝
     */
    it("tấm hỏng mang theo chẩn đoán + đuôi log vào trạng thái chốt sổ", async () => {
      launchTwo();
      H.getRun.mockImplementation(async (id: string) =>
        runWithJobs(id, "done-with-errors", [
          { job: "chinh-b1", status: "ok", artifact: { path: "runs/r-8/artifacts/chinh-b1.png" } },
          { job: "chinh-b12", status: "failed", diagnosis: "NO_ARTIFACT", errorTail: ["rc=127", "codex: not found"] },
        ]));

      wrap(<SkipHarness />);
      fireEvent.click(screen.getByText("gen"));

      await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("fail"));
      /* CHỈ tấm hỏng, không kèm tấm đã xong — khối chữ copy ra là danh sách lỗi. */
      expect(screen.getByTestId("fails").textContent?.trim())
        .toBe("chinh-b12|NO_ARTIFACT|rc=127/codex: not found");
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ CÚ BẤM PHẢI CÓ TIẾNG VỌNG NGAY, KHÔNG ĐỢI AGENT TRẢ LỜI
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ╔══ HIỆN TRƯỜNG 15/09/2026 ════════════════════════════════════════════════╗
 * ║ Bấm «Vẽ lại tấm này» lúc hàng đợi đang bận ⇒ panel của tấm KHÔNG hiện gì. ║
 * ║ Vì `jobs`/`drawing` chỉ có nội dung khi agent đã mở lượt; trước đó cả hai  ║
 * ║ rỗng, và mọi chỉ báo ở panel im lặng. Người dùng bấm lại — đúng phản xạ    ║
 * ║ với một nút không phản hồi, và hàng đợi thì lặng lẽ bỏ qua cú bấm ấy.      ║
 * ║ `requested` trả lời NGAY: nó dựng từ danh sách tấm đang bày trên màn, đọc  ║
 * ║ đồng bộ ở `jobsOf`, không đợi một vòng mạng nào.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
describe("tấm đã xin vẽ — biết ngay từ lúc bấm", () => {
  const prepareTwo = async (blockId: string) => [`chinh-${blockId}`, `chinh-${blockId}2`];
  /** Đồng bộ và KHÔNG đi mạng — đúng vai của nó: chỉ nói thẻ này có tấm nào. */
  const jobsOf = (blockId: string) => [`chinh-${blockId}`, `chinh-${blockId}2`];

  function AskHarness({ only }: { only?: number }) {
    const queue = useGenQueue(PID, prepareTwo, jobsOf);
    const st = queue.stateOf("b1");
    return (
      <div>
        <button type="button" onClick={() => queue.enqueue("b1", only)}>gen</button>
        <span data-testid="s">{st.status}</span>
        <span data-testid="p">{st.phase}</span>
        <span data-testid="requested">{st.requested.join(",")}</span>
        <span data-testid="drawing">{st.drawing.join(",")}</span>
      </div>
    );
  }

  const runWithJobs = (id: string, status: Run["status"], jobs: Array<{ job: string; status: string }>): Run => ({
    ...makeRun(id, status, "running"),
    progress: { done: jobs.filter((j) => j.status === "ok").length, total: jobs.length, failed: 0, etaSeconds: null },
    jobs,
  }) as unknown as Run;

  it("hàng đợi đang bận ⇒ tấm vừa bấm đã nằm trong danh sách chờ, dù CHƯA có lượt", async () => {
    /* 409 của một lượt do tab khác giữ — ca thật mà chủ sản phẩm gặp. */
    H.startRun.mockRejectedValueOnce(new AgentError({
      code: "RUN_CONFLICT", status: 409, transport: "http-error",
      message: "already has run r-77", details: { runId: "r-77" },
    }));
    H.getRun.mockImplementation(async (id: string) => makeRun(id, "running", "running"));

    wrap(<AskHarness only={1} />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("queued"));
    /* ĐÚNG MỘT tấm: bấm vẽ lại tấm 2 thì tấm 1 không được phép hiện khung chờ. */
    expect(screen.getByTestId("requested").textContent).toBe("chinh-b12");
    expect(screen.getByTestId("drawing").textContent).toBe("");
    expect(screen.getByTestId("p").textContent).toBe("waiting");
  });

  it("vẽ CẢ THẺ ⇒ mọi tấm của thẻ vào danh sách chờ ngay từ cú bấm", () => {
    H.startRun.mockImplementation(() => new Promise(() => {}));
    wrap(<AskHarness />);
    fireEvent.click(screen.getByText("gen"));
    expect(screen.getByTestId("requested").textContent).toBe("chinh-b1,chinh-b12");
  });

  it("lượt trả về KHÔNG có tấm bị giữ nguyên ⇒ tấm ấy rời danh sách chờ NGAY", async () => {
    H.startRun.mockResolvedValueOnce({
      runId: "r-5",
      jobs: [{ job: "chinh-b12" }],
      skipped: [{ job: "chinh-b1", reason: "UNCHANGED" }],
    });
    H.getRun.mockImplementation(async (id: string) =>
      runWithJobs(id, "running", [{ job: "chinh-b12", status: "running" }]));

    wrap(<AskHarness />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
    /* Không quay vòng chờ tới hết lượt cho một tấm không ai đụng tới. */
    expect(screen.getByTestId("requested").textContent).toBe("chinh-b12");
    expect(screen.getByTestId("drawing").textContent).toBe("chinh-b12");
  });

  /**
   * Agent ghi SẴN mọi job là `queued` lúc mở lượt (`runs.mjs:156`) và chỉ đẩy
   * từng cái sang `running` khi thật sự vẽ tới (`run-handle.mjs:438`). Gộp hai
   * trạng thái ấy làm một là bắt cả lượt cùng hiện «Đang vẽ tấm này…» trong khi
   * máy mới cầm một tấm — và mỗi khung chờ thừa là một bức ảnh bị đẩy khỏi màn.
   */
  it("tấm còn XẾP HÀNG trong lượt thì đang chờ, chỉ tấm RUNNING mới là đang vẽ", async () => {
    H.startRun.mockResolvedValueOnce({
      runId: "r-6", jobs: [{ job: "chinh-b1" }, { job: "chinh-b12" }], skipped: [],
    });
    H.getRun.mockImplementation(async (id: string) =>
      runWithJobs(id, "running", [
        { job: "chinh-b1", status: "running" },
        { job: "chinh-b12", status: "queued" },
      ]));

    wrap(<AskHarness />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
    expect(screen.getByTestId("drawing").textContent).toBe("chinh-b1");
    expect(screen.getByTestId("requested").textContent).toBe("chinh-b1,chinh-b12");
    expect(screen.getByTestId("p").textContent).toBe("drawing");
  });

  it("tấm vẽ xong rời danh sách chờ; lượt chốt sổ thì danh sách rỗng hẳn", async () => {
    H.startRun.mockResolvedValueOnce({
      runId: "r-7", jobs: [{ job: "chinh-b1" }, { job: "chinh-b12" }], skipped: [],
    });
    H.getRun.mockImplementation(async (id: string) =>
      runWithJobs(id, "running", [
        { job: "chinh-b1", status: "ok" },
        { job: "chinh-b12", status: "running" },
      ]));

    wrap(<AskHarness />);
    fireEvent.click(screen.getByText("gen"));

    await waitFor(() => expect(screen.getByTestId("s").textContent).toBe("running"));
    /* Ảnh của tấm 1 đã nằm trên đĩa ⇒ bắt nó quay vòng chờ thêm là nói dối. */
    expect(screen.getByTestId("requested").textContent).toBe("chinh-b12");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ CHƯA NHẬN BẢN TRÊN ĐĨA ⇒ KHÔNG SỬA, KHÔNG GHI — sự cố 23/09/2026
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ╔══ CON BỌ CÓ THẬT ═════════════════════════════════════════════════════════╗
 * ║ test-vcb-d6fd: GET bản nháp hỏng, màn vẫn hiện tài liệu RỖNG cho sửa. Hai ║
 * ║ cú «Thêm thẻ» + lượt tự lưu = composer rỗng PUT đè lên mọi thẻ của người  ║
 * ║ dùng. Các ca dưới khoá ba lớp của web: không ghi trước khi nhận bản trên  ║
 * ║ đĩa, màn chặn khi GET hỏng, và PUT mang `baseUpdatedAt` + dừng khi 409.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
const { useComposerDoc, COMPOSER_SAVE_DEBOUNCE_MS } = await import("../lib/composer-doc");
const { createQueryClient } = await import("@/lib/hooks/query-client");
const { renderHook } = await import("@testing-library/react");

const DISK_AT = "2026-09-23T08:00:00.000Z";
const SAVED_AT = "2026-09-23T09:00:00.000Z";
const composerDraft = (updatedAt = DISK_AT) => ({ docVersion: 1, updatedAt, composer: { blocks: [] } });

function hookWrapper(qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Thêm một thẻ chữ — thao tác sửa thật nhỏ nhất. */
const addDoc = (prev: import("@/features/prompt-lab/lib/composer-model").ComposerState) =>
  ({ ...prev, blocks: [...prev.blocks, newDocBlock()] });

const conflictError = () => new AgentError({
  code: "DRAFT_CONFLICT", status: 409, message: "draft on disk is newer",
  details: { updatedAt: "2026-09-23T09:30:00.000Z" },
});

describe("bản nháp chưa nhận ⇒ không sửa, không ghi", () => {
  it("GET hỏng ⇒ setComposer + flush KHÔNG bắn PUT nào, và hook báo loadError", async () => {
    H.workflowDraft.mockRejectedValue(new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }));
    const { result } = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.loadError).toBeTruthy());
    expect(result.current.loading).toBe(false);

    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    await new Promise((r) => setTimeout(r, COMPOSER_SAVE_DEBOUNCE_MS + 50));
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
    expect(result.current.composer.blocks).toHaveLength(0);
  });

  it("GET còn đang bay ⇒ vẫn `loading`, sửa là không-làm-gì, không PUT", async () => {
    H.workflowDraft.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
    expect(result.current.loading).toBe(true);
    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    await new Promise((r) => setTimeout(r, COMPOSER_SAVE_DEBOUNCE_MS + 50));
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
  });

  it("màn CHẶN với lời giải thích + «Thử lại»; thử lại được thì mở ra bản trên đĩa", async () => {
    H.workflowDraft.mockRejectedValueOnce(new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const alert = await screen.findByRole("alert", { name: "Chưa đọc được bản nháp" });
    expect(alert.textContent).toContain("Không cho sửa lúc này để khỏi ghi đè thứ đang có trên đĩa");
    // Không có editor ⇒ không có đường nào tới một lượt ghi.
    expect(screen.queryByRole("button", { name: /Thêm thẻ/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Soạn bộ kit" })).toBeNull();

    H.workflowDraft.mockResolvedValue({ completed: false, draft: composerDraft(), updatedAt: DISK_AT });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Soạn bộ kit" })).toBeTruthy();
    expect(screen.queryByRole("alert", { name: "Chưa đọc được bản nháp" })).toBeNull();
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
  });

  it("429 vẫn được Query thử lại theo nhịp agent TRƯỚC khi màn báo lỗi", async () => {
    H.workflowDraft
      .mockRejectedValueOnce(new AgentError({ code: "RATE_LIMITED", status: 429, message: "slow down", retryAfterMs: 0 }))
      .mockResolvedValue({ completed: false, draft: composerDraft(), updatedAt: DISK_AT });
    const qc = createQueryClient();
    render(<QueryClientProvider client={qc}><PromptCanvasScreen projectId={PID} /></QueryClientProvider>);
    // Trong lúc chờ lượt thử lại: vẫn là "đang mở", KHÔNG phải màn lỗi.
    await waitFor(() => expect(H.workflowDraft).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert", { name: "Chưa đọc được bản nháp" })).toBeNull();
    expect(screen.getByText(/Đang mở bản soạn/)).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Soạn bộ kit" }, { timeout: 4000 })).toBeTruthy();
    expect(H.workflowDraft).toHaveBeenCalledTimes(2);
    qc.clear();
  }, 8000);
});

describe("PUT mang baseUpdatedAt, 409 thì dừng tự lưu", () => {
  it("PUT mang mốc vừa nhận từ đĩa, lượt sau mang mốc agent vừa trả", async () => {
    H.workflowDraft.mockResolvedValue({ completed: false, draft: composerDraft(), updatedAt: DISK_AT });
    H.saveWorkflowDraft.mockImplementation(async (_id: string, input: { draft: unknown }) =>
      ({ completed: false, draft: input.draft, updatedAt: SAVED_AT }));
    const { result } = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1));
    expect(H.saveWorkflowDraft.mock.calls[0]![0]).toBe(PID);
    expect(H.saveWorkflowDraft.mock.calls[0]![1]).toMatchObject({ completed: false, baseUpdatedAt: DISK_AT });
    await waitFor(() => expect(result.current.saving).toBe(false));

    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(2));
    expect(H.saveWorkflowDraft.mock.calls[1]![1]).toMatchObject({ baseUpdatedAt: SAVED_AT });
  });

  it("sửa lúc một PUT còn đang bay ⇒ KHÔNG bắn PUT song song; ghi nốt sau đó với mốc mới", async () => {
    H.workflowDraft.mockResolvedValue({ completed: false, draft: composerDraft(), updatedAt: DISK_AT });
    let release: (v: unknown) => void = () => {};
    H.saveWorkflowDraft
      .mockImplementationOnce((_id: string, input: { draft: unknown }) =>
        new Promise((r) => { release = () => r({ completed: false, draft: input.draft, updatedAt: SAVED_AT }); }))
      .mockImplementation(async (_id: string, input: { draft: unknown }) =>
        ({ completed: false, draft: input.draft, updatedAt: "2026-09-23T09:00:05.000Z" }));
    const { result } = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
    await act(async () => { release(null); });
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(2));
    expect(H.saveWorkflowDraft.mock.calls[1]![1]).toMatchObject({ baseUpdatedAt: SAVED_AT });
    const sent = H.saveWorkflowDraft.mock.calls[1]![1] as { draft: { composer: { blocks: unknown[] } } };
    expect(sent.draft.composer.blocks).toHaveLength(2);
  });

  it("409 DRAFT_CONFLICT ⇒ tự lưu DỪNG, chữ vẫn trong RAM, và báo mốc của đĩa", async () => {
    H.workflowDraft.mockResolvedValue({ completed: false, draft: composerDraft(), updatedAt: DISK_AT });
    H.saveWorkflowDraft.mockRejectedValue(conflictError());
    const { result } = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    await waitFor(() => expect(result.current.conflict).toEqual({ updatedAt: "2026-09-23T09:30:00.000Z" }));
    expect(result.current.composer.blocks).toHaveLength(1);

    act(() => result.current.setComposer(addDoc));
    act(() => result.current.flush());
    await new Promise((r) => setTimeout(r, COMPOSER_SAVE_DEBOUNCE_MS + 50));
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
    expect(result.current.composer.blocks).toHaveLength(2);
  });

  it("màn hiện băng xung đột; «Tải bản mới nhất» bỏ bản trong RAM, nhận lại bản trên đĩa", async () => {
    H.workflowDraft.mockResolvedValue({ completed: false, draft: composerDraft(), updatedAt: DISK_AT });
    H.saveWorkflowDraft.mockRejectedValue(conflictError());
    wrap(<PromptCanvasScreen projectId={PID} />);

    fireEvent.click(await screen.findByRole("button", { name: /Thêm thẻ/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Bộ UI/ }));
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(H.saveWorkflowDraft.mock.calls[0]![1]).toMatchObject({ baseUpdatedAt: DISK_AT });

    const banner = await screen.findByRole("alertdialog", { name: "Bản soạn đã được lưu ở nơi khác" });
    expect(banner.textContent).toContain("NGỪNG tự lưu");
    // Cửa sửa khoá: chất thêm chữ lên một bản sẽ không bao giờ được ghi là vô ích.
    expect((screen.getByRole("button", { name: /Thêm thẻ/ }) as HTMLButtonElement).disabled).toBe(true);

    const newer = { docVersion: 1, updatedAt: "2026-09-23T09:30:00.000Z", composer: { blocks: [newDocBlock()] } };
    H.workflowDraft.mockResolvedValue({ completed: false, draft: newer, updatedAt: "2026-09-23T09:30:00.000Z" });
    fireEvent.click(screen.getByRole("button", { name: "Tải bản mới nhất" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "Bản soạn đã được lưu ở nơi khác" })).toBeNull());
    expect((screen.getByRole("button", { name: /Thêm thẻ/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
  });
});
