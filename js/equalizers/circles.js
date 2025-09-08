export default function Circles({ container, analyser }) {
  const h = 75;
  container.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(h));
  svg.style.display = 'block';
  svg.style.margin = '0 auto';
  svg.style.overflow = 'hidden';
  container.appendChild(svg);

  const N = 6;
  const paths = [];

  function getW() {
    return container.clientWidth || 180;
  }

  function getBandIndices(bins) {
    return [
      [2, 5],
      [5, 9],
      [9, 15],
      [15, 23],
      [23, 33],
      [33, 36]
    ];
  }

  const SENS =   [5118, 5123, 5130, 5138, 5146, 5152];
  const DENSITY = [8, 12, 16, 20, 24, 32]; // реже — мягче

  for (let i = 0; i < N; i++) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#00F2B8');
    p.setAttribute('stroke-width', 2);
    p.setAttribute('opacity', 0.35 + i * 0.1);
    svg.appendChild(p);
    paths.push(p);
  }

  let raf = null;
  const freq = new Uint8Array(analyser.frequencyBinCount);
  let prev = new Array(N).fill(0);
  let beatPhase = 0;
  function lerp(a, b, t) { return a + (b - a) * t; }

  // только одна синусоида — идеально гладко
  function smoothCirclePath(cx, cy, baseR, ampMusic, phase, density) {
    const pts = [];
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const noise = Math.sin(angle * density + phase) * ampMusic * baseR;
      const r = baseR + noise;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      pts.push([x, y]);
    }
    return "M" + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z";
  }

  function loop() {
    const w = getW();
    const cx = w / 2;
    const cy = h / 2;
    const maxR = w / 2 - 16;
    const minR = maxR * 0.22;
    const step = (maxR - minR) / (N - 1);

    raf = requestAnimationFrame(loop);
    analyser.getByteFrequencyData(freq);
    const bins = freq.length;
    const bands = getBandIndices(bins);

    let beat = 0;
    for (let j = bands[0][0]; j < bands[0][1]; j++) beat += freq[j];
    beat /= (bands[0][1] - bands[0][0]);
    beatPhase = lerp(beatPhase, beat / 42, 0.23);

    const time = Date.now() * 0.002 + beatPhase * 2.5;

    for (let i = 0; i < N; i++) {
      let [from, to] = bands[i];
      let sum = 0;
      for (let j = from; j < to; j++) sum += freq[j];
      let avg = sum / Math.max(1, to - from);

      prev[i] = lerp(prev[i], avg, 0.25);

      let baseR = minR + step * i;
      let ampMusic = Math.min(prev[i] / SENS[i], 0.18 + (i / N) * 0.10);
      let dir = (i % 2 === 0) ? 1 : -1;
      let phase = time * dir + i * 0.7;

      const d = smoothCirclePath(cx, cy, baseR, ampMusic, phase, DENSITY[i]);
      paths[i].setAttribute('d', d);
    }
  }

  function start() {
    analyser.fftSize = 128;
    loop();
    window.addEventListener('resize', loop);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    window.removeEventListener('resize', loop);
  }
  function destroy() {
    stop();
    container.innerHTML = '';
  }
  return { start, stop, destroy };
}
