import { fadeAudioOut, fadeAudioIn } from './player.js'
import { renderPlaylist, loadPlaylist, getGenreIcon } from './playlist.js'
import { initVolumeControl, updatePlayPauseButton, updateShuffleButton } from './controls.js'
import { initChat} from './chat.js'
import { getStreamMetadata, secureUrl } from './parsing.js'
import { initEqualizer } from './equalizer.js'
import { toast as toastLocal } from './local-mode.js'
import { enterNostrMode, leaveNostrMode, initNostr, isNostrActive, isNostrHash, handleNostrHash } from './nostr-mode.js'
import { getRememberedStations } from './nostr/favorites.js'
import { unwrapProxyUrl } from './nostr/format.js'
import { clearDiscogsInfo, refreshNowPlaying } from './nowplaying.js'
import { isLocalSupported, prepareTrack, releaseTrack as releaseLocalTrack, isFavorite as isLocalFavorite, toggleFavorite as toggleLocalFavoriteTrack } from './local-library.js'
import { enterLocalMode, leaveLocalMode, restoreLastTrack as restoreLastLocalTrack, syncActive as syncLocalActive, setLocalProgress, showUnsupportedDialog, playRandom as playLocalRandom, revealPlaying as revealLocalPlaying } from './local-mode.js'
import { initCustomGenreSelect, setSelectedGenre, getSelectedGenre } from './custom-genre-select.js';
import { pickPlaylist as pickTastePlaylist, trackListen, stopTracking as stopTasteTracking } from './taste.js';
import { loadCustomPlaylists,saveCustomPlaylist, deleteCustomPlaylist, normalizePlaylistUrl, suggestNameFromUrl } from './custom-playlists.js';
import { loadMergedPlaylistFolder as fetchMergedPlaylistFolder } from './merged-playlist-catalog.js'
import { stationLogosEnabled } from './utils/favLogos.js';

let currentMode = "radio"
let currentParsingUrl = ""
let appInitialized = false
let allPlaylists = []
let allStations = []
let currentPlaylist = []
let currentTrackIndex = 0
// What is playing while another mode is being browsed: { mode, url, playlist, index }.
// Switching modes no longer stops the sound; the next/prev buttons keep working on this list.
let detached = null
let silentStep = false
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
let radioSearchPool = []
let radioSearchPoolLoadingPromise = null
let radioSearchPoolReady = false
let radioSearchLoading = false
let radioSearchPoolReleaseTimer = null
let favoritesBaseList = []
const APP_MODE_KEY = "lastAppMode"
const LAST_RADIO_TRACK_KEY = "lastRadioTrackUrl"
const LAST_FAVORITES_TRACK_KEY = "lastFavoritesTrackUrl"
const APP_FIRST_LAUNCH_DONE_KEY = "appFirstLaunchDone"
const FONY_BACKEND_URL = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app"
const searchByMode = {
  radio: "",
  favorites: ""
}
// const chatUpdateInterval = 15000
const metadataUpdateInterval = 7000
const RADIO_SEARCH_POOL_IDLE_TTL = 120000

const audioPlayer = document.getElementById('audioPlayer')
audioPlayer.volume = defaultVolume.value
audioPlayer.crossOrigin = 'anonymous'

// Browsers may refuse to start audio on a page that has not been clicked yet (after a reload). Playback
// is then started by the first click / key press (no on-screen hint).
;(() => {
  const rawPlay = audioPlayer.play.bind(audioPlayer)
  let armed = false
  const arm = () => {
    if (armed) return
    armed = true
    const go = () => {
      document.removeEventListener("pointerdown", go, true)
      document.removeEventListener("keydown", go, true)
      armed = false
      if (audioPlayer.paused && audioPlayer.src && !userPaused) rawPlay().catch(() => {})
    }
    document.addEventListener("pointerdown", go, true)
    document.addEventListener("keydown", go, true)
  }
  audioPlayer.play = function () {
    const p = rawPlay()
    if (p && p.catch) p.catch(err => { if (err && err.name === "NotAllowedError") arm() })
    return p
  }
})()

const stationLabel = document.getElementById('stationLabel')
const customGenreSelect = document.getElementById('customGenreSelect')
const searchInput = document.getElementById('searchInput')
const playlistContainer = document.getElementById('playlistContent')
const playlistElement = document.getElementById('playlist')



const themeIconObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "attributes" && mutation.attributeName === "class" && mutation.target === document.body) {
      // Theme changed - icons already white so no refresh needed
    }
  }
});
if (document.body) {
  themeIconObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
} else {
  document.addEventListener("DOMContentLoaded", () => {
    themeIconObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  });
}

const rrBtn = document.getElementById('rrBtn')
const ffBtn = document.getElementById('ffBtn')
const favBtn = document.getElementById('favBtn')
const shuffleBtn = document.getElementById('shuffleBtn')
const randomBtn = document.getElementById('randomBtn')
const nostrBtn = document.getElementById('nostrModeBtn')
const radioModeBtn = document.getElementById('radioModeBtn')

// Clean-up of a saved mode that no longer exists, so nothing tries to restore it.
;(() => {
  try {
    if (localStorage.getItem("lastAppMode") === "web3") localStorage.setItem("lastAppMode", "radio")
    localStorage.removeItem("lastWeb3TrackState")
  } catch (_) {}
})()

if (nostrBtn) {
  nostrBtn.addEventListener("click", () => {
    if (currentMode === "nostr") switchToRadio()
    else switchToNostr()
  })
}

