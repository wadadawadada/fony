// Explorer UI for the "Local" mode: root folders, sub-folder navigation and
// custom playlists, rendered into the shared #playlist list.
import * as lib from './local-library.js';

const svg = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  note: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  list: svg('<path d="M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6"/>'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  heart: svg('<path d="M12 20.5s-7.5-4.6-9.2-9.2C1.6 8 3.4 5 6.6 5c1.9 0 3.5 1 5.4 3 1.9-2 3.5-3 5.4-3 3.2 0 5 3 3.8 6.3-1.7 4.6-9.2 9.2-9.2 9.2z"/>'),
  heartFill: svg('<path fill="currentColor" d="M12 20.5s-7.5-4.6-9.2-9.2C1.6 8 3.4 5 6.6 5c1.9 0 3.5 1 5.4 3 1.9-2 3.5-3 5.4-3 3.2 0 5 3 3.8 6.3-1.7 4.6-9.2 9.2-9.2 9.2z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')
};

let ctx = null;
let view = { kind: 'home' };
let query = '';
let searchIndex = null; // rootId -> Promise of the root's folder/file listing
let renderToken = 0;
let activeLi = null;
let popEl = null;
let durationObserver = null;
let durationQueue = [];
let durationActive = 0;
const DURATION_CONCURRENCY = 2;

const audio = () => document.getElementById('audioPlayer');

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function matches(text) {
  return !query || text.toLowerCase().includes(query);
}

function setView(next, { reveal = false } = {}) {
  view = next;
  query = '';
  searchIndex = null;
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  const clear = document.getElementById('clearSearch');
  if (clear) clear.style.display = 'none';
  lib.saveLastView(view);
  render(true, reveal);
}

// ---- small UI helpers -------------------------------------------------

