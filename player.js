// player.js

// Функции плавного затухания и увеличения громкости, реализованные через requestAnimationFrame.

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

// --- Tooltip functionality ---
// Функция для добавления подсказок к кнопкам
function addTooltip(buttonId, tooltipText, position) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  let tooltip; // элемент подсказки
  const offsetX = 4; // сдвиг вправо для всех подсказок

  function showTooltip() {
    tooltip = document.createElement("div");
    tooltip.className = "custom-tooltip";
    tooltip.textContent = tooltipText;
    // Основные стили подсказки
    tooltip.style.position = "absolute";
    tooltip.style.fontFamily = "'Ruda', sans-serif";
    tooltip.style.fontSize = "12px"; // уменьшенный шрифт
    tooltip.style.color = "#00F2B8";
    // Выравнивание текста в зависимости от позиции:
    // для top – по центру, для left – по правому краю, для right – по левому краю
    if (position === "top") {
      tooltip.style.textAlign = "center";
    } else if (position === "left") {
      tooltip.style.textAlign = "right";
    } else if (position === "right") {
      tooltip.style.textAlign = "left";
    } else {
      tooltip.style.textAlign = "center";
    }
    tooltip.style.pointerEvents = "none";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.opacity = "0";
    tooltip.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    document.body.appendChild(tooltip);

    // Получаем размеры кнопки
    const rect = button.getBoundingClientRect();
    // Сначала позиционируем элемент без смещения, чтобы получить его размеры
    tooltip.style.top = "0px";
    tooltip.style.left = "0px";
    const tooltipRect = tooltip.getBoundingClientRect();
    let top, left;

    // Располагаем подсказку в зависимости от заданного положения и добавляем offsetX
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

    // Запускаем анимацию появления
    requestAnimationFrame(() => {
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translateY(0)";
    });
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.opacity = "0";
      // Удаляем элемент после окончания анимации
      setTimeout(() => {
        if (tooltip && tooltip.parentElement) {
          tooltip.parentElement.removeChild(tooltip);
          tooltip = null;
        }
      }, 500);
    }
  }

  // Навешиваем обработчики событий на кнопку
  button.addEventListener("mouseenter", showTooltip);
  button.addEventListener("mouseleave", hideTooltip);
}

// Инициализация подсказок только для десктопной версии (устройств с hover и точным указателем)
document.addEventListener("DOMContentLoaded", () => {
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    addTooltip("randomBtn", "Random Station", "top");
    addTooltip("shuffleBtn", "Shuffle", "left");
    addTooltip("favBtn", "+ Favorites", "right");
  }
});
