// Hangar „Dein Schiff“ (Kampf-Minispiel): das Schiff steht auf der Landeplattform eines Hangars, die Einbauplätze
// sind als Plaketten mit Leitlinie zum Bauteil markiert. Antippen öffnet eine Schublade mit Karten (das Schiff
// bleibt darüber sichtbar); jede Karte zeigt die Änderung zum Eingebauten, Antippen baut sofort ein. Die Werteleiste
// zeigt die Änderung seit dem letzten Einbau. Zwei Modi: Ausrüstung (Waffen, Raketen, Schild, Türme) und Werkstatt
// (vier Mod-Sockel). Navigation: höchstens eine Ebene (Hangar → Schublade); Zurück schließt immer zuerst die Schublade.
import {
  LTURRET_IDS, LTURRETS, MISSILE_DMG, MISSILE_IDS, MISSILES, SHIELD_IDS, SHIELDS, SHIP_IDS, SHIPS, SPECIALS, TURRET_IDS, TURRETS, WEAPON_IDS, WEAPONS,
  loadout, sustainedDps, weaponGun, type Loadout, type ShipId, type X4Gun,
} from '../minigames/loadout';
import { MODS, MOD_IDS, QUALITY, SLOTS, SLOT_INFO, fmtRange, fmtStat, modRange, modState, modStats, refundOf, type ModSlot, type ModStat } from '../minigames/mods';
import { fighterKind, shipArt, spriteUrl } from '../render/shipArt';
import hangarDeck from '../assets/hangar/hangar-deck.jpg';
import werkstattDeck from '../assets/hangar/werkstatt-deck.jpg';
import { esc } from './dom';
import { icon } from './icons';

