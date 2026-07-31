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
    wave: { vi: "Vẫy chào", prompt: "waving hello with one arm raised high — the raised arm is on the RIGHT side of the image (viewer's right)",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.70, .16], rw: [.76, .05], ls: [.38, .25], le: [.34, .39], lw: [.33, .53], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    point: { vi: "Chỉ tay", prompt: "pointing with one fully extended arm toward the RIGHT edge of the image (viewer's right), confident look",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.76, .28], rw: [.92, .27], ls: [.38, .25], le: [.34, .39], lw: [.33, .53], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    "hold-gift": { vi: "Ôm quà", prompt: "hugging a wrapped gift box with both arms in front of the chest, delighted expression",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.66, .38], rw: [.56, .44], ls: [.38, .25], le: [.34, .38], lw: [.44, .44], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    cheer: { vi: "Ăn mừng", prompt: "jumping in celebration with both arms thrown up, eyes closed in joy, tiny sparkles around",
      j: { head: [.5, .10], neck: [.5, .23], rs: [.62, .26], re: [.70, .15], rw: [.74, .04], ls: [.38, .26], le: [.30, .15], lw: [.26, .04], hip: [.5, .56], rk: [.61, .72], ra: [.66, .84], lk: [.39, .72], la: [.34, .84] } },
    sad: { vi: "Buồn", prompt: "drooping shoulders and head tilted down, sad puppy eyes, one tear drop",
      j: { head: [.52, .13], neck: [.5, .24], rs: [.60, .28], re: [.62, .42], rw: [.58, .56], ls: [.40, .28], le: [.38, .42], lw: [.42, .56], hip: [.5, .58], rk: [.57, .76], ra: [.57, .93], lk: [.43, .76], la: [.43, .93] } },
    run: { vi: "Chạy", prompt: "running toward the RIGHT side of the image with a dynamic lean, one leg lifted, determined face, small motion lines",
      j: { head: [.60, .11], neck: [.56, .23], rs: [.66, .26], re: [.76, .33], rw: [.84, .24], ls: [.46, .25], le: [.38, .35], lw: [.32, .46], hip: [.52, .55], rk: [.68, .68], ra: [.78, .80], lk: [.44, .76], la: [.34, .92] } },
    think: { vi: "Suy nghĩ", prompt: "in a puzzled thinking pose, the hand on the viewer's RIGHT side of the image resting on the chin, eyes looking up sideways",
      j: { head: [.52, .11], neck: [.5, .23], rs: [.62, .26], re: [.68, .38], rw: [.58, .21], ls: [.38, .26], le: [.35, .40], lw: [.44, .48], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    sit: { vi: "Ngồi", prompt: "sitting on the ground with knees bent forward, hands resting on the knees, relaxed smile",
      j: { head: [.5, .18], neck: [.5, .30], rs: [.61, .33], re: [.65, .46], rw: [.63, .58], ls: [.39, .33], le: [.35, .46], lw: [.37, .58], hip: [.5, .63], rk: [.65, .68], ra: [.62, .88], lk: [.35, .68], la: [.32, .88] } },
    jump: { vi: "Bật nhảy", prompt: "jumping high mid-air with both arms raised and legs tucked underneath, excited face",
      j: { head: [.5, .09], neck: [.5, .21], rs: [.61, .24], re: [.70, .14], rw: [.76, .05], ls: [.39, .24], le: [.30, .14], lw: [.24, .05], hip: [.5, .52], rk: [.61, .66], ra: [.56, .78], lk: [.39, .66], la: [.44, .78] } },
    bow: { vi: "Cúi chào", prompt: "bowing politely forward with both arms straight at the sides, respectful greeting",
      j: { head: [.64, .30], neck: [.56, .38], rs: [.62, .41], re: [.60, .53], rw: [.56, .64], ls: [.50, .41], le: [.46, .53], lw: [.42, .64], hip: [.46, .60], rk: [.53, .77], ra: [.53, .93], lk: [.40, .77], la: [.40, .93] } },
    "thumbs-up": { vi: "Like 👍", prompt: "giving a big thumbs-up with one hand raised in front, proud happy grin",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.62, .25], re: [.70, .36], rw: [.74, .22], ls: [.38, .25], le: [.34, .39], lw: [.33, .53], hip: [.5, .56], rk: [.58, .75], ra: [.58, .93], lk: [.42, .75], la: [.42, .93] } },
    present: { vi: "Giới thiệu", prompt: "presenting toward one side with an open extended palm, like showing a product, welcoming look",
      j: { head: [.48, .10], neck: [.48, .22], rs: [.60, .25], re: [.74, .32], rw: [.88, .38], ls: [.36, .25], le: [.33, .40], lw: [.40, .50], hip: [.48, .56], rk: [.56, .75], ra: [.56, .93], lk: [.40, .75], la: [.40, .93] } },
    dance: { vi: "Nhảy múa", prompt: "dancing joyfully with one arm up and hips tilted, one leg kicked out, playful face",
      j: { head: [.54, .09], neck: [.52, .21], rs: [.64, .24], re: [.70, .13], rw: [.64, .04], ls: [.40, .25], le: [.30, .32], lw: [.20, .26], hip: [.48, .54], rk: [.60, .69], ra: [.68, .84], lk: [.38, .74], la: [.30, .88] } },
    walk: { vi: "Đi bộ", prompt: "walking casually toward one side with a light arm swing, calm smile",
      j: { head: [.54, .10], neck: [.52, .22], rs: [.62, .25], re: [.68, .37], rw: [.72, .48], ls: [.42, .25], le: [.37, .37], lw: [.33, .48], hip: [.5, .56], rk: [.60, .73], ra: [.64, .91], lk: [.42, .74], la: [.36, .91] } },
    fly: { vi: "Bay", prompt: "flying diagonally like a superhero, both arms stretched forward, legs trailing behind, cape-like motion",
      j: { head: [.66, .13], neck: [.58, .22], rs: [.64, .26], re: [.76, .18], rw: [.88, .10], ls: [.52, .28], le: [.66, .26], lw: [.80, .20], hip: [.44, .50], rk: [.34, .64], ra: [.24, .78], lk: [.40, .70], la: [.30, .86] } },
    /* ---- hướng nhìn (turnaround) — quy ước OpenPose: back = đảo trái/phải ---- */
    "view-34": { vi: "Góc ¾", prompt: "standing in a three-quarter view, body turned about 45 degrees, face toward the viewer",
      j: { head: [.53, .10], neck: [.51, .22], rs: [.65, .26], re: [.68, .39], rw: [.68, .53], ls: [.43, .25], le: [.38, .38], lw: [.36, .52], hip: [.5, .56], rk: [.59, .75], ra: [.60, .93], lk: [.44, .75], la: [.42, .93] } },
    "view-side": { vi: "Nhìn ngang", prompt: "standing in full side profile view facing one direction, arms hanging naturally",
      j: { head: [.55, .10], neck: [.52, .22], rs: [.53, .25], re: [.55, .39], rw: [.56, .52], ls: [.50, .25], le: [.51, .39], lw: [.52, .52], hip: [.5, .56], rk: [.54, .75], ra: [.56, .93], lk: [.47, .75], la: [.45, .93] } },
    "view-back": { vi: "Nhìn lưng", prompt: "seen directly from behind, showing the back of the head, back of the costume and the tail, standing straight",
      j: { head: [.5, .10], neck: [.5, .22], rs: [.38, .25], re: [.34, .39], rw: [.33, .53], ls: [.62, .25], le: [.66, .39], lw: [.67, .53], hip: [.5, .56], rk: [.42, .75], ra: [.42, .93], lk: [.58, .75], la: [.58, .93] } },
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
    if (shape === "empty") return "";          // ô đệm cố ý bỏ trống
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
