import { defineConfig } from 'vite';
import { existsSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = import.meta.dirname;
// Every build uses Barlow (SIL Open Font License). DIN is a commercial font and needs an app-embedding license from its foundry:
// it is bundled only when asked for with PAD16_DIN=1, in the iOS build, from the untracked fonts-private/ folder.
const ios = process.env.PAD16_TARGET === 'ios';
const din = ios && process.env.PAD16_DIN === '1' && existsSync(resolve(root, 'fonts-private/DIN-Regular.otf'));

// kits/ stays at the repo root (drop a folder and push); the build copies it beside the app
const copyKits = { name: 'pad16-copy-kits', closeBundle() { if (existsSync(resolve(root, 'kits'))) cpSync(resolve(root, 'kits'), resolve(root, 'dist/kits'), { recursive: true }); } };

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
