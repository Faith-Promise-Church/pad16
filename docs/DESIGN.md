# Design

The target is a piece of professional stage hardware: flat, matte, quiet, readable from a metre away under stage light. Color carries state and nothing else.

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

On a phone the page tabs become a small 1 | 2 switch in the tools row and the pads take the full width (see decisions 80 to 82).

Pad colors are muted on purpose. They tell pads apart (by instrument in the default layout) and never show state: a colored pad is tinted at `--tint-pad` (20%, 22% in daylight) with a bar of the full color along its top edge. A state color takes over the tint and border; the bar stays.

State is never shown by color alone. A playing pad is tinted, has a brighter border, a progress bar and the word "Playing". A queued pad has a dashed border and the word "Queued". Toggles say On or Off. Bus routing says Main or Cue.

Contrast is checked by a unit test (`tests/unit/contrast.test.ts`) that reads the token file: text and secondary text against every surface, each state color against every surface, text on a pad tinted with each state color, and labels on filled buttons all hold 4.5:1 in both themes; outlines and control borders hold 3:1.

### Type

One family: **DIN** in Light, Regular, Medium and Bold. DIN is a commercial font, so it is bundled only in the iOS build, from the untracked `fonts-private/` folder. The public web build uses **Barlow** (SIL Open Font License 1.1, self-hosted from `@fontsource/barlow`) through the same `--font` token. Tabular figures are on everywhere, so counters never shift. The screenshots below are the web build, so they show Barlow.

| Token | iPad | iPhone | Weight | Use |
| --- | --- | --- | --- | --- |
| `--fs-bpm` | 60 px | 44 px | Light | BPM readout |
| `--fs-barbeat` | 28 px | 22 px | Medium | Bar and beat, time signature, current note |
| `--fs-title` | 22 px | 20 px | Medium | Sheet titles, wordmark (Bold) |
| `--fs-pad` | 17 px | 14 px | Medium | Pad names |
| `--fs-value` | 17 px | 16 px | Regular | Control values, buttons (Medium) |
| `--fs-label` | 12 px | 12 px | Medium | Small labels, uppercase, letter spacing 0.06em |

Nothing is smaller than 12 px.

### Space, shape, motion

| Token | Value | Use |
| --- | --- | --- |
| `--u` | 8 px | The spacing unit |
| `--touch` | 48 px | Minimum touch target |
| `--h-transport` | 72 px (64 on iPhone) | Transport band |
| `--h-strip` | 96 px | Bottom strip |
| `--r-pad` | 12 px | Pads, cards, sheets |
| `--r-ctl` | 8 px | Controls |
| `--hair` | 1 px | Hairline |
| `--stroke` | 1.5 px | Icon stroke |
| `--outline` | 2 px | Selection and focus outline |
| `--dur` / `--ease` | 120 ms ease | The only transition; 0 ms with reduced motion |
| `--tint` | 14% (16% in daylight) | State color mixed into a pad or toggle |

Motion is used only where it informs: the beat light, the queued blink and loop progress. With reduced motion the queued blink holds steady.

## Components

- **Pad**: flat rounded rectangle, 1 px hairline, no gradient or shadow. Name top left, type icon top right (one shot, hold, loop, pattern), state word bottom left, exclusive group letter bottom right, a thin progress bar along the bottom edge. The waveform shows in Edit view only.
- **Fader, stepper, segmented switch, toggle**: custom, sized for thumbs. There are no native range inputs or select menus anywhere. Double-tap a fader to reset it. Hold a stepper button to repeat.
- **Pickers** open as bottom sheets.
- **Icons**: one inline SVG set on a 24 px grid with a 1.5 px stroke. No emoji.
- **Copy**: sentence case on buttons, uppercase only on small labels, plain verbs, no leading zeroes.
- **Identity**: the wordmark "Pad16" in Bold; the app icon is a 4x4 grid with one lit pad (`scripts/make-icons.mjs`).

## Layout

