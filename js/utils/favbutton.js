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
    favBtn.src = favs.includes(url) ? prefix + "fav_active.svg" : prefix + "fav.svg";
  }
  function applyHeartToLiIndex(index) {
    if (isNaN(index)) return;
    if (!window.currentPlaylist || !window.currentPlaylist[index]) return;
    const li = playlistElement.querySelector(`li[data-index="${index}"]`);
    if (!li) return;
    const favSlot = li.querySelector(".fav-slot");
    if (!favSlot) return;
    const url = window.currentPlaylist[index].url;
    const favs = getFavorites();
    const isFav = favs.includes(url);
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
        toggleFavorite(url);
      });
      favSlot.appendChild(heart);
    }
  }
  function applyHeartsForAllLis() {
    const lis = playlistElement.querySelectorAll("li[data-index]");
    lis.forEach(li => {
      const index = parseInt(li.dataset.index);
      applyHeartToLiIndex(index);
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
    if (window.currentPlaylist) {
      const idx = window.currentPlaylist.findIndex(s => s && s.url === url);
      if (idx !== -1) applyHeartToLiIndex(idx);
    }
  }

  favBtn.addEventListener("click", () => {
    if (!window.currentStationUrl) return;
    toggleFavorite(window.currentStationUrl);
  });

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
      favBtn.src = favs.includes(url) ? prefix + "fav_active.svg" : prefix + "fav.svg";
    }, 0);
  });
});
