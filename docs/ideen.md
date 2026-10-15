# Ideen und Vormerkungen

Gesammelte Wünsche, die noch umgesetzt werden sollen (neueste oben).

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

- Gegnerstärke mit dem Entwicklungswerkzeug (Minispiele → Kampf, Version 181) kalibrieren; gefundene Faktoren danach
  fest in ENEMY_HULL/ENEMY_SHIELD übernehmen und das Werkzeug ggf. ausblenden.
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
