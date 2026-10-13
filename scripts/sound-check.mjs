// Klangprüfung: alle (oder per Muster gefilterten) Klänge offline rendern, Spitzen-/RMS-Pegel ausgeben und als WAV-Hörprobe speichern
// node scripts/sound-check.mjs <ausgabeordner> [muster] [datei.wav]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { launchOpts } from './browser.mjs';
import { distUrl } from './serve.mjs';
const out = process.argv[2], filter = process.argv[3] ? new RegExp(process.argv[3]) : null, file = process.argv[4] ?? 'klangprobe.wav';
const browser = await chromium.launch(launchOpts());
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(await distUrl());
await page.waitForTimeout(800);
const res = await page.evaluate(async (flt) => {
  const A = window.__audio;
  await A.ready();
  const re = flt ? new RegExp(flt) : null;
  const rows = [], parts = [];
  for (let i = 0; i < A.names.length; i++) {
    if (re && !re.test(A.names[i])) continue;
    // Waffen dreimal hintereinander (wie Dauerfeuer), sonst einmal
    const buf = await A.render(i, 3);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum = 0, last = 0, lo = 0, hi = 0, lp = 0, lp2 = 0;
    // Klangfarbe grob: Anteil der Energie unter 250 Hz (Bass) und über 2 kHz (Höhen)
    const kl = 1 - Math.exp(-2 * Math.PI * 250 / buf.sampleRate), kh = 1 - Math.exp(-2 * Math.PI * 2000 / buf.sampleRate);
    for (let k = 0; k < L.length; k++) {
      const v = Math.max(Math.abs(L[k]), Math.abs(R[k])); peak = Math.max(peak, v); sum += (L[k] * L[k] + R[k] * R[k]) / 2; if (v > 0.001) last = k;
      const m = (L[k] + R[k]) / 2; lp += kl * (m - lp); lp2 += kh * (m - lp2); lo += lp * lp; hi += (m - lp2) * (m - lp2);
    }
    rows.push({ i: i + 1, name: A.names[i], peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sum / Math.max(1, last) + 1e-12)).toFixed(1), dur: +(last / buf.sampleRate).toFixed(2), bass: Math.round((lo / Math.max(1e-12, sum)) * 100), hoch: Math.round((hi / Math.max(1e-12, sum)) * 100) });
    parts.push([L.slice(0, last + 2000), R.slice(0, last + 2000)]);
  }
  const sr = 44100, gap = Math.floor(sr * 0.5);
  const total = parts.reduce((n, p) => n + p[0].length + gap, 0);
  const pcm = new Int16Array(total * 2);
  let o = 0;
  for (const [L, R] of parts) { for (let k = 0; k < L.length; k++) { pcm[(o + k) * 2] = Math.max(-1, Math.min(1, L[k])) * 32767; pcm[(o + k) * 2 + 1] = Math.max(-1, Math.min(1, R[k])) * 32767; } o += L.length + gap; }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return { rows, pcm: btoa(bin), sr };
}, process.argv[3] ?? '');
for (const r of res.rows) console.log(String(r.i).padStart(2), r.name.padEnd(20), 'Spitze', String(r.peakDb).padStart(6), 'dB  RMS', String(r.rmsDb).padStart(6), 'dB ', r.dur, 's  Bass', r.bass + ' %  Mitten', (100 - r.bass - r.hoch) + ' %  Höhen', r.hoch + ' %');
const data = Buffer.from(res.pcm, 'base64');
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(res.sr, 24); h.writeUInt32LE(res.sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
writeFileSync(`${out}/${file}`, Buffer.concat([h, data]));
console.log('Fehler', errors);
await browser.close();
