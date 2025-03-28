// equalizer.js

export function initEqualizer() {
    const diodsRow = document.querySelector('.diods-row');
    if (!diodsRow) return;
    // Очищаем контейнер (удаляем старое изображение)
    diodsRow.innerHTML = '';
  
    // Создаем контейнер для баров эквалайзера
    const eqContainer = document.createElement('div');
    eqContainer.classList.add('equalizer-container');
  
    const numBars = 30; // оставляем 30 баров
    const bars = [];
    for (let i = 0; i < numBars; i++) {
      const bar = document.createElement('div');
      bar.classList.add('equalizer-bar');
      // Начальная высота – 10px, ширина – 4px, базовый градиент
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
  
    // Используем глобальный аудиоконтекст или создаем новый
    let audioContext = window.audioContext;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      window.audioContext = audioContext;
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
    }
  
    // Создаем MediaElementAudioSourceNode, если еще не создан
    if (!window.audioSource) {
      try {
        window.audioSource = audioContext.createMediaElementSource(audioPlayer);
      } catch (e) {
        console.error('Ошибка создания audio source:', e);
        return;
      }
    }
  
    // Создаем анализатор, если его еще нет, и подключаем audioSource к анализатору,
    // затем анализатор подключаем к аудиовыходу (destination)
    if (!window.equalizerAnalyser) {
      window.equalizerAnalyser = audioContext.createAnalyser();
      window.equalizerAnalyser.fftSize = 128;
      window.audioSource.connect(window.equalizerAnalyser);
      window.equalizerAnalyser.connect(audioContext.destination);
    }
    const analyser = window.equalizerAnalyser;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  
    // Для симметрии используем половину баров (15 пар)
    const halfBars = numBars / 2; // 15
    // Разбиваем спектр на 15 сегментов
    const bandSize = frequencyData.length / halfBars;
  
    // Функция анимации: для каждой пары рассчитываем максимум амплитуды по сегменту спектра
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
        const value = max / 255; // нормализуем значение (0..1)
        // Применяем экспоненциальное масштабирование – показатель 1.8 для усиления пиков
        const scaledValue = Math.pow(value, 1.0);
        // Изменил базовую высоту и множитель: минимум 10px, максимум примерно 80px
        const newHeight = 0 + scaledValue * 48;
        
        // Обновляем симметрично левую и правую стороны
        bars[halfBars - 1 - i].style.height = `${newHeight}px`;
        bars[halfBars + i].style.height = `${newHeight}px`;
      }
    }
    animate();
}
