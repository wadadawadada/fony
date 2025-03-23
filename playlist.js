// playlist.js

// Функция генерации хеш-суммы на основе URL станции.
function generateStationHash(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0; // Приведение к 32-битному целому
  }
  return Math.abs(hash).toString(16);
}

// ----- Вспомогательные переменные/константы для infinite scroll -----
let currentStations = [];
let displayedCount = 0; // сколько станций уже «нарисовано»
let CHUNK_SIZE = 50;    // по сколько станций подгружаем за один раз
let playlistEl = null;  // сам <ul id="playlist">
let scrollContainer = null; // контейнер со скроллом
// --------------------------------------------------------------------

// Эта функция отрисовывает один <li> для заданной станции (ту же логику перенесём из старой renderPlaylist).
function createStationLi(station, index) {
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

  // Показываем иконку "сердечка" или share-иконку, если станция активная/избранная и т.д.
  // У вас в оригинале это было завязано на window.currentStationUrl, isFavorite(...) и т.п.
  // Ниже — так же, как у вас было:
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

    shareIcon.addEventListener('click', (event) => {
      event.stopPropagation();
      const hash = generateStationHash(station.url);
      const genre = window.currentGenre || '';
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

  // Если станция в избранном — добавляем иконку "сердечка"
  if (isFavorite(station)) {
    const favHeart = document.createElement('img');
    favHeart.classList.add('favorite-heart', 'active');
    favHeart.src = "/img/heart.svg";
    favHeart.alt = "Favorite";
    favHeart.loading = 'lazy';
    favHeart.addEventListener('click', (event) => {
      event.stopPropagation();
      removeFavorite(station);
      // Перерисовать элементы по-хорошему нужно, но можно упростить:
      li.remove(); 
      // Или сделать полную перерисовку if нужно:
      // renderPlaylist(playlistEl, scrollContainer, currentStations)
    });
    li.appendChild(favHeart);
  }

  return li;
}

// Функция, которая будет вызываться при скролле, чтобы проверить,
// не пора ли подгрузить следующий кусок.
function onScroll() {
  if (!scrollContainer) return;

  const threshold = 100; // запас в пикселях до конца

  // Сколько осталось до низа?
  const pxToBottom = scrollContainer.scrollHeight
    - scrollContainer.scrollTop
    - scrollContainer.clientHeight;

  if (pxToBottom < threshold) {
    loadMoreStations();
  }
}

// Подгружает ещё кусок станций, если они остались
function loadMoreStations() {
  if (!playlistEl || !currentStations.length) return;

  if (displayedCount >= currentStations.length) {
    // Все уже отрендерено
    return;
  }

  const fragment = document.createDocumentFragment();
  const endIndex = displayedCount + CHUNK_SIZE;

  for (let i = displayedCount; i < endIndex && i < currentStations.length; i++) {
    const station = currentStations[i];
    const li = createStationLi(station, i);
    fragment.appendChild(li);
  }

  playlistEl.appendChild(fragment);
  displayedCount = Math.min(endIndex, currentStations.length);
}

/**
 * Главная функция: очищает список и начинает рендерить новый плейлист
 * постранично (CHUNK_SIZE станций за раз). Добавляет обработчик скролла,
 * чтобы продолжать догружать станции при прокрутке вниз.
 *
 * @param {HTMLElement} playlistElement - ваш <ul id="playlist">
 * @param {HTMLElement} container - элемент, внутри которого идет прокрутка (например, div#playlistContent)
 * @param {Array} stations - массив станций
 */
export function renderPlaylist(playlistElement, container, stations) {
  // Снимем предыдущий обработчик, если был
  container.removeEventListener('scroll', onScroll);

  // Сохраняем в модульные переменные
  playlistEl = playlistElement;
  scrollContainer = container;
  currentStations = stations.slice(); // копия массива
  displayedCount = 0;

  // Очищаем существующие <li>
  playlistEl.innerHTML = '';

  // Сразу рендерим первый кусок
  loadMoreStations();

  // Ставим обработчик на прокрутку
  container.addEventListener('scroll', onScroll);
}

// ===== ФУНКЦИИ ИЗБРАННОГО (без изменений) =====
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

// ===== Загрузка плейлиста (.m3u), тоже без изменений =====
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

      // Фильтруем скрытые станции (если у вас это используется)
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
