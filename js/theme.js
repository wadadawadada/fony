import { clearSkinStyles, loadSkinAndThemeFromStorage, reapplySkin } from "./utils/skins.js";

document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggle');
  const leftPanel = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel');
  const defaultTheme = {
    leftPanelBg: '#f2f2f2',
    rightPanelBg: 'linear-gradient(135deg, #5587e4 0%, #d68255 20%, #ec7b2a 40%, #4b85ea 60%, #C36C8B 80%, #55cbd8 100%)',
    // the toggle shows the theme a click switches to; order: dark -> light -> glass
    // light -> liquid glass (drop)
    icon: '/img/glass_ink.svg',
    next: 'liquid glass'
  };
  const darkTheme = {
    leftPanelBg: '#171C2B',
    rightPanelBg: 'linear-gradient(135deg, hsl(165, 94%, 30%) 0%, hsl(165, 94%, 49%) 50%, hsl(165, 94%, 70%) 100%)',
    // dark -> light (sun)
    icon: '/img/sun.svg',
    next: 'light'
  };
  const icons = {
    playPauseBtn: document.getElementById('playPauseBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    favBtn: document.getElementById('favBtn'),
    ffBtn: document.getElementById('ffBtn'),
    rrBtn: document.getElementById('rrBtn'),
    volumeKnob: document.querySelector('.volume-knob'),
    volumeLine: document.querySelector('.volume-line'),
    sendImg: document.querySelector('#chatSendBtn img'),
    manifestoBtn: document.querySelector('#manifestoBtn img'),
    connectWalletBtn: document.getElementById('connectWalletBtn'),
    localModeIcon: document.getElementById('localModeIcon'),
    settingsBtnIcon: document.getElementById('settingsBtnIcon'),
    logoutIcon: document.getElementById('logoutIcon')
  };
  const glassTheme = {
    // liquid glass -> dark (moon)
    icon: '/img/moon_white.svg',
    next: 'dark'
  };
  const iconVariants = {
    light: {
      playPauseBtn: '/img/play_button.svg',
      shuffleBtn: '/img/shuffle.svg',
      shuffleActiveBtn: '/img/shuffle_active.svg',
      favBtn: '/img/fav.svg',
      ffBtn: '/img/ff.svg',
      rrBtn: '/img/rr.svg',
      volumeKnob: '/img/volume_knob.svg',
      volumeLine: '/img/volume_line.svg',
      sendImg: '/img/send.svg',
      manifestoBtn: '/img/about_icon.svg',
      connectWalletBtn: '/img/wallet.svg',
      localModeIcon: '/img/local.svg',
      settingsBtnIcon: '/img/gear.svg',
      logoutIcon: '/img/logout.svg'
    },
    dark: {
      playPauseBtn: '/img/dark/play_button.svg',
      shuffleBtn: '/img/dark/shuffle.svg',
      shuffleActiveBtn: '/img/dark/shuffle_active.svg',
      favBtn: '/img/dark/fav.svg',
      ffBtn: '/img/dark/ff.svg',
      rrBtn: '/img/dark/rr.svg',
      volumeKnob: '/img/dark/volume_knob.svg',
      volumeLine: '/img/dark/volume_line.svg',
      sendImg: '/img/dark/send.svg',
      manifestoBtn: '/img/dark/about_icon.svg',
      connectWalletBtn: '/img/dark/wallet.svg',
      localModeIcon: '/img/dark/local.svg',
      settingsBtnIcon: '/img/dark/gear.svg',
      logoutIcon: '/img/dark/logout.svg'
    }
  };
  function applyThemeIcons(theme) {
    const variant = iconVariants[theme === 'glass' ? 'dark' : theme] || iconVariants.light;
    for (const key in icons) {
      const element = icons[key];
      let newSrc;
      if (key === 'shuffleBtn') {
        newSrc = variant.shuffleBtn;
      } else {
        newSrc = variant[key];
      }
      if (element && newSrc) {
        element.src = newSrc;
      }
    }
  }
  function applyTheme(theme) {
    const toggleIcon = themeToggleBtn.querySelector('img');
    if (theme === 'glass') {
      ensureGlassLayers();
      leftPanel.style.background = '';
      leftPanel.style.backgroundColor = '';
      rightPanel.style.background = '';
      toggleIcon.src = glassTheme.icon;
      themeToggleBtn.title = 'Switch to ' + glassTheme.next;
      document.body.classList.add('dark', 'glass');
    } else if (theme === 'dark') {
      leftPanel.style.backgroundColor = darkTheme.leftPanelBg;
      rightPanel.style.background = darkTheme.rightPanelBg;
      toggleIcon.src = darkTheme.icon;
      themeToggleBtn.title = 'Switch to ' + darkTheme.next;
      document.body.classList.remove('glass');
      document.body.classList.add('dark');
    } else {
      leftPanel.style.backgroundColor = defaultTheme.leftPanelBg;
      rightPanel.style.background = defaultTheme.rightPanelBg;
      toggleIcon.src = defaultTheme.icon;
      themeToggleBtn.title = 'Switch to ' + defaultTheme.next;
      document.body.classList.remove('dark', 'glass');
    }
    applyThemeIcons(theme);
    document.dispatchEvent(new Event("themeChanged"));
  }

  // Liquid glass needs a colourful scene behind the panels and an SVG filter that
  // bends the backdrop near the edges of every glass surface (refraction).
  let glassReady = false;
  function ensureGlassLayers() {
    if (glassReady) return;
    glassReady = true;
    const backdrop = document.createElement('div');
    backdrop.id = 'glassBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = '<i class="gb-orb gb-1"></i><i class="gb-orb gb-2"></i><i class="gb-orb gb-3"></i><i class="gb-orb gb-4"></i><i class="gb-sphere gb-5"></i><i class="gb-sphere gb-6"></i>';
    document.body.prepend(backdrop);

    const edge = (axis) => {
      return `<linearGradient id="${axis}" x1="0" y1="0" x2="${axis === 'x' ? 1 : 0}" y2="${axis === 'y' ? 1 : 0}">` +
        `<stop offset="0" stop-color="rgb(255,0,0)"/><stop offset="0.03" stop-color="rgb(190,0,0)"/>` +
        `<stop offset="0.08" stop-color="rgb(136,0,0)"/><stop offset="0.12" stop-color="rgb(128,0,0)"/>` +
        `<stop offset="0.88" stop-color="rgb(128,0,0)"/><stop offset="0.92" stop-color="rgb(120,0,0)"/>` +
        `<stop offset="0.97" stop-color="rgb(66,0,0)"/><stop offset="1" stop-color="rgb(0,0,0)"/></linearGradient>`;
    };
    // the map's red channel drives x, green drives y: draw both gradients and add them
    const mapSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" width="100" height="100"><defs>' +
      edge('x') + edge('y').replace(/rgb\((\d+),0,0\)/g, 'rgb(0,$1,0)') +
      '</defs><rect width="100" height="100" fill="#000"/>' +
      '<rect width="100" height="100" fill="url(#x)" style="mix-blend-mode:screen"/>' +
      '<rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen"/></svg>';
    const href = 'data:image/svg+xml,' + encodeURIComponent(mapSvg);
    const filter = (id, scale) =>
      `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
      `<feImage href="${href}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;pointer-events:none';
    svg.innerHTML = '<defs>' + filter('fony-lg', 46) + filter('fony-lg-soft', 18) + '</defs>';
    document.body.prepend(svg);

    // soft light that follows the cursor across glass surfaces
    let raf = 0;
    document.addEventListener('pointermove', (e) => {
      if (!document.body.classList.contains('glass') || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const root = document.documentElement.style;
        root.setProperty('--mx', e.clientX + 'px');
        root.setProperty('--my', e.clientY + 'px');
      });
    }, { passive: true });
  }
  const skinObj = loadSkinAndThemeFromStorage && loadSkinAndThemeFromStorage();
  let currentTheme;
  if (skinObj && skinObj.skin && skinObj.theme) {
    currentTheme = skinObj.theme;
    localStorage.setItem('theme', currentTheme);
  } else {
    // first launch: dark
    currentTheme = localStorage.getItem('theme') || 'dark';
  }
  // other modules read the theme from storage to pick icon sets
  localStorage.setItem('theme', currentTheme);
  applyTheme(currentTheme);
  if (skinObj && skinObj.skin && skinObj.theme) {
    reapplySkin();
  }
  themeToggleBtn.addEventListener('click', () => {
    clearSkinStyles();
    const order = ['dark', 'light', 'glass'];
    currentTheme = order[(order.indexOf(currentTheme) + 1) % order.length];
    applyTheme(currentTheme);
    localStorage.setItem('theme', currentTheme);
  });
});
