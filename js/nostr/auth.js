// Nostr sign-in: NIP-07 (browser extension) and NIP-46 (remote signer / bunker).
//
// FONY never sees or stores a user's private key. With NIP-07 the extension signs.
// With NIP-46 a remote signer signs; the only secret kept locally is a throw-away
// *client* key that identifies this browser to the signer (it can be revoked in
// the signer app and is deleted on logout). Public data can be browsed with no
// sign-in at all.

import { loadTools, loadNip46, hexToBytes, bytesToHex } from "./lib.js"
import { isHexKey } from "./format.js"

const SESSION_KEY = "fonyNostrSession"
const SIGN_TIMEOUT = 60000
const FIRST_TRY_MS = 40000
const STALE_TRY_MS = 8000   // after idle time the old connection gets a short chance before it is rebuilt
const CONNECT_TIMEOUT = 90000

let session = null   // { method: "nip07" | "nip46", pubkey, clientKey?, bunker? }
let bunkerSigner = null
let bunkerUsedAt = 0
const SIGNER_FRESH_MS = 20000   // a signer connection idle for longer than this is rebuilt before use

// Some signers answer with an "auth_url": the user must approve in a page they open.
function onSignerAuth(url) {
  try {
    const u = new URL(String(url))
    if (u.protocol === "https:") window.open(u.toString(), "fony-nostr-auth", "width=520,height=720")
  } catch (_) {}
}

function makeSigner(BunkerSigner, clientKey, bp) {
  return new BunkerSigner(clientKey, bp, { onauth: onSignerAuth })
}

// Closes a signer AND its relay sockets (BunkerSigner.close() only drops the subscription, so every
// rebuild used to leave its sockets open; relays limit connections per client and eventually refuse).
async function destroySigner(signer) {
  if (!signer) return
  // signer.close() would send CLOSE frames over sockets that are often already dead (console spam
  // "WebSocket is already in CLOSING or CLOSED state"), so the sockets are simply dropped.
  try { signer.isOpen = false } catch (_) {}
  try {
    if (signer.pool && signer.pool.relays) {
      for (const r of signer.pool.relays.values()) {
        try { r._connected = false; r.close() } catch (_) {}
      }
    }
  } catch (_) {}
}

