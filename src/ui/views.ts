// The stage pieces: Perform bar, Edit bar, pad pages and grid, scene row, Ambient and Bass strips, mixer.
import type { App, SceneLook } from '../app';
import { h, icon, btn, toggle, fader, pickButton, pickSheet, repeatButton, holdButton, pct } from './kit';
import { NOTE_NAMES, midiToName, beatsPerBar } from '../engine/time';
import { BUS_IDS, BUS_LABEL, BusId, PAGE, PAGES, MAX_SCENES, EDIT_DESTS, EditDest } from '../store/model';

import { Tier, Arrangement, TabsPlace, BarRows, StripsShape, sceneColumns } from './layout';
export interface UI {
  app: App;
  /** How much room there is, whether the pads sit beside the controls (landscape) or above them (portrait), and where the Edit tabs go. */
  tier: Tier; arr: Arrangement; tabs: TabsPlace; bar: BarRows; strips: StripsShape;
  /** The open section of each Edit destination that has sections. */
  section: Record<string, string>;
  /** Open Edit at a destination (and a section of it). */
  go(dest: EditDest, section?: string): void;
  openSequencer(patternId: string): void; select(i: number): void;
}
export interface View { el: HTMLElement; update(): void; frame?(): void }

const KEYS = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
export const fmtBpm = (b: number) => (Number.isInteger(b) ? String(b) : b.toFixed(1));
/** True while pads are being edited: a tap on a pad also picks it. */
const editingPads = (app: App) => app.state.settings.edit && app.state.settings.dest === 'pads';

/** Jump to any song of the set. Used on stage, so it only picks: nothing here changes a song. */
export function openSongPicker(ui: UI): void {
  const { app } = ui;
  pickSheet('Songs in this set', app.setSongs.map((s, i) => ({ value: s.id, label: `${i + 1}. ${s.name || 'Untitled'}`, note: `${fmtBpm(s.bpm)} BPM, ${s.ts.num}/${s.ts.den}, ${NOTE_NAMES[s.key]}` })), app.song.id, id => app.selectSong(id));
}

