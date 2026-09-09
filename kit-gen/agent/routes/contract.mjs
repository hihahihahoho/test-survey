/* routes/contract.mjs — Contract có version + If-Match (409 khi lệch) + element-lib
   chỉ-đọc + #29 prompt-preview: xem NGUYÊN VĂN prompt trước khi tiêu quota.
   Lịch sử/khôi phục snapshot và validate dry-run đã bỏ cùng màn Design đời cũ;
   `writeContract` vẫn ghi snapshot xuống đĩa (đường lùi tay), chỉ không còn route. */
import { join } from "node:path"
import { readContract, writeContract, contractJobs } from "../lib/contract.mjs"
import { validateContract } from "../lib/validate.mjs"
import { loadElementLib } from "../lib/templates.mjs"
import { fail } from "../lib/errors.mjs"
import { readProject } from "../lib/projects.mjs"
import { projectDir } from "../lib/projects-dir.mjs"
import { exists, readFile, removeTree } from "../lib/fsx.mjs"
import { redactLine, shortenPath } from "../lib/redact.mjs"
import { resolveEngine, renderPromptsOnly } from "../lib/engine.mjs"
import { refAlpha } from "../lib/ref-alpha.mjs"
import { safeJoin } from "../lib/paths.mjs"
import { descBody, descCacheName, fillDescPlaceholders, parseRefsManifest } from "../lib/prompt-refs.mjs"

