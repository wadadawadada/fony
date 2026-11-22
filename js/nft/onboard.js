// "Onboard" tab: a musician applies to the label. Connect a Tezos wallet, sign a short text to prove it is yours,
// fill in the form. The application is stored on the FONY server; once it is approved the server sends a one-time
// grant of tez for network fees. Loaded lazily, only when the tab is opened.

import { ic } from "./icons.js"

const BACKEND = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app"
const CSS = "/css/nft-onboard.css?v=1"
const POLL_MS = 45 * 1000

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

// what the musician typed survives a switch of tab (the form is redrawn every time)
const form = { artist: "", genre: "", links: "", bio: "", agree: false }

function loadCss() {
  if (document.querySelector(`link[data-nft][href="${CSS}"]`)) return
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = CSS
  link.dataset.nft = "1"
  document.head.appendChild(link)
}

async function api(path, options) {
  const res = await fetch(BACKEND + "/api/label" + path, { ...options, signal: AbortSignal.timeout(20000) })
  let data = {}
  try { data = await res.json() } catch (_) {}
  if (!res.ok && !data.status) throw new Error(data.error || "The server answered with " + res.status)
  return { ok: res.ok, data }
}

const STEPS = [
  { ico: "wallet", title: "Get a wallet", text: `No wallet yet? Open <a href="https://wallet.kukai.app" target="_blank" rel="noopener noreferrer">Kukai</a>, a Tezos wallet that lives in your browser. Sign in with email or Google and there is nothing to install. Keep its recovery phrase somewhere safe.` },
  { ico: "plug", title: "Connect it", text: "Press Connect wallet and pick your wallet in the list. FONY never sees your keys: the wallet signs for you." },
  { ico: "rocket", title: "Apply", text: "Tell us about your music and sign the application in your wallet. Once it is approved you get a small amount of tez to cover the network fees of your first releases." }
]

function stepsHtml(active) {
  return `<ol class="ob-steps">${STEPS.map((s, i) => `
    <li class="${i < active ? "done" : i === active ? "cur" : ""}">
      <span class="ob-n">${i < active ? ic("check") : i + 1}</span>
      <div><h4>${s.title}</h4><p>${s.text}</p></div>
    </li>`).join("")}</ol>`
}

function formHtml(busy) {
  return `
    <form class="ob-form" id="obForm" novalidate>
      <label class="ob-f"><span>Artist or project name</span><input class="nft-input" name="artist" maxlength="80" value="${esc(form.artist)}" required></label>
      <label class="ob-f wide"><span>Genre <i>optional</i></span><input class="nft-input" name="genre" maxlength="60" placeholder="Dub, ambient, techno…" value="${esc(form.genre)}"></label>
      <label class="ob-f wide"><span>Links to your music</span><textarea class="nft-input" name="links" rows="3" maxlength="600" placeholder="Bandcamp, SoundCloud, YouTube, socials: one per line" required>${esc(form.links)}</textarea></label>
      <label class="ob-f wide"><span>About you <i>optional</i></span><textarea class="nft-input" name="bio" rows="3" maxlength="1200" placeholder="A few words about what you make and what you want to release">${esc(form.bio)}</textarea></label>
      <input class="ob-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="ob-agree"><input type="checkbox" name="agree" ${form.agree ? "checked" : ""}><span>The music is mine.</span></label>
      <div class="ob-send">
        <button type="submit" class="nft-btn" ${busy ? "disabled" : ""}>${ic("rocket")} ${busy ? "Sending…" : "Sign and send"}</button>
        <p class="ob-msg" id="obMsg" role="status"></p>
      </div>
    </form>`
}

function resultHtml(st, go, explorer) {
  if (st.status === "pending") {
    return `<div class="ob-card"><span class="ob-badge">${ic("clock")}</span><h3>Application received</h3>
      <p>We read every application by hand. This page updates by itself once you are approved.</p></div>`
  }
  if (st.status === "approved") {
    return `<div class="ob-card ok"><span class="ob-badge">${ic("check")}</span><h3>You are in</h3>
      <p>Your application is approved. ${esc(st.amount || 1.5)} tez for network fees are on the way to your wallet.</p></div>`
  }
  const link = st.hash ? `<a class="nft-btn ghost" href="${esc(explorer + "/" + st.hash)}" target="_blank" rel="noopener noreferrer">View the transfer ${ic("external")}</a>` : ""
  return `<div class="ob-card ok"><span class="ob-badge">${ic("check")}</span><h3>Welcome to the label</h3>
    <p>${esc(st.amount || 1.5)} tez for network fees have been sent to your wallet. That is enough to publish your first releases.</p>
    <div class="ob-actions"><button type="button" class="nft-btn" data-go="factory">Create a release ${ic("right")}</button>${link}</div></div>`
}

