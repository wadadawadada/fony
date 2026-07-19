const BATCH_SIZE = 24;
const MAX_BATCHES = 3;
const FETCH_TIMEOUT_MS = 3000;
const FETCH_CONCURRENCY = 12;
const MAX_PRESELECTED_STATIONS = BATCH_SIZE * MAX_BATCHES;

let moodScannedUrls = new Set();

// These terms let a useful result surface before the live metadata request.  The
// LLM still makes the final choice, but it no longer has to judge a random sample.
const MOOD_TERMS = {
  relaxed: ["relax", "calm", "chill", "sleep", "ambient", "meditat", "focus", "study", "спокой", "расслаб", "сон", "медита", "лоунж"],
  energetic: ["energy", "energet", "upbeat", "party", "workout", "dance", "club", "pump", "бодр", "энерг", "вечерин", "танц", "трениров"],
  romantic: ["romantic", "love", "date", "sensual", "romance", "любов", "романт", "свидан"],
  dark: ["dark", "night", "deep", "moody", "goth", "мрач", "ночн", "темн"],
  happy: ["happy", "feel good", "sunny", "positive", "cheerful", "весел", "радост", "позитив"]
};

const NEWS_TERMS = [
  "news", "news radio", "breaking", "headlines", "bbc", "npr", "cnn",
  "новости", "новости", "вести", "инфо", "информация", "рбк"
];

function normalize(value = "") {
  return String(value).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function queryTerms(query) {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(/\s+/).filter(term => term.length > 1));
  Object.values(MOOD_TERMS).forEach(group => {
    if (group.some(term => normalized.includes(normalize(term)))) group.forEach(term => terms.add(normalize(term)));
  });
  return [...terms];
}

function scoreText(text, terms) {
  const normalized = ` ${normalize(text)} `;
  return terms.reduce((score, term) => score + (normalized.includes(` ${term} `) || normalized.includes(term) ? 1 : 0), 0);
}

function isNewsRequest(query) {
  const normalized = normalize(query);
  return NEWS_TERMS.some(term => normalized.includes(normalize(term)));
}

function isNamedNewsStation(station) {
  const identity = `${station.title || ""} ${station.genreName || ""}`;
  return NEWS_TERMS.some(term => normalize(identity).includes(normalize(term)));
}

function hasTrackMetadata(nowPlaying) {
  if (!nowPlaying || nowPlaying.length < 5) return false;
  const value = String(nowPlaying).trim();
  // Most radio metadata uses Artist - Title. Separators cover the common
  // stream variants while rejecting generic messages such as "Live radio".
  return /^.{2,120}\s(?:-|–|—|\||\/|::)\s.{2,120}$/.test(value);
}

function requestedDecade(query) {
  const normalized = normalize(query);
  const fullMatch = normalized.match(/\b(19\d0|20\d0)\s*(?:s|х|е|год(?:а|ов)?)?/);
  if (fullMatch) return Number(fullMatch[1]);
  // "90-х", "90е" and "90s" become "90 х", "90е" and "90s" after
  // normalization. Two-digit decades conventionally mean the 1900s here.
  const shortMatch = normalized.match(/\b(\d{2})\s*(?:s|х|е|год(?:а|ов)?)/);
  if (!shortMatch) return null;
  const shortYear = Number(shortMatch[1]);
  return shortYear >= 30 ? 1900 + shortYear : 2000 + shortYear;
}

function scoreStationForMood(station, terms) {
  // Genre is the strongest catalogue signal. A descriptive station name gives
  // an additional boost, while a tiny deterministic tie-breaker prevents the
  // same stream always winning an otherwise equal result.
  const genreScore = scoreText(station.genreName, terms) * 7;
  const titleScore = scoreText(station.title, terms) * 4;
  let hash = 0;
  for (const char of (station.url || "")) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return genreScore + titleScore + hash / 10000;
}

function rankCandidates(query, candidates) {
  const terms = queryTerms(query);
  return candidates
    .map(candidate => ({ ...candidate, score: scoreStationForMood(candidate.station, terms) + scoreText(candidate.nowPlaying, terms) * 10 }))
    .sort((a, b) => b.score - a.score);
}

