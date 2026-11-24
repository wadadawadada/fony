// The note icon next to the now-playing title doubles as a "collect track" button:
// hover swaps it for a plus and the title for "collect track"; a click adds the playing track to the collection.
import { addTrackToCollection } from "./collection.js"

const ICON = "/img/track_icon.svg"
const ADD = "/img/track_add_icon.svg"
const css = `
.right-group .track-icon { cursor: pointer; transition: transform 0.15s; }
.right-group .track-icon:hover { transform: scale(1.15); }
.right-group.collect-hover .track-name > * { visibility: hidden; }
.right-group.collect-hover .track-name::after,
.right-group.collect-done .track-name::after { content: "collect track"; position: absolute; right: 0; top: 0; color: #00F2B8; }
.right-group.collect-done .track-name::after { content: "added to collection ✓"; }
.right-group.collect-done .track-name > * { visibility: hidden; }
`
const s = document.createElement("style")
s.textContent = css
document.head.appendChild(s)

const iconOf = (e) => e.target.closest && e.target.closest(".right-group .track-icon")
let timer = null

function nowPlaying() {
  const el = document.querySelector("#currentTrack .scrolling-text")
  const text = el ? el.textContent.trim() : ""
  if (!text) return null
  const m = text.split(/\s[-–]\s/)
  const artist = m.length > 1 ? m[0].trim() : ""
  const track = (m.length > 1 ? m.slice(1).join(" - ") : text).trim()
  return track ? { artist, track } : null
}

document.addEventListener("mouseover", (e) => {
  const icon = iconOf(e)
  if (!icon) return
  icon.src = ADD
  icon.closest(".right-group").classList.add("collect-hover")
})

document.addEventListener("mouseout", (e) => {
  const icon = iconOf(e)
  if (!icon) return
  icon.src = ICON
  icon.closest(".right-group").classList.remove("collect-hover")
})

document.addEventListener("click", (e) => {
  const icon = iconOf(e)
  if (!icon) return
  const group = icon.closest(".right-group")
  const t = nowPlaying()
  if (!t) return
  const added = addTrackToCollection(t.artist, t.track)
  group.classList.remove("collect-hover")
  group.classList.add("collect-done")
  clearTimeout(timer)
  timer = setTimeout(() => group.classList.remove("collect-done"), added ? 1400 : 900)
})
