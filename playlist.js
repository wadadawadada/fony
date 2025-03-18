// playlist.js

// Отрисовка списка станций в <ul id="playlist">
export function renderPlaylist(playlistElement, stations) {
  playlistElement.innerHTML = '';

  stations.forEach((station, index) => {
    const li = document.createElement('li');
    // Псевдо-свойство для анимации «буферизации»
    li.style.setProperty('--buffer-percent', '0%');

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

    // При клике вызываем onStationSelect(index)
    li.addEventListener('click', () => {
      if (typeof window.onStationSelect === 'function') {
        window.onStationSelect(index);
      }
    });

    playlistElement.appendChild(li);
  });
}

// Загрузка .m3u (список станций)
export function loadPlaylist(url) {
  return fetch(url)
    .then(response => response.text())
    .then(text => {
      const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');
      let loadedStations = [];

      // Если первая строка #EXTM3U, убираем её
      if (lines[0] === '#EXTM3U') {
        lines.shift();
      }

      // Каждые две строки: 1) #EXTINF... 2) URL
      for (let i = 0; i < lines.length; i += 2) {
        const infoLine = lines[i];
        const streamUrl = lines[i + 1];

        let cover = null;
        const logoMatch = infoLine.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) cover = logoMatch[1];

        // Пробуем выделить «Название - Битрейт»
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

      // Ждём, пока все картинки (cover) загрузятся (или выдадут ошибку)
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
