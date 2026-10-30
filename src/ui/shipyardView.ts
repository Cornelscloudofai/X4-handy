// Werft (Schiff kaufen) als Schauraum: oben groß das gewählte Schiff in einer Szene, darunter alle Schiffe als
// Draufsicht zum Durchblättern, dazu Werte im Vergleich und der Preis. Szenenbilder liegen in src/assets/schiffe/
// (<Klasse>.jpg oder .webp, z. B. boa.jpg) und werden erst beim Anzeigen geladen; fehlt eins, steht die Draufsicht groß
// vor einem Weltraum-Hintergrund.
import { SHIP_CLASSES } from '../data/ships';
import { STORAGE_LABEL } from '../data/wares';
import { sector } from '../data/sectors';
import { hasDockFor } from '../engine/economy';
import { stationById } from '../engine/logistics';
import type { GameState, ShipClassDef } from '../engine/types';
import { BG_IMAGES } from '../render/bgImages';
import { classSpriteUrl } from '../render/shipArt';
import { CAREER } from './menuArt';
import type { Modal } from './uistate';
import { esc } from './dom';
import { fmtCr, fmtInt, fmtNum } from './format';
import { icon } from './icons';

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(String(v))}"`).join('');

const FILES = import.meta.glob('../assets/schiffe/*.{jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Szenenbilder je Schiffsklasse (eigene Dateien; für die Tuatara vorerst die Bilder der Startwahl) */
const SCENES: Record<string, string> = { tuatara_min: CAREER.mining, tuatara: CAREER.trading };
for (const [path, url] of Object.entries(FILES)) SCENES[path.replace(/^.*\//, '').replace(/\.\w+$/, '')] = url;

export function shipScene(cls: string): string | undefined {
  return SCENES[cls];
}

/** Hintergrund, falls ein Szenenbild fehlt: Miner vor Asteroiden, Gassammler vor Nebel, Frachter vor Planeten */
function studioBg(c: ShipClassDef): string {
  const id = c.role === 'fighter' ? 'nebel-rot-tuerkis' : c.role === 'trader' ? 'planet-tuerkis' : c.storage === 'Liquid' ? 'wirbel-violett' : 'asteroiden-sonne';
  return BG_IMAGES.find((b) => b.id === id)?.url ?? '';
}

const SIZE_LABEL: Record<string, string> = { S: 'Klein', M: 'Mittel', L: 'Groß' };
const roleLabel = (c: ShipClassDef) => (c.combat ? c.combat.type : c.role === 'trader' ? 'Transporter' : c.storage === 'Liquid' ? 'Gassammler' : 'Erz-Miner');

/** Farbe einer Schiffsklasse (Kampf rot, Fracht türkis, Gas violett, Erz gelb) – wie auf der Karte */
export const shipColor = (c: ShipClassDef): string => (c.role === 'fighter' ? '#ff7a66' : c.role === 'trader' ? '#5ff0d8' : c.storage === 'Liquid' ? '#b79bff' : '#ffc45e');
/** Symbol einer Schiffsklasse */
export const shipIcon = (c: ShipClassDef): 'fighter' | 'miner' | 'trader' => (c.role === 'fighter' ? 'fighter' : c.role === 'miner' ? 'miner' : 'trader');
/** Kurzbezeichnung auf den Vorschaukacheln */
const tagOf = (c: ShipClassDef): string => (c.role === 'fighter' ? 'Kampf' : c.role === 'trader' ? 'Fracht' : c.storage === 'Liquid' ? 'Gas' : 'Erz');

/** Balken im Vergleich zum stärksten Schiff der Werft */
function statBar(label: string, value: string, frac: number, color: string): string {
  return `<div class="sy-stat"><span>${label}</span><b>${value}</b><i style="--f:${Math.max(0.04, Math.min(1, frac)).toFixed(3)};--c:${color}"></i></div>`;
}

export function shipyardModal(state: GameState, m: Extract<Modal, { type: 'buyShip' }>): string {
  const st = stationById(state, m.station) ?? state.stations[0];
  if (!st) return '';
  const list = SHIP_CLASSES.filter((c) => m.role === 'all' || c.role === m.role);
  const c = list.find((x) => x.id === m.sel) ?? list[0];
  if (!c) return '';
  const max = (f: (x: ShipClassDef) => number) => Math.max(...SHIP_CLASSES.map(f));
  const dock = hasDockFor(st, c.size);
  const afford = state.credits >= c.price;
  const owned = state.ships.filter((s) => s.cls === c.id).length;
  const color = shipColor(c);
  const scene = shipScene(c.id);
  const sprite = classSpriteUrl(c.id);
  // Bühne: Szenenbild oder Draufsicht groß vor Weltraum (schwebend, mit Triebwerksleuchten)
  const stage = scene
    ? `<div class="sy-stage scene" style="--scene:url(${scene})" data-key="${c.id}"></div>`
    : `<div class="sy-stage studio" style="--scene:url(${studioBg(c)});--c:${color}" data-key="${c.id}">${sprite ? `<img class="sy-ship size-${c.size}" src="${sprite}" alt="" decoding="async">` : ''}</div>`;
  const tabs = (['all', 'miner', 'trader', 'fighter'] as const).map((r) => `<button class="${m.role === r ? 'on' : ''}" ${act('buyship-role', { role: r })}>${r === 'all' ? 'Alle' : r === 'miner' ? 'Miner' : r === 'trader' ? 'Transporter' : 'Kampf'}</button>`).join('');
  const thumbs = list.map((x) => {
    const u = classSpriteUrl(x.id);
    const n = state.ships.filter((s) => s.cls === x.id).length;
    return `<button class="sy-thumb ${x.id === c.id ? 'on' : ''} ${state.credits >= x.price ? '' : 'dear'}" ${act('buyship-sel', { cls: x.id })} aria-label="${esc(x.name)}" style="--c:${shipColor(x)}">
      <span class="sy-thumb-img">${u ? `<img src="${u}" alt="" loading="lazy" decoding="async">` : icon(shipIcon(x), 26)}<em>${x.size} · ${tagOf(x)}</em>${n ? `<u>${n}</u>` : ''}</span>
      <span class="sy-thumb-name">${esc(x.name.replace(/\s*\(.*\)$/, ''))}</span><span class="sy-thumb-price">${fmtCr(x.price)}</span></button>`;
  }).join('');
  const picker = state.stations.length > 1 ? `<div class="field sy-home"><label>Heimatstation</label><select data-change="buy-home">${state.stations.map((x) => `<option value="${x.id}" ${x.id === st.id ? 'selected' : ''}>${esc(x.name)} · ${esc(sector(x.sector).name)}</option>`).join('')}</select></div>` : '';
  const cb = c.combat;
  const cmax = (f: (x: NonNullable<ShipClassDef['combat']>) => number) => Math.max(...SHIP_CLASSES.map((x) => (x.combat ? f(x.combat) : 0)));
  const stats = cb ? [
    statBar('Kampfwert', fmtInt(cb.power), cb.power / cmax((x) => x.power), color),
    statBar('Hülle', fmtInt(cb.hull), cb.hull / cmax((x) => x.hull), color),
    statBar('Schild', fmtInt(cb.shield), cb.shield / cmax((x) => x.shield), color),
    statBar('Schaden/s', `${fmtInt(cb.dps)}`, cb.dps / cmax((x) => x.dps), color),
    statBar('Reisetempo', `${fmtNum(c.speed, 1)} km/s`, c.speed / max((x) => x.speed), color),
    statBar('Höchsttempo', `${fmtInt(c.maxSpeed)} m/s`, c.maxSpeed / max((x) => x.maxSpeed), color),
  ].join('') : [
    statBar('Frachtraum', `${fmtInt(c.capacity)} m³`, c.capacity / max((x) => x.capacity), color),
    statBar('Reisetempo', `${fmtNum(c.speed, 1)} km/s`, c.speed / max((x) => x.speed), color),
    statBar('Höchsttempo', `${fmtInt(c.maxSpeed)} m/s`, c.maxSpeed / max((x) => x.maxSpeed), color),
    c.miningRate ? statBar('Abbau*', `${c.miningRate} m³/s`, c.miningRate / max((x) => x.miningRate), color) : '',
  ].join('');
  const body = `
    <div class="sy-show" style="--c:${color}">
      ${stage}
      <div class="sy-title"><span class="sy-eyebrow">${roleLabel(c)} · ${SIZE_LABEL[c.size]} (${c.size})${owned ? ` · ${owned} im Besitz` : ''}</span><h2>${esc(c.name)}</h2></div>
    </div>
    <div class="segment sy-tabs">${tabs}</div>
    <div class="sy-strip">${thumbs}</div>
    <div class="sy-detail" data-key="${c.id}">
      <p class="sy-desc">${esc(c.description)}${cb ? ` ${cb.guns} Bordkanone${cb.guns === 1 ? '' : 'n'}${cb.turrets ? `, ${cb.turrets} Türme` : ''}${cb.missiles ? `, Platz für ${cb.missiles} Raketen` : ''}.` : ` Lädt ${esc(STORAGE_LABEL[c.storage])}.`}</p>
      <div class="sy-stats">${stats}</div>
      <div class="price-breakdown"><span>Rumpf <b>${fmtCr(c.hullPrice)}</b></span>${c.parts.map((p) => `<span>${p.count}× ${esc(p.name)} <b>${fmtCr(p.count * p.price)}</b></span>`).join('')}</div>
      ${picker}
      <p class="small muted sy-note">${cb
        ? 'Preis = Rumpf + Grundausstattung (Kampftriebwerke, Schilde, Pulslaser, bei Korvette und Fregatte Puls-Lasertürme) zu X4-Durchschnittspreisen; Raketen kommen später. Kampfwert = Hülle/100 + Schild/50 + Schaden je Sekunde/10.'
        : `Preis = Rumpf + Grundausstattung (Triebwerke, Schilde, bei Mineral-Minern Abbautürme) zu X4-Durchschnittspreisen; ohne Waffen. Tempo aus Schub und Luftwiderstand.${c.miningRate ? ' *Abbaurate ist ein Spielwert.' : ''}`}</p>
    </div>`;
  const warn = !dock ? `<span class="small warn-text sy-warn">${c.size === 'L' ? 'Pier fehlt' : 'Dock fehlt'} an ${esc(st.name)}</span>` : !afford ? `<span class="small warn-text sy-warn">Es fehlen ${fmtCr(c.price - state.credits)}</span>` : '';
  const foot = `${warn}<button class="btn" ${act('modal-close')}>Fertig</button><button class="btn ${afford ? 'primary' : 'disabled'} sy-buy" ${act('buyship', { st: st.id, cls: c.id })}>Kaufen · ${fmtCr(c.price)}</button>`;
  return `<div class="modal shipyard" role="dialog" aria-modal="true" aria-label="Schiff kaufen"><div class="sheet-head"><h1><span class="eyebrow">Split-Werft · ${esc(fmtCr(state.credits))} verfügbar</span>Schiff kaufen</h1><button class="icon-btn" ${act('modal-close')} aria-label="Schließen">${icon('close', 22)}</button></div><div class="sheet-body">${body}</div><div class="modal-foot sy-foot">${foot}</div></div>`;
}