speechSynthesis.cancel()
// a failure in the social layer must never take the player down with it (some phone browsers lack APIs)
try { initNostr() } catch (e) { console.warn("Nostr init failed:", e) }


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

  if (allPlaylists) {
    setSelectedGenre(genreEntry.file, genreEntry.name);
  }
  window.currentGenre = genreEntry.name;
  initChat();
  loadAndRenderPlaylist(genreEntry.file, genreEntry.name, () => {
    if (currentPlaylist.length) {
      const randomStationIndex = Math.floor(Math.random() * currentPlaylist.length);
      onStationSelect(randomStationIndex);
      localStorage.setItem("lastStation", JSON.stringify({ genre: genreEntry.name, trackIndex: randomStationIndex }));
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
      title: st.trackTitle || "Unknown Track",
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

const FAVORITES_SORT_KEY = "favoritesSortMode";

function persistCurrentMode(mode) {
  if (["radio", "favorites", "nostr", "local"].includes(mode)) {
    localStorage.setItem(APP_MODE_KEY, mode)
  }
}

function getSavedMode() {
  const mode = localStorage.getItem(APP_MODE_KEY)
  return ["radio", "favorites", "nostr", "local"].includes(mode) ? mode : "radio"
}

function isFirstLaunch() {
  return !localStorage.getItem(APP_FIRST_LAUNCH_DONE_KEY)
}

function markFirstLaunchDone() {
  localStorage.setItem(APP_FIRST_LAUNCH_DONE_KEY, "true")
}

function savePlaybackState(station) {
  const mode = getEffectiveMode()
  if (!station || !station.url) return

  if (mode === "favorites") {
    localStorage.setItem(LAST_FAVORITES_TRACK_KEY, station.url)
    return
  }

  if (mode === "local") return

  if (mode === "nostr") {
    // enough to bring the same station (and the list it came from) back after a reload
    try {
      localStorage.setItem("fonyNostrLast", JSON.stringify({
        url: unwrapProxyUrl(station.originalUrl || station.url),
        name: station.title || "",
        genre: station.genre || "",
        src: window.__nostrSrc || null
      }))
    } catch (_) {}
    return
  }

  localStorage.setItem(LAST_RADIO_TRACK_KEY, station.url)
}

function loadSearchState() {
  searchByMode.radio = ""
  searchByMode.favorites = ""
}

function saveSearchState() {}

function getEffectiveMode() {
  return currentMode === "radio" && document.getElementById("favoritesFilterBtn")?.classList.contains("active")
    ? "favorites"
    : currentMode
}

function getStationSearchText(station = {}) {
  return `${station.title || ""} ${station.playlistTitle || ""} ${station.artist || ""}`.toLowerCase()
}

function updateSearchInputByMode() {
  const sIn = document.getElementById("searchInput")
  if (!sIn) return
  const mode = getEffectiveMode()
  const placeholders = {
    radio: radioSearchLoading ? "Searching across all genres..." : "Search across all genres",
    favorites: "Search favorites"
  }
  sIn.placeholder = placeholders[mode] || "Search"
  sIn.value = searchByMode[mode] || ""
}

function applyModeSearch(mode = getEffectiveMode()) {
  const sIn = document.getElementById("searchInput")
  if (!sIn) return
  const query = (searchByMode[mode] || "").trim().toLowerCase()

  // Nostr mode runs its own search box
  if (mode === "nostr") return

  if (mode === "favorites") {
    currentPlaylist = query ? favoritesBaseList.filter(st => getStationSearchText(st).includes(query)) : favoritesBaseList.slice()
    resetVisibleStations()
    return
  }

  const radioBase = query ? (radioSearchPool.length ? radioSearchPool : allStations) : allStations
  currentPlaylist = (radioBase || []).filter(st => getStationSearchText(st).includes(query))
  resetVisibleStations()
}

async function prepareRadioSearchPool(force = false) {
  if (radioSearchPoolReleaseTimer) {
    clearTimeout(radioSearchPoolReleaseTimer)
    radioSearchPoolReleaseTimer = null
  }
  if (radioSearchPoolReady && !force) return radioSearchPool
  if (radioSearchPoolLoadingPromise && !force) return radioSearchPoolLoadingPromise
  if (!Array.isArray(allPlaylists) || !allPlaylists.length) return []

  radioSearchPoolLoadingPromise = Promise.all(
    allPlaylists.map(async pl => {
      try {
        const stations = await loadPlaylist(pl.file, pl.name, { skipAssetValidation: true })
        return stations.map(st => ({
          url: st.url,
          originalUrl: st.originalUrl,
          title: st.title,
          artist: st.artist || "",
          playlistTitle: st.playlistTitle || "",
          genreName: pl.name,
          genreFile: pl.file
        }))
      } catch (_) {
        return []
      }
    })
  ).then(stationLists => {
    radioSearchPool = Array.from(new Map(stationLists.flat().map(st => [st.url, st])).values())
    radioSearchPoolReady = true
    return radioSearchPool
  }).finally(() => {
    radioSearchPoolLoadingPromise = null
  })

  return radioSearchPoolLoadingPromise
}

function releaseRadioSearchPool() {
  radioSearchPool = []
  radioSearchPoolReady = false
}

function scheduleRadioSearchPoolRelease() {
  if (radioSearchPoolReleaseTimer) {
    clearTimeout(radioSearchPoolReleaseTimer)
    radioSearchPoolReleaseTimer = null
  }

  if (radioSearchLoading || radioSearchPoolLoadingPromise) return
  if ((searchByMode.radio || "").trim().length > 0) return
  if (!radioSearchPoolReady || !radioSearchPool.length) return

  radioSearchPoolReleaseTimer = setTimeout(() => {
    radioSearchPoolReleaseTimer = null
    if (radioSearchLoading || radioSearchPoolLoadingPromise) return
    if ((searchByMode.radio || "").trim().length > 0) return
    releaseRadioSearchPool()
  }, RADIO_SEARCH_POOL_IDLE_TTL)
}

function ensureRadioSearchPoolForCurrentQuery() {
  const mode = getEffectiveMode()
  const query = (searchByMode.radio || "").trim().toLowerCase()
  if (mode !== "radio" || !query || radioSearchPoolReady || radioSearchLoading) return

  radioSearchLoading = true
  updateSearchInputByMode()
  prepareRadioSearchPool()
    .then(() => {
      if (getEffectiveMode() === "radio" && (searchByMode.radio || "").trim().length > 0) {
        applyModeSearch("radio")
      }
    })
    .catch(() => {})
    .finally(() => {
      radioSearchLoading = false
      updateSearchInputByMode()
    })
}

function normalizeFavoritesStorage() {
  const favs = JSON.parse(localStorage.getItem("favorites") || "[]");
  let needsSave = false;
  const normalized = favs.map((fav, idx) => {
    if (fav && typeof fav.addedAt !== "number") {
      needsSave = true;
      return { ...fav, addedAt: idx };
    }
    return fav;
  });
  if (needsSave) {
    localStorage.setItem("favorites", JSON.stringify(normalized));
    return normalized;
  }
  return favs;
}

function getFavoritesSortMode() {
  const mode = localStorage.getItem(FAVORITES_SORT_KEY);
  if (mode === "date" || mode === "genre" || mode === "alpha" || mode === "custom") return mode;
  return "custom";
}

function setFavoritesSortMode(mode) {
  if (mode === "date" || mode === "genre" || mode === "alpha" || mode === "custom") {
    localStorage.setItem(FAVORITES_SORT_KEY, mode);
  }
}

function toggleFavoritesSortVisibility(isVisible) {
  const sortContainer = document.getElementById("favoritesSortContainer");
  if (sortContainer) {
    sortContainer.style.display = isVisible ? "flex" : "none";
  }

}

function syncFavoritesSortSelect() {
  const sortSelect = document.getElementById("favoritesSortSelect");
  if (sortSelect) {
    sortSelect.value = getFavoritesSortMode();
  }
}

function applyFavoritesSorting(list) {
  const sortMode = getFavoritesSortMode();
  const favorites = normalizeFavoritesStorage();
  const orderMap = new Map(favorites.map((fav, idx) => [fav.url, { ...fav, order: idx }]));
  const sortedList = list.map(st => {
    const favEntry = orderMap.get(st.url);
    if (favEntry) {
      let favGenre = favEntry.genre;
      if (favGenre && favGenre.startsWith("genres/")) {
        const matchedPlaylist = allPlaylists.find(p => p.file === favGenre);
        favGenre = matchedPlaylist ? matchedPlaylist.name : favGenre;
      }
      if (!st.favGenre && favGenre) st.favGenre = favGenre;
      st.favAddedAt = typeof favEntry.addedAt === "number" ? favEntry.addedAt : favEntry.order;
    } else if (typeof st.favAddedAt !== "number") {
      st.favAddedAt = 0;
    }
    return st;
  });

  if (sortMode === "custom") {
    return sortedList.sort((a, b) => {
      const aOrder = orderMap.get(a.url)?.order ?? 0;
      const bOrder = orderMap.get(b.url)?.order ?? 0;
      return aOrder - bOrder;
    });
  }

  if (sortMode === "date") {
    return sortedList.sort((a, b) => (b.favAddedAt || 0) - (a.favAddedAt || 0));
  }

  if (sortMode === "genre") {
    return sortedList.sort((a, b) => {
      const aGenre = (a.favGenre || a.genre || "").toLowerCase();
      const bGenre = (b.favGenre || b.genre || "").toLowerCase();
      return aGenre.localeCompare(bGenre);
    });
  }

  if (sortMode === "alpha") {
    return sortedList.sort((a, b) => {
      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      return aTitle.localeCompare(bTitle);
    });
  }

  return sortedList;
}

// The local explorer owns #playlist while in local mode.
function playingMode() { return detached ? detached.mode : currentMode }
window.fonyPlayingMode = playingMode

// the list and position the transport buttons (prev / next / end of track) work on
function transport() {
  return detached ? { list: detached.playlist, idx: detached.index } : { list: currentPlaylist, idx: currentTrackIndex }
}

// Called right before the mode changes: if something is playing, remember it so it can go on.
function detachPlayback() {
  const url = window.currentStationUrl
  if (!url || !audioPlayer.getAttribute("src")) return false
  if (detached && detached.url === url) return true
  const st = currentPlaylist[currentTrackIndex]
  if (!st || st.url !== url) return false
  detached = { mode: currentMode, url, playlist: currentPlaylist, index: currentTrackIndex }
  // the "hide a dead station" check indexes the browsed list, which is about to change
  if (playCheckTimer) { clearTimeout(playCheckTimer); playCheckTimer = null }
  return true
}

// The browsed list contains the playing station again: it becomes the transport list.
function reconcileDetached() {
  if (!detached || silentStep) return
  const i = currentPlaylist.findIndex(s => s && s.url === detached.url)
  if (i < 0) return
  currentTrackIndex = i
  detached = null
}

// Next / previous while the playing list is not the one on screen.
function playAt(i) {
  if (!detached) { onStationSelect(i); return }
  const d = detached
  if (!d.playlist[i]) return
  const saved = { list: currentPlaylist, idx: currentTrackIndex, mode: currentMode, vis: visibleStations }
  silentStep = true
  currentPlaylist = d.playlist
  currentTrackIndex = d.index
  currentMode = d.mode
  try {
    onStationSelect(i)
    d.index = i
    d.url = window.currentStationUrl
  } finally {
    currentPlaylist = saved.list
    currentTrackIndex = saved.idx
    currentMode = saved.mode
    visibleStations = saved.vis
    silentStep = false
  }
}

function renderStations(end) {
  if (currentMode === "local") {
    window.currentPlaylist = currentPlaylist
    return
  }
  reconcileDetached()
  if (silentStep) return
  renderPlaylist(playlistElement, currentPlaylist, 0, end)
}

function ensureVisible(i) {
  if (i >= visibleStations) {
    visibleStations = i + CHUNK_SIZE
    if (visibleStations > currentPlaylist.length) visibleStations = currentPlaylist.length
    renderStations(visibleStations)
  }
}

function resetVisibleStations() {
  visibleStations = 0
  renderMoreStations()
}

function renderMoreStations() {
  if (visibleStations < currentPlaylist.length) {
    visibleStations += CHUNK_SIZE
    renderStations(visibleStations)
  }
}

let stationArtToken = 0
let activeStationArt = { logo: null }
const stationArtCache = new Map()

// Shows the station logo instead of the broadcast icon on the playing row
// (via a CSS variable, so it survives theme CSS).
function applyActiveStationArt() {
  document.querySelectorAll("#playlist li").forEach(li => {
    // in Favorites the logo already replaces the genre icon in the row
    const logo = li.classList.contains("active") && !li.classList.contains("draggable-favorite") ? activeStationArt.logo : null
    if (logo) {
      if (li.style.getPropertyValue("--station-logo") !== `url("${logo}")`) {
        li.style.setProperty("--station-logo", `url("${logo}")`)
      }
      li.classList.add("has-logo")
    } else if (li.classList.contains("has-logo")) {
      li.classList.remove("has-logo")
      li.style.removeProperty("--station-logo")
    }
  })
}

// Station name -> clickable link to the station's website. The site comes from the station
// data (Nostr/favorites) or, when "Load station icons" is on, from the backend lookup.
const stationHomepageCache = new Map()

function safeHomepage(u) {
  try {
    const p = new URL(u)
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : ""
  } catch { return "" }
}

let stationLinkUrl = ""
let stationLinkTitle = ""

// Several code paths rewrite the label text (e.g. when buffering ends), which would drop the
// link: put it back whenever the same station's plain text reappears.
if (stationLabel) {
  const t = stationLabel.querySelector(".scrolling-text")
  if (t) {
    new MutationObserver(() => {
      if (stationLinkUrl && !t.querySelector("a") && t.textContent === stationLinkTitle) linkStationLabel(stationLinkUrl)
    }).observe(t, { childList: true, characterData: true })
  }
}

function linkStationLabel(url) {
  const t = stationLabel && stationLabel.querySelector(".scrolling-text")
  if (!t || t.querySelector("a")) return
  stationLinkUrl = url
  stationLinkTitle = t.textContent
  const text = t.textContent
  const a = document.createElement("a")
  a.href = url
  a.target = "_blank"
  a.rel = "noopener noreferrer"
  a.title = url
  a.textContent = text
  t.textContent = ""
  t.appendChild(a)
  checkMarquee(stationLabel)
}

function setStationLink(st, token) {
  stationLinkUrl = ""
  if (!st || st.local || !st.title) return
  const direct = safeHomepage(st.homepage)
  if (direct) { linkStationLabel(direct); return }
  if (!stationLogosEnabled()) return
  const key = st.title.toLowerCase()
  if (stationHomepageCache.has(key)) {
    const c = stationHomepageCache.get(key)
    if (c) linkStationLabel(c)
    return
  }
  fetch(`${FONY_BACKEND_URL}/api/station-homepage?name=${encodeURIComponent(st.title)}&url=${encodeURIComponent(st.originalUrl || st.url || "")}`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      const url = safeHomepage(d && d.homepage)
      stationHomepageCache.set(key, url)
      if (url && token === stationArtToken) linkStationLabel(url)
    })
    .catch(() => {})
}

// Station facts (format / tags / country) rotate in the free space of the screen.
const stationFactsEl = document.getElementById("stationFacts")
const stationFactsCache = new Map()
let factsTimer = null
let factsIndex = 0
let factsList = []
const FACT_LABELS = [["format", "Format"], ["tags", "Tags"], ["country", "Country"]]

function renderFact(entry) {
  const wrap = document.createElement("span")
  wrap.className = "fact"
  if (entry[2]) {
    // country as a flag image (emoji flags do not render on Windows); the name stays as a tooltip
    const img = document.createElement("img")
    img.className = "fact-flag"
    const cc = entry[2].toLowerCase()
    img.src = `https://flagcdn.com/h40/${cc}.png`
    img.srcset = `https://flagcdn.com/h20/${cc}.png 1x, https://flagcdn.com/h40/${cc}.png 2x`
    img.alt = entry[1]
    img.title = entry[1]
    img.onerror = () => { img.remove() }
    const name = document.createElement("span")
    name.className = "fact-value"
    name.textContent = entry[1]
    wrap.classList.add("fact-country")
    wrap.append(img, name)
    return wrap
  }
  const v = document.createElement("span")
  v.className = "fact-value"
  v.textContent = entry[1]
  v.title = entry[0]
  wrap.append(v)
  return wrap
}

function stopStationFacts() {
  if (factsTimer) { clearInterval(factsTimer); factsTimer = null }
  factsList = []
  if (stationFactsEl) { stationFactsEl.classList.remove("on"); stationFactsEl.textContent = ""; setFactsLayout(false) }
}

// The left part of the screen is split in two: the station name gets (at most) half and runs as a
// marquee inside it when longer, the facts get the other half.
function setFactsLayout(on, recheck = true) {
  const lg = stationFactsEl && stationFactsEl.parentElement
  if (!lg) return
  const active = !!on && getComputedStyle(stationFactsEl).display !== "none"
  lg.classList.toggle("has-facts", active)
  if (recheck) checkMarquee(stationLabel)
}

// Does this fact fit in its half without being cut?
function factFits(node) {
  const el = stationFactsEl
  const old = el.firstElementChild
  const oldDisplay = old ? old.style.display : ""
  if (old) old.style.display = "none"
  const wasOn = el.classList.contains("on")
  el.classList.add("on")
  setFactsLayout(true, false)
  el.appendChild(node)
  const ok = node.scrollWidth <= node.clientWidth + 1
  node.remove()
  if (old) old.style.display = oldDisplay
  if (!wasOn) { el.classList.remove("on"); setFactsLayout(false, false) }
  return ok
}

// Shows the first fact (starting at startIdx) that fits; if none does, the first one is shown with an ellipsis.
function stepFacts(startIdx, animate, onlyIfNeeded) {
  if (!stationFactsEl || !factsList.length) return
  const n = factsList.length
  const current = stationFactsEl.firstElementChild
  if (onlyIfNeeded && current && stationFactsEl.classList.contains("on")) {
    if (factFits(renderFact(factsList[factsIndex % n]))) return
  }
  let node = null
  let idx = -1
  for (let k = 0; k < n; k++) {
    const cand = renderFact(factsList[(startIdx + k) % n])
    if (factFits(cand)) { node = cand; idx = (startIdx + k) % n; break }
  }
  if (!node) { idx = startIdx % n; node = renderFact(factsList[idx]) }
  factsIndex = idx
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const old = stationFactsEl.firstElementChild
  const enter = () => {
    stationFactsEl.textContent = ""
    stationFactsEl.appendChild(node)
    stationFactsEl.classList.add("on")
    setFactsLayout(true)
    if (!reduce && node.animate) {
      // left-to-right wipe: the text is uncovered as if a scan line passes over it
      node.animate(
        [
          { clipPath: "inset(0 100% 0 0)", opacity: 0.2, transform: "translateX(-10px)" },
          { clipPath: "inset(0 0 0 0)", opacity: 1, transform: "translateX(0)" }
        ],
        { duration: 750, easing: "cubic-bezier(.65,0,.25,1)" }
      )
    }
  }
  if (animate && old && !reduce && old.animate) {
    // the old text is wiped away in the same direction
    old.animate(
      [{ clipPath: "inset(0 0 0 0)", opacity: 1 }, { clipPath: "inset(0 0 0 100%)", opacity: 0.2 }],
      { duration: 450, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" }
    ).onfinish = enter
  } else {
    enter()
  }
}

function startStationFacts(facts) {
  stopStationFacts()
  if (!stationFactsEl || !facts) return
  factsList = FACT_LABELS.filter(([k]) => facts[k]).map(([k, label]) => [label, facts[k], k === "country" ? facts.countrycode : ""])
  if (!factsList.length) return
  factsIndex = 0
  stepFacts(0, false)
  factsTimer = setInterval(() => {
    if (document.hidden) return
    stepFacts(factsIndex + 1, true)
  }, 9000)
}

let factsResizeTimer = null
window.addEventListener("resize", () => {
  clearTimeout(factsResizeTimer)
  factsResizeTimer = setTimeout(() => {
    if (factsList.length) stepFacts(factsIndex, false, true)
    checkMarquee(stationLabel)
  }, 200)
})

// Country name -> ISO code from Radio Browser's own country list (via the backend pass-through),
// fetched once and kept for a month, so a flag can be shown without extra backend fields.
let countryCodesPromise = null
function loadCountryCodes() {
  if (countryCodesPromise) return countryCodesPromise
  countryCodesPromise = (async () => {
    try {
      const c = JSON.parse(localStorage.getItem("countryCodes") || "null")
      if (c && c.map && Date.now() - c.t < 30 * 24 * 3600 * 1000) return c.map
    } catch {}
    const map = {}
    for (let offset = 0; offset < 400; offset += 100) {
      const r = await fetch(`${FONY_BACKEND_URL}/api/rb/countries?order=name&limit=100&offset=${offset}`)
      if (!r.ok) throw new Error("countries")
      const list = await r.json()
      for (const x of list) if (x && x.name && /^[A-Za-z]{2}$/.test(x.iso_3166_1 || "")) map[x.name.trim().toLowerCase()] = x.iso_3166_1.toUpperCase()
      if (list.length < 100) break
    }
    try { localStorage.setItem("countryCodes", JSON.stringify({ t: Date.now(), map })) } catch {}
    return map
  })().catch(() => { countryCodesPromise = null; return {} })
  return countryCodesPromise
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase() } catch { return "" }
}

// Radio Browser often lists a station under a different name or stream URL, so the backend lookup
// misses it. Find it by website instead: search by name, keep the entry whose homepage host matches.
async function fillFromRadioBrowser(st, d) {
  if (d.country) return d
  try {
    let home = safeHomepage(st.homepage)
    if (!home) {
      const r = await fetch(`${FONY_BACKEND_URL}/api/station-homepage?name=${encodeURIComponent(st.title)}&url=${encodeURIComponent(st.originalUrl || st.url || "")}`)
      home = r.ok ? safeHomepage((await r.json()).homepage) : ""
    }
    const host = hostOf(home)
    if (!host) return d
    const clean = st.title.replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim()
    const first = clean.split(" ").find(w => w.length >= 4) || ""
    for (const q of [clean, first]) {
      if (!q) continue
      const r = await fetch(`${FONY_BACKEND_URL}/api/rb/stations/search?name=${encodeURIComponent(q)}&limit=50&order=votes&reverse=true`)
      if (!r.ok) continue
      const hit = (await r.json()).find(x => x && hostOf(x.homepage) === host)
      if (!hit) continue
      const out = { ...d }
      if (!out.country && hit.country) out.country = hit.country
      if (!out.countrycode && /^[A-Za-z]{2}$/.test(hit.countrycode || "")) out.countrycode = hit.countrycode.toUpperCase()
      return out
    }
  } catch {}
  return d
}

async function withCountryCode(d) {
  if (!d || !d.country || d.countrycode) return d
  const map = await loadCountryCodes()
  return { ...d, countrycode: map[d.country.trim().toLowerCase()] || "" }
}

function setStationFacts(st, token) {
  stopStationFacts()
  if (!st || st.local || !st.title || !stationLogosEnabled()) return
  const key = st.title.toLowerCase()
  if (stationFactsCache.has(key)) { startStationFacts(stationFactsCache.get(key)); return }
  fetch(`${FONY_BACKEND_URL}/api/station-info?name=${encodeURIComponent(st.title)}&url=${encodeURIComponent(st.originalUrl || st.url || "")}`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d ? fillFromRadioBrowser(st, d) : null))
    .then(d => (d ? withCountryCode(d) : null))
    .then(d => {
      if (!d) return
      stationFactsCache.set(key, d)
      if (token === stationArtToken) startStationFacts(d)
    })
    .catch(() => {})
}

function setStationArt(st) {
  const token = ++stationArtToken
  activeStationArt = { logo: null }
  applyActiveStationArt()
  setStationLink(st, token)
  setStationFacts(st, token)
  if (!st || st.local || st.nostr || !st.title || !stationLogosEnabled()) return
  const key = st.title.toLowerCase()
  const done = src => {
    if (token !== stationArtToken || !src) return
    activeStationArt.logo = src
    applyActiveStationArt()
  }
  if (stationArtCache.has(key)) { done(stationArtCache.get(key)); return }
  const src = `${FONY_BACKEND_URL}/api/station-logo?kind=logo&name=${encodeURIComponent(st.title)}&url=${encodeURIComponent(st.originalUrl || st.url || "")}`
  const img = new Image()
  img.onload = () => { stationArtCache.set(key, src); done(src) }
  img.onerror = () => { stationArtCache.set(key, null) }
  img.src = src
}

// "Load station icons" switched in Settings: apply right away
document.addEventListener("stationLogosChanged", () => {
  if (playingMode() === "local") return
  const t = transport()
  setStationArt(t.list[t.idx])
  renderStations(visibleStations)
})

;(() => {
  const list = document.getElementById("playlist")
  if (!list) return
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => { queued = false; applyActiveStationArt() })
  }).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] })
})()

