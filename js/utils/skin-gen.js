// Procedural skin generator: every skin is a harmonious palette rendered by one
// of several "styles" (SVG scene for the left panel, matching mesh for the right).

const W = 1200;
const H = 900;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function makePalette(isDark) {
  const h = rand(0, 360);
  const scheme = choice([
    [0, 25, -25, 55],
    [0, 180, 20, 200],
    [0, 120, 240, 60],
    [0, 150, 210, 30],
    [0, 40, 80, 320]
  ]);
  const accents = scheme.map(o => ({
    h: (h + o + 360) % 360,
    s: rand(65, 92),
    l: isDark ? rand(52, 68) : rand(54, 68)
  }));
  const bg = isDark ? { h, s: 45, l: 7 } : { h, s: 65, l: 95 };
  const bg2 = isDark ? { h: accents[1].h, s: 42, l: 14 } : { h: accents[1].h, s: 70, l: 90 };
  const css = (c, a = 1) => `hsla(${c.h.toFixed(0)},${c.s.toFixed(0)}%,${c.l.toFixed(0)}%,${a})`;
  return {
    isDark,
    accents,
    bg,
    bg2,
    color: (i, a = 1) => css(accents[i % accents.length], a),
    bgColor: (a = 1) => css(bg, a),
    bg2Color: (a = 1) => css(bg2, a),
    rgb: i => hslToRgb(accents[i % accents.length].h, accents[i % accents.length].s, accents[i % accents.length].l)
  };
}


// Palette from a fixed list of hex colors (used by the themed styles below).
function hexPalette(isDark, picked, bg, bg2, ink) {
  const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const rgba = (hex, a) => { const [r, g, b] = toRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  return {
    isDark,
    busy: true,
    ink,
    color: (i, a = 1) => rgba(picked[i % picked.length], a),
    bgColor: (a = 1) => rgba(bg, a),
    bg2Color: (a = 1) => rgba(bg2, a),
    rgb: i => toRgb(picked[i % picked.length]).map(v => v / 255)
  };
}

// Earthy palette for the African-pattern styles: ochre, terracotta, indigo, malachite...
// fixed palettes for ornaments that only look right in their own colours
const ETHNIC_SPECS = {
  Seigaiha: { picked: ["#2b6cb0", "#e8eee6", "#1a4a82", "#8fb8da"], bg: "#1a4a82", bg2: "#12365f", ink: "#0f2a4d" },
  Sashiko: { picked: ["#f1f4ff", "#9fb6ea", "#3b5bb5", "#c9a23a"], bg: "#16295e", bg2: "#0e1a40", ink: "#f1f4ff", veil: ["rgba(0,0,10,0.3)", "rgba(255,255,255,0.62)"] },
  Adire: { picked: ["#e9eefb", "#9fb6ea", "#3b5bb5", "#c9a23a"], bg: "#233f8f", bg2: "#1b3478", ink: "#e9eefb", veil: ["rgba(0,0,10,0.3)", "rgba(255,255,255,0.62)"] },
  Kawung: { picked: ["#7a4a1e", "#d9b36a", "#e8d5a8", "#b5532c"], bg: "#e8d5a8", bg2: "#d9b36a", ink: "#2b1a10" },
  Girih: { picked: ["#1c6e7d", "#e8c25a", "#a8321f", "#f2ead5"], bg: "#f2ead5", bg2: "#e8dcc0", ink: "#16303a" },
  Azulejo: { picked: ["#1d4e9e", "#5b86c8", "#f6f3ea", "#c9d8f0"], bg: "#f6f3ea", bg2: "#dfe8f5", ink: "#1d4e9e" },
  Navajo: { picked: ["#b3261e", "#1a1412", "#e8dcc0", "#c7893a"], bg: "#e8dcc0", bg2: "#c7893a", ink: "#1a1412" },
  Andean: { picked: ["#d6246e", "#17a398", "#f2b705", "#e2461c"], bg: "#1a1a1a", bg2: "#2a2a2a", ink: "#1a1a1a" },
  Aboriginal: { picked: ["#f4c542", "#ffffff", "#d9482b", "#e8935a"], bg: "#2a0f0a", bg2: "#3a1810", ink: "#f4c542", veil: ["rgba(0,0,0,0.25)", "rgba(255,255,255,0.3)"] },
  FairIsle: { picked: ["#f2efe6", "#b3261e", "#1d3f6e", "#2a2a2a"], bg: "#f2efe6", bg2: "#e6e0d0", ink: "#2a2a2a" },
  Slavic: { picked: ["#c8201f", "#111111", "#f5f0e1", "#c8201f"], bg: "#f5f0e1", bg2: "#e9e1c8", ink: "#111111" }
};

function makeEthnicPalette(isDark, name) {
  const spec = ETHNIC_SPECS[name];
  if (spec) {
    const pal = hexPalette(isDark, spec.picked, spec.bg, spec.bg2, spec.ink);
    if (spec.veil) pal.veil = spec.veil[isDark ? 0 : 1];
    return pal;
  }
  // African cloth: earthy colours picked at random
  const pool = ["#E3A72F", "#C65D3B", "#1F5F8B", "#B8322A", "#2F7D4A", "#2A9D8F", "#E9C46A", "#7B3F61"];
  const picked = pool.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  return hexPalette(isDark, picked, isDark ? "#17110c" : "#f1e5cb", isDark ? "#2b1c12" : "#e3cfa5", isDark ? "#f2e6cf" : "#2a1a10");
}

function starfieldPalette() {
  const pal = hexPalette(true, ["#ffffff", "#9ec5ff", "#ffe9b0", "#ffb3d1"], "#000000", "#05060f", "#ffffff");
  pal.busy = false;
  pal.veil = "rgba(0,0,0,0)";
  pal.right = `
    radial-gradient(circle at ${rand(30, 70).toFixed(0)}% ${rand(20, 60).toFixed(0)}%, rgba(70,90,170,0.20), transparent 70%),
    linear-gradient(180deg, #000000, #04050c)
  `;
  return pal;
}

const pixelPalettes = {
  "Pixel Level": d => d
    ? hexPalette(d, ["#1c3fa6", "#00a8a8", "#c84c0c", "#fcb800"], "#05060f", "#0b1640", "#f2e6cf")
    : hexPalette(d, ["#5c94fc", "#00a800", "#c84c0c", "#fcb800"], "#5c94fc", "#a4c8ff", "#2a1a10"),
  "Pixel City": d => d
    ? hexPalette(d, ["#ff4fa0", "#7a4cff", "#38e8ff", "#ffd866"], "#0b0b2b", "#2a1250", "#f2f2f2")
    : hexPalette(d, ["#7ec8ff", "#ffb36b", "#a1e8af", "#ff9ec7"], "#cfeaff", "#ffe9c8", "#1a1a1a")
};

// ---- pixel-art helpers ------------------------------------------------------
// map: array of strings, one char per pixel ('.' = empty); fills: color or {char: color}
function sprite(map, x, y, u, fills) {
  const out = [];
  map.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      const ch = row[c];
      if (ch === ".") { c++; continue; }
      let e = c;
      while (e < row.length && row[e] === ch) e++;
      const fill = typeof fills === "string" ? fills : fills[ch];
      out.push(`<rect x="${x + c * u}" y="${y + r * u}" width="${(e - c) * u}" height="${u}" fill="${fill}"/>`);
      c = e;
    }
  });
  return out.join("");
}

function lerpHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

function brickTile(x, y, T, fill, line) {
  const q = T / 4;
  let d = "";
  for (let k = 1; k < 4; k++) d += `M${x},${y + k * q}H${x + T}`;
  for (let k = 0; k < 4; k++) {
    const vx = k % 2 === 0 ? x + T / 2 : x;
    d += `M${vx},${y + k * q}V${y + (k + 1) * q}`;
  }
  return `<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${fill}"/><rect x="${x}" y="${y}" width="${T}" height="3" fill="#fff" opacity="0.22"/><path d="${d}" stroke="${line}" stroke-width="3" fill="none"/><rect x="${x}" y="${y}" width="${T}" height="${T}" fill="none" stroke="${line}" stroke-width="3"/>`;
}

// solid stair / flagpole block with a lit top-left and a shaded bottom-right edge
function hardBlock(x, y, T, fill, light, dark) {
  const b = Math.round(T / 10);
  return `<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${fill}"/>
    <path d="M${x},${y + T}V${y}H${x + T}L${x + T - b},${y + b}H${x + b}V${y + T - b}Z" fill="${light}"/>
    <path d="M${x + T},${y}V${y + T}H${x}L${x + b},${y + T - b}H${x + T - b}V${y + b}Z" fill="${dark}"/>
    <rect x="${x}" y="${y}" width="${T}" height="${T}" fill="none" stroke="#000" stroke-width="2" opacity="0.7"/>`;
}

const QBLOCK = [".XXX.", "X...X", "....X", "..XX.", "..X..", ".....", "..X.."];
const CLOUD = [
  "......XXXX......",
  "...XXXXXXXXXX...",
  "..XXXXXXXXXXXX..",
  ".XXXXXXXXXXXXXX.",
  "XXXXXXXXXXXXXXXX",
  "SSSSSSSSSSSSSSSS"
];
const CLOUD_S = [
  "...XXXX...",
  ".XXXXXXXX.",
  "XXXXXXXXXX",
  "SSSSSSSSSS"
];
const COIN = [".OO.", "OYYO", "OYYO", "OYYO", "OYYO", ".OO."];
const GOOMBA = [
  "......BBBB......",
  "....BBBBBBBB....",
  "...BBBBBBBBBB...",
  "..BBBBBBBBBBBB..",
  ".BBBWWBBBBWWBBB.",
  ".BBWWWWBBWWWWBB.",
  "BBBWWKWBBWKWWBBB",
  "BBBWWKWBBWKWWBBB",
  "BBBBWWWBBWWWBBBB",
  "BBBBBBBBBBBBBBBB",
  "....BBTTTTBB....",
  "...TTTTTTTTTT...",
  "...TTTTTTTTTT...",
  "..KKKK....KKKK..",
  ".KKKKK....KKKKK."
];
const MUSHROOM = [
  "....RRRRRR....",
  "..RRWWRRRRRR..",
  ".RRWWWWRRWWRR.",
  "RRRWWWWRRWWRRR",
  "RRRRWWRRRRRRRR",
  "RRRRRRRRRRRRRR",
  "..TTKTTTTKTT..",
  "..TTKTTTTKTT..",
  "..TTTTTTTTTT..",
  "...TTTTTTTT..."
];
const CASTLE = [
  "......X.X.X......",
  "......XXXXX......",
  "......XKXKX......",
  "......XXXXX......",
  "X.X.X.XXXXX.X.X.X",
  "XXXXXXXXXXXXXXXXX",
  "XXKKXXXXXXXXXKKXX",
  "XXKKXXXKKKXXXKKXX",
  "XXXXXXXKKKXXXXXXX",
  "XXXXXXXKKKXXXXXXX"
];
const FLAG = [
  ".......X",
  "......XX",
  ".....XXX",
  "....XXXX",
  "...XXXXX",
  "..XXXXXX",
  ".XXXXXXX",
  "XXXXXXXX"
];

const flipMap = m => m.map(row => [...row].reverse().join(""));

const PIRANHA = [
  "....RRRRRRRR....",
  "..RRRWWRRRRRRR..",
  ".RRRWWWRRRRWRRR.",
  ".RRRRWRRRRWWWRR.",
  "RRRRRRRRRRRRWRRR",
  "KWWKWWKWWKWWKWWK",
  ".KKKKKKKKKKKKKK.",
  "..RRRRRRRRRRRR..",
  "....RRRRRRRR....",
  "......GGGG......",
  "..GG..GGGG..GG..",
  ".GGGG.GGGG.GGGG.",
  "..GGGGGGGGGGGG..",
  "......GGGG......",
  "......GGGG......",
  "......GGGG......"
];
const CHEEP = [
  "....RRRRRR......",
  "..RRRRRRRRR..RR.",
  ".RRWWRRRRRRRRRRR",
  "RRWWKRRRRRRRRRR.",
  "RRRRRRRRRRRRRRRR",
  ".RRRRRRRRRRRR.RR",
  "..RRRRRRRRRR..RR",
  "....RRRRRR......"
];
const PODOBOO = [
  "..RR..",
  ".ROOR.",
  "ROYYOR",
  "ROYYOR",
  ".ROOR.",
  "..RR.."
];
const CAT = [
  "....K...K.....",
  "....KK.KK.....",
  "....KKKKK.....",
  "....KYKYK.....",
  "....KKKKK.....",
  ".....KKK......",
  "....KKKKK.....",
  "...KKKKKKK....",
  "...KKKKKKK...K",
  "..KKKKKKKK..KK",
  "..KKKKKKKKKKK.",
  "..KKKKKKKKKK.."
];

// dithered sky: stepped colour bands, checker-dithered where one melts into the next
function pixelSky(grad, height, U, levels) {
  const out = [];
  const rows = Math.ceil(height / U);
  for (let r = 0; r < rows; r++) {
    const q = (r / (rows - 1)) * (levels - 1);
    const lv = Math.floor(q);
    const y = r * U;
    out.push(`<rect x="0" y="${y}" width="${W}" height="${U + 1}" fill="${grad(lv / (levels - 1))}"/>`);
    if (q - lv > 0.62 && lv < levels - 1) {
      let d = "";
      for (let xi = r % 2; xi * U < W; xi += 2) d += `M${xi * U},${y}h${U}v${U}h-${U}z`;
      out.push(`<path d="${d}" fill="${grad((lv + 1) / (levels - 1))}"/>`);
    }
  }
  return out.join("");
}

// stepped (pixelated) disc
function pixelDisc(cx, cy, rad, fill, op, U) {
  let d = "";
  for (let dy = -rad; dy < rad; dy += U) {
    const m = dy + U / 2;
    const hw = Math.round(Math.sqrt(Math.max(0, rad * rad - m * m)) / U) * U;
    if (hw > 0) d += `M${cx - hw},${cy + dy}h${hw * 2}v${U}h-${hw * 2}z`;
  }
  return `<path d="${d}" fill="${fill}" opacity="${op}"/>`;
}

