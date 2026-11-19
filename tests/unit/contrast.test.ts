// Reads the design tokens and checks contrast for every text and state pair in both themes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/ui/tokens.css', import.meta.url), 'utf8');
function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}
const dark = vars(css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme="light"]')));
const light = { ...dark, ...vars(css.slice(css.indexOf(':root[data-theme="light"]'), css.indexOf('@media (max-width'))) };
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (c: number[]) => { const [r, g, b] = c.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (top: number[], under: number[], a: number) => top.map((v, i) => v * a + under[i] * (1 - a));

for (const [name, t] of [['dark', dark], ['daylight', light]] as const) {
  describe(`${name} theme contrast`, () => {
    const surfaces = ['bg', 'surface', 'raised'];
    it('text and secondary text hold 4.5:1 on every surface', () => {
      for (const s of surfaces) for (const fg of ['text', 'text-2']) expect(ratio(rgb(t[fg]), rgb(t[s])), `${fg} on ${s}`).toBeGreaterThanOrEqual(4.5);
    });
    it('state colors hold 4.5:1 on every surface', () => {
      for (const s of surfaces) for (const fg of ['playing', 'queued', 'stopping', 'cue']) expect(ratio(rgb(t[fg]), rgb(t[s])), `${fg} on ${s}`).toBeGreaterThanOrEqual(4.5);
    });
    it('text stays readable on a pad tinted with a state color', () => {
      const a = name === 'dark' ? 0.14 : 0.16;
      for (const st of ['playing', 'queued', 'stopping']) {
        const pad = mix(rgb(t[st]), rgb(t.surface), a);
        expect(ratio(rgb(t.text), pad), `text on ${st} pad`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(t['text-2']), pad), `secondary on ${st} pad`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(t[st]), pad), `${st} label on its pad`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it('text stays readable on a pad tinted with a muted pad color, and the muted colors do not pass for state colors', () => {
      const a = name === 'dark' ? 0.2 : 0.22, names = ['sand', 'clay', 'rose', 'plum', 'slate', 'teal', 'sage', 'stone'];
      expect(css).toContain(`--tint-pad: ${a * 100}%`);
      const sat = (c: number[]) => { const mx = Math.max(...c), mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };
      for (const n of names) {
        const c = rgb(t['pad-' + n]), pad = mix(c, rgb(t.surface), a);
        expect(ratio(rgb(t.text), pad), `text on ${n} pad`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(t['text-2']), pad), `secondary on ${n} pad`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(c, rgb(t.surface)), `${n} bar on the surface`).toBeGreaterThanOrEqual(3);
        for (const st of ['playing', 'queued', 'stopping']) expect(sat(c), `${n} is quieter than ${st}`).toBeLessThan(sat(rgb(t[st])) - 0.1);
      }
    });
    it('a sounding pad lit in its own color keeps its name readable and its ring visible', () => {
      const a = name === 'dark' ? 0.34 : 0.26, sheen = name === 'dark' ? 0.05 : 0;
      expect(css).toContain(`--tint-pad-lit: ${a * 100}%`);
      expect(css).toContain(`--sheen: ${sheen * 100}%`);
      for (const n of ['sand', 'clay', 'rose', 'plum', 'slate', 'teal', 'sage', 'stone']) {
        const lit = mix(rgb(t['pad-' + n]), rgb(t.surface), a), top = mix(rgb(t.text), lit, sheen);      // the top of a pad carries a faint light
        for (const bg of [lit, top]) {
          expect(ratio(rgb(t.text), bg), `text on a lit ${n} pad`).toBeGreaterThanOrEqual(4.5);          // the name, and the word Playing, which is drawn in the text color here
          expect(ratio(rgb(t.playing), bg), `ring on a lit ${n} pad`).toBeGreaterThanOrEqual(3);
        }
      }
    });
    it('scene buttons: the name reads on a tinted button, and the one that is on is the brightest thing in the row', () => {
      const a = name === 'dark' ? 0.2 : 0.22;
      for (const n of ['sand', 'clay', 'rose', 'plum', 'slate', 'teal', 'sage', 'stone']) {
        const b = mix(rgb(t['pad-' + n]), rgb(t.surface), a);
        expect(ratio(rgb(t.text), b), `text on a ${n} scene`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(t['text-2']), b), `number on a ${n} scene`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(rgb(t.text), b), `an on scene against a ${n} scene`).toBeGreaterThanOrEqual(4.5);
      }
      const queued = mix(rgb(t.queued), rgb(t.raised), name === 'dark' ? 0.14 : 0.16);
      expect(ratio(rgb(t.queued), queued), 'Next bar on a queued scene').toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb(t.text), queued), 'name on a queued scene').toBeGreaterThanOrEqual(4.5);
    });
    it('text on filled accent buttons holds 4.5:1', () => {
      for (const st of ['playing', 'queued', 'stopping', 'cue', 'text']) expect(ratio(rgb(t['on-accent']), rgb(t[st])), `label on ${st}`).toBeGreaterThanOrEqual(4.5);
    });
    it('the selection outline and control borders stand out at 3:1', () => {
      for (const s of surfaces) { expect(ratio(rgb(t.select), rgb(t[s]))).toBeGreaterThanOrEqual(3); expect(ratio(rgb(t['hairline-strong']), rgb(t[s]))).toBeGreaterThanOrEqual(3); }
    });
  });
}
