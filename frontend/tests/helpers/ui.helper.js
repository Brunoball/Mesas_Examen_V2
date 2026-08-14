const { expect } = require('@playwright/test');
const { env } = require('./env.helper');

async function waitForBusyToFinish(page) {
  const busy = page.locator('[aria-busy="true"], .gif-carga-container, [class*="loading"], [class*="spinner"]');
  try { await busy.first().waitFor({ state: 'hidden', timeout: 12_000 }); } catch (_) {}
}

async function gotoAndWait(page, route, expectedText = null) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await waitForBusyToFinish(page);
  if (expectedText) await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible();
}

async function assertFrontendUsesConfiguredBackend(page) {
  const expectedOrigin = new URL(env.apiURL).origin;
  await expect.poll(async () => {
    const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    return urls.some((url) => {
      try {
        const parsed = new URL(url);
        return parsed.origin === expectedOrigin && /\/routes\/api\.php/i.test(parsed.pathname);
      } catch (_) {
        return false;
      }
    });
  }, {
    message: `El frontend debe consumir el backend configurado en ${env.apiURL}`,
    timeout: 15_000,
    intervals: [250, 500, 1000],
  }).toBe(true);
}

module.exports = { waitForBusyToFinish, gotoAndWait, assertFrontendUsesConfiguredBackend };
