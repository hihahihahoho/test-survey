/**
 * CRUD file con + thùng rác + Hoàn tác 10s — DOM THẬT, repo THẬT (IndexedDB giả).
 * Không stub hook, không mock module: nếu `docs-repo-local` đổi hành vi, test này đỏ.
 *
 * Vá jsdom nằm NGAY ĐÂY (glob C không cấp `setupFiles` — xem NEEDS-fe2-c N3).
 */
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (typeof (globalThis as { CSS?: unknown }).CSS === "undefined") {
  (globalThis as Record<string, unknown>).CSS = { escape: (s: string) => s.replace(/([^\w-])/g, "\\$1") };
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster, KG_TOAST_DURATION } from "@/components/ui/sonner";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import { configureDocsIdb } from "../lib/docs-idb";
import { docsRepo, ALL_SHEETS_DOC_ID } from "../lib";
import { SubfileTabs } from "../components/subfiles";
import { UNDO_WINDOW_MS } from "../lib/subfile-actions";

let idb: FakeIdb;
beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
});
afterEach(() => {
  configureDocsIdb(null);
  cleanup();
});

const SHEETS = ["main", "main2", "pose-lan"];

function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Harness(props: { running?: string[]; initialActive?: string }) {
  const [active, setActive] = React.useState(props.initialActive ?? ALL_SHEETS_DOC_ID);
  return (
    <TooltipProvider>
      <SubfileTabs
        projectId="p1"
        contractSheetIds={SHEETS}
        activeId={active}
        onActivate={setActive}
        runningSheetIds={props.running ?? []}
      />
      <span data-testid="active">{active}</span>
      <Toaster />
    </TooltipProvider>
  );
}

const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>);

/** Chờ thanh tab lên xong (phase ready). */
async function ready() {
  await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
}

async function createFile(name: string, kind: "workflow" | "canvas" = "workflow") {
  fireEvent.click(screen.getByRole("button", { name: /Tạo file mới/ }));
  const dialog = await screen.findByRole("dialog");
  if (kind === "canvas") {
    fireEvent.click(within(dialog).getByRole("radio", { name: /Bàn ý tưởng/ }));
  }
  const input = within(dialog).getByLabelText("Tên file");
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Tạo file" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** Tab xuất hiện sau khi query refetch xong ⇒ luôn CHỜ, không `getBy` ngay. */
function tab(name: string | RegExp) {
  return screen.findByRole("tab", { name });
}

async function openMenu(tabName: string | RegExp) {
  fireEvent.contextMenu(await tab(tabName));
  return await screen.findByRole("menu");
}

describe("vòng đời create → rename → duplicate → delete → undo", () => {
  it("tạo file workflow có chọn sheet: doc lưu đúng bộ lọc, KHÔNG copy contract", async () => {
    mount(<Harness />);
    await ready();

    fireEvent.click(screen.getByRole("button", { name: /Tạo file mới/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("main", { selector: "button" }));
    fireEvent.change(within(dialog).getByLabelText("Tên file"), { target: { value: "Bộ kit chính" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo file" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const docs = await docsRepo().list("p1");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.name).toBe("Bộ kit chính");
    expect(docs[0]!.view?.sheetIds).toEqual(["main"]);
    // bản ghi CHỈ chứa id sheet — không có bản sao sheet/ảnh/kit nào
    const raw = JSON.stringify(idb._dump());
    expect(raw).not.toMatch(/components|grid|variants|kits|refs/);
  });

  it("tên trùng bị chặn INLINE trong dialog, không phải chờ repo ném", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Bộ kit chính");

    fireEvent.click(screen.getByRole("button", { name: /Tạo file mới/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tên file"), { target: { value: "bộ KIT chính" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo file" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/trùng tên/i);
    expect(await docsRepo().list("p1")).toHaveLength(1);
  });

  it("F2 đổi tên tại chỗ; Enter lưu, Esc huỷ, tên trùng báo lỗi inline", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Bộ kit chính");
    await createFile("Ý tưởng Tết", "canvas");

    const t = await tab(/Ý tưởng Tết/);
    t.focus();
    fireEvent.keyDown(window, { key: "F2" });

    const box = await screen.findByLabelText(/Đổi tên file/);
    // tên trùng ⇒ lỗi inline ngay khi gõ
    fireEvent.change(box, { target: { value: "Bộ kit chính" } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/trùng tên/i);

    // Esc huỷ: tên cũ còn nguyên
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText(/Đổi tên file/)).toBeNull());
    expect((await docsRepo().list("p1")).map((d) => d.name)).toContain("Ý tưởng Tết");

    // làm lại, Enter lưu
    (await tab(/Ý tưởng Tết/)).focus();
    fireEvent.keyDown(window, { key: "F2" });
    const box2 = await screen.findByLabelText(/Đổi tên file/);
    fireEvent.change(box2, { target: { value: "Ý tưởng Tết 2026" } });
    fireEvent.keyDown(box2, { key: "Enter" });
    await waitFor(async () =>
      expect((await docsRepo().list("p1")).map((d) => d.name)).toContain("Ý tưởng Tết 2026"),
    );
  });

  it("nhân bản: sao bộ lọc + node, KHÔNG sao contract/ảnh, tên «(bản sao)»", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Bộ kit chính");

    const menu = await openMenu(/Bộ kit chính/);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Nhân bản/ }));

    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(2));
    const docs = await docsRepo().list("p1");
    expect(docs.map((d) => d.name)).toContain("Bộ kit chính (bản sao)");
  });

  it("xoá: dialog nói rõ sản phẩm KHÔNG mất; xoá mềm; toast [Hoàn tác]; phục hồi được", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Ý tưởng Tết", "canvas");

    const menu = await openMenu(/Ý tưởng Tết/);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Xoá file/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/KHÔNG bị xoá/);
    expect(dialog.textContent).toMatch(/30 ngày/);
    // KHÔNG bắt gõ tên (chốt X6): không có ô xác nhận nào
    expect(within(dialog).queryByLabelText(/để xác nhận/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Chuyển vào thùng rác" }));

    // xoá MỀM: bản ghi vẫn còn, chỉ có trashedAt
    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(0));
    const all = await docsRepo().list("p1", { includeTrashed: true });
    expect(all).toHaveLength(1);
    expect(all[0]!.trashedAt).toBeTruthy();

    // toast Hoàn tác
    const undo = await screen.findByRole("button", { name: "Hoàn tác" });
    fireEvent.click(undo);
    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(1));
  });

  it("xoá file ĐANG MỞ và là file cuối ⇒ rơi về «Tất cả sheet», không trắng trang", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Chỉ mình nó");
    await waitFor(() => expect(screen.getByTestId("active").textContent).toBe("f-chi-minh-no"));

    const menu = await openMenu(/Chỉ mình nó/);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Xoá file/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Chuyển vào thùng rác" }));

    await waitFor(() => expect(screen.getByTestId("active").textContent).toBe(ALL_SHEETS_DOC_ID));
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(1));
  });
});

