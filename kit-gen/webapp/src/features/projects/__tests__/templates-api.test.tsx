/* @vitest-environment jsdom */
/**
 * DANH SÁCH TEMPLATE TRÊN AGENT ĐỜI CŨ — 404 là «chưa có template nào», không phải lỗi.
 *
 * Web và agent cài lệch phiên bản là chuyện thường (agent dev chạy từ checkout cũ,
 * người dùng chưa bấm Cập nhật). Agent chưa có route `/api/templates` trả 404
 * `NOT_FOUND`; nếu web coi đó là lỗi thì hộp Tạo dự án hiện một dòng đỏ ngay trên
 * nút Tạo — cho một tính năng người dùng chưa từng dùng. Ca dưới khoá cả hai tầng:
 * endpoint trả rỗng, và hook KHÔNG ở trạng thái lỗi.
 *
 * Nhưng CHỈ 404: 500 hay mất kết nối vẫn phải là lỗi — nuốt luôn chúng là giấu
 * mất template thật của người dùng sau một danh sách rỗng giả.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentError, _resetClient, configureClient } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useTemplates } from "@/lib/hooks";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "X-KitGen-Protocol": "1" },
  });

function answer(make: () => Response) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (u: string | URL | Request) => {
    urls.push(String(u));
    return make();
  }) as unknown as typeof fetch;
  configureClient({ fetchImpl });
  return urls;
}

const TEMPLATE = {
  id: "game-ui-a1b2",
  name: "Game UI",
  description: "",
  tags: ["kg-workflow"],
  createdAt: "2026-09-30T08:00:00.000Z",
  updatedAt: "2026-09-30T08:00:00.000Z",
  sourceProjectId: "game-7f3a",
  sourceProjectName: "Game",
  stats: { blocks: 3, refs: 6, bytes: 1024 },
  hasCover: true,
};

beforeEach(() => {
  _resetClient();
  configureClient({ location: { hostname: "127.0.0.1", pathname: "/app/", protocol: "http:", origin: "http://127.0.0.1:8765" } });
});

describe("templatesApi.list", () => {
  it("agent đời cũ (404 no route) ⇒ danh sách RỖNG, không ném", async () => {
    const urls = answer(() => json({ error: { code: "NOT_FOUND", message: "no route" } }, 404));
    await expect(api.templates.list()).resolves.toEqual({ items: [] });
    expect(urls[0]).toContain("/api/templates");
  });

  it("500 vẫn là LỖI — không giấu template thật sau một danh sách rỗng giả", async () => {
    answer(() => json({ error: { code: "INTERNAL", message: "boom" } }, 500));
    await expect(api.templates.list()).rejects.toBeInstanceOf(AgentError);
  });

  it("agent mới ⇒ parse được, field thiếu có mặc định", async () => {
    const { stats: _s, hasCover: _h, description: _d, ...bare } = TEMPLATE;
    answer(() => json({ items: [TEMPLATE, bare] }));
    const r = await api.templates.list();
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ id: "game-ui-a1b2", stats: { blocks: 3, refs: 6 }, hasCover: true });
    expect(r.items[1]).toMatchObject({ description: "", hasCover: false, stats: { blocks: 0, refs: 0 } });
  });

  it("hook `useTemplates` trên agent đời cũ: có dữ liệu rỗng, KHÔNG isError", async () => {
    answer(() => json({ error: { code: "NOT_FOUND", message: "no route" } }, 404));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useTemplates(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual({ items: [] });
    qc.clear();
  });
});

describe("đường của các lệnh ghi", () => {
  it("lưu từ dự án ⇒ POST /api/projects/:id/save-template, trả về template", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    configureClient({
      fetchImpl: (async (u: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(u), init: init ?? {} });
        return json({ template: TEMPLATE }, 201);
      }) as unknown as typeof fetch,
    });
    const tpl = await api.templates.saveFromProject("game-7f3a", { name: "Game UI" });
    expect(tpl.id).toBe("game-ui-a1b2");
    expect(calls[0]!.url).toContain("/api/projects/game-7f3a/save-template");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: "Game UI" });
  });

  it("tạo dự án mang `fromTemplate` đi nguyên vẹn tới agent", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    configureClient({
      fetchImpl: (async (u: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(u), init: init ?? {} });
        return json({ project: { id: "game-ui-moi-1c2d", name: "Game UI (mới)", slug: "game-ui-moi", tags: [], broken: false } }, 201);
      }) as unknown as typeof fetch,
    });
    await api.projects.create({
      name: "Game UI (mới)", template: "blank", firstVariant: { id: "phong-cach-1", vi: "Phong cách 1" },
      tags: [], fromTemplate: "game-ui-a1b2",
    });
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.fromTemplate).toBe("game-ui-a1b2");
    expect(body.template).toBe("blank");
  });
});