// A fresh connection is only trusted once the signer has answered a ping: the answer to a request is an
// ephemeral event, so a request sent before the subscription is really open would be lost (a fixed sleep
// was only a guess). A signer that replies with an error (e.g. "ping" unsupported) is alive too.
async function waitSignerReady(signer) {
  // let the relay sockets open first: a ping sent before the subscription exists is simply lost
  for (let w = 0; w < 30; w++) {
    try { if ([...signer.pool.listConnectionStatus().values()].some(Boolean)) break } catch (_) { break }
    await new Promise(r => setTimeout(r, 200))
  }
  await new Promise(r => setTimeout(r, 700))
  // short timeouts, more tries: a lost ping costs 4 s instead of 9 s
  for (let i = 0; i < 5; i++) {
    try {
      // A restored session never did the NIP-46 "connect" handshake in this browser session. Signers that forget
      // their clients after a restart stay silent until it is repeated (a fresh login does exactly that, which is
      // why logging out and in used to fix it). Any answer, even an error, proves the signer is alive.
      await withTimeout(i % 2 === 0 ? signer.connect() : signer.ping(), 4000, "ping timeout")
      return true
    } catch (err) {
      console.warn("[nostr] signer ping failed:", err && (err.message || err))
      if (!isTransportError(err)) return true
      // the relay socket is not usable (yet): give the network a moment
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  return false
}

// nostr-tools leaves a relay with a poisoned connection promise after a failed connect or a close, so every
// later send through that pool fails at once (AggregateError / "websocket error" / "connection timed out").
// That is a dead connection, not an answer from the signer. A real answer from the signer is a plain string.
function isTransportError(err) {
  if (!err) return false
  if (err.timedOut) return true
  if (typeof AggregateError !== "undefined" && err instanceof AggregateError) return true
  const msg = String(err && err.message ? err.message : err)
  if (err instanceof Error || typeof err === "string") {
    return /websocket|connection|closed|not open|sending on|timed out|network|socket/i.test(msg) && (err instanceof Error || msg.length < 60)
  }
  return false
}

// Relay sockets behind a remote-signer session go stale after idle time or sleep, and
// then requests just hang. Rebuild the connection if it has not been used for a while
// (or when `force` is set after a request got no answer).
async function liveSigner(force = false) {
  if (!session || session.method !== "nip46") throw new Error("The remote signer is not connected")
  // an existing connection is tried first even after a long idle time; it is only rebuilt when it fails to answer
  if (!force && bunkerSigner) return bunkerSigner
  const { BunkerSigner } = await loadNip46()
  const old = bunkerSigner
  bunkerSigner = makeSigner(BunkerSigner, hexToBytes(session.clientKey), { pubkey: session.bunker.pubkey, relays: session.bunker.relays, secret: null })
  bunkerUsedAt = Date.now()
  if (old) destroySigner(old).catch(() => {})   // in the background: closing a dead socket must not delay the request
  return bunkerSigner
}

// Only one rebuild runs at a time and everyone waiting for a connection shares it. Before, the background
// health check, presence updates and a user action each rebuilt the signer on their own and destroyed each
// other's fresh connection ("this signer is not open anymore").
let rebuilding = null
function rebuildSigner() {
  if (!rebuilding) {
    rebuilding = (async () => {
      const signer = await liveSigner(true)
      const ok = await waitSignerReady(signer)
      return { signer, ok }
    })().finally(() => { rebuilding = null })
  }
  return rebuilding
}

// Runs one signer request. No answer in time usually means the connection went stale: it is rebuilt and
// the request is sent once more, so the user does not have to log out and in again. An answer that says
// "no" (the user denied it, an error) is passed on as it is.
async function viaSigner(call, message) {
  if (rebuilding) { try { await rebuilding } catch (_) {} }
  const stale = !bunkerSigner || Date.now() - bunkerUsedAt >= SIGNER_FRESH_MS
  let signer = await liveSigner()
  try {
    const out = await withTimeout(call(signer), stale ? STALE_TRY_MS : FIRST_TRY_MS, message)
    bunkerUsedAt = Date.now()
    return out
  } catch (err) {
    if (!isTransportError(err)) { bunkerUsedAt = Date.now(); throw err }
  }
  signer = (await rebuildSigner()).signer
  try {
    const out = await withTimeout(call(signer), SIGN_TIMEOUT, message)
    bunkerUsedAt = Date.now()
    return out
  } catch (err) {
    if (isTransportError(err) && !err.timedOut) {
      bunkerUsedAt = 0
      throw new Error("Cannot reach the signer's relays right now. Check your internet connection and that the signer app is online, then try again.")
    }
    bunkerUsedAt = 0   // the next request starts from a clean connection
    throw err
  }
}
const listeners = new Set()

function emit() {
  staleReported = false   // a new login or a logout starts the count again
  for (const fn of listeners) { try { fn(getSession()) } catch (_) {} }
  document.dispatchEvent(new CustomEvent("fony:nostr-auth", { detail: getSession() }))
}

export function onAuthChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSession() {
  return session ? { method: session.method, pubkey: session.pubkey } : null
}

export function isLoggedIn() {
  return !!session
}

export function hasNip07() {
  return typeof window !== "undefined" && !!window.nostr && typeof window.nostr.signEvent === "function"
}

function withTimeout(promise, ms, message) {
  let timer
  const t = new Promise((_, reject) => { timer = setTimeout(() => { const e = new Error(message); e.timedOut = true; reject(e) }, ms) })
  return Promise.race([promise, t]).finally(() => clearTimeout(timer))
}

// Extensions inject window.nostr a little after page load.
async function waitForNip07(ms = 1500) {
  const end = Date.now() + ms
  while (!hasNip07() && Date.now() < end) await new Promise(r => setTimeout(r, 100))
  return hasNip07()
}

function persist() {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (_) {}
}

export async function loginNip07() {
  if (!(await waitForNip07())) {
    throw new Error("No Nostr extension found. Install one (Alby, nos2x, Nostr Connect…) or use a remote signer.")
  }
  const pubkey = await withTimeout(window.nostr.getPublicKey(), SIGN_TIMEOUT, "The extension did not answer")
  if (!isHexKey(pubkey)) throw new Error("The extension returned an invalid public key")
  session = { method: "nip07", pubkey }
  persist()
  emit()
  return getSession()
}

// `input` is a bunker:// URI or a NIP-05 address of a signer.
export async function loginNip46(input) {
  const text = String(input || "").trim()
  if (!text) throw new Error("Paste a bunker:// link from your remote signer")
  const { generateSecretKey } = await loadTools()
  const { BunkerSigner, parseBunkerInput } = await loadNip46()
  const bp = await parseBunkerInput(text)
  if (!bp || !isHexKey(bp.pubkey) || !Array.isArray(bp.relays) || !bp.relays.length) {
    throw new Error("That is not a valid bunker:// link (it needs a signer key and at least one relay)")
  }
  const clientKey = generateSecretKey()
  const signer = makeSigner(BunkerSigner, clientKey, bp)
  try {
    await withTimeout(signer.connect(), CONNECT_TIMEOUT, "The remote signer did not answer. Approve the connection in your signer app and try again.")
    const pubkey = await withTimeout(signer.getPublicKey(), SIGN_TIMEOUT, "The remote signer did not return your public key")
    if (!isHexKey(pubkey)) throw new Error("The remote signer returned an invalid public key")
    bunkerSigner = signer
    bunkerUsedAt = Date.now()
    // the one-time connection secret is not kept
    session = { method: "nip46", pubkey, clientKey: bytesToHex(clientKey), bunker: { pubkey: bp.pubkey, relays: bp.relays } }
    persist()
    emit()
    return getSession()
  } catch (err) {
    await destroySigner(signer)
    throw err
  }
}

// Called on start-up. Never prompts the user.
export async function restoreSession() {
  if (session) return getSession()
  let saved
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") } catch (_) { saved = null }
  if (!saved || !isHexKey(saved.pubkey)) return null
  if (saved.method === "nip07") {
    session = { method: "nip07", pubkey: saved.pubkey }
  } else if (saved.method === "nip46" && isHexKey(saved.clientKey) && saved.bunker && isHexKey(saved.bunker.pubkey) && Array.isArray(saved.bunker.relays)) {
    try {
      const { BunkerSigner } = await loadNip46()
      bunkerSigner = makeSigner(BunkerSigner, hexToBytes(saved.clientKey), { pubkey: saved.bunker.pubkey, relays: saved.bunker.relays, secret: null })
      session = { method: "nip46", pubkey: saved.pubkey, clientKey: saved.clientKey, bunker: saved.bunker }
    } catch (_) {
      return null
    }
  } else {
    return null
  }
  emit()
  checkAndReport(0)
  return getSession()
}

// Checks that a remote signer still answers (NIP-46 only). Returns "ok", "stale" (no answer even on a
// fresh connection: the signer app is offline or revoked this client) or "skip" (nothing to check).
// Never prompts. A failed check only reports; it does not log out, since the signer may be briefly offline.
let checking = null
export function checkSession() {
  if (!session || session.method !== "nip46" || (typeof navigator !== "undefined" && navigator.onLine === false)) return Promise.resolve("skip")
  if (checking) return checking
  checking = (async () => {
    try {
      if (bunkerSigner) {
        try { await withTimeout(bunkerSigner.ping(), STALE_TRY_MS, "ping timeout"); bunkerUsedAt = Date.now(); return "ok" } catch (err) {
          if (!isTransportError(err)) { bunkerUsedAt = Date.now(); return "ok" }
        }
      }
      return (await rebuildSigner()).ok ? "ok" : "stale"
    } catch (_) {
      return "stale"
    } finally {
      checking = null
    }
  })()
  return checking
}

// the warning is shown once per connection, not on every tab focus or reconnect while the signer stays silent
let staleReported = false
let lastCheck = 0
function checkAndReport(minGap) {
  if (!session || Date.now() - lastCheck < minGap) return
  lastCheck = Date.now()
  // a signer app that is waking up (or a network that is still coming up after boot) gets a second chance before the user is warned
  checkSession().then(async r => {
    if (r === "stale") { await new Promise(res => setTimeout(res, 12000)); r = await checkSession() }
    if (r === "ok") staleReported = false
    // only for someone who is connected to Nostr (a saved signer session), and only the first time
    if (r === "stale" && session && !staleReported) {
      staleReported = true
      document.dispatchEvent(new CustomEvent("fony:nostr-stale"))
    }
  }).catch(() => {})
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkAndReport(60000) })
  window.addEventListener("online", () => checkAndReport(10000))
}

