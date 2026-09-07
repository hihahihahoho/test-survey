/* routes/files.mjs — §6.2 F: #41 đọc asset trong project, #42 danh mục kit.
   THU HẸP so với v1: v1 phục vụ CẢ REPO qua static (lộ .git/config — đóng G2).
   Ở đây: chỉ trong `projects/<id>/`, chỉ file, chống traversal + symlink bằng safeJoin. */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, readJsonFile, walkFiles, stat, readHeadFile } from "../lib/fsx.mjs"
import { relPosix, safeJoin } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { normalizeWidth, thumbnail } from "../lib/thumbs.mjs"
import { imageSize } from "../lib/multipart.mjs"

/** Chỉ các thư mục dữ liệu được đọc; không bao giờ .history, không bao giờ file lạ ngoài whitelist.
 *  `cover` = ảnh bìa tự sinh (cover/cover.png + cover.json). Nhật ký thô của lượt vẽ bìa CỐ Ý
 *  nằm ở `logs/` — thư mục KHÔNG đọc được từ web — vì log codex có đường dẫn tuyệt đối của máy. */
/* Thư mục con được phép đọc qua API file.
   "skeleton" GIỮ LẠI Ở CHẾ ĐỘ CHỈ-ĐỌC. Engine không còn ghi vào đó (khung xương bỏ
   27/08/2026), nhưng dự án tạo trước ngày đó vẫn có ảnh trong thư mục này, và
   `manifest`/`run.json` đời cũ còn trỏ vào chúng. Bỏ khỏi tập này là biến mọi đường
   dẫn cũ thành 403 — một lỗi khó hiểu cho một file vẫn nằm sờ sờ trên đĩa. */
const READABLE_TOP = new Set(["raw", "kits", "refs", "skeleton", "prompts", "export", "runs", "cover"])
const READABLE_FILES = new Set(["project.json", "contract.json", "styles.json"])

/** Đủ cho header của mọi định dạng ta đọc kích thước (PNG/WebP/JPEG) — xem readHeadFile. */
const IMAGE_HEADER_BYTES = 64 * 1024

/** ẢNH CỦA MỘT LƯỢT CHẠY LÀ BẤT BIẾN.
 *  `runs/<runId>/artifacts/<job>.png` là SNAPSHOT: agent chép nó một lần rồi không bao
 *  giờ ghi đè — tạo lại một tấm sinh ra `runId` MỚI, tức là một URL MỚI. Vì vậy trình
 *  duyệt được phép giữ mãi, và đó là thứ chặn "lưới nhấp nháy": mỗi lần React Query mời
 *  lại danh sách, ảnh cũ hiện lại NGAY từ cache thay vì đi một vòng mạng nữa.
 *  `private` vì agent chạy trên máy người dùng — không proxy chung nào được giữ hộ.
 *  CỐ Ý KHÔNG áp cho `raw/`, `kits/`, `cover/`: những đường đó TRỎ VÀO FILE SỐNG, lượt
 *  gen/cắt sau ghi đè ngay tại chỗ ⇒ giữ `no-cache` mặc định của sendFile. */
const IMMUTABLE_CACHE = "private, immutable, max-age=31536000"
const isRunArtifact = rel => /^runs\/[^/]+\/artifacts\//.test(rel)