describe("Hoàn tác đúng 10 giây (fake timer)", () => {
  it("hằng số của C2 khớp KG_TOAST_DURATION.successWithUndo của R0", () => {
    expect(UNDO_WINDOW_MS).toBe(KG_TOAST_DURATION.successWithUndo);
    expect(UNDO_WINDOW_MS).toBe(10_000);
  });

  it("quá 10s mới bấm [Hoàn tác]: KHÔNG im lặng — báo hết hạn và mở Thùng rác", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Sắp xoá");

    const menu = await openMenu(/Sắp xoá/);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Xoá file/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Chuyển vào thùng rác" }));

    const undo = await screen.findByRole("button", { name: "Hoàn tác" });

    // đẩy đồng hồ TƯỜNG qua mốc 10s (cửa sổ đo bằng Date.now, không bằng toast)
    const real = Date.now;
    Date.now = () => real() + UNDO_WINDOW_MS + 1;
    try {
      fireEvent.click(undo);
      expect(await screen.findByText(/Hết thời gian hoàn tác/)).toBeTruthy();
    } finally {
      Date.now = real;
    }
    // file vẫn nằm trong thùng rác, KHÔNG mất
    expect(await docsRepo().list("p1", { includeTrashed: true })).toHaveLength(1);
  });
});

describe("thùng rác 30 ngày", () => {
  it("liệt kê file đã xoá + phục hồi được; không có nút xoá vĩnh viễn", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Vào thùng rác");

    const menu = await openMenu(/Vào thùng rác/);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Xoá file/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Chuyển vào thùng rác" }));
    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(0));

    fireEvent.click(screen.getByRole("button", { name: /Tất cả \d+ file/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Thùng rác file/ }));

    const restore = await screen.findByRole("button", { name: /Phục hồi file Vào thùng rác/ });
    expect(screen.queryByRole("button", { name: /vĩnh viễn/i })).toBeNull();
    fireEvent.click(restore);
    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(1));
  });
});

