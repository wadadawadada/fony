import { fetchDiscogsTrackInfo } from './discogs.js';

function ensureAlbumCoverBg() {
  const centerCircle = document.querySelector('.center-circle');
  if (!centerCircle) return null;
  let bg = centerCircle.querySelector('.album-cover-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'album-cover-bg';
    const playEllipse = centerCircle.querySelector('.play-ellipse');
    if (playEllipse) {
      centerCircle.insertBefore(bg, playEllipse);
    } else {
      centerCircle.appendChild(bg);
    }
  }
  return bg;
}

function isMobile() {
  return window.innerWidth <= 768;
}

function setAlbumCoverBackground(imageUrl) {
  if (isMobile()) {
    const bg = ensureAlbumCoverBg();
    if (!bg) return;
    bg.style.backgroundImage = '';
    bg.classList.remove('visible');
    return;
  }
  const bg = ensureAlbumCoverBg();
  if (!bg) return;
  if (imageUrl) {
    bg.style.backgroundImage = `url('${imageUrl}')`;
    void bg.offsetWidth; // триггер перерендера
  } else {
    bg.style.backgroundImage = '';
    bg.classList.remove('visible');
  }
}

function updateAlbumCoverAnimation() {
  if (isMobile()) {
    const bg = ensureAlbumCoverBg();
    if (bg) bg.classList.remove('visible');
    return;
  }
  const audioPlayer = document.getElementById('audioPlayer');
  const bg = ensureAlbumCoverBg();
  const chatContainer = document.getElementById('chat');
  if (!audioPlayer || !bg) return;
  const chatIsOpen = chatContainer && window.getComputedStyle(chatContainer).display !== 'none';
  if (!audioPlayer.paused && bg.style.backgroundImage && !chatIsOpen) {
    bg.classList.add('visible');
  } else {
    bg.classList.remove('visible');
  }
}

function getNowPlayingText() {
  const elem = document.querySelector("#currentTrack .scrolling-text");
  return elem ? elem.textContent.trim() : "";
}

function setTextColorRecursively(element, color) {
  element.style.color = color;
  element.querySelectorAll("*").forEach(el => {
    el.style.color = color;
  });
}

function extractCoverFromDiscogsHtml(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const img = tempDiv.querySelector('img');
  if (img && img.src) return img.src;
  return null;
}

export async function showDiscogsInfo() {
  const nowPlaying = getNowPlayingText();

  const discogsContainer = document.getElementById("discogsInfoContainer");
  if (!discogsContainer) return;

  // СБРОС: очищаем текст и скрываем обложку до загрузки новых данных
  discogsContainer.innerHTML = "";
  setAlbumCoverBackground(null);
  updateAlbumCoverAnimation();

  if (!nowPlaying) {
    return; // если нет текста, не запрашиваем
  }

  let artist = "", track = "";
  if (nowPlaying.includes(" - ")) {
    [artist, track] = nowPlaying.split(" - ", 2);
  } else if (nowPlaying.includes(" – ")) {
    [artist, track] = nowPlaying.split(" – ", 2);
  } else {
    track = nowPlaying;
  }
  artist = artist.trim();
  track = track.trim();

  try {
    const infoHtml = await fetchDiscogsTrackInfo(artist, track);

    const coverUrl = extractCoverFromDiscogsHtml(infoHtml);
    setAlbumCoverBackground(coverUrl);
    updateAlbumCoverAnimation();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = infoHtml;

    const text = tempDiv.textContent;

    // Извлечение Album и Year вместе
    const albumYearLineMatch = text.match(/🎵 Album:\s*(.*?)\s*📅 Year:\s*(\d{4})/i);
    let album = "Unknown";
    let year = "Unknown";

    if (albumYearLineMatch) {
      album = albumYearLineMatch[1].trim();
      year = albumYearLineMatch[2].trim();
    } else {
      const albumMatch = text.match(/Album:\s*([^\n]+)/i);
      if (albumMatch) album = albumMatch[1].trim();

      const yearMatch = text.match(/Year:\s*(\d{4})/i);
      if (yearMatch) year = yearMatch[1].trim();
    }

    const countryMatch = text.match(/Country:\s*([^\n]+)/i);
    const labelMatch = text.match(/Label:\s*([^\n]+)/i);
    const genreMatch = text.match(/Genre:\s*([^\n]+)/i);

    const country = countryMatch ? countryMatch[1].trim() : "Unknown";
    const label = labelMatch ? labelMatch[1].trim() : "Unknown";
    const genre = genreMatch ? genreMatch[1].trim() : "Unknown";

    const fields = [album, year, country, label, genre];

    if (fields.some(f => f.toLowerCase() === "unknown")) {
      // Если много unknown, скрываем данные
      setAlbumCoverBackground(null);
      updateAlbumCoverAnimation();
      return;
    }

    const query = encodeURIComponent(`${artist} ${track}`);

    discogsContainer.innerHTML = `
      <div style="text-align: center; max-width: 100%; margin: 0 auto;">
        <div style="display: flex; justify-content: center; gap: 30px; margin-bottom: 8px; font-weight: 600;">
          <div>🎵 Album: ${album}</div>
          <div>📅 Year: ${year}</div>
          <div>🌍 Country: ${country}</div>
        </div>
        <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 12px; font-weight: 600;">
          <div>🏷️ Label: ${label}</div>
          <div>🎶 Genre: ${genre}</div>
        </div>
        <div style="display: flex; justify-content: center; gap: 20px; font-weight: 500; font-size: 0.9rem;">
          <a href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">YouTube</a>
          <a href="https://open.spotify.com/search/${query}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Spotify</a>
          <a href="https://tidal.com/browse/search?q=${query}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Tidal</a>
        </div>
      </div>
    `;

    const color = document.body.classList.contains('dark') ? '#fff' : '#171C2B';
    setTextColorRecursively(discogsContainer, color);

  } catch (e) {
    discogsContainer.innerHTML = `<i>Error loading info: ${e.message}</i>`;
    setAlbumCoverBackground(null);
    updateAlbumCoverAnimation();
  }
}

