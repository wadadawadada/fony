document.addEventListener('DOMContentLoaded', () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (!isIOS) return;

  const oldAudio = document.getElementById('audioPlayer');
  if (!oldAudio) return;

  // Создаем video элемент вместо audio
  const videoPlayer = document.createElement('video');
  videoPlayer.id = 'audioPlayer'; // сохраним id для совместимости
  videoPlayer.setAttribute('playsinline', '');
  videoPlayer.setAttribute('webkit-playsinline', '');
  videoPlayer.muted = true; // Вначале mute для автозапуска
  videoPlayer.style.width = '0';
  videoPlayer.style.height = '0';
  videoPlayer.style.position = 'absolute';
  videoPlayer.style.left = '-9999px';
  videoPlayer.style.top = '-9999px';
  videoPlayer.crossOrigin = 'anonymous';

  // Переносим текущий src и volume
  videoPlayer.src = oldAudio.src;
  videoPlayer.volume = oldAudio.volume;

  oldAudio.parentNode.replaceChild(videoPlayer, oldAudio);

  let userPaused = false;
  let retryTimeout = null;

  // Функция безопасного проигрывания с попыткой разблокировки аудиоконтекста
  async function safePlay() {
    try {
      if (window.audioContext && window.audioContext.state === 'suspended') {
        await window.audioContext.resume();
      }
      await videoPlayer.play();
      videoPlayer.muted = false; // Убираем mute после успешного старта
      userPaused = false;
      console.log('[iOS patch] Playback started');
    } catch (e) {
      console.warn('[iOS patch] Playback failed, retrying...', e);
      retryPlayWithDelay();
    }
  }

  function retryPlayWithDelay(delay = 1000) {
    if (retryTimeout) clearTimeout(retryTimeout);
    retryTimeout = setTimeout(() => {
      if (!userPaused) safePlay();
    }, delay);
  }

  // Хартбит чтобы не дать iOS уснуть плееру
  let heartbeatInterval = null;
  function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(() => {
      if (videoPlayer.readyState >= 3 && !videoPlayer.paused) {
        // Небольшой seek вперед и назад, чтобы iOS не залипал
        const current = videoPlayer.currentTime;
        videoPlayer.currentTime = current + 0.01;
        videoPlayer.currentTime = current;
      }
    }, 9000); // Каждые 9 секунд
  }
  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // Обработчики событий для авто рестарта
  ['ended', 'pause', 'error', 'stalled', 'waiting', 'suspend'].forEach(eventName => {
    videoPlayer.addEventListener(eventName, () => {
      if (eventName === 'pause') {
        userPaused = true;
        stopHeartbeat();
        console.log('[iOS patch] User paused playback');
        return;
      }
      if (!userPaused) {
        console.log(`[iOS patch] Event "${eventName}" triggered, restarting playback...`);
        retryPlayWithDelay(500);
        startHeartbeat();
      }
    });
  });

  // При первом касании пользователя — запуск воспроизведения
  function onFirstUserInteraction() {
    safePlay();
    document.body.removeEventListener('touchstart', onFirstUserInteraction);
    document.body.removeEventListener('click', onFirstUserInteraction);
  }
  document.body.addEventListener('touchstart', onFirstUserInteraction, { once: true });
  document.body.addEventListener('click', onFirstUserInteraction, { once: true });

  // Если src меняется из кода — надо перезапускать
  const srcObserver = new MutationObserver(() => {
    if (!userPaused) safePlay();
  });
  srcObserver.observe(videoPlayer, { attributes: true, attributeFilter: ['src'] });
});
