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
      // Начальная высота – 10px
      bar.style.height = '10px';
      bar.style.width = '4px';
      bar.style.backgroundColor = '#00F2B8';
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
  
    // Функция анимации: обновляет высоту баров симметрично с нелинейным масштабированием
    function animate() {
      requestAnimationFrame(animate);
      analyser.getByteFrequencyData(frequencyData);
      
      const halfBars = numBars / 2;
      // Проходим по 15 парам баров (лево и право)
      for (let i = 0; i < halfBars; i++) {
        const index = Math.floor(i * frequencyData.length / halfBars);
        const value = frequencyData[index] / 255; // нормализуем значение (0..1)
        // Применяем экспоненциальное масштабирование для более выразительной реакции на пики
        const scaledValue = Math.pow(value, 1.0); // можно изменять экспоненту для более сильного эффекта
        const newHeight = 10 + scaledValue * 48; // базовая высота 10px, максимум ~80px
        // Обновляем левую и правую стороны симметрично
        bars[halfBars - 1 - i].style.height = `${newHeight}px`;
        bars[halfBars + i].style.height = `${newHeight}px`;
      }
    }
    animate();
  }
  