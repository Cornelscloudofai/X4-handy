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
| Stationsplaner | Endprodukte wählen → komplette Modulkette mit exakten Mengen pro Stunde, Rundung auf ganze Module, Überschuss/Fehlbedarf, Zukauf statt Eigenproduktion, Sonnenlicht, Belegschaftsbonus, Baukosten, Vollbild-Fließdiagramm (Zoomen, Verschieben, Kästchen anordnen, ± am Modul, Empfehlungen bei Unterversorgung) für Entwürfe oder echte Stationen – dort wirkt jede Änderung direkt auf die Baureihenfolge |
| Produktion | 58 Waren mit echten X4-Rezepten (Zykluszeit, Ein- und Ausgangsmengen), Solarleistung abhängig vom Sonnenlicht des Sektors |
| Stationsbau | Module mit echten Baumaterialien und Bauzeiten, Kosten aus Materialwert; Lager (Container/Feststoff/Flüssig), Dock, Pier; Lageranteil und Reserve je Ware einstellbar |
| Eigene Werft | S/M- und L-Schiffsfertigung mit echten Baumaterialien (3.312 Claytronik, 6.620 Energiezellen, 12.112 Hüllenteile); Schiffe aus dem Stationslager bauen (Material aus Rumpf + Ausrüstung), fehlendes Material kaufen Transporter automatisch zu; Schiffsbestellungen der Fraktionen bringen Credits und Ruf |
| Schiffe | Split-Schiffe mit echten Daten: Preis = Rumpf + Grundausstattung (Triebwerke, Schilde, Abbautürme), Reisegeschwindigkeit aus Schub und Luftwiderstand, Frachtraum; Miner (Mineral/Gas, M/L), Kurier, Transporter, Großfrachter |
| Logistik | Miner fördern nach Bedarf; Transporter im Autohandel oder als feste Versorgungslinie; Flüge über Sprungtore |
| Märkte | Preise folgen dem Bestand wie in X4 (Min–Max-Spanne), NPC-Händler besuchen deine Stationen, Nachfrageschwankungen |
| Fortschritt | Kampagne mit 15 Kapiteln bis zur eigenen Werft, jedes mit Erklärung, wofür die Ware gebraucht wird; Lieferaufträge, Ruf bei Freien Familien und Zyarth-Patriarchat, Baupläne, Baulizenzen für 7 Sektoren |
| Komfort | Zeitraffer ×1 bis ×60, Offline-Fortschritt (bis 8 h), automatisches Speichern, Spielstand als Text oder Datei sichern und laden, Rückgängig für Bauliste und Planer, Android-Zurück-Taste schließt Dialoge und Blätter |

## Offene Punkte

- **Belegschaft:** Habitatmodule mit Verbrauch von Nahrung und Medizin, damit der Belegschaftsbonus im Planer und in der Simulation vollständig durchgerechnet wird.
- **Kampfschiffe und Gefahren:** Piraten und Xenon an den Toren, Geleitschutz und Verteidigungsplattformen – die eigene Werft ist die Grundlage dafür.
- **Balance der späten Kapitel:** Die Balance-Simulation spielt bisher bis „Steuertechnik“; Claytronik, Werft und Bestellungen sind per Test abgedeckt.

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

Nützliche Befehle: `npm test`, `npm run typecheck`, `npm run balance` (simulierter Spieler über 72 Spielstunden), `npm run e2e` (Handy-Oberfläche in 390 und 360 px: Werft, Zurück-Taste, keine abgeschnittenen Texte – läuft auch in GitHub Actions), `npm run perf` (Simulationstempo).

## Datenquellen

Rezepte und Preisspannen: Community-Datensatz *X4Foundations_FactoryStationsTracker* (gepflegt nach Roguey's X4-Seite, Stand August 2026);
abgeglichen mit den Spieldaten aus *crissian/x4* – alle 57 Rezepte stimmen überein. Solarkraftwerk (175 Energiezellen je 60 s)
und Belegschaftsbonus je Ware aus *crissian/x4*.
Modul-Baukosten und Bauzeiten (auch Schiffsfertigung): *crissian/x4*. Schiffe (Rumpfpreis, Ausrüstung, Schub, Luftwiderstand,
Frachtraum, Baumaterial): *crissian/x4*, ausgelesen mit `scripts/extract-ships.mjs`. Lagermodule: Egosoft-Wiki.
Spielwerte (nicht aus X4): Abbauraten, Schiffsbauzeiten, Lage der Felder, Nachbarsektoren und der Nividium-Preis.

X4: Foundations ist ein Spiel von Egosoft. Dies ist ein inoffizielles Fanprojekt.
