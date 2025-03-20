// main.js

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
  const audioPlayer = document.getElementById('audioPlayer');
  const stationLabel = document.getElementById('stationLabel');
  const currentTrackEl = document.getElementById('currentTrack');
  const playlistElement = document.getElementById('playlist');
  const playlistSelect = document.getElementById('playlistSelect');
  const playlistLoader = document.getElementById('playlistLoader');
  const rrBtn = document.getElementById('rrBtn');
  const ffBtn = document.getElementById('ffBtn');
  const favBtn = document.getElementById('favBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const randomBtn = document.getElementById('randomBtn');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const volumeSlider = document.querySelector('.volume-slider');
  const volumeKnob = document.querySelector('.volume-knob');
  const searchInput = document.getElementById('searchInput');
  const favoritesFilterBtn = document.getElementById('favoritesFilterBtn');

  let stations = [];
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

  // Инициализация чата (без отдельного таймера – синхронизация происходит через глобальный updater)
  initChat(playlistSelect.value);

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

  // Функция выбора станции
  window.onStationSelect = function(index) {
    const allLi = document.querySelectorAll('#playlist li');
    allLi.forEach(item => {
      item.classList.remove('active');
      item.style.setProperty('--buffer-percent', '0%');
    });

    currentTrackIndex = index;
    const li = allLi[index];
    li.classList.add('active');

    const station = stations[index];
    window.currentStationUrl = station.url;
    if (stationLabel) {
      stationLabel.textContent = station.title || 'Unknown Station';
    }
    if (currentTrackEl) {
      currentTrackEl.textContent = '';
    }

    // Сохраняем выбор станции в localStorage
    localStorage.setItem('lastStation', JSON.stringify({
      genre: playlistSelect.value,
      trackIndex: index
    }));

    audioPlayer.src = station.url;
    li.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Останавливаем предыдущий таймер воспроизведения, если он был запущен
    if (window.playTimerInterval) clearInterval(window.playTimerInterval);

    // Сброс отображения таймера на 0
    const playTimerEl = document.getElementById('playTimer');
    if (playTimerEl) {
      playTimerEl.textContent = formatTime(0);
    } else {
      console.error("Элемент playTimer не найден!");
    }

    // Имитация буферизации, после чего сразу запускается воспроизведение
    simulateBuffering(li, () => {
      // Сбросим mute и установим громкость по умолчанию
      audioPlayer.muted = false;
      audioPlayer.volume = defaultVolume.value;
      // Пытаемся сразу начать воспроизведение
      audioPlayer.play().then(() => {
        // Если воспроизведение началось, обработчик 'play' запустит таймер
      }).catch(err => {
        console.warn("Autoplay blocked:", err);
      });
      fadeAudioIn(audioPlayer, defaultVolume.value, 1000);
      updatePlayPauseButton(audioPlayer, playPauseBtn);
    });
  };

  // Делегирование кликов по элементам плейлиста
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
    const duration = 1000; // 1 секунда
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      li.style.setProperty('--buffer-percent', progress + '%');
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

  function loadAndRenderPlaylist(url, callback) {
    showPlaylistLoader();
    loadPlaylist(url)
      .then(loadedStations => {
        stations = loadedStations;
        renderPlaylist(playlistElement, stations);
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

  // Загрузка плейлиста и восстановление последней выбранной станции
  const lastStationData = localStorage.getItem('lastStation');
  if (lastStationData) {
    try {
      const { genre, trackIndex } = JSON.parse(lastStationData);
      playlistSelect.value = genre;
      loadAndRenderPlaylist(genre, () => {
        if (trackIndex >= stations.length) {
          currentTrackIndex = 0;
        }
        window.onStationSelect(trackIndex);
      });
    } catch (e) {
      console.error("Ошибка парсинга lastStation:", e);
      loadAndRenderPlaylist(playlistSelect.value);
    }
  } else {
    loadAndRenderPlaylist(playlistSelect.value);
  }

  playlistSelect.addEventListener('change', () => {
    fadeAudioOut(audioPlayer, 500, () => {
      loadAndRenderPlaylist(playlistSelect.value, () => {
        if (stations.length > 0) {
          window.onStationSelect(0);
        }
        localStorage.setItem('lastStation', JSON.stringify({
          genre: playlistSelect.value,
          trackIndex: currentTrackIndex
        }));
        searchInput.value = '';
        if (favoritesFilterBtn.classList.contains('active')) {
          favoritesFilterBtn.classList.remove('active');
        }
      });
      updateChat(playlistSelect.value);
    });
  });

  // Обработчик поля поиска с debounce (300 мс)
  searchInput.addEventListener('input', debounce(() => {
    let baseStations = stations;
    if (favoritesFilterBtn.classList.contains('active')) {
      baseStations = stations.filter(station => isFavorite(station));
    }
    const query = searchInput.value.toLowerCase();
    const filteredStations = baseStations.filter(station =>
      station.title.toLowerCase().includes(query)
    );
    renderPlaylist(playlistElement, filteredStations);
  }, 300));

  favoritesFilterBtn.addEventListener('click', () => {
    if (favoritesFilterBtn.classList.contains('active')) {
      favoritesFilterBtn.classList.remove('active');
      const query = searchInput.value.toLowerCase();
      const filteredStations = query
        ? stations.filter(station => station.title.toLowerCase().includes(query))
        : stations;
      renderPlaylist(playlistElement, filteredStations);
    } else {
      favoritesFilterBtn.classList.add('active');
      const favStations = stations.filter(station => isFavorite(station));
      const query = searchInput.value.toLowerCase();
      const filteredStations = query
        ? favStations.filter(station => station.title.toLowerCase().includes(query))
        : favStations;
      renderPlaylist(playlistElement, filteredStations);
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
        randomIndex = Math.floor(Math.random() * stations.length);
      } while (randomIndex === currentTrackIndex && stations.length > 1);
      fadeAudioOut(audioPlayer, 500, () => {
        window.onStationSelect(randomIndex);
      });
    } else {
      if (currentTrackIndex < stations.length - 1) {
        fadeAudioOut(audioPlayer, 500, () => {
          window.onStationSelect(currentTrackIndex + 1);
        });
      }
    }
  });

  favBtn.addEventListener('click', () => {
    if (stations.length > 0) {
      const currentStation = stations[currentTrackIndex];
      let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (!favs.includes(currentStation.url)) {
        favs.push(currentStation.url);
        localStorage.setItem('favorites', JSON.stringify(favs));
      }
      renderPlaylist(playlistElement, stations);
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
        if (stations.length > 0) {
          const randomStationIndex = Math.floor(Math.random() * stations.length);
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

  // Обработчики событий аудиоплеера для управления таймером
  audioPlayer.addEventListener('play', () => {
    updatePlayPauseButton(audioPlayer, playPauseBtn);
    // При воспроизведении запускаем таймер
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
    // Останавливаем таймер, когда воспроизведение на паузе
    if (window.playTimerInterval) {
      clearInterval(window.playTimerInterval);
      window.playTimerInterval = null;
    }
  });

  initVolumeControl(audioPlayer, volumeSlider, volumeKnob, defaultVolume);

  // Вспомогательная функция для определения избранных станций
  function isFavorite(station) {
    const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
    return favs.includes(station.url);
  }

  // Глобальный updater для синхронизации чата и метаданных с помощью requestAnimationFrame
  let lastChatUpdate = 0;
  let lastMetadataUpdate = 0;
  const chatUpdateInterval = 15000;      // 15 секунд для чата
  const metadataUpdateInterval = 30000;  // 30 секунд для метаданных

  function globalUpdater(timestamp) {
    if (!lastChatUpdate) lastChatUpdate = timestamp;
    if (!lastMetadataUpdate) lastMetadataUpdate = timestamp;
    
    if (timestamp - lastChatUpdate >= chatUpdateInterval) {
      // Обновляем сообщения чата (синхронизация с Gist)
      syncChat();
      lastChatUpdate = timestamp;
    }
    if (timestamp - lastMetadataUpdate >= metadataUpdateInterval) {
      // Обновляем метаданные потока
      updateStreamMetadata(audioPlayer.src);
      lastMetadataUpdate = timestamp;
    }
    requestAnimationFrame(globalUpdater);
  }
  requestAnimationFrame(globalUpdater);
});