// mushroom-top platform on a trunk that runs off the bottom of the canvas
function treetop(x, y, w, T) {
  const tw = T;
  const tx = x + w / 2 - tw / 2;
  return `<rect x="${tx}" y="${y + T / 2}" width="${tw}" height="${H - y}" fill="#c87820" stroke="#5a2c00" stroke-width="4"/>
    <rect x="${tx + 10}" y="${y + T / 2}" width="8" height="${H - y}" fill="#fcb878" opacity="0.6"/>
    <rect x="${x}" y="${y}" width="${w}" height="${T / 2}" fill="#38c030" stroke="#00780c" stroke-width="4"/>
    <rect x="${x + 4}" y="${y + 3}" width="${w - 8}" height="6" fill="#a8f8a8" opacity="0.8"/>
    <rect x="${x + 4}" y="${y + T / 2 - 12}" width="${w - 8}" height="8" fill="#00780c" opacity="0.55"/>`;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// "?" block (mark given) or an empty used block (mark null), with lit top and corner rivets
function qBlock(x, y, T, fill, edge, mark) {
  const q = Math.round(T / 12);
  const rv = Math.round(T / 16);
  const rivets = [[5, 5], [T - 5 - rv, 5], [5, T - 5 - rv], [T - 5 - rv, T - 5 - rv]]
    .map(([dx, dy]) => `<rect x="${x + dx}" y="${y + dy}" width="${rv}" height="${rv}" fill="${edge}"/>`).join("");
  const shine = `<rect x="${x + 3}" y="${y + 3}" width="${T - 6}" height="${rv}" fill="#fff" opacity="0.28"/><rect x="${x + 3}" y="${y + T - 3 - rv}" width="${T - 6}" height="${rv}" fill="#000" opacity="0.18"/>`;
  const blink = mark && !reducedMotion() ? `<animate attributeName="fill" values="${fill};${fill};#c87800;${fill}" dur="1.2s" repeatCount="indefinite" calcMode="discrete"/>` : "";
  const body = `<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${fill}" stroke="${edge}" stroke-width="3">${blink}</rect>${shine}${rivets}`;
  return mark ? body + sprite(QBLOCK, x + (T - 5 * q) / 2, y + (T - 7 * q) / 2, q, mark) : body;
}

function pipe(x, groundY, h, hi, body, dark, T) {
  const w = T * 2;
  const top = groundY - h;
  const lip = T * 0.75;
  const inset = T * 0.125;
  return `<rect x="${x + inset}" y="${top + lip}" width="${w - 2 * inset}" height="${h - lip}" fill="${body}" stroke="${dark}" stroke-width="4"/>
    <rect x="${x + inset + 10}" y="${top + lip}" width="${T / 6}" height="${h - lip}" fill="${hi}" opacity="0.75"/>
    <rect x="${x + w - inset - T / 3}" y="${top + lip}" width="${T / 5}" height="${h - lip}" fill="${dark}" opacity="0.35"/>
    <rect x="${x}" y="${top}" width="${w}" height="${lip}" fill="${body}" stroke="${dark}" stroke-width="4"/>
    <rect x="${x + 12}" y="${top + 6}" width="${T / 6}" height="${lip - 12}" fill="${hi}" opacity="0.75"/>
    <rect x="${x + w - T / 3 - 6}" y="${top + 6}" width="${T / 5}" height="${lip - 12}" fill="${dark}" opacity="0.35"/>`;
}

// stepped hill with the two little eyes
function hill(cx, groundY, w, T, line, fill) {
  const dark = [];
  const green = [];
  const th = T / 2;
  let tiers = 0;
  for (let j = 0; (w - j * T) >= T; j++) {
    const wj = w - j * T;
    const y = groundY - (j + 1) * th;
    dark.push(`<rect x="${cx - wj / 2 - 6}" y="${y}" width="${wj + 12}" height="${th + 6}" fill="${line}"/>`);
    green.push(`<rect x="${cx - wj / 2}" y="${y + 6}" width="${wj}" height="${th}" fill="${fill}"/>`);
    tiers++;
  }
  let eyes = "";
  if (tiers >= 3) {
    const ey = groundY - (tiers - 1) * th - th * 0.2;
    eyes = `<rect x="${cx - 18}" y="${ey}" width="8" height="${th * 0.8}" fill="#000"/><rect x="${cx + 10}" y="${ey}" width="8" height="${th * 0.8}" fill="#000"/>`;
  }
  return dark.join("") + green.join("") + eyes;
}

function grain(p) {
  const v = p.isDark ? 1 : 0;
  return `
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 ${v}  0 0 0 0 ${v}  0 0 0 0 ${v}  0 0 0 0.55 0"/>
    </filter>
    <rect width="${W}" height="${H}" filter="url(#grain)" opacity="${p.isDark ? 0.10 : 0.07}"/>`;
}

function baseRect(p) {
  return `
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p.bgColor()}"/>
        <stop offset="1" stop-color="${p.bg2Color()}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#base)"/>`;
}

// closed Catmull-Rom spline through the points, written as cubic Beziers
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

// ---- Pixel City: painted pixel by pixel on a 300x225 canvas, then scaled 4x ----------
const PIXEL_GLYPHS = {
  A: [".X.", "X.X", "XXX", "X.X", "X.X"], B: ["XX.", "X.X", "XX.", "X.X", "XX."],
  C: [".XX", "X..", "X..", "X..", ".XX"], D: ["XX.", "X.X", "X.X", "X.X", "XX."],
  E: ["XXX", "X..", "XX.", "X..", "XXX"], F: ["XXX", "X..", "XX.", "X..", "X.."],
  H: ["X.X", "X.X", "XXX", "X.X", "X.X"], I: ["XXX", ".X.", ".X.", ".X.", "XXX"],
  L: ["X..", "X..", "X..", "X..", "XXX"], M: ["X.X", "XXX", "XXX", "X.X", "X.X"],
  N: ["XX.", "X.X", "X.X", "X.X", "X.X"], O: ["XXX", "X.X", "X.X", "X.X", "XXX"],
  P: ["XX.", "X.X", "XX.", "X..", "X.."], R: ["XX.", "X.X", "XX.", "X.X", "X.X"],
  S: [".XX", "X..", ".X.", "..X", "XX."], T: ["XXX", ".X.", ".X.", ".X.", ".X."],
  U: ["X.X", "X.X", "X.X", "X.X", "XXX"], 2: ["XX.", "..X", ".X.", "X..", "XXX"],
  4: ["X.X", "X.X", "XXX", "..X", "..X"]
};

function renderPixelCity(dark) {
  const PW = 300;
  const PH = 225;
  const S = 4;
  const cv = document.createElement("canvas");
  cv.width = PW;
  cv.height = PH;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const bay = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = a => "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => {
    const A = hx(a);
    const B = hx(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  };
  const px = (x, y, c) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  };
  const rect = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const ri = (a, b) => Math.floor(rand(a, b + 1));
  // colour from a ramp, dithered between the two nearest steps
  // flat bands; only a narrow checkerboard seam where one band melts into the next
  const rampAt = (ramp, q, x, y) => {
    const i = Math.max(0, Math.min(ramp.length - 2, Math.floor(q)));
    const f = q - i;
    if (f < 0.34) return ramp[i];
    if (f > 0.66) return ramp[i + 1];
    return (x + y) % 2 ? ramp[i + 1] : ramp[i];
  };
  // dithered additive-ish glow around a point
  const glow = (cx, cy, r, col, k) => {
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(PW, Math.ceil(cx + r));
    const y1 = Math.min(PH, Math.ceil(cy + r));
    if (x1 <= x0 || y1 <= y0) return;
    const id = g.getImageData(x0, y0, x1 - x0, y1 - y0);
    const d = id.data;
    const C = hx(col);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dd = Math.hypot(x - cx, y - cy);
        if (dd >= r) continue;
        const a = Math.round(Math.pow(1 - dd / r, 1.6) * k * 5) / 5;
        if (a <= 0) continue;
        const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
        d[i] += (C[0] - d[i]) * a;
        d[i + 1] += (C[1] - d[i + 1]) * a;
        d[i + 2] += (C[2] - d[i + 2]) * a;
      }
    }
    g.putImageData(id, x0, y0);
  };
  const text = (str, x, y, col) => {
    let cx = x;
    for (const ch of str) {
      const gl = PIXEL_GLYPHS[ch];
      if (!gl) continue;
      gl.forEach((row, r) => { for (let c = 0; c < 3; c++) if (row[c] === "X") px(cx + c, y + r, col); });
      cx += 4;
    }
    return cx - x - 1;
  };

  // ---- palette -----------------------------------------------------------------
  const skyNight = [
    ["#070a1f", "#0d1233", "#1a1650", "#2e1a62", "#53246f", "#8a2f78", "#c9487f", "#ff7f7a"],
    ["#04091a", "#07142b", "#0b2442", "#0f3a5c", "#175a73", "#23808a", "#d9807a", "#ffb48a"],
    ["#050816", "#0a1030", "#13204f", "#20346e", "#3a4f8c", "#6a6fa0", "#c08a8a", "#ffb36b"]
  ];
  const skyDay = [
    ["#4a86e8", "#6aa2f0", "#8dbcf6", "#b3d4f9", "#d5e6fa", "#fbe3cc", "#ffd2a8"],
    ["#5b8fe0", "#7aa7e8", "#9dc0ee", "#c4d8f2", "#f1dcd0", "#ffc9a0", "#ffb185"]
  ];
  const sky = dark ? choice(skyNight) : choice(skyDay);
  const hazeCol = sky[sky.length - 3];
  const glowCol = sky[sky.length - 2];
  const moonCol = dark ? "#e9e3c8" : "#fff6c8";
  const neons = dark ? ["#ff4fa0", "#38e8ff", "#ffd866", "#a1ff7a", "#ff7a3c"] : ["#e8508c", "#2fa8c8", "#e0a020", "#58b840", "#e86a2c"];
  const lits = dark ? ["#ffd37a", "#ffd37a", "#ffb454", "#fff0b0", "#7be8ff", "#ff8fc0", "#b9a4ff"] : ["#bfe0ff", "#9ccaf2", "#bfe0ff", "#ffe9a8"];
  const dk = dark ? "#05030f" : "#1a2548";
  const fg = dark ? "#06040f" : "#2b3550";
  const fgRim = dark ? "#3a2f7a" : "#8aa0d0";
  const LAY = [0, 1, 2].map(i => {
    const wall = dark ? mix(hazeCol, "#05030f", [0.45, 0.72, 0.9][i]) : mix(hazeCol, "#4a68a8", [0.4, 0.66, 0.88][i]);
    return {
      wall,
      mid: mix(wall, glowCol, [0.12, 0.16, 0.2][i]),
      low: mix(wall, glowCol, [0.3, 0.34, 0.4][i]),
      edge: dark ? mix(wall, moonCol, [0.5, 0.4, 0.3][i]) : mix(wall, "#ffffff", [0.4, 0.45, 0.5][i]),
      shade: dark ? mix(wall, "#000000", 0.4) : mix(wall, "#1a2a5a", 0.3)
    };
  });
  const blinkLit = [];
  const blinkOff = [];
  const horizonY = 176;
  const baseY = 187;
  const railTop = 168;
  const deckY = 188;

  // ---- sky ---------------------------------------------------------------------
  for (let y = 0; y < baseY; y++) {
    const q = Math.pow(y / horizonY, 1.35) * (sky.length - 1);
    for (let x = 0; x < PW; x++) px(x, y, rampAt(sky, q, x, y));
  }
  const moonX = ri(60, 240);
  const moonY = ri(26, 54);
  const MR = 16;
  glow(moonX, moonY, 62, dark ? "#7c80d8" : "#fff2c0", dark ? 0.5 : 0.6);
  glow(moonX, moonY, 30, dark ? "#c8cdf8" : "#ffffff", dark ? 0.5 : 0.8);
  if (dark) {
    for (let i = 0; i < 80; i++) {
      const x = ri(0, PW - 1);
      const y = ri(0, 112);
      if (Math.hypot(x - moonX, y - moonY) < MR + 12) continue;
      px(x, y, choice(["#ffffff", "#ffffff", "#bcd0ff", "#ffe9b0", "#7e86c8"]));
    }
    for (let i = 0; i < 7; i++) {
      const x = ri(6, PW - 7);
      const y = ri(6, 90);
      const c = choice(["#ffffff", "#cfe0ff"]);
      px(x, y, c);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => px(x + dx, y + dy, "#5a62a8"));
    }
  }
  // moon / sun disc: a lit face, a soft terminator band and a few craters
  for (let y = -MR; y <= MR; y++) {
    for (let x = -MR; x <= MR; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > MR) continue;
      let c = moonCol;
      if (dark) {
        const sh = (x / MR) * 0.6 + (y / MR) * 0.3;
        c = sh > 0.5 ? "#a3a18a" : sh > 0.3 ? "#c4c1a6" : moonCol;
      } else if (d > MR - 1.5) c = "#ffe9a0";
      px(moonX + x, moonY + y, c);
    }
  }
  if (dark) {
    [[-5, -4, 3], [3, 3, 2], [-2, 7, 2]].forEach(([dx, dy, r]) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.hypot(x, y) <= r + 0.2) px(moonX + dx + x, moonY + dy + y, "#b4b198");
    });
  }

  // ---- clouds ------------------------------------------------------------------
  const cloud = (cx, cy, w, h) => {
    const phase = rand(0, 6);
    for (let x = Math.round(cx - w / 2); x <= cx + w / 2; x++) {
      const u = (x - cx) / (w / 2);
      const env = Math.sqrt(Math.max(0, 1 - u * u));
      const th = h * env * (0.65 + 0.35 * Math.sin(x * 0.55 + phase) * Math.sin(x * 0.21 + phase * 2));
      const y0 = Math.round(cy - th / 2);
      const y1 = Math.round(cy + th / 2);
      for (let y = y0; y <= y1; y++) {
        let c;
        if (dark) {
          const body = mix(sky[2], "#05030f", 0.5);
          const nearMoon = Math.hypot(x - moonX, y - moonY) < 54;
          c = y === y0 ? (nearMoon ? mix(body, moonCol, 0.55) : mix(body, sky[4], 0.4)) : y === y1 ? mix(body, glowCol, 0.45) : body;
        } else {
          c = y === y0 ? "#ffffff" : y >= y1 - 1 ? "#b9cff0" : y > cy ? "#dbe8fb" : "#f4f8ff";
        }
        px(x, y, c);
      }
    }
  };
  const nClouds = ri(3, 4);
  for (let i = 0; i < nClouds; i++) {
    const cx = ri(10, PW - 10);
    const cy = ri(20, 100);
    const w = ri(34, 90);
    cloud(cx, cy, w, ri(7, 11));
    if (!dark) cloud(cx + ri(-10, 10), cy - ri(2, 4), w * 0.6, ri(5, 8));
  }

  // ---- buildings ---------------------------------------------------------------
  const LP = [
    { minW: 12, maxW: 22, minH: 40, maxH: 88, wx: 1, wy: 2, px: 3, py: 4, margin: 2, chance: 0.2, detail: false },
    { minW: 16, maxW: 30, minH: 56, maxH: 112, wx: 2, wy: 3, px: 4, py: 5, margin: 2, chance: 0.34, detail: false },
    { minW: 20, maxW: 38, minH: 76, maxH: 140, wx: 3, wy: 3, px: 5, py: 6, margin: 3, chance: 0.46, detail: true }
  ];
  const windows = (b, li, topY) => {
    const P = LP[li];
    const L = LAY[li];
    const cols = Math.floor((b.w - 2 * P.margin + (P.px - P.wx)) / P.px);
    if (cols < 1) return;
    const x0 = b.x + Math.floor((b.w - (cols * P.px - (P.px - P.wx))) / 2);
    const bias = rand(0.45, 1.4) * P.chance;
    const main = choice(lits);
    const colLit = Array.from({ length: cols }, () => Math.random() < bias + 0.12);
    for (let yy = topY + 4; yy + P.wy < baseY - 2; yy += P.py) {
      const roll = Math.random();
      const mode = roll < 0.2 ? "off" : roll < 0.3 ? "full" : "cols";
      for (let c = 0; c < cols; c++) {
        const lit = mode === "full" || (mode === "cols" && (Math.random() < 0.7 ? colLit[c] : Math.random() < bias));
        const wx = x0 + c * P.px;
        if (!lit) {
          if (li === 2) {
            rect(wx, yy, P.wx, P.wy, mix(L.wall, dark ? "#3a3686" : "#ffffff", dark ? 0.14 : 0.2));
            blinkOff.push({ x: wx, y: yy, w: P.wx, h: P.wy, col: main });
          }
          continue;
        }
        const col = Math.random() < 0.85 ? main : choice(lits);
        rect(wx, yy, P.wx, P.wy, col);
        if (P.detail) rect(wx, yy, P.wx, 1, mix(col, "#ffffff", 0.4));
        if (li > 0) blinkLit.push({ x: wx, y: yy, w: P.wx, h: P.wy, col: L.wall });
      }
    }
  };
  const body = (b, li, topY) => {
    const L = LAY[li];
    const lx = moonX < b.x + b.w / 2;
    for (let y = topY; y < baseY; y++) {
      const t = (y - (baseY - 46)) / 46;
      if (t <= 0) rect(b.x, y, b.w, 1, L.wall);
      else for (let x = b.x; x < b.x + b.w; x++) px(x, y, rampAt([L.wall, L.mid, L.low], t * 2, x, y));
    }
    rect(lx ? b.x : b.x + b.w - 1, topY, 1, baseY - topY, L.edge);
    rect(lx ? b.x + b.w - 1 : b.x, topY, 1, baseY - topY, L.shade);
    rect(b.x, topY, b.w, 1, L.edge);
  };
  const neonBoard = (x, y, word, col, vertical) => {
    const n = word.length;
    const w = vertical ? 5 : n * 4 + 2;
    const h = vertical ? n * 7 + 1 : 9;
    if (dark) glow(x + w / 2, y + h / 2, Math.max(w, h) * 0.9 + 4, col, 0.5);
    rect(x, y, w, h, dark ? "#0a0716" : "#33406a");
    rect(x, y, w, 1, col);
    rect(x, y + h - 1, w, 1, col);
    rect(x, y, 1, h, col);
    rect(x + w - 1, y, 1, h, col);
    if (vertical) [...word].forEach((ch, i) => text(ch, x + 1, y + 2 + i * 7, dark ? mix(col, "#ffffff", 0.35) : "#ffffff"));
    else text(word, x + 2, y + 2, dark ? mix(col, "#ffffff", 0.35) : "#ffffff");
  };
  const roofOf = (b, li) => {
    const L = LAY[li];
    const t = b.top;
    const r = b.roof;
    if (r === "ac") {
      let x = b.x + 2;
      while (x < b.x + b.w - 5) {
        const w = ri(3, 5);
        rect(x, t - 2, w, 2, L.wall);
        rect(x, t - 2, w, 1, L.edge);
        x += w + ri(2, 5);
      }
    } else if (r === "antenna") {
      const ax = b.x + Math.floor(b.w / 2);
      const hh = ri(7, 16);
      rect(ax, t - hh, 1, hh, L.shade);
      rect(ax - 2, t - Math.floor(hh * 0.6), 5, 1, L.shade);
      rect(ax - 1, t - hh + 3, 3, 1, L.shade);
      px(ax, t - hh - 1, "#ff4a4a");
      if (dark) glow(ax, t - hh - 1, 4, "#ff4a4a", 0.5);
    } else if (r === "tank") {
      const tx = b.x + 3;
      rect(tx, t - 4, 1, 4, L.shade);
      rect(tx + 5, t - 4, 1, 4, L.shade);
      rect(tx - 1, t - 9, 8, 5, L.wall);
      rect(tx - 1, t - 9, 8, 1, L.edge);
      rect(tx, t - 11, 6, 2, L.wall);
      rect(tx + 2, t - 12, 2, 1, L.wall);
    } else if (r === "setback" && li > 0) {
      const inset = ri(3, 5);
      const nb = { x: b.x + inset, w: b.w - 2 * inset, top: t - ri(9, 18) };
      if (nb.w >= 8) {
        body(nb, li, nb.top);
        windows(nb, li, nb.top);
        if (Math.random() < 0.6) {
          const ax = nb.x + Math.floor(nb.w / 2);
          rect(ax, nb.top - 8, 1, 8, L.shade);
          px(ax, nb.top - 9, "#ff4a4a");
        }
      }
    } else if (r === "gable" && b.w <= 24) {
      const half = Math.floor(b.w / 2);
      for (let i = 0; i < half; i++) {
        rect(b.x + i, t - 1 - Math.floor(i * 0.7), b.w - 2 * i, 1, i === 0 ? L.edge : L.wall);
      }
      rect(b.x + b.w - 6, t - 8, 2, 5, L.shade);
    } else if (r === "sign" && li > 0) {
      const word = choice(["HOTEL", "BAR", "RAMEN", "CAFE", "DISCO", "PUB", "24H"]);
      const col = choice(neons);
      const w = word.length * 4 + 2;
      const sx = b.x + Math.max(1, Math.floor((b.w - w) / 2));
      rect(sx + 2, t - 5, 1, 5, L.shade);
      rect(sx + w - 3, t - 5, 1, 5, L.shade);
      neonBoard(sx, t - 14, word, col, false);
    }
  };
  const build = li => {
    const P = LP[li];
    const items = [];
    let x = -ri(0, 6);
    while (x < PW) {
      const w = ri(P.minW, P.maxW);
      const h = ri(P.minH, P.maxH);
      items.push({ x, w, top: baseY - h, roof: choice(["ac", "ac", "antenna", "tank", "setback", "gable", "sign", "ac"]) });
      x += w - (Math.random() < 0.25 ? ri(1, 3) : 0) + (Math.random() < 0.15 ? ri(2, 6) : 0);
    }
    return items;
  };

  const focalIdx = 1;
  LAY.forEach((_, li) => {
    const items = build(li);
    let tower = -1;
    if (li === focalIdx) {
      tower = Math.floor(items.length * rand(0.25, 0.7));
      items[tower].w = 26;
      items[tower].top = baseY - 142;
    }
    items.forEach((b, bi) => {
      body(b, li, b.top);
      windows(b, li, b.top);
      if (bi === tower) {
        // art-deco tower: three setbacks, a lit crown and a needle
        const L = LAY[li];
        let tw = b.w;
        let ty = b.top;
        [[6, 14], [5, 10], [4, 8]].forEach(([inset, hh]) => {
          tw -= inset;
          const nb = { x: b.x + Math.floor((b.w - tw) / 2), w: tw, top: ty - hh };
          body(nb, li, nb.top);
          rect(nb.x, nb.top + hh - 1, nb.w, 1, L.edge);
          for (let wy = nb.top + 3; wy < ty - 1; wy += 4) for (let wx = nb.x + 2; wx < nb.x + nb.w - 2; wx += 3) if (Math.random() < 0.5) px(wx, wy, "#ffd37a");
          ty = nb.top;
        });
        const cx = b.x + Math.floor(b.w / 2);
        rect(cx, ty - 14, 1, 14, L.edge);
        px(cx, ty - 15, "#ff4a4a");
        if (dark) {
          glow(cx, ty + 6, 18, "#ffb454", 0.55);
          glow(cx, ty - 15, 5, "#ff4a4a", 0.5);
        }
        return;
      }
      roofOf(b, li);
      if (li >= 1 && b.w >= 14 && Math.random() < 0.38) {
        const word = choice(["BAR", "HOTEL", "RAMEN", "CAFE", "DISCO", "PUB", "24H"]);
        const vertical = word.length <= 4 && Math.random() < 0.6;
        neonBoard(b.x + (Math.random() < 0.5 ? 2 : Math.max(2, b.w - (vertical ? 7 : word.length * 4 + 4))), b.top + ri(10, 34), word, choice(neons), vertical);
      }
    });

    // an elevated train between the middle and the nearest towers
    if (li === 1 && Math.random() < 0.8) {
      const ty = baseY - ri(52, 74);
      const beam = mix(LAY[1].wall, dk, 0.45);
      rect(0, ty, PW, 2, beam);
      rect(0, ty - 1, PW, 1, LAY[1].edge);
      for (let x = 6; x < PW; x += 24) rect(x, ty + 2, 3, baseY - ty, beam);
      const trainX = ri(-10, 120);
      const body1 = dark ? "#2a2060" : "#e4ecf8";
      for (let c = 0; c < 3; c++) {
        const cx = trainX + c * 36;
        rect(cx, ty - 10, 34, 9, body1);
        rect(cx, ty - 10, 34, 1, dark ? "#5a4aa8" : "#ffffff");
        rect(cx, ty - 2, 34, 1, dark ? "#120c38" : "#9fb2d8");
        for (let k = 0; k < 7; k++) rect(cx + 3 + k * 4, ty - 8, 2, 3, dark ? "#ffd37a" : "#8fb8e8");
      }
      if (dark) glow(trainX + 108, ty - 5, 8, "#fff0b0", 0.6);
    }
  });

  // ---- foreground: our rooftop ---------------------------------------------------
  const tdir = Math.random() < 0.5 ? 1 : -1;
  const tx = tdir > 0 ? ri(6, 24) : PW - ri(6, 24) - 22;
  const tankY = ri(78, 96);
  const rimLeft = moonX < tx + 11;
  // water tower: a stepped roof over a barrel, on a braced frame
  const TW = 22;
  const rimX = rimLeft ? tx : tx + TW - 1;
  for (let i = 0; i < 6; i++) rect(tx + 1 + i, tankY - 6 + i, TW - 2 - 2 * i, 1, fg);
  rect(tx, tankY, TW, 18, fg);
  rect(rimX, tankY, 1, 18, fgRim);
  for (let i = 0; i < 6; i++) px(rimLeft ? tx + 1 + i : tx + TW - 2 - i, tankY - 6 + i, fgRim);
  rect(tx, tankY + 5, TW, 1, mix(fg, fgRim, 0.55));
  rect(tx, tankY + 12, TW, 1, mix(fg, fgRim, 0.55));
  for (let x = tx + 4; x < tx + TW - 2; x += 5) rect(x, tankY + 1, 1, 17, mix(fg, fgRim, 0.18));
  [2, TW - 4].forEach(o => rect(tx + o, tankY + 18, 2, deckY - tankY - 18, fg));
  const legH = deckY - tankY - 18;
  for (let i = 0; i < legH; i++) {
    const xx = Math.round(((TW - 6) * i) / legH);
    px(tx + 3 + xx, tankY + 18 + i, fg);
    px(tx + TW - 4 - xx, tankY + 18 + i, fg);
  }
  // antenna mast on the other side
  const mx = tdir > 0 ? PW - ri(24, 56) : ri(24, 56);
  const mastTop = ri(48, 68);
  rect(mx, mastTop, 2, deckY - mastTop, fg);
  rect(mx - 6, mastTop + 6, 14, 1, fg);
  rect(mx - 4, mastTop + 14, 10, 1, fg);
  rect(mx - 2, mastTop + 22, 6, 1, fg);
  for (let i = 0; i < 40; i++) {
    px(mx + 1 - Math.floor(i * 0.9), mastTop + 16 + Math.floor(i * ((deckY - mastTop - 16) / 40)), fg);
    px(mx + 1 + Math.floor(i * 0.9), mastTop + 16 + Math.floor(i * ((deckY - mastTop - 16) / 40)), fg);
  }
  px(mx, mastTop - 1, "#ff4a4a");
  if (dark) glow(mx, mastTop - 1, 5, "#ff4a4a", 0.6);
  // string lights, hung from the tower roof to the mast
  const x1 = tx + 11;
  const y1 = tankY - 6;
  const x2 = mx + 1;
  const y2 = mastTop + 12;
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  const sag = ri(14, 26);
  const wireY = x => {
    const t = (x - x1) / (x2 - x1);
    return y1 + (y2 - y1) * t + sag * 4 * t * (1 - t);
  };
  for (let x = lo; x <= hi; x++) px(x, Math.round(wireY(x)), fg);
  for (let x = lo + 5; x < hi - 2; x += 7) {
    const col = choice(["#ffd37a", "#ffd37a", "#ff8fc0", "#7be8ff"]);
    const y = Math.round(wireY(x)) + 1;
    if (dark) glow(x, y, 6, col, 0.55);
    px(x, y, col);
    px(x, y + 1, mix(col, "#ffffff", 0.3));
  }
  // deck, railing, cat, plant
  rect(0, deckY, PW, PH - deckY, dark ? "#0c0820" : "#46506e");
  rect(0, deckY, PW, 1, mix(fg, fgRim, 0.5));
  for (let k = 1; k < 4; k++) rect(0, deckY + k * 9, PW, 1, dark ? "#05030f" : "#2f3852");
  if (dark) {
    for (let i = 0; i < 5; i++) {
      const x = ri(0, PW - 3);
      rect(x, deckY + 1, 2, ri(3, 12), mix("#0c0820", choice(neons), 0.18));
    }
  }
  const catX = ri(110, 190);
  const catSprite = [
    "....K...K.....", "....KK.KK.....", "....KKKKK.....", "....KYKYK.....", "....KKKKK.....", ".....KKK......",
    "....KKKKK.....", "...KKKKKKK....", "...KKKKKKK...K", "..KKKKKKKK..KK", "..KKKKKKKKKKK.", "..KKKKKKKKKK.."
  ];
  const catTop = railTop - catSprite.length;
  catSprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "K") px(catX + c, railTop - catSprite.length + r, fg);
      else if (row[c] === "Y") px(catX + c, railTop - catSprite.length + r, dark ? "#ffd866" : "#fff6a8");
    }
  });
  for (let r = 0; r < catSprite.length; r++) {
    const c = rimLeft ? catSprite[r].indexOf("K") : catSprite[r].lastIndexOf("K");
    if (c >= 0 && r > 4) px(catX + c, railTop - catSprite.length + r, fgRim);
  }
  rect(0, railTop, PW, 2, fg);
  rect(0, railTop, PW, 1, fgRim);
  rect(0, railTop + 8, PW, 1, fg);
  for (let x = 2; x < PW; x += 6) rect(x, railTop + 2, 1, deckY - railTop - 2, fg);
  const potX = ri(60, 240);
  rect(potX, deckY + 2, 8, 5, fg);
  rect(potX - 1, deckY + 1, 10, 1, fgRim);
  [[-3, -7], [0, -10], [3, -7], [-2, -4], [2, -4]].forEach(([dx, dy]) => {
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let s = 0; s <= steps; s++) px(potX + 4 + Math.round((dx * s) / steps), deckY + 1 + Math.round((dy * s) / steps), fg);
    px(potX + 4 + dx, deckY + 1 + dy - 1, fg);
  });

  // ---- vignette: a few flat darkening bands towards the edges ----------------
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const u = (x - PW / 2) / (PW / 2);
      const v = (y - PH / 2) / (PH / 2);
      const a = Math.round(Math.pow(Math.min(1, Math.hypot(u, v * 0.9) / 1.35), 3.2) * (dark ? 0.55 : 0.28) * 6) / 6;
      if (a <= 0) continue;
      g.fillStyle = dark ? `rgba(2,1,10,${a})` : `rgba(26,37,72,${a})`;
      g.fillRect(x, y, 1, 1);
    }
  }

  // scale up with hard pixels
  const out = document.createElement("canvas");
  out.width = PW * S;
  out.height = PH * S;
  const og = out.getContext("2d");
  og.imageSmoothingEnabled = false;
  og.drawImage(cv, 0, 0, PW * S, PH * S);

  // ---- animated overlay: a few flickering windows, blinking cat eyes, rain ----------
  let overlay = "";
  if (!reducedMotion()) {
    const pick = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
    const flick = (w, fill) => {
      const dur = rand(7, 16);
      const t0 = rand(0.15, 0.7);
      return `<rect x="${w.x * S}" y="${w.y * S}" width="${w.w * S}" height="${w.h * S}" fill="${fill}" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;${t0.toFixed(2)};${(t0 + rand(0.12, 0.3)).toFixed(2)}" dur="${dur.toFixed(1)}s" begin="-${rand(0, dur).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/></rect>`;
    };
    overlay += pick(blinkLit, 12).map(w => flick(w, w.col)).join("");
    overlay += pick(blinkOff, 8).map(w => flick(w, w.col)).join("");
    const catDur = rand(4.5, 6.5);
    [[catX + 5, catTop + 3], [catX + 7, catTop + 3]].forEach(([ex, ey]) => {
      overlay += `<rect x="${ex * S}" y="${ey * S}" width="${S}" height="${S}" fill="${fg}" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;0.94;0.985" dur="${catDur.toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/></rect>`;
    });
    if (dark) {
      // one rain tile, slid diagonally in 8 steps (about 10 fps), so it stays cheap
      let drops = "";
      for (let i = 0; i < 26; i++) {
        const x = ri(12, 228);
        const y = ri(0, 228);
        drops += `<rect x="${x}" y="${y}" width="4" height="4"/><rect x="${x - 4}" y="${y + 4}" width="4" height="4"/><rect x="${x - 8}" y="${y + 8}" width="4" height="4"/>`;
      }
      const steps = Array.from({ length: 8 }, (_, i) => `${-i * 30} ${i * 30}`).join(";");
      overlay += `<defs><pattern id="rain" width="240" height="240" patternUnits="userSpaceOnUse"><g fill="#b9d0ff" opacity="0.5">${drops}</g><animateTransform attributeName="patternTransform" type="translate" values="${steps}" dur="0.8s" repeatCount="indefinite" calcMode="discrete"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#rain)"/>`;
    }
  }
  return { url: out.toDataURL("image/png"), overlay };
}

