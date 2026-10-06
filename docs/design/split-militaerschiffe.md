# Split-Militärschiffe – Daten aus dem Original (X4 Version 9.0)

Quelle: X4-Spieldaten **Version 9.0** aus [Mistralys/x4-core](https://github.com/Mistralys/x4-core)
(`data/ships.json`, `engines.json`, `shields.json`, `weapons.json`; Update „Game Update v9“, Juni 2026).
Ausgelesen mit `node scripts/extract-military.mjs spl` (Anleitung im Skript).

Ältere Quelle ([crissian/x4](https://github.com/crissian/x4)) zeigte noch den Stand vor 9.0, als jeder Waffenplatz
wahlweise eine Waffe oder einen Raketenwerfer trug. **Seit 9.0 haben Raketenwerfer eigene Plätze, und nur
manche Schiffe besitzen einen** (Update 9.00: eigener Werferplatz bei etwa 40 % der S/M-Schiffe).

Tempo: rechnerisch mit Split-Kampftriebwerk Mk1 (Schub × Anzahl ÷ Luftwiderstand vorwärts; S 581, M 1482) –
gut für den Vergleich untereinander, nicht die Werte mit besseren Triebwerken.

| Schiff | Klasse / Typ | Hülle | Triebwerke | Schilde | Waffenplätze | Raketenwerfer | Türme | Raketen | Tempo* | Drehwiderstand | Gebaut von |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Jaguar | S · Aufklärer | 2 000 | 1 × S | 1 × S | 1 × S | – | – | 0 | 390 | 3,0 | alle Split |
| Mamba | S · Jäger | 3 600 | 2 × S | 2 × S | 2 × S | 1 × S | – | 8 | 330 | 3,3 | Zyarth |
| Asp | S · Jäger | 4 600 | 2 × S | 1 × S | 3 × S | 1 × S | – | 3 | 347 | 2,9 | Zyarth |
| Asp Raider | S · Jäger | 2 200 | 2 × S | 1 × S | 3 × S | 1 × S | – | 3 | 370 | 2,3 | Freie Familien |
| Balaur | S · Schwerer Jäger | 5 500 | 3 × S | 1 × S | 4 × S | – | – | 0 | 363 | 3,6 | Freie Familien |
| Chimera | S · Schwerer Jäger | 6 100 | 4 × S | 1 × S | 5 × S | – | – | 0 | 394 | 4,3 | Zyarth |
| Dragon | M · Korvette | 21 000 | 1 × M | 1 × M | 6 × M | 1 × M | 2 × M | 2 | 478 | 11,3 | Zyarth |
| Dragon Raider | M · Korvette | 13 800 | 1 × M | 1 × M | 6 × M | 1 × M | 2 × M | 2 | 593 | 9,3 | Freie Familien |
| Cobra | M · Fregatte | 33 000 | 3 × M | 2 × M | 3 × M | – | 4 × M | 0 | 518 | 11,0 | Zyarth |
| Rattlesnake | L · Zerstörer | 242 650 | 3 × L | 15 × M + 1 × L | 4 × L (Hauptbatterie) | – | 6 × L, 12 × M | 160 | 217 | 123 | alle Split |
| Raptor | XL · Träger | 590 000 | 1 × XL | 49 × M + 1 × XL | – | – | 8 × L, 93 × M | 320 | 114 | 867 | alle Split |

\* m/s mit Kampftriebwerk Mk1 (siehe oben).

**Schilde (Split, Mk1):** S 740 (lädt 35/s nach 3,5 s), M 3 848 (74/s nach 2 s), L 38 845.

**Waffen (Schaden pro Sekunde, Mk1):**

| Waffe | S | M |
|---|---|---|
| Impulslaser | 216 | 440 |
| Bolzenrepetierer | 252 | 368 |
| Splitterbatterie | 259 | 408 |
| Split: Neutronen-Gatling | 252 | 342 |
| Split: Tau-Beschleuniger (Streuschuss) | 560 | 720 |
| Split: Thermaldisruptor | 124 | 368 |
| Split: Bosonenlanze | 750 je Schuss | 1 150 je Schuss |
| M-Impulsturm (generisch) | – | 68 |
| Rattlesnake-Hauptbatterie | – | 3 220 (L) |

## Beschreibungen aus dem Spiel (gekürzt, übersetzt)

- **Mamba:** vielseitiges Arbeitstier mit ordentlichem Tempo und ordentlicher Bewaffnung; viele Piloten wechseln später zu etwas Spezialisierterem.
- **Asp:** sehr wendiger, mittelgroßer Jäger, bei Split-Söldnern beliebt.
- **Asp Raider:** Variante der Freien Familien (Schiffsbauerin Qal t'Kzt) – „Wie viel Hülle braucht eine Asp wirklich?“.
- **Chimera:** von Bala Gi Research, um die Fernkampfleistung der Mamba zu verbessern; großes Profil, leicht zu treffen.
- **Balaur:** Qal t'Kzts Meisterstück: „Hart zuschlagen, schnell zuschlagen, dann weg.“
- **Jaguar:** Aufklärer mit phänomenalem Tempo – beliebt bei Rennfahrern, Kurieren und Fluchtfahrern.
- **Dragon:** galt anfangs als verfluchtes Schiff, heute als furchteinflößendes Kriegsschiff, das im Zweikampf gegen jedes Schiff bestehen kann.
- **Dragon Raider:** aus einem Umbau-Wettbewerb der Freien Familien; eine Flotte davon terrorisiert selbst gut verteidigte Systeme.
- **Cobra:** Schiff der Freibeuterin Ra t'Knt, die damit Geschütztürme von den Schiffen säumiger Schuldner schoss.

## Umsetzung im Kampf-Minispiel (`src/minigames/loadout.ts`)

Bezug ist die Mamba (= 1). Aus den Daten übernommen:

- **Hülle, Schildstärke, Schildladung und Ladepause:** wie im Original.
- **Tempo und Wendigkeit:** Wendigkeit = Mamba-Drehwiderstand ÷ eigener.
- **Bewaffnung:**
  - Zahl der Waffenplätze, Raketenwerfer und Türme wie im Original; das Raketenlager ebenso.
  - Bordkanonen: M-Waffe = 440 ÷ 216 ≈ 2,04-mal so stark wie eine S-Waffe.
  - Türme: M-Impulsturm = 68 ÷ 216 ≈ 0,31 einer S-Waffe.

Annahme, weil die Daten nichts dazu enthalten: M-Steuerdüsen drehen doppelt so stark wie S-Steuerdüsen.

Ausgleich: Die Stärke des Schiffs (Haltbarkeit × Feuerkraft) bestimmt die Gegner. Bis zum 2,5-Fachen kommen
entsprechend mehr Gegner, darüber werden sie zusätzlich zäher und gefährlicher.

Die vier Waffentypen im Minispiel (Impuls, Strahler, Splitter, Plasma) sind noch allgemein gehalten. Die
Split-eigenen Waffen (Neutronen-Gatling, Tau-Beschleuniger, Thermaldisruptor, Bosonenlanze) könnten sie ersetzen.
