import { fadeAudioOut, fadeAudioIn } from './player.js'
import { renderPlaylist, loadPlaylist } from './playlist.js'
import { initVolumeControl, updatePlayPauseButton, updateShuffleButton } from './controls.js'
import { initChat} from './chat.js'
import { getStreamMetadata, secureUrl } from './parsing.js'
import { initEqualizer } from './equalizer.js'
import { connectWallet, getNFTContractList, connectAndLoadWalletNFTs } from './web3.js'
import { clearDiscogsInfo } from './nowplaying.js';

let currentMode = "radio"
let currentParsingUrl = ""
let appInitialized = false
let allPlaylists = []
let allStations = []
let currentPlaylist = []
let currentTrackIndex = 0
let shuffleActive = false
let visibleStations = 0
let lastValidNowPlaying = ""
const defaultVolume = { value: 0.9 }
const CHUNK_SIZE = 30
const BUFFER_THRESHOLD = 30
let playCheckTimer = null
let preloaderInterval = null
let lastChatUpdate = 0
let lastMetadataUpdate = 0
let userPaused = false;
const chatUpdateInterval = 15000
const metadataUpdateInterval = 20000

const audioPlayer = document.getElementById('audioPlayer')
audioPlayer.volume = defaultVolume.value
audioPlayer.crossOrigin = 'anonymous'

const stationLabel = document.getElementById('stationLabel')
const playlistSelect = document.getElementById('playlistSelect')
const searchInput = document.getElementById('searchInput')
const playlistContainer = document.getElementById('playlistContent')
const playlistElement = document.getElementById('playlist')

const rrBtn = document.getElementById('rrBtn')
const ffBtn = document.getElementById('ffBtn')
const favBtn = document.getElementById('favBtn')
const shuffleBtn = document.getElementById('shuffleBtn')
const randomBtn = document.getElementById('randomBtn')
const walletBtn = document.getElementById('connectWalletBtn')
const radioModeBtn = document.getElementById('radioModeBtn')

function playRandomFromUrlGenre() {
  const pathGenre = (window.location.pathname !== "/" ? window.location.pathname.slice(1) : "") ||
                  (window.location.hash ? window.location.hash.slice(1) : "");
  const isCustomGenre = pathGenre && pathGenre !== "" && pathGenre !== "/";

  if (!isCustomGenre) return false;

  const genreEntry = allPlaylists.find(pl =>
    pl.file.toLowerCase().includes(pathGenre.toLowerCase()) ||
    pl.name.toLowerCase().includes(pathGenre.toLowerCase())
  );

  if (!genreEntry) return false;

  if (playlistSelect) playlistSelect.value = genreEntry.file;
  window.currentGenre = genreEntry.file;
  initChat();
  loadAndRenderPlaylist(genreEntry.file, () => {
    if (currentPlaylist.length) {
      const randomStationIndex = Math.floor(Math.random() * currentPlaylist.length);
      onStationSelect(randomStationIndex);
      localStorage.setItem("lastStation", JSON.stringify({ genre: genreEntry.file, trackIndex: randomStationIndex }));
      updateChat(genreEntry.file);
    }
  });
  setRadioListeners();
  return true;
}


function generateStationHash(url) {
  let h = 0
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h) + url.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(16)
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m + ":" + (s < 10 ? "0" + s : s)
}

function debounce(fn, wait) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

function updateMediaSessionMetadata(st) {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: st.nft ? st.playlistTitle : (st.trackTitle || "Unknown Track"),
      artist: st.artist || "",
      album: "",
      artwork: [{ src: st.cover || "/img/stream_icon.svg", sizes: "96x96", type: "image/svg" }]
    })
  }
}

function cleanupBuffer(sb) {
  if (sb.updating) {
    sb.addEventListener("updateend", function h() {
      sb.removeEventListener("updateend", h)
      cleanupBuffer(sb)
    })
    return
  }
  if (audioPlayer.buffered.length > 0) {
    const c = audioPlayer.currentTime
    const e = c - BUFFER_THRESHOLD
    if (e > 0) {
      try { sb.remove(0, e) } catch (err) {}
    }
  }
}

function startPlaylistPreloader() {
  if (preloaderInterval) {
    clearInterval(preloaderInterval);
    preloaderInterval = null;
  }
  playlistLoader.classList.remove("hidden");
  playlistLoader.style.animation = "none";
  playlistLoader.style.color = "#fff";
  playlistLoader.style.fontSize = "22px";
  playlistLoader.style.fontFamily = "Ruda";
  playlistLoader.style.textAlign = "center";
  playlistLoader.style.whiteSpace = "nowrap";
  playlistLoader.innerHTML =
    '<span id="leftColons" style="display: inline-block; min-width: 3ch; text-align: right;"></span>' +
    '<span id="loaderText" style="display: inline-block; margin: 0 10px;">IPFS load</span>' +
    '<span id="rightColons" style="display: inline-block; min-width: 3ch; text-align: left;"></span>';
  let colonCount = 0;
  const maxColons = 3;
  preloaderInterval = setInterval(() => {
    colonCount = (colonCount + 1) % (maxColons + 1);
    document.getElementById("leftColons").textContent = ":".repeat(colonCount);
    document.getElementById("rightColons").textContent = ":".repeat(colonCount);
  }, 250);
}

function stopPlaylistPreloader() {
  if (preloaderInterval) clearInterval(preloaderInterval)
  preloaderInterval = null
  playlistLoader.classList.add("hidden")
  playlistLoader.textContent = ""
}

