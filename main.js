import { fadeAudioOut, fadeAudioIn } from './player.js'
import { renderPlaylist, loadPlaylist } from './playlist.js'
import { initVolumeControl, updatePlayPauseButton, updateShuffleButton } from './controls.js'
import { initChat, updateChat, syncChat } from './chat.js'
import { getStreamMetadata } from './parsing.js'
import { initEqualizer } from './equalizer.js'

function generateStationHash(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

document.addEventListener('DOMContentLoaded', () => {
  let currentParsingUrl = null;
  let appInitialized = false;
  window.currentGenre = null;

  function checkMarquee(container) {
    if (!container) return;
    const scrollingText = container.querySelector('.scrolling-text');
    if (!scrollingText) return;
    scrollingText.classList.remove('marquee');
    const containerWidth = container.clientWidth;
    const textWidth = scrollingText.scrollWidth;
    if (textWidth > containerWidth) {
      scrollingText.classList.add('marquee');
    }
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      rrBtn.click();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      ffBtn.click();
    });
  }
    
  const genreBox = document.querySelector('.genre-box');
  const genreLabel = genreBox.querySelector('label');
  const playlistSelect = document.getElementById('playlistSelect');
  const searchInput = document.getElementById('searchInput');
  const playlistContainer = document.getElementById('playlistContent');
  const playlistElement = document.getElementById('playlist');
  let favoritesSpan = null;
  const audioPlayer = document.getElementById('audioPlayer');
  // Важно: задаем crossOrigin для audioPlayer
  audioPlayer.crossOrigin = 'anonymous';
  const stationLabel = document.getElementById('stationLabel');
  const currentTrackEl = document.getElementById('currentTrack');
  const playlistLoader = document.getElementById('playlistLoader');
  const rrBtn = document.getElementById('rrBtn');
  const ffBtn = document.getElementById('ffBtn');
  const favBtn = document.getElementById('favBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const randomBtn = document.getElementById('randomBtn');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const favoritesFilterBtn = document.getElementById('favoritesFilterBtn');
  let allStations = [];
  let currentPlaylist = [];
  let currentTrackIndex = 0;
  let shuffleActive = false;
  const defaultVolume = { value: 0.9 };
  audioPlayer.volume = defaultVolume.value;
  const allGenres = [
    'genres/african.m3u',
    'genres/alternative.m3u',
    'genres/asian.m3u',
    'genres/blues.m3u',
    'genres/chillout.m3u',
    'genres/classical.m3u',
    'genres/downtempo.m3u',
    'genres/drum_and_bass.m3u',
    'genres/electronic.m3u',
    'genres/funk.m3u',
    'genres/goa.m3u',
    'genres/hardcore.m3u',
    'genres/hip_hop.m3u',
    'genres/house.m3u',
    'genres/industrial.m3u',
    'genres/jazz.m3u',
    'genres/jungle.m3u',
    'genres/lounge.m3u',
    'genres/punk.m3u',
    'genres/rap.m3u',
    'genres/reggae.m3u',
    'genres/rnb.m3u',
    'genres/techno.m3u',
    'genres/world.m3u'
  ];
  let playCheckTimer = null;
  const CHUNK_SIZE = 30;
  let visibleStations = 0;

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ":" + (secs < 10 ? "0" + secs : secs);
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    }
  }

  function ensureVisible(index) {
    if (index >= visibleStations) {
      visibleStations = index + CHUNK_SIZE;
      if (visibleStations > currentPlaylist.length) {
        visibleStations = currentPlaylist.length;
      }
      renderPlaylist(playlistElement, currentPlaylist, 0, visibleStations);
    }
  }

  function resetVisibleStations() {
    visibleStations = 0;
    renderMoreStations();
  }

  function renderMoreStations() {
    if (visibleStations < currentPlaylist.length) {
      visibleStations += CHUNK_SIZE;
      renderPlaylist(playlistElement, currentPlaylist, 0, visibleStations);
    }
  }

  playlistContainer.addEventListener('scroll', () => {
    const { scrollTop, clientHeight, scrollHeight } = playlistContainer;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      renderMoreStations();
    }
  });

  window.onStationSelect = function(index) {
    ensureVisible(index);
    const station = currentPlaylist[index];
    window.currentStationUrl = station.url;
    renderPlaylist(playlistElement, currentPlaylist, 0, visibleStations);
    const allLi = document.querySelectorAll('#playlist li');
    allLi.forEach(item => {
      item.classList.remove('active');
      item.style.setProperty('--buffer-percent', '0%');
    });
    const li = Array.from(allLi).find(item => parseInt(item.dataset.index, 10) === index);
    currentTrackIndex = index;
    currentParsingUrl = station.url;
    localStorage.setItem('lastStation', JSON.stringify({
      genre: playlistSelect.value,
      trackIndex: index
    }));
    window.currentGenre = playlistSelect.value;
    const rightGroup = document.querySelector('.right-group');
    if (rightGroup) {
      rightGroup.innerHTML = `<img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
                              <span id="currentTrack" class="track-name">
                                <span class="scrolling-text">Loading...</span>
                              </span>`;
      checkMarquee(rightGroup);
    }
    audioPlayer.crossOrigin = 'anonymous';
    audioPlayer.src = station.url;
    audioPlayer.load();
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.playTimerInterval) clearInterval(window.playTimerInterval);
    const playTimerEl = document.getElementById('playTimer');
    if (playTimerEl) {
      playTimerEl.textContent = formatTime(0);
    }
    function simulateBuffering(li, callback) {
      let startTime = null;
      const duration = 1000;
      function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min((elapsed / duration) * 100, 100);
        if (li) {
          li.style.setProperty('--buffer-percent', progress + '%');
        }
        if (progress < 100) {
          requestAnimationFrame(animate);
        } else {
          if (callback) callback();
        }
      }
      requestAnimationFrame(animate);
    }
    simulateBuffering(li, () => {
      if (li) li.classList.add('active');
      if (stationLabel) {
        const stText = stationLabel.querySelector('.scrolling-text');
        if (stText) {
          stText.textContent = station.title || 'Unknown Station';
        }
        checkMarquee(stationLabel);
      }
      audioPlayer.muted = false;
      audioPlayer.volume = defaultVolume.value;
      audioPlayer.play().then(() => {
        appInitialized = true;
        if (!window.equalizerInitialized) {
          initEqualizer();
          window.equalizerInitialized = true;
        }
      }).catch(err => {
        console.warn("Playback error:", err);
      });
      fadeAudioIn(audioPlayer, defaultVolume.value, 1000);
      updatePlayPauseButton(audioPlayer, playPauseBtn);
    });
    if (playCheckTimer) clearTimeout(playCheckTimer);
    if (appInitialized) {
      playCheckTimer = setTimeout(() => {
        if (audioPlayer.paused) {
          markStationAsHidden(index);
        }
      }, 10000);
    }
    updateStreamMetadata(station.url);
  };

  playlistElement.addEventListener('click', function(e) {
    let li = e.target;
    while (li && li.tagName !== 'LI') {
      li = li.parentElement;
    }
    if (li && li.dataset.index !== undefined) {
      const index = parseInt(li.dataset.index, 10);
      window.onStationSelect(index);
    }
  });

  async function updateStreamMetadata(stationUrl) {
    if (stationUrl !== currentParsingUrl) return;
    const rightGroup = document.querySelector('.right-group');
    if (!rightGroup) return;
    rightGroup.style.display = 'flex';
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve("TIMEOUT"), 5000));
    const metadataPromise = getStreamMetadata(stationUrl);
    const result = await Promise.race([metadataPromise, timeoutPromise]);
    if (stationUrl !== currentParsingUrl) return;
    if (result !== "TIMEOUT" && result && result.trim() && result !== "No Metadata" && result !== "No Track Data") {
      rightGroup.innerHTML = `
        <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
        <span id="currentTrack" class="track-name">
          <span class="scrolling-text">${result}</span>
        </span>`;
      setTimeout(() => { checkMarquee(rightGroup) }, 10000);
    } else {
      import('./parsing.js').then(module => {
        module.getTickerRSS().then(tickerText => {
          if (stationUrl !== currentParsingUrl) return;
          rightGroup.innerHTML = `
            <img src="/img/news_icon.svg" alt="News Icon" class="track-icon">
            <span id="currentTrack" class="track-name">
              <span class="scrolling-text">${tickerText}</span>
            </span>`;
          setTimeout(() => { checkMarquee(rightGroup) }, 3000);
        }).catch(err => {
          rightGroup.innerHTML = `
            <img src="/img/news_icon.svg" alt="News Icon" class="track-icon">
            <span id="currentTrack" class="track-name">
              <span class="scrolling-text marquee">RSS недоступен</span>
            </span>`;
          setTimeout(() => { checkMarquee(rightGroup) }, 10000);
        });
      });
    }
  }

  function showPlaylistLoader() {
    playlistLoader.classList.remove('hidden');
  }

  function hidePlaylistLoader() {
    playlistLoader.classList.add('hidden');
  }

  function loadAndRenderPlaylist(url, callback, scrollToTop = false) {
    showPlaylistLoader();
    loadPlaylist(url)
      .then(loadedStations => {
        allStations = loadedStations;
        currentPlaylist = loadedStations.slice();
        resetVisibleStations();
        if (scrollToTop) {
          setTimeout(() => {
            playlistContainer.scrollTo({ top: 0, behavior: 'smooth' });
          }, 50);
        }
      })
      .then(() => {
        hidePlaylistLoader();
        if (typeof callback === 'function') {
          callback();
        }
      })
      .catch(error => {
        console.error('Ошибка загрузки списка станций:', error);
        hidePlaylistLoader();
      });
  }

  function markStationAsHidden(index) {
    const failedStation = currentPlaylist[index];
    if (!failedStation) return;
    let hiddenStations = JSON.parse(localStorage.getItem('hiddenStations') || '[]');
    if (!hiddenStations.includes(failedStation.url)) {
      hiddenStations.push(failedStation.url);
      localStorage.setItem('hiddenStations', JSON.stringify(hiddenStations));
    }
    allStations = allStations.filter(st => st.url !== failedStation.url);
    currentPlaylist.splice(index, 1);
    resetVisibleStations();
    const nextIndex = (index < currentPlaylist.length) ? index : 0;
    if (currentPlaylist.length > 0) {
      window.onStationSelect(nextIndex);
    } else {
      console.warn("Нет доступных станций в плейлисте");
      if (stationLabel) {
        stationLabel.textContent = "Нет доступных станций";
      }
    }
  }
  window.markStationAsHidden = markStationAsHidden;

  audioPlayer.addEventListener('play', () => {
    updatePlayPauseButton(audioPlayer, playPauseBtn);
    if (playCheckTimer) {
      clearTimeout(playCheckTimer);
      playCheckTimer = null;
    }
    if (window.playTimerInterval) clearInterval(window.playTimerInterval);
    let playTimer = 0;
    const playTimerEl = document.getElementById('playTimer');
    if (playTimerEl) {
      playTimerEl.textContent = formatTime(playTimer);
      window.playTimerInterval = setInterval(() => {
        playTimer++;
        playTimerEl.textContent = formatTime(playTimer);
      }, 1000);
    }
  });

  audioPlayer.addEventListener('pause', () => {
    updatePlayPauseButton(audioPlayer, playPauseBtn);
    if (window.playTimerInterval) {
      clearInterval(window.playTimerInterval);
      window.playTimerInterval = null;
    }
  });

  initVolumeControl(
    audioPlayer,
    document.querySelector('.volume-slider'),
    document.querySelector('.volume-knob'),
    defaultVolume
  );

  function processUrlHash() {
    const hash = window.location.hash;
    if (hash) {
      const fragment = hash.substring(1);
      const parts = fragment.split('/');
      if (parts.length === 2) {
        const genreFromHash = decodeURIComponent(parts[0]);
        const stationHash = parts[1];
        playlistSelect.value = genreFromHash;
        window.currentGenre = genreFromHash;
        loadAndRenderPlaylist(genreFromHash, () => {
          const matchedIndex = currentPlaylist.findIndex(station => generateStationHash(station.url) === stationHash);
          if (matchedIndex !== -1) {
            window.onStationSelect(matchedIndex);
          } else {
            window.onStationSelect(0);
          }
        });
        return true;
      }
    }
    return false;
  }

  const lastStationData = localStorage.getItem('lastStation');
  if (lastStationData) {
    try {
      const { genre, trackIndex } = JSON.parse(lastStationData);
      if (!processUrlHash()) {
        playlistSelect.value = genre;
        window.currentGenre = genre;
        initChat(genre);
        loadAndRenderPlaylist(genre, () => {
          const safeIndex = (trackIndex < currentPlaylist.length) ? trackIndex : 0;
          window.onStationSelect(safeIndex);
          updateChat(genre);
        });
      } else {
        initChat(playlistSelect.value);
        updateChat(playlistSelect.value);
      }
    } catch (e) {
      console.error("Ошибка парсинга lastStation:", e);
      initChat(playlistSelect.value);
      loadAndRenderPlaylist(playlistSelect.value, () => {
        window.onStationSelect(0);
      });
    }
  } else {
    const randomGenreIndex = Math.floor(Math.random() * allGenres.length);
    const randomGenre = allGenres[randomGenreIndex];
    playlistSelect.value = randomGenre;
    window.currentGenre = randomGenre;
    initChat(randomGenre);
    loadAndRenderPlaylist(randomGenre, () => {
      if (currentPlaylist.length > 0) {
        const randomStationIndex = Math.floor(Math.random() * currentPlaylist.length);
        window.onStationSelect(randomStationIndex);
        localStorage.setItem('lastStation', JSON.stringify({
          genre: randomGenre,
          trackIndex: randomStationIndex
        }));
        updateChat(randomGenre);
      } else {
        console.warn("Нет доступных станций в выбранном жанре");
      }
    });
  }

  playlistSelect.addEventListener('change', () => {
    loadAndRenderPlaylist(playlistSelect.value, () => {
      searchInput.value = '';
      if (favoritesFilterBtn.classList.contains('active')) {
        favoritesFilterBtn.classList.remove('active');
      }
    }, true);
    updateChat(playlistSelect.value);
  });

  searchInput.addEventListener('input', debounce(() => {
    const query = searchInput.value.toLowerCase();
    currentPlaylist = allStations.filter(station =>
      station.title.toLowerCase().includes(query)
    );
    resetVisibleStations();
  }, 300));

  favoritesFilterBtn.addEventListener('click', async () => {
    if (favoritesFilterBtn.classList.contains('active')) {
      favoritesFilterBtn.classList.remove('active');
      if (favoritesSpan) {
        favoritesSpan.remove();
        favoritesSpan = null;
      }
      genreLabel.style.display = "";
      playlistSelect.style.display = "";
      searchInput.style.display = "";
      currentPlaylist = allStations.slice();
      resetVisibleStations();
    } else {
      favoritesFilterBtn.classList.add('active');
      genreLabel.style.display = "none";
      playlistSelect.style.display = "none";
      searchInput.style.display = "none";
      if (!favoritesSpan) {
        favoritesSpan = document.createElement("span");
        favoritesSpan.textContent = "Favorites";
        genreBox.insertBefore(favoritesSpan, favoritesFilterBtn);
      }
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      let allFavStations = [];
      await Promise.all(allGenres.map(async (genre) => {
        const stations = await loadPlaylist(genre);
        const favs = stations.filter(station => favorites.includes(station.url));
        allFavStations = allFavStations.concat(favs);
      }));
      const uniqueFavStations = Array.from(
        new Map(allFavStations.map(station => [station.url, station])).values()
      );
      currentPlaylist = uniqueFavStations;
      resetVisibleStations();
    }
  });

  playPauseBtn.addEventListener('click', () => {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(err => console.warn("Playback error:", err));
    } else {
      audioPlayer.pause();
    }
    updatePlayPauseButton(audioPlayer, playPauseBtn);
  });

  rrBtn.addEventListener('click', () => {
    if (currentTrackIndex > 0) {
      fadeAudioOut(audioPlayer, 500, () => {
        window.onStationSelect(currentTrackIndex - 1);
      });
    }
  });

  ffBtn.addEventListener('click', () => {
    if (shuffleActive) {
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * currentPlaylist.length);
      } while (randomIndex === currentTrackIndex && currentPlaylist.length > 1);
      fadeAudioOut(audioPlayer, 500, () => {
        window.onStationSelect(randomIndex);
      });
    } else {
      if (currentTrackIndex < currentPlaylist.length - 1) {
        fadeAudioOut(audioPlayer, 500, () => {
          window.onStationSelect(currentTrackIndex + 1);
        });
      }
    }
  });

  favBtn.addEventListener('click', () => {
    if (currentPlaylist.length > 0) {
      const currentStation = currentPlaylist[currentTrackIndex];
      let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (!favs.includes(currentStation.url)) {
        favs.push(currentStation.url);
        localStorage.setItem('favorites', JSON.stringify(favs));
      }
      currentPlaylist = allStations.slice();
      resetVisibleStations();
    }
  });

  shuffleBtn.addEventListener('click', () => {
    shuffleActive = !shuffleActive;
    updateShuffleButton(shuffleActive, shuffleBtn);
  });

  randomBtn.addEventListener('click', () => {
    fadeAudioOut(audioPlayer, 500, () => {
      const randomGenreIndex = Math.floor(Math.random() * allGenres.length);
      const randomGenre = allGenres[randomGenreIndex];
      loadAndRenderPlaylist(randomGenre, () => {
        if (currentPlaylist.length > 0) {
          const randomStationIndex = Math.floor(Math.random() * currentPlaylist.length);
          window.onStationSelect(randomStationIndex);
          localStorage.setItem('lastStation', JSON.stringify({
            genre: randomGenre,
            trackIndex: randomStationIndex
          }));
          updateChat(randomGenre);
          playlistSelect.value = randomGenre;
        }
      });
    });
  });

  let lastChatUpdate = 0;
  let lastMetadataUpdate = 0;
  const chatUpdateInterval = 15000;
  const metadataUpdateInterval = 10000;

  function globalUpdater(timestamp) {
    if (!lastChatUpdate) lastChatUpdate = timestamp;
    if (!lastMetadataUpdate) lastMetadataUpdate = timestamp;
    if (timestamp - lastChatUpdate >= chatUpdateInterval) {
      syncChat();
      lastChatUpdate = timestamp;
    }
    if (timestamp - lastMetadataUpdate >= metadataUpdateInterval) {
      updateStreamMetadata(audioPlayer.src);
      lastMetadataUpdate = timestamp;
    }
    requestAnimationFrame(globalUpdater);
  }

  requestAnimationFrame(globalUpdater);
  document.dispatchEvent(new Event('appLoaded'));
});
