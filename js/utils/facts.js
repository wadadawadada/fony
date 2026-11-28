// /facts as a mini article: cover, headline, a short lead, a few paragraphs and a "Did you know" line,
// written by the AI from what Discogs knows about the release (so it has real names, years and labels to stay close to).
// The card draws a placeholder at once and fills itself in; "another angle" asks for a new article about the same track.

import { isMissing, markMissing } from "./missing.js"
import { withLanguage, getAiLanguage } from "./ai-language.js"

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
    // Discogs notes carry markup like [a=Name] or [url=...]: keep only the words
    const notes = String(rel.notes || "").replace(/\[[a-z]+=?([^\]]*)\]/gi, "$1").replace(/\[\/?[a-z]+\]/gi, "").replace(/\s+/g, " ").trim()
    const credits = (rel.extraartists || []).filter(x => x && x.name && x.role).slice(0, 6).map(x => `${x.role}: ${String(x.name).replace(/\s*\(\d+\)$/, "")}`)
    const tn = norm(track)
    const tr = (rel.tracklist || []).find(x => x && x.title && (norm(x.title).includes(tn) || tn.includes(norm(x.title))))
    return {
      album: rel.title || "",
      year: Number(rel.year) || 0,
      label: (rel.labels && rel.labels[0] && rel.labels[0].name) || "",
      country: rel.country || "",
      styles: [...(rel.styles || []), ...(rel.genres || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
      notes: notes.slice(0, 1500),
      credits,
      position: tr ? [tr.position, tr.duration].filter(Boolean).join(" · ") : "",
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
  // the longer intro of each page: the real material the article is written from
  await Promise.all([out.song, out.artist].filter(Boolean).map(async (p) => { p.full = (await wikiIntro(p.title)) || p.extract }))
  return out
}

async function wikiIntro(title) {
  try {
    const r = await fetch(`${WIKI}/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return ""
    const d = await r.json()
    const page = Object.values((d.query && d.query.pages) || {})[0]
    return String((page && page.extract) || "").replace(/\s+/g, " ").trim().slice(0, 2000)
  } catch (_) { return "" }
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

// What is actually known about the track: Discogs release data, the notes and credits on it, and the intro of
// the Wikipedia pages for the song and the artist. The article is written ONLY from this text.
function sourcesOf(card) {
  const info = card.info, w = card.wiki || {}
  const blocks = []
  if (info) {
    const rel = [info.album && `release: ${info.album}`, info.year && `year: ${info.year}`, info.label && `label: ${info.label}`, info.country && `country: ${info.country}`, info.styles.length && `styles: ${info.styles.join(", ")}`, info.position && `track on the release: ${info.position}`].filter(Boolean).join("; ")
    if (rel) blocks.push(`DISCOGS RELEASE: ${rel}`)
    if (info.credits.length) blocks.push(`DISCOGS CREDITS: ${info.credits.join("; ")}`)
    if (info.notes) blocks.push(`DISCOGS NOTES: ${info.notes}`)
  }
  if (w.song) blocks.push(`WIKIPEDIA (the song "${w.song.title}"): ${w.song.full || w.song.extract}`)
  if (w.artist) blocks.push(`WIKIPEDIA (the artist "${w.artist.title}"): ${w.artist.full || w.artist.extract}`)
  return blocks
}

// Enough real text to write something worth reading? Release data alone (a year, a label) is not.
function hasStory(card) {
  const w = card.wiki || {}, info = card.info
  return !!((w.song && (w.song.full || w.song.extract || "").length >= 200) ||
    (w.artist && (w.artist.full || w.artist.extract || "").length >= 300) ||
    (info && info.notes.length >= 200))
}

async function writeArticle(card) {
  const blocks = sourcesOf(card)
  const system =
    "You write a short, readable piece about one song for a music app, in the voice of a warm, curious music writer. " +
    "THE ONE RULE: write ONLY from the SOURCES the user message contains. Every sentence must be something the sources say. " +
    "Do not add anything from your own memory about this song, this artist or this release: no extra dates, places, people, chart positions, awards, quotes, anecdotes or opinions about what it 'means'. " +
    "You may reword, order and connect what the sources say, and explain a term in plain words. " +
    "If the sources are thin, write less: fewer paragraphs, shorter ones. A short true piece beats a long vague one. " +
    "If the sources contain nothing interesting about this track or artist, reply with the single word NOTHING. " +
    `Emphasis, as far as the sources allow: ${ANGLES[card.angle % ANGLES.length]}. ` +
    "Voice: plain and specific, like a friend who read up on it. Open with a concrete detail from the sources, not with the artist's name and not with 'In <year>'. Vary the rhythm. " +
    "Avoid cliches and filler: no 'iconic', 'timeless', 'masterpiece', 'testament', 'legacy of', 'delve', 'tapestry', 'journey', 'rich history', no summing-up sentence. Do not just list the release data (it is shown next to the text already). " +
    "Format: plain text, no markdown, no emoji, no lists. Reply with exactly these lines and nothing else: " +
    "HEADLINE | a short, intriguing title, at most 8 words, built from words in the sources " +
    "LEAD | one sentence that makes the reader want to go on, at most 26 words " +
    "BODY | a paragraph of 2 to 4 sentences " +
    "BODY | optional second paragraph " +
    "BODY | optional short third paragraph " +
    "DID YOU KNOW | optional: one detail from the sources that is not in the paragraphs, at most 30 words. Leave the line out if there is none"
  const prev = card.headlines.length ? `\nAlready written (use other material from the sources, do not repeat): ${card.headlines.join(" / ")}` : ""
  const user = `Artist: ${card.artist}\nTrack: ${card.track}\n\nSOURCES:\n${blocks.join("\n\n")}${prev}`
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await ask(system, user)
    if (/^\s*NOTHING\b/i.test(reply)) return null
    const art = parseArticle(reply)
    if (art) return art
  }
  throw new Error("Could not write the article. Try again.")
}

// Faithful translation of text we only quote (the genre guide), when the console language is not English.
async function inUserLanguage(text) {
  const lang = getAiLanguage()
  if (!text || lang === "auto" || lang === "English") return text
  try { return (await ask("Translate the user's text faithfully, sentence by sentence, adding and removing nothing. Output only the translation.", text)).trim() || text } catch (_) { return text }
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
.facts-body p { margin: 0 0 9px; text-align: justify; text-justify: inter-word; hyphens: auto; -webkit-hyphens: auto; overflow-wrap: break-word; text-wrap: pretty; }
.facts-did { margin: 12px 0 4px; font-style: italic; }
.facts-did b { display: block; font-style: normal; font-size: 0.74em; letter-spacing: 0.1em; text-transform: uppercase; color: #00F2B8; margin-bottom: 2px; }
.facts-rows { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 12px 0 4px; }
.facts-rows dt { font-size: 0.74em; letter-spacing: 0.1em; text-transform: uppercase; color: #00F2B8; padding-top: 2px; }
.facts-rows dd { margin: 0; min-width: 0; }
.facts-genre { margin: 12px 0 4px; }
.facts-genre b { display: block; font-size: 0.74em; letter-spacing: 0.1em; text-transform: uppercase; color: #00F2B8; margin-bottom: 2px; }
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

// The text is justified with hyphenation, which needs the language of the text to break words correctly.
const LANG_CODES = { English: "en", Russian: "ru", Ukrainian: "uk", Spanish: "es", Portuguese: "pt", French: "fr", German: "de", Italian: "it", Dutch: "nl", Polish: "pl", Czech: "cs", Turkish: "tr", Arabic: "ar", Hebrew: "he", Hindi: "hi", Indonesian: "id", "Chinese (Simplified)": "zh", Japanese: "ja", Korean: "ko" }
function langOf(text) {
  const chosen = LANG_CODES[getAiLanguage()]
  if (chosen) return chosen
  return /[Ѐ-ӿ]/.test(text) ? "ru" : "en"
}

function articleHtml(card, art) {
  const q = encodeURIComponent(`${card.artist} ${card.track}`)
  const link = card.info && card.info.link
  const wiki = card.wiki || {}
  return `${topHtml(card, art)}
    <div class="facts-in">
      ${art.lead ? `<div class="facts-lead">${esc(art.lead)}</div>` : ""}
      <div class="facts-body" lang="${langOf(art.body.join(" "))}">${art.body.map(p => `<p>${esc(p)}</p>`).join("")}</div>
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

// No story to tell: say so plainly and give what is really known, plus ways to dig further. No AI writing here.
function infoHtml(card, genre) {
  const info = card.info
  const q = encodeURIComponent(`${card.artist} ${card.track}`)
  const rows = []
  if (info) {
    if (info.album) rows.push(["Release", info.album])
    if (info.year || info.country) rows.push(["Released", [info.year || "", info.country].filter(Boolean).join(" · ")])
    if (info.label) rows.push(["Label", info.label])
    if (info.styles.length) rows.push(["Style", info.styles.join(", ")])
    if (info.position) rows.push(["On the release", info.position])
    if (info.credits.length) rows.push(["Credits", info.credits.join(" · ")])
  }
  return `${topHtml(card, null)}
    <div class="facts-in">
      <div class="facts-lead">Not much has been written about this track yet${rows.length ? ", so here is what is known" : ""}.</div>
      ${rows.length ? `<dl class="facts-rows">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${genre ? `<div class="facts-genre"><b>About ${esc(genre.title)}</b>${esc(genre.text)}</div>` : ""}
      <div class="facts-foot">
        <a class="facts-link" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">▶ listen</a>
        <a class="facts-link" href="#" data-chat-command="/similar">♫ similar tracks</a>
        ${info && info.link ? `<a class="facts-link" href="${esc(info.link)}" target="_blank" rel="noopener noreferrer">Discogs ↗</a>` : `<a class="facts-link" href="https://www.discogs.com/search/?q=${q}&type=all" target="_blank" rel="noopener noreferrer">Discogs search ↗</a>`}
        <a class="facts-link" href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener noreferrer">Wikipedia search ↗</a>
        ${genre && genre.url ? `<a class="facts-link" href="${esc(genre.url)}" target="_blank" rel="noopener noreferrer">Fonypedia ↗</a>` : ""}
      </div>
    </div>`
}

async function genreBlurb(card) {
  if (typeof card.genreCtx !== "function") return null
  try {
    const g = await card.genreCtx()
    if (!g || !g.desc) return null
    // the first few sentences, as written in Fonypedia
    const text = (g.desc.match(/[^.!?]+[.!?]+/g) || [g.desc]).slice(0, 3).join(" ").trim()
    return { title: g.title, text: await inUserLanguage(text), url: g.slug ? `/fonypedia/${g.slug}.html` : "" }
  } catch (_) { return null }
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
    // no real material, or the writer found nothing in it: an honest info card instead of a made-up story
    const art = hasStory(card) ? await writeArticle(card) : null
    if (!art) {
      if (card.last) { draw(root, articleHtml(card, card.last)); return }   // "another angle" ran dry: keep the last article
      draw(root, infoHtml(card, await genreBlurb(card)))
      return
    }
    card.headlines.push(art.headline)
    card.last = art
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
export function startTrackFacts(artist, track, genreCtx) {
  ensureCss()
  const id = "facts" + (++counter)
  const card = { artist: plain(artist) || artist, track: plain(track) || track, info: undefined, angle: 0, headlines: [], last: null, genreCtx, busy: false }
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