function scrollToBottom() {
  const msgs = document.getElementById("chatMessages");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function reenterMoodMode() {
  window.__awaitingMoodQuery = true;
  const chatInput = document.getElementById("chatInput");
  if (chatInput) chatInput.placeholder = "e.g. relaxing electronic, late night jazz...";
}

export function handleMoodCommand(addMessage) {
  window.__awaitingMoodQuery = true;
  const chatInput = document.getElementById("chatInput");
  if (chatInput) chatInput.placeholder = "e.g. relaxing electronic, late night jazz...";
  addMessage("bot", "What are you in the mood for?");
}

export async function runMoodSearch(query, addMessage, requestChatCompletion) {
  moodScannedUrls = new Set();

  const statusId = `moodStatus_${Date.now()}`;
  addMessage("bot", `<span id="${statusId}">Loading stations...</span>`);

  const updateStatus = (html) => {
    const el = document.getElementById(statusId);
    if (el) { el.innerHTML = html; scrollToBottom(); }
  };

  let pool;
  try {
    pool = await window.getMoodStationPool();
  } catch (e) {
    updateStatus("Failed to load station list.");
    reenterMoodMode();
    return;
  }

  if (!pool || !pool.length) {
    updateStatus("No stations available.");
    reenterMoodMode();
    return;
  }

  // Step 1: use the catalogue and the model to narrow the genre set.
  const allGenres = [...new Set(pool.map(s => s.genreName))].sort();
  updateStatus("Choosing playlists to search...");
  const modelGenres = await pickRelevantGenres(query, allGenres, requestChatCompletion);
  const localGenres = allGenres
    .map(genre => ({ genre, score: scoreText(genre, queryTerms(query)) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(item => item.genre);
  // Local matching is a safety net for unavailable or imperfect completions;
  // model choices add semantic matches such as "rainy Sunday" -> Chillout.
  const relevantGenres = [...new Set([...modelGenres, ...localGenres])].slice(0, 12);

  // Filter pool to relevant genres; fall back to full pool if nothing matched
  const filteredPool = relevantGenres.length
    ? pool.filter(s => relevantGenres.includes(s.genreName))
    : pool;

  const playlistLabel = relevantGenres.length
    ? relevantGenres.join(", ")
    : "all playlists";

  // Never start from a shuffled global list: rank the entire relevant pool first.
  // This fixes the common case where a very suitable station was simply outside
  // of the first 90 randomly scanned streams.
  const terms = queryTerms(query);
  const rankedPool = filteredPool
    .slice()
    .sort((a, b) => scoreStationForMood(b, terms) - scoreStationForMood(a, terms))
    .slice(0, MAX_PRESELECTED_STATIONS);

  // Step 2: inspect the best-ranked streams in batches.
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const available = rankedPool.filter(s => !moodScannedUrls.has(s.url));
    if (!available.length) {
      updateStatus("Scanned all matching stations — no match found. Try different wording.");
      reenterMoodMode();
      return;
    }

    const batchStations = available.slice(0, BATCH_SIZE);
    batchStations.forEach(s => moodScannedUrls.add(s.url));

    updateStatus(
      `Scanning: <em>${playlistLabel}</em>... (${batch + 1}/${MAX_BATCHES})`
    );

    const results = await fetchConcurrent(batchStations, FETCH_CONCURRENCY);

    const fulfilled = results
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);

    const wantsNews = isNewsRequest(query);
    // For a music request, a station cannot be recommended on its name alone:
    // its live Artist - Track metadata is mandatory. News stations are the
    // exception, because they commonly have no StreamTitle at all.
    const evidenceBacked = wantsNews
      ? fulfilled.filter(item => isNamedNewsStation(item.station))
      : fulfilled.filter(item => hasTrackMetadata(item.nowPlaying));
    const candidates = rankCandidates(query, evidenceBacked).slice(0, 12);
    if (candidates.length < 1) continue;

    const match = await matchMoodToStations(query, candidates, requestChatCompletion);
    if (match) {
      showMatchResult(match, updateStatus, query, addMessage, requestChatCompletion);
      reenterMoodMode();
      return;
    }
  }

  const retryId = `moodRetryFail_${Date.now()}`;
  updateStatus(
    `Couldn't find a great match. Try different wording —<br>` +
    `e.g. <em>"late night jazz"</em>, <em>"upbeat electronic"</em>, <em>"90s rock"</em>.<br><br>` +
    `<button id="${retryId}" style="cursor:pointer; background:transparent; color:#00F2B8; border:1px solid #00F2B8; border-radius:15px; padding:6px 14px; font-family:'Ruda',sans-serif; font-weight:700;">↻ Try again</button>`
  );
  setTimeout(() => {
    const btn = document.getElementById(retryId);
    if (btn) btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.style.opacity = "0.6";
      runMoodSearch(query, addMessage, requestChatCompletion);
    });
  }, 100);
  reenterMoodMode();
}