export function toast(msg) {
  document.querySelectorAll('.local-toast').forEach(t => t.remove());
  const t = el('div', 'local-toast');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function closePopover() {
  if (popEl) popEl.remove();
  popEl = null;
  document.removeEventListener('mousedown', onOutside, true);
}

function onOutside(e) {
  if (popEl && !popEl.contains(e.target)) closePopover();
}

function openPopover(anchor, build) {
  closePopover();
  popEl = el('div', 'local-pop');
  build(popEl);
  document.body.appendChild(popEl);
  const r = anchor.getBoundingClientRect();
  const w = popEl.offsetWidth;
  const h = popEl.offsetHeight;
  popEl.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
  popEl.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
  setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
}

function askName(anchor, { title, value = '', ok = 'Save' }) {
  return new Promise(resolve => {
    openPopover(anchor, pop => {
      pop.appendChild(el('div', 'local-pop-title', title));
      const input = el('input', 'local-pop-input');
      input.type = 'text';
      input.value = value;
      input.maxLength = 60;
      const btn = el('button', 'local-pop-btn');
      btn.textContent = ok;
      const done = v => { closePopover(); resolve(v); };
      btn.onclick = () => done(input.value.trim() || null);
      input.onkeydown = e => {
        if (e.key === 'Enter') btn.click();
        if (e.key === 'Escape') done(null);
      };
      pop.append(input, btn);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });
  });
}

// Pick (or create) a playlist, then add the tracks produced by getTracks().
function pickPlaylist(anchor, getTracks) {
  openPopover(anchor, pop => {
    pop.appendChild(el('div', 'local-pop-title', 'Add to playlist'));
    const add = async (id, name) => {
      closePopover();
      try {
        const tracks = await getTracks();
        const n = lib.addTracks(id, tracks);
        toast(n ? `Added ${n} track${n > 1 ? 's' : ''} to “${name}”` : `Already in “${name}”`);
        if (view.kind === 'playlist' || view.kind === 'home') render();
      } catch {
        toast('Could not read this folder');
      }
    };
    for (const pl of lib.loadPlaylists()) {
      const b = el('button', 'local-pop-item');
      b.textContent = `${pl.name} (${pl.tracks.length})`;
      b.onclick = () => add(pl.id, pl.name);
      pop.appendChild(b);
    }
    pop.appendChild(el('div', 'local-pop-sep'));
    const input = el('input', 'local-pop-input');
    input.type = 'text';
    input.placeholder = 'New playlist name';
    input.maxLength = 60;
    const create = el('button', 'local-pop-btn');
    create.textContent = 'Create & add';
    create.onclick = () => {
      const pl = lib.createPlaylist(input.value.trim() || 'New playlist');
      add(pl.id, pl.name);
    };
    input.onkeydown = e => { if (e.key === 'Enter') create.click(); };
    pop.append(input, create);
  });
}

// ---- rows -------------------------------------------------------------

function actionBtn(icon, title, fn) {
  const b = el('button', 'local-act', icon);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.onclick = e => {
    e.stopPropagation();
    fn(b, e);
  };
  return b;
}

function row({ icon, label, sub, onClick, actions = [], cls = '' }) {
  const li = el('li', `local-mode local-row ${cls}`);
  li.appendChild(el('div', 'progress'));
  const ic = el('span', 'local-ico', icon);
  const name = el('span', 'title-ellipsis');
  name.textContent = label;
  li.append(ic, name);
  if (sub) {
    const s = el('span', 'local-sub');
    s.textContent = sub;
    li.appendChild(s);
  }
  const acts = el('span', 'local-acts');
  actions.forEach(a => acts.appendChild(actionBtn(...a)));
  li.appendChild(acts);
  if (onClick) li.onclick = onClick;
  return li;
}

// In-app replacement for window.confirm().
function confirmDialog({ title, text, okLabel = 'OK', danger = true }) {
  return new Promise(resolve => {
    document.querySelector('.local-help.confirm')?.remove();
    const overlay = el('div', 'local-help confirm');
    const box = el('div', 'local-help-box');
    const h = el('h3', 'local-help-title');
    h.textContent = title;
    const p = el('p', 'local-help-text');
    p.textContent = text;
    const row = el('div', 'local-confirm-row');
    const cancel = el('button', 'local-pop-item');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const ok = el('button', 'local-pop-btn' + (danger ? ' danger' : ''));
    ok.type = 'button';
    ok.textContent = okLabel;
    const done = v => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      if (e.key === 'Enter') { e.stopPropagation(); done(true); }
    };
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(false); });
    document.addEventListener('keydown', onKey, true);
    row.append(cancel, ok);
    box.append(h, p, row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    ok.focus();
  });
}

function confirmDeletePlaylist(pl) {
  return confirmDialog({
    title: 'Delete playlist?',
    text: `“${pl.name}” will be deleted. Your music files are not affected.`,
    okLabel: 'Delete'
  });
}

function sectionRow(text) {
  const li = el('li', 'local-section');
  li.textContent = text;
  return li;
}

function dropZoneRow(big) {
  const li = el('li', 'local-drop' + (big ? ' big' : ''));
  li.innerHTML = `<span class="local-drop-plus">+</span><span class="local-drop-text"></span>`;
  li.querySelector('.local-drop-text').textContent = big
    ? 'Drop a music folder here, or click to choose one'
    : 'Drop another folder here, or click to add';
  li.onclick = addFolderFromPicker;
  return li;
}

async function addFolder(getRoot) {
  try {
    const { root, existed } = await getRoot();
    toast(existed ? `“${root.name}” is already in the library` : `Added “${root.name}”`);
    setView({ kind: 'dir', rootId: root.id, path: [] });
  } catch (err) {
    if (err && err.name !== 'AbortError') toast('Could not open that folder');
  }
}

function addFolderFromPicker() {
  return addFolder(() => lib.addRoot());
}

function onDragOver(e) {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  ctx.scroller.classList.add('drag-over');
}

function onDragLeave(e) {
  if (e.target === ctx.scroller || !ctx.scroller.contains(e.relatedTarget)) {
    ctx.scroller.classList.remove('drag-over');
  }
}