function ensureVisible(i) {
  if (i >= visibleStations) {
    visibleStations = i + CHUNK_SIZE
    if (visibleStations > currentPlaylist.length) visibleStations = currentPlaylist.length
    renderPlaylist(playlistElement, currentPlaylist, 0, visibleStations)
  }
}

function resetVisibleStations() {
  visibleStations = 0
  renderMoreStations()
}

function renderMoreStations() {
  if (visibleStations < currentPlaylist.length) {
    visibleStations += CHUNK_SIZE
    renderPlaylist(playlistElement, currentPlaylist, 0, visibleStations)
  }
}

function checkMarquee(container) {
  if (!container) return
  const st = container.querySelector(".scrolling-text")
  if (!st) return
  st.classList.remove("marquee")
  const cW = container.clientWidth
  const sW = st.scrollWidth
  if (sW > cW) st.classList.add("marquee")
}

function fillPlaylistSelect() {
  const pSel = document.getElementById("playlistSelect")
  if (!pSel) return
  pSel.innerHTML = ""
  allPlaylists.forEach(pl => {
    const o = document.createElement("option")
    o.value = pl.file
    o.textContent = pl.name
    pSel.appendChild(o)
  })
}

function switchToRadio() {
  currentMode = "radio";
  window.currentMode = currentMode;
  if (window.playTimerInterval) {
    clearInterval(window.playTimerInterval);
    window.playTimerInterval = null;
  }
  const playTimerElem = document.getElementById("playTimer");
  if (playTimerElem) {
    playTimerElem.textContent = formatTime(0);
  }
  audioPlayer.pause();
  audioPlayer.src = "";
  audioPlayer.currentTime = 0;
  audioPlayer.ontimeupdate = null;
  currentPlaylist = [];
  playlistElement.innerHTML = "";
  const g = document.querySelector(".genre-box");
  if (g) {
    g.innerHTML = `
      <img src="/img/fav_list.svg" id="favoritesFilterBtn" class="favorites-filter-icon">
      <label for="playlistSelect">Genre:</label>
      <select id="playlistSelect" class="genre-select"></select>
      <input type="text" id="searchInput" class="genre-search" placeholder="Search in genre">
      <img src="/img/wallet.svg" alt="Connect Wallet" id="connectWalletBtn" style="cursor: pointer; width: 28px; height: 28px;">
      <img src="/img/radio.svg" alt="Radio Mode" id="radioModeBtn" style="cursor: pointer; width: 28px; height: 28px; display: none;">
    `;
  }
  fillPlaylistSelect();
  setRadioListeners();
  const ls = localStorage.getItem("lastStation");
  if (ls) {
    try {
      const { genre, trackIndex } = JSON.parse(ls);
      const pSel = document.getElementById("playlistSelect");
      if (pSel) pSel.value = genre;
      initChat();
      loadAndRenderPlaylist(genre, () => {
        const i = trackIndex < currentPlaylist.length ? trackIndex : 0;
        onStationSelect(i);
        updateChat(genre);
      });
      return;
    } catch (e) {}
  }
  defaultPlaylist();
}

function switchToWeb3(acc) {
  currentMode = "web3"
  window.currentMode = currentMode;
  audioPlayer.pause()
  audioPlayer.src = ""
  currentPlaylist = []
  playlistElement.innerHTML = ""
  updateWalletUI(acc).then(() => {
    const cs = document.getElementById("contractSelect")
    if (cs) {
      cs.addEventListener("change", async () => {
        playlistElement.innerHTML = ""
        startPlaylistPreloader()
        try {
          const sel = cs.value
          const { tracks } = await connectAndLoadWalletNFTs(sel)
          if (tracks && tracks.length > 0) {
            currentPlaylist = tracks
            visibleStations = tracks.length
            renderPlaylist(playlistElement, tracks, 0, tracks.length)
            onStationSelect(0)
          } else {
            currentPlaylist = []
            renderPlaylist(playlistElement, [], 0, 0)
            stationLabel.textContent = "No NFT tracks found"
          }
        } finally {
          stopPlaylistPreloader()
        }
      })
      playlistElement.innerHTML = ""
      startPlaylistPreloader()
      const sel = cs.value
      connectAndLoadWalletNFTs(sel).then(({ tracks }) => {
        if (tracks && tracks.length > 0) {
          currentPlaylist = tracks
          visibleStations = tracks.length
          renderPlaylist(playlistElement, tracks, 0, tracks.length)
          onStationSelect(0)
        } else {
          currentPlaylist = []
          renderPlaylist(playlistElement, [], 0, 0)
          stationLabel.textContent = "No NFT tracks found"
        }
      }).finally(() => stopPlaylistPreloader())
    }
  })
}

async function updateWalletUI(account) {
  const c = await getNFTContractList()
  const g = document.querySelector(".genre-box")
  if (g) {
    const ops = c.map(x => `<option value="${x.address}">${x.collectionName}</option>`).join("")
    const shortAddr = account.slice(0, 2) + "..." + account.slice(-2)
    g.innerHTML = `
      <span id="walletConnectedLabel">WEB3: </span>
      <select id="contractSelect" class="genre-select">${ops}</select>
      <span id="walletAddress">${shortAddr}</span>
      <img src="/img/wallet.svg" alt="Wallet" id="walletIcon" style="cursor: pointer; width: 28px; height: 28px;">
      <img src="/img/radio.svg" alt="Radio" id="radioModeBtn" style="cursor: pointer; width: 28px; height: 28px;">
    `
  }
  const r = document.getElementById("radioModeBtn")
  if (r) {
    r.style.display = "inline-block"
    r.addEventListener("click", () => switchToRadio())
  }
}

