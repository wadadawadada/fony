const FONY_BACKEND_URL = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app";
const STORAGE_KEY = "gifOverlays";
const DEFAULT_WIDTH = 160;
const MIN_WIDTH = 60;
const MAX_WIDTH = 480;
const RESIZE_STEP = 24;

let searchDebounceTimer = null;
let searchRequestId = 0;

function loadGifOverlays() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveGifOverlays(overlays) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overlays));
}

function getOverlayLayer() {
  let layer = document.getElementById("gifOverlayLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "gifOverlayLayer";
    document.body.appendChild(layer);
  }
  return layer;
}

function clampFraction(value) {
  return Math.min(0.95, Math.max(0.02, value));
}

function clampWidth(value) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

function updateOverlayWidth(id, width) {
  const overlays = loadGifOverlays();
  const target = overlays.find((o) => o.id === id);
  if (target) {
    target.width = width;
    saveGifOverlays(overlays);
  }
}

function createGifOverlayElement(overlay) {
  const item = document.createElement("div");
  item.className = "gif-overlay-item";
  item.dataset.id = overlay.id;
  item.style.left = `${overlay.left * window.innerWidth}px`;
  item.style.top = `${overlay.top * window.innerHeight}px`;

  const img = document.createElement("img");
  img.src = overlay.url;
  img.alt = "";
  img.draggable = false;
  img.style.width = `${clampWidth(overlay.width || DEFAULT_WIDTH)}px`;
  item.appendChild(img);

  const closeBtn = document.createElement("button");
  closeBtn.className = "gif-overlay-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeGifOverlay(overlay.id);
  });
  item.appendChild(closeBtn);

  const resizeWrap = document.createElement("div");
  resizeWrap.className = "gif-overlay-resize";

  const shrinkBtn = document.createElement("button");
  shrinkBtn.type = "button";
  shrinkBtn.textContent = "−";
  shrinkBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const newWidth = clampWidth((parseFloat(img.style.width) || DEFAULT_WIDTH) - RESIZE_STEP);
    img.style.width = `${newWidth}px`;
    updateOverlayWidth(overlay.id, newWidth);
  });

  const growBtn = document.createElement("button");
  growBtn.type = "button";
  growBtn.textContent = "+";
  growBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const newWidth = clampWidth((parseFloat(img.style.width) || DEFAULT_WIDTH) + RESIZE_STEP);
    img.style.width = `${newWidth}px`;
    updateOverlayWidth(overlay.id, newWidth);
  });

  resizeWrap.appendChild(shrinkBtn);
  resizeWrap.appendChild(growBtn);
  item.appendChild(resizeWrap);

  wireDrag(item, overlay.id);

  return item;
}

function wireDrag(item, id) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function pointerPos(e) {
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function onMove(e) {
    if (!dragging) return;
    const pos = pointerPos(e);
    const left = pos.x - offsetX;
    const top = pos.y - offsetY;
    item.style.left = `${left}px`;
    item.style.top = `${top}px`;
    if (e.cancelable) e.preventDefault();
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    item.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);

    const rect = item.getBoundingClientRect();
    const overlays = loadGifOverlays();
    const target = overlays.find((o) => o.id === id);
    if (target) {
      target.left = clampFraction(rect.left / window.innerWidth);
      target.top = clampFraction(rect.top / window.innerHeight);
      saveGifOverlays(overlays);
    }
  }

  function onStart(e) {
    if (e.target.closest(".gif-overlay-close") || e.target.closest(".gif-overlay-resize")) return;
    dragging = true;
    item.classList.add("dragging");
    const pos = pointerPos(e);
    const rect = item.getBoundingClientRect();
    offsetX = pos.x - rect.left;
    offsetY = pos.y - rect.top;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }

  item.addEventListener("mousedown", onStart);
  item.addEventListener("touchstart", onStart, { passive: true });
}

function renderAllGifOverlays() {
  const layer = getOverlayLayer();
  layer.innerHTML = "";
  loadGifOverlays().forEach((overlay) => {
    layer.appendChild(createGifOverlayElement(overlay));
  });
}

function addGifOverlay(url) {
  const overlays = loadGifOverlays();
  const overlay = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    url,
    left: clampFraction(0.4 + Math.random() * 0.1),
    top: clampFraction(0.35 + Math.random() * 0.1)
  };
  overlays.push(overlay);
  saveGifOverlays(overlays);
  getOverlayLayer().appendChild(createGifOverlayElement(overlay));
}

function removeGifOverlay(id) {
  const overlays = loadGifOverlays().filter((o) => o.id !== id);
  saveGifOverlays(overlays);
  const el = document.querySelector(`.gif-overlay-item[data-id="${id}"]`);
  if (el) el.remove();
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
  });
}

async function runGifSearch(query) {
  const resultsEl = document.getElementById("gifSearchResults");
  if (!resultsEl) return;
  const requestId = ++searchRequestId;
  resultsEl.innerHTML = '<div class="gif-search-status">Loading...</div>';

  try {
    const transparentToggle = document.getElementById("gifSearchTransparent");
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (transparentToggle && transparentToggle.checked) params.set("type", "stickers");
    const response = await fetch(`${FONY_BACKEND_URL}/api/giphy/search?${params.toString()}`);
    if (requestId !== searchRequestId) return;

    if (!response.ok) {
      resultsEl.innerHTML = `<div class="gif-search-status">GIPHY error: ${response.status}</div>`;
      return;
    }

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (requestId !== searchRequestId) return;

    if (!results.length) {
      resultsEl.innerHTML = '<div class="gif-search-status">No GIFs found</div>';
      return;
    }

    resultsEl.innerHTML = "";
    results.forEach((gif) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gif-search-result";
      btn.innerHTML = `<img src="${escapeHtml(gif.preview || gif.url)}" alt="${escapeHtml(gif.title)}" loading="lazy">`;
      btn.addEventListener("click", () => {
        addGifOverlay(gif.url || gif.preview);
        closeGifSearchModal();
      });
      resultsEl.appendChild(btn);
    });
  } catch (err) {
    if (requestId !== searchRequestId) return;
    resultsEl.innerHTML = `<div class="gif-search-status">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function openGifSearchModal() {
  const modal = document.getElementById("gifSearchModal");
  const input = document.getElementById("gifSearchInput");
  if (!modal) return;
  modal.style.display = "flex";
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 50);
  }
  runGifSearch("");
}

function closeGifSearchModal() {
  const modal = document.getElementById("gifSearchModal");
  if (modal) modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  renderAllGifOverlays();

  const modal = document.getElementById("gifSearchModal");
  const closeBtn = document.getElementById("gifSearchClose");
  const input = document.getElementById("gifSearchInput");
  const transparentToggle = document.getElementById("gifSearchTransparent");

  if (closeBtn) closeBtn.addEventListener("click", closeGifSearchModal);
  if (transparentToggle) {
    transparentToggle.addEventListener("change", () => runGifSearch(input ? input.value.trim() : ""));
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeGifSearchModal();
    });
  }
  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => runGifSearch(input.value.trim()), 350);
    });
  }
});

export { openGifSearchModal, closeGifSearchModal, addGifOverlay, removeGifOverlay, renderAllGifOverlays };
