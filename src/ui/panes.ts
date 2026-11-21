// The parts of Edit. Song: set list, this song, tempo and click, scenes, ambient, bass. Mix. Setup: audio, MIDI, display, backup, diagnostics. Loops.
// What belongs to a song is under Song; what belongs to this device is under Setup. Nothing is in two places.
import type { App } from '../app';
import type { UI } from './views';
import { fmtBpm, mixerView } from './views';
import { h, btn, toggle, fader, stepper, segmented, field, textInput, pickButton, pickSheet, openSheet, confirmSheet, pct, icon, clear } from './kit';
import { NOTE_NAMES, QUANTS, QUANT_LABEL, Quant, Den, Subdivision, midiToName, ClickKind, TempoCount, isCompound, clampBpm, shownBpm } from '../engine/time';
import { MIDI_ACTIONS, MidiAction, SubTarget, SubWave, SUB_PRESETS, OutputMode, PAD_COLORS, PadColor, MAX_SCENES, PAGE, PAGES, padTarget, uid, Scene } from '../store/model';
import { emptyPattern, Pattern } from '../engine/patterns';
import { Native } from '../native/plugin';

export interface Pane { el: HTMLElement; update: () => void; frame?: () => void }
const pane = (...kids: Array<Node | null>) => h('div', { class: 'pane-body' }, ...kids);
const ms = (v: number) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(1) + ' s');
const hz = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz');

/* =========================== Song =========================== */

/* ---------- set list ---------- */
export function setListPane(ui: UI): Pane {
  const { app } = ui;
  const setPick = pickButton<string>({ title: 'Set', value: () => app.set.id, onPick: v => app.selectSet(v), options: () => app.state.sets.map(s => ({ value: s.id, label: s.name, note: `${s.songIds.length} song${s.songIds.length === 1 ? '' : 's'}` })) });
  const setName = textInput({ value: app.set.name, max: 40, onInput: v => { app.set.name = v || 'Set'; app.changed(); } });
  const list = h('div', { class: 'pick-list' });
  const el = pane(
    h('section', {}, h('h3', { text: 'Set' }), h('div', { class: 'row' }, h('div', { class: 'grow' }, setPick.el), btn({ icon: 'plus', title: 'New set', onClick: () => app.addSet() }),
      btn({ icon: 'trash', title: 'Delete set', cls: 'ghost', onClick: () => confirmSheet('Delete set', `Delete the set "${app.set.name}"? Its songs stay in the library.`, 'Delete set', () => app.deleteSet(app.set.id)) })),
      field('Set name', setName.el)),
    h('section', {}, h('h3', { text: 'Songs in this set' }), list,
      h('div', { class: 'row' }, btn({ label: 'New song', icon: 'plus', cls: 'grow', onClick: () => app.addSong() }), btn({ label: 'Duplicate this song', icon: 'copy', cls: 'grow', onClick: () => app.addSong(app.song) })),
      h('p', { class: 'help', text: 'The order here is the order on stage. Set files are exported and imported in Setup, Backup.' })));
  let sig = '';
  return {
    el,
    update() {
      setPick.update(); setName.set(app.set.name);
      const songs = app.setSongs, s2 = app.set.id + songs.map(s => s.id + s.name + s.bpm + s.key + s.ts.num + s.ts.den).join('|') + app.song.id;
      if (s2 === sig) return;
      sig = s2; clear(list);
      songs.forEach((s, i) => {
        const on = s.id === app.song.id;
        list.append(h('div', { class: 'song-row' + (on ? ' on' : '') },
          h('button', { class: 'song-pick', attrs: { type: 'button', 'aria-pressed': String(on) }, on: { click: () => app.selectSong(s.id) } },
            h('span', { class: 'row-name', text: `${i + 1}. ${s.name || 'Untitled'}` }), h('span', { class: 'row-note', text: `${fmtBpm(s.bpm)} BPM, ${s.ts.num}/${s.ts.den}, ${NOTE_NAMES[s.key]}` })),
          btn({ icon: 'up', title: `Move ${s.name} up`, onClick: () => app.moveSong(s.id, -1) }), btn({ icon: 'down', title: `Move ${s.name} down`, onClick: () => app.moveSong(s.id, 1) }),
          btn({ icon: 'trash', title: `Delete ${s.name}`, onClick: () => confirmSheet('Delete song', `Delete "${s.name}"? This cannot be undone.`, 'Delete song', () => app.deleteSong(s.id)) })));
      });
    },
  };
}

/* ---------- this song: name, key, notes ---------- */
export function songInfoPane(ui: UI): Pane {
  const { app } = ui;
  const name = textInput({ value: '', max: 60, onInput: v => app.patchSong({ name: v }) });
  const notes = textInput({ value: '', max: 200, placeholder: 'Capo, cues, who starts', onInput: v => app.patchSong({ notes: v }) });
  const keys = h('div', { class: 'key-grid' });
  const keyBtns = NOTE_NAMES.map((n, i) => { const b = btn({ label: n, title: `Key ${n}`, onClick: () => app.patchSong({ key: i }) }); keys.append(b); return b; });
  const el = pane(h('section', {}, field('Name', name.el), field('Key', keys), h('p', { class: 'help', text: 'The ambient pad plays in this key.' }), field('Notes', notes.el)));
  return { el, update() { name.set(app.song.name); notes.set(app.song.notes); keyBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === app.song.key))); } };
}

