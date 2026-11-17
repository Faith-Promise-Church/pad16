// Perform view pieces: transport bar, pad grid, tonic pad and sub synth cards, mixer.
import type { App } from '../app';
import { h, icon, btn, toggle, fader, pickButton, pct } from './kit';
import { NOTE_NAMES, midiToName } from '../engine/time';
import { BUS_IDS, BUS_LABEL, BusId, SUB_PRESETS, PAGE, PAGES } from '../store/model';

export interface UI {
  app: App; layout: 'wide' | 'tall' | 'phone';
  openTempo(): void; openSongs(): void; openSettings(tab?: string): void; openMixer(): void; openClick(): void; openSynth(): void; openTonic(): void;
  openSequencer(patternId: string): void; setEdit(on: boolean): void; select(i: number): void;
}
export interface View { el: HTMLElement; update(): void; frame?(): void }

const KEYS = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
const fmtBpm = (b: number) => (Number.isInteger(b) ? String(b) : b.toFixed(1));

/* ---------- transport ---------- */
export function transportView(ui: UI): View {
  const { app } = ui, t = app.eng.transport;
  const run = h('button', { class: 'btn icon-only run-btn', title: 'Start', attrs: { type: 'button' }, on: { click: () => { app.unlock(); t.toggle(); } } });
  const bpmNum = h('span', { class: 'bpm-num' });
  const bpm = h('button', { class: 'bpm-btn', title: 'Tempo', attrs: { type: 'button' }, on: { click: () => ui.openTempo() } }, bpmNum, h('span', { class: 'label', text: 'BPM' }));
  const tap = btn({ label: 'Tap', title: 'Tap tempo', onClick: () => app.tap() });
  const light = h('span', { class: 'beat-light', attrs: { 'aria-hidden': 'true' } }), bb = h('span', { class: 'barbeat-num', attrs: { 'aria-label': 'Bar and beat' } });
  const ts = h('button', { class: 'ts-btn', title: 'Time signature', attrs: { type: 'button' }, on: { click: () => ui.openTempo() } });
  // press and hold opens the click settings: on a phone there is no room for the separate button
  const click = toggle({ label: 'Click', icon: 'click', cls: 'cue', value: app.song.click.on, onChange: v => app.patchSong({ click: { ...app.song.click, on: v } }), onHold: () => ui.openClick() });
  click.el.title = 'Click. Press and hold for click settings.';
  click.el.addEventListener('contextmenu', e => e.preventDefault());
  const clickMore = btn({ icon: 'more', title: 'Click settings', cls: 'ghost hide-phone', onClick: () => ui.openClick() });
  const songName = h('span', { class: 'song-name' }), songNext = h('span', { class: 'song-next' });
  const song = h('button', { class: 'song-btn', title: 'Songs and sets', attrs: { type: 'button' }, on: { click: () => ui.openSongs() } }, songName, songNext);
  const prev = btn({ icon: 'prev', title: 'Previous song', cls: 'ghost', onClick: () => app.prevSong() }), next = btn({ icon: 'next', title: 'Next song', cls: 'ghost', onClick: () => app.nextSong() });
  const chipText = h('span', { class: 'chip-long' }), chipShort = h('span', { class: 'chip-short' });      // the phone shows the short one under the icon
  const chip = h('button', { class: 'chip', title: 'MIDI', attrs: { type: 'button' }, on: { click: () => ui.openSettings('midi') } }, icon('midi', 'small'), chipText, chipShort);
  const edit = btn({ icon: 'edit', title: 'Edit pads', cls: 'ghost t-tool', onClick: () => ui.setEdit(!app.state.settings.edit) });
  const lock = btn({ icon: 'unlock', title: 'Edit lock', cls: 'ghost t-tool', onClick: () => { const s = app.state.settings; s.editLock = !s.editLock; if (s.editLock) ui.setEdit(false); app.changed(); } });
  const settings = btn({ icon: 'settings', title: 'Settings', cls: 'ghost t-tool', onClick: () => ui.openSettings() });
  const panic = btn({ icon: 'panic', title: 'Panic: stop everything', cls: 'ghost t-tool', onClick: () => app.panic() });
  chip.classList.add('t-chip'); lock.classList.add('hide-phone');
  const pageSwitch = pagesView(ui, true);          // shown on phones, where the tabs above the grid would cost pad size
  const brk = (n: number) => h('span', { class: 'brk brk' + n, attrs: { 'aria-hidden': 'true' } });
  // one row on wide screens; three rows (tempo, tools, song) on phones and narrow tablets
  const el = h('header', { class: 'transport' },
    h('span', { class: 'wordmark', text: 'Pad16' }), run, bpm, tap, h('div', { class: 'barbeat' }, light, bb), ts, brk(1),
    click.el, clickMore, pageSwitch.el, chip, edit, lock, settings, panic, brk(2),
    h('div', { class: 'song-block' }, prev, song, next));
  let wasRunning: boolean | null = null, lockIcon = '';
  return {
    el,
    update() {
      const s = app.song, st = app.state.settings;
      pageSwitch.update();
      bpmNum.textContent = fmtBpm(s.bpm);
      ts.textContent = `${s.ts.num}/${s.ts.den}`;
      click.set(s.click.on);
      songName.textContent = s.name || 'Untitled';
      const n = app.nextSongInSet;
      songNext.textContent = n ? `Next: ${n.name}` : 'Last song';
      const link = app.midi.link;
      chip.dataset.link = link;
      chipText.textContent = link === 'connected' ? 'MIDI on' : link === 'searching' ? 'MIDI search' : 'MIDI off';
      chipShort.textContent = link === 'connected' ? 'On' : link === 'searching' ? 'Scan' : 'Off';
      chip.setAttribute('aria-label', chipText.textContent);
      edit.setAttribute('aria-pressed', String(st.edit));
      edit.disabled = st.editLock;
      lock.setAttribute('aria-pressed', String(st.editLock));
      const li = st.editLock ? 'lock' : 'unlock';
      if (li !== lockIcon) { lockIcon = li; lock.replaceChildren(icon(li)); }
    },
    frame() {
      const e = app.eng, now = e.now();
      pageSwitch.frame!();
      if (t.running !== wasRunning) {
        wasRunning = t.running; run.dataset.running = String(t.running);
        run.replaceChildren(icon(t.running ? 'stop' : 'play')); run.title = t.running ? 'Stop' : 'Start'; run.setAttribute('aria-label', run.title);
      }
      bpm.dataset.pending = String(t.pending);
      if (!t.running) { light.dataset.on = ''; bb.textContent = '1.1'; return; }
      const b = e.clock.beatAt(now), pos = e.clock.barBeatAt(b);
      light.dataset.on = pos.frac < 0.22 ? (pos.beat === 0 ? 'down' : 'beat') : '';
      bb.textContent = b < 0 ? `In ${pos.beat + 1}` : `${pos.bar + 1}.${pos.beat + 1}`;
    },
  };
}

