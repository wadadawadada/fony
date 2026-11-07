// Station logos for the Favorites list.
// A logo is fetched once from the backend, shrunk to a small data URL and kept in
// localStorage ("favLogos") until the station is removed from favorites.

const KEY = "favLogos"
const RETRY_MS = 7 * 24 * 60 * 60 * 1000
const LOGO_PX = 64
const MAX_CONCURRENT = 2
const BACKEND = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app"

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {} } catch { return {} }
}

function write(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch {}
}

// Setting "Load station icons" (on by default, stored as "false" when switched off)
export function stationLogosEnabled() {
  try { return localStorage.getItem("stationLogos") !== "false" } catch { return true }
}

export function getFavLogo(url) {
  if (!stationLogosEnabled()) return null
  const v = read()[url]
  return v && v.d ? v.d : null
}

// Drops logos of stations that are no longer favorites.
export function pruneFavLogos(favUrls) {
  const keep = new Set(favUrls)
  const map = read()
  let changed = false
  for (const url of Object.keys(map)) {
    if (!keep.has(url)) { delete map[url]; changed = true }
  }
  if (changed) write(map)
}

export function removeFavLogo(url) {
  const map = read()
  if (url in map) { delete map[url]; write(map) }
}

async function blobToSmallDataUrl(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(LOGO_PX / bmp.width, LOGO_PX / bmp.height, 1)
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h)
    return canvas.toDataURL("image/png")
  } catch {
    // formats the browser cannot decode into a bitmap (e.g. .ico): keep as is when small
    if (blob.size > 40 * 1024) return null
    return new Promise(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  }
}

async function fetchLogo(station) {
  const src = `${BACKEND}/api/station-logo?kind=logo&name=${encodeURIComponent(station.title || "")}&url=${encodeURIComponent(station.originalUrl || station.url || "")}`
  const map = read()
  try {
    const resp = await fetch(src)
    if (!resp.ok) throw new Error("no logo")
    const dataUrl = await blobToSmallDataUrl(await resp.blob())
    map[station.url] = dataUrl ? { d: dataUrl, t: Date.now() } : { t: Date.now() }
  } catch {
    map[station.url] = { t: Date.now() }
  }
  write({ ...read(), [station.url]: map[station.url] })
  return getFavLogo(station.url)
}

const queue = []
const pending = new Map() // url -> callbacks
let running = 0

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const station = queue.shift()
    running++
    fetchLogo(station)
      .then(logo => {
        const cbs = pending.get(station.url) || []
        pending.delete(station.url)
        if (logo) cbs.forEach(cb => { try { cb(logo) } catch {} })
      })
      .finally(() => { running--; pump() })
  }
}

// Calls onReady(dataUrl) once a logo is available. Stations without a logo are not
// asked again for a week.
export function ensureFavLogo(station, onReady) {
  if (!station || !station.url || !station.title || !stationLogosEnabled()) return
  const cached = read()[station.url]
  if (cached && cached.d) { onReady(cached.d); return }
  if (cached && Date.now() - (cached.t || 0) < RETRY_MS) return
  if (pending.has(station.url)) { pending.get(station.url).push(onReady); return }
  pending.set(station.url, [onReady])
  queue.push(station)
  pump()
}

// Replaces the genre icon inside a favorites avatar with the station logo.
export function applyAvatarLogo(iconContainer, dataUrl) {
  const avatar = iconContainer && iconContainer.querySelector(".station-avatar")
  if (!avatar || !dataUrl) return
  avatar.classList.add("has-logo")
  avatar.style.backgroundColor = "transparent"
  avatar.style.backgroundImage = `url("${dataUrl}")`
  avatar.style.backgroundSize = "cover"
  avatar.style.backgroundPosition = "center"
  avatar.style.backgroundRepeat = "no-repeat"
  avatar.style.borderRadius = "6px"
  const icon = avatar.querySelector(".genre-icon")
  if (icon) icon.style.display = "none"
}