/* ---------- tempo and click ---------- */
export function tempoPane(ui: UI): Pane {
  const { app } = ui;
  const patchClick = (p: Partial<App['song']['click']>) => app.patchSong({ click: { ...app.song.click, ...p } });
  const input = textInput({ value: String(app.song.bpm), numeric: true, max: 6, onCommit: v => { const n = parseFloat(v.replace(',', '.')); if (isFinite(n)) app.patchSong({ bpm: n }); } });
  input.el.setAttribute('aria-label', 'Tempo in BPM');
  const nudge = (d: number, label: string) => btn({ label, title: `Tempo ${label}`, onClick: () => app.patchSong({ bpm: +(app.song.bpm + d).toFixed(1) }) });
  const num = stepper({ value: app.song.ts.num, min: 1, max: 12, label: 'beats in the bar', onChange: v => app.setTs({ ...app.song.ts, num: v }) });
  const den = segmented<Den>({ label: 'Note value', value: app.song.ts.den, options: ([2, 4, 8, 16] as Den[]).map(d => ({ value: d, label: String(d) })), onChange: v => app.setTs({ ...app.song.ts, den: v }) });
  const countIn = segmented<0 | 1 | 2>({ label: 'Count-in', value: app.song.click.countIn, options: [{ value: 0, label: 'Off' }, { value: 1, label: '1 bar' }, { value: 2, label: '2 bars' }], onChange: v => patchClick({ countIn: v }) });
  const spoken = toggle({ label: 'Say the numbers', value: app.song.click.spoken !== false, onChange: v => patchClick({ spoken: v }) });
  const spokenHelp = h('p', { class: 'help' }), spokenField = field('Spoken count-in', spoken.el, spokenHelp);
  const quant = pickButton<Quant>({ title: 'Launch quantize', value: () => app.song.quantize, onPick: v => app.patchSong({ quantize: v }), options: () => QUANTS.map(q => ({ value: q, label: QUANT_LABEL[q] })) });
  const note = h('p', { class: 'help' });
  // 6/8, 9/8, 12/8: charts print the tempo in quarter notes (74 means eighth notes at 148), the pulse is the dotted quarter
  const count = segmented<TempoCount>({ label: 'The tempo counts', value: 'pulse', options: [{ value: 'quarter', label: 'Quarter notes' }, { value: 'pulse', label: 'The dotted-quarter pulse' }],
    onChange: v => app.patchSong({ bpm: clampBpm(shownBpm(app.pulse, app.song.ts, v)), tempoCount: v }) });
  const countHelp = h('p', { class: 'help' }), countField = field('The tempo counts', count.el, countHelp);
  // click
  const on = toggle({ label: 'Click', icon: 'click', cls: 'cue', value: app.song.click.on, onChange: v => patchClick({ on: v }) });
  const sub = segmented<Subdivision>({ label: 'Subdivisions', value: app.song.click.sub, options: [{ value: 'off', label: 'Off' }, { value: '8', label: 'Eighths' }, { value: '16', label: 'Sixteenths' }, { value: '3', label: 'Triplets' }], onChange: v => patchClick({ sub: v }) });
  const lv = { accent: fader({ value: 1, label: 'Accent', format: pct, onInput: v => patchClick({ accent: v }) }), beat: fader({ value: 1, label: 'Beat', format: pct, onInput: v => patchClick({ beat: v }) }), subLevel: fader({ value: 1, label: 'Subdivision', format: pct, onInput: v => patchClick({ subLevel: v }) }) };
  const slots = (['accent', 'beat', 'sub'] as ClickKind[]).map(slot => {
    const file = h('input', { attrs: { type: 'file', accept: 'audio/*,.wav,.mp3,.m4a,.aif,.aiff', hidden: '' } });
    file.addEventListener('change', () => { const f = file.files?.[0]; file.value = ''; if (f) app.setClickSample(slot, f); });
    const state = h('span', { class: 'dev-name' });
    const reset = btn({ label: 'Remove', cls: 'ghost', onClick: () => app.setClickSample(slot, null) });
    const row = h('div', { class: 'dev-row' }, state, btn({ label: 'Import', onClick: () => file.click() }), reset, file);
    return { slot, row, state, reset };
  });
  const dest = h('p', { class: 'help' });
  const el = pane(
    h('section', {}, h('h3', { text: 'Tempo' }), h('div', { class: 'row' }, nudge(-1, '-1'), nudge(-0.1, '-0.1'), h('div', { class: 'grow' }, input.el), nudge(0.1, '+0.1'), nudge(1, '+1'), btn({ label: 'Tap', cls: 'primary', onClick: () => app.tap() })), note),
    h('section', {}, h('h3', { text: 'Time signature' }), h('div', { class: 'two' }, field('Beats', num.el), field('Note value', den.el)), countField),
    h('section', {}, h('h3', { text: 'Launch' }), h('div', { class: 'two' }, field('Count-in', countIn.el), field('Launch quantize for loops and patterns', quant.el)), spokenField,
      h('p', { class: 'help', text: 'Scenes always land on a bar line.' })),
    h('section', { class: 'click-section' }, h('h3', { text: 'Click' }), h('div', { class: 'row' }, on.el), field('Subdivisions', sub.el), lv.accent.el, lv.beat.el, lv.subLevel.el, dest),
    h('section', {}, h('h3', { text: 'Click samples for this song only' }), h('p', { class: 'help', text: 'Import a sample to replace one click sound in this song. The click sound for every song is chosen in Setup, Audio.' }), ...slots.map(s => s.row)));
  return {
    el,
    update() {
      const c = app.song.click;
      input.set(String(app.song.bpm)); num.set(app.song.ts.num); den.set(app.song.ts.den); countIn.set(c.countIn); quant.update(); spoken.set(c.spoken !== false);
      spokenField.toggleAttribute('hidden', !c.countIn);
      const words = app.eng.count.ready;
      spokenHelp.textContent = words ? `Your voice counts the bar over the click, in your ears with the click. ${words} numbers are loaded.` : 'The count words come from the sound library, which is not on this device yet: Setup, Sounds.';
      const compound = isCompound(app.song.ts), q = app.song.tempoCount === 'quarter';
      countField.hidden = !compound; count.set(q ? 'quarter' : 'pulse');
      const r1 = (n: number) => String(Math.round(n * 10) / 10);
      if (compound) countHelp.textContent = `Eighth notes at ${r1(app.pulse * 3)}, pulse at ${r1(app.pulse)}. ` + (q ? 'This is how most charts print a 6/8 tempo.' : 'Choose quarter notes if this tempo came from a chart.');
      note.textContent = app.eng.transport.pending ? 'The new tempo starts at the next bar line.' : 'Range 40 to 240 BPM. While playing, a change lands on the next bar line.';
      on.set(c.on); sub.set(c.sub); lv.accent.set(c.accent); lv.beat.set(c.beat); lv.subLevel.set(c.subLevel);
      const cs = app.clickSet;
      for (const s of slots) { const own = !!c.samples[s.slot]; s.state.textContent = `${s.slot === 'accent' ? 'Accent (beat 1)' : s.slot === 'beat' ? 'Beat' : 'Subdivision'}: ${own ? 'imported for this song' : cs?.files[s.slot] ? cs.name : 'built-in'}`; s.reset.disabled = !own; }
      const b = app.routing.buses.click;
      dest.textContent = `The click has its own bus, now sent to ${b.dest === 'cue' ? 'Cue' : 'Main'}${app.nativeCue ? ' and played by the app on its own outputs' : ''}. Change that in Mix. Muting the click never stops the transport.`;
    },
  };
}

