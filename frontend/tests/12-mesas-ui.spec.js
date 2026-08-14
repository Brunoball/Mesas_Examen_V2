const { test, expect } = require('./fixtures/auth.fixture');
const { login } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards, expectToast } = require('./helpers/diagnostics.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');
const { setupMesasFixture, createArmado } = require('./helpers/mesas.helper');

test.describe('12 · Mesas · flujo visual integrado', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterEach(() => cleanupAll({ silent: true }));

  test('estado vacío, pestañas y modal de creación exponen ambos criterios y tres modos de turno', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await setupMesasFixture();
    await loginPageByApi(page);
    await page.goto('/mesas-examen');

    await expect(page.getByText('Mesas de Examen', { exact: true })).toBeVisible();
    await expect(page.getByText('No hay mesas generadas')).toBeVisible();
    await page.getByRole('button', { name: 'No agrupadas', exact: true }).click();
    await expect(page.getByText('No hay números pendientes')).toBeVisible();
    await page.getByRole('button', { name: 'Grupos finales', exact: true }).click();

    await page.getByRole('button', { name: 'Crear Mesas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Crear mesas de examen' })).toBeVisible();
    await expect(page.getByText('Armado por área', { exact: true })).toBeVisible();
    await expect(page.getByText('Armado por indisponibilidad docente', { exact: true })).toBeVisible();
    await expect(page.getByText('Solo mañana', { exact: true })).toBeVisible();
    await expect(page.getByText('Solo tarde', { exact: true })).toBeVisible();
    await expect(page.getByText('Combinado', { exact: true })).toBeVisible();
    await expect(page.getByText(/inscriptas para armar/i)).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Crear mesas de examen' })).toBeHidden();
    guard.assertClean('UI Mesas estado vacío/modal');
  });

  test('creación visual por docentes muestra resultado, tarjetas, filtros y abre editor', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const fixture = await setupMesasFixture();
    await loginPageByApi(page);
    await page.goto('/mesas-examen');
    await page.getByRole('button', { name: 'Crear Mesas', exact: true }).click();
    const modal = page.locator('.mesas-modal');
    await expect(modal).toBeVisible();
    const dateInputs = modal.locator('input[type="date"]');
    await dateInputs.nth(0).fill(fixture.dates[0]);
    await dateInputs.nth(1).fill(fixture.dates.at(-1));
    await modal.getByText('Armado por indisponibilidad docente', { exact: true }).click();
    await modal.getByText('Combinado', { exact: true }).click();
    await modal.getByRole('button', { name: 'Crear y calendarizar' }).click();

    await expect(page.getByText('Resultado del armado')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Editar' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear Mesas', exact: true })).toBeHidden();

    const dateFilter = page.locator('.mesas-selectFilter--fecha select');
    const turnFilter = page.locator('.mesas-selectFilter--turno select');
    await expect(dateFilter).toBeEnabled();
    await expect(turnFilter).toBeEnabled();
    expect(await dateFilter.locator('option').count()).toBeGreaterThan(1);
    expect(await turnFilter.locator('option').count()).toBeGreaterThan(1);

    await page.getByRole('button', { name: 'Editar' }).first().click();
    const editor = page.getByRole('dialog').filter({ has: page.getByText('Programación', { exact: true }) });
    await expect(editor).toBeVisible();
    await expect(editor.getByText('Programación', { exact: true })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Guardar Cambios' })).toBeVisible();
    await editor.getByRole('button', { name: 'Cerrar' }).click();
    await expect(editor).toBeHidden();
    guard.assertClean('UI Mesas armado/editor');
  });

  test('búsqueda, pestaña no agrupadas e historial responden sobre datos reales', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const fixture = await setupMesasFixture();
    const admin = await login(page.request);
    await createArmado(page.request, admin, fixture, 'area');
    await loginPageByApi(page);
    await page.goto('/mesas-examen');

    const search = page.getByPlaceholder('Busqueda');
    await search.fill('PWTEST MESAS');
    await expect(page.getByLabel('Resultados de la búsqueda')).toBeVisible();
    await expect(page.getByText(/resultados/i).first()).toBeVisible();
    await search.fill('IMPOSIBLE-PWTEST-XYZ');
    await expect(page.getByText('Sin coincidencias')).toBeVisible();
    await page.getByLabel('Limpiar búsqueda').click();

    await page.getByRole('button', { name: 'No agrupadas', exact: true }).click();
    await expect(page.getByText('Mesas de Examen', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(page.getByLabel('Resumen del historial')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar historial' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Eliminar todos' })).toBeDisabled();
    guard.assertClean('UI Mesas búsqueda/historial');
  });

  test('el modal visual de eliminación explica y guarda historial por defecto', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const fixture = await setupMesasFixture();
    const admin = await login(page.request);
    await createArmado(page.request, admin, fixture, 'area');
    await loginPageByApi(page);
    await page.goto('/mesas-examen');

    await page.getByRole('button', { name: 'Eliminar mesas', exact: true }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: '¿Seguro que querés eliminar todas las mesas' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Si guardás historial/i)).toBeVisible();
    const checkbox = dialog.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    await dialog.getByRole('button', { name: 'Eliminar mesas', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 120_000 });
    await expectToast(page, /historial del armado.*guardado/i);
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Historial de armados eliminados' })).toBeVisible();
    guard.assertClean('UI Mesas cierre/historial');
  });
});
