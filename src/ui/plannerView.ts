// Stationsplaner: Endprodukte wählen, Kette berechnen, als Fließdiagramm zeigen
import { MODULE_MAP } from '../data/modules';
import { SECTORS } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { GROUP_LABEL, WARES, WARE_IDS, inputsPerHour } from '../data/wares';
import { blueprintState } from '../engine/actions';
import { computePlan, producible, WORKFORCE_BONUS, type PlanResult, type PlanSettings } from '../engine/planner';
import type { GameState } from '../engine/types';
import { esc } from './dom';
import { fmtAmount, fmtCr, fmtDur, fmtInt, fmtNum } from './format';
import { icon, wareDot } from './icons';

const act = (a: string, data: Record<string, string | number> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

export interface PlannerUI {
  plan: PlanSettings;
  planZoom: number;
  planFocus: string;
  planEnergy: boolean;
}

function tile(id: string): string {
  const w = WARES[id];
  const abbr = w.name.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2);
  return `<span class="ware-tile" style="--c:${w.color}">${esc(abbr)}</span>`;
}

function netText(n: number): { text: string; cls: string } {
  if (Math.abs(n) < 0.5) return { text: 'ausgeglichen', cls: 'muted' };
  return n > 0 ? { text: `+${fmtInt(n)} Überschuss`, cls: 'pos' } : { text: `${fmtInt(-n)} fehlen`, cls: 'neg' };
}

export function plannerPanel(state: GameState, p: PlannerUI): string {
  const s = p.plan;
  const r = computePlan(s);
  const targets = s.targets.filter((t) => producible(t.ware));
  const sunOptions = [...new Set([60, 80, 90, 100, 110, 120, 140, s.sunlight])].sort((a, b) => a - b);
  const sectorsBySun = (v: number) => SECTORS.filter((x) => x.sunlight === v).map((x) => x.name).join(', ');
  const targetRows = targets.map((t) => {
    const n = r.nodes[t.ware];
    return `<div class="row" data-key="t-${t.ware}">${tile(t.ware)}<div class="grow"><div class="title">${esc(WARES[t.ware].name)}</div>
      <div class="sub">${fmtInt(n?.prod ?? 0)} / h${n && n.modules > t.modules ? ` · davon ${n.modules - t.modules} Modul${n.modules - t.modules === 1 ? '' : 'e'} für die Kette` : ''}</div></div>
      <div class="stepper"><button ${act('plan-target', { ware: t.ware, d: -1 })} aria-label="Weniger">${icon('minus', 18)}</button><b class="num">${t.modules}</b><button ${act('plan-target', { ware: t.ware, d: 1 })} aria-label="Mehr">${icon('plus', 18)}</button></div></div>`;
  }).join('');

  const body = `
    <p class="lead">Wähle Endprodukte und die Zahl ihrer Module. Der Planer ergänzt alle Vorprodukte mit den X4-Rezepten, rundet auf ganze Module und zeigt Produktion, Verbrauch und Überschuss pro Stunde.</p>
    <div class="section"><h3>Endprodukte<button class="btn small primary" ${act('plan-pick')}>${icon('plus', 16)}Produkt</button></h3>
      ${targetRows ? `<div class="box rows">${targetRows}</div>` : `<div class="box empty">Noch kein Endprodukt gewählt.</div>`}</div>
    <div class="section"><h3>Bedingungen</h3><div class="box rows">
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Sonnenlicht</div><div class="sub">Solarkraftwerk: 175 Energiezellen je 60 s bei 100 %</div></div>
        <select class="compact" data-change="plan-sun" aria-label="Sonnenlicht">${sunOptions.map((v) => `<option value="${v}" ${v === s.sunlight ? 'selected' : ''}>${v} %${sectorsBySun(v) ? ' · ' + esc(sectorsBySun(v)) : ''}</option>`).join('')}</select></div>
      <div class="row"><div class="grow"><div class="title" style="font-weight:500">Volle Belegschaft</div><div class="sub">X4-Bonus auf den Ausstoß je Ware (z. B. Veredelte Metalle +${Math.round((WORKFORCE_BONUS.refinedmetals ?? 0) * 100)} %). Habitate und deren Versorgung sind nicht eingerechnet.</div></div>
        <div class="toggle"><button class="plain ${s.workforce ? 'on' : ''}" ${act('plan-workforce')}>${s.workforce ? 'An' : 'Aus'}</button></div></div>
    </div></div>
    ${targets.length ? resultSections(state, p, r) : ''}`;
  return body;
}

