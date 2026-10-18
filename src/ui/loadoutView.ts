// Hangar „Dein Schiff“ (Kampf-Minispiel): eine kurze Platzliste wie in X4 – Schiff, Bordkanonen, Türme, Raketen,
// Schild, vier Modplätze, Darstellung. Antippen eines Platzes öffnet nur dessen Auswahl; jeder Eintrag zeigt die
// Änderung zum Eingebauten (grün besser, rot schlechter), Antippen baut sofort ein.
import {
  LTURRET_IDS, LTURRETS, MISSILE_DMG, MISSILE_IDS, MISSILES, SHIELD_IDS, SHIELDS, SHIP_IDS, SHIPS, SPECIALS, TURRET_IDS, TURRETS, WEAPON_IDS, WEAPONS,
  loadout, sustainedDps, weaponGun, type ShipId, type X4Gun,
} from '../minigames/loadout';
import { MODS, MOD_IDS, QUALITY, SLOTS, SLOT_INFO, fmtRange, fmtStat, modRange, modState, modStats, refundOf, type ModSlot, type ModStat } from '../minigames/mods';
import { fighterKind, shipArt, spriteUrl } from '../render/shipArt';
import { esc } from './dom';
import { icon } from './icons';

export type LoView = 'home' | 'ship' | 'weapon' | 'turret' | 'lturret' | 'missile' | 'shield' | 'mod' | 'art';
export interface LoModal { view?: LoView; slot?: ModSlot; fresh?: ModSlot; rollN?: number }

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
const num = (n: number, digits = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
const km = (g: X4Gun) => (g.v * g.life) / 1000;

/** Änderung zum Eingebauten als kleines Etikett: grün besser, rot schlechter (lower = kleiner ist besser) */
function delta(v: number, cur: number, fmt: (d: number) => string, lower = false): string {
  const d = v - cur;
  if (Math.abs(d) < Math.max(1e-6, Math.abs(cur) * 0.005)) return '';
  const good = lower ? d < 0 : d > 0;
  return `<span class="lo-d ${good ? 'pos' : 'neg'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`;
}
const pctDelta = (v: number, cur: number, lower = false) => (cur > 0 ? delta(v / cur, 1, (d) => `${Math.round(d * 100)} %`, lower) : '');

/** Datenzeile einer Waffe: Schaden, Takt, Salve/Magazin, Dauerleistung, Reichweite */
function gunData(g: X4Gun, beam = false): string {
  return beam
    ? `${num(g.dmg)} Schaden/s · Dauerstrahl`
    : `${num(g.dmg)}${g.amt > 1 ? ` × ${g.amt}` : ''} Schaden · ${g.mag === 1 ? 'Einzelschuss' : `${num(g.rate, 1)} Schuss/s`}${g.mag > 1 ? ` · ${g.mag}er-Salve, ${num(g.reload, 1)} s Pause` : g.mag === 1 ? `, ${num(g.reload, 1)} s Aufladen` : ''} · ≈ ${num(sustainedDps(g))}/s · ${num(km(g), 1)} km`;
}

/** Ein Eintrag in einer Auswahl: Name, Kennzahlen, Änderungen; der eingebaute zeigt dazu Beschreibung und alle Werte */
function item(o: { key: string; value: string; on: boolean; name: string; tag?: string; data: string; deltas?: string; desc: string; more?: string; pic?: string }): string {
  return `<button class="lo-item ${o.on ? 'on' : ''}" ${act('loadout-set', { key: o.key, value: o.value })}>
    ${o.pic ?? ''}<span class="lo-item-main"><span class="lo-item-name"><b>${esc(o.name)}</b>${o.tag ? `<small>${esc(o.tag)}</small>` : ''}</span>
    <span class="lo-item-data">${esc(o.data)}</span>${o.deltas ? `<span class="lo-deltas">${o.deltas}</span>` : ''}
    <span class="lo-item-desc">${esc(o.desc)}</span>${o.on && o.more ? `<span class="lo-item-more">${esc(o.more)}</span>` : ''}</span>
    ${o.on ? icon('check', 20, 'pos') : '<span class="lo-radio"></span>'}</button>`;
}

export function loadoutView(m: LoModal): { title: string; eyebrow: string; body: string; foot: string } {
  const view: LoView = m.view ?? 'home';
  const lo = loadout();
  const ship = SHIPS[lo.ship];
  const ms = modState(), mx = modStats();
  const pic = (id: ShipId) => spriteUrl(SHIPS[id].sprite + '-ki') ?? spriteUrl(SHIPS[id].fallback + '-ki');
  const wd = WEAPONS[lo.weapon], td = TURRETS[lo.turret], ltd = LTURRETS[lo.lturret ?? 'plasma'];
  const missile = MISSILES[lo.missile ?? 'lenk'];
  const gun = (id: ShipId) => weaponGun(wd, SHIPS[id].gunSize);
  // Feuerkraft eines Schiffs mit der gewählten Bewaffnung (Dauerleistung aus den X4-Werten)
  const fire = (id: ShipId) => { const d = SHIPS[id]; return d.x4.weapons * sustainedDps(weaponGun(wd, d.gunSize), wd.beam) + d.turrets.length * sustainedDps(td.gun, td.beam) + (d.lMounts?.length ?? 0) * sustainedDps(ltd.gun); };
  const modded = (v: number, ...keys: ModStat[]) => keys.reduce((a, k) => a * (1 + (mx[k] ?? 0)), v);
  const foot = (back: boolean) => `<button class="btn" ${back ? act('lo-view', { view: 'home' }) : act('mg-back')}>Zurück</button><button class="btn primary" ${act('ship-art-try')}>Im Kampf ausprobieren</button>`;
  // Kopf einer Auswahl: zurück zur Platzliste und kurze Erklärung (der Titel steht schon oben im Fenster)
  const head = (_title: string, sub: string) => `<div class="lo-pick-head"><button class="lo-back" ${act('lo-view', { view: 'home' })}>${icon('back', 18)}<span>Übersicht</span></button><small>${esc(sub)}</small></div>`;
  const qColor = (sl: ModSlot) => { const md = ms.slots[sl]; return md ? QUALITY[md.q].color : ''; };

  if (view === 'home') {
    const dps = modded(fire(lo.ship), 'dmg', 'rate');
    const range = km(gun(lo.ship)) * (1 + (mx.velocity ?? 0));
    const kpi = (label: string, value: string, mod: boolean) => `<div class="lo-kpi ${mod ? 'mod' : ''}"><small>${label}</small><b>${value}</b></div>`;
    const top = `<div class="lo-top">
      <div class="lo-top-pic">${pic(lo.ship) ? `<img src="${pic(lo.ship)}" alt="">` : ''}</div>
      <div class="lo-top-info"><div class="lo-top-name"><b>${esc(ship.name)}</b><small>${ship.cls} · ${esc(ship.role)} · ${esc(SPECIALS[ship.special].name)} (${SPECIALS[ship.special].key})</small></div>
        <div class="lo-kpis">${kpi('Feuerkraft', `${num(dps)}/s`, !!(mx.dmg || mx.rate))}${kpi('Hülle', num(modded(ship.x4.hull, 'hull')), !!mx.hull)}${kpi('Tempo', `${num(modded(ship.x4.v, 'speed'))} m/s`, !!mx.speed)}${kpi('Reichweite', `${num(range, 1)} km`, !!mx.velocity)}</div></div></div>`;
    const row = (o: { view: LoView; slot?: ModSlot; ic: string; label: string; value: string; sub?: string; cls?: string; color?: string; empty?: boolean }) =>
      `<button class="lo-slot ${o.cls ?? ''} ${o.empty ? 'empty' : ''}" ${o.color ? `style="--q:${o.color}"` : ''} ${act('lo-view', o.slot ? { view: o.view, slot: o.slot } : { view: o.view })}>
        <span class="lo-slot-ic">${icon(o.ic, 18)}</span><span class="lo-slot-txt"><small>${esc(o.label)}</small><b>${esc(o.value)}</b>${o.sub ? `<em>${esc(o.sub)}</em>` : ''}</span>${icon('chev', 18, 'chev')}</button>`;
    const g = gun(lo.ship);
    const arms = [
      row({ view: 'weapon', ic: 'target', label: `Bordkanonen · ${ship.x4.weapons} × ${ship.gunSize.toUpperCase()}`, value: wd.name, sub: `≈ ${num(ship.x4.weapons * sustainedDps(g, wd.beam))}/s · ${wd.beam ? 'Dauerstrahl' : `${num(km(g), 1)} km`}` }),
      ship.lMounts?.length ? row({ view: 'lturret', ic: 'target', label: `Schwere Türme · ${ship.lMounts.length} × L`, value: ltd.name, sub: `≈ ${num(ship.lMounts.length * sustainedDps(ltd.gun))}/s · ${num(km(ltd.gun), 1)} km` }) : '',
      ship.turrets.length ? row({ view: 'turret', ic: 'target', label: `${ship.lMounts?.length ? 'M-Türme' : 'Türme'} · ${ship.turrets.length} × M`, value: td.name, sub: `≈ ${num(ship.turrets.length * sustainedDps(td.gun, td.beam))}/s · schwenkt ${td.turn}°/s` }) : '',
      ship.x4.launchers ? row({ view: 'missile', ic: 'up', label: `Raketen · ${ship.x4.launchers} × Werfer, Lager ${ship.x4.missiles}`, value: missile.name, sub: missile.role }) : '',
    ].join('');
    const mods = SLOTS.map((sl) => {
      const md = ms.slots[sl];
      return row({ view: 'mod', slot: sl, ic: SLOT_INFO[sl].icon, label: `Mod · ${SLOT_INFO[sl].name}`, value: md ? `${MODS[md.id].name} (${QUALITY[md.q].name})` : 'frei', sub: md ? fmtStat(MODS[md.id].stat, md.value) : undefined, cls: `lo-slot-mod lo-slot-mod-${sl} ${md ? 'set' : ''}`, color: qColor(sl), empty: !md });
    }).join('');
    const total = (Object.entries(mx) as [ModStat, number][]).filter(([, v]) => Math.abs(v) > 1e-6);
    const body = `${top}
      <div class="section"><h3>Schiff</h3><div class="lo-slots">${row({ view: 'ship', ic: 'fleet', label: `${ship.cls}-Klasse · ${ship.role}`, value: ship.name, sub: `Hülle ${num(ship.x4.hull)} · ${ship.x4.v} m/s · ${ship.x4.weapons} Waffenplätze${ship.x4.launchers ? ` · ${ship.x4.launchers} Werfer` : ''}${ship.turrets.length ? ` · ${ship.turrets.length + (ship.lMounts?.length ?? 0)} Türme` : ''}` })}</div></div>
      <div class="section"><h3>Bewaffnung</h3><div class="lo-slots">${arms}</div></div>
      <div class="section"><h3>Abwehr</h3><div class="lo-slots">${row({ view: 'shield', ic: 'energy', label: `Schild · ${ship.x4.shields} × ${ship.cls}${ship.x4.mShields ? ` + ${ship.x4.mShields} × M` : ''}`, value: SHIELDS[lo.shield].name, sub: SHIELDS[lo.shield].desc })}</div></div>
      <div class="section"><h3>Mods <span class="lo-parts">${icon('gift', 13)} ${ms.parts} Modteile</span></h3><div class="lo-slots">${mods}</div>
        ${total.length ? `<div class="mod-total"><small>Gesamtwirkung</small>${total.map(([k, v]) => `<span class="${v > 0 ? 'pos' : 'neg'}">${esc(fmtStat(k, v))}</span>`).join('')}</div>` : ''}</div>
      <div class="section"><h3>Darstellung</h3><div class="lo-slots">${row({ view: 'art', ic: 'star', label: 'Grafik im Kampf', value: shipArt() === 'ai' ? 'KI-Bild' : shipArt() === 'render' ? 'Gerendert' : 'Gezeichnet' })}</div></div>`;
    return { eyebrow: 'Hangar', title: 'Dein Schiff', body, foot: foot(false) };
  }

  if (view === 'ship') {
    const cur = SHIPS[lo.ship], curFire = fire(lo.ship);
    const shipItem = (id: ShipId) => {
      const d = SHIPS[id], url = pic(id), real = spriteUrl(d.sprite + '-ki');
      return item({
        key: 'ship', value: id, on: lo.ship === id, name: d.name, tag: d.role,
        pic: `<span class="lo-thumb">${url ? `<img src="${url}" alt="" style="${real ? '' : 'opacity:.45'}">` : ''}</span>`,
        data: `Hülle ${num(d.x4.hull)} · ${d.x4.v} m/s · ≈ ${num(fire(id))}/s · ${d.x4.weapons} Waffen${d.x4.launchers ? ` · ${d.x4.launchers} Werfer` : ''}${d.turrets.length ? ` · ${d.turrets.length + (d.lMounts?.length ?? 0)} Türme` : ''}`,
        deltas: lo.ship === id ? '' : `${pctDelta(d.x4.hull, cur.x4.hull) ? `<i>Hülle</i>${pctDelta(d.x4.hull, cur.x4.hull)}` : ''}${delta(d.x4.v, cur.x4.v, (x) => `${num(x)} m/s`) ? `<i>Tempo</i>${delta(d.x4.v, cur.x4.v, (x) => `${num(x)} m/s`)}` : ''}${pctDelta(fire(id), curFire) ? `<i>Feuerkraft</i>${pctDelta(fire(id), curFire)}` : ''}`,
        desc: d.desc,
        more: `Spezialfähigkeit: ${SPECIALS[d.special].name} (Taste ${SPECIALS[d.special].key}) · ${d.x4.engines} Triebwerk${d.x4.engines > 1 ? 'e' : ''} · ${d.x4.shields} Schild${d.x4.shields > 1 ? 'e' : ''} ${d.cls}${d.x4.mShields ? ` + ${d.x4.mShields} M` : ''}${d.x4.launchers ? ` · ${d.x4.missiles} Raketen im Lager` : ''}`,
      });
    };
    const group = (cls: 'S' | 'M' | 'L', name: string) => { const ids = SHIP_IDS.filter((id) => SHIPS[id].cls === cls); return ids.length ? `<h3 class="lo-sub">${name}</h3><div class="lo-items">${ids.map(shipItem).join('')}</div>` : ''; };
    const body = `${head('Schiff', 'Feuerkraft mit deiner aktuellen Bewaffnung · Änderungen zum Eingebauten')}${group('S', 'S – Jäger')}${group('M', 'M – Korvetten und Fregatten')}${group('L', 'L – Zerstörer')}`;
    return { eyebrow: 'Hangar', title: 'Schiff wählen', body, foot: foot(true) };
  }

  if (view === 'weapon') {
    const n = ship.x4.weapons, size = ship.gunSize;
    const curG = weaponGun(wd, size), curDps = n * sustainedDps(curG, wd.beam), curKm = wd.beam ? 0 : km(curG);
    const wItem = (id: (typeof WEAPON_IDS)[number]) => {
      const d = WEAPONS[id], g = weaponGun(d, size), dps = n * sustainedDps(g, d.beam);
      return item({
        key: 'weapon', value: id, on: lo.weapon === id, name: d.name,
        data: `≈ ${num(dps)}/s gesamt · ${d.beam ? 'Dauerstrahl' : `${num(km(g), 1)} km`}`,
        deltas: lo.weapon === id ? '' : `${delta(dps, curDps, (x) => `${num(x)}/s`)}${!d.beam && !wd.beam ? delta(km(g), curKm, (x) => `${num(x, 1)} km`) : ''}`,
        desc: d.desc, more: gunData(g, d.beam),
      });
    };
    const group = (grp: string, name: string) => { const ids = WEAPON_IDS.filter((id) => WEAPONS[id].group === grp); return ids.length ? `<h3 class="lo-sub">${name}</h3><div class="lo-items">${ids.map(wItem).join('')}</div>` : ''; };
    const body = `${head('Bordkanonen', `${n} × ${size.toUpperCase()}-Waffenplatz · Werte aus X4 9.0 (Mk1); die Mk-Stufe stellst du im Minispiel-Menü ein`)}
      ${group('split', 'Split-Waffen')}${size === 'l' ? group('schwer', 'Schwere Waffen (nur L)') : ''}${group('allgemein', 'Allgemeine Waffen')}`;
    return { eyebrow: 'Hangar', title: 'Bordkanonen', body, foot: foot(true) };
  }

  if (view === 'turret') {
    const n = ship.turrets.length, curDps = n * sustainedDps(td.gun, td.beam);
    const body = `${head(ship.lMounts?.length ? 'M-Türme' : 'Türme', `${n} × M, Split · schießen von selbst auf Ziele in Reichweite`)}<div class="lo-items">${TURRET_IDS.map((id) => {
      const t = TURRETS[id], dps = n * sustainedDps(t.gun, t.beam);
      return item({ key: 'turret', value: id, on: lo.turret === id, name: t.name, data: `≈ ${num(dps)}/s gesamt · schwenkt ${t.turn}°/s`, deltas: lo.turret === id ? '' : `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(t.turn, td.turn, (x) => `${num(x)}°/s`)}`, desc: t.desc, more: gunData(t.gun, t.beam) });
    }).join('')}</div>`;
    return { eyebrow: 'Hangar', title: 'Türme', body, foot: foot(true) };
  }

  if (view === 'lturret') {
    const n = ship.lMounts?.length ?? 0, curDps = n * sustainedDps(ltd.gun);
    const body = `${head('Schwere Türme', `${n} × L, Split · an den Schultern unter den Panzerplatten; Werte angenommen`)}<div class="lo-items">${LTURRET_IDS.map((id) => {
      const t = LTURRETS[id], url = spriteUrl(t.barrel), dps = n * sustainedDps(t.gun);
      return item({ key: 'lturret', value: id, on: (lo.lturret ?? 'plasma') === id, name: t.name, pic: url ? `<span class="lo-barrel"><img src="${url}" alt=""></span>` : '', data: `≈ ${num(dps)}/s gesamt · ${num(km(t.gun), 1)} km · schwenkt ${t.turn}°/s`, deltas: (lo.lturret ?? 'plasma') === id ? '' : `${delta(dps, curDps, (x) => `${num(x)}/s`)}${delta(km(t.gun), km(ltd.gun), (x) => `${num(x, 1)} km`)}`, desc: t.desc, more: gunData(t.gun) });
    }).join('')}</div>`;
    return { eyebrow: 'Hangar', title: 'Schwere Türme', body, foot: foot(true) };
  }

  if (view === 'missile') {
    const dmgOf = (d: typeof missile) => MISSILE_DMG * d.dmg * (d.split ?? 1);
    const reach = (d: typeof missile) => d.v * d.life + (d.split ? 120 : 0);
    const reachName = (r: number) => (r > 2000 ? 'sehr groß' : r > 1300 ? 'mittel' : 'kurz');
    const body = `${head('Raketen', `${ship.x4.launchers} × Werfer, Lager ${ship.x4.missiles} · je Werfer zwei Raketen pro Salve, Nachladen ${ship.missileReload && ship.missileReload < 1 ? `${Math.round(8 * ship.missileReload)} s` : '8 s'}`)}
      <div class="lo-items">${MISSILE_IDS.map((id) => {
        const d = MISSILES[id], on = (lo.missile ?? 'lenk') === id;
        return item({
          key: 'missile', value: id, on, name: d.name, tag: d.role,
          data: `${d.split ? `${d.split} × ${Math.round(MISSILE_DMG * d.dmg)}` : Math.round(MISSILE_DMG * d.dmg)} Schaden · Reichweite ${reachName(reach(d))} · ${d.slots > 1 ? `${d.slots} Lagerplätze` : '1 Lagerplatz'}`,
          deltas: on ? '' : `${delta(dmgOf(d), dmgOf(missile), (x) => `${Math.round(x)} Schaden`)}${delta(reach(d), reach(missile), (x) => `${num(x / 1000, 1)} km`)}${delta(d.slots, missile.slots, (x) => `${x} Platz`, true)}`,
          desc: d.desc,
          more: `${d.vs?.L ? `Großziele ×${String(d.vs.L).replace('.', ',')}, Jäger ×${String(d.vs.S).replace('.', ',')}` : ''}${d.splash ? ' · Druckwelle' : ''}${d.vsShield ? ' · an Schilden halb' : ''}${d.stun ? ` · Schild ${d.stun} s aus` : ''}${d.jam ? ` · Waffen ${d.jam} s gestört` : ''}`.replace(/^ · /, ''),
        });
      }).join('')}</div>
      <p class="small muted lo-note">Nachschub: Raketen-Fundstück füllt das halbe Lager, die seltene Munitionskiste das ganze, nach jeder Welle bringt der Frachter ein Viertel.</p>`;
    return { eyebrow: 'Hangar', title: 'Raketen', body, foot: foot(true) };
  }

  if (view === 'shield') {
    const cur = SHIELDS[lo.shield];
    const body = `${head('Schild', `${ship.x4.shields} × ${ship.cls}${ship.x4.mShields ? ` + ${ship.x4.mShields} × M` : ''} · gilt für alle Schildplätze`)}<div class="lo-items">${SHIELD_IDS.map((id) => {
      const s = SHIELDS[id], f = (v: number) => `×${String(Math.round(v * 100) / 100).replace('.', ',')}`;
      return item({ key: 'shield', value: id, on: lo.shield === id, name: s.name, data: `Kapazität ${f(s.cap)} · Aufladen ${f(s.regen)} · Ladepause ${f(s.delay)}`, deltas: lo.shield === id ? '' : `${pctDelta(s.cap, cur.cap) ? `<i>Kapazität</i>${pctDelta(s.cap, cur.cap)}` : ''}${pctDelta(s.regen, cur.regen) ? `<i>Aufladen</i>${pctDelta(s.regen, cur.regen)}` : ''}${pctDelta(s.delay, cur.delay, true) ? `<i>Pause</i>${pctDelta(s.delay, cur.delay, true)}` : ''}`, desc: s.desc });
    }).join('')}</div>`;
    return { eyebrow: 'Hangar', title: 'Schild', body, foot: foot(true) };
  }

  if (view === 'mod') {
    const slot: ModSlot = m.slot ?? 'weapon';
    const cur = ms.slots[slot];
    const switcher = `<div class="segment lo-modtabs">${SLOTS.map((sl) => { const md = ms.slots[sl]; return `<button class="${sl === slot ? 'on' : ''} ${md ? 'set' : ''}" style="${md ? `--q:${QUALITY[md.q].color}` : ''}" ${act('lo-view', { view: 'mod', slot: sl })}>${icon(SLOT_INFO[sl].icon, 14)}${SLOT_INFO[sl].name}</button>`; }).join('')}</div>`;
    const detail = cur ? (() => {
      const d = MODS[cur.id], q = QUALITY[cur.q], [a, b] = modRange(cur.id, cur.q);
      return `<div class="mod-detail" style="--q:${q.color}">
        <div class="mod-head"><b>${esc(d.name)}</b><span class="mod-q">${q.name}</span></div>
        <div class="mod-main">${esc(fmtStat(d.stat, cur.value))}</div>
        <div class="mod-roll ${m.fresh === slot ? 'fresh' : ''}" data-key="roll-${slot}-${m.rollN ?? 0}" style="--v:${(cur.roll * 100).toFixed(1)}%"><i class="bar"></i><i class="mk"></i>
          <span class="lo">${esc(fmtStat(d.stat, a))}</span><span class="hi">${esc(fmtStat(d.stat, b))}</span></div>
        <p class="small muted" style="margin:6px 0 0">Gewürfelt: ${Math.round(cur.roll * 100)} % der Spanne${cur.roll > 0.85 ? ' – ein Spitzenwert!' : cur.roll < 0.2 ? ' – eher schwach' : ''}</p>
        ${cur.bonus.length || d.cost ? `<ul class="mod-fx">${cur.bonus.map((x) => `<li class="pos">${esc(fmtStat(x.stat, x.value))}</li>`).join('')}${d.cost ? `<li class="neg">${esc(fmtStat(d.cost[0], d.cost[1]))}</li>` : ''}</ul>` : ''}
        <div class="card-actions" style="margin-top:10px"><button class="btn small" ${act('mod-remove', { slot })}>${icon('trash', 16)}Zerlegen (+${refundOf(cur.q)} Modteile)</button></div></div>`;
    })() : `<div class="mod-detail empty"><p class="small muted" style="margin:0">Noch kein Mod im Platz „${SLOT_INFO[slot].name}“. Wähle unten Mod und Güte – der Wert wird beim Bau ausgewürfelt.</p></div>`;
    const short = { 1: 'Grundl.', 2: 'Fortg.', 3: 'Außerg.' } as const;
    const recipes = MOD_IDS.filter((id) => MODS[id].slot === slot).map((id) => {
      const d = MODS[id];
      const na = d.stat === 'missiles' && !ship.x4.launchers;
      return `<div class="mod-recipe ${cur?.id === id ? 'cur' : ''}"><div class="mod-recipe-head"><b>${esc(d.name)}</b>${cur?.id === id ? '<small>eingebaut</small>' : ''}</div>
        <div class="sub wrap">${esc(d.desc)}${d.cost ? ` <span class="neg">${esc(fmtStat(d.cost[0], d.cost[1]))}</span>` : ''}${na ? ` <span class="warn-text">Wirkt nicht bei der ${esc(ship.name)}.</span>` : ''}</div>
        <div class="mod-qrow">${([1, 2, 3] as const).map((qq) => { const Q = QUALITY[qq], ok = ms.parts >= Q.cost; return `<button class="mod-qbtn2" style="--q:${Q.color}" ${ok ? act('mod-craft', { id, q: String(qq) }) : 'disabled'} title="${Q.name}"><b>${short[qq]}</b><span>${esc(fmtRange(id, qq))}</span>${Q.bonus ? `<small>+${Q.bonus} Bonus</small>` : '<small>&nbsp;</small>'}<em>${Q.cost} ${icon('gift', 12)}</em></button>`; }).join('')}</div></div>`;
    }).join('');
    const body = `${head(`Mod: ${SLOT_INFO[slot].name}`, `${ms.parts} Modteile · 1 je Stern in jedem Minispiel, Tagesaufgaben und Herausforderungen doppelt`)}${switcher}
      <div class="section"><h3>Eingebaut</h3>${detail}</div>
      <div class="section"><h3>${cur ? 'Neu bauen (ersetzt den eingebauten)' : 'Bauen'}</h3>
        <div class="mod-legend">${([1, 2, 3] as const).map((qq) => `<span style="--q:${QUALITY[qq].color}"><i></i>${QUALITY[qq].name}${QUALITY[qq].bonus ? ` (+${QUALITY[qq].bonus} Bonus)` : ''}</span>`).join('')}</div>
        <div class="mod-recipes">${recipes}</div>
        <p class="small muted lo-note">Wie in X4: Beim Bau wird der Wert innerhalb der Spanne ausgewürfelt – Spitzenwerte sind selten. Höhere Güte bringt Zusatzeffekte.</p></div>`;
    return { eyebrow: 'Hangar', title: 'Mods', body, foot: foot(true) };
  }

  // Darstellung des eigenen Jägers
  const body = `${head('Darstellung', 'wie dein Schiff im Kampf aussieht')}
    <div class="segment">${(['ai', 'render', 'vector'] as const).map((a) => `<button class="${shipArt() === a ? 'on' : ''}" ${act('ship-art', { art: a, kind: fighterKind() })}>${a === 'ai' ? 'KI-Bild' : a === 'render' ? 'Gerendert' : 'Gezeichnet'}</button>`).join('')}</div>
    <div class="box rows" style="margin-top:10px"><div class="row tap" ${act('ship-art-open')}>${icon('star', 20)}<div class="grow"><div class="title" style="font-weight:500">Grafikvergleich der Jäger</div><div class="sub">KI-Bild, gerendert und gezeichnet nebeneinander</div></div>${icon('chev', 20, 'chev')}</div></div>`;
  return { eyebrow: 'Hangar', title: 'Darstellung', body, foot: foot(true) };
}