export async function logout() {
  const signer = bunkerSigner
  bunkerSigner = null
  session = null
  persist()
  if (signer) await destroySigner(signer)
  emit()
}

// Sign an unsigned event template. The result is verified and must belong to the
// signed-in account.
export async function signEvent(template) {
  if (!session) throw new Error("Connect a Nostr account first")
  const { verifyEvent } = await loadTools()
  let signed
  if (session.method === "nip07") {
    if (!(await waitForNip07())) throw new Error("The Nostr extension is not available")
    signed = await withTimeout(window.nostr.signEvent({ ...template }), SIGN_TIMEOUT, "Signing timed out. Approve the request in your extension.")
  } else {
    signed = await viaSigner(signer => signer.signEvent({ ...template }),
      "The signer did not answer. Open your signer app and approve the request, then try again.")
  }
  if (!signed || !verifyEvent(signed)) throw new Error("The signer returned an invalid event")
  if (signed.pubkey !== session.pubkey) throw new Error("The signer used a different account than the one connected")
  return signed
}

// ---------------------------------------------------------------- NIP-46, client-initiated (nostrconnect://)
//
// FONY shows a nostrconnect:// link / QR code; the user approves it in a signer
// app (Amber, nsec.app, Alby Hub, …). The signer answers over the relays with an
// encrypted "connect" response that carries our one-time secret. Only then is the
// session created.

