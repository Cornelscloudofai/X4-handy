// Kampagne „Wiederaufbau von Zhin“: führt durch die Spielmechaniken.
import { SHIP_MAP } from '../data/ships';
import { sector } from '../data/sectors';
import { WARES } from '../data/wares';
import type { Contract, FactionId, GameState, StartKind } from './types';
import { emit, log } from './util';
import { netWorth } from './stats';
import { MODULES } from '../data/modules';
import { vendorsFor } from '../data/vendors';

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

/** Werft-Vorrat: wie viele Schiffe dieser Klasse das Lager der besten eigenen Werft gerade hergibt */
const yardStock = (s: GameState, cls: string) => {
  const mats = SHIP_MAP[cls].materials;
  let best = 0;
  for (const st of s.stations) {
    if (!st.modules.some((m) => m.def.startsWith('yard_'))) continue;
    best = Math.max(best, Math.floor(Math.min(...Object.entries(mats).map(([id, n]) => (st.inventory[id] ?? 0) / n))));
  }
  return best;
};
const storageMods = (s: GameState, size: 'm' | 'l') =>
  s.stations.reduce((n, st) => n + st.modules.filter((m) => /^storage_\w+_/.test(m.def) && m.def.endsWith('_' + size)).length, 0);

export const STORY: StoryMission[] = [
  {
    id: 'refinery',
    title: 'Neuanfang in Zhin',
    about: 'Veredelte Metalle entstehen aus Erz und Energiezellen. Sie sind der Grundstoff für Hüllenteile, Antriebsteile und Scanner – ohne sie gibt es weder Schiffe noch Stationen.',
    story: 'Die Xenon haben die Werften der Familie Zhin schwer getroffen. Patriarchin Zhin bietet dir Baurechte – wenn du hilfst, den Sektor wieder aufzubauen. Veredelte Metalle sind die Grundlage für alles.',
    goal: 'Baue eine Fabrik für Veredelte Metalle',
    hint: 'Station → „Module“ → „Modul einplanen“. Jedes Modul braucht echtes Baumaterial (Claytronik, Energiezellen, Hüllenteile). NPC-Händler liefern es ins Baulager der Station; was dort liegt, siehst du als „x von y vorhanden“.',
    progress: (s) => ({ cur: countModules(s, 'prod_refinedmetals'), target: 1 }),
    reward: { credits: 400_000, rep: { frf: 2 } },
  },
  {
    id: 'metals',
    title: 'Metall für das Tor',
    about: 'Jede Stufe der Kette braucht die vorige: 240 Erz + 90 Energiezellen ergeben 88 Veredelte Metalle. Ein Engpass ganz links bremst alles rechts davon.',
    story: 'Die Reparaturtrupps am Sprungtor nach Tharka warten auf Streben. Jede Tonne zählt.',
    goal: 'Produziere 2.000 Veredelte Metalle',
    hint: 'Ein einzelner Miner kommt kaum hinterher. Achte auf das Erzlager deiner Station.',
    progress: (s) => ({ cur: producedSince(s, 'refinedmetals'), target: 2000 }),
    reward: { credits: 600_000, rep: { frf: 2 } },
  },
  {
    id: 'miners',
    title: 'Mehr Förderleistung',
    about: 'Miner holen Rohstoffe aus den Feldern: Erz, Silizium und Eis (Feststofflager) oder Wasserstoff, Helium und Methan (Flüssiglager). Sie sind der Anfang jeder Kette.',
    story: 'Eine Raffinerie verbraucht 5.760 Erz pro Stunde. Die Familie empfiehlt eine eigene Minerflotte.',
    goal: 'Besitze 3 Miner',
    hint: 'Flotte → „Schiff kaufen“. Gas-Miner sammeln Wasserstoff, Helium und Methan – dafür braucht die Station ein Flüssiglager.',
    progress: (s) => ({ cur: countShips(s, 'miner'), target: 3 }),
    reward: { credits: 500_000, rep: { frf: 1 } },
  },
  {
    id: 'trader',
    title: 'Handelswege',
    about: 'Transporter verbinden deine Stationen mit den Märkten. Sie verkaufen Überschüsse, kaufen fehlende Eingangswaren und liefern Aufträge aus – immer für ihre Heimatstation.',
    story: 'Waren im Lager bringen keine Credits. NPC-Händler kommen nur gelegentlich – ein eigener Transporter verkauft zuverlässig.',
    goal: 'Besitze einen Transporter',
    hint: 'Transporter im Autohandel verkaufen Überschüsse am Handelsposten und kaufen fehlende Waren ein.',
    progress: (s) => ({ cur: countShips(s, 'trader'), target: 1 }),
    reward: { credits: 500_000, rep: { frf: 1 } },
  },
  {
    id: 'graphene',
    title: 'Hitzeschutz',
    about: 'Graphen wird aus Methan gewonnen. Es steckt in Hüllenteilen, Quantenröhren und Plasmaleitern – also in fast allem, was fliegt oder schießt.',
    story: 'Die neuen Hüllen brauchen Graphen. Methan aus dem Gasnebel im Süden ist der Schlüssel.',
    goal: 'Produziere 2.500 Graphen',
    hint: 'Graphen braucht Methan und Energiezellen. Baue ein Flüssiglager und schicke einen Gas-Miner los.',
    progress: (s) => ({ cur: producedSince(s, 'graphene'), target: 2500 }),
    reward: { credits: 800_000, rep: { frf: 2 } },
  },
  {
    id: 'second',
    title: 'Zweites Standbein',
    about: 'Eine Station direkt am Rohstofffeld spart Flugzeit: Miner schaffen mehr Ladungen pro Stunde. Jede Station braucht eigene Transporter – sie handeln immer für ihre Heimat.',
    story: 'Eine Station allein ist verwundbar. Setze eine zweite Station direkt neben ein Rohstofffeld – kurze Wege, schnelle Miner.',
    goal: 'Besitze 2 Stationen',
    hint: 'Tippe oben auf „+ Station“ und dann auf einen freien Platz im Sektor. Zuerst steht nur das Baulager (50.000 Cr) – selbst der Stationskern wird aus angeliefertem Material gebaut.',
    progress: (s) => ({ cur: s.stations.length, target: 2 }),
    reward: { credits: 700_000, rep: { frf: 1 } },
  },
  {
    id: 'hull',
    title: 'Werftbedarf',
    about: 'Hüllenteile (Veredelte Metalle + Graphen) sind das wichtigste Baumaterial überhaupt: Jeder Schiffsrumpf und jedes Stationsmodul besteht zum großen Teil daraus.',
    story: 'Die Zhin-Werft will neue Rümpfe auflegen. Hüllenteile verbinden deine Metall- und Graphenproduktion zu einer echten Kette.',
    goal: 'Liefere 1.500 Hüllenteile an den Zhin-Handelsposten',
    hint: 'Den Bauplan (Ruf 7) verkauft der Handelsvertreter am Zhin-Handelsposten – tippe ihn auf der Karte an. Die Station mit den Hüllenteilen braucht einen eigenen Transporter; er liefert automatisch für aktive Aufträge.',
    progress: (s) => { const c = storyContract(s); return { cur: c ? c.delivered : 0, target: 1500 }; },
    reward: { credits: 2_500_000, rep: { frf: 3 } },
    delivery: { sector: 'zhin', ware: 'hullparts', amount: 1500 },
  },
  {
    id: 'license',
    title: 'Neue Horizonte',
    about: 'Andere Sektoren haben andere Rohstoffe, Sonnenlicht und Käufer. Eine Lizenz vergrößert auch die Reichweite deiner Bautrupps: Sie kaufen Baumaterial an mehr Handelsposten.',
    story: 'Die Familie Tkr und die Gasnebel von Tharka bieten Platz für Wachstum. Erwirb dort Baurechte.',
    goal: 'Erwirb eine Baulizenz in einem weiteren Sektor',
    hint: 'Tippe oben links auf den Sektornamen, um die Galaxiekarte zu öffnen.',
    progress: (s) => ({ cur: s.sectors.length - 1, target: 1 }),
    reward: { credits: 1_500_000, rep: { frf: 2 } },
  },
  {
    id: 'storage',
    title: 'Mehr Platz',
    about: 'Lager S fassen 25.000–100.000 m³, Lager M bis 500.000 m³, Lager L eine Million. Große Fabriken und vor allem Werften brauchen Platz für Vorräte – sonst stockt die Produktion, sobald ein Lieferant ausfällt.',
    story: 'Die Lagerhallen platzen aus allen Nähten. Die Familie bietet die Pläne für größere Lagermodule an.',
    goal: 'Baue ein Lagermodul der Größe M',
    hint: 'Bauplan beim Handelsvertreter (Ruf 2). Dann Station → Module → Kategorie „Lager“.',
    progress: (s) => ({ cur: storageMods(s, 'm'), target: 1 }),
    reward: { credits: 1_000_000, rep: { frf: 1 } },
  },
  {
    id: 'wafers',
    title: 'Silizium veredeln',
    about: 'Siliziumscheiben (Silizium + Energiezellen) sind die Grundlage aller Elektronik: Mikrochips, Smartchips für Drohnen und Scannerarrays für Geschütze.',
    story: 'Bevor Zhin eigene Steuertechnik bauen kann, braucht es reines Silizium. Das Feld im Norden ist reich daran.',
    goal: 'Produziere 3.000 Siliziumscheiben',
    hint: 'Eine Station nahe dem Siliziumfeld mit Feststofflager, Siliziumscheiben-Fabriken und Mineral-Minern.',
    progress: (s) => ({ cur: producedSince(s, 'siliconwafers'), target: 3000 }),
    reward: { credits: 1_500_000, rep: { frf: 1 } },
  },
  {
    id: 'chips',
    title: 'Steuertechnik',
    about: 'Mikrochips aus Siliziumscheiben steuern Geschütze, Drohnen und Antimaterie-Konverter. Vor allem sind sie eine Zutat für Claytronik.',
    story: 'Für Scanner und Antriebe braucht es Mikrochips. Siliziumscheiben sind der Engpass.',
    goal: 'Produziere 1.000 Mikrochips',
    hint: 'Den Bauplan hat der Handelsvertreter. Mikrochips brauchen 200 Siliziumscheiben pro Zyklus – plane mehrere Scheibenfabriken ein.',
    progress: (s) => ({ cur: producedSince(s, 'microchips'), target: 1000 }),
    reward: { credits: 3_000_000, rep: { frf: 2, zya: 2 } },
  },
  {
    id: 'antimatter',
    title: 'Energie für Antriebe',
    about: 'Antimateriezellen entstehen aus Wasserstoff und Energiezellen. Sie treiben jedes Triebwerk an und sind eine der vier Zutaten für Claytronik.',
    story: 'Das Zyarth-Patriarchat sucht einen Lieferanten für Antriebsteile. Dafür brauchst du zuerst Antimaterie.',
    goal: 'Produziere 3.000 Antimateriezellen',
    hint: 'Flüssiglager, Gas-Miner für Wasserstoff und Antimateriezellen-Fabriken. Das Wasserstofffeld liegt im Osten von Zhin.',
    progress: (s) => ({ cur: producedSince(s, 'antimattercells'), target: 3000 }),
    reward: { credits: 2_000_000, rep: { frf: 1, zya: 1 } },
  },
  {
    id: 'engines',
    title: 'Flotte in Bewegung',
    about: 'Antriebsteile (Antimateriezellen + Veredelte Metalle) stecken in jedem Triebwerk und jeder Steuerdüse. Wer sie liefert, rüstet Flotten aus – und gewinnt Freunde.',
    story: 'Das Zyarth-Patriarchat rüstet auf und zahlt gut. Ein Friedensangebot in Form von Antriebsteilen öffnet Türen.',
    goal: "Liefere 2.000 Antriebsteile an den Patriarchenhafen (Rhy's Defiance)",
    hint: 'Transporter der Station mit den Antriebsteilen fliegen über das Sprungtor und liefern automatisch für den Auftrag.',
    progress: (s) => { const c = storyContract(s); return { cur: c ? c.delivered : 0, target: 2000 }; },
    reward: { credits: 5_000_000, rep: { zya: 5 } },
    delivery: { sector: 'rhy', ware: 'engineparts', amount: 2000 },
  },
  {
    id: 'coolant',
    title: 'Kühlen Kopf bewahren',
    about: 'Superfluides Kühlmittel aus Helium kühlt Quantenröhren und Plasmaleiter – ohne Kühlung keine Schilde, keine Hochleistungselektronik.',
    story: 'Die Ingenieure der Familie brauchen Kühlmittel für ihre Versuche mit Quantentechnik.',
    goal: 'Produziere 2.000 Superfluides Kühlmittel',
    hint: 'Helium sammeln Gas-Miner im Südwesten von Zhin. Kühlmittel-Fabrik plus Flüssiglager.',
    progress: (s) => ({ cur: producedSince(s, 'superfluidcoolant'), target: 2000 }),
    reward: { credits: 2_000_000, rep: { frf: 1 } },
  },
  {
    id: 'quantum',
    title: 'Quantensprung',
    about: 'Quantenröhren (Graphen + Kühlmittel) stecken in Claytronik, Schildkomponenten, Feldspulen und Geschützkomponenten – das Herzstück der Hochtechnologie.',
    story: 'Mit Kühlmittel und Graphen lassen sich Quantenröhren fertigen. Damit beginnt die Hochtechnologie.',
    goal: 'Produziere 1.000 Quantenröhren',
    hint: 'Quantenröhren brauchen Graphen (Methan) und Kühlmittel (Helium). Der Stationsplaner zeigt die ganze Kette.',
    progress: (s) => ({ cur: producedSince(s, 'quantumtubes'), target: 1000 }),
    reward: { credits: 3_000_000, rep: { frf: 2 } },
  },
  {
    id: 'claytronics',
    title: 'Programmierbare Materie',
    about: 'Claytronik ist das Spitzenprodukt der Kette: Antimateriezellen, Mikrochips, Quantenröhren und Energiezellen werden zu formbarer Nanomaterie. Jedes Stationsmodul braucht sie – eine Werft allein 3.312 Einheiten.',
    story: 'Patriarchin Zhin hat einen Plan: Die Familie soll wieder eigene Schiffe bauen. Dafür braucht es Claytronik – und die Märkte geben nur wenig her.',
    goal: 'Produziere 1.000 Claytronik',
    hint: 'Claytronik braucht vier Eingangswaren. Liefern die Chips von einer anderen Station, setze sie dort in die Lieferreihenfolge.',
    progress: (s) => ({ cur: producedSince(s, 'claytronics'), target: 1000 }),
    reward: { credits: 6_000_000, rep: { frf: 3 } },
  },
  {
    id: 'ownbuild',
    title: 'Aus eigener Hand',
    about: 'Ins Baulager liefern NPC-Händler vom Markt – doch Claytronik ist dort knapp und teuer. Bringen deine Transporter eigene Claytronik ins Baulager, wird sie genauso verbaut.',
    story: 'Die Handelsposten sind leergekauft. Zeit, mit eigener Claytronik zu bauen.',
    goal: 'Verbaue 500 eigene Claytronik in neuen Modulen',
    hint: 'Plane z. B. eine zweite Claytronik-Fabrik im Claytronik-Werk ein und lade dort unter „Module“ → Baulager → „Umladen“ eigene Claytronik ins Baulager. Tipp: Eine Reserve im Lager-Dialog verhindert, dass deine Transporter die Claytronik vorher verkaufen.',
    progress: (s) => ({ cur: (s.totals.buildOwn?.claytronics ?? 0) - (s.story.base['buildOwn:claytronics'] ?? 0), target: 500 }),
    reward: { credits: 4_000_000, rep: { frf: 2 } },
  },
  {
    id: 'shields',
    title: 'Schutzschilde',
    about: 'Schildkomponenten (Plasmaleiter + Quantenröhren) bauen die Schildgeneratoren jedes Schiffs. Ohne sie verlässt kein Rumpf die Werft.',
    story: 'Die Werftmeisterin der Zhin-Werft will wissen, ob du auch Schiffstechnik beherrschst.',
    goal: 'Produziere 500 Schildkomponenten',
    hint: 'Waffennahe Baupläne gibt es nur beim Werftvertreter der Zhin-Werft (Ruf 12). Plasmaleiter brauchen viel Kühlmittel.',
    progress: (s) => ({ cur: producedSince(s, 'shieldcomponents'), target: 500 }),
    reward: { credits: 5_000_000, rep: { frf: 2 } },
  },
  {
    id: 'turrets',
    title: 'Türme und Werkzeuge',
    about: 'Geschützkomponenten (Mikrochips, Quantenröhren, Scannerarrays) stecken in Lasertürmen und in den Abbautürmen der Miner – Werkzeug und Verteidigung zugleich.',
    story: 'Jeder Frachter trägt Lasertürme, jeder Mineral-Miner Abbautürme. Eine Werft ohne Geschützkomponenten steht still.',
    goal: 'Produziere 300 Geschützkomponenten',
    hint: 'Bauplan beim Werftvertreter. Scannerarrays brauchen Veredelte Metalle und Siliziumscheiben.',
    progress: (s) => ({ cur: producedSince(s, 'turretcomponents'), target: 300 }),
    reward: { credits: 6_000_000, rep: { frf: 2 } },
  },
  {
    id: 'yard',
    title: 'Die eigene Werft',
    about: 'Eine S/M-Schiffsfertigung baut Miner und Frachter aus zehn Waren: Hüllenteile, Energiezellen, Antriebsteile, Antimaterie-Konverter, Schild- und Geschützkomponenten, Feldspulen und Hochleistungsverbundstoffe. Das Material kostet nur einen Bruchteil des Kaufpreises.',
    story: 'Die Baupläne liegen bereit – zu einem stolzen Preis. Die erste Werft der Familie seit dem Xenon-Angriff soll auf deiner Station stehen.',
    goal: 'Baue eine S/M-Schiffsfertigung',
    hint: 'Bauplan beim Werftvertreter der Zhin-Werft (Ruf 10, 120 Mio Cr). Das Modul braucht 3.312 Claytronik, 6.620 Energiezellen und 12.112 Hüllenteile – ohne eigene Claytronik dauert das.',
    progress: (s) => ({ cur: countModules(s, 'yard_m') + countModules(s, 'yard_l'), target: 1 }),
    reward: { credits: 15_000_000, rep: { frf: 3 } },
  },
  {
    id: 'yardstock',
    title: 'Volle Lager',
    about: 'Eine Werft hält ihr Material ständig auf Vorrat. Je voller die Lager, desto mehr Schiffe kannst du am Stück bauen, wenn die Bestellungen kommen.',
    story: 'Die ersten Kunden fragen bereits an. Fülle die Lager der Werft, bevor du die Tore öffnest.',
    goal: 'Werftvorrat für 3 Boas',
    hint: 'Werft-Reiter zeigt „Vorrat für N×“. Größere Lager (M/L) und eigene Lieferketten füllen schneller.',
    progress: (s) => ({ cur: yardStock(s, 'boa'), target: 3 }),
    reward: { credits: 4_000_000, rep: { frf: 1 } },
  },
  {
    id: 'firstship',
    title: 'Stapellauf',
    about: 'Eigene Schiffe kosten nur ihr Material – eine Boa etwa 95.000 Cr statt rund 480.000 Cr Kaufpreis.',
    story: 'Die Werfthalle ist fertig. Zeit für das erste Schiff unter dem Banner der Familie Zhin.',
    goal: 'Baue ein Schiff in deiner eigenen Werft',
    hint: 'Station → Reiter „Werft“ → Schiff wählen.',
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
    id: 'converters',
    title: 'Große Antriebe',
    about: 'Antimaterie-Konverter (Hochleistungsverbundstoffe + Mikrochips) braucht jedes Schiff für seine Steuerdüsen – und L-Schiffe in großer Menge für ihre Triebwerke: über 500 Stück für einen Buffalo.',
    story: 'Die Familie träumt von Großfrachtern. Doch deren Triebwerke verschlingen Antimaterie-Konverter.',
    goal: 'Produziere 1.000 Antimaterie-Konverter',
    hint: 'Hochleistungsverbundstoffe brauchen Graphen und Veredelte Metalle. Bauplan beim Handelsvertreter.',
    progress: (s) => ({ cur: producedSince(s, 'antimatterconverters'), target: 1000 }),
    reward: { credits: 12_000_000, rep: { frf: 2 } },
  },
  {
    id: 'yardl',
    title: 'Große Pläne',
    about: 'Die L-Schiffsfertigung baut Großfrachter und Großminer. Sie ist doppelt so teuer wie die S/M-Werft – und die Schiffe, die sie baut, bringen das Zehnfache.',
    story: 'Die Familien wollen Buffalos und Wyverns. Wer sie baut, beherrscht den Handel der Region.',
    goal: 'Baue eine L-Schiffsfertigung',
    hint: 'Bauplan beim Werftvertreter (Ruf 15, 240 Mio Cr). L-Schiffe brauchen außerdem Drohnenkomponenten und Smartchips.',
    progress: (s) => ({ cur: countModules(s, 'yard_l'), target: 1 }),
    reward: { credits: 25_000_000, rep: { frf: 3 } },
  },
  {
    id: 'bigship',
    title: 'Riese vom Stapel',
    about: 'Ein Buffalo trägt 16.000 m³ – mehr als zwei Boas – und fliegt im Reiseantrieb schneller. Ein Wyvern fördert dreimal so viel wie ein Alligator.',
    story: 'Die L-Werft ist bereit. Das erste Großschiff der Familie soll aus eigenen Teilen entstehen.',
    goal: 'Baue ein L-Schiff in deiner Werft',
    hint: 'L-Schiffe brauchen zusätzlich Drohnenkomponenten, Smartchips und viele Antimaterie-Konverter. Deine Station braucht einen Pier, um sie einzusetzen.',
    progress: (s) => ({ cur: s.totals.shipsBuiltL ?? 0, target: 1 }),
    reward: { credits: 15_000_000, rep: { frf: 2 } },
  },
  {
    id: 'orders',
    title: 'Ruf der Werft',
    about: 'Jede ausgelieferte Bestellung bringt Gewinn und Ruf. Ein guter Ruf öffnet weitere Lizenzen und Baupläne – bis hin zur XL-Werft.',
    story: 'Die Werften der Familie Zhin sind wieder ein Begriff. Zeig, dass auf dich Verlass ist.',
    goal: 'Liefere 10 weitere bestellte Schiffe aus',
    hint: 'Nimm Bestellungen an, die deine Werft mit dem vorhandenen Material schnell bauen kann.',
    progress: (s) => ({ cur: (s.totals.shipsSold ?? 0) - (s.story.base.shipsSold ?? 0), target: 10 }),
    reward: { credits: 30_000_000, rep: { frf: 3, zya: 3 } },
  },
  {
    id: 'empire',
    title: 'Ein Imperium der Familien',
    about: 'Der Unternehmenswert zählt Credits, Stationen, Lager und Schiffe. Als Nächstes warten die XL-Werft und Kampfschiffe – die Xenon und Piraten sind nicht verschwunden.',
    story: 'Aus einer Notlösung ist ein Wirtschaftsimperium mit eigenen Werften geworden. Doch an den Toren lauern Piraten, und die Xenon sammeln sich – bald werden die Familien Kampfschiffe brauchen.',
    goal: 'Erreiche 500 Mio Cr Unternehmenswert',
    hint: 'Große Schiffe aus der L-Werft bringen am meisten. Die XL-Werft (400 Mio Cr) ist die Vorbereitung auf Träger und Schlachtschiffe.',
    progress: (s) => ({ cur: netWorth(s), target: 500_000_000 }),
    reward: { credits: 10_000_000, rep: { frf: 5, zya: 5 } },
  },
];