function onDrop(e) {
  e.preventDefault();
  ctx.scroller.classList.remove('drag-over');
  // Handles must be requested synchronously, before the event ends.
  const pending = [...e.dataTransfer.items]
    .filter(i => i.kind === 'file' && i.getAsFileSystemHandle)
    .map(i => i.getAsFileSystemHandle());
  Promise.all(pending).then(async handles => {
    const dirs = handles.filter(h => h && h.kind === 'directory');
    if (!dirs.length) { toast('Drop a folder, not files'); return; }
    for (const h of dirs) await addFolder(() => lib.addRootFromHandle(h));
  });
}

function noticeRow(text, onClick) {
  const li = el('li', 'local-notice' + (onClick ? ' clickable' : ''));
  li.textContent = text;
  if (onClick) li.onclick = onClick;
  return li;
}

function crumbsRow(parts, actions = []) {
  const li = el('li', 'local-crumbs');
  const trail = el('span', 'local-trail');
  parts.forEach((p, i) => {
    if (i) trail.appendChild(el('span', 'local-sep', '›'));
    const a = el('button', 'local-crumb' + (p.onClick ? '' : ' current'));
    a.type = 'button';
    a.textContent = p.label;
    if (p.onClick) a.onclick = p.onClick;
    trail.appendChild(a);
  });
  const acts = el('span', 'local-acts always');
  actions.forEach(a => acts.appendChild(actionBtn(...a)));
  li.append(trail, acts);
  return li;
}

function trackRow(st, index, queueFn, extraActions = []) {
  const li = row({
    icon: ICON.note,
    label: st.title,
    cls: 'local-track',
    actions: [
      [lib.isFavorite(st) ? ICON.heartFill : ICON.heart, 'Favorite', b => {
        const on = lib.toggleFavorite({ rootId: st.rootId, path: st.path });
        b.innerHTML = on ? ICON.heartFill : ICON.heart;
        b.classList.toggle('fav-on', on);
        toast(on ? 'Added to favorites' : 'Removed from favorites');
      }],
      [ICON.plus, 'Add to playlist', b => pickPlaylist(b, async () => [{ rootId: st.rootId, path: st.path }])],
      ...extraActions
    ],
    onClick: e => {
      if (st.url === window.currentStationUrl && audio().duration) {
        // Clicking the active row seeks, like NFT tracks do.
        const r = li.getBoundingClientRect();
        audio().currentTime = ((e.clientX - r.left) / r.width) * audio().duration;
        return;
      }
      const { stations, start } = queueFn(index);
      ctx.playQueue(stations, start);
    }
  });
  li.dataset.url = st.url;
  li._station = st;
  li.appendChild(el('span', 'local-dur'));
  if (st.url === window.currentStationUrl) li.classList.add('active');
  if (lib.isFavorite(st)) li.querySelector('.local-act[title="Favorite"]')?.classList.add('fav-on');
  return li;
}

// ---- durations (lazy, only rows that scroll into view) -------------------

function pumpDurations() {
  while (durationActive < DURATION_CONCURRENCY && durationQueue.length) {
    const li = durationQueue.shift();
    if (!li.isConnected) continue;
    durationActive++;
    lib.getDuration(li._station).then(seconds => {
      const cell = li.querySelector('.local-dur');
      if (cell && seconds) cell.textContent = lib.formatDuration(seconds);
    }).catch(() => {}).finally(() => {
      durationActive--;
      pumpDurations();
    });
  }
}

function watchDurations() {
  if (durationObserver) durationObserver.disconnect();
  durationQueue = [];
  if (!ctx) return;
  durationObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      durationObserver.unobserve(entry.target);
      durationQueue.push(entry.target);
    }
    pumpDurations();
  }, { root: ctx.scroller, rootMargin: '200px' });
  ctx.list.querySelectorAll('li.local-track').forEach(li => durationObserver.observe(li));
}

// ---- views ------------------------------------------------------------

