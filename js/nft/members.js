// Who is a FONY artist (an approved application): a small list from the FONY server, kept for a few minutes.

const BACKEND = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app"
const TTL = 5 * 60 * 1000

let members = new Set()
let at = 0
let pending = null

export const isMember = (address) => !!address && members.has(address)

// Fetches the list when it is stale and resolves with true when it changed. Never throws: without the list nobody is marked.
export function refreshMembers() {
  if (pending) return pending
  if (Date.now() - at < TTL) return Promise.resolve(false)
  pending = fetch(BACKEND + "/api/label/members", { signal: AbortSignal.timeout(10000) })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      at = Date.now()
      if (!j || !Array.isArray(j.members)) return false
      const next = new Set(j.members)
      const changed = next.size !== members.size || [...next].some(a => !members.has(a))
      members = next
      return changed
    })
    .catch(() => false)
    .finally(() => { pending = null })
  return pending
}