/* ---------- pad pages ---------- */
/** Two wide tabs above the grid, or (compact) a small 1 | 2 switch for the phone's top bar.
 *  Pads on the page out of view keep playing; a dot on its tab says so. */
export function pagesView(ui: UI, compact = false): View {
  const { app } = ui;
  const tabs = Array.from({ length: PAGES }, (_, n) => {
    const num = h('span', { class: 'page-num', text: String(n + 1) }), name = h('span', { class: 'page-name' }), dot = h('span', { class: 'page-dot', attrs: { 'aria-hidden': 'true' } });
    const b = h('button', { class: 'page-tab', attrs: { type: 'button' } }, num, name, dot);
    // pointerdown, like the pads: a page turn should land the moment the finger does
    b.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); app.setPage(n); });
    b.addEventListener('click', () => app.setPage(n));
    return { b, name, busy: '' };
  });
  const el = h('div', { class: compact ? 'pages compact' : 'pages', attrs: { role: 'group', 'aria-label': 'Pad pages' } }, ...tabs.map(t => t.b));
  return {
    el,
    update() {
      tabs.forEach((t, n) => {
        const nm = app.pageName(n);
        t.name.textContent = nm;
        t.b.setAttribute('aria-pressed', String(app.page === n));
        t.b.setAttribute('aria-label', `Pad page ${n + 1}, ${nm}`);
      });
    },
    frame() { tabs.forEach((t, n) => { const v = String(app.pageBusy(n)); if (v !== t.busy) { t.busy = v; t.b.dataset.busy = v; } }); },
  };
}

