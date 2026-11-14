// Background upkeep, so nothing has to be refreshed by hand:
//
//  * Shared Favorites: once a list has been shared (by pressing Share), it is kept up to date.
//    It is re-published when the user signs in / opens the app and when the local Favorites
//    differ, then at most every few hours. FONY never publishes a list that was not shared before.
//  * Followed playlists: checked at start and every half hour; Following marks the ones with a new version.
//  * Backup (optional, off by default): a daily encrypted backup, only when something changed.
//
// Turn the first two off with the switch in Nostr > Profile; the backup in Settings > Data.

import * as Auth from "./auth.js"
import * as Lists from "./playlists.js"
import * as Fav from "./favorites.js"

const SHARE_KEY = "fonyNostrAutoShare"       // "0" = off, anything else = on
const BACKUP_KEY = "fonyNostrAutoBackup"     // "1" = on
const STATE_KEY = "fonyNostrAutoState"

const START_DELAY = 20000                    // let the app finish loading first
const TICK = 30 * 60 * 1000
const SHARE_GAP = 3 * 60 * 60 * 1000         // between automatic re-publications
const SHARE_RETRY = 60 * 60 * 1000           // after a failed attempt
const BACKUP_GAP = 24 * 60 * 60 * 1000
const BACKUP_RETRY = 6 * 60 * 60 * 1000

let getFavoriteStations = null
let started = false
let running = false

function readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {} } catch (_) { return {} }
}
function writeState(patch) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch })) } catch (_) {}
}

export function isAutoShare() {
  try { return localStorage.getItem(SHARE_KEY) !== "0" } catch (_) { return true }
}
export function setAutoShare(on) {
  try { localStorage.setItem(SHARE_KEY, on ? "1" : "0") } catch (_) {}
  if (on) schedule(2000, "enabled")
}
export function isAutoBackup() {
  try { return localStorage.getItem(BACKUP_KEY) === "1" } catch (_) { return false }
}
export function setAutoBackup(on) {
  try { localStorage.setItem(BACKUP_KEY, on ? "1" : "0") } catch (_) {}
  if (on) schedule(2000, "enabled")
}

function hashText(text) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(16)
}

// ---- shared Favorites ----

async function syncShared(reason) {
  const session = Auth.getSession()
  if (!session || !isAutoShare() || !getFavoriteStations) return
  // a list published elsewhere is recognised, but only a manual Update from this device may replace it
  const meta = await Lists.adoptRemote(session.pubkey)
  if (!meta || meta.adopted) return                   // never shared (or shared elsewhere): never published automatically
  const st = readState()
  const now = Date.now()
  // after a failed attempt wait an hour; otherwise a sign-in / switching it on checks right away,
  // and the periodic rounds publish at most every few hours
  if (st.shareFail && now - st.shareFail < SHARE_RETRY) return
  if (reason !== "login" && reason !== "enabled" && st.shareAt && now - st.shareAt < SHARE_GAP) return
  let stations
  try { stations = await Fav.getShareableFavorites(getFavoriteStations) } catch (_) { return }
  if (!stations.length) return                        // an empty list is never published automatically
  // never let a half-loaded catalog shrink the published list: if some Favorites could not be resolved
  // and the result is smaller than what is published, wait for the next round
  let saved = 0
  try { saved = JSON.parse(localStorage.getItem("favorites") || "[]").length } catch (_) {}
  if (stations.length + (stations.skipped || 0) < saved && stations.length < meta.count) return
  if (Lists.syncState(session.pubkey, stations).inSync) return
  try {
    await Lists.shareFavorites({ stations, title: meta.title, description: meta.description })
    writeState({ shareAt: Date.now(), shareFail: 0 })
    document.dispatchEvent(new CustomEvent("fony:nostr-autosync", { detail: { what: "shared" } }))
  } catch (_) {
    writeState({ shareFail: Date.now() })
  }
}

// ---- followed playlists ----

async function syncFollowed() {
  if (!Lists.getFollowedLists().length) return
  try {
    await Lists.refreshFollowedLists()   // the "New" badge in Following shows what changed
  } catch (_) {}
}

// ---- backup ----

async function syncBackup() {
  if (!Auth.getSession() || !isAutoBackup()) return
  const st = readState()
  const now = Date.now()
  const last = Math.max(st.backupAt || 0, st.backupFail || 0)
  if (now - last < (st.backupFail && st.backupFail > (st.backupAt || 0) ? BACKUP_RETRY : BACKUP_GAP)) return
  try {
    const bk = await import("./backup.js")
    const { data } = bk.backupEntries()
    const hash = hashText(JSON.stringify(data))
    if (hash === st.backupHash) { writeState({ backupAt: now }); return }
    await bk.backupToNostr()
    writeState({ backupAt: Date.now(), backupHash: hash, backupFail: 0 })
  } catch (_) {
    writeState({ backupFail: Date.now() })
  }
}

// ---- scheduling ----

let timer = null
function schedule(delay, reason) {
  clearTimeout(timer)
  timer = setTimeout(() => run(reason), delay)
}

async function run(reason) {
  if (running) return
  running = true
  try {
    await syncFollowed()
    await syncShared(reason)
    await syncBackup()
  } finally {
    running = false
  }
}

export function initAutoSync(getStations) {
  if (started) return
  started = true
  getFavoriteStations = getStations
  Auth.onAuthChange((s) => { if (s) schedule(START_DELAY / 2, "login") })
  // the sign-in is restored from storage at start-up: check once things have settled
  setTimeout(() => { if (Auth.isLoggedIn()) run("login"); else syncFollowed() }, START_DELAY)
  setInterval(() => { if (!document.hidden) run("tick") }, TICK)
}

