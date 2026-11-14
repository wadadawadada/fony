// Shared station lists (NIP-51 kind 30001): publish, fetch, follow, link.
//
// A list is a parameterized replaceable event: pubkey + kind + "d" tag identify
// it, so publishing again with the same "d" replaces the previous version. The
// user's Favorites are published only on an explicit Share / Update action.

import { query, publish, getRelays } from "./client.js"
import { loadTools } from "./lib.js"
import { signEvent, getSession } from "./auth.js"
import * as F from "./format.js"

const SHARED_KEY = "fonyNostrShared"          // what this user published: { [pubkey]: { [id]: meta } }
const FOLLOW_KEY = "fonyNostrFollowedLists"   // lists the user follows
const CACHE_KEY = "fonyNostrListCache"        // recently opened lists, for offline / fast start
const CACHE_MAX = 40

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback } catch (_) { return fallback }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {}
}

// ---- cache ----

export function cacheList(list) {
  if (!list) return
  const cache = readJson(CACHE_KEY, {})
  cache[list.ref] = { ...list, t: Date.now() }
  const keys = Object.keys(cache)
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0)).slice(0, keys.length - CACHE_MAX).forEach(k => delete cache[k])
  }
  writeJson(CACHE_KEY, cache)
}

// Cached copies are re-validated: storage is as untrusted as the network.
export function getCachedList(ref) {
  const c = readJson(CACHE_KEY, {})[ref]
  if (!c || !F.isHexKey(c.pubkey)) return null
  const stations = F.dedupeStations((c.stations || []).map(F.normalizeStation).filter(Boolean))
  return {
    pubkey: c.pubkey,
    id: F.cleanListId(c.id),
    title: F.cleanText(c.title, F.LIMITS.title) || "Shared favorites",
    description: F.cleanText(c.description, F.LIMITS.description),
    stations,
    createdAt: Number(c.createdAt) || 0,
    eventId: c.eventId,
    ref: ref,
    cached: true
  }
}

// ---- fetching ----

function parseAll(events) {
  return F.latestPerList(events.map(F.parseListEvent).filter(Boolean))
}

export async function fetchList(pubkey, id, relays, timeout = 7000) {
  const events = await query(
    { kinds: [F.KIND_LIST], authors: [pubkey], "#d": [F.cleanListId(id)], limit: 5 },
    { relays, timeout }
  )
  const list = parseAll(events).find(l => l.pubkey === pubkey && l.id === F.cleanListId(id)) || null
  if (list) cacheList(list)
  return list
}

export async function fetchListsByAuthors(authors, { limit = 100 } = {}) {
  const keys = (authors || []).filter(F.isHexKey)
  if (!keys.length) return []
  const filters = []
  for (let i = 0; i < keys.length; i += 200) {
    filters.push({ kinds: [F.KIND_LIST], authors: keys.slice(i, i + 200), "#t": [F.FONY_LIST_LABEL], limit })
  }
  const events = await query(filters, { timeout: 8000 })
  return parseAll(events).sort((a, b) => b.createdAt - a.createdAt)
}

// Newest public FONY lists; with `search`, relays that support NIP-50 filter
// server-side and the result is filtered again here for the ones that do not.
export async function fetchPublicLists({ limit = 80, search = "" } = {}) {
  const base = { kinds: [F.KIND_LIST], "#t": [F.FONY_LIST_LABEL], limit }
  const filters = search ? [{ ...base, search }, base] : [base]
  const events = await query(filters, { timeout: 8000 })
  let lists = parseAll(events).filter(l => l.stations.length)
  if (search) lists = lists.filter(l => listMatches(l, search))
  return lists.sort((a, b) => b.createdAt - a.createdAt)
}

export function listMatches(list, text) {
  const terms = String(text || "").toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = (list.title + " " + list.description + " " + list.stations.map(s => s.name + " " + s.genre).join(" ")).toLowerCase()
  return terms.every(t => hay.includes(t))
}

