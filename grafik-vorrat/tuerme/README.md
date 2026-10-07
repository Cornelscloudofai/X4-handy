# Turmbilder für später

Diese Split-Turmbilder (KI, 1024 px) werden im Spiel gerade nicht gebraucht und liegen deshalb außerhalb von
`src/assets/sprites/` – so werden sie nicht mitgebaut und nicht geladen. Zum Verwenden die Datei zurück nach
`src/assets/sprites/` verschieben und die passende Zeile unten in `TURRET_ART` (`src/render/shipArt.ts`) eintragen.

Werte: gemessener Rotton der Panzerplatten (für den Farbabgleich mit dem Schiffsrumpf), Drehpunkt (Mitte des
runden Sockels, Anteile des Bilds) und Sockeldurchmesser (Anteil der Bildbreite).

- Dunkle / weinrote Gruppe: passt zu keinem bisherigen Schiff (Reserve für dunkelrote Schiffe).
- `neutron-mittel` (drei Läufe): Alternative zur Gatling der Cobra.
- `boson-orange`: Steinlook, zwischen hell und mittel.
- FLAK, Lenkraketen und schwere L-Türme (`puls-l`, `energie-l`): für später (z. B. Rattlesnake).

```ts
{ name: 'split-turm-puls-dunkel-ki', type: 'puls', rgb: [115, 31, 34], px: 0.5, py: 0.585, d: 0.64 },
{ name: 'split-turm-neutron-mittel-ki', type: 'neutron', rgb: [162, 63, 46], px: 0.5, py: 0.605, d: 0.63 },
{ name: 'split-turm-neutron-dunkel-ki', type: 'neutron', rgb: [112, 52, 42], px: 0.5, py: 0.615, d: 0.67 },
{ name: 'split-turm-tau-dunkel-ki', type: 'tau', rgb: [101, 46, 41], px: 0.5, py: 0.573, d: 0.72 },
{ name: 'split-turm-plasma-dunkel-ki', type: 'plasma', rgb: [110, 48, 41], px: 0.5, py: 0.6, d: 0.7 },
{ name: 'split-turm-plasma-dunkel2-ki', type: 'plasma', rgb: [91, 42, 38], px: 0.395, py: 0.594, d: 0.46 },
{ name: 'split-turm-plasma-dunkel3-ki', type: 'plasma', rgb: [84, 39, 32], px: 0.5, py: 0.72, d: 0.33 },
{ name: 'split-turm-boson-dunkel-ki', type: 'boson', rgb: [104, 55, 48], px: 0.5, py: 0.692, d: 0.52 },
{ name: 'split-turm-boson-orange-ki', type: 'boson', rgb: [155, 64, 37], px: 0.5, py: 0.614, d: 0.54 },
{ name: 'split-turm-flak-mittel-ki', type: 'flak', rgb: [142, 66, 44], px: 0.5, py: 0.58, d: 0.6 },
{ name: 'split-turm-lenkrakete-mittel-ki', type: 'lenkrakete', rgb: [142, 62, 40], px: 0.48, py: 0.72, d: 0.45 },
{ name: 'split-turm-puls-l-mittel-ki', type: 'puls-l', rgb: [164, 66, 41], px: 0.5, py: 0.55, d: 0.7 },
{ name: 'split-turm-energie-l-mittel-ki', type: 'energie-l', rgb: [150, 63, 30], px: 0.5, py: 0.6, d: 0.42 },
```
