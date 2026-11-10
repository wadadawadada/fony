import { resetTaste } from "./taste.js";

var defaultModalContent = "";

document.addEventListener("DOMContentLoaded", function() {
  var modalContentElement = document.querySelector("#manifestoModal .manifesto-content");
  if (modalContentElement) {
    defaultModalContent = modalContentElement.innerHTML;
  }
  attachSettingsListener();
  updateLeftHandedSetting();
});

document.getElementById("manifestoBtn").addEventListener("click", function() {
  document.getElementById("manifestoModal").style.display = "block";
});

document.getElementById("settingsBtn").addEventListener("click", function() {
  openSettingsModal();
});

document.getElementById("manifestoModal").addEventListener("click", function(e) {
  if (e.target.classList.contains("manifesto-close")) {
    var modalContent = document.querySelector("#manifestoModal .manifesto-content");
    modalContent.classList.remove("settings-view");
    modalContent.innerHTML = defaultModalContent;
    attachSettingsListener();
    this.style.display = "none";
  }
});

function updateLeftHandedSetting() {
  var leftHanded = localStorage.getItem("leftHanded") === "true";
  var container = document.querySelector(".container");
  if (window.innerWidth > 1024) {
    container.style.flexDirection = leftHanded ? "row-reverse" : "row";
  } else {
    container.style.flexDirection = "";
  }
}

function attachSettingsListener() {
  var settingsIcon = document.getElementById("settingsIcon");
  if (settingsIcon) {
    settingsIcon.addEventListener("click", handleSettingsClick);
  }
}

function closeSettingsView(modal, modalContent) {
  modalContent.classList.remove("settings-view");
  modalContent.innerHTML = defaultModalContent;
  attachSettingsListener();
  modal.style.display = "none";
}

