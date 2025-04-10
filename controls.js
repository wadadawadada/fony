// controls.js

export function updatePlayPauseButton(audioPlayer, playPauseBtn) {
  const isDark = localStorage.getItem('theme') === 'dark';
  const prefix = isDark ? '/img/dark/' : '/img/';
  if (audioPlayer.paused) {
    playPauseBtn.src = prefix + 'play_button.svg';
  } else {
    playPauseBtn.src = prefix + 'pause_button.svg';
  }
}

export function updateShuffleButton(shuffleActive, shuffleBtn) {
  const isDark = localStorage.getItem('theme') === 'dark';
  const prefix = isDark ? '/img/dark/' : '/img/';
  if (shuffleActive) {
    shuffleBtn.src = prefix + 'shuffle_active.svg';
    shuffleBtn.classList.add('active');
  } else {
    shuffleBtn.src = prefix + 'shuffle.svg';
    shuffleBtn.classList.remove('active');
  }
}

export function initVolumeControl(audioPlayer, volumeSlider, volumeKnob, defaultVolume) {
  let isDragging = false;

  function updateVolume(clientX) {
    const rect = volumeSlider.getBoundingClientRect();
    const leftMargin = rect.width * 0.06;
    const rightMargin = rect.width * 0.06;
    const effectiveWidth = rect.width - leftMargin - rightMargin;
    
    let pos = clientX - rect.left;
    pos = Math.max(leftMargin, Math.min(pos, rect.width - rightMargin));
    const newVolume = (pos - leftMargin) / effectiveWidth;
    
    audioPlayer.volume = newVolume;
    defaultVolume.value = newVolume;
    volumeKnob.style.left = pos + "px";
  }

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

  volumeKnob.addEventListener('touchstart', (e) => {
    isDragging = true;
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



  window.addEventListener('load', () => {
    const rect = volumeSlider.getBoundingClientRect();
    volumeKnob.style.left = (defaultVolume.value * rect.width) + "px";
  });
}
