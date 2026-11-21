# Design

The target is a piece of professional stage hardware: matte, quiet, readable from a metre away under stage light. Bright color carries state and nothing else. The one thing borrowed from hardware pads is light: a pad that is sounding is lit.

Everything below is defined once in [`src/ui/tokens.css`](../src/ui/tokens.css). Components in [`src/ui/app.css`](../src/ui/app.css) use the tokens and never name a raw color, size, radius or duration.

## Tokens

### Color

| Token | Dark (default) | Daylight | Use |
| --- | --- | --- | --- |
| `--bg` | `#0B0C0E` | `#FFFFFF` | Page |
| `--surface` | `#15171A` | `#F3F4F6` | Pads, bars, sheets |
| `--raised` | `#1E2125` | `#E6E8EC` | Controls |
| `--hairline` | `#2A2E33` | `#C5CAD1` | 1 px borders and dividers |
| `--hairline-strong` | `#747B84` | `#6B727B` | Borders that are a control's only edge (3:1) |
| `--text` | `#F2F3F5` | `#0B0C0E` | Text |
| `--text-2` | `#9AA1A9` | `#474D55` | Secondary text, labels |
| `--playing` | `#3DDC84` | `#0A6B33` | Playing, on |
| `--queued` | `#FFB020` | `#7A4E00` | Queued to start (blinks on the beat) |
| `--stopping` | `#FF5A4D` | `#B3231A` | Queued to stop, mute, danger |
| `--cue` | `#4DA3FF` | `#0A56B0` | Click and cue |
| `--select` | `#FFFFFF` | `#0B0C0E` | Selection outline |
| `--meter-ok`, `--meter-warn`, `--meter-clip` | green, amber, red | darkened | Meters |
| `--pad-sand` | `#C2A878` | `#9A7B3F` | Pad color |
| `--pad-clay` | `#B8805F` | `#9A5A38` | Pad color |
| `--pad-rose` | `#B47A86` | `#95505F` | Pad color |
| `--pad-plum` | `#8E7AA8` | `#6A5390` | Pad color |
| `--pad-slate` | `#6F87A8` | `#456594` | Pad color |
| `--pad-teal` | `#5E9C9A` | `#2F7775` | Pad color |
| `--pad-sage` | `#7FA07A` | `#4E7A48` | Pad color |
| `--pad-stone` | `#8C9199` | `#666C75` | Pad color |

Pad colors are muted on purpose. They tell pads apart (by instrument in the default layout) and never show state: a colored pad is tinted at `--tint-pad` (20%, 22% in daylight) with a bar of the full color along its top edge. A pad that is sounding lights up in its own color (`--tint-pad-lit`, 34%, 26% in daylight) and takes a green border, a green ring and a soft green glow, so green still means playing and the pad still reads as itself. Queued and stopping take over the tint and border; the bar stays. Scene buttons carry the same eight colors the same way.

State is never shown by color alone. A playing pad is lit, has a ring that fills once per pass and the word "Playing". A queued pad has a dashed border and the word "Queued". A stopping pad says "Stopping". On a phone a pad has room for the ring or the word, not both: playing keeps the ring, stopping keeps the word. A scene that is on is filled solid and says On; one that is waiting has a dashed border and says Next bar. Toggles say On or Off. Bus routing says Main or Cue.

Contrast is checked by a unit test (`tests/unit/contrast.test.ts`) that reads the token file: text and secondary text against every surface, each state color against every surface, text on a pad tinted with each state color, text on a pad lit in each pad color, names and numbers on tinted scene buttons, and labels on filled buttons all hold 4.5:1 in both themes; outlines, control borders and the ring on a lit pad hold 3:1.

### Type

One family: **Barlow** (SIL Open Font License 1.1, self-hosted from `@fontsource/barlow`) in Light, Regular, Medium, Semibold and Bold, in every build. It is the open face closest to DIN, and its license allows it inside an app. DIN can still be bundled into the iOS build on request (`PAD16_DIN=1`, from the untracked `fonts-private/` folder), which needs an app license from its foundry; an Adobe Fonts subscription does not cover that. Tabular figures are on everywhere, so counters never shift.

| Token | iPad | iPhone | Weight | Use |
| --- | --- | --- | --- | --- |
| `--fs-bpm` | 64 px | 44 px | Light | BPM readout (44 px wherever the Perform bar is three rows) |
| `--fs-scene` | 20 px | 16 px | Semibold | Scene names |
| `--fs-barbeat` | 28 px | 22 px | Medium | Bar and beat, time signature, current note |
| `--fs-title` | 22 px | 20 px | Semibold | Song name, sheet and editor titles |
| `--fs-pad` | 17 px | 14 px | Semibold | Pad names |
| `--fs-value` | 17 px | 16 px | Regular | Control values, buttons (Medium) |
| `--fs-label` | 12 px | 12 px | Medium | Small labels, uppercase, letter spacing 0.06em |

