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

// Genre colors for light theme - muted warm and cool tones
const GENRE_COLORS_LIGHT = {
  "African": "#D4A574",
  "Alternative": "#0093FF",
  "Asian": "#00E5FF",
  "Balkans": "#C17A6B",
  "Blues": "#4A90E2",
  "Caribbean": "#D4A76A",
  "Chillout": "#7B9FB5",
  "China": "#E8B17D",
  "Chiptune": "#A8D68B",
  "Classical": "#00AA8B",
  "Downtempo": "#6DB584",
  "Drum & Bass": "#D98B6B",
  "Dub": "#7DA3C7",
  "Electronic": "#0070CC",
  "Funk": "#D4A055",
  "Goa": "#B5A8E6",
  "Hardcore": "#D97E7E",
  "Hip Hop": "#7B9FB5",
  "House": "#00F2B8",
  "Industrial": "#6B8FA8",
  "Italian": "#D4A574",
  "Japan": "#00D9A3",
  "Jazz": "#D4B574",
  "Jungle": "#8BA56B",
  "Lounge": "#00C197",
  "Meditation": "#6DB584",
  "Metal": "#757A8C",
  "Nature": "#7FB584",
  "New Age": "#B5D4E5",
  "News": "#5B6B8B",
  "Oriental": "#D4B591",
  "Spiritual": "#8BA584",
  "Punk": "#D97E7E",
  "Rap": "#8BA5C7",
  "Reggae": "#7FB584",
  "RnB": "#D4A5B5",
  "Russian": "#D4A574",
  "Southeast Asia": "#00D9A3",
  "Techno": "#A8A8D8",
  "Turk": "#D4A591",
  "World": "#00C197"
};

// Genre colors for dark theme - app theme colors (cyan, blue, green)
const GENRE_COLORS_DARK = {
  "African": "#00F2B8",
  "Alternative": "#0093FF",
  "Asian": "#00E5FF",
  "Balkans": "#1DB584",
  "Blues": "#4A90E2",
  "Caribbean": "#26B56B",
  "Chillout": "#00D1E0",
  "China": "#0080E0",
  "Chiptune": "#3BBE5E",
  "Classical": "#00AA8B",
  "Downtempo": "#1DB584",
  "Drum & Bass": "#0093FF",
  "Dub": "#9B7CFF",
  "Electronic": "#0070CC",
  "Funk": "#26B56B",
  "Goa": "#00E5FF",
  "Hardcore": "#3F51B5",
  "Hip Hop": "#7B9FB5",
  "House": "#00F2B8",
  "Industrial": "#0080E0",
  "Italian": "#00D9A3",
  "Japan": "#00E5FF",
  "Jazz": "#009FB0",
  "Jungle": "#1DB584",
  "Lounge": "#00C197",
  "Meditation": "#1DB584",
  "Metal": "#2A6FBB",
  "Nature": "#26B56B",
  "New Age": "#00E5FF",
  "News": "#3A5FBB",
  "Oriental": "#00D1E0",
  "Spiritual": "#1DB584",
  "Punk": "#3F51B5",
  "Rap": "#00BEC9",
  "Reggae": "#1DB584",
  "RnB": "#00E5FF",
  "Russian": "#0080E0",
  "Southeast Asia": "#00D9A3",
  "Techno": "#3BBE5E",
  "Turk": "#009FB0",
  "World": "#00C197"
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
  const isDarkTheme = document.body.classList.contains('dark');
  const colors = isDarkTheme ? GENRE_COLORS_DARK : GENRE_COLORS_LIGHT;
  return colors[genre] || "#00F2B8";
}

function updateFavoriteRowColors() {
  const draggableItems = document.querySelectorAll(".draggable-favorite");
  draggableItems.forEach(item => {
    const stationUrl = item.dataset.stationUrl;
    if (stationUrl && window.currentPlaylist) {
      const station = window.currentPlaylist.find(s => s.url === stationUrl);
      if (station) {
        const genre = station.favGenre || station.genre || "World";
        const color = getGenreColor(genre);
        item.style.backgroundColor = color;
      }
    }
  });
}

// Listen for theme changes and update colors
const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      if (mutation.target === document.body) {
        updateFavoriteRowColors();
      }
    }
  });
});

