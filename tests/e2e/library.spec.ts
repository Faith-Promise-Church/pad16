// The sound library, read from the private sounds repository with an access key.
// The tests run as the public web build does: no private sounds beside the app. A stand-in answers for the repository
// the way GitHub does: the file when the key is right, "not found" when it is not.
import { test, expect, Page, Route } from '@playwright/test';

const API = 'https://api.github.com/repos/Faith-Promise-Church/pad16-sounds/contents/';
const GOOD = 'good-key';

/** A short mono WAV: a decaying tone, so a meter can see it. */
function wav(seconds: number, hz = 220): Buffer {
  const rate = 44100, n = Math.round(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * i / rate) * 20000 * Math.exp(-3 * i / n)), 44 + i * 2);
  return b;
}
const LIBRARY = [
  { cat: 'Cajon', file: 'Cajon Fill 1 100bpm 1bar.wav', name: 'Cajon Fill 1', type: 'loop', bpm: 100, beats: 4, secs: 2.4 },
  { cat: 'Cajon', file: 'Cajon Slap 2.wav', name: 'Cajon Slap 2', type: 'shot', secs: 0.3, note: 'Bright, short' },
  { cat: 'Shaker', file: 'Shaker 8ths 96bpm 2bar.wav', name: 'Shaker 8ths', type: 'loop', bpm: 96, beats: 8, secs: 5 },
  { cat: 'Kicks', file: 'Kick Felt 1.wav', name: 'Kick Felt 1', type: 'shot', secs: 0.4 },
  ...[1, 2, 3, 4].map(n => ({ cat: 'Count-in', file: `Count ${n}.wav`, name: `Count ${n}`, type: 'cue', secs: 0.3, anchorMs: 40 })),
];
const INDEX = { kits: [], padsets: [], clicksets: [], library: LIBRARY };

/** Stand in for the repository. Returns the list of paths asked for, and a switch to take the network away. */
async function repository(page: Page) {
  const asked: string[] = [], net = { up: true };
  await page.route(API + '**', async (route: Route) => {
    const req = route.request(), path = decodeURIComponent(new URL(req.url()).pathname.split('/contents/')[1]);
    if (!net.up) return route.abort('internetdisconnected');
    asked.push(path);
    if (req.headers()['authorization'] !== `Bearer ${GOOD}`) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' });
    if (path === 'kits/index.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(INDEX) });
    const item = LIBRARY.find(i => path === `kits/Library/${i.cat}/${i.file}`);
    if (!item) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' });
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: wav(item.secs) });
  });
  return { asked, net };
}
const app = <T>(page: Page, fn: string) => page.evaluate(`(async () => { const app = window.pad16; return (${fn})(app); })()`) as Promise<T>;
const start = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('html[data-ready="true"]');
  await page.evaluate(`(async () => { const a = window.pad16, set = a.state.sets[0]; a.state.currentSet = set.id; await a.selectSong(set.songIds[0]); a.changed(); })()`);
};
const connect = async (page: Page, key: string) => {
  await app(page, 'a => a.setEdit(true, "setup")');
  await page.locator('.dest-pane[data-dest="setup"] .sec-tab', { hasText: 'Sounds' }).tap();
  await page.getByLabel('Access key').fill(key);
  await page.locator('.btn', { hasText: 'Connect' }).tap();
};

