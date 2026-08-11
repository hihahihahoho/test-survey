/**
 * `useCanvasDoc` / `CanvasFileView` — nối THẬT xuống `docsRepo()` local (IndexedDB giả).
 * Không stub hook, không mock module: adapter đổi hành vi thì test này phải đỏ.
 *
 * IDBFactory giả dùng lại `features/docs/__tests__/fake-idb.ts` của nhánh C. Đây là
 * DỤNG CỤ TEST của provider mà D đang tiêu thụ, không phải code sản phẩm — mượn nó
 * đúng hơn là chép bản thứ hai sẽ trôi khỏi hành vi thật của `docs-idb.ts`.
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
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createFakeIdb, type FakeIdb } from "@/features/docs/__tests__/fake-idb";
import { configureDocsIdb } from "@/features/docs/lib/docs-idb";
import { canvasDocSchema, docsRepo, setDocsBackend, type CanvasDoc } from "@/features/docs/lib";
import { CanvasFileView } from "../CanvasFileView";
import { useCanvasDoc } from "../lib/use-canvas-doc";

let idb: FakeIdb;
beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
  setDocsBackend("local");
});
afterEach(() => {
  configureDocsIdb(null);
  setDocsBackend("http");
  cleanup();
});

/** QueryClient của test: KHÔNG retry để ca lỗi hiện ngay thay vì chờ backoff. */
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const mount = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={qc()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );

async function seedCanvas(projectId: string, name: string) {
  return docsRepo().create(projectId, { name, kind: "canvas" });
}

function Probe({ projectId, docId }: { projectId: string; docId: string }) {
  const m = useCanvasDoc(projectId, docId);
  const [ok, setOk] = React.useState<string>("");
  return (
    <div>
      <span data-testid="phase">{m.phase}</span>
      <span data-testid="version">{m.version}</span>
      <span data-testid="save">{m.saveState}</span>
      <span data-testid="title">{m.errorTitle}</span>
      <span data-testid="detail">{m.errorDetail ?? ""}</span>
      <span data-testid="ok">{ok}</span>
      <button
        onClick={() => {
          void m
            .save(canvasDocSchema.parse({ nodes: [], viewport: { x: 5, y: 6, k: 2 } }) as CanvasDoc)
            .then((r) => setOk(String(r)));
        }}
      >
        ghi
      </button>
    </div>
  );
}

describe("useCanvasDoc trên docsRepo local thật", () => {
  it("canvas mới tạo: đọc được, phase = empty, version = 0", async () => {
    const doc = await seedCanvas("p1", "Bàn ý tưởng");
    mount(<Probe projectId="p1" docId={doc.id} />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("empty"));
    expect(screen.getByTestId("version").textContent).toBe("0");
  });

  it("ghi được và version tăng theo đúng luật If-Match", async () => {
    const doc = await seedCanvas("p1", "Bàn ý tưởng");
    mount(<Probe projectId="p1" docId={doc.id} />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("empty"));

    await act(async () => {
      screen.getByRole("button", { name: "ghi" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("save").textContent).toBe("saved"));
    expect(screen.getByTestId("ok").textContent).toBe("true");
    expect(screen.getByTestId("version").textContent).toBe("1");

    // ghi lần hai dùng version MỚI ⇒ vẫn thành công, không tự đẻ xung đột giả
    await act(async () => {
      screen.getByRole("button", { name: "ghi" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("version").textContent).toBe("2"));
    expect(screen.getByTestId("save").textContent).toBe("saved");
  });

  it("tab khác vừa ghi ⇒ DOC_CONFLICT thành trạng thái riêng, KHÔNG đè mất", async () => {
    const doc = await seedCanvas("p1", "Bàn ý tưởng");
    mount(<Probe projectId="p1" docId={doc.id} />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("empty"));

    // mô phỏng tab khác: ghi thẳng qua repo ⇒ version trên đĩa thành 1, hook vẫn nghĩ là 0
    await docsRepo().save("p1", doc.id, canvasDocSchema.parse({}), 0);

    await act(async () => {
      screen.getByRole("button", { name: "ghi" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("save").textContent).toBe("conflict"));
    expect(screen.getByTestId("ok").textContent).toBe("false");
  });

  it("file không tồn tại ⇒ phase error, câu đời thường, mã lỗi CHỈ ở detail", async () => {
    mount(<Probe projectId="p1" docId="f-khong-co" />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("error"));
    expect(screen.getByTestId("title").textContent).toBe(
      "Không tìm thấy file này. Có thể nó đã bị xoá ở nơi khác.",
    );
    expect(screen.getByTestId("title").textContent).not.toMatch(/DOC_NOT_FOUND/);
    expect(screen.getByTestId("detail").textContent).toContain("DOC_NOT_FOUND");
  });

  it("kho lưu bị chặn ⇒ báo lỗi tử tế, KHÔNG trắng trang", async () => {
    idb._openFails(true);
    mount(<Probe projectId="p1" docId="f-bat-ky" />);
    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("error"));
    expect(screen.getByTestId("title").textContent).toMatch(/không cho lưu nháp|Không tìm thấy file/);
  });
});

describe("CanvasFileView — màn thật nối đúng dây", () => {
  it("mở một bàn làm việc rỗng: có khung nhìn, thẻ mời, badge nháp cục bộ", async () => {
    const doc = await seedCanvas("p1", "Bàn ý tưởng Tết");
    mount(<CanvasFileView projectId="p1" docId={doc.id} docName={doc.name} />);
    await waitFor(() =>
      expect(screen.getByRole("application", { name: "Bàn làm việc Bàn ý tưởng Tết" })).toBeTruthy(),
    );
    // C1: tiêu đề empty đổi theo copy chốt UX-V3 §5.3 («Bàn làm việc trống» → «Bàn còn trống»).
    expect(screen.getByRole("heading", { name: /Bàn còn trống/ })).toBeTruthy();
    expect(screen.getByText("Chưa lưu")).toBeTruthy();
  });

  it("file hỏng schema: hiện lỗi + đường lùi «Mở dạng form», không crash", async () => {
    const doc = await seedCanvas("p1", "Bàn hỏng");
    idb._poke(`p1/${doc.id}`, { doc: { id: doc.id }, version: "rác" });
    mount(<CanvasFileView projectId="p1" docId={doc.id} docName={doc.name} onOpenWorkflow={() => {}} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Mở dạng form" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/bị hỏng|Không tìm thấy file/);
  });
});
