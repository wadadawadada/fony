// Local music library: folder handles live in IndexedDB (they can't be
// serialised to localStorage), custom playlists live in localStorage like the
// rest of the app's user data.

const DB_NAME = 'fony-local';
const STORE = 'roots';
const PLAYLISTS_KEY = 'localPlaylists';
const AUDIO_EXT = /\.(mp3|flac|ogg|oga|opus|wav|m4a|aac|weba)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const COVER_NAME = /^(cover|folder|front|album|art|artwork)/i;
const TAGS_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isLocalSupported() {
  return typeof window.showDirectoryPicker === 'function' && window.innerWidth > 768;
}

// ---- roots (IndexedDB) -------------------------------------------------

let dbPromise = null;
let rootsCache = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

export async function listRoots() {
  if (!rootsCache) {
    const all = await run('readonly', s => s.getAll());
    rootsCache = all.sort((a, b) => a.addedAt - b.addedAt);
  }
  return rootsCache;
}

export async function getRoot(id) {
  return (await listRoots()).find(r => r.id === id) || null;
}

// Throws AbortError if the user dismisses the picker.
export async function addRoot() {
  return addRootFromHandle(await window.showDirectoryPicker());
}

export async function addRootFromHandle(handle) {
  const roots = await listRoots();
  for (const r of roots) {
    if (await r.handle.isSameEntry(handle)) return { root: r, existed: true };
  }
  const root = { id: 'r' + Date.now().toString(36), name: handle.name, handle, addedAt: Date.now() };
  await run('readwrite', s => s.put(root));
  roots.push(root);
  return { root, existed: false };
}

export async function removeRoot(id) {
  await run('readwrite', s => s.delete(id));
  rootsCache = (await listRoots()).filter(r => r.id !== id);
}