// LLM picks playlist numbers → we map back to exact names, no string matching issues
async function pickRelevantGenres(query, allGenres, requestChatCompletion) {
  const numbered = allGenres.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const prompt =
    `User request: "${query}"\n\n` +
    `Available radio playlists:\n${numbered}\n\n` +
    `Which playlist numbers are most likely to contain music matching this request? ` +
    `Consider language, genre, era, and mood. Reply with ONLY the numbers, comma-separated (e.g. "3, 7, 12"). ` +
    `Pick up to 8. If none fit at all, reply "none".`;

  try {
    const resp = await requestChatCompletion([
      { role: "system", content: "You are a radio music expert. Given a mood/genre request and a numbered list of radio playlists, pick the numbers most likely to contain matching music. Reply ONLY with numbers like: 3, 7, 12" },
      { role: "user", content: prompt }
    ], { maxTokens: 128, reasoningEffort: "minimal" });
    const text = (resp?.choices?.[0]?.message?.content || "").trim();
    if (!text || text.toLowerCase() === "none") return [];
    const nums = text.split(/[\s,]+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= allGenres.length);
    return [...new Set(nums)].map(n => allGenres[n - 1]);
  } catch {
    return [];
  }
}

async function fetchConcurrent(stations, concurrency) {
  const results = [];
  for (let i = 0; i < stations.length; i += concurrency) {
    const slice = stations.slice(i, i + concurrency);
    const sliceResults = await Promise.allSettled(
      slice.map(async s => ({
        station: s,
        nowPlaying: await fetchWithTimeout(s.url, FETCH_TIMEOUT_MS)
      }))
    );
    results.push(...sliceResults);
  }
  return results;
}

