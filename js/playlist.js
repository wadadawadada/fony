import { secureUrl } from './parsing.js';

export let USE_ONLY_HTTPS = localStorage.getItem("useOnlyHttps") === "true" ? true : false;
export function updateUseOnlyHttpsSetting(newValue) {
  USE_ONLY_HTTPS = newValue;
}

// Genre to emoji mapping and colors
const GENRE_EMOJI_MAP = {
  "African": "🌍",
  "Alternative": "🎸",
  "Asian": "🏯",
  "Balkans": "🎺",
  "Blues": "🎹",
  "Caribbean": "🏝️",
  "Chillout": "😌",
  "China": "🏮",
  "Chiptune": "🎮",
  "Classical": "🎻",
  "Downtempo": "🍃",
  "Drum & Bass": "🥁",
  "Dub": "🎧",
  "Electronic": "⚡",
  "Funk": "💃",
  "Goa": "🕉️",
  "Hardcore": "🔥",
  "Hip Hop": "🎤",
  "House": "🏠",
  "Industrial": "⚙️",
  "Italian": "🍝",
  "Japan": "🗾",
  "Jazz": "🎷",
  "Jungle": "🐆",
  "Lounge": "🛋️",
  "Meditation": "🧘",
  "Metal": "🤘",
  "Nature": "🌲",
  "New Age": "✨",
  "News": "📢",
  "Oriental": "🎋",
  "Spiritual": "☮️",
  "Punk": "⚡",
  "Rap": "🎙️",
  "Reggae": "🌴",
  "RnB": "💿",
  "Russian": "🪶",
  "Southeast Asia": "🎎",
  "Techno": "🤖",
  "Turk": "🎸",
  "World": "🌐"
};

// Genre to color mapping - darker colors for better text contrast
const GENRE_COLORS = {
  "African": "#C2185B",
  "Alternative": "#00897B",
  "Asian": "#1565C0",
  "Balkans": "#D84315",
  "Blues": "#00695C",
  "Caribbean": "#F57F17",
  "Chillout": "#6A1B9A",
  "China": "#0277BD",
  "Chiptune": "#E65100",
  "Classical": "#00796B",
  "Downtempo": "#2E7D32",
  "Drum & Bass": "#D81B60",
  "Dub": "#512DA8",
  "Electronic": "#1976D2",
  "Funk": "#C2185B",
  "Goa": "#0288D1",
  "Hardcore": "#AD1457",
  "Hip Hop": "#3F51B5",
  "House": "#0097A7",
  "Industrial": "#4527A0",
  "Italian": "#C2185B",
  "Japan": "#1565C0",
  "Jazz": "#F57F17",
  "Jungle": "#6A1B9A",
  "Lounge": "#512DA8",
  "Meditation": "#1B5E20",
  "Metal": "#212121",
  "Nature": "#1B5E20",
  "New Age": "#D81B60",
  "News": "#01579B",
  "Oriental": "#7B1FA2",
  "Spiritual": "#2E7D32",
  "Punk": "#D32F2F",
  "Rap": "#004D40",
  "Reggae": "#1B5E20",
  "RnB": "#C2185B",
  "Russian": "#E65100",
  "Southeast Asia": "#512DA8",
  "Techno": "#00838F",
  "Turk": "#AD1457",
  "World": "#00695C"
};

// App theme colors - cyan, blue, green shades
const AVATAR_COLORS = [
  "#00F2B8", // Cyan (app primary)
  "#00D9A3",
  "#00C197",
  "#00AA8B",
  "#0093FF", // Blue
  "#0080E0",
  "#0070CC",
  "#1E5FFF",
  "#00E5FF", // Light cyan
  "#00D1E0",
  "#00BEC9",
  "#009FB0",
  "#1DB584", // Green
  "#26B56B",
  "#32B865",
  "#3BBE5E",
  "#2A6FBB", // Dark blue
  "#3A5FBB",
  "#4A4FBB",
  "#5A3FBB"
];

function getGenreEmoji(genreName) {
  if (!genreName) return "📻";
  return GENRE_EMOJI_MAP[genreName] || "📻";
}

function generateColorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getStationInitials(stationName) {
  if (!stationName) return "?";
  // Extract first letter of each word, or numbers at the start
  const words = stationName.trim().split(/\s+/);
  let initials = "";

  for (const word of words) {
    if (initials.length >= 3) break;
    const firstChar = word.charAt(0);
    if (firstChar && /[A-Z0-9]/.test(firstChar.toUpperCase())) {
      initials += firstChar.toUpperCase();
    }
  }

  return initials || stationName.charAt(0).toUpperCase();
}

