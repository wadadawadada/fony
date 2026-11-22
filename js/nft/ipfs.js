// IPFS pinning with the user's own Pinata account. objkt has no public upload API, so files go
// straight from the browser to Pinata; the JWT stays in this browser (it is left out of Nostr backups).

const KEY = "fonyNftPinataJwt"
const ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS"

// A pasted key often carries spaces, line breaks, quotes or a "Bearer " prefix: strip them.
export function cleanJwt(value) {
  return String(value || "").replace(/^\s*bearer\s+/i, "").replace(/[\s"'`]+/g, "")
}

// A JWT is three base64url parts joined by dots (the first starts with "eyJ").
export function looksLikeJwt(value) {
  return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(cleanJwt(value))
}

export function getJwt() {
  try { return localStorage.getItem(KEY) || "" } catch (_) { return "" }
}

export function setJwt(value) {
  try {
    const v = cleanJwt(value)
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
  } catch (_) {}
}

// a stored value that is not a real JWT (an old bad paste) counts as "no key", so the studio asks for it again
export function hasJwt() { return looksLikeJwt(getJwt()) }

// Asks Pinata whether the key works. "ok" | "bad" | "unknown" (no answer, e.g. offline).
export async function testJwt(jwt = getJwt()) {
  jwt = cleanJwt(jwt)
  try {
    const res = await fetch("https://api.pinata.cloud/data/testAuthentication", { headers: { Authorization: "Bearer " + jwt } })
    return res.ok ? "ok" : "bad"
  } catch (_) { return "unknown" }
}

// Uploads a File/Blob, resolves "ipfs://<cid>". onProgress(0..1) when the browser reports it.
export function pinFile(file, name, onProgress) {
  const jwt = getJwt()
  if (!jwt) return Promise.reject(new Error("Add your Pinata key in the studio settings first"))
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append("file", file, name || file.name || "file")
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }))
    form.append("pinataMetadata", JSON.stringify({ name: name || file.name || "fony" }))
    const xhr = new XMLHttpRequest()
    xhr.open("POST", ENDPOINT)
    xhr.setRequestHeader("Authorization", "Bearer " + jwt)
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onerror = () => reject(new Error("Could not reach Pinata. Check your connection."))
    xhr.onload = () => {
      let body = null
      try { body = JSON.parse(xhr.responseText) } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300 && body && body.IpfsHash) return resolve("ipfs://" + body.IpfsHash)
      if (xhr.status === 401 || xhr.status === 403 || /malformed|invalid.*token|segments/i.test(xhr.responseText || "")) {
        return reject(new Error("Pinata does not accept the saved key. Open the Connect step and paste the JWT again (the long text that starts with eyJ)."))
      }
      const why = (body && (body.error && (body.error.details || body.error.reason || body.error))) || xhr.status
      reject(new Error("Pinata refused the upload: " + (typeof why === "string" ? why : JSON.stringify(why))))
    }
    xhr.send(form)
  })
}

export function pinJson(obj, name) {
  return pinFile(new Blob([JSON.stringify(obj)], { type: "application/json" }), name || "metadata.json")
}

export function pinHtml(html, name) {
  return pinFile(new Blob([html], { type: "text/html" }), name || "player.html")
}
