// equalizer.js
import Bars from './equalizers/bars.js'
import Line from './equalizers/line.js'
import Fish from './equalizers/fish.js'
import Lava from './equalizers/lava.js'
import Sheep from './equalizers/sheep.js';


export function initEqualizer() {
  const diodsRow = document.querySelector('.diods-row')
  if (!diodsRow) return
  diodsRow.innerHTML = ''

  const eqContainer = document.createElement('div')
  eqContainer.classList.add('equalizer-container')
  eqContainer.style.position = 'relative'
  diodsRow.appendChild(eqContainer)

  const audioPlayer = document.getElementById('audioPlayer')
  if (!audioPlayer) return

  let audioContext = window.audioContext
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    window.audioContext = audioContext
    if (audioContext.state === 'suspended') audioContext.resume()
  }

  if (!window.audioSource) {
    try {
      window.audioSource = audioContext.createMediaElementSource(audioPlayer)
    } catch (e) {
      return
    }
  }

  if (!window.equalizerAnalyser) {
    window.equalizerAnalyser = audioContext.createAnalyser()
    window.equalizerAnalyser.fftSize = 128
    window.audioSource.connect(window.equalizerAnalyser)
    window.equalizerAnalyser.connect(audioContext.destination)
  }
  const analyser = window.equalizerAnalyser

  let idx = 0
  let instance = null
  const vis = [Bars, Line, Fish, Lava, Sheep]

  function mount(i) {
    if (instance && instance.destroy) instance.destroy()
    instance = vis[i]({ container: eqContainer, analyser, audio: audioPlayer })
    if (instance && instance.start) instance.start()
  }

  mount(idx)

  eqContainer.addEventListener('click', () => {
    idx = (idx + 1) % vis.length
    mount(idx)
  })
}
