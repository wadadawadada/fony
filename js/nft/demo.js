// A tiny demo release for the About tab, made entirely in the browser: a cover drawn on a canvas and three
// short instrumental sketches synthesised into WAV files. No files are shipped and nothing is downloaded.

const SR = 22050

function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1 }
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

// one sketch: { bpm, bars, chords: [{ root, notes }], drums }
function synth({ bpm, bars, chords, drums, seed }) {
  const beat = 60 / bpm
  const total = Math.floor(bars * 4 * beat * SR)
  const out = new Float32Array(total)
  const rand = rng(seed)
  const add = (start, len, fn) => {
    const from = Math.floor(start * SR)
    const n = Math.floor(len * SR)
    for (let j = 0; j < n && from + j < total; j++) out[from + j] += fn(j / SR, j)
  }

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length]
    const t0 = bar * 4 * beat

    // pad: slow, soft chord
    add(t0, 4 * beat + 0.1, (t) => {
      const env = Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (4 * beat + 0.1 - t) / 0.3))
      let v = 0
      for (const m of chord.notes) v += Math.sin(2 * Math.PI * hz(m) * t) + 0.6 * Math.sin(2 * Math.PI * hz(m) * 1.006 * t)
      return v * 0.035 * env
    })

    // bass: a simple syncopated pulse on the root
    const pulses = drums ? [0, 1.5, 2, 3] : [0, 2]
    for (const p of pulses) {
      const f = hz(chord.root)
      add(t0 + p * beat, beat * 0.9, (t) => {
        const env = Math.min(1, t / 0.006) * Math.exp(-t * 3.2)
        return (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t)) * 0.26 * env
      })
    }

    if (!drums) continue
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat
      if (b === 0 || b === 2) {
        let phase = 0
        add(tb, 0.28, (t) => { phase += 2 * Math.PI * (44 + 95 * Math.exp(-t * 30)) / SR; return Math.sin(phase) * Math.exp(-t * 9) * 0.85 })
      } else {
        add(tb, 0.22, (t) => rand() * Math.exp(-t * 22) * 0.3 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 17) * 0.22)
      }
      for (const off of [0, 0.5]) {
        let prev = 0
        add(tb + off * beat, 0.06, (t) => { const n = rand(); const v = n - prev; prev = n; return v * Math.exp(-t * 75) * (off ? 0.11 : 0.07) })
      }
    }
  }

  // master: soft clip, short fade in and a longer fade out so loops never click
  const fadeOut = Math.floor(0.5 * SR)
  for (let i = 0; i < total; i++) {
    let v = Math.tanh(out[i] * 1.25)
    if (i < 220) v *= i / 220
    if (i > total - fadeOut) v *= (total - i) / fadeOut
    out[i] = v
  }
  return out
}

function toWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const dv = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  str(0, "RIFF"); dv.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ")
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  str(36, "data"); dv.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true)
  return new Blob([buf], { type: "audio/wav" })
}

const SKETCHES = [
  { title: "Sketch 01 · Low light", bpm: 92, bars: 8, drums: true, seed: 11, chords: [{ root: 45, notes: [57, 60, 64] }, { root: 41, notes: [53, 57, 60] }, { root: 48, notes: [60, 64, 67] }, { root: 43, notes: [55, 59, 62] }] },
  { title: "Sketch 02 · Night bus", bpm: 108, bars: 8, drums: true, seed: 23, chords: [{ root: 38, notes: [50, 53, 57] }, { root: 34, notes: [58, 62, 65] }, { root: 41, notes: [53, 57, 60] }, { root: 36, notes: [48, 52, 55] }] },
  { title: "Sketch 03 · Slow tide", bpm: 66, bars: 6, drums: false, seed: 37, chords: [{ root: 36, notes: [48, 55, 59, 64] }, { root: 33, notes: [45, 52, 55, 60] }] }
]

// A square poster: a teal field, a black record, a few lines of type.
function drawCover() {
  const W = 720
  const c = document.createElement("canvas")
  c.width = c.height = W
  const g = c.getContext("2d")
  g.fillStyle = "#00f2b8"
  g.fillRect(0, 0, W, W)

  const cx = W * 0.6, cy = W * 0.42, R = W * 0.34
  g.fillStyle = "#0b0f1c"
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
  g.strokeStyle = "rgba(0, 242, 184, 0.16)"
  g.lineWidth = 1.2
  for (let r = R * 0.3; r < R * 0.96; r += 7) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke() }
  g.strokeStyle = "rgba(255, 255, 255, 0.09)"
  g.lineWidth = 10
  g.beginPath(); g.arc(cx, cy, R * 0.74, -2.5, -1.7); g.stroke()
  g.fillStyle = "#00f2b8"
  g.beginPath(); g.arc(cx, cy, R * 0.26, 0, Math.PI * 2); g.fill()
  g.fillStyle = "#0b0f1c"
  g.beginPath(); g.arc(cx, cy, R * 0.035, 0, Math.PI * 2); g.fill()
  g.font = "800 22px Ruda, system-ui, sans-serif"
  g.textAlign = "center"
  g.fillText("FONY", cx, cy + R * 0.12)

  g.textAlign = "left"
  g.fillStyle = "#0b0f1c"
  g.font = "800 92px Ruda, system-ui, sans-serif"
  g.fillText("SKETCHES", W * 0.06, W * 0.86)
  g.font = "600 21px ui-monospace, Consolas, monospace"
  g.fillText("FONY MUSIC LABEL  ·  DEMO 001", W * 0.065, W * 0.93)
  g.fillRect(W * 0.065, W * 0.885, W * 0.87, 3)
  g.font = "600 21px ui-monospace, Consolas, monospace"
  g.fillText("A1  A2  A3", W * 0.065, W * 0.075)
  return new Promise(resolve => c.toBlob(b => resolve(URL.createObjectURL(b)), "image/png"))
}

// resolves { cover, tracks: [{ title, url }], revoke() }
export async function makeDemo() {
  const urls = []
  const cover = await drawCover()
  urls.push(cover)
  const tracks = []
  for (const s of SKETCHES) {
    await new Promise(r => setTimeout(r, 0))   // keep the page responsive between the three renders
    const url = URL.createObjectURL(toWav(synth(s)))
    urls.push(url)
    tracks.push({ title: s.title, url })
  }
  return { cover, tracks, revoke: () => urls.forEach(u => URL.revokeObjectURL(u)) }
}
