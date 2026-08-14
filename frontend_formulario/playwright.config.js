const { defineConfig, devices } = require('@playwright/test');
const { env } = require('./tests/helpers/env.helper');

const webServer = [];

if (env.startBackend) {
  webServer.push({
    command: 'node tests/helpers/start-backend.js',
    url: `${env.apiURL}/api.php?action=form_obtener_config_inscripcion&idTenant=${env.tenantId}`,
    timeout: 120_000,
    reuseExistingServer: false,
  });
}

if (env.startFrontend) {
  webServer.push({
    command: 'node tests/helpers/start-frontend.js',
    url: env.baseURL,
    timeout: 180_000,
    reuseExistingServer: false,
  });
}

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /\d{2}-.*\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: env.baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Cordoba',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
