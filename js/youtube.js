const YT_LS_KEY = "youtubeItems";
let ytItems = [];
let ytModeOn = false;
let player = null;
let currentIndex = -1;
let currentIsPlaylist = false;
let isPlaying = false;

const $ = s => document.querySelector(s);
function loadLS(){ try { ytItems = JSON.parse(localStorage.getItem(YT_LS_KEY) || "[]"); } catch{ ytItems=[]; } }
function saveLS(){ localStorage.setItem(YT_LS_KEY, JSON.stringify(ytItems)); }
function createEl(tag, attrs={}, children=[]) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  });
  [].concat(children).filter(Boolean).forEach(ch => el.appendChild(ch));
  return el;
}

function parseYouTubeUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./,'');
    const isYTM = host.includes("music.youtube.com");
    const isYTU = host.includes("youtube.com") || host.includes("youtu.be") || isYTM;
    if (!isYTU) return null;
    const list = url.searchParams.get("list");
    if (list && list.startsWith("PL")) {
      return { type: "playlist", id: list };
    }
    let vid = url.searchParams.get("v");
    if (!vid && host === "youtu.be") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length) vid = parts[0];
    }
    if (vid && vid.length >= 8) {
      return { type: "video", id: vid };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchVideoOEmbedTitleThumb(videoUrl) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`);
    if (!res.ok) return null;
    const j = await res.json();
    return { title: j.title, thumb: j.thumbnail_url };
  } catch { return null; }
}

function makePlaylistMeta(listId, url){
  return {
    title: `Playlist ${listId}`,
    thumb: `https://i.ytimg.com/vi/0/default.jpg`,
  };
}

function injectYouTubeTopIcon() {
  const bar = document.querySelector(".top-bar");
  if (!bar || bar.querySelector("#youTubeModeBtn")) return;
  const btn = createEl("img", {
    id: "youTubeModeBtn",
    src: "/img/youtube.svg",
    alt: "YouTube Mode",
    className: "youtube-mode-btn",
    style: {
      cursor: "pointer",
      width: "24px",
      height: "24px",
      position: "absolute",
      left: "12px",
      top: "12px",
      filter: "drop-shadow(0px 2px 3px rgba(0,0,0,.35))"
    }
  });
  btn.addEventListener("click", toggleYouTubeMode);
  bar.style.position = "relative";
  bar.appendChild(btn);
}

function toggleYouTubeMode() {
  ytModeOn ? leaveYouTubeMode() : enterYouTubeMode();
}

function enterYouTubeMode() {
  ytModeOn = true;
  window.currentMode = "youtube";
  const audio = $("#audioPlayer");
  if (audio) {
    audio.pause();
    audio.src = "";
  }
  const g = document.querySelector(".genre-box");
  if (g) {
    g.innerHTML = `
      <img src="/img/youtube.svg" alt="YT" style="width:28px;height:28px;">
      <label style="margin-left:6px;">YouTube:</label>
      <input id="ytUrlInput" class="genre-search" placeholder="Вставь ссылку на трек или плейлист">
      <button id="ytAddBtn" style="background:#00F2B8;color:#171C2B;border:none;border-radius:6px;padding:6px 10px;margin-left:6px;cursor:pointer;font-family:'Ruda',sans-serif;">Add</button>
      <img src="/img/radio.svg" id="ytBackToRadio" title="Back to Radio" style="cursor:pointer;width:28px;height:28px; margin-left:auto;">
    `;
    $("#ytAddBtn").addEventListener("click", onAddUrl);
    $("#ytUrlInput").addEventListener("keypress", e => { if (e.key === "Enter") onAddUrl(); });
    $("#ytBackToRadio").addEventListener("click", backToRadio);
  }
  renderYTList();
  ensureYTPlayer();
}

function leaveYouTubeMode() {
  ytModeOn = false;
  isPlaying = false;
  currentIndex = -1;
  window.currentMode = "radio";
  const ul = $("#playlist");
  if (ul) ul.innerHTML = "";
  if (player && player.stopVideo) player.stopVideo();
  backToRadio();
}

function backToRadio() {
  const rBtn = $("#radioModeBtn");
  if (rBtn) {
    rBtn.click();
  }
}

async function onAddUrl() {
  const inp = $("#ytUrlInput");
  if (!inp) return;
  const raw = (inp.value || "").trim();
  if (!raw) return;
  const parsed = parseYouTubeUrl(raw);
  if (!parsed) {
    alert("Не удалось распознать ссылку YouTube / YouTube Music.");
    return;
  }
  if (parsed.type === "video") {
    const meta = await fetchVideoOEmbedTitleThumb(raw);
    ytItems.push({
      id: parsed.id,
      type: "video",
      url: raw,
      title: meta?.title || `Video ${parsed.id}`,
      thumb: meta?.thumb || `https://i.ytimg.com/vi/${parsed.id}/default.jpg`
    });
  } else {
    const meta = makePlaylistMeta(parsed.id, raw);
    ytItems.push({
      id: parsed.id,
      type: "playlist",
      url: raw,
      title: meta.title,
      thumb: meta.thumb
    });
  }
  saveLS();
  renderYTList();
  inp.value = "";
}

