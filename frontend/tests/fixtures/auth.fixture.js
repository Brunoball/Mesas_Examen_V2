const base = require('@playwright/test');
const { readAuthSession } = require('../helpers/api.helper');
const { authStorageEntries } = require('../helpers/auth.helper');
const { env } = require('../helpers/env.helper');

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
    const auth = readAuthSession();
    const entries = authStorageEntries(auth);
    const appOrigin = new URL(env.baseURL).origin;

    await page.addInitScript(
      ({ origin, values }) => {
        try {
          if (window.location.origin !== origin) return;
          Object.entries(values).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              localStorage.setItem(key, String(value));
            }
          });
        } catch (_error) {
          // about:blank puede bloquear localStorage antes de la primera navegación.
        }
      },
      { origin: appOrigin, values: entries },
    );

    const technicalFailures = [];
    page.on('pageerror', (error) => technicalFailures.push(`Error JavaScript: ${error.message}`));
    page.on('response', (response) => {
      if (response.url().startsWith(env.apiURL) && response.status() >= 500) {
        technicalFailures.push(`HTTP ${response.status()} en ${response.url()}`);
      }
    });

    await use(page);

    if (technicalFailures.length && !testInfo.errors.length) {
      await testInfo.attach('fallos-tecnicos.txt', {
        body: Buffer.from(technicalFailures.join('\n'), 'utf8'),
        contentType: 'text/plain',
      });
      throw new Error(technicalFailures.join('\n'));
    }
  },
});

module.exports = { test, expect: base.expect };