async function homeRows() {
  const rows = [];
  const roots = await lib.listRoots();
  rows.push(sectionRow('Folders'));
  if (!roots.length) rows.push(dropZoneRow(true));
  const shownRoots = roots.filter(r => matches(r.name));
  for (const root of shownRoots) {
    const granted = await lib.hasAccess(root);
    rows.push(row({
      icon: granted ? ICON.folder : ICON.lock,
      label: root.name,
      sub: granted ? '' : 'click to allow access',
      onClick: async () => {
        if (!granted && !(await lib.requestAccess(root))) return;
        setView({ kind: 'dir', rootId: root.id, path: [] });
      },
      actions: [
        [ICON.play, 'Play folder', () => playFolder(root, [])],
        [ICON.list, 'Add folder to playlist', b => pickPlaylist(b, () => lib.walkTracks(root, []))],
        [ICON.trash, 'Remove folder from library', async () => {
          const ok = await confirmDialog({
            title: 'Remove folder?',
            text: `“${root.name}” will be removed from your library. Files on disk stay untouched.`,
            okLabel: 'Remove'
          });
          if (!ok) return;
          await lib.removeRoot(root.id);
          render();
        }]
      ]
    }));
  }

  // With folders present, the compact drop zone sits under the last folder.
  if (roots.length) rows.push(dropZoneRow(false));

  rows.push(sectionRow('Playlists'));
  const favs = lib.loadFavorites();
  if (matches('favorites')) {
    rows.push(row({
      icon: ICON.heartFill,
      label: 'Favorites',
      sub: `${favs.length} track${favs.length === 1 ? '' : 's'}`,
      cls: 'local-fav-row',
      onClick: () => setView({ kind: 'favorites' }),
      actions: [[ICON.play, 'Play favorites', () => playFavorites()]]
    }));
  }
  const playlists = lib.loadPlaylists().filter(p => matches(p.name));
  for (const pl of playlists) {
    rows.push(row({
      icon: ICON.list,
      label: pl.name,
      sub: `${pl.tracks.length} track${pl.tracks.length === 1 ? '' : 's'}`,
      onClick: () => setView({ kind: 'playlist', id: pl.id }),
      actions: [
        [ICON.play, 'Play playlist', () => playPlaylist(pl.id)],
        [ICON.edit, 'Rename', async b => {
          const name = await askName(b, { title: 'Rename playlist', value: pl.name });
          if (name) { lib.renamePlaylist(pl.id, name); render(); }
        }],
        [ICON.trash, 'Delete playlist', async () => {
          if (await confirmDeletePlaylist(pl)) { lib.deletePlaylist(pl.id); render(); }
        }]
      ]
    }));
  }
  const newRow = row({
    icon: ICON.plus,
    label: 'New playlist',
    cls: 'local-new',
    onClick: async () => {
      const name = await askName(newRow, { title: 'New playlist', ok: 'Create' });
      if (name) { const pl = lib.createPlaylist(name); setView({ kind: 'playlist', id: pl.id }); }
    }
  });
  rows.push(newRow);
  return rows;
}

