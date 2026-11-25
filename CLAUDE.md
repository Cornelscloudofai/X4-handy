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
- Gestuft testen (Ergebnis immer am Exit-Code prüfen, nicht nur die Ausgabe überfliegen):
  - Während der Arbeit: `npx tsc --noEmit -p .` und nur die betroffenen Testdateien (`npx vitest run tests/<datei>`).
  - Vor einem Commit genügen die betroffenen Testdateien. `npx vitest run` komplett nur bei Änderungen mit breiter
    Wirkung (Ausgleich und Werte, die viele Tests berühren, gemeinsame Kernteile wie Spielzustand, Speichern, Loadout,
    Gegnerverhalten) und **vor jedem `[live]`-Release**.
  - Bei Änderungen an Oberfläche, Menüs, Speichern/Laden oder Spielstart: `npm run e2e:changed` – führt nur die
    Browserprüfungen aus, die die seit dem letzten erfolgreichen Lauf geänderten Dateien betreffen (Zuordnung in
    `scripts/e2e-changed.mjs`; `-- --list` zeigt nur die Auswahl). Reine Kampfwerte und -logik ohne Oberfläche: kein e2e.
    Im Hintergrund laufen lassen und weiterarbeiten; schlägt er fehl, sofort beheben.
  - **Vor jedem `[live]`-Release immer** die volle Reihe `npm run e2e`.
  - Achtung: `npm run build` prüft auch die Tests auf Typfehler – schlägt er fehl, ist `dist/` veraltet.
- Waffen-Ausgleich messen mit `node scripts/balance.mjs` (feste Testlagen, 12 Zufallsstarts parallel auf allen Kernen,
  Mittel und Spanne, wenige Sekunden). Vorher/Nachher gepaart mit denselben Starts; Ergebnis immer mit Spanne berichten.
- Screenshots vom Kampf für den Nutzer immer mit der Zwei-Stick-Steuerung (die nutzt er meist): `node scripts/kampf-vorschau.mjs <bild.png> [--quer] [--ship …] [--weapon …]` (setzt sie selbst und hält beide Sticks gedrückt, damit sie zu sehen sind; vorher `npx vite build`).
- Bild-Prompts immer als Codeblock (```text … ```) ausgeben, damit sie per Kopieren-Knopf übernommen werden können – nicht als Zitat.
- **Texte glaubwürdig, nicht generisch.** Story, Beschreibungen, Kapitel, Fundstücke: konkret und aus der Spielwelt heraus
  (Logbucheinträge, Funksprüche, Notizen, Namen, Zahlen, kleine Details). Keine Werbe- und KI-Floskeln wie „am Rand des
  Bekannten“, „voller Geheimnisse“, „ein Abenteuer erwartet dich“. Lieber nüchtern und genau als pathetisch.
