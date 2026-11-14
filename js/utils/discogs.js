const FONY_BACKEND_URL = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app";

function sanitizeQuery(str) {
  return str
    .replace(/["\u201C\u201D\u2018\u2019']/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Radio titles are often "Now: A - B Next: C", "A feat. B", "A [Remix]"…: a second, plainer query
// finds the release when the first one does not.
function plainQuery(str) {
  return sanitizeQuery(
    String(str)
      .replace(/^\s*now\s*[:\-]\s*/i, "")
      .replace(/\s+next\s*[:\-].*$/i, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.*$/i, "")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\.{2,}|\u2026/g, " ")
  )
}

async function searchDiscogs(query) {
  return fetch(`${FONY_BACKEND_URL}/api/discogs/search?q=${encodeURIComponent(query)}`)
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, function(m) {
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
  });
}

export async function fetchDiscogsTrackInfo(artist, track) {
  const rawQuery = `${artist} ${track}`.trim();
  const query = sanitizeQuery(rawQuery);
  if (!query) return "\u26A0\uFE0F Artist or track name is required.";

  try {
    let response = await searchDiscogs(query);
    if (response.status === 404) {
      const retry = plainQuery(rawQuery);
      if (retry && retry !== query) response = await searchDiscogs(retry);
    }
    if (!response.ok) {
      if (response.status === 404) {
        return `\u26A0\uFE0F No results found on Discogs for "${escapeHtml(query)}"`;
      }
      return `\u274D Discogs API error: ${response.status}`;
    }

    const releaseData = await response.json();
    const title = escapeHtml(releaseData.title);
    const year = releaseData.year || "Unknown year";
    const country = releaseData.country || "Unknown country";
    const genres = releaseData.genres ? releaseData.genres.join(", ") : "Unknown genre";
    const label = (releaseData.labels && releaseData.labels.length > 0) ? escapeHtml(releaseData.labels[0].name) : "Unknown label";
    const cover = releaseData.images && releaseData.images.length > 0 ? releaseData.images[0].uri : null;

    let discogsLink = releaseData.uri || releaseData.resource_url;
    if (!discogsLink && releaseData.id) {
      discogsLink = `https://www.discogs.com/release/${releaseData.id}`;
    }
    discogsLink = (discogsLink || "#").replace(/\s*[\u2013\u2014]\s*/g, "-");

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
  ${cover ? `<div style="flex-shrink: 0;"><img src="${cover}" alt="Cover" style="max-width: 150px; border-radius: 8px;"></div>` : ""}
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
    return `\u274D Error fetching Discogs data: ${escapeHtml(e.message)}`;
  }
}
