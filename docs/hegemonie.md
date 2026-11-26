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
  dann L/XL (auch Frachter, Stationen), Jäger nur ohne anderes Ziel. Feuert abwechselnd links – rechts alle 2 s ohne Salvenpause (jedes Rohr alle 4 s), Geschoss und
  Mündungsblitz an der jeweiligen Mündung; rote Panzerbrechergranate (800) mit Brandspur (gut von Flak und Splittern zu unterscheiden), eng begrenzter Einschlag
  ohne Garbe oder Wolke. Dreht 20°/s, Schaden 35 × Stufe, Reichweite ≈ 1,2 km, Hülle ×4, Schild ×2. Kein Rückstoß,
  keine Ladebeleuchtung. Werte vorläufig (`LG_*`).
- **Fregatte** (`heg-fregatte-ki`, Bild 793 × 1 983, Rumpf 1 889 px): ≈ 420 m – L-Sockel so groß wie beim Zerstörer.
  4 M-Zwillingsgeschütze, 2 L-Zwillingskanonen, dazu zwei L-Gatlings fest im Bug: Feuerstöße (24 Schuss, alle 0,07 s,
  dann 2,2 s Pause), Reichweite ≈ 900 m, schwenken ±0,35 rad. Rumpf direkt verwundbar (kein Schutz durch die Türme),
  Hülle ×0,6 und Schild ×0,4 des Bosswerts. Dreht den Bug zum Ziel.
- **Korvette** (`heg-korvette-ki`, Bild 763 × 2 060, Rumpf 1 967 px): ≈ 150 m. 4 M-Zwillingsgeschütze (≈ 13 m, so groß
  wie ihre Sockel), dazu vier Bugkanonen mit mittlerem Tempo (abwechselnd alle 0,3 s, Reichweite ≈ 750 m). Rumpf direkt
  verwundbar, Hülle und Schild ×0,25 des Bosswerts. Dreht den Bug zum Ziel.
  Schiffsdaten (Sockel, Mündungen, Werte) in `HEG_SHIPS` in `src/minigames/shooter.ts`.
- **Jäger** (`heg-jaeger-ki`, ≈ 30 m, S): zwei Laser-Repeater im Bug mit sehr hoher Feuerrate (angelehnt an ein schnelles
  MG: abwechselnd links/rechts alle 0,06 s, leichte rote Geschosse, Reichweite ≈ 430 px). Fliegen **nur in Staffeln** als
  sauberes Dreieck: 6 (3 Reihen), 10 (4) oder 15 (5). Der Staffelführer an der Spitze fliegt den Angriff (Anflug –
  Durchziehen – Ausholen in einem Bogen – neuer Anflug), alle halten ihren Platz und feuern im Anflug gebündelt auf
  dasselbe Ziel. Fällt der Führer, übernimmt das nächste Schiff (die Plätze rücken auf). Werte `HJ_*`.
- **Eigene Gegnerfraktion** „Hegemonie-Vorstoß“ in allen Kampfeinsätzen (außer Nest und Überfall) und im Endlos-Modus,
  Kulisse „Aufmarschgebiet“ (stahlblauer Nebel, Gasriese, Wracks). Wellen: Stufe 1 eine Staffel (6), dann mehr und größere
  Staffeln je Stufe (Stufe 5: 15 + 10 + 6 und mehr), ab der zweiten Welle Korvetten (ab Stufe 2), Fregatten (ab Stufe 3
  oder mit starkem Schiff); in der letzten Welle der Zerstörer (Stufe 1 mit einem Jäger: eine Fregatte). Zusammenstellung
  vorläufig (`hegWave`).
- **Test-Schalter** im Kampf-Reiter (Entwicklung, auch in Runden gegen andere Fraktionen): „Test: Hegemonie“ – Aus,
  Staffel (10), Korvette, Fregatte, Zerstörer oder Verband (Zerstörer, Fregatte, zwei Korvetten, eine Staffel aus 6); fliegen in jeder Kampfrunde von Anfang an heran. Vorschau:
  `node scripts/kampf-vorschau.mjs bild.png --heg 900 --heg-typ f --zoom 0.4`.

## Vorschlag Spielweise (noch nicht umgesetzt)

- Jäger in festen Formationen (Keil, Linie), die sich erst auflösen, wenn das Führungsschiff fällt.
- Feuerleitung: die Türme eines Schiffs nehmen gemeinsam ein Ziel und feuern abgestimmt – wuchtig, aber berechenbar.
- Viel Hülle, mäßige Schilde: Hüllenbrecher (Bolzen, Plasma) lohnen sich.
- Träge, reagieren langsam auf Flanken.

## Flotte (Vorschlag)

| Rolle | Länge | Bild |
|---|---|---|
| Jäger | ca. 30 m | vorhanden |
| Korvette | ca. 150 m | vorhanden |
| Fregatte | ca. 420 m | vorhanden |
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
- Eigenes Menübild und eigene Klänge; Balance der Wellen.
- Balance aller Türme (Schaden, Reichweite, Tempo).
