# X4 Sektorbau

Ein Wirtschafts- und Aufbauspiel für das Handy im Universum von **X4: Foundations**.
Kein Raumschiff-Steuern, sondern das, was X4 im Kern ausmacht: Stationen bauen,
Produktionsketten planen, Versorgungslinien ziehen, handeln und in neue Sektoren expandieren.

Du startest in **Familie Zhin** kurz nach dem Xenon-Angriff – mit einer kleinen Station,
einem Solarkraftwerk und einem Miner.

## Spielen

- **Online:** nach dem ersten Push auf `main` baut GitHub Actions das Spiel und veröffentlicht es
  auf GitHub Pages (einmalig in den Repo-Einstellungen unter *Pages → Source* „GitHub Actions“ wählen).
- **Offline:** `npm run build` erzeugt eine einzige Datei `dist/index.html`. Die lässt sich direkt
  im Browser öffnen oder aufs Handy kopieren.
- **Entwickeln:** `npm install`, dann `npm run dev` – die angezeigte Netzwerkadresse funktioniert
  auch auf dem Handy im selben WLAN.

Tipp fürs Handy: Seite öffnen → Browsermenü → „Zum Startbildschirm hinzufügen“.

## Was drin ist

| Bereich | Umsetzung |
| --- | --- |
| Verkaufsentscheidung | Pro Ware im Stationslager: alle Käufer in bekannten Sektoren (Handelsposten, spezialisierte Werften/Wachstationen/Fabriken mit begrenzter Abnahme, Aufträge) mit Preis, tatsächlicher Abnahme, Entfernung, Flugzeit, Transportzyklus und Ertrag pro Stunde – passend zu Menge und gewähltem Schiff; sortierbar nach Preis, Ertrag/h oder Umschlag, mit Engpass-Hinweis; Auftrag direkt an einen Transporter oder als feste Route |
| Baureihenfolge | Jede Position einzeln, Ziehen am Griff (auch per Touch), Pfeile, Einfügen zwischen Positionen, laufender Bau fest; bezahlt wird erst beim Baustart |
| Stationsplaner | Endprodukte wählen → komplette Modulkette mit exakten Mengen pro Stunde, Rundung auf ganze Module, Überschuss/Fehlbedarf, Zukauf statt Eigenproduktion, Sonnenlicht, Belegschaftsbonus, Baukosten, Vollbild-Fließdiagramm (Zoomen, Verschieben, Kästchen anordnen, ± am Modul, Empfehlungen bei Unterversorgung; Ware antippen hebt die direkten Vor- und Folgeprodukte hervor, nochmal antippen die ganze Kette bis zum Rohstoff) für Entwürfe oder echte Stationen – dort wirkt jede Änderung direkt auf die Baureihenfolge |
| Produktion | 58 Waren mit echten X4-Rezepten (Zykluszeit, Ein- und Ausgangsmengen), Solarleistung abhängig vom Sonnenlicht des Sektors |
| Stationsbau | Jede Station hat ab der Gründung ein Baulager (50.000 Cr, vor dem Stationskern, ohne Material). Schiffe liefern das Baumaterial dorthin – auch ohne Dock: NPC-Händler (bezahlt bei Lieferung), eigene Transporter (Markteinkauf oder Überschüsse eigener Stationen per Lieferreihenfolge), dazu manuelles Umladen zwischen Stationslager und Baulager in beide Richtungen (Schieberegler, keine Automatik). Die Modulansicht zeigt je Ware „x von y vorhanden“ für die ganze Bauliste plus was unterwegs ist. Gebaut wird anteilig: Material wird mit dem Baufortschritt verbaut, fehlt etwas, läuft der Bau mit dem Wertanteil des vorhandenen Materials weiter und bleibt sonst beim erreichten Prozentwert stehen. Auch der Stationskern entsteht so. Zukauf über NPC-Händler/Markt je Station abschaltbar (dann nur eigene Ware); Abbruch legt das verbaute Material zurück ins Baulager; Lager S/M/L für Container, Feststoff und Flüssig mit echten Split-Werten (S 25.000/100.000/100.000 m³, M 100.000/500.000/500.000 m³, L je 1.000.000 m³). Start mit S, Baupläne für M (900 Tsd Cr, Ruf 2) und L (3,5 Mio Cr, Ruf 6) beim Handelsvertreter; Dock, Pier; Lageranteil und Reserve je Ware einstellbar |
| Eigene Werft | S/M-, L- und XL-Schiffsfertigung mit echten Baumaterialien und aufsteigenden Bauplanpreisen (120 / 240 / 400 Mio Cr, Ruf 10 / 15 / 20; XL-Schiffe folgen später); Schiffsmaterial wie im Original aus Rumpf und Ausrüstung (Hüllenteile, Antriebsteile, Schild-, Geschütz- und Drohnenkomponenten, Antimaterie-Konverter, Smartchips, Hochleistungsverbundstoffe u. a.); Schiffe aus dem Stationslager bauen (Material aus Rumpf + Ausrüstung), Material wird ständig auf Vorrat gehalten (nicht erst bei Bestellung), Transporter und NPC-Händler liefern laufend nach; Schiffsbestellungen der Fraktionen bringen Credits und Ruf |
| Schiffe | Split-Schiffe mit echten Daten: Preis = Rumpf + Grundausstattung (Triebwerke, Schilde, Abbautürme), Reisegeschwindigkeit aus Schub und Luftwiderstand, Frachtraum; Miner (Mineral/Gas, M/L), Kurier, Transporter, Großfrachter |
| Logistik | Miner fördern, was im Lager am knappsten ist (Rohstoffe für wartende Module zuerst) und teilen sich so von selbst auf; Restladung, die nicht mehr ins Lager passt: Automatik vergleicht Nachfüllen (Rest bleibt an Bord, nur freier Laderaum wird abgebaut), Warten und Verkaufen (Umweg + spätere Neuförderung) und zeigt die Fallbetrachtung im Schiffsblatt; je Miner fest einstellbar; Überförderung wird als Hinweis gemeldet; keine Umkehr unterwegs, höchstens zwei Käufer je Ladung; Transporter im Autohandel (Heimatstation ist immer einer der beiden Handelspartner; je Station eine Lieferreihenfolge für Überschüsse – Prio 1, 2, … eigene Stationen, zuletzt Verkauf zum besten Preis; nimmt eine Station weniger als eine halbe Ladung ab, geht es eine Stufe tiefer; optional kaufen NPC-Händler eine Ware erst, wenn die Stationen der Reihenfolge davon versorgt sind) oder als feste Versorgungslinie; Flüge über Sprungtore |
| Märkte | Preise folgen dem Bestand wie in X4 (Min–Max-Spanne), NPC-Händler besuchen deine Stationen, Nachfrageschwankungen |
| Baupläne | Nur vor Ort beim Vertreter: Split-Baupläne bei den Handelsvertretern aller Handelsposten, waffennahe Baupläne (Geschütz-, Raketen-, Drohnen-, Schild-, Waffenkomponenten, Feldspulen) und Schiffsfertigung bei den Werftvertretern der NPC-Werften, fremde Bauweisen bei Gesandtschaften (Argonen in Zhin, Boronen in Tkr, Teladi in Tharka's Cascade, Terraner in Tharka's Ravine, Paraniden in Heart of Acrimony); Ruf der Gastgeberfraktion zählt, Sektor muss erreichbar sein. Übersicht mit Suche und „Hinfliegen“; im freien Planer sind alle Baupläne nutzbar, die Übernahme in eine Station wird aber mit Liste der fehlenden Baupläne blockiert |
| Lieferaufträge | Nach der Station wählen, wer liefert: Kurier sofort gegen 10 % Gebühr oder eigener Transporter ohne Gebühr, mit Fahrten, Dauer und Ersparnis; Lager-Reserve direkt anpassbar |
| Fortschritt | Kampagne mit 28 Kapiteln von der ersten Raffinerie über Siliziumscheiben, Antimaterie, Kühlmittel, Quantenröhren, Claytronik, Schild- und Geschützkomponenten bis zur S/M- und L-Werft und Schiffsbestellungen, jedes mit Erklärung, wofür die Ware gebraucht wird (alte Spielstände werden auf die neue Kapitelfolge umgestellt); Lieferaufträge, Ruf bei Freien Familien und Zyarth-Patriarchat, Baupläne, Baulizenzen für 7 Sektoren |
| Einstieg und Hilfe | Geführte erste Schritte: pulsierender Rahmen und Sprechblase zeigen, was als Nächstes anzutippen ist (Fabrik einplanen, Baulager und Umladen, Zeit beschleunigen, Belohnung abholen, Miner und Transporter kaufen) – abgeleitet aus dem Spielstand, überspringbar und im Menü neu startbar. Acht Hilfe-Themen im Menü und als „?“ an Baulager, Lager, Lieferreihenfolge, Restladung, Bauplänen und Werft |
| Kartengrafik | Neon-Stil, alles prozedural gezeichnet: Symbole wachsen mit dem Zoom (Gesamtansicht ruhig, Feld- und NPC-Namen erst beim Heranzoomen). Stationen aus ihren Modulen mit eigener Form je Modulart (Fabrik mit Leuchtband, Solarflügel mit Glanz, Container mit Füllstand, Silos und Kugeltanks, Dock, Pier, Werftportal); das Modul im Bau entsteht als Drahtgitter, das sich mit dem Baufortschritt füllt, geplante Module als Schatten. Schiffsumrisse je Klasse mit Triebwerksglühen, Abbaulaser mit Splittern, Gas-Sog. Gasnebel als driftender Schleier, Gesteinsfelder aus vielen kleinen Brocken. Funkenregen bei fertigem Modul und neuem Schiff, Schweißfunken an Baustellen. Schalter „Animationen: Voll/Reduziert“ (folgt sonst der Systemeinstellung) |
| Listen | Module, Baupläne und Produkte immer alphabetisch, mit Suche (auch nach Zutaten, Umlaute egal) |
| Komfort | Zeitraffer ×1 bis ×60, Offline-Fortschritt (bis 8 h), automatisches Speichern, Spielstand als Text oder Datei sichern und laden, Rückgängig für Bauliste und Planer, Android-Zurück-Taste schließt Dialoge und Blätter |