// Runs the text as a marquee when it is wider than the box that actually clips it. For the track
// the clipping box is .track-name (the group also holds the icon), for the station it is the label.
// The class is only touched when the state changes (re-adding it would restart the animation).
// The run is timed to the real widths (--mq-from / --mq-to / --mq-dur): it starts at the right edge of
// the box and leaves at the left edge, at a steady speed.
const MARQUEE_PX_PER_SEC = 45
function checkMarquee(container) {
  if (!container) return
  const st = container.querySelector(".scrolling-text")
  if (!st) return
  const box = container.querySelector(".track-name") || container
  const cW = box.clientWidth
  const sW = st.scrollWidth
  if (!cW) return
  const over = sW > cW + 1
  if (over) {
    const dur = Math.max(8, (cW + sW) / MARQUEE_PX_PER_SEC)
    const from = cW + "px"
    const to = -sW + "px"
    if (st.style.getPropertyValue("--mq-from") !== from) st.style.setProperty("--mq-from", from)
    if (st.style.getPropertyValue("--mq-to") !== to) st.style.setProperty("--mq-to", to)
    const d = dur.toFixed(1) + "s"
    if (st.style.getPropertyValue("--mq-dur") !== d) st.style.setProperty("--mq-dur", d)
  }
  if (over !== st.classList.contains("marquee")) st.classList.toggle("marquee", over)
}

// Re-check whenever the text, the fonts or the available width change.
;(function watchMarquees() {
  let queued = false
  const run = () => {
    queued = false
    checkMarquee(stationLabel)
    checkMarquee(document.querySelector(".right-group"))
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(run)
  }
  const rg = document.querySelector(".right-group")
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(schedule)
    if (stationLabel) ro.observe(stationLabel)
    if (rg) ro.observe(rg)
    const lg = document.querySelector(".left-group")
    if (lg) ro.observe(lg)
  }
  if (rg) new MutationObserver(schedule).observe(rg, { childList: true, subtree: true, characterData: true })
  if (stationLabel) new MutationObserver(schedule).observe(stationLabel, { childList: true, subtree: true, characterData: true })
  window.addEventListener("resize", schedule)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule)
})()

function handleDeleteCustomPlaylist(id) {
  const deleted = allPlaylists.find(p => p.id === id);
  const wasActive = deleted && getSelectedGenre().file === deleted.file;
  deleteCustomPlaylist(id);
  allPlaylists = allPlaylists.filter(p => p.id !== id);
  fillPlaylistSelect(false);
  if (wasActive) defaultPlaylist();
}

function fillPlaylistSelect(autoSelectFirst = false) {
  if (allPlaylists) {
    initCustomGenreSelect(allPlaylists, (file, name) => {
      window.currentGenre = name;
      loadAndRenderPlaylist(file, name);
    }, { autoSelectFirst, onDelete: handleDeleteCustomPlaylist });
  }
}

function leaveLocalIfNeeded() {
  if (currentMode !== "local") return
  // a local track that goes on playing needs its file kept
  const keepTrack = !!detached && detached.mode === "local"
  leaveLocalMode(keepTrack)
  if (!keepTrack) window.__localCoverFallback = null
  const lb = document.getElementById("localModeBtn")
  if (lb) { lb.classList.remove("active"); lb.title = "Local files" }
  setNowPlayingBarClickable(false)
}

// In Local mode the "now playing" bar is a button: it takes you back to the folder of the playing track.
function setNowPlayingBarClickable(on) {
  const bar = document.querySelector(".left-group")
  if (!bar) return
  bar.style.cursor = on ? "pointer" : ""
  bar.title = on ? "Show this track in its folder" : ""
  // Local mode: a folder with a play sign instead of the radio-broadcast icon
  const ico = bar.querySelector(".stream-icon")
  if (ico) ico.src = on ? "/img/local_playing.svg" : "/img/stream_icon.svg"
}
document.querySelector(".left-group")?.addEventListener("click", () => {
  if (currentMode === "local") revealLocalPlaying()
})


