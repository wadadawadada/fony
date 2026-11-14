// FONY Nostr mode: the social layer of the player.
//
//   Sign in    - first screen when you are not connected (extension, signer app / QR, bunker link)
//   Following  - what the accounts you follow listen to, plus the lists you follow
//   Shared     - station lists published by you and the people you follow
//   Discover   - public lists and stations, search by text / npub / naddr / link
//   Profile    - your account, shared Favorites, "now listening", relays
//
// Everything that comes from relays is rendered with textContent only (never
// innerHTML) and was validated in js/nostr/format.js before it got here.
// FONY works the same without any of this: Nostr is opt-in.

import * as Auth from "./nostr/auth.js"
import * as Client from "./nostr/client.js"
import { getProfiles, getFollows, displayName, followAccount, unfollowAccount } from "./nostr/profile.js"
import * as Lists from "./nostr/playlists.js"
import * as Fav from "./nostr/favorites.js"
import * as Disc from "./nostr/discovery.js"
import * as Pres from "./nostr/presence.js"
import * as F from "./nostr/format.js"
import * as AutoSync from "./nostr/autosync.js"
import { bindBackup } from "./nostr/backup-ui.js"
import { confirmDialog } from "./local-mode.js"
import { createGenreAvatar, getGenreIcon } from "./playlist.js"
import { getFavLogo, ensureFavLogo, applyAvatarLogo, stationLogosEnabled } from "./utils/favLogos.js"

const TABS = [
  { id: "following", label: "Following", icon: "users" },
  { id: "shared", label: "Shared", icon: "heart" },
  { id: "discover", label: "Discover", icon: "compass" },
  { id: "profile", label: "Profile", icon: "user" }
]
const TAB_KEY = "fonyNostrTab"
const GUEST_KEY = "fonyNostrGuest"
const LISTENING_REFRESH = 30000
const QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm"

let ctx = null
let active = false
let tab = "discover"
let sub = null                 // { type: "list" | "user" | "tuned", ... } drill-in view
let view = null
let token = 0
let discoverQuery = ""
let listeningTimer = null
let searchTimer = null
let wired = false
let guest = false              // chose "browse without an account" for this visit
let pendingConnect = null      // running nostrconnect:// attempt

// ---------------------------------------------------------------- helpers

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === "class") e.className = v
    else if (k === "text") e.textContent = v
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v)
    else e.setAttribute(k, v === true ? "" : String(v))
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)))
  }
  return e
}

// replaceChildren() would print "null" for skipped optional children
function put(el, ...kids) {
  el.replaceChildren(...kids.flat().filter(k => k != null && k !== false))
}

// ---- icons (static markup only, never built from relay data) ----
const ICONS = {
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.3c1.8.8 3 2.6 3 4.7"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.5 2.5c0 5.7-7.5 10.3-7.5 10.3z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  live: '<path d="M4 12h2M8 8v8M12 4v16M16 8v8M20 12h-2"/>',
  list: '<path d="M4 6h12M4 12h12M4 18h8M18 15v6M15 18h6"/>',
  key: '<circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10M17 12v3.5M20.5 12v2.5"/>',
  puzzle: '<path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v6h-6v-2a2 2 0 1 0-4 0v2H4v-6h2a2 2 0 1 0 0-4H4V6h6z"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2M14 18h2M18 18h2v2h-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  relay: '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  down: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  up: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.6 4.7 4.7 0 0 1 17.5 18z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M14 8l4 4-4 4M18 12H8"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.2 5.6M20 4.5V11h-6.5"/>',
  feed: '<path d="M4 5h16v11H9l-5 4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'
}

function icon(name, cls = "nostr-ico") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  s.setAttribute("viewBox", "0 0 24 24")
  s.setAttribute("class", cls)
  s.setAttribute("aria-hidden", "true")
  const g = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + (ICONS[name] || "") + "</svg>", "image/svg+xml").documentElement
  for (const n of [...g.childNodes]) s.append(document.importNode(n, true))
  return s
}

function ago(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (s < 90) return "just now"
  if (s < 3600) return Math.floor(s / 60) + " min ago"
  if (s < 86400) return Math.floor(s / 3600) + " h ago"
  if (s < 86400 * 30) return Math.floor(s / 86400) + " d ago"
  return new Date(ts * 1000).toLocaleDateString()
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

function hueOf(str) {
  let x = 7
  for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) >>> 0
  return x % 360
}

let toastTimer = null
function toast(message) {
  let t = document.getElementById("nostrToast")
  if (!t) {
    t = h("div", { id: "nostrToast", class: "nostr-toast", role: "status" })
    document.body.append(t)
  }
  t.textContent = message
  t.classList.add("show")
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (_) {
    const ta = h("textarea", { style: "position:fixed;opacity:0" })
    ta.value = text
    document.body.append(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand("copy") } catch (_) {}
    ta.remove()
    return ok
  }
}

function avatar(profile, pubkey, size = 36) {
  const wrap = h("span", { class: "nostr-avatar", style: `width:${size}px;height:${size}px;--h:${hueOf(pubkey || "x")}` })
  const initial = (displayName(profile, pubkey)[0] || "?").toUpperCase()
  wrap.append(h("span", { class: "nostr-avatar-initial", text: initial }))
  if (profile && profile.picture) {
    const img = h("img", { alt: "", loading: "lazy", referrerpolicy: "no-referrer", decoding: "async" })
    img.addEventListener("error", () => img.remove())
    img.src = profile.picture
    wrap.append(img)
  }
  return wrap
}

// 2x2 mosaic cover for a list, coloured by the genres of its stations
function cover(list, size = 54) {
  const stations = list.stations || []
  const tiles = stations.slice(0, 4)
  // the genres that dominate the list, most frequent first
  const count = new Map()
  for (const st of stations) if (st.genre) count.set(st.genre, (count.get(st.genre) || 0) + 1)
  const dominant = [...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(e => e[0])
  const iconPx = Math.round(size * 0.27)
  const el = h("span", { class: "nostr-cover", style: `width:${size}px;height:${size}px` })
  for (let i = 0; i < 4; i++) {
    const st = tiles[i]
    const tile = h("span", { class: "nostr-tile", style: `--h:${hueOf(st ? (st.genre || st.name) : list.id + i)}` })
    if (dominant.length) {
      const url = getGenreIcon(dominant[i % dominant.length])
      tile.append(h("span", { class: "nostr-tile-ico", style: `width:${iconPx}px;height:${iconPx}px;-webkit-mask-image:url(${url});mask-image:url(${url})` }))
    }
    el.append(tile)
  }
  return el
}

function loader(text = "Loading…") {
  return h("div", { class: "nostr-loading" }, h("span", { class: "nostr-eq" }, h("i"), h("i"), h("i"), h("i")), h("span", { text }))
}

function emptyBox(message, ...actions) {
  return h("div", { class: "nostr-empty" }, h("p", { text: message }), actions.length ? h("div", { class: "nostr-actions center" }, ...actions) : null)
}

function errorBox(message, retry) {
  return h("div", { class: "nostr-empty" }, h("p", { text: message }),
    retry ? h("button", { class: "nostr-btn small", type: "button", onclick: retry, text: "Try again" }) : null)
}

// the whole card is a Tune In target (keyboard too)
function playOnClick(row, play) {
  row.classList.add("clickable")
  row.setAttribute("role", "button")
  row.setAttribute("tabindex", "0")
  row.addEventListener("click", play)
  row.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); play() } })
  return row
}

