# Nord Stage 4 setup

What Pad16 needs from the Nord, and how to wire the WIDI Master.

## What was confirmed and what was not

Confirmed from the Stage 4 manual text (as quoted on the Nord User Forum) and Nord's update history:

- The Stage 4's Master Clock follows incoming MIDI clock automatically, on the 5-pin MIDI input or USB MIDI. There is nothing to switch on.
- The Stage 4 does not send MIDI clock. Pad16 is the tempo master.
- Later firmware improved clock handling: Nord's update history lists "Quicker sync to external MIDI tempo". Update the keyboard to the current OS before the first gig.
- The MIDI menu has Local Control, a Global channel, a Control Change mode and a Program Change mode, each with send and receive choices.

Not confirmed, because the full manual could not be opened from the build environment: the exact wording and order of the MIDI menu on the Stage 4, the Extern section's pedal options, and the default channels. The list below says exactly what to check on the keyboard.

Sources: Nord Stage 4 update history (nordkeyboards.com/node/9609); Nord User Forum threads "Nord stage 4 midi Clock" and "Nord Stage 4 - no CtrlPed MIDI Messages"; Nord Stage 4 User Manual v1.0x Edition D.

## Settings to check on the Nord

Open the MIDI menu (Shift + the button marked MIDI) and step through it.

| Setting | Set it to | Why |
| --- | --- | --- |
| Local Control | On | The Nord keeps playing its own sounds. Pad16 only listens. |
| Global channel (MIDI channel) | 1, or any single channel | Pad16 listens on all channels by default. If you set a channel in Pad16 (Settings, MIDI, Channel), it must match this. |
| Control Change mode | Send, or Send and Receive | Sustain pedal (CC 64), mod wheel (CC 1) and the control pedal (CC 11) reach Pad16 only when the Nord sends controllers. |
| Program Change mode | Off, unless you want it | With it on Send, changing programs on the Nord can select songs in Pad16 (turn on "Program change selects a song" in Pad16 too). |
| Clock or sync | Nothing to set | The Master Clock locks to incoming clock by itself. Programs must use the Master Clock (Mst Clk) on their arpeggiator, delay or LFO to follow it. |

Then check these, which the manual covers in the pedal and Extern sections:

1. **Sustain pedal sends MIDI.** Hold a low key, press the pedal, release the key, and watch Pad16's MIDI monitor (Settings, MIDI): you should see `CC 64 127`. If nothing arrives, look for the pedal's MIDI routing in the System or Extern menu.
2. **Control pedal sends CC 11.** Forum reports say the control pedal's MIDI output is set per panel in the Extern menu ("Pedal MIDI"). Move the pedal and look for `CC 11` in the monitor. If it sends a different number, either change it on the Nord or use MIDI Learn in Pad16.
3. **Mod wheel sends CC 1.** Move it and check the monitor.
4. **The left-hand split.** Pad16's sub synth listens to MIDI notes 21 to 47 (A0 to B2) by default. Use Learn range in the sub synth settings and press your lowest and highest bass keys. To play only the sub in that range, turn the Nord's own sounds off (or down) for that zone with a keyboard split.
5. **Octave shifts.** If a Nord program transposes the keyboard, the MIDI notes it sends may move too ("Transpose MIDI at" in the MIDI menu on earlier Stage models). If the sub stops responding after a program change, check the monitor for the note numbers and re-learn the range.

## Wiring the WIDI Master

The WIDI Master is two plugs joined by a short cable. Bluetooth carries MIDI only, never audio.

1. Plug the **main plug** (the one with the cable socket, marked OUT) into the Nord's **MIDI OUT**. It takes power from this socket.
2. Plug the **second plug** (marked IN) into the Nord's **MIDI IN**.
3. Power the Nord. The WIDI light blinks slowly while it waits for a connection.
4. On the iPad, open Pad16, Settings, MIDI, **Connect Bluetooth device**, and tap WIDI Master. The light turns steady. Do not pair it in the iPad's Bluetooth settings: Bluetooth MIDI devices are connected from inside an app.
5. In Pad16 the MIDI chip in the transport bar should read "MIDI on", and "WIDI Master" should appear under both Inputs and Outputs.
6. Play a low key: the monitor shows the note. Start Pad16's transport: the Nord's Master Clock shows the tempo and that it is following an external clock.

Notes:

- If the Nord's MIDI OUT does not power the adapter (the light stays off), the WIDI Master needs CME's USB power cable. Most keyboards power it from the socket.
- Use CME's WIDI app once to update the adapter's firmware and, if you like, to name it. Close that app afterwards: only one app should hold the connection.
- Pad16 remembers the adapter and looks for it again on launch and after a dropout. The chip reads "MIDI search" while it is looking.
- Set the **clock offset** for the WIDI Master in Pad16 (Settings, MIDI, Outputs) by ear: Bluetooth adds a few milliseconds. Start around -8 ms and adjust until a synced Nord delay sits on the click.

## USB backup

A USB cable from the Nord to the iPad (through the audio interface's hub or a powered hub) works the same way: the Nord appears as a MIDI input and output with no setup, and the same notes, pedals and clock flow. Reports say the Stage 4 follows clock more steadily over USB than over 5-pin, so keep the cable in the bag.

## Clock behavior to expect

- Pad16 sends clock the whole time it is open, not only while the transport runs, so the Nord is already locked when a song starts.
- Clock is 24 pulses per quarter note. In 6/8, 9/8 and 12/8 the Nord always sees the quarter-note tempo. A song set to count quarter notes (74 on the chart) shows 74 on the Nord. A song set to count the dotted-quarter pulse shows a tempo one and a half times higher (a pulse of 60 reads as 90). Synced delays and arpeggios land correctly.
- Pressing Start re-anchors the beat. The Nord sees one clock pulse of odd length and no tempo change.
- Start and Stop messages are off by default (Settings, MIDI). Leave them off unless a Nord program needs them.
