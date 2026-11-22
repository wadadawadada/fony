// A small "asked, nothing there" memory. Station logos and Discogs releases that do not exist are looked up again on every
// page load and every time the same track comes round; this remembers the 404 for a while so the request is not repeated.

const KEY = "fonyMissing"
const TTL_MS = 12 * 60 * 60 * 1000   // twelve hours
const MAX = 400

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {} } catch { return {} }
}

export function isMissing(key) {
  const t = read()[key]
  return typeof t === "number" && Date.now() - t < TTL_MS
}

export function markMissing(key) {
  // a request that failed because the device is offline says nothing about the thing itself
  if (typeof navigator !== "undefined" && navigator.onLine === false) return
  const map = read()
  const now = Date.now()
  map[key] = now
  const keys = Object.keys(map)
  if (keys.length > MAX) {
    keys.sort((a, b) => map[a] - map[b]).slice(0, keys.length - MAX).forEach(k => delete map[k])
  }
  for (const k of Object.keys(map)) if (now - map[k] > TTL_MS) delete map[k]
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch {}
}
