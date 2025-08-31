document.addEventListener("DOMContentLoaded", () => {
  const favBtn = document.getElementById("favBtn");
  const playlistElement = document.getElementById("playlist");
  if (!favBtn || !playlistElement) return;

  function getFavorites() {
    return JSON.parse(localStorage.getItem("favorites") || "[]");
  }

  function saveFavorites(favs) {
    localStorage.setItem("favorites", JSON.stringify(favs));
  }

  function updateFavBtnIcon(url) {
    const prefix = localStorage.getItem("theme") === "dark" ? "/img/dark/" : "/img/";
    const favs = getFavorites();
    favBtn.src = favs.some(f => f.url === url) ? prefix + "fav_active.svg" : prefix + "fav.svg";
  }

  function isFavoritesViewActive() {
    const fBtn = document.getElementById("favoritesFilterBtn");
    if (fBtn && fBtn.classList.contains("active")) return true;
    const label = document.querySelector("label[for='playlistSelect']");
    return !!(label && label.textContent.trim() === "Favorites");
  }

  function applyHeartToLiIndex(index) {
    if (isFavoritesViewActive()) return;
    if (isNaN(index)) return;
    if (!window.currentPlaylist || !window.currentPlaylist[index]) return;
    const li = playlistElement.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    const favSlot = li.querySelector(".fav-slot");
    if (!favSlot) return;
    const url = window.currentPlaylist[index].url;
    const favs = getFavorites();
    const isFav = favs.some(f => f.url === url);
    favSlot.innerHTML = "";
    if (isFav) {
      const heart = document.createElement("img");
      heart.classList.add("favorite-heart", "active");
      heart.src = "/img/heart.svg";
      heart.alt = "Favorite";
      heart.loading = "lazy";
      heart.style.width = "18px";
      heart.style.height = "18px";
      heart.style.objectFit = "contain";
      heart.style.cursor = "pointer";
      heart.addEventListener("click", e => {
        e.stopPropagation();
        window.toggleFavorite(url);
      });
      favSlot.appendChild(heart);
    }
  }

  function applyHeartsForAllLis() {
    if (isFavoritesViewActive()) return;
    const lis = playlistElement.querySelectorAll("li[data-index]");
    lis.forEach(li => {
      const index = parseInt(li.dataset.index);
      applyHeartToLiIndex(index);
    });
  }

  function coreToggleFavorite(url) {
    if (!url) return;
    let favs = getFavorites();
    const currentGenre = window.currentGenre || (localStorage.getItem("lastStation") && JSON.parse(localStorage.getItem("lastStation")).genre) || "";
    const idx = favs.findIndex(f => f.url === url);
    if (idx !== -1) {
      favs.splice(idx, 1);
    } else {
      favs.push({ url, genre: currentGenre });
    }
    saveFavorites(favs);
    updateFavBtnIcon(url);
    if (window.currentPlaylist) {
      const i = window.currentPlaylist.findIndex(s => s && s.url === url);
      if (i !== -1) applyHeartToLiIndex(i);
    }
    if (isFavoritesViewActive() && typeof window.usePreloadedFavorites === "function") {
      setTimeout(() => {
        if (window.usePreloadedFavorites()) {
          if (typeof window.resetVisibleStations === "function") window.resetVisibleStations();
        }
      }, 0);
    }
  }

  const prevToggle = window.toggleFavorite;
  window.toggleFavorite = function(url) {
    coreToggleFavorite(url);
    if (typeof prevToggle === "function") prevToggle(url);
    else document.dispatchEvent(new Event("favoritesChanged"));
  };

  if (favBtn) {
    favBtn.addEventListener("click", () => {
      if (!window.currentStationUrl) return;
      window.toggleFavorite(window.currentStationUrl);
    });
  }

  let lastStationUrl = null;

  function updateForStationChange(url) {
    if (!url) return;
    if (url !== lastStationUrl) lastStationUrl = url;
    window.currentStationUrl = url;
    updateFavBtnIcon(url);
    applyHeartsForAllLis();
  }

  document.addEventListener("stationChanged", e => {
    if (e.detail && e.detail.url) updateForStationChange(e.detail.url);
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
  observer.observe(playlistElement, { attributes: true, subtree: true, attributeFilter: ["class"] });

  setInterval(() => {
    if (window.currentStationUrl) updateForStationChange(window.currentStationUrl);
  }, 1000);

  function initFavoritesState() {
    if (window.currentStationUrl) updateFavBtnIcon(window.currentStationUrl);
    applyHeartsForAllLis();
  }

  const plObserver = new MutationObserver(() => {
    if (playlistElement.children.length > 0 && window.currentPlaylist) {
      initFavoritesState();
      plObserver.disconnect();
    }
  });
  plObserver.observe(playlistElement, { childList: true, subtree: true });
  setTimeout(initFavoritesState, 2000);

  document.addEventListener("themeChanged", () => {
    setTimeout(() => {
      const prefix = localStorage.getItem("theme") === "dark" ? "/img/dark/" : "/img/";
      const favs = getFavorites();
      const url = window.currentStationUrl || "";
      favBtn.src = favs.some(f => f.url === url) ? prefix + "fav_active.svg" : prefix + "fav.svg";
    }, 0);
  });
});
