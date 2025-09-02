(function injectCollectionListCSS() {
  if (!window.__collectionListStyleInjected) {
    const style = document.createElement('style');
    style.textContent = `
      .collection-list .collection-remove-btn, 
      .collection-list .collection-view-link {
        display: none !important;
        opacity: 0.35;
        transition: opacity 0.18s;
      }
      .collection-list li {
        padding: 2px 0 2px 0 !important;
        margin-bottom: 3px !important;
        border-bottom: 1px solid rgba(120,120,120,0.10);
        font-size: 1.01em;
        line-height: 1.3;
        background: none;
        position: relative;
      }
      .collection-list li:hover > .collection-remove-btn,
      .collection-list li:hover .collection-remove-btn,
      .collection-list li:hover > .collection-view-link,
      .collection-list li:hover .collection-view-link {
        display: inline-block !important;
        opacity: 1 !important;
      }
      .collection-list li:hover {
        background: rgba(0,242,184,0.05);
        transition: background 0.13s;
      }
      @media (hover: none) {
        .collection-list .collection-remove-btn, .collection-list .collection-view-link { display: inline-block !important; opacity: 1 !important; }
      }
    `;
    document.head.appendChild(style);
    window.__collectionListStyleInjected = true;
  }
})();

export function getCollection() {
  try {
    return JSON.parse(localStorage.getItem("fonyCollection") || "[]");
  } catch {
    return [];
  }
}

export function saveCollection(collection) {
  localStorage.setItem("fonyCollection", JSON.stringify(collection));
}

export function addTrackToCollection(artist, track) {
  const collection = getCollection();
  if (!collection.some(t => t.artist === artist && t.track === track)) {
    collection.push({ artist, track });
    saveCollection(collection);
    return true;
  }
  return false;
}

export function removeTrackFromCollection(artist, track) {
  const collection = getCollection();
  const newCollection = collection.filter(t => !(t.artist === artist && t.track === track));
  saveCollection(newCollection);
}

export function clearCollection() {
  localStorage.removeItem("fonyCollection");
}

export function createMainCollectMenuHtml() {
  return `
 <div style="margin-top:10px; font-weight:600; color:#FFFFFF;">
      Collect your Now Playing tracks and get AI-powered recommendations.
    </div>
    <div style="display:flex; flex-direction: row; gap: 16px; margin-top: 10px;">
      <a href="#" class="collect-track" style="color:#00F2B8; text-decoration:none;">➕ collect track</a>
      <a href="#" class="collect-view" style="color:#00F2B8; text-decoration:none;">📂 view collection</a>
      <a href="#" class="collect-recommend" style="color:#00F2B8; text-decoration:none;">🎵 recommendations</a>
      <a href="#" class="collect-clear" style="color:#00F2B8; text-decoration:none;">🗑️ clear collection</a>
    </div><br><br>
  `;
}

export function setupCollectionMenuHandlers(addMessage, getChatBotResponse, formatBotResponse) {
  setTimeout(() => {
    const msgDiv = document.querySelector("#chatMessages .chat-message.bot-message:last-child");
    if (!msgDiv) return;

    msgDiv.querySelectorAll(".collect-track").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();

        const currentTrackElem = document.querySelector("#currentTrack .scrolling-text");
        const nowPlayingText = currentTrackElem ? currentTrackElem.textContent.trim() : "";
        if (!nowPlayingText) {
          addMessage("bot", "⚠️ No track is currently playing.");
          return;
        }

        let artist = "", track = "";
        if (nowPlayingText.includes(" - ")) {
          [artist, track] = nowPlayingText.split(" - ", 2);
        } else if (nowPlayingText.includes(" – ")) {
          [artist, track] = nowPlayingText.split(" – ", 2);
        } else {
          track = nowPlayingText;
        }
        artist = artist.trim();
        track = track.trim();

        addTrackToCollection(artist, track);
        addMessage("bot", `Track added to collection: ${artist} – ${track}<br><br>`);
      });
    });

    msgDiv.querySelectorAll(".collect-view").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        showCollectionHtml(addMessage);
      });
    });

    msgDiv.querySelectorAll(".collect-clear").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        clearCollection();
        addMessage("bot", "Collection cleared.");
      });
    });

    msgDiv.querySelectorAll(".collect-recommend").forEach(a => {
      a.addEventListener("click", async e => {
        e.preventDefault();
        const collection = getCollection();
        if (!collection.length) {
          addMessage("bot", "Collection is empty.<br><br>");
          return;
        }
        let prompt = "Based on this list of tracks, provide a brief (not more than 20 words) summary of the overall mood and main musical styles. Then suggest a playlist with no more than 5 recommended rare tracks that fit this mood and style. List only the artist and track, one per line:\n";
        collection.forEach((t, i) => {
          prompt += `${i + 1}. ${t.artist} - ${t.track}\n`;
        });

        const typingIndicator = document.createElement("div");
        typingIndicator.classList.add("chat-message", "bot-message", "typing-indicator");
        typingIndicator.innerHTML = `<span class="dot-flash"></span>`;
        const chatMessagesElem = document.getElementById("chatMessages");
        chatMessagesElem.appendChild(typingIndicator);
        chatMessagesElem.scrollTop = chatMessagesElem.scrollHeight;

        const response = await getChatBotResponse([], prompt);

        typingIndicator.remove();

        if (response && response.content) addMessage("bot", formatBotResponse(response.content));
      });
    });
  }, 100);
}

