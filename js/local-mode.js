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
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')
};

let ctx = null;
let view = { kind: 'home' };
let query = '';
let renderToken = 0;
let activeLi = null;
let popEl = null;

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

function setView(next) {
  view = next;
  query = '';
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  const clear = document.getElementById('clearSearch');
  if (clear) clear.style.display = 'none';
  lib.saveLastView(view);
  render(true);
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

function sectionRow(text) {
  const li = el('li', 'local-section');
  li.textContent = text;
  return li;
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
    actions: [[ICON.plus, 'Add to playlist', b => pickPlaylist(b, async () => [{ rootId: st.rootId, path: st.path }])], ...extraActions],
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
  if (st.url === window.currentStationUrl) li.classList.add('active');
  return li;
}

// ---- views ------------------------------------------------------------

async function homeRows() {
  const rows = [];
  const roots = await lib.listRoots();
  rows.push(sectionRow('Folders'));
  const shownRoots = roots.filter(r => matches(r.name));
  if (!roots.length) rows.push(noticeRow('No folders yet. Press the folder “+” button above to add a music folder.'));
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
          if (!confirm(`Remove “${root.name}” from the library? Files on disk stay untouched.`)) return;
          await lib.removeRoot(root.id);
          render();
        }]
      ]
    }));
  }

  rows.push(sectionRow('Playlists'));
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
        [ICON.trash, 'Delete playlist', () => {
          if (confirm(`Delete playlist “${pl.name}”?`)) { lib.deletePlaylist(pl.id); render(); }
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
      [ICON.trash, 'Delete playlist', () => {
        if (confirm(`Delete playlist “${pl.name}”?`)) { lib.deletePlaylist(pl.id); setView({ kind: 'home' }); }
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
    li.querySelector('.local-act')?.remove();
    rows.push(li);
  });
  if (!shown.length) {
    rows.push(noticeRow(query ? 'Nothing found.' : 'Empty playlist. Browse a folder and press “+” on a track or folder to add it.'));
  }
  return rows;
}

async function render(resetScroll = false) {
  if (!ctx) return;
  const token = ++renderToken;
  let rows;
  try {
    rows = view.kind === 'dir' ? await dirRows() : view.kind === 'playlist' ? await playlistRows() : await homeRows();
  } catch (err) {
    console.warn('Local explorer error:', err);
    rows = [noticeRow('Something went wrong while reading the library.')];
  }
  if (token !== renderToken || !ctx) return;
  ctx.list.replaceChildren(...rows);
  activeLi = ctx.list.querySelector('li.active[data-url]');
  if (resetScroll && ctx.scroller) ctx.scroller.scrollTo({ top: 0 });
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

// ---- public API -------------------------------------------------------

export function enterLocalMode(context) {
  ctx = context;
  closePopover();
  query = '';
  view = lib.loadLastView();

  const addBtn = document.getElementById('localAddFolderBtn');
  if (addBtn) {
    addBtn.onclick = async () => {
      try {
        const { root, existed } = await lib.addRoot();
        toast(existed ? `“${root.name}” is already in the library` : `Added “${root.name}”`);
        setView({ kind: 'dir', rootId: root.id, path: [] });
      } catch (err) {
        if (err && err.name !== 'AbortError') toast('Could not open that folder');
      }
    };
  }

  const input = document.getElementById('searchInput');
  const clear = document.getElementById('clearSearch');
  if (input) {
    input.placeholder = 'Search this view';
    let t;
    input.addEventListener('input', () => {
      query = input.value.trim().toLowerCase();
      if (clear) clear.style.display = input.value ? 'block' : 'none';
      clearTimeout(t);
      t = setTimeout(() => render(), 150);
    });
  }
  if (clear) {
    clear.addEventListener('click', () => {
      query = '';
      input.value = '';
      clear.style.display = 'none';
      render();
    });
  }
  render(true);
}

export function leaveLocalMode() {
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
