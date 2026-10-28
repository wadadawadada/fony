// Liquid glass, physically based (WebGL).
//
// One fragment shader draws the whole scene behind the UI: an animated colour
// field with glossy spheres, and on top of it every glass surface of the page
// (panels, list, console, screen, buttons...). The DOM stays transparent and
// only carries the text; element boxes are read every frame and uploaded as
// rounded-rect SDFs.
//
// Each glass surface is a convex slab with a curved bevel along its edge:
//   - height profile h(t) = (1 - (1-t)^4)^(1/4) across the bevel (squircle),
//   - surface normal from the slope of that profile,
//   - the view ray is refracted with Snell's law (IOR 1.5) and travels through
//     the slab, so the scene is sampled at the displaced position,
//   - dispersion: red / green / blue use slightly different displacement,
//   - a specular rim lit from the cursor, a Fresnel edge, a soft drop shadow.
//
// If WebGL is unavailable the CSS glass in css/glass.css stays in charge.

const MAX = 28;
const IOR = 1.5;

// selector, look. bezel > 0 is px; bezel < 0 is a fraction of the shorter half-side.
const SHAPES = [
  ['.left-panel, .right-panel', { bezel: 44, thick: 26, strength: 0.5, frost: 14, tint: 0.05, color: [0.9, 0.95, 1], shadow: 46, spec: 0.35 }],
  ['.playlist-area', { bezel: 34, thick: 36, strength: 0.95, frost: 5, tint: 0.07, color: [0.9, 0.95, 1], shadow: 30, spec: 0.9 }],
  ['.chat-container', { bezel: 30, thick: 32, strength: 0.9, frost: 8, tint: 0.34, color: [0.02, 0.03, 0.14], shadow: 30, spec: 0.8 }],
  ['.screen', { bezel: -0.55, thick: 26, strength: 1.0, frost: 4, tint: 0.3, color: [0.02, 0.03, 0.14], shadow: 22, spec: 1.0 }],
  // round buttons are glass beads: the whole radius is bevel, so they refract like a sphere
  ['.player-btn:not(.play-btn), #addPlaylistBtn', { bezel: -0.8, thick: 40, strength: 1.0, frost: 0, tint: 0.07, color: [0.9, 0.95, 1], shadow: 0, spec: 0.9 }],
  ['.center-circle:not(.has-cover) .play-btn', { bezel: -0.8, thick: 56, strength: 1.05, frost: 0, tint: 0.32, color: [0.0, 0.95, 0.72], shadow: 0, spec: 1.0 }],
  ['.chat-send-btn img', { bezel: -0.7, thick: 26, strength: 1.0, frost: 0, tint: 0.3, color: [0.0, 0.95, 0.72], shadow: 0, spec: 1.1 }],
  ['.genre-select-header, .genre-search', { bezel: -0.6, thick: 22, strength: 1.0, frost: 0, tint: 0.09, color: [0.9, 0.95, 1], shadow: 0, spec: 1.1 }]
];

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
#define MAX ${MAX}
#define IOR ${IOR.toFixed(2)}

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform int uCount;
uniform vec4 uRect[MAX];   // centre x, centre y, half w, half h (px)
uniform vec4 uA[MAX];      // corner radius, bezel, thickness, strength
uniform vec4 uB[MAX];      // frost, tint amount, shadow size, specular
uniform vec3 uC[MAX];      // tint colour
uniform sampler2D uTex;
uniform float uTexMix;
uniform vec2 uTexScale;

