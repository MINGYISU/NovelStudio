import { defineConfig, devices } from '@playwright/test';

// Own ports and a fresh temp data directory: the suite never touches ./.data-dev or the real data.
const API_PORT = 4419;
const CLIENT_PORT = 5174;
const ENV = `NOVEL_E2E=1 NOVEL_API_PORT=${API_PORT} NOVEL_CLIENT_PORT=${CLIENT_PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    // The first-start language follows the browser (I18N-02); the suite's selectors are English.
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `${ENV} NODE_ENV=test NOVEL_DATA_DIR="$(mktemp -d -t novelstudio-e2e)" PORT=${API_PORT} DEV_CLIENT_PORT=${CLIENT_PORT} npx tsx src/server/index.ts`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `${ENV} npx vite`,
      url: `http://127.0.0.1:${CLIENT_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