function defaultPlaylist() {
  if (!allPlaylists.length) return
  const firstGenre = allPlaylists[0].file
  if (playlistSelect) playlistSelect.value = firstGenre
  window.currentGenre = firstGenre
  initChat()
  loadAndRenderPlaylist(firstGenre, () => {
    if (currentPlaylist.length) {
      const i = 0
      onStationSelect(i)
      localStorage.setItem("lastStation", JSON.stringify({ genre: firstGenre, trackIndex: i }))
      updateChat(firstGenre)
    }
  })
}

function loadAndRenderPlaylist(url, cb, scTop = false) {
  playlistLoader.classList.remove("hidden")
  loadPlaylist(url)
    .then(s => {
      allStations = s
      currentPlaylist = s.slice()
      resetVisibleStations()
      if (scTop) setTimeout(() => playlistContainer.scrollTo({ top: 0, behavior: "smooth" }), 50)
    })
    .then(() => {
      playlistLoader.classList.add("hidden")
      if (typeof cb === "function") cb()
    })
    .catch(() => {
      playlistLoader.classList.add("hidden")
    })
}

function markStationAsHidden(i) {
  const st = currentPlaylist[i]
  if (!st) return
  let h = JSON.parse(localStorage.getItem("hiddenStations") || "[]")
  if (!h.includes(st.url)) {
    h.push(st.url)
    localStorage.setItem("hiddenStations", JSON.stringify(h))
  }
  allStations = allStations.filter(x => x.url !== st.url)
  currentPlaylist.splice(i, 1)
  resetVisibleStations()
  const n = i < currentPlaylist.length ? i : 0
  if (currentPlaylist.length) onStationSelect(n)
  else if (stationLabel) stationLabel.textContent = "No available stations"
}

window.markStationAsHidden = markStationAsHidden

function checkRealBuffering(durationMs, li, cb) {
  if (!li) {
    cb()
    return
  }
  const p = document.getElementById("playTimer")
  let progress = 0
  const step = 100
  const maxSteps = durationMs / step
  let currentStep = 0
  li.style.setProperty("--buffer-percent", "0%")
  if (p) p.textContent = ""
  const intervalId = setInterval(() => {
    currentStep++
    progress = Math.min((currentStep / maxSteps) * 100, 100)
    if (p) p.textContent = ":".repeat(Math.floor(progress / 10))
    li.style.setProperty("--buffer-percent", progress + "%")
    if (currentStep >= maxSteps) {
      clearInterval(intervalId)
      if (p) p.textContent = formatTime(0)
      cb()
    }
  }, step)
}

function updateStreamMetadata(u) {
  if (u !== currentParsingUrl) return
  const rg = document.querySelector(".right-group")
  if (!rg) return
  rg.style.display = "flex"
  const t = new Promise(r => setTimeout(() => r(null), 15000))
  const p = getStreamMetadata(u)
  Promise.race([p, t]).then(r => {
    if (u !== currentParsingUrl) return
    if (r && r.trim() && r !== "No Metadata" && r !== "No Track Data") {
      lastValidNowPlaying = r.trim()
      const su = "https://www.google.com/search?q=" + encodeURIComponent(lastValidNowPlaying)
      rg.innerHTML = `
        <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
        <span id="currentTrack" class="track-name">
          <a href="${su}" target="_blank" rel="noopener noreferrer" class="scrolling-text">${lastValidNowPlaying}</a>
        </span>
      `
      setTimeout(() => checkMarquee(rg), 20000)
    } else {
      if (!lastValidNowPlaying) {
        rg.innerHTML = `
          <img src="/img/news_icon.svg" alt="Info Icon" class="track-icon">
          <span id="currentTrack" class="track-name">
            <span class="scrolling-text">No Data</span>
          </span>
        `
        setTimeout(() => checkMarquee(rg), 3000)
      }
    }
  })
}

