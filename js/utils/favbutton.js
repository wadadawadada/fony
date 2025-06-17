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
  // function updatePlaylistHearts() {
  //   const favs = getFavorites();
  //   const lis = playlistElement.querySelectorAll("li");
  //   lis.forEach(li => {
  //     const index = parseInt(li.dataset.index);
  //     if (isNaN(index)) return;
  //     if (!window.currentPlaylist || !window.currentPlaylist[index]) return;
  //     const station = window.currentPlaylist[index];
  //     let heart = li.querySelector("img.favorite-heart");
  //     const isFav = favs.includes(station.url);
  //     if (isFav && !heart) {
  //       heart = document.createElement("img");
  //       heart.classList.add("favorite-heart", "active");
  //       heart.src = "/img/heart.svg";
  //       heart.alt = "Favorite";
  //       heart.loading = "lazy";
  //       heart.style.animation = "heartBounce 0.5s ease-out";
  //       heart.style.cursor = "pointer";
  //       heart.addEventListener("click", e => {
  //         e.stopPropagation();
  //         toggleFavorite(station.url);
  //       });
  //       li.appendChild(heart);
  //     }
  //     if (!isFav && heart) {
  //       heart.remove();
  //     }
  //   });
  // }

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
  function initFavoritesState() {
    if (window.currentStationUrl) {
      updateFavBtnIcon(window.currentStationUrl);
    }
    updatePlaylistHearts();
  }
  const plObserver = new MutationObserver(() => {
    if (playlistElement.children.length > 0 && window.currentPlaylist && window.currentStationUrl) {
      initFavoritesState();
      plObserver.disconnect();
    }
  });
  plObserver.observe(playlistElement, { childList: true, subtree: true });
  setTimeout(initFavoritesState, 2000);

  document.addEventListener("themeChanged", () => {
    setTimeout(() => {
      if (!favBtn) return;
      const prefix = localStorage.getItem("theme") === "dark" ? "/img/dark/" : "/img/";
      const favs = getFavorites();
      const url = window.currentStationUrl || "";
      favBtn.src = favs.includes(url) ? prefix + "fav_active.svg" : prefix + "fav.svg";
    }, 0);
  });
});
