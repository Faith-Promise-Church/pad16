# Progress

Branch: `live-rig`. Never push to `main`.

## Phases

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
- Default layout: the 80 BPM shaker on pad 1 and 15 programmed patterns (tambourine, claps, four cajon loops, seven kick loops, stomp). Pattern steps now have 8 levels, and tracks can choke.

## Tests (all passing at the last commit)

- `npm run typecheck`
- `npm test`: unit tests (musical math, tags, tempo detection, sub synth note priority, patterns, MIDI clock and input with the mock backend, saved-data migration, set export and import, contrast, kit scripts)
- `npm run test:e2e`: offline render tests of the real engine in OfflineAudioContext, and smoke tests at 1024x1366, 1366x1024 and 430x932

## Not verified here

- The iOS app has never been compiled. Xcode is not installed on the Mac. `HostClock.swift`, `MidiEngine.swift`, `BleReconnector.swift` and `CueClick.swift` type-check against the macOS SDK; `AudioSessionController.swift` and `Pad16NativePlugin.swift` could not be checked.
- Everything in `docs/HARDWARE_TEST.md`.
- Signalsmith Stretch on a real iPad. It now runs in a Worker and is tested in Playwright's WebKit (the engine Safari uses), which is where it failed before. How it sounds on the shaker at 66 and 68 BPM (15 to 18 percent slower) is for ears.
- How the 6/8 shaker pattern and the 6/8 cajon loops sound. They were built by measurement.
- The preview deploy to `/next/`: blocked by the `github-pages` environment rule until `live-rig` is allowed.

## State of the Mac

- Clone at `~/Documents/Claude Code Codebase/pad16/pad16`, on `live-rig`.
- `fonts-private/` there holds the four DIN files, ignored by git (`git check-ignore` confirms).

## Exact next step

1. Allow the preview: Settings, Environments, github-pages, Deployment branches and tags, add `live-rig`. Then re-run the failed "Deploy to GitHub Pages" run for `live-rig`.
2. Install Xcode, then in the Mac clone: `git pull && npm install && npm run build:ios`, open `ios/App/App.xcodeproj`, set the team, build. Fix any compile errors in `AudioSessionController.swift` or `Pad16NativePlugin.swift`, then prove it with
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' build`.
3. Work through `docs/HARDWARE_TEST.md` on the rig and bring back the notes.
