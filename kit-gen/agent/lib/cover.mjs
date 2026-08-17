/* ════════════════════════════════════════════════════════════════════════════
   cover.mjs — ẢNH BÌA của project: dựng prompt, chạy cover.sh, ghi cover/cover.png.

   BA QUYẾT ĐỊNH ĐÃ CHỐT VỚI CHỦ SẢN PHẨM, viết lại ở đây để đời sau đừng "sửa cho
   gọn" rồi làm mất lý do:

   ① JOB PHỤ, KHÔNG PHẢI MỘT PHA CỦA RUN.
      Ảnh bìa chạy NGOÀI RunStore: không chiếm suất "mỗi project một run", không đẩy
      badge ⚡, không đổi `run.status`. Cover hỏng thì lượt gen vẫn "done". Người dùng
      bỏ 15 phút và cả quota để có sprite sheet — không đời nào để một tấm ảnh trang
      trí kéo lượt đó xuống "done-with-errors".

   ② NEO VÀO BRANDING GỐC, CỐ Ý KHÔNG NEO VÀO STYLE ĐANG CHỈNH.
      Prompt lấy màu thương hiệu + mascot của variant ĐẦU TIÊN (bản gốc của dự án) và
      KHÔNG lấy `variant.style` / `inspo` — thứ người dùng còn đang thử tới thử lui bên
      trong. Đổi phong cách bên trong 5 lần thì ảnh bìa vẫn là nhận diện của game đó,
      không phải ảnh chụp màn hình của lần thử gần nhất.

   ③ CHỮ DO APP VẼ, MODEL CHỈ CHỪA CHỖ.
      Prompt nêu ĐÚNG TOẠ ĐỘ vùng tiêu đề và giải thích HẬU QUẢ ("phần mềm sẽ ghép chữ
      thật vào đúng hình chữ nhật này"), theo lối viết safe-zone của gen.sh v15
      (docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md §5.3: nói hậu quả, đừng ra lệnh suông).
      Model vẽ chữ thì sai chính tả — tiếng Việt có dấu lại càng sai; mà đổi tên dự án
      thì phải gen lại cả ảnh. Overlay CSS: đổi tên là chữ đổi theo, 0 quota.
      Toạ độ nằm ở TITLE_ZONE dưới đây và được webapp dùng lại nguyên si
      (webapp/src/features/home/lib/cover-title.ts) — suite-cover có ca đối chiếu hai
      file để chúng không lệch nhau trong im lặng.
   ════════════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { exists, mtimeOf, readJsonFile, writeFileAtomic, writeJsonAtomic } from "./fsx.mjs"
import { redactLine } from "./redact.mjs"
import { projectDir } from "./projects-dir.mjs"
import { readProject, saveProject } from "./projects.mjs"
import { readContract } from "./contract.mjs"
import { resolveEngine } from "./engine.mjs"
import { IS_WIN, bashCommand, pythonEnv, winSpawnOpts } from "./platform.mjs"

/** Thư mục + đường dẫn tương đối của ảnh bìa tự sinh. `files.mjs` mở đúng thư mục này. */
export const COVER_DIR = "cover"
export const COVER_REL = "cover/cover.png"
export const COVER_META_REL = "cover/cover.json"
/** Khổ ảnh bìa cuối cùng (16:9). */
export const COVER_SIZE = [1600, 900]
/** Khổ model sinh ra (codex chỉ nhận 3:2 / 2:3 / 1:1) — cover.sh cắt dải giữa về 16:9. */
export const GEN_CANVAS = [1536, 1024]

/** Config lưu nhãn `~/.codex-img`; tiến trình con cần đường dẫn thật. */
export function expandHomePath(value) {
  const raw = String(value ?? "")
  if (raw === "~") return homedir()
  // join thay vì nối chuỗi: trên Windows homedir() dùng "\" — nối "/" tạo path trộn separator
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2))
  return raw
}

/**
 * VÙNG TIÊU ĐỀ — theo TỈ LỆ của ảnh bìa 16:9 cuối cùng (không phải theo pixel canvas gen).
 * Dải trái, rộng 56%, cao 40%, canh giữa dọc. Webapp overlay chữ vào đúng đây.
 */
export const TITLE_ZONE = { x: 0.06, y: 0.3, w: 0.56, h: 0.4 }

