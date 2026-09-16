/* fake-engine.mjs — RUỘT CHUNG CỦA MỌI ENGINE GIẢ (bước ④, 16/09/2026).
 *
 * ╔══ VÌ SAO FIXTURE PHẢI ĐỔI, VÀ ĐỔI THEO KIỂU NÀY ═══════════════════════════╗
 * ║ Tới bước ③ mỗi `engine-*` là một `gen.sh` + `slice.py` giả: agent CHÉP chúng ║
 * ║ vào project rồi spawn `bash`/`python3`. Bước ④ bỏ cả hai khỏi sản phẩm, nên  ║
 * ║ một bộ ca còn cần bash để chạy là một bộ ca không còn đo sản phẩm nữa — và   ║
 * ║ trên máy KHÔNG có bash/python (đúng thứ bước ④ hứa hẹn) nó sẽ đỏ trọn gói.   ║
 * ║                                                                             ║
 * ║ Chọn ENGINE GIẢ BẰNG JS chứ không phải CODEX GIẢ: hai thứ đo hai chuyện.     ║
 * ║ Codex giả (đã có, xem `test/suite-engine-gen.mjs`) đo ENGINE — vòng gọi, phép║
 * ║ phán, câu chữ. Còn `suite-runs` / `suite-pause` / `suite-cover` đo AGENT:     ║
 * ║ spawn đúng lệnh không, đọc stdout đúng không, dừng được không, cắt lũy tiến   ║
 * ║ không. Để đo được những thứ đó chúng cần một engine CÓ THỂ ĐIỀU KHIỂN — chạy ║
 * ║ chậm đều, hỏng đúng một tấm, treo mãi mãi — mà engine thật thì không.        ║
 * ║                                                                             ║
 * ║ HỢP ĐỒNG PHẢI GIỮ (đây là toàn bộ giá trị của fixture):                      ║
 * ║  · argv y hệt bản thật: `cli.mjs <lệnh> <projectDir> …`;                     ║
 * ║  · MỌI đường dẫn neo theo `<projectDir>` của argv, KHÔNG theo cwd, KHÔNG     ║
 * ║    theo thư mục chứa script (bản cũ neo theo script vì agent chép nó vào     ║
 * ║    project — nay agent KHÔNG chép gì cả);                                    ║
 * ║  · bốn mẫu dòng stdout mà `parseGenLine` bám, từng ký tự;                    ║
 * ║  · hình dạng `kits/manifest.json` giống `slice.mjs` thật (xem `fakeSlice`).  ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const sleep = ms => new Promise(r => setTimeout(r, ms))

/** `date +%H:%M:%S` của bản bash. */
export function hhmmss(d = new Date()) {
  const p = n => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export const say = line => process.stdout.write(line + "\n")

/** styles.json của project (agent ĐÃ thu hẹp nó về đúng tập job của lượt). */
export function readStyles(projectDir) {
  return JSON.parse(readFileSync(join(projectDir, "styles.json"), "utf8"))
}

/** Danh sách job = style × sheet, tôn trọng `sheet.styles` — y hệt `listJobs` thật. */
export function jobsOf(cfg) {
  const out = []
  for (const s of cfg.styles ?? []) {
    for (const sh of cfg.sheets ?? []) {
      if (sh.styles?.length && !sh.styles.includes(s.id)) continue
      out.push({ job: `${s.id}-${sh.id}`, style: s, sheet: sh })
    }
  }
  return out
}

export function mkdirs(projectDir, dirs) {
  for (const d of dirs) mkdirSync(join(projectDir, d), { recursive: true })
}

/**
 * CẮT GIẢ — cùng giao diện với `engine/slice.mjs` thật:
 *   · argv là TẬP CHÍNH XÁC các style cần cắt (không phải substring)
 *   · `--sheet=<id>` (lặp được) thu hẹp về ĐÚNG một tấm — đường CẮT LŨY TIẾN mà agent
 *     dùng ngay khi một tấm gen xong (`parseCli` + `ONLY_SHEETS` của bản thật)
 *   · merge `kits/manifest.json`: sheet KHÔNG cắt lượt này phải còn nguyên trong
 *     manifest, nếu không thì cắt lũy tiến 3 lượt sẽ chỉ còn lại tấm cuối
 *   · ghi manifest NGUYÊN TỬ (tmp + rename) như bản thật
 * KHÁC: không cắt ảnh thật, chỉ ghi file `PNGFAKE` để kiểm luồng.
 *
 * @param modeOf (rawBytes) => string — nhãn `mode` ghi vào manifest (engine-alpha
 *        dùng nó để nói "tấm này nền đục"); mặc định "fake" như bản cũ.
 */
export function fakeSlice(projectDir, argv, { modeOf = null } = {}) {
  const cfg = readStyles(projectDir)
  const ONLY = new Set(), ONLY_SHEETS = new Set()
  for (const a of argv) {
    if (a.startsWith("--sheet=")) ONLY_SHEETS.add(a.slice("--sheet=".length))
    else if (a.startsWith("--sheets=")) {
      for (const s of a.slice("--sheets=".length).split(",")) if (s) ONLY_SHEETS.add(s)
    } else ONLY.add(a)
  }
  const kits = join(projectDir, "kits")
  const mpath = join(kits, "manifest.json")
  mkdirSync(kits, { recursive: true })
  const manifest = existsSync(mpath) ? JSON.parse(readFileSync(mpath, "utf8")) : { styles: {} }
  manifest.styles ??= {}

  for (const style of cfg.styles ?? []) {
    const sid = style.id
    if (ONLY.size && !ONLY.has(sid)) continue
    const out = join(kits, sid)
    mkdirSync(join(out, "tight"), { recursive: true })
    const entry = { sheets: {}, assets: [], empty_cells: [] }
    const doneSheets = new Set()

    for (const sh of cfg.sheets ?? []) {
      if (sh.styles?.length && !sh.styles.includes(sid)) continue
      if (ONLY_SHEETS.size && !ONLY_SHEETS.has(sh.id)) continue
      const job = `${sid}-${sh.id}`
      const src = join(projectDir, "raw", `${job}.png`)
      if (!existsSync(src)) { say(`⚠ bỏ qua ${job}: chưa có raw/${job}.png`); continue }
      const mode = modeOf ? modeOf(readFileSync(src)) : "fake"
      let n = 0
      for (const [i, c] of (sh.components ?? []).entries()) {
        if (c.skel?.shape === "empty") { entry.empty_cells.push({ sheet: sh.id, cell: i }); continue }
        writeFileSync(join(out, c.file + ".png"), "PNGFAKE")
        // bản ôm sát, đúng như `slice.mjs` thật
        writeFileSync(join(out, "tight", c.file + ".png"), "PNGFAKE")
        /* ⚠️ HÌNH DẠNG PHẢI GIỐNG BẢN THẬT, nếu không test xanh mà sản phẩm đỏ —
           đúng chuyện đã xảy ra với `sheet: null`:
             · `file` KÈM đuôi ".png"
             · `cell` là KÍCH THƯỚC ô [w, h], KHÔNG phải chỉ số ô
             · có `safe` / `content_at` cho đường copy sang Figma */
        const asset = {
          file: c.file + ".png", sheet: sh.id,
          canvas: [522, 348], cell: [384, 256], bleed: [69, 46],
          content: [248, 110], content_at: [137, 120],
          safe: [111, 123, 300, 102],
        }
        if (modeOf) asset.mode = mode
        entry.assets.push(asset)
        n += 1
      }
      entry.sheets[sh.id] = { mode, cut: n, blobs: n }
      doneSheets.add(sh.id)
      say(`cắt ${job}: ${n} file`)
    }

    // GIỮ LẠI phần sheet không chạy lượt này (bản thật: khối "GEN LẠI MỘT NHÓM")
    const prev = manifest.styles[sid] ?? {}
    const keep = Object.keys(prev.sheets ?? {}).filter(k => !doneSheets.has(k))
    for (const k of keep) entry.sheets[k] = prev.sheets[k]
    for (const a of prev.assets ?? []) if (keep.includes(a.sheet)) entry.assets.push(a)
    for (const e of prev.empty_cells ?? []) {
      if (e && typeof e === "object" && keep.includes(e.sheet)) entry.empty_cells.push(e)
    }
    if (keep.length) say(`  ↺ ${sid}: giữ nguyên ${keep.length} sheet không chạy lượt này (${keep.join(", ")})`)
    manifest.styles[sid] = entry
  }

  writeFileSync(mpath + ".tmp", JSON.stringify(manifest, null, 1))
  renameSync(mpath + ".tmp", mpath)
  say("→ kits/manifest.json")
}

/**
 * Bộ khung `main` chung: đọc argv, gọi đúng nhánh, KHÔNG BAO GIỜ tự thoát khác 0 trừ
 * khi nhánh nói thế. Lệnh không được khai = engine đời cũ chưa có tính năng ấy — trả
 * 2 y hệt bản thật, và đó chính là thứ một vài ca test đang đo.
 */
export async function runFixture(handlers) {
  const [cmd, projectDir, ...rest] = process.argv.slice(2)
  const h = handlers[cmd]
  if (!h || !projectDir) {
    process.stderr.write(`engine giả: không có lệnh '${cmd}'\n`)
    return 2
  }
  return (await h(projectDir, rest)) ?? 0
}