function switchToRadio(restorePlayback = true) {
  // whatever is playing keeps playing; only a switch from radio to radio (a reset) stops it
  const keep = currentMode !== "radio" ? detachPlayback() : !!detached;
  leaveNostrIfNeeded();
  leaveLocalIfNeeded();
  currentMode = "radio";
  window.currentMode = currentMode;
  persistCurrentMode("radio");
  if (!keep) {
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
  }
  currentPlaylist = [];
  playlistElement.innerHTML = "";
  const g = document.querySelector(".genre-box");
  if (g) {
    g.innerHTML = `
      <img src="/img/fav_list.svg" id="favoritesFilterBtn" class="favorites-filter-icon">
      <label for="customGenreSelect">Genre:</label>
      <div class="favorites-sort" id="favoritesSortContainer">
        <label for="favoritesSortSelect" class="sort-ico" title="Sort by" aria-label="Sort by"></label>
        <select id="favoritesSortSelect">
          <option value="custom">Custom order</option>
          <option value="date">Date added</option>
          <option value="genre">Genre</option>
          <option value="alpha">Alphabetical</option>
        </select>
      </div>
      <div class="custom-genre-select" id="customGenreSelect">
        <div class="genre-select-header" id="genreSelectHeader">
          <span class="genre-select-icon" id="genreSelectIcon"></span>
          <span class="genre-select-text" id="genreSelectText">Select Genre</span>
        </div>
        <div class="genre-select-dropdown" id="genreSelectDropdown">
          <ul class="genre-select-list" id="genreSelectList"></ul>
        </div>
      </div>
      <button id="addPlaylistBtn" title="Add custom playlist" aria-label="Add custom playlist"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6"/></svg></button>
      <div class="search-wrapper">
        <input type="text" id="searchInput" class="genre-search" name="fony-station-search" autocomplete="off" spellcheck="false" placeholder="Search all radio playlists">
        <span id="clearSearch">×</span>
      </div>
      <img src="/img/radio.svg" alt="Radio Mode" id="radioModeBtn" style="cursor: pointer; width: 28px; height: 28px; display: none;">
    `;
  }
  fillPlaylistSelect(false);
  setRadioListeners();
  if (keep) {
    // just show the stations again; the sound is not touched
    const g = getSelectedGenre();
    const entry = allPlaylists.find(p => p.file === g.file) || allPlaylists[0];
    if (entry) {
      setSelectedGenre(entry.file, entry.name);
      loadAndRenderPlaylist(entry.file, entry.name);
    }
    return;
  }
  if (!restorePlayback) return;

  const lastRadioTrackUrl = localStorage.getItem(LAST_RADIO_TRACK_KEY);
  if (lastRadioTrackUrl && radioSearchPool.length) {
    const savedStation = radioSearchPool.find(st => st.url === lastRadioTrackUrl);
    if (savedStation && savedStation.genreFile && savedStation.genreName) {
      setSelectedGenre(savedStation.genreFile, savedStation.genreName);
      initChat();
      loadAndRenderPlaylist(savedStation.genreFile, savedStation.genreName, () => {
        const idx = currentPlaylist.findIndex(st => st.url === lastRadioTrackUrl);
        onStationSelect(idx >= 0 ? idx : 0);
      });
      return;
    }
  }

  const ls = localStorage.getItem("lastStation");
  if (ls) {
    try {
      const { genre, trackIndex } = JSON.parse(ls);
      const playlistEntry = allPlaylists.find(pl => pl.name === genre || pl.file === genre);
      if (!playlistEntry) throw new Error("Genre not found");

      setSelectedGenre(playlistEntry.file, playlistEntry.name);
      initChat();
      loadAndRenderPlaylist(playlistEntry.file, playlistEntry.name, () => {
        const i = trackIndex < currentPlaylist.length ? trackIndex : 0;
        onStationSelect(i);
      });
      return;
    } catch (e) {}
  }
  defaultPlaylist();
}

// ---- Nostr mode: the social layer (js/nostr-mode.js) ----

function setPlaylistFromNostr(stations) {
  currentPlaylist = stations
  window.currentPlaylist = stations
  // keep the playing station selected if it is in the new list
  const idx = window.currentStationUrl ? stations.findIndex(s => s.url === window.currentStationUrl) : -1
  if (idx >= 0) currentTrackIndex = idx
  resetVisibleStations()
}

function leaveNostrIfNeeded() {
  if (currentMode !== "nostr") return
  leaveNostrMode()
  const nb = document.getElementById("nostrModeBtn")
  if (nb) { nb.classList.remove("active"); nb.title = "Nostr" }
}

// route: { input } (a pasted link / npub / naddr) or { tab }
function switchToNostr(route = {}) {
  if (currentMode === "nostr") {
    if (route.input || route.tab || route.login) enterNostrMode(nostrContext(), route)
    return
  }
  detachPlayback()
  leaveLocalIfNeeded()
  currentMode = "nostr"
  window.currentMode = currentMode
  persistCurrentMode("nostr")
  initChat()   // safe to repeat: the console is set up once (needed when the app starts in Nostr mode)
  const nb = document.getElementById("nostrModeBtn")
  if (nb) { nb.classList.add("active"); nb.title = "Back to radio" }
  // playback keeps going while the user browses; only the list area is taken over
  playlistElement.innerHTML = ""
  currentPlaylist = []
  enterNostrMode(nostrContext(), route)
}

function nostrContext() {
  return {
    listEl: playlistElement,
    scroller: playlistContainer,
    setPlaylist: setPlaylistFromNostr,
    play: (i) => onStationSelect(i),
    getCurrentLength: () => currentPlaylist.length,
    getFavoriteStations: () => createFavoritesPlaylist(),
    exit: () => switchToRadio()
  }
}

