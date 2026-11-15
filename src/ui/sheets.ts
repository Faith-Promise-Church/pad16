// Bottom sheets: tempo, click, songs and sets, sub synth, tonic pad, settings (outputs, MIDI, diagnostics, display).
import type { App } from '../app';
import type { UI } from './views';
import { h, btn, toggle, fader, stepper, segmented, field, textInput, pickButton, pickSheet, openSheet, confirmSheet, pct, icon, clear } from './kit';
import { NOTE_NAMES, QUANTS, QUANT_LABEL, Quant, Den, Subdivision, midiToName, ClickKind } from '../engine/time';
import { MIDI_ACTIONS, MidiAction, SubTarget, SubWave, SUB_PRESETS, OutputMode } from '../store/model';
import { Native } from '../native/plugin';

const ms = (v: number) => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(1) + ' s');
const hz = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz');

/* ---------- tempo ---------- */
export function openTempo(ui: UI): void {
  const { app } = ui;
  openSheet('Tempo and meter', body => {
    const input = textInput({ value: String(app.song.bpm), numeric: true, max: 6, onCommit: v => { const n = parseFloat(v.replace(',', '.')); if (isFinite(n)) app.patchSong({ bpm: n }); } });
    input.el.setAttribute('aria-label', 'Tempo in BPM');
    const nudge = (d: number, label: string) => btn({ label, title: `Tempo ${label}`, onClick: () => app.patchSong({ bpm: +(app.song.bpm + d).toFixed(1) }) });
    const num = stepper({ value: app.song.ts.num, min: 1, max: 12, label: 'beats in the bar', onChange: v => app.setTs({ ...app.song.ts, num: v }) });
    const den = segmented<Den>({ label: 'Note value', value: app.song.ts.den, options: ([2, 4, 8, 16] as Den[]).map(d => ({ value: d, label: String(d) })), onChange: v => app.setTs({ ...app.song.ts, den: v }) });
    const countIn = segmented<0 | 1 | 2>({ label: 'Count-in', value: app.song.click.countIn, options: [{ value: 0, label: 'Off' }, { value: 1, label: '1 bar' }, { value: 2, label: '2 bars' }], onChange: v => app.patchSong({ click: { ...app.song.click, countIn: v } }) });
    const quant = pickButton<Quant>({ title: 'Launch quantize', value: () => app.song.quantize, onPick: v => app.patchSong({ quantize: v }), options: () => QUANTS.map(q => ({ value: q, label: QUANT_LABEL[q] })) });
    const note = h('p', { class: 'help' });
    body.append(
      h('section', {}, field('Tempo', h('div', { class: 'row' }, nudge(-1, '-1'), nudge(-0.1, '-0.1'), h('div', { class: 'grow' }, input.el), nudge(0.1, '+0.1'), nudge(1, '+1'), btn({ label: 'Tap', cls: 'primary', onClick: () => app.tap() }))), note),
      h('section', {}, h('h3', { text: 'Time signature' }), h('div', { class: 'two' }, field('Beats', num.el), field('Note value', den.el))),
      h('section', {}, h('h3', { text: 'Launch' }), h('div', { class: 'two' }, field('Count-in', countIn.el), field('Launch quantize for loops and patterns', quant.el))));
    return () => {
      input.set(String(app.song.bpm)); num.set(app.song.ts.num); den.set(app.song.ts.den); countIn.set(app.song.click.countIn); quant.update();
      note.textContent = app.eng.transport.pending ? 'The new tempo starts at the next bar line.' : 'Range 40 to 240 BPM. While playing, a change lands on the next bar line.';
    };
  }).update();
}

