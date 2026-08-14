const { test, expect } = require('./fixtures/auth.fixture');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { assertFrontendUsesConfiguredBackend } = require('./helpers/ui.helper');
const { unique } = require('./helpers/env.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');

function numero(valor) {
  return Number(valor || 0).toLocaleString('es-AR');
}

function expectNonNegative(value, label) {
  expect(Number.isFinite(Number(value)), `${label} debe ser numérico`).toBe(true);
  expect(Number(value), `${label} no puede ser negativo`).toBeGreaterThanOrEqual(0);
}

function expectPercent(value, label) {
  expect(Number.isFinite(Number(value)), `${label} debe ser numérico`).toBe(true);
  expect(Number(value), `${label} debe estar entre 0 y 100`).toBeGreaterThanOrEqual(0);
  expect(Number(value), `${label} debe estar entre 0 y 100`).toBeLessThanOrEqual(100);
}

test.describe('02 · Dashboard', () => {
  test.afterEach(() => cleanupAll({ silent: true }));
  test('API: resumen, alias, seguridad y consistencia de indicadores', async ({ request }) => {
    expectFail(
      await apiGet(request, 'dashbord_resumen'),
      401,
      /sesión expirada/i,
      'dashboard sin sesión'
    );

    const admin = await login(request);
    const principal = expectOk(
      await apiGet(request, 'dashbord_resumen', {}, admin),
      'dashbord_resumen'
    );
    const alias = expectOk(
      await apiGet(request, 'dashboard_resumen', {}, admin),
      'dashboard_resumen alias'
    );

    const data = principal.data;
    expect(data).toBeTruthy();
    expect(alias.data).toBeTruthy();

    expect(alias.data.tarjetas).toEqual(data.tarjetas);
    expect(alias.data.indicadores).toEqual(data.indicadores);
    expect(alias.data.estado_armado).toEqual(data.estado_armado);

    expect(data.periodo).toBeTruthy();
    expect(String(data.periodo.fecha_actual || '')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(data.periodo.anio_actual)).toBeGreaterThanOrEqual(2020);
    expect(data.periodo.rango_armado).toBeTruthy();

    const tarjetas = data.tarjetas || {};
    [
      'previas_inscriptas',
      'alumnos_inscriptos',
      'numeros_mesa',
      'grupos_finales',
      'no_agrupadas',
      'docentes_activos',
    ].forEach((key) => expectNonNegative(tarjetas[key], `tarjetas.${key}`));

    expect(Number(tarjetas.alumnos_inscriptos))
      .toBeLessThanOrEqual(Number(tarjetas.previas_inscriptas));

    const indicadores = data.indicadores || {};
    [
      'previas_activas',
      'previas_en_mesas',
      'previas_sin_mesa',
      'mesas_registros',
      'mesas_sin_numero',
      'numeros_agrupados',
      'alumnos_en_grupos',
      'no_agrupadas_total',
      'materias_activas',
      'catedras_activas',
      'catedras_sin_docente',
      'areas_activas',
      'turnos_activos',
      'docentes_con_disponibilidad',
    ].forEach((key) => expectNonNegative(indicadores[key], `indicadores.${key}`));

    [
      'porcentaje_agrupado',
      'porcentaje_numerado',
      'porcentaje_catedras_con_docente',
      'porcentaje_docentes_con_disponibilidad',
    ].forEach((key) => expectPercent(indicadores[key], `indicadores.${key}`));

    expect(Number(indicadores.previas_en_mesas) + Number(indicadores.previas_sin_mesa))
      .toBeLessThanOrEqual(Number(tarjetas.previas_inscriptas) + Number(indicadores.previas_en_mesas));

    const estado = data.estado_armado || {};
    expect(['sin_armado', 'borrador', 'numerado', 'con_observaciones', 'completo'])
      .toContain(String(estado.codigo || ''));
    expect(String(estado.titulo || '')).toBeTruthy();
    expect(String(estado.detalle || '')).toBeTruthy();

    expect(Array.isArray(data.grafico_dias)).toBe(true);
    expect(data.grafico_dias.length).toBeLessThanOrEqual(12);
    data.grafico_dias.forEach((row, index) => {
      expect(String(row.fecha_mesa || ''), `grafico_dias[${index}].fecha_mesa`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      ['grupos', 'numeros', 'alumnos', 'no_agrupadas', 'alumnos_no_agrupadas']
        .forEach((key) => expectNonNegative(row[key], `grafico_dias[${index}].${key}`));
    });

    expect(Array.isArray(data.distribucion_tipos)).toBe(true);
    data.distribucion_tipos.forEach((row, index) => {
      expect(['simple', 'correlativa', 'taller']).toContain(String(row.tipo || '').toLowerCase());
      expectNonNegative(row.registros, `distribucion_tipos[${index}].registros`);
      expectNonNegative(row.numeros, `distribucion_tipos[${index}].numeros`);
    });

    expect(Array.isArray(data.ranking_cursos)).toBe(true);
    expect(Array.isArray(data.ranking_areas)).toBe(true);
    expect(Array.isArray(data.agenda)).toBe(true);
    expect(data.agenda.length).toBeLessThanOrEqual(8);
    expect(Array.isArray(data.alertas)).toBe(true);
    expect(data.alertas.length).toBeGreaterThan(0);

    const vistaUser = unique('VISTADASH');
    expectOk(await apiPost(request, 'registro', { nombre: vistaUser, contrasena: 'PwTest123!', rol: 'vista' }, admin), 'crear vista dashboard');
    const vista = await login(request, vistaUser, 'PwTest123!');
    expectOk(await apiGet(request, 'dashbord_resumen', {}, vista), 'vista puede leer dashboard');
  });

  test('UI: error de API muestra fallback y Reintentar recupera el dashboard', async ({ page }) => {
    let fallar = true;
    await page.route('**/api.php?action=dashbord_resumen**', async (route) => {
      if (fallar) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ exito: false, mensaje: 'PWTEST ERROR DASHBOARD' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/panel', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Dashboard sin datos disponibles')).toBeVisible();
    await expect(page.getByText('PWTEST ERROR DASHBOARD')).toBeVisible();

    fallar = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByText('Dashboard sin datos disponibles')).toBeHidden();
    await expect(page.locator('article.dashbord-card').first()).toBeVisible();
  });

  test('UI: tarjetas, gráfico/estado, porcentajes y navegación a Estadísticas', async ({ page, request }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(request);
    const expected = expectOk(
      await apiGet(request, 'dashbord_resumen', {}, admin),
      'dashboard esperado UI'
    ).data;

    await page.goto('/panel', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/panel(?:$|[/?#])/);
    await expect(page.getByRole('heading', { name: 'Dashboard de Mesas de Examen' })).toBeVisible();
    await assertFrontendUsesConfiguredBackend(page);

    const cards = [
      ['Previas inscriptas', expected.tarjetas.previas_inscriptas],
      ['Números de mesa', expected.tarjetas.numeros_mesa],
      ['Grupos finales', expected.tarjetas.grupos_finales],
      ['Sin agrupar', expected.tarjetas.no_agrupadas],
    ];

    for (const [title, value] of cards) {
      const card = page.locator('article.dashbord-card').filter({ hasText: title }).first();
      await expect(card, `tarjeta ${title}`).toBeVisible();
      await expect(card).toContainText(numero(value));
    }

    await expect(page.getByText('Armado por fecha', { exact: true })).toBeVisible();
    if ((expected.grafico_dias || []).length > 0) {
      await expect(page.getByLabel('Gráfico de mesas por día')).toBeVisible();
    } else {
      await expect(page.getByText('Sin fechas de mesas cargadas', { exact: true })).toBeVisible();
    }

    await expect(page.getByText('Estado del armado', { exact: true })).toBeVisible();
    await expect(page.getByText(String(expected.estado_armado.titulo), { exact: true })).toBeVisible();

    const indicadores = expected.indicadores || {};
    const progress = [
      ['Numeración', indicadores.porcentaje_numerado],
      ['Agrupación', indicadores.porcentaje_agrupado],
      ['Cátedras con docente', indicadores.porcentaje_catedras_con_docente],
      ['Docentes con disponibilidad', indicadores.porcentaje_docentes_con_disponibilidad],
    ];

    for (const [label, value] of progress) {
      const item = page.locator('.dashbord-progressItem').filter({ hasText: label }).first();
      await expect(item).toBeVisible();
      await expect(item).toContainText(`${numero(value)}%`);
    }

    const statsNav = page.getByText('Estadísticas', { exact: true }).first();
    await expect(statsNav).toBeVisible();
    await statsNav.click();
    await expect(page).toHaveURL(/\/estadisticas(?:$|[/?#])/);
    await expect(page.getByRole('heading', { name: 'Estadísticas de mesas' })).toBeVisible();

    guard.assertClean('Dashboard UI');
  });
});