// favorites -> Nostr (used by the Share button in Favorites and by the Nostr dialogs)
window.fonyGetFavoriteStations = () => createFavoritesPlaylist()
document.addEventListener("fony:nostr-open", (e) => {
  const d = e.detail || {}
  if (d.input || d.tab || d.login) switchToNostr(d)
})
window.addEventListener("hashchange", () => {
  if (!isNostrHash() || window.innerWidth <= 768) return
  const input = location.hash.replace(/^#\/?nostr\//, "")
  if (currentMode === "nostr") handleNostrHash(location.hash)
  else switchToNostr({ input })
})

function setTrackText(text) {
  const rg = document.querySelector(".right-group")
  if (!rg) return
  rg.innerHTML = `
    <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
    <span id="currentTrack" class="track-name">
      <span class="scrolling-text"></span>
    </span>
  `
  rg.querySelector(".scrolling-text").textContent = text
  checkMarquee(rg)
}

function switchToLocal(opts = {}) {
  if (!isLocalSupported()) return
  // whatever is playing keeps playing (a local track that is already playing is simply taken over again)
  const keep = currentMode !== "local" ? detachPlayback() : !!detached
  leaveNostrIfNeeded()
  leaveLocalIfNeeded()
  const adopt = keep && detached.mode === "local"
  currentMode = "local"
  window.currentMode = currentMode
  persistCurrentMode("local")
  initChat()
  if (adopt) {
    currentPlaylist = detached.playlist
    currentTrackIndex = detached.index
    window.currentPlaylist = currentPlaylist
    detached = null
  } else {
    currentPlaylist = []
  }
  if (!keep) {
    window.currentGenre = "Local"
    if (window.playTimerInterval) {
      clearInterval(window.playTimerInterval)
      window.playTimerInterval = null
    }
    const pt = document.getElementById("playTimer")
    if (pt) pt.textContent = formatTime(0)
    audioPlayer.pause()
    audioPlayer.removeAttribute("src")
    audioPlayer.load()
    audioPlayer.oncanplay = null
    audioPlayer.onloadedmetadata = null
    audioPlayer.ontimeupdate = null
    currentParsingUrl = ""
    window.currentStationUrl = null
    setStationArt(null)
    clearDiscogsInfo()
  }
  playlistElement.innerHTML = ""
  // a list hidden by Nostr or by a Favorites load that was interrupted must not stay hidden (empty frame)
  playlistElement.classList.remove("hidden")
  playlistLoader.classList.add("hidden")
  const lb = document.getElementById("localModeBtn")
  if (lb) { lb.classList.add("active"); lb.title = "Back to radio" }
  setNowPlayingBarClickable(!keep || adopt)
  if (!keep) {
    const heart = document.getElementById("favBtn")
    if (heart) heart.src = (["dark", "glass"].includes(localStorage.getItem("theme")) ? "/img/dark/" : "/img/") + "fav.svg"
    if (stationLabel) {
      const t = stationLabel.querySelector(".scrolling-text")
      if (t) t.textContent = "Local files"
    }
    setTrackText("Pick a folder or playlist")
  }

  const g = document.querySelector(".genre-box")
  if (g) {
    g.innerHTML = `
      <button id="localAddFolderBtn" title="Add music folder" aria-label="Add music folder">
        <img src="/img/local.svg" alt="Add folder">
      </button>
      <span id="localModeLabel">My music</span>
      <div class="search-wrapper">
        <input type="text" id="searchInput" class="genre-search" name="fony-station-search" autocomplete="off" spellcheck="false" placeholder="Search this view">
        <span id="clearSearch">×</span>
      </div>
      <img src="/img/radio.svg" alt="Radio" id="radioModeBtn" style="cursor: pointer; width: 28px; height: 28px;">
    `
  }
  const r = document.getElementById("radioModeBtn")
  if (r) {
    r.style.display = "inline-block"
    r.addEventListener("click", () => switchToRadio())
  }
  enterLocalMode({
    list: playlistElement,
    scroller: playlistContainer,
    playQueue: (stations, start) => {
      currentPlaylist = stations
      window.currentPlaylist = stations
      onStationSelect(start)
    }
  })
  if (adopt) syncLocalFavIcon()
  // after a reload: the track that was playing comes back
  if (opts.restore && !keep) restoreLastLocalTrack()
}

let localPlayToken = 0

// The heart button in the player works on the playing local track.
function syncLocalFavIcon() {
  if (playingMode() !== "local") return
  const heart = document.getElementById("favBtn")
  const t = transport()
  const st = t.list[t.idx]
  if (!heart || !st || !st.local) return
  const prefix = ["dark", "glass"].includes(localStorage.getItem("theme")) ? "/img/dark/" : "/img/"
  heart.src = prefix + (isLocalFavorite(st) ? "fav_active.svg" : "fav.svg")
}

window.toggleLocalFavorite = function () {
  const t = transport()
  const st = t.list[t.idx]
  if (playingMode() !== "local" || !st || !st.local) return
  toggleLocalFavoriteTrack({ rootId: st.rootId, path: st.path })
  syncLocalFavIcon()
}
document.addEventListener("localFavoritesChanged", syncLocalFavIcon)
document.addEventListener("themeChanged", () => setTimeout(syncLocalFavIcon, 0))

async function playLocalStation(st, i) {
  const token = ++localPlayToken
  const queue = currentPlaylist
  try { localStorage.setItem("lastLocalTrack", JSON.stringify({ rootId: st.rootId, path: st.path })) } catch (_) {}
  if (playCheckTimer) { clearTimeout(playCheckTimer); playCheckTimer = null }
  if (window.playTimerInterval) { clearInterval(window.playTimerInterval); window.playTimerInterval = null }
  window.__localCoverFallback = null
  syncLocalActive()
  syncLocalFavIcon()
  if (stationLabel) {
    const t = stationLabel.querySelector(".scrolling-text")
    if (t) t.textContent = st.folderName || "Local files"
    checkMarquee(stationLabel)
  }
  setTrackText(st.title)

  let prepared
  try {
    prepared = await prepareTrack(st)
  } catch (err) {
    if (token !== localPlayToken) return
    console.warn("Local track unavailable:", err)
    setTrackText(`Unavailable: ${st.title}`)
    if (queue.length > 1) {
      setTimeout(() => {
        if (token === localPlayToken) playAt(i < queue.length - 1 ? i + 1 : 0)
      }, 800)
    }
    return
  }
  if (token !== localPlayToken) return

  st.trackTitle = prepared.title
  st.artist = prepared.artist
  st.cover = prepared.cover || ""
  window.__localCoverFallback = prepared.cover || null
  // "Artist - Title" is what the radio flow feeds to Discogs, so covers come from the same API.
  setTrackText(prepared.artist ? `${prepared.artist} - ${prepared.title}` : prepared.title)
  refreshNowPlaying()

  audioPlayer.src = prepared.url
  audioPlayer.onloadedmetadata = () => {
    const el = document.getElementById("playTimer")
    if (el && isFinite(audioPlayer.duration) && audioPlayer.duration) el.textContent = formatTime(Math.floor(audioPlayer.duration - audioPlayer.currentTime))
  }
  audioPlayer.ontimeupdate = () => {
    if (!audioPlayer.duration || !isFinite(audioPlayer.duration)) return
    const el = document.getElementById("playTimer")
    if (el) el.textContent = formatTime(Math.floor(audioPlayer.duration - audioPlayer.currentTime))
    setLocalProgress((audioPlayer.currentTime / audioPlayer.duration) * 100)
  }
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
  updateMediaSessionMetadata(st)
}

const localModeBtn = document.getElementById("localModeBtn")
if (localModeBtn) {
  localModeBtn.addEventListener("click", () => {
    if (typeof window.showDirectoryPicker !== "function") {
      showUnsupportedDialog()
      return
    }
    if (currentMode === "local") switchToRadio()
    else switchToLocal()
  })
}

function defaultPlaylist() {
  if (!allPlaylists.length) return
  const firstPlaylist = allPlaylists[0];
  setSelectedGenre(firstPlaylist.file, firstPlaylist.name);
  window.currentGenre = firstPlaylist.name
  initChat()
  loadAndRenderPlaylist(firstPlaylist.file, firstPlaylist.name, () => {
    if (currentPlaylist.length) {
      const i = 0
      onStationSelect(i)
      localStorage.setItem("lastStation", JSON.stringify({ genre: firstPlaylist.name, trackIndex: i }))
    }
  })
}

function loadAndRenderPlaylist(url, genreName = null, cb, scTop = false) {
  // Handle old API where genreName was not passed
  if (typeof genreName === 'function') {
    scTop = cb;
    cb = genreName;
    genreName = null;
  }

  playlistLoader.classList.remove("hidden")
  loadPlaylist(url, genreName)
    .then(s => {
      allStations = s
      applyModeSearch("radio")
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

// The "preloader" in the timer: ten colons that fill in smoothly while the stream buffers.
// It is driven by requestAnimationFrame and a CSS gradient (no text changes, so the timer box never
// changes width and the centred block does not wobble); the list row's bar updates every 100 ms.
let bufferingRun = 0
// The timer font has digits of different widths, which made the centred block jump every second.
// Each character of the time is put in a cell as wide as the widest digit (colon: its own width).
;(function fixedWidthTimer() {
  const el = document.getElementById("playTimer")
  if (!el) return
  let digitEm = 0
  let colonEm = 0
  const sync = () => {
    if (!digitEm) return
    const txt = el.textContent
    if (!/^\d+(:\d{2})+$/.test(txt)) return
    const cells = el.children
    if (cells.length === txt.length && cells[0] && cells[0].classList.contains("tc")) {
      for (let i = 0; i < txt.length; i++) if (cells[i].textContent !== txt[i]) cells[i].textContent = txt[i]
      return
    }
    const frag = document.createDocumentFragment()
    for (const ch of txt) {
      const c = document.createElement("span")
      c.className = "tc"
      c.style.width = (ch === ":" ? colonEm : digitEm) + "em"
      c.textContent = ch
      frag.appendChild(c)
    }
    el.textContent = ""
    el.appendChild(frag)
  }
  const measure = () => {
    const cs = getComputedStyle(el)
    const ctx = document.createElement("canvas").getContext("2d")
    ctx.font = `100px ${cs.fontFamily}`
    let d = 0
    for (let i = 0; i <= 9; i++) d = Math.max(d, ctx.measureText(String(i)).width)
    const spacing = (parseFloat(cs.letterSpacing) || 0) / (parseFloat(cs.fontSize) || 32)
    digitEm = d / 100 + spacing
    colonEm = ctx.measureText(":").width / 100 + spacing
    sync()
  }
  new MutationObserver(sync).observe(el, { childList: true, characterData: true, subtree: true })
  const fam = getComputedStyle(el).fontFamily
  if (document.fonts && document.fonts.load) document.fonts.load(`100px ${fam}`).then(measure, measure)
  else measure()
})()

// anything else writing a time into the timer ends the preloader look
;(function guardTimer() {
  const el = document.getElementById("playTimer")
  if (!el) return
  new MutationObserver(() => {
    if (el.classList.contains("buffering") && !/^:+$/.test(el.textContent)) {
      el.classList.remove("buffering")
      el.style.removeProperty("--tp")
    }
  }).observe(el, { childList: true, characterData: true, subtree: true })
})()
function checkRealBuffering(durationMs, li, cb) {
  if (!li) {
    cb()
    return
  }
  const run = ++bufferingRun
  li.classList.remove("buffer-complete")
  const p = document.getElementById("playTimer")
  const maxSteps = durationMs / 100
  li.style.setProperty("--buffer-percent", "0%")
  if (p) {
    p.textContent = ":::::::::::"
    p.style.setProperty("--tp", "0%")
    p.classList.add("buffering")
  }
  const start = performance.now()
  let lastStep = -1
  const frame = now => {
    const prog = Math.min(1, (now - start) / durationMs)
    if (run === bufferingRun && p) p.style.setProperty("--tp", (prog * 100).toFixed(1) + "%")
    const step = Math.floor(prog * maxSteps)
    if (step !== lastStep) {
      lastStep = step
      li.style.setProperty("--buffer-percent", (step / maxSteps) * 100 + "%")
    }
    if (prog < 1) { requestAnimationFrame(frame); return }
    if (run === bufferingRun && p) {
      p.classList.remove("buffering")
      p.style.removeProperty("--tp")
      p.textContent = formatTime(0)
    }
    li.classList.add("buffer-complete")
    setTimeout(() => {
      li.style.setProperty("--buffer-percent", "0%")
      li.classList.remove("buffer-complete")
      cb()
    }, 300)
  }
  requestAnimationFrame(frame)
}

function updateStreamMetadata(u) {
  if (playingMode() === "local" || !u) return
  if (u !== currentParsingUrl) return
  const rg = document.querySelector(".right-group")
  if (!rg) return
  rg.style.display = "flex"
  const t = new Promise(r => setTimeout(() => r(null), 15000))
  const p = getStreamMetadata(u)
  Promise.race([p, t]).then(r => {
    if (u !== currentParsingUrl) return
    if (r && r.trim() && r !== "No Metadata" && r !== "No Track Data") {
      const changed = lastValidNowPlaying !== r.trim()
      lastValidNowPlaying = r.trim()
      const su = "https://www.google.com/search?q=" + encodeURIComponent(lastValidNowPlaying)
      // The metadata is polled all the time: when the track is the same, leave the DOM alone,
      // otherwise the running marquee would restart from the beginning on every poll.
      const existing = rg.querySelector("a.scrolling-text")
      if (changed || !existing || existing.textContent !== lastValidNowPlaying) {
        // stream metadata is untrusted text (a shared station can send anything): never inject it as HTML
        rg.innerHTML = `
          <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
          <span id="currentTrack" class="track-name">
            <a target="_blank" rel="noopener noreferrer" class="scrolling-text"></a>
          </span>
        `
        const trackLink = rg.querySelector("a.scrolling-text")
        trackLink.href = su
        trackLink.textContent = lastValidNowPlaying
        checkMarquee(rg)
      }
      if (changed) announceNowPlaying(lastValidNowPlaying)
    } else {
      if (!lastValidNowPlaying) {
        rg.innerHTML = `
          <img src="/img/news_icon.svg" alt="Info Icon" class="track-icon">
          <span id="currentTrack" class="track-name">
            <span class="scrolling-text">No Data</span>
          </span>
        `
        checkMarquee(rg)
      }
    }
  })
}

// Tells the (opt-in) Nostr "now listening" publisher what is playing.
function announceNowPlaying(track, st) {
  const t = transport()
  const s = st || t.list[t.idx]
  const detail = !s || s.local
    ? { local: true }
    : { station: { url: unwrapProxyUrl(s.originalUrl || s.url), name: s.title || "", genre: s.favGenre || s.genre || "" }, track: track || "" }
  document.dispatchEvent(new CustomEvent("fony:nowplaying", { detail }))
}

function onStationSelect(i) {
  const st = currentPlaylist[i]
  if (!st) return
  if (!silentStep) {
    // a new start: the old playing list is no longer needed
    if (detached && detached.mode === "local" && !st.local) releaseLocalTrack()
    detached = null
  }
  clearDiscogsInfo();
  currentParsingUrl = ""
  ensureVisible(i)
  window.currentStationUrl = st.url
  renderStations(visibleStations)
  if (st.local) {
    announceNowPlaying("", st)
    currentTrackIndex = i
    setStationArt(null)
    playLocalStation(st, i)
    return
  }
  const lis = silentStep ? [] : document.querySelectorAll("#playlist li")
  lis.forEach(x => {
    x.classList.remove("active")
    x.style.setProperty("--buffer-percent", "0%")
  })
  const li = Array.from(lis).find(x => parseInt(x.dataset.index) === i)
  currentTrackIndex = i
  currentParsingUrl = st.originalUrl || st.url;
  const selectedGenre = getSelectedGenre();
  if (currentMode === "nostr") {
    // genre of the station, so a heart pressed here files it under the right genre
    window.currentGenre = st.genre || "World"
  } else if (selectedGenre.name && !st.local && !silentStep) {
    localStorage.setItem("lastStation", JSON.stringify({ genre: selectedGenre.name, trackIndex: i }))
    window.currentGenre = selectedGenre.name
  }
  savePlaybackState(st);
  announceNowPlaying("", st)
  if (stationLabel) {
    const t = stationLabel.querySelector(".scrolling-text")
    if (t) t.textContent = st.title || "Unknown Station"
    checkMarquee(stationLabel)
  }
  setStationArt(st)
  const rg = document.querySelector(".right-group")
  if (rg) {
    rg.innerHTML = `
      <img src="/img/track_icon.svg" alt="Track Icon" class="track-icon">
      <span id="currentTrack" class="track-name">
        <span class="scrolling-text loading"></span>
      </span>
    `
    checkMarquee(rg)
  }
  if (!st.url) return
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
    if (appInitialized && !silentStep) {
      playCheckTimer = setTimeout(() => {
        if (audioPlayer.paused) markStationAsHidden(i)
      }, 15000)
    }
    updateStreamMetadata(st.originalUrl || st.url)
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
        if (t) t.textContent = st.title || "Unknown Station"
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
    if (appInitialized && !silentStep) {
      playCheckTimer = setTimeout(() => {
        if (audioPlayer.paused) markStationAsHidden(i)
      }, 15000)
    }

    updateStreamMetadata(st.originalUrl || st.url)
    updateMediaSessionMetadata(st)
  }
}

async function createFavoritesPlaylist() {
  const favs = normalizeFavoritesStorage();
  let list = [];
  const favOrderMap = new Map(favs.map((fav, idx) => [fav.url, { ...fav, order: idx }]));
  for (let pl of allPlaylists) {
    const st = await loadPlaylist(pl.file, pl.name, { skipHttpsFilter: true });
    const matched = st.filter(x => favs.some(f => f.url === x.url));
    matched.forEach(x => {
      const favEntry = favs.find(f => f.url === x.url);
      let favGenre = pl.name;
      let favAddedAt = favOrderMap.get(x.url)?.addedAt;
      if (typeof favAddedAt !== "number") {
        favAddedAt = favOrderMap.get(x.url)?.order ?? 0;
      }

      // If favEntry has genre, use it (but convert file path to name if needed)
      if (favEntry && favEntry.genre) {
        if (favEntry.genre.startsWith('genres/')) {
          // Old format: genres/downtempo.m3u -> find matching playlist name
          const matchedPlaylist = allPlaylists.find(p => p.file === favEntry.genre);
          favGenre = matchedPlaylist ? matchedPlaylist.name : pl.name;
        } else {
          // New format: already a genre name like "Downtempo"
          favGenre = favEntry.genre;
        }
      }

      x.favGenre = favGenre;
      x.favAddedAt = favAddedAt;
    });
    list = list.concat(matched);
  }
  const uniqueStations = Array.from(new Map(list.map(o => [o.url, o])).values());
  return uniqueStations;
}

function setFavoritesPlaylistView(list) {
  const sortedFavorites = applyFavoritesSorting(list || []);
  favoritesBaseList = sortedFavorites.slice();
  applyModeSearch("favorites");
  if (!currentPlaylist.length) {
    playlistElement.innerHTML = `<li style="pointer-events:none;opacity:.7">No favorites yet</li>`;
  }
  toggleFavoritesSortVisibility(true);
  syncFavoritesSortSelect();
}


function setRadioListeners() {
  const sIn = document.getElementById("searchInput");
  const fBtn = document.getElementById("favoritesFilterBtn");
  const rBtn = document.getElementById("radioModeBtn");
  const sortSelect = document.getElementById("favoritesSortSelect");
  const customSelect = document.getElementById("customGenreSelect");

  if (rBtn) rBtn.style.display = "none";
  if (currentMode !== "radio" || !(fBtn && fBtn.classList.contains("active"))) {
    toggleFavoritesSortVisibility(false);
  }

  if (sortSelect) {
    sortSelect.value = getFavoritesSortMode();
    sortSelect.addEventListener("change", () => {
      setFavoritesSortMode(sortSelect.value);
      const isFavoritesView = getEffectiveMode() === "favorites";
      if (isFavoritesView) {
        setFavoritesPlaylistView(favoritesBaseList.slice());
      }
    });
  }

  if (sIn) {
    const clearBtn = document.getElementById("clearSearch");
    updateSearchInputByMode();

    const currentModeForInput = getEffectiveMode();
    if (currentModeForInput === "radio" && (searchByMode.radio || "").trim().length > 0 && !radioSearchPoolReady) {
      ensureRadioSearchPoolForCurrentQuery();
    }

    function updateClearBtn() {
      if (!clearBtn) return;
      clearBtn.style.display = sIn.value.length > 0 ? "block" : "none";
    }

    sIn.addEventListener("input", debounce(() => {
      const mode = getEffectiveMode();
      searchByMode[mode] = sIn.value;
      saveSearchState();
      const query = (searchByMode[mode] || "").trim();

      if (mode === "radio" && query.length > 0 && !radioSearchPoolReady) {
        // Immediate local feedback while global index is still building
        currentPlaylist = (allStations || []).filter(st => getStationSearchText(st).includes(query.toLowerCase()));
        resetVisibleStations();

        if (!radioSearchLoading) {
          ensureRadioSearchPoolForCurrentQuery();
        }
      } else {
        applyModeSearch(mode);
        if (mode === "radio" && query.length === 0) {
          scheduleRadioSearchPoolRelease();
        }
      }

      updateClearBtn();
    }, 300));

    sIn.addEventListener("change", updateClearBtn);
    sIn.addEventListener("keyup", updateClearBtn);

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const mode = getEffectiveMode();
        searchByMode[mode] = "";
        saveSearchState();
        sIn.value = "";
        applyModeSearch(mode);
        if (mode === "radio") {
          scheduleRadioSearchPoolRelease();
        }
        updateClearBtn();
      });
    }

    updateClearBtn();
  }

  if (fBtn) {
    fBtn.addEventListener("click", async () => {
      if (fBtn.disabled) return;
      fBtn.disabled = true;
      const genreLabel = document.querySelector("label[for='customGenreSelect']");
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
          fBtn.src = "/img/fav_list.svg";
          persistCurrentMode("radio");
          if (customSelect) customSelect.style.display = "";
          if (genreLabel) genreLabel.textContent = "Genre:";
          updateSearchInputByMode();
          toggleFavoritesSortVisibility(false);
          scheduleRadioSearchPoolRelease();
          ensureRadioSearchPoolForCurrentQuery();
          if (allStations.length) {
            applyModeSearch("radio");
          } else {
            switchToRadio(true);
            return;
          }
        } else {
          fBtn.classList.add("active");
          fBtn.src = "/img/radio.svg";
          persistCurrentMode("favorites");
          scheduleRadioSearchPoolRelease();
          if (customSelect) customSelect.style.display = "none";
          if (genreLabel) genreLabel.textContent = "Favorites";
          updateSearchInputByMode();
          const favoritesList = await createFavoritesPlaylist();
          setFavoritesPlaylistView(favoritesList);
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

  const addBtn = document.getElementById('addPlaylistBtn');
  if (addBtn) {
    addBtn.onclick = openAddPlaylistModal;
  }

}

const MERGED_PLAYLIST_FOLDERS = ['0-9', ...'abcdefghijklmnopqrstuvwxyz'];

async function loadMergedPlaylistFolder(folder) {
  const toggle = document.getElementById('mergedPlaylistCatalogToggle');
  const text = document.getElementById('mergedPlaylistCatalogText');
  const list = document.getElementById('mergedPlaylistCatalogList');
  const status = document.getElementById('mergedPlaylistStatus');
  if (!toggle || !text || !list || !status) return;

  toggle.disabled = true;
  text.textContent = 'Loading…';
  list.innerHTML = '';
  status.textContent = `Loading “${folder}” playlists…`;

  try {
    const playlists = await fetchMergedPlaylistFolder(folder);
    const fragment = document.createDocumentFragment();
    for (const playlist of playlists) {
      const item = document.createElement('li');
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'merged-playlist-catalog-option';
      option.dataset.url = playlist.url;
      option.dataset.name = playlist.name;
      option.setAttribute('role', 'option');
      option.textContent = playlist.name;
      item.appendChild(option);
      fragment.appendChild(item);
    }
    list.appendChild(fragment);
    text.textContent = 'Choose playlist';
    status.textContent = `${playlists.length} playlists in “${folder}”.`;
  } catch (error) {
    console.warn('Could not load merged M3U catalog:', error);
    status.textContent = error.message || 'Could not load this folder. Please try again.';
    text.textContent = 'Choose another folder';
  } finally {
    toggle.disabled = false;
  }
}

function openAddPlaylistModal() {
  const modal = document.getElementById('addPlaylistModal');
  if (!modal) return;
  document.getElementById('addPlaylistUrl').value = '';
  document.getElementById('addPlaylistName').value = '';
  document.getElementById('addPlaylistError').textContent = '';
  document.getElementById('mergedPlaylistFolderText').textContent = 'Folder';
  document.getElementById('mergedPlaylistCatalogText').textContent = 'Choose a folder first';
  document.getElementById('mergedPlaylistCatalogToggle').disabled = true;
  document.getElementById('mergedPlaylistCatalogList').innerHTML = '';
  document.getElementById('mergedPlaylistStatus').textContent = '';
  modal.classList.remove('closing');
  document.body.classList.add('add-playlist-open');
  modal.style.display = 'block';
  positionAddPlaylistPopover();
  document.getElementById('addPlaylistUrl').focus({ preventScroll: true });
}

// The form opens as a popover centred over the station list; the rest of the page stays untouched.
function positionAddPlaylistPopover() {
  const box = document.querySelector('#addPlaylistModal .add-playlist-content');
  if (!box) return;
  const margin = 8;
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const area = (document.getElementById('playlistContent') || document.body).getBoundingClientRect();
  const cx = area.left + area.width / 2;
  // sit a bit above the middle of the list
  const cy = area.top + Math.min(area.height, window.innerHeight - area.top) * 0.38;
  const left = Math.max(margin, Math.min(cx - w / 2, window.innerWidth - w - margin));
  const top = Math.max(margin, Math.min(cy - h / 2, window.innerHeight - h - margin));
  box.style.left = left + 'px';
  box.style.top = top + 'px';
}

function closeAddPlaylistModal() {
  const modal = document.getElementById('addPlaylistModal');
  if (!modal || modal.style.display === 'none' || modal.classList.contains('closing')) return;
  document.body.classList.remove('add-playlist-open');
  const box = modal.querySelector('.add-playlist-content');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!box || reduce) { modal.style.display = 'none'; return; }
  modal.classList.add('closing');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    modal.classList.remove('closing');
    modal.style.display = 'none';
  };
  box.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 300);
}

