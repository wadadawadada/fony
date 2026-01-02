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
  const baseMaxBubbles = 80
  let target = null, following = false

  // Multi-frequency analysis for better rhythm response
  let bassLevel = 0, midLevel = 0, trebleLevel = 0

  const fish = { x: 20, y: h * 0.5, dir: 1 }
  const fishW = 41, fishH = 35

  const fishImg = document.createElementNS('http://www.w3.org/2000/svg', 'image')
  fishImg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '/js/equalizers/img/fish.svg')
  fishImg.setAttribute('href', '/js/equalizers/img/fish.svg')

  fishImg.setAttribute('height', fishH)
  fishGroup.appendChild(fishImg)

  function levelFromFreq() {
    analyser.getByteFrequencyData(freq)

    // Split frequency spectrum into 3 bands
    const len = freq.length
    const bassEnd = Math.floor(len * 0.15)      // 0-15% = bass
    const midEnd = Math.floor(len * 0.5)        // 15-50% = mids

    // Calculate average for each band
    let bassSum = 0, midSum = 0, trebleSum = 0
    for (let i = 0; i < len; i++) {
      if (i < bassEnd) bassSum += freq[i]
      else if (i < midEnd) midSum += freq[i]
      else trebleSum += freq[i]
    }

    bassLevel = (bassSum / (bassEnd * 255)) * 1.2
    midLevel = (midSum / ((midEnd - bassEnd) * 255)) * 1.0
    trebleLevel = (trebleSum / ((len - midEnd) * 255)) * 1.0

    // Overall level
    let s = bassSum + midSum + trebleSum
    const avg = s / Math.max(1, len)
    return Math.min(1, avg / 255)
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
    const centerX = w * 0.5
    const edgeWidth = w * 0.25

    // BASS BUBBLES - Large, on edges (sides), slower
    if (bassLevel > 0.25) {
      const bassCount = Math.floor(bassLevel * 5)
      for (let i = 0; i < bassCount; i++) {
        // Spawn on left or right edge
        const onRight = Math.random() > 0.5
        const x = onRight
          ? w - edgeWidth + Math.random() * edgeWidth * 0.8
          : edgeWidth * 0.2 + Math.random() * edgeWidth * 0.8

        const r = 3 + bassLevel * 10
        const speed = 0.06 + bassLevel * 0.12
        const grow = 0.4 + bassLevel * 1.2

        bubbles.push({
          x, y: h - 1, r, baseR: r, vy: speed, grow,
          type: 'bass', value: bassLevel, wobble: Math.random() * Math.PI * 2
        })
      }
    }

    // TREBLE BUBBLES - Small, in center, fast
    if (trebleLevel > 0.3) {
      const trebleCount = Math.floor(trebleLevel * 8)
      for (let i = 0; i < trebleCount; i++) {
        const x = centerX + (Math.random() - 0.5) * w * 0.15
        const y = h * 0.3 + Math.random() * h * 0.35

        const r = 0.7 + trebleLevel * 2.5
        const speed = 0.4 + trebleLevel * 0.6
        const grow = 0.8 + trebleLevel * 1.5

        bubbles.push({
          x, y, r, baseR: r, vy: speed, grow,
          type: 'treble', value: trebleLevel, wobble: Math.random() * Math.PI * 2
        })
      }
    }

    // MID BUBBLES - Medium, between center and edges
    if (midLevel > 0.3) {
      const midCount = Math.floor(midLevel * 4)
      for (let i = 0; i < midCount; i++) {
        const x = (Math.random() > 0.5 ? centerX + w * 0.15 : centerX - w * 0.15) + (Math.random() - 0.5) * w * 0.1
        const y = h * 0.2 + Math.random() * h * 0.4

        const r = 1.2 + midLevel * 5
        const speed = 0.15 + midLevel * 0.35
        const grow = 0.9 + midLevel * 1.8

        bubbles.push({
          x, y, r, baseR: r, vy: speed, grow,
          type: 'mid', value: midLevel, wobble: Math.random() * Math.PI * 2
        })
      }
    }

    // Limit total bubbles
    if (bubbles.length > baseMaxBubbles * 1.5) {
      bubbles = bubbles.slice(-Math.floor(baseMaxBubbles * 1.5))
    }
  }
  function drawBubbles() {
    const now = Date.now() * 0.001
    bubbles = bubbles.filter(b => b.y + b.r > 0)
    bubbles.forEach(b => {
      b.y -= b.vy

      // Different wobble per bubble type
      let wobbleAmount, wobbleFreq
      if (b.type === 'bass') {
        wobbleAmount = 0.05  // Minimal wobble
        wobbleFreq = 0.02
      } else if (b.type === 'treble') {
        wobbleAmount = 0.4   // Lots of movement
        wobbleFreq = 0.15
      } else {
        wobbleAmount = 0.15  // Medium wobble
        wobbleFreq = 0.08
      }

      b.x += Math.sin((b.y + b.r) * wobbleFreq + now * 2.5 + b.wobble) * wobbleAmount

      const norm = 1 - (b.y / h)
      b.r = b.baseR * (1 + norm * b.grow)

      // Subtle size variation for realism
      if (b.y < h * 0.1 && Math.random() < 0.01) {
        b.r *= 0.98
      }
    })

    bubblesGroup.replaceChildren(
      ...bubbles.map(b => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        c.setAttribute('cx', b.x.toFixed(2))
        c.setAttribute('cy', b.y.toFixed(2))
        c.setAttribute('r', b.r.toFixed(2))
        c.setAttribute('fill', 'none')
        c.setAttribute('stroke', '#00F2B8')  // One color for all

        // Smooth fade-out as bubbles rise
        // Start visible, gradually fade near top
        const progress = b.y / h  // 1 at bottom, 0 at top
        const fadeStart = 0.3
        let opacity = 0.85

        if (progress < fadeStart) {
          // Smooth fade from fadeStart to 0
          opacity = 0.85 * (progress / fadeStart)
        }

        c.setAttribute('opacity', Math.max(0.05, opacity).toFixed(2))

        // Stroke width varies by bubble type and value
        let strokeWidth = 0.7
        if (b.type === 'bass') {
          strokeWidth = 0.9 + b.value * 0.3
        } else if (b.type === 'treble') {
          strokeWidth = 0.5 + b.value * 0.15
        } else {
          strokeWidth = 0.65 + b.value * 0.25
        }
        c.setAttribute('stroke-width', strokeWidth.toFixed(2))

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
