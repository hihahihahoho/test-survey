/* ════════════════════════════════════════════════════════════════════════════
   cover.mjs — ẢNH BÌA của project: dựng prompt, chạy cover.sh, ghi cover/cover.png.

   BA QUYẾT ĐỊNH ĐÃ CHỐT VỚI CHỦ SẢN PHẨM, viết lại ở đây để đời sau đừng "sửa cho
   gọn" rồi làm mất lý do:

   ① JOB PHỤ, KHÔNG PHẢI MỘT PHA CỦA RUN.
      Ảnh bìa chạy NGOÀI RunStore: không chiếm suất "mỗi project một run", không đẩy
      badge ⚡, không đổi `run.status`. Cover hỏng thì lượt gen vẫn "done". Người dùng
      bỏ 15 phút và cả quota để có sprite sheet — không đời nào để một tấm ảnh trang
      trí kéo lượt đó xuống "done-with-errors".

   ② NEO VÀO BRANDING GỐC, CỐ Ý KHÔNG NEO VÀO STYLE ĐANG CHỈNH —
      NHƯNG KHÔNG BAO GIỜ ĐƯỢC RA MỘT ẢNH LẠ HOẮC.
      Prompt lấy màu thương hiệu + mascot của variant ĐẦU TIÊN (bản gốc của dự án) và
      KHÔNG lấy `variant.style` / `inspo` — thứ người dùng còn đang thử tới thử lui bên
      trong. Đổi phong cách bên trong 5 lần thì ảnh bìa vẫn là nhận diện của game đó,
      không phải ảnh chụp màn hình của lần thử gần nhất.

      BẢN VÁ 18/08 — thứ tự chọn chất liệu có thêm bậc CUỐI: TÀI SẢN ĐÃ CẮT của chính
      dự án. Lý do là một kết quả kiểm thử, không phải sở thích: 3/3 tester mù đều báo
      cùng một chuyện — dự án của họ chỉ có vài nút bấm, KHÔNG có nhân vật nào, nên
      nhánh cuối rơi thẳng vào "brand still life: badge, coin, gift, ribbon" và đẻ ra
      một cảnh hộp quà + huy chương đen trắng. Cả ba người đều đọc nó thành "app lấy
      NHẦM ảnh của dự án/khách hàng khác" (blind-qa-1 BUG-02 P1, blind-qa-2 UX#1,
      blind-qa-3). Một ảnh bìa vô hại về mặt kỹ thuật mà làm người dùng nghi ngờ dữ
      liệu của mình bị lẫn thì đắt hơn nhiều so với một ảnh bìa xấu.

      Nên: hết mascot ⇒ đính kèm 1-2 asset ĐÃ CẮT đẹp nhất trong `kits/` và bảo model
      dựng HERO SHOT tôn chính món đó. Đây KHÔNG phá quyết định ② ở trên: chất liệu vẫn
      là sản phẩm của dự án, không phải `variant.style` đang thử.
      Còn nguyên si nhánh still life, nhưng CHỈ cho dự án trắng trơn (chưa cắt được
      asset nào) — và lúc đó meta trả cờ `placeholder:true` + `subject` enum để web nói
      thẳng "đây là ảnh tạm", thay vì để người dùng tự đoán.

   ③ TÊN DỰ ÁN LÀ MỘT PHẦN CỦA TRANH — MODEL VẼ CHỮ, KHÔNG PHẢI APP DÁN ĐÈ.
      BẢN VÁ 18/08 — ĐẢO LẠI quyết định cũ, và lý do phải viết ra vì bản cũ có lý lẽ tốt.
      Bản cũ: prompt CẤM mọi chữ, model chỉ chừa trống một hình chữ nhật, webapp dán một
      chip nền đặc + tên dự án lên đó bằng CSS (đổi tên ⇒ 0 quota, không bao giờ sai dấu).
      Cái giá của nó là thứ nhìn thấy được: mọi tấm bìa đều có một miếng nhãn chữ nhật
      dán đè, trông như ảnh chưa xong chứ không như một tấm bìa. Chủ sản phẩm chốt: chữ
      phải nằm TRONG artwork, typography ăn theo phong cách của tranh.

      Nên bây giờ prompt ĐƯA THẲNG TÊN DỰ ÁN vào và bắt model chép ĐÚNG NGUYÊN VĂN. Rủi
      ro cũ (model viết sai dấu tiếng Việt) là THẬT và không biến mất, nên nó được đánh
      thẳng bằng một khối ràng buộc riêng: bọc tên trong « », nói rõ đây là tiếng Việt,
      liệt kê đúng thứ hay bị đánh rơi (ă â ê ô ơ ư đ + dấu thanh), cấm đổi sang chữ
      ASCII nhìn giống, và cho model một đường lui an toàn ("không kẻ nổi thì kẻ sans-serif
      trơn") — chữ đúng mà xấu vẫn dùng được, chữ đẹp mà sai dấu thì vứt.

      TITLE_ZONE KHÔNG BỊ BỎ. Nó đổi vai: từ "vùng cấm vẽ" thành "chỗ ĐẶT tiêu đề" — vẫn
      là toạ độ đó, vẫn dùng chung với webapp (webapp/src/features/home/lib/cover-title.ts),
      vì webapp CÒN CẦN nó cho hai ca: ảnh bìa cũ vẽ trước bản vá này, và dự án không có
      tên dùng được. Suite-cover vẫn đối chiếu hằng số hai file.

      HAI NHÁNH, KHÔNG PHẢI MỘT: tên dự án rỗng / toàn ký tự rác sau khi lọc ⇒ KHÔNG có
      gì để kẻ, prompt rơi NGUYÊN VẸN về lối cũ (chừa trống + cấm chữ) và meta trả
      `titleEmbedded:false` để webapp dán overlay như trước. Cờ boolean đó là toàn bộ hợp
      đồng với web — API #43 KHÔNG BAO GIỜ trả chuỗi tên ra ngoài (xem `coverStatus`).
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
 * Dải trái, rộng 56%, cao 40%, canh giữa dọc.
 *
 * MỘT TOẠ ĐỘ, HAI VAI (§ quyết định ③): prompt bảo model KẺ tiêu đề vào đúng đây, còn
 * webapp dán overlay vào đúng đây cho hai ca không kẻ được (ảnh bìa cũ · dự án không có
 * tên dùng được). Chính vì cùng một hình chữ nhật mà đổi vai không làm chữ nhảy chỗ.
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

/**
 * ĐỘ DÀI TỐI ĐA của tiêu đề đưa vào prompt (đếm theo KÝ TỰ THẬT, không phải mã UTF-16).
 *
 * `projects.mjs` cho tên dài tới 120 ký tự. Một dòng 120 ký tự kẻ vào dải trái 56% của
 * ảnh bìa thì chữ nhỏ tới mức không đọc nổi ở khổ thumbnail 256px — mà đó là khổ duy
 * nhất người dùng nhìn thấy nó. 48 là chỗ vừa đủ cho hai dòng đọc được.
 */
