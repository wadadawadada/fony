const BATCH_SIZE = 15;
const MAX_BATCHES = 6;
const FETCH_TIMEOUT_MS = 3000;
const FETCH_CONCURRENCY = 15;

let moodScannedUrls = new Set();

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

  // Step 1: build numbered playlist list and ask LLM to pick by number
  const allGenres = [...new Set(pool.map(s => s.genreName))].sort();
  updateStatus("Choosing playlists to search...");
  const relevantGenres = await pickRelevantGenres(query, allGenres, requestChatCompletion);

  // Filter pool to relevant genres; fall back to full pool if nothing matched
  const filteredPool = relevantGenres.length
    ? pool.filter(s => relevantGenres.includes(s.genreName))
    : pool;

  const playlistLabel = relevantGenres.length
    ? relevantGenres.join(", ")
    : "all playlists";

  // Step 2: scan batches from filtered pool
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const available = filteredPool.filter(s => !moodScannedUrls.has(s.url));
    if (!available.length) {
      updateStatus("Scanned all matching stations — no match found. Try different wording.");
      reenterMoodMode();
      return;
    }

    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
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

    // Include stations with metadata; also include name-only stations (news/talk often have no StreamTitle)
    const withData = fulfilled.filter(r => r.nowPlaying);
    const nameOnly = fulfilled.filter(r => !r.nowPlaying);

    // Cap at 8 candidates so chain-of-thought fits in token limit
    const candidates = [...withData, ...nameOnly].slice(0, 8);
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
    ]);
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
  const list = candidates
    .map((c, i) => `${i + 1}. Station: ${c.station.title}${c.nowPlaying ? ` | Now playing: ${c.nowPlaying}` : " | Now playing: (live, no metadata)"}`)
    .join("\n");

  const systemPrompt =
    `You are a strict radio content evaluator. Evaluate EACH station using both the station name and the now-playing text.\n\n` +
    `IMPORTANT: Many live/talk/news stations show "(live, no metadata)" — judge them by station name only.\n\n` +
    `Content type rules:\n` +
    `- If now-playing shows "Artist - Track" format → this is a MUSIC station, NOT news, NOT talk.\n` +
    `- If now-playing shows "(live, no metadata)" → judge by station name.\n` +
    `- NEWS stations: names like "Вести", "Новости", "РБК", "BBC News", "News Radio", "Info" indicate news.\n` +
    `- RELIGIOUS: "Worship", "Radio Maria", "псалом", "От Матфея", bible text → NOT news.\n\n` +
    `Matching rules — ALL criteria must match:\n` +
    `- If user wants NEWS: only accept stations that are clearly news/talk. A station playing music (Artist - Track) is NOT news even if it's in a news playlist.\n` +
    `- If user wants MUSIC: only accept stations with Artist - Track metadata matching the requested genre/language/era.\n` +
    `- Language must match the request.\n\n` +
    `Output format:\n` +
    `1: YES/NO — reason\n` +
    `2: YES/NO — reason\n` +
    `...\n` +
    `PICK: N or PICK: none`;

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
      if (!isNaN(num) && num >= 1 && num <= candidates.length) return candidates[num - 1];
    }
    // Fallback: last standalone number in response
    const nums = [...text.matchAll(/\b(\d+)\b/g)].map(m => parseInt(m[1], 10));
    const lastNum = nums.filter(n => n >= 1 && n <= candidates.length).pop();
    if (lastNum !== undefined) return candidates[lastNum - 1];
    return null;
  };

  try {
    const resp = await requestChatCompletion(messages);
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
