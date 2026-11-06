// Mirror equalizer: symmetric left/right about the centre of the strip, growing upwards from a baseline.
// Bass sits in the middle and the spectrum opens towards both edges. Layers (back to front):
//   1. three flowing "aurora" ribbons with different response speeds (slow violet, medium cyan, fast mint)
//   2. beat flash: bright centre line + expanding rings
//   3. LED-segment bars with floating peak caps
//   4. sparks thrown up and outwards from the tips of bars that jump
export default function Mirror({ container, analyser }) {
  const H = 72
  const FLIP = false           // true: bars hang down from the top edge; false: grow up from the bottom
  const K = 30                 // bars on each side of the centre bar
  const N = K * 2 + 1
  const BASE = H - 5           // baseline everything grows from
  const MAXH = BASE - 4        // tallest possible bar
  const SEG_H = 3
  const SEG_GAP = 1.7
  const SEGS = Math.floor((MAXH - SEG_H) / (SEG_H + SEG_GAP))
  const MAX_SPARKS = 60

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

  let raf = null
  let freq = new Uint8Array(analyser.frequencyBinCount || 256)
  const fast = new Float32Array(K + 1)      // snappy: drives the bars
  const mid = new Float32Array(K + 1)       // medium ribbon
  const slow = new Float32Array(K + 1)      // slow, wide ribbon
  const prev = new Float32Array(K + 1)
  const peaks = new Float32Array(K + 1)
  const gainPeak = new Float32Array(K + 1).fill(0.3)
  let bass = 0
  let bassAvg = 0.1
  let lastBeat = 0
  let flash = 0
  let rings = []
  let sparks = []
  let level = 0

  function range(k) {
    // log-ish spread over the lower ~75% of the spectrum, so the highs do not crowd the edges
    const usable = Math.floor(freq.length * 0.75)
    const a = Math.floor(Math.pow(k / (K + 1), 1.7) * usable)
    const b = Math.max(a + 1, Math.floor(Math.pow((k + 1) / (K + 1), 1.7) * usable))
    return [a, b]
  }

  function readAudio(now) {
    if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(freq)
    let sum = 0
    for (let k = 0; k <= K; k++) {
      const [a, b] = range(k)
      let m = 0
      for (let j = a; j < b; j++) if (freq[j] > m) m = freq[j]
      const lin = m / 255
      gainPeak[k] = Math.max(lin, gainPeak[k] * 0.997)
      const tilt = 1 - 0.35 * (k / K) // let the centre dominate a little
      const raw = Math.pow(Math.min(1, lin / Math.max(gainPeak[k], 0.3)), 1.25) * tilt
      prev[k] = fast[k]
      fast[k] += (raw - fast[k]) * (raw > fast[k] ? 0.55 : 0.16)
      mid[k] += (raw - mid[k]) * (raw > mid[k] ? 0.22 : 0.07)
      slow[k] += (raw - slow[k]) * (raw > slow[k] ? 0.08 : 0.03)
      peaks[k] = Math.max(fast[k], peaks[k] - 0.011)
      sum += fast[k]
    }
    level = sum / (K + 1)
    bass = (fast[0] + fast[1] + fast[2] + fast[3]) / 4
    bassAvg += (bass - bassAvg) * 0.04
    flash *= 0.9
    if (bass > bassAvg * 1.35 + 0.08 && now - lastBeat > 240) {
      lastBeat = now
      flash = 1
      rings.push({ r: 0, a: 0.9 })
      if (rings.length > 4) rings.shift()
    }
  }

  // centre: bright mint, edges: cool blue
  function colorAt(t, a, lift = 0) {
    const r = Math.round(1 + t * 40 + lift * 200)
    const g = Math.round(255 - t * 85 + lift * 0)
    const b = Math.round(192 + t * 63 + lift * 40)
    return `rgba(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)}, ${a})`
  }

  function barX(i) {
    return W / 2 + (i / (K + 0.5)) * (W / 2 - 4)
  }

  function ribbon(arr, scale, rgb, fillA, lineA, wobble, now) {
    const top = []
    for (let i = -K; i <= K; i++) {
      const k = Math.abs(i)
      const w = Math.sin(now * 0.002 * wobble + i * 0.35) * 1.4 * arr[k]
      top.push([barX(i), BASE - (2 + arr[k] * MAXH * scale + w)])
    }
    const curve = () => {
      ctx.moveTo(top[0][0], top[0][1])
      for (let i = 0; i < top.length - 1; i++) {
        const p1 = top[i]
        const p2 = top[i + 1]
        const mx = (p1[0] + p2[0]) / 2
        ctx.bezierCurveTo(mx, p1[1], mx, p2[1], p2[0], p2[1])
      }
    }
    ctx.beginPath()
    curve()
    ctx.lineTo(top[top.length - 1][0], BASE)
    ctx.lineTo(top[0][0], BASE)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, BASE - MAXH, 0, BASE)
    g.addColorStop(0, `rgba(${rgb}, ${fillA * 0.3})`)
    g.addColorStop(1, `rgba(${rgb}, ${fillA * 0.7})`)
    ctx.fillStyle = g
    ctx.fill()
    ctx.save()
    ctx.strokeStyle = `rgba(${rgb}, ${lineA})`
    ctx.lineWidth = 1.3
    ctx.shadowColor = `rgba(${rgb}, 0.9)`
    ctx.shadowBlur = 9
    ctx.beginPath()
    curve()
    ctx.stroke()
    ctx.restore()
  }

  function drawFlash(dt) {
    // bright centre line that breathes with the beat
    if (flash > 0.02) {
      const g = ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0, colorAt(1, 0))
      g.addColorStop(0.5, colorAt(0, flash * 0.9))
      g.addColorStop(1, colorAt(1, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, BASE + 1.2, W, 1.4)
    }
    // glow
    const rad = Math.min(W * 0.22, 150)
    const gr = ctx.createRadialGradient(W / 2, BASE, 0, W / 2, BASE, rad)
    gr.addColorStop(0, colorAt(0, 0.08 + bass * 0.4 + flash * 0.25))
    gr.addColorStop(1, colorAt(0, 0))
    ctx.save()
    ctx.translate(W / 2, BASE)
    ctx.scale(1, 0.3)
    ctx.translate(-W / 2, -BASE)
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(W / 2, BASE, rad, Math.PI, 2 * Math.PI)
    ctx.fill()
    ctx.restore()
    // rings flying out in both directions
    rings = rings.filter(r => r.a > 0.02)
    rings.forEach(r => {
      r.r += dt * 0.22
      r.a *= Math.pow(0.96, dt / 16)
      ctx.strokeStyle = colorAt(Math.min(1, r.r / (W / 2)), r.a * 0.85)
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.ellipse(W / 2, BASE, r.r, Math.min(MAXH, 6 + r.r * 0.16), 0, Math.PI, 2 * Math.PI)
      ctx.stroke()
    })
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  function drawBars() {
    const slot = (W - 8) / (N - 1)
    const bw = Math.max(2, Math.min(7, slot * 0.62))
    const pitch = SEG_H + SEG_GAP
    for (let i = -K; i <= K; i++) {
      const k = Math.abs(i)
      const t = k / K
      const x = barX(i) - bw / 2
      const lit = Math.round(fast[k] * SEGS)
      const peakSeg = Math.round(peaks[k] * SEGS)
      for (let s = 0; s < SEGS; s++) {
        const y = BASE - SEG_H - s * pitch
        const on = s < lit || s === 0
        const isPeak = s === peakSeg - 1 && peakSeg > lit
        if (!on && !isPeak) continue // no dim "off" segments behind the lit ones
        const hot = s / SEGS // upper segments burn hotter
        const a = isPeak && !on ? 0.9 : 0.55 + 0.45 * hot + flash * 0.2
        ctx.fillStyle = colorAt(t, Math.min(1, a), hot * 0.35 + (isPeak ? 0.3 : 0))
        roundRect(x, y, bw, SEG_H, 1)
        ctx.fill()
      }
    }
  }

  function spawnSparks() {
    for (let k = 0; k <= K; k++) {
      const jump = fast[k] - prev[k]
      if (jump > 0.1 && fast[k] > 0.45 && Math.random() < 0.7 && sparks.length < MAX_SPARKS) {
        const h = SEG_H + fast[k] * (MAXH - SEG_H)
        const sides = k === 0 ? [0] : [-1, 1]
        sides.forEach(sx => {
          const life = 0.7 + Math.random() * 0.5
          sparks.push({
            x: barX(sx * k),
            y: BASE - h,
            vx: sx * (0.12 + Math.random() * 0.35),
            vy: -(0.5 + fast[k] * 0.9 + Math.random() * 0.4),
            life,
            max: life,
            t: k / K
          })
        })
      }
    }
  }

  function drawSparks(dt) {
    const k = dt / 16
    sparks = sparks.filter(s => s.life > 0)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    sparks.forEach(s => {
      s.x += s.vx * k
      s.y += s.vy * k
      s.vy *= Math.pow(0.975, k)
      s.vx *= Math.pow(0.985, k)
      s.life -= (dt / 1000) * 1.1
      const a = Math.max(0, s.life / s.max)
      ctx.fillStyle = colorAt(s.t, a * 0.95, 0.3)
      ctx.beginPath()
      ctx.arc(s.x, s.y, 0.7 + a * 1.1, 0, 6.283)
      ctx.fill()
    })
    ctx.restore()
  }

  let lastT = 0
  function loop(now) {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(48, lastT ? now - lastT : 16)
    lastT = now
    resize()
    readAudio(now)
    spawnSparks()

    ctx.clearRect(0, 0, W, H)
    ctx.save()
    if (FLIP) {
      ctx.translate(0, H)
      ctx.scale(1, -1)
    }
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ribbon(slow, 1.0, '150, 110, 255', 0.2, 0.55, 0.6, now)
    ribbon(mid, 0.85, '0, 190, 255', 0.18, 0.65, 1.0, now)
    ribbon(fast, 0.7, '1, 255, 192', 0.16, 0.8, 1.6, now)
    ctx.restore()
    drawFlash(dt)
    drawBars()
    drawSparks(dt)
    // fade everything out towards the baseline: fully transparent at the bottom
    ctx.globalCompositeOperation = 'destination-in'
    const fade = ctx.createLinearGradient(0, BASE + 4, 0, BASE - MAXH * 0.7)
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
    fade.addColorStop(1, 'rgba(0, 0, 0, 1)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  function start() {
    analyser.fftSize = 512
    resize()
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
