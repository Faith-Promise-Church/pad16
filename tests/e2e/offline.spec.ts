// Offline render tests: the real engine inside OfflineAudioContext, measured sample by sample.
import { test, expect, Page } from '@playwright/test';

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => !!(window as any).H);
});
test.afterAll(async () => { await page.close(); });
const H = <T>(fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).H[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

test('four bars of click land within 1 ms of the grid', async () => {
  const r = await H<any>('click', 120);
  expect(r.count).toBe(16); expect(r.worstMs).toBeLessThan(1);
  const odd = await H<any>('click', 97.3);
  expect(odd.count).toBe(16); expect(odd.worstMs).toBeLessThan(1);
});
test('click subdivisions and compound meter stay on the grid', async () => {
  const s = await H<any>('click', 100, { num: 4, den: 4 }, '16');
  expect(s.count).toBe(64); expect(s.worstMs).toBeLessThan(1);
  const c = await H<any>('click', 60, { num: 6, den: 8 }, '8');
  expect(c.count).toBe(24); expect(c.worstMs).toBeLessThan(1);
  const t = await H<any>('click', 110, { num: 3, den: 4 }, '3');
  expect(t.count).toBe(36); expect(t.worstMs).toBeLessThan(1);
});
test('count-in sounds with the click off, then the click stays silent', async () => {
  const r = await H<any>('countIn');
  expect(r.count).toBe(4); expect(r.beatZero - r.first).toBeCloseTo(2, 2);
});
test('a loop queued at 1 bar starts exactly on the bar line', async () => {
  const r = await H<any>('queuedLoop', 0.7);
  expect(r.stateBefore).toBe('stopped'); expect(r.queued).toBe('queued');
  expect(Math.abs(r.errSamples)).toBeLessThanOrEqual(1);
  const late = await H<any>('queuedLoop', 1.93);
  expect(Math.abs(late.errSamples)).toBeLessThanOrEqual(1);
});
test('launching a synced pad while stopped starts the transport on a downbeat', async () => {
  const r = await H<any>('launchStartsTransport');
  expect(r.running).toBe(true); expect(Math.abs(r.errSamples)).toBeLessThanOrEqual(1);
});
test('a tempo change applies on the next bar line', async () => {
  const r = await H<any>('tempoChange');
  expect(r.pending).toBe(true);
  for (const g of r.gaps.slice(0, 4)) expect(g).toBeCloseTo(0.5, 3);
  for (const g of r.gaps.slice(4, 9)) expect(g).toBeCloseTo(60 / 90, 3);
  expect(r.barLine).toBeCloseTo(2, 3);
});
test('stop modes end the loop where they should', async () => {
  const im = await H<any>('stopModes', 'immediate');
  expect(im.state).toBe('stopping'); expect(im.endBeat - im.pressBeat).toBeLessThan(0.1);
  const q = await H<any>('stopModes', 'quantized');
  expect(q.endBeat).toBeGreaterThan(7.95); expect(q.endBeat).toBeLessThanOrEqual(8.001);
  const end = await H<any>('stopModes', 'end');
  expect(end.endBeat).toBeGreaterThan(7.95); expect(end.endBeat).toBeLessThanOrEqual(8.001);
  const fade = await H<any>('stopModes', 'fade');
  expect(fade.endBeat - fade.pressBeat).toBeGreaterThan(3.6); expect(fade.endBeat - fade.pressBeat).toBeLessThanOrEqual(4.01);
  expect(fade.midFade).toBeLessThan(fade.before * 0.7); expect(fade.midFade).toBeGreaterThan(fade.before * 0.3);
});
test('an exclusive group swaps loops on the same boundary', async () => {
  const r = await H<any>('groups');
  expect(r.states).toEqual(['stopping', 'queued']);
  expect(r.before).toBeGreaterThan(300); expect(r.before).toBeLessThan(500);       // 200 Hz tone
  expect(r.after).toBeGreaterThan(1800); expect(r.after).toBeLessThan(2200);       // 1000 Hz tone
  expect(r.finalA).toBe('stopped'); expect(r.finalB).toBe('playing');
});
test('the spoken count-in lands each word on its beat and stops at the downbeat', async () => {
  const r = await H<any>('spokenCount');
  expect(r.count).toBe(4);
  for (const e of r.err) expect(Math.abs(e)).toBeLessThanOrEqual(1);                // the vowel, not the start of the word, is on the beat
  for (let i = 1; i < 4; i++) expect(r.levels[i]).toBeGreaterThan(r.levels[i - 1] * 1.2);   // each test word is louder than the last: one, two, three, four came out in that order
  expect(r.afterZero).toBe(0);
});
test('a scene starts, stops and keeps pads on one bar line', async () => {
  const r = await H<any>('scene');
  expect(r.empty).toBe(-1); expect(r.stayedStopped).toBe(true);                    // an empty scene does not start a stopped transport
  expect(r.b1).toBe(0); expect(r.running).toBe(true);
  expect(r.b2).toBe(8);                                                             // launched in bar 2 at 120: lands on beat 8
  expect(r.states).toEqual(['stopping', 'playing', 'queued']);
  expect(r.sounding).toEqual([1, 2]);
  expect(r.tickErr).toBeGreaterThanOrEqual(0); expect(r.tickErr).toBeLessThanOrEqual(3);   // the new loop starts on the bar line (the tick takes two samples to rise past the measuring threshold)
  expect(r.low[0]).toBeGreaterThan(0.05); expect(r.low[1]).toBeLessThan(0.002);     // the loop left out of the scene ends there
  expect(r.kept[1]).toBeGreaterThan(r.kept[0] * 0.95); expect(r.kept[2]).toBeGreaterThan(r.kept[0] * 0.95);   // the shared loop never dips
  expect(r.mid).toEqual(['stopped', 'playing', 'playing']);
  expect(r.b3).toBe(16); expect(r.shotErr).toBeGreaterThanOrEqual(0); expect(r.shotErr).toBeLessThanOrEqual(3);        // a one shot in a scene fires on its bar line
  expect(r.afterAll[0]).toBeLessThan(0.002); expect(r.afterAll[1]).toBeLessThan(0.002);
  expect(r.final).toEqual(['stopped', 'stopped', 'stopped']); expect(r.stillRunning).toBe(true);
});
test('a pattern pad plays its steps on the grid', async () => {
  const r = await H<any>('pattern');
  expect(r.count).toBe(8); expect(r.worstMs).toBeLessThan(1);
});
test('repitched loops stay aligned for 32 bars with no drift', async () => {
  const r = await H<any>('alignment', 'repitch');
  expect(Math.abs(r.driftMs)).toBeLessThan(0.5); expect(r.worstMs).toBeLessThan(1.5);
});
test('a stretched copy that arrives mid loop comes in on the next bar line with no gap', async () => {
  const r = await H<any>('swap');
  expect(r.before).toBe(1); expect(r.during).toBe(2);                 // old and new overlap for the crossfade only
  expect(r.count).toBe(16); expect(r.worstMs).toBeLessThan(1.5);      // every beat sounds, on the grid
  // the stand-in stretched copy is 1.8 times as loud: bar 2 is still the repitched copy, bar 3 on is the new one
  expect(r.bar3 / r.bar2).toBeGreaterThan(1.5); expect(r.bar3 / r.bar2).toBeLessThan(2);
  expect(r.bar3beat2 / r.bar2).toBeGreaterThan(1.5); expect(r.bar3beat2 / r.bar2).toBeLessThan(2);
});
test('stretched loops stay aligned for 32 bars with no drift @webkit', async () => {
  const r = await H<any>('alignment', 'stretch');
  expect(r.stretchedLen).toBe(r.expectLen);
  expect(Math.abs(r.driftMs)).toBeLessThan(0.5);
  expect(r.spreadMs).toBeLessThan(1);
  expect(r.worstMs).toBeLessThan(15);
});
test('the limiter holds the -1 dB ceiling', async () => {
  const r = await H<any>('limiter');
  expect(r.peak).toBeLessThanOrEqual(0.8915); expect(r.peak).toBeGreaterThan(0.8);
});
test('split mode keeps the click on one side and the program on the other', async () => {
  const r = await H<any>('split');
  expect(r.clickL).toBeGreaterThan(0.1); expect(r.clickR).toBeLessThan(0.001);
  expect(r.toneR).toBeGreaterThan(0.1); expect(r.toneL).toBeLessThan(0.001);
});
test('the sub synth plays in tune, starts at once and releases to silence', async () => {
  const r = await H<any>('sub');
  expect(r.hz).toBeGreaterThan(108); expect(r.hz).toBeLessThan(112);
  expect(r.held).toBeGreaterThan(0.1); expect(r.tail).toBeLessThan(0.002); expect(r.before).toBeLessThan(0.001);
  expect(r.onsetMs).toBeLessThan(5);
});
