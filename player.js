// player.js

// Плавное затухание звука
export function fadeAudioOut(audioPlayer, duration, callback) {
  const steps = 20;
  const intervalTime = duration / steps;
  const initialVolume = audioPlayer.volume;
  let currentStep = 0;

  const fadeOutInterval = setInterval(() => {
    currentStep++;
    let newVolume = Math.max(initialVolume - (initialVolume / steps) * currentStep, 0);
    audioPlayer.volume = newVolume;
    if (newVolume <= 0) {
      clearInterval(fadeOutInterval);
      if (callback) callback();
    }
  }, intervalTime);
}

// Плавное увеличение громкости
export function fadeAudioIn(audioPlayer, defaultVolume, duration) {
  const steps = 20;
  const intervalTime = duration / steps;
  let currentStep = 0;
  audioPlayer.volume = 0;

  const fadeInInterval = setInterval(() => {
    currentStep++;
    let newVolume = Math.min((defaultVolume / steps) * currentStep, defaultVolume);
    audioPlayer.volume = newVolume;
    if (newVolume >= defaultVolume) {
      clearInterval(fadeInInterval);
    }
  }, intervalTime);
}