test.describe('sound library with an access key', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true });

  test('no key: the kits published with the app play, and the library says what it needs', async ({ page }) => {
    const repo = await repository(page);
    await start(page);
    expect(await app(page, 'a => [a.soundsState, a.library.length, a.bank.index.kits.length > 0]')).toEqual(['no-key', 0, true]);
    expect(repo.asked).toEqual([]);                                            // nothing is asked of the repository without a key
    await page.locator('.edit-btn').tap();
    await page.locator('.pad').nth(2).tap();
    await page.locator('.lib-open').tap();
    const sheet = page.locator('#sheet-library');
    await expect(sheet.locator('.note.warn')).toContainText('needs an access key');
    await expect(sheet.locator('.lib-row')).toHaveCount(0);
    await sheet.locator('.btn', { hasText: 'Open Setup, Sounds' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.dest-pane[data-dest="setup"] .sec-tab[aria-current="true"]')).toHaveText('Sounds');
    await expect(page.locator('.dest-pane[data-dest="setup"]')).toContainText('No access key on this device');
  });

  test('a wrong key is refused; the right key brings the library, the count words, and keeps what it fetches', async ({ page }) => {
    const repo = await repository(page);
    await start(page);
    await connect(page, 'wrong-key');
    await expect(page.locator('.toast')).toHaveText('That key was not accepted for this repository.');
    expect(await app(page, 'a => [a.soundsState, a.library.length]')).toEqual(['bad-key', 0]);
    await expect(page.locator('.dest-pane[data-dest="setup"] .note.bad')).toContainText('The key was not accepted');

    await page.getByLabel('Access key').fill(GOOD);
    await page.locator('.btn', { hasText: 'Connect' }).tap();
    await expect(page.locator('.toast')).toHaveText('Connected. 8 sounds in the library.');
    await expect(page.locator('.dest-pane[data-dest="setup"] .note').first()).toContainText('Connected to the private sounds repository: 8 sounds');
    await expect.poll(() => app(page, 'a => a.eng.count.ready')).toBe(4);       // one, two, three, four are ready for the count-in
    // the key stays on the device and out of anything that is exported
    expect(await app(page, 'async a => { const out = await a.exportCurrentSet(); return [JSON.stringify(a.state).includes("good-key"), new TextDecoder("latin1").decode(out.data).includes("good-key")]; }')).toEqual([false, false]);

    // browse from a pad: categories, search, hear, use
    await page.locator('.dest-tab[data-dest="pads"]').first().tap();
    await page.locator('.pad').nth(2).tap();
    await page.locator('.lib-open').tap();
    const sheet = page.locator('#sheet-library');
    await expect(sheet.locator('.lib-cat')).toHaveText([/Everything\s*4/, /Cajon\s*2/, /Shaker\s*1/, /Kicks\s*1/]);   // the spoken numbers are not pad sounds
    await expect(sheet.locator('.lib-row')).toHaveCount(4);
    await sheet.locator('.seg-btn', { hasText: 'Loops' }).tap();
    await expect(sheet.locator('.lib-row .row-name')).toHaveText(['Cajon Fill 1', 'Shaker 8ths']);
    await expect(sheet.locator('.lib-row .row-note').first()).toHaveText('Cajon, 100 BPM, 1 bar');
    await sheet.locator('.seg-btn', { hasText: 'All' }).tap();
    await sheet.getByLabel('Search the library').fill('bright');
    await expect(sheet.locator('.lib-row .row-name')).toHaveText(['Cajon Slap 2']);
    await sheet.locator('.lib-hear').tap();
    await expect(sheet.locator('.lib-row')).toHaveAttribute('data-playing', '');
    await expect.poll(() => app(page, 'a => a.eng.mixer.level("drums") > 0.01'), { timeout: 3000 }).toBe(true);
    await expect(sheet.locator('.lib-row[data-playing]')).toHaveCount(0, { timeout: 3000 });   // it ends by itself
    await sheet.getByLabel('Search the library').fill('');
    await sheet.locator('.lib-cat', { hasText: 'Cajon' }).tap();
    await sheet.locator('.lib-row[data-type="loop"] .btn.primary').tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.pad').nth(2).locator('.pad-name')).toHaveText('Cajon Fill 1');
    expect(await app(page, 'a => { const p = a.song.pads[2]; return [p.mode, p.sync, p.sourceBpm, p.lengthBeats, p.src.kit, !!a.eng.pads.pads[2].buffer, a.padMeta[2].missing]; }'))
      .toEqual(['loop', 'stretch', 100, 4, 'Library/Cajon', true, false]);

    // a fetched file is kept: after a reload only the index is asked for again, and the pad still has its sound
    await app(page, 'a => a.flush()'); await page.waitForTimeout(300);
    const loop = 'kits/Library/Cajon/Cajon Fill 1 100bpm 1bar.wav';
    expect(repo.asked.filter(p => p === loop)).toHaveLength(1);
    repo.asked.length = 0;
    await page.reload(); await page.waitForSelector('html[data-ready="true"]');
    await expect.poll(() => app(page, 'a => [a.soundsState, a.library.length, !!a.eng.pads.pads[2].buffer, a.eng.count.ready]')).toEqual(['connected', 8, true, 4]);
    expect(repo.asked).toEqual(['kits/index.json']);

    // no connection: what is kept still plays, and the pane says so
    repo.net.up = false;
    await page.reload(); await page.waitForSelector('html[data-ready="true"]');
    await expect.poll(() => app(page, 'a => [a.soundsState, a.library.length, !!a.eng.pads.pads[2].buffer, a.eng.count.ready]')).toEqual(['unreachable', 8, true, 4]);
    repo.net.up = true;

    // removing the key clears what was fetched with it
    await app(page, 'a => a.setEdit(true, "setup")');
    await page.locator('.dest-pane[data-dest="setup"] .sec-tab', { hasText: 'Sounds' }).tap();
    await page.locator('.btn', { hasText: 'Remove the key' }).tap();
    await expect.poll(() => app(page, 'async a => [a.soundsState, a.library.length, (await caches.keys()).includes("pad16-sounds-v1")]')).toEqual(['no-key', 0, false]);
    expect(await app(page, 'a => a.eng.count.ready')).toBe(0);
    await expect.poll(() => app(page, 'a => a.padMeta[2].missing')).toBe(true);   // the pad says its sound is missing rather than playing silence unannounced
  });

  test('a pattern track takes a one shot from the library, and "keep every sound" fetches the rest @webkit', async ({ page }) => {
    const repo = await repository(page);
    await start(page);
    await app(page, `a => a.setSounds({ key: '${GOOD}' })`);
    expect(await app(page, 'a => a.soundsState')).toBe('connected');
    await app(page, 'a => a.keepAllSounds()');
    expect(await app(page, 'a => [a.keeping.done, a.keeping.total, a.keeping.failed, a.keeping.active]')).toEqual([8, 8, 0, false]);
    expect(new Set(repo.asked).size).toBe(9);                                   // the index and eight files
    const before = repo.asked.length;
    await app(page, 'a => a.keepAllSounds()');                                  // a second run finds them all on the device
    expect(repo.asked.length).toBe(before);
    expect(await app(page, 'a => [a.keeping.done, a.keeping.total]')).toEqual([8, 8]);
    await app(page, 'a => a.setEdit(true, "setup")');
    await page.locator('.dest-pane[data-dest="setup"] .sec-tab', { hasText: 'Sounds' }).tap();
    await expect(page.locator('.dest-pane[data-dest="setup"]')).toContainText('8 of 8 sounds are on this device.');

    // a pattern track: the library offers one shots only, and the track plays the one picked
    await app(page, 'a => a.setEdit(true, "loops")');
    await page.locator('.song-pick[title^="Edit "]').first().tap();
    await page.locator('[title="Track 1 sound"]').tap();
    await page.locator('.pick', { hasText: 'Browse the library' }).tap();
    const sheet = page.locator('#sheet-library');
    await expect(sheet.locator('.seg-btn')).toHaveCount(0);
    await expect(sheet.locator('.lib-row .row-name')).toHaveText(['Cajon Slap 2', 'Kick Felt 1']);
    await sheet.locator('.lib-row', { hasText: 'Kick Felt 1' }).locator('.btn.primary').tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[title="Track 1 sound"]')).toHaveText('Kick Felt 1');
    const track = 'a.state.patterns.map(p => p.tracks[0]).find(t => t.name === "Kick Felt 1")';
    expect(await app(page, `a => ${track}.src`)).toEqual({ t: 'kit', kit: 'Library/Kicks', file: 'Kick Felt 1.wav' });
    await expect.poll(() => app(page, `a => a.bank.status(${track}.src)`)).toBe('ready');
  });
});
