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

function updateVolumeScale(volume) {
  const numLevels = 13;
  const activeCount = Math.floor(volume * numLevels);
  for (let i = 1; i <= numLevels; i++) {
    const levelElem = document.getElementById(i.toString());
    if (levelElem) {
      levelElem.style.transition = "fill 0.3s ease";
      levelElem.setAttribute("fill", (i <= activeCount) ? "#00F2B8" : "#3C3C3C");
    }
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

    // Получаем масштаб (scale) .player-controls, если применён
    const playerControls = document.querySelector('.player-controls');
    let scale = 1;
    if (playerControls) {
      const style = window.getComputedStyle(playerControls);
      const transform = style.transform || style.webkitTransform;
      if (transform && transform !== 'none') {
        const match = transform.match(/^matrix\(([^,]+),/);
        if (match) {
          scale = parseFloat(match[1]);
        }
      }
    }

    // Корректируем позицию бегунка с учетом масштаба
    pos = pos / scale;

    const newVolume = (pos - leftMargin) / effectiveWidth;
    audioPlayer.volume = newVolume;
    defaultVolume.value = newVolume;
    volumeKnob.style.left = pos + "px";
    updateVolumeScale(newVolume);
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
    const pos = defaultVolume.value * rect.width;

    const playerControls = document.querySelector('.player-controls');
    let scale = 1;
    if (playerControls) {
      const style = window.getComputedStyle(playerControls);
      const transform = style.transform || style.webkitTransform;
      if (transform && transform !== 'none') {
        const match = transform.match(/^matrix\(([^,]+),/);
        if (match) {
          scale = parseFloat(match[1]);
        }
      }
    }

    const adjustedPos = pos / scale;

    volumeKnob.style.left = adjustedPos + "px";
    updateVolumeScale(defaultVolume.value);
  });
}

///random button patch

(function () {
  const randomBtn = document.getElementById('randomBtn');
  if (!randomBtn) return;
  randomBtn.addEventListener("click", () => {
    const favBtn = document.getElementById("favoritesFilterBtn");
    if (favBtn && favBtn.classList.contains("active")) {
      favBtn.classList.remove("active");
      const pSel = document.getElementById("playlistSelect");
      const sIn = document.getElementById("searchInput");
      const genreLabel = document.querySelector("label[for='playlistSelect']");
      if (pSel) pSel.style.display = "";
      if (sIn) sIn.style.display = "";
      if (genreLabel) genreLabel.textContent = "Genre:";
    }
    if (window.allStations && Array.isArray(window.allStations)) {
      window.currentPlaylist = window.allStations.slice();
      if (typeof window.resetVisibleStations === "function") window.resetVisibleStations();
    }
    if (window.fadeAudioOut && window.audioPlayer) {
      window.fadeAudioOut(window.audioPlayer, 500, () => {
        if (!window.allPlaylists || !window.allPlaylists.length) return;
        const ri = Math.floor(Math.random() * window.allPlaylists.length);
        const rg = window.allPlaylists[ri].file;
        const pSel = document.getElementById("playlistSelect");
        if (pSel) {
          pSel.value = rg;
          if (typeof window.onGenreChange === "function") window.onGenreChange(true);
        }
      });
    }
  }, true);
})();
