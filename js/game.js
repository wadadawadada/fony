const SAVE_KEY = "fony_ascii_rpg_save";
let gameState = null;
let autoSaveInterval = null;

function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch(e) {}
}
function loadGame() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  } catch(e) { return null; }
}
function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch(e) {}
}

// точка входа
export default async function(container, onExit) {
  container.innerHTML = "";
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.background = '#181f2b';
  container.style.borderRadius = '18px';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  gameState = loadGame();

  const { default: startMenu } = await import("./game/start.js");

  function handleStart(opt) {
    if (opt === "new") {
      clearGame();
      gameState = null;
      startEngine();
    }
    if (opt === "resume") {
      if (!gameState) return;
      startEngine();
    }
    if (opt === "exit") {
      stopAutoSave();
      if (onExit) onExit();
    }
  }

  async function startEngine() {
    container.innerHTML = "";
    const { default: runEngine } = await import("./game/engine.js");
    await runEngine(container, {
      state: gameState,
      onState(state) { gameState = state; saveGame(state); },
      onExit: ()=>{
        stopAutoSave();
        gameState = loadGame(); // обновить после выхода из игры
        startMenu(container, handleStart, !!gameState);
      }
    });
    startAutoSave();
  }

  function startAutoSave() {
    stopAutoSave();
    autoSaveInterval = setInterval(() => {
      if (gameState) saveGame(gameState);
    }, 10000);
  }
  function stopAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }

  startMenu(container, handleStart, !!gameState);
}
