// Shared spectrum reader for the games. It taps the player's analyser
// (window.equalizerAnalyser, created by js/equalizer.js) and exposes smoothed,
// auto-gained levels per frequency bin plus a bass energy value.
export const BINS = 48

export function createSpectrum() {
  const spec = new Float32Array(BINS)
  let freq = null
  let peak = 0.3
  let bass = 0
  let clock = 0

  function update(dt) {
    clock += dt
    const an = window.equalizerAnalyser
    let live = false
    if (an) {
      if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount)
      an.getByteFrequencyData(freq)
      let mx = 0
      for (let i = 0; i < BINS; i++) mx = Math.max(mx, (freq[i % freq.length] || 0) / 255)
      if (mx > 0.03) live = true
      // auto gain: keep the loudest bin near full scale whatever the volume / track
      peak = Math.max(0.25, Math.max(mx, peak - dt * 0.15))
      for (let i = 0; i < BINS; i++) {
        let v = ((freq[i % freq.length] || 0) / 255) / peak
        v = Math.pow(Math.min(1, v), 1.7)
        spec[i] = v > spec[i] ? v : spec[i] - (spec[i] - v) * Math.min(1, dt * 14)
      }
    }
    if (!live) {
      // nothing playing: a calm idle wave
      for (let i = 0; i < BINS; i++) spec[i] = 0.2 + 0.25 * Math.max(0, Math.sin(i * 0.9 + clock * 2.2))
    }
    let b = 0
    for (let i = 0; i < 5; i++) b += spec[i]
    b /= 5
    bass = b > bass ? b : bass - (bass - b) * Math.min(1, dt * 6)
  }

  return {
    update,
    level: (i) => spec[((Math.round(i) % BINS) + BINS) % BINS],
    get bass() { return bass }
  }
}