export function register(r) {
  // #41 GET /api/projects/:id/files/*  (?w=256 bắt buộc cho lưới — đóng H4)
  r.get("/api/projects/:id/files/*", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const rel = String(ctx.params.rest ?? "")
    if (!rel) fail("BAD_REQUEST", "file path is required")
    const top = rel.split("/")[0]
    if (!READABLE_TOP.has(top) && !READABLE_FILES.has(rel))
      fail("PATH_ESCAPE", `only ${[...READABLE_TOP].join(", ")} and ${[...READABLE_FILES].join(", ")} are readable`)
    const abs = safeJoin(projectDir(ws, id), rel, { allowRoot: false })
    if (!(await exists(abs))) fail("NOT_FOUND", `file ${rel} not found`)
    const st = await stat(abs)
    if (!st.isFile()) fail("NOT_FOUND", `${rel} is not a file`)

    /* KHÔNG có `?w=` ⇒ caller xin ẢNH GỐC, đừng đưa gì cho thumbs.mjs quyết.
       Hai tầng cùng khoá một điều (`searchParams.has` ở đây, `w == null` ở normalizeWidth)
       vì cái giá của việc hụt là câm lặng: ảnh vẫn 200, vẫn hiện, chỉ là bé 128px — không
       ai thấy cho tới lúc dán ra Figma. */
    const w = ctx.url.searchParams.has("w")
      ? normalizeWidth(ctx.url.searchParams.get("w"))
      : null
    // Bất biến ⇒ cho trình duyệt giữ luôn; file sống ⇒ để `sendFile` dùng no-cache mặc định.
    // Bản thu nhỏ thừa hưởng tính bất biến của ảnh gốc (cùng nguồn, cùng bề rộng ⇒ cùng bytes).
    const cache = isRunArtifact(rel) ? { "Cache-Control": IMMUTABLE_CACHE } : {}
    if (w) {
      const t = await thumbnail(ws, abs, w)
      return { status: 200, file: t.path, headers: { ...cache, ...(t.resized ? {} : { "X-KitGen-Thumb": "unavailable" }) } }
    }
    return { status: 200, file: abs, headers: cache }
  })

  // #42 GET kit — danh mục file đã cắt (từ kits/manifest.json của slice.py)
  r.get("/api/projects/:id/kit", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const dir = projectDir(ws, id)
    const mpath = join(dir, "kits", "manifest.json")
    if (!(await exists(mpath))) fail("KIT_NOT_CUT", "kits/manifest.json not found — nothing has been cut yet")
    const manifest = await readJsonFile(mpath)
    const variant = ctx.url.searchParams.get("variant")
      ?? Object.keys(manifest.styles ?? {})[0]
      ?? null
    if (!variant) fail("KIT_NOT_CUT", "manifest has no variant entry")
    const entry = (manifest.styles ?? {})[variant]
    if (!entry) fail("KIT_NOT_CUT", `variant ${variant} has not been cut`)

    const vdir = join(dir, "kits", variant)
    const files = []
    for (const abs of await walkFiles(vdir)) {
      if (!abs.endsWith(".png")) continue
      /* `relPosix`, KHÔNG phải `slice`: trên Windows đoạn tương đối là `tight\01-btn.png`,
         và cả ba thứ dùng nó ngay dưới đây đều nói tiếng POSIX — khoá đối chiếu manifest
         (`lastIndexOf("/")`), chuỗi `path` trả cho web, và tiền tố `tight/`. Xem §8.8. */
      const name = relPosix(vdir, abs)
      if (name === "atlas.png") continue
      const st = await stat(abs)
      let size = { w: null, h: null }
      /* CHỈ 64KB ĐẦU, không nguyên file: `imageSize` chỉ đọc header (PNG là byte 16..24).
         Bản cũ nạp cả tấm PNG vào RAM cho từng file trong danh mục — với một project
         thật (hàng trăm ô đã cắt) đó là hàng trăm MB đọc-rồi-vứt MỖI lần web hỏi kit,
         và web hỏi lại kit sau MỖI `sheet.ready`. */
      try { size = imageSize(await readHeadFile(abs, IMAGE_HEADER_BYTES)) } catch { /* ignore */ }
      /* `slice.py:963` ghi `asset.file` KÈM đuôi (`"01-btn-pill-red.png"`), còn bản cũ
         ở đây so khớp với tên ĐÃ CẮT đuôi ⇒ không bao giờ khớp ⇒ mọi file trả về
         `sheet: null`, và web không xếp được ô đã cắt về đúng nhóm/sheet.
         Cắt đuôi ở CẢ HAI VẾ. `tight/<file>.png` là bản ôm sát của cùng ô, nên nó dùng
         chung meta với bản canvas — so khớp theo tên cơ sở, không theo đường dẫn. */
      const bare = name.replace(/\.png$/, "")
      const stem = bare.slice(bare.lastIndexOf("/") + 1)
      const meta = (entry.assets ?? []).find(a =>
        String(a.file ?? a.name ?? "").replace(/\.png$/, "") === stem || a.path === name)
      files.push({
        file: bare, path: `kits/${variant}/${name}`,
        w: size.w, h: size.h, bytes: st.size,
        sheet: meta?.sheet ?? null,
        /* ⚠️ `meta.cell` của `slice.py` là KÍCH THƯỚC ô `[w, h]`, KHÔNG phải chỉ số ô.
           Bản cũ viết `meta?.cell ?? meta?.cellIndex` nên khi meta đối chiếu được (sau
           bản vá ở trên) `cellIndex` sẽ là một MẢNG — sai kiểu, và schema web
           (`z.number()`) sẽ ném, giết luôn cả danh mục kit. Chỉ nhận số. */
        cellIndex: typeof meta?.cellIndex === "number" ? meta.cellIndex : null,
        /* HÌNH HỌC SAFE ZONE đi kèm file, không nằm lại trong manifest.
           `figma-export/copy-sprite-images.mjs:41-48` dựng frame Figma bằng ĐÚNG bốn số
           này: frame = `safe`, ảnh đặt lệch `content_at - safe` để decoration tràn ra
           ngoài frame mà vẫn hiện (Clip content = off). Không trả ra đây thì webapp
           không có cách nào copy sang Figma đúng chuẩn — nó chỉ còn bitmap phẳng. */
        safe: meta?.safe ?? null,
        /* Đo-ký-sổ sau slice: safe là core thật; contractSafe là rect safe zone của contract
           để người dùng đối chiếu, sizeDeviation chỉ gắn cờ QA. */
        contractSafe: meta?.contractSafe ?? null,
        /* CỠ ĐẦU RA — cỡ người dùng chọn, thứ thành phẩm phải có khi rời khỏi app.
           Khác `contractSafe`: từ 07/09/2026 ô luôn được VẼ to hết cỡ lề cho phép
           (hộp max-fit) để tối đa độ phân giải, nên hộp trong prompt KHÔNG còn là
           cỡ đích. Không trả nó ra đây thì webapp không có gì để co lõi về, và
           `sheet-files.ts` lặng lẽ rơi về `contractSafe` — tức dán ra Figma đúng cỡ
           máy vẽ chứ không đúng cỡ người dùng chọn. */
        outSize: meta?.outSize ?? null,
        /* HỆ SỐ PHÓNG mà prompt đã nói với máy vẽ (`out` × k = hộp vẽ). Không tham gia
           phép co ở web — `outSize` mới là đích — nhưng nó là con số để ĐỐI CHIẾU khi
           một ô ra sai cỡ: lệch nằm ở lời dặn hay ở nét vẽ. Kit cắt bằng bản cũ ⇒ null. */
        drawScale: typeof meta?.drawScale === "number" ? meta.drawScale : null,
        sizeDeviation: meta?.sizeDeviation ?? null,
        contentAt: meta?.content_at ?? null,
        content: meta?.content ?? null,
        canvas: meta?.canvas ?? null,
        cell: meta?.cell && Array.isArray(meta.cell) ? meta.cell : null,
        bleed: meta?.bleed ?? null,
        /* `mode` = "alpha" | "rgb" — tấm mà ô này được cắt ra CÓ nền trong suốt hay
           không. `slice.py` không còn từ chối cắt tấm đục (từ chối là giữ ảnh của
           người dùng làm con tin) và tuyệt đối không tự chế alpha; nó ghi cờ này để
           web nói thẳng "tấm này không có nền trong suốt, sinh lại đi". Kit cắt bằng
           bản cũ không có khoá này ⇒ null, và web im lặng như trước. */
        mode: meta?.mode ?? null,
        empty: st.size === 0,
        mtime: new Date(st.mtimeMs).toISOString(),
      })
    }
    files.sort((a, b) => a.file.localeCompare(b.file))
    const cutAt = files.reduce((m, f) => (f.mtime > m ? f.mtime : m), "")
    return {
      status: 200,
      json: { variant, cutAt: cutAt || null, files, sheets: entry.sheets ?? {}, qa: manifest.qa ?? entry.qa ?? null },
    }
  })
}
