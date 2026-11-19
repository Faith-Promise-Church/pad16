// Smoke tests at iPad portrait, iPad landscape and large iPhone sizes: load, unlock audio, trigger pads, queue and launch a loop.
// Then Perform and Edit: the layout on every screen shape, scenes, stage lock, and the five Edit destinations.
import { test, expect, Page } from '@playwright/test';

const SIZES = [{ name: 'ipad-portrait', width: 1024, height: 1366 }, { name: 'ipad-landscape', width: 1366, height: 1024 }, { name: 'iphone', width: 430, height: 932 }];
/** Open the app on the plain starting song. A fresh install opens on the ready-made set; most tests want "My pads". */
const start = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('html[data-ready="true"]');
  await page.evaluate(`(async () => { const a = window.pad16, set = a.state.sets[0]; a.state.currentSet = set.id; await a.selectSong(set.songIds[0]); a.changed(); })()`);
};
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
      // a fresh install opens on the ready-made set
      await expect(page.locator('.song-name').first()).toHaveText('Bless God');
      await expect(page.locator('.bpm-num')).toHaveText('72.5');
      await start(page);
      await expect(page.locator('.pad')).toHaveCount(16);
      await expect(page.locator('.grid-col .page-tab')).toHaveCount(2);
      await expect(page.locator('.bpm-num')).toHaveText('80');
      // a fresh install opens on the default layout; this test plays the built-in one shots
      await expect(page.locator('.pad').first().locator('.pad-name')).toHaveText('Shaker');
      await app(page, 'a => a.loadKit("builtin")');
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
      expect(await page.evaluate('window.pad16.state.sets.map(s => s.name)')).toEqual(['My set', 'Acoustic set']);     // the ready-made set is not added twice
    });
  });
}

test.describe('phone layout', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });
  test('Perform on a phone: three bar rows, a small page switch, and pads wide enough to read their names @webkit', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-ready="true"]');
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    // tempo row, then beat, click, page switch and tools, then the song row. Nothing wraps to a fourth row.
    const [run, tap, sw, panic, song, bar] = [await box('.run-btn'), await box('.tap-btn'), await box('.pages.compact'), await box('.panic-btn'), await box('.song-btn'), await box('.perform-bar')];
    expect(Math.abs(tap.y + tap.height / 2 - run.y - run.height / 2)).toBeLessThan(4);
    expect(Math.abs(panic.y - sw.y)).toBeLessThan(6); expect(sw.y).toBeGreaterThan(run.y + 40);
    expect(song.y).toBeGreaterThan(sw.y + 40); expect(bar.height).toBeLessThan(190);
    expect(panic.x + panic.width).toBeLessThanOrEqual(393); expect(sw.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.grid-col .pages')).toBeHidden();
    // one screen holds the set: scenes over the pads, Ambient and Bass under them, and the grid takes the full width
    const [grid, scenes, strips] = [await box('.grid'), await box('.scenes'), await box('.strips')];
    expect(grid.width).toBeGreaterThan(370);
    expect(scenes.y + scenes.height).toBeLessThanOrEqual(grid.y + 1); expect(strips.y).toBeGreaterThanOrEqual(grid.y + grid.height - 1);
    expect(Math.round(strips.y + strips.height)).toBeLessThanOrEqual(852);
    await expect(page.locator('.editor')).toBeHidden(); await expect(page.locator('.dest-tabs.bottom')).toBeHidden();
    // every pad name shows in full, on whole words
    const names = await page.locator('.pad-name').evaluateAll(els => els.map(e => ({ t: e.textContent, cut: e.scrollHeight > e.clientHeight + 1, w: (e as HTMLElement).clientWidth })));
    expect(names.filter(n => n.cut).map(n => n.t)).toEqual([]);
    expect(await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d')!, e = document.querySelector('.pad-name')!; c.font = getComputedStyle(e).font; return c.measureText('Syncopated').width < (e as HTMLElement).clientWidth; })).toBe(true);
    // the switch turns the page; the dot on it shows a pad playing out of view
    await page.locator('.pad').nth(8).tap();
    await page.locator('.pages.compact .page-tab').nth(1).tap();
    await expect(page.locator('.pad').nth(8).locator('.pad-name')).toHaveText('Kick on 1');
    await expect(page.locator('.pages.compact .page-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pages.compact .page-tab').nth(0)).toHaveAttribute('data-busy', 'true', { timeout: 6000 });
    await page.screenshot({ path: 'test-results/phone-layout.png' });
    // the click button only switches the click: Perform opens no menus
    const click = page.locator('.perform-bar .click-toggle'), was = await app<boolean>(page, 'a => a.song.click.on');
    await click.tap();
    expect(await app(page, 'a => a.song.click.on')).toBe(!was);
    await expect(page.locator('.sheet')).toHaveCount(0);
    // tempo: one beat a press
    const bpm = await app<number>(page, 'a => a.song.bpm');
    await page.locator('[title="Tempo up 1"]').tap(); await page.locator('[title="Tempo up 1"]').tap(); await page.locator('[title="Tempo down 1"]').tap();
    expect(await app(page, 'a => a.song.bpm')).toBe(bpm + 1);
    // Edit on a phone: the five destinations run along the bottom edge, and click settings live in Song
    await page.locator('.edit-btn').tap();
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'edit');
    const tabs = await box('.dest-tabs.bottom');
    expect(Math.round(tabs.y + tabs.height)).toBe(852);
    await expect(page.locator('.dest-tabs.bottom .dest-tab')).toHaveText(['Pads', 'Loops', 'Song', 'Mix', 'Setup']);
    await expect(page.locator('.scenes')).toBeHidden(); await expect(page.locator('.strips')).toBeHidden();
    await page.locator('.dest-tabs.bottom .dest-tab', { hasText: 'Song' }).tap();
    await page.locator('.sec-tab', { hasText: 'Tempo and click' }).tap();
    await expect(page.locator('.dest-pane[data-dest="song"] .seg-btn[aria-pressed="true"]', { hasText: 'Eighths' })).toBeVisible();
    await page.locator('.perform-btn').tap();
    await expect(page.locator('#app')).toHaveAttribute('data-mode', 'perform');
    await expect(page.locator('.dest-host')).toBeHidden();
  });
});

