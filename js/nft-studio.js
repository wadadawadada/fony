// NFT studio: browse the NFTs made through FONY, connect a Tezos wallet, mint music NFTs.
// Opens over the player section like the games modal did (the games code stays in js/games*.js).

import * as Wallet from "./nft/wallet.js"
import * as Objkt from "./nft/objkt.js"
import * as Ipfs from "./nft/ipfs.js"
import { buildPlayerHtml } from "./nft/player.js"
import { mintRelease, mintAdapter } from "./nft/mint.js"
import { createCollection } from "./nft/collection.js"
import { pickLocal, localAvailable } from "./nft/local-picker.js"
import { ic } from "./nft/icons.js"
import { drawAbout } from "./nft/about.js"
import { isMember, refreshMembers } from "./nft/members.js"
import { loadDraft, saveDraft, clearDraft, DRAFT_TTL_MS } from "./nft/draft.js"

// The studio is loaded on demand (js/nft-loader.js) and unloaded again when it is closed, so the other modes
// of the app never carry it around in memory.
let studio = null
export function toggleStudio() {
  if (!studio) studio = init()
  studio.toggle()
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const AUDIO_EXT = /\.(mp3|flac|ogg|oga|opus|wav|m4a|aac|weba)$/i
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i
const isAudio = (f) => (f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name)
const isImage = (f) => (f.type || "").startsWith("image/") || IMAGE_EXT.test(f.name)
const MAX_TRACKS = 60
const COLLECTION_KEY = "fonyNftCollection"

function init() {
  let modal = null
  let unsubWallet = null
  let consoleWasOpen = false
  let tab = "gallery"
  let uid = 0

  // factory state
  const rel = { title: "", artist: "", description: "", editions: 1, royalties: 10, tags: [], cover: null }
  const tracks = []               // { id, audio: File, title, artist, dur }
  let collection = { address: "", id: null, status: "", ok: false }
  const newColl = { open: false, name: "", description: "", image: null, busy: false, msg: "", err: false }
  let collections = []
  let busy = false
  let lastResult = null

  // gallery state
  const gal = { mine: false, search: "", tokens: [], loading: false, error: "", done: false }

  const $ = (sel, root = modal) => root.querySelector(sel)

  // ------------------------------------------------------------ draft (survives a reload)

  let draftLoaded = false
  let draftTimer = null

  function draftSnapshot() {
    return {
      v: 1,
      savedAt: Date.now(),
      step: wizStep,
      rel: { title: rel.title, artist: rel.artist, description: rel.description, editions: rel.editions, royalties: rel.royalties, tags: rel.tags },
      cover: rel.cover,
      tracks: tracks.map(t => ({ id: t.id, audio: t.audio, title: t.title, artist: t.artist, dur: t.dur }))
    }
  }

  function saveDraftNow() {
    if (!rel.cover && !tracks.length && !rel.title.trim() && !rel.description.trim()) { clearDraft(); return }
    saveDraft(draftSnapshot())
  }

  function persist() {
    if (!draftLoaded) return
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      // nothing worth keeping: forget the draft instead of storing an empty one
      if (!rel.cover && !tracks.length && !rel.title.trim() && !rel.description.trim()) { clearDraft(); return }
      saveDraft({
        v: 1,
        savedAt: Date.now(),
        step: wizStep,
        rel: { title: rel.title, artist: rel.artist, description: rel.description, editions: rel.editions, royalties: rel.royalties, tags: rel.tags },
        cover: rel.cover,
        tracks: tracks.map(t => ({ id: t.id, audio: t.audio, title: t.title, artist: t.artist, dur: t.dur }))
      })
    }, 500)
  }

  async function restoreDraft() {
    const d = await loadDraft()
    draftLoaded = true
    if (!d || d.v !== 1) return
    // a draft is only kept for a while: files must not sit in the browser forever
    if (!d.savedAt || Date.now() - d.savedAt > DRAFT_TTL_MS) { clearDraft(); return }
    Object.assign(rel, d.rel || {})
    rel.cover = d.cover || null
    // older drafts kept the tags as one comma separated string
    if (!Array.isArray(rel.tags)) rel.tags = String(rel.tags || "").split(",").map(cleanTag).filter(Boolean)
    for (const t of d.tracks || []) {
      if (!t.audio) continue
      uid = Math.max(uid, t.id || 0)
      const track = { id: t.id || ++uid, audio: t.audio, title: t.title, artist: t.artist || "", dur: t.dur || null }
      tracks.push(track)
      if (!track.dur) probeDuration(track)
    }
    if (d.step) wizStep = d.step
    if (rel.cover || tracks.length) toast("Your draft was restored")
    if (modal && !modal.hidden && tab === "factory") drawPane()
  }

  function startOver() {
    tracks.length = 0
    Object.assign(rel, { title: "", artist: "", description: "", editions: 1, royalties: 10, tags: [], cover: null })
    wizStep = "release"
    drawPane()
  }

  // ------------------------------------------------------------ shell

  function build() {
    modal = document.createElement("div")
    modal.id = "nftModal"
    modal.className = "nft-modal"
    modal.setAttribute("role", "dialog")
    modal.setAttribute("aria-modal", "true")
    modal.setAttribute("aria-label", "FONY Music")
    modal.hidden = true
    modal.innerHTML = `
      <header class="nft-head">
        <nav class="nft-tabs" role="tablist">
          <button type="button" role="tab" data-tab="gallery">${ic("disc")}<span>FONY Music</span></button>
          <button type="button" role="tab" data-tab="factory">${ic("sparkles")}<span>Mint factory</span></button>
          <button type="button" role="tab" data-tab="onboard">${ic("rocket")}<span>Onboard</span></button>
          <button type="button" role="tab" data-tab="about">${ic("sleeve")}<span>About</span></button>
        </nav>
        <div class="nft-wallet-chip" id="nftChip"></div>
        <button type="button" class="nft-close" aria-label="Close FONY Music">${ic("close")}</button>
      </header>
      <section class="nft-pane" id="nftPane"></section>
      <div class="nft-np" id="nftNp" hidden></div>`
    document.querySelector(".left-panel").appendChild(modal)
    restoreDraft()
    $(".nft-close").addEventListener("click", close)
    $(".nft-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]")
      if (b) setTab(b.dataset.tab)
    })
    unsubWallet = Wallet.onWalletChange(() => {
      drawChip()
      // the wallet is restored a moment after the studio opens: every tab (the FONY Music too) has to notice
      if (!Wallet.getState().address && gal.mine) { gal.mine = false; gal.tokens = []; gal.done = false }
      if (modal && !modal.hidden) drawPane()
      loadCollections()
    })
    // keys typed in the studio must not reach the player hotkeys
    modal.addEventListener("keydown", (e) => { if (e.key !== "Escape") e.stopPropagation() })
    modal.addEventListener("keyup", (e) => e.stopPropagation())
  }

  function setTab(name) {
    tab = name
    for (const b of modal.querySelectorAll(".nft-tabs button")) {
      const on = b.dataset.tab === name
      b.classList.toggle("on", on)
      b.setAttribute("aria-selected", on ? "true" : "false")
    }
    drawPane()
  }

  let aboutCleanup = null
  let onboardToken = 0

  function drawPane() {
    if (aboutCleanup) { aboutCleanup(); aboutCleanup = null }
    if (!modal) return
    const pane = $("#nftPane")
    const scroll = pane.scrollTop
    pane.innerHTML = ""
    pane.classList.toggle("fill", tab === "factory")
    if (tab === "gallery") drawGallery(pane)
    else if (tab === "about") aboutCleanup = drawAbout(pane, { go: (t) => setTab(t) })
    else if (tab === "onboard") {
      // the application form is its own module, fetched the first time the tab is opened
      const mine = ++onboardToken
      import("./nft/onboard.js").then(m => {
        if (mine !== onboardToken || tab !== "onboard" || !modal) return
        aboutCleanup = m.drawOnboard(pane, { Wallet, connect: connectWallet, go: (t) => setTab(t), toast })
      }).catch(() => { if (mine === onboardToken) pane.textContent = "Could not load the form. Check your connection and reopen the tab." })
    }
    else drawFactory(pane)
    pane.scrollTop = scroll
    persist()
  }

  // The avatar of the connected wallet: its objkt profile picture when it has one, otherwise a colour made from the address.
  const profiles = new Map()
  function avatarHtml(address) {
    let h = 0
    for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) % 360
    const p = profiles.get(address)
    const bg = p && p.logo ? `background-image:url('${esc(Objkt.ipfsUrl(p.logo))}')` : `background:linear-gradient(135deg,hsl(${h} 70% 58%),hsl(${(h + 70) % 360} 70% 42%))`
    return `<span class="nft-avatar ${p && p.logo ? "img" : ""}" style="${bg}">${p && p.logo ? "" : ic("user")}</span>`
  }

  function drawChip() {
    if (!modal) return
    const chip = $("#nftChip")
    const { address, network } = Wallet.getState()
    const alias = address && profiles.get(address) && profiles.get(address).alias
    chip.innerHTML = address
      ? `<span class="nft-pill">${avatarHtml(address)}${isMember(address) ? `<span class="nft-member" title="FONY artist">${ic("check")}<span>FONY artist</span></span>` : ""}<a class="nft-addr" href="${esc(Objkt.profileLink(network, address))}" target="_blank" rel="noopener noreferrer" title="${esc(address)} — open the profile on objkt">${esc(alias || Wallet.short(address))}</a><button type="button" class="nft-chip-x" id="nftChipLogout" title="Disconnect the wallet" aria-label="Disconnect the wallet">${ic("logout")}</button></span>`
      : `<button type="button" class="nft-connect" id="nftChipConnect">${ic("wallet")}<span>Connect wallet</span></button>`
    const c = $("#nftChipConnect")
    if (c) c.addEventListener("click", connectWallet)
    if (address && !profiles.has(address)) {
      profiles.set(address, null)
      Objkt.holderProfile(address).then(p => { if (p) { profiles.set(address, p); drawChip() } })
    }
    const out = $("#nftChipLogout")
    if (out) out.addEventListener("click", () => Wallet.disconnect())
  }

  async function connectWallet() {
    try { await Wallet.connect() } catch (err) { toast(friendly(err, "Could not connect the wallet")) }
  }

  function toast(text) {
    if (!modal) return
    const t = document.createElement("div")
    t.className = "nft-toast"
    t.textContent = text
    modal.appendChild(t)
    setTimeout(() => t.remove(), 5000)
  }

  const friendly = (err, fallback) => {
    const m = String((err && (err.message || err.title || err)) || "")
    if (/abort|reject|cancel|denied/i.test(m)) return "Cancelled in the wallet."
    return m && m.length < 220 ? m : fallback
  }

  // ------------------------------------------------------------ gallery

  function drawGallery(pane) {
    const { address } = Wallet.getState()
    pane.innerHTML = `
      <div class="nft-bar">
        <div class="nft-seg" role="group" aria-label="Show">
          <button type="button" data-mine="0" class="${gal.mine ? "" : "on"}">${ic("grid")} All releases</button>
          <button type="button" data-mine="1" class="${gal.mine ? "on" : ""}" ${address ? "" : "disabled title=\"Connect a wallet to see yours\""}>${ic("user")} Mine</button>
        </div>
        <label class="nft-hsearch${gal.search ? " open" : ""}">
          <button type="button" class="nft-hs-btn" aria-label="Search releases">${ic("search")}</button>
          <input type="search" id="nftSearch" placeholder="Search" autocomplete="off" value="${esc(gal.search)}">
        </label>
      </div>
      <div class="nft-grid" id="nftGrid"></div>
      <div class="nft-more" id="nftMore"></div>`
    pane.querySelectorAll("[data-mine]").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return
      gal.mine = b.dataset.mine === "1"
      reloadGallery()
    }))
    const hs = pane.querySelector(".nft-hsearch"), hsIn = $("#nftSearch")
    let hsTimer
    hs.querySelector(".nft-hs-btn").addEventListener("click", (e) => { e.preventDefault(); hs.classList.add("open"); hsIn.focus() })
    hsIn.addEventListener("input", () => {
      clearTimeout(hsTimer)
      hsTimer = setTimeout(() => {
        gal.search = hsIn.value.trim()
        gal.tokens = []; gal.done = false; gal.error = ""
        renderGrid(); loadMore()
      }, 350)
    })
    hsIn.addEventListener("blur", () => { if (!hsIn.value) hs.classList.remove("open") })
    renderGrid()
    if (!gal.tokens.length && !gal.loading && !gal.done) loadMore()
  }

  function reloadGallery() {
    gal.tokens = []
    gal.done = false
    gal.error = ""
    drawPane()
  }

  async function loadMore() {
    if (gal.loading || gal.done) return
    gal.loading = true
    renderGrid()
    try {
      const { address } = Wallet.getState()
      const rows = await Objkt.browseTokens({ creator: gal.mine ? address : null, search: gal.search, limit: 24, offset: gal.tokens.length })
      gal.tokens.push(...rows)
      if (rows.length < 24) gal.done = true
      gal.error = ""
    } catch (err) {
      gal.error = friendly(err, "Could not load releases from objkt.")
      gal.done = true
    }
    gal.loading = false
    if (tab === "gallery" && modal && !modal.hidden) renderGrid()
  }

  function renderGrid() {
    const grid = $("#nftGrid")
    const more = $("#nftMore")
    if (!grid || !more) return
    grid.innerHTML = gal.tokens.map((t, i) => {
      const thumb = Objkt.ipfsUrl(t.thumbnail_uri || t.display_uri)
      const artist = (t.creators && t.creators[0] && Wallet.short(t.creators[0].creator_address)) || ""
      const member = !!(t.creators && t.creators[0] && isMember(t.creators[0].creator_address))
      return `<article class="nft-card">
        <button type="button" class="nft-thumb" data-play="${i}" data-pk="${t.pk}" aria-label="Play ${esc(t.name)}" style="${thumb ? `background-image:url('${esc(thumb)}')` : ""}"><span class="nft-play"><span class="i-play">${ic("play")}</span><span class="i-pause">${ic("pause")}</span><span class="i-load">${ic("refresh", "spin")}</span></span><span class="nft-thumb-bar"><i></i></span></button>
        <div class="nft-card-body">
          <b title="${esc(t.name)}">${esc(t.name || "Untitled")}</b>
          <small>${esc((t.fa && t.fa.name) || Wallet.short(t.fa_contract))}${artist ? " · " + esc(artist) : ""}</small>
          ${member ? `<span class="nft-member">${ic("check")}<span>FONY artist</span></span>` : ""}
          <a href="${esc(Objkt.tokenLink("mainnet", t.fa_contract, t.token_id))}" target="_blank" rel="noopener noreferrer">objkt ${ic("external")}</a>
        </div>
      </article>`
    }).join("")
    grid.querySelectorAll("[data-play]").forEach(b => b.addEventListener("click", () => playToken(gal.tokens[Number(b.dataset.play)])))
    if (gal.loading) more.innerHTML = `<p class="nft-note">${ic("refresh", "spin")} Loading…</p>`
    else if (gal.error) more.innerHTML = `<p class="nft-note err">${esc(gal.error)}</p>`
    else if (!gal.tokens.length) more.innerHTML = `<div class="nft-empty">${ic("disc")}<p>${gal.mine ? "You have not minted anything with FONY yet." : "No releases yet. Be the first: open the Mint factory."}</p></div>`
    else if (!gal.done) { more.innerHTML = `<button type="button" class="nft-btn ghost" id="nftMoreBtn">${ic("down")} Load more</button>`; $("#nftMoreBtn").addEventListener("click", loadMore) }
    else more.innerHTML = ""
    updateLabelUi()
  }

  // ---- play straight from the FONY Music (no dialog): the card plays, a small player bar follows ----

  const label = { audio: new Audio(), token: null, tracks: [], idx: 0, gi: 0, loading: null, cover: "" }
  label.audio.preload = "none"
  const metaCache = new Map()
  const baseName = (n) => String(n || "").replace(/[.][^.]+$/, "")

  async function fetchMeta(uri) {
    if (metaCache.has(uri)) return metaCache.get(uri)
    for (const g of Objkt.GATEWAYS) {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 7000)
      try {
        const res = await fetch(Objkt.ipfsVia(g, uri), { signal: ctl.signal })
        if (res.ok) {
          const json = await res.json()
          metaCache.set(uri, json)
          return json
        }
      } catch (_) {} finally { clearTimeout(timer) }
    }
    return null
  }

  async function playToken(token) {
    // the same card again: pause / resume
    if (label.token && label.token.pk === token.pk) {
      if (label.audio.paused) label.audio.play().catch(() => {})
      else label.audio.pause()
      return
    }
    label.loading = token.pk
    updateLabelUi()
    const meta = token.metadata ? await fetchMeta(token.metadata) : null
    if (label.loading !== token.pk) return          // another card was clicked meanwhile
    label.loading = null
    const tracks = ((meta && meta.formats) || [])
      .filter(f => f && f.uri && /^audio[/]/i.test(f.mimeType || ""))
      .map(f => ({ uri: f.uri, title: baseName(f.fileName) || token.name }))
    if (!tracks.length) { updateLabelUi(); preview(token); return }   // not a FONY player: show the NFT itself
    label.token = token
    label.tracks = tracks
    label.cover = Objkt.ipfsUrl(token.thumbnail_uri || token.display_uri)
    loadLabelTrack(0, true)
  }

  function loadLabelTrack(i, play) {
    label.idx = (i + label.tracks.length) % label.tracks.length
    label.gi = 0
    label.audio.src = Objkt.ipfsVia(Objkt.GATEWAYS[0], label.tracks[label.idx].uri)
    if (play) label.audio.play().catch(() => {})
    updateLabelUi()
  }

  label.audio.addEventListener("error", () => {
    if (!label.tracks.length) return
    if (label.gi < Objkt.GATEWAYS.length - 1) {
      label.gi++
      const was = !label.audio.paused
      label.audio.src = Objkt.ipfsVia(Objkt.GATEWAYS[label.gi], label.tracks[label.idx].uri)
      if (was) label.audio.play().catch(() => {})
    } else {
      toast("This track could not be loaded from IPFS right now.")
    }
  })
  label.audio.addEventListener("play", () => updateLabelUi())
  label.audio.addEventListener("pause", () => updateLabelUi())
  label.audio.addEventListener("timeupdate", () => updateLabelProgress())
  label.audio.addEventListener("loadedmetadata", () => updateLabelProgress())
  label.audio.addEventListener("ended", () => {
    if (label.idx < label.tracks.length - 1) loadLabelTrack(label.idx + 1, true)
    else loadLabelTrack(0, false)
  })

  function updateLabelUi() {
    if (!modal) return
    const cur = label.token ? String(label.token.pk) : null
    const playing = !label.audio.paused
    modal.querySelectorAll(".nft-thumb").forEach(b => {
      const pk = b.dataset.pk
      b.classList.toggle("current", pk === cur)
      const card = b.closest(".nft-card")
      if (card) card.classList.toggle("current", pk === cur)
      b.classList.toggle("playing", pk === cur && playing)
      b.classList.toggle("loading", label.loading != null && String(label.loading) === pk)
    })
    renderNowPlaying()
    updateLabelProgress()
  }

  function updateLabelProgress() {
    if (!modal) return
    const d = label.audio.duration
    const t = label.audio.currentTime
    const pct = d ? Math.min(100, t / d * 100) : 0
    modal.querySelectorAll(".nft-thumb.current .nft-thumb-bar i").forEach(i => { i.style.width = pct + "%" })
    const fill = modal.querySelector("#npFill")
    if (fill) fill.style.width = pct + "%"
    const time = modal.querySelector("#npTime")
    if (time) time.textContent = fmtTime(t || 0).replace("–:––", "0:00") + " / " + fmtTime(d).replace("–:––", "0:00")
  }

  function renderNowPlaying() {
    const np = modal && modal.querySelector("#nftNp")
    if (!np) return
    if (!label.token) { np.hidden = true; np.innerHTML = ""; return }
    const track = label.tracks[label.idx]
    const multi = label.tracks.length > 1
    const playing = !label.audio.paused
    np.hidden = false
    np.innerHTML = `
      <div class="nft-np-cover" style="${label.cover ? `background-image:url('${esc(label.cover)}')` : ""}"></div>
      <div class="nft-np-txt"><b>${esc(track.title)}</b><small>${esc(label.token.name)}${multi ? ` · ${label.idx + 1}/${label.tracks.length}` : ""}</small></div>
      ${multi ? `<button type="button" class="nft-np-btn" id="npPrev" aria-label="Previous track">${ic("prev")}</button>` : ""}
      <button type="button" class="nft-np-btn main" id="npPlay" aria-label="${playing ? "Pause" : "Play"}">${ic(playing ? "pause" : "play")}</button>
      ${multi ? `<button type="button" class="nft-np-btn" id="npNext" aria-label="Next track">${ic("next")}</button>` : ""}
      <div class="nft-np-bar" id="npBar"><i id="npFill"></i></div>
      <span class="nft-np-time" id="npTime">0:00 / 0:00</span>`
    np.querySelector("#npPlay").addEventListener("click", () => { if (label.audio.paused) label.audio.play().catch(() => {}); else label.audio.pause() })
    const prev = np.querySelector("#npPrev"); if (prev) prev.addEventListener("click", () => { if (label.audio.currentTime > 3) label.audio.currentTime = 0; else loadLabelTrack(label.idx - 1, !label.audio.paused) })
    const next = np.querySelector("#npNext"); if (next) next.addEventListener("click", () => loadLabelTrack(label.idx + 1, !label.audio.paused))
    np.querySelector("#npBar").addEventListener("click", (e) => {
      const d = label.audio.duration
      if (!d) return
      const r = e.currentTarget.getBoundingClientRect()
      label.audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d
    })
  }

  function preview(token) {
    const uri = Objkt.ipfsHtml(token.artifact_uri)
    const isHtml = /html/i.test(token.mime || "") || !/^(audio|image|video)/i.test(token.mime || "")
    openOverlay(`<div class="nft-viewer">
      ${isHtml ? `<iframe sandbox="allow-scripts" allow="autoplay" src="${esc(uri)}" title="${esc(token.name)}"></iframe>` : `<p class="nft-note">This token is not a FONY player. <a href="${esc(Objkt.tokenLink("mainnet", token.fa_contract, token.token_id))}" target="_blank" rel="noopener noreferrer">Open on objkt ↗</a></p>`}
    </div>`, token.name)
  }

  // The app's own confirmation dialog (instead of the browser's confirm()). Resolves true / false.
  function askConfirm({ icon = "bulb", title, text, ok = "OK", cancel = "Cancel", danger = false }) {
    return new Promise((resolve) => {
      const back = document.createElement("div")
      back.className = "nft-pick-back"
      back.innerHTML = `<div class="nft-ask ${danger ? "danger" : ""}" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
          <span class="nft-ask-ico">${ic(icon)}</span>
          <h5>${esc(title)}</h5>
          <p>${esc(text)}</p>
          <div class="nft-ask-btns">
            <button type="button" class="nft-btn ghost" data-r="0">${esc(cancel)}</button>
            <button type="button" class="nft-btn ${danger ? "danger" : ""}" data-r="1">${esc(ok)}</button>
          </div>
        </div>`
      modal.appendChild(back)
      const done = (v) => { document.removeEventListener("keydown", onKey, true); back.remove(); resolve(v) }
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false) }
        else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); done(true) }
      }
      document.addEventListener("keydown", onKey, true)
      back.addEventListener("click", (e) => { if (e.target === back) done(false) })
      back.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => done(b.dataset.r === "1")))
      back.querySelector('[data-r="1"]').focus()
    })
  }

  function openOverlay(html, title) {
    const back = document.createElement("div")
    back.className = "nft-pick-back"
    back.innerHTML = `<div class="nft-pick nft-pick-wide" role="dialog" aria-modal="true" aria-label="${esc(title || "Preview")}">
        <div class="nft-pick-head"><b>${esc(title || "Preview")}</b><span class="nft-pick-crumbs"></span><button type="button" class="nft-pick-x" aria-label="Close">${ic("close")}</button></div>
        ${html}</div>`
    modal.appendChild(back)
    const shut = () => { back.remove(); document.removeEventListener("keydown", onKey, true) }
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); shut() } }
    document.addEventListener("keydown", onKey, true)
    back.addEventListener("click", (e) => { if (e.target === back) shut() })
    back.querySelector(".nft-pick-x").addEventListener("click", shut)
    return shut
  }

  // ------------------------------------------------------------ factory

  async function loadCollections() {
    const { address, network } = Wallet.getState()
    if (!address) {
      collections = []
      collection = { address: "", id: null, status: "", ok: false }
      if (modal && !modal.hidden && tab === "factory") drawPane()
      return
    }
    try {
      // mainnet: the collections objkt's Minting Factory made for this wallet (each has a collection id)
      collections = network === "mainnet" ? await Objkt.factoryCollections(address) : await Objkt.chainCollections(network, address)
    } catch (_) {
      collections = []
    }
    if (!collection.address) {
      let saved = ""
      try { saved = localStorage.getItem(COLLECTION_KEY + ":" + network) || "" } catch (_) {}
      const pick = collections.find(c => c.contract === saved) || collections[0]
      if (pick) await selectCollection(pick.contract, false)
    }
    if (modal && !modal.hidden && tab === "factory") drawPane()
  }

  async function selectCollection(addr, redraw = true) {
    addr = String(addr || "").trim()
    collection = { address: addr, id: null, status: "", ok: false }
    if (!addr) { if (redraw) drawPane(); return }
    if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
      collection.status = "That is not a contract address (KT1…)."
    } else {
      const { network, address } = Wallet.getState()
      const own = collections.find(c => c.contract === addr && c.id != null)
      if (own) {
        // an objkt collection of this wallet: minted through objkt's Minting Factory
        collection.id = own.id
        collection.ok = true
        collection.status = "objkt collection, ready to mint."
        try { localStorage.setItem(COLLECTION_KEY + ":" + network, addr) } catch (_) {}
        if (redraw) drawPane()
        return
      }
      collection.status = "Checking…"
      if (redraw) drawPane()
      try {
        const eps = await Objkt.contractEntrypoints(network, addr)
        mintAdapter(eps)
        const admin = await Objkt.contractAdmin(network, addr)
        if (admin === Objkt.FACTORY) throw new Error("This is an objkt collection of another wallet: only its owner can mint into it.")
        if (admin && address && admin !== address) collection.status = "Ready to mint, but this wallet is not the administrator of the collection, so the contract may refuse."
        else collection.status = "Ready to mint."
        collection.ok = true
        try { localStorage.setItem(COLLECTION_KEY + ":" + network, addr) } catch (_) {}
      } catch (err) {
        collection.status = friendly(err, "Could not read this contract.")
      }
    }
    if (redraw) drawPane()
  }

  const stem = (name) => name.replace(/\.[^.]+$/, "")
  function guessMeta(file) {
    const base = stem(file.name).replace(/_/g, " ").replace(/^\d{1,3}\s*[-._)]\s*/, "").trim()
    const m = base.match(/^(.+?)\s+[-–]\s+(.+)$/)
    return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base || "Untitled" }
  }

  const fmtTime = (s) => (isFinite(s) && s > 0 ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "–:––")
  const objUrls = new Map()
  const urlFor = (file) => {
    if (!objUrls.has(file)) objUrls.set(file, URL.createObjectURL(file))
    return objUrls.get(file)
  }

  function probeDuration(track) {
    const a = new Audio()
    a.preload = "metadata"
    a.onloadedmetadata = () => {
      track.dur = a.duration
      a.removeAttribute("src")
      refreshStats()
      const el = modal && modal.querySelector(`[data-dur="${track.id}"]`)
      if (el) el.textContent = fmtTime(track.dur)
    }
    a.onerror = () => {}
    a.src = urlFor(track.audio)
  }

  function addFiles(files) {
    const audio = files.filter(isAudio)
    const images = files.filter(isImage)
    for (const f of audio) {
      if (tracks.length >= MAX_TRACKS) { toast(`At most ${MAX_TRACKS} tracks in one player.`); break }
      const g = guessMeta(f)
      const t = { id: ++uid, audio: f, title: g.title, artist: g.artist, dur: null }
      tracks.push(t)
      probeDuration(t)
      if (!rel.title && tracks.length === 1) rel.title = g.title
      if (!rel.artist && g.artist) rel.artist = g.artist
    }
    if (images.length) rel.cover = images[0]
    if (!audio.length && !images.length) toast("Drop audio files (mp3, wav, flac…) and an image for the cover.")
    drawPane()
  }

  function pickBrowser(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = accept
      input.multiple = !!multiple
      input.onchange = () => resolve([...input.files])
      input.click()
    })
  }

  function refreshStats() {
    const el = modal && modal.querySelector("#nftStats")
    if (!el) return
    const dur = tracks.reduce((s, t) => s + (t.dur || 0), 0)
    const size = tracks.reduce((s, t) => s + t.audio.size, 0) + (rel.cover ? rel.cover.size : 0)
    el.innerHTML = `<span>${ic("music")}<b>${tracks.length}</b> track${tracks.length === 1 ? "" : "s"}</span><span>${ic("clock")}<b>${dur ? fmtTime(dur) : "–"}</b></span><span>${ic("upload")}<b>${(size / 1048576).toFixed(1)}</b> MB</span>`
  }

  let previewTimer = null
  function refreshPreview(now = false) {
    clearTimeout(previewTimer)
    const run = () => {
      const box = modal && modal.querySelector("#nftPreview")
      if (!box) return
      if (!tracks.length || !rel.cover) {
        box.innerHTML = `<div class="nft-preview-empty"><div class="nft-disc"></div><p>${!rel.cover && !tracks.length ? "Add a cover and tracks" : !rel.cover ? "Add a cover" : "Add tracks"}<br><small>the live preview of your player shows up here</small></p></div>`
        return
      }
      const html = buildPlayerHtml({
        title: rel.title || tracks[0].title, artist: rel.artist, previewCover: urlFor(rel.cover),
        tracks: tracks.map(t => ({ title: t.title, artist: t.artist || rel.artist, previewAudio: urlFor(t.audio) }))
      })
      let frame = box.querySelector("iframe")
      if (!frame) {
        box.innerHTML = ""
        frame = document.createElement("iframe")
        // this is our own generated page (every user string is escaped), and it has to read the blob: URLs of the
        // local files, which a sandboxed opaque origin cannot; remote NFTs in the FONY Music stay fully sandboxed
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
        frame.setAttribute("allow", "autoplay")
        frame.title = "Live preview of the player"
        box.appendChild(frame)
      }
      frame.srcdoc = html
    }
    if (now) run()
    else previewTimer = setTimeout(run, 500)
  }

  // ---- the wizard (four short steps, nothing to scroll) ----

  const STEPS = [
    { id: "setup", label: "Connect" },
    { id: "release", label: "Release" },
    { id: "collection", label: "Collection" },
    { id: "mint", label: "Mint" }
  ]
  let wizStep = null
  let keyEdit = false

  const okMap = () => ({
    setup: !!Wallet.getState().address && Ipfs.hasJwt(),
    release: !!rel.cover && !!rel.title.trim() && tracks.length > 0,
    collection: collection.ok,
    mint: true
  })
  const firstOpenStep = () => { const ok = okMap(); return (STEPS.find(s => !ok[s.id]) || STEPS[STEPS.length - 1]).id }
  const reachable = (id) => { const ok = okMap(); for (const s of STEPS) { if (s.id === id) return true; if (!ok[s.id]) return false } return false }
  const missingHint = (id) => {
    if (id === "setup") return !Wallet.getState().address ? "Connect your wallet" : "Add your storage key"
    if (id === "release") return !rel.cover ? "Add a cover" : !rel.title.trim() ? "Give it a title" : "Add at least one track"
    if (id === "collection") return "Choose or create a collection"
    return ""
  }

  const STEP_ICONS = {
    setup: `<svg viewBox="0 0 24 24"><path d="M4 7a2 2 0 0 1 2-2h11v3H6.5a.5.5 0 0 0 0 1H19a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm12.5 6.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/></svg>`,
    release: `<svg viewBox="0 0 24 24"><path d="M9 4v10.3A3.5 3.5 0 1 0 11 17.5V8h6V4z"/></svg>`,
    collection: `<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>`,
    mint: `<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.4L21 9l-5 4.4L17.5 20 12 16.5 6.5 20 8 13.4 3 9l6.4-.6z"/></svg>`
  }

  function tipFor(id) {
    if (id === "setup") return "The wallet signs every transaction itself. Your storage key never leaves this browser."
    if (id === "release") return tracks.length > 1 ? "Drag the rows (or use ▲▼) to set the order. The player gets a playlist button." : "Square covers look best: the cover fills the whole player. Add more tracks to make a playlist."
    if (id === "collection") return "Editions are the number of copies. Royalties go to your wallet on every resale."
    return "Files are uploaded to IPFS first, then your wallet confirms once. Keep this tab open until it is done."
  }

  function goStep(id) {
    if (!reachable(id) && !(id === "mint" && lastResult)) return
    wizStep = id
    drawPane()
  }

  function refreshNav() {
    if (!modal) return
    const next = modal.querySelector("#nftNext")   // the last step has no "Continue", but it still has its tip
    const ok = okMap()[wizStep]
    if (next) next.disabled = !ok
    const hint = modal.querySelector("#nftNavHint")
    if (hint) hint.textContent = ok ? tipFor(wizStep) : "To continue: " + missingHint(wizStep).toLowerCase()
    const tip = modal.querySelector("#nftTip")
    if (tip) tip.classList.toggle("warn", !ok)
    modal.querySelectorAll(".nft-stepper button").forEach(b => { b.disabled = !reachable(b.dataset.step) && !(b.dataset.step === "mint" && lastResult) })
  }

  function drawFactory(pane) {
    if (!wizStep || !STEPS.some(s => s.id === wizStep)) wizStep = firstOpenStep()
    else if (!reachable(wizStep) && !(wizStep === "mint" && lastResult)) wizStep = firstOpenStep()
    const ok = okMap()
    const idx = STEPS.findIndex(s => s.id === wizStep)
    const body = { setup: setupHtml, release: releaseHtml, collection: collectionHtml, mint: mintHtml }[wizStep]()
    const last = idx === STEPS.length - 1
    pane.innerHTML = `
      <div class="nft-factory">
        <div class="nft-fmain">
          <aside class="nft-stage">
            <div class="nft-frame"><div class="nft-preview" id="nftPreview"></div></div>
            <div class="nft-statbar">
              <div class="nft-stats" id="nftStats"></div>
              ${rel.cover || tracks.length ? `<button type="button" class="nft-reset" id="nftReset" title="Clear the cover, the tracks and the details">${ic("refresh")}<span>Start over</span></button>` : ""}
            </div>
          </aside>
          <section class="nft-wstep">
            <div class="nft-wbody">${body}</div>
            <div class="nft-tip" id="nftTip"><i aria-hidden="true">${ic("bulb")}</i><span id="nftNavHint"></span></div>
          </section>
        </div>
        <nav class="nft-dock" aria-label="Steps">
          <button type="button" class="nft-dock-btn" id="nftBack" aria-label="Back" ${idx === 0 ? "disabled" : ""}>${ic("left")}</button>
          <ol class="nft-stepper">${STEPS.map((s, i) => `
            <li class="${s.id === wizStep ? "cur" : ""} ${ok[s.id] && i < idx ? "done" : ""}">
              <button type="button" data-step="${s.id}"><i>${ok[s.id] && i < idx ? ic("check") : STEP_ICONS[s.id]}</i><span>${s.label}</span></button>
            </li>`).join("")}</ol>
          ${last ? `<span class="nft-dock-end"></span>` : `<button type="button" class="nft-dock-next" id="nftNext">Continue ${ic("right")}</button>`}
        </nav>
      </div>`

    pane.querySelector(".nft-stepper").addEventListener("click", (e) => { const b = e.target.closest("button[data-step]"); if (b && !b.disabled) goStep(b.dataset.step) })
    $("#nftBack").addEventListener("click", () => goStep(STEPS[Math.max(0, idx - 1)].id))
    const next = $("#nftNext"); if (next) next.addEventListener("click", () => goStep(STEPS[idx + 1].id))

    ;({ setup: wireSetup, release: wireRelease, collection: wireCollection, mint: wireMint })[wizStep]()

    // files dropped anywhere on the release step: audio -> playlist, image -> cover
    pane.ondragover = (e) => e.preventDefault()
    pane.ondrop = (e) => { if (e.target.closest(".nft-dropzone") || wizStep !== "release") return; e.preventDefault(); addFiles([...(e.dataTransfer?.files || [])]) }

    const reset = $("#nftReset")
    if (reset) reset.addEventListener("click", async () => {
      const yes = await askConfirm({ icon: "refresh", title: "Start over?", text: "The cover, the tracks and the details of this draft will be cleared.", ok: "Clear it", danger: true })
      if (yes) startOver()
    })

    refreshStats()
    refreshPreview(true)
    refreshNav()
  }

  // ---- connect ----

  function setupHtml() {
    const { address, network } = Wallet.getState()
    const jwt = Ipfs.hasJwt()
    const showKey = !jwt || keyEdit
    return `
      <div class="nft-row-card ${address ? "ok" : ""}">
        <span class="nft-sc-ico">${address ? ic("check") : ic("wallet")}</span>
        <div class="nft-rc-main"><b>Tezos wallet</b><small>${address ? `<a class="nft-inlink" href="${esc(Objkt.profileLink(network, address))}" target="_blank" rel="noopener noreferrer">${esc(Wallet.short(address))} ${ic("external")}</a> connected` : "Temple, Kukai, Umami… any Beacon wallet"}</small></div>
        ${address ? `<button type="button" class="nft-btn small ghost" id="nftDisc">${ic("logout")} Disconnect</button>` : `<button type="button" class="nft-btn small" id="nftConn">${ic("plug")} Connect</button>`}
      </div>
      <div class="nft-row-card ${showKey ? "" : "ok"} tall">
        <span class="nft-sc-ico">${showKey ? ic("key") : ic("check")}</span>
        <div class="nft-rc-main"><b>Free storage key</b><small>${showKey ? `Your files go to IPFS through a free account at <a class="nft-inlink" href="https://app.pinata.cloud/register" target="_blank" rel="noopener noreferrer">Pinata ${ic("external")}</a>` : "Saved in this browser"}</small></div>
        ${showKey ? "" : `<button type="button" class="nft-btn small ghost" id="nftKeyEdit">${ic("refresh")} Replace</button>`}
      </div>
      ${showKey ? `
        <ol class="nft-tl">
          <li><i>1</i><div><b>Sign up free</b><small>e-mail only, one minute</small></div><a class="nft-ext" href="https://app.pinata.cloud/register" target="_blank" rel="noopener noreferrer">Open Pinata ${ic("external")}</a></li>
          <li><i>2</i><div><b>API Keys → New Key</b><small>in the left menu</small></div></li>
          <li><i>3</i><div><b>Allow pinFileToIPFS</b><small>or Admin; name it FONY</small></div></li>
          <li><i>4</i><div><b>Copy the JWT</b><small>starts with eyJ, shown only once</small></div></li>
        </ol>
        <div class="nft-inline">
          <input type="password" id="nftJwt" class="nft-input" autocomplete="off" spellcheck="false" placeholder="Paste the JWT here">
          <button type="button" class="nft-btn small" id="nftJwtSave">${ic("check")} Save & test</button>
          ${jwt ? `<button type="button" class="nft-btn small ghost" id="nftKeyCancel">${ic("close")} Cancel</button>` : ""}
        </div>
        <p class="nft-note" id="nftJwtMsg">Stays in this browser only, never in backups. Free plan ≈ 1 GB.</p>` : ""}`
  }

  function wireSetup() {
    const conn = $("#nftConn"); if (conn) conn.addEventListener("click", connectWallet)
    const disc = $("#nftDisc"); if (disc) disc.addEventListener("click", () => Wallet.disconnect())
    const edit = $("#nftKeyEdit"); if (edit) edit.addEventListener("click", () => { keyEdit = true; drawPane() })
    const cancel = $("#nftKeyCancel"); if (cancel) cancel.addEventListener("click", () => { keyEdit = false; drawPane() })
    const save = $("#nftJwtSave")
    if (save) save.addEventListener("click", async () => {
      const value = $("#nftJwt").value.trim()
      const msg = $("#nftJwtMsg")
      if (!value) { msg.className = "nft-note err"; msg.textContent = "Paste the key first."; return }
      if (!Ipfs.looksLikeJwt(value)) {
        msg.className = "nft-note err"
        msg.textContent = "That is not the JWT. It is one long text with two dots in it, starting with eyJ. In Pinata copy the field called JWT (not API Key or Secret)."
        return
      }
      save.disabled = true
      msg.className = "nft-note"
      msg.textContent = "Testing the key…"
      const res = await Ipfs.testJwt(value)
      if (res === "bad") { save.disabled = false; msg.className = "nft-note err"; msg.textContent = "Pinata rejected this key. Copy the whole JWT again."; return }
      Ipfs.setJwt(value)
      keyEdit = false
      toast(res === "ok" ? "Key works. Storage is ready." : "Key saved (Pinata could not be reached to test it).")
      drawPane()
    })
  }

  // ---- release: cover, title and the playlist on one screen ----

  function releaseHtml() {
    return `
      <div class="nft-release">
        <div class="nft-coverdrop nft-dropzone" id="nftCover" tabindex="0" role="button" aria-label="Choose the cover" title="Cover: click or drop an image" style="${rel.cover ? `background-image:url('${esc(urlFor(rel.cover))}')` : ""}">
          ${rel.cover ? "" : `<span>${ic("image")}<small>cover</small></span>`}
        </div>
        <div class="nft-release-fields">
          <input class="nft-input" id="relTitle" value="${esc(rel.title)}" placeholder="Title" aria-label="Title">
          <input class="nft-input" id="relArtist" value="${esc(rel.artist)}" placeholder="Artist" aria-label="Artist">
          <div class="nft-actions tight">
            <button type="button" class="nft-btn small ghost" id="nftCoverBrowse">${ic("image")} Image</button>
            <button type="button" class="nft-btn small ghost" id="nftCoverLocal" ${localAvailable() ? "" : "disabled title=\"Local Files needs a desktop Chromium browser\""}>${ic("folder")} Local</button>
            ${rel.cover ? `<button type="button" class="nft-btn small ghost" id="nftCoverClear" aria-label="Remove the cover">${ic("close")}</button>` : ""}
          </div>
        </div>
      </div>
      <div class="nft-drop nft-dropzone slim" id="nftDrop" tabindex="0">
        <div class="nft-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <span><b>Drop tracks here</b> <small>one or many</small></span>
        <button type="button" class="nft-btn small" id="nftAddAudio">${ic("upload")} Browse</button>
        <button type="button" class="nft-btn small ghost" id="nftAddLocal" ${localAvailable() ? "" : "disabled title=\"Local Files needs a desktop Chromium browser\""}>${ic("folder")} Local Files</button>
      </div>
      <ol class="nft-tracks" id="nftTracks"></ol>
      ${tracks.length ? "" : `<div class="nft-tracks-empty">${ic("music")}<p>Your tracklist will show up here</p><small>The order you set is the order of the playlist</small></div>`}`
  }

  function hoverDrop(el, onDrop) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation() }
    ;["dragenter", "dragover"].forEach(ev => el.addEventListener(ev, (e) => { stop(e); el.classList.add("over") }))
    ;["dragleave", "drop"].forEach(ev => el.addEventListener(ev, (e) => { stop(e); el.classList.remove("over") }))
    el.addEventListener("drop", onDrop)
  }

  function wireRelease() {
    const bind = (id, key) => $("#" + id).addEventListener("input", (e) => { rel[key] = e.target.value; refreshPreview(); refreshNav(); persist() })
    bind("relTitle", "title"); bind("relArtist", "artist")
    hoverDrop($("#nftCover"), (e) => { const f = [...(e.dataTransfer?.files || [])].filter(isImage); if (f[0]) { rel.cover = f[0]; drawPane() } })
    const chooseCover = async () => { const f = (await pickBrowser("image/*", false)).filter(isImage); if (f[0]) { rel.cover = f[0]; drawPane() } }
    $("#nftCover").addEventListener("click", chooseCover)
    $("#nftCover").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseCover() } })
    $("#nftCoverBrowse").addEventListener("click", chooseCover)
    $("#nftCoverLocal").addEventListener("click", async () => { const f = (await pickLocal({ want: "image", multiple: false, host: modal })).filter(isImage); if (f[0]) { rel.cover = f[0]; drawPane() } })
    const clr = $("#nftCoverClear"); if (clr) clr.addEventListener("click", () => { rel.cover = null; drawPane() })
    hoverDrop($("#nftDrop"), (e) => addFiles([...(e.dataTransfer?.files || [])]))
    $("#nftAddAudio").addEventListener("click", async () => addFiles(await pickBrowser("audio/*,image/*", true)))
    $("#nftAddLocal").addEventListener("click", async () => { const f = await pickLocal({ want: "audio", multiple: true, host: modal }); if (f.length) addFiles(f) })
    drawTracks()
  }

  // ---- collection and terms ----

  function collectionHtml() {
    const { network, address } = Wallet.getState()
    const collOptions = collections.map(c => `<option value="${esc(c.contract)}" ${c.contract === collection.address ? "selected" : ""}>${esc(c.name || "Collection")} · ${esc(Wallet.short(c.contract))}</option>`).join("")
    const canCreate = network === "mainnet" && !!address
    return `
      <div class="nft-inline">
        <select id="nftColl" class="nft-input" aria-label="Collection"><option value="">${collections.length ? "Choose a collection…" : "No collections yet"}</option>${collOptions}</select>
        <button type="button" class="nft-btn small ghost" id="nftNewToggle" ${canCreate ? "" : "disabled title=\"Creating collections works on mainnet with a connected wallet\""}>${newColl.open ? ic("close") + " Cancel" : ic("plus") + " New"}</button>
      </div>
      ${newColl.open && canCreate ? newCollectionHtml() : ""}
      <p class="nft-note ${collection.ok ? "ok" : collection.status && collection.status !== "Checking…" ? "err" : ""}">${esc(collection.status || "Pick one of your objkt collections or create a new one.")}</p>
      <div class="nft-trio">
        <label>${ic("layers")} Editions<input id="relEd" class="nft-input" type="number" min="1" max="10000" value="${rel.editions}"></label>
        <label>${ic("coins")} Royalties %<input id="relRoy" class="nft-input" type="number" min="0" max="25" step="0.5" value="${rel.royalties}"></label>
      </div>
      <details class="nft-adv" open>
        <summary>${ic("down")} More options</summary>
        <label class="nft-lbl">Description<textarea id="relDesc" class="nft-input" rows="2" placeholder="Shown on objkt (optional)">${esc(rel.description)}</textarea></label>
        <div class="nft-lbl">Extra tags
          <div class="nft-tagbox" id="nftTagBox"><input id="relTagIn" class="nft-tagin" placeholder="Type a tag, press Enter" spellcheck="false" autocomplete="off" aria-label="Add a tag"></div>
        </div>
        <label class="nft-lbl">Or a contract address<input id="nftCollAddr" class="nft-input" placeholder="KT1…" spellcheck="false" value="${esc(collection.id == null ? collection.address : "")}"></label>
      </details>`
  }

  // ---- tags: type one, press Enter (or a comma) to make it a chip ----

  const MAX_TAGS = 8
  const cleanTag = (t) => String(t || "").trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 24)

  function renderTags() {
    const box = $("#nftTagBox")
    if (!box) return
    box.querySelectorAll(".nft-chip").forEach(c => c.remove())
    const input = box.querySelector("input")
    rel.tags.forEach((t, i) => {
      const chip = document.createElement("span")
      chip.className = "nft-chip"
      chip.innerHTML = `#${esc(t)}<button type="button" aria-label="Remove ${esc(t)}">${ic("close")}</button>`
      chip.querySelector("button").addEventListener("click", () => { rel.tags.splice(i, 1); renderTags(); persist(); input.focus() })
      box.insertBefore(chip, input)
    })
    input.placeholder = rel.tags.length ? (rel.tags.length >= MAX_TAGS ? "" : "Add another") : "Type a tag, press Enter"
    input.disabled = rel.tags.length >= MAX_TAGS
  }

  function wireTags() {
    const box = $("#nftTagBox")
    const input = $("#relTagIn")
    const add = (raw) => {
      let added = false
      for (const part of String(raw).split(",")) {
        const t = cleanTag(part)
        if (t && !rel.tags.includes(t) && rel.tags.length < MAX_TAGS) { rel.tags.push(t); added = true }
      }
      input.value = ""
      if (added) { renderTags(); persist() }
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input.value) }
      else if (e.key === "Backspace" && !input.value && rel.tags.length) { rel.tags.pop(); renderTags(); persist() }
    })
    input.addEventListener("blur", () => { if (input.value.trim()) add(input.value) })
    input.addEventListener("paste", (e) => { const text = e.clipboardData && e.clipboardData.getData("text"); if (text && /[,\n]/.test(text)) { e.preventDefault(); add(text.replace(/\n/g, ",")) } })
    box.addEventListener("click", (e) => { if (e.target === box) input.focus() })
    renderTags()
  }

  function wireCollection() {
    $("#nftColl").addEventListener("change", (e) => selectCollection(e.target.value))
    $("#nftCollAddr").addEventListener("change", (e) => selectCollection(e.target.value))
    const nt = $("#nftNewToggle")
    if (nt) nt.addEventListener("click", () => { newColl.open = !newColl.open; newColl.msg = ""; drawPane() })
    if (newColl.open) wireNewCollection()
    const bind = (id, key, fn) => $("#" + id).addEventListener("input", (e) => { rel[key] = fn ? fn(e.target.value) : e.target.value; persist() })
    bind("relDesc", "description")
    wireTags()
    bind("relEd", "editions", v => Math.max(1, Math.min(10000, Number(v) || 1)))
    bind("relRoy", "royalties", v => Math.max(0, Math.min(25, Number(v) || 0)))
  }

  function newCollectionHtml() {
    const useCover = rel.cover && !newColl.image ? `<button type="button" class="nft-btn small ghost" id="ncUseCover">${ic("image")} Use the cover</button>` : ""
    return `<div class="nft-newcoll-form">
      <input id="ncName" class="nft-input" value="${esc(newColl.name)}" placeholder="Collection name" aria-label="Collection name">
      <input id="ncDesc" class="nft-input" value="${esc(newColl.description)}" placeholder="Short description (optional)" aria-label="Description">
      <div class="nft-actions tight"><button type="button" class="nft-btn small ghost" id="ncImage">${ic("image")} ${newColl.image ? esc(newColl.image.name) : "Image"}</button>${useCover}
        <button type="button" class="nft-btn small" id="ncCreate" ${newColl.busy ? "disabled" : ""}>${ic("sparkles")} Create on objkt</button><span class="nft-note ${newColl.err ? "err" : ""}" id="ncMsg">${esc(newColl.msg)}</span></div>
    </div>`
  }

  // ---- review and mint ----

  function mintHtml() {
    if (lastResult && !tracks.length) {
      return `<div id="nftResult"></div><div class="nft-actions center"><button type="button" class="nft-btn small ghost" id="nftAnother">${ic("refresh")} Mint another release</button></div>`
    }
    const { network, address } = Wallet.getState()
    const dur = tracks.reduce((s, t) => s + (t.dur || 0), 0)
    const size = tracks.reduce((s, t) => s + t.audio.size, 0) + (rel.cover ? rel.cover.size : 0)
    const coll = collections.find(c => c.contract === collection.address)
    const title = rel.title.trim() || (tracks[0] && tracks[0].title) || "Untitled"
    const facts = [
      ["music", "Tracks", `${tracks.length}${dur ? " · " + fmtTime(dur) : ""}`],
      ["disc", "Editions", rel.editions],
      ["coins", "Royalties", rel.royalties + "%"],
      ["layers", "Collection", esc((coll && coll.name) || Wallet.short(collection.address))],
      ["globe", "Network", network === "mainnet" ? "Mainnet" : "Ghostnet"],
      ["upload", "Upload", (size / 1048576).toFixed(1) + " MB"]
    ]
    return `
      <div class="nft-rv">
        <div class="nft-rv-head">
          <div class="nft-rv-cover" style="${rel.cover ? `background-image:url('${esc(urlFor(rel.cover))}')` : ""}"></div>
          <div class="nft-rv-title"><h5>${esc(title)}</h5><p>${esc(rel.artist || Wallet.short(address))}</p></div>
        </div>
        <div class="nft-facts">
          ${facts.map(([icon, label, value]) => `<div class="nft-fact"><span>${ic(icon)}${label}</span><b>${value}</b></div>`).join("")}
        </div>
      </div>
      <div class="nft-mintbar">
        <button type="button" class="nft-mint" id="nftMint">
          <span class="nft-mint-label">${ic("rocket")} Mint</span>
          <span class="nft-mint-sub">${network === "mainnet" ? "network fees in tez" : "free test network"} · one confirmation in your wallet</span>
        </button>
        <div class="nft-progress" id="nftProgressBox" hidden><div class="nft-progress-bar"><i id="nftProgressFill"></i></div><span id="nftProgress"></span></div>
        <div id="nftResult"></div>
      </div>`
  }

  function wireMint() {
    const mint = $("#nftMint"); if (mint) mint.addEventListener("click", startMint)
    const another = $("#nftAnother")
    if (another) another.addEventListener("click", () => { lastResult = null; rel.description = ""; rel.tags = []; wizStep = "release"; drawPane() })
    if (lastResult) showResult(lastResult)
  }

  function wireNewCollection() {
    const msg = (text, err) => { newColl.msg = text; newColl.err = !!err; const m = $("#ncMsg"); if (m) { m.textContent = text; m.classList.toggle("err", !!err) } }
    $("#ncName").addEventListener("input", (e) => { newColl.name = e.target.value })
    $("#ncDesc").addEventListener("input", (e) => { newColl.description = e.target.value })
    $("#ncImage").addEventListener("click", async () => { const f = (await pickBrowser("image/*", false)).filter(isImage); if (f[0]) { newColl.image = f[0]; drawPane() } })
    const uc = $("#ncUseCover"); if (uc) uc.addEventListener("click", () => { newColl.image = rel.cover; drawPane() })
    $("#ncCreate").addEventListener("click", async () => {
      if (newColl.busy) return
      if (!Ipfs.hasJwt()) return msg("Add your Pinata key in the Connect step first.", true)
      newColl.busy = true
      $("#ncCreate").disabled = true
      try {
        const made = await createCollection({ name: newColl.name, description: newColl.description, image: newColl.image }, (t) => msg(t, false))
        collections.unshift({ id: made.id, contract: made.contract, name: made.name })
        Object.assign(newColl, { open: false, name: "", description: "", image: null, msg: "", err: false, busy: false })
        await selectCollection(made.contract, false)
        toast("Collection created: " + made.name)
        drawPane()
      } catch (err) {
        newColl.busy = false
        const b = $("#ncCreate"); if (b) b.disabled = false
        msg(friendly(err, "Could not create the collection."), true)
      }
    })
  }

  function refreshMintLabel() {
    const l = modal && modal.querySelector(".nft-mint-label")
    const s = modal && modal.querySelector(".nft-mint-sub")
    if (l) l.textContent = tracks.length ? `Mint “${rel.title || tracks[0].title}”` : "Mint the release"
    if (s && tracks.length) s.textContent = `1 release · ${tracks.length} track${tracks.length > 1 ? "s" : ""} · ${rel.editions} edition${rel.editions > 1 ? "s" : ""}`
  }

  function drawTracks() {
    const list = $("#nftTracks")
    if (!list) return
    if (!tracks.length) { list.innerHTML = ""; return }
    list.innerHTML = tracks.map((t, i) => `
      <li class="nft-track" draggable="true" data-id="${t.id}">
        <span class="nft-grab" title="Drag to reorder">${ic("grip")}</span>
        <span class="nft-num">${i + 1}</span>
        <div class="nft-track-main">
          <input class="nft-input flat" data-f="title" value="${esc(t.title)}" aria-label="Track title">
          <small>${esc(t.audio.name)} · ${(t.audio.size / 1048576).toFixed(1)} MB</small>
        </div>
        <span class="nft-dur" data-dur="${t.id}">${fmtTime(t.dur)}</span>
        <div class="nft-item-act">
          <button type="button" class="nft-icon" data-act="up" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${ic("up")}</button>
          <button type="button" class="nft-icon" data-act="down" aria-label="Move down" ${i === tracks.length - 1 ? "disabled" : ""}>${ic("down")}</button>
          <button type="button" class="nft-icon" data-act="remove" aria-label="Remove">${ic("close")}</button>
        </div>
      </li>`).join("")
    let dragId = null
    list.querySelectorAll(".nft-track").forEach(row => {
      const id = Number(row.dataset.id)
      row.querySelector("[data-f]").addEventListener("input", (e) => { tracks.find(x => x.id === id).title = e.target.value; refreshPreview(); persist() })
      row.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act
        if (!act) return
        const i = tracks.findIndex(x => x.id === id)
        if (act === "remove") tracks.splice(i, 1)
        else if (act === "up" && i > 0) [tracks[i - 1], tracks[i]] = [tracks[i], tracks[i - 1]]
        else if (act === "down" && i < tracks.length - 1) [tracks[i + 1], tracks[i]] = [tracks[i], tracks[i + 1]]
        drawPane()
      })
      row.addEventListener("dragstart", (e) => { dragId = id; row.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(id)) })
      row.addEventListener("dragend", () => { dragId = null; row.classList.remove("dragging"); list.querySelectorAll(".over").forEach(x => x.classList.remove("over")) })
      row.addEventListener("dragover", (e) => { if (dragId == null) return; e.preventDefault(); e.stopPropagation(); row.classList.add("over") })
      row.addEventListener("dragleave", () => row.classList.remove("over"))
      row.addEventListener("drop", (e) => {
        if (dragId == null) return
        e.preventDefault(); e.stopPropagation()
        const from = tracks.findIndex(x => x.id === dragId)
        const to = tracks.findIndex(x => x.id === id)
        if (from < 0 || to < 0 || from === to) return
        tracks.splice(to, 0, tracks.splice(from, 1)[0])
        drawPane()
      })
    })
  }

  async function startMint() {
    if (busy) return
    const box = $("#nftProgressBox"), label = $("#nftProgress"), fill = $("#nftProgressFill"), btnMint = $("#nftMint")
    const fail = (msg) => { box.hidden = false; box.classList.add("err"); fill.style.width = "0%"; label.textContent = msg }
    box.classList.remove("err")
    if (!Wallet.getState().address) return fail("Connect a wallet first (Connect step).")
    if (!Ipfs.hasJwt()) return fail("Add your Pinata key in the Connect step first.")
    if (!collection.ok) return fail("Choose a collection that is ready to mint.")
    if (!tracks.length) return fail("Add at least one track.")
    if (!rel.cover) return fail("Add a cover for the release.")
    const title = (rel.title || tracks[0].title).trim()
    const net = Wallet.getState().network
    if (net === "mainnet") {
      const yes = await askConfirm({
        icon: "rocket",
        title: `Mint “${title}”?`,
        text: `${tracks.length} track${tracks.length > 1 ? "s" : ""} · ${rel.editions} edition${rel.editions > 1 ? "s" : ""} on Tezos mainnet. This costs real tez (network fees). The files are uploaded first, then your wallet asks you to confirm once.`,
        ok: "Mint"
      })
      if (!yes) return
    }
    busy = true
    btnMint.disabled = true
    btnMint.classList.add("busy")
    box.hidden = false
    const resultBox = $("#nftResult"); if (resultBox) resultBox.innerHTML = ""
    try {
      const result = await mintRelease({
        title, artist: rel.artist.trim(), description: rel.description.trim(), editions: rel.editions, cover: rel.cover,
        tracks: tracks.map(t => ({ audio: t.audio, title: t.title.trim() || "Untitled", artist: t.artist }))
      }, {
        collection: collection.address,
        collectionId: collection.id,
        royaltiesPct: rel.royalties,
        tags: rel.tags.slice(),
        onStep: (msg, frac) => { label.textContent = msg; fill.style.width = Math.round(frac * 100) + "%" }
      })
      lastResult = result
      clearTimeout(draftTimer)
      clearDraft()
      tracks.length = 0
      rel.cover = null
      rel.title = ""
      gal.tokens = []
      gal.done = false
      busy = false
      drawPane()
    } catch (err) {
      busy = false
      btnMint.disabled = false
      btnMint.classList.remove("busy")
      fail(friendly(err, "Minting failed."))
    }
  }

  function showResult(r) {
    const box = $("#nftResult")
    if (!box) return
    box.innerHTML = `<div class="nft-done">
      <span class="nft-done-ico">${ic("check")}</span>
      <h5>Minted!</h5>
      <p class="nft-done-sub"><b>${esc(r.title)}</b><span>${r.tracks} track${r.tracks > 1 ? "s" : ""} in one player</span></p>
      <a class="nft-btn nft-done-link" target="_blank" rel="noopener noreferrer" href="${esc(r.tokenId != null ? Objkt.tokenLink(r.network, r.collection, r.tokenId) : Objkt.collectionLink(r.network, r.collection))}">View on objkt ${ic("external")}</a>
      <p class="nft-note">It can take a minute for objkt to index the new token.</p>
    </div>`
  }

  // ------------------------------------------------------------ open / close

  // inside the studio the header logo reads FONY MUSIC; it goes back to FONY on close
  function setLogo(on) {
    const logo = document.querySelector(".top-bar .logo")
    if (!logo) return
    // "FONY" stays; " MUSIC" slides out of it on open and slides back in on close
    let ext = logo.querySelector(".logo-ext")
    if (!ext) {
      ext = document.createElement("span")
      ext.className = "logo-ext"
      ext.textContent = " MUSIC"
      logo.appendChild(ext)
      void ext.offsetWidth   // start the transition from the collapsed state
    }
    logo.classList.toggle("is-label", on)
    fitLogo()
    ext.style.maxWidth = on ? ext.scrollWidth + "px" : "0px"
  }

  // The logo is centred in the header and the menu icons sit on the right: when the left panel is narrow the long
  // name would run into them, so it shrinks just enough to stay clear.
  function fitLogo() {
    const logo = document.querySelector(".top-bar .logo")
    const bar = logo && logo.closest(".top-bar")
    const ext = logo && logo.querySelector(".logo-ext")
    if (!logo || !bar || !ext) return
    logo.style.fontSize = ""
    logo.style.letterSpacing = ""
    if (!logo.classList.contains("is-label")) return
    const barBox = bar.getBoundingClientRect()
    const logoBox = logo.getBoundingClientRect()
    const menu = bar.querySelector(".top-bar-actions")
    const menuBox = menu ? menu.getBoundingClientRect() : null
    const sameRow = menuBox && menuBox.width > 0 && menuBox.top < logoBox.bottom && menuBox.bottom > logoBox.top
    const half = (sameRow ? menuBox.left : barBox.right) - (barBox.left + barBox.width / 2) - 14
    const room = Math.max(120, half * 2)
    const range = document.createRange()
    range.selectNodeContents(logo.firstChild)
    const need = range.getBoundingClientRect().width + ext.scrollWidth
    if (need > room) {
      const k = room / need
      const cs = getComputedStyle(logo)
      logo.style.fontSize = (parseFloat(cs.fontSize) * k).toFixed(2) + "px"
      const ls = parseFloat(cs.letterSpacing)
      if (Number.isFinite(ls)) logo.style.letterSpacing = (ls * k).toFixed(2) + "px"
    }
  }

  function onResizeLogo() {
    const logo = document.querySelector(".top-bar .logo")
    const ext = logo && logo.querySelector(".logo-ext")
    if (!ext || !logo.classList.contains("is-label")) return
    fitLogo()
    ext.style.maxWidth = ext.scrollWidth + "px"
  }

  function open() {
    if (!modal) build()
    const chat = document.getElementById("chat")
    consoleWasOpen = !!chat && getComputedStyle(chat).display !== "none"
    if (consoleWasOpen) document.getElementById("chatUsernameContainer")?.click()
    const bar = document.querySelector(".left-panel .top-bar")
    const panel = document.querySelector(".left-panel")
    if (bar && panel) {
      const top = bar.getBoundingClientRect().bottom - panel.getBoundingClientRect().top
      modal.style.setProperty("--nft-top", Math.round(top + 6) + "px")
    }
    // the studio has its own previews: pause the main player (through its button, so it stays paused)
    const mainAudio = document.getElementById("audioPlayer")
    if (mainAudio && !mainAudio.paused) document.getElementById("playPauseBtn")?.click()
    setLogo(true)
    window.addEventListener("resize", onResizeLogo)
    modal.hidden = false
    drawChip()
    setTab(tab)
    document.addEventListener("keydown", onKey, true)
    Wallet.restore().then(a => { if (a) loadCollections() }).catch(() => {})
    refreshMembers().then(changed => { if (changed && modal && !modal.hidden) { drawChip(); if (tab === "gallery") renderGrid() } })
  }

  function close() {
    label.audio.pause()
    setLogo(false)
    window.removeEventListener("resize", onResizeLogo)
    modal.hidden = true
    document.removeEventListener("keydown", onKey, true)
    if (consoleWasOpen) document.getElementById("chatToggleBtn")?.click()
    consoleWasOpen = false
    teardown()
  }

  // Closing the studio frees what it held: the draft is saved to the browser's storage first, then the audio, the
  // blob URLs of the picked files, the wallet connection and the window itself are released. Opening it again
  // rebuilds the window and restores the draft.
  function teardown() {
    clearTimeout(draftTimer)
    if (draftLoaded) {
      saveDraftNow()
      draftLoaded = false
    }
    if (aboutCleanup) { aboutCleanup(); aboutCleanup = null }
    clearTimeout(previewTimer)
    onboardToken++
    label.audio.pause()
    label.audio.removeAttribute("src")
    label.audio.load()
    label.token = null
    label.tracks = []
    label.loading = null
    metaCache.clear()
    for (const url of objUrls.values()) URL.revokeObjectURL(url)
    objUrls.clear()
    tracks.length = 0
    Object.assign(rel, { title: "", artist: "", description: "", editions: 1, royalties: 10, tags: [], cover: null })
    Object.assign(newColl, { open: false, name: "", description: "", image: null, busy: false, msg: "", err: false })
    collections = []
    collection = { address: "", id: null, status: "", ok: false }
    gal.tokens = []; gal.done = false; gal.loading = false; gal.error = ""; gal.mine = false; gal.search = ""
    lastResult = null
    wizStep = null
    keyEdit = false
    tab = "gallery"
    if (unsubWallet) { unsubWallet(); unsubWallet = null }
    Wallet.release()
    if (modal) { modal.remove(); modal = null }
  }


  function onKey(e) {
    if (e.key === "Escape" && !document.querySelector("#nftModal .nft-pick-back")) {
      e.stopPropagation(); e.preventDefault()
      close()
    }
  }

  return { toggle: () => (!modal || modal.hidden ? open() : close()) }
}
