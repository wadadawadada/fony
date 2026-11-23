// Collection recommendations as a short pipeline inside one console message:
//   1. the AI sorts the collection into genres,
//   2. the person picks a genre,
//   3. the person picks the kind of picks (deep cuts / well known / mix),
//   4. the AI suggests tracks, each one is checked against Discogs (real release? which year? cover?) and shown
//      with its cover, year and a one-line reason. Verified tracks come first; ones Discogs does not know are dropped.
// The card redraws itself in place, so the console keeps one tidy message instead of a growing thread.

import { addTrackToCollection, getCollection } from "./collection.js"
import { isMissing, markMissing } from "./missing.js"

const BACKEND = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app"
const MAX_COLLECTION = 80       // tracks sent to the AI
const ASK = 12                  // tracks requested per round (a few will not survive the check)
const SHOW = 6                  // tracks shown per round
const cards = new Map()
let counter = 0

const MODES = {
  deep: { icon: "💎", name: "Deep cuts", text: "rarer tracks, underground, overlooked gems", ask: "obscure, underground, cult or overlooked tracks. Avoid the best-known hits and the genre's usual staples; prefer lesser-known artists, small labels and B-sides" },
  known: { icon: "⭐", name: "Well known", text: "the classics and landmark tracks everyone knows", ask: "essential, widely recognised classics and landmark tracks of the genre that every fan should know" },
  mix: { icon: "🎲", name: "A bit of both", text: "half classics, half deeper cuts", ask: "a mix: about half landmark tracks of the genre and half deeper cuts" }
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

// ---------------------------------------------------------------- AI

async function ask(system, user, maxTokens) {
  const resp = await fetch(`${BACKEND}/api/openai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: maxTokens,
      reasoning_effort: "minimal"
    })
  })
  if (!resp.ok) throw new Error("The AI is not available right now.")
  const data = await resp.json()
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  if (!text) throw new Error("The AI sent an empty answer.")
  return text
}

// The AI answers in plain lines separated by " | ", not JSON: a stray quote in a title cannot break it.
function lines(text) {
  return String(text).replace(/```\w*/g, "").split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(l => l.includes("|"))
    .map(l => l.split("|").map(p => p.trim()))
}

async function groupGenres(collection) {
  const list = collection.slice(0, MAX_COLLECTION).map((t, i) => `${i + 1}. ${t.artist} - ${t.track}`).join("\n")
  const system =
    "You sort a person's music collection into genres. Use specific genres or subgenres (for example 'dub techno', 'trip hop', '90s jungle'), not broad labels like 'electronic'. " +
    "Make 2 to 6 groups; every track belongs to at most one group. Reply with one group per line, exactly in this format and nothing else: " +
    "genre name | track numbers separated by commas | what ties these tracks together, at most 12 words"
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows = lines(await ask(system, "Collection:\n" + list, 700))
    const genres = rows
      .map(([name, nums, note]) => ({ name: (name || "").replace(/^genre name:?/i, "").trim(), count: (nums || "").split(/[,\s]+/).filter(n => /^\d+$/.test(n)).length, note: note || "" }))
      .filter(g => g.name && g.name.length < 50)
      .slice(0, 6)
    if (genres.length) return genres
  }
  throw new Error("The AI answer could not be read. Try again.")
}

async function suggest(card) {
  const mode = MODES[card.mode]
  const list = card.collection.slice(0, MAX_COLLECTION).map(t => `${t.artist} - ${t.track}`).join("\n")
  const seen = card.shown.map(t => `${t.artist} - ${t.title}`).join("\n")
  const system =
    `You are a music expert recommending real, existing tracks. Genre: ${card.genre.name}. Suggest ${mode.ask}. ` +
    `Suggest exactly ${ASK} tracks, each by a different artist, none by an artist already in the collection and none from the 'already suggested' list. ` +
    "Only tracks you are sure exist, with the exact artist and title as released. " +
    "Reply with one track per line, exactly in this format and nothing else: artist | title | year | why it fits, at most 14 words"
  for (let attempt = 0; attempt < 2; attempt++) {
    const tracks = lines(await ask(system, `Collection (for taste):\n${list}\n\nAlready suggested:\n${seen || "none"}`, 1500))
      .map(([artist, title, year, why]) => ({ artist: artist || "", title: title || "", aiYear: Number(year) || 0, why: why || "" }))
      .filter(t => t.artist && t.title)
    if (tracks.length) return tracks
  }
  return []
}

