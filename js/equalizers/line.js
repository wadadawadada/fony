export default function Line({ container, analyser }) {
  const h = 72
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', String(h))
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#00F2B8')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('stroke-linecap', 'round')
  svg.appendChild(path)
  container.innerHTML = ''
  container.appendChild(svg)

  // Градиент для прозрачности по краям
  const gradId = 'eq-grad-' + Math.floor(Math.random() * 1e6)
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
  grad.setAttribute('id', gradId)
  grad.setAttribute('x1', '0%')
  grad.setAttribute('y1', '0%')
  grad.setAttribute('x2', '100%')
  grad.setAttribute('y2', '0%')
  grad.innerHTML =
    `<stop offset="0%" stop-color="#00F2B8" stop-opacity="0.15"/>
     <stop offset="15%" stop-color="#00F2B8" stop-opacity="0.85"/>
     <stop offset="85%" stop-color="#00F2B8" stop-opacity="0.85"/>
     <stop offset="100%" stop-color="#00F2B8" stop-opacity="0.15"/>`
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  defs.appendChild(grad)
  svg.insertBefore(defs, svg.firstChild)

  path.setAttribute('stroke', `url(#${gradId})`)

  let raf = null
  const time = new Uint8Array(1024)
  let lastAlpha = 1

  function loop() {
    raf = requestAnimationFrame(loop)
    analyser.getByteTimeDomainData(time)
    const w = container.clientWidth || 120
    const mid = h / 2
    const step = Math.max(1, Math.floor(time.length / Math.max(2, w / 2)))
    const dx = w / Math.ceil(time.length / step)
    let x = 0
    let d = ''
    let energy = 0
    for (let i = 0; i < time.length; i += step) {
      const v = (time[i] - 128) / 128
      energy += Math.abs(v)
      const y = mid + v * (h * 0.42)
      d += i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : ` L${x.toFixed(2)},${y.toFixed(2)}`
      x += dx
    }
    path.setAttribute('d', d)
    energy /= (time.length / step)
    let targetAlpha = energy > 0.025 ? 1 : 0.13
    lastAlpha += (targetAlpha - lastAlpha) * 0.08
    grad.children[0].setAttribute('stop-opacity', (0.13 * lastAlpha).toFixed(3))
    grad.children[1].setAttribute('stop-opacity', (0.85 * lastAlpha).toFixed(3))
    grad.children[2].setAttribute('stop-opacity', (0.85 * lastAlpha).toFixed(3))
    grad.children[3].setAttribute('stop-opacity', (0.13 * lastAlpha).toFixed(3))
  }

  function start() {
    analyser.fftSize = 1024
    loop()
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = null
  }
  function destroy() {
    stop()
    container.innerHTML = ''
  }
  return { start, stop, destroy }
}
