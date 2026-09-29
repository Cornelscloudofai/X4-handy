// Kampagne „Wiederaufbau von Zhin“: führt durch die Spielmechaniken.
import { SHIP_MAP } from '../data/ships';
import { sector } from '../data/sectors';
import { WARES } from '../data/wares';
import type { Contract, FactionId, GameState } from './types';
import { emit, log } from './util';
import { netWorth } from './stats';

export interface StoryMission {
  id: string;
  title: string;
  story: string;
  goal: string;
  hint: string;
  /** Wofür die Ware gut ist – kurze Erklärung der Produktionskette */
  about?: string;
  progress: (s: GameState) => { cur: number; target: number };
  reward: { credits: number; rep?: Partial<Record<FactionId, number>> };
  /** Lieferauftrag, der beim Start der Mission angelegt wird */
  delivery?: { sector: string; ware: string; amount: number };
}

const countModules = (s: GameState, def: string) =>
  s.stations.reduce((n, st) => n + st.modules.filter((m) => m.def === def).length, 0);
const countShips = (s: GameState, role: 'miner' | 'trader') => s.ships.filter((x) => SHIP_MAP[x.cls].role === role).length;
const producedSince = (s: GameState, ware: string) => (s.totals.produced[ware] ?? 0) - (s.story.base[ware] ?? 0);
// Der Lieferauftrag der aktuellen Mission (auch wenn er gerade erfüllt wurde)
const storyContract = (s: GameState) => [...s.contracts].reverse().find((c) => c.story && c.id >= s.story.contractFloor);

