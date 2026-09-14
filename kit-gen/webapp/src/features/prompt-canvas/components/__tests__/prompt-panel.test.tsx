/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { PromptPreviewJob } from "@/lib/types/api";
import type { BlockPromptState } from "../../lib/block-prompt";
import { joinSheetPrompts } from "../../lib/prompt-copy";
import { PromptPanel } from "../CanvasBlock";

/**
 * TAB «PROMPT» — MỘT TẤM MỘT PROMPT, VÀ NÚT COPY PHẢI COPY ĐÚNG TẤM ĐANG ĐỌC.
 *
 * ╔══ VÌ SAO CA NÀY TỒN TẠI (chủ sản phẩm, 14/09/2026) ══════════════════════╗
 * ║ *"cái copy prompt cũng thế, phải tách riêng cho từng tấm — mỗi prompt      ║
 * ║ giống hệt nhau, khác mỗi phần mô tả"*. Câu sau là cái bẫy: hai prompt      ║
 * ║ giống nhau tới 90% thì MỌI cách hỏng đều trông như đang chạy đúng —        ║
 * ║ copy nhầm tấm, hiện nhầm tấm, nối hai tấm thành một khối không có ranh     ║
 * ║ giới. Không ca nào trong số đó có hộp đỏ; chúng chỉ ra một tấm ảnh sai.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Prompt trong ca này là chữ do ENGINE dựng (agent chạy `gen.sh` thật rồi trả về) —
 * ở đây chúng là fixture có phần đầu GIỐNG HỆT nhau và phần liệt kê ô khác nhau,
 * đúng hình dạng thật. Thứ được khoá là cách màn CHỌN và COPY, không phải cách
 * engine viết chữ.
 */

/** Phần chung của mọi tấm: khổ, luật vẽ, phong cách — engine đặt y hệt nhau. */
const COMMON = [
  "Canvas orientation: landscape 1536x1024",
  "## Art style",
  "chunky cartoon style, Vietnamese Tết festive motifs",
  "## Output",
  "Return exactly one PNG with transparent background.",
].join("\n");

const sheetPrompt = (lines: string[]) => `${COMMON}\n\n## Elements\n${lines.join("\n")}`;

const JOB_ONE = sheetPrompt(["1. button, primary", "2. coin counter", "3. panel", "4. badge"]);
const JOB_TWO = sheetPrompt(["1. popover", "2. trophy"]);

const job = (id: string, prompt: string): PromptPreviewJob => ({
  job: id,
  variant: "chinh",
  sheet: id,
  prompt,
  attachments: [],
  images: [],
});

const ready = (jobs: PromptPreviewJob[]): BlockPromptState => ({
  status: "ready",
  jobs,
  missing: [],
  message: "",
  details: [],
  hash: "h1",
});

function panel(jobs: PromptPreviewJob[]) {
  return render(
    <PromptPanel
      projectId="p1"
      prompt={ready(jobs)}
      styleLine=""
      stale={false}
      canGen
      busy={false}
      onWantPrompt={() => {}}
      hash="h1"
    />,
  );
}

const written: string[] = [];

beforeEach(() => {
  written.length = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async (text: string) => { written.push(text); }) },
  });
});

afterEach(cleanup);

describe("hai tấm ⇒ hai prompt, chọn từng tấm mà đọc", () => {
  it("phần chung của hai tấm bằng nhau TỪNG CHỮ, chỉ phần liệt kê ô khác", () => {
    /* Đây là lời hứa mà cả tính năng dựa vào: nếu phần chung lệch thì "vẽ lại
       riêng một tấm" cho ra một tấm khác lối với tấm bên cạnh. */
    const head = (text: string) => text.split("## Elements")[0];
    expect(head(JOB_TWO)).toBe(head(JOB_ONE));
    expect(JOB_TWO).not.toBe(JOB_ONE);
  });

  it("có hàng chọn «Tấm 1 · Tấm 2», và mặc định đọc tấm 1", () => {
    panel([job("ui", JOB_ONE), job("ui2", JOB_TWO)]);
    expect(screen.getByRole("tab", { name: "Tấm 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tấm 2" })).toBeTruthy();
    expect(screen.getByLabelText("Prompt của Tấm 1").textContent).toBe(JOB_ONE);
    /* MỘT tấm một lúc: hai khối chữ gần giống nhau nằm chồng nhau thì cuộn tới
       đâu cũng không biết mình đang đọc tấm nào. */
    expect(screen.queryByLabelText("Prompt của Tấm 2")).toBeNull();
  });

  it("bấm «Tấm 2» ⇒ đọc prompt của tấm 2", () => {
    panel([job("ui", JOB_ONE), job("ui2", JOB_TWO)]);
    fireEvent.click(screen.getByRole("tab", { name: "Tấm 2" }));
    expect(screen.getByLabelText("Prompt của Tấm 2").textContent).toBe(JOB_TWO);
    expect(screen.queryByLabelText("Prompt của Tấm 1")).toBeNull();
  });

  it("«Copy prompt» chép ĐÚNG tấm đang chọn, không phải tấm đầu", async () => {
    panel([job("ui", JOB_ONE), job("ui2", JOB_TWO)]);
    fireEvent.click(screen.getByRole("tab", { name: "Tấm 2" }));
    fireEvent.click(screen.getByRole("button", { name: /Copy prompt/ }));
    await screen.findByRole("button", { name: /Đã copy/ });
    expect(written).toEqual([JOB_TWO]);
  });

  it("«Copy tất cả» nối đủ hai tấm, có vạch tiêu đề ngăn giữa", async () => {
    panel([job("ui", JOB_ONE), job("ui2", JOB_TWO)]);
    fireEvent.click(screen.getByRole("button", { name: "Copy tất cả" }));
    await vi.waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toBe(joinSheetPrompts([JOB_ONE, JOB_TWO]));
    expect(written[0]).toContain("=== Tấm 1 ===");
    expect(written[0]).toContain("=== Tấm 2 ===");
    expect(written[0]).toContain(JOB_TWO);
  });

  it("một tấm ⇒ KHÔNG hàng chọn, KHÔNG «Copy tất cả», và chữ copy là nguyên văn", async () => {
    panel([job("ui", JOB_ONE)]);
    expect(screen.queryByRole("tab", { name: "Tấm 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy tất cả" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Copy prompt/ }));
    await screen.findByRole("button", { name: /Đã copy/ });
    /* Không một dòng rào nào được thêm vào: khối này hứa là "nguyên văn engine gửi". */
    expect(written).toEqual([JOB_ONE]);
  });
});

describe("joinSheetPrompts — hình dạng chữ khi gộp", () => {
  it("một tấm ⇒ nguyên văn, không tiêu đề", () => {
    expect(joinSheetPrompts(["abc"])).toBe("abc");
    expect(joinSheetPrompts([])).toBe("");
  });

  it("nhiều tấm ⇒ tấm nào cũng có tiêu đề, kể cả tấm đầu", () => {
    expect(joinSheetPrompts(["a", "b"])).toBe("=== Tấm 1 ===\n\na\n\n=== Tấm 2 ===\n\nb");
  });
});
