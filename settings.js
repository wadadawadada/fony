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
    document.querySelector("#manifestoModal .manifesto-content").innerHTML = defaultModalContent;
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
function handleSettingsClick(e) {
  e.preventDefault();
  var modal = document.getElementById("manifestoModal");
  var modalContent = modal.querySelector(".manifesto-content");
  defaultModalContent = modalContent.innerHTML;
  modalContent.innerHTML =
    '<h1 style="color:#00F2B8; text-align: center;">SETTINGS</h1>' +
    '<button class="manifesto-close" style="position: absolute; top: 15px; right: 20px; font-size: 24px; background: none; border: none; color: #00F2B8; cursor: pointer;">&times;</button>' +
    '<div style="padding: 20px;">' +
      '<label style="display: flex; align-items: center; gap: 10px; color: #00F2B8; font-family: \'Ruda\', sans-serif; font-size: 18px;">' +
        '<input type="checkbox" id="httpStationsCheckbox">Hide http stations' +
      '</label>' +
      '<label style="display: flex; align-items: center; gap: 10px; color: #00F2B8; font-family: \'Ruda\', sans-serif; font-size: 18px;">' +
        '<input type="checkbox" id="leftHandedCheckbox">Left Handed' +
      '</label>' +
    '</div>' +
    '<button id="resetAppBtn" style="background-color: red; color: white; border: none; border-radius: 25px; padding: 7px 13px; font-family: \'Ruda\', sans-serif; font-size: 12px; cursor: pointer; margin-top: 10px;">Reset App</button>' +
    '<button id="saveSettingsBtn" class="save-settings-btn" style="margin-top:10px;">Save Settings</button>';

  // Добавляем проверку сохранённых значений для чекбоксов
  document.getElementById("httpStationsCheckbox").checked = (localStorage.getItem("useOnlyHttps") === "false");
  document.getElementById("leftHandedCheckbox").checked = (localStorage.getItem("leftHanded") === "true");

  document.getElementById("saveSettingsBtn").addEventListener("click", function() {
    var checkbox = document.getElementById("httpStationsCheckbox");
    var newValue = checkbox.checked ? "false" : "true";
    localStorage.setItem("useOnlyHttps", newValue);
    if (window.updateUseOnlyHttpsSetting) {
      window.updateUseOnlyHttpsSetting(checkbox.checked ? false : true);
    }
    var leftHandedCheckbox = document.getElementById("leftHandedCheckbox");
    localStorage.setItem("leftHanded", leftHandedCheckbox.checked ? "true" : "false");
    updateLeftHandedSetting();
    var select = document.getElementById("playlistSelect");
    if (select) {
      select.dispatchEvent(new Event("change"));
    }
    modalContent.innerHTML = defaultModalContent;
    attachSettingsListener();
    modal.style.display = "none";
  });
  document.getElementById("resetAppBtn").addEventListener("click", function() {
    localStorage.clear();
    location.reload();
  });
  modal.style.display = "block";
}

window.addEventListener("resize", updateLeftHandedSetting);