function openSettingsModal() {
  var modal = document.getElementById("manifestoModal");
  var modalContent = modal.querySelector(".manifesto-content");

  defaultModalContent = modalContent.innerHTML;
  modalContent.classList.add("settings-view");
  modalContent.innerHTML =
    '<button class="manifesto-close" aria-label="Close settings">&times;</button>' +
    '<div class="settings-panel">' +
      '<h1 class="settings-title">Settings</h1>' +

      '<section class="settings-section">' +
        '<h2 class="settings-heading"><svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>Playback</h2>' +
        '<label class="settings-row">' +
          '<span class="settings-text"><span class="settings-name">Hide HTTP stations</span>' +
          '<span class="settings-hint">Only show secure (HTTPS) streams</span></span>' +
          '<input type="checkbox" class="settings-switch" id="httpStationsCheckbox">' +
        '</label>' +
        '<label class="settings-row">' +
          '<span class="settings-text"><span class="settings-name">Console tips</span>' +
          '<span class="settings-hint">Show a helpful tip in the console now and then</span></span>' +
          '<input type="checkbox" class="settings-switch" id="consoleTipsCheckbox">' +
        '</label>' +
        '<div class="settings-row">' +
          '<span class="settings-text"><span class="settings-name">Random taste</span>' +
          '<span class="settings-hint">Random leans towards genres you play and favorite</span></span>' +
          '<button id="resetTasteBtn" class="settings-btn settings-btn-small" type="button">Reset</button>' +
        '</div>' +
      '</section>' +

      '<section class="settings-section">' +
        '<h2 class="settings-heading"><svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="17" r="2.5"/></svg>Interface</h2>' +
        '<label class="settings-row">' +
          '<span class="settings-text"><span class="settings-name">Left-handed layout</span>' +
          '<span class="settings-hint">Mirror the player on wide screens</span></span>' +
          '<input type="checkbox" class="settings-switch" id="leftHandedCheckbox">' +
        '</label>' +
        '<label class="settings-row">' +
          '<span class="settings-text"><span class="settings-name">Station icons</span>' +
          '<span class="settings-hint">Load station logos in the list</span></span>' +
          '<input type="checkbox" class="settings-switch" id="stationLogosCheckbox">' +
        '</label>' +
        '<label class="settings-row">' +
          '<span class="settings-text"><span class="settings-name">Glass ripple</span>' +
          '<span class="settings-hint">Ripple effect in the glass skin</span></span>' +
          '<input type="checkbox" class="settings-switch" id="glassRippleCheckbox">' +
        '</label>' +
      '</section>' +

      '<section class="settings-section">' +
        '<h2 class="settings-heading"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>Data</h2>' +
        '<div class="settings-row settings-row-actions">' +
          '<button id="backupAppBtn" class="settings-btn" type="button">Backup</button>' +
          '<button id="restoreAppBtn" class="settings-btn" type="button">Restore</button>' +
          '<button id="resetAppBtn" class="settings-btn settings-btn-danger" type="button">Reset app</button>' +
        '</div>' +
      '</section>' +

      '<button id="saveSettingsBtn" class="settings-btn settings-save" type="button">Save settings</button>' +
    '</div>';

  document.getElementById("httpStationsCheckbox").checked = localStorage.getItem("useOnlyHttps") === "true";
  document.getElementById("leftHandedCheckbox").checked = localStorage.getItem("leftHanded") === "true";
  document.getElementById("stationLogosCheckbox").checked = localStorage.getItem("stationLogos") !== "false";
  document.getElementById("glassRippleCheckbox").checked = localStorage.getItem("glassRipple") === "true";
  document.getElementById("consoleTipsCheckbox").checked = localStorage.getItem("tipsAuto") !== "false";

  // Each setting is applied the moment it changes; Save settings just closes the window.
  function applyHttps() {
    var on = document.getElementById("httpStationsCheckbox").checked;
    localStorage.setItem("useOnlyHttps", on ? "true" : "false");
    if (window.updateUseOnlyHttpsSetting) window.updateUseOnlyHttpsSetting(on);
  }
  function applyLeftHanded() {
    localStorage.setItem("leftHanded", document.getElementById("leftHandedCheckbox").checked ? "true" : "false");
    updateLeftHandedSetting();
  }
  function applyLogos() {
    localStorage.setItem("stationLogos", document.getElementById("stationLogosCheckbox").checked ? "true" : "false");
    document.dispatchEvent(new Event("stationLogosChanged"));
  }
  function applyGlassRipple() {
    localStorage.setItem("glassRipple", document.getElementById("glassRippleCheckbox").checked ? "true" : "false");
    document.dispatchEvent(new Event("glassRippleChanged"));
  }

  function applyConsoleTips() {
    localStorage.setItem("tipsAuto", document.getElementById("consoleTipsCheckbox").checked ? "true" : "false");
    document.dispatchEvent(new Event("tipsAutoChanged"));
  }

  document.getElementById("consoleTipsCheckbox").addEventListener("change", applyConsoleTips);
  document.getElementById("httpStationsCheckbox").addEventListener("change", applyHttps);
  document.getElementById("leftHandedCheckbox").addEventListener("change", applyLeftHanded);
  document.getElementById("stationLogosCheckbox").addEventListener("change", applyLogos);
  document.getElementById("glassRippleCheckbox").addEventListener("change", applyGlassRipple);

  document.getElementById("saveSettingsBtn").addEventListener("click", function() {
    closeSettingsView(modal, modalContent);
  });

  document.getElementById("resetTasteBtn").addEventListener("click", function() {
    resetTaste();
    this.textContent = "Done ✓";
    this.disabled = true;
  });

  document.getElementById("resetAppBtn").addEventListener("click", function() {
    if (!confirm("Reset the app? Favorites, custom playlists and all settings will be erased.")) return;
    localStorage.clear();
    // Local mode keeps its folder handles in IndexedDB; wipe them too
    new Promise(function(resolve) {
      try {
        var req = indexedDB.deleteDatabase("fony-local");
        req.onsuccess = req.onerror = req.onblocked = function() { resolve(); };
        setTimeout(resolve, 1000);
      } catch (e) { resolve(); }
    }).then(function() { location.reload(); });
  });

  document.getElementById("backupAppBtn").addEventListener("click", function() {
    const data = JSON.stringify(localStorage, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fony_backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("restoreAppBtn").addEventListener("click", function() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = function(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(loadEvent) {
        try {
          const data = JSON.parse(loadEvent.target.result);
          localStorage.clear();
          for (const key in data) {
            localStorage.setItem(key, data[key]);
          }
          location.reload();
        } catch (err) {
          alert("Invalid backup file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  modal.style.display = "block";
}

function handleSettingsClick(e) {
  e.preventDefault();
  openSettingsModal();
}

window.openSettingsModal = openSettingsModal;
window.addEventListener("resize", updateLeftHandedSetting);

(function animateManifestoMascot() {
  var phrases = [
    "FONY is more than just a music player.",
    "It's a revolutionary Web3 platform.",
    "Infinite global music streaming, freedom, decentralization.",
    "Unlimited Free Music Streaming.",
    "No subscriptions. No restrictions. No ads.",
    "Seamless 24/7 streaming — anytime, anywhere.",
    "An Interface That Works for You.",
    "Fast, intuitive, and diverse by design.",
    "Dive into the world of music effortlessly.",
    "Web3 & NFT Integration.",
    "Connect your NFT audio tracks.",
    "Play the music you truly own.",
    "Decentralized Audio Without Limits.",
    "FONY breaks the barriers of traditional platforms.",
    "Fair, open, and built for the people.",
    "Internet Radio & Music Discovery Tools.",
    "Curated radio stations, endless genres.",
    "AI-powered advisors to expand your sonic horizons."
  ];

  var closedSrc = "/img/dark/about_icon.svg";
  var openSrc = "/img/dark/about_icon_hover.svg";
  var idx = 0;
  var mouthOpen = false;
  var talkTimer = null;
  var wasVisible = false;

  function setMouth(open) {
    var mascot = document.getElementById("manifestoMascot");
    if (mascot) mascot.src = open ? openSrc : closedSrc;
  }

  function step() {
    var mascot = document.getElementById("manifestoMascot");
    var bubble = document.getElementById("mascotBubble");
    var bubbleText = document.getElementById("mascotBubbleText");
    var visibleNow = !!(mascot && bubble && bubbleText && mascot.offsetParent !== null);

    if (!visibleNow) {
      wasVisible = false;
      clearInterval(talkTimer);
      setTimeout(step, 500);
      return;
    }
    if (!wasVisible) idx = 0;
    wasVisible = true;

    bubbleText.textContent = phrases[idx];
    bubble.classList.add("visible");

    clearInterval(talkTimer);
    talkTimer = setInterval(function() {
      mouthOpen = !mouthOpen;
      setMouth(mouthOpen);
    }, 220);

    var showDuration = Math.max(1600, phrases[idx].length * 60);
    setTimeout(function() {
      clearInterval(talkTimer);
      setMouth(false);
      var stillThere = document.getElementById("mascotBubble");
      if (stillThere) stillThere.classList.remove("visible");
      idx = (idx + 1) % phrases.length;
      setTimeout(step, 500);
    }, showDuration);
  }

  step();
})();
