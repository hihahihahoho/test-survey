/* suite-paths.mjs — chống path traversal bằng resolve + realpath (KHÔNG regex).
   Bài học studio-server.mjs dòng 62: `/^refs\//` thua cả ../ và symlink. */
import { symlink, rm } from "node:fs/promises"
import { join } from "node:path"
import { describe, it, eq, ok } from "./harness.mjs"

export async function run({ api, wsRoot, outsideRoot, pid }) {
  // ─────────────────────────────────────────── 5. PATH TRAVERSAL / SYMLINK
  describe("chống path traversal")
  await it("../ trong files/* bị chặn", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/../../../../etc/passwd`)
    ok([400, 404].includes(r.status), `status ${r.status}`)
    ok(["PATH_ESCAPE", "NOT_FOUND"].includes(r.json?.error?.code), `code ${r.json?.error?.code}`)
    ok(!r.text.includes("root:"), "KHÔNG được trả nội dung /etc/passwd")
  })
  await it("%2e%2e (URL-encoded ../) bị chặn", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`)
    ok([400, 404].includes(r.status), `status ${r.status}`)
    ok(!r.text.includes("root:"), "KHÔNG được trả nội dung /etc/passwd")
  })
  await it("%2e%2e trong raw/ bị chặn (không đọc được file ngoài workspace)", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/raw%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fsecret.txt`)
    ok([400, 404].includes(r.status), `status ${r.status}`)
    ok(!r.text.includes("BÍ MẬT"), "KHÔNG được đọc file ngoài workspace")
  })
  await it("đường dẫn tuyệt đối bị chặn", async () => {
    const r = await api("GET", `/api/projects/${pid}/files//etc/hosts`)
    ok(r.status >= 400, `status ${r.status}`)
    ok(!/localhost/.test(r.text) || r.json?.error, "không trả nội dung /etc/hosts")
  })
  await it("symlink trỏ RA NGOÀI workspace bị chặn (regex không làm được việc này)", async () => {
    const link = join(wsRoot, "projects", pid, "refs", "escape.png")
    await symlink(join(outsideRoot, "secret.txt"), link)
    const r = await api("GET", `/api/projects/${pid}/files/refs/escape.png`)
    ok(r.status >= 400, `phải bị chặn, nhận status ${r.status}`)
    eq(r.json?.error?.code, "PATH_ESCAPE", "code")
    ok(!r.text.includes("BÍ MẬT"), "KHÔNG được đọc qua symlink")
    await rm(link, { force: true })
  })
  await it("symlink cả THƯ MỤC trỏ ra ngoài cũng bị chặn", async () => {
    const link = join(wsRoot, "projects", pid, "kits", "out")
    await symlink(outsideRoot, link, "dir")
    const r = await api("GET", `/api/projects/${pid}/files/kits/out/secret.txt`)
    ok(r.status >= 400, `phải bị chặn, nhận status ${r.status}`)
    ok(!r.text.includes("BÍ MẬT"), "KHÔNG được đi qua symlink thư mục")
    await rm(link, { force: true })
  })
  await it("chỉ đọc được thư mục dữ liệu; .history và file lạ bị từ chối", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/.history/contract/x.json`)
    eq(r.status, 400, "status")
    eq(r.json.error.code, "PATH_ESCAPE", "code")
  })
  await it("ref name có dấu / bị từ chối (không ghi ra ngoài refs/)", async () => {
    const r = await api("DELETE", `/api/projects/${pid}/refs/..%2f..%2fgen.sh`)
    ok(r.status >= 400, `status ${r.status}`)
    ok(["BAD_REQUEST", "PATH_ESCAPE", "REF_NOT_FOUND", "NOT_FOUND"].includes(r.json?.error?.code), `code ${r.json?.error?.code}`)
  })

}