// ---- knit / cross-stitch bands, shared by Fair Isle, Andean and Slavic ---------------------
const KNIT_MOTIFS = {
  snow: ["X...X...X", ".X..X..X.", "..X.X.X..", "...XXX...", "XXXXXXXXX", "...XXX...", "..X.X.X..", ".X..X..X.", "X...X...X"],
  star8: ["...X...", ".X.X.X.", "..XXX..", "XXXOXXX", "..XXX..", ".X.X.X.", "...X..."],
  diam: ["...X...", "..XOX..", ".XOOOX.", "XOOXOOX", ".XOOOX.", "..XOX..", "...X..."],
  tree: ["...X...", "..XXX..", ".X.X.X.", "...X...", "..XXX..", ".X.X.X.", "...X...", "...X...", "...X..."],
  rozha: ["....X....", "...XXX...", "..X.X.X..", ".XX.X.XX.", "XXXXOXXXX", ".XX.X.XX.", "..X.X.X..", "...XXX...", "....X...."],
  hook: [".....X.....", "....XXX....", "...XX.XX...", "..XX...XX..", ".XX..X..XX.", "XX..XXX..XX", ".XX..X..XX.", "..XX...XX..", "...XX.XX...", "....XXX....", ".....X....."],
  step: ["....X....", "...XXX...", "..XXXXX..", ".XXXXXXX.", "XXXXOXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."],
  fret: ["XXXXXXXX", "X......X", "X.XXXX.X", "X.X..X.X", "X.X.XX.X", "X.X....X", "X.XXXXXX", "X......."]
};
const KNIT_BORDERS = [
  ["X...X...", ".X.X.X.X", "..X...X."],
  ["XX..XX..", ".XXXX...", "..XX..XX"],
  ["X.X.X.X.", ".X.X.X.X", "X.X.X.X."],
  ["..X...X.", ".X.X.X.X", "X...X..."]
];

// bands: [{bg, a, b}], motifs: names from KNIT_MOTIFS
function knitBands(opt) {
  const u = opt.u;
  const parts = [];
  const paths = {};
  const add = (c, x, y) => {
    paths[c] = (paths[c] || "") + (opt.cross ? `M${x},${y}l${u},${u}M${x + u},${y}l${-u},${u}` : `M${x},${y}h${u}v${u}h${-u}z`);
  };
  const draw = (map, x0, y0, a, b) => {
    map.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "X") add(a, x0 + c * u, y0 + r * u);
        else if (row[c] === "O") add(b, x0 + c * u, y0 + r * u);
      }
    });
  };
  let y = 0;
  let band = 0;
  while (y < H) {
    const B = opt.bands[band % opt.bands.length];
    if (band % 2 === 0) {
      const rows = choice(KNIT_BORDERS);
      const h = (rows.length + 2) * u;
      parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${B.bg}"/>`);
      for (let x = 0; x < W; x += rows[0].length * u) draw(rows, x, y + u, B.a, B.b);
      y += h;
    } else {
      const m = KNIT_MOTIFS[choice(opt.motifs)];
      const gap = 3;
      const h = (m.length + 4) * u;
      parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${B.bg}"/>`);
      const step = (m[0].length + gap) * u;
      for (let x = Math.round(rand(0, 1) * u); x < W; x += step) draw(m, x, y + 2 * u, B.a, B.b);
      y += h;
    }
    band++;
  }
  const out = Object.keys(paths).map(c => opt.cross
    ? `<path d="${paths[c]}" stroke="${c}" stroke-width="${(u * 0.34).toFixed(1)}" stroke-linecap="round" fill="none"/>`
    : `<path d="${paths[c]}" fill="${c}"/>`);
  return `<g shape-rendering="${opt.cross ? "auto" : "crispEdges"}">${parts.join("")}${out.join("")}</g>`;
}

