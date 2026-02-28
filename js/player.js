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