float sdBox(vec2 p, vec2 hb, float r) {
  vec2 q = abs(p) - hb + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float blob(vec2 q, vec2 c, float r) {
  float d = length(q - c) / r;
  return exp(-d * d * 1.6);
}

vec3 sphere(vec2 q, vec2 c, float r, vec3 base, vec3 bg) {
  vec2 d = (q - c) / r;
  float l = dot(d, d);
  if (l >= 1.0) return bg;
  vec3 n = vec3(d, sqrt(1.0 - l));
  vec3 L = normalize(vec3(-0.45, -0.6, 0.65));
  float diff = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = base * (0.18 + 1.0 * diff * diff);
  col += pow(max(dot(n, L), 0.0), 26.0) * 0.55;
  col += pow(1.0 - n.z, 3.0) * base * 0.35;
  return mix(bg, col, smoothstep(1.0, 0.45, sqrt(l)));
}

vec3 scene(vec2 px, float vis) {
  vec2 uv = px / uRes;
  float asp = uRes.x / uRes.y;
  vec2 q = vec2(uv.x * asp, uv.y);
  float t = uTime;
  float sc = clamp(asp, 0.45, 1.0);

  vec3 c = mix(vec3(0.035, 0.055, 0.215), vec3(0.075, 0.03, 0.2), clamp(uv.y * 0.7 + uv.x * 0.3, 0.0, 1.0));
  c += vec3(0.0, 0.95, 0.72) * 0.5 * blob(q, vec2(0.15 * asp + 0.10 * sin(t * 0.11), 0.10 + 0.08 * cos(t * 0.13)), 0.55);
  c += vec3(0.48, 0.36, 1.0) * 0.55 * blob(q, vec2(0.95 * asp + 0.12 * sin(t * 0.09 + 1.0), 0.35 + 0.1 * sin(t * 0.07)), 0.62);
  c += vec3(1.0, 0.31, 0.64) * 0.48 * blob(q, vec2(0.45 * asp + 0.14 * cos(t * 0.1), 0.98 + 0.07 * sin(t * 0.12 + 2.0)), 0.5);
  c += vec3(1.0, 0.70, 0.28) * 0.28 * blob(q, vec2(0.80 * asp + 0.1 * sin(t * 0.08 + 4.0), 0.92), 0.36);
  c += vec3(0.2, 0.45, 1.0) * 0.28 * blob(q, vec2(0.55 * asp + 0.2 * sin(t * 0.06), 0.45 + 0.2 * cos(t * 0.05)), 0.7);

  vec3 sph = c;
  sph = sphere(q, vec2(0.05 * asp + 0.03 * sin(t * 0.21), 0.30 + 0.06 * cos(t * 0.17)), 0.075 * sc, vec3(0.20, 0.95, 0.80), sph);
  sph = sphere(q, vec2(0.86 * asp + 0.06 * cos(t * 0.15), 0.78 + 0.05 * sin(t * 0.19)), 0.105 * sc, vec3(1.0, 0.38, 0.72), sph);
  sph = sphere(q, vec2(0.26 * asp + 0.1 * sin(t * 0.13 + 2.0), 0.90 + 0.03 * cos(t * 0.11)), 0.055 * sc, vec3(1.0, 0.78, 0.35), sph);
  sph = mix(c, sph, vis);
  c = mix(sph, c, uTexMix);

  vec3 tex = texture2D(uTex, (uv - 0.5) * uTexScale + 0.5).rgb;
  c = mix(c, tex * 0.92, uTexMix);
  return c;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

  vec2 disp = vec2(0.0);
  float frost = 0.0, cov = 0.0, spec = 0.0, rim = 0.0, edge = 0.0, shadow = 0.0;
  vec4 tint = vec4(0.0);

  for (int i = 0; i < MAX; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec4 a = uA[i];
    vec4 b = uB[i];
    vec2 p = frag - r.xy;

    float d = sdBox(p, r.zw, a.x);
    float ds = sdBox(p - vec2(0.0, b.z * 0.4), r.zw, a.x);
    float c = 1.0 - smoothstep(-1.0, 0.6, d);
    if (b.z > 0.5) shadow += (1.0 - smoothstep(0.0, b.z, ds)) * (1.0 - c);
    if (d > 0.6) continue;

    float depth = max(-d, 0.0);
    float bez = a.y > 0.0 ? a.y : -a.y * min(r.z, r.w);
    float t = clamp(depth / bez, 0.0, 1.0);
    float u1 = 1.0 - t;
    float u4 = u1 * u1 * u1 * u1;
    float rest = max(1.0 - u4, 1e-3);
    float h = pow(rest, 0.25);
    float dh = u1 * u1 * u1 * pow(rest, -0.75);
    float s = min(dh * a.z / bez, 5.0);

    vec2 e = vec2(1.0, 0.0);
    vec2 g = vec2(sdBox(p + e.xy, r.zw, a.x) - sdBox(p - e.xy, r.zw, a.x),
                  sdBox(p + e.yx, r.zw, a.x) - sdBox(p - e.yx, r.zw, a.x));
    vec2 n2 = g / (length(g) + 1e-5);

    vec3 N = normalize(vec3(n2 * s, 1.0));
    vec3 R = refract(vec3(0.0, 0.0, -1.0), N, 1.0 / IOR);
    float H = a.z * (h * 0.7 + 0.3);
    disp += R.xy / max(-R.z, 0.2) * H * a.w * c;

    // a fixed key light from the top-left, nudged by the cursor: lighting straight
    // from the cursor made a perfect ring when it sat over the middle of a button
    vec3 Ld = normalize(vec3(vec2(-0.45, -0.6) + clamp((uMouse - frag) / 900.0, vec2(-0.6), vec2(0.6)), 0.9));
    vec3 Hh = normalize(Ld + vec3(0.0, 0.0, 1.0));
    // highlights stay on the outer part of the bevel, never near the middle of a button
    float bevel = smoothstep(0.0, 0.35, s) * (1.0 - smoothstep(0.3, 0.62, t));
    float sp = pow(max(dot(N, Hh), 0.0), 54.0);
    vec3 Lo = normalize(vec3(-Ld.xy, 0.9));
    float sp2 = pow(max(dot(N, normalize(Lo + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.4;
    spec += (sp + sp2) * bevel * b.w * c;
    rim += pow(1.0 - N.z, 2.0) * c;
    float line = (1.0 - smoothstep(0.0, 1.7, depth)) * c;
    edge += line * (0.25 + 0.75 * max(dot(n2, normalize(Ld.xy + 1e-4)), 0.0));
    frost += b.x * c;
    tint += vec4(uC[i] * b.y, b.y) * c;
    cov = 1.0 - (1.0 - cov) * (1.0 - c);
  }

  vec3 col = vec3(scene(frag + disp * 1.06, cov).r, scene(frag + disp, cov).g, scene(frag + disp * 0.94, cov).b);
  if (frost > 0.5) {
    vec3 acc = col;
    acc += scene(frag + disp + vec2(frost, 0.0), cov);
    acc += scene(frag + disp - vec2(frost, 0.0), cov);
    acc += scene(frag + disp + vec2(0.0, frost), cov);
    acc += scene(frag + disp - vec2(0.0, frost), cov);
    col = acc / 5.0;
  }

  col = mix(col, col * 1.1 + 0.015, cov);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.0 + 0.4 * cov);
  float ta = clamp(tint.a, 0.0, 0.85);
  vec3 tc = tint.a > 0.0 ? tint.rgb / tint.a : vec3(1.0);
  col = mix(col, tc, ta);
  col += rim * vec3(0.7, 0.88, 1.0) * 0.05;
  col += spec * vec3(1.0, 1.0, 1.0);
  col += edge * 0.5;
  col *= 1.0 - clamp(shadow, 0.0, 1.0) * 0.4;
  col += (hash(frag) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

let canvas = null;
let gl = null;
let prog = null;
let loc = {};
let tex = null;
let running = false;
let raf = 0;
let dpr = 1;
let items = [];
let frame = 0;
let texMix = 0;
let texTarget = 0;
let texScale = [1, 1];
let sceneToken = 0;
const mouse = { x: 0, y: 0, tx: 0, ty: 0, moved: false };
const buffers = {
  rect: new Float32Array(MAX * 4),
  a: new Float32Array(MAX * 4),
  b: new Float32Array(MAX * 4),
  c: new Float32Array(MAX * 3)
};
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('glass shader:', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function init() {
  if (gl) return true;
  canvas = document.createElement('canvas');
  canvas.id = 'glassGL';
  canvas.setAttribute('aria-hidden', 'true');
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    gl = null;
  }
  if (!gl) return false;
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { gl = null; return false; }
  prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  for (const n of ['uRes', 'uTime', 'uMouse', 'uCount', 'uRect', 'uA', 'uB', 'uC', 'uTex', 'uTexMix', 'uTexScale']) {
    loc[n] = gl.getUniformLocation(prog, n);
  }
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(loc.uTex, 0);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    gl = null;
    canvas.remove();
    canvas = null;
  });
  document.body.prepend(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    if (!mouse.moved) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; }
  }, { passive: true });
  resize();
  return true;
}

function resize() {
  if (!canvas) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  while (w * h * dpr * dpr > 3.6e6 && dpr > 1) dpr -= 0.25;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function collect() {
  items = [];
  for (const [selector, look] of SHAPES) {
    document.querySelectorAll(selector).forEach((el) => items.push({ el, look, radius: 0 }));
  }
  items = items.slice(0, MAX);
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    const cs = getComputedStyle(it.el).borderTopLeftRadius;
    const v = parseFloat(cs) || 0;
    it.radius = cs.includes('%') ? (v / 100) * Math.min(r.width, r.height) : v;
  }
}

function upload(time) {
  let n = 0;
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const l = it.look;
    const hw = (r.width / 2) * dpr;
    const hh = (r.height / 2) * dpr;
    buffers.rect.set([(r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr, hw, hh], n * 4);
    buffers.a.set([Math.min(it.radius * dpr, hw, hh), l.bezel > 0 ? l.bezel * dpr : l.bezel, l.thick * dpr, l.strength], n * 4);
    buffers.b.set([l.frost * dpr, l.tint, l.shadow * dpr, l.spec], n * 4);
    buffers.c.set(l.color, n * 3);
    n++;
  }
  gl.uniform1i(loc.uCount, n);
  gl.uniform4fv(loc.uRect, buffers.rect);
  gl.uniform4fv(loc.uA, buffers.a);
  gl.uniform4fv(loc.uB, buffers.b);
  gl.uniform3fv(loc.uC, buffers.c);
}

function draw(now) {
  if (!running) return;
  raf = requestAnimationFrame(draw);
  if (document.hidden) return;
  if (frame % 20 === 0 || items.some((it) => !it.el.isConnected)) collect();
  frame++;

  if (!mouse.moved) {
    mouse.tx = innerWidth * 0.2;
    mouse.ty = -innerHeight * 0.25;
    mouse.x = mouse.tx;
    mouse.y = mouse.ty;
  }
  mouse.x += (mouse.tx - mouse.x) * 0.12;
  mouse.y += (mouse.ty - mouse.y) * 0.12;
  texMix += (texTarget - texMix) * 0.06;

  gl.uniform2f(loc.uRes, canvas.width, canvas.height);
  gl.uniform1f(loc.uTime, reduceMotion ? 0 : now / 1000);
  gl.uniform2f(loc.uMouse, mouse.x * dpr, mouse.y * dpr);
  gl.uniform1f(loc.uTexMix, texMix);
  gl.uniform2f(loc.uTexScale, texScale[0], texScale[1]);
  upload();
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  if (!document.body.classList.contains('glass-gl')) document.body.classList.add('glass-gl');
}

function start() {
  if (running) return;
  if (!init()) return;
  running = true;
  canvas.style.display = 'block';
  collect();
  applySceneCss(window.__glassSceneCss || null);
  raf = requestAnimationFrame(draw);
}

function stop() {
  running = false;
  cancelAnimationFrame(raf);
  document.body.classList.remove('glass-gl');
  if (canvas) canvas.style.display = 'none';
}

// Skins and album art arrive as CSS backgrounds; the first url(...) in it is the picture.
function applySceneCss(css) {
  const token = ++sceneToken;
  const m = css && css.match(/url\(\s*(["']?)(.*?)\1\s*\)/s);
  if (!m || !gl) {
    texTarget = 0;
    return;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (token !== sceneToken || !gl) return;
    try {
      const w = 1024;
      const h = Math.max(1, Math.round((w * (img.naturalHeight || 900)) / (img.naturalWidth || 1200)));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      const sa = innerWidth / innerHeight;
      const ia = w / h;
      texScale = sa > ia ? [1, ia / sa] : [sa / ia, 1];
      texTarget = 1;
    } catch {
      texTarget = 0;
    }
  };
  img.onerror = () => { if (token === sceneToken) texTarget = 0; };
  img.src = m[2];
}

function sync() {
  if (document.body.classList.contains('glass')) start();
  else stop();
}

document.addEventListener('themeChanged', sync);
document.addEventListener('glassScene', (e) => {
  window.__glassSceneCss = (e.detail && e.detail.css) || null;
  if (running) applySceneCss(window.__glassSceneCss);
});
window.addEventListener('resize', () => { if (running) applySceneCss(window.__glassSceneCss); });
document.addEventListener('DOMContentLoaded', sync);