async function dirRows() {
  const root = await lib.getRoot(view.rootId);
  if (!root) { view = { kind: 'home' }; return homeRows(); }

  const crumbs = [{ label: 'Library', onClick: () => setView({ kind: 'home' }) }];
  crumbs.push({ label: root.name, onClick: view.path.length ? () => setView({ kind: 'dir', rootId: root.id, path: [] }) : null });
  view.path.forEach((p, i) => {
    const last = i === view.path.length - 1;
    crumbs.push({ label: p, onClick: last ? null : () => setView({ kind: 'dir', rootId: root.id, path: view.path.slice(0, i + 1) }) });
  });
  const head = crumbsRow(crumbs, [
    [ICON.play, 'Play this folder (incl. subfolders)', () => playFolder(root, view.path)],
    [ICON.list, 'Add this folder to playlist', b => pickPlaylist(b, () => lib.walkTracks(root, view.path))]
  ]);

  if (!(await lib.hasAccess(root))) {
    return [head, noticeRow('Browser access to this folder expired. Click to allow it again.', async () => {
      if (await lib.requestAccess(root)) render();
    })];
  }

  let listing;
  try {
    listing = await lib.listDir(root, view.path);
  } catch {
    return [head, noticeRow('This folder is no longer available.', () => setView({ kind: 'home' }))];
  }

  const rows = [head];
  const dirs = listing.dirs.filter(matches);
  const files = listing.files.filter(matches);
  for (const d of dirs) {
    const path = [...view.path, d];
    rows.push(row({
      icon: ICON.folder,
      label: d,
      onClick: () => setView({ kind: 'dir', rootId: root.id, path }),
      actions: [
        [ICON.play, 'Play folder', () => playFolder(root, path)],
        [ICON.list, 'Add folder to playlist', b => pickPlaylist(b, () => lib.walkTracks(root, path))]
      ]
    }));
  }
  const stations = files.map(f => lib.makeStation({ rootId: root.id, path: [...view.path, f] }, root.name));
  stations.forEach((st, i) => rows.push(trackRow(st, i, () => ({ stations, start: i }))));
  if (!dirs.length && !files.length) {
    rows.push(noticeRow(query ? 'Nothing found.' : 'No audio files or subfolders here.'));
  }
  return rows;
}

const SEARCH_LIMIT = 300;

function indexFor(root) {
  if (!searchIndex) searchIndex = new Map();
  if (!searchIndex.has(root.id)) searchIndex.set(root.id, lib.indexRoot(root));
  return searchIndex.get(root.id);
}

// Search runs over every added folder, not just the one on screen.
async function searchRows() {
  const words = query.split(/\s+/).filter(Boolean);
  const hit = (...parts) => {
    const text = parts.join(' ').toLowerCase();
    return words.every(w => text.includes(w));
  };
  const rows = [crumbsRow([
    { label: 'Library', onClick: () => setView({ kind: 'home' }) },
    { label: `Search: ${query}` }
  ])];
  const folderRows = [];
  const stations = [];
  let skipped = 0;
  let capped = false;

  for (const root of await lib.listRoots()) {
    if (!(await lib.hasAccess(root))) { skipped++; continue; }
    let idx;
    try { idx = await indexFor(root); } catch { skipped++; continue; }
    for (const path of idx.dirs) {
      if (folderRows.length >= SEARCH_LIMIT) { capped = true; break; }
      const name = path[path.length - 1];
      if (!hit(name)) continue;
      folderRows.push(row({
        icon: ICON.folder,
        label: name,
        sub: path.slice(0, -1).join(' / ') || root.name,
        onClick: () => setView({ kind: 'dir', rootId: root.id, path }),
        actions: [
          [ICON.play, 'Play folder', () => playFolder(root, path)],
          [ICON.list, 'Add folder to playlist', b => pickPlaylist(b, () => lib.walkTracks(root, path))]
        ]
      }));
    }
    for (const path of idx.files) {
      if (stations.length >= SEARCH_LIMIT) { capped = true; break; }
      const parent = path.length > 1 ? path[path.length - 2] : root.name;
      if (!hit(path[path.length - 1], parent)) continue;
      stations.push(lib.makeStation({ rootId: root.id, path }, root.name));
    }
  }

  rows.push(...folderRows);
  stations.forEach((st, i) => rows.push(trackRow(st, i, () => ({ stations, start: i }))));
  if (!folderRows.length && !stations.length) rows.push(noticeRow('Nothing found.'));
  if (capped) rows.push(noticeRow(`Showing the first ${SEARCH_LIMIT} matches. Refine the search to narrow it down.`));
  if (skipped) rows.push(noticeRow('Some folders need access again: open the Library and allow them.'));
  return rows;
}

