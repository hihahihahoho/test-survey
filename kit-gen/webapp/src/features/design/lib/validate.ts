/**
 * features/design/lib/validate.ts — VALIDATE CLIENT của bản thiết kế (§3-S3.4, V-01…V-08).
 *
 * NGUỒN LUẬT LÀ ZOD CỦA R0-P2 (`lib/types/contract.ts`) — file này KHÔNG viết lại luật,
 * nó (a) chạy `contractSchema.safeParse`, (b) DỊCH issue của zod sang `Finding` có
 * `target` để hiện lỗi INLINE đúng chỗ, (c) thêm mấy luật mà schema không diễn đạt được
 * (whitelist shape, matte, cờ boolean) — những luật này rút từ engine, xem `shapes.ts`.
 *
 * HAI LUẬT VÀNG (bài học của bản vanilla, ghi ở web/js/screens/design/validate.js):
 *  1. Client PHẢI KHỚP agent (`agent/lib/validate.mjs`). Được cảnh báo THÊM, nhưng
 *     KHÔNG được CHẶN thứ agent cho qua — nếu không user ôm một contract hợp lệ mà
 *     không tài nào lưu được.
 *     ⇒ shape lạ: agent chỉ `W(...)` ⇒ ở đây cũng chỉ là CẢNH BÁO.
 *  2. `errors` chặn lưu · `warnings` KHÔNG chặn (§3.4 câu cuối).
 *
 * Đối chiếu dữ liệu thật: `styles.json` có 2 sheet trùng id (`pose-soc`,`pose-soc2`… xem
 * chú thích của R0) và 80/122 tên file không khớp V-01 vì là ô `pose`/`empty` — cả hai
 * ca đều được xử đúng ở đây (V-03 bắt, V-01 miễn).
 */
import {
  contractSchema, contractVariants, isFileNameExempt, issueRule, sheetVariantFilter,
  type Contract,
} from "@/lib/types/contract";
import { MATTE_VALUES, isKnownShape } from "./shapes";
import { isEmptyCell } from "./ops";

import {
  targetKey, type Finding, type Target, type ValidationResult,
} from "./validate-target";

export {
  targetKey, issuesFor, messageFor,
  type Finding, type Target, type ValidationResult,
} from "./validate-target";

/* ══════════ zod issue → Target ══════════ */

/**
 * `issue.path` của zod dạng `["sheets",2,"components",5,"file"]`. Dịch sang Target để
 * click vào dòng lỗi là nhảy tới đúng ô. Không dịch được thì rơi về `contract` —
 * thà hiện ở thanh Validate còn hơn nuốt mất lỗi.
 */
function pathToTarget(c: Contract, path: readonly PropertyKey[]): Target {
  const [a, i, b, j, f] = path as [unknown, number, unknown, number, unknown];
  if (a === "sheets" && typeof i === "number") {
    const sheetId = c.sheets[i]?.id ?? String(i);
    if (b === "components" && typeof j === "number") {
      return { kind: "element", sheetId, index: j, ...(typeof f === "string" ? { field: f } : {}) };
    }
    const field = typeof b === "string" ? (b === "grid" ? "grid" : b) : undefined;
    return { kind: "sheet", sheetId, ...(field ? { field } : {}) };
  }
  if ((a === "variants" || a === "styles") && typeof i === "number") {
    const list = contractVariants(c);
    const variantId = list[i]?.id ?? String(i);
    if (b === "characters" && typeof j === "number") {
      const characterId = list[i]?.characters?.[j]?.id ?? String(j);
      return { kind: "character", variantId, characterId, ...(typeof f === "string" ? { field: f } : {}) };
    }
    return { kind: "variant", variantId, ...(typeof b === "string" ? { field: b } : {}) };
  }
  return { kind: "contract" };
}

