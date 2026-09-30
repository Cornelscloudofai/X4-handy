// Stationsplaner: Entwurf oder echte Station planen, Kette als Fließdiagramm bearbeiten
import { canUndo, undoLabel } from './undo';
import { MODULE_MAP } from '../data/modules';
import { SECTORS, sector } from '../data/sectors';
import { SHIP_MAP } from '../data/ships';
import { GROUP_LABEL, WARES, WARE_IDS, inputsPerHour } from '../data/wares';
import { blueprintState } from '../engine/actions';
import { stationById } from '../engine/logistics';
import { computePlan, producible, stationModuleCounts, stationPlan, WORKFORCE_BONUS, type ModuleCount, type PlanNode, type PlanResult, type PlanSettings } from '../engine/planner';
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
  /** Hervorhebung: false = nur direkte Nachbarn, true = ganze Kette bis Rohstoff und Endprodukt */
  planChain: boolean;
  planEnergy: boolean;
  /** 'draft' oder Stations-ID */
  planSource: string;
  planDetails: boolean;
  dg: { x: number; y: number; k: number };
}

/** Die gerade bearbeitete Planung: Entwurf oder die Module einer Station */
export function activePlan(state: GameState, p: PlannerUI): { settings: PlanSettings; station: string; counts: Record<string, ModuleCount> } {
  const st = p.planSource !== 'draft' ? stationById(state, p.planSource) : undefined;
  if (st) return { settings: stationPlan(st, sector(st.sector).sunlight), station: st.id, counts: stationModuleCounts(st) };
  return { settings: p.plan, station: '', counts: {} };
}

function tile(id: string): string {
  const w = WARES[id];
  const abbr = w.name.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2);
  return `<span class="ware-tile" style="--c:${w.color}">${esc(abbr)}</span>`;
}

type NodeState = 'deficit' | 'underfed' | 'ok' | 'surplus' | 'end' | 'mined' | 'bought';

function nodeState(n: PlanNode): NodeState {
  if (n.kind === 'mined') return 'mined';
  if (n.kind === 'bought') return 'bought';
  if (n.net < -0.5) return 'deficit';
  if (n.eff < 0.999) return 'underfed';
  if (n.endProduct) return 'end';
  return n.net > 0.5 ? 'surplus' : 'ok';
}

const STATE_COLOR: Record<NodeState, string> = {
  deficit: '#ff6b7a', underfed: '#ffb547', ok: '#3fe0c5', surplus: '#6be38f', end: '#ffd28a', mined: '#c9a27a', bought: '#8aa5ab',
};

// ---------- Planer-Blatt ----------

