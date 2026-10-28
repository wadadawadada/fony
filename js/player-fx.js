// Motion for the player buttons: playing-state ring, click ripples, per-button
// one-shot animations and the heart burst. Styling lives in css/design.css.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

function once(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation if it is still running
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
}

function ripple(el) {
  const { x, y, size } = center(el);
  const r = document.createElement('div');
  r.className = 'fx-ripple';
  r.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px`;
  document.body.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
}

function sparks(el) {
  const { x, y, size } = center(el);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const d = size * (0.7 + Math.random() * 0.5);
    const s = document.createElement('div');
    s.className = 'fx-spark';
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
    document.body.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

ready(() => {
  const audio = document.getElementById('audioPlayer');
  const circle = document.querySelector('.center-circle');
  const playBtn = document.getElementById('playPauseBtn');
  const favBtn = document.getElementById('favBtn');
  const ffBtn = document.getElementById('ffBtn');
  const rrBtn = document.getElementById('rrBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');

  // playing-state ring follows the real audio element
  if (audio && circle) {
    const sync = () => circle.classList.toggle('is-playing', !audio.paused && !audio.ended);
    ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, sync));
    audio.addEventListener('play', () => playBtn && !reduceMotion.matches && once(playBtn, 'fx-pop'));
    audio.addEventListener('pause', () => playBtn && !reduceMotion.matches && once(playBtn, 'fx-pop'));
    sync();
  }

  // ripple on every round button press
  document.addEventListener('pointerdown', e => {
    if (reduceMotion.matches || window.innerWidth <= 768) return;
    const btn = e.target.closest && e.target.closest('.player-btn');
    if (btn) ripple(btn);
  });

  if (ffBtn) ffBtn.addEventListener('click', () => !reduceMotion.matches && once(ffBtn, 'fx-kick-r'));
  if (rrBtn) rrBtn.addEventListener('click', () => !reduceMotion.matches && once(rrBtn, 'fx-kick-l'));
  if (shuffleBtn) shuffleBtn.addEventListener('click', () => !reduceMotion.matches && once(shuffleBtn, 'fx-flip'));

  // heart burst only when the user turns a favourite on (not on station change)
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      setTimeout(() => {
        if (reduceMotion.matches || !/fav_active/.test(favBtn.getAttribute('src') || '')) return;
        once(favBtn, 'fx-heart');
        sparks(favBtn);
      }, 60);
    });
  }
});
