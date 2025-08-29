export default function Fish({ container, analyser }) {
  const h = 72
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', String(h))
  const algaeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  const bubblesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  const fishGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  svg.appendChild(algaeGroup)
  svg.appendChild(bubblesGroup)
  svg.appendChild(fishGroup)
  container.innerHTML = ''
  container.appendChild(svg)

  let raf = null
  let freq = new Uint8Array(512)
  let bubbles = []
  const emitters = 16
  const baseMaxBubbles = 40
  let target = null, following = false

  const fish = { x: 20, y: h * 0.5, dir: 1 }
  const fishW = 41, fishH = 35

  const fishImg = document.createElementNS('http://www.w3.org/2000/svg', 'image')
  fishImg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '/js/equalizers/img/fish.svg')
  fishImg.setAttribute('href', '/js/equalizers/img/fish.svg')

  fishImg.setAttribute('height', fishH)
  fishGroup.appendChild(fishImg)

  function levelFromFreq() {
    analyser.getByteFrequencyData(freq)
    let s = 0
    for (let i = 0; i < freq.length; i++) s += freq[i]
    const avg = s / Math.max(1, freq.length)
    return avg / 255
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v))
  }
  function drawAlgae(level) {
    const w = container.clientWidth || 120
    const count = 6
    const pointsPerAlgae = 10
    const baseHeight = 20
    const amp = 7 + level * 32
    algaeGroup.replaceChildren()
    for (let i = 0; i < count; i++) {
      const x0 = (i + 0.5) * (w / count)
      let path = ''
      for (let j = 0; j <= pointsPerAlgae; j++) {
        const t = j / pointsPerAlgae
        const y = h - t * (baseHeight + (i % 2 ? 18 : 28))
        const sway = Math.sin(Date.now() * 0.0018 + i * 1.1 + t * 2.5 + level * 2) * amp * (1 - t) + Math.sin(t * 7 + i) * 3 * t
        const x = x0 + sway
        if (j === 0) path += `M${x.toFixed(2)},${y.toFixed(2)}`
        else path += ` Q${x0.toFixed(2)},${(y + 8).toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`
      }
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('d', path)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', '#00F2B8')
      p.setAttribute('stroke-width', '1.3')
      p.setAttribute('stroke-linecap', 'round')
      algaeGroup.appendChild(p)
    }
  }
  function spawnBubbles() {
    const w = container.clientWidth || 120
    analyser.getByteFrequencyData(freq)
    const bandSize = Math.floor(freq.length / emitters)
    let maxAllowed = 0
    for (let i = 0; i < emitters; i++) {
      let max = 0
      for (let j = i * bandSize; j < (i + 1) * bandSize; j++) {
        if (freq[j] > max) max = freq[j]
      }
      let value = max / 255
      const px = (i + 0.5) / emitters
      const x = px * (w - 16) + 8
      const emitChance = value * 0.37 + 0.01
      const speed = 0.18 + value * 0.47
      const grow = 1 + value * 2.4
      const r = 2 + 7 * Math.pow(value, 1.18)
      const maxB = Math.floor(baseMaxBubbles / emitters * (0.7 + value * 1.6))
      maxAllowed += maxB
      if (bubbles.filter(b => b.em === i).length < maxB && Math.random() < emitChance) {
        bubbles.push({ x, y: h - 4, r, baseR: r, vy: speed, grow, em: i, value })
      }
    }
    if (bubbles.length > maxAllowed) bubbles = bubbles.slice(-maxAllowed)
  }
  function drawBubbles() {
    bubbles = bubbles.filter(b => b.y + b.r > 0)
    bubbles.forEach(b => {
      b.y -= b.vy
      b.x += Math.sin((b.y + b.r) * 0.08 + b.em) * 0.11
      const norm = 1 - (b.y / h)
      b.r = b.baseR * (1 + norm * b.grow)
      if (b.y < h * 0.2 && Math.random() < 0.015) b.r *= 0.97
    })
    bubblesGroup.replaceChildren(
      ...bubbles.map(b => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        c.setAttribute('cx', b.x.toFixed(2))
        c.setAttribute('cy', b.y.toFixed(2))
        c.setAttribute('r', b.r.toFixed(2))
        c.setAttribute('fill', 'none')
        c.setAttribute('stroke', '#00F2B8')
        c.setAttribute('stroke-width', '0.85')
        c.setAttribute('opacity', '0.8')
        return c
      })
    )
  }

  let pointer = null
  svg.addEventListener('mouseenter', e => { following = true })
  svg.addEventListener('mouseleave', e => { following = false; target = null })
  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect()
    pointer = {
      x: ((e.clientX - rect.left) / rect.width) * (container.clientWidth || 120),
      y: ((e.clientY - rect.top) / rect.height) * h
    }
    target = { ...pointer }
  })

  function drawFish(level) {
    const w = container.clientWidth || 120
    const minX = fishW / 2 + 2
    const maxX = w - fishW / 2 - 2
    let speed = 0.5 + level * 0.2
    let fishTarget = null
    if (following && target) {
    const stopOffset = 20
    const direction = target.x > fish.x ? 1 : -1
    let desiredX = target.x + (direction > 0 ? -stopOffset : stopOffset)
    desiredX = clamp(desiredX, minX, maxX)
    const targetY = clamp(target.y, fishH / 2, h - fishH / 2)
    const dx = desiredX - fish.x
    const dy = targetY - fish.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const maxStep = speed * 1.4
    if (dist > 0.5) {
        fish.x += clamp(dx, -maxStep, maxStep)
        fish.y += clamp(dy, -maxStep, maxStep)
    }
    fish.dir = direction
    } else {
      fish.x += speed * (fish.dir > 0 ? 1 : -1)
      if (fish.x > maxX) { fish.x = maxX; fish.dir = -1 }
      if (fish.x < minX) { fish.x = minX; fish.dir = 1 }
      const baseY = h * 0.5
      const yWave = Math.sin(Date.now() * 0.004 + fish.x * 0.04) * 4
      fish.y = clamp(baseY + yWave + (level - 0.3) * 8, fishH / 2, h - fishH / 2)
    }

    fishImg.setAttribute('x', (fish.x - fishW / 2).toFixed(2))
    fishImg.setAttribute('y', (fish.y - fishH / 2).toFixed(2))
    fishImg.setAttribute('width', fishW)
    fishImg.setAttribute('height', fishH)
    if (fish.dir > 0) {
      fishImg.setAttribute('transform', '')
    } else {
      fishImg.setAttribute('transform', `scale(-1,1) translate(${-2 * fish.x},0)`)
    }
    fishGroup.replaceChildren(fishImg)
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    const level = levelFromFreq()
    drawAlgae(level)
    spawnBubbles()
    drawBubbles()
    drawFish(level)
  }
  function start() {
    analyser.fftSize = 512
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
