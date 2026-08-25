/**
 * TEST TÍCH HỢP THẬT — WAVE 3, chạy với AGENT SERVER SỐNG.
 *
 * ══ VÌ SAO TÁCH RA KHỎI `npm test` ═══════════════════════════════════════════
 * File này spawn một tiến trình thật và chạm ổ đĩa thật, nên nó chậm hơn và phụ
 * thuộc môi trường (cổng trống, quyền ghi `/tmp`). Trộn nó vào `npm test` là đổi
 * một bộ test **tất định** lấy một bộ test **thỉnh thoảng đỏ vì hạ tầng** — và một
 * cổng hay kêu oan là cổng sẽ bị tắt (đúng bài học của `check-dead-classes` W2A-5).
 * Vì vậy: `vitest.config.ts` loại `*.integration.test.ts`, chạy riêng bằng
 *     npm run test:integration
 *
 * ══ ĐIỀU CẤM TUYỆT ĐỐI ═══════════════════════════════════════════════════════
 * File này KHÔNG BAO GIỜ tạo run sinh ảnh (kind gen). Mọi endpoint dưới đây nằm trong cột
 * "KHÔNG tốn" của bảng §0 trong UPGRADE-PLAN: contract get/put/validate, refs
 * upload/list, element-lib — **I/O đĩa thuần**. Có một ca test tự khẳng định điều đó
 * bằng cách quét chính file này.
 *
 * ══ HAI LỚP BẢO VỆ CỦA AGENT PHẢI CHIỀU ĐÚNG ═════════════════════════════════
 *   · header `X-KitGen-Client: 1`  (`lib/security.mjs` checkClientHeader)
 *   · `Origin` phải khớp allowlist — vào bằng `localhost`, KHÔNG phải `127.0.0.1`.
 * Thiếu một trong hai là 403, và đó là lý do `download.ts` không dùng `<a download>`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractJobs, contractSchema } from "@/lib/types/contract";
import { createWorkflowStore, resetWorkflowStores } from "../model";
import { buildKitsetContract, MAIN_VARIANT_ID } from "../kitset-to-contract";
import { refKindOf } from "../refs-sync";

const REPO = resolve(process.cwd(), "..");
const PORT = 8791;
const BASE = `http://localhost:${PORT}`;
const PROJECT = "kit-w3-tichhop";

let server: ChildProcess | null = null;
let workspace = "";

/** Hai header bắt buộc — thiếu là 403, xem khối "HAI LỚP BẢO VỆ" ở đầu file. */
const H = { "X-KitGen-Client": "1", Origin: BASE };

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });

const json = async (path: string, init: RequestInit = {}) => {
  const r = await api(path, init);
  return { status: r.status, body: (await r.json().catch(() => null)) as never };
};

/**
 * Mã lỗi của agent nằm trong PHONG BÌ `{error:{code,message}}` (`lib/http.mjs` sendError),
 * KHÔNG phải ở gốc body. Đọc sai chỗ thì `body.code` luôn `undefined` và mọi phép
 * `not.toBe("…")` đều xanh giả — bẫy đúng nghĩa: test qua mà chẳng kiểm gì.
 */
const errCode = (body: unknown): string | undefined =>
  (body as { error?: { code?: string } } | null)?.error?.code;
const errDetails = (body: unknown): Record<string, unknown> | undefined =>
  (body as { error?: { details?: Record<string, unknown> } } | null)?.error?.details;

async function waitHealthy(ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      // Agent KHÔNG có `/api/health`. Dùng `/api/element-lib` làm nhịp dò: đọc đĩa,
      // rẻ, và tuyệt đối KHÔNG dùng `/api/doctor` — nó spawn `codex debug` ~1s/lần và
      // §6.2 cấm poll endpoint đó.
      const r = await api("/api/element-lib");
      if (r.ok) return true;
    } catch { /* chưa bind cổng */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), "kg-w3-"));
  server = spawn("node", [join(REPO, "agent", "server.mjs"), "--workspace", workspace, "--port", String(PORT)], {
    stdio: "ignore",
    detached: false,
  });
  const ok = await waitHealthy(15000);
  if (!ok) throw new Error(`agent không lên ở ${BASE} — kiểm cổng ${PORT} có đang bận không`);
}, 30000);

afterAll(() => {
  server?.kill("SIGTERM");
  resetWorkflowStores();
});

