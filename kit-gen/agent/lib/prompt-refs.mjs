/* prompt-refs.mjs — ẢNH NÀO ĐI KÈM MỘT TẤM, VÀ ĐI BẰNG ĐƯỜNG NÀO.
 *
 * ╔══ VÌ SAO MÀN XEM TRƯỚC KHÔNG THỂ CHỈ TRẢ VỀ CHỮ ═══════════════════════════╗
 * ║ Chủ sản phẩm mở xem trước prompt của một tấm và nói: *"đúng rồi prompt      ║
 * ║ thiếu cái hiển thị ảnh này"*. Đúng theo nghĩa đen: từ 09/09/2026 mỗi ảnh    ║
 * ║ tham chiếu tự trả lời câu hỏi của mình (`attachable` trong gen.sh) — ảnh có ║
 * ║ nền trong suốt thật thì ĐÍNH THẲNG vào lời gọi image_gen, ảnh đục thì đi    ║
 * ║ qua một lượt codex TẢ THÀNH CHỮ. Nên `prompts/<job>.att` (danh sách đính    ║
 * ║ kèm) nay chỉ còn MỘT NỬA sự thật, và màn xem trước dựng trên nó hiện đúng   ║
 * ║ một nửa: tấm ảnh dáng có alpha thì thấy, tấm ảnh nhân vật đục thì biến mất  ║
 * ║ khỏi màn hình dù nó vẫn quyết định con vật được vẽ ra trông thế nào.        ║
 * ║                                                                             ║
 * ║ Nửa còn lại nằm ở `prompts/<job>.refs` — bản kê do CHÍNH gen.sh ghi ra:     ║
 * ║     mode<TAB>vai<TAB>đường dẫn                                              ║
 * ║ Đọc file ấy chứ KHÔNG dựng lại luật «đính hay tả» bằng JS: một bản sao của  ║
 * ║ luật ấy sẽ trôi khỏi bản gốc trong im lặng, đúng lúc người dùng tin màn     ║
 * ║ hình để đi sửa câu chữ. Cùng lý do với cả khối «XEM TRƯỚC PROMPT» của       ║
 * ║ `routes/contract.mjs`.                                                      ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 */
import { basename } from "node:path"

/** Dấu chỗ mà khối python để lại cho tầng bash: `{{DESC:refs/lan.png}}`. */
const DESC_MARK = /\{\{DESC:([^{}]*)\}\}/g

/** Hai lối đi của một ảnh tham chiếu. Khớp cột đầu của `prompts/<job>.refs`. */
export const REF_MODES = new Set(["attached", "described"])

/**
 * `mode<TAB>vai<TAB>đường dẫn` → `[{ mode, role, path }]`.
 *
 * Dòng lạ (thiếu cột, mode không nhận ra, đường dẫn tuyệt đối) bị BỎ, không ném:
 * engine trên máy người dùng cập nhật bằng một lượt riêng với webapp, nên một
 * bản kê đời sau chỉ được làm màn hiện THIẾU, không được làm cả cửa xem trước
 * đổ — người ta còn cần đọc phần chữ.
 */
export function parseRefsManifest(text) {
  const out = []
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.replace(/\r$/, "")
    if (!line.trim()) continue
    const [mode, role, ...rest] = line.split("\t")
    const path = rest.join("\t").trim()
    if (!REF_MODES.has(mode) || !path) continue
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) continue
    out.push({ mode, role: (role ?? "").trim(), path })
  }
  return out
}

/**
 * Câu ĐỨNG THAY cho một mô tả chưa có.
 *
 * ╔══ VÌ SAO KHÔNG ĐỂ NGUYÊN `{{DESC:refs/lan.png}}` ═════════════════════════╗
 * ║ Chủ sản phẩm nhìn thấy dấu chỗ ấy trong bản xem trước và hiểu là AI đang   ║
 * ║ bịa ra nhân vật — một hiểu lầm hoàn toàn hợp lý, vì trên màn hình chỗ ấy   ║
 * ║ trông y như một lỗi. Sự thật thì nhẹ hơn nhiều: engine chưa tả tấm ảnh này ║
 * ║ lần nào, nó sẽ tả ở lượt Vẽ đầu rồi thay chữ vào đúng chỗ đó.              ║
 * ║ Nên bản XEM TRƯỚC nói ra câu ấy bằng tiếng Việt. Prompt THẬT gửi máy vẽ    ║
 * ║ KHÔNG đổi một ký tự: dấu chỗ ở đó do `resolve_descs` của gen.sh thay, và   ║
 * ║ nó thay bằng đoạn văn thật chứ không bằng câu này.                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * Chỉ TÊN ẢNH, không đường dẫn: người đọc cần nhận ra tấm ảnh của mình, không
 * cần biết nó nằm ở thư mục nào (§4.3 cũng cấm trả path ra client).
 */
export function pendingDescLine(path) {
  return `[mô tả ảnh ${basename(String(path ?? ""))} — sẽ tự tả ở lượt Vẽ đầu]`
}

/**
 * Thay mọi dấu chỗ CÒN LẠI trong prompt bằng câu đọc được.
 *
 * "Còn lại" là chỗ đắt giá: gen.sh đã tự dán mô tả thật vào những ảnh có cache
 * còn hạn (kể cả chữ do người dùng gõ), nên dấu chỗ nào còn sót lại đúng là ảnh
 * chưa được tả — không phải đoán, mà là phán quyết của chính engine.
 *
 * @returns {{ text: string, standIn: Map<string, string> }} `standIn` = đường dẫn
 *   ảnh → đúng câu vừa được đặt vào prompt (màn hình neo vào đó để nhảy tới).
 */
export function fillDescPlaceholders(prompt) {
  const standIn = new Map()
  const text = String(prompt ?? "").replace(DESC_MARK, (_m, path) => {
    const line = pendingDescLine(path)
    standIn.set(path, line)
    return line
  })
  return { text, standIn }
}

/**
 * Mô tả đang nằm trong cache của một ảnh — `refs/<tên ảnh>.desc.txt`, bỏ dòng khoá.
 *
 * KHÔNG KIỂM HẠN Ở ĐÂY, và đó là chủ ý: hạn dùng của một mô tả (băm nội dung ảnh
 * + vai + phiên bản câu hỏi) là luật của gen.sh, có hai bản đã phải khớp nhau
 * từng nhánh (`desc_line_fresh` bên python, `desc_fresh` bên bash). Bản thứ ba
 * bằng JS là bản chắc chắn sẽ lệch. Nơi gọi chỉ đọc cache khi prompt KHÔNG còn
 * dấu chỗ cho ảnh ấy — mà không còn dấu chỗ nghĩa là chính gen.sh vừa phán "cache
 * này còn hạn" và dán nó vào. Câu trả lời đã có sẵn, chỉ cần đọc đúng chỗ.
 */
export function descCacheName(path) {
  return basename(String(path ?? "")) + ".desc.txt"
}

/** Bỏ dòng khoá `# sha256:… role:… v2` ở đầu file cache, trả phần chữ. */
export function descBody(fileText) {
  const rows = String(fileText ?? "").split("\n")
  if (!rows.length) return ""
  if (!/^#\s+sha256:/.test(rows[0] ?? "")) return ""
  return rows.slice(1).join("\n").trim()
}
