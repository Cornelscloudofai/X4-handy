// Hilfe-Seiten: kurze Erklärungen der wichtigsten Spielsysteme, im Menü und als „?“ direkt an der passenden Stelle.
import { esc } from './dom';
import { icon } from './icons';

export interface HelpTopic {
  id: string;
  title: string;
  icon: string;
  short: string;
  body: string;
}

const act = (a: string, data: Record<string, string> = {}) =>
  `data-act="${a}"` + Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

const p = (t: string) => `<p>${t}</p>`;
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

export const HELP: HelpTopic[] = [
  {
    id: 'start', title: 'Erste Schritte', icon: 'play', short: 'Der Grundablauf in vier Schritten',
    body: [
      p('Du baust Stationen, die aus Rohstoffen Waren herstellen, und verkaufst sie. Mit dem Gewinn wächst dein Imperium – bis zur eigenen Werft.'),
      ul([
        '<b>Fördern:</b> Miner fliegen zu Rohstofffeldern und bringen Erz, Silizium, Eis oder Gas zu ihrer Heimatstation.',
        '<b>Herstellen:</b> Produktionsmodule arbeiten mit den echten X4-Rezepten. Solarkraftwerke liefern Energiezellen, je nach Sonnenlicht im Sektor.',
        '<b>Handeln:</b> Transporter verkaufen Überschüsse und kaufen fehlende Waren ein. NPC-Händler besuchen deine Stationen zusätzlich.',
        '<b>Wachsen:</b> Die Kampagne (unten auf der Karte) führt dich Kapitel für Kapitel. Aufträge bringen Ruf, Ruf öffnet Baupläne und Sektoren.',
      ]),
      p('<b>Gekürzte Texte</b> (mit „…“) klappst du durch Antippen auf; auf Knöpfen und antippbaren Zeilen zeigt langes Drücken den ganzen Text.'),
      p('In der Leiste oben steuerst du die Zeit: Pause oder bis ×60. Dein Imperium läuft auch weiter, wenn die App geschlossen ist (bis zu 8 Stunden).'),
    ].join(''),
  },
  {
    id: 'buildstore', title: 'Baulager und Modulbau', icon: 'box', short: 'Wie Module aus echtem Material entstehen',
    body: [
      p('Jede Station hat von Anfang an ein <b>Baulager</b> – es steht schon vor dem Stationskern und kostet bei der Gründung 50.000 Cr. Module kosten keine Credits, sondern echtes Baumaterial (Claytronik, Energiezellen, Hüllenteile …).'),
      ul([
        '<b>Lieferung:</b> NPC-Händler bringen das Material und werden bei Lieferung bezahlt. Deine Transporter kaufen es am Markt oder bringen Überschüsse eigener Stationen. Schiffe können das Baulager auch ohne Dock beliefern.',
        '<b>Anzeige:</b> Unter „Module“ siehst du je Ware „x von y vorhanden“ für die ganze Bauliste und was unterwegs ist.',
        '<b>Anteiliger Bau:</b> Das Material wird mit dem Fortschritt verbaut. Fehlt etwas, baut das Modul mit dem vorhandenen Material weiter und bleibt sonst beim erreichten Prozentwert stehen.',
        '<b>Umladen:</b> Ware aus dem eigenen Stationslager lädst du mit „Umladen“ selbst ins Baulager und wieder zurück.',
        '<b>Nur eigenes Material:</b> Ohne den Haken „NPC-Händler und Markteinkäufe dürfen liefern“ nimmt das Baulager nur Ware aus deinen Stationen an.',
      ]),
      p('Knappe Waren wie Claytronik sind ein guter Grund für eigene Fabriken.'),
    ].join(''),
  },
  {
    id: 'storage', title: 'Lager, Anteile und Reserve', icon: 'storage', short: 'Container, Feststoff, Flüssig – und wer was bekommt',
    body: [
      p('Es gibt drei Lagerarten: <b>Container</b> (Energiezellen und alle Produkte), <b>Feststoff</b> (Erz, Silizium, Eis) und <b>Flüssig</b> (Wasserstoff, Helium, Methan). Ohne passendes Lager kann eine Station die Ware nicht annehmen.'),
      ul([
        '<b>Größen:</b> Lager S zum Start, M und L per Bauplan beim Handelsvertreter.',
        '<b>Anteile:</b> Der Platz einer Lagerart wird automatisch auf alle Waren der Station verteilt. Im Lager-Reiter stellst du für eine Ware einen festen Anteil ein.',
        '<b>Reserve:</b> So viel behält die Station für die eigene Produktion. Transporter und NPC-Händler verkaufen nur, was darüber liegt.',
      ]),
    ].join(''),
  },
  {
    id: 'trade', title: 'Transporter und Lieferreihenfolge', icon: 'trader', short: 'Autohandel, Prioritäten, feste Routen',
    body: [
      p('Jeder Transporter gehört zu einer <b>Heimatstation</b>. Im Autohandel ist sie immer einer der beiden Handelspartner: Er verkauft ihre Überschüsse oder bringt ihr, was fehlt – nie Handel zwischen zwei fremden Stationen.'),
      ul([
        '<b>Lieferreihenfolge:</b> Je Station legst du fest, welche eigenen Stationen Überschüsse zuerst bekommen (Prio 1, 2, …). Nimmt eine Station weniger als eine halbe Ladung ab, geht es eine Stufe tiefer; zuletzt wird zum besten Preis verkauft.',
        '<b>NPC-Händler zurückhalten:</b> Optional kaufen NPC-Händler eine Ware erst, wenn die Stationen der Reihenfolge versorgt sind.',
        '<b>Baulager zuerst:</b> Lieferungen fürs Baulager haben Vorrang, auch kleine Restmengen.',
        '<b>Feste Route:</b> Statt Autohandel kann ein Transporter dauerhaft zwischen zwei Punkten pendeln.',
      ]),
    ].join(''),
  },
  {
    id: 'miners', title: 'Miner und Restladung', icon: 'miner', short: 'Was gefördert wird und was bei vollem Lager passiert',
    body: [
      p('Mineral-Miner (Erz, Silizium, Eis, Nividium) und Gassammler (Wasserstoff, Helium, Methan) fördern für ihre Heimatstation. Sie wählen von selbst die Ware, die im Lager am knappsten ist – Rohstoffe für wartende Module zuerst.'),
      p('<b>Restladung:</b> Passt eine Ladung nicht mehr ganz ins Lager, vergleicht die Automatik Nachfüllen (Rest bleibt an Bord), Warten und Verkaufen am Markt. Das Ergebnis siehst du als Fallbetrachtung im Schiffsblatt; du kannst es je Miner auch fest einstellen.'),
    ].join(''),
  },
  {
    id: 'blueprints', title: 'Baupläne, Ruf und Lizenzen', icon: 'lock', short: 'Wo es Baupläne gibt und was sie freischaltet',
    body: [
      ul([
        '<b>Nur vor Ort:</b> Baupläne kaufst du bei Vertretern – Split-Baupläne bei den Handelsvertretern der Handelsposten, waffennahe Teile und Schiffsfertigung bei den Werftvertretern, fremde Bauweisen bei Gesandtschaften.',
        '<b>Ruf:</b> Je Bauplan ist ein Mindestruf bei der Gastgeberfraktion nötig. Ruf gibt es für Kapitel, Lieferaufträge, Schiffsbestellungen und – als kleine Starthilfe bis Stufe 3 – für Aufgaben an Stationen.',
        '<b>Lizenzen:</b> Bauen darfst du nur in Sektoren mit Baulizenz. Neue Sektoren bringen neue Märkte, Felder und Vertreter.',
        '<b>Planer:</b> Im Stationsplaner kannst du mit allen Bauplänen planen; übernommen wird ein Plan erst, wenn du die Baupläne besitzt.',
      ]),
    ].join(''),
  },
  {
    id: 'yard', title: 'Eigene Werft', icon: 'yard', short: 'Schiffe aus eigenen Waren bauen und verkaufen',
    body: [
      p('Mit einer S/M-, L- oder XL-Schiffsfertigung baut eine Station Schiffe aus ihrem Lager – Rumpf und Grundausstattung aus Hüllenteilen, Antriebsteilen, Schild-, Geschütz- und Drohnenkomponenten und mehr.'),
      ul([
        '<b>Vorrat:</b> Die Werft hält ihr Material ständig auf Vorrat, nicht erst bei einer Bestellung.',
        '<b>Bestellungen:</b> Fraktionen bestellen Schiffe zum Marktpreis. Pünktliche Lieferung bringt Credits und Ruf, eine verfallene Bestellung kostet Ruf.',
      ]),
    ].join(''),
  },
  {
    id: 'market', title: 'Märkte und Preise', icon: 'market', short: 'Wie Lagerstand den Preis macht – und warum große Ladungen lohnen',
    body: [
      p('Der Preis einer Ware hängt am Lagerstand der Station: bis 10 % Füllung gilt der <b>Höchstpreis</b>, bei 50 % der <b>Durchschnittspreis</b>, ab 90 % der <b>Tiefstpreis</b> – dazwischen gleitend.'),
      ul([
        '<b>Ein Preis je Ladung:</b> Eine Fuhre wird ganz zum Preis bei Abschluss gehandelt. Erst die nächste Ladung sieht den neuen Lagerstand – große Laderäume handeln so länger zum guten Preis.',
        '<b>NPC-Stationen mit S-Lager:</b> Fabriken, Werften und Wachposten haben kleine Lager. Sie füllen und leeren sich schnell, die Preise schwanken stark – gute Gelegenheiten für schnelle Händler.',
        '<b>Handelsposten:</b> Große Lager, ruhige Preise. Fabrikwaren wachsen dort nicht von selbst nach – Nachschub kommt nur von Fabriken und Spielern.',
        '<b>Marktwissen:</b> Live siehst du Preise nur in Quadranten mit eigener Station oder Satellit. Sonst gilt die letzte Momentaufnahme eines vorbeifliegenden oder angedockten Schiffs.',
      ]),
    ].join(''),
  },
  {
    id: 'orders', title: 'Kauf- und Verkaufsorder', icon: 'wallet', short: 'Handeln an der eigenen Station – ganz ohne eigenes Schiff',
    body: [
      p('An jeder Station mit S/M-Dock kannst du für eine Ware Orders setzen (Station → Lager → „Ware einkaufen …“ bzw. „Ware verkaufen …“). Fremde Schiffe erledigen den Transport, bezahlt wird bei Übergabe.'),
      ul([
        '<b>Kauforder:</b> Höchstpreis und Füllstand (Anteil der Lagergrenze). NPC-Händler liefern, solange sie die Ware im Sektor höchstens zu deinem Preis bekommen; NPC-Fabriken bringen ihre Produkte direkt, wenn du mehr bietest als der Handelsposten.',
        '<b>Verkaufsorder:</b> Mindestpreis und Anteil, der im Lager bleibt. Händler kaufen bei dir, wenn sie die Ware anderswo mindestens zu diesem Preis loswerden; NPC-Fabriken holen Vorprodukte direkt, wenn du nicht teurer bist als der Handelsposten.',
        '<b>Beides zugleich:</b> Kauf- und Verkaufsorder derselben Ware laufen parallel – günstig einkaufen, teurer verkaufen: deine Station wird zum Handelsplatz.',
        '<b>Je besser dein Preis, desto häufiger kommen Händler.</b> Deine eigenen Stationstransporter handeln davon unabhängig zu den Preisen der fremden Stationen.',
        '<b>Mit eigenem Schiff:</b> In beiden Dialogen bleibt „Stattdessen mit eigenem Schiff …“ – dann wählst du Schiff, Menge und Handelspartner selbst.',
      ]),
    ].join(''),
  },
  {
    id: 'economy', title: 'Wirtschaftszweige und Fabriken', icon: 'factory', short: 'Wem du lieferst, dessen Zweig wächst',
    body: [
      p('NPC-Fabriken arbeiten nach den X4-Rezepten. Fehlt ein Vorprodukt, steht das Modul still. Sie holen sich nur etwa ein Drittel ihres Bedarfs selbst – den Rest müssen andere liefern, vor allem du.'),
      ul([
        '<b>Zwei Zweige in Zhin:</b> Die <b>Metallhütte</b> macht aus Erz Veredelte Metalle und Hüllenteile, das <b>Siliziumwerk</b> aus Silizium Siliziumscheiben – der Grundstoff für Mikrochips und Claytronik im Tharka-Elektronikwerk (Cascade).',
        '<b>Wachstum:</b> Läuft eine Fabrik gut (ab 70 % Auslastung), baut sie Module an. Ihre Produkte werden reichlicher und günstiger.',
        '<b>Nur Überschüsse:</b> Fabriken behalten Zwischenprodukte, die sie selbst weiterverarbeiten, und geben nur ab, was darüber liegt.',
        '<b>Auslastung ansehen:</b> Tippe eine NPC-Fabrik auf der Karte an – du siehst Module, Vorräte, was fehlt und was sie herstellt.',
      ]),
    ].join(''),
  },
  {
    id: 'rights', title: 'Schürfrechte', icon: 'lock', short: 'Wo deine Miner abbauen dürfen',
    body: [
      p('In Sektoren mit deiner Baulizenz (auch im Heimatsektor) sind Grundrohstoffe frei. Anderswo braucht es das Schürfrecht der Fraktion – in der Sektorinfo (ⓘ oben) unter „Wirtschaft“ → „Schürfrechte“.'),
      ul([
        '<b>Grundrohstoffe</b> (Erz, Silizium, Eis, Gas): Ruf 2 + 50.000 Cr je Sektor.',
        '<b>Nividium:</b> Tkr Ruf 5 + 500.000 Cr, Tharka\'s Ravine Ruf 10 + 1,5 Mio Cr, in neuen Sektoren (Aschefelder) Ruf 8 + 1 Mio Cr – setzt das Grundrecht voraus. Im Startsektor gibt es kein Nividium.',
        '<b>Ruf</b> gibt es für Kapitel, Lieferaufträge, Handel mit der Fraktion und (bis Stufe 3) für Aufgaben an ihren Stationen – wer ihre Wirtschaft versorgt, darf auch ihr Nividium abbauen.',
        'Ohne Recht nehmen Miner dort keinen Befehl an.',
      ]),
    ].join(''),
  },
  {
    id: 'ships', title: 'Freie Schiffe und Sektorhandel', icon: 'trader', short: 'Stationshändler, freie Händler und Miner',
    body: [
      ul([
        '<b>Stationshändler:</b> Einer Station zugeordnete Transporter kaufen, was sie braucht, und verkaufen ihre Überschüsse – Reichweite nach Pilotenrang (ab drei Sternen auch Nachbarsektoren).',
        '<b>Freie Transporter:</b> Ohne Station. Sektorhandel mit einer Ware in einem Sektor: beim günstigsten bekannten Verkäufer kaufen, an den Bestbietenden verkaufen. Angenommene Lieferaufträge erledigen sie zuerst.',
        '<b>Eine Ware je Schiff:</b> Für eine zweite Ware brauchst du ein zweites Schiff – oder du änderst den Befehl selbst. Feste Routen und Einzelbefehle gehen jederzeit zusätzlich.',
        '<b>Mindestgewinn:</b> Automatische Fahrten müssen sich lohnen – S 500 Cr, M 2.000 Cr, L 5.000 Cr je Fahrt.',
        '<b>Freie Miner:</b> Sektorbefehl für einen Rohstoff; verkauft wird an den Bestbietenden oder einen fest eingestellten Abnehmer.',
      ]),
    ].join(''),
  },
  {
    id: 'news', title: 'Konto und Nachrichten', icon: 'info', short: 'Wohin das Geld geht – und was passiert ist',
    body: [
      ul([
        '<b>Kontobuch:</b> Tippe oben auf dein Guthaben. Du siehst jede Buchung mit Grund (Handel, Orders an der Station, Aufträge, Bau, Schiffe, Belohnungen), Summen der letzten Stunde und 24 Stunden und eine Aufteilung nach Art. Jede Buchung springt zum Schiff, zur Station oder zum Auftrag.',
        '<b>Nachrichtenblatt:</b> Der Knopf mit der Sprechblase neben „Bauen“ sammelt alle Meldungen – auch die, die unten zu schnell verschwunden sind. Die Zahl zeigt neue wichtige Meldungen.',
        '<b>Direkt handeln:</b> Aus einer Meldung springst du hin – ein Sonderangebot öffnet gleich den Kaufdialog, ein Auftragsangebot den Annehmen-Dialog.',
      ]),
    ].join(''),
  },
  {
    id: 'sectors', title: 'Sektorinfo und Eigenheiten', icon: 'sector', short: 'Was jeden Sektor besonders macht',
    body: [
      p('Das ⓘ oben in der Leiste öffnet die <b>Sektorinfo</b> mit drei Reitern: <b>Allgemein</b> (Beschreibung, Eigenheit, Baulizenz, Aufgaben), <b>Wirtschaft</b> (Felder, Schürfrechte, Markt, Marktdaten) und <b>Erkundung</b> (Späher, Tore, Forschungsakte).'),
      ul([
        '<b>Familie Zhin:</b> Wiederaufbau – die Zhin-Werft zahlt 12 % mehr für Hüllenteile und Claytronik.',
        '<b>Familie Tkr:</b> Stapellauf alle 4 h – eine Stunde lang zahlt die Werft 30 % mehr für ihre Bauteile.',
        '<b>Tharka\'s Cascade:</b> Gasgezeiten – die Gasfelder geben im Drei-Stunden-Takt 70 bis 150 % her.',
        '<b>Tharka\'s Ravine:</b> Xenon-Streife alle 5 h für 25 min – Miner ruhen, Schiffe fliegen mit 60 %.',
        '<b>Rhy\'s Defiance:</b> Patrouillenkorridor – Schiffe fliegen mit 120 %.',
        '<b>Heart of Acrimony:</b> Kometenschweif – Eis und Methan wachsen doppelt so schnell nach.',
        '<b>Zyarth\'s Dominion:</b> Thronmarkt – Schiffstechnik bringt 10 % mehr.',
        '<b>Glutsee I:</b> 1000 % Sonne, im Strahlungssturm alle 3 h 3000 %. Ohne Kühlmantel und Kühlmittel überhitzen Stationen. Nur hier laufen Sonnenöfen.',
        '<b>Die Aschefelder:</b> Staub – Miner fördern 30 % mehr, Schiffe fliegen mit 80 %.',
        '<b>Der Schmiedestern:</b> Pulsar – das Licht schwankt im Zwei-Stunden-Takt zwischen 60 und 300 %.',
      ]),
    ].join(''),
  },
  {
    id: 'incidents', title: 'Vorfälle und Aufgaben', icon: 'game', short: 'Minispiele, die im Spiel etwas bewirken',
    body: [
      p('<b>Vorfälle</b> entstehen etwa einmal je Spielstunde, ab Kapitel 5. Eine Leiste über dem Kapitelziel zeigt sie mit „Selbst übernehmen“. Wer nicht spielt, bekommt nach Ablauf der Frist ein mittleres Ergebnis – selbst spielen ist nie Pflicht.'),
      ul([
        '<b>Überfall</b> auf einen beladenen Frachter (Kampf): ohne dich 15 % der Ladung weg, selbst verteidigt nichts, mit drei Sternen dazu 3.000 Cr Kopfgeld.',
        '<b>Störung</b> in einem Produktionsmodul (Rohr-Puzzle): halbe Leistung, bis sie behoben ist; ohne dich nach 90 min mit 20 Hüllenteilen.',
        '<b>Reiche Ader</b> bei einem Miner (Erz- oder Gasabbau): Bonusware ins Lager, selbst abgebaut bis zu einem vollen Laderaum.',
        '<b>Gasschwade</b> bei Flut in Tharka\'s Cascade (Gassammeln): wie die Ader, für Gassammler.',
        '<b>Sonderfracht</b> bei einem Lieferauftrag (Frachtraum): gut gepackt bis 30 % Aufschlag auf den Lohn, ohne dich der normale Lohn.',
        '<b>Eilzuschlag</b> für einen Frachter auf langer Strecke (Superhighway): schnell geflogen bis 15 % des Ladungswerts extra.',
        '<b>Andocken im Sturm</b> von Glutsee I (Orbit-Andocken): ohne dich werden 10 % der Ladung beschädigt, sauber angedockt nichts.',
      ]),
      p('<b>Aufgaben an Stationen</b> stehen in der Sektorinfo unter „Allgemein“ und in der Karte der Station, je Sektor zwei, alle 3 h neu. Lohn ab einem Stern: Credits, Modteile und Ruf – Ruf nur bis Stufe 3 und höchstens 0,5 je Fraktion und Spieltag.'),
    ].join(''),
  },
];

