/* @vitest-environment jsdom */
/**
 * WAVE 1 — bằng chứng cho §W1-8 (thẻ 🎨 mở đúng BÀN LÀM VIỆC) và §W1-9 (nút to nhất
 * cuối wizard + lệnh ⌘K thôi là nút chết).
 *
 * Hai bệnh này giống nhau ở chỗ nguy hiểm nhất: cả hai đều **im lặng**. Không có lỗi,
 * không có toast, chỉ là người dùng bấm rồi rơi vào một màn không phải màn họ muốn.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createNav, openKitWith, type ProjectNav } from "../lib/nav";
import { intentOf, useCreateIntent, type CreateIntent } from "../lib/useCreateIntent";

const SRC = resolve(process.cwd(), "src");

afterEach(cleanup);

const fakeNav = (): ProjectNav => ({
  open: vi.fn(),
  openWizard: vi.fn(),
  navigateCanvas: vi.fn(),
  openDesign: vi.fn(),
  openStyles: vi.fn(),
  openRuns: vi.fn(),
  openTrash: vi.fn(),
  openFile: vi.fn(() => true),
});

describe("§W1-8 — mở bộ kit là vào ĐÚNG PHÒNG của nó", () => {
  it("bộ kit gắn tag `kg-canvas` mở ra BÀN LÀM VIỆC", () => {
    const nav = fakeNav();
    openKitWith(nav, { id: "kit-canvas", tags: ["kg-canvas"] });
    expect(nav.navigateCanvas).toHaveBeenCalledWith("kit-canvas");
    expect(nav.open).not.toHaveBeenCalled();
  });

  it("bộ kit workflow — và bộ kit KHÔNG có tag — vẫn đi đường cũ (mặc định an toàn)", () => {
    for (const tags of [["kg-workflow"], [], undefined, ["kg-canvas", "kg-workflow"]]) {
      const nav = fakeNav();
      openKitWith(nav, { id: "kit-x", tags });
      expect(nav.open, `tags=${JSON.stringify(tags)}`).toHaveBeenCalledWith("kit-x");
      expect(nav.navigateCanvas).not.toHaveBeenCalled();
    }
  });

  it("`navigateCanvas` trỏ đúng route bàn làm việc", () => {
    const navigate = vi.fn();
    createNav(navigate as never).navigateCanvas("kit-canvas");
    expect(navigate).toHaveBeenCalledWith({ to: "/k/$projectId/canvas", params: { projectId: "kit-canvas" } });
  });

  it("màn Home luôn mở tổng quan dự án", () => {
    const src = readFileSync(join(SRC, "features/projects/ProjectsScreen.tsx"), "utf8");
    expect(src).toContain("nav.open(p.id)");
    expect(src).not.toContain("openKitWith(nav, p)");
  });
});

/** Harness bé nhất có thể để chạy hook thật trong DOM thật. */
function IntentHarness({ search, run, clear }: { search: unknown; run: (i: CreateIntent) => void; clear: () => void }) {
  useCreateIntent(search, run, clear);
  return <p>home</p>;
}

describe("§W1-9 — ý định `?action=` được đọc, chạy đúng một lần, rồi dọn param", () => {
  it("đọc được create/import và bỏ qua rác đến từ URL", () => {
    expect(intentOf({ action: "create" })).toBe("create");
    expect(intentOf({ action: "import" })).toBe("import");
    expect(intentOf({ action: "xoá-hết" })).toBeNull();
    expect(intentOf({})).toBeNull();
    expect(intentOf(undefined)).toBeNull();
    expect(intentOf("create")).toBeNull();
  });

  it("`?action=create` mở dialog Tạo và xoá param ngay sau đó", () => {
    const run = vi.fn();
    const clear = vi.fn();
    render(<IntentHarness search={{ action: "create" }} run={run} clear={clear} />);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("create");
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("render lại KHÔNG mở lại dialog người dùng vừa đóng", () => {
    const run = vi.fn();
    const view = render(<IntentHarness search={{ action: "create" }} run={run} clear={() => {}} />);
    view.rerender(<IntentHarness search={{ action: "create" }} run={run} clear={() => {}} />);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("không có `?action=` thì không có gì xảy ra", () => {
    const run = vi.fn();
    const clear = vi.fn();
    render(<IntentHarness search={{ q: "tết" }} run={run} clear={clear} />);
    expect(run).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("màn Home có nối `useCreateIntent`, và đường CustomEvent đã bị bỏ hẳn", () => {
    const home = readFileSync(join(SRC, "features/projects/ProjectsScreen.tsx"), "utf8");
    expect(home).toContain("useCreateIntent(");
    for (const file of ["routes/setup.tsx", "components/layout/AppLayout.tsx", "features/setup/hooks/use-setup-exit.ts"]) {
      const src = readFileSync(join(SRC, file), "utf8");
      expect(src, `${file} còn dispatch sự kiện không ai nghe`).not.toContain("dispatchEvent(new CustomEvent");
    }
  });
});