/* ---------- click ---------- */
export function openClick(ui: UI): void {
  const { app } = ui;
  const patch = (p: Partial<App['song']['click']>) => app.patchSong({ click: { ...app.song.click, ...p } });
  openSheet('Click', body => {
    const on = toggle({ label: 'Click', icon: 'click', cls: 'cue', value: app.song.click.on, onChange: v => patch({ on: v }) });
    const sub = segmented<Subdivision>({ label: 'Subdivisions', value: app.song.click.sub, options: [{ value: 'off', label: 'Off' }, { value: '8', label: 'Eighths' }, { value: '16', label: 'Sixteenths' }, { value: '3', label: 'Triplets' }], onChange: v => patch({ sub: v }) });
    const lv = { accent: fader({ value: 1, label: 'Accent', format: pct, onInput: v => patch({ accent: v }) }), beat: fader({ value: 1, label: 'Beat', format: pct, onInput: v => patch({ beat: v }) }), subLevel: fader({ value: 1, label: 'Subdivision', format: pct, onInput: v => patch({ subLevel: v }) }) };
    const slots = (['accent', 'beat', 'sub'] as ClickKind[]).map(slot => {
      const file = h('input', { attrs: { type: 'file', accept: 'audio/*,.wav,.mp3,.m4a,.aif,.aiff', hidden: '' } });
      file.addEventListener('change', () => { const f = file.files?.[0]; file.value = ''; if (f) app.setClickSample(slot, f); });
      const state = h('span', { class: 'dev-name' });
      const reset = btn({ label: 'Use built-in', cls: 'ghost', onClick: () => app.setClickSample(slot, null) });
      const row = h('div', { class: 'dev-row' }, state, btn({ label: 'Import', onClick: () => file.click() }), reset, file);
      return { slot, row, state, reset };
    });
    const dest = h('p', { class: 'help' });
    body.append(h('section', {}, h('div', { class: 'row' }, on.el), field('Subdivisions', sub.el)),
      h('section', {}, h('h3', { text: 'Levels' }), lv.accent.el, lv.beat.el, lv.subLevel.el),
      h('section', {}, h('h3', { text: 'Samples' }), ...slots.map(s => s.row)), dest);
    return () => {
      const c = app.song.click;
      on.set(c.on); sub.set(c.sub); lv.accent.set(c.accent); lv.beat.set(c.beat); lv.subLevel.set(c.subLevel);
      for (const s of slots) { const own = !!c.samples[s.slot]; s.state.textContent = `${s.slot === 'accent' ? 'Accent (beat 1)' : s.slot === 'beat' ? 'Beat' : 'Subdivision'}: ${own ? 'your sample' : 'built-in'}`; s.reset.disabled = !own; }
      const b = app.routing.buses.click;
      dest.textContent = `The click has its own bus, now sent to ${b.dest === 'cue' ? 'Cue' : 'Main'}${app.nativeCue ? ' and played by the app on its own outputs' : ''}. Change it in the mixer. Muting the click never stops the transport.`;
    };
  }).update();
}

