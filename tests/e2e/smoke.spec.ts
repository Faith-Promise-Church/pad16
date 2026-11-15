// Smoke tests at iPad portrait, iPad landscape and large iPhone sizes: load, unlock audio, trigger pads, queue and launch a loop.
import { test, expect, Page } from '@playwright/test';

const SIZES = [{ name: 'ipad-portrait', width: 1024, height: 1366 }, { name: 'ipad-landscape', width: 1366, height: 1024 }, { name: 'iphone', width: 430, height: 932 }];
const app = <T>(page: Page, fn: string) => page.evaluate(`(async () => { const app = window.pad16; return (${fn})(app); })()`) as Promise<T>;

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true });
    test('loads, unlocks audio, triggers pads, queues and launches a loop', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto('/');
      await page.waitForSelector('html[data-ready="true"]');
      await expect(page.locator('.pad')).toHaveCount(16);
      await expect(page.locator('.bpm-num')).toHaveText('96');
      expect(await app(page, 'a => a.eng.pads.pads.filter(p => p.buffer).length')).toBe(16);

      // first touch unlocks audio and plays the pad
      await page.locator('.pad').first().tap();
      await expect.poll(() => app(page, 'a => a.ctx.state')).toBe('running');
      expect(await app(page, 'a => a.unlocked')).toBe(true);
      await page.locator('.pad').nth(4).tap();
      await expect(page.locator('.pad').nth(4)).toHaveAttribute('data-lit', 'true');
      // sound actually reaches the drum bus meter
      await page.locator('.pad').nth(0).tap();
      await expect.poll(() => app(page, 'a => a.eng.mixer.level("drums") > 0.01'), { timeout: 3000 }).toBe(true);

      // load the Acoustic Set from the repo, start the transport, queue the shaker loop mid-bar
      await app(page, 'a => a.loadKit("Acoustic Set")');
      await expect(page.locator('.pad').nth(13).locator('.pad-name')).toHaveText('Shaker Loop');
      expect(await app(page, 'a => a.padMeta.filter(m => m.missing).length')).toBe(0);
      expect(await app(page, 'a => [a.song.pads[13].mode, a.song.pads[13].sourceBpm, a.song.pads[13].lengthBeats]')).toEqual(['loop', 113, 8]);
      await page.locator('.run-btn').tap();
      await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'true');
      await page.waitForFunction(() => { const a = (window as any).pad16; const b = a.eng.clock.beatAt(a.eng.now()); return b % 4 > 0.6 && b % 4 < 2; });
      await page.locator('.pad').nth(13).tap();
      await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'queued');
      await expect(page.locator('.pad').nth(13).locator('.pad-state')).toHaveText('Queued');
      await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'playing', { timeout: 4000 });
      await expect.poll(() => app(page, 'a => a.eng.mixer.level("loops") > 0.005'), { timeout: 3000 }).toBe(true);
      // tapping again queues the stop, and it stops on the bar line
      await page.locator('.pad').nth(13).tap();
      await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'stopping');
      await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'stopped', { timeout: 4000 });
      await page.screenshot({ path: `test-results/smoke-${size.name}.png` });
      await page.locator('.run-btn').tap();
      await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'false');
      expect(errors).toEqual([]);
    });

    test('saves on every change and comes back after a reload', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('html[data-ready="true"]');
      await app(page, 'a => { a.patchSong({ bpm: 123.4, name: "Saved song" }); a.patchPad(2, { name: "Renamed" }); a.flush(); }');
      await page.waitForTimeout(300);
      await page.reload();
      await page.waitForSelector('html[data-ready="true"]');
      await expect(page.locator('.bpm-num')).toHaveText('123.4');
      await expect(page.locator('.pad').nth(2).locator('.pad-name')).toHaveText('Renamed');
      await expect(page.locator('.song-name').first()).toHaveText('Saved song');
    });
  });
}

