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

  if (role === "user") {
    msgDiv.innerHTML = `
      <strong style="display:block; font-weight:800; margin-bottom:6px;">You</strong>
      <div class="message-content">${escapeHtml(htmlContent)}</div>
    `;
    chatMessagesElem.appendChild(msgDiv);
    requestAnimationFrame(() => {
      msgDiv.classList.add("show");
      scrollToCenter(msgDiv);
    });
  } else {
    msgDiv.innerHTML = `
      <strong style="display:block; font-weight:800; margin-bottom:6px;">>_FONY:</strong>
      <div class="message-content">${htmlContent}</div>
    `;
    chatMessagesElem.appendChild(msgDiv);
    const imgs = msgDiv.querySelectorAll("img");
    if (imgs.length === 0) {
      requestAnimationFrame(() => {
        msgDiv.classList.add("show");
        scrollToCenter(msgDiv);
      });
    } else {
      let loadedCount = 0;
      imgs.forEach(img => {
        img.addEventListener("load", () => {
          loadedCount++;
          if (loadedCount === imgs.length) {
            requestAnimationFrame(() => {
              msgDiv.classList.add("show");
              scrollToCenter(msgDiv);
            });
          }
        });
        if (img.complete) {
          loadedCount++;
          if (loadedCount === imgs.length) {
            requestAnimationFrame(() => {
              msgDiv.classList.add("show");
              scrollToCenter(msgDiv);
            });
          }
        }
      });
    }
  }
}