const styles = {
  Aurora(p) {
    const blobs = [];
    const n = Math.floor(rand(6, 9));
    for (let i = 0; i < n; i++) {
      blobs.push(`<ellipse cx="${rand(-100, W + 100).toFixed(0)}" cy="${rand(0, H).toFixed(0)}" rx="${rand(220, 480).toFixed(0)}" ry="${rand(70, 190).toFixed(0)}" transform="rotate(${rand(-45, 45).toFixed(0)} ${W / 2} ${H / 2})" fill="${p.color(i, p.isDark ? 0.6 : 0.5)}"/>`);
    }
    return `${baseRect(p)}
      <defs><filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="85"/></filter></defs>
      <g filter="url(#blur)">${blobs.join("")}</g>
      ${grain(p)}`;
  },

  Synthwave(p) {
    const horizon = H * rand(0.52, 0.62);
    const cx = W / 2;
    const sunY = horizon - 70;
    skinAnchor = { x: 0.5, y: sunY / H };
    const stripes = [];
    for (let i = 0; i < 8; i++) {
      stripes.push(`<rect x="0" y="${(sunY + 20 + i * 26).toFixed(0)}" width="${W}" height="${(3 + i * 3.2).toFixed(1)}" fill="black"/>`);
    }
    const hLines = [];
    for (let i = 1; i <= 14; i++) {
      const y = horizon + Math.pow(i / 14, 2.1) * (H - horizon);
      hLines.push(`<line x1="0" y1="${y.toFixed(0)}" x2="${W}" y2="${y.toFixed(0)}"/>`);
    }
    const vLines = [];
    for (let k = -22; k <= 22; k++) {
      vLines.push(`<line x1="${cx.toFixed(0)}" y1="${horizon.toFixed(0)}" x2="${(cx + k * 150).toFixed(0)}" y2="${H}"/>`);
    }
    return `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${p.bgColor()}"/>
          <stop offset="0.7" stop-color="${p.color(2, p.isDark ? 0.45 : 0.35)}"/>
          <stop offset="1" stop-color="${p.color(1, p.isDark ? 0.7 : 0.55)}"/>
        </linearGradient>
        <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${p.color(0)}"/>
          <stop offset="1" stop-color="${p.color(1)}"/>
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${p.bg2Color()}"/>
          <stop offset="1" stop-color="${p.bgColor()}"/>
        </linearGradient>
        <mask id="cut"><rect width="${W}" height="${H}" fill="white"/>${stripes.join("")}</mask>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#sky)"/>
      <circle cx="${cx.toFixed(0)}" cy="${sunY.toFixed(0)}" r="230" fill="${p.color(0, 0.25)}" filter="url(#glow)"/>
      <circle cx="${cx.toFixed(0)}" cy="${sunY.toFixed(0)}" r="190" fill="url(#sun)" mask="url(#cut)"/>
      <rect y="${horizon.toFixed(0)}" width="${W}" height="${(H - horizon).toFixed(0)}" fill="url(#ground)"/>
      <g stroke="${p.color(0, 0.75)}" stroke-width="1.6" filter="url(#glow)">${hLines.join("")}${vLines.join("")}</g>
      <g stroke="${p.color(0, 0.9)}" stroke-width="0.8">${hLines.join("")}${vLines.join("")}</g>
      ${grain(p)}`;
  },

  Contour(p) {
    const groups = [];
    const centers = Math.floor(rand(2, 4));
    for (let c = 0; c < centers; c++) {
      const cx = rand(0, W);
      const cy = rand(0, H);
      const rings = Math.floor(rand(14, 22));
      const step = rand(26, 44);
      const ph = [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)];
      const amp = [rand(0.05, 0.14), rand(0.03, 0.09), rand(0.02, 0.06)];
      for (let i = 1; i <= rings; i++) {
        const pts = [];
        for (let a = 0; a < 48; a++) {
          const t = (a / 48) * Math.PI * 2;
          const r = i * step * (1 + amp[0] * Math.sin(2 * t + ph[0] + i * 0.09) + amp[1] * Math.sin(3 * t + ph[1] - i * 0.07) + amp[2] * Math.sin(5 * t + ph[2] + i * 0.05));
          pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
        const op = Math.max(0.18, 0.85 - i / rings * 0.6);
        groups.push(`<path d="${smoothClosed(pts)}" fill="none" stroke="${p.color(c + (i % 3 === 0 ? 1 : 0), op)}" stroke-width="${i % 5 === 0 ? 2.2 : 1.1}" stroke-linejoin="round"/>`);
      }
    }
    return `${baseRect(p)}${groups.join("")}${grain(p)}`;
  },

  Bokeh(p) {
    const dots = [];
    const n = Math.floor(rand(28, 46));
    for (let i = 0; i < n; i++) {
      const r = rand(18, 150);
      const a = rand(0.12, p.isDark ? 0.5 : 0.4);
      dots.push(`<circle cx="${rand(0, W).toFixed(0)}" cy="${rand(0, H).toFixed(0)}" r="${r.toFixed(0)}" fill="${p.color(i, a)}" stroke="${p.color(i, Math.min(0.7, a + 0.2))}" stroke-width="1.5"/>`);
    }
    return `${baseRect(p)}
      <defs>
        <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${rand(2, 6).toFixed(1)}"/></filter>
        <filter id="deep" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="60"/></filter>
      </defs>
      <ellipse cx="${rand(200, 1000).toFixed(0)}" cy="${rand(200, 700).toFixed(0)}" rx="420" ry="300" fill="${p.color(0, 0.4)}" filter="url(#deep)"/>
      <g filter="url(#soft)">${dots.join("")}</g>
      ${grain(p)}`;
  },

  // the sun sits exactly at the middle of the picture; skins.js slides that point
  // behind the Play button (see anchor in generateSkin)
  Pulse(p) {
    const cx = W / 2;
    const cy = H / 2;
    skinAnchor = { x: 0.5, y: 0.5 };
    const bars = 160;
    const inner = rand(120, 190);
    const f1 = rand(2, 6);
    const f2 = rand(7, 15);
    const lines = [];
    for (let i = 0; i < bars; i++) {
      const t = (i / bars) * Math.PI * 2;
      const len = 30 + Math.abs(Math.sin(f1 * t + 1) * 160 + Math.sin(f2 * t) * 70) + rand(0, 55);
      const x1 = cx + inner * Math.cos(t);
      const y1 = cy + inner * Math.sin(t);
      const x2 = cx + (inner + len) * Math.cos(t);
      const y2 = cy + (inner + len) * Math.sin(t);
      const mix = Math.abs(Math.sin(t * 1.5));
      const a = p.accents[0];
      const b = p.accents[1];
      const hue = a.h + (((b.h - a.h + 540) % 360) - 180) * mix;
      lines.push(`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="hsl(${hue.toFixed(0)},${a.s.toFixed(0)}%,${a.l.toFixed(0)}%)"/>`);
    }
    return `${baseRect(p)}
      <defs>
        <radialGradient id="core"><stop offset="0" stop-color="${p.color(0, 0.55)}"/><stop offset="1" stop-color="${p.color(0, 0)}"/></radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(inner * 3.4).toFixed(0)}" fill="url(#core)"/>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(inner * 0.78).toFixed(0)}" fill="none" stroke="${p.color(0, 0.6)}" stroke-width="2"/>
      <g stroke-width="5" stroke-linecap="round" filter="url(#glow)" opacity="0.7">${lines.join("")}</g>
      <g stroke-width="3" stroke-linecap="round">${lines.join("")}</g>
      ${grain(p)}`;
  },

  Kente(p) {
    const parts = [];
    let x = 0;
    let i = 0;
    while (x < W) {
      const w = Math.round(rand(54, 130));
      const c1 = p.color(i);
      const c2 = p.color(i + 1 + Math.floor(rand(0, 3)));
      const c3 = p.color(i + 2);
      const type = choice(["solid", "blocks", "zigzag", "bands"]);
      parts.push(`<rect x="${x}" y="0" width="${w}" height="${H}" fill="${c1}"/>`);
      if (type === "blocks") {
        const sz = 34;
        for (let yy = 0; yy * sz < H; yy++) {
          for (let xx = 0; xx * sz < w; xx++) {
            if ((xx + yy) % 2 === 0) parts.push(`<rect x="${x + xx * sz}" y="${yy * sz}" width="${Math.min(sz, w - xx * sz)}" height="${sz}" fill="${c2}"/>`);
          }
        }
      } else if (type === "zigzag") {
        const amp = w * 0.32;
        const pts = [];
        const pts2 = [];
        for (let yy = 0, k = 0; yy <= H + 40; yy += 40, k++) {
          const px = x + w / 2 + (k % 2 ? amp : -amp);
          pts.push(`${px.toFixed(0)},${yy}`);
          pts2.push(`${(px + 18).toFixed(0)},${yy}`);
        }
        parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${c2}" stroke-width="9"/>`);
        parts.push(`<polyline points="${pts2.join(" ")}" fill="none" stroke="${c3}" stroke-width="4"/>`);
      } else if (type === "bands") {
        for (let yy = 0; yy < H; yy += 28) parts.push(`<rect x="${x}" y="${yy}" width="${w}" height="14" fill="${c2}"/>`);
      }
      parts.push(`<rect x="${x + w - 3}" y="0" width="6" height="${H}" fill="${p.color(0)}"/>`);
      x += w;
      i++;
    }
    return `${parts.join("")}
      <defs><pattern id="weave" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="black" opacity="0.22"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#weave)"/>
      ${grain(p)}`;
  },

  Mudcloth(p) {
    const parts = [];
    const ink = p.ink;
    let y = 0;
    let band = 0;
    while (y < H) {
      const h = Math.round(rand(80, 150));
      const mid = y + h / 2;
      const u = h * 0.34;
      const step = u * 2.2;
      const motif = choice(["zigzag", "diamond", "cross", "tri", "dots"]);
      if (band % 2 === 1) parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${p.color(band, 0.16)}"/>`);
      for (let xx = -step; xx < W + step; xx += step) {
        const cx = xx + step / 2;
        if (motif === "zigzag") {
          parts.push(`<polyline points="${xx},${mid + u * 0.6} ${cx},${mid - u * 0.6} ${xx + step},${mid + u * 0.6}" fill="none" stroke="${ink}" stroke-width="6"/>`);
        } else if (motif === "diamond") {
          parts.push(`<polygon points="${cx},${mid - u} ${cx + u},${mid} ${cx},${mid + u} ${cx - u},${mid}" fill="none" stroke="${ink}" stroke-width="5"/><circle cx="${cx}" cy="${mid}" r="${(u * 0.2).toFixed(1)}" fill="${ink}"/>`);
        } else if (motif === "cross") {
          parts.push(`<path d="M${cx - u * 0.7},${mid} H${cx + u * 0.7} M${cx},${mid - u * 0.7} V${mid + u * 0.7}" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`);
        } else if (motif === "tri") {
          const up = Math.round(xx / step) % 2 === 0;
          const pts = up
            ? `${cx - u},${mid + u * 0.8} ${cx + u},${mid + u * 0.8} ${cx},${mid - u * 0.8}`
            : `${cx - u},${mid - u * 0.8} ${cx + u},${mid - u * 0.8} ${cx},${mid + u * 0.8}`;
          parts.push(`<polygon points="${pts}" fill="${ink}"/>`);
        } else {
          parts.push(`<circle cx="${cx}" cy="${mid}" r="${(u * 0.32).toFixed(1)}" fill="${ink}"/><circle cx="${cx + step / 2}" cy="${mid}" r="${(u * 0.14).toFixed(1)}" fill="${ink}"/>`);
        }
      }
      parts.push(`<line x1="0" y1="${y + h}" x2="${W}" y2="${y + h}" stroke="${ink}" stroke-width="7"/>`);
      parts.push(`<line x1="0" y1="${y + h - 14}" x2="${W}" y2="${y + h - 14}" stroke="${ink}" stroke-width="2.5" stroke-dasharray="10 8"/>`);
      y += h;
      band++;
    }
    return `${baseRect(p)}${parts.join("")}${grain(p)}`;
  },

  Ndebele(p) {
    const parts = [];
    const cell = choice([240, 300]);
    const half = cell / 2;
    const ink = p.isDark ? "#0b0705" : "#17100b";
    for (let row = 0; row * cell < H + cell; row++) {
      for (let col = 0; col * cell < W + cell; col++) {
        const cx = col * cell + half;
        const cy = row * cell + half;
        const off = (row + col) % 4;
        parts.push(`<rect x="${col * cell}" y="${row * cell}" width="${cell}" height="${cell}" fill="${p.color(off + 1)}" stroke="${ink}" stroke-width="8"/>`);
        for (let k = 0; k < 4; k++) {
          const d = half - 14 - k * (half / 4.6);
          if (d < 8) break;
          parts.push(`<polygon points="${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}" fill="${p.color(off + k * 2 + (k % 2 ? 2 : 0))}" stroke="${ink}" stroke-width="6"/>`);
        }
      }
    }
    return `${parts.join("")}${grain(p)}`;
  },

  // Kasai raffia patchwork: the canvas is cut into panels, each filled with its own
  // dense woven motif (nested squares, meanders, hatching, triangles, dots, checks)
  Kasai(p) {
    const ink = p.ink;
    const panels = [];
    const split = (x, y, w, h, depth) => {
      if (depth === 0 || w < 230 || h < 190 || (depth < 3 && Math.random() < 0.18)) {
        panels.push({ x, y, w, h });
        return;
      }
      const vertical = w > h * 1.15 ? true : h > w * 1.15 ? false : Math.random() < 0.5;
      const t = rand(0.36, 0.64);
      if (vertical) {
        split(x, y, w * t, h, depth - 1);
        split(x + w * t, y, w * (1 - t), h, depth - 1);
      } else {
        split(x, y, w, h * t, depth - 1);
        split(x, y + h * t, w, h * (1 - t), depth - 1);
      }
    };
    split(0, 0, W, H, 4);

    const motif = {
      nest: (w, h, i) => {
        let s = "";
        for (let k = 0; k * 22 < Math.min(w, h) / 2; k++) {
          s += `<rect x="${k * 22}" y="${k * 22}" width="${w - k * 44}" height="${h - k * 44}" fill="${k % 2 ? p.color(i + 1) : p.color(i + 2)}" stroke="${ink}" stroke-width="5"/>`;
        }
        return s;
      },
      key: (w, h, i) => {
        let s = `<rect width="${w}" height="${h}" fill="${p.color(i + 1, 0.55)}"/>`;
        for (let y = 36; y < h + 40; y += 64) {
          let d = `M-20,${y}`;
          for (let x = -20; x < w + 40; x += 48) d += `v-24h24v24h24`;
          s += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="7" stroke-linejoin="miter"/><path d="${d}" fill="none" stroke="${p.color(i + 3)}" stroke-width="2.5" transform="translate(0 12)"/>`;
        }
        return s;
      },
      diag: (w, h, i) => {
        let s = "";
        for (let k = -h; k < w + h; k += 30) {
          s += `<line x1="${k}" y1="0" x2="${k + h}" y2="${h}" stroke="${k % 60 === 0 ? ink : p.color(i + 2)}" stroke-width="${k % 60 === 0 ? 9 : 14}"/>`;
        }
        return s;
      },
      tri: (w, h, i) => {
        let s = "";
        const st = 44;
        for (let y = 0; y < h; y += st) {
          for (let x = -st; x < w + st; x += st) {
            const up = ((x / st) + (y / st)) % 2 === 0;
            const pts = up ? `${x},${y + st} ${x + st / 2},${y} ${x + st},${y + st}` : `${x},${y} ${x + st},${y} ${x + st / 2},${y + st}`;
            s += `<polygon points="${pts}" fill="${up ? p.color(i + 1) : p.color(i + 3)}" stroke="${ink}" stroke-width="3"/>`;
          }
        }
        return s;
      },
      dots: (w, h, i) => {
        let s = "";
        for (let y = 0, r = 0; y < h + 30; y += 30, r++) {
          for (let x = r % 2 ? 15 : 0; x < w + 30; x += 30) {
            s += `<circle cx="${x}" cy="${y}" r="${(x / 30 + r) % 2 ? 6 : 10}" fill="${(x / 30 + r) % 2 ? ink : p.color(i + 2)}"/>`;
          }
        }
        return s;
      },
      check: (w, h, i) => {
        let s = "";
        const sz = 30;
        for (let y = 0; y < h; y += sz) {
          for (let x = 0; x < w; x += sz) {
            s += `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="${((x + y) / sz) % 2 ? p.color(i + 1) : p.color(i + 3)}"/>`;
          }
        }
        return s + `<rect x="${sz}" y="${sz}" width="${w - 2 * sz}" height="${h - 2 * sz}" fill="none" stroke="${ink}" stroke-width="5"/>`;
      }
    };
    const names = Object.keys(motif);
    const parts = panels.map((pn, i) => {
      const m = names[(i + Math.floor(rand(0, names.length))) % names.length];
      return `<svg x="${pn.x.toFixed(0)}" y="${pn.y.toFixed(0)}" width="${pn.w.toFixed(0)}" height="${pn.h.toFixed(0)}" viewBox="0 0 ${pn.w.toFixed(0)} ${pn.h.toFixed(0)}">
        <rect width="${pn.w.toFixed(0)}" height="${pn.h.toFixed(0)}" fill="${p.color(i)}"/>${motif[m](pn.w, pn.h, i)}
        <rect width="${pn.w.toFixed(0)}" height="${pn.h.toFixed(0)}" fill="none" stroke="${ink}" stroke-width="12"/>
      </svg>`;
    });
    return `${parts.join("")}
      <defs><pattern id="raffia" width="3" height="6" patternUnits="userSpaceOnUse"><rect width="1" height="6" fill="#000" opacity="0.18"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#raffia)"/>
      ${grain(p)}`;
  },

  // Akan stamped cloth: small stitched panels, each carrying one carved-stamp symbol
  Adinkra(p) {
    const parts = [];
    const ink = p.ink;
    const cell = choice([84, 96, 112]);
    const n = v => v.toFixed(1);
    const heart = s => `M0,${n(s * 0.85)}C${n(-s * 1.15)},${n(s * 0.05)} ${n(-s * 0.85)},${n(-s * 0.85)} ${n(-s * 0.35)},${n(-s * 0.8)}C${n(-s * 0.12)},${n(-s * 0.78)} 0,${n(-s * 0.55)} 0,${n(-s * 0.4)}C0,${n(-s * 0.55)} ${n(s * 0.12)},${n(-s * 0.78)} ${n(s * 0.35)},${n(-s * 0.8)}C${n(s * 0.85)},${n(-s * 0.85)} ${n(s * 1.15)},${n(s * 0.05)} 0,${n(s * 0.85)}Z`;
    const sym = {
      // chief of the symbols: three bold rings round a dot
      adinkrahene: s => `<circle r="${n(s * 0.9)}" fill="none" stroke-width="${n(s * 0.17)}"/><circle r="${n(s * 0.55)}" fill="none" stroke-width="${n(s * 0.17)}"/><circle r="${n(s * 0.2)}" stroke="none"/>`,
      // go back and fetch it: a heart with two inward curls
      sankofa: s => {
        const curl = `<path d="M${n(-s * 0.5)},${n(-s * 0.05)}C${n(-s * 0.62)},${n(-s * 0.42)} ${n(-s * 0.2)},${n(-s * 0.45)} ${n(-s * 0.2)},${n(-s * 0.2)}C${n(-s * 0.2)},${n(s * 0.02)} ${n(-s * 0.42)},${n(s * 0.02)} ${n(-s * 0.4)},${n(-s * 0.16)}" fill="none" stroke-width="${n(s * 0.09)}"/>`;
        return `<path d="${heart(s)}" fill="none" stroke-width="${n(s * 0.16)}"/>${curl}<g transform="scale(-1 1)">${curl}</g>`;
      },
      // ram's horns: two thick spirals joined by a bar
      dwennimmen: s => {
        const horn = `<path d="M${n(-s * 0.12)},${n(s * 0.62)}C${n(-s * 0.95)},${n(s * 0.7)} ${n(-s * 1.0)},${n(-s * 0.72)} ${n(-s * 0.38)},${n(-s * 0.72)}C0,${n(-s * 0.72)} ${n(s * 0.02)},${n(-s * 0.2)} ${n(-s * 0.32)},${n(-s * 0.18)}" fill="none" stroke-width="${n(s * 0.2)}"/>`;
        return `${horn}<g transform="scale(-1 1)">${horn}</g><path d="M${n(-s * 0.12)},${n(s * 0.62)}H${n(s * 0.12)}" stroke-width="${n(s * 0.2)}"/>`;
      },
      // staff of life: a stalk with leaves in pairs
      nyameNti: s => {
        let leaves = "";
        for (let k = 0; k < 4; k++) {
          const y = -s * 0.62 + k * s * 0.4;
          leaves += `<ellipse cx="${n(-s * 0.32)}" cy="${n(y)}" rx="${n(s * 0.32)}" ry="${n(s * 0.12)}" transform="rotate(-35 ${n(-s * 0.32)} ${n(y)})" stroke="none"/><ellipse cx="${n(s * 0.32)}" cy="${n(y)}" rx="${n(s * 0.32)}" ry="${n(s * 0.12)}" transform="rotate(35 ${n(s * 0.32)} ${n(y)})" stroke="none"/>`;
        }
        return `<path d="M0,${n(s * 0.92)}V${n(-s * 0.88)}" fill="none" stroke-width="${n(s * 0.13)}"/>${leaves}`;
      },
      // fern: a stalk under stacked chevrons
      aya: s => {
        let v = "";
        for (let k = 0; k < 4; k++) {
          const y = -s * 0.62 + k * s * 0.38;
          v += `<polyline points="${n(-s * 0.56)},${n(y + s * 0.3)} 0,${n(y)} ${n(s * 0.56)},${n(y + s * 0.3)}" fill="none" stroke-width="${n(s * 0.12)}"/>`;
        }
        return `<path d="M0,${n(s * 0.92)}V${n(-s * 0.8)}" fill="none" stroke-width="${n(s * 0.12)}"/>${v}`;
      },
      // heart of patience: one bold heart
      akoma: s => `<path d="${heart(s)}" fill="none" stroke-width="${n(s * 0.2)}"/><circle cy="${n(-s * 0.05)}" r="${n(s * 0.14)}" stroke="none"/>`,
      // cola-nut sack: a hub with eight round lobes
      beseSaka: s => {
        let lobes = "";
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          lobes += `<circle cx="${n(s * 0.66 * Math.cos(a))}" cy="${n(s * 0.66 * Math.sin(a))}" r="${n(s * 0.27)}" stroke="none"/>`;
        }
        return `${lobes}<circle r="${n(s * 0.42)}" stroke="none"/>`;
      },
      // wooden comb: a rounded head over five teeth
      duafe: s => {
        let teeth = "";
        for (let k = 0; k < 5; k++) teeth += `<rect x="${n(-s * 0.075 + (k - 2) * s * 0.33)}" y="${n(-s * 0.25)}" width="${n(s * 0.15)}" height="${n(s * 1.1)}" stroke="none"/>`;
        return `<path d="M${n(-s * 0.78)},${n(-s * 0.2)}V${n(-s * 0.55)}Q${n(-s * 0.78)},${n(-s * 0.92)} ${n(-s * 0.4)},${n(-s * 0.92)}H${n(s * 0.4)}Q${n(s * 0.78)},${n(-s * 0.92)} ${n(s * 0.78)},${n(-s * 0.55)}V${n(-s * 0.2)}Z" stroke="none"/>${teeth}`;
      },
      // twisting: a bold zigzag
      nkyinkyim: s => `<polyline points="${n(-s * 0.6)},${n(-s * 0.85)} ${n(s * 0.55)},${n(-s * 0.45)} ${n(-s * 0.55)},0 ${n(s * 0.55)},${n(s * 0.45)} ${n(-s * 0.6)},${n(s * 0.85)}" fill="none" stroke-width="${n(s * 0.17)}"/>`
    };
    const names = Object.keys(sym);
    const tints = [0.34, 0.2, 0.46];
    for (let r = 0; r * cell < H + cell; r++) {
      for (let c = 0; c * cell < W + cell; c++) {
        const x = c * cell;
        const y = r * cell;
        parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${p.color(c + Math.floor(r / 2), tints[(r + c * 2) % 3])}"/>`);
      }
    }
    const stamps = [];
    for (let r = 0; r * cell < H + cell; r++) {
      for (let c = 0; c * cell < W + cell; c++) {
        const s = cell * 0.34;
        const jx = rand(-3, 3);
        const jy = rand(-3, 3);
        stamps.push(`<g transform="translate(${(c * cell + cell / 2 + jx).toFixed(0)} ${(r * cell + cell / 2 + jy).toFixed(0)}) rotate(${rand(-4, 4).toFixed(1)})">${sym[choice(names)](s)}</g>`);
      }
    }
    parts.push(`<g fill="${ink}" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round" opacity="0.88" filter="url(#stamp)">${stamps.join("")}</g>`);
    for (let c = 0; c * cell <= W + cell; c++) {
      const x = c * cell;
      parts.push(`<rect x="${x - 4}" y="0" width="8" height="${H}" fill="${ink}" opacity="0.18"/><line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${ink}" stroke-width="1.6" stroke-dasharray="5 5" opacity="0.7"/>`);
    }
    for (let r = 0; r * cell <= H + cell; r++) {
      const y = r * cell;
      parts.push(`<rect x="0" y="${y - 4}" width="${W}" height="8" fill="${ink}" opacity="0.18"/><line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${ink}" stroke-width="1.6" stroke-dasharray="5 5" opacity="0.7"/>`);
    }
    return `${baseRect(p)}
      <defs><filter id="stamp" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${Math.floor(rand(1, 999))}" result="t"/>
        <feDisplacementMap in="SourceGraphic" in2="t" scale="3"/>
      </filter></defs>
      ${parts.join("")}${grain(p)}`;
  },

  // West-African wax print: big medallions, petals, dots and crackle
  Ankara(p) {
    const parts = [];
    const ink = p.ink;
    const R = choice([104, 128]);
    const defs = [];
    for (let k = 0; k < 4; k++) {
      const petals = [];
      const inner = [];
      for (let i = 0; i < 12; i++) petals.push(`<ellipse cx="0" cy="${-R * 0.74}" rx="${R * 0.15}" ry="${R * 0.25}" transform="rotate(${i * 30})"/>`);
      for (let i = 0; i < 8; i++) inner.push(`<ellipse cx="0" cy="${-R * 0.34}" rx="${R * 0.08}" ry="${R * 0.15}" transform="rotate(${i * 45})"/>`);
      defs.push(`<g id="m${k}">
        <circle r="${R}" fill="${p.color(k)}" stroke="${ink}" stroke-width="5"/>
        <circle r="${R * 0.92}" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="3 9"/>
        <g fill="${p.color(k + 1)}" stroke="${ink}" stroke-width="3">${petals.join("")}</g>
        <circle r="${R * 0.52}" fill="${p.color(k + 2)}" stroke="${ink}" stroke-width="4"/>
        <g fill="${p.color(k + 3)}" stroke="${ink}" stroke-width="2.5">${inner.join("")}</g>
        <circle r="${R * 0.17}" fill="${ink}"/>
      </g>`);
    }
    const dx = R * 2.15;
    const dy = R * 1.86;
    for (let r = -1; r * dy < H + R; r++) {
      const off = r % 2 ? dx / 2 : 0;
      for (let c = -1; c * dx < W + R; c++) {
        const x = c * dx + off;
        const y = r * dy;
        parts.push(`<use href="#m${(r * 2 + c + 8) % 4}" x="${x.toFixed(0)}" y="${y.toFixed(0)}"/>`);
        const gx = x + dx / 2;
        const u = R * 0.2;
        parts.push(`<polygon points="${gx},${y - u} ${gx + u},${y} ${gx},${y + u} ${gx - u},${y}" fill="${p.color(r + c + 2)}" stroke="${ink}" stroke-width="3"/><circle cx="${gx}" cy="${y - u * 2.2}" r="4" fill="${ink}"/><circle cx="${gx}" cy="${y + u * 2.2}" r="4" fill="${ink}"/>`);
      }
    }
    const crackle = [];
    for (let i = 0; i < 38; i++) {
      let x = rand(0, W);
      let y = rand(0, H);
      const pts = [`${x.toFixed(0)},${y.toFixed(0)}`];
      for (let k = 0; k < 4; k++) {
        x += rand(-34, 34);
        y += rand(-34, 34);
        pts.push(`${x.toFixed(0)},${y.toFixed(0)}`);
      }
      crackle.push(`<polyline points="${pts.join(" ")}"/>`);
    }
    return `${baseRect(p)}
      <defs>${defs.join("")}<pattern id="wdots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="2" fill="${ink}" opacity="0.22"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#wdots)"/>
      ${parts.join("")}
      <g fill="none" stroke="${ink}" stroke-width="1.2" opacity="0.16">${crackle.join("")}</g>
      ${grain(p)}`;
  },

  // Zulu beadwork: bands of triangles, diamonds, checks and zigzags
  Zulu(p) {
    const parts = [];
    const ink = p.ink;
    let y = 0;
    let band = 0;
    while (y < H) {
      const h = Math.round(rand(70, 140));
      const motif = choice(["tri", "diamond", "check", "chevron"]);
      const cA = p.color(band);
      const cB = p.color(band + 1);
      const cC = p.color(band + 2);
      parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${p.color(band + 3, 0.28)}"/>`);
      const step = h * 0.9;
      if (motif === "tri") {
        for (let i = -1; i * step < W + step; i++) {
          const x = i * step;
          parts.push(`<polygon points="${x},${y + h} ${x + step / 2},${y} ${x + step},${y + h}" fill="${cA}"/><polygon points="${x + step / 2},${y} ${x + step * 1.5},${y} ${x + step},${y + h}" fill="${cB}"/>`);
        }
      } else if (motif === "diamond") {
        for (let i = -1; i * step < W + step; i++) {
          const cx = i * step + step / 2;
          const cy = y + h / 2;
          const a = h / 2 - 4;
          parts.push(`<polygon points="${cx},${cy - a} ${cx + a},${cy} ${cx},${cy + a} ${cx - a},${cy}" fill="${cA}"/><polygon points="${cx},${cy - a * 0.5} ${cx + a * 0.5},${cy} ${cx},${cy + a * 0.5} ${cx - a * 0.5},${cy}" fill="${cB}"/>`);
        }
      } else if (motif === "check") {
        const sz = h / 4;
        for (let r = 0; r < 4; r++) {
          for (let i = 0; i * sz < W; i++) {
            if ((r + i) % 2 === 0) parts.push(`<rect x="${i * sz}" y="${y + r * sz}" width="${sz}" height="${sz}" fill="${cA}"/>`);
            else parts.push(`<rect x="${i * sz}" y="${y + r * sz}" width="${sz}" height="${sz}" fill="${cB}"/>`);
          }
        }
      } else {
        for (let k = 0; k < 3; k++) {
          const pts = [];
          for (let i = -1, j = 0; i * step < W + step; i++, j++) {
            pts.push(`${i * step},${y + h * (0.25 + k * 0.25) + (j % 2 ? -h * 0.18 : h * 0.18)}`);
          }
          parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${[cA, cB, cC][k]}" stroke-width="${(h / 6).toFixed(1)}" stroke-linejoin="miter"/>`);
        }
      }
      parts.push(`<rect x="0" y="${y + h}" width="${W}" height="8" fill="${ink}" opacity="0.55"/>`);
      y += h + 8;
      band++;
    }
    return `${baseRect(p)}${parts.join("")}
      ${grain(p)}`;
  },

  // Amazigh / Berber carpet: serrated lozenges, crosses and zigzag borders
  Berber(p) {
    const parts = [];
    const ink = p.ink;
    const cell = choice([180, 220]);
    const half = cell / 2;
    const serr = (cx, cy, r, t, notch) => {
      const v = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const A = v[e];
        const B = v[(e + 1) % 4];
        const dx = (B[0] - A[0]) / t;
        const dy = (B[1] - A[1]) / t;
        const len = Math.hypot(dx, dy);
        const nx = (dy / len) * notch;
        const ny = (-dx / len) * notch;
        for (let k = 0; k < t; k++) {
          pts.push(`${(A[0] + dx * k).toFixed(0)},${(A[1] + dy * k).toFixed(0)}`);
          pts.push(`${(A[0] + dx * (k + 0.5) + nx).toFixed(0)},${(A[1] + dy * (k + 0.5) + ny).toFixed(0)}`);
        }
      }
      return pts.join(" ");
    };
    for (let row = 0; row * cell < H + cell; row++) {
      for (let col = 0; col * cell < W + cell; col++) {
        const cx = col * cell + half;
        const cy = row * cell + half;
        const k = (row + col) % 4;
        parts.push(`<polygon points="${serr(cx, cy, half - 6, 6, 9)}" fill="${p.color(k)}" stroke="${ink}" stroke-width="3"/>`);
        parts.push(`<polygon points="${serr(cx, cy, half * 0.62, 4, 7)}" fill="${p.color(k + 1)}" stroke="${ink}" stroke-width="3"/>`);
        parts.push(`<polygon points="${serr(cx, cy, half * 0.3, 2, 5)}" fill="${p.color(k + 2)}" stroke="${ink}" stroke-width="3"/>`);
        const gx = cx + half;
        const gy = cy + half;
        parts.push(`<path d="M${gx - 12},${gy - 12}L${gx + 12},${gy + 12}M${gx + 12},${gy - 12}L${gx - 12},${gy + 12}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`);
        parts.push(`<circle cx="${gx}" cy="${gy - 30}" r="4" fill="${ink}"/><circle cx="${gx}" cy="${gy + 30}" r="4" fill="${ink}"/><circle cx="${gx - 30}" cy="${gy}" r="4" fill="${ink}"/><circle cx="${gx + 30}" cy="${gy}" r="4" fill="${ink}"/>`);
      }
    }
    const zig = y => {
      const pts = [];
      for (let x = -20, i = 0; x < W + 40; x += 30, i++) pts.push(`${x},${y + (i % 2 ? 14 : -14)}`);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${ink}" stroke-width="6" stroke-linejoin="miter"/>`;
    };
    parts.push(`<rect x="0" y="0" width="${W}" height="64" fill="${p.color(2)}"/><rect x="0" y="${H - 64}" width="${W}" height="64" fill="${p.color(2)}"/>${zig(32)}${zig(H - 32)}`);
    parts.push(`<rect x="0" y="64" width="${W}" height="6" fill="${ink}"/><rect x="0" y="${H - 70}" width="${W}" height="6" fill="${ink}"/>`);
    return `${baseRect(p)}${parts.join("")}
      <defs><pattern id="weave" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="black" opacity="0.2"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#weave)"/>
      ${grain(p)}`;
  },

  // Maasai shuka: a plaid of bold stripes with fine white lines
  Shuka(p) {
    const parts = [];
    const ink = p.ink;
    const stripes = (horizontal, alpha) => {
      const len = horizontal ? H : W;
      let pos = 0;
      let i = 0;
      while (pos < len) {
        const w = Math.round(rand(40, 120));
        const col = i % 3 === 2 ? p.color(2, alpha) : p.color(1, alpha);
        parts.push(horizontal
          ? `<rect x="0" y="${pos}" width="${W}" height="${w}" fill="${col}"/>`
          : `<rect x="${pos}" y="0" width="${w}" height="${H}" fill="${col}"/>`);
        const gap = Math.round(rand(60, 150));
        const lines = Math.floor(rand(1, 4));
        for (let k = 0; k < lines; k++) {
          const lp = pos + w + 10 + k * 12;
          parts.push(horizontal
            ? `<rect x="0" y="${lp}" width="${W}" height="4" fill="#fff" opacity="${(alpha * 0.8).toFixed(2)}"/>`
            : `<rect x="${lp}" y="0" width="4" height="${H}" fill="#fff" opacity="${(alpha * 0.8).toFixed(2)}"/>`);
        }
        pos += w + gap;
        i++;
      }
    };
    stripes(true, 0.92);
    stripes(false, 0.62);
    return `<rect width="${W}" height="${H}" fill="${p.color(0)}"/>${parts.join("")}
      <defs>
        <pattern id="wv1" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="black" opacity="0.2"/></pattern>
        <pattern id="wv2" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1.4" height="4" fill="black" opacity="0.16"/></pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#wv1)"/><rect width="${W}" height="${H}" fill="url(#wv2)"/>
      <rect width="${W}" height="${H}" fill="${ink}" opacity="0.04"/>
      ${grain(p)}`;
  },

  // Yoruba adire: indigo cloth with hand-dyed white resist rings
  Adire(p) {
    const parts = [];
    const light = "#e9eefb";
    const n = Math.floor(rand(14, 22));
    for (let i = 0; i < n; i++) {
      const cx = rand(-40, W + 40);
      const cy = rand(-40, H + 40);
      const R = rand(46, 130);
      parts.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R.toFixed(0)}" fill="${p.color(1, 0.22)}"/>`);
      const rings = Math.floor(R / 17);
      for (let k = 0; k < rings; k++) {
        const r = R - k * 17;
        const dashed = k % 3 === 2;
        parts.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="${light}" stroke-width="${(k % 2 ? 4 : 9).toFixed(0)}" opacity="${(0.92 - k * 0.07).toFixed(2)}" ${dashed ? 'stroke-dasharray="5 9"' : ""}/>`);
      }
      parts.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rand(5, 11).toFixed(0)}" fill="${light}"/>`);
      if (Math.random() < 0.5) {
        let ticks = "";
        for (let t = 0; t < 12; t++) ticks += `<path d="M0,${-R - 10}V${-R - 26}" transform="rotate(${t * 30})"/>`;
        parts.push(`<g transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)})" stroke="${light}" stroke-width="4" stroke-linecap="round" opacity="0.7">${ticks}</g>`);
      }
    }
    for (let i = 0; i < 60; i++) {
      parts.push(`<circle cx="${rand(0, W).toFixed(0)}" cy="${rand(0, H).toFixed(0)}" r="${rand(2, 5).toFixed(1)}" fill="${light}" opacity="0.6"/>`);
    }
    return `<rect width="${W}" height="${H}" fill="${p.isDark ? "#0e1a40" : "#233f8f"}"/>
      <defs>
        <filter id="dye" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="${Math.floor(rand(1, 999))}" result="t"/>
          <feDisplacementMap in="SourceGraphic" in2="t" scale="22" xChannelSelector="R" yChannelSelector="G"/>
          <feGaussianBlur stdDeviation="1.1"/>
        </filter>
        <filter id="mottle" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.014" numOctaves="4" seed="${Math.floor(rand(1, 999))}"/>
          <feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.1  0 0 0 0 0.35  1.6 0 0 0 -0.55"/>
        </filter>
      </defs>
      <rect width="${W}" height="${H}" filter="url(#mottle)" opacity="0.55"/>
      <g filter="url(#dye)">${parts.join("")}</g>
      ${grain(p)}`;
  },


  // Japan: overlapping wave scales
  Seigaiha(p) {
    const R = choice([54, 66, 78]);
    const defs = [];
    for (let k = 0; k < 3; k++) {
      let g = "";
      for (let i = 0; i < 5; i++) g += `<circle r="${(R * (1 - i * 0.2)).toFixed(1)}" fill="${i % 2 ? p.color(k + 1) : p.color(k)}" stroke="${p.ink}" stroke-width="2"/>`;
      defs.push(`<g id="sg${k}">${g}</g>`);
    }
    const uses = [];
    for (let r = 0; r * R / 2 < H + R; r++) {
      const y = r * R / 2;
      const off = r % 2 ? R : 0;
      for (let x = -R * 2 + off; x < W + R * 2; x += R * 2) uses.push(`<use href="#sg${Math.floor(r / 5) % 3}" x="${x}" y="${y}"/>`);
    }
    return `<rect width="${W}" height="${H}" fill="${p.color(2)}"/><defs>${defs.join("")}</defs>${uses.join("")}${grain(p)}`;
  },

  // Japan: indigo cloth with white running stitches (shippo, "seven treasures")
  Sashiko(p) {
    const d = choice([96, 120]);
    const r = d * 0.7071;
    let circles = "";
    let dots = "";
    for (let j = -1; j * d < H + d; j++) {
      for (let i = -1; i * d < W + d; i++) {
        circles += `<circle cx="${i * d}" cy="${j * d}" r="${r.toFixed(1)}"/>`;
        dots += `<circle cx="${i * d + d / 2}" cy="${j * d + d / 2}" r="4.5"/>`;
      }
    }
    return `<rect width="${W}" height="${H}" fill="${p.isDark ? "#0e1a40" : "#233f8f"}"/>
      <defs><pattern id="sw" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000" opacity="0.2"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#sw)"/>
      <g fill="none" stroke="${p.ink}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round">${circles}</g>
      <g fill="${p.color(3)}">${dots}</g>${grain(p)}`;
  },

  // Indonesia: batik kawung, four-petal flowers touching tip to tip
  Kawung(p) {
    const c = choice([110, 140]);
    const defs = [];
    for (let k = 0; k < 2; k++) {
      const e = (cx, cy, rx, ry, f) => `<ellipse cx="${(cx * c).toFixed(1)}" cy="${(cy * c).toFixed(1)}" rx="${(rx * c).toFixed(1)}" ry="${(ry * c).toFixed(1)}" fill="${f}" stroke="${p.ink}" stroke-width="3"/>`;
      defs.push(`<g id="kw${k}">${e(0.25, 0, 0.25, 0.13, p.color(k))}${e(-0.25, 0, 0.25, 0.13, p.color(k))}${e(0, 0.25, 0.13, 0.25, p.color(k + 1))}${e(0, -0.25, 0.13, 0.25, p.color(k + 1))}<circle r="${(c * 0.07).toFixed(1)}" fill="${p.ink}"/></g>`);
    }
    const uses = [];
    for (let j = -1; j * c < H + c; j++) {
      for (let i = -1; i * c < W + c; i++) {
        uses.push(`<use href="#kw${(i + j + 4) % 2}" x="${i * c}" y="${j * c}"/><circle cx="${i * c + c / 2}" cy="${j * c + c / 2}" r="${(c * 0.09).toFixed(1)}" fill="${p.color(3)}" stroke="${p.ink}" stroke-width="2.5"/>`);
      }
    }
    return `${baseRect(p)}<defs>${defs.join("")}</defs>${uses.join("")}${grain(p)}`;
  },

  // Islamic geometry: eight-pointed stars on a square grid
  Girih(p) {
    const c = choice([130, 160]);
    const R = c / 2;
    const star = (r, fill) => {
      const pts = [];
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8 - Math.PI / 2;
        const rad = k % 2 === 0 ? r : r * 0.765;
        pts.push(`${(rad * Math.cos(a)).toFixed(1)},${(rad * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${p.ink}" stroke-width="3" stroke-linejoin="round"/>`;
    };
    const defs = [];
    for (let k = 0; k < 2; k++) defs.push(`<g id="gs${k}">${star(R, p.color(k))}${star(R * 0.6, p.color(k + 1))}<circle r="${(R * 0.18).toFixed(1)}" fill="${p.color(k + 2)}" stroke="${p.ink}" stroke-width="2.5"/></g>`);
    const oct = [];
    for (let k = 0; k < 8; k++) oct.push(`${(c * 0.15 * Math.cos((k * Math.PI) / 4 + Math.PI / 8)).toFixed(1)},${(c * 0.15 * Math.sin((k * Math.PI) / 4 + Math.PI / 8)).toFixed(1)}`);
    const uses = [];
    for (let j = -1; j * c < H + c; j++) {
      for (let i = -1; i * c < W + c; i++) {
        uses.push(`<use href="#gs${(i + j + 4) % 2}" x="${i * c}" y="${j * c}"/><polygon points="${oct.join(" ")}" transform="translate(${i * c + c / 2} ${j * c + c / 2})" fill="${p.color(3)}" stroke="${p.ink}" stroke-width="2.5"/>`);
      }
    }
    return `${baseRect(p)}<defs>${defs.join("")}</defs>${uses.join("")}${grain(p)}`;
  },

  // Portugal: blue-and-white glazed tiles, each tile turned a quarter from its neighbour
  Azulejo(p) {
    const T = choice([100, 120]);
    const b1 = "#1d4e9e";
    const b2 = "#5b86c8";
    let petals = "";
    for (let k = 0; k < 4; k++) {
      petals += `<ellipse cx="${T / 2}" cy="${(T / 2 - T * 0.2).toFixed(1)}" rx="${(T * 0.09).toFixed(1)}" ry="${(T * 0.19).toFixed(1)}" fill="${b1}" transform="rotate(${k * 90} ${T / 2} ${T / 2})"/>`;
      petals += `<ellipse cx="${T / 2}" cy="${(T / 2 - T * 0.31).toFixed(1)}" rx="${(T * 0.045).toFixed(1)}" ry="${(T * 0.1).toFixed(1)}" fill="${b2}" transform="rotate(${k * 90 + 45} ${T / 2} ${T / 2})"/>`;
    }
    const corners = [[0, 0], [T, 0], [0, T], [T, T]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${(T * 0.3).toFixed(1)}" fill="none" stroke="${b1}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${(T * 0.17).toFixed(1)}" fill="${b2}"/>`).join("");
    const tile = `<g id="az"><rect width="${T}" height="${T}" fill="#f6f3ea"/><g clip-path="url(#azc)">${corners}</g>${petals}<circle cx="${T / 2}" cy="${T / 2}" r="${(T * 0.13).toFixed(1)}" fill="#f6f3ea" stroke="${b1}" stroke-width="3"/><circle cx="${T / 2}" cy="${T / 2}" r="${(T * 0.06).toFixed(1)}" fill="${b1}"/><rect width="${T}" height="${T}" fill="none" stroke="#c9d3e6" stroke-width="3"/></g>`;
    const uses = [];
    for (let j = 0; j * T < H; j++) {
      for (let i = 0; i * T < W; i++) uses.push(`<use href="#az" transform="translate(${i * T} ${j * T}) rotate(${((i + j) % 2) * 90} ${T / 2} ${T / 2})"/>`);
    }
    return `<rect width="${W}" height="${H}" fill="#f6f3ea"/><defs><clipPath id="azc"><rect width="${T}" height="${T}"/></clipPath>${tile}</defs>${uses.join("")}${grain(p)}`;
  },

  // Southwest America: stepped diamonds between zigzag borders
  Navajo(p) {
    const s = 14;
    const n = 5;
    const dw = (2 * n + 1) * s;
    const dark = "#1a1412";
    const rings = [p.color(0), dark, p.color(3), p.color(0), dark, p.color(2)];
    const parts = [];
    let y = 0;
    let band = 0;
    const stripe = (h, c) => { parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${c}"/>`); y += h; };
    while (y < H) {
      const kind = band % 3;
      if (kind === 0) {
        stripe(10, dark); stripe(6, p.color(2)); stripe(10, p.color(0)); stripe(6, p.color(2));
      } else if (kind === 1) {
        const h = dw + 2 * s;
        parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${p.color(2)}"/>`);
        for (let x0 = -s; x0 < W; x0 += dw + 2 * s) {
          const cx = x0 + dw / 2;
          const cy = y + h / 2;
          for (let k = 0; k <= n; k++) {
            const m = n - k;
            let d = "";
            for (let r = -m; r <= m; r++) {
              const w = (2 * (m - Math.abs(r)) + 1) * s;
              d += `M${cx - w / 2},${cy + r * s - s / 2}h${w}v${s}h${-w}z`;
            }
            parts.push(`<path d="${d}" fill="${rings[k % rings.length]}"/>`);
          }
        }
        y += h;
      } else {
        const h = 4 * s;
        parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${p.color(2)}"/>`);
        for (let x = -s * 2, i = 0; x < W + s * 2; x += s * 2, i++) {
          parts.push(`<polygon points="${x},${y + h} ${x + s},${y} ${x + 2 * s},${y + h}" fill="${i % 2 ? p.color(0) : dark}"/>`);
        }
        y += h;
      }
      band++;
    }
    return `<g shape-rendering="crispEdges">${parts.join("")}</g>
      <defs><pattern id="tw" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000" opacity="0.14"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#tw)"/>${grain(p)}`;
  },

  // Andes: stepped diamonds, key frets and zigzags on black and bright wool
  Andean(p) {
    const k = "#1a1a1a";
    return `${knitBands({
      u: 14,
      motifs: ["step", "fret", "diam", "star8"],
      bands: [{ bg: k, a: p.color(0), b: p.color(2) }, { bg: p.color(1), a: k, b: p.color(2) }, { bg: p.color(3), a: p.color(2), b: k }, { bg: k, a: p.color(1), b: p.color(3) }]
    })}${grain(p)}`;
  },

  // Nordic knitwear: snowflakes, stars and diamonds in rows
  FairIsle(p) {
    return `${knitBands({
      u: 12,
      motifs: ["snow", "star8", "diam", "tree"],
      bands: [{ bg: p.color(0), a: p.color(2), b: p.color(1) }, { bg: p.color(2), a: p.color(0), b: p.color(1) }, { bg: p.color(0), a: p.color(1), b: p.color(2) }, { bg: p.color(1), a: p.color(0), b: p.color(2) }]
    })}${grain(p)}`;
  },

  // Slavic cross-stitch: red and black on linen
  Slavic(p) {
    return `${knitBands({
      u: 14,
      cross: true,
      motifs: ["rozha", "hook", "tree", "diam"],
      bands: [{ bg: p.color(2), a: p.color(0), b: p.color(1) }, { bg: p.color(2), a: p.color(1), b: p.color(0) }]
    })}
      <defs><pattern id="linen" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="#000" opacity="0.07"/><rect width="1" height="3" fill="#000" opacity="0.06"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#linen)"/>${grain(p)}`;
  },

  // Australia: dot painting, concentric rings of dots joined by dotted trails
  Aboriginal(p) {
    const cols = [p.color(0), p.color(1), p.color(2), p.color(3)];
    const parts = [];
    const centers = [];
    const want = Math.floor(rand(5, 8));
    for (let tries = 0; tries < 200 && centers.length < want; tries++) {
      const c = { x: rand(110, W - 110), y: rand(110, H - 110), r: rand(70, 130) };
      if (centers.every(o => Math.hypot(o.x - c.x, o.y - c.y) > o.r + c.r + 30)) centers.push(c);
    }
    const dot = (x, y, r, f) => parts.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="${f}"/>`);
    for (let i = 1; i < centers.length; i++) {
      const a = centers[i - 1];
      const b = centers[i];
      const mx = (a.x + b.x) / 2 + rand(-160, 160);
      const my = (a.y + b.y) / 2 + rand(-160, 160);
      const col = cols[i % 4];
      let last = null;
      for (let t = 0; t <= 1; t += 0.004) {
        const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x;
        const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
        if (!last || Math.hypot(x - last.x, y - last.y) >= 15) { dot(x, y, 4, col); last = { x, y }; }
      }
    }
    centers.forEach((c, i) => {
      const rings = Math.max(3, Math.floor(c.r / 20));
      dot(c.x, c.y, 11, cols[(i + 1) % 4]);
      for (let k = 1; k <= rings; k++) {
        const r = k * 19;
        const count = Math.max(6, Math.round((Math.PI * 2 * r) / 12));
        const col = cols[(i + k) % 4];
        for (let q = 0; q < count; q++) {
          const a = (q / count) * Math.PI * 2;
          dot(c.x + r * Math.cos(a), c.y + r * Math.sin(a), k % 2 ? 4.4 : 3.6, col);
        }
      }
    });
    let bgDots = "";
    for (let y = 8; y < H; y += 22) for (let x = (y / 22) % 2 ? 19 : 8; x < W; x += 22) bgDots += `<circle cx="${x}" cy="${y}" r="1.6"/>`;
    return `<rect width="${W}" height="${H}" fill="#2a0f0a"/><g fill="${p.color(2, 0.28)}">${bgDots}</g>${parts.join("")}${grain(p)}`;
  },

  // Mario-style level, seven scenes: day, sunset, sky (light); night, underground,
  // castle with lava, underwater (dark)
  "Pixel Level"(p) {
    const T = 64;
    const groundY = H - 2 * T;
    const cols = Math.ceil(W / T);
    const reduced = reducedMotion();
    const scene = choice(p.isDark ? ["underground", "night", "castle", "water"] : ["day", "sunset", "sky"]);
    const base = {
      brick: "#c84c0c", line: "#4a1800", hard: ["#c84c0c", "#fcb878", "#5a1c00"],
      hill: ["#005800", "#00a800"], bush: ["#38c030", "#00780c"], cloud: ["#ffffff", "#a4d0ff"],
      pipe: ["#a8f8a8", "#00a800", "#005800"], goomba: "#b0501a", tan: "#fcd8a8", pole: "#a8f8a8", castle: "#c84c0c"
    };
    const th = Object.assign({}, base, {
      day: { sky: "#5c94fc" },
      sunset: { sky: "#ff9a5a", cloud: ["#ffd0d8", "#e89ab0"], hill: ["#1f3a2a", "#2f6a3a"], bush: ["#2f6a3a", "#1f3a2a"], brick: "#b8480c" },
      sky: { sky: "#5c94fc" },
      night: { sky: "#070b2e", brick: "#7a3410", line: "#240c00", hard: ["#7a3410", "#b0612a", "#2a0e00"], hill: ["#04301c", "#0b5a34"], bush: ["#0b5a34", "#04301c"], cloud: ["#2a3a8a", "#16226a"], pipe: ["#58b868", "#0a6a3a", "#033a1c"], goomba: "#7a3410", tan: "#c89868", pole: "#58b868", castle: "#7a3410" },
      underground: { sky: "#000000", brick: "#1c3fa6", line: "#07163f", hard: ["#1c3fa6", "#5c84f0", "#07163f"], goomba: "#4a78c0", tan: "#d8e0f0" },
      castle: { sky: "#000000", brick: "#8c8c8c", line: "#000000", hard: ["#8c8c8c", "#d0d0d0", "#303030"] },
      water: { sky: "#06184f", brick: "#2a7a8a", line: "#06303a", hard: ["#d8508c", "#ffa0c8", "#6a1c3c"], pipe: ["#a8f8a8", "#00a800", "#005800"] }
    }[scene]);
    const parts = [];
    const snap = v => Math.round(v / T) * T;
    const used = new Array(cols).fill(false);
    const take = (n, pad = 1) => {
      const options = [];
      for (let c = 0; c + n <= cols; c++) {
        let ok = true;
        for (let k = Math.max(0, c - pad); k < Math.min(cols, c + n + pad); k++) if (used[k]) { ok = false; break; }
        if (ok) options.push(c);
      }
      if (!options.length) return -1;
      const c = choice(options);
      for (let k = c; k < c + n; k++) used[k] = true;
      return c;
    };
    const brick = (x, y) => brickTile(x, y, T, th.brick, th.line);
    const hard = (x, y) => hardBlock(x, y, T, th.hard[0], th.hard[1], th.hard[2]);
    const outdoor = scene === "day" || scene === "sunset" || scene === "night";
    const anim = (attr, type, values, dur, extra = "") => (reduced ? "" : `<animateTransform attributeName="${attr}" type="${type}" values="${values}" dur="${dur}s" repeatCount="indefinite" calcMode="discrete" ${extra}/>`);

    // ---- backdrop
    parts.push(`<rect width="${W}" height="${H}" fill="${th.sky}"/>`);
    if (scene === "sunset") {
      const g = t => (t < 0.5 ? lerpHex("#3a2a7a", "#ff6a8a", t * 2) : lerpHex("#ff6a8a", "#ffc070", (t - 0.5) * 2));
      parts.push(pixelSky(g, groundY, 16, 10));
      const sx = snap(rand(250, W - 250));
      parts.push(pixelDisc(sx, groundY - 96, 160, "#fff0a0", 0.14, 16));
      parts.push(pixelDisc(sx, groundY - 96, 112, "#fff0a0", 0.3, 16));
      parts.push(pixelDisc(sx, groundY - 96, 80, "#fff6c8", 1, 16));
    }
    if (scene === "night") {
      for (let i = 0; i < 70; i++) {
        const blink = !reduced && i < 10
          ? `<animate attributeName="opacity" values="1;0.2;1;1" dur="${rand(6, 12).toFixed(1)}s" begin="-${rand(0, 6).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>` : "";
        parts.push(`<rect x="${Math.round(rand(0, W) / 4) * 4}" y="${Math.round(rand(0, groundY * 0.6) / 4) * 4}" width="4" height="4" fill="#fff" opacity="${rand(0.35, 1).toFixed(2)}">${blink}</rect>`);
      }
      const mx = snap(rand(150, W - 150));
      parts.push(pixelDisc(mx, 170, 80, "#fff2c8", 0.1, 8), pixelDisc(mx, 170, 56, "#fff2c8", 0.95, 8));
    }
    if (scene === "water") {
      for (let i = 0; i < 4; i++) {
        const x = rand(-100, W);
        parts.push(`<polygon points="${x},0 ${x + 90},0 ${x + 330},${groundY} ${x + 140},${groundY}" fill="#9fd8ff" opacity="${rand(0.04, 0.09).toFixed(3)}"/>`);
      }
    }
    if (scene === "castle") {
      parts.push(`<defs><pattern id="wall" width="${T}" height="${T}" patternUnits="userSpaceOnUse"><rect width="${T}" height="${T}" fill="#0e0e12"/><path d="M0,16H64M0,32H64M0,48H64M32,0V16M16,16V32M48,16V32M32,32V48M16,48V64M48,48V64" stroke="#23232c" stroke-width="3" fill="none"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#wall)"/>`);
    }

    // flag + castle + stairs for the outdoor levels
    const hasCastle = outdoor && Math.random() < 0.6;
    const poleCol = cols - 6;
    let castleParts = "";
    if (hasCastle) {
      const stairN = choice([3, 4]);
      for (let k = poleCol - stairN; k < cols; k++) used[k] = true;
      const poleX = poleCol * T + T / 2;
      const poleTop = groundY - 9 * T;
      castleParts += sprite(CASTLE, (poleCol + 2) * T + 8, groundY - CASTLE.length * 8, 8, { X: th.castle, K: th.line });
      castleParts += `<rect x="${poleX - 3}" y="${poleTop}" width="6" height="${groundY - T - poleTop}" fill="${th.pole}"/><circle cx="${poleX}" cy="${poleTop - 2}" r="10" fill="${th.pole}"/>`;
      castleParts += sprite(FLAG, poleX - 8 * 6 - 3, poleTop + 28, 6, { X: "#ffffff" });
      castleParts += hard(poleCol * T, groundY - T);
      for (let k = 0; k < stairN; k++) for (let h = 0; h <= k; h++) castleParts += hard((poleCol - stairN + k) * T, groundY - (h + 1) * T);
    }

    if (outdoor) {
      // far hills fade into the sky, near hills carry the little eyes
      const farLine = lerpHex(th.hill[0], th.sky, 0.55);
      const farFill = lerpHex(th.hill[1], th.sky, 0.55);
      for (let i = 0; i < 2; i++) parts.push(hill(snap(rand(0, W)), groundY, T * choice([5, 7, 9]), T, farLine, farFill));
      const hills = Math.floor(rand(2, 4));
      for (let i = 0; i < hills; i++) parts.push(hill(snap(rand(0, W)), groundY, T * choice([3, 5, 7]), T, th.hill[0], th.hill[1]));
      const bushes = Math.floor(rand(2, 5));
      for (let i = 0; i < bushes; i++) {
        const m = choice([CLOUD, CLOUD_S]);
        parts.push(sprite(m, snap(rand(0, W - 160)), groundY - m.length * 8, 8, { X: th.bush[0], S: th.bush[1] }));
      }
      const clouds = Math.floor(rand(4, 8));
      for (let i = 0; i < clouds; i++) {
        parts.push(sprite(choice([CLOUD, CLOUD_S]), rand(0, W - 160), rand(30, H * 0.36), 8, { X: th.cloud[0], S: th.cloud[1] }));
      }
      parts.push(castleParts);
    } else if (scene === "sky") {
      for (let i = 0; i < 9; i++) parts.push(sprite(choice([CLOUD, CLOUD_S]), rand(-40, W - 100), rand(20, H * 0.55), choice([8, 8, 12]), { X: "#ffffff", S: "#a4d0ff" }));
    } else if (scene === "underground" || scene === "castle") {
      for (let x = 0; x < W; x += T) {
        parts.push(brick(x, 0));
        parts.push(brick(x, T));
      }
      if (scene === "underground" && Math.random() < 0.6) {
        const px = snap(rand(T, W - 3 * T));
        parts.push(`<g transform="translate(0 ${2 * T}) scale(1 -1)">${pipe(px, 0, T * choice([2, 3]), th.pipe[0], th.pipe[1], th.pipe[2], T)}</g>`);
      }
    }

    // ---- castle: a lava pit with a jumping podoboo and a rotating fire bar
    let gap = null;
    if (scene === "castle") {
      const gw = choice([3, 4, 5]);
      const g0 = Math.floor(rand(3, cols - gw - 3));
      gap = { g0, gw };
      for (let k = g0 - 1; k <= g0 + gw; k++) used[k] = true;
      const lx = g0 * T;
      const lw = gw * T;
      parts.push(`<defs><clipPath id="lava"><rect x="${lx}" y="${groundY}" width="${lw}" height="${H - groundY}"/></clipPath></defs>`);
      const pbx = lx + lw / 2 - 18;
      parts.push(`<g>${anim("transform", "translate", "0 0;0 -90;0 -180;0 -230;0 -180;0 -90;0 0;0 0;0 0", 3.6, `begin="-${rand(0, 3).toFixed(1)}s"`)}${sprite(PODOBOO, pbx, groundY + 12, 6, { R: "#d82800", O: "#fc7400", Y: "#fcd800" })}</g>`);
      let waves = "";
      for (let x = lx - 32; x < lx + lw + 32; x += 32) {
        waves += `<rect x="${x}" y="${groundY}" width="16" height="12" fill="#fc7400"/><rect x="${x + 16}" y="${groundY + 14}" width="16" height="12" fill="#fcb800"/>`;
      }
      parts.push(`<g clip-path="url(#lava)"><rect x="${lx}" y="${groundY + 8}" width="${lw}" height="${H - groundY}" fill="#d82800"/><rect x="${lx}" y="${groundY + T * 1.3}" width="${lw}" height="${H}" fill="#a81800"/><g>${anim("transform", "translate", "0 0;16 0", 1.4)}${waves}</g></g>`);
      // fire bar on a block above the pit
      const fx = (g0 + 1) * T;
      const fy = groundY - 3 * T;
      const cx = fx + T / 2;
      const cy = fy + T / 2;
      let balls = "";
      for (let k = 1; k <= 6; k++) balls += `<rect x="${cx + k * 28 - 12}" y="${cy - 12}" width="24" height="24" fill="#fc7400"/><rect x="${cx + k * 28 - 6}" y="${cy - 6}" width="12" height="12" fill="#fcd800"/>`;
      const steps = Array.from({ length: 12 }, (_, i) => `${i * 30} ${cx} ${cy}`).join(";");
      const startAng = Math.floor(rand(0, 12)) * 30;
      parts.push(`<g ${reduced ? `transform="rotate(${startAng} ${cx} ${cy})"` : ""}>${anim("transform", "rotate", steps, 5, `begin="-${rand(0, 5).toFixed(1)}s"`)}${balls}</g>${hard(fx, fy)}`);
    }

    // ---- underwater: swaying seaweed, drifting fish and rising bubbles
    if (scene === "water") {
      for (let i = 0; i < 6; i++) {
        const sx = rand(20, W - 20);
        const hh = T * Math.floor(rand(2, 5));
        let d = `M${sx},${groundY}`;
        for (let y = groundY - 24, k = 0; y > groundY - hh; y -= 24, k++) d += `L${sx + (k % 2 ? 9 : -9)},${y}`;
        parts.push(`<g>${anim("transform", "translate", "0 0;6 0;0 0;-6 0", rand(2.2, 3.4).toFixed(1), `begin="-${rand(0, 3).toFixed(1)}s"`)}<path d="${d}" fill="none" stroke="#1f9a4a" stroke-width="12" stroke-linejoin="miter"/><path d="${d}" fill="none" stroke="#6ae88a" stroke-width="4" transform="translate(-3 0)"/></g>`);
      }
      for (let i = 0; i < 4; i++) {
        const fy = rand(H * 0.18, groundY - 3 * T);
        const fx = rand(60, W - 140);
        const f = Math.random() < 0.5 ? CHEEP : flipMap(CHEEP);
        parts.push(`<g>${anim("transform", "translate", "0 0;-30 0;-60 0;-90 0;-120 0;-90 0;-60 0;-30 0", rand(20, 34).toFixed(0), `begin="-${rand(0, 20).toFixed(0)}s"`)}${sprite(f, fx, fy, 4, { R: "#e8503c", W: "#fff", K: "#000" })}</g>`);
      }
      for (let i = 0; i < 16; i++) {
        const bx = rand(0, W);
        const by = rand(100, groundY);
        const dur = rand(7, 13);
        parts.push(`<g>${anim("transform", "translate", "0 0;3 -70;-3 -140;3 -210;-3 -280;0 -350", dur.toFixed(1), `begin="-${rand(0, dur).toFixed(1)}s"`)}<rect x="${bx.toFixed(0)}" y="${by.toFixed(0)}" width="${choice([8, 12, 16])}" height="${choice([8, 12, 16])}" fill="none" stroke="#bfe6ff" stroke-width="3" opacity="0.7"/></g>`);
      }
    }

    // ---- sky: treetop platforms above a sea of clouds
    const treetops = [];
    if (scene === "sky") {
      const count = Math.floor(rand(4, 6));
      for (let i = 0; i < count; i++) {
        const w = T * Math.floor(rand(3, 6));
        const x = snap(((i + 0.5) * W) / count - w / 2 + rand(-40, 40));
        const y = snap(rand(H * 0.3, H * 0.72));
        treetops.push({ x, y, w });
        parts.push(treetop(x, y, w, T));
      }
      for (let x = -80; x < W; x += 224) parts.push(sprite(CLOUD, x + rand(-30, 30), H - 100 - rand(0, 40), 16, { X: "#ffffff", S: "#a4d0ff" }));
    }

    // ---- floating blocks, mushroom, coins
    const rowY = groundY - 4 * T;
    const n = Math.floor(rand(3, 7));
    const startCol = Math.floor(rand(1, Math.max(2, cols - 8 - (hasCastle ? 4 : 0))));
    if (scene !== "sky") {
      for (let k = 0; k < n; k++) {
        const x = (startCol + k) * T;
        const roll = Math.random();
        if (roll < 0.34) parts.push(qBlock(x, rowY, T, "#fcb800", "#7a3a00", "#7a3a00"));
        else if (roll < 0.42) parts.push(qBlock(x, rowY, T, "#9c5a14", "#3a1c00", null));
        else parts.push(brick(x, rowY));
      }
      if (scene !== "water" && scene !== "castle" && Math.random() < 0.5) {
        const mk = startCol + Math.floor(rand(0, n));
        parts.push(sprite(MUSHROOM, mk * T + (T - 14 * 4) / 2, rowY - MUSHROOM.length * 4, 4, { R: "#d82800", W: "#fff", T: th.tan, K: "#000" }));
      }
      if (Math.random() < 0.55) {
        const n2 = Math.floor(rand(2, 5));
        const c2 = Math.floor(rand(1, cols - n2 - 3));
        for (let k = 0; k < n2; k++) parts.push(Math.random() < 0.5 ? qBlock((c2 + k) * T, rowY - 4 * T, T, "#fcb800", "#7a3a00", "#7a3a00") : brick((c2 + k) * T, rowY - 4 * T));
      }
    }
    const coinFills = { O: "#c84c0c", Y: "#fcb800" };
    if (scene === "sky") {
      treetops.forEach(t => {
        const cn = Math.floor(t.w / 60);
        for (let k = 0; k < cn; k++) parts.push(sprite(COIN, t.x + 24 + k * 56, t.y - 100, 6, coinFills));
      });
    } else {
      const coinRows = scene === "underground" || scene === "water" ? 3 : 1;
      for (let r = 0; r < coinRows; r++) {
        const cn = Math.floor(rand(3, 7));
        const wide = coinRows > 1;
        const cx = wide ? rand(T, W - 9 * T) : (startCol + (n - cn) / 2) * T + 20;
        const cy = wide ? rand(H * 0.28, groundY - T * 3) : rowY - T - 56;
        for (let k = 0; k < cn; k++) parts.push(sprite(COIN, cx + k * 60, cy, 6, coinFills));
      }
    }

    // ---- pipes (with the odd piranha plant), stairs, enemies
    if (scene !== "sky" && scene !== "castle") {
      const pipes = Math.floor(rand(1, 4));
      for (let i = 0; i < pipes; i++) {
        const c = take(2, 1);
        if (c < 0) break;
        const h = T * choice([2, 3, 4]);
        const top = groundY - h;
        if (Math.random() < 0.55) {
          const steps = "0 64;0 32;0 0;0 0;0 0;0 32;0 64;0 64";
          parts.push(`<g ${reduced ? 'transform="translate(0 0)"' : ""}>${anim("transform", "translate", steps, rand(4, 6).toFixed(1), `begin="-${rand(0, 5).toFixed(1)}s"`)}${sprite(PIRANHA, c * T + T / 2, top - 52, 4, { R: "#d82800", W: "#fff", K: "#000", G: "#00a800" })}</g>`);
        }
        parts.push(pipe(c * T, groundY, h, th.pipe[0], th.pipe[1], th.pipe[2], T));
      }
    }
    if (!hasCastle && scene !== "sky" && (scene === "castle" || Math.random() < 0.5)) {
      const sn = choice([3, 4, 5]);
      const c = take(sn, 1);
      if (c >= 0) for (let k = 0; k < sn; k++) for (let h = 0; h <= k; h++) parts.push(hard((c + k) * T, groundY - (h + 1) * T));
    }
    const gFills = { B: th.goomba, T: th.tan, W: "#fff", K: "#000" };
    if (scene === "sky") {
      treetops.filter(() => Math.random() < 0.6).forEach(t => {
        parts.push(sprite(Math.random() < 0.5 ? GOOMBA : flipMap(GOOMBA), t.x + t.w / 2 - 32, t.y - GOOMBA.length * 4, 4, gFills));
      });
    } else if (scene !== "castle" && scene !== "water") {
      const goombas = Math.floor(rand(1, 4));
      for (let i = 0; i < goombas; i++) {
        const c = take(1, 0);
        if (c < 0) break;
        parts.push(sprite(Math.random() < 0.5 ? GOOMBA : flipMap(GOOMBA), c * T, groundY - GOOMBA.length * 4, 4, gFills));
      }
    }

    // ---- ground
    if (scene !== "sky") {
      for (let x = 0; x < W; x += T) {
        if (gap && x >= gap.g0 * T && x < (gap.g0 + gap.gw) * T) continue;
        parts.push(brick(x, groundY));
        parts.push(brick(x, groundY + T));
      }
    }
    return `<g shape-rendering="crispEdges">${parts.join("")}</g>${grain(p)}`;
  },

  // pixel-art skyline from a rooftop, painted on a small canvas (see renderPixelCity)
  "Pixel City"(p) {
    if (typeof document === "undefined") return `<rect width="${W}" height="${H}" fill="#0b0b2b"/>`;
    const city = renderPixelCity(p.isDark);
    return `<image href="${city.url}" width="${W}" height="${H}" preserveAspectRatio="none" style="image-rendering:pixelated"/>${city.overlay}`;
  },


  // Starfield on a graded night sky. Three moods: a calm twinkling sky with the odd
  // shooting star, the old 8-bit drift out of the centre, or a flight through the stars.
  // Everything animated is kept cheap: stars twinkle in a handful of groups instead of
  // one animation each; the flight is 110 streaks on a single CSS animation.
  Starfield(p) {
    const reduced = reducedMotion();
    const variant = choice(["calm", "drift", "warp"]);
    const [tintA, tintB] = choice([["#1f34a8", "#6a2390"], ["#5a2398", "#0f6a7c"], ["#0f6a7c", "#2a3cb0"], ["#8a2348", "#2f2a9a"]]);
    const gx = rand(20, 80);
    const gy = rand(20, 80);
    const tints = ["#ffffff", "#ffffff", "#cfe0ff", "#ffe9b0", "#ffd0e6"];
    const bg = `<defs>
        <linearGradient id="sfL" x1="0" y1="0" x2="${rand(0.3, 1).toFixed(2)}" y2="1"><stop offset="0" stop-color="${tintA}" stop-opacity="0.8"/><stop offset="0.5" stop-color="#04061a"/><stop offset="1" stop-color="${tintB}" stop-opacity="0.6"/></linearGradient>
        <radialGradient id="sfA" cx="${gx.toFixed(0)}%" cy="${gy.toFixed(0)}%" r="65%"><stop offset="0" stop-color="${tintB}" stop-opacity="0.7"/><stop offset="1" stop-color="${tintB}" stop-opacity="0"/></radialGradient>
        <radialGradient id="sfB" cx="${(100 - gx).toFixed(0)}%" cy="${(100 - gy).toFixed(0)}%" r="55%"><stop offset="0" stop-color="${tintA}" stop-opacity="0.6"/><stop offset="1" stop-color="${tintA}" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="#02030a"/><rect width="${W}" height="${H}" fill="url(#sfL)"/><rect width="${W}" height="${H}" fill="url(#sfA)"/><rect width="${W}" height="${H}" fill="url(#sfB)"/>`;

    // stars that twinkle: spread over a few groups, one animation per group
    const still = [];
    const groups = Array.from({ length: 6 }, () => []);
    const sq = (arr, x, y, s, c, o) => arr.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${c}" opacity="${o.toFixed(2)}"/>`);
    const scatter = (count, sizes, twinkling) => {
      for (let i = 0; i < count; i++) {
        const into = i < twinkling ? groups[i % groups.length] : still;
        sq(into, Math.round(rand(0, W) / 2) * 2, Math.round(rand(0, H) / 2) * 2, choice(sizes), choice(tints), rand(0.4, 1));
      }
    };
    const twinkleGroups = () => groups.map(g => g.length
      ? `<g>${reduced ? "" : `<animate attributeName="opacity" values="1;1;0.2;1;1;0.55" dur="${rand(5, 13).toFixed(1)}s" begin="-${rand(0, 10).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>`}${g.join("")}</g>` : "").join("");

    if (variant === "calm") {
      scatter(190, [2, 2, 2, 3, 3, 4], 80);
      // brighter pixel stars: a cross of squares, pulsing in three groups
      const crosses = [[], [], []];
      for (let i = 0; i < 9; i++) {
        const x = Math.round(rand(40, W - 40) / 4) * 4;
        const y = Math.round(rand(40, H - 40) / 4) * 4;
        const c = choice(tints);
        crosses[i % 3].push(`<g fill="${c}"><rect x="${x}" y="${y}" width="4" height="4"/><rect x="${x - 4}" y="${y}" width="4" height="4" opacity="0.6"/><rect x="${x + 4}" y="${y}" width="4" height="4" opacity="0.6"/><rect x="${x}" y="${y - 4}" width="4" height="4" opacity="0.6"/><rect x="${x}" y="${y + 4}" width="4" height="4" opacity="0.6"/></g>`);
      }
      const crossHtml = crosses.map(g => `<g>${reduced ? "" : `<animate attributeName="opacity" values="1;0.45;1" dur="${rand(4, 8).toFixed(1)}s" begin="-${rand(0, 6).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>`}${g.join("")}</g>`).join("");
      let shooting = "";
      if (!reduced) {
        for (let i = 0; i < 2; i++) {
          const dur = rand(11, 19);
          const x0 = rand(W * 0.4, W);
          const y0 = rand(0, H * 0.4);
          let trail = "";
          for (let k = 0; k < 7; k++) trail += `<rect x="${k * 8}" y="${-k * 4}" width="4" height="4" fill="#fff" opacity="${(1 - k * 0.14).toFixed(2)}"/>`;
          shooting += `<g><animateTransform attributeName="transform" type="translate" values="${x0.toFixed(0)} ${y0.toFixed(0)};${(x0 - 460).toFixed(0)} ${(y0 + 230).toFixed(0)};${(x0 - 460).toFixed(0)} ${(y0 + 230).toFixed(0)}" keyTimes="0;0.07;1" dur="${dur.toFixed(1)}s" begin="-${rand(0, dur).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.01;0.07;1" dur="${dur.toFixed(1)}s" begin="-${rand(0, dur).toFixed(1)}s" repeatCount="indefinite"/>${trail}</g>`;
        }
      }
      return `${bg}<g shape-rendering="crispEdges">${still.join("")}${twinkleGroups()}${crossHtml}${shooting}</g>`;
    }

    if (variant === "drift") {
      const cx = W / 2 + rand(-140, 140);
      const cy = H / 2 + rand(-100, 100);
      const maxR = Math.hypot(W, H) / 2 + 40;
      const steps = 6;
      const flying = [];
      for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2);
        const dur = rand(30, 60);
        const tr = [];
        for (let k = 0; k <= steps; k++) {
          const d = Math.pow(k / steps, 1.8) * maxR;
          tr.push(`${(d * Math.cos(a)).toFixed(0)} ${(d * Math.sin(a)).toFixed(0)}`);
        }
        const anim = reduced ? "" : `<animateTransform attributeName="transform" type="translate" values="${tr.join(";")}" dur="${dur.toFixed(1)}s" begin="-${rand(0, dur).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>`;
        const start = reduced ? maxR * rand(0.1, 0.9) : 0;
        flying.push(`<g transform="translate(${(cx + start * Math.cos(a)).toFixed(0)} ${(cy + start * Math.sin(a)).toFixed(0)})"><rect x="0" y="0" width="${choice([2, 2, 3])}" height="${choice([2, 2, 3])}" fill="${choice(tints)}">${anim}</rect></g>`);
      }
      scatter(90, [2, 2, 2, 3], 30);
      return `${bg}<g shape-rendering="crispEdges">${still.join("")}${twinkleGroups()}${flying.join("")}</g>`;
    }

    // warp: every star is a rect on its own ray; one CSS animation pushes it outwards
    // while it stretches along that ray, easing in so the stars seem to accelerate
    const cx = W / 2 + rand(-60, 60);
    const cy = H / 2 + rand(-45, 45);
    const reach = Math.hypot(W, H) / 2 + 80;
    const stars = [];
    for (let i = 0; i < 110; i++) {
      const a = rand(0, Math.PI * 2);
      const t = rand(2.6, 6.5);
      const h = choice([2, 2, 3, 3, 4]);
      const style = reduced
        ? `transform:translateX(${(18 + reach * Math.pow(rand(0.05, 0.95), 2)).toFixed(0)}px) scaleX(${rand(2, 14).toFixed(1)});opacity:0.9`
        : `animation-duration:${t.toFixed(2)}s;animation-delay:-${rand(0, t).toFixed(2)}s`;
      stars.push(`<g transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)}) rotate(${((a * 180) / Math.PI).toFixed(1)})"><rect class="sfw" x="0" y="${(-h / 2).toFixed(1)}" width="3" height="${h}" fill="${choice(tints)}" style="${style}"/></g>`);
    }
    return `${bg}
      <radialGradient id="sfC"><stop offset="0" stop-color="${tintB}" stop-opacity="0.4"/><stop offset="1" stop-color="${tintB}" stop-opacity="0"/></radialGradient>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="200" fill="url(#sfC)"/>
      <style>.sfw{transform-origin:0 0;animation:sfwarp 4s cubic-bezier(.55,0,1,.45) infinite}@keyframes sfwarp{0%{transform:translateX(18px) scaleX(1);opacity:0}10%{opacity:1}100%{transform:translateX(${reach.toFixed(0)}px) scaleX(26);opacity:1}}</style>
      ${stars.join("")}`;
  },

  Nebula(p) {
    return choice(Object.values(nebulae))(p);
  }
};

