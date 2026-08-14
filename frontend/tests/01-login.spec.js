const { test, expect } = require('@playwright/test');
const { env, unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { loginUi } = require('./helpers/auth.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');

const TEST_PASS = 'PwTest123!';

// Login debe arrancar sin la sesion reutilizable del resto de la suite.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('01 · Login, sesión y recuperación', () => {
  test('protege rutas privadas, entrega CSRF público y los aliases de usuario actual responden con sesión válida', async ({ request }) => {
    const csrf = expectOk(await apiGet(request, 'auth_csrf_token'), 'auth_csrf_token');
    expect(csrf.csrf_token, 'auth_csrf_token debe devolver un token').toMatch(/^[a-f0-9]{32,}$/i);

    const noAuth = await apiGet(request, 'docentes_listar', { pagina: 1, por_pagina: 5 });
    expectFail(noAuth, 401, /sesión|autoriz/i, 'ruta privada sin sesión');

    // El diagnóstico SaaS no debe quedar público en una configuración lista para producción.
    const debugPublic = await apiGet(request, 'debug_saas_login');
    expectFail(debugPublic, [401, 403], /sesión|autoriz|debug deshabilitado/i, 'debug SaaS no público');

    const auth = await login(request);
    for (const action of ['auth_usuario_actual', 'usuario_actual']) {
      const result = await apiGet(request, action, {}, auth);
      const data = expectOk(result, action);
      expect(data.usuario).toBeTruthy();
      expect(String(data.usuario.rol || '').toLowerCase()).toBe('admin');
    }
  });

  test('API login: faltantes, credenciales incorrectas, registro admin y login del usuario creado', async ({ request }) => {
    const empty = await apiPost(request, 'inicio', { nombre: '', contrasena: '' }, null, { csrf: false });
    expectFail(empty, 200, /faltan datos/i, 'login sin datos');

    const badName = unique('LOGINBAD');
    const bad = await apiPost(request, 'inicio', { nombre: badName, contrasena: 'incorrecta' }, null, { csrf: false });
    expectFail(bad, 200, /credenciales|tenant/i, 'credenciales incorrectas');

    const admin = await login(request);
    const user = unique('LOGINUSER');

    const shortUser = await apiPost(request, 'registro', { nombre: 'PW', contrasena: TEST_PASS, rol: 'vista' }, admin);
    expectFail(shortUser, 200, /entre 4 y 100/i, 'registro usuario corto');

    const shortPassword = await apiPost(request, 'registro', { nombre: unique('SHORTPASS'), contrasena: '123', rol: 'vista' }, admin);
    expectFail(shortPassword, 200, /6 caracteres/i, 'registro contraseña corta');

    const invalidRole = await apiPost(request, 'registro', { nombre: unique('BADROLE'), contrasena: TEST_PASS, rol: 'super' }, admin);
    expectFail(invalidRole, 200, /rol inválido/i, 'registro rol inválido');

    const created = await apiPost(request, 'registro', {
      nombre: user,
      contrasena: TEST_PASS,
      rol: 'vista',
      email_recuperacion: `${user.toLowerCase()}@example.com`,
    }, admin);
    const createdData = expectOk(created, 'registro de usuario de testing');
    expect(createdData.usuario?.usuario).toBe(user);

    const duplicate = await apiPost(request, 'registro', { nombre: user, contrasena: TEST_PASS, rol: 'vista' }, admin);
    expectFail(duplicate, 200, /ya existe/i, 'registro duplicado');

    const newAuth = await login(request, user, TEST_PASS);
    expect(String(newAuth.usuario?.rol || '')).toBe('vista');
  });

  test('router y frontend: action faltante/desconocida, CSRF estricto y todas las rutas privadas quedan protegidas', async ({ page, request }) => {
    const missingResponse = await request.get(`${env.apiURL}/api.php`, { failOnStatusCode: false });
    const missingData = await missingResponse.json();
    expect(missingResponse.status()).toBe(400);
    expect(missingData.exito).toBe(false);
    expect(String(missingData.mensaje || '')).toMatch(/falta.*action/i);

    const auth = await login(request);
    const unknown = await apiGet(request, 'pwtest_accion_inexistente', {}, auth);
    expectFail(unknown, 404, /acción no encontrada/i, 'acción inexistente autenticada');

    const csrfStrict = await apiPost(
      request,
      'docentes_guardar',
      { docente: `${unique('CSRFBLOCK')} DOCENTE` },
      auth,
      { csrf: false, headers: { 'X-Requested-With': 'NotAjax' } }
    );
    expectFail(csrfStrict, 403, /CSRF/i, 'mutación privada sin CSRF');

    const privateRoutes = ['/panel', '/docentes', '/catedras', '/materias', '/estadisticas', '/configuracion', '/previas', '/mesas-examen'];
    for (const route of privateRoutes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page, `${route} debe redirigir al login sin sesión`).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    }

    await page.goto('/ruta-que-no-existe', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/$/);
  });

  test('login visual valida campos, error, mostrar contraseña, recordar cuenta y entrada correcta', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Por favor complete todos los campos')).toBeVisible();

    const pass = page.getByPlaceholder('Contraseña');
    await expect(pass).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
    await expect(pass).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
    await expect(pass).toHaveAttribute('type', 'password');

    await page.getByPlaceholder('Usuario').fill(unique('INVALIDLOGIN'));
    await pass.fill('incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText(/Credenciales incorrectas|Usuario o contraseña incorrectos/i)).toBeVisible();

    await page.getByPlaceholder('Usuario').fill(env.adminUser);
    await pass.fill(env.adminPassword);
    await page.getByLabel('Recordar cuenta').check();
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/panel(?:$|[?#])/);

    const storage = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      session: localStorage.getItem('session_key'),
      csrf: localStorage.getItem('csrf_token'),
      usuario: localStorage.getItem('usuario'),
      remember: localStorage.getItem('rememberLogin'),
      rememberUser: localStorage.getItem('remember_nombre'),
      rememberPass: localStorage.getItem('remember_contrasena'),
    }));
    expect(storage.token).toBeTruthy();
    expect(storage.session).toBeTruthy();
    expect(storage.csrf).toBeTruthy();
    expect(storage.usuario).toBeTruthy();
    expect(storage.remember).toBe('1');
    expect(storage.rememberUser).toBe(env.adminUser);
    expect(Buffer.from(storage.rememberPass, 'base64').toString('utf8')).toBe(env.adminPassword);

    guard.assertClean('login visual');
  });

  test('recordar cuenta precarga credenciales al volver al login', async ({ page }) => {
    await page.addInitScript(({ user, pass }) => {
      localStorage.setItem('rememberLogin', '1');
      localStorage.setItem('remember_nombre', user);
      localStorage.setItem('remember_contrasena', btoa(pass));
    }, { user: env.adminUser, pass: env.adminPassword });
    await page.goto('/');
    await expect(page.getByPlaceholder('Usuario')).toHaveValue(env.adminUser);
    await expect(page.getByPlaceholder('Contraseña')).toHaveValue(env.adminPassword);
    await expect(page.getByLabel('Recordar cuenta')).toBeChecked();
  });

  test('avisa sesión expirada por inactividad y limpia el indicador', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('session_expired_reason', '1'));
    await page.goto('/');
    await expect(page.getByText('Tu sesión expiró por inactividad. Volvé a iniciar sesión.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('session_expired_reason'))).toBeNull();
  });

  test('cerrar sesión permite cancelar, confirmar y limpia autenticación sin borrar cuenta recordada', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await loginUi(page, { remember: true });

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    let dialog = page.getByRole('dialog', { name: 'Confirmar cierre de sesión' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    dialog = page.getByRole('dialog', { name: 'Confirmar cierre de sesión' });
    await dialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page).toHaveURL(/\/$/);

    const storage = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      session: localStorage.getItem('session_key'),
      csrf: localStorage.getItem('csrf_token'),
      usuario: localStorage.getItem('usuario'),
      remember: localStorage.getItem('rememberLogin'),
    }));
    expect(storage.token).toBeNull();
    expect(storage.session).toBeNull();
    expect(storage.csrf).toBeNull();
    expect(storage.usuario).toBeNull();
    expect(storage.remember).toBe('1');
    guard.assertClean('logout');
  });

  test('recuperación visual: abrir/cerrar, validación y estado de envío (SMTP mockeado)', async ({ page }) => {
    await page.route('**/api.php?action=recuperar_contrasena_solicitar**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exito: true, mensaje: 'Correo enviado.', email: 'pruebas@example.com' }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    let dialog = page.getByRole('dialog', { name: 'Recuperar contraseña' });
    await expect(dialog).toBeVisible();

    const input = dialog.getByLabel('Usuario o email');
    await input.fill(' ');
    // El botón queda deshabilitado cuando el valor está vacío. Cubrimos la validación forzando submit.
    await dialog.locator('form').evaluate((form) => form.requestSubmit());
    await expect(dialog.getByText('Ingresá tu usuario o email de recuperación.')).toBeVisible();

    await input.fill(env.adminUser);
    await dialog.getByRole('button', { name: 'Enviar instrucciones' }).click();
    await expect(dialog.getByText(/Revisá tu bandeja de entrada/i)).toBeVisible();
    await expect(dialog.getByText(/pr\*+@example\.com/i)).toBeVisible();
    await dialog.getByRole('button', { name: /Cerrar|Entendido|Volver/i }).last().click().catch(async () => {
      await dialog.getByRole('button', { name: 'Cerrar' }).click();
    });

    await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    dialog = page.getByRole('dialog', { name: 'Recuperar contraseña' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('API recuperación rechaza token inexistente y payload inválido sin tocar contraseñas reales', async ({ request }) => {
    const missing = await apiPost(request, 'recuperar_contrasena_solicitar', { usuario: '' }, null, { csrf: false });
    expectFail(missing, [200, 422], /usuario|email|dato/i, 'recuperación sin usuario');

    const validate = await apiPost(request, 'recuperar_contrasena_validar', { token: 'PWTEST_TOKEN_INEXISTENTE' }, null, { csrf: false });
    expectFail(validate, [200, 400, 404, 422], /inválido|vencido|token|enlace/i, 'token inexistente');

    const save = await apiPost(request, 'recuperar_contrasena_guardar', {
      token: 'PWTEST_TOKEN_INEXISTENTE',
      contrasena: TEST_PASS,
      confirmarContrasena: TEST_PASS,
    }, null, { csrf: false });
    expectFail(save, [200, 400, 404, 422], /inválido|vencido|token|enlace/i, 'guardar con token inexistente');
  });

  test('restablecer contraseña: sin token, token válido mockeado, validaciones y éxito visual', async ({ page }) => {
    await page.goto('/restablecer-contrasena');
    await expect(page.getByText('El enlace no tiene token de recuperación.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar contraseña' })).toBeDisabled();

    await page.route('**/api.php?action=recuperar_contrasena_validar**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exito: true, usuario: 'PWTEST MOCK' }),
      });
    });
    await page.route('**/api.php?action=recuperar_contrasena_guardar**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exito: true, mensaje: 'Contraseña actualizada correctamente.' }),
      });
    });

    await page.goto('/restablecer-contrasena?token=PWTEST_MOCK_TOKEN');
    await expect(page.getByText(/Cuenta: PWTEST MOCK/i)).toBeVisible();

    await page.getByLabel('Nueva contraseña').fill('123');
    await page.getByLabel('Confirmar contraseña').fill('123');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('La contraseña debe tener al menos 6 caracteres.')).toBeVisible();

    await page.getByLabel('Nueva contraseña').fill(TEST_PASS);
    await page.getByLabel('Confirmar contraseña').fill('Distinta123!');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();

    await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
    await expect(page.getByLabel('Nueva contraseña')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Mostrar confirmación' }).click();
    await expect(page.getByLabel('Confirmar contraseña')).toHaveAttribute('type', 'text');

    await page.getByLabel('Nueva contraseña').fill(TEST_PASS);
    await page.getByLabel('Confirmar contraseña').fill(TEST_PASS);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Contraseña actualizada correctamente.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
  });
});