/* ---------- songs and sets ---------- */
export function songPanel(ui: UI, body: HTMLElement): () => void {
  const { app } = ui;
  const setPick = pickButton<string>({ title: 'Set', value: () => app.set.id, onPick: v => app.selectSet(v), options: () => app.state.sets.map(s => ({ value: s.id, label: s.name, note: `${s.songIds.length} song${s.songIds.length === 1 ? '' : 's'}` })) });
  const setName = textInput({ value: app.set.name, max: 40, onInput: v => { app.set.name = v || 'Set'; app.changed(); } });
  const list = h('div', { class: 'pick-list' });
  const name = textInput({ value: '', max: 60, onInput: v => app.patchSong({ name: v }) });
  const notes = textInput({ value: '', max: 200, placeholder: 'Capo, cues, who starts', onInput: v => app.patchSong({ notes: v }) });
  const key = pickButton<number>({ title: 'Key', value: () => app.song.key, onPick: v => app.patchSong({ key: v }), options: () => NOTE_NAMES.map((n, i) => ({ value: i, label: n })) });
  const kit = pickButton<string>({ title: 'Kit', value: () => app.song.kit || 'builtin', onPick: v => app.loadKit(v), options: () => [{ value: 'builtin', label: 'Built-in drums' }, ...app.bank.index.kits.map(k => ({ value: k.name, label: k.name, note: `${k.pads.length} pads` }))] });
  const file = h('input', { attrs: { type: 'file', accept: '.pad16set,.zip,application/zip', hidden: '' } });
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { await app.importSetFile(await f.arrayBuffer()); app.toast('Set imported.'); } catch { app.toast('That file is not a Pad16 set.'); } });
  const exp = btn({ label: 'Export set', icon: 'export', onClick: async () => {
    const out = await app.exportCurrentSet(), blob = new Blob([out.data as BlobPart], { type: 'application/zip' });
    const fileObj = new File([blob], out.name, { type: 'application/zip' });
    try { if ((navigator as any).canShare?.({ files: [fileObj] })) { await (navigator as any).share({ files: [fileObj], title: out.name }); return; } } catch { /* fall back to a download */ }
    const a = h('a', { attrs: { href: URL.createObjectURL(blob), download: out.name } }); document.body.append(a); a.click(); a.remove();
  } });
  body.append(
    h('section', {}, h('h3', { text: 'Set' }), h('div', { class: 'row' }, h('div', { class: 'grow' }, setPick.el), btn({ icon: 'plus', title: 'New set', onClick: () => app.addSet() }),
      btn({ icon: 'trash', title: 'Delete set', cls: 'ghost', onClick: () => confirmSheet('Delete set', `Delete the set "${app.set.name}"? Its songs stay in the library.`, 'Delete set', () => app.deleteSet(app.set.id)) })),
      field('Set name', setName.el), list,
      h('div', { class: 'row' }, btn({ label: 'New song', icon: 'plus', cls: 'grow', onClick: () => app.addSong() }), btn({ label: 'Duplicate', icon: 'copy', cls: 'grow', onClick: () => app.addSong(app.song) }))),
    h('section', {}, h('h3', { text: 'This song' }), field('Name', name.el), h('div', { class: 'two' }, field('Key', key.el), field('Kit', kit.el)), field('Notes', notes.el)),
    h('section', {}, h('h3', { text: 'Backup and transfer' }), h('div', { class: 'row' }, exp, btn({ label: 'Import set', icon: 'import', onClick: () => file.click() })),
      h('p', { class: 'help', text: 'A set file holds every song in the set, its patterns and the samples you imported. Kit samples ship with the app and are not copied.' }), file));
  let sig = '';
  return () => {
    setPick.update(); setName.set(app.set.name); name.set(app.song.name); notes.set(app.song.notes); key.update(); kit.update();
    const songs = app.setSongs, s2 = app.set.id + songs.map(s => s.id + s.name + s.bpm + s.key + s.ts.num + s.ts.den).join('|') + app.song.id;
    if (s2 === sig) return;
    sig = s2; clear(list);
    songs.forEach((s, i) => {
      const on = s.id === app.song.id;
      list.append(h('div', { class: 'song-row' + (on ? ' on' : '') },
        h('button', { class: 'song-pick', attrs: { type: 'button', 'aria-pressed': String(on) }, on: { click: () => app.selectSong(s.id) } },
          h('span', { class: 'song-name', text: `${i + 1}. ${s.name || 'Untitled'}` }), h('span', { class: 'song-next', text: `${s.bpm} BPM, ${s.ts.num}/${s.ts.den}, ${NOTE_NAMES[s.key]}` })),
        btn({ icon: 'up', title: `Move ${s.name} up`, onClick: () => app.moveSong(s.id, -1) }), btn({ icon: 'down', title: `Move ${s.name} down`, onClick: () => app.moveSong(s.id, 1) }),
        btn({ icon: 'trash', title: `Delete ${s.name}`, onClick: () => confirmSheet('Delete song', `Delete "${s.name}"? This cannot be undone.`, 'Delete song', () => app.deleteSong(s.id)) })));
    });
  };
}
export function openSongs(ui: UI): void { openSheet('Songs and sets', body => songPanel(ui, body), { tall: true }).update(); }