function onStationSelect(i) {
  clearDiscogsInfo();
  currentParsingUrl = ""
  ensureVisible(i)
  const st = currentPlaylist[i]
  if (!st) return
  window.currentStationUrl = st.url
  renderPlaylist(playlistElement, currentPlaylist, 0, visibleStations)
  const lis = document.querySelectorAll("#playlist li")
  lis.forEach(x => {
    x.classList.remove("active")
    x.style.setProperty("--buffer-percent", "0%")
  })
  const li = Array.from(lis).find(x => parseInt(x.dataset.index) === i)
  currentTrackIndex = i
  currentParsingUrl = st.originalUrl || st.url;
  if (playlistSelect) {
    localStorage.setItem("lastStation", JSON.stringify({ genre: playlistSelect.value, trackIndex: i }))
    window.currentGenre = playlistSelect.value
  }
  if (stationLabel) {
    const t = stationLabel.querySelector(".scrolling-text")
    if (t) t.textContent = st.nft ? st.title : (st.title || "Unknown Station")
    checkMarquee(stationLabel)
  }
  const rg = document.querySelector(".right-group")
  if (rg) {
    if (st.nft) {
      rg.innerHTML = `
        <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
        <span id="currentTrack" class="track-name">
          <span class="scrolling-text">${st.playlistTitle}</span>
        </span>
      `
      checkMarquee(rg)
    } else {
      rg.innerHTML = `
        <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
        <span id="currentTrack" class="track-name">
          <span class="scrolling-text loading"></span>
        </span>
      `
      checkMarquee(rg)
    }
  }
  if (!st.url) return
  if (st.nft) {
    audioPlayer.src = secureUrl(st.url)
    audioPlayer.onloadedmetadata = () => {
      const el = document.getElementById("playTimer")
      if (el && audioPlayer.duration) {
        el.textContent = formatTime(Math.floor(audioPlayer.duration - audioPlayer.currentTime))
      }
    }
    audioPlayer.ontimeupdate = () => {
      const el = document.getElementById("playTimer")
      if (el && audioPlayer.duration) {
        const remaining = Math.floor(audioPlayer.duration - audioPlayer.currentTime)
        el.textContent = formatTime(remaining)
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100
        if (li) li.style.setProperty("--buffer-percent", percent + "%")
      }
    }
    if (li) li.scrollIntoView({ behavior: "smooth", block: "start" })
    if (window.playTimerInterval) clearInterval(window.playTimerInterval)
    audioPlayer.muted = false
    audioPlayer.volume = defaultVolume.value
    audioPlayer.play().then(() => {
      appInitialized = true
      if (!window.equalizerInitialized) {
        initEqualizer()
        window.equalizerInitialized = true
      }
    }).catch(() => {})
    fadeAudioIn(audioPlayer, defaultVolume.value, 1000)
    updatePlayPauseButton(audioPlayer, playPauseBtn)
    if (playCheckTimer) clearTimeout(playCheckTimer)
    if (appInitialized) {
      playCheckTimer = setTimeout(() => {
        if (audioPlayer.paused) markStationAsHidden(i)
      }, 15000)
    }
    updateMediaSessionMetadata(st)
  } else {
    if (isIOS()) {
      audioPlayer.src = secureUrl(st.url)
      if (li) li.scrollIntoView({ behavior: "smooth", block: "start" })
      if (window.playTimerInterval) clearInterval(window.playTimerInterval)
      const pt = document.getElementById("playTimer")
      if (pt) pt.textContent = formatTime(0)
      if (li) li.classList.add("active")
      audioPlayer.muted = false
      audioPlayer.volume = defaultVolume.value
      audioPlayer.play().then(() => {
        appInitialized = true
        if (!window.equalizerInitialized) {
          initEqualizer()
          window.equalizerInitialized = true
        }
      }).catch(() => {})
      fadeAudioIn(audioPlayer, defaultVolume.value, 1000)
      updatePlayPauseButton(audioPlayer, playPauseBtn)
      if (playCheckTimer) clearTimeout(playCheckTimer)
      if (appInitialized) {
        playCheckTimer = setTimeout(() => {
          if (audioPlayer.paused) markStationAsHidden(i)
        }, 15000)
      }
      if (!st.nft) updateStreamMetadata(st.originalUrl || st.url)
      updateMediaSessionMetadata(st)
    } else {
      audioPlayer.src = secureUrl(st.url)

      if (li) li.scrollIntoView({ behavior: "smooth", block: "start" })
      if (window.playTimerInterval) clearInterval(window.playTimerInterval)

      const pt = document.getElementById("playTimer")
      if (pt) pt.textContent = formatTime(0)

      checkRealBuffering(3000, li, () => {
        if (li) li.classList.add("active")
        if (stationLabel) {
          const t = stationLabel.querySelector(".scrolling-text")
          if (t) t.textContent = st.nft ? st.title : (st.title || "Unknown Station")
          checkMarquee(stationLabel)
        }
      })

      audioPlayer.oncanplay = () => {
        audioPlayer.oncanplay = null
        audioPlayer.muted = false
        audioPlayer.volume = defaultVolume.value
        audioPlayer.play().catch(() => {})
        fadeAudioIn(audioPlayer, defaultVolume.value, 1000)
        updatePlayPauseButton(audioPlayer, playPauseBtn)
        if (!window.equalizerInitialized) {
          initEqualizer()
          window.equalizerInitialized = true
        }
      }

      if (playCheckTimer) clearTimeout(playCheckTimer)
      if (appInitialized) {
        playCheckTimer = setTimeout(() => {
          if (audioPlayer.paused) markStationAsHidden(i)
        }, 15000)
      }

      if (!st.nft) updateStreamMetadata(st.originalUrl || st.url)
      updateMediaSessionMetadata(st)
    }
  }
}