const soldSince = (s: GameState) => s.totals.sold - (s.story.base.sold ?? 0);

/** Einstiegskapitel je Spielstart – danach geht es mit der gemeinsamen Kampagne weiter */
export const INTRO: Record<StartKind, StoryMission[]> = {
  mining: [
    {
      id: 'm-first',
      title: 'Erste Ladung',
      about: 'Rohstoffe sind der Anfang jeder Kette. NPC-Fabriken kaufen Erz und Silizium als Vorprodukt; der Handelsposten nimmt nur begrenzt ab.',
      story: 'Mehr als einen alten Alligator und ein paar Lagermodule hat die Familie dir nicht geben können. Fördere, verkaufe – jeder Credit zählt.',
      goal: 'Verdiene 60.000 Cr mit Rohstoffen',
      hint: 'Dein Miner arbeitet von selbst: Er sucht das Feld, das sich gerade am besten verkauft. Beschleunige das Spiel oben rechts.',
      progress: (s) => ({ cur: Math.floor(soldSince(s)), target: 60_000 }),
      reward: { credits: 15_000, rep: { frf: 1 } },
    },
    {
      id: 'm-buyers',
      title: 'Abnehmer finden',
      about: 'Jede NPC-Fabrik hat ein Lager für ihre Vorprodukte. Ist es voll, sinkt der Preis – volle Lager wechseln sich ab, darum lohnt es sich, mehrere Rohstoffe zu fördern.',
      story: 'Die Zhin-Hütte schmilzt Erz und Silizium für den Wiederaufbau. Sie zahlt gut, solange ihr Lager nicht voll ist.',
      goal: 'Verdiene insgesamt 250.000 Cr mit Rohstoffen',
      hint: 'Tippe eine NPC-Fabrik an: Dort siehst du, was sie braucht und was sie herstellt. Unter Flotte → Miner kannst du die Rohstoffart auch fest einstellen.',
      progress: (s) => ({ cur: Math.floor(soldSince(s)), target: 250_000 }),
      reward: { credits: 25_000, rep: { frf: 1 } },
    },
    {
      id: 'm-fleet',
      title: 'Zweites Schiff',
      about: 'Ein Transporter verdient mit Kurieraufträgen und Handel zwischen den Stationen – und bringt später Baumaterial für deine eigenen Module.',
      story: 'Ein Schiff allein ist ein Risiko. Kauf ein zweites: noch einen Miner oder einen kleinen Transporter für Kurieraufträge.',
      goal: 'Besitze 2 Schiffe',
      hint: 'Flotte → „Schiff kaufen“. Der Tuatara (S) ist günstig und passt zu den Kurieraufträgen unter „Aufträge“.',
      progress: (s) => ({ cur: s.ships.length, target: 2 }),
      reward: { credits: 30_000, rep: { frf: 1 } },
    },
  ],
  trading: [
    {
      id: 't-courier',
      title: 'Kurierdienst',
      about: 'Kurieraufträge: Eine Station braucht dringend Ware. Du kaufst sie beim Verkäufer und bringst sie hin – der Lohn liegt 30–50 % über dem üblichen Verkaufswert.',
      story: 'Ein Tuatara, etwas Geld und ein offenes Ohr am Funk: Die Familien suchen zuverlässige Kuriere.',
      goal: 'Erfülle einen Kurierauftrag',
      hint: 'Unter „Aufträge“ stehen die Angebote. „Annehmen und Schiff schicken“ – dein Transporter kauft die Ware und liefert sie ab.',
      progress: (s) => ({ cur: (s.totals.couriers ?? 0) - (s.story.base.couriers ?? 0), target: 1 }),
      reward: { credits: 15_000, rep: { frf: 1 } },
    },
    {
      id: 't-trade',
      title: 'Händlerblut',
      about: 'Im Autohandel sucht der Transporter selbst das beste Geschäft. Mit einer festen Route fliegt er immer dieselbe Strecke – wenig Arbeit, verlässlicher Gewinn.',
      story: 'Wer günstig kauft und dort verkauft, wo es gebraucht wird, verdient. Zeig der Familie, dass du es kannst.',
      goal: 'Verkaufe Waren für 400.000 Cr',
      hint: 'Lass den Transporter im Autohandel laufen oder lege unter Flotte eine feste Route an. Kurieraufträge zahlen meist am besten.',
      progress: (s) => ({ cur: Math.floor(soldSince(s)), target: 400_000 }),
      reward: { credits: 25_000, rep: { frf: 1 } },
    },
    {
      id: 't-fleet',
      title: 'Zweites Schiff',
      about: 'Ein Miner liefert Rohstoffe, die du nicht kaufen musst – die Grundlage für die erste eigene Fabrik.',
      story: 'Ein zweites Schiff verdoppelt die Einnahmen. Ein weiterer Transporter oder ein Miner – du entscheidest.',
      goal: 'Besitze 2 Schiffe',
      hint: 'Flotte → „Schiff kaufen“.',
      progress: (s) => ({ cur: s.ships.length, target: 2 }),
      reward: { credits: 30_000, rep: { frf: 1 } },
    },
  ],
};