/* ---------- sub synth ---------- */
export function synthPanel(ui: UI, body: HTMLElement): () => void {
  const { app } = ui;
  const P = () => app.song.sub.params;
  const patch = (p: Partial<App['song']['sub']>) => app.patchSong({ sub: { ...app.song.sub, ...p } });
  const pp = (p: Partial<App['song']['sub']['params']>) => patch({ params: { ...P(), ...p } });
  const on = toggle({ label: 'Sub synth', icon: 'synth', value: app.song.sub.on, onChange: v => { app.unlock(); patch({ on: v }); } });
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
  const targets: Array<{ value: SubTarget; label: string }> = [{ value: 'off', label: 'Off' }, { value: 'cutoff', label: 'Filter cutoff' }, { value: 'level', label: 'Sub level' }, { value: 'drive', label: 'Drive' }, { value: 'subOsc', label: 'Sub octave level' }];
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
  body.append(
    h('section', {}, h('div', { class: 'row' }, on.el, h('div', { class: 'grow' }, preset.el)), level.el, keys),
    h('section', {}, h('h3', { text: 'Key range' }), h('div', { class: 'row' }, field('Lowest', lo.el), field('Highest', hi.el), learn),
      h('p', { class: 'help', text: 'Only keys in this range play the bass. When several are held, the lowest sounds.' })),
    h('section', {}, h('h3', { text: 'Oscillator' }), field('Waveform', wave.el), f.subOsc.el, f.drive.el, field('Octave', octave.el), f.glide.el),
    h('section', {}, h('h3', { text: 'Filter' }), field('Slope', poles.el), f.cutoff.el, f.resonance.el, f.envAmount.el),
    h('section', {}, h('h3', { text: 'Envelope' }), f.attack.el, f.decay.el, f.sustain.el, f.release.el),
    h('section', {}, h('h3', { text: 'Controllers' }), h('div', { class: 'row' }, pedal.el, bend.el), h('div', { class: 'two' }, field('Mod wheel (CC 1)', cc1.el), field('Expression (CC 11)', cc11.el)),
      h('p', { class: 'help', text: 'A fixed 30 Hz high-pass protects the speakers. The pedal holds the sounding note; a new key replaces it.' })));
  return () => {
    const s = app.song.sub, p = s.params;
    on.set(s.on); preset.update(); level.set(s.level); lo.set(s.lo); hi.set(s.hi); wave.set(p.wave); poles.set(p.poles); octave.set(p.octave);
    for (const k of Object.keys(f) as Array<keyof typeof f>) f[k].set(p[k] as number);
    pedal.set(s.pedal); bend.set(s.bend === 'pitch'); cc1.update(); cc11.update();
    const cur = app.eng.sub.currentNote;
    for (const k of keyEls) k.b.dataset.on = String(cur !== null && cur === k.note());
  };
}
export function openSynth(ui: UI): void { openSheet('Sub synth', body => synthPanel(ui, body), { tall: true }).update(); }

/* ---------- tonic pad ---------- */
export function openTonic(ui: UI): void {
  const { app } = ui;
  const patch = (p: Partial<App['song']['tonic']>) => app.patchSong({ tonic: { ...app.song.tonic, ...p } });
  openSheet('Tonic pad', body => {
    const on = toggle({ label: 'Pad', icon: 'pad', value: app.song.tonic.on, onChange: v => { app.unlock(); patch({ on: v }); } });
    const set = pickButton<string>({ title: 'Pad set', value: () => app.eng.tonic.set?.name || '', onPick: v => patch({ set: v }), options: () => app.bank.index.padsets.map(p => ({ value: p.name, label: p.name, note: `${Object.keys(p.keys).length} of 12 keys` })) });
    const keys = h('div', { class: 'key-grid' });
    const keyBtns = NOTE_NAMES.map((n, i) => { const b = btn({ label: n, title: `Key ${n}`, onClick: () => app.patchSong({ key: i }) }); keys.append(b); return b; });
    const sec = (v: number) => v.toFixed(1) + ' s';
    const level = fader({ value: 0.7, label: 'Level', format: pct, onInput: v => patch({ level: v }) });
    const fin = fader({ value: 4, min: 0.1, max: 12, label: 'Fade in', format: sec, onInput: v => patch({ fadeIn: v }) });
    const fout = fader({ value: 6, min: 0.1, max: 12, label: 'Fade out', format: sec, onInput: v => patch({ fadeOut: v }) });
    const xf = fader({ value: 4, min: 2, max: 8, label: 'Key change crossfade', format: sec, onInput: v => patch({ xfade: v }) });
    const lp = fader({ value: 20000, min: 200, max: 20000, curve: 'log', label: 'Low-pass', format: hz, onInput: v => patch({ lp: v }) });
    const hp = fader({ value: 20, min: 20, max: 2000, curve: 'log', label: 'High-pass', format: hz, onInput: v => patch({ hp: v }) });
    const status = h('div', { class: 'note' }, h('span'));
    body.append(h('section', {}, h('div', { class: 'row' }, on.el, h('div', { class: 'grow' }, set.el)), status, field('Key', keys), level.el),
      h('section', {}, h('h3', { text: 'Fades' }), fin.el, fout.el, xf.el), h('section', {}, h('h3', { text: 'Tone' }), lp.el, hp.el));
    return () => {
      const s = app.song.tonic, tp = app.eng.tonic;
      on.set(s.on); set.update(); level.set(s.level); fin.set(s.fadeIn); fout.set(s.fadeOut); xf.set(s.xfade); lp.set(s.lp); hp.set(s.hp);
      keyBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === app.song.key)));
      const pk = tp.pick(app.song.key);
      status.querySelector('span')!.textContent = !app.bank.index.padsets.length ? 'No pad set found. Add a folder of files named Pad C.wav, Pad Db.wav and so on under kits/. See SAMPLES.md.'
        : !pk ? 'This pad set has no samples.'
        : pk.shift ? `Fallback: no sample for ${NOTE_NAMES[app.song.key]} in this set, so ${pk.file} is pitch-shifted by ${pk.shift > 0 ? '+' : ''}${pk.shift} semitones.`
        : `Playing ${pk.file}${tp.status === 'loading' ? ' (loading)' : tp.status === 'missing' ? ' (file could not be read)' : ''}.`;
      status.classList.toggle('warn', !pk || !!pk.shift || tp.status === 'missing');
    };
  }).update();
}

