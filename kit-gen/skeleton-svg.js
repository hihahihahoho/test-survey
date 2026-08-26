/* ============================================================================
   skeleton-svg.js — BỘ DỰNG SVG cho ảnh khung xương. NGUỒN SỰ THẬT DUY NHẤT
   về hình học của skeleton, dùng chung bởi:
     · render-skeleton.mjs  (Node + @resvg/resvg-wasm → skeleton/<id>.png)
     · skeleton.html        (chỉ là KHUNG XEM: nhúng thẳng chuỗi SVG dưới đây)

   Vì hai đầu ăn CHUNG một chuỗi SVG nên không thể có chuyện "trình duyệt vẽ một
   kiểu, renderer vẽ một kiểu". Muốn đổi hình dạng khung xương thì sửa Ở ĐÂY,
   không sửa CSS của skeleton.html (từ nay nó không còn luật layout nào).

   ── ÁNH XẠ TỪ 4 LUẬT CSS CŨ CỦA skeleton.html (đọc từ mã, không đoán) ──────
     .sheet   width/height W×H; background #f2f2f2; overflow hidden
              → <svg W×H>, KHÔNG có rect nền — xem khối "NỀN" ngay dưới đây
     .cell    position:absolute; box-sizing:border-box; border:1px solid #d9d9d9
              → rect inset 0.5 (SVG vẽ nét quanh TÂM đường) + stroke-width 1
     .cell svg  position:absolute; overflow:visible
              → <g transform="translate(...)">
              KHÔNG dùng <svg> lồng: <svg> lồng CẮT phần trang trí tràn ra ngoài
              khung safe, còn CSS `overflow:visible` thì không cắt.
     .safe    position:absolute; border:4px solid #464646; border-radius:6px;
              box-sizing:border-box
              → rect inset 2 (tâm nét 4px) + rx = 6 − 2 = 4

   ── NỀN SHEET: TRONG SUỐT, VÀ ĐỪNG ĐẮP LẠI ────────────────────────────────
     Ảnh này là ẢNH THAM CHIẾU đính kèm cho model. Model **bắt chước nền của ảnh
     tham chiếu**, không nghe lời prompt. Đo được, 4/4 lượt, cùng model cùng cách
     đính (BACKLOG #24 ⑥):

       skeleton nền ĐẶC  #dfdfdf → ảnh ra có α=0 chiếm  0,0%  · 0,0%
       skeleton nền TRONG (α=0)  → ảnh ra có α=0 chiếm 60,3%  · 65,3%

     Vòng đối chứng sạch (`skel-A`/`skel-B`) dùng prompt GIỐNG NHAU TỪNG BYTE —
     `diff` chỉ ra đúng dòng đường dẫn file ra. Biến duy nhất là tấm ảnh này. Và
     prompt đó đã mạnh hết cỡ: mở đầu bằng "TRANSPARENT BACKGROUND", có dòng "THE
     MOST IMPORTANT REQUIREMENT: the output PNG must have a real alpha channel",
     nói thẳng nền xám của skeleton không phải tranh. Vẫn 0,0%.

     Tệ hơn: khi không tạo được trong suốt, model KHÔNG báo lỗi — nó **vẽ một tấm
     caro giả**, ô `#FEFEFE` đan `#EEEEEE`, toàn bộ α=255. Nhìn bằng mắt y hệt ảnh
     nền trong suốt. Đó là lý do `slice.py` phải soi kênh α thay vì tin con mắt.

     ⇒ Nền sheet ở đây KHÔNG BAO GIỜ được vẽ lại. Muốn NHÌN thấy khung xương thì
     đặt nền ở KHUNG XEM (skeleton.html trải caro dưới `.sheet`), không đặt vào
     SVG — vì chính chuỗi SVG này là thứ đi vào ảnh gửi cho model.
     `tests/test_skeleton_svg.py::test_svg_KHONG_CO_RECT_NEN` khoá điều này.

   ── CÁI BẪY DUY NHẤT, ĐÃ ĐO HAI CHIỀU: +1px ───────────────────────────────
     `.cell` là containing block và nó CÓ border ⇒ con `position:absolute` của nó
     neo theo PADDING BOX, tức đã trừ đi 1px border. Nên MỌI toạ độ con (silhouette
     và khung safe) phải cộng thêm CELL_BORDER = 1 so với góc ô.
     Bỏ sót đúng 1px này làm sai khác so với ảnh Playwright nhảy 1,64% → 2,63%.
   ========================================================================== */
