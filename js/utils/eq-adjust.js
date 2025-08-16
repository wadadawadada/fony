(function () {
  const EQ_PRESETS = {
    african: [2, 2, 1],
    alternative: [4, 3, 4],
    asian: [3, 2, 2],
    balkans: [4, 2, 3],
    blues: [3, 3, 2],
    caribbean: [5, 2, 4],
    chillout: [2, 5, 3],
    chinese: [2, 2, 2],
    chiptune: [3, 4, 5],
    classical: [0, 5, 5],
    downtempo: [2, 5, 3],
    "drum & bass": [5, 3, 5],
    dub: [5, 2, 4],
    electronic: [7, 3, 6],
    funk: [5, 4, 3],
    goa: [5, 3, 5],
    hardcore: [6, 3, 5],
    "hip hop": [5, 5, 4],
    house: [4, 5, 5],
    industrial: [3, 5, 3],
    italian: [2, 2, 2],
    japan: [2, 3, 3],
    jazz: [4, 6, 4],
    jungle: [5, 3, 5],
    lounge: [2, 5, 3],
    meditation: [0, 5, 5],
    metal: [6, 5, 6],
    nature: [1, 3, 6],
    "new age": [1, 4, 6],
    news: [0, 3, 5],
    oriental: [3, 2, 2],
    spiritual: [1, 4, 6],
    punk: [5, 4, 5],
    rap: [5, 5, 4],
    reggae: [4, 2, 5],
    rnb: [3, 4, 4],
    russian: [3, 4, 4],
    "southeast asia": [2, 3, 2],
    techno: [6, 4, 6],
    turk: [2, 2, 2],
    world: [3, 3, 3],
    pop: [3, 4, 3],
    default: [0, 0, 0]
  };

  let ctx, source, low, mid, high;
  let noiseSource, noiseGain;
  let noiseEnabled = false;
  let hp, lp, compressor, radioGain, eqGain;

  function keepAudioContextAlive() {
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    setTimeout(keepAudioContextAlive, 10000);
  }

  function createEqFilters() {
    low = ctx.createBiquadFilter();
    mid = ctx.createBiquadFilter();
    high = ctx.createBiquadFilter();

    low.type = "lowshelf";
    low.frequency.value = 120;
    low.gain.value = 0;

    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;
    mid.gain.value = 0;

    high.type = "highshelf";
    high.frequency.value = 3000;
    high.gain.value = 0;

    window.lowFilter = low;
    window.midFilter = mid;
    window.highFilter = high;
  }

  function createChains() {
    eqGain = ctx.createGain();
    radioGain = ctx.createGain();
    eqGain.gain.value = 1;
    radioGain.gain.value = 0;

    low.connect(mid);
    mid.connect(high);
    high.connect(eqGain);
    eqGain.connect(ctx.destination);

    hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 150;

    lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5000;

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    hp.connect(lp);
    lp.connect(compressor);
    compressor.connect(radioGain);
    radioGain.connect(ctx.destination);

    source.connect(low);
    source.connect(hp);
  }

  function createRadioNoise() {
    if (!ctx) return;
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.3;
    }
    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.04;
    noiseSource.connect(noiseGain).connect(ctx.destination);
    noiseSource.start();
  }

  function toggleRadioNoise() {
    if (!ctx) return;
    if (noiseEnabled) {
      if (noiseSource) try { noiseSource.stop(); } catch (e) { }
      noiseEnabled = false;
      eqGain.gain.value = 1;
      radioGain.gain.value = 0;
    } else {
      noiseEnabled = true;
      eqGain.gain.value = 0;
      radioGain.gain.value = 1.5;
      createRadioNoise();
    }
  }

  function initEq() {
    const audio = document.getElementById("audioPlayer");
    if (!audio) return;
    ctx = window.audioContext || new (window.AudioContext || window.webkitAudioContext)();
    window.audioContext = ctx;
    if (ctx.state === "suspended") ctx.resume();
    if (!window._eqSourceCreated) {
      source = ctx.createMediaElementSource(audio);
      window.audioSource = source;
      window._eqSourceCreated = true;
    } else {
      source = window.audioSource;
    }
    createEqFilters();
    createChains();
    keepAudioContextAlive();
  }

  function setEqPreset(arr) {
    if (!low || !mid || !high) initEq();
    window.lowFilter.gain.value = arr[0];
    window.midFilter.gain.value = arr[1];
    window.highFilter.gain.value = arr[2];
  }

  function resetEqChain() {
    createEqFilters();
  }

  function getCurrentGenrePreset() {
    let genre = (window.currentGenre || "").toLowerCase();
    if (!genre) return { name: "default", preset: EQ_PRESETS.default };
    let name = genre.replace(/^genres\/|\.m3u$/g, "").replace(/_/g, " ").trim();
    return { name, preset: EQ_PRESETS[name] || EQ_PRESETS.default };
  }

  function handleEqCmd(cmd) {
    let arg = (cmd.trim().split(/\s+/)[1] || "").toLowerCase();
    if (!arg) {
      const { name, preset } = getCurrentGenrePreset();
      setEqPreset(preset);
      return name;
    }
    if (arg === "reset") {
      setEqPreset(EQ_PRESETS.default);
      return "reset";
    }
    setEqPreset(EQ_PRESETS[arg] || EQ_PRESETS.default);
    return arg;
  }

  function createManualAdjustControls(container) {
    if (!window.lowFilter || !window.midFilter || !window.highFilter) return;

    function padValue(val) {
      let n = Math.round(val);
      if (n >= 0) return (n < 10 ? "0" : "") + n;
      else return "-" + (Math.abs(n) < 10 ? "0" : "") + Math.abs(n);
    }

    let lowVal, midVal, highVal;

    function updateValues() {
      if (lowVal) lowVal.textContent = padValue(window.lowFilter.gain.value);
      if (midVal) midVal.textContent = padValue(window.midFilter.gain.value);
      if (highVal) highVal.textContent = padValue(window.highFilter.gain.value);
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

      const valSpan = document.createElement("span");
      valSpan.style.textAlign = "center";
      valSpan.style.display = "inline-block";
      valSpan.style.color = "white";

      const plus = document.createElement("a");
      plus.href = "#";
      plus.textContent = "+";
      plus.style.color = "white";
      plus.style.textDecoration = "none";
      plus.style.cursor = "pointer";

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

    const fxToggle = document.createElement("a");
    fxToggle.href = "#";
    fxToggle.textContent = noiseEnabled ? "[Radio FX: ON]" : "[Radio FX: OFF]";
    fxToggle.style.marginLeft = "20px";
    fxToggle.style.color = "#00F2B8";
    fxToggle.style.cursor = "pointer";

    fxToggle.onclick = e => {
      e.preventDefault();
      toggleRadioNoise();
      fxToggle.textContent = noiseEnabled ? "[Radio FX: ON]" : "[Radio FX: OFF]";
    };

    controlsDiv.appendChild(fxToggle);
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

  function interceptEqCommand() {
    const sendBtn = document.getElementById("chatSendBtn");
    const input = document.getElementById("chatInput");
    if (!sendBtn || !input) return;

    function showMsg(genre) {
      const chat = document.getElementById("chatMessages");
      if (!chat) return;
      const exist = chat.querySelector(".eq-reset-link");
      if (exist) exist.remove();
      const msg = document.createElement("div");
      msg.className = "chat-message bot-message";
      if (genre === "reset") {
        msg.innerHTML =
          `<br><strong>>_FONY:</strong><div class="message-content">🎚️ Equalizer reset to default.</div><br>`;
      } else {
        msg.innerHTML =
          `<br><strong>>_FONY:</strong><div class="message-content">🎚️ Equalizer preset <b>${genre}</b> applied. <a href="#" class="eq-reset-link" style="margin-left:12px;color:#00F2B8;cursor:pointer;">[Reset]</a></div><br>`;
      }
      chat.appendChild(msg);
      setTimeout(() => {
        msg.classList.add("show");
        chat.scrollTop = chat.scrollHeight;
        createManualAdjustControls(msg.querySelector(".message-content"));
      }, 20);
      const reset = msg.querySelector(".eq-reset-link");
      if (reset) {
        reset.onclick = e => {
          e.preventDefault();
          setEqPreset(EQ_PRESETS.default);
          reset.remove();
          showMsg("reset");
        };
      }
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
    interceptEqCommand();
    initEq();
  });
})();