async function playlistRows() {
  const pl = lib.getPlaylist(view.id);
  if (!pl) { view = { kind: 'home' }; return homeRows(); }
  const roots = await lib.listRoots();
  const rootName = id => (roots.find(r => r.id === id) || {}).name || '';

  const rows = [crumbsRow(
    [{ label: 'Library', onClick: () => setView({ kind: 'home' }) }, { label: pl.name }],
    [
      [ICON.play, 'Play playlist', () => playPlaylist(pl.id)],
      [ICON.edit, 'Rename', async b => {
        const name = await askName(b, { title: 'Rename playlist', value: pl.name });
        if (name) { lib.renamePlaylist(pl.id, name); render(); }
      }],
      [ICON.trash, 'Delete playlist', async () => {
        if (await confirmDeletePlaylist(pl)) { lib.deletePlaylist(pl.id); setView({ kind: 'home' }); }
      }]
    ]
  )];

  const entries = pl.tracks.map((t, index) => ({ t, index, st: lib.makeStation(t, rootName(t.rootId)) }));
  const shown = entries.filter(e => matches(e.st.title));
  const stations = shown.map(e => e.st);
  shown.forEach((e, i) => {
    const li = trackRow(e.st, i, () => ({ stations, start: i }), query ? [] : [
      [ICON.up, 'Move up', () => { lib.moveTrack(pl.id, e.index, e.index - 1); render(); }],
      [ICON.down, 'Move down', () => { lib.moveTrack(pl.id, e.index, e.index + 1); render(); }],
      [ICON.trash, 'Remove from playlist', () => { lib.removeTrack(pl.id, e.index); render(); }]
    ]);
    // "Add to playlist" makes little sense inside a playlist; swap it for reorder/remove.
    li.querySelector('.local-act[title="Add to playlist"]')?.remove();
    rows.push(li);
  });
  if (!shown.length) {
    rows.push(noticeRow(query ? 'Nothing found.' : 'Empty playlist. Browse a folder and press “+” on a track or folder to add it.'));
  }
  return rows;
}

async function favoritesRows() {
  const roots = await lib.listRoots();
  const rootName = id => (roots.find(r => r.id === id) || {}).name || '';
  const rows = [crumbsRow(
    [{ label: 'Library', onClick: () => setView({ kind: 'home' }) }, { label: 'Favorites' }],
    [[ICON.play, 'Play favorites', () => playFavorites()]]
  )];
  const shown = lib.loadFavorites()
    .map(t => lib.makeStation(t, rootName(t.rootId)))
    .filter(st => matches(st.title));
  shown.forEach((st, i) => rows.push(trackRow(st, i, () => ({ stations: shown, start: i }))));
  if (!shown.length) {
    rows.push(noticeRow(query ? 'Nothing found.' : 'No favorites yet. Press the heart on a track, or the heart button in the player.'));
  }
  return rows;
}

async function render(resetScroll = false, revealActive = false) {
  if (!ctx) return;
  const token = ++renderToken;
  let rows;
  try {
    rows = query && (view.kind === 'dir' || view.kind === 'home') ? await searchRows()
      : view.kind === 'dir' ? await dirRows()
      : view.kind === 'playlist' ? await playlistRows()
      : view.kind === 'favorites' ? await favoritesRows()
      : await homeRows();
  } catch (err) {
    console.warn('Local explorer error:', err);
    rows = [noticeRow('Something went wrong while reading the library.')];
  }
  if (token !== renderToken || !ctx) return;
  ctx.list.replaceChildren(...rows);
  activeLi = ctx.list.querySelector('li.active[data-url]');
  watchDurations();
  if (resetScroll && ctx.scroller) ctx.scroller.scrollTo({ top: 0 });
  // after a random pick, bring the playing track into view inside its folder
  if (revealActive && activeLi) activeLi.scrollIntoView({ block: 'center' });
}

// ---- play helpers -----------------------------------------------------

async function playFolder(root, path) {
  if (!(await lib.hasAccess(root)) && !(await lib.requestAccess(root))) return;
  try {
    const tracks = await lib.walkTracks(root, path);
    if (!tracks.length) { toast('No audio files in this folder'); return; }
    ctx.playQueue(tracks.map(t => lib.makeStation(t, root.name)), 0);
  } catch {
    toast('Could not read this folder');
  }
}

