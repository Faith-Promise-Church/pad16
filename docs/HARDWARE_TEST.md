# Hardware test checklist

What only the real rig can verify. Work down the list once at home, then again at a soundcheck. Tick each box or write what happened.

Rig: iPad, Nord Stage 4, WIDI Master, wired USB interface (ESI Gigaport HD+ or Focusrite), DI boxes.

## 1. Audio outputs

- [ ] Plug in the interface. Edit, Setup, Audio shows its name (app) or "System output" (web), and the channel count.
- [ ] Edit, Setup, Diagnostics: note **Outputs reported / opened**, **Sample rate** (expect 48000), **Base latency** and **Output latency**.
- [ ] Test tones: press Output 1, Output 2 and so on. Each tone comes out of one physical output only. Label the DI boxes to match. (The Gigaport's outputs are unbalanced RCA at consumer level: use DI boxes or RCA to TS cables into line inputs.)
- [ ] **Stereo**: everything on left and right.
- [ ] **Split**: click only on one side, music only on the other. Swap sides works.
- [ ] **Multi-out** (app, 4 or more outputs): is it offered? Does Diagnostics say the web view opened 4 or more channels, or "stereo plus native cue"?
  - [ ] Main on 1 and 2, click on 3 and 4 (or the pair you chose).
  - [ ] If the native cue route is active: set **Cue offset** by ear until the click sits on a drum loop, and write the value here: ____ ms.
  - [ ] Bass on its own output (web view route only).
  - [ ] If Multi-out is offered but falls back to Split, copy the reason shown in Edit, Setup, Audio here: ________
- [ ] Unplug the interface and plug it back in: the same mode and bus assignments come back.
- [ ] Connect Bluetooth headphones: the red Bluetooth audio warning shows.

## 2. WIDI Master pairing and reconnect

- [ ] Edit, Setup, MIDI, Connect Bluetooth device: WIDI Master appears and connects. The chip in the Perform bar reads "MIDI".
- [ ] Close and reopen Pad16: it reconnects on its own. Time it: ____ s. (If it does not, note that here; the Connect button is the fallback.)
- [ ] Power the Nord off for 10 seconds and back on: the banner "MIDI device lost. Reconnecting." shows, a held bass note releases after about a second and a half, loops keep playing, and the link comes back on its own. Time it: ____ s.
- [ ] Walk the iPad 5 m away and back: no stuck notes.
- [ ] Repeat the basics over the USB cable: notes, pedal and clock behave the same.

## 3. Clock to the Nord

- [ ] With Pad16 open and stopped, the Nord's Master Clock shows it is following external clock at Pad16's tempo.
- [ ] How many bars after opening Pad16 until the Nord's tempo display settles? ____ bars. (Early firmware took several. Update the Nord if it is slow.)
- [ ] Does it hold? Play a synced delay or arpeggio for 5 minutes against the click. Any drift or wobble: ________
- [ ] Change tempo while playing: the Nord follows at the bar line.
- [ ] Press Start: the Nord does not lose lock.
- [ ] 6/8 at 60 BPM: the Nord reads 90 and its delays still land right.
- [ ] **Clock offset by ear**: Edit, Setup, MIDI, Outputs, the stepper beside WIDI Master. Play a Nord delay set to quarter notes against the click and adjust until they flam the least. Bluetooth value: ____ ms. USB value: ____ ms.
- [ ] Compare 5-pin (WIDI) and USB for steadiness. Which is tighter? ________
- [ ] Diagnostics, Clock: "native, timestamped" in the app. In a Web MIDI browser, note whether it says "approximate" and the jitter figure: ____ ms.

## 4. Pedal, mod wheel, Bass (the sub synth)

- [ ] Learn range: press the lowest and highest bass keys. Keys outside it do not play the sub.
- [ ] Hold two keys: the lower sounds. Release it: the higher takes over. 
- [ ] Sustain pedal: hold a note with the pedal, release the key, the note holds. Press a new key: it replaces the held note. Pedal up: silence.
- [ ] Mod wheel opens the filter. Control pedal changes the sub level (check the monitor for CC 11).
- [ ] Pitch bend bends.
- [ ] **Latency feel**: play short bass notes with the Nord's own piano at the same time. Bluetooth: tight / slightly late / too late. USB: tight / slightly late / too late. Diagnostics output latency: ____ ms.
- [ ] Each preset (Pure Sub, Warm Saw, Round Triangle, 808 Hold, Organ Pedal) through the PA with the subs on. Any that boom or click: ________

## 5. Loops, patterns, click

- [ ] Shaker loop at its own tempo, then 10 BPM faster and slower, in Repitch and in Stretch. Stretch warning appears past 12 percent.
- [ ] Shaker playing, change the tempo, let it pass its loop point (8 bars): it keeps sounding, and the stretched copy comes in on a bar line. Change back to 80: still sounding. (This is the bug that silenced the shaker in Safari.)
- [ ] Page 2 while pads from page 1 play: nothing stops, the shared pads show as playing on both pages, the green dot on tab 1 shows a cajon loop still running.
- [ ] Great Are You Lord (6/8 at 74): the click with eighth-note subdivisions sits at 148, the Nord shows 74, and the shaker and cajon patterns feel right.
- [ ] Queue a pattern mid-bar: it blinks, then starts on the bar line. Swap between two pads in the same group: no gap, no overlap.
- [ ] Each stop mode: now, quantized, end of loop, fade.
- [ ] Import your own click samples (accent, beat, subdivision). Subdivisions in 4/4 and 6/8.
- [ ] Count-in of 1 and 2 bars.
- [ ] Mute the click: the transport keeps running.

## 6. Ambient pad

- [ ] Load your pad set (see SAMPLES.md). All 12 keys play. No click at the loop point over 2 minutes.
- [ ] Fade in, fade out, and a key change crossfade.
- [ ] Next song in a new key: the pad crossfades when the song loads.

## 7. Songs and stage safety

- [ ] Build a 5-song set. Next and Previous from the screen, from the page-turner pedal, and from a learned MIDI control.
- [ ] Export the set on the iPad, import it on the iPhone: songs, patterns and your samples arrive.
- [ ] Stage lock on (Edit, Setup, Display): Edit needs a press and hold and Capture is hidden, so nothing can be changed by accident.
- [ ] Panic: everything stops with no click or pop.
- [ ] The screen stays awake for 10 minutes untouched.
- [ ] Daylight theme outdoors: readable in sun.

## 8. Interruptions and soak

- [ ] Trigger an interruption (a phone call on the iPhone, or Siri, or a timer alarm): "Tap to resume audio" appears. One tap brings sound back. MIDI still works.
- [ ] Lock and unlock the iPad: same.
- [ ] Unplug the audio interface mid-song and plug it back: audio returns, routing restored.
- [ ] **30-minute soak**: transport running, a loop and a pattern playing, pad on, play bass throughout. Dropouts or glitches: ____. Diagnostics "worst late tick": ____ ms. Battery used: ____ percent. iPad warm?
- [ ] Turn on Airplane Mode (then Bluetooth back on): everything still works with no network.

## 9. Perform, scenes and the screen sizes

- [ ] The app opens in Perform. Play one whole song without touching Edit: start, tap tempo, tempo up and down by 1, click, pads, Ambient and Bass on and off and their faders.
- [ ] Scenes at stage tempo: press Chorus mid-bar. The button blinks amber and says Next bar; on the bar line the Chorus pads start together and the others stop. No flam between pads, no gap.
- [ ] Press a second scene before the first lands: the second one wins, nothing is left half started.
- [ ] Capture: start a few pads by hand, press Capture, press Down, then press the new scene. The same pads come back.
- [ ] Step scenes from the page-turner pedal (Edit, Setup, Display, Pedal and arrow keys, Step scenes) and from a learned MIDI control (Next scene).
- [ ] Are the starter scenes (Intro, Verse, Chorus, Build, Down) the right pads for these songs? Note changes here: ________
- [ ] Faders under a thumb: can the Ambient and Bass faders be ridden without looking? Too short, too close to the pads: ________
- [ ] iPad in portrait and landscape, and Split View at half width: nothing is cut off and the pads stay square.
- [ ] iPhone upright and on its side: every control in Perform can be hit with a thumb.
- [ ] Read the Perform screen from a metre away under stage light: tempo, bar and beat, the scene that is on.

## 10. Sound library and the spoken count-in

- [ ] Edit, Setup, Sounds: paste the access key and press Connect. It says Connected and how many sounds are in the library.
- [ ] A wrong or expired key says so, and the kits published with the app still play.
- [ ] Edit, Pads, pick a pad, Sound library. Scroll the categories, search for "shaker", tap a row to hear it, tap again to stop it.
- [ ] Use a loop: it lands on the pad with its tempo, and follows the song when the tempo changes.
- [ ] Use a one shot in a pattern track (Edit pattern, tap the track name, Browse the library). The pattern plays it.
- [ ] Keep every sound on this device, then switch to airplane mode and reload: the library pads still play.
- [ ] By ear, per category: which names are wrong, which loops are at the wrong tempo or start late, which sounds are not worth keeping: ________
- [ ] Count-in of 1 bar at 70, 100 and 140: the numbers sit on the click, not ahead of it or behind it. Note any word that is early or late: ________
- [ ] Count-in in 6/8 slow (counts six) and fast (counts the two pulses).
- [ ] The count goes where the click goes (in-ears, not the room) in Split and Multi-out.
- [ ] "Say the numbers" off: click only.

