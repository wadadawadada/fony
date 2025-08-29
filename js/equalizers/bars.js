export default function Bars({ container, analyser }) {
  analyser.fftSize = 128; // всегда сбрасывай для режима bars

  const numBars = 30;
  const bars = [];
  container.innerHTML = '';
  for (let i = 0; i < numBars; i++) {
    const bar = document.createElement('div');
    bar.classList.add('equalizer-bar');
    bar.style.height = '10px';
    bar.style.width = '4px';
    bar.style.background = 'linear-gradient(to bottom, #00F2B8, rgba(0, 96, 74, 0))';
    bar.style.transition = 'height 0.1s linear';
    container.appendChild(bar);
    bars.push(bar);
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const halfBars = numBars / 2;
  const bandSize = freqData.length / halfBars;

  let raf = null;
  function loop() {
    raf = requestAnimationFrame(loop);
    analyser.getByteFrequencyData(freqData);
    for (let i = 0; i < halfBars; i++) {
      const start = Math.floor(i * bandSize);
      const end = Math.floor((i + 1) * bandSize);
      let max = 0;
      for (let j = start; j < end; j++) if (freqData[j] > max) max = freqData[j];
      const value = max / 255;
      const scaled = Math.pow(value, 1.0);
      const newHeight = 0 + scaled * 48;
      bars[halfBars - 1 - i].style.height = `${newHeight}px`;
      bars[halfBars + i].style.height = `${newHeight}px`;
    }
  }

  function start() {
    analyser.fftSize = 128; // гарантия для любых повторных запусков
    loop();
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