export function clearDiscogsInfo() {
  const discogsContainer = document.getElementById("discogsInfoContainer");
  if (discogsContainer) {
    discogsContainer.innerHTML = "";
  }
  setAlbumCoverBackground(null);
  updateAlbumCoverAnimation();
}

function setupNowPlayingToggle() {
  const chatContainer = document.getElementById("chat");
  const chatUsernameContainer = document.getElementById("chatUsernameContainer");
  const toggleBtn = document.getElementById("chatToggleBtn");
  if (!chatContainer || !chatUsernameContainer) return;

  let discogsContainer = document.getElementById("discogsInfoContainer");
  if (!discogsContainer) {
    discogsContainer = document.createElement("div");
    discogsContainer.id = "discogsInfoContainer";
    discogsContainer.classList.add("discogs-container");
    discogsContainer.style.display = "none";
    chatContainer.parentNode.insertBefore(discogsContainer, chatContainer.nextSibling);
  }

  chatUsernameContainer.addEventListener("click", async () => {
    chatContainer.style.display = "none";
    discogsContainer.style.display = "block";
    await showDiscogsInfo();
  });

  function showChatAndRemoveDiscogs() {
    chatContainer.style.display = "flex";
    if (discogsContainer.isConnected) {
      discogsContainer.style.display = "none";
      discogsContainer.innerHTML = "";
    }
    clearDiscogsInfo();
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", showChatAndRemoveDiscogs);
  }

  const chatOpenButtons = document.querySelectorAll(".chat-open-button");
  chatOpenButtons.forEach(btn => btn.addEventListener("click", showChatAndRemoveDiscogs));

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === "style" && chatContainer.style.display !== "none") {
        showChatAndRemoveDiscogs();
      }
    });
  });
  observer.observe(chatContainer, { attributes: true });

  document.addEventListener("themeChanged", () => {
    const discogsContainer = document.getElementById("discogsInfoContainer");
    if (discogsContainer) {
      const color = document.body.classList.contains('dark') ? '#fff' : '#171C2B';
      setTextColorRecursively(discogsContainer, color);
    }
  });
}

let lastNowPlaying = "";

function checkNowPlayingChange() {
  const currentText = getNowPlayingText();
  if (currentText && currentText !== lastNowPlaying) {
    lastNowPlaying = currentText;
    showDiscogsInfo();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  setupNowPlayingToggle();

  const audioPlayer = document.getElementById('audioPlayer');
  if (audioPlayer) {
    audioPlayer.addEventListener('play', () => {
      updateAlbumCoverAnimation();
    });
    audioPlayer.addEventListener('pause', () => {
      updateAlbumCoverAnimation();
    });
    updateAlbumCoverAnimation();
  }

  setInterval(checkNowPlayingChange, 5000);
});
