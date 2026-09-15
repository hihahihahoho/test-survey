/**
 * figma-lab.ts — **THÍ NGHIỆM MỘT LẦN DÁN**: N cách viết CSS, một cú Ctrl/Cmd+V.
 *
 * ╔══ CÂU HỎI ĐANG MỞ (15/09/2026) ═══════════════════════════════════════════╗
 * ║ `figma-node.ts` dựng hai khung lồng nhau, ảnh là fill của khung trong, cỡ  ║
 * ║ và độ lệch viết bằng `%` — với hy vọng bên nhận đọc ra `Constraints =      ║
 * ║ Scale`. Chủ sản phẩm dán thử: ra **Left / Top**. Tức lá bài `%` KHÔNG đủ,  ║
 * ║ và ba câu còn chưa ai trả lời được:                                       ║
 * ║   ① CSS nào ⇒ constraint SCALE (hoặc LEFT_RIGHT / CENTER)?                 ║
 * ║   ② CSS nào ⇒ khoá tỉ lệ (`constrainProportions`)?                        ║
 * ║   ③ CSS nào ⇒ chế độ fill Crop / Fill / Fit?                              ║
 * ║ Phần dịch CSS → node nằm TRONG Figma desktop: không đọc được từ đây, và    ║
 * ║ không có Figma trên máy này. Thứ duy nhất làm được là DỌN SẴN MỘT PHÉP ĐO: ║
 * ║ cùng một ảnh, cùng sáu con số, viết ra N cách khác nhau, xếp thành hàng    ║
 * ║ ngang, dán MỘT LẦN rồi chụp panel Design của từng khung.                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── BẢNG BIẾN THỂ — MÃ · KHAI GÌ · CẦN NHÌN GÌ SAU KHI DÁN ────────────────┐
 * │ A pct        · đúng bản đang chạy (`renderSpec`): `%` cả bốn cạnh.        │
 * │                → MỐC SO SÁNH. Đã biết: Constraints ra Left / Top.        │
 * │ B left-right · khung trong khai `left`+`right`+`top`+`bottom` (px), KHÔNG │
 * │                width/height. → Left & Right / Top & Bottom?              │
 * │ C pct-inset  · y hệt B nhưng viết bằng `inset` theo `%`.                  │
 * │                → CHỨNG: encoder resolve `left/right` ra px (không có kênh │
 * │                  giá trị khai báo cho inset, xem ghi chú ① bên dưới) nên  │
 * │                  B và C phải ra CÙNG một kết quả. Khác nhau ⇒ giả thuyết  │
 * │                  về `computedStyles` sai từ gốc.                          │
 * │ D scale-transform · width/height px + `transform:scale(1)` + origin 0 0.  │
 * │                → có importer suy SCALE từ ma trận. Có đọc không?          │
 * │ E center     · neo bằng TÂM: left/top = tâm thật (%) + `translate(-50%,   │
 * │                -50%)`. → Center / Center?                                 │
 * │ F img-cover  · quay lại node `<img>` thật, `object-fit:cover`. → fill mode│
 * │                ra Fill?                                                   │
 * │ G img-contain· `<img>` + `object-fit:contain`. → Fit?                     │
 * │ H bg-cover   · như A nhưng `background-size:cover`. → Fill?               │
 * │ I bg-px      · MỘT khung duy nhất (không lồng), ảnh là nền với            │
 * │                `background-size:<w>px <h>px` + `background-position:<x>px │
 * │                <y>px`. → Crop kèm ma trận? Đây là cách viết gần nghĩa     │
 * │                "cắt cúp" nhất mà CSS có.                                  │
 * │ J aspect-only· khung NGOÀI chỉ khai `width` + `aspect-ratio`, height auto.│
 * │                → có khoá tỉ lệ không?                                     │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌── ĐÃ LOẠI: `K aspect-attr` — ENCODER KHÔNG CHỞ `data-*` ─────────────────┐
 * │ Đọc thẳng `vendor/figma-h2d/figma-h2d.global.js`, không đoán:             │
 * │ `pickAttributes` (`:907-919`) chỉ giữ khoá nằm trong `ATTR_ALLOWLIST`     │
 * │ (`:538` — alt, checked, currentSrc, disabled, for, href, id, multiple,    │
 * │ placeholder, poster, readonly, rel, required, role, selected, target,     │
 * │ title, type, value) **hoặc** bắt đầu bằng `aria-`. `data-aspect-ratio` /  │
 * │ `data-constrain-proportions` rơi hết ở đó ⇒ biến thể K không bao giờ rời  │
 * │ khỏi máy này. (Cửa `data-*` duy nhất còn lại là `kgComponentMarker`       │
 * │ `:920-945`: nó đòi `data-slot` và ghi vào `owningReactComponent` — một    │
 * │ trường TÊN COMPONENT, không phải kênh hình học. Không mượn.)              │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌── ① VÌ SAO CHÍN BIẾN THỂ CÒN LẠI CHẮC CHẮN QUA ĐƯỢC ENCODER ─────────────┐
 * │ `extractStyles` (`:541-587`) duyệt `STYLE_DEFAULTS` (~150 khoá) và giữ    │
 * │ MỌI khoá có giá trị computed khác mặc định. Đã soi từng khoá của bảng đó: │
 * │ `left/top/right/bottom` (`auto`), `aspectRatio` (`auto`), `objectFit`     │
 * │ (`fill`), `backgroundSize` (`auto`), `backgroundPositionX/Y` (`0%`),      │
 * │ `transform` (`none`), `transformOrigin` (`auto`) — có đủ. Nên chín biến   │
 * │ thể đều đi được vào payload.                                              │
 * │ NGƯỢC LẠI, hai chỗ KHÔNG có kênh riêng, và đó chính là phép đo:           │
 * │  · `computedStyles` (giá trị KHAI BÁO) chỉ chở `SIZING_PROPS` +           │
 * │    `GRID_PROPS` + margin auto (`:555-580`). Không có inset, không có       │
 * │    transform ⇒ B/C/E gửi đi px đã resolve, không gửi `%`.                 │
 * │  · Khai `width:auto` ⇒ encoder XOÁ hẳn khoá `width` khỏi `styles`         │
 * │    (`:560`). Đó là lý do B/C (không width/height) và J (không height) là   │
 * │    những biến thể DUY NHẤT nói được câu "cỡ này không đóng cứng".          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌── BẪY ĐÃ BIẾT, GHI RA ĐỂ NGƯỜI ĐỌC ẢNH CHỤP KHÔNG KẾT LUẬN NHẦM ─────────┐
 * │ D và E mang `transform`, mà `measureSize` (`:798-802`) đổi sang           │
 * │ `offsetWidth/offsetHeight` — SỐ NGUYÊN — ngay khi thấy transform. Hai      │
 * │ khung ấy vì thế có thể lệch tới 1px so với A. Lệch đó là của phép đo,      │
 * │ không phải của Figma.                                                     │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * KHÔNG đổi một byte nào của đường copy thật: file này chỉ ĐỌC `FigmaNodeSpec`,
 * mượn `mountStage`/`renderSpec`/`pctOf` của `figma-node.ts` và dựng sân khấu của
 * riêng nó. Nút gọi tới đây chỉ sống ở bản dev (`figmaLabOn`).
 */
