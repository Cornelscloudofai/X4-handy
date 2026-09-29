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
| Stationsbau | Module mit echten Baumaterialien und Bauzeiten, Kosten aus Materialwert; Lager (Container/Feststoff/Flüssig), Dock, Pier |
| Schiffe | Split-Schiffe mit Frachträumen aus der Egosoft-Wiki: Miner (Mineral/Gas, M/L), Kurier, Transporter, Großfrachter |
| Logistik | Miner fördern nach Bedarf; Transporter im Autohandel oder als feste Versorgungslinie; Flüge über Sprungtore |
| Märkte | Preise folgen dem Bestand wie in X4 (Min–Max-Spanne), NPC-Händler besuchen deine Stationen, Nachfrageschwankungen |
| Fortschritt | Kampagne mit 11 Kapiteln, Lieferaufträge, Ruf bei Freien Familien und Zyarth-Patriarchat, Baupläne, Baulizenzen für 7 Sektoren |
| Komfort | Zeitraffer ×1 bis ×60, Offline-Fortschritt (bis 8 h), automatisches Speichern, Spielstand als Text sichern |

## Offene Punkte

- **Belegschaft:** Habitatmodule mit Verbrauch von Nahrung und Medizin, damit der Belegschaftsbonus im Planer und in der Simulation vollständig durchgerechnet wird.

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

Nützliche Befehle: `npm test`, `npm run typecheck`, `npm run balance` (simulierter Spieler über 72 Spielstunden).

## Datenquellen

Rezepte und Preisspannen: Community-Datensatz *X4Foundations_FactoryStationsTracker* (gepflegt nach Roguey's X4-Seite, Stand August 2026);
abgeglichen mit den Spieldaten aus *crissian/x4* – alle 57 Rezepte stimmen überein. Solarkraftwerk (175 Energiezellen je 60 s)
und Belegschaftsbonus je Ware aus *crissian/x4*.
Modul-Baukosten und Bauzeiten: *crissian/x4*. Schiffsfrachträume und Lagermodule: Egosoft-Wiki.
Spielwerte (nicht aus X4): Schiffspreise, Fluggeschwindigkeiten, Abbauraten, Lage der Felder,
Nachbarsektoren und der Nividium-Preis.

X4: Foundations ist ein Spiel von Egosoft. Dies ist ein inoffizielles Fanprojekt.