// icon with a small caption underneath (rarely used actions)
function labelBtn(name, label, onclick, cls = "") {
  return h("button", { class: "nostr-lb " + cls, type: "button", title: label, "aria-label": label, onclick }, icon(name, "nostr-ico"), h("span", { text: label }))
}

// round icon-only button (play / add)
function iconBtn(name, label, onclick, cls = "") {
  return h("button", { class: "nostr-ib " + cls, type: "button", title: label, "aria-label": label, onclick: (e) => { e.stopPropagation(); onclick(e) } }, icon(name, "nostr-ico"))
}

function button(label, onclick, cls = "", iconName = "") {
  return h("button", { class: "nostr-btn " + cls, type: "button", onclick }, iconName ? icon(iconName, "nostr-ico sm") : null, label)
}

function sectionTitle(_iconName, text) {
  return h("h3", { class: "nostr-h", text })
}

function stale(my) {
  return !active || my !== token
}

// stagger the entrance of rows
function stagger(nodes) {
  nodes.forEach((n, i) => { if (n && n.style) n.style.setProperty("--i", Math.min(i, 12)) })
  return nodes
}

// Withdraw the shared list (NIP-09 deletion request) after an in-app confirmation.
async function unshareFlow(setMessage) {
  const sure = await confirmDialog({
    title: "Unshare your Favorites?",
    text: "FONY asks your relays to delete the shared list (and its feed note, if you posted one). Your local Favorites are not touched. Relays that ignore deletion requests may keep a copy.",
    okLabel: "Unshare"
  })
  if (!sure) return false
  setMessage && setMessage("Asking relays to remove the list…")
  await Lists.unshareFavorites()
  toast("Shared list removed")
  return true
}

// ---------------------------------------------------------------- sign-in

async function drawQr(box, uri) {
  try {
    const mod = await import(QR_LIB)
    const qr = mod.default(0, "M")
    qr.addData(uri)
    qr.make()
    const img = h("img", { class: "nostr-qr-img", alt: "QR code for your signer app", width: "168", height: "168" })
    img.src = qr.createDataURL(4, 2)
    put(box, img)
  } catch (_) {
    put(box, h("p", { class: "nostr-note", text: "The QR code could not be created. Copy the link instead." }))
  }
}

// The ways to sign in. The signer-app QR code is created straight away (nothing to click):
// scan it, or open the link on the same device. An extension and a bunker link sit below.
// `onDone` runs after a successful sign-in.
function loginMethods(onDone) {
  const status = h("p", { class: "nostr-status", role: "status" })
  const done = () => { toast("Nostr connected"); onDone && onDone() }
  const fail = (err) => { status.textContent = String(err && err.message || err) }

  // --- signer app: QR first
  const qrBox = h("div", { class: "nostr-qr" }, loader(""))
  const qrSide = h("div", { class: "nostr-qr-side" })
  const startQr = async () => {
    put(qrBox, h("div", { class: "nostr-qr-wait" }, loader("")))
    put(qrSide, h("p", { class: "nostr-note", text: "Preparing…" }))
    try {
      if (pendingConnect) pendingConnect.cancel()
      const c = await Auth.startNostrConnect()
      pendingConnect = c
      await drawQr(qrBox, c.uri)
      put(qrSide,
        h("div", { class: "nostr-method-title", text: "Scan with your signer app" }),
        h("p", { class: "nostr-note", text: "Amber, nsec.app, Alby Hub… Approve the request in the app." }),
        h("div", { class: "nostr-actions" },
          h("a", { class: "nostr-btn primary small", href: c.uri }, icon("qr", "nostr-ico sm"), "Open signer app"),
          button("Copy link", async () => toast(await copyText(c.uri) ? "Link copied" : "Could not copy"), "small quiet", "link")),
        h("p", { class: "nostr-note waiting" }, h("span", { class: "nostr-eq small" }, h("i"), h("i"), h("i")), "Waiting for approval…"))
      await c.done
      pendingConnect = null
      done()
    } catch (err) {
      pendingConnect = null
      const msg = String(err && err.message || err)
      if (/Cancelled/.test(msg)) return
      put(qrBox, h("div", { class: "nostr-qr-wait" }, icon("qr", "nostr-ico big")))
      put(qrSide, h("p", { class: "nostr-note", text: /Expired/.test(msg) ? "The QR code expired." : msg }), button("New QR code", startQr, "primary small", "qr"))
    }
  }
  const qrCard = h("div", { class: "nostr-login-main" }, qrBox, qrSide)
  startQr()

  // --- extension + bunker
  const extBtn = button(Auth.hasNip07() ? "Use browser extension" : "Browser extension", async () => {
    status.textContent = "Waiting for your extension…"
    extBtn.disabled = true
    try { await Auth.loginNip07(); done() } catch (err) { fail(err) } finally { extBtn.disabled = false }
  }, "quiet", "puzzle")
  const bunker = h("input", { class: "nostr-input", type: "text", placeholder: "bunker://…  or  name@domain", autocomplete: "off", spellcheck: "false" })
  const bunkerBtn = button("Connect", async () => {
    status.textContent = "Approve the connection in your signer…"
    bunkerBtn.disabled = true
    try { await Auth.loginNip46(bunker.value); done() } catch (err) { fail(err) } finally { bunkerBtn.disabled = false }
  }, "primary small", "key")
  const bunkerRow = h("div", { class: "nostr-connect-row nostr-bunker", hidden: true }, bunker, bunkerBtn)
  const bunkerToggle = button("Bunker link", () => { bunkerRow.hidden = !bunkerRow.hidden; if (!bunkerRow.hidden) bunker.focus() }, "quiet", "key")
  const alt = h("div", { class: "nostr-login-alt" },
    h("span", { class: "nostr-note", text: "Or use" }), extBtn, bunkerToggle)

  return h("div", { class: "nostr-methods" }, qrCard, alt, bunkerRow, status)
}

function renderLogin(body) {
  body.append(h("div", { class: "nostr-login-head" },
    h("span", { class: "nostr-logo-glow small" }, h("img", { src: "/img/nostr_purple.svg", alt: "Nostr", class: "nostr-logo-big" })),
    h("div", {},
      h("h2", { class: "nostr-hero-title", text: "Sign in to Nostr" }),
      h("p", { class: "nostr-hero-text", text: "Share favorites, follow listeners, tune in. FONY never sees your private key." }))))
  body.append(loginMethods(() => { guest = false; render(); updateWho() }))
  body.append(h("div", { class: "nostr-actions center" },
    button("Browse without an account", () => { guest = true; try { sessionStorage.setItem(GUEST_KEY, "1") } catch (_) {} render() }, "ghost")))
}

// A small "sign in" prompt used inside tabs when the user is browsing as a guest
function signInCard(message) {
  return h("div", { class: "nostr-signin" }, h("p", { text: message }),
    button("Sign in", () => { guest = false; try { sessionStorage.removeItem(GUEST_KEY) } catch (_) {} render() }, "primary small"))
}

