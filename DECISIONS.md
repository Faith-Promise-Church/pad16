# Decisions

Choices made without asking, each with the reason. Newest phases at the bottom.

## Phase 1: structure and saved data

1. **The IndexedDB version stays at 1.** The brief says to upgrade the `pad16` database in place. Bumping the version would lock out the app on `main`, which opens version 1 and shares the same site (and so the same database) with the preview build. New data is written to the same `kv` store under `v2:` keys. The old keys `s0..s15`, `a0..a15` and `kit` are read once and never changed, so both builds keep working side by side.
2. **Old pads become the first song, "My pads".** Old loops ran free, so they come across with sync Off. Nothing changes in how they sound until a tempo is set.
3. **The old `index.html` stayed in place through phases 1 to 9.** The engine was built and tested first, behind a test harness, and the new interface replaced the old page in phase 10. That kept "no behavior change" true for every commit before the interface landed.
4. **BPM counts the felt beat.** In simple meters that is the denominator note. In 6/8, 9/8 and 12/8 it is the dotted quarter. MIDI clock always runs at 24 pulses per quarter note, so 6/8 at 60 sends clock for quarter = 90.
5. **Pure sample math for the stand-in sounds.** The synthesized kit is written without Web Audio so the same code makes the files in `kits/Acoustic Set/` (in Node) and the fallback sounds in the app.

## Phase 2: clock, scheduler, transport, click

6. **One tempo map, every segment starting on a bar line.** A tempo or meter change while playing is added as a new segment at the next bar line that is not already inside the 120 ms scheduling window, so nothing that is already placed has to move.
7. **The clock free-runs while stopped.** MIDI clock keeps going so the Nord stays locked. Pressing Start re-anchors the beat to "now" instead of waiting for the free-running beat. The Nord sees one clock pulse of odd length and no tempo change.
8. **Count-in is audible even when the click is off,** and it plays on the click bus so it follows the click's output.
9. **Tap tempo while playing** also lands on the next bar line, like any other tempo change.

## Phase 3: loop tempo and stretch

10. **Stretch renders in a Worker, with no audio context.** Signalsmith Stretch (MIT) ships as an audio worklet. It first ran inside an OfflineAudioContext, which works in Chrome but returns silence in Safari and on iOS (see 65). The Worker loads the same processor and drives it 128 frames at a time, so every browser runs the same code. A render that comes back silent, the wrong length or wildly off in level is thrown away and the pad stays in Repitch.
11. **The loop is rendered twice around and the second pass is kept,** so the start and end of the stretched loop have real audio on both sides and the seam is clean.
12. **Loops are re-triggered on the grid every pass** instead of using the browser's own looping. That is why they cannot drift, even across tempo changes.
13. **70 against 140 BPM.** A file that could be either (bar-length math gives both) is read as the one that puts about two onsets on each beat. The x2 and /2 buttons are one tap away.
14. **Pad pitch does not apply to tempo-synced loops,** because changing their rate would change their tempo. It still applies to one shots, hold pads and free loops.
15. **Kit loops default to Repitch,** the cleanest on drums and ready at once. Stretch is a per-pad choice.

## Phase 4: launch and stop

16. **A pad launch that starts the transport skips the count-in** unless "Count-in when a pad starts the transport" is turned on in Settings, Display. The Start button always uses the count-in.
17. **Tapping a pad that is queued to stop cancels the stop.** It mirrors "tapping a queued pad cancels the queue".
18. **Pattern pads and one shots share the Drums bus; loops have the Loops bus.**

## Phase 5: patterns

19. **A pattern remembers the meter it was written in.** In a song with a different meter it still plays at its own length; "Fit to time signature" re-grids it.
20. **Pattern tracks can use any pad's sample, any stand-in sound, or any kit file,** including kit files that have no pad.

## Phase 6: mixer and outputs