test.describe('stage behavior', () => {
  test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });
  test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForSelector('html[data-ready="true"]'); await page.locator('.pad').first().tap(); });

  test('a pattern pad launches on the bar and can be edited while playing', async ({ page }) => {
    await app(page, 'a => a.patchPad(5, { mode: "pattern", patternId: "starter-stomp-clap" })');
    await page.locator('.pad').nth(5).tap();
    await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'true');
    await expect(page.locator('.pad').nth(5)).toHaveAttribute('data-state', 'playing', { timeout: 3000 });
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("drums") > 0.01'), { timeout: 4000 }).toBe(true);
    await app(page, 'a => { const p = a.state.patterns.find(x => x.id === "starter-stomp-clap"); p.tracks[4].steps[2] = 3; a.changed(); }');
    await expect(page.locator('.pad').nth(5)).toHaveAttribute('data-state', 'playing');
  });
  test('exclusive group pads swap, and panic stops everything', async ({ page }) => {
    await app(page, 'a => a.loadKit("Acoustic Set")');
    await app(page, 'a => { a.patchPad(13, { group: "A" }); a.patchPad(5, { mode: "pattern", patternId: "starter-cajon", group: "A" }); }');
    await page.locator('.pad').nth(13).tap();
    await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'playing', { timeout: 3000 });
    await page.locator('.pad').nth(5).tap();
    await expect(page.locator('.pad').nth(5)).toHaveAttribute('data-state', 'playing', { timeout: 4000 });
    await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'stopped');
    await app(page, 'a => a.patchSong({ sub: { ...a.song.sub, on: true } })');
    await app(page, 'a => a.eng.sub.noteOn(33)');
    await page.locator('[title="Panic: stop everything"]').tap();
    await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'false');
    await expect(page.locator('.pad').nth(5)).toHaveAttribute('data-state', 'stopped');
    expect(await app(page, 'a => a.eng.sub.currentNote')).toBeNull();
  });
  test('the sub synth plays the lowest key and the tonic pad fades in and changes key', async ({ page }) => {
    await page.locator('.rail .sub-card .toggle').tap();
    await app(page, 'a => { a.eng.sub.noteOn(40); a.eng.sub.noteOn(33); }');
    await expect(page.locator('.rail .sub-card .note-read')).toHaveText('A1');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("sub") > 0.02'), { timeout: 3000 }).toBe(true);
    await app(page, 'a => { a.eng.sub.noteOff(33); }');
    await expect(page.locator('.rail .sub-card .note-read')).toHaveText('E2');
    await app(page, 'a => a.eng.sub.noteOff(40)');
    await app(page, 'a => a.patchSong({ tonic: { ...a.song.tonic, on: true, fadeIn: 0.3, xfade: 2 } })');
    await expect.poll(() => app(page, 'a => a.eng.tonic.status'), { timeout: 15000 }).toBe('on');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("pad") > 0.005'), { timeout: 6000 }).toBe(true);
    // every key has its own sample in both pad sets, so nothing is pitch-shifted
    expect(await app(page, 'a => a.bank.index.padsets.map(p => [p.name, Object.keys(p.keys).length])')).toEqual([['Mesosphere (shimmery)', 12], ['Troposphere (mellow)', 12]]);
    await app(page, 'a => a.patchSong({ key: 6 })');
    expect(await app(page, 'a => a.eng.tonic.pick(6)')).toMatchObject({ file: 'Pad Gb.mp3', shift: 0 });
    await expect.poll(() => app(page, 'a => a.eng.tonic.key === 6 && a.eng.tonic.status'), { timeout: 15000 }).toBe('on');
    await expect(page.locator('.rail .tonic-card .card-status')).toHaveText('');
    // the one-minute MP3 loops with no gap at the seam: both ends of the prepared loop carry signal and meet
    const seam = await app<any>(page, `a => { const b = [...a.eng.tonic.cache.values()].pop(), x = b.getChannelData(0), n = x.length, w = Math.round(b.sampleRate * 0.1);
      const rms = (from, to) => { let e = 0; for (let i = from; i < to; i++) e += x[i] * x[i]; return Math.sqrt(e / (to - from)); };
      let step = 0; for (let i = 1; i < n; i += 7) step = Math.max(step, Math.abs(x[i] - x[i - 1]));
      return { sec: n / b.sampleRate, all: rms(0, n), head: rms(0, w), tail: rms(n - w, n), jump: Math.abs(x[0] - x[n - 1]), step }; }`);
    expect(seam.sec).toBeGreaterThan(56); expect(seam.sec).toBeLessThan(59);
    expect(seam.head).toBeGreaterThan(seam.all * 0.3); expect(seam.tail).toBeGreaterThan(seam.all * 0.3);
    expect(seam.jump).toBeLessThanOrEqual(seam.step * 1.5);
    // low cut rolls the bottom off the pad
    await app(page, 'a => a.patchSong({ tonic: { ...a.song.tonic, hp: 300, set: "Troposphere (mellow)" } })');
    await expect.poll(() => app(page, 'a => Math.round(a.eng.tonic.hp.frequency.value)'), { timeout: 3000 }).toBe(300);
    await expect.poll(() => app(page, 'a => a.eng.tonic.set.name')).toBe('Troposphere (mellow)');
  });
  test('a missing kit sample plays a stand-in instead of failing', async ({ page }) => {
    await app(page, 'a => a.patchPad(3, { src: { t: "kit", kit: "Nope", file: "gone.wav" }, name: "Gone" })');
    await expect(page.locator('.pad').nth(3).locator('.pad-state')).toHaveText('Stand-in');
    await page.locator('.pad').nth(3).tap();
    await expect(page.locator('.pad').nth(3)).toHaveAttribute('data-lit', 'true');
  });
  test('a stretched loop renders, then plays the stretched copy', async ({ page }) => {
    await app(page, 'a => a.loadKit("Acoustic Set")');
    await app(page, 'a => { a.patchSong({ bpm: 104 }); a.patchPad(13, { sync: "stretch" }); }');
    expect(await app(page, 'a => a.stretchWarning(13)')).toBe(false);          // 113 to 104 is 8 percent
    await expect.poll(() => app(page, 'a => a.padMeta[13].stretch'), { timeout: 20000 }).toBe('ready');
    const r = await app<any>(page, 'a => { const p = a.eng.pads.pads[13]; return { bpm: p.stretched.bpm, len: p.stretched.buffer.length, sr: p.stretched.buffer.sampleRate }; }');
    expect(r.bpm).toBe(104); expect(r.len).toBe(Math.round(((8 * 60) / 104) * r.sr));
  });
  test('songs switch with keys, export and import as one file', async ({ page }) => {
    await app(page, 'a => { a.addSong(); }');
    await app(page, 'a => a.patchSong({ name: "Second", bpm: 120, key: 7 })');
    expect(await app(page, 'a => a.setSongs.length')).toBe(2);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.song-name').first()).toHaveText('My pads');
    await expect(page.locator('.song-next').first()).toHaveText('Next: Second');
    await page.keyboard.press('PageDown');
    await expect(page.locator('.song-name').first()).toHaveText('Second');
    await expect(page.locator('.bpm-num')).toHaveText('120');
    const n = await app<number>(page, 'async a => { const out = await a.exportCurrentSet(); await a.importSetFile(out.data.buffer); return a.state.sets.length; }');
    expect(n).toBe(2);
    expect(await app(page, 'a => a.setSongs.map(s => s.name)')).toEqual(['My pads', 'Second']);
  });
  test('the click can be the stock sound or the click set from the repo', async ({ page }) => {
    expect(await app(page, 'a => a.bank.index.clicksets.map(c => c.name)')).toEqual(['Justin Click']);
    expect(await app(page, 'a => a.clickSet.name')).toBe('Justin Click');            // a supplied click wins until told otherwise
    await expect.poll(() => app(page, 'a => !!a.webClick.samples.accent && !!a.webClick.samples.beat && !!a.webClick.samples.sub')).toBe(true);
    await page.locator('[title="Click settings"]').tap();
    await page.locator('.seg-btn', { hasText: 'Built-in' }).tap();
    expect(await app(page, 'a => a.clickSet')).toBeNull();
    await expect.poll(() => app(page, 'a => !a.webClick.samples.accent && !a.webClick.samples.sub')).toBe(true);
    await page.locator('.seg-btn', { hasText: 'Justin Click' }).tap();
    await expect.poll(() => app(page, 'a => !!a.webClick.samples.accent')).toBe(true);
    // with the click on, it sounds through the click bus
    await app(page, 'a => { a.patchSong({ click: { ...a.song.click, on: true } }); a.eng.transport.start(); }');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("click") > 0.02'), { timeout: 4000 }).toBe(true);
  });
  test('starter patterns play the real recordings from the Acoustic Set', async ({ page }) => {
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "stomp" })')).toEqual({ t: 'kit', kit: 'Acoustic Set', file: '1 Stomp.wav' });
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "cajon-slap" })')).toEqual({ t: 'kit', kit: 'Acoustic Set', file: '11 Cajon Slap.wav' });
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "click-beat" })')).toEqual({ t: 'synth', id: 'click-beat' });
    expect(await app(page, 'a => a.bank.index.kits.map(k => [k.name, k.pads.length])')).toEqual([['Acoustic Set', 16], ['Cajon Slaps', 11]]);
  });
  test('edit lock blocks editing, and the daylight theme applies', async ({ page }) => {
    await page.locator('[title="Edit pads"]').tap();
    await expect(page.locator('#app')).toHaveAttribute('data-edit', 'true');
    await page.locator('[title="Edit lock"]').tap();
    await expect(page.locator('#app')).toHaveAttribute('data-edit', 'false');
    await expect(page.locator('[title="Edit pads"]')).toBeDisabled();
    await app(page, 'a => { a.state.settings.theme = "light"; a.changed(); }');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
  test('split mode and the diagnostics panel work, and Multi-out is not offered on two channels', async ({ page }) => {
    await page.locator('[title="Settings"]').tap();
    await expect(page.locator('.seg-btn', { hasText: 'Multi-out' })).toHaveCount(0);
    await page.locator('.seg-btn', { hasText: 'Split' }).tap();
    expect(await app(page, 'a => a.eng.mixer.activeMode')).toBe('split');
    await page.locator('.seg-btn', { hasText: 'Diagnostics' }).tap();
    await expect(page.locator('.kv').last()).toContainText('Sample rate');
    await expect(page.locator('.kv').last()).toContainText('2 reported, 2 opened');
  });
});