// ---- nebula variants ------------------------------------------------------
function nebNoise(id, seed, fx, fy, oct, rgb, gain, bias) {
  const [r, g, b] = rgb;
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="${oct}" seed="${seed}"/>
    <feColorMatrix values="0 0 0 0 ${r.toFixed(2)}  0 0 0 0 ${g.toFixed(2)}  0 0 0 0 ${b.toFixed(2)}  ${gain} 0 0 0 ${bias}"/>
  </filter>`;
}

// displaced + blurred + mottled: turns plain strokes and shapes into wispy gas
function nebWarp(id, scale, blur, freqs) {
  const seed = Math.floor(rand(1, 999));
  return `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${freqs}" numOctaves="3" seed="${seed}" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="${blur}" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="4" seed="${seed + 7}" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -0.55" result="ma"/>
    <feComposite in="b" in2="ma" operator="in"/>
  </filter>`;
}

function nebStars(p, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`<circle cx="${rand(0, W).toFixed(0)}" cy="${rand(0, H).toFixed(0)}" r="${rand(0.4, 1.7).toFixed(1)}" fill="${p.isDark ? choice(["#fff", "#fff", "#cfe0ff", "#ffe6c0"]) : p.color(i)}" opacity="${rand(0.25, 0.9).toFixed(2)}"/>`);
  }
  const bright = Math.floor(rand(3, 7));
  for (let i = 0; i < bright; i++) {
    const x = rand(60, W - 60);
    const y = rand(60, H - 60);
    const s = rand(14, 34);
    out.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(s * 1.3).toFixed(0)}" fill="url(#sglow)"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rand(1.8, 3).toFixed(1)}" fill="#fff"/>`);
  }
  return `<defs><radialGradient id="sglow"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${out.join("")}`;
}

