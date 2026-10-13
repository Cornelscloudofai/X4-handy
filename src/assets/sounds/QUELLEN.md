# Klangaufnahmen

Alle Aufnahmen in diesem Ordner (`es-*.wav`) stammen aus dem Open-Source-Weltraumspiel **Endless Sky**
(github.com/endless-sky/endless-sky, Ordner `sounds/`). Laut dessen Lizenzdatei (`copyright`, Abschnitt
„Files: sounds/*“) sind diese Klänge **gemeinfrei (public domain)** – sie basieren auf gemeinfreien Aufnahmen
von freesound.org. Übernommen wurden ausschließlich Dateien ohne abweichende Lizenz (keine CC-BY/CC-BY-SA).

| Datei | Original |
|---|---|
| es-puls.wav | pulse.wav |
| es-bolzen.wav | repeater.wav |
| es-splitter.wav | culverin.wav |
| es-plasma.wav | plasma discharger.wav |
| es-neutron.wav | gatling.wav |
| es-tau.wav | piercer.wav |
| es-thermal.wav | firestorm.wav |
| es-boson.wav | fusion blast.wav |
| es-strahl-schleife.wav | laser~.wav |
| es-gegner.wav | blaster.wav |
| es-rakete.wav | sidewinder.wav (freesound.org, NHMWretched, gemeinfrei) |
| es-explosion-1 … 4.wav | explosion tiny/small/medium/large.wav |
| es-explosion-5.wav | final explosion small.wav |
| es-explosion-boss.wav | final explosion large.wav |
| es-treffer.wav | bludgeon impact.wav |
| es-huelle.wav | missile hit.wav (freesound.org, Nbs Dark, gemeinfrei) |
| es-schild.wav | ion impact.wav |
| es-alarm.wav | alarm.wav |
| es-gestein.wav | asteroid crunch small.wav (freesound.org, AlanCat, gemeinfrei) |
| es-kristall-bruch.wav | crunch.wav |
| es-bergbaulaser-schleife.wav | mining laser~.wav |
| es-nachbrenner.wav | afterburner~.wav |
| es-triebwerk-schleife.wav | impulse engine~.wav |
| es-start.wav | takeoff.wav |
| es-landung.wav | landing.wav |
| es-traktorstrahl.wav | tractor beam~.wav |

Übernommen mit `node scripts/import-sound.mjs <datei> <name> [loop]`: verlustfrei als WAV (16 Bit, 44,1 kHz),
Spitze auf −1 dBFS normalisiert; Einzelklänge ohne Stille am Ende, Schleifen unverändert (nahtlos).
