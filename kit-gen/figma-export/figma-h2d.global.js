"use strict";
var figmaH2D = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    STYLE_DEFAULTS: () => STYLE_DEFAULTS,
    SVG_PRESENTATION_DEFAULTS: () => SVG_PRESENTATION_DEFAULTS,
    captureDocument: () => captureDocument,
    captureElement: () => captureElement,
    serializeDocument: () => serializeDocument,
    toFigmaClipboardHtml: () => toFigmaClipboardHtml,
    writeFigmaClipboard: () => writeFigmaClipboard
  });

  // src/fonts.ts
  function stretchKeyword(stretch) {
    if (!stretch.endsWith("%")) return stretch.toLowerCase();
    const pct = parseFloat(stretch);
    if (isNaN(pct)) return "normal";
    if (pct <= 50) return "ultra-condensed";
    if (pct <= 62.5) return "extra-condensed";
    if (pct <= 75) return "condensed";
    if (pct <= 87.5) return "semi-condensed";
    if (pct <= 100) return "normal";
    if (pct <= 112.5) return "semi-expanded";
    if (pct <= 125) return "expanded";
    if (pct <= 150) return "extra-expanded";
    return "ultra-expanded";
  }
  var GENERIC_FONT_KEYWORDS = /* @__PURE__ */ new Set([
    "system-ui",
    "-apple-system",
    "blinkmacsystemfont",
    "ui-sans-serif",
    "ui-serif",
    "ui-monospace",
    "ui-rounded",
    "sans-serif",
    "serif",
    "monospace",
    "cursive",
    "fantasy",
    "math",
    "emoji",
    "fangsong",
    "inherit",
    "initial",
    "unset",
    "revert"
  ]);
  function genericFallbackFamily(families) {
    const lower = families.map((f) => f.toLowerCase());
    if (lower.includes("monospace") || lower.includes("ui-monospace")) return "Courier New";
    if (lower.includes("serif") || lower.includes("ui-serif")) return "Times New Roman";
    return "Arial";
  }
  function parseFamilies(value) {
    const out = [];
    const re = /(?:"([^"]+)"|'([^']+)'|([^,\s][^,]*))/g;
    let m;
    while ((m = re.exec(value)) !== null) {
      const name = (m[1] ?? m[2] ?? m[3])?.trim();
      if (name) out.push(name);
    }
    return out;
  }
  function normalize(styles) {
    return {
      family: styles.fontFamily ?? "Times",
      stretch: styles.fontStretch ?? "100%",
      style: styles.fontStyle === "italic" ? "italic" : "normal",
      weight: styles.fontWeight ?? "400",
      size: styles.fontSize ?? "16px"
    };
  }
  var FontCollector = class {
    constructor(realm) {
      this.realm = realm;
    }
    realm;
    families = /* @__PURE__ */ new Map();
    processedUsages = /* @__PURE__ */ new Set();
    lineBoxHeightCache = /* @__PURE__ */ new Map();
    unavailable = /* @__PURE__ */ new Set();
    _ctx = null;
    get ctx() {
      if (!this._ctx) this._ctx = this.realm.doc.createElement("canvas").getContext("2d");
      return this._ctx;
    }
    isAvailable(family, stretch, style, weight, sample) {
      const ctx = this.ctx;
      if (!ctx) return false;
      const text = sample ?? "mmmmmmmmmmlli";
      const size = "72px";
      const stretchKw = stretchKeyword(stretch);
      for (const fallback of ["monospace", "sans-serif", "serif"]) {
        ctx.font = `${stretchKw} ${style} ${weight} ${size} ${fallback}`;
        const baseW = ctx.measureText(text).width;
        ctx.font = `${stretchKw} ${style} ${weight} ${size} "${family}", ${fallback}`;
        const withFamily = ctx.measureText(text).width;
        if (baseW !== withFamily) return true;
      }
      return false;
    }
    measureMetrics(family, stretch, style, weight, size, sample) {
      const ctx = this.ctx;
      if (!ctx) return void 0;
      const fam = this.families.get(family.toLowerCase());
      if (!fam) return void 0;
      ctx.font = `${stretchKeyword(stretch)} ${style} ${weight} ${size} "${fam.familyName}"`;
      const m = ctx.measureText(sample ?? "Hg");
      return {
        fontBoundingBoxAscent: m.fontBoundingBoxAscent,
        fontBoundingBoxDescent: m.fontBoundingBoxDescent
      };
    }
    addUsage(familyKey, stretch, style, weight, size, originalFamily, sample) {
      const usageKey = `${familyKey}|${stretch}|${style}|${weight}|${size}`;
      if (this.processedUsages.has(usageKey)) return;
      this.processedUsages.add(usageKey);
      const fam = this.families.get(familyKey);
      if (!fam) return;
      const metrics = this.measureMetrics(familyKey, stretch, style, weight, size, sample);
      fam.usages.push({ fontWeight: weight, fontStyle: style, fontStretch: stretch, fontSize: size, metrics });
      if (metrics) {
        const height = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
        this.lineBoxHeightCache.set(`${originalFamily}|${stretch}|${style}|${weight}|${size}`, height);
      }
    }
    /** Record a usage from a style set; probes availability across the family list. */
    collect(styles) {
      const { family, stretch, style, weight, size } = normalize(styles);
      const families = parseFamilies(family);
      for (const candidate of families) {
        const key2 = candidate.toLowerCase();
        if (GENERIC_FONT_KEYWORDS.has(key2)) continue;
        const probeKey = `${key2}|${stretch}|${style}|${weight}|latin`;
        if (this.unavailable.has(probeKey)) continue;
        if (this.families.has(key2)) {
          this.addUsage(key2, stretch, style, weight, size, family);
          return;
        }
        if (!this.isAvailable(candidate, stretch, style, weight)) {
          this.unavailable.add(probeKey);
          continue;
        }
        this.families.set(key2, { familyName: candidate, faces: [], usages: [] });
        this.addUsage(key2, stretch, style, weight, size, family);
        return;
      }
      const fallback = genericFallbackFamily(families);
      const key = fallback.toLowerCase();
      if (!this.families.has(key)) {
        if (!this.isAvailable(fallback, stretch, style, weight)) return;
        this.families.set(key, { familyName: fallback, faces: [], usages: [] });
      }
      this.addUsage(key, stretch, style, weight, size, family);
    }
    /**
     * Resolve a node's raw CSS `font-family` value to a SINGLE family that is
     * present in `getFonts()` — i.e. a real, Figma-loadable font. Figma's
     * HTML-to-Design paste parses each element's `styles.fontFamily`, maps over
     * the family list and tries to load every entry; a CSS generic / system
     * keyword (`system-ui`, `-apple-system`, `sans-serif`, …) or any family it
     * doesn't have resolves to `undefined` and crashes the paste on
     * `.startsWith`. Emitting only the resolved concrete family avoids that.
     * Returns null when nothing resolves (caller should leave the value as-is).
     */
    emitFamily(value) {
      if (!value) return null;
      const families = parseFamilies(value);
      for (const candidate of families) {
        if (GENERIC_FONT_KEYWORDS.has(candidate.toLowerCase())) continue;
        const fam = this.families.get(candidate.toLowerCase());
        if (fam) return fam.familyName;
      }
      const fallback = this.families.get(genericFallbackFamily(families).toLowerCase());
      return fallback ? fallback.familyName : null;
    }
    /** Line-box height previously measured for a style set, or null. */
    lineBoxHeight(styles) {
      const { family, stretch, style, weight, size } = normalize(styles);
      return this.lineBoxHeightCache.get(`${family}|${stretch}|${style}|${weight}|${size}`) ?? null;
    }
    getFonts() {
      return Object.fromEntries(this.families);
    }
  };

  // src/images.ts
  var UNSUPPORTED_MIME = /* @__PURE__ */ new Set(["image/avif", "image/heif", "image/heic"]);
  var FETCH_TIMEOUT_MS = 8e3;
  function isRemoteUrl(realm, url) {
    const base = realm.win.location.href;
    if (url.startsWith("data:") || url.startsWith("blob:")) return false;
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("//")) {
      return isRemoteUrl(realm, base);
    }
    try {
      const host = new URL(url, base).hostname;
      return !(host === "0.0.0.0" || host === "localhost" || host.startsWith("127.") || host === "[::1]" || host === "::1");
    } catch {
      return true;
    }
  }
  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Failed to create blob from canvas")),
        "image/webp",
        1
      );
    });
  }
  async function transcodeToWebp(realm, blob) {
    const url = realm.win.URL.createObjectURL(blob);
    try {
      const img = new realm.win.Image();
      img.src = url;
      await img.decode();
      const canvas = realm.doc.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context for image conversion");
      ctx.drawImage(img, 0, 0);
      return await canvasToBlob(canvas);
    } finally {
      realm.win.URL.revokeObjectURL(url);
    }
  }
  async function fetchImage(realm, url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await realm.win.fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to fetch image: ${url} - ${res.status}`);
      let blob = await res.blob();
      if (UNSUPPORTED_MIME.has(blob.type)) blob = await transcodeToWebp(realm, blob);
      return { url, blob };
    } finally {
      clearTimeout(timer);
    }
  }
  var ImageCollector = class {
    constructor(realm, options) {
      this.realm = realm;
      this.options = options;
    }
    realm;
    options;
    promises = /* @__PURE__ */ new Map();
    rasterizedId = 0;
    add(key, promise) {
      this.promises.set(
        key,
        promise.catch((err) => ({ url: key, blob: null, error: String(err) }))
      );
    }
    addImage(url) {
      if (!url || this.promises.has(url)) return;
      const promise = this.options.skipRemoteAssetSerialization && isRemoteUrl(this.realm, url) ? Promise.resolve({ url, blob: null }) : fetchImage(this.realm, url);
      this.add(url, promise);
    }
    addCanvas(canvas) {
      const key = `rasterized:${this.rasterizedId++}`;
      this.add(key, canvasToBlob(canvas).then((blob) => ({ url: key, blob })));
      return key;
    }
    /** Collect <img>, background-image url(...) and video poster for an element + its styles. */
    collectFor(el, styles) {
      if (el instanceof this.realm.win.HTMLImageElement) this.addImage(el.currentSrc);
      if (el instanceof this.realm.win.HTMLVideoElement && el.poster) this.addImage(el.poster);
      const bg = styles.backgroundImage;
      if (bg) {
        for (const m of bg.matchAll(/url\("(.*?)"\)/g)) this.addImage(m[1]);
      }
    }
    async getBlobMap() {
      const entries = await Promise.all(
        Array.from(this.promises, async ([key, p]) => [key, await p])
      );
      return new Map(entries);
    }
  };

  // src/realm.ts
  function realmOf(node) {
    const doc = node.nodeType === Node.DOCUMENT_NODE ? node : node.ownerDocument;
    const win = doc.defaultView ?? window;
    return { doc, win };
  }

  // src/style-defaults.ts
  var STYLE_DEFAULTS = Object.freeze({
    alignContent: "normal",
    alignItems: "normal",
    alignSelf: "auto",
    aspectRatio: "auto",
    backdropFilter: "none",
    backgroundAttachment: "scroll",
    backgroundBlendMode: "normal",
    backgroundClip: "border-box",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    backgroundOrigin: "padding-box",
    backgroundPositionX: "0%",
    backgroundPositionY: "0%",
    backgroundRepeat: "repeat",
    backgroundSize: "auto",
    borderBottomColor: "rgb(0, 0, 0)",
    borderBottomLeftRadius: "0px",
    borderBottomRightRadius: "0px",
    borderBottomStyle: "none",
    borderBottomWidth: "0px",
    borderCollapse: "separate",
    borderImageOutset: "0",
    borderImageRepeat: "stretch",
    borderImageSlice: "100%",
    borderImageSource: "none",
    borderImageWidth: "1",
    borderLeftColor: "rgb(0, 0, 0)",
    borderLeftStyle: "none",
    borderLeftWidth: "0px",
    borderRightColor: "rgb(0, 0, 0)",
    borderRightStyle: "none",
    borderRightWidth: "0px",
    borderSpacing: "0px",
    borderTopColor: "rgb(0, 0, 0)",
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    borderTopStyle: "none",
    borderTopWidth: "0px",
    bottom: "auto",
    boxShadow: "none",
    boxSizing: "content-box",
    clear: "none",
    clip: "auto",
    clipPath: "none",
    clipRule: "nonzero",
    color: "rgb(0, 0, 0)",
    colorScheme: "normal",
    columnCount: "auto",
    columnFill: "balance",
    columnGap: "normal",
    columnRuleColor: "rgb(0, 0, 0)",
    columnRuleStyle: "none",
    columnRuleWidth: "0px",
    columnSpan: "none",
    columnWidth: "auto",
    contain: "none",
    containerType: "normal",
    content: "normal",
    contentVisibility: "visible",
    display: "",
    filter: "none",
    flexBasis: "auto",
    flexDirection: "row",
    flexGrow: "0",
    flexShrink: "1",
    flexWrap: "nowrap",
    float: "none",
    fontFamily: "Times",
    fontFeatureSettings: "normal",
    fontKerning: "auto",
    fontOpticalSizing: "auto",
    fontPalette: "normal",
    fontSize: "16px",
    fontSizeAdjust: "none",
    fontStretch: "100%",
    fontStyle: "normal",
    fontWeight: "400",
    gridAutoColumns: "auto",
    gridAutoFlow: "row",
    gridAutoRows: "auto",
    gridColumnEnd: "auto",
    gridColumnStart: "auto",
    gridRowEnd: "auto",
    gridRowStart: "auto",
    gridTemplateAreas: "none",
    gridTemplateColumns: "none",
    gridTemplateRows: "none",
    height: "auto",
    isolation: "auto",
    justifyItems: "normal",
    justifySelf: "auto",
    justifyContent: "normal",
    left: "auto",
    letterSpacing: "normal",
    lineBreak: "auto",
    lineHeight: "normal",
    listStyleImage: "none",
    listStylePosition: "outside",
    listStyleType: "disc",
    marginBottom: "0px",
    marginLeft: "0px",
    marginRight: "0px",
    marginTop: "0px",
    maxHeight: "none",
    maxWidth: "none",
    minHeight: "auto",
    minWidth: "auto",
    mixBlendMode: "normal",
    objectFit: "fill",
    opacity: "1",
    order: "0",
    outlineColor: "rgb(0, 0, 0)",
    outlineOffset: "0px",
    outlineStyle: "none",
    outlineWidth: "0px",
    overflow: "visible",
    overflowX: "visible",
    overflowY: "visible",
    position: "static",
    paddingBottom: "0px",
    paddingLeft: "0px",
    paddingRight: "0px",
    paddingTop: "0px",
    quotes: "auto",
    right: "auto",
    rowGap: "normal",
    strokeDasharray: "none",
    strokeDashoffset: "0px",
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeMiterlimit: "4",
    strokeOpacity: "1",
    strokeWidth: "1px",
    textAlign: "start",
    textDecorationColor: "rgb(0, 0, 0)",
    textDecorationLine: "none",
    textDecorationStyle: "solid",
    textIndent: "0px",
    textShadow: "none",
    textTransform: "none",
    textWrapStyle: "auto",
    top: "auto",
    perspective: "none",
    transform: "none",
    transformOrigin: "auto",
    translate: "none",
    transitionProperty: "all",
    verticalAlign: "baseline",
    visibility: "visible",
    webkitTextFillColor: "",
    whiteSpace: "normal",
    width: "auto",
    willChange: "auto",
    writingMode: "horizontal-tb",
    zIndex: "auto",
    rotate: "none",
    scale: "none"
  });
  var STYLE_DEFAULT_ENTRIES = Object.freeze(Object.entries(STYLE_DEFAULTS));
  function toDashProp(prop) {
    const kebab = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    return prop.startsWith("webkit") ? `-${kebab}` : kebab;
  }
  var DASH_PROP = Object.freeze(
    Object.fromEntries(Object.keys(STYLE_DEFAULTS).map((p) => [p, toDashProp(p)]))
  );
  var SVG_PRESENTATION_DEFAULTS = Object.freeze({
    alignmentBaseline: "baseline",
    clip: "auto",
    clipPath: "none",
    clipRule: "nonzero",
    color: "rgb(0, 0, 0)",
    colorInterpolation: "sRGB",
    colorRendering: "auto",
    cursor: "auto",
    direction: "ltr",
    display: "inline",
    dominantBaseline: "auto",
    fill: "rgb(0, 0, 0)",
    fillOpacity: "1",
    fillRule: "nonzero",
    filter: "none",
    floodColor: "rgb(0, 0, 0)",
    floodOpacity: "1",
    imageRendering: "auto",
    letterSpacing: "normal",
    lightingColor: "rgb(255, 255, 255)",
    lineHeight: "normal",
    markerEnd: "none",
    markerMid: "none",
    markerStart: "none",
    mask: "none",
    opacity: "1",
    overflow: "visible",
    paintOrder: "normal",
    shapeRendering: "auto",
    stopColor: "rgb(0, 0, 0)",
    stopOpacity: "1",
    stroke: "none",
    strokeDasharray: "none",
    strokeDashoffset: "0px",
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeMiterlimit: "4",
    strokeOpacity: "1",
    strokeWidth: "1px",
    textAnchor: "start",
    textDecoration: "none solid rgb(0, 0, 0)",
    textRendering: "auto",
    unicodeBidi: "normal",
    vectorEffect: "none",
    visibility: "visible",
    whiteSpace: "normal",
    writingMode: "horizontal-tb"
  });
  var SIZING_PROPS = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"];
  var MARGIN_PROPS = ["marginTop", "marginRight", "marginBottom", "marginLeft"];
  var GRID_PROPS = ["gridTemplateColumns", "gridTemplateRows", "gridColumnStart", "gridColumnEnd", "gridRowStart", "gridRowEnd", "columnGap", "rowGap", "gridAutoFlow", "gridTemplateAreas", "gridAutoColumns", "gridAutoRows"];
  var BORDER_EDGES = [
    { style: "borderTopStyle", width: "borderTopWidth", color: "borderTopColor" },
    { style: "borderRightStyle", width: "borderRightWidth", color: "borderRightColor" },
    { style: "borderBottomStyle", width: "borderBottomWidth", color: "borderBottomColor" },
    { style: "borderLeftStyle", width: "borderLeftWidth", color: "borderLeftColor" }
  ];
  var ATTR_ALLOWLIST = /* @__PURE__ */ new Set(["alt", "checked", "currentSrc", "disabled", "for", "href", "id", "multiple", "placeholder", "poster", "readonly", "rel", "required", "role", "selected", "target", "title", "type", "value"]);
  var PLACEHOLDER_INPUT_TYPES = /* @__PURE__ */ new Set(["text", "search", "tel", "url", "email", "password", "number"]);

  // src/styles.ts
  function extractStyles(realm, el, pseudo) {
    const cs = realm.win.getComputedStyle(el, pseudo);
    if (pseudo === "::before" || pseudo === "::after") {
      const content = cs.content;
      if (content === "none" || content === "normal" || content === "no-open-quote" || content === "no-close-quote") {
        return null;
      }
    }
    const styles = {};
    for (const [prop, def] of STYLE_DEFAULT_ENTRIES) {
      const value = cs[prop];
      if (value != null && value !== def) styles[prop] = value;
    }
    const computedStyles = {};
    const styleMap = "computedStyleMap" in el && !pseudo ? el.computedStyleMap() : null;
    if (styleMap) {
      for (const prop of SIZING_PROPS) {
        const specified = styleMap.get(DASH_PROP[prop])?.toString();
        if (!specified) continue;
        if (specified === STYLE_DEFAULTS[prop]) delete styles[prop];
        else if (specified !== styles[prop]) computedStyles[prop] = specified;
      }
      for (const prop of GRID_PROPS) {
        const specified = styleMap.get(DASH_PROP[prop])?.toString();
        if (specified && specified !== STYLE_DEFAULTS[prop] && specified !== styles[prop]) {
          computedStyles[prop] = specified;
        }
      }
      for (const prop of MARGIN_PROPS) {
        if (styleMap.get(DASH_PROP[prop])?.toString() === "auto") styles[prop] = "auto";
      }
    }
    for (const edge of BORDER_EDGES) {
      if (styles[edge.width] == null) {
        delete styles[edge.style];
        delete styles[edge.color];
      }
    }
    if (styles.outlineWidth == null) {
      delete styles.outlineStyle;
      delete styles.outlineColor;
    }
    if (styles.webkitTextFillColor != null && styles.webkitTextFillColor === cs.color) {
      delete styles.webkitTextFillColor;
    }
    return { styles, computedStyles };
  }

  // src/svg.ts
  var ELEMENT_NODE = 1;
  var PRESENTATION_DASH = Object.fromEntries(
    Object.keys(SVG_PRESENTATION_DEFAULTS).map((p) => [p, p.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()])
  );
  function bakeAttributes(realm, source, clone) {
    if (source.nodeType !== ELEMENT_NODE || clone.nodeType !== ELEMENT_NODE) return;
    const cs = realm.win.getComputedStyle(source);
    const dst = clone;
    for (const [prop, dash] of Object.entries(PRESENTATION_DASH)) {
      const value = cs.getPropertyValue(dash);
      const def = SVG_PRESENTATION_DEFAULTS[prop];
      if (value && value.toLowerCase() !== def.toLowerCase()) {
        dst.setAttribute(dash, value);
      }
    }
    for (let i = 0; i < source.childNodes.length; i++) {
      bakeAttributes(realm, source.childNodes[i], clone.childNodes[i]);
    }
  }
  function bakeSvgOuterHtml(realm, el) {
    const clone = el.cloneNode(true);
    bakeAttributes(realm, el, clone);
    const { width, height } = realm.win.getComputedStyle(el);
    if (width.endsWith("px") && height.endsWith("px")) {
      clone.setAttribute("width", width);
      clone.setAttribute("height", height);
    }
    return clone.outerHTML;
  }

  // src/text-layout.ts
  function invert2x2(m) {
    const det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < 1e-10) return null;
    return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det };
  }
  function solveAABB(w, h, m) {
    const a = Math.abs(m.a);
    const b = Math.abs(m.b);
    const c = Math.abs(m.c);
    const d = Math.abs(m.d);
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-10) return null;
    const width = (w * d - h * c) / det;
    const height = (h * a - w * b) / det;
    return width <= 0 || height <= 0 ? null : { width, height };
  }
  function solveRects(rects, inverse, solveSize) {
    if (rects.length === 0) return null;
    const out = [];
    for (const r of rects) {
      const size = solveSize(r);
      if (!size) continue;
      const center = new DOMPoint(r.x + r.width / 2, r.y + r.height / 2).matrixTransform(inverse);
      out.push(
        new DOMRect(center.x - size.width / 2, center.y - size.height / 2, size.width, size.height)
      );
    }
    return out.length > 0 ? out : null;
  }
  function solveWithLineHeight(rects, inverse, inv2, lineHeight) {
    const a = Math.abs(inv2.a);
    const b = Math.abs(inv2.b);
    const c = Math.abs(inv2.c);
    const d = Math.abs(inv2.d);
    const horizontal = a >= b;
    if ((horizontal ? a : b) < 1e-10) return null;
    return solveRects(rects, inverse, (r) => {
      const len = horizontal ? (r.width - c * lineHeight) / a : (r.height - d * lineHeight) / b;
      return len <= 0 ? null : { width: len, height: lineHeight };
    });
  }
  function solveGeneral(rects, inverse, inv2) {
    return solveRects(rects, inverse, (r) => solveAABB(r.width, r.height, inv2));
  }
  function unionRects(rects) {
    if (rects.length === 0) return null;
    return rects.reduce((acc, r) => {
      const x = Math.min(acc.x, r.x);
      const y = Math.min(acc.y, r.y);
      return new DOMRect(
        x,
        y,
        Math.max(acc.x + acc.width, r.x + r.width) - x,
        Math.max(acc.y + acc.height, r.y + r.height) - y
      );
    });
  }
  function countLines(rects, vertical) {
    const spans = rects.map((r) => vertical ? { start: r.left, end: r.right } : { start: r.top, end: r.bottom }).filter(({ start, end }) => end > start).sort((p, q) => p.start - q.start);
    const threshold = 1;
    let lines = 0;
    let lastCenter = -Infinity;
    for (const { start, end } of spans) {
      const center = (start + end) / 2;
      if (Math.abs(center - lastCenter) >= threshold) {
        lines++;
        lastCenter = center;
      }
    }
    return lines;
  }
  function measureText(realm, node, inverse, lineBoxHeight) {
    const range = realm.doc.createRange();
    if (Array.isArray(node)) {
      const first = node[0];
      const last = node[node.length - 1];
      range.setStart(first, 0);
      range.setEnd(last, last.length);
    } else {
      range.selectNode(node);
    }
    const bcr = range.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
    const vertical = range.commonAncestorContainer instanceof realm.win.HTMLElement ? realm.win.getComputedStyle(range.commonAncestorContainer).writingMode.startsWith("vertical") : false;
    range.detach();
    if (clientRects.length > 0 && inverse) {
      const inv2 = invert2x2(inverse);
      if (inv2) {
        const solved = lineBoxHeight != null ? solveWithLineHeight(clientRects, inverse, inv2, lineBoxHeight) : solveGeneral(clientRects, inverse, inv2);
        if (solved) {
          const u = unionRects(solved) ?? bcr;
          return {
            x: u.x,
            y: u.y,
            width: u.width,
            height: u.height,
            lineCount: countLines(solved, vertical)
          };
        }
      }
    }
    return {
      x: bcr.x,
      y: bcr.y,
      width: bcr.width,
      height: bcr.height,
      lineCount: countLines(clientRects, vertical)
    };
  }

  // src/transform.ts
  function hasTransform(styles) {
    return !!(styles.rotate && styles.rotate !== "none" || styles.scale && styles.scale !== "none" || styles.transform && styles.transform !== "none" || styles.translate && styles.translate !== "none");
  }
  function resolvePercent(value, base) {
    return value.endsWith("%") ? `${parseFloat(value) / 100 * base}px` : value;
  }
  function parseTranslate(size, value) {
    if (!value) return new DOMMatrix();
    const parts = value.trim().split(/\s+/);
    if (parts.length === 0) return new DOMMatrix();
    if (parts.length > 3) throw new Error(`Invalid translate value: ${value}`);
    const tx = resolvePercent(parts[0] ?? "0px", size.width);
    const ty = resolvePercent(parts[1] ?? "0px", size.height);
    const tz = parts[2] ?? "0px";
    return new DOMMatrix(`translate3d(${tx}, ${ty}, ${tz})`);
  }
  function parseScale(value) {
    if (!value) return new DOMMatrix();
    const p = value.trim().split(/\s+/);
    if (p.length === 0) return new DOMMatrix();
    if (p.length > 3) throw new Error(`Invalid scale value: ${value}`);
    return new DOMMatrix(`scale3d(${p[0]}, ${p[1] ?? p[0]}, ${p[2] ?? 1})`);
  }
  function parseRotate(value) {
    if (!value) return new DOMMatrix();
    const p = value.trim().split(/\s+/);
    if (p.length === 0) return new DOMMatrix();
    if (p.length === 1) return new DOMMatrix(`rotate(${p[0]})`);
    if (p.length === 2) {
      switch (p[0]) {
        case "x":
          return new DOMMatrix(`rotateX(${p[1]})`);
        case "y":
          return new DOMMatrix(`rotateY(${p[1]})`);
        case "z":
          return new DOMMatrix(`rotateZ(${p[1]})`);
        default:
          return new DOMMatrix();
      }
    }
    return p.length === 4 ? new DOMMatrix(`rotate3d(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})`) : new DOMMatrix();
  }
  function computeLocalMatrix(size, styles) {
    if (!hasTransform(styles)) return null;
    try {
      const [ox = "0px", oy = "0px", oz = "0px"] = styles.transformOrigin?.trim().split(/\s+/) ?? [];
      const toOrigin = new DOMMatrix(`translate3d(${ox}, ${oy}, ${oz})`);
      return toOrigin.multiply(parseTranslate(size, styles.translate)).multiply(parseRotate(styles.rotate)).multiply(parseScale(styles.scale)).multiply(new DOMMatrix(styles.transform ?? "none")).multiply(toOrigin.inverse());
    } catch {
      return null;
    }
  }
  function composeInverse(parentInverse, localMatrix, origin) {
    if (!localMatrix) return parentInverse;
    try {
      let inv = localMatrix.inverse();
      if (origin) {
        const { x, y } = origin;
        inv = new DOMMatrix().translate(x, y).multiply(inv).translate(-x, -y);
      }
      return parentInverse ? inv.multiply(parentInverse) : inv;
    } catch {
      return parentInverse;
    }
  }
  function measureSize(realm, el, styles, inTransformContext) {
    const { win } = realm;
    if (el instanceof win.HTMLElement && (hasTransform(styles) || inTransformContext)) {
      return { width: el.offsetWidth, height: el.offsetHeight };
    }
    if (el instanceof win.HTMLElement) {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }
    if (el instanceof win.SVGSVGElement) {
      const cs = win.getComputedStyle(el);
      return {
        width: parseFloat(cs.width) || el.width.baseVal.value,
        height: parseFloat(cs.height) || el.height.baseVal.value
      };
    }
    if (el instanceof win.SVGGraphicsElement) {
      const b = el.getBBox();
      return { width: b.width, height: b.height };
    }
    if (typeof win.MathMLElement !== "undefined" && el instanceof win.MathMLElement) {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    }
    return { width: 0, height: 0 };
  }
  function matrixIsTransformed(m) {
    return Math.abs(m.a - 1) > 1e-6 || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || Math.abs(m.d - 1) > 1e-6 || Math.abs(m.e) > 1e-6 || Math.abs(m.f) > 1e-6;
  }
  function centerSolve(bcr, width, height, parentInverse, localMatrix) {
    const center = new DOMPoint(bcr.x + bcr.width / 2, bcr.y + bcr.height / 2);
    const localCenter = new DOMPoint(width / 2, height / 2);
    const c = parentInverse ? center.matrixTransform(parentInverse) : center;
    const l = localMatrix ? localCenter.matrixTransform(localMatrix) : localCenter;
    return { x: c.x - l.x, y: c.y - l.y };
  }
  function transformQuad(q, m) {
    return new DOMQuad(
      q.p1.matrixTransform(m),
      q.p2.matrixTransform(m),
      q.p3.matrixTransform(m),
      q.p4.matrixTransform(m)
    );
  }
  function buildQuad(localMatrix, w, h, origin) {
    const base = DOMQuad.fromQuad({
      p1: { x: 0, y: 0 },
      p2: { x: w, y: 0 },
      p3: { x: w, y: h },
      p4: { x: 0, y: h }
    });
    const transformed = transformQuad(base, localMatrix);
    const placed = transformQuad(transformed, new DOMMatrix().translate(origin.x, origin.y));
    return {
      p1: { x: placed.p1.x, y: placed.p1.y },
      p2: { x: placed.p2.x, y: placed.p2.y },
      p3: { x: placed.p3.x, y: placed.p3.y },
      p4: { x: placed.p4.x, y: placed.p4.y }
    };
  }
  function computeRect(el, size, localMatrix, parentInverse) {
    const bcr = el.getBoundingClientRect();
    if (!parentInverse && !localMatrix) {
      return { x: bcr.x, y: bcr.y, width: size.width, height: size.height };
    }
    const w = Math.max(size.width, 0.01);
    const h = Math.max(size.height, 0.01);
    try {
      const tl = centerSolve(bcr, w, h, parentInverse, localMatrix);
      const rect = { x: tl.x, y: tl.y, width: size.width, height: size.height };
      if (localMatrix && matrixIsTransformed(localMatrix)) {
        try {
          rect.quad = buildQuad(localMatrix, w, h, tl);
        } catch {
        }
      }
      return rect;
    } catch {
      return { x: bcr.x, y: bcr.y, width: size.width, height: size.height };
    }
  }

  // src/types.ts
  var NODE_TYPE = { ELEMENT: 1, TEXT: 3 };

  // src/serialize.ts
  var DEFAULT_TIMEOUT_MS = 1e4;
  var SUPPRESS_BEFORE = "data-h2d-suppress-before";
  var SUPPRESS_AFTER = "data-h2d-suppress-after";
  var idCounter = 0;
  var idMap = /* @__PURE__ */ new WeakMap();
  function nodeId(node) {
    if (node !== null) {
      const existing = idMap.get(node);
      if (existing) return existing;
    }
    const id = `h2d-node-${++idCounter}`;
    if (node !== null) idMap.set(node, id);
    return id;
  }
  function tagName(realm, el) {
    const tag = el.tagName;
    if (typeof tag === "string") return tag.toUpperCase();
    return el instanceof realm.win.HTMLFormElement ? "FORM" : null;
  }
  function isSerializable(realm, el) {
    return !(el instanceof realm.win.HTMLScriptElement || el.nodeType === Node.ELEMENT_NODE && el.getAttribute("data-h2d-ignore") === "true");
  }
  function pickAttributes(realm, el) {
    const out = {};
    for (const { name, value } of Array.from(el.attributes)) {
      const lower = name.toLowerCase();
      if (ATTR_ALLOWLIST.has(lower) || lower.startsWith("aria-")) out[name] = value;
    }
    const { win } = realm;
    if (el instanceof win.HTMLVideoElement && el.poster) out.poster = el.poster;
    if ((el instanceof win.HTMLImageElement || el instanceof win.HTMLVideoElement) && el.currentSrc) {
      out.currentSrc = el.currentSrc;
    }
    if (el instanceof win.HTMLInputElement && out.type == null) out.type = el.type;
    return out;
  }
  var KG_MARKER_SKIP = /* @__PURE__ */ new Set(["data-node-id", "data-name", "data-testid"]);
  function kgComponentMarker(el) {
    if (el.tagName.toLowerCase() === "svg") {
      const figIcon = el.getAttribute("data-fig-icon");
      if (figIcon) {
        const key = el.getAttribute("data-fig-icon-key");
        return `kg:fig|fig-comp=${figIcon}${key ? `;fig-key=${key}` : ""}`;
      }
      const m = (el.getAttribute("class") ?? "").match(/lucide-([a-z0-9-]+)/);
      return m ? `icon/${m[1]}` : void 0;
    }
    const slot = el.getAttribute("data-slot");
    if (!slot) return void 0;
    const parts = [];
    for (const { name, value } of Array.from(el.attributes)) {
      const lower = name.toLowerCase();
      if (!lower.startsWith("data-") || lower === "data-slot") continue;
      if (KG_MARKER_SKIP.has(lower) || lower.startsWith("data-h2d-")) continue;
      parts.push(`${lower.slice(5)}=${value}`);
    }
    if (el.getAttribute("aria-invalid") === "true") parts.push("aria-invalid=true");
    return parts.length ? `kg:${slot}|${parts.join(";")}` : `kg:${slot}`;
  }
  function decodeCssString(value) {
    return value.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex, ch) => {
      if (!hex) return ch ?? "";
      const code = parseInt(hex, 16);
      return code <= 1114111 ? String.fromCodePoint(code) : "\uFFFD";
    });
  }
  function parseContentText(content, quotes) {
    if (!content) return null;
    if (content === "open-quote" || content === "close-quote") {
      const marks = quotes && quotes !== "auto" ? Array.from(quotes.matchAll(/"((?:[^"\\]|\\.)*)"/g), (m2) => decodeCssString(m2[1])) : ["\u201C", "\u201D", "\u2018", "\u2019"];
      return content === "open-quote" ? marks[0] ?? "\u201C" : marks[1] ?? "\u201D";
    }
    const m = content.match(/^"((?:[^"\\]|\\.)*)"/);
    return m ? decodeCssString(m[1]) : null;
  }
  var suppressSheets = /* @__PURE__ */ new Map();
  function adoptSuppressSheet(realm, root) {
    if (suppressSheets.has(root)) return;
    const sheet = new realm.win.CSSStyleSheet();
    sheet.insertRule(`[${SUPPRESS_BEFORE}]::before { content: none !important; }`);
    sheet.insertRule(`[${SUPPRESS_AFTER}]::after { content: none !important; }`);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    suppressSheets.set(root, sheet);
  }
  function clearSuppressSheets() {
    for (const [root, sheet] of suppressSheets) {
      try {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet);
      } catch {
      }
    }
    suppressSheets.clear();
  }
  function walkPseudo(ctx, el, pseudo, id, parentInverse) {
    const { realm } = ctx;
    const extracted = extractStyles(realm, el, pseudo);
    if (!extracted) return void 0;
    const styles = extracted.styles;
    const text = parseContentText(styles.content ?? "normal", styles.quotes);
    ctx.fonts.collect(styles);
    const root = el.getRootNode();
    if (!(root instanceof realm.win.Document || root instanceof realm.win.ShadowRoot)) return void 0;
    adoptSuppressSheet(realm, root);
    const span = realm.doc.createElement("span");
    span.style.all = "initial";
    Object.assign(span.style, styles);
    span.style.removeProperty("content");
    const suppressAttr = pseudo === "::before" ? SUPPRESS_BEFORE : SUPPRESS_AFTER;
    try {
      el.setAttribute(suppressAttr, "");
      span.textContent = text;
      if (pseudo === "::before") el.prepend(span);
      else el.append(span);
      const size = measureSize(realm, span, styles, parentInverse != null);
      const localMatrix = computeLocalMatrix(size, styles);
      const rect = computeRect(span, size, localMatrix, parentInverse);
      const childInverse = composeInverse(parentInverse, localMatrix, { x: rect.x, y: rect.y });
      const childNodes = [];
      for (const child of Array.from(span.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const measure = measureText(realm, child, childInverse, ctx.fonts.lineBoxHeight(styles));
          const { lineCount, ...box } = measure;
          childNodes.push({
            nodeType: NODE_TYPE.TEXT,
            id: `${id}-text`,
            text: child.textContent || "",
            rect: box,
            lineCount
          });
          break;
        }
      }
      return {
        nodeType: NODE_TYPE.ELEMENT,
        id,
        tag: "SPAN",
        attributes: {},
        styles,
        rect,
        childNodes
      };
    } finally {
      span.remove();
      el.removeAttribute(suppressAttr);
    }
  }
  var SKIP_TAGS = /* @__PURE__ */ new Set(["HEAD", "SCRIPT", "STYLE", "NOSCRIPT"]);
  function* groupChildren(nodes) {
    const it = nodes[Symbol.iterator]();
    let next = it.next();
    while (!next.done) {
      if (next.value.nodeType === Node.TEXT_NODE) {
        const run = [next.value];
        next = it.next();
        while (!next.done && next.value.nodeType === Node.TEXT_NODE) {
          run.push(next.value);
          next = it.next();
        }
        yield run;
      } else {
        yield next.value;
        next = it.next();
      }
    }
  }
  function walkText(ctx, node, parent) {
    const lineBoxHeight = parent ? ctx.fonts.lineBoxHeight(parent.styles) : null;
    const measure = measureText(ctx.realm, node, parent?.inverseTransform ?? null, lineBoxHeight);
    const { lineCount, ...box } = measure;
    const text = Array.isArray(node) ? node.map((t) => t.textContent || "").join("") : node.textContent || "";
    const anchor = Array.isArray(node) ? node.length === 1 ? node[0] : null : node;
    return { nodeType: NODE_TYPE.TEXT, id: nodeId(anchor), text, rect: box, lineCount };
  }
  function walkChildren(ctx, nodes, childCtx) {
    const out = [];
    for (const grouped of groupChildren(nodes)) {
      const node = walkNode(ctx, grouped, childCtx);
      if (node != null) out.push(node);
    }
    return out;
  }
  function walkElement(ctx, el, parent) {
    const { realm } = ctx;
    if (!isSerializable(realm, el)) return null;
    const tag = tagName(realm, el);
    if (tag === null || SKIP_TAGS.has(tag)) return null;
    const extracted = extractStyles(realm, el);
    if (!extracted) return null;
    const { styles, computedStyles } = extracted;
    if (styles.display === "none") return null;
    const parentInverse = parent?.inverseTransform ?? null;
    ctx.fonts.collect(styles);
    const size = measureSize(realm, el, styles, parentInverse != null || hasTransform(styles));
    const localMatrix = computeLocalMatrix(size, styles);
    const rect = computeRect(el, size, localMatrix, parentInverse);
    const childInverse = composeInverse(parentInverse, localMatrix, { x: rect.x, y: rect.y });
    const childCtx = { inverseTransform: childInverse, styles };
    let content;
    let placeholderUrl;
    let childNodes = [];
    const { win } = realm;
    if (el instanceof win.SVGElement) {
      content = bakeSvgOuterHtml(realm, el);
    } else if (el instanceof win.HTMLCanvasElement) {
      placeholderUrl = ctx.images.addCanvas(el);
    } else if (el instanceof win.HTMLSlotElement && el.getRootNode() instanceof win.ShadowRoot) {
      childNodes = walkChildren(ctx, el.assignedNodes({ flatten: true }), childCtx);
    } else if (el.shadowRoot) {
      childNodes = walkChildren(ctx, el.shadowRoot.childNodes, childCtx);
    } else {
      childNodes = walkChildren(ctx, el.childNodes, childCtx);
    }
    let pseudoElementStyles;
    if ((el instanceof win.HTMLInputElement && PLACEHOLDER_INPUT_TYPES.has(el.type) || el instanceof win.HTMLTextAreaElement) && el.placeholder) {
      pseudoElementStyles = { placeholder: extractStyles(realm, el, "::placeholder")?.styles };
    }
    ctx.images.collectFor(el, styles);
    const before = walkPseudo(ctx, el, "::before", `${nodeId(el)}::before`, childInverse);
    const after = walkPseudo(ctx, el, "::after", `${nodeId(el)}::after`, childInverse);
    const pseudoElementNodes = before || after ? { before, after } : void 0;
    const node = {
      nodeType: NODE_TYPE.ELEMENT,
      id: nodeId(el),
      tag,
      attributes: pickAttributes(realm, el),
      styles,
      rect,
      childNodes,
      content,
      placeholderUrl,
      pseudoElementNodes,
      pseudoElementStyles
    };
    if (Object.keys(computedStyles).length > 0) node.computedStyles = computedStyles;
    const kgMarker = kgComponentMarker(el);
    if (kgMarker) node.owningReactComponent = kgMarker;
    return node;
  }
  function walkNode(ctx, node, parent) {
    if (Array.isArray(node) || node.nodeType === Node.TEXT_NODE) {
      return walkText(ctx, node, parent);
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return walkElement(ctx, node, parent);
    }
    return null;
  }
  function assertLayout(realm) {
    const r = realm.doc.body.getBoundingClientRect();
    if (r.x === 0 && r.y === 0 && r.width === 0 && r.height === 0) {
      throw new Error("Document does not have valid layout");
    }
  }
  async function decodeImages(images) {
    for (const img of images) {
      if (img.decoding !== "sync") img.decoding = "sync";
      if (img.loading !== "eager") img.loading = "eager";
    }
    await Promise.allSettled(images.map((img) => img.decode()));
  }
  function runInFrame(realm, fn, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Capture aborted"));
      const raf = realm.win.requestAnimationFrame(() => {
        try {
          resolve(fn());
        } catch (err) {
          reject(err);
        } finally {
          clearSuppressSheets();
        }
      });
      signal.addEventListener(
        "abort",
        () => {
          realm.win.cancelAnimationFrame(raf);
          clearSuppressSheets();
          reject(new Error("H2D capture timed out"));
        },
        { once: true }
      );
    });
  }
  async function capture(container, options) {
    const realm = realmOf(container);
    const { win, doc } = realm;
    idCounter = 0;
    idMap = /* @__PURE__ */ new WeakMap();
    if (options.assertLayoutValid !== false) assertLayout(realm);
    const images = new ImageCollector(realm, {
      skipRemoteAssetSerialization: options.skipRemoteAssetSerialization ?? false
    });
    const ctx = { realm, images, fonts: new FontCollector(realm) };
    const signal = options.timeoutSignal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    const isElement = container instanceof win.Element;
    const scope = isElement ? container : doc;
    const rootEl = isElement ? container : doc.documentElement;
    await decodeImages(Array.from(scope.querySelectorAll("img")));
    const root = await runInFrame(realm, () => walkNode(ctx, rootEl, void 0), signal);
    if (!root || root.nodeType !== NODE_TYPE.ELEMENT) {
      throw new Error("Container node could not be serialized");
    }
    const assets = await images.getBlobMap();
    const fonts = ctx.fonts.getFonts();
    rewriteEmittedFontFamilies(root, ctx.fonts);
    if (isElement) {
      const el = container;
      const bcr = el.getBoundingClientRect();
      return {
        root,
        documentTitle: doc.title || void 0,
        documentRect: { x: 0, y: 0, width: el.scrollWidth, height: el.scrollHeight },
        viewportRect: { x: el.scrollLeft, y: el.scrollTop, width: bcr.width, height: bcr.height },
        devicePixelRatio: win.devicePixelRatio,
        version: 2,
        assets,
        fonts
      };
    }
    return {
      root,
      documentTitle: doc.title || void 0,
      documentRect: {
        x: 0,
        y: 0,
        width: doc.documentElement.scrollWidth,
        height: doc.documentElement.scrollHeight
      },
      viewportRect: { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight },
      devicePixelRatio: win.devicePixelRatio,
      version: 2,
      assets,
      fonts
    };
  }
  function rewriteEmittedFontFamilies(node, fonts) {
    if (!node || node.nodeType !== NODE_TYPE.ELEMENT) return;
    const el = node;
    const ff = el.styles?.fontFamily;
    if (ff) {
      const resolved = fonts.emitFamily(ff);
      if (resolved) el.styles.fontFamily = resolved;
    }
    for (const child of el.childNodes ?? []) rewriteEmittedFontFamilies(child, fonts);
    if (el.pseudoElementNodes) {
      rewriteEmittedFontFamilies(el.pseudoElementNodes.before, fonts);
      rewriteEmittedFontFamilies(el.pseudoElementNodes.after, fonts);
    }
  }
  function captureElement(el, options = {}) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) throw new Error("captureElement requires an Element");
    return capture(el, options);
  }
  function captureDocument(doc = document, options = {}) {
    return capture(doc, options);
  }

  // src/clipboard.ts
  var FIGH2D_OPEN = "<!--(figh2d)";
  var FIGH2D_CLOSE = "(/figh2d)-->";
  var FIGMETA_OPEN = "<!--(figmeta)";
  var FIGMETA_CLOSE = "(/figmeta)-->";
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  async function base64Utf8(text) {
    const dataUrl = await blobToDataUrl(
      new File([new TextEncoder().encode(text)], "", { type: "application/octet-stream" })
    );
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  }
  async function serializeDocument(doc) {
    const assets = {};
    const entries = doc.assets instanceof Map ? doc.assets : Object.entries(doc.assets);
    for (const [key, asset] of entries) {
      assets[key] = {
        url: asset.url,
        // Figma's H2D paste parser does `o(asset.blob.base64Blob, asset.blob.type)`
        // and `base64Blob.startsWith("data:")`, so `blob` MUST be an object
        // `{ base64Blob, type }` — NOT a bare data-URL string. Emitting a string
        // makes `blob.base64Blob` undefined → `undefined.startsWith` crashes the
        // whole paste (TypeError: ...reading 'startsWith') for any document that
        // contains an image/canvas asset.
        blob: asset.blob ? { base64Blob: await blobToDataUrl(asset.blob), type: asset.blob.type } : null,
        ...asset.error ? { error: asset.error } : {}
      };
    }
    return JSON.stringify({ ...doc, assets, fonts: doc.fonts });
  }
  function defaultMeta(source, capturedAtIso) {
    return {
      dataType: "h2d",
      source,
      capturedAtIso,
      h2d: { v: 1, origin: { source, capturedAtIso } }
    };
  }
  async function toFigmaClipboardHtml(docs, options = {}) {
    const source = options.source ?? "open-design";
    const capturedAtIso = options.capturedAtIso ?? (/* @__PURE__ */ new Date()).toISOString();
    const docJson = await Promise.all(docs.map(serializeDocument));
    const docArray = `[${docJson.join(",\n")}]`;
    const metaB64 = await base64Utf8(JSON.stringify(defaultMeta(source, capturedAtIso)));
    const dataB64 = await base64Utf8(docArray);
    const metaSpan = `<span data-metadata="${FIGMETA_OPEN}${metaB64}${FIGMETA_CLOSE}"></span>`;
    const dataSpan = `<span data-h2d="${FIGH2D_OPEN}${dataB64}${FIGH2D_CLOSE}"></span>`;
    return { html: metaSpan + dataSpan, plain: options.plain ?? "" };
  }
  async function writeFigmaClipboard(docs, options = {}) {
    const { html, plain } = await toFigmaClipboardHtml(docs, options);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" })
      })
    ]);
  }
  return __toCommonJS(index_exports);
})();
