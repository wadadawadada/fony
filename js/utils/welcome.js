// First visit: the two tools worth trying first (Random and FONY Music) are lit up for a few seconds with a short
// caption, then everything fades away. A click, a key press or Esc dismisses it at once; the click still reaches
// the button underneath.

const SEEN_KEY = "fonyIntroSeen"
const ALWAYS_SHOW = false     // true shows it on every load (for testing); false: once per visitor
const SHOW_AFTER_MS = 1400
const STAY_MS = 9000
const FADE_MS = 650

const css = document.createElement("link")
css.rel = "stylesheet"
css.href = "/css/welcome.css?v=1"

function seen() {
  try { return localStorage.getItem(SEEN_KEY) === "1" } catch (_) { return false }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1") } catch (_) {}
}

// the box that really wraps the visible icons of the menu (the bar itself can be wider than its icons)
function iconsBox(bar) {
  if (!bar) return null
  const rects = [...bar.children].map(c => c.getBoundingClientRect()).filter(r => r.width > 4 && r.height > 4)
  if (!rects.length) return null
  const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.right))
  const top = Math.min(...rects.map(r => r.top)), bottom = Math.max(...rects.map(r => r.bottom))
  return { left, top, width: right - left, height: bottom - top }
}

// the visible box of a target, or null when it is hidden (the menu icons do not exist on small screens)
function box(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return null
  const cs = getComputedStyle(el)
  if (cs.visibility === "hidden" || cs.display === "none") return null
  return r
}

async function show() {
  const targets = [
    { el: document.querySelector(".top-bar-actions"), name: "Top menu", text: "Nostr, local files, FONY Music, settings and theme", round: false },
    { el: document.getElementById("randomBtn"), name: "Random", text: "a surprise station, one tap", round: true }
  ].map(t => ({ ...t, r: t.round ? box(t.el) : (box(t.el) && iconsBox(t.el)) })).filter(t => t.r)
  if (!targets.length) return
  if (document.querySelector("#nftModal:not([hidden]), .nostr-modal, dialog[open]")) return

  document.head.appendChild(css)
  await new Promise(res => { css.onload = css.onerror = res; setTimeout(res, 1500) })   // measure the card with its styles
  const root = document.createElement("div")
  root.className = "fw"
  root.setAttribute("role", "note")
  const pad = 10
  const holes = targets.map(t => {
    const r = t.r
    if (t.round) {
      const size = Math.max(r.width, r.height) + pad * 2
      return { x: r.left + r.width / 2 - size / 2, y: r.top + r.height / 2 - size / 2, w: size, h: size, rx: size / 2 }
    }
    const w = r.width + pad * 2.4, h = r.height + pad * 1.6
    return { x: r.left - pad * 1.2, y: r.top - pad * 0.8, w, h, rx: h / 2 }
  })
  root.innerHTML = `
    <svg class="fw-dim" width="100%" height="100%" aria-hidden="true">
      <defs><mask id="fwMask"><rect width="100%" height="100%" fill="#fff"/>
        ${holes.map(h => `<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="${h.rx}" fill="#000"/>`).join("")}
      </mask></defs>
      <rect width="100%" height="100%" fill="rgba(5,9,16,0.66)" mask="url(#fwMask)"/>
    </svg>
    ${holes.map(h => `<span class="fw-ring${h.rx * 2 === h.w ? "" : " wide"}" style="left:${h.x}px;top:${h.y}px;width:${h.w}px;height:${h.h}px;border-radius:${h.rx}px"></span>`).join("")}
    ${targets.map((t, i) => `<div class="fw-card" data-i="${i}">${i === 0 ? "<h3>Start with these tools</h3>" : ""}<p><b>${t.name}</b> ${t.text}</p></div>`).join("")}`
  document.body.appendChild(root)

  // every target has its own caption next to it: above the target when there is room, below it otherwise
  root.querySelectorAll(".fw-card").forEach((card, i) => {
    const hole = holes[i]
    const w = card.offsetWidth, h = card.offsetHeight
    const roomAbove = hole.y - h - 20 > 12
    const roomBelow = hole.y + hole.h + 20 + h < innerHeight - 12
    const above = targets[i].round ? (roomAbove || !roomBelow) : !roomBelow && roomAbove
    const top = above ? hole.y - h - 20 : hole.y + hole.h + 20
    const cx = hole.x + hole.w / 2
    const left = Math.max(12, Math.min(innerWidth - w - 12, cx - w / 2))
    card.style.top = Math.max(12, top) + "px"
    card.style.left = left + "px"
    card.style.setProperty("--ax", Math.max(18, Math.min(w - 18, cx - left)) + "px")
    card.classList.add(above ? "up" : "down")
  })

  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("on")))

  let closed = false
  let timer = setTimeout(close, STAY_MS)
  function close() {
    if (closed) return
    closed = true
    clearTimeout(timer)
    markSeen()
    window.removeEventListener("pointerdown", close, true)
    window.removeEventListener("keydown", close, true)
    window.removeEventListener("resize", close)
    root.classList.remove("on")
    root.classList.add("off")
    setTimeout(() => { root.remove(); css.remove() }, FADE_MS + 50)
  }
  window.addEventListener("pointerdown", close, true)
  window.addEventListener("keydown", close, true)
  window.addEventListener("resize", close)
}

function start() {
  // the hint is for the desktop layout: the menu and the player share the screen there
  if (matchMedia("(max-width: 900px), (pointer: coarse)").matches) return
  if (!ALWAYS_SHOW && seen()) return
  setTimeout(show, SHOW_AFTER_MS)
}

if (document.readyState === "complete") start()
else window.addEventListener("load", start, { once: true })
