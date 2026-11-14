import { resetTaste } from "./taste.js";
import { confirmDialog, toast } from "./local-mode.js";

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
        '<div class="settings-row settings-row-static settings-row-tight">' +
          '<span class="settings-name">Backup file</span>' +
          '<span class="settings-btns">' +
            '<button id="backupAppBtn" class="settings-btn settings-btn-small settings-btn-icon" title="Save backup file" aria-label="Save backup file" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg><span>Backup</span></button>' +
            '<button id="restoreAppBtn" class="settings-btn settings-btn-small settings-btn-icon" title="Load backup file" aria-label="Load backup file" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7 9l5-5 5 5M5 20h14"/></svg><span>Restore</span></button>' +
          '</span>' +
        '</div>' +
        '<div class="settings-row settings-row-static settings-row-tight">' +
          '<span class="settings-name">Nostr backup</span>' +
          '<span class="settings-btns">' +
            '<button id="nostrBackupBtn" class="settings-btn settings-btn-small settings-btn-icon" title="Back up to Nostr" aria-label="Back up to Nostr" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.6 4.7 4.7 0 0 1 17.5 18z"/><path d="M12 15v-5M9.5 12.2L12 9.7l2.5 2.5"/></svg><span>Backup</span></button>' +
            '<button id="nostrRestoreBtn" class="settings-btn settings-btn-small settings-btn-icon" title="Restore from Nostr" aria-label="Restore from Nostr" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.6 4.7 4.7 0 0 1 17.5 18z"/><path d="M12 10v5M9.5 12.8l2.5 2.5 2.5-2.5"/></svg><span>Restore</span></button>' +
          '</span>' +
        '</div>' +
        '<label class="settings-row settings-row-tight">' +
          '<span class="settings-name">Auto backup to Nostr <span class="settings-hint">daily, only if changed</span></span>' +
          '<input type="checkbox" class="settings-switch" id="nostrAutoBackup">' +
        '</label>' +
        '<div class="settings-hint settings-status" id="nostrBackupStatus"></div>' +
        '<div class="settings-row settings-row-static settings-row-tight">' +
          '<span class="settings-name">Reset app</span>' +
          '<span class="settings-btns">' +
            '<button id="resetAppBtn" class="settings-btn settings-btn-small settings-btn-danger settings-btn-icon" title="Reset app" aria-label="Reset app" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/></svg><span>Reset</span></button>' +
          '</span>' +
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

  document.getElementById("resetAppBtn").addEventListener("click", async function() {
    const sure = await confirmDialog({ title: "Reset the app?", text: "Favorites, custom playlists and all settings will be erased from this device.", okLabel: "Reset" });
    if (!sure) return;
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

  // ---- automatic Nostr backup (js/nostr/autosync.js) ----
  (function() {
    var box = document.getElementById("nostrAutoBackup");
    box.checked = localStorage.getItem("fonyNostrAutoBackup") === "1";
    box.addEventListener("change", async function() {
      var sync = await import("./nostr/autosync.js");
      sync.setAutoBackup(box.checked);
      var st = document.getElementById("nostrBackupStatus");
      st.textContent = box.checked ? "Automatic backup is on. It runs once you are signed in to Nostr." : "";
    });
  })();

  // ---- backup / restore through Nostr (encrypted, js/nostr/backup.js) ----
  (function() {
    var status = document.getElementById("nostrBackupStatus");
    var bBtn = document.getElementById("nostrBackupBtn");
    var rBtn = document.getElementById("nostrRestoreBtn");
    function say(t) { status.textContent = t; }
    // the button itself shows what is going on: its caption changes, then "Done" / "Failed" for a moment
    function label(btn, text, state) {
      var span = btn.querySelector("span");
      if (!btn.dataset.idle) btn.dataset.idle = span.textContent;
      span.textContent = text;
      btn.classList.toggle("is-busy", state === "busy");
      btn.classList.toggle("is-ok", state === "ok");
      btn.classList.toggle("is-err", state === "err");
    }
    function settle(btn, text, state) {
      label(btn, text, state);
      setTimeout(function() { label(btn, btn.dataset.idle, ""); }, 3200);
    }
    function ago(ts) {
      var m = Math.round((Date.now() - ts) / 60000);
      if (m < 2) return "just now";
      if (m < 120) return m + " min ago";
      if (m < 2880) return Math.round(m / 60) + " h ago";
      return new Date(ts).toLocaleDateString();
    }
    // not signed in: say so on the button, then open Nostr mode at the sign-in screen
    async function ready(btn) {
      var auth = await import("./nostr/auth.js");
      await auth.restoreSession();
      if (!auth.isLoggedIn()) {
        settle(btn, "Log in to Nostr", "busy");
        setTimeout(function() {
          modal.style.display = "none";
          document.dispatchEvent(new CustomEvent("fony:nostr-open", { detail: { tab: "profile", login: true } }));
        }, 900);
        return null;
      }
      return await import("./nostr/backup.js");
    }
    bBtn.addEventListener("click", async function() {
      bBtn.disabled = rBtn.disabled = true;
      say("");
      var failed = false;
      try {
        label(bBtn, "Checking…", "busy");
        var bk = await ready(bBtn);
        if (!bk) return;
        var r = await bk.backupToNostr(function(step, i, n) {
          var part = n > 1 ? " " + i + "/" + n : "";
          if (step === "encrypt") label(bBtn, "Encrypting…", "busy");
          else if (step === "sign") label(bBtn, "Approve" + part + "…", "busy");
          else label(bBtn, "Sending" + part + "…", "busy");
        });
        settle(bBtn, "Done", "ok");
        if (r.skipped.length) say("Left out (too large, use the file backup): " + r.skipped.join(", "));
      } catch (e) {
        failed = true;
        settle(bBtn, "Failed", "err");
        say(String(e && e.message || e));
      }
      finally { bBtn.disabled = rBtn.disabled = false; }
    });
    rBtn.addEventListener("click", async function() {
      bBtn.disabled = rBtn.disabled = true;
      say("");
      try {
        label(rBtn, "Checking…", "busy");
        var bk = await ready(rBtn);
        if (!bk) return;
        label(rBtn, "Searching…", "busy");
        var ev = await bk.findNostrBackup();
        if (!ev) { settle(rBtn, "No backup", "err"); return; }
        label(rBtn, "Approve…", "busy");
        var opened = await bk.openNostrBackup(ev);
        label(rBtn, "Confirm…", "busy");
        var sure = await confirmDialog({ title: "Restore this backup?", text: "Backup from " + ago(opened.at) + " (" + Object.keys(opened.entries).length + " items). It replaces the data on this device.", okLabel: "Restore", danger: false });
        if (!sure) { label(rBtn, rBtn.dataset.idle || "Restore", ""); return; }
        label(rBtn, "Restoring…", "busy");
        bk.applyBackup(opened.entries);
        location.reload();
      } catch (e) {
        settle(rBtn, "Failed", "err");
        say(String(e && e.message || e));
      }
      finally { bBtn.disabled = rBtn.disabled = false; }
    });
  })();

  document.getElementById("backupAppBtn").addEventListener("click", function() {
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // the Nostr sign-in stays on this device
      if (k === "fonyNostrSession") continue;
      all[k] = localStorage.getItem(k);
    }
    const data = JSON.stringify(all, null, 2);
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
          const keepSession = localStorage.getItem("fonyNostrSession");
          localStorage.clear();
          for (const key in data) {
            localStorage.setItem(key, data[key]);
          }
          if (keepSession) localStorage.setItem("fonyNostrSession", keepSession);
          location.reload();
        } catch (err) {
          toast("Invalid backup file");
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
    "Discover music through people, not algorithms.",
    "Infinite global music streaming, freedom, decentralization.",
    "Unlimited Free Music Streaming.",
    "No subscriptions. No restrictions. No ads.",
    "Seamless 24/7 streaming — anytime, anywhere.",
    "An Interface That Works for You.",
    "Fast, intuitive, and diverse by design.",
    "Dive into the world of music effortlessly.",
    "Share your favorite stations on Nostr.",
    "Follow a playlist, tune in to a friend.",
    "Nostr is optional. The radio is free for everyone.",
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