/**
 * Suy MÃ LUẬT cho issue mà schema của R0 không gắn `params.rule`.
 *
 * ĐO ĐƯỢC, không suy đoán: `contract.ts` chỉ gắn `params.rule` trong `superRefine`
 * (V-01 tên file, V-02 trùng file, V-03/V-05 TRÙNG id, V-04 số ô). Các luật diễn đạt
 * bằng `.regex()`/`.gt()` — V-03/V-05 SAI DẠNG và V-06 w,h — rơi ra với `rule = null`
 * và sẽ hiện là "SCHEMA". Thanh Validate của §3.4 phải gọi đúng tên luật, nên ta suy
 * lại từ `issue.path`. Ca test `validate.test.ts` bắt đúng chỗ này (V-03 sai dạng và
 * V-06 w=0 từng bị gán nhầm SCHEMA).
 */
function ruleFromPath(path: readonly PropertyKey[]): string | null {
  const p = path.map(String);
  const last = p[p.length - 1];
  const head = p[0];
  if (head === "sheets") {
    if (last === "id" && p.length === 3) return "V-03";
    if (last === "file") return "V-01";
    if (last === "w" || last === "h") return "V-06";
    if (last === "components") return "V-04";
  }
  if (head === "variants" || head === "styles") {
    if (last === "id") return "V-05";
    if (last === "w" || last === "h") return "V-06";
  }
  return null;
}

/** Issue về `file` của một ô mà agent MIỄN luật tên (shape `empty`/`pose`)? */
function isFileIssueOnExemptCell(c: Contract, path: readonly PropertyKey[]): boolean {
  const p = path.map(String);
  if (p[0] !== "sheets" || p[2] !== "components" || p[4] !== "file") return false;
  const sh = c.sheets[Number(p[1])];
  const cp = sh?.components[Number(p[3])];
  return isFileNameExempt(cp?.skel?.shape);
}

/* ══════════ Bộ luật ══════════ */

export interface ValidateCtx {
  /** Tên ảnh ref THẬT trên đĩa — thiếu thì V-08 không chạy (không đoán bừa là "mất ảnh"). */
  refNames?: readonly string[] | null;
  /** shape lạ học được từ /api/element-lib — client không được hẹp hơn dữ liệu thật. */
  extraShapes?: readonly string[];
}

