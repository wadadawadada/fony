// Finding things: pasted Nostr links / npubs, public lists, popular stations, and
// what the accounts you follow are listening to right now.

import { query } from "./client.js"
import { loadTools } from "./lib.js"
import { fetchPublicLists, fetchList } from "./playlists.js"
import * as F from "./format.js"

// Understands what the user typed or pasted into the search box:
//   npub… / nprofile… / hex     -> { type: "profile", pubkey }
//   naddr… (a FONY list)         -> { type: "list", pubkey, id, relays }
//   FONY tune link               -> { type: "tune", station }
//   anything else                -> { type: "text", text }
export async function parseInput(raw) {
  const text = String(raw || "").trim()
  if (!text) return { type: "empty" }

  const tune = F.parseTuneHash(text.includes("#") ? text.slice(text.indexOf("#")) : text)
  if (tune) return { type: "tune", station: tune }

  const token = F.extractNostrToken(text)
  if (token) {
    if (F.isHexKey(token)) return { type: "profile", pubkey: token }
    try {
      const { nip19 } = await loadTools()
      const d = nip19.decode(token)
      if (d.type === "npub") return { type: "profile", pubkey: d.data }
      if (d.type === "nprofile") return { type: "profile", pubkey: d.data.pubkey, relays: d.data.relays || [] }
      if (d.type === "naddr") {
        if (d.data.kind !== F.KIND_LIST) return { type: "invalid", message: "That link is not a FONY station list" }
        return { type: "list", pubkey: d.data.pubkey, id: d.data.identifier, relays: (d.data.relays || []).slice(0, 4) }
      }
      return { type: "invalid", message: "That Nostr link is not a profile or a station list" }
    } catch (_) {
      return { type: "invalid", message: "That does not look like a valid Nostr link" }
    }
  }
  return { type: "text", text }
}

export async function openList(ref) {
  return fetchList(ref.pubkey, ref.id, (ref.relays || []).map(F.normalizeRelayUrl).filter(Boolean))
}

// Stations that appear in public lists, ranked by how many lists feature them.
export function popularStations(lists, { text = "", limit = 60 } = {}) {
  const map = new Map()
  const terms = String(text || "").toLowerCase().split(/\s+/).filter(Boolean)
  for (const list of lists) {
    for (const st of list.stations) {
      if (terms.length) {
        const hay = (st.name + " " + st.genre).toLowerCase()
        if (!terms.every(t => hay.includes(t))) continue
      }
      const key = F.stationKey(st.url)
      const cur = map.get(key)
      if (cur) cur.count++
      else map.set(key, { station: st, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.station.name.localeCompare(b.station.name)).slice(0, limit)
}

export async function discover(text = "") {
  const lists = await fetchPublicLists({ limit: text ? 150 : 80, search: text })
  return { lists, stations: popularStations(lists, { text }) }
}

// Live "now listening" statuses from followed accounts (FONY statuses first).
// Returns [{ pubkey, content, station, track, createdAt }], newest first, one per account.
export async function fetchFollowingListening(follows, { maxAuthors = 400 } = {}) {
  const authors = (follows || []).filter(F.isHexKey).slice(0, maxAuthors)
  if (!authors.length) return []
  const now = Math.floor(Date.now() / 1000)
  const filters = []
  for (let i = 0; i < authors.length; i += 150) {
    filters.push({
      kinds: [F.KIND_STATUS],
      authors: authors.slice(i, i + 150),
      "#d": [F.STATUS_D_TAG],
      since: now - F.STATUS_TTL * 3,
      limit: 300
    })
  }
  const events = await query(filters, { timeout: 7000 })
  const latest = new Map()
  for (const ev of events) {
    const cur = latest.get(ev.pubkey)
    if (!cur || ev.created_at > cur.created_at) latest.set(ev.pubkey, ev)
  }
  return [...latest.values()]
    .map(ev => F.parseStatusEvent(ev, now))
    .filter(Boolean)
    .sort((a, b) => (b.station ? 1 : 0) - (a.station ? 1 : 0) || b.createdAt - a.createdAt)
}
