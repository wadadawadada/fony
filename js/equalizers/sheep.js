export default function Sheep({ container, analyser }) {
  const SHEEP_SVG_PATH = "/js/equalizers/img/sheep.svg";
  const CLOUD_SVG_PATH = "/js/equalizers/img/cloud.svg";
  const SHEEP_WIDTH = 87, CONTAINER_HEIGHT = 72;
  let raf = null, freq = new Uint8Array(128);
  let svgRoot, sheepGroup, head, frontL, frontR, rearL, rearR;
  let cloudsGroup, stonesGroup, grassBackGroup, grassFrontGroup;
  let clouds = [], stones = [], grassBack = [], grassFront = [];
  let cloudSVG = null;
  let lastCloudEmit = 0;
  let sheepX = 0, sheepDir = 1;
  let mode = "walk", modeTimer = 0, actionTimer = 0, pauseTimer = 0;
  let nextAction = null;
  let prevLevel = 0;
  // beat / dance state
  let bassAvg = 0.1, bassNow = 0;
  let jumpStart = -1e9, jumpAmp = 8, quietSince = 0;
  // dance moves: jump / squat / head-bang and mixes; the move changes every 4 or 8 beats
  let walkPhase = 0, lastAnimT = 0;
  let headY = 0, headRot = 0;   // smoothed head pose (see animateSheep)
  let danceMove = "jump", pinnedMove = null, beatsLeft = 0, earDance = 0, lastEar = 0, eyesHappyShown = false;
  const MOVES = [["jump", 1.4], ["bang", 1.2], ["squat", 1.0], ["jumpbang", 1.1], ["squatbang", 1.0]];
  let jumpMs = 300;
  // beat tracking: onsets -> tempo estimate -> phase-locked schedule, so the jump apex lands ON the beat
  // Beat tracker: onset strength -> autocorrelation tempo -> comb-filter phase -> jumps scheduled so the apex lands on the beat
  let beatAn = null, beatBuf = null, prevSpec = null, specCfg = null;
  const ENV_BIN = 20, ENV_N = 400;            // onset envelope: 20 ms bins, last 8 s
  const env = new Float32Array(ENV_N);      // overall onset strength (tempo)
  const envL = new Float32Array(ENV_N);     // low band only: kicks sit on the beats (phase)
  let envLast = -1;
  let period = 500, conf = 0, locked = false, anchor = 0, hasAnchor = false;
  let lastTempoAt = 0, lastJumpIdx = -1, lastOnset = -1e9;
  let lastGoodAt = 0, switchTo = 0, switchCount = 0;
  let synthAnchor = 0, jumpSource = "";
  let osAvg = 0, osVar = 0;
  let userOffsetMs = 0, beatFlash = 0;
  try { userOffsetMs = parseInt(localStorage.getItem("sheepBeatOffset") || "0", 10) || 0; } catch (e) {}
  // eye tracking
  let pupilL = null, pupilR = null;
  let pointer = null, lastPointerAt = 0;
  let gazeX = 0, gazeY = 0;
  // petting: mouse moving over her makes her happy (ears wiggle, eyes turn into contented arcs)
  let pet = 0;
  let petForceUntil = 0;       // debug panel: pretend she is being stroked
  let forcedDance = false;     // debug panel: dance without music (synthetic 120 bpm beat)
  let debugPanel = null, debugStatus = null, debugBtns = {}, debugDot = null, debugOffset = null, lastStatusAt = 0;
  let earL = null, earR = null, earLBase = "", earRBase = "";
  let happyL = null, happyR = null, eyeParts = [];
  const PUPIL_REST = [
    { cx: 18.735, cy: 15.35, ex: 18.98, ey: 13.65 }, // left: pupil centre, eye centre
    { cx: 29.441, cy: 15.35, ex: 29.68, ey: 13.65 }  // right
  ];
  function onPointerMove(e) { pointer = { x: e.clientX, y: e.clientY }; lastPointerAt = performance.now(); }
  function onPointerLeave() { pointer = null; }
  let actionDuration = 18;
  const STONES_Y = CONTAINER_HEIGHT - 16; // выше передней травы (ниже = выше визуально)
  const GROUND_Y = CONTAINER_HEIGHT - 16; // линия "земли" по центру камней и овцы
  let lastWidth = null;
  let cloudsInitialized = false;

  function getContainerWidth() {
    return container.clientWidth || SHEEP_WIDTH;
  }
  function updateViewBox() {
    if (!svgRoot) return;
    const width = getContainerWidth();
    svgRoot.setAttribute("viewBox", `0 0 ${width} ${CONTAINER_HEIGHT}`);
    svgRoot.setAttribute("width", width);
    svgRoot.setAttribute("height", CONTAINER_HEIGHT);
  }
  function makeGrass(x, y0, height, angle, strokeW, opacity) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", `M${x},${y0} q${1.5+angle*2},${-height/1.3} ${3+angle*3},0`);
    p.setAttribute("stroke", "#07F2B8");
    p.setAttribute("stroke-width", strokeW.toFixed(2));
    p.setAttribute("fill", "none");
    p.setAttribute("opacity", opacity.toFixed(2));
    return p;
  }
  function makeStone(x, y, rx, ry, sw, op) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    e.setAttribute("cx", x);
    e.setAttribute("cy", y);
    e.setAttribute("rx", rx);
    e.setAttribute("ry", ry);
    e.setAttribute("fill", "none");
    e.setAttribute("stroke", "#07F2B8");
    e.setAttribute("stroke-width", sw.toFixed(2));
    e.setAttribute("opacity", op.toFixed(2));
    return e;
  }
  function ensureBackGrass(count) {
    const width = getContainerWidth();
    const margin = 30;
    if (grassBack.length === 0 && count > 0) {
      let x = -margin;
      const step = (width + 2 * margin) / Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        const y0 = GROUND_Y - 16 + (Math.random() - 0.5) * 4;
        const h = 18 + Math.random() * 16;
        const a = (Math.random() - 0.5) * 1.2;
        const el = makeGrass(x, y0, h, a, 1.0 + Math.random() * 1.5, 0.70 + 0.27 * Math.random());
        grassBackGroup.appendChild(el);
        grassBack.push({ x, y0, el, last: 0 });
        x += step;
      }
    }
  }
  function ensureFrontGrass(count) {
    const width = getContainerWidth();
    const margin = 15;
    if (grassFront.length === 0 && count > 0) {
      let x = -margin;
      const step = (width + 2 * margin) / Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        const y0 = CONTAINER_HEIGHT - 1;
        const h = 19 + Math.random() * 22;
        const a = (Math.random() - 0.5) * 1.2;
        const el = makeGrass(x, y0, h, a, 1.3 + Math.random() * 1, 0.95 + 0.05 * Math.random());
        grassFrontGroup.appendChild(el);
        grassFront.push({ x, y0, el, last: 0 });
        x += step;
      }
    }
  }
  function ensureStones(count) {
    const width = getContainerWidth();
    const margin = 30;
    if (stones.length === 0 && count > 0) {
      let x = -margin;
      const step = (width + 2 * margin) / Math.max(1, count - 1);
      for (let i = 0; i < count; i++) {
        const y = STONES_Y + (Math.random() - 0.2) * 3.5;
        const rx = 2.2 + Math.random() * 3.5;
        const ry = 1.0 + Math.random() * 2.6;
        const el = makeStone(x, y, rx, ry, 0.8 + Math.random() * 1.2, 0.50 + 0.35 * Math.random());
        stonesGroup.appendChild(el);
        stones.push({ x, el });
        x += step;
      }
    }
  }
  function layoutGroundPersistent() {
    const width = getContainerWidth();
    const grassBackN = Math.max(12, Math.floor(width / 10));
    const grassFrontN = Math.max(10, Math.floor(width / 10));
    const stoneN = Math.floor(width / 25);
    ensureStones(stoneN);
    ensureBackGrass(grassBackN);
    ensureFrontGrass(grassFrontN);
  }
  function updateGroundOnResize() {
    const width = getContainerWidth();
    if (lastWidth === width) return;
    layoutGroundPersistent();
    lastWidth = width;
  }
  // ---------- clouds: several silhouettes, stretched/flipped, with depth (small = far = slower, paler) ----------
  const CLOUD_W = 65;
  let cloudShapes = [];
  function buildCloudShapes(fileInner) {
    const st = 'fill="none" stroke="#07F2B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
    cloudShapes = [
      { svg: fileInner, weight: 1.2 }, // the original puffy outline
      { svg: `<path ${st} d="M12 32C2 32 1 20 10 19C9 9 22 4 28 11C32 1 50 2 52 14C62 12 66 28 54 32Z"/>`, weight: 1 }, // lumpy
      { svg: `<path ${st} d="M6 32H56C64 32 64 20 55 20C55 11 43 8 38 15C34 7 20 8 19 18C9 16 0 26 6 32Z"/>`, weight: 1 }, // flat bottom
      { svg: `<path ${st} d="M4 11H44M16 19H60M8 27H34"/>`, weight: 0.8 }, // wispy streaks
      { svg: `<path ${st} d="M14 30C4 30 4 20 13 19C13 11 24 9 29 15C34 10 44 14 43 22C50 22 51 30 44 30Z"/>`, weight: 1 } // small puff
    ];
  }
  function pickCloudShape() {
    const sum = cloudShapes.reduce((a, c) => a + c.weight, 0);
    let r = Math.random() * sum;
    for (const c of cloudShapes) { if (r < c.weight) return c; r -= c.weight; }
    return cloudShapes[0];
  }
  function makeCloud(x) {
    const shape = pickCloudShape();
    const size = 16 + Math.pow(Math.random(), 1.5) * 40;     // mostly small, a few big
    const depth = (size - 16) / 40;                           // 0 = far, 1 = near
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.innerHTML = shape.svg;
    cloudsGroup.appendChild(g);
    return {
      el: g,
      x,
      y: Math.random() * (18 - depth * 8),
      size,
      sx: 0.75 + Math.random() * 0.9,                         // stretch
      sy: 0.7 + Math.random() * 0.55,
      flip: Math.random() < 0.5,
      speed: 0.035 + depth * 0.09 + Math.random() * 0.03,
      base: 0.4 + depth * 0.55,
      seed: Math.random() * 6.28,
      opacity: 1
    };
  }
  function cloudWidth(c) { return CLOUD_W * (c.size / 100) * c.sx; }
  function initClouds() {
    if (cloudsInitialized || !cloudShapes.length) return;
    clouds = [];
    const width = getContainerWidth();
    const count = Math.max(3, Math.floor(width / 170));
    for (let i = 0; i < count; ++i) clouds.push(makeCloud(Math.random() * width * 0.8));
    lastCloudEmit = performance.now();
    cloudsInitialized = true;
  }
  function tryEmitCloud(t) {
    if (!cloudShapes.length || !cloudsGroup) return;
    const minX = clouds.length ? Math.min(...clouds.map(c => c.x)) : 1e9;
    if (t - lastCloudEmit > 2200 + Math.random() * 2600 && minX > 90 + Math.random() * 110) {
      const c = makeCloud(0);
      c.x = -cloudWidth(c) - Math.random() * 16;
      clouds.push(c);
      lastCloudEmit = t;
    }
  }
  function drawClouds(t) {
    if (!cloudsGroup || !cloudShapes.length) return;
    const width = getContainerWidth();
    clouds = clouds.filter(c => {
      if (c.x > width + 60) { c.el.remove(); return false; }
      return true;
    });
    for (const c of clouds) {
      c.x += c.speed;
      const w = cloudWidth(c);
      const fadeStart = width - w * 0.85;
      const fadeEnd = width + w * 0.6;
      c.opacity = c.x > fadeStart ? Math.max(0, 1 - (c.x - fadeStart) / (fadeEnd - fadeStart)) : 1;
      const kx = (c.size / 100) * c.sx;
      const ky = (c.size / 100) * c.sy;
      const bob = Math.sin(t * 0.0006 + c.seed) * 1.2;
      const tx = c.flip ? c.x + w : c.x;
      c.el.setAttribute("transform", `translate(${tx.toFixed(2)},${(c.y + bob).toFixed(2)}) scale(${c.flip ? -kx : kx},${ky})`);
      c.el.setAttribute("opacity", (c.opacity * c.base).toFixed(2));
    }
  }
  function fetchAllSVGs(callback) {
    fetch(CLOUD_SVG_PATH).then(r => r.text()).then(svgText => {
      let cloudSvgContent = svgText.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = `<svg>${cloudSvgContent}</svg>`;
      const svg = tempDiv.querySelector('svg');
      svg.querySelectorAll('path, ellipse, circle, line, polyline, polygon').forEach(el => {
        el.setAttribute('vector-effect', 'non-scaling-stroke');
        const strokeWidth = parseFloat(el.getAttribute('stroke-width')) || 1;
        el.setAttribute('stroke-width', (strokeWidth * 2).toString());
      });
      cloudSVG = svg.innerHTML;
      buildCloudShapes(cloudSVG);
      callback();
    });
  }
  fetch(SHEEP_SVG_PATH)
    .then(r => r.text())
    .then(svgText => {
      fetchAllSVGs(() => {
        container.innerHTML = svgText;
        svgRoot = container.querySelector("svg");
        svgRoot.setAttribute("width", "100%");
        svgRoot.setAttribute("height", CONTAINER_HEIGHT);

        stonesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        stonesGroup.setAttribute("class", "fony-stones");
        svgRoot.insertBefore(stonesGroup, svgRoot.firstChild);

        grassBackGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        grassBackGroup.setAttribute("class", "fony-grass-back");
        svgRoot.insertBefore(grassBackGroup, stonesGroup.nextSibling);

        cloudsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        cloudsGroup.setAttribute("class", "fony-clouds");
        svgRoot.insertBefore(cloudsGroup, grassBackGroup.nextSibling);

        sheepGroup = svgRoot.getElementById("sheep");
        head = svgRoot.getElementById("head");
        frontL = svgRoot.getElementById("front_l");
        frontR = svgRoot.getElementById("front_r");
        rearL = svgRoot.getElementById("rear_r_2");
        rearR = svgRoot.getElementById("rear_r");
        pupilL = svgRoot.querySelector('[id="Rectangle 60"]');
        pupilR = svgRoot.querySelector('[id="Rectangle 62"]');
        earL = svgRoot.querySelector('#ear_l');
        earR = svgRoot.querySelector('#ear_r');
        earLBase = earL ? (earL.getAttribute("transform") || "") : "";
        earRBase = earR ? (earR.getAttribute("transform") || "") : "";
        // everything that makes up the "normal" eyes, so it can fade out while she is happy
        eyeParts = ['[id="Rectangle 59"]', '[id="Rectangle 61"]', '[id="Rectangle 60"]', '[id="Rectangle 62"]', '[id="Line 1"]', '[id="Line 2"]']
          .map(sel => svgRoot.querySelector(sel)).filter(Boolean);
        if (head) {
          const arc = (cx, cy) => {
            const a = document.createElementNS("http://www.w3.org/2000/svg", "path");
            a.setAttribute("d", `M${cx - 3.6},${cy + 1.6} Q${cx},${cy - 4.6} ${cx + 3.6},${cy + 1.6}`);
            a.setAttribute("fill", "none");
            a.setAttribute("stroke", "#07F2B8");
            a.setAttribute("stroke-width", "2.2");
            a.setAttribute("stroke-linecap", "round");
            a.setAttribute("opacity", "0");
            head.appendChild(a);
            return a;
          };
          happyL = arc(18.98, 14.2);
          happyR = arc(29.68, 14.2);
        }

        grassFrontGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        grassFrontGroup.setAttribute("class", "fony-grass-front");
        svgRoot.appendChild(grassFrontGroup);

        updateViewBox();
        svgRoot.style.overflow = "hidden";
        sheepX = centerPos();
        layoutGroundPersistent();
        lastWidth = getContainerWidth();

        function updateSheepTheme() {
          const isLight = !document.body.classList.contains("dark");
          const bodyPath = svgRoot.querySelector('#body path');
          if (bodyPath) bodyPath.setAttribute("fill", isLight ? "#F2F2F2" : "#171D2C");
          const headRect = svgRoot.querySelector('#head rect[id="Rectangle 56"]');
          if (headRect) headRect.setAttribute("fill", "#171D2C");
          const earL = svgRoot.querySelector('#ear_l');
          const earR = svgRoot.querySelector('#ear_r');
          if (earL) earL.setAttribute("fill", "#171D2C");
          if (earR) earR.setAttribute("fill", "#171D2C");
        }
        updateSheepTheme();
        document.addEventListener('themeChanged', updateSheepTheme);

        document.addEventListener("mousemove", onPointerMove);
        document.documentElement.addEventListener("mouseleave", onPointerLeave);
        start();
        createDebugPanel();
        window.addEventListener("resize", handleResize);
        initClouds();
      });
    });
  function handleResize() {
    updateViewBox();
    updateGroundOnResize();
    const minX = 8, maxX = getContainerWidth() - SHEEP_WIDTH - 8;
    sheepX = Math.max(minX, Math.min(sheepX, maxX));
  }
  function smoothLevel(newLevel) {
    prevLevel += (newLevel - prevLevel) * 0.2;
    return prevLevel;
  }
  function getLevel() {
    analyser.getByteFrequencyData(freq);
    let s = 0;
    for (let i = 0; i < freq.length; i++) s += freq[i];
    const avg = (s / Math.max(1, freq.length)) / 255;
    return smoothLevel(avg);
  }
  function centerPos() {
    return (getContainerWidth() - SHEEP_WIDTH) / 2;
  }
  function pickMove() {
    if (pinnedMove) { danceMove = pinnedMove; beatsLeft = 1e9; return; }
    const pool = MOVES.filter(m => m[0] !== danceMove);
    let r = Math.random() * pool.reduce((a, m) => a + m[1], 0);
    for (const m of pool) { if (r < m[1]) { danceMove = m[0]; break; } r -= m[1]; }
    beatsLeft = Math.random() < 0.5 ? 4 : 8;
  }
  function beatPhase(t) {
    if (!(locked && hasAnchor)) return null;
    const x = (t - anchor - latencyMs()) / period;
    return x - Math.floor(x);   // 0 = on the beat
  }
  function startJump(t) {
    if (--beatsLeft <= 0) pickMove();
    jumpStart = t;
    jumpAmp = 5 + Math.min(1, bassNow * 1.4) * 6;
    beatFlash = 1;
  }
  function setupBeatAnalyser() {
    const ctx = analyser.context;
    try {
      const src = window.audioSource;
      if (ctx && src && ctx.createAnalyser) {
        beatAn = ctx.createAnalyser();
        beatAn.fftSize = 2048;               // ~23 Hz bins: the kick gets its own bins
        beatAn.smoothingTimeConstant = 0;    // raw frames, no smearing of the attacks
        src.connect(beatAn);
        beatBuf = new Uint8Array(beatAn.frequencyBinCount);
      }
    } catch (e) { beatAn = null; }
    const sr = (ctx && ctx.sampleRate) || 48000;
    const binHz = sr / (beatAn ? beatAn.fftSize : 128);
    const lowLo = Math.max(0, Math.round(40 / binHz));
    const lowHi = Math.max(lowLo + 1, Math.round(180 / binHz));
    const midLo = Math.max(lowHi, Math.round(200 / binHz));
    const midHi = Math.max(midLo + 1, Math.round(6000 / binHz));
    specCfg = { lowLo, lowHi, midLo, midHi };
  }
  function latencyMs() {
    // the analyser sees the audio before it reaches the speakers: delay the visual by the output latency
    const ctx = analyser.context;
    const out = ctx && ctx.outputLatency ? ctx.outputLatency * 1000 : 0;
    return Math.min(250, out) + userOffsetMs;
  }
  function onsetStrength() {
    let spec = freq;
    if (beatAn) { beatAn.getByteFrequencyData(beatBuf); spec = beatBuf; }
    if (!prevSpec || prevSpec.length !== spec.length) prevSpec = new Uint8Array(spec.length);
    const c = specCfg;
    let lo = 0, mid = 0;
    for (let i = c.lowLo; i < c.lowHi; i++) lo += Math.max(0, spec[i] - prevSpec[i]);
    for (let i = c.midLo; i < c.midHi; i++) mid += Math.max(0, spec[i] - prevSpec[i]);
    for (let i = c.lowLo; i < c.midHi; i++) prevSpec[i] = spec[i];
    lo /= 255 * (c.lowHi - c.lowLo);
    mid /= 255 * (c.midHi - c.midLo);
    return { total: lo * 1.5 + mid, low: lo };
  }
  function pushEnv(t, total, low) {
    const bi = Math.floor(t / ENV_BIN);
    if (envLast < 0 || bi - envLast >= ENV_N) { env.fill(0); envL.fill(0); envLast = bi; }
    else if (bi > envLast) {
      for (let b = envLast + 1; b <= bi; b++) { env[b % ENV_N] = 0; envL[b % ENV_N] = 0; }
      envLast = bi;
    }
    env[bi % ENV_N] = Math.max(env[bi % ENV_N], total);
    envL[bi % ENV_N] = Math.max(envL[bi % ENV_N], low);
  }
  function envAt(bi, arr) {
    return (bi <= envLast && bi > envLast - ENV_N) ? (arr || env)[((bi % ENV_N) + ENV_N) % ENV_N] : 0;
  }
  function analyseTempo(t) {
    const N = 300;                           // last 6 s
    const x = new Float32Array(N);
    let mean = 0;
    for (let i = 0; i < N; i++) { x[i] = envAt(envLast - N + 1 + i); mean += x[i]; }
    mean /= N;
    let e0 = 0;
    for (let i = 0; i < N; i++) { x[i] -= mean; e0 += x[i] * x[i]; }
    if (e0 < 1e-5) { conf = 0; locked = false; return; }
    const minLag = 14, maxLag = 38;          // 300..760 ms  (~80..200 bpm)
    const maxAll = Math.min(N - 40, maxLag * 4 + 1);
    const r = new Float32Array(maxAll + 2);
    for (let lag = minLag - 1; lag <= maxAll; lag++) {
      let sum = 0;
      for (let i = lag; i < N; i++) sum += x[i] * x[i - lag];
      r[lag] = (sum / e0) * (N / (N - lag));
    }
    // a real beat period also repeats at 2x, 3x and 4x: sum those, so syncopated patterns do not fool us
    let best = -1, bestScore = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = 60000 / (lag * ENV_BIN);
      const prior = 0.65 + 0.35 * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.55, 2));
      let sc = r[lag];
      if (lag * 2 <= maxAll) sc += 0.6 * r[lag * 2];
      if (lag * 3 <= maxAll) sc += 0.4 * r[lag * 3];
      if (lag * 4 <= maxAll) sc += 0.4 * r[lag * 4];
      sc *= prior;
      if (sc > bestScore) { bestScore = sc; best = lag; }
    }
    if (best < 0) { conf *= 0.7; if (conf < 0.14) locked = false; return; }
    // refine to the nearest real peak of r around the winner, with a parabola for sub-bin accuracy
    let pk = best;
    for (const d of [-1, 1]) if (r[best + d] > r[pk] && best + d >= minLag && best + d <= maxLag) pk = best + d;
    const denom = r[pk - 1] - 2 * r[pk] + r[pk + 1];
    const frac = denom < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (r[pk - 1] - r[pk + 1]) / denom)) : 0;
    const newPeriod = (pk + frac) * ENV_BIN;
    // confidence: the beat period itself and its multiples (a bar) agree
    let hsum = r[pk], hw = 1;
    if (pk * 2 <= maxAll) { hsum += 0.6 * r[pk * 2]; hw += 0.6; }
    if (pk * 3 <= maxAll) { hsum += 0.4 * r[pk * 3]; hw += 0.4; }
    if (pk * 4 <= maxAll) { hsum += 0.4 * r[pk * 4]; hw += 0.4; }
    conf = Math.max(r[pk], hsum / hw);
    if (conf > 0.2) lastGoodAt = t;
    if (!locked) {
      if (conf > 0.2) { locked = true; period = newPeriod; hasAnchor = false; switchCount = 0; }
      else return;
    } else {
      // keep the groove through weak passages; give up only after ~3 s without a convincing tempo
      if (conf < 0.12) {
        if (t - lastGoodAt > 3000) locked = false;
        return;
      }
      if (Math.abs(newPeriod / period - 1) < 0.08) {
        period += (newPeriod - period) * 0.35;
        switchCount = 0;
      } else {
        // a different tempo has to persist for ~2 s before we follow it (stops flipping between 2:3 / half-time readings)
        if (switchTo && Math.abs(newPeriod / switchTo - 1) < 0.06) switchCount++;
        else { switchTo = newPeriod; switchCount = 1; }
        const ratio = newPeriod / period;
        const poly = (ratio > 1.38 && ratio < 1.62) || (ratio > 0.62 && ratio < 0.73);  // 3:2 readings are usually a pattern, not a new tempo
        const need = poly ? 10 : 5;
        if (switchCount >= need && conf > (poly ? 0.5 : 0.3)) { period = newPeriod; hasAnchor = false; switchCount = 0; }
      }
    }

    // phase: the beat grid that collects the most onset energy; kicks count extra (they sit on the beat)
    const K = Math.max(3, Math.floor(4000 / period));
    const score = phi => {
      let sum = 0;
      for (let k = 0; k < K; k++) {
        const b = (t - phi - k * period) / ENV_BIN;
        const b0 = Math.floor(b), f = b - b0;
        sum += (envAt(b0) + 0.5 * envAt(b0, envL)) * (1 - f) + (envAt(b0 + 1) + 0.5 * envAt(b0 + 1, envL)) * f;
      }
      return sum;
    };
    let bestPhi = 0, bestS = -1;
    for (let phi = 0; phi < period; phi += 10) {
      const sc = score(phi);
      if (sc > bestS) { bestS = sc; bestPhi = phi; }
    }
    const cand = t - bestPhi;
    if (!hasAnchor) { anchor = cand; hasAnchor = true; return; }
    let d = ((cand - anchor) % period + period) % period;
    if (d > period / 2) d -= period;
    if (Math.abs(d) < 0.18 * period) {
      anchor += d * 0.15;                      // small drift: nudge
    } else {
      // far away: only switch when the new grid is clearly better than the current one (no half-beat flipping)
      let cur = ((t - anchor) % period + period) % period;
      if (bestS > 1.3 * score(cur)) anchor = cand;
    }
  }
  function detectBeat(t) {
    bassNow = Math.max(freq[0], freq[1], freq[2], freq[3]) / 255;
    bassAvg += (bassNow - bassAvg) * 0.05;
    const o = onsetStrength();
    const os = o.total;
    pushEnv(t, o.total, o.low);
    const dev = os - osAvg;
    osAvg += dev * 0.05;
    osVar += (dev * dev - osVar) * 0.05;
    const onset = os > osAvg + 1.5 * Math.sqrt(osVar) + 0.01 && bassNow > 0.15 && t - lastOnset > 230;
    if (onset) lastOnset = t;

    // the tempo tracker always runs, so a move started from the panel follows the real track too
    if (t - lastTempoAt > 400) {
      lastTempoAt = t;
      analyseTempo(t);
    }

    if (mode !== "dance") { lastJumpIdx = -1; synthAnchor = 0; jumpSource = ""; return; }

    // pick the beat source: the real tempo of the music, else (panel preview only) a steady 120 bpm, else react to hits
    let src = "";
    if (locked && hasAnchor) src = "music";
    else if (forcedDance) src = "synthetic";
    else if (onset) src = "onset";
    if (src !== jumpSource && src !== "onset") { lastJumpIdx = -1; jumpSource = src; }

    if (src === "music" || src === "synthetic") {
      const per = src === "music" ? period : 500;
      if (src === "synthetic" && !synthAnchor) synthAnchor = t;
      const anc = src === "music" ? anchor : synthAnchor;
      const lat = src === "music" ? latencyMs() : 0;
      const every = per < 330 ? 2 : 1;       // very fast tempo: hop on every second beat
      const P = per * every;
      jumpMs = Math.max(220, Math.min(380, P * 0.55));
      // start half a jump early so the apex lands on the beat
      const n = Math.ceil((t + jumpMs / 2 - anc - lat) / P);
      if (n !== lastJumpIdx) { lastJumpIdx = n; startJump(t); }
    } else if (src === "onset") {
      jumpMs = 300;
      startJump(t); // no stable tempo: react to each hit
    }
  }
  function pickNextAction() {
    // she only feels like dancing when there is music to dance to
    const musicOn = prevLevel > 0.04;
    const choices = [
      { mode: "nod", weight: 1.1 },
      { mode: "graze", weight: musicOn ? 0.6 : 1.1 },
      { mode: "dance", weight: musicOn ? 2.4 : 0 }
    ];
    let sum = choices.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * sum;
    for (let c of choices) { if (r < c.weight) return c.mode; r -= c.weight; }
    return "nod";
  }
  // While she grazes, the blades of the LOWER grass layer around her mouth sway and shiver, then settle again.
  let grazeIntensity = 0;
  function swayGrass(t) {
    const target = (mode === "graze") ? 1 : 0;
    grazeIntensity += (target - grazeIntensity) * 0.07;
    if (grazeIntensity < 0.01) {
      if (grazeIntensity === 0) return;
      grazeIntensity = 0; // final pass below resets every blade
    }
    // the mouth is at the front of the head: local x ~ 14; mirrored when she faces right
    const mouthX = sheepDir === 1 ? sheepX + SHEEP_WIDTH - 14 : sheepX + 14;
    const apply = list => {
      for (const b of list) {
        const dx = b.x - mouthX;
        const f = Math.exp(-(dx * dx) / (2 * 30 * 30));
        const ang = f * grazeIntensity * (Math.sin(t * 0.012 + b.x * 0.45) * 22 + Math.sin(t * 0.005 + b.x) * 8);
        if (Math.abs(ang) < 0.05) {
          if (b.last !== 0) { b.el.removeAttribute("transform"); b.last = 0; }
        } else {
          b.el.setAttribute("transform", `rotate(${ang.toFixed(1)},${b.x},${b.y0})`);
          b.last = ang;
        }
      }
    };
    apply(grassFront); // only the lower layer moves while she eats
  }
  function animateSheep(level, t) {
    updateGroundOnResize();
    if (mode === "walk") {
      const speed = (0.06 + 0.04 * level) * (1 - Math.min(1, pet * 1.6));
      sheepX += sheepDir * speed;
      const width = getContainerWidth();
      const leftBound = 8;
      const rightBound = width - SHEEP_WIDTH - 8;
      if (sheepX < leftBound) { sheepX = leftBound; sheepDir = 1; }
      if (sheepX > rightBound) { sheepX = rightBound; sheepDir = -1; }
      modeTimer += 1 / 60;
      if (modeTimer > 5 + Math.random() * 3) { mode = "pause"; pauseTimer = 0; nextAction = pickNextAction(); modeTimer = 0; }
    } else if (mode === "pause") {
      pauseTimer += 1 / 60;
      if (pauseTimer > 1.3 + Math.random() * 2.0) {
        mode = nextAction; actionTimer = 0;
        if (mode === "walk") modeTimer = 0;
        if (nextAction === "nod") actionDuration = 8 + Math.random() * 4;
        else if (nextAction === "graze") actionDuration = 12 + Math.random() * 6;
        else if (nextAction === "dance") { actionDuration = 20 + Math.random() * 15; quietSince = 0; pinnedMove = null; beatsLeft = 0; }
        else actionDuration = 7 + Math.random() * 5;
      }
    } else if (mode === "nod" || mode === "graze" || mode === "dance") {
      actionTimer += 1 / 60;
      if (mode === "dance") {
        // music stopped: stop dancing a little later
        quietSince = (level < 0.02 && !forcedDance) ? quietSince + 1 / 60 : 0;
        if (quietSince > 2) actionTimer = 1e9;
      }
      if (actionTimer > (typeof actionDuration === "number" ? actionDuration : 10)) { mode = "walk"; modeTimer = 0; forcedDance = false; }
    }
    tryEmitCloud(t);
    drawClouds(t);
    swayGrass(t);
    detectBeat(t);
    let yOffset = 8;
    let jumpH = 0, squatS = 1, bangArch = 0;
    if (mode === "dance") {
      const p = (t - jumpStart) / jumpMs;
      const arch = (p >= 0 && p < 1) ? Math.sin(Math.PI * p) : 0;
      if (danceMove.indexOf("jump") >= 0) jumpH = jumpAmp * arch;
      if (danceMove.indexOf("squat") >= 0) squatS = 1 - 0.26 * arch;   // legs shorten, body sinks, feet stay planted
      if (danceMove.indexOf("bang") >= 0) bangArch = arch;
      yOffset = 8 - jumpH + (1 - squatS) * 27;
      earDance = (bangArch + (jumpH / Math.max(1, jumpAmp)) * 0.6 + (1 - squatS) * 2) * 18;
    } else {
      earDance = 0;
    }
    const transform = (sheepDir === 1)
      ? `translate(${sheepX + SHEEP_WIDTH},${yOffset}) scale(-1,1)`
      : `translate(${sheepX},${yOffset})`;
    sheepGroup.setAttribute("transform", transform);
    if (head) {
      const ph = beatPhase(t);
      // 1) what the head WANTS to do in the current mode: a vertical offset and a tilt
      let wantY = 0, wantRot = 0;
      if (mode === "nod") {
        // with a stable tempo the head dips ON the beat and eases back up; otherwise the old free-running nod
        const amp = 3 * level + 3;
        wantY = ph === null ? Math.sin(t * 0.0037) * amp : (Math.exp(-ph * 4) * 2 - 0.4) * (amp + 2);
      } else if (mode === "graze") {
        wantY = 18 + Math.sin(t * 0.007) * 2.8;      // down to the grass, chewing
        wantRot = -14;
      } else if (mode === "dance") {
        // head dips on landing / lifts in the air; a head-bang swings it down and forward on the beat
        wantY = 3 - jumpH * 0.35 + bangArch * 6;
        wantRot = -bangArch * 15;
      } else if (mode === "pause") {
        wantY = 3;
      } else {
        // walking: a soft bob, not a jerk. With a known tempo it is one smooth wave per beat (lowest point on the beat);
        // otherwise a slow free wave. The loudness only changes the depth a little, never the speed.
        const depth = 1.4 + 2.6 * Math.min(1, level * 1.5);
        const wave = ph === null ? 0.5 + 0.5 * Math.sin(t * 0.0032) : 0.5 + 0.5 * Math.cos(2 * Math.PI * ph);
        wantY = wave * depth;
      }
      // 2) the head never snaps there: it eases towards the target. Changing mode (walk -> graze, pause -> nod ...)
      //    or a sharp beat therefore becomes a quick glide instead of a jerk. Dancing stays tight so it keeps the beat.
      const dtH = lastAnimT ? Math.min(48, t - lastAnimT) : 16;
      const tau = mode === "dance" ? 45 : mode === "nod" ? 70 : 130;
      const k = 1 - Math.exp(-dtH / tau);
      headY += (wantY - headY) * k;
      headRot += (wantRot - headRot) * k;
      head.setAttribute("transform", `translate(0,${headY.toFixed(2)}) rotate(${headRot.toFixed(2)},40,22)`);
    }
    const dtA = lastAnimT ? Math.min(48, t - lastAnimT) : 16;
    lastAnimT = t;
    const bph = beatPhase(t);
    let walkAmp = level;
    if (bph === null) {
      walkPhase += dtA * 0.009;                       // free-running cadence
    } else {
      // one full stride (left+right) per two beats; the phase is pulled gently onto the beat so it never jerks
      const target = 2 * Math.PI * ((t - anchor - latencyMs()) / (2 * period));
      let err = ((target - walkPhase) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      if (err > Math.PI) err -= 2 * Math.PI;
      walkPhase += dtA * (2 * Math.PI) / (2 * period) + err * 0.06;
      walkAmp = 0.45 + 0.5 * level;                   // a clear stride even when the track is quiet
    }
    const step = walkPhase;
    const legsAnim = (mode === "walk");
    if (frontL) frontL.setAttribute("transform", legsAnim ? `rotate(${Math.sin(step)*11*walkAmp},40.8,30)` : "");
    if (frontR) frontR.setAttribute("transform", legsAnim ? `rotate(${-Math.sin(step)*11*walkAmp},34.9,29.6)` : "");
    if (rearL)  rearL.setAttribute("transform", legsAnim ? `rotate(${Math.sin(step+1.2)*9*walkAmp},70.2,30)` : "");
    if (rearR)  rearR.setAttribute("transform", legsAnim ? `rotate(${-Math.sin(step+1.2)*9*walkAmp},64.4,29.6)` : "");
    if (mode === "dance" && squatS < 1) {
      // squat: legs squash vertically about their tops while the body sinks
      const sq = `translate(0,29) scale(1,${squatS.toFixed(3)}) translate(0,-29)`;
      if (frontL) frontL.setAttribute("transform", sq);
      if (frontR) frontR.setAttribute("transform", sq);
      if (rearL)  rearL.setAttribute("transform", sq);
      if (rearR)  rearR.setAttribute("transform", sq);
    }
    if (mode === "dance" && jumpH > 0) {
      // legs tuck up while she is in the air
      const a = Math.min(1, jumpH / Math.max(1, jumpAmp)) * 16;
      if (frontL) frontL.setAttribute("transform", `rotate(${a},40.8,30)`);
      if (frontR) frontR.setAttribute("transform", `rotate(${-a},34.9,29.6)`);
      if (rearL)  rearL.setAttribute("transform", `rotate(${a * 0.8},70.2,30)`);
      if (rearR)  rearR.setAttribute("transform", `rotate(${-a * 0.8},64.4,29.6)`);
    }
    updatePet(t);
    updateEyes(t);
  }
  function updatePet(t) {
    // stroking = the pointer is over her AND keeps moving
    let target = t < petForceUntil ? 1 : 0;
    if (!target && pointer && sheepGroup && t - lastPointerAt < 220) {
      const r = sheepGroup.getBoundingClientRect();
      if (pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom) target = 1;
    }
    pet += (target - pet) * (target > pet ? 0.14 : 0.035);
    if (pet < 0.01) pet = 0;
    // ears: flap when stroked, flop on the beat when dancing
    const petFlap = pet > 0 ? Math.sin(t * 0.028) * 15 * pet : 0;
    const a = petFlap + earDance;
    if (Math.abs(a) < 0.05) {
      if (lastEar !== 0) {
        if (earR) earR.setAttribute("transform", earRBase);
        if (earL) earL.setAttribute("transform", earLBase);
        lastEar = 0;
      }
    } else {
      if (earR) earR.setAttribute("transform", `rotate(${(-a).toFixed(2)},16.45,3.56) ${earRBase}`);
      if (earL) earL.setAttribute("transform", `rotate(${a.toFixed(2)},34.45,3.56) ${earLBase}`);
      lastEar = a;
    }
    if (pet === 0) {
      if (eyesHappyShown) {
        eyeParts.forEach(el => el.setAttribute("opacity", "1"));
        if (happyL) happyL.setAttribute("opacity", "0");
        if (happyR) happyR.setAttribute("opacity", "0");
        eyesHappyShown = false;
      }
      return;
    }
    // eyes: normal eyes fade out, contented ^ ^ arcs fade in
    const happy = Math.max(0, Math.min(1, (pet - 0.25) / 0.45));
    eyeParts.forEach(el => el.setAttribute("opacity", (1 - happy).toFixed(2)));
    if (happyL) happyL.setAttribute("opacity", happy.toFixed(2));
    if (happyR) happyR.setAttribute("opacity", happy.toFixed(2));
    eyesHappyShown = true;
  }
  function updateEyes(t) {
    if (!head || !pupilL || !pupilR) return;
    let tx = 0, ty = 0;
    if (pointer) {
      const r = head.getBoundingClientRect();
      const ox = r.left + r.width / 2;
      const oy = r.top + r.height * 0.4;
      const dx = pointer.x - ox;
      const dy = pointer.y - oy;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const strength = Math.min(1, dist / 90);
        // the sheep group is mirrored when she walks right, so flip the horizontal offset back
        tx = (dx / dist) * strength * (sheepDir === 1 ? -1 : 1);
        ty = (dy / dist) * strength;
      }
    }
    gazeX += (tx - gazeX) * 0.18;
    gazeY += (ty - gazeY) * 0.18;
    [pupilL, pupilR].forEach((el, i) => {
      const c = PUPIL_REST[i];
      let ox = gazeX * 2.0;
      let oy = gazeY * 1.6;
      // keep the pupil inside the round eye
      let px = c.cx + ox - c.ex;
      let py = c.cy + oy - c.ey;
      const d = Math.hypot(px, py);
      const maxD = 3.0;
      if (d > maxD) { px *= maxD / d; py *= maxD / d; }
      ox = c.ex + px - c.cx;
      oy = c.ey + py - c.cy;
      el.setAttribute("transform", `translate(${ox.toFixed(2)},${oy.toFixed(2)})`);
    });
  }
  // ---------- manual control (debug panel) ----------
  function forceMode(name) {
    const t = performance.now();
    actionTimer = 0;
    quietSince = 0;
    forcedDance = false;
    if (name === "walk") { mode = "walk"; modeTimer = 0; }
    else if (name === "pause") { mode = "pause"; pauseTimer = 0; nextAction = "walk"; }
    else if (name === "nod") { mode = "nod"; actionDuration = 6; }
    else if (name === "graze") { mode = "graze"; actionDuration = 8; }
    else if (name === "dance" || name.indexOf("dance:") === 0) {
      mode = "dance"; actionDuration = 25; forcedDance = true; jumpStart = -1e9; lastJumpIdx = -1; synthAnchor = 0; jumpSource = "";
      pinnedMove = name === "dance" ? null : name.slice(6);
      beatsLeft = 0;
    }
    else if (name === "pet") { petForceUntil = t + 3500; }
    else if (name === "flip") { sheepDir = -sheepDir; }
    else if (name === "cloud") { if (cloudShapes.length && cloudsGroup) { const c = makeCloud(0); c.x = -cloudWidth(c); clouds.push(c); } }
  }
  function debugEnabled() {
    try {
      const q = new URLSearchParams(location.search).get("sheepdebug");
      if (q === "1") localStorage.setItem("sheepDebug", "1");
      if (q === "0") localStorage.setItem("sheepDebug", "0");
      // hidden by default; ?sheepdebug=1 shows the panel (remembered), ?sheepdebug=0 or the x button hides it again
      return localStorage.getItem("sheepDebug") === "1";
    } catch (e) { return false; }
  }
  function createDebugPanel() {
    if (debugPanel || !debugEnabled()) return;
    debugPanel = document.createElement("div");
    debugPanel.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:99999;display:flex;flex-wrap:wrap;gap:4px;max-width:340px;padding:6px 8px;background:rgba(23,28,43,.94);border:1px solid #07F2B8;border-radius:10px;font:11px/1.2 sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.45)";
    const title = document.createElement("div");
    title.style.cssText = "flex:1 0 100%;display:flex;align-items:center;opacity:.85";
    title.innerHTML = "<span>Sheep controls</span>";
    debugStatus = document.createElement("span");
    debugStatus.style.color = "#07F2B8";
    debugStatus.style.marginLeft = "auto";
    debugStatus.style.marginRight = "8px";
    debugDot = document.createElement("span");
    debugDot.style.cssText = "display:inline-block;width:9px;height:9px;border-radius:50%;background:#07F2B8;margin-right:8px;opacity:.15";
    debugDot.title = "flashes on every jump";
    title.appendChild(debugStatus);
    title.appendChild(debugDot);
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Hide (bring back with ?sheepdebug=1)";
    close.style.cssText = "background:none;border:none;color:#fff;cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:0 2px;opacity:.7";
    close.addEventListener("click", e => {
      e.stopPropagation();
      try { localStorage.setItem("sheepDebug", "0"); } catch (err) {}
      if (debugPanel) { debugPanel.remove(); debugPanel = null; }
    });
    title.appendChild(close);
    debugPanel.appendChild(title);
    [["walk", "Walk"], ["pause", "Stand"], ["nod", "Nod"], ["graze", "Graze"], ["dance", "Dance"],
     ["dance:jump", "Jump"], ["dance:squat", "Squat"], ["dance:bang", "Head"], ["dance:jumpbang", "Jump+Head"], ["dance:squatbang", "Squat+Head"],
     ["pet", "Pet"], ["flip", "Flip"], ["cloud", "Cloud"]].forEach(([key, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "background:transparent;color:#fff;border:1px solid rgba(7,242,184,.6);border-radius:7px;padding:3px 8px;cursor:pointer;font:inherit";
      b.addEventListener("click", e => { e.stopPropagation(); forceMode(key); });
      debugPanel.appendChild(b);
      debugBtns[key] = b;
    });
    // beat offset: shift the jumps earlier/later to match your speakers or headphones
    const row = document.createElement("div");
    row.style.cssText = "flex:1 0 100%;display:flex;align-items:center;gap:6px;opacity:.9";
    const lab = document.createElement("span");
    lab.textContent = "Beat offset";
    debugOffset = document.createElement("span");
    debugOffset.style.cssText = "min-width:48px;text-align:center;color:#07F2B8";
    const nudge = (label, delta) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = "background:transparent;color:#fff;border:1px solid rgba(7,242,184,.6);border-radius:7px;padding:2px 7px;cursor:pointer;font:inherit";
      b.addEventListener("click", e => {
        e.stopPropagation();
        userOffsetMs = Math.max(-300, Math.min(300, userOffsetMs + delta));
        try { localStorage.setItem("sheepBeatOffset", String(userOffsetMs)); } catch (err) {}
      });
      return b;
    };
    row.append(lab, nudge("-20", -20), debugOffset, nudge("+20", 20));
    debugPanel.appendChild(row);
    document.body.appendChild(debugPanel);
  }
  function updateDebugPanel(t) {
    if (debugDot) { beatFlash *= 0.86; debugDot.style.opacity = (0.15 + 0.85 * beatFlash).toFixed(2); }
    if (!debugPanel || t - lastStatusAt < 150) return;
    lastStatusAt = t;
    debugStatus.textContent = (pet > 0.2 ? "pet · " : "") + mode + (mode === "dance" ? ":" + danceMove : "") + (locked ? ` · ${Math.round(60000 / period)}bpm ${conf.toFixed(2)}` : " · no tempo") + (mode === "dance" && jumpSource === "synthetic" ? " · metronome 120" : "");
    if (debugOffset) debugOffset.textContent = (userOffsetMs > 0 ? "+" : "") + userOffsetMs + " ms";
    Object.keys(debugBtns).forEach(k => {
      const on = k === mode || (k === "pet" && pet > 0.2) || (mode === "dance" && k === "dance:" + danceMove && pinnedMove);
      debugBtns[k].style.background = on ? "rgba(7,242,184,.25)" : "transparent";
    });
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    const level = getLevel();
    const t = performance.now();
    animateSheep(level, t);
    updateDebugPanel(t);
  }
  function start() {
    analyser.fftSize = 128;
    setupBeatAnalyser();
    mode = "walk";
    modeTimer = 0;
    prevLevel = 0;
    loop();
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }
  function destroy() {
    stop();
    if (container) container.innerHTML = '';
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("mousemove", onPointerMove);
    document.documentElement.removeEventListener("mouseleave", onPointerLeave);
    if (debugPanel) { debugPanel.remove(); debugPanel = null; }
    if (beatAn) { try { window.audioSource.disconnect(beatAn); } catch (e) {} beatAn = null; }
  }
  return { start, stop, destroy };
}