// ---- publishing the user's own list ----

export function getPublishedMeta(pubkey, id = F.DEFAULT_LIST_ID) {
  const all = readJson(SHARED_KEY, {})
  return (all[pubkey] && all[pubkey][F.cleanListId(id)]) || null
}

function setPublishedMeta(pubkey, id, meta) {
  const all = readJson(SHARED_KEY, {})
  if (!all[pubkey]) all[pubkey] = {}
  if (meta) all[pubkey][F.cleanListId(id)] = meta
  else delete all[pubkey][F.cleanListId(id)]
  writeJson(SHARED_KEY, all)
}

// Compare local Favorites with the last published version. Nothing is ever sent from here.
export function syncState(pubkey, localStations, id = F.DEFAULT_LIST_ID) {
  const meta = pubkey ? getPublishedMeta(pubkey, id) : null
  if (!meta) return { published: false, inSync: false, meta: null }
  return { published: true, inSync: meta.fingerprint === F.stationsFingerprint(localStations), meta }
}

// Publish (first time) or update (later) the shared Favorites. Only called from a button.
export async function shareFavorites({ stations, title, description, id = F.DEFAULT_LIST_ID, onStep = () => {}, alsoPost = false }) {
  const session = getSession()
  if (!session) throw new Error("Connect a Nostr account first")
  const cleanId = F.cleanListId(id)
  const items = F.dedupeStations((stations || []).map(F.normalizeStation).filter(Boolean))
  if (!items.length) throw new Error("There are no favorite stations to share yet")

  // created_at must be newer than the version being replaced, otherwise relays keep the old one
  const meta = getPublishedMeta(session.pubkey, cleanId)
  let remote = null
  onStep("relays")
  try { remote = await fetchList(session.pubkey, cleanId, undefined, 4000) } catch (_) {}
  const after = Math.max(meta ? meta.createdAt : 0, remote ? remote.createdAt : 0)

  const { event, stations: published } = F.buildListEvent({ id: cleanId, title, description, stations: items, after })
  onStep("sign")
  const signed = await signEvent(event)
  onStep("publish")
  const result = await publish(signed)

  const list = F.parseListEvent(signed)
  setPublishedMeta(session.pubkey, cleanId, {
    eventId: signed.id,
    createdAt: signed.created_at,
    fingerprint: F.stationsFingerprint(published),
    count: published.length,
    title: list.title,
    description: list.description,
    noteIds: (meta && meta.noteIds) || []   // feed notes announcing this list, withdrawn with it on Unshare
  })
  cacheList(list)

  // optional: announce it in the feed (only when the user ticked the box)
  let note = null
  if (alsoPost) {
    try {
      onStep("note")
      const naddr = await listNaddr(list)
      const link = `${location.origin}/#nostr/${naddr}`
      const tpl = F.buildShareNote({ title: list.title, count: published.length, link, naddr, ref: list.ref })
      const signedNote = await signEvent(tpl)
      await publish(signedNote)
      note = { ok: true, id: signedNote.id }
      const m = getPublishedMeta(session.pubkey, cleanId)
      if (m) setPublishedMeta(session.pubkey, cleanId, { ...m, noteIds: [...(m.noteIds || []), signedNote.id].slice(-10) })
    } catch (err) {
      note = { ok: false, error: String(err && err.message || err) }
    }
  }
  return { list, relays: result, updated: !!(meta || remote), note }
}

