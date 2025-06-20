import { clearSkinStyles, loadSkinAndThemeFromStorage, reapplySkin } from "./skins.js";

document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggle');
  const leftPanel = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel');
  const defaultTheme = {
    leftPanelBg: '#f2f2f2',
    rightPanelBg: 'linear-gradient(135deg, #5587e4 0%, #d68255 20%, #ec7b2a 40%, #4b85ea 60%, #C36C8B 80%, #55cbd8 100%)',
    icon: '/img/moon.svg'
  };
  const darkTheme = {
    leftPanelBg: '#171C2B',
    rightPanelBg: 'linear-gradient(135deg, hsl(165, 94%, 30%) 0%, hsl(165, 94%, 49%) 50%, hsl(165, 94%, 70%) 100%)',
    icon: '/img/sun.svg'
  };
  const icons = {
    playPauseBtn: document.getElementById('playPauseBtn'),
    randomBtn: document.getElementById('randomBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    favBtn: document.getElementById('favBtn'),
    ffBtn: document.getElementById('ffBtn'),
    rrBtn: document.getElementById('rrBtn'),
    volumeKnob: document.querySelector('.volume-knob'),
    volumeLine: document.querySelector('.volume-line'),
    sendImg: document.querySelector('#chatSendBtn img'),
    manifestoBtn: document.querySelector('#manifestoBtn img')
  };
  const iconVariants = {
    light: {
      playPauseBtn: '/img/play_button.svg',
      randomBtn: '/img/random_button.svg',
      shuffleBtn: '/img/shuffle.svg',
      shuffleActiveBtn: '/img/shuffle_active.svg',
      favBtn: '/img/fav.svg',
      ffBtn: '/img/ff.svg',
      rrBtn: '/img/rr.svg',
      volumeKnob: '/img/volume_knob.svg',
      volumeLine: '/img/volume_line.svg',
      sendImg: '/img/send.svg',
      manifestoBtn: '/img/about_icon.svg'
    },
    dark: {
      playPauseBtn: '/img/dark/play_button.svg',
      randomBtn: '/img/dark/random_button.svg',
      shuffleBtn: '/img/dark/shuffle.svg',
      shuffleActiveBtn: '/img/dark/shuffle_active.svg',
      favBtn: '/img/dark/fav.svg',
      ffBtn: '/img/dark/ff.svg',
      rrBtn: '/img/dark/rr.svg',
      volumeKnob: '/img/dark/volume_knob.svg',
      volumeLine: '/img/dark/volume_line.svg',
      sendImg: '/img/dark/send.svg',
      manifestoBtn: '/img/dark/about_icon.svg'
    }
  };
  function applyThemeIcons(theme) {
    const variant = iconVariants[theme] || iconVariants.light;
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
    if (theme === 'dark') {
      leftPanel.style.backgroundColor = darkTheme.leftPanelBg;
      rightPanel.style.background = darkTheme.rightPanelBg;
      themeToggleBtn.querySelector('img').src = darkTheme.icon;
      document.body.classList.add('dark');
    } else {
      leftPanel.style.backgroundColor = defaultTheme.leftPanelBg;
      rightPanel.style.background = defaultTheme.rightPanelBg;
      themeToggleBtn.querySelector('img').src = defaultTheme.icon;
      document.body.classList.remove('dark');
    }
    applyThemeIcons(theme);
    document.dispatchEvent(new Event("themeChanged"));
  }
  const skinObj = loadSkinAndThemeFromStorage && loadSkinAndThemeFromStorage();
  let currentTheme;
  if (skinObj && skinObj.skin && skinObj.theme) {
    currentTheme = skinObj.theme;
    localStorage.setItem('theme', currentTheme);
  } else {
    currentTheme = localStorage.getItem('theme') || 'light';
  }
  applyTheme(currentTheme);
  if (skinObj && skinObj.skin && skinObj.theme) {
    reapplySkin();
  }
  themeToggleBtn.addEventListener('click', () => {
    clearSkinStyles();
    currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
    applyTheme(currentTheme);
    localStorage.setItem('theme', currentTheme);
  });
});
