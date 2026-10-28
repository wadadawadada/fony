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
  const bars = document.querySelectorAll('.volume-scale rect');
  const activeCount = Math.round(volume * bars.length);
  bars.forEach((bar, i) => {
    const on = i < activeCount;
    bar.classList.toggle('on', on);
    bar.setAttribute('fill', on ? '#00F2B8' : '#3C3C3C');
  });
}

export function initVolumeControl(audioPlayer, volumeSlider, volumeKnob, defaultVolume) {
  let isDragging = false;

  // Layout width (offsetWidth) ignores CSS transforms, the bounding rect does
  // not. Their ratio is the scale applied by e.g. .player-controls.chat-collapsed,
  // so the knob stays correct whether or not the console is collapsed.
  function metrics() {
    const rect = volumeSlider.getBoundingClientRect();
    const width = volumeSlider.offsetWidth || rect.width;
    const scale = width ? rect.width / width : 1;
    return { rect, width, scale: scale || 1, margin: width * 0.06 };
  }

  function placeKnob(pos, width, margin, volume) {
    volumeKnob.style.left = pos + "px";
    volumeSlider.style.setProperty('--vol-px', pos + "px");
    updateVolumeScale(volume);
  }

  function updateVolume(clientX) {
    const { rect, width, scale, margin } = metrics();
    const pos = Math.max(margin, Math.min((clientX - rect.left) / scale, width - margin));
    const newVolume = (pos - margin) / (width - margin * 2);
    audioPlayer.volume = newVolume;
    defaultVolume.value = newVolume;
    placeKnob(pos, width, margin, newVolume);
  }

  volumeKnob.addEventListener('mousedown', (e) => {
    isDragging = true;
    volumeSlider.classList.add('dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      updateVolume(e.clientX);
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    volumeSlider.classList.remove('dragging');
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
    const { width, margin } = metrics();
    const volume = defaultVolume.value;
    placeKnob(margin + volume * (width - margin * 2), width, margin, volume);
  });
}

///random button patch

(function () {
  const randomBtn = document.getElementById('randomBtn');
  if (!randomBtn) return;
  randomBtn.addEventListener("click", () => {
    if (window.currentMode === "local") return; // handled by the local explorer
    const favBtn = document.getElementById("favoritesFilterBtn");
    if (favBtn && favBtn.classList.contains("active")) {
      favBtn.classList.remove("active");
      favBtn.src = "/img/fav_list.svg";
      const customSelect = document.getElementById("customGenreSelect");
      const sIn = document.getElementById("searchInput");
      const genreLabel = document.querySelector("label[for='customGenreSelect']");
      const sortContainer = document.getElementById("favoritesSortContainer");
      if (customSelect) customSelect.style.display = "";
      if (sIn) sIn.style.display = "";
      if (sortContainer) sortContainer.style.display = "none";
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
        const randomPlaylist = window.allPlaylists[ri];
        if (typeof window.setSelectedGenre === "function") {
          window.setSelectedGenre(randomPlaylist.file, randomPlaylist.name);
          window.currentGenre = randomPlaylist.name;
          if (typeof window.loadAndRenderPlaylist === "function") {
            window.loadAndRenderPlaylist(randomPlaylist.file, randomPlaylist.name, () => {
              if (window.currentPlaylist && window.currentPlaylist.length) {
                const idx = Math.floor(Math.random() * window.currentPlaylist.length);
                if (typeof window.onStationSelect === "function") window.onStationSelect(idx);
              }
            });
          }
        }
      });
    }
  }, true);
})();
