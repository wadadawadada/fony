// equalizer.js

const VISUALIZERS = [
  { name: 'Bars',    path: './equalizers/bars.js',    module: null },
  { name: 'Line',    path: './equalizers/line.js',    module: null },
  // { name: 'Circles', path: './equalizers/circles.js', module: null },
  { name: 'Fish',    path: './equalizers/fish.js',    module: null },
  { name: 'Lava',    path: './equalizers/lava.js',    module: null },
  { name: 'Sheep',   path: './equalizers/sheep.js',   module: null }
];

export function initEqualizer() {
  const diodsRow = document.querySelector('.diods-row');
  if (!diodsRow) return;
  diodsRow.innerHTML = '';

  const eqContainer = document.createElement('div');
  eqContainer.classList.add('equalizer-container');
  eqContainer.style.position = 'relative';
  diodsRow.appendChild(eqContainer);

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

  let idx = 0;
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
    await mount(idx);
  });
}
