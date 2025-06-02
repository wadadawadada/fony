document.addEventListener('DOMContentLoaded', () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (!isIOS) return;

  const oldAudio = document.getElementById('audioPlayer');
  if (!oldAudio) return;

  // Создаем video элемент
  const videoPlayer = document.createElement('video');
  videoPlayer.id = 'audioPlayer'; // сохраняем id для совместимости
  videoPlayer.setAttribute('playsinline', '');
  videoPlayer.setAttribute('webkit-playsinline', '');
  videoPlayer.style.width = '0';
  videoPlayer.style.height = '0';
  videoPlayer.style.position = 'absolute';
  videoPlayer.style.left = '-9999px';
  videoPlayer.style.top = '-9999px';
  videoPlayer.volume = oldAudio.volume;
  videoPlayer.crossOrigin = 'anonymous';

  // Заменяем audio на video
  oldAudio.parentNode.replaceChild(videoPlayer, oldAudio);

  // Обработчики перезапуска при stalled/waiting
  videoPlayer.addEventListener('stalled', () => {
    let src = videoPlayer.src;
    videoPlayer.src = '';
    setTimeout(() => {
      videoPlayer.src = src;
      videoPlayer.play().catch(() => {});
    }, 100);
  });
  videoPlayer.addEventListener('waiting', () => {
    let src = videoPlayer.src;
    videoPlayer.src = '';
    setTimeout(() => {
      videoPlayer.src = src;
      videoPlayer.play().catch(() => {});
    }, 100);
  });

  // Если используешь AudioContext — попытка ресюма
  if (window.audioContext) {
    document.body.addEventListener('touchstart', () => {
      if (window.audioContext.state === 'suspended') {
        window.audioContext.resume();
      }
    }, { once: true });
  }
});