## Offene Punkte

- **Belegschaft:** Habitatmodule mit Verbrauch von Nahrung und Medizin, damit der Belegschaftsbonus im Planer und in der Simulation vollständig durchgerechnet wird.
- **Erfahrung und Stufen für Schiffe und Stationen (Idee, noch nicht umgesetzt – erst nach dem Test der aktuellen Version):**
  Miner und Stationen sammeln durch ihre Arbeit Erfahrungspunkte (Fahrten, geförderte/verarbeitete Mengen, Verkäufe) und steigen
  im Level auf. Stufen schalten Optimierungen frei – „die Karotte vor der Nase“, mehr Spielfluss und Spieltiefe.
  Beispiel Miner: Standard ist *Nachfüllen* (fliegt mit Restladung wieder los); *Verkaufen*, *Warten* und die *Automatik*
  mit Fallbetrachtung werden erst mit höheren Stufen freigeschaltet. Analog denkbar für Stationen (z. B. Lagersteuerung,
  Reserve, Handelsregeln) und Transporter. Offen: XP-Quellen und Kurve, was genau je Stufe kommt, Anzeige (Stufe/Fortschritt
  im Schiffs- und Stationsblatt), Umgang mit bestehenden Spielständen.
- **Ereignisse mit freiwilligen Minispielen (Idee, noch nicht umgesetzt):**
  Sporadische Ereignisse in den Spielbereichen; der Spieler wird gefragt, ob er ein kurzes Minispiel spielen möchte.
  Ablehnen = kleiner, vorübergehender Malus (z. B. 30 min x % weniger Produktion), Spielen und Lösen = kein Malus und per Zufall
  eine Belohnung (z. B. dauerhafte kleine Effizienzsteigerung oder besondere Gegenstände). So reizvoll, aber nie Pflicht.
  - *Piraten- / Xenon-Überfall:* Draufsicht-Shooter, eigenes Schiff per virtuellem Joystick in alle Richtungen steuern, Feinde
    abschießen. Ausrüstung (Waffen, Schilde, Triebwerke) verbesserbar – passt zur eigenen Werft und zu waffennahen Bauplänen/Waren.
  - *Fabrik-Störung:* z. B. verstopfte Rohrleitung als Rohr-Puzzle (Leitungsstücke drehen/anordnen).
  - *Bergbau:* eigenes Minispiel (z. B. reiche Ader treffen, Asteroid zerlegen).
  Gedanken dazu: Häufigkeit begrenzen (Abklingzeit, höchstens ein offenes Ereignis), Ereignisse während Offline-Zeit/Zeitraffer
  automatisch mit Malus abwickeln oder kurz aufheben; Malus klein und sichtbar (Countdown am Modul), Belohnungen eher selten und
  spürbar; Schwierigkeit mit Fortschritt steigern; kurze Runden (30–90 s), Touch-tauglich, jederzeit abbrechbar (= Malus).
  Verknüpfbar mit der Stufen-Idee oben (Erfahrungspunkte aus Minispielen) und mit Kampfschiffen/Gefahren.
  - *Häufigkeit steuern – Stationsmanager:* Jede Station hat einen Manager mit Stufe und Eigenschaften (z. B. Sorgfalt, Technik,
    Sicherheit). Niedrige Stufe = mehr Störungen; Eigenschaften wirken gezielt (Technik → weniger Rohrbrüche, Sicherheit → weniger
    Überfälle auf die Station). Manager sammeln Erfahrung (Stufen-Idee), lassen sich ggf. anwerben/austauschen.
  - *Häufigkeit steuern – Schutz durch Kampfschiffe:* Begleitschutz für Frachter senkt Überfälle auf Handelsrouten, Patrouillen
    in einem Sektor senken Piraten-/Xenon-Ereignisse dort. Weitere mögliche Effekte: Patrouillen erhöhen Ruf oder Marktsicherheit,
    ungeschützte Routen riskieren Frachtverlust, Geleitschutz kostet Unterhalt (Zielkonflikt Sicherheit vs. Kosten).
    Die Kampfschiffe kommen aus der eigenen Werft und brauchen waffennahe Waren – verbindet Wirtschaft, Werft und Gefahren.
