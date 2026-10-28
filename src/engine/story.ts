// Kampagne „Wiederaufbau von Zhin“: führt durch die Spielmechaniken.
import { SHIP_MAP } from '../data/ships';
import { sector } from '../data/sectors';
import { WARES } from '../data/wares';
import type { Contract, FactionId, GameState, StartKind } from './types';
import { emit, log } from './util';
import { netWorth } from './stats';
import { factoryUtil } from './npcEconomy';
import { MODULES } from '../data/modules';
import { vendorsFor } from '../data/vendors';
import { book } from './ledger';
import { scouts } from './explore';

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
    story: 'Vor elf Wochen haben die Xenon zwei Docks der Zhin-Werft zerschossen. Patriarchin Kerra Zhin gibt dir Baurecht im Sektor, wenn du beim Wiederaufbau hilfst. Ganz oben auf der Werftliste: Veredelte Metalle.',
    goal: 'Baue eine Fabrik für Veredelte Metalle',
    hint: 'Station → „Module“ → „Modul einplanen“. Jedes Modul braucht echtes Baumaterial (Claytronik, Energiezellen, Hüllenteile). NPC-Händler liefern es ins Baulager der Station; was dort liegt, siehst du als „x von y vorhanden“.',
    progress: (s) => ({ cur: countModules(s, 'prod_refinedmetals'), target: 1 }),
    reward: { credits: 400_000, rep: { frf: 2 } },
  },
  {
    id: 'metals',
    title: 'Metall für das Tor',
    about: 'Jede Stufe der Kette braucht die vorige: 240 Erz + 90 Energiezellen ergeben 88 Veredelte Metalle. Ein Engpass ganz links bremst alles rechts davon.',
    story: 'Am Sprungtor nach Tharka sind vierzig Streben verbogen. Der Vorarbeiter rechnet mit 2.000 Einheiten Veredelte Metalle, bevor wieder große Frachter durchpassen.',
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
    story: 'Dein Lager ist zu vier Fünfteln voll, die NPC-Händler kommen zweimal am Tag vorbei. Mit einem eigenen Transporter bestimmst du selbst, wann und wohin verkauft wird.',
    goal: 'Besitze einen Transporter',
    hint: 'Transporter im Autohandel verkaufen Überschüsse am Handelsposten und kaufen fehlende Waren ein.',
    progress: (s) => ({ cur: countShips(s, 'trader'), target: 1 }),
    reward: { credits: 500_000, rep: { frf: 1 } },
  },
  {
    id: 'graphene',
    title: 'Hitzeschutz',
    about: 'Graphen wird aus Methan gewonnen. Es steckt in Hüllenteilen, Quantenröhren und Plasmaleitern – also in fast allem, was fliegt oder schießt.',
    story: 'Für die Hitzeschilde der neuen Rümpfe will die Werft Graphen. Das Methanfeld im Süden von Zhin liegt fünf Flugminuten vom Handelsposten entfernt.',
    goal: 'Produziere 2.500 Graphen',
    hint: 'Graphen braucht Methan und Energiezellen. Baue ein Flüssiglager und schicke einen Gas-Miner los.',
    progress: (s) => ({ cur: producedSince(s, 'graphene'), target: 2500 }),
    reward: { credits: 800_000, rep: { frf: 2 } },
  },
  {
    id: 'second',
    title: 'Zweites Standbein',
    about: 'Eine Station direkt am Rohstofffeld spart Flugzeit: Miner schaffen mehr Ladungen pro Stunde. Jede Station braucht eigene Transporter – sie handeln immer für ihre Heimat.',
    story: 'Fällt der Kern deiner Station aus, steht die ganze Produktion. Eine zweite Station direkt am Rohstofffeld spart deinen Minern außerdem die halbe Flugzeit.',
    goal: 'Besitze 2 Stationen',
    hint: 'Tippe oben auf „+ Station“ und dann auf einen freien Platz im Sektor. Zuerst steht nur das Baulager (50.000 Cr) – selbst der Stationskern wird aus angeliefertem Material gebaut.',
    progress: (s) => ({ cur: s.stations.length, target: 2 }),
    reward: { credits: 700_000, rep: { frf: 1 } },
  },
  {
    id: 'hull',
    title: 'Werftbedarf',
    about: 'Hüllenteile (Veredelte Metalle + Graphen) sind das wichtigste Baumaterial überhaupt: Jeder Schiffsrumpf und jedes Stationsmodul besteht zum großen Teil daraus.',
    story: 'Werftmeisterin Sae Zhin will drei Rümpfe auflegen und braucht dafür 1.500 Hüllenteile. Zum ersten Mal laufen deine Metall- und deine Graphenfertigung in ein gemeinsames Produkt.',
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
    story: 'In Zhin werden die guten Bauplätze knapp. Die Familie Tkr verkauft Baurechte gegen Ruf, und in Tharka\'s Cascade liegen drei Gaswolken, die kaum jemand abbaut.',
    goal: 'Erwirb eine Baulizenz in einem weiteren Sektor',
    hint: 'Tippe oben links auf den Sektornamen, um die Galaxiekarte zu öffnen.',
    progress: (s) => ({ cur: s.sectors.length - 1, target: 1 }),
    reward: { credits: 1_500_000, rep: { frf: 2 } },
  },
  // Unbekannter Raum: Tevka Rhy und das Signal auf Kanal 9 führen zur ersten Erstsichtung
  {
    id: 'x-signal',
    title: 'Kanal 9',
    about: 'Späher sind kleine, schnelle Schiffe mit Richtantenne. Sie handeln nicht und bauen nichts ab – sie suchen nach erloschenen Toren.',
    story: 'Tevka Rhy macht den Funk am Handelsposten von Rhy\'s Defiance. Seit dem Frühjahr hört sie auf Kanal 9 alle 40 Sekunden dasselbe Knacken, aus Richtung des alten Tors, das seit 31 Jahren tot ist. Ihre Familie hält es für einen Defekt in der Anlage. Tevka nicht.',
    goal: 'Kaufe einen Späher',
    hint: 'Unten „Karte“ → Rhy\'s Defiance antippen → „Späher kaufen“.',
    progress: (s) => ({ cur: Math.min(1, scouts(s).length), target: 1 }),
    reward: { credits: 150_000, rep: { zya: 1 } },
  },
  {
    id: 'x-peil',
    title: 'Zwei kurz, einer lang',
    about: 'Ein erloschenes Tor sendet schwach und unregelmäßig. Ohne Peilung findet der Späher es nur mit Glück; wer das Signal hält, findet es sicher. Jedes Gebiet stört das Signal auf eigene Art.',
    story: 'Tevka hat dir ihre Aufzeichnungen geschickt. Das Knacken hat ein Muster: zwei kurze Impulse, ein langer. So melden sich Sprungtore, in deren Ringen noch Restenergie steckt. „Peil es an, solange es sendet“, schreibt sie. „Ich weiß nicht, wie lange noch.“',
    goal: 'Finde eine Torsignatur',
    hint: 'Karte → Rhy\'s Defiance → „Peilen und … schicken“. Antenne auf dem Radar drehen, Frequenz unten an der Welle abstimmen, Signal halten.',
    progress: (s) => ({ cur: Math.min(1, (s.frontier?.signatures.length ?? 0) + (s.frontier?.discovered.length ?? 0)), target: 1 }),
    reward: { credits: 200_000, rep: { zya: 1 } },
  },
  {
    id: 'x-gate',
    title: 'Totes Tor',
    about: 'Ein erloschenes Tor braucht Hüllenteile für die Ringsegmente und Energiezellen, um die Kopplung neu zu laden. Du lieferst aus deinen Stationslagern; was fehlt, verkaufen Händler mit Aufschlag.',
    story: 'Der Späher hat das Tor gefunden: alte Bauart, 9 km hinter dem Handelsposten, von Trümmern zugesetzt. Die Ringe sind heil, die Energiekopplung ist durchgebrannt. Tevkas Onkel Dravo hat vor dem Ausfall an diesem Tor gearbeitet. Er sagt, mit 250 Hüllenteilen und tausend Zellen läuft es wieder.',
    goal: 'Setze das Tor in Rhy\'s Defiance instand',
    hint: 'Karte → Rhy\'s Defiance → „Baustelle einrichten“ → „Aus deinen Lagern liefern“. Danach dauert die Montage eine halbe Stunde.',
    progress: (s) => ({ cur: Math.min(1, (s.frontier?.open?.length ?? 0) + (s.frontier?.discovered.length ?? 0)), target: 1 }),
    reward: { credits: 400_000, rep: { zya: 2 } },
  },
  {
    id: 'x-through',
    title: 'Was dahinter liegt',
    about: 'Hinter jedem instand gesetzten Tor liegt ein Sektor, den seit Jahrzehnten niemand gesehen hat. Von dort aus geht die Suche weiter – jeder neue Sektor kann eigene tote Tore haben.',
    story: 'Das Tor läuft. Auf der anderen Seite antwortet niemand auf Funk. Die letzte Meldung von dort ist 31 Jahre alt: Der Horchposten der Familie Rhy meldete Störungen am Tor, dann brach die Verbindung ab. Dravo will mitfliegen. Tevka sagt, er soll warten, bis der Späher zurück ist.',
    goal: 'Schick deinen Späher durch das Tor',
    hint: 'Karte → Rhy\'s Defiance → „… hindurchschicken“.',
    progress: (s) => ({ cur: Math.min(1, s.frontier?.discovered.length ?? 0), target: 1 }),
    reward: { credits: 1_000_000, rep: { zya: 2, frf: 1 } },
  },
  {
    id: 'storage',
    title: 'Mehr Platz',
    about: 'Lager S fassen 25.000–100.000 m³, Lager M bis 500.000 m³, Lager L eine Million. Große Fabriken und vor allem Werften brauchen Platz für Vorräte – sonst stockt die Produktion, sobald ein Lieferant ausfällt.',
    story: 'Deine Lager laufen jede Nacht voll, und die Miner warten dann mit voller Ladung am Dock. Die Familie verkauft Pläne für Lagermodule der Größe M.',
    goal: 'Baue ein Lagermodul der Größe M',
    hint: 'Bauplan beim Handelsvertreter (Ruf 2). Dann Station → Module → Kategorie „Lager“.',
    progress: (s) => ({ cur: storageMods(s, 'm'), target: 1 }),
    reward: { credits: 1_000_000, rep: { frf: 1 } },
  },
  {
    id: 'wafers',
    title: 'Silizium veredeln',
    about: 'Siliziumscheiben (Silizium + Energiezellen) sind die Grundlage aller Elektronik: Mikrochips, Smartchips für Drohnen und Scannerarrays für Geschütze.',
    story: 'Für eigene Steuertechnik braucht Zhin Siliziumscheiben. Bisher kommen sie aus Tharka, mit drei Wochen Lieferzeit. Das Siliziumfeld im Norden gibt mehr her.',
    goal: 'Produziere 3.000 Siliziumscheiben',
    hint: 'Eine Station nahe dem Siliziumfeld mit Feststofflager, Siliziumscheiben-Fabriken und Mineral-Minern.',
    progress: (s) => ({ cur: producedSince(s, 'siliconwafers'), target: 3000 }),
    reward: { credits: 1_500_000, rep: { frf: 1 } },
  },
  {
    id: 'chips',
    title: 'Steuertechnik',
    about: 'Mikrochips aus Siliziumscheiben steuern Geschütze, Drohnen und Antimaterie-Konverter. Vor allem sind sie eine Zutat für Claytronik.',
    story: 'Jeder Scanner und jede Antriebssteuerung braucht Mikrochips. Die Werft hat 1.000 Stück bestellt; der Engpass sind die Siliziumscheiben.',
    goal: 'Produziere 1.000 Mikrochips',
    hint: 'Den Bauplan hat der Handelsvertreter. Mikrochips brauchen 200 Siliziumscheiben pro Zyklus – plane mehrere Scheibenfabriken ein.',
    progress: (s) => ({ cur: producedSince(s, 'microchips'), target: 1000 }),
    reward: { credits: 3_000_000, rep: { frf: 2, zya: 2 } },
  },
  {
    id: 'antimatter',
    title: 'Energie für Antriebe',
    about: 'Antimateriezellen entstehen aus Wasserstoff und Energiezellen. Sie treiben jedes Triebwerk an und sind eine der vier Zutaten für Claytronik.',
    story: 'Ein Quartiermeister des Patriarchats fragt nach Antriebsteilen. Dafür brauchst du zuerst Antimateriezellen – aus dem Wasserstoff im Osten von Zhin.',
    goal: 'Produziere 3.000 Antimateriezellen',
    hint: 'Flüssiglager, Gas-Miner für Wasserstoff und Antimateriezellen-Fabriken. Das Wasserstofffeld liegt im Osten von Zhin.',
    progress: (s) => ({ cur: producedSince(s, 'antimattercells'), target: 3000 }),
    reward: { credits: 2_000_000, rep: { frf: 1, zya: 1 } },
  },
  {
    id: 'engines',
    title: 'Flotte in Bewegung',
    about: 'Antriebsteile (Antimateriezellen + Veredelte Metalle) stecken in jedem Triebwerk und jeder Steuerdüse. Wer sie liefert, rüstet Flotten aus – und gewinnt Freunde.',
    story: 'Die Nachschubflotte in Rhy\'s Defiance hat 2.000 Antriebsteile bestellt. Zwischen Familien und Patriarchat herrscht Misstrauen; eine pünktliche Lieferung zählt dort mehr als jede Botschaft.',
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
    story: 'Die Ingenieure der Familie wollen Quantenröhren selbst fertigen. Erster Schritt: 2.000 Einheiten Superfluides Kühlmittel aus Helium.',
    goal: 'Produziere 2.000 Superfluides Kühlmittel',
    hint: 'Helium sammeln Gas-Miner im Südwesten von Zhin. Kühlmittel-Fabrik plus Flüssiglager.',
    progress: (s) => ({ cur: producedSince(s, 'superfluidcoolant'), target: 2000 }),
    reward: { credits: 2_000_000, rep: { frf: 1 } },
  },
  {
    id: 'quantum',
    title: 'Quantensprung',
    about: 'Quantenröhren (Graphen + Kühlmittel) stecken in Claytronik, Schildkomponenten, Feldspulen und Geschützkomponenten – das Herzstück der Hochtechnologie.',
    story: 'Kühlmittel und Graphen sind da. Quantenröhren gehen in Schildgeneratoren und Feldspulen, und die Werft nimmt jede Menge ab.',
    goal: 'Produziere 1.000 Quantenröhren',
    hint: 'Quantenröhren brauchen Graphen (Methan) und Kühlmittel (Helium). Der Stationsplaner zeigt die ganze Kette.',
    progress: (s) => ({ cur: producedSince(s, 'quantumtubes'), target: 1000 }),
    reward: { credits: 3_000_000, rep: { frf: 2 } },
  },
  {
    id: 'claytronics',
    title: 'Programmierbare Materie',
    about: 'Claytronik ist das Spitzenprodukt der Kette: Antimateriezellen, Mikrochips, Quantenröhren und Energiezellen werden zu formbarer Nanomaterie. Jedes Stationsmodul braucht sie – eine Werft allein 3.312 Einheiten.',
    story: 'Patriarchin Zhin will, dass die Familie wieder eigene Schiffe baut. Jeder Rumpf braucht Claytronik, und die Märkte im Umkreis haben zusammen keine 500 Einheiten auf Lager.',
    goal: 'Produziere 1.000 Claytronik',
    hint: 'Claytronik braucht vier Eingangswaren. Liefern die Chips von einer anderen Station, setze sie dort in die Lieferreihenfolge.',
    progress: (s) => ({ cur: producedSince(s, 'claytronics'), target: 1000 }),
    reward: { credits: 6_000_000, rep: { frf: 3 } },
  },
  {
    id: 'ownbuild',
    title: 'Aus eigener Hand',
    about: 'Ins Baulager liefern NPC-Händler vom Markt – doch Claytronik ist dort knapp und teuer. Bringen deine Transporter eigene Claytronik ins Baulager, wird sie genauso verbaut.',
    story: 'Die Handelsposten von Zhin bis Tkr sind leergekauft. Ab jetzt baust du mit Claytronik aus eigener Fertigung.',
    goal: 'Verbaue 500 eigene Claytronik in neuen Modulen',
    hint: 'Plane z. B. eine zweite Claytronik-Fabrik im Claytronik-Werk ein und lade dort unter „Module“ → Baulager → „Umladen“ eigene Claytronik ins Baulager. Tipp: Eine Reserve im Lager-Dialog verhindert, dass deine Transporter die Claytronik vorher verkaufen.',
    progress: (s) => ({ cur: (s.totals.buildOwn?.claytronics ?? 0) - (s.story.base['buildOwn:claytronics'] ?? 0), target: 500 }),
    reward: { credits: 4_000_000, rep: { frf: 2 } },
  },
  {
    id: 'shields',
    title: 'Schutzschilde',
    about: 'Schildkomponenten (Plasmaleiter + Quantenröhren) bauen die Schildgeneratoren jedes Schiffs. Ohne sie verlässt kein Rumpf die Werft.',
    story: 'Sae Zhin bestellt eine Probelieferung Schildkomponenten. Besteht sie die Prüfung im Werftdock, bekommst du die großen Aufträge.',
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
    story: 'Die Familie verkauft dir die Pläne für ein Werftmodul. Es wäre die erste Werft der Zhin seit dem Angriff, die nicht im Notbetrieb läuft.',
    goal: 'Baue eine S/M-Schiffsfertigung',
    hint: 'Bauplan beim Werftvertreter der Zhin-Werft (Ruf 10, 120 Mio Cr). Das Modul braucht 3.312 Claytronik, 6.620 Energiezellen und 12.112 Hüllenteile – ohne eigene Claytronik dauert das.',
    progress: (s) => ({ cur: countModules(s, 'yard_m') + countModules(s, 'yard_l'), target: 1 }),
    reward: { credits: 15_000_000, rep: { frf: 3 } },
  },
  {
    id: 'yardstock',
    title: 'Volle Lager',
    about: 'Eine Werft hält ihr Material ständig auf Vorrat. Je voller die Lager, desto mehr Schiffe kannst du am Stück bauen, wenn die Bestellungen kommen.',
    story: 'Drei Familien haben schon nach Lieferzeiten gefragt. Ein Schiff baut die Werft aber nur, wenn alle Teile im Lager liegen.',
    goal: 'Werftvorrat für 3 Boas',
    hint: 'Werft-Reiter zeigt „Vorrat für N×“. Größere Lager (M/L) und eigene Lieferketten füllen schneller.',
    progress: (s) => ({ cur: yardStock(s, 'boa'), target: 3 }),
    reward: { credits: 4_000_000, rep: { frf: 1 } },
  },
  {
    id: 'firstship',
    title: 'Stapellauf',
    about: 'Eigene Schiffe kosten nur ihr Material – eine Boa etwa 95.000 Cr statt rund 480.000 Cr Kaufpreis.',
    story: 'Die Werfthalle ist fertig, das Lager voll. Das erste Schiff aus deiner Werft bekommt die Kennung ZHN-001.',
    goal: 'Baue ein Schiff in deiner eigenen Werft',
    hint: 'Station → Reiter „Werft“ → Schiff wählen.',
    progress: (s) => ({ cur: s.totals.shipsBuilt ?? 0, target: 1 }),
    reward: { credits: 3_000_000, rep: { frf: 2 } },
  },
  {
    id: 'shiporder',
    title: 'Werft für die Familien',
    about: 'Fraktionen bestellen Schiffe zum Marktpreis. Du lieferst aus eigener Fertigung – der Unterschied zwischen Material und Preis ist dein Gewinn, und jede Lieferung stärkt deinen Ruf.',
    story: 'Seit ZHN-001 kommen Anfragen aus Tkr und Rhy\'s Defiance. Die Familien zahlen im Voraus und erwarten pünktliche Übergabe.',
    goal: 'Liefere 2 bestellte Schiffe aus',
    hint: 'Bestellungen erscheinen unter „Aufträge“, sobald du eine Werft besitzt. Nimm eine an und wähle die Werft, die sie baut.',
    progress: (s) => ({ cur: s.totals.shipsSold ?? 0, target: 2 }),
    reward: { credits: 10_000_000, rep: { frf: 3, zya: 2 } },
  },
  {
    id: 'converters',
    title: 'Große Antriebe',
    about: 'Antimaterie-Konverter (Hochleistungsverbundstoffe + Mikrochips) braucht jedes Schiff für seine Steuerdüsen – und L-Schiffe in großer Menge für ihre Triebwerke: über 500 Stück für einen Buffalo.',
    story: 'Für Großfrachter braucht die Familie Antimateriekonverter, mehrere Dutzend je Triebwerk. Bisher kauft sie die teuer bei den Teladi.',
    goal: 'Produziere 1.000 Antimaterie-Konverter',
    hint: 'Hochleistungsverbundstoffe brauchen Graphen und Veredelte Metalle. Bauplan beim Handelsvertreter.',
    progress: (s) => ({ cur: producedSince(s, 'antimatterconverters'), target: 1000 }),
    reward: { credits: 12_000_000, rep: { frf: 2 } },
  },
  {
    id: 'yardl',
    title: 'Große Pläne',
    about: 'Die L-Schiffsfertigung baut Großfrachter und Großminer. Sie ist doppelt so teuer wie die S/M-Werft – und die Schiffe, die sie baut, bringen das Zehnfache.',
    story: 'Tkr und Zhin wollen Buffalos und Wyverns. In der ganzen Gegend gibt es keine Werft, die Schiffe dieser Größe baut.',
    goal: 'Baue eine L-Schiffsfertigung',
    hint: 'Bauplan beim Werftvertreter (Ruf 15, 240 Mio Cr). L-Schiffe brauchen außerdem Drohnenkomponenten und Smartchips.',
    progress: (s) => ({ cur: countModules(s, 'yard_l'), target: 1 }),
    reward: { credits: 25_000_000, rep: { frf: 3 } },
  },
  {
    id: 'bigship',
    title: 'Riese vom Stapel',
    about: 'Ein Buffalo trägt 16.000 m³ – mehr als zwei Boas – und fliegt im Reiseantrieb schneller. Ein Wyvern fördert dreimal so viel wie ein Alligator.',
    story: 'Die L-Werft steht. Das erste Großschiff soll komplett aus Teilen deiner eigenen Fertigung entstehen.',
    goal: 'Baue ein L-Schiff in deiner Werft',
    hint: 'L-Schiffe brauchen zusätzlich Drohnenkomponenten, Smartchips und viele Antimaterie-Konverter. Deine Station braucht einen Pier, um sie einzusetzen.',
    progress: (s) => ({ cur: s.totals.shipsBuiltL ?? 0, target: 1 }),
    reward: { credits: 15_000_000, rep: { frf: 2 } },
  },
  {
    id: 'orders',
    title: 'Ruf der Werft',
    about: 'Jede ausgelieferte Bestellung bringt Gewinn und Ruf. Ein guter Ruf öffnet weitere Lizenzen und Baupläne – bis hin zur XL-Werft.',
    story: 'Drei Aufträge sind offen, zwei davon mit Vertragsstrafe. Wer jetzt pünktlich liefert, bekommt auch die Folgeaufträge der Familien.',
    goal: 'Liefere 10 weitere bestellte Schiffe aus',
    hint: 'Nimm Bestellungen an, die deine Werft mit dem vorhandenen Material schnell bauen kann.',
    progress: (s) => ({ cur: (s.totals.shipsSold ?? 0) - (s.story.base.shipsSold ?? 0), target: 10 }),
    reward: { credits: 30_000_000, rep: { frf: 3, zya: 3 } },
  },
  {
    id: 'empire',
    title: 'Ein Imperium der Familien',
    about: 'Der Unternehmenswert zählt Credits, Stationen, Lager und Schiffe. Als Nächstes warten die XL-Werft und Kampfschiffe – die Xenon und Piraten sind nicht verschwunden.',
    story: 'Am Anfang hattest du eine Station und einen Miner. Jetzt laufen Werften, Fabriken und Frachter unter deiner Kennung. Die Wachposten an den Toren melden mehr Piraten als früher, und die Xenon-Streifen in der Schlucht kommen häufiger.',
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
      story: 'Die Familie hat dir einen gebrauchten Miner, ein paar Lagermodule und 5.000 Credits gegeben. Mehr ist nach dem Angriff nicht übrig.',
      goal: 'Verdiene 60.000 Cr mit Rohstoffen',
      hint: 'Dein Miner arbeitet von selbst: Er sucht das Feld, das sich gerade am besten verkauft. Beschleunige das Spiel oben rechts.',
      progress: (s) => ({ cur: Math.floor(soldSince(s)), target: 60_000 }),
      reward: { credits: 15_000, rep: { frf: 1 } },
    },
    {
      id: 'm-buyers',
      title: 'Wirtschaftszweig wählen',
      about: 'Erz und Silizium gehen in Zhin an zwei verschiedene Fabriken: Die Metallhütte macht aus Erz Veredelte Metalle und Hüllenteile, das Siliziumwerk Siliziumscheiben – der Grundstoff für Claytronik. Ohne Rohstoffe stehen beide still; was du lieferst, bringt ihren Zweig in Gang, und ihre Produkte werden reichlicher und günstiger.',
      story: 'Die Familie braucht beides: Hüllenteile für den Wiederaufbau und Claytronik für alles, was danach kommt. Wen versorgst du zuerst?',
      goal: 'Bring eine Fabrik auf 40 % Auslastung',
      hint: 'Tippe die Metallhütte oder das Siliziumwerk an: Dort siehst du Auslastung und Vorräte. Unter Flotte → Miner stellst du die Rohstoffart fest ein (Erz oder Silizium).',
      progress: (s) => ({ cur: Math.round(Math.max(...['zhin-huette', 'zhin-silizium'].map((k) => (s.npcEco?.[k] ? factoryUtil(s.npcEco[k]) : 0))) * 100), target: 40 }),
      reward: { credits: 25_000, rep: { frf: 1 } },
    },
    {
      id: 'm-fleet',
      title: 'Zweites Schiff',
      about: 'Ein Transporter verdient mit Lieferaufträgen und Handel zwischen den Stationen – und bringt später Baumaterial für deine eigenen Module.',
      story: 'Fällt dein einziges Schiff aus, verdienst du nichts. Kauf ein zweites: noch einen Miner oder einen kleinen Transporter für Lieferaufträge.',
      goal: 'Besitze 2 Schiffe',
      hint: 'Flotte → „Schiff kaufen“. Der Tuatara (S) ist günstig und passt zu den Lieferaufträgen unter „Aufträge“.',
      progress: (s) => ({ cur: s.ships.length, target: 2 }),
      reward: { credits: 30_000, rep: { frf: 1 } },
    },
  ],
  trading: [
    {
      id: 't-courier',
      title: 'Kurierdienst',
      about: 'Lieferaufträge entstehen dort, wo eine Station dringend Ware braucht: Ihr Lager ist fast leer, sie zahlt 30–50 % über ihrem ohnehin hohen Preis. Wo du einkaufst, entscheidest du – wer günstig kauft, verdient doppelt.',
      story: 'Am Handelsposten hängen Lieferaufträge, die keiner annimmt – zu klein für die großen Frachter. Für zwei Tuatara genau richtig.',
      goal: 'Erfülle einen Lieferauftrag',
      hint: 'Unter „Aufträge“ einen Lieferauftrag ansehen, Einkaufsort und Transporter wählen, losschicken. Der Lohn kommt mit der Lieferung.',
      progress: (s) => ({ cur: (s.totals.couriers ?? 0) - (s.story.base.couriers ?? 0), target: 1 }),
      reward: { credits: 15_000, rep: { frf: 1 } },
    },
    {
      id: 't-trade',
      title: 'Händlerblut',
      about: 'Im Autohandel sucht der Transporter selbst das beste Geschäft. Mit einer festen Route fliegt er immer dieselbe Strecke – wenig Arbeit, verlässlicher Gewinn.',
      story: 'Energiezellen bringen in Tharka\'s Cascade deutlich mehr als in Zhin, wo sie im Überfluss produziert werden. Solche Unterschiede gibt es bei vielen Waren; man muss sie nur kennen.',
      goal: 'Verkaufe Waren für 400.000 Cr',
      hint: 'Lass den Transporter im Autohandel laufen oder lege unter Flotte eine feste Route an. Lieferaufträge zahlen meist am besten.',
      progress: (s) => ({ cur: Math.floor(soldSince(s)), target: 400_000 }),
      reward: { credits: 25_000, rep: { frf: 1 } },
    },
    {
      id: 't-fleet',
      title: 'Drittes Schiff',
      about: 'Ein Miner liefert Rohstoffe, die du nicht kaufen musst – die Grundlage für die erste eigene Fabrik.',
      story: 'Zwei Transporter laufen. Ein drittes Schiff bringt mehr: noch ein Transporter oder ein Miner – du entscheidest.',
      goal: 'Besitze 3 Schiffe',
      hint: 'Flotte → „Schiff kaufen“.',
      progress: (s) => ({ cur: s.ships.length, target: 3 }),
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

export function resetStoryNotes(): void {
  lastNotified = -1;
  lastBuyable = -1;
}

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
    log(state, `Ziel erreicht: ${m.title}. Belohnung abholen!`, 'good', true, { kind: 'story' });
    emit({ type: 'story' });
  }
}

export function claimMission(state: GameState): { ok: boolean; msg: string } {
  const m = currentMission(state);
  if (!m || !missionComplete(state)) return { ok: false, msg: 'Ziel noch nicht erreicht.' };
  book(state, m.reward.credits, 'reward', `Kapitel: ${m.title}`, { kind: 'story' });
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
