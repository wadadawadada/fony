export default function Sheep({ container, analyser }) {
  const SHEEP_SVG_PATH = "/js/equalizers/img/sheep.svg";
  const CLOUD_SVG_PATH = "/js/equalizers/img/cloud.svg";
  const SHEEP_WIDTH = 87, SHEEP_HEIGHT = 57;
  let raf = null, freq = new Uint8Array(128);
  let svgRoot, sheepGroup, head, frontL, frontR, rearL, rearR;
  let cloudsGroup;
  let clouds = [];
  let cloudSVG = null;
  let lastCloudEmit = 0;
  let sheepX = 0, sheepDir = 1;
  let mode = "walk", modeTimer = 0, actionTimer = 0, pauseTimer = 0;
  let nextAction = null;
  let prevLevel = 0;
  let actionDuration = 8;
  const GROUND_Y = SHEEP_HEIGHT - 5;

  function getContainerWidth() {
    return container.clientWidth || SHEEP_WIDTH;
  }

  function updateViewBox() {
    if (!svgRoot) return;
    const width = getContainerWidth();
    svgRoot.setAttribute("viewBox", `0 0 ${width} ${SHEEP_HEIGHT}`);
    svgRoot.setAttribute("width", width);
    svgRoot.setAttribute("height", SHEEP_HEIGHT);
  }

  function initClouds() {
    clouds = [];
    const width = getContainerWidth();
    const count = 1;
    for (let i = 0; i < count; ++i) {
      const size = 18 + Math.random() * 32;
      clouds.push({
        x: Math.random() * width * 0.7,
        y: Math.random() * 12,
        size: size,
        speed: 0.07 + Math.random() * 0.06,
        opacity: 1
      });
    }
    lastCloudEmit = performance.now();
  }

  function tryEmitCloud(t) {
    const width = getContainerWidth();
    const minDistance = 180;
    if (!clouds.length || clouds[0].x > minDistance) {
      emitCloud();
      lastCloudEmit = t;
      return;
    }
    if (t - lastCloudEmit > 3500 + Math.random() * 1800) {
      if (clouds.length === 0 || clouds[0].x > minDistance) {
        emitCloud();
        lastCloudEmit = t;
      }
    }
  }

  function emitCloud() {
    const size = 18 + Math.random() * 32;
    clouds.unshift({
      x: -size - Math.random() * 16,
      y: Math.random() * 12,
      size: size,
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
      if (cloud.x > fadeStart) {
        cloud.opacity = Math.max(0, 1 - (cloud.x - fadeStart) / (fadeEnd - fadeStart));
      } else {
        cloud.opacity = 1;
      }
    }
    while (clouds.length && clouds[clouds.length - 1].x > width + 60) {
      clouds.pop();
    }
    cloudsGroup.replaceChildren(...clouds.map(cloud => makeCloudSVG(cloud)));
  }

  function makeCloudSVG(cloud) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${cloud.x},${cloud.y}) scale(${cloud.size / 100})`);
    g.setAttribute("opacity", cloud.opacity.toFixed(2));
    g.innerHTML = cloudSVG;
    return g;
  }

  function drawGround(svg) {
    svg.querySelectorAll(".fony-ground").forEach(n => n.remove());
    const width = getContainerWidth();
    const N = Math.max(9, Math.floor(width / 11));
    for (let i = 0; i < N; ++i) {
      const x = 6 + i * (width - 12) / (N - 1) + (Math.random() - 0.5) * 8;
      const height = 7 + Math.random() * 24;
      const angle = (Math.random() - 0.5) * 1.2;
      const y0 = GROUND_Y + (Math.random() - 0.5) * 4;
      const grass = document.createElementNS("http://www.w3.org/2000/svg", "path");
      grass.setAttribute("d", `M${x},${y0} q${1.5+angle*2},${-height/1.2} ${3+angle*3},0`);
      grass.classList.add("fony-ground");
      grass.setAttribute("stroke", "#07F2B8");
      grass.setAttribute("stroke-width", (0.8 + Math.random() * 1.2).toFixed(2));
      grass.setAttribute("fill", "none");
      grass.setAttribute("opacity", (0.7 + 0.3 * Math.random()).toFixed(2));
      svg.insertBefore(grass, svg.firstChild);
    }
    const stones = Math.floor(width / 24);
    for (let i = 0; i < stones; ++i) {
      const x = 14 + i * (width - 28) / (stones - 1) + (Math.random() - 0.5) * 14;
      const y = GROUND_Y + 3.4 + (Math.random() - 0.2) * 8;
      const rx = 2.2 + Math.random() * 3.5;
      const ry = 1.0 + Math.random() * 2.6;
      const stone = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      stone.classList.add("fony-ground");
      stone.setAttribute("cx", x);
      stone.setAttribute("cy", y);
      stone.setAttribute("rx", rx);
      stone.setAttribute("ry", ry);
      stone.setAttribute("fill", "none");
      stone.setAttribute("stroke", "#07F2B8");
      stone.setAttribute("stroke-width", (0.7 + Math.random() * 1.2).toFixed(2));
      stone.setAttribute("opacity", (0.5 + 0.3 * Math.random()).toFixed(2));
      svg.insertBefore(stone, svg.firstChild);
    }
  }

  function fetchAllSVGs(callback) {
    fetch(CLOUD_SVG_PATH)
      .then(r => r.text())
      .then(svgText => {
        cloudSVG = svgText.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
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
        svgRoot.setAttribute("height", SHEEP_HEIGHT);
        cloudsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        cloudsGroup.setAttribute("class", "fony-clouds");
        svgRoot.insertBefore(cloudsGroup, svgRoot.firstChild);
        initClouds();
        updateViewBox();
        svgRoot.style.overflow = "visible";
        sheepGroup = svgRoot.getElementById("sheep");
        head = svgRoot.getElementById("head");
        frontL = svgRoot.getElementById("front_l");
        frontR = svgRoot.getElementById("front_r");
        rearL = svgRoot.getElementById("rear_r_2");
        rearR = svgRoot.getElementById("rear_r");
        sheepX = centerPos();
        drawGround(svgRoot);

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
      });
    });

  function handleResize() {
    updateViewBox();
    if (svgRoot) drawGround(svgRoot);
    if (cloudsGroup) initClouds();
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

  function pickNextAction() {
    const choices = [
      { mode: "nod", weight: 1.1 },
      { mode: "graze", weight: 1.1 },
      { mode: "jump", weight: 1 }
    ];
    let sum = choices.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * sum;
    for (let c of choices) {
      if (r < c.weight) return c.mode;
      r -= c.weight;
    }
    return "nod";
  }

  function animateSheep(level, t) {
    const width = getContainerWidth();
    const leftBound = 8;
    const rightBound = width - SHEEP_WIDTH - 8;

    if (mode === "walk") {
      const speed = 0.06 + 0.04 * level;
      sheepX += sheepDir * speed;
      if (sheepX < leftBound) {
        sheepX = leftBound;
        sheepDir = 1;
      }
      if (sheepX > rightBound) {
        sheepX = rightBound;
        sheepDir = -1;
      }
      modeTimer += 1 / 60;
      if (modeTimer > 5 + Math.random() * 3) {
        mode = "pause";
        pauseTimer = 0;
        nextAction = pickNextAction();
        modeTimer = 0;
      }
    }
    else if (mode === "pause") {
      pauseTimer += 1 / 60;
      if (pauseTimer > 1.3 + Math.random() * 2.0) {
        mode = nextAction;
        actionTimer = 0;
        if (nextAction === "nod")        actionDuration = 8 + Math.random() * 4;
        else if (nextAction === "graze") actionDuration = 12 + Math.random() * 6;
        else if (nextAction === "jump")  actionDuration = 5 + Math.random() * 3;
        else                             actionDuration = 7 + Math.random() * 5;
      }
    }
    else if (mode === "nod" || mode === "graze" || mode === "jump") {
      actionTimer += 1 / 60;
      if (actionTimer > (typeof actionDuration === "number" ? actionDuration : 10)) {
        mode = "walk";
        modeTimer = 0;
      }
    }

    tryEmitCloud(t);
    drawClouds();

    let yOffset = 0;
    if (mode === "jump") {
      yOffset = -Math.abs(Math.sin(t * 0.004) * 12);
    }
    let transform;
    if (sheepDir === 1) {
      transform = `translate(${sheepX + SHEEP_WIDTH},${yOffset}) scale(-1,1)`;
    } else {
      transform = `translate(${sheepX},${yOffset})`;
    }
    sheepGroup.setAttribute("transform", transform);

    if (head) {
      if (mode === "nod") {
        const base = 10;
        const amp = 18 * level + 6;
        const phase = t * 0.0037;
        const y = base + Math.sin(phase) * amp;
        head.setAttribute("transform", `translate(0,${y.toFixed(2)})`);
      }
      else if (mode === "graze") {
        const chew = Math.sin(t * 0.014) * 2.8;
        head.setAttribute("transform", `translate(0,18) rotate(-14,42,27) translate(0,${chew.toFixed(2)})`);
      }
      else if (mode === "jump") {
        head.setAttribute("transform", `translate(0,8)`);
      }
      else if (mode === "pause") {
        head.setAttribute("transform", `translate(0,3)`);
      }
      else {
        const maxY = 2 + 7 * level;
        const y = Math.abs(Math.sin(t * 0.003 + level * 9.1)) * maxY;
        head.setAttribute("transform", `translate(0,${y.toFixed(2)})`);
      }
    }

    const step = t * 0.009;
    const legsAnim = (mode === "walk" || mode === "jump");
    if (frontL) frontL.setAttribute("transform",
      legsAnim ? `rotate(${Math.sin(step)*16*level},40,43)` : "");
    if (frontR) frontR.setAttribute("transform",
      legsAnim ? `rotate(${-Math.sin(step)*16*level},34,41)` : "");
    if (rearL)  rearL.setAttribute("transform",
      legsAnim ? `rotate(${Math.sin(step+1.2)*13*level},70,41)` : "");
    if (rearR)  rearR.setAttribute("transform",
      legsAnim ? `rotate(${-Math.sin(step+1.2)*13*level},63,43)` : "");
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const level = getLevel();
    const t = performance.now();
    animateSheep(level, t);
  }

  function start() {
    analyser.fftSize = 128;
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
  }
  return { start, stop, destroy };
}
