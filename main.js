import { fadeAudioOut, fadeAudioIn } from './player.js';
import { renderPlaylist, loadPlaylist } from './playlist.js';
import {
  updatePlayPauseButton,
  updateShuffleButton,
  initVolumeControl
} from './controls.js';
import { initChat, updateChat, syncChat } from './chat.js';
import { getStreamMetadata } from './parsing.js';

document.addEventListener('DOMContentLoaded', () => {
  // Элементы блока выбора жанра
  const genreBox = document.querySelector('.genre-box');
  const genreLabel = genreBox.querySelector('label');
  let playlistSelect = document.getElementById('playlistSelect');
  let searchInput = document.getElementById('searchInput');
  // Переменная для динамически добавленного span с текстом "Favorites"
  let favoritesSpan = null;

  const audioPlayer = document.getElementById('audioPlayer');
  const stationLabel = document.getElementById('stationLabel');
  const currentTrackEl = document.getElementById('currentTrack');
  const playlistElement = document.getElementById('playlist');
  const playlistLoader = document.getElementById('playlistLoader');
  const rrBtn = document.getElementById('rrBtn');
  const ffBtn = document.getElementById('ffBtn');
  const favBtn = document.getElementById('favBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const randomBtn = document.getElementById('randomBtn');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const favoritesFilterBtn = document.getElementById('favoritesFilterBtn');

  // Глобальные массивы: полный список и текущий отображаемый плейлист
  let allStations = [];
  let currentPlaylist = [];
  // Текущий выбранный индекс в currentPlaylist
  let currentTrackIndex = 0;
  let shuffleActive = false;
  const defaultVolume = { value: 0.9 };
  audioPlayer.volume = defaultVolume.value;
  
  const allGenres = [
    'genres/african.m3u',
    'genres/asian.m3u',
    'genres/blues.m3u',
    'genres/chillout.m3u',
    'genres/classical.m3u',
    'genres/downtempo.m3u',
    'genres/drum_and_bass.m3u',
    'genres/electronic.m3u',
    'genres/funk.m3u',
    'genres/goa.m3u',
    'genres/house.m3u',
    'genres/industrial.m3u',
    'genres/jazz.m3u',
    'genres/jungle.m3u',
    'genres/lounge.m3u',
    'genres/rap.m3u',
    'genres/reggae.m3u',
    'genres/rnb.m3u',
    'genres/techno.m3u',
    'genres/world.m3u'
  ];

  // Инициализируем чат с выбранным жанром.
  initChat(playlistSelect.value);

  // Таймер проверки воспроизведения выбранной станции.
  let playCheckTimer = null;

  // Функция форматирования времени в формате mm:ss
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ":" + (secs < 10 ? "0" + secs : secs);
  }

  // Функция debounce для оптимизации обработки ввода
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Функция выбора станции (по индексу в currentPlaylist) с эффектом буферизации
  window.onStationSelect = function(index) {
    const allLi = document.querySelectorAll('#playlist li');
    allLi.forEach(item => {
      item.classList.remove('active');
      item.style.setProperty('--buffer-percent', '0%');
    });
    const li = Array.from(allLi).find(item => parseInt(item.dataset.index, 10) === index);
    
    currentTrackIndex = index;
    const station = currentPlaylist[index];
    window.currentStationUrl = station.url;
    
    localStorage.setItem('lastStation', JSON.stringify({
      genre: playlistSelect.value,
      trackIndex: index
    }));
    audioPlayer.src = station.url;
    li && li.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    if (window.playTimerInterval) clearInterval(window.playTimerInterval);
    const playTimerEl = document.getElementById('playTimer');
    if (playTimerEl) {
      playTimerEl.textContent = formatTime(0);
    } else {
      console.error("Элемент playTimer не найден!");
    }
    
    simulateBuffering(li, () => {
      li && li.classList.add('active');
      if (stationLabel) {
        stationLabel.textContent = station.title || 'Unknown Station';
      }
      audioPlayer.muted = false;
      audioPlayer.volume = defaultVolume.value;
      audioPlayer.play().then(() => {
        // Если воспроизведение началось, событие 'play' сбросит проверочный таймер
      }).catch(err => {
        console.warn("Autoplay blocked:", err);
      });
      fadeAudioIn(audioPlayer, defaultVolume.value, 1000);
      updatePlayPauseButton(audioPlayer, playPauseBtn);
    });
    
    if (playCheckTimer) clearTimeout(playCheckTimer);
    playCheckTimer = setTimeout(() => {
      if (audioPlayer.paused) {
        markStationAsHidden(index);
      }
    }, 10000);
  };

  // Обработчик кликов по элементам плейлиста
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

  // Функция имитации буферизации с использованием requestAnimationFrame
  function simulateBuffering(li, callback) {
    let startTime = null;
    const duration = 1000;
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      li && li.style.setProperty('--buffer-percent', progress + '%');
      if (progress < 100) {
        requestAnimationFrame(animate);
      } else {
        if (callback) callback();
      }
    }
    requestAnimationFrame(animate);
  }

  // Функция обновления метаданных потока
  async function updateStreamMetadata(stationUrl) {
    const streamTitle = await getStreamMetadata(stationUrl);
    if (currentTrackEl) {
      currentTrackEl.textContent = streamTitle && streamTitle.trim().length > 0
        ? streamTitle
        : "No Track Data";
    }
  }

  function showPlaylistLoader() {
    playlistLoader.classList.remove('hidden');
  }
  function hidePlaylistLoader() {
    playlistLoader.classList.add('hidden');
  }

  // Загрузка плейлиста: обновляем both allStations и currentPlaylist
  function loadAndRenderPlaylist(url, callback) {
    showPlaylistLoader();
    loadPlaylist(url)
      .then(loadedStations => {
        allStations = loadedStations;
        currentPlaylist = loadedStations.slice();
        renderPlaylist(playlistElement, currentPlaylist);
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

  // Функция, которая помечает станцию как неработающую, удаляет её из both allStations и currentPlaylist,
  // перерисовывает плейлист и запускает следующую станцию с эффектом буферизации
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
    
    renderPlaylist(playlistElement, currentPlaylist);
    
    const nextIndex = (index < currentPlaylist.length) ? index : 0;
    if (currentPlaylist.length > 0) {
      window.onStationSelect(nextIndex);
    } else {
      console.warn("Нет доступных станций в плейлисте");
      stationLabel.textContent = "Нет доступных станций";
    }
  }

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

  initVolumeControl(audioPlayer, document.querySelector('.volume-slider'), document.querySelector('.volume-knob'), defaultVolume);

  const lastStationData = localStorage.getItem('lastStation');
  if (lastStationData) {
    try {
      const { genre, trackIndex } = JSON.parse(lastStationData);
      playlistSelect.value = genre;
      loadAndRenderPlaylist(genre, () => {
        if (trackIndex >= currentPlaylist.length) {
          currentTrackIndex = 0;
        }
        window.onStationSelect(trackIndex);
        updateChat(genre);
      });
    } catch (e) {
      console.error("Ошибка парсинга lastStation:", e);
      loadAndRenderPlaylist(playlistSelect.value);
    }
  } else {
    loadAndRenderPlaylist(playlistSelect.value);
  }

  playlistSelect.addEventListener('change', () => {
    loadAndRenderPlaylist(playlistSelect.value, () => {
      searchInput.value = '';
      if (favoritesFilterBtn.classList.contains('active')) {
        favoritesFilterBtn.classList.remove('active');
      }
    });
    updateChat(playlistSelect.value);
  });

  searchInput.addEventListener('input', debounce(() => {
    const query = searchInput.value.toLowerCase();
    currentPlaylist = allStations.filter(station =>
      station.title.toLowerCase().includes(query)
    );
    renderPlaylist(playlistElement, currentPlaylist);
  }, 300));

  // Обработчик кнопки фильтра избранного:
  // При включении фильтра скрываем label, select и input, добавляем текст "Favorites"
  // При отключении возвращаем исходное отображение
  favoritesFilterBtn.addEventListener('click', async () => {
    if (favoritesFilterBtn.classList.contains('active')) {
      favoritesFilterBtn.classList.remove('active');
      // Убираем вставленный span с текстом "Favorites"
      if (favoritesSpan) {
        favoritesSpan.remove();
        favoritesSpan = null;
      }
      // Показываем элементы выбора жанра
      genreLabel.style.display = "";
      playlistSelect.style.display = "";
      searchInput.style.display = "";
      currentPlaylist = allStations.slice();
      renderPlaylist(playlistElement, currentPlaylist);
    } else {
      favoritesFilterBtn.classList.add('active');
      // Скрываем элементы выбора жанра
      genreLabel.style.display = "none";
      playlistSelect.style.display = "none";
      searchInput.style.display = "none";
      // Добавляем span с текстом "Favorites", если его ещё нет
      if (!favoritesSpan) {
        favoritesSpan = document.createElement("span");
        favoritesSpan.textContent = "Favorites";
        // Вставляем перед кнопкой фильтра, чтобы она оставалась видимой
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
      renderPlaylist(playlistElement, currentPlaylist);
    }
  });

  playPauseBtn.addEventListener('click', () => {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(err => console.warn("Autoplay blocked:", err));
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
      renderPlaylist(playlistElement, currentPlaylist);
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
  const metadataUpdateInterval = 30000;

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

  function isFavorite(station) {
    const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
    return favs.includes(station.url);
  }
});
