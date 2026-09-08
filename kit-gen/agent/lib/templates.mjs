/* templates.mjs — bản thiết kế lúc TẠO DỰ ÁN, và catalogue element chỉ-đọc.
 *
 * 08/09/2026 — chỉ còn MỘT đường: `blank`. Template `basic` (3 tấm / 25 ô dựng sẵn từ
 * `templates/basic.json`) đã bỏ cùng `import` và `from-project`: web chỉ gửi `"blank"`
 * (`webapp/src/features/projects/dialogs/CreateModeDialog.tsx`) vì wizard mới là nơi
 * người dùng chọn bộ khung đầu tiên — khởi tạo bằng dữ liệu mẫu chỉ khiến 25 ô mẫu bị
 * hiểu nhầm là thiết kế thật. Bộ khung mẫu cũ nay sống trong `agent/test-fixtures/
 * basic-contract.json`, dùng làm ĐỒ THỬ cho test chứ không còn là mã sản phẩm.
 *
 * `loadElementLib` KHÔNG đi theo: nó phục vụ `GET /api/element-lib` (routes/contract.mjs),
 * là catalogue chỉ-đọc mà UI đọc để người dùng chọn element (X8: element-lib.json không
 * bao giờ bị UI ghi vào). */
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { exists, readJsonFile } from "./fsx.mjs"
import { EMPTY_CONTRACT } from "./contract.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_DIR = resolve(HERE, "..", "..")

/** element-lib.json: ưu tiên bản engine trong workspace, rồi bản repo (dev). */
export async function loadElementLib(ws) {
  for (const p of [join(ws.engineDir, "element-lib.json"), join(REPO_DIR, "element-lib.json")]) {
    if (await exists(p)) {
      const lib = await readJsonFile(p)
      return { version: 1, elements: lib.elements ?? [] }
    }
  }
  return { version: 1, elements: [] }
}

export const DEFAULT_POSES = [
  "idle", "wave", "point-right", "point-left", "jump", "celebrate", "sad", "surprised",
  "thinking", "run", "sit", "sleep", "clap", "hold-gift", "hold-envelope", "thumbs-up",
  "bow", "dance", "shrug",
]

/** Contract của dự án vừa tạo: không tấm nào, đúng một phong cách do user đặt tên ở modal. */
export function buildTemplateContract(firstVariant) {
  const variant = {
    id: firstVariant.id, vi: firstVariant.vi, styleMode: "prompt",
    style: firstVariant.style ?? "",
    inspo: [],
    brand: { mode: "colors", primary: "#d42a1e", secondary: "#f5c64a", refs: [] },
    characters: [],
  }
  return { ...structuredClone(EMPTY_CONTRACT), characterPoses: [...DEFAULT_POSES], variants: [variant] }
}
