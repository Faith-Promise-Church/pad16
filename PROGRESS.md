# Progress

Branch: `v3` (from `live-rig`). Never push to `main`. `live-rig` is the gig build and is left alone until v3 has been played.

## Version 3

| Phase | What | State |
| --- | --- | --- |
| 1. Structure | Perform and Edit modes, five Edit destinations, scenes, layouts for iPad, folding phone and phone | Done on `v3`. Not yet played on a device. |
| 2. Sound | Sample library and its browser, spoken count-in, private home for the sounds. Then effects (reverb, delay, tape) | Library, browser and count-in done on `v3`. Effects not started. |
| 3. Ship | TestFlight internal build for iPad, iPhone and the folding iPhone | Not started. Needs Xcode. |
| Track 0 | First compile of the iOS app on the Mac | Blocked: the Mac needs macOS 26.6 or newer and about 60 GB free for Xcode 27.1 |

Phase 1, in short (decisions 92 to 111):

- Perform: start and stop, tempo with one-beat buttons, tap, click, bar and beat, song and next song, scene row, 16 pads, Ambient and Bass (on, off, fader), panic. Opens no settings.
- Edit: Pads, Loops, Song, Mix, Setup. Per-song settings in Song, per-device settings in Setup, each once.
- Scenes: up to 8 a song, launched on the bar line, Capture, rename, color, reorder, pedal, keyboard and MIDI.
- Layout picked from the window size: iPad both ways, Split View, a folding phone opened both ways, phones both ways.
- Pads light while sounding and show loop position as a ring. Barlow in every build.
- Preview at `/v3/` once the `github-pages` environment allows the branch `v3`.

Phase 2 so far (decisions 112 to 122):

- A private repository, `Faith-Promise-Church/pad16-sounds`, is the home of every sound: the five kit folders and a library of 350 files in 15 categories (cajon, shaker, tambourine, hand drums, Latin percussion, kicks, snares, claps and snaps, hats and cymbals, toms, drum machines, lo-fi, transitions, clicks, the spoken count-in).
- The build copies the sounds in when the sounds repository sits beside this one, so the iOS app carries them. The web version reads them with an access key entered once in Edit, Setup, Sounds, and keeps what it fetches.
- Sound library browser on every pad and in every pattern track: categories, search, hear, use. Loops arrive with tempo and length.
- Spoken count-in over the click, with a switch per song.
- Still to do in this phase: effects, and the content rows still open (brush sounds and grooves, conga and bongo patterns, 6/8 shaker and tambourine, 808 snare, rim and cowbell, djembe bass, vinyl crackle).

## Earlier work (the live rig)



| # | Phase | State |
| --- | --- | --- |
| 1 | Modules, Vite, tests, data migration | Done |
| 2 | Clock, scheduler, transport, click | Done |
| 3 | Loop tempo detection, sync modes, offline stretch | Done |
| 4 | Quantized launch and stop, pad states, exclusive groups | Done |
| 5 | Pattern sequencer | Done |
| 6 | Mixer, buses, output modes | Done (Multi-out and the native cue route need the real interface) |
| 7 | Sub synth, mock and Web MIDI backends | Done |
| 8 | Tonic pad player | Done |
| 9 | Songs, sets, export and import | Done |
| 10 | Design tokens, components, stage UI for iPad and iPhone | Done |
| 11 | Sample library and docs | Done |
| 12 | Capacitor shell and native plugin | Written, not compiled (no Xcode on the Mac) |

## Since the first hand-off

- Preview is live at `/next/` (the github-pages environment now allows `live-rig`).
- Justin's samples are in: Acoustic Set (real stomp, thick kick, clap, tambourines, cajon, snap, shaker loop), Cajon Slaps (11 hits to audition), Justin Click (click set), and two pad sets in all 12 major keys.
- Click sound switch (Built-in or a click set), pad low cut, offline saving of pad files, patterns use real samples.
- Fixed: a tempo change no longer kills a stretched loop in Safari. Stretch moved to a Worker; a finished stretch comes in on the next bar line.
- Two pad pages per song with shared pads. Page 1 all cajon, page 2 kick.
- 6/8: tempo counted in quarter notes (chart tempo), a full 6/8 layout, a shaker pattern cut from the loop.
- Built-in set "Acoustic set": 8 songs with keys, tempos and meters.
- Fixed: on a phone that has the first version, the preview kept serving first-day copies of its page and samples. Diagnostics shows the build.
- Failed sample downloads retry by themselves; pads show Loading or No sample; Diagnostics lists missing files.
- Eighth-note click on the 6/8 songs too. Click menu reachable on a phone (press and hold Click, or from the Song tab or tempo sheet). Deliverance added to the set.
- Cajon pads 9 to 14 are full grooves on the kick figures. Phone layout: time signature in the tempo row, a small page switch, bigger pads with readable names.
- Eighth-note click on the 4/4 songs, every cajon pad in group B, muted pad colors (by instrument, editable per pad).
- Default layout: the 80 BPM shaker on pad 1 and 15 programmed patterns (tambourine, claps, four cajon loops, seven kick loops, stomp). Pattern steps now have 8 levels, and tracks can choke.

