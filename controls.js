// controls.js

// Обновляем иконку Play/Pause
export function updatePlayPauseButton(audioPlayer, playPauseBtn) {
  // Если у вас одна и та же иконка на play/pause, можете оставить так.
  // Если нужны разные, здесь можно менять src на pause_button.svg
  if (audioPlayer.paused) {
    playPauseBtn.src = '/img/play_button.svg';
  } else {
    playPauseBtn.src = '/img/play_button.svg';
  }
}

// Обновляем иконку Shuffle (актив/не актив)
export function updateShuffleButton(shuffleActive, shuffleBtn) {
  // Аналогично, если нужна отдельная иконка для включённого shuffle, используйте её
  if (shuffleActive) {
    shuffleBtn.src = '/img/shuffle.svg';
  } else {
    shuffleBtn.src = '/img/shuffle.svg';
  }
}

// Инициализация регулятора громкости с поддержкой touch-событий для мобильных устройств
export function initVolumeControl(audioPlayer, volumeSlider, volumeKnob, defaultVolume) {
  let isDragging = false;

  function updateVolume(clientX) {
    const rect = volumeSlider.getBoundingClientRect();
    let pos = clientX - rect.left;
    pos = Math.max(0, Math.min(pos, rect.width));
    const newVolume = pos / rect.width;
    audioPlayer.volume = newVolume;
    defaultVolume.value = newVolume;
    volumeKnob.style.left = pos + "px";
  }

  // Обработчики для мыши
  volumeKnob.addEventListener('mousedown', (e) => {
    isDragging = true;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      updateVolume(e.clientX);
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Обработчики для touch-событий
  volumeKnob.addEventListener('touchstart', (e) => {
    isDragging = true;
    // Предотвращаем стандартное поведение, чтобы не возникали дополнительные события
    e.preventDefault();
  });
  document.addEventListener('touchmove', (e) => {
    if (isDragging) {
      const touch = e.touches[0];
      updateVolume(touch.clientX);
    }
  });
  document.addEventListener('touchend', () => {
    isDragging = false;
  });

  // При загрузке страницы устанавливаем положение ручки (исходя из defaultVolume)
  window.addEventListener('load', () => {
    const rect = volumeSlider.getBoundingClientRect();
    volumeKnob.style.left = (defaultVolume.value * rect.width) + "px";
  });
}