export async function hasAccess(root) {
  try {
    return (await root.handle.queryPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

export async function requestAccess(root) {
  try {
    return (await root.handle.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

// ---- file system traversal --------------------------------------------

async function dirHandle(root, path) {
  let h = root.handle;
  for (const part of path) h = await h.getDirectoryHandle(part);
  return h;
}

async function readEntries(h) {
  const dirs = [];
  const files = [];
  const images = [];
  for await (const [name, entry] of h.entries()) {
    if (name.startsWith('.')) continue;
    if (entry.kind === 'directory') dirs.push(name);
    else if (AUDIO_EXT.test(name)) files.push(name);
    else if (IMAGE_EXT.test(name)) images.push(name);
  }
  dirs.sort(collator.compare);
  files.sort(collator.compare);
  // the usual album-art names first, then the rest in natural order
  images.sort((a, b) => (COVER_NAME.test(b) - COVER_NAME.test(a)) || collator.compare(a, b));
  return { dirs, files, images };
}

export async function listDir(root, path) {
  return readEntries(await dirHandle(root, path));
}

// Every audio file under root/path, folder by folder, in natural order.
export async function walkTracks(root, path) {
  const out = [];
  async function rec(h, p) {
    const { dirs, files } = await readEntries(h);
    for (const f of files) out.push({ rootId: root.id, path: [...p, f] });
    for (const d of dirs) await rec(await h.getDirectoryHandle(d), [...p, d]);
  }
  await rec(await dirHandle(root, path), path);
  return out;
}

// Every folder and audio file under the root, as path arrays, in one pass.
// Used by the search, which looks through the whole added folder.
export async function indexRoot(root) {
  const dirs = [];
  const files = [];
  async function rec(h, p) {
    const entries = await readEntries(h);
    for (const f of entries.files) files.push([...p, f]);
    for (const d of entries.dirs) {
      dirs.push([...p, d]);
      await rec(await h.getDirectoryHandle(d), [...p, d]);
    }
  }
  await rec(await dirHandle(root, []), []);
  return { dirs, files };
}

// Every folder under root/path that directly holds audio files, with its file
// names. Used to pick "a random folder" before "a random song".
export async function collectFolders(root, path) {
  const out = [];
  async function rec(h, p) {
    const { dirs, files } = await readEntries(h);
    if (files.length) out.push({ rootId: root.id, path: p, files });
    for (const d of dirs) await rec(await h.getDirectoryHandle(d), [...p, d]);
  }
  await rec(await dirHandle(root, path), path);
  return out;
}

export async function getFile(rootId, path) {
  const root = await getRoot(rootId);
  if (!root) throw new Error('Folder was removed');
  if (!(await hasAccess(root)) && !(await requestAccess(root))) throw new Error('No access to folder');
  const dir = await dirHandle(root, path.slice(0, -1));
  const fh = await dir.getFileHandle(path[path.length - 1]);
  return fh.getFile();
}

// ---- track durations ---------------------------------------------------
// Read lazily (only for rows on screen) from the file's metadata and cached in
// localStorage, validated by file size + modified time so edits are picked up.

const DURATIONS_KEY = 'localDurations';
const DURATIONS_MAX = 6000;
let durationCache = null;
let durationSaveTimer = null;

function durations() {
  if (!durationCache) {
    try { durationCache = JSON.parse(localStorage.getItem(DURATIONS_KEY) || '{}') || {}; } catch { durationCache = {}; }
  }
  return durationCache;
}

function saveDurationsSoon() {
  clearTimeout(durationSaveTimer);
  durationSaveTimer = setTimeout(() => {
    const cache = durations();
    const keys = Object.keys(cache);
    if (keys.length > DURATIONS_MAX) keys.slice(0, keys.length - DURATIONS_MAX).forEach(k => delete cache[k]);
    try { localStorage.setItem(DURATIONS_KEY, JSON.stringify(cache)); } catch {}
  }, 1000);
}

function probeDuration(file) {
  return new Promise(resolve => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let finished = false;
    const done = value => {
      if (finished) return;
      finished = true;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    audio.src = url;
  });
}

// Seconds, or null when unknown. Never asks for folder permission.
export async function getDuration(station) {
  const root = await getRoot(station.rootId);
  if (!root || !(await hasAccess(root))) return null;
  let file;
  try { file = await getFile(station.rootId, station.path); } catch { return null; }
  const key = station.rootId + '/' + station.path.join('/');
  const hit = durations()[key];
  if (hit && hit.s === file.size && hit.m === file.lastModified) return hit.d;
  const seconds = await probeDuration(file);
  if (seconds) {
    durations()[key] = { d: Math.round(seconds), s: file.size, m: file.lastModified };
    saveDurationsSoon();
  }
  return seconds ? Math.round(seconds) : null;
}

// Seconds from the cache only (no file access), or null when this track was never probed.
export function cachedDuration(station) {
  const hit = durations()[station.rootId + '/' + station.path.join('/')];
  return hit ? hit.d : null;
}

export function formatDuration(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ---- stations ---------------------------------------------------------

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

// "01Title", "01 - Title", "07. Title" -> "Title" (a bare "1984" or "7 Days" is left alone)
export function cleanFileName(base) {
  const m = base.match(/^\d{1,3}\s*[-._)]\s*(.+)$/) || base.match(/^\d{2,3}(?=[^\d\s\-._)])(.+)$/);
  return (m ? m[1] : base).trim() || base;
}

export function makeStation(track, rootName = '') {
  const file = track.path[track.path.length - 1];
  const base = cleanFileName(stripExt(file));
  return {
    local: true,
    rootId: track.rootId,
    path: track.path,
    url: `local://${track.rootId}/${track.path.map(encodeURIComponent).join('/')}`,
    title: base,
    playlistTitle: base,
    folderName: track.path.length > 1 ? track.path[track.path.length - 2] : rootName
  };
}

// "01 - Artist - Title" -> { artist, title } best effort when tags are empty.
function parseFileName(base) {
  const clean = cleanFileName(base).replace(/_/g, ' ').trim();
  const m = clean.match(/^(.+?)\s+[-–]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: clean };
}

let tagsLib = null;
function loadTagsLib() {
  if (!tagsLib) {
    tagsLib = new Promise(resolve => {
      if (window.jsmediatags) return resolve(window.jsmediatags);
      const s = document.createElement('script');
      s.src = TAGS_LIB_URL;
      s.onload = () => resolve(window.jsmediatags || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  return tagsLib;
}

// Old ID3v1 / ID3v2 "ISO-8859-1" tags are often really Windows-1251 (Russian) or UTF-8, and
// jsmediatags reads them as Latin-1, giving "Ãàíãàæà". Detect that and re-decode the bytes.
function fixTagText(text) {
  if (typeof text !== 'string' || !text) return text || '';
  let high = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0xFF) return text;          // real Unicode already
    if (c >= 0x80) high++;
  }
  if (!high) return text;
  const bytes = Uint8Array.from(text, ch => ch.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) {}
  // genuine Latin-1 ("Café") has a few accents among plain letters; Cyrillic read as
  // Latin-1 is nearly all high characters
  const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (high < 2 || high / letters < 0.6) return text;
  const fixed = new TextDecoder('windows-1251').decode(bytes);
  return /[Ѐ-ӿ]/.test(fixed) ? fixed : text;
}

async function readTags(file, withCover = true) {
  const lib = await loadTagsLib();
  if (!lib) return {};
  return new Promise(resolve => {
    lib.read(file, {
      onSuccess: ({ tags }) => {
        let cover = null;
        if (withCover && tags.picture && tags.picture.data) {
          const { data, format } = tags.picture;
          cover = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: format || 'image/jpeg' }));
        }
        resolve({ title: fixTagText(tags.title), artist: fixTagText(tags.artist), album: fixTagText(tags.album), cover });
      },
      onError: () => resolve({})
    });
  });
}

// ---- tag info for the list (lazy, cached like the durations) -------------

const META_KEY = 'localMeta';
const META_MAX = 6000;
let metaCache = null;
let metaSaveTimer = null;

function metas() {
  if (!metaCache) {
    try { metaCache = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch { metaCache = {}; }
  }
  return metaCache;
}

function saveMetaSoon() {
  clearTimeout(metaSaveTimer);
  metaSaveTimer = setTimeout(() => {
    const cache = metas();
    const keys = Object.keys(cache);
    if (keys.length > META_MAX) keys.slice(0, keys.length - META_MAX).forEach(k => delete cache[k]);
    try { localStorage.setItem(META_KEY, JSON.stringify(cache)); } catch {}
  }, 1000);
}

// { title, artist } from the file's tags, or null. Never asks for folder permission.
export async function getMeta(station) {
  const root = await getRoot(station.rootId);
  if (!root || !(await hasAccess(root))) return null;
  let file;
  try { file = await getFile(station.rootId, station.path); } catch { return null; }
  const key = station.rootId + '/' + station.path.join('/');
  const hit = metas()[key];
  if (hit && hit.s === file.size && hit.m === file.lastModified) return hit.t ? { title: hit.t, artist: hit.a } : null;
  const tags = await readTags(file, false);
  const title = (tags.title || '').trim();
  metas()[key] = { t: title, a: (tags.artist || '').trim(), s: file.size, m: file.lastModified };
  saveMetaSoon();
  return title ? { title, artist: metas()[key].a } : null;
}

let current = null;

// Resolves the file, reads its tags and mints a playable blob URL. The
// previous blob is revoked a little later so the element never loses its src.
export async function prepareTrack(station) {
  const file = await getFile(station.rootId, station.path);
  const tags = await readTags(file);
  const fallback = parseFileName(station.title);
  const prev = current;
  current = { url: URL.createObjectURL(file), cover: tags.cover || null };
  if (prev) {
    setTimeout(() => {
      URL.revokeObjectURL(prev.url);
      if (prev.cover) URL.revokeObjectURL(prev.cover);
    }, 5000);
  }
  return {
    url: current.url,
    title: (tags.title || '').trim() || fallback.title,
    artist: (tags.artist || '').trim() || fallback.artist,
    album: tags.album || '',
    cover: current.cover
  };
}

export function releaseTrack() {
  if (!current) return;
  URL.revokeObjectURL(current.url);
  if (current.cover) URL.revokeObjectURL(current.cover);
  current = null;
}

// ---- custom playlists (localStorage) ----------------------------------

export function loadPlaylists() {
  try {
    const v = JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function savePlaylists(list) {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
}

function mutate(id, fn) {
  const list = loadPlaylists();
  const pl = list.find(p => p.id === id);
  if (!pl) return null;
  const result = fn(pl);
  savePlaylists(list);
  return result;
}

export function getPlaylist(id) {
  return loadPlaylists().find(p => p.id === id) || null;
}

export function createPlaylist(name) {
  const list = loadPlaylists();
  const pl = {
    id: 'lp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: name.trim() || 'New playlist',
    tracks: [],
    createdAt: Date.now()
  };
  list.push(pl);
  savePlaylists(list);
  return pl;
}

export function renamePlaylist(id, name) {
  mutate(id, pl => { pl.name = name.trim() || pl.name; });
}

export function deletePlaylist(id) {
  savePlaylists(loadPlaylists().filter(p => p.id !== id));
}

// Returns how many tracks were actually added (duplicates are skipped).
export function addTracks(id, tracks) {
  return mutate(id, pl => {
    const seen = new Set(pl.tracks.map(t => t.rootId + '/' + t.path.join('/')));
    let added = 0;
    for (const t of tracks) {
      const key = t.rootId + '/' + t.path.join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      pl.tracks.push({ rootId: t.rootId, path: t.path });
      added++;
    }
    return added;
  }) || 0;
}

export function removeTrack(id, index) {
  mutate(id, pl => { pl.tracks.splice(index, 1); });
}

export function moveTrack(id, from, to) {
  mutate(id, pl => {
    if (to < 0 || to >= pl.tracks.length) return;
    const [t] = pl.tracks.splice(from, 1);
    pl.tracks.splice(to, 0, t);
  });
}

// ---- local favorites (localStorage) -----------------------------------

const FAVORITES_KEY = 'localFavorites';
const trackKey = t => t.rootId + '/' + t.path.join('/');

export function loadFavorites() {
  try {
    const v = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isFavorite(track) {
  const key = trackKey(track);
  return loadFavorites().some(t => trackKey(t) === key);
}

// Returns true when the track is a favorite after the call.
export function toggleFavorite(track) {
  const list = loadFavorites();
  const key = trackKey(track);
  const idx = list.findIndex(t => trackKey(t) === key);
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ rootId: track.rootId, path: track.path, addedAt: Date.now() });
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  document.dispatchEvent(new Event('localFavoritesChanged'));
  return idx < 0;
}

// ---- last browsed view ------------------------------------------------

const VIEW_KEY = 'localLastView';

export function loadLastView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    return v && typeof v.kind === 'string' ? v : { kind: 'home' };
  } catch {
    return { kind: 'home' };
  }
}

export function saveLastView(view) {
  localStorage.setItem(VIEW_KEY, JSON.stringify(view));
}