/* ---------- scenes ---------- */
const sceneSummary = (app: App, sc: Scene): string => {
  const n = sc.pads.length, extra = [sc.tonic !== undefined ? `ambient ${sc.tonic ? 'on' : 'off'}` : '', sc.sub !== undefined ? `bass ${sc.sub ? 'on' : 'off'}` : '', sc.click !== undefined ? `click ${sc.click ? 'on' : 'off'}` : ''].filter(Boolean);
  const pads = !n ? 'No pads: stops every loop' : n <= 3 ? sc.pads.map(i => app.padName(i)).join(', ') : `${n} pads`;
  return [pads, ...extra].join(', ');
};
export function scenesPane(ui: UI): Pane {
  const { app } = ui;
  const list = h('div', { class: 'pick-list' });
  const capture = btn({ label: 'Capture what is playing', icon: 'capture', cls: 'primary grow', onClick: () => { const sc = app.captureScene(); if (sc) openSceneEditor(ui, sc.id); } });
  const add = btn({ label: 'New empty scene', icon: 'plus', cls: 'grow', onClick: () => {
    const s = app.song, cur = s.scenes || (s.scenes = []);
    if (cur.length >= MAX_SCENES) { app.toast(`A song holds ${MAX_SCENES} scenes. Delete one first.`); return; }
    const sc: Scene = { id: uid(), name: `Scene ${cur.length + 1}`, color: PAD_COLORS[cur.length % PAD_COLORS.length], pads: [] };
    cur.push(sc); app.changed(); openSceneEditor(ui, sc.id);
  } });
  const el = pane(h('section', {}, h('h3', { text: 'Scenes in this song' }), list, h('div', { class: 'row' }, capture, add),
    h('p', { class: 'help', text: 'A scene is the set of pads that should be sounding in one part of the song. Pressing it starts the pads that are not playing and stops the loops that are not in it, together, on the next bar line. To build one fast: start the pads for a section, then press Capture.' }),
    h('p', { class: 'help', text: 'On a keyboard, Shift with 1 to 8 launches a scene. A pedal or a MIDI control can step through them: see Setup, Display and Setup, MIDI.' })));
  let sig = '';
  return {
    el,
    update() {
      const scenes = app.scenes, s2 = JSON.stringify(scenes) + app.song.id + app.song.pads.map(p => p.name + p.patternId).join();
      capture.disabled = add.disabled = scenes.length >= MAX_SCENES;
      if (s2 === sig) return;
      sig = s2; clear(list);
      if (!scenes.length) list.append(h('p', { class: 'help', text: 'This song has no scenes yet.' }));
      scenes.forEach((sc, i) => {
        list.append(h('div', { class: 'song-row scene-row', attrs: sc.color ? { 'data-color': sc.color } : {} },
          h('span', { class: 'scene-chip', attrs: { 'aria-hidden': 'true' } }),
          h('button', { class: 'song-pick', title: `Edit ${sc.name}`, attrs: { type: 'button' }, on: { click: () => openSceneEditor(ui, sc.id) } },
            h('span', { class: 'row-name', text: `${i + 1}. ${sc.name || 'Unnamed'}` }), h('span', { class: 'row-note', text: sceneSummary(app, sc) })),
          btn({ icon: 'play', title: `Launch ${sc.name}`, onClick: () => app.launchScene(sc.id) }),
          btn({ icon: 'up', title: `Move ${sc.name} up`, onClick: () => app.moveScene(sc.id, -1) }), btn({ icon: 'down', title: `Move ${sc.name} down`, onClick: () => app.moveScene(sc.id, 1) }),
          btn({ icon: 'trash', title: `Delete ${sc.name}`, onClick: () => confirmSheet('Delete scene', `Delete the scene "${sc.name}"? The pads are not changed.`, 'Delete scene', () => app.deleteScene(sc.id)) })));
      });
    },
  };
}
/** Name, color, which pads, and what else switches with the scene. */
export function openSceneEditor(ui: UI, id: string): void {
  const { app } = ui;
  const get = () => app.scenes.find(x => x.id === id);
  if (!get()) return;
  openSheet('Scene', (body, close) => {
    const name = textInput({ value: get()!.name, max: 24, placeholder: 'Verse, Chorus, Bridge', onInput: v => app.patchScene(id, { name: v }) });
    const swatches = (['', ...PAD_COLORS] as Array<PadColor | ''>).map(c => {
      const label = c ? c[0].toUpperCase() + c.slice(1) : 'No color';
      const b = h('button', { class: 'swatch', title: label, attrs: { type: 'button', 'aria-label': label, ...(c ? { 'data-color': c } : {}) } }, ...(c ? [] : [icon('close', 'small')]));
      b.addEventListener('click', () => app.patchScene(id, { color: c || undefined }));
      return { b, c };
    });
    // every pad of both pages. A slot that shows a pad from the other page switches that same pad.
    const chips: Array<{ b: HTMLButtonElement; raw: number }> = [];
    const pages = Array.from({ length: PAGES }, (_, pg) => {
      const grid = h('div', { class: 'scene-pads' });
      for (let slot = 0; slot < PAGE; slot++) {
        const raw = pg * PAGE + slot;
        const b = h('button', { class: 'scene-pad', attrs: { type: 'button' } });
        b.addEventListener('click', () => {
          const sc = get(); if (!sc) return;
          const i = padTarget(app.song.pads, raw), has = sc.pads.includes(i);
          app.patchScene(id, { pads: (has ? sc.pads.filter(x => x !== i) : [...sc.pads, i]).sort((a, b2) => a - b2) });
        });
        grid.append(b); chips.push({ b, raw });
      }
      const title = h('span', { class: 'label' });
      return { el: h('div', { class: 'field' }, title, grid), title, pg };
    });
    const tri = (key: 'tonic' | 'sub' | 'click', label: string) => {
      const seg = segmented<'leave' | 'on' | 'off'>({ label, value: 'leave', options: [{ value: 'leave', label: 'Leave as is' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
        onChange: v => app.patchScene(id, { [key]: v === 'leave' ? undefined : v === 'on' }) });
      return { key, seg, el: field(label, seg.el) };
    };
    const tris = [tri('tonic', 'Ambient pad'), tri('sub', 'Bass'), tri('click', 'Click')];
    const usePlaying = btn({ label: 'Use what is playing now', icon: 'capture', onClick: () => app.patchScene(id, { pads: app.eng.pads.sounding().sort((a, b) => a - b) }) });
    body.append(
      h('section', {}, h('div', { class: 'two' }, field('Name', name.el), field('Color', h('div', { class: 'swatches', attrs: { role: 'group', 'aria-label': 'Scene color' } }, ...swatches.map(x => x.b))))),
      h('section', {}, h('h3', { text: 'Pads in this scene' }), ...pages.map(p => p.el), h('div', { class: 'row' }, usePlaying),
        h('p', { class: 'help', text: 'Loops and patterns in the scene play; the ones left out stop. A one shot in the scene fires once when the scene lands.' })),
      h('section', {}, h('h3', { text: 'Also switch' }), h('div', { class: 'two' }, ...tris.map(t => t.el))),
      h('div', { class: 'row' }, btn({ label: 'Launch', icon: 'play', cls: 'primary grow', onClick: () => app.launchScene(id) }),
        btn({ label: 'Delete scene', icon: 'trash', cls: 'ghost grow', onClick: () => { close(); app.deleteScene(id); } }), btn({ label: 'Done', cls: 'grow', onClick: () => close() })));
    return () => {
      const sc = get(); if (!sc) { close(); return; }
      name.set(sc.name);
      for (const x of swatches) x.b.setAttribute('aria-pressed', String((sc.color || '') === x.c));
      for (const p of pages) p.title.textContent = app.pageName(p.pg);
      for (const c of chips) {
        const i = padTarget(app.song.pads, c.raw), cfg = app.song.pads[i], rt = app.eng.pads.pads[i];
        const empty = cfg.mode !== 'pattern' && !rt.buffer, freeLoop = cfg.mode === 'loop' && !app.eng.pads.synced(rt);
        c.b.textContent = app.padName(i);
        c.b.disabled = empty || freeLoop;
        c.b.title = freeLoop ? 'A loop with sync off is started by hand' : '';
        c.b.setAttribute('aria-pressed', String(sc.pads.includes(i)));
        if (cfg.color) c.b.dataset.color = cfg.color; else delete c.b.dataset.color;
      }
      for (const t of tris) { const v = sc[t.key]; t.seg.set(v === undefined ? 'leave' : v ? 'on' : 'off'); }
    };
  }, { tall: true, id: 'sheet-scene' }).update();
}

/* ---------- ambient pad ---------- */
export function ambientPane(ui: UI): Pane {
  const { app } = ui;
  const patch = (p: Partial<App['song']['tonic']>) => app.patchSong({ tonic: { ...app.song.tonic, ...p } });
  const on = toggle({ label: 'Ambient', icon: 'pad', value: app.song.tonic.on, onChange: v => { app.unlock(); patch({ on: v }); } });
  const set = pickButton<string>({ title: 'Pad set', value: () => app.eng.tonic.set?.name || '', onPick: v => patch({ set: v }), options: () => app.bank.index.padsets.map(p => ({ value: p.name, label: p.name, note: `${Object.keys(p.keys).length} of 12 keys` })) });
  const sec = (v: number) => v.toFixed(1) + ' s';
  const level = fader({ value: 0.7, label: 'Level', format: pct, onInput: v => patch({ level: v }) });
  const fin = fader({ value: 4, min: 0.1, max: 12, label: 'Fade in', format: sec, onInput: v => patch({ fadeIn: v }) });
  const fout = fader({ value: 6, min: 0.1, max: 12, label: 'Fade out', format: sec, onInput: v => patch({ fadeOut: v }) });
  const xf = fader({ value: 4, min: 2, max: 8, label: 'Key change crossfade', format: sec, onInput: v => patch({ xfade: v }) });
  const lp = fader({ value: 20000, min: 200, max: 20000, curve: 'log', label: 'High cut', format: v => (v >= 19500 ? 'Off' : hz(v)), reset: 20000, onInput: v => patch({ lp: v }) });
  // rolls the low end out of the pad so it stays clear of the bass and the guitar
  const hp = fader({ value: 20, min: 20, max: 800, curve: 'log', label: 'Low cut', format: v => (v <= 21 ? 'Off' : hz(v)), reset: 20, onInput: v => patch({ hp: v }) });
  const offline = h('p', { class: 'help' });
  const status = h('div', { class: 'note' }, h('span'));
  const el = pane(h('section', {}, h('div', { class: 'row' }, on.el, h('div', { class: 'grow' }, set.el)), status, level.el, h('p', { class: 'help', text: 'The pad plays in the song\'s key. Change the key in Song, or from the Ambient strip in Perform.' })),
    h('section', {}, h('h3', { text: 'Tone' }), hp.el, lp.el, h('p', { class: 'help', text: 'Low cut takes out the low end of the pad. Double-tap either fader to turn it off.' })),
    h('section', {}, h('h3', { text: 'Fades' }), fin.el, fout.el, xf.el), offline);
  return {
    el,
    update() {
      const s = app.song.tonic, tp = app.eng.tonic;
      on.set(s.on); set.update(); level.set(s.level); fin.set(s.fadeIn); fout.set(s.fadeOut); xf.set(s.xfade); lp.set(s.lp); hp.set(s.hp);
      const pk = tp.pick(app.song.key);
      status.querySelector('span')!.textContent = !app.bank.index.padsets.length ? 'No pad set found. Add a folder of files named Pad C.wav, Pad Db.wav and so on under kits/. See SAMPLES.md.'
        : !pk ? 'This pad set has no samples.'
        : pk.shift ? `Fallback: no sample for ${NOTE_NAMES[app.song.key]} in this set, so ${pk.file} is pitch-shifted by ${pk.shift > 0 ? '+' : ''}${pk.shift} semitones.`
        : `Key of ${NOTE_NAMES[app.song.key]}: ${pk.file}${tp.status === 'loading' ? ' (loading)' : tp.status === 'missing' ? ' (file could not be read)' : ''}.`;
      status.classList.toggle('warn', !pk || !!pk.shift || tp.status === 'missing');
      const o = app.offline;
      offline.textContent = !o.total ? '' : o.done >= o.total ? `Saved for offline: all ${o.total} files for this song (kit, click and every key of this pad set).`
        : o.active ? `Saving for offline: ${o.done} of ${o.total} files. Stay online until this finishes.` : `Saved for offline: ${o.done} of ${o.total} files. Open the app online again to finish.`;
    },
  };
}

/* ---------- bass ---------- */
export function bassPane(ui: UI): Pane {
  const { app } = ui;
  const P = () => app.song.sub.params;
  const patch = (p: Partial<App['song']['sub']>) => app.patchSong({ sub: { ...app.song.sub, ...p } });
  const pp = (p: Partial<App['song']['sub']['params']>) => patch({ params: { ...P(), ...p } });
  const on = toggle({ label: 'Bass', icon: 'bass', value: app.song.sub.on, onChange: v => { app.unlock(); patch({ on: v }); } });
  const preset = pickButton<string>({ title: 'Preset', value: () => app.song.sub.preset, onPick: v => app.setSubPreset(v), options: () => Object.keys(SUB_PRESETS).map(n => ({ value: n, label: n })) });
  const level = fader({ value: 0.8, label: 'Level', format: pct, onInput: v => patch({ level: v }) });
  const lo = stepper({ value: 21, min: 0, max: 127, label: 'lowest key', format: midiToName, onChange: v => patch({ lo: Math.min(v, app.song.sub.hi) }) });
  const hi = stepper({ value: 47, min: 0, max: 127, label: 'highest key', format: midiToName, onChange: v => patch({ hi: Math.max(v, app.song.sub.lo) }) });
  const learn = btn({ label: 'Learn range', onClick: () => {
    const got: number[] = [];
    learn.querySelector('span')!.textContent = 'Press the lowest key';
    const step = () => app.midi.startLearn(b => {
      if (b.kind !== 'note') { step(); return; }
      got.push(b.num);
      if (got.length < 2) { learn.querySelector('span')!.textContent = 'Now the highest key'; step(); }
      else { learn.querySelector('span')!.textContent = 'Learn range'; patch({ lo: Math.min(...got), hi: Math.max(...got) }); }
    });
    step();
  } });
  const wave = segmented<SubWave>({ label: 'Waveform', value: 'sine', options: [{ value: 'sine', label: 'Sine' }, { value: 'triangle', label: 'Triangle' }, { value: 'sawtooth', label: 'Saw' }, { value: 'square', label: 'Square' }], onChange: v => pp({ wave: v }) });
  const f = {
    subOsc: fader({ value: 0, label: 'Sub octave', format: pct, onInput: v => pp({ subOsc: v }) }),
    drive: fader({ value: 0, label: 'Drive', format: pct, onInput: v => pp({ drive: v }) }),
    cutoff: fader({ value: 400, min: 40, max: 8000, curve: 'log', label: 'Cutoff', format: hz, onInput: v => pp({ cutoff: v }) }),
    resonance: fader({ value: 0.7, min: 0.3, max: 12, curve: 'log', label: 'Resonance', format: v => v.toFixed(1), onInput: v => pp({ resonance: v }) }),
    envAmount: fader({ value: 0, label: 'Envelope amount', format: pct, onInput: v => pp({ envAmount: v }) }),
    attack: fader({ value: 0.005, min: 0.001, max: 1, curve: 'log', label: 'Attack', format: ms, onInput: v => pp({ attack: v }) }),
    decay: fader({ value: 0.2, min: 0.01, max: 3, curve: 'log', label: 'Decay', format: ms, onInput: v => pp({ decay: v }) }),
    sustain: fader({ value: 1, label: 'Sustain', format: pct, onInput: v => pp({ sustain: v }) }),
    release: fader({ value: 0.2, min: 0.01, max: 3, curve: 'log', label: 'Release', format: ms, onInput: v => pp({ release: v }) }),
    glide: fader({ value: 0, max: 0.5, label: 'Glide', format: ms, onInput: v => pp({ glide: v }) }),
  };
  const poles = segmented<12 | 24>({ label: 'Filter slope', value: 12, options: [{ value: 12, label: '12 dB' }, { value: 24, label: '24 dB' }], onChange: v => pp({ poles: v }) });
  const octave = stepper({ value: 0, min: -2, max: 1, label: 'octave', format: v => (v > 0 ? '+' : '') + v, onChange: v => pp({ octave: v }) });
  const pedal = toggle({ label: 'Sustain pedal', value: true, onChange: v => patch({ pedal: v }) });
  const bend = toggle({ label: 'Pitch bend', value: true, onChange: v => patch({ bend: v ? 'pitch' : 'off' }) });
  const targets: Array<{ value: SubTarget; label: string }> = [{ value: 'off', label: 'Off' }, { value: 'cutoff', label: 'Filter cutoff' }, { value: 'level', label: 'Bass level' }, { value: 'drive', label: 'Drive' }, { value: 'subOsc', label: 'Sub octave level' }];
  const cc1 = pickButton<SubTarget>({ title: 'Mod wheel (CC 1)', value: () => app.song.sub.cc1, onPick: v => patch({ cc1: v }), options: () => targets });
  const cc11 = pickButton<SubTarget>({ title: 'Expression (CC 11)', value: () => app.song.sub.cc11, onPick: v => patch({ cc11: v }), options: () => targets });
  // one octave of on-screen keys for testing without MIDI
  const keys = h('div', { class: 'keys', attrs: { 'aria-label': 'Test keys' } });
  const keyEls = NOTE_NAMES.map((nm, i) => {
    const b = h('button', { class: 'key' + ([1, 3, 6, 8, 10].includes(i) ? ' sharp' : ''), text: nm, attrs: { type: 'button' } });
    const note = () => { const base = Math.ceil(app.song.sub.lo / 12) * 12; return base + i <= app.song.sub.hi ? base + i : app.song.sub.lo + i; };
    let held: number | null = null;
    b.addEventListener('pointerdown', e => { e.preventDefault(); app.unlock(); try { b.setPointerCapture(e.pointerId); } catch { /* fine */ } held = note(); if (!app.song.sub.on) patch({ on: true }); app.eng.sub.noteOn(held); });
    const up = () => { if (held !== null) { app.eng.sub.noteOff(held); held = null; } };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('contextmenu', e => e.preventDefault());
    keys.append(b);
    return { b, note };
  });
  const el = pane(
    h('section', {}, h('div', { class: 'row' }, on.el, h('div', { class: 'grow' }, preset.el)), level.el, keys),
    h('section', {}, h('h3', { text: 'Key range' }), h('div', { class: 'row' }, field('Lowest', lo.el), field('Highest', hi.el), learn),
      h('p', { class: 'help', text: 'Only keys in this range play the bass. When several are held, the lowest sounds.' })),
    h('section', {}, h('h3', { text: 'Oscillator' }), field('Waveform', wave.el), f.subOsc.el, f.drive.el, field('Octave', octave.el), f.glide.el),
    h('section', {}, h('h3', { text: 'Filter' }), field('Slope', poles.el), f.cutoff.el, f.resonance.el, f.envAmount.el),
    h('section', {}, h('h3', { text: 'Envelope' }), f.attack.el, f.decay.el, f.sustain.el, f.release.el),
    h('section', {}, h('h3', { text: 'Controllers' }), h('div', { class: 'row' }, pedal.el, bend.el), h('div', { class: 'two' }, field('Mod wheel (CC 1)', cc1.el), field('Expression (CC 11)', cc11.el)),
      h('p', { class: 'help', text: 'A fixed 30 Hz high-pass protects the speakers. The pedal holds the sounding note; a new key replaces it.' })));
  return {
    el,
    update() {
      const s = app.song.sub, p = s.params;
      on.set(s.on); preset.update(); level.set(s.level); lo.set(s.lo); hi.set(s.hi); wave.set(p.wave); poles.set(p.poles); octave.set(p.octave);
      for (const k of Object.keys(f) as Array<keyof typeof f>) f[k].set(p[k] as number);
      pedal.set(s.pedal); bend.set(s.bend === 'pitch'); cc1.update(); cc11.update();
      const cur = app.eng.sub.currentNote;
      for (const k of keyEls) k.b.dataset.on = String(cur !== null && cur === k.note());
    },
  };
}

/* =========================== Loops =========================== */
/** The loop builder: every pattern, the pads of this song that play it, and a way to make a new one. */
export function loopsPane(ui: UI): Pane {
  const { app } = ui;
  const list = h('div', { class: 'pick-list' });
  const el = h('div', { class: 'pane-body loops-pane' },
    h('section', {}, h('h3', { text: 'Loop builder' }),
      h('p', { class: 'help', text: 'A pattern is a loop built from single hits on a step grid. It follows any tempo with no stretching. Open one to edit its steps; put it on a pad in Pads, Pad type, Pattern.' }),
      h('div', { class: 'row' }, btn({ label: 'New pattern', icon: 'plus', cls: 'primary', onClick: () => { const p = emptyPattern(uid(), 'New pattern', app.song.ts); app.state.patterns.push(p); app.changed(); ui.openSequencer(p.id); } }))),
    h('section', {}, list));
  let sig = '';
  const usedAnywhere = (id: string) => app.state.songs.some(s => s.pads.some(p => p.mode === 'pattern' && p.patternId === id));
  return {
    el,
    update() {
      const pats = app.state.patterns, here = new Map<string, number[]>();
      app.song.pads.forEach((c, i) => { if (c.mode === 'pattern' && c.link === undefined) here.set(c.patternId, [...(here.get(c.patternId) || []), i]); });
      const s2 = app.song.id + pats.map(p => p.id + p.name + p.bars).join('|') + JSON.stringify([...here]);
      if (s2 === sig) return;
      sig = s2; clear(list);
      const meter = (p: Pattern) => (p.ts ? `${p.ts.num}/${p.ts.den}` : `${p.bpb} beats`);
      const sorted = [...pats].sort((a, b) => Number(here.has(b.id)) - Number(here.has(a.id)));
      let split = false;
      sorted.forEach(p => {
        const on = here.get(p.id);
        if (!on && !split) { split = true; list.append(h('h3', { text: 'Not on a pad in this song' })); }
        if (on && list.childElementCount === 0) list.append(h('h3', { text: 'On this song\'s pads' }));
        const where = on ? 'Pad ' + on.map(i => `${(i % PAGE) + 1}${i >= PAGE ? ` (${app.pageName(1)})` : ''}`).join(', ') : '';
        list.append(h('div', { class: 'song-row' },
          h('button', { class: 'song-pick', title: `Edit ${p.name}`, attrs: { type: 'button' }, on: { click: () => ui.openSequencer(p.id) } },
            h('span', { class: 'row-name', text: p.name }), h('span', { class: 'row-note', text: [`${p.bars} bar${p.bars === 1 ? '' : 's'}`, meter(p), where].filter(Boolean).join(', ') })),
          btn({ icon: 'dup', title: `Duplicate ${p.name}`, onClick: () => { const c: Pattern = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + ' copy' }; app.state.patterns.push(c); app.changed(); ui.openSequencer(c.id); } }),
          btn({ icon: 'trash', title: `Delete ${p.name}`, onClick: () => {
            if (usedAnywhere(p.id)) { app.toast('A pad is using this pattern. Give that pad another pattern first.'); return; }
            confirmSheet('Delete pattern', `Delete "${p.name}"? This cannot be undone.`, 'Delete pattern', () => { app.state.patterns = app.state.patterns.filter(x => x.id !== p.id); app.changed(); });
          } })));
      });
    },
  };
}

/* =========================== Mix =========================== */
export function mixPane(ui: UI): Pane {
  const { app } = ui;
  const mixer = mixerView(ui);
  const cueLevel = fader({ value: 1, max: 1.2, label: 'Cue level', format: pct, onInput: v => app.patchRouting({ cueLevel: v }) });
  const where = h('p', { class: 'help' });
  const el = h('div', { class: 'pane-body mix-pane' }, h('section', {}, mixer.el),
    h('section', {}, cueLevel.el, where,
      h('p', { class: 'help', text: 'Main is what the room hears. Cue is for your ears: the click starts there. Tap Main or Cue under a channel to move it. Levels are remembered for each audio device.' })));
  return {
    el,
    update() {
      mixer.update(); cueLevel.set(app.routing.cueLevel);
      const m = app.eng.mixer.activeMode;
      where.textContent = m === 'stereo' ? 'Output mode is Stereo: Main and Cue both play on left and right. To send Cue somewhere else, choose Split or Multi-out in Setup, Audio.'
        : m === 'split' ? `Output mode is Split: Cue on the ${app.routing.swap ? 'right' : 'left'}, Main on the ${app.routing.swap ? 'left' : 'right'}.`
        : `Output mode is Multi-out: Main on outputs 1 and 2, Cue on ${app.routing.cuePair} and ${app.routing.cuePair + 1}.`;
    },
    frame() { mixer.frame!(); },
  };
}

/* =========================== Setup =========================== */
function toneButtons(app: App, host: HTMLElement) {
  clear(host);
  const n = app.nativeCue ? app.hardwareChannels : app.eng.mixer.opened;
  for (let i = 1; i <= n; i++) host.append(btn({ label: `Output ${i}`, title: `Test tone on output ${i}`, onClick: () => {
    app.unlock();
    if (app.nativeCue && i > app.eng.mixer.opened) Native?.testTone({ output: i - 1 }).catch(() => {}); else app.eng.mixer.testTone(i);
  } }));
}

export function audioPane(ui: UI): Pane {
  const { app } = ui;
  const route = h('dl', { class: 'kv' });
  const choose = btn({ label: 'Choose output', icon: 'output', onClick: async () => {
    if (Native) { Native.showRoutePicker().catch(() => {}); return; }
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
      pickSheet('Audio output', [{ value: '', label: 'System default' }, ...devs.filter(d => d.deviceId && d.deviceId !== 'default').map(d => ({ value: d.deviceId, label: d.label || 'Output device' }))], app.sinkId, v => app.setSink(v));
    } catch { app.toast('This browser does not list outputs. Output follows the system.'); }
  } });
  const follow = h('p', { class: 'help' });
  const bt = h('div', { class: 'note bad' }, icon('warn', 'small'), h('span', { text: 'Audio is going to a Bluetooth device. The delay is far too long for live playing. Plug in the wired interface.' }));
  const mode = h('div');
  const swap = toggle({ label: 'Swap sides', value: false, onChange: v => app.patchRouting({ swap: v }) });
  const cuePair = stepper({ value: 3, min: 1, max: 7, label: 'cue outputs', format: v => `${v} and ${v + 1}`, onChange: v => app.patchRouting({ cuePair: v }) });
  const subOut = stepper({ value: 0, min: 0, max: 8, label: 'bass output', format: v => (v ? `Output ${v}` : 'Off, bass stays in Main'), onChange: v => app.patchRouting({ subOut: v }) });
  const cueOffset = stepper({ value: 0, min: -50, max: 50, label: 'cue offset', format: v => `${v > 0 ? '+' : ''}${v} ms`, onChange: v => { app.state.settings.cueOffsetMs = v; app.applyRouting(); app.changed(); } });
  const explain = h('p', { class: 'help' }), multiNote = h('div', { class: 'note warn' }, icon('warn', 'small'), h('span'));
  const splitF = field('Split', swap.el), cueF = field('Cue outputs', cuePair.el), subF = field('Bass on its own output', subOut.el), offF = field('Cue offset', cueOffset.el);
  const tones = h('div', { class: 'tones' });
  // stock click or a click set from kits/: one choice for every song
  const soundHost = h('div'), soundField = field('Click sound', soundHost);
  const el = pane(h('section', {}, h('h3', { text: 'Device' }), route, h('div', { class: 'row' }, choose), follow, bt),
    h('section', {}, h('h3', { text: 'Output mode' }), mode, explain, multiNote, splitF, cueF, subF, offF),
    h('section', {}, h('h3', { text: 'Click sound for every song' }), soundField, h('p', { class: 'help', text: 'Subdivisions, levels and the click on or off are set for each song in Song, Tempo and click.' })),
    h('section', {}, h('h3', { text: 'Test tones' }), tones, h('p', { class: 'help', text: 'Each button plays one second of tone on one physical output. Outputs are numbered the way the interface numbers them, so you can match them to DI boxes.' })));
  let modeSig = '', soundSig = '';
  return {
    el,
    update() {
      const r = app.routing, m = app.eng.mixer, rt = app.route;
      clear(route);
      const rows: Array<[string, string]> = [['Route', rt ? rt.name : app.sinkId ? 'Chosen output' : 'System output'], ['Channels', `${app.hardwareChannels} reported, ${m.opened} opened by the web view`], ['Saved for', app.deviceKey.replace(/^web:/, '')]];
      for (const [k, v] of rows) route.append(h('dt', { text: k }), h('dd', { text: v }));
      choose.hidden = !Native && !app.canPickSink;
      follow.textContent = Native ? 'The system route picker chooses the output. Routing below is remembered for each device.' : app.canPickSink ? 'Routing below is remembered for each output.' : 'This browser cannot choose an output: sound follows the system. On iPad it goes to whatever is plugged in.';
      bt.hidden = !app.bluetoothAudio;
      const sig = String(app.multiAvailable);
      if (sig !== modeSig) {
        modeSig = sig;
        const opts: Array<{ value: OutputMode; label: string }> = [{ value: 'stereo', label: 'Stereo' }, { value: 'split', label: 'Split' }];
        if (app.multiAvailable) opts.push({ value: 'multi', label: 'Multi-out' });
        const seg = segmented<OutputMode>({ label: 'Output mode', value: r.mode === 'multi' && !app.multiAvailable ? 'split' : r.mode, options: opts, onChange: v => app.patchRouting({ mode: v }) });
        mode.replaceChildren(seg.el);
      }
      const active = r.mode === 'multi' && !app.multiAvailable ? 'split' : r.mode;
      mode.querySelectorAll('.seg-btn').forEach((b, i) => b.setAttribute('aria-pressed', String(['stereo', 'split', 'multi'][i] === active)));
      explain.textContent = active === 'stereo' ? 'Everything goes to left and right.'
        : active === 'split' ? `Cue buses on the ${r.swap ? 'right' : 'left'}, Main buses summed to mono on the ${r.swap ? 'left' : 'right'}.`
        : app.nativeCue ? `Main on outputs 1 and 2 from the web view. The click is played by the app itself on outputs ${r.cuePair} and ${r.cuePair + 1}.`
        : `Main on outputs 1 and 2, Cue on outputs ${r.cuePair} and ${r.cuePair + 1}.`;
      const failed = r.mode === 'multi' && app.multiAvailable && m.opened < 4 && !app.nativeCue;
      multiNote.hidden = !(failed || (!app.multiAvailable && r.mode === 'multi'));
      multiNote.querySelector('span')!.textContent = failed
        ? `Multi-out could not open: ${m.multiError || app.nativeClick?.error || 'the web view opened only 2 channels and the native cue route is not available here'}. Split mode is in use.`
        : 'This device reports 2 channels, so Multi-out is not offered. Split mode is in use.';
      splitF.hidden = active !== 'split'; cueF.hidden = active !== 'multi'; offF.hidden = !app.nativeCue;
      subF.hidden = active !== 'multi' || app.nativeCue;
      swap.set(r.swap); cuePair.set(r.cuePair); subOut.set(r.subOut); cueOffset.set(app.state.settings.cueOffsetMs);
      if (tones.childElementCount !== (app.nativeCue ? app.hardwareChannels : m.opened)) toneButtons(app, tones);
      const sets = app.bank.index.clicksets, cur = app.clickSet?.name || 'builtin', s3 = sets.map(c => c.name).join('|');
      if (s3 !== soundSig) {
        soundSig = s3;
        soundHost.replaceChildren(segmented<string>({ label: 'Click sound', value: cur, options: [{ value: 'builtin', label: 'Built-in' }, ...sets.map(c => ({ value: c.name, label: c.name }))], onChange: v => app.setClickSound(v) }).el);
      }
      soundHost.querySelectorAll('.seg-btn').forEach((b, i) => b.setAttribute('aria-pressed', String(['builtin', ...sets.map(c => c.name)][i] === cur)));
    },
  };
}

