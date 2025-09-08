const TEST_MODE = true;

let podcastAudioEl = null;
let podcastAudioCtx = null;
let podcastGain = null;
let podcastMediaSource = null;
let podcastTimerInterval = null;
let uiMessageDiv = null;
let podcastVolume = 1.0;

const PODCAST_VOLUME_MIN = 0.0;
const PODCAST_VOLUME_MAX = 2.0;
const PODCAST_VOLUME_DEFAULT = 1.0;
const DEFAULT_DUCK_VOLUME = 0.28;

function getRadioAudioElement() {
  return document.getElementById("audioPlayer");
}
function duckRadio(on = true) {
  const audioPlayer = getRadioAudioElement();
  if (!audioPlayer) return;
  try {
    audioPlayer.volume = on ? DEFAULT_DUCK_VOLUME : (window.defaultVolume?.value || 0.9);
  } catch {}
}
function ensureContext() {
  if (!podcastAudioCtx) {
    podcastAudioCtx = window.audioContext || new (window.AudioContext || window.webkitAudioContext)();
    window.audioContext = podcastAudioCtx;
  }
  if (!podcastGain) {
    podcastGain = podcastAudioCtx.createGain();
    podcastGain.gain.value = podcastVolume;
    podcastGain.connect(podcastAudioCtx.destination);
  }
}
function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function renderPodcastControls(duration, currentTime, isPaused) {
  let timeStr = `[${formatTime(currentTime)} / ${formatTime(duration)}]`;
  let volPercent = Math.round(podcastVolume * 100);
  return `
    <div class="podcast-ui" style="display:flex; align-items:center; gap:12px; margin-top:8px; font-size:15px;">
      <button id="podcast-playpause-btn" style="background:none;border:none;color:#00F2B8;font-size:20px;cursor:pointer;">
        ${isPaused ? "▶️" : "⏸️"}
      </button>
      <span id="podcast-timer" style="font-family:monospace; font-size:15px; margin-left:10px; margin-right:10px;">
        ${timeStr}
      </span>
      <span style="margin-left:20px;">
        <button id="podcast-vol-down" style="background:none;border:none;color:#00F2B8;font-size:19px;cursor:pointer;margin-right:6px;">[–]</button>
        <span id="podcast-vol-label">${volPercent}%</span>
        <button id="podcast-vol-up" style="background:none;border:none;color:#00F2B8;font-size:19px;cursor:pointer;margin-left:6px;">[+]</button>
      </span>
    </div>
  `;
}
function updatePodcastUI(duration, currentTime, isPaused) {
  if (!uiMessageDiv) return;
  const controlsHTML = renderPodcastControls(duration || 0, currentTime || 0, !!isPaused);
  const contentDiv = uiMessageDiv.querySelector(".message-content");
  if (contentDiv) {
    contentDiv.querySelectorAll(".podcast-ui").forEach(e => e.remove());
    contentDiv.insertAdjacentHTML("beforeend", controlsHTML);
  }
  attachPodcastUIHandlers();
  const chatMessagesElem = document.getElementById("chatMessages");
  if (chatMessagesElem) chatMessagesElem.scrollTop = chatMessagesElem.scrollHeight;
}
function attachPodcastUIHandlers() {
  const playPauseBtn = document.getElementById("podcast-playpause-btn");
  if (playPauseBtn) {
    playPauseBtn.onclick = () => {
      if (!podcastAudioEl) return;
      if (podcastAudioEl.paused) {
        podcastAudioEl.play();
        updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.currentTime, false);
      } else {
        podcastAudioEl.pause();
        updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.currentTime, true);
      }
    };
  }
  const volLabel = document.getElementById("podcast-vol-label");
  const volDown = document.getElementById("podcast-vol-down");
  const volUp = document.getElementById("podcast-vol-up");
  if (volDown) {
    volDown.onclick = () => {
      podcastVolume = Math.max(PODCAST_VOLUME_MIN, Math.round((podcastVolume - 0.05) * 100) / 100);
      if (podcastGain) podcastGain.gain.value = podcastVolume;
      if (volLabel) volLabel.textContent = Math.round(podcastVolume * 100) + "%";
    };
  }
  if (volUp) {
    volUp.onclick = () => {
      podcastVolume = Math.min(PODCAST_VOLUME_MAX, Math.round((podcastVolume + 0.05) * 100) / 100);
      if (podcastGain) podcastGain.gain.value = podcastVolume;
      if (volLabel) volLabel.textContent = Math.round(podcastVolume * 100) + "%";
    };
  }
}

