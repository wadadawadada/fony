document.addEventListener('DOMContentLoaded', () => {
    // Создаем контейнер прелоадера, который покроет весь экран
    const preloader = document.createElement('div');
    preloader.id = 'preloader';
    document.body.appendChild(preloader);
  
    // Создаем контейнер для текста "FONY"
    const textContainer = document.createElement('div');
    textContainer.id = 'preloader-text';
    
    // Разбиваем слово на буквы и задаем для каждой анимационную задержку
    const text = 'FONY';
    for (let i = 0; i < text.length; i++) {
      const span = document.createElement('span');
      span.textContent = text[i];
      span.classList.add('preloader-letter');
      span.style.animationDelay = `${i * 0.2}s`;
      textContainer.appendChild(span);
    }
    
    preloader.appendChild(textContainer);
  });
  
  // После полной загрузки приложения
  window.addEventListener('load', () => {
    // Ждем 1 секунду
    setTimeout(() => {
      const textContainer = document.getElementById('preloader-text');
      if (textContainer) {
        // Запускаем анимацию исчезновения текста (fade-out)
        textContainer.classList.add('fade-out-text');
        
        // После завершения анимации текста (0.5 сек), запускаем исчезновение фона
        setTimeout(() => {
          const preloader = document.getElementById('preloader');
          if (preloader) {
            preloader.classList.add('fade-out-background');
            // После завершения перехода удаляем элемент из DOM
            preloader.addEventListener('transitionend', () => {
              preloader.remove();
            });
          }
        }, 500);
      }
    }, 1000);
  });
  