21. **The limiter is a zero-latency soft-knee curve with a hard ceiling at -1 dB,** not a look-ahead limiter. A look-ahead limiter adds about 6 ms to everything, including the sub synth, and would pull the program out of line with the click.
22. **The click and other Cue buses bypass the limiter and the master fader.** Cue has its own level.
23. **Split puts Cue on the left and Main on the right** by default; Swap sides flips it.
24. **Multi-out is shown only when the hardware reports 4 or more outputs.** If the web view then opens only 2 (the likely case in WKWebView), the app tries the native cue route. If that also fails, the reason is shown in Settings, Outputs and Split is used. In the native cue route only the click moves to the cue pair; other buses assigned to Cue stay on outputs 1 and 2.
25. **Routing is remembered per device** under the route name and channel count (app) or the chosen output (browser).

## Phase 7: sub synth and MIDI

26. **Oscillators run all the time and the envelope gates them,** so a note starts on the next audio block. The offline test measures under 5 ms from note to sound inside the engine; the rest of the 20 ms budget belongs to MIDI transport and the audio buffer, which only the rig can measure.
27. **A fallback from one held key to another is legato** (no new attack). A new key after a pedal-held note is a new attack.
28. **When MIDI drops, the sounding note rings for 1.5 seconds and then releases.**
29. **Timestamps from an added-on Web MIDI are not trusted.** If `requestMIDIAccess` is not the browser's own code (as inside a browser app that adds Web MIDI), clock is sent by a timer with a short spin and flagged "approximate", with the measured jitter in Diagnostics. Clock timing can be forced either way in Settings, MIDI.
30. **Clock offset is stored by device name,** since port ids change between sessions.
31. **Bluetooth reconnect** uses CoreBluetooth to find the remembered adapter by name and connect to it, after which CoreMIDI lists it. This needs the real WIDI Master to confirm (see HARDWARE_TEST). The Connect button always works as the fallback.

## Phase 8: tonic pad

32. **A missing key plays the nearest key that exists, pitch-shifted,** and is labeled Fallback. That covers the one-sample case in the brief and partial sets too.
33. **Files tagged `[baked]` skip the load-time crossfade.** Untagged files get one (2 seconds, or a quarter of the file if it is short).
34. **A stand-in pad set ships** (`kits/Stand-in Pad/`, one synthesized drone in C) so the tonic pad makes sound before real pads are added.

## Phase 9: songs and sets

35. **A set file carries imported audio but not kit audio.** Kits ship with the app, so both devices already have them.
36. **Importing always creates new ids,** so importing a set twice never overwrites anything.
37. **Program change selects the song at that position in the current set.**

## Phase 10: interface

38. **The transport is one 72 px row only at 1280 px and wider.** With 48 px touch targets and a 60 px BPM, everything the brief lists plus the MIDI chip, edit, lock, settings and Panic does not fit in one row on an iPad in portrait or an 11-inch iPad in landscape. Below 1280 px the song row moves under the tempo row; on phones there are three short rows.
39. **Controls use a stronger border than the 1 px hairline** (`--hairline-strong`) where the border is the only edge of a control on a raised surface, to keep 3:1. Pads and dividers use the specified hairline.
40. **The edit lock lives in the transport on tablets and in Settings, Display on phones.**
41. **DIN is never in the repo or on the public site.** The iOS build bundles it from `fonts-private/` when that folder exists; every other build uses Barlow (SIL OFL 1.1, from `@fontsource/barlow`) through the same token. Tabular figures are switched on for all numbers.

## Phase 11: samples

42. **The Acoustic Set has 17 slots and 16 pads.** Shaker accent is the one without a pad; it stays in the kit as a pattern-track sample.
43. **No third-party audio was added.** Every shipped sound is synthesized by code in this repo.

## Phase 12: iOS shell

