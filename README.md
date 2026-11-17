# Pad16

A live rhythm-section tool for acoustic sets. One keyboard player and one guitarist, no drummer and no bass player: Pad16 covers both. It runs on an iPad (or a large iPhone) on stage with no network.

- **16 pads**: one shots, hold, loops and drum-machine patterns
- **Master tempo** with tap, time signatures (including 6/8, 9/8 and 12/8) and a count-in
- **A step sequencer** with 8 tracks and 8 levels per step: tap a step on or off, drag up or down for its level
- **Loops that snap to the tempo**: Stretch (pitch kept), Repitch (cleanest on drums) or Off
- **Quantized launch and stop**, the way a clip launcher works, with exclusive groups for seamless groove changes
- **Click** with its own bus and its own output, so it can stay out of the house mix
- **Sub synth** for left-hand bass, played from a keyboard over MIDI: monophonic, lowest note wins, the pedal holds
- **Tonic pad** that loops in any key and crossfades when the key changes
- **Mixer** with Stereo, Split and Multi-out modes, remembered for each audio device
- **MIDI** in both directions over USB and Bluetooth: notes, pedal and mod wheel in, tempo clock out
- **Songs and sets**, exported and imported as one file

There are two builds of the same code:

| Build | Where | MIDI on iPad |
| --- | --- | --- |
| Web app | GitHub Pages, installable to the home screen, works offline | No (Safari has no MIDI). Yes inside a browser that adds Web MIDI. |
| iOS app | Built with Xcode from `ios/` | Yes, through CoreMIDI |

## Play

- Tap pads, or use a keyboard: `1 2 3 4` / `Q W E R` / `A S D F` / `Z X C V`. Space starts and stops.
- Each song has two pages of 16 pads. The tabs above the grid (or `[` and `]`) switch pages. Pads on the page out of view keep playing, and a green dot on its tab says so. A pad can sit on both pages: start it on one, stop it on the other.
- One-shot pads fire the moment you touch them. Loop and pattern pads wait for the next bar line (or whatever launch quantize you set), and blink while they wait. Tap a waiting pad to cancel.
- Tap a playing loop to stop it. Each pad chooses how: now, on the next boundary, at the end of the loop, or with a fade.
- Starting a loop or pattern while stopped starts the transport on a downbeat.
- On a phone, press and hold the Click button for the click settings (subdivisions, sound, levels). They are also in the Song tab.
- Pads carry a muted color by instrument. Bright green, amber and red always mean playing, waiting and stopping.
- The pencil opens Edit view for the selected pad, where its color can be changed. The lock stops accidental edits on stage.
- The octagon is Panic: all notes off, everything stopped with a 50 ms fade.
- In 6/8, 9/8 and 12/8 the tempo can count quarter notes, the way charts print it (74 means eighth notes at 148), or the dotted-quarter pulse. Tempo sheet, "The tempo counts".
- Arrow keys and Page Up or Page Down move between songs. A Bluetooth page-turner pedal sends those keys, so it works with no setup.

## Kits and samples

Drop a folder in `kits/` and push. The GitHub Action indexes it and it appears in the Kit menu. File names carry the settings:

```
kits/
  Sunday Set/
    1 Stomp.wav
    2 Clap.wav
    9 Groove [loop] [92bpm] [4bars].wav
    10 Shaker [loop] [group:a].wav
  Warm Pads/               a pad set: every file named by key
    Pad C.wav
    Pad Db.wav
  My Click/                a click set
    Click Accent.wav
    Click Beat.wav
    Click Sub.wav
```

See [SAMPLES.md](SAMPLES.md) for the full convention, the prep script, pad sets and a recording guide.

## Develop

Needs Node 22.18 or newer.

```
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # offline render tests and smoke tests (Playwright, needs Chrome or `npx playwright install chromium`)
npm run test:all     # typecheck, unit tests, browser tests
npm run build        # indexes kits and builds dist/
```

Layout: `src/engine/` (clock, scheduler, transport, loops, stretch, patterns, click, sub synth, tonic pad, mixer), `src/midi/`, `src/store/`, `src/ui/`, `src/native/` (JavaScript side of the iOS plugin), `plugins/pad16-native/` (Swift), `ios/` (Xcode project), `tests/`.

The engine takes any `BaseAudioContext`, so the tests run the real engine inside `OfflineAudioContext` and measure the output sample by sample.

## Deploy and preview

`.github/workflows/deploy.yml` publishes two builds to one GitHub Pages site: `main` at the root and the `live-rig` branch at `/next/`, so a new build can be tried on the iPad while the root still serves the app you play today. For the preview to deploy, the `github-pages` environment has to allow the `live-rig` branch: **Settings, Environments, github-pages, Deployment branches and tags, add `live-rig`**.

## iOS app

See [docs/INSTALL_IPAD.md](docs/INSTALL_IPAD.md). In short: `npm run build:ios`, open `ios/App/App.xcodeproj`, pick your team, run on the iPad.

## More

- [docs/NORD_STAGE_4.md](docs/NORD_STAGE_4.md): Nord settings and wiring the WIDI Master
- [docs/HARDWARE_TEST.md](docs/HARDWARE_TEST.md): what to check on the real rig
- [docs/DESIGN.md](docs/DESIGN.md): design tokens and screenshots
- [DECISIONS.md](DECISIONS.md) and [PROGRESS.md](PROGRESS.md)

Saved data lives in the browser (IndexedDB) and is written on every change. Pads from the first version of Pad16 are carried over into the first song.

License: MIT. Third-party code: Signalsmith Stretch (MIT), fflate (MIT), Capacitor (MIT), Barlow typeface (SIL Open Font License 1.1).