/* ---------- pad grid ---------- */
export function gridView(ui: UI): View {
  const { app } = ui, pads = app.eng.pads;
  const el = h('div', { class: 'grid', attrs: { 'aria-label': 'Pads' } });
  let tick = 0;
  const cells = Array.from({ length: 16 }, (_, i) => {
    const name = h('span', { class: 'pad-name' }), type = h('span', { class: 'pad-type' }), state = h('span', { class: 'pad-state' });
    const group = h('span', { class: 'pad-group' }), prog = h('span', { class: 'pad-progress' }), canvas = h('canvas');
    const b = h('button', { class: 'pad', attrs: { type: 'button' } }, canvas, name, type, state, group, prog);
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch { /* fine */ }
      app.unlock();
      if (app.state.settings.edit) ui.select(app.page * PAGE + i);
      down = app.padAt(i);
      pads.trigger(down);
    });
    // release the pad that was pressed, even if the page turned while it was held
    let down = -1;
    const up = () => { if (down >= 0) pads.release(down); down = -1; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.repeat) { ui.select(app.page * PAGE + i); down = app.padAt(i); pads.trigger(down); } });
    b.addEventListener('keyup', e => { if (e.key === 'Enter') up(); });
    b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('drop'); });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', e => {
      e.preventDefault(); b.classList.remove('drop');
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length && !app.state.settings.editLock) app.loadFiles(files, app.page * PAGE + i);
    });
    el.append(b);
    return { b, name, type, state, group, prog, canvas, typeIcon: '', buf: null as AudioBuffer | null, w: 0, lastState: '', gap: '' as '' | 'loading' | 'failed', gapPad: -1 };
  });
  function drawWave(c: (typeof cells)[number], buffer: AudioBuffer | null) {
    const r = c.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), ht = Math.max(1, Math.round(r.height * dpr));
    c.canvas.width = w; c.canvas.height = ht;
    const g = c.canvas.getContext('2d'); if (!g) return;
    g.clearRect(0, 0, w, ht);
    if (!buffer) return;
    const d = buffer.getChannelData(0), step = Math.max(1, Math.floor(d.length / w)), mid = ht / 2, amp = ht * 0.45;
    g.fillStyle = getComputedStyle(c.b).color;
    for (let x = 0; x < w; x++) {
      let mn = 1, mx = -1; const s = x * step;
      for (let k = 0; k < step && s + k < d.length; k += 4) { const v = d[s + k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx >= mn) g.fillRect(x, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp));
    }
  }
  // reduced motion: a queued pad shows its steady queued look instead of blinking
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    el,
    update() {
      const edit = app.state.settings.edit;
      cells.forEach((c, slot) => {
        const i = app.padAt(slot), cfg = app.song.pads[i], rt = pads.pads[i], nm = app.padName(i);
        c.name.textContent = nm;
        const ic = cfg.mode === 'pattern' ? 'pattern' : cfg.mode === 'loop' ? 'loop' : cfg.mode === 'hold' ? 'hold' : 'oneshot';
        if (ic !== c.typeIcon) { c.typeIcon = ic; c.type.replaceChildren(icon(ic)); }
        c.group.textContent = cfg.group;
        if (cfg.color) c.b.dataset.color = cfg.color; else delete c.b.dataset.color;
        c.b.classList.toggle('empty', cfg.mode !== 'pattern' && !rt.buffer);
        c.b.classList.toggle('sel', edit && app.selected === i);
        c.b.setAttribute('aria-label', `Pad ${slot + 1}, key ${KEYS[slot]}, ${nm}, ${cfg.mode === 'oneshot' ? 'one shot' : cfg.mode}`);
        const w = c.canvas.clientWidth;
        if (edit && (rt.buffer !== c.buf || w !== c.w)) { c.buf = rt.buffer; c.w = w; drawWave(c, cfg.mode === 'pattern' ? null : rt.buffer); }
        c.lastState = '';
      });
    },
    frame() {
      const e = app.eng, beat = e.clock.beatAt(e.now()), blink = still || beat - Math.floor(beat) < 0.5;
      const check = ++tick % 20 === 0;            // a few times a second is plenty for download status
      cells.forEach((c, slot) => {
        const i = app.padAt(slot), v = pads.view(i), meta = app.padMeta[i];
        if (check || c.gapPad !== i) { c.gap = app.padGap(i); c.gapPad = i; }
        const label = v.state === 'queued' ? 'Queued' : v.state === 'stopping' ? 'Stopping' : v.state === 'playing' ? 'Playing'
          : meta.missing ? 'Stand-in' : c.gap ? (c.gap === 'failed' ? 'No sample' : 'Loading') : meta.stretch === 'busy' ? 'Rendering' : meta.stretch === 'failed' ? 'Repitch' : '';
        const key = v.state + (v.lit ? 'L' : '') + label;
        if (key !== c.lastState) { c.lastState = key; c.b.dataset.state = v.state; c.b.dataset.lit = String(v.lit && v.state === 'stopped'); c.state.textContent = label; c.b.dataset.label = String(!!label); }
        if (v.state === 'queued') c.b.dataset.blink = String(blink);
        if (v.state === 'playing' || v.state === 'stopping') c.prog.style.setProperty('--progress', v.progress.toFixed(3));
      });
    },
  };
}
export const PAD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];

