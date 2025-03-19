// Файл: main.js

import { fadeAudioOut, fadeAudioIn } from './player.js';
import { renderPlaylist, loadPlaylist } from './playlist.js';
import {
  updatePlayPauseButton,
  updateShuffleButton,
  initVolumeControl
} from './controls.js';
import { initChat, updateChat } from './chat.js';

// ====== ДОБАВЛЕНА ССЫЛКА НА ВАШУ ФУНКЦИЮ-ПРОКСИ ======
const proxyBase = 'https://<ВАШ_САЙТ>.netlify.app/.netlify/functions/audioProxy';

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

  // Инициализируем чат для текущего жанра
  initChat(playlistSelect.value);

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ":" + (secs < 10 ? "0" + secs : secs);
  }

  let fakeBufferIntervalId = null;
  function simulateBuffering(li, callback) {
    if (fakeBufferIntervalId) {
      clearInterval(fakeBufferIntervalId);
      fakeBufferIntervalId = null;
    }
    let currentBuffer = 0;
    li.style.setProperty('--buffer-percent', '0%');

    fakeBufferIntervalId = setInterval(() => {
      currentBuffer += 5;
      li.style.setProperty('--buffer-percent', currentBuffer + '%');
      if (currentBuffer >= 100) {
        clearInterval(fakeBufferIntervalId);
        fakeBufferIntervalId = null;
        if (callback) callback();
      }
    }, 10);
  }

  // ====== ГЛАВНАЯ ФУНКЦИЯ ВЫБОРА СТАНЦИИ ======
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
    stationLabel.textContent = station.title || 'Unknown Station';
    currentTrackEl.textContent = station.bitrate || '';

    // ====== ВАЖНО: ЗДЕСЬ МЕНЯЕМ ПРЯМУЮ URL НА ПРОКСИ ======
    // Вместо station.url => используем proxyBase + '?url=' + encodeURIComponent(...)
    // Пример: https://ваш-сайт.netlify.app/.netlify/functions/audioProxy?url=http://...
    audioPlayer.src = proxyBase + '?url=' + encodeURIComponent(station.url);

    li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (window.playTimerInterval) clearInterval(window.playTimerInterval);
    let playTimer = 0;
    const playTimerEl = document.getElementById('playTimer');
    playTimerEl.textContent = formatTime(playTimer);

    simulateBuffering(li, () => {
      audioPlayer.play().catch(err => console.warn("Autoplay blocked:", err));
      fadeAudioIn(audioPlayer, defaultVolume.value, 1000);
      updatePlayPauseButton(audioPlayer, playPauseBtn);

      window.playTimerInterval = setInterval(() => {
        playTimer++;
        playTimerEl.textContent = formatTime(playTimer);
      }, 1000);
    });
  };

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

  // Пытаемся загрузить последние настройки из localStorage
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
          trackIndex: 0
        }));
      });
      updateChat(playlistSelect.value);
    });
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
    alert('Функция избранного пока не реализована.');
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

  audioPlayer.addEventListener('play', () => {
    updatePlayPauseButton(audioPlayer, playPauseBtn);
  });
  audioPlayer.addEventListener('pause', () => {
    updatePlayPauseButton(audioPlayer, playPauseBtn);
  });

  // Инициализация регулятора громкости
  initVolumeControl(audioPlayer, volumeSlider, volumeKnob, defaultVolume);
});