// Start observing when DOM is ready
if (document.body) {
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
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
    li.dataset.stationUrl = station.url;
    li.classList.add(window.currentMode === "web3" ? "web3-mode" : "radio-mode");
    if (isFavoritesMode) {
      li.draggable = true;
      li.classList.add("draggable-favorite");
    }
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
      // In favorites mode, show dark avatar with genre emoji
      const genre = station.favGenre || station.genre || "World";
      const color = getGenreColor(genre);
      const emoji = getGenreEmoji(genre);

      // Set background color of the list item to genre color
      li.style.backgroundColor = color;

      const iconContainer = document.createElement("div");
      iconContainer.classList.add("station-favorite-icon");
      iconContainer.style.display = "inline-flex";
      iconContainer.style.alignItems = "center";
      iconContainer.style.marginRight = "12px";

      // Dark avatar with emoji inside
      const avatar = document.createElement("div");
      avatar.classList.add("station-avatar");
      avatar.style.width = "32px";
      avatar.style.height = "32px";
      avatar.style.borderRadius = "50%";
      avatar.style.backgroundColor = "#171C2B";
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.flexShrink = "0";
      avatar.style.position = "relative";

      // Add emoji inside circle
      const emojiElement = document.createElement("div");
      emojiElement.textContent = emoji;
      emojiElement.style.fontSize = "18px";
      avatar.appendChild(emojiElement);

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

  // Add drag-and-drop functionality for favorites
  if (isFavoritesMode) {
    let draggedElement = null;
    const draggableItems = playlistElement.querySelectorAll(".draggable-favorite");

    draggableItems.forEach(item => {
      item.addEventListener("dragstart", (e) => {
        draggedElement = item;
        item.style.opacity = "0.5";
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        if (item !== draggedElement) {
          item.style.borderTop = "2px solid #00F2B8";
        }
      });

      item.addEventListener("dragleave", (e) => {
        item.style.borderTop = "";
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.style.borderTop = "";

        if (item !== draggedElement) {
          // Reorder in DOM
          if (draggedElement.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) {
            item.parentNode.insertBefore(draggedElement, item);
          } else {
            item.parentNode.insertBefore(draggedElement, item.nextSibling);
          }

          // Update favorites order in localStorage
          const favs = getFavorites();
          const draggedUrl = draggedElement.dataset.stationUrl;
          const targetUrl = item.dataset.stationUrl;

          const draggedFav = favs.find(f => f.url === draggedUrl);
          const draggedIndex = favs.findIndex(f => f.url === draggedUrl);
          const targetIndex = favs.findIndex(f => f.url === targetUrl);

          if (draggedIndex !== -1 && targetIndex !== -1) {
            favs.splice(draggedIndex, 1);
            favs.splice(targetIndex, 0, draggedFav);
            saveFavorites(favs);

            // Update indices for all items after reordering
            const allItems = playlistElement.querySelectorAll(".draggable-favorite");
            allItems.forEach((item, idx) => {
              item.dataset.index = idx;
            });
          }
        }
      });

      item.addEventListener("dragend", (e) => {
        draggedElement.style.opacity = "1";
        draggedElement.style.borderTop = "";
        draggableItems.forEach(i => i.style.borderTop = "");
      });
    });

    // Ensure colors are set correctly for current theme
    updateFavoriteRowColors();
  }
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
      // In favorites mode, update the avatar icon with genre emoji
      const existingIcon = li.querySelector(".station-favorite-icon");
      if (existingIcon) {
        existingIcon.remove();
      }

      const genre = station.favGenre || station.genre || "World";
      const color = getGenreColor(genre);
      const emoji = getGenreEmoji(genre);

      // Set background color of the list item to genre color
      li.style.backgroundColor = color;

      const iconContainer = document.createElement("div");
      iconContainer.classList.add("station-favorite-icon");
      iconContainer.style.display = "inline-flex";
      iconContainer.style.alignItems = "center";
      iconContainer.style.marginRight = "12px";

      // Dark avatar with emoji inside
      const avatar = document.createElement("div");
      avatar.classList.add("station-avatar");
      avatar.style.width = "32px";
      avatar.style.height = "32px";
      avatar.style.borderRadius = "50%";
      avatar.style.backgroundColor = "#171C2B";
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.flexShrink = "0";
      avatar.style.position = "relative";

      // Add emoji inside circle
      const emojiElement = document.createElement("div");
      emojiElement.textContent = emoji;
      emojiElement.style.fontSize = "18px";
      avatar.appendChild(emojiElement);

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