export const STORY: StoryMission[] = [
  {
    id: 'refinery',
    about: 'Veredelte Metalle entstehen aus Erz und Energiezellen. Sie sind der Grundstoff für Hüllenteile, Antriebsteile und Scanner – ohne sie gibt es weder Schiffe noch Stationen.',
    title: 'Neuanfang in Zhin',
    story: 'Die Xenon haben die Werften der Familie Zhin schwer getroffen. Patriarchin Zhin bietet dir Baurechte – wenn du hilfst, den Sektor wieder aufzubauen. Veredelte Metalle sind die Grundlage für alles.',
    goal: 'Baue eine Fabrik für Veredelte Metalle',
    hint: 'Öffne deine Station → „Module“ → „Modul einplanen“. Dein Miner bringt Erz, das Solarkraftwerk Energiezellen.',
    progress: (s) => ({ cur: countModules(s, 'prod_refinedmetals'), target: 1 }),
    reward: { credits: 400_000, rep: { frf: 2 } },
  },
  {
    id: 'metals',
    about: 'Jede Stufe der Kette braucht die vorige: 240 Erz + 90 Energiezellen ergeben 88 Veredelte Metalle. Ein Engpass ganz links bremst alles rechts davon.',
    title: 'Metall für das Tor',
    story: 'Die Reparaturtrupps am Sprungtor nach Tharka warten auf Streben. Jede Tonne zählt.',
    goal: 'Produziere 2.000 Veredelte Metalle',
    hint: 'Ein einzelner Miner kommt kaum hinterher. Achte auf das Erzlager deiner Station.',
    progress: (s) => ({ cur: producedSince(s, 'refinedmetals'), target: 2000 }),
    reward: { credits: 600_000, rep: { frf: 2 } },
  },
  {
    id: 'miners',
    about: 'Miner holen Rohstoffe aus den Feldern: Erz, Silizium und Eis (Feststofflager) oder Wasserstoff, Helium und Methan (Flüssiglager). Sie sind der Anfang jeder Kette.',
    title: 'Mehr Förderleistung',
    story: 'Eine Raffinerie verbraucht 5.760 Erz pro Stunde. Die Familie empfiehlt eine eigene Minerflotte.',
    goal: 'Besitze 3 Miner',
    hint: 'Flotte → „Schiff kaufen“. Gas-Miner sammeln Wasserstoff, Helium und Methan – dafür braucht die Station ein Flüssiglager.',
    progress: (s) => ({ cur: countShips(s, 'miner'), target: 3 }),
    reward: { credits: 500_000, rep: { frf: 1 } },
  },
  {
    id: 'trader',
    about: 'Transporter verbinden deine Stationen mit den Märkten. Sie verkaufen Überschüsse, kaufen fehlende Eingangswaren und liefern Aufträge aus.',
    title: 'Handelswege',
    story: 'Waren im Lager bringen keine Credits. NPC-Händler kommen nur gelegentlich – ein eigener Transporter verkauft zuverlässig.',
    goal: 'Besitze einen Transporter',
    hint: 'Transporter im Autohandel verkaufen Überschüsse am Handelsposten und kaufen fehlende Waren ein.',
    progress: (s) => ({ cur: countShips(s, 'trader'), target: 1 }),
    reward: { credits: 500_000, rep: { frf: 1 } },
  },
  {
    id: 'graphene',
    about: 'Graphen wird aus Methan gewonnen. Es steckt in Hüllenteilen, Quantenröhren und Plasmaleitern – also in fast allem, was fliegt oder schießt.',
    title: 'Hitzeschutz',
    story: 'Die neuen Hüllen brauchen Graphen. Methan aus dem Gasnebel im Süden ist der Schlüssel.',
    goal: 'Produziere 2.500 Graphen',
    hint: 'Graphen braucht Methan und Energiezellen. Baue ein Flüssiglager und schicke einen Gas-Miner los.',
    progress: (s) => ({ cur: producedSince(s, 'graphene'), target: 2500 }),
    reward: { credits: 800_000, rep: { frf: 2 } },
  },
  {
    id: 'second',
    about: 'Eine Station direkt am Rohstofffeld spart Flugzeit: Miner schaffen mehr Ladungen pro Stunde. Transporter verteilen die Waren zwischen deinen Stationen.',
    title: 'Zweites Standbein',
    story: 'Eine Station allein ist verwundbar. Setze eine zweite Station direkt neben ein Rohstofffeld – kurze Wege, schnelle Miner.',
    goal: 'Besitze 2 Stationen',
    hint: 'Tippe oben auf „+ Station“ und dann auf einen freien Platz im Sektor.',
    progress: (s) => ({ cur: s.stations.length, target: 2 }),
    reward: { credits: 700_000, rep: { frf: 1 } },
  },
  {
    id: 'hull',
    about: 'Hüllenteile (Veredelte Metalle + Graphen) sind das wichtigste Baumaterial überhaupt: Jeder Schiffsrumpf und jedes Stationsmodul besteht zum großen Teil daraus.',
    title: 'Werftbedarf',
    story: 'Die Zhin-Werft will neue Rümpfe auflegen. Hüllenteile verbinden deine Metall- und Graphenproduktion zu einer echten Kette.',
    goal: 'Liefere 1.500 Hüllenteile an den Zhin-Handelsposten',
    hint: 'Kaufe den Bauplan für Hüllenteile (Ruf 7). Transporter im Autohandel liefern automatisch für aktive Aufträge.',
    progress: (s) => { const c = storyContract(s); return { cur: c ? c.delivered : 0, target: 1500 }; },
    reward: { credits: 2_500_000, rep: { frf: 3 } },
    delivery: { sector: 'zhin', ware: 'hullparts', amount: 1500 },
  },
  {
    id: 'license',
    about: 'Andere Sektoren haben andere Rohstoffe, Sonnenlicht und Käufer. Tharka etwa ist reich an Gas – ideal für Graphen und Antimateriezellen.',
    title: 'Neue Horizonte',
    story: 'Die Familie Tkr und die Gasnebel von Tharka bieten Platz für Wachstum. Erwirb dort Baurechte.',
    goal: 'Erwirb eine Baulizenz in einem weiteren Sektor',
    hint: 'Tippe oben links auf den Sektornamen, um die Galaxiekarte zu öffnen.',
    progress: (s) => ({ cur: s.sectors.length - 1, target: 1 }),
    reward: { credits: 1_500_000, rep: { frf: 2 } },
  },
  {
    id: 'chips',
    about: 'Mikrochips aus Siliziumscheiben steuern Geschütze, Drohnen und Antimaterie-Konverter. Vor allem sind sie eine Zutat für Claytronik.',
    title: 'Steuertechnik',
    story: 'Für Scanner und Antriebe braucht es Mikrochips. Siliziumscheiben sind der Engpass.',
    goal: 'Produziere 1.000 Mikrochips',
    hint: 'Mikrochips brauchen 200 Siliziumscheiben pro Zyklus – plane mehrere Scheibenfabriken ein.',
    progress: (s) => ({ cur: producedSince(s, 'microchips'), target: 1000 }),
    reward: { credits: 3_000_000, rep: { frf: 2, zya: 2 } },
  },
  {
    id: 'engines',
    about: 'Antriebsteile (Antimateriezellen + Veredelte Metalle) stecken in jedem Triebwerk. Wer sie liefert, rüstet Flotten aus – und gewinnt Freunde.',
    title: 'Flotte in Bewegung',
    story: 'Das Zyarth-Patriarchat rüstet auf und zahlt gut. Ein Friedensangebot in Form von Antriebsteilen öffnet Türen.',
    goal: "Liefere 2.000 Antriebsteile an den Patriarchenhafen (Rhy's Defiance)",
    hint: 'Antriebsteile brauchen Antimateriezellen und Veredelte Metalle. Transporter fliegen über das Sprungtor.',
    progress: (s) => { const c = storyContract(s); return { cur: c ? c.delivered : 0, target: 2000 }; },
    reward: { credits: 5_000_000, rep: { zya: 5 } },
    delivery: { sector: 'rhy', ware: 'engineparts', amount: 2000 },
  },
  {
    id: 'claytronics',
    title: 'Programmierbare Materie',
    about: 'Claytronik ist das Spitzenprodukt der Kette: Antimateriezellen, Mikrochips, Quantenröhren und Energiezellen werden zu formbarer Nanomaterie. Werften brauchen sie in großen Mengen – eine S/M-Schiffsfertigung allein 3.312 Einheiten.',
    story: 'Patriarchin Zhin hat einen Plan: Die Familie soll wieder eigene Schiffe bauen. Dafür braucht es Claytronik – und niemand in Zhin stellt sie her.',
    goal: 'Produziere 1.000 Claytronik',
    hint: 'Claytronik braucht vier Eingangswaren. Plane die Kette im Stationsplaner mit „Claytronik“ als Ziel – er zeigt jede Vorstufe.',
    progress: (s) => ({ cur: producedSince(s, 'claytronics'), target: 1000 }),
    reward: { credits: 6_000_000, rep: { frf: 3 } },
  },
  {
    id: 'yard',
    title: 'Die eigene Werft',
    about: 'Eine Schiffsfertigung baut Schiffe aus Waren: Hüllenteile für den Rumpf, Antriebsteile für Triebwerke, Schildkomponenten, Geschützkomponenten für Abbautürme. Das Material kostet nur einen Bruchteil des Kaufpreises.',
    story: 'Die Baupläne liegen bereit. Die erste Werft der Familie seit dem Xenon-Angriff soll auf deiner Station stehen.',
    goal: 'Baue eine S/M-Schiffsfertigung',
    hint: 'Bauplan unter „Modul einplanen“ → „Werft“ (Ruf 10). Das Modul selbst braucht 3.312 Claytronik, 6.620 Energiezellen und 12.112 Hüllenteile – Transporter kaufen Fehlendes zu.',
    progress: (s) => ({ cur: countModules(s, 'yard_m') + countModules(s, 'yard_l'), target: 1 }),
    reward: { credits: 8_000_000, rep: { frf: 3 } },
  },
  {
    id: 'firstship',
    title: 'Stapellauf',
    about: 'Eigene Schiffe kosten nur ihr Material. Eine Boa etwa braucht 348 Hüllenteile, 20 Antriebsteile und 7 Schildkomponenten – zusammen gut 80.000 Cr statt über 400.000 Cr Kaufpreis.',
    story: 'Die Werfthalle ist fertig. Zeit für das erste Schiff unter dem Banner der Familie Zhin.',
    goal: 'Baue ein Schiff in deiner eigenen Werft',
    hint: 'Station → Reiter „Werft“ → Schiff wählen. Fehlendes Material kaufen deine Transporter automatisch ein.',
    progress: (s) => ({ cur: s.totals.shipsBuilt ?? 0, target: 1 }),
    reward: { credits: 3_000_000, rep: { frf: 2 } },
  },
  {
    id: 'shiporder',
    title: 'Werft für die Familien',
    about: 'Fraktionen bestellen Schiffe zum Marktpreis. Du lieferst aus eigener Fertigung – der Unterschied zwischen Material und Preis ist dein Gewinn, und jede Lieferung stärkt deinen Ruf.',
    story: 'Die Nachricht von deiner Werft hat sich herumgesprochen. Die Familien wollen Schiffe – und zahlen gut.',
    goal: 'Liefere 2 bestellte Schiffe aus',
    hint: 'Bestellungen erscheinen unter „Aufträge“, sobald du eine Werft besitzt. Nimm eine an und wähle die Werft, die sie baut.',
    progress: (s) => ({ cur: s.totals.shipsSold ?? 0, target: 2 }),
    reward: { credits: 10_000_000, rep: { frf: 3, zya: 2 } },
  },
  {
    id: 'empire',
    about: 'Der Unternehmenswert zählt Credits, Stationen, Lager und Schiffe. Wer eigene Schiffe baut und verkauft, wächst am schnellsten.',
    title: 'Ein Imperium der Familien',
    story: 'Aus einer Notlösung ist ein Wirtschaftsimperium mit eigener Werft geworden. Doch die Xenon sind nicht verschwunden, und Piraten lauern an den Toren – bald werden die Familien Kampfschiffe brauchen.',
    goal: 'Erreiche 500 Mio Cr Unternehmenswert',
    hint: 'Große Schiffe (Buffalo, Wyvern) aus einer L-Schiffsfertigung bringen am meisten. Auch Claytronik und Feldspulen sind gefragt.',
    progress: (s) => ({ cur: netWorth(s), target: 500_000_000 }),
    reward: { credits: 10_000_000, rep: { frf: 5, zya: 5 } },
  },
];

