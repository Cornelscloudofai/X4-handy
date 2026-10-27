// Peil-Minispiel: Mit der Richtantenne (Wischen auf dem Radar) und der Frequenz (seitlich Wischen auf der Welle) ein
// schwaches Torsignal suchen und halten. Richtung allein reicht nicht: Ist die Frequenz verstimmt, schwebt die Welle
// (Schwebung) und das Signal bleibt schwach. Jedes Gebiet stört anders:
//   Split-Raum   – nur Drift und gelegentliche Sprünge (zum Lernen)
//   Glutsee      – Sonnenstürme: kurz vorher blinkt der Rand, danach ist das Signal verrutscht
//   Schweig. Band – Echos: mehrere Punkte auf dem Radar, nur einer ist das Tor (die Echos stottern auf der Welle)
//   Kristallgrenze – Brechung: der Punkt erscheint versetzt, solange die Frequenz nicht stimmt
//   Abgrund      – Puls: das Tor sendet nur im Takt (kurz, kurz, lang) – dazu ein Echo
// Dazu taucht manchmal ein Nebensignal auf (ein Wrack): Wer es kurz anpeilt, lässt es den Späher bergen – verliert aber
// Zeit für die eigentliche Peilung. Wer nicht auf dem Signal bleibt, verliert langsam Peilung.
import type { RegionId } from '../data/frontier';
import { sfx } from './sound';

export type PeilRegion = RegionId | 'split';

export interface PeilResult { bonus: number; salvage: boolean }

export interface PeilOpts {
  /** Sektor, in dem gepeilt wird (Anzeige) */
  sector: string;
  /** Gebiet bestimmt die Störung */
  region: PeilRegion;
  /** 0…1: Schwierigkeit (Erkundungsfortschritt) */
  depth: number;
  onDone: (r: PeilResult) => void;
  onCancel: () => void;
}

const DURATION = 35;
const LOCK_NEED = 6;
const LOCK_AT = 0.72;
const WIDTH = 0.22; // Breite des Antennenkegels (rad)
const SALVAGE_NEED = 1.6;
const TAU = Math.PI * 2;

const MODES: Record<PeilRegion, { title: string; tip: string }> = {
  split: { title: 'Ruhiges Signal', tip: 'Richte die Antenne aus und stimm die Frequenz ab, bis die Welle gleichmäßig schwingt.' },
  glut: { title: 'Sonnensturm', tip: 'Blinkt der Rand rot, kommt ein Sturm. Danach liegt das Signal woanders – such es neu.' },
  band: { title: 'Echos', tip: 'Mehrere Punkte, nur einer ist das Tor. Echos stottern auf der Welle und kosten Peilung.' },
  kristall: { title: 'Brechung', tip: 'Der Kristall verbiegt das Signal: Der Punkt liegt erst richtig, wenn die Frequenz stimmt.' },
  abgrund: { title: 'Puls', tip: 'Das Tor sendet nur im Takt: kurz, kurz, lang. Dazwischen ist Stille – und ein Echo.' },
};

/** Sendetakt im Abgrund: an/aus in Sekunden */
const PULSE = [0.35, 0.3, 0.35, 0.3, 1.0, 1.4];
const PULSE_LEN = PULSE.reduce((a, b) => a + b, 0);
const pulseOn = (t: number) => {
  let x = t % PULSE_LEN;
  for (let i = 0; i < PULSE.length; i++) { if (x < PULSE[i]) return i % 2 === 0; x -= PULSE[i]; }
  return false;
};

/** Für automatische Tests: Zustand und Steuerung */
interface PeilTest {
  mode: PeilRegion; target: number; antenna: number; freq: number; tf: number;
  ghosts: { a: number; f: number }[]; side: { a: number; t: number } | null;
  set(a: number): void; setFreq(f: number): void; start(): void;
}
declare global { interface Window { __peil?: PeilTest } }

const angDist = (a: number, b: number) => Math.abs((((a - b) % TAU) + TAU * 1.5) % TAU - Math.PI);
const dirStrength = (antenna: number, a: number) => Math.exp(-((Math.max(0, angDist(antenna, a) - 0.02) / WIDTH) ** 2));
const clamp01 = (x: number) => Math.max(0.04, Math.min(0.96, x));

