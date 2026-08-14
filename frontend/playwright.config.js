const path = require('path');
const { defineConfig, devices } = require('@playwright/test');
const { env, loadTestEnv } = require('./tests/helpers/env.helper');

loadTestEnv(__dirname);

function webServers() {
  const servers = [];
  const frontendUrl = new URL(env.baseURL);
  const apiUrl = new URL(env.apiURL);
  const apiProbe = `${env.apiURL}/api.php?action=auth_csrf_token`;

  if (env.startBackend) {
    servers.push({
      command: `php -S ${apiUrl.hostname}:${apiUrl.port || 3101}`,
      cwd: env.backendDir,
      url: apiProbe,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'ignore',
    });
  }

  if (env.startFrontend) {
    servers.push({
      command: process.env.PW_FRONTEND_COMMAND || 'npm start',
      cwd: __dirname,
      url: env.baseURL,
      reuseExistingServer: true,
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'ignore',
      env: {
        ...process.env,
        BROWSER: 'none',
        PORT: String(frontendUrl.port || 3100),
        REACT_APP_API_URL: env.apiURL,
      },
    });
  }

  return servers;
}

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: require.resolve('./tests/auth.setup.js'),
  globalTeardown: require.resolve('./tests/auth.teardown.js'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list', { printSteps: false }]],
  use: {
    baseURL: env.baseURL,
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    userAgent: 'LernaPlaywright/PWTEST',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: webServers(),
});
