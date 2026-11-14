// Relay client: plain WebSocket connections with timeouts and failure handling.
// Every event that comes in is signature-checked (nostr-tools verifyEvent) before
// anyone else sees it. There is no required backend: relays are user-configurable.

import { loadTools } from "./lib.js"
import { normalizeRelayUrl } from "./format.js"

export const DEFAULT_RELAYS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://offchain.pub"
]

const RELAYS_KEY = "fonyNostrRelays"
const CONNECT_TIMEOUT = 5000
const QUERY_TIMEOUT = 7000
const PUBLISH_TIMEOUT = 6000
const IDLE_CLOSE = 60000
const RETRY_COOLDOWN = 8000
const MAX_EVENT_BYTES = 300 * 1024

// ---- relay list settings ----

export function getRelays() {
  try {
    const saved = JSON.parse(localStorage.getItem(RELAYS_KEY) || "null")
    if (Array.isArray(saved)) {
      const list = [...new Set(saved.map(normalizeRelayUrl).filter(Boolean))]
      if (list.length) return list
    }
  } catch (_) {}
  return DEFAULT_RELAYS.slice()
}

export function setRelays(list) {
  const clean = [...new Set((list || []).map(normalizeRelayUrl).filter(Boolean))].slice(0, 12)
  if (!clean.length) {
    try { localStorage.removeItem(RELAYS_KEY) } catch (_) {}
    return DEFAULT_RELAYS.slice()
  }
  try { localStorage.setItem(RELAYS_KEY, JSON.stringify(clean)) } catch (_) {}
  return clean
}

export function resetRelays() {
  try { localStorage.removeItem(RELAYS_KEY) } catch (_) {}
  return DEFAULT_RELAYS.slice()
}

// ---- one relay connection ----

class RelayConn {
  constructor(url) {
    this.url = url
    this.ws = null
    this.opening = null
    this.subs = new Map()      // subId -> { onevent, oneose, onclosed }
    this.acks = new Map()      // event id -> { resolve, timer }
    this.failedAt = 0
    this.idleTimer = null
    this.status = "idle"       // idle | connecting | open | failed
  }

  open(force = false) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve()
    if (this.opening) return this.opening
    if (!force && this.failedAt && Date.now() - this.failedAt < RETRY_COOLDOWN) {
      return Promise.reject(new Error("relay recently failed"))
    }
    this.status = "connecting"
    this.opening = new Promise((resolve, reject) => {
      let settled = false
      let ws
      let timer
      const fail = (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.failedAt = Date.now()
        this.status = "failed"
        this.opening = null
        try { ws && ws.close() } catch (_) {}
        reject(err)
      }
      try { ws = new WebSocket(this.url) } catch (err) { fail(err); return }
      timer = setTimeout(() => fail(new Error("connect timeout")), CONNECT_TIMEOUT)
      ws.onopen = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.ws = ws
        this.opening = null
        this.failedAt = 0
        this.status = "open"
        resolve()
      }
      ws.onerror = () => fail(new Error("socket error"))
      ws.onclose = () => {
        if (!settled) { fail(new Error("closed")); return }
        this.handleClose(ws)
      }
      ws.onmessage = (m) => this.handleMessage(m.data)
    })
    return this.opening
  }

  handleClose(ws) {
    if (this.ws !== ws) return
    this.ws = null
    if (this.status === "open") this.status = "idle"
    for (const [, sub] of this.subs) sub.onclosed && sub.onclosed("connection closed")
    this.subs.clear()
    for (const [, ack] of this.acks) { clearTimeout(ack.timer); ack.resolve({ ok: false, reason: "connection closed" }) }
    this.acks.clear()
  }

  handleMessage(data) {
    if (typeof data !== "string" || data.length > MAX_EVENT_BYTES) return
    let msg
    try { msg = JSON.parse(data) } catch (_) { return }
    if (!Array.isArray(msg)) return
    const [type, a, b, c] = msg
    if (type === "EVENT") {
      const sub = this.subs.get(a)
      if (sub && b && typeof b === "object") sub.onevent(b)
    } else if (type === "EOSE") {
      const sub = this.subs.get(a)
      if (sub && sub.oneose) sub.oneose()
    } else if (type === "CLOSED") {
      const sub = this.subs.get(a)
      if (sub) { this.subs.delete(a); sub.onclosed && sub.onclosed(String(b || "closed")) }
    } else if (type === "OK") {
      const ack = this.acks.get(a)
      if (ack) {
        clearTimeout(ack.timer)
        this.acks.delete(a)
        ack.resolve({ ok: b === true, reason: typeof c === "string" ? c : "" })
      }
    }
  }

  touch() {
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (!this.subs.size && !this.acks.size) this.close()
    }, IDLE_CLOSE)
  }

  close() {
    clearTimeout(this.idleTimer)
    const ws = this.ws
    this.ws = null
    this.status = "idle"
    if (ws) { try { ws.close() } catch (_) {} }
  }

  send(arr) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("not connected")
    this.ws.send(JSON.stringify(arr))
    this.touch()
  }

  subscribe(subId, filters, handlers) {
    this.subs.set(subId, handlers)
    this.send(["REQ", subId, ...filters])
  }

  unsubscribe(subId) {
    if (!this.subs.has(subId)) return
    this.subs.delete(subId)
    try { this.send(["CLOSE", subId]) } catch (_) {}
  }

  publish(event) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.acks.delete(event.id)
        resolve({ ok: false, reason: "timeout" })
      }, PUBLISH_TIMEOUT)
      this.acks.set(event.id, { resolve, timer })
      try { this.send(["EVENT", event]) } catch (err) {
        clearTimeout(timer)
        this.acks.delete(event.id)
        resolve({ ok: false, reason: String(err.message || err) })
      }
    })
  }
}

