// Entry point: boot the app controller and mount the interface.
// Two modes: Perform (only what is played live) and Edit (five destinations: Pads, Loops, Song, Mix, Setup).
import '@fontsource/barlow/300.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import 'pad16-din';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './app';
import { h, openSheets, sectioned } from './ui/kit';
import { layoutFor } from './ui/layout';
import { UI, View, performBar, editBar, destTabs, gridView, pagesView, scenesView, stripsView, PAD_KEYS } from './ui/views';
import { PAGE, EditDest } from './store/model';
import { editorView, openSequencer } from './ui/editor';
import { setListPane, songInfoPane, tempoPane, scenesPane, ambientPane, bassPane, loopsPane, mixPane, audioPane, midiPane, displayPane, soundsPane, backupPane, diagnosticsPane } from './ui/panes';

async function boot() {
  const root = document.getElementById('app')!;
  let app: App;
  try { app = await App.create(); }
  catch (e) { root.append(h('p', { class: 'help', text: 'Pad16 could not start audio in this browser. ' + String(e) })); return; }
  (window as any).pad16 = app;
  // the app always opens ready to play
  app.state.settings.edit = false;

  const ui: UI = {
    app, ...layoutFor(innerWidth, innerHeight), section: { song: 'setlist', setup: 'audio' },
    go: (dest, section) => { if (section) ui.section[dest] = section; app.setEdit(true, dest); },
    openSequencer: id => openSequencer(ui, id),
    select: i => app.select(i),
  };

  const pBar = performBar(ui), eBar = editBar(ui), grid = gridView(ui), pages = pagesView(ui), scenes = scenesView(ui), strips = stripsView(ui), editor = editorView(ui);
  const bottomTabs = destTabs(ui, 'dest-tabs bottom');
  const gridWrap = h('section', { class: 'grid-wrap' }, h('div', { class: 'grid-col' }, pages.el, grid.el));
  // the Edit destinations other than Pads are built the first time they are opened
  const built = new Map<EditDest, View>();
  const destHost = h('main', { class: 'dest-host' });
  const pickSection = (dest: string) => (id: string) => { ui.section[dest] = id; refresh(); };
  const builders: Partial<Record<EditDest, () => View>> = {
    loops: () => loopsPane(ui),
    song: () => sectioned('Song', [
      { id: 'setlist', label: 'Set list', build: () => setListPane(ui) }, { id: 'song', label: 'This song', build: () => songInfoPane(ui) },
      { id: 'tempo', label: 'Tempo and click', build: () => tempoPane(ui) }, { id: 'scenes', label: 'Scenes', build: () => scenesPane(ui) },
      { id: 'ambient', label: 'Ambient', build: () => ambientPane(ui) }, { id: 'bass', label: 'Bass', build: () => bassPane(ui) },
    ], () => ui.section.song, pickSection('song')),
    mix: () => mixPane(ui),
    setup: () => sectioned('Setup', [
      { id: 'audio', label: 'Audio', build: () => audioPane(ui) }, { id: 'sounds', label: 'Sounds', build: () => soundsPane(ui) }, { id: 'midi', label: 'MIDI', build: () => midiPane(ui) },
      { id: 'display', label: 'Display', build: () => displayPane(ui) }, { id: 'backup', label: 'Backup', build: () => backupPane(ui) },
      { id: 'diagnostics', label: 'Diagnostics', build: () => diagnosticsPane(ui) },
    ], () => ui.section.setup, pickSection('setup')),
  };
  let shownDest: EditDest | '' = '';
  function showDest(dest: EditDest): View | null {
    const make = builders[dest];
    if (!make) { shownDest = ''; return null; }
    let v = built.get(dest);
    if (!v) { v = make(); v.el.classList.add('dest-pane'); v.el.dataset.dest = dest; built.set(dest, v); }
    if (shownDest !== dest) { shownDest = dest; destHost.replaceChildren(v.el); }
    return v;
  }

  const toast = h('div', { class: 'toast', attrs: { role: 'status', hidden: '' } });
  const banner = h('div', { class: 'banner', attrs: { role: 'alert', hidden: '' } });
  const resume = h('button', { class: 'resume', attrs: { type: 'button', hidden: '' }, on: { click: () => app.unlock() } },
    h('span', { class: 'resume-title', text: 'Tap to resume audio' }), h('span', { class: 'help', text: 'Audio was interrupted. Tap anywhere to carry on.' }));
  root.append(pBar.el, eBar.el, scenes.el, gridWrap, strips.el, editor.el, destHost, bottomTabs.el);
  document.body.append(toast, banner, resume);

  const always: View[] = [pBar, eBar, pages, grid, scenes, strips, editor, bottomTabs];
  function applyLayout() {
    Object.assign(ui, layoutFor(innerWidth, innerHeight));
    root.dataset.tier = ui.tier; root.dataset.arr = ui.arr; root.dataset.tabs = ui.tabs; root.dataset.bar = String(ui.bar); root.dataset.strips = ui.strips;
  }
  function refresh() {
    const s = app.state.settings, editing = s.edit;
    document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.theme === 'light' ? '#FFFFFF' : '#0B0C0E');
    root.dataset.mode = editing ? 'edit' : 'perform';
    root.dataset.dest = editing ? s.dest : '';
    root.dataset.edit = String(editing && s.dest === 'pads');          // pads are being edited: a tap also picks the pad
    root.dataset.locked = String(s.editLock);
    // on smaller screens Perform moves the page switch into the bar, so the pads get the height the page tabs would take
    root.dataset.pages = !editing && ui.tier !== 'expanded' ? 'bar' : 'grid';
    const pane = editing ? showDest(s.dest) : null;
    for (const v of always) v.update();
    pane?.update();
    for (const sh of openSheets()) sh.update();
    toast.hidden = !app.toastMsg; toast.textContent = app.toastMsg;
    const lost = app.midi.link === 'searching';
    banner.hidden = !(app.bluetoothAudio || lost);
    banner.textContent = app.bluetoothAudio ? 'Bluetooth audio is active. The delay is too long for live playing.' : 'MIDI device lost. Reconnecting.';
    resume.hidden = !app.needsResume;
  }
  app.eng.padLaunchCountIn = app.state.settings.countInOnPadLaunch;
  app.on(refresh);
  applyLayout(); refresh();
  const relayout = () => { applyLayout(); refresh(); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  // the banner hangs under whichever bar is showing
  const barHeight = new ResizeObserver(() => { const b = app.state.settings.edit ? eBar.el : pBar.el; document.documentElement.style.setProperty('--bar-h', b.getBoundingClientRect().bottom + 'px'); });
  barHeight.observe(pBar.el); barHeight.observe(eBar.el);

  const frame = () => {
    for (const v of always) v.frame?.();
    if (app.state.settings.edit && shownDest) built.get(shownDest)?.frame?.();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* stage safety: no zoom, no context menus, audio unlocked by the first touch */
  window.addEventListener('pointerdown', () => { if (!app.unlocked) app.unlock(); }, { capture: true });
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if ((e as TouchEvent).touches.length > 1) e.preventDefault(); }, { passive: false });
  window.addEventListener('dragover', e => e.preventDefault()); addEventListener('drop', e => e.preventDefault());

  /* keyboard: pad keys, Shift with 1 to 8 for scenes, space for the transport, and page-turner pedals (which arrive as arrow or page keys) */
  const held = new Set<number>(), heldPad = new Map<number, number>();
  const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && a.tagName === 'INPUT'; };
  window.addEventListener('keydown', e => {
    if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { openSheets().at(-1)?.close(); return; }
    if (e.shiftKey && /^Digit[1-8]$/.test(e.code)) { e.preventDefault(); if (!e.repeat) app.launchSceneAt(Number(e.code.slice(5)) - 1); return; }
    const i = PAD_KEYS.indexOf(e.code);
    if (i >= 0) { e.preventDefault(); if (e.repeat || held.has(i)) return; held.add(i); app.unlock(); const pad = app.padAt(i); heldPad.set(i, pad); if (app.state.settings.edit && app.state.settings.dest === 'pads') ui.select(app.page * PAGE + i); app.eng.pads.trigger(pad); return; }
    if (e.repeat) return;
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { e.preventDefault(); app.setPage(e.code === 'BracketLeft' ? 0 : 1); return; }
    if (e.code === 'Space' && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); app.unlock(); app.eng.transport.toggle(); return; }
    if (!app.state.settings.pedalKeys || openSheets().length) return;
    const fwd = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key), back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
    if (!fwd && !back) return;
    e.preventDefault();
    if (app.state.settings.pedalMode === 'scene') app.stepScene(fwd ? 1 : -1);
    else if (fwd) app.nextSong(); else app.prevSong();
  });
  const letGo = (i: number) => { const pad = heldPad.get(i); if (pad !== undefined) app.eng.pads.release(pad); heldPad.delete(i); };
  window.addEventListener('keyup', e => { const i = PAD_KEYS.indexOf(e.code); if (i >= 0) { held.delete(i); letGo(i); } });
  window.addEventListener('blur', () => { held.forEach(letGo); held.clear(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window as any).Capacitor?.isNativePlatform?.()) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  document.documentElement.dataset.ready = 'true';
}
boot();