document.addEventListener('mousedown', (e) => {
  const modal = document.getElementById('addPlaylistModal');
  if (!modal || modal.style.display === 'none') return;
  if (e.target.closest('.add-playlist-content') || e.target.closest('#addPlaylistBtn')) return;
  closeAddPlaylistModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAddPlaylistModal();
});
window.addEventListener('resize', () => {
  const modal = document.getElementById('addPlaylistModal');
  if (modal && modal.style.display !== 'none') positionAddPlaylistPopover();
});

document.addEventListener('DOMContentLoaded', () => {
  const initialAddBtn = document.getElementById('addPlaylistBtn');
  if (initialAddBtn) initialAddBtn.onclick = openAddPlaylistModal;

  const closeBtn = document.getElementById('addPlaylistClose');
  if (closeBtn) closeBtn.addEventListener('click', closeAddPlaylistModal);

  const modal = document.getElementById('addPlaylistModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAddPlaylistModal();
    });
  }

  const urlInput = document.getElementById('addPlaylistUrl');
  const nameInput = document.getElementById('addPlaylistName');
  const mergedFolderCatalog = document.getElementById('mergedPlaylistFolderCatalog');
  const mergedFolderToggle = document.getElementById('mergedPlaylistFolderToggle');
  const mergedFolderList = document.getElementById('mergedPlaylistFolderList');
  const mergedCatalog = document.getElementById('mergedPlaylistCatalog');
  const mergedCatalogToggle = document.getElementById('mergedPlaylistCatalogToggle');
  const mergedCatalogList = document.getElementById('mergedPlaylistCatalogList');

  if (mergedFolderCatalog && mergedFolderToggle && mergedFolderList) {
    const folderFragment = document.createDocumentFragment();
    for (const folder of MERGED_PLAYLIST_FOLDERS) {
      const item = document.createElement('li');
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'merged-playlist-catalog-option merged-playlist-folder-option';
      option.dataset.folder = folder;
      option.textContent = folder.toUpperCase();
      item.appendChild(option);
      folderFragment.appendChild(item);
    }
    mergedFolderList.appendChild(folderFragment);

    mergedFolderToggle.addEventListener('click', () => {
      const isOpen = mergedFolderCatalog.classList.toggle('open');
      mergedFolderToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mergedFolderList.addEventListener('click', (event) => {
      const option = event.target.closest('.merged-playlist-folder-option');
      if (!option) return;
      const folder = option.dataset.folder;
      document.getElementById('mergedPlaylistFolderText').textContent = folder.toUpperCase();
      mergedFolderCatalog.classList.remove('open');
      mergedFolderToggle.setAttribute('aria-expanded', 'false');
      loadMergedPlaylistFolder(folder);
    });
  }

  if (mergedCatalog && mergedCatalogToggle && mergedCatalogList && nameInput && urlInput) {
    mergedCatalogToggle.addEventListener('click', () => {
      const isOpen = mergedCatalog.classList.toggle('open');
      mergedCatalogToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mergedCatalogList.addEventListener('click', (event) => {
      const option = event.target.closest('.merged-playlist-catalog-option');
      if (!option) return;
      urlInput.value = option.dataset.url;
      nameInput.value = option.dataset.name || option.textContent;
      document.getElementById('addPlaylistError').textContent = '';
      document.getElementById('mergedPlaylistCatalogText').textContent = option.textContent;
      mergedCatalog.classList.remove('open');
      mergedCatalogToggle.setAttribute('aria-expanded', 'false');
    });
  }
  if (urlInput && nameInput) {
    urlInput.addEventListener('blur', () => {
      const url = urlInput.value.trim();
      if (url && !nameInput.value.trim()) {
        nameInput.value = suggestNameFromUrl(normalizePlaylistUrl(url));
      }
    });
  }

  const saveBtn = document.getElementById('addPlaylistSave');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const rawUrl = (document.getElementById('addPlaylistUrl').value || '').trim();
      const name = (document.getElementById('addPlaylistName').value || '').trim();
      const errEl = document.getElementById('addPlaylistError');
      errEl.textContent = '';

      if (!rawUrl) { errEl.textContent = 'Please enter a URL.'; return; }
      if (!name) { errEl.textContent = 'Please enter a name.'; return; }

      const url = normalizePlaylistUrl(rawUrl);

      saveBtn.disabled = true;
      saveBtn.textContent = 'Loading…';

      try {
        await fetch(url, { method: 'HEAD' }).then(r => { if (!r.ok) throw new Error('not ok'); });
      } catch {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error('fetch failed');
        } catch {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Add Playlist';
          errEl.textContent = 'Could not load playlist. Check the URL or CORS policy.';
          return;
        }
      }

      const entry = saveCustomPlaylist(name, url);
      allPlaylists.unshift(entry);
      fillPlaylistSelect(false);
      if (window.addPlaylistToFavCache) window.addPlaylistToFavCache(entry);
      closeAddPlaylistModal();
      saveBtn.disabled = false;
      saveBtn.textContent = 'Add Playlist';

      // Select the newly added playlist
      setTimeout(() => {
        window.currentGenre = name;
        loadAndRenderPlaylist(url, name);
        setSelectedGenre(url, name);
      }, 100);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAddPlaylistModal();
  });
});


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

  const tp = transport()
  const playing = tp.list[tp.idx]
  if (playing && !playing.local && playingMode() !== "nostr") {
    trackListen(playing.favGenre || getSelectedGenre().name || window.currentGenre)
  } else {
    stopTasteTracking()
  }
  if (!(playing && playing.local)) {
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
  const t = transport()
  if (playingMode() === "local" && t.list.length) {
    let next = t.idx < t.list.length - 1 ? t.idx + 1 : 0
    if (shuffleActive && t.list.length > 1) {
      do { next = Math.floor(Math.random() * t.list.length) } while (next === t.idx)
    }
    fadeAudioOut(audioPlayer, 500, () => playAt(next))
    return
  }
})

