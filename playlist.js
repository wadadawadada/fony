function generateStationHash(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

const style = document.createElement('style');
style.textContent = `
@keyframes heartBounce {
  0% { transform: scale(0); }
  60% { transform: scale(1.2); }
  80% { transform: scale(0.9); }
  100% { transform: scale(1); }
}`;
document.head.appendChild(style);

export function renderPlaylist(playlistElement, stations, startIndex = 0, endIndex = null) {
  if (endIndex === null) {
    endIndex = stations.length;
  }
  playlistElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const maxEnd = Math.min(endIndex, stations.length);
  for (let i = startIndex; i < maxEnd; i++) {
    const station = stations[i];
    const li = document.createElement("li");
    li.style.position = "relative";
    li.style.setProperty("--buffer-percent", "0%");
    li.dataset.index = i;
    
    const progressDiv = document.createElement("div");
    progressDiv.classList.add("progress");
    li.appendChild(progressDiv);
    
    if (station.cover) {
      const icon = document.createElement("img");
      icon.src = station.cover;
      icon.alt = "Station icon";
      icon.classList.add("station-icon");
      icon.loading = "lazy";
      li.appendChild(icon);
    }
    
    const span = document.createElement("span");
    span.textContent = station.title + (station.bitrate ? ` (${station.bitrate})` : "");
    li.appendChild(span);
    
    // Если станция активна (соответствует текущему URL)
    if (window.currentStationUrl && station.url === window.currentStationUrl) {
      li.classList.add("active");
      
      // Добавляем иконку для шаринга (существующий функционал)
      const shareIcon = document.createElement("img");
      shareIcon.src = "/img/share_icon.svg";
      shareIcon.alt = "Share station";
      shareIcon.style.width = "14px";
      shareIcon.style.height = "14px";
      shareIcon.style.cursor = "pointer";
      shareIcon.style.marginLeft = "10px";
      
      const copiedSpan = document.createElement("span");
      copiedSpan.textContent = "copied!";
      copiedSpan.style.color = "#fff";
      copiedSpan.style.marginLeft = "5px";
      copiedSpan.style.display = "none";
      
      shareIcon.addEventListener("click", (event) => {
        event.stopPropagation();
        const hash = generateStationHash(station.url);
        const genre = window.currentGenre || (localStorage.getItem("lastStation") && JSON.parse(localStorage.getItem("lastStation")).genre) || "";
        const longLink = window.location.origin + window.location.pathname + "#" + encodeURIComponent(genre) + "/" + hash;
        fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(longLink))
          .then(response => response.text())
          .then(shortUrl => {
            return navigator.clipboard.writeText(shortUrl).then(() => {
              copiedSpan.style.display = "inline";
              setTimeout(() => { copiedSpan.style.display = "none"; }, 2000);
            });
          })
          .catch(err => console.error("Ошибка копирования", err));
      });
      li.appendChild(shareIcon);
      li.appendChild(copiedSpan);
      
      // Добавляем кнопку удаления с длинным символом тире (эм-деш) и белым цветом
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.style.position = "absolute";
      removeBtn.style.right = "10px";
      removeBtn.style.top = "50%";
      removeBtn.style.transform = "translateY(-50%)";
      removeBtn.style.background = "transparent";
      removeBtn.style.border = "none";
      removeBtn.style.color = "#00F2B8";  // белый цвет
      removeBtn.style.fontSize = "18px"; // немного больше, чем раньше
      removeBtn.style.cursor = "pointer";
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        // Вызываем функцию удаления станции. Предполагается, что функция markStationAsHidden определена глобально.
        if (typeof window.markStationAsHidden === "function") {
          window.markStationAsHidden(parseInt(li.dataset.index, 10));
        } else {
          console.error("Функция удаления станции не определена");
        }
      });
      li.appendChild(removeBtn);
    }
    
    // Если станция является избранной, отображаем иконку сердечка
    if (isFavorite(station)) {
      const favHeart = document.createElement("img");
      favHeart.classList.add("favorite-heart", "active");
      favHeart.src = "/img/heart.svg";
      favHeart.alt = "Favorite";
      favHeart.loading = "lazy";
      favHeart.style.animation = "heartBounce 0.5s ease-out";
      favHeart.addEventListener("click", (event) => {
        event.stopPropagation();
        removeFavorite(station);
        renderPlaylist(playlistElement, stations, startIndex, endIndex);
      });
      li.appendChild(favHeart);
    }
    
    fragment.appendChild(li);
  }
  playlistElement.appendChild(fragment);
}

function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites") || "[]");
}

function saveFavorites(favs) {
  localStorage.setItem("favorites", JSON.stringify(favs));
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

export function loadPlaylist(url) {
  return fetch(url)
    .then(response => response.text())
    .then(text => {
      const lines = text.split("\n").map(line => line.trim()).filter(line => line !== "");
      let loadedStations = [];
      if (lines[0] === "#EXTM3U") {
        lines.shift();
      }
      for (let i = 0; i < lines.length; i += 2) {
        const infoLine = lines[i];
        const streamUrl = lines[i + 1];
        let cover = null;
        const logoMatch = infoLine.match(/tvg-logo="([^"]+)"/);
        if (logoMatch) cover = logoMatch[1];
        let infoText = "";
        const commaIndex = infoLine.indexOf(",");
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
      const hiddenStations = JSON.parse(localStorage.getItem("hiddenStations") || "[]");
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
