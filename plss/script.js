let stations = [];
let originalFileName = '';
let playlistKey = '';


let playedStationsMap = JSON.parse(localStorage.getItem('playedStationsMap')) || {};
let currentStationMap = JSON.parse(localStorage.getItem('currentStationMap')) || {};

let playedStations = [];

const dropArea = document.getElementById('drop-area');
const playlistEl = document.getElementById('playlist');
const player = document.getElementById('player');
const saveBtn = document.getElementById('save');
const saveUnfinishedBtn = document.getElementById('saveUnfinished');
const currentStationEl = document.getElementById('current-station');

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
  playlistKey = originalFileName;
  

  playedStations = playedStationsMap[playlistKey] || [];
  
  const text = await file.text();
  parseM3U(text);
  renderList();
  
  restoreCurrentStation();
});


function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  stations = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF')) {
      stations.push({
        title: lines[i].replace('#EXTINF:-1,', ''),
        url: lines[i + 1]
      });
      i++;
    }
  }
}

function renderList() {
  playlistEl.innerHTML = '';
  stations.forEach((station, index) => {
    const li = document.createElement('li');
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
      playedStations = playedStations.filter(url => url !== station.url);
      playedStationsMap[playlistKey] = playedStations;
      localStorage.setItem('playedStationsMap', JSON.stringify(playedStationsMap));
      
      if (currentStationMap[playlistKey] == station.url) {
        delete currentStationMap[playlistKey];
        localStorage.setItem('currentStationMap', JSON.stringify(currentStationMap));
        displayCurrentStation();
      }
      renderList();
    };

    li.appendChild(span);
    li.appendChild(del);
    li.appendChild(document.createTextNode(" " + station.url + " "));
    playlistEl.appendChild(li);
  });
}


function playStation(index) {
  const station = stations[index];
  player.src = station.url;
  player.play();
  currentStationMap[playlistKey] = station.url;
  localStorage.setItem('currentStationMap', JSON.stringify(currentStationMap));
  if (!playedStations.includes(station.url)) {
    playedStations.push(station.url);
    playedStationsMap[playlistKey] = playedStations;
    localStorage.setItem('playedStationsMap', JSON.stringify(playedStationsMap));
  }
  displayCurrentStation();
  renderList();
}

function displayCurrentStation() {
  if (playlistKey && currentStationMap[playlistKey]) {
    const currentUrl = currentStationMap[playlistKey];
    const station = stations.find(s => s.url === currentUrl);
    if (station) {
      currentStationEl.textContent = `Сейчас играет: ${station.title}`;
      return;
    }
  }
  currentStationEl.textContent = 'Станция не выбрана';
}

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

saveBtn.onclick = () => {
  let content = '#EXTM3U\n';
  stations.forEach(s => {
    content += `#EXTINF:-1,${s.title}\n${s.url}\n`;
  });

  const blob = new Blob([content], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = originalFileName;
  a.click();
};

saveUnfinishedBtn.onclick = () => {
  let content = '#EXTM3U\n';
  stations.forEach(s => {
    if (playedStations.includes(s.url)) {
      content += `#EXTINF:-1,${s.title}\n${s.url}\n`;
    }
  });

  const blob = new Blob([content], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `unfinished_${originalFileName}`;
  a.click();
};

window.addEventListener('load', () => {
  displayCurrentStation();
});
