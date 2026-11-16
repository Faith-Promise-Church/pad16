import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Uses the system Chrome when there is one (local machines), otherwise Playwright's own Chromium (CI).
const local = !process.env.CI && existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.PW_CHROME || local, args: ['--autoplay-policy=no-user-gesture-required'] } } },
    // Safari, the iPad and every iOS browser run on WebKit. The tests tagged @webkit cover what has broken there.
    { name: 'webkit', use: { browserName: 'webkit' }, grep: /@webkit/ },
  ],
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173/tests/harness.html', reuseExistingServer: true, timeout: 60_000 },
});
