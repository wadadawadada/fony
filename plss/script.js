let stations = [];
let originalFileName = '';
let playlistKey = ''; // ключ текущего плейлиста (имя файла)

// Загружаем мапы проигранных станций и текущей станции из localStorage
let playedStationsMap = JSON.parse(localStorage.getItem('playedStationsMap')) || {};
let currentStationMap = JSON.parse(localStorage.getItem('currentStationMap')) || {};

// Массив проигранных станций для текущего плейлиста (будет ссылкой на объект playedStationsMap)
let playedStations = [];

const dropArea = document.getElementById('drop-area');
const playlistEl = document.getElementById('playlist');
const player = document.getElementById('player');
const saveBtn = document.getElementById('save');
const currentStationEl = document.getElementById('current-station');

// Обработчики для drag & drop загрузки M3U-файла
dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.style.backgroundColor = '#eee';
});

dropArea.addEventListener('dragleave', () => {
  dropArea.style.backgroundColor = '';
});

dropArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropArea.style.backgroundColor = '';
  const file = e.dataTransfer.files[0];
  if (!file.name.endsWith('.m3u')) return;

  originalFileName = file.name;
  playlistKey = originalFileName; // используем имя файла как уникальный ключ для плейлиста
  
  // Загружаем ранее сохранённые данные для этого плейлиста, если они есть
  playedStations = playedStationsMap[playlistKey] || [];
  
  const text = await file.text();
  parseM3U(text);
  renderList();
  // После загрузки файла пробуем восстановить текущую станцию
  restoreCurrentStation();
});

// Парсинг M3U-файла
function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  stations = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF')) {
      stations.push({
        title: lines[i].replace('#EXTINF:-1,', ''),
        url: lines[i + 1]
      });
      i++; // пропускаем следующий URL
    }
  }
}

// Отрисовка списка станций
function renderList() {
  playlistEl.innerHTML = '';
  stations.forEach((station, index) => {
    const li = document.createElement('li');
    // Если станция уже проигрывалась для этого плейлиста, добавляем класс для подсветки
    if (playedStations.includes(station.url)) {
      li.classList.add('played');
    }
    const span = document.createElement('span');
    span.textContent = station.title;
    span.onclick = () => {
      playStation(index);
    };

    const del = document.createElement('button');
    del.textContent = '❌';
    del.onclick = () => {
      stations.splice(index, 1);
      // При удалении станции также удаляем её URL из списка проигранных
      playedStations = playedStations.filter(url => url !== station.url);
      playedStationsMap[playlistKey] = playedStations;
      localStorage.setItem('playedStationsMap', JSON.stringify(playedStationsMap));
      
      // Если удалена текущая станция, сбрасываем её
      if (currentStationMap[playlistKey] == station.url) {
        delete currentStationMap[playlistKey];
        localStorage.setItem('currentStationMap', JSON.stringify(currentStationMap));
        displayCurrentStation();
      }
      renderList();
    };

    li.appendChild(span);
    li.appendChild(document.createTextNode(" " + station.url + " "));
    li.appendChild(del);
    playlistEl.appendChild(li);
  });
}

// Функция проигрывания станции
function playStation(index) {
  const station = stations[index];
  player.src = station.url;
  player.play();
  // Сохраняем текущую станцию для данного плейлиста
  currentStationMap[playlistKey] = station.url;
  localStorage.setItem('currentStationMap', JSON.stringify(currentStationMap));
  // Отмечаем станцию как проигранную, если её там ещё нет (используем URL для уникальности)
  if (!playedStations.includes(station.url)) {
    playedStations.push(station.url);
    playedStationsMap[playlistKey] = playedStations;
    localStorage.setItem('playedStationsMap', JSON.stringify(playedStationsMap));
  }
  displayCurrentStation();
  renderList();
}

// Обновление отображения текущей станции
function displayCurrentStation() {
  if (playlistKey && currentStationMap[playlistKey]) {
    // Находим название станции по URL
    const currentUrl = currentStationMap[playlistKey];
    const station = stations.find(s => s.url === currentUrl);
    if (station) {
      currentStationEl.textContent = `Сейчас играет: ${station.title}`;
      return;
    }
  }
  currentStationEl.textContent = 'Станция не выбрана';
}

// Восстановление и автозапуск текущей станции
function restoreCurrentStation() {
  if (playlistKey && currentStationMap[playlistKey]) {
    const currentUrl = currentStationMap[playlistKey];
    const station = stations.find(s => s.url === currentUrl);
    if (station) {
      player.src = station.url;
      player.play();
      displayCurrentStation();
    }
  }
}

// Сохранение изменений в файл M3U с помещением в папку /pls
saveBtn.onclick = () => {
  let content = '#EXTM3U\n';
  stations.forEach(s => {
    content += `#EXTINF:-1,${s.title}\n${s.url}\n`;
  });

  const blob = new Blob([content], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a');
  // Добавляем префикс "pls/" к имени файла
  a.href = URL.createObjectURL(blob);
  a.download = `pls/${originalFileName}`;
  a.click();
};

// При загрузке страницы обновляем отображение текущей станции
window.addEventListener('load', () => {
  displayCurrentStation();
});