// ---------------------------------------------------------------- Discogs check

const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\b(feat|ft|featuring)\b.*$/, " ").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "")

// "ok" with the release, "miss" when Discogs has nothing that matches, "error" when Discogs cannot be reached
async function lookup(artist, title) {
  const q = `${artist} ${title}`.replace(/["'‘’“”]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  const key = "discogs:" + q
  if (isMissing(key)) return { status: "miss" }
  try {
    const resp = await fetch(`${BACKEND}/api/discogs/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) })
    if (resp.status === 404) { markMissing(key); return { status: "miss" } }
    if (!resp.ok) return { status: "error" }
    const rel = await resp.json()
    const a = norm(artist), t = norm(title)
    const artistOk = (rel.artists || []).some(x => { const n = norm(x.name); return n && (n.includes(a) || a.includes(n)) })
    const titleOk = (rel.tracklist || []).some(x => { const n = norm(x.title); return n && (n.includes(t) || t.includes(n)) }) || norm(rel.title).includes(t)
    // ok: this very track is on the release. partial: the artist is on Discogs, the track just is not on the release found
    return artistOk && titleOk ? { status: "ok", rel } : artistOk ? { status: "partial", rel } : { status: "miss" }
  } catch (_) {
    return { status: "error" }
  }
}

async function verify(tracks) {
  const out = new Array(tracks.length)
  let next = 0
  const worker = async () => {
    while (next < tracks.length) {
      const i = next++
      const r = await lookup(tracks[i].artist, tracks[i].title)
      out[i] = { ...tracks[i], status: r.status, rel: r.rel || null }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return out
}

function decorate(t) {
  const rel = t.rel
  if (!rel) return { ...t, year: t.aiYear || 0, cover: "", style: "", link: "" }
  const img = rel.images && rel.images[0]
  return {
    ...t,
    year: Number(rel.year) || t.aiYear || 0,
    cover: img ? (img.uri150 || img.uri || "") : "",
    style: (rel.styles && rel.styles[0]) || (rel.genres && rel.genres[0]) || "",
    link: rel.uri || (rel.id ? `https://www.discogs.com/release/${rel.id}` : "")
  }
}

// ---------------------------------------------------------------- rendering

const css = `
.rec { font-size: 0.92em; line-height: 1.45; }
.rec-dim { opacity: 0.6; }
.rec-head { margin-bottom: 8px; }
.rec-head b { color: #00F2B8; font-weight: 600; }
.rec-chips { display: flex; flex-wrap: wrap; gap: 4px 18px; }
.rec-chip { font: inherit; color: #00F2B8; cursor: pointer; padding: 2px 0; background: none; border: 0; border-bottom: 1px dashed rgba(0, 242, 184, 0.35); transition: border-color 0.18s, transform 0.12s; }
.rec-chip:hover { border-bottom-color: #00F2B8; border-bottom-style: solid; }
.rec-modes { display: flex; flex-direction: column; gap: 4px; }
.rec-mode { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; width: fit-content; max-width: 100%; text-align: left; font: inherit; color: #00F2B8; cursor: pointer; padding: 2px 0; background: none; border: 0; }
.rec-mode small { font-size: 0.85em; opacity: 0.6; color: inherit; }
.rec-mode > span { border-bottom: 1px dashed rgba(0, 242, 184, 0.35); transition: border-color 0.18s; }
.rec-mode:hover > span { border-bottom-color: #00F2B8; border-bottom-style: solid; }
.rec-mode:active { transform: scale(0.98); }
.rec-chip:active { transform: scale(0.95); }
.rec-chip i { font-style: normal; opacity: 0.6; margin-left: 5px; }
.rec-chip:hover i { opacity: 0.8; }
.rec-foot { margin-top: 10px; display: flex; gap: 16px; }
.rec-link { font: inherit; color: #00F2B8; opacity: 0.85; cursor: pointer; background: none; border: 0; padding: 0; text-decoration: none; }
.rec-link:hover { opacity: 1; text-decoration: underline; }
.rec-loading { display: flex; align-items: center; gap: 9px; opacity: 0.75; }
.rec-loading i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(0, 242, 184, 0.3); border-top-color: #00F2B8; animation: rec-spin 0.8s linear infinite; }
@keyframes rec-spin { to { transform: rotate(360deg); } }
.rec-track { display: flex; align-items: center; gap: 10px; padding: 5px 0; animation: rec-in 0.35s ease both; }
@keyframes rec-in { from { opacity: 0; transform: translateY(5px); } }
.rec-cover { width: 40px; height: 40px; flex: none; border-radius: 6px; object-fit: cover; background: rgba(120, 130, 140, 0.18); display: grid; place-items: center; font-size: 1.1em; opacity: 0.9; }
.rec-info { min-width: 0; flex: 1; }
.rec-info b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-sub { font-size: 0.85em; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-sub .rec-ok { color: #00F2B8; }
.rec-acts { display: flex; gap: 12px; flex: none; }
.rec-acts a, .rec-acts button { font: inherit; font-size: 1.05em; color: #00F2B8; opacity: 0.8; text-decoration: none; background: none; border: 0; padding: 2px; cursor: pointer; }
.rec-acts a:hover, .rec-acts button:hover { opacity: 1; }
.rec-acts button[disabled] { opacity: 0.45; cursor: default; }
`
function ensureCss() {
  if (document.getElementById("recCss")) return
  const s = document.createElement("style")
  s.id = "recCss"
  s.textContent = css
  document.head.appendChild(s)
}

const loading = (text) => `<div class="rec-loading"><i></i><span>${esc(text)}</span></div>`

function genresHtml(card) {
  return `<div class="rec-head">Pick a <b>genre</b> <span class="rec-dim">· from your ${card.collection.length} track${card.collection.length === 1 ? "" : "s"}</span></div>
    <div class="rec-chips">${card.genres.map((g, i) => `<button type="button" class="rec-chip" data-rec-act="genre" data-i="${i}" title="${esc(g.note)}">${esc(g.name)}${g.count ? `<i>${g.count}</i>` : ""}</button>`).join("")}</div>`
}

function modesHtml(card) {
  return `<div class="rec-head"><b>${esc(card.genre.name)}</b> <span class="rec-dim">· what kind of picks?</span></div>
    <div class="rec-modes">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="rec-mode" data-rec-act="mode" data-mode="${k}"><span>${m.icon} ${m.name}</span><small>${m.text}</small></button>`).join("")}</div>
    <div class="rec-foot"><button type="button" class="rec-link" data-rec-act="genres">← genres</button></div>`
}

function trackHtml(t, i) {
  const q = encodeURIComponent(`${t.artist} ${t.title}`)
  const meta = [t.year || "", t.style].filter(Boolean).join(" · ")
  const sub = [meta, t.why].filter(Boolean).map(esc).join(" — ")
  return `<div class="rec-track" style="animation-delay:${i * 60}ms">
    ${t.cover ? `<img class="rec-cover" src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="rec-cover">♪</span>`}
    <div class="rec-info">
      <b title="${esc(t.artist)} — ${esc(t.title)}">${esc(t.artist)} — ${esc(t.title)}</b>
      <div class="rec-sub" title="${esc(sub)}">${t.status === "ok" ? '<span class="rec-ok">✓</span> ' : ""}${sub}</div>
    </div>
    <div class="rec-acts">
      <a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer" title="Listen">▶</a>
      <button type="button" data-rec-act="collect" data-i="${i}" title="Add to collection">＋</button>
    </div>
  </div>`
}

function resultsHtml(card) {
  const m = MODES[card.mode]
  return `<div class="rec-head"><b>${esc(card.genre.name)}</b> <span class="rec-dim">· ${m.name.toLowerCase()}</span></div>
    <div>${card.page.map(trackHtml).join("")}</div>
    <div class="rec-foot">
      <button type="button" class="rec-link" data-rec-act="more">↻ more</button>
      <button type="button" class="rec-link" data-rec-act="modes">⇄ kind</button>
      <button type="button" class="rec-link" data-rec-act="genres">← genres</button>
    </div>`
}

// ---------------------------------------------------------------- flow

function draw(root, html) {
  root.innerHTML = html
  const box = root.closest("#chatMessages, #mobileChatMessages")
  if (box) requestAnimationFrame(() => { box.scrollTop = Math.min(box.scrollHeight, box.scrollTop + Math.max(0, root.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom + 12)) })
}

async function runRound(root, card) {
  draw(root, `<div class="rec-head"><b>${esc(card.genre.name)}</b> <span class="rec-dim">· ${MODES[card.mode].name.toLowerCase()}</span></div>` + loading("Finding tracks…"))
  try {
    const suggested = await suggest(card)
    if (!suggested.length) throw new Error("The AI had no suggestions. Try again.")
    root.querySelector(".rec-loading span").textContent = "Checking on Discogs…"
    const checked = await verify(suggested)
    const reachable = checked.some(t => t.status !== "error")
    // Best first: tracks Discogs confirms, then artists it knows, then (only to avoid an almost empty list) the rest.
    // When Discogs cannot be reached the AI list is shown as it is.
    const rank = { ok: 0, partial: 1, error: 1, miss: 2 }
    const sorted = [...checked].sort((a, b) => rank[a.status] - rank[b.status])
    let keep = reachable ? sorted.filter(t => t.status !== "miss") : sorted
    if (reachable && keep.length < 3) keep = sorted
    keep = keep.slice(0, SHOW).map(decorate)
    if (!keep.length) throw new Error("None of the suggestions could be confirmed. Try again.")
    card.page = keep
    card.shown.push(...keep)
    draw(root, resultsHtml(card))
  } catch (err) {
    draw(root, `<div>${esc(err.message || "Something went wrong.")}</div>
      <div class="rec-foot"><button type="button" class="rec-link" data-rec-act="retry">↻ try again</button><button type="button" class="rec-link" data-rec-act="genres">← genres</button></div>`)
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-rec-act]")
  if (!el) return
  const root = el.closest("[data-rec]")
  const card = root && cards.get(root.dataset.rec)
  if (!card) return
  e.preventDefault()
  const act = el.dataset.recAct
  if (act === "genre") { card.genre = card.genres[Number(el.dataset.i)]; card.shown = []; draw(root, modesHtml(card)) }
  else if (act === "mode") { card.mode = el.dataset.mode; runRound(root, card) }
  else if (act === "genres") { draw(root, genresHtml(card)) }
  else if (act === "modes") { draw(root, modesHtml(card)) }
  else if (act === "more" || act === "retry") { runRound(root, card) }
  else if (act === "collect") {
    const t = card.page[Number(el.dataset.i)]
    if (t) { addTrackToCollection(t.artist, t.title); el.textContent = "✓"; el.disabled = true }
  }
})

// Entry point: returns the first screen (genres) as chat HTML.
export async function startCollectionRecommendations(collection = getCollection()) {
  ensureCss()
  let genres
  try {
    genres = await groupGenres(collection)
  } catch (err) {
    return { type: "text", content: err.message || "Unable to read the collection right now." }
  }
  const id = "rec" + (++counter)
  cards.set(id, { collection, genres, genre: null, mode: "mix", shown: [], page: [] })
  if (cards.size > 6) cards.delete(cards.keys().next().value)
  return { type: "html", content: `<div class="rec" data-rec="${id}">${genresHtml(cards.get(id))}</div>` }
}
