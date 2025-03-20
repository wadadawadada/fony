// player.js

// Функции плавного затухания и увеличения громкости, реализованные через requestAnimationFrame.

export function fadeAudioOut(audioPlayer, duration, callback) {
  const initialVolume = audioPlayer.volume;
  const startTime = performance.now();

  function fade() {
    const elapsed = performance.now() - startTime;
    const fraction = elapsed / duration;
    audioPlayer.volume = Math.max(initialVolume * (1 - fraction), 0);
    if (fraction < 1) {
      requestAnimationFrame(fade);
    } else {
      if (callback) callback();
    }
  }
  requestAnimationFrame(fade);
}

export function fadeAudioIn(audioPlayer, defaultVolume, duration) {
  const startTime = performance.now();

  function fade() {
    const elapsed = performance.now() - startTime;
    const fraction = Math.min(elapsed / duration, 1);
    audioPlayer.volume = fraction * defaultVolume;
    if (fraction < 1) {
      requestAnimationFrame(fade);
    }
  }
  requestAnimationFrame(fade);
}
