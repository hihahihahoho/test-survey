#!/usr/bin/env node
/**
 * dev-full.mjs — `npm run dev:full`: AGENT CỦA REPO + vite, cùng một cú gõ.
 *
 * ╔══ CON BỌ MÀ SCRIPT NÀY SINH RA ĐỂ CHẤM DỨT ══════════════════════════════╗
 * ║ Chủ sản phẩm báo *"đang dựng prompt cứ quay tròn không ra gì"*. Truy ra:   ║
 * ║ `npm run dev` proxy sang cổng 8765 (`vite.config.ts`), và ở cổng đó KHÔNG  ║
 * ║ phải agent của repo — đó là agent BẢN CÀI đang chạy thường trực:           ║
 * ║   ~/.kitgen/releases/2.1.43/agent/server.mjs --workspace ~/KitGen          ║
 * ║ Bản 2.1.43 không có `POST …/prompt-preview` (đo bằng curl: `404            ║
 * ║ NOT_FOUND · no route for POST …`). Nghĩa là mã MỚI đang nói chuyện với     ║
 * ║ server CŨ — và không có gì trên màn hình nói ra điều đó.                   ║
 * ║                                                                            ║
 * ║ Hai lớp chữa, cả hai đều cần:                                              ║
 * ║  ① UI phải nói thẳng khi gặp agent cũ (`lib/block-prompt.ts`);             ║
 * ║  ② dev phải có một lệnh chạy ĐÚNG agent của repo — chính là file này.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ BA QUYẾT ĐỊNH, MỖI CÁI MỘT LÝ DO ĐO ĐƯỢC ══════════════════════════════
 *
 * ① WORKSPACE RIÊNG `~/KitGen-dev` **VÀ** `KITGEN_HOME` RIÊNG.
 *    Bản đầu của script này chỉ đổi workspace, vì chú thích cũ tin rằng khoá một
 *    tiến trình là khoá THEO WORKSPACE. ĐO LẠI THÌ KHÔNG PHẢI:
 *    `server.mjs:367` gọi `acquireInstanceLock({ kitgenHome: … ?? defaultKitgenHome() })`
 *    — khoá nằm ở `<KITGEN_HOME>/agent.lock`, tức là MỘT KHOÁ CHO CẢ MÁY, không
 *    liên quan gì tới workspace. Hậu quả đo được: bản cài đang chạy trên `~/KitGen`
 *    giữ `~/.kitgen/agent.lock`, và agent repo trỏ vào `~/KitGen-dev` vẫn chết ngay
 *    với `KitGen agent da chay (PID …)`. Nên phải tách CẢ HAI.
 *
 *    Giá phải trả, nói thẳng: `KITGEN_HOME` cũng là nơi `platform.mjs` tìm shim
 *    `python3` và `node` cho `gen.sh` TRÊN WINDOWS. Chạy `dev:full` rồi bấm Vẽ
 *    trên Windows thì trỏ `KITGEN_DEV_HOME` về bản cài thật (và tắt bản cài trước).
 *    Trên macOS/Linux `gen.sh` dùng `python3`/`node` của PATH nên không ảnh hưởng.
 *
 * ② TỰ DÒ CỔNG TRỐNG thay vì ghim cứng một số.
 *    8799 là cổng mặc định ở đây, nhưng máy dev nào cũng có thể đã có thứ khác ngồi
 *    đó (máy viết script này: một tiến trình Python). Ghim cứng thì agent chết vì
 *    `EADDRINUSE` và người chạy phải đi đọc log để biết vì sao. Dò rồi TRUYỀN CÙNG
 *    MỘT SỐ cho cả agent lẫn vite ⇒ proxy không bao giờ trỏ nhầm chỗ.
 *
 * ③ KHÔNG KÉO `concurrently` VÀO DEPENDENCIES.
 *    Hai tiến trình con và một `SIGINT` không đáng một gói npm nữa. Đổi lại phải làm
 *    đúng phần dọn dẹp: Ctrl+C phải giết CẢ HAI, và một bên chết thì bên kia cũng
 *    phải xuống — nếu không, lần chạy sau sẽ gặp một agent mồ côi vẫn giữ khoá
 *    workspace, tức đúng cái bẫy mà ① vừa gỡ.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const WEBAPP = resolve(new URL("..", import.meta.url).pathname);
const AGENT_ENTRY = resolve(WEBAPP, "..", "agent", "server.mjs");

/** Workspace của DEV. Đổi được để chạy nhiều nhánh song song. */
const WORKSPACE = process.env.KITGEN_DEV_WORKSPACE ?? join(homedir(), "KitGen-dev");
/** Thư mục cài ĐỂ DEV — nơi đặt `agent.lock`. Xem quyết định ① ở đầu file. */
const KITGEN_HOME = process.env.KITGEN_DEV_HOME ?? join(WORKSPACE, ".kitgen-home");
/** Cổng bắt đầu dò. Dải 8799+ nằm ngoài dải bản cài dùng (8765–8767). */
const FIRST_PORT = Number(process.env.KITGEN_DEV_PORT ?? 8799);
const PORT_TRIES = 10;

