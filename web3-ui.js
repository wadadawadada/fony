// web3-ui.js

export function swapPanelBackgrounds() {
  const leftPanel = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel');
  if (!leftPanel || !rightPanel) return;

  const leftStyle = window.getComputedStyle(leftPanel);
  const rightStyle = window.getComputedStyle(rightPanel);

  const leftBg = leftStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? leftStyle.backgroundColor : leftStyle.backgroundImage;
  const rightBg = rightStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? rightStyle.backgroundColor : rightStyle.backgroundImage;

  leftPanel.style.background = rightBg;
  rightPanel.style.background = leftBg;
}

export function updateWeb3NowPlayingMetadata(track) {
  const discogsInfoContainer = document.getElementById("discogsInfoContainer");
  if (!discogsInfoContainer) return;

  discogsInfoContainer.style.display = "block";

  const color = document.body.classList.contains('dark') ? '#fff' : '#171C2B';

  discogsInfoContainer.innerHTML = `
    <div style="padding: 10px; color: ${color}; font-family: monospace;">
      <div><strong>${track.playlistTitle || `${track.artist} - ${track.trackTitle}`}</strong></div>
      ${track.cover ? `<img src="${track.cover}" alt="Cover" style="width: 120px; border-radius: 10px; margin-top: 10px;">` : ''}
    </div>
  `;
}

export function setupWeb3ChatCollapseHandler(getCurrentNFTTrack) {
  const chatContainer = document.getElementById("chat");
  const discogsInfoContainer = document.getElementById("discogsInfoContainer");
  const chatUsernameContainer = document.getElementById("chatUsernameContainer");
  const chatToggleBtn = document.getElementById("chatToggleBtn");

  if (!chatContainer || !discogsInfoContainer || !chatUsernameContainer) return;

  chatUsernameContainer.addEventListener("click", () => {
    if (window.currentMode === "web3" && typeof getCurrentNFTTrack === "function") {
      const track = getCurrentNFTTrack();
      if (track) {
        chatContainer.style.display = "none";
        updateWeb3NowPlayingMetadata(track);
      }
    }
  });

  if (chatToggleBtn) {
    chatToggleBtn.addEventListener("click", () => {
      chatContainer.style.display = "flex";
      discogsInfoContainer.style.display = "none";
      discogsInfoContainer.innerHTML = "";
    });
  }
}
