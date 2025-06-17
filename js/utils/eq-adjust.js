(function(){
const EQ_PRESETS = {
  african:      [2, 2, 1],
  alternative:  [4, 3, 4],
  asian:        [3, 2, 2],
  balkans:      [4, 2, 3],
  blues:        [3, 3, 2],
  caribbean:    [5, 2, 4],
  chillout:     [2, 5, 3],
  chinese:      [2, 2, 2],
  chiptune:     [3, 4, 5],
  classical:    [0, 5, 5],
  downtempo:    [2, 5, 3],
  "drum & bass":[5, 3, 5],
  dub:          [5, 2, 4],
  electronic:   [7, 3, 6],
  funk:         [5, 4, 3],
  goa:          [5, 3, 5],
  hardcore:     [6, 3, 5],
  "hip hop":    [5, 5, 4],
  house:        [4, 5, 5],
  industrial:   [3, 5, 3],
  italian:      [2, 2, 2],
  japan:        [2, 3, 3],
  jazz:         [4, 6, 4],
  jungle:       [5, 3, 5],
  lounge:       [2, 5, 3],
  meditation:   [0, 5, 5],
  metal:        [6, 5, 6],
  nature:       [1, 3, 6],
  "new age":    [1, 4, 6],
  news:         [0, 3, 5],
  oriental:     [3, 2, 2],
  spiritual:    [1, 4, 6],
  punk:         [5, 4, 5],
  rap:          [5, 5, 4],
  reggae:       [4, 2, 5],
  rnb:          [3, 4, 4],
  russian:      [3, 4, 4],
  "southeast asia": [2, 3, 2],
  techno:       [6, 4, 6],
  turk:         [2, 2, 2],
  world:        [3, 3, 3],
  pop:          [3, 4, 3],
  default:      [0, 0, 0]
};
let ctx, source, low, mid, high;
function keepAudioContextAlive() {
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  setTimeout(keepAudioContextAlive, 10000);
}
function createFilters() {
  low = ctx.createBiquadFilter();
  mid = ctx.createBiquadFilter();
  high = ctx.createBiquadFilter();
  low.type = "lowshelf";   low.frequency.value = 120;    low.gain.value = 0;
  mid.type = "peaking";    mid.frequency.value = 1000;   mid.Q.value = 1; mid.gain.value = 0;
  high.type = "highshelf"; high.frequency.value = 3000;  high.gain.value = 0;
  window.lowFilter = low; window.midFilter = mid; window.highFilter = high;
}
function connectChain() {
  try { source.disconnect(); } catch(e){}
  source.connect(low); low.connect(mid); mid.connect(high); high.connect(ctx.destination);
}
function initEq() {
  const audio = document.getElementById("audioPlayer");
  if(!audio) return;
  ctx = window.audioContext || new (window.AudioContext||window.webkitAudioContext)();
  window.audioContext = ctx;
  if(ctx.state==="suspended") ctx.resume();
  if (!window._eqSourceCreated) {
    source = ctx.createMediaElementSource(audio);
    window.audioSource = source;
    window._eqSourceCreated = true;
  } else {
    source = window.audioSource;
  }
  createFilters();
  connectChain();
  keepAudioContextAlive();
}
function setEqPreset(arr) {
  if(!low || !mid || !high) initEq();
  window.lowFilter.gain.value = arr[0];
  window.midFilter.gain.value = arr[1];
  window.highFilter.gain.value = arr[2];
}
function resetEqChain() {
  createFilters();
  connectChain();
}
function getCurrentGenrePreset() {
  let genre = (window.currentGenre || "").toLowerCase();
  if(!genre) return { name: "default", preset: EQ_PRESETS.default };
  let name = genre.replace(/^genres\/|\.m3u$/g, "").replace(/_/g," ").trim();
  return { name, preset: EQ_PRESETS[name] || EQ_PRESETS.default };
}
function handleEqCmd(cmd) {
  let arg = (cmd.trim().split(/\s+/)[1]||"").toLowerCase();
  if(!arg) { 
    const { name, preset } = getCurrentGenrePreset();
    setEqPreset(preset);
    return name; 
  }
  if(arg==="reset") { setEqPreset(EQ_PRESETS.default); return "reset"; }
  setEqPreset(EQ_PRESETS[arg]||EQ_PRESETS.default);
  return arg;
}
function createManualAdjustControls(container) {
  if(!window.lowFilter || !window.midFilter || !window.highFilter) return;
  function padValue(val) {
    let n = Math.round(val);
    if (n >= 0) return (n < 10 ? '0' : '') + n;
    else return '-' + (Math.abs(n) < 10 ? '0' : '') + Math.abs(n);
  }
  let lowVal, midVal, highVal;
  function updateValues() {
    if(lowVal) lowVal.textContent = padValue(window.lowFilter.gain.value);
    if(midVal) midVal.textContent = padValue(window.midFilter.gain.value);
    if(highVal) highVal.textContent = padValue(window.highFilter.gain.value);
  }
  const controlsDiv = document.createElement("div");
  controlsDiv.style.marginTop = "8px";
  controlsDiv.style.fontSize = "14px";
  controlsDiv.style.userSelect = "none";
  controlsDiv.style.color = "white";
  controlsDiv.style.display = "flex";
  controlsDiv.style.gap = "24px";
  controlsDiv.style.alignItems = "center";
  function makeControl(label) {
    const span = document.createElement("span");
    span.style.display = "flex";
    span.style.alignItems = "center";
    span.style.gap = "6px";
    span.style.color = "white";
    const minus = document.createElement("a");
    minus.href = "#";
    minus.textContent = "-";
    minus.style.color = "white";
    minus.style.textDecoration = "none";
    minus.style.cursor = "pointer";
    minus.style.userSelect = "none";
    const valSpan = document.createElement("span");
    valSpan.style.minWidth = "0px";
    valSpan.style.textAlign = "center";
    valSpan.style.display = "inline-block";
    valSpan.style.color = "white";
    const plus = document.createElement("a");
    plus.href = "#";
    plus.textContent = "+";
    plus.style.color = "white";
    plus.style.textDecoration = "none";
    plus.style.cursor = "pointer";
    plus.style.userSelect = "none";
    span.appendChild(document.createTextNode(label + " "));
    span.appendChild(minus);
    span.appendChild(document.createTextNode(" [ "));
    span.appendChild(valSpan);
    span.appendChild(document.createTextNode(" ] "));
    span.appendChild(plus);
    return { span, minus, plus, valSpan };
  }
  const lowControl = makeControl("low");
  const midControl = makeControl("mid");
  const highControl = makeControl("high");
  lowVal = lowControl.valSpan;
  midVal = midControl.valSpan;
  highVal = highControl.valSpan;
  controlsDiv.appendChild(lowControl.span);
  controlsDiv.appendChild(midControl.span);
  controlsDiv.appendChild(highControl.span);
  container.appendChild(controlsDiv);
  lowControl.minus.onclick = e => {
    e.preventDefault();
    window.lowFilter.gain.value = Math.max(-15, window.lowFilter.gain.value - 1);
    updateValues();
  };
  lowControl.plus.onclick = e => {
    e.preventDefault();
    window.lowFilter.gain.value = Math.min(15, window.lowFilter.gain.value + 1);
    updateValues();
  };
  midControl.minus.onclick = e => {
    e.preventDefault();
    window.midFilter.gain.value = Math.max(-15, window.midFilter.gain.value - 1);
    updateValues();
  };
  midControl.plus.onclick = e => {
    e.preventDefault();
    window.midFilter.gain.value = Math.min(15, window.midFilter.gain.value + 1);
    updateValues();
  };
  highControl.minus.onclick = e => {
    e.preventDefault();
    window.highFilter.gain.value = Math.max(-15, window.highFilter.gain.value - 1);
    updateValues();
  };
  highControl.plus.onclick = e => {
    e.preventDefault();
    window.highFilter.gain.value = Math.min(15, window.highFilter.gain.value + 1);
    updateValues();
  };
  updateValues();
}
function quickLink(container) {
  if(!container || container.querySelector("a[data-eq-link]")) return;
  const link = document.createElement("a");
  link.href = "#";
  link.textContent = "/equalizer";
  link.style.color = "#00F2B8";
  link.style.marginRight = "12px";
  link.style.cursor = "pointer";
  link.dataset.eqLink = "1";
  link.title = "Apply equalizer preset for current genre";
  link.onclick = e => {
    e.preventDefault();
    const { name, preset } = getCurrentGenrePreset();
    if(typeof setEqPreset !== "function" || !window.lowFilter) {
      console.warn("Equalizer not initialized yet");
      return;
    }
    setEqPreset(preset);
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;
    const existingReset = chatMessages.querySelector(".eq-reset-link");
    if (existingReset) existingReset.remove();
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-message bot-message";
    msgDiv.innerHTML = `<br><strong>>_FONY:</strong><div class="message-content">🎚️ Equalizer preset <b>${name}</b> applied. <a href="#" class="eq-reset-link" style="margin-left:12px; color:#00F2B8; cursor:pointer;">[Reset]</a></div><br>`;
    chatMessages.appendChild(msgDiv);
    setTimeout(() => {
      msgDiv.classList.add("show");
      chatMessages.scrollTop = chatMessages.scrollHeight;
      createManualAdjustControls(msgDiv.querySelector(".message-content"));
    }, 20);
    const resetLink = msgDiv.querySelector(".eq-reset-link");
    resetLink.addEventListener("click", ev => {
      ev.preventDefault();
      setEqPreset(EQ_PRESETS.default);
      resetLink.remove();
      const resetMsg = document.createElement("div");
      resetMsg.className = "chat-message bot-message";
      resetMsg.innerHTML = `<br><strong>>_FONY:</strong><div class="message-content">🎚️ Equalizer reset to default.</div><br>`;
      chatMessages.appendChild(resetMsg);
      setTimeout(() => {
        resetMsg.classList.add("show");
        chatMessages.scrollTop = chatMessages.scrollHeight;
        createManualAdjustControls(resetMsg.querySelector(".message-content"));
      }, 20);
    });
  };
  const links = Array.from(container.querySelectorAll("a"));
  const facts = links.find(a => a.textContent.trim().toLowerCase() === "/facts");
  if (facts && facts.parentNode === container) facts.insertAdjacentElement("afterend", link);
  else container.appendChild(link);
}
function observeQuickLinks() {
  function observe(container) {
    if (!container) return;
    const observer = new MutationObserver(() => quickLink(container));
    observer.observe(container, { childList: true, subtree: true });
    quickLink(container);
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    observe(document.getElementById("chatGenre"));
    observe(document.getElementById("mobileChatGenre"));
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      observe(document.getElementById("chatGenre"));
      observe(document.getElementById("mobileChatGenre"));
    });
  }
}
function interceptEqCommand() {
  const sendBtn = document.getElementById("chatSendBtn"), input = document.getElementById("chatInput");
  if (!sendBtn || !input) return;
  function showMsg(genre) {
    const chat = document.getElementById("chatMessages");
    if (!chat) return;
    const exist = chat.querySelector(".eq-reset-link");
    if (exist) exist.remove();
    const msg = document.createElement("div");
    msg.className = "chat-message bot-message";
    if (genre === "reset")
      msg.innerHTML = `<br><strong>>_FONY:</strong><div class="message-content">🎚️ Equalizer reset to default.</div><br>`;
    else
      msg.innerHTML = `<br><strong>>_FONY:</strong><div class="message-content">🎚️ Equalizer preset <b>${genre}</b> applied. <a href="#" class="eq-reset-link" style="margin-left:12px;color:#00F2B8;cursor:pointer;">[Reset]</a></div><br>`;
    chat.appendChild(msg);
    setTimeout(() => {
      msg.classList.add("show");
      chat.scrollTop = chat.scrollHeight;
      createManualAdjustControls(msg.querySelector(".message-content"));
    }, 20);
    const reset = msg.querySelector(".eq-reset-link");
    if (reset) reset.onclick = e => {
      e.preventDefault();
      setEqPreset(EQ_PRESETS.default);
      reset.remove();
      showMsg("reset");
    };
  }
  sendBtn.addEventListener("click", e => {
    const val = input.value.trim();
    if (val.toLowerCase().startsWith("/equalizer")) {
      e.preventDefault();
      const genre = handleEqCmd(val);
      showMsg(genre);
      input.value = "";
      return false;
    }
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const val = input.value.trim();
      if (val.toLowerCase().startsWith("/equalizer")) {
        e.preventDefault();
        const genre = handleEqCmd(val);
        showMsg(genre);
        input.value = "";
      }
    }
  });
}
window.addEventListener("DOMContentLoaded", () => {
  // observeQuickLinks();
  interceptEqCommand();
  initEq();
});
})();