function showCollectionHtml(addMessage) {
  const collection = getCollection();
  if (!collection.length) {
    addMessage("bot", "Collection is empty.<br><br>");
    return;
  }
  let html = "<b>Your collection:</b><ul class='collection-list' style='padding-left:18px;'>";
  collection.forEach((t) => {
    const query = encodeURIComponent(`${t.artist} ${t.track}`);
    const googleSearchUrl = `https://www.google.com/search?q=${query}`;
    html += `<li>
      ${t.artist} – ${t.track}
      <a href="${googleSearchUrl}" target="_blank" rel="noopener" class="collection-view-link" style="margin-left:12px;font-size:15px;">🔎</a>
      <button class="collection-remove-btn" 
        data-artist="${encodeURIComponent(t.artist)}"
        data-track="${encodeURIComponent(t.track)}"
        style="margin-left:8px;background:transparent;border:none;color:#FF2B47;cursor:pointer;font-size:13px;vertical-align:middle;opacity:0.35;transition:opacity 0.18s;"
        title="Remove from collection"
      >🗑️</button>
    </li>`;
  });
  html += "</ul>";
  addMessage("bot", html);

  setTimeout(() => {
    document.querySelectorAll('.collection-remove-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const artist = decodeURIComponent(btn.dataset.artist);
        const track = decodeURIComponent(btn.dataset.track);
        removeTrackFromCollection(artist, track);
        showCollectionHtml(addMessage);
      });
    });
  }, 50);
}

export function setupMobileCollectionHandlers(addMobileMessage, getChatBotResponse, formatBotResponse) {
  setTimeout(() => {
    const container = document.getElementById('mobileChatMessages');
    if (!container) return;

    container.querySelectorAll(".collect-track").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();

        const currentTrackElem = document.querySelector("#currentTrack .scrolling-text");
        const nowPlayingText = currentTrackElem ? currentTrackElem.textContent.trim() : "";
        if (!nowPlayingText) {
          addMobileMessage("bot", "⚠️ No track is currently playing.");
          return;
        }

        let artist = "", track = "";
        if (nowPlayingText.includes(" - ")) {
          [artist, track] = nowPlayingText.split(" - ", 2);
        } else if (nowPlayingText.includes(" – ")) {
          [artist, track] = nowPlayingText.split(" – ", 2);
        } else {
          track = nowPlayingText;
        }
        artist = artist.trim();
        track = track.trim();

        addTrackToCollection(artist, track);
        addMobileMessage("bot", `Track added to collection: ${artist} – ${track}<br><br>`);
      });
    });

    container.querySelectorAll(".collect-view").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        showCollectionHtmlMobile(addMobileMessage);
      });
    });

    container.querySelectorAll(".collect-clear").forEach(a => {
      a.addEventListener("click", e => {
        e.preventDefault();
        clearCollection();
        addMobileMessage("bot", "Collection cleared.");
      });
    });

    container.querySelectorAll(".collect-recommend").forEach(a => {
      a.addEventListener("click", async e => {
        e.preventDefault();
        const collection = getCollection();
        if (!collection.length) {
          addMobileMessage("bot", "Collection is empty.<br><br>");
          return;
        }
        let prompt = "Based on this list of tracks, provide (not more than 20 words) a brief summary of the overall mood and main musical styles. Then suggest a playlist with no more than 5 recommended rare tracks that fit this mood and style. List only the artist and track, one per line:\n";
        collection.forEach((t, i) => {
          prompt += `${i + 1}. ${t.artist} - ${t.track}\n`;
        });

        const mobileChatMessagesElem = document.getElementById('mobileChatMessages');
        const typingIndicator = document.createElement("div");
        typingIndicator.classList.add("chat-message", "bot-message", "typing-indicator");
        typingIndicator.innerHTML = `<span class="dot-flash"></span>`;
        mobileChatMessagesElem.appendChild(typingIndicator);
        mobileChatMessagesElem.scrollTop = mobileChatMessagesElem.scrollHeight;

        const response = await getChatBotResponse([], prompt);

        typingIndicator.remove();

        if (response && response.content) addMobileMessage("bot", formatBotResponse(response.content));
      });
    });
  }, 100);
}

function showCollectionHtmlMobile(addMobileMessage) {
  const collection = getCollection();
  if (!collection.length) {
    addMobileMessage("bot", "Collection is empty.<br><br>");
    return;
  }
  let html = "<b>Your collection:</b><ul class='collection-list' style='padding-left:18px;'>";
  collection.forEach((t) => {
    const query = encodeURIComponent(`${t.artist} ${t.track}`);
    const googleSearchUrl = `https://www.google.com/search?q=${query}`;
    html += `<li>
      ${t.artist} – ${t.track}
      <a href="${googleSearchUrl}" target="_blank" rel="noopener" class="collection-view-link" style="margin-left:12px;font-size:15px;">🔎</a>
      <button class="collection-remove-btn" 
        data-artist="${encodeURIComponent(t.artist)}"
        data-track="${encodeURIComponent(t.track)}"
        style="margin-left:8px;background:transparent;border:none;color:#FF2B47;cursor:pointer;font-size:13px;vertical-align:middle;opacity:0.35;transition:opacity 0.18s;"
        title="Remove from collection"
      >🗑️</button>
    </li>`;
  });
  html += "</ul>";
  addMobileMessage("bot", html);

  setTimeout(() => {
    document.querySelectorAll('.collection-remove-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const artist = decodeURIComponent(btn.dataset.artist);
        const track = decodeURIComponent(btn.dataset.track);
        removeTrackFromCollection(artist, track);
        showCollectionHtmlMobile(addMobileMessage);
      });
    });
  }, 50);
}
