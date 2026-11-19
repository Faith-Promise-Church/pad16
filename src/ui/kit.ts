// Small DOM helpers, the icon set and the custom controls (fader, stepper, segmented switch, sheet, picker).
// No native range inputs or select menus: everything is sized for thumbs and styled from the tokens.

type Kid = Node | string | null | undefined | false;
interface Props { class?: string; text?: string; title?: string; id?: string; attrs?: Record<string, string>; on?: Record<string, (e: any) => void> }
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) { el.title = props.title; el.setAttribute('aria-label', props.title); }
  if (props.id) el.id = props.id;
  for (const [k, v] of Object.entries(props.attrs || {})) el.setAttribute(k, v);
  for (const [k, f] of Object.entries(props.on || {})) el.addEventListener(k, f);
  for (const k of kids) if (k) el.append(k);
  return el;
}
export const clear = (el: Element) => { while (el.firstChild) el.removeChild(el.firstChild); };

/* ---------- icons: one inline set, 24 px grid, 1.5 px stroke ---------- */
const ICONS: Record<string, string> = {
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  oneshot: '<path d="M4 12h11M11 7l5 5-5 5M20 6v12"/>',
  hold: '<path d="M4 16h4V8h8v8h4"/>',
  loop: '<path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1"/>',
  pattern: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  click: '<path d="M9 3h6l4 18H5zM12 15l5-9M7.5 15h9"/>',
  mixer: '<path d="M6 3v6M6 14v7M12 3v10M12 18v3M18 3v3M18 11v10"/><rect x="4" y="9" width="4" height="5" rx="1"/><rect x="10" y="13" width="4" height="5" rx="1"/><rect x="16" y="6" width="4" height="5" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  midi: '<circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="12" r="0.6"/><circle cx="16.5" cy="12" r="0.6"/><circle cx="12" cy="7.5" r="0.6"/><circle cx="8.8" cy="8.8" r="0.6"/><circle cx="15.2" cy="8.8" r="0.6"/><path d="M10.5 21v-2.5h3V21"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  warn: '<path d="M12 3.5L2.5 20h19zM12 10v5M12 17.5v.5"/>',
  bluetooth: '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
  songs: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  panic: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3zM12 8v5M12 16v.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  export: '<path d="M12 15V4M8 8l4-4 4 4M5 14v5h14v-5"/>',
  import: '<path d="M12 4v11M8 11l4 4 4-4M5 14v5h14v-5"/>',
  pad: '<path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/><path d="M3 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0" opacity="0.5"/>',
  synth: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v7M12 6v7M16 6v7"/>',
  output: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  stage: '<path d="M3 5h18v11H3zM8 20h8M12 16v4"/><path d="M10 8.5v4l3.5-2z"/>',
  scene: '<rect x="3" y="5" width="18" height="5" rx="1.5"/><rect x="3" y="14" width="18" height="5" rx="1.5"/>',
  capture: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  bass: '<path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/>',
};
export function icon(name: string, cls = ''): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return t.content.firstChild as SVGSVGElement;
}

