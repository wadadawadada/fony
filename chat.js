import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const TIPS_JSON_URL = "/fony_tips.json";

let walletAddress = null;
let openAiApiKey = null;

const chatContainer = document.getElementById("chat");
const chatMessagesElem = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatGenreElem = document.getElementById("chatGenre");

let conversationHistory = [];
let fonyTipsData = null;
let chatConfig = null;

let fonyTipsState = {
  mode: null,
  remainingFeatures: [],
  shownFeaturesCount: 3,
  history: []
};

let isContinuation = false;

async function loadChatConfig() {
  if (chatConfig) return chatConfig;
  const res = await fetch("/chat_config.json");
  if (!res.ok) throw new Error("Failed to load chat_config.json");
  chatConfig = await res.json();
  return chatConfig;
}

async function buildSystemPrompt(nowPlayingText) {
  const config = await loadChatConfig();
  const lines = [];

  if (config.intro) lines.push(config.intro);

  if (config.commands && config.commands.length) {
    lines.push("Commands:");
    lines.push(...config.commands);
  }

  if (config.template) {
    lines.push(config.template.replace("{nowPlayingText}", nowPlayingText || "unknown"));
  }

  if (config.rules && config.rules.length) {
    lines.push("Rules:");
    lines.push(...config.rules);
  }

  if (config.footer) lines.push(config.footer);

  return lines.join("\n\n");
}

async function loadFonyTips() {
  if (fonyTipsData) return fonyTipsData;
  try {
    const res = await fetch(TIPS_JSON_URL);
    if (!res.ok) throw new Error("Failed to load tips JSON");
    fonyTipsData = await res.json();
    return fonyTipsData;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
}

function addMessage(role, htmlContent) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("chat-message", role === "user" ? "user-message" : "bot-message");
  if (role === "bot") htmlContent += "";
  msgDiv.innerHTML = `<strong style="display:inline-block; font-weight:800; margin-bottom:6px;">${role === "user" ? "You" : ">_FONY:"}</strong><br>${htmlContent}`;
  chatMessagesElem.appendChild(msgDiv);
  requestAnimationFrame(() => {
    msgDiv.classList.add("show");
    const containerTop = chatMessagesElem.getBoundingClientRect().top;
    const msgTop = msgDiv.getBoundingClientRect().top;
    const scrollOffset = msgTop - containerTop;
    chatMessagesElem.scrollTop += scrollOffset - 20;
  });
}

async function sendFonyTipsIntro() {
  const tipsData = await loadFonyTips();
  if (!tipsData) {
    addMessage("bot", "Sorry, tips data is unavailable now.");
    return;
  }
  fonyTipsState.mode = 'list';
  fonyTipsState.remainingFeatures = [...tipsData.features];
  fonyTipsState.history = [];
  const introText = `Welcome to FONY tips! ${tipsData.description}<br>I will show you features in groups of ${fonyTipsState.shownFeaturesCount}. Choose one to learn more.`;
  addMessage("bot", introText);
  showFeatureChoices();
}

function showFeatureChoices() {
  if (fonyTipsState.remainingFeatures.length === 0) {
    addMessage("bot", "You've seen all features! To repeat, type [fony tips].");
    fonyTipsState.mode = null;
    return;
  }
  const chunk = fonyTipsState.remainingFeatures.slice(0, fonyTipsState.shownFeaturesCount);
  const htmlLinks = chunk.map((f, idx) => {
    return `<a href="#" class="fony-tip-feature" data-index="${idx}">${escapeHtml(f.name)}</a>`;
  }).join(" | ");
  addMessage("bot", `Select a feature to learn more:<br>${htmlLinks}`);
  setTimeout(() => {
    document.querySelectorAll(".fony-tip-feature").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const idx = parseInt(e.target.dataset.index, 10);
        showFeatureDetails(idx);
      });
    });
  }, 100);
}

function showFeatureDetails(idx) {
  const f = fonyTipsState.remainingFeatures[idx];
  if (!f) return;
  addMessage("bot", `<strong>${escapeHtml(f.name)}</strong><br>${escapeHtml(f.description)}`);
  fonyTipsState.history.push(f);
  fonyTipsState.remainingFeatures.splice(idx, 1);
  showFeatureChoices();
}

async function fetchOpenAIKey() {
  if (openAiApiKey) return;
  try {
    const res = await fetch("/config.json");
    if (res.ok) {
      const data = await res.json();
      if (data.OPENAI_API_KEY) {
        openAiApiKey = data.OPENAI_API_KEY;
        return;
      }
    }
  } catch {}
  try {
    const res = await fetch("/api/get-config");
    if (!res.ok) throw new Error();
    const data = await res.json();
    openAiApiKey = data.OPENAI_API_KEY;
  } catch {}
}

