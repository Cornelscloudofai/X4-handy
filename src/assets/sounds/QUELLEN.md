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

## Waffen, Explosionen und Einschläge (`sn-*.wav`)

Aus den **Sonniss GDC Game Audio Bundles** (2015–2026; Spiegel auf archive.org, Einträge
`sonniss-gdc-<Jahr>-game-audio-bundle-normalized`). Lizenz der Bundles: lizenzfrei, auch kommerziell, ohne
Namensnennung in beliebig vielen eigenen Projekten nutzbar; nicht als eigene Klangbibliothek weitergeben oder verkaufen.
Übernommen wie oben, zusätzlich: Vorlauf vor dem ersten Ausschlag abgeschnitten, Originalabtastrate behalten (meist 96 kHz).

| Datei | Paket / Original |
|---|---|
| sn-puls-a.wav | Rescopic Sound - Sci-Fi Energy Weapons (2024) – SCIWeap_Shot Pulse YR 05_RSCPC_SFEW.wav |
| sn-puls-b.wav | MatiasMacSD - THE WEAPONS - SCI-FI WEAPONS (2017) – Weapon Shot Blaster-06.wav |
| sn-puls-c.wav | BluezoneCorp - Sci Fi Weapon (2024) – Bluezone_BC0295_sci_fi_weapon_gun_shot_008.wav |
| sn-bolzen-a.wav | Shapeforms Audio - Sci-Fi Weapons Cyberpunk Arsenal (2023) – GUNAuto_RPU1 Fire_02_SFRMS_SCIWPNS.wav |
| sn-bolzen-b.wav | David Dumais Audio - Futuristic Guns Sound FX Pack 3 (2020) – OtherGuns_Rifle_4.wav |
| sn-bolzen-c.wav | SoundMorph - FUTURE WEAPONS 3 (2018) – Future Weapons 3 - Assault Rifle - Shot Single 4.wav |
| sn-schrot-a.wav | Shapeforms Audio - Sci-Fi Weapons Cyberpunk Arsenal (2023) – GUNAuto_Sci Fi Shotgun Burst_04_SFRMS_SCIWPNS.wav |
| sn-schrot-b.wav | SoundMorph - Future Weapons 2 (2016) – Future Weapons 2 - Energy Gun - shot_single_2.wav |
| sn-plasma-a.wav | Gamemaster Audio - Sci-Fi Sounds and Sci-Fi Weapons (2018) – sci-fi_weapon_blaster_laser_boom_zap_08.wav |
| sn-plasma-b.wav | Async Audio - Sci-Fi Blaster (2020) – Big Blast 4.wav |
| sn-neutron-a.wav | SoundMorph - Future Weapons (2015) – Alliance-AssaultRifle_05-Single_Shot-04.wav |
| sn-neutron-b.wav | SoundMorph - Future Weapons (2015) – Resistance-AssaultRifle_03-Single_Shot-04.wav |
| sn-tau-a.wav | David Dumais Audio - Sci-Fi Weapons Pack 1 (2023) – SCIWeap_Heavyweapon12 Shot 04_DDUMAIS_NONE.wav |
| sn-tau-b.wav | David Dumais Audio - Futuristic Guns Sound FX Pack 3 (2020) – HeavyGun_Experimental_3.wav |
| sn-thermal-a.wav | PMSFX - SCI-FI GunnerySCI-FI Gunnery (2020) – PM_SFG_VOL1_WEAPON_4_4_GUN_GUNSHOT_FUTURISTIC.wav |
| sn-thermal-b.wav | PMSFX - SCI-FI GunnerySCI-FI Gunnery (2020) – PM_SFG_VOL1_WEAPON_8_2_GUN_GUNSHOT_FUTURISTIC.wav |
| sn-boson-a.wav | BluezoneCorp - Sci Fi Weapon (2024) – Bluezone_BC0295_sci_fi_weapon_cannon_shot_002.wav |
| sn-boson-b.wav | Bluezone - Tank - Explosion Sound Effects (2020) – Bluezone_BC0271_tank_artillery_cannon_shot_012.wav |
| sn-schwer-a.wav | PMSFX - SCI-FI GunnerySCI-FI Gunnery (2020) – PM_SFG_VOL2_WEAPON_15_5_GUN_GUNSHOT_FUTURISTIC.wav |
| sn-schwer-b.wav | PMSFX - SCI-FI GunnerySCI-FI Gunnery (2020) – PM_SFG_VOL2_WEAPON_41_6_GUN_GUNSHOT_FUTURISTIC.wav |
| sn-gegner-a.wav | Async Audio - Sci-Fi Blaster (2020) – Blast Laser 2.wav |
| sn-gegner-b.wav | Async Audio - Sci-Fi Blaster (2020) – Blast Laser 4.wav |
| sn-gegner-c.wav | Async Audio - Sci-Fi Blaster (2020) – Recoil Blast 2.wav |
| sn-expl-s-a.wav | Gamemaster Audio -  Explosion Sound Pack (2017) – explosion_large_no_tail_03.wav |
| sn-expl-s-b.wav | BluezoneCorp - Detonation - Explosion (2023) – Bluezone_BC0277_explosion_mortar_002_01.wav |
| sn-expl-s-c.wav | SoundMorph - FUTURE WEAPONS 3 (2018) – Future Weapons 3 - Grenade Launcher 2 - Hit 2.wav |
| sn-expl-m-a.wav | DavidDumais - Explosion SFX Pack (2024) – EXPLReal_Medium Realistic Explosion 15_DDUMAIS_NONE.wav |
| sn-expl-m-b.wav | Gamemaster Audio -  Explosion Sound Pack (2017) – explosion_med_long_tail_01.wav |
| sn-expl-m-c.wav | Gamemaster Audio -  Explosion Sound Pack (2017) – explosion_large_08.wav |
| sn-expl-l-a.wav | Gamemaster Audio - Guns, Bullets and Explosions (2018) – explosion_large_07.wav |
| sn-expl-l-b.wav | Bluezone - Tank - Explosion Sound Effects (2020) – Bluezone_BC0271_explosion_outdoors_large_005.wav |
| sn-expl-l-c.wav | Stefano Cremona - Explosions (2020) – DeepExplosion02.wav |
| sn-expl-boss-a.wav | Stefano Cremona - Explosions (2020) – BigExplosion02.wav |
| sn-expl-boss-b.wav | DavidDumais - Explosion SFX Pack (2024) – EXPLDsgn_Nuclear Explosion 07_DDUMAIS_NONE.wav |
| sn-huelle-a.wav | RYK-Sounds - Laser Guns (2023) – heavy hit.wav |
| sn-huelle-b.wav | Gladestock Studios - Naval Warfare (2023) – GS cannonball impact 005.wav |
| sn-huelle-c.wav | 344 Audio - Epic Impacts Vol. 1 (2023) – Impact 021.wav |
