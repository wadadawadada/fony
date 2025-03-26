export function fadeAudioOut(audioPlayer, duration, callback) {
  const initialVolume = audioPlayer.volume;
  const startTime = performance.now();
  function fade() {
    const elapsed = performance.now() - startTime;
    const fraction = elapsed / duration;
    audioPlayer.volume = Math.max(initialVolume * (1 - fraction), 0);
    if (fraction < 1) {
      requestAnimationFrame(fade);
    } else {
      if (callback) callback();
    }
  }
  requestAnimationFrame(fade);
}

export function fadeAudioIn(audioPlayer, defaultVolume, duration) {
  const startTime = performance.now();
  function fade() {
    const elapsed = performance.now() - startTime;
    const fraction = Math.min(elapsed / duration, 1);
    audioPlayer.volume = fraction * defaultVolume;
    if (fraction < 1) {
      requestAnimationFrame(fade);
    }
  }
  requestAnimationFrame(fade);
}

function addTooltip(buttonId, tooltipText, position) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  let tooltip;
  const offsetX = 4;
  function showTooltip() {
    tooltip = document.createElement("div");
    tooltip.className = "custom-tooltip";
    tooltip.textContent = tooltipText;
    tooltip.style.position = "absolute";
    tooltip.style.fontFamily = "'Ruda', sans-serif";
    tooltip.style.fontSize = "12px";
    tooltip.style.color = "#00F2B8";
    tooltip.style.pointerEvents = "none";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.opacity = "0";
    tooltip.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    document.body.appendChild(tooltip);
    const rect = button.getBoundingClientRect();
    tooltip.style.top = "0px";
    tooltip.style.left = "0px";
    const tooltipRect = tooltip.getBoundingClientRect();
    let top, left;
    if (position === "top") {
      top = rect.top - tooltipRect.height - 2;
      left = rect.left + (rect.width - tooltipRect.width) / 2 + offsetX;
    } else if (position === "left") {
      top = rect.top + (rect.height - tooltipRect.height) / 2;
      left = rect.left - tooltipRect.width - 8 + offsetX;
    } else if (position === "right") {
      top = rect.top + (rect.height - tooltipRect.height) / 2;
      left = rect.right + 8 + offsetX;
    } else {
      top = rect.top - tooltipRect.height - 8;
      left = rect.left + (rect.width - tooltipRect.width) / 2 + offsetX;
    }
    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
    requestAnimationFrame(() => {
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translateY(0)";
    });
  }
  function hideTooltip() {
    if (tooltip) {
      tooltip.style.opacity = "0";
      setTimeout(() => {
        if (tooltip && tooltip.parentElement) {
          tooltip.parentElement.removeChild(tooltip);
          tooltip = null;
        }
      }, 500);
    }
  }
  button.addEventListener("mouseenter", showTooltip);
  button.addEventListener("mouseleave", hideTooltip);
  if (buttonId === "favBtn") {
    button.addEventListener("click", () => {
      if (tooltip) {
        tooltip.style.transition = "opacity 0.3s ease";
        tooltip.style.opacity = "0";
        setTimeout(() => {
          tooltip.textContent = "Added!";
          tooltip.style.opacity = "1";
          setTimeout(() => {
            tooltip.style.opacity = "0";
            setTimeout(() => {
              if (tooltip && tooltip.parentElement) {
                tooltip.parentElement.removeChild(tooltip);
                tooltip = null;
              }
            }, 500);
          }, 2000);
        }, 300);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    addTooltip("randomBtn", "Random Station", "top");
    addTooltip("shuffleBtn", "Shuffle", "left");
    addTooltip("favBtn", "+ Favorites", "right");
  }
});
