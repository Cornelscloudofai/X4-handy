# Kampf: Minispiel und Sektorwelt verbinden

Stand: Entwurf, Oktober 2026. Werte sind Startwerte zum Ausprobieren, keine Festlegung.

## Ausgangslage

- **Kampf-Minispiel** (`src/minigames/shooter.ts`): zehn Split-Schiffe, elf Waffen, Türme, Schilde, Raketen, Elite-Gegner,
  Endlos-Modus und sechs Einsätze (Station verteidigen, Konvoi, Flucht, Bergung, Überfall, Nest ausheben). Ausrüstung im
  Kampfmenü frei wählbar.
- **Verbindung zur Welt** nur über Vorfälle (`src/engine/incidents.ts`): „Überfall auf Frachter X“ entsteht zufällig,
  „Selbst übernehmen“ startet das Minispiel, die Sterne entscheiden über den Ladungsverlust. Dazu Kampfaufgaben an Stationen.
- **Sektorkarte**: nur Miner und Händler. Schiffe fliegen über eine Liste freier Wegpunkte (`Ship.path`) – freie
  Bewegung ist technisch angelegt, es fehlen Befehle und Bedienung.

## Grundsätze (festgelegt)

1. **Das Minispiel bleibt frei.** Im Kampfmenü weiter alle Schiffe und Waffen zum Üben und Ausprobieren, unabhängig von
   Flotte und Lager. Nur Kämpfe aus der Welt nutzen echte Schiffe und echte Folgen.
2. **Auf der Karte nur Befehle**, keine Einzelsteuerung. Wer selbst fliegen will, übernimmt einen Kampf im Minispiel.
3. **Verluste:**
   - **S- und M-Schiffe** werden zerstört. Es bleibt ein Wrack im Sektor, das als Schrott geborgen werden kann.
   - **L- und XL-Schiffe** gehen nicht verloren: Sie werden kampfunfähig, bleiben liegen, können weder fliegen noch
     eingesetzt werden und müssen abgeschleppt werden (eigener Schiffstyp, später). Danach Reparatur in der Werft.
   - Damit das nicht folgenlos ist: Ausfallzeit, Reparatur aus Hüllenteilen und Credits, die Ladung ist weg.
     Weitere Strafen (Ruf, Versicherung) erst, wenn sich zeigt, dass es nötig ist.

## Stufen

### Stufe 1 – Kampf am echten Ort

Klein, ohne Umbau der Welt. Kämpfe aus Vorfällen und Stationsaufgaben spielen sichtbar dort, wo sie passieren.

- **Schauplatz:** Statt des Sternenfelds liegt die Ebenen-Szene des Sektors hinter dem Kampf (dieselbe wie auf der
  Sektorkarte), abgedunkelt, damit Schiffe und Geschosse gut lesbar bleiben. Die Kamera des Kampfs verschiebt die Szene
  leicht (Tiefenwirkung). Sektoren ohne Szene: weiter das Sternenfeld.
- **Lage zum Start:** eine Zeile mit Ort und Umstand, z. B. „Glutsee I · Strahlungssturm: Schilde laden halb so schnell“.
- **Sektorbedingungen** – nur wo sie aus der Sektorbeschreibung folgen:
  - Glutsee I, während des Strahlungssturms: Schilde laden halb so schnell.
  - weitere (Ravine: Xenon während der Streife, Rhy: Patrouille als Verstärkung) in Stufe 3, wenn Gegner und
    Patrouillen echte Objekte sind.
- **Minispiel im Menü:** unverändert (Sternenfeld).

### Stufe 2 – Eigene Kampfschiffe und Befehle

- **Bau:** Die Werft baut Kampfschiffe aus Waren (Hüllenteile, Waffen-, Turm-, Schild-, Raketenkomponenten, Antriebsteile).
  Zuerst S und M (Split-Jäger, Korvetten aus dem Minispiel-Bestand), später L.
- **Neue Rolle „Kampfschiff“** neben Miner und Händler.
- **Befehle:**
  - *Patrouille*: kreist in einem Gebiet (Punkt + Radius) oder im ganzen Sektor.
  - *Geleit*: folgt einem eigenen Frachter oder Miner über alle Sektoren.
  - *Wache*: bleibt an einer Station.
  - *Flieg zu*: Antippen auf der Karte setzt den Zielpunkt.
