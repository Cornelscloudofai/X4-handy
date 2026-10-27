// Der unbekannte Raum über dem Split-Gebiet: vier Gebiete, 19 Sektoren, die erst entdeckt werden müssen.
// Bis ihre Inhalte gebaut sind, stehen sie nur auf der Sektorenkarte (getrennt von der Wirtschaft in sectors.ts).
// Kartenkoordinaten (q, r) gelten nur für die Sektorenkarte – nach oben (negatives y) liegt der neue Raum.

export type RegionId = 'glut' | 'band' | 'kristall' | 'abgrund';

export const REGIONS: Record<RegionId, { name: string; mood: string; tint: string }> = {
  glut: { name: 'Die Glutsee', mood: 'Warme, rote Nebel und Sonnenstürme – Pioniergebiet voller Erz und Energie.', tint: '230,120,80' },
  band: { name: 'Das Schweigende Band', mood: 'Polarlicht und Ionenstürme – hier verschwand einst eine ganze Kolonie.', tint: '110,200,170' },
  kristall: { name: 'Die Kristallgrenze', mood: 'Funkelnde Kristallfelder, seltene Rohstoffe – und erste Spuren der Kha’ak.', tint: '140,170,240' },
  abgrund: { name: 'Der Abgrund', mood: 'Ein Schwarzes Loch, verbogenes Licht und ein uraltes, erloschenes Tor.', tint: '170,120,220' },
};

export interface FrontierDef {
  id: string;
  name: string;
  region: RegionId;
  q: number;
  r: number;
  /** Torverbindungen (zu anderen neuen Sektoren oder in den Split-Raum) */
  links: string[];
  description: string;
}

export const FRONTIER: FrontierDef[] = [
  // Gebiet 1: Die Glutsee
  { id: 'f-ausblick', name: "Rhy's Ausblick", region: 'glut', q: -1, r: -1, links: ['rhy', 'f-glut1'], description: 'Der erste Vorposten hinter Rhy’s Defiance – eine einsame Wachstation am Rand des Bekannten.' },
  { id: 'f-glut1', name: 'Glutsee I', region: 'glut', q: -2, r: -1, links: ['f-ausblick', 'f-asche', 'f-schmiede'], description: 'Roter Nebel und Sonnenstürme: Solarkraft im Überfluss, im Sturm aber langsame Schiffe.' },
  { id: 'f-asche', name: 'Die Aschefelder', region: 'glut', q: -1, r: -2, links: ['f-glut1', 'f-rhak'], description: 'Reiche Erzfelder in dichtem Staub – viel Ertrag, wenig Sicht.' },
  { id: 'f-rhak', name: 'Familie Rhak', region: 'glut', q: 0, r: -2, links: ['f-asche', 'ravine', 'f-bandtor'], description: 'Eine verstoßene Split-Familie mit eigenen Preisen, eigenen Aufträgen und eigenem Ruf.' },
  { id: 'f-schmiede', name: 'Der Schmiedestern', region: 'glut', q: -3, r: -1, links: ['f-glut1'], description: 'Ein Pulsar, dessen Strahl wie ein Herzschlag über den Sektor streicht. Energie ist hier billig.' },
  // Gebiet 2: Das Schweigende Band
  { id: 'f-bandtor', name: 'Bandtor', region: 'band', q: 0, r: -3, links: ['f-rhak', 'f-polar'], description: 'Ein halb erloschenes Sprungtor, das in Abständen aufflackert – durch kommt man nur, wenn es offen ist.' },
  { id: 'f-polar', name: 'Polarlicht-Weite', region: 'band', q: 0, r: -4, links: ['f-bandtor', 'f-ionen', 'f-veshara'], description: 'Grüne und violette Lichtvorhänge ziehen in Wellen durch den Raum.' },
  { id: 'f-ionen', name: 'Ionenschleier', region: 'band', q: 1, r: -4, links: ['f-polar', 'tkr'], description: 'Zeitweise Ionenstürme: Schilde und Scanner fallen aus, dafür ist Gas besonders ergiebig.' },
  { id: 'f-veshara', name: "Kolonie Vesh'ara", region: 'band', q: -1, r: -4, links: ['f-polar', 'f-echo'], description: 'Verlassene Stationen und Logbücher einer verschwundenen Kolonie.' },
  { id: 'f-echo', name: 'Das Echo', region: 'band', q: -1, r: -5, links: ['f-veshara', 'f-glas'], description: 'Ein uraltes Notsignal, immer wieder – es zeigt nach oben.' },
  // Gebiet 3: Die Kristallgrenze
  { id: 'f-glas', name: 'Glasfeld', region: 'kristall', q: 0, r: -6, links: ['f-echo', 'f-nividium', 'f-splitter'], description: 'Riesige Kristallbrocken, die im Licht funkeln.' },
  { id: 'f-nividium', name: 'Nividium-Ader', region: 'kristall', q: 1, r: -6, links: ['f-glas'], description: 'Ein seltenes, sehr reiches Nividiumfeld – wertvoll und umkämpft.' },
  { id: 'f-splitter', name: 'Splitterzone', region: 'kristall', q: 1, r: -7, links: ['f-glas', 'f-summen'], description: 'Kristalle zerbrechen von selbst und treiben als Schwärme durch den Sektor.' },
  { id: 'f-summen', name: 'Das Summen', region: 'kristall', q: 0, r: -7, links: ['f-splitter', 'f-ende'], description: 'Violette Lichtpunkte – Kha’ak-Kundschafter. Ruhig, aber man fühlt sich beobachtet.' },
  { id: 'f-ende', name: "Vesh'aras Ende", region: 'kristall', q: -1, r: -6, links: ['f-summen', 'f-horizont'], description: 'Das Kolonieschiff, eingewachsen in Kristall. Hier endet ihre Geschichte.' },
  // Gebiet 4: Der Abgrund
  { id: 'f-horizont', name: 'Ereignishorizont', region: 'abgrund', q: -2, r: -6, links: ['f-ende', 'f-riff', 'f-werft'], description: 'Ein Schwarzes Loch biegt Licht und Sterne zu einem Ring.' },
  { id: 'f-riff', name: 'Zeitriff', region: 'abgrund', q: -2, r: -5, links: ['f-horizont'], description: 'Hier läuft die Zeit anders: alles schneller, aber Stationen verschleißen rascher.' },
  { id: 'f-werft', name: 'Die Stille Werft', region: 'abgrund', q: -2, r: -7, links: ['f-horizont', 'f-tor'], description: 'Eine uralte, fremde Werft, halb im Riff versunken.' },
  { id: 'f-tor', name: 'Das Stille Tor', region: 'abgrund', q: -2, r: -8, links: ['f-werft'], description: 'Ein riesiges, erloschenes Sprungtor. Wohin es führt, weiß niemand.' },
];

export const FRONTIER_MAP: Record<string, FrontierDef> = Object.fromEntries(FRONTIER.map((f) => [f.id, f]));

/** Lage der bekannten Split-Sektoren auf der Sektorenkarte: wie im Spiel (alle Tore zwischen direkten Nachbarn) */
export const SPLIT_MAP_POS: Record<string, { q: number; r: number }> = {
  zhin: { q: 0, r: 0 },
  tkr: { q: 1, r: -1 },
  cascade: { q: 1, r: 0 },
  ravine: { q: 0, r: -1 },
  rhy: { q: -1, r: 0 },
  hoa: { q: 0, r: 1 },
  zyarth: { q: -1, r: 1 },
};