/* Every screen the app is built for: the controls a set needs are all on screen, none overlap, and every target is big enough to hit. */
const SCREENS = [
  { name: 'iPad 13 landscape', width: 1366, height: 1024, tier: 'expanded', arr: 'side', bar: '1', strips: 'upright', pad: 180 },
  { name: 'iPad 13 portrait', width: 1024, height: 1366, tier: 'expanded', arr: 'stack', bar: '2', strips: 'wide', pad: 180 },
  { name: 'iPad 11 landscape', width: 1194, height: 834, tier: 'expanded', arr: 'side', bar: '1', strips: 'upright', pad: 140 },
  { name: 'iPad mini portrait', width: 744, height: 1133, tier: 'medium', arr: 'stack', bar: '2', strips: 'rows', pad: 130 },
  { name: 'folding phone open, landscape', width: 951, height: 669, tier: 'medium', arr: 'side', bar: '3', strips: 'rows', pad: 120 },
  { name: 'folding phone open, portrait', width: 669, height: 951, tier: 'medium', arr: 'stack', bar: '2', strips: 'rows', pad: 110 },
  { name: 'iPad half-screen window', width: 678, height: 1024, tier: 'medium', arr: 'stack', bar: '2', strips: 'rows', pad: 110 },
  { name: 'large phone', width: 440, height: 956, tier: 'compact', arr: 'stack', bar: '3', strips: 'rows', pad: 96 },
  { name: 'phone', width: 393, height: 852, tier: 'compact', arr: 'stack', bar: '3', strips: 'rows', pad: 88 },
  { name: 'phone in a browser, short', width: 393, height: 660, tier: 'compact', arr: 'stack', bar: '3', strips: 'pair', pad: 64 },
  { name: 'phone on its side', width: 852, height: 393, tier: 'compact', arr: 'side', bar: '3', strips: 'pair', pad: 84 },
];
for (const sc of SCREENS) {
  test.describe(`layout: ${sc.name}`, () => {
    test.use({ viewport: { width: sc.width, height: sc.height }, hasTouch: true });
    test('Perform fits with nothing cut off, and Edit shows each destination @webkit', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('html[data-ready="true"]');
      const root = page.locator('#app');
      await expect(root).toHaveAttribute('data-mode', 'perform');
      for (const [k, v] of [['tier', sc.tier], ['arr', sc.arr], ['bar', sc.bar], ['strips', sc.strips]]) await expect(root).toHaveAttribute('data-' + k, v);
      // eight scenes is the most a song can hold: the worst case for room
      await app(page, `a => { a.patchSong({ scenes: Array.from({ length: 8 }, (_, n) => ({ id: 's' + n, name: ['Intro', 'Verse', 'Pre', 'Chorus', 'Bridge', 'Tag', 'Build', 'Outro'][n], pads: [n] })) }); }`);
      await expect(page.locator('.scene')).toHaveCount(8);
      const report = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight, bad: string[] = [];
        const seen = (e: Element) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
        const r = (e: Element) => e.getBoundingClientRect();
        const name = (e: Element) => `${e.className} "${(e.getAttribute('title') || e.textContent || '').trim().slice(0, 24)}"`;
        // every live control is wholly on screen and at least 44 px on its short side
        const controls = [...document.querySelectorAll('.perform-bar button, .perform-bar [role="switch"], .scene, .pad, .strips button, .strips [role="switch"], .strips .fader-track')].filter(seen);
        for (const e of controls) {
          const b = r(e);
          if (b.left < -0.5 || b.top < -0.5 || b.right > W + 0.5 || b.bottom > H + 0.5) bad.push('off screen: ' + name(e));
          if (Math.min(b.width, b.height) < 43.5 && !e.classList.contains('fader-track')) bad.push(`small (${Math.round(b.width)}x${Math.round(b.height)}): ` + name(e));
        }
        // no two controls share space
        const boxes = controls.filter(e => !e.closest('.pages.compact') || e.classList.contains('page-tab')).map(e => ({ e, b: r(e) }));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
          const ox = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), oy = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
          if (ox > 1 && oy > 1) bad.push('overlap: ' + name(a.e) + ' and ' + name(c.e));
        }
        // the four regions do not run into each other, and the page does not scroll
        const parts = ['.perform-bar', '.scenes', '.grid', '.strips'].map(s => ({ s, b: r(document.querySelector(s)!) }));
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i].b, c = parts[j].b;
          if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) bad.push('regions overlap: ' + parts[i].s + ' and ' + parts[j].s);
        }
        if (document.documentElement.scrollWidth > W + 1 || document.documentElement.scrollHeight > H + 1) bad.push('the page scrolls');
        // text that must be readable is not clipped
        for (const e of document.querySelectorAll('.bpm-num, .barbeat-num')) if (seen(e) && (e.scrollWidth > e.clientWidth + 1)) bad.push('clipped: ' + name(e));
        const pad = r(document.querySelector('.pad')!);
        return { bad, pad: Math.round(Math.min(pad.width, pad.height)), square: Math.abs(pad.width - pad.height) < 2 };
      });
      expect(report.bad).toEqual([]);
      expect(report.square).toBe(true);
      expect(report.pad).toBeGreaterThanOrEqual(sc.pad);
      // Edit: each destination shows its own content and hides the rest; nothing leaves the screen sideways
      await page.locator('.edit-btn').tap();
      await expect(root).toHaveAttribute('data-mode', 'edit');
      const tabs = page.locator(sc.width >= 900 || sc.height < 500 ? '.dest-tabs.in-bar' : '.dest-tabs.bottom');
      await expect(tabs.locator('.dest-tab')).toHaveCount(5);
      for (const dest of ['loops', 'song', 'mix', 'setup', 'pads']) {
        await tabs.locator(`.dest-tab[data-dest="${dest}"]`).tap();
        await expect(root).toHaveAttribute('data-dest', dest);
        if (dest === 'pads') { await expect(page.locator('.editor')).toBeVisible(); await expect(page.locator('.grid')).toBeVisible(); await expect(page.locator('.dest-host')).toBeHidden(); }
        else { await expect(page.locator(`.dest-pane[data-dest="${dest}"]`)).toBeVisible(); await expect(page.locator('.dest-pane:visible')).toHaveCount(1); await expect(page.locator('.editor')).toBeHidden(); }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.edit-bar button')].every(b => (b as HTMLElement).offsetParent === null || (b.getBoundingClientRect().right <= innerWidth + 0.5 && b.getBoundingClientRect().left >= -0.5)))).toBe(true);
      }
      await page.locator('.perform-btn').tap();
      await expect(root).toHaveAttribute('data-mode', 'perform');
    });
  });
}