audioPlayer.addEventListener("pause", () => {
  stopTasteTracking()
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
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    const t = transport()
    if (t.idx > 0) {
      audioPlayer.volume = 0;
      playAt(t.idx - 1);
    }
  })
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    const t = transport()
    if (shuffleActive) {
      let r;
      do {
        r = Math.floor(Math.random() * t.list.length);
      } while (r === t.idx && t.list.length > 1);
      audioPlayer.volume = 0;
      playAt(r);
    } else {
      const next = t.idx < t.list.length - 1 ? t.idx + 1 : 0;
      audioPlayer.volume = 0;
      playAt(next);
    }
  })
}

playlistContainer.addEventListener("scroll", () => {
  const { scrollTop, clientHeight, scrollHeight } = playlistContainer
  if (scrollTop + clientHeight >= scrollHeight - 50) renderMoreStations()
})

playlistElement.addEventListener("click", e => {
  const li = e.target.closest("li")
  if (!li || li.dataset.index === undefined) return
  const index = parseInt(li.dataset.index)
  onStationSelect(index)
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
    if (transport().idx > 0) {
      fadeAudioOut(audioPlayer, 500, () => {
        playAt(transport().idx - 1)
      })
    }
  })
}

if (ffBtn) {
  ffBtn.addEventListener("click", () => {
    const t = transport()
    if (shuffleActive) {
      let r;
      do {
        r = Math.floor(Math.random() * t.list.length);
      } while (r === t.idx && t.list.length > 1);
      fadeAudioOut(audioPlayer, 500, () => playAt(r));
    } else {
      if (t.idx < t.list.length - 1) {
        fadeAudioOut(audioPlayer, 500, () => playAt(t.idx + 1));
      } else {
        fadeAudioOut(audioPlayer, 500, () => playAt(0));
      }
    }
  });
}



if (shuffleBtn) {
  shuffleBtn.addEventListener("click", () => {
    shuffleActive = !shuffleActive
    updateShuffleButton(shuffleActive, shuffleBtn)
  })
}

if (randomBtn) {
  randomBtn.addEventListener("click", () => {
    if (currentMode === "local") {
      fadeAudioOut(audioPlayer, 500, () => playLocalRandom())
      return
    }
    if (currentMode === "nostr") {
      // pick another station from the list that is open in Nostr mode
      if (currentPlaylist.length > 1) {
        let r
        do { r = Math.floor(Math.random() * currentPlaylist.length) } while (r === currentTrackIndex)
        fadeAudioOut(audioPlayer, 500, () => onStationSelect(r))
      }
    } else {
      fadeAudioOut(audioPlayer, 500, () => {
        if (!allPlaylists.length) return;
        const randomPlaylist = pickTastePlaylist(allPlaylists);
        setSelectedGenre(randomPlaylist.file, randomPlaylist.name);
        window.currentGenre = randomPlaylist.name;
        loadAndRenderPlaylist(randomPlaylist.file, randomPlaylist.name, () => {
          if (currentPlaylist.length) {
            const idx = Math.floor(Math.random() * currentPlaylist.length);
            onStationSelect(idx);
          }
        });
      });
    }
  });
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
  const randomGenreEntry = allPlaylists[randomGenreIndex];
  const randomGenre = randomGenreEntry.file;
  setSelectedGenre(randomGenreEntry.file, randomGenreEntry.name);
  window.currentGenre = randomGenreEntry.name;
  initChat();
  loadAndRenderPlaylist(randomGenre, () => {
    if (currentPlaylist.length) {
      const randomStationIndex = Math.floor(Math.random() * currentPlaylist.length);
      onStationSelect(randomStationIndex);
      localStorage.setItem("lastStation", JSON.stringify({ genre: randomGenre, trackIndex: randomStationIndex }));
    }
  });
}

async function restoreRadioPlayback() {
  if (window.location.hash) {
    let hashGenre = "";
    let stationHash = "";
    const locationHash = window.location.hash.slice(1);
    if (locationHash.includes("/")) {
      const parts = locationHash.split("/");
      if (parts.length === 2) {
        hashGenre = decodeURIComponent(parts[0]);
        stationHash = parts[1];
      }
    }

    if (hashGenre && stationHash) {
      const playlistEntry = allPlaylists.find(pl => pl.name === hashGenre || pl.file === hashGenre);
      if (playlistEntry) {
        setSelectedGenre(playlistEntry.file, playlistEntry.name);
        window.currentGenre = playlistEntry.name;
        initChat();
        loadAndRenderPlaylist(playlistEntry.file, () => {
          const foundIndex = currentPlaylist.findIndex(x => generateStationHash(x.url) === stationHash);
          if (foundIndex !== -1) {
            onStationSelect(foundIndex);
              } else {
            defaultPlaylist();
          }
        });
        return;
      }
    }
  }

  switchToRadio(true);
}

async function restoreFavoritesPlayback() {
  switchToRadio(false);
  initChat();

  const favoritesBtn = document.getElementById("favoritesFilterBtn");
  const customSelect = document.getElementById("customGenreSelect");
  const genreLabel = document.querySelector("label[for='customGenreSelect']");
  if (!favoritesBtn) return;

  favoritesBtn.classList.add("active");
  favoritesBtn.src = "/img/radio.svg";
  if (customSelect) customSelect.style.display = "none";
  if (genreLabel) genreLabel.textContent = "Favorites";
  persistCurrentMode("favorites");
  updateSearchInputByMode();

  const favoritesList = await createFavoritesPlaylist();
  setFavoritesPlaylistView(favoritesList);

  const targetUrl = localStorage.getItem(LAST_FAVORITES_TRACK_KEY);
  if (!targetUrl) return;

  let trackIndex = currentPlaylist.findIndex(st => st.url === targetUrl);
  if (trackIndex < 0) {
    const baseIndex = favoritesBaseList.findIndex(st => st.url === targetUrl);
    if (baseIndex >= 0) {
      searchByMode.favorites = "";
      saveSearchState();
      updateSearchInputByMode();
      applyModeSearch("favorites");
      trackIndex = currentPlaylist.findIndex(st => st.url === targetUrl);
    }
  }

  if (trackIndex >= 0) {
    onStationSelect(trackIndex);
  }
}


