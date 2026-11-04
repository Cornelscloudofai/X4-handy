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

- Ob Kampfschiffe Sektorgrenzen frei überschreiten oder an den Heimatsektor gebunden sind.
- Wie stark Sicherheit die Wirtschaft beeinflusst (nur Überfälle oder auch Preise).

## Fortschritt

- [x] Stufe 1 – Kampf am echten Ort (Szene als Hintergrund bei Überfällen und Kampfaufgaben, Schauplatz in der
  Einleitung und bei der ersten Welle, Glutsee-I-Sturm halbiert die Schildaufladung)
- [x] Stufe 2 – Eigene Kampfschiffe und Befehle: sieben Split-Schiffe (Jaguar, Mamba, Asp, Balaur, Chimera, Dragon,
  Cobra) mit X4-Preisen und -Material (`src/data/militarydata.json`, `scripts/extract-military-build.mjs`), kaufen oder in
  der S/M-Werft bauen; Befehle Wache, Patrouille, Geleit, Flieg zu (`src/engine/combat.ts`); Zielwahl auf der Karte
- [x] Stufe 3 – Gegner in der Welt (`src/engine/hostiles.ts`): Piratenrotten, Xenon-Streife in Ravine (mit dem
  Ereignis, aus der Lücke im Nordosten), Kha'ak in der Glutsee; Überfälle nur noch durch Rotten, die ihr Ziel erreichen;
  Abschrecken durch eigene Kampfschiffe (≥ ¾ des Kampfwerts im Umkreis von 25 km), „Kampfschiffe schicken“; Sicherheit je
  Sektor in der Sektorinfo. Offen: Fraktionspatrouillen als eigene Schiffe (bisher nur im Grundwert der Sicherheit)
- [x] Stufe 4 – Kampf auf der Karte (`src/engine/battle.ts`): Kampfschiffe greifen Gegner im Wachbereich an, Rotten
  stellen sich ihnen (15 km); Abrechnung je Sekunde (Verlust = Kampfwert der Gegenseite / 40, gestreut); Piraten fliehen
  unter 40 %, Xenon/Kha'ak unter 15 %; Abschrecken nur noch bei Piraten (anderthalbfacher Kampfwert); S/M zerstört →
  Wrack (40 % der Hüllenteile als Schrott), L/XL kampfunfähig; Rückzug unter 25 % Hülle, Reparatur an der Heimat aus
  Hüllenteilen (fünf Minuten, 30 % der Bau-Hüllenteile); Kopfgeld 1.000 Cr je Gegnerschiff; „Selbst übernehmen“ (ab
  einem Stern vernichtet, eigener Schaden 40/20/0 %); Wracks bergen im Bergungs-Einsatz. Noch offen: eigene Kampfschiffe
  als Flügelleute im Minispiel, Abschleppen von L/XL (Stufe 5)
- [x] Befehlsebene (getrennt vom Infoblatt): Gedrückt halten (⅓ s → Vibration und Ring, nach ⅔ s Lasso), Lasso fängt
  nur Kampfschiffe; schwebende Befehlskugel neben der Gruppe, Befehle mit Strahlen untereinander (Flieg zu, Patrouille
  mit aufgezogenem Radius, Wache, Geleit, Angreifen); Einzelschiff als kompakte Infozeile, Infoblatt nur auf Wunsch;
  neue Station nur noch über „Stationen → Neue Station gründen“ (`scripts/command-shot.mjs`)
- [x] Einmalige Hinweise (`src/ui/coach.ts`, `scripts/guide-shot.mjs`): Lasso, Befehlskugel, Gegner im Sektor – dazu
  Sektorenkarte, Späher, Peilen, Tor-Baustelle und offenes Tor; kommen auch nach den Grundlagen (nur „Hilfe ausblenden“
  schaltet sie ab). Hilfeseite „Sektorenkarte und Erkundung“
