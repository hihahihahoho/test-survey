/* pyjson.mjs — ĐỌC/GHI JSON ĐÚNG NHƯ `json` CỦA PYTHON.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG THẲNG JSON.parse / JSON.stringify ══════════════════════╗
 * ║ `kits/manifest.json` là HỢP ĐỒNG giữa engine và webapp, và bản JS phải ghi   ║
 * ║ ra file BẰNG CHỮ với bản Python — nếu không thì "port xong" chỉ có nghĩa là  ║
 * ║ "không ai so". Ba chỗ JSON của JS khác JSON của Python, và cả ba đều nằm     ║
 * ║ đúng trong dữ liệu ta đang ghi:                                             ║
 * ║                                                                             ║
 * ║  ① SỐ THỰC TRÒN. Python phân biệt `int` với `float`: `1.0` ghi ra là `1.0`,  ║
 * ║    JS chỉ có một loại số nên `JSON.stringify(1.0)` ra `1`. Trong manifest    ║
 * ║    thật có `"coreCoverage": 1.0`, `"drawScale": 1.0`, `"value": 0.0`,        ║
 * ║    `"safeAspect": 1.0` — bốn khoá webapp đang đọc. Nên số thực phải MANG     ║
 * ║    THEO NHÃN: `F(x)`.                                                       ║
 * ║  ② THỨ TỰ KHOÁ. `JSON.parse` của JS xếp mọi khoá "giống số nguyên" lên đầu   ║
 * ║    object (`{"2":…, "a":…}` → `2` trước), Python giữ nguyên thứ tự file.     ║
 * ║    `manifest.styles` khoá bằng id variant do NGƯỜI DÙNG đặt — một variant    ║
 * ║    tên `"2"` là đủ để hai bên ghi ra hai file khác nhau. Nên object đọc ra   ║
 * ║    là `Map`, không phải object.                                             ║
 * ║  ③ int/float ĐỌC VÀO. Lượt cắt lũy tiến ĐỌC LẠI manifest cũ rồi ghi lại      ║
 * ║    phần giữ nguyên. `1.0` trong file phải quay ra `1.0`, nên bộ đọc cũng     ║
 * ║    phải nhớ nhãn: có dấu chấm / số mũ ⇒ float.                              ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 */

/** Nhãn "đây là số THỰC của Python" — quyết định `1` hay `1.0` lúc ghi ra. */
export class PyFloat {
  constructor(v) { this.v = v }
  valueOf() { return this.v }
}
export const F = v => new PyFloat(v)
/** Giá trị số trần của `x`, dù nó là số thường hay `PyFloat`. */
export const num = x => (x instanceof PyFloat ? x.v : x)

/* ── LÀM TRÒN KIỂU PYTHON ─────────────────────────────────────────────────── */

/** Chuỗi thập phân CHÍNH XÁC của một double (không phải bản đã làm tròn). */
function exactDecimal(x) {
  // `toFixed(100)` là phép làm tròn ĐÚNG theo giá trị thật của double (spec ECMA);
  // với mọi giá trị ta ghi (|x| < 10^3) khai triển thập phân của double kết thúc
  // trước chữ số thứ 100, nên chuỗi này là chính xác chứ không phải xấp xỉ.
  return Math.abs(x).toFixed(100)
}

/**
 * `round(x, n)` của Python: LÀM TRÒN VỀ SỐ CHẴN khi đúng nửa chừng.
 *
 * `toFixed` của JS thì làm tròn RA XA SỐ 0 ở ca hoà (spec: "pick the larger n"),
 * và ca hoà KHÔNG hiếm ở đây: mọi giá trị dạng m/32 với m lẻ (vd 113/32 = 3,53125
 * — một tỉ lệ `safe.w/safe.h` hoàn toàn có thật) đều hoà đúng ở chữ số thứ 5.
 * Python trả 3,5312 còn `toFixed(4)` trả 3,5313, và con số đó đi thẳng vào manifest.
 */
