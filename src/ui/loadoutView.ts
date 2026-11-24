// Hangar „Dein Schiff“ (Kampf-Minispiel): das Schiff steht auf der Landeplattform eines Hangars, die Einbauplätze
// sind als Plaketten mit Leitlinie zum Bauteil markiert. Antippen öffnet eine Schublade mit Karten (das Schiff
// bleibt darüber sichtbar); jede Karte zeigt die Änderung zum Eingebauten, Antippen baut sofort ein. Die Werteleiste
// zeigt die Änderung seit dem letzten Einbau. Zwei Modi: Ausrüstung (Waffen, Raketen, Schild, Türme) und Werkstatt
// (vier Mod-Sockel). Navigation: höchstens eine Ebene (Hangar → Schublade); Zurück schließt immer zuerst die Schublade.
import {
  LTURRET_IDS, LTURRETS, RELOAD, MISSILE_DMG, MISSILE_IDS, MISSILES, SHIELD_IDS, SHIELDS, SHIP_IDS, SHIPS, SPECIALS, TURRET_IDS, TURRETS, WEAPON_IDS, WEAPONS,
  WING_IDS, X4_LENGTH, flakX4Dmg, loadout, sustainedDps, turretDps, turretOf, weaponGun, wingCount, wingGearOf, wingOptions, wingRoom, type Loadout, type ShipId, type X4Gun,
  LO_TAGS, LOADOUT_SLOTS, LTURRET_ROLE, MISSILE_ROLE, ROLES, TURRET_ROLE, WEAPON_ROLE, loadoutChanged, savedLoadouts, type Role,
} from '../minigames/loadout';
import { MODS, MOD_IDS, QUALITY, SLOT_INFO, fmtRange, fmtStat, modRange, modState, modStats, refundOf, shipMods, shipSlots, type ModSlot, type ModStat } from '../minigames/mods';
import { fighterKind, shipArt, spriteUrl } from '../render/shipArt';
import hangarDeck from '../assets/hangar/hangar-deck.jpg';
import werkstattDeck from '../assets/hangar/werkstatt-deck.jpg';
import hangarDeckM from '../assets/hangar/hangar-deck-2.jpg';
import grossDock from '../assets/hangar/grossdock.jpg';
import { esc } from './dom';
import { icon } from './icons';

export type LoView = 'home' | 'ship' | 'weapon' | 'turret' | 'lturret' | 'missile' | 'shield' | 'wing' | 'mod' | 'art' | 'loadouts';
export type LoMode = 'gear' | 'mods';
export interface HangarStats { fire: number; hull: number; shield: number; speed: number; range: number }
export interface LoModal {
  view?: LoView; slot?: ModSlot; fresh?: ModSlot; rollN?: number;
  /** Werkstatt: Sockelnummer innerhalb der Art (große Schiffe haben mehrere) */
  idx?: number;
  /** Ausrüstung oder Werkstatt */
  mode?: LoMode;
  /** Werte vor dem letzten Einbau (für die Vorschau in der Werteleiste) */
  prev?: HangarStats;
  /** Ausrüstung vor dem letzten Einbau (Rückgängig) */
  undo?: Partial<Loadout>;
  /** Schublade: Karten nach Rolle oder nach Feuerkraft ordnen */
  sort?: 'rolle' | 'feuer';
  /** Loadout-Platz, dessen Löschen gerade bestätigt werden muss */
  delArm?: number;
}