async function playPlaylist(id) {
  const pl = lib.getPlaylist(id);
  if (!pl || !pl.tracks.length) { toast('Playlist is empty'); return; }
  const roots = await lib.listRoots();
  ctx.playQueue(pl.tracks.map(t => lib.makeStation(t, (roots.find(r => r.id === t.rootId) || {}).name || '')), 0);
}

async function playFavorites() {
  const favs = lib.loadFavorites();
  if (!favs.length) { toast('No favorites yet'); return; }
  const roots = await lib.listRoots();
  ctx.playQueue(favs.map(t => lib.makeStation(t, (roots.find(r => r.id === t.rootId) || {}).name || '')), 0);
}

// Random pick for the "Random track" button.
// - Playlist / favorites view: a random track from that list.
// - Folder browser (home or any folder): a random FOLDER (anywhere below the
//   current one, or in the whole library from home), then a random song in it.
//   That folder becomes the queue so playback carries on through the album.
export async function playRandom() {
  if (!ctx) return;
  const roots = await lib.listRoots();
  const nameOf = id => (roots.find(r => r.id === id) || {}).name || '';
  const pick = list => list[Math.floor(Math.random() * list.length)];
  let queue = [];
  let folderPick = null;
  try {
    if (view.kind === 'playlist' || view.kind === 'favorites') {
      queue = view.kind === 'playlist' ? (lib.getPlaylist(view.id) || { tracks: [] }).tracks : lib.loadFavorites();
    } else {
      const scopes = [];
      if (view.kind === 'dir') {
        const root = await lib.getRoot(view.rootId);
        if (root) scopes.push({ root, path: view.path });
      } else {
        roots.forEach(root => scopes.push({ root, path: [] }));
      }
      const folders = [];
      for (const { root, path } of scopes) {
        if (!(await lib.hasAccess(root)) && !(await lib.requestAccess(root))) continue;
        folders.push(...await lib.collectFolders(root, path));
      }
      if (folders.length) {
        const folder = pick(folders);
        folderPick = folder;
        queue = folder.files.map(name => ({ rootId: folder.rootId, path: [...folder.path, name] }));
      }
    }
  } catch {
    toast('Could not read the library');
    return;
  }
  if (!queue.length) { toast('Nothing to play here yet. Add a folder first.'); return; }
  const start = Math.floor(Math.random() * queue.length);
  ctx.playQueue(queue.map(t => lib.makeStation(t, nameOf(t.rootId))), start);
  // folder browser: jump into the album the track came from
  if (folderPick) setView({ kind: 'dir', rootId: folderPick.rootId, path: folderPick.path }, { reveal: true });
}

// ---- public API -------------------------------------------------------

export function enterLocalMode(context) {
  ctx = context;
  closePopover();
  query = '';
  view = lib.loadLastView();

  const addBtn = document.getElementById('localAddFolderBtn');
  if (addBtn) {
    addBtn.onclick = addFolderFromPicker;
  }
  document.addEventListener('localFavoritesChanged', onFavoritesChanged);
  if (ctx.scroller) {
    ctx.scroller.addEventListener('dragover', onDragOver);
    ctx.scroller.addEventListener('dragleave', onDragLeave);
    ctx.scroller.addEventListener('drop', onDrop);
  }

  const input = document.getElementById('searchInput');
  const clear = document.getElementById('clearSearch');
  if (input) {
    input.placeholder = 'Search this view';
    let t;
    input.addEventListener('input', () => {
      query = input.value.trim().toLowerCase();
      if (!query) searchIndex = null;
      if (clear) clear.style.display = input.value ? 'block' : 'none';
      clearTimeout(t);
      t = setTimeout(() => render(), 250);
    });
  }
  if (clear) {
    clear.addEventListener('click', () => {
      query = '';
      searchIndex = null;
      input.value = '';
      clear.style.display = 'none';
      render();
    });
  }
  render(true);
}

function onFavoritesChanged() {
  if (ctx) render();
}