function getNowPlayingText() {
  const currentTrackElem = document.querySelector("#currentTrack .scrolling-text");
  if (!currentTrackElem) return "";
  const text = currentTrackElem.textContent.trim();
  if (!text || text.toLowerCase() === "artist - track" || text.toLowerCase() === "unknown") {
    return "";
  }
  return text;
}

function parseArtistTrack(text) {
  const separator = text.includes("–") ? "–" : text.includes("-") ? "-" : null;
  if (!separator) return null;
  const parts = text.split(separator);
  if (parts.length < 2) return null;
  return {
    artist: parts[0].trim(),
    track: parts.slice(1).join(separator).trim()
  };
}

async function fetchMusicBrainzInfo(artist, track) {
  const query = `recording:"${track}" AND artist:"${artist}"`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FONY-App/1.0 (wadada@keemail.me)'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.recordings && data.recordings.length > 0) {
      const rec = data.recordings[0];
      let info = `"${rec.title}" by ${artist}:<br>`;
      if (rec['first-release-date']) info += `Release date: ${rec['first-release-date']}<br>`;
      if (rec.length) {
        const durSec = Math.floor(rec.length / 1000);
        const m = Math.floor(durSec / 60);
        const s = durSec % 60;
        info += `Duration: ${m}:${s.toString().padStart(2, '0')}<br>`;
      }
      if (rec.releases && rec.releases.length > 0) {
        const rel = rec.releases[0];
        if (rel.title) info += `Release: ${rel.title}<br>`;
        if (rel.country) info += `Country: ${rel.country}<br>`;
        if (rel.date) info += `Release Date: ${rel.date}<br>`;
      }
      return info;
    }
  } catch {
    return null;
  }
  return null;
}

function formatBotResponse(text) {
  if (!text) return "";
  const escapedText = escapeHtml(text.replace(/<br\s*\/?>/gi, "\n"));
  const lines = escapedText.split(/\r?\n/);
  const formatted = lines.map(line => {
    const cleanLine = line.replace(/🔗/g, "").trim();
    if (!cleanLine) return "";
    const match = cleanLine.match(/^(\d+\.\s*)?(.+?)\s*[-–—]\s*(.+)$/);
    if (match) {
      const [_, prefix = '', artist, title] = match;
      const full = `${artist.trim()} – ${title.trim()}`;
      if (full.toLowerCase() === "artist – title") return "";
      const query = encodeURIComponent(`${artist.trim()} ${title.trim()} YouTube`);
      const link = `https://www.google.com/search?q=${query}`;
      return `<p>${prefix}${full} <a href="${link}" target="_blank" rel="noopener">🔗</a></p>`;
    }
    return `<p>${cleanLine}</p>`;
  });
  return formatted.filter(Boolean).join("");
}

async function getChatBotResponse(history, userInput) {
  if (userInput.trim() === "<<continue>>") {
    isContinuation = true;
    userInput = "";
  } else {
    isContinuation = false;
  }

  if (userInput.trim().toLowerCase() === "[fony tips]") {
    fonyTipsState.mode = 'list';
    await sendFonyTipsIntro();
    return null;
  }
  if (fonyTipsState.mode === 'list') {
    fonyTipsState.mode = null;
  }

  const nowPlayingText = getNowPlayingText();

  if (userInput.trim().startsWith("/info") && nowPlayingText) {
    const parsed = parseArtistTrack(nowPlayingText);
    if (parsed) {
      const info = await fetchMusicBrainzInfo(parsed.artist, parsed.track);
      if (info) {
        return info;
      } else {
        addMessage("bot", "Database is currently unavailable.");
        return null;
      }
    }
  }

  if (!openAiApiKey) await fetchOpenAIKey();
  if (!openAiApiKey) {
    addMessage("bot", "Error: OpenAI API key is not available.");
    return;
  }

  let systemPrompt = "";
  try {
    systemPrompt = await buildSystemPrompt(nowPlayingText);
  } catch {
    addMessage("bot", "Error loading chat configuration.");
    return;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history
  ];

  if (!isContinuation && userInput) {
    messages.push({ role: "user", content: userInput });
  }

  try {
    const resp = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.7,
        max_tokens: 100
      })
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      addMessage("bot", `OpenAI error ${resp.status}: ${errorText}`);
      return;
    }
    const data = await resp.json();
    let botReply = data.choices?.[0]?.message?.content || "No response.";

    return botReply;
  } catch {
    addMessage("bot", "Error communicating with OpenAI.");
  }
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage("user", escapeHtml(text));
  chatInput.value = "";
  conversationHistory.push({ role: "user", content: text });
  chatSendBtn.disabled = true;
  const botReply = await getChatBotResponse(conversationHistory, text);
  chatSendBtn.disabled = false;
  if (botReply) {
    addMessage("bot", formatBotResponse(botReply));
    conversationHistory.push({ role: "assistant", content: botReply });

    if (botReply.length >= 120) {
      const lastBotMsg = chatMessagesElem.lastChild;
if (lastBotMsg) {
  // Создаем контейнер для ссылки
  const linkContainer = document.createElement("div");
  linkContainer.style.textAlign = "center";
  linkContainer.style.marginTop = "4px";

  const link = document.createElement("a");
  link.href = "#";
  link.id = "continueLink";
  link.textContent = ">>>more<<<";
  link.style.color = "#00F2B8";
  link.style.cursor = "pointer";

  linkContainer.appendChild(link);
  lastBotMsg.appendChild(linkContainer);

  link.addEventListener("click", async (e) => {
    e.preventDefault();
    chatSendBtn.disabled = true;
    const continuationReply = await getChatBotResponse(conversationHistory, "<<continue>>");
    chatSendBtn.disabled = false;
    if (continuationReply) {
      addMessage("bot", formatBotResponse(continuationReply));
      conversationHistory.push({ role: "assistant", content: continuationReply });
    }
  });
}

    }
  }
}