export function pyRound(x, n = 0) {
  if (!Number.isFinite(x)) return x
  if (Math.abs(x) >= 1e21) return x
  const neg = x < 0
  const s = exactDecimal(x)
  const dot = s.indexOf(".")
  const digits = s.slice(0, dot) + s.slice(dot + 1)
  const keep = dot + n
  const kept = digits.slice(0, keep)
  const rest = digits.slice(keep)
  let up = false
  const first = rest.charCodeAt(0) - 48
  if (first > 5) up = true
  else if (first === 5) {
    if (/[1-9]/.test(rest.slice(1))) up = true
    else up = (kept.charCodeAt(keep - 1) - 48) % 2 === 1      // hoà ⇒ về số CHẴN
  }
  let big = BigInt(kept === "" ? "0" : kept)
  if (up) big += 1n
  let out
  if (n <= 0) {
    out = Number(big)
  } else {
    const ds = big.toString().padStart(n + 1, "0")
    out = Number(ds.slice(0, ds.length - n) + "." + ds.slice(ds.length - n))
  }
  return neg ? -out : out
}

/** `format(x, ".<prec>f")` của Python — cũng là làm tròn về số chẵn. */
export function pyFormatF(x, prec) {
  if (!Number.isFinite(x)) return String(x)
  const r = pyRound(x, prec)
  const neg = r < 0 || Object.is(r, -0)
  const a = Math.abs(r).toFixed(prec)
  return (neg ? "-" : "") + a
}

/** `format(x, ".0%")` của Python: nhân 100 rồi làm tròn về số chẵn, thêm `%`. */
export function pyPercent(x, prec = 0) {
  return pyFormatF(x * 100, prec) + "%"
}

/**
 * `repr(float)` của Python. Khác `String(x)` của JS ở đúng hai chỗ, và cả hai đều
 * đổi được chữ trong manifest: số thực TRÒN có đuôi `.0`, và ngưỡng chuyển sang
 * ký hiệu mũ là 1e-4 / 1e16 (JS là 1e-7 / 1e21).
 */
export function pyRepr(x) {
  if (Number.isNaN(x)) return "NaN"
  if (!Number.isFinite(x)) return x > 0 ? "Infinity" : "-Infinity"
  const a = Math.abs(x)
  if (a !== 0 && (a < 1e-4 || a >= 1e16)) {
    const [m, e] = x.toExponential().split("e")
    const sign = e[0] === "-" ? "-" : "+"
    const dig = e.replace(/^[-+]/, "").padStart(2, "0")
    return `${m.includes(".") ? m : m + ".0"}e${sign}${dig}`
  }
  if (Number.isInteger(x)) return (Object.is(x, -0) ? "-0" : String(x)) + ".0"
  return String(x)
}

/** `str(v)` của Python cho những giá trị đi vào stdout của slice.py. */
export function pyStr(v) {
  if (v === null || v === undefined) return "None"
  if (v instanceof PyFloat) return pyRepr(v.v)
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : pyRepr(v)
  if (typeof v === "boolean") return v ? "True" : "False"
  // `str([…])` của Python gọi `repr()` cho TỪNG PHẦN TỬ, nên chuỗi có nháy đơn:
  // `str(['02-trong'])` ra `['02-trong']`, không phải `[02-trong]`. Dòng log
  // «Ô TRỐNG: …» của slice.py đi qua đúng đường này.
  if (Array.isArray(v)) return "[" + v.map(e => (typeof e === "string" ? pyReprStr(e) : pyStr(e))).join(", ") + "]"
  if (typeof v === "string") return v
  return String(v)
}

/** `repr(x)` cho chuỗi — Python thích nháy đơn khi chuỗi không chứa nháy đơn. */
export function pyReprStr(s) {
  const body = String(s).replace(/\\/g, "\\\\")
  if (!body.includes("'")) return "'" + body.replace(/\n/g, "\\n") + "'"
  if (!body.includes('"')) return '"' + body.replace(/\n/g, "\\n") + '"'
  return "'" + body.replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'"
}

/* ── GHI ──────────────────────────────────────────────────────────────────── */

