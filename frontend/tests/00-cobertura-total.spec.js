const { test, expect } = require('./fixtures/auth.fixture');
const {
  env,
  assertSafeMutationConfiguration,
  assertExpectedTenant,
} = require('./helpers/env.helper');
const { apiGet, expectOk } = require('./helpers/api.helper');
const { authFromStorageState } = require('./helpers/auth.helper');
const { assertLocalBackendDatabases } = require('./helpers/cleanup.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { assertFrontendUsesConfiguredBackend } = require('./helpers/ui.helper');

test('00 · preflight local: entorno, tenant, sesion, backend correcto y seguridad', async ({ page, request }) => {
  assertSafeMutationConfiguration();
  const safety = assertLocalBackendDatabases();
  expect(Number(safety.tenant?.id || 0)).toBe(env.tenantId);
  expect(String(safety.tenant?.db || '')).toBeTruthy();

  const guard = attachRuntimeGuards(page);
  await page.goto('/panel', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/panel(?:$|[/?#])/);

  const tenant = await assertExpectedTenant(page);
  expect(String(tenant.actualId)).toBe(String(env.expectedTenantId));

  const auth = await authFromStorageState(page);
  expect(auth?.token, 'El storageState debe contener token/session_key').toBeTruthy();
  expect(auth?.csrfToken, 'El storageState debe contener csrf_token').toBeTruthy();

  const current = expectOk(await apiGet(request, 'auth_usuario_actual', {}, auth), 'auth_usuario_actual preflight');
  expect(current.usuario).toBeTruthy();
  expect(String(current.usuario.rol || '')).toMatch(/admin/i);

  await assertFrontendUsesConfiguredBackend(page);
  guard.assertClean('Preflight Lerna');
});
