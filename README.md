# Pad16

A 16-pad sample player that runs in the browser, built to play well on an iPad. No build step, no dependencies.

## Play

- Tap or click pads, or use the keyboard: `1 2 3 4` / `Q W E R` / `A S D F` / `Z X C V`. Multi-touch works on iPad.
- **Edit** shows or hides the pad settings. Turn it off for a bigger performance grid.
- Each pad has a name, volume, pitch (±24 semitones) and a play mode:
  - **One shot** plays the whole sample on each hit
  - **Hold** plays while the pad is held down
  - **Loop** toggles a loop on and off with each hit

## Load your own samples

**From the device.** Select a pad and press **Load sample** (on iPad this opens the Files app), or drop audio files on a pad. Several files at once fill pads in order. **Reset pad** puts the built-in sound back.

**From this repo (kits).** The easiest way is the prep script, which takes any folder of samples and builds a kit that plays cleanly on iPad (needs ffmpeg: `brew install ffmpeg`):

```
node scripts/prepare-kit.mjs ~/Desktop/my-samples "Sunday Set"
```

It converts everything to 48 kHz WAV, trims silence before each hit and after each tail, leaves `[loop]` files untouched so the seam stays exact, matches levels to -1 dB peak, writes `kits/Sunday Set/`, and prints a summary with the iPad memory the kit will use. Options: `--mono` (half the memory), `--peak -3`, `--no-normalize`, `--no-trim`, `--replace` (rebuild a kit that already exists). Name the source files the same way as below.

Or build the folder by hand. Make a folder in `kits/` named after the kit and put audio files in it:

```
kits/
  Sunday Loops/
    01 Kick.wav
    02 Snare.wav
    09 Pad Swell [loop].wav
    Shaker.mp3
```

- A leading number 1–16 puts the file on that pad. Files without a number fill the remaining pads alphabetically.
- `[loop]` or `[hold]` in the file name sets the play mode. The default is one shot.
- Pads the kit doesn't fill keep the built-in drum sounds.

Push to `main` and the GitHub Action indexes the kits and redeploys. The kit then appears in the **Kit** menu. To test locally, run `node scripts/build-kits.mjs` and serve the folder (`python3 -m http.server`).

Whatever is on the pads is saved in the browser (IndexedDB), so it's still there when you come back, even offline.

Formats: anything the browser can decode. WAV, MP3, M4A/AAC, AIFF and CAF all work on iPad.

## iPad setup

1. Open the site in Safari, tap **Share → Add to Home Screen**. It then opens full screen like an app.
2. Open it once while online so it caches for offline use.
3. Sound plays through the iPad's speakers or whatever audio output is connected (headphones, interface, Bluetooth). It also plays with the mute switch on.

## Hosting

Deployed by `.github/workflows/deploy.yml`. In the repo settings, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** (one time).
