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
function makeAfricanPalette(isDark) {
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
  return `<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${fill}"/><path d="${d}" stroke="${line}" stroke-width="3" fill="none"/><rect x="${x}" y="${y}" width="${T}" height="${T}" fill="none" stroke="${line}" stroke-width="3"/>`;
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
const COIN = [".OO.", "OYYO", "OYYO", "OYYO", "OYYO", ".OO."];

function qBlock(x, y, T, fill, edge, mark) {
  return `<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${fill}" stroke="${edge}" stroke-width="3"/>` + sprite(QBLOCK, x + 9, y + 3, 6, mark);
}

function pipe(x, groundY, h, lipFill, bodyFill, dark) {
  const w = 96;
  const top = groundY - h;
  return `<rect x="${x + 6}" y="${top + 36}" width="${w - 12}" height="${h - 36}" fill="${bodyFill}" stroke="${dark}" stroke-width="4"/>
    <rect x="${x + 18}" y="${top + 36}" width="12" height="${h - 36}" fill="${lipFill}" opacity="0.7"/>
    <rect x="${x}" y="${top}" width="${w}" height="36" fill="${bodyFill}" stroke="${dark}" stroke-width="4"/>
    <rect x="${x + 12}" y="${top + 4}" width="12" height="28" fill="${lipFill}" opacity="0.7"/>`;
}

function hill(cx, groundY, w) {
  const dark = [];
  const green = [];
  for (let j = 0; (w - j * 48) >= 48; j++) {
    const wj = w - j * 48;
    const y = groundY - (j + 1) * 24;
    dark.push(`<rect x="${cx - wj / 2 - 6}" y="${y}" width="${wj + 12}" height="30" fill="#005800"/>`);
    green.push(`<rect x="${cx - wj / 2}" y="${y + 6}" width="${wj}" height="24" fill="#00a800"/>`);
  }
  return dark.join("") + green.join("");
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
    const cx = W * rand(0.4, 0.6);
    const sunY = horizon - 70;
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
        for (let a = 0; a < 90; a++) {
          const t = (a / 90) * Math.PI * 2;
          const r = i * step * (1 + amp[0] * Math.sin(2 * t + ph[0] + i * 0.09) + amp[1] * Math.sin(3 * t + ph[1] - i * 0.07) + amp[2] * Math.sin(5 * t + ph[2] + i * 0.05));
          pts.push(`${(cx + r * Math.cos(t)).toFixed(0)},${(cy + r * Math.sin(t)).toFixed(0)}`);
        }
        const op = Math.max(0.18, 0.85 - i / rings * 0.6);
        groups.push(`<polygon points="${pts.join(" ")}" fill="none" stroke="${p.color(c + (i % 3 === 0 ? 1 : 0), op)}" stroke-width="${i % 5 === 0 ? 2.2 : 1.1}" stroke-linejoin="round"/>`);
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

  Pulse(p) {
    const cx = rand(W * 0.3, W * 0.7);
    const cy = rand(H * 0.3, H * 0.7);
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

  Kuba(p) {
    const parts = [];
    const ink = p.ink;
    const cell = 80;
    const q = cell / 4;
    for (let r = 0; r * cell < H; r++) {
      for (let c = 0; c * cell < W; c++) {
        const x = c * cell;
        const y = r * cell;
        parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${p.color(Math.floor(rand(0, 4)), 0.22)}"/>`);
        const m = Math.floor(rand(0, 5));
        if (m === 0) {
          parts.push(`<path d="M${x + q},${y + cell - q} L${x + cell - q},${y + q} M${x + q + 14},${y + cell - q} L${x + cell - q + 14},${y + q}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`);
        } else if (m === 1) {
          parts.push(`<rect x="${x + q}" y="${y + q}" width="${cell - 2 * q}" height="${cell - 2 * q}" fill="none" stroke="${ink}" stroke-width="5"/><rect x="${x + q * 1.7}" y="${y + q * 1.7}" width="${cell - 3.4 * q}" height="${cell - 3.4 * q}" fill="${ink}"/>`);
        } else if (m === 2) {
          parts.push(`<path d="M${x + q},${y + q} V${y + cell - q} H${x + cell - q}" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
        } else if (m === 3) {
          parts.push(`<polyline points="${x + q},${y + cell / 2 + 10} ${x + cell / 2},${y + q} ${x + cell - q},${y + cell / 2 + 10}" fill="none" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/><polyline points="${x + q},${y + cell - q} ${x + cell / 2},${y + cell / 2 + 12} ${x + cell - q},${y + cell - q}" fill="none" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>`);
        } else {
          parts.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${q * 0.5}" fill="${ink}"/><circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${q * 1.3}" fill="none" stroke="${ink}" stroke-width="4" stroke-dasharray="4 7"/>`);
        }
      }
    }
    for (let c = 0; c <= W; c += cell) parts.push(`<line x1="${c}" y1="0" x2="${c}" y2="${H}" stroke="${ink}" stroke-width="2" opacity="0.5"/>`);
    for (let r = 0; r <= H; r += cell) parts.push(`<line x1="0" y1="${r}" x2="${W}" y2="${r}" stroke="${ink}" stroke-width="2" opacity="0.5"/>`);
    return `${baseRect(p)}${parts.join("")}${grain(p)}`;
  },


  "Pixel Level"(p) {
    const T = 48;
    const groundY = H - 2 * T;
    const parts = [];
    const dark = p.isDark;
    const brickFill = dark ? "#1c3fa6" : "#c84c0c";
    const brickLine = dark ? "#07163f" : "#4a1800";
    const snap = v => Math.round(v / T) * T;

    parts.push(`<rect width="${W}" height="${H}" fill="${dark ? "#05060f" : "#5c94fc"}"/>`);

    if (!dark) {
      for (let i = 0; i < 3; i++) parts.push(hill(snap(rand(0, W)), groundY, choice([240, 336, 432])));
      for (let i = 0; i < 5; i++) {
        parts.push(sprite(CLOUD, rand(0, W - 160), rand(30, H * 0.4), 8, { X: "#ffffff", S: "#a4d0ff" }));
      }
      for (let i = 0; i < 3; i++) {
        parts.push(sprite(CLOUD, snap(rand(0, W - 160)), groundY - 6 * 8, 8, { X: "#38c030", S: "#00780c" }));
      }
    } else {
      for (let x = 0; x < W; x += T) {
        parts.push(brickTile(x, 0, T, brickFill, brickLine));
        parts.push(brickTile(x, T, T, brickFill, brickLine));
      }
      for (let i = 0; i < 4; i++) {
        const sx = snap(rand(0, W - 5 * T));
        const n = Math.floor(rand(2, 6));
        for (let k = 0; k < n; k++) parts.push(brickTile(sx + k * T, 2 * T, T, brickFill, brickLine));
      }
    }

    // floating row of blocks
    const rowY = groundY - 4 * T;
    const startX = snap(rand(T, W - 7 * T));
    const n = Math.floor(rand(3, 7));
    for (let k = 0; k < n; k++) {
      const x = startX + k * T;
      if (Math.random() < 0.4) parts.push(qBlock(x, rowY, T, "#fcb800", "#7a3a00", "#7a3a00"));
      else parts.push(brickTile(x, rowY, T, brickFill, brickLine));
    }
    // coins
    if (dark) {
      for (let r = 0; r < 3; r++) {
        const cy = rand(H * 0.3, groundY - T * 3);
        const cx = rand(T, W - 9 * T);
        const cn = Math.floor(rand(4, 9));
        for (let k = 0; k < cn; k++) parts.push(sprite(COIN, cx + k * 60, cy, 8, { O: "#c84c0c", Y: "#fcb800" }));
      }
    } else {
      for (let k = 0; k < 3; k++) parts.push(sprite(COIN, startX + T + k * 60, rowY - 80, 8, { O: "#c84c0c", Y: "#fcb800" }));
    }
    // pipes
    const pipes = Math.floor(rand(1, 3));
    for (let i = 0; i < pipes; i++) {
      parts.push(pipe(snap(rand(T, W - 3 * T)), groundY, T * choice([2, 3, 4]), "#a8f8a8", "#00a800", "#005800"));
    }
    // ground
    for (let x = 0; x < W; x += T) {
      parts.push(brickTile(x, groundY, T, brickFill, brickLine));
      parts.push(brickTile(x, groundY + T, T, brickFill, brickLine));
    }
    return `<g shape-rendering="crispEdges">${parts.join("")}</g>${grain(p)}`;
  },

  "Pixel City"(p) {
    const parts = [];
    const dark = p.isDark;
    const horizon = H - 150;
    const skies = dark
      ? [["#0b0b2b", "#5a2a7a", "#ff5f8f"], ["#04101f", "#0a3a6b", "#38e8ff"], ["#140a2e", "#7a2a6b", "#ffb347"]]
      : [["#6fb7ff", "#bfe3ff", "#fff0d2"], ["#8fd0ff", "#d7f0ff", "#ffe4c2"], ["#ffb18a", "#ffd6b0", "#fff3d6"]];
    const [c1, c2, c3] = choice(skies);
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const col = t < 0.5 ? lerpHex(c1, c2, t * 2) : lerpHex(c2, c3, (t - 0.5) * 2);
      parts.push(`<rect x="0" y="${Math.round((horizon / bands) * i)}" width="${W}" height="${Math.ceil(horizon / bands) + 1}" fill="${col}"/>`);
    }
    parts.push(`<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="${c3}"/>`);

    if (dark) {
      for (let i = 0; i < 70; i++) {
        parts.push(`<rect x="${Math.round(rand(0, W))}" y="${Math.round(rand(0, horizon * 0.6))}" width="6" height="6" fill="#fff" opacity="${rand(0.3, 1).toFixed(2)}"/>`);
      }
    } else {
      for (let i = 0; i < 4; i++) parts.push(sprite(CLOUD, rand(0, W - 160), rand(40, horizon * 0.5), 8, { X: "#ffffff", S: "#d9ecff" }));
    }
    // sun / moon, stepped circle
    const r = 96;
    const sx = rand(200, W - 200);
    const sy = rand(120, horizon * 0.5);
    for (let dy = -r; dy < r; dy += 12) {
      const hw = Math.round(Math.sqrt(r * r - dy * dy) / 12) * 12;
      parts.push(`<rect x="${sx - hw}" y="${sy + dy}" width="${hw * 2}" height="12" fill="${dark ? "#fff2c8" : "#fff6a8"}" opacity="0.95"/>`);
    }

    const layers = dark
      ? [{ fill: "#1c1440", lit: ["#8a6cff"], chance: 0.1 }, { fill: "#120d2b", lit: ["#ffd866", "#6ef0ff"], chance: 0.28 }, { fill: "#08051a", lit: ["#ffd866", "#ff7ab8", "#6ef0ff"], chance: 0.4 }]
      : [{ fill: "#9db8e0", lit: ["#dcecff"], chance: 0.15 }, { fill: "#7a9bd0", lit: ["#eaf4ff"], chance: 0.3 }, { fill: "#4d6aa0", lit: ["#ffffff", "#cfe6ff"], chance: 0.45 }];
    layers.forEach((L, li) => {
      let x = -Math.round(rand(0, 60));
      const maxH = [330, 430, 560][li];
      const minH = [120, 150, 190][li];
      while (x < W) {
        const w = Math.round(rand(84, 168) / 12) * 12;
        const h = Math.round(rand(minH, maxH) / 12) * 12;
        const top = horizon - h + (2 - li) * 30;
        parts.push(`<rect x="${x}" y="${top}" width="${w}" height="${H - top}" fill="${L.fill}"/>`);
        if (Math.random() < 0.3) parts.push(`<rect x="${x + w / 2 - 3}" y="${top - 42}" width="6" height="42" fill="${L.fill}"/>`);
        for (let wy = top + 18; wy < horizon - 10 + (2 - li) * 30; wy += 30) {
          for (let wx = x + 12; wx < x + w - 18; wx += 24) {
            if (Math.random() < L.chance) parts.push(`<rect x="${wx}" y="${wy}" width="12" height="12" fill="${choice(L.lit)}"/>`);
          }
        }
        x += w + (li === 2 ? 0 : Math.round(rand(0, 24)));
      }
    });
    return `<g shape-rendering="crispEdges">${parts.join("")}</g>${grain(p)}`;
  },


  // 8-bit starfield screensaver: a few square stars drifting out of the centre on
  // pure black. The motion is stepped (discrete keyframes) to keep the retro feel.
  Starfield(p) {
    const parts = [];
    const cx = W / 2 + rand(-140, 140);
    const cy = H / 2 + rand(-100, 100);
    const maxR = Math.hypot(W, H) / 2 + 40;
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps = 6;

    // stars flying outwards, growing as they get closer
    const flying = 16;
    for (let i = 0; i < flying; i++) {
      const a = rand(0, Math.PI * 2);
      const dur = rand(30, 60);
      const tr = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const d = Math.pow(t, 1.8) * maxR;
        tr.push(`${(d * Math.cos(a)).toFixed(0)} ${(d * Math.sin(a)).toFixed(0)}`);
      }
      const anim = reduced ? "" : `
        <animateTransform attributeName="transform" type="translate" values="${tr.join(";")}" dur="${dur.toFixed(1)}s" begin="-${rand(0, dur).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>`;
      const start = reduced ? maxR * rand(0.1, 0.9) : 0;
      parts.push(`<g transform="translate(${(cx + start * Math.cos(a)).toFixed(0)} ${(cy + start * Math.sin(a)).toFixed(0)})"><rect x="0" y="0" width="1" height="1" fill="#fff">${anim}</rect></g>`);
    }

    // a handful of fixed stars that blink
    for (let i = 0; i < 12; i++) {
      const x = Math.round(rand(0, W));
      const y = Math.round(rand(0, H));
      const size = choice([1, 1, 1, 1, 2]);
      const dur = rand(9, 18);
      const blink = reduced ? "" : `<animate attributeName="opacity" values="1;1;0.25;1;1;0.5" dur="${dur.toFixed(1)}s" begin="-${rand(0, dur).toFixed(1)}s" repeatCount="indefinite" calcMode="discrete"/>`;
      parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff" opacity="${rand(0.5, 1).toFixed(2)}">${blink}</rect>`);
    }
    return `<rect width="${W}" height="${H}" fill="#000"/><g shape-rendering="crispEdges">${parts.join("")}</g>`;
  },


  // a big record, partly off-canvas: real grooves, track gaps, a conic light sheen,
  // a printed label and a tonearm resting on it
  Vinyl(p) {
    const R = rand(430, 560);
    const cx = rand(W * 0.4, W * 0.8);
    const cy = rand(H * 0.4, H * 0.75);
    const labelR = R * 0.33;
    const colored = Math.random() < 0.35;
    const discFill = colored ? p.color(2, 0.92) : "#0c0c10";
    const parts = [];

    // grooves
    for (let r = labelR * 1.22; r < R - 10; r += 3) {
      parts.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="#fff" stroke-opacity="${rand(0.015, 0.09).toFixed(3)}"/>`);
    }
    // gaps between tracks
    const gaps = Math.floor(rand(4, 8));
    for (let i = 0; i < gaps; i++) {
      const r = rand(labelR * 1.5, R - 40);
      parts.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="${rand(3, 7).toFixed(1)}"/>`);
    }

    // conic sheen: two bright bands across the record, built from thin wedges
    const a0 = rand(0, Math.PI);
    const step = 1;
    for (let k = 0; k < 360; k += step) {
      const t1 = (k * Math.PI) / 180;
      const t2 = ((k + step + 0.4) * Math.PI) / 180;
      const c = Math.max(0, Math.cos(2 * (t1 - a0)));
      const op = Math.pow(c, 9) * 0.34 + Math.pow(c, 3) * 0.05;
      if (op < 0.01) continue;
      parts.push(`<polygon points="${cx.toFixed(0)},${cy.toFixed(0)} ${(cx + R * Math.cos(t1)).toFixed(1)},${(cy + R * Math.sin(t1)).toFixed(1)} ${(cx + R * Math.cos(t2)).toFixed(1)},${(cy + R * Math.sin(t2)).toFixed(1)}" fill="#fff" fill-opacity="${op.toFixed(3)}"/>`);
    }

    // label
    const ringCount = 3;
    let label = `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${labelR.toFixed(0)}" fill="url(#label)"/>`;
    for (let i = 1; i <= ringCount; i++) {
      label += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(labelR * (1 - i * 0.14)).toFixed(0)}" fill="none" stroke="${p.bgColor(0.55)}" stroke-width="${i === 1 ? 3 : 1.5}" ${i === 2 ? 'stroke-dasharray="3 7"' : ""}/>`;
    }
    label += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(labelR * 0.17).toFixed(0)}" fill="${p.bgColor()}"/>`;
    label += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="9" fill="${p.bgColor()}" stroke="rgba(0,0,0,0.4)" stroke-width="2"/>`;

    // tonearm
    const pivot = { x: W - 70, y: 70 };
    const ang = rand(-2.4, -1.9);
    const needle = { x: cx + R * 0.62 * Math.cos(ang), y: cy + R * 0.62 * Math.sin(ang) };
    const dx = needle.x - pivot.x;
    const dy = needle.y - pivot.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const arm = `
      <line x1="${(pivot.x - nx * 80).toFixed(0)}" y1="${(pivot.y - ny * 80).toFixed(0)}" x2="${pivot.x.toFixed(0)}" y2="${pivot.y.toFixed(0)}" stroke="#4a4d58" stroke-width="16" stroke-linecap="round"/>
      <line x1="${pivot.x.toFixed(0)}" y1="${pivot.y.toFixed(0)}" x2="${needle.x.toFixed(0)}" y2="${needle.y.toFixed(0)}" stroke="#d3d6df" stroke-width="9" stroke-linecap="round"/>
      <line x1="${pivot.x.toFixed(0)}" y1="${pivot.y.toFixed(0)}" x2="${needle.x.toFixed(0)}" y2="${needle.y.toFixed(0)}" stroke="#fff" stroke-opacity="0.5" stroke-width="2.5" stroke-linecap="round" transform="translate(-2 -2)"/>
      <g transform="translate(${needle.x.toFixed(0)} ${needle.y.toFixed(0)}) rotate(${((Math.atan2(ny, nx) * 180) / Math.PI + 18).toFixed(0)})">
        <rect x="-8" y="-12" width="46" height="24" rx="5" fill="#2c2e36"/>
        <rect x="22" y="-6" width="14" height="12" rx="2" fill="${p.color(0)}"/>
      </g>
      <circle cx="${pivot.x.toFixed(0)}" cy="${pivot.y.toFixed(0)}" r="42" fill="#2c2e36"/>
      <circle cx="${pivot.x.toFixed(0)}" cy="${pivot.y.toFixed(0)}" r="20" fill="#8b8e9a"/>
      <circle cx="${pivot.x.toFixed(0)}" cy="${pivot.y.toFixed(0)}" r="7" fill="#d3d6df"/>`;

    return `${baseRect(p)}
      <defs>
        <radialGradient id="label" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="${p.color(0)}"/><stop offset="1" stop-color="${p.color(1)}"/></radialGradient>
        <radialGradient id="rim" cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R.toFixed(0)}" gradientUnits="userSpaceOnUse"><stop offset="0.9" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.22"/></radialGradient>
        <clipPath id="disc"><circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R.toFixed(0)}"/></clipPath>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
      </defs>
      <circle cx="${(cx + 22).toFixed(0)}" cy="${(cy + 34).toFixed(0)}" r="${R.toFixed(0)}" fill="#000" opacity="${p.isDark ? 0.7 : 0.35}" filter="url(#shadow)"/>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R.toFixed(0)}" fill="${discFill}"/>
      <g clip-path="url(#disc)">${parts.join("")}</g>
      <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R.toFixed(0)}" fill="url(#rim)"/>
      ${label}
      ${arm}
      ${grain(p)}`;
  },

  Nebula(p) {
    const layers = [];
    const defs = [];
    const count = 3;
    for (let i = 0; i < count; i++) {
      const [r, g, b] = p.rgb(i);
      const freq = rand(0.0025, 0.007).toFixed(4);
      defs.push(`<filter id="n${i}" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${Math.floor(rand(1, 999))}"/>
        <feColorMatrix values="0 0 0 0 ${r.toFixed(2)}  0 0 0 0 ${g.toFixed(2)}  0 0 0 0 ${b.toFixed(2)}  2.6 0 0 0 -0.95"/>
      </filter>`);
      layers.push(`<rect width="${W}" height="${H}" filter="url(#n${i})" opacity="${p.isDark ? 0.95 : 0.8}"/>`);
    }
    const stars = [];
    for (let i = 0; i < 140; i++) {
      stars.push(`<circle cx="${rand(0, W).toFixed(0)}" cy="${rand(0, H).toFixed(0)}" r="${rand(0.4, 1.7).toFixed(1)}" fill="${p.isDark ? "white" : p.color(i)}" opacity="${rand(0.25, 0.9).toFixed(2)}"/>`);
    }
    return `${baseRect(p)}<defs>${defs.join("")}</defs>${layers.join("")}${stars.join("")}${grain(p)}`;
  }
};

let lastStyle = null;

function toDataUrl(svg) {
  const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(full).replace(/'/g, "%27").replace(/"/g, "%22")}")`;
}

