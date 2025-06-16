function applyChatState() {
  const chatContainer = document.getElementById("chat");
  const chatToggleBtn = document.getElementById("chatToggleBtn");
  const chatUsernameContainer = document.getElementById("chatUsernameContainer");
  const discogsContainer = document.getElementById("discogsInfoContainer"); // контейнер метаданных

  if (!chatContainer || !chatToggleBtn || !chatUsernameContainer) {
    console.warn("Chat elements not found for patches.js");
    return;
  }

  const STORAGE_KEY_VISIBLE = "chatVisible";
  const STORAGE_KEY_WIDTH = "chatWidthPercent";

  const visible = localStorage.getItem(STORAGE_KEY_VISIBLE);

  if (visible === "false") {
    chatContainer.style.display = "none";
    chatToggleBtn.style.display = "block";

    if (discogsContainer) {
      discogsContainer.style.display = "block";  // Показываем метаданные, если чат свернут
    }

    const playerControls = document.querySelector('.player-controls');
    if (playerControls) playerControls.classList.add('chat-collapsed');
  } else {
    chatContainer.style.display = "flex";
    chatToggleBtn.style.display = "none";

    if (discogsContainer) {
      discogsContainer.style.display = "none";  // Скрываем метаданные, если чат открыт
    }

    const playerControls = document.querySelector('.player-controls');
    if (playerControls) playerControls.classList.remove('chat-collapsed');
  }

  const widthPercent = localStorage.getItem(STORAGE_KEY_WIDTH);
  if (widthPercent) {
    chatContainer.style.width = widthPercent;
  }
}

function setupStateListeners() {
  const chatContainer = document.getElementById("chat");
  const chatToggleBtn = document.getElementById("chatToggleBtn");
  const chatUsernameContainer = document.getElementById("chatUsernameContainer");
  const discogsContainer = document.getElementById("discogsInfoContainer");

  if (!chatContainer || !chatToggleBtn || !chatUsernameContainer) return;

  const STORAGE_KEY_VISIBLE = "chatVisible";
  const STORAGE_KEY_WIDTH = "chatWidthPercent";

  chatUsernameContainer.addEventListener("click", () => {
    chatContainer.style.display = "none";
    chatToggleBtn.style.display = "block";

    if (discogsContainer) {
      discogsContainer.style.display = "block";
    }

    localStorage.setItem(STORAGE_KEY_VISIBLE, "false");

    const playerControls = document.querySelector('.player-controls');
    if (playerControls) playerControls.classList.add('chat-collapsed');
  });

  chatToggleBtn.addEventListener("click", () => {
    chatContainer.style.display = "flex";
    chatToggleBtn.style.display = "none";

    if (discogsContainer) {
      discogsContainer.style.display = "none";
    }

    localStorage.setItem(STORAGE_KEY_VISIBLE, "true");

    const playerControls = document.querySelector('.player-controls');
    if (playerControls) playerControls.classList.remove('chat-collapsed');
  });

  let lastWidth = chatContainer.style.width || null;
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === "style") {
        const w = chatContainer.style.width;
        if (w && w !== lastWidth) {
          lastWidth = w;
          localStorage.setItem(STORAGE_KEY_WIDTH, w);
        }
      }
    });
  });
  observer.observe(chatContainer, { attributes: true });
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    applyChatState();
    setupStateListeners();
  }, 100);
});