export function validateDesign(contract: Contract | null | undefined, ctx: ValidateCtx = {}): ValidationResult {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const push = (f: Finding) => (f.severity === "error" ? errors : warnings).push(f);

  if (!contract) return finish(errors, warnings);

  /* ---- 1. Luật của schema zod (V-01..V-06 phần cấu trúc, V-02, V-03, V-04, V-05) ---- */
  const parsed = contractSchema.safeParse(contract);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // LUẬT VÀNG 1 tại chỗ: `componentSchema.file` của R0 là `z.string().min(1)`, tức
      // NGHIÊM HƠN agent — `agent/lib/validate.mjs` bỏ qua tên file của ô `empty`
      // (`if (c?.file)`), và ô trống của ta có `file: ""`. Giữ nguyên issue này sẽ khoá
      // nút Lưu vĩnh viễn với mọi sheet có ô trống. Bỏ qua đúng ca đó, không bỏ qua rộng.
      // (Đã báo R0-P2: teams/react/NEEDS-r2p1-design.md · N1.)
      if (isFileIssueOnExemptCell(contract, issue.path ?? [])) continue;
      const rule = issueRule(issue) ?? ruleFromPath(issue.path ?? []) ?? "SCHEMA";
      const target = pathToTarget(contract, issue.path ?? []);
      const f: Finding = { rule, message: issue.message, target, severity: "error" };
      // Gợi ý sửa 1 chạm cho hai luật hay gặp nhất.
      if (rule === "V-03" && target.kind === "sheet") {
        f.fix = { label: "Sửa mã sheet", kind: "slug-sheet", value: target.sheetId };
      }
      if (rule === "V-04" && target.kind === "sheet") {
        const sh = contract.sheets.find((s) => s.id === target.sheetId);
        if (sh) {
          const need = sh.grid.cols * sh.grid.rows;
          f.fix =
            sh.components.length < need
              ? { label: `Thêm ${need - sh.components.length} ô trống`, kind: "add-cells" }
              : { label: `Bỏ ${sh.components.length - need} ô cuối`, kind: "trim-cells" };
        }
      }
      if (rule === "V-01" && target.kind === "element") {
        f.fix = { label: "Đặt tên hợp lệ", kind: "slug-file" };
      }
      push(f);
    }
  }

  /* ---- 2. Luật engine mà schema không diễn đạt được ---- */
  contract.sheets.forEach((sh) => {
    const sheetId = sh.id;

    // V-07 — sheet 0 element: CẢNH BÁO, không chặn.
    if (sh.components.length === 0) {
      push({
        rule: "V-07",
        message: `Sheet «${sheetId}» chưa có element — sẽ bị bỏ qua khi sinh ảnh.`,
        target: { kind: "sheet", sheetId, field: "grid" },
        severity: "warn",
      });
    }

    // Ô trống vẫn tốn diện tích ảnh (đóng audit C5).
    const empties = sh.components.filter((c) => isEmptyCell(c)).length;
    if (empties > 0 && sh.components.length > 0) {
      const pct = Math.round((empties / sh.components.length) * 100);
      push({
        rule: "EMPTY_CELLS",
        message: `${empties} ô trống — vẫn tính vào ảnh (≈${pct}% diện tích).`,
        target: { kind: "sheet", sheetId, field: "grid" },
        severity: "warn",
      });
    }

    // sheet trỏ tới phong cách không còn tồn tại.
    const known = new Set(contractVariants(contract).map((v) => v.id));
    sheetVariantFilter(sh).forEach((vid) => {
      if (!known.has(vid)) {
        push({
          rule: "UNKNOWN_VARIANT",
          message: `Sheet «${sheetId}» trỏ tới phong cách «${vid}» không còn tồn tại.`,
          target: { kind: "sheet", sheetId, field: "variants" },
          severity: "warn",
        });
      }
    });

    sh.components.forEach((cp, index) => {
      const t = (field: string): Target => ({ kind: "element", sheetId, index, field });
      const sk = cp.skel ?? ({} as Record<string, unknown>);
      const empty = isEmptyCell(cp);

      // Whitelist shape — rút từ silhouettes.js/skeleton.py/agent. Agent chỉ CẢNH BÁO
      // shape lạ ⇒ ta cũng chỉ cảnh báo (luật vàng 1).
      if (sk.shape !== undefined && !isKnownShape(sk.shape, ctx.extraShapes ?? [])) {
        push({
          rule: "SKEL_SHAPE",
          message: `Hình khối «${String(sk.shape)}» không có trong thư viện khung xương — engine sẽ không vẽ được ô này.`,
          target: t("shape"),
          severity: "warn",
        });
      }

      // matte: slice.py chỉ hiểu glow|glass (MATTE_VALUES rút từ chính slice.py).
      const matte = (sk as { matte?: unknown }).matte;
      if (matte !== undefined && matte !== null && matte !== false && matte !== "") {
        if (!MATTE_VALUES.includes(String(matte))) {
          push({
            rule: "SKEL_MATTE",
            message: `Kiểu tách nền chỉ nhận: ${MATTE_VALUES.join(" hoặc ")}.`,
            target: t("matte"),
            severity: "error",
          });
        }
      }

      // slice9 / free / plain phải là bool.
      for (const k of ["slice9", "free", "plain"] as const) {
        const v = (sk as Record<string, unknown>)[k];
        if (v !== undefined && typeof v !== "boolean") {
          push({
            rule: "SKEL_FLAG",
            message: `Cờ ${k} chỉ nhận bật/tắt.`,
            target: t(k),
            severity: "error",
          });
        }
      }

      // Element thật mà chưa có mô tả cho AI ⇒ ảnh sẽ ra tuỳ hứng.
      if (!empty && String(cp.spec ?? "").trim() === "") {
        push({
          rule: "SPEC_EMPTY",
          message: `Element «${cp.file || `ô ${index + 1}`}» chưa có mô tả cho AI.`,
          target: t("spec"),
          severity: "warn",
        });
      }

      // Ô dáng chưa chọn dáng ⇒ engine dùng "idle" (không chặn, nhưng phải nói).
      if (String(sk.shape) === "pose" && !((sk as { pose?: string }).pose)) {
        push({
          rule: "POSE_MISSING",
          message: 'Ô dáng nhân vật chưa chọn dáng — engine sẽ dùng "Đứng thẳng".',
          target: t("pose"),
          severity: "warn",
        });
      }

      // Ô thường thiếu w/h ⇒ engine lấy 0.8×0.6.
      if (!empty && sk.shape !== "full" && (sk.w === undefined || sk.h === undefined)) {
        push({
          rule: "SKEL_WH_MISSING",
          message: "Chưa đặt chiều rộng/cao — engine sẽ dùng mặc định 0.8×0.6.",
          target: t("w"),
          severity: "warn",
        });
      }

      // V-01 nhắc lại cho ca schema đã dừng sớm (looseObject có thể không tới đây).
      if (!empty && !isFileNameExempt(sk.shape) && String(cp.file ?? "").trim() === "") {
        push({
          rule: "V-01",
          message: "Tên file: 2 số + gạch nối + chữ thường. Gợi ý: 17-btn-close",
          target: t("file"),
          severity: "error",
          fix: { label: "Đặt tên hợp lệ", kind: "slug-file" },
        });
      }
    });
  });

  /* ---- 3. V-08 — ref bị xoá nhưng còn tham chiếu (CHẶN) ---- */
  if (Array.isArray(ctx.refNames)) {
    const have = new Set(ctx.refNames.map(baseName));
    for (const use of refUsage(contract)) {
      if (use.ref === "" || have.has(baseName(use.ref))) continue;
      push({
        rule: "V-08",
        message: `Ảnh «${baseName(use.ref)}» không còn trong project nhưng vẫn đang được dùng.`,
        target: use.target,
        severity: "error",
      });
    }
  }

  return finish(dedupe(errors), dedupe(warnings));
}

