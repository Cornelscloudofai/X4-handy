# Hinweise für die Arbeit an diesem Projekt

- Sprache: Oberfläche, Kommentare, Commits und Antworten auf Deutsch.
- **Grafik immer in hoher Qualität.** Bilder (KI-Bilder, Renderings, Hintergründe) in voller Auflösung
  speichern und einbinden – nie zum Sparen verkleinern:
  - Schiffs- und Objektbilder: `node scripts/import-sprite.mjs <bild.png> <name>` (Standard 1024 px, WebP-Qualität 0,95);
    kleinere Vorlagen bleiben in Originalgröße.
  - 3D-Renderings: `scripts/render/*.js` rendern mit 2048 px und speichern 1024 px.
  - Hintergründe: Originalauflösung, JPEG-Qualität ≥ 0,92.
  - Das Spiel wird mit getrennten Dateien gebaut (`dist/assets/…`), Bilder werden erst bei Bedarf geladen –
    Dateigröße ist daher kein Grund, Bilder zu verkleinern.
- Gezeichnet wird in voller Bildschirmauflösung (bis 3 Bildpunkte je CSS-Pixel) mit hochwertiger Bildglättung.
- **Von einem leistungsstarken Gerät ausgehen.** Alles soll einwandfrei und flüssig laufen, aber wir begrenzen uns nicht
  selbst: Schönheit und Wirkung gehen vor Sparsamkeit. Optimieren ja (z. B. Nachladen, Zwischenspeichern), aber nie auf
  Kosten von Bildqualität, Auflösung, Effekten oder Detailreichtum – keine Obergrenzen „zur Sicherheit“ für schwache Geräte.
- **Netlify (x4-sektorbau.netlify.app) spart Credits:** Jeder erfolgreiche Bau kostet 15 von 300 Credits im Monat. Netlify
  baut nur, wenn die Commit-Meldung `[live]` enthält (`scripts/netlify-ignore.sh`). `[live]` nur setzen, wenn der Nutzer
  ausdrücklich veröffentlichen will – sonst nie. Das Claude-Artifact darf weiter bei jeder Änderung aktualisiert werden.
  Keine KI-Funktionen von Netlify nutzen oder auslösen.
- Vor jedem Commit: `npx vitest run` und `npm run e2e` – Ergebnis wirklich prüfen (Exit-Code), nicht nur die Ausgabe überfliegen.
- Bild-Prompts immer als Codeblock (```text … ```) ausgeben, damit sie per Kopieren-Knopf übernommen werden können – nicht als Zitat.
- **Texte glaubwürdig, nicht generisch.** Story, Beschreibungen, Kapitel, Fundstücke: konkret und aus der Spielwelt heraus
  (Logbucheinträge, Funksprüche, Notizen, Namen, Zahlen, kleine Details). Keine Werbe- und KI-Floskeln wie „am Rand des
  Bekannten“, „voller Geheimnisse“, „ein Abenteuer erwartet dich“. Lieber nüchtern und genau als pathetisch.