function getGenreColor(genre) {
  return GENRE_COLORS[genre] || "#00F2B8";
}

function generateStationHash(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
export function renderPlaylist(playlistElement, stations, startIndex = 0, endIndex = null) {
  window.currentPlaylist = stations;
  if (endIndex === null) {
    endIndex = stations.length;
  }
  playlistElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const maxEnd = Math.min(endIndex, stations.length);

  let isFavoritesMode = false;
  const genreLabel = document.querySelector("label[for='playlistSelect']");
  if (genreLabel && genreLabel.textContent === "Favorites") isFavoritesMode = true;
  else if (stations.length && stations[0].favGenre) isFavoritesMode = true;

  for (let i = startIndex; i < maxEnd; i++) {
    const station = stations[i];
    const li = document.createElement("li");
    li.style.position = "relative";
    li.style.setProperty("--buffer-percent", "0%");
    li.dataset.index = i;
    li.classList.add(window.currentMode === "web3" ? "web3-mode" : "radio-mode");
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
    const displayName = station.nft ? station.playlistTitle : station.title;
    const span = document.createElement("span");
    span.className = "title-ellipsis";
    span.textContent = displayName + (station.bitrate ? ` (${station.bitrate})` : "");
    li.appendChild(span);
    if (!USE_ONLY_HTTPS && station.originalUrl && station.originalUrl.startsWith("http://")) {
      const httpLabel = document.createElement("span");
      httpLabel.textContent = " http";
      httpLabel.style.color = "rgba(14, 139, 106, 0.5)";
      httpLabel.style.fontSize = "0.9em";
      li.appendChild(httpLabel);
    }
    const favSlot = document.createElement("span");
    favSlot.className = "fav-slot";
    favSlot.style.display = "inline-flex";
    favSlot.style.alignItems = "center";
    favSlot.style.width = "24px";
    favSlot.style.height = "24px";
    favSlot.style.marginLeft = "10px";
    li.appendChild(favSlot);

    if (window.currentStationUrl && station.url === window.currentStationUrl) {
      li.classList.add("active");
      if (typeof currentMode === "undefined" || currentMode !== "web3") {
        const shareWrapper = document.createElement("div");
        shareWrapper.style.display = "inline-flex";
        shareWrapper.style.alignItems = "center";
        shareWrapper.style.marginLeft = "0px";
        const shareIcon = document.createElement("img");
        shareIcon.src = "/img/share_icon.svg";
        shareIcon.alt = "Share station";
        shareIcon.style.width = "14px";
        shareIcon.style.height = "14px";
        shareIcon.style.cursor = "pointer";
        const copiedSpan = document.createElement("span");
        copiedSpan.textContent = "copied!";
        copiedSpan.style.fontSize = "12px";
        copiedSpan.style.color = "#fff";
        copiedSpan.style.marginLeft = "15px";
        copiedSpan.style.display = "none";
        let shareTooltip = null;
        function showShareTooltip() {
          if (shareTooltip) return;
          if (window.innerWidth <= 768) return;
          shareTooltip = document.createElement("div");
          shareTooltip.textContent = "share station";
          shareTooltip.style.position = "absolute";
          shareTooltip.style.fontFamily = "'Ruda', sans-serif";
          shareTooltip.style.fontSize = "12px";
          shareTooltip.style.color = "#fff";
          shareTooltip.style.pointerEvents = "none";
          shareTooltip.style.whiteSpace = "nowrap";
          shareTooltip.style.opacity = "0";
          shareTooltip.style.transition = "opacity 0.2s ease, transform 0.2s ease";
          document.body.appendChild(shareTooltip);
          const rect = shareIcon.getBoundingClientRect();
          const tipRect = shareTooltip.getBoundingClientRect();
          const top = rect.top + (rect.height - tipRect.height) / 2;
          const left = rect.right + 15;
          shareTooltip.style.top = top + "px";
          shareTooltip.style.left = left + "px";
          requestAnimationFrame(() => {
            shareTooltip.style.opacity = "1";
            shareTooltip.style.transform = "translateY(0)";
          });
        }
        function hideShareTooltip() {
          if (shareTooltip) {
            shareTooltip.style.opacity = "0";
            setTimeout(() => {
              if (shareTooltip && shareTooltip.parentNode) {
                shareTooltip.parentNode.removeChild(shareTooltip);
              }
              shareTooltip = null;
            }, 200);
          }
        }
        shareIcon.addEventListener("mouseenter", showShareTooltip);
        shareIcon.addEventListener("mouseleave", hideShareTooltip);
        shareIcon.addEventListener("click", (event) => {
          hideShareTooltip();
          event.stopPropagation();
          let favGenre = station.favGenre;
          if (!favGenre) {
            const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
            const favEntry = favs.find(f => f.url === station.url);
            favGenre = favEntry ? favEntry.genre : (window.currentGenre || "");
          }
          const hash = generateStationHash(station.url);
          const genre = favGenre || (window.currentGenre || "");
          const longLink = window.location.origin + window.location.pathname + "#" + encodeURIComponent(genre) + "/" + hash;
          fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(longLink))
            .then(response => response.text())
            .then(shortUrl => {
              return navigator.clipboard.writeText(shortUrl).then(() => {
                copiedSpan.style.display = "inline";
                setTimeout(() => { copiedSpan.style.display = "none"; }, 2000);
              });
            })
            .catch(() => {});
        });
        shareWrapper.appendChild(shareIcon);
        shareWrapper.appendChild(copiedSpan);
        li.appendChild(shareWrapper);

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "×";
        removeBtn.style.position = "absolute";
        removeBtn.style.right = "10px";
        removeBtn.style.top = "50%";
        removeBtn.style.transform = "translateY(-50%)";
        removeBtn.style.background = "transparent";
        removeBtn.style.border = "none";
        removeBtn.style.color = "#00F2B8";
        removeBtn.style.fontSize = "18px";
        removeBtn.style.cursor = "pointer";
        const titleSpan = span;
        const originalText = titleSpan.textContent;
        removeBtn.addEventListener("mouseenter", () => {
          if (isFavoritesMode) {
            titleSpan.textContent = "Remove from favorites?";
          } else {
            titleSpan.textContent = "Delete station?";
          }
          titleSpan.style.color = "#fff";
          li.style.backgroundColor = "#ff0505ff";
        });
        removeBtn.addEventListener("mouseleave", () => {
          titleSpan.textContent = originalText;
          titleSpan.style.color = "";
          li.style.backgroundColor = "";
        });
        removeBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (isFavoritesMode) {
            const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
            const idx = favs.findIndex(f => f.url === station.url);
            if (idx !== -1) {
              favs.splice(idx, 1);
              localStorage.setItem("favorites", JSON.stringify(favs));
              li.remove();
              if (typeof window.updatePlaylistHearts === "function") window.updatePlaylistHearts();
            }
          } else {
            if (typeof window.markStationAsHidden === "function") {
              window.markStationAsHidden(parseInt(li.dataset.index, 10));
            }
          }
        });
        li.appendChild(removeBtn);
      }
    }
    if (isFavoritesMode) {
      // In favorites mode, show colored avatar icon with initials
      const genre = station.favGenre || station.genre || "World";
      const color = getGenreColor(genre);
      const initials = getStationInitials(station.title);

      const iconContainer = document.createElement("div");
      iconContainer.classList.add("station-favorite-icon");
      iconContainer.style.display = "inline-flex";
      iconContainer.style.alignItems = "center";
      iconContainer.style.marginRight = "12px";

      // Colored avatar with initials
      const avatar = document.createElement("div");
      avatar.classList.add("station-avatar");
      avatar.style.width = "32px";
      avatar.style.height = "32px";
      avatar.style.borderRadius = "50%";
      avatar.style.backgroundColor = color;
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.color = "#fff";
      avatar.style.fontWeight = "bold";
      avatar.style.fontSize = "11px";
      avatar.style.fontFamily = "'Ruda', sans-serif";
      avatar.style.flexShrink = "0";
      avatar.style.position = "relative";

      // Add initials
      const textLayer = document.createElement("div");
      textLayer.textContent = initials;
      textLayer.style.textShadow = "0 0 2px rgba(0,0,0,0.3)";
      avatar.appendChild(textLayer);

      iconContainer.appendChild(avatar);

      // Insert at the beginning of li, before cover icon
      li.insertBefore(iconContainer, li.firstChild);

    } else if (isFavorite(station)) {
      const favHeart = document.createElement("img");
      favHeart.classList.add("favorite-heart", "active");
      favHeart.src = "/img/heart.svg";
      favHeart.alt = "Favorite";
      favHeart.loading = "lazy";
      favHeart.style.animation = "heartBounce 0.5s ease-out";
      favHeart.style.verticalAlign = "middle";
      favHeart.addEventListener("click", (event) => {
        event.stopPropagation();
        removeFavorite(station);
        updatePlaylistHearts();
      });
      favSlot.appendChild(favHeart);
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
  return favs.some(f => f.url === station.url);
}
function removeFavorite(station) {
  let favs = getFavorites();
  favs = favs.filter(f => f.url !== station.url);
  saveFavorites(favs);
}
export function loadPlaylist(url, genreName = null) {
  return fetch(url)
    .then(response => response.text())
    .then(text => {
      const lines = text.split("\n").map(line => line.trim()).filter(line => line !== "");
      let loadedStations = [];
      if (lines[0] === "#EXTM3U") {
        lines.shift();
      }
      for (let i = 0; i < lines.length; i += 2) {
        if (i + 1 >= lines.length) break;
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
          url: secureUrl(streamUrl),
          originalUrl: streamUrl,
          cover,
          genre: genreName
        });
      }
      const hiddenStations = JSON.parse(localStorage.getItem("hiddenStations") || "[]");
      loadedStations = loadedStations.filter(station => !hiddenStations.includes(station.url));
      if (USE_ONLY_HTTPS) {
        loadedStations = loadedStations.filter(station => station.originalUrl.startsWith('https://'));
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

export function updatePlaylistHearts() {
  const favs = getFavorites();
  const playlistElement = document.getElementById("playlist");
  if (!playlistElement || !window.currentPlaylist) return;
  const lis = playlistElement.querySelectorAll("li");

  let isFavoritesMode = false;
  const genreLabel = document.querySelector("label[for='playlistSelect']");
  if (genreLabel && genreLabel.textContent === "Favorites") isFavoritesMode = true;
  else if (window.currentPlaylist.length && window.currentPlaylist[0].favGenre) isFavoritesMode = true;

  lis.forEach(li => {
    const index = parseInt(li.dataset.index);
    if (isNaN(index)) return;
    const station = window.currentPlaylist[index];
    if (!station) return;

    if (isFavoritesMode) {
      // In favorites mode, update the avatar icon with initials
      const existingIcon = li.querySelector(".station-favorite-icon");
      if (existingIcon) {
        existingIcon.remove();
      }

      const genre = station.favGenre || station.genre || "World";
      const color = getGenreColor(genre);
      const initials = getStationInitials(station.title);

      const iconContainer = document.createElement("div");
      iconContainer.classList.add("station-favorite-icon");
      iconContainer.style.display = "inline-flex";
      iconContainer.style.alignItems = "center";
      iconContainer.style.marginRight = "12px";

      const avatar = document.createElement("div");
      avatar.classList.add("station-avatar");
      avatar.style.width = "32px";
      avatar.style.height = "32px";
      avatar.style.borderRadius = "50%";
      avatar.style.backgroundColor = color;
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.color = "#fff";
      avatar.style.fontWeight = "bold";
      avatar.style.fontSize = "11px";
      avatar.style.fontFamily = "'Ruda', sans-serif";
      avatar.style.flexShrink = "0";
      avatar.style.position = "relative";

      // Add initials
      const textLayer = document.createElement("div");
      textLayer.textContent = initials;
      textLayer.style.textShadow = "0 0 2px rgba(0,0,0,0.3)";
      avatar.appendChild(textLayer);

      iconContainer.appendChild(avatar);
      li.insertBefore(iconContainer, li.firstChild);
    } else {
      // In normal mode, update heart icon
      const favSlot = li.querySelector(".fav-slot");
      if (!favSlot) return;
      favSlot.innerHTML = "";
      if (favs.some(f => f.url === station.url)) {
        const favHeart = document.createElement("img");
        favHeart.classList.add("favorite-heart", "active");
        favHeart.src = "/img/heart.svg";
        favHeart.alt = "Favorite";
        favHeart.loading = "lazy";
        favHeart.style.animation = "heartBounce 0.5s ease-out";
        favHeart.style.verticalAlign = "middle";
        favHeart.addEventListener("click", (event) => {
          event.stopPropagation();
          removeFavorite(station);
          updatePlaylistHearts();
        });
        favSlot.appendChild(favHeart);
      }
    }
  });
}

window.updateUseOnlyHttpsSetting = updateUseOnlyHttpsSetting;
window.updatePlaylistHearts = updatePlaylistHearts;