/* ---------- Perform bar: only what is played live ---------- */
export function performBar(ui: UI): View {
  const { app } = ui, t = app.eng.transport;
  const run = h('button', { class: 'btn icon-only run-btn', title: 'Start', attrs: { type: 'button' }, on: { click: () => { app.unlock(); t.toggle(); } } });
  const bpmNum = h('span', { class: 'bpm-num' }), bpmUnit = h('span', { class: 'bpm-unit' });
  const bpm = h('div', { class: 'bpm', attrs: { 'aria-label': 'Tempo' } }, bpmNum, bpmUnit);
  const down = repeatButton({ icon: 'minus', title: 'Tempo down 1', cls: 'ghost round nudge', onStep: () => app.nudgeBpm(-1) });
  const up = repeatButton({ icon: 'plus', title: 'Tempo up 1', cls: 'ghost round nudge', onStep: () => app.nudgeBpm(1) });
  const tap = h('button', { class: 'btn tap-btn', title: 'Tap tempo', attrs: { type: 'button' } }, h('span', { text: 'Tap' }));
  tap.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); app.tap(); });
  tap.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); app.tap(); } });
  const dots = h('span', { class: 'beat-dots', attrs: { 'aria-hidden': 'true' } }), bb = h('span', { class: 'barbeat-num', attrs: { 'aria-label': 'Bar and beat' } });
  const click = toggle({ label: 'Click', icon: 'click', cls: 'cue click-toggle', value: app.song.click.on, onChange: v => app.patchSong({ click: { ...app.song.click, on: v } }) });
  const songName = h('span', { class: 'song-name' }), songNext = h('span', { class: 'song-next' });
  const song = h('button', { class: 'song-btn', title: 'Songs in this set', attrs: { type: 'button' }, on: { click: () => openSongPicker(ui) } }, songName, songNext);
  const prev = btn({ icon: 'prev', title: 'Previous song', cls: 'ghost', onClick: () => app.prevSong() }), next = btn({ icon: 'next', title: 'Next song', cls: 'ghost', onClick: () => app.nextSong() });
  const chip = h('span', { class: 'chip midi-chip', attrs: { role: 'status' } }, icon('midi', 'small'), h('span', { class: 'chip-text' }));
  const panic = btn({ icon: 'panic', title: 'Panic: stop everything', cls: 'ghost panic-btn', onClick: () => app.panic() });
  const edit = holdButton({
    label: 'Edit', icon: 'edit', title: 'Edit', cls: 'ghost edit-btn', needHold: () => app.state.settings.editLock,
    onGo: () => app.setEdit(true), onShortTap: () => app.toast('Stage lock is on. Press and hold Edit to leave Perform.', 2600),
  });
  const pageSwitch = pagesView(ui, true);          // compact screens: the page tabs above the grid would cost pad size
  const el = h('header', { class: 'bar perform-bar', attrs: { 'aria-label': 'Transport' } },
    h('div', { class: 'bar-group g-tempo' }, run, down, bpm, up, tap),
    h('div', { class: 'bar-group g-beat' }, h('div', { class: 'barbeat' }, dots, bb), click.el),
    h('div', { class: 'bar-group g-pages' }, pageSwitch.el),
    h('div', { class: 'bar-group g-song' }, prev, song, next),
    h('div', { class: 'bar-group g-tools' }, chip, panic, edit));
  let wasRunning: boolean | null = null, dotCount = -1, lastDot = -2;
  return {
    el,
    update() {
      const s = app.song;
      pageSwitch.update();
      bpmNum.textContent = fmtBpm(s.bpm);
      bpmUnit.textContent = `BPM  ${s.ts.num}/${s.ts.den}`;
      click.set(s.click.on);
      songName.textContent = s.name || 'Untitled';
      const n = app.nextSongInSet;
      songNext.textContent = n ? `Next: ${n.name}` : 'Last song';
      const link = app.midi.link;
      chip.dataset.link = link;
      chip.querySelector('.chip-text')!.textContent = link === 'connected' ? 'MIDI' : link === 'searching' ? 'MIDI lost' : 'No MIDI';
      edit.dataset.locked = String(app.state.settings.editLock);
      const bpb = Math.min(12, Math.max(1, Math.round(beatsPerBar(s.ts))));
      if (bpb !== dotCount) { dotCount = bpb; lastDot = -2; dots.dataset.many = String(bpb > 6); dots.replaceChildren(...Array.from({ length: bpb }, () => h('i', { class: 'beat-dot' }))); }
    },
    frame() {
      const e = app.eng, now = e.now();
      pageSwitch.frame!();
      if (t.running !== wasRunning) {
        wasRunning = t.running; run.dataset.running = String(t.running);
        run.replaceChildren(icon(t.running ? 'stop' : 'play')); run.title = t.running ? 'Stop' : 'Start'; run.setAttribute('aria-label', run.title);
      }
      bpm.dataset.pending = String(t.pending);
      let on = -1, text = '1.1';
      if (t.running) {
        const b = e.clock.beatAt(now), pos = e.clock.barBeatAt(b);
        on = b < 0 ? -1 : pos.beat;          // the dot stays lit for the whole beat: a glance says where the bar is
        text = b < 0 ? `In ${pos.beat + 1}` : `${pos.bar + 1}.${pos.beat + 1}`;
      }
      if (bb.textContent !== text) bb.textContent = text;
      if (on !== lastDot) { lastDot = on; [...dots.children].forEach((d, i) => { (d as HTMLElement).dataset.on = i === on ? (i === 0 ? 'down' : 'beat') : ''; }); }
    },
  };
}

/* ---------- Edit bar: back to Perform, a small transport, and the five destinations ---------- */
export function destTabs(ui: UI, cls: string): View {
  const { app } = ui;
  const ICON: Record<EditDest, string> = { pads: 'pattern', loops: 'loop', song: 'songs', mix: 'mixer', setup: 'settings' };
  const tabs = EDIT_DESTS.map(d => {
    const b = h('button', { class: 'dest-tab', attrs: { type: 'button', role: 'tab', 'data-dest': d.id }, on: { click: () => app.setDest(d.id) } }, icon(ICON[d.id]), h('span', { text: d.label }));
    return { d, b };
  });
  const el = h('nav', { class: cls, attrs: { role: 'tablist', 'aria-label': 'Edit' } }, ...tabs.map(t => t.b));
  return { el, update() { for (const t of tabs) t.b.setAttribute('aria-selected', String(app.state.settings.dest === t.d.id)); } };
}
export function editBar(ui: UI): View {
  const { app } = ui, t = app.eng.transport;
  const back = btn({ label: 'Perform', icon: 'stage', title: 'Back to Perform', cls: 'primary perform-btn', onClick: () => app.setEdit(false) });
  const run = h('button', { class: 'btn icon-only e-run', title: 'Start', attrs: { type: 'button' }, on: { click: () => { app.unlock(); t.toggle(); } } });
  const bpmNum = h('span', { class: 'e-bpm-num' });
  const bpm = h('button', { class: 'btn ghost e-bpm', title: 'Tempo and click', attrs: { type: 'button' }, on: { click: () => ui.go('song', 'tempo') } }, bpmNum, h('span', { class: 'label', text: 'BPM' }));
  const tabs = destTabs(ui, 'dest-tabs in-bar');
  const songName = h('span', { class: 'e-song-name' });
  const song = h('button', { class: 'btn ghost e-song', title: 'Set list', attrs: { type: 'button' }, on: { click: () => ui.go('song', 'setlist') } }, songName, icon('down', 'small'));
  const panic = btn({ icon: 'panic', title: 'Panic: stop everything', cls: 'ghost panic-btn', onClick: () => app.panic() });
  const el = h('header', { class: 'bar edit-bar', attrs: { 'aria-label': 'Edit' } }, back, run, bpm, tabs.el, song, panic);
  let wasRunning: boolean | null = null;
  return {
    el,
    update() { tabs.update(); bpmNum.textContent = fmtBpm(app.song.bpm); songName.textContent = app.song.name || 'Untitled'; },
    frame() {
      if (t.running === wasRunning) return;
      wasRunning = t.running; run.dataset.running = String(t.running);
      run.replaceChildren(icon(t.running ? 'stop' : 'play')); run.title = t.running ? 'Stop' : 'Start'; run.setAttribute('aria-label', run.title);
    },
  };
}

