// equalizer.js

const VISUALIZERS = [
  { name: 'Mirror',  path: './equalizers/mirror.js',  module: null },
  { name: 'Bars',    path: './equalizers/bars.js',    module: null },
  { name: 'Line',    path: './equalizers/line.js',    module: null },
  // { name: 'Circles', path: './equalizers/circles.js', module: null },
  { name: 'Lava',    path: './equalizers/lava.js',    module: null },
  { name: 'Sheep',   path: './equalizers/sheep.js',   module: null }
];

// Short-lived, subdued hint on hover: a click on the equalizer switches to the next one.
// Reuses the .custom-tooltip look of the player buttons; fades out by itself after a moment.
function attachHint(el) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  let tip = null;
  let timer = null;
  function hide() {
    clearTimeout(timer);
    if (!tip) return;
    const t = tip;
    tip = null;
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 300);
  }
  el.addEventListener("mouseenter", () => {
    if (tip) return;
    tip = document.createElement("div");
    tip.className = "custom-tooltip";
    tip.textContent = "Click to change";
    tip.style.cssText = "position:absolute;pointer-events:none;white-space:nowrap;opacity:0;transition:opacity 0.25s ease;background:none;border:none;box-shadow:none;padding:0;";
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    tip.style.top = (r.top + window.scrollY - tr.height - 4) + "px";
    tip.style.left = (r.right + window.scrollX - tr.width - 6) + "px";
    requestAnimationFrame(() => { if (tip) tip.style.opacity = "0.5"; }); // subdued: a hint, not a label
    timer = setTimeout(hide, 2200);
  });
  el.addEventListener("mouseleave", hide);
  el.addEventListener("click", hide);
  window.addEventListener("blur", hide);
}

export function initEqualizer() {
  const diodsRow = document.querySelector('.diods-row');
  if (!diodsRow) return;
  diodsRow.innerHTML = '';

  const eqContainer = document.createElement('div');
  eqContainer.classList.add('equalizer-container');
  eqContainer.style.position = 'relative';
  diodsRow.appendChild(eqContainer);
  attachHint(eqContainer);

  const audioPlayer = document.getElementById('audioPlayer');
  if (!audioPlayer) return;

  let audioContext = window.audioContext;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    window.audioContext = audioContext;
    if (audioContext.state === 'suspended') audioContext.resume();
  }

  if (!window.audioSource) {
    try {
      window.audioSource = audioContext.createMediaElementSource(audioPlayer);
    } catch (e) {
      return;
    }
  }

  if (!window.equalizerAnalyser) {
    window.equalizerAnalyser = audioContext.createAnalyser();
    window.equalizerAnalyser.fftSize = 128;
    window.audioSource.connect(window.equalizerAnalyser);
    window.equalizerAnalyser.connect(audioContext.destination);
  }
  const analyser = window.equalizerAnalyser;

  // the chosen equalizer is remembered by name, so it survives a reload (and a reordering of the list)
  let idx = 0;
  try {
    const saved = VISUALIZERS.findIndex(v => v.name === localStorage.getItem("equalizerName"));
    if (saved >= 0) idx = saved;
  } catch (e) {}
  let instance = null;

  async function loadVisualizer(i) {
    if (VISUALIZERS[i].module) return VISUALIZERS[i].module;
    const mod = await import(VISUALIZERS[i].path);
    VISUALIZERS[i].module = mod.default || mod;
    return VISUALIZERS[i].module;
  }

  async function mount(i) {
    if (instance && instance.destroy) instance.destroy();
    eqContainer.innerHTML = '';
    const Visualizer = await loadVisualizer(i);
    instance = Visualizer({ container: eqContainer, analyser, audio: audioPlayer });
    if (instance && instance.start) instance.start();
  }

  mount(idx);

  eqContainer.addEventListener('click', async () => {
    idx = (idx + 1) % VISUALIZERS.length;
    try { localStorage.setItem("equalizerName", VISUALIZERS[idx].name); } catch (e) {}
    await mount(idx);
  });
}
