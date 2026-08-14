const { test, expect } = require('./fixtures/auth.fixture');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { assertFrontendUsesConfiguredBackend } = require('./helpers/ui.helper');
const { unique } = require('./helpers/env.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function numero(value) {
  return n(value).toLocaleString('es-AR');
}

function sum(rows, key) {
  return (rows || []).reduce((acc, row) => acc + n(row?.[key]), 0);
}

function validateTotals(data) {
  const totales = data?.totales || {};
  ['inscriptos', 'aprobados', 'ausentes', 'desaprobados'].forEach((key) => {
    expect(Number.isFinite(Number(totales[key])), `totales.${key} debe ser numérico`).toBe(true);
    expect(n(totales[key]), `totales.${key} no puede ser negativo`).toBeGreaterThanOrEqual(0);
  });

  expect(n(totales.aprobados) + n(totales.ausentes) + n(totales.desaprobados))
    .toBe(n(totales.inscriptos));

  const porcentajes = totales.porcentajes || {};
  ['aprobados', 'ausentes', 'desaprobados'].forEach((key) => {
    expect(n(porcentajes[key]), `porcentaje ${key}`).toBeGreaterThanOrEqual(0);
    expect(n(porcentajes[key]), `porcentaje ${key}`).toBeLessThanOrEqual(100);
  });

  expect(Array.isArray(data?.por_estado)).toBe(true);
  expect(Array.isArray(data?.por_fechas)).toBe(true);
  expect(Array.isArray(data?.por_tipo)).toBe(true);

  if ((data.por_fechas || []).length > 0) {
    expect(sum(data.por_fechas, 'inscriptos')).toBe(n(totales.inscriptos));
    expect(sum(data.por_fechas, 'aprobados')).toBe(n(totales.aprobados));
    expect(sum(data.por_fechas, 'ausentes')).toBe(n(totales.ausentes));
    expect(sum(data.por_fechas, 'desaprobados')).toBe(n(totales.desaprobados));
  }

  if ((data.por_tipo || []).length > 0) {
    expect(sum(data.por_tipo, 'inscriptos')).toBe(n(totales.inscriptos));
    expect(sum(data.por_tipo, 'aprobados')).toBe(n(totales.aprobados));
    expect(sum(data.por_tipo, 'ausentes')).toBe(n(totales.ausentes));
    expect(sum(data.por_tipo, 'desaprobados')).toBe(n(totales.desaprobados));
  }
}

