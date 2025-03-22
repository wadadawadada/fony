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

  // Глобальная переменная для отслеживания текущего URL для парсинга
  let currentParsingUrl = null;

  // Функция для активации бегущей строки (marquee)
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

  // Элементы для управления жанрами и поиска
  const genreBox = document.querySelector('.genre-box');
  const genreLabel = genreBox.querySelector('label');
  const playlistSelect = document.getElementById('playlistSelect');
  const searchInput = document.getElementById('searchInput');

  // Контейнер плейлиста
  const playlistContainer = document.getElementById('playlistContent');
  const playlistElement = document.getElementById('playlist');
  
  // Для иконки "Favorites" (динамически добавляемой)
  let favoritesSpan = null;

  // Основные элементы плеера
  const audioPlayer = document.getElementById('audioPlayer');
  const stationLabel = document.getElementById('stationLabel');
  // Элемент для отображения трека (находится внутри .right-group)
  const currentTrackEl = document.getElementById('currentTrack');
  const playlistLoader = document.getElementById('playlistLoader');

  // Кнопки управления
  const rrBtn = document.getElementById('rrBtn');
  const ffBtn = document.getElementById('ffBtn');
  const favBtn = document.getElementById('favBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const randomBtn = document.getElementById('randomBtn');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const favoritesFilterBtn = document.getElementById('favoritesFilterBtn');

  // Глобальные переменные для списка станций
  let allStations = [];
  let currentPlaylist = [];
  let currentTrackIndex = 0;
  let shuffleActive = false;
  const defaultVolume = { value: 0.9 };
  audioPlayer.volume = defaultVolume.value;

  // Список жанров
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

  let playCheckTimer = null;

  // Функция форматирования времени (mm:ss)
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ":" + (secs < 10 ? "0" + secs : secs);
  }

  // Debounce для поиска
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Функция выбора станции
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
    
    // Обновляем текущий URL для парсинга
    currentParsingUrl = station.url;
    
    localStorage.setItem('lastStation', JSON.stringify({
      genre: playlistSelect.value,
      trackIndex: index
    }));

    // При переключении станции сразу очищаем данные трека и показываем "Loading..."
    const rightGroup = document.querySelector('.right-group');
    if (rightGroup) {
      rightGroup.innerHTML = `<img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
                              <span id="currentTrack" class="track-name">
                                <span class="scrolling-text">Loading...</span>
                              </span>`;
      checkMarquee(rightGroup);
    }

    // Не скрываем .right-group – оно всегда отображается
    audioPlayer.src = station.url;
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    if (window.playTimerInterval) clearInterval(window.playTimerInterval);
    const playTimerEl = document.getElementById('playTimer');
    if (playTimerEl) {
      playTimerEl.textContent = formatTime(0);
    } else {
      console.error("Элемент playTimer не найден!");
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
        // Воспроизведение началось
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

    // Запускаем обновление метаданных для выбранной станции
    updateStreamMetadata(station.url);
  };

  // Делегирование кликов по плейлисту
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

  // Имитация буферизации (анимация)
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

  // Функция обновления метаданных текущего трека с таймаутом
  async function updateStreamMetadata(stationUrl) {
    // Если URL, для которого запущен вызов, не совпадает с текущим, прекращаем обновление
    if (stationUrl !== currentParsingUrl) return;
    
    const rightGroup = document.querySelector('.right-group');
    if (!rightGroup) return;
    rightGroup.style.display = 'flex';

    // Создаем промис-таймаут на 5 секунд
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve("TIMEOUT"), 5000));
    const metadataPromise = getStreamMetadata(stationUrl);
    const result = await Promise.race([metadataPromise, timeoutPromise]);

    // Если переключили станцию во время ожидания, прекращаем обновление
    if (stationUrl !== currentParsingUrl) return;

    if (result !== "TIMEOUT" && result && result.trim() && result !== "No Metadata" && result !== "No Track Data") {
      // Получили валидную метадату – отображаем её
      rightGroup.innerHTML = `<img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
                              <span id="currentTrack" class="track-name">
                                <span class="scrolling-text">${result}</span>
                              </span>`;
      checkMarquee(rightGroup);
    } else {
      // Либо метадата не получена, либо произошел таймаут – загружаем RSS-тикер (новости)
      import('./parsing.js').then(module => {
        module.getTickerRSS().then(tickerText => {
          if (stationUrl !== currentParsingUrl) return;
          rightGroup.innerHTML = `<img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
                                  <span id="currentTrack" class="track-name">
                                    <span class="scrolling-text marquee">${tickerText}</span>
                                  </span>`;
          checkMarquee(rightGroup);
        }).catch(err => {
          rightGroup.innerHTML = `<img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
                                  <span id="currentTrack" class="track-name">
                                    <span class="scrolling-text marquee">RSS недоступен</span>
                                  </span>`;
          checkMarquee(rightGroup);
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

  // Загрузка и отображение плейлиста
  function loadAndRenderPlaylist(url, callback, scrollToTop = false) {
    showPlaylistLoader();
    loadPlaylist(url)
      .then(loadedStations => {
        allStations = loadedStations;
        currentPlaylist = loadedStations.slice();
        renderPlaylist(playlistElement, currentPlaylist);
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

  // Функция скрытия нерабочей станции и перехода к следующей
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

  // События аудио плеера
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

  // Инициализация регулятора громкости
  initVolumeControl(
    audioPlayer,
    document.querySelector('.volume-slider'),
    document.querySelector('.volume-knob'),
    defaultVolume
  );

  // Загрузка последнего выбранного жанра/станции
  const lastStationData = localStorage.getItem('lastStation');
  if (lastStationData) {
    try {
      const { genre, trackIndex } = JSON.parse(lastStationData);
      playlistSelect.value = genre;
      initChat(genre);
      loadAndRenderPlaylist(genre, () => {
        const safeIndex = (trackIndex < currentPlaylist.length) ? trackIndex : 0;
        window.onStationSelect(safeIndex);
        updateChat(genre);
      });
    } catch (e) {
      console.error("Ошибка парсинга lastStation:", e);
      initChat(playlistSelect.value);
      loadAndRenderPlaylist(playlistSelect.value);
    }
  } else {
    initChat(playlistSelect.value);
    loadAndRenderPlaylist(playlistSelect.value);
  }

  // Смена жанра через select
  playlistSelect.addEventListener('change', () => {
    loadAndRenderPlaylist(playlistSelect.value, () => {
      searchInput.value = '';
      if (favoritesFilterBtn.classList.contains('active')) {
        favoritesFilterBtn.classList.remove('active');
      }
    }, true);
    updateChat(playlistSelect.value);
  });

  // Поиск по плейлисту
  searchInput.addEventListener('input', debounce(() => {
    const query = searchInput.value.toLowerCase();
    currentPlaylist = allStations.filter(station =>
      station.title.toLowerCase().includes(query)
    );
    renderPlaylist(playlistElement, currentPlaylist);
  }, 300));

  // Фильтр избранного
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
      renderPlaylist(playlistElement, currentPlaylist);
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
      renderPlaylist(playlistElement, currentPlaylist);
    }
  });

  // Кнопка Play/Pause
  playPauseBtn.addEventListener('click', () => {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(err => console.warn("Autoplay blocked:", err));
    } else {
      audioPlayer.pause();
    }
    updatePlayPauseButton(audioPlayer, playPauseBtn);
  });

  // Кнопка предыдущей станции
  rrBtn.addEventListener('click', () => {
    if (currentTrackIndex > 0) {
      fadeAudioOut(audioPlayer, 500, () => {
        window.onStationSelect(currentTrackIndex - 1);
      });
    }
  });

  // Кнопка следующей станции
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

  // Добавление станции в избранное
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

  // Кнопка Shuffle
  shuffleBtn.addEventListener('click', () => {
    shuffleActive = !shuffleActive;
    updateShuffleButton(shuffleActive, shuffleBtn);
  });

  // Случайный жанр / станция
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

  // Периодическое обновление чата и метаданных
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

  function isFavorite(station) {
    const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
    return favs.includes(station.url);
  }
});