export const HELP_MAP: Record<string, HelpTopic> = Object.fromEntries(HELP.map((h) => [h.id, h]));

/** Kleiner „?“-Knopf, der das passende Hilfethema öffnet */
export function helpBtn(topic: string): string {
  const t = HELP_MAP[topic];
  return t ? `<button class="help-q" ${act('help', { topic })} aria-label="Hilfe: ${esc(t.title)}" title="Hilfe: ${esc(t.title)}">?</button>` : '';
}

/** Liste aller Themen (Menü und Hilfe-Dialog) */
export function helpList(): string {
  return `<div class="box rows">${HELP.map((h) => `<div class="row tap" ${act('help', { topic: h.id })} data-key="help-${h.id}">${icon(h.icon, 20)}<div class="grow"><div class="title" style="font-weight:500">${esc(h.title)}</div><div class="sub wrap">${esc(h.short)}</div></div>${icon('chev', 20, 'chev')}</div>`).join('')}</div>`;
}

/** Inhalt des Hilfe-Dialogs: ein Thema oder die Übersicht */
export function helpModalParts(topic?: string): { title: string; body: string; foot: string } {
  const t = topic ? HELP_MAP[topic] : undefined;
  if (!t) return { title: 'Hilfe', body: helpList(), foot: `<button class="btn primary" ${act('modal-close')}>Fertig</button>` };
  return {
    title: t.title,
    body: `<div class="help-body">${t.body}</div>`,
    foot: `<button class="btn" ${act('help', { topic: '' })}>Alle Themen</button><button class="btn primary" ${act('modal-close')}>Verstanden</button>`,
  };
}