function scrollToCenter(element) {
  const containerRect = chatMessagesElem.getBoundingClientRect();
  const elemRect = element.getBoundingClientRect();
  const scrollTopCurrent = chatMessagesElem.scrollTop;
  const topDiff = elemRect.top - containerRect.top;
  const contentElem = element.querySelector(".message-content") || element.querySelector(".image-container");
  if (!contentElem) return;
  const contentRect = contentElem.getBoundingClientRect();
  let desiredOffset = topDiff + (contentRect.top + contentRect.height / 2) - (containerRect.top + containerRect.height / 2);
  if (desiredOffset < topDiff) desiredOffset = topDiff;
  chatMessagesElem.scrollTop = scrollTopCurrent + desiredOffset;
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
  const htmlLinks = chunk.map((f, idx) => `<a href="#" class="fony-tip-feature" data-index="${idx}">${escapeHtml(f.name)}</a>`).join(" | ");
  addMessage("bot", `Select a feature to learn more:<br>${htmlLinks}`);
  setTimeout(() => {
    document.querySelectorAll(".fony-tip-feature").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        showFeatureDetails(parseInt(e.target.dataset.index, 10));
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
    const res = await fetch("/.netlify/functions/get-config");
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

async function fetchCoverArt(artist, track) {
  const query = `recording:"${track}" AND artist:"${artist}"`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FONY-App/1.0 (contact@yourdomain.com)' }
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.recordings && data.recordings.length > 0) {
      const recording = data.recordings[0];
      if (recording.releases && recording.releases.length > 0) {
        const releaseId = recording.releases[0].id;
        const coverUrl = `https://coverartarchive.org/release/${releaseId}/front-500`;
        const coverRes = await fetch(coverUrl, { method: 'HEAD' });
        if (coverRes.ok) {
          return coverUrl;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchMusicBrainzInfo(artist, track) {
  const query = `recording:"${track}" AND artist:"${artist}"`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FONY-App/1.0 (wadada@keemail.me)' }
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

async function fetchMusicBrainzInfoWithRetries(artist, track, retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const info = await fetchMusicBrainzInfo(artist, track);
    if (info) return info;
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, delayMs));
    }
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
    const match = cleanLine.match(/^(\d+\.\s+)?(.+?)\s*[-–—]\s*(.+)$/);
    if (match) {
      const [_, prefix = '', artist, title] = match;
      const full = `${artist.trim()} – ${title.trim()}`;
      if (full.toLowerCase() === "artist – title") return "";
      const query = encodeURIComponent(`${artist.trim()} ${title.trim()} YouTube`);
      const link = `https://www.google.com/search?q=${query}`;
      if (prefix) {
        return `<p>${prefix}${full} <a href="${link}" target="_blank" rel="noopener">🔗</a></p>`;
      } else {
        return `<p>${full}</p>`;
      }
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

  if (userInput.trim().toLowerCase() === "/img") {
    const nowPlayingText = getNowPlayingText();
    if (!nowPlayingText) {
      return { type: "text", content: "Current track unknown." };
    }

    const parsed = parseArtistTrack(nowPlayingText);
    if (!parsed) {
      return { type: "text", content: "Failed to parse artist and track name." };
    }

    const cover = await fetchCoverArt(parsed.artist, parsed.track);
    if (cover) {
      return {
        type: "image",
        content: `<a href="${cover}" target="_blank" rel="noopener"><img src="${cover}" alt="Album Cover" style="max-width: 20%; border-radius: 4px;"></a>`
      };
    } else {
      return { type: "text", content: "Cover art not found." };
    }
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
      const info = await fetchMusicBrainzInfoWithRetries(parsed.artist, parsed.track, 3, 2000);
      if (info) return { type: "text", content: info };
      else {
        if (!openAiApiKey) await fetchOpenAIKey();
        if (!openAiApiKey) {
          addMessage("bot", "Error: FONY Console API key is not available.");
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
          ...history,
          { role: "user", content: "Show technical metadata about the current track" }
        ];
        try {
          const resp = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiApiKey}`
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages,
              temperature: 0.7,
              max_tokens: 100
            })
          });
          if (!resp.ok) {
            const errorText = await resp.text();
            addMessage("bot", `FONY Console error ${resp.status}: ${errorText}`);
            return;
          }
          const data = await resp.json();
          let botReply = data.choices?.[0]?.message?.content || "No response.";
          return { type: "text", content: botReply };
        } catch {
          addMessage("bot", "Error communicating with FONY Console.");
        }
      }
    }
  }

  if (!openAiApiKey) await fetchOpenAIKey();
  if (!openAiApiKey) {
    addMessage("bot", "Error: FONY Console API key is not available.");
    return;
  }
  let systemPrompt = "";
  try {
    systemPrompt = await buildSystemPrompt(nowPlayingText);
  } catch {
    addMessage("bot", "Error loading chat configuration.");
    return;
  }
  const messages = [{ role: "system", content: systemPrompt }, ...history];
  if (!isContinuation && userInput) messages.push({ role: "user", content: userInput });
  try {
    const resp = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.7,
        max_tokens: 100
      })
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      addMessage("bot", `FONY Console error ${resp.status}: ${errorText}`);
      return;
    }
    const data = await resp.json();
    let botReply = data.choices?.[0]?.message?.content || "No response.";
    return { type: "text", content: botReply };
  } catch {
    addMessage("bot", "Error communicating with FONY Console.");
  }
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage("user", escapeHtml(text));
  chatInput.value = "";
  conversationHistory.push({ role: "user", content: text });
  const typingIndicator = document.createElement("div");
  typingIndicator.classList.add("chat-message", "bot-message", "typing-indicator");
  typingIndicator.innerHTML = `<span class="dot-flash"></span>`;
  chatMessagesElem.appendChild(typingIndicator);
  chatMessagesElem.scrollTop = chatMessagesElem.scrollHeight;
  chatSendBtn.disabled = true;
  const botReply = await getChatBotResponse(conversationHistory, text);
  chatSendBtn.disabled = false;
  if (typingIndicator && typingIndicator.parentElement) typingIndicator.remove();
  if (botReply) {
    if (typeof botReply === "object" && botReply.type === "image") {
      addMessage("bot", botReply.content);
      conversationHistory.push({ role: "assistant", content: botReply.content });
    } else {
      const content = typeof botReply === "object" ? botReply.content : botReply;
      addMessage("bot", formatBotResponse(content));
      conversationHistory.push({ role: "assistant", content });
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
      text: "/img",
      description: "Show album cover of the playing track",
      command: () => "/img"
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
    Welcome to the FONY console!<br> Here you can dive deeper into exploring music.<br><br>
    You can use the chat to explore music or try the quick commands below.<br>
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

  const chatUsernameContainer = document.getElementById("chatUsernameContainer");
  const leftPanel = document.querySelector(".left-panel");

  const toggleButton = document.createElement("button");
  toggleButton.id = "chatToggleBtn";
  toggleButton.textContent = ">_";
  toggleButton.style.position = "absolute";
  toggleButton.style.bottom = "20px";
  toggleButton.style.right = "20px";
  toggleButton.style.backgroundColor = "#00F2B8";
  toggleButton.style.border = "none";
  toggleButton.style.borderRadius = "8px";
  toggleButton.style.padding = "8px 12px";
  toggleButton.style.cursor = "pointer";
  toggleButton.style.fontWeight = "bold";
  toggleButton.style.fontFamily = "'Ruda', sans-serif";
  toggleButton.style.color = "#171C2B";
  toggleButton.style.zIndex = "1000";
  toggleButton.style.display = "none";

  const tooltip = document.createElement("span");
  tooltip.className = "tooltip-text";
  tooltip.textContent = "open fony console";
  toggleButton.appendChild(tooltip);

  if (leftPanel) {
    if (window.getComputedStyle(leftPanel).position === "static") {
      leftPanel.style.position = "relative";
    }
    leftPanel.appendChild(toggleButton);
  }

  chatUsernameContainer.style.cursor = "pointer";

  chatUsernameContainer.addEventListener("click", () => {
    chatContainer.style.display = "none";
    toggleButton.style.display = "block";
    const playerControls = document.querySelector('.player-controls');
    if (playerControls) playerControls.classList.add('chat-collapsed');
  });

  chatUsernameContainer.addEventListener("mouseenter", () => {
    chatInput.placeholder = "close console";
  });
  chatUsernameContainer.addEventListener("mouseleave", () => {
    chatInput.placeholder = "Enter message...";
  });

  toggleButton.addEventListener("click", () => {
    chatContainer.style.display = "flex";
    toggleButton.style.display = "none";
    const playerControls = document.querySelector('.player-controls');
    if (playerControls) playerControls.classList.remove('chat-collapsed');
  });

  toggleButton.addEventListener("mouseenter", () => {
    chatInput.placeholder = "Collapse console";
  });
  toggleButton.addEventListener("mouseleave", () => {
    chatInput.placeholder = "Enter message...";
  });

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