/** Vùng tiêu đề quy về PIXEL trên canvas model sẽ vẽ (đã tính phần bị cắt trên/dưới). */
export function titleZonePixels() {
  const [gw, gh] = GEN_CANVAS
  const bandH = Math.round((gw * COVER_SIZE[1]) / COVER_SIZE[0])   // 1536 → 864
  const top = Math.round((gh - bandH) / 2)                          // 80
  return {
    x0: Math.round(TITLE_ZONE.x * gw),
    x1: Math.round((TITLE_ZONE.x + TITLE_ZONE.w) * gw),
    y0: top + Math.round(TITLE_ZONE.y * bandH),
    y1: top + Math.round((TITLE_ZONE.y + TITLE_ZONE.h) * bandH),
    cutTop: top,
    cutBottom: gh - bandH - top,
  }
}

/* ═════════════════ 1. Chất liệu: branding GỐC của dự án ═════════════════ */

/** Variant đầu tiên = bản gốc của dự án (§ quyết định ②). */
function baseVariant(contract) {
  const v = contract?.variants
  return Array.isArray(v) && v.length ? v[0] : null
}

/**
 * Gom chất liệu nhận diện: màu thương hiệu + mô tả mascot + ảnh đính kèm.
 * @param hasFile async (relPath) => boolean — kiểm file có thật trong project.
 *        Tiêm vào để hàm này test được mà không cần ổ đĩa.
 */
export async function collectBranding(contract, hasFile) {
  const v = baseVariant(contract)
  const brand = v?.brand ?? {}
  const characters = Array.isArray(v?.characters) ? v.characters : []
  const attachments = []
  const add = async p => {
    if (typeof p !== "string" || !p || p.includes("..") || p.startsWith("/")) return
    if (attachments.includes(p) || attachments.length >= 3) return
    if (await hasFile(p)) attachments.push(p)
  }

  /* Ưu tiên ẢNH THẬT của nhân vật — đúng thứ tự "ai là nguồn nhận diện":
     ① ảnh tham chiếu người dùng tải lên cho nhân vật (chuẩn nhất, gen.sh cũng coi đây
        là nguồn DUY NHẤT của danh tính nhân vật);
     ② ảnh ref gắn vào tấm dáng;
     ③ TẤM DÁNG ĐÃ SINH của bản gốc — mascot đã được vẽ đúng nhận diện game rồi;
     ④ ảnh thương hiệu (brand.mode = "image"). */
  for (const c of characters) await add(c?.ref)
  for (const sh of contract?.sheets ?? []) {
    if (String(sh?.id ?? "").startsWith("pose-")) await add(sh?.ref)
  }
  if (v?.id) {
    for (const sh of contract?.sheets ?? []) {
      if (String(sh?.id ?? "").startsWith("pose-")) await add(`raw/${v.id}-${sh.id}.png`)
    }
  }
  if (brand?.mode === "image") for (const p of brand.refs ?? []) await add(p)

  const poseSheet = (contract?.sheets ?? []).find(sh => String(sh?.id ?? "").startsWith("pose-"))
  const mascotSpec = (poseSheet?.components ?? []).map(c => String(c?.spec ?? "")).find(s => s.length > 20) ?? ""

  return {
    variantId: v?.id ?? null,
    primary: typeof brand.primary === "string" ? brand.primary : null,
    secondary: typeof brand.secondary === "string" ? brand.secondary : null,
    gradient: typeof brand.gradient === "string" ? brand.gradient : null,
    mascotName: characters[0]?.vi ? String(characters[0].vi) : null,
    mascotSpec: mascotSpec.slice(0, 600),
    attachments,
  }
}

/* ═════════════════ 2. Prompt ═════════════════ */

/**
 * Dựng prompt ảnh bìa. Trả `{ prompt, attachments, branding }`.
 *
 * Lối viết bám đúng triết lý crop-safe v15 (handoff §5.3): mỗi ràng buộc hình học đều
 * kèm HẬU QUẢ nếu làm sai ("phần mềm sẽ crop / sẽ ghép chữ vào đây"), vì model bám ý
 * nghĩa tốt hơn bám mệnh lệnh. Khác v15 ở chỗ cover KHÔNG có grid, KHÔNG có chroma-key
 * và KHÔNG tách nền: nền full-bleed, đục hoàn toàn.
 */
