import { showDiscogsInfo } from '../nowplaying.js';
import { openGifSearchModal } from './gifOverlays.js';
import { generateSkin, SKIN_GROUPS } from './skin-gen.js';

let currentSkin = { left: null, right: null, albumArt: null, anchor: null, name: null };

// Some skins have a focal point (Pulse's sun) that must sit behind the Play button.
// The picture is 1200x900; scale it just enough to cover the panel while that point
// lands on the button, and shift it there.
const SKIN_W = 1200;
const SKIN_H = 900;
function alignSkinToPlay() {
  const leftPanel = document.querySelector(".left-panel");
  const btn = document.getElementById("playPauseBtn");
  const a = currentSkin.anchor;
  if (!leftPanel || !btn || !a || isGlass() || !leftPanel.style.background) return;
  const pr = leftPanel.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  if (!pr.width || !pr.height || !br.width) return;
  const bx = br.left + br.width / 2 - pr.left;
  const by = br.top + br.height / 2 - pr.top;
  const ax = a.x * SKIN_W;
  const ay = a.y * SKIN_H;
  const s = Math.max(bx / ax, (pr.width - bx) / (SKIN_W - ax), by / ay, (pr.height - by) / (SKIN_H - ay), 0.01);
  leftPanel.style.backgroundSize = `100% 100%, ${(SKIN_W * s).toFixed(1)}px ${(SKIN_H * s).toFixed(1)}px`;
  leftPanel.style.backgroundPosition = `0 0, ${(bx - ax * s).toFixed(1)}px ${(by - ay * s).toFixed(1)}px`;
  leftPanel.style.backgroundRepeat = "repeat, no-repeat";
}

let skinAlignWatching = false;
function watchSkinAlign() {
  if (skinAlignWatching) return;
  const leftPanel = document.querySelector(".left-panel");
  if (!leftPanel) return;
  skinAlignWatching = true;
  window.addEventListener("resize", alignSkinToPlay);
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => alignSkinToPlay());
    ro.observe(leftPanel);
    const btn = document.getElementById("playPauseBtn");
    if (btn) ro.observe(btn);
  }
}

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
  currentSkin.anchor = null;
  currentSkin.name = "Album art";
}

