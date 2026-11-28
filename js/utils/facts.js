// /facts as a mini article: cover, headline, a short lead, a few paragraphs and a "Did you know" line,
// written by the AI from what Discogs knows about the release (so it has real names, years and labels to stay close to).
// The card draws a placeholder at once and fills itself in; "another angle" asks for a new article about the same track.

import { isMissing, markMissing } from "./missing.js"
import { withLanguage } from "./ai-language.js"

const BACKEND = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app"
const cards = new Map()
let counter = 0

// each "angle" is a different way into the same track, so another article is not a rewrite of the first one
const ANGLES = [
  "the story behind the track: how and when it came to be, the context it came out of",
  "the sound: the production, the instruments, the style, what makes it sound the way it does",
  "the artist: who they are, where this track sits in their career",
  "the legacy: how the track was received, who it influenced, where it still turns up"
]

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

// stream titles often carry tags like "[start of dj set]" or "(live)"
const plain = (s) => String(s || "").replace(/\s*[\[(].*?[\])]/g, "").replace(/\s+/g, " ").trim()

// ---------------------------------------------------------------- data

async function discogsInfo(artist, track) {
  const q = `${artist} ${track}`.replace(/["'‘’“”]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  const key = "discogs:" + q
  if (!q || isMissing(key)) return null
  try {
    const resp = await fetch(`${BACKEND}/api/discogs/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) })
    if (resp.status === 404) { markMissing(key); return null }
    if (!resp.ok) return null
    const rel = await resp.json()
    const img = rel.images && rel.images[0]
    return {
      album: rel.title || "",
      year: Number(rel.year) || 0,
      label: (rel.labels && rel.labels[0] && rel.labels[0].name) || "",
      country: rel.country || "",
      styles: [...(rel.styles || []), ...(rel.genres || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
      cover: img ? (img.uri || img.uri150 || "") : "",
      link: rel.uri || (rel.id ? `https://www.discogs.com/release/${rel.id}` : "")
    }
  } catch (_) {
    return null
  }
}

// ---- Wikipedia: a page is linked only when it is clearly about this song or this artist ----
const WIKI = "https://en.wikipedia.org"
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "")
const MUSICAL = /(music|musician|singer|songwriter|band|rapper|composer|producer|dj|vocalist|duo|group|song|single|album|record)/i

async function wikiSearch(query) {
  try {
    const r = await fetch(`${WIKI}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=4&format=json&origin=*`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return []
    const d = await r.json()
    return ((d.query && d.query.search) || []).map(x => x.title)
  } catch (_) { return [] }
}

async function wikiSummary(title) {
  try {
    const r = await fetch(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    if (d.type === "disambiguation") return null
    return {
      title: d.title || title,
      description: d.description || "",
      extract: d.extract || "",
      url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    }
  } catch (_) { return null }
}

async function wikiFind(artist, track) {
  const a = norm(artist), t = norm(track)
  const out = { song: null, artist: null }
  if (!a) return out
  const findSong = async () => {
    if (!t) return
    for (const title of await wikiSearch(`"${track}" ${artist} song`)) {
      if (!norm(title).includes(t)) continue
      const sum = await wikiSummary(title)
      if (sum && norm(sum.extract + sum.description).includes(a) && /song|single|track/i.test(sum.description + " " + sum.extract.slice(0, 200))) { out.song = sum; return }
    }
  }
  const findArtist = async () => {
    for (const title of await wikiSearch(`${artist} musician band singer`)) {
      const n = norm(title)
      if (!(n === a || n.startsWith(a) || a.startsWith(n))) continue
      const sum = await wikiSummary(title)
      if (sum && MUSICAL.test(sum.description + " " + sum.extract.slice(0, 250))) { out.artist = sum; return }
    }
  }
  await Promise.all([findSong(), findArtist()])
  return out
}

async function ask(system, user) {
  const resp = await fetch(`${BACKEND}/api/openai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5-mini",
      messages: withLanguage([{ role: "system", content: system }, { role: "user", content: user }]),
      max_tokens: 1400,
      reasoning_effort: "low"
    })
  })
  if (!resp.ok) throw new Error("The AI is not available right now.")
  const data = await resp.json()
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  if (!text) throw new Error("The AI sent an empty answer.")
  return text
}

// Plain labelled lines, not JSON: a stray quote in the text cannot break it.
function parseArticle(text) {
  const art = { headline: "", lead: "", body: [], fact: "" }
  for (const raw of String(text).replace(/```\w*/g, "").split(/\r?\n/)) {
    const m = raw.trim().match(/^(HEADLINE|LEAD|BODY|DID YOU KNOW)\s*[|:]\s*(.+)$/i)
    if (!m) continue
    const val = m[2].replace(/\*\*/g, "").trim()
    const tag = m[1].toUpperCase()
    if (tag === "HEADLINE") art.headline = val
    else if (tag === "LEAD") art.lead = val
    else if (tag === "BODY") art.body.push(val)
    else art.fact = val
  }
  art.body = art.body.slice(0, 3)
  return art.headline && art.body.length ? art : null
}

async function writeArticle(card) {
  const info = card.info
  const known = info
    ? [info.album && `release: ${info.album}`, info.year && `year: ${info.year}`, info.label && `label: ${info.label}`, info.country && `country: ${info.country}`, info.styles.length && `styles: ${info.styles.join(", ")}`].filter(Boolean).join("; ")
    : "nothing confirmed"
  const system =
    "You are a gifted music writer with a warm, curious voice, writing one short piece about a single song for a music app, the kind of thing a person reads in a minute and tells a friend about. " +
    `Take this angle: ${ANGLES[card.angle % ANGLES.length]}. ` +
    "Facts: use only what you are sure about. Never invent dates, awards, chart positions, collaborators, quotes or anecdotes; if little is known about this exact track, write about the artist or the release instead and say so plainly. A true, specific detail (a place, a year, an instrument, a name, a number) is worth more than any adjective. " +
    "Voice: talk to the reader like a friend who knows the story. Open with a concrete image, scene or surprising detail, not with the artist's name and not with 'In <year>'. Vary the rhythm: some short sentences, some longer. Be specific and a little playful; allow one gentle opinion or turn of phrase. " +
    "Avoid cliches and filler: no 'iconic', 'timeless', 'masterpiece', 'testament', 'legacy of', 'delve', 'tapestry', 'journey', 'rich history', no 'not only... but also', no rhetorical questions in a row, no summing-up sentence at the end. Do not just list the release data (it is shown next to the text already). " +
    "Format: plain text, no markdown, no emoji, no lists. Reply with exactly these lines and nothing else: " +
    "HEADLINE | a short, intriguing title, at most 8 words, not a label like 'The story of...' " +
    "LEAD | one sentence that makes the reader want to go on, at most 26 words " +
    "BODY | a paragraph of 3 or 4 sentences " +
    "BODY | a second paragraph of 3 or 4 sentences " +
    "BODY | a short closing paragraph of 1 or 2 sentences that lands on a detail, not on a moral " +
    "DID YOU KNOW | one surprising, verifiable detail that is not already in the paragraphs, at most 30 words"
  const w = card.wiki || {}
  const wikiCtx = [w.song && `Wikipedia on the song: ${w.song.extract.slice(0, 600)}`, w.artist && `Wikipedia on the artist: ${w.artist.extract.slice(0, 600)}`].filter(Boolean).join("\n")
  const prev = card.headlines.length ? `\nAlready written, do not repeat: ${card.headlines.join(" / ")}` : ""
  for (let attempt = 0; attempt < 2; attempt++) {
    const art = parseArticle(await ask(system, `Artist: ${card.artist}\nTrack: ${card.track}\nDiscogs says: ${known}${wikiCtx ? "\n" + wikiCtx : ""}${prev}`))
    if (art) return art
  }
  throw new Error("Could not write the article. Try again.")
}

// ---------------------------------------------------------------- rendering

const css = `
.facts { max-width: 640px; font-size: 0.92em; line-height: 1.55; }
.facts-top { display: flex; gap: 14px; align-items: flex-start; }
.facts-art { flex: 0 0 112px; width: 112px; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: rgba(120, 130, 140, 0.18); display: grid; place-items: center; font-size: 2em; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35); }
.facts-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.facts-who { min-width: 0; flex: 1; }
.facts-kicker { font-size: 0.74em; letter-spacing: 0.12em; text-transform: uppercase; color: #00F2B8; margin-bottom: 4px; }
.facts-title { font-size: 1.28em; line-height: 1.22; font-weight: 700; margin: 0 0 6px; }
.facts-byline { opacity: 0.65; font-size: 0.86em; }
.facts-chips { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 8px; }
.facts-chip { font-size: 0.78em; color: #00F2B8; white-space: nowrap; }
.facts-lead { margin: 14px 0 8px; font-size: 1.04em; font-style: italic; opacity: 0.95; padding-left: 12px; border-left: 3px solid #00F2B8; }
.facts-body p { margin: 0 0 9px; }
.facts-body p:first-child::first-letter { font-size: 1.9em; line-height: 0.9; float: left; padding: 3px 6px 0 0; color: #00F2B8; font-weight: 700; }
.facts-did { margin: 12px 0 4px; font-style: italic; }
.facts-did b { display: block; font-style: normal; font-size: 0.74em; letter-spacing: 0.1em; text-transform: uppercase; color: #00F2B8; margin-bottom: 2px; }
.facts-foot { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px 16px; }
.facts-link { font: inherit; color: #00F2B8; opacity: 0.85; cursor: pointer; background: none; border: 0; padding: 0; text-decoration: none; }
.facts-link:hover { opacity: 1; text-decoration: underline; }
.facts-loading { display: flex; align-items: center; gap: 9px; opacity: 0.75; margin-top: 12px; }
.facts-loading i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(0, 242, 184, 0.3); border-top-color: #00F2B8; animation: facts-spin 0.8s linear infinite; }
@keyframes facts-spin { to { transform: rotate(360deg); } }
.facts-in { animation: facts-in 0.4s ease both; }
@keyframes facts-in { from { opacity: 0; transform: translateY(6px); } }
@media (max-width: 480px) {
  .facts-top { flex-direction: column; }
  .facts-art { flex-basis: auto; width: 100%; max-width: 220px; }
}
@media (prefers-reduced-motion: reduce) { .facts-in { animation: none; } .facts-loading i { animation-duration: 2s; } }
`
function ensureCss() {
  if (document.getElementById("factsCss")) return
  const s = document.createElement("style")
  s.id = "factsCss"
  s.textContent = css
  document.head.appendChild(s)
}

function topHtml(card, art) {
  const info = card.info
  const chips = info ? [info.year || "", ...info.styles, info.label].filter(Boolean) : []
  return `<div class="facts-top">
    <div class="facts-art">${info && info.cover ? `<img src="${esc(info.cover)}" alt="" referrerpolicy="no-referrer">` : "♪"}</div>
    <div class="facts-who">
      <div class="facts-kicker">Track story</div>
      <h4 class="facts-title">${esc(art ? art.headline : card.track)}</h4>
      <div class="facts-byline">${esc(card.artist)} — ${esc(card.track)}${info && info.album ? ` · ${esc(info.album)}` : ""}</div>
      ${chips.length ? `<div class="facts-chips">${chips.map(c => `<span class="facts-chip">${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
  </div>`
}

function articleHtml(card, art) {
  const q = encodeURIComponent(`${card.artist} ${card.track}`)
  const link = card.info && card.info.link
  const wiki = card.wiki || {}
  return `${topHtml(card, art)}
    <div class="facts-in">
      ${art.lead ? `<div class="facts-lead">${esc(art.lead)}</div>` : ""}
      <div class="facts-body">${art.body.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      ${art.fact ? `<div class="facts-did"><b>Did you know</b>${esc(art.fact)}</div>` : ""}
      <div class="facts-foot">
        <button type="button" class="facts-link" data-facts-act="again">↻ another angle</button>
        <a class="facts-link" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">▶ listen</a>
        ${link ? `<a class="facts-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Discogs ↗</a>` : ""}
        ${wiki.song ? `<a class="facts-link" href="${esc(wiki.song.url)}" target="_blank" rel="noopener noreferrer" title="${esc(wiki.song.title)}">Wikipedia · song ↗</a>` : ""}
        ${wiki.artist ? `<a class="facts-link" href="${esc(wiki.artist.url)}" target="_blank" rel="noopener noreferrer" title="${esc(wiki.artist.title)}">Wikipedia · ${esc(wiki.artist.title.length > 26 ? "artist" : wiki.artist.title)} ↗</a>` : ""}
      </div>
    </div>`
}

function draw(root, html) {
  root.innerHTML = html
  const box = root.closest("#chatMessages, #mobileChatMessages")
  // the article starts at the top of the console, so reading begins at the headline
  if (box) requestAnimationFrame(() => { box.scrollTop += root.getBoundingClientRect().top - box.getBoundingClientRect().top - 8 })
}

async function run(root, card) {
  if (card.busy) return
  card.busy = true
  draw(root, topHtml(card, null) + `<div class="facts-loading"><i></i><span>${card.info === undefined ? "Looking up the release…" : "Writing the story…"}</span></div>`)
  try {
    if (card.info === undefined) {
      const [info, wiki] = await Promise.all([discogsInfo(card.artist, card.track), wikiFind(card.artist, card.track)])
      card.info = info
      card.wiki = wiki
      root.innerHTML = topHtml(card, null) + `<div class="facts-loading"><i></i><span>Writing the story…</span></div>`
    }
    const art = await writeArticle(card)
    card.headlines.push(art.headline)
    card.angle++
    draw(root, articleHtml(card, art))
  } catch (err) {
    draw(root, `${topHtml(card, null)}<div style="margin-top:10px">${esc(err.message || "Something went wrong.")}</div>
      <div class="facts-foot"><button type="button" class="facts-link" data-facts-act="again">↻ try again</button></div>`)
  } finally {
    card.busy = false
  }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("[data-facts-act]")
  if (!el) return
  const root = el.closest("[data-facts]")
  const card = root && cards.get(root.dataset.facts)
  if (!card) return
  e.preventDefault()
  run(root, card)
})

// Entry point: returns the card at once; it fills itself in when the release is looked up and the story written.
export function startTrackFacts(artist, track) {
  ensureCss()
  const id = "facts" + (++counter)
  const card = { artist: plain(artist) || artist, track: plain(track) || track, info: undefined, angle: 0, headlines: [], busy: false }
  cards.set(id, card)
  if (cards.size > 6) cards.delete(cards.keys().next().value)
  let tries = 0
  const start = () => {
    const root = document.querySelector(`[data-facts="${id}"]`)
    if (root) { run(root, card); return }
    if (++tries < 40) setTimeout(start, 50)
  }
  setTimeout(start, 0)
  return { type: "html", content: `<div class="facts" data-facts="${id}">${topHtml(card, null)}<div class="facts-loading"><i></i><span>Looking up the release…</span></div></div>` }
}