- **Kampfschiffe und Gefahren:** Piraten und Xenon an den Toren, Geleitschutz und Verteidigungsplattformen – die eigene Werft ist die Grundlage dafür.
- **Geld verbrauchen:** Spätestens nach der L-Werft wächst das Vermögen schnell (simulierter Spieler: ~500 Mio Cr nach ~100 h). Kampfschiffe, Kriege und Unterhalt sollen als Gegengewicht kommen.

## Gesicherte Stände

- Commit `39644ed` – Stand mit Stationsplaner und Fließdiagramm, vor Verkaufsentscheidung, Diagramm-Editor und neuer Baureihenfolge
  (`git checkout 39644ed`, danach `npm install && npm run build`).

## Projektaufbau

```
src/data      Spieldaten (JSON aus dem alten Projekt) und deutsche Aufbereitung
src/engine    Simulation ohne Oberfläche – testbar mit Vitest
src/render    Canvas-Grafik: Sektorkarte, Galaxiekarte, prozedurale Asteroiden und Stationen
src/ui        Oberfläche (HUD, Blätter, Dialoge), Steuerung und Klänge
tests         Simulationstests
scripts       Werkzeuge: Balance-Simulation, Screenshot-Tour, Artifact-Export
```

Alte Spielstände: `tests/fixtures/saves/` enthält echte Spielstände aus 8 älteren Versionen (erste Version bis erstes Baulager), erzeugt mit dem jeweiligen damaligen Code. `npm test` lädt jeden mit dem aktuellen Code, prüft Kampagne, Bauten, Lager und Schiffe und spielt 12 Stunden weiter.

