// Dezente, synthetische Klänge (kein Audiomaterial nötig). Startet erst nach der ersten Berührung.
let ctx: AudioContext | null = null;
let enabled = true;
let lastCoin = 0;

try {
  enabled = localStorage.getItem('x4-sektorbau-sound') !== 'off';
} catch {
  /* Speicher nicht verfügbar */
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSound(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem('x4-sektorbau-sound', on ? 'on' : 'off');
  } catch {
    /* Speicher nicht verfügbar */
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slide = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tap: () => tone(880, 0, 0.05, 'sine', 0.025),
  open: () => tone(520, 0, 0.09, 'triangle', 0.03, 1.5),
  build: () => { tone(392, 0, 0.14, 'triangle', 0.05); tone(587, 0.09, 0.22, 'triangle', 0.05); },
  coin: () => {
    const now = performance.now();
    if (now - lastCoin < 700) return;
    lastCoin = now;
    tone(1318, 0, 0.08, 'sine', 0.02);
    tone(1760, 0.05, 0.12, 'sine', 0.018);
  },
  success: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.045)); },
  warn: () => tone(220, 0, 0.18, 'sawtooth', 0.02, 0.8),
};
