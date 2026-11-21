// The sample library browser. One sheet, opened from wherever a sound is being chosen (a pad, a pattern track):
// pick a category, search, tap a row to hear it, press the button on the row to use it.
import { h, btn, clear, openSheet, segmented, textInput, icon } from './kit';
import type { UI } from './views';
import type { LibItem } from '../engine/bank';

type Kind = 'all' | 'shot' | 'loop';
export interface LibraryOpts { title: string; action: string; kinds?: Array<LibItem['type']>; onPick: (item: LibItem) => void | Promise<void> }
// what the browser was showing last time, so opening it again carries on where you were
const last: { cat: string; kind: Kind; q: string } = { cat: '', kind: 'all', q: '' };

export const describe = (i: LibItem): string => {
  const bars = i.beats ? i.beats / 4 : 0;
  if (i.type === 'loop' && i.bpm) return `${i.bpm} BPM, ${bars} ${bars === 1 ? 'bar' : 'bars'}`;
  if (!i.secs) return i.type === 'cue' ? 'Spoken' : 'One shot';
  return i.secs < 1 ? Math.round(i.secs * 1000) + ' ms' : i.secs.toFixed(1) + ' s';
};
/** Does this sound match what is typed? Every word has to appear in its name, category or note. */
export function matches(i: LibItem, q: string): boolean {
  const hay = (i.name + ' ' + i.cat + ' ' + (i.note || '') + ' ' + (i.from || '')).toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

export function openLibrary(ui: UI, o: LibraryOpts): void {
  const { app } = ui;
  const allowed = (i: LibItem) => (o.kinds ? o.kinds.includes(i.type) : i.type !== 'cue');
  let playing: LibItem | null = null, shown = -1;
  const sheet = openSheet(o.title, (body, close) => {
    const search = textInput({ value: last.q, placeholder: 'Search the library', max: 40, onInput: v => { last.q = v; list(); } });
    search.el.setAttribute('aria-label', 'Search the library'); search.el.type = 'search';
    const kind = segmented<Kind>({ label: 'Kind', value: last.kind, options: [{ value: 'all', label: 'All' }, { value: 'shot', label: 'One shots' }, { value: 'loop', label: 'Loops' }], onChange: v => { last.kind = v; cats(); list(); } });
    const catRow = h('div', { class: 'lib-cats', attrs: { role: 'tablist', 'aria-label': 'Category' } });
    const rows = h('div', { class: 'lib-list' }), count = h('p', { class: 'help lib-count' });
    const empty = h('div', { class: 'note warn', attrs: { hidden: '' } }, icon('warn'), h('span', {}),
      btn({ label: 'Open Setup, Sounds', onClick: () => { close(); ui.go('setup', 'sounds'); } }));
    const pool = () => app.library.filter(i => allowed(i) && (last.kind === 'all' || i.type === last.kind));
    function cats() {
      const p = pool(), names = [...new Set(p.map(i => i.cat))];
      if (last.cat && !names.includes(last.cat)) last.cat = '';
      clear(catRow);
      for (const c of ['', ...names]) {
        const n = c ? p.filter(i => i.cat === c).length : p.length;
        catRow.append(h('button', { class: 'lib-cat', attrs: { type: 'button', role: 'tab', 'aria-selected': String(last.cat === c) }, on: { click: () => { last.cat = c; cats(); list(); } } },
          h('span', { text: c || 'Everything' }), h('span', { class: 'lib-n', text: String(n) })));
      }
    }
    function list() {
      const items = pool().filter(i => (!last.cat || i.cat === last.cat) && matches(i, last.q));
      clear(rows);
      count.textContent = items.length === 1 ? '1 sound' : `${items.length} sounds`;
      for (const item of items) {
        const hear = h('button', { class: 'lib-hear', attrs: { type: 'button', title: `Hear ${item.name}` }, on: { click: async () => {
          if (playing === item) { app.audition(null); playing = null; mark(); return; }
          playing = item; mark();
          if (!(await app.audition(item))) { playing = null; mark(); app.toast('That sound could not be loaded. Check Setup, Sounds.'); }
        } } }, h('span', { class: 'lib-play' }, icon('play'), icon('stop')),
          h('span', { class: 'lib-text' }, h('span', { class: 'row-name', text: item.name }), h('span', { class: 'row-note', text: [last.cat ? '' : item.cat, describe(item), item.note || ''].filter(Boolean).join(', ') })));
        const use = btn({ label: o.action, cls: 'primary', title: `${o.action}: ${item.name}`, onClick: async () => { app.audition(null); await o.onPick(item); close(); } });
        rows.append(h('div', { class: 'lib-row', attrs: { 'data-type': item.type, 'data-file': item.file } }, hear, use));
      }
      mark();
    }
    function mark() { for (const r of rows.children) r.toggleAttribute('data-playing', !!playing && (r as HTMLElement).dataset.file === playing.file); }
    body.classList.add('lib-body');
    body.append(empty, h('div', { class: 'lib-top' }, search.el, o.kinds ? '' : kind.el), catRow, count, rows);
    const refresh = () => {
      const n = app.library.length;
      if (!app.auditioningNow && playing) { playing = null; mark(); }
      if (n === shown) return;
      shown = n;
      const st = app.soundsState;
      empty.hidden = n > 0;
      empty.querySelector('span')!.textContent = st === 'bad-key' ? 'The access key was not accepted, so the sound library could not be read.'
        : st === 'unreachable' ? 'The sound library could not be reached. Check the connection.'
        : 'The sound library is not on this device yet. It needs an access key, entered once.';
      cats(); list();
    };
    refresh();
    return refresh;
  }, { tall: true, id: 'sheet-library' });
  const closeWas = sheet.close;
  sheet.close = () => { app.audition(null); closeWas(); };
}
