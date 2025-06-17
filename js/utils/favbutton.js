document.addEventListener("DOMContentLoaded", () => {
  const favBtn = document.getElementById("favBtn");
  const playlistElement = document.getElementById("playlist");
  if (!favBtn || !playlistElement) return;

  function getPrefix() {
    return localStorage.getItem("theme") === "dark" ? "/img/dark/" : "/img/";
  }
  function getFavorites() {
    return JSON.parse(localStorage.getItem("favorites") || "[]");
  }
  function saveFavorites(favs) {
    localStorage.setItem("favorites", JSON.stringify(favs));
  }
  function updateFavBtnIcon(url) {
    const prefix = getPrefix();
    const favs = getFavorites();
    favBtn.src = favs.includes(url) ? prefix + "fav_active.svg" : prefix + "fav.svg";
  }
  function updatePlaylistHearts() {
    const favs = getFavorites();
    const lis = playlistElement.querySelectorAll("li");
    lis.forEach(li => {
      const index = parseInt(li.dataset.index);
      if (isNaN(index)) return;
      if (!window.currentPlaylist || !window.currentPlaylist[index]) return;
      const station = window.currentPlaylist[index];
      let heart = li.querySelector("img.favorite-heart");
      const isFav = favs.includes(station.url);
      if (isFav) {
        if (!heart) {
          heart = document.createElement("img");
          heart.classList.add("favorite-heart", "active");
          heart.src = "/img/heart.svg";
          heart.alt = "Favorite";
          heart.loading = "lazy";
          heart.style.animation = "heartBounce 0.5s ease-out";
          heart.style.cursor = "pointer";
          heart.addEventListener("click", e => {
            e.stopPropagation();
            toggleFavorite(station.url);
          });
          li.appendChild(heart);
        } else {
          heart.classList.add("active");
        }
      } else {
        if (heart) {
          heart.classList.remove("active");
        }
      }
    });
  }
  function toggleFavorite(url) {
    if (!url) return;
    let favs = getFavorites();
    if (favs.includes(url)) {
      favs = favs.filter(u => u !== url);
    } else {
      favs.push(url);
    }
    saveFavorites(favs);
    updateFavBtnIcon(url);
    updatePlaylistHearts();
  }
  favBtn.addEventListener("click", () => {
    if (!window.currentStationUrl) return;
    toggleFavorite(window.currentStationUrl);
  });

  let lastStationUrl = null;

  function updateForStationChange(url) {
    if (url && url !== lastStationUrl) {
      lastStationUrl = url;
      window.currentStationUrl = url;
      updateFavBtnIcon(url);
      updatePlaylistHearts();
    }
  }

  document.addEventListener("stationChanged", e => {
    if (e.detail && e.detail.url) {
      updateForStationChange(e.detail.url);
    }
  });

  const observer = new MutationObserver(() => {
    const activeLi = playlistElement.querySelector("li.active");
    if (!activeLi) return;
    const index = parseInt(activeLi.dataset.index);
    if (isNaN(index)) return;
    if (!window.currentPlaylist || !window.currentPlaylist[index]) return;
    const url = window.currentPlaylist[index].url;
    updateForStationChange(url);
  });
  observer.observe(playlistElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class"],
  });

  setInterval(() => {
    if (window.currentStationUrl) {
      updateForStationChange(window.currentStationUrl);
    }
  }, 1000);

  if (window.currentStationUrl) {
    updateForStationChange(window.currentStationUrl);
  }
  updatePlaylistHearts();
});
