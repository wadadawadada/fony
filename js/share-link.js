// Share links for stations: pure functions (no DOM), unit-tested in tests/share-link.test.mjs.
//
//   /#<genre>/<hash>                          a station of a built-in playlist (the recipient has it too)
//   /#<genre>/<hash>?s=<station>&p=<source>   a station of a custom playlist, carried with it:
//     s = base64url JSON [stream url, name, genre]   plays even if the playlist cannot be loaded
//     p = c:<folder>/<file>                          playlist from the community catalog (junguler)
//         u:<base64url url>                          any other playlist URL
// The recipient adds the playlist (p), finds the station by <hash> and plays it; if that fails the
// embedded station (s) is played on its own.

const CATALOG_RAW = "https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/%2Bmerged%2B/"

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4)
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad)
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

const safeDecode = (s) => { try { return decodeURIComponent(s) } catch { return s } }
const isHttpUrl = (u) => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u) && u.length <= 2000

// playlist URL -> short token
export function packPlaylistSource(fileUrl) {
  if (!isHttpUrl(fileUrl)) return ""
  if (fileUrl.startsWith(CATALOG_RAW)) {
    const path = safeDecode(fileUrl.slice(CATALOG_RAW.length)).replace(/\.m3u$/i, "")
    const parts = path.split("/")
    if (parts.length === 2 && parts.every(Boolean)) return "c:" + parts.map(encodeURIComponent).join("/")
  }
  return "u:" + b64urlEncode(fileUrl)
}

// token -> playlist URL ("" when it is not valid)
export function unpackPlaylistSource(token) {
  const t = String(token || "")
  if (t.startsWith("c:")) {
    const parts = t.slice(2).split("/").map(safeDecode)
    if (parts.length !== 2 || parts.some(p => !p || p === "." || p === ".." || /[\\/]/.test(p))) return ""
    const file = /\.m3u8?$/i.test(parts[1]) ? parts[1] : parts[1] + ".m3u"
    return CATALOG_RAW + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(file)
  }
  if (t.startsWith("u:")) {
    try {
      const url = b64urlDecode(t.slice(2))
      return isHttpUrl(url) ? url : ""
    } catch { return "" }
  }
  return ""
}

// station: { url, name, genre } (url = the original stream address)
export function buildStationLink({ base, genre, stationHash, station = null, playlistFile = "" }) {
  const query = []
  if (station && isHttpUrl(station.url)) {
    query.push("s=" + b64urlEncode(JSON.stringify([station.url, station.name || "", station.genre || genre || ""])))
  }
  const source = playlistFile ? packPlaylistSource(playlistFile) : ""
  if (source) query.push("p=" + source)
  return `${base}#${encodeURIComponent(genre)}/${stationHash}${query.length ? "?" + query.join("&") : ""}`
}

// "#bulgaria/a4eb38?s=…&p=…" -> { genre, stationHash, station, playlistUrl }, or null when the hash is
// not a station link (Nostr links, GitBook, empty).
export function parseStationHash(hash) {
  const m = String(hash || "").match(/^#?\/?([^/?#]+)\/([0-9a-f]{1,8})(?:\?(.*))?$/i)
  if (!m) return null
  const genre = safeDecode(m[1])
  if (/^nostr$/i.test(genre)) return null
  const params = {}
  for (const part of (m[3] || "").split("&")) {
    const i = part.indexOf("=")
    if (i > 0) params[part.slice(0, i)] = part.slice(i + 1)
  }
  let station = null
  if (params.s) {
    try {
      const [url, name, g] = JSON.parse(b64urlDecode(params.s))
      if (isHttpUrl(url)) station = { url, name: String(name || "").slice(0, 200), genre: String(g || "").slice(0, 80) }
    } catch {}
  }
  return {
    genre,
    stationHash: m[2].toLowerCase(),
    station,
    playlistUrl: params.p ? unpackPlaylistSource(safeDecode(params.p)) : ""
  }
}
