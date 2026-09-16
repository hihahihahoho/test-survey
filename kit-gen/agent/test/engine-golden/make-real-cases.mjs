/* Dựng ca golden từ ẢNH RAW THẬT của một project dev (dev-only, chạy tay).
 *
 * VÌ SAO PHẢI CÓ ẢNH THẬT bên cạnh ảnh tổng hợp: ảnh tổng hợp là hình ta tự vẽ,
 * nên nó chỉ biết những gì ta đã nghĩ tới. Màn sương α=1..3, alpha "gần đục"
 * 251..254, quầng sáng tan dần — cả ba đều được PHÁT HIỆN trên ảnh thật rồi mới
 * thành hằng số trong `slice.py`. Ba tấm ở đây là ba tấm thật, cắt bằng bản Python,
 * và bản JS phải ra đúng từng pixel.
 *
 * `styles.json` KHÔNG viết tay: nó đi qua `contractToStylesV1` của engine.mjs —
 * cùng hàm mà agent thật dùng — nên ca golden kiểm luôn cả mối nối ấy.
 *
 * Chạy: node make-real-cases.mjs <project-dir> <đích>
 */
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const { contractToStylesV1 } = await import(join(HERE, "..", "..", "lib", "engine.mjs"))

const [src, dst] = process.argv.slice(2)
if (!src || !dst) { console.error("dùng: node make-real-cases.mjs <project-dir> <đích>"); process.exit(2) }

const contract = JSON.parse(await readFile(join(src, "contract.json"), "utf8"))
const variant = contract.variants[0].id

/* TỐI ĐA BA TẤM, mỗi tấm ≤ 2 MB — giới hạn do chủ sản phẩm đặt cho fixture. */
const WANT = [
  { name: "real-ui", sheet: "ui" },
  { name: "real-ui2", sheet: "ui2" },
  { name: "real-nhan-vat2", sheet: "nhan-vat2" },
]

console.log("dựng ca ảnh thật:")
for (const { name, sheet } of WANT) {
  const raw = join(src, "raw", `${variant}-${sheet}.png`)
  const styles = contractToStylesV1(contract, [{ variant, sheet }])
  const dir = join(dst, name)
  await mkdir(join(dir, "raw"), { recursive: true })
  await copyFile(raw, join(dir, "raw", `${variant}-${sheet}.png`))
  await writeFile(join(dir, "styles.json"), JSON.stringify(styles, null, 2) + "\n")
  await writeFile(join(dir, "steps.json"), JSON.stringify([[]]))
  await writeFile(join(dir, "contract.json"), JSON.stringify(
    { schemaVersion: contract.schemaVersion ?? 4, variants: [{ id: variant }], sheets: styles.sheets }, null, 2) + "\n")
  await writeFile(join(dir, "validate-jobs.json"), JSON.stringify([`${variant}-${sheet}`]))
  console.log("  ·", name)
}
