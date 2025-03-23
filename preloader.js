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

// Функция для удаления прелоадера и показа основного содержимого
function removePreloader() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('fade-out-background');
    preloader.addEventListener('transitionend', () => {
      preloader.remove();
      const container = document.querySelector('.container');
      if (container) {
        container.style.opacity = '1';
      }
    });
  } else {
    const container = document.querySelector('.container');
    if (container) container.style.opacity = '1';
  }
}

// При получении кастомного события "appLoaded" запускаем анимацию исчезновения прелоадера
document.addEventListener('appLoaded', () => {
  // Задержка перед началом анимации (если нужна)
  setTimeout(() => {
    const textContainer = document.getElementById('preloader-text');
    if (textContainer) {
      textContainer.classList.add('fade-out-text');
      // После завершения анимации текста (0.5 сек) удаляем прелоадер
      setTimeout(removePreloader, 1000);
    } else {
      removePreloader();
    }
  }, 1500);
});

// Fallback: через 10 секунд принудительно удаляем прелоадер, если по какой-то причине событие не сработало
setTimeout(() => {
  removePreloader();
}, 10000);
