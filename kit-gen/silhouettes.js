/* ============================================================================
   silhouettes.js — thư viện hình khối skeleton DÙNG CHUNG:
     · skeleton.html (render ảnh ref cho codex qua render-skeleton.mjs)
     · studio.html  (preview trực tiếp khi soạn contract)
   Silhouette vẽ trong hệ toạ độ khung safe (0,0 → w,h), trả markup SVG.

   Pose vẽ theo BỘ XƯƠNG kiểu OpenPose (khớp + chi màu phân biệt) — model
   gen ảnh bám dáng stick figure chuẩn tốt hơn hình người generic.
   ========================================================================== */
(function (global) {
  const FILL = "#9a9a9a", EDGE = "#606060";

  /* ---- Thư viện pose: khớp chuẩn hoá (x,y) trong [0,1] của khung safe ----
     head, neck, rs/re/rw (vai-khuỷu-cổ tay phải), ls/le/lw (trái),
     hip, rk/ra (gối-cổ chân phải), lk/la (trái). prompt = mô tả tiếng Anh. */
  const POSES = {
    idle: { vi: "Đứng thẳng", prompt: "standing straight facing the viewer, arms relaxed at the sides, neutral friendly smile",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.66, .39], rw: [.67, .53], ls: [.38, .25], le: [.34, .39], lw: [.33, .53], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    wave: { vi: "Vẫy chào", prompt: "waving hello with one arm raised high, warm welcoming smile",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.70, .16], rw: [.76, .05], ls: [.38, .25], le: [.34, .39], lw: [.33, .53], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    point: { vi: "Chỉ tay", prompt: "pointing forward and slightly sideways with one fully extended arm, confident look",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.76, .28], rw: [.92, .27], ls: [.38, .25], le: [.34, .39], lw: [.33, .53], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    "hold-gift": { vi: "Ôm quà", prompt: "hugging a wrapped gift box with both arms in front of the chest, delighted expression",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.66, .38], rw: [.56, .44], ls: [.38, .25], le: [.34, .38], lw: [.44, .44], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    cheer: { vi: "Ăn mừng", prompt: "jumping in celebration with both arms thrown up, eyes closed in joy, tiny sparkles around",
      j: { head: [.5, .10], neck: [.5, .23], rs: [.62, .26], re: [.70, .15], rw: [.74, .04], ls: [.38, .26], le: [.30, .15], lw: [.26, .04], hip: [.5, .56], rk: [.61, .72], ra: [.66, .84], lk: [.39, .72], la: [.34, .84] } },
    sad: { vi: "Buồn", prompt: "drooping shoulders and head tilted down, sad puppy eyes, one tear drop",
      j: { head: [.52, .13], neck: [.5, .24], rs: [.60, .28], re: [.62, .42], rw: [.58, .56], ls: [.40, .28], le: [.38, .42], lw: [.42, .56], hip: [.5, .58], rk: [.57, .76], ra: [.57, .93], lk: [.43, .76], la: [.43, .93] } },
    run: { vi: "Chạy", prompt: "running toward one side with a dynamic lean, one leg lifted, determined face, small motion lines",
      j: { head: [.60, .11], neck: [.56, .23], rs: [.66, .26], re: [.76, .33], rw: [.84, .24], ls: [.46, .25], le: [.38, .35], lw: [.32, .46], hip: [.52, .55], rk: [.68, .68], ra: [.78, .80], lk: [.44, .76], la: [.34, .92] } },
    think: { vi: "Suy nghĩ", prompt: "in a puzzled thinking pose, one hand on the chin, eyes looking up sideways",
      j: { head: [.52, .11], neck: [.5, .23], rs: [.62, .26], re: [.68, .38], rw: [.58, .21], ls: [.38, .26], le: [.35, .40], lw: [.44, .48], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
  };

  /* chi + màu kiểu OpenPose để model nhận ra đây là pose skeleton */
  const LIMBS = [
    ["neck", "head", "#e6194b"], ["neck", "hip", "#f58231"],
    ["neck", "rs", "#ffe119"], ["rs", "re", "#bfef45"], ["re", "rw", "#3cb44b"],
    ["neck", "ls", "#42d4f4"], ["ls", "le", "#4363d8"], ["le", "lw", "#911eb4"],
    ["hip", "rk", "#f032e6"], ["rk", "ra", "#a9a9a9"],
    ["hip", "lk", "#469990"], ["lk", "la", "#9a6324"],
  ];

  function poseSVG(poseId, w, h) {
    const p = POSES[poseId] ?? POSES.idle;
    const P = k => [p.j[k][0] * w, p.j[k][1] * h];
    const lw = Math.max(5, w * 0.045);
    let out = "";
    for (const [a, b, color] of LIMBS) {
      const [x1, y1] = P(a), [x2, y2] = P(b);
      out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${lw}" stroke-linecap="round"/>`;
    }
    const [hx, hy] = P("head");
    out += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${(h * 0.085).toFixed(1)}" fill="none" stroke="#e6194b" stroke-width="${lw}"/>`;
    for (const k of Object.keys(p.j)) {
      const [x, y] = P(k);
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(lw * 0.65).toFixed(1)}" fill="#222"/>`;
    }
    return out;
  }

  function silhouette(shape, w, h, uid, skel = {}) {
    const c = skel.plain ? `fill="${FILL}"` : `fill="${FILL}" stroke="${EDGE}" stroke-width="3"`;
    if (shape === "pose") return poseSVG(skel.pose, w, h);
    if (shape === "pill" || shape === "bar")
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" ${c}/>`;
    if (shape === "rrect")
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) / 6}" ${c}/>`;
    if (shape === "circle") {
      const r = Math.min(w, h) / 2;
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" ${c}/>`;
    }
    if (shape === "burst") {
      const R = Math.min(w, h) / 2, pts = [];
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, r = i % 2 ? R * 0.45 : R;
        pts.push(`${w / 2 + r * Math.cos(a)},${h / 2 + r * Math.sin(a)}`);
      }
      return `<polygon points="${pts.join(" ")}" ${c}/>`;
    }
    if (shape === "puzzle") {
      const tab = Math.min(w, h) * 0.22, rx = Math.min(w, h) / 8;
      return `<mask id="pz${uid}">
          <rect x="0" y="${tab}" width="${w}" height="${h - tab}" rx="${rx}" fill="#fff"/>
          <circle cx="${w / 2}" cy="${tab}" r="${tab}" fill="#fff"/>
          <circle cx="0" cy="${(h + tab) / 2}" r="${tab}" fill="#000"/>
        </mask>
        <rect x="-6" y="-6" width="${w + 12}" height="${h + 12}" fill="${FILL}" mask="url(#pz${uid})"/>`;
    }
    if (shape === "figure") {
      const hr = Math.min(w * 0.4, h * 0.24);
      const by = hr * 1.8, bw = w * 0.66, bh = h - by;
      const aw = w * 0.15, ah = bh * 0.5;
      return `<circle cx="${w / 2}" cy="${hr}" r="${hr}" ${c}/>
        <rect x="${(w - bw) / 2}" y="${by}" width="${bw}" height="${bh}" rx="${bw / 3}" ${c}/>
        <rect x="${(w - bw) / 2 - aw * 0.8}" y="${by + bh * 0.06}" width="${aw}" height="${ah}" rx="${aw / 2}" ${c}
              transform="rotate(12 ${(w - bw) / 2} ${by + bh * 0.06})"/>
        <rect x="${(w + bw) / 2 - aw * 0.2}" y="${by + bh * 0.06}" width="${aw}" height="${ah}" rx="${aw / 2}" ${c}
              transform="rotate(-12 ${(w + bw) / 2} ${by + bh * 0.06})"/>`;
    }
    if (shape === "full")
      return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" ${c}/>`;
    return "";
  }

  global.KITSIL = { silhouette, poseSVG, POSES, FILL, EDGE };
})(typeof window !== "undefined" ? window : globalThis);
