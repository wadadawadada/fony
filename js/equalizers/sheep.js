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
  let prevBass = 0;
  let beatPulse = 0;
  let beatCooldown = 0;
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
        grassBack.push({ x, el });
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
        grassFront.push({ x, el });
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
  function initClouds() {
    if (cloudsInitialized) return;
    clouds = [];
    const width = getContainerWidth();
    const count = Math.max(2, Math.floor(width / 230));
    for (let i = 0; i < count; ++i) {
      const size = 18 + Math.random() * 32;
      clouds.push({
        x: Math.random() * width * 0.7,
        y: Math.random() * 12,
        size,
        speed: 0.07 + Math.random() * 0.06,
        opacity: 1
      });
    }
    lastCloudEmit = performance.now();
    cloudsInitialized = true;
  }
  function tryEmitCloud(t) {
    const minDistance = 180;
    if (!clouds.length || clouds[0].x > minDistance) { emitCloud(); lastCloudEmit = t; return; }
    if (t - lastCloudEmit > 3500 + Math.random() * 1800) {
      if (clouds.length === 0 || clouds[0].x > minDistance) { emitCloud(); lastCloudEmit = t; }
    }
  }
  function emitCloud() {
    const size = 18 + Math.random() * 32;
    clouds.unshift({
      x: -size - Math.random() * 16,
      y: Math.random() * 12,
      size,
      speed: 0.07 + Math.random() * 0.06,
      opacity: 1
    });
  }
  function drawClouds() {
    if (!cloudsGroup || !cloudSVG) return;
    const width = getContainerWidth();
    for (let cloud of clouds) {
      cloud.x += cloud.speed;
      const fadeStart = width - cloud.size * 0.85;
      const fadeEnd = width + cloud.size * 0.6;
      cloud.opacity = cloud.x > fadeStart ? Math.max(0, 1 - (cloud.x - fadeStart) / (fadeEnd - fadeStart)) : 1;
    }
    while (clouds.length && clouds[clouds.length - 1].x > width + 60) clouds.pop();
    cloudsGroup.replaceChildren(...clouds.map(c => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${c.x},${c.y}) scale(${c.size / 100})`);
      g.setAttribute("opacity", c.opacity.toFixed(2));
      g.innerHTML = cloudSVG;
      return g;
    }));
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

        start();
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
  function smoothBass(newBass) {
    prevBass += (newBass - prevBass) * 0.35;
    return prevBass;
  }
  function getAudioMetrics() {
    analyser.getByteFrequencyData(freq);
    let sum = 0;
    let bassSum = 0;
    const bassBins = Math.max(4, Math.floor(freq.length * 0.16));
    for (let i = 0; i < freq.length; i++) {
      sum += freq[i];
      if (i < bassBins) bassSum += freq[i];
    }
    const level = smoothLevel((sum / Math.max(1, freq.length)) / 255);
    const rawBass = (bassSum / Math.max(1, bassBins)) / 255;
    const transient = Math.max(0, rawBass - prevBass);
    const bass = smoothBass(rawBass);

    beatPulse *= 0.88;
    if (beatCooldown > 0) beatCooldown -= 1;
    if (transient > 0.035 && bass > 0.18 && beatCooldown <= 0) {
      beatPulse = Math.min(1, beatPulse + 0.9);
      beatCooldown = 7;
    }

    return { level, bass, beat: beatPulse };
  }
  function centerPos() {
    return (getContainerWidth() - SHEEP_WIDTH) / 2;
  }
  function pickNextAction() {
    const choices = [
      { mode: "nod", weight: 1.1 },
      { mode: "graze", weight: 1.1 },
      { mode: "jump", weight: 1 },
      { mode: "dance", weight: 1.6 }
    ];
    let sum = choices.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * sum;
    for (let c of choices) { if (r < c.weight) return c.mode; r -= c.weight; }
    return "nod";
  }
  function animateSheep(metrics, t) {
    const { level, bass, beat } = metrics;
    updateGroundOnResize();
    if (mode === "walk") {
      const speed = 0.06 + 0.06 * level + beat * 0.03;
      sheepX += sheepDir * speed;
      const width = getContainerWidth();
      const leftBound = 8;
      const rightBound = width - SHEEP_WIDTH - 8;
      if (sheepX < leftBound) { sheepX = leftBound; sheepDir = 1; }
      if (sheepX > rightBound) { sheepX = rightBound; sheepDir = -1; }
      modeTimer += 1 / 60;
      if (beat > 0.45 && level > 0.16 && Math.random() < 0.06) {
        mode = "dance";
        actionTimer = 0;
        actionDuration = 5 + Math.random() * 4;
      }
      if (modeTimer > 5 + Math.random() * 3) { mode = "pause"; pauseTimer = 0; nextAction = pickNextAction(); modeTimer = 0; }
    } else if (mode === "pause") {
      pauseTimer += 1 / 60;
      if (beat > 0.45 && level > 0.16 && Math.random() < 0.04) {
        mode = "dance";
        actionTimer = 0;
        actionDuration = 4 + Math.random() * 3;
      }
      if (pauseTimer > 1.3 + Math.random() * 2.0) {
        mode = nextAction; actionTimer = 0;
        if (nextAction === "nod") actionDuration = 8 + Math.random() * 4;
        else if (nextAction === "graze") actionDuration = 12 + Math.random() * 6;
        else if (nextAction === "jump") actionDuration = 5 + Math.random() * 3;
        else if (nextAction === "dance") actionDuration = 5 + Math.random() * 4;
        else actionDuration = 7 + Math.random() * 5;
      }
    } else if (mode === "nod" || mode === "graze" || mode === "jump" || mode === "dance") {
      actionTimer += 1 / 60;
      if (actionTimer > (typeof actionDuration === "number" ? actionDuration : 10)) { mode = "walk"; modeTimer = 0; }
    }
    tryEmitCloud(t);
    drawClouds();
    let yOffset = 8 + Math.sin(t * 0.011) * beat * 2.6;
    if (mode === "jump") yOffset = -Math.abs(Math.sin(t * 0.004) * 12);
    if (mode === "dance") yOffset = -Math.abs(Math.sin(t * 0.013) * (5 + beat * 9));
    let danceWiggle = 0;
    if (mode === "dance") {
      danceWiggle = Math.sin(t * 0.018) * (3 + beat * 8);
      sheepX += danceWiggle * 0.05;
    }
    const transform = (sheepDir === 1)
      ? `translate(${sheepX + SHEEP_WIDTH + danceWiggle},${yOffset}) scale(-1,1)`
      : `translate(${sheepX + danceWiggle},${yOffset})`;
    sheepGroup.setAttribute("transform", transform);
    if (head) {
      if (mode === "nod") {
        const base = 0, amp = 3 * level + 3, phase = t * 0.0037, y = base + Math.sin(phase) * amp;
        head.setAttribute("transform", `translate(0,${y.toFixed(2)})`);
      } else if (mode === "graze") {
        const chew = Math.sin(t * 0.007) * 2.8;
        head.setAttribute("transform", `translate(0,18) rotate(-14,42,27) translate(0,${chew.toFixed(2)})`);
      } else if (mode === "jump") {
        head.setAttribute("transform", `translate(0,8)`);
      } else if (mode === "dance") {
        const side = Math.sin(t * 0.013) * (2.2 + beat * 2.4);
        const bob = Math.abs(Math.sin(t * 0.026)) * (3.2 + bass * 4.2);
        head.setAttribute("transform", `translate(${side.toFixed(2)},${bob.toFixed(2)}) rotate(${(Math.sin(t * 0.01) * (3 + beat * 9)).toFixed(2)},42,27)`);
      } else if (mode === "pause") {
        head.setAttribute("transform", `translate(0,3)`);
      } else {
        const maxY = 2 + 7 * level;
        const y = Math.abs(Math.sin(t * 0.003 + level * 9.1)) * maxY;
        head.setAttribute("transform", `translate(0,${y.toFixed(2)})`);
      }
    }
    const step = t * 0.009;
    const legsAnim = (mode === "walk" || mode === "jump" || mode === "dance");
    const legAmp = mode === "dance" ? (15 + beat * 22) : (16 * level);
    const rearAmp = mode === "dance" ? (12 + beat * 18) : (13 * level);
    if (frontL) frontL.setAttribute("transform", legsAnim ? `rotate(${Math.sin(step)*legAmp},40,43)` : "");
    if (frontR) frontR.setAttribute("transform", legsAnim ? `rotate(${-Math.sin(step)*legAmp},34,41)` : "");
    if (rearL)  rearL.setAttribute("transform", legsAnim ? `rotate(${Math.sin(step+1.2)*rearAmp},70,41)` : "");
    if (rearR)  rearR.setAttribute("transform", legsAnim ? `rotate(${-Math.sin(step+1.2)*rearAmp},63,43)` : "");
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    const metrics = getAudioMetrics();
    const t = performance.now();
    animateSheep(metrics, t);
  }
  function start() {
    analyser.fftSize = 128;
    mode = "walk";
    modeTimer = 0;
    prevLevel = 0;
    prevBass = 0;
    beatPulse = 0;
    beatCooldown = 0;
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
  }
  return { start, stop, destroy };
}
