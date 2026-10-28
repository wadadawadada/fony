import { showDiscogsInfo } from '../nowplaying.js';
import { openGifSearchModal } from './gifOverlays.js';
import { generateSkin } from './skin-gen.js';

let currentSkin = { left: null, right: null, albumArt: null };

const isGlass = () => document.body.classList.contains("glass");

// In the glass theme a skin paints the scene behind the glass, not the panels.
function setGlassBackdrop(value, sceneCss) {
  window.__glassSceneCss = value ? (sceneCss || value) : null;
  document.dispatchEvent(new CustomEvent("glassScene", { detail: { css: window.__glassSceneCss } }));
  if (value) document.body.style.setProperty("--glass-backdrop", value);
  else document.body.style.removeProperty("--glass-backdrop");
  document.body.classList.toggle("glass-skinned", !!value);
}

function clearPanelInline(leftPanel, rightPanel) {
  for (const panel of [leftPanel, rightPanel]) {
    panel.style.background = "";
    panel.style.backgroundColor = "";
    panel.style.color = "";
    panel.style.transition = "";
  }
}

function getNowPlayingText() {
  const elem = document.querySelector("#currentTrack .scrolling-text");
  return elem ? elem.textContent.trim() : "";
}

function applyAlbumArtSkin(artUrl) {
  const leftPanel = document.querySelector(".left-panel");
  if (!leftPanel || !artUrl) return;
  if (isGlass()) {
    setGlassBackdrop(`url('${artUrl}') center / cover no-repeat`);
    currentSkin.albumArt = artUrl;
    return;
  }
  const isDark = document.body.classList.contains("dark");
  const overlay = isDark ? "rgba(23,28,43,0.6)" : "rgba(242,242,242,0.6)";
  leftPanel.style.transition = "background 1s ease";
  leftPanel.style.backgroundColor = isDark ? "#171C2B" : "#f2f2f2";
  leftPanel.style.background = `linear-gradient(${overlay}, ${overlay}), url('${artUrl}') center / cover no-repeat`;
  currentSkin.albumArt = artUrl;
}

function applySkinStyles(leftStyle, rightStyle, isDark) {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  if (!leftPanel || !rightPanel) return;
  if (isGlass()) {
    clearPanelInline(leftPanel, rightPanel);
    setGlassBackdrop(rightStyle.trim(), leftStyle);
    currentSkin.left = leftStyle;
    currentSkin.right = rightStyle;
    return;
  }
  setGlassBackdrop(null);
  leftPanel.style.background = leftStyle.trim();
  leftPanel.style.color = isDark ? "#eee" : "#222";
  leftPanel.style.transition = "background 1s ease";
  leftPanel.style.backgroundColor = isDark ? "#171C2B" : "#fff";
  rightPanel.style.background = rightStyle.trim();
  rightPanel.style.color = isDark ? "#eee" : "#222";
  rightPanel.style.transition = "background 1s ease";
  rightPanel.style.backgroundColor = isDark ? "#232840" : "#f2f2f2";
  currentSkin.left = leftStyle;
  currentSkin.right = rightStyle;
}

function saveSkinToStorage() {
  localStorage.setItem("savedSkin", JSON.stringify(currentSkin));
  localStorage.setItem("skinTheme", isGlass() ? "glass" : document.body.classList.contains('dark') ? "dark" : "light");
}

