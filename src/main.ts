// Entry point: boot the app controller and mount the stage interface.
import '@fontsource/barlow/300.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/700.css';
import 'pad16-din';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './app';
import { h, btn, openSheet, openSheets } from './ui/kit';
import { UI, View, transportView, gridView, tonicCard, subCard, mixerView, PAD_KEYS } from './ui/views';
import { editorView, openSequencer } from './ui/editor';
import { openTempo, openClick, openSongs, openSynth, openTonic, openSettings, songPanel, synthPanel } from './ui/sheets';

async function boot() {
  const root = document.getElementById('app')!;
  let app: App;
  try { app = await App.create(); }
  catch (e) { root.append(h('p', { class: 'help', text: 'Pad16 could not start audio in this browser. ' + String(e) })); return; }
  (window as any).pad16 = app;

  const getLayout = (): UI['layout'] => { const w = innerWidth, ht = innerHeight; return w < 700 || ht < 500 ? 'phone' : w > ht && w >= 1000 ? 'wide' : 'tall'; };
  const ui: UI = {
    app, layout: getLayout(),
    openTempo: () => openTempo(ui), openSongs: () => openSongs(ui), openSettings: tab => openSettings(ui, tab), openClick: () => openClick(ui),
    openSynth: () => openSynth(ui), openTonic: () => openTonic(ui), openSequencer: id => openSequencer(ui, id),
    openMixer: () => { const m = mixerView(ui); sheetViews.add(m); openSheet('Mixer', body => { body.append(m.el); m.update(); return () => m.update(); }); },
    setEdit: on => { const s = app.state.settings; s.edit = on && !s.editLock; app.changed(); },
    select: i => { app.selected = i; app.emit(); },
  };
  const sheetViews = new Set<View>();

  const transport = transportView(ui), grid = gridView(ui), editor = editorView(ui);
  const strip = { tonic: tonicCard(ui), sub: subCard(ui) }, rail = { tonic: tonicCard(ui), sub: subCard(ui), mixer: mixerView(ui) };
  const phoneMixer = mixerView(ui), phoneTonic = tonicCard(ui);
  const railEl = h('aside', { class: 'rail', attrs: { 'aria-label': 'Tonic pad, sub synth and mixer' } }, rail.tonic.el, rail.sub.el, rail.mixer.el);
  const stage = h('main', { class: 'stage' }, h('section', { class: 'grid-wrap' }, grid.el), railEl);
  const stripEl = h('section', { class: 'strip', attrs: { 'aria-label': 'Tonic pad and sub synth' } }, strip.tonic.el, strip.sub.el,
    btn({ icon: 'mixer', label: 'Mixer', title: 'Mixer', cls: 'mix-open', onClick: () => ui.openMixer() }));
  const panelMix = h('section', { class: 'panel panel-mix' }, phoneMixer.el);
  const panelSynth = h('section', { class: 'panel panel-synth' }, phoneTonic.el), panelSong = h('section', { class: 'panel panel-song' });
  const updSynth = synthPanel(ui, panelSynth), updSong = songPanel(ui, panelSong);
  const tabs = h('nav', { class: 'tabs', attrs: { role: 'tablist' } });
  const tabDefs: Array<[string, string]> = [['pads', 'Pads'], ['mix', 'Mix'], ['synth', 'Synth'], ['song', 'Song']];
  const tabBtns = tabDefs.map(([id, label]) => {
    const b = h('button', { class: 'tab', text: label, attrs: { type: 'button', role: 'tab' }, on: { click: () => { root.dataset.tab = id; refresh(); } } });
    tabs.append(b); return { id, b };
  });
  const toast = h('div', { class: 'toast', attrs: { role: 'status', hidden: '' } });
  const banner = h('div', { class: 'banner', attrs: { role: 'alert', hidden: '' } });
  const resume = h('button', { class: 'resume', attrs: { type: 'button', hidden: '' }, on: { click: () => app.unlock() } },
    h('span', { class: 'resume-title', text: 'Tap to resume audio' }), h('span', { class: 'help', text: 'Audio was interrupted. Tap anywhere to carry on.' }));
  root.dataset.tab = 'pads';
  root.append(transport.el, stage, stripEl, editor.el, panelMix, panelSynth, panelSong, tabs);
  document.body.append(toast, banner, resume);

  const views: View[] = [transport, grid, editor, strip.tonic, strip.sub, rail.tonic, rail.sub, rail.mixer, phoneMixer, phoneTonic];
  function applyLayout() {
    ui.layout = getLayout();
    root.dataset.layout = ui.layout;
    root.dataset.rows = ui.layout === 'phone' ? '3' : innerWidth < 1280 ? '2' : '1';
    const host = ui.layout === 'wide' ? railEl : root;
    if (editor.el.parentElement !== host) { if (host === root) stripEl.after(editor.el); else railEl.append(editor.el); }
  }
  function refresh() {
    const s = app.state.settings;
    document.documentElement.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.theme === 'light' ? '#FFFFFF' : '#0B0C0E');
    root.dataset.edit = String(s.edit && !s.editLock);
    root.dataset.locked = String(s.editLock);
    for (const t of tabBtns) t.b.setAttribute('aria-selected', String(t.id === root.dataset.tab));
    for (const v of views) v.update();
    if (ui.layout === 'phone') { updSynth(); updSong(); }
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
  window.addEventListener('resize', () => { applyLayout(); refresh(); });
  window.addEventListener('orientationchange', () => { applyLayout(); refresh(); });

  const frame = () => {
    for (const v of views) v.frame?.();
    for (const v of sheetViews) { if (!v.el.isConnected) sheetViews.delete(v); else v.frame?.(); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /* stage safety: no zoom, no context menus, audio unlocked by the first touch */
  window.addEventListener('pointerdown', () => { if (!app.unlocked) app.unlock(); }, { capture: true });
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if ((e as TouchEvent).touches.length > 1) e.preventDefault(); }, { passive: false });
  window.addEventListener('dragover', e => e.preventDefault()); addEventListener('drop', e => e.preventDefault());

  /* keyboard: pad keys, space for the transport, and page-turner pedals (which arrive as arrow or page keys) */
  const held = new Set<number>();
  const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && a.tagName === 'INPUT'; };
  window.addEventListener('keydown', e => {
    if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { openSheets().at(-1)?.close(); return; }
    const i = PAD_KEYS.indexOf(e.code);
    if (i >= 0) { e.preventDefault(); if (e.repeat || held.has(i)) return; held.add(i); app.unlock(); if (app.state.settings.edit) ui.select(i); app.eng.pads.trigger(i); return; }
    if (e.repeat) return;
    if (e.code === 'Space' && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); app.unlock(); app.eng.transport.toggle(); return; }
    if (!app.state.settings.pedalKeys || openSheets().length) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); app.nextSong(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); app.prevSong(); }
  });
  window.addEventListener('keyup', e => { const i = PAD_KEYS.indexOf(e.code); if (i >= 0) { held.delete(i); app.eng.pads.release(i); } });
  window.addEventListener('blur', () => { held.forEach(i => app.eng.pads.release(i)); held.clear(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window as any).Capacitor?.isNativePlatform?.()) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  document.documentElement.dataset.ready = 'true';
}
boot();