export function plannerPanel(state: GameState, p: PlannerUI): string {
  const { settings: s, station, counts } = activePlan(state, p);
  const r = computePlan(s);
  const st = station ? stationById(state, station)! : null;
  const problems = Object.values(r.nodes).filter((n) => n.kind === 'module' && (n.net < -0.5 || n.eff < 0.999)).length;
  const profit = r.revenue - r.purchase;
  const hasPlan = Object.keys(r.nodes).length > 0;

  const source = `<div class="plan-source"><label for="planSource">Planung für</label>
    <select id="planSource" data-change="plan-source">
      <option value="draft" ${!st ? 'selected' : ''}>Entwurf (frei planen)</option>
      ${state.stations.map((x) => `<option value="${x.id}" ${st?.id === x.id ? 'selected' : ''}>${esc(x.name)} · ${esc(sector(x.sector).name)}</option>`).join('')}
    </select></div>`;

  const summary = hasPlan ? `<div class="plan-summary">
      <div><small>Module</small><b>${r.totalModules}</b></div>
      <div><small>${st ? 'Geplant' : 'Kosten'}</small><b>${st ? fmtInt(Object.values(counts).reduce((a, c) => a + c.planned + c.building, 0)) : fmtCr(r.cost)}</b></div>
      <div><small>Ertrag/h</small><b class="${profit >= 0 ? 'pos' : 'neg'}">${fmtCr(profit)}</b></div>
      <div class="${problems ? 'warn' : ''}"><small>Engpässe</small><b>${problems}</b></div>
    </div>` : '';

  const preview = hasPlan ? `<button class="diagram-preview" ${act('plan-full')} aria-label="Fließdiagramm im Vollbild bearbeiten">
      ${diagramSvg(r, p, counts, { preview: true })}
      <span class="preview-hint">${icon('planner', 16)}Antippen: Vollbild-Editor</span>
    </button>` : '';

  let controls: string;
  if (st) {
    controls = `<div class="section"><div class="box" style="padding:12px">
      <p class="small" style="margin:0 0 10px;color:var(--text-2)">Du planst die echte Station: Jedes + im Diagramm fügt eine Position in die Baureihenfolge ein, jedes − entfernt die letzte noch nicht begonnene. Gebaute Module bleiben unberührt.</p>
      <div class="card-actions"><button class="btn" ${act('open-station', { id: st.id, tab: 'modules' })}>${icon('wrench', 16)}Baureihenfolge</button><button class="btn" ${act('plan-pick')}>${icon('plus', 16)}Produkt</button></div></div></div>`;
  } else {
    const targets = s.targets.filter((t) => producible(t.ware));
    const targetRows = targets.map((t) => {
      const n = r.nodes[t.ware];
      return `<div class="row" data-key="t-${t.ware}">${tile(t.ware)}<div class="grow"><div class="title">${esc(WARES[t.ware].name)}</div><div class="sub">${fmtInt(n?.prod ?? 0)} / h</div></div>
        <div class="stepper"><button ${act('plan-target', { ware: t.ware, d: -1 })} aria-label="Weniger">${icon('minus', 18)}</button><b class="num">${t.modules}</b><button ${act('plan-target', { ware: t.ware, d: 1 })} aria-label="Mehr">${icon('plus', 18)}</button></div></div>`;
    }).join('');
    const sunOptions = [...new Set([60, 80, 90, 100, 110, 120, 140, s.sunlight])].sort((a, b) => a - b);
    const sectorsBySun = (v: number) => SECTORS.filter((x) => x.sunlight === v).map((x) => x.name).join(', ');
    controls = `<div class="section"><h3>Endprodukte<button class="btn small primary" ${act('plan-pick')}>${icon('plus', 16)}Produkt</button></h3>
        ${targetRows ? `<div class="box rows">${targetRows}</div>` : `<div class="box empty">Wähle ein Endprodukt – der Planer ergänzt die Vorprodukte nach X4-Rezepten.</div>`}</div>
      <div class="section plan-options">
        <label class="opt"><span>Sonne</span><select data-change="plan-sun" aria-label="Sonnenlicht">${sunOptions.map((v) => `<option value="${v}" ${v === s.sunlight ? 'selected' : ''}>${v} %${sectorsBySun(v) ? ' · ' + esc(sectorsBySun(v)) : ''}</option>`).join('')}</select></label>
        <button class="opt ${s.auto !== false ? 'on' : ''}" ${act('plan-auto')}><span>Vorprodukte</span><b>${s.auto !== false ? 'automatisch' : 'von Hand'}</b></button>
        <button class="opt ${s.workforce ? 'on' : ''}" ${act('plan-workforce')} title="X4-Belegschaftsbonus auf den Ausstoß, z. B. Veredelte Metalle +${Math.round((WORKFORCE_BONUS.refinedmetals ?? 0) * 100)} %"><span>Belegschaft</span><b>${s.workforce ? 'Bonus an' : 'ohne'}</b></button>
      </div>`;
  }

  const details = hasPlan ? `<div class="section">
      <button class="details-toggle" ${act('plan-details')} aria-expanded="${p.planDetails}">${icon(p.planDetails ? 'up' : 'down', 16)}Stückliste, Rohstoffe und Baumaterial</button>
      ${p.planDetails ? detailsBlock(state, r, !!st) : ''}</div>` : '';

  const actions = !st && hasPlan ? `<div class="section card-actions"><button class="btn primary" ${act('plan-build-modal')}>${icon('wrench', 18)}In Station übernehmen</button><button class="btn" ${act('plan-reset')}>Zurücksetzen</button>${canUndo() ? `<button class="btn" ${act('undo')}>${icon('undo', 18)}Rückgängig</button>` : ''}</div>` : '';

  return `${source}${summary}${preview}${controls}${details}${actions}`;
}