// ---------------------------------------------------------------- list / station rows

function listRow(list, profile, { mine = false, badge = "" } = {}) {
  const genres = [...new Set(list.stations.map(x => x.genre).filter(Boolean))].slice(0, 2).join(", ")
  const sub = [mine ? "You" : displayName(profile, list.pubkey), plural(list.stations.length, "station", "stations"), genres, ago(list.createdAt)].filter(Boolean).join(" · ")
  return h("button", { class: "nostr-row", type: "button", onclick: () => openList(list) },
    cover(list, 44),
    h("span", { class: "nostr-row-main" },
      h("span", { class: "nostr-row-title", text: list.title }),
      h("span", { class: "nostr-row-sub", text: sub })),
    badge ? h("span", { class: "nostr-badge", text: badge }) : null)
}

// genre icon, replaced by the station logo once it is loaded. Only when "Station icons" is on in Settings.
function stationIcon(item, size = 34) {
  if (!stationLogosEnabled()) return null
  const st = Fav.toPlayerStation(item)
  if (!st) return null
  const box = createGenreAvatar(item.genre || "World", size, Math.round(size * 0.55))
  box.classList.add("nostr-sicon")
  const cached = getFavLogo(st.url)
  if (cached) applyAvatarLogo(box, cached)
  else ensureFavLogo(st, logo => { if (box.isConnected) applyAvatarLogo(box, logo) })
  return box
}

function stationRow(item, { count = 0, who = "", siblings = null } = {}) {
  const meta = [item.genre, who, count > 1 ? `in ${count} lists` : ""].filter(Boolean).join(" · ")
  const row = h("div", { class: "nostr-row static", "data-key": F.stationKey(item.url) },
    stationIcon(item),
    h("span", { class: "nostr-row-main" },
      h("span", { class: "nostr-row-title", text: item.name }),
      meta ? h("span", { class: "nostr-row-sub", text: meta }) : null),
    iconBtn("play", "Tune In", () => playInPlace(item, who, siblings || [item]), "primary"),
    iconBtn("plus", "Add to Favorites", () => {
      try {
        const r = Fav.importStations([item])
        toast(r.added ? "Added to Favorites" : "Already in Favorites")
      } catch (err) { toast(String(err.message || err)) }
    }))
  return playOnClick(row, () => playInPlace(item, who, siblings || [item]))
}

// ---------------------------------------------------------------- playback

function setStationsVisible(on) {
  if (ctx && ctx.listEl) ctx.listEl.classList.toggle("hidden", !on)
}

// Play a station without leaving the current list. The visible stations become the play queue,
// so next / previous move through them, and the playing row is highlighted.
function playInPlace(item, who = "", siblings = [item]) {
  if (!ctx) return
  const items = siblings.some(x => F.stationKey(x.url) === F.stationKey(item.url)) ? siblings : [item, ...siblings]
  const stations = items.map(Fav.toPlayerStation).filter(Boolean)
  const idx = stations.findIndex(st => F.stationKey(st.originalUrl) === F.stationKey(item.url))
  if (idx < 0) { toast("That station cannot be played"); return }
  Fav.rememberStations(items)
  ctx.setPlaylist(stations)
  ctx.play(idx)
  markPlaying(item.url)
}

function markPlaying(url) {
  if (!view) return
  const key = url ? F.stationKey(url) : ""
  for (const row of view.querySelectorAll(".nostr-row[data-key]")) row.classList.toggle("playing", !!key && row.dataset.key === key)
}

function tuneStation(item, who = "") {
  if (!ctx) return
  const st = Fav.toPlayerStation(item)
  if (!st) { toast("That station cannot be played"); return }
  sub = { type: "tuned", item, who }
  render()
}

// ---------------------------------------------------------------- tab views
// Design rule: one level of surface. Sections are headings + plain rows; no cards inside cards.

async function renderFollowing(body, my) {
  const session = Auth.getSession()
  body.append(sectionTitle("", "Listening now"))
  const listening = h("div", { class: "nostr-section" })
  body.append(listening)

  const loadListening = async () => {
    if (!session) {
      put(listening, signInCard("Sign in to see what the people you follow are listening to."))
      return
    }
    if (!listening.childElementCount) put(listening, loader("Checking who is listening…"))
    try {
      const follows = await getFollows(session.pubkey)
      if (stale(my)) return
      if (!follows.length) {
        put(listening, emptyBox("You don't follow anyone on Nostr yet."))
        return
      }
      const items = await Disc.fetchFollowingListening(follows)
      const profiles = await getProfiles(items.map(i => i.pubkey))
      if (stale(my)) return
      if (!items.length) {
        put(listening, emptyBox("Nobody you follow is sharing what they listen to right now. They need “Now listening” switched on in their Profile.", button("Refresh", () => { put(listening); loadListening() }, "quiet small")))
        return
      }
      put(listening, items.map(it => {
        const p = profiles.get(it.pubkey)
        const name = displayName(p, it.pubkey)
        const card = h("div", { class: "nostr-row static", "data-key": it.station ? F.stationKey(it.station.url) : "" },
          h("span", { class: "nostr-live-ring" }, avatar(p, it.pubkey, 36)),
          h("span", { class: "nostr-row-main" },
            h("span", { class: "nostr-row-title", text: name }),
            h("span", { class: "nostr-row-sub", text: it.station ? (it.track ? `${it.track} — ${it.station.name}` : it.station.name) : it.content })),
          it.station ? iconBtn("play", "Tune In", () => playInPlace(it.station, name, items.filter(x => x.station).map(x => x.station)), "primary") : null)
        return it.station ? playOnClick(card, () => playInPlace(it.station, name, items.filter(x => x.station).map(x => x.station))) : card
      }))
    } catch (err) {
      if (stale(my)) return
      put(listening, errorBox("Could not reach your relays.", () => { put(listening); loadListening() }))
    }
  }
  loadListening()
  clearInterval(listeningTimer)
  listeningTimer = setInterval(() => { if (!document.hidden && !stale(my)) loadListening() }, LISTENING_REFRESH)

  body.append(sectionTitle("", "Followed playlists"))
  const followedBox = h("div", { class: "nostr-section" })
  body.append(followedBox)
  const paintFollowed = async (all) => {
    if (!all.length) {
      put(followedBox, emptyBox("Open a shared list and press Follow to get its updates here."))
      return
    }
    const profiles = await getProfiles(all.map(f => f.pubkey))
    if (stale(my)) return
    put(followedBox, all.map(f => {
      const p = profiles.get(f.pubkey)
      // the cached copy of the list has the stations, so the cover looks the same as everywhere else
      const fake = Lists.getCachedList(f.ref) || { id: f.id, stations: [], title: f.title, pubkey: f.pubkey, createdAt: f.latestAt }
      return h("div", { class: "nostr-row-wrap" },
        h("button", { class: "nostr-row", type: "button", onclick: () => openList({ pubkey: f.pubkey, id: f.id }) },
          cover(fake, 40),
          h("span", { class: "nostr-row-main" },
            h("span", { class: "nostr-row-title", text: f.title }),
            h("span", { class: "nostr-row-sub", text: [displayName(p, f.pubkey), plural(f.count, "station", "stations")].join(" · ") })),
          Lists.hasUpdate(f) ? h("span", { class: "nostr-badge", text: "New" }) : null),
        h("button", { class: "nostr-x", type: "button", title: "Unfollow", "aria-label": "Unfollow playlist",
          onclick: () => { Lists.unfollowList(f.ref); paintFollowed(Lists.getFollowedLists()) }, text: "×" }))
    }))
  }
  await paintFollowed(Lists.getFollowedLists())
  if (stale(my)) return
  Lists.refreshFollowedLists().then(all => { if (!stale(my)) paintFollowed(all) }).catch(() => {})
}

