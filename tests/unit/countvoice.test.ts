// Which number is said on which beat of the count-in.
import { describe, it, expect } from 'vitest';
import { countPlan } from '../../src/engine/countvoice';

const all = () => true, upTo = (max: number) => (n: number) => n <= max;
describe('countPlan', () => {
  it('counts one bar of 4/4', () => {
    expect(countPlan(-4, 0, { num: 4, den: 4 }, 0.5, all)).toEqual([{ beat: -4, n: 1 }, { beat: -3, n: 2 }, { beat: -2, n: 3 }, { beat: -1, n: 4 }]);
  });
  it('counts each bar of a two-bar count from one', () => {
    expect(countPlan(-8, 0, { num: 4, den: 4 }, 0.5, all).map(w => w.n)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
  it('says nothing from the downbeat on, and handles a window that straddles it', () => {
    expect(countPlan(0, 4, { num: 4, den: 4 }, 0.5, all)).toEqual([]);
    expect(countPlan(-1.5, 2, { num: 4, den: 4 }, 0.5, all)).toEqual([{ beat: -1, n: 4 }]);
  });
  it('schedules in pieces without saying a word twice or dropping one', () => {
    const got: number[] = [];
    for (let a = -4; a < 0; a += 0.3) got.push(...countPlan(a, Math.min(0, a + 0.3), { num: 4, den: 4 }, 0.5, all).map(w => w.beat));
    expect(got).toEqual([-4, -3, -2, -1]);
  });
  it('counts three in 3/4', () => {
    expect(countPlan(-3, 0, { num: 3, den: 4 }, 0.6, all).map(w => w.n)).toEqual([1, 2, 3]);
  });
  it('counts the six eighth notes of a slow 6/8, on the eighths', () => {
    const p = countPlan(-2, 0, { num: 6, den: 8 }, 1.0, all);            // pulse of 60: an eighth every third of a second
    expect(p.map(w => w.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.map(w => +w.beat.toFixed(3))).toEqual([-2, -1.667, -1.333, -1, -0.667, -0.333]);
  });
  it('counts only the two pulses of a fast 6/8, where six words would not fit', () => {
    expect(countPlan(-2, 0, { num: 6, den: 8 }, 0.5, all).map(w => w.n)).toEqual([1, 2]);
  });
  it('counts the pulses of 12/8 when there are not twelve words', () => {
    expect(countPlan(-4, 0, { num: 12, den: 8 }, 1.2, upTo(10)).map(w => w.n)).toEqual([1, 2, 3, 4]);
  });
  it('skips a number it has no word for and keeps the rest in place', () => {
    expect(countPlan(-4, 0, { num: 4, den: 4 }, 0.5, n => n !== 3)).toEqual([{ beat: -4, n: 1 }, { beat: -3, n: 2 }, { beat: -1, n: 4 }]);
  });
});