function detailsBlock(state: GameState, r: PlanResult, isStation: boolean): string {
  const mods = Object.values(r.nodes).filter((n) => n.kind === 'module').sort((a, b) => a.column - b.column || WARES[a.ware].name.localeCompare(WARES[b.ware].name));
  const rows = mods.map((n) => {
    const st = nodeState(n);
    return `<div class="row slim" data-key="d-${n.ware}">${wareDot(WARES[n.ware].color, 9)}<div class="grow"><div class="title" style="font-weight:500">${esc(WARES[n.ware].name)}</div>
      <div class="sub">${n.modules} Modul${n.modules === 1 ? '' : 'e'} · rechnerisch ${fmtNum(n.exact, 2)} · +${fmtInt(n.prod)} / −${fmtInt(n.use)} pro h</div></div>
      <div class="right"><b style="color:${STATE_COLOR[st]}">${n.net >= 0 ? '+' : '−'}${fmtInt(Math.abs(n.net))}</b></div>
      ${!isStation && !n.target ? `<button class="icon-btn sm" ${act('plan-buy', { ware: n.ware })} title="Stattdessen zukaufen" aria-label="${esc(WARES[n.ware].name)} zukaufen">${icon('market', 15)}</button>` : ''}</div>`;
  }).join('');
  const raw = Object.values(r.nodes).filter((n) => n.kind !== 'module').sort((a, b) => b.use - a.use).map((n) => {
    const w = WARES[n.ware];
    return `<div class="row slim" data-key="r-${n.ware}">${wareDot(w.color, 9)}<div class="grow"><div class="title" style="font-weight:500">${esc(w.name)} <span class="small muted">${n.kind === 'mined' ? 'Abbau' : 'Zukauf'}</span></div>
      <div class="sub">${fmtInt(n.use)} / h${n.kind === 'mined' ? ` · ${fmtAmount(n.use * w.volume)} m³/h · ca. ${fmtNum((n.use * w.volume) / minerThroughput(w.storage === 'Liquid' ? 'alligator_gas' : 'alligator_min'), 1)} M-Miner` : ` · ca. ${fmtCr(n.use * w.price.avg)}/h`}</div></div>
      ${n.kind === 'bought' && producible(n.ware) && !isStation ? `<button class="icon-btn sm" ${act('plan-buy', { ware: n.ware })} title="Selbst herstellen" aria-label="${esc(w.name)} selbst herstellen">${icon('factory', 15)}</button>` : ''}</div>`;
  }).join('');
  const mats = Object.entries(r.materials).sort((a, b) => b[1] * WARES[b[0]].price.avg - a[1] * WARES[a[0]].price.avg)
    .map(([id, n]) => `<span class="io">${wareDot(WARES[id].color, 7)}<b>${fmtInt(n)}</b> ${esc(WARES[id].name)}</span>`).join('');
  const missingBp = mods.filter((n) => n.modules && blueprintState(state, 'prod_' + n.ware) !== 'owned').map((n) => WARES[n.ware].name);
  return `<div class="box rows" style="margin-top:8px">${rows}${raw}</div>
    <p class="small muted" style="margin:8px 0">Baukosten ${fmtCr(r.cost)} · Bauzeit nacheinander ${fmtDur(r.buildTime)} · Miner-Zahl ist eine Schätzung mit den Spielwerten dieser App.</p>
    <div class="flow">${mats}</div>
    ${missingBp.length ? `<p class="small warn-text" style="margin-top:8px">Noch ohne Bauplan: ${missingBp.map(esc).join(', ')}.</p>` : ''}`;
}

/** Durchsatz eines Miners pro Stunde mit den Spielwerten (Abbau, 2 × 60 km Flug, Andocken) */
function minerThroughput(cls: string): number {
  const c = SHIP_MAP[cls];
  const trip = c.capacity / c.miningRate + (2 * 60) / c.speed + 40;
  return (c.capacity * 3600) / trip;
}

