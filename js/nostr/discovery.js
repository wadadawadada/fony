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

// What is going on in FONY right now, from anyone (not only the people you follow), in one round trip:
//   lists   - the newest public station lists
//   live    - accounts that are listening to a station through FONY right now
//   people  - accounts that recently did something with FONY (shared a list, listen, posted), newest first
export async function fetchFonyActivity() {
  const now = Math.floor(Date.now() / 1000)
  const events = await query([
    { kinds: [F.KIND_LIST], "#t": [F.FONY_LIST_LABEL], limit: 100 },
    { kinds: [F.KIND_STATUS], "#d": [F.STATUS_D_TAG], since: now - F.STATUS_TTL * 2, limit: 300 },
    { kinds: [1], "#t": ["fony"], since: now - 7 * 86400, limit: 100 }
  ], { timeout: 8000, limitTotal: 800 })

  const lists = F.latestPerList(events.map(F.parseListEvent).filter(Boolean)).filter(l => l.stations.length).sort((a, b) => b.createdAt - a.createdAt)

  // one live status per account, only those that came from FONY (they carry a station)
  const liveBy = new Map()
  for (const ev of events) {
    if (ev.kind !== F.KIND_STATUS) continue
    const st = F.parseStatusEvent(ev, now)
    if (!st || !st.station) continue
    const cur = liveBy.get(st.pubkey)
    if (!cur || st.createdAt > cur.createdAt) liveBy.set(st.pubkey, st)
  }
  const live = [...liveBy.values()].sort((a, b) => b.createdAt - a.createdAt)

  // people: the newest FONY activity of each account
  const act = new Map()
  const see = (pubkey, at, what, extra = {}) => {
    const cur = act.get(pubkey)
    if (!cur || at > cur.at) act.set(pubkey, { pubkey, at, what, ...extra })
  }
  for (const l of lists) see(l.pubkey, l.createdAt, "list", { title: l.title })
  for (const ev of events) {
    if (ev.kind === 1 && F.isHexKey(ev.pubkey) && ev.tags.some(t => t[0] === "client" && String(t[1]).toLowerCase() === "fony")) see(ev.pubkey, ev.created_at, "note")
  }
  for (const s of live) see(s.pubkey, s.createdAt, "live", { station: s.station })
  const people = [...act.values()].sort((a, b) => b.at - a.at)
  return { lists, live, people }
}

// The stations being played right now, most listeners first. Returns [{ station, who: [pubkey] }].
export function liveStations(live) {
  const map = new Map()
  for (const s of live) {
    const key = F.stationKey(s.station.url)
    const cur = map.get(key)
    if (cur) { cur.who.push(s.pubkey); cur.at = Math.max(cur.at, s.createdAt) }
    else map.set(key, { station: s.station, who: [s.pubkey], at: s.createdAt })
  }
  return [...map.values()].sort((a, b) => b.who.length - a.who.length || b.at - a.at)
}

export async function discover(text = "") {
  if (text) {
    const lists = await fetchPublicLists({ limit: 150, search: text })
    return { lists, stations: popularStations(lists, { text }), live: [], people: [] }
  }
  const { lists, live, people } = await fetchFonyActivity()
  return { lists, stations: popularStations(lists, {}), live, people }
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