- [ ] Stufe 5 – Ausbau
  - [x] Abschleppen (`src/engine/tow.ts`, `tests/tow.test.ts`, `scripts/tow-shot.mjs`): Zerstörer Rattlesnake (L, X4-Werte,
    Hauptbatterie gegen Jäger nur zu einem Viertel im Kampfwert); L-Kampfschiffe bleiben nach einem verlorenen Gefecht,
    große Frachter und Miner nach einem unbeantworteten Überfall (Frist abgelaufen oder 0 Sterne) kampfunfähig liegen.
    Bergungsschlepper Manticore (X4 `ship_gen_m_tugboat_01_a`, drei Schrott-Traktorstrahlen) holt sie von selbst ab:
    hinfliegen, drei Minuten ankoppeln, mit halbem Tempo zur Heimatstation schleppen; dort Reparatur aus Hüllenteilen
    (L: 30 Minuten von 0 auf 100 %), danach arbeitet das Schiff weiter, Ladung bleibt an Bord. Liegende Schiffe werden
    nicht noch einmal überfallen. Dazu der Träger Raptor (XL, X4-Werte: 590 000 Hülle, 1 XL- und 49 M-Schilde, 8 L- und
    93 M-Türme, 36,6 Mio Cr; XL-Werft, Pier, Reparatur eine Stunde); Schiffsgröße XL im ganzen Spiel. Hangar noch ohne
    Aufgabe. Bilder für Rattlesnake und Manticore fehlen noch
  - [x] Raptor im Kampf-Minispiel (`src/minigames/loadout.ts`, `scripts/raptor-sprite.mjs`, `scripts/raptor-shot.mjs`):
    KI-Bild aus vier Abschnitten (Heck → Bug) zusammengesetzt, Nähte automatisch ausgerichtet (Versatz und Streckung je
    Naht, weich über 160 Zeilen), 1254 × 5016 px. Länge 1 200 Spielpunkte nach dem M-Landeplatz (330 px ≈ ein M-Schiff).
    Türme auf den Sockeln im Bild: 114 M in acht Gruppen (Bug-Cluster, sieben gespiegelte Cluster-Paare) und 8 L (sechs vorn
    als Gruppe, zwei hinten einzeln); Turmart je Gruppe im Hangar. Treffer gegen den Rumpf als Kapsel, Schild als Ellipse.
    Nach dem ersten Spieltest: träger (Tempo ×0,7, Drehrate ×0,35, halbe Beschleunigung als Spielwert `handling`),
    Schild als schmaler Balken am unteren Bildrand statt Blase, Treffer am Rumpf (Schild: blauer Blitz mit kleiner Welle,
    Hülle: rote Funken), Kameraschieber längs des Schiffs (Bug ↔ Heck, zweimal tippen = Mitte), Großschiff-Faktor 2,5
    für Gegnerzahl, Gruppen, Schwärme, gleichzeitige Angreifer und Obergrenze auf dem Feld.
    Zweiter Spieltest: Gegner über dem eigenen Schiff gezeichnet, Drehrate ×0,15, Turmbefehl „Strukturen“ (Türme,
    Bauteile, Nester, Brutkammern, Plattformen) für alle Schiffe, beim Träger je Feuergruppe ein eigener Befehlsknopf
    (M1 … M8, L1 … L3). Zwei Sticks: rechter Stick lenkt stufenlos bis zum mittleren Ring (volle Drehrate ohne Feuer),
    gefeuert wird erst ab dem äußeren Ring. Beim Halten eines Befehlsknopfs leuchten die Türme der Gruppe auf dem Schiff;
    beim Wischen und kurz nach dem Setzen markieren Eckklammern die Gegner, die die Türme zuerst angreifen.
    Offen: Ebenen Flugdeck/Rumpf zum Landen der Jäger (Hangar), Raptor-Bild auf Sektorkarte und in der Werft
  - [ ] Verteidigungstürme als Stationsmodul
  - [ ] Tor-Ereignis in Rhy
  - [ ] Eigene Kampfschiffe als Flügelleute im Minispiel

## Vorerst ausgeschaltet (zum Testen der Gefechte)

- Abdrehen vor überlegenen eigenen Kampfschiffen (`DETER_ON` in `src/engine/hostiles.ts`)
- Flucht bei hohen Verlusten (`FLEE_ON` in `src/engine/battle.ts`)
- Später neu überlegen, wie Abdrehen und Flucht sich anfühlen sollen. Bis dahin kämpfen alle Rotten bis zum Ende.
