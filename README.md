# Pad16

A live rhythm-section tool for acoustic sets. One keyboard player and one guitarist, no drummer and no bass player: Pad16 covers both. It runs on an iPad (or a large iPhone) on stage with no network.

- **Perform and Edit**: a stage screen with only what is played live, and a separate place for everything else
- **16 pads** on each of two pages: one shots, hold, loops and drum-machine patterns
- **Scenes**: one button changes which pads are playing, on the bar line (Verse, Chorus, Build, whatever you name them)
- **Master tempo** with tap, time signatures (including 6/8, 9/8 and 12/8) and a count-in
- **A step sequencer** with 8 tracks and 8 levels per step: tap a step on or off, drag up or down for its level
- **Loops that snap to the tempo**: Stretch (pitch kept), Repitch (cleanest on drums) or Off
- **Quantized launch and stop**, the way a clip launcher works, with exclusive groups for seamless groove changes
- **Click** with its own bus and its own output, so it can stay out of the house mix
- **Bass**: a sub synth for the left hand, played from a keyboard over MIDI: monophonic, lowest note wins, the pedal holds
- **Ambient**: a pad that loops in any key and crossfades when the key changes
- **Mixer** with Stereo, Split and Multi-out modes, remembered for each audio device
- **MIDI** in both directions over USB and Bluetooth: notes, pedal and mod wheel in, tempo clock out
- **Songs and sets**, exported and imported as one file

There are two builds of the same code:

| Build | Where | MIDI on iPad |
| --- | --- | --- |
| Web app | GitHub Pages, installable to the home screen, works offline | No (Safari has no MIDI). Yes inside a browser that adds Web MIDI. |
| iOS app | Built with Xcode from `ios/` | Yes, through CoreMIDI |

## Play

The app opens in **Perform**. Everything on it is for playing:

- **Transport**: the green button starts and stops. Minus and plus move the tempo one beat (hold to repeat). Tap sets it by ear. Click switches the click.
- **Scenes**: the row of named buttons. Press one and, on the next bar line, its pads start and the other loops stop. Pads that are already playing carry on without restarting. A scene with no pads (Down) stops every loop and leaves the clock running. Capture saves whatever is playing now as a new scene.
- **Pads**: tap, or use a keyboard: `1 2 3 4` / `Q W E R` / `A S D F` / `Z X C V`. One-shot pads fire the moment you touch them. Loop and pattern pads wait for the next bar line (or whatever launch quantize you set) and blink while they wait; tap a waiting pad to cancel. Tap a playing loop to stop it. A pad that is sounding is lit, and its ring shows where the loop is.
- **Pages**: each song has two pages of 16 pads. The tabs above the grid, the 1 | 2 switch on smaller screens, or `[` and `]` change page. Pads on the page out of view keep playing, and a green dot says so. A pad can sit on both pages.
- **Ambient and Bass**: on and off, and a fader each. The key button changes the Ambient key for this song.
- **Song**: the arrows move through the set; the song name opens the list.
- **The octagon is Panic**: all notes off, everything stopped with a 50 ms fade.

Keys: Space starts and stops. Shift with 1 to 8 launches a scene. Arrow keys and Page Up or Page Down change song or step through scenes (Edit, Setup, Display). A Bluetooth page-turner pedal sends those keys, so it works with no setup.

**Edit** (the pencil) has five places:

| | |
| --- | --- |
| Pads | Tap a pad to select it: name, color, type, sample, tempo sync, launch and stop, group. The kit for the whole song. |
| Loops | Patterns for the step sequencer |
| Song | Set list, this song's name, key and notes, tempo and click, scenes, Ambient, Bass |
| Mix | Levels, mute, Main or Cue for each bus |
| Setup | Audio outputs, MIDI, display (theme, stage lock, pedal), backup, diagnostics |

- Pads carry a muted color by instrument. Bright green, amber and red always mean playing, waiting and stopping.
- Stage lock (Setup, Display) makes Edit a press and hold and hides Capture, so a stray touch on stage cannot change a song.
- Starting a loop, a pattern or a scene while stopped starts the transport on a downbeat.
- In 6/8, 9/8 and 12/8 the tempo can count quarter notes, the way charts print it (74 means eighth notes at 148), or the dotted-quarter pulse: Song, Tempo and click, "The tempo counts".

## Kits and samples

Drop a folder in `kits/` and push. The GitHub Action indexes it and it appears in the Kit menu (Edit, Pads). File names carry the settings:

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

`.github/workflows/deploy.yml` publishes up to three builds to one GitHub Pages site: `main` at the root, the `live-rig` branch at `/next/`, and the `v3` branch at `/v3/`, so a new build can be tried on the iPad while the root still serves the app you play today. For a preview to deploy, the `github-pages` environment has to allow its branch: Settings, Environments, github-pages, Deployment branches and tags. The three share one site, so on one device they share saved songs.

## iOS app

See [docs/INSTALL_IPAD.md](docs/INSTALL_IPAD.md). In short: `npm run build:ios`, open `ios/App/App.xcodeproj`, pick your team, run on the iPad.

## More

- [docs/NORD_STAGE_4.md](docs/NORD_STAGE_4.md): Nord settings and wiring the WIDI Master
- [docs/HARDWARE_TEST.md](docs/HARDWARE_TEST.md): what to check on the real rig
- [docs/DESIGN.md](docs/DESIGN.md): design tokens and screenshots
- [DECISIONS.md](DECISIONS.md) and [PROGRESS.md](PROGRESS.md)

Saved data lives in the browser (IndexedDB) and is written on every change. Pads from the first version of Pad16 are carried over into the first song.

License: MIT. Third-party code: Signalsmith Stretch (MIT), fflate (MIT), Capacitor (MIT), Barlow typeface (SIL Open Font License 1.1), used in every build.
