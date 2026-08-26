/* @vitest-environment jsdom */
/**
 * TAB «PROMPT» — BỐN CA, VÀ CẢ BỐN ĐỀU LÀ "VÒNG XOAY KHÔNG HỒI KẾT".
 *
 * Chủ sản phẩm báo nguyên văn: *"đang dựng prompt cứ quay tròn không ra gì"*. Mổ ra
 * thì đó không phải một con bọ mà là một HỌ bọ, và điểm chung của cả họ là: mã chạy
 * đúng như viết, chỉ có điều không có nhánh nào đưa trạng thái ra khỏi `"loading"`.
 * Bốn ca dưới đây khoá bốn nhánh ấy:
 *
 *  ① STRICTMODE HẠ CỜ `aliveRef` VĨNH VIỄN — con bọ chính, và là ca đắt nhất vì nó
 *    CHỈ xảy ra khi dev (StrictMode không double-invoke ở bản build). Ca này dựng
 *    hook TRONG `<React.StrictMode>` thật, đúng như `main.tsx` dựng cả app.
 *  ② HẾT 75 GIÂY ⇒ ra CHỮ, không quay tiếp.
 *  ③ AGENT ĐỜI CŨ (404) ⇒ câu nói thẳng phải làm gì, không phải "Không tìm thấy".
 *  ④ KHÔNG NỐI ĐƯỢC ⇒ đổ tội đúng chỗ (đường mạng / công cụ local), không bắt người
 *    dùng đi sửa nội dung thẻ.
 *
 * Ca ① dùng `renderHook` chứ không mount cả màn: con bọ nằm ở vòng đời của MỘT hook,
 * và mount cả màn sẽ kéo theo TipTap + preset store — hai thứ đủ ồn để một ca đỏ vì
 * lý do khác rồi bị nghi oan.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ promptPreview: vi.fn() }));

vi.mock("@/lib/api", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>> };
  return { ...real, api: { ...real.api, contract: { ...real.api.contract, promptPreview: H.promptPreview } } };
});

const { AgentError } = await import("@/lib/api/client");
const { PROMPT_TIMEOUT_MS, describePromptError, useBlockPrompts } = await import("../block-prompt");

const PID = "kit-thu";
const CONTRACT = { schemaVersion: 4, sheets: [], variants: [], characterPoses: [] } as never;
const OK = { jobs: [{ job: "chinh-nen", sheet: "nen", prompt: "vẽ một cảnh nền", attachments: [] }], missing: [] };

/** Bọc StrictMode — ĐÚNG như `main.tsx`. Xem ca ① ở đầu file. */
const strict = ({ children }: { children: React.ReactNode }) => <React.StrictMode>{children}</React.StrictMode>;

/* ⚠️ THÂN KHỐI `{…}`, KHÔNG PHẢI THÂN BIỂU THỨC. `() => mock.mockReset()` TRẢ VỀ
   chính con mock, và vitest coi mọi HÀM mà `beforeEach` trả về là hàm dọn dẹp —
   nên nó GỌI con mock sau mỗi ca. Ca lỗi bắn ra một `AgentError` không ai bắt
   (⇒ đỏ vì lý do không có thật), ca treo trả về lời hứa không bao giờ settle mà
   vitest lại `await` (⇒ "Hook timed out in 10000ms"). Hai ca đỏ, một nguyên nhân. */