Nothing is smaller than 12 px.

### Space, shape, motion

| Token | Value | Use |
| --- | --- | --- |
| `--u` | 8 px | The spacing unit |
| `--touch` | 48 px | Minimum touch target |
| `--touch-min` | 44 px | The smallest a control may be, where a phone row has to fit |
| `--h-bar` | 88 px (64 on iPhone) | One row of the Perform bar |
| `--h-scene` | 64 px (48 on small screens) | A scene button |
| `--w-rail` | 340 px | The least room the controls keep beside the pads |
| `--w-nav`, `--w-pane` | 208 px, 760 px | Section list and reading width in Edit |
| `--ring`, `--ring-w` | 26 px, 4 px (20 and 3 on iPhone) | Loop position ring |
| `--r-pad` | 14 px | Pads, channel strips, sheets |
| `--r-ctl` | 10 px | Controls, scene buttons |
| `--hair` | 1 px | Hairline |
| `--stroke` | 1.5 px | Icon stroke |
| `--outline` | 2 px | Selection and focus outline |
| `--dur` / `--ease` | 120 ms ease | The only transition; 0 ms with reduced motion |
| `--tint` | 14% (16% in daylight) | State color mixed into a pad or toggle |
| `--tint-pad-lit` | 34% (26% in daylight) | A sounding pad lit in its own color |
| `--sheen` | 5% (0% in daylight) | The faint light at the top of a pad |
| `--glow` | 30% (22% in daylight) | Green glow around what is on: sounding pads, the transport, Ambient and Bass |

Motion is used only where it informs: the beat dots, the queued blink on pads and scenes, the loop ring, and the fill on a press-and-hold button. With reduced motion the queued blink holds steady.

## Components

- **Pad**: rounded rectangle with a hairline edge and a faint light at its top, like a rubber pad under a lamp. Name top left, state word bottom left, exclusive group letter bottom right. While it sounds it is lit in its own color with a green edge and glow, and a ring top right fills once per pass of the loop. In Edit the pad type icon sits where the ring goes (one shot, hold, loop, pattern) and the waveform shows.
- **Scene button**: number, name, state. Tinted and edged like a pad. On: filled solid, the brightest thing in the row. Last launched, after pads were changed by hand: an outline. Waiting for the bar line: dashed amber, blinking on the beat.
- **Beat dots**: one per beat of the bar; the current beat stays lit and the downbeat is brighter. Hidden where a bar has more than 6 beats on a small screen; the bar and beat number is always there.
- **Channel strip** (Ambient, Bass): an on and off button, a readout (the key, or the note being played) and a level fader. Upright beside the pads, flat under them.
- **Fader, stepper, segmented switch, toggle**: custom, sized for thumbs. There are no native range inputs or select menus anywhere. Double-tap a fader to reset it. Hold a stepper or a tempo button to repeat.
- **Press-and-hold button**: fills as it is held. Used for Edit when stage lock is on.
- **Pickers** open as bottom sheets.
- **Icons**: one inline SVG set on a 24 px grid with a 1.5 px stroke. No emoji.
- **Copy**: sentence case on buttons, uppercase only on small labels, plain verbs, no leading zeroes.
- **Identity**: the app icon is a 4x4 grid with one lit pad (`scripts/make-icons.mjs`).

## Two modes

**Perform** is the stage screen. It holds only what is played live: start and stop, tempo with a button for one beat down and up, tap, click on and off, bar and beat, the song and the next one, the scene row, the 16 pads, Ambient and Bass (on, off, level), and panic. Nothing on it changes how a song is built. Two things open a list to choose from: the song name (jump to a song) and the Ambient key. The app always opens here.

**Edit** is everything else, in five destinations. A setting has exactly one home.

| Destination | What is there |
| --- | --- |
| Pads | The grid and the editor for the selected pad; the kit for the whole song |
| Loops | Patterns: new, open in the sequencer, duplicate, delete |
| Song | Set list, This song (name, key, notes), Tempo and click, Scenes, Ambient, Bass. Everything saved with the song. |
| Mix | The mixer, Main and Cue, cue level |
| Setup | Audio, MIDI, Display (theme, stage lock, pedal), Backup, Diagnostics. Everything that belongs to the device. |

