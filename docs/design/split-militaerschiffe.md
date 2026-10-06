# Split-Militärschiffe – Daten aus dem Original

Quelle: Spieldaten-Auszug [crissian/x4](https://github.com/crissian/x4) (`src/app/shared/services/data/ships-data.ts`,
`equipment-data.ts`; Stand des Datensatzes: Juni 2026, inkl. Split Vendetta). Ausgelesen mit
`node scripts/extract-military.mjs spl` (Anleitung im Skript).

Tempo: rechnerisch mit Split-Kampftriebwerk Mk1 (Schub × Anzahl Triebwerke ÷ Luftwiderstand vorwärts) –
gut für den Vergleich untereinander, nicht die Werte im Spiel mit besseren Triebwerken.
Waffenplätze: Jeder Platz nimmt **entweder eine Waffe oder einen Raketenwerfer** auf (Typ „standard/missile“).

| Schiff | Klasse / Typ | Hülle | Triebwerke | Schilde | Waffenplätze (vorn) | Türme | Raketen | Tempo* | Besatzung | Andockplatz | Gebaut von |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Jaguar | S · Aufklärer | 2 000 | 1 × S | 1 × S | 1 × S | – | 20 | 377 | 1 | – | alle Split |
| Mamba | S · Jäger | 3 500 | 2 × S | 2 × S | 2 × S | – | 20 | 341 | 1 | – | Zyarth |
| Asp | S · Jäger | 4 600 | 2 × S | 1 × S | 3 × S | – | 20 | 319 | 2 | – | Zyarth |
| Asp Raider | S · Jäger | 1 800 | 2 × S | 1 × S | 3 × S | – | 4 | 335 | 1 | – | Freie Familien |
| Balaur | S · Schwerer Jäger | 5 500 | 3 × S | 1 × S | 4 × S | – | 20 | 352 | 1 | – | Freie Familien |
| Chimera | S · Schwerer Jäger | 6 100 | 4 × S | 1 × S | 5 × S | – | 20 | 354 | 2 | – | Zyarth |
| Dragon | M · Korvette | 17 000 | 1 × M | 1 × M | 6 × M | 2 × M | 40 | 475 | 6 | – | Zyarth |
| Dragon Raider | M · Korvette | 8 000 | 1 × M | 1 × M | 6 × M | 2 × M | 8 | 576 | 5 | – | Freie Familien |
| Cobra | M · Fregatte | 32 000 | 3 × M | 2 × M | 3 × M | 4 × M | 100 | 496 | 25 | 1 × S-Schiff | Zyarth |
| Rattlesnake | L · Zerstörer | 211 000 | 3 × L | 16 × M | 4 × L (Hauptbatterie) | 6 × L, 12 × M | 160 | 234 | 92 | 40 × S | alle Split |
| Raptor | XL · Träger | 590 000 | 1 × XL | 50 × M | – | 8 × L, 93 × M | 320 | 124 | 309 | 100 × S, 30 × M | alle Split |

\* Tempo in m/s mit Kampftriebwerk Mk1 (siehe oben).

Schildstärke (Split, Mk1): S-Schild 703, M-Schild 4 375 – ein M-Schild hält gut sechsmal so viel wie ein S-Schild.

Wendigkeit (Trägheit Gieren, kleiner = wendiger): Asp Raider 0,48 · Mamba 1,07 · Jaguar 1,10 · Asp 1,66 · Balaur 1,68 ·
Chimera 2,93 · Dragon Raider 2,96 · Cobra 6,73 · Dragon 7,02.

## Beschreibungen aus dem Spiel (gekürzt, übersetzt)

- **Mamba:** vielseitiges Arbeitstier mit ordentlichem Tempo und ordentlicher Bewaffnung; viele Piloten wechseln später zu etwas Spezialisierterem.
- **Asp:** sehr wendiger, mittelgroßer Jäger, bei Split-Söldnern beliebt.
- **Asp Raider:** Variante der Freien Familien (Schiffsbauerin Qal t'Kzt) – „Wie viel Hülle braucht eine Asp wirklich?“: kaum Panzerung.
- **Chimera:** von Bala Gi Research, um die Fernkampfleistung der Mamba zu verbessern; großes Profil, leicht zu treffen.
- **Balaur:** Qal t'Kzts Meisterstück: „Hart zuschlagen, schnell zuschlagen, dann weg.“
- **Jaguar:** Aufklärer mit phänomenalem Tempo – beliebt bei Rennfahrern, Kurieren und Fluchtfahrern.
- **Dragon:** galt anfangs als verfluchtes Schiff, heute als furchteinflößendes Kriegsschiff, das im Zweikampf gegen jedes Schiff bestehen kann.
- **Dragon Raider:** aus einem Umbau-Wettbewerb der Freien Familien entstanden; eine Flotte davon terrorisiert selbst gut verteidigte Systeme.
- **Cobra:** Schiff der Freibeuterin Ra t'Knt, die damit Geschütztürme von den Schiffen säumiger Schuldner schoss.