/** Cổng này có ai ngồi không? Thử bind THẬT — `lsof` không có trên mọi máy. */
function portFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  for (let port = FIRST_PORT; port < FIRST_PORT + PORT_TRIES; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error(`Không còn cổng trống trong dải ${FIRST_PORT}–${FIRST_PORT + PORT_TRIES - 1}.`);
}

const port = await pickPort();
mkdirSync(WORKSPACE, { recursive: true });
mkdirSync(KITGEN_HOME, { recursive: true });

process.stdout.write(
  `\n[dev:full] agent repo  → ${AGENT_ENTRY}\n` +
  `[dev:full] workspace   → ${WORKSPACE}\n` +
  `[dev:full] KITGEN_HOME → ${KITGEN_HOME}  (khoá một-tiến-trình nằm ở đây)\n` +
  `[dev:full] cổng agent  → ${port}${port === FIRST_PORT ? "" : `  (${FIRST_PORT} đang bận)`}\n` +
  `[dev:full] vite proxy  → KITGEN_AGENT_PORT=${port}\n\n`,
);

const children = [];
let downing = false;

/** Một tiến trình con chết ⇒ hạ cả hai. Agent mồ côi giữ khoá workspace của lần sau. */
function down(code) {
  if (downing) return;
  downing = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code ?? 0;
}

function start(label, command, args, env) {
  /* `stdio: "inherit"`: log của agent và của vite đi thẳng ra terminal đang mở.
     Gom qua pipe rồi in lại chỉ để thêm tiền tố sẽ NUỐT MÀU và nuốt cả phần vẽ
     lại dòng của vite — đúng thứ làm cho log dev khó đọc. */
  const child = spawn(command, args, { cwd: WEBAPP, stdio: "inherit", env: { ...process.env, ...env } });
  child.on("exit", (code, signal) => {
    if (!downing) process.stdout.write(`\n[dev:full] ${label} đã dừng (${signal ?? code}) — hạ nốt tiến trình còn lại.\n`);
    down(code ?? 1);
  });
  child.on("error", (err) => {
    process.stderr.write(`\n[dev:full] không chạy được ${label}: ${err.message}\n`);
    down(1);
  });
  children.push(child);
  return child;
}

start("agent", process.execPath, [
  AGENT_ENTRY,
  "--workspace", WORKSPACE,
  "--port", String(port),
  /* Origin mà VITE PROXY sẽ gửi. `vite.config.ts` đặt `origin: http://127.0.0.1:<cổng>`
     — tức chính base của agent — nên nó đã nằm sẵn trong allowlist loopback mặc định.
     Khai tường minh ở đây để lệnh này vẫn đúng nếu mai kia proxy đổi cách đặt Origin. */
  "--origin", `http://127.0.0.1:${port}`,
], { KITGEN_HOME });

start("vite", process.execPath, [join(WEBAPP, "node_modules", "vite", "bin", "vite.js")], {
  KITGEN_AGENT_PORT: String(port),
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => down(0));