function onGenreChange(randomStation = false) {
  const pSel = document.getElementById("playlistSelect");
  const sIn = document.getElementById("searchInput");
  if (!pSel) return;
  const newGenre = pSel.value;
  loadAndRenderPlaylist(newGenre, () => {
    if (sIn) sIn.value = "";
    if (currentPlaylist.length) {
      let idx = 0;
      if (randomStation) {
        idx = Math.floor(Math.random() * currentPlaylist.length);
      }
      ensureVisible(idx);
      onStationSelect(idx);
      setTimeout(() => {
        const lis = document.querySelectorAll("#playlist li");
        const li = Array.from(lis).find(x => parseInt(x.dataset.index) === idx);
        if (li) {
          li.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
      localStorage.setItem("lastStation", JSON.stringify({ genre: newGenre, trackIndex: idx }));
      updateChat(newGenre);
    }
  }, true);
}

async function createFavoritesPlaylist() {
  const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
  let list = [];
  for (let pl of allPlaylists) {
    const st = await loadPlaylist(pl.file);
    const matched = st.filter(x => favs.some(f => f.url === x.url));
    matched.forEach(x => {
      const favEntry = favs.find(f => f.url === x.url);
      x.favGenre = favEntry ? favEntry.genre : pl.file;
    });
    list = list.concat(matched);
  }
  const uniqueStations = Array.from(new Map(list.map(o => [o.url, o])).values());
  return uniqueStations;
}


function setRadioListeners() {
  const pSel = document.getElementById("playlistSelect");
  const sIn = document.getElementById("searchInput");
  const fBtn = document.getElementById("favoritesFilterBtn");
  const wBtn = document.getElementById("connectWalletBtn");
  const rBtn = document.getElementById("radioModeBtn");

  if (rBtn) rBtn.style.display = "none";

  if (pSel) {
    pSel.addEventListener("change", () => onGenreChange(false));
  }

if (sIn) {
  const clearBtn = document.getElementById("clearSearch");

  function updateClearBtn() {
    if (!clearBtn) return;
    clearBtn.style.display = sIn.value.length > 0 ? "block" : "none";
  }

  sIn.addEventListener("input", debounce(() => {
    const q = sIn.value.toLowerCase();
    currentPlaylist = allStations.filter(x => x.title.toLowerCase().includes(q));
    resetVisibleStations();
    updateClearBtn();
  }, 300));

  sIn.addEventListener("change", updateClearBtn);
  sIn.addEventListener("keyup", updateClearBtn);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      sIn.value = "";
      currentPlaylist = allStations.slice();
      resetVisibleStations();
      updateClearBtn();
    });
  }

  updateClearBtn();
}

  if (fBtn) {
  fBtn.addEventListener("click", async () => {
    if (fBtn.disabled) return;
    fBtn.disabled = true;
    const genreLabel = document.querySelector("label[for='playlistSelect']");
    playlistElement.classList.add("hidden");
    playlistLoader.classList.remove("hidden");
    playlistLoader.style.fontFamily = "Ruda";
    playlistLoader.style.textAlign = "center";
    playlistLoader.style.fontSize = "28px";
    let dotCount = 0;
    const maxDots = 3;
    playlistLoader.textContent = "";
    const interval = setInterval(() => {
      dotCount = (dotCount + 1) % (maxDots + 1);
      const left = ":".repeat(dotCount);
      const right = ":".repeat(dotCount);
      playlistLoader.textContent = left + right;
    }, 300);
    try {
      if (fBtn.classList.contains("active")) {
        fBtn.classList.remove("active");
        if (pSel) pSel.style.display = "";
        if (sIn) sIn.style.display = "";
        if (genreLabel) genreLabel.textContent = "Genre:";
        currentPlaylist = allStations.slice();
        resetVisibleStations();
      } else {
        fBtn.classList.add("active");
        if (pSel) pSel.style.display = "none";
        if (sIn) sIn.style.display = "none";
        if (genreLabel) genreLabel.textContent = "Favorites";
        const favoritesList = await createFavoritesPlaylist();
        currentPlaylist = favoritesList;
        if (!currentPlaylist.length) {
          playlistElement.innerHTML = `<li style="pointer-events:none;opacity:.7">No favorites yet</li>`;
        }
        resetVisibleStations();
      }
    } finally {
      clearInterval(interval);
      playlistLoader.classList.add("hidden");
      playlistLoader.textContent = "";
      playlistLoader.style.fontSize = "";
      playlistElement.classList.remove("hidden");
      fBtn.disabled = false;
    }
  });
}

  if (wBtn) {
    wBtn.addEventListener("click", async () => {
      const acc = await connectWallet();
      switchToWeb3(acc);
    });
  }
}

audioPlayer.addEventListener("play", async () => {
  userPaused = false;
  if (window.audioContext && window.audioContext.state === 'suspended') {
    try {
      await window.audioContext.resume();
      console.log('AudioContext resumed');
    } catch (e) {
      console.warn('Failed to resume AudioContext:', e);
    }
  }

  if (!(currentPlaylist[currentTrackIndex] && currentPlaylist[currentTrackIndex].nft)) {
    updatePlayPauseButton(audioPlayer, playPauseBtn);
    if (playCheckTimer) {
      clearTimeout(playCheckTimer);
      playCheckTimer = null;
    }
    if (window.playTimerInterval) clearInterval(window.playTimerInterval);
    let pt = 0;
    const el = document.getElementById("playTimer");
    if (el) {
      el.textContent = formatTime(pt);
      window.playTimerInterval = setInterval(() => {
        pt++;
        el.textContent = formatTime(pt);
      }, 1000);
    }
  }
});

audioPlayer.addEventListener("ended", () => {
  if (currentMode === "web3") {
    if (currentTrackIndex < currentPlaylist.length - 1) {
      fadeAudioOut(audioPlayer, 500, () => onStationSelect(currentTrackIndex + 1))
    } else {
      fadeAudioOut(audioPlayer, 500, () => onStationSelect(0))
    }
  }
})

audioPlayer.addEventListener("pause", () => {
  updatePlayPauseButton(audioPlayer, playPauseBtn)
  if (window.playTimerInterval) {
    clearInterval(window.playTimerInterval)
    window.playTimerInterval = null
  }
})

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", async () => {
    userPaused = false;
    try { await audioPlayer.play() } catch(e){}
  })
  navigator.mediaSession.setActionHandler("pause", () => {
    userPaused = true;
    audioPlayer.pause()
  })
  navigator.mediaSession.setActionHandler("previoustrack", () => rrBtn.click())
  navigator.mediaSession.setActionHandler("nexttrack", () => ffBtn.click())
}

playlistContainer.addEventListener("scroll", () => {
  const { scrollTop, clientHeight, scrollHeight } = playlistContainer
  if (scrollTop + clientHeight >= scrollHeight - 50) renderMoreStations()
})