function gauss() {
  return (rand(0, 1) + rand(0, 1) + rand(0, 1) - 1.5) / 1.5;
}

const nebulae = {
  // layered fractal clouds (the original look), now with stretched noise and 2-4 layers
  classic(p) {
    const layers = [];
    const defs = [];
    const count = Math.floor(rand(2, 5));
    for (let i = 0; i < count; i++) {
      const fx = rand(0.0025, 0.007);
      const fy = Math.random() < 0.5 ? fx : fx * rand(0.4, 2.2);
      const gain = rand(2.2, 3.2);
      defs.push(nebNoise(`n${i}`, Math.floor(rand(1, 999)), fx.toFixed(4), fy.toFixed(4), Math.floor(rand(3, 6)), p.rgb(i), gain.toFixed(2), (-gain * rand(0.34, 0.4)).toFixed(2)));
      layers.push(`<rect width="${W}" height="${H}" filter="url(#n${i})" opacity="${p.isDark ? 0.95 : 0.8}"/>`);
    }
    return `${baseRect(p)}<defs>${defs.join("")}</defs>${layers.join("")}${nebStars(p, 140)}${grain(p)}`;
  },

  // long luminous ribbons of gas
  ribbon(p) {
    const strokes = [];
    const n = Math.floor(rand(2, 4));
    for (let i = 0; i < n; i++) {
      const y = () => rand(H * 0.1, H * 0.9).toFixed(0);
      const d = `M-150,${y()} C${(W * 0.3).toFixed(0)},${y()} ${(W * 0.65).toFixed(0)},${y()} ${W + 150},${y()}`;
      strokes.push({ d, i });
    }
    const wide = strokes.map(s => `<path d="${s.d}" fill="none" stroke="${p.color(s.i, p.isDark ? 0.55 : 0.5)}" stroke-width="${rand(110, 190).toFixed(0)}" stroke-linecap="round"/>`).join("");
    const mid = strokes.map(s => `<path d="${s.d}" fill="none" stroke="${p.color(s.i + 1, 0.7)}" stroke-width="${rand(40, 80).toFixed(0)}" stroke-linecap="round"/>`).join("");
    const core = strokes.map(s => `<path d="${s.d}" fill="none" stroke="${p.color(s.i + 2, 0.95)}" stroke-width="${rand(8, 16).toFixed(0)}" stroke-linecap="round"/>`).join("");
    return `${baseRect(p)}
      <defs>${nebWarp("warpA", 260, 26, "0.004 0.009")}${nebWarp("warpB", 260, 9, "0.004 0.009")}${nebWarp("warpC", 260, 3, "0.004 0.009")}</defs>
      <g filter="url(#warpA)">${wide}</g>
      <g filter="url(#warpB)">${mid}</g>
      <g filter="url(#warpC)">${core}</g>
      ${nebStars(p, 150)}${grain(p)}`;
  },

  // towering columns of dust, lit from behind
  pillars(p) {
    const dark = p.isDark;
    const k = Math.floor(rand(2, 5));
    const glow = [];
    for (let i = 0; i < 3; i++) {
      glow.push(`<ellipse cx="${rand(0, W).toFixed(0)}" cy="${rand(0, H * 0.6).toFixed(0)}" rx="${rand(260, 520).toFixed(0)}" ry="${rand(160, 300).toFixed(0)}" fill="${p.color(i, 0.6)}"/>`);
    }
    const bodies = [];
    const rims = [];
    const caps = [];
    for (let i = 0; i < k; i++) {
      const cx = ((i + 0.5) * W) / k + rand(-70, 70);
      const w = rand(150, 260);
      const top = rand(H * 0.16, H * 0.46);
      const left = [];
      const right = [];
      for (let y = H + 30; y > top + w * 0.5; y -= 60) {
        const widen = 1 + ((y - top) / H) * 0.6;
        left.push(`${(cx - (w / 2) * widen + rand(-14, 14)).toFixed(0)},${y}`);
        right.unshift(`${(cx + (w / 2) * widen + rand(-14, 14)).toFixed(0)},${y}`);
      }
      const cap = `A${(w * 0.5).toFixed(0)},${(w * 0.62).toFixed(0)} 0 0 1`;
      const lt = left[left.length - 1].split(",");
      const rt = right[0].split(",");
      const path = `M${left.join(" L")} ${cap} ${rt[0]},${rt[1]} L${right.join(" L")} Z`;
            rims.push(`<path d="${path}" fill="${p.color(i + 1, 0.95)}" transform="translate(-9 -5)"/>`);
      bodies.push(`<path d="${path}" fill="url(#pg)"/>`);
      caps.push(`<ellipse cx="${cx.toFixed(0)}" cy="${(Number(lt[1]) - 14).toFixed(0)}" rx="${(w * 0.9).toFixed(0)}" ry="${(w * 0.45).toFixed(0)}" fill="${p.color(i, 0.6)}"/>`);
    }
    const seed = Math.floor(rand(1, 999));
    return `${baseRect(p)}
      <defs>
        <filter id="b80" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="80"/></filter>
        <filter id="b30" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="30"/></filter>
        <filter id="rough" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="${seed}" result="t"/>
          <feDisplacementMap in="SourceGraphic" in2="t" scale="34" xChannelSelector="R" yChannelSelector="G" result="d"/>
          <feGaussianBlur in="d" stdDeviation="1.6"/>
        </filter>
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.color(1)}" stop-opacity="${dark ? 0.55 : 0.7}"/><stop offset="0.22" stop-color="${dark ? "#1a1124" : "#3a2a55"}"/><stop offset="1" stop-color="${dark ? "#07050c" : "#1d1430"}"/></linearGradient>
        <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.color(2)}" stop-opacity="0"/><stop offset="1" stop-color="${p.color(2)}" stop-opacity="0.55"/></linearGradient>
        ${nebNoise("pn", seed + 3, "0.004", "0.008", 4, p.rgb(2), "2.4", "-0.85")}
      </defs>
      <g filter="url(#b80)">${glow.join("")}</g>
      <rect width="${W}" height="${H}" filter="url(#pn)" opacity="${dark ? 0.7 : 0.5}"/>
      <g filter="url(#b30)">${caps.join("")}</g>
      <g filter="url(#rough)">${rims.join("")}${bodies.join("")}</g>
      <rect y="${H - 260}" width="${W}" height="260" fill="url(#mist)"/>
      ${nebStars(p, 130)}${grain(p)}`;
  },

  // a spiral galaxy: logarithmic arms scattered with stars, dust lanes and a bright core
  galaxy(p) {
    const dark = p.isDark;
    const cx = rand(W * 0.35, W * 0.65);
    const cy = rand(H * 0.35, H * 0.65);
    const tilt = rand(-40, 40);
    const flat = rand(0.35, 0.62);
    const arms = choice([2, 2, 3]);
    const size = rand(380, 520);
    const b = Math.log(size / 22) / 6.2;
    const dots = [];
    const lanes = [];
    const clouds = [];
    for (let a = 0; a < arms; a++) {
      const off = (a * Math.PI * 2) / arms;
      for (let i = 0; i < 520; i++) {
        const th = Math.pow(rand(0, 1), 0.85) * 6.2;
        let r = 22 * Math.exp(b * th);
        r += gauss() * r * 0.07;
        const ang = th + off + gauss() * 0.09;
        const x = r * Math.cos(ang);
        const y = r * Math.sin(ang);
        const col = th < 2 ? choice(["#ffe9b0", "#ffd9a0", "#fff4d8"]) : th < 4 ? (dark ? choice(["#fff", "#cfe0ff"]) : p.color(a)) : p.color(a + 1);
        dots.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rand(0.9, 2.8).toFixed(1)}" fill="${col}" opacity="${rand(0.45, 1).toFixed(2)}"/>`);
      }
      const pts = [];
      for (let t = 0.6; t < 6.2; t += 0.14) {
        const r = 22 * Math.exp(b * t) * 0.9;
        pts.push(`${(r * Math.cos(t + off + 0.08)).toFixed(0)},${(r * Math.sin(t + off + 0.08)).toFixed(0)}`);
      }
      lanes.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${dark ? "#05030a" : "rgba(40,20,60,0.45)"}" stroke-width="9" stroke-linecap="round" stroke-opacity="0.4"/>`);
      for (let i = 0; i < 26; i++) {
        const th = rand(1, 6);
        const r = 22 * Math.exp(b * th);
        clouds.push(`<circle cx="${(r * Math.cos(th + off)).toFixed(0)}" cy="${(r * Math.sin(th + off)).toFixed(0)}" r="${rand(20, 50).toFixed(0)}" fill="${p.color(a + 1, 0.3)}"/>`);
      }
    }
    const small = [];
    for (let i = 0; i < 4; i++) {
      small.push(`<ellipse cx="${rand(60, W - 60).toFixed(0)}" cy="${rand(60, H - 60).toFixed(0)}" rx="${rand(8, 22).toFixed(0)}" ry="${rand(4, 10).toFixed(0)}" transform="rotate(${rand(0, 180).toFixed(0)} 0 0)" fill="url(#sglow)" opacity="0.7"/>`);
    }
    return `${baseRect(p)}
      <defs>
        <radialGradient id="core"><stop offset="0" stop-color="#fffbe8" stop-opacity="1"/><stop offset="0.35" stop-color="#ffd9a0" stop-opacity="0.75"/><stop offset="1" stop-color="${p.color(0)}" stop-opacity="0"/></radialGradient>
        <filter id="gb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="gb2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <g transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)}) rotate(${tilt.toFixed(0)}) scale(1 ${flat.toFixed(2)})">
        <circle r="${(size * 0.8).toFixed(0)}" fill="${p.color(1, 0.1)}" filter="url(#gb)"/>
        <g filter="url(#gb)">${clouds.join("")}</g>
        ${dots.join("")}
        <g filter="url(#gb2)">${lanes.join("")}</g>
        <circle r="${(size * 0.3).toFixed(0)}" fill="url(#core)"/>
        <circle r="${(size * 0.07).toFixed(0)}" fill="#fff" opacity="0.95"/>
      </g>
      ${nebStars(p, 130)}${small.join("")}${grain(p)}`;
  },

  // glowing emission gas cut by sharp dark dust lanes, with a bright young star
  dust(p) {
    const defs = [];
    const layers = [];
    for (let i = 0; i < 2; i++) {
      const fx = rand(0.003, 0.007);
      defs.push(nebNoise(`e${i}`, Math.floor(rand(1, 999)), fx.toFixed(4), (fx * rand(0.6, 1.6)).toFixed(4), 5, p.rgb(i), "2.8", "-1.0"));
      layers.push(`<rect width="${W}" height="${H}" filter="url(#e${i})" opacity="${p.isDark ? 0.95 : 0.8}"/>`);
    }
    const dustRgb = p.isDark ? [0.01, 0.005, 0.02] : [0.25, 0.12, 0.2];
    defs.push(nebNoise("dl", Math.floor(rand(1, 999)), "0.006", rand(0.008, 0.014).toFixed(4), 5, dustRgb, "4.2", "-2.3"));
    const sx = rand(W * 0.25, W * 0.75);
    const sy = rand(H * 0.25, H * 0.7);
    return `${baseRect(p)}
      <defs>${defs.join("")}
        <radialGradient id="halo"><stop offset="0" stop-color="${p.color(2)}" stop-opacity="0.7"/><stop offset="1" stop-color="${p.color(2)}" stop-opacity="0"/></radialGradient>
      </defs>
      ${layers.join("")}
      <circle cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="300" fill="url(#halo)"/>
      <rect width="${W}" height="${H}" filter="url(#dl)" opacity="${p.isDark ? 0.8 : 0.55}"/>
      <circle cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="16" fill="#fff" opacity="0.5"/>
      <circle cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="6" fill="#fff"/>
      ${nebStars(p, 130)}${grain(p)}`;
  },

  // an expanding supernova remnant: a wobbling shell with bright filaments
  remnant(p) {
    const cx = rand(W * 0.35, W * 0.65);
    const cy = rand(H * 0.35, H * 0.65);
    const R0 = rand(190, 300);
    const fil = [];
    for (let i = 0; i < 9; i++) {
      const r = R0 * rand(0.55, 1.05);
      const a1 = rand(0, Math.PI * 2);
      const a2 = a1 + rand(0.4, 1.4);
      fil.push(`<path d="M${(cx + r * Math.cos(a1)).toFixed(0)},${(cy + r * Math.sin(a1)).toFixed(0)}A${r.toFixed(0)},${r.toFixed(0)} 0 0 1 ${(cx + r * Math.cos(a2)).toFixed(0)},${(cy + r * Math.sin(a2)).toFixed(0)}" fill="none" stroke="${p.color(i + 2, 0.9)}" stroke-width="${rand(3, 9).toFixed(1)}" stroke-linecap="round"/>`);
    }
    return `${baseRect(p)}
      <defs>
        ${nebWarp("shellA", 150, 14, "0.008 0.008")}${nebWarp("shellB", 190, 4, "0.01 0.01")}
        <radialGradient id="inner"><stop offset="0.45" stop-color="${p.color(2)}" stop-opacity="0"/><stop offset="1" stop-color="${p.color(2)}" stop-opacity="0.35"/></radialGradient>
        <radialGradient id="pulsar"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <g filter="url(#shellA)">
        <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R0.toFixed(0)}" fill="url(#inner)"/>
        <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R0.toFixed(0)}" fill="none" stroke="${p.color(0, 0.65)}" stroke-width="80"/>
        <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(R0 * 0.92).toFixed(0)}" fill="none" stroke="${p.color(1, 0.7)}" stroke-width="30"/>
      </g>
      <g filter="url(#shellB)">
        <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(R0 * 0.98).toFixed(0)}" fill="none" stroke="${p.color(3, 0.95)}" stroke-width="8" stroke-dasharray="180 60 40 90"/>
        ${fil.join("")}
      </g>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="70" fill="url(#pulsar)"/>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="5" fill="#fff"/>
      ${nebStars(p, 140)}${grain(p)}`;
  }
};