export async function buildCoverPrompt({ project, contract, hasFile }) {
  const b = await collectBranding(contract, hasFile)
  const z = titleZonePixels()
  const [gw, gh] = GEN_CANVAS
  const L = []

  L.push(`Canvas orientation: LANDSCAPE ${gw}x${gh}.`)
  L.push("")
  L.push("A single COVER ARTWORK for one game-art project — the picture that sits on top of")
  L.push("a project card in a file browser, the way a cover image sits above a design file")
  L.push("name. One calm, poster-like scene.")
  L.push("This is NOT a game screen, NOT a UI mockup, NOT a sprite sheet: no grid, no cells,")
  L.push("no buttons, no panels, no icon rows, no frame, no border, no margin, no vignette band.")
  L.push("The artwork is FULL-BLEED — it fills the whole canvas and bleeds off all four edges.")
  L.push("The background is FULLY OPAQUE: no chroma-key colour, no checkerboard, no transparency")
  L.push("pattern; nothing here will be cut out or keyed, the picture is used exactly as it is.")
  L.push("")

  /* ── Nhận diện: chỉ brand, cố ý bỏ style/inspo ── */
  L.push("WHOSE PROJECT THIS IS — the cover shows the game's own brand identity, NOT whatever")
  L.push("art style is being experimented with inside the project. Use only the identity")
  L.push("material below; do not invent a different palette or a different character.")
  if (b.primary || b.secondary) {
    const parts = [b.primary && `primary ${b.primary}`, b.secondary && `secondary ${b.secondary}`,
      b.gradient && `gradient ${b.gradient}`].filter(Boolean)
    L.push(`Brand palette: ${parts.join(", ")}.`)
    L.push("These brand colours dominate the whole picture: the background wash, the light, the")
    L.push("props and the rim light on the subject all come from them.")
  } else {
    L.push("No brand colours were given: use one calm, friendly, low-saturation colour scheme")
    L.push("built from a single hue plus warm neutrals — no rainbow, no clashing accents.")
  }
  L.push("Neutrals: soft warm off-white and light neutral tones carry the quiet areas, so the")
  L.push("brand colours stay readable and the cover does not look noisy.")
  L.push("")

  /* ── Chủ thể ── */
  if (b.attachments.length) {
    L.push("SUBJECT — the attached image(s) are this project's OWN mascot / brand reference.")
    L.push("The cover's subject is EXACTLY that character: same species, face, colours, costume,")
    L.push("materials and proportions, re-drawn cleanly as one single full-body figure.")
    L.push("If a reference sheet shows the character several times, in several poses, or on a")
    L.push("flat key-coloured background, take ONLY the character's identity from it — draw ONE")
    L.push("character, in one new pose, on this cover's own background. Never copy the sheet's")
    L.push("layout, its cells or its background colour.")
  } else if (b.mascotName || b.mascotSpec) {
    L.push("SUBJECT — the project's mascot, described by the project itself:")
    if (b.mascotName) L.push(`Character: ${b.mascotName}.`)
    if (b.mascotSpec) L.push(b.mascotSpec)
    L.push("Draw ONE single full-body figure of this character.")
  } else {
    L.push("SUBJECT — no mascot exists for this project yet. Instead build a simple brand still")
    L.push("life: a few smooth, rounded game props (a soft badge, a coin, a gift, a ribbon) in")
    L.push("the brand colours, grouped as one calm cluster. No characters, no faces.")
  }
  L.push("")

  /* ── Bố cục: chủ thể bên phải, chừa dải trái ── */
  L.push("COMPOSITION — the subject lives on the RIGHT side of the canvas:")
  L.push(`- place the whole subject inside the right part of the image, roughly from x=${Math.round(gw * 0.62)}`)
  L.push(`  to x=${gw}, standing or floating, seen from the front or three-quarter view;`)
  L.push("- the subject is the only focal point; keep the rest of the picture as a soft,")
  L.push("  simple background: a gentle gradient wash, a big soft shape or two, a little")
  L.push("  bokeh or sparkle — nothing detailed, nothing that competes for attention;")
  L.push("- soft, even lighting; a gentle drop shadow under the subject; no harsh spotlights.")
  L.push("")

  /* ── Vùng tiêu đề: toạ độ + hậu quả ── */
  L.push("THE TITLE PLATE IS RESERVED — THIS IS THE ONE RULE THAT DECIDES IF THE COVER IS USABLE.")
  L.push(`On this ${gw}x${gh} canvas, the rectangle from x=${z.x0} to x=${z.x1} and from y=${z.y0} to y=${z.y1}`)
  L.push("(the left band, about 56% of the width, vertically centred) is a production TITLE PLATE.")
  L.push("After generation, software composites the project's REAL title text into exactly those")
  L.push("four coordinates. Therefore:")
  L.push("- keep that rectangle visually CALM and EMPTY: a smooth surface, a soft gradient wash")
  L.push("  or a plain brand-coloured area, and nothing else;")
  L.push("- no part of the subject, no props, no ornaments, no sparkles, no busy texture and no")
  L.push("  high-contrast edges may fall inside it;")
  L.push("- keep the tone inside it EVEN, so light text stays readable across the whole plate;")
  L.push("- decoration may come close to the plate and may touch its outer edge, but must not")
  L.push("  cross into it.")
  L.push("A busy or cluttered title plate makes the composited title unreadable, and the cover")
  L.push("will be thrown away and regenerated.")
  L.push("")

  /* ── Không chữ ── */
  L.push("ABSOLUTELY NO TEXT: no letters, no digits, no words, no wordmark, no logo type, no")
  L.push("watermark, no signature, no caption, in any language, anywhere in the image — not on")
  L.push("the title plate, not on the subject, not on any prop.")
  L.push("The real title is composited by software afterwards. Any text you draw would be")
  L.push("misspelled, would be in the wrong language, and would collide with the real title.")
  L.push("")

  /* ── Hậu quả của việc cắt 16:9 ── */
  L.push("CROP CONSEQUENCE — the finished cover is the CENTRAL 16:9 BAND of this canvas:")
  L.push(`the top ${z.cutTop}px and the bottom ${z.cutBottom}px are cut away and never seen.`)
  L.push("Keep everything essential — the subject's head and feet, the whole title plate —")
  L.push("inside that central band; let only background bleed into the top and bottom strips.")
  L.push("")

  L.push("Clean, modern, friendly game key-art quality: smooth shapes, soft depth, gentle")
  L.push(`lighting, landscape ${gw}x${gh}.`)

  const prompt = L.join("\n")
  return { prompt, attachments: b.attachments, branding: b }
}