/* ---------- tonic pad card ---------- */
export function tonicCard(ui: UI): View {
  const { app } = ui;
  const on = toggle({ label: 'Pad', icon: 'pad', value: app.song.tonic.on, onChange: v => { app.unlock(); app.patchSong({ tonic: { ...app.song.tonic, on: v } }); } });
  const key = pickButton<number>({
    title: 'Key', options: () => NOTE_NAMES.map((n, i) => ({ value: i, label: n })), value: () => app.song.key, onPick: v => app.patchSong({ key: v }),
  });
  key.el.title = 'Key'; key.el.setAttribute('aria-label', 'Key');
  const level = fader({ value: app.song.tonic.level, label: 'Pad level', reset: 0.7, onInput: v => app.patchSong({ tonic: { ...app.song.tonic, level: v } }) });
  const status = h('span', { class: 'card-status' });
  const more = btn({ icon: 'more', title: 'Tonic pad settings', cls: 'ghost', onClick: () => ui.openTonic() });
  const el = h('div', { class: 'card tonic-card' }, on.el, key.el, level.el, status, more);
  return {
    el,
    update() {
      const s = app.song.tonic, tp = app.eng.tonic;
      on.set(s.on); key.update(); level.set(s.level);
      status.textContent = !app.bank.index.padsets.length ? 'No pad set' : tp.status === 'loading' ? 'Loading' : tp.status === 'missing' ? 'Missing' : tp.status === 'on' && tp.fallback ? 'Fallback' : '';
    },
  };
}

