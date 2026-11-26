# Neue Fraktion „Hegemonie“ (Arbeitsname)

Stand: 26.11.2026. Grundlage: Konzept mit ChatGPT (Hintergrund, Designsprache, Zerstörer, M-Turm), hier auf das Spiel
übertragen. „Hegemonie“ ist ein Platzhalter – der Name kann bleiben, wenn er passt.

## Hintergrund (vereinbart)

- Menschliche, autoritäre, expansionistische Militärmacht; begründet ihren Anspruch mit der angeblichen Überlegenheit
  ihrer Zivilisation („Sicherheit, Ordnung, Fortschritt“).
- Standardisierte, präzise gefertigte Kriegstechnik; Disziplin, industrielle Leistung, technologische Überlegenheit.
- Offen: endgültiger Name, Heimat, Entstehung, Chronologie, handelnde Personen.

## Gestaltung (vereinbart)

- Kantig, massiv, streng geordnet, überwiegend symmetrisch; dicke Panzerplatten, gestaffelte Aufbauten.
- Anthrazit, Graphit, Stahlgrau; dunkles Rot, sparsames gedämpftes Elfenbein; kleine bernsteinfarbene Betriebslichter,
  kühle cyanfarbene Antriebsdetails. Gegenüber den Split vereinheitlicht und durchorganisiert.
- Bilder: fast senkrechte Vogelperspektive mit kleinem Blickwinkel von hinten, Bug oben, freigestellt; Rümpfe ohne
  Türme (Sockel frei), Türme einzeln mit Rohren nach oben.

## Grundsatz zur Stärke

Der Zerstörer soll schwer und mächtig sein – eine echte Gefahr. Verliert der Autopilot oder ein Testlauf gegen ihn, ist das
in Ordnung und **kein Grund, ihn abzuschwächen**. Balance, genaue Rolle und Gegenmittel werden später gemeinsam festgelegt.

## Im Spiel umgesetzt

- **Zerstörer** (`heg-zerstoerer-ki`, Original in `grafik-vorrat/hegemonie/`): etwa 950 m – aus den M-Sockeln
  abgeleitet, die genauso groß sind wie die der Klapperschlange (1,82 % bzw. 1,75 % der Rumpflänge).
  Sockel im Bild (793 × 1 983 px): 3 XL auf der Mittelachse, 6 L an den Seiten, 10 M in fünf Paaren
  (`HEG_Z_*` in `src/minigames/shooter.ts`). Alle Sockel bestückt.
  Viel Hülle (×1,5 des Bosswerts), mäßiger Schild (×0,6).
- **Zwillingsgeschütz M** (`heg-turm-zwilling-ki`): Drehsockel so groß wie der M-Sockel im Bild (≈ 17 m), etwa wie die
  M-Türme von Dragon und Cobra (15 m). (Die Klapperschlange hat 41 m große M-Türme – größer als alle anderen.)
  Feuer: Stoß – Stoß – Pause (je Stoß ein Schuss aus jedem Rohr). Splittergranate mit Annäherungszünder: zerlegt sich
  rund 60 px vor der ersten Hülle (oder wenn sie am Ziel vorbeizieht) in 8 Splitter im Kegel ±10°, die nach vorn weiterfliegen. Gegen Jäger voll, M ein Drittel, L kaum.
  Werte vorläufig (`SPLIT_*`).