test.describe('a first open on a bad connection', () => {
  test.use({ viewport: { width: 393, height: 700 }, hasTouch: true });
  test('samples that fail to download are asked for again, with no reload @webkit', async ({ page }) => {
    test.setTimeout(60_000);
    // every sample download fails at first, the way a weak signal or a network filter would have it
    let block = true;
    await page.route('**/kits/**', r => (block && !r.request().url().endsWith('index.json') ? r.abort() : r.continue()));
    await page.goto('/');
    await page.waitForSelector('html[data-ready="true"]');
    const tracks = `a => { let ok = 0, all = 0; for (const pad of a.song.pads) { const p = a.state.patterns.find(x => x.id === pad.patternId); if (pad.mode !== 'pattern' || !p) continue; for (const t of p.tracks) if (t.steps.some(Boolean)) { all++; if (a.eng.pads.trackBuffer(t.src)) ok++; } } return ok + '/' + all; }`;
    // the pads say what is wrong instead of sitting silent, and the diagnostics page names the files
    await expect(page.locator('.pad').nth(0).locator('.pad-state')).toHaveText('Stand-in');
    await expect(page.locator('.pad').nth(4).locator('.pad-state')).toHaveText(/No sample|Loading/);
    expect(await app<string>(page, tracks)).toMatch(/^0\//);
    expect(await app<string[]>(page, 'a => a.sampleGaps()')).toContain('Acoustic Set/Shaker 80 [loop] [80bpm] [8bars].wav');
    await expect.poll(() => app(page, 'a => a.toastMsg'), { timeout: 15000 }).toContain('Trying again');
    // the connection comes good: everything arrives by itself
    block = false;
    await expect.poll(() => app<string>(page, tracks), { timeout: 30000 }).toMatch(/^(\d+)\/\1$/);
    await expect.poll(() => app(page, 'a => a.padMeta[0].missing'), { timeout: 30000 }).toBe(false);
    await expect.poll(() => app<string[]>(page, 'a => a.sampleGaps()'), { timeout: 10000 }).toEqual([]);
    await expect(page.locator('.pad').nth(4).locator('.pad-state')).toHaveText('');
    await expect.poll(() => app(page, 'a => a.toastMsg'), { timeout: 10000 }).toContain('All samples loaded');
    expect(await app(page, 'a => Math.round(a.eng.pads.pads[0].buffer.duration)')).toBe(24);       // the real shaker, not the stand-in
    // and the cajon loop sounds
    await page.locator('.pad').nth(4).tap();
    await expect(page.locator('.pad').nth(4)).toHaveAttribute('data-state', 'playing', { timeout: 6000 });
    expect(await app(page, 'async a => { let top = 0; for (let i = 0; i < 400 && top < 0.02; i++) { top = Math.max(top, a.eng.mixer.level("drums")); await new Promise(r => setTimeout(r, 15)); } return top > 0.02; }')).toBe(true);
  });
});

test.describe('stage behavior', () => {
  test.use({ viewport: { width: 1366, height: 1024 }, hasTouch: true });
  test.beforeEach(async ({ page }) => { await start(page); await app(page, 'a => a.loadKit("builtin")'); await page.locator('.pad').first().tap(); });

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
    await page.locator('.perform-bar .panic-btn').tap();
    await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'false');
    await expect(page.locator('.pad').nth(5)).toHaveAttribute('data-state', 'stopped');
    expect(await app(page, 'a => a.eng.sub.currentNote')).toBeNull();
  });
  test('the sub synth plays the lowest key and the tonic pad fades in and changes key', async ({ page }) => {
    await page.locator('.strip-bass .toggle').tap();
    await app(page, 'a => { a.eng.sub.noteOn(40); a.eng.sub.noteOn(33); }');
    await expect(page.locator('.strip-bass .note-read')).toHaveText('A1');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("sub") > 0.02'), { timeout: 3000 }).toBe(true);
    await app(page, 'a => { a.eng.sub.noteOff(33); }');
    await expect(page.locator('.strip-bass .note-read')).toHaveText('E2');
    await app(page, 'a => a.eng.sub.noteOff(40)');
    await app(page, 'a => a.patchSong({ tonic: { ...a.song.tonic, on: true, fadeIn: 0.3, xfade: 2 } })');
    await expect.poll(() => app(page, 'a => a.eng.tonic.status'), { timeout: 15000 }).toBe('on');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("pad") > 0.005'), { timeout: 6000 }).toBe(true);
    // every key has its own sample in both pad sets, so nothing is pitch-shifted
    expect(await app(page, 'a => a.bank.index.padsets.map(p => [p.name, Object.keys(p.keys).length])')).toEqual([['Mesosphere (shimmery)', 12], ['Troposphere (mellow)', 12]]);
    await app(page, 'a => a.patchSong({ key: 6 })');
    expect(await app(page, 'a => a.eng.tonic.pick(6)')).toMatchObject({ file: 'Pad Gb.mp3', shift: 0 });
    await expect.poll(() => app(page, 'a => a.eng.tonic.key === 6 && a.eng.tonic.status'), { timeout: 15000 }).toBe('on');
    await expect(page.locator('.strip-amb .card-status')).toHaveText('');
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
    expect(n).toBe(3);                 // My set, the ready-made set, and the import
    expect(await app(page, 'a => a.setSongs.map(s => s.name)')).toEqual(['My pads', 'Second']);
  });
  test('the default layout: an all-cajon page and a kick page that share their other pads', async ({ page }) => {
    await app(page, 'a => a.loadKit("rig")');
    const names = () => page.locator('.pad .pad-name');
    const shared = ['Shaker', 'Tambo 2 and 4', 'Tambo on 4', 'Claps 2 and 4', 'Cajon Basic', 'Cajon Push', 'Cajon Rolling', 'Cajon Half Time'];
    await expect(page.locator('.grid-col .page-tab .page-name')).toHaveText(['Cajon', 'Kick']);
    await expect(names()).toHaveText([...shared, 'Cajon on 1', 'Cajon 1 and 3', 'Cajon Syncopated', 'Cajon Four', 'Cajon Worship A', 'Cajon Worship B', 'Kick Build', 'Stomp on 1']);
    expect(await app(page, 'a => a.padMeta.filter(m => m.missing).length')).toBe(0);
    expect(await app(page, 'a => { const p = a.eng.pads.pads[0]; return [p.cfg.sync, p.cfg.sourceBpm, Math.round(p.buffer.duration * 100) / 100]; }')).toEqual(['stretch', 80, 24]);
    // every sample the patterns use is found: real recordings, no silent tracks
    expect(await app(page, `async a => { const out = []; for (const id of ['rig-cajon-1', 'rig-clap-2-4', 'rig-stomp-1', 'rig-kick-build', 'rig-tambo-4', 'rig-cbass-sync']) { const p = a.state.patterns.find(x => x.id === id);
      for (const t of p.tracks) if (t.steps.some(Boolean)) { const r = await a.bank.resolve(a.realSample(t.src)); out.push(r.missing || !r.buffer || a.realSample(t.src).t !== 'kit'); } } return out; }`)).not.toContain(true);
    await expect.poll(() => app(page, 'a => a.padMeta[0].stretch')).toBe('ready');
    await page.locator('.pad').nth(0).tap();
    await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'true');
    await expect(page.locator('.pad').nth(0)).toHaveAttribute('data-state', 'playing', { timeout: 3000 });
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("loops") > 0.003'), { timeout: 4000 }).toBe(true);
    await page.locator('.pad').nth(8).tap();                                           // Cajon on 1
    await expect(page.locator('.pad').nth(8)).toHaveAttribute('data-state', 'playing', { timeout: 5000 });
    // one short hit a bar: watch the meter closely for a few bars
    expect(await app(page, 'async a => { let top = 0; for (let i = 0; i < 400 && top < 0.02; i++) { top = Math.max(top, a.eng.mixer.level("drums")); await new Promise(r => setTimeout(r, 15)); } return top > 0.02; }')).toBe(true);
    // page 2: the shared pads are the same pads, still playing; the low loops are kicks
    await page.locator('.grid-col .page-tab').nth(1).tap();
    await expect(names()).toHaveText([...shared, 'Kick on 1', 'Kick 1 and 3', 'Kick Syncopated', 'Four on the Floor', 'Worship Kick A', 'Worship Kick B', 'Kick Build', 'Stomp on 1']);
    await expect(page.locator('.pad').nth(0)).toHaveAttribute('data-state', 'playing');
    await expect(page.locator('.pad').nth(8)).toHaveAttribute('data-state', 'stopped');
    await expect(page.locator('.grid-col .page-tab').nth(0)).toHaveAttribute('data-busy', 'true');    // the cajon loop plays on, out of view
    expect(await app(page, 'a => [a.padAt(0), a.padAt(8), a.padAt(14)]')).toEqual([0, 24, 14]);
    // kick loops and cajon loops are separate groups: a kick loop joins the cajon bass loop
    await page.locator('.pad').nth(11).tap();                                          // Four on the Floor
    await expect(page.locator('.pad').nth(11)).toHaveAttribute('data-state', 'playing', { timeout: 5000 });
    expect(await app(page, 'a => a.eng.pads.view(8).state')).toBe('playing');
    // every cajon pad is one group: a cajon loop takes over from the cajon bass loop on the bar line, the kick plays on
    await page.locator('.pad').nth(4).tap();                                           // Cajon Basic
    await expect(page.locator('.pad').nth(4)).toHaveAttribute('data-state', 'playing', { timeout: 5000 });
    expect(await app(page, 'a => [a.eng.pads.view(8).state, a.eng.pads.view(27).state]')).toEqual(['stopped', 'playing']);
    await expect(page.locator('.grid-col .page-tab').nth(0)).toHaveAttribute('data-busy', 'false');
    // muted colors by instrument; a shared slot shows its pad's color on both pages
    expect(await page.locator('.pad').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.color))).toEqual(['sage', 'teal', 'teal', 'rose', 'clay', 'clay', 'clay', 'clay', 'slate', 'slate', 'slate', 'slate', 'slate', 'slate', 'plum', 'stone']);
    // a shared pad stops from either page
    await page.locator('.pad').nth(0).tap();
    await page.locator('.grid-col .page-tab').nth(0).tap();
    await expect(page.locator('.pad').nth(0)).toHaveAttribute('data-state', 'stopped', { timeout: 5000 });
    await expect(page.locator('.grid-col .page-tab').nth(1)).toHaveAttribute('data-busy', 'true');
    await app(page, 'a => a.patchSong({ bpm: 86 })');
    await expect.poll(() => app(page, 'a => a.padMeta[0].stretch + ":" + (a.eng.pads.pads[0].stretched || {}).bpm'), { timeout: 30000 }).toBe('ready:86');
    expect(await app(page, 'a => a.stretchWarning(0)')).toBe(false);
  });
  test('a pad saved with a kit file name that has since changed takes the file now in that slot', async ({ page }) => {
    await app(page, 'a => a.loadKit("Acoustic Set")');
    // as an early build saved it: the shaker loop under its first file name, with that file's tempo
    await app(page, `a => { const p = { ...a.song.pads[13], src: { t: 'kit', kit: 'Acoustic Set', file: '14 Shaker Loop [loop] [96bpm] [1bars].wav' }, sourceBpm: 96, lengthBeats: 4, volume: 0.6 }; a.song.pads[13] = p; return a.loadPad(13, p); }`);
    await expect.poll(() => app(page, 'a => a.padMeta[13].missing')).toBe(false);
    expect(await app(page, 'a => [a.song.pads[13].src.file, a.song.pads[13].sourceBpm, a.song.pads[13].lengthBeats, a.song.pads[13].volume]')).toEqual(['14 Shaker Loop [loop] [113bpm] [2bars].wav', 113, 8, 0.6]);
    await expect(page.locator('.pad').nth(13).locator('.pad-state')).toHaveText('');
    // a file that is simply unreachable is left alone and shown as a stand-in
    await app(page, `a => { const p = { ...a.song.pads[2], src: { t: 'kit', kit: 'No Such Kit', file: '3 Gone.wav' } }; a.song.pads[2] = p; return a.loadPad(2, p); }`);
    expect(await app(page, 'a => [a.padMeta[2].missing, a.song.pads[2].src.file]')).toEqual([true, '3 Gone.wav']);
  });
  test('a shared pad edits on both pages until it is made separate', async ({ page }) => {
    await app(page, 'a => a.loadKit("rig")');
    await app(page, 'a => { a.setEdit(true, "pads"); a.setPage(1); }');
    await page.locator('.pad').nth(1).tap();
    expect(await app(page, 'a => [a.selected, a.selectedVia]')).toEqual([1, 17]);
    await expect(page.locator('.editor .note.shared')).toContainText('same pad as Cajon, pad 2');
    // pick a color in the editor: it shows on both pages; "No color" clears it
    await page.locator('.editor .swatch[data-color="rose"]').click();
    await expect(page.locator('.pad').nth(1)).toHaveAttribute('data-color', 'rose');
    expect(await app(page, 'a => a.song.pads[1].color')).toBe('rose');
    await page.locator('.editor .swatch').first().click();
    expect(await app(page, 'a => [a.song.pads[1].color, document.querySelectorAll(".pad")[1].dataset.color]')).toEqual([undefined, undefined]);
    await app(page, 'a => a.patchPad(a.selected, { name: "Tambo" })');
    await page.locator('.grid-col .page-tab').nth(0).tap();
    await expect(page.locator('.pad').nth(1).locator('.pad-name')).toHaveText('Tambo');
    await page.locator('.grid-col .page-tab').nth(1).tap();
    await page.locator('.editor .note.shared .btn').click();
    expect(await app(page, 'a => [a.selected, a.song.pads[17].link, a.song.pads[17].patternId]')).toEqual([17, undefined, 'rig-tambo-2-4']);
    await app(page, 'a => a.patchPad(17, { name: "Kick page tambo" })');
    await expect(page.locator('.pad').nth(1).locator('.pad-name')).toHaveText('Kick page tambo');
    await page.locator('.grid-col .page-tab').nth(0).tap();
    await expect(page.locator('.pad').nth(1).locator('.pad-name')).toHaveText('Tambo');
  });
  test('the ready-made set: nine songs with keys, tempos and a 6/8 layout @webkit', async ({ page }) => {
    await app(page, 'a => a.selectSet("set-2026-11-acoustic")');
    expect(await app(page, 'a => a.setSongs.map(s => [s.name, s.key, s.bpm, s.ts.num + "/" + s.ts.den])')).toEqual([
      ['Bless God', 0, 72.5, '4/4'], ['Cornerstone', 0, 72, '4/4'], ['No One Like the Lord', 4, 72, '4/4'], ['Here Again', 0, 68, '4/4'],
      ['Great Are You Lord', 10, 74, '6/8'], ['I Surrender', 4, 76.5, '6/8'], ['Tremble', 11, 74, '4/4'], ['Send Me', 11, 66, '4/4'], ['Deliverance', 9, 72, '4/4']]);
    await app(page, 'a => a.selectSong("set-2026-11-acoustic-5")');
    await expect(page.locator('.song-name').first()).toHaveText('Great Are You Lord');
    await expect(page.locator('.bpm-num')).toHaveText('74');
    expect(await app(page, 'a => a.setSongs.every(s => s.click.sub === "8")')).toBe(true);
    // 74 on the chart is in quarter notes: eighths at 148, a pulse of 49.33, and MIDI clock at 74
    expect(await app(page, 'a => [Math.round(a.eng.transport.targetBpm * 1000) / 1000, Math.round(a.eng.clock.bpm * 1.5 * 100) / 100]')).toEqual([49.333, 74]);
    await expect(page.locator('.pad .pad-name')).toHaveText(['Shaker', 'Tambo on 4', 'Tambo Every Other Bar', 'Claps on 4', 'Cajon Basic', 'Cajon Push', 'Cajon Rolling', 'Cajon Half Time',
      'Cajon on 1', 'Cajon 1 and 4', 'Cajon 1 3 4', 'Cajon 1 4 6', 'Cajon Worship A', 'Cajon Worship B', 'Kick Build', 'Stomp on 1']);
    expect(await app(page, `async a => { const out = []; for (const pad of a.song.pads) { const p = a.state.patterns.find(x => x.id === pad.patternId); if (!p) continue; out.push(p.ts.den !== 8);
      for (const t of p.tracks) if (t.steps.some(Boolean)) { const r = await a.bank.resolve(a.realSample(t.src)); out.push(r.missing || !r.buffer); } } return out; }`)).not.toContain(true);
    await page.locator('.pad').nth(0).tap();                                           // the 6/8 shaker is a pattern of single strokes
    await expect(page.locator('.pad').nth(0)).toHaveAttribute('data-state', 'playing', { timeout: 4000 });
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("drums") > 0.01'), { timeout: 5000 }).toBe(true);
    await page.locator('.grid-col .page-tab').nth(1).tap();
    await expect(page.locator('.pad').nth(9).locator('.pad-name')).toHaveText('Kick 1 and 4');
    await expect(page.locator('.pad').nth(0)).toHaveAttribute('data-state', 'playing');
    // the next song is 6/8 too; the one after is back in 4/4 with the stretched shaker loop
    await app(page, 'a => a.selectSong("set-2026-11-acoustic-7")');
    await expect(page.locator('.pad').nth(8).locator('.pad-name')).toHaveText('Cajon on 1');
    expect(await app(page, 'a => [a.page, a.eng.transport.targetBpm, a.song.pads[0].mode]')).toEqual([0, 74, 'loop']);
    // the set is added once: deleting it sticks
    expect(await app(page, 'a => a.state.seeded')).toEqual(['set-2026-11-acoustic', 'patch-1-click-eighths', 'patch-2-cajon-group-b', 'patch-3-pad-colors', 'patch-4-cajon-grooves', 'patch-5-click-eighths-compound', 'patch-6-add-deliverance', 'patch-7-starter-scenes']);
  });
  test('a stretched loop keeps sounding through a tempo change and its next loop point @webkit', async ({ page }) => {
    test.setTimeout(90_000);
    await app(page, 'a => a.loadKit("Acoustic Set")');
    await app(page, 'a => { a.patchSong({ bpm: 113 }); a.patchPad(13, { sync: "stretch" }); }');
    await expect.poll(() => app(page, 'a => a.padMeta[13].stretch'), { timeout: 20000 }).toBe('ready');
    await page.locator('.pad').nth(13).tap();
    await expect(page.locator('.pad').nth(13)).toHaveAttribute('data-state', 'playing', { timeout: 4000 });
    const probe = `a => { const p = a.eng.pads.pads[13], s = p.stretched, rms = b => { const d = b.getChannelData(0); let e = 0; for (let i = 0; i < d.length; i += 7) e += d[i] * d[i]; return Math.sqrt(e / (d.length / 7)); };
      return { bpm: s && s.bpm, ratio: s ? rms(s.buffer) / rms(p.buffer) : 0, onStretched: !!p.run && [...p.run.live].some(l => l.buffer === s.buffer), state: a.eng.pads.view(13).state, level: a.eng.mixer.level('loops') }; }`;
    for (const bpm of [104, 113, 100]) {
      await app(page, `a => a.patchSong({ bpm: ${bpm} })`);
      // the render is real audio (Safari used to hand back silence here, which then replaced the loop)
      await expect.poll(async () => (await app<any>(page, probe)).bpm, { timeout: 25000 }).toBe(bpm);
      const r = await app<any>(page, probe);
      expect(r.ratio).toBeGreaterThan(0.6); expect(r.ratio).toBeLessThan(1.6);
      // it comes in on a bar line without waiting for the loop point, and the loop keeps sounding past the loop point
      await expect.poll(async () => (await app<any>(page, probe)).onStretched, { timeout: 8000 }).toBe(true);
      let quiet = 0;
      for (let i = 0; i < 14; i++) { await page.waitForTimeout(400); const q = await app<any>(page, probe); expect(q.state).toBe('playing'); if (q.level < 0.002) quiet++; }
      expect(quiet).toBeLessThan(3);
    }
  });
  test('sequencer steps toggle with a tap and take a level from 1 to 8 with a drag', async ({ page }) => {
    await app(page, 'a => a.loadKit("rig")');
    await app(page, 'a => { a.setEdit(true, "pads"); a.select(14); }');
    await page.locator('.editor .btn', { hasText: 'Edit pattern' }).click();
    const steps = page.locator('.seq-row').first().locator('.step');
    await expect(steps).toHaveCount(16);
    expect(await steps.evaluateAll(els => els.map(e => +(e as HTMLElement).dataset.v!))).toEqual([8, 0, 2, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0]);
    await steps.nth(1).click();
    await expect(steps.nth(1)).toHaveAttribute('data-v', '6');
    const box = (await steps.nth(1).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 4 }); await page.mouse.up();
    expect(await app(page, 'a => a.state.patterns.find(p => p.id === "rig-kick-build").tracks[0].steps[1]')).toBe(2);
    await steps.nth(1).click();
    await expect(steps.nth(1)).toHaveAttribute('data-v', '0');
  });
  test('the click can be the stock sound or the click set from the repo', async ({ page }) => {
    expect(await app(page, 'a => a.bank.index.clicksets.map(c => c.name)')).toEqual(['Justin Click']);
    expect(await app(page, 'a => a.clickSet.name')).toBe('Justin Click');            // a supplied click wins until told otherwise
    await expect.poll(() => app(page, 'a => !!a.webClick.samples.accent && !!a.webClick.samples.beat && !!a.webClick.samples.sub')).toBe(true);
    await app(page, 'a => a.setEdit(true, "setup")');                            // the click sound for every song is a device setting: Setup, Audio
    await page.locator('.seg-btn', { hasText: 'Built-in' }).tap();
    expect(await app(page, 'a => a.clickSet')).toBeNull();
    await expect.poll(() => app(page, 'a => !a.webClick.samples.accent && !a.webClick.samples.sub')).toBe(true);
    await page.locator('.seg-btn', { hasText: 'Justin Click' }).tap();
    await expect.poll(() => app(page, 'a => !!a.webClick.samples.accent')).toBe(true);
    // with the click on, it sounds through the click bus
    await app(page, 'a => { a.patchSong({ click: { ...a.song.click, on: true } }); a.eng.transport.start(); }');
    // clicks are short: watch the meter closely instead of sampling it now and then
    expect(await app(page, 'async a => { let top = 0; for (let i = 0; i < 300 && top < 0.02; i++) { top = Math.max(top, a.eng.mixer.level("click")); await new Promise(r => setTimeout(r, 12)); } return top > 0.02; }')).toBe(true);
  });
  test('starter patterns play the real recordings from the Acoustic Set', async ({ page }) => {
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "stomp" })')).toEqual({ t: 'kit', kit: 'Acoustic Set', file: '1 Stomp.wav' });
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "cajon-slap" })')).toEqual({ t: 'kit', kit: 'Acoustic Set', file: '11 Cajon Slap.wav' });
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "click-beat" })')).toEqual({ t: 'synth', id: 'click-beat' });
    expect(await app(page, 'a => a.bank.index.kits.map(k => [k.name, k.pads.length])')).toEqual([['Acoustic Set', 16], ['Cajon Slaps', 11]]);
    expect(await app(page, 'a => a.realSample({ t: "synth", id: "thick-kick" }).file')).toBe('5 Thick Kick.wav');
  });
  test('Perform holds only what is played live; stage lock guards Edit; the daylight theme applies @webkit', async ({ page }) => {
    const root = page.locator('#app');
    await expect(root).toHaveAttribute('data-mode', 'perform');
    for (const sel of ['.editor', '.dest-host', '.edit-bar', '.dest-tabs.in-bar']) await expect(page.locator(sel)).toBeHidden();
    for (const sel of ['.run-btn', '.tap-btn', '[title="Tempo down 1"]', '[title="Tempo up 1"]', '.click-toggle', '.scenes', '.grid', '.strip-amb .toggle', '.strip-amb .fader', '.strip-bass .toggle', '.strip-bass .fader', '.panic-btn']) await expect(page.locator(sel).first()).toBeVisible();
    // a pad tap in Perform plays and never selects
    await page.locator('.pad').nth(3).tap();
    await expect(page.locator('.pad.sel')).toHaveCount(0);
    await page.locator('.edit-btn').tap();
    await expect(root).toHaveAttribute('data-mode', 'edit');
    await expect(root).toHaveAttribute('data-edit', 'true');
    for (const sel of ['.perform-bar', '.scenes', '.strips']) await expect(page.locator(sel)).toBeHidden();
    await expect(page.locator('.dest-tabs.in-bar .dest-tab')).toHaveText(['Pads', 'Loops', 'Song', 'Mix', 'Setup']);
    await page.locator('.pad').nth(3).tap();
    await expect(page.locator('.pad').nth(3)).toHaveClass(/sel/);
    // each setting has one home: tempo and click with the song, the theme and stage lock with the device
    await page.locator('.dest-tab[data-dest="song"]').first().tap();
    await expect(page.locator('.sec-tab')).toHaveText(['Set list', 'This song', 'Tempo and click', 'Scenes', 'Ambient', 'Bass']);
    await page.locator('.dest-tab[data-dest="setup"]').first().tap();
    await expect(page.locator('.dest-pane[data-dest="setup"] .sec-tab')).toHaveText(['Audio', 'MIDI', 'Display', 'Backup', 'Diagnostics']);
    await page.locator('.dest-pane[data-dest="setup"] .sec-tab', { hasText: 'Display' }).tap();
    await page.locator('.toggle', { hasText: 'Stage lock' }).tap();
    expect(await app(page, 'a => a.state.settings.editLock')).toBe(true);
    await page.locator('.perform-btn').tap();
    await expect(root).toHaveAttribute('data-mode', 'perform');
    // locked: a tap on Edit stays in Perform, Capture is gone, and a press and hold gets through
    await page.locator('.edit-btn').tap();
    await expect(root).toHaveAttribute('data-mode', 'perform');
    await expect(page.locator('.scene-capture')).toHaveCount(0);
    const eb = (await page.locator('.edit-btn').boundingBox())!;
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
    await expect(root).toHaveAttribute('data-mode', 'edit');
    await app(page, 'a => { a.state.settings.theme = "light"; a.changed(); }');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // the app always opens in Perform
    await app(page, 'a => a.flush()'); await page.waitForTimeout(300);
    await page.reload(); await page.waitForSelector('html[data-ready="true"]');
    await expect(root).toHaveAttribute('data-mode', 'perform');
  });
  test('scenes: a press changes the whole section on the next bar line, and Capture saves what is playing @webkit', async ({ page }) => {
    await app(page, 'a => a.loadKit("rig")');
    await expect(page.locator('.scene:not(.scene-capture) .scene-name')).toHaveText(['Intro', 'Verse', 'Chorus', 'Build', 'Down']);
    const scene = (name: string) => page.locator('.scene', { hasText: name });
    const sounding = () => app<number[]>(page, 'a => a.eng.pads.sounding()');
    // Chorus from a stop: the transport starts and its three pads come in together
    await scene('Chorus').tap();
    await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'true');
    await expect(scene('Chorus')).toHaveAttribute('data-look', 'on', { timeout: 5000 });
    await expect(scene('Chorus').locator('.scene-state')).toHaveText('On');
    expect(await sounding()).toEqual([0, 1, 4]);
    for (const n of [0, 1, 4]) await expect(page.locator('.pad').nth(n)).toHaveAttribute('data-state', 'playing');
    // Verse while Chorus plays: it waits for the bar line, then the shaker carries on, two pads stop and one starts
    await page.waitForFunction(() => { const a = (window as any).pad16; const b = a.eng.clock.beatAt(a.eng.now()); return b % 4 > 0.4 && b % 4 < 2; });
    await scene('Verse').tap();
    await expect(scene('Verse')).toHaveAttribute('data-look', 'queued');
    await expect(scene('Verse').locator('.scene-state')).toHaveText('Next bar');
    await expect(page.locator('.pad').nth(8)).toHaveAttribute('data-state', 'queued');
    await expect(page.locator('.pad').nth(4)).toHaveAttribute('data-state', 'stopping');
    await expect(page.locator('.pad').nth(0)).toHaveAttribute('data-state', 'playing');
    await expect(scene('Verse')).toHaveAttribute('data-look', 'on', { timeout: 5000 });
    expect(await sounding()).toEqual([0, 8]);
    await expect(scene('Chorus')).toHaveAttribute('data-look', '');
    // a pad changed by hand: the scene keeps an outline, no longer "on"
    await page.locator('.pad').nth(1).tap();
    await expect(page.locator('.pad').nth(1)).toHaveAttribute('data-state', 'playing', { timeout: 5000 });
    await expect(scene('Verse')).toHaveAttribute('data-look', 'last');
    // Capture saves that as a sixth scene, named for the next section, and it is on at once
    await page.locator('.scene-capture').tap();
    await expect(page.locator('.scene:not(.scene-capture)')).toHaveCount(6);
    expect(await app(page, 'a => a.scenes[5].pads')).toEqual([0, 1, 8]);
    await expect(page.locator('.scene:not(.scene-capture)').nth(5)).toHaveAttribute('data-look', 'on');
    // Shift and a number launches a scene from a keyboard; Down stops every loop and leaves the transport running
    await page.keyboard.press('Shift+Digit5');
    await expect(scene('Down')).toHaveAttribute('data-look', 'on', { timeout: 5000 });
    expect(await sounding()).toEqual([]);
    await expect(page.locator('.run-btn')).toHaveAttribute('data-running', 'true');
    // a pedal set to step scenes moves through them in order
    await app(page, 'a => { a.state.settings.pedalMode = "scene"; a.changed(); }');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.scene:not(.scene-capture)').nth(5)).toHaveAttribute('data-look', 'on', { timeout: 5000 });
    await page.keyboard.press('ArrowLeft');
    await expect(scene('Down')).toHaveAttribute('data-look', 'on', { timeout: 5000 });
    // panic clears the scene with everything else
    await page.locator('.perform-bar .panic-btn').tap();
    await expect(page.locator('.scene[data-look="on"], .scene[data-look="last"], .scene[data-look="queued"]')).toHaveCount(0);
  });
  test('scenes are edited in Song, Scenes: rename, color, pads, order, delete, and they come back after a reload @webkit', async ({ page }) => {
    await app(page, 'a => a.loadKit("rig")');
    await app(page, 'a => a.setEdit(true, "song")');
    await page.locator('.sec-tab', { hasText: 'Scenes' }).tap();
    const rows = page.locator('.scene-row');
    await expect(rows).toHaveCount(5);
    await rows.nth(1).locator('.song-pick').tap();
    const sheet = page.locator('#sheet-scene');
    await expect(sheet).toBeVisible();
    await sheet.locator('.text-input').fill('Verse 2');
    await sheet.locator('.text-input').blur();
    await sheet.locator('.swatch[data-color="teal"]').tap();
    await sheet.locator('.scene-pad', { hasText: 'Tambo on 4' }).first().tap();
    expect(await app(page, 'a => [a.scenes[1].name, a.scenes[1].color, a.scenes[1].pads]')).toEqual(['Verse 2', 'teal', [0, 2, 8]]);
    await sheet.locator('.btn', { hasText: 'Done' }).tap();
    await expect(rows.nth(1).locator('.row-name')).toContainText('Verse 2');
    await rows.nth(1).locator('[title="Move Verse 2 up"]').tap();
    expect(await app(page, 'a => a.scenes.map(s => s.name)')).toEqual(['Verse 2', 'Intro', 'Chorus', 'Build', 'Down']);
    await rows.nth(4).locator('[title="Delete Down"]').tap();
    await page.locator('.sheet .btn.danger').tap();
    await expect(rows).toHaveCount(4);
    await app(page, 'a => a.flush()'); await page.waitForTimeout(300);
    await page.reload(); await page.waitForSelector('html[data-ready="true"]');
    await expect(page.locator('.scene:not(.scene-capture) .scene-name')).toHaveText(['Verse 2', 'Intro', 'Chorus', 'Build']);
    await expect(page.locator('.scene').first()).toHaveAttribute('data-color', 'teal');
  });
  test('split mode and the diagnostics section work, and Multi-out is not offered on two channels', async ({ page }) => {
    await app(page, 'a => a.setEdit(true, "setup")');
    await expect(page.locator('.seg-btn', { hasText: 'Multi-out' })).toHaveCount(0);
    await page.locator('.seg-btn', { hasText: 'Split' }).tap();
    expect(await app(page, 'a => a.eng.mixer.activeMode')).toBe('split');
    await page.locator('.sec-tab', { hasText: 'Diagnostics' }).tap();
    await expect(page.locator('.kv').last()).toContainText('Sample rate');
    await expect(page.locator('.kv').last()).toContainText('2 reported, 2 opened');
  });
});