function resultSections(state: GameState, p: PlannerUI, r: PlanResult): string {
  const s = p.plan;
  const mods = Object.values(r.nodes).filter((n) => n.kind === 'module').sort((a, b) => b.column - a.column || WARES[a.ware].name.localeCompare(WARES[b.ware].name));
  const others = Object.values(r.nodes).filter((n) => n.kind !== 'module').sort((a, b) => b.use - a.use);
  const moduleRows = mods.map((n) => {
    const nt = netText(n.net);
    const canBuy = !n.target;
    return `<div class="row plan-row" data-key="m-${n.ware}">${tile(n.ware)}<div class="grow">
        <div class="title">${esc(WARES[n.ware].name)}</div>
        <div class="sub wrap">${n.target ? 'Endprodukt' : `rechnerisch ${fmtNum(n.exact, 2)} Module`} · ${fmtInt(n.rate)}/h je Modul</div>
        <div class="sub wrap">+${fmtInt(n.prod)} / −${fmtInt(n.use)} pro h · <b class="${nt.cls}">${nt.text}</b></div>
        ${canBuy ? `<button class="linkish" ${act('plan-buy', { ware: n.ware })}>Stattdessen zukaufen</button>` : ''}</div>
      <div class="stepper"><button ${act(n.target ? 'plan-target' : 'plan-extra', { ware: n.ware, d: -1 })} aria-label="Ein Modul weniger">${icon('minus', 18)}</button><b class="num">${n.modules}</b><button ${act(n.target ? 'plan-target' : 'plan-extra', { ware: n.ware, d: 1 })} aria-label="Ein Modul mehr">${icon('plus', 18)}</button></div></div>`;
  }).join('');
  const otherRows = others.map((n) => {
    const w = WARES[n.ware];
    const m3 = n.use * w.volume;
    return `<div class="row" data-key="o-${n.ware}">${tile(n.ware)}<div class="grow"><div class="title" style="font-weight:500">${esc(w.name)} <span class="small muted">${n.kind === 'mined' ? 'Abbau' : 'Zukauf'}</span></div>
      <div class="sub wrap">${fmtInt(n.use)} / h${n.kind === 'mined' ? ` · ${fmtAmount(m3)} m³/h ${w.storage === 'Liquid' ? 'Gas' : 'Mineral'}` : ` · ca. ${fmtCr(n.use * w.price.avg)}/h`}</div>
      ${n.kind === 'bought' && producible(n.ware) ? `<button class="linkish" ${act('plan-buy', { ware: n.ware })}>Selbst herstellen</button>` : ''}</div>
      ${n.kind === 'mined' ? `<div class="right"><b>${fmtNum(m3 / minerThroughput(w.storage === 'Liquid' ? 'alligator_gas' : 'alligator_min'), 1)}</b><div class="small muted">M-Miner*</div></div>` : ''}</div>`;
  }).join('');
  const matRows = Object.entries(r.materials).sort((a, b) => b[1] * WARES[b[0]].price.avg - a[1] * WARES[a[0]].price.avg)
    .map(([id, n]) => `<span class="io">${wareDot(WARES[id].color, 7)}<b>${fmtInt(n)}</b> ${esc(WARES[id].name)}</span>`).join('');
  const profit = r.revenue - r.purchase;
  const missingBp = Object.values(r.nodes).filter((n) => n.kind === 'module' && n.modules && blueprintState(state, 'prod_' + n.ware) !== 'owned').map((n) => WARES[n.ware].name);
  return `
    <div class="section"><h3>Fließdiagramm
      <span class="diagram-tools"><button class="icon-btn sm ${p.planEnergy ? 'on' : ''}" ${act('plan-energy')} aria-label="Energiezellen-Linien ein- oder ausblenden" title="Energie-Linien">${icon('energy', 16)}</button><button class="icon-btn sm" ${act('plan-zoom', { d: -1 })} aria-label="Diagramm verkleinern">${icon('minus', 16)}</button><button class="icon-btn sm" ${act('plan-zoom', { d: 1 })} aria-label="Diagramm vergrößern">${icon('plus', 16)}</button><button class="icon-btn sm" ${act('plan-full')} aria-label="Diagramm im Vollbild">${icon('target', 16)}</button></span></h3>
      <div class="diagram-wrap" data-static-scroll>${planDiagram(r, p)}</div>
      <p class="small muted" style="margin-top:6px">Links Rohstoffe, rechts Endprodukte. Linienstärke nach Warenwert, Beschriftung in Einheiten pro Stunde. Tippe ein Modul an, um seine Verbindungen hervorzuheben.</p>
    </div>
    <div class="section"><div class="kv">
      <div><small>Module</small><b>${r.totalModules}</b></div>
      <div><small>Baukosten</small><b>${fmtCr(r.cost)}</b></div>
      <div><small>Bauzeit nacheinander</small><b>${fmtDur(r.buildTime)}</b></div>
      <div><small>Ergebnis / h (Ø-Preise)</small><b class="${profit >= 0 ? 'pos' : 'neg'}">${fmtCr(profit)}</b></div>
      <div><small>Verkauf Überschuss</small><b>${fmtCr(r.revenue)}/h</b></div>
      <div><small>Zukauf</small><b>${fmtCr(r.purchase)}/h</b></div>
    </div></div>
    <div class="section"><h3>Produktionsmodule</h3><div class="box rows">${moduleRows}</div>
      <p class="small muted" style="margin-top:6px">„rechnerisch“ = exakter Bedarf der Kette in Modulen. Mit + und − übersteuerst du die automatische Rundung.${s.workforce ? ' Mit Belegschaftsbonus gerechnet.' : ''}</p></div>
    ${otherRows ? `<div class="section"><h3>Rohstoffe und Zukauf</h3><div class="box rows">${otherRows}</div>
      <p class="small muted" style="margin-top:6px">m³/h = Einheiten × Warenvolumen (X4). *Miner-Zahl ist eine Schätzung mit den Spielwerten dieser App (Alligator, ${fmtAmount(minerThroughput('alligator_min'))} m³/h je Schiff); in X4 hängt sie von Flugweg, Ausrüstung und Feld ab.</p></div>` : ''}
    <div class="section"><h3>Baumaterial laut X4</h3><div class="flow">${matRows}</div></div>
    <div class="section">
      ${missingBp.length ? `<p class="small warn-text">Im Spiel fehlen noch Baupläne: ${missingBp.map(esc).join(', ')}.</p>` : ''}
      <div class="card-actions"><button class="btn primary" ${act('plan-build-modal')}>${icon('wrench', 18)}In Station bauen</button><button class="btn" ${act('plan-reset')}>Zurücksetzen</button></div>
    </div>`;
}