/** Kampagne dieses Spiels: Einstiegskapitel des Starts, dann die gemeinsamen Kapitel */
const storyCache = new Map<string, StoryMission[]>();
export function storyOf(state: GameState): StoryMission[] {
  const k = state.start ?? '';
  let list = storyCache.get(k);
  if (!list) storyCache.set(k, (list = [...(state.start ? INTRO[state.start] : []), ...STORY]));
  return list;
}

/** Kapitelreihenfolge vor der Erweiterung auf 28 Kapitel – zum Umstellen alter Spielstände */
export const OLD_STORY_IDS = ['refinery', 'metals', 'miners', 'trader', 'graphene', 'second', 'hull', 'license', 'chips', 'engines', 'claytronics', 'yard', 'firstship', 'shiporder', 'empire'];

export function currentMission(state: GameState): StoryMission | null {
  return storyOf(state)[state.story.index] ?? null;
}

export function startMission(state: GameState): void {
  const m = currentMission(state);
  if (!m) return;
  state.story.claimed = false;
  state.story.startedAt = state.time;
  state.story.base = { ...state.totals.produced, 'buildOwn:claytronics': state.totals.buildOwn?.claytronics ?? 0, 'shipsSold': state.totals.shipsSold ?? 0, sold: state.totals.sold, couriers: state.totals.couriers ?? 0 };
  state.story.id = m.id;
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
let lastBuyable = -1;

/** Meldet, wenn durch gestiegenen Ruf neue Baupläne kaufbar werden */
function checkBlueprints(state: GameState): void {
  const open = (d: (typeof MODULES)[number]) => vendorsFor(d.id).some((v) => state.rep[v.faction] >= d.repRequired);
  const buyable = MODULES.filter((d) => !state.blueprints.includes(d.id) && open(d));
  const unlocked = MODULES.filter(open).length;
  if (lastBuyable >= 0 && unlocked > lastBuyable && buyable.length) {
    log(state, `Mehr Ruf: neue Baupläne bei den Vertretern (${buyable.length} kaufbar) – tippe einen Handelsposten oder eine Werft an.`, 'good', true);
  }
  lastBuyable = unlocked;
}

export function stepStory(state: GameState): void {
  checkBlueprints(state);
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
  const done = state.story.index;
  state.story.index++;
  startMission(state);
  emit({ type: 'story' });
  emit({ type: 'chapter', index: done, title: m.title, credits: m.reward.credits, faction: missionFaction(m) });
  return { ok: true, msg: m.title + ' abgeschlossen.' };
}

/** Fraktion eines Kapitels: wer den meisten Ruf vergibt, sonst der Lieferort, sonst die Freien Familien */
export function missionFaction(m: StoryMission): FactionId {
  const rep = Object.entries(m.reward.rep ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (rep.length) return rep[0][0] as FactionId;
  return m.delivery ? sector(m.delivery.sector).faction : 'frf';
}

export function missionSectorName(m: StoryMission): string {
  return m.delivery ? sector(m.delivery.sector).tradeStation.name : '';
}