test.describe('06 · Estadísticas', () => {
  test.afterEach(() => cleanupAll({ silent: true }));
  test('API: opciones, aliases, validaciones, resumen y consistencia de totales', async ({ request }) => {
    expectFail(
      await apiGet(request, 'estadisticas_mesas_opciones'),
      401,
      /sesión expirada/i,
      'estadísticas sin sesión'
    );

    const admin = await login(request);

    expectFail(
      await apiGet(request, 'estadisticas_mesas_resumen', {}, admin),
      422,
      /seleccioná una mesa/i,
      'resumen sin mesa'
    );
    expectFail(
      await apiGet(request, 'estadisticas_mesas_resumen', { id_armado_historial: 'INVALIDO' }, admin),
      422,
      /seleccioná una mesa/i,
      'resumen con id inválido'
    );
    expectFail(
      await apiGet(request, 'estadisticas_mesas_resumen', { id_armado_historial: 2147483647 }, admin),
      404,
      /no se encontró/i,
      'resumen historial inexistente'
    );

    const opcionesMain = expectOk(
      await apiGet(request, 'estadisticas_mesas_opciones', {}, admin),
      'estadisticas_mesas_opciones'
    );
    const opcionesAlias = expectOk(
      await apiGet(request, 'estadisticas_historial_mesas_opciones', {}, admin),
      'estadisticas_historial_mesas_opciones'
    );

    const opciones = opcionesMain.data?.opciones || [];
    const aliasOpciones = opcionesAlias.data?.opciones || [];

    expect(Array.isArray(opciones)).toBe(true);
    expect(Number(opcionesMain.data?.total || 0)).toBe(opciones.length);
    expect(aliasOpciones.map((row) => String(row.id_armado_historial)))
      .toEqual(opciones.map((row) => String(row.id_armado_historial)));

    if (opciones.length === 0) return;

    const seleccion = opciones[0];
    const id = String(seleccion.id_armado_historial);

    const resumenMain = expectOk(
      await apiGet(request, 'estadisticas_mesas_resumen', { id_armado_historial: id }, admin),
      'estadisticas_mesas_resumen'
    ).data;
    const resumenAlias = expectOk(
      await apiGet(request, 'estadisticas_historial_mesas_resumen', { id_armado_historial: id }, admin),
      'estadisticas_historial_mesas_resumen'
    ).data;

    expect(resumenMain?.armado).toBeTruthy();
    expect(String(resumenMain.armado.id_armado_historial)).toBe(id);
    validateTotals(resumenMain);

    expect(resumenAlias.totales).toEqual(resumenMain.totales);
    expect(resumenAlias.por_estado).toEqual(resumenMain.por_estado);
    expect(resumenAlias.por_fechas).toEqual(resumenMain.por_fechas);
    expect(resumenAlias.por_tipo).toEqual(resumenMain.por_tipo);

    const vistaUser = unique('VISTAEST');
    expectOk(await apiPost(request, 'registro', { nombre: vistaUser, contrasena: 'PwTest123!', rol: 'vista' }, admin), 'crear vista estadísticas');
    const vista = await login(request, vistaUser, 'PwTest123!');
    expectOk(await apiGet(request, 'estadisticas_mesas_opciones', {}, vista), 'vista lee opciones estadísticas');
    expectOk(await apiGet(request, 'estadisticas_mesas_resumen', { id_armado_historial: id }, vista), 'vista lee resumen estadísticas');
  });

  test('API: detalle por estado, fecha y tipo coincide con el resumen', async ({ request }) => {
    const admin = await login(request);
    const opciones = expectOk(
      await apiGet(request, 'estadisticas_mesas_opciones', {}, admin),
      'opciones detalle'
    ).data?.opciones || [];

    if (opciones.length === 0) return;

    const id = String(opciones[0].id_armado_historial);
    const resumen = expectOk(
      await apiGet(request, 'estadisticas_mesas_resumen', { id_armado_historial: id }, admin),
      'resumen detalle'
    ).data;

    expectFail(
      await apiGet(request, 'estadisticas_mesas_detalle', {
        id_armado_historial: id,
        dimension: 'fecha',
        value: 'FECHA-INVALIDA',
      }, admin),
      422,
      /fecha.*no es válida/i,
      'detalle fecha inválida'
    );

    const all = expectOk(
      await apiGet(request, 'estadisticas_mesas_detalle', {
        id_armado_historial: id,
        dimension: 'todos',
      }, admin),
      'detalle total'
    ).data;

    expect(Array.isArray(all.previas)).toBe(true);
    expect(n(all.filtro?.total)).toBe(all.previas.length);
    expect(all.previas.length).toBe(n(resumen.totales.inscriptos));

    const alias = expectOk(
      await apiGet(request, 'estadisticas_historial_mesas_detalle', {
        id_armado_historial: id,
        dimension: 'todos',
      }, admin),
      'alias detalle total'
    ).data;
    expect(n(alias.filtro?.total)).toBe(all.previas.length);

    const states = [
      ['inscriptos', resumen.totales.inscriptos],
      ['aprobados', resumen.totales.aprobados],
      ['ausentes', resumen.totales.ausentes],
      ['desaprobados', resumen.totales.desaprobados],
    ];

    for (const [state, expected] of states) {
      const detail = expectOk(
        await apiGet(request, 'estadisticas_mesas_detalle', {
          id_armado_historial: id,
          dimension: 'estado',
          value: state,
        }, admin),
        `detalle estado ${state}`
      ).data;
      expect(detail.previas.length, `cantidad detalle ${state}`).toBe(n(expected));
    }

    for (const row of resumen.por_tipo || []) {
      const detail = expectOk(
        await apiGet(request, 'estadisticas_mesas_detalle', {
          id_armado_historial: id,
          dimension: 'tipo',
          value: row.tipo_mesa,
        }, admin),
        `detalle tipo ${row.tipo_mesa}`
      ).data;
      expect(detail.previas.length, `cantidad tipo ${row.tipo_mesa}`).toBe(n(row.inscriptos));
    }

    const firstDate = (resumen.por_fechas || [])[0];
    if (firstDate) {
      const value = firstDate.fecha_mesa || '__sin_fecha__';
      const detail = expectOk(
        await apiGet(request, 'estadisticas_mesas_detalle', {
          id_armado_historial: id,
          dimension: 'fecha',
          value,
        }, admin),
        `detalle fecha ${value}`
      ).data;
      expect(detail.previas.length, `cantidad fecha ${value}`).toBe(n(firstDate.inscriptos));
    }
  });

  test('UI: selector, tarjetas, gráficos, tablas y modal de detalle con búsqueda', async ({ page, request }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(request);
    const optionsPayload = expectOk(
      await apiGet(request, 'estadisticas_mesas_opciones', {}, admin),
      'opciones esperadas UI'
    ).data;
    const opciones = optionsPayload?.opciones || [];

    await page.goto('/estadisticas', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/estadisticas(?:$|[/?#])/);
    await expect(page.getByRole('heading', { name: 'Estadísticas de mesas' })).toBeVisible();
    await assertFrontendUsesConfiguredBackend(page);

    if (opciones.length === 0) {
      await expect(page.getByText('No hay mesas armadas ni historiales para graficar', { exact: true })).toBeVisible();
      guard.assertClean('Estadísticas UI sin datos');
      return;
    }

    const first = opciones[0];
    const id = String(first.id_armado_historial);
    const resumen = expectOk(
      await apiGet(request, 'estadisticas_mesas_resumen', { id_armado_historial: id }, admin),
      'resumen esperado UI'
    ).data;

    const select = page.locator('.estadHero__selectBox select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue(id);

    await expect(page.locator('.estadisticasPage')).toHaveAttribute('aria-busy', 'false');

    const cards = [
      ['Inscriptos', resumen.totales.inscriptos],
      ['Aprobados', resumen.totales.aprobados],
      ['Ausentes', resumen.totales.ausentes],
      ['Desaprobados', resumen.totales.desaprobados],
    ];

    for (const [label, value] of cards) {
      const card = page.locator('article.estadCard').filter({ hasText: label }).first();
      await expect(card, `tarjeta ${label}`).toBeVisible();
      await expect(card).toContainText(numero(value));
    }

    await expect(page.getByText('Distribución general', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Gráfico de torta de resultados')).toBeVisible();
    await expect(page.getByText('Comparación por estado', { exact: true })).toBeVisible();
    await expect(page.getByText('Detalle por fecha', { exact: true })).toBeVisible();
    await expect(page.getByText('Detalle por tipo', { exact: true })).toBeVisible();

    const allDetail = expectOk(
      await apiGet(request, 'estadisticas_mesas_detalle', {
        id_armado_historial: id,
        dimension: 'estado',
        value: 'inscriptos',
      }, admin),
      'detalle esperado UI'
    ).data;

    await page.locator('article.estadCard').filter({ hasText: 'Inscriptos' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Todas las previas inscriptas' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      `${numero(allDetail.previas.length)} ${allDetail.previas.length === 1 ? 'previa encontrada' : 'previas encontradas'}`
    );

    if (allDetail.previas.length > 0) {
      const firstRow = allDetail.previas[0];
      const term = String(firstRow.dni || firstRow.alumno || firstRow.materia || '').trim();
      if (term) {
        const search = dialog.getByRole('searchbox', { name: 'Buscar alumno, DNI, materia o docente' });
        await search.fill(term);
        await expect(dialog.locator('tbody tr')).toHaveCount(
          allDetail.previas.filter((row) => {
            const haystack = [
              row.alumno,
              row.dni,
              row.materia,
              row.materias_taller,
              row.docentes,
              row.condicion,
              row.numero_mesa,
              row.numero_grupo,
              row.fecha_mesa_texto,
              row.turno,
              row.anio,
            ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            return haystack.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
          }).length
        );
      }
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Cada tarjeta de estado abre su detalle correspondiente.
    for (const [label, dialogName, expectedCount] of [
      ['Aprobados', 'Previas aprobadas', resumen.totales.aprobados],
      ['Ausentes', 'Previas ausentes', resumen.totales.ausentes],
      ['Desaprobados', 'Previas desaprobadas', resumen.totales.desaprobados],
    ]) {
      await page.locator('article.estadCard').filter({ hasText: label }).first().click();
      const stateDialog = page.getByRole('dialog', { name: dialogName });
      await expect(stateDialog).toBeVisible();
      await expect(stateDialog).toContainText(`${numero(expectedCount)} ${n(expectedCount) === 1 ? 'previa encontrada' : 'previas encontradas'}`);
      await stateDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(stateDialog).toBeHidden();
    }

    // Las filas de fecha y tipo también son acciones: verificamos ambos caminos.
    if ((resumen.por_fechas || []).length > 0) {
      const fechaRow = page.locator('.estadDetailsGrid article').filter({ hasText: 'Detalle por fecha' }).getByRole('button').first();
      await fechaRow.click();
      const fechaDialog = page.getByRole('dialog').filter({ hasText: /Previas del/i });
      await expect(fechaDialog).toBeVisible();
      await fechaDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    }

    if ((resumen.por_tipo || []).length > 0) {
      const tipoRow = page.locator('.estadDetailsGrid article').filter({ hasText: 'Detalle por tipo' }).getByRole('button').first();
      await tipoRow.click();
      const tipoDialog = page.getByRole('dialog').filter({ hasText: /Previas (simples|correlativas|de taller)/i });
      await expect(tipoDialog).toBeVisible();
      await expect(tipoDialog.getByText(/Estás viendo las previas que forman este tipo de mesa/i)).toBeVisible();
      await tipoDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    }

    if (opciones.length > 1) {
      const second = opciones[1];
      await select.selectOption(String(second.id_armado_historial));
      await expect(select).toHaveValue(String(second.id_armado_historial));
      await expect(page.locator('.estadisticasPage')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('.estadSelectionInfo')).toContainText(
        String(second.periodo || second.label || second.codigo_armado || '')
      );
    }

    guard.assertClean('Estadísticas UI');
  });
});