/** Mọi chỗ đang tham chiếu ảnh ref — mirror `refUsage()` của agent + target để nhảy tới. */
export function refUsage(c: Contract): { ref: string; target: Target; what: string }[] {
  const out: { ref: string; target: Target; what: string }[] = [];
  c.sheets.forEach((sh) => {
    if (typeof sh.ref === "string" && sh.ref !== "") {
      out.push({ ref: sh.ref, target: { kind: "sheet", sheetId: sh.id, field: "ref" }, what: `sheet ${sh.id}` });
    }
    /* Tấm ảnh dáng ghép cũng là một chỗ DÙNG ảnh — mirror `refUsage()` của agent.
       Bỏ sót nó thì màn thiết kế báo ảnh ấy là mồ côi và mời người dùng xoá đi. */
    if (typeof sh.poseRef === "string" && sh.poseRef !== "") {
      out.push({ ref: sh.poseRef, target: { kind: "sheet", sheetId: sh.id, field: "poseRef" }, what: `ảnh dáng ${sh.id}` });
    }
    /* Bản phác bố cục của tấm nền — cùng lý do với `poseRef` ngay trên. */
    if (typeof sh.layoutRef === "string" && sh.layoutRef !== "") {
      out.push({
        ref: sh.layoutRef,
        target: { kind: "sheet", sheetId: sh.id, field: "layoutRef" },
        what: `bản phác bố cục ${sh.id}`,
      });
    }
  });
  contractVariants(c).forEach((v) => {
    for (const p of v.inspo ?? []) {
      out.push({ ref: p, target: { kind: "variant", variantId: v.id, field: "inspo" }, what: `phong cách ${v.vi || v.id}` });
    }
    for (const p of v.brand?.refs ?? []) {
      out.push({ ref: p, target: { kind: "variant", variantId: v.id, field: "brand" }, what: `brand ${v.vi || v.id}` });
    }
    for (const ch of v.characters ?? []) {
      if (typeof ch.ref === "string" && ch.ref !== "") {
        out.push({
          ref: ch.ref,
          target: { kind: "character", variantId: v.id, characterId: ch.id, field: "ref" },
          what: `nhân vật ${ch.vi || ch.id}`,
        });
      }
    }
  });
  return out;
}

