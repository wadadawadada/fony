// Desktop-only polish for the icon menu in the player header:
//  * a tooltip that slides out of the hovered icon,
//  * the menu can be dragged (by its grip) anywhere over the player panel; next to the left or
//    right wall of the panel it snaps there and turns into a vertical column.
// The position is remembered. On phones nothing of this is active and the menu stays in the header.

const KEY = "topMenuPos"
const WALL_SNAP = 44          // px from a wall where the menu docks
const WALL_GAP = 8

const bar = document.querySelector(".top-bar-actions")
const topBar = document.querySelector(".top-bar")
const panel = document.querySelector(".left-panel")
const desktop = window.matchMedia("(min-width: 769px) and (hover: hover) and (pointer: fine)")

if (bar && topBar && panel) init()

function init() {
  let state = load()          // null (default place in the header) | { mode: "float" | "left" | "right", fx, fy }
  let dragging = false
  let placeTimer = null

  const grip = document.createElement("span")
  grip.className = "tb-grip"
  grip.setAttribute("role", "button")
  grip.setAttribute("aria-label", "Move the menu (double-click to reset)")
  bar.prepend(grip)

  const tip = document.createElement("div")
  tip.className = "tb-tip"
  tip.setAttribute("role", "tooltip")
  document.body.append(tip)

  const wallL = document.createElement("div")
  const wallR = document.createElement("div")
  wallL.className = "tb-wall left"
  wallR.className = "tb-wall right"
  document.body.append(wallL, wallR)

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null")
      if (v && ["float", "left", "right"].includes(v.mode)) return { mode: v.mode, fx: clamp01(v.fx), fy: clamp01(v.fy) }
    } catch (_) {}
    return null
  }
  function save() {
    try { state ? localStorage.setItem(KEY, JSON.stringify(state)) : localStorage.removeItem(KEY) } catch (_) {}
  }
  function clamp01(n) { n = Number(n); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0 }

  // ---- placement ----

  function setClasses() {
    bar.classList.add("tb-floating")
    bar.classList.toggle("tb-vertical", state.mode !== "float")
    bar.dataset.dock = state.mode
  }

  function toDefault() {
    bar.classList.remove("tb-floating", "tb-vertical", "tb-dragging")
    delete bar.dataset.dock
    bar.style.left = bar.style.top = bar.style.right = ""
    if (bar.parentNode !== topBar) topBar.append(bar)
  }

  function apply() {
    if (!desktop.matches || !state) { toDefault(); return }
    if (bar.parentNode !== document.body) document.body.append(bar)
    setClasses()
    place()
  }

  function place() {
    if (!state || !desktop.matches || dragging) return
    const pr = panel.getBoundingClientRect()
    const br = bar.getBoundingClientRect()
    const top = pr.top + state.fy * Math.max(0, pr.height - br.height)
    bar.style.top = Math.round(top) + "px"
    if (state.mode === "right") {
      // anchored by its right edge, so the exact width does not matter
      bar.style.left = "auto"
      bar.style.right = Math.round(document.documentElement.clientWidth - pr.right + WALL_GAP) + "px"
      return
    }
    bar.style.right = ""
    const left = state.mode === "left" ? pr.left + WALL_GAP : pr.left + state.fx * Math.max(0, pr.width - br.width)
    bar.style.left = Math.round(left) + "px"
  }

  // ---- dragging ----

  grip.addEventListener("pointerdown", (e) => {
    if (!desktop.matches || e.button !== 0) return
    e.preventDefault()
    hideTip()
    const pr0 = panel.getBoundingClientRect()
    if (!state) {
      // leave the header: keep the menu exactly where it is now
      const r = bar.getBoundingClientRect()
      state = {
        mode: "float",
        fx: clamp01((r.left - pr0.left) / Math.max(1, pr0.width - r.width)),
        fy: clamp01((r.top - pr0.top) / Math.max(1, pr0.height - r.height))
      }
      apply()
    }
    dragging = true
    bar.classList.add("tb-dragging")
    document.body.classList.add("tb-drag-active")
    grip.setPointerCapture(e.pointerId)
    let br = bar.getBoundingClientRect()
    let offX = e.clientX - br.left
    let offY = e.clientY - br.top
    let mode = state.mode

    const onMove = (ev) => {
      const pr = panel.getBoundingClientRect()
      br = bar.getBoundingClientRect()
      let left = ev.clientX - offX
      let top = ev.clientY - offY
      const nearLeft = left < pr.left + WALL_SNAP
      const nearRight = left + br.width > pr.right - WALL_SNAP
      const next = nearLeft ? "left" : nearRight ? "right" : "float"
      if (next !== mode) {
        mode = next
        state.mode = mode
        setClasses()
        br = bar.getBoundingClientRect()
        // the menu changed shape: keep it under the pointer
        offX = br.width / 2
        offY = Math.min(offY, br.height / 2)
        left = ev.clientX - offX
        top = ev.clientY - offY
      }
      if (mode === "left") left = pr.left + WALL_GAP
      else if (mode === "right") left = pr.right - br.width - WALL_GAP
      left = Math.min(Math.max(left, pr.left + WALL_GAP), pr.right - br.width - WALL_GAP)
      top = Math.min(Math.max(top, pr.top + WALL_GAP), pr.bottom - br.height - WALL_GAP)
      bar.style.right = ""
      bar.style.left = Math.round(left) + "px"
      bar.style.top = Math.round(top) + "px"
      showWalls(pr, mode)
    }

    const onUp = () => {
      grip.removeEventListener("pointermove", onMove)
      grip.removeEventListener("pointerup", onUp)
      grip.removeEventListener("pointercancel", onUp)
      const pr = panel.getBoundingClientRect()
      const r = bar.getBoundingClientRect()
      state.mode = mode
      state.fx = clamp01((r.left - pr.left) / Math.max(1, pr.width - r.width))
      state.fy = clamp01((r.top - pr.top) / Math.max(1, pr.height - r.height))
      dragging = false
      bar.classList.remove("tb-dragging")
      document.body.classList.remove("tb-drag-active")
      wallL.classList.remove("on", "hot")
      wallR.classList.remove("on", "hot")
      save()
      place()
    }
    grip.addEventListener("pointermove", onMove)
    grip.addEventListener("pointerup", onUp)
    grip.addEventListener("pointercancel", onUp)
  })

  // double click on the grip: back to the header
  grip.addEventListener("dblclick", () => {
    state = null
    save()
    apply()
  })

  function showWalls(pr, mode) {
    for (const [el, side] of [[wallL, "left"], [wallR, "right"]]) {
      el.style.top = pr.top + "px"
      el.style.height = pr.height + "px"
      el.style.left = (side === "left" ? pr.left : pr.right - 6) + "px"
      el.classList.add("on")
      el.classList.toggle("hot", mode === side)
    }
  }

  // ---- tooltip ----

  const NAMES = { manifestoBtn: "About FONY", themeToggle: "Switch theme", gamesBtn: "Games", settingsBtn: "Settings" }

  function tipText(btn) {
    return NAMES[btn.id] || btn.dataset.tip || btn.getAttribute("title") || btn.getAttribute("aria-label") || btn.querySelector("img")?.alt || ""
  }

  function showTip(btn) {
    if (!desktop.matches || dragging) return
    // the native tooltip would double ours
    const title = btn.getAttribute("title")
    if (title) { btn.dataset.tip = title; btn.removeAttribute("title") }
    const text = tipText(btn)
    if (!text) return
    tip.textContent = text
    const dock = bar.dataset.dock
    const side = dock === "left" ? "right" : dock === "right" ? "left" : "below"
    tip.dataset.side = side
    tip.classList.remove("show")
    const r = btn.getBoundingClientRect()
    tip.style.left = tip.style.top = "0px"
    const w = tip.offsetWidth
    let left, top
    if (side === "below") {
      left = Math.min(Math.max(r.left + r.width / 2, w / 2 + 8), window.innerWidth - w / 2 - 8)
      top = r.bottom + 22      // well below the cursor, so the pointer does not cover it
    } else if (side === "right") {
      left = r.right + 18
      top = r.top + r.height / 2 + 10
    } else {
      left = r.left - 18
      top = r.top + r.height / 2 + 10
    }
    tip.style.left = Math.round(left) + "px"
    tip.style.top = Math.round(top) + "px"
    // it grows out of the icon it belongs to
    tip.style.setProperty("--from-x", side === "below" ? "0px" : side === "right" ? "-14px" : "14px")
    tip.style.setProperty("--from-y", side === "below" ? "-12px" : "0px")
    requestAnimationFrame(() => requestAnimationFrame(() => tip.classList.add("show")))
  }

  function hideTip() {
    tip.classList.remove("show")
  }

  bar.addEventListener("pointerover", (e) => {
    const btn = e.target.closest && e.target.closest("button")
    if (btn && bar.contains(btn)) showTip(btn)
  })
  bar.addEventListener("pointerout", (e) => {
    const btn = e.target.closest && e.target.closest("button")
    if (!btn) return
    if (btn.dataset.tip && !btn.getAttribute("title")) btn.setAttribute("title", btn.dataset.tip)
    if (!e.relatedTarget || !bar.contains(e.relatedTarget) || !e.relatedTarget.closest("button")) hideTip()
  })
  bar.addEventListener("click", hideTip)
  bar.addEventListener("focusin", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && b.matches(":focus-visible")) showTip(b) })
  bar.addEventListener("focusout", hideTip)

  // ---- keep it in place when the layout changes ----

  desktop.addEventListener("change", apply)
  window.addEventListener("resize", () => place())
  if (window.ResizeObserver) new ResizeObserver(() => place()).observe(panel)
  // the panel can move without changing size (left-handed layout)
  placeTimer = setInterval(() => { if (state && !dragging) place() }, 1500)

  apply()
}
