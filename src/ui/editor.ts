// Edit view: the selected pad's settings, and the step sequencer for pattern pads.
import type { App } from '../app';
import type { UI, View } from './views';
import { h, btn, fader, stepper, segmented, field, textInput, pickButton, openSheet, pickSheet, confirmSheet, pct, icon, clear } from './kit';
import { QUANTS, QUANT_LABEL, Quant, beatsPerBar } from '../engine/time';
import { confidenceLabel } from '../engine/detect';
import { emptyPattern, resizePattern, patternSteps, Pattern, TrackSrc, LEVELS, LEVEL_NORMAL, stepVel } from '../engine/patterns';
import { SOUNDS } from '../engine/synthkit';
import { Group, StopMode, SyncMode, uid, PAGE, PAD_COLORS, PadColor } from '../store/model';
import { PadMode } from '../engine/tags';

export function editorView(ui: UI): View {
  const { app } = ui;
  const pad = () => app.song.pads[app.selected];
  const patch = (p: Parameters<App['patchPad']>[1]) => app.patchPad(app.selected, p);
  const title = h('span', { class: 'editor-title' }), keyHint = h('span', { class: 'label' });
  const name = textInput({ value: '', max: 40, placeholder: 'Pad name', onInput: v => patch({ name: v }) });
  const file = h('input', { attrs: { type: 'file', accept: 'audio/*,.wav,.mp3,.ogg,.m4a,.aif,.aiff,.flac,.caf', multiple: '', hidden: '' } });
  file.addEventListener('change', () => { const fs = [...(file.files || [])]; file.value = ''; if (fs.length) app.loadFiles(fs, app.selected); });
  const load = btn({ label: 'Load sample', cls: 'primary grow', onClick: () => file.click() });
  const reset = btn({ label: 'Reset pad', cls: 'ghost grow', onClick: () => app.resetPad(app.selected) });
  const info = h('p', { class: 'help' });
  // color: none, or one of the muted pad colors
  const swatches = (['', ...PAD_COLORS] as Array<PadColor | ''>).map(c => {
    const label = c ? c[0].toUpperCase() + c.slice(1) : 'No color';
    const b = h('button', { class: 'swatch', title: label, attrs: { type: 'button', 'aria-label': label, ...(c ? { 'data-color': c } : {}) } }, ...(c ? [] : [icon('close', 'small')]));
    b.addEventListener('click', () => { const i = app.selected, cfg = { ...app.song.pads[i] }; if (c) cfg.color = c; else delete cfg.color; app.song.pads[i] = cfg; app.eng.pads.setPad(i, cfg, app.eng.pads.pads[i].buffer); app.changed(); });
    return { b, c };
  });
  const colorField = field('Color', h('div', { class: 'swatches', attrs: { role: 'group', 'aria-label': 'Pad color' } }, ...swatches.map(x => x.b)));
  // a slot that shows a pad from the other page
  const sharedText = h('span', { class: 'grow' }), shared = h('div', { class: 'note shared', attrs: { hidden: '' } }, sharedText, btn({ label: 'Make separate', cls: 'ghost', onClick: () => app.unlinkPad(app.selectedVia) }));
  const wave = h('canvas', { class: 'editor-wave' });
  const vol = fader({ value: 0.9, max: 1.5, label: 'Volume', format: pct, reset: 0.9, onInput: v => patch({ volume: v }) });
  const pitch = stepper({ value: 0, min: -24, max: 24, label: 'pitch', format: v => (v > 0 ? '+' : '') + v + ' st', onChange: v => patch({ pitch: v }) });
  const mode = segmented<PadMode>({
    label: 'Pad type', value: 'oneshot', options: [{ value: 'oneshot', label: 'One shot' }, { value: 'hold', label: 'Hold' }, { value: 'loop', label: 'Loop' }, { value: 'pattern', label: 'Pattern' }],
    onChange: v => {
      const p = pad();
      if (v === 'pattern') patch({ mode: v, patternId: p.patternId || app.state.patterns[0]?.id || '' });
      else if (v === 'loop') { patch({ mode: v, sync: p.sync === 'off' && !p.sourceBpm ? 'repitch' : p.sync }); if (!pad().sourceBpm) app.detectPad(app.selected, p.src.t === 'kit' ? p.src.file : p.name); }
      else patch({ mode: v });
    },
  });
  // loop section
  const sync = segmented<SyncMode>({ label: 'Sync', value: 'repitch', options: [{ value: 'stretch', label: 'Stretch' }, { value: 'repitch', label: 'Repitch' }, { value: 'off', label: 'Off' }], onChange: v => patch({ sync: v }) });
  const srcBpm = stepper({ value: 120, min: 30, max: 300, step: 0.1, bigStep: 1, label: 'source tempo', format: v => v.toFixed(1), onChange: v => patch({ sourceBpm: v, conf: 1 }) });
  const conf = h('span', { class: 'label' });
  const bars = stepper({ value: 1, min: 0.25, max: 64, step: 0.25, bigStep: 1, label: 'bars', format: v => +v.toFixed(2) + (v === 1 ? ' bar' : ' bars'), onChange: v => patch({ lengthBeats: v * beatsPerBar(app.song.ts) }) });
  const half = btn({ label: '/2', title: 'Halve the source tempo', onClick: () => patch({ sourceBpm: Math.max(30, pad().sourceBpm / 2), conf: 1 }) });
  const dbl = btn({ label: 'x2', title: 'Double the source tempo', onClick: () => patch({ sourceBpm: Math.min(300, pad().sourceBpm * 2), conf: 1 }) });
  const detect = btn({ label: 'Detect', cls: 'ghost', onClick: () => { const p = pad(); app.detectPad(app.selected, p.src.t === 'kit' ? p.src.file : p.name); } });
  const warn = h('div', { class: 'note warn' }, icon('warn', 'small'), h('span'));
  const loopSec = h('section', {}, h('h3', { text: 'Loop tempo' }), field('Sync', sync.el),
    field('Source tempo', h('div', { class: 'row' }, srcBpm.el, half, dbl, detect, conf)), field('Length', bars.el), warn);
  // launch section
  const quant = pickButton<Quant | 'global'>({
    title: 'Launch quantize', value: () => pad().quantize, onPick: v => patch({ quantize: v }),
    options: () => [{ value: 'global' as const, label: 'Song default', note: QUANT_LABEL[app.eng.pads.quantOf(app.eng.pads.pads[app.selected])] }, ...QUANTS.map(q => ({ value: q, label: QUANT_LABEL[q] }))],
  });
  const stop = segmented<StopMode>({ label: 'Stop', value: 'quantized', options: [{ value: 'immediate', label: 'Now' }, { value: 'quantized', label: 'Quantized' }, { value: 'end', label: 'End of loop' }, { value: 'fade', label: 'Fade' }], onChange: v => patch({ stopMode: v }) });
  const fadeBeats = stepper({ value: 4, min: 1, max: 16, label: 'fade length', format: v => v + (v === 1 ? ' beat' : ' beats'), onChange: v => patch({ fadeBeats: v }) });
  const fadeField = field('Fade length', fadeBeats.el);
  const group = segmented<Group>({ label: 'Exclusive group', value: '', options: [{ value: '', label: 'None' }, { value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }, { value: 'D', label: 'D' }], onChange: v => patch({ group: v }) });
  const stopField = field('Stop', stop.el), groupField = field('Exclusive group', group.el);
  const launchSec = h('section', {}, h('h3', { text: 'Launch and stop' }), field('Launch quantize', quant.el), stopField, fadeField, groupField);
  // pattern section
  const pat = pickButton<string>({ title: 'Pattern', value: () => pad().patternId, onPick: v => patch({ patternId: v }), options: () => app.state.patterns.map(p => ({ value: p.id, label: p.name, note: `${p.bars} bar${p.bars === 1 ? '' : 's'}` })) });
  const editPat = btn({ label: 'Edit pattern', cls: 'primary grow', onClick: () => ui.openSequencer(pad().patternId) });
  const newPat = btn({ label: 'New pattern', cls: 'ghost grow', onClick: () => { const p = emptyPattern(uid(), 'New pattern', app.song.ts); app.state.patterns.push(p); patch({ patternId: p.id }); ui.openSequencer(p.id); } });
  const patSec = h('section', {}, h('h3', { text: 'Pattern' }), field('Pattern', pat.el), h('div', { class: 'row' }, editPat, newPat));
  const sampleSec = h('section', {}, h('div', { class: 'row' }, load, reset), info, wave);
  // a kit goes onto every pad of the song at once, so it asks first
  const kitLabel = (v: string) => (v === 'rig' ? 'the default layout' : v === 'builtin' ? 'the built-in drums' : v);
  const kit = pickButton<string>({ title: 'Kit', value: () => app.song.kit || 'builtin',
    onPick: v => confirmSheet('Load kit', `Put ${kitLabel(v)} on the pads of "${app.song.name}"? Every pad on both pages is replaced. Scenes keep pointing at the same pad positions.`, 'Load kit', () => app.loadKit(v)),
    options: () => [{ value: 'rig', label: 'Default layout', note: 'Two pages: cajon and kick' }, ...app.bank.index.kits.map(k => ({ value: k.name, label: k.name, note: `${k.pads.length} pads` })), { value: 'builtin', label: 'Built-in drums', note: 'Synthesized' }] });
  const kitSec = h('section', {}, h('h3', { text: 'All pads in this song' }), field('Kit', kit.el), h('p', { class: 'help', text: 'A kit fills every pad at once. To change one pad, use Load sample above.' }));
  const levelSec = h('section', {}, vol.el, field('Pitch', pitch.el));
  const el = h('aside', { class: 'editor', attrs: { 'aria-label': 'Pad settings' } },
    h('div', { class: 'editor-head' }, title, keyHint), shared, field('Name', name.el), colorField, field('Pad type', mode.el), sampleSec, levelSec, loopSec, patSec, launchSec, kitSec, file);
  let drawn: AudioBuffer | null = null, drawnW = 0;
  function drawWave(buffer: AudioBuffer | null) {
    const r = wave.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    wave.width = Math.max(1, Math.round(r.width * dpr)); wave.height = Math.max(1, Math.round(r.height * dpr));
    const g = wave.getContext('2d'); if (!g) return;
    g.clearRect(0, 0, wave.width, wave.height);
    if (!buffer) return;
    const d = buffer.getChannelData(0), step = Math.max(1, Math.floor(d.length / wave.width)), mid = wave.height / 2;
    g.fillStyle = getComputedStyle(el).color;
    for (let x = 0; x < wave.width; x++) {
      let mn = 1, mx = -1; const s = x * step;
      for (let k = 0; k < step && s + k < d.length; k += 2) { const v = d[s + k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx >= mn) g.fillRect(x, mid - mx * mid * 0.9, 1, Math.max(1, (mx - mn) * mid * 0.9));
    }
  }
  return {
    el,
    update() {
      if (!app.state.settings.edit || app.state.settings.dest !== 'pads') return;
      kit.update();
      const i = app.selected, p = pad(), rt = app.eng.pads.pads[i], meta = app.padMeta[i], b = rt.buffer;
      const isLoop = p.mode === 'loop', isPat = p.mode === 'pattern', synced = app.eng.pads.synced(rt);
      const via = app.selectedVia, where = (n: number) => `${app.pageName(Math.floor(n / PAGE))}, pad ${(n % PAGE) + 1}`;
      title.textContent = where(i);
      keyHint.textContent = 'Key ' + ['1', '2', '3', '4', 'Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'][via % PAGE];
      shared.hidden = via === i;
      if (via !== i) sharedText.textContent = `This is the same pad as ${where(i)}. A change here changes it on both pages.`;
      name.set(p.name); name.el.placeholder = app.padName(i);
      mode.set(p.mode); vol.set(p.volume); pitch.set(p.pitch);
      for (const x of swatches) x.b.setAttribute('aria-pressed', String((p.color || '') === x.c));
      reset.disabled = p.src.t === 'builtin' && p.mode === 'oneshot' && !p.name;
      info.textContent = isPat ? 'This pad plays a pattern built from samples. It follows the master tempo with no stretching.'
        : !b ? 'No sample loaded.'
        : `${b.duration < 1 ? Math.round(b.duration * 1000) + ' ms' : b.duration.toFixed(2) + ' s'}, ${(b.sampleRate / 1000).toFixed(1)} kHz, ${b.numberOfChannels === 1 ? 'mono' : 'stereo'}, `
          + (meta.missing ? 'file missing, playing a stand-in' : p.src.t === 'builtin' ? 'built-in' : p.src.t === 'kit' ? 'from kit ' + p.src.kit : 'your sample');
      sampleSec.hidden = isPat; levelSec.querySelector('.field')!.toggleAttribute('hidden', synced);
      loopSec.hidden = !isLoop; patSec.hidden = !isPat;
      stopField.hidden = groupField.hidden = !(isLoop || isPat);
      fadeField.hidden = !(isLoop || isPat) || p.stopMode !== 'fade';
      if (isLoop) {
        sync.set(p.sync); srcBpm.set(p.sourceBpm || 120); bars.set((p.lengthBeats || beatsPerBar(app.song.ts)) / beatsPerBar(app.song.ts));
        conf.textContent = p.sourceBpm ? `Confidence: ${confidenceLabel(p.conf)}` : 'Not detected';
        const st = meta.stretch, w = app.stretchWarning(i);
        warn.hidden = !(w || st === 'failed' || st === 'busy');
        warn.querySelector('span')!.textContent = st === 'failed' ? 'Stretch could not render. This loop is playing in Repitch mode.'
          : st === 'busy' ? 'Rendering the stretched loop. Until it is ready the pad plays in Repitch mode.'
          : `This loop is stretched by ${Math.round(Math.abs(app.song.bpm / p.sourceBpm - 1) * 100)} percent. Past 12 percent it can sound smeared; Repitch is cleaner on drums.`;
      }
      quant.update(); stop.set(p.stopMode); fadeBeats.set(p.fadeBeats); group.set(p.group); pat.update();
      const w = wave.clientWidth;
      if (!isPat && (b !== drawn || w !== drawnW)) { drawn = b; drawnW = w; drawWave(b); }
    },
  };
}

/* ---------- step sequencer ---------- */
export function openSequencer(ui: UI, patternId: string): void {
  const { app } = ui;
  const get = () => app.state.patterns.find(p => p.id === patternId);
  if (!get()) return;
  const set = (p: Pattern) => { const i = app.state.patterns.findIndex(x => x.id === patternId); if (i >= 0) app.state.patterns[i] = p; app.warmPattern(patternId); app.changed(); };
  const srcLabel = (s: TrackSrc) => (s.t === 'synth' ? SOUNDS.find(x => x.id === s.id)?.name || s.id : s.t === 'pad' ? `Pad ${s.i + 1}: ${app.padName(s.i)}` : s.t === 'kit' ? s.file.replace(/\.[^.]+$/, '') : 'Sample');
  const sources = (): Array<{ value: string; label: string; note?: string }> => [
    ...app.song.pads.map((c, i) => ({ c, i })).filter(x => x.c.mode !== 'pattern' && x.c.src.t !== 'none').map(x => ({ value: JSON.stringify({ t: 'pad', i: x.i }), label: `Pad ${x.i + 1}: ${app.padName(x.i)}`, note: 'Pad' })),
    ...SOUNDS.filter(s => !s.id.startsWith('click')).map(s => ({ value: JSON.stringify({ t: 'synth', id: s.id }), label: s.name, note: 'Stand-in' })),
    ...app.bank.index.kits.flatMap(k => [...k.pads, ...(k.extras || [])].map(e => ({ value: JSON.stringify({ t: 'kit', kit: k.dir, file: e.file }), label: e.name, note: k.name }))),
  ];
  let stepEls: HTMLButtonElement[][] = [];
  openSheet('Pattern', (body) => {
    const p0 = get()!;
    const name = textInput({ value: p0.name, max: 40, onInput: v => set({ ...get()!, name: v || 'Pattern' }) });
    const barsSeg = segmented<number>({ label: 'Length', value: p0.bars, options: [1, 2, 4].map(b => ({ value: b, label: b + (b === 1 ? ' bar' : ' bars') })), onChange: v => { set(resizePattern(get()!, tsOf(), v as 1 | 2 | 4, get()!.grid)); build(); } });
    const gridSeg = segmented<'16' | '3'>({ label: 'Grid', value: p0.grid, options: [{ value: '16', label: 'Sixteenths' }, { value: '3', label: 'Triplets' }], onChange: v => { set(resizePattern(get()!, tsOf(), get()!.bars, v)); build(); } });
    const swing = stepper({ value: p0.swing, min: 50, max: 75, label: 'swing', format: v => v + '%', onChange: v => set({ ...get()!, swing: v }) });
    const fit = btn({ label: 'Fit to time signature', cls: 'ghost', onClick: () => { set(resizePattern(get()!, app.song.ts, get()!.bars, get()!.grid)); build(); } });
    const playPad = () => app.song.pads.findIndex(c => c.mode === 'pattern' && c.patternId === patternId);
    const play = btn({ label: 'Play', icon: 'play', cls: 'primary', onClick: () => {
      app.unlock();
      let i = playPad();
      if (i < 0) { i = app.selected; app.patchPad(i, { mode: 'pattern', patternId }); }
      app.eng.pads.trigger(i);
    } });
    const seq = h('div', { class: 'seq' });
    // resizing keeps the meter the pattern was written in; Fit moves it to the song's meter
    function tsOf() { return get()!.ts || app.song.ts; }
    function build() {
      const p = get()!; clear(seq); stepEls = [];
      const mismatch = p.bpb !== beatsPerBar(app.song.ts);
      fit.hidden = !mismatch;
      p.tracks.forEach((tr, ti) => {
        const nameBtn = btn({ label: tr.name, cls: 'seq-name ghost', title: `Track ${ti + 1} sound`, onClick: () => pickSheet('Track sound', sources(), JSON.stringify(tr.src), v => {
          const src = JSON.parse(v) as TrackSrc, q = get()!;
          q.tracks[ti] = { ...q.tracks[ti], src, name: srcLabel(src).replace(/^Pad \d+: /, '') }; set(q); build();
        }) });
        const mute = btn({ icon: tr.mute ? 'mute' : 'output', title: `${tr.mute ? 'Unmute' : 'Mute'} ${tr.name}`, cls: 'ghost', onClick: () => { const q = get()!; q.tracks[ti] = { ...q.tracks[ti], mute: !q.tracks[ti].mute }; set(q); build(); } });
        mute.setAttribute('aria-pressed', String(tr.mute));
        const steps = h('div', { class: 'seq-steps' });
        const row: HTMLButtonElement[] = [];
        for (let s = 0; s < patternSteps(p); s++) {
          const b = h('button', { class: 'step' + (s % p.spb === 0 ? ' beat' : '') + (s > 0 && s % (p.spb * p.bpb) === 0 ? ' bar' : ''), attrs: { type: 'button', 'data-v': String(tr.steps[s] | 0), 'aria-label': `${tr.name} step ${s + 1}` } });
          // tap turns a step on or off; drag up or down sets its level, 1 to 8
          const paint = (v: number) => { b.dataset.v = String(v); b.style.setProperty('--lv', String(v / LEVELS)); b.setAttribute('aria-label', `${tr.name} step ${s + 1}, ${v ? 'level ' + v : 'off'}`); };
          const put = (v: number, audition: boolean) => {
            const q = get()!; if ((q.tracks[ti].steps[s] | 0) === v) return;
            q.tracks[ti].steps[s] = v; paint(v); set(q);
            if (audition && v && !app.eng.transport.running) { const buf = app.eng.pads.trackBuffer(q.tracks[ti].src); if (buf) { const src = app.ctx.createBufferSource(), g = app.ctx.createGain(); src.buffer = buf; g.gain.value = stepVel(v) * q.tracks[ti].level; src.connect(g); g.connect(app.eng.mixer.input('drums')); src.start(); } }
          };
          let y0 = 0, v0 = 0, moved = false, down = false;
          b.addEventListener('pointerdown', e => { down = true; moved = false; y0 = e.clientY; v0 = get()!.tracks[ti].steps[s] | 0; try { b.setPointerCapture(e.pointerId); } catch { /* fine */ } });
          b.addEventListener('pointermove', e => {
            if (!down) return;
            const dy = y0 - e.clientY;
            if (!moved && Math.abs(dy) < 6) return;
            moved = true;
            put(Math.min(LEVELS, Math.max(1, (v0 || LEVEL_NORMAL) + Math.round(dy / 7))), false);
          });
          b.addEventListener('pointerup', () => { if (!down) return; down = false; if (moved) put(get()!.tracks[ti].steps[s] | 0, false); else put(v0 ? 0 : LEVEL_NORMAL, true); });
          b.addEventListener('pointercancel', () => { down = false; });
          b.addEventListener('keydown', e => {
            const cur = get()!.tracks[ti].steps[s] | 0;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); put(cur ? 0 : LEVEL_NORMAL, true); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); put(Math.min(LEVELS, (cur || LEVEL_NORMAL - 1) + 1), true); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); put(Math.max(1, (cur || LEVEL_NORMAL + 1) - 1), true); }
          });
          paint(tr.steps[s] | 0);
          steps.append(b); row.push(b);
        }
        stepEls.push(row);
        const level = fader({ value: tr.level, max: 1.2, label: 'Level', reset: 1, onInput: v => { const q = get()!; q.tracks[ti] = { ...q.tracks[ti], level: v }; set(q); } });
        level.el.classList.add('seq-level');
        seq.append(h('div', { class: 'seq-row' }, nameBtn, mute, level.el, steps));
      });
    }
    build();
    body.append(
      h('div', { class: 'two' }, field('Name', name.el), field('Length', barsSeg.el), field('Grid', gridSeg.el), field('Swing', swing.el)),
      h('div', { class: 'row' }, play, fit, h('span', { class: 'help', text: 'Tap a step to turn it on or off. Drag up or down on a step to set its level, from 1 (softest) to 8 (accent). Edits are heard on the next pass, even while playing.' })),
      seq);
    return () => { /* state is pushed from here; nothing to pull */ };
  }, { tall: true, id: 'sheet-sequencer' });
  // playhead
  const tick = () => {
    if (!document.getElementById('sheet-sequencer')) return;
    const p = get(), i = app.song.pads.findIndex(c => c.mode === 'pattern' && c.patternId === patternId);
    let now = -1;
    if (p && i >= 0) { const v = app.eng.pads.view(i); if (v.state === 'playing' || v.state === 'stopping') now = Math.floor(v.progress * patternSteps(p) + 1e-6); }
    for (const row of stepEls) row.forEach((b, s) => { const on = s === now; if ((b.dataset.now === 'true') !== on) b.dataset.now = String(on); });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