/** Durchsatz eines Miners pro Stunde mit den Spielwerten (Abbau, 2 × 60 km Flug, Andocken) */
function minerThroughput(cls: string): number {
  const c = SHIP_MAP[cls];
  const trip = c.capacity / c.miningRate + (2 * 60) / c.speed + 40;
  return (c.capacity * 3600) / trip;
}

// ---------- Fließdiagramm ----------

const NW = 176, NH = 86, CG = 70, RG = 18, PAD = 16;

export function planDiagram(r: PlanResult, p: PlannerUI): string {
  const cols = r.columns;
  const maxRows = Math.max(1, ...cols.map((c) => c.length));
  const W = PAD * 2 + cols.length * NW + (cols.length - 1) * CG;
  const H = PAD * 2 + maxRows * NH + (maxRows - 1) * RG;
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((c, ci) => {
    const colH = c.length * NH + (c.length - 1) * RG;
    const top = PAD + (H - PAD * 2 - colH) / 2;
    c.forEach((id, ri) => pos.set(id, { x: PAD + ci * (NW + CG), y: top + ri * (NH + RG) }));
  });
  const focus = p.planFocus && r.nodes[p.planFocus] ? p.planFocus : '';
  const edges = r.edges.filter((e) => p.planEnergy || e.from !== 'energycells' || e.to === focus);
  const maxValue = Math.max(1, ...edges.map((e) => e.amount * WARES[e.from].price.avg));
  // Anschlusspunkte gleichmäßig auf die Kanten der Karten verteilen
  const outs = new Map<string, typeof edges>(), ins = new Map<string, typeof edges>();
  for (const e of edges) {
    (outs.get(e.from) ?? outs.set(e.from, []).get(e.from)!).push(e);
    (ins.get(e.to) ?? ins.set(e.to, []).get(e.to)!).push(e);
  }
  const port = (list: typeof edges, e: (typeof edges)[number], y: number, other: (x: (typeof edges)[number]) => string) => {
    const sorted = [...list].sort((a, b) => pos.get(other(a))!.y - pos.get(other(b))!.y);
    const i = sorted.indexOf(e), k = sorted.length;
    const step = Math.min(14, (NH - 24) / Math.max(1, k - 1));
    return y + NH / 2 + (i - (k - 1) / 2) * step;
  };
  let paths = '', labels = '';
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const sx = a.x + NW, sy = port(outs.get(e.from)!, e, a.y, (x) => x.to);
    const tx = b.x, ty = port(ins.get(e.to)!, e, b.y, (x) => x.from);
    const dx = Math.max(30, (tx - sx) * 0.5);
    const color = WARES[e.from].color;
    const width = 1.4 + 4.6 * Math.sqrt((e.amount * WARES[e.from].price.avg) / maxValue);
    const dim = focus && e.from !== focus && e.to !== focus;
    const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} C${(sx + dx).toFixed(1)} ${sy.toFixed(1)} ${(tx - dx).toFixed(1)} ${ty.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    const energy = e.from === 'energycells';
    paths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width.toFixed(1)}" stroke-linecap="round" opacity="${dim ? 0.12 : energy ? 0.45 : 0.85}"${energy ? ' stroke-dasharray="5 5"' : ''}/>`;
    if (!dim && (!energy || focus)) {
      // Beschriftung nahe am Ziel, damit sie der richtigen Linie zuzuordnen ist
      const lx = tx - 34, ly = ty - 5;
      const text = fmtAmount(e.amount);
      const tw = text.length * 6.2 + 8;
      labels += `<g><rect x="${(lx - tw / 2).toFixed(1)}" y="${(ly - 9).toFixed(1)}" width="${tw.toFixed(1)}" height="14" rx="4" fill="#07131f" opacity="0.85"/><text x="${lx.toFixed(1)}" y="${(ly + 2).toFixed(1)}" class="dg-edge" fill="${color}">${text}</text></g>`;
    }
  }
  let cards = '';
  for (const [id, pt] of pos) {
    const n = r.nodes[id];
    const w = WARES[id];
    const dim = focus && focus !== id && !r.edges.some((e) => (e.from === focus && e.to === id) || (e.to === focus && e.from === id));
    const stroke = n.target ? '#ffb547' : n.kind === 'module' ? '#3fe0c5' : n.kind === 'mined' ? w.color : '#8aa5ab';
    const nt = netText(n.net);
    const name = w.name.length > 22 ? w.name.slice(0, 21) + '…' : w.name;
    const line2 = n.kind === 'module' ? `${n.modules}× Modul · ${fmtInt(n.rate)}/h je Modul` : n.kind === 'mined' ? `Abbau · ${fmtAmount(n.use * w.volume)} m³/h` : 'Zukauf';
    const line3 = n.kind === 'module' ? `+${fmtInt(n.prod)} /h` : `${fmtInt(n.use)} /h Bedarf`;
    const line4 = n.kind === 'module' ? (n.target && n.net > 0.5 ? `${fmtInt(n.net)} /h Endprodukt` : nt.text) : n.kind === 'mined' ? 'Miner liefern' : `ca. ${fmtCr(n.use * w.price.avg)}/h`;
    const l4color = n.kind !== 'module' ? '#8aa5ab' : n.target && n.net > 0.5 ? '#ffd28a' : nt.cls === 'pos' ? '#6be38f' : nt.cls === 'neg' ? '#ff8a95' : '#8aa5ab';
    cards += `<g class="dg-node" ${act('plan-focus', { ware: id })} opacity="${dim ? 0.35 : 1}">
      <rect x="${pt.x}" y="${pt.y}" width="${NW}" height="${NH}" rx="12" fill="${n.target ? '#1b1a14' : '#0c1c2a'}" stroke="${stroke}" stroke-width="${focus === id ? 2.6 : 1.4}"${n.kind === 'bought' ? ' stroke-dasharray="5 4"' : ''}/>
      <circle cx="${pt.x + 16}" cy="${pt.y + 18}" r="5" fill="${w.color}"/>
      <text x="${pt.x + 28}" y="${pt.y + 22}" class="dg-title">${esc(name)}</text>
      <text x="${pt.x + 12}" y="${pt.y + 41}" class="dg-sub">${esc(line2)}</text>
      <text x="${pt.x + 12}" y="${pt.y + 60}" class="dg-rate">${esc(line3)}</text>
      <text x="${pt.x + 12}" y="${pt.y + 77}" class="dg-net" fill="${l4color}">${esc(line4)}</text>
    </g>`;
  }
  const z = p.planZoom;
  return `<svg class="diagram" viewBox="0 0 ${W} ${H}" width="${Math.round(W * z)}" height="${Math.round(H * z)}" role="img" aria-label="Fließdiagramm der Produktionskette">${paths}${labels}${cards}</svg>`;
}