async function renderShared(body, my) {
  const session = Auth.getSession()
  body.append(sectionTitle("", "Shared favorites"))
  const box = h("div", { class: "nostr-section" })
  body.append(box)
  if (!session) {
    put(box, signInCard("Sign in to see favorites shared by you and the people you follow."))
    return
  }
  put(box, loader("Looking for shared favorites…"))
  try {
    const follows = await getFollows(session.pubkey)
    const authors = [session.pubkey, ...follows.slice(0, 300)]
    const lists = await Lists.fetchListsByAuthors(authors, { limit: 150 })
    const profiles = await getProfiles(lists.map(l => l.pubkey))
    if (stale(my)) return
    const shown = lists.filter(l => l.stations.length)
    if (!shown.length) {
      put(box, emptyBox("Nobody you follow has shared favorites yet.",
        button("Share your Favorites", () => openShareDialog(), "primary small")))
      return
    }
    put(box, shown.map(l => listRow(l, profiles.get(l.pubkey), { mine: l.pubkey === session.pubkey, badge: l.pubkey === session.pubkey ? "You" : "" })))
  } catch (err) {
    if (stale(my)) return
    put(box, errorBox("Could not load shared favorites.", () => render()))
  }
}

async function renderDiscover(body, my) {
  const box = h("div", { class: "nostr-section" }, loader("Searching relays…"))
  if (discoverQuery) body.append(h("p", { class: "nostr-hint", text: `Results for “${discoverQuery}”` }))
  body.append(box)
  try {
    const { lists, stations, live, people } = await Disc.discover(discoverQuery)
    const playing = Disc.liveStations(live)
    const shownPeople = people.slice(0, 8)
    const profiles = await getProfiles([...lists.map(l => l.pubkey), ...shownPeople.map(p => p.pubkey), ...live.map(s => s.pubkey)])
    if (stale(my)) return
    put(box)
    if (!lists.length && !stations.length && !live.length && !people.length) {
      box.append(errorBox(discoverQuery ? "Nothing found. Try another word, or paste an npub." : "Nothing from FONY was found on your relays yet.", () => render()))
      return
    }
    const nameOf = (pk) => displayName(profiles.get(pk), pk)

    // people who are active in FONY through Nostr, newest first
    if (shownPeople.length) {
      box.append(sectionTitle("", "New on FONY"), ...shownPeople.map(p => {
        const pr = profiles.get(p.pubkey)
        const line = p.what === "live" ? `listening to ${p.station.name}` : p.what === "list" ? `shared “${p.title}” · ${ago(p.at)}` : `posted from FONY · ${ago(p.at)}`
        return h("button", { class: "nostr-row", type: "button", onclick: () => openUser(p.pubkey) },
          h("span", { class: p.what === "live" ? "nostr-live-ring" : "" }, avatar(pr, p.pubkey, 36)),
          h("span", { class: "nostr-row-main" },
            h("span", { class: "nostr-row-title", text: displayName(pr, p.pubkey) }),
            h("span", { class: "nostr-row-sub", text: line })))
      }))
    }

    // what is being played through FONY right now (by anyone)
    if (playing.length) {
      const shown = playing.slice(0, 12)
      const queue = shown.map(x => x.station)
      box.append(sectionTitle("", "Playing now"), ...shown.map(x => {
        const names = x.who.map(nameOf)
        const who = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")
        return stationRow(x.station, { who, siblings: queue })
      }))
    }

    if (lists.length) box.append(sectionTitle("", discoverQuery ? "Lists" : "Newest lists"), ...lists.slice(0, 40).map(l => listRow(l, profiles.get(l.pubkey))))

    // popular stations: only in a search, or while nobody is playing anything
    if (stations.length && (discoverQuery || !playing.length)) {
      const shown = stations.slice(0, discoverQuery ? 30 : 12)
      const queue = shown.map(s => s.station)
      box.append(sectionTitle("", discoverQuery ? "Stations" : "Popular stations"),
        ...shown.map(s => stationRow(s.station, { count: s.count, siblings: queue })))
    }
    markPlaying(window.currentStationUrl && F.unwrapProxyUrl(window.currentStationUrl))
  } catch (err) {
    if (stale(my)) return
    put(box, errorBox("Could not reach your relays.", () => render()))
  }
}

function relayEditor() {
  const box = h("div", { class: "nostr-relays" })
  const paint = () => {
    const rows = Client.relayStatuses().map(r => h("div", { class: "nostr-relay" },
      h("span", { class: "nostr-dot " + r.status, title: r.status }),
      h("span", { class: "nostr-relay-url", text: r.url }),
      h("button", { class: "nostr-x static", type: "button", "aria-label": "Remove relay", text: "×",
        onclick: () => { Client.setRelays(Client.getRelays().filter(u => u !== r.url)); paint() } })))
    const input = h("input", { class: "nostr-input", type: "text", placeholder: "wss://relay.example.com", autocomplete: "off", spellcheck: "false" })
    const msg = h("p", { class: "nostr-status" })
    const add = () => {
      const url = F.normalizeRelayUrl(input.value)
      if (!url) { msg.textContent = "Enter a secure relay address (wss://…)"; return }
      Client.setRelays([...Client.getRelays(), url])
      paint()
    }
    input.addEventListener("keydown", e => { if (e.key === "Enter") add() })
    put(box, rows,
      h("div", { class: "nostr-connect-row" }, input, button("Add", add, "small")),
      msg,
      button("Reset to defaults", () => { Client.resetRelays(); paint() }, "quiet small"))
  }
  paint()
  return box
}

// avatar + name + small line, the one header style used for profiles
function personHead(p, pubkey, sub, ...right) {
  return h("div", { class: "nostr-person" },
    avatar(p, pubkey, 48),
    h("div", { class: "nostr-row-main" },
      h("span", { class: "nostr-person-name", text: displayName(p, pubkey) }),
      sub ? h("span", { class: "nostr-row-sub" }, sub) : null),
    ...right)
}

function copyNpubButton(npub) {
  return h("button", { class: "nostr-ib mini", type: "button", title: "Copy npub", "aria-label": "Copy npub", onclick: async () => toast(await copyText(npub) ? "npub copied" : "Could not copy") }, icon("copy", "nostr-ico sm"))
}

// the profile in Primal, in a new tab (the npub is bech32, so it is safe to put into the address)
function primalLink(npub) {
  return h("a", { class: "nostr-ib mini", href: `https://primal.net/p/${npub}`, target: "_blank", rel: "noopener noreferrer", title: "Open in Primal", "aria-label": "Open in Primal" }, icon("ext", "nostr-ico sm"))
}

