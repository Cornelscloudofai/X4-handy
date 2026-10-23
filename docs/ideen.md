# Ideen und Vormerkungen

Gesammelte Wünsche, die noch umgesetzt werden sollen (neueste oben).

## Kha’ak (umgesetzt als eigenes Minispiel „Kha’ak-Invasion“)

- Umgesetzt: Späher-Cluster, Kyon-Strahl (Schilde ×1,5), Phasensprung der Abfangjäger, Korvette mit Brut, Brutschiff als Boss.
- Alle Bilder vorhanden: Späher, Jäger, Abfangjäger, Korvette (2 Brutkästen → Späher), Zerstörer (Großziel),
  Brutschiff (Boss, Brutkästen → Jäger), Kyon-Turm, Brutkasten.
- Cluster: lückenlos geteilte Dreiecke (k² Schiffe, die umgedrehten fliegen rückwärts): Späher 4/9/25, Jäger 4/9,
  bis zu drei Jäger-Cluster gleichzeitig. Offen: ob Jäger auch 16er/25er bekommen sollen (sehr starke Schiffe).
- Balance (Autopilot): Stufe 1–2 schaffbar, Stufe 3 deutlich härter als Xenon; Runden länger als bei Xenon
  (150–340 s statt ~160 s) – nach eigenem Spielen nachjustieren.

## Kampf abwechslungsreicher machen (vorgemerkt, nach den Kha'ak angehen)

Vorgeschlagene Reihenfolge: 1. Elite-Gegner + Rollen Abfangjäger/Bomber, 2. Raketenabwehr der Gegner + Raketenwarnung,
3. Missionen „Station verteidigen“ und „Konvoi“, 4. Flügelleute mit Befehlen.

**1. Gegner, die Taktik erzwingen**
- Rollen: Abfangjäger binden gezielt den Spieler, gleichzeitig greifen Bomber den Frachter an (Zwickmühle).
- Elite-Gegner mit Eigenschaften (farbiger Rand): „Gepanzert“ (Schild doppelt, langsam), „Flink“ (weicht Raketen aus),
  „Splitter“ (zerfällt beim Abschuss in zwei kleine), „Kommandant“ (gibt nahen Gegnern Schild; zuerst abschießen löst
  die Gruppe auf), „Rächer“ (explodiert beim Tod). Wenige je Welle, mehr auf höheren Stufen.
- Raketenabwehr: manche Gegner schießen Raketen ab, andere werfen Täuschkörper (Störrakete legt die Abwehr lahm).
- Xenon passen sich an: viel Raketen → mehr Abwehr in späteren Wellen; nur Bordkanonen → mehr Schildträger.

**2. Neue Missionstypen** – umgesetzt als „Einsätze“ (Station verteidigen, Konvoi, Überfall, Bergung, Nest, Flucht); offen: Balance nach eigenem Spielen, eigene Bilder für Container und Wracks (beide Nester haben Bilder)
- Station verteidigen (Angriffe aus allen Richtungen, Stationstürme mit Fundstücken reparieren).
- Konvoi: drei Frachter, nicht alle zu retten – entscheiden, wen man schützt (Belohnung je Frachter).
- Überfall: Rollentausch, selbst einen Piratenkonvoi vor dem Tor abfangen.
- Bergung unter Beschuss: Container aus einem Wrackfeld bergen (Traktorstrahl wie im Frachtraum-Minispiel).
- Xenon-Nest: festes Ziel spuckt Drohnen aus – erst Brutöffnungen, dann Kern.
- Flucht: beschädigter Frachter, überleben bis der Sprungantrieb geladen ist.

**3. Umgebung als Mitspieler** (Asteroiden und Minen gibt es schon)
- Nebel: Radar und Zielhilfe kürzer, Gegner tauchen erst nah auf (Hinterhalte).
- Sonnenwind oder Schwerkraftquelle: alles driftet, Raketen werden abgelenkt.
- Wracks und Stationstrümmer als Deckung (nur Raketen kommen um die Ecke).
- Highway-Ringe als Abkürzung quer über die Karte, für Spieler und Gegner.

**4. Flügelleute mit Befehlen** (Wischmenü wie bei den Turmbefehlen): ein bis zwei Begleitjäger – „Greift mein Ziel an“,
„Schützt den Frachter“, „Folgt mir“, „Jagt die Bomber“; können abgeschossen werden, zwischen den Wellen reparieren.

