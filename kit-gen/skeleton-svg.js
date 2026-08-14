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
              → <svg W×H> + <rect fill="#f2f2f2"> phủ nền
     .cell    position:absolute; box-sizing:border-box; border:1px solid #d9d9d9
              → rect inset 0.5 (SVG vẽ nét quanh TÂM đường) + stroke-width 1
     .cell svg  position:absolute; overflow:visible
              → <g transform="translate(...)">
              KHÔNG dùng <svg> lồng: <svg> lồng CẮT phần trang trí tràn ra ngoài
              khung safe, còn CSS `overflow:visible` thì không cắt.
     .safe    position:absolute; border:4px solid #464646; border-radius:6px;
              box-sizing:border-box
              → rect inset 2 (tâm nét 4px) + rx = 6 − 2 = 4

   ── CÁI BẪY DUY NHẤT, ĐÃ ĐO HAI CHIỀU: +1px ───────────────────────────────
     `.cell` là containing block và nó CÓ border ⇒ con `position:absolute` của nó
     neo theo PADDING BOX, tức đã trừ đi 1px border. Nên MỌI toạ độ con (silhouette
     và khung safe) phải cộng thêm CELL_BORDER = 1 so với góc ô.
     Bỏ sót đúng 1px này làm sai khác so với ảnh Playwright nhảy 1,64% → 2,63%.
   ========================================================================== */
(function (global) {
  const BG_FILL = "#f2f2f2";        // .sheet background
  const GRID_STROKE = "#d9d9d9";    // .cell border-color
  const SAFE_STROKE = "#464646";    // .safe border-color
  const CELL_BORDER = 1;            // .cell border-width — xem khối "CÁI BẪY" ở trên
  const SAFE_BORDER = 4;            // .safe border-width
  const SAFE_RADIUS = 6;            // .safe border-radius

  /** Khổ ảnh gen: landscape 3:2 mặc định, `orient:"portrait"` thì 2:3. */
  function sheetSize(sh) {
    return sh.orient === "portrait" ? [1024, 1536] : [1536, 1024];
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
    const parts = [`<rect x="0" y="0" width="${W}" height="${H}" fill="${BG_FILL}"/>`];

    sh.components.forEach((comp, i) => {
      const r = (i / cols) | 0, c = i % cols;
      const cx = c * cw, cy = r * ch;

      /* THỨ TỰ VẼ phải là từng ô một (viền → silhouette → khung safe), KHÔNG
         gom hết viền lên trước: silhouette được phép tràn ra ngoài ô (đúng tinh
         thần `overflow:visible`) và trong trình duyệt phần tràn đó bị viền của
         Ô SAU vẽ đè lên. Gom viền lên trước là đảo thứ tự chồng lớp. */
      parts.push(`<rect x="${cx + CELL_BORDER / 2}" y="${cy + CELL_BORDER / 2}" width="${cw - CELL_BORDER}" height="${ch - CELL_BORDER}" fill="none" stroke="${GRID_STROKE}" stroke-width="${CELL_BORDER}"/>`);

      const sk = comp.skel;
      const ew = cw * sk.w, eh = ch * sk.h;
      const ex = (cw - ew) / 2;
      const ey = sk.anchor === "bottom" ? ch - eh - ch * 0.04 : (ch - eh) / 2;
      // +CELL_BORDER: con absolute neo theo padding box của .cell (xem đầu file)
      const ox = cx + CELL_BORDER + ex, oy = cy + CELL_BORDER + ey;

      const sil = KITSIL.silhouette(sk.shape, ew, eh, uidFor(sh.id, i), sk);
      if (sil) parts.push(`<g transform="translate(${ox} ${oy})">${sil}</g>`);

      // `full` lấp kín ô, `empty` là ô đệm, `free` cố ý không bị khung ràng buộc
      if (!(sk.shape === "full" || sk.shape === "empty" || sk.free)) {
        const inset = SAFE_BORDER / 2;
        parts.push(`<rect x="${ox + inset}" y="${oy + inset}" width="${ew - SAFE_BORDER}" height="${eh - SAFE_BORDER}" rx="${SAFE_RADIUS - inset}" fill="none" stroke="${SAFE_STROKE}" stroke-width="${SAFE_BORDER}"/>`);
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
    BG_FILL, GRID_STROKE, SAFE_STROKE, CELL_BORDER, SAFE_BORDER, SAFE_RADIUS,
  };
})(typeof window !== "undefined" ? window : globalThis);