// one line of a settings-like list: icon | title + short status | control
function settingRow(iconName, title, sub, ...controls) {
  return h("div", { class: "nostr-set" },
    h("span", { class: "nostr-set-ico" }, icon(iconName)),
    h("span", { class: "nostr-row-main" },
      h("span", { class: "nostr-row-title", text: title }),
      sub ? h("span", { class: "nostr-row-sub" }, sub) : null),
    h("span", { class: "nostr-set-ctl" }, ...controls))
}

// on / off switch
function toggle(checked, onchange, label, id) {
  const input = h("input", { type: "checkbox", "aria-label": label, id })
  input.checked = checked
  input.addEventListener("change", () => onchange(input.checked))
  return h("label", { class: "nostr-sw" }, input, h("span", { class: "nostr-sw-track" }))
}

function statLine(iconName, text) {
  return h("span", { class: "nostr-stat-line" }, icon(iconName, "nostr-ico sm"), text)
}

async function renderProfile(body, my) {
  const session = Auth.getSession()
  if (!session) {
    body.append(signInCard("Sign in to publish your favorites, follow people and back up your data."))
    body.append(h("details", { class: "nostr-more" }, h("summary", { text: "Relays" }), relayEditor()))
    return
  }

  // header: who you are
  const head = h("div", { class: "nostr-section" }, loader(""))
  body.append(head)
  Promise.all([getProfiles([session.pubkey], { force: true }), Lists.npubOf(session.pubkey), getFollows(session.pubkey).catch(() => [])]).then(([profiles, npub, follows]) => {
    if (stale(my)) return
    const p = profiles.get(session.pubkey)
    put(head,
      personHead(p, session.pubkey,
        [`${npub.slice(0, 12)}…${npub.slice(-4)}`, copyNpubButton(npub), primalLink(npub)],
        iconBtn("logout", "Log out", async () => { await Auth.logout(); toast("Disconnected"); render(); updateWho() })),
      h("div", { class: "nostr-stat-row" },
        statLine("users", `${follows.length} following`),
        statLine("list", plural(Lists.getFollowedLists().length, "playlist", "playlists"))))
  }).catch(() => { if (!stale(my)) put(head, errorBox("Could not load your profile.", () => render())) })

  // shared favorites
  const share = h("div", { class: "nostr-section" })
  body.append(sectionTitle("", "Favorites"), share)
  const paintShare = async () => {
    const sess = Auth.getSession()
    if (sess) await Lists.adoptRemote(sess.pubkey)
    let local = null
    try { local = await Fav.getShareableFavorites(ctx.getFavoriteStations) } catch (_) {}
    if (stale(my)) return
    const state = sess && local ? Lists.syncState(sess.pubkey, local) : null
    if (!state || !state.published) {
      put(share, settingRow("share", "Share my favorites", local ? plural(local.length, "station", "stations") : "",
        button("Share", () => openShareDialog(), "primary small")))
      return
    }
    const dot = h("span", { class: "nostr-state-dot " + (state.inSync ? "ok" : "warn") })
    const elsewhere = !!state.meta.adopted
    const cached = elsewhere ? Lists.getCachedList(`${F.KIND_LIST}:${sess.pubkey}:${F.DEFAULT_LIST_ID}`) : null
    put(share,
      settingRow("share", "Shared favorites",
        [dot, `${plural(state.meta.count, "station", "stations")} · ${elsewhere ? "found on your relays" : (state.inSync ? "up to date" : "changes not shared")}`],
        elsewhere && cached ? labelBtn("down", "Import", () => {
          try { const r = Fav.importStations(cached.stations); toast(r.added ? `Added ${plural(r.added, "station", "stations")} to Favorites` : "All of these are already in your Favorites") } catch (err) { toast(String(err.message || err)) }
        }) : null,
        labelBtn("refresh", "Update", () => openShareDialog()),
        labelBtn("list", "Open", () => openList({ pubkey: sess.pubkey, id: F.DEFAULT_LIST_ID })),
        labelBtn("trash", "Unshare", async () => { try { if (await unshareFlow()) render() } catch (err) { toast(String(err.message || err)) } })),
      settingRow("refresh", "Auto-update", elsewhere ? "starts after you press Update here" : "after sign-in, every few hours",
        toggle(AutoSync.isAutoShare(), on => AutoSync.setAutoShare(on), "Keep the shared list up to date automatically")))
  }
  paintShare()

  // now listening
  const presence = h("div", { class: "nostr-section" })
  body.append(sectionTitle("", "Listening"), presence)
  const paintPresence = () => {
    if (stale(my)) return
    const st = Pres.getPresenceState()
    const on = Pres.isPresenceEnabled()
    const sub = { off: "off", idle: "on", live: [h("span", { class: "nostr-state-dot ok" }), st.message || "live"], login: "sign in first", error: "could not publish" }[st.state] || ""
    put(presence,
      settingRow("live", "Now listening", sub,
        toggle(on, v => { Pres.setPresenceEnabled(v); paintPresence() }, "Show what I'm listening to")),
      on ? settingRow("feed", "Post to my feed", "new station, max every 20 min",
        toggle(Pres.isNoteEnabled(), v => Pres.setNoteEnabled(v), "Also post it to my feed")) : null)
  }
  paintPresence()
  const off = Pres.onPresenceState(() => { if (stale(my)) off(); else paintPresence() })

  // backup: encrypted copy of Favorites, playlists and settings on the relays
  const backup = h("div", { class: "nostr-section" })
  const backupMsg = h("p", { class: "nostr-hint nostr-status" })
  const bBtn = labelBtn("up", "Backup", () => {}, "is-action")
  const rBtn = labelBtn("down", "Restore", () => {}, "is-action")
  bindBackup({ backupBtn: bBtn, restoreBtn: rBtn, say: t => { backupMsg.textContent = t } })
  put(backup,
    settingRow("cloud", "Nostr backup", "encrypted, on your relays", bBtn, rBtn),
    settingRow("clock", "Auto backup", "daily, only if something changed",
      toggle(AutoSync.isAutoBackup(), v => AutoSync.setAutoBackup(v), "Back up to Nostr automatically once a day")),
    backupMsg)
  body.append(sectionTitle("", "Backup"), backup)

  // relays are tucked away
  body.append(h("details", { class: "nostr-more" }, h("summary", {}, icon("gear", "nostr-ico sm"), "Relays"), relayEditor()))
}

// ----- drill-in views

function backBar(title) {
  return h("div", { class: "nostr-back" },
    h("button", { class: "nostr-back-btn", type: "button", onclick: () => { sub = null; render() } }, icon("back", "nostr-ico sm"), title || "Back"))
}

async function renderSub(body, my) {
  if (sub.type === "tuned") return renderTuned(body, my)
  if (sub.type === "user") return renderUser(body, my)
  return renderList(body, my)
}

function renderTuned(body, my) {
  const { item, who } = sub
  const st = Fav.toPlayerStation(item)
  body.append(backBar("Back"),
    h("div", { class: "nostr-tuned" },
      h("span", { class: "nostr-eq" }, h("i"), h("i"), h("i"), h("i")),
      h("div", { class: "nostr-person-name", text: item.name }),
      h("div", { class: "nostr-row-sub", text: who ? `Listening along with ${who}` : item.genre || "" }),
      h("div", { class: "nostr-actions center" },
        button("Add to Favorites", () => {
          try { toast(Fav.importStations([item]).added ? "Added to Favorites" : "Already in Favorites") } catch (err) { toast(String(err.message || err)) }
        }, "quiet small"))))
  Fav.rememberStations([item])
  ctx.setPlaylist([st])
  setStationsVisible(true)
  ctx.play(0)
}

