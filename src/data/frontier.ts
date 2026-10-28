// Der unbekannte Raum über dem Split-Gebiet: vier Gebiete, 19 Sektoren, die erst entdeckt werden müssen.
// Bis ihre Inhalte gebaut sind, stehen sie nur auf der Sektorenkarte (getrennt von der Wirtschaft in sectors.ts).
// Kartenkoordinaten (q, r) gelten nur für die Sektorenkarte – nach oben (negatives y) liegt der neue Raum.

export type RegionId = 'glut' | 'band' | 'kristall' | 'abgrund';

export const REGIONS: Record<RegionId, { name: string; mood: string; tint: string }> = {
  glut: { name: 'Die Glutsee', mood: "Junge Sterne in rotem Wasserstoffnebel. Viel Sonne, viel Erz, viel Strahlung. Früher kam hier jeder durch, der nach oben wollte.", tint: '230,120,80' },
  band: { name: 'Das Schweigende Band', mood: "Ein Gürtel aus Magnetfeldern und Ionenstürmen. Hier lebte die Kolonie Vesh'ara, bis sie vor 34 Jahren geschlossen aufbrach.", tint: '110,200,170' },
  kristall: { name: 'Die Kristallgrenze', mood: "Kristallfelder, die Scanner täuschen und Rümpfe zerschneiden. Hier endet die Spur der Vesh'ara. Und hier beginnt die der Kha'ak.", tint: '140,170,240' },
  abgrund: { name: 'Der Abgrund', mood: "Ein Schwarzes Loch, eine Werft ohne Erbauer und ein Tor, das kein bekanntes Volk gebaut hat.", tint: '170,120,220' },
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
  /** Fundstück der Erstsichtung: ein Logbucheintrag, Funkspruch oder eine Notiz (Forschungsakte) */
  log: string;
}

