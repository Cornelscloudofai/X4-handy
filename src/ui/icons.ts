// Linien-Icons (24er Raster, currentColor)
const P: Record<string, string> = {
  sector: '<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/>',
  station: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/><path d="M12 8.5 15.5 12 12 15.5 8.5 12z" fill="currentColor"/>',
  fleet: '<path d="M4 17 20 12 4 7l3 5z"/><path d="M7 12h6"/>',
  missions: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
  market: '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.5"/><path d="M5.5 6.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/><path d="M5.5 11.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5"/>',
  planner: '<rect x="2.5" y="4" width="6" height="5" rx="1"/><rect x="2.5" y="15" width="6" height="5" rx="1"/><rect x="15.5" y="9.5" width="6" height="5" rx="1"/><path d="M8.5 6.5c4 0 3 5.5 7 5.5M8.5 17.5c4 0 3-5.5 7-5.5"/>',
  more: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  routes: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  warn: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  wrench: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  wallet: '<path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z"/><path d="M4 7.5 15 4v3.5"/><circle cx="16" cy="13.5" r="1.2" fill="currentColor"/>',
  play: '<path d="M7 5v14l11-7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  factory: '<path d="M3.5 20V10l5 3V10l5 3V6h7v14z"/><path d="M16 9.5h2"/>',
  storage: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/>',
  dock: '<path d="M4 12h8M12 6v12M12 12l8-5M12 12l8 5"/>',
  miner: '<path d="M3.5 15.5 14 10l-2 7z"/><path d="m14 10 6.5-5M16.5 15l3 3"/>',
  trader: '<rect x="3.5" y="8" width="11" height="8" rx="1"/><path d="M14.5 10.5h3l3 3v2.5h-6"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  galaxy: '<circle cx="12" cy="12" r="2.2"/><path d="M12 3.5c5 0 8.5 3.5 8.5 6.5M12 20.5c-5 0-8.5-3.5-8.5-6.5M3.5 10c0-3 3.5-6.5 8.5-6.5M20.5 14c0 3-3.5 6.5-8.5 6.5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  arrowRight: '<path d="M4 12h15M14 7l5 5-5 5"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.3"/>',
  save: '<path d="M5 4.5h11l3.5 3.5V19.5H5z"/><path d="M8 4.5v5h7v-5M8 19.5v-5.5h8v5.5"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1.5S12 9 12 9s6-1 6-3.5-4-2.5-6 3.5"/>',
  energy: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
};

export function icon(name: keyof typeof P | string, size = 20, cls = ''): string {
  const body = P[name] ?? P.info;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function wareDot(color: string, size = 10): string {
  return `<span class="ware-dot" style="--c:${color};width:${size}px;height:${size}px"></span>`;
}
