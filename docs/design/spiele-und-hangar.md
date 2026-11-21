# Konzept: Minispiele und Hangar neu ordnen

Stand: Entwurf zur Abstimmung, noch nicht umgesetzt.

## Wie es heute ist

- **Einstieg:** Menü → „Minispiele“ öffnet ein Fenster mit drei Reitern: Spiele, Täglich, Kampf.
- **Spiele-Reiter:**
  - Oben stehen die Schwierigkeit 1–5 für *alle* Spiele zugleich und die Musik-Effekte.
  - Darunter kommen neun Zeilen. Antippen startet sofort.
  - Gesperrte Stufen sieht man erst, wenn man sie oben auswählt.
- **Täglich-Reiter:** Hier stehen die Tagesaufgaben und Herausforderungen (Endlos, Leitungskette).
- **Kampf-Reiter:** Er mischt sechs verschiedene Dinge:
  - das eigene Schiff (Sprung in den Hangar)
  - die Einsätze
  - die Steuerung
  - die Anzeige über den Gegnern
  - das Größenverhältnis
  - Entwicklungswerkzeuge (Gegnerstärke, Nebel-Test) und die alte Ausrüstungsstufe
- **Geleitschutz:** Der Geleitschutz gegen Piraten, Xenon und Kha'ak steht im Spiele-Reiter, die übrigen Einsätze im Kampf-Reiter.
- **Hangar:** Er ist nur über Kampf → „Dein Schiff“ erreichbar. Dort gibt es Ausrüstung und Werkstatt (Mods). Bauart und Darstellung des Jägers liegen in einem eigenen Fenster („Dein Jäger“).

Probleme: Zusammengehöriges ist verstreut (Kampf an drei Stellen), Einstellungen und Inhalte sind vermischt, die Stufe
gilt global statt je Spiel, und der Hangar ist schwer zu finden, obwohl er für den Kampf zentral ist.

## Leitidee

Eine **Einsatzzentrale** mit drei klar getrennten Bereichen – *Arbeit*, *Kampf*, *Hangar* – und darüber eine Leiste
**Heute**. Jedes Spiel hat eine eigene **Spielseite** (Stufe, Modus, Rekorde, Start). Einstellungen wandern in die
Einstellungen. Höchstens zwei Ebenen: Zentrale → Seite → (Start). Zurück führt immer dorthin, wo man herkam.

```text
Einsatzzentrale                         ★ 87   ◆ 42 Modteile
┌───────────────────────────────────────────────┐
│ HEUTE   [Erzader · Stufe 3 · Reiche Ader] [Kampf: Xenon · Nebel] [Kette 4/7] →
├───────────────────────────────────────────────┤
│ [ ARBEIT ]          [ KAMPF ]          [ HANGAR ]
│  6 Spiele ★ 41/90    9 Wege ★ 36/...    Cobra · Fregatte
└───────────────────────────────────────────────┘
```

## 1. Heute (oben, waagerecht wischbar)

- Karten für die sieben **Tagesaufgaben**, darunter **Herausforderungen** (Endlos-Rekorde, Leitungskette).
- Jede Karte zeigt Spiel, Stufe, Besonderheit, Belohnung (Modteile) und ob schon erledigt.
- Antippen öffnet direkt den Startbildschirm der Aufgabe (keine Zwischenseite).
- Damit entfällt der Reiter „Täglich“.

## 2. Arbeit – die sechs Wirtschaftsspiele

Raster aus großen Kacheln mit dem vorhandenen Bild: Störung beheben, Reiche Erzader, Gasströme, Frachtraum,
Superhighway, Orbit-Andocken. Auf jeder Kachel: Sterne gesamt (x/15) und ein Fortschrittsstreifen über die fünf Stufen.

**Spielseite** (nach Antippen):
- Kopfbild, ein Satz worum es geht, „So spielt man“ (aufklappbar, mit dem Steuerungstutorial).
- **Stufenleiste 1–5 je Spiel**:
  - Jede Stufe zeigt ihre Sterne und ihren Rekord.
  - Gesperrte Stufen zeigen das Schloss und „noch 3 ★“.
  - Gewählt ist die höchste freie Stufe ohne drei Sterne. Das ist der nächste sinnvolle Schritt.
- **Modus:** Normal · Kette bzw. Endlos (wo vorhanden). Die Tagesaufgabe erscheint hier als Hinweis, falls sie zu diesem Spiel gehört.
- **Abzeichen** des Spiels als kleine Reihe (erreicht / offen).
- Großer Knopf **Starten**.

## 3. Kampf – alles an einem Ort

Oben die **Schiffskarte**:
- Bild deines Schiffs, Klasse, die drei wichtigsten Werte (Feuerkraft, Hülle + Schild, Tempo)
- Knopf **Im Hangar ändern**

Darunter drei Gruppen:

1. **Geleitschutz** (der heutige Hauptkampf): drei Kacheln Piraten · Xenon · Kha'ak, jeweils mit Sternen.
2. **Einsätze**: Station verteidigen, Konvoi, Flucht, Bergung, Überfall, Nest. Je Einsatz eine Karte mit den
   möglichen Gegnerseiten als Knöpfe, wie heute, aber mit eigenem Bild statt Textzeile.