export async function playPodcastOverRadio(podcastBlob, opts = {}) {
  if (podcastAudioEl) {
    podcastAudioEl.pause();
    podcastAudioEl.remove();
    podcastAudioEl = null;
  }
  const blobUrl = URL.createObjectURL(podcastBlob);
  podcastAudioEl = new Audio(blobUrl);
  podcastAudioEl.volume = 1.0;
  ensureContext();
  if (podcastMediaSource) {
    try { podcastMediaSource.disconnect(); } catch {}
    podcastMediaSource = null;
  }
  podcastMediaSource = podcastAudioCtx.createMediaElementSource(podcastAudioEl);
  if (!podcastGain) {
    podcastGain = podcastAudioCtx.createGain();
    podcastGain.connect(podcastAudioCtx.destination);
  }
  podcastGain.gain.value = podcastVolume;
  podcastMediaSource.connect(podcastGain);
  podcastAudioEl.onplay = () => {
    duckRadio(true);
    updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.currentTime, false);
    if (podcastTimerInterval) clearInterval(podcastTimerInterval);
    podcastTimerInterval = setInterval(() => {
      updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.currentTime, podcastAudioEl.paused);
    }, 300);
  };
  podcastAudioEl.onpause = () => {
    duckRadio(false);
    updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.currentTime, true);
    if (podcastTimerInterval) clearInterval(podcastTimerInterval);
  };
  podcastAudioEl.onended = () => {
    duckRadio(false);
    if (podcastTimerInterval) clearInterval(podcastTimerInterval);
    updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.duration || 0, false);
    setTimeout(() => {
      if (uiMessageDiv) {
        const ui = uiMessageDiv.querySelector(".podcast-ui");
        if (ui) ui.remove();
      }
    }, 800);
  };
  setTimeout(() => {
    const msgs = document.querySelectorAll("#chatMessages .chat-message.bot-message");
    if (msgs.length > 0) uiMessageDiv = msgs[msgs.length - 1];
    updatePodcastUI(podcastAudioEl.duration || 0, podcastAudioEl.currentTime, podcastAudioEl.paused);
  }, 150);
  podcastAudioEl.play();
}

export function stopPodcast() {
  if (podcastAudioEl) {
    podcastAudioEl.pause();
    podcastAudioEl.currentTime = 0;
  }
  if (podcastGain) podcastGain.gain.value = PODCAST_VOLUME_DEFAULT;
  duckRadio(false);
  if (podcastTimerInterval) clearInterval(podcastTimerInterval);
  speechSynthesis.cancel();
}

async function generatePodcastScript(topic) {
  let apiKey = null;
  try {
    const cfg = await fetch("../json/config.json").then(r => r.json());
    apiKey = cfg.OPENAI_API_KEY;
  } catch {}
  if (!apiKey) throw new Error("api key unknown error");
  const systemPrompt = `You are a podcast scriptwriter. Always respond in the same language as the user prompt. Write a friendly, engaging, well-structured podcast script (2–4 min), with intro and outro, split into clear sections with short titles and light pauses.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: topic }
      ],
      temperature: 0.88,
      max_tokens: 1200
    })
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  return data.choices?.[0]?.message?.content;
}

async function generateCleanPodcastScript(topic) {
  let apiKey = null;
  try {
    const cfg = await fetch("../json/config.json").then(r => r.json());
    apiKey = cfg.OPENAI_API_KEY;
  } catch {}
  if (!apiKey) throw new Error("api key unknown error");
  const systemPrompt = `You are a podcast scriptwriter. Respond only with plain sentences suitable for text-to-speech. Do not include any markdown, lists, asterisks, hashtags, or formatting symbols. Only output clean text. Length: 2–4 minutes.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: topic }
      ],
      temperature: 0.8,
      max_tokens: 1200
    })
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  let text = data.choices?.[0]?.message?.content || "";
  return text.replace(/[*#`_>]/g, "");
}

export async function fetchPodcastAudio(topic, opts = {}) {
  if (opts.mode === "robot") {
    const script = await generateCleanPodcastScript(topic);
    if (!script) throw new Error("No script generated");
    return script;
  }
  if (TEST_MODE) {
    const resp = await fetch("js/utils/test-podcast.mp3");
    if (!resp.ok) throw new Error("Local test mp3 not found");
    return await resp.blob();
  }
  const script = await generatePodcastScript(topic);
  if (!script) throw new Error("Can't generate podcast text");
  const cfg = await fetch("../json/config.json").then(r => r.json());
  const apiKey = cfg.OPENAI_API_KEY;
  if (!apiKey) throw new Error("api key unknown error");
  const ttsResp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: opts.ttsModel || "tts-1",
      input: script,
      voice: opts.voice || "onyx",
      response_format: opts.response_format || "opus"
    })
  });
  if (!ttsResp.ok) throw new Error(await ttsResp.text());
  return await ttsResp.blob();
}