(function (global) {
  const GRID_STROKE = "#d9d9d9";    // .cell border-color
  const SAFE_STROKE = "#464646";    // .safe border-color
  const CELL_BORDER = 1;            // .cell border-width — xem khối "CÁI BẪY" ở trên
  const SAFE_BORDER = 4;            // .safe border-width
  const SAFE_RADIUS = 6;            // .safe border-radius

  /* GRID / BIAS v16 — MỘT nguồn hình học cho ảnh đính kèm.
     Bản nghiệm thu 2.1.31 cho thấy bias dương đã làm model style men pastel
     vẽ overshoot (rim + hoa + tua rua tràn khỏi core). Vì không có tín hiệu
     style-level nào chứng minh cần nở, production mặc định KHÔNG bù mép:
       · gray silhouette/local guide = BIÊN NGOÀI CÙNG của functional CORE;
       · bias = 0 để model không bị yêu cầu vẽ lớn hơn contract;
       · overflow core/decor vẫn giữ được trong bleed và crop, undershoot mới
         là lỗi hình học.
     Nếu một contract tương lai khai báo rim dày, bias phải là một override có
     chủ ý ở contract đó — không áp cứng một bảng calibrate cho mọi style. */
  const GRID_GUIDE = Object.freeze({
    version: "v16",
    marginPx: 8,
    sweetSpotScale: 1,
    stroke: "#c8c8c8",
    width: 3,
    edgePx: Object.freeze({
      bar: Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 }),
      rect: Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 }),
      square: Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 }),
    }),
    nineElement: Object.freeze({ columns: 3, rows: 3 }),
  });

  const n = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));

  function gridGuideEnabled(sh) {
    const setting = sh && sh.gridGuide;
    return setting === true || (setting && setting.enabled !== false);
  }

  /* v14+ nine-element layout nhận diện được mà không đổi schema manifest. */
  function isNineElementSheet(sh) {
    const grid = sh?.grid || {};
    return grid.cols === GRID_GUIDE.nineElement.columns
      && grid.rows === GRID_GUIDE.nineElement.rows
      && Array.isArray(sh?.components)
      && sh.components.length === 9
      && sh.components.every(comp => comp?.skel?.shape !== "empty");
  }

  /* Phân family giống measure-core-alignment.py / fit-compensation.py.
     Contract shape thắng heuristic: progress bars v16 có ratio 3.2 nhưng
     vẫn thuộc bảng `bar`; ratio chỉ là fallback cho shape mới. */
  function compensationKind(width, height, shape = null) {
    if (shape === "bar") return "bar";
    if (shape === "circle" || shape === "burst" || shape === "puzzle" || shape === "square")
      return "square";
    const ratio = height ? width / height : 1;
    if (ratio >= 4) return "bar";
    if (ratio >= 1.35) return "rect";
    return "square";
  }

  function compensationFor(width, height, shape = null) {
    const kind = compensationKind(width, height, shape);
    const edge = GRID_GUIDE.edgePx[kind];
    return { kind, left: edge.left, top: edge.top, right: edge.right, bottom: edge.bottom,
      edges: [edge.left, edge.top, edge.right, edge.bottom] };
  }

  function cellRect(sh, index) {
    const { cols } = sh.grid;
    const [W, H] = sheetSize(sh);
    const cw = W / cols, ch = H / sh.grid.rows;
    const row = (index / cols) | 0, col = index % cols;
    return { x: col * cw, y: row * ch, width: cw, height: ch };
  }

  function targetRect(sh, comp, index) {
    const cell = cellRect(sh, index);
    const sk = comp.skel || {};
    const safe = sk.contentSafe && typeof sk.contentSafe === "object" ? sk.contentSafe : sk;
    const ew = cell.width * (safe.w ?? sk.w ?? 1);
    const eh = cell.height * (safe.h ?? sk.h ?? 1);
    const ex = (cell.width - ew) / 2;
    const ey = sk.anchor === "bottom"
      ? cell.height - eh - cell.height * 0.04
      : (cell.height - eh) / 2;
    return { x: cell.x + CELL_BORDER + ex, y: cell.y + CELL_BORDER + ey, width: ew, height: eh };
  }

  /* Guide v16 trùng target; production không tự nở guide. */
  function guideGeometry(sh, comp, index) {
    const cell = cellRect(sh, index);
    const target = targetRect(sh, comp, index);
    const sk = comp.skel || {};
    const eligible = sk.shape !== "empty" && sk.shape !== "full";
    if (!gridGuideEnabled(sh) || !eligible) {
      return { cell, target, guide: target, bias: compensationFor(target.width, target.height, sk.shape),
        applied: [0, 0, 0, 0], fitScale: 1 };
    }

    const bias = compensationFor(target.width, target.height, sk.shape);
    const margin = Math.max(0, Number(sh.gridGuide?.marginPx ?? GRID_GUIDE.marginPx));
    const allowed = {
      left: cell.x + margin,
      top: cell.y + margin,
      right: cell.x + cell.width - margin,
      bottom: cell.y + cell.height - margin,
    };
    /* Không dịch core khỏi contract; giữ guard clamp cho các contract cũ nếu
       sau này có bias override. Với v16 production hiện tại, bias luôn bằng 0. */
    const applied = [
      Math.min(bias.left, Math.max(0, target.x - allowed.left)),
      Math.min(bias.top, Math.max(0, target.y - allowed.top)),
      Math.min(bias.right, Math.max(0, allowed.right - (target.x + target.width))),
      Math.min(bias.bottom, Math.max(0, allowed.bottom - (target.y + target.height))),
    ];
    const total = bias.left + bias.top + bias.right + bias.bottom;
    const used = applied.reduce((sum, value) => sum + value, 0);
    const guide = {
      x: target.x - applied[0],
      y: target.y - applied[1],
      width: target.width + applied[0] + applied[2],
      height: target.height + applied[1] + applied[3],
    };
    return { cell, target, guide, bias, applied, fitScale: total ? used / total : 1 };
  }

  function localGuideSvg(cell, guide) {
    const attrs = "stroke=\"" + GRID_GUIDE.stroke + "\" stroke-width=\"" + GRID_GUIDE.width
      + "\" shape-rendering=\"geometricPrecision\"";
    const x0 = cell.x, y0 = cell.y, x1 = cell.x + cell.width, y1 = cell.y + cell.height;
    const gx0 = guide.x, gy0 = guide.y;
    const gx1 = guide.x + guide.width, gy1 = guide.y + guide.height;
    return "<line x1=\"" + n(gx0) + "\" y1=\"" + n(y0) + "\" x2=\"" + n(gx0)
      + "\" y2=\"" + n(y1) + "\" " + attrs + "/>"
      + "<line x1=\"" + n(gx1) + "\" y1=\"" + n(y0) + "\" x2=\"" + n(gx1)
      + "\" y2=\"" + n(y1) + "\" " + attrs + "/>"
      + "<line x1=\"" + n(x0) + "\" y1=\"" + n(gy0) + "\" x2=\"" + n(x1)
      + "\" y2=\"" + n(gy0) + "\" " + attrs + "/>"
      + "<line x1=\"" + n(x0) + "\" y1=\"" + n(gy1) + "\" x2=\"" + n(x1)
      + "\" y2=\"" + n(gy1) + "\" " + attrs + "/>";
  }

  /** Khổ ảnh gen — BẢN CHÉP của bảng `CANVAS` trong khối python của `gen.sh`.
   *
   *  ĐỪNG SUY LẠI TỪ `orient` Ở ĐÂY. Khổ ảnh từng được suy độc lập ở bốn chỗ
   *  (gen.sh, run_one, file này, slice.py) và mỗi chỗ tự viết một dòng ba ngôi
   *  `orient === "portrait" ? … : …`. Thêm một khổ thứ ba là phải sửa đủ bốn, và
   *  chỗ nào quên thì hỏng LẶNG LẼ: khung xương vẽ một khổ, prompt xin khổ khác.
   *  Nguồn sự thật nay là bảng `CANVAS` ở gen.sh; sửa ở đó thì sửa cả ở đây.
   *
   *  `canvas` thắng `orient` (field cũ, chỉ có landscape/portrait) để contract
   *  đời trước chạy nguyên vẹn. Giá trị lạ rơi về landscape, không ném.
   *
   *  1254×1254 cho ô vuông chứ không phải 1024×1024: tool `image_gen` của codex
   *  KHÔNG có tham số `size` — nó luôn trả ~1,57 triệu pixel và chỉ lái được tỉ
   *  lệ. Đo 685 ảnh thật: 132 ảnh vuông, tất cả đều đúng 1254×1254.
   */
  const CANVAS = {
    landscape: [1536, 1024],
    portrait: [1024, 1536],
    square: [1254, 1254],
  };
  function sheetSize(sh) {
    const key = String(sh.canvas || sh.orient || "landscape").toLowerCase();
    return CANVAS[key] || CANVAS.landscape;
  }

  /* Mask id của shape `puzzle` phải DUY NHẤT trong một tài liệu. Khung xem nhét
     nhiều sheet vào CÙNG một trang HTML nên đánh số chạy theo từng sheet là đụng
     nhau (`url(#pz0)` bắt nhầm mask của sheet trước). Khoá theo (sheet, ô) vừa
     duy nhất vừa deterministic: cùng contract ⇒ cùng chuỗi SVG, dù render một
     sheet lẻ hay cả tập. */
  const uidFor = (sheetId, i) => `${String(sheetId).replace(/[^A-Za-z0-9_-]/g, "_")}-${i}`;

  /**
   * Dựng SVG hoàn chỉnh cho MỘT sheet. Trả chuỗi (không phải DOM) để Node và
   * trình duyệt dùng chung được từng byte.
   */
  function sheetToSvg(sh) {
    const KITSIL = global.KITSIL;
    if (!KITSIL) throw new Error("skeleton-svg.js cần silhouettes.js nạp trước");
    const { cols, rows } = sh.grid;
    const [W, H] = sheetSize(sh);
    const cw = W / cols, ch = H / rows;
    const guideEnabled = gridGuideEnabled(sh);
    /* KHÔNG có rect nền: nền sheet phải TRONG SUỐT. Xem khối "NỀN SHEET" ở đầu
       file — đây không phải thiếu sót, đây là điều kiện để ảnh model trả về có
       alpha thật. */
    const parts = [];

    sh.components.forEach((comp, i) => {
      const r = (i / cols) | 0, c = i % cols;
      const cx = c * cw, cy = r * ch;

      /* THỨ TỰ VẼ phải là từng ô một (viền → silhouette → khung safe), KHÔNG
         gom hết viền lên trước: silhouette được phép tràn ra ngoài ô (đúng tinh
         thần `overflow:visible`) và trong trình duyệt phần tràn đó bị viền của
         Ô SAU vẽ đè lên. Gom viền lên trước là đảo thứ tự chồng lớp. */
      parts.push(`<rect x="${cx + CELL_BORDER / 2}" y="${cy + CELL_BORDER / 2}" width="${cw - CELL_BORDER}" height="${ch - CELL_BORDER}" fill="none" stroke="${GRID_STROKE}" stroke-width="${CELL_BORDER}"/>`);

      const sk = comp.skel || {};
      const geometry = guideGeometry(sh, comp, i);
      const draw = guideEnabled ? geometry.guide : geometry.target;
      const ew = draw.width, eh = draw.height;
      const ox = draw.x, oy = draw.y;

      /* Local v16 guides nằm SAU nền/viền ô, TRƯỚC silhouette: model nhìn thấy
         registration evidence nhưng gray/grid không đi vào output vì đây chỉ là
         ảnh attachment, không phải raw sheet. */
      if (guideEnabled && sk.shape !== "full" && sk.shape !== "empty")
        parts.push(localGuideSvg(geometry.cell, draw));

      const sil = KITSIL.silhouette(sk.shape, ew, eh, uidFor(sh.id, i), sk);
      if (sil) parts.push(`<g transform="translate(${ox} ${oy})">${sil}</g>`);

      // `full` lấp kín ô, `empty` là ô đệm, `free` cố ý không bị khung ràng buộc
      if (!(sk.shape === "full" || sk.shape === "empty" || sk.free)) {
        const inset = SAFE_BORDER / 2;
        parts.push(`<rect x="${ox + inset}" y="${oy + inset}" width="${Math.max(0, ew - SAFE_BORDER)}" height="${Math.max(0, eh - SAFE_BORDER)}" rx="${SAFE_RADIUS - inset}" fill="none" stroke="${SAFE_STROKE}" stroke-width="${SAFE_BORDER}"/>`);
      }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
  }

  /** Cả contract → [{ id, w, h, svg }] theo đúng thứ tự sheet. */
  function buildAll(cfg) {
    return cfg.sheets.map(sh => {
      const [w, h] = sheetSize(sh);
      return { id: sh.id, w, h, svg: sheetToSvg(sh) };
    });
  }

  global.KITSKEL = {
    sheetToSvg, sheetSize, buildAll,
    GRID_STROKE, SAFE_STROKE, CELL_BORDER, SAFE_BORDER, SAFE_RADIUS,
    GRID_GUIDE, compensationKind, compensationFor, isNineElementSheet,
    cellRect, targetRect, guideGeometry,
  };
})(typeof window !== "undefined" ? window : globalThis);