/* ---------- buttons ---------- */
export interface BtnOpts { label?: string; icon?: string; title?: string; cls?: string; onClick: (e: Event) => void }
export function btn(o: BtnOpts): HTMLButtonElement {
  const b = h('button', { class: 'btn ' + (o.cls || ''), title: o.title, attrs: { type: 'button' }, on: { click: o.onClick } });
  if (o.icon) b.append(icon(o.icon));
  if (o.label) b.append(h('span', { text: o.label }));
  if (o.icon && !o.label) b.classList.add('icon-only');
  return b;
}
/** A button that shows on/off with a label and a state word, not color alone. */
/** An on/off switch. With onHold, pressing and holding it does that instead of switching (used to reach a control's settings where there is no room for a second button). */
export function toggle(o: { label: string; icon?: string; value: boolean; onChange: (v: boolean) => void; cls?: string; onHold?: () => void }) {
  let v = o.value, timer = 0, held = false;
  const state = h('span', { class: 'toggle-state' });
  const b = h('button', { class: 'toggle ' + (o.cls || ''), attrs: { type: 'button', role: 'switch' }, on: { click: () => { if (held) { held = false; return; } set(!v); o.onChange(v); } } },
    o.icon ? icon(o.icon) : null, h('span', { class: 'toggle-label', text: o.label }), state);
  function set(nv: boolean) { v = nv; b.setAttribute('aria-checked', String(v)); state.textContent = v ? 'On' : 'Off'; }
  set(v);
  if (o.onHold) {
    const stop = () => { window.clearTimeout(timer); timer = 0; };
    b.addEventListener('pointerdown', e => { if (e.button > 0) return; held = false; stop(); timer = window.setTimeout(() => { timer = 0; held = true; o.onHold!(); }, 550); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, stop);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  return { el: b, set };
}

/* ---------- fader ---------- */
export interface FaderOpts { min?: number; max?: number; value: number; vertical?: boolean; label?: string; format?: (v: number) => string; curve?: 'lin' | 'log'; onInput: (v: number) => void; reset?: number }
export function fader(o: FaderOpts) {
  const min = o.min ?? 0, max = o.max ?? 1, log = o.curve === 'log';
  const toPos = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  let val = o.value, dragging = false, lastTap = 0;
  const fill = h('div', { class: 'fader-fill' }), thumb = h('div', { class: 'fader-thumb' });
  const track = h('div', { class: 'fader-track' }, fill, thumb);
  const out = h('span', { class: 'value fader-value' });
  const el = h('div', { class: 'fader' + (o.vertical ? ' vertical' : ''), attrs: { role: 'slider', tabindex: '0', 'aria-label': o.label || 'Level' } },
    o.label ? h('span', { class: 'label', text: o.label }) : null, track, o.format ? out : null);
  // the class decides the direction, so a layout can stand a fader up or lay it down
  const upright = () => el.classList.contains('vertical');
  function paint() {
    const p = Math.min(1, Math.max(0, toPos(val)));
    el.style.setProperty('--pos', String(p));
    if (o.format) out.textContent = o.format(val);
    el.setAttribute('aria-valuenow', String(Math.round(val * 100) / 100));
  }
  function fromEvent(e: PointerEvent) {
    const r = track.getBoundingClientRect();
    const p = upright() ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    val = fromPos(Math.min(1, Math.max(0, p)));
    paint(); o.onInput(val);
  }
  track.addEventListener('pointerdown', e => {
    e.preventDefault();
    const now = performance.now();
    if (o.reset !== undefined && now - lastTap < 300) { val = o.reset; paint(); o.onInput(val); lastTap = 0; return; }
    lastTap = now;
    dragging = true; track.setPointerCapture(e.pointerId); fromEvent(e);
  });
  track.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
  const end = () => { dragging = false; };
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  el.addEventListener('keydown', e => {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 0.02 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -0.02 : 0;
    if (!d) return;
    e.preventDefault(); val = fromPos(Math.min(1, Math.max(0, toPos(val) + d))); paint(); o.onInput(val);
  });
  paint();
  return { el, set(v: number) { if (!dragging && v !== val) { val = v; paint(); } }, setVertical(v: boolean) { el.classList.toggle('vertical', v); } };
}

/** A button that repeats while held, for stepping a value (tempo up and down). */
export function repeatButton(o: { icon: string; title: string; cls?: string; onStep: () => void }): HTMLButtonElement {
  const b = h('button', { class: 'btn icon-only ' + (o.cls || ''), title: o.title, attrs: { type: 'button' } }, icon(o.icon));
  let timer: any = null, count = 0;
  const stop = () => { clearTimeout(timer); timer = null; count = 0; };
  const tick = () => { count++; o.onStep(); timer = setTimeout(tick, count < 2 ? 420 : 110); };
  b.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); stop(); tick(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); o.onStep(); } });
  return b;
}
/** A button that can ask for a press and hold before it acts, so a stray touch on stage does nothing. needHold is read at press time. */
export function holdButton(o: { label?: string; icon?: string; title: string; cls?: string; needHold: () => boolean; onGo: () => void; onShortTap?: () => void; ms?: number }): HTMLButtonElement {
  const b = h('button', { class: 'btn hold-btn ' + (o.cls || ''), title: o.title, attrs: { type: 'button' } });
  if (o.icon) b.append(icon(o.icon));
  if (o.label) b.append(h('span', { text: o.label }));
  if (o.icon && !o.label) b.classList.add('icon-only');
  let timer: any = null, fired = false;
  const stop = () => { clearTimeout(timer); timer = null; b.dataset.holding = 'false'; };
  b.addEventListener('pointerdown', e => {
    if (e.button > 0 || !o.needHold()) return;
    fired = false; b.dataset.holding = 'true';
    timer = setTimeout(() => { fired = true; stop(); o.onGo(); }, o.ms ?? 600);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('click', () => { if (fired) { fired = false; return; } if (o.needHold()) o.onShortTap?.(); else o.onGo(); });
  b.addEventListener('contextmenu', e => e.preventDefault());
  return b;
}

/* ---------- stepper ---------- */
export interface StepperOpts { value: number; min: number; max: number; step?: number; bigStep?: number; format?: (v: number) => string; label?: string; onChange: (v: number) => void }
export function stepper(o: StepperOpts) {
  let val = o.value;
  const step = o.step ?? 1;
  const out = h('span', { class: 'value stepper-value' });
  const fix = (v: number) => Math.min(o.max, Math.max(o.min, Math.round(v / step) * step));
  const paint = () => { out.textContent = o.format ? o.format(val) : String(+val.toFixed(4)); };
  function bump(d: number) { const nv = +fix(val + d).toFixed(6); if (nv !== val) { val = nv; paint(); o.onChange(val); } }
  function holdable(dir: number, name: string) {
    const b = h('button', { class: 'btn icon-only stepper-btn', title: (dir < 0 ? 'Decrease ' : 'Increase ') + (o.label || ''), attrs: { type: 'button' } }, icon(name));
    let timer: any = null, count = 0;
    const stop = () => { clearTimeout(timer); timer = null; count = 0; };
    const tick = () => { count++; bump(dir * (count > 12 && o.bigStep ? o.bigStep : step)); timer = setTimeout(tick, count < 3 ? 320 : 90); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); stop(); tick(); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(dir * step); } });
    return b;
  }
  const el = h('div', { class: 'stepper' }, holdable(-1, 'minus'), out, holdable(1, 'plus'));
  paint();
  return { el, set(v: number) { if (v !== val) { val = v; paint(); } } };
}

