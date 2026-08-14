const { test, expect } = require('@playwright/test');
const {
  openConfig,
  studentResponse,
  installMockApi,
  openForm,
  loginForm,
} = require('./helpers/mock.helper');

test.describe('01 · Formulario · acceso, validaciones y consulta', () => {
  test('carga configuración visual, tenant, logo/fondo y textos de la escuela', async ({ page }) => {
    const calls = await installMockApi(page);
    await openForm(page, 7);

    await expect(page.getByRole('heading', { name: 'Mesas de Examen PWFORM' })).toBeVisible();
    await expect(page.getByText('Consultá tus materias e inscribite.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByText(/Si sos egresado/)).toBeVisible();
    await expect(page.locator('img[alt="Logo de la escuela"]')).toHaveAttribute('src', /127\.0\.0\.1:3201\/uploads\/formulario\/logo\.png/);

    const primary = await page.locator('.auth-page').evaluate((node) => getComputedStyle(node).getPropertyValue('--reg-primary').trim());
    const background = await page.locator('.auth-page').evaluate((node) => node.style.getPropertyValue('--form-bg-image'));
    expect(primary).toBe('#13579b');
    expect(background).toContain('127.0.0.1:3201/uploads/formulario/fondo.png');
    expect(calls.config[0].url).toContain('idTenant=7');
  });

  test('muestra correctamente inscripción cerrada y falla de configuración', async ({ page }) => {
    await installMockApi(page, {
      config: openConfig({ abierta: false, mensaje_cerrado: 'CERRADO POR PRUEBA' }),
    });
    await openForm(page);
    await expect(page.getByRole('heading', { name: 'Inscripción no disponible' })).toBeVisible();
    await expect(page.getByText('CERRADO POR PRUEBA')).toBeVisible();
    await expect(page.getByText(/Ventana de inscripción/)).toBeVisible();
  });

  test('ante error de red de configuración no deja operar y muestra estado seguro', async ({ page }) => {
    await installMockApi(page, { config: 'NETWORK_ERROR' });
    await openForm(page);
    await expect(page.getByRole('heading', { name: 'Inscripción no disponible' })).toBeVisible();
    await expect(page.getByText('Inscripción no disponible por el momento.')).toBeVisible();
    await expect(page.locator('#gmail')).toHaveCount(0);
  });

  test('valida Gmail, limita el DNI a números y exige entre 7 y 9 dígitos', async ({ page }) => {
    const calls = await installMockApi(page);
    await openForm(page);

    await page.locator('#gmail').fill('correo@otro.com');
    await page.locator('#dni').fill('12a.34x');
    await expect(page.locator('#dni')).toHaveValue('1234');
    await page.locator('.auth-form button[type="submit"]').click();
    await expect(page.locator('.toast-error')).toContainText('Ingresá un Gmail válido');
    expect(calls.search).toHaveLength(0);

    await page.locator('#gmail').fill('alumno@gmail.com');
    await page.locator('.auth-form button[type="submit"]').click();
    await expect(page.locator('.toast-error')).toContainText('DNI válido (7 a 9 dígitos)');
    expect(calls.search).toHaveLength(0);

    await page.locator('#dni').fill('40111222');
    await page.locator('.auth-form button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: 'Materias pendientes de rendir' })).toBeVisible();
    expect(calls.search).toHaveLength(1);
    expect(calls.search[0].method).toBe('POST');
    expect(calls.search[0].body).toMatchObject({ gmail: 'alumno@gmail.com', dni: '40111222', idTenant: 1 });
  });

  test('Recordarme guarda, restaura y elimina Gmail/DNI', async ({ page }) => {
    await installMockApi(page);
    await openForm(page);
    await page.locator('#gmail').fill('recordado@gmail.com');
    await page.locator('#dni').fill('40999888');
    await page.locator('label.remember').click();
    await expect(page.getByLabel('Recordarme')).toBeChecked();

    await page.reload();
    await expect(page.locator('#gmail')).toHaveValue('recordado@gmail.com');
    await expect(page.locator('#dni')).toHaveValue('40999888');
    await expect(page.getByLabel('Recordarme')).toBeChecked();

    await page.locator('label.remember').click();
    await expect(page.getByLabel('Recordarme')).not.toBeChecked();
    await page.reload();
    await expect(page.locator('#gmail')).toHaveValue('');
    await expect(page.locator('#dni')).toHaveValue('');
    await expect(page.getByLabel('Recordarme')).not.toBeChecked();
  });

  test('distingue sin previas, error del servidor y error de red en la consulta', async ({ page }) => {
    let attempt = 0;
    await installMockApi(page, {
      search: async () => {
        attempt += 1;
        if (attempt === 1) return { exito: false, mensaje: 'No se encontraron materias previas activas para ese DNI.' };
        return { exito: false, mensaje: 'Consulta rechazada por prueba.' };
      },
    });
    await openForm(page);

    await loginForm(page);
    await expect(page.locator('.toast-advertencia')).toContainText('No se encontraron materias previas');
    await loginForm(page);
    await expect(page.locator('.toast-advertencia')).toContainText('Consulta rechazada por prueba');

    await page.unroute('**/api.php?**');
    await installMockApi(page, { search: 'NETWORK_ERROR' });
    await loginForm(page);
    await expect(page.locator('.toast-error')).toContainText('Error consultando el servidor');
  });

  test('elimina el toast de una búsqueda anterior cuando la nueva consulta es correcta', async ({ page }) => {
    let attempt = 0;
    await installMockApi(page, {
      search: async () => {
        attempt += 1;
        return attempt === 1
          ? { exito: false, mensaje: 'No se encontraron materias previas activas para ese DNI.' }
          : studentResponse();
      },
    });
    await openForm(page);

    await loginForm(page);
    await expect(page.locator('.toast-advertencia')).toContainText('No se encontraron materias previas');

    await loginForm(page);
    await expect(page.getByRole('heading', { name: 'Materias pendientes de rendir' })).toBeVisible();
    await expect(page.locator('.toast-container')).toHaveCount(0);
  });

  test('presenta alumno, orden académico, solo lectura, materias visuales e inscriptas', async ({ page }) => {
    await installMockApi(page, { search: studentResponse({ ya_inscripto: true }) });
    await openForm(page);
    await loginForm(page);

    await expect(page.locator('.hero-form input').first()).toHaveValue('ALUMNO DE PRUEBA');
    await expect(page.getByText('Estos datos no se pueden modificar aquí.')).toBeVisible();
    const readonly = page.locator('.hero-form input');
    expect(await readonly.count()).toBeGreaterThanOrEqual(6);
    for (let index = 0; index < await readonly.count(); index += 1) {
      await expect(readonly.nth(index)).toHaveAttribute('readonly', '');
    }

    const names = await page.locator('.materias-scroll .materia-card .nombre').allTextContents();
    expect(names[0]).toContain('LENGUA');
    expect(names[1]).toContain('MATEMÁTICA ANTERIOR');
    expect(names[2]).toContain('ANÁLISIS POSTERIOR');
    expect(names[3]).toContain('HISTORIA');
    await expect(page.getByText('TERCERA MATERIA', { exact: true })).toBeVisible();
    await expect(page.getByText('MATERIA PENDIENTE', { exact: true })).toBeVisible();
    await expect(page.getByText('INSCRIPTO')).toBeVisible();
    await expect(page.locator('.toast-advertencia')).toContainText('ya fue inscrito');

    await page.locator('.actions-left button', { hasText: 'Volver' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
