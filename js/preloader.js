let preloaderHidden = false;

function revealApp() {
  const container = document.querySelector('.container');
  if (container) container.style.opacity = '1';
}

function removePreloader() {
  if (preloaderHidden) return;
  preloaderHidden = true;

  const preloader = document.getElementById('preloader');
  if (!preloader) {
    revealApp();
    return;
  }

  preloader.classList.add('fade-out-background');
  preloader.style.pointerEvents = 'none';

  const finish = () => {
    preloader.remove();
    revealApp();
  };

  preloader.addEventListener('transitionend', finish, { once: true });
  // Some mobile browsers may not emit transitionend after a tab restore or
  // when animations are disabled. Do not leave an invisible overlay behind.
  window.setTimeout(finish, 650);
}

function hidePreloaderAfterAnimation() {
  window.setTimeout(() => {
    const textContainer = document.getElementById('preloader-text');
    if (textContainer) textContainer.classList.add('fade-out-text');
    window.setTimeout(removePreloader, textContainer ? 500 : 0);
  }, 1500);
}

function createPreloader() {
  if (document.getElementById('preloader')) return;

  const preloader = document.createElement('div');
  preloader.id = 'preloader';

  const textContainer = document.createElement('div');
  textContainer.id = 'preloader-text';
  for (const [index, letter] of [...'FONY'].entries()) {
    const span = document.createElement('span');
    span.textContent = letter;
    span.className = 'preloader-letter';
    span.style.animationDelay = `${index * 0.2}s`;
    textContainer.appendChild(span);
  }

  preloader.appendChild(textContainer);
  document.body.appendChild(preloader);

  if (window.__fonyAppLoaded) hidePreloaderAfterAnimation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createPreloader, { once: true });
} else {
  createPreloader();
}

document.addEventListener('appLoaded', hidePreloaderAfterAnimation, { once: true });

// Last-resort guard for a failed or interrupted application initialization.
window.setTimeout(removePreloader, 10000);
