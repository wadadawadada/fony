const KEY = 'customPlaylists';

export function loadCustomPlaylists() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCustomPlaylist(name, url) {
  const list = loadCustomPlaylists();
  const entry = { id: `custom_${Date.now()}`, name, file: url, custom: true };
  list.push(entry);
  localStorage.setItem(KEY, JSON.stringify(list));
  return entry;
}

export function deleteCustomPlaylist(id) {
  const list = loadCustomPlaylists().filter(p => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function normalizePlaylistUrl(url) {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)/);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}`;
  return url;
}

export function suggestNameFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const filename = parts[parts.length - 1]
      .replace(/\.(m3u8?|pls|xspf)$/i, '')
      .replace(/^[-_]+/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    const parentRaw = parts.length > 1 ? parts[parts.length - 2].replace(/[-_]+/g, ' ').trim() : '';
    const parent = parentRaw.length > 1 ? parentRaw : '';
    const raw = parent && parent !== filename ? `${parent} ${filename}` : filename;
    return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Custom Playlist';
  } catch {
    return 'Custom Playlist';
  }
}