beforeEach(() => {
  H.promptPreview.mockReset();
});
/* `useRealTimers()` TRƯỚC `cleanup()`: cleanup của testing-library chạy `act` và chờ
   microtask; để đồng hồ giả còn bật thì nó đợi một nhịp không bao giờ tới. */
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("① dựng dưới StrictMode — cờ `alive` phải sống lại sau cú mount giả", () => {
  it("phản hồi VỀ ĐƯỢC tới state: `loading` → `ready`, không kẹt ở vòng xoay", async () => {
    H.promptPreview.mockResolvedValue(OK);
    const { result } = renderHook(() => useBlockPrompts(PID), { wrapper: strict });

    act(() => result.current.request("b1", "h1", CONTRACT));
    expect(result.current.stateOf("b1").status).toBe("loading");

    await waitFor(() => expect(result.current.stateOf("b1").status).toBe("ready"));
    expect(result.current.stateOf("b1").jobs).toHaveLength(1);
  });

  it("`busy` hạ xuống khi xong — nếu không thì nút «Xem lại» khoá vĩnh viễn", async () => {
    H.promptPreview.mockResolvedValue(OK);
    const { result } = renderHook(() => useBlockPrompts(PID), { wrapper: strict });

    act(() => result.current.request("b1", "h1", CONTRACT));
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it("hỏng cũng phải ra `error` — mọi nhánh đều rời khỏi `loading`", async () => {
    /* `mockImplementation` + `throw`, KHÔNG `mockRejectedValue`: cái sau dựng một
       promise ĐÃ HỎNG ngay lúc khai báo, và nó nằm không ai nghe cho tới khi hook gọi
       tới ⇒ vitest báo "unhandled rejection" và làm đỏ ca vì một lý do không có thật. */
    H.promptPreview.mockImplementation(async () => {
      throw new AgentError({ code: "PROMPT_PREVIEW_FAILED", status: 422 });
    });
    const { result } = renderHook(() => useBlockPrompts(PID), { wrapper: strict });

    act(() => result.current.request("b1", "h1", CONTRACT));
    await waitFor(() => expect(result.current.stateOf("b1").status).toBe("error"));
    expect(result.current.stateOf("b1").message).not.toBe("");
    expect(result.current.busy).toBe(false);
  });
});

describe("② hết 75 giây ⇒ ra chữ, không quay tiếp", () => {
  it("lượt treo vô hạn kết thúc ở `error` kèm câu nói rõ thời gian", async () => {
    vi.useFakeTimers();
    /* Promise KHÔNG BAO GIỜ settle — đúng hình dạng một agent treo. */
    H.promptPreview.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useBlockPrompts(PID), { wrapper: strict });
    /* `await act` để thân của `chainRef.then(...)` KỊP CHẠY — đồng hồ 75s được dựng
       bên trong nó, và một `vi.advanceTimersByTime` gọi trước đó sẽ đẩy kim qua một
       cái hẹn giờ chưa tồn tại. */
    await act(async () => { result.current.request("b1", "h1", CONTRACT); });
    expect(result.current.stateOf("b1").status).toBe("loading");

    /* `...Async`: đẩy kim VÀ nhường microtask giữa mỗi lần bắn. Bản đồng bộ chỉ bắn
       hẹn giờ rồi trả về ngay, trong khi `race → catch → setState` cần vài nhịp. */
    await act(async () => { await vi.advanceTimersByTimeAsync(PROMPT_TIMEOUT_MS + 10); });

    expect(result.current.stateOf("b1").status).toBe("error");
    expect(result.current.stateOf("b1").message).toContain("75 giây");
    expect(result.current.busy).toBe(false);

    /* Trả đồng hồ về thật NGAY TRONG thân ca, trước khi `cleanup()` của afterEach
       chạy: `cleanup()` unmount cây React và chờ một nhịp; với đồng hồ giả còn bật,
       nhịp ấy không bao giờ tới và cả hook treo tới hạn 10s của vitest. */
    vi.useRealTimers();
  });

  it("hạn là 75 giây — số này phải khớp `TIMEOUT.preview` của transport", async () => {
    const { TIMEOUT } = await import("@/lib/api/constants");
    expect(PROMPT_TIMEOUT_MS).toBe(75_000);
    expect(TIMEOUT.preview).toBe(PROMPT_TIMEOUT_MS);
  });
});

describe("③④ dịch lỗi — mỗi ngách một việc phải làm", () => {
  /* Agent bản cài 2.1.43 trả đúng thế này cho một route nó không khai — đo bằng curl
     thật, không phải đoán: `404 · {"error":{"code":"NOT_FOUND","message":"no route
     for POST /api/projects/…/prompt-preview"}}`. */
  it("404 NOT_FOUND ⇒ nói agent đời cũ + việc phải làm, KHÔNG nói «không tìm thấy»", () => {
    const p = describePromptError(new AgentError({
      code: "NOT_FOUND",
      status: 404,
      message: "no route for POST /api/projects/p1/prompt-preview",
      transport: "http-error",
    }));
    expect(p.message).toContain("bản cũ");
    expect(p.message).toContain("Cập nhật KitGen");
    expect(p.message.toLowerCase()).not.toContain("not_found");
    /* Lệnh cho người đang phát triển nằm ở khối gập, không ở câu chính. */
    expect(p.details.join(" ")).toContain("dev:full");
  });

  it("dự án không tồn tại KHÔNG bị nhầm sang ca «agent đời cũ»", () => {
    const p = describePromptError(new AgentError({
      code: "PROJECT_NOT_FOUND", status: 404, transport: "http-error",
    }));
    expect(p.message).not.toContain("bản cũ");
  });

  it("fetch không tới đích ⇒ nói về kết nối, không bắt sửa nội dung thẻ", () => {
    const p = describePromptError(new AgentError({
      code: "AGENT_NOT_RUNNING", status: 0, transport: "unreachable", message: "Failed to fetch",
    }));
    expect(p.message).toContain("Không nối được agent");
  });

  it("409 RUN_ACTIVE vẫn đi qua bảng lỗi chung — ngách này không bị nuốt", () => {
    const p = describePromptError(new AgentError({
      code: "RUN_ACTIVE", status: 409, transport: "http-error", details: { runId: "r-0007" },
    }));
    expect(p.message).toContain("lượt vẽ");
  });

  it("MỌI lỗi đều ra một câu KHÔNG RỖNG — không có ngách nào im lặng", () => {
    for (const e of [new Error("bịch"), "chuỗi trần", null, undefined, { lạ: true }]) {
      expect(describePromptError(e).message.trim()).not.toBe("");
    }
  });
});
