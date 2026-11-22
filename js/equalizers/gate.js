// Frame scheduling for the visualizers. They only need full speed while there is something to show:
// the sound is playing, or it stopped a moment ago and the bars are still settling. The rest of the time
// (paused, nothing loaded) they tick at a few frames per second instead of 60, so a paused player is quiet.
// frame()/unframe() are drop-in replacements for requestAnimationFrame()/cancelAnimationFrame().

const SETTLE_MS = 1500   // how long after a pause the animation keeps its full speed (the bars fall to rest)
const IDLE_MS = 150      // idle tick: still fast enough that the visual wakes up promptly on play

const audio = typeof document !== "undefined" ? document.getElementById("audioPlayer") : null
let lastLive = 0

// "live" = the player is running and has data to play. A stream that is still connecting, or stalled, is not live:
// there is no sound to draw, so the visualizer does not need frames for it.
function live() {
  return !!audio && !audio.paused && !audio.ended && audio.readyState >= 3
}

export function isActive() {
  const now = performance.now()
  if (live()) { lastLive = now; return true }
  return now - lastLive < SETTLE_MS     // just stopped: keep full speed while the bars fall to rest
}

let seq = 0
const timers = new Map()

export function frame(cb) {
  if (isActive()) return requestAnimationFrame(cb)
  const id = --seq                       // idle ticks get negative ids so unframe() can tell them apart
  timers.set(id, setTimeout(() => { timers.delete(id); cb(performance.now()) }, IDLE_MS))
  return id
}

export function unframe(id) {
  if (!id) return
  if (id > 0) { cancelAnimationFrame(id); return }
  if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id) }
}
