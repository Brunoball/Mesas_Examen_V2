const { test, expect } = require('@playwright/test');
const {
  openConfig,
  studentResponse,
  installMockApi,
  openForm,
  loginForm,
} = require('./helpers/mock.helper');

function card(page, text) {
  return page.locator('.materias-scroll .materia-card').filter({ hasText: text }).first();
}

test.describe('02 · Formulario · selección e inscripción', () => {
  test('correlativas se bloquean, habilitan en orden y se deseleccionan en cascada', async ({ page }) => {
    const calls = await installMockApi(page);
    await openForm(page);
    await loginForm(page);

    const anterior = card(page, 'MATEMÁTICA ANTERIOR');
    const posterior = card(page, 'ANÁLISIS POSTERIOR');
    await expect(posterior).toHaveAttribute('tabindex', '-1');
    await expect(posterior).toHaveAttribute('title', /Primero seleccioná/);
    await expect(page.getByText(/Materias correlativas: primero seleccioná/)).toBeVisible();

    await anterior.press('Enter');
    await expect(anterior).toHaveAttribute('aria-pressed', 'true');
    await expect(posterior).toHaveAttribute('tabindex', '0');
    await posterior.press('Space');
    await expect(posterior).toHaveAttribute('aria-pressed', 'true');

    await anterior.click();
    await expect(anterior).toHaveAttribute('aria-pressed', 'false');
    await expect(posterior).toHaveAttribute('aria-pressed', 'false');
    expect(calls.register).toHaveLength(0);
  });

  test('sin selección advierte y no llama al endpoint de inscripción', async ({ page }) => {
    const calls = await installMockApi(page);
    await openForm(page);
    await loginForm(page);
    await page.locator('.actions-right button', { hasText: 'Confirmar inscripción' }).click();
    await expect(page.locator('.toast-advertencia')).toContainText('Seleccioná al menos una materia');
    expect(calls.register).toHaveLength(0);
  });

  test('envía payload exacto, evita doble envío y muestra aviso persistente accesible', async ({ page }) => {
    const calls = await installMockApi(page, { registrationDelayMs: 500 });
    await openForm(page);
    await loginForm(page, 'ALUMNO@gmail.com', '40111222');

    await card(page, 'LENGUA').click();
    const confirm = page.locator('.actions-right .btn-primary');
    await confirm.click();
    await expect(confirm).toBeDisabled();
    await expect(confirm).toContainText('Inscribiendo');
    await confirm.dispatchEvent('click');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(calls.register).toHaveLength(1);
    expect(calls.register[0].method).toBe('POST');
    expect(calls.register[0].body).toMatchObject({
      dni: '40111222',
      gmail: 'ALUMNO@gmail.com',
      nombre_alumno: 'ALUMNO DE PRUEBA',
      idTenant: 1,
    });
    expect(calls.register[0].body.materias).toHaveLength(1);
    expect(calls.register[0].body.materias[0]).toMatchObject({
      id_previa: 13,
      id_materia: 113,
      curso_id: 3,
      division_id: 1,
      materia: 'LENGUA',
    });
    expect(calls.register[0].body.materias_nombres).toEqual(['LENGUA']);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Inscripción confirmada');
    await expect(dialog).toContainText('permiso de examen');
    await expect(page.getByRole('button', { name: 'Entendido, cerrar aviso' })).toBeFocused();
    expect(await page.evaluate(() => sessionStorage.getItem('form_previas_aviso_permiso_pendiente'))).toBe('1');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.reload();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('form_previas_aviso_permiso_pendiente'))).toBeNull();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('si Recordarme está desactivado limpia datos; si está activo los conserva', async ({ page }) => {
    await installMockApi(page);
    await openForm(page);
    await loginForm(page, 'limpiar@gmail.com', '40111222');
    await card(page, 'LENGUA').click();
    await page.locator('.actions-right button', { hasText: 'Confirmar inscripción' }).click();
    await page.getByRole('button', { name: 'Entendido, cerrar aviso' }).click();
    await expect(page.locator('#gmail')).toHaveValue('');
    await expect(page.locator('#dni')).toHaveValue('');

    await page.locator('#gmail').fill('guardar@gmail.com');
    await page.locator('#dni').fill('40111222');
    await page.locator('label.remember').click();
    await expect(page.getByLabel('Recordarme')).toBeChecked();
    await page.locator('.auth-form button[type="submit"]').click();
    await card(page, 'LENGUA').click();
    await page.locator('.actions-right button', { hasText: 'Confirmar inscripción' }).click();
    await page.getByRole('button', { name: 'Entendido, cerrar aviso' }).click();
    await expect(page.locator('#gmail')).toHaveValue('guardar@gmail.com');
    await expect(page.locator('#dni')).toHaveValue('40111222');
  });

  test('maneja rechazo del backend y error de red sin mostrar éxito ni perder selección', async ({ page }) => {
    let attempt = 0;
    await installMockApi(page, {
      register: async () => {
        attempt += 1;
        return attempt === 1
          ? { exito: false, mensaje: 'Materia rechazada por correlativa.' }
          : 'NETWORK_ERROR';
      },
    });
    await openForm(page);
    await loginForm(page);
    const selected = card(page, 'LENGUA');
    await selected.click();
    await page.locator('.actions-right button', { hasText: 'Confirmar inscripción' }).click();
    await expect(page.locator('.toast-error')).toContainText('Materia rechazada por correlativa');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(selected).toHaveAttribute('aria-pressed', 'true');

    const confirm = page.locator('.actions-right .btn-primary');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator('.toast-error')).toContainText('Error de red al registrar');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('si la ventana cierra antes de buscar o confirmar bloquea toda mutación', async ({ page }) => {
    let closeDuringSearch = false;
    const calls = await installMockApi(page, {
      config: () => closeDuringSearch
        ? openConfig({ abierta: false, mensaje_cerrado: 'CIERRE DURANTE BÚSQUEDA' })
        : openConfig(),
    });
    await openForm(page);
    closeDuringSearch = true;
    await loginForm(page);
    await expect(page.getByRole('heading', { name: 'Inscripción no disponible' })).toBeVisible();
    await expect(page.getByText('CIERRE DURANTE BÚSQUEDA')).toBeVisible();
    expect(calls.search).toHaveLength(0);

    await page.unroute('**/api.php?**');
    let closeDuringConfirm = false;
    const second = await installMockApi(page, {
      config: () => closeDuringConfirm
        ? openConfig({ abierta: false, mensaje_cerrado: 'CIERRE AL CONFIRMAR' })
        : openConfig(),
    });
    await page.reload();
    await loginForm(page);
    await card(page, 'LENGUA').click();
    closeDuringConfirm = true;
    await page.locator('.actions-right button', { hasText: 'Confirmar inscripción' }).click();
    await expect(page.getByRole('heading', { name: 'Inscripción no disponible' })).toBeVisible();
    await expect(page.getByText('CIERRE AL CONFIRMAR')).toBeVisible();
    expect(second.register).toHaveLength(0);
  });

  test('en móvil usa navegación inferior y permite completar el mismo flujo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockApi(page);
    await openForm(page);
    await page.locator('#gmail').fill('movil@gmail.com');
    await page.locator('#dni').fill('40111222');
    await page.locator('.nav-login-mobile button').click();
    await expect(page.getByRole('heading', { name: 'Materias pendientes de rendir' })).toBeVisible();
    await card(page, 'LENGUA').click();
    await expect(page.locator('.nav-bar')).toBeVisible();
    await page.locator('.nav-bar button', { hasText: 'Confirmar inscripción' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
  });
});