fetch("../json/playlists.json")
  .then(r => r.json())
  .then(async pl => {
    allPlaylists = [...loadCustomPlaylists(), ...pl];

    initCustomGenreSelect(allPlaylists, (file, name) => {
      window.currentGenre = name;
      loadAndRenderPlaylist(file, name, () => {
        applyModeSearch("radio");
      });
    }, { autoSelectFirst: false, onDelete: handleDeleteCustomPlaylist });

    loadSearchState();
    const hasRadioRestoreState = !!localStorage.getItem(LAST_RADIO_TRACK_KEY) || !!localStorage.getItem("lastStation");
    const favoritesRaw = localStorage.getItem("favorites");
    let hasFavoritesRestoreState = !!localStorage.getItem(LAST_FAVORITES_TRACK_KEY);
    if (!hasFavoritesRestoreState && favoritesRaw) {
      try { hasFavoritesRestoreState = Array.isArray(JSON.parse(favoritesRaw)) && JSON.parse(favoritesRaw).length > 0 } catch (_) {}
    }
    const hasDirectRoute = !!window.location.hash || (window.location.pathname !== "/" && window.location.pathname !== "");

    if (isFirstLaunch() && !hasRadioRestoreState && !hasFavoritesRestoreState && !hasDirectRoute) {
      playRandomGenreAndStation();
      markFirstLaunchDone();
      return;
    }

    const savedMode = getSavedMode();

    // a Nostr link (#nostr/…) opens straight in Nostr mode
    if (isNostrHash() && window.innerWidth > 768) {
      switchToNostr({ input: location.hash.replace(/^#\/?nostr\//, "") });
      markFirstLaunchDone();
      return;
    }

    if (savedMode === "nostr" && window.innerWidth > 768) {
      switchToNostr({ restore: true });
      markFirstLaunchDone();
      return;
    }

    if (savedMode === "local" && isLocalSupported()) {
      switchToLocal({ restore: true });
      markFirstLaunchDone();
      return;
    }

    if (savedMode === "favorites") {
      await restoreFavoritesPlayback();
      markFirstLaunchDone();
      return;
    }

    if (playRandomFromUrlGenre()) {
      markFirstLaunchDone();
      return;
    }

    await restoreRadioPlayback();
    markFirstLaunchDone();
  })
  .catch(() => {
    switchToRadio(false);
    playRandomGenreAndStation();
    markFirstLaunchDone();
    setRadioListeners();
  });


  
window.__fonyAppLoaded = true
document.dispatchEvent(new Event("appLoaded"))

const container = document.querySelector('.container');
const leftPanel = document.querySelector('.left-panel');
const rightPanel = document.querySelector('.right-panel');
const resizer = document.getElementById('resizer');
let isResizing = false;
let startX;
let startLeftWidthPercent;
let lastLeftWidthPercent = null;

const PANEL_WIDTH_KEY = 'panelWidthPercent';
const isDesktopLayout = () => window.innerWidth > 768;

function setPanelWidth(percent) {
  leftPanel.style.width = `${percent}%`;
  rightPanel.style.width = `${100 - percent}%`;
  resizer.style.left = `calc(${percent}% - ${resizer.offsetWidth / 2}px)`;
}

function clearPanelWidth() {
  leftPanel.style.width = '';
  rightPanel.style.width = '';
  resizer.style.left = '';
}

function getSavedPanelWidth() {
  const v = parseFloat(localStorage.getItem(PANEL_WIDTH_KEY));
  // clamp instead of rejecting: a drag to the limit can be stored as 39.99 / 70.01
  return Number.isFinite(v) ? Math.min(70, Math.max(40, v)) : null;
}

// Restore the width the user dragged to. Inline widths would break the stacked
// mobile layout, so they are only applied on desktop and cleared otherwise.
function applySavedPanelWidth() {
  const saved = getSavedPanelWidth();
  if (saved !== null && isDesktopLayout()) setPanelWidth(saved);
  else clearPanelWidth();
}
applySavedPanelWidth();
window.addEventListener('resize', applySavedPanelWidth);

resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  startX = e.clientX;
  startLeftWidthPercent = (leftPanel.offsetWidth / container.clientWidth) * 100;
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
});

// double-click the divider to go back to the default width
resizer.addEventListener('dblclick', () => {
  localStorage.removeItem(PANEL_WIDTH_KEY);
  clearPanelWidth();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const containerWidth = container.clientWidth;
  const dx = e.clientX - startX;
  const dxPercent = (dx / containerWidth) * 100;
  let newLeftWidthPercent = startLeftWidthPercent + dxPercent;
  if (newLeftWidthPercent < 40) newLeftWidthPercent = 40;
  if (newLeftWidthPercent > 70) newLeftWidthPercent = 70;
  lastLeftWidthPercent = newLeftWidthPercent;
  setPanelWidth(newLeftWidthPercent);
});

document.addEventListener('mouseup', () => {
  if (isResizing && lastLeftWidthPercent !== null) {
    localStorage.setItem(PANEL_WIDTH_KEY, lastLeftWidthPercent.toFixed(2));
  }
  isResizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});




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
  const base = FONY_BACKEND_URL;
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

// window.preloadedFavorites = null;
// async function preloadFavorites() {
//   const fav = JSON.parse(localStorage.getItem("favorites") || "[]");
//   let favList = [];
//   for (let favItem of fav) {
//     const pl = allPlaylists.find(pl => pl.file === favItem.genre);
//     if (!pl) continue;
//     const st = await loadPlaylist(pl.file);
//     const station = st.find(x => x.url === favItem.url);
//     if (station) favList.push(station);
//   }
//   window.preloadedFavorites = Array.from(new Map(favList.map(o => [o.url, o])).values());
// }
// document.addEventListener("appLoaded", () => {
//   if (Array.isArray(allPlaylists) && allPlaylists.length) {
//     preloadFavorites();
//   }
// });
// document.addEventListener("favoritesChanged", () => {
//   if (Array.isArray(allPlaylists) && allPlaylists.length) {
//     preloadFavorites();
//   }
// });
// window.usePreloadedFavorites = function() {
//   if (window.preloadedFavorites) {
//     currentPlaylist = window.preloadedFavorites;
//     resetVisibleStations();
//     return true;
//   }
//   return false;
// }
// const oldSetRadioListeners = setRadioListeners;
// setRadioListeners = function() {
//   oldSetRadioListeners();
//   const fBtn = document.getElementById("favoritesFilterBtn");
//   if (fBtn && !fBtn._patched) {
//     fBtn._patched = true;
//     const origClick = fBtn.onclick || (()=>{});
//     fBtn.addEventListener("click", function patchFav(e) {
//       setTimeout(() => {
//         if (fBtn.classList.contains("active")) {
//           if (window.usePreloadedFavorites()) return;
//         }
//       }, 10);
//       if (typeof origClick === "function") origClick.call(this, e);
//     });
//   }
// };
// const origToggleFavorite = window.toggleFavorite;
// window.toggleFavorite = function(url) {
//   if (typeof origToggleFavorite === "function") origToggleFavorite(url);
//   document.dispatchEvent(new Event("favoritesChanged"));
// }

(function(){
  const cache = { list: [], byGenre: {}, ready: false };
  function dedupe(list){ return Array.from(new Map(list.map(s=>[s.url,s])).values()); }

  // Find genre name for a station URL
  function findGenreForUrl(stationUrl, favEntry) {
    if (favEntry && favEntry.genre) return favEntry.genre;

    // Search through all loaded playlists
    for (const [genre, stations] of Object.entries(cache.byGenre)) {
      if (stations && stations.find(s => s.url === stationUrl)) {
        return genre;
      }
    }
    return "World";
  }

  // concurrent callers share one run (a second run used to see a half-filled catalog)
  let warming = null;
  function warm(force=false){
    if (!warming || force) warming = warmImpl(force).finally(() => { warming = null; });
    return warming;
  }
  async function warmImpl(force=false){
    const favs = normalizeFavoritesStorage();
    if(!Array.isArray(favs)||!favs.length){ cache.list=[]; cache.ready=true; window.preloadedFavorites=[]; return []; }

    // Load all playlists to find stations
    if(force || Object.keys(cache.byGenre).length === 0) {
      await Promise.all(
        (Array.isArray(allPlaylists) ? allPlaylists : []).map(async pl => {
          try {
            cache.byGenre[pl.name] = await loadPlaylist(pl.file, pl.name, { skipHttpsFilter: true });
          } catch(e) {
            cache.byGenre[pl.name] = [];
          }
        })
      );
    }

    const out=[];
    const remembered = getRememberedStations();
    favs.forEach((fav, idx) => {
      let found = false;
      // Search for station in all genres
      for (const [genre, stations] of Object.entries(cache.byGenre)) {
        const st = stations && stations.find(s => s.url === fav.url);
        if(st) {
          let favGenre = genre;
          if (fav.genre && fav.genre.trim()) {
            if (fav.genre.startsWith('genres/')) {
              // Old format: genres/downtempo.m3u -> find matching playlist name
              const matchedPlaylist = allPlaylists.find(p => p.file === fav.genre);
              favGenre = matchedPlaylist ? matchedPlaylist.name : genre;
            } else {
              // New format: already a genre name
              favGenre = fav.genre;
            }
          }
          st.favGenre = favGenre;
          st.favAddedAt = typeof fav.addedAt === "number" ? fav.addedAt : idx;
          out.push(st);
          found = true;
          break;
        }
      }
      // stations imported from Nostr that are not in the genre catalog
      if (!found && remembered.has(fav.url)) {
        const st = { ...remembered.get(fav.url) };
        st.favGenre = (fav.genre && fav.genre.trim()) || st.genre || "World";
        st.favAddedAt = typeof fav.addedAt === "number" ? fav.addedAt : idx;
        out.push(st);
      }
    });

    cache.list = dedupe(out);
    cache.ready = true;
    window.preloadedFavorites = cache.list;
    return cache.list;
  }
  function waitAndWarm(){
    let n=0, m=400;
    (function tick(){
      if(Array.isArray(allPlaylists)&&allPlaylists.length){ warm(); }
      else if(n++<m){ setTimeout(tick,50); }
    })();
  }
  document.addEventListener("DOMContentLoaded", waitAndWarm);
  document.addEventListener("favoritesChanged", ()=>warm());
  window.addPlaylistToFavCache = async function(pl) {
    try {
      cache.byGenre[pl.name] = await loadPlaylist(pl.file, pl.name, { skipHttpsFilter: true });
    } catch(e) {
      cache.byGenre[pl.name] = [];
    }
  };
  window.usePreloadedFavorites = function(){
    if(cache.ready){
      setFavoritesPlaylistView(cache.list ? cache.list.slice() : []);
      return true;
    }
    return false;
  };

  try{
    const __origCFP = createFavoritesPlaylist;
    createFavoritesPlaylist = async function(){ if(!cache.ready) await warm(); return cache.list; };
  }catch(e){}

  (function(){
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k,v){
      const before = localStorage.getItem(k);
      const r = origSetItem(k,v);
      if(k==="favorites" && before!==v){ try{ document.dispatchEvent(new Event("favoritesChanged")); }catch(_){} }
      return r;
    };
  })();

  function fastToggleFavorites(e){
    const btn = e.target && (e.target.id==="favoritesFilterBtn" ? e.target : e.target.closest && e.target.closest("#favoritesFilterBtn"));
    if(!btn) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if(btn.disabled) return;
    const customSelect = document.getElementById("customGenreSelect");
    const genreLabel = document.querySelector("label[for='customGenreSelect']");
    if(btn.classList.contains("active")){
      btn.classList.remove("active");
      btn.src = "/img/fav_list.svg";
      if(customSelect) customSelect.style.display="";
      if(genreLabel) genreLabel.textContent="Genre:";
      persistCurrentMode("radio");
      updateSearchInputByMode();
      toggleFavoritesSortVisibility(false);
      if (allStations.length) {
        applyModeSearch("radio");
      } else {
        switchToRadio(true);
      }
      return;
    }
    btn.classList.add("active");
    btn.src = "/img/radio.svg";
    if(customSelect) customSelect.style.display="none";
    if(genreLabel) genreLabel.textContent="Favorites";
    persistCurrentMode("favorites");
    updateSearchInputByMode();
    toggleFavoritesSortVisibility(true);
    if(cache.ready){
      setFavoritesPlaylistView(cache.list ? cache.list.slice() : []);
      return;
    }
    playlistElement.classList.add("hidden");
    playlistLoader.classList.remove("hidden");
    let dots=0, t=setInterval(()=>{ dots=(dots+1)%4; playlistLoader.textContent=":".repeat(dots)+":".repeat(dots); },250);
    warm().then(list=>{
      setFavoritesPlaylistView(list);
    }).finally(()=>{
      clearInterval(t);
      playlistLoader.classList.add("hidden");
      playlistLoader.textContent="";
      playlistElement.classList.remove("hidden");
    });
  }

  (function attachHijack(){
    document.addEventListener("click", fastToggleFavorites, true);
  })();
})();

// /mood feature hooks
window.getMoodStationPool = () => prepareRadioSearchPool();
window.playStationDirect = function(st) {
  if (!st || !st.url) return;
  clearDiscogsInfo();
  currentParsingUrl = st.originalUrl || st.url;
  window.currentStationUrl = st.url;
  lastValidNowPlaying = "";
  if (stationLabel) {
    const t = stationLabel.querySelector(".scrolling-text");
    if (t) t.textContent = st.title || "Unknown Station";
  }
  const rg = document.querySelector(".right-group");
  if (rg) {
    rg.innerHTML = `<img src="/img/track_icon.svg" alt="Track Icon" class="track-icon"><span id="currentTrack" class="track-name"><span class="scrolling-text loading"></span></span>`;
  }
  const ppBtn = document.getElementById("playPauseBtn");
  audioPlayer.src = secureUrl(st.url);
  audioPlayer.oncanplay = () => {
    audioPlayer.oncanplay = null;
    audioPlayer.muted = false;
    audioPlayer.volume = defaultVolume.value;
    audioPlayer.play().catch(() => {});
    fadeAudioIn(audioPlayer, defaultVolume.value, 1000);
    if (ppBtn) updatePlayPauseButton(audioPlayer, ppBtn);
  };
  updateStreamMetadata(currentParsingUrl);
  updateMediaSessionMetadata(st);
};
