/* prompt-refs.mjs — ẢNH NÀO ĐI KÈM MỘT TẤM, VÀ VỚI VAI GÌ.
 *
 * ╔══ VÌ SAO MÀN XEM TRƯỚC KHÔNG THỂ CHỈ TRẢ VỀ CHỮ ═══════════════════════════╗
 * ║ Chủ sản phẩm mở xem trước prompt của một tấm và nói: *"đúng rồi prompt      ║
 * ║ thiếu cái hiển thị ảnh này"*. Khối ảnh dưới prompt đọc `prompts/<job>.att`  ║
 * ║ — một cột đường dẫn trần — nên nó bày được tấm ảnh ra nhưng không nói được  ║
 * ║ tấm nào là ảnh nhân vật, tấm nào là ảnh dáng, tấm nào là logo.              ║
 * ║                                                                             ║
 * ║ Vai nằm ở `prompts/<job>.refs`, bản kê do CHÍNH gen.sh ghi ra:              ║
 * ║     vai<TAB>đường dẫn                                                       ║
 * ║ Đọc file ấy chứ KHÔNG suy lại thứ tự vai bằng JS: một bản sao của luật ấy   ║
 * ║ sẽ trôi khỏi bản gốc trong im lặng, vì engine trên máy người dùng cập nhật  ║
 * ║ bằng một lượt riêng với webapp. Cùng lý do với cả khối «XEM TRƯỚC PROMPT»   ║
 * ║ của `routes/contract.mjs`.                                                  ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * (Bản 09/09/2026 của file này còn mang một cột `mode` — «đính kèm» hay «tả bằng
 *  chữ». Đường tả-bằng-chữ đã gỡ: mọi ảnh nay đều được đính thẳng, xem khối «ĐÍNH
 *  ẢNH LÀM MẤT NỀN TRONG SUỐT» ở gen.sh. Bản kê vì thế chỉ còn hai cột.)
 */

/**
 * `vai<TAB>đường dẫn` → `[{ role, path }]`.
 *
 * Dòng lạ (thiếu cột, đường dẫn tuyệt đối) bị BỎ, không ném: engine trên máy người
 * dùng cập nhật bằng một lượt riêng với webapp, nên một bản kê đời khác chỉ được
 * làm màn hiện THIẾU, không được làm cả cửa xem trước đổ — người ta còn cần đọc
 * phần chữ. Bản kê ba cột của engine 09/09/2026 rơi vào đúng cửa ấy: cột đầu của
 * nó là `attached`/`described` chứ không phải một vai, nên dòng vẫn đọc được đường
 * dẫn ở cột cuối và vai chỉ bị bỏ trống.
 */
export function parseRefsManifest(text) {
  const out = []
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.replace(/\r$/, "")
    if (!line.trim()) continue
    const cols = line.split("\t")
    if (cols.length < 2) continue
    const path = cols[cols.length - 1].trim()
    /* Bản kê ba cột đời cũ: `mode<TAB>vai<TAB>path`. Vai của nó nằm ở cột giữa. */
    const role = (cols.length >= 3 ? cols[1] : cols[0]).trim()
    if (!path) continue
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) continue
    out.push({ role: REF_ROLES.has(role) ? role : "", path })
  }
  return out
}

/** Vai mà gen.sh biết nói. Vai lạ về chuỗi rỗng — web có chữ trung tính cho nó. */
export const REF_ROLES = new Set(["character", "pose", "layout", "brand", "style"])