describe("C-01: file trỏ tới sheet đang chạy", () => {
  it("VẪN cho xoá, nói «lượt này vẫn chạy tiếp», và không gọi cancel run ở đâu cả", async () => {
    mount(<Harness running={["main"]} />);
    await ready();

    fireEvent.click(screen.getByRole("button", { name: /Tạo file mới/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.click(within(d).getByLabelText("main", { selector: "button" }));
    fireEvent.change(within(d).getByLabelText("Tên file"), { target: { value: "Đang chạy" } });
    fireEvent.click(within(d).getByRole("button", { name: "Tạo file" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const menu = await openMenu(/Đang chạy/);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Xoá file/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toMatch(/vẫn chạy tiếp/);
    expect(dialog.textContent).not.toMatch(/sẽ bị dừng/);
    const del = within(dialog).getByRole("button", { name: "Chuyển vào thùng rác" });
    expect((del as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("file hệ thống «Tất cả sheet»", () => {
  it("menu vẫn mở nhưng mục sửa/xoá BỊ KHOÁ và nói lý do (không ẩn mục)", async () => {
    mount(<Harness />);
    await ready();
    const menu = await openMenu(/Tất cả sheet/);
    for (const name of [/Đổi tên/, /Nhân bản/, /Xoá file/]) {
      const item = within(menu).getByRole("menuitem", { name });
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(item.textContent).toMatch(/file hệ thống/);
    }
  });

  it("F2 trên tab hệ thống không mở ô đổi tên", async () => {
    mount(<Harness />);
    await ready();
    (await tab(/Tất cả sheet/)).focus();
    fireEvent.keyDown(window, { key: "F2" });
    expect(screen.queryByLabelText(/Đổi tên file/)).toBeNull();
  });
});

describe("lỗi kho lưu: câu đời thường ở thân UI, kỹ thuật chỉ trong <details>", () => {
  it("hết chỗ lưu khi tạo file ⇒ dialog GIỮ NGUYÊN + lỗi inline", async () => {
    mount(<Harness />);
    await ready();
    idb._failQuota(Infinity);

    fireEvent.click(screen.getByRole("button", { name: /Tạo file mới/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tên file"), { target: { value: "Không lưu nổi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo file" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/hết chỗ lưu/i);
    const details = alert.querySelector("details")!;
    expect(details.textContent).toMatch(/STORAGE_FULL/);
    // thân UI (ngoài <details>) KHÔNG chứa mã kỹ thuật
    const body = alert.cloneNode(true) as HTMLElement;
    body.querySelector("details")?.remove();
    expect(body.textContent).not.toMatch(/STORAGE_FULL|docsIdbSet/);
  });
});

describe("phím tắt", () => {
  it("Mod+D nhân bản khi focus đang ở tab; không bắt khi đang gõ trong ô", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Bản gốc");

    (await tab(/Bản gốc/)).focus();
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(2));

    // đang đổi tên (focus trong input) ⇒ Mod+D KHÔNG nhân bản nữa
    (await tab("Bản gốc · quy trình chuẩn")).focus();
    fireEvent.keyDown(window, { key: "F2" });
    const box = await screen.findByLabelText(/Đổi tên file/);
    box.focus();
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(await docsRepo().list("p1")).toHaveLength(2);
  });

  it("Delete trên tab mở dialog xác nhận, KHÔNG xoá thẳng", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Xoá bằng phím");
    (await tab(/Xoá bằng phím/)).focus();
    fireEvent.keyDown(window, { key: "Delete" });
    expect((await screen.findByRole("alertdialog")).textContent).toMatch(/Xoá file «Xoá bằng phím»/);
    expect(await docsRepo().list("p1")).toHaveLength(1);
  });
});

describe("Shift+F10 — đường bàn phím tới menu ngữ cảnh", () => {
  it("sự kiện contextmenu do bàn phím sinh ra vẫn mở đúng menu", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Có menu");
    // Shift+F10 khiến trình duyệt phát `contextmenu` KHÔNG có toạ độ chuột
    fireEvent.contextMenu(await tab(/Có menu/), { clientX: 0, clientY: 0 });
    expect(await screen.findByRole("menu")).toBeTruthy();
  });
});

describe("không có đường nào chạm run/contract", () => {
  it("module CRUD không import bất kỳ hook/API run, kit hay contract nào", async () => {
    const mods = await Promise.all([
      import("../hooks/use-doc-mutations"),
      import("../hooks/use-subfile-actions"),
      import("../lib/subfile-actions"),
    ]);
    for (const m of mods) {
      // `runNoticeForDoc` là hàm CẢNH BÁO (chỉ đọc), không phải hành động lên run.
      const names = Object.keys(m).filter((k) => k !== "runNoticeForDoc");
      expect(names.join(",")).not.toMatch(/cancel|contract|kit|deleteRun|stopRun/i);
    }
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
  });
});