const conns = new Map()
function conn(url) {
  let c = conns.get(url)
  if (!c) { c = new RelayConn(url); conns.set(url, c) }
  return c
}

export function relayStatuses() {
  return getRelays().map(url => ({ url, status: conns.get(url)?.status || "idle" }))
}

let subCounter = 0

// One-shot query across relays. Resolves with the verified, de-duplicated events
// once every relay has finished (EOSE) or the timeout hits. Never rejects because
// of a relay: relays that are down are skipped.
export async function query(filters, opts = {}) {
  const relays = (opts.relays && opts.relays.length ? opts.relays : getRelays())
  const timeout = opts.timeout || QUERY_TIMEOUT
  const limitTotal = opts.limitTotal || 1000
  const { verifyEvent } = await loadTools()
  const events = new Map()
  const filterList = Array.isArray(filters) ? filters : [filters]

  await Promise.all(relays.map(url => new Promise((done) => {
    const c = conn(url)
    const subId = "fony" + (++subCounter).toString(36) + Math.random().toString(36).slice(2, 6)
    let finished = false
    let timer
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      c.unsubscribe(subId)
      done()
    }
    timer = setTimeout(finish, timeout)
    c.open().then(() => {
      if (finished) return
      c.subscribe(subId, filterList, {
        onevent: (ev) => {
          if (events.size >= limitTotal || !ev || events.has(ev.id)) return
          try { if (!verifyEvent(ev)) return } catch (_) { return }
          events.set(ev.id, ev)
        },
        oneose: finish,
        onclosed: finish
      })
    }).catch(finish)
  })))
  return [...events.values()]
}

// Long-lived subscription (used while waiting for a remote signer to answer).
// Returns a close() function. Relays that are down are skipped.
export function subscribe(filters, onevent, opts = {}) {
  const relays = (opts.relays && opts.relays.length ? opts.relays : getRelays())
  const filterList = Array.isArray(filters) ? filters : [filters]
  const ids = []
  let closed = false
  loadTools().then(({ verifyEvent }) => {
    for (const url of relays) {
      const c = conn(url)
      const subId = "fonylive" + (++subCounter).toString(36) + Math.random().toString(36).slice(2, 6)
      c.open().then(() => {
        if (closed) return
        ids.push([c, subId])
        c.subscribe(subId, filterList, {
          onevent: (ev) => { try { if (ev && verifyEvent(ev)) onevent(ev) } catch (_) {} },
          oneose: () => {},
          onclosed: () => {}
        })
      }).catch(() => {})
    }
  }).catch(() => {})
  return () => {
    closed = true
    for (const [c, id] of ids) c.unsubscribe(id)
  }
}

// Publish a signed event. Resolves { ok: [urls], failed: [{url, reason}] } and
// throws when no relay accepted it.
export async function publish(event, opts = {}) {
  const relays = (opts.relays && opts.relays.length ? opts.relays : getRelays())
  const results = await Promise.all(relays.map(async (url) => {
    try {
      const c = conn(url)
      await c.open(true)   // an explicit publish always retries, whatever happened before
      const r = await c.publish(event)
      return { url, ...r }
    } catch (err) {
      return { url, ok: false, reason: String(err.message || err) }
    }
  }))
  const ok = results.filter(r => r.ok).map(r => r.url)
  const failed = results.filter(r => !r.ok).map(r => ({ url: r.url, reason: r.reason }))
  if (!ok.length) {
    const why = failed.map(f => `${f.url.replace(/^wss:\/\//, "")}: ${f.reason || "no answer"}`).join("; ")
    const err = new Error("No relay accepted the event" + (why ? ` — ${why}` : ""))
    err.failed = failed
    throw err
  }
  return { ok, failed }
}

// Fire-and-forget publish over sockets that are already open (the page is closing).
export function publishBestEffort(event) {
  for (const c of conns.values()) {
    try { if (c.ws && c.ws.readyState === WebSocket.OPEN) c.send(["EVENT", event]) } catch (_) {}
  }
}

export function closeAll() {
  for (const c of conns.values()) c.close()
}