export function runPeilung(o: PeilOpts): void {
  document.getElementById('peilung')?.remove();
  const mode = o.region;
  const info = MODES[mode];
  const depth = Math.max(0, Math.min(1, o.depth));
  const root = document.createElement('div');
  root.id = 'peilung';
  root.className = `peil m-${mode}`;
  root.innerHTML = `
    <div class="peil-head"><div><span>Peilung · ${info.title}</span><b>${o.sector}</b></div><button class="peil-x" aria-label="Abbrechen">×</button></div>
    <canvas class="peil-cv"></canvas>
    <div class="peil-help">Radar: Antenne drehen · Welle: seitlich wischen für die Frequenz</div>
    <div class="peil-lock"><i></i><span>Peilung 0 %</span></div>
    <div class="peil-brief"><span>Störung</span><b>${info.title}</b><p>${info.tip}</p><button class="btn primary" data-peil="start">Peilung starten</button></div>
    <div class="peil-end" hidden></div>`;
  (document.getElementById('app') ?? document.body).appendChild(root);
  const cv = root.querySelector<HTMLCanvasElement>('.peil-cv')!;
  const ctx = cv.getContext('2d')!;
  const lockBar = root.querySelector<HTMLElement>('.peil-lock i')!;
  const lockTxt = root.querySelector<HTMLElement>('.peil-lock span')!;
  const help = root.querySelector<HTMLElement>('.peil-help')!;
  const end = root.querySelector<HTMLElement>('.peil-end')!;
  const brief = root.querySelector<HTMLElement>('.peil-brief')!;

  const speed = (mode === 'split' ? 0.7 : mode === 'abgrund' ? 1.25 : 1) * (1 + depth * 0.6);
  const fWidth = mode === 'split' ? 0.13 : 0.085 - depth * 0.02;
  let target = Math.random() * TAU;
  let drift = (Math.random() < 0.5 ? -1 : 1) * 0.25 * speed;
  let antenna = target + Math.PI * (0.6 + Math.random() * 0.6);
  let tf = 0.25 + Math.random() * 0.5;
  let freq = tf + (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.15);
  freq = clamp01(freq);
  let lock = 0, time = 0, glitch = 0, nextJump = 7 + Math.random() * 5, lastPing = 0;
  // Sonnensturm
  let nextStorm = 7 + Math.random() * 3, storm = 0, warn = 0;
  // Echos (Band: 2–3, Abgrund: 1)
  const ghosts: { a: number; f: number; d: number }[] = [];
  const nGhosts = mode === 'band' ? (depth > 0.5 ? 3 : 2) : mode === 'abgrund' ? 1 : 0;
  for (let i = 0; i < nGhosts; i++) {
    ghosts.push({ a: target + (i + 1) * (TAU / (nGhosts + 1)) + (Math.random() - 0.5) * 0.6, f: clamp01(tf + (Math.random() < 0.5 ? -1 : 1) * (0.14 + Math.random() * 0.14)), d: (Math.random() - 0.5) * 0.5 * speed });
  }
  // Nebensignal (Wrack)
  const sideAt = Math.random() < (mode === 'split' ? 0.35 : 0.55) ? 7 + Math.random() * 10 : Infinity;
  let side: { a: number; t: number; got: number } | null = null;
  let salvage = false;
  let echoHit = 0, salvMsg = 0;
  let started = false, running = true, last = performance.now();
  const noise: { a: number; r: number; l: number }[] = [];

  window.__peil = {
    mode,
    get target() { return target; }, get antenna() { return antenna; }, get freq() { return freq; }, get tf() { return tf; },
    get ghosts() { return ghosts.map((g) => ({ a: g.a, f: g.f })); },
    get side() { return side && side.t > 0 ? { a: side.a, t: side.t } : null; },
    set(a: number) { antenna = a; }, setFreq(f: number) { freq = clamp01(f); }, start() { begin(); },
  } as PeilTest;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);

  const geo = () => {
    const r = cv.getBoundingClientRect();
    const W = r.width, H = r.height;
    return { r, W, H, cx: W / 2, cy: H * 0.38, R: Math.min(W, H * 0.72) * 0.42, wy: H * 0.86 };
  };
  // Steuerung: Radar = Richtung (Finger zeigt), Wellenfeld = Frequenz (seitlich wischen), sonst seitlich = Drehen
  let drag: { x: number; a: number; f: number; zone: 'scope' | 'wave' | 'free' } | null = null;
  const local = (e: PointerEvent) => { const g = geo(); return { g, x: e.clientX - g.r.left, y: e.clientY - g.r.top }; };
  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button') || !started) return;
    const { g, x, y } = local(e);
    const zone = Math.hypot(x - g.cx, y - g.cy) < g.R * 1.15 ? 'scope' : y > g.cy + g.R * 1.1 ? 'wave' : 'free';
    drag = { x: e.clientX, a: antenna, f: freq, zone };
    if (zone === 'scope') antenna = Math.atan2(y - g.cy, x - g.cx);
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { g, x, y } = local(e);
    if (drag.zone === 'scope') antenna = Math.atan2(y - g.cy, x - g.cx);
    else if (drag.zone === 'wave') freq = clamp01(drag.f + (e.clientX - drag.x) / (g.W * 1.4));
    else antenna = drag.a + (e.clientX - drag.x) * 0.012;
  });
  const up = () => { drag = null; };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);

  const begin = () => {
    if (started) return;
    started = true;
    brief.remove();
    last = performance.now();
  };
  brief.querySelector('[data-peil="start"]')!.addEventListener('click', begin);

  const finish = (cancelled: boolean) => {
    if (!running) return;
    running = false;
    window.removeEventListener('resize', size);
    const bonus = Math.min(1, lock / LOCK_NEED);
    if (cancelled) { root.remove(); delete window.__peil; o.onCancel(); return; }
    const chance = Math.round((0.3 + bonus * 0.7) * 100);
    if (bonus >= 1) sfx.success();
    end.hidden = false;
    const head = bonus >= 1 ? 'Peilung gehalten' : bonus > 0.4 ? 'Teilweise gepeilt' : 'Signal verloren';
    end.innerHTML = `<b>${head}</b><span>Peilung ${Math.round(bonus * 100)} % · Fundchance ${chance} %</span>${salvage ? '<span class="peil-salv">Wrack geortet – der Späher birgt es unterwegs.</span>' : ''}<button class="btn primary" data-peil="go">Späher losschicken</button>`;
    end.querySelector('[data-peil="go"]')!.addEventListener('click', () => { root.remove(); delete window.__peil; o.onDone({ bonus, salvage }); });
  };
  root.querySelector('.peil-x')!.addEventListener('click', () => finish(true));

  const draw = (now: number) => {
    if (!running) return;
    const dt = started ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    const { W, H, cx, cy, R, wy } = geo();

    // ---- Bewegung und Störungen ----
    target += drift * dt * (0.6 + 0.4 * Math.sin(time * 0.7));
    if (Math.random() < dt * 0.25) drift = -drift;
    tf = clamp01(tf + Math.sin(time * 0.31) * dt * 0.012 * speed);
    for (const g of ghosts) g.a += g.d * dt;
    if (mode === 'split') {
      nextJump -= dt;
      if (nextJump <= 0) { target += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); nextJump = 8 + Math.random() * 6; glitch = 0.6; }
    }
    if (mode === 'glut' && started) {
      if (storm > 0) {
        storm -= dt;
        if (storm <= 0) { target += (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.7); tf = clamp01(tf + (Math.random() - 0.5) * 0.3); glitch = 0.4; }
      } else if (warn > 0) {
        warn -= dt;
        if (warn <= 0) storm = 2.4;
      } else {
        nextStorm -= dt;
        if (nextStorm <= 0) { warn = 1.8; nextStorm = 9 + Math.random() * 3 - depth * 2; sfx.warn(); }
      }
    }
    glitch = Math.max(0, glitch - dt);
    const sending = mode !== 'abgrund' || pulseOn(time);
    const freqS = Math.exp(-(((freq - tf) / fWidth) ** 2));
    const stormDamp = storm > 0 ? 0.1 : 1;
    const raw = dirStrength(antenna, target) * (0.2 + 0.8 * freqS);
    const s = raw * stormDamp * (glitch > 0 ? 0.3 : 1) * (sending ? 1 : 0);
    // Echos: auf ein Echo gepeilt kostet Peilung
    let ghostS = 0;
    for (const g of ghosts) ghostS = Math.max(ghostS, dirStrength(antenna, g.a) * (0.2 + 0.8 * Math.exp(-(((freq - g.f) / fWidth) ** 2))));
    const onEcho = ghostS > LOCK_AT && ghostS > s;
    // Nebensignal
    if (!side && time >= sideAt) {
      side = { a: target + (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.4), t: 7, got: 0 };
      sfx.ping();
    }
    let onSide = false;
    if (side && side.t > 0 && !salvage) {
      side.t -= dt;
      if (dirStrength(antenna, side.a) > 0.75) {
        onSide = true;
        side.got += dt;
        if (side.got >= SALVAGE_NEED) { salvage = true; side.t = 0; salvMsg = 2.5; sfx.pickup(); }
      }
    }

    if (s > LOCK_AT && !onSide) {
      lock += dt;
      if (now - lastPing > 650) { sfx.tick(); lastPing = now; }
    } else if (started && storm <= 0 && sending) {
      // Wer das Signal verliert, verliert langsam Peilung – auf einem Echo schneller
      lock = Math.max(0, lock - dt * (onEcho ? 0.7 : s < 0.3 ? 0.18 : 0));
    }
    if (onEcho) echoHit = 0.5; else echoHit = Math.max(0, echoHit - dt);
    salvMsg = Math.max(0, salvMsg - dt);
    const frac = Math.min(1, lock / LOCK_NEED);
    lockBar.style.width = `${(frac * 100).toFixed(1)}%`;
    lockTxt.textContent = `Peilung ${Math.round(frac * 100)} % · noch ${Math.max(0, Math.ceil(DURATION - time))} s`;
    root.classList.toggle('locked', s > LOCK_AT && !onSide);
    root.classList.toggle('warn', warn > 0);
    root.classList.toggle('storm', storm > 0);
    help.textContent = warn > 0 ? 'Sonnensturm zieht auf …' : storm > 0 ? 'Sturm – das Signal geht unter' : echoHit > 0 ? 'Echo – das ist nicht das Tor' : onSide ? 'Nebensignal: Wrack wird geortet …' : salvMsg > 0 ? 'Wrack geortet – der Späher birgt es unterwegs' : freqS < 0.35 && raw < LOCK_AT && dirStrength(antenna, target) > 0.6 ? 'Richtung stimmt – Frequenz abstimmen' : 'Radar: Antenne drehen · Welle: seitlich wischen für die Frequenz';

    // ---- Radar ----
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, storm > 0 ? 'rgba(60,24,14,0.92)' : 'rgba(10,40,44,0.9)');
    bg.addColorStop(1, 'rgba(3,12,18,0.95)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(63,224,197,0.18)';
    ctx.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.12, cy + Math.sin(a) * R * 0.12); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    // Rauschen (stärker, je schwächer das Signal; im Sturm sehr stark)
    const nRate = storm > 0 ? 8 : 0.8;
    for (let k = 0; k < nRate; k++) if (Math.random() < 0.8) noise.push({ a: Math.random() * TAU, r: Math.random() * R, l: 0.6 });
    for (let i = noise.length - 1; i >= 0; i--) {
      const n = noise[i];
      n.l -= dt || 0.016;
      if (n.l <= 0) { noise.splice(i, 1); continue; }
      ctx.fillStyle = storm > 0 ? `rgba(255,170,120,${(n.l * 0.7).toFixed(3)})` : `rgba(150,230,220,${(n.l * 0.5 * (1 - s * 0.8)).toFixed(3)})`;
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
    // Signalpunkte: sichtbar, wenn die Antenne in der Nähe ist (Brechung: versetzt, solange die Frequenz nicht stimmt)
    const blip = (a: number, vis: number, rgb: string, rr = 0.72) => {
      if (vis <= 0.03) return;
      const bx = cx + Math.cos(a) * R * rr, by = cy + Math.sin(a) * R * rr;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, 22);
      g.addColorStop(0, `rgba(${rgb},${vis.toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, 22, 0, TAU); ctx.fill();
      const p = (time * 1.4) % 1;
      ctx.strokeStyle = `rgba(${rgb},${(vis * (1 - p)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(bx, by, 5 + p * 22, 0, TAU); ctx.stroke();
    };
    const shown = mode === 'kristall' ? target + (freq - tf) * 5 : target;
    const near = (a: number) => Math.min(1, Math.exp(-((angDist(antenna, a) / (WIDTH * 2.2)) ** 2)) * 1.4);
    blip(shown, near(shown) * stormDamp * (sending ? 1 : 0.08), '200,240,255');
    for (const g of ghosts) blip(g.a, near(g.a) * stormDamp * (mode === 'abgrund' ? (sending ? 0.15 : 1) : 1), '200,240,255', 0.62);
    if (side && side.t > 0 && !salvage) {
      blip(side.a, 0.35 + 0.65 * near(side.a), '255,190,90', 0.5);
      const ga = side.got / SALVAGE_NEED;
      if (ga > 0) {
        const bx = cx + Math.cos(side.a) * R * 0.5, by = cy + Math.sin(side.a) * R * 0.5;
        ctx.strokeStyle = 'rgba(255,200,110,0.95)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(bx, by, 16, -Math.PI / 2, -Math.PI / 2 + ga * TAU); ctx.stroke();
      }
    }
    // Rand: leuchtet bei Peilung, blinkt rot vor dem Sturm
    ctx.save();
    const warnOn = warn > 0 && Math.floor(time * 6) % 2 === 0;
    ctx.shadowColor = warnOn ? 'rgba(255,90,60,0.95)' : s > LOCK_AT ? 'rgba(120,255,225,0.9)' : 'rgba(63,224,197,0.4)';
    ctx.shadowBlur = warnOn || s > LOCK_AT ? 20 : 8;
    ctx.strokeStyle = warnOn ? 'rgba(255,110,80,0.95)' : s > LOCK_AT ? 'rgba(160,255,235,0.95)' : 'rgba(63,224,197,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.restore();
    // Sendetakt im Abgrund
    if (mode === 'abgrund') {
      const x0 = cx - R * 0.6, w = R * 1.2, y0 = cy + R + 14;
      let x = 0;
      const ph = (time % PULSE_LEN) / PULSE_LEN;
      for (let i = 0; i < PULSE.length; i++) {
        const len = (PULSE[i] / PULSE_LEN) * w;
        if (i % 2 === 0) { ctx.fillStyle = 'rgba(190,150,255,0.55)'; ctx.fillRect(x0 + x, y0, len - 2, 4); }
        x += len;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(x0 + ph * w - 1, y0 - 3, 2, 10);
    }

    // ---- Welle und Frequenzskala ----
    const ww = W * 0.84, wx = (W - ww) / 2, amp = H * 0.05;
    ctx.strokeStyle = 'rgba(63,224,197,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.stroke();
    // Skala mit Schieber
    const sy = wy + amp * 1.9;
    ctx.strokeStyle = 'rgba(63,224,197,0.35)';
    ctx.beginPath(); ctx.moveTo(wx, sy); ctx.lineTo(wx + ww, sy); ctx.stroke();
    for (let i = 0; i <= 20; i++) { const x = wx + (i / 20) * ww; ctx.beginPath(); ctx.moveTo(x, sy - (i % 5 ? 3 : 6)); ctx.lineTo(x, sy); ctx.stroke(); }
    ctx.fillStyle = freqS > 0.7 ? '#bff7ec' : '#7fd3c4';
    const fx = wx + freq * ww;
    ctx.beginPath(); ctx.moveTo(fx, sy - 9); ctx.lineTo(fx - 6, sy + 4); ctx.lineTo(fx + 6, sy + 4); ctx.closePath(); ctx.fill();
    // Welle: Schwebung bei verstimmter Frequenz, Stottern auf einem Echo
    const shownS = Math.max(s, onEcho ? ghostS * 0.9 : 0);
    const beat = (1 - freqS) * 7;
    ctx.save();
    ctx.shadowColor = 'rgba(63,224,197,0.8)';
    ctx.shadowBlur = 6 * shownS;
    ctx.strokeStyle = onEcho ? 'rgba(255,200,170,0.9)' : `rgba(${Math.round(120 + 100 * shownS)},240,225,0.9)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const dirOnly = Math.max(dirStrength(antenna, target) * stormDamp * (sending ? 1 : 0), onEcho ? ghostS : 0);
    for (let i = 0; i <= 180; i++) {
      const u = i / 180;
      const env = 0.25 + 0.75 * Math.abs(Math.cos(u * Math.PI * beat + time * 2.2));
      let ph = u * Math.PI * 12 + time * 8;
      if (onEcho && Math.floor(u * 9 + time * 3) % 3 === 0) ph += Math.PI * 0.8;
      const y = wy + Math.sin(ph) * amp * dirOnly * (freqS > 0.85 ? 1 : env) + (Math.random() - 0.5) * amp * 0.9 * (1 - shownS);
      if (i) ctx.lineTo(wx + u * ww, y); else ctx.moveTo(wx, y);
    }
    ctx.stroke();
    ctx.restore();

    if (started && (lock >= LOCK_NEED || time >= DURATION)) { finish(false); return; }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame((t) => { last = t; draw(t); });
}