function dumpValue(v, indent, level, out) {
  // KHÔNG CÓ indent ⇒ dấu phân cách MẶC ĐỊNH của Python là `", "` (có dấu cách),
  // khác `JSON.stringify` (không cách). `validate_output_geometry.py` in ra đúng
  // dạng ấy và agent đọc lại chuỗi đó, nên một dấu cách cũng là khác file.
  const comma = indent ? "," : ", "
  const pad = indent ? "\n" + " ".repeat(indent * (level + 1)) : ""
  const padEnd = indent ? "\n" + " ".repeat(indent * level) : ""
  if (v === null || v === undefined) return out.push("null")
  if (v instanceof PyFloat) return out.push(pyRepr(v.v))
  if (typeof v === "boolean") return out.push(v ? "true" : "false")
  if (typeof v === "number") return out.push(Number.isInteger(v) ? String(v) : pyRepr(v))
  if (typeof v === "string") return out.push(JSON.stringify(v))
  if (Array.isArray(v)) {
    if (!v.length) return out.push("[]")
    out.push("[")
    v.forEach((item, i) => {
      if (i) out.push(comma)
      out.push(pad)
      dumpValue(item, indent, level + 1, out)
    })
    out.push(padEnd, "]")
    return
  }
  const entries = v instanceof Map ? [...v.entries()] : Object.entries(v)
  if (!entries.length) return out.push("{}")
  out.push("{")
  entries.forEach(([k, val], i) => {
    if (i) out.push(comma)
    out.push(pad, JSON.stringify(String(k)), ": ")
    dumpValue(val, indent, level + 1, out)
  })
  out.push(padEnd, "}")
}

/** `json.dumps(obj, indent=…, ensure_ascii=False)`. `indent=0` ⇒ một dòng. */
export function pyDumps(value, indent = 0) {
  const out = []
  dumpValue(value, indent, 0, out)
  return out.join("")
}

/* ── ĐỌC ──────────────────────────────────────────────────────────────────── */

/** `json.loads` giữ THỨ TỰ KHOÁ (object → `Map`) và giữ nhãn int/float. */
export function pyLoads(text) {
  let i = 0
  const s = String(text)
  const err = m => { throw new SyntaxError(`${m} ở vị trí ${i}`) }
  const ws = () => { while (i < s.length && " \t\n\r".includes(s[i])) i++ }
  function value() {
    ws()
    const c = s[i]
    if (c === "{") return object()
    if (c === "[") return array()
    if (c === '"') return string()
    if (s.startsWith("true", i)) { i += 4; return true }
    if (s.startsWith("false", i)) { i += 5; return false }
    if (s.startsWith("null", i)) { i += 4; return null }
    return number()
  }
  function object() {
    i++
    const m = new Map()
    ws()
    if (s[i] === "}") { i++; return m }
    for (;;) {
      ws()
      if (s[i] !== '"') err("chờ khoá chuỗi")
      const k = string()
      ws()
      if (s[i] !== ":") err("chờ ':'")
      i++
      m.set(k, value())
      ws()
      if (s[i] === ",") { i++; continue }
      if (s[i] === "}") { i++; return m }
      err("chờ ',' hoặc '}'")
    }
  }
  function array() {
    i++
    const a = []
    ws()
    if (s[i] === "]") { i++; return a }
    for (;;) {
      a.push(value())
      ws()
      if (s[i] === ",") { i++; continue }
      if (s[i] === "]") { i++; return a }
      err("chờ ',' hoặc ']'")
    }
  }
  function string() {
    i++
    let out = ""
    for (;;) {
      const c = s[i]
      if (c === undefined) err("chuỗi cụt")
      if (c === '"') { i++; return out }
      if (c === "\\") {
        i++
        const e = s[i++]
        if (e === "u") { out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4 }
        else out += { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }[e] ?? e
        continue
      }
      out += c
      i++
    }
  }
  function number() {
    const start = i
    if (s[i] === "-" || s[i] === "+") i++
    while (i < s.length && /[0-9]/.test(s[i])) i++
    let isFloat = false
    if (s[i] === ".") { isFloat = true; i++; while (i < s.length && /[0-9]/.test(s[i])) i++ }
    if (s[i] === "e" || s[i] === "E") {
      isFloat = true; i++
      if (s[i] === "-" || s[i] === "+") i++
      while (i < s.length && /[0-9]/.test(s[i])) i++
    }
    const lit = s.slice(start, i)
    if (!lit || !/[0-9]/.test(lit)) err("số không đọc được")
    return isFloat ? F(Number(lit)) : Number(lit)
  }
  const v = value()
  ws()
  if (i !== s.length) err("còn rác sau giá trị JSON")
  return v
}