import { loadFigmaH2D, type H2DDocument } from "@/vendor/figma-h2d";
import { stripPageTitle } from "@/features/kit/lib/figma-kit-doc";
import { IMAGE_LAYER_NAME, mountStage, pctOf, renderSpec, type FigmaNodeSpec } from "./figma-node";

/** Nguồn ghi vào metadata payload — để một lượt dán thí nghiệm không bị đọc nhầm thành lượt dán thật. */
export const LAB_SOURCE = "kitgen-figma-lab";

/** Khoảng trống giữa hai khung trên sân khấu (px CSS) — đủ rộng để phần ảnh tràn ra không chạm nhau. */
export const LAB_GAP = 160;

/* ══════════════════════════════════════════════════════════════════════════
   ① CỜ DEV — nút này KHÔNG được có mặt ở bản người dùng cầm.
   ══════════════════════════════════════════════════════════════════════════ */

/** Query bật tay ở bản đã build: `?lab=figma`. */
export const LAB_QUERY_KEY = "lab";
export const LAB_QUERY_VALUE = "figma";

/**
 * Hàm THUẦN để test được cả hai phía của cái cổng — `import.meta.env.DEV` là hằng
 * số do trình đóng gói thay lúc build, không đổi được lúc chạy test.
 */
export function labFlagOn(dev: boolean, search: string): boolean {
  if (dev) return true;
  try {
    return new URLSearchParams(search).get(LAB_QUERY_KEY) === LAB_QUERY_VALUE;
  } catch {
    return false;
  }
}

