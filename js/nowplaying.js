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
    void bg.offsetWidth; 
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

  discogsContainer.innerHTML = "";
  setAlbumCoverBackground(null);
  updateAlbumCoverAnimation();

  if (!nowPlaying) {
    return;
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
        <br><br>
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


///// CD PATCH

// (() => {
//   const NO_DATA_IMG = "/img/cd.svg";
//   const isNoDataText = t => {
//     if (!t) return false;
//     const s = t.trim().toLowerCase();
//     return s === "no data" || s === "no track data" || s === "no metadata";
//   };
//   const isChatOpen = () => {
//     const chat = document.getElementById("chat");
//     return chat && window.getComputedStyle(chat).display !== "none";
//   };
//   const hasRealCover = () => {
//     const bg = document.querySelector(".center-circle .album-cover-bg");
//     const bi = bg ? (bg.style.backgroundImage || "") : "";
//     return bi && !bi.includes("cd.svg");
//   };
//   const showPlaceholder = () => {
//     try { if (!isChatOpen()) { setAlbumCoverBackground(NO_DATA_IMG); updateAlbumCoverAnimation(); } } catch(e) {}
//   };
//   function applyState() {
//     if (isChatOpen()) return;
//     const el = document.querySelector("#currentTrack .scrolling-text");
//     if (!el) return;
//     const txt = el.textContent || "";
//     const box = document.getElementById("discogsInfoContainer");
//     if (isNoDataText(txt)) {
//       showPlaceholder();
//       if (box) { box.style.display = "none"; box.innerHTML = ""; }
//       return;
//     }
//     if (txt.trim()) {
//       if (!hasRealCover()) showPlaceholder();
//       if (box && box.style.display === "none") box.style.display = "";
//     }
//   }
//   const origSetBg = (window.setAlbumCoverBackground || window.setAlbumCoverBackground === null) ? window.setAlbumCoverBackground : (typeof setAlbumCoverBackground !== "undefined" ? setAlbumCoverBackground : null);
//   if (origSetBg) {
//     window.setAlbumCoverBackground = function(u){ if (isChatOpen()) return; origSetBg(u); };
//   }
//   function onChatVisibilityChange() {
//     const bg = document.querySelector(".center-circle .album-cover-bg");
//     if (!bg) return;
//     if (isChatOpen()) { bg.style.backgroundImage = ""; bg.classList.remove("visible"); }
//     else { applyState(); }
//   }
//   const chat = document.getElementById("chat");
//   if (chat) {
//     const obs = new MutationObserver(onChatVisibilityChange);
//     obs.observe(chat, { attributes: true, attributeFilter: ["style", "class"] });
//   }
//   document.addEventListener("DOMContentLoaded", applyState);
//   setInterval(applyState, 500);
// })();


////Cd & Vinyl Toggle Patch

(() => {
  const CD="/img/cd.svg", VINYL="/img/vinyl.svg", REEL="/img/reel.svg", PREF="coverPlaceholderPref";
  const isNoDataText=t=>{if(!t)return false;const s=t.trim().toLowerCase();return s==="no data"||s==="no track data"||s==="no metadata"};
  const isChatOpen=()=>{const c=document.getElementById("chat");return c&&window.getComputedStyle(c).display!=="none"};
  const getBg=()=>document.querySelector(".center-circle .album-cover-bg");
  const hasRealCover=()=>{const bg=getBg();const bi=bg?(bg.style.backgroundImage||""):"";return bi&&!(bi.includes("cd.svg")||bi.includes("vinyl.svg")||bi.includes("reel.svg"))};
  const cycle=["cd","vinyl","reel"];
  const getPref=()=>localStorage.getItem(PREF)||"cd";
  const setPref=v=>localStorage.setItem(PREF,v);
  const selUrl=()=>{const p=getPref();return p==="vinyl"?VINYL:p==="reel"?REEL:CD};
  const setCover=u=>{try{if(!isChatOpen()){setAlbumCoverBackground(u);updateAlbumCoverAnimation&&updateAlbumCoverAnimation()}}catch(e){}};
  const showPlaceholder=()=>setCover(selUrl());

  function applyState(){
    if(isChatOpen())return;
    const el=document.querySelector("#currentTrack .scrolling-text");if(!el)return;
    const txt=el.textContent||"";const box=document.getElementById("discogsInfoContainer");
    if(isNoDataText(txt)){showPlaceholder();if(box){box.style.display="none";box.innerHTML=""}return}
    if(txt.trim()){if(!hasRealCover())showPlaceholder();if(box&&box.style.display==="none")box.style.display=""}
  }

  const origSetBg=typeof window.setAlbumCoverBackground==="function"?window.setAlbumCoverBackground:null;
  if(origSetBg){
    window.setAlbumCoverBackground=function(u){
      if(isChatOpen())return;
      if(!u&&!hasRealCover())return;
      if(typeof u==="string"&&(u.includes("cd.svg")||u.includes("vinyl.svg")||u.includes("reel.svg"))) u=selUrl();
      origSetBg(u);
    };
  }

  function onChatVisibilityChange(){
    const bg=getBg();if(!bg)return;
    if(isChatOpen()){bg.style.backgroundImage="";bg.classList.remove("visible")}
    else{applyState()}
  }

  function pointInRect(x,y,r){return r&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom}

  function tryToggleByClick(e){
    if(isChatOpen())return;
    const circle=document.querySelector(".center-circle");const bg=getBg();
    if(!circle||!bg)return;
    const rc=circle.getBoundingClientRect(), cx=rc.left+rc.width/2, cy=rc.top+rc.height/2;
    const dx=e.clientX-cx, dy=e.clientY-cy, R=Math.min(rc.width,rc.height)/2;
    if(dx*dx+dy*dy>R*R)return;
    const btnIds=["playPauseBtn","ffBtn","rrBtn","shuffleBtn","favBtn","randomBtn"];
    for(const id of btnIds){const b=document.getElementById(id);if(b){const rb=b.getBoundingClientRect();if(pointInRect(e.clientX,e.clientY,rb))return}}
    if(hasRealCover())return;
    const cur=getPref();const idx=cycle.indexOf(cur);const next=cycle[(idx+1)%cycle.length];
    setPref(next);
    showPlaceholder();
  }

  const chat=document.getElementById("chat");
  if(chat){const obs=new MutationObserver(onChatVisibilityChange);obs.observe(chat,{attributes:true,attributeFilter:["style","class"]})}

  if(!localStorage.getItem(PREF))setPref("cd");

  document.addEventListener("click",tryToggleByClick,true);
  document.addEventListener("keydown",e=>{
    if(e.code==="KeyV"&&!e.repeat){
      const cur=getPref();const idx=cycle.indexOf(cur);const next=cycle[(idx+1)%cycle.length];
      setPref(next);
      if(!hasRealCover())showPlaceholder();
    }
  });

  document.addEventListener("DOMContentLoaded",applyState);
  setInterval(applyState,500);
})();



///// Mobile discogs collapse patch

(() => {
  const isMobile = () => window.innerWidth <= 768;

  function isVis(el){
    if(!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function hasVisibleChildren(el){
    if(!el) return false;
    for (const ch of el.children) {
      if (isVis(ch) && ch.offsetParent !== null && ch.offsetHeight > 0 && ch !== document.getElementById("discogsInfoContainer")) {
        return true;
      }
    }
    return false;
  }

  function collapseIfEmpty(el){
    if(!el) return;
    if(!hasVisibleChildren(el)) {
      el.dataset.__prePatchDisplay = el.style.display || "";
      el.style.display = "none";
      el.style.margin = "0";
      el.style.padding = "0";
    }
  }

  function uncollapse(el){
    if(!el) return;
    if(el.dataset.__prePatchDisplay !== undefined){
      el.style.display = el.dataset.__prePatchDisplay;
      delete el.dataset.__prePatchDisplay;
    }
  }

  function applyMobileDiscogsCollapse(){
    const box = document.getElementById("discogsInfoContainer");
    if (!box) return;

    if (isMobile()) {
      box.style.display = "none";
      box.style.height = "0";
      box.style.margin = "0";
      box.style.padding = "0";
      box.style.overflow = "hidden";
      box.innerHTML = "";

      let p = box.parentElement;
      for (let i = 0; i < 3 && p; i++) {
        collapseIfEmpty(p);
        p = p.parentElement;
      }
    } else {

      let p = box.parentElement;
      for (let i = 0; i < 3 && p; i++) {
        uncollapse(p);
        p = p.parentElement;
      }

      box.style.height = "";
      box.style.margin = "";
      box.style.padding = "";
      box.style.overflow = "";
    }
  }

  document.addEventListener("DOMContentLoaded", applyMobileDiscogsCollapse);
  window.addEventListener("resize", applyMobileDiscogsCollapse);

  const chat = document.getElementById("chat");
  if (chat) {
    const obs = new MutationObserver(applyMobileDiscogsCollapse);
    obs.observe(chat, { attributes: true, attributeFilter: ["style", "class"] });
  }

  setInterval(applyMobileDiscogsCollapse, 700);
})();
