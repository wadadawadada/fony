// Underwater equalizer. Every element is driven by a real part of the spectrum:
//  - seabed profile + seaweed strands: one frequency band each (bass on the left, treble on the right)
//  - bubbles: rise from the strand whose band is loud; the bass beat releases a burst of big ones
//  - fish: tail beat and swimming speed follow the overall level, the bass beat gives it a kick
// Everything is heavily smoothed on purpose: calm, flowing motion rather than flicker.
export default function Fish({ container, analyser }) {
  const H = 72
  const MINT = '1, 255, 192'
  const BANDS = 28
  const WEEDS = 17
  const MAX_BUBBLES = 26

  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = H + 'px'
  container.innerHTML = ''
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  let W = 0
  let dpr = 1
  function resize() {
    const w = container.clientWidth || 120
    const d = Math.min(window.devicePixelRatio || 1, 2)
    if (w === W && d === dpr) return
    W = w
    dpr = d
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // ---------- audio ----------
  let raf = null
  let freq = new Uint8Array(analyser.frequencyBinCount || 256)
  const bands = new Float32Array(BANDS)
  const bandPeak = new Float32Array(BANDS).fill(0.3)
  let level = 0
  let bass = 0
  let treble = 0
  let bassAvg = 0.1
  let lastBeat = 0
  let beatKick = 0

  function bandRange(i) {
    // log-ish split over the lower ~75% of the spectrum so highs do not dominate
    const usable = Math.floor(freq.length * 0.75)
    const a = Math.floor(Math.pow(i / BANDS, 1.7) * usable)
    const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / BANDS, 1.7) * usable))
    return [a, b]
  }

  function readAudio(now) {
    if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(freq)
    let sum = 0
    for (let i = 0; i < BANDS; i++) {
      const [a, b] = bandRange(i)
      let m = 0
      for (let j = a; j < b; j++) if (freq[j] > m) m = freq[j]
      // per-band auto gain: quiet highs still move as much as loud bass
      const lin = m / 255
      bandPeak[i] = Math.max(lin, bandPeak[i] * 0.997)
      const raw = Math.pow(Math.min(1, lin / Math.max(bandPeak[i], 0.28)), 1.35)
      // fast attack, slow release: feels like motion, not flicker
      bands[i] += (raw - bands[i]) * (raw > bands[i] ? 0.18 : 0.05)
      sum += bands[i]
    }
    level = sum / BANDS
    bass = (bands[0] + bands[1] + bands[2] + bands[3]) / 4
    treble = 0
    for (let i = BANDS - 8; i < BANDS; i++) treble += bands[i]
    treble /= 8

    bassAvg += (bass - bassAvg) * 0.04
    beatKick *= 0.95
    if (bass > bassAvg * 1.4 + 0.1 && now - lastBeat > 450) {
      lastBeat = now
      beatKick = 1
      burstBubbles()
    }
  }

  function bandAt(x01) {
    // smooth interpolation of band energy across 0..1
    const f = Math.max(0, Math.min(1, x01)) * (BANDS - 1)
    const i = Math.floor(f)
    const t = f - i
    return bands[i] * (1 - t) + bands[Math.min(BANDS - 1, i + 1)] * t
  }

  // ---------- scene state ----------
  const weeds = Array.from({ length: WEEDS }, (_, i) => ({
    x01: (i + 0.5) / WEEDS,
    phase: Math.random() * 6.28,
    len: 0.85 + Math.random() * 0.4,
    back: i % 2 === 1,
    hue: Math.random()
  }))
  let bubbles = []

  function spawnBubble(x, r, vy, glow = 0, y = H - 6) {
    if (bubbles.length >= MAX_BUBBLES) bubbles.shift()
    bubbles.push({ x, y, r, vy, wob: Math.random() * 6.28, glow, age: 0 })
  }

  function burstBubbles() {
    if (!W) return
    const n = 1 + Math.floor(bass * 2)
    for (let i = 0; i < n; i++) {
      spawnBubble(W * (0.05 + Math.random() * 0.2), 2.2 + bass * 2.5, 0.3 + bass * 0.3, 1)
    }
  }

  // ---------- fish ----------
  const fish = { x: 40, y: H * 0.45, dir: 1, phase: 0, vx: 0 }
  let target = null
  let following = false

  function drawFish(f, scale, alpha, tailSpeed, now) {
    const s = scale
    const swing = Math.sin(f.phase) * (0.28 + tailSpeed * 0.12)
    ctx.save()
    ctx.translate(f.x, f.y)
    ctx.scale(f.dir * s, s)
    ctx.fillStyle = `rgba(${MINT}, ${alpha})`

    // tail (pivots at the body)
    ctx.save()
    ctx.translate(-11, 0)
    ctx.rotate(swing)
    ctx.beginPath()
    ctx.moveTo(2, 0)
    ctx.quadraticCurveTo(-8, -3, -15, -10)
    ctx.quadraticCurveTo(-11, 0, -15, 10)
    ctx.quadraticCurveTo(-8, 3, 2, 0)
    ctx.fill()
    ctx.restore()

    // dorsal + belly fins
    const fin = Math.sin(f.phase + 0.8) * 1.5
    ctx.beginPath()
    ctx.moveTo(-2, -8)
    ctx.quadraticCurveTo(2, -15 + fin, 8, -8)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-1, 8)
    ctx.quadraticCurveTo(3, 13 - fin, 7, 8)
    ctx.closePath()
    ctx.fill()

    // body
    ctx.beginPath()
    ctx.moveTo(-12, 0)
    ctx.bezierCurveTo(-8, -10, 8, -11, 17, -1)
    ctx.bezierCurveTo(19, 1, 19, 2, 17, 3)
    ctx.bezierCurveTo(8, 11, -8, 10, -12, 0)
    ctx.fill()

    // gill arc + eye
    ctx.strokeStyle = 'rgba(23, 28, 43, 0.55)'
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.arc(5, 0, 6, -1.0, 1.0)
    ctx.stroke()
    ctx.fillStyle = '#171C2B'
    ctx.beginPath()
    ctx.arc(11.5, -2, 1.9, 0, 6.283)
    ctx.fill()
    ctx.restore()
  }

  function moveFish(dt, now) {
    const minX = 22
    const maxX = W - 22
    const energy = 0.5 + level * 0.8 + beatKick * 0.5
    const cruise = energy * 0.045 * dt // px per frame-ish

    if (following && target) {
      const dir = target.x > fish.x ? 1 : -1
      const dx = Math.max(minX, Math.min(maxX, target.x - dir * 24)) - fish.x
      const dy = Math.max(16, Math.min(H - 16, target.y)) - fish.y
      const step = cruise * 1.8
      fish.x += Math.max(-step, Math.min(step, dx))
      fish.y += Math.max(-step, Math.min(step, dy))
      fish.dir = Math.abs(dx) > 3 ? dir : fish.dir
    } else {
      fish.x += cruise * fish.dir
      if (fish.x > maxX) { fish.x = maxX; fish.dir = -1 }
      if (fish.x < minX) { fish.x = minX; fish.dir = 1 }
      const mid = bandAt(0.5)
      const baseY = Math.min(H * 0.38, waveY(fish.x / W) - 17)
      const wave = Math.sin(now * 0.0018 + fish.x * 0.03) * (5 + level * 4)
      const ty = Math.max(14, Math.min(H - 24, baseY + wave))
      fish.y += (ty - fish.y) * 0.06
    }
    fish.phase += (0.07 + level * 0.14 + beatKick * 0.06) * (dt / 16)
  }

  // ---------- drawing ----------
  const WAVE = 32 // how tall the spectrum silhouette can get (px)
  function waveY(x01) {
    return H - 4 - bandAt(x01) * WAVE
  }

  // smooth curve through points (Catmull-Rom converted to beziers)
  function smoothPath(pts, move = true) {
    if (move) ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      ctx.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]
      )
    }
  }

  function drawSeabed(now) {
    const n = 36
    const pts = []
    for (let i = 0; i <= n; i++) {
      const u = i / n
      pts.push([u * W, waveY(u) + Math.sin(now * 0.0015 + u * 9) * 0.8])
    }
    // soft fill under the wave
    ctx.beginPath()
    smoothPath(pts)
    ctx.lineTo(W, H)
    ctx.lineTo(0, H)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, H - WAVE - 6, 0, H)
    g.addColorStop(0, `rgba(${MINT}, 0.34)`)
    g.addColorStop(0.55, `rgba(${MINT}, 0.1)`)
    g.addColorStop(1, `rgba(${MINT}, 0)`)
    ctx.fillStyle = g
    ctx.fill()
    // glowing crest
    ctx.save()
    ctx.beginPath()
    smoothPath(pts)
    ctx.strokeStyle = `rgba(${MINT}, 0.95)`
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    ctx.shadowColor = `rgba(${MINT}, 0.8)`
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.restore()
  }

  function drawWeeds(now) {
    const SEG = 10
    const ordered = weeds.slice().sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0))
    ordered.forEach((w, k) => {
      const v = bandAt(w.x01)
      const x0 = w.x01 * W
      const y0 = waveY(w.x01) + 3
      const len = (w.back ? 40 + v * 18 : 26 + v * 20) * w.len
      const amp = (w.back ? 5 : 3.5) + v * 7
      const t = now * 0.0011
      const left = []
      const right = []
      let tipX = x0
      let tipY = y0
      for (let j = 0; j <= SEG; j++) {
        const u = j / SEG
        const x = x0 + Math.sin(t + w.phase + u * 2.4) * amp * u
        const y = y0 - u * len
        const half = (w.back ? 3 : 3.8) * Math.pow(1 - u, 0.85) + 0.35
        left.push([x - half, y])
        right.push([x + half, y])
        tipX = x
        tipY = y
      }
      const g = ctx.createLinearGradient(0, y0, 0, y0 - len)
      const dim = w.back ? 0.5 : 1
      g.addColorStop(0, `rgba(${MINT}, ${(0.55 + v * 0.3) * dim})`)
      g.addColorStop(1, `rgba(${MINT}, ${0.12 * dim})`)
      ctx.fillStyle = g
      ctx.beginPath()
      smoothPath(left)
      smoothPath(right.slice().reverse(), false)
      ctx.closePath()
      ctx.fill()
      if (Math.random() < v * v * 0.03) {
        spawnBubble(tipX + (Math.random() - 0.5) * 3, 1.6 + v * 1.8, 0.28 + v * 0.25, 0, tipY)
      }
    })
  }

  function drawBubbles(dt) {
    const k = dt / 16
    bubbles = bubbles.filter(b => b.y + b.r > -4)
    bubbles.forEach(b => {
      b.age += k
      b.y -= b.vy * k
      b.x += Math.sin(b.age * 0.07 + b.wob) * 0.22 * k
      b.r *= 1 + 0.0010 * k
      const fade = Math.max(0, Math.min(1, (b.y + 4) / 14))
      const rg = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r)
      rg.addColorStop(0, `rgba(255, 255, 255, ${0.28 * fade})`)
      rg.addColorStop(1, `rgba(${MINT}, ${0.06 * fade})`)
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, 6.283)
      ctx.fill()
      ctx.lineWidth = 0.9
      ctx.strokeStyle = `rgba(${MINT}, ${(0.6 + b.glow * 0.3) * fade})`
      ctx.stroke()
    })
  }

  let lastT = 0
  function loop(now) {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(48, lastT ? now - lastT : 16)
    lastT = now
    resize()
    readAudio(now)
    moveFish(dt, now)

    ctx.clearRect(0, 0, W, H)
    drawSeabed(now)
    drawWeeds(now)
    drawBubbles(dt)
    drawFish(fish, 1.15, 1, level, now)
  }

  // the fish chases the pointer while it hovers the strip
  canvas.addEventListener('mouseenter', () => { following = true })
  canvas.addEventListener('mouseleave', () => { following = false; target = null })
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect()
    target = {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H
    }
  })

  function start() {
    analyser.fftSize = 512
    resize()
    fish.x = Math.min(40, W / 2)
    if (!raf) raf = requestAnimationFrame(loop)
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = null
    lastT = 0
  }
  function destroy() {
    stop()
    container.innerHTML = ''
  }
  return { start, stop, destroy }
}