/* ---------- pad pages ---------- */
/** Two wide tabs above the grid, or (compact) a small 1 | 2 switch for the bar.
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
    const group = h('span', { class: 'pad-group' }), ring = h('span', { class: 'pad-ring', attrs: { 'aria-hidden': 'true' } }), canvas = h('canvas');
    const b = h('button', { class: 'pad', attrs: { type: 'button' } }, canvas, name, type, ring, state, group);
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch { /* fine */ }
      app.unlock();
      if (editingPads(app)) ui.select(app.page * PAGE + i);
      down = app.padAt(i);
      pads.trigger(down);
      b.dataset.down = 'true';
    });
    // release the pad that was pressed, even if the page turned while it was held
    let down = -1;
    const up = () => { if (down >= 0) pads.release(down); down = -1; b.dataset.down = 'false'; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.repeat) { if (editingPads(app)) ui.select(app.page * PAGE + i); down = app.padAt(i); pads.trigger(down); } });
    b.addEventListener('keyup', e => { if (e.key === 'Enter') up(); });
    b.addEventListener('dragover', e => { e.preventDefault(); if (editingPads(app)) b.classList.add('drop'); });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', e => {
      e.preventDefault(); b.classList.remove('drop');
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length && editingPads(app)) app.loadFiles(files, app.page * PAGE + i);
    });
    el.append(b);
    return { b, name, type, state, group, canvas, typeIcon: '', buf: null as AudioBuffer | null, w: 0, lastState: '', gap: '' as '' | 'loading' | 'failed', gapPad: -1, prog: -1 };
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
      const edit = editingPads(app);
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
      if (el.offsetParent === null) return;
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
        if (v.state === 'playing' || v.state === 'stopping') {
          const p = Math.round(v.progress * 200) / 200;          // half-percent steps are finer than the ring can show
          if (p !== c.prog) { c.prog = p; c.b.style.setProperty('--progress', String(p)); }
        }
      });
    },
  };
}
export const PAD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];

