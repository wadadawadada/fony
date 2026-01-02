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
    const emitters = 16

    // Spawn bubbles from 16 frequency bands (distributed along bottom)
    const bandSize = Math.floor(freq.length / emitters)
    for (let i = 0; i < emitters; i++) {
      let max = 0
      for (let j = i * bandSize; j < (i + 1) * bandSize; j++) {
        if (freq[j] > max) max = freq[j]
      }
      let value = max / 255

      // Position along the bottom
      const px = (i + 0.5) / emitters
      const x = px * (w - 16) + 8 + (Math.random() - 0.5) * 12 // Add slight randomness

      // More dramatic response to music
      const emitChance = value * 0.5 + 0.02
      const speed = 0.15 + value * 0.6
      const grow = 0.8 + value * 3.2
      const r = 1.5 + 8 * Math.pow(value, 1.1)

      if (Math.random() < emitChance) {
        bubbles.push({
          x, y: h - 2, r, baseR: r, vy: speed, grow, em: i, value,
          hue: 180 + value * 60, // Cyan to blue-green range
          wobble: Math.random() * Math.PI * 2
        })
      }
    }

    // BASS BUBBLES - Large, from bottom, slower (kick/bass response)
    if (bassLevel > 0.3) {
      const bassCount = Math.floor(bassLevel * 4)
      for (let i = 0; i < bassCount; i++) {
        const x = Math.random() * w
        const r = 2 + bassLevel * 8
        const speed = 0.08 + bassLevel * 0.15
        bubbles.push({
          x, y: h - 1, r, baseR: r, vy: speed, grow: 0.5 + bassLevel * 1.5,
          em: -1, value: bassLevel, hue: 200 + bassLevel * 30,
          wobble: Math.random() * Math.PI * 2
        })
      }
    }

    // TREBLE BUBBLES - Small, from middle area, faster (hi-hats/treble response)
    if (trebleLevel > 0.35) {
      const trebleCount = Math.floor(trebleLevel * 6)
      for (let i = 0; i < trebleCount; i++) {
        const x = Math.random() * w
        const y = h * 0.4 + Math.random() * h * 0.3
        const r = 0.8 + trebleLevel * 3
        const speed = 0.35 + trebleLevel * 0.5
        bubbles.push({
          x, y, r, baseR: r, vy: speed, grow: 1.2 + trebleLevel * 1.8,
          em: -2, value: trebleLevel, hue: 160 + trebleLevel * 40,
          wobble: Math.random() * Math.PI * 2
        })
      }
    }

    // MID BUBBLES - Medium, scattered around (body response)
    if (midLevel > 0.35) {
      const midCount = Math.floor(midLevel * 3)
      for (let i = 0; i < midCount; i++) {
        const x = Math.random() * w
        const y = h * 0.2 + Math.random() * h * 0.4
        const r = 1.2 + midLevel * 4
        const speed = 0.12 + midLevel * 0.35
        bubbles.push({
          x, y, r, baseR: r, vy: speed, grow: 1.0 + midLevel * 2.0,
          em: -3, value: midLevel, hue: 175 + midLevel * 30,
          wobble: Math.random() * Math.PI * 2
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

      // More dramatic wobble effect - varies by bubble type
      const wobbleAmount = b.em >= 0 ? 0.25 : (b.em === -1 ? 0.08 : 0.35)
      const wobbleFreq = b.em >= 0 ? 0.06 : (b.em === -1 ? 0.04 : 0.12)
      b.x += Math.sin((b.y + b.r) * wobbleFreq + b.em + now * 2) * wobbleAmount

      const norm = 1 - (b.y / h)
      b.r = b.baseR * (1 + norm * b.grow)

      // Subtle popping/shrinking near top
      if (b.y < h * 0.15 && Math.random() < 0.02) {
        b.r *= 0.96
      }
    })

    bubblesGroup.replaceChildren(
      ...bubbles.map(b => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        c.setAttribute('cx', b.x.toFixed(2))
        c.setAttribute('cy', b.y.toFixed(2))
        c.setAttribute('r', b.r.toFixed(2))
        c.setAttribute('fill', 'none')

        // Color based on frequency range (hue values set during spawn)
        const hue = b.hue || 180
        const sat = 90 + b.value * 10
        const light = 50 + b.value * 15
        const color = `hsl(${hue}, ${sat}%, ${light}%)`
        c.setAttribute('stroke', color)

        // Dynamic stroke width and opacity
        const opacityBase = 0.7 + b.value * 0.25
        const ageRatio = (h - b.y) / h
        const opacity = Math.max(0.3, opacityBase * (1 - ageRatio * 0.5))
        c.setAttribute('opacity', opacity.toFixed(2))

        // Thicker strokes for more visible bubbles
        const strokeWidth = 0.65 + b.value * 0.35
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