function loadSkinFromStorage() {
  try {
    const saved = localStorage.getItem("savedSkin");
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function clearSavedSkin() {
  localStorage.removeItem("savedSkin");
  localStorage.removeItem("skinTheme");
}

function resetPanelStyles() {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  const container = document.querySelector(".container");
  if (!leftPanel || !rightPanel) return;
  leftPanel.style.background = "";
  leftPanel.style.backgroundColor = "";
  leftPanel.style.color = "";
  leftPanel.style.transition = "";
  rightPanel.style.background = "";
  rightPanel.style.backgroundColor = "";
  rightPanel.style.color = "";
  rightPanel.style.transition = "";
  if (container) container.style.background = "";
  if (isGlass()) {
    setGlassBackdrop(null);
    return;
  }
  const isDark = document.body.classList.contains("dark");
  if (isDark) {
    leftPanel.style.backgroundColor = "#171C2B";
    rightPanel.style.background = "linear-gradient(135deg, hsl(165, 94%, 30%) 0%, hsl(165, 94%, 49%) 50%, hsl(165, 94%, 70%) 100%)";
    leftPanel.style.color = "#eee";
    rightPanel.style.color = "#eee";
  } else {
    leftPanel.style.backgroundColor = "#f2f2f2";
    rightPanel.style.background = "linear-gradient(135deg, #5587e4 0%, #d68255 20%, #ec7b2a 40%, #4b85ea 60%, #C36C8B 80%, #55cbd8 100%)";
    leftPanel.style.color = "#222";
    rightPanel.style.color = "#222";
  }
}

function applyDefaultThemePanels() {
  resetPanelStyles();
  currentSkin = { left: null, right: null, albumArt: null };
  saveSkinToStorage();
}

export async function handleSkinsCommand(addMessage, note) {
  const existingContainer = document.getElementById("skinButtonsContainer");
  if (existingContainer) existingContainer.remove();

  const nowPlaying = getNowPlayingText();
  if (nowPlaying && window.currentAlbumArtTrack !== nowPlaying) {
    try { await showDiscogsInfo(); } catch {}
  } else if (!nowPlaying) {
    window.currentAlbumArtUrl = null;
    window.currentAlbumArtTrack = null;
  }

  const albumArtUrl = window.currentAlbumArtUrl || null;
  const hasAlbumArt = !!albumArtUrl;
  const albumArtPart = hasAlbumArt
    ? `<div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
         <img src="${albumArtUrl}" alt="" style="width:28px; height:28px; object-fit:cover; border-radius:3px; flex-shrink:0;" />
         <button id="useAlbumArtBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0; font-family:inherit; font-size:inherit;">use album art</button>
       </div>`
    : '';
  const buttons = `
    <div id="skinButtonsContainer">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <button id="saveSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">save current skin</button>
        <span style="color:#00F2B8;">|</span>
        <button id="generateNewSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">generate new</button>
        <span style="color:#00F2B8;">|</span>
        <button id="resetSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">reset</button>
        <span style="color:#00F2B8;">|</span>
        <button id="addGifSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">gif</button>
      </div>
      ${albumArtPart}
    </div>
  `;
  addMessage("bot", (note ? `Skins · ${note}` : "Skins") + "<br><br>" + buttons);
  setTimeout(() => {
    const saveEl = document.getElementById("saveSkinBtn");
    if (saveEl) {
      saveEl.onclick = (e) => {
        e.preventDefault();
        saveSkinToStorage();
        addMessage("bot", "Skin saved!");
      };
    }
    const generateEl = document.getElementById("generateNewSkinBtn");
    if (generateEl) {
      generateEl.onclick = (e) => {
        e.preventDefault();
        const isDark = document.body.classList.contains("dark");
        const skin = generateSkin(isDark);
        applySkinStyles(skin.left, skin.right, isDark);
        handleSkinsCommand(addMessage, skin.name);
      };
    }
    const resetEl = document.getElementById("resetSkinBtn");
    if (resetEl) {
      resetEl.onclick = (e) => {
        e.preventDefault();
        applyDefaultThemePanels();
        addMessage("bot", "Skin reset to default!");
      };
    }
    const addGifEl = document.getElementById("addGifSkinBtn");
    if (addGifEl) {
      addGifEl.onclick = (e) => {
        e.preventDefault();
        openGifSearchModal();
      };
    }
    const albumArtEl = document.getElementById("useAlbumArtBtn");
    if (albumArtEl) {
      albumArtEl.onclick = (e) => {
        e.preventDefault();
        applyAlbumArtSkin(albumArtUrl);
        saveSkinToStorage();
        addMessage("bot", "Album art applied!");
      };
    }
  }, 100);
}

export function reapplySkin() {
  const skin = loadSkinFromStorage();
  if (skin && skin.left && skin.right) {
    const isDark = document.body.classList.contains("dark");
    applySkinStyles(skin.left, skin.right, isDark);
  }
  if (skin && skin.albumArt) {
    applyAlbumArtSkin(skin.albumArt);
  }
}

export function loadSkinAndThemeFromStorage() {
  try {
    const skin = localStorage.getItem("savedSkin");
    const theme = localStorage.getItem("skinTheme");
    if (!skin || !theme) return null;
    return { skin: JSON.parse(skin), theme };
  } catch {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const skin = loadSkinFromStorage();
  if (skin && skin.left && skin.right) {
    const isDark = document.body.classList.contains("dark");
    applySkinStyles(skin.left, skin.right, isDark);
  }
  if (skin && skin.albumArt) {
    applyAlbumArtSkin(skin.albumArt);
  }
});

document.addEventListener("themeChanged", () => {
  const skin = loadSkinFromStorage();
  const isDark = document.body.classList.contains("dark");
  if (skin && skin.left && skin.right) {
    applySkinStyles(skin.left, skin.right, isDark);
  } else {
    resetPanelStyles();
  }
  if (skin && skin.albumArt) {
    applyAlbumArtSkin(skin.albumArt);
  }
});

function clearSkinStyles() {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  if (leftPanel) {
    leftPanel.style.background = "";
    leftPanel.style.backgroundColor = "";
    leftPanel.style.color = "";
    leftPanel.style.transition = "";
  }
  if (rightPanel) {
    rightPanel.style.background = "";
    rightPanel.style.backgroundColor = "";
    rightPanel.style.color = "";
    rightPanel.style.transition = "";
  }
  setGlassBackdrop(null);
  localStorage.removeItem("savedSkin");
  localStorage.removeItem("skinTheme");
  currentSkin.left = null;
  currentSkin.right = null;
}

export { clearSkinStyles, applyAlbumArtSkin };