/* ---------- scenes ---------- */
/** One button per scene. A press lands on the next bar line: pads in the scene start, loops outside it stop. */
export function scenesView(ui: UI): View {
  const { app } = ui;
  const list = h('div', { class: 'scene-list' });
  const hint = h('p', { class: 'scene-hint help' });
  const capture = h('button', { class: 'scene scene-capture', title: 'Save what is playing as a scene', attrs: { type: 'button' }, on: { click: () => { app.captureScene(); } } }, icon('plus', 'small'), h('span', { class: 'scene-name', text: 'Capture' }));
  const el = h('section', { class: 'scenes', attrs: { 'aria-label': 'Scenes' } }, list, hint);
  let sig = '', buttons: Array<{ id: string; b: HTMLButtonElement; look: SceneLook }> = [];
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    el,
    update() {
      const scenes = app.scenes, locked = app.state.settings.editLock, canAdd = scenes.length < MAX_SCENES && !locked;
      const s2 = JSON.stringify(scenes.map(x => [x.id, x.name, x.color])) + canAdd;
      if (s2 !== sig) {
        sig = s2;
        buttons = scenes.map((sc, n) => {
          const b = h('button', { class: 'scene', attrs: { type: 'button', 'aria-label': `Scene ${n + 1}, ${sc.name || 'unnamed'}`, ...(sc.color ? { 'data-color': sc.color } : {}) } },
            h('span', { class: 'scene-num', text: String(n + 1) }), h('span', { class: 'scene-name', text: sc.name || `Scene ${n + 1}` }), h('span', { class: 'scene-state' }));
          // pointerdown, like the pads
          b.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); app.launchScene(sc.id); });
          b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); app.launchScene(sc.id); } });
          b.addEventListener('contextmenu', e => e.preventDefault());
          return { id: sc.id, b, look: '' as SceneLook };
        });
        list.replaceChildren(...buttons.map(x => x.b), ...(canAdd ? [capture] : []));
        el.dataset.empty = String(!scenes.length);
      }
      el.style.setProperty('--cols', String(sceneColumns(scenes.length + (canAdd ? 1 : 0), ui.tier, ui.arr)));
      hint.hidden = scenes.length > 0;
      hint.textContent = locked ? 'This song has no scenes. Add them in Edit, Song, Scenes.' : 'No scenes yet. Start the pads for a section, then press Capture.';
    },
    frame() {
      if (!buttons.length || el.offsetParent === null) return;
      const looks = app.sceneLooks(), e = app.eng, beat = e.clock.beatAt(e.now()), blink = still || beat - Math.floor(beat) < 0.5;
      for (const x of buttons) {
        const look = looks.get(x.id) || '';
        if (look !== x.look) { x.look = look; x.b.dataset.look = look; x.b.querySelector('.scene-state')!.textContent = look === 'queued' ? 'Next bar' : look === 'on' ? 'On' : ''; x.b.setAttribute('aria-pressed', String(look === 'on')); }
        if (look === 'queued') x.b.dataset.blink = String(blink);
      }
    },
  };
}

/* ---------- Ambient and Bass strips: on and off, and a level ---------- */
export function stripsView(ui: UI): View {
  const { app } = ui;
  // ambient: the looping pad in the song's key
  const aOn = toggle({ label: 'Ambient', icon: 'pad', value: app.song.tonic.on, onChange: v => { app.unlock(); app.patchSong({ tonic: { ...app.song.tonic, on: v } }); } });
  const key = pickButton<number>({ title: 'Key', options: () => NOTE_NAMES.map((n, i) => ({ value: i, label: n })), value: () => app.song.key, onPick: v => app.patchSong({ key: v }), cls: 'key-btn' });
  key.el.title = 'Key'; key.el.setAttribute('aria-label', 'Key');
  const aLevel = fader({ value: app.song.tonic.level, label: 'Ambient level', format: pct, reset: 0.7, onInput: v => app.patchSong({ tonic: { ...app.song.tonic, level: v } }) });
  const aStatus = h('span', { class: 'card-status' });
  const amb = h('div', { class: 'strip-ch strip-amb' }, aOn.el, h('div', { class: 'strip-read' }, key.el, aStatus), aLevel.el);
  // bass: the left-hand sub synth
  const bOn = toggle({ label: 'Bass', icon: 'bass', value: app.song.sub.on, onChange: v => { app.unlock(); app.patchSong({ sub: { ...app.song.sub, on: v } }); } });
  const note = h('span', { class: 'note-read', attrs: { 'aria-label': 'Current note' } }), preset = h('span', { class: 'card-status preset-name' });
  const bLevel = fader({ value: app.song.sub.level, label: 'Bass level', format: pct, reset: 0.8, onInput: v => app.patchSong({ sub: { ...app.song.sub, level: v } }) });
  const bass = h('div', { class: 'strip-ch strip-bass' }, bOn.el, h('div', { class: 'strip-read' }, note, preset), bLevel.el);
  const el = h('section', { class: 'strips', attrs: { 'aria-label': 'Ambient pad and bass' } }, amb, bass);
  return {
    el,
    update() {
      const s = app.song, tp = app.eng.tonic, n = app.eng.sub.currentNote;
      // beside the pads there is height for upright faders; under them the faders lie flat
      const upright = ui.strips === 'upright';
      aLevel.setVertical(upright); bLevel.setVertical(upright);
      aOn.set(s.tonic.on); key.update(); aLevel.set(s.tonic.level);
      aStatus.textContent = !app.bank.index.padsets.length ? 'No pad set' : tp.status === 'loading' ? 'Loading' : tp.status === 'missing' ? 'Missing' : tp.status === 'on' && tp.fallback ? 'Fallback' : '';
      bOn.set(s.sub.on); bLevel.set(s.sub.level);
      note.textContent = n === null ? '' : midiToName(n);
      preset.textContent = n === null ? s.sub.preset : '';
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
