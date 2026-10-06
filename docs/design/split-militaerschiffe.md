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

## Waffen (X4 9.0, Mk1)

Aus `weapons.json` (Schaden, Schüsse/s, Geschosse je Schuss, Salve bzw. Magazin und Pause danach, Tempo, Flugzeit,
Streuung) und `wares.json`. „Dauer“ = Schaden pro Sekunde mit Salven- bzw. Nachladepausen. Die Spielbeschreibungen
bestätigen die Salven: Der Pulslaser Mk2 hat laut Beschreibung „einen etwas längeren Burst“ (4 statt 3 Schuss).

**Split-Waffen** (Neutronen-Gatling, Tau-Beschleuniger und Thermal-Desintegrator verkaufen Zyarth und Freie Familien;
die Bosonenlanze nur Zyarth):

| Waffe | S | M | Besonderheit (Spielbeschreibung) |
|---|---|---|---|
| Neutronen-Gatling | 14 × 18/s, Dauerfeuer – Dauer 252 | 19 × 18/s – 342 | ununterbrochener Strom langsamer Geschosse, etwas ungenau |
| Tau-Beschleuniger | 56 × 4 Geschosse, 2,5/s, 6er-Salve, 4 s – Dauer 224 | 90 × 4, 2/s, 6er, 5 s – 288 | Schrot-artig, hohe Feuerrate, kurze Reichweite |
| Thermal-Desintegrator | 31, 4/s, 8er-Salve, 2,2 s – Dauer 63 | 92, 4/s, 8er, 4,5 s – 117 | haftet am Ziel, brennt nach, dringt teilweise durch Schilde |
| Bosonenlanze | 750, Einzelschuss, 12,2 s Aufladen – Dauer 61 | 1 150, 2 Schuss, 17 s – 128 | sehr schnell, große Reichweite, lange Aufladeintervalle, kleiner Schwenkbereich |

**Allgemeine Waffen** (laut 9.0-Daten von Argonen, Teladi, Paraniden, Antigone, Hatikvah u. a. gebaut;
Pulslaser und Plasmakanone verkaufen laut älteren Daten mit Split-DLC auch die Split):

| Waffe | S | M | Besonderheit |
|---|---|---|---|
| Pulslaser | 36, 6/s, 3er-Salve, 0,7 s – Dauer 105 | 55, 8/s, 3er, 0,7 s – 154 | schnell, genau, große Reichweite |
| Bolzenrepetierer | 18, 14/s, 66er-Magazin, 3,4 s – Dauer 148 | 32, 11,5/s, 65er, 3,8 s – 220 | lange Feuerstöße, langsamere Geschosse |
| Schrotbatterie | 48 × 6, 0,9/s, 8er-Magazin, 5 s – Dauer 180 | 85 × 6, 0,8/s, 6er, 5,5 s – 243 | Streuung, stark auf kurze Entfernung |
| Strahlenemitter | 82/s Dauerstrahl | 135/s | trifft sofort, auf Schilde ausgelegt |
| Plasmakanone | 720 je Schuss (Takt s. u.) – Dauer 277 | 1 200 – 480 | langsam, große Reichweite, viel Hitze |

**Split-Türme (M):** Pulsturm 18, 3,8/s, 8er-Salve, 2,4 s (180°/s) · Neutronen-Gatling-Turm 18, 18/s, 80er-Magazin,
8 s (140°/s) · Tau-Turm 42 × 4, 3/s, 8er, 5 s (160°/s) · Plasmaturm 750, 2 Schuss, 7 s (40°/s) ·
Bosonenlanzen-Turm 800, 2 Schuss, 15 s (40°/s). Der Split-Flakturm fehlt (keine Schadenswerte in den Daten).

**Hitze:** Mit den Kühlwerten aus 9.0 überhitzt keine dieser Waffen bei Dauerfeuer (Hitze je Sekunde liegt unter
der Kühlung) – das Minispiel zeigt deshalb keine Hitze an.

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
- **Bewaffnung:** Zahl der Waffenplätze, Raketenwerfer und Türme wie im Original; das Raketenlager ebenso.
- **Waffen:** Schaden je Geschoss, Takt, Geschosse je Schuss, Salven/Magazine mit Pause, Reichweite und Streuung je
  Waffe und Platzgröße (S/M) aus den Daten. Ein Magazin füllt sich auch, wenn man so lange nicht feuert.
- **Türme:** Split-M-Türme mit ihren Werten und ihrem Schwenktempo.

Umrechnung: Das Minispiel läuft 1,56-mal gemächlicher (Pulslaser 0,26 s statt 1/6 s je Schuss); die Dauerleistung
des Pulslasers entspricht dem bisherigen Spielwert, alle anderen Waffen im Verhältnis dazu. Reichweiten maßstäblich
(3,5 km = 416 Bildpunkte), Geschosstempo verdichtet (Wurzel), Streuung verdreifacht.

Annahmen, weil die Daten nichts dazu enthalten:

- M-Steuerdüsen drehen doppelt so stark wie S-Steuerdüsen.
- Plasmakanone: Takt fehlt in den Daten – sie feuert so schnell, wie ihre Kühlung es erlaubt (Hitze ÷ Kühlung: S alle
  2,6 s, M alle 2,5 s). Das passt zur Beschreibung (hoher Schaden ähnlich der Schrotbatterie, wenig Schüsse).
- Strahlenemitter: Schadenswert gilt pro Sekunde; Reichweite wie der Pulslaser. Er durchdringt die Schutzschilde der
  Schildträger („auf Schilde ausgelegt“).
- Thermal-Desintegrator: der Schaden wirkt über 2 Sekunden; durch Schutzschilde dringen 65 % statt 30 %.
- Bosonenlanze: halbe Zielhilfe (kleiner Schwenkbereich); M und Zweier-Magazine der Türme: 1 s zwischen den Schüssen.

Ausgleich: Die Stärke des Schiffs (Haltbarkeit × Feuerkraft mit der gewählten Waffe) bestimmt die Gegner. Bis zum
2,5-Fachen kommen entsprechend mehr Gegner, darüber werden sie zusätzlich zäher und gefährlicher. Schaden über
400 Punkte je Geschoss zählt dabei nicht (er verpufft an kleinen Gegnern).