function applySkinStyles(leftStyle, rightStyle, isDark, anchor = null, name = null) {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  if (!leftPanel || !rightPanel) return;
  if (isGlass()) {
    clearPanelInline(leftPanel, rightPanel);
    setGlassBackdrop(rightStyle.trim(), leftStyle);
    currentSkin.left = leftStyle;
    currentSkin.right = rightStyle;
    currentSkin.anchor = anchor;
    currentSkin.name = name;
    currentSkin.albumArt = null;
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
  currentSkin.anchor = anchor;
  currentSkin.name = name;
  currentSkin.albumArt = null;
  watchSkinAlign();
  alignSkinToPlay();
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
  currentSkin = { left: null, right: null, albumArt: null, anchor: null, name: null };
  saveSkinToStorage();
}

// ---- /skins studio ---------------------------------------------------------------
// One row of categories (each gives a random skin of its kind) and one row with the
// current skin, the last three saved skins and the small actions.
const SLOTS_KEY = "savedSkinSlots";
const MAX_SLOTS = 3;
let skinCardSeq = 0;

function loadSlots() {
  try {
    const v = JSON.parse(localStorage.getItem(SLOTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter(s => s && s.left && s.right).slice(0, MAX_SLOTS) : [];
  } catch {
    return [];
  }
}

function storeSlots(slots) {
  const list = slots.slice(0, MAX_SLOTS);
  while (list.length) {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(list));
      return;
    } catch {
      list.pop(); // storage is full: let the oldest one go until it fits
    }
  }
  try { localStorage.removeItem(SLOTS_KEY); } catch {}
}

// puts the skin on screen at the front of the saved list (newest first, no duplicates)
function saveCurrentSkinToSlots() {
  if (!currentSkin.left || currentSkin.albumArt) return;
  const slots = loadSlots().filter(s => s.left !== currentSkin.left);
  slots.unshift({ name: currentSkin.name, left: currentSkin.left, right: currentSkin.right, anchor: currentSkin.anchor || null });
  storeSlots(slots);
}

function groupOf(name) {
  return Object.keys(SKIN_GROUPS).find(g => SKIN_GROUPS[g].includes(name)) || null;
}

// category icons: the die is the random-station one (five pips); the others are drawn to match
const SK_ICONS = {
  Any: '<svg class="sk-ico sk-die" viewBox="0 0 24 24" aria-hidden="true"><rect class="sk-die-body" x="3" y="3" width="18" height="18" rx="5"/><circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/></svg>',
  Abstract: '<svg class="sk-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="9" r="5.5"/><circle cx="12" cy="15" r="5.5"/></svg>',
  Space: '<svg class="sk-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-20 12 12)"/></svg>',
  Ethnic: '<svg class="sk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12Z"/><circle cx="12" cy="12" r="1" class="sk-dot"/></svg>',
  Pixel: '<svg class="sk-ico sk-ico-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 3h6v3h-6zM13.5 3h6v3h-6zM1.5 6h21v3h-21zM1.5 9h21v3h-21zM4.5 12h15v3h-15zM7.5 15h9v3h-9zM10.5 18h3v3h-3z"/></svg>'
};

const SK_ACTION_ICONS = {
  save: '<svg class="sk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z"/><path d="M7 3v5h8V3"/><path d="M7 21v-7h10v7"/></svg>',
  gif: '<svg class="sk-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 5 5"/></svg>',
  reset: '<svg class="sk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
};

function skinCardHtml(albumArtUrl) {
  const group = groupOf(currentSkin.name);
  const cats = Object.keys(SKIN_GROUPS).map(g =>
    `<button type="button" class="sk-link sk-cat${g === group ? " on" : ""}" data-act="cat" data-cat="${g}" title="${g}" aria-label="${g}">${SK_ICONS[g] || g}</button>`).join("");
  const slots = loadSlots().map((s, i) =>
    `<span class="sk-slot"><button type="button" class="sk-thumb${s.left === currentSkin.left ? " on" : ""}" data-act="slot" data-idx="${i}" title="Restore ${s.name || "skin"}"></button><button type="button" class="sk-x" data-act="unsave" data-idx="${i}" title="Remove">&times;</button></span>`).join("");
  const art = albumArtUrl
    ? `<button type="button" class="sk-link sk-art" data-act="art"><img src="${albumArtUrl}" alt="">Album art</button>`
    : "";
  return `
    <div class="sk-row">
      <span class="sk-label">Style:</span>
      <button type="button" class="sk-link sk-cat" data-act="cat" data-cat="" title="Any style" aria-label="Any style">${SK_ICONS.Any}</button>
      ${cats}
      ${slots ? `<div class="sk-slots">${slots}</div>` : ""}
      <span class="sk-spacer"></span>
      <button type="button" class="sk-link" data-act="save">${SK_ACTION_ICONS.save}Save</button>
      ${art}
      <button type="button" class="sk-link" data-act="gif">${SK_ACTION_ICONS.gif}GIF</button>
      <button type="button" class="sk-link" data-act="reset">${SK_ACTION_ICONS.reset}Reset</button>
    </div>`;
}

function mountSkinCard(card, albumArtUrl) {
  const paint = () => {
    card.innerHTML = skinCardHtml(albumArtUrl);
    // the thumbnails are the saved skins themselves (set from JS: the value has quotes)
    const slots = loadSlots();
    card.querySelectorAll(".sk-thumb").forEach(el => {
      const s = slots[Number(el.dataset.idx)];
      if (s) el.style.background = s.left;
    });
  };
  card.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !card.contains(el)) return;
    e.preventDefault();
    const isDark = document.body.classList.contains("dark");
    const act = el.dataset.act;
    if (act === "cat") {
      const skin = generateSkin(isDark, el.dataset.cat || null);
      applySkinStyles(skin.left, skin.right, isDark, skin.anchor || null, skin.name);
    } else if (act === "slot") {
      const s = loadSlots()[Number(el.dataset.idx)];
      if (s) applySkinStyles(s.left, s.right, isDark, s.anchor || null, s.name || null);
    } else if (act === "unsave") {
      const slots = loadSlots();
      slots.splice(Number(el.dataset.idx), 1);
      storeSlots(slots);
    } else if (act === "save") {
      saveSkinToStorage();
      saveCurrentSkinToSlots();
      paint();
      const btn = card.querySelector('[data-act="save"]');
      if (btn) btn.innerHTML = SK_ACTION_ICONS.save + "Saved ✓";
      setTimeout(paint, 1000);
      return;
    } else if (act === "reset") {
      applyDefaultThemePanels();
    } else if (act === "gif") {
      openGifSearchModal();
      return;
    } else if (act === "art") {
      applyAlbumArtSkin(albumArtUrl);
      saveSkinToStorage();
    }
    paint();
  });
  paint();
}

export async function handleSkinsCommand(addMessage) {
  const old = document.querySelector(".sk-card");
  if (old) (old.closest(".chat-message") || old).remove();

  const nowPlaying = getNowPlayingText();
  if (nowPlaying && window.currentAlbumArtTrack !== nowPlaying) {
    try { await showDiscogsInfo(); } catch {}
  } else if (!nowPlaying) {
    window.currentAlbumArtUrl = null;
    window.currentAlbumArtTrack = null;
  }
  const albumArtUrl = window.currentAlbumArtUrl || null;
  const id = `skCard${++skinCardSeq}`;
  addMessage("bot", `<div class="sk-card" id="${id}">${skinCardHtml(albumArtUrl)}</div>`);
  let tries = 0;
  const wire = () => {
    const card = document.getElementById(id);
    if (card) mountSkinCard(card, albumArtUrl);
    else if (++tries < 20) setTimeout(wire, 50);
  };
  setTimeout(wire, 30);
}

export function reapplySkin() {
  const skin = loadSkinFromStorage();
  if (skin && skin.left && skin.right) {
    const isDark = document.body.classList.contains("dark");
    applySkinStyles(skin.left, skin.right, isDark, skin.anchor || null, skin.name || null);
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
    applySkinStyles(skin.left, skin.right, isDark, skin.anchor || null, skin.name || null);
  }
  if (skin && skin.albumArt) {
    applyAlbumArtSkin(skin.albumArt);
  }
});

document.addEventListener("themeChanged", () => {
  const skin = loadSkinFromStorage();
  const isDark = document.body.classList.contains("dark");
  if (skin && skin.left && skin.right) {
    applySkinStyles(skin.left, skin.right, isDark, skin.anchor || null, skin.name || null);
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
  currentSkin.anchor = null;
}

export { clearSkinStyles, applyAlbumArtSkin };