/* ---------- segmented switch ---------- */
export function segmented<T extends string | number>(o: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label?: string }) {
  const el = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': o.label || '' } });
  const buttons = o.options.map(opt => {
    const b = h('button', { class: 'seg-btn', text: opt.label, attrs: { type: 'button' }, on: { click: () => { set(opt.value); o.onChange(opt.value); } } });
    el.append(b);
    return { b, value: opt.value };
  });
  function set(v: T) { for (const x of buttons) x.b.setAttribute('aria-pressed', String(x.value === v)); }
  set(o.value);
  return { el, set };
}

export function field(label: string, ...controls: Kid[]): HTMLDivElement {
  return h('div', { class: 'field' }, h('span', { class: 'label', text: label }), ...controls);
}
export function textInput(o: { value: string; placeholder?: string; max?: number; numeric?: boolean; onInput?: (v: string) => void; onCommit?: (v: string) => void }) {
  const el = h('input', { class: 'text-input', attrs: { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: String(o.max ?? 60), placeholder: o.placeholder || '', ...(o.numeric ? { inputmode: 'decimal' } : {}) } });
  el.value = o.value;
  el.addEventListener('input', () => o.onInput?.(el.value));
  el.addEventListener('change', () => o.onCommit?.(el.value));
  el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); e.stopPropagation(); });
  return { el, set(v: string) { if (document.activeElement !== el && el.value !== v) el.value = v; } };
}

