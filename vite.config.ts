import { defineConfig } from 'vite';
import { existsSync, cpSync, statSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { execSync } from 'node:child_process';

const root = import.meta.dirname;
// Every build uses Barlow (SIL Open Font License). DIN is a commercial font and needs an app-embedding license from its foundry:
// it is bundled only when asked for with PAD16_DIN=1, in the iOS build, from the untracked fonts-private/ folder.
const ios = process.env.PAD16_TARGET === 'ios';
const din = ios && process.env.PAD16_DIN === '1' && existsSync(resolve(root, 'fonts-private/DIN-Regular.otf'));

// Sounds come from two places, both copied beside the app as kits/:
//   kits/ in this repo (the public copies, while they last), and
//   kits/ in the private sounds repo: PAD16_SOUNDS, or a folder named pad16-sounds next to this one.
// With the private repo present, a build (the iOS app, a local build) carries every sound and needs no access key.
// PAD16_SOUNDS=none builds without it, which is what the public web build is.
const soundsRoot = process.env.PAD16_SOUNDS === 'none' ? '' : process.env.PAD16_SOUNDS ? resolve(process.env.PAD16_SOUNDS) : resolve(root, '../pad16-sounds');
const soundsKits = soundsRoot && existsSync(resolve(soundsRoot, 'kits')) ? resolve(soundsRoot, 'kits') : '';
const TYPES: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.ogg': 'audio/ogg', '.json': 'application/json' };
const copyKits = {
  name: 'pad16-copy-kits',
  closeBundle() {
    if (existsSync(resolve(root, 'kits'))) cpSync(resolve(root, 'kits'), resolve(root, 'dist/kits'), { recursive: true });
    if (soundsKits) cpSync(soundsKits, resolve(root, 'dist/kits'), { recursive: true });
  },
  // the dev server serves the private kits the same way a build carries them
  configureServer(server: any) {
    if (!soundsKits) return;
    server.middlewares.use((req: any, res: any, next: any) => {
      const url = decodeURIComponent((req.url || '').split('?')[0]);
      if (!url.startsWith('/kits/') || url.includes('..')) return next();
      const file = resolve(soundsKits, url.slice(6));
      if (!file.startsWith(soundsKits) || !existsSync(file) || !statSync(file).isFile()) return next();
      res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Content-Length', String(statSync(file).size));
      createReadStream(file).pipe(res);
    });
  },
};

// shown in Settings, Diagnostics, so it is easy to tell which build a device is running
let build = 'dev';
try { build = execSync('git log -1 --format=%h,%cd --date=format:%Y-%m-%dT%H:%M', { cwd: root }).toString().trim().replace(',', ' ') + ' UTC'; } catch { /* not a git checkout */ }
export default defineConfig({
  plugins: [copyKits],
  base: './',
  define: { __PAD16_DIN__: JSON.stringify(din), __PAD16_IOS__: JSON.stringify(ios), __PAD16_BUILD__: JSON.stringify(build) },
  resolve: { alias: din ? { 'pad16-din': resolve(root, 'src/ui/font-din.css') } : { 'pad16-din': resolve(root, 'src/ui/font-none.css') } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true, fs: { allow: [root] } },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
} as any);
