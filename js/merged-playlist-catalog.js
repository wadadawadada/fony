// The community catalog (junguler/m3u-radio-music-playlists) is served by the FONY backend, which keeps
// the whole folder index cached and searches it, so the browser never hits GitHub's API rate limit.
const BACKEND = window.FONY_BACKEND_URL || 'https://fonyserver.up.railway.app';
const cache = new Map();

async function getCatalog(params) {
  const key = params.toString();
  if (cache.has(key)) return cache.get(key);
  const request = fetch(`${BACKEND}/api/catalog/playlists?${key}`, { signal: AbortSignal.timeout(20000) })
    .then(async response => {
      if (!response.ok) throw new Error('The community catalog is unavailable right now. Please try again later.');
      return response.json();
    });
  cache.set(key, request);
  request.catch(() => cache.delete(key));
  return request;
}

// All playlists of one folder (letter), sorted by name.
export async function loadMergedPlaylistFolder(folder) {
  const data = await getCatalog(new URLSearchParams({ folder, limit: '200' }));
  return data.items;
}

// Search across every folder: { total, items }, best matches first.
export function searchMergedPlaylists(query, limit = 60) {
  return getCatalog(new URLSearchParams({ q: query, limit: String(limit) }));
}

export function resetMergedPlaylistCatalog() {
  cache.clear();
}