playlistElement.addEventListener("click", e => {
  const li = e.target.closest("li")
  if (!li || li.dataset.index === undefined) return
  const index = parseInt(li.dataset.index)
  if (index === currentTrackIndex && currentPlaylist[index].nft && audioPlayer.duration) {
    const rect = li.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newTime = (clickX / rect.width) * audioPlayer.duration
    audioPlayer.currentTime = newTime
  } else {
    onStationSelect(index)
  }
})

if (playPauseBtn) {
  playPauseBtn.addEventListener("click", () => {
    if (audioPlayer.paused) {
      userPaused = false;
      audioPlayer.play().catch(() => {});
    } else {
      userPaused = true;
      audioPlayer.pause();
    }
    updatePlayPauseButton(audioPlayer, playPauseBtn);
  });
}


if (rrBtn) {
  rrBtn.addEventListener("click", () => {
    if (currentTrackIndex > 0) {
      fadeAudioOut(audioPlayer, 500, () => {
        onStationSelect(currentTrackIndex - 1)
      })
    }
  })
}

if (ffBtn) {
  ffBtn.addEventListener("click", () => {
    if (shuffleActive) {
      let r;
      do {
        r = Math.floor(Math.random() * currentPlaylist.length);
      } while (r === currentTrackIndex && currentPlaylist.length > 1);
      fadeAudioOut(audioPlayer, 500, () => onStationSelect(r));
    } else {
      if (currentTrackIndex < currentPlaylist.length - 1) {
        fadeAudioOut(audioPlayer, 500, () => onStationSelect(currentTrackIndex + 1));
      } else {
        fadeAudioOut(audioPlayer, 500, () => onStationSelect(0));
      }
    }
  });
}

// if (favBtn) {
//   favBtn.addEventListener("click", () => {
//     if (!currentPlaylist.length) return
//     const c = currentPlaylist[currentTrackIndex]
//     let fv = JSON.parse(localStorage.getItem("favorites") || "[]")
//     if (!fv.includes(c.url)) {
//       fv.push(c.url)
//       localStorage.setItem("favorites", JSON.stringify(fv))
//     }
//     currentPlaylist = allStations.slice()
//     resetVisibleStations()
//   })
// }

if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    shuffleActive = !shuffleActive
    updateShuffleButton(shuffleActive, shuffleBtn)
  })
}

if (randomBtn) {
  randomBtn.addEventListener("click", () => {
    if (currentMode === "web3") {
      fadeAudioOut(audioPlayer, 500, async () => {
        const contracts = await getNFTContractList();
        if (!contracts.length) return;
        const randomContract = contracts[Math.floor(Math.random() * contracts.length)];
        const cs = document.getElementById("contractSelect");
        if (cs) {
          cs.value = randomContract.address;
          cs.dispatchEvent(new Event("change"));
        }
        const { tracks } = await connectAndLoadWalletNFTs(randomContract.address);
        if (tracks && tracks.length) {
          const ix = Math.floor(Math.random() * tracks.length);
          currentPlaylist = tracks;
          onStationSelect(ix);
        }
      });
    } else {
      fadeAudioOut(audioPlayer, 500, () => {
        if (!allPlaylists.length) return;
        const ri = Math.floor(Math.random() * allPlaylists.length);
        const rg = allPlaylists[ri].file;
        const pSel = document.getElementById("playlistSelect");
        if (pSel) {
          pSel.value = rg;
          onGenreChange(true);
        }
      });
    }
  });
}

if (walletBtn) {
  walletBtn.addEventListener("click", async () => {
    const a = await connectWallet()
    switchToWeb3(a)
  })
}

initVolumeControl(audioPlayer, document.querySelector(".volume-slider"), document.querySelector(".volume-knob"), defaultVolume)

function globalUpdater(ts) {
  if (!lastChatUpdate) lastChatUpdate = ts
  if (!lastMetadataUpdate) lastMetadataUpdate = ts
  if (ts - lastMetadataUpdate >= metadataUpdateInterval) {
    updateStreamMetadata(currentParsingUrl)
    lastMetadataUpdate = ts
  }
  requestAnimationFrame(globalUpdater)
}
requestAnimationFrame(globalUpdater)

function playRandomGenreAndStation() {
  if (!allPlaylists.length) return;
  const randomGenreIndex = Math.floor(Math.random() * allPlaylists.length);
  const randomGenre = allPlaylists[randomGenreIndex].file;
  if (playlistSelect) playlistSelect.value = randomGenre;
  window.currentGenre = randomGenre;
  initChat();
  loadAndRenderPlaylist(randomGenre, () => {
    if (currentPlaylist.length) {
      const randomStationIndex = Math.floor(Math.random() * currentPlaylist.length);
      onStationSelect(randomStationIndex);
      localStorage.setItem("lastStation", JSON.stringify({ genre: randomGenre, trackIndex: randomStationIndex }));
      updateChat(randomGenre);
    }
  });
}

