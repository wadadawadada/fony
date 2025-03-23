// playlist.js

// Функция генерации хеш-суммы на основе URL станции.
// Используется для формирования уникального идентификатора станции.
function generateStationHash(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0; // Приведение к 32-битному целому
  }
  return Math.abs(hash).toString(16);
}

// Отрисовка списка станций с оптимизированным доступом к DOM через DocumentFragment и делегированием событий.
export function renderPlaylist(playlistElement, stations) {
  playlistElement.innerHTML = '';
  const fragment = document.createDocumentFragment();

  stations.forEach((station, index) => {
    const li = document.createElement('li');
    li.style.position = "relative";
    li.style.setProperty('--buffer-percent', '0%');
    li.dataset.index = index;

    // Полоса прогресса (визуал буферизации)
    const progressDiv = document.createElement('div');
    progressDiv.classList.add('progress');
    li.appendChild(progressDiv);

    // Если задана обложка (logo)
    if (station.cover) {
      const icon = document.createElement('img');
      icon.src = station.cover;
      icon.alt = "Station icon";
      icon.classList.add('station-icon');
      icon.loading = 'lazy';
      li.appendChild(icon);
    }

    // Текст с названием станции и битрейтом
    const span = document.createElement('span');
    span.textContent = station.title + (station.bitrate ? ` (${station.bitrate})` : '');
    li.appendChild(span);

    // Если станция активная – добавляем справа кнопку share с надписью "copied!"
    if (window.currentStationUrl && station.url === window.currentStationUrl) {
      li.classList.add('active');

      const shareIcon = document.createElement('img');
      shareIcon.src = '/img/share_icon.svg';
      shareIcon.alt = 'Share station';
      shareIcon.style.width = '14px';
      shareIcon.style.height = '14px';
      shareIcon.style.cursor = 'pointer';
      shareIcon.style.marginLeft = '10px';

      const copiedSpan = document.createElement('span');
      copiedSpan.textContent = 'copied!';
      copiedSpan.style.color = '#fff';
      copiedSpan.style.marginLeft = '5px';
      copiedSpan.style.display = 'none';

      // Формируем ссылку с hash-фрагментом, включающим жанр и хеш станции.
      // Предполагаем, что в main.js установлен глобальный window.currentGenre.
      shareIcon.addEventListener('click', (event) => {
        event.stopPropagation();
        const hash = generateStationHash(station.url);
        // Если currentGenre не задан, используем значение из localStorage.lastStation или пустую строку.
        const genre = window.currentGenre || (localStorage.getItem('lastStation') && JSON.parse(localStorage.getItem('lastStation')).genre) || "";
        const shareLink = window.location.origin + window.location.pathname + '#' + encodeURIComponent(genre) + '/' + hash;
        navigator.clipboard.writeText(shareLink)
          .then(() => {
            copiedSpan.style.display = 'inline';
            setTimeout(() => { copiedSpan.style.display = 'none'; }, 2000);
          })
          .catch(err => console.error('Ошибка копирования', err));
      });

      li.appendChild(shareIcon);
      li.appendChild(copiedSpan);
    }

    // Если станция находится в избранном – добавляем иконку сердца
    if (isFavorite(station)) {
      const favHeart = document.createElement('img');
      favHeart.classList.add('favorite-heart', 'active');
      favHeart.src = "/img/heart.svg";
      favHeart.alt = "Favorite";
      favHeart.loading = 'lazy';
      favHeart.addEventListener('click', (event) => {
        event.stopPropagation();
        removeFavorite(station);
        renderPlaylist(playlistElement, stations);
      });
      li.appendChild(favHeart);
    }

    fragment.appendChild(li);
  });

  playlistElement.appendChild(fragment);
}

// Функции для работы с избранным через localStorage
function getFavorites() {
  return JSON.parse(localStorage.getItem('favorites') || '[]');
}

function saveFavorites(favs) {
  localStorage.setItem('favorites', JSON.stringify(favs));
}

function isFavorite(station) {
  const favs = getFavorites();
  return favs.includes(station.url);
}

function addFavorite(station) {
  let favs = getFavorites();
  if (!favs.includes(station.url)) {
    favs.push(station.url);
    saveFavorites(favs);
  }
}

function removeFavorite(station) {
  let favs = getFavorites();
  if (favs.includes(station.url)) {
    favs = favs.filter(url => url !== station.url);
    saveFavorites(favs);
  }
}

// Загрузка плейлиста (.m3u)
export function loadPlaylist(url) {
  return fetch(url)
    .then(response => response.text())
    .then(text => {
      const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');
      let loadedStations = [];

      if (lines[0] === '#EXTM3U') {
        lines.shift();
      }

      for (let i = 0; i < lines.length; i += 2) {
        const infoLine = lines[i];
        const streamUrl = lines[i + 1];

        let cover = null;
        const logoMatch = infoLine.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) cover = logoMatch[1];

        let infoText = "";
        const commaIndex = infoLine.indexOf(',');
        if (commaIndex !== -1) {
          infoText = infoLine.substring(commaIndex + 1).trim();
        }

        let title = "Stream Unavailable";
        let bitrate = "";
        if (infoText) {
          const parts = infoText.split(" - ");
          if (parts.length >= 2) {
            title = parts[0].trim();
            bitrate = parts.slice(1).join(" - ").trim();
          } else {
            title = infoText;
          }
        }

        loadedStations.push({
          title,
          bitrate,
          url: streamUrl,
          cover
        });
      }

      // Фильтруем скрытые станции (те, URL которых сохранены в hiddenStations)
      const hiddenStations = JSON.parse(localStorage.getItem('hiddenStations') || '[]');
      loadedStations = loadedStations.filter(station => !hiddenStations.includes(station.url));

      return Promise.all(
        loadedStations.map(st => {
          return new Promise(resolve => {
            if (!st.cover) {
              resolve();
            } else {
              const img = new Image();
              img.src = st.cover;
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          });
        })
      ).then(() => loadedStations);
    });
}