Nützliche Befehle: `npm test`, `npm run typecheck`, `npm run balance` (simulierter Spieler über 72 Spielstunden), `npm run e2e` (Handy-Oberfläche in 390 und 360 px: Werft, Zurück-Taste, keine abgeschnittenen Texte, dazu alte Spielstände über den echten Ladedialog und ein kompletter Durchlauf der ersten Schritte, bei dem immer genau dorthin getippt wird, wohin der Hinweis zeigt – läuft auch in GitHub Actions), `npm run perf` (Simulationstempo), `npm run fps` (Bildrate der Karte), `npm run kampagne -- [seed] [stunden] [--weiter]` (simulierter Spieler spielt alle 28 Kapitel (ca. 100 Spielstunden) und prüft stündlich: keine ungültigen/negativen Bestände, kein überfülltes Lager, kein festhängendes Schiff).

## Datenquellen

Rezepte und Preisspannen: Community-Datensatz *X4Foundations_FactoryStationsTracker* (gepflegt nach Roguey's X4-Seite, Stand August 2026);
abgeglichen mit den Spieldaten aus *crissian/x4* – alle 57 Rezepte stimmen überein. Solarkraftwerk (175 Energiezellen je 60 s)
und Belegschaftsbonus je Ware aus *crissian/x4*.
Modul-Baukosten und Bauzeiten (auch Schiffsfertigung): *crissian/x4*. Schiffe (Rumpfpreis, Ausrüstung, Schub, Luftwiderstand,
Frachtraum, Baumaterial): *crissian/x4*, ausgelesen mit `scripts/extract-ships.mjs`. Lagermodule S/M/L (Kapazität, Baumaterial, Bauzeit): *crissian/x4*, Split-Bauweise.
Spielwerte (nicht aus X4): Abbauraten, Schiffsbauzeiten, Lage der Felder, Nachbarsektoren und der Nividium-Preis.

X4: Foundations ist ein Spiel von Egosoft. Dies ist ein inoffizielles Fanprojekt.