export function midiPane(ui: UI): Pane {
  const { app } = ui;
  const S = () => app.state.settings.midi;
  const commit = () => { app.syncMidi(); app.changed(); };
  const status = h('div', { class: 'note' }, h('span'));
  const ble = btn({ label: 'Connect Bluetooth device', icon: 'bluetooth', onClick: () => app.backend.openBluetoothPicker?.().catch(() => {}) });
  const ins = h('div'), outs = h('div');
  const clock = toggle({ label: 'Send MIDI clock', value: true, onChange: v => { S().clockOut = v; commit(); } });
  const ss = toggle({ label: 'Send Start and Stop', value: false, onChange: v => { S().startStop = v; commit(); } });
  const clockMode = pickButton<'auto' | 'timestamp' | 'immediate'>({ title: 'Clock timing', value: () => S().clockMode, onPick: v => { S().clockMode = v; commit(); },
    options: () => [{ value: 'auto', label: 'Automatic' }, { value: 'timestamp', label: 'Timestamped' }, { value: 'immediate', label: 'Timer (approximate)' }] });
  const clockNote = h('p', { class: 'help' });
  const channel = stepper({ value: 0, min: 0, max: 16, label: 'MIDI channel', format: v => (v ? `Channel ${v}` : 'All channels'), onChange: v => { S().channel = v; commit(); } });
  const zone = toggle({ label: 'Keys trigger pads', value: false, onChange: v => { S().padZone = { ...S().padZone, on: v }; commit(); } });
  const zoneLow = stepper({ value: 48, min: 0, max: 111, label: 'first pad key', format: midiToName, onChange: v => { S().padZone = { ...S().padZone, low: v }; commit(); } });
  const pc = toggle({ label: 'Program change selects a song', value: false, onChange: v => { S().programChange = v; commit(); } });
  const maps = h('div');
  const mapRows = (Object.keys(MIDI_ACTIONS) as MidiAction[]).map(a => {
    const val = h('span', { class: 'label' });
    const learn = btn({ label: 'Learn', onClick: () => { val.textContent = 'Move a control'; app.midi.startLearn(b => { S().maps[a] = b; commit(); }); } });
    const clr = btn({ icon: 'close', title: `Clear ${MIDI_ACTIONS[a]}`, cls: 'ghost', onClick: () => { delete S().maps[a]; app.midi.cancelLearn(); commit(); } });
    maps.append(h('div', { class: 'dev-row' }, h('span', { class: 'dev-name', text: MIDI_ACTIONS[a] }), val, learn, clr));
    return { a, val, clr };
  });
  const monitor = h('div', { class: 'monitor', attrs: { 'aria-label': 'MIDI monitor' } });
  const el = pane(
    h('section', {}, status, h('div', { class: 'row' }, ble)),
    h('section', {}, h('h3', { text: 'Inputs' }), ins), h('section', {}, h('h3', { text: 'Outputs' }), outs),
    h('section', {}, h('h3', { text: 'Clock out' }), h('div', { class: 'row' }, clock.el, ss.el), field('Clock timing', clockMode.el), clockNote),
    h('section', {}, h('h3', { text: 'Input' }), field('Channel', channel.el), h('div', { class: 'row' }, zone.el, zoneLow.el), pc.el),
    h('section', {}, h('h3', { text: 'MIDI Learn' }), maps, h('p', { class: 'help', text: 'Learn a pedal, button or key for each action, scenes included. A Bluetooth page-turner pedal needs no setup: see Setup, Display.' })),
    h('section', {}, h('h3', { text: 'Monitor' }), monitor));
  let sig = '', timer: any = null;
  const update = () => {
    const b = app.backend, s = S();
    status.querySelector('span')!.textContent = b.kind === 'native' ? 'MIDI through CoreMIDI. USB and Bluetooth devices appear here as soon as they connect.'
      : b.kind === 'web' ? 'MIDI through Web MIDI in this browser.'
      : 'This browser has no MIDI. On iPad, use the Pad16 app, or open this page in a browser that adds Web MIDI. See docs/INSTALL_IPAD.md.';
    status.classList.toggle('warn', b.kind === 'none');
    ble.hidden = !b.openBluetoothPicker;
    const inp = b.inputs(), out = b.outputs(), s2 = JSON.stringify([inp, out, s.disabled, s.clockOffset]);
    if (s2 !== sig) {
      sig = s2;
      const row = (p: { id: string; name: string; kind: string }, isOut: boolean) => {
        const t = toggle({ label: 'Use', value: !s.disabled[p.id], onChange: v => { if (v) delete s.disabled[p.id]; else s.disabled[p.id] = true; commit(); } });
        const r = h('div', { class: 'dev-row' }, p.kind === 'ble' ? icon('bluetooth', 'small') : icon('midi', 'small'), h('span', { class: 'dev-name', text: p.name }), t.el);
        if (isOut) r.append(stepper({ value: s.clockOffset[p.name] || 0, min: -50, max: 50, label: `clock offset for ${p.name}`, format: v => `${v > 0 ? '+' : ''}${v} ms`, onChange: v => { s.clockOffset[p.name] = v; commit(); } }).el);
        return r;
      };
      ins.replaceChildren(...(inp.length ? inp.map(p => row(p, false)) : [h('p', { class: 'help', text: 'No inputs found.' })]));
      outs.replaceChildren(...(out.length ? out.map(p => row(p, true)) : [h('p', { class: 'help', text: 'No outputs found.' })]),
        h('p', { class: 'help', text: 'Clock offset shifts the clock sent to a device against the audio, from -50 to +50 ms. Set it by ear until the Nord sits on the click.' }));
    }
    clock.set(s.clockOut); ss.set(s.startStop); clockMode.update(); channel.set(s.channel); zone.set(s.padZone.on); zoneLow.set(s.padZone.low); pc.set(s.programChange);
    zoneLow.el.hidden = !s.padZone.on;
    const co = app.clockOut;
    clockNote.textContent = b.kind === 'native' ? 'Clock is generated by the app with CoreMIDI timestamps, scheduled ahead of time.'
      : co.approximate ? `Clock is approximate: this browser may ignore send timestamps, so pulses are sent by timer. Measured jitter ${co.jitterMs().toFixed(1)} ms.`
      : 'Clock is sent ahead of time with timestamps. Clock runs whenever the app is open, so the Nord is already locked when a song starts.';
    for (const m of mapRows) { const bnd = s.maps[m.a]; m.val.textContent = bnd ? `${bnd.kind === 'cc' ? 'CC' : bnd.kind === 'note' ? 'Note' : 'Program'} ${bnd.num}, ch ${bnd.ch}` : 'Not set'; m.clr.disabled = !bnd; }
    monitor.textContent = app.midi.monitor.join('\n') || 'Play a key or move a control to see it here.';
    // the monitor and the device list move on their own: keep them fresh while this section is on screen
    if (!timer) timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); timer = null; } else if (el.offsetParent !== null) update(); }, 500);
  };
  return { el, update };
}