function renderYTList() {
  loadLS();
  const ul = $("#playlist");
  const loader = $("#playlistLoader");
  if (!ul) return;
  if (loader) loader.classList.add("hidden");
  ul.innerHTML = "";
  ytItems.forEach((item, idx) => {
    const li = createEl("li", {
      className: "radio-mode",
      dataset: { index: idx }
    });
    li.appendChild(createEl("div", { className: "progress" }));
    if (item.thumb) {
      li.appendChild(createEl("img", {
        src: item.thumb,
        alt: "thumb",
        className: "station-icon",
        loading: "lazy"
      }));
    }
    const title = item.title + (item.type === "playlist" ? " (Playlist)" : "");
    const spanTitle = createEl("span", { className: "title-ellipsis", textContent: title });
    li.appendChild(spanTitle);
    const slot = createEl("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "8px" }});
    const playBtn = createEl("img", {
      src: "/img/youtube.svg",
      alt: "play",
      title: "Play/Pause",
      style: { width: "20px", height: "20px", cursor: "pointer", opacity: ".9" }
    });
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      playItem(idx);
    });
    slot.appendChild(playBtn);
    if (item.type === "playlist") {
      const prev = createEl("img", {
        src: "/img/rr.svg",
        alt: "prev",
        title: "Prev in playlist",
        style: { width: "20px", height: "20px", cursor: "pointer", opacity: ".9" }
      });
      prev.addEventListener("click", (e) => { e.stopPropagation(); if (player?.previousVideo) player.previousVideo(); });
      const next = createEl("img", {
        src: "/img/ff.svg",
        alt: "next",
        title: "Next in playlist",
        style: { width: "20px", height: "20px", cursor: "pointer", opacity: ".9" }
      });
      next.addEventListener("click", (e) => { e.stopPropagation(); if (player?.nextVideo) player.nextVideo(); });
      slot.appendChild(prev);
      slot.appendChild(next);
    }
    const del = createEl("button", {
      textContent: "×",
      title: "Удалить",
      style: {
        background: "transparent", border: "none", color: "#00F2B8",
        fontSize: "20px", cursor: "pointer", marginLeft: "6px"
      }
    });
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      ytItems.splice(idx, 1);
      saveLS();
      if (currentIndex === idx) { stopYT(); currentIndex = -1; }
      renderYTList();
    });
    slot.appendChild(del);
    li.addEventListener("click", () => playItem(idx));
    if (idx === currentIndex) li.classList.add("active");
    li.appendChild(slot);
    ul.appendChild(li);
  });
}

function ensureYTPlayer() {
  if (window.YT && window.YT.Player) {
    createPlayerIfNeeded();
    return;
  }
  if (!document.getElementById("yt-iframe-api")) {
    const s = document.createElement("script");
    s.id = "yt-iframe-api";
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }
  window.onYouTubeIframeAPIReady = () => createPlayerIfNeeded();
}

function createPlayerIfNeeded() {
  if (player) return;
  let host = document.getElementById("ytAudioHost");
  if (!host) {
    host = createEl("div", { id: "ytAudioHost", style: {
      position: "fixed", width: "1px", height: "1px", overflow: "hidden", left: "-9999px", top: "-9999px"
    }});
    document.body.appendChild(host);
  }
  const iframeContainer = createEl("div", { id: "ytAudio" });
  host.appendChild(iframeContainer);
  player = new YT.Player(iframeContainer, {
    width: 0,
    height: 0,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: () => {},
      onStateChange: onYTStateChange,
      onError: (e) => { console.warn("YT error", e?.data); }
    }
  });
}

function onYTStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    highlightActive(true);
    updateUpperScreenTitles();
  } else if (e.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    highlightActive(false);
  } else if (e.data === YT.PlayerState.ENDED) {
  }
}

function highlightActive(active) {
  const ul = $("#playlist");
  if (!ul) return;
  ul.querySelectorAll("li").forEach(li => li.classList.remove("active"));
  const li = ul.querySelector(`li[data-index="${currentIndex}"]`);
  if (li && active) li.classList.add("active");
}

function updateUpperScreenTitles() {
  const item = ytItems[currentIndex];
  if (!item) return;
  const stationLabel = $("#stationLabel .scrolling-text");
  const trackLabel = $("#currentTrack .scrolling-text");
  if (stationLabel) stationLabel.textContent = item.type === "playlist" ? item.title : item.title;
  if (trackLabel) {
    let now = item.title;
    try { if (player?.getVideoData) now = player.getVideoData()?.title || now; } catch {}
    trackLabel.textContent = now;
  }
}

function playItem(idx) {
  ensureYTPlayer();
  if (!player) return;
  if (idx === currentIndex) {
    if (isPlaying) { try { player.pauseVideo(); } catch{} }
    else { try { player.playVideo(); } catch{} }
    return;
  }
  currentIndex = idx;
  const item = ytItems[idx];
  if (!item) return;
  currentIsPlaylist = (item.type === "playlist");
  try {
    if (item.type === "video") {
      player.loadVideoById(item.id);
    } else {
      player.loadPlaylist({ list: item.id });
      player.setLoop(false);
    }
    player.setVolume(100);
    player.playVideo();
  } catch (e) {
    console.warn("YT play error", e);
  }
  highlightActive(true);
  updateUpperScreenTitles();
}

function stopYT() {
  try { player?.stopVideo?.(); } catch {}
  isPlaying = false;
}

document.addEventListener("DOMContentLoaded", () => {
  injectYouTubeTopIcon();
  loadLS();
});