/* ---------- settings ---------- */
export function openSettings(ui: UI, tab = 'outputs'): void {
  const { app } = ui;
  openSheet('Settings', body => {
    const panes: Record<string, { el: HTMLElement; update: () => void }> = { outputs: outputsPane(ui), midi: midiPane(ui), diagnostics: diagnosticsPane(ui), display: displayPane(ui) };
    const tabs = segmented<string>({ label: 'Settings section', value: tab, options: [{ value: 'outputs', label: 'Outputs' }, { value: 'midi', label: 'MIDI' }, { value: 'diagnostics', label: 'Diagnostics' }, { value: 'display', label: 'Display' }], onChange: v => { tab = v; show(); } });
    const show = () => { for (const k of Object.keys(panes)) panes[k].el.hidden = k !== tab; panes[tab].update(); };
    body.append(tabs.el, ...Object.values(panes).map(p => p.el));
    show();
    const timer = setInterval(() => { if (!body.isConnected) clearInterval(timer); else if (tab === 'diagnostics' || tab === 'midi') panes[tab].update(); }, 500);
    return () => panes[tab].update();
  }, { tall: true, id: 'sheet-settings' });
}

function toneButtons(app: App, host: HTMLElement) {
  clear(host);
  const n = app.nativeCue ? app.hardwareChannels : app.eng.mixer.opened;
  for (let i = 1; i <= n; i++) host.append(btn({ label: `Output ${i}`, title: `Test tone on output ${i}`, onClick: () => {
    app.unlock();
    if (app.nativeCue && i > app.eng.mixer.opened) Native?.testTone({ output: i - 1 }).catch(() => {}); else app.eng.mixer.testTone(i);
  } }));
}

function outputsPane(ui: UI) {
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
  const subOut = stepper({ value: 0, min: 0, max: 8, label: 'sub output', format: v => (v ? `Output ${v}` : 'Off, sub stays in Main'), onChange: v => app.patchRouting({ subOut: v }) });
  const cueOffset = stepper({ value: 0, min: -50, max: 50, label: 'cue offset', format: v => `${v > 0 ? '+' : ''}${v} ms`, onChange: v => { app.state.settings.cueOffsetMs = v; app.applyRouting(); app.changed(); } });
  const cueLevel = fader({ value: 1, max: 1.2, label: 'Cue level', format: pct, onInput: v => app.patchRouting({ cueLevel: v }) });
  const explain = h('p', { class: 'help' }), multiNote = h('div', { class: 'note warn' }, icon('warn', 'small'), h('span'));
  const splitF = field('Split', swap.el), cueF = field('Cue outputs', cuePair.el), subF = field('Sub synth on its own output', subOut.el), offF = field('Cue offset', cueOffset.el);
  const tones = h('div', { class: 'tones' });
  const el = h('div', {}, h('section', {}, h('h3', { text: 'Device' }), route, h('div', { class: 'row' }, choose), follow, bt),
    h('section', {}, h('h3', { text: 'Output mode' }), mode, explain, multiNote, splitF, cueF, subF, offF, cueLevel.el),
    h('section', {}, h('h3', { text: 'Test tones' }), tones, h('p', { class: 'help', text: 'Each button plays one second of tone on one physical output. Outputs are numbered the way the interface numbers them, so you can match them to DI boxes.' })));
  el.className = 'sheet-body pane';
  let modeSig = '';
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
      splitF.hidden = active !== 'split'; cueF.hidden = subF.hidden = active !== 'multi'; offF.hidden = !app.nativeCue;
      subF.hidden = active !== 'multi' || app.nativeCue;
      swap.set(r.swap); cuePair.set(r.cuePair); subOut.set(r.subOut); cueOffset.set(app.state.settings.cueOffsetMs); cueLevel.set(r.cueLevel);
      if (tones.childElementCount !== (app.nativeCue ? app.hardwareChannels : m.opened)) toneButtons(app, tones);
    },
  };
}