async function renderUser(body, my) {
  const { pubkey } = sub
  body.append(backBar("Back"))
  const head = h("div", { class: "nostr-section" }, loader())
  const box = h("div", { class: "nostr-section" })
  body.append(head, box)
  try {
    const [profiles, npub, lists, statuses] = await Promise.all([
      getProfiles([pubkey]), Lists.npubOf(pubkey), Lists.fetchListsByAuthors([pubkey], { limit: 50 }),
      Disc.fetchFollowingListening([pubkey]).catch(() => [])
    ])
    if (stale(my)) return
    const p = profiles.get(pubkey)
    const live = statuses[0] && statuses[0].station ? statuses[0].station : null
    const session = Auth.getSession()
    // follow / unfollow on Nostr itself (the account's real follow list)
    let followBtn = null
    if (session && session.pubkey !== pubkey) {   // nobody follows themselves: no button on your own profile
      let following = false
      try { following = (await getFollows(session.pubkey)).includes(pubkey) } catch (_) {}
      if (stale(my)) return
      followBtn = button(following ? "Following" : "Follow", async () => {
        followBtn.disabled = true
        const was = following
        followBtn.querySelector("span, :scope")
        try {
          if (was) {
            const sure = await confirmDialog({ title: "Unfollow on Nostr?", text: `${displayName(p, pubkey)} will be removed from your follow list on Nostr (in every Nostr app).`, okLabel: "Unfollow" })
            if (!sure) return
          }
          followBtn.textContent = "Working…"
          const r = was ? await unfollowAccount(pubkey) : await followAccount(pubkey)
          following = r.following
          toast(following ? `You now follow ${displayName(p, pubkey)} on Nostr` : "Unfollowed")
        } catch (err) {
          toast(String(err.message || err))
        } finally {
          followBtn.disabled = false
          followBtn.textContent = following ? "Following" : "Follow"
          followBtn.classList.toggle("primary", !following)
        }
      }, following ? "small" : "primary small")
    }
    put(head,
      personHead(p, pubkey, [`${npub.slice(0, 14)}…${npub.slice(-4)}`, copyNpubButton(npub), primalLink(npub)], followBtn),
      p && p.about ? h("p", { class: "nostr-hint", text: p.about }) : null,
      live ? h("div", { class: "nostr-row static" },
        h("span", { class: "nostr-row-main" }, h("span", { class: "nostr-row-sub", text: "Listening now" }), h("span", { class: "nostr-row-title", text: live.name })),
        iconBtn("play", "Tune In", () => tuneStation(live, displayName(p, pubkey)), "primary")) : null)
    box.append(sectionTitle("", "Shared favorites"))
    if (!lists.length) box.append(emptyBox("No shared favorites from this account."))
    else box.append(...lists.map(l => listRow(l, p)))
  } catch (err) {
    if (stale(my)) return
    put(head, errorBox("Could not load this profile.", () => render()))
  }
}

async function renderList(body, my) {
  const ref = sub.ref
  const key = `${F.KIND_LIST}:${ref.pubkey}:${F.cleanListId(ref.id)}`
  body.append(backBar("Back"))
  const head = h("div", { class: "nostr-list-head" })
  body.append(head)

  let list = Lists.getCachedList(key)
  const session = Auth.getSession()

  const paint = async (l, refreshing) => {
    const profiles = await getProfiles([l.pubkey])
    if (stale(my)) return
    const p = profiles.get(l.pubkey)
    const mine = !!session && session.pubkey === l.pubkey
    const following = Lists.isFollowing(l.ref)
    if (following && !refreshing) Lists.markSeen(l)
    const followBtn = following
      ? button("Following", () => { Lists.unfollowList(l.ref); toast("Unfollowed"); paint(l, false) }, "quiet small", "bell")
      : button("Follow", () => { Lists.followList(l); toast("You will see updates in Following"); paint(l, false) }, "quiet small", "bell")
    put(head,
      h("div", { class: "nostr-list-top" }, cover(l, 56),
        h("div", { class: "nostr-row-main" },
          h("span", { class: "nostr-person-name", text: l.title }),
          h("button", { class: "nostr-link", type: "button", text: `${mine ? "You" : displayName(p, l.pubkey)} · ${plural(l.stations.length, "station", "stations")} · ${ago(l.createdAt)}`, onclick: () => { sub = { type: "user", pubkey: l.pubkey }; render() } }))),
      l.description ? h("p", { class: "nostr-hint", text: l.description }) : null,
      refreshing ? h("p", { class: "nostr-hint", text: "Checking for the latest version…" }) : null,
      h("div", { class: "nostr-actions" },
        button("Tune In", () => { if (ctx.getCurrentLength()) ctx.play(Math.floor(Math.random() * ctx.getCurrentLength())) }, "primary small", "play"),
        button("Import all", () => {
          try {
            const r = Fav.importStations(l.stations)
            toast(r.added ? `Added ${plural(r.added, "station", "stations")} to Favorites${r.skipped ? ` · ${r.skipped} already there` : ""}` : "All of these are already in your Favorites")
          } catch (err) { toast(String(err.message || err)) }
        }, "small", "down"),
        followBtn,
        button("Link", async () => toast(await copyText(await Lists.listLink(l)) ? "Link copied" : "Could not copy"), "quiet small", "link"),
        mine ? button("Update", () => openShareDialog(), "quiet small") : null))
    if (!stale(my)) {
      const stations = l.stations.map(Fav.toPlayerStation).filter(Boolean)
      Fav.rememberStations(l.stations)
      window.__nostrSrc = { pubkey: l.pubkey, id: l.id }
      ctx.setPlaylist(stations)
      setStationsVisible(true)
      if (pendingResume) {
        const want = F.stationKey(pendingResume)
        pendingResume = null
        const idx = stations.findIndex(st => F.stationKey(st.originalUrl) === want)
        if (idx >= 0) ctx.play(idx)
      }
    }
  }

  if (list) await paint(list, true)
  else head.append(loader("Opening list…"))
  let fresh = null
  try { fresh = await Disc.openList(ref) } catch (_) {}
  if (stale(my)) return
  if (fresh && (!list || fresh.createdAt > list.createdAt || list.cached)) {
    const updated = list && fresh.createdAt > list.createdAt
    list = fresh
    await paint(list, false)
    if (updated) toast("This list was updated")
  } else if (list) {
    await paint(list, false)
  } else {
    put(head, errorBox("That list was not found on your relays. It may have been removed, or it lives on a relay that is not in your relay list.", () => render()))
  }
}

// ---------------------------------------------------------------- navigation

function tabsBar() {
  const bar = h("div", { class: "nostr-tabs", role: "tablist" })
  for (const t of TABS) {
    const on = !sub && tab === t.id
    bar.append(h("button", {
      class: "nostr-tab" + (on ? " active" : ""),
      type: "button", role: "tab", "aria-selected": String(on),
      onclick: () => { tab = t.id; sub = null; try { localStorage.setItem(TAB_KEY, tab) } catch (_) {} render() }
    }, icon(t.icon, "nostr-ico"), h("span", { text: t.label })))
  }
  return bar
}

