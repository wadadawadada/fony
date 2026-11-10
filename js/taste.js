// Local genre taste: remembers which genres the user listens to and nudges
// the Random button towards them. Everything stays in localStorage.
//
// Genre = playlist name (built-in genres and user-added custom playlists alike).
// Favorites are not stored here: they are counted on the fly at pick time.

const KEY = "genreTaste";
const MIN_LISTEN_MS = 45000;   // shorter listens (channel surfing) are ignored
const DAILY_DECAY = 0.97;      // old habits fade out slowly
const MIN_WEIGHT = 0.1;        // prune near-zero entries
const FAVORITE_WEIGHT = 1.5;   // one favorite counts like 1.5 listens
const TASTE_STRENGTH = 1.2;    // how much sqrt(taste) lifts a genre over the base 1
const EXPLORE_CHANCE = 0.2;    // share of rolls that ignore taste entirely

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d && typeof d.w === "object" && d.w) return d;
  } catch {}
  return { t: Date.now(), w: {} };
}

function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}

function decayed(d) {
  const days = (Date.now() - (d.t || Date.now())) / 86400000;
  if (days < 1) return d;
  const k = Math.pow(DAILY_DECAY, Math.floor(days));
  const w = {};
  for (const name in d.w) {
    const v = d.w[name] * k;
    if (v >= MIN_WEIGHT) w[name] = v;
  }
  return { t: Date.now(), w };
}

function addListen(name) {
  if (!name) return;
  const d = decayed(load());
  d.w[name] = (d.w[name] || 0) + 1;
  save(d);
}

// Call when a radio station starts playing; counts it once it has played long enough.
let timer = null;
export function trackListen(genreName) {
  stopTracking();
  if (!genreName) return;
  timer = setTimeout(() => { timer = null; addListen(genreName); }, MIN_LISTEN_MS);
}

export function stopTracking() {
  if (timer) { clearTimeout(timer); timer = null; }
}

function favoriteCounts(playlists) {
  const counts = {};
  let favs = [];
  try { favs = JSON.parse(localStorage.getItem("favorites") || "[]"); } catch {}
  if (!Array.isArray(favs)) return counts;
  const byFile = new Map(playlists.map(p => [p.file, p.name]));
  for (const f of favs) {
    if (!f || !f.genre) continue;
    const name = byFile.get(f.genre) || f.genre; // old entries store the file path
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

// Weighted random playlist: every genre keeps a base chance, listened and
// favorited ones get more. Falls back to uniform when there is no data.
export function pickPlaylist(playlists) {
  if (!playlists || !playlists.length) return null;
  const uniform = () => playlists[Math.floor(Math.random() * playlists.length)];
  if (Math.random() < EXPLORE_CHANCE) return uniform();

  const taste = decayed(load()).w;
  const favs = favoriteCounts(playlists);
  const weights = playlists.map(p =>
    1 + TASTE_STRENGTH * Math.sqrt((taste[p.name] || 0) + FAVORITE_WEIGHT * (favs[p.name] || 0))
  );
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < playlists.length; i++) {
    r -= weights[i];
    if (r <= 0) return playlists[i];
  }
  return uniform();
}

export function resetTaste() {
  stopTracking();
  try { localStorage.removeItem(KEY); } catch {}
}

window.pickTastePlaylist = pickPlaylist;
