// FONY Breaker: an arkanoid with shaped levels, special bricks, power-ups and super weapons.
// Move: mouse / touch / arrows / A D.  Launch: click / Space.  Lasers fire automatically.
import { createSpectrum } from './audio.js'

const H = 540
const COLS = 13
const ACCENT = '#00F2B8'
const INK = '#171C2B'
const KEY = 'fonyGame:breakout:best'

const PAD_H = 12
const PAD_Y = H - 46
const PAD_W = 86
const BALL_R = 6
const BASE_SPEED = 330
const LIVES = 3

// ---------------------------------------------------------------- levels
// Each level is a picture built from cells:
//   b normal   h hard (2 hits)   m metal (indestructible)   x explosive (chain reaction)
//   o round    P power-up carrier   w swaying brick   . empty
function grid(rows, fn) {
  const out = []
  for (let r = 0; r < rows; r++) {
    let s = ''
    for (let c = 0; c < COLS; c++) s += fn(c, r) || '.'
    out.push(s)
  }
  return out
}

const LEVELS = [
  {
    name: 'HEART',
    map: grid(11, (c, r) => {
      const x = (c - 6) / 5.1
      const y = (4.7 - r) / 4.4 + 0.12
      const v = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y
      if (v > 0) return ''
      const edge = Math.pow((Math.abs(x) + 0.22) * (Math.abs(x) + 0.22) + y * y - 1, 3) - (Math.abs(x) + 0.22) * (Math.abs(x) + 0.22) * y * y * y > 0
      if (c === 6 && r === 3) return 'P'
      return edge ? 'h' : 'b'
    })
  },
  {
    name: 'EQUALIZER',
    map: (() => {
      const hs = [4, 7, 9, 6, 10, 8, 5, 9, 7, 4, 8, 6, 3]
      return grid(10, (c, r) => {
        if (c % 3 === 2 || r >= hs[c]) return ''
        if (r === 0 && c === 4) return 'P'
        if (r === hs[c] - 1) return c % 6 === 1 ? 'x' : 'h'
        return 'b'
      })
    })()
  },
  {
    name: 'VINYL',
    map: grid(11, (c, r) => {
      const d = Math.hypot(c - 6, r - 5)
      if (d > 5.6) return ''
      if (d < 0.9) return 'x'
      if (d < 1.7) return 'm'
      if (d < 2.5) return 'P'
      if (d < 3.4) return 'o'
      if (d < 4.1) return ''
      if (d < 5.0) return 'o'
      return 'h'
    })
  },
  {
    name: 'WAVES',
    map: grid(7, (c, r) => {
      if (c % 2 === 1) return ''
      if (c === 0 || c === 12) return r > 3 ? 'm' : ''
      if (r === 3 && c === 6) return 'P'
      if (r === 5) return 'h'
      return 'w'
    })
  },
  {
    name: 'DIAMOND',
    map: grid(11, (c, r) => {
      const d = Math.abs(c - 6) + Math.abs(r - 5)
      if (d > 5) return ''
      if (d === 5 && r === 5) return 'm'
      if (c === 6 && r === 5) return 'x'
      if (c === 6 && r === 3) return 'P'
      if (d === 5) return 'h'
      if (d === 4) return 'o'
      return 'b'
    })
  },
  {
    name: 'HEADPHONES',
    map: grid(11, (c, r) => {
      const d = Math.hypot(c - 6, r - 5.5)
      const band = r <= 5 && d >= 4.3 && d <= 5.6
      const cupL = c <= 2 && r >= 5 && r <= 9
      const cupR = c >= 10 && r >= 5 && r <= 9
      if (band) return 'h'
      if (cupL || cupR) return (c === 1 || c === 11) && r === 7 ? 'x' : (c === 0 || c === 12 ? 'm' : 'b')
      if (c >= 4 && c <= 8 && r >= 6 && r <= 9) return r === 7 && c === 6 ? 'P' : 'o'
      return ''
    })
  },
  {
    name: 'INVADER',
    map: [
      '...b.....b...',
      '....b...b....',
      '...bbbbbbb...',
      '..bbhbbbhbb..',
      '.bbbbbbbbbbb.',
      '.b.bbbPbbb.b.',
      '.b.b.....b.b.',
      '...mbb.bbm...'
    ]
  }
]

// ---------------------------------------------------------------- power-ups
const POWERS = {
  W: { label: 'W', name: 'WIDE', hue: 165, timer: 'wide', dur: 14 },
  L: { label: 'L', name: 'LASER', hue: 330, timer: 'laser', dur: 11 },
  F: { label: 'F', name: 'FIREBALL', hue: 22, timer: 'fire', dur: 9 },
  S: { label: 'S', name: 'SLOW', hue: 205, timer: 'slow', dur: 11 },
  C: { label: 'C', name: 'CATCH', hue: 270, timer: 'catch', dur: 13 },
  M: { label: 'M', name: 'MULTI', hue: 50 },
  N: { label: 'N', name: 'NUKE', hue: 0 },
  '+': { label: '+', name: 'LIFE', hue: 340 }
}
const DROP_TABLE = [['W', 18], ['L', 14], ['F', 10], ['S', 10], ['C', 12], ['M', 16], ['N', 4], ['+', 6]]

function pickPower() {
  const total = DROP_TABLE.reduce((a, b) => a + b[1], 0)
  let r = Math.random() * total
  for (const [k, w] of DROP_TABLE) { if ((r -= w) <= 0) return k }
  return 'W'
}