- **iPad landscape**: the grid is a square on the left; the right rail holds the tonic pad, the sub synth and the mixer. In Edit view the rail becomes the pad editor.
- **iPad portrait**: transport, grid, bottom strip (tonic pad, sub synth, mixer button). The mixer opens as a drawer. In Edit view the editor takes the lower part of the screen.
- **iPhone** (from 390 px): three short transport rows, then tabs for Pads, Mix, Synth and Song.
- The transport is a single 72 px row at 1280 px and wider. Below that the song row sits under the tempo row (see DECISIONS.md, item 38).

## Screens

Each view, dark then daylight. Captured by `scripts/make-screens.mjs`.

### Perform

| | Dark | Daylight |
| --- | --- | --- |
| iPad landscape | ![](screens/perform-landscape-dark.png) | ![](screens/perform-landscape-light.png) |
| iPad portrait | ![](screens/perform-portrait-dark.png) | ![](screens/perform-portrait-light.png) |
| iPhone | ![](screens/perform-phone-dark.png) | ![](screens/perform-phone-light.png) |

### Edit

| | Dark | Daylight |
| --- | --- | --- |
| iPad landscape | ![](screens/edit-landscape-dark.png) | ![](screens/edit-landscape-light.png) |
| iPad portrait | ![](screens/edit-portrait-dark.png) | ![](screens/edit-portrait-light.png) |
| iPhone | ![](screens/edit-phone-dark.png) | ![](screens/edit-phone-light.png) |

### Mixer

| | Dark | Daylight |
| --- | --- | --- |
| Drawer, iPad portrait | ![](screens/mixer-portrait-dark.png) | ![](screens/mixer-portrait-light.png) |
| Mix tab, iPhone | ![](screens/mix-phone-dark.png) | ![](screens/mix-phone-light.png) |

### Sheets (iPad landscape)

| View | Dark | Daylight |
| --- | --- | --- |
| Tempo and meter | ![](screens/tempo-landscape-dark.png) | ![](screens/tempo-landscape-light.png) |
| Click | ![](screens/click-landscape-dark.png) | ![](screens/click-landscape-light.png) |
| Songs and sets | ![](screens/songs-landscape-dark.png) | ![](screens/songs-landscape-light.png) |
| Sub synth | ![](screens/synth-landscape-dark.png) | ![](screens/synth-landscape-light.png) |
| Tonic pad | ![](screens/tonic-landscape-dark.png) | ![](screens/tonic-landscape-light.png) |
| Pattern sequencer | ![](screens/sequencer-landscape-dark.png) | ![](screens/sequencer-landscape-light.png) |
| Settings, Outputs | ![](screens/settings-outputs-landscape-dark.png) | ![](screens/settings-outputs-landscape-light.png) |
| Settings, MIDI | ![](screens/settings-midi-landscape-dark.png) | ![](screens/settings-midi-landscape-light.png) |
| Settings, Diagnostics | ![](screens/settings-diagnostics-landscape-dark.png) | ![](screens/settings-diagnostics-landscape-light.png) |
| Settings, Display | ![](screens/settings-display-landscape-dark.png) | ![](screens/settings-display-landscape-light.png) |

### iPhone tabs

| Tab | Dark | Daylight |
| --- | --- | --- |
| Synth | ![](screens/synth-phone-dark.png) | ![](screens/synth-phone-light.png) |
| Song | ![](screens/song-phone-dark.png) | ![](screens/song-phone-light.png) |

## Review against the brief

Checked on the screenshots above:

- Flat pads, 12 px radius, 1 px hairline, no gradients or inner shadows, no waveform in Perform view: yes.
- One typeface, fixed-width digits, nothing under 12 px: yes.
- State paired with a shape or word: yes (dashed border and "Queued", progress bar and "Playing", On and Off on toggles, Main and Cue on buses).
- No native range inputs or select menus; pickers are bottom sheets: yes.
- Three bands with a 72 px transport and a 96 px strip: yes at 1280 px and wider; narrower screens add a second transport row (decision 38).
- Touch targets at least 48 px: yes, including sequencer steps (long patterns scroll sideways).
- Known gap: DIN cannot be shown in these screenshots because the public build must not contain it. Check the type on the iPad build.