// ---------- Fließdiagramm ----------

export const NW = 204, NH = 124;
const CG = 84, RG = 46, PAD = 30;

export function nodePositions(r: PlanResult, layout: Record<string, { x: number; y: number }> = {}): Map<string, { x: number; y: number }> {
  const cols = r.columns;
  const maxRows = Math.max(1, ...cols.map((c) => c.length));
  const H = maxRows * NH + (maxRows - 1) * RG;
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((c, ci) => {
    const colH = c.length * NH + (c.length - 1) * RG;
    const top = PAD + (H - colH) / 2;
    c.forEach((id, ri) => pos.set(id, layout[id] ? { ...layout[id] } : { x: PAD + ci * (NW + CG), y: top + ri * (NH + RG) }));
  });
  return pos;
}

export function diagramBounds(pos: Map<string, { x: number; y: number }>): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pos.values()) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + NW); y1 = Math.max(y1, p.y + NH); }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 400, h: 200 };
  return { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 };
}

/** Ganze Kette einer Ware: alle Vorstufen bis zum Rohstoff und alle Abnehmer bis zum Endprodukt */
export function chainOf(r: PlanResult, focus: string): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set([focus]);
  const edges = new Set<string>();
  const walk = (start: string, up: boolean) => {
    const todo = [start];
    const seen = new Set([start]);
    while (todo.length) {
      const cur = todo.pop()!;
      for (const e of r.edges) {
        if ((up ? e.to : e.from) !== cur) continue;
        const next = up ? e.from : e.to;
        edges.add(e.from + '>' + e.to);
        nodes.add(next);
        if (!seen.has(next)) { seen.add(next); todo.push(next); }
      }
    }
  };
  walk(focus, true);
  walk(focus, false);
  return { nodes, edges };
}

interface DiagramOpts { preview?: boolean; layout?: Record<string, { x: number; y: number }> }

