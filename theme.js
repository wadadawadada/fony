// theme.js

document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('themeToggle');
    const leftPanel = document.querySelector('.left-panel');
    const rightPanel = document.querySelector('.right-panel');
  
    // Определяем дефолтную (светлую) и тёмную темы (фон и т. д.)
    const defaultTheme = {
      leftPanelBg: '#f2f2f2',
      rightPanelBg: 'linear-gradient(135deg, #5587e4 0%, #d68255 20%, #ec7b2a 40%, #4b85ea 60%, #C36C8B 80%, #55cbd8 100%)',
      icon: '/img/moon.svg' // иконка переключения темы
    };
  
    const darkTheme = {
      leftPanelBg: '#171C2B',
      // Пример тёмного градиента
      rightPanelBg: 'linear-gradient(135deg, hsl(165, 94%, 30%) 0%, hsl(165, 94%, 49%) 50%, hsl(165, 94%, 70%) 100%)',
      icon: '/img/sun.svg'  // иконка переключения темы
    };
  
    // Находим нужные элементы (иконки) в DOM
    const icons = {
      playPauseBtn: document.getElementById('playPauseBtn'),
      randomBtn: document.getElementById('randomBtn'),
      shuffleBtn: document.getElementById('shuffleBtn'),
      favBtn: document.getElementById('favBtn'),
      ffBtn: document.getElementById('ffBtn'),
      rrBtn: document.getElementById('rrBtn'),
      volumeKnob: document.querySelector('.volume-knob'),
      volumeLine: document.querySelector('.volume-line'),
      // Иконка "Send" внутри кнопки #chatSendBtn
      sendImg: document.querySelector('#chatSendBtn img')
    };
  
    // Пути к иконкам для светлой и тёмной темы, включая разные иконки для shuffle
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
        sendImg: '/img/send.svg'
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
        sendImg: '/img/dark/send.svg'
      }
    };
  
    // Функция, которая меняет пути у всех иконок в зависимости от темы.
    // Здесь для shuffleBtn подставляем стандартную иконку, а переключение active-состояния будет делать controls.js.
    function applyThemeIcons(theme) {
      const variant = iconVariants[theme] || iconVariants.light;
      for (const key in icons) {
        const element = icons[key];
        // Если это shuffleBtn, то устанавливаем неактивную иконку
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
  
    // Функция применения темы (фон, градиент, иконка переключения)
    function applyTheme(theme) {
      if (theme === 'dark') {
        leftPanel.style.backgroundColor = darkTheme.leftPanelBg;
        rightPanel.style.background = darkTheme.rightPanelBg;
        themeToggleBtn.querySelector('img').src = darkTheme.icon;
        document.body.classList.add('dark'); // добавляем класс для тёмной темы
      } else {
        leftPanel.style.backgroundColor = defaultTheme.leftPanelBg;
        rightPanel.style.background = defaultTheme.rightPanelBg;
        themeToggleBtn.querySelector('img').src = defaultTheme.icon;
        document.body.classList.remove('dark'); // убираем класс тёмной темы
      }
      applyThemeIcons(theme);
    } 
  
    // Загружаем сохранённую тему из localStorage (по умолчанию — светлая)
    let currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme(currentTheme);
  
    // При клике по кнопке переключаем тему
    themeToggleBtn.addEventListener('click', () => {
      currentTheme = (currentTheme === 'light') ? 'dark' : 'light';
      applyTheme(currentTheme);
      localStorage.setItem('theme', currentTheme);
    });
  });
  