import { subscribe, getRelays, DEFAULT_RELAYS } from "./client.js"

const CONNECT_WAIT = 180000
const CONNECT_PERMS = "get_public_key,sign_event:30001,sign_event:30315,sign_event:30078,sign_event:5,nip44_encrypt,nip44_decrypt,nip04_encrypt,nip04_decrypt"

function randomHex(bytes) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return bytesToHex(a)
}

// Returns { uri, done, cancel }. `done` resolves with the session when the signer approves.
export async function startNostrConnect() {
  const tools = await loadTools()
  const { BunkerSigner } = await loadNip46()
  const clientKey = tools.generateSecretKey()
  const clientPub = tools.getPublicKey(clientKey)
  const secret = randomHex(16)
  const relays = [...new Set([...getRelays(), ...DEFAULT_RELAYS])].slice(0, 3)
  const params = new URLSearchParams()
  for (const r of relays) params.append("relay", r)
  params.set("secret", secret)
  params.set("name", "FONY")
  params.set("url", location.origin)
  params.set("perms", CONNECT_PERMS)
  const uri = `nostrconnect://${clientPub}?${params.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`

  let stop = null
  let finished = false
  let rejectWait = null
  const cancel = () => {
    finished = true
    if (stop) { stop(); stop = null }
    if (rejectWait) rejectWait(new Error("Cancelled"))
  }

  const done = new Promise((resolve, reject) => {
    rejectWait = reject
    const timer = setTimeout(() => { finished = true; if (stop) { stop(); stop = null }; reject(new Error("Expired")) }, CONNECT_WAIT)
    const convKeyFor = (pk) => tools.nip44.getConversationKey(clientKey, pk)
    stop = subscribe({ kinds: [24133], "#p": [clientPub], since: Math.floor(Date.now() / 1000) - 10 }, async (ev) => {
      if (finished) return
      let text
      try {
        text = ev.content.includes("?iv=") ? tools.nip04.decrypt(clientKey, ev.pubkey, ev.content) : tools.nip44.decrypt(ev.content, convKeyFor(ev.pubkey))
      } catch (_) { return }
      let msg
      try { msg = JSON.parse(text) } catch (_) { return }
      if (!msg || (msg.result !== secret && msg.result !== "ack")) return
      // "ack" is only accepted from signers that predate the secret echo; the secret in our private link is what authenticates the rest
      finished = true
      clearTimeout(timer)
      if (stop) { stop(); stop = null }
      try {
        const signer = makeSigner(BunkerSigner, clientKey, { pubkey: ev.pubkey, relays, secret: null })
        const pubkey = await withTimeout(signer.getPublicKey(), 45000, "The signer did not return your public key")
        if (!isHexKey(pubkey)) throw new Error("The signer returned an invalid public key")
        bunkerSigner = signer
        bunkerUsedAt = Date.now()
        session = { method: "nip46", pubkey, clientKey: bytesToHex(clientKey), bunker: { pubkey: ev.pubkey, relays } }
        persist()
        emit()
        resolve(getSession())
      } catch (err) { reject(err) }
    }, { relays })
  })
  // avoid an unhandled rejection when the caller only uses cancel()
  done.catch(() => {})
  return { uri, done, cancel }
}

