# Alte Spielstände für den Ladetest

Jede Datei wurde mit dem Code der genannten Version erzeugt (`save-<commit>.json`): Spielstart mit Seed 777,
30 Mio Cr, Module eingeplant, Miner und Transporter gekauft, zweite Station gegründet, 6 Spielstunden gespielt,
danach weitere Module eingeplant (laufender Bau im Spielstand) und – falls es die Werft schon gab – ein Schiff in
Auftrag gegeben. `tests/oldsaves.test.ts` lädt sie mit dem aktuellen Code und spielt 12 Stunden weiter.

| Datei | Version |
|---|---|
| save-96a0cb4 | erste Version |
| save-f070506 | eigene Werft, Kampagne mit Warenerklärungen |
| save-a84505e | Lager M und L (Spielstand-Version 1) |
| save-79b3e0f | Miner mit Restladung und Fallbetrachtung |
| save-ac914fb | Lieferreihenfolge, Werftvorrat |
| save-1b69d19 | Modulbau mit echtem Material (Zukauf am Markt) |
| save-533b8c7 | Kampagne mit 28 Kapiteln |
| save-99b4a1a | erstes Baulager (automatisches Umladen) |

Neue Fassung erzeugen: Version per `git worktree add <ordner> <commit>` auschecken, `node_modules` verlinken und
`scripts/gen-old-save.ts` dorthin kopieren und mit `npx tsx scripts/gen-old-save.ts <ziel.json>` ausführen.
