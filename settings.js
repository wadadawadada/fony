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
  modalContent.innerHTML = '<h1 style="color:#00F2B8; text-align: center;">SETTINGS</h1><div style="padding: 20px;"><label style="display: flex; align-items: center; gap: 10px; color: #00F2B8; font-family: \'Ruda\', sans-serif; font-size: 18px;"><input type="checkbox" id="httpStationsCheckbox">Show http stations (not safe)</label><label style="display: flex; align-items: center; gap: 10px; color: #00F2B8; font-family: \'Ruda\', sans-serif; font-size: 18px;"><input type="checkbox" id="leftHandedCheckbox">Left Handed</label></div><button id="saveSettingsBtn" class="save-settings-btn">Save Settings</button>';
  var checkbox = document.getElementById("httpStationsCheckbox");
  checkbox.checked = (localStorage.getItem("useOnlyHttps") === "false");
  var leftHandedCheckbox = document.getElementById("leftHandedCheckbox");
  leftHandedCheckbox.checked = (localStorage.getItem("leftHanded") === "true");
  document.getElementById("saveSettingsBtn").addEventListener("click", function() {
    var newValue = checkbox.checked ? "false" : "true";
    localStorage.setItem("useOnlyHttps", newValue);
    if (window.updateUseOnlyHttpsSetting) {
      window.updateUseOnlyHttpsSetting(checkbox.checked ? false : true);
    }
    localStorage.setItem("leftHanded", leftHandedCheckbox.checked ? "true" : "false");
    updateLeftHandedSetting();
    var select = document.getElementById("playlistSelect");
    if (select) {
      select.dispatchEvent(new Event("change"));
    }
    document.querySelector("#manifestoModal .manifesto-content").innerHTML = defaultModalContent;
    attachSettingsListener();
    modal.style.display = "none";
  });
  modal.style.display = "block";
}
window.addEventListener("resize", updateLeftHandedSetting);