const baseName = (p: string): string => {
  const s = String(p ?? "");
  const i = s.lastIndexOf("/");
  return i === -1 ? s : s.slice(i + 1);
};

/**
 * zod và luật thủ công có thể cùng bắt MỘT lỗi bằng hai câu chữ khác nhau (ví dụ ô
 * thiếu tên: schema nói "Thiếu tên file.", luật V-01 nói câu có gợi ý). Thanh Validate
 * mà đếm 2 là user đi sửa một chỗ rồi thấy số lỗi vẫn còn — mất niềm tin.
 * Gộp theo (mức · luật · chỗ), giữ bản ĐẦU TIÊN có gợi ý sửa nếu có.
 * `SCHEMA` là rổ chung nên phải kèm cả message, nếu không sẽ nuốt mất lỗi khác nhau.
 */
function dedupe(list: Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  for (const f of list) {
    const k = `${f.severity}|${f.rule}|${targetKey(f.target)}${f.rule === "SCHEMA" ? `|${f.message}` : ""}`;
    const cur = best.get(k);
    if (!cur || (!cur.fix && f.fix)) best.set(k, f);
  }
  return [...best.values()];
}

function finish(errors: Finding[], warnings: Finding[]): ValidationResult {
  const byTarget = new Map<string, Finding[]>();
  for (const f of [...errors, ...warnings]) {
    // Gắn vào cả khoá CÓ field và khoá KHÔNG field: panel hỏi theo field, còn cây/lưới
    // hỏi theo cả sheet ("sheet này có lỗi không").
    for (const key of [targetKey(f.target), targetKey({ ...f.target, field: undefined } as Target)]) {
      const cur = byTarget.get(key);
      if (cur) {
        if (!cur.includes(f)) cur.push(f);
      } else byTarget.set(key, [f]);
    }
  }
  return { errors, warnings, byTarget, ok: errors.length === 0 };
}

/** Câu ngắn cho tooltip nút Lưu khi bị chặn (§3.4: "kèm tooltip lý do"). */
export function blockingSummary(r: ValidationResult): string | null {
  const n = r.errors.length;
  if (n === 0) return null;
  return n === 1 ? "Còn 1 lỗi phải sửa trước khi lưu." : `Còn ${n} lỗi phải sửa trước khi lưu.`;
}

/** Đếm lỗi/cảnh báo của riêng một sheet — cây thiết kế chấm dấu đỏ theo số này. */
export function countForSheet(r: ValidationResult, sheetId: string): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of [...r.errors, ...r.warnings]) {
    const t = f.target;
    const hit = (t.kind === "sheet" || t.kind === "element") && t.sheetId === sheetId;
    if (!hit) continue;
    if (f.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/** Lỗi của một ô cụ thể — lưới ô viền đỏ theo hàm này. */
export function cellSeverity(r: ValidationResult, sheetId: string, index: number): "error" | "warn" | null {
  const list = r.byTarget.get(targetKey({ kind: "element", sheetId, index })) ?? [];
  if (list.some((f) => f.severity === "error")) return "error";
  return list.length > 0 ? "warn" : null;
}
