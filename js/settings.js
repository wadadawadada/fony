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
      '<div class="settings-options">' +
        '<label class="settings-option">' +
          '<input type="checkbox" id="httpStationsCheckbox">Hide http stations' +
        '</label>' +
        '<label class="settings-option">' +
          '<input type="checkbox" id="leftHandedCheckbox">Left handed layout' +
        '</label>' +
      '</div>' +
      '<div class="settings-actions">' +
        '<button id="backupAppBtn" class="settings-btn" type="button">Backup App</button>' +
        '<button id="restoreAppBtn" class="settings-btn" type="button">Restore App</button>' +
        '<button id="resetAppBtn" class="settings-btn settings-btn-danger" type="button">Reset App</button>' +
        '<button id="saveSettingsBtn" class="settings-btn settings-save" type="button">Save Settings</button>' +
      '</div>' +
    '</div>';

  document.getElementById("httpStationsCheckbox").checked = localStorage.getItem("useOnlyHttps") === "true";
  document.getElementById("leftHandedCheckbox").checked = localStorage.getItem("leftHanded") === "true";

  document.getElementById("saveSettingsBtn").addEventListener("click", function() {
    var checkbox = document.getElementById("httpStationsCheckbox");
    localStorage.setItem("useOnlyHttps", checkbox.checked ? "true" : "false");
    if (window.updateUseOnlyHttpsSetting) {
      window.updateUseOnlyHttpsSetting(checkbox.checked);
    }

    var leftHandedCheckbox = document.getElementById("leftHandedCheckbox");
    localStorage.setItem("leftHanded", leftHandedCheckbox.checked ? "true" : "false");
    updateLeftHandedSetting();
    closeSettingsView(modal, modalContent);
  });

  document.getElementById("resetAppBtn").addEventListener("click", function() {
    localStorage.clear();
    location.reload();
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
