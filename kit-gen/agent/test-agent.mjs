#!/usr/bin/env node
/* ============================================================================
   test-agent.mjs — chạy:  node agent/test-agent.mjs
   Workspace tạm trong /tmp (KHÔNG dùng dữ liệu thật), dọn sạch khi xong.
   Chi tiết từng nhóm ca nằm ở agent/test/suite-*.mjs; khung chung ở agent/test/harness.mjs
   (kèm ghi chú trung thực về giới hạn của môi trường: không bind được TCP).

   Nhóm ca:
     suite-system    health · doctor · workspaces · CORS/Host/preflight/loopback
     suite-projects  CRUD trọn vòng · thùng rác 30 ngày · phục hồi · mã 4 số · export zip
     suite-paths     ../ · %2e%2e · symlink ra ngoài · whitelist thư mục đọc
     suite-contract  version + If-Match (412/409) · validate V-01..V-08 · lịch sử
     suite-limits    413 body (2 đường) · 429 rate limit
     suite-refs      multipart · agent tự đặt tên · magic bytes · REF_IN_USE
     suite-runs      run-store trên đĩa · stream NDJSON + reconnect · dừng · gen→slice thật
     suite-import    nhập một chiều có báo cáo · /app/ same-origin · /bridge.html · redact
   ========================================================================== */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { createAgent } from "./server.mjs"
import { apiFor, fakeDoctor, report, PAGES, PORT } from "./test/harness.mjs"
import { run as runSystem } from "./test/suite-system.mjs"
import { run as runProjects } from "./test/suite-projects.mjs"
import { run as runPaths } from "./test/suite-paths.mjs"
import { run as runContract } from "./test/suite-contract.mjs"
import { run as runLimits } from "./test/suite-limits.mjs"
import { run as runDocs } from "./test/suite-docs.mjs"
import { run as runRefs } from "./test/suite-refs.mjs"
import { run as runRuns } from "./test/suite-runs.mjs"
import { run as runImport } from "./test/suite-import.mjs"

const AGENT_DIR = dirname(fileURLToPath(import.meta.url))

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
const { pid } = await runProjects(base)
await runPaths({ ...base, pid })
await runContract({ ...base, pid })
await runDocs({ ...base, pid })
await runLimits({ ...base, pid })
await runRefs({ ...base, pid })
await runRuns({ ...base, pid })
await runImport({ ...base, pid })

await rm(tmp, { recursive: true, force: true })
process.exit(report() ? 1 : 0)