export function drawOnboard(pane, { Wallet, connect, go, toast }) {
  loadCss()
  const { address } = Wallet.getState()
  let dead = false
  let timer = null
  let busy = false
  let shown = false   // a form or a status is on screen (not just the loading card)

  const shell = (body, active) => {
    pane.innerHTML = `
      <article class="ob">
        <header class="ob-hero">
          <h2>Join the label</h2>
          <p class="ob-lead">Release your music as a playable NFT on Tezos. Apply here: approved musicians get a one-time grant of tez to cover their first network fees.</p>
        </header>
        <div class="ob-body">
          <aside>${stepsHtml(active)}</aside>
          <section class="ob-main">${body}</section>
        </div>
      </article>`
    pane.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)))
  }

  function drawConnect() {
    shell(`<div class="ob-card"><span class="ob-badge">${ic("wallet")}</span><h3>Connect your wallet</h3>
      <p>The application is tied to your wallet address, so connect it first.</p>
      <div class="ob-actions"><button type="button" class="nft-btn" id="obConnect">${ic("wallet")} Connect wallet</button></div></div>`, 1)
    pane.querySelector("#obConnect").addEventListener("click", connect)
  }

  function drawChecking() {
    shell(`<div class="ob-card"><span class="ob-badge spin">${ic("refresh")}</span><h3>Checking your application…</h3></div>`, 2)
  }

  function drawForm(message) {
    shown = true
    shell(formHtml(busy), 2)
    const f = pane.querySelector("#obForm")
    const msg = pane.querySelector("#obMsg")
    if (message) { msg.textContent = message; msg.classList.add("err") }
    f.addEventListener("input", () => {
      const d = new FormData(f)
      for (const k of ["artist", "genre", "links", "bio"]) form[k] = String(d.get(k) || "")
      form.agree = f.elements.agree.checked
    })
    f.addEventListener("submit", (e) => { e.preventDefault(); submit(f, msg) })
  }

  function drawStatus(st) {
    shown = true
    shell(resultHtml(st, go, "https://tzkt.io"), 3)
    clearTimeout(timer)
    if (st.status === "pending" || st.status === "approved") timer = setTimeout(refresh, POLL_MS)
  }

  async function refresh() {
    if (dead) return
    try {
      const { data } = await api("/status?address=" + encodeURIComponent(address))
      if (dead) return
      if (data.status === "none") drawForm()
      else drawStatus(data)
    } catch (err) {
      if (dead) return
      // keep an application that is already on screen, only retry later
      if (!shown) shell(`<div class="ob-card"><span class="ob-badge">${ic("info")}</span><h3>Applications are not available right now</h3><p>${esc(String(err.message).replace(/[.]+$/, ""))}. Please try again in a moment.</p><div class="ob-actions"><button type="button" class="nft-btn ghost" id="obRetry">${ic("refresh")} Try again</button></div></div>`, 2)
      const retry = pane.querySelector("#obRetry")
      if (retry) retry.addEventListener("click", () => { drawChecking(); refresh() })
      else timer = setTimeout(refresh, POLL_MS)
    }
  }

  async function submit(f, msg) {
    if (busy) return
    const fail = (text) => { msg.textContent = text; msg.classList.add("err") }
    msg.classList.remove("err")
    const d = new FormData(f)
    if (!form.artist.trim()) return fail("Tell us your artist or project name.")
    if (!form.links.trim()) return fail("Add a link to your music.")
    if (!form.agree) return fail("Please tick the box at the end.")
    busy = true
    f.querySelector("button[type=submit]").disabled = true
    msg.textContent = "Confirm the signature in your wallet…"
    try {
      const ts = new Date().toISOString()
      const { signature, publicKey } = await Wallet.signText(`FONY Music Label application\n${address}\n${ts}`)
      msg.textContent = "Sending…"
      const { data } = await api("/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, website: d.get("website") || "", address, publicKey, signature, ts })
      })
      busy = false
      if (dead) return
      drawStatus({ status: data.status || "pending" })
    } catch (err) {
      busy = false
      if (dead) return
      const m = String((err && (err.message || err.title)) || "")
      drawForm(/abort|reject|cancel|denied/i.test(m) ? "Cancelled in the wallet." : (m.length < 200 && m ? m : "Could not send the application."))
    }
  }

  if (!address) drawConnect()
  else { drawChecking(); refresh() }

  return () => { dead = true; clearTimeout(timer) }
}