// ---------- Dialoge ----------

export function pickerModal(group: string): string {
  const groups = ['all', 'refined', 'hightech', 'shiptech', 'food', 'agri', 'pharma', 'energy'];
  const ids = WARE_IDS.filter((id) => producible(id) && (group === 'all' || WARES[id].group === group))
    .sort((a, b) => WARES[a].tier - WARES[b].tier || WARES[a].name.localeCompare(WARES[b].name));
  const rows = ids.map((id) => {
    const w = WARES[id];
    const ins = inputsPerHour(id).map((i) => WARES[i.ware].name).join(', ');
    return `<div class="row tap" ${act('plan-add', { ware: id })} data-key="${id}">${tile(id)}<div class="grow"><div class="title">${esc(w.name)} <span class="small muted">Stufe ${w.tier}</span></div>
      <div class="sub">${ins ? 'aus ' + esc(ins) : 'Sonnenlicht'}</div></div><span class="small muted">${fmtInt(w.price.avg)} Cr</span>${icon('plus', 18, 'chev')}</div>`;
  }).join('');
  return `<div class="pills" style="margin-bottom:12px">${groups.map((g) => `<button class="pill ${group === g ? 'amber' : ''}" ${act('plan-pick-group', { g })}>${g === 'all' ? 'Alle' : esc(GROUP_LABEL[g as 'refined'])}</button>`).join('')}</div>
    <div class="box rows">${rows}</div>`;
}