function needsLogin() {
  return !Auth.isLoggedIn() && !guest && !sub
}

let pendingResume = null   // station to start once its list is loaded (after a reload)

function render() {
  if (!active || !view) return
  window.__nostrSrc = null   // set again by an open list
  const my = ++token
  clearInterval(listeningTimer)
  setStationsVisible(false)
  if (ctx.scroller) ctx.scroller.scrollTop = 0
  const body = h("div", { class: "nostr-body" })
  if (needsLogin()) {
    put(view, body)
    renderLogin(body)
    return
  }
  put(view, tabsBar(), body)
  if (sub) { renderSub(body, my); return }
  const fn = { following: renderFollowing, shared: renderShared, discover: renderDiscover, profile: renderProfile }[tab]
  fn(body, my)
}

function openUser(pubkey) {
  sub = { type: "user", pubkey }
  render()
}

export function openList(ref) {
  sub = { type: "list", ref: { pubkey: ref.pubkey, id: ref.id, relays: ref.relays || [] } }
  render()
}

// Handles whatever the user pasted or whatever the URL hash carried.
export async function openInput(raw) {
  const parsed = await Disc.parseInput(raw)
  if (!active) return
  switch (parsed.type) {
    case "empty": discoverQuery = ""; tab = "discover"; sub = null; render(); break
    case "profile": sub = { type: "user", pubkey: parsed.pubkey }; render(); break
    case "list": openList(parsed); break
    case "tune": tuneStation(parsed.station); break
    case "text": discoverQuery = parsed.text; tab = "discover"; sub = null; guest = guest || !Auth.isLoggedIn(); render(); break
    default: toast(parsed.message || "Could not understand that link")
  }
}

function hashToInput(hash) {
  const m = String(hash || "").match(/^#?\/?nostr\/(.+)$/)
  return m ? m[1] : ""
}

export function isNostrHash(hash = location.hash) {
  return /^#?\/?nostr\//.test(String(hash || ""))
}

// ---------------------------------------------------------------- who is signed in (header)

async function updateWho() {
  const slot = document.getElementById("nostrWho")
  if (!slot) return
  const s = Auth.getSession()
  if (!s) { put(slot); slot.classList.remove("on"); return }
  slot.classList.add("on")
  put(slot, avatar(null, s.pubkey, 22), h("span", { class: "nostr-who-name", text: F.shortKey(s.pubkey) }))
  try {
    const p = await getProfiles([s.pubkey]).then(m => m.get(s.pubkey))
    const now = document.getElementById("nostrWho")
    if (!now || !Auth.getSession()) return
    put(now, avatar(p, s.pubkey, 22), h("span", { class: "nostr-who-name", text: displayName(p, s.pubkey) }))
  } catch (_) {}
}

// ---------------------------------------------------------------- mode lifecycle

function wireSearch() {
  const input = document.getElementById("searchInput")
  const clear = document.getElementById("clearSearch")
  if (!input) return
  const go = () => {
    clear && (clear.style.display = input.value ? "block" : "none")
    openInput(input.value.trim())
  }
  input.addEventListener("input", () => {
    clear && (clear.style.display = input.value ? "block" : "none")
    clearTimeout(searchTimer)
    searchTimer = setTimeout(go, 450)
  })
  input.addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(searchTimer); go() } })
  if (clear) clear.addEventListener("click", () => { input.value = ""; go() })
}

// `context`: { listEl, scroller, setPlaylist(stations), play(i), getCurrentLength(),
//              getFavoriteStations(), exit() }
// `route`: { input } a pasted link / npub / naddr, or { tab }, or { login: true } to force the sign-in screen
export function enterNostrMode(context, route = {}) {
  ctx = context
  active = true
  if (view) { view.remove(); view = null }
  document.body.classList.add("nostr-mode")

  const g = document.querySelector(".genre-box")
  if (g) {
    put(g,
      h("span", { id: "nostrModeLabel" }, h("img", { src: "/img/nostr.svg", alt: "", class: "nostr-label-ico" }), "Nostr",
        h("button", { id: "nostrWho", class: "nostr-who", type: "button", title: "Your Nostr profile", onclick: () => { if (Auth.isLoggedIn()) { tab = "profile"; sub = null; render() } } })),
      h("div", { class: "search-wrapper" },
        h("input", { type: "text", id: "searchInput", class: "genre-search", placeholder: "Search, or paste npub / naddr / link", autocomplete: "off", spellcheck: "false" }),
        h("span", { id: "clearSearch", text: "×" })),
      h("img", { src: "/img/radio.svg", alt: "Radio", id: "radioModeBtn", style: "cursor: pointer; width: 28px; height: 28px; display: inline-block;" }))
    document.getElementById("radioModeBtn").addEventListener("click", () => ctx.exit())
    wireSearch()
  }

  const audio = document.getElementById("audioPlayer")
  if (audio && !audio.dataset.nostrMark) {
    audio.dataset.nostrMark = "1"
    audio.addEventListener("play", () => { if (active) markPlaying(window.currentStationUrl && F.unwrapProxyUrl(window.currentStationUrl)) })
  }
  view = h("div", { id: "nostrView", class: "nostr-view" })
  ctx.listEl.parentNode.insertBefore(view, ctx.listEl)
  setStationsVisible(false)

  let saved = ""
  try { saved = localStorage.getItem(TAB_KEY) || "" } catch (_) {}
  tab = TABS.some(t => t.id === saved) ? saved : (Auth.isLoggedIn() ? "following" : "discover")
  sub = null
  discoverQuery = ""
  try { guest = sessionStorage.getItem(GUEST_KEY) === "1" } catch (_) { guest = false }
  // links are public content: open them without asking for a sign-in first
  if (route.input && !route.login) guest = true
  if (route.login) { guest = false; try { sessionStorage.removeItem(GUEST_KEY) } catch (_) {} }

  // the sign-in may still be restoring from storage
  const wasIn = Auth.isLoggedIn()
  Auth.restoreSession().catch(() => {}).finally(() => { if (active) { updateWho(); if (Auth.isLoggedIn() !== wasIn && !sub) render() } })
  render()
  updateWho()
  if (route.input) openInput(route.input)
  else if (route.tab && TABS.some(t => t.id === route.tab)) { tab = route.tab; render() }
  else if (route.restore) resumeLast()
}

// After a reload in Nostr mode: bring back the station that was playing (and its list).
function resumeLast() {
  let last = null
  try { last = JSON.parse(localStorage.getItem("fonyNostrLast") || "null") } catch (_) {}
  if (!last || typeof last.url !== "string") return
  const item = F.normalizeStation({ url: last.url, name: last.name, genre: last.genre })
  if (!item) return
  if (last.src && F.isHexKey(last.src.pubkey)) {
    pendingResume = item.url
    openList({ pubkey: last.src.pubkey, id: last.src.id })
  } else {
    playInPlace(item, "", [item])
  }
}

