// Bridge between FONY's local Favorites and Nostr station items.
//
// Local Favorites are never published or overwritten automatically: everything
// here runs only because the user pressed Share / Import.

import { secureUrl } from "../parsing.js"
import { normalizeStation, planImport, stationKey, unwrapProxyUrl, dedupeStations, cleanText, LIMITS } from "./format.js"

const FAV_KEY = "favorites"
const STORE_KEY = "nostrStations"   // stations the catalog does not know: { [playUrl]: item }
const STORE_MAX = 400

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback } catch (_) { return fallback }
}

// A Nostr station item -> the station object the player and the list renderer use.
export function toPlayerStation(item) {
  const st = normalizeStation(item)
  if (!st) return null
  return {
    title: st.name,
    bitrate: "",
    url: secureUrl(st.url),
    originalUrl: st.url,
    cover: null,
    genre: st.genre || "World",
    homepage: st.homepage,
    nostr: true
  }
}

// A player station (from Favorites) -> a Nostr station item, or null if it cannot be shared.
export function fromPlayerStation(station) {
  if (!station) return null
  return normalizeStation({
    url: unwrapProxyUrl(station.originalUrl || station.url),
    name: station.title,
    genre: station.favGenre || station.genre || "",
    homepage: station.homepage || ""
  })
}

// Current local Favorites as shareable items. `getStations` is provided by the
// player (it resolves favorite URLs to full station objects).
export async function getShareableFavorites(getStations) {
  const stations = (await getStations()) || []
  const items = dedupeStations(stations.map(fromPlayerStation).filter(Boolean))
  // how many favorites could not be turned into a shareable station (bad address)
  items.skipped = stations.filter(s => !fromPlayerStation(s)).length
  return items
}

// ---- stations that live outside the genre catalog ----

function readStore() {
  const s = readJson(STORE_KEY, {})
  return s && typeof s === "object" && !Array.isArray(s) ? s : {}
}

function writeStore(store) {
  const keys = Object.keys(store)
  if (keys.length > STORE_MAX) {
    // keep favorites first, then the newest remembered entries
    const favs = new Set(readJson(FAV_KEY, []).map(f => f.url))
    const drop = keys.filter(k => !favs.has(k)).sort((a, b) => (store[a].t || 0) - (store[b].t || 0)).slice(0, keys.length - STORE_MAX)
    drop.forEach(k => delete store[k])
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch (_) {}
}

// Remember stations so that hearting one while browsing Nostr lists works: the
// Favorites view looks stations up in the genre catalog first, then here.
export function rememberStations(items) {
  const store = readStore()
  const now = Date.now()
  for (const item of items || []) {
    const st = toPlayerStation(item)
    if (st) store[st.url] = { url: st.originalUrl, name: st.title, genre: st.genre, homepage: st.homepage, t: now }
  }
  writeStore(store)
}

// Stations saved from Nostr, as player station objects keyed by their play URL.
export function getRememberedStations() {
  const out = new Map()
  const store = readStore()
  for (const key of Object.keys(store)) {
    const e = store[key]
    const st = toPlayerStation({ url: e && e.url, name: e && e.name, genre: e && e.genre, homepage: e && e.homepage })
    if (st) out.set(key, st)
  }
  return out
}

// ---- import ----

// Adds stations to the local Favorites without duplicates. Returns { added, skipped, total }.
export function importStations(items) {
  const clean = dedupeStations((items || []).map(normalizeStation).filter(Boolean)).slice(0, LIMITS.stations)
  const existing = readJson(FAV_KEY, [])
  const plan = planImport(Array.isArray(existing) ? existing : [], clean, secureUrl)
  if (plan.additions.length) {
    const next = (Array.isArray(existing) ? existing : []).concat(plan.additions.map(a => a.fav))
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)) } catch (_) {
      throw new Error("Could not save to Favorites (browser storage is full or blocked)")
    }
    rememberStations(plan.additions.map(a => a.station))
  }
  return { added: plan.additions.length, skipped: plan.skipped.length, total: clean.length }
}

export function genreLabel(g) {
  return cleanText(g || "", LIMITS.genre) || "World"
}

export { stationKey }
