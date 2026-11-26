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

## Im Spiel umgesetzt

- **Zerstörer** (`heg-zerstoerer-ki`, Original in `grafik-vorrat/hegemonie/`): etwa 950 m – aus den M-Sockeln
  abgeleitet, die genauso groß sind wie die der Klapperschlange (1,82 % bzw. 1,75 % der Rumpflänge).
  Sockel im Bild (793 × 1 983 px): 3 XL auf der Mittelachse, 6 L an den Seiten, 10 M in fünf Paaren
  (`HEG_Z_*` in `src/minigames/shooter.ts`). Vorerst nur die M-Sockel bestückt.
  Viel Hülle (×1,5 des Bosswerts), mäßiger Schild (×0,6).
- **Zwillingsgeschütz M** (`heg-turm-zwilling-ki`): Drehsockel so groß wie der M-Sockel im Bild (≈ 17 m), etwa wie die
  M-Türme von Dragon und Cobra (15 m). (Die Klapperschlange hat 41 m große M-Türme – größer als alle anderen.)
  Feuer: Stoß – Stoß – Pause (je Stoß ein Schuss aus jedem Rohr). Splittergranate: zerlegt sich bei 85 % der Entfernung
  zum Vorhaltepunkt in 8 Splitter im Kegel ±10°, die nach vorn weiterfliegen. Gegen Jäger voll, M ein Drittel, L kaum.
  Werte vorläufig (`SPLIT_*`).
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

## Offen

- Namen, Geschichte, Personen.
- Weitere Schiffe (Bilder), danach eigene Gegnerseite mit Wellen, Einsätzen, Menübild.
- L- und XL-Geschütze (schwere Schiffsartillerie), Rückstoß der Rohre (Turmbild in Teilen), Balance.