44. **Bundle id `org.faithpromise.pad16`.** Change it in Xcode if needed.
45. **The plugin is a local Swift package** (`plugins/pad16-native`) that Capacitor wires in on `cap sync`, so the Xcode project file never needs hand edits.
46. **The native cue click writes discrete multichannel buffers** (silence on every channel except the cue pair) instead of setting a channel map on the output unit, which behaves differently across devices.
47. **Xcode is not installed on the Mac** (Command Line Tools only), so the app has not been compiled. Four of the six Swift files type-check against the macOS SDK; the two that need UIKit and Capacitor could not be checked.

## Preview

48. **No Vercel project was created.** GitHub Pages blocked the preview deploy with an environment protection rule. The brief says to name a needed repo setting instead of working around it, so the setting is named in the README and the final report: Settings, Environments, github-pages, Deployment branches and tags, add `live-rig`.

## Real samples (after the first hand-off)

49. **Justin's samples are in the public repo at his direction.** Asked whether library-sourced files should stay private like the DIN fonts, he chose the public repo.
50. **His files replace stand-ins slot by slot,** keeping the slot file names, so pads, songs and patterns pick them up with no remapping. Slots he did not supply stay as stand-ins.
51. **Stand-in sounds in patterns resolve to the Acoustic Set file of the same name.** Starter patterns therefore play the real stomp, clap and cajon without being rewritten.
52. **The cajon bass and slap picks, and the tambourine with or without head, were chosen by measurement.** All 11 cajon hits are in `kits/Cajon Slaps/` for auditioning.
53. **Pad MP3s are published untouched** (no re-encode, so no generation loss) and get their loop crossfade at load.
54. **A supplied click set is the default click sound; Built-in is one tap away** in Click settings. The choice is global. A per-song imported click sample still overrides either.
55. **Kit audio is served from the offline cache first and refreshed in the background.** Nothing on stage waits on a network. A sample replaced under the same file name is heard on the launch after the next online launch. The page itself gives the network 3 seconds before using its cached copy.
56. **The web app saves the current kit, click set and all 12 keys of the selected pad set for offline** while it is online, so a key change never needs the network.
57. **Pad low cut**: the tonic pad's high-pass is now "Low cut", first in its Tone section, 20 to 800 Hz, off by default.

## Default layout and the pattern programmer

58. **A new song opens on Justin's default layout** (shaker loop on pad 1, 15 patterns on pads 2 to 16) at 80 BPM, the tempo of the shaker and click he supplied. It is also "Default layout" in the Kit menu. Songs he already saved are not touched. Pads carried over from the first version still sit on the built-in drums.
59. **Steps hold a level from 1 to 8** instead of ghost, normal, accent, so a figure can build across a bar. Tap turns a step on or off; dragging up or down sets the level. Saved patterns are converted once (ghost 3, normal 6, accent 8), which keeps their sound.
60. **Kick loops use the Thick Kick sample** (MAMMOTH 34): it is the punchiest low hit he supplied, reaching -20 dB in 0.15 seconds. The stomp on pad 16 rotates the four FAST STOMP takes, one per bar.
61. **Tracks can choke.** A new hit cuts the previous hit on the same track with a 4 ms fade, like a real kick or a hand on a cajon. It is on for the kick and cajon tracks in the default patterns.
62. **The 80 BPM shaker stays 8 bars long** instead of being cut to a shorter loop, to keep the player's own variation. It is set to Stretch; at 80 it plays untouched.
63. **Syncopated kick, the part left open in the request ("..."):** the bar ends with a kick on the and of 4 as a pickup into the next downbeat.
64. **TRAPPY TAMBO SNARE took the Snare slot** (pad 13 of the Acoustic Set), which was still a stand-in.

## Tempo-change bug, pages, 6/8 and the set