**Stage lock** (Setup, Display) makes Edit a press and hold and hides Capture.

## Layout

The window size alone picks the layout (`src/ui/layout.ts`, pinned by `tests/unit/layout.test.ts`), so an iPad in Split View, a folding phone and a phone on its side each get one that fits, with no device names in the code.

| Value | Rule | Effect |
| --- | --- | --- |
| Tier | compact under 600 wide or 500 tall; medium under 1000 wide or 700 tall; otherwise expanded | Type scale, spacing, where the page switch goes |
| Arrangement | side when the window is at least 1.15 times wider than tall, otherwise stack | Pads beside the controls, or above them |
| Perform bar | 1 row from 1180 wide; 2 rows below that; 3 rows on compact, and on any landscape window under 700 tall, where the bar moves beside the pads | Pads get the full height on short landscape screens |
| Strips | upright beside the pads where there is height; wide (two across) under them on an iPad; rows (one channel each) on anything narrower; pair (on, off and level only, sharing a row) on a phone on its side or under 800 tall | A fader is at least 160 px long, except in pair |
| Edit tabs | in the top bar from 900 wide; along the bottom below that; icons only on a phone on its side | |

| Screen | Size (points) | Tier | Arrangement | Bar | Pad |
| --- | --- | --- | --- | --- | --- |
| iPad 13, landscape | 1366 x 1024 | expanded | side | 1 row | 203 |
| iPad 13, portrait | 1024 x 1366 | expanded | stack | 2 rows | 228 |
| iPad 11, landscape | 1194 x 834 | expanded | side | 1 row | 156 |
| Folding phone open, landscape | 951 x 669 | medium | side | 3 rows, beside the pads | 127 |
| Folding phone open, portrait | 669 x 951 | medium | stack | 2 rows | 124 |
| Phone | 393 x 852 | compact | stack | 3 rows | 88 |
| Phone on its side | 852 x 393 | compact | side | 3 rows, beside the pads | 88 |

A browser test (`layout:` in `tests/e2e/smoke.spec.ts`) opens 11 window sizes with 8 scenes, the most a song can hold, and checks that every Perform control is on screen, at least 44 px, and overlaps nothing; that the pads are square; and that every Edit destination shows its own content.

## Screens

Each view, dark then daylight. Captured by `scripts/make-screens.mjs` from the built-in set on its default layout: the Chorus scene on, Ambient, Bass and the click on. Three of the Perform shots catch a scene change in flight (Build waiting for the bar line).

### Perform

| | Dark | Daylight |
| --- | --- | --- |
| iPad landscape | ![](screens/perform-landscape-dark.png) | ![](screens/perform-landscape-light.png) |
| iPad portrait | ![](screens/perform-portrait-dark.png) | ![](screens/perform-portrait-light.png) |
| Folding phone open, landscape | ![](screens/perform-fold-landscape-dark.png) | ![](screens/perform-fold-landscape-light.png) |
| Folding phone open, portrait | ![](screens/perform-fold-portrait-dark.png) | ![](screens/perform-fold-portrait-light.png) |
| Phone | ![](screens/perform-phone-dark.png) | ![](screens/perform-phone-light.png) |
| Phone on its side | ![](screens/perform-phone-landscape-dark.png) | ![](screens/perform-phone-landscape-light.png) |

### Edit, Pads

| | Dark | Daylight |
| --- | --- | --- |
| iPad landscape | ![](screens/edit-pads-landscape-dark.png) | ![](screens/edit-pads-landscape-light.png) |
| iPad portrait | ![](screens/edit-pads-portrait-dark.png) | ![](screens/edit-pads-portrait-light.png) |
| Folding phone open, portrait | ![](screens/edit-pads-fold-portrait-dark.png) | ![](screens/edit-pads-fold-portrait-light.png) |
| Phone | ![](screens/edit-pads-phone-dark.png) | ![](screens/edit-pads-phone-light.png) |
| Pattern sequencer | ![](screens/sequencer-landscape-dark.png) | ![](screens/sequencer-landscape-light.png) |
| Sound library, iPad landscape | ![](screens/library-landscape-dark.png) | ![](screens/library-landscape-light.png) |
| Sound library, iPad portrait | ![](screens/library-portrait-dark.png) | ![](screens/library-portrait-light.png) |
| Sound library, phone | ![](screens/library-phone-dark.png) | ![](screens/library-phone-light.png) |