export function buildModal(state: GameState, r: PlanResult): string {
  const rows = state.stations.map((st) => `<div class="row tap" ${act('plan-build', { st: st.id })}>${icon('station', 20)}<div class="grow"><div class="title">${esc(st.name)}</div><div class="sub">${st.modules.length} Module · ${st.queue.length + (st.build ? 1 : 0)} im Bau</div></div>${icon('chev', 20, 'chev')}</div>`).join('');
  return `<p class="lead">Die ${r.totalModules} Produktionsmodule werden der Bauliste hinzugefügt – Vorprodukte zuerst. Fehlende Lager passend zu den Waren und ein Dock kommen automatisch dazu. Kosten gesamt etwa ${fmtCr(r.cost)}.</p>
    <div class="box rows">${rows}</div>`;
}

/** Reihenfolge, in der die Module gebaut werden sollen: Rohstoffnahe zuerst */
export function buildOrder(r: PlanResult): string[] {
  const list: string[] = [];
  const nodes = Object.values(r.nodes).filter((n) => n.kind === 'module' && n.modules > 0).sort((a, b) => a.column - b.column);
  for (const n of nodes) for (let i = 0; i < n.modules; i++) list.push('prod_' + n.ware);
  return list.filter((id) => MODULE_MAP[id]);
}
