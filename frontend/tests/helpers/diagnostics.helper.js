const { expect } = require('@playwright/test');

function attachRuntimeGuards(page, options = {}) {
  const state = {
    pageErrors: [],
    consoleErrors: [],
    serverErrors: [],
    failedRequests: [],
  };
  const ignoredConsole = options.ignoredConsole || [];
  const ignoredResponses = options.ignoredResponses || [];

  page.on('pageerror', (error) => state.pageErrors.push(error.message || String(error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const sourceUrl = message.location()?.url || '';

    // Una fuente externa de Google no debe hacer fallar el sistema.
    // Seguimos detectando normalmente cualquier 404/error generado por LERNA.
    const externalGoogleFontFailure =
      /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\//i.test(sourceUrl) &&
      /Failed to load resource/i.test(text);

    if (externalGoogleFontFailure) return;
    if (ignoredConsole.some((pattern) => pattern.test(text))) return;
    state.consoleErrors.push(text);
  });
  page.on('response', async (response) => {
    if (response.status() < 500) return;
    const url = response.url();
    if (ignoredResponses.some((pattern) => pattern.test(url))) return;
    if (/\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(url)) return;
    let body = '';
    try { body = await response.text(); } catch (_) {}
    state.serverErrors.push(`${response.status()} ${url} ${body.slice(0, 500)}`.trim());
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'requestfailed';
    const url = request.url();
    if (/ERR_ABORTED/i.test(failure)) return;
    if (/^blob:/i.test(url) && /ERR_FILE_NOT_FOUND/i.test(failure)) return;
    if (/\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i.test(url)) return;
    state.failedRequests.push(`${request.method()} ${url} :: ${failure}`);
  });

  return {
    state,
    errors: [],
    assertClean(label = 'errores de runtime') {
      const report = [
        state.pageErrors.length ? `PAGE ERRORS:\n${state.pageErrors.join('\n')}` : '',
        state.consoleErrors.length ? `CONSOLE ERRORS:\n${state.consoleErrors.join('\n')}` : '',
        state.serverErrors.length ? `HTTP 5XX:\n${state.serverErrors.join('\n')}` : '',
        state.failedRequests.length ? `REQUEST FAILED:\n${state.failedRequests.join('\n')}` : '',
      ].filter(Boolean).join('\n\n');
      expect(state.pageErrors, `${label}\n${report}`).toEqual([]);
      expect(state.consoleErrors, `${label}\n${report}`).toEqual([]);
      expect(state.serverErrors, `${label}\n${report}`).toEqual([]);
      expect(state.failedRequests, `${label}\n${report}`).toEqual([]);
    },
  };
}

async function expectToast(page, pattern) {
  const toast = page.locator('.toast, .global-toast, [class*="Toast"], [class*="toast"]').filter({ hasText: pattern }).last();
  await expect(toast).toBeVisible();
  return toast;
}

module.exports = { attachRuntimeGuards, expectToast };