- **XL-Drillingsturm** (`heg-turm-xl-ki`, Leuchtmaske `heg-turm-xl-glow`, getrennt mit `scripts/split-glow.mjs`):
  auf den drei XL-Sockeln, Gehäuse so groß wie der Sockel (≈ 94 m). Lädt gemeinsam 12 s (blau-weißes Licht wächst je Rohr
  vom Verschluss zur Mündung), dreht langsam (8°/s), richtet sich 1 s mit Ziellinie aus, feuert Rohr 1 – 2 – 3 im
  Abstand 0,4 s. Schnelle schwere Granate (1000, Mass Driver 653), Schaden 2 200 × Stufe, Reichweite ≈ 1,5 km. Ziele:
  Frachter, Stationen und Schiffe ab Klasse M – nicht auf Jäger. Gehäuse ein Viertel größer als der Sockel, Hülle ×15, Schild ×6.
  Effekte: kräftige Ladebeleuchtung (blau mit weißem Kern), kurz vor voll Flackern und Blitze entlang der Rohre; beim Schuss
  Mündungsblitz, blaue Ringwolke quer zum Rohr, Entladungen, Rauch; die Granate zieht eine blau glühende Schneise.
  Werte vorläufig (`XL_*`).
- **L-Zwillingskanone** (`heg-turm-l-ki`): auf den sechs L-Sockeln, Gehäuse ein Viertel größer als der Sockel (≈ 42 m).
  Elektromagnetisch unterstützte Schiffsabwehrkanone gegen Korvetten, Fregatten und Großziele. Zielvorrang: Klasse M,
  dann L/XL (auch Frachter, Stationen), Jäger nur ohne anderes Ziel. Feuert abwechselnd links – rechts alle 1,4 s ohne Salvenpause (jedes Rohr alle 2,8 s), Geschoss und
  Mündungsblitz an der jeweiligen Mündung; schnelle, geschlossene Panzerbrechergranate (800), eng begrenzter Einschlag
  ohne Garbe oder Wolke. Dreht 20°/s, Schaden 100 × Stufe, Reichweite ≈ 1,2 km, Hülle ×7, Schild ×3. Kein Rückstoß,
  keine Ladebeleuchtung. Werte vorläufig (`LG_*`).
- **Test-Schalter** im Kampf-Reiter (Entwicklung): „Test: Zerstörer der Hegemonie“ – in jeder Kampfrunde fliegt von
  Anfang an ein Zerstörer heran. Vorschau: `node scripts/kampf-vorschau.mjs bild.png --heg 900 --zoom 0.4`.

## Vorschlag Spielweise (noch nicht umgesetzt)

- Jäger in festen Formationen (Keil, Linie), die sich erst auflösen, wenn das Führungsschiff fällt.
- Feuerleitung: die Türme eines Schiffs nehmen gemeinsam ein Ziel und feuern abgestimmt – wuchtig, aber berechenbar.
- Viel Hülle, mäßige Schilde: Hüllenbrecher (Bolzen, Plasma) lohnen sich.
- Träge, reagieren langsam auf Flanken.

## Flotte (Vorschlag)

| Rolle | Länge | Bild |
|---|---|---|
| Jäger | ca. 30 m | fehlt |
| Korvette | ca. 90 m | fehlt |
| Fregatte | ca. 150 m | fehlt |
| Zerstörer | ca. 950 m | vorhanden |
| Schlachtschiff | ca. 1,8 km | später (Boss) |

## Fraktionen gegeneinander (Test-Schalter, umgesetzt)

„Test: Fraktionen gegeneinander“ im Kampf-Reiter (gilt sofort, nur zusammen mit dem Zerstörer): Die Türme der Hegemonie
nehmen auch die übrigen Gegner ins Ziel (M-Turm das nächste Ziel, L nach Vorrang, XL ab Klasse M), ihre Geschosse und
Splitter treffen sie. Die übrigen Gegner greifen die Hegemonie an, wenn sie ihnen näher ist als du (Schiffe fliegen sie an,
Türme schießen); ihre Geschosse treffen die Türme, den Rumpf erst ohne Türme. Abschüsse durch die andere Seite bringen dir
nichts. Noch nicht: Strahlen (Laser, Kyon), Raketen und Flak der übrigen Gegner wirken nur gegen dich.

## Offen

- Namen, Geschichte, Personen.
- Weitere Schiffe (Bilder), danach eigene Gegnerseite mit Wellen, Einsätzen, Menübild.
- Balance aller Türme (Schaden, Reichweite, Tempo).
