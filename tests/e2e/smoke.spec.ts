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
      expect(await app(page, 'a => [a.song.pads[13].mode, a.song.pads[13].sourceBpm, a.song.pads[13].lengthBeats]')).toEqual(['loop', 96, 4]);
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
    await expect.poll(() => app(page, 'a => a.eng.tonic.status')).toBe('on');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("pad") > 0.01'), { timeout: 4000 }).toBe(true);
    await app(page, 'a => a.patchSong({ key: 5 })');
    await expect(page.locator('.rail .tonic-card .card-status')).toHaveText('Fallback');
    expect(await app(page, 'a => a.eng.tonic.pick(5).shift')).toBe(5);
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
    await expect.poll(() => app(page, 'a => a.padMeta[13].stretch'), { timeout: 20000 }).toBe('ready');
    const r = await app<any>(page, 'a => { const p = a.eng.pads.pads[13]; return { bpm: p.stretched.bpm, len: p.stretched.buffer.length, sr: p.stretched.buffer.sampleRate }; }');
    expect(r.bpm).toBe(104); expect(r.len).toBe(Math.round(((4 * 60) / 104) * r.sr));
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