export function displayPane(ui: UI): Pane {
  const { app } = ui;
  const S = () => app.state.settings;
  const theme = segmented<'dark' | 'light'>({ label: 'Theme', value: S().theme, options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Daylight' }], onChange: v => { S().theme = v; app.changed(); } });
  const lock = toggle({ label: 'Stage lock', icon: 'lock', value: S().editLock, onChange: v => { S().editLock = v; app.changed(); } });
  const pedal = segmented<'off' | 'song' | 'scene'>({ label: 'Pedal and arrow keys', value: 'song', options: [{ value: 'song', label: 'Change song' }, { value: 'scene', label: 'Step scenes' }, { value: 'off', label: 'Off' }],
    onChange: v => { S().pedalKeys = v !== 'off'; if (v !== 'off') S().pedalMode = v; app.changed(); } });
  const ci = toggle({ label: 'Count-in when a pad or scene starts the transport', value: S().countInOnPadLaunch, onChange: v => { S().countInOnPadLaunch = v; app.eng.padLaunchCountIn = v; app.changed(); } });
  const el = pane(h('section', {}, field('Theme', theme.el), h('p', { class: 'help', text: 'Daylight is for outdoor sets: white background and darker state colors.' })),
    h('section', {}, h('h3', { text: 'Stage' }), lock.el, h('p', { class: 'help', text: 'With stage lock on, Edit needs a press and hold, and Capture is hidden. A stray touch in Perform cannot change a song.' }),
      field('Pedal and arrow keys', pedal.el), h('p', { class: 'help', text: 'A Bluetooth page-turner pedal sends arrow keys, so it works here with no setup.' }), ci.el));
  return { el, update() { theme.set(S().theme); lock.set(S().editLock); pedal.set(!S().pedalKeys ? 'off' : S().pedalMode === 'scene' ? 'scene' : 'song'); ci.set(S().countInOnPadLaunch); } };
}

export function soundsPane(ui: UI): Pane {
  const { app } = ui;
  const status = h('div', { class: 'note' }, icon('check'), h('span', {}));
  const cfg = app.soundsSetup;
  const repo = textInput({ value: cfg.repo, max: 80, placeholder: 'owner/repository' });
  const key = textInput({ value: cfg.key, max: 200, placeholder: 'Paste the access key' });
  key.el.type = 'password'; key.el.setAttribute('aria-label', 'Access key'); key.el.setAttribute('autocomplete', 'off'); repo.el.setAttribute('aria-label', 'Sounds repository');
  let busy = false;
  const save = btn({ label: 'Connect', cls: 'primary', onClick: async () => {
    busy = true; update();
    const st = await app.setSounds({ repo: repo.el.value, key: key.el.value });
    busy = false; update();
    app.toast(st === 'connected' ? `Connected. ${app.library.length} sounds in the library.` : st === 'bad-key' ? 'That key was not accepted for this repository.' : st === 'no-key' ? 'No key entered.' : 'The repository could not be reached.');
  } });
  const forget = btn({ label: 'Remove the key', cls: 'ghost', onClick: async () => { key.el.value = ''; await app.setSounds({ key: '' }); app.toast('Key removed. Sounds fetched with it were cleared from this device.'); } });
  const keep = btn({ label: 'Keep every sound on this device', onClick: () => app.keepAllSounds() });
  const keepNote = h('p', { class: 'help' });
  const connect = h('section', {}, h('h3', { text: 'Access key' }),
    h('p', { class: 'help', text: 'The sounds are kept in a private place, because most of them are licensed for our use and may not be passed on. This device needs a key to read them. It is entered once and stays on this device; it is never part of an exported set.' }),
    field('Repository', repo.el), field('Access key', key.el), h('div', { class: 'row' }, save, forget),
    h('p', { class: 'help', text: 'To make a key: on GitHub open Settings, Developer settings, Fine-grained tokens, Generate new token. Resource owner: the organization. Repository access: only the sounds repository. Permissions: Contents, read-only. Copy the token and paste it here.' }));
  const offline = h('section', {}, h('h3', { text: 'Offline' }), h('p', { class: 'help', text: 'A sound is fetched the first time it is used and kept after that. To be sure the whole library plays with no connection, fetch it all now.' }), h('div', { class: 'row' }, keep), keepNote);
  const el = pane(h('section', {}, h('h3', { text: 'Sound library' }), status), connect, offline);
  function update() {
    const st = app.soundsState, n = app.library.length, k = app.keeping;
    const fine = st === 'bundled' || st === 'connected';
    status.className = 'note' + (fine ? '' : st === 'no-key' ? ' warn' : ' bad');
    if (status.dataset.fine !== String(fine)) { status.dataset.fine = String(fine); status.firstElementChild!.replaceWith(icon(fine ? 'check' : 'warn')); }
    status.querySelector('span')!.textContent = busy ? 'Checking the key...'
      : st === 'bundled' ? `The sounds came with this app: ${n} in the library. Nothing to set up.`
      : st === 'connected' ? `Connected to the private sounds repository: ${n} sounds in the library.`
      : st === 'no-key' ? 'No access key on this device. Kits published with the app still play; the sound library and the spoken count-in need the key.'
      : st === 'bad-key' ? 'The key was not accepted. It may have expired, or it may not include this repository.'
      : 'The sounds repository could not be reached. Sounds already on this device still play.';
    connect.hidden = st === 'bundled'; offline.hidden = st !== 'connected';
    save.disabled = busy; forget.hidden = !app.soundsSetup.key;
    keep.disabled = k.active;
    keepNote.textContent = k.active ? `Fetching: ${k.done} of ${k.total}.` : k.total ? `${k.done} of ${k.total} sounds are on this device.${k.failed ? ` ${k.failed} could not be fetched; try again on a better connection.` : ''}` : '';
  }
  return { el, update };
}

export function backupPane(ui: UI): Pane {
  const { app } = ui;
  const file = h('input', { attrs: { type: 'file', accept: '.pad16set,.zip,application/zip', hidden: '' } });
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { await app.importSetFile(await f.arrayBuffer()); app.toast('Set imported.'); } catch { app.toast('That file is not a Pad16 set.'); } });
  const which = h('p', { class: 'help' });
  const exp = btn({ label: 'Export this set', icon: 'export', onClick: async () => {
    const out = await app.exportCurrentSet(), blob = new Blob([out.data as BlobPart], { type: 'application/zip' });
    const fileObj = new File([blob], out.name, { type: 'application/zip' });
    try { if ((navigator as any).canShare?.({ files: [fileObj] })) { await (navigator as any).share({ files: [fileObj], title: out.name }); return; } } catch { /* fall back to a download */ }
    const a = h('a', { attrs: { href: URL.createObjectURL(blob), download: out.name } }); document.body.append(a); a.click(); a.remove();
  } });
  const el = pane(h('section', {}, h('h3', { text: 'Backup and transfer' }), which, h('div', { class: 'row' }, exp, btn({ label: 'Import a set', icon: 'import', onClick: () => file.click() })),
    h('p', { class: 'help', text: 'A set file holds every song in the set with its scenes, its patterns and the samples you imported. Kit and library sounds are not copied: every device gets those from the sound library.' }), file));
  return { el, update() { which.textContent = `The set open now is "${app.set.name}", with ${app.set.songIds.length} song${app.set.songIds.length === 1 ? '' : 's'}.`; } };
}