/** SVG-Inhalt: Kanten, Beschriftungen, Modul-Kästchen mit +/− und Empfehlung */
export function diagramContent(r: PlanResult, p: PlannerUI, counts: Record<string, ModuleCount>, pos: Map<string, { x: number; y: number }>, preview: boolean): string {
  const focus = p.planFocus && r.nodes[p.planFocus] ? p.planFocus : '';
  const chain = focus && p.planChain ? chainOf(r, focus) : null;
  const edgeLit = (e: { from: string; to: string }) => (chain ? chain.edges.has(e.from + '>' + e.to) : e.from === focus || e.to === focus);
  const nodeLit = (id: string) => (chain ? chain.nodes.has(id) : focus === id || r.edges.some((e) => (e.from === focus && e.to === id) || (e.to === focus && e.from === id)));
  const edges = r.edges.filter((e) => pos.has(e.from) && pos.has(e.to) && (p.planEnergy || e.from !== 'energycells' || e.to === focus || e.from === focus));
  const maxValue = Math.max(1, ...edges.map((e) => e.amount * WARES[e.from].price.avg));
  const outs = new Map<string, typeof edges>(), ins = new Map<string, typeof edges>();
  for (const e of edges) {
    (outs.get(e.from) ?? outs.set(e.from, []).get(e.from)!).push(e);
    (ins.get(e.to) ?? ins.set(e.to, []).get(e.to)!).push(e);
  }
  const port = (list: typeof edges, e: (typeof edges)[number], y: number, other: (x: (typeof edges)[number]) => string) => {
    const sorted = [...list].sort((a, b) => pos.get(other(a))!.y - pos.get(other(b))!.y);
    const i = sorted.indexOf(e), k = sorted.length;
    const step = Math.min(16, (NH - 30) / Math.max(1, k - 1));
    return y + NH / 2 + (i - (k - 1) / 2) * step;
  };
  let paths = '', labels = '';
  for (const e of edges) {
    const a = pos.get(e.from)!, b = pos.get(e.to)!;
    const backwards = b.x < a.x + NW;
    const sx = a.x + NW, sy = port(outs.get(e.from)!, e, a.y, (x) => x.to);
    const tx = b.x, ty = port(ins.get(e.to)!, e, b.y, (x) => x.from);
    const dx = backwards ? 90 : Math.max(36, (tx - sx) * 0.5);
    const src = r.nodes[e.from];
    const short = src.kind === 'module' && src.net < -0.5;
    const color = WARES[e.from].color;
    const width = 1.6 + 5 * Math.sqrt((e.amount * WARES[e.from].price.avg) / maxValue);
    const dim = focus && !edgeLit(e);
    const energy = e.from === 'energycells';
    const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} C${(sx + dx).toFixed(1)} ${sy.toFixed(1)} ${(tx - dx).toFixed(1)} ${ty.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    paths += `<path d="${d}" fill="none" stroke="${short ? '#ff6b7a' : color}" stroke-width="${width.toFixed(1)}" stroke-linecap="round" opacity="${dim ? 0.1 : energy ? 0.45 : 0.9}"${energy || short ? ' stroke-dasharray="6 5"' : ''}/>`;
    if (!preview && !dim && (!energy || focus)) {
      const lx = tx - 40, ly = ty - 6;
      const text = fmtAmount(e.amount) + '/h';
      const tw = text.length * 6.4 + 10;
      labels += `<g><rect x="${(lx - tw / 2).toFixed(1)}" y="${(ly - 9).toFixed(1)}" width="${tw.toFixed(1)}" height="15" rx="4" fill="#07131f" opacity="0.9"/><text x="${lx.toFixed(1)}" y="${(ly + 2.5).toFixed(1)}" class="dg-edge" fill="${short ? '#ff9aa4' : color}">${text}</text></g>`;
    }
  }
  let cards = '';
  for (const [id, pt] of pos) {
    const n = r.nodes[id];
    if (!n) continue;
    const w = WARES[id];
    const st = nodeState(n);
    const col = STATE_COLOR[st];
    const dim = focus && !nodeLit(id);
    // In der Kettenansicht zeigt ein feiner Ring, dass die Ware zum Pfad gehört
    const ring = chain && !dim && id !== focus ? `<rect x="${pt.x - 5}" y="${pt.y - 5}" width="${NW + 10}" height="${NH + 10}" rx="18" fill="none" stroke="${WARES[focus].color}" stroke-width="1.2" opacity="0.55"/>` : '';
    const name = w.name.length > 21 ? w.name.slice(0, 20) + '…' : w.name;
    const x = pt.x, y = pt.y;
    let inner = '';
    if (n.kind === 'module') {
      const c = counts[id];
      const sub = c ? [c.built && `${c.built} gebaut`, c.building && `${c.building} im Bau`, c.planned && `${c.planned} geplant`].filter(Boolean).join(' · ') : `je ${fmtInt(n.rate)}/h`;
      const status = st === 'deficit' ? `fehlen ${fmtInt(-n.net)}/h` : st === 'underfed' ? `läuft mit ${Math.round(n.eff * 100)} % · ${WARES[n.limiting]?.name ?? ''} knapp` : st === 'end' ? `${fmtInt(n.net)}/h Endprodukt` : st === 'surplus' ? `+${fmtInt(n.net)}/h Überschuss` : 'ausgeglichen';
      inner = `
        <text x="${x + 14}" y="${y + 50}" class="dg-count">${n.modules}<tspan class="dg-sub" dx="6">Modul${n.modules === 1 ? '' : 'e'}</tspan></text>
        <text x="${x + 14}" y="${y + 68}" class="dg-sub">${esc(sub)}</text>
        <text x="${x + 14}" y="${y + 88}" class="dg-rate">+${fmtAmount(n.prod)}/h<tspan class="dg-sub" dx="6">Bedarf ${fmtAmount(n.use)}</tspan></text>
        <text x="${x + 14}" y="${y + 108}" class="dg-net" fill="${col}">${esc(status.length > 30 ? status.slice(0, 29) + '…' : status)}</text>`;
      if (!preview) {
        inner += `
        <g class="dg-btn" ${act('dg-mod', { ware: id, d: -1 })} role="button" aria-label="${esc(w.name)}: ein Modul weniger"><circle cx="${x + NW - 62}" cy="${y + 45}" r="15"/><path d="M${x + NW - 68} ${y + 45}h12"/></g>
        <g class="dg-btn" ${act('dg-mod', { ware: id, d: 1 })} role="button" aria-label="${esc(w.name)}: ein Modul mehr"><circle cx="${x + NW - 24}" cy="${y + 45}" r="15"/><path d="M${x + NW - 30} ${y + 45}h12M${x + NW - 24} ${y + 39}v12"/></g>`;
        if (n.recommend > 0) {
          inner += `<g class="dg-rec" ${act('dg-rec', { ware: id, n: n.recommend })} role="button" aria-label="${n.recommend} Module ergänzen"><rect x="${x + 8}" y="${y + NH + 6}" width="${NW - 16}" height="26" rx="13"/><text x="${x + NW / 2}" y="${y + NH + 23}">+${n.recommend} Modul${n.recommend === 1 ? '' : 'e'} für volle Versorgung</text></g>`;
        }
      }
    } else {
      inner = `
        <text x="${x + 14}" y="${y + 52}" class="dg-rate">${fmtAmount(n.use)}/h</text>
        <text x="${x + 14}" y="${y + 72}" class="dg-sub">${n.kind === 'mined' ? `${fmtAmount(n.use * w.volume)} m³/h abbauen` : `ca. ${fmtCr(n.use * w.price.avg)}/h`}</text>
        <text x="${x + 14}" y="${y + 100}" class="dg-net" fill="${col}">${n.kind === 'mined' ? 'Miner liefern' : 'wird zugekauft'}</text>`;
    }
    const tag = n.kind === 'mined' ? 'Rohstoff' : n.kind === 'bought' ? 'Zukauf' : st === 'end' ? 'Endprodukt' : '';
    cards += `<g class="dg-node" data-node="${id}" opacity="${dim ? (chain ? 0.22 : 0.35) : 1}">${ring}
      <rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="14" fill="${st === 'end' ? '#1d1b12' : '#0c1c2a'}" stroke="${col}" stroke-width="${focus === id ? 3 : 1.6}"${n.kind === 'bought' ? ' stroke-dasharray="6 4"' : ''}/>
      <rect x="${x}" y="${y}" width="6" height="${NH}" rx="3" fill="${w.color}"/>
      <text x="${x + 14}" y="${y + 24}" class="dg-title">${esc(name)}</text>
      ${tag ? `<text x="${x + 12}" y="${y - 7}" class="dg-tag" fill="${col}">${tag}</text>` : ''}
      ${inner}
    </g>`;
  }
  return paths + labels + cards;
}