// progress: the level you reached (and the score you had on arriving) survives a reload
const SAVE_KEY = 'fonyGame:breakout:save'
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY))
    if (s && s.level > 0) return { level: s.level | 0, score: s.score | 0 }
  } catch (e) { /* no save */ }
  return null
}
function writeSave(level, score) {
  try {
    if (level > 0) localStorage.setItem(SAVE_KEY, JSON.stringify({ level, score }))
    else localStorage.removeItem(SAVE_KEY)
  } catch (e) { /* storage unavailable */ }
}

function loadBest() {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch (e) { return 0 }
}
function saveBest(v) {
  try { localStorage.setItem(KEY, String(v)) } catch (e) { /* storage unavailable */ }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------------------------------------------------------------- game
function mount(container) {
  const canvas = document.createElement('canvas')
  canvas.tabIndex = 0
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const ctx = canvas.getContext('2d')
  let W = 360
  let cssW = 360

  // the world is always H tall; its width follows the modal's aspect ratio
  const fit = () => {
    const r = container.getBoundingClientRect()
    if (r.width < 10 || r.height < 10) return
    const aspect = Math.max(0.6, Math.min(2.4, r.width / r.height))
    const ch = Math.floor(Math.min(r.height, r.width / aspect))
    cssW = Math.floor(ch * aspect)
    W = Math.round(H * aspect)
    canvas.style.width = cssW + 'px'
    canvas.style.height = ch + 'px'
    const pw = Math.round(cssW * dpr)
    const ph = Math.round(ch * dpr)
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph }
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0)
  }
  container.appendChild(canvas)
  fit()
  canvas.focus()
  const ro = new ResizeObserver(fit)
  ro.observe(container)

  const audio = createSpectrum()
  // every column of the picture is a spectrum bar: its tiles light up from the bottom row upwards
  // with the level of that frequency, and a peak marker falls slowly
  const colLvl = new Float32Array(COLS)
  const colPk = new Float32Array(COLS)
  const colN = new Int16Array(COLS)
  const tileState = (b) => {
    if (b.kind === 'm' || !colN[b.c]) return null
    const n = colN[b.c]
    const lit = Math.round(colLvl[b.c] * n)
    const pk = Math.min(n, Math.round(colPk[b.c] * n)) - 1
    return { on: b.idx < lit, peak: b.idx === pk && b.idx >= lit, lv: colLvl[b.c] }
  }

  // ---- state
  let state = 'ready' // ready | play | clear | dead
  let t = 0
  let best = loadBest()
  let newBest = false
  let score = 0
  let lives = LIVES
  let levelIdx = 0
  let bricks = []
  let balls = []
  let caps = [] // falling power-up capsules
  let bolts = [] // laser bolts
  let parts = [] // particles
  let rings = [] // expanding shock rings (explosions, nukes)
  let nukes = []
  let timers = { wide: 0, laser: 0, fire: 0, slow: 0, catch: 0 }
  let shake = 0
  let flash = 0
  let banner = { text: '', sub: '', life: 0 }
  let clearAt = 0
  let deadAt = 0
  let combo = 0
  let laserCd = 0
  const pad = { x: W / 2, w: PAD_W, tx: W / 2 }
  const keys = { left: false, right: false }

  // ---- layout (recomputed every frame so a resize never breaks the level)
  const L = { cell: 28, x0: 0, y0: 64 }
  function layout() {
    const rows = LEVELS[levelIdx % LEVELS.length].map.length
    L.cell = Math.floor(Math.min((W - 40) / COLS, 32, 300 / rows))
    L.x0 = Math.round((W - COLS * L.cell) / 2)
    L.y0 = 70
  }

  function brickRect(b) {
    const g = 2
    const sway = b.kind === 'w' ? Math.sin(t * 1.6 + b.phase) * L.cell * 0.55 : 0
    return { x: L.x0 + b.c * L.cell + g + sway, y: L.y0 + b.r * L.cell + g, w: L.cell - g * 2, h: L.cell - g * 2 }
  }

  function buildLevel() {
    const lv = LEVELS[levelIdx % LEVELS.length]
    const rows = lv.map.length
    bricks = []
    lv.map.forEach((line, r) => {
      for (let c = 0; c < COLS; c++) {
        const ch = line[c]
        if (!ch || ch === '.') continue
        const hp = ch === 'h' ? 2 : ch === 'm' ? 99 : 1
        bricks.push({
          c, r, kind: ch, hp, maxHp: hp, alive: true, flash: 0,
          hue: 165 + (r / Math.max(1, rows - 1)) * 150,
          phase: r * 1.3 + (r % 2 ? Math.PI : 0)
        })
      }
    })
    layout()
  }

  const remaining = () => bricks.some((b) => b.alive && b.kind !== 'm')
  const speedNow = () => {
    const lvl = Math.min(levelIdx, 9)
    return BASE_SPEED * (1 + lvl * 0.05) * (timers.slow > 0 ? 0.72 : 1)
  }

  function resetBall() {
    balls = [{ x: pad.x, y: PAD_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true, off: 0, trail: [] }]
  }

  // fresh = wipe the saved progress and begin at level 1; otherwise resume from the saved level
  function startRun(fresh) {
    if (fresh) writeSave(0, 0)
    const sv = fresh ? null : loadSave()
    score = sv ? sv.score : 0
    lives = LIVES
    levelIdx = sv ? sv.level : 0
    newBest = false
    combo = 0
    timers = { wide: 0, laser: 0, fire: 0, slow: 0, catch: 0 }
    caps = []; bolts = []; parts = []; rings = []; nukes = []
    buildLevel()
    resetBall()
    state = 'ready'
    announce(LEVELS[levelIdx % LEVELS.length].name, 'LEVEL ' + (levelIdx + 1) + (sv ? '  ·  CONTINUE' : ''))
  }

  function announce(text, sub) { banner = { text, sub, life: 2.2 } }

  function launch() {
    for (const b of balls) {
      if (!b.stuck) continue
      const rel = Math.max(-1, Math.min(1, b.off / (pad.w / 2)))
      const ang = rel * 0.7 + (Math.random() - 0.5) * 0.12
      const sp = speedNow()
      b.vx = Math.sin(ang) * sp
      b.vy = -Math.cos(ang) * sp
      b.stuck = false
    }
    if (state === 'ready') state = 'play'
  }

  // ---- effects
  function burst(x, y, hue, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = (0.3 + Math.random()) * (speed || 150)
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, max: 0.9, hue, size: 1.5 + Math.random() * 2.5 })
    }
  }

  function addScore(n) {
    score += n
    if (score > best) { best = score; newBest = true }
  }

  // ---- bricks
  function destroy(b, silent) {
    if (!b.alive) return
    b.alive = false
    const r = brickRect(b)
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    combo++
    addScore((b.kind === 'h' ? 25 : b.kind === 'o' ? 15 : 10) + Math.min(combo, 20))
    burst(cx, cy, b.kind === 'x' ? 22 : b.hue, b.kind === 'x' ? 26 : 10, b.kind === 'x' ? 260 : 150)
    if (b.kind === 'P' || Math.random() < 0.13) {
      caps.push({ x: cx, y: cy, vy: 95, type: b.kind === 'P' ? pickPower() : pickPower(), wob: Math.random() * 6 })
    }
    if (b.kind === 'x' && !silent) explode(cx, cy)
  }

  function explode(cx, cy) {
    shake = Math.max(shake, 7)
    flash = Math.max(flash, 0.25)
    rings.push({ x: cx, y: cy, r: 4, max: L.cell * 2.3, hue: 22 })
    for (const o of bricks) {
      if (!o.alive || o.kind === 'm') continue
      const r = brickRect(o)
      if (Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) < L.cell * 1.8) destroy(o)
    }
  }

  function hurt(b, dmg) {
    if (!b.alive) return
    if (b.kind === 'm') { b.flash = 1; return }
    b.hp -= dmg
    b.flash = 1
    if (b.hp <= 0) destroy(b)
    else addScore(3)
  }

  // ---- balls
  function ballVsBrick(ball, b, pierce) {
    const r = brickRect(b)
    let nx, ny, pen
    if (b.kind === 'o') {
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const rad = r.w / 2
      const dx = ball.x - cx
      const dy = ball.y - cy
      const d = Math.hypot(dx, dy)
      if (d >= rad + BALL_R) return false
      nx = d ? dx / d : 0; ny = d ? dy / d : -1; pen = rad + BALL_R - d
    } else {
      const px = Math.max(r.x, Math.min(ball.x, r.x + r.w))
      const py = Math.max(r.y, Math.min(ball.y, r.y + r.h))
      const dx = ball.x - px
      const dy = ball.y - py
      const d2 = dx * dx + dy * dy
      if (d2 >= BALL_R * BALL_R) return false
      if (d2 === 0) {
        // centre inside the brick: leave through the nearest face
        const l = ball.x - r.x, rt = r.x + r.w - ball.x, tp = ball.y - r.y, bt = r.y + r.h - ball.y
        const m = Math.min(l, rt, tp, bt)
        if (m === l) { nx = -1; ny = 0 } else if (m === rt) { nx = 1; ny = 0 } else if (m === tp) { nx = 0; ny = -1 } else { nx = 0; ny = 1 }
        pen = m + BALL_R
      } else {
        const d = Math.sqrt(d2)
        nx = dx / d; ny = dy / d; pen = BALL_R - d
      }
    }
    const fire = timers.fire > 0
    if (fire && b.kind !== 'm') {
      // a fireball melts straight through
      burst(ball.x, ball.y, 22, 4, 120)
      if (b.kind === 'x') { destroy(b) } else { b.hp = 0; destroy(b) }
      return true
    }
    ball.x += nx * pen
    ball.y += ny * pen
    const vn = ball.vx * nx + ball.vy * ny
    if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny }
    hurt(b, 1)
    return true
  }

  function stepBall(ball, dt) {
    const sp = speedNow()
    // keep the speed constant and the angle away from dead-flat
    let cur = Math.hypot(ball.vx, ball.vy) || sp
    ball.vx *= sp / cur
    ball.vy *= sp / cur
    if (Math.abs(ball.vy) < sp * 0.22) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * sp * 0.22
      cur = Math.hypot(ball.vx, ball.vy)
      ball.vx *= sp / cur
      ball.vy *= sp / cur
    }

    const dist = sp * dt
    const steps = Math.max(1, Math.ceil(dist / 4))
    const sdt = dt / steps
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * sdt
      ball.y += ball.vy * sdt

      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) }
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) }

      // paddle
      if (ball.vy > 0 && ball.y + BALL_R >= PAD_Y && ball.y - BALL_R < PAD_Y + PAD_H && Math.abs(ball.x - pad.x) <= pad.w / 2 + BALL_R) {
        ball.y = PAD_Y - BALL_R
        combo = 0
        if (timers.catch > 0) {
          ball.stuck = true
          ball.off = ball.x - pad.x
          ball.vx = 0; ball.vy = 0
          return
        }
        const rel = Math.max(-1, Math.min(1, (ball.x - pad.x) / (pad.w / 2)))
        const ang = rel * 1.05
        ball.vx = Math.sin(ang) * sp
        ball.vy = -Math.cos(ang) * sp
        burst(ball.x, PAD_Y, 165, 4, 90)
      }

      for (const b of bricks) {
        if (!b.alive) continue
        const r = brickRect(b)
        if (ball.x + BALL_R < r.x - 1 || ball.x - BALL_R > r.x + r.w + 1 || ball.y + BALL_R < r.y - 1 || ball.y - BALL_R > r.y + r.h + 1) continue
        if (ballVsBrick(ball, b)) {
          if (timers.fire <= 0 || b.kind === 'm') break
        }
      }
    }
    ball.trail.push({ x: ball.x, y: ball.y })
    if (ball.trail.length > 14) ball.trail.shift()
  }

  // ---- power-ups
  function applyPower(type) {
    const p = POWERS[type]
    addScore(50)
    announce(p.name, 'POWER-UP')
    if (p.timer) timers[p.timer] = p.dur
    if (type === 'F') timers.fire = p.dur
    if (type === 'M') {
      const src = balls.find((b) => !b.stuck) || balls[0]
      if (src) {
        const sp = speedNow()
        const base = src.stuck ? -Math.PI / 2 : Math.atan2(src.vy, src.vx)
        for (const da of [-0.5, 0.5]) {
          balls.push({ x: src.x, y: src.y, vx: Math.cos(base + da) * sp, vy: Math.sin(base + da) * sp, stuck: false, off: 0, trail: [] })
        }
      }
    }
    if (type === 'N') {
      shake = 12
      flash = 0.7
      nukes.push({ x: pad.x, y: PAD_Y, r: 0 })
    }
    if (type === '+') lives = Math.min(5, lives + 1)
  }

  // ---- update
  function loseBall() {
    lives--
    combo = 0
    shake = 8
    if (lives <= 0) {
      state = 'dead'
      deadAt = performance.now()
      if (newBest) saveBest(best)
      else if (score > loadBest()) saveBest(score)
      return
    }
    timers = { wide: 0, laser: 0, fire: 0, slow: 0, catch: 0 }
    caps = []; bolts = []
    resetBall()
    state = 'ready'
  }

  function update(dt) {
    t += dt
    audio.update(dt)
    for (let c = 0; c < COLS; c++) {
      const lv = (audio.level(c * 3) + audio.level(c * 3 + 1) + audio.level(c * 3 + 2)) / 3
      colLvl[c] = lv
      colPk[c] = Math.max(lv, colPk[c] - dt * 0.45)
    }
    // rank the breakable tiles of every column from the bottom up
    const cols = Array.from({ length: COLS }, () => [])
    for (const b of bricks) if (b.alive && b.kind !== 'm') cols[b.c].push(b)
    for (let c = 0; c < COLS; c++) {
      cols[c].sort((a, b) => b.r - a.r)
      cols[c].forEach((b, i) => { b.idx = i })
      colN[c] = cols[c].length
    }
    layout()

    // timers & decays
    for (const k in timers) timers[k] = Math.max(0, timers[k] - dt)
    shake = Math.max(0, shake - dt * 30)
    flash = Math.max(0, flash - dt * 2.2)
    banner.life = Math.max(0, banner.life - dt)
    for (const b of bricks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4)

    // paddle
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    if (dir) pad.tx = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.tx + dir * 560 * dt))
    const wantW = timers.wide > 0 ? PAD_W * 1.65 : PAD_W
    pad.w += (wantW - pad.w) * Math.min(1, dt * 10)
    pad.tx = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.tx))
    pad.x += (pad.tx - pad.x) * Math.min(1, dt * 30)

    // particles, rings
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt }
    parts = parts.filter((p) => p.life > 0)
    for (const r of rings) r.r += (r.max - r.r) * Math.min(1, dt * 9) + 40 * dt
    rings = rings.filter((r) => r.r < r.max - 1)

    if (state === 'clear') {
      if (t - clearAt > 1.6) {
        levelIdx++
        writeSave(levelIdx, score)
        buildLevel()
        caps = []; bolts = []
        resetBall()
        state = 'ready'
        announce(LEVELS[levelIdx % LEVELS.length].name, 'LEVEL ' + (levelIdx + 1))
      }
      return
    }
    if (state === 'dead') return

    // balls
    for (const b of balls) {
      if (b.stuck) {
        b.off = Math.max(-pad.w / 2 + 4, Math.min(pad.w / 2 - 4, b.off))
        b.x = pad.x + b.off
        b.y = PAD_Y - BALL_R - 1
        b.trail.length = 0
      } else if (state === 'play') {
        stepBall(b, dt)
      }
    }
    balls = balls.filter((b) => b.stuck || b.y - BALL_R < H + 10)
    if (balls.length === 0 && state === 'play') { loseBall(); return }

    if (state !== 'play') return

    // lasers
    if (timers.laser > 0) {
      laserCd -= dt
      if (laserCd <= 0) {
        laserCd = 0.26
        bolts.push({ x: pad.x - pad.w / 2 + 6, y: PAD_Y }, { x: pad.x + pad.w / 2 - 6, y: PAD_Y })
      }
    }
    for (const bl of bolts) {
      bl.y -= 620 * dt
      for (const b of bricks) {
        if (!b.alive || bl.dead) continue
        const r = brickRect(b)
        if (bl.x > r.x && bl.x < r.x + r.w && bl.y < r.y + r.h && bl.y > r.y - 12) {
          bl.dead = true
          hurt(b, 1)
          burst(bl.x, bl.y, 330, 5, 110)
        }
      }
    }
    bolts = bolts.filter((b) => !b.dead && b.y > -20)

    // capsules
    for (const c of caps) {
      c.y += c.vy * dt
      c.wob += dt * 6
      if (c.y > PAD_Y - 6 && c.y < PAD_Y + PAD_H + 10 && Math.abs(c.x - pad.x) < pad.w / 2 + 16) {
        c.dead = true
        applyPower(c.type)
        burst(c.x, c.y, POWERS[c.type].hue, 14, 180)
      }
    }
    caps = caps.filter((c) => !c.dead && c.y < H + 20)

    // nukes: a shock wave that vaporises every breakable brick it reaches
    for (const n of nukes) {
      n.r += 640 * dt
      for (const b of bricks) {
        if (!b.alive || b.kind === 'm') continue
        const r = brickRect(b)
        if (Math.hypot(r.x + r.w / 2 - n.x, r.y + r.h / 2 - n.y) < n.r) destroy(b, true)
      }
    }
    nukes = nukes.filter((n) => n.r < Math.hypot(W, H) + 40)

    if (!remaining() && state === 'play' && nukes.length === 0) {
      state = 'clear'
      clearAt = t
      addScore(100 + levelIdx * 50)
      flash = 0.5
      announce('CLEARED', '+' + (100 + levelIdx * 50))
      if (newBest) saveBest(best)
    }
  }

  // ---- drawing
  const hsl = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a === undefined ? 1 : a})`

  // ---- parallax backdrop: nebula clouds and three star depths that slide against the paddle.
  // Every layer slides against the paddle, the deeper the layer the less it moves.
  function drawBackground() {
    const hue0 = 205 + (levelIdx % 7) * 22 // every level tints the sky differently
    const sway = (pad.x - W / 2) / (W / 2) // -1..1, where the paddle is

    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, hsl(hue0 + 10, 55, 6))
    g.addColorStop(0.55, hsl(hue0 + 30, 50, 12))
    g.addColorStop(1, hsl(hue0 + 70, 55, 17))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // nebula clouds (deepest layer)
    const blobs = [[0.25, 0.28, 220, 0], [0.78, 0.2, 180, 60], [0.55, 0.62, 260, 120]]
    for (let i = 0; i < blobs.length; i++) {
      const [bx, by, br, dh] = blobs[i]
      const cx = bx * W - sway * 14 + Math.sin(t * 0.07 + i * 2) * 26
      const cy = by * H + Math.cos(t * 0.06 + i) * 18
      const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, br)
      ng.addColorStop(0, hsl(hue0 + dh, 90, 55, 0.16 + audio.bass * 0.06))
      ng.addColorStop(1, hsl(hue0 + dh, 90, 55, 0))
      ctx.fillStyle = ng
      ctx.fillRect(cx - br, cy - br, br * 2, br * 2)
    }

    // stars in three depths
    const layers = [{ n: 30, d: 0.1, s: 1.2, a: 0.35 }, { n: 22, d: 0.25, s: 1.8, a: 0.5 }, { n: 12, d: 0.5, s: 2.6, a: 0.7 }]
    layers.forEach((ly, li) => {
      for (let i = 0; i < ly.n; i++) {
        const seed = i * 131 + li * 977
        const span = W + 40
        const x = ((((seed * 37) % span) - sway * ly.d * 70 - t * ly.d * 8) % span + span) % span - 20
        const y = 6 + ((seed * 53) % (H - 150))
        const a = ly.a * (0.45 + 0.55 * Math.abs(Math.sin(t * (0.5 + (i % 5) * 0.3) + i)))
        ctx.fillStyle = `rgba(215,255,248,${a})`
        ctx.fillRect(x, y, ly.s, ly.s)
      }
    })

    // horizon glow, breathing with the bass
    const hgl = ctx.createLinearGradient(0, H - 230, 0, H)
    hgl.addColorStop(0, hsl(hue0 + 120, 100, 60, 0))
    hgl.addColorStop(1, hsl(hue0 + 120, 100, 60, 0.1 + audio.bass * 0.2))
    ctx.fillStyle = hgl
    ctx.fillRect(0, H - 230, W, 230)

  }

  function drawBrick(b) {
    const r = brickRect(b)
    const ts = tileState(b)
    const on = !!(ts && ts.on)
    const pulse = on ? ts.lv : 0
    const lit = (on ? 54 + ts.lv * 14 : 40) + b.flash * 26
    const sc = 1 + (on ? 0.04 : 0) + b.flash * 0.08
    const x = r.x, y = r.y, w = r.w, h = r.h
    ctx.save()
    // the tile swells and brightens with the sound of its column
    ctx.translate(x + w / 2, y + h / 2)
    ctx.scale(sc, sc)
    ctx.translate(-(x + w / 2), -(y + h / 2))
    if (b.kind === 'm') {
      const mg = ctx.createLinearGradient(x, y, x, y + h)
      mg.addColorStop(0, '#9aa0b4'); mg.addColorStop(0.5, '#5e6479'); mg.addColorStop(1, '#3b4054')
      ctx.fillStyle = mg
      roundRect(ctx, x, y, w, h, 3); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + b.flash * 0.6) + ')'
      ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = 'rgba(20,24,40,0.7)'
      for (const [px, py] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) {
        ctx.beginPath(); ctx.arc(px, py, 1.5, 0, 7); ctx.fill()
      }
    } else if (b.kind === 'o') {
      const cx = x + w / 2, cy = y + h / 2, rad = w / 2
      const rg = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, 1, cx, cy, rad)
      rg.addColorStop(0, hsl(b.hue, 100, 82)); rg.addColorStop(1, hsl(b.hue, 95, lit - 10))
      ctx.fillStyle = rg
      ctx.shadowColor = hsl(b.hue, 100, 60); ctx.shadowBlur = 6 + pulse * 10
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.beginPath(); ctx.ellipse(cx - rad * 0.3, cy - rad * 0.42, rad * 0.32, rad * 0.16, -0.6, 0, 7); ctx.fill()
    } else {
      let hue = b.hue
      let sat = 100
      if (b.kind === 'x') { hue = 18; sat = 100 }
      if (b.kind === 'P') { hue = 48 }
      const lg = ctx.createLinearGradient(x, y, x, y + h)
      lg.addColorStop(0, hsl(hue, sat, lit + 14))
      lg.addColorStop(1, hsl(hue, sat, lit - 10))
      ctx.fillStyle = lg
      ctx.shadowColor = hsl(hue, 100, 60)
      ctx.shadowBlur = (b.kind === 'P' || b.kind === 'x' ? 14 : 4) + pulse * 10
      roundRect(ctx, x, y, w, h, b.kind === 'h' ? 3 : 5)
      ctx.fill()
      ctx.shadowBlur = 0
      if (b.kind === 'h') {
        ctx.lineWidth = 2
        ctx.strokeStyle = hsl(hue, 100, b.hp < b.maxHp ? 35 : 86, 0.9)
        roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 3); ctx.stroke()
        if (b.hp < b.maxHp) { // cracks
          ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 1.3
          ctx.beginPath()
          ctx.moveTo(x + w * 0.3, y + 2); ctx.lineTo(x + w * 0.5, y + h * 0.45); ctx.lineTo(x + w * 0.38, y + h * 0.7); ctx.lineTo(x + w * 0.6, y + h - 2)
          ctx.stroke()
        }
      }
      if (b.kind === 'x') {
        ctx.fillStyle = '#2a0d05'
        ctx.font = `900 ${Math.round(h * 0.7)}px Ruda, system-ui, sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('!', x + w / 2, y + h / 2 + 1)
      }
      if (b.kind === 'P') {
        ctx.fillStyle = '#fff8dc'
        ctx.font = `900 ${Math.round(h * 0.75)}px Ruda, system-ui, sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('★', x + w / 2, y + h / 2 + 1)
      }
      if (b.kind === 'w') {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x + w * 0.25, y + h / 2); ctx.lineTo(x + w * 0.75, y + h / 2)
        ctx.moveTo(x + w * 0.25, y + h / 2); ctx.lineTo(x + w * 0.4, y + h * 0.35)
        ctx.moveTo(x + w * 0.75, y + h / 2); ctx.lineTo(x + w * 0.6, y + h * 0.65)
        ctx.stroke()
      }
    }
    if (b.kind !== 'm' && b.kind !== 'o' && b.flash <= 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      roundRect(ctx, x + 3, y + 2, w - 6, 2.5, 1.2); ctx.fill()
    }
    if (b.flash > 0.01 && b.kind !== 'm') {
      ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.55})`
      roundRect(ctx, x, y, w, h, 4); ctx.fill()
    }
    if (ts && !on && b.flash <= 0.01) { // unlit tiles sink into the dark
      ctx.fillStyle = 'rgba(11,15,30,0.72)'
      if (b.kind === 'o') { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); ctx.fill() } else { roundRect(ctx, x, y, w, h, 5); ctx.fill() }
    }
    if (ts && ts.peak) { // peak-hold marker of the column
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.6
      if (b.kind === 'o') { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2 - 1, 0, Math.PI * 2); ctx.stroke() } else { roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4); ctx.stroke() }
    }
    ctx.restore()
  }

  function drawPaddle() {
    const x = pad.x - pad.w / 2
    const gl = 8 + audio.bass * 16
    ctx.save()
    ctx.shadowColor = timers.laser > 0 ? '#ff4fa0' : ACCENT
    ctx.shadowBlur = gl
    const pg = ctx.createLinearGradient(0, PAD_Y, 0, PAD_Y + PAD_H)
    pg.addColorStop(0, '#7dffe3'); pg.addColorStop(1, '#00b88a')
    ctx.fillStyle = pg
    roundRect(ctx, x, PAD_Y, pad.w, PAD_H, 6); ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    roundRect(ctx, x + 6, PAD_Y + 2, pad.w - 12, 2.5, 1.2); ctx.fill()
    // end caps
    ctx.fillStyle = INK
    ctx.fillRect(x + 12, PAD_Y + 4, 3, 4)
    ctx.fillRect(x + pad.w - 15, PAD_Y + 4, 3, 4)
    if (timers.laser > 0) { // laser guns
      ctx.fillStyle = '#ff4fa0'
      roundRect(ctx, x + 2, PAD_Y - 8, 8, 10, 2); ctx.fill()
      roundRect(ctx, x + pad.w - 10, PAD_Y - 8, 8, 10, 2); ctx.fill()
    }
    if (timers.catch > 0) { // sticky glow
      ctx.strokeStyle = hsl(270, 100, 70, 0.8); ctx.lineWidth = 2
      roundRect(ctx, x - 2, PAD_Y - 2, pad.w + 4, PAD_H + 4, 8); ctx.stroke()
    }
    ctx.restore()
  }

  function drawBall(b) {
    const fire = timers.fire > 0
    const hue = fire ? 22 : 165
    for (let i = 0; i < b.trail.length; i++) {
      const p = b.trail[i]
      const k = i / b.trail.length
      ctx.fillStyle = hsl(hue, 100, fire ? 55 : 65, k * 0.35)
      ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.3 + k * 0.7), 0, 7); ctx.fill()
    }
    ctx.save()
    ctx.shadowColor = hsl(hue, 100, 60)
    ctx.shadowBlur = fire ? 22 : 14
    const rg = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R)
    rg.addColorStop(0, '#ffffff')
    rg.addColorStop(1, fire ? '#ff7a1c' : '#4dffd9')
    ctx.fillStyle = rg
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawCap(c) {
    const p = POWERS[c.type]
    const w = 38, h = 18
    const x = c.x - w / 2
    const y = c.y - h / 2
    ctx.save()
    ctx.shadowColor = hsl(p.hue, 100, 60)
    ctx.shadowBlur = 14
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, hsl(p.hue, 100, 72)); g.addColorStop(1, hsl(p.hue, 95, 42))
    ctx.fillStyle = g
    roundRect(ctx, x, y, w, h, 9); ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 9); ctx.stroke()
    ctx.fillStyle = '#10131f'
    ctx.font = '900 13px Ruda, system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(p.label, c.x, c.y + 1)
    ctx.restore()
  }

  function text(str, x, y, size, color, align) {
    ctx.font = `700 ${size}px Ruda, system-ui, sans-serif`
    ctx.textAlign = align || 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = color || '#fff'
    ctx.fillText(str, x, y)
  }

  function draw() {
    ctx.save()
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
    drawBackground()
    for (const b of bricks) if (b.alive) drawBrick(b)

    // rings (explosions)
    for (const r of rings) {
      const k = 1 - r.r / r.max
      ctx.strokeStyle = hsl(r.hue, 100, 65, k * 0.9)
      ctx.lineWidth = 3 + k * 6
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke()
    }
    // nuke waves
    for (const n of nukes) {
      const k = Math.max(0, 1 - n.r / Math.hypot(W, H))
      ctx.save()
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 24
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + k * 0.6})`
      ctx.lineWidth = 6 + k * 10
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, Math.PI, 0); ctx.stroke()
      ctx.strokeStyle = hsl(330, 100, 65, k * 0.6)
      ctx.lineWidth = 14 + k * 20
      ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0, n.r - 14), Math.PI, 0); ctx.stroke()
      ctx.restore()
    }

    for (const bl of bolts) {
      ctx.save()
      ctx.shadowColor = '#ff4fa0'; ctx.shadowBlur = 12
      ctx.fillStyle = '#ffd0e6'
      roundRect(ctx, bl.x - 1.5, bl.y, 3, 14, 1.5); ctx.fill()
      ctx.restore()
    }
    for (const c of caps) drawCap(c)
    drawPaddle()
    for (const b of balls) drawBall(b)
    for (const p of parts) {
      const k = p.life / p.max
      ctx.fillStyle = hsl(p.hue, 100, 65, Math.min(1, k * 1.2))
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size * k + 0.6, p.size * k + 0.6)
    }
    ctx.restore()

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, flash)})`
      ctx.fillRect(0, 0, W, H)
    }

    // HUD
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6
    text(String(score), W / 2, 42, 34, '#fff')
    ctx.shadowBlur = 0
    text('LEVEL ' + (levelIdx + 1), W / 2, 58, 11, 'rgba(255,255,255,0.55)')
    ctx.restore()
    for (let i = 0; i < Math.max(LIVES, lives); i++) {
      const lx = W / 2 + (i - (Math.max(LIVES, lives) - 1) / 2) * 16
      ctx.beginPath()
      ctx.arc(lx, 70, 4.5, 0, Math.PI * 2)
      if (i < lives) { ctx.fillStyle = ACCENT; ctx.fill() } else { ctx.strokeStyle = 'rgba(0,242,184,0.3)'; ctx.lineWidth = 1.3; ctx.stroke() }
    }
    // active power timers
    let ty = H - 18
    for (const key of Object.keys(POWERS)) {
      const p = POWERS[key]
      if (!p.timer || timers[p.timer] <= 0) continue
      const frac = timers[p.timer] / p.dur
      ctx.fillStyle = hsl(p.hue, 100, 60, 0.9)
      roundRect(ctx, 14, ty - 9, 16, 14, 4); ctx.fill()
      text(p.label, 22, ty + 2, 10, '#10131f')
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      roundRect(ctx, 34, ty - 4, 56, 5, 2.5); ctx.fill()
      ctx.fillStyle = hsl(p.hue, 100, 62)
      roundRect(ctx, 34, ty - 4, 56 * frac, 5, 2.5); ctx.fill()
      ty -= 20
    }

    if (banner.life > 0) {
      const a = Math.min(1, banner.life / 0.6)
      ctx.save()
      ctx.globalAlpha = a
      ctx.shadowColor = ACCENT; ctx.shadowBlur = 18
      text(banner.text, W / 2, H * 0.62, 30, ACCENT)
      ctx.shadowBlur = 0
      text(banner.sub, W / 2, H * 0.62 + 22, 13, 'rgba(255,255,255,0.75)')
      ctx.restore()
    }

    if (state === 'ready' && banner.life <= 0) {
      text('Click / Space to launch', W / 2, H * 0.66, 15, 'rgba(255,255,255,0.8)')
      text('Mouse or ← → to move', W / 2, H * 0.66 + 20, 12, 'rgba(255,255,255,0.5)')
    }

    if (state === 'dead') {
      ctx.fillStyle = 'rgba(10,13,22,0.7)'
      ctx.fillRect(0, 0, W, H)
      const bw = 270, bh = 200, bx = W / 2 - bw / 2, by = H / 2 - bh / 2 - 10
      ctx.fillStyle = INK
      roundRect(ctx, bx, by, bw, bh, 20); ctx.fill()
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.stroke()
      text('GAME OVER', W / 2, by + 46, 24, ACCENT)
      text('Score', W / 2 - 55, by + 86, 13, 'rgba(255,255,255,0.6)')
      text(String(score), W / 2 - 55, by + 122, 32, '#fff')
      text('Best', W / 2 + 55, by + 86, 13, 'rgba(255,255,255,0.6)')
      text(String(best), W / 2 + 55, by + 122, 32, ACCENT)
      if (newBest) text('New record!', W / 2, by + 148, 13, '#ff6b9a')
      text('Click / Space: retry level ' + (levelIdx + 1), W / 2, by + 176, 14, 'rgba(255,255,255,0.85)')
      text('R: new game from level 1', W / 2, by + 194, 11, 'rgba(255,255,255,0.5)')
    }

    // new-game icon (top row): a bare restart arrow, no frame or background
    {
      const nb = newBtnRect()
      const asking = performance.now() < confirmUntil
      const cx = nb.x + nb.w / 2
      const cy = nb.y + nb.h / 2
      ctx.save()
      ctx.globalAlpha = asking ? 1 : 0.75
      ctx.strokeStyle = asking ? '#ff6b9a' : ACCENT
      ctx.fillStyle = ctx.strokeStyle
      const u = nb.w / 26 // world units per screen pixel
      ctx.lineWidth = 1.7 * u
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 5
      const rad = 5.5 * u
      ctx.beginPath()
      ctx.arc(cx, cy, rad, -0.9, Math.PI * 1.45) // open circle
      ctx.stroke()
      const ax = cx + Math.cos(-0.9) * rad
      const ay = cy + Math.sin(-0.9) * rad
      ctx.beginPath() // arrow head at the open end
      ctx.moveTo(ax + 3.6 * u, ay - 0.8 * u)
      ctx.lineTo(ax - 0.8 * u, ay - 4 * u)
      ctx.lineTo(ax - 1.1 * u, ay + 1.9 * u)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      if (asking) text('CLICK AGAIN', nb.x + nb.w + 4 * u, cy + 4 * u, 10 * u, '#ff9fbd', 'left')
    }
  }

  // ---- loop
  startRun(false)
  let raf = 0
  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    update(dt)
    draw()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  // ---- input
  const toWorldX = (e) => {
    const r = canvas.getBoundingClientRect()
    return ((e.clientX - r.left) / r.width) * W
  }
  const action = () => {
    if (state === 'dead') {
      if (performance.now() - deadAt > 450) startRun(false) // retry from the level you reached
    } else if (state === 'ready' || balls.some((b) => b.stuck)) {
      launch()
    }
  }
  const onMove = (e) => { pad.tx = Math.max(pad.w / 2, Math.min(W - pad.w / 2, toWorldX(e))) }
  // "new game" asks for a second click while a run is in progress, so a stray click can't wipe it
  let confirmUntil = 0
  // icon-only button in the top-left HUD row, right after the "Games" back button.
  // Sized in screen pixels (converted to world units) so it never touches the HTML buttons.
  const newBtnRect = () => {
    const s = cssW / W
    const size = 26 / s
    return { x: 132 / s - size / 2, y: 31 / s - size / 2, w: size, h: size }
  }
  const newGame = () => {
    const idle = state === 'dead' || (levelIdx === 0 && score === 0)
    if (idle || performance.now() < confirmUntil) { confirmUntil = 0; startRun(true) }
    else confirmUntil = performance.now() + 2500
  }
  const onDown = (e) => {
    e.preventDefault(); canvas.focus()
    const r = canvas.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    const nb = newBtnRect()
    if (px >= nb.x && px <= nb.x + nb.w && py >= nb.y && py <= nb.y + nb.h) { newGame(); return }
    onMove(e)
    action()
  }
  const onKeyDown = (e) => {
    if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); newGame(); return }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; e.preventDefault() }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; e.preventDefault() }
    else if (e.code === 'Space' && !e.repeat) { e.preventDefault(); action() }
  }
  const onKeyUp = (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('keyup', onKeyUp, true)

  return {
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
      canvas.remove()
    }
  }
}