/* ---------- sheets ---------- */
export interface Sheet { el: HTMLElement; body: HTMLElement; close: () => void; update: () => void }
const stack: Sheet[] = [];
export const openSheets = () => stack;
/** A bottom sheet. build fills the body and may return a function that refreshes it when app state changes. */
export function openSheet(title: string, build: (body: HTMLElement, close: () => void) => void | (() => void), opts: { tall?: boolean; id?: string } = {}): Sheet {
  const body = h('div', { class: 'sheet-body' });
  const close = () => { const i = stack.indexOf(sheet); if (i >= 0) stack.splice(i, 1); scrim.remove(); };
  const panel = h('div', { class: 'sheet' + (opts.tall ? ' tall' : ''), attrs: { role: 'dialog', 'aria-label': title } },
    h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-title', text: title }), btn({ icon: 'close', title: 'Close', cls: 'ghost', onClick: () => close() })), body);
  const scrim = h('div', { class: 'scrim', id: opts.id, on: { pointerdown: (e: Event) => { if (e.target === scrim) close(); } } }, panel);
  const upd = build(body, close);
  const sheet: Sheet = { el: scrim, body, close, update: () => { if (typeof upd === 'function') upd(); } };
  stack.push(sheet);
  document.body.append(scrim);
  return sheet;
}
/** Pick one of a list, in a bottom sheet. Replaces native select menus. */
export function pickSheet<T>(title: string, options: Array<{ value: T; label: string; note?: string }>, current: T, onPick: (v: T) => void): void {
  openSheet(title, (body, close) => {
    const list = h('div', { class: 'pick-list' });
    for (const o of options) {
      const on = o.value === current;
      list.append(h('button', { class: 'pick' + (on ? ' on' : ''), attrs: { type: 'button', 'aria-pressed': String(on) }, on: { click: () => { close(); onPick(o.value); } } },
        h('span', { class: 'pick-label', text: o.label }), o.note ? h('span', { class: 'pick-note', text: o.note }) : null, on ? icon('check') : null));
    }
    body.append(list);
  });
}
/** A labelled button that shows the current choice and opens a picker. */
export function pickButton<T>(o: { title: string; options: () => Array<{ value: T; label: string; note?: string }>; value: () => T; onPick: (v: T) => void; cls?: string }) {
  const val = h('span', { class: 'value' });
  const el = h('button', { class: 'btn pick-btn ' + (o.cls || ''), attrs: { type: 'button' }, on: { click: () => pickSheet(o.title, o.options(), o.value(), o.onPick) } }, val, icon('down', 'small'));
  const update = () => { const cur = o.options().find(x => x.value === o.value()); val.textContent = cur ? cur.label : 'None'; };
  update();
  return { el, update };
}
export function confirmSheet(title: string, message: string, action: string, onYes: () => void): void {
  openSheet(title, (body, close) => {
    body.append(h('p', { class: 'help', text: message }),
      h('div', { class: 'row' }, btn({ label: 'Cancel', cls: 'ghost grow', onClick: () => close() }), btn({ label: action, cls: 'danger grow', onClick: () => { close(); onYes(); } })));
  });
}
export const pct = (v: number) => Math.round(v * 100) + '%';
export const db = (v: number) => (v <= 0.001 ? '-inf dB' : (20 * Math.log10(v)).toFixed(1) + ' dB');

/* ---------- sections: a destination split into named parts ---------- */
export interface SectionDef { id: string; label: string; build: () => { el: HTMLElement; update: () => void; frame?: () => void } }
/** A list of sections beside (or, on a narrow screen, above) the one that is open. Each section is built the first time it is opened. */
export function sectioned(title: string, defs: SectionDef[], current: () => string, pick: (id: string) => void) {
  const nav = h('nav', { class: 'sec-nav', attrs: { 'aria-label': title } });
  const body = h('div', { class: 'sec-body' });
  const built = new Map<string, { el: HTMLElement; update: () => void; frame?: () => void }>();
  const tabs = defs.map(d => {
    const b = h('button', { class: 'sec-tab', text: d.label, attrs: { type: 'button' }, on: { click: () => pick(d.id) } });
    nav.append(b); return { d, b };
  });
  const el = h('div', { class: 'sectioned' }, nav, body);
  let shown = '';
  const active = () => (defs.some(d => d.id === current()) ? current() : defs[0].id);
  return {
    el,
    update() {
      const id = active();
      for (const t of tabs) t.b.setAttribute('aria-current', String(t.d.id === id));
      let v = built.get(id);
      if (!v) { v = defs.find(d => d.id === id)!.build(); v.el.classList.add('sec-pane'); built.set(id, v); }
      if (shown !== id) { shown = id; body.replaceChildren(v.el); body.scrollTop = 0; }
      v.update();
    },
    frame() { built.get(shown)?.frame?.(); },
  };
}