function wareDotSvg(color: string): string {
  return `<span class="dot" style="background:${color}"></span>`;
}

export function diagramSvg(r: PlanResult, p: PlannerUI, counts: Record<string, ModuleCount>, opts: DiagramOpts = {}): string {
  const pos = nodePositions(r, opts.layout);
  const b = diagramBounds(pos);
  return `<svg class="diagram" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Fließdiagramm der Produktionskette">${diagramContent(r, p, counts, pos, !!opts.preview)}</svg>`;
}

/** Vollbild-Editor: frei verschieb- und zoombar, Kästchen lassen sich ziehen */
export function diagramEditor(state: GameState, p: PlannerUI, layoutOverride?: Record<string, { x: number; y: number }>): string {
  const { settings, station, counts } = activePlan(state, p);
  const r = computePlan(settings);
  const layout = { ...(settings.layout ?? {}), ...(layoutOverride ?? {}) };
  const pos = nodePositions(r, layout);
  const st = station ? stationById(state, station) : null;
  const problems = Object.values(r.nodes).filter((n) => n.kind === 'module' && (n.net < -0.5 || n.eff < 0.999)).length;
  const v = p.dg;
  return `<div class="modal full dg-modal" role="dialog" aria-modal="true" aria-label="Fließdiagramm">
    <div class="sheet-head dg-head">
      <h1><span class="eyebrow">${st ? esc(st.name) + ' · wirkt auf die Baureihenfolge' : 'Entwurf'}</span>Fließdiagramm</h1>
      <button class="icon-btn" ${act('modal-close')} aria-label="Schließen">${icon('close', 22)}</button>
    </div>
    <div class="dg-toolbar">
      <button class="btn small" ${act('plan-pick')}>${icon('plus', 16)}Produkt</button>
      <button class="icon-btn sm ${p.planEnergy ? 'on' : ''}" ${act('plan-energy')} aria-label="Energiezellen-Linien ein- oder ausblenden" title="Energie-Linien">${icon('energy', 17)}</button>
      <button class="icon-btn sm" ${act('undo')} ${canUndo() ? '' : 'disabled'} aria-label="Rückgängig" title="Rückgängig${canUndo() ? ': ' + esc(undoLabel()) : ''}">${icon('undo', 17)}</button>
      <button class="icon-btn sm" ${act('dg-fit')} aria-label="Alles einpassen" title="Einpassen">${icon('target', 17)}</button>
      <button class="icon-btn sm" ${act('dg-arrange')} aria-label="Anordnung zurücksetzen" title="Automatisch anordnen">${icon('routes', 17)}</button>
      <span class="dg-legend">${problems ? `<b class="neg">${problems} ${problems === 1 ? 'Engpass' : 'Engpässe'}</b>` : '<b class="pos">voll versorgt</b>'} · ${r.totalModules} Module</span>
    </div>
    <svg class="dg-editor" role="img" aria-label="Fließdiagramm – ziehen zum Verschieben, zwei Finger zum Zoomen">
      <g id="dg-view" transform="translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${v.k.toFixed(4)})">${diagramContent(r, p, counts, pos, false)}</g>
    </svg>
    ${p.planFocus && r.nodes[p.planFocus] ? `<div class="dg-focusbar" role="group" aria-label="Hervorhebung">
      <span class="dg-focus-name">${wareDotSvg(WARES[p.planFocus].color)}${esc(WARES[p.planFocus].name)}</span>
      <button class="${p.planChain ? '' : 'on'}" ${act('plan-chain', { on: 0 })}>Direkt</button>
      <button class="${p.planChain ? 'on' : ''}" ${act('plan-chain', { on: 1 })}>Ganze Kette</button>
      <button class="x" ${act('plan-focus', { ware: p.planFocus })} aria-label="Hervorhebung aufheben">${icon('close', 14)}</button>
    </div>` : ''}
    <div class="dg-hint">${p.planFocus ? (p.planChain ? 'Ganze Kette bis zum Rohstoff · nochmal antippen: aus' : 'Direkte Vor- und Folgeprodukte · nochmal antippen: ganze Kette') : 'Ware antippen: Kette hervorheben · Kästchen ziehen zum Anordnen · Hintergrund ziehen zum Verschieben · zwei Finger zum Zoomen · ± ändert die Modulzahl'}</div>
  </div>`;
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
  const rows = state.stations.map((st) => `<div class="row tap" ${act('plan-build', { st: st.id })}>${icon('station', 20)}<div class="grow"><div class="title">${esc(st.name)}</div><div class="sub">${st.modules.length} Module · ${st.queue.length + (st.build ? 1 : 0)} in der Baureihenfolge</div></div>${icon('chev', 20, 'chev')}</div>`).join('');
  return `<p class="lead">Die ${r.totalModules} Produktionsmodule werden als einzelne Positionen an die Baureihenfolge angehängt – Vorprodukte zuerst. Fehlende Lager und ein Dock kommen davor. Bezahlt wird beim jeweiligen Baustart (gesamt etwa ${fmtCr(r.cost)}).</p>
    <div class="box rows">${rows}</div>`;
}

/** Reihenfolge, in der die Module gebaut werden sollen: Rohstoffnahe zuerst */
export function buildOrder(r: PlanResult): string[] {
  const list: string[] = [];
  const nodes = Object.values(r.nodes).filter((n) => n.kind === 'module' && n.modules > 0).sort((a, b) => a.column - b.column);
  for (const n of nodes) for (let i = 0; i < n.modules; i++) list.push('prod_' + n.ware);
  return list.filter((id) => MODULE_MAP[id]);
}
