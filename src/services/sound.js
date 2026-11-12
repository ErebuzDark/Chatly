// Synthesized UI sounds using Web Audio API (no external audio files required)

let audioCtx = null

function getContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) audioCtx = new AudioContextClass()
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export function playNotificationSound() {
  try {
    const ctx = getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc2.type = 'triangle'

    // Pleasant two-note chime (A5 -> E6)
    osc1.frequency.setValueAtTime(880, now)
    osc1.frequency.setValueAtTime(1318.5, now + 0.11)

    osc2.frequency.setValueAtTime(440, now)
    osc2.frequency.setValueAtTime(659.25, now + 0.11)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.4)
    osc2.stop(now + 0.4)
  } catch {
    // Audio blocked by browser autoplay policy until user interacts
  }
}

export function playSendSound() {
  try {
    const ctx = getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, now)
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08)

    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.1)
  } catch {
    // ignore
  }
}

export function playRingPulse() {
  try {
    const ctx = getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()

    osc1.type = 'sine'
    osc2.type = 'sine'

    // Soft marimba-style two-chord ringtone pulse
    osc1.frequency.setValueAtTime(587.33, now) // D5
    osc2.frequency.setValueAtTime(880, now) // A5

    osc1.frequency.setValueAtTime(659.25, now + 0.22) // E5
    osc2.frequency.setValueAtTime(987.77, now + 0.22) // B5

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.2)
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.25)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65)

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.68)
    osc2.stop(now + 0.68)
  } catch {
    // ignore
  }
}

export function startRingtone() {
  playRingPulse()
  const timer = setInterval(playRingPulse, 1800)
  return () => clearInterval(timer)
}
