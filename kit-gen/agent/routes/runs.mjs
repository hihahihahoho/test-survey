/* routes/runs.mjs — §6.2 E: #32..#40. Chạy gen/slice + stream NDJSON + dừng
   + log/prompt từng lượt + lịch sử ảnh raw 3 đời. */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, readFile, stat, mtimeOf, ensureDir, removeTree, writeFileAtomic } from "../lib/fsx.mjs"
import { RE_JOB, assertMatch, safeSegment } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { sanitizeRun } from "../lib/runs.mjs"
import { readContract } from "../lib/contract.mjs"
import { validateContract } from "../lib/validate.mjs"
import {
  RE_RAW_HISTORY_ID, archiveRaw, listRawHistory, rawHistoryDir, rawHistoryName,
} from "../lib/raw-history.mjs"
import { dropSheetFromKits, resliceSheet } from "../lib/sheet-kits.mjs"

const QUOTA_PER_JOB = [3, 5]

/** Id của BẢN ĐANG DÙNG trong danh sách phiên bản — `raw/<job>.png`, không phải một
 *  file trong `.history/`. Web dùng đúng chuỗi này (`lib/result/sheet-versions.ts`). */
const CURRENT_ID = "current"

export function register(r) {
  // #32 POST runs
  r.post("/api/projects/:id/runs", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const body = await ctx.json()
    const kind = String(body.kind ?? "gen")

    const { contract } = await readContract(ws, id)
    const v = validateContract(contract)
    if (v.errors.length)
      fail("CONTRACT_INVALID", `contract has ${v.errors.length} error(s), cannot run`, { details: { errors: v.errors } })

    if (kind === "gen") {
      // Chặn TRƯỚC KHI CHẠY nếu không tạo được ảnh (đóng E1 tại gốc)
      const d = await ctx.doctor(ws)
      if (!d.imageGen.available)
        fail("IMAGEGEN_UNAVAILABLE", `image generation is not available (${d.imageGen.reason ?? "unknown"})`,
          { details: { reason: d.imageGen.reason ?? "UNKNOWN", mode: d.imageGen.mode, needsFallbackHome: d.imageGen.needsFallbackHome } })
    }

    const handle = await ctx.runs.start(id, {
      kind,
      jobs: body.jobs,
      maxJobs: body.maxJobs,
      autoSliceAfterGen: body.autoSliceAfterGen !== false,
    })
    const n = handle.run.jobs.length
    return {
      status: 202,
      json: {
        runId: handle.id,
        jobs: handle.run.jobs.map(j => ({ job: j.job, status: j.status })),
        estimate: {
          seconds: [Math.round((n / handle.run.maxJobs) * 90), Math.round((n / handle.run.maxJobs) * 150)],
          quotaUnits: [n * QUOTA_PER_JOB[0], n * QUOTA_PER_JOB[1]],
        },
      },
    }
  })

  // #33 list runs của project
  r.get("/api/projects/:id/runs", async ctx => {
    const limit = Math.min(50, Math.max(1, Number(ctx.url.searchParams.get("limit") ?? 20) || 20))
    const items = await ctx.runs.list(ctx.params.id, limit)
    return { status: 200, json: { items: items.map(sanitizeRun) } }
  })

  // #34 GET run (nguồn của fallback poll 2s)
  r.get("/api/runs/:runId", async ctx => {
    const { run } = await ctx.runs.find(ctx.params.runId)
    return { status: 200, json: sanitizeRun(run) }
  })

  // #35 stream NDJSON
  r.get("/api/runs/:runId/stream", async ctx => {
    const from = Math.max(0, Number(ctx.url.searchParams.get("from") ?? 0) || 0)
    const found = await ctx.runs.find(ctx.params.runId)
    return { status: 200, ndjson: { found, from } }
  })

  // #36 cancel
  r.post("/api/runs/:runId/cancel", async ctx => {
    const { handle, run } = await ctx.runs.find(ctx.params.runId)
    if (!handle || handle.finished) fail("RUN_FINISHED", `run ${run.id} already finished`)
    return { status: 200, json: await handle.cancel() }
  })

  // #39 lịch sử ảnh raw (3 đời)
  r.get("/api/projects/:id/raw/:job/history", async ctx => {
    const ws = ctx.registry.active
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    /* Liệt kê nằm ở `lib/raw-history.mjs` — CHUNG với chỗ CẤT (`run-handle.launch`)
       và chỗ XOÁ (#39.1). Ba nơi tự viết lại cùng một mẫu tên file là ba cơ hội để
       bản cất được mà không bao giờ hiện ra. */
    const items = await listRawHistory(ws, ctx.params.id, job)
    const cur = join(projectDir(ws, ctx.params.id), "raw", `${job}.png`)
    if (await exists(cur)) {
      const st = await stat(cur)
      items.push({ id: CURRENT_ID, at: new Date(st.mtimeMs).toISOString(), bytes: st.size, current: true })
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
    return { status: 200, json: { items } }
  })

  /* #39.1 XOÁ MỘT PHIÊN BẢN CỦA MỘT TẤM — KỂ CẢ BẢN ĐANG DÙNG.
     ╔══ VÌ SAO BẢN ĐANG DÙNG NAY XOÁ ĐƯỢC ═════════════════════════════════════╗
     ║ Bản trước từ chối thẳng bằng mã `HISTORY_CURRENT`, lý do: nó là đầu vào   ║
     ║ của bước cắt. Nhưng thứ đó chặn đúng MỘT việc người dùng thật sự cần —    ║
     ║ vứt một tấm vẽ hỏng đi. Chủ sản phẩm 09/09/2026: "VẪN KO CÓ NÚT XOÁ PHIÊN ║
     ║ BẢN À???". Nay xoá được, và xoá thì dọn HẾT dấu vết của tấm ấy: ảnh gốc,  ║
     ║ ảnh bị cổng alpha loại, và ô đã cắt trong `kits/` — để không bề mặt nào    ║
     ║ còn phát ra ô của một tấm không còn tồn tại. Còn bản cũ trong lịch sử thì ║
     ║ bản mới nhất TỰ LÊN thay chỗ (và được cắt lại), nên tấm không rơi về       ║
     ║ trạng thái "chưa vẽ" trong khi vẫn còn ảnh để dùng.                       ║
     ╚═══════════════════════════════════════════════════════════════════════════╝
     ╔══ CÁC CHỐT CHẶN GIỮ NGUYÊN, KHÔNG BỚT CÁI NÀO ═══════════════════════════╗
     ║ ① `hid` phải khớp `r-<số>` — `safeSegment` chặn `..` và dấu phân cách,    ║
     ║   `RE_RAW_HISTORY_ID` chặn phần còn lại. Đường dẫn đích được DỰNG LẠI từ  ║
     ║   `job` + `hid` đã kiểm, không bao giờ ghép chuỗi của client vào path.    ║
     ║   `current` là NGOẠI LỆ DUY NHẤT, và nó không đi vào đường dẫn nào: nó    ║
     ║   chỉ chọn nhánh, còn tên file thì dựng từ `job` đã kiểm.                 ║
     ║ ② Không xoá giữa lượt chạy: `#40` đã chặn vậy, và cùng lý do — engine có  ║
     ║   thể đang ghi vào đúng thư mục này.                                      ║
     ╚═══════════════════════════════════════════════════════════════════════════╝ */
  r.delete("/api/projects/:id/raw/:job/history/:hid", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const hid = safeSegment(ctx.params.hid, "historyId")
    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished) fail("RUN_ACTIVE", `run ${active.id} is active`, { details: { runId: active.id } })
    const pdir = projectDir(ws, id)

    if (hid === CURRENT_ID) {
      const raw = join(pdir, "raw", `${job}.png`)
      if (!(await exists(raw))) fail("NOT_FOUND", `raw image for ${job} not found`)
      await removeTree(raw)
      await dropSheetFromKits(ws, id, job)

      /* BẢN MỚI NHẤT CÒN LẠI LÊN THAY CHỖ — và ĐI CHỖ, không phải nhân đôi: chép thì
         nó vừa là bản đang dùng vừa còn nguyên trong lịch sử, tức xoá một phiên bản mà
         thanh chọn vẫn đúng bấy nhiêu mục — người dùng đọc ra là "bấm xoá không ăn". */
      const [next] = await listRawHistory(ws, id, job)
      if (!next) return { status: 200, json: { deleted: true, id: CURRENT_ID, nowCurrent: null, sliced: false } }
      const src = join(rawHistoryDir(ws, id), rawHistoryName(job, next.id))
      const bytes = await readFile(src)
      await ensureDir(join(pdir, "raw"))
      await writeFileAtomic(raw, bytes)
      await removeTree(src).catch(() => {})
      const sliced = await resliceSheet(ws, id, job)
      return { status: 200, json: { deleted: true, id: CURRENT_ID, nowCurrent: next.id, sliced: sliced.ok } }
    }

    assertMatch(RE_RAW_HISTORY_ID, hid, "BAD_REQUEST", "historyId")
    const abs = join(rawHistoryDir(ws, id), rawHistoryName(job, hid))
    if (!(await exists(abs))) fail("NOT_FOUND", `raw history ${hid} for ${job} not found`)
    await removeTree(abs)
    return { status: 200, json: { deleted: true, id: hid } }
  })

  /* #40 ĐỔI PHIÊN BẢN ẢNH GỐC — chép bản đã chọn về `raw/<job>.png` RỒI CẮT LẠI NGAY.
     ╔══ VÌ SAO CẮT LẠI NẰM TRONG CHÍNH REQUEST NÀY ════════════════════════════╗
     ║ Chủ sản phẩm 09/09/2026: chọn một phiên bản "nó chỉ swap hiển thị + copy  ║
     ║ figma thôi". Bản trước dừng ở chỗ ghi đè ảnh gốc, nên tab «Đã crop» và nút║
     ║ copy Figma — cả hai đều đọc `kits/` — vẫn phát ra ô của bản CŨ cho tới    ║
     ║ lượt cắt sau, mà không có gì báo. Một cú đổi phiên bản phải đổi HẾT các bề║
     ║ mặt cùng lúc, nếu không nó là một lời nói dối có hai màn hình làm chứng.  ║
     ║ Cắt lại là `slice.py` thuần PIL: KHÔNG tốn một đơn vị hạn mức nào.        ║
     ║ Cắt hỏng (chưa cài engine, python chết) thì ô đã cắt được GIỮ NGUYÊN, và  ║
     ║ `sliced: false` nói ra điều đó — xoá kho ô của người dùng vì một lỗi của  ║
     ║ máy là cái giá không ai đồng ý trả.                                       ║
     ╚═══════════════════════════════════════════════════════════════════════════╝ */
  r.post("/api/projects/:id/raw/:job/restore", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished) fail("RUN_ACTIVE", `run ${active.id} is active`, { details: { runId: active.id } })
    const body = await ctx.json()
    const historyId = safeSegment(body.historyId, "historyId")
    /* `RE_RAW_HISTORY_ID`, KHÔNG phải `RE_RUN_ID` — và đây là một LỖI THẬT đã sống
       trong route này: `RE_RUN_ID` là `r-[0-9]{4,8}`, còn id lịch sử là `r-<mtime ms>`
       = 13 chữ số (`raw-history.mjs`). Tức MỌI lần đổi phiên bản đều chết ở 400
       BAD_REQUEST, cho đúng những id mà `#39` vừa phát ra. */
    assertMatch(RE_RAW_HISTORY_ID, historyId, "BAD_REQUEST", "historyId")
    const pdir = projectDir(ws, id)
    const src = join(pdir, ".history", "raw", `${job}@${historyId}.png`)
    if (!(await exists(src))) fail("NOT_FOUND", `raw history ${historyId} for ${job} not found`)
    const dst = join(pdir, "raw", `${job}.png`)
    await ensureDir(join(pdir, "raw"))
    /* ĐỌC NGUỒN VÀO BỘ NHỚ TRƯỚC KHI CẤT — thứ tự này không phải ngẫu nhiên.
       `archiveRaw` cất bản đang dùng rồi TỈA lịch sử về 3 đời; nếu lịch sử đã đủ 3 thì
       bản bị tỉa có thể chính là `src` mà ta sắp chép về. Chép sau khi tỉa là `ENOENT`
       ở giữa một thao tác đã ghi đè xong một nửa. Giữ bytes trong tay thì tỉa gì cũng
       không ảnh hưởng. Ảnh một tấm cỡ MB — rẻ hơn nhiều so với một trạng thái nửa vời.
       Cất bằng đúng hàm mà lượt gen dùng: bản đang dùng vào lịch sử trước khi bị ghi
       đè, nên người dùng chọn ngược lại được ngay sau đó. */
    const bytes = await readFile(src)
    await archiveRaw(ws, id, job)
    await writeFileAtomic(dst, bytes)
    const sliced = await resliceSheet(ws, id, job)
    return {
      status: 200,
      json: { restored: true, mtime: new Date(await mtimeOf(dst)).toISOString(), sliced: sliced.ok },
    }
  })
}