let lastStyle = null;
// focal point (fractions of the picture) a style wants kept behind the Play button
let skinAnchor = null;

function toDataUrl(svg) {
  const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(full).replace(/'/g, "%27").replace(/"/g, "%22")}")`;
}

// Right panel carries the playlist text, so it gets a calmer mesh in the same palette.
// Light theme: full-strength accent colours under a deep veil, so the panel is rich and
// mid-dark (like the default light panel) and the translucent playlist cards stand out.
function rightPanelStyle(p) {
  if (p.right) return p.right;
  const veil = p.isDark ? "rgba(8,10,20,0.35)" : "rgba(16,20,46,0.32)";
  const blobs = [0, 1, 2].map(i =>
    `radial-gradient(circle at ${rand(0, 100).toFixed(0)}% ${rand(0, 100).toFixed(0)}%, ${p.color(i, p.isDark ? 0.45 : 0.85)}, transparent ${rand(45, 70).toFixed(0)}%)`
  );
  const base = p.isDark ? `${p.bgColor()}, ${p.bg2Color()}` : `${p.color(0)}, ${p.color(1)}, ${p.color(2)}`;
  return `
    linear-gradient(${veil}, ${veil}),
    ${blobs.join(", ")},
    linear-gradient(${rand(120, 240).toFixed(0)}deg, ${base})
  `;
}

function leftPanelStyle(p, svg) {
  // bold patterns get a stronger veil so the player stays readable
  const veil = p.veil ? p.veil : p.busy
    ? (p.isDark ? "rgba(8,6,4,0.45)" : "rgba(255,248,235,0.42)")
    : (p.isDark ? "rgba(8,10,20,0.28)" : "rgba(255,255,255,0.22)");
  return `
    linear-gradient(${veil}, ${veil}),
    ${toDataUrl(svg)} center / cover no-repeat
  `;
}

const ETHNIC = [
  // Africa
  "Kente", "Mudcloth", "Ndebele", "Kasai", "Adinkra", "Ankara", "Zulu", "Berber", "Shuka", "Adire",
  // Asia, Europe, the Americas, Oceania
  "Seigaiha", "Sashiko", "Kawung", "Girih", "Azulejo", "FairIsle", "Slavic", "Navajo", "Andean", "Aboriginal"
];
const PIXEL = ["Pixel Level", "Pixel City"];

// styles grouped for the /skins picker
export const SKIN_GROUPS = {
  Abstract: ["Aurora", "Synthwave", "Contour", "Bokeh", "Pulse"],
  Space: ["Nebula", "Starfield"],
  Ethnic: ETHNIC,
  Pixel: PIXEL
};

// Starfield is pure black, so it only appears with the dark theme.
// `only` is a group name (a random style from that group) or one particular style.
export function generateSkin(isDark, only = null) {
  const allowed = n => isDark || n !== "Starfield";
  let pool;
  let wanted = null;
  if (only && SKIN_GROUPS[only]) {
    pool = SKIN_GROUPS[only].filter(allowed);
  } else {
    if (only && styles[only] && allowed(only)) wanted = only;
    // ethnic ornaments and pixel scenes turn up now and then, the abstract styles most of the time
    const roll = Math.random();
    pool = roll < 0.3 ? ETHNIC : roll < 0.45 ? PIXEL : [...SKIN_GROUPS.Abstract, ...SKIN_GROUPS.Space].filter(allowed);
  }
  const fresh = pool.filter(n => n !== lastStyle);
  const name = wanted || choice(fresh.length ? fresh : pool);
  lastStyle = name;
  skinAnchor = null;
  const palette = ETHNIC.includes(name) ? makeEthnicPalette(isDark, name)
    : PIXEL.includes(name) ? pixelPalettes[name](isDark)
    : name === "Starfield" ? starfieldPalette()
    : makePalette(isDark);
  return {
    name,
    left: leftPanelStyle(palette, styles[name](palette)),
    right: rightPanelStyle(palette),
    anchor: skinAnchor
  };
}
