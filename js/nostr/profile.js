// Profiles (kind 0) and follow lists (kind 3), with a small localStorage cache.

import { query, publish } from "./client.js"
import { signEvent, getSession } from "./auth.js"
import { KIND_PROFILE, KIND_CONTACTS, parseProfile, parseContacts, isHexKey } from "./format.js"

const PROFILE_KEY = "fonyNostrProfiles"
const FOLLOWS_KEY = "fonyNostrFollows"
const PROFILE_TTL = 60 * 60 * 1000
const FOLLOWS_TTL = 10 * 60 * 1000
const MAX_CACHED = 300

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback } catch (_) { return fallback }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {}
}

let profileCache = null
function cache() {
  if (!profileCache) profileCache = readJson(PROFILE_KEY, {})
  return profileCache
}
function saveCache() {
  const c = cache()
  const keys = Object.keys(c)
  if (keys.length > MAX_CACHED) {
    keys.sort((a, b) => (c[a].t || 0) - (c[b].t || 0)).slice(0, keys.length - MAX_CACHED).forEach(k => delete c[k])
  }
  writeJson(PROFILE_KEY, c)
}

// Resolves a Map pubkey -> profile for every key that has one. Cached entries
// are returned immediately; only missing / stale ones go to the relays.
export async function getProfiles(pubkeys, { force = false } = {}) {
  const c = cache()
  const out = new Map()
  const need = []
  const now = Date.now()
  for (const pk of [...new Set(pubkeys || [])]) {
    if (!isHexKey(pk)) continue
    const hit = c[pk]
    if (hit && hit.p) out.set(pk, hit.p)
    if (force || !hit || now - (hit.t || 0) > PROFILE_TTL) need.push(pk)
  }
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100)
    const events = await query({ kinds: [KIND_PROFILE], authors: chunk, limit: chunk.length * 2 }, { timeout: 5000 })
    const best = new Map()
    for (const ev of events) {
      const p = parseProfile(ev)
      if (p && (!best.has(p.pubkey) || best.get(p.pubkey).createdAt < p.createdAt)) best.set(p.pubkey, p)
    }
    for (const pk of chunk) {
      const p = best.get(pk)
      if (p) { c[pk] = { p, t: now }; out.set(pk, p) }
      else if (!c[pk]) c[pk] = { p: null, t: now - PROFILE_TTL + 5 * 60 * 1000 } // retry in 5 minutes
    }
  }
  if (need.length) saveCache()
  return out
}

export async function getProfile(pubkey, opts) {
  const m = await getProfiles([pubkey], opts)
  return m.get(pubkey) || null
}

export function displayName(profile, pubkey) {
  if (profile && profile.name) return profile.name
  return pubkey ? pubkey.slice(0, 8) + "…" : "Nostr user"
}

// Accounts the user follows (kind 3). Returns an array of pubkeys.
export async function getFollows(pubkey, { force = false } = {}) {
  if (!isHexKey(pubkey)) return []
  const all = readJson(FOLLOWS_KEY, {})
  const hit = all[pubkey]
  if (!force && hit && Date.now() - hit.t < FOLLOWS_TTL) return hit.list
  const events = await query({ kinds: [KIND_CONTACTS], authors: [pubkey], limit: 5 }, { timeout: 6000 })
  let latest = null
  for (const ev of events) if (!latest || ev.created_at > latest.created_at) latest = ev
  if (!latest) return hit ? hit.list : []
  const list = parseContacts(latest).slice(0, 2000)
  all[pubkey] = { list, t: Date.now() }
  writeJson(FOLLOWS_KEY, all)
  return list
}

// ---- following someone on Nostr itself (the account's real follow list, kind 3) ----
//
// A follow list is ONE replaceable event. Publishing a new one replaces the old, so it must be built from
// the newest existing event with every tag kept as it is (relay hints, petnames, other tags). If the current
// list cannot be read from the relays, nothing is published: a guess could wipe out the user's follows.

async function newestContactEvent(pubkey) {
  const events = await query({ kinds: [KIND_CONTACTS], authors: [pubkey], limit: 10 }, { timeout: 9000 })
  let latest = null
  for (const ev of events) if (ev.pubkey === pubkey && (!latest || ev.created_at > latest.created_at)) latest = ev
  return latest
}

async function changeFollow(target, add) {
  const session = getSession()
  if (!session) throw new Error("Sign in to Nostr first")
  if (!isHexKey(target) || target === session.pubkey) throw new Error("That account cannot be followed")
  const current = await newestContactEvent(session.pubkey)
  const all = readJson(FOLLOWS_KEY, {})
  const known = all[session.pubkey] && all[session.pubkey].list ? all[session.pubkey].list : []
  if (!current && known.length) {
    throw new Error("Could not read your current follow list from the relays, so it was left unchanged. Try again in a moment.")
  }
  let tags = current ? current.tags.map(t => t.slice()) : []
  const has = tags.some(t => t[0] === "p" && t[1] === target)
  if (add === has) return { changed: false, following: add }
  tags = add ? [...tags, ["p", target]] : tags.filter(t => !(t[0] === "p" && t[1] === target))
  const signed = await signEvent({
    kind: KIND_CONTACTS,
    created_at: Math.max(Math.floor(Date.now() / 1000), current ? current.created_at + 1 : 0),
    tags,
    content: current ? current.content : ""
  })
  await publish(signed)
  all[session.pubkey] = { list: parseContacts(signed), t: Date.now() }
  writeJson(FOLLOWS_KEY, all)
  return { changed: true, following: add }
}

export const followAccount = (target) => changeFollow(target, true)
export const unfollowAccount = (target) => changeFollow(target, false)

export function clearProfileCache() {
  profileCache = {}
  try { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(FOLLOWS_KEY) } catch (_) {}
}
