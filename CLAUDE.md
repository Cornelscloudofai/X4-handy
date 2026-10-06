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
- Vor jedem Commit: `npx vitest run` und `npm run e2e` – Ergebnis wirklich prüfen (Exit-Code), nicht nur die Ausgabe überfliegen.
- Bild-Prompts immer als Codeblock (```text … ```) ausgeben, damit sie per Kopieren-Knopf übernommen werden können – nicht als Zitat.
