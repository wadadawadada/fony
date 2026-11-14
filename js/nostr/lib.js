// Lazy loader for nostr-tools. It is only fetched when the user opens the Nostr
// mode (or a Nostr link), so people who never touch Nostr download nothing extra.
// The version is pinned; nostr-tools bundles the audited @noble/@scure crypto.

const VERSION = "2.10.4"
const BASE = `https://cdn.jsdelivr.net/npm/nostr-tools@${VERSION}`

let core = null
let nip46 = null

export function loadTools() {
  if (!core) core = import(`${BASE}/+esm`).catch(err => { core = null; throw err })
  return core
}

export function loadNip46() {
  if (!nip46) nip46 = import(`${BASE}/nip46/+esm`).catch(err => { nip46 = null; throw err })
  return nip46
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

export function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
}
