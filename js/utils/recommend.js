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
const FIRST = 1950              // first decade on the years slider
const DECADES = 8               // 1950s ... 2020s
const cards = new Map()
let counter = 0

// the "rare ... famous" slider, left to right
const MODES = [
  { name: "Deep cuts", ask: "very obscure, underground, cult or overlooked tracks. Avoid the best-known hits and the genre's usual staples; prefer lesser-known artists, small labels and B-sides" },
  { name: "Rather rare", ask: "mostly lesser-known tracks and artists, with at most one or two well-known ones" },
  { name: "A bit of both", ask: "a mix: about half landmark tracks of the genre and half deeper cuts" },
  { name: "Mostly known", ask: "mostly well-known tracks of the genre, with one or two lesser-known gems" },
  { name: "Famous", ask: "essential, widely recognised classics and landmark tracks of the genre that every fan should know" }
]

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

const yearRange = (card) => [FIRST + card.lo * 10, FIRST + card.hi * 10 + 9]

async function suggest(card) {
  const mode = MODES[card.mode]
  const list = card.collection.slice(0, MAX_COLLECTION).map(t => `${t.artist} - ${t.track}`).join("\n")
  const seen = card.shown.map(t => `${t.artist} - ${t.title}`).join("\n")
  const [from, to] = yearRange(card)
  const era = card.lo === 0 && card.hi === DECADES - 1 ? "" : `Only tracks first released between ${from} and ${to}. `
  const system =
    `You are a music expert recommending real, existing tracks. Genre: ${card.genre.name}. Suggest ${mode.ask}. ${era}` +
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
.rec-mode { font: inherit; color: #00F2B8; cursor: pointer; padding: 2px 0; background: none; border: 0; border-bottom: 1px dashed rgba(0, 242, 184, 0.35); transition: border-color 0.18s, transform 0.12s; }
.rec-mode:hover { border-bottom-color: #00F2B8; border-bottom-style: solid; }
.rec-mode:active { transform: scale(0.97); }
.rec-panel { max-width: 440px; margin: 2px 0 10px; padding: 0; }
.rec-row + .rec-row { margin-top: 12px; }
.rec-row-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; font-size: 0.78em; letter-spacing: 0.08em; text-transform: uppercase; }
.rec-row-val { color: #0a0e16; background: #00F2B8; font-weight: 700; letter-spacing: 0; text-transform: none; padding: 1px 9px; border-radius: 999px; }
.rec-range { position: relative; height: 22px; }
.rec-range::before, .rec-fill { content: ""; position: absolute; top: 9px; height: 4px; border-radius: 2px; }
.rec-range::before { left: 0; right: 0; background: rgba(120, 130, 140, 0.28); }
.rec-fill { background: linear-gradient(90deg, rgba(0, 242, 184, 0.5), #00F2B8); box-shadow: 0 0 8px rgba(0, 242, 184, 0.5); }
.rec-range input { position: absolute; left: 0; top: 0; width: 100%; height: 22px; margin: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; outline: none; }
.rec-range input::-webkit-slider-runnable-track { background: none; height: 22px; }
.rec-range input::-moz-range-track { background: none; height: 22px; }
.rec-range input::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; cursor: grab; width: 16px; height: 16px; margin-top: 3px; border-radius: 50%; background: #00F2B8; border: 3px solid #0f1624; box-shadow: 0 0 0 1px #00F2B8, 0 0 10px rgba(0, 242, 184, 0.7); transition: transform 0.12s; }
.rec-range input::-moz-range-thumb { pointer-events: auto; cursor: grab; width: 10px; height: 10px; border-radius: 50%; background: #00F2B8; border: 3px solid #0f1624; box-shadow: 0 0 0 1px #00F2B8, 0 0 10px rgba(0, 242, 184, 0.7); }
.rec-range input:active::-webkit-slider-thumb { transform: scale(1.2); cursor: grabbing; }
.rec-ticks { position: relative; height: 14px; font-size: 0.72em; }
.rec-ticks span { position: absolute; top: 0; transform: translateX(-50%); opacity: 0.38; transition: opacity 0.15s, color 0.15s; white-space: nowrap; }
.rec-ticks span.on { opacity: 1; color: #00F2B8; }
.rec-ticks.ends span { opacity: 0.6; transform: none; }
.rec-ticks.ends span:first-child { left: 0; }
.rec-ticks.ends span:last-child { right: 0; }
.rec-chip:active { transform: scale(0.95); }
.rec-chip i { font-style: normal; opacity: 0.6; margin-left: 5px; }
.rec-chip:hover i { opacity: 0.8; }
.rec-foot { margin-top: 10px; display: flex; gap: 16px; }
.rec-link { font: inherit; color: #00F2B8; opacity: 0.85; cursor: pointer; background: none; border: 0; padding: 0; text-decoration: none; }
.rec-link:hover { opacity: 1; text-decoration: underline; }
.rec-loading { display: flex; align-items: center; gap: 9px; opacity: 0.75; }
.rec-loading i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(0, 242, 184, 0.3); border-top-color: #00F2B8; animation: rec-spin 0.8s linear infinite; }
@keyframes rec-spin { to { transform: rotate(360deg); } }
.rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.rec-track { min-width: 0; animation: rec-in 0.35s ease both; }
@keyframes rec-in { from { opacity: 0; transform: translateY(5px); } }
.rec-art { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: rgba(120, 130, 140, 0.18); display: grid; place-items: center; font-size: 1.6em; opacity: 1; }
.rec-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rec-acts { position: absolute; right: 6px; bottom: 6px; display: flex; gap: 6px; opacity: 0; transition: opacity 0.18s; }
.rec-track:hover .rec-acts, .rec-track:focus-within .rec-acts { opacity: 1; }
@media (hover: none) { .rec-acts { opacity: 1; } }
.rec-acts a, .rec-acts button { box-sizing: border-box; width: 26px; height: 26px; min-width: 0; padding: 0; margin: 0; display: grid; place-items: center; font: 600 15px/1 inherit; color: #00F2B8; text-decoration: none; background: rgba(10, 14, 22, 0.85); border: 1px solid rgba(0, 242, 184, 0.45); border-radius: 50%; outline: none; box-shadow: none; cursor: pointer; transition: background 0.15s, color 0.15s; }
.rec-acts svg { width: 12px; height: 12px; fill: currentColor; display: block; }
.rec-acts a:hover, .rec-acts button:hover, .rec-acts a:focus-visible, .rec-acts button:focus-visible { background: #00F2B8; color: #0a0e16; }
.rec-acts button[disabled] { background: #00F2B8; color: #0a0e16; cursor: default; }
.rec-info { margin-top: 6px; min-width: 0; }
.rec-info b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-sub { font-size: 0.85em; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-ok { color: #00F2B8; }
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

function eraLabel(card) {
  if (card.lo === 0 && card.hi === DECADES - 1) return "any era"
  const d = (i) => `${FIRST + i * 10}s`
  return card.lo === card.hi ? d(card.lo) : `${d(card.lo)} – ${d(card.hi)}`
}

const eraPct = (i) => i / (DECADES - 1)
const popPct = (i) => i / (MODES.length - 1)
const THUMB = 16

// the thumb is 16px wide, so marks and the bar are inset by half of it to line up with the thumb centres
const at = (p) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${p})`

function setFill(row, from, to) {
  const fill = row.querySelector(".rec-fill")
  fill.style.left = at(from)
  fill.style.width = `calc((100% - ${THUMB}px) * ${to - from})`
}

function eraFill(card, root) {
  const row = root.querySelector('[data-row="era"]')
  setFill(row, eraPct(card.lo), eraPct(card.hi))
  row.querySelector(".rec-row-val").textContent = eraLabel(card)
  row.querySelectorAll(".rec-ticks span").forEach((t, i) => t.classList.toggle("on", i >= card.lo && i <= card.hi))
}

function popFill(card, root) {
  const row = root.querySelector('[data-row="pop"]')
  setFill(row, 0, popPct(card.mode))
  row.querySelector(".rec-row-val").textContent = MODES[card.mode].name
}

function modesHtml(card) {
  const range = (attr, val, max, label) => `<input type="range" min="0" max="${max}" step="1" value="${val}" data-rec-range="${attr}" aria-label="${label}">`
  const decadeTicks = Array.from({ length: DECADES }, (_, i) => `<span style="left:${at(eraPct(i))}">${String(FIRST + i * 10).slice(2)}s</span>`).join("")
  return `<div class="rec-head"><b>${esc(card.genre.name)}</b> <span class="rec-dim">· tune your picks</span></div>
    <div class="rec-panel">
      <div class="rec-row" data-row="era">
        <div class="rec-row-top"><span class="rec-dim">🕰 Years</span><span class="rec-row-val">${eraLabel(card)}</span></div>
        <div class="rec-range"><div class="rec-fill"></div>${range("lo", card.lo, DECADES - 1, "From decade")}${range("hi", card.hi, DECADES - 1, "To decade")}</div>
        <div class="rec-ticks">${decadeTicks}</div>
      </div>
      <div class="rec-row" data-row="pop">
        <div class="rec-row-top"><span class="rec-dim">🎚 Picks</span><span class="rec-row-val">${MODES[card.mode].name}</span></div>
        <div class="rec-range"><div class="rec-fill"></div>${range("pop", card.mode, MODES.length - 1, "Rare to famous")}</div>
        <div class="rec-ticks ends"><span>💎 rare</span><span>famous ⭐</span></div>
      </div>
    </div>
    <div class="rec-foot" style="align-items:center"><button type="button" class="rec-link" data-rec-act="genres">← genres</button><button type="button" class="rec-mode" data-rec-act="mode">Find tracks →</button></div>`
}

function trackHtml(t, i) {
  const q = encodeURIComponent(`${t.artist} ${t.title}`)
  const meta = [t.year || "", t.style].filter(Boolean).join(" · ")
  const tip = [`${t.artist} — ${t.title}`, meta, t.why].filter(Boolean).join("\n")
  return `<div class="rec-track" style="animation-delay:${i * 60}ms" title="${esc(tip)}">
    <div class="rec-art">
      ${t.cover ? `<img src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "♪"}
      <div class="rec-acts">
        <a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer" title="Listen" aria-label="Listen"><svg viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z"/></svg></a>
        <button type="button" data-rec-act="collect" data-i="${i}" title="Add to collection" aria-label="Add to collection"><svg viewBox="0 0 12 12"><path d="M5.2 1h1.6v4.2H11v1.6H6.8V11H5.2V6.8H1V5.2h4.2z"/></svg></button>
      </div>
    </div>
    <div class="rec-info">
      <b>${esc(t.title)}</b>
      <div class="rec-sub">${esc(t.artist)}</div>
      <div class="rec-sub">${t.status === "ok" ? '<span class="rec-ok">✓</span> ' : ""}${esc(meta)}</div>
    </div>
  </div>`
}

function resultsHtml(card) {
  const m = MODES[card.mode]
  return `<div class="rec-head"><b>${esc(card.genre.name)}</b> <span class="rec-dim">· ${m.name.toLowerCase()}</span></div>
    <div class="rec-grid">${card.page.map(trackHtml).join("")}</div>
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

function showModes(root, card) {
  draw(root, modesHtml(card))
  eraFill(card, root)
  popFill(card, root)
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
    // the chosen years are a hard limit: a track whose real year is outside them is dropped
    const [from, to] = yearRange(card)
    keep = keep.map(decorate).filter(t => !t.year || (t.year >= from && t.year <= to)).slice(0, SHOW)
    if (!keep.length) throw new Error("None of the suggestions could be confirmed. Try again.")
    card.page = keep
    card.shown.push(...keep)
    draw(root, resultsHtml(card))
  } catch (err) {
    draw(root, `<div>${esc(err.message || "Something went wrong.")}</div>
      <div class="rec-foot"><button type="button" class="rec-link" data-rec-act="retry">↻ try again</button><button type="button" class="rec-link" data-rec-act="genres">← genres</button></div>`)
  }
}

document.addEventListener("input", (e) => {
  const el = e.target.closest && e.target.closest("[data-rec-range]")
  if (!el) return
  const root = el.closest("[data-rec]")
  const card = root && cards.get(root.dataset.rec)
  if (!card) return
  const v = Number(el.value)
  const lo = root.querySelector('[data-rec-range="lo"]'), hi = root.querySelector('[data-rec-range="hi"]')
  if (el.dataset.recRange === "pop") { card.mode = v; popFill(card, root); return }
  if (el === lo) { card.lo = Math.min(v, card.hi); lo.value = card.lo }
  else { card.hi = Math.max(v, card.lo); hi.value = card.hi }
  eraFill(card, root)
})

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-rec-act]")
  if (!el) return
  const root = el.closest("[data-rec]")
  const card = root && cards.get(root.dataset.rec)
  if (!card) return
  e.preventDefault()
  const act = el.dataset.recAct
  if (act === "genre") { card.genre = card.genres[Number(el.dataset.i)]; card.shown = []; showModes(root, card) }
  else if (act === "mode") { runRound(root, card) }
  else if (act === "genres") { draw(root, genresHtml(card)) }
  else if (act === "modes") { showModes(root, card) }
  else if (act === "more" || act === "retry") { runRound(root, card) }
  else if (act === "collect") {
    const t = card.page[Number(el.dataset.i)]
    if (t) { addTrackToCollection(t.artist, t.title); el.textContent = "✓"; el.disabled = true; el.title = "In your collection" }
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
  cards.set(id, { collection, genres, genre: null, mode: 2, lo: 0, hi: DECADES - 1, shown: [], page: [] })
  if (cards.size > 6) cards.delete(cards.keys().next().value)
  return { type: "html", content: `<div class="rec" data-rec="${id}">${genresHtml(cards.get(id))}</div>` }
}
