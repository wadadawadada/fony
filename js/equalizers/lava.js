export default function Lava({ container, analyser }) {
  const h = 72;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', h);
  svg.style.overflow = 'hidden';
  container.innerHTML = '';
  container.appendChild(svg);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const fid = 'goo-' + Math.floor(Math.random() * 1e6);
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', fid);
  const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('in', 'SourceGraphic');
  blur.setAttribute('stdDeviation', '7.8');
  blur.setAttribute('result', 'blur');
  const cm = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
  cm.setAttribute('in', 'blur');
  cm.setAttribute('mode', 'matrix');
  cm.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -10');
  cm.setAttribute('result', 'goo');
  const blend = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
  blend.setAttribute('in', 'SourceGraphic');
  blend.setAttribute('in2', 'goo');
  blend.setAttribute('mode', 'normal');
  filter.appendChild(blur); filter.appendChild(cm); filter.appendChild(blend);
  defs.appendChild(filter);
  svg.appendChild(defs);

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('filter', `url(#${fid})`);
  svg.appendChild(group);

  const MARGIN_X = 0, MARGIN_Y = 0;
  const n = 12;
  const blobs = [], circles = [];
  const freq = new Uint8Array(256);
  let raf = null, lastT = performance.now();

  const R_MIN = 8, R_MAX = 35;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function prnd(seed, t, a = 1, b = 1) { return Math.sin(seed * 12.9898 + t * a) * Math.cos(seed * 78.233 + t * b); }
  function sampleWeightedRadius() {
    const r = Math.random();
    if (r < 0.12) return rnd(R_MIN, R_MIN + 10);
    if (r < 0.60) return rnd(R_MIN + 10, R_MIN + 22);
    return rnd(R_MIN + 20, R_MAX);
  }
  function energyLevel() {
    analyser.getByteFrequencyData(freq);
    let s = 0;
    for (let i = 0; i < freq.length; i++) s += freq[i];
    return (s / freq.length) / 255;
  }
  function placeNicely(w) {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = (w - MARGIN_X * 2) / cols;
    const cellH = (h - MARGIN_Y * 2) / rows;
    const spots = [];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (k++ >= n) break;
        const cx = MARGIN_X + c * cellW + cellW * rnd(0.15, 0.85);
        const cy = MARGIN_Y + r * cellH + cellH * rnd(0.15, 0.85);
        spots.push({ x: cx, y: cy });
      }
    }
    return spots;
  }
  function init() {
    const w = container.clientWidth || 320;
    const spots = placeNicely(w);
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('fill', '#00F2B8');
      c.setAttribute('fill-opacity', '0.82');
      group.appendChild(c);
      circles.push(c);
      const baseR = sampleWeightedRadius();
      const speedFactor = rnd(0.65, 1.35) * (baseR < R_MIN + 12 ? 1.35 : baseR > R_MAX - 10 ? 0.5 : 1);
      const floatDir = Math.random() < 0.8 ? -1 : 1;
      const spot = spots[i % spots.length];
      blobs.push({
        x: spot.x + rnd(-20, 20),
        y: spot.y + rnd(-8, 8),
        vx: rnd(-0.11, 0.11),
        vy: rnd(-0.09, 0.09),
        baseR,
        r: baseR,
        speedFactor,
        floatDir,
        phaseX: rnd(0, TAU),
        phaseY: rnd(0, TAU),
        id: Math.random() * 1000
      });
    }
  }

  let mouseActive = false;
  let mouseX = 0, mouseY = 0;
  svg.addEventListener('mouseenter', e => { mouseActive = true; });
  svg.addEventListener('mouseleave', e => { mouseActive = false; });
  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });

  function update(dt) {
    const w = container.clientWidth || 320;
    const level = energyLevel();
    const viscosity = 0.92 - level * 0.25;
    const buoyancyBase = 0.018 + level * 0.065;
    for (let i = 0; i < n; i++) {
      const b = blobs[i];
      const t = performance.now() * 0.001;
      const swirlX = prnd(b.id, t, 0.17, 0.23) * 0.20;
      const swirlY = prnd(b.id + 10, t, 0.11, 0.19) * 0.13;
      const sizeBias = clamp(1 - (b.baseR - R_MIN) / (R_MAX - R_MIN), 0, 1);
      const buoyancy = (buoyancyBase * (0.65 + sizeBias * 0.9)) * b.floatDir;
      const sp = (0.1 + level * 0.53) * b.speedFactor;
      b.vx = b.vx * viscosity + (swirlX + Math.sin(t * 0.23 + b.phaseX) * 0.05) * sp;
      b.vy = b.vy * viscosity + (swirlY + Math.cos(t * 0.19 + b.phaseY) * 0.04 + buoyancy) * sp;
      if (mouseActive) {
        const mx = mouseX, my = mouseY;
        const dx = mx - b.x, dy = my - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Здесь делаем силу очень маленькой
        const f = clamp(0.0033 * (1 - dist / 150), 0, 0.007); // супер-медленно!
        b.vx += dx * f * dt;
        b.vy += dy * f * dt;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const left = -R_MAX, right = w + R_MAX;
      const top = -R_MAX, bottom = h + R_MAX;
      if (b.x < left) { b.x = right; }
      if (b.x > right) { b.x = left; }
      if (b.y < top - 10 && b.floatDir < 0) {
        b.y = bottom + rnd(2, 20);
        b.x = rnd(left, right);
        b.baseR = sampleWeightedRadius();
        b.r = b.baseR;
        b.speedFactor = rnd(0.65, 1.35) * (b.baseR < R_MIN + 12 ? 1.35 : b.baseR > R_MAX - 10 ? 0.5 : 1);
      } else if (b.y > bottom + 10 && b.floatDir > 0) {
        b.y = top - rnd(2, 20);
        b.x = rnd(left, right);
        b.baseR = sampleWeightedRadius();
        b.r = b.baseR;
        b.speedFactor = rnd(0.65, 1.35) * (b.baseR < R_MIN + 12 ? 1.35 : b.baseR > R_MAX - 10 ? 0.5 : 1);
      }
      const pulse = 1 + Math.sin(t * 1.3 + b.phaseX) * 0.08;
      b.r = b.baseR * pulse + level * 7.0;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = blobs[i], b = blobs[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minDist = a.r + b.r - 13;
        if (d2 < minDist * minDist) {
          const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
          const overlap = (minDist - d) * 0.11;
          const ma = a.r / (a.r + b.r), mb = 1 - ma;
          a.x -= nx * overlap * mb; a.y -= ny * overlap * mb;
          b.x += nx * overlap * ma; b.y += ny * overlap * ma;
          a.vx *= 0.93; a.vy *= 0.93;
          b.vx *= 0.93; b.vy *= 0.93;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const c = circles[i], b = blobs[i];
      c.setAttribute('cx', b.x.toFixed(2));
      c.setAttribute('cy', b.y.toFixed(2));
      c.setAttribute('r', b.r.toFixed(2));
    }
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const now = t || performance.now();
    const dt = clamp((now - lastT) / 16.6667, 0.5, 2.0);
    lastT = now;
    update(dt);
  }
  function start() {
    init();
    analyser.fftSize = 256;
    lastT = performance.now();
    loop(lastT);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }
  function destroy() {
    stop();
    container.innerHTML = '';
  }
  return { start, stop, destroy };
}