The sound library is one sheet, opened from wherever a sound is being chosen. Categories run in a row that scrolls sideways, each with its count. A row is two targets: the left part plays the sound (and stops it), the button on the right loads it. Loops are marked and show their tempo and length; one shots show their length. It remembers the category and search it was last left on.

### Edit, Loops

| | Dark | Daylight |
| --- | --- | --- |
| iPad landscape | ![](screens/edit-loops-landscape-dark.png) | ![](screens/edit-loops-landscape-light.png) |

### Edit, Song

| Section | Dark | Daylight |
| --- | --- | --- |
| Set list | ![](screens/song-set-list-landscape-dark.png) | ![](screens/song-set-list-landscape-light.png) |
| This song | ![](screens/song-this-song-landscape-dark.png) | ![](screens/song-this-song-landscape-light.png) |
| Tempo and click | ![](screens/song-tempo-landscape-dark.png) | ![](screens/song-tempo-landscape-light.png) |
| Tempo and click, phone | ![](screens/song-tempo-phone-dark.png) | ![](screens/song-tempo-phone-light.png) |
| Scenes | ![](screens/song-scenes-landscape-dark.png) | ![](screens/song-scenes-landscape-light.png) |
| Scenes, phone | ![](screens/song-scenes-phone-dark.png) | ![](screens/song-scenes-phone-light.png) |
| Scene editor | ![](screens/scene-editor-landscape-dark.png) | ![](screens/scene-editor-landscape-light.png) |
| Ambient | ![](screens/song-ambient-landscape-dark.png) | ![](screens/song-ambient-landscape-light.png) |
| Bass | ![](screens/song-bass-landscape-dark.png) | ![](screens/song-bass-landscape-light.png) |

### Edit, Mix

| | Dark | Daylight |
| --- | --- | --- |
| iPad landscape | ![](screens/edit-mix-landscape-dark.png) | ![](screens/edit-mix-landscape-light.png) |
| iPad portrait | ![](screens/edit-mix-portrait-dark.png) | ![](screens/edit-mix-portrait-light.png) |
| Phone | ![](screens/edit-mix-phone-dark.png) | ![](screens/edit-mix-phone-light.png) |

### Edit, Setup

| Section | Dark | Daylight |
| --- | --- | --- |
| Audio | ![](screens/setup-audio-landscape-dark.png) | ![](screens/setup-audio-landscape-light.png) |
| Sounds (the web version, before a key is entered) | ![](screens/setup-sounds-landscape-dark.png) | ![](screens/setup-sounds-landscape-light.png) |
| MIDI | ![](screens/setup-midi-landscape-dark.png) | ![](screens/setup-midi-landscape-light.png) |
| Display | ![](screens/setup-display-landscape-dark.png) | ![](screens/setup-display-landscape-light.png) |
| Backup | ![](screens/setup-backup-landscape-dark.png) | ![](screens/setup-backup-landscape-light.png) |
| Diagnostics | ![](screens/setup-diagnostics-landscape-dark.png) | ![](screens/setup-diagnostics-landscape-light.png) |

## Review against the brief

Checked on the screenshots above:

- Perform holds only live controls, and a full song can be played from it without opening Edit: yes.
- One typeface, fixed-width digits, nothing under 12 px: yes.
- State paired with a shape or word: yes (dashed border and "Queued", ring and "Playing", "Stopping", On and Next bar on scenes, On and Off on toggles, Main and Cue on buses). On a phone a playing pad shows the ring without the word.
- No native range inputs or select menus; pickers are bottom sheets: yes.
- Touch targets: 48 px, and never under 44 px where a phone row has to fit. Checked by the layout test on 11 window sizes.
- Each setting appears once: per-song settings in Song, per-device settings in Setup.

Changed from the first design, on purpose:

- Pads were flat with no gradient and no shadow. They now carry a faint top light and a soft drop, and glow while sounding. This is the cue taken from hardware pads and clip launchers: what is sounding is lit.
- The progress bar along a pad's bottom edge is now a ring, which reads at a glance from further away.
- Radii went from 12 and 8 px to 14 and 10 px.
- The three fixed bands (72 px transport, 96 px strip) are gone: the bar and the strips change shape with the window.

Known gaps:

- The folding phone sizes are Apple's published point sizes laid out in a desktop browser. Nothing here has run on the device, and filling its inner screen needs the iOS build made with the SDK that knows it.
- On a phone in a browser with the address bar showing (about 393 x 660), the pads are 66 px, long names break mid-word and the two faders are 64 px long. Installed to the home screen or as the app, the same phone gets 88 px pads and 167 px faders.
- On a phone on its side the two faders are 75 px long. There is no height for a second row.