describe("WAVE 3 · tích hợp với agent thật — 0 lượt AI", () => {
  it("agent sống, và element-lib trả đúng 42 món (nguồn duy nhất của §W3-5)", async () => {
    const lib = await json("/api/element-lib");
    expect(lib.status).toBe(200);
    expect((lib.body as { elements: unknown[] }).elements.length).toBe(42);
  });

  it("tạo bộ kit rồi GHI contract do workflow sinh ra — agent NHẬN (đây là cả W3-1 + W3-2)", async () => {
    const made = await json("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `template` chỉ nhận blank|basic|import (`agent/routes/projects.mjs:51`);
      // id do `slug` quyết định, KHÔNG phải trường `id`.
      body: JSON.stringify({ name: "Kit W3 tích hợp", slug: PROJECT, template: "blank" }),
    });
    expect([200, 201]).toContain(made.status);

    const got = await json(`/api/projects/${PROJECT}/contract`);
    expect(got.status).toBe(200);
    const version = (got.body as { version: number }).version;

    const contract = buildKitsetContract(createWorkflowStore(PROJECT).getState());
    const put = await json(`/api/projects/${PROJECT}/contract`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": String(version) },
      body: JSON.stringify({ contract }),
    });
    // ⬇ Đây là câu trả lời cho câu hỏi trung tâm của WAVE 3: thứ workflow sinh ra
    //   có phải thứ engine ăn được không.
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((put.body as { version: number }).version).toBeGreaterThan(version);

    const back = await json(`/api/projects/${PROJECT}/contract`);
    const saved = contractSchema.parse((back.body as { contract: unknown }).contract);
    expect(saved.sheets.length).toBe(contract.sheets.length);
    expect(contractJobs(saved).length).toBe(contractJobs(contract).length);
    expect((saved.variants ?? [])[0]?.id).toBe(MAIN_VARIANT_ID);
  });

  it("agent VALIDATE contract của ta: 0 lỗi chặn (nếu có, gen.sh cũng sẽ nổ)", async () => {
    const contract = buildKitsetContract(createWorkflowStore(PROJECT).getState());
    const res = await json(`/api/projects/${PROJECT}/contract/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract }),
    });
    expect(res.status).toBe(200);
    const v = res.body as { errors: { code: string; message?: string }[] };
    expect(v.errors, JSON.stringify(v.errors)).toEqual([]);
  });

  it("mọi id job của ta được agent CÔNG NHẬN — sai một chữ là POST /runs trả UNKNOWN_JOB", async () => {
    const contract = buildKitsetContract(createWorkflowStore(PROJECT).getState());
    const jobs = contractJobs(contract).map((j) => j.job);
    expect(jobs.length).toBeGreaterThan(0);
    // Gửi `kind:"slice"` — PIL thuần, KHÔNG tốn lượt. Agent đối chiếu `jobs` với
    // contract TRƯỚC khi chạy (`agent/lib/runs.mjs:46-52`), nên chỉ cần nó không trả
    // UNKNOWN_JOB là đã chứng minh tên job của ta khớp. Ảnh chưa có nên run tự hỏng
    // sau đó — không sao, thứ đang kiểm là khâu ĐỐI CHIẾU TÊN.
    const res = await json(`/api/projects/${PROJECT}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "slice", jobs, maxJobs: 1, autoSliceAfterGen: false }),
    });
    expect(errCode(res.body), `agent không nhận job: ${JSON.stringify(errDetails(res.body)?.unknown)}`).not.toBe("UNKNOWN_JOB");
  });

  it("UPLOAD ẢNH THẬT (§W3-3): file nằm trên đĩa, tên mang kind, đọc ngược ra đúng ô thả", async () => {
    // PNG 1×1 hợp lệ — agent sniff MAGIC BYTE, không tin đuôi file.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "anh-mau.png");
    fd.append("kind", "inspo");
    const up = await api(`/api/projects/${PROJECT}/refs`, { method: "POST", body: fd });
    expect(up.status).toBe(201);
    const info = (await up.json()) as { name: string; path: string };

    // ① Có thật trên đĩa — đây là điều bản cũ KHÔNG làm được (Blob bị vứt).
    const refsDir = join(workspace, "projects", PROJECT, "refs");
    expect(existsSync(join(refsDir, info.name)), `${info.name} không có trong ${refsDir}`).toBe(true);
    expect(readdirSync(refsDir)).toContain(info.name);

    // ② Đường dẫn contract đúng dạng `refs/<name>` như gen.sh:142 mong đợi.
    expect(info.path).toBe(`refs/${info.name}`);

    // ③ Kind đọc NGƯỢC được từ tên ⇒ sau F5 chip về đúng ô thả (§W3-3 "CHỖ TINH TẾ").
    expect(info.name.startsWith("inspo-")).toBe(true);
    expect(refKindOf(info.name)).toBe("inspo");

    // ④ Danh sách trả về thấy nó.
    const list = await json(`/api/projects/${PROJECT}/refs`);
    expect((list.body as { items: { name: string }[] }).items.map((i) => i.name)).toContain(info.name);
  });

  it("ref đã dùng trong contract thì agent BÁO `usedBy` — chứng minh `refs/<name>` khớp refUsage", async () => {
    const list = await json(`/api/projects/${PROJECT}/refs`);
    const name = (list.body as { items: { name: string }[] }).items[0]!.name;

    const got = await json(`/api/projects/${PROJECT}/contract`);
    const version = (got.body as { version: number }).version;
    const base = createWorkflowStore(PROJECT).getState();
    const contract = buildKitsetContract(
      { ...base, styleRefs: [{ name, kind: "style" }] },
    );
    const put = await json(`/api/projects/${PROJECT}/contract`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": String(version) },
      body: JSON.stringify({ contract }),
    });
    expect(put.status).toBe(200);

    const after = await json(`/api/projects/${PROJECT}/refs`);
    const item = (after.body as { items: { name: string; usedBy: unknown[] }[] }).items.find((i) => i.name === name)!;
    // `agent/lib/validate.mjs:100` khớp bằng `p === name || p.endsWith("/" + name)`.
    // Rỗng ở đây nghĩa là ta ghi sai đường dẫn ref và V-08 sẽ không bao giờ chặn xoá.
    expect(item.usedBy.length).toBeGreaterThan(0);
  });

  it("If-Match SAI thì agent từ chối (409) — chứng minh chống ghi đè của W3-2 là thật", async () => {
    const contract = buildKitsetContract(createWorkflowStore(PROJECT).getState());
    const res = await json(`/api/projects/${PROJECT}/contract`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": "1" },
      body: JSON.stringify({ contract }),
    });
    expect(res.status).toBe(409);
    expect(errCode(res.body)).toBe("CONTRACT_CONFLICT");
  });

  it("CHÍNH FILE NÀY không chứa một lời gọi sinh ảnh nào", () => {
    const src = readFileSync(new URL(import.meta.url).pathname, "utf8");
    const calls = src.match(/kind:\s*["']gen["']/g) ?? [];
    expect(calls).toEqual([]);
  });
});