/** Cổng thật của giao diện: bản dev, hoặc bản đã build mở bằng `?lab=figma`. */
export function figmaLabOn(): boolean {
  return labFlagOn(
    import.meta.env.DEV === true,
    typeof location === "undefined" ? "" : location.search,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ② CHÍN CÁCH VIẾT CÙNG MỘT Ô
   ══════════════════════════════════════════════════════════════════════════ */

export interface LabVariant {
  /** Một chữ cái — để đối chiếu ảnh chụp với bảng trên đầu file. */
  code: string;
  /** Tên khung ngoài, đọc thẳng trong panel Layers của Figma. */
  label: string;
  /** Dựng khung ngoài (đã gắn vào sân khấu) tại toạ độ `at`. */
  build(spec: FigmaNodeSpec, imageUrl: string, stage: HTMLElement, at: { x: number; y: number }): HTMLElement;
}

/** Nền ảnh trải kín khung — cùng ba khoá mà đường thật đang dùng. */
function fill(imageUrl: string, size: string, position?: string): string {
  return `background-image:url("${imageUrl}");background-size:${size};background-repeat:no-repeat`
    + (position === undefined ? "" : `;background-position:${position}`);
}

/** Khung NGOÀI của một biến thể. `height` vắng ⇒ để trình duyệt suy từ `aspect-ratio`. */
function outer(spec: FigmaNodeSpec, label: string, at: { x: number; y: number }, withHeight = true): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "safe-frame";
  el.setAttribute("aria-label", label);
  el.style.cssText =
    `position:absolute;left:${at.x}px;top:${at.y}px;width:${spec.frame.w}px;`
    + (withHeight ? `height:${spec.frame.h}px;` : "")
    + `aspect-ratio:${spec.frame.w} / ${spec.frame.h}`;
  return el;
}

/** Khung TRONG — mọi biến thể đều đặt tên nó giống hệt đường thật để so được. */
function inner(css: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-label", IMAGE_LAYER_NAME);
  el.style.cssText = css;
  return el;
}

/** Khung trong của bản đang chạy: cỡ và độ lệch bằng `%`, nền trải kín. */
function pctInner(spec: FigmaNodeSpec, imageUrl: string, size = "100% 100%"): HTMLDivElement {
  return inner(
    `position:absolute;left:${pctOf(spec.image.x, spec.frame.w)};top:${pctOf(spec.image.y, spec.frame.h)};`
    + `width:${pctOf(spec.image.w, spec.frame.w)};height:${pctOf(spec.image.h, spec.frame.h)};`
    + `aspect-ratio:${spec.image.w} / ${spec.image.h};${fill(imageUrl, size)}`,
  );
}

/** Mép phải/dưới còn lại của khung ngoài — số ÂM khi ảnh tràn ra ngoài, đúng như đời thật. */
const rightOf = (spec: FigmaNodeSpec) => spec.frame.w - (spec.image.x + spec.image.w);
const bottomOf = (spec: FigmaNodeSpec) => spec.frame.h - (spec.image.y + spec.image.h);

/** `<img>` thật, hình học y hệt `pctInner` — chỉ khác ở chỗ ai quyết định cách trải ảnh. */
function imgInner(spec: FigmaNodeSpec, imageUrl: string, objectFit: string): HTMLImageElement {
  const el = document.createElement("img");
  el.setAttribute("aria-label", IMAGE_LAYER_NAME);
  el.alt = IMAGE_LAYER_NAME;
  el.src = imageUrl;
  el.style.cssText =
    `position:absolute;left:${pctOf(spec.image.x, spec.frame.w)};top:${pctOf(spec.image.y, spec.frame.h)};`
    + `width:${pctOf(spec.image.w, spec.frame.w)};height:${pctOf(spec.image.h, spec.frame.h)};`
    + `aspect-ratio:${spec.image.w} / ${spec.image.h};object-fit:${objectFit}`;
  return el;
}

/** Ghép khung ngoài + khung trong vào sân khấu. */
function stack(el: HTMLElement, child: HTMLElement, stage: HTMLElement): HTMLElement {
  el.appendChild(child);
  stage.appendChild(el);
  return el;
}

export const LAB_VARIANTS: readonly LabVariant[] = [
  {
    code: "A", label: "A pct",
    /* Gọi THẲNG `renderSpec` chứ không chép lại: mốc so sánh phải là đúng thứ
       người dùng đang dán, kể cả nếu mai này đường thật đổi cách viết. */
    build: (spec, url, stage, at) => renderSpec({ ...spec, name: "A pct" }, url, stage, at),
  },
  {
    code: "B", label: "B left-right",
    build: (spec, url, stage, at) => stack(
      outer(spec, "B left-right", at),
      inner(
        `position:absolute;left:${spec.image.x}px;top:${spec.image.y}px;`
        + `right:${rightOf(spec)}px;bottom:${bottomOf(spec)}px;${fill(url, "100% 100%")}`,
      ),
      stage,
    ),
  },
  {
    code: "C", label: "C pct-inset",
    build: (spec, url, stage, at) => stack(
      outer(spec, "C pct-inset", at),
      inner(
        `position:absolute;inset:${pctOf(spec.image.y, spec.frame.h)} ${pctOf(rightOf(spec), spec.frame.w)} `
        + `${pctOf(bottomOf(spec), spec.frame.h)} ${pctOf(spec.image.x, spec.frame.w)};${fill(url, "100% 100%")}`,
      ),
      stage,
    ),
  },
  {
    code: "D", label: "D scale-transform",
    build: (spec, url, stage, at) => stack(
      outer(spec, "D scale-transform", at),
      inner(
        `position:absolute;left:${spec.image.x}px;top:${spec.image.y}px;`
        + `width:${spec.image.w}px;height:${spec.image.h}px;`
        + `transform:scale(1);transform-origin:0 0;${fill(url, "100% 100%")}`,
      ),
      stage,
    ),
  },
  {
    code: "E", label: "E center",
    /* Neo bằng TÂM THẬT, không phải `50% 50%`: ảnh của một ô có lệch âm thì tâm nó
       KHÔNG trùng tâm khung, và một biến thể vẽ sai chỗ thì ảnh chụp không so được
       với A nữa. Câu hỏi là "neo bằng tâm có ra Center không", không phải "dịch ảnh
       vào giữa". */
    build: (spec, url, stage, at) => stack(
      outer(spec, "E center", at),
      inner(
        `position:absolute;left:${pctOf(spec.image.x + spec.image.w / 2, spec.frame.w)};`
        + `top:${pctOf(spec.image.y + spec.image.h / 2, spec.frame.h)};`
        + `width:${pctOf(spec.image.w, spec.frame.w)};height:${pctOf(spec.image.h, spec.frame.h)};`
        + `transform:translate(-50%, -50%);${fill(url, "100% 100%")}`,
      ),
      stage,
    ),
  },
  {
    code: "F", label: "F img-cover",
    build: (spec, url, stage, at) => stack(outer(spec, "F img-cover", at), imgInner(spec, url, "cover"), stage),
  },
  {
    code: "G", label: "G img-contain",
    build: (spec, url, stage, at) => stack(outer(spec, "G img-contain", at), imgInner(spec, url, "contain"), stage),
  },
  {
    code: "H", label: "H bg-cover",
    build: (spec, url, stage, at) => stack(outer(spec, "H bg-cover", at), pctInner(spec, url, "cover"), stage),
  },
  {
    code: "I", label: "I bg-px",
    /* MỘT tầng khung, không lồng: ảnh phủ đúng khung ngoài rồi tự nói cỡ và chỗ đặt
       bằng px — cách viết gần nghĩa "cắt cúp" nhất mà CSS có. Nếu bên nhận đọc ra
       một fill kèm ma trận thì cả tầng khung trong là thừa. */
    build: (spec, url, stage, at) => stack(
      outer(spec, "I bg-px", at),
      inner(
        `position:absolute;left:0;top:0;width:100%;height:100%;`
        + fill(url, `${spec.image.w}px ${spec.image.h}px`, `${spec.image.x}px ${spec.image.y}px`),
      ),
      stage,
    ),
  },
  {
    code: "J", label: "J aspect-only",
    /* Khung ngoài KHÔNG khai `height`: encoder xoá hẳn khoá `height` khỏi `styles`
       khi giá trị khai báo là `auto`, nên đây là biến thể duy nhất hỏi được câu
       "chiều cao suy từ tỉ lệ thì bên nhận có khoá tỉ lệ lại không". */
    build: (spec, url, stage, at) => stack(outer(spec, "J aspect-only", at, false), pctInner(spec, url), stage),
  },
];

/** Mã của mọi biến thể, đúng thứ tự xếp trên sân khấu. */
export const LAB_CODES: readonly string[] = LAB_VARIANTS.map((v) => v.code);

/* ══════════════════════════════════════════════════════════════════════════
   ③ SÂN KHẤU + PAYLOAD
   ══════════════════════════════════════════════════════════════════════════ */

export interface LabFrame {
  variant: LabVariant;
  el: HTMLElement;
  at: { x: number; y: number };
}

/**
 * Xếp CẢ CHÍN khung thành một hàng ngang trên MỘT sân khấu.
 *
 * Hàng ngang chứ không lưới: dán ra Figma thì mắt đi từ trái sang phải đúng thứ tự
 * bảng ở đầu file, và panel Design của khung nào cũng mở được mà không phải cuộn dọc.
 */
export function renderLab(spec: FigmaNodeSpec, imageUrl: string, stage: HTMLElement): LabFrame[] {
  const out: LabFrame[] = [];
  let x = 0;
  for (const variant of LAB_VARIANTS) {
    const at = { x, y: 0 };
    out.push({ variant, el: variant.build(spec, imageUrl, stage, at), at });
    x += spec.frame.w + LAB_GAP;
  }
  return out;
}

/**
 * Cổng kiểm cho THÍ NGHIỆM — cố ý KHÁC `assertDocShape`.
 *
 * `assertDocShape` đo đúng MỘT hình dạng: khung ngoài DIV, con đầu là DIV mang
 * `background-image`, và bốn con số khớp spec trong 1px. Áp nó vào đây là tự tay
 * giết sáu trên chín biến thể (F/G là `<img>`, B/C không khai cỡ, J không khai
 * chiều cao) — tức cổng sẽ chặn đúng những câu hỏi mà thí nghiệm này sinh ra để hỏi.
 * Thứ DUY NHẤT còn đáng chặn là ca "ảnh không vào được payload": dán ra chín khung
 * rỗng thì chụp màn cũng vô nghĩa.
 */
export function assertLabDoc(doc: H2DDocument, variant: LabVariant): void {
  /* Tên kiểu rút ra TRƯỚC khi ghép câu: cổng từ cấm §5.4 đọc cả biểu thức nằm giữa
     một câu tiếng Việt, và tên trường của đối số mang đúng một chữ trong danh sách cấm. */
  const kieu = variant.label;
  const assets = [...doc.assets.values()];
  if (assets.length === 0) {
    throw new Error(`Kiểu ${kieu} không nhúng được ảnh nào — dán ra sẽ là một hộp rỗng.`);
  }
  const failed = assets.filter((a) => a.blob === null);
  if (failed.length > 0) {
    throw new Error(`Kiểu ${kieu} không nhúng được ảnh: ${failed[0]?.error ?? "không rõ lý do"}`);
  }
}

export interface LabEncodeResult {
  html: string;
  /** Mã biến thể đã thật sự vào payload, đúng thứ tự. */
  codes: string[];
  bytes: number;
}

export interface LabEncodeOptions {
  /**
   * Cửa thay `captureElement` — CHỈ cho test. `captureElement` đòi layout thật
   * (`vendor/figma-h2d/README.md`, ràng buộc 1) nên không chạy được dưới jsdom;
   * không có cửa này thì phần "payload chở đủ chín mã" không có cách nào canh.
   */
  capture?: (el: HTMLElement) => Promise<H2DDocument>;
}

/**
 * Chín document H2D rời trong MỘT payload — ràng buộc 3 của `vendor/figma-h2d/README.md`
 * (Figma làm phẳng wrapper trong suốt nằm trong một board), đúng cách «Copy N ô» đang đi.
 */
export async function encodeFigmaLab(
  spec: FigmaNodeSpec,
  imageUrl: string,
  opts: LabEncodeOptions = {},
): Promise<LabEncodeResult> {
  const h2d = await loadFigmaH2D();
  const stage = mountStage();
  try {
    const frames = renderLab(spec, imageUrl, stage);
    const capture = opts.capture ?? ((el: HTMLElement) => h2d.captureElement(el));
    const docs: H2DDocument[] = [];
    for (const frame of frames) {
      const doc = await capture(frame.el);
      assertLabDoc(doc, frame.variant);
      docs.push(stripPageTitle(doc));
    }
    const { html } = await h2d.toFigmaClipboardHtml(docs, { source: LAB_SOURCE });
    return { html, codes: frames.map((f) => f.variant.code), bytes: html.length };
  } finally {
    stage.remove();
  }
}

/** Đường đầy đủ cho nút dev: dựng chín kiểu rồi ghi bộ nhớ tạm. Ném ở mọi bước hỏng. */
export async function copyFigmaLab(spec: FigmaNodeSpec, imageUrl: string): Promise<LabEncodeResult> {
  const encoded = await encodeFigmaLab(spec, imageUrl);
  if (typeof ClipboardItem !== "function" || !navigator.clipboard?.write) {
    throw new Error("Trình duyệt này không cho ghi HTML vào bộ nhớ tạm.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([encoded.html], { type: "text/html" }),
      "text/plain": new Blob([""], { type: "text/plain" }),
    }),
  ]);
  return encoded;
}