export const COVER_TITLE_MAX = 48

/**
 * TÊN DỰ ÁN → CHUỖI AN TOÀN ĐỂ NHÚNG VÀO PROMPT. Trả `null` = không có gì để kẻ.
 *
 * Tên dự án là dữ liệu NGƯỜI DÙNG GÕ và nó đi thẳng vào prompt của một model, nên đây
 * là một mặt tiếp xúc, không phải một phép cắt chuỗi cho đẹp:
 *  ① ký tự điều khiển + ký tự định dạng vô hình (`\p{Cc}`, `\p{Cf}`: xuống dòng, TAB,
 *     và cả RLO/LRO đảo chiều hiển thị) bị thay bằng khoảng trắng — một cái `\n` trong
 *     tên là đủ để phần còn lại của tên trông như một CHỈ THỊ MỚI trong prompt;
 *  ② `«` `»` bị gỡ: đó là cặp dấu prompt dùng để nói "tên bắt đầu/kết thúc ở đây", để
 *     nguyên thì người dùng tự đóng được cái ngoặc đó;
 *  ③ gộp khoảng trắng, cắt về COVER_TITLE_MAX theo RANH GIỚI TỪ khi cắt được — cắt
 *     giữa một từ tiếng Việt ra chữ cụt đọc còn khó hiểu hơn tên bị ngắn;
 *  ④ KHÔNG thêm "…" vào chỗ cắt: model sẽ kẻ luôn ba chấm đó vào tranh.
 *
 * KHÔNG bỏ dấu, KHÔNG hạ dấu về ASCII: giữ đúng nguyên văn là toàn bộ mục đích ở đây.
 * `NFC` để dấu đứng liền chữ thành một ký tự — chuỗi tổ hợp NFD trông y hệt nhưng dài
 * gấp đôi khi đếm và hay bị model đọc lệch.
 */
