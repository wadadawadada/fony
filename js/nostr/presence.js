// "Now listening" (NIP-38, kind 30315).
//
// Off by default. When the user turns it on, FONY publishes the current station
// (and track title) as a music status, refreshes it while playing, updates it when
// the station changes and clears it when playback stops. Statuses carry an
// expiration tag, so a status that could not be cleared (closed tab) disappears on
// its own after a few minutes. Local-file playback is never published.

import { publish } from "./client.js"
import { signEvent, getSession, onAuthChange } from "./auth.js"
import { buildStatusEvent, buildStatusClear, buildTuneLink, buildListeningNote, STATUS_TTL } from "./format.js"

const ENABLED_KEY = "fonyNostrPresence"
const NOTE_KEY = "fonyNostrPresenceNote"          // optional: also post a note to the feed
const NOTE_GAP = 20 * 60 * 1000                    // at most one feed note every 20 minutes
const MIN_GAP = 15000            // at most one update per 15 s
const CHANGE_DEBOUNCE = 2500     // wait for the user to settle on a station
const STOP_GRACE = 4000          // a pause shorter than this (station switch) does not clear the status
const HEARTBEAT = Math.floor(STATUS_TTL * 1000 * 0.5)

let enabled = false
let audio = null
let current = null               // { station: {url, name, genre}, track }
let published = null             // { key, at } of the last status that went out
let changeTimer = null
let stopTimer = null
let heartbeatTimer = null
let busy = false
let lastNote = { at: 0, url: "" }
let pending = false
const statusListeners = new Set()
let lastState = { state: "off", message: "" }

function setState(state, message = "") {
  lastState = { state, message }
  for (const fn of statusListeners) { try { fn(lastState) } catch (_) {} }
}

export function onPresenceState(fn) {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

export function getPresenceState() {
  return lastState
}

export function isPresenceEnabled() {
  return enabled
}

export function isNoteEnabled() {
  try { return localStorage.getItem(NOTE_KEY) === "1" } catch (_) { return false }
}

export function setNoteEnabled(on) {
  try { localStorage.setItem(NOTE_KEY, on ? "1" : "0") } catch (_) {}
}

// A feed note is a normal post, so it is rate limited and only sent for a new station.
async function maybePostNote(link) {
  if (!isNoteEnabled() || !current) return
  const url = current.station.url
  if (url === lastNote.url || Date.now() - lastNote.at < NOTE_GAP) return
  lastNote = { at: Date.now(), url }
  // the album cover is looked up after the track title arrives: give it a few seconds
  let image = null
  for (let i = 0; i < 10 && !image; i++) {
    image = (typeof window !== "undefined" && window.currentAlbumArtUrl) || null
    if (!image) await new Promise(r => setTimeout(r, 1000))
    if (!current || current.station.url !== url) return   // the user moved on
  }
  const tpl = buildListeningNote({ station: current.station, track: current.track, link, image })
  if (!tpl) return
  try {
    const signed = await signEvent(tpl)
    await publish(signed)
  } catch (err) {
    setState("error", "Feed note: " + String(err && err.message || err))
  }
}

function isPlaying() {
  return !!audio && !audio.paused && !audio.ended && !!current
}

export function initPresence() {
  audio = document.getElementById("audioPlayer")
  try { enabled = localStorage.getItem(ENABLED_KEY) === "1" } catch (_) { enabled = false }
  setState(enabled ? "idle" : "off")
  if (!audio) return

  document.addEventListener("fony:nowplaying", (e) => {
    const d = e.detail || {}
    if (!d.station || d.local) { current = null; scheduleStop(); return }
    const same = current && current.station.url === d.station.url
    current = { station: d.station, track: d.track || (same ? current.track : "") }
    if (!enabled) return
    clearTimeout(stopTimer)
    scheduleUpdate(same ? MIN_GAP : CHANGE_DEBOUNCE)
  })

  audio.addEventListener("play", () => {
    clearTimeout(stopTimer)
    if (enabled && current) scheduleUpdate(CHANGE_DEBOUNCE)
  })
  audio.addEventListener("pause", scheduleStop)
  audio.addEventListener("ended", scheduleStop)

  onAuthChange((s) => {
    if (!s) { stopHeartbeat(); published = null; setState(enabled ? "login" : "off") }
    else if (enabled && isPlaying()) scheduleUpdate(CHANGE_DEBOUNCE)
  })
}

export function setPresenceEnabled(on) {
  enabled = !!on
  try { localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0") } catch (_) {}
  if (enabled) {
    setState(getSession() ? "idle" : "login")
    if (isPlaying()) scheduleUpdate(500)
  } else {
    clearTimeout(changeTimer)
    stopHeartbeat()
    if (published && getSession()) sendClear()
    published = null
    setState("off")
  }
}

function scheduleUpdate(delay) {
  clearTimeout(changeTimer)
  const wait = Math.max(delay, published ? published.at + MIN_GAP - Date.now() : 0)
  changeTimer = setTimeout(() => update(), wait)
}

function scheduleStop() {
  clearTimeout(stopTimer)
  clearTimeout(changeTimer)
  if (!enabled || !published) return
  stopTimer = setTimeout(() => {
    if (isPlaying()) return
    stopHeartbeat()
    sendClear()
  }, STOP_GRACE)
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (!enabled || !isPlaying()) return
    update(true)
  }, HEARTBEAT)
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

async function update(force = false) {
  if (!enabled || !isPlaying()) return
  if (!getSession()) { setState("login"); return }
  if (busy) { pending = true; return }
  const key = current.station.url + "\n" + (current.track || "")
  if (!force && published && published.key === key && Date.now() - published.at < HEARTBEAT) return

  const link = buildTuneLink(location.origin, current.station)
  const template = buildStatusEvent({ station: current.station, track: current.track, link })
  if (!template) return
  busy = true
  try {
    const signed = await signEvent(template)
    await publish(signed)
    published = { key, at: Date.now() }
    setState("live", current.station.name)
    startHeartbeat()
    maybePostNote(link)
  } catch (err) {
    setState("error", String(err && err.message || err))
  } finally {
    busy = false
    if (pending) { pending = false; scheduleUpdate(MIN_GAP) }
  }
}

async function sendClear() {
  if (!getSession()) { published = null; return }
  try {
    const signed = await signEvent(buildStatusClear())
    await publish(signed)
    setState("idle")
  } catch (err) {
    setState("error", String(err && err.message || err))
  } finally {
    published = null
  }
}