/* ═════════════════ 3. Chạy job ═════════════════ */

const STATUS_NONE = "none"

/** Hạn chờ 'close' sau khi đã có 'exit' — CHỈ dùng trên win32 (xem chỗ spawn cover.sh). */
const WIN_PIPE_GRACE_MS = 5000

/** Đọc meta ảnh bìa trên đĩa (không có = chưa từng chạy). */
export async function readCoverMeta(ws, id) {
  try { return await readJsonFile(join(projectDir(ws, id), COVER_META_REL)) }
  catch { return null }
}

/**
 * CHỐT CHẶN KIỂU C-01 (xem run-handle.persist): job vẽ bìa sống LÂU HƠN lượt chạy, nên
 * người dùng hoàn toàn có thể xoá project trong lúc nó đang chạy. Mọi hàm ghi ở đây
 * phải hỏi lại "project còn ở chỗ cũ không?" — vì `writeJsonAtomic`/`writeFileAtomic`
 * đều gọi `ensureDir`, chúng sẽ DỰNG LẠI thư mục vừa chuyển sang thùng rác (thư mục ma)
 * và làm nút Hoàn tác trả 409.
 *
 * Hỏi trước là CHƯA ĐỦ: DELETE có thể rơi vào đúng khe giữa lúc hỏi và lúc ghi. Nên mọi
 * lời ghi ở đây còn đi kèm `mkdirs: false` (không dựng thư mục cha) + `mkdirIn()` không
 * đệ quy: thư mục project đã đi rồi thì lời ghi CHẾT bằng ENOENT chứ không hồi sinh nó.
 */
async function stillThere(ws, id) {
  return exists(join(projectDir(ws, id), "project.json"))
}

/** Tạo MỘT thư mục con của project, KHÔNG đệ quy: project đã sang thùng rác ⇒ ENOENT. */
async function mkdirIn(pdir, name) {
  try { await mkdir(join(pdir, name)) }
  catch (e) { if (e?.code !== "EEXIST") throw e }
}