async function connectWalletAndInitChat() {
  if (!window.ethereum) {
    alert("MetaMask is not installed");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    walletAddress = ethers.utils.getAddress(accounts[0]);
    chatContainer.style.display = "flex";
    conversationHistory = [];
  } catch {}
}

function renderQuickLinks() {
  if (!chatGenreElem) return;
  chatGenreElem.innerHTML = "";
  const nowPlayingText = getNowPlayingText();
  const commands = [
    {
      text: "/similar",
      description: "Recommend 3 tracks similar to the current track",
      command: () => nowPlayingText ? `Recommend 3 tracks similar to "${nowPlayingText}"` : "Recommend 3 similar tracks to the current track"
    },
    {
      text: "/new",
      description: "Suggest 5 new tracks in a similar genre",
      command: () => nowPlayingText ? `Suggest 3 new tracks in a similar genre to "${nowPlayingText}"` : "Suggest 3 new tracks in a similar genre"
    },
    {
      text: "/facts",
      description: "List facts about the current track or artist",
      command: () => nowPlayingText ? `List facts about "${nowPlayingText}"` : "List facts about the current track or artist"
    },
    {
      text: "/info",
      description: "Show technical metadata about the current track",
      command: () => nowPlayingText ? `/info ${nowPlayingText}` : "/info"
    },
    {
      text: "[fony tips]",
      description: "Useful tips about FONY"
    }
  ];
  commands.forEach(cmd => {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = cmd.text;
    a.style.color = "#00F2B8";
    a.style.marginRight = "12px";
    a.style.cursor = "pointer";
    a.addEventListener("click", e => {
      e.preventDefault();
      const commandToSend = typeof cmd.command === "function" ? cmd.command() : cmd.text;
      chatInput.value = commandToSend;
      setTimeout(() => chatSendBtn.click(), 10);
    });
    a.addEventListener("mouseenter", () => {
      chatInput.placeholder = `${cmd.text} - ${cmd.description}`;
    });
    a.addEventListener("mouseleave", () => {
      chatInput.placeholder = "Enter message...";
    });
    chatGenreElem.appendChild(a);
  });
}

function sendWelcomeMessage() {
  const welcomeText = `
    Welcome to the FONY console! Here you can dive deeper into exploring music.<br><br>
    Try clicking one of the commands below to get acquainted with the functionality:<br>
    <a href="#" onclick="event.preventDefault(); chatInput.value='Recommend 3 tracks similar to the current track'; chatSendBtn.click();">Similar Tracks</a>,&nbsp;
    <a href="#" onclick="event.preventDefault(); chatInput.value='List facts about the current track or artist'; chatSendBtn.click();">Facts</a>,&nbsp;
    <a href="#" onclick="event.preventDefault(); chatInput.value='Suggest 3 new tracks in a similar genre'; chatSendBtn.click();">New in Genre</a>,&nbsp;
    <a href="#" onclick="event.preventDefault(); chatInput.value='Show technical metadata about the current track'; chatSendBtn.click();">Get Track Info</a>,&nbsp;
    <a href="#" onclick="event.preventDefault(); chatInput.value='[fony tips]'; chatSendBtn.click();">[fony tips]</a>
  `;
  addMessage("bot", welcomeText);
  conversationHistory.push({ role: "assistant", content: welcomeText });
}

export function initChat() {
  renderQuickLinks();
  sendWelcomeMessage();
  const walletBtn = document.getElementById("connectWalletBtn");
  if (walletBtn) {
    walletBtn.addEventListener("click", async () => {
      await connectWalletAndInitChat();
    });
  }
  chatSendBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
  if (window.ethereum && window.ethereum.selectedAddress) {
    walletAddress = ethers.utils.getAddress(window.ethereum.selectedAddress);
    chatContainer.style.display = "flex";
  }
}
