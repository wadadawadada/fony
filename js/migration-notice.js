const NOTICE_STORAGE_KEY = "migrationNoticeStateV1";
const DEFAULT_MAX_SHOWS_PER_DAY = 3;
const REDUCED_MAX_SHOWS_PER_DAY = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function getTodayKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function getMaxShowsPerDay(state) {
  return state.linkVisited ? REDUCED_MAX_SHOWS_PER_DAY : DEFAULT_MAX_SHOWS_PER_DAY;
}

function loadState(todayKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTICE_STORAGE_KEY) || "{}");
    const linkVisited = parsed.linkVisited === true;

    if (parsed.dayKey !== todayKey || !Array.isArray(parsed.timestamps)) {
      return { dayKey: todayKey, timestamps: [], linkVisited };
    }

    return {
      dayKey: todayKey,
      timestamps: parsed.timestamps,
      linkVisited
    };
  } catch (_) {
    return { dayKey: todayKey, timestamps: [], linkVisited: false };
  }
}

function saveState(state) {
  localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(state));
}

function canShowNotice(state) {
  return state.timestamps.length < getMaxShowsPerDay(state);
}

function markShown(state) {
  state.timestamps.push(Date.now());
  saveState(state);
}

function timeUntilNextShow(state) {
  if (!state.timestamps.length) return 0;

  const maxShowsPerDay = getMaxShowsPerDay(state);
  if (state.timestamps.length >= maxShowsPerDay) return -1;

  const showIntervalMs = DAY_MS / maxShowsPerDay;
  const lastShownAt = state.timestamps[state.timestamps.length - 1];
  const nextAt = lastShownAt + showIntervalMs;
  return Math.max(0, nextAt - Date.now());
}

function setupMigrationNotice() {
  const modal = document.getElementById("migrationNoticeModal");
  const closeBtn = document.getElementById("migrationNoticeClose");
  const link = document.getElementById("migrationNoticeLink");

  if (!modal || !closeBtn || !link) return;

  function openModal() {
    const todayKey = getTodayKey();
    const state = loadState(todayKey);

    if (!canShowNotice(state)) {
      return;
    }

    markShown(state);
    modal.style.display = "flex";

    const nextDelay = timeUntilNextShow(state);
    if (nextDelay >= 0) {
      window.setTimeout(openModal, nextDelay);
    }
  }

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  link.addEventListener("click", (event) => {
    event.preventDefault();

    const todayKey = getTodayKey();
    const state = loadState(todayKey);
    if (!state.linkVisited) {
      state.linkVisited = true;
      saveState(state);
    }

    window.open("https://fony.fun", "_blank", "noopener,noreferrer");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const nextDelay = timeUntilNextShow(loadState(getTodayKey()));
      if (nextDelay === 0) {
        openModal();
      }
    }
  });

  const initialDelay = timeUntilNextShow(loadState(getTodayKey()));
  if (initialDelay === 0) {
    openModal();
  } else if (initialDelay > 0) {
    window.setTimeout(openModal, initialDelay);
  }
}

document.addEventListener("DOMContentLoaded", setupMigrationNotice);