/* ---------- sub synth card ---------- */
export function subCard(ui: UI): View {
  const { app } = ui;
  const on = toggle({ label: 'Sub', icon: 'synth', value: app.song.sub.on, onChange: v => { app.unlock(); app.patchSong({ sub: { ...app.song.sub, on: v } }); } });
  const preset = pickButton<string>({
    title: 'Sub synth preset', options: () => Object.keys(SUB_PRESETS).map(n => ({ value: n, label: n })), value: () => app.song.sub.preset, onPick: v => app.setSubPreset(v),
  });
  preset.el.title = 'Preset'; preset.el.setAttribute('aria-label', 'Preset');
  const level = fader({ value: app.song.sub.level, label: 'Sub level', reset: 0.8, onInput: v => app.patchSong({ sub: { ...app.song.sub, level: v } }) });
  const note = h('span', { class: 'note-read', attrs: { 'aria-label': 'Current note' } });
  const more = btn({ icon: 'more', title: 'Sub synth settings', cls: 'ghost', onClick: () => ui.openSynth() });
  const el = h('div', { class: 'card sub-card' }, on.el, preset.el, level.el, note, more);
  return {
    el,
    update() {
      const s = app.song.sub, n = app.eng.sub.currentNote;
      on.set(s.on); preset.update(); level.set(s.level);
      note.textContent = n === null ? '' : midiToName(n);
    },
  };
}

/* ---------- mixer ---------- */
export function mixerView(ui: UI): View {
  const { app } = ui;
  const strips = [...BUS_IDS, 'master' as const].map(id => {
    const isBus = id !== 'master';
    const f = fader({
      vertical: true, value: 0, max: 1.2, reset: 0.85, format: pct, label: isBus ? BUS_LABEL[id as BusId] : 'Master',
      onInput: v => (isBus ? app.patchBus(id as BusId, { level: v }) : (app.routing.master = v, app.eng.mixer.setMaster(v), app.save())),
    });
    const meterFill = h('div', { class: 'meter-fill' }), meter = h('div', { class: 'meter', attrs: { 'aria-hidden': 'true' } }, meterFill);
    f.el.querySelector('.fader-track')!.after(meter);
    const body = h('div', { class: 'ch-body' }, f.el.querySelector('.fader-track')!, meter);
    f.el.querySelector('.label')!.after(body);
    const mute = isBus ? btn({ label: 'Mute', cls: 'mute-btn', title: `Mute ${BUS_LABEL[id as BusId]}`, onClick: () => app.patchBus(id as BusId, { mute: !app.routing.buses[id as BusId].mute }) }) : null;
    const dest = isBus ? btn({ label: 'Main', cls: 'dest-btn', title: `${BUS_LABEL[id as BusId]} output`, onClick: () => { const b = app.routing.buses[id as BusId]; app.patchBus(id as BusId, { dest: b.dest === 'main' ? 'cue' : 'main' }); } }) : null;
    const el = h('div', { class: 'ch' + (isBus ? '' : ' ch-master') }, f.el, mute, dest);
    return { id, el, f, meter, mute, dest, peak: 0 };
  });
  const el = h('div', { class: 'mixer' }, ...strips.map(s => s.el));
  return {
    el,
    update() {
      const r = app.routing;
      for (const s of strips) {
        if (s.id === 'master') { s.f.set(r.master); continue; }
        const b = r.buses[s.id as BusId];
        s.f.set(b.level);
        s.mute!.setAttribute('aria-pressed', String(b.mute));
        s.dest!.dataset.dest = b.dest;
        s.dest!.querySelector('span')!.textContent = b.dest === 'cue' ? 'Cue' : 'Main';
      }
    },
    frame() {
      if (!el.isConnected || el.offsetParent === null) return;
      for (const s of strips) {
        const lv = app.eng.mixer.level(s.id as any);
        s.peak = Math.max(lv, s.peak * 0.9);
        const shown = Math.min(1, Math.sqrt(s.peak));
        s.meter.style.setProperty('--level', shown.toFixed(3));
        s.meter.dataset.zone = s.peak > 0.89 ? 'clip' : s.peak > 0.6 ? 'warn' : 'ok';
      }
    },
  };
}
