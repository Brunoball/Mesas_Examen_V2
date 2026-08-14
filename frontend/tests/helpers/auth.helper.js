const { expect } = require('@playwright/test');
const { env } = require('./env.helper');
const { login, readAuthSession } = require('./api.helper');

function authStorageEntries(auth) {
  const usuario = auth.usuario || {};
  const tenant = auth.tenant || usuario.tenant || {};
  return {
    token: auth.token,
    session_key: auth.sessionKey || auth.token,
    csrf_token: auth.csrfToken,
    usuario: JSON.stringify(usuario),
    tenant: JSON.stringify(tenant),
    idTenant: String(tenant.idTenant || tenant.id_tenant || usuario.idTenant || usuario.id_tenant || env.tenantId || ''),
    auth_last_activity: String(Date.now()),
  };
}

async function installAuthStorage(page, auth) {
  const entries = authStorageEntries(auth);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((values) => {
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') localStorage.setItem(key, String(value));
    });
  }, entries);
}

async function authFromStorageState(page) {
  const state = await page.context().storageState();
  let preferredOrigin = '';
  try { preferredOrigin = new URL(env.baseURL).origin; } catch (_error) {}
  const origins = [...(state.origins || [])].sort((a, b) => (a.origin === preferredOrigin ? -1 : b.origin === preferredOrigin ? 1 : 0));
  for (const origin of origins) {
    const map = Object.fromEntries((origin.localStorage || []).map((entry) => [entry.name, entry.value]));
    if (!map.session_key && !map.token) continue;
    let usuario = {};
    let tenant = {};
    try { usuario = JSON.parse(map.usuario || '{}'); } catch (_error) {}
    try { tenant = JSON.parse(map.tenant || '{}'); } catch (_error) {}
    return {
      token: map.token || map.session_key,
      sessionKey: map.session_key || map.token,
      csrfToken: map.csrf_token || '',
      usuario,
      tenant,
    };
  }
  return null;
}

async function loginPageByApi(page, credentials = {}) {
  const wantsDefaultAdmin = !credentials.user && !credentials.password;
  if (wantsDefaultAdmin) {
    const shared = readAuthSession();
    await installAuthStorage(page, shared);
    return shared;
  }

  const auth = await login(
    page.request,
    credentials.user || env.adminUser,
    credentials.password || env.adminPassword
  );
  await installAuthStorage(page, auth);
  return auth;
}

async function loginUi(page, options = {}) {
  await page.goto('/');
  await page.getByPlaceholder('Usuario').fill(options.user || env.adminUser);
  await page.getByPlaceholder('Contraseña').fill(options.password || env.adminPassword);
  if (options.remember) await page.getByText('Recordar cuenta', { exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/panel(?:$|[/?#])/);
}

async function logoutUi(page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole('button', { name: /Cerrar sesión|Salir/i }).last();
  await confirm.click();
  await expect(page).toHaveURL(/\/$/);
}

module.exports = {
  authStorageEntries,
  installAuthStorage,
  authFromStorageState,
  loginPageByApi,
  loginUi,
  logoutUi,
};
