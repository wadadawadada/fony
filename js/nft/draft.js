// The Mint factory draft (cover, tracks, titles, terms, current step) survives a reload.
// Text lives next to the files in IndexedDB, because File objects cannot go into localStorage.
// It is not part of the Nostr backup (that only reads localStorage).

const DB = "fony-nft"
const STORE = "draft"
const KEY = "current"

// a draft older than this (since its last change) is deleted instead of restored
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

let dbPromise = null
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function loadDraft() {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY)
      r.onsuccess = () => resolve(r.result || null)
      r.onerror = () => resolve(null)
    })
  } catch (_) { return null }
}

export async function saveDraft(draft) {
  try {
    const db = await open()
    await new Promise((resolve) => {
      const t = db.transaction(STORE, "readwrite")
      t.objectStore(STORE).put(draft, KEY)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()   // e.g. the storage quota is full: the draft is simply not kept
    })
  } catch (_) {}
}

export async function clearDraft() {
  try {
    const db = await open()
    await new Promise((resolve) => {
      const t = db.transaction(STORE, "readwrite")
      t.objectStore(STORE).delete(KEY)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
    })
  } catch (_) {}
}
