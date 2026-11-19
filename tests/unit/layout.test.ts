// Which layout each screen gets. The browser tests check the result on screen; these pin the rules.
import { describe, it, expect } from 'vitest';
import { layoutFor, sceneColumns } from '../../src/ui/layout';

describe('layoutFor', () => {
  const cases: Array<[string, number, number, ReturnType<typeof layoutFor>]> = [
    ['iPad 13 landscape', 1366, 1024, { tier: 'expanded', arr: 'side', tabs: 'bar', bar: 1, strips: 'upright' }],
    ['iPad 13 portrait', 1024, 1366, { tier: 'expanded', arr: 'stack', tabs: 'bar', bar: 2, strips: 'wide' }],
    ['iPad 11 landscape', 1194, 834, { tier: 'expanded', arr: 'side', tabs: 'bar', bar: 1, strips: 'upright' }],
    ['iPad 11 portrait', 834, 1194, { tier: 'medium', arr: 'stack', tabs: 'bottom', bar: 2, strips: 'wide' }],
    ['iPad mini landscape', 1133, 744, { tier: 'expanded', arr: 'side', tabs: 'bar', bar: 2, strips: 'upright' }],
    ['iPad mini portrait', 744, 1133, { tier: 'medium', arr: 'stack', tabs: 'bottom', bar: 2, strips: 'wide' }],
    ['folding phone open, landscape', 951, 669, { tier: 'medium', arr: 'side', tabs: 'bar', bar: 3, strips: 'rows' }],
    ['folding phone open, portrait', 669, 951, { tier: 'medium', arr: 'stack', tabs: 'bottom', bar: 2, strips: 'wide' }],
    ['iPad half-screen window', 678, 1024, { tier: 'medium', arr: 'stack', tabs: 'bottom', bar: 2, strips: 'wide' }],
    ['iPad third-screen window', 375, 1024, { tier: 'compact', arr: 'stack', tabs: 'bottom', bar: 3, strips: 'rows' }],
    ['large phone', 440, 956, { tier: 'compact', arr: 'stack', tabs: 'bottom', bar: 3, strips: 'rows' }],
    ['phone', 393, 852, { tier: 'compact', arr: 'stack', tabs: 'bottom', bar: 3, strips: 'rows' }],
    ['phone in a browser, short', 393, 660, { tier: 'compact', arr: 'stack', tabs: 'bottom', bar: 3, strips: 'pair' }],
    ['phone on its side', 852, 393, { tier: 'compact', arr: 'side', tabs: 'bar-icons', bar: 3, strips: 'pair' }],
    ['large phone on its side', 956, 440, { tier: 'compact', arr: 'side', tabs: 'bar', bar: 3, strips: 'pair' }],
  ];
  for (const [name, w, h, want] of cases) it(name, () => expect(layoutFor(w, h)).toEqual(want));
  it('a nearly square window stacks; the pads go beside the controls only when there is clear width to spare', () => {
    expect(layoutFor(1000, 1000).arr).toBe('stack');
    expect(layoutFor(1150, 1000).arr).toBe('side');
  });
});

describe('sceneColumns', () => {
  it('one row on a wide portrait screen, however many scenes', () => {
    for (const n of [1, 5, 9]) expect(sceneColumns(n, 'expanded', 'stack')).toBe(n);
  });
  it('two balanced rows where the screen is narrower, once there are more than four', () => {
    expect(sceneColumns(4, 'medium', 'stack')).toBe(4);
    expect(sceneColumns(6, 'medium', 'stack')).toBe(3);
    expect(sceneColumns(9, 'compact', 'stack')).toBe(5);
  });
  it('beside the pads: one column up to four, then two; a phone on its side spreads them across', () => {
    expect(sceneColumns(4, 'expanded', 'side')).toBe(1);
    expect(sceneColumns(6, 'expanded', 'side')).toBe(2);
    expect(sceneColumns(9, 'medium', 'side')).toBe(2);
    expect(sceneColumns(6, 'compact', 'side')).toBe(3);
    expect(sceneColumns(9, 'compact', 'side')).toBe(5);
  });
  it('never returns no columns', () => expect(sceneColumns(0, 'compact', 'stack')).toBe(1));
});
