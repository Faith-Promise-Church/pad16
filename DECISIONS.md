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