**5. Spannung und Rückmeldung**
- Raketenwarnung: Ton und Pfeil am Bildschirmrand aus der Anflugrichtung.
- Kampfmusik „Invasion“ im Takt (Taktkarte liegt bereit): zieht bei Gefahr an, Boss auf dem kräftigen Abschnitt.
- Kurze Zeitlupe beim Bossabschuss oder knappen Ausweichen.

**6. Feldzug (größer)**: kleine Sektorkarte mit Abzweigungen wie ein Roguelite – Missionen, Händler (Raketen,
Reparatur), Elite-Begegnungen; Schaden und Verbesserungen bleiben über mehrere Kämpfe erhalten.

**Schiffe** später als Belohnung, z. B. ein Split-Träger mit eigenen Jägern, sobald es Missionen gibt, in denen er glänzt.

## Gasströme: tanzende Gassammeldrohnen (umgesetzt, Version 177)

- Umgesetzt mit `gasdrohne-b-ki` (Greifarme) ab 1:57 für 16 Takte, nur bei „Celestial Drift“, reine Zierde.
- Noch offen: Rückmeldung des Spielers zu Figuren und Tempo; ggf. als zufälliges Ereignis bei weiteren Liedern.
- Vorrat: `gasdrohne-a-ki.webp` und `bergbaudrohne-ki.webp` (Doppelbohrer – evtl. für das Erz-Minispiel).

## Radio auf der Sektorkarte (vorgemerkt)

- Neben dem generativen Klangteppich (Ambiente, bleibt Standard) ein **Radio** mit eigenen Liedern für die Sektorkarte
  (außerhalb der Minispiele).
- Bedienung an der **Handelsstation**: Radio ein/aus, „nächster Song“ – der Spieler wählt selbst zwischen Ambiente und
  Radiomusik.
- Lieder liefert der Spieler nach (wie die Minispielmusik); laufen über den Musik-Kanal, Klangteppich tritt zurück,
  solange das Radio spielt.
- Offen: Senderliste/Reihenfolge (Zufall ohne Wiederholung?), Anzeige des laufenden Titels, ob die Wahl gemerkt wird.

## Kampf-Minispiel: offene Punkte

- Gegnerstärke: Entwicklungswerkzeug (Minispiele → Kampf und Pausenmenü, ×0,25–×100) bleibt vorerst; Entscheidung,
  wie die Stärke am Ende gelöst wird, ergibt sich beim Spielen. Bekannt: in X4 haben Gegner dieselben Werte wie
  Spielerschiffe; Umrechnung 1 X4-Schaden = 0,0287 Spielpunkte (Mamba 3.600 Hülle → 103, S-Schild 740 → 21).
  Gemessen an X4 sind kleine Gegner etwa ×3, M-Gegner etwa ×6–9 zu schwach. Möglicher Weg: je Gegnertyp ein X4-Schiff
  zuordnen (Piratenjäger ≈ Mamba, Kanonenboot ≈ Cobra, Xenon-Werte nachschlagen), Regler als Feinabstimmung;
  dann Gegnerzahl/Wellen und Rundendauer mitprüfen.
- Mods: Testphase mit stark angehobenen Werten (außergewöhnlich bis +100 %, Zusatzeffekte ×2,5, volle Rückgabe beim
  Zerlegen) – später fürs Balancing anpassen (Schalter MOD_TEST in src/minigames/mods.ts; ohne ihn alte Spannen, ¼ zurück).
- Verdoppelte L-Schadensstufe der Schnellfeuerwaffen ggf. zurücknehmen.
- Eigenes Bild für den Strahlenturm (Prompt schreiben).

## Musik in den Minispielen

- Gasströme: Musik mit Takt-Effekten (Taktkarte, scripts/analyze-beats.mjs) – erste Probe mit „Celestial Drift“.
- Kampf: Musik „Invasion“ (126 BPM, 3:03) läuft; Taktkarte `kampf-invasion.beats.json` vorhanden – Takt-Effekte
  (z. B. Mündungsfeuer/Sterne im Takt, Bosswelle auf kräftigen Abschnitt legen) noch offen.
- Highway und Frachtraum: „Slowly Overtaker“ (103,5 BPM, 2:59) und „Slow way ist chill way“ (105,5 BPM, 3:04) laufen
  abwechselnd je Runde; Taktkarten vorhanden, Takt-Effekte (z. B. Highway-Schlieren im Takt) noch offen.
- Weitere Minispiele mit eigener Musik und Takt-Effekten (Kampf: Lage-abhängig, Boss; Highway: Schlieren im Takt;
  Erzader: Funken im Rhythmus) – sobald Lieder da sind.