/** Reihenfolge der Rollen beim Sortieren */
const ROLE_ORDER: Role[] = ['schwarm', 'gross', 'allround', 'abwehr', 'geleit'];
/** Karten ordnen: nach Rolle (darin nach Feuerkraft) oder nur nach Feuerkraft */
function ordered<T extends string>(ids: T[], role: (id: T) => Role, fire: (id: T) => number, sort: 'rolle' | 'feuer'): T[] {
  return [...ids].sort((a, b) => (sort === 'rolle' ? ROLE_ORDER.indexOf(role(a)) - ROLE_ORDER.indexOf(role(b)) : 0) || fire(b) - fire(a));
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
    : `${num(g.dmg)}${g.amt > 1 ? ` × ${g.amt}` : ''} Schaden · ${g.mag === 1 ? 'Einzelschuss' : `${num(g.rate, 1)} Schuss/s`}${g.mag > 1 ? ` · ${g.mag}er-Salve, ${num(g.reload * RELOAD, 1)} s Pause` : g.mag === 1 ? `, ${num(g.reload * RELOAD, 1)} s Aufladen` : ''} · ${num(km(g), 1)} km`;
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
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  engine: '<path d="M8 4h8v8l-4 8-4-8z"/>',
  hull: '<path d="M4 8l8-5 8 5v8l-8 5-8-5z"/>',
  ship: '<path d="M12 2l4 9 5 4-9 3-9-3 5-4z"/>',
  wing: '<path d="M7 3l3 6 4 3-7 2-5-2 4-3z"/><path d="M17 10l2 4 3 2-5 1-4-1 3-2z"/>',
};
/** Plaketten-Symbol je Mod-Sockel */
const MOD_GLYPH: Record<ModSlot, string> = { weapon: 'gun', engine: 'engine', shield: 'shield', chassis: 'hull', turret: 'turret', missile: 'rocket', hangar: 'wing', targeting: 'target' };
const glyph = (k: string, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPH[k] ?? GLYPH.gun}</svg>`;
const WEAPON_LOOK: Record<string, [string, string]> = {
  rakete: ['rocket', '#ffb070'], puls: ['gun', '#3fe0c5'], bolzen: ['gun', '#9fe870'], schrot: ['scatter', '#ffb547'], strahl: ['beam', '#5fb4ff'], plasma: ['plasma', '#ff6a3d'],
  neutron: ['gatling', '#7fd8ff'], tau: ['scatter', '#ffd27a'], thermal: ['gun', '#ff8a5c'], boson: ['lance', '#c58bff'], massdriver: ['lance', '#9fdcff'], blitz: ['beam', '#bfe4ff'], stoerblitz: ['beam', '#a8f4ff'],
  schnellplasma: ['plasma', '#ff8a3d'], plasmasalve: ['plasma', '#ff5c3d'],
};
const MISSILE_LOOK: Record<string, string> = { lenk: '#ffb070', schwer: '#ff7a3a', schwarm: '#ffd27a', stoer: '#8fe0ff' };

/** Werte des Schiffs mit Bewaffnung und Mods (für Werteleiste und Vergleich) */
export function hangarStats(lo: Loadout = loadout()): HangarStats {
  const d = SHIPS[lo.ship], mx = modStats(lo.ship);
  const wd = WEAPONS[lo.weapon], ltd = LTURRETS[lo.lturret ?? 'plasma'];
  const g = weaponGun(wd, d.gunSize);
  const m = (k: ModStat) => 1 + (mx[k] ?? 0);
  return {
    fire: (d.x4.weapons * sustainedDps(g, wd.beam) + turretSum(lo) + (d.lMounts?.length ?? 0) * sustainedDps(ltd.gun)) * m('dmg') * m('rate'),
    hull: d.x4.hull * m('hull'),
    shield: d.shield * MAMBA_SHIELD * SHIELDS[lo.shield].cap * m('shield'),
    speed: d.x4.v * (d.handling?.speed ?? 1) * m('speed'),
    range: (wd.beam ? 1.6 : km(g)) * m('velocity'),
  };
}

/** Dauerleistung aller Türme (Träger: je Turm seine Gruppe) */
function turretSum(lo: Loadout): number {
  const d = SHIPS[lo.ship];
  return d.turrets.reduce((sum, _, i) => { const t = turretOf(lo, d, i); return sum + turretDps(t.def); }, 0);
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
    wing: [0.7, 0.72],
    engine: [0.5, 0.86],
    chassis: [0.64, 0.55],
    // Mod-Sockel der Werkstatt
    'mod-weapon': [0.5, 0.3], 'mod-engine': [0.5, 0.84], 'mod-shield': [0.32, 0.6], 'mod-chassis': [0.68, 0.6],
    'mod-turret': [0.5 + (t[0] / s) * 0.87, 0.5 + (t[1] / s) * 0.87], 'mod-missile': [0.62, 0.45], 'mod-hangar': [0.7, 0.72], 'mod-targeting': [0.5, 0.14],
  };
}

// ---------- Bühne: Hallen im echten Maßstab, Kamera zoomt je Schiff ----------
/** Halle je Klasse: S auf dem kleinen Landeplatz, M auf dem großen Ring, L und XL im über 3 km langen Großdock */
export type Bay = 's' | 'm' | 'xl';
export function bayOf(id: ShipId): Bay {
  const c = SHIPS[id].cls;
  return c === 'S' ? 's' : c === 'M' ? 'm' : 'xl';
}
/** Rumpflänge im Schiffsbild (Anteil der Bildhöhe, am Alphakanal gemessen) */
const HULL_FRAC: Record<ShipId, number> = {
  jaguar: 0.78, mamba: 0.953, asp: 0.746, balaur: 0.866, chimera: 0.793, wolf: 0.897, argon: 0.929,
  dragon: 0.858, cobra: 0.876, klapperschlange: 0.976, raptor: 0.988,
};
/**
 * Rumpf auf dem Bildschirm (Anteile der Hallenhöhe, cqh): jedes Schiff erscheint etwa gleich groß – je Halle so, dass
 * das Hallenbild nicht weiter vergrößert wird, als seine Auflösung trägt. Raptor füllt die Bucht des Großdocks.
 */
const HULL_CQH: Record<Bay | 'l', number> = { s: 23, m: 26, l: 47, xl: 69.2 };
/** Hallenbilder: Mitte des Rings bzw. der Bucht (Anteil der Bildhöhe), dort liegt die Schiffsmitte; Großdock (2880 × 5120):
 * Bucht innen y 190–3852, also 71,5 % der Bildhöhe – der Raptor füllt sie zu 97 % */
const HALL_MID: Record<Bay, number> = { s: 32, m: 32, xl: 39.5 };
export function hullCqh(id: ShipId): number {
  const c = SHIPS[id].cls;
  return c === 'L' ? HULL_CQH.l : HULL_CQH[bayOf(id)];
}
/** Bildschirmmitte des Schiffs (cqh) */
function shipY(id: ShipId): number {
  return id === 'raptor' ? HALL_MID.xl : bayOf(id) === 'xl' ? 36 : 32;
}
/**
 * Maßstab der Halle: Meter je Hallenbildhöhe – so gewählt, dass das längste Schiff der Halle sie ohne Zoom füllt
 * (Mamba auf dem Landeplatz, Dragon auf dem Ring, Raptor im Großdock); kürzere Schiffe zoomen heran
 */
function hallMeters(b: Bay): number {
  return Math.max(...SHIP_IDS.filter((id) => bayOf(id) === b).map((id) => (X4_LENGTH[id] * 100) / hullCqh(id)));
}
/** Zoom des Hallenbilds für dieses Schiff (1 = ganze Bildhöhe) */
export function hallZoom(id: ShipId): number {
  return (hallMeters(bayOf(id)) * hullCqh(id)) / (100 * X4_LENGTH[id]);
}
/** Meter je Bildschirmhöhe in dieser Ansicht (für die Kamerafahrt beim Schiffswechsel) */
function viewMeters(id: ShipId): number {
  return (100 * X4_LENGTH[id]) / hullCqh(id);
}
const fmtLen = (m: number) => `${(m >= 100 ? Math.round(m) : Math.round(m * 10) / 10).toLocaleString('de-DE')} m`;
/** zuletzt gezeigtes Schiff und Hallenbild: beim Wechsel fährt die Kamera vom alten Maßstab in den neuen */
let lastCam: { id: ShipId; from: ShipId | null; at: number } | null = null;
/** Dauer der Kamerafahrt (ms, wie im CSS) */
const CAM_MS = 800;

// ---------- Ansicht ----------
export function loadoutView(m: LoModal): string {
  const lo = loadout();
  const ship = SHIPS[lo.ship];
  const mode: LoMode = m.mode ?? (m.view === 'mod' ? 'mods' : 'gear');
  const view: LoView = m.view ?? 'home';
  const open = view !== 'home';
  const ms = modState(), sm = shipMods(lo.ship);
  const st = hangarStats(lo);
  const pic = (id: ShipId) => spriteUrl(SHIPS[id].sprite + '-ki') ?? spriteUrl(SHIPS[id].fallback + '-ki');
  const wd = WEAPONS[lo.weapon], td = TURRETS[lo.turret], ltd = LTURRETS[lo.lturret ?? 'plasma'];
  const missile = MISSILES[lo.missile ?? 'lenk'];
  const g = weaponGun(wd, ship.gunSize);

  // Plaketten am Schiff
  type Hot = { view: LoView; slot?: ModSlot; key: string; ic: string; label: string; value: string; cls?: string; color?: string };
  const hots: Hot[] = mode === 'gear'
    ? [
      ...(ship.x4.weapons ? [{ view: 'weapon' as LoView, key: 'weapon', ic: WEAPON_LOOK[lo.weapon]?.[0] ?? 'gun', label: `Kanonen ${ship.x4.weapons}×${ship.gunSize.toUpperCase()}`, value: wd.name }] : []),
      ...(ship.lMounts?.length ? [{ view: 'lturret' as LoView, key: 'lturret', ic: 'turret', label: `L-Türme ${ship.lMounts.length}×`, value: ltd.name }] : []),
      ...(ship.groups ? [{ view: 'turret' as LoView, key: 'turret', ic: 'turret', label: `${ship.lMounts?.length ? 'M-Türme' : 'Türme'} ${ship.turrets.length}× in ${ship.groups.length} Gruppen`, value: ship.name === 'Raptor' ? 'je Cluster wählen' : ship.groups.map((_, gi) => turretOf(lo, ship, ship.turretGroup!.indexOf(gi)).def.name.replace(/-?[Tt]urm$/, '')).join(' · ') }]
        : ship.turrets.length ? [{ view: 'turret' as LoView, key: 'turret', ic: 'turret', label: `${ship.lMounts?.length ? 'M-Türme' : 'Türme'} ${ship.turrets.length}×`, value: td.name }] : []),
      ...(ship.x4.launchers ? [{ view: 'missile' as LoView, key: 'missile', ic: 'rocket', label: `Raketen ${ship.x4.launchers}×`, value: missile.name }] : []),
      { view: 'wing', key: 'wing', ic: 'wing', label: SHIPS[lo.ship].bays ? 'Hangar · Staffel' : 'Flügelleute', value: wingCount(lo.wing) ? `${wingCount(lo.wing)} Schiffe` : 'keine' },
      { view: 'shield', key: 'shield', ic: 'shield', label: `Schild ${ship.x4.shields}×${ship.cls}${ship.x4.mShields ? `+${ship.x4.mShields}×M` : ''}`, value: SHIELDS[lo.shield].name },
    ]
    : shipSlots(lo.ship).map(({ slot: sl, n }) => {
      // je Art eine Plakette; große Schiffe haben mehrere Sockel derselben Art
      const list = sm[sl] ?? [], set = list.filter((x) => !!x), md = set[0], best = set.reduce((q, x) => Math.max(q, x!.q), 0);
      const value = n === 1 ? (md ? `${MODS[md.id].name} ${fmtStat(MODS[md.id].stat, md.value).split(' ')[0]}` : 'frei') : `${set.length} von ${n} belegt`;
      return { view: 'mod' as LoView, slot: sl, key: `mod-${sl}`, ic: MOD_GLYPH[sl], label: `Sockel ${SLOT_INFO[sl].name}${n > 1 ? ` · ${n}×` : ''}`, value, cls: `mod ${set.length ? 'set' : 'free'}`, color: best ? QUALITY[best as 1 | 2 | 3].color : '' };
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
  const card = (o: { key: string; value: string; on: boolean; name: string; big: string; sm: string; ds?: string; ic?: string; color?: string; img?: string; role?: Role }) =>
    `<button class="hgr-card ${o.on ? 'on' : ''}" style="--c:${o.color ?? 'var(--teal)'}" ${act('loadout-set', { key: o.key, value: o.value })}>
      ${o.role ? `<span class="hgr-role" style="--r:${ROLES[o.role].color}">${esc(ROLES[o.role].name)}</span>` : ''}${o.on ? '<span class="hgr-badge">Eingebaut</span>' : ''}<span class="hgr-art">${o.img ? `<img src="${o.img}" alt=""${o.key === 'ship' ? '' : ' class="item"'}>` : glyph(o.ic ?? 'gun', 34)}</span>
      <span class="hgr-nm">${esc(o.name)}</span><span class="hgr-big">${esc(o.big)}</span><span class="hgr-sm">${esc(o.sm)}</span><span class="hgr-ds">${o.on ? '' : o.ds ?? ''}</span></button>`;
  let title = '', sub = '', body = '';
  const sort = m.sort ?? 'rolle';
  const sortBar = `<div class="segment hgr-sort">${(['rolle', 'feuer'] as const).map((s) => `<button class="${sort === s ? 'on' : ''}" ${act('lo-sort', { sort: s })}>${s === 'rolle' ? 'Nach Rolle' : 'Nach Feuerkraft'}</button>`).join('')}</div>`;
  if (view === 'ship') {
    const cur = hangarStats(lo);
    title = 'Schiff'; sub = 'Feuerkraft mit deiner Bewaffnung · seitlich blättern';
    const cards = (cls: 'S' | 'M' | 'L' | 'XL') => SHIP_IDS.filter((id) => SHIPS[id].cls === cls).map((id) => {
      const d = SHIPS[id], s2 = hangarStats({ ...lo, ship: id });
      return card({ key: 'ship', value: id, on: lo.ship === id, name: `${d.name} · ${d.cls}`, big: `${num(s2.fire)}/s`, sm: `${d.role} · Hülle ${num(d.x4.hull)} · ${d.x4.v} m/s`, img: pic(id), ds: `${pct(s2.fire, cur.fire) ? `<i>Feuer</i>${pct(s2.fire, cur.fire)}` : ''}${pct(s2.hull, cur.hull) ? `<i>Hülle</i>${pct(s2.hull, cur.hull)}` : ''}${delta(s2.speed, cur.speed, (x) => `${num(x)} m/s`)}` });
    }).join('');
    body = `<div class="hgr-cards">${cards('S')}${cards('M')}${cards('L')}${cards('XL')}</div>
      <div class="hgr-desc"><b>${esc(ship.name)}:</b> ${esc(ship.desc)} <span class="muted">Spezialfähigkeit: ${esc(SPECIALS[ship.special].name)} (Taste über der Feuertaste).</span></div>`;
  } else if (view === 'weapon') {
    const n = ship.x4.weapons, size = ship.gunSize, curDps = n * sustainedDps(g, wd.beam), curKm = wd.beam ? 1.6 : km(g);
    title = 'Bordkanonen'; sub = `${n} × ${size.toUpperCase()}-Waffenplatz · Werte aus X4 9.0`;
    const ids = ordered(WEAPON_IDS.filter((id) => WEAPONS[id].group !== 'schwer' || size === 'l'), (id) => WEAPON_ROLE[id], (id) => sustainedDps(weaponGun(WEAPONS[id], size), WEAPONS[id].beam), sort);
    body = `${sortBar}<div class="hgr-cards">${ids.map((id) => {
      const d = WEAPONS[id], gg = weaponGun(d, size), dps = n * sustainedDps(gg, d.beam), r = d.beam ? 1.6 : km(gg);
      const [ic, col] = WEAPON_LOOK[id] ?? ['gun', '#3fe0c5'];
      return card({ key: 'weapon', value: id, on: lo.weapon === id, name: d.name, big: `${num(dps)}/s`, sm: d.beam ? 'Dauerstrahl' : `${num(r, 1)} km`, ic, color: col, img: spriteUrl(`waffe-${id}-ki`), role: WEAPON_ROLE[id], ds: `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(r, curKm, (x) => `${num(x, 1)} km`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(wd.name)}:</b> ${esc(wd.desc)}<small>${esc(gunData(g, wd.beam))}</small></div>`;
  } else if (view === 'turret' && ship.groups) {
    // Turmgruppen (Träger, Cobra, Dragon, Klapperschlange): je Gruppe vom Bug zum Heck die Turmart wählen
    title = 'Türme'; sub = ship.name === 'Raptor' ? `${ship.turrets.length} Türme · je Gruppe vom Bug zum Heck · links und rechts gleich` : `${ship.turrets.length} Türme in ${ship.groups.length} Gruppen · je Gruppe eigene Turmart und eigener Befehlsknopf`;
    const groups = ship.groups;
    body = `<div class="hgr-groups">${groups.map((gr, gi) => {
      const n = ship.turretGroup!.filter((x) => x === gi).length, cur = lo.groups?.[gi] ?? (gr.kind === 'L' ? 'plasma' : ship.name === 'Raptor' ? 'puls' : lo.turret);
      const ids: string[] = gr.kind === 'L' ? LTURRET_IDS : TURRET_IDS;
      const def = (id: string) => (gr.kind === 'L' ? LTURRETS[id as keyof typeof LTURRETS] : TURRETS[id as keyof typeof TURRETS]);
      return `<div class="hgr-grp"><div class="hgr-grp-h"><b>${esc(gr.name)}</b><small>${n} × ${gr.kind} · ${num(n * turretDps(def(cur)))}/s</small></div>
        <div class="hgr-chips">${ids.map((id) => `<button class="hgr-chip ${id === cur ? 'on' : ''}" style="--c:${def(id).color}" ${act('loadout-group', { g: gi, value: id })}>${esc(def(id).name.replace(/^Schwerer /, '').replace(/-?[Tt]urm$/, ''))}</button>`).join('')}</div></div>`;
    }).join('')}</div><div class="hgr-desc">Pulstürme schwenken schnell und holen Raketen und Jäger herunter, Plasma- und Bosonentürme knacken große Ziele. Im Kampf hat jede Gruppe links einen eigenen kleinen Befehlsknopf (M1 … M8 vom Bug zum Heck, L1 … L3): wischen wählt das Ziel – alle, S, M, L oder Strukturen (Türme, Bauteile, Brutstätten).</div>`;
  } else if (view === 'turret') {
    const n = ship.turrets.length, curDps = n * turretDps(td);
    title = ship.lMounts?.length ? 'M-Türme' : 'Türme'; sub = `${n} × M · schießen von selbst`;
    body = `${sortBar}<div class="hgr-cards">${ordered(TURRET_IDS, (id) => TURRET_ROLE[id], (id) => turretDps(TURRETS[id]), sort).map((id) => {
      const t = TURRETS[id], dps = n * turretDps(t);
      return card({ key: 'turret', value: id, on: lo.turret === id, name: t.name, big: `${num(dps)}/s`, sm: t.flak ? `je Ziel in der Wolke · ${t.turn}°/s` : `schwenkt ${t.turn}°/s`, ic: 'turret', color: WEAPON_LOOK[id]?.[1], img: spriteUrl(t.missile ? 'split-turm-rakete-ki' : `waffe-${id}-ki`), role: TURRET_ROLE[id], ds: `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(t.turn, td.turn, (x) => `${num(x)}°/s`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(td.name)}:</b> ${esc(td.desc)}<small>${esc(td.flak ? gunData({ ...td.gun, dmg: flakX4Dmg() }).replace(' Schaden', ' Schaden je Ziel in der Wolke') : gunData(td.gun, td.beam))}</small></div>`;
  } else if (view === 'lturret') {
    const n = ship.lMounts?.length ?? 0, curDps = n * sustainedDps(ltd.gun);
    title = 'Schwere Türme'; sub = `${n} × L an den Schultern · Werte angenommen`;
    // das Silo braucht einen Sockel im Rumpf (Träger), nicht für die Schulterrohre
    body = `${sortBar}<div class="hgr-cards">${ordered(LTURRET_IDS.filter((id) => id !== 'silo'), (id) => LTURRET_ROLE[id], (id) => sustainedDps(LTURRETS[id].gun), sort).map((id) => {
      const t = LTURRETS[id], dps = n * sustainedDps(t.gun);
      return card({ key: 'lturret', value: id, on: (lo.lturret ?? 'plasma') === id, name: t.name, big: `${num(dps)}/s`, sm: `${num(km(t.gun), 1)} km · ${t.turn}°/s`, img: spriteUrl(t.barrel), role: LTURRET_ROLE[id], ds: `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(km(t.gun), km(ltd.gun), (x) => `${num(x, 1)} km`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(ltd.name)}:</b> ${esc(ltd.desc)}<small>${esc(gunData(ltd.gun))}</small></div>`;
  } else if (view === 'missile') {
    const dmgOf = (d: typeof missile) => MISSILE_DMG * d.dmg * (d.split ?? 1);
    const reach = (d: typeof missile) => (d.v * d.life + (d.split ? 120 : 0)) / 1000;
    title = 'Raketen'; sub = `${ship.x4.launchers} × Werfer, Lager ${ship.x4.missiles} · Nachladen ${ship.missileReload && ship.missileReload < 1 ? Math.round(8 * ship.missileReload) : 8} s`;
    body = `${sortBar}<div class="hgr-cards">${ordered(MISSILE_IDS, (id) => MISSILE_ROLE[id], (id) => dmgOf(MISSILES[id]), sort).map((id) => {
      const d = MISSILES[id];
      return card({ key: 'missile', value: id, on: (lo.missile ?? 'lenk') === id, role: MISSILE_ROLE[id], name: d.name, big: `${d.split ? `${d.split} × ${Math.round(MISSILE_DMG * d.dmg)}` : Math.round(MISSILE_DMG * d.dmg)} Schaden`, sm: `${num(reach(d), 1)} km · ${d.slots > 1 ? `${d.slots} Plätze` : '1 Platz'}`, ic: 'rocket', color: MISSILE_LOOK[id], ds: `${delta(dmgOf(d), dmgOf(missile), (x) => `${Math.round(x)}`)}${delta(reach(d), reach(missile), (x) => `${num(x, 1)} km`)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(missile.name)}</b> – ${esc(missile.role)}. ${esc(missile.desc)}</div>`;
  } else if (view === 'wing') {
    // Staffel: je Schiffstyp die Anzahl – Träger nach Hangarplätzen (S und M getrennt), sonst bis zu vier Flügelleute
    const room = wingRoom(lo.ship), w = lo.wing ?? {}, carrier = !!ship.bays;
    const nS = WING_IDS.filter((id) => SHIPS[id].cls === 'S').reduce((a, id) => a + (w[id] ?? 0), 0), nM = WING_IDS.filter((id) => SHIPS[id].cls === 'M').reduce((a, id) => a + (w[id] ?? 0), 0);
    title = carrier ? 'Hangar' : 'Flügelleute';
    sub = carrier ? `S ${nS}/${room.S} · M ${nM}/${room.M} · starten und landen über die Flugdecks` : `${nS + nM}/${room.total} · fliegen mit dir in Formation`;
    body = `<div class="hgr-groups">${WING_IDS.map((id) => {
      const d = SHIPS[id], n = w[id] ?? 0, isS = d.cls === 'S';
      const full = (isS ? nS >= room.S : nM >= room.M) || nS + nM >= room.total;
      return `<div class="hgr-grp hgr-wing-box"><div class="hgr-wing"><span class="hgr-wing-img">${pic(id) ? `<img src="${pic(id)}" alt="">` : glyph('ship', 26)}</span><div class="hgr-grp-h" style="flex:1;margin:0"><b>${esc(d.name)} · ${d.cls}</b><small>${esc(d.role)} · ${d.x4.weapons} Kanonen</small></div>
        <div class="hgr-step"><button class="hgr-chip" ${n ? '' : 'disabled'} ${act('loadout-wing', { ship: id, d: -1 })} aria-label="Weniger">−</button><b>${n}</b><button class="hgr-chip" ${full ? 'disabled' : ''} ${act('loadout-wing', { ship: id, d: 1 })} aria-label="Mehr">+</button></div></div>${n ? wingGearRows(lo, id) : ''}</div>`;
    }).join('')}</div><div class="hgr-desc">${carrier ? 'Die Staffel startet nach Wellenbeginn nacheinander über die Flugdecks links und rechts. Unter 30 % Hülle oder auf Befehl „Landen“ fliegt ein Schiff zurück, wird im Hangar repariert und startet wieder.' : 'Flügelleute fliegen in Formation neben dir und greifen auf Befehl an.'} Im Kampf steuerst du die Staffel mit dem Knopf „ST“ links: Angriff, Strukturen, Schutz, ${carrier ? 'Landen' : 'Sammeln'}.</div>`;
  } else if (view === 'shield') {
    const cur = SHIELDS[lo.shield];
    title = 'Schild'; sub = `${ship.x4.shields} × ${ship.cls}${ship.x4.mShields ? ` + ${ship.x4.mShields} × M` : ''} · gilt für alle Schildplätze`;
    body = `<div class="hgr-cards">${SHIELD_IDS.map((id) => {
      const s = SHIELDS[id], cap = ship.shield * MAMBA_SHIELD * s.cap;
      return card({ key: 'shield', value: id, on: lo.shield === id, name: s.name, big: num(cap), sm: `Laden ×${String(s.regen).replace('.', ',')} · Pause ×${String(s.delay).replace('.', ',')}`, ic: 'shield', color: id === 'schwer' ? '#5fb4ff' : '#3fe0c5', ds: `${pct(s.cap, cur.cap)}${pct(s.regen, cur.regen)}` });
    }).join('')}</div><div class="hgr-desc"><b>${esc(cur.name)}:</b> ${esc(cur.desc)}</div>`;
  } else if (view === 'mod') {
    const avail = shipSlots(lo.ship), slot: ModSlot = avail.some((x) => x.slot === m.slot) ? m.slot! : avail[0].slot;
    const list = sm[slot] ?? [], n = list.length, idx = Math.min(n - 1, Math.max(0, m.idx ?? Math.max(0, list.findIndex((x) => !x))));
    const cur = list[idx] ?? undefined;
    title = `Mod-Sockel ${SLOT_INFO[slot].name}${n > 1 ? ` ${idx + 1}` : ''}`; sub = `${ms.parts} Modteile · ${esc(ship.name)} · der Wert wird beim Bau ausgewürfelt`;
    // mehrere Sockel derselben Art: Reiter je Sockel
    const tabs = n > 1 ? `<div class="segment mod-socks">${list.map((x, i) => `<button class="${i === idx ? 'on' : ''}" ${act('lo-view', { view: 'mod', slot, idx: i })}>${i + 1}${x ? ` · ${esc(MODS[x.id].name.split(' ')[0])}` : ' · frei'}</button>`).join('')}</div>` : '';
    const now = cur ? (() => {
      const d = MODS[cur.id], q = QUALITY[cur.q], [a, b] = modRange(cur.id, cur.q);
      return `<div class="mod-detail hgr-now" style="--q:${q.color}">
        <div class="mod-head"><b>${esc(d.name)}</b><span class="mod-q">${q.name}</span></div>
        <div class="mod-main">${esc(fmtStat(d.stat, cur.value))}</div>
        <div class="mod-roll ${m.fresh === slot ? 'fresh' : ''}" data-key="roll-${slot}-${m.rollN ?? 0}" style="--v:${(cur.roll * 100).toFixed(1)}%"><i class="bar"></i><i class="mk"></i>
          <span class="lo">${esc(fmtStat(d.stat, a))}</span><span class="hi">${esc(fmtStat(d.stat, b))}</span></div>
        ${cur.bonus.length || d.cost ? `<ul class="mod-fx">${cur.bonus.map((x) => `<li class="pos">${esc(fmtStat(x.stat, x.value))}</li>`).join('')}${d.cost ? `<li class="neg">${esc(fmtStat(d.cost[0], d.cost[1]))}</li>` : ''}</ul>` : ''}
        <button class="btn small hgr-zerlegen" ${act('mod-remove', { slot, idx })}>${icon('trash', 15)}Zerlegen (+${refundOf(cur.q)})</button></div>`;
    })() : `<div class="mod-detail empty hgr-now"><p class="small muted" style="margin:0">Sockel frei. Wähle unten Mod und Güte – der Wert wird beim Bau ausgewürfelt, Spitzenwerte sind selten.</p></div>`;
    const short = { 1: 'Grundl.', 2: 'Fortg.', 3: 'Außerg.' } as const;
    const cards = MOD_IDS.filter((id) => MODS[id].slot === slot).map((id) => {
      const d = MODS[id];
      return `<div class="hgr-card mod ${cur?.id === id ? 'on' : ''}"><span class="hgr-art">${glyph('mod', 24)}</span><span class="hgr-nm">${esc(d.name)}</span>
        <span class="hgr-sm wrap">${esc(d.desc)}${d.cost ? ` <span class="neg">${esc(fmtStat(d.cost[0], d.cost[1]))}</span>` : ''}</span>
        <span class="mod-qrow">${([1, 2, 3] as const).map((qq) => { const Q = QUALITY[qq], ok = ms.parts >= Q.cost; return `<button class="mod-qbtn2" style="--q:${Q.color}" ${ok ? act('mod-craft', { id, q: String(qq), idx }) : 'disabled'} title="${Q.name}"><b>${short[qq]}</b><span>${esc(fmtRange(id, qq))}</span><em>${Q.cost} ${icon('gift', 12)}</em></button>`; }).join('')}</span></div>`;
    }).join('');
    body = `${tabs}${now}<div class="hgr-cards">${cards}</div>`;
  } else if (view === 'loadouts') {
    const sv = savedLoadouts(), used = sv.list.filter(Boolean).length;
    title = 'Loadouts'; sub = `${used} von ${LOADOUT_SLOTS} belegt · Schiff und komplette Ausrüstung (ohne Mods)`;
    body = `<div class="hgr-groups">${sv.list.map((q, i) => q ? `<div class="hgr-grp lo-row ${sv.active === i ? 'on' : ''}" style="--c:${ROLES[q.tag].color}">
        <div class="lo-head"><span class="hgr-wing-img">${pic(q.lo.ship) ? `<img src="${pic(q.lo.ship)}" alt="">` : glyph('ship', 22)}</span>
          <label class="lo-name"><small>Name</small><input type="text" value="${esc(q.name)}" maxlength="40" data-change="lo-name" data-i="${i}" aria-label="Name des Loadouts"></label></div>
        <div class="hgr-chips">${LO_TAGS.map((t) => `<button class="hgr-chip ${q.tag === t ? 'on' : ''}" style="--c:${ROLES[t].color}" ${act('lo-tag', { i, tag: t })}>${esc(ROLES[t].name)}</button>`).join('')}</div>
        <div class="lo-acts"><button class="btn small primary" ${act('lo-apply', { i })}>Einbauen</button><button class="btn small" ${act('lo-save', { i })}>Überschreiben</button><button class="btn small ${m.delArm === i ? 'danger' : 'ghost'}" ${act('lo-del', { i })}>${m.delArm === i ? 'Wirklich löschen?' : 'Löschen'}</button></div></div>`
      : `<div class="hgr-grp lo-row empty"><span class="small muted">Platz ${i + 1} frei</span><button class="btn small" ${act('lo-save', { i })}>Aktuelle Ausrüstung hier speichern</button></div>`).join('')}</div>
      <div class="hgr-desc">Ein Loadout merkt sich das Schiff und alles, was eingebaut ist: Bordwaffe, Türme, Raketen, Schild und Staffel. Antippen in der Leiste baut es ein. Weichst du danach ab, steht dort „geändert“ – mit Zurücksetzen oder Überschreiben. Mods bleiben am Schiff und gehören nicht dazu.</div>`;
  } else if (view === 'art') {
    title = 'Darstellung'; sub = 'wie dein Schiff im Kampf aussieht';
    body = `<div class="segment" style="margin:0 14px">${(['ai', 'render', 'vector'] as const).map((a) => `<button class="${shipArt() === a ? 'on' : ''}" ${act('ship-art', { art: a, kind: fighterKind() })}>${a === 'ai' ? 'KI-Bild' : a === 'render' ? 'Gerendert' : 'Gezeichnet'}</button>`).join('')}</div>
      <div class="box rows" style="margin:10px 14px 0"><div class="row tap" ${act('ship-art-open')}>${icon('star', 20)}<div class="grow"><div class="title" style="font-weight:500">Grafikvergleich der Jäger</div><div class="sub">KI-Bild, gerendert und gezeichnet nebeneinander</div></div>${icon('chev', 20, 'chev')}</div></div>`;
  }
  const where = open ? title : mode === 'mods' ? 'Werkstatt' : 'Hangar';
  const crumbs = open ? `Minispiele › Kampf › ${mode === 'mods' ? 'Werkstatt' : 'Hangar'}` : 'Minispiele › Kampf';
  const bay = bayOf(lo.ship), len = X4_LENGTH[lo.ship];
  // Großdock (über 3 km lange Bucht) für Zerstörer und Träger, auch in der Werkstatt
  const bgOf = (b: Bay) => (b === 'xl' ? grossDock : mode === 'mods' ? werkstattDeck : b === 's' ? hangarDeck : hangarDeckM);
  /** Ebene eines Schiffs: Hallenbild im Zoom, Schiff in Bildschirmgröße (CSS-Variablen) */
  const camVars = (id: ShipId) => `--hgr-bg:url('${bgOf(bayOf(id))}');--dz:${hallZoom(id).toFixed(4)};--dmid:${HALL_MID[bayOf(id)]}cqh;--sy:${shipY(id)}cqh;--k:${(hullCqh(id) / 30 / HULL_FRAC[id]).toFixed(4)};--hf:${HULL_FRAC[id]}`;
  // Kamerafahrt: neue Ansicht startet im alten Maßstab (Faktor f) und fährt in den eigenen; die alte blendet aus
  // (bis zum Ende der Fahrt gleich gezeichnet, damit ein Neuzeichnen sie nicht abbricht)
  const now = Date.now();
  if (!lastCam || lastCam.id !== lo.ship) lastCam = { id: lo.ship, from: lastCam?.id ?? null, at: now };
  const prev = lastCam.from && now - lastCam.at < CAM_MS + 100 ? lastCam.from : null;
  const f = prev ? Math.max(1 / 40, Math.min(40, viewMeters(lo.ship) / viewMeters(prev))) : 1;
  const cam = !!prev && Math.abs(f - 1) > 0.01;
  const old = cam && prev ? `<div class="hgr-bgl old" data-key="bgold-${prev}" style="${camVars(prev)};--f:${f.toFixed(4)}"></div>` : '';
  const oldShip = cam && prev && pic(prev) ? `<div class="hgr-ship old" data-key="shipold-${prev}" style="${camVars(prev)};--f:${f.toFixed(4)}"><img src="${pic(prev)}" alt=""></div>` : '';
  // Maßstab: Lineal über die Rumpflänge, daneben eine Mamba in echter Größe zum Vergleich
  const ref = len >= 100 ? `<span class="hgr-ref ${X4_LENGTH.mamba / len < 0.08 ? 'tiny' : ''}">${pic('mamba') ? `<img src="${pic('mamba')}" alt="" style="height:max(3px, calc(var(--hull) * ${(X4_LENGTH.mamba / len).toFixed(4)}))">` : ''}<small>Mamba · ${fmtLen(X4_LENGTH.mamba)}</small></span>` : '';
  const scale = `<div class="hgr-scale" aria-label="Länge ${fmtLen(len)}"><b>${fmtLen(len)}</b><i class="hgr-ruler"></i>${ref}</div>`;

  return `<div class="modal full hgr ${open ? 'open' : ''} hgr-${mode} bay-${bay} ship-${lo.ship} ${cam ? 'cam' : ''}" role="dialog" aria-modal="true" aria-label="Hangar" style="${camVars(lo.ship)};--f:${f.toFixed(4)}">
    ${old}<div class="hgr-bgl" data-key="bg-${lo.ship}"></div>
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
    ${mode === 'gear' ? loStrip() : ''}
    <div class="hgr-stage">
      ${oldShip}<div class="hgr-ship" data-key="ship-${lo.ship}">${pic(lo.ship) ? `<img src="${pic(lo.ship)}" alt="${esc(ship.name)}">` : ''}</div>
      ${scale}
      <svg class="hgr-lines" aria-hidden="true"></svg>
      <div class="hgr-shipbar">
        <button class="hgr-arrow" ${act('lo-ship', { dir: -1 })} aria-label="Vorheriges Schiff">${icon('back', 18)}</button>
        <button class="hgr-name" ${act('lo-view', { view: 'ship' })}><b>${esc(ship.name)}</b><small>${ship.cls} · ${esc(ship.role)} · ${esc(SPECIALS[ship.special].name)}</small><span class="hgr-dots">${SHIP_IDS.map((id) => `<i class="${id === lo.ship ? 'on' : ''}"></i>`).join('')}</span></button>
        <button class="hgr-arrow next" ${act('lo-ship', { dir: 1 })} aria-label="Nächstes Schiff">${icon('back', 18)}</button>
      </div>
      <div class="hgr-hots">${mode === 'mods' && ms.refunded ? `<div class="mod-refund"><b>Mods gelten jetzt je Schiff.</b> Deine bisherigen Mods wurden ausgebaut, ${ms.refunded} Modteile sind dir gutgeschrieben – bau sie dort ein, wo sie passen. <button class="btn small" ${act('mod-ack')}>Verstanden</button></div>` : ''}${hotHtml}</div>
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

/** Leiste „Loadouts“ im Hangar: gespeicherte Loadouts zum Antippen, Speichern, Verwalten; darunter der Stand */
function loStrip(): string {
  const sv = savedLoadouts(), cur = sv.active != null ? sv.list[sv.active] : null, changed = loadoutChanged();
  const chips = sv.list.map((q, i) => q ? `<button class="hgr-lo ${sv.active === i ? 'on' : ''}" style="--c:${ROLES[q.tag].color}" ${act('lo-apply', { i })} title="${esc(q.name)}"><i></i><span>${esc(q.name)}</span></button>` : '').join('');
  const add = sv.list.some((q) => !q) ? `<button class="hgr-lo add" ${act('lo-save')}>+ Speichern</button>` : '';
  // weicht die Ausrüstung vom markierten Loadout ab: kurz „Geändert“ mit Zurücksetzen und Überschreiben (der Name steht im Knopf)
  const state = cur && changed ? `<div class="hgr-lostate changed"><span>Geändert</span><button ${act('lo-apply', { i: sv.active! })}>Zurücksetzen</button><button ${act('lo-save', { i: sv.active! })}>Überschreiben</button></div>` : '';
  return `<div class="hgr-los"><span class="hgr-los-l">Loadouts</span>${chips}${add}<button class="hgr-lo more" ${act('lo-view', { view: 'loadouts' })} aria-label="Loadouts verwalten">···</button></div>${state}`;
}

const swiped = new WeakSet<HTMLElement>();

/**
 * Nach dem Zeichnen: Leitlinien von den Plaketten zu den Bauteilen am Schiff ziehen und Wischen zum Schiffswechsel
 * anmelden (einmal je Fenster)
 */
export function layoutHangar(root: HTMLElement, onSwipe: (dir: number) => void): void {
  const hgr = root.querySelector<HTMLElement>('.hgr');
  if (!hgr) return;
  const stage = hgr.querySelector<HTMLElement>('.hgr-stage')!, svg = hgr.querySelector<SVGSVGElement>('.hgr-lines')!, ship = hgr.querySelector<HTMLImageElement>('.hgr-ship:not(.old) img');
  const hots = hgr.querySelector<HTMLElement>('.hgr-hots'), stats = hgr.querySelector<HTMLElement>('.hgr-stats');
  // Plakettenbereich endet über der Werteleiste (ihre Höhe hängt von Schrift und Gerät ab)
  if (stats) hgr.style.setProperty('--hgr-stats-h', `${stats.offsetHeight}px`);
  const draw = () => {
    if (!ship || hgr.classList.contains('open')) { svg.innerHTML = ''; return; }
    const sr = stage.getBoundingClientRect(), ir = ship.getBoundingClientRect(), hr = hots?.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
    svg.innerHTML = [...hgr.querySelectorAll<HTMLElement>('.hgr-hot')].map((b) => {
      const [ax, ay] = (b.dataset.anchor ?? '0.5,0.5').split(',').map(Number);
      const r = b.getBoundingClientRect();
      // weggescrollte Plaketten bekommen keine Leitlinie
      if (hr && (r.top < hr.top - 1 || r.top > hr.bottom - 12)) return '';
      const px = ir.left - sr.left + ax * ir.width, py = ir.top - sr.top + ay * ir.height;
      const sx = r.left - sr.left + r.width / 2, sy = r.top - sr.top;
      return `<g><polyline points="${sx.toFixed(1)},${sy.toFixed(1)} ${sx.toFixed(1)},${(sy - 10).toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/></g>`;
    }).join('');
  };
  if (ship && !ship.complete) ship.addEventListener('load', draw, { once: true });
  if (hgr.classList.contains('cam')) hgr.querySelector('.hgr-ship:not(.old)')?.addEventListener('animationend', draw, { once: true });
  draw();
  if (hots && !swiped.has(hots)) { swiped.add(hots); hots.addEventListener('scroll', draw, { passive: true }); }
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

/** Ausrüstung eines Begleitschiff-Typs im Hangar: Bordwaffe, Türme (nur M-Schiffe mit Türmen), Raketen (nur mit Werfern) */
function wingGearRows(lo: Loadout, id: ShipId): string {
  const d = SHIPS[id], o = wingOptions(id), g = wingGearOf(lo, id);
  const short = (name: string) => name.replace(/-?[Tt]urm$/, '').replace(/^Schwerer /, '').replace(/-Beschleuniger$/, '').replace(/-Desintegrator$/, '').replace(/-Gatling$/, '');
  const row = (label: string, key: 'weapon' | 'turret' | 'missile', ids: string[], name: (x: string) => string, color: (x: string) => string, cur: string) =>
    `<div class="hgr-wgear"><small>${label}</small><div class="hgr-chips">${ids.map((x) => `<button class="hgr-chip ${x === cur ? 'on' : ''}" style="--c:${color(x)}" ${act('loadout-winggear', { ship: id, key, value: x })}>${esc(short(name(x)))}</button>`).join('')}</div></div>`;
  return `<div class="hgr-wing-gear">
    ${row(`${Math.max(1, d.x4.weapons)} × Waffe (${d.gunSize.toUpperCase()})`, 'weapon', o.weapons, (x) => WEAPONS[x as keyof typeof WEAPONS].name, (x) => WEAPONS[x as keyof typeof WEAPONS].color, g.weapon)}
    ${o.turrets.length ? row(`${d.turrets.length} × Turm`, 'turret', o.turrets, (x) => TURRETS[x as keyof typeof TURRETS].name, (x) => TURRETS[x as keyof typeof TURRETS].color, g.turret) : ''}
    ${o.missiles.length ? row(`Raketen · ${d.x4.launchers} × Werfer, Lager ${d.x4.missiles}`, 'missile', o.missiles, (x) => MISSILES[x as keyof typeof MISSILES].name, (x) => MISSILE_LOOK[x as keyof typeof MISSILE_LOOK] ?? '#ffb547', g.missile) : ''}
  </div>`;
}
