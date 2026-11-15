import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = __dirname;
// DIN is a commercial font kept out of the repo in fonts-private/. It is bundled only for the iOS build.
const ios = process.env.PAD16_TARGET === 'ios';
const din = ios && existsSync(resolve(root, 'fonts-private/DIN-Regular.otf'));

export default defineConfig({
  base: './',
  define: { __PAD16_DIN__: JSON.stringify(din), __PAD16_IOS__: JSON.stringify(ios) },
  resolve: { alias: din ? { 'pad16-din': resolve(root, 'src/ui/font-din.css') } : { 'pad16-din': resolve(root, 'src/ui/font-none.css') } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true, fs: { allow: [root] } },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
} as any);