function midiPane(ui: UI) {
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
  const el = h('div', { class: 'sheet-body' },
    h('section', {}, status, h('div', { class: 'row' }, ble)),
    h('section', {}, h('h3', { text: 'Inputs' }), ins), h('section', {}, h('h3', { text: 'Outputs' }), outs),
    h('section', {}, h('h3', { text: 'Clock out' }), h('div', { class: 'row' }, clock.el, ss.el), field('Clock timing', clockMode.el), clockNote),
    h('section', {}, h('h3', { text: 'Input' }), field('Channel', channel.el), h('div', { class: 'row' }, zone.el, zoneLow.el), pc.el),
    h('section', {}, h('h3', { text: 'MIDI Learn' }), maps, h('p', { class: 'help', text: 'Learn a pedal, button or key for each action. A Bluetooth page-turner pedal needs no setup: its arrow keys already move between songs.' })),
    h('section', {}, h('h3', { text: 'Monitor' }), monitor));
  el.classList.add('pane');
  let sig = '';
  return {
    el,
    update() {
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
    },
  };
}

function diagnosticsPane(ui: UI) {
  const { app } = ui;
  const list = h('dl', { class: 'kv' }), tones = h('div', { class: 'tones' });
  const el = h('div', { class: 'sheet-body' }, h('section', {}, list), h('section', {}, h('h3', { text: 'Test tones' }), tones));
  el.classList.add('pane');
  return {
    el,
    update() {
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
        ['Tempo', `${app.eng.clock.bpm} BPM, ${app.eng.clock.ts.num}/${app.eng.clock.ts.den}`],
        ['Build', `${__PAD16_IOS__ ? 'iOS app' : 'web'}, ${__PAD16_DIN__ ? 'DIN' : 'Barlow'}`],
      ];
      clear(list);
      for (const [k, v] of rows) list.append(h('dt', { text: k }), h('dd', { text: v }));
      if (tones.childElementCount !== (app.nativeCue ? app.hardwareChannels : m.opened)) toneButtons(app, tones);
    },
  };
}

function displayPane(ui: UI) {
  const { app } = ui;
  const S = () => app.state.settings;
  const theme = segmented<'dark' | 'light'>({ label: 'Theme', value: S().theme, options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Daylight' }], onChange: v => { S().theme = v; app.changed(); } });
  const lock = toggle({ label: 'Edit lock', icon: 'lock', value: S().editLock, onChange: v => { S().editLock = v; if (v) ui.setEdit(false); app.changed(); } });
  const pedal = toggle({ label: 'Pedal and arrow keys change song', value: S().pedalKeys, onChange: v => { S().pedalKeys = v; app.changed(); } });
  const ci = toggle({ label: 'Count-in when a pad starts the transport', value: S().countInOnPadLaunch, onChange: v => { S().countInOnPadLaunch = v; app.eng.padLaunchCountIn = v; app.changed(); } });
  const el = h('div', { class: 'sheet-body' }, h('section', {}, field('Theme', theme.el), h('p', { class: 'help', text: 'Daylight is for outdoor sets: white background and darker state colors.' })),
    h('section', {}, h('h3', { text: 'Stage' }), lock.el, pedal.el, ci.el, btn({ label: 'Panic: stop everything', icon: 'panic', cls: 'danger', onClick: () => app.panic() })));
  el.classList.add('pane');
  return { el, update() { theme.set(S().theme); lock.set(S().editLock); pedal.set(S().pedalKeys); ci.set(S().countInOnPadLaunch); } };
}
declare const __PAD16_IOS__: boolean; declare const __PAD16_DIN__: boolean;