65. **The shaker died after a tempo change because Safari rendered silence.** The stretched copy came back from the OfflineAudioContext as a buffer of zeros in WebKit (Safari, the iPad, the Web MIDI browser), took over at the next loop point and stayed cached, so nothing brought the loop back. Fixed by 10. The browser tests now also run in WebKit for the cases that have broken there.
66. **A finished stretch comes in on the next bar line**, with a 12 ms crossfade, instead of at the loop point. The shaker is 8 bars long; waiting for the loop point meant up to 24 seconds of repitched audio after a tempo change.
67. **Two pages of 16 pads per song, 32 pads in the engine.** Switching page never stops anything. A slot can link to a pad on the other page, so the shared pads of the default layout (shaker, tambourines, claps, cajon loops, build, stomp) are one pad shown twice: lit on both pages, started on one and stopped on the other. Edit view says when a slot is shared and can make it separate.
68. **Page 1 is all cajon, page 2 is the kick layout** (Justin's ask). The six cajon bass loops play the same rhythms as the six kick loops. The kick build stays on pad 15 of both pages. The low loops are one exclusive group across both pages, so a kick loop takes over from a cajon loop on the bar line.
69. **A saved song still on the first default layout, with nothing changed, moves to the two-page layout on load.** A song with any change to its pads is left as it is, with an empty page 2.
70. **6/8 tempo: the number can count quarter notes.** Justin's 6/8 songs are 74 and 76.5. Charts and MultiTracks print 6/8 that way (Great Are You Lord is listed at 72, eighth notes at 144). Per song, "The tempo counts" is quarter notes or the dotted-quarter pulse. Decision 4 still describes the clock: its beat in 6/8 is the dotted quarter (49.33 for a chart tempo of 74), and the Nord sees 74 on MIDI clock. Songs without the setting behave as before.
71. **6/8 gets its own patterns.** A 4/4 pattern in a 6/8 song lands across the bar. The 6/8 layout mirrors the 4/4 one: tambourine and claps on 4 (the backbeat), four cajon loops, six low loops on cajon bass and on kick, a six-eighth build, and the stomp.
72. **The 6/8 shaker is a pattern of single strokes cut from the 80 BPM loop**, not the loop. Stretched to fit, the loop's own accents (every quarter note) would fight the 6/8 pulse. The loop turned out to be one two-beat cell repeated, with six distinct strokes; the pattern plays the strong ones on 1 and 4, light and medium eighths between, and a soft pickup into each pulse.
73. **The set is built in and added once.** Opening the app online adds "Acoustic set" (8 songs) beside whatever is saved and opens it. It is tracked by id, so editing or deleting it sticks. This avoids moving a file onto the iPad.
74. **Song keys are major keys** as given (the pad sets are major). "I Surrender" in E uses the E major pad.

## Click, groups and color

75. **4/4 songs click with eighth-note subdivisions.** It is the default for new songs and was set once on the saved 4/4 songs that still had subdivisions off. The 6/8 songs are unchanged.
76. **Every cajon pad is group B.** The cajon bass loops moved from group C to B, in every song. One cajon part plays at a time. The kick loops and the kick build stay in group C, so a kick loop can run alongside a cajon part. This replaces the grouping in 68.
77. **Muted pad colors.** Eight desaturated colors a pad can carry as a tint and a bar along its top edge. They tell pads apart; they never show state. Playing, queued and stopping keep their saturated colors and take over the tint, and the bar stays. The default layout is colored by instrument, and saved songs got those colors once, on pads that had none. Every color is a token, in both themes, and the contrast test covers text on each tint.
78. **Changes to saved songs run once, by id** (the same list that tracks the built-in set). Each one only moves a value that is still at its old default, and a later choice by hand is never undone.

## Cajon grooves and the phone layout

79. **The cajon pads on 9 to 14 are grooves, not the bass alone.** Each keeps its kick figure on the cajon bass and adds the slap on the backbeat (2 and 4, or 4 in 6/8) and soft taps. Saved copies were replaced once, and only where the saved pattern was still the untouched first version.
80. **Phone: three rows up top and a small page switch.** The time signature shares the tempo row (the "BPM" unit label is dropped there), and the two page tabs above the grid become a 1 | 2 switch in the tools row. To make that row fit, the click toggle shows its icon and On or Off, the MIDI chip stacks its icon over On, Scan or Off, and the three tool buttons are 44 px wide. Tablets and desktops keep the wide tabs.
81. **Phone: the tab bar is pinned to the bottom row.** It had been flowing into the editor's row, which left a tab bar's height of empty space under it. Together with 80, a pad on a 393 px wide phone went from about 63 px to about 89 px.
82. **Phone pad names use the full pad width, up to three lines.** The pad type icon is hidden on phones, and the group letter steps aside while a state word (Playing, Queued, Stopping) shows. With the editor open, the song row hides and names drop to the label size so the pads stay usable.

83. **Every song in the set clicks with eighth-note subdivisions**, the two 6/8 songs included (three to the pulse). This replaces the 6/8 exception in 75. Set once on saved 6/8 songs that still had subdivisions off.
84. **The click menu on a phone: press and hold the Click button.** The tools row has no room for the separate settings button. A short tap still only switches the click. The same menu is linked from the Song tab and from the tempo sheet, so it can also be found without knowing the gesture.
85. **Deliverance (A, 72, 4/4) was added to the end of the acoustic set**, in the built-in set and once in the saved copy of it.

## Samples that fail to download

86. **A failed sample download is tried again, without a reload.** Before, one failure on a first open (weak signal, a network filter) left the pad on a stand-in or its pattern silent until the page was reloaded, which looks like "works on one phone, not on another": the first phone has every file cached from earlier visits. Now the kit list, a pad's own file, pattern samples and the click set are asked for again after 2 seconds, then 4, 8 and so on up to every 30, and at once when the device comes back online.
87. **The pad says what it is waiting for.** "Loading" while a pattern's samples download, "No sample" between tries, "Stand-in" for a loop playing its stand-in. A message appears once if anything is still missing 8 seconds after opening, and once more when it has all arrived. Settings, Diagnostics, Samples lists the files still missing.
88. **The preview's service worker reads only its own cache.** Found from "works on my phone, not on a second phone": the first version's service worker (still live on `main`) covers the preview's folder until the preview's own worker takes over, so on a phone that has the first version it stores the preview's page and samples in its cache on the first visit. The preview's worker then asked "any cache" and got those first-day copies, for good: a sample replaced under the same file name never arrived, and on a slow connection the page itself fell back to the first build that phone ever saw. The worker (cache `pad16-app-v5`) now reads its own cache only and removes its own files from `pad16-v1`. The first version's own files there are untouched. Checked with both workers running side by side in Chrome and WebKit (`tests/manual/old-app-service-worker.mjs`).
89. **Known until this branch replaces `main`:** the first version's worker deletes every other cache when it is first installed. A phone that opens the first version for the first time after using the preview loses the preview's offline copies and downloads them again when next online.
90. **A pad saved with a kit file name that has since changed takes the file now in that slot**, with that file's tempo and length. Only when the kit list is loaded and says the old name is gone.
91. **Diagnostics shows the build** (commit and time), to tell at a glance which version a device is running.

## Version 3, phase 1: Perform and Edit, scenes, every screen size

Branch `v3`, from `live-rig`. `live-rig` stays the gig build until this has been played.

92. **Two modes instead of one screen with an edit switch.** Perform holds only what is played live and opens no settings. Edit holds everything else. The test for Perform: a full set can be played from it without opening Edit. The app always opens in Perform, whatever it was showing when it closed.
93. **Edit has five destinations: Pads, Loops, Song, Mix, Setup.** The rule that sorts them: what is saved with the song is in Song, what belongs to the device is in Setup, and nothing appears twice. This replaced a settings sheet with tabs, four sheets opened from the transport (tempo, click, sub synth, tonic pad), a songs sheet, and on the phone a separate set of tabs. Settings that used to be reachable from two or three places (the click menu, for one) now have one home.
94. **Scenes.** A scene is a named list of pads that should be sounding. Launching one waits for the next bar line (or the song's launch quantize, if longer), then starts the listed loops and patterns that are not playing, stops the ones playing that are not listed, leaves alone the ones that are already playing so they do not restart, and fires listed one shots once. Up to 8 a song. A scene can also switch Ambient, Bass or the click on or off, or leave them as they are.
95. **A scene with no pads is a breakdown: it stops every loop and leaves the transport running.** Launched from a stop it does nothing, because there is nothing to stop and no reason to start the clock.
96. **Capture.** The fastest way to make a scene is to play it: start the pads for a section and press Capture. It is named for the next unused section name (Intro, Verse, Pre, Chorus, Bridge, Tag, Build, Down, Outro) and can be renamed in Song, Scenes.
97. **Scene buttons show three things.** On (filled): the pads sounding are exactly this scene. Last (outline): this was the last scene launched and pads have since been changed by hand. Queued (dashed amber, "Next bar"): waiting for the bar line. Pressing a second scene before the first lands replaces it.
98. **Starter scenes for the default layout: Intro (shaker), Verse (shaker, cajon on 1), Chorus (shaker, tambourine on 2 and 4, cajon basic), Build (shaker, tambourine, kick build), Down (nothing).** These are a guess at a useful starting point, added once to saved songs on the default layout that had no scenes. They are meant to be changed.
99. **Scenes from a pedal, the keyboard and MIDI.** Shift with 1 to 8 launches a scene. The page-turner pedal (arrow and page keys) can change song, step through scenes, or do nothing: Setup, Display. MIDI learn has Next scene, Previous scene and Scene 1 to 8.
100. **Stage lock replaces edit lock.** With it on, Edit needs a press and hold (the button fills as it is held, and a short tap says why nothing happened) and Capture is hidden. Panic stays a single tap.
101. **The strips are called Ambient and Bass everywhere** (they were "Tonic pad" and "Sub synth"). On stage they are two things to switch on and ride; the engine names stay in the code.
102. **Tempo buttons move one beat a press, and repeat when held.** Finer steps (0.1) and typing a tempo are in Song, Tempo and click.
103. **What is sounding is lit.** A playing pad lights in its own color with a green edge and glow, and a ring fills once per pass of the loop. This is the one cue taken from hardware pads and clip launchers, and it replaces the flat pad with a progress bar along its bottom edge. Muted colors still never mean state: green, amber and red do.
104. **The beat dots stay lit for the whole beat.** A glance says where the bar is; a flash only says that a beat happened.
105. **One layout helper, driven by the window size alone** (`src/ui/layout.ts`). It returns the tier (compact, medium, expanded), the arrangement (pads beside the controls or above them), the number of rows the Perform bar takes, the shape of the Ambient and Bass strips, and where the Edit tabs go. No device names: an iPad in Split View, a folding phone and a phone on its side are just window sizes. The rules are unit tested; the result is checked in a browser at 11 sizes.
106. **On a short landscape screen the Perform bar moves beside the pads.** A folding phone opened up in landscape is about 951 by 669 points. With the bar across the top its pads were about 100 points; beside the pads they are 127.
107. **Faders are kept long enough to ride.** Under an iPad's width the two channels each take a full row (a fader of 160 points or more) even though that costs pad size; two across left a fader under 100 points. Only where there is no height at all (a phone on its side, a phone in a browser with the address bar showing) do the two channels share a row, as on and off and a short fader.
108. **Smaller screens move the page switch into the bar** in Perform, so the pads get the height of the page tabs. Edit keeps the tabs above the grid on every screen, with the page names.
109. **Barlow in every build; DIN only on request.** Adobe Fonts does not license fonts for embedding in an app, and an app license for the DIN files in `fonts-private/` has not been confirmed. Barlow is the closest open face and is licensed for this (SIL OFL 1.1). The iOS build bundles DIN only when built with `PAD16_DIN=1`.
110. **The preview is at `/v3/`,** published by the workflow file on this branch. A push to `main` or `live-rig` runs their workflow files, which do not know about `/v3/`, so it disappears from the site until `v3` is pushed again. `/`, `/next/` and `/v3/` are one site, so they share saved songs on a device; the gig build keeps scenes it does not understand when it saves.
111. **Not done in this phase, on purpose:** spoken cues, the sample library browser, effects, the iOS compile. A fader that is 64 to 75 points long remains on a phone on its side and on a phone in a browser with the address bar showing.
112. **Every sound lives in one private repository, `Faith-Promise-Church/pad16-sounds`.** The kits, the ambient pad sets, the click set and the new sample library. Most of the library is licensed for our own use (Splice, That Sound) and may not be published, and this repository and its site are public. One home for all of it is simpler than deciding file by file.
113. **The app is built with the sounds inside it.** `npm run build` and `npm run build:ios` look for the sounds repository beside the app repository (`../pad16-sounds`, or wherever `PAD16_SOUNDS` points) and copy its `kits/` in. The iOS app then needs nothing set up on the device, which is what an internal tool for the campuses wants. `PAD16_SOUNDS=none` builds without them.
114. **The web version reads the private repository with an access key.** The public site cannot carry the sounds, so it asks GitHub for each file with a key entered once in Edit, Setup, Sounds (a fine-grained token with read-only access to that one repository). The key stays on the device and is never part of an exported set. A file fetched this way is kept in the browser's own cache, so it downloads once and plays offline; "Keep every sound on this device" fetches the lot. Removing the key clears what was fetched with it.
115. **A sound is always asked for by one path, `kits/...`.** The app looks beside itself first (bundled by the build, or still published with it), then asks the repository. Pads, pattern tracks, the click, the ambient pads, retries and offline saving all go through that one function (`src/engine/sounds.ts`), so nothing else had to learn where sounds come from.
116. **The library is folders of files: `kits/Library/<Category>/<file>`.** A loop carries its tempo and length in its name (`Cajon Groove 3 100bpm 2bar.wav`); anything else is a one shot. `kits/Library/meta.json` holds what a file name cannot (a note, where the sound came from, the vowel onset of a spoken word). The indexer writes the list into `kits/index.json`. A library sound on a pad is an ordinary kit reference, so sets, scenes, patterns and export needed no new format.
117. **One browser for the library, opened from where a sound is chosen:** the "Sound library" button on a pad, and "Browse the library" in a pattern track's sound list (one shots only there). Categories, a search over name, category and note, All, One shots or Loops, tap to hear, Use to load. A loop arrives with its tempo and bar count, so it follows the song at once.
118. **Hearing a sound in the browser plays it on the bus it will use** (loops on Loops, one shots on Drums). There is no separate audition bus yet; in the room, the room hears it. Turn the bus down, or browse before the doors open.
119. **The count-in is spoken.** With a count-in of 1 or 2 bars, the numbers are said over the click ("one, two, three, four"), on the click bus so they go wherever the click goes. Each word starts early by the time it takes to reach its vowel, so the vowel lands on the beat. In 6/8 it counts six when the eighth notes are slow enough to say, and the two pulses when they are not. Song, Tempo and click, "Say the numbers" switches it off for a song. Only the count-in is spoken: section names and other cue words were left out on purpose.
120. **Shown names carry no leading zeroes.** `Shaker Loop 08` on disk is "Shaker Loop 8" in the app. Files keep their names so sorting on disk still works.
121. **The kits published with the app stay where they are for now.** `kits/` in this repository still holds the five kit folders, so the web version plays with no key exactly as before. They come out of `v3` once the private path has been proven on the iPad. They would still be in this repository's history and on `main` and `live-rig`; rewriting history is a separate decision.
122. **The library was built by measurement, not by ear.** Loop tempos were solved from the exact length of each take, one shots were cut at their attack and named from their spectrum, and the That Sound picks were chosen by folder and level. Names, tempos and which sounds deserve a place need a listen.
