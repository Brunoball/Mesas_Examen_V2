const fs = require('fs');
const { request } = require('@playwright/test');
const {
  AUTH_FILE,
  assertCredentialsConfigured,
  assertExpectedTenantAuth,
  assertSafeMutationConfiguration,
  loadTestEnv,
} = require('./helpers/env.helper');
const { login, writeAuthSession } = require('./helpers/api.helper');
const { assertLocalBackendDatabases, cleanupAll } = require('./helpers/cleanup.helper');

module.exports = async function globalSetup() {
  loadTestEnv();
  assertCredentialsConfigured();
  assertSafeMutationConfiguration();
  assertLocalBackendDatabases();

  // Cada ejecución empieza limpia, pero solo sobre datos/sesiones marcados como Playwright.
  cleanupAll({ includeSessions: true, silent: true });

  const api = await request.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'User-Agent': 'LernaPlaywright/PWTEST' },
  });

  try {
    const auth = await login(api);
    const tenant = assertExpectedTenantAuth(auth);
    if (!/admin/i.test(String(auth.usuario?.rol || ''))) {
      throw new Error('PW_ADMIN_USER debe ser administrador para ejecutar el testing completo.');
    }
    writeAuthSession(auth);
  } catch (error) {
    fs.rmSync(AUTH_FILE, { force: true });
    throw error;
  } finally {
    await api.dispose();
  }
};
