// Backup / restore of FONY's local data through Nostr.
//
// The backup is stored as one NIP-78 "application-specific data" event
// (kind 30078, d = "fony-backup"), so each new backup replaces the last one.
// It is private: the data is compressed and encrypted with a random AES-GCM key,
// and that key is wrapped with the user's own signer (NIP-44, NIP-04 as a
// fallback). Only the account owner's signer can unwrap it. The user's private
// key is never involved.

import { query, publish } from "./client.js"
import { signEvent, getSession, encryptToSelf, decryptFromSelf } from "./auth.js"
import { isHexKey } from "./format.js"

export const BACKUP_KIND = 30078
export const BACKUP_D = "fony-backup"
const MAX_KEY_BYTES = 400 * 1024       // one entry bigger than this is left out (stays in the file backup)
const CHUNK_CHARS = 60 * 1024          // each relay event carries at most this much (relays often cap events at 64-128 KB)
const MAX_CHUNKS = 8

// Never part of a backup: sign-in material and re-creatable caches.
const EXCLUDED = /^(fonyNostrSession|fonyNostrProfiles|fonyNostrFollows|fonyNostrListCache)$/

export function backupEntries() {
  const data = {}
  const skipped = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (EXCLUDED.test(k)) continue
    const v = localStorage.getItem(k)
    if (v == null) continue
    if (v.length > MAX_KEY_BYTES) { skipped.push(k); continue }
    data[k] = v
  }
  return { data, skipped }
}

// ---- small helpers ----

const b64 = (bytes) => { let s = ""; bytes.forEach(b => { s += String.fromCharCode(b) }); return btoa(s) }
const unb64 = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0))

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}
const gzip = (bytes) => pipe(bytes, new CompressionStream("gzip"))
const gunzip = (bytes) => pipe(bytes, new DecompressionStream("gzip"))

export function backupSupported() {
  return typeof CompressionStream === "function" && !!(globalThis.crypto && crypto.subtle)
}

// ---- backup ----

export async function backupToNostr(onStep = () => {}) {
  if (!backupSupported()) throw new Error("This browser cannot create encrypted backups")
  const session = getSession()
  if (!session) throw new Error("Connect a Nostr account first")
  onStep("encrypt")
  const { data, skipped } = backupEntries()
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, app: "FONY", at: Date.now(), data }))
  const packed = await gzip(plain)

  const key = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, packed))
  const wrapped = await encryptToSelf(b64(key))

  // big backups (skins, long playlists) are split over several events: d = fony-backup, fony-backup-1, …
  const ctB64 = b64(ct)
  const parts = []
  for (let i = 0; i < ctB64.length; i += CHUNK_CHARS) parts.push(ctB64.slice(i, i + CHUNK_CHARS))
  if (parts.length > MAX_CHUNKS) throw new Error("Your data is too large for a relay backup. Use the file Backup instead.")
  const bid = b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[^A-Za-z0-9]/g, "x")
  const now = Math.floor(Date.now() / 1000)

  let relays = 0
  for (let i = 0; i < parts.length; i++) {
    const content = i === 0
      ? JSON.stringify({ v: 2, scheme: wrapped.scheme, key: wrapped.data, iv: b64(iv), n: parts.length, part: parts[0] })
      : JSON.stringify({ v: 2, part: parts[i] })
    onStep("sign", i + 1, parts.length)
    const signed = await signEvent({
      kind: BACKUP_KIND,
      created_at: now + i,      // replaceable events need a newer created_at than the version they replace
      tags: [["d", i === 0 ? BACKUP_D : `${BACKUP_D}-${i}`], ["bid", bid], ["client", "FONY"], ["encryption", wrapped.scheme]],
      content
    })
    onStep("publish", i + 1, parts.length)
    const result = await publish(signed)
    relays = relays ? Math.min(relays, result.ok.length) : result.ok.length
  }
  return { relays, entries: Object.keys(data).length, skipped, bytes: ctB64.length, parts: parts.length, createdAt: now }
}

// ---- restore ----

export async function findNostrBackup() {
  const session = getSession()
  if (!session) throw new Error("Connect a Nostr account first")
  const ds = [BACKUP_D, ...Array.from({ length: MAX_CHUNKS - 1 }, (_, i) => `${BACKUP_D}-${i + 1}`)]
  const events = await query({ kinds: [BACKUP_KIND], authors: [session.pubkey], "#d": ds, limit: 40 }, { timeout: 8000 })
  const mine = events.filter(e => e.pubkey === session.pubkey)
  const dOf = (e) => (e.tags.find(t => t[0] === "d") || [])[1]
  const bidOf = (e) => (e.tags.find(t => t[0] === "bid") || [])[1] || ""
  let head = null
  for (const e of mine) if (dOf(e) === BACKUP_D && (!head || e.created_at > head.created_at)) head = e
  if (!head) return null
  // version 1 backups are a single event
  if (!bidOf(head)) return { head, parts: [head] }
  const bid = bidOf(head)
  let n = 1
  try { n = JSON.parse(head.content).n || 1 } catch (_) {}
  const parts = [head]
  for (let i = 1; i < n; i++) {
    const p = mine.find(e => dOf(e) === `${BACKUP_D}-${i}` && bidOf(e) === bid)
    if (!p) throw new Error("The backup on your relays is incomplete (a part is missing). Back up again.")
    parts.push(p)
  }
  return { head, parts }
}

// Decrypts a backup into { entries, at }. Throws on anything unexpected.
export async function openNostrBackup(found) {
  const ev = found.head
  let box
  try { box = JSON.parse(ev.content) } catch (_) { throw new Error("The backup on your relays is damaged") }
  if (!box || (box.v !== 1 && box.v !== 2) || typeof box.key !== "string" || typeof box.iv !== "string") {
    throw new Error("This backup was made by an unknown version")
  }
  let ctText = box.ct
  if (box.v === 2) {
    ctText = ""
    for (const p of found.parts) {
      let c
      try { c = JSON.parse(p.content) } catch (_) { throw new Error("The backup on your relays is damaged") }
      if (typeof c.part !== "string") throw new Error("The backup on your relays is damaged")
      ctText += c.part
    }
  }
  if (typeof ctText !== "string") throw new Error("The backup on your relays is damaged")
  const keyB64 = await decryptFromSelf(box.scheme === "nip04" ? "nip04" : "nip44", box.key)
  const key = unb64(keyB64)
  if (key.length !== 32) throw new Error("The backup key is invalid")
  const aes = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"])
  let packed
  try { packed = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, aes, unb64(ctText))) } catch (_) { throw new Error("The backup could not be decrypted") }
  const parsed = JSON.parse(new TextDecoder().decode(await gunzip(packed)))
  if (!parsed || parsed.app !== "FONY" || !parsed.data || typeof parsed.data !== "object") throw new Error("This is not a FONY backup")
  const entries = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    if (typeof v === "string" && !EXCLUDED.test(k)) entries[k] = v
  }
  return { entries, at: parsed.at || ev.created_at * 1000 }
}

// Replaces the local data with the backup. The Nostr sign-in is kept so the user stays connected.
export function applyBackup(entries) {
  const keep = {}
  for (const k of ["fonyNostrSession"]) { const v = localStorage.getItem(k); if (v != null) keep[k] = v }
  localStorage.clear()
  for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
  for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v)
}

export { isHexKey }