fetch("../json/playlists.json")
  .then(r => r.json())
  .then(pl => {
    allPlaylists = pl;
    if (playlistSelect) {
      playlistSelect.innerHTML = "";
      pl.forEach(x => {
        const o = document.createElement("option");
        o.value = x.file;
        o.textContent = x.name;
        playlistSelect.appendChild(o);
      });
    }

    if (playRandomFromUrlGenre()) {
      return;
    }

    if (window.location.hash) {
      let hg = "";
      let sh = "";
      let hh = false;
      const lh = window.location.hash.slice(1);
      if (lh.includes("/")) {
        const pt = lh.split("/");
        if (pt.length === 2) {
          hg = decodeURIComponent(pt[0]);
          sh = pt[1];
          hh = true;
        }
      }
      if (hh) {
        if (playlistSelect) playlistSelect.value = hg;
        window.currentGenre = hg;
        initChat();
        loadAndRenderPlaylist(hg, () => {
          const fi = currentPlaylist.findIndex(x => generateStationHash(x.url) === sh);
          if (fi !== -1) {
            onStationSelect(fi);
            localStorage.setItem("lastStation", JSON.stringify({ genre: hg, trackIndex: fi }));
            updateChat(hg);
          } else {
            playRandomGenreAndStation();
          }
        });
      }
    } else if (localStorage.getItem("lastStation")) {
      try {
        const { genre, trackIndex } = JSON.parse(localStorage.getItem("lastStation"));
        if (playlistSelect) playlistSelect.value = genre;
        window.currentGenre = genre;
        initChat();
        loadAndRenderPlaylist(genre, () => {
          const si = trackIndex < currentPlaylist.length ? trackIndex : 0;
          onStationSelect(si);
          updateChat(genre);
        });
      } catch(e) {
        playRandomGenreAndStation();
      }
    } else {
      playRandomGenreAndStation();
    }
    setRadioListeners();
  })
  .catch(() => {
    playRandomGenreAndStation();
    setRadioListeners();
  });



document.dispatchEvent(new Event("appLoaded"))

const container = document.querySelector('.container');
const leftPanel = document.querySelector('.left-panel');
const rightPanel = document.querySelector('.right-panel');
const resizer = document.getElementById('resizer');
let isResizing = false;
let startX;
let startLeftWidthPercent;

resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  startX = e.clientX;
  startLeftWidthPercent = (leftPanel.offsetWidth / container.clientWidth) * 100;
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const containerWidth = container.clientWidth;
  const dx = e.clientX - startX;
  const dxPercent = (dx / containerWidth) * 100;
  let newLeftWidthPercent = startLeftWidthPercent + dxPercent;
  if (newLeftWidthPercent < 40) newLeftWidthPercent = 40;
  if (newLeftWidthPercent > 70) newLeftWidthPercent = 70;
  leftPanel.style.width = `${newLeftWidthPercent}%`;
  rightPanel.style.width = `${100 - newLeftWidthPercent}%`;
  resizer.style.left = `calc(${newLeftWidthPercent}% - ${resizer.offsetWidth / 2}px)`;
});

document.addEventListener('mouseup', () => {
  isResizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});


// let radioRetryCount = 0;
// const RADIO_MAX_RETRY = 1; 
// const RADIO_CHECK_INTERVAL = 5000; 
// let lastCurrentTime = 0;
// let noProgressCounter = 0;
// let silenceCounter = 0;

// function resetRetryState() {
//   radioRetryCount = 0;
//   noProgressCounter = 0;
//   silenceCounter = 0;
//   lastCurrentTime = 0;
// }

// function hasSound() {
//   if (!window.equalizerAnalyser) return true;
//   const analyser = window.equalizerAnalyser;
//   const data = new Uint8Array(analyser.frequencyBinCount);
//   analyser.getByteFrequencyData(data);
//   const avg = data.reduce((a, b) => a + b, 0) / data.length;
//   return avg > 2;
// }

// function switchToNextStation() {
//   resetRetryState();
//   let nextIndex = currentTrackIndex + 1;
//   if (nextIndex >= currentPlaylist.length) nextIndex = 0;
//   if (currentPlaylist.length) {
//     onStationSelect(nextIndex);
//   }
// }

// function tryRestartRadio() {
//   if (userPaused) return;
//   if (!audioPlayer.src || !currentPlaylist[currentTrackIndex]) return;

//   if (audioPlayer.paused && audioPlayer.currentTime > 0) {
//     if (radioRetryCount < RADIO_MAX_RETRY) {
//       radioRetryCount++;
//       onStationSelect(currentTrackIndex);
//     } else {
//       switchToNextStation();
//     }
//     return;
//   }

//   if (radioRetryCount < RADIO_MAX_RETRY) {
//     radioRetryCount++;
//     onStationSelect(currentTrackIndex);
//   } else {
//     switchToNextStation();
//   }
// }

// function checkRadioStatus() {
//   if (!audioPlayer.src) return;
//   if (userPaused) return;

//   if (audioPlayer.paused && audioPlayer.currentTime > 0) {
//     noProgressCounter = 0;
//     silenceCounter = 0;
//     tryRestartRadio();
//     return;
//   }

//   if (audioPlayer.currentTime === lastCurrentTime) {
//     noProgressCounter++;
//   } else {
//     noProgressCounter = 0;
//     lastCurrentTime = audioPlayer.currentTime;
//   }

//   if (!audioPlayer.paused && !hasSound()) {
//     silenceCounter++;
//   } else {
//     silenceCounter = 0;
//   }

//   if (noProgressCounter >= 3 || silenceCounter >= 3) {
//     tryRestartRadio();
//     noProgressCounter = 0;
//     silenceCounter = 0;
//   }
// }


// audioPlayer.addEventListener("play", resetRetryState);
// audioPlayer.addEventListener("ended", resetRetryState);
// audioPlayer.addEventListener("error", () => {
//   resetRetryState();
//   switchToNextStation();
// });

// const originalOnStationSelect = window.onStationSelect;
// window.onStationSelect = function(i) {
//   resetRetryState();
//   originalOnStationSelect(i);
// };

