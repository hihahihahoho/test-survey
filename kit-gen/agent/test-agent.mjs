#!/usr/bin/env node
/* ============================================================================
   test-agent.mjs — chạy:  node agent/test-agent.mjs
   Workspace tạm trong /tmp (KHÔNG dùng dữ liệu thật), dọn sạch khi xong.
   Chi tiết từng nhóm ca nằm ở agent/test/suite-*.mjs; khung chung ở agent/test/harness.mjs
   (kèm ghi chú trung thực về giới hạn của môi trường: không bind được TCP).

   Nhóm ca:
     suite-system    health · doctor · workspaces · CORS/Host/preflight/loopback
     suite-settings  tuỳ chọn người dùng trên đĩa · vá một phần · hợp đồng bảo mật của config.json
     suite-projects  CRUD trọn vòng · thùng rác 30 ngày · phục hồi · cụm xác nhận + đối chiếu project · export zip
     suite-paths     ../ · %2e%2e · symlink ra ngoài · whitelist thư mục đọc
     suite-contract  version + If-Match (412/409) · validate V-01..V-08 · lịch sử
     suite-limits    413 body (2 đường) · 429 rate limit
     suite-refs      multipart · agent tự đặt tên · magic bytes · REF_IN_USE
     suite-runs      run-store trên đĩa · stream NDJSON + reconnect · dừng · gen→slice thật
     suite-pause     dừng giữa chừng → chạy tiếp phần thiếu · run mồ côi sau khi agent chết
     suite-cover     ảnh bìa: prompt neo branding gốc · toạ độ vùng tiêu đề · job phụ không phá run
     suite-import    nhập một chiều có báo cáo · /app/ same-origin · /bridge.html · redact
   ========================================================================== */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { createAgent } from "./server.mjs"
import { apiFor, currentCase, fakeDoctor, report, PAGES, PORT } from "./test/harness.mjs"
import { run as runSystem } from "./test/suite-system.mjs"
import { run as runSettings } from "./test/suite-settings.mjs"
import { run as runProjects } from "./test/suite-projects.mjs"
import { run as runPaths } from "./test/suite-paths.mjs"
import { run as runContract } from "./test/suite-contract.mjs"
import { run as runLimits } from "./test/suite-limits.mjs"
import { run as runDocs } from "./test/suite-docs.mjs"
import { run as runRefs } from "./test/suite-refs.mjs"
import { run as runRuns } from "./test/suite-runs.mjs"
import { run as runPause } from "./test/suite-pause.mjs"
import { run as runCover } from "./test/suite-cover.mjs"
import { run as runImport } from "./test/suite-import.mjs"
import { run as runLibrary } from "./test/suite-library.mjs"

const AGENT_DIR = dirname(fileURLToPath(import.meta.url))

/* ══ ĐỒNG HỒ CHẾT ═══════════════════════════════════════════════════════════════
   Mỗi ca đã có trần 25s (harness), nhưng thứ nằm NGOÀI ca — dựng agent, dọn dẹp,
   một handle không ai đóng — thì không có trần nào. Trên runner Windows lần đầu, bộ
   ca đứng im 74 phút rồi bị huỷ tay: không một dòng log, không biết chết ở đâu, và
   GitHub thì đợi tới 6 tiếng mới tự giết (run 31786773182).
   Từ nay: quá ngân sách thì TỰ KHAI ra đang kẹt ở ca nào, còn những handle nào đang
   sống (đây mới là câu trả lời thật cho "vì sao không thoát"), in báo cáo tới thời
   điểm đó rồi thoát 1. Treo phải thành ĐỎ CÓ TÊN, không phải một khoảng lặng.
   `unref()` để đồng hồ này không bao giờ tự nó giữ tiến trình sống thêm. */
const BUDGET_MS = Number(process.env.KITGEN_TEST_BUDGET_MS ?? 10 * 60_000)
const watchdog = setTimeout(() => {
  const where = currentCase() ?? "(chưa vào ca nào — kẹt ở khâu dựng agent hoặc dọn dẹp)"
  process.stdout.write(
    `\n\n╳ QUÁ NGÂN SÁCH ${Math.round(BUDGET_MS / 1000)}s — BỘ CA ĐANG TREO\n` +
    `  ca hiện tại : ${where}\n` +
    `  handle sống : ${(process.getActiveResourcesInfo?.() ?? ["(node < 18.3)"]).join(", ")}\n`)
  report()
  process.exit(1)
}, BUDGET_MS)
watchdog.unref()

const tmp = await mkdtemp(join(tmpdir(), "kitgen-test-"))
const wsRoot = join(tmp, "KitGen")
const outsideRoot = join(tmp, "outside")
await mkdir(wsRoot, { recursive: true })
await mkdir(outsideRoot, { recursive: true })
await writeFile(join(outsideRoot, "secret.txt"), "BÍ MẬT NGOÀI WORKSPACE\n")

process.env.KITGEN_DOCTOR_LITE = "1"    // doctor không spawn ra ngoài khi chạy độc lập

const agent = await createAgent({
  workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
  rateLimit: 500, doctor: fakeDoctor(false),
})
agent.state.port = PORT
const { api, call } = apiFor(agent.server)

const base = { api, call, agent, wsRoot, outsideRoot, tmp, agentDir: AGENT_DIR }

await runSystem(base)
await runSettings(base)
const { pid } = await runProjects(base)
await runPaths({ ...base, pid })
await runContract({ ...base, pid })
await runDocs({ ...base, pid })
await runLimits({ ...base, pid })
await runRefs({ ...base, pid })
await runLibrary(base)
await runRuns({ ...base, pid })
await runPause({ ...base, pid })
await runCover({ ...base, pid })
await runImport({ ...base, pid })

/* Dọn workspace tạm. Trên Windows bước này ĐÃ TỪNG giết cả bộ ca (run 31784778492):
   `rmdir … ENOTEMPTY` ném ra ở top-level ⇒ unhandled rejection ⇒ tiến trình chết TRƯỚC
   khi kịp in báo cáo, 146 ca xanh biến mất khỏi màn hình vì một cái handle chưa nhả.
   Hai thay đổi, mỗi cái một lý do:
     · `maxRetries` — Windows nhả handle chậm một nhịp (tiến trình con vừa bị taskkill,
       Defender vừa quét file mới ghi). Nguyên nhân gốc của lần đó là fd rò ở
       `scheduleUpdate` (đã vá, xem update.mjs ④), nhưng dọn dẹp thì vẫn phải chịu được
       nhịp trễ của hệ điều hành.
     · try/catch — KẾT QUẢ CHẠY CA quan trọng hơn việc xoá được thư mục tạm. Không nuốt
       im: in cảnh báo rồi vẫn trả đúng mã thoát của bộ ca. */
try {
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
} catch (e) {
  process.stdout.write(`\n[cảnh báo] không dọn được thư mục tạm ${tmp}: ${e?.code ?? e}\n` +
    "           (kết quả bộ ca bên dưới vẫn đúng; trên Windows đây là dấu hiệu còn handle mở)\n")
}
process.exit(report() ? 1 : 0)