export function leaveLocalMode() {
  if (durationObserver) durationObserver.disconnect();
  durationObserver = null;
  durationQueue = [];
  document.removeEventListener('localFavoritesChanged', onFavoritesChanged);
  if (ctx && ctx.scroller) {
    ctx.scroller.removeEventListener('dragover', onDragOver);
    ctx.scroller.removeEventListener('dragleave', onDragLeave);
    ctx.scroller.removeEventListener('drop', onDrop);
    ctx.scroller.classList.remove('drag-over');
  }
  ctx = null;
  activeLi = null;
  closePopover();
  lib.releaseTrack();
}

export function syncActive() {
  if (!ctx) return;
  const cur = window.currentStationUrl;
  ctx.list.querySelectorAll('li[data-url]').forEach(li => {
    li.classList.toggle('active', li.dataset.url === cur);
    li.style.setProperty('--buffer-percent', '0%');
  });
  activeLi = ctx.list.querySelector('li.active[data-url]');
}

export function setLocalProgress(percent) {
  if (activeLi) activeLi.style.setProperty('--buffer-percent', percent + '%');
}

// ---- "browser can't do this" help dialog ------------------------------

async function describeUnsupported() {
  const ua = navigator.userAgent;
  const isBrave = !!(navigator.brave && (await navigator.brave.isBrave().catch(() => false)));
  if (isBrave) {
    return {
      title: 'Turn on folder access in Brave',
      intro: 'Brave keeps this feature switched off by default. It takes about 30 seconds to enable:',
      steps: [
        'Copy the address below and paste it into a new tab.',
        'Set “File System Access API” to Enabled.',
        'Click Relaunch at the bottom, then come back to FONY.'
      ],
      flag: 'brave://flags/#file-system-access-api'
    };
  }
  if (/firefox/i.test(ua) || (/safari/i.test(ua) && !/chrome|chromium|crios|edg|opr/i.test(ua))) {
    return {
      title: 'Local files need a different browser',
      intro: 'Firefox and Safari can’t give websites access to folders on your computer. Open FONY in Chrome, Edge, Opera or Brave to use Local mode.',
      steps: []
    };
  }
  if (!window.isSecureContext) {
    return {
      title: 'Open FONY over a secure address',
      intro: 'Folder access only works on https:// pages (or localhost). Open FONY through its https:// address and try again.',
      steps: []
    };
  }
  return {
    title: 'Folder access isn’t available here',
    intro: 'This window can’t open local folders. Try opening FONY in a regular Chrome, Edge, Opera or Brave tab.',
    steps: []
  };
}

export async function showUnsupportedDialog() {
  document.querySelector('.local-help')?.remove();
  const info = await describeUnsupported();
  const overlay = el('div', 'local-help');
  const box = el('div', 'local-help-box');
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };

  const h = el('h3', 'local-help-title');
  h.textContent = info.title;
  const p = el('p', 'local-help-text');
  p.textContent = info.intro;
  box.append(h, p);

  if (info.steps.length) {
    const ol = el('ol', 'local-help-steps');
    info.steps.forEach(t => { const li = el('li'); li.textContent = t; ol.appendChild(li); });
    box.appendChild(ol);
  }
  if (info.flag) {
    const row = el('div', 'local-help-flag');
    const code = el('code');
    code.textContent = info.flag;
    const copy = el('button', 'local-pop-btn');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(info.flag);
        copy.textContent = 'Copied!';
      } catch {
        const r = document.createRange();
        r.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        copy.textContent = 'Press Ctrl+C';
      }
    };
    row.append(code, copy);
    box.appendChild(row);
    const note = el('p', 'local-help-note');
    note.textContent = 'Browsers don’t allow websites to open this page for you, so it has to be pasted manually.';
    box.appendChild(note);
  }

  const ok = el('button', 'local-pop-btn local-help-close');
  ok.type = 'button';
  ok.textContent = 'Got it';
  ok.onclick = close;
  box.appendChild(ok);
  overlay.appendChild(box);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}
