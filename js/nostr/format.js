// FONY Nostr: event formats, validation and sanitising.
//
// Pure functions only (no DOM, no network, no storage), so everything here can be
// unit-tested in Node. Everything that arrives from a relay is untrusted: it is
// run through these helpers before it reaches the UI or the audio element.
// The event formats are documented in docs/nostr-events.md.

export const KIND_PROFILE = 0
export const KIND_CONTACTS = 3
export const KIND_LIST = 30001      // NIP-51 "generic list" (parameterized replaceable)
export const KIND_STATUS = 30315    // NIP-38 user status

export const FORMAT_VERSION = "1"
export const FONY_LIST_LABEL = "fony-radio"   // ["t", ...] marks a FONY station list
export const DEFAULT_LIST_ID = "fony-favorites" // default "d" tag of the user's shared Favorites
export const STATUS_D_TAG = "music"

export const LIMITS = Object.freeze({
  stations: 500,
  name: 120,
  title: 80,
  description: 500,
  genre: 60,
  url: 2000,
  listId: 64,
  track: 200
})

const HEX64 = /^[0-9a-f]{64}$/

export function isHexKey(s) {
  return typeof s === "string" && HEX64.test(s)
}

// Strip control / bidi-override characters and collapse whitespace. The result is
// only ever rendered with textContent, this is about keeping the data tidy.
export function cleanText(value, max = LIMITS.name) {
  if (typeof value !== "string") return ""
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") && h.includes(":") || h.startsWith("fd") && h.includes(":")) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
  }
  // bare single-label names ("intranet") and numeric / hex shorthand are not public hosts
  if (!h.includes(".") && !h.includes(":")) return true
  if (/^[0-9.]+$/.test(h) && !m) return true
  return false
}

// A radio stream must be an absolute http(s) URL on a public host without
// credentials. Returns the normalised URL, or null when it must be rejected.
export function validateStreamUrl(input) {
  if (typeof input !== "string") return null
  const raw = input.trim()
  if (!raw || raw.length > LIMITS.url) return null
  let u
  try { u = new URL(raw) } catch (_) { return null }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  if (u.username || u.password) return null
  if (!u.hostname || isPrivateHost(u.hostname)) return null
  u.hash = ""
  return u.toString()
}

// Optional web links (station homepage, avatars): https only.
export function validateHttpsUrl(input) {
  if (typeof input !== "string" || input.length > LIMITS.url) return null
  let u
  try { u = new URL(input.trim()) } catch (_) { return null }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname || isPrivateHost(u.hostname)) return null
  return u.toString()
}

// The player stores http streams behind the FONY proxy (".../stream?url=<encoded>").
// Unwrap that so the same station always has the same identity.
export function unwrapProxyUrl(url) {
  if (typeof url !== "string") return ""
  const m = url.match(/^https?:\/\/[^/]+\/stream\?url=([^&]+)$/)
  if (!m) return url
  try { return decodeURIComponent(m[1]) } catch (_) { return url }
}

// Identity of a station for de-duplication: scheme, "www.", default ports, the
// fragment and a trailing slash do not make a different station.
export function stationKey(url) {
  const plain = unwrapProxyUrl(url)
  let u
  try { u = new URL(plain) } catch (_) { return String(plain || "").trim().toLowerCase() }
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  const port = u.port && u.port !== "80" && u.port !== "443" ? ":" + u.port : ""
  const path = (u.pathname || "/").replace(/\/+$/, "")
  return host + port + path + u.search
}

// A normalised FONY station item: { url, name, genre, homepage }
export function normalizeStation(raw) {
  if (!raw || typeof raw !== "object") return null
  const url = validateStreamUrl(raw.url)
  if (!url) return null
  const name = cleanText(raw.name, LIMITS.name) || hostLabel(url)
  const genre = cleanText(raw.genre || "", LIMITS.genre)
  const homepage = raw.homepage ? validateHttpsUrl(raw.homepage) || "" : ""
  return { url, name, genre, homepage }
}

export function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch (_) { return "Radio station" }
}