export const FRONTIER: FrontierDef[] = [
  // Gebiet 1: Die Glutsee
  { id: 'f-ausblick', name: "Rhy's Ausblick", region: 'glut', q: -1, r: -1, links: ['rhy', 'f-glut1'], description: 'Horchposten der Familie Rhy: zwei Wohnmodule und eine 600 m lange Antenne. Seit 31 Jahren unbesetzt – die Heizung läuft noch.',
    log: 'Letzter Eintrag, Wache Orrik: „Tor flackert seit heute früh. Versorger aus Rhy überfällig. Wir halten Kanal 9 offen.“' },
  { id: 'f-glut1', name: 'Glutsee I', region: 'glut', q: -2, r: -1, links: ['f-ausblick', 'f-asche', 'f-schmiede'], description: 'Roter Wasserstoffnebel um einen jungen Stern. Solarmodule liefern hier fast das Doppelte, die Strahlungsstürme kosten Schiffe aber Tempo.',
    log: 'Eine Bake der Vesh\'ara, noch aktiv: „Treck 4 von 9 durch. Kurs Polarlicht. Wer folgt: Kühlmittel bunkern.“' },
  { id: 'f-asche', name: 'Die Aschefelder', region: 'glut', q: -1, r: -2, links: ['f-glut1', 'f-rhak'], description: 'Staub eines zerbrochenen Mondes, so dicht, dass Scanner nach 20 km nichts mehr sehen. Darin treiben Erzbrocken von der Größe einer Station.',
    log: 'Schürfmarke der Familie Rhak, Nummer 0041, vor 30 Jahren gesetzt. Weit und breit kein Schiff.' },
  { id: 'f-rhak', name: 'Familie Rhak', region: 'glut', q: 0, r: -2, links: ['f-asche', 'ravine', 'f-bandtor'], description: 'Die Familie Rhak wurde vor 40 Jahren aus dem Rat der Familien verstoßen. Als die Tore erloschen, war sie auf sich gestellt – und ist es gern geblieben.',
    log: 'Funkspruch der Rhak-Zentrale: „Zhin? Ihr habt euch Zeit gelassen. Unsere Preise gelten trotzdem.“' },
  { id: 'f-schmiede', name: 'Der Schmiedestern', region: 'glut', q: -3, r: -1, links: ['f-glut1'], description: 'Ein Pulsar, dessen Strahl alle 1,3 Sekunden über den Sektor streicht. Wer seine Kollektoren im Takt ausrichtet, bekommt Energie fast umsonst.',
    log: 'Ein ausgebrannter Kollektorring der Vesh\'ara. In den Halterungen stecken leere Kernhülsen – hier haben sie Sonnenlicht verdichtet, bevor sie weiterzogen.' },
  // Gebiet 2: Das Schweigende Band
  { id: 'f-bandtor', name: 'Bandtor', region: 'band', q: 0, r: -3, links: ['f-rhak', 'f-polar'], description: 'Das Tor fängt sich alle paar Stunden für einige Minuten, dann fällt es wieder aus. Die Rhak nennen es den Atem.',
    log: 'Am Torring kleben Markierungen in Vesh\'ara-Schrift: Strichlisten, Hunderte. Hier hat jemand lange gewartet.' },
  { id: 'f-polar', name: 'Polarlicht-Weite', region: 'band', q: 0, r: -4, links: ['f-bandtor', 'f-ionen', 'f-veshara'], description: 'Ein starkes Magnetfeld treibt Polarlicht durch den ganzen Sektor. Schön anzusehen, schlecht für Funk: Reichweite unter 30 km.',
    log: 'Eine Bake, halb vereist: „Treck 7 vermisst. Wir warten nicht länger.“' },
  { id: 'f-ionen', name: 'Ionenschleier', region: 'band', q: 1, r: -4, links: ['f-polar', 'tkr'], description: 'In Abständen ziehen Ionenstürme durch, dann fallen Schilde und Scanner aus. Dazwischen sammelt sich ungewöhnlich reines Gas.',
    log: 'Wrack der „Kesh“, ein Tkr-Erkunder, vor 33 Jahren als vermisst gemeldet. Flugschreiber: Sturm, Schildausfall, Kollision.' },
  { id: 'f-veshara', name: "Kolonie Vesh'ara", region: 'band', q: -1, r: -4, links: ['f-polar', 'f-echo'], description: 'Sechs Stationen, ein Habitatring für 4.000 Bewohner. Alles verlassen, alles sauber verschlossen. Die Kolonie ist nicht geflohen – sie ist ausgezogen.',
    log: 'Aushang im Habitatring: „Abflug in drei Gruppen. Nehmt nur, was ihr tragen könnt. Wir folgen dem Echo.“' },
  { id: 'f-echo', name: 'Das Echo', region: 'band', q: -1, r: -5, links: ['f-veshara', 'f-glas'], description: 'Ein Notsignal, alle 40 Sekunden, seit Jahrzehnten. Es entsteht nicht hier, sondern wird von Relaisbojen weitergereicht – nach oben.',
    log: 'Eine Relaisboje der Vesh\'ara. Sie sendet nichts Eigenes. Sie wiederholt nur, was von weiter oben kommt.' },
  // Gebiet 3: Die Kristallgrenze
  { id: 'f-glas', name: 'Glasfeld', region: 'kristall', q: 0, r: -6, links: ['f-echo', 'f-nividium', 'f-splitter'], description: 'Kristallbrocken, manche größer als ein Zerstörer. Scanner zeigen hier Doppelbilder, navigiert wird auf Sicht.',
    log: 'Ein Frachter der Vesh\'ara, in zwei Hälften geschnitten. Die Schnittkante ist glatt wie Glas.' },
  { id: 'f-nividium', name: 'Nividium-Ader', region: 'kristall', q: 1, r: -6, links: ['f-glas'], description: 'Eine Nividiumader, offen wie ein Steinbruch. Wer so etwas findet, behält es nicht lange für sich.',
    log: 'Frische Abbauspuren. Keine Split-Werkzeuge, keine der Vesh\'ara. Jemand war vor kurzem hier.' },
  { id: 'f-splitter', name: 'Splitterzone', region: 'kristall', q: 1, r: -7, links: ['f-glas', 'f-summen'], description: 'Kristalle zerspringen hier unter Spannung und treiben als Schwärme mit 200 m/s durch den Sektor. Frachter fliegen nur mit Begleitschutz.',
    log: 'Eine Navigationsboje, glatt durchschlagen. Ihre letzte Aufzeichnung bricht mitten im Satz ab.' },
  { id: 'f-summen', name: 'Das Summen', region: 'kristall', q: 0, r: -7, links: ['f-splitter', 'f-ende'], description: 'Violette Lichtpunkte in Formation, still, dicht an den Kristallen: Kha\'ak-Kundschafter. Sie greifen nicht an. Noch nicht.',
    log: 'Auf allen Kanälen ein tiefes Summen. Die Antenne des Spähers schwingt mit.' },
  { id: 'f-ende', name: "Vesh'aras Ende", region: 'kristall', q: -1, r: -6, links: ['f-summen', 'f-horizont'], description: 'Das Kolonieschiff der Vesh\'ara, 4 km lang, eingewachsen in Kristall. Auf der Brücke brennt Licht.',
    log: 'Letzter Logbucheintrag: „Das Signal kommt nicht von hier, sondern von hinter dem Ring. Wir kommen nicht weiter. Das Tor dort ist nicht tot. Es wartet.“' },
  // Gebiet 4: Der Abgrund
  { id: 'f-horizont', name: 'Ereignishorizont', region: 'abgrund', q: -2, r: -6, links: ['f-ende', 'f-riff', 'f-werft'], description: 'Ein Schwarzes Loch mit glühender Scheibe. Das Licht der Sterne dahinter wird zu einem Ring gebogen; Navigationsrechner brauchen hier Korrekturen.',
    log: 'Die Sterne stehen nicht dort, wo sie laut Karte stehen sollten. Abweichung: 0,4 Grad.' },
  { id: 'f-riff', name: 'Zeitriff', region: 'abgrund', q: -2, r: -5, links: ['f-horizont'], description: 'So nah am Schwarzen Loch vergeht die Zeit langsamer. Für den Späher sind es Minuten, draußen Stunden.',
    log: 'Nach der Rückkehr geht die Bordzeit des Spähers drei Stunden nach.' },
  { id: 'f-werft', name: 'Die Stille Werft', region: 'abgrund', q: -2, r: -7, links: ['f-horizont', 'f-tor'], description: 'Eine Werft, die weder Split noch Xenon gebaut haben. Ihre Docks sind für Schiffe ohne Cockpit ausgelegt.',
    log: 'In den Docks liegen Rümpfe, halb fertig. Die Bauroboter stehen still, mitten in der Bewegung.' },
  { id: 'f-tor', name: 'Das Stille Tor', region: 'abgrund', q: -2, r: -8, links: ['f-werft'], description: 'Ein Sprungtor, dreimal so groß wie jedes bekannte. Von hier kommt das Signal, das seit 31 Jahren durch das Band wandert.',
    log: 'Das Tor antwortet auf den Späher: zwei kurze Impulse, ein langer.' },
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
