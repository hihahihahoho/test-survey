/**
 * BỘ QUÉT TỪ CẤM §5.4 — dùng bởi `banned-words.test.ts`.
 *
 * ⚠️ KHÔNG phải file test (không có `.test.ts`) và **không bao giờ được import từ mã app**:
 * nó đọc `node:fs`. Đặt trong `__tests__/` để chắc chắn không lọt vào bundle runtime.
 *
 * PHẠM VI QUÉT — nói rõ vì đây là chỗ dễ tự lừa mình nhất:
 *  · CHỈ quét **chuỗi ký tự** (`"..."`, `'...'`, `` `...` ``) có chứa **dấu tiếng Việt**.
 *    Lý do: đó là xấp xỉ gần nhất với "chữ hiện ra cho user" mà không cần render.
 *  · Vì vậy bộ quét **KHÔNG thấy**: chữ tiếng Việt không dấu ("Chon tat ca"), chữ ghép từ
 *    biến, chữ đến từ file khác, và chữ trong JSX text node không nằm trong dấu nháy.
 *    Đây là GIỚI HẠN THẬT, không phải bỏ sót — Q1 vẫn phải soi mắt.
 *  · Bỏ qua: `features/design/**` (là màn «Nâng cao», §0-L3 cho phép), thư mục `__tests__`,
 *    file `__preview__`, và dòng có chú thích `// kg-allow-jargon: <lý do>`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BANNED_WORDS } from "../lib/copy";

export interface BannedHit {
  file: string;
  word: string;
  text: string;
}

const VI_DIACRITIC =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Chuỗi trong mã nguồn. Không cần parser đầy đủ — mục tiêu là quét, không phải biên dịch. */
const STRING_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/** Thoát khỏi «lời khai»: dòng nào xin miễn phải ghi lý do, và lý do được in ra báo cáo. */
const ALLOW_RE = /kg-allow-jargon:/;

export const SCAN_EXCLUDE = [
  "src/features/design/", // màn «Nâng cao» — nơi duy nhất chữ kỹ thuật được sống đầy đủ
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...listFiles(p));
    } else if (/\.tsx?$/.test(p) && !/__preview__/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

const EN_WORDS = BANNED_WORDS.filter((w) => /^[a-z-]+$/.test(w));
const VI_PHRASES = BANNED_WORDS.filter((w) => !/^[a-z-]+$/.test(w));

export function scanBannedWords(root = "src/features"): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const file of listFiles(root)) {
    if (SCAN_EXCLUDE.some((x) => file.includes(x))) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (const [i, line] of lines.entries()) {
      if (ALLOW_RE.test(line)) continue;
      // Xin miễn bằng chú thích ĐẶT TRÊN dòng cần miễn. Đi ngược qua CẢ KHỐI chú thích
      // liền kề (một lời giải thích thường dài hơn một dòng), dừng ngay khi gặp dòng mã.
      let waived = false;
      for (let k = i - 1; k >= 0; k -= 1) {
        const prev = (lines[k] ?? "").trim();
        if (!prev.startsWith("//") && !prev.startsWith("*") && !prev.startsWith("/*")) break;
        if (ALLOW_RE.test(prev)) {
          waived = true;
          break;
        }
      }
      if (waived) continue;
      for (const m of line.matchAll(STRING_RE)) {
        const raw = m[0];
        const inner = raw.slice(1, -1);
        if (!VI_DIACRITIC.test(inner)) continue;
        const low = inner.toLowerCase();
        for (const w of EN_WORDS) {
          if (new RegExp(`(^|[^a-z-])${w}([^a-z-]|$)`).test(low)) {
            hits.push({ file, word: w, text: inner.slice(0, 100) });
          }
        }
        for (const p of VI_PHRASES) {
          if (low.includes(p)) hits.push({ file, word: p, text: inner.slice(0, 100) });
        }
      }
    }
  }
  return hits;
}

/** Gom theo file để báo cáo đọc được và để đặt ngưỡng chống-tăng theo từng vùng. */
export function groupByFile(hits: readonly BannedHit[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of hits) out[h.file] = (out[h.file] ?? 0) + 1;
  return out;
}
