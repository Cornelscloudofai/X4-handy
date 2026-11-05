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

## Kandidaten zum Probehören (`kd-*.wav`, gleiche Quelle und Lizenz)

Nur in der Hörprobe (Einstellungen), im Spiel noch nicht eingesetzt. Gekürzt (Bedienklänge 2 s, Schüsse 2,5 s,
Explosionen und Boss 4 s, sonst 3,5 s; 0,3 s Ausblende). Was der Spieler nicht auswählt, wird wieder entfernt.

| Datei | Paket / Original |
|---|---|
| kd-tippen-1.wav | Kpow Sounds - UI SOUNDPACKS (2015) – UI_SoundPack11_Select_v14.wav |
| kd-tippen-2.wav | G4F SFX - SFX11 - ExoInterface (2018) – G4F SFX11 - ExoInterface - Cursor Click 25.wav |
| kd-tippen-3.wav | Glitchedtones - User Interface (2018) – User Interface Click Button 25.wav |
| kd-tippen-4.wav | Sonic Bat - Sci-Fi Interface Bundle (2023) – SBsfi1_Positive Select Click 008.wav |
| kd-oeffnen-1.wav | Shapeforms Audio - Future UI (2023) – FUI Navigation Swipe-2.wav |
| kd-oeffnen-2.wav | 3maze - UI FX (2019) – future_swipe_002.wav |
| kd-oeffnen-3.wav | Rescopic Sound - User Interaction (2024) – UIMvmt_Window Open Thin 05_RSCPC_USIN.wav |
| kd-oeffnen-4.wav | Doex Studio - Qantum UI (2024) – UI_Window_MEDIUM_SlideMetal_02_CLOSED.wav |
| kd-schliessen-1.wav | Kpow Sounds - UI SOUNDPACKS (2015) – UI_SoundPack11_Back_v1.wav |
| kd-schliessen-2.wav | G4F SFX - SFX11 - ExoInterface (2018) – G4F SFX11 - ExoInterface - Window Close - Short 16.wav |
| kd-ablehnen-1.wav | SoundBits - Computer Sound FX 2.0 (2016) – CSFX-2_Menu-AccessDenied_35.wav |
| kd-ablehnen-2.wav | Cinematic Sound Design - System & UI Feedback Elements (2026) – Interface Deny Low Fat Dark.wav |
| kd-ablehnen-3.wav | David Dumais Audio - UI Menu (2020) – Access_Denied_High_DDM16.wav |
| kd-ablehnen-4.wav | Noisecreations - ARCADIA (2016) – SFX-ARCADIA_Error03.wav |
| kd-credits-1.wav | Cinematic Sound Design - UI Interaction Elements (2026) – Ting Coins.wav |
| kd-credits-2.wav | Gamemaster Audio - Retro 8Bit Sounds (2018) – retro_collect_pickup_coin_03.wav |
| kd-credits-3.wav | CB Sound Design - Essential Sounds Vol.01 Coins (2023) – coins_9.wav |
| kd-baubeginn-1.wav | Gregor Quendel - Designed Mecha (2018) – Designed Mecha - Elements - Mechanics 2.wav |
| kd-baubeginn-2.wav | BluezoneCorp - Annihilation - Mech (2023) – Bluezone_BC0287_annihilation_mech_mechanical_texture_sequence_035.wav |
| kd-baubeginn-3.wav | BluezoneCorp - Steampunk Mechanical Sounds (2023) – Bluezone_BC0282_steampunk_mechanical_gear_chain_element_start_stop_014.wav |
| kd-baubeginn-4.wav | SoundMorph - Robotic Lifeforms (2015) – mechanism_tiny_bot_layer_05.wav |
| kd-baufertig-1.wav | InspectorJ - UI - Mechanical (2019) – UI_Mechanical_Confirm_04_FX.wav |
| kd-baufertig-2.wav | Rescopic Sound - User Interaction (2024) – UIAlert_Confirm Middle 12_RSCPC_USIN.wav |
| kd-baufertig-3.wav | Gamemaster Audio - Retro 8Bit Sounds (2018) – retro_powerup_collect_11.wav |
| kd-erledigt-1.wav | Epic Stock Media - Anime Game (2026) – DSGNStngr_Power Up Bright Positive Successful Light Saturation Crash Shimmer 05_ESM_AG.wav |
| kd-erledigt-2.wav | RYK-Sounds - Retro Game SFX (2023) – power up_level up-sound 2.wav |
| kd-erledigt-3.wav | fascinatedsound - Video Game SFX Mega Pack (2019) – PowerUp01.wav |
| kd-kapitel-1.wav | Digital Rain Lab - Sci-Fi Transitions (2016) – SciFi_Transition_11.wav |
| kd-kapitel-2.wav | Bottle Rocket Fx - Impact Collection (2016) – Swell_Metallic Ring_02.wav |
| kd-kapitel-3.wav | Soundiron - Sick 6 (2016) – sick6_stinger_entropic_swell_M_13.wav |
| kd-warnung-1.wav | TheLibrarybyEmptySea - UI1 (2015) – TheLibrarybyMTC_UI_Alert_01.wav |
| kd-warnung-2.wav | Airborne Sound - Interface Accents (2018) – Accent,Interface,UI,Alert,Clean,Metallic,Double,Fast.wav |
| kd-warnung-3.wav | MatiasMacSD - Informer (2023) – DSGNTonl_Ping Cinematic Fear alert G 002_MMSD.wav |
| kd-nachricht-1.wav | Noisecreations - ARCADIA (2016) – SFX-ARCADIA_Notification01.wav |
| kd-nachricht-2.wav | Cinematic Sound Design - System & UI Feedback Elements (2026) – Interface Sci-Fi Ping Down.wav |
| kd-nachricht-3.wav | Bluezone - Scary Ambiences and Sound Effects (2016) – Bluezone-BC0217-chime-texture-011.wav |
| kd-start-1.wav | David Dumais Audio - Sci-fi Flyby Sfx Pack (2020) – Vehicle1_EngineStartUp3_Med2.wav |
| kd-start-2.wav | InspectorJ - Abstract Spaceships (2019) – AbstractSpaceship_Flyby_Ascending_A04.wav |
| kd-start-3.wav | Fox Audio Post-Production - Space Racer 2 – Turbines & Engines (2018) – PodRacer_Electronic_Startup03.wav |
| kd-start-4.wav | Bluezone Corporation - BATTLECRUISER - SPACESHIP (2018) – Bluezone_BC0240_spaceship_passby_017.wav |
| kd-andocken-1.wav | PMSFX - Foundation Series SCI-FI (2019) – PM_FSSF_DOOR_MID_9.wav |
| kd-andocken-2.wav | Epic Stock Media - HD Lock And Mechanism Sound Design Kit (2026) – MECHLtch_Click Deep Mechanism Latch Button Nearfield Thunk 02_ESM_HDLM.wav |
| kd-andocken-3.wav | Alexander Kopeikin - Sci-Fi Metal Elements HD (2016) – sci-fi metal impact, steel bulkhead hit, low 01.wav |
| kd-angenommen-1.wav | G4F SFX - SFX11 - ExoInterface (2018) – G4F SFX11 - ExoInterface - Action Confirm - Long 05.wav |
| kd-angenommen-2.wav | The Chris Alan - Analog Synthesized UI & SFX (2019) – Analog Synthesized UI - Confirm Notification 21.wav |
| kd-boss-1.wav | Cinematic Sound Design - Ultra Transitions & Impacts (2026) – Transition Braam Slow Dark Creepy.wav |
| kd-boss-2.wav | Glitchedtones - Impact (2018) – Impact - Dark Bass 05.wav |
| kd-boss-3.wav | Bottle Rocket Fx - Impact Collection (2016) – Impact_Boom_Distorted_02.wav |
| kd-boss-4.wav | 3maze - High Impact (2016) – med_dark_001.wav |
| kd-aufsammeln-1.wav | Noisecreations - ARCADIA (2016) – SFX-ARCADIA_ItemPickUp16.wav |
| kd-aufsammeln-2.wav | Epic Stock Media - Fantasy Game 2 - Sound Kit for Enchanted Realms (2026) – UIAlert_Collect Scifi Futuristic Electronic Bass Burst Sweep Heavy 04_ESM_FG2.wav |
| kd-aufsammeln-3.wav | Gamemaster Audio - Retro 8Bit Sounds (2018) – retro_collect_pickup_coin_03.wav |
| kd-niederlage-1.wav | David Dumais Audio - Sci-Fi Weapons Pack 1 (2023) – DSGNBass_Weapon Power Down 04_DDUMAIS_NONE.wav |
| kd-niederlage-2.wav | Soundreorganized - Tunturi Maxi Sound Effects Library (2016) – Tunturi_OnBoard_StartupFail_Engine2.wav |
| kd-kristall-1.wav | George Karagioules - The Source Collection SFX Pack (2016) – Wine Glass Hit Higher Pitch.wav |
| kd-kristall-2.wav | MatiasMacSD - FEEL TEXTURES VOL 1 (2016) – TextureWindChimeKeys_003.wav |
| kd-kristall-3.wav | Bluezone - Scary Ambiences and Sound Effects (2016) – Bluezone-BC0217-chime-texture-011.wav |
| kd-ventil-1.wav | Airborne Sound - Variety 1 Sound Effects (2018) – Steam Blast,Tube or Pipe,Distant.wav |
| kd-ventil-2.wav | BluezoneCorp - Demolisher - Robot (2023) – Bluezone_BC0290_demolisher_pneumatic_texture_007.wav |
| kd-ventil-3.wav | Eiravaein Works - Vaeyan I (2015) – AeroratedIcedTea,fast rise,gritty,release.M.wav |
| kd-fluss-1.wav | 344 Audio - Elemental Palette Designed Vol. 1 (2026) – WATRMisc_Water, Liquid Impact, Bubble, Sci Fi, Hit 04_344 Audio_Elemental Palette Designed Vol 1.wav |
| kd-fluss-2.wav | Alexander Kopeikin - Emotion and Magic (2026) – magic, energy flow, astonishment-001.wav |
| kd-fluss-3.wav | Eiravaein Sound - Vaeyan III (2016) – VaeyanIII,shockabsorber,broken,decompress,oil,bubbling,scuffing,flatulent.wav |
| kd-schub-1.wav | 344 Audio - Air Designed (2026) – AEROJet_Blast Off Clean_344 Audio_Air Designed.wav |
| kd-schub-2.wav | BluezoneCorp - Combat Drone (2023) – Bluezone_BC0288_combat_drone_jet_texture_sonic_boom_002.wav |
| kd-schub-3.wav | Eiravaein Sound - Burst (2017) – Burst,glass,release,bottle,spray,jet,fizz,cistern,full,stifle.wav |
| kd-tor-1.wav | RYK-Sounds - Retro Game SFX (2023) – teleporting-sound 5.wav |
| kd-tor-2.wav | Gamemaster Audio - Magic and Spell Sounds (2018) – dark_portal_wind_effect_04.wav |
| kd-tor-3.wav | Matt Script – Rise & Fall (2020) – Fade In_Sweep_fall_distortion_interference_transition_space_warp_drops_pulse_pulsing_modular_synth.wav |
| kd-steuerduese-1.wav | Fascinated Sound - Scene Shop Tool Box (2017) – Impact Nail Gun 01 Single Shot Compressed Air and Action.wav |
| kd-steuerduese-2.wav | The Sound Pack Tree - Trains (2019) – 166000 - Steam Blasts.wav |
| kd-steuerduese-3.wav | SoundMorph - STEAMPUNK WEAPONS (2018) – Steampunk Weapons - Back From The Past - set_2.wav |
| kd-container-1.wav | The Noisery - Moaning Metal (2026) – DSGNImpt_Metal Hit Thud Thump Low Ring Geofon 1_The Noisery_Moaning Metal.wav |
| kd-container-2.wav | Mechanical Wave - Foley Session 01 (2015) – Chain Metal Drop On Floor_VS 02.wav |
| kd-container-3.wav | Alexander Kopeikin - Black Metal (2016) – dry hard metal impact with rust debris 20.wav |
| kd-schuss-1.wav | BluezoneCorp - Annihilation - Mech (2023) – Bluezone_BC0287_annihilation_mech_weapon_scifi_shot_004.wav |
| kd-schuss-2.wav | BluezoneCorp - Invader - Alien Creature (2023) – Bluezone_BC0286_invader_weapon_scifi_shot_002.wav |
| kd-schuss-3.wav | BluezoneCorp - Soundwave - Robot (2023) – Bluezone_BC0284_soundwave_weapon_scifi_shot_007_02.wav |
| kd-schuss-4.wav | Cali Crazed Beats - Alien Sound Effects (2020) – Laser_Cannon_Blast_2__calicrazed.com.wav |
| kd-schuss-5.wav | Digital Rain Lab - Lethal Energies (2016) – CK_Blaster_Shot-226.wav |
| kd-schuss-6.wav | Digital Rain Lab - Lethal Energies (2016) – DS_Heavy_03_NoReverb_Shot-2.wav |
| kd-schuss-7.wav | PMSFX - Abstract Guns (2020) – PM_AG_20_3_ABSTRACT_GUNS.wav |
| kd-schuss-8.wav | PMSFX - Abstract Guns (2020) – PM_AG_2_2_ABSTRACT_GUNS.wav |
| kd-schuss-9.wav | PMSFX - Abstract Guns (2020) – PM_AG_33_3_ABSTRACT_GUNS.wav |
| kd-schuss-10.wav | PMSFX - Abstract Guns (2020) – PM_AG_9_5_ABSTRACT_GUNS.wav |
| kd-schuss-11.wav | PMSFX - Foundation Series SCI-FI vol 2 (2020) – PM_FSSF2_WEAPONS_C3_SHOT.wav |
| kd-schuss-12.wav | SmartSoundFX - Futuristic (2020) – CANNON Plasma Shot Tonal High 10.wav |
| kd-schuss-13.wav | Sound Spark LLC – Analog Synth Volume 1 Bleeps, Sweeps and Creeps (2018) – Laser-Like_Synth_Basic_Laser4_08.wav |
| kd-schuss-14.wav | SoundMorph - Future Weapons 2 (2016) – Future Weapons 2 - Source - Laser Source_3.wav |
| kd-schuss-15.wav | Unreal SFX - Battle Droid (2024) – Droid-Weapons_10.wav |
| kd-schuss-16.wav | Fascinated Sound - The Gun Locker SFX Pack (2016) – Automatic Cannon - MK44 - 03 - Single Shot with Report 03.wav |
| kd-schuss-17.wav | BluezoneCorp - Steampunk Weapon And Textures (2024) – Bluezone_BC0296_steampunk_weapon_cannon_shot_013_02.wav |
| kd-schuss-18.wav | Double Trouble Audio - Tanks and Jet (2017) – TAJ - Tank Battle Cannon Fire [XY Stereo]-001.wav |
| kd-schuss-19.wav | aXLsound - Metal Sweeteners - 192 kHz (2020) – MtSw - Designed - the shots 08.wav |
| kd-schuss-20.wav | Sound Spark LLC – Analog Synth Volume 1 Bleeps, Sweeps and Creeps (2018) – Blasts_Synth_Delayed_Oneshot_11.wav |
| kd-schuss-21.wav | SoundMorph - STEAMPUNK WEAPONS (2018) – Steampunk Weapons - Shotgun 2 - Shot - 03.wav |
| kd-schuss-22.wav | Blik Blinks - SIGNUM_ Sci-fi Cinematic SFX Pack (2016) – Signum_source_synth_impact_high-pitched_5.wav |
| kd-schuss-23.wav | SoundMorph - Future Weapons (2015) – Blaster Machine_Gun-01-Burst-03.wav |
| kd-explosion-1.wav | BluezoneCorp - Combat Drone (2023) – Bluezone_BC0288_combat_drone_weapon_explosion_004.wav |
| kd-explosion-2.wav | Lukas Tvrdon - Distant Blast (2018) – Distant Blast 17.wav |
| kd-explosion-3.wav | Lukas Tvrdon - Distant Blast (2018) – Distant Blast 26.wav |
| kd-explosion-4.wav | Epic Stock Media - Anime Game (2026) – EXPLDsgn_Explosion Small Blast Enemy Death Crunchy Boom Cartoon Noisy Crash Impact Delay 03_ESM_AG.wav |
| kd-explosion-5.wav | Olivier Girardot - Guns & Explosions (2018) – Explosion 8.wav |
| kd-explosion-6.wav | BluezoneCorp - Detonation - Explosion (2023) – Bluezone_BC0277_explosion_urban_004_02.wav |
| kd-explosion-7.wav | Gladestock Studios - Naval Warfare (2023) – GS broadside 001.wav |
| kd-explosion-8.wav | Shapeforms Audio - Sci-Fi Weapons Cyberpunk Arsenal (2023) – EXPLDsgn_Explosion Rumble Distorted_07_SFRMS_SCIWPNS.wav |
| kd-explosion-9.wav | Stefano Cremona - Explosions (2020) – FarExplosion03.wav |
| kd-explosion-10.wav | Bluezone Corporation - War Zone (Designed Explosions) (2017) – Bluezone-BC0214-beep-mine-explosion-002.wav |
| kd-explosion-11.wav | Bluezone Corporation - War Zone (Designed Explosions) (2017) – Bluezone-BC0214-beep-mine-explosion-007.wav |
| kd-explosion-12.wav | Gamemaster Audio -  Explosion Sound Pack (2017) – explosion_far_distant_02.wav |
| kd-explosion-13.wav | MatiasMacSD - THE WEAPONS - SCI-FI WEAPONS (2017) – Weapon Bomb Explosion Sci-Fi Plasma-04.wav |
