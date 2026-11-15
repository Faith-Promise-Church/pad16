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

10. **Stretch renders in an OfflineAudioContext, not a Worker.** Signalsmith Stretch (MIT) ships as a Web Audio node. Running it inside an offline context renders on the audio rendering thread, off the page thread and never during playback, which is what the brief wanted from a Worker. It is verified in Chrome (the 32-bar alignment test uses it). It is not verified on iOS Safari from here; if it fails there the pad stays in Repitch, shows "Repitch" on the pad, and says so in Edit view.
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
