const FONY_BACKEND_URL = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app";

function sanitizeQuery(str) {
  return str
    .replace(/["вЂњвЂќвЂвЂ™']/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  if (!query) return "вљ пёЏ Artist or track name is required.";

  try {
    const response = await fetch(`${FONY_BACKEND_URL}/api/discogs/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      if (response.status === 404) {
        return `вљ пёЏ No results found on Discogs for "${escapeHtml(query)}"`;
      }
      return `вќ— Discogs API error: ${response.status}`;
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
    discogsLink = (discogsLink || "#").replace(/\s*[вЂ“вЂ”]\s*/g, "-");

    const artistTrackQuery = encodeURIComponent(`${artist} ${track}`);
    const ytSearchUrl = `https://www.youtube.com/results?search_query=${artistTrackQuery}`;
    const spotifySearchUrl = `https://open.spotify.com/search/${artistTrackQuery}`;
    const tidalSearchUrl = `https://tidal.com/browse/search?q=${artistTrackQuery}`;

    const searchLinks = `
<div style="margin-top: 8px; font-size: 14px; font-family: monospace, monospace;">
  рџ”Ћ <a href="${ytSearchUrl}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">YouTube</a> | 
  рџЋ§ <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Spotify</a> | 
  рџЊЉ <a href="${tidalSearchUrl}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Tidal</a>
</div>
`;

    const message = `
<div style="display: flex; gap: 16px; align-items: flex-start; max-width: 100%; font-family: monospace, monospace; color: #ddd;">
  ${cover ? `<div style="flex-shrink: 0;"><img src="${cover}" alt="Cover" style="max-width: 150px; border-radius: 8px;"></div>` : ""}
  <div style="flex-grow: 1; line-height: 1.4; font-size: 14px;">
    <div><strong>${escapeHtml(artist)} - ${title}</strong></div>
    <div>рџЋµ Album: ${title} &nbsp;&nbsp; рџ“… Year: ${year}</div>
    <div>рџЊЌ Country: ${country}</div>
    <div>рџЏ·пёЏ Label: ${label}</div>
    <div>рџЋ¶ Genre: ${escapeHtml(genres)}</div>
    <div>рџ”— <a href="${discogsLink}" target="_blank" rel="noopener noreferrer" style="color: #00F2B8; text-decoration: underline;">Discogs page</a></div>
    ${searchLinks}
  </div>
</div>
    `.trim();

    return message;
  } catch (e) {
    return `вќ— Error fetching Discogs data: ${escapeHtml(e.message)}`;
  }
}
