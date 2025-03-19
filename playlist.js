// playlist.js

// Отрисовка списка станций в <ul id="playlist">
// Если window.currentStationUrl совпадает с URL станции, добавляется класс active,
// чтобы фон активного элемента сохранялся.
export function renderPlaylist(playlistElement, stations) {
  playlistElement.innerHTML = '';

  stations.forEach((station, index) => {
    const li = document.createElement('li');
    li.style.position = "relative";
    li.style.setProperty('--buffer-percent', '0%');

    // Если эта станция является текущей, добавляем класс active
    if (window.currentStationUrl && station.url === window.currentStationUrl) {
      li.classList.add('active');
    }

    // Полоса прогресса (визуал буферизации)
    const progressDiv = document.createElement('div');
    progressDiv.classList.add('progress');
    li.appendChild(progressDiv);

    // Если есть обложка (logo)
    if (station.cover) {
      const icon = document.createElement('img');
      icon.src = station.cover;
      icon.alt = "Station icon";
      icon.classList.add('station-icon');
      li.appendChild(icon);
    }

    // Текст с названием станции + битрейт
    const span = document.createElement('span');
    span.textContent = station.title + (station.bitrate ? ` (${station.bitrate})` : '');
    li.appendChild(span);

    // Если станция находится в избранном, добавляем иконку сердечка по правому краю
    if (isFavorite(station)) {
      const favHeart = document.createElement('img');
      favHeart.classList.add('favorite-heart', 'active');
      favHeart.src = "/img/heart.svg";
      favHeart.alt = "Favorite";
      // При клике по иконке удаляем станцию из избранного и перерисовываем плейлист
      favHeart.addEventListener('click', (event) => {
        event.stopPropagation();
        removeFavorite(station);
        renderPlaylist(playlistElement, stations);
      });
      li.appendChild(favHeart);
    }

    // При клике по элементу выбирается станция
    li.addEventListener('click', () => {
      if (typeof window.onStationSelect === 'function') {
        window.onStationSelect(index);
      }
    });

    playlistElement.appendChild(li);
  });
}

// Вспомогательные функции для работы с избранным через localStorage
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

// Загрузка .m3u (список станций)
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