export function dedupeStations(list) {
  const seen = new Set()
  const out = []
  for (const st of list || []) {
    if (!st || !st.url) continue
    const key = stationKey(st.url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(st)
  }
  return out
}

// ---- station list events (kind 30001) ----

export function cleanListId(id) {
  const v = typeof id === "string" ? id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") : ""
  return (v || DEFAULT_LIST_ID).slice(0, LIMITS.listId)
}

// ["station", <stream url>, <name>, <genre>, <homepage>] is the FONY item tag.
// A plain ["r", <stream url>] is added next to it so generic NIP-51 clients still see the links.
export function buildListTags({ id, title, description, stations }) {
  const items = dedupeStations((stations || []).map(normalizeStation).filter(Boolean)).slice(0, LIMITS.stations)
  const tags = [
    ["d", cleanListId(id)],
    ["title", cleanText(title, LIMITS.title) || "FONY Favorites"],
    ["t", FONY_LIST_LABEL],
    ["fony", FORMAT_VERSION],
    ["client", "FONY"]
  ]
  const desc = cleanText(description || "", LIMITS.description)
  if (desc) tags.push(["description", desc])
  for (const st of items) {
    tags.push(["station", st.url, st.name, st.genre, st.homepage])
    tags.push(["r", st.url])
  }
  return { tags, stations: items }
}

export function buildListEvent(opts) {
  const { tags, stations } = buildListTags(opts)
  const createdAt = Math.max(Math.floor(Date.now() / 1000), (opts.after || 0) + 1)
  return { event: { kind: KIND_LIST, created_at: createdAt, tags, content: "" }, stations }
}

export function firstTag(tags, name) {
  return Array.isArray(tags) ? tags.find(t => Array.isArray(t) && t[0] === name) : undefined
}

export function isFonyList(ev) {
  return !!ev && ev.kind === KIND_LIST && Array.isArray(ev.tags) &&
    ev.tags.some(t => Array.isArray(t) && t[0] === "t" && t[1] === FONY_LIST_LABEL)
}

// Turn a received kind-30001 event into a safe list object, or null when it is not a FONY list.
export function parseListEvent(ev) {
  if (!ev || typeof ev !== "object" || !isHexKey(ev.pubkey) || !isFonyList(ev)) return null
  const d = firstTag(ev.tags, "d")
  const id = cleanListId(d && typeof d[1] === "string" ? d[1] : DEFAULT_LIST_ID)
  const title = cleanText(firstTag(ev.tags, "title")?.[1] || "", LIMITS.title) || "Shared favorites"
  const description = cleanText(firstTag(ev.tags, "description")?.[1] || "", LIMITS.description)

  const items = []
  const rUrls = []
  for (const t of ev.tags) {
    if (!Array.isArray(t)) continue
    if (t[0] === "station") {
      const st = normalizeStation({ url: t[1], name: t[2], genre: t[3], homepage: t[4] })
      if (st) items.push(st)
    } else if (t[0] === "r") {
      rUrls.push(t[1])
    }
  }
  // lists from other clients: fall back to the plain "r" links
  if (!items.length) {
    for (const u of rUrls) {
      const st = normalizeStation({ url: u, name: "" })
      if (st) items.push(st)
    }
  }
  const stations = dedupeStations(items).slice(0, LIMITS.stations)
  return {
    pubkey: ev.pubkey,
    id,
    title,
    description,
    stations,
    createdAt: Number.isFinite(ev.created_at) ? ev.created_at : 0,
    eventId: ev.id,
    ref: `${KIND_LIST}:${ev.pubkey}:${id}`
  }
}

// Of several versions of one list (same pubkey + d) keep the newest.
export function latestPerList(parsed) {
  const map = new Map()
  for (const l of parsed) {
    if (!l) continue
    const cur = map.get(l.ref)
    if (!cur || l.createdAt > cur.createdAt || (l.createdAt === cur.createdAt && l.eventId < cur.eventId)) map.set(l.ref, l)
  }
  return [...map.values()]
}

// Fingerprint of a station set (order-insensitive), used to tell whether local
// Favorites differ from what was last published.
export function stationsFingerprint(stations) {
  const keys = (stations || []).map(s => stationKey(s.url)).sort()
  let h = 5381
  const str = keys.join("\n")
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return keys.length + ":" + h.toString(16)
}

// ---- importing into local Favorites ----

// Pure merge: decides what an import adds. `existing` is the local "favorites"
// array ({url, genre, addedAt}); `toPlayUrl` maps a stream URL to the URL the
// player stores (http streams go through the FONY proxy).
export function planImport(existing, incoming, toPlayUrl = u => u, now = Date.now()) {
  const known = new Set((existing || []).map(f => stationKey(f.url)))
  const additions = []
  const skipped = []
  let n = 0
  for (const st of dedupeStations(incoming || [])) {
    const key = stationKey(st.url)
    if (known.has(key)) { skipped.push(st); continue }
    known.add(key)
    additions.push({
      fav: { url: toPlayUrl(st.url), genre: st.genre || "World", addedAt: now + n++ },
      station: st
    })
  }
  return { additions, skipped }
}

// ---- NIP-38 status (kind 30315) ----

export const STATUS_TTL = 300 // seconds a "now listening" status stays valid

export function buildStatusEvent({ station, track, link, ttl = STATUS_TTL, now = Math.floor(Date.now() / 1000) }) {
  const st = normalizeStation(station)
  if (!st) return null
  const t = cleanText(track || "", LIMITS.track)
  const content = t ? `${t} — ${st.name}` : st.name
  const tags = [
    ["d", STATUS_D_TAG],
    ["expiration", String(now + ttl)],
    ["fony-station", st.url, st.name, st.genre]
  ]
  if (t) tags.push(["fony-track", t])
  if (link) tags.push(["r", link])
  return { kind: KIND_STATUS, created_at: now, tags, content: content.slice(0, 300) }
}

export function buildStatusClear(now = Math.floor(Date.now() / 1000)) {
  return {
    kind: KIND_STATUS,
    created_at: now,
    tags: [["d", STATUS_D_TAG], ["expiration", String(now + 60)]],
    content: ""
  }
}

// Returns { pubkey, content, station?, track, createdAt } for a live status, else null.
export function parseStatusEvent(ev, now = Math.floor(Date.now() / 1000)) {
  if (!ev || ev.kind !== KIND_STATUS || !isHexKey(ev.pubkey) || !Array.isArray(ev.tags)) return null
  const d = firstTag(ev.tags, "d")
  if (!d || d[1] !== STATUS_D_TAG) return null
  const exp = Number(firstTag(ev.tags, "expiration")?.[1])
  if (Number.isFinite(exp) && exp <= now) return null
  if (typeof ev.content !== "string" || !ev.content.trim()) return null
  const tag = firstTag(ev.tags, "fony-station")
  const station = tag ? normalizeStation({ url: tag[1], name: tag[2], genre: tag[3] }) : null
  return {
    pubkey: ev.pubkey,
    content: cleanText(ev.content, 300),
    station,
    track: cleanText(firstTag(ev.tags, "fony-track")?.[1] || "", LIMITS.track),
    createdAt: ev.created_at || 0
  }
}

// ---- profiles ----

export function parseProfile(ev) {
  if (!ev || ev.kind !== KIND_PROFILE || !isHexKey(ev.pubkey)) return null
  let o
  try { o = JSON.parse(ev.content) } catch (_) { return null }
  if (!o || typeof o !== "object") return null
  return {
    pubkey: ev.pubkey,
    name: cleanText(o.display_name || o.displayName || o.name || "", 60),
    username: cleanText(o.name || "", 60),
    about: cleanText(o.about || "", 300),
    picture: validateHttpsUrl(typeof o.picture === "string" ? o.picture : "") || "",
    nip05: cleanText(o.nip05 || "", 100),
    createdAt: ev.created_at || 0
  }
}

export function parseContacts(ev) {
  if (!ev || ev.kind !== KIND_CONTACTS || !Array.isArray(ev.tags)) return []
  const out = []
  const seen = new Set()
  for (const t of ev.tags) {
    if (Array.isArray(t) && t[0] === "p" && isHexKey(t[1]) && !seen.has(t[1])) {
      seen.add(t[1])
      out.push(t[1])
    }
  }
  return out
}

// ---- relay URLs ----

export function normalizeRelayUrl(input) {
  if (typeof input !== "string") return null
  let s = input.trim()
  if (!s) return null
  if (!/^[a-z]+:\/\//i.test(s)) s = "wss://" + s
  let u
  try { u = new URL(s) } catch (_) { return null }
  if (u.protocol !== "wss:") return null
  if (u.username || u.password || !u.hostname || isPrivateHost(u.hostname)) return null
  u.hash = ""
  u.search = ""
  return u.toString().replace(/\/$/, "")
}

export function shortKey(hex) {
  return isHexKey(hex) ? hex.slice(0, 8) + "…" + hex.slice(-4) : ""
}

// ---- links ----
// FONY deep links live in the URL hash, so they work on any static host:
//   /#nostr/<naddr|npub|nprofile|note>   open a list or a profile
//   /#nostr/tune?u=<stream>&n=<name>      play a station once
// The station travels as one opaque base64url blob (no ".mp3" or stream URL visible in the link), so
// clients like Primal do not mistake the link for an audio file and embed a dead player.
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

export function parseTuneHash(hash) {
  const m = String(hash || "").match(/^#?\/?(?:nostr\/)?tune\?(.*)$/)
  if (!m) return null
  const q = new URLSearchParams(m[1])
  const packed = q.get("s")
  if (packed) {
    try {
      const [url, name, genre] = JSON.parse(b64urlDecode(packed))
      return normalizeStation({ url, name, genre })
    } catch (_) { return null }
  }
  // older links: ?u=<stream>&n=<name>&g=<genre>
  return normalizeStation({ url: q.get("u"), name: q.get("n"), genre: q.get("g") })
}

export function buildTuneLink(origin, station) {
  const st = normalizeStation(station)
  if (!st) return ""
  return `${origin}/#nostr/tune?s=${b64urlEncode(JSON.stringify([st.url, st.name, st.genre]))}`
}

// Pull the bech32 / hex payload out of whatever the user pasted: a bare npub,
// "nostr:naddr1…", a FONY link, or a njump-style URL.
export function extractNostrToken(input) {
  const s = String(input || "").trim()
  if (!s) return ""
  const m = s.match(/(?:nostr:|\/#?nostr\/|\/)?((?:npub|nprofile|naddr|nevent|note)1[02-9ac-hj-np-z]{6,})/i)
  if (m) return m[1].toLowerCase()
  if (isHexKey(s.toLowerCase())) return s.toLowerCase()
  return ""
}

// ---- optional feed notes (kind 1) ----
// Both notes are opt-in and carry a FONY link. "t" tags make them findable (#fony).

export const KIND_NOTE = 1

export function buildShareNote({ title, count, link, naddr, ref, now = Math.floor(Date.now() / 1000) }) {
  const name = cleanText(title, LIMITS.title) || "my favorites"
  const lines = [`📻 I shared my favorite radio stations on FONY: ${name} (${count} ${count === 1 ? "station" : "stations"})`]
  if (naddr) lines.push("", `nostr:${naddr}`)
  if (link) lines.push("", link)
  lines.push("", "#fony #radio")
  const tags = [["t", "fony"], ["t", "radio"], ["client", "FONY"]]
  if (ref) tags.push(["a", ref])
  if (link) tags.push(["r", link])
  return { kind: KIND_NOTE, created_at: now, tags, content: lines.join("\n") }
}

export function buildListeningNote({ station, track, link, image, now = Math.floor(Date.now() / 1000) }) {
  const st = normalizeStation(station)
  if (!st) return null
  const t = cleanText(track || "", LIMITS.track)
  const lines = [`🎧 Listening to ${st.name}${t ? ` — ${t}` : ""} on FONY`]
  // album art: a plain https image URL on its own line, which feeds such as Primal show as a picture
  const art = image ? validateHttpsUrl(image) : null
  if (art) lines.push("", art)
  if (link) lines.push("", link)
  lines.push("", "#fony #nowplaying")
  const tags = [["t", "fony"], ["t", "nowplaying"], ["client", "FONY"]]
  if (art) tags.push(["imeta", `url ${art}`])
  if (link) tags.push(["r", link])
  return { kind: KIND_NOTE, created_at: now, tags, content: lines.join("\n") }
}