export function leaveNostrMode() {
  active = false
  token++
  clearInterval(listeningTimer)
  clearTimeout(searchTimer)
  if (pendingConnect) { pendingConnect.cancel(); pendingConnect = null }
  document.body.classList.remove("nostr-mode")
  if (view) { view.remove(); view = null }
  if (ctx && ctx.listEl) ctx.listEl.classList.remove("hidden")
}

export function isNostrActive() {
  return active
}

export function handleNostrHash(hash) {
  const input = hashToInput(hash)
  if (!input) return false
  if (active) { guest = true; openInput(input) }
  return true
}

// Called once at start-up (any mode): restores the sign-in silently and starts
// the opt-in "now listening" publisher.
export function initNostr() {
  if (wired) return
  wired = true
  Auth.restoreSession().catch(() => {})
  Auth.onAuthChange(() => { if (active) updateWho() })
  Pres.initPresence()
  AutoSync.initAutoSync(() => window.fonyGetFavoriteStations())
}

// ---------------------------------------------------------------- share dialog

export function openShareDialog(getStations) {
  const getFavs = getStations || (ctx && ctx.getFavoriteStations) || window.fonyGetFavoriteStations
  if (!getFavs) return
  if (!ctx) ctx = { getFavoriteStations: getFavs }
  const old = document.getElementById("nostrShareDialog")
  if (old) old.remove()

  const overlay = h("div", { id: "nostrShareDialog", class: "nostr-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Share Favorites on Nostr" })
  const box = h("div", { class: "nostr-dialog" })
  overlay.append(box)
  const close = () => { if (pendingConnect) { pendingConnect.cancel(); pendingConnect = null } overlay.remove(); document.removeEventListener("keydown", onKey) }
  const onKey = (e) => { if (e.key === "Escape") close() }
  document.addEventListener("keydown", onKey)
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close() })
  document.body.append(overlay)

  const paint = async () => {
    const session = Auth.getSession()
    // Favorites are resolved against all genre playlists, which can take a moment on a cold start
    put(box, h("button", { class: "nostr-close", type: "button", "aria-label": "Close", text: "×", onclick: close }), loader("Reading your Favorites…"))
    let stations = []
    let favError = ""
    if (session) await Lists.adoptRemote(session.pubkey)
    try { stations = await Fav.getShareableFavorites(getFavs) } catch (err) { favError = String(err && err.message || err) }
    const state = session ? Lists.syncState(session.pubkey, stations) : null
    const title = h("input", { class: "nostr-input", type: "text", maxlength: String(F.LIMITS.title), value: (state && state.meta && state.meta.title) || "My FONY favorites" })
    const desc = h("input", { class: "nostr-input", type: "text", maxlength: String(F.LIMITS.description), placeholder: "Description (optional)" })
    if (state && state.meta && state.meta.description) desc.value = state.meta.description
    const msg = h("p", { class: "nostr-status", role: "status" })
    const linkBox = h("div", { class: "nostr-linkbox" })
    let alsoPost = false

    const showLink = async (list) => {
      const link = await Lists.listLink(list)
      put(linkBox, h("code", { class: "nostr-npub", text: link }),
        iconBtn("copy", "Copy link", async () => toast(await copyText(link) ? "Link copied" : "Could not copy")),
        iconBtn("link", "Open the list", () => { close(); document.dispatchEvent(new CustomEvent("fony:nostr-open", { detail: { input: link } })) }))
    }
    if (state && state.published) showLink({ pubkey: session.pubkey, id: F.DEFAULT_LIST_ID }).catch(() => {})

    const publishBtn = button(state && state.published ? "Update" : "Share", async () => {
      publishBtn.disabled = true
      msg.textContent = "Checking your relays…"
      const steps = { note: "Posting a note to your feed…", relays: "Checking your relays…", sign: Auth.getSession()?.method === "nip46" ? "Approve the request in your signer app…" : "Approve the request in your extension…", publish: "Publishing to relays…" }
      try {
        const r = await Lists.shareFavorites({ stations, title: title.value, description: desc.value, onStep: (k) => { msg.textContent = steps[k] || "" }, alsoPost })
        msg.textContent = `${r.updated ? "Updated" : "Shared"} on ${plural(r.relays.ok.length, "relay", "relays")}${r.relays.failed.length ? `, ${r.relays.failed.length} did not respond` : ""}.` +
          (r.note ? (r.note.ok ? " Posted to your feed." : ` The feed note failed: ${r.note.error}`) : "")
        showLink(r.list)
        toast(r.updated ? "Shared Favorites updated" : "Favorites shared on Nostr")
        if (active && tab === "profile" && !sub) render()
      } catch (err) {
        msg.textContent = String(err && err.message || err)
      } finally {
        publishBtn.disabled = false
      }
    }, "primary", "share")

    const importInput = h("input", { class: "nostr-input", type: "text", placeholder: "Import: paste a link, naddr or npub", autocomplete: "off", spellcheck: "false" })
    const importGo = () => {
      const v = importInput.value.trim()
      if (!v) return
      close()
      document.dispatchEvent(new CustomEvent("fony:nostr-open", { detail: { input: v } }))
    }
    importInput.addEventListener("keydown", e => { if (e.key === "Enter") importGo() })

    const dot = h("span", { class: "nostr-state-dot " + (state && state.inSync ? "ok" : "warn") })
    const stat = h("div", { class: "nostr-stat-row" },
      statLine("heart", plural(stations.length, "station", "stations")),
      state && state.published ? h("span", { class: "nostr-stat-line" }, dot, state.meta.adopted ? "already on your relays (other device)" : state.inSync ? "up to date" : "changes not shared") : null,
      stations.skipped ? h("span", { class: "nostr-stat-line", title: "Their address cannot be shared" }, `${stations.skipped} left out`) : null)

    put(box,
      h("button", { class: "nostr-close", type: "button", "aria-label": "Close", text: "×", onclick: close }),
      h("h3", { class: "nostr-dialog-title" }, h("img", { src: "/img/nostr.svg", alt: "", class: "nostr-label-ico" }), "Share favorites"),
      !stations.length && session ? h("p", { class: "nostr-hint", text: favError ? `Could not read your Favorites: ${favError}` : "No shareable stations yet. Heart some stations first." }) : null,
      !session ? h("p", { class: "nostr-hint", text: "Sign in to share." }) : null,
      !session ? loginMethods(() => paint()) : null,
      session ? h("div", { class: "nostr-form" },
        stat, title, desc,
        settingRow("feed", "Post to my feed", "", toggle(false, v => { alsoPost = v }, "Also post a note about it to my feed", "nostrAlsoPost")),
        settingRow("refresh", "Auto-update", "", toggle(AutoSync.isAutoShare(), v => AutoSync.setAutoShare(v), "Keep the shared list up to date automatically", "nostrAutoShareDialog")),
        h("div", { class: "nostr-actions" }, stations.length ? publishBtn : null,
          state && state.published ? iconBtn("trash", "Unshare", async () => {
            try { if (await unshareFlow(t => { msg.textContent = t })) { put(linkBox); paint() } } catch (err) { msg.textContent = String(err.message || err) }
          }) : null),
        msg, linkBox) : null,
      h("div", { class: "nostr-import" }, importInput, iconBtn("down", "Open", importGo)))
  }
  paint()
}