// Right panel carries the playlist text, so it gets a calmer mesh in the same palette.
function rightPanelStyle(p) {
  if (p.right) return p.right;
  const veil = p.isDark ? "rgba(8,10,20,0.35)" : "rgba(255,255,255,0.32)";
  const blobs = [0, 1, 2].map(i =>
    `radial-gradient(circle at ${rand(0, 100).toFixed(0)}% ${rand(0, 100).toFixed(0)}%, ${p.color(i, p.isDark ? 0.45 : 0.55)}, transparent ${rand(45, 70).toFixed(0)}%)`
  );
  return `
    linear-gradient(${veil}, ${veil}),
    ${blobs.join(",\n    ")},
    linear-gradient(${rand(120, 240).toFixed(0)}deg, ${p.bgColor()}, ${p.bg2Color()})
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

const AFRICAN = ["Kente", "Mudcloth", "Ndebele", "Kuba"];
const PIXEL = ["Pixel Level", "Pixel City"];

// Starfield is pure black, so it only appears with the dark theme
export function generateSkin(isDark) {
  // themed packs turn up now and then, the abstract styles most of the time
  const roll = Math.random();
  const themed = [...AFRICAN, ...PIXEL];
  const abstract = Object.keys(styles).filter(n => !themed.includes(n) && (isDark || n !== "Starfield"));
  const pool = roll < 0.22 ? AFRICAN : roll < 0.44 ? PIXEL : abstract;
  const name = choice(pool.filter(n => n !== lastStyle));
  lastStyle = name;
  const palette = AFRICAN.includes(name) ? makeAfricanPalette(isDark)
    : PIXEL.includes(name) ? pixelPalettes[name](isDark)
    : name === "Starfield" ? starfieldPalette()
    : makePalette(isDark);
  return {
    name,
    left: leftPanelStyle(palette, styles[name](palette)),
    right: rightPanelStyle(palette)
  };
}
