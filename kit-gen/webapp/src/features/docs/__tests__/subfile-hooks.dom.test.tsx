/**
 * `useFileTabs` / `useDocsList` — nối THẬT xuống `docsRepo()` local (IndexedDB giả).
 * Không stub hook, không mock module: nếu adapter đổi hành vi, test này phải đỏ.
 */
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

/** React 18 đòi cờ này mới nhận `act()`; thiếu nó test vẫn chạy nhưng in cảnh báo. */
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import { configureDocsIdb } from "../lib/docs-idb";
import { docsRepo, ALL_SHEETS_DOC_ID } from "../lib";
import { useFileTabs, useLoadingTimeout, DOCS_LOADING_TIMEOUT_MS, docsKeys } from "../hooks";

let idb: FakeIdb;
beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
});
afterEach(() => {
  configureDocsIdb(null);
  cleanup();
});

/** QueryClient của test: KHÔNG retry để ca lỗi hiện ngay, không phải chờ backoff. */
function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Probe({ projectId, sheets, activeId }: { projectId: string; sheets: string[]; activeId?: string }) {
  const m = useFileTabs({ projectId, contractSheetIds: sheets, activeId });
  return (
    <div>
      <span data-testid="phase">{m.phase}</span>
      <span data-testid="active">{m.activeId}</span>
      <span data-testid="fallback">{String(m.activeFallback)}</span>
      <span data-testid="badge">{m.badge.label}</span>
      <ul>{m.tabs.map((t) => <li key={t.id} data-testid="tab">{`${t.id}|${t.sheetCount}|${t.staleCount}`}</li>)}</ul>
    </div>
  );
}

const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>);

describe("useFileTabs trên docsRepo local thật", () => {
  it("project rỗng: vẫn ra đúng 1 tab ảo và badge nháp cục bộ", async () => {
    mount(<Probe projectId="p1" sheets={["main", "main2"]} />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("ready"));
    expect(screen.getAllByTestId("tab").map((n) => n.textContent)).toEqual([`${ALL_SHEETS_DOC_ID}|2|0`]);
    expect(screen.getByTestId("badge").textContent).toBe("bản nháp cục bộ");
  });

  it("đọc đúng file đã tạo qua repo, và đếm sheet mất liên kết", async () => {
    await docsRepo().create("p1", { name: "Bộ kit chính", kind: "workflow", view: { sheetIds: ["main", "da-xoa"], variantIds: [] } });
    mount(<Probe projectId="p1" sheets={["main", "main2"]} activeId="f-bo-kit-chinh" />);
    await waitFor(() => expect(screen.getAllByTestId("tab")).toHaveLength(2));
    expect(screen.getAllByTestId("tab")[1]!.textContent).toBe("f-bo-kit-chinh|1|1");
    expect(screen.getByTestId("active").textContent).toBe("f-bo-kit-chinh");
    expect(screen.getByTestId("fallback").textContent).toBe("false");
  });

  it("deep link tới file không tồn tại: rơi về tab ảo VÀ bật cờ để UI nói ra", async () => {
    mount(<Probe projectId="p1" sheets={["main"]} activeId="f-khong-ton-tai" />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("ready"));
    expect(screen.getByTestId("active").textContent).toBe(ALL_SHEETS_DOC_ID);
    expect(screen.getByTestId("fallback").textContent).toBe("true");
  });

  it("bản ghi hỏng schema bị bỏ qua chứ không giết cả thanh tab", async () => {
    await docsRepo().create("p1", { name: "Tốt", kind: "workflow" });
    idb._poke("p1/f-rac", { doc: { id: "khong-hop-le" } });
    mount(<Probe projectId="p1" sheets={["main"]} />);
    await waitFor(() => expect(screen.getAllByTestId("tab")).toHaveLength(2));
    expect(screen.getAllByTestId("tab").map((n) => n.textContent!.split("|")[0])).toEqual([ALL_SHEETS_DOC_ID, "f-tot"]);
  });

  it("IndexedDB bị chặn: KHÔNG trắng trang — vẫn ready với tab ảo, badge đổi sang cảnh báo", async () => {
    idb._openFails(true);
    mount(<Probe projectId="p1" sheets={["main"]} />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("ready"));
    expect(screen.getAllByTestId("tab")).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId("badge").textContent).toBe("không lưu được"));
  });

  it("thùng rác không mọc lên thanh tab", async () => {
    const d = await docsRepo().create("p1", { name: "Sắp xoá", kind: "canvas" });
    await docsRepo().remove("p1", d.id);
    mount(<Probe projectId="p1" sheets={["main"]} />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("ready"));
    expect(screen.getAllByTestId("tab")).toHaveLength(1);
  });
});

describe("trần thời gian tải 20 giây", () => {
  function TO({ loading }: { loading: boolean }) {
    return <span data-testid="to">{String(useLoadingTimeout(loading))}</span>;
  }

  it("chưa tới 20s thì chưa báo quá hạn; đúng 20s thì báo", () => {
    vi.useFakeTimers();
    try {
      render(<TO loading />);
      expect(screen.getByTestId("to").textContent).toBe("false");
      React.act(() => { vi.advanceTimersByTime(DOCS_LOADING_TIMEOUT_MS - 1); });
      expect(screen.getByTestId("to").textContent).toBe("false");
      React.act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByTestId("to").textContent).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tải xong thì cờ quá hạn tự tắt", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<TO loading />);
      React.act(() => { vi.advanceTimersByTime(DOCS_LOADING_TIMEOUT_MS); });
      expect(screen.getByTestId("to").textContent).toBe("true");
      rerender(<TO loading={false} />);
      expect(screen.getByTestId("to").textContent).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("query key", () => {
  it("nằm trong namespace riêng «docs», không đụng tiền tố nào của R0", () => {
    expect(docsKeys.list("p1")[0]).toBe("docs");
    expect(docsKeys.list("p1")).not.toEqual(docsKeys.list("p1", true));
    expect(docsKeys.ofProject("p1")).toEqual(["docs", "p1"]);
  });
});