export function sanitizeCoverTitle(name) {
  const raw = String(name ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/[«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!raw) return null
  const chars = [...raw]
  if (chars.length <= COVER_TITLE_MAX) return raw
  const cut = chars.slice(0, COVER_TITLE_MAX).join("")
  const sp = cut.lastIndexOf(" ")
  /* Chỉ lùi về ranh giới từ khi phần giữ lại vẫn còn ra hồn (≥60%); tên một từ rất dài
     (hoặc tiếng không có khoảng trắng) thì cắt cứng còn hơn trả về hai chữ cái. */
  const out = (sp >= Math.floor(COVER_TITLE_MAX * 0.6) ? cut.slice(0, sp) : cut).trim()
  return out || null
}

/* ═════════════════ 1. Chất liệu: branding GỐC của dự án ═════════════════ */

/**
 * CHỦ THỂ của ảnh bìa — ENUM, và cố ý chỉ là enum: giá trị này đi thẳng ra API #43 nên
 * nó phải tuân đúng hợp đồng bảo mật của agent (đáp án chỉ chứa enum / boolean / chuỗi
 * phiên bản, KHÔNG chứa đường dẫn tuyệt đối hay tên file của máy người dùng).
 * Web dùng nó để dán nhãn "ảnh tạm" cho đúng một trường hợp: `generic-placeholder`.
 */
export const SUBJECT_MASCOT_IMAGE = "mascot-image"
export const SUBJECT_MASCOT_SPEC = "mascot-spec"
export const SUBJECT_PROJECT_ASSETS = "project-assets"
export const SUBJECT_PLACEHOLDER = "generic-placeholder"
export const COVER_SUBJECTS = [
  SUBJECT_MASCOT_IMAGE, SUBJECT_MASCOT_SPEC, SUBJECT_PROJECT_ASSETS, SUBJECT_PLACEHOLDER,
]

/* Hai màu này chỉ là DEFAULT của app, không phải brand của project. Khai lại tại agent
   để không import ngược webapp; nguồn chuẩn: `webapp/src/lib/types/contract.ts:72-73`
   (`NEUTRAL_PRIMARY_COLOR` / `NEUTRAL_SECONDARY_COLOR`). */
const NEUTRAL_PRIMARY_COLOR = "#151516"
const NEUTRAL_SECONDARY_COLOR = "#9A9A9A"

function isNeutralBrandPair(primary, secondary) {
  return typeof primary === "string" && typeof secondary === "string" &&
    primary.trim().toUpperCase() === NEUTRAL_PRIMARY_COLOR &&
    secondary.trim().toUpperCase() === NEUTRAL_SECONDARY_COLOR
}

/** Nhiều nhất 2 asset đã cắt được đính kèm: 1 anh hùng + 1 kép phụ. Ba tấm thì model
 *  bắt đầu xếp chúng thành lưới — mà lưới chính là thứ prompt đang cấm. */
const KIT_ATTACH_MAX = 2

/** Variant đầu tiên = bản gốc của dự án (§ quyết định ②). */
function baseVariant(contract) {
  const v = contract?.variants
  return Array.isArray(v) && v.length ? v[0] : null
}

/**
 * Early-cover chỉ an toàn khi contract đã có nguồn mascot/pose. Dự án không có
 * mascot/ref/pose lấy nhận diện duy nhất từ `kits/manifest.json`, vốn chỉ xuất hiện
 * sau slice; kích cover ở job đầu tiên sẽ chụp đúng lúc manifest chưa tồn tại.
 */
export function hasMascotCoverSource(contract) {
  const v = baseVariant(contract)
  const characters = Array.isArray(v?.characters) ? v.characters : []
  if (characters.some(c => String(c?.vi ?? "").trim() || String(c?.ref ?? "").trim())) return true
  if ((contract?.sheets ?? []).some(sh => String(sh?.id ?? "").startsWith("pose-"))) return true
  return v?.brand?.mode === "image" && Array.isArray(v?.brand?.refs) && v.brand.refs.length > 0
}

/**
 * BẬC CUỐI của chất liệu nhận diện: 1-2 asset ĐÃ CẮT đẹp nhất của chính dự án.
 *
 * "Đẹp nhất" được xếp bằng thứ tự có sẵn trong `kits/manifest.json` do `slice.py` ghi,
 * KHÔNG phải bằng cảm tính:
 *  ① bỏ ô rỗng (`empty_cells` — slice không tìm thấy nội dung nào trong ô);
 *  ② asset KHÔNG bị QA gắn cờ (`sizeDeviation.flagged`) đứng trước asset bị gắn cờ —
 *     ưu tiên, KHÔNG phải điều kiện: dự án mà MỌI ô đều lệch khung vẫn phải có bìa
 *     của chính nó, một tấm bìa hơi lệch còn hơn một tấm bìa của người lạ;
 *  ③ trong cùng bậc, ô có vùng nội dung TO nhất thắng — nó là món model vẽ kỹ nhất và
 *     là món người dùng nhận ra nhanh nhất trên thẻ dự án.
 *
 * Lấy bản `tight/` trước: đó là chính món hàng ôm sát mép, còn bản canvas cùng tên
 * đệm thêm nền trong quanh nó — thu nhỏ về khổ ảnh tham chiếu thì món hàng bé lại và
 * model bám kém đi.
 */
async function pickKitAssets(variantId, hasFile, readJson) {
  const manifest = await readJson("kits/manifest.json")
  const styles = manifest?.styles
  if (!styles || typeof styles !== "object") return []
  const sid = variantId && styles[variantId] ? variantId : Object.keys(styles)[0]
  if (!sid) return []
  const entry = styles[sid]
  const empty = new Set((Array.isArray(entry?.empty_cells) ? entry.empty_cells : []).map(String))
  const ranked = (Array.isArray(entry?.assets) ? entry.assets : [])
    .filter(a => typeof a?.file === "string" && a.file.endsWith(".png"))
    .map(a => ({
      file: a.file,
      flagged: a?.sizeDeviation?.flagged === true ? 1 : 0,
      area: Array.isArray(a?.content) && Number.isFinite(Number(a.content[0])) && Number.isFinite(Number(a.content[1]))
        ? Number(a.content[0]) * Number(a.content[1])
        : 0,
    }))
    .filter(a => !empty.has(a.file.replace(/\.png$/, "")))
    .sort((x, y) => x.flagged - y.flagged || y.area - x.area || x.file.localeCompare(y.file))

  const out = []
  for (const a of ranked) {
    if (out.length >= KIT_ATTACH_MAX) break
    const tight = `kits/${sid}/tight/${a.file}`
    const flat = `kits/${sid}/${a.file}`
    if (await hasFile(tight)) out.push(tight)
    else if (await hasFile(flat)) out.push(flat)
  }
  return out
}

/**
 * Gom chất liệu nhận diện: màu thương hiệu + mô tả mascot + ảnh đính kèm.
 * @param hasFile async (relPath) => boolean — kiểm file có thật trong project.
 *        Tiêm vào để hàm này test được mà không cần ổ đĩa.
 * @param readJson async (relPath) => object|null — đọc JSON trong project (chỉ dùng cho
 *        `kits/manifest.json`). Cũng tiêm vào, cùng lý do; mặc định "không có gì cả" nên
 *        người gọi cũ vẫn chạy y như trước.
 */
export async function collectBranding(contract, hasFile, readJson = async () => null) {
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
  const mascotSpec = ((poseSheet?.components ?? []).map(c => String(c?.spec ?? "")).find(s => s.length > 20) ?? "")
    .slice(0, 600)
  const mascotName = characters[0]?.vi ? String(characters[0].vi) : null
  const hasMascotImage = attachments.length > 0

  /* ⑤ TÀI SẢN ĐÃ CẮT của chính dự án — chỉ khi KHÔNG còn chút mascot nào, kể cả mascot
     mới chỉ tồn tại dưới dạng chữ. Nếu dự án có mô tả mascot mà tấm dáng chưa sinh xong,
     nhánh SUBJECT sẽ tả mascot bằng lời; đính thêm ảnh cái nút bấm vào đó chỉ khiến model
     vẽ một con vật đeo hình cái nút. Cấm hai nguồn chủ thể cùng lúc. */
  let kitAssets = []
  if (!hasMascotImage && !mascotName && !mascotSpec) {
    kitAssets = await pickKitAssets(v?.id, hasFile, readJson)
    for (const p of kitAssets) await add(p)
  }

  const subject = hasMascotImage ? SUBJECT_MASCOT_IMAGE
    : mascotName || mascotSpec ? SUBJECT_MASCOT_SPEC
      : attachments.length ? SUBJECT_PROJECT_ASSETS
        : SUBJECT_PLACEHOLDER

  const primary = typeof brand.primary === "string" ? brand.primary : null
  const secondary = typeof brand.secondary === "string" ? brand.secondary : null
  const neutral = isNeutralBrandPair(primary, secondary)

  return {
    variantId: v?.id ?? null,
    /* Cặp mặc định của app không được nói với model như brand; để prompt lấy màu từ
       asset, hoặc low-saturation khi asset cũng chưa có. */
    primary: neutral ? null : primary,
    secondary: neutral ? null : secondary,
    gradient: typeof brand.gradient === "string" ? brand.gradient : null,
    mascotName,
    mascotSpec,
    attachments,
    /** Enum, đi thẳng ra API #43. `generic-placeholder` = dự án trắng trơn, bìa là ảnh tạm. */
    subject,
  }
}

/* ═════════════════ 2. Prompt ═════════════════ */

/**
 * Dựng prompt ảnh bìa. Trả `{ prompt, attachments, branding, title, titleEmbedded }`.
 *
 * `title` chỉ để người gọi ghi log/prompt trên ĐĨA; ra tới API #43 nó co lại còn đúng
 * boolean `titleEmbedded` (§ quyết định ③ + `coverStatus`).
 *
 * Lối viết bám đúng triết lý crop-safe v15 (handoff §5.3): mỗi ràng buộc hình học đều
 * kèm HẬU QUẢ nếu làm sai ("phần mềm sẽ crop / bìa sẽ bị vứt đi"), vì model bám ý nghĩa
 * tốt hơn bám mệnh lệnh. Khác v15 ở chỗ cover KHÔNG có grid, KHÔNG có chroma-key và
 * KHÔNG tách nền: nền full-bleed, đục hoàn toàn.
 */
export async function buildCoverPrompt({ project, contract, hasFile, readJson }) {
  const b = await collectBranding(contract, hasFile, readJson)
  const z = titleZonePixels()
  const [gw, gh] = GEN_CANVAS
  const title = sanitizeCoverTitle(project?.name)
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
  } else if (b.subject === SUBJECT_PROJECT_ASSETS) {
    /* Không có màu thương hiệu NHƯNG có hàng thật của dự án trong tay: màu của chính món
       hàng đó LÀ nhận diện. Rơi về "low-saturation" ở đây là đúng cái đã đẻ ra tấm bìa
       đen trắng mà 3/3 tester tưởng của dự án khác. */
    L.push("No brand colours were given, so the ATTACHED ARTWORK is the palette: read the")
    L.push("colours straight off it — its main colour becomes this cover's dominant colour, and")
    L.push("the background wash, the light and the rim light on the subject all follow from it.")
    L.push("Do not desaturate it and do not swap it for a colour of your own choosing.")
  } else {
    L.push("No brand colours were given: use one calm, friendly, low-saturation colour scheme")
    L.push("built from a single hue plus warm neutrals — no rainbow, no clashing accents.")
  }
  L.push("Neutrals: soft warm off-white and light neutral tones carry the quiet areas, so the")
  L.push("brand colours stay readable and the cover does not look noisy.")
  L.push("")

  /* ── Chủ thể — bốn nhánh, xem `subject` ở collectBranding ── */
  if (b.subject === SUBJECT_MASCOT_IMAGE) {
    L.push("SUBJECT — the attached image(s) are this project's OWN mascot / brand reference.")
    L.push("The cover's subject is EXACTLY that character: same species, face, colours, costume,")
    L.push("materials and proportions, re-drawn cleanly as one single full-body figure.")
    L.push("If a reference sheet shows the character several times, in several poses, or on a")
    L.push("flat key-coloured background, take ONLY the character's identity from it — draw ONE")
    L.push("character, in one new pose, on this cover's own background. Never copy the sheet's")
    L.push("layout, its cells or its background colour.")
  } else if (b.subject === SUBJECT_MASCOT_SPEC) {
    L.push("SUBJECT — the project's mascot, described by the project itself:")
    if (b.mascotName) L.push(`Character: ${b.mascotName}.`)
    if (b.mascotSpec) L.push(b.mascotSpec)
    L.push("Draw ONE single full-body figure of this character.")
  } else if (b.subject === SUBJECT_PROJECT_ASSETS) {
    L.push("SUBJECT — this project has no mascot. The attached image(s) are FINISHED ARTWORK")
    L.push("this very project just produced: its own game pieces, already cut out.")
    L.push("Build the cover as a HERO SHOT of that artwork. Re-draw the attached piece large,")
    L.push("as the single focal point of the cover, keeping its exact silhouette, colours,")
    L.push("material, surface texture, edge treatment and lighting — the person who owns this")
    L.push("project must recognise their own piece at a glance. Do not restyle it, do not")
    L.push("modernise it, do not turn it into a different kind of object.")
    L.push("If two pieces are attached, the FIRST one is the hero: draw it big and in front;")
    L.push("let the second sit smaller, softer and slightly behind it, as supporting depth.")
    L.push("Add nothing else: no characters, no faces, no mascot, no extra props, no invented")
    L.push("badges, coins, gifts or ribbons — the attached pieces are the whole subject.")
    L.push("The attachments arrive cut out on a transparent or checkerboard background. That")
    L.push("background is NOT part of the artwork: drop it, and stand the piece on this cover's")
    L.push("own opaque background instead.")
  } else {
    /* NHÁNH ẢNH TẠM — chỉ tới được khi dự án chưa cắt nổi một asset nào. Meta gắn cờ
       `placeholder:true` để web nói thẳng ra, vì chính cảnh này (đọc rời khỏi ngữ cảnh)
       bị 3/3 tester mù đọc thành "app lấy nhầm ảnh dự án khác". */
    L.push("SUBJECT — this project has produced no artwork yet and has no mascot, so there is")
    L.push("nothing of its own to show. Build a simple brand still life instead: a few smooth,")
    L.push("rounded game props (a soft badge, a coin, a gift, a ribbon) in the brand colours,")
    L.push("grouped as one calm cluster. No characters, no faces.")
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

  /* ── Tiêu đề. Hai nhánh, xem § quyết định ③: kẻ chữ THẬT, hoặc chừa trống như bản cũ ── */
  if (title) {
    L.push("THE TITLE IS PART OF THE ARTWORK — THIS IS THE ONE RULE THAT DECIDES IF THE COVER IS USABLE.")
    L.push("Letter this project's own title INTO the picture, the way a book cover or a game key-art")
    L.push("poster carries its title: the letters are designed with the scene — same palette, same")
    L.push("light, same mood — not pasted on afterwards as a flat rectangular label or a sticker.")
    L.push("MATERIAL INTEGRATION — treat the letters as physical parts of this scene, using the")
    L.push("same surface family as the artwork and the same light: scene-matched texture, edge")
    L.push("softness, highlights, contact shadow or shallow relief where the scene calls for it.")
    L.push("Do not make a flat UI text layer; the title must receive and reflect the scene's")
    L.push("light and colour as though it was painted, glazed, embossed or carved into the")
    L.push("same world — choose the treatment from the attached artwork and scene, not a generic")
    L.push("font effect.")
    L.push("")
    L.push("Render EXACTLY this text, character for character, changing nothing:")
    L.push(`«${title}»`)
    L.push("The text is VIETNAMESE. It is a proper name, not a phrase to be understood, corrected,")
    L.push("shortened or improved. Copy it GLYPH BY GLYPH from between the « » marks, INCLUDING")
    L.push("EVERY DIACRITIC — the letter forms ă â ê ô ơ ư đ and the tone marks à á ả ã ạ are part of")
    L.push("the spelling, and a word carrying the wrong mark is a different, wrong word.")
    L.push("- do not translate it, do not transliterate it, do not re-spell it;")
    L.push("- do not drop, add, move, merge or restyle a single accent, above or below a letter;")
    L.push("- do not replace Vietnamese letters with plain ASCII look-alikes (ơ is not o, đ is not d,")
    L.push("  ê is not e); do not change which letters are capital and which are small;")
    /* "extra"/"of your own": tiêu đề thật hoàn toàn có thể đã chứa sẵn năm hoặc chữ số
       ("… 2026"). Cấm trống "no year" là tự mâu thuẫn với dòng «…» ngay bên trên. */
    L.push("- do not add a subtitle, a tagline, an extra year, a studio name, a slogan, or any")
    L.push("  other word of your own;")
    L.push("- do not draw the « » marks themselves: they only show where the title starts and ends.")
    L.push("Give the accents room: generous line spacing and enough gap between a mark and the letter")
    L.push("body, so nothing collides and every mark survives at small size.")
    L.push("If you cannot letter it beautifully AND correctly, letter it in a plain clean sans-serif:")
    L.push("a correct plain title is usable, a decorative misspelled one is thrown away.")
    L.push("")
    L.push(`TITLE PLACEMENT — on this ${gw}x${gh} canvas, set the title inside the rectangle from`)
    L.push(`x=${z.x0} to x=${z.x1} and from y=${z.y0} to y=${z.y1} (the left band, about 56% of the width,`)
    L.push("vertically centred):")
    L.push("- one or two lines, left-aligned, filling that band comfortably and never touching or")
    L.push("  crossing its edges; big enough to read when the cover is shown as a small thumbnail;")
    L.push("- keep what sits BEHIND the letters calm and even — a smooth surface, a soft gradient")
    L.push("  wash or a plain brand-coloured area — and keep strong contrast between the letters and")
    L.push("  that background, so every mark stays readable;")
    L.push("- the subject must not overlap the title and the title must not overlap the subject;")
    L.push("- no props, ornaments, sparkles or busy texture inside that rectangle other than the title.")
    L.push("A misspelled title, a title with wrong or missing Vietnamese accents, a title running off")
    L.push("the canvas, or a title buried in clutter makes the whole cover unusable, and the cover")
    L.push("will be thrown away and regenerated.")
    L.push("")
    L.push("NO OTHER TEXT ANYWHERE: the title above is the ONLY text in the whole image. Apart from")
    L.push("it, draw no words, no digits, no wordmark, no logo type, no watermark, no signature, no")
    L.push("caption and no label on any prop, in any language — not even small, blurred or")
    L.push("decorative lettering.")
  } else {
    /* KHÔNG có tên dùng được ⇒ y NGUYÊN lối cũ: chừa trống, cấm chữ, web dán overlay. */
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
    L.push("ABSOLUTELY NO TEXT: no letters, no digits, no words, no wordmark, no logo type, no")
    L.push("watermark, no signature, no caption, in any language, anywhere in the image — not on")
    L.push("the title plate, not on the subject, not on any prop.")
    L.push("The real title is composited by software afterwards. Any text you draw would be")
    L.push("misspelled, would be in the wrong language, and would collide with the real title.")
  }
  L.push("")

  /* ── Hậu quả của việc cắt 16:9 ── */
  L.push("CROP CONSEQUENCE — the finished cover is the CENTRAL 16:9 BAND of this canvas:")
  L.push(`the top ${z.cutTop}px and the bottom ${z.cutBottom}px are cut away and never seen.`)
  L.push(`Keep everything essential — the subject's head and feet, ${title ? "every letter of the title" : "the whole title plate"} —`)
  L.push("inside that central band; let only background bleed into the top and bottom strips.")
  L.push("")

  L.push("Clean, modern, friendly game key-art quality: smooth shapes, soft depth, gentle")
  L.push(`lighting, landscape ${gw}x${gh}.`)

  const prompt = L.join("\n")
  return { prompt, attachments: b.attachments, branding: b, title, titleEmbedded: Boolean(title) }
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
 *
 * `subject` + `placeholder` là ENUM và BOOLEAN, không hơn — hợp đồng bảo mật của agent
 * cấm đáp án #43 mang tên file hay đường dẫn của máy người dùng, nên ở đây KHÔNG bao giờ
 * trả `meta.source.attachments` ra ngoài dù nó nằm ngay cạnh trên đĩa. Lọc qua
 * `COVER_SUBJECTS`: `cover.json` là file trên đĩa, người dùng sửa tay được, và một chuỗi
 * lạ lọt ra API là đúng thứ vừa bị cấm.
 *
 * `titleEmbedded` cũng chỉ là BOOLEAN vì đúng lý do đó: web chỉ cần biết "chữ đã nằm
 * trong ảnh chưa" để khỏi dán overlay lên lần thứ hai — nó KHÔNG cần, và không được
 * nhận, chuỗi tên mà agent đã kẻ vào tranh. Tên dự án web vốn đã có sẵn từ #10.
 *
 * @returns {{status:"none"|"running"|"ok"|"failed", path:string|null, updatedAt:string|null,
 *            titleZone:object, error:string|null,
 *            subject:"mascot-image"|"mascot-spec"|"project-assets"|"generic-placeholder"|null,
 *            placeholder:boolean, titleEmbedded:boolean}}
 */
export async function coverStatus(ws, id) {
  const job = coverRunning(ws, id)
  const meta = await readCoverMeta(ws, id)
  const has = await exists(join(projectDir(ws, id), COVER_REL))
  const status = job ? "running" : has ? "ok" : meta?.status === "failed" ? "failed" : STATUS_NONE
  const subject = COVER_SUBJECTS.includes(meta?.subject) ? meta.subject : null
  return {
    status,
    path: has ? COVER_REL : null,
    updatedAt: meta?.updatedAt ?? null,
    startedAt: job?.startedAt ?? meta?.startedAt ?? null,
    titleZone: { ...TITLE_ZONE },
    size: meta?.size ?? null,
    error: status === "failed" ? (meta?.error ?? "UNKNOWN") : null,
    subject,
    /** Bìa KHÔNG neo được vào bất cứ thứ gì của dự án — web nên dán nhãn "ảnh tạm". */
    placeholder: subject === SUBJECT_PLACEHOLDER,
    /**
     * Tên dự án ĐÃ được kẻ vào chính tấm ảnh ⇒ web KHÔNG dán overlay tên lên nữa.
     * `=== true` chứ không ép kiểu: ảnh bìa vẽ TRƯỚC bản vá 18/08 không có khoá này
     * (và `cover.json` là file người dùng sửa tay được), thiếu/rác đều phải rơi về
     * `false` — tức về đúng hành vi cũ, overlay CSS. Đoán nhầm chiều kia là chữ đúp.
     */
    titleEmbedded: meta?.titleEmbedded === true,
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
  /* Chưa cắt lần nào ⇒ không có manifest ⇒ null, KHÔNG phải lỗi: đó chính là dự án
     trắng trơn, và nhánh SUBJECT cuối đã có sẵn câu trả lời cho nó. */
  const readJson = async rel => readJsonFile(join(pdir, rel)).catch(() => null)
  const { prompt, attachments, branding, titleEmbedded } = await buildCoverPrompt({ project, contract, hasFile, readJson })

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
    subject: branding.subject, titleEmbedded,
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
        subject: branding.subject, titleEmbedded,
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
        subject: branding.subject, titleEmbedded,
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
