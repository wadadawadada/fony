// Set to true only for local testing — it forces the modal on every load.
const DONATE_MODAL_TESTING_MODE = false;

const DONATE_MODAL_FIRST_USE_KEY = "donateModalFirstUse";
const DONATE_MODAL_SHOWN_COUNT_KEY = "donateModalShownCount";
const DONATE_MODAL_LAST_SHOWN_KEY = "donateModalLastShown";
const DAY_MS = 24 * 60 * 60 * 1000;
// 1st showing: 2 weeks after first use. 2nd: 2 weeks after that. From the
// 3rd showing onward: once a month.
const DONATE_MODAL_INTERVALS_DAYS = [14, 14, 30];

function shouldShowDonateModal() {
  if (DONATE_MODAL_TESTING_MODE) return true;

  const now = Date.now();
  const firstUse = parseInt(localStorage.getItem(DONATE_MODAL_FIRST_USE_KEY), 10);
  if (!firstUse) {
    localStorage.setItem(DONATE_MODAL_FIRST_USE_KEY, String(now));
    return false;
  }

  const shownCount = parseInt(localStorage.getItem(DONATE_MODAL_SHOWN_COUNT_KEY), 10) || 0;
  const lastShown = parseInt(localStorage.getItem(DONATE_MODAL_LAST_SHOWN_KEY), 10) || firstUse;
  const intervalDays = DONATE_MODAL_INTERVALS_DAYS[Math.min(shownCount, DONATE_MODAL_INTERVALS_DAYS.length - 1)];

  return now - lastShown >= intervalDays * DAY_MS;
}

function openDonateModal() {
  const modal = document.getElementById("donateModal");
  if (!modal) return;
  modal.style.display = "block";
  if (!DONATE_MODAL_TESTING_MODE) {
    const shownCount = parseInt(localStorage.getItem(DONATE_MODAL_SHOWN_COUNT_KEY), 10) || 0;
    localStorage.setItem(DONATE_MODAL_SHOWN_COUNT_KEY, String(shownCount + 1));
    localStorage.setItem(DONATE_MODAL_LAST_SHOWN_KEY, String(Date.now()));
  }
}

function closeDonateModal() {
  const modal = document.getElementById("donateModal");
  if (modal) modal.style.display = "none";
}

function attachDonateModalListeners() {
  const modal = document.getElementById("donateModal");
  const closeBtn = document.getElementById("donateModalClose");
  if (closeBtn) closeBtn.addEventListener("click", closeDonateModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDonateModal();
    });
  }

  document.querySelectorAll(".donate-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-copy-target");
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      navigator.clipboard.writeText(targetEl.textContent.trim()).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "✓";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove("copied");
        }, 2000);
      });
    });
  });
}

function animateDonateMascot() {
  const phrases = [
    "Enjoying FONY?",
    "Servers and streams aren't free.",
    "FONY stays free, open, and ad-free.",
    "A small donation goes a long way.",
    "Every bit helps keep the music playing.",
    "Support the project below!",
    "Thanks for being part of FONY."
  ];

  const closedSrc = "/img/dark/about_icon.svg";
  const openSrc = "/img/dark/about_icon_hover.svg";
  let idx = 0;
  let mouthOpen = false;
  let talkTimer = null;
  let wasVisible = false;

  function setMouth(open) {
    const mascot = document.getElementById("donateMascot");
    if (mascot) mascot.src = open ? openSrc : closedSrc;
  }

  function step() {
    const mascot = document.getElementById("donateMascot");
    const bubble = document.getElementById("donateMascotBubble");
    const bubbleText = document.getElementById("donateMascotBubbleText");
    const visibleNow = !!(mascot && bubble && bubbleText && mascot.offsetParent !== null);

    if (!visibleNow) {
      wasVisible = false;
      clearInterval(talkTimer);
      setTimeout(step, 500);
      return;
    }
    if (!wasVisible) idx = 0;
    wasVisible = true;

    bubbleText.textContent = phrases[idx];
    bubble.classList.add("visible");

    clearInterval(talkTimer);
    talkTimer = setInterval(() => {
      mouthOpen = !mouthOpen;
      setMouth(mouthOpen);
    }, 220);

    const showDuration = Math.max(1600, phrases[idx].length * 60);
    setTimeout(() => {
      clearInterval(talkTimer);
      setMouth(false);
      const stillThere = document.getElementById("donateMascotBubble");
      if (stillThere) stillThere.classList.remove("visible");
      idx = (idx + 1) % phrases.length;
      setTimeout(step, 500);
    }, showDuration);
  }

  step();
}

function maybeOpenDonateModal() {
  if (shouldShowDonateModal()) {
    openDonateModal();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  attachDonateModalListeners();
  animateDonateMascot();

  const preloader = document.getElementById("preloader");
  if (preloader) {
    document.addEventListener("preloaderRemoved", maybeOpenDonateModal, { once: true });
  } else {
    maybeOpenDonateModal();
  }
});
