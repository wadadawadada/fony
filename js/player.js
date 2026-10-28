export function fadeAudioOut(audioPlayer, duration, callback) {
  const initialVolume = audioPlayer.volume;
  const startTime = performance.now();
  const step = 16;
  function fade() {
    const elapsed = performance.now() - startTime;
    const fraction = elapsed / duration;
    audioPlayer.volume = Math.max(initialVolume * (1 - fraction), 0);
    if (fraction < 1) {
      setTimeout(fade, step);
    } else {
      if (callback) callback();
    }
  }
  setTimeout(fade, step);
}

export function fadeAudioIn(audioPlayer, defaultVolume, duration) {
  const startTime = performance.now();
  const step = 16;
  function fade() {
    const elapsed = performance.now() - startTime;
    const fraction = Math.min(elapsed / duration, 1);
    audioPlayer.volume = fraction * defaultVolume;
    if (fraction < 1) {
      setTimeout(fade, step);
    }
  }
  setTimeout(fade, step);
}

function addTooltip(buttonId, tooltipText, position) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  // One tooltip element per button, created lazily and reused. Button
  // animations (flip, kick, heart pop) can fire mouseleave/mouseenter in quick
  // succession; creating a new element on every enter used to orphan the old
  // one, which then stayed on screen forever.
  let tooltip = null;
  let hideTimer = null;
  let holdTimer = null;
  const offsetX = 4;

  function ensureTooltip() {
    if (tooltip && tooltip.isConnected) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "custom-tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.fontFamily = "'Ruda', sans-serif";
    tooltip.style.fontSize = "12px";
    tooltip.style.color = "#00F2B8";
    tooltip.style.pointerEvents = "none";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.opacity = "0";
    tooltip.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function place() {
    const rect = button.getBoundingClientRect();
    tooltip.style.top = "0px";
    tooltip.style.left = "0px";
    const tooltipRect = tooltip.getBoundingClientRect();
    let top, left;
    if (position === "top") {
      top = rect.top - tooltipRect.height - 14;
      left = rect.left + (rect.width - tooltipRect.width) / 2 + offsetX;
    } else if (position === "left") {
      top = rect.top + (rect.height - tooltipRect.height) / 2;
      left = rect.left - tooltipRect.width - 14 + offsetX;
    } else if (position === "right") {
      top = rect.top + (rect.height - tooltipRect.height) / 2;
      left = rect.right + 14 + offsetX;
    } else {
      top = rect.top - tooltipRect.height - 14;
      left = rect.left + (rect.width - tooltipRect.width) / 2 + offsetX;
    }
    tooltip.style.top = top + window.scrollY + "px";
    tooltip.style.left = left + window.scrollX + "px";
  }

  function removeTooltip() {
    clearTimeout(hideTimer);
    clearTimeout(holdTimer);
    if (tooltip) tooltip.remove();
    tooltip = null;
  }

  function showTooltip(text) {
    clearTimeout(hideTimer);
    ensureTooltip();
    // the label can depend on the current mode (see the random button)
    tooltip.textContent = text ?? (typeof tooltipText === "function" ? tooltipText() : tooltipText);
    place();
    requestAnimationFrame(() => {
      if (!tooltip) return;
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translateY(0)";
    });
  }

  function hideTooltip() {
    clearTimeout(holdTimer);
    if (!tooltip) return;
    tooltip.style.opacity = "0";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(removeTooltip, 350);
  }

  button.addEventListener("mouseenter", () => showTooltip());
  button.addEventListener("mouseleave", hideTooltip);
  // never leave one behind if the pointer is gone or the tab loses focus
  window.addEventListener("blur", removeTooltip);
  document.addEventListener("visibilitychange", () => { if (document.hidden) removeTooltip(); });

  if (buttonId === "favBtn") {
    button.addEventListener("click", () => {
      if (!tooltip) return;
      showTooltip("Added!");
      clearTimeout(holdTimer);
      holdTimer = setTimeout(hideTooltip, 1500);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    addTooltip("randomBtn", () => (window.currentMode === "local" ? "Random Track" : "Random Station"), "left");
    addTooltip("shuffleBtn", "Shuffle", "left");
    addTooltip("favBtn", "+ Favorites", "right");
  }

  const screen = document.querySelector('.screen');
  const leftGroup = document.querySelector('.left-group');
  const rightGroup = document.querySelector('.right-group');

  if (screen && leftGroup && rightGroup && window.innerWidth <= 768) {
    [leftGroup, rightGroup].forEach(el => {
      el.style.position = 'absolute';
      el.style.top = '50%';
      el.style.left = '0';
      el.style.width = '100%';
      el.style.transform = 'translateY(0)';
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      el.style.justifyContent = 'flex-start';
      el.style.alignItems = 'center';
      el.style.zIndex = '1';
    });

    let current = 'left';

    function show(el) {
      el.style.transform = 'translateY(-50%)';
      el.style.opacity = '1';
    }
    function hide(el) {
      el.style.transform = 'translateY(0)';
      el.style.opacity = '0';
    }

    show(leftGroup);
    hide(rightGroup);

    setInterval(() => {
      if (current === 'left') {
        hide(leftGroup);
        show(rightGroup);
        current = 'right';
      } else {
        hide(rightGroup);
        show(leftGroup);
        current = 'left';
      }
    }, 5000);
  }
});
