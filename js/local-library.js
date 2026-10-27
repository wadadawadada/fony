// Local music library: folder handles live in IndexedDB (they can't be
// serialised to localStorage), custom playlists live in localStorage like the
// rest of the app's user data.

const DB_NAME = 'fony-local';
const STORE = 'roots';
const PLAYLISTS_KEY = 'localPlaylists';
const AUDIO_EXT = /\.(mp3|flac|ogg|oga|opus|wav|m4a|aac|weba)$/i;
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
  return addRootFromHandle(await window.showDirectoryPicker({ id: 'fony-local', mode: 'read' }));
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
  for await (const [name, entry] of h.entries()) {
    if (name.startsWith('.')) continue;
    if (entry.kind === 'directory') dirs.push(name);
    else if (AUDIO_EXT.test(name)) files.push(name);
  }
  dirs.sort(collator.compare);
  files.sort(collator.compare);
  return { dirs, files };
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

export async function getFile(rootId, path) {
  const root = await getRoot(rootId);
  if (!root) throw new Error('Folder was removed');
  if (!(await hasAccess(root)) && !(await requestAccess(root))) throw new Error('No access to folder');
  const dir = await dirHandle(root, path.slice(0, -1));
  const fh = await dir.getFileHandle(path[path.length - 1]);
  return fh.getFile();
}

// ---- stations ---------------------------------------------------------

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

export function makeStation(track, rootName = '') {
  const file = track.path[track.path.length - 1];
  const base = stripExt(file);
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
  const clean = base.replace(/^\d{1,3}\s*[-._)]\s*/, '').replace(/_/g, ' ').trim();
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

async function readTags(file) {
  const lib = await loadTagsLib();
  if (!lib) return {};
  return new Promise(resolve => {
    lib.read(file, {
      onSuccess: ({ tags }) => {
        let cover = null;
        if (tags.picture && tags.picture.data) {
          const { data, format } = tags.picture;
          cover = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: format || 'image/jpeg' }));
        }
        resolve({ title: tags.title, artist: tags.artist, album: tags.album, cover });
      },
      onError: () => resolve({})
    });
  });
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