async function writeCoverMeta(ws, id, meta) {
  if (!(await stillThere(ws, id))) return null
  try { await writeJsonAtomic(join(projectDir(ws, id), COVER_META_REL), meta, { mkdirs: false }) }
  catch (e) { if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return null; throw e }
  return meta
}

/**
 * ẢNH BÌA CỦA AI? — chỉ ghi đè `project.cover` khi ô đó đang TRỐNG hoặc đang trỏ vào
 * chính ảnh bìa tự sinh. Người dùng đã tự chọn một file trong kit làm ảnh bìa (S2b
 * "Đổi ảnh bìa…") thì lựa chọn của họ là bất khả xâm phạm — job nền không được cướp.
 */
function coverSlotFree(project) {
  const c = project?.cover
  return c === null || c === undefined || c === "" || c === COVER_REL
}

/** Job đang chạy, theo (workspace, project). Agent là một tiến trình ⇒ Map module-level. */
const running = new Map()
const keyOf = (ws, id) => `${ws.root}|${id}`

export function coverRunning(ws, id) { return running.get(keyOf(ws, id)) ?? null }

/**
 * Trạng thái ảnh bìa cho endpoint #43.
 * @returns {{status:"none"|"running"|"ok"|"failed", path:string|null, updatedAt:string|null,
 *            titleZone:object, error:string|null}}
 */
export async function coverStatus(ws, id) {
  const job = coverRunning(ws, id)
  const meta = await readCoverMeta(ws, id)
  const has = await exists(join(projectDir(ws, id), COVER_REL))
  const status = job ? "running" : has ? "ok" : meta?.status === "failed" ? "failed" : STATUS_NONE
  return {
    status,
    path: has ? COVER_REL : null,
    updatedAt: meta?.updatedAt ?? null,
    startedAt: job?.startedAt ?? meta?.startedAt ?? null,
    titleZone: { ...TITLE_ZONE },
    size: meta?.size ?? null,
    error: status === "failed" ? (meta?.error ?? "UNKNOWN") : null,
  }
}

/**
 * Sinh ảnh bìa. KHÔNG BAO GIỜ ném ra ngoài vì lỗi của chính nó (chỉ ném khi caller gọi
 * sai: project không tồn tại / đang chạy dở) — người gọi tự động là `run-handle.finish()`.
 *
 * @param opts.imgHome CODEX_HOME của profile ảnh (giống lượt gen).
 * @param opts.wait    đợi xong rồi mới trả (test dùng); mặc định trả ngay khi đã spawn.
 * @returns {{status:"running"|"skipped", reason?:string, startedAt:string|null}}
 */
