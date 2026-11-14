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

// Relay sockets behind a remote-signer session go stale after idle time or sleep, and
// then requests just hang. Rebuild the connection if it has not been used for a while.
async function liveSigner() {
  if (!session || session.method !== "nip46") throw new Error("The remote signer is not connected")
  if (bunkerSigner && Date.now() - bunkerUsedAt < SIGNER_FRESH_MS) { bunkerUsedAt = Date.now(); return bunkerSigner }
  const { BunkerSigner } = await loadNip46()
  const old = bunkerSigner
  bunkerSigner = makeSigner(BunkerSigner, hexToBytes(session.clientKey), { pubkey: session.bunker.pubkey, relays: session.bunker.relays, secret: null })
  bunkerUsedAt = Date.now()
  if (old) { try { await old.close() } catch (_) {} }
  // give the new subscription a moment to open before the first request
  await new Promise(r => setTimeout(r, 900))
  return bunkerSigner
}
const listeners = new Set()

function emit() {
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
  const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })
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
    try { await signer.close() } catch (_) {}
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
  return getSession()
}

export async function logout() {
  const signer = bunkerSigner
  bunkerSigner = null
  session = null
  persist()
  if (signer) { try { await signer.close() } catch (_) {} }
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
    const signer = await liveSigner()
    signed = await withTimeout(signer.signEvent({ ...template }), SIGN_TIMEOUT,
      "The signer did not answer. Open your signer app and approve the request, or log out and sign in again in Profile.")
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
  const signer = await liveSigner()
  return { scheme: "nip44", data: await withTimeout(signer.nip44Encrypt(session.pubkey, text), SIGN_TIMEOUT, "The signer did not answer. Approve the request in your signer app.") }
}

export async function decryptFromSelf(scheme, data) {
  if (!session) throw new Error("Connect a Nostr account first")
  if (session.method === "nip07") {
    if (!(await waitForNip07())) throw new Error("The Nostr extension is not available")
    const api = scheme === "nip04" ? window.nostr.nip04 : window.nostr.nip44
    if (!api || !api.decrypt) throw new Error("Your extension cannot decrypt this backup")
    return withTimeout(api.decrypt(session.pubkey, data), SIGN_TIMEOUT, "The extension did not answer")
  }
  const signer = await liveSigner()
  const fn = scheme === "nip04" ? signer.nip04Decrypt : signer.nip44Decrypt
  return withTimeout(fn.call(signer, session.pubkey, data), SIGN_TIMEOUT, "The signer did not answer. Approve the request in your signer app.")
}
