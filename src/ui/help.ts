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
      p('Oben rechts steuerst du die Zeit: Pause oder bis ×60. Dein Imperium läuft auch weiter, wenn die App geschlossen ist (bis zu 8 Stunden).'),
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
        '<b>Ruf:</b> Je Bauplan ist ein Mindestruf bei der Gastgeberfraktion nötig. Ruf gibt es für Kapitel, Lieferaufträge und Schiffsbestellungen.',
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
    id: 'market', title: 'Märkte und Preise', icon: 'market', short: 'Wie Angebot und Nachfrage die Preise bewegen',
    body: [
      p('Jeder Handelsposten hat für jede Ware einen Bestand. Wenig Bestand heißt hoher Preis, viel Bestand niedriger – innerhalb der echten X4-Preisspanne. Bestände kehren über einige Stunden zum Normalwert zurück.'),
      p('Spezialisierte NPC-Stationen (Werften, Wachstationen, Fabriken) kaufen bestimmte Waren in begrenzter Menge. Im Verkaufsdialog einer Ware siehst du alle Käufer mit Preis, Abnahme und Ertrag pro Stunde.'),
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
