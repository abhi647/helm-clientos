import { defineConfig, devices } from '@playwright/test'

// End-to-end flows against a running app (npm run build && npm start) and a local Supabase (supabase start).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // CI runners are slower than a laptop; give each check more time there
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    // use a pre-installed browser when the bundled one is not downloaded (e.g. CI images)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} } }],
})