async function matchMoodToStations(query, candidates, requestChatCompletion) {
  const decade = requestedDecade(query);
  const list = candidates
    .map((c, i) => `${i + 1}. Station: ${c.station.title} | Playlist: ${c.station.genreName}${c.nowPlaying ? ` | Now playing: ${c.nowPlaying}` : " | Now playing: (live, no metadata)"}`)
    .join("\n");

  const systemPrompt =
    `You are a strict radio content evaluator. Select the single best station using the playlist, station name and now-playing text.\n\n` +
    `IMPORTANT: Many live/talk/news stations show "(live, no metadata)" — judge them by station name only.\n\n` +
    `Content type rules:\n` +
    `- If now-playing shows "Artist - Track" format → this is a MUSIC station, NOT news, NOT talk.\n` +
    `- If now-playing shows "(live, no metadata)" → judge by station name.\n` +
    `- NEWS stations: names like "Вести", "Новости", "РБК", "BBC News", "News Radio", "Info" indicate news.\n` +
    `- RELIGIOUS: "Worship", "Radio Maria", "псалом", "От Матфея", bible text → NOT news.\n\n` +
    `Matching rules — ALL criteria must match:\n` +
    `- If user wants NEWS: only accept stations that are clearly news/talk. A station playing music (Artist - Track) is NOT news even if it's in a news playlist.\n` +
    `- If user wants MUSIC: ONLY pick a station with Artist - Track metadata. Analyse BOTH artist and track against the request; playlist and station name alone never qualify a music station.\n` +
    (decade ? `- The user explicitly requests the ${decade}s. Verify the TRACK's original release year is from ${decade} to ${decade + 9}. Do not guess and do not pick a track outside this range.\n` : "") +
    `- Language must match the request.\n\n` +
    `Reply with EXACTLY one line and no explanation: ` +
    (decade ? `PICK: N | YEAR: YYYY, or PICK: none` : `PICK: N or PICK: none`);

  const prompt =
    `User request: "${query}"\n\n` +
    `Stations:\n${list}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  const parseResponse = (resp) => {
    const text = (resp?.choices?.[0]?.message?.content || "").trim();
    // Try structured format first: PICK: N
    const pickMatch = text.match(/PICK:\s*(\d+|none)/i);
    if (pickMatch) {
      if (pickMatch[1].toLowerCase() === "none") return null;
      const num = parseInt(pickMatch[1], 10);
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        if (decade) {
          const yearMatch = text.match(/YEAR:\s*(\d{4})/i);
          const year = yearMatch ? Number(yearMatch[1]) : NaN;
          if (!Number.isInteger(year) || year < decade || year > decade + 9) return null;
        }
        return candidates[num - 1];
      }
    }
    // Fallback: last standalone number in response
    const nums = [...text.matchAll(/\b(\d+)\b/g)].map(m => parseInt(m[1], 10));
    const lastNum = nums.filter(n => n >= 1 && n <= candidates.length).pop();
    if (lastNum !== undefined) return candidates[lastNum - 1];
    return null;
  };

  try {
    const resp = await requestChatCompletion(messages, { maxTokens: 128, reasoningEffort: "minimal" });
    const text = (resp?.choices?.[0]?.message?.content || "").trim();
    // Respect an explicit rejection. A malformed response is not enough to
    // recommend a track that was not actually evaluated by the model.
    if (/PICK:\s*none/i.test(text)) return null;
    return parseResponse(resp);
  } catch {
    return null;
  }
}

function showMatchResult(match, updateStatus, query, addMessage, requestChatCompletion) {
  const playBtnId = `moodPlay_${Date.now()}`;
  const tryAgainId = `moodRetry_${Date.now()}`;
  const btnStyle = `cursor:pointer; border:none; border-radius:15px; padding:6px 14px; font-family:'Ruda',sans-serif; font-weight:700;`;
  updateStatus(
    `Found a match!<br><br>` +
    `<strong>${match.station.title}</strong> · <em>${match.station.genreName}</em><br>` +
    (match.nowPlaying ? `Now playing: ${match.nowPlaying}<br><br>` : `<br>`) +
    `<button id="${playBtnId}" style="${btnStyle} background:#00F2B8; color:#171C2B; margin-right:8px;">▶ Play</button>` +
    `<button id="${tryAgainId}" style="${btnStyle} background:transparent; color:#00F2B8; border:1px solid #00F2B8;">↻ Try another</button>`
  );

  setTimeout(() => {
    const btn = document.getElementById(playBtnId);
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.playStationDirect) {
          window.playStationDirect(match.station);
          btn.textContent = "▶ Playing...";
          btn.disabled = true;
          btn.style.opacity = "0.6";
        }
      });
    }
    const retryBtn = document.getElementById(tryAgainId);
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        retryBtn.disabled = true;
        retryBtn.style.opacity = "0.6";
        runMoodSearch(query, addMessage, requestChatCompletion);
      });
    }
  }, 100);
}

async function fetchWithTimeout(url, ms) {
  const FONY_BACKEND_URL = window.FONY_BACKEND_URL || "https://fonyserver.up.railway.app";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const apiUrl = `${FONY_BACKEND_URL}/?url=${encodeURIComponent(url)}&t=${Date.now()}`;
    const resp = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.StreamTitle || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