// ---------------------------------------------------------------- encrypt to self (NIP-44, NIP-04 fallback)

export async function encryptToSelf(text) {
  if (!session) throw new Error("Connect a Nostr account first")
  if (session.method === "nip07") {
    if (!(await waitForNip07())) throw new Error("The Nostr extension is not available")
    if (window.nostr.nip44 && window.nostr.nip44.encrypt) {
      return { scheme: "nip44", data: await withTimeout(window.nostr.nip44.encrypt(session.pubkey, text), SIGN_TIMEOUT, "The extension did not answer") }
    }
    if (window.nostr.nip04 && window.nostr.nip04.encrypt) {
      return { scheme: "nip04", data: await withTimeout(window.nostr.nip04.encrypt(session.pubkey, text), SIGN_TIMEOUT, "The extension did not answer") }
    }
    throw new Error("Your extension cannot encrypt (needs NIP-44 or NIP-04)")
  }
  return { scheme: "nip44", data: await viaSigner(signer => signer.nip44Encrypt(session.pubkey, text), "The signer did not answer. Approve the request in your signer app.") }
}

export async function decryptFromSelf(scheme, data) {
  if (!session) throw new Error("Connect a Nostr account first")
  if (session.method === "nip07") {
    if (!(await waitForNip07())) throw new Error("The Nostr extension is not available")
    const api = scheme === "nip04" ? window.nostr.nip04 : window.nostr.nip44
    if (!api || !api.decrypt) throw new Error("Your extension cannot decrypt this backup")
    return withTimeout(api.decrypt(session.pubkey, data), SIGN_TIMEOUT, "The extension did not answer")
  }
  return viaSigner(signer => (scheme === "nip04" ? signer.nip04Decrypt : signer.nip44Decrypt).call(signer, session.pubkey, data), "The signer did not answer. Approve the request in your signer app.")
}