export function register(r) {
  // #22 GET contract → ETag = version
  r.get("/api/projects/:id/contract", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)              // 404/410 sớm nếu project không còn
    const { version, contract } = await readContract(ws, ctx.params.id)
    return { status: 200, json: { version, contract }, headers: { ETag: `"${version}"` } }
  })

  // #23 PUT contract — If-Match BẮT BUỘC (thiếu = 412, lệch = 409)
  r.put("/api/projects/:id/contract", async ctx => {
    const ws = ctx.registry.active
    const body = await ctx.json()
    if (!body || typeof body.contract !== "object" || body.contract === null)
      fail("BAD_REQUEST", "body must be {contract:{…}}")
    const res = await writeContract(ws, ctx.params.id, body.contract, { ifMatch: ctx.req.headers["if-match"] })
    return {
      status: 200,
      json: { version: res.version, hash: res.hash, snapshot: res.snapshot, validation: res.validation },
      headers: { ETag: `"${res.version}"` },
    }
  })

  /* ══ #29 XEM TRƯỚC PROMPT ═══════════════════════════════════════════════════
     VÌ SAO KHÔNG DỰNG LẠI PROMPT BẰNG JS: prompt được lắp trong gen.sh (khối
     python ~700 dòng, có cả những câu chỉ bật theo hình dạng ô, theo ảnh ref, theo
     bảng màu). Một bản dựng lại ở agent sẽ trôi khỏi bản gốc trong im lặng và nói
     dối đúng lúc người dùng tin nó nhất — đúng lỗi mà `item-prompt.ts` bên web
     phải có cả một bộ ca đọc gen.sh THẬT để canh. Nên ở đây CHẠY THẬT gen.sh với
     KITGEN_PROMPTS_ONLY=1: không mạng, không quota, không đụng raw/.

     body: {contract?} — có thì xem trước bản ĐANG SỬA (chưa lưu), không có thì đọc
     contract.json đã lưu. KHÔNG ghi contract.json trong mọi trường hợp; thứ duy
     nhất bị ghi đè là styles.json + prompts/ của project, đúng như một lượt gen.

     409 KHI ĐANG CÓ RUN: lượt xem trước ghi đè chính styles.json/prompts/ mà lượt
     chạy đang đọc ⇒ hai tiến trình giẫm chân nhau trên cùng thư mục. Từ chối thẳng
     rẻ hơn nhiều so với một lượt gen hỏng giữa chừng vì lý do không ai đoán ra. */
  r.post("/api/projects/:id/prompt-preview", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)                          // 404/410 sớm nếu project không còn

    const body = await ctx.json()
    if (body?.contract !== undefined && (typeof body.contract !== "object" || body.contract === null))
      fail("BAD_REQUEST", "contract must be an object when present")
    const contract = body?.contract ?? (await readContract(ws, id)).contract

    // Lắp prompt là chạy `assert len(components) == cols*rows` của gen.sh. Contract sai
    // lưới thì engine chết giữa chừng và người dùng nhận một mã thoát; nói thẳng lỗi
    // hình thức ở đây có ích hơn nhiều.
    const v = validateContract(contract)
    if (v.errors.length)
      fail("CONTRACT_INVALID", `contract has ${v.errors.length} error(s), cannot build prompts`,
        { details: { errors: v.errors } })

    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished)
      fail("RUN_ACTIVE", `project ${id} has active run ${active.id}`, { details: { runId: active.id } })

    const engineDir = await resolveEngine(ws)
    if (!engineDir)
      fail("PROMPT_PREVIEW_FAILED", "engine not installed (gen.sh not found)", { details: { reason: "ENGINE_MISSING" } })

    const pdir = projectDir(ws, id)
    const jobs = contractJobs(contract)
    /* XOÁ PROMPT CŨ TRƯỚC. prompts/ sống qua nhiều lượt: không dọn thì một tấm mà
       engine dựng hụt lần này vẫn trả về prompt của lần trước — bản xem trước sai
       mà trông hoàn toàn bình thường, đúng kiểu hỏng tệ nhất cho một màn hình mà cả
       giá trị của nó là "nói đúng cái sẽ gửi đi". */
    for (const j of jobs) {
      await removeTree(join(pdir, "prompts", `${j.job}.txt`)).catch(() => {})
      await removeTree(join(pdir, "prompts", `${j.job}.att`)).catch(() => {})
      await removeTree(join(pdir, "prompts", `${j.job}.refs`)).catch(() => {})
    }

    const res = await renderPromptsOnly(engineDir, pdir, contract)

    const out = []
    const missing = []
    /* Ảnh nào của tấm nào — gom TRƯỚC, đo alpha SAU, một lượt cho cả lượt xem trước.
       `refAlpha` mở từng PNG ra đếm histogram bằng một tiến trình python; một dự án
       thật có 5-15 ảnh dùng chung cho hàng chục tấm, nên đo từng ảnh từng tấm là
       hàng trăm lượt spawn cho vài câu trả lời. */
    const pending = []
    for (const j of jobs) {
      const txt = join(pdir, "prompts", `${j.job}.txt`)
      if (!(await exists(txt))) { missing.push(j.job); continue }
      const rawPrompt = await readFile(txt, "utf8")
      /* Dấu chỗ `{{DESC:…}}` được thay TRƯỚC khi redact: người đọc bản xem trước
         không cần thấy cú pháp mối nối python→bash, họ cần biết chỗ ấy sẽ là gì.
         Prompt THẬT gửi máy vẽ không đổi — xem `fillDescPlaceholders`. */
      const filled = fillDescPlaceholders(rawPrompt)
      // redactLine như GET /api/runs/:runId/jobs/:job/prompt: hợp đồng "không bao giờ
      // trả path tuyệt đối ra client" là hợp đồng của CỬA RA, không của từng nguồn.
      const prompt = redactLine(filled.text)
      let attachments = []
      const att = join(pdir, "prompts", `${j.job}.att`)
      if (await exists(att))
        attachments = (await readFile(att, "utf8")).split("\n")
          .map(s => shortenPath(s.trim())).filter(Boolean)
      /* BẢN KÊ ĐẦY ĐỦ (`.refs`) là nguồn duy nhất cho danh sách ảnh. Engine đời cũ
         chưa ghi file này ⇒ rơi về `.att`: hiện được nửa sự thật vẫn hơn hiện một
         khối rỗng, và web sẽ thấy `role` trống thay vì một vai bịa ra. */
      const refsFile = join(pdir, "prompts", `${j.job}.refs`)
      const rows = (await exists(refsFile))
        ? parseRefsManifest(await readFile(refsFile, "utf8"))
        : attachments.map(path => ({ mode: "attached", role: "", path }))
      pending.push({ j, prompt, attachments, rows, standIn: filled.standIn })
    }

    /* Đường dẫn TUYỆT ĐỐI chỉ sống trong đoạn này — đo alpha cần file thật, còn thứ
       đi ra response là nhãn tương đối đã qua `shortenPath`. */
    const absOf = new Map()
    for (const { rows } of pending)
      for (const r of rows) {
        if (absOf.has(r.path)) continue
        /* `safeJoin` NÉM khi đường dẫn trèo ra ngoài project. Ở đây một ảnh như thế
           chỉ đáng bị bỏ khỏi phép đo alpha (nó về `false` = "coi như đục", đúng
           đường an toàn của gen.sh), không đáng làm đổ cả cửa xem trước. */
        try { absOf.set(r.path, safeJoin(pdir, r.path)) } catch { /* bỏ ảnh này */ }
      }
    const alphaOf = await refAlpha([...absOf.values()])

    for (const { j, prompt, attachments, rows, standIn } of pending) {
      const images = []
      for (const r of rows) {
        /* MÔ TẢ ĐANG ĐỨNG THAY CHO ẢNH NÀY TRONG PROMPT, không phải "mô tả trong
           kho". Còn dấu chỗ ⇒ câu chờ vừa đặt vào; hết dấu chỗ ⇒ chính gen.sh đã
           dán đoạn văn trong cache vào, nên đọc lại đúng file cache ấy. Ảnh đính
           thẳng thì không có đoạn nào cả — nó tới máy vẽ bằng pixel. */
        let desc = null
        if (r.mode === "described") {
          desc = standIn.get(r.path) ?? null
          if (desc === null) {
            const cache = join(pdir, "refs", descCacheName(r.path))
            if (await exists(cache)) desc = descBody(await readFile(cache, "utf8")) || null
          }
        }
        images.push({
          path: shortenPath(r.path),
          role: r.role,
          mode: r.mode,
          alpha: alphaOf.get(absOf.get(r.path)) === true,
          desc: desc === null ? null : redactLine(desc),
        })
      }
      out.push({ job: j.job, variant: j.variant, sheet: j.sheet, prompt, attachments, images })
    }

    if (!out.length)
      fail("PROMPT_PREVIEW_FAILED", "engine produced no prompt", {
        details: {
          reason: res.timedOut ? "TIMEOUT" : "ENGINE_FAILED",
          exitCode: res.code,
          // Đuôi output của engine ĐÃ redact — đây là bằng chứng, không phải nhật ký.
          output: redactLine(String(res.output ?? "")).split("\n").slice(-12).join("\n"),
        },
      })
    return { status: 200, json: { jobs: out, missing } }
  })

  // #28 element-lib — CATALOGUE CHỈ ĐỌC (X8: không có UI nào ghi vào đây)
  r.get("/api/element-lib", async ctx => {
    const lib = await loadElementLib(ctx.registry.active)
    return { status: 200, json: lib, headers: { "Cache-Control": "no-cache" } }
  })
}