## Tests (all passing at the last commit)

- `npm run typecheck`
- `npm test`: unit tests (musical math, tags, tempo detection, sub synth note priority, patterns, MIDI clock and input with the mock backend, saved-data migration including scenes, set export and import, contrast, layout rules, kit scripts)
- `npm run test:e2e`: offline render tests of the real engine in OfflineAudioContext (a scene starts, stops and keeps pads on one bar line), and browser tests: play at 1024x1366, 1366x1024 and 430x932; the Perform and Edit layout at 11 window sizes; scenes; stage lock; each Edit destination. The layout, scene and Perform tests also run in WebKit, the engine Safari and the iOS app use.

## Not verified here

- Version 3 on any real device. Everything in it was built and checked in desktop Chrome at each device's point size. Touch feel, fader length under a thumb, legibility under stage light and the safe areas are for the iPad and the phone: see section 9 of `docs/HARDWARE_TEST.md`.
- The folding iPhone layout. Its sizes are Apple's published points; it needs the iOS build made with the SDK that knows the device.
- The starter scenes are a guess (decision 98).
- The iOS app has never been compiled. Xcode is not installed on the Mac. `HostClock.swift`, `MidiEngine.swift`, `BleReconnector.swift` and `CueClick.swift` type-check against the macOS SDK; `AudioSessionController.swift` and `Pad16NativePlugin.swift` could not be checked.
- The library by ear. Every loop tempo, one shot name and pick was made by measurement (decision 122).
- The spoken count-in on a real device, and in the iOS app when the click is sent to the cue route natively: the words go to the web click bus, which has not been checked against that route.
- The access key against the real private repository. The browser tests use a stand-in that answers the way GitHub does.
- Everything in `docs/HARDWARE_TEST.md`.
- Signalsmith Stretch on a real iPad. It now runs in a Worker and is tested in Playwright's WebKit (the engine Safari uses), which is where it failed before. How it sounds on the shaker at 66 and 68 BPM (15 to 18 percent slower) is for ears.
- How the 6/8 shaker pattern and the 6/8 cajon loops sound. They were built by measurement.
- The preview deploy to `/next/`: blocked by the `github-pages` environment rule until `live-rig` is allowed.

## State of the Mac

- Clone at `~/Documents/Claude Code Codebase/pad16/pad16`, on `live-rig`, three commits behind GitHub when last looked at. Version 3 was built in a separate clone and pushed; nothing on the Mac was changed.
- To get it: `git fetch && git checkout v3` (and `git pull` on `live-rig` to catch that branch up).
- `fonts-private/` there holds the four DIN files, ignored by git. They are no longer used unless a build asks for them (decision 109).
- macOS 26.3.1, about 34 GB free, no Xcode.

## Exact next step

1. Allow the preview: GitHub, Settings, Environments, github-pages, Deployment branches and tags, add `v3`. Then re-run the "Deploy to GitHub Pages" run for `v3`. The preview is then at `/v3/`.
2. Make an access key for the sounds: GitHub, Settings, Developer settings, Fine-grained tokens. Resource owner Faith-Promise-Church, only the repository `pad16-sounds`, Contents read-only. Enter it on the iPad in Edit, Setup, Sounds.
3. Listen through the library and say what is misnamed, at the wrong tempo, or not worth keeping.
4. Play a set from Perform on the iPad and work through sections 9 and 10 of `docs/HARDWARE_TEST.md`. Change the starter scenes to the real ones.
5. On the Mac, clone the sounds beside the app so local and iOS builds carry them: in `~/Documents/Claude Code Codebase/pad16`, `git clone https://github.com/Faith-Promise-Church/pad16-sounds`.
6. For the iOS build: update the Mac to macOS 26.6 or newer, free about 60 GB, install Xcode 27.1. Then in the Mac clone: `git checkout v3 && npm install && npm run build:ios`, open `ios/App/App.xcodeproj`, set the team, build.
7. Effects (reverb, delay, tape), then the open content rows.
