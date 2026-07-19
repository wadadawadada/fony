const CATALOG_BASE_URL = 'https://api.github.com/repos/junguler/m3u-radio-music-playlists/contents/%2Bmerged%2B';
const folderCache = new Map();

function displayName(filename) {
  return filename
    .replace(/\.m3u8?$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' }
  });

  if (!response.ok) {
    if (response.status === 403) {
      const resetAt = Number(response.headers.get('X-RateLimit-Reset'));
      if (resetAt) {
        const time = new Date(resetAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        throw new Error(`GitHub API limit reached. Try again after ${time}.`);
      }
    }
    throw new Error(`GitHub returned ${response.status}`);
  }
  return response.json();
}

// A folder is loaded only when its letter is selected, so only one small
// directory listing is fetched instead of the complete catalog.
export function loadMergedPlaylistFolder(folder) {
  if (folderCache.has(folder)) return folderCache.get(folder);

  const request = getJson(`${CATALOG_BASE_URL}/${encodeURIComponent(folder)}?ref=main`)
    .then(entries => entries
      .filter(entry => entry.type === 'file' && /\.m3u8?$/i.test(entry.name) && entry.download_url)
      .map(entry => ({ name: displayName(entry.name), url: entry.download_url }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));

  folderCache.set(folder, request);
  request.catch(() => folderCache.delete(folder));
  return request;
}

export function resetMergedPlaylistCatalog() {
  folderCache.clear();
}
