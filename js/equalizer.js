export function initEqualizer() {
    const diodsRow = document.querySelector('.diods-row');
    if (!diodsRow) return;
    diodsRow.innerHTML = '';
  
    const eqContainer = document.createElement('div');
    eqContainer.classList.add('equalizer-container');
  
    const numBars = 30; // оставляем 30 баров
    const bars = [];
    for (let i = 0; i < numBars; i++) {
      const bar = document.createElement('div');
      bar.classList.add('equalizer-bar');
      bar.style.height = '10px';
      bar.style.width = '4px';
      bar.style.background = 'linear-gradient(to bottom, #00F2B8, rgba(0, 96, 74, 0))';
      bar.style.transition = 'height 0.1s linear';
      eqContainer.appendChild(bar);
      bars.push(bar);
    }
    diodsRow.appendChild(eqContainer);
  
    const audioPlayer = document.getElementById('audioPlayer');
    if (!audioPlayer) return;
  
    let audioContext = window.audioContext;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      window.audioContext = audioContext;
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
    }
  
    if (!window.audioSource) {
      try {
        window.audioSource = audioContext.createMediaElementSource(audioPlayer);
      } catch (e) {
        console.error('Ошибка создания audio source:', e);
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
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  
    const halfBars = numBars / 2; // 15
    const bandSize = frequencyData.length / halfBars;
  
    function animate() {
      requestAnimationFrame(animate);
      analyser.getByteFrequencyData(frequencyData);
      
      for (let i = 0; i < halfBars; i++) {
        const start = Math.floor(i * bandSize);
        const end = Math.floor((i + 1) * bandSize);
        let max = 0;
        for (let j = start; j < end; j++) {
          if (frequencyData[j] > max) {
            max = frequencyData[j];
          }
        }
        const value = max / 255; 
        const scaledValue = Math.pow(value, 1.0);
        const newHeight = 0 + scaledValue * 48;
        
        bars[halfBars - 1 - i].style.height = `${newHeight}px`;
        bars[halfBars + i].style.height = `${newHeight}px`;
      }
    }
    animate();
}