// NIP-09 deletion request for the shared list.
export async function unshareFavorites(id = F.DEFAULT_LIST_ID) {
  const session = getSession()
  if (!session) throw new Error("Connect a Nostr account first")
  const cleanId = F.cleanListId(id)
  const ref = `${F.KIND_LIST}:${session.pubkey}:${cleanId}`
  const meta = getPublishedMeta(session.pubkey, cleanId)
  const noteIds = ((meta && meta.noteIds) || []).filter(F.isHexKey)
  const signed = await signEvent({
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    // the list itself, and any feed note that announced it
    tags: [["a", ref], ["k", String(F.KIND_LIST)], ...noteIds.map(i => ["e", i]), ...(noteIds.length ? [["k", "1"]] : [])],
    content: "Unshared from FONY"
  })
  const result = await publish(signed)
  setPublishedMeta(session.pubkey, cleanId, null)
  return result
}

// ---- following a list ----

export function getFollowedLists() {
  const raw = readJson(FOLLOW_KEY, [])
  return (Array.isArray(raw) ? raw : []).filter(f => f && F.isHexKey(f.pubkey) && typeof f.id === "string").map(f => ({
    ref: `${F.KIND_LIST}:${f.pubkey}:${F.cleanListId(f.id)}`,
    pubkey: f.pubkey,
    id: F.cleanListId(f.id),
    title: F.cleanText(f.title, F.LIMITS.title) || "Shared favorites",
    count: Number(f.count) || 0,
    seenAt: Number(f.seenAt) || 0,      // version the user has looked at
    latestAt: Number(f.latestAt) || 0   // newest version known
  }))
}

function saveFollowed(list) {
  writeJson(FOLLOW_KEY, list.map(({ pubkey, id, title, count, seenAt, latestAt }) => ({ pubkey, id, title, count, seenAt, latestAt })))
}

export function isFollowing(ref) {
  return getFollowedLists().some(f => f.ref === ref)
}

export function followList(list) {
  const all = getFollowedLists()
  if (all.some(f => f.ref === list.ref)) return all
  all.push({ ref: list.ref, pubkey: list.pubkey, id: list.id, title: list.title, count: list.stations.length, seenAt: list.createdAt, latestAt: list.createdAt })
  saveFollowed(all)
  cacheList(list)
  return all
}

export function unfollowList(ref) {
  const all = getFollowedLists().filter(f => f.ref !== ref)
  saveFollowed(all)
  return all
}

// The user has opened the current version of a followed list.
export function markSeen(list) {
  const all = getFollowedLists()
  const f = all.find(x => x.ref === list.ref)
  if (!f) return
  f.seenAt = Math.max(f.seenAt, list.createdAt)
  f.latestAt = Math.max(f.latestAt, list.createdAt)
  f.title = list.title
  f.count = list.stations.length
  saveFollowed(all)
  cacheList(list)
}

export function hasUpdate(f) {
  return f.latestAt > f.seenAt
}

// Ask the relays whether followed lists have a newer version. Returns the updated follow entries.
export async function refreshFollowedLists() {
  const all = getFollowedLists()
  if (!all.length) return all
  const authors = [...new Set(all.map(f => f.pubkey))]
  const ids = [...new Set(all.map(f => f.id))]
  const events = await query({ kinds: [F.KIND_LIST], authors, "#d": ids, limit: 200 }, { timeout: 8000 })
  const latest = new Map(parseAll(events).map(l => [l.ref, l]))
  let changed = false
  for (const f of all) {
    const l = latest.get(f.ref)
    if (l && l.createdAt > f.latestAt) {
      f.latestAt = l.createdAt
      f.title = l.title
      f.count = l.stations.length
      cacheList(l)
      changed = true
    }
  }
  if (changed) saveFollowed(all)
  return all
}

// ---- links ----

export async function listNaddr(list) {
  const { nip19 } = await loadTools()
  return nip19.naddrEncode({
    kind: F.KIND_LIST,
    pubkey: list.pubkey,
    identifier: list.id,
    relays: getRelays().slice(0, 2)
  })
}

export async function listLink(list) {
  return `${location.origin}/#nostr/${await listNaddr(list)}`
}

export async function npubOf(pubkey) {
  const { nip19 } = await loadTools()
  return nip19.npubEncode(pubkey)
}
