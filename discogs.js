function sanitizeQuery(str) {
  return str
    .replace(/["“”‘’']/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getConfig() {
  let config = {};
  try {
    const res = await fetch("/config.json");
    if (res.ok) {
      config = await res.json();
    }
  } catch {}
  if (!config.DISCOGS_CONSUMER_KEY || !config.DISCOGS_CONSUMER_SECRET) {
    try {
      const res2 = await fetch("/.netlify/functions/get-config");
      if (res2.ok) {
        const data = await res2.json();
        config.DISCOGS_CONSUMER_KEY = data.DISCOGS_CONSUMER_KEY;
        config.DISCOGS_CONSUMER_SECRET = data.DISCOGS_CONSUMER_SECRET;
      }
    } catch {}
  }
  return config;
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, function(m) {
    switch(m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
  });
}

export async function fetchDiscogsTrackInfo(artist, track) {
  const { DISCOGS_CONSUMER_KEY, DISCOGS_CONSUMER_SECRET } = await getConfig();
  if (!DISCOGS_CONSUMER_KEY || !DISCOGS_CONSUMER_SECRET) {
    return "❗ Discogs API keys are not configured.";
  }
  const rawQuery = `${artist} ${track}`.trim();
  const query = sanitizeQuery(rawQuery);
  if (!query) return "⚠️ Artist or track name is required.";

  const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&key=${DISCOGS_CONSUMER_KEY}&secret=${DISCOGS_CONSUMER_SECRET}&per_page=3&page=1`;

  try {
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'FONY-App/1.0 (contact@fony.space)' }
    });
    if (!searchRes.ok) return `❗ Discogs API error: ${searchRes.status}`;

    const searchData = await searchRes.json();
    if (!searchData.results || searchData.results.length === 0) {
      return `⚠️ No results found on Discogs for "${escapeHtml(query)}"`;
    }

    const release = searchData.results[0];
    const releaseId = release.id;

    const releaseUrl = `https://api.discogs.com/releases/${releaseId}`;
    const releaseRes = await fetch(releaseUrl, {
      headers: { 'User-Agent': 'FONY-App/1.0 (contact@fony.space)' }
    });
    if (!releaseRes.ok) return `❗ Failed to fetch release details: ${releaseRes.status}`;
    const releaseData = await releaseRes.json();

    const title = escapeHtml(releaseData.title);
    const year = releaseData.year || "Unknown year";
    const country = releaseData.country || "Unknown country";
    const genres = releaseData.genres ? releaseData.genres.join(", ") : "Unknown genre";
    const label = (releaseData.labels && releaseData.labels.length > 0) ? escapeHtml(releaseData.labels[0].name) : "Unknown label";
    const cover = releaseData.images && releaseData.images.length > 0 ? releaseData.images[0].uri : null;

    let discogsLink = releaseData.uri || releaseData.resource_url || `https://www.discogs.com/release/${releaseId}`;
    discogsLink = discogsLink.replace(/\s*[–—]\s*/g, "-");

    const artistTrackQuery = encodeURIComponent(`${artist} ${track}`);
    const ytSearchUrl = `https://www.youtube.com/results?search_query=${artistTrackQuery}`;
    const spotifySearchUrl = `https://open.spotify.com/search/${artistTrackQuery}`;
    const tidalSearchUrl = `https://tidal.com/browse/search?q=${artistTrackQuery}`;

    const searchLinks = `
<div style="margin-top: 8px; font-size: 14px; font-family: monospace, monospace;">
  🔎 <a href="${ytSearchUrl}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">YouTube</a> | 
  🎧 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Spotify</a> | 
  🌊 <a href="${tidalSearchUrl}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Tidal</a>
</div>
`;

    const message = `
<div style="display: flex; gap: 16px; align-items: flex-start; max-width: 100%; font-family: monospace, monospace; color: #ddd;">
  ${cover ? `<div style="flex-shrink: 0;"><img src="${cover}" alt="Cover" style="max-width: 150px; border-radius: 8px;"></div>` : ''}
  <div style="flex-grow: 1; line-height: 1.4; font-size: 14px;">
    <div><strong>${escapeHtml(artist)} - ${title}</strong></div>
    <div>🎵 Album: ${title} &nbsp;&nbsp; 📅 Year: ${year}</div>
    <div>🌍 Country: ${country}</div>
    <div>🏷️ Label: ${label}</div>
    <div>🎶 Genre: ${escapeHtml(genres)}</div>
    <div>🔗 <a href="${discogsLink}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Discogs page</a></div>
    ${searchLinks}
  </div>
</div>
    `.trim();

    return message;

  } catch (e) {
    return `❗ Error fetching Discogs data: ${escapeHtml(e.message)}`;
  }
}
