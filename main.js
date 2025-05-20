import { fadeAudioOut, fadeAudioIn } from './player.js'
import { renderPlaylist, loadPlaylist } from './playlist.js'
import { initVolumeControl, updatePlayPauseButton, updateShuffleButton } from './controls.js'
import { initChat} from './chat.js'
import { getStreamMetadata, secureUrl } from './parsing.js'
import { initEqualizer } from './equalizer.js'
import { connectWallet, getNFTContractList, connectAndLoadWalletNFTs } from './web3.js'

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
          <span class="scrolling-text">Loading...</span>
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

function setRadioListeners() {
  const pSel = document.getElementById("playlistSelect");
  const sIn = document.getElementById("searchInput");
  const fBtn = document.getElementById("favoritesFilterBtn");
  const wBtn = document.getElementById("connectWalletBtn");
  const rBtn = document.getElementById("radioModeBtn");
  if (rBtn) rBtn.style.display = "none";
  if (pSel) {
    pSel.addEventListener("change", () => {
      const newGenre = pSel.value;
      loadAndRenderPlaylist(newGenre, () => {
        if (sIn) sIn.value = "";
        if (currentPlaylist.length) {
          onStationSelect(0);
          localStorage.setItem("lastStation", JSON.stringify({ genre: newGenre, trackIndex: 0 }));
          updateChat(newGenre);
        }
      }, true);
    });
  }
  if (sIn) {
    sIn.addEventListener("input", debounce(() => {
      const q = sIn.value.toLowerCase();
      currentPlaylist = allStations.filter(x => x.title.toLowerCase().includes(q));
      resetVisibleStations();
    }, 300));
  }
  if (fBtn) {
    fBtn.addEventListener("click", async () => {
      const genreLabel = document.querySelector("label[for='playlistSelect']");
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
        const fav = JSON.parse(localStorage.getItem("favorites") || "[]");
        let list = [];
        for (let pl of allPlaylists) {
          const st = await loadPlaylist(pl.file);
          const matched = st.filter(x => fav.includes(x.url));
          list = list.concat(matched);
        }
        const u = Array.from(new Map(list.map(o => [o.url, o])).values());
        currentPlaylist = u;
        resetVisibleStations();
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
    try { await audioPlayer.play() } catch(e){}
  })
  navigator.mediaSession.setActionHandler("pause", () => {
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
    if (audioPlayer.paused) audioPlayer.play().catch(() => {})
    else audioPlayer.pause()
    updatePlayPauseButton(audioPlayer, playPauseBtn)
  })
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

if (favBtn) {
  favBtn.addEventListener("click", () => {
    if (!currentPlaylist.length) return
    const c = currentPlaylist[currentTrackIndex]
    let fv = JSON.parse(localStorage.getItem("favorites") || "[]")
    if (!fv.includes(c.url)) {
      fv.push(c.url)
      localStorage.setItem("favorites", JSON.stringify(fv))
    }
    currentPlaylist = allStations.slice()
    resetVisibleStations()
  })
}

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
  pSel.dispatchEvent(new Event("change"));
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
  // if (ts - lastChatUpdate >= chatUpdateInterval) {
  //   syncChat()
  //   lastChatUpdate = ts
  // }
  if (ts - lastMetadataUpdate >= metadataUpdateInterval) {
    updateStreamMetadata(currentParsingUrl)
    lastMetadataUpdate = ts
  }
  requestAnimationFrame(globalUpdater)
}
requestAnimationFrame(globalUpdater)

fetch("playlists.json")
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
            defaultPlaylist();
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
        defaultPlaylist();
      }
    } else {
      defaultPlaylist();
    }
    setRadioListeners();
  })
  .catch(() => {
    defaultPlaylist();
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
