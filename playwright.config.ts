import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.E2E_PORT ?? '4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server/index.mjs --local',
    url: `http://127.0.0.1:${e2ePort}`,
    env: {
      QUICK_VOCAB_LOCAL_PORT: e2ePort,
      QUICK_VOCAB_DISABLE_ONLINE_TTS: '1',
      QUICK_VOCAB_EXIT_AFTER_MS: '25000'
    },
    reuseExistingServer: true,
    timeout: 120000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
