// FONY Flappy: a spinning vinyl flies through equalizer columns.
// Space / click / tap / arrow up / W to flap.

let W = 360
const H = 540
const GROUND = 84
const ACCENT = '#00F2B8'
const INK = '#171C2B'

const GRAVITY = 1500
const FLAP = -440
const SPEED = 135
const PIPE_W = 58
const GAP = 158
const SPACING = 200
const BIRD_X = 100
const BIRD_R = 15
const LIVES = 3
const BOUNCE = 0.75 // restitution when the vinyl hits a column
const SEG = 14
const SEG_GAP = 4

const KEY = 'fonyGame:flappy:best'

function loadBest() {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch (e) { return 0 }
}
function saveBest(v) {
  try { localStorage.setItem(KEY, String(v)) } catch (e) { /* storage unavailable */ }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function mount(container) {
  const canvas = document.createElement('canvas')
  canvas.tabIndex = 0
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const ctx = canvas.getContext('2d')
  // The world is always H tall; its width follows the modal's aspect ratio,
  // so the game fills whatever space the modal gives it.
  const fit = () => {
    const r = container.getBoundingClientRect()
    if (r.width < 10 || r.height < 10) return
    const aspect = Math.max(0.6, Math.min(2.4, r.width / r.height))
    const cssH = Math.floor(Math.min(r.height, r.width / aspect))
    const cssW = Math.floor(cssH * aspect)
    W = Math.round(H * aspect)
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    const pw = Math.round(cssW * dpr)
    const ph = Math.round(cssH * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0)
  }
  container.appendChild(canvas)
  fit()
  canvas.focus()
  const ro = new ResizeObserver(fit)
  ro.observe(container)

  let state = 'ready' // ready | play | dead
  let groundX = 0
  let best = loadBest()
  let score = 0
  let bird, pipes, spin, t, deadAt, flash, particles, newBest, lives, invuln

  function reset() {
    bird = { x: BIRD_X, y: H / 2 - 20, vx: 0, vy: 0 }
    lives = LIVES
    invuln = 0
    pipes = []
    spin = 0
    score = 0
    flash = 0
    particles = []
    newBest = false
    spawnX = W + 60
  }
  let spawnX = W + 60
  let binCounter = 0
  reset()
  t = 0

  function spawn() {
    const min = 70
    const max = H - GROUND - GAP - 70
    pipes.push({ x: spawnX, gapY: min + Math.random() * (max - min), passed: false, bin: (binCounter++ * 7) % 40, pkT: 0, pkB: 0 })
    spawnX += SPACING
  }

  function flap() {
    if (state === 'ready') { state = 'play' }
    if (state === 'play') {
      bird.vy = FLAP
      for (let i = 0; i < 5; i++) {
        particles.push({
          x: bird.x - 8, y: bird.y + 6, vx: -40 - Math.random() * 60, vy: 30 + Math.random() * 60,
          life: 0.45, max: 0.45
        })
      }
    } else if (state === 'dead' && performance.now() - deadAt > 450) {
      reset()
      state = 'ready'
    }
  }

  function die() {
    if (state !== 'play') return
    state = 'dead'
    deadAt = performance.now()
    flash = 1
    if (score > best) { best = score; newBest = true; saveBest(best) }
  }

  // circle (the vinyl) vs a column; pushes the vinyl out and reflects its velocity
  // relative to the scrolling column, so it ricochets off like a ball
  function bounceRect(rx, ry, rw, rh) {
    const cx = Math.max(rx, Math.min(bird.x, rx + rw))
    const cy = Math.max(ry, Math.min(bird.y, ry + rh))
    let dx = bird.x - cx
    let dy = bird.y - cy
    const d2 = dx * dx + dy * dy
    if (d2 >= BIRD_R * BIRD_R) return false
    let nx, ny, pen
    if (d2 === 0) { nx = -1; ny = 0; pen = BIRD_R } else {
      const d = Math.sqrt(d2)
      nx = dx / d; ny = dy / d; pen = BIRD_R - d
    }
    bird.x += nx * pen
    bird.y += ny * pen
    let rvx = bird.vx + SPEED // velocity relative to the column (it moves at -SPEED)
    let rvy = bird.vy
    const vn = rvx * nx + rvy * ny
    if (vn < 0) {
      rvx -= (1 + BOUNCE) * vn * nx
      rvy -= (1 + BOUNCE) * vn * ny
      bird.vx = rvx - SPEED
      bird.vy = rvy
    }
    return true
  }

  // a hit costs a life (with a short grace period); the last life ends the run
  function hit() {
    if (state !== 'play' || invuln > 0) return
    lives--
    invuln = 1.1
    flash = 0.6
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 60 + Math.random() * 140
      particles.push({ x: bird.x, y: bird.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5 })
    }
    if (lives <= 0) die()
  }

  function update(dt) {
    t += dt
    spin += dt * (state === 'dead' ? 0 : 6)
    if (state !== 'dead') groundX += SPEED * dt * (state === 'play' ? 1 : 0.3)
    if (flash > 0) flash = Math.max(0, flash - dt * 3)
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt }
    particles = particles.filter((p) => p.life > 0)

    if (state === 'ready') {
      bird.y = H / 2 - 20 + Math.sin(t * 3.2) * 8
      return
    }

    if (invuln > 0) invuln = Math.max(0, invuln - dt)

    // physics (also runs after the last life so the vinyl drops to the ground)
    const floor = H - GROUND - BIRD_R
    if (state === 'dead' && bird.y >= floor) {
      bird.vx *= 0.9
    } else {
      bird.vy += GRAVITY * dt
      bird.y += bird.vy * dt
    }
    if (state === 'play') {
      // drift back to the home column after being knocked sideways
      bird.vx += (BIRD_X - bird.x) * 7 * dt
      bird.vx *= Math.max(0, 1 - 1.8 * dt)
    }
    bird.x = Math.max(BIRD_R, Math.min(W - BIRD_R, bird.x + bird.vx * dt))

    if (bird.y > floor) {
      bird.y = floor
      if (state === 'play') {
        bird.vy = -Math.max(Math.abs(bird.vy) * 0.6, 300)
        hit()
      } else {
        bird.vy = 0
      }
    }
    if (bird.y < BIRD_R) { bird.y = BIRD_R; if (bird.vy < 0) bird.vy = Math.abs(bird.vy) * 0.4 }

    if (state !== 'play') return

    for (const p of pipes) p.x -= SPEED * dt
    spawnX -= SPEED * dt
    while (spawnX < W + 60) spawn()
    pipes = pipes.filter((p) => p.x + PIPE_W > -10)

    for (const p of pipes) {
      if (!p.passed && p.x + PIPE_W < bird.x - BIRD_R) { p.passed = true; score++ }
      if (p.x > bird.x + BIRD_R + 40 || p.x + PIPE_W < bird.x - BIRD_R - 40) continue
      const hitTop = bounceRect(p.x, -400, PIPE_W, p.gapY + 400)
      const hitBot = bounceRect(p.x, p.gapY + GAP, PIPE_W, H)
      if (hitTop || hitBot) hit()
    }
  }

  // ---------- music reactivity ----------
  // The player's shared analyser (js/equalizer.js) feeds the columns and the ground bars.
  const BINS = 48
  const spec = new Float32Array(BINS)
  let freq = null
  let peak = 0.3
  function sampleSpectrum(dt) {
    const an = window.equalizerAnalyser
    let live = false
    if (an) {
      if (!freq || freq.length !== an.frequencyBinCount) {
        freq = new Uint8Array(an.frequencyBinCount)
      }
      an.getByteFrequencyData(freq)
      let mx = 0
      for (let i = 0; i < BINS; i++) mx = Math.max(mx, (freq[i % freq.length] || 0) / 255)
      if (mx > 0.03) live = true
      // auto gain: keep the loudest bin near full scale whatever the volume / track
      peak = Math.max(0.25, Math.max(mx, peak - dt * 0.15))
      for (let i = 0; i < BINS; i++) {
        let v = ((freq[i % freq.length] || 0) / 255) / peak
        v = Math.pow(Math.min(1, v), 1.7) // more contrast: quiet bins stay dark
        // fast attack, quick release
        spec[i] = v > spec[i] ? v : spec[i] - (spec[i] - v) * Math.min(1, dt * 14)
      }
    }
    if (!live) {
      // nothing playing: a calm idle wave so the columns still breathe
      for (let i = 0; i < BINS; i++) spec[i] = 0.2 + 0.25 * Math.max(0, Math.sin(i * 0.9 + t * 2.2))
    }
  }
  const level = (i) => spec[((i % BINS) + BINS) % BINS]

  // ---------- drawing ----------
  // smoothed bass energy, drives the sky glow, the moon and the floor
  let bass = 0
  function updateBass(dt) {
    let b = 0
    for (let i = 0; i < 5; i++) b += level(i)
    b /= 5
    bass = b > bass ? b : bass - (bass - b) * Math.min(1, dt * 6)
  }

  // low bins are teal, high bins slide through cyan and violet to pink
  const hueOf = (bin) => 165 + ((((bin % BINS) + BINS) % BINS) / 40) * 150

  function drawBackground() {
    const gy = H - GROUND

    // dusk sky
    const g = ctx.createLinearGradient(0, 0, 0, gy)
    g.addColorStop(0, '#0a0e1d')
    g.addColorStop(0.55, '#141b37')
    g.addColorStop(1, '#241f4d')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, gy)

    // twinkling stars
    for (let i = 0; i < 38; i++) {
      const x = ((i * 89 - groundX * (0.03 + (i % 4) * 0.012)) % (W + 10) + (W + 10)) % (W + 10)
      const y = 14 + ((i * 47) % (gy - 140))
      const a = 0.25 + 0.35 * Math.abs(Math.sin(t * (0.8 + (i % 5) * 0.3) + i))
      ctx.fillStyle = `rgba(210,255,245,${a})`
      ctx.fillRect(x, y, 1.6 + (i % 3) * 0.5, 1.6 + (i % 3) * 0.5)
    }

    // a synthwave sun sinking behind the hills, pulsing with the bass
    const mx = W * 0.72
    const sr = 78 + bass * 7
    const my = gy - 52
    const halo = ctx.createRadialGradient(mx, my, sr * 0.7, mx, my, sr * 2.3)
    halo.addColorStop(0, `rgba(180,107,255,${0.20 + bass * 0.22})`)
    halo.addColorStop(1, 'rgba(180,107,255,0)')
    ctx.fillStyle = halo
    ctx.fillRect(mx - sr * 2.4, my - sr * 2.4, sr * 4.8, sr * 4.8)
    ctx.save()
    // clip = sky area minus horizontal slits (even-odd), thicker toward the bottom and creeping down
    ctx.beginPath()
    ctx.rect(0, 0, W, gy)
    const creep = (t * 6) % 14
    for (let k = 0; k < 9; k++) {
      const yy = my + k * 14 + creep
      if (yy <= my + 2 || yy >= my + sr) continue
      ctx.rect(mx - sr - 2, yy, sr * 2 + 4, 1.5 + ((yy - my) / sr) * 7)
    }
    ctx.clip('evenodd')
    const sg = ctx.createLinearGradient(0, my - sr, 0, my + sr)
    sg.addColorStop(0, '#5dffdc')
    sg.addColorStop(0.5, '#6fb4ff')
    sg.addColorStop(1, '#c36bff')
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(mx, my, sr, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // two layers of sound-wave hills that swell with the bass
    const hills = (speed, base, amp, color) => {
      ctx.beginPath()
      ctx.moveTo(0, gy)
      for (let x = 0; x <= W; x += 6) {
        const u = x + groundX * speed
        const hgt = base + amp * (0.55 + bass * 0.9) * (Math.sin(u * 0.021) * 0.5 + Math.sin(u * 0.047 + 1.7) * 0.32 + Math.sin(u * 0.009 + 4) * 0.4 + 0.9)
        ctx.lineTo(x, gy - hgt)
      }
      ctx.lineTo(W, gy)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
    }
    hills(0.18, 18, 30, 'rgba(34,30,84,0.85)')
    hills(0.4, 6, 22, 'rgba(16,18,44,0.95)')

    // glow along the horizon
    const hg = ctx.createLinearGradient(0, gy - 90, 0, gy)
    hg.addColorStop(0, 'rgba(0,242,184,0)')
    hg.addColorStop(1, `rgba(0,242,184,${0.10 + bass * 0.22})`)
    ctx.fillStyle = hg
    ctx.fillRect(0, gy - 90, W, 90)
  }

  function drawColumn(x, y, h, capAtBottom, lv, pk, hue) {
    // A real spectrum bar in a glass housing: lit segments grow from the screen edge
    // toward the gap with the level of this column's frequency; a peak marker falls slowly.
    if (h <= 0) return
    const n = Math.ceil(h / (SEG + SEG_GAP))
    const litN = Math.round(lv * n)
    const pkN = Math.min(n - 1, Math.round(pk * n))
    const inner = 5

    // housing
    const hy = y - (capAtBottom ? 12 : 0)
    const hh = h + 12
    ctx.fillStyle = 'rgba(8,11,24,0.72)'
    roundRect(ctx, x, hy, PIPE_W, hh, 8)
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `hsla(${hue},100%,60%,${0.22 + lv * 0.5})`
    ctx.stroke()

    for (let i = 0; i < n; i++) {
      const fromEdge = n - 1 - i // 0 at the screen edge (ceiling / ground), n-1 at the gap
      const sy = capAtBottom ? y + h - (i + 1) * (SEG + SEG_GAP) + SEG_GAP : y + i * (SEG + SEG_GAP)
      const clipTop = Math.max(sy, y)
      const clipBot = Math.min(sy + SEG, y + h)
      if (clipBot <= clipTop) continue
      const sx = x + inner
      const sw = PIPE_W - inner * 2
      const sh = clipBot - clipTop
      const lit = fromEdge < litN
      const isTip = fromEdge === litN - 1
      const isPeak = fromEdge === pkN && pkN >= litN
      if (lit) {
        const k = fromEdge / n
        const hh2 = hue + k * 38 // hue drifts along the bar
        const lg = ctx.createLinearGradient(0, clipTop, 0, clipBot)
        lg.addColorStop(0, `hsl(${hh2},100%,${70 + 8 * k}%)`)
        lg.addColorStop(1, `hsl(${hh2},95%,${46 + 10 * k}%)`)
        ctx.fillStyle = lg
        ctx.shadowColor = `hsl(${hh2},100%,60%)`
        ctx.shadowBlur = isTip ? 18 : 4
      } else if (isPeak) {
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = `hsl(${hue},100%,70%)`
        ctx.shadowBlur = 12
      } else {
        ctx.fillStyle = `hsla(${hue},80%,60%,0.07)`
      }
      roundRect(ctx, sx, clipTop, sw, sh, 4)
      ctx.fill()
      ctx.shadowBlur = 0
      if (lit && sh > 6) { // glassy highlight on the segment
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        roundRect(ctx, sx + 3, clipTop + 1.5, sw - 6, 2.2, 1)
        ctx.fill()
      }
    }

    // end plate at the gap side
    const py = capAtBottom ? y + h - 12 : y
    const pg = ctx.createLinearGradient(0, py, 0, py + 12)
    pg.addColorStop(0, '#3b4262')
    pg.addColorStop(1, '#1a1f36')
    ctx.fillStyle = pg
    roundRect(ctx, x - 3, py, PIPE_W + 6, 12, 5)
    ctx.fill()
    ctx.fillStyle = `hsla(${hue},100%,65%,${0.5 + lv * 0.5})`
    ctx.fillRect(x + 4, capAtBottom ? py + 9 : py + 2, PIPE_W - 8, 1.5)
  }

  function drawGround() {
    const gy = H - GROUND
    const g = ctx.createLinearGradient(0, gy, 0, H)
    g.addColorStop(0, '#231c4d')
    g.addColorStop(0.45, '#12142c')
    g.addColorStop(1, '#090b16')
    ctx.fillStyle = g
    ctx.fillRect(0, gy, W, GROUND)

    // perspective grid rushing past: the nearer the floor, the faster it moves
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, gy, W, GROUND)
    ctx.clip()
    ctx.lineWidth = 1.2
    const cx = W / 2
    const step = 46
    const off = groundX % step
    for (let xt = -step * 2 - off; xt < W + step * 2; xt += step) {
      const xb = cx + (xt - cx) * 2.6
      const a = 0.1 + bass * 0.22
      ctx.strokeStyle = `hsla(${hueOf(Math.round(xt / 8))},100%,65%,${a})`
      ctx.beginPath()
      ctx.moveTo(xt, gy)
      ctx.lineTo(xb, H)
      ctx.stroke()
    }
    const rows = [0.1, 0.24, 0.44, 0.7, 1]
    for (const r of rows) {
      const yy = gy + r * GROUND
      ctx.strokeStyle = `rgba(0,242,184,${0.08 + r * 0.12})`
      ctx.beginPath()
      ctx.moveTo(0, yy)
      ctx.lineTo(W, yy)
      ctx.stroke()
    }
    ctx.restore()

    // neon horizon line, teal to violet, flaring on the beat
    const lg = ctx.createLinearGradient(0, 0, W, 0)
    lg.addColorStop(0, '#00F2B8')
    lg.addColorStop(0.5, '#4bd6ff')
    lg.addColorStop(1, '#b46bff')
    ctx.fillStyle = lg
    ctx.shadowColor = '#00F2B8'
    ctx.shadowBlur = 10 + bass * 18
    ctx.fillRect(0, gy, W, 2.5)
    ctx.shadowBlur = 0
  }

  function drawVinyl() {
    const tilt = Math.max(-0.5, Math.min(0.9, bird.vy / 700))
    ctx.save()
    ctx.translate(bird.x, bird.y)
    if (invuln > 0 && Math.floor(t * 16) % 2 === 0) ctx.globalAlpha = 0.35
    ctx.shadowColor = ACCENT
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2)
    ctx.fillStyle = '#0b0e17'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 1.5
    ctx.strokeStyle = ACCENT
    ctx.stroke()
    // rotating grooves + label
    ctx.rotate(spin + tilt)
    ctx.strokeStyle = 'rgba(0,242,184,0.28)'
    ctx.lineWidth = 1
    for (const r of [11.5, 9]) { ctx.beginPath(); ctx.arc(0, 0, r, 0.3, 4.6); ctx.stroke() }
    const lg = ctx.createLinearGradient(-6, -6, 6, 6)
    lg.addColorStop(0, '#2dffd0')
    lg.addColorStop(1, '#00b88a')
    ctx.fillStyle = lg
    ctx.beginPath()
    ctx.arc(0, 0, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2)
    ctx.fill()
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(-1, -13, 2, 5)
    ctx.restore()
  }

  function text(str, x, y, size, color, align) {
    ctx.font = `700 ${size}px Ruda, system-ui, sans-serif`
    ctx.textAlign = align || 'center'
    ctx.fillStyle = color || '#fff'
    ctx.fillText(str, x, y)
  }

  function draw() {
    drawBackground()
    for (const p of pipes) {
      drawColumn(p.x, 0, p.gapY, true, level(p.bin), p.pkT, hueOf(p.bin))
      drawColumn(p.x, p.gapY + GAP, H - GROUND - (p.gapY + GAP), false, level(p.bin + 3), p.pkB, hueOf(p.bin + 3))
    }
    drawGround()
    for (const p of particles) {
      ctx.fillStyle = `rgba(0,242,184,${(p.life / p.max) * 0.8})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.5 * (p.life / p.max) + 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    drawVinyl()

    if (state !== 'ready') {
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 6
      text(String(score), W / 2, 76, 52, '#fff')
      ctx.shadowBlur = 0
      // remaining lives as little vinyls
      for (let i = 0; i < LIVES; i++) {
        const lx = W / 2 + (i - (LIVES - 1) / 2) * 20
        ctx.beginPath()
        ctx.arc(lx, 98, 6, 0, Math.PI * 2)
        if (i < lives) { ctx.fillStyle = ACCENT; ctx.fill() } else { ctx.strokeStyle = 'rgba(0,242,184,0.3)'; ctx.lineWidth = 1.5; ctx.stroke() }
      }
    }

    if (state === 'ready') {
      text('FONY FLAPPY', W / 2, 150, 26, ACCENT)
      text('Tap / Space to flap', W / 2, 184, 15, 'rgba(255,255,255,0.75)')
      if (best) text('Best ' + best, W / 2, 210, 14, 'rgba(0,242,184,0.8)')
    }

    if (state === 'dead') {
      ctx.fillStyle = 'rgba(10,13,22,0.62)'
      ctx.fillRect(0, 0, W, H)
      const bw = 260, bh = 190, bx = W / 2 - bw / 2, by = H / 2 - bh / 2 - 20
      ctx.fillStyle = INK
      roundRect(ctx, bx, by, bw, bh, 20)
      ctx.fill()
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 2
      ctx.stroke()
      text('GAME OVER', W / 2, by + 44, 24, ACCENT)
      text('Score', W / 2 - 50, by + 84, 13, 'rgba(255,255,255,0.6)')
      text(String(score), W / 2 - 50, by + 118, 34, '#fff')
      text('Best', W / 2 + 50, by + 84, 13, 'rgba(255,255,255,0.6)')
      text(String(best), W / 2 + 50, by + 118, 34, ACCENT)
      if (newBest) text('New record!', W / 2, by + 144, 13, '#ff6b9a')
      text('Tap / Space to retry', W / 2, by + 172, 14, 'rgba(255,255,255,0.8)')
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  // ---------- loop ----------
  let raf = 0
  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    sampleSpectrum(dt)
    updateBass(dt)
    for (const p of pipes) {
      p.pkT = Math.max(level(p.bin), p.pkT - dt * 0.5)
      p.pkB = Math.max(level(p.bin + 3), p.pkB - dt * 0.5)
    }
    update(dt)
    draw()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  // ---------- input ----------
  const onPointer = (e) => { e.preventDefault(); canvas.focus(); flap() }
  const onKey = (e) => {
    if (e.repeat) return
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault()
      flap()
    }
  }
  canvas.addEventListener('pointerdown', onPointer)
  document.addEventListener('keydown', onKey, true)

  return {
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey, true)
      canvas.remove()
    }
  }
}

const ART = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="fa-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26304f"/><stop offset="1" stop-color="#121726"/></linearGradient>
    <linearGradient id="fa-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00F2B8"/><stop offset="1" stop-color="#00a47c"/></linearGradient>
    <radialGradient id="fa-lab" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#2dffd0"/><stop offset="1" stop-color="#00a47c"/></radialGradient>
  </defs>
  <rect width="120" height="90" fill="url(#fa-bg)"/>
  <g fill="url(#fa-bar)">
    <rect x="12" y="0" width="16" height="30" rx="3"/><rect x="12" y="62" width="16" height="28" rx="3"/>
    <rect x="92" y="0" width="16" height="36" rx="3" opacity=".9"/><rect x="92" y="68" width="16" height="22" rx="3" opacity=".9"/>
  </g>
  <g transform="translate(60 40)">
    <circle r="14" fill="#0b0e17" stroke="#00F2B8" stroke-width="2"/>
    <circle r="10" fill="none" stroke="#00F2B8" stroke-opacity=".35"/>
    <circle r="6" fill="url(#fa-lab)"/><circle r="1.6" fill="#171C2B"/>
  </g>
</svg>`

export default {
  id: 'flappy',
  title: 'FONY Flappy',
  icon: '&#128191;',
  art: ART,
  desc: 'Fly the vinyl through the equalizer',
  mount
}