export function diagnosticsPane(ui: UI): Pane {
  const { app } = ui;
  const list = h('dl', { class: 'kv' });
  const el = pane(h('section', {}, list));
  let timer: any = null;
  const update = () => {
    const c = app.ctx as any, m = app.eng.mixer, r = app.route, b = app.backend, co = app.clockOut;
    const rows: Array<[string, string]> = [
      ['Outputs', `${app.hardwareChannels} reported, ${m.opened} opened`],
      ['Output mode', `${m.routing.mode} requested, ${app.nativeCue ? 'stereo plus native cue' : m.activeMode} active${m.multiError ? ` (${m.multiError})` : ''}`],
      ['Click', app.nativeCue ? `native, outputs ${app.routing.cuePair} and ${app.routing.cuePair + 1}` : 'Web Audio'],
      ['Sample rate', `${app.ctx.sampleRate} Hz`],
      ['Base latency', `${((app.ctx.baseLatency || 0) * 1000).toFixed(1)} ms`],
      ['Output latency', c.outputLatency !== undefined ? `${(c.outputLatency * 1000).toFixed(1)} ms` : 'not reported'],
      ['Audio state', app.ctx.state],
      ['Route', r ? `${r.name} (${r.type}), ${r.channels} ch, buffer ${r.ioBufferMs.toFixed(1)} ms${r.bluetooth ? ', Bluetooth' : ''}` : app.sinkId ? 'chosen output' : 'system output'],
      ['MIDI', b.kind === 'none' ? 'not available' : `${b.kind}, ${app.midi.link}`],
      ['MIDI in', b.inputs().map(p => p.name).join(', ') || 'none'],
      ['MIDI out', b.outputs().map(p => p.name).join(', ') || 'none'],
      ['Clock', !app.state.settings.midi.clockOut ? 'off' : b.nativeClock ? 'native, timestamped' : co.approximate ? `approximate, timer, jitter ${co.jitterMs().toFixed(1)} ms` : 'timestamped'],
      ['Send timestamps', b.timestamps === 'yes' ? 'honored' : b.timestamps === 'no' ? 'ignored' : 'unknown, treated as ignored'],
      ['Scheduler', `tick ${app.eng.scheduler.interval} ms, ahead ${Math.round(app.eng.scheduler.lookahead * 1000)} ms, worst late tick ${app.eng.scheduler.jitterMs().toFixed(1)} ms`],
      ['Samples', (() => { const g = app.sampleGaps(); return !app.bank.indexLoaded ? 'the kit list has not downloaded; pads use stand-in sounds' : g.length ? `${g.length} not loaded in this song: ${g.join(', ')}` : 'all loaded for this song'; })()],
      ['Tempo', `${app.eng.clock.bpm} BPM, ${app.eng.clock.ts.num}/${app.eng.clock.ts.den}`],
      ['Screen', `${innerWidth} by ${innerHeight}, ${ui.tier}, ${ui.arr === 'side' ? 'pads beside controls' : 'pads above controls'}`],
      ['Build', `${__PAD16_BUILD__}, ${__PAD16_IOS__ ? 'iOS app' : 'web'}, ${__PAD16_DIN__ ? 'DIN' : 'Barlow'}`],
    ];
    clear(list);
    for (const [k, v] of rows) list.append(h('dt', { text: k }), h('dd', { text: v }));
    if (!timer) timer = setInterval(() => { if (!el.isConnected) { clearInterval(timer); timer = null; } else if (el.offsetParent !== null) update(); }, 500);
  };
  return { el, update };
}
declare const __PAD16_IOS__: boolean; declare const __PAD16_DIN__: boolean;