3. **Endlos**: je Gegnerseite eine Zeile mit dem Wellenrekord.

Antippen führt auf dieselbe Art **Spielseite** wie bei Arbeit (Stufe je Kampf, Modus, Rekorde, Start). Zusätzlich zeigt
die Seite die **Lagebeschreibung** (Schauplatz, Gegner, Besonderheit) und das gewählte Schiff mit einem Hinweis, wenn es
für die Stufe zu schwach ist („Empfohlen: Kampfwert ab …“).

Aus dem Kampf-Reiter **heraus** wandern:
- Steuerung, Anzeige über den Gegnern, Größenverhältnis → **Einstellungen → Kampf** (und wie heute im Pausenmenü).
- Gegnerstärke, Nebel-Test und die alte Ausrüstungsstufe → **Einstellungen → Entwicklung**. Diesen Abschnitt kann man
  später ausblenden.

## 4. Hangar – Schiffe aussuchen und ausbauen

Ein eigener Bereich, erreichbar aus der Zentrale, von der Schiffskarte im Kampf, aus jeder Kampf-Spielseite und nach
einer Runde („Ausrüstung anpassen“). Die Hangar-Bühne mit dem Schiff auf der Plattform bleibt das Herzstück. Oben
stehen vier Reiter, die Werteleiste bleibt immer sichtbar:

| Reiter | Inhalt |
| --- | --- |
| **Schiffe** | Galerie nach Klasse (S · M · L · XL), wischbar wie heute; je Schiff Rolle, Kampfwert, Länge. Schiffe aus deiner Flotte im Sektor tragen ein Abzeichen „im Sektor“. |
| **Ausrüstung** | Die Plaketten am Schiff (Waffen, Raketen, Schild, Türme, Staffel) wie heute, Schublade mit Karten. |
| **Werkstatt** | Mod-Sockel, Modteile, Zerlegen – wie heute, nur als gleichrangiger Reiter. |
| **Aussehen** | Bauart (Split/Argon) und Darstellung (KI-Bild, gerendert, gezeichnet) – das bisherige Fenster „Dein Jäger“. |

Ergänzungen:
- **Sätze speichern**: je Schiff bis zu drei Ausrüstungen merken (z. B. „Gegen Kha'ak“, „Raketen“), mit einem Tipp
  wechseln.
- **Vergleichen**: Beim Halten einer Karte in der Schublade zeigt die Werteleiste die Änderung, bevor man einbaut. Das gibt es
  teilweise schon, es soll aber überall gelten.
- **Einbauen kostet nichts, Mods kosten Teile.** Das steht sichtbar am Kopf: „◆ 42 Modteile“.
- **Probeflug**: Knopf „Im Kampf ausprobieren“ startet eine kurze Übungsrunde (Stufe 1, ohne Wertung).

## 5. Wege aus der Spielwelt

- **Vorfälle** und **Auftragsspiele** aus dem Sektor („Selbst übernehmen“) öffnen den Startbildschirm direkt, wie heute.
- Fliegt ein Großkampfschiff aus dem Sektor mit, zeigt der Startbildschirm dieses Schiff. Der Hangar-Knopf führt dann in eine
  **schreibgeschützte** Ansicht dieses Schiffs (Ausrüstung kommt aus dem Sektor).
- Nach einer Runde: „Nochmal“, „Andere Stufe“ (Spielseite) und „Zur Zentrale“. Beim Kampf zusätzlich „Ausrüstung anpassen“.

## 6. Einheitliche Bausteine

- **Spielseite**: eine Vorlage für alle neun Spiele und alle Einsätze. Gleiche Reihenfolge: Bild → Stufe → Modus →
  Rekorde/Abzeichen → Start.
- **Stufenleiste**: ein Baustein, der auch im Pausen- und Ergebnisbildschirm vorkommt.
- **Kopfzeile der Zentrale**: Sterne gesamt und Modteile. Antippen erklärt, wofür man sie bekommt.

## 7. Reihenfolge der Umsetzung

1. Einstellungen aufräumen: Kampf-Einstellungen und Entwicklung aus dem Kampf-Reiter in die Einstellungen.
2. Spielseite mit Stufe je Spiel einführen (Arbeit und Geleitschutz), globale Stufe entfernen.
3. Zentrale mit Heute-Leiste und den drei Bereichen; Kampf-Bereich mit Geleitschutz, Einsätzen, Endlos.
4. Hangar mit vier Reitern (Aussehen aus dem eigenen Fenster übernehmen), Einstieg von überall.
5. Ergänzungen: Sätze speichern, Probeflug, Empfehlung „zu schwach“.

Jeder Schritt ist für sich spielbar; bestehende Spielstände, Rekorde und Sterne bleiben unverändert.

## Offene Fragen

- Name der Zentrale: „Einsatzzentrale“, „Simulator“ oder „Flugdeck“?
- Soll der Hangar zusätzlich direkt in der unteren Leiste der Karte erreichbar sein (z. B. statt „Planer“ oder über
  das Menü-Schild)?
- Sollen Schiffe für den Kampf frei wählbar bleiben oder nur solche, die man im Sektor besitzt bzw. freigespielt hat?
