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
    it('text on filled accent buttons holds 4.5:1', () => {
      for (const st of ['playing', 'queued', 'stopping', 'cue', 'text']) expect(ratio(rgb(t['on-accent']), rgb(t[st])), `label on ${st}`).toBeGreaterThanOrEqual(4.5);
    });
    it('the selection outline and control borders stand out at 3:1', () => {
      for (const s of surfaces) { expect(ratio(rgb(t.select), rgb(t[s]))).toBeGreaterThanOrEqual(3); expect(ratio(rgb(t['hairline-strong']), rgb(t[s]))).toBeGreaterThanOrEqual(3); }
    });
  });
}