const ART = `<svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ba-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#201a46"/><stop offset="1" stop-color="#0f1324"/></linearGradient>
    <radialGradient id="ba-ball" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#4dffd9"/></radialGradient>
  </defs>
  <rect width="120" height="90" fill="url(#ba-bg)"/>
  <g>
    <rect x="12" y="10" width="14" height="9" rx="2" fill="#00F2B8"/><rect x="29" y="10" width="14" height="9" rx="2" fill="#2fd0ff"/><rect x="46" y="10" width="14" height="9" rx="2" fill="#6f9bff"/><rect x="63" y="10" width="14" height="9" rx="2" fill="#b46bff"/><rect x="80" y="10" width="14" height="9" rx="2" fill="#ff6bd6"/>
    <rect x="29" y="22" width="14" height="9" rx="2" fill="#2fd0ff" opacity=".8"/><rect x="46" y="22" width="14" height="9" rx="2" fill="#ffc83c"/><rect x="63" y="22" width="14" height="9" rx="2" fill="#b46bff" opacity=".8"/>
    <circle cx="19" cy="26.5" r="5" fill="#ff7a1c"/><circle cx="87" cy="26.5" r="5" fill="#ff7a1c"/>
  </g>
  <path d="M60 64 L48 36" stroke="#4dffd9" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 3"/>
  <circle cx="60" cy="62" r="4.5" fill="url(#ba-ball)"/>
  <rect x="42" y="72" width="36" height="7" rx="3.5" fill="#00F2B8"/>
</svg>`

export default {
  id: 'breakout',
  title: 'FONY Breaker',
  icon: '&#129521;',
  art: ART,
  desc: 'Smash shaped levels with power-ups and super weapons',
  mount
}
