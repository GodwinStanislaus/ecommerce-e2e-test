import { defineConfig, devices } from '@playwright/test';

import { AUTH_FILE, env } from './support/env';

const browsers = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  ...(env.allBrowsers
    ? [
        { name: 'firefox', device: devices['Desktop Firefox'] },
        { name: 'webkit', device: devices['Desktop Safari'] },
      ]
    : []),
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: env.baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    // Signs in once through the real login screen and saves cookies + localStorage.
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/ },

    // Login screen tests run logged out.
    ...browsers.map(({ name, device }) => ({
      name: `${name}-anon`,
      testMatch: /auth\/.*\.spec\.ts/,
      use: { ...device },
    })),

    // Everything else reuses the saved session.
    ...browsers.map(({ name, device }) => ({
      name,
      testIgnore: [/auth\/.*\.spec\.ts/, /setup\/.*/],
      dependencies: ['setup'],
      use: { ...device, storageState: AUTH_FILE },
    })),
  ],

  webServer: {
    command: 'npm start',
    url: env.baseUrl,
    cwd: '../ecommerce-bolt',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
