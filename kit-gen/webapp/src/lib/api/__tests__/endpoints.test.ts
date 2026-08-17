/**
 * Tầng endpoint: các ràng buộc §6.5 phải ĐO ĐƯỢC, không chỉ là lời hứa trong tài liệu.
 * Đặc biệt: #23 luôn kèm If-Match, #30 là multipart và client KHÔNG gửi path, #41 w=256.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentError, _resetClient, configureClient } from "../client";
import { api } from "../endpoints";

interface Call { url: string; init: RequestInit }

function mock(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  let i = 0;
  const fn = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(u), init: init ?? {} });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  configureClient({ fetchImpl: fn });
  return calls;
}

const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", "X-KitGen-Protocol": "1", ...(init.headers ?? {}) },
  });

const PROJECT = {
  id: "tet26-a7f3", name: "Tết 2026", slug: "tet26", tags: ["tet"],
  stats: { variants: 2, sheets: 5, components: 42, jobs: 10, rawPresent: 8, kitsCut: 96, diskBytes: 184320133 },
  state: { stale: true, staleReason: ["raw>kits"], jobs: { "tet-main": "ok", "tet-tall": "stale" } },
  broken: false,
};

const CONTRACT = {
  schemaVersion: 4,
  sheets: [{ id: "main", grid: { cols: 1, rows: 1 }, components: [{ file: "01-btn-x", vi: "", spec: "", skel: { shape: "pill", w: 0.8, h: 0.4 } }] }],
  variants: [{ id: "tet", vi: "Tết đỏ", style: "", bg: "magenta" }],
  characterPoses: [],
};

beforeEach(() => {
  _resetClient();
  configureClient({ location: { hostname: "127.0.0.1", pathname: "/app/", protocol: "http:", origin: "http://127.0.0.1:8765" } });
});

describe("#7/#9 — project", () => {
  it("list gửi query đúng và parse được state.jobs (nguồn của ma trận S2)", async () => {
    const calls = mock([json({ items: [PROJECT], scannedAt: "now", workspaceLabel: "~/KitGen" }, { headers: { ETag: '"e1"' } })]);
    const r = await api.projects.list({ q: "tết", tag: "banking", sort: "name" });
    expect(calls[0]!.url).toContain("q=t%E1%BA%BFt");
    expect(calls[0]!.url).toContain("include=stats");
    expect(r.notModified).toBe(false);
    expect(r.etag).toBe('"e1"');
    if (!r.notModified) expect(r.items[0]!.state!.jobs["tet-tall"]).toBe("stale");
  });

  it("list gửi If-None-Match và hiểu 304 (tiết kiệm một lần quét đĩa của agent)", async () => {
    const calls = mock([new Response(null, { status: 304, headers: { "X-KitGen-Protocol": "1", ETag: '"e1"' } })]);
    const r = await api.projects.list({ etag: '"e1"' });
    expect((calls[0]!.init.headers as Record<string, string>)["If-None-Match"]).toBe('"e1"');
    expect(r.notModified).toBe(true);
  });

  it("field lạ từ agent bản mới KHÔNG làm vỡ parse (§6.5-6)", async () => {
    mock([json({ items: [{ ...PROJECT, brandNewField: { x: 1 } }] })]);
    const r = await api.projects.list();
    expect(r.notModified).toBe(false);
    if (!r.notModified) expect(r.items).toHaveLength(1);
  });

  it("trạng thái job LẠ rơi về 'never' thay vì giết cả màn", async () => {
    mock([json({ items: [{ ...PROJECT, state: { ...PROJECT.state, jobs: { "tet-main": "teleporting" } } }] })]);
    const r = await api.projects.list();
    if (!r.notModified) expect(r.items[0]!.state!.jobs["tet-main"]).toBe("never");
  });

  it("dữ liệu hỏng nặng ⇒ AgentError có copy người đọc được, KHÔNG phải lỗi zod thô", async () => {
    mock([json({ items: "không phải mảng" })]);
    const e = (await api.projects.list().catch((x) => x)) as AgentError;
    expect(e).toBeInstanceOf(AgentError);
    expect(e.code).toBe("AGENT_INTERNAL");
    expect(e.transport).toBe("client");
  });
});

describe("#23 — PUT contract LUÔN kèm If-Match (§6.5-4)", () => {
  it("gửi If-Match đúng version", async () => {
    const calls = mock([json({ version: 38, hash: "sha256:x", snapshot: "2026-08-05T101233Z" })]);
    await api.contract.save("p1", 37, CONTRACT as never);
    expect((calls[0]!.init.headers as Record<string, string>)["If-Match"]).toBe("37");
    expect(calls[0]!.init.method).toBe("PUT");
  });

  it("thiếu version ⇒ ném ngay ở client, KHÔNG gửi request nào (không fallback)", async () => {
    const calls = mock([json({})]);
    await expect(api.contract.save("p1", Number.NaN, CONTRACT as never)).rejects.toMatchObject({
      code: "IF_MATCH_REQUIRED",
    });
    expect(calls).toHaveLength(0);
  });

  it("chuẩn hoá styles[] → variants[] trước khi ghi (không ghi cả hai tên)", async () => {
    const calls = mock([json({ version: 2 })]);
    const legacy = { schemaVersion: 4, characterPoses: [], styles: CONTRACT.variants, sheets: [{ ...CONTRACT.sheets[0], styles: ["tet"] }] };
    await api.contract.save("p1", 1, legacy as never);
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent.contract.variants).toHaveLength(1);
    expect(sent.contract.styles).toBeUndefined();
    expect(sent.contract.sheets[0].styles).toBeUndefined();
  });

  it("409 CONTRACT_CONFLICT giữ nguyên details để dựng modal so sánh", async () => {
    mock([json({ error: { code: "CONTRACT_CONFLICT", message: "37 != 38", details: { serverVersion: 38, diffSummary: { added: 2, removed: 1 } } } }, { status: 409 })]);
    const e = (await api.contract.save("p1", 37, CONTRACT as never).catch((x) => x)) as AgentError;
    expect(e.code).toBe("CONTRACT_CONFLICT");
    expect(e.details).toMatchObject({ serverVersion: 38, diffSummary: { added: 2, removed: 1 } });
  });

  it("#22 lấy version từ body; thiếu thì lùi về ETag", async () => {
    mock([json({ version: 0, contract: CONTRACT }, { headers: { ETag: '"37"' } })]);
    const r = await api.contract.get("p1");
    expect(r.version).toBe(37);
  });
});

describe("#30 — ảnh ref: multipart, agent tự đặt tên, client KHÔNG gửi path (bài học G1)", () => {
  const file = (name: string, type: string, size: number) => {
    const f = new File([new Uint8Array(Math.min(size, 8))], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  it("gửi FormData, KHÔNG đặt Content-Type thủ công (để browser tự sinh boundary)", async () => {
    const calls = mock([json({ name: "char-lan.png", path: "refs/char-lan.png", bytes: 1234 }, { status: 201 })]);
    await api.refs.add("p1", file("lan.png", "image/png", 1234), "character");
    expect(calls[0]!.init.body).toBeInstanceOf(FormData);
    expect(calls[0]!.init.headers as Record<string, string>).not.toHaveProperty("Content-Type");
    const fd = calls[0]!.init.body as FormData;
    expect(fd.get("kind")).toBe("character");
    expect(fd.get("path")).toBeNull(); // client KHÔNG BAO GIỜ gửi path
  });

  it("chặn file > 20 MB ngay ở client (không tốn công upload rồi ăn 413)", async () => {
    const calls = mock([json({})]);
    await expect(api.refs.add("p1", file("big.png", "image/png", 21 * 1024 * 1024), "inspo")).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
    expect(calls).toHaveLength(0);
  });

  it("chặn kiểu file không nhận", async () => {
    const calls = mock([json({})]);
    await expect(api.refs.add("p1", file("a.gif", "image/gif", 100), "inspo")).rejects.toMatchObject({ code: "BAD_TYPE" });
    expect(calls).toHaveLength(0);
  });

  it("#19 chặn zip > 200 MB", async () => {
    const calls = mock([json({})]);
    await expect(api.uploads.create(file("a.zip", "application/zip", 201 * 1024 * 1024))).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("#32 — bắt đầu lượt chạy", () => {
  it("gửi đủ kind/jobs/maxJobs/autoSliceAfterGen; parse ước lượng của modal M1", async () => {
    const calls = mock([json({ runId: "r-0032", jobs: [{ job: "tet-main", status: "queued" }], estimate: { seconds: [240, 360], quotaUnits: [21, 35] } }, { status: 202 })]);
    const r = await api.runs.start("p1", { kind: "gen", jobs: ["tet-main"], maxJobs: 4, autoSliceAfterGen: true });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      kind: "gen", jobs: ["tet-main"], maxJobs: 4, autoSliceAfterGen: true,
    });
    expect(r.estimate?.quotaUnits).toEqual([21, 35]);
  });

  it("409 RUN_CONFLICT giữ runId để dựng nút [Xem lượt đó] (đóng E5)", async () => {
    mock([json({ error: { code: "RUN_CONFLICT", details: { runId: "r-0031", progress: { done: 3, total: 8 } } } }, { status: 409 })]);
    const e = (await api.runs.start("p1", { kind: "gen", jobs: [], maxJobs: 4, autoSliceAfterGen: true }).catch((x) => x)) as AgentError;
    expect(e.details).toMatchObject({ runId: "r-0031" });
  });

  it("KHÔNG retry khi lỗi mạng — bấm 1 lần không được sinh 2 lượt tốn quota", async () => {
    const calls = mock([new TypeError("Failed to fetch")]);
    await expect(api.runs.start("p1", { kind: "gen", jobs: [], maxJobs: 4, autoSliceAfterGen: true })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe("#44 — vẽ lại ảnh bìa", () => {
  it("POST đúng endpoint, body rỗng, parse trạng thái 202", async () => {
    const calls = mock([json({ cover: { status: "running", startedAt: "2026-08-17T00:00:00.000Z" } }, { status: 202 })]);
    const r = await api.projects.regenerateCover("p/1");
    expect(calls[0]!.url).toContain("/api/projects/p%2F1/cover");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({});
    expect(r.status).toBe("running");
  });
});

describe("#14 — purge đối chiếu đúng project và cụm xác nhận", () => {
  it("gửi projectId cùng xac-nhan trong body", async () => {
    const calls = mock([new Response(null, { status: 204, headers: { "X-KitGen-Protocol": "1" } })]);
    await api.trash.purge("20260805-121003-tet26", "tet26", "xac-nhan");
    expect(calls[0]!.init.headers).toMatchObject({ "X-KitGen-Confirm": "xac-nhan", "X-KitGen-Project": "tet26" });
    expect(calls[0]!.url).toContain("purge=1");
  });
});

describe("#18/#41/#42 — file & xuất", () => {
  it("exportUrl là URL cho <a download>, có include và variant", () => {
    configureClient({ base: "http://127.0.0.1:8765" });
    const u = api.projects.exportUrl("p1", ["contract", "kits"], "tet");
    expect(u).toContain("/api/projects/p1/export.zip");
    expect(u).toContain("include=contract%2Ckits");
    expect(u).toContain("variant=tet");
  });
  it("thumbUrl luôn có w=256", () => {
    configureClient({ base: "http://127.0.0.1:8765" });
    expect(api.files.thumbUrl("p1", "kits/tet/01.png")).toContain("w=256");
  });
  it("#42 parse manifest kit kèm cờ file rỗng", async () => {
    mock([json({ variant: "tet", cutAt: "now", files: [{ file: "01-btn.png", path: "kits/tet/01-btn.png", empty: true }], sheets: { main: { cut: 16, blobs: 24 } } })]);
    const k = await api.files.kit("p1", "tet");
    expect(k.files[0]!.empty).toBe(true);
    expect(k.sheets["main"]!.blobs).toBe(24);
  });
});

describe("#2 — doctor không bao giờ chứa nội dung auth.json", () => {
  it("chỉ nhận cờ boolean authPresent và nhãn rút gọn", async () => {
    mock([json({ imageGen: { mode: "img-home", available: true, codexHomeLabel: "~/.codex-img", authPresent: true }, workspace: { label: "~/KitGen", writable: true, freeBytes: 1 } })]);
    const d = await api.system.doctor();
    expect(d.imageGen!.authPresent).toBe(true);
    expect(d.imageGen!.codexHomeLabel).toBe("~/.codex-img");
    expect(JSON.stringify(d)).not.toContain("/Users/");
  });
  it("mode lạ rơi về 'unknown' thay vì vỡ màn S6", async () => {
    mock([json({ imageGen: { mode: "chế-độ-mới", available: false } })]);
    const d = await api.system.doctor();
    expect(d.imageGen!.mode).toBe("unknown");
  });
});

describe("#4 — đổi workspace gửi id ĐỤC, không gửi path (chốt X1)", () => {
  it("body chỉ có workspaceId", async () => {
    const calls = mock([json({ ok: true, workspaceId: "ws_8f2c", workspaceLabel: "~/KitGen" })]);
    await api.system.activateWorkspace("ws_8f2c");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toEqual({ workspaceId: "ws_8f2c" });
  });
});