- **Kampfwert** je Schiff aus Hülle, Schild und Waffen (Startformel: Hülle/100 + Schild/50 + Summe Waffen-DPS/10),
  im Schiffsfenster sichtbar.
- **Kosten im Betrieb:** keine laufenden Kosten in Stufe 2; Reparaturen erst mit Stufe 4.

### Stufe 3 – Gegner in der Welt

- **Rotten als Kartenobjekte:** Piraten (aus dem Sektorrand), Xenon (Ravine: die Streife alle 5 h; Grenzsektoren),
  Kha'ak (selten). Sie haben ein Ziel (Miner, Frachter, schwach bewachte Station), fliegen sichtbar ein und ziehen wieder
  ab.
- **Überfälle entstehen aus Rotten** statt zufällig: Erreicht eine Rotte ein Ziel, beginnt der Vorfall. Vorher sichtbar →
  Spieler kann Frachter umleiten oder Kampfschiffe schicken.
- **Sicherheit je Sektor** (0–100): steigt mit Patrouillen und Verteidigungstürmen, sinkt mit Handelsverkehr und Reichtum.
  Bestimmt, wie oft und wie stark Rotten kommen. In der Sektorinfo (Reiter „Allgemein“) sichtbar.
- **Patrouillen der Fraktionen** (Rhy: Patrouillenkorridor) als befreundete Schiffe, die mitkämpfen.

### Stufe 4 – Kampf auf der Karte

- **Automatische Abrechnung**, sobald eigene Schiffe und eine Rotte sich nahe sind: in Takten, Schaden nach Kampfwert,
  Zufall gedämpft. Darstellung: Laserlinien, Treffer, Explosionen, Wracks.
- **„Selbst übernehmen“:** startet das Minispiel mit genau diesen Kräften – eigene Schiffe als Flügelleute, Gegner aus der
  Rotte, Schauplatz aus Stufe 1. Das Ergebnis geht zurück in die Welt (Verluste, Beute, Ruf).
- **Folgen** wie unter Grundsätze: S/M → Wrack, L/XL → kampfunfähig. Wracks bergen mit dem Bergungs-Einsatz
  (Schrott → Hüllenteile/Metall).
- **Reparatur:** beschädigte Schiffe fliegen zur Werft, Kosten aus Hüllenteilen und Credits, Zeit nach Schaden.

### Stufe 5 – Ausbau

- **Bergungsschiff** (Abschlepper) für L/XL, eigener Schiffstyp mit Bild.
- **Verteidigungstürme** als baubares Stationsmodul.
- **Große Ereignisse für die Story:** z. B. das tote Tor in Rhy springt an (aktive Torvariante liegt bereit:
  `src/assets/szenen/rhy/tor-aktiv.webp`), Xenon kommen hindurch – ein Kampf aus Flotte und Minispiel zusammen.
- **Minispiel:** glaubwürdigere Gegner (Piraten fliehen bei hohen Verlusten, Kommandant ruft Verstärkung, kurze
  Funksprüche), Flügelleute mit einfachen Befehlen.

## Offene Fragen

- Welche Schiffe genau in Stufe 2 baubar sind und zu welchen Warenmengen (an `docs/design/split-militaerschiffe.md`
  ausrichten).
- Ob Kampfschiffe Sektorgrenzen frei überschreiten oder an den Heimatsektor gebunden sind.
- Wie stark Sicherheit die Wirtschaft beeinflusst (nur Überfälle oder auch Preise).

## Fortschritt

- [x] Stufe 1 – Kampf am echten Ort (Szene als Hintergrund bei Überfällen und Kampfaufgaben, Schauplatz in der
  Einleitung und bei der ersten Welle, Glutsee-I-Sturm halbiert die Schildaufladung)
- [ ] Stufe 2 – Eigene Kampfschiffe und Befehle
- [ ] Stufe 3 – Gegner in der Welt
- [ ] Stufe 4 – Kampf auf der Karte
- [ ] Stufe 5 – Ausbau
