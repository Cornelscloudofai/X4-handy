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

## Weitere Kampf- und Werkzeugklänge (`sn-*.wav`, gleiche Quelle und Lizenz)

Schleifen (`*-schleife.wav`): Ausschnitt mit 0,4–0,6 s Überblendung des Endes in den Anfang, damit sie nahtlos laufen.
Lange Einzelklänge auf den Anfang gekürzt (mit 0,6 s Ausblende).

| Datei | Paket / Original | Bearbeitung |
|---|---|---|
| sn-rakete-a.wav | SoundMorph - STEAMPUNK WEAPONS (2018) – Steampunk Weapons - Rocket Launcher - Shot - 04.wav |  |
| sn-rakete-b.wav | InspectorJ - Essentials 03 Fireworks (2023) – FRWKComr_InsJ_Fireworks_Launch_Close_01-03.wav |  |
| sn-rakete-c.wav | BluezoneCorp - Detonation - Explosion (2023) – Bluezone_BC0277_weapon_smoke_grenade_launcher_003.wav |  |
| sn-treffer-a.wav | 3maze - IMPACTUS (2019) – digi_hit_008.wav |  |
| sn-treffer-b.wav | 3maze - FINAL IMPACT (2019) – metal_hit_004.wav |  |
| sn-treffer-c.wav | SoundMorph - FUTURE WEAPONS 3 (2018) – Future Weapons 3 - Crossbow -Arrow Hit 2.wav |  |
| sn-schild-a.wav | SoundMorph - FUTURE WEAPONS 3 (2018) – Future Weapons 3 - Shield_03.wav | gekürzt auf 4 s |
| sn-schild-b.wav | SoundMorph - ENERGY (2017) – Energy - defense barrier activation idle&stop.wav | gekürzt auf 4 s |
| sn-schild-c.wav | Sound Spark LLC - Electric Arcs and Energy (2020) – Electric_Arc_Reverberant_Shock_Long_05.wav |  |
| sn-funke-a.wav | Rescopic Sound - Parallax (2024) – SCIMisc_Zap Short 14_RSCPC_PX.wav |  |
| sn-funke-b.wav | Shapeforms Audio - Sci-Fi Weapons Cyberpunk Arsenal (2023) – LASRMisc_Beam Transient_04_SFRMS_SCIWPNS.wav |  |
| sn-kyon-a.wav | Blik Blinks - SIGNUM_ Sci-fi Cinematic SFX Pack (2016) – Signum_source_synth_impact_high-pitched_5.wav |  |
| sn-phase-a.wav | PMSFX - Forgotten Neons (2019) – PM_FN_Spawns_Portals_Teleports_1.wav |  |
| sn-phase-b.wav | fascinatedsound - Video Game SFX Mega Pack (2019) – Warp02.wav |  |
| sn-phase-c.wav | Rescopic Sound - Distinct Whooshes (2024) – WHSH_Pure SciFi-Whoosh Fast 03_RSCPC_DW.wav |  |
| sn-phase-d.wav | Phil Michalski - SCI-FI Mechanics (2018) – PM_SFE_WARPED_15.wav |  |
| sn-strahl-a-schleife.wav | Sound Spark LLC - Electric Arcs and Energy (2020) – Electric_Arc_Deep_Bass_Seamless_Loop_02.wav | Schleife 10 s, schon nahtlos |
| sn-strahl-b-schleife.wav | Digital Rain Lab - Lethal Energies (2016) – CK_Force_Field_Loop-32.wav | Schleife 8 s, schon nahtlos |
| sn-bergbau-a-schleife.wav | Epic Stock Media - Strange Game Ambient Loops 3 (2026) – DSGNSynth_Scifi Loop Ship Reactor Synth Layer Layered Saw Buzz_ESM_SGA3.wav | Schleife 5–13 s |
| sn-bergbau-b-schleife.wav | Bluezone Corporation - Metal Sound Effects (2018) – Bluezone_BC0231_metal_grinding_013.wav | Schleife 0,3–3,2 s |
| sn-bergbau-c-schleife.wav | Julian Ray - Background Machinery (2015) – BM Futuristic Machinery 09.wav | Schleife 0,2–3,8 s |
| sn-traktor-a-schleife.wav | 344 Audio - Electromagnetic Design (2023) – Magnetic Ambience 06.wav | Schleife 20–28 s |
| sn-traktor-b-schleife.wav | 344 Audio - Electromagnetic Design (2023) – Flowing Current 05.wav | Schleife 10–18 s |
| sn-traktor-c-schleife.wav | Spectravelers - Quantum – ElectroMagnetic Field Library (2023) – SCIMach_EMF_Toolkit_Machine_Idle_013.wav | Schleife 0,2–3,7 s |
| sn-triebwerk-a-schleife.wav | Soundbankster - The Sci-Fi Book (2016) – SF_sdb_ATMO_10_sci_fi_big_spaceship.wav | Schleife 8–16 s |
| sn-triebwerk-b-schleife.wav | Julian Ray - Background Machinery (2015) – BM Futuristic Machinery 14.wav | Schleife 0,3–6,7 s |
| sn-gestein-a.wav | PMSFX - Rocky Impacts (2020) – PM_RI_Source_53 Rocks Impact Hit Single Stone.wav |  |
| sn-gestein-b.wav | BluezoneCorp - Stone Impact (2024) – Bluezone_BC0297_stone_impact_015.wav |  |
| sn-gestein-c.wav | Alexander Kopeikin - Rocks (2016) – rock impact medium 26.wav |  |
| sn-gestein-d.wav | PMSFX - Rocky Impacts (2020) – PM_RI_Designed_7 Rocks Impact Hit Big LFE Heavy Designed.wav |  |
| sn-kristall-a.wav | 3maze - IMPACTUS (2019) – shatter_ice_001.wav |  |
| sn-kristall-b.wav | Mindful Audio - Elements - Ice (2017) – thick ice hits impacts debris bright 03.wav | gekürzt auf 3 s |
| sn-kristall-c.wav | BluezoneCorp - Broken Glass (2023) – Bluezone_BC0274_glass_impact_break_falling_debris_004.wav |  |
| sn-alarm-a.wav | Justsoundeffects - Futuristic Interface (2023) – SCIAlrm_Simple Alarm Medium 07_JSE_FI.wav | gekürzt auf 5 s |
| sn-alarm-b.wav | SoundBits - Computer Sound FX 2.0 (2016) – CSFX-2_Alarms_09.wav | gekürzt auf 5 s |
| sn-alarm-c.wav | Federico Soler Fernandez - Complex Cinematic SciFi Sounds (2023) – CCSS - Scene 012 - STEM - Mid Alarm.wav | gekürzt auf 6 s |
| sn-rakete-d.wav | RYK-Sounds - Laser Guns (2023) – Laser Rocket 7.wav | |
| sn-treffer-d.wav | RYK-Sounds - Laser Guns (2023) – hitsound 2.wav | |
