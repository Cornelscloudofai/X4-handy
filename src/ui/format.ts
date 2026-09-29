export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

/** Kurzform für Credits: 4,8 Mio Cr */
export function fmtCr(n: number, withUnit = true): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  let s: string;
  if (a >= 1e9) s = fmtNum(a / 1e9, a >= 1e10 ? 1 : 2) + ' Mrd';
  else if (a >= 1e6) s = fmtNum(a / 1e6, a >= 1e8 ? 0 : 1) + ' Mio';
  else if (a >= 1e4) s = fmtNum(a / 1e3, 0) + ' Tsd';
  else s = fmtInt(a);
  return sign + s + (withUnit ? ' Cr' : '');
}

export function fmtAmount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return fmtNum(n / 1e6, 1) + ' Mio';
  if (a >= 1e5) return fmtNum(n / 1e3, 0) + ' Tsd';
  return fmtInt(n);
}

/** Dauer: 45 s, 12 min, 3 h 20 min */
export function fmtDur(sec: number): string {
  if (!isFinite(sec)) return '–';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 48) return mm ? `${h} h ${mm} min` : `${h} h`;
  return `${fmtNum(h / 24, 1)} Tage`;
}

/** Spielzeit als Tag und Uhrzeit */
export function fmtClock(sec: number): string {
  const day = Math.floor(sec / 86400) + 1;
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `Tag ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function pct(n: number): string {
  return Math.round(n * 100) + ' %';
}
