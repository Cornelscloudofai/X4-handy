// Peil-Minispiel: Mit der Richtantenne (Wischen auf dem Radar) ein schwaches, wanderndes Torsignal suchen und halten.
// Je näher die Antenne am Signal, desto klarer die Welle und heller der Punkt. Wer das Signal lange genug hält, hat die
// Peilung – der Anteil (0…1) erhöht die Fundchance der Suche. Störungen lassen das Signal zwischendurch springen.
import { sfx } from './sound';

export interface PeilOpts {
  /** Sektor, in dem gepeilt wird (Anzeige) */
  sector: string;
  onDone: (bonus: number) => void;
  onCancel: () => void;
}

const DURATION = 30;
const LOCK_NEED = 7;
const WIDTH = 0.22; // Breite des Antennenkegels (rad)

/** Für automatische Tests: aktueller Zustand */
interface PeilTest { target: number; antenna: number; set(a: number): void }
declare global { interface Window { __peil?: PeilTest } }

export function runPeilung(o: PeilOpts): void {
  document.getElementById('peilung')?.remove();
  const root = document.createElement('div');
  root.id = 'peilung';
  root.className = 'peil';
  root.innerHTML = `
    <div class="peil-head"><div><span>Peilung</span><b>${o.sector}</b></div><button class="peil-x" aria-label="Abbrechen">×</button></div>
    <canvas class="peil-cv"></canvas>
    <div class="peil-help">Wische über das Radar, um die Antenne zu drehen. Halte sie auf dem Signal.</div>
    <div class="peil-lock"><i></i><span>Peilung 0 %</span></div>
    <div class="peil-end" hidden></div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  const cv = root.querySelector<HTMLCanvasElement>('.peil-cv')!;
  const ctx = cv.getContext('2d')!;
  const lockBar = root.querySelector<HTMLElement>('.peil-lock i')!;
  const lockTxt = root.querySelector<HTMLElement>('.peil-lock span')!;
  const end = root.querySelector<HTMLElement>('.peil-end')!;

  let target = Math.random() * Math.PI * 2;
  let drift = (Math.random() < 0.5 ? -1 : 1) * 0.25;
  let antenna = target + Math.PI * (0.6 + Math.random() * 0.6);
  let lock = 0, time = 0, glitch = 0, nextJump = 6 + Math.random() * 5, lastPing = 0;
  let running = true, last = performance.now();
  const noise: { a: number; r: number; l: number }[] = [];

  window.__peil = { get target() { return target; }, get antenna() { return antenna; }, set(a: number) { antenna = a; } } as PeilTest;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);

  // Steuerung: auf dem Radar zeigt der Finger die Richtung; sonst seitliches Wischen dreht
  let drag: { x: number; a: number; onScope: boolean } | null = null;
  const scope = () => { const r = cv.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height * 0.4, R: Math.min(r.width, r.height * 0.8) * 0.42 }; };
  const pointerAngle = (e: PointerEvent) => { const s = scope(); return Math.atan2(e.clientY - s.cy, e.clientX - s.cx); };
  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const s = scope();
    const onScope = Math.hypot(e.clientX - s.cx, e.clientY - s.cy) < s.R * 1.15;
    drag = { x: e.clientX, a: antenna, onScope };
    if (onScope) antenna = pointerAngle(e);
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.onScope) antenna = pointerAngle(e);
    else antenna = drag.a + (e.clientX - drag.x) * 0.012;
  });
  const up = () => { drag = null; };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);

  const strength = () => {
    let d = Math.abs(((antenna - target) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    d = Math.max(0, d - 0.02);
    return Math.exp(-((d / WIDTH) ** 2));
  };

  const finish = (cancelled: boolean) => {
    if (!running) return;
    running = false;
    window.removeEventListener('resize', size);
    const bonus = Math.min(1, lock / LOCK_NEED);
    if (cancelled) { root.remove(); delete window.__peil; o.onCancel(); return; }
    const chance = Math.round(Math.min(97, 50 + bonus * 50));
    if (bonus >= 1) sfx.success();
    end.hidden = false;
    end.innerHTML = `<b>${bonus >= 1 ? 'Peilung gehalten!' : bonus > 0.3 ? 'Teilweise gepeilt' : 'Signal verloren'}</b><span>Peilung ${Math.round(bonus * 100)} % · Fundchance ${chance} %</span><button class="btn primary" data-peil="go">Späher losschicken</button>`;
    end.querySelector('[data-peil="go"]')!.addEventListener('click', () => { root.remove(); delete window.__peil; o.onDone(bonus); });
  };
  root.querySelector('.peil-x')!.addEventListener('click', () => finish(true));

  const draw = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    // Signal wandert, gelegentlich Störung mit Sprung
    target += drift * dt * (0.6 + 0.4 * Math.sin(time * 0.7));
    if (Math.random() < dt * 0.25) drift = -drift;
    nextJump -= dt;
    if (nextJump <= 0) { target += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6); nextJump = 7 + Math.random() * 6; glitch = 0.6; }
    glitch = Math.max(0, glitch - dt);
    const s = strength() * (glitch > 0 ? 0.25 : 1);
    if (s > 0.78) {
      lock += dt;
      if (now - lastPing > 650) { sfx.tick(); lastPing = now; }
    }
    const frac = Math.min(1, lock / LOCK_NEED);
    lockBar.style.width = `${(frac * 100).toFixed(1)}%`;
    lockTxt.textContent = `Peilung ${Math.round(frac * 100)} % · noch ${Math.max(0, Math.ceil(DURATION - time))} s`;
    root.classList.toggle('locked', s > 0.78);

    const r = cv.getBoundingClientRect();
    const W = r.width, H = r.height;
    const cx = W / 2, cy = H * 0.4, R = Math.min(W, H * 0.8) * 0.42;
    ctx.clearRect(0, 0, W, H);
    // Radar: Ringe, Gitter
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, 'rgba(10,40,44,0.9)');
    bg.addColorStop(1, 'rgba(3,12,18,0.95)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(63,224,197,0.18)';
    ctx.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.12, cy + Math.sin(a) * R * 0.12); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    // Rauschen (stärker, je schwächer das Signal)
    if (Math.random() < 0.8) noise.push({ a: Math.random() * Math.PI * 2, r: Math.random() * R, l: 0.6 });
    for (let i = noise.length - 1; i >= 0; i--) {
      const n = noise[i];
      n.l -= dt;
      if (n.l <= 0) { noise.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(150,230,220,${(n.l * 0.5 * (1 - s * 0.8)).toFixed(3)})`;
      ctx.fillRect(cx + Math.cos(n.a) * n.r, cy + Math.sin(n.a) * n.r, 1.5, 1.5);
    }
    // Antennenkegel
    const cone = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    cone.addColorStop(0, `rgba(63,224,197,${(0.35 + s * 0.3).toFixed(3)})`);
    cone.addColorStop(1, 'rgba(63,224,197,0.02)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, antenna - WIDTH, antenna + WIDTH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(191,247,236,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(antenna) * R, cy + Math.sin(antenna) * R); ctx.stroke();
    // Signal: nur sichtbar, wenn die Antenne in der Nähe ist
    const bx = cx + Math.cos(target) * R * 0.72, by = cy + Math.sin(target) * R * 0.72;
    const vis = Math.min(1, s * 1.4);
    if (vis > 0.03) {
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, 22);
      g.addColorStop(0, `rgba(200,240,255,${vis.toFixed(3)})`);
      g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, 22, 0, Math.PI * 2); ctx.fill();
      const p = (time * 1.4) % 1;
      ctx.strokeStyle = `rgba(190,230,255,${(vis * (1 - p)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(bx, by, 5 + p * 22, 0, Math.PI * 2); ctx.stroke();
    }
    // Rand mit Leuchten bei Peilung
    ctx.save();
    ctx.shadowColor = s > 0.78 ? 'rgba(120,255,225,0.9)' : 'rgba(63,224,197,0.4)';
    ctx.shadowBlur = s > 0.78 ? 20 : 8;
    ctx.strokeStyle = s > 0.78 ? 'rgba(160,255,235,0.95)' : 'rgba(63,224,197,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Welle: klar bei gutem Signal, verrauscht sonst
    const wy = H * 0.86, ww = W * 0.84, wx = (W - ww) / 2, amp = H * 0.06;
    ctx.strokeStyle = 'rgba(63,224,197,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(63,224,197,0.8)';
    ctx.shadowBlur = 6 * s;
    ctx.strokeStyle = `rgba(${Math.round(120 + 100 * s)},240,225,0.9)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const u = i / 160;
      const y = wy + Math.sin(u * Math.PI * 10 + time * 8) * amp * s + (Math.random() - 0.5) * amp * 1.4 * (1 - s);
      if (i) ctx.lineTo(wx + u * ww, y); else ctx.moveTo(wx, y);
    }
    ctx.stroke();
    ctx.restore();

    if (lock >= LOCK_NEED || time >= DURATION) { finish(false); return; }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame((t) => { last = t; draw(t); });
}