export type LoView = 'home' | 'ship' | 'weapon' | 'turret' | 'lturret' | 'missile' | 'shield' | 'mod' | 'art';
export type LoMode = 'gear' | 'mods';
export interface HangarStats { fire: number; hull: number; shield: number; speed: number; range: number }
export interface LoModal {
  view?: LoView; slot?: ModSlot; fresh?: ModSlot; rollN?: number;
  /** Ausrüstung oder Werkstatt */
  mode?: LoMode;
  /** Werte vor dem letzten Einbau (für die Vorschau in der Werteleiste) */
  prev?: HangarStats;
  /** Ausrüstung vor dem letzten Einbau (Rückgängig) */
  undo?: Partial<Loadout>;
}

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
const num = (n: number, digits = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
const km = (g: X4Gun) => (g.v * g.life) / 1000;
/** X4-Schildkapazität der Mamba (2 × S à 740) – Schiffswerte sind relativ dazu */
const MAMBA_SHIELD = 1480;

/** Änderung zum Eingebauten als kleines Etikett: grün besser, rot schlechter (lower = kleiner ist besser) */
function delta(v: number, cur: number, fmt: (d: number) => string, lower = false): string {
  const d = v - cur;
  if (Math.abs(d) < Math.max(1e-6, Math.abs(cur) * 0.005)) return '';
  const good = lower ? d < 0 : d > 0;
  return `<span class="lo-d ${good ? 'pos' : 'neg'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`;
}
const pct = (v: number, cur: number, lower = false) => (cur > 0 ? delta(v / cur, 1, (d) => `${Math.round(d * 100)} %`, lower) : '');

/** Datenzeile einer Waffe: Schaden, Takt, Salve/Magazin, Dauerleistung, Reichweite */
function gunData(g: X4Gun, beam = false): string {
  return beam
    ? `${num(g.dmg)} Schaden/s · Dauerstrahl`
    : `${num(g.dmg)}${g.amt > 1 ? ` × ${g.amt}` : ''} Schaden · ${g.mag === 1 ? 'Einzelschuss' : `${num(g.rate, 1)} Schuss/s`}${g.mag > 1 ? ` · ${g.mag}er-Salve, ${num(g.reload, 1)} s Pause` : g.mag === 1 ? `, ${num(g.reload, 1)} s Aufladen` : ''} · ${num(km(g), 1)} km`;
}

// ---------- Kartenzeichen (bis eigene Bilder da sind) ----------
const GLYPH: Record<string, string> = {
  gun: '<path d="M4 14h11l3-3h2v6h-2l-3-3"/><path d="M7 14v4"/>',
  gatling: '<path d="M4 10h12M4 13h12M4 16h12"/><path d="M16 9h3v8h-3"/>',
  beam: '<path d="M3 12h18"/><path d="M3 9h4M3 15h4"/><circle cx="5" cy="12" r="2"/>',
  scatter: '<path d="M4 12l16-6M4 12h16M4 12l16 6"/>',
  lance: '<path d="M2 12h20"/><path d="M16 8l6 4-6 4"/>',
  plasma: '<circle cx="15" cy="12" r="5"/><path d="M2 12h8"/>',
  rocket: '<path d="M12 3c3 3 4 7 3 12h-6C8 10 9 6 12 3z"/><path d="M9 15l-2 4M15 15l2 4M12 15v5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  turret: '<circle cx="12" cy="14" r="6"/><path d="M12 8V2"/>',
  mod: '<path d="M12 2l3 5h6l-3 5 3 5h-6l-3 5-3-5H3l3-5-3-5h6z"/>',
  engine: '<path d="M8 4h8v8l-4 8-4-8z"/>',
  hull: '<path d="M4 8l8-5 8 5v8l-8 5-8-5z"/>',
  ship: '<path d="M12 2l4 9 5 4-9 3-9-3 5-4z"/>',
};
const glyph = (k: string, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[k] ?? GLYPH.gun}</svg>`;
const WEAPON_LOOK: Record<string, [string, string]> = {
  puls: ['gun', '#3fe0c5'], bolzen: ['gun', '#9fe870'], schrot: ['scatter', '#ffb547'], strahl: ['beam', '#5fb4ff'], plasma: ['plasma', '#ff6a3d'],
  neutron: ['gatling', '#7fd8ff'], tau: ['scatter', '#ffd27a'], thermal: ['gun', '#ff8a5c'], boson: ['lance', '#c58bff'],
  plasmaschnell: ['plasma', '#ff8a3d'], plasmasalve: ['plasma', '#ff5c3d'],
};
const MISSILE_LOOK: Record<string, string> = { lenk: '#ffb070', schwer: '#ff7a3a', schwarm: '#ffd27a', stoer: '#8fe0ff' };

/** Werte des Schiffs mit Bewaffnung und Mods (für Werteleiste und Vergleich) */
export function hangarStats(lo: Loadout = loadout()): HangarStats {
  const d = SHIPS[lo.ship], mx = modStats();
  const wd = WEAPONS[lo.weapon], td = TURRETS[lo.turret], ltd = LTURRETS[lo.lturret ?? 'plasma'];
  const g = weaponGun(wd, d.gunSize);
  const m = (k: ModStat) => 1 + (mx[k] ?? 0);
  return {
    fire: (d.x4.weapons * sustainedDps(g, wd.beam) + d.turrets.length * sustainedDps(td.gun, td.beam) + (d.lMounts?.length ?? 0) * sustainedDps(ltd.gun)) * m('dmg') * m('rate'),
    hull: d.x4.hull * m('hull'),
    shield: d.shield * MAMBA_SHIELD * SHIELDS[lo.shield].cap * m('shield'),
    speed: d.x4.v * m('speed'),
    range: (wd.beam ? 1.6 : km(g)) * m('velocity'),
  };
}

/** Lage der Bauteile im Schiffsbild (Anteile des Bildes, Bug oben) */
function anchors(id: ShipId): Record<string, [number, number]> {
  const d = SHIPS[id], s = d.size;
  const gx = d.guns.length ? Math.min(...d.guns.map(Math.abs)) : 0;
  const t = d.turrets[0] ?? [0, 0];
  return {
    weapon: [0.5 - Math.min(0.2, (gx / s) * 0.87), 0.5 - (d.gunFwd ?? 0.3) * 0.87],
    missile: [0.5 + Math.min(0.2, ((d.launcherPos?.[d.launcherPos.length - 1] ?? 0) / s) * 0.87), 0.5],
    turret: [0.5 + (t[0] / s) * 0.87, 0.5 + (t[1] / s) * 0.87],
    lturret: [0.36, 0.42],
    shield: [0.3, 0.6],
    engine: [0.5, 0.86],
    chassis: [0.64, 0.55],
    // Mod-Sockel der Werkstatt
    'mod-weapon': [0.5, 0.3], 'mod-engine': [0.5, 0.84], 'mod-shield': [0.32, 0.6], 'mod-chassis': [0.68, 0.6],
  };
}

// ---------- Ansicht ----------
export function loadoutView(m: LoModal): string {
  const lo = loadout();
  const ship = SHIPS[lo.ship];
  const mode: LoMode = m.mode ?? (m.view === 'mod' ? 'mods' : 'gear');
  const view: LoView = m.view ?? 'home';
  const open = view !== 'home';
  const ms = modState();
  const st = hangarStats(lo);
  const pic = (id: ShipId) => spriteUrl(SHIPS[id].sprite + '-ki') ?? spriteUrl(SHIPS[id].fallback + '-ki');
  const wd = WEAPONS[lo.weapon], td = TURRETS[lo.turret], ltd = LTURRETS[lo.lturret ?? 'plasma'];
  const missile = MISSILES[lo.missile ?? 'lenk'];
  const g = weaponGun(wd, ship.gunSize);

  // Plaketten am Schiff
  type Hot = { view: LoView; slot?: ModSlot; key: string; ic: string; label: string; value: string; cls?: string; color?: string };
  const hots: Hot[] = mode === 'gear'
    ? [
      { view: 'weapon', key: 'weapon', ic: WEAPON_LOOK[lo.weapon]?.[0] ?? 'gun', label: `Kanonen ${ship.x4.weapons}×${ship.gunSize.toUpperCase()}`, value: wd.name },
      ...(ship.lMounts?.length ? [{ view: 'lturret' as LoView, key: 'lturret', ic: 'turret', label: `L-Türme ${ship.lMounts.length}×`, value: ltd.name }] : []),
      ...(ship.turrets.length ? [{ view: 'turret' as LoView, key: 'turret', ic: 'turret', label: `${ship.lMounts?.length ? 'M-Türme' : 'Türme'} ${ship.turrets.length}×`, value: td.name }] : []),
      ...(ship.x4.launchers ? [{ view: 'missile' as LoView, key: 'missile', ic: 'rocket', label: `Raketen ${ship.x4.launchers}×`, value: missile.name }] : []),
      { view: 'shield', key: 'shield', ic: 'shield', label: `Schild ${ship.x4.shields}×${ship.cls}${ship.x4.mShields ? `+${ship.x4.mShields}×M` : ''}`, value: SHIELDS[lo.shield].name },
    ]
    : SLOTS.map((sl) => {
      const md = ms.slots[sl];
      return { view: 'mod' as LoView, slot: sl, key: `mod-${sl}`, ic: ({ weapon: 'gun', engine: 'engine', shield: 'shield', chassis: 'hull' } as const)[sl], label: `Sockel ${SLOT_INFO[sl].name}`, value: md ? `${MODS[md.id].name} ${fmtStat(MODS[md.id].stat, md.value).split(' ')[0]}` : 'frei', cls: `mod ${md ? 'set' : 'free'}`, color: md ? QUALITY[md.q].color : '' };
    });
  const curKey = view === 'mod' ? `mod-${m.slot ?? 'weapon'}` : view;
  const anc = anchors(lo.ship);
  const hotHtml = hots.map((h) => `<button class="hgr-hot lo-slot ${h.cls ?? ''} ${open && curKey === h.key ? 'on' : ''}" data-anchor="${anc[h.key]?.join(',') ?? '0.5,0.5'}" ${h.color ? `style="--q:${h.color}"` : ''} ${act('lo-view', h.slot ? { view: h.view, slot: h.slot } : { view: h.view })}>
      <i>${glyph(h.ic, 16)}</i><span><small>${esc(h.label)}</small><b>${esc(h.value)}</b></span></button>`).join('');

  // Werteleiste: Änderung seit dem letzten Einbau als grüner/roter Abschnitt
  const maxOf = (k: keyof HangarStats) => Math.max(...SHIP_IDS.map((id) => hangarStats({ ...lo, ship: id })[k])) * (k === 'range' ? 1.4 : 1.15);
  const gaugeHtml = (compact: boolean) => ([['fire', 'Feuerkraft', (v: number) => `${num(v)}/s`], ['hull', 'Hülle', (v: number) => num(v)], ['shield', 'Schild', (v: number) => num(v)], ['speed', 'Tempo', (v: number) => `${num(v)} m/s`], ['range', 'Reichweite', (v: number) => `${num(v, 1)} km`]] as const).map(([k, label, fmt]) => {
    const max = maxOf(k), f = (v: number) => Math.max(3, Math.min(100, Math.sqrt(v / max) * 100));
    const cur = st[k], old = m.prev ? m.prev[k] : cur;
    const up = cur > old * 1.001, down = cur < old * 0.999, lo2 = Math.min(f(cur), f(old)), hi = Math.max(f(cur), f(old));
    return `<div class="hgr-g ${up ? 'up' : down ? 'down' : ''}"><span>${label}</span><div class="hgr-bar"><b style="width:${lo2.toFixed(1)}%"></b><u style="left:${lo2.toFixed(1)}%;width:${(hi - lo2).toFixed(1)}%"></u></div><em>${fmt(cur)}</em></div>`;
  }).join('') + (compact ? '' : '');

  // ---------- Schublade ----------
  const card = (o: { key: string; value: string; on: boolean; name: string; big: string; sm: string; ds?: string; ic?: string; color?: string; img?: string }) =>
    `<button class="hgr-card ${o.on ? 'on' : ''}" style="--c:${o.color ?? 'var(--teal)'}" ${act('loadout-set', { key: o.key, value: o.value })}>
      ${o.on ? '<span class="hgr-badge">Eingebaut</span>' : ''}<span class="hgr-art">${o.img ? `<img src="${o.img}" alt="">` : glyph(o.ic ?? 'gun', 34)}</span>
      <span class="hgr-nm">${esc(o.name)}</span><span class="hgr-big">${esc(o.big)}</span><span class="hgr-sm">${esc(o.sm)}</span><span class="hgr-ds">${o.on ? '' : o.ds ?? ''}</span></button>`;
  let title = '', sub = '', body = '';
  if (view === 'ship') {
    const cur = hangarStats(lo);
    title = 'Schiff'; sub = 'Feuerkraft mit deiner Bewaffnung · seitlich blättern';
    const cards = (cls: 'S' | 'M' | 'L') => SHIP_IDS.filter((id) => SHIPS[id].cls === cls).map((id) => {
      const d = SHIPS[id], s2 = hangarStats({ ...lo, ship: id });
      return card({ key: 'ship', value: id, on: lo.ship === id, name: `${d.name} · ${d.cls}`, big: `${num(s2.fire)}/s`, sm: `${d.role} · Hülle ${num(d.x4.hull)} · ${d.x4.v} m/s`, img: pic(id), ds: `${pct(s2.fire, cur.fire) ? `<i>Feuer</i>${pct(s2.fire, cur.fire)}` : ''}${pct(s2.hull, cur.hull) ? `<i>Hülle</i>${pct(s2.hull, cur.hull)}` : ''}${delta(s2.speed, cur.speed, (x) => `${num(x)} m/s`)}` });
    }).join('');
    body = `<div class="hgr-cards">${cards('S')}${cards('M')}${cards('L')}</div>
      <div class="hgr-desc"><b>${esc(ship.name)}:</b> ${esc(ship.desc)} <span class="muted">Spezialfähigkeit: ${esc(SPECIALS[ship.special].name)} (Taste ${SPECIALS[ship.special].key}).</span></div>`;
  } else if (view === 'weapon') {
    const n = ship.x4.weapons, size = ship.gunSize, curDps = n * sustainedDps(g, wd.beam), curKm = wd.beam ? 1.6 : km(g);
    title = 'Bordkanonen'; sub = `${n} × ${size.toUpperCase()}-Waffenplatz · Werte aus X4 9.0`;
    const ids = WEAPON_IDS.filter((id) => WEAPONS[id].group !== 'schwer' || size === 'l');
    body = `<div class="hgr-cards">${ids.map((id) => {
      const d = WEAPONS[id], gg = weaponGun(d, size), dps = n * sustainedDps(gg, d.beam), r = d.beam ? 1.6 : km(gg);
      const [ic, col] = WEAPON_LOOK[id] ?? ['gun', '#3fe0c5'];
      return card({ key: 'weapon', value: id, on: lo.weapon === id, name: d.name, big: `${num(dps)}/s`, sm: d.beam ? 'Dauerstrahl' : `${num(r, 1)} km`, ic, color: col, ds: `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(r, curKm, (x) => `${num(x, 1)} km`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(wd.name)}:</b> ${esc(wd.desc)}<small>${esc(gunData(g, wd.beam))}</small></div>`;
  } else if (view === 'turret') {
    const n = ship.turrets.length, curDps = n * sustainedDps(td.gun, td.beam);
    title = ship.lMounts?.length ? 'M-Türme' : 'Türme'; sub = `${n} × M · schießen von selbst`;
    body = `<div class="hgr-cards">${TURRET_IDS.map((id) => {
      const t = TURRETS[id], dps = n * sustainedDps(t.gun, t.beam);
      return card({ key: 'turret', value: id, on: lo.turret === id, name: t.name, big: `${num(dps)}/s`, sm: `schwenkt ${t.turn}°/s`, ic: 'turret', ds: `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(t.turn, td.turn, (x) => `${num(x)}°/s`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(td.name)}:</b> ${esc(td.desc)}<small>${esc(gunData(td.gun, td.beam))}</small></div>`;
  } else if (view === 'lturret') {
    const n = ship.lMounts?.length ?? 0, curDps = n * sustainedDps(ltd.gun);
    title = 'Schwere Türme'; sub = `${n} × L an den Schultern · Werte angenommen`;
    body = `<div class="hgr-cards">${LTURRET_IDS.map((id) => {
      const t = LTURRETS[id], dps = n * sustainedDps(t.gun);
      return card({ key: 'lturret', value: id, on: (lo.lturret ?? 'plasma') === id, name: t.name, big: `${num(dps)}/s`, sm: `${num(km(t.gun), 1)} km · ${t.turn}°/s`, img: spriteUrl(t.barrel), ds: `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(km(t.gun), km(ltd.gun), (x) => `${num(x, 1)} km`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(ltd.name)}:</b> ${esc(ltd.desc)}<small>${esc(gunData(ltd.gun))}</small></div>`;
  } else if (view === 'missile') {
    const dmgOf = (d: typeof missile) => MISSILE_DMG * d.dmg * (d.split ?? 1);
    const reach = (d: typeof missile) => (d.v * d.life + (d.split ? 120 : 0)) / 1000;
    title = 'Raketen'; sub = `${ship.x4.launchers} × Werfer, Lager ${ship.x4.missiles} · Nachladen ${ship.missileReload && ship.missileReload < 1 ? Math.round(8 * ship.missileReload) : 8} s`;
    body = `<div class="hgr-cards">${MISSILE_IDS.map((id) => {
      const d = MISSILES[id];
      return card({ key: 'missile', value: id, on: (lo.missile ?? 'lenk') === id, name: d.name, big: `${d.split ? `${d.split} × ${Math.round(MISSILE_DMG * d.dmg)}` : Math.round(MISSILE_DMG * d.dmg)} Schaden`, sm: `${num(reach(d), 1)} km · ${d.slots > 1 ? `${d.slots} Plätze` : '1 Platz'}`, ic: 'rocket', color: MISSILE_LOOK[id], ds: `${delta(dmgOf(d), dmgOf(missile), (x) => `${Math.round(x)}`)}${delta(reach(d), reach(missile), (x) => `${num(x, 1)} km`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(missile.name)}</b> – ${esc(missile.role)}. ${esc(missile.desc)}</div>`;
  } else if (view === 'shield') {
    const cur = SHIELDS[lo.shield];
    title = 'Schild'; sub = `${ship.x4.shields} × ${ship.cls}${ship.x4.mShields ? ` + ${ship.x4.mShields} × M` : ''} · gilt für alle Schildplätze`;
    body = `<div class="hgr-cards">${SHIELD_IDS.map((id) => {
      const s = SHIELDS[id], cap = ship.shield * MAMBA_SHIELD * s.cap;
      return card({ key: 'shield', value: id, on: lo.shield === id, name: s.name, big: num(cap), sm: `Laden ×${String(s.regen).replace('.', ',')} · Pause ×${String(s.delay).replace('.', ',')}`, ic: 'shield', color: id === 'schwer' ? '#5fb4ff' : '#3fe0c5', ds: `${pct(s.cap, cur.cap)}${pct(s.regen, cur.regen)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(cur.name)}:</b> ${esc(cur.desc)}</div>`;
  } else if (view === 'mod') {
    const slot: ModSlot = m.slot ?? 'weapon';
    const cur = ms.slots[slot];
    title = `Mod-Sockel ${SLOT_INFO[slot].name}`; sub = `${ms.parts} Modteile · der Wert wird beim Bau ausgewürfelt`;
    const now = cur ? (() => {
      const d = MODS[cur.id], q = QUALITY[cur.q], [a, b] = modRange(cur.id, cur.q);
      return `<div class="mod-detail hgr-now" style="--q:${q.color}">
        <div class="mod-head"><b>${esc(d.name)}</b><span class="mod-q">${q.name}</span></div>
        <div class="mod-main">${esc(fmtStat(d.stat, cur.value))}</div>
        <div class="mod-roll ${m.fresh === slot ? 'fresh' : ''}" data-key="roll-${slot}-${m.rollN ?? 0}" style="--v:${(cur.roll * 100).toFixed(1)}%"><i class="bar"></i><i class="mk"></i>
          <span class="lo">${esc(fmtStat(d.stat, a))}</span><span class="hi">${esc(fmtStat(d.stat, b))}</span></div>
        ${cur.bonus.length || d.cost ? `<ul class="mod-fx">${cur.bonus.map((x) => `<li class="pos">${esc(fmtStat(x.stat, x.value))}</li>`).join('')}${d.cost ? `<li class="neg">${esc(fmtStat(d.cost[0], d.cost[1]))}</li>` : ''}</ul>` : ''}
        <button class="btn small hgr-zerlegen" ${act('mod-remove', { slot })}>${icon('trash', 15)}Zerlegen (+${refundOf(cur.q)})</button></div>`;
    })() : `<div class="mod-detail empty hgr-now"><p class="small muted" style="margin:0">Sockel frei. Wähle unten Mod und Güte – der Wert wird beim Bau ausgewürfelt, Spitzenwerte sind selten.</p></div>`;
    const short = { 1: 'Grundl.', 2: 'Fortg.', 3: 'Außerg.' } as const;
    const cards = MOD_IDS.filter((id) => MODS[id].slot === slot).map((id) => {
      const d = MODS[id], na = d.stat === 'missiles' && !ship.x4.launchers;
      return `<div class="hgr-card mod ${cur?.id === id ? 'on' : ''}"><span class="hgr-art">${glyph('mod', 24)}</span><span class="hgr-nm">${esc(d.name)}</span>
        <span class="hgr-sm wrap">${esc(d.desc)}${d.cost ? ` <span class="neg">${esc(fmtStat(d.cost[0], d.cost[1]))}</span>` : ''}${na ? ` <span class="warn-text">Wirkt nicht bei der ${esc(ship.name)}.</span>` : ''}</span>
        <span class="mod-qrow">${([1, 2, 3] as const).map((qq) => { const Q = QUALITY[qq], ok = ms.parts >= Q.cost; return `<button class="mod-qbtn2" style="--q:${Q.color}" ${ok ? act('mod-craft', { id, q: String(qq) }) : 'disabled'} title="${Q.name}"><b>${short[qq]}</b><span>${esc(fmtRange(id, qq))}</span><em>${Q.cost} ${icon('gift', 12)}</em></button>`; }).join('')}</span></div>`;
    }).join('');
    body = `${now}<div class="hgr-cards">${cards}</div>`;
  } else if (view === 'art') {
    title = 'Darstellung'; sub = 'wie dein Schiff im Kampf aussieht';
    body = `<div class="segment" style="margin:0 14px">${(['ai', 'render', 'vector'] as const).map((a) => `<button class="${shipArt() === a ? 'on' : ''}" ${act('ship-art', { art: a, kind: fighterKind() })}>${a === 'ai' ? 'KI-Bild' : a === 'render' ? 'Gerendert' : 'Gezeichnet'}</button>`).join('')}</div>
      <div class="box rows" style="margin:10px 14px 0"><div class="row tap" ${act('ship-art-open')}>${icon('star', 20)}<div class="grow"><div class="title" style="font-weight:500">Grafikvergleich der Jäger</div><div class="sub">KI-Bild, gerendert und gezeichnet nebeneinander</div></div>${icon('chev', 20, 'chev')}</div></div>`;
  }
  const where = open ? title : mode === 'mods' ? 'Werkstatt' : 'Hangar';
  const crumbs = open ? `Minispiele › Kampf › ${mode === 'mods' ? 'Werkstatt' : 'Hangar'}` : 'Minispiele › Kampf';
  const bg = mode === 'mods' ? werkstattDeck : hangarDeck;

  return `<div class="modal full hgr ${open ? 'open' : ''} hgr-${mode}" role="dialog" aria-modal="true" aria-label="Hangar" style="--hgr-bg:url('${bg}')">
    <div class="hgr-top">
      <button class="hgr-back" ${act(open ? 'lo-view' : 'mg-back', open ? { view: 'home' } : {})} aria-label="Zurück">${icon('back', 20)}</button>
      <div class="hgr-crumbs"><small>${esc(crumbs)}</small><b>${esc(where)}</b></div>
      <span class="hgr-parts">${icon('gift', 13)} ${ms.parts}</span>
      <button class="hgr-iconbtn" ${act('lo-view', { view: 'art' })} aria-label="Darstellung">${icon('star', 18)}</button>
    </div>
    <div class="segment hgr-modes">
      <button class="${mode === 'gear' ? 'on' : ''}" ${act('lo-mode', { mode: 'gear' })}>Ausrüstung</button>
      <button class="${mode === 'mods' ? 'on' : ''}" ${act('lo-mode', { mode: 'mods' })}>Werkstatt</button>
    </div>
    <div class="hgr-stage">
      <div class="hgr-ship" data-key="ship-${lo.ship}">${pic(lo.ship) ? `<img src="${pic(lo.ship)}" alt="${esc(ship.name)}">` : ''}</div>
      <svg class="hgr-lines" aria-hidden="true"></svg>
      <div class="hgr-shipbar">
        <button class="hgr-arrow" ${act('lo-ship', { dir: -1 })} aria-label="Vorheriges Schiff">${icon('back', 18)}</button>
        <button class="hgr-name" ${act('lo-view', { view: 'ship' })}><b>${esc(ship.name)}</b><small>${ship.cls} · ${esc(ship.role)} · ${esc(SPECIALS[ship.special].name)}</small><span class="hgr-dots">${SHIP_IDS.map((id) => `<i class="${id === lo.ship ? 'on' : ''}"></i>`).join('')}</span></button>
        <button class="hgr-arrow next" ${act('lo-ship', { dir: 1 })} aria-label="Nächstes Schiff">${icon('back', 18)}</button>
      </div>
      <div class="hgr-hots">${hotHtml}</div>
    </div>
    <div class="hgr-stats">${gaugeHtml(false)}</div>
    <div class="hgr-foot"><button class="btn" ${act('mg-back')}>Fertig</button><button class="btn primary" ${act('ship-art-try')}>${icon('play', 16)}Probeflug</button></div>
    <div class="hgr-drawer" aria-hidden="${open ? 'false' : 'true'}">
      <div class="hgr-grip"></div>
      <div class="hgr-dhead"><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>
        ${m.undo ? `<button class="btn small" ${act('lo-undo')}>Rückgängig</button>` : ''}<button class="btn small lo-back" ${act('lo-view', { view: 'home' })}>Fertig</button></div>
      ${view !== 'art' && view !== 'ship' ? `<div class="hgr-dstats">${gaugeHtml(true)}</div>` : ''}
      <div class="hgr-dbody">${body}</div>
    </div>
  </div>`;
}

const swiped = new WeakSet<HTMLElement>();

/**
 * Nach dem Zeichnen: Leitlinien von den Plaketten zu den Bauteilen am Schiff ziehen und Wischen zum Schiffswechsel
 * anmelden (einmal je Fenster)
 */
export function layoutHangar(root: HTMLElement, onSwipe: (dir: number) => void): void {
  const hgr = root.querySelector<HTMLElement>('.hgr');
  if (!hgr) return;
  const stage = hgr.querySelector<HTMLElement>('.hgr-stage')!, svg = hgr.querySelector<SVGSVGElement>('.hgr-lines')!, ship = hgr.querySelector<HTMLImageElement>('.hgr-ship img');
  const draw = () => {
    if (!ship || hgr.classList.contains('open')) { svg.innerHTML = ''; return; }
    const sr = stage.getBoundingClientRect(), ir = ship.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
    svg.innerHTML = [...hgr.querySelectorAll<HTMLElement>('.hgr-hot')].map((b) => {
      const [ax, ay] = (b.dataset.anchor ?? '0.5,0.5').split(',').map(Number);
      const r = b.getBoundingClientRect();
      const px = ir.left - sr.left + ax * ir.width, py = ir.top - sr.top + ay * ir.height;
      const sx = r.left - sr.left + r.width / 2, sy = r.top - sr.top;
      return `<g><polyline points="${sx.toFixed(1)},${sy.toFixed(1)} ${sx.toFixed(1)},${(sy - 10).toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/></g>`;
    }).join('');
  };
  if (ship && !ship.complete) ship.addEventListener('load', draw, { once: true });
  draw();
  if (!swiped.has(stage)) {
    swiped.add(stage);
    let x0: number | null = null;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 == null || hgr.classList.contains('open')) return;
      const d = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(d) > 60) onSwipe(d < 0 ? 1 : -1);
    });
  }
}