// setInterval(checkRadioStatus, RADIO_CHECK_INTERVAL);

////iOS playback fix

function isIOSMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

if (!isIOSMobile()) {
  let radioRetryCount = 0;
  const RADIO_MAX_RETRY = 1;
  const RADIO_CHECK_INTERVAL = 5000;
  let lastCurrentTime = 0;
  let noProgressCounter = 0;
  let silenceCounter = 0;

  function resetRetryState() {
    radioRetryCount = 0;
    noProgressCounter = 0;
    silenceCounter = 0;
    lastCurrentTime = 0;
  }

  function hasSound() {
    if (!window.equalizerAnalyser) return true;
    const analyser = window.equalizerAnalyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    return avg > 2;
  }

  function switchToNextStation() {
    resetRetryState();
    let nextIndex = currentTrackIndex + 1;
    if (nextIndex >= currentPlaylist.length) nextIndex = 0;
    if (currentPlaylist.length) {
      onStationSelect(nextIndex);
    }
  }

  function tryRestartRadio() {
    if (userPaused) return;
    if (!audioPlayer.src || !currentPlaylist[currentTrackIndex]) return;

    if (audioPlayer.paused && audioPlayer.currentTime > 0) {
      if (radioRetryCount < RADIO_MAX_RETRY) {
        radioRetryCount++;
        onStationSelect(currentTrackIndex);
      } else {
        switchToNextStation();
      }
      return;
    }

    if (radioRetryCount < RADIO_MAX_RETRY) {
      radioRetryCount++;
      onStationSelect(currentTrackIndex);
    } else {
      switchToNextStation();
    }
  }

  function checkRadioStatus() {
    if (!audioPlayer.src) return;
    if (userPaused) return;

    if (audioPlayer.paused && audioPlayer.currentTime > 0) {
      noProgressCounter = 0;
      silenceCounter = 0;
      tryRestartRadio();
      return;
    }

    if (audioPlayer.currentTime === lastCurrentTime) {
      noProgressCounter++;
    } else {
      noProgressCounter = 0;
      lastCurrentTime = audioPlayer.currentTime;
    }

    if (!audioPlayer.paused && !hasSound()) {
      silenceCounter++;
    } else {
      silenceCounter = 0;
    }

    if (noProgressCounter >= 3 || silenceCounter >= 3) {
      tryRestartRadio();
      noProgressCounter = 0;
      silenceCounter = 0;
    }
  }

  audioPlayer.addEventListener("play", resetRetryState);
  audioPlayer.addEventListener("ended", resetRetryState);
  audioPlayer.addEventListener("error", () => {
    resetRetryState();
    switchToNextStation();
  });

  const originalOnStationSelect = window.onStationSelect;
  window.onStationSelect = function(i) {
    resetRetryState();
    originalOnStationSelect(i);
  };

  setInterval(checkRadioStatus, RADIO_CHECK_INTERVAL);
}


function getStreamUrlForPlayback(originalUrl, stationId) {
  const base = "https://fony-ios-fix-server.onrender.com";
  fetch(`${base}/start?id=${encodeURIComponent(stationId)}&url=${encodeURIComponent(originalUrl)}`).catch(() => {});
  return `${base}/hls/${encodeURIComponent(stationId)}/playlist.m3u8`;
}

const __wrapIOS_OnStationSelect = window.onStationSelect || onStationSelect;
window.onStationSelect = function(i) {
  if (isIOSMobile() && window.currentPlaylist && window.currentPlaylist[i]) {
    const st = window.currentPlaylist[i];
    if (st) {
      const id = "st" + i;
      st.url = getStreamUrlForPlayback(st.originalUrl || st.url, id);
    }
  }
  __wrapIOS_OnStationSelect(i);
};

///// FAV PRELOADER PATCH

window.preloadedFavorites = null;
async function preloadFavorites() {
  const fav = JSON.parse(localStorage.getItem("favorites") || "[]");
  let favList = [];
  for (let pl of allPlaylists) {
    const st = await loadPlaylist(pl.file);
    const matched = st.filter(x => fav.includes(x.url));
    favList = favList.concat(matched);
  }
  window.preloadedFavorites = Array.from(new Map(favList.map(o => [o.url, o])).values());
}
document.addEventListener("appLoaded", () => {
  if (Array.isArray(allPlaylists) && allPlaylists.length) {
    preloadFavorites();
  }
});
document.addEventListener("favoritesChanged", () => {
  if (Array.isArray(allPlaylists) && allPlaylists.length) {
    preloadFavorites();
  }
});
window.usePreloadedFavorites = function() {
  if (window.preloadedFavorites) {
    currentPlaylist = window.preloadedFavorites;
    resetVisibleStations();
    return true;
  }
  return false;
}
const oldSetRadioListeners = setRadioListeners;
setRadioListeners = function() {
  oldSetRadioListeners();
  const fBtn = document.getElementById("favoritesFilterBtn");
  if (fBtn && !fBtn._patched) {
    fBtn._patched = true;
    const origClick = fBtn.onclick || (()=>{});
    fBtn.addEventListener("click", function patchFav(e) {
      setTimeout(() => {
        if (fBtn.classList.contains("active")) {
          if (window.usePreloadedFavorites()) return;
        }
      }, 10);
      if (typeof origClick === "function") origClick.call(this, e);
    });
  }
};
const origToggleFavorite = window.toggleFavorite;
window.toggleFavorite = function(url) {
  if (typeof origToggleFavorite === "function") origToggleFavorite(url);
  document.dispatchEvent(new Event("favoritesChanged"));
}




