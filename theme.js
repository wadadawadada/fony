// theme.js

document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('themeToggle');
    const leftPanel = document.querySelector('.left-panel');
    const rightPanel = document.querySelector('.right-panel');
  
    // Определяем дефолтную (светлую) и тёмную темы
    const defaultTheme = {
      leftPanelBg: '#f2f2f2',
      rightPanelBg: 'linear-gradient(135deg, #5587e4 0%, #d68255 20%, #ec7b2a 40%, #4b85ea 60%, #C36C8B 80%, #55cbd8 100%)',
      icon: '/img/moon.svg'
    };
  
    const darkTheme = {
        leftPanelBg: '#171C2B',
        // Градиент для тёмной темы с использованием оттенков #07F2B8
        rightPanelBg: 'linear-gradient(135deg, hsl(165, 94%, 30%) 0%, hsl(165, 94%, 49%) 50%, hsl(165, 94%, 70%) 100%)',
        icon: '/img/sun.svg'
    };
      
    // Загружаем сохранённую тему из localStorage (по умолчанию — светлая)
    let currentTheme = localStorage.getItem('theme') || 'light';
  
    // Функция применения выбранной темы
    function applyTheme(theme) {
      if (theme === 'dark') {
        leftPanel.style.backgroundColor = darkTheme.leftPanelBg;
        rightPanel.style.background = darkTheme.rightPanelBg;
        themeToggleBtn.querySelector('img').src = darkTheme.icon;
      } else {
        leftPanel.style.backgroundColor = defaultTheme.leftPanelBg;
        rightPanel.style.background = defaultTheme.rightPanelBg;
        themeToggleBtn.querySelector('img').src = defaultTheme.icon;
      }
    }
  
    // Применяем тему при загрузке страницы
    applyTheme(currentTheme);
  
    // Обработчик клика по кнопке переключения темы
    themeToggleBtn.addEventListener('click', () => {
      currentTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(currentTheme);
      localStorage.setItem('theme', currentTheme);
    });
});