export async function startCover(ws, id, { imgHome = null, wait = false, force = false } = {}) {
  const project = await readProject(ws, id)
  if (project.broken) return { status: "skipped", reason: "PROJECT_BROKEN", startedAt: null }
  const key = keyOf(ws, id)
  if (running.has(key)) return { status: "running", reason: "ALREADY_RUNNING", startedAt: running.get(key).startedAt }

  const engineDir = await resolveEngine(ws)
  const script = engineDir ? join(engineDir, "cover.sh") : null
  if (!script || !(await exists(script)))
    return { status: "skipped", reason: "COVER_ENGINE_MISSING", startedAt: null }

  const pdir = projectDir(ws, id)
  const { contract } = await readContract(ws, id).catch(() => ({ contract: null }))
  const hasFile = async rel => exists(join(pdir, rel))
  const { prompt, attachments, branding } = await buildCoverPrompt({ project, contract, hasFile })

  if (!(await stillThere(ws, id))) return { status: "skipped", reason: "PROJECT_GONE", startedAt: null }
  try {
    await mkdirIn(pdir, COVER_DIR)
    await mkdirIn(pdir, "prompts")
    await mkdirIn(pdir, "logs")
    await writeFileAtomic(join(pdir, "prompts", "cover.txt"), Buffer.from(prompt, "utf8"), { mkdirs: false })
    await writeFileAtomic(join(pdir, "prompts", "cover.att"),
      Buffer.from(attachments.length ? attachments.join("\n") + "\n" : "", "utf8"), { mkdirs: false })
  } catch (e) {
    /* Project vừa bị xoá ngay giữa lúc dựng prompt — bỏ việc trong im lặng, KHÔNG hồi
       sinh thư mục. Mọi lỗi khác (hết đĩa, EACCES…) vẫn ném để không giấu sự cố thật. */
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return { status: "skipped", reason: "PROJECT_GONE", startedAt: null }
    throw e
  }

  const startedAt = new Date().toISOString()
  const t0 = Math.floor(Date.now() / 1000)
  await writeCoverMeta(ws, id, {
    status: "running", startedAt, updatedAt: null, finishedAt: null,
    size: null, titleZone: { ...TITLE_ZONE },
    source: { variantId: branding.variantId, primary: branding.primary, secondary: branding.secondary, attachments },
    prompt: "prompts/cover.txt", error: null, force: force === true,
  })

  /* Ghi vào sổ TRƯỚC khi chạy: `coverRunning()` phải thấy job ngay từ nhịp đầu, nếu không
     hai lần bấm "Tạo lại ảnh bìa" liên tiếp sẽ spawn hai con codex cho cùng một project. */
  const entry = { startedAt, done: null }
  running.set(key, entry)
  entry.done = (async () => {
    try { return await drawOnce() } finally { running.delete(key) }
  })().catch(() => false)

  async function drawOnce() {
    if (!(await stillThere(ws, id))) return false
    const env = { ...process.env, PATH: process.env.PATH }
    if (imgHome) env.IMG_HOME = expandHomePath(imgHome)
    const lines = []
    // darwin/linux: bashCommand trả đúng {cmd:"bash", args:[script, pdir], env:{}} như mã cũ.
    // win32: bash.exe của Git for Windows, path đổi sang /c/… (cover.sh `cd "$1"`), PATH có coreutils.
    const b = bashCommand([script, pdir])
    await new Promise(resolve => {
      let child
      try {
        // pythonEnv(): cover.sh cũng gọi python3 (crop/ghép ảnh bìa) — xem platform.mjs.
        child = spawn(b.cmd, b.args, { cwd: pdir, stdio: ["ignore", "pipe", "pipe"], env: { ...env, ...b.env, ...pythonEnv() }, ...winSpawnOpts() })
      } catch { return resolve() }
      const onData = buf => { lines.push(redactLine(String(buf))) }
      child.stdout.on("data", onData)
      child.stderr.on("data", onData)
      child.on("error", () => resolve())
      child.on("close", () => resolve())
      /* WINDOWS: 'close' đợi ống dẫn stdout/stderr đóng, mà trên Windows tiến trình CHÁU
         (codex do cover.sh gọi) thừa kế đúng hai ống đó — bash chết rồi ống vẫn mở thì
         'close' KHÔNG BAO GIỜ tới và job vẽ bìa treo vĩnh viễn ở "running" (ở đây còn
         không có trần thời gian nào như slice). Chỉ vá cho win32: 'exit' đã tới mà quá
         hạn vẫn chưa 'close' thì tự đóng ống rồi đi tiếp — phán vẫn THEO SẢN PHẨM
         (file mới hơn t0) nên không đổi kết quả, chỉ đổi việc có thoát ra được hay không.
         darwin/linux: khối này không tồn tại. */
      if (IS_WIN) {
        child.on("exit", () => {
          const t = setTimeout(() => {
            try { child.stdout?.destroy() } catch { /* đã đóng */ }
            try { child.stderr?.destroy() } catch { /* đã đóng */ }
            resolve()
          }, WIN_PIPE_GRACE_MS)
          t.unref?.()
        })
      }
    })

    /* PHÁN THEO SẢN PHẨM, y hệt lượt gen: file mới hơn t0 = xong. Mã thoát của codex
       không đáng tin (nó sập vì lỗi API transient SAU khi đã lưu ảnh). */
    const out = join(pdir, COVER_REL)
    const fresh = Math.floor((await mtimeOf(out)) / 1000) >= t0
    const finishedAt = new Date().toISOString()
    if (fresh) {
      await writeCoverMeta(ws, id, {
        status: "ok", startedAt, finishedAt, updatedAt: finishedAt,
        size: COVER_SIZE, titleZone: { ...TITLE_ZONE },
        source: { variantId: branding.variantId, primary: branding.primary, secondary: branding.secondary, attachments },
        prompt: "prompts/cover.txt", error: null,
      })
      const p = await readProject(ws, id).catch(() => null)
      if (p && !p.broken && coverSlotFree(p)) {
        p.cover = COVER_REL
        await saveProject(ws, id, p).catch(() => {})
      }
    } else {
      await writeCoverMeta(ws, id, {
        status: "failed", startedAt, finishedAt, updatedAt: null,
        size: null, titleZone: { ...TITLE_ZONE },
        source: { variantId: branding.variantId, primary: branding.primary, secondary: branding.secondary, attachments },
        prompt: "prompts/cover.txt",
        error: lines.join("").includes("chưa đăng nhập") ? "NOT_LOGGED_IN" : "NO_ARTIFACT",
      })
    }
    return fresh
  }

  if (wait) await entry.done
  return { status: "running", startedAt }
}

/**
 * MÓC TỰ ĐỘNG sau lượt gen: vẽ bìa cho project CHƯA CÓ BÌA.
 *
 * "Chưa có bìa" là điều kiện cố ý hẹp — mỗi lượt gen lại vẽ bìa mới thì mỗi lần sửa
 * một nút bấm cũng đốt thêm một lượt quota image-gen và ảnh bìa nhảy múa liên tục.
 * Người dùng muốn ảnh khác thì có nút "Tạo lại ảnh bìa" (#44) — đó là lựa chọn của họ,
 * không phải tác dụng phụ của việc sửa kit.
 *
 * KHÔNG BAO GIỜ NÉM: người gọi là `run-handle.finish()`, ở đó một lỗi lọt ra là
 * unhandled rejection và giết cả tiến trình agent.
 */
export async function maybeAutoCover(ws, id, { imgHome = null, wait = false } = {}) {
  try {
    if (await exists(join(projectDir(ws, id), COVER_REL))) return { status: "skipped", reason: "ALREADY_HAS_COVER" }
    const project = await readProject(ws, id)
    if (project.broken) return { status: "skipped", reason: "PROJECT_BROKEN" }
    if (!coverSlotFree(project)) return { status: "skipped", reason: "USER_PICKED_COVER" }
    return await startCover(ws, id, { imgHome, wait })
  } catch (e) {
    return { status: "skipped", reason: "ERROR", message: String(e?.message ?? e) }
  }
}

/** Dùng bởi DELETE project: quên job đang chạy để không ghi lại vào thư mục đã sang thùng rác. */
export function forgetCover(ws, id) { running.delete(keyOf(ws, id)) }

/**
 * DỌN META MỒ CÔI LÚC BOOT — `cover.json` kẹt `"running"` mà không còn job nào chạy.
 *
 * Sổ `running` ở trên là Map trong BỘ NHỚ của một tiến trình. Agent bị thay giữa lúc vẽ
 * (update, reboot, kill) thì `cover.json` nằm lại trên đĩa với `status:"running"` và
 * KHÔNG BAO GIỜ có ai ghi tiếp — `coverStatus` sẽ trả "none" mãi mãi (vì chỉ `failed`
 * mới được đọc từ meta), người dùng không thấy lỗi cũng không thấy ảnh.
 *
 * Chỉ gọi lúc KHỞI ĐỘNG, khi `running` chắc chắn rỗng: gọi lúc đang chạy sẽ giết meta
 * của job thật đang vẽ. Vẫn kiểm `coverRunning()` cho từng project để lời hứa đó được
 * ghi thành mã, không chỉ ghi thành lời.
 *
 * Đánh `failed` là ĐỦ và KHÔNG ghi đè ảnh đang có: `coverStatus` ưu tiên "có file ảnh"
 * hơn meta, nên project đã vẽ xong từ lượt trước vẫn hiện "ok" như cũ.
 *
 * @returns {Promise<string[]>} id các project vừa được dọn.
 */
export async function sweepOrphanCovers(ws) {
  const { readdir } = await import("node:fs/promises")
  const ents = await readdir(ws.projectsDir, { withFileTypes: true }).catch(() => [])
  const swept = []
  for (const e of ents) {
    if (!e.isDirectory()) continue
    const id = e.name
    if (coverRunning(ws, id)) continue
    const meta = await readCoverMeta(ws, id)
    if (meta?.status !== "running") continue
    await writeCoverMeta(ws, id, {
      ...meta,
      status: "failed",
      finishedAt: new Date().toISOString(),
      updatedAt: null,
      error: "INTERRUPTED",
    }).catch(() => null)
    swept.push(id)
  }
  return swept
}

export { coverSlotFree }
