document.addEventListener('DOMContentLoaded', () => {
  const preloader = document.createElement('div');
  preloader.id = 'preloader';
  document.body.appendChild(preloader);

  const textContainer = document.createElement('div');
  textContainer.id = 'preloader-text';

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

document.addEventListener('appLoaded', () => {
  setTimeout(() => {
    const textContainer = document.getElementById('preloader-text');
    if (textContainer) {
      textContainer.classList.add('fade-out-text');
      setTimeout(removePreloader, 500);
    } else {
      removePreloader();
    }
  }, 1500);
});

setTimeout(() => {
  removePreloader();
}, 10000);