export function currentMission(state: GameState): StoryMission | null {
  return STORY[state.story.index] ?? null;
}

export function startMission(state: GameState): void {
  const m = currentMission(state);
  if (!m) return;
  state.story.claimed = false;
  state.story.startedAt = state.time;
  state.story.base = { ...state.totals.produced };
  state.story.contractFloor = state.nextId;
  if (m.delivery) {
    const c: Contract = {
      id: state.nextId++, sector: m.delivery.sector, ware: m.delivery.ware, amount: m.delivery.amount, delivered: 0,
      reward: 0, rep: 0, deadline: 0, duration: 0, status: 'active', title: `${m.title}: ${WARES[m.delivery.ware].name}`, story: true,
    };
    state.contracts.push(c);
  }
}

export function missionComplete(state: GameState): boolean {
  const m = currentMission(state);
  if (!m) return false;
  const p = m.progress(state);
  return p.cur >= p.target;
}

let lastNotified = -1;

export function stepStory(state: GameState): void {
  const m = currentMission(state);
  if (!m) return;
  if (missionComplete(state) && lastNotified !== state.story.index) {
    lastNotified = state.story.index;
    log(state, `Ziel erreicht: ${m.title}. Belohnung abholen!`, 'good', true);
    emit({ type: 'story' });
  }
}

export function claimMission(state: GameState): { ok: boolean; msg: string } {
  const m = currentMission(state);
  if (!m || !missionComplete(state)) return { ok: false, msg: 'Ziel noch nicht erreicht.' };
  state.credits += m.reward.credits;
  for (const [f, n] of Object.entries(m.reward.rep ?? {})) state.rep[f as FactionId] = Math.min(30, state.rep[f as FactionId] + (n ?? 0));
  for (const c of state.contracts) if (c.story && c.status === 'active') c.status = 'done';
  log(state, `Belohnung erhalten: ${m.reward.credits.toLocaleString('de-DE')} Cr.`, 'good');
  state.story.index++;
  startMission(state);
  emit({ type: 'story' });
  return { ok: true, msg: m.title + ' abgeschlossen.' };
}

export function missionSectorName(m: StoryMission): string {
  return m.delivery ? sector(m.delivery.sector).tradeStation.name : '';
}
