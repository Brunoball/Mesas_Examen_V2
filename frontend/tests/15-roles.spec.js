const { test, expect } = require('@playwright/test');
const { env, unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { installAuthStorage, loginUi } = require('./helpers/auth.helper');
const { cleanupAll, findSafeCatedra } = require('./helpers/cleanup.helper');
const {
  VISTA_ALLOWED_GET_ACTIONS,
  VISTA_RESTRICTED_GET_ACTIONS,
  createVistaAuth,
  roleOf,
} = require('./helpers/roles.helper');

test.use({ storageState: { cookies: [], origins: [] } });

function normalize(value) {
  return String(value || '').trim().toLocaleUpperCase('es-AR');
}

function roleActionParams(action, fixture = {}) {
  if (action === 'previas_obtener_permiso_examen') {
    return { id_previa: fixture.idPrevia || 0 };
  }
  if (action.startsWith('estadisticas_') && !action.endsWith('_opciones')) {
    return { id_armado_historial: fixture.idHistorial || 0, estado: 'aprobado' };
  }
  if (action.includes('historial_detalle') || action.includes('historial_armado_detalle')) {
    return { id_armado_historial: fixture.idHistorial || 0 };
  }
  if (action === 'docentes_obtener') return { id_docente: 0 };
  if (action === 'previas_obtener' || action === 'previas_obtener_materias_inscripcion') {
    return { id_previa: fixture.idPrevia || 0 };
  }
  if (action === 'mesas_editar_obtener') return { tipo: 'grupo', numero_grupo: 0 };
  return { pagina: 1, por_pagina: 10 };
}

async function createEnrolledPrevia(request, admin) {
  const safe = findSafeCatedra();
  const catalogosResponse = expectOk(await apiGet(request, 'previas_catalogos', {}, admin), 'catálogos para rol vista');
  const catalogos = catalogosResponse.data || catalogosResponse;
  const condicion = (catalogos.condiciones || []).find((row) => normalize(row.condicion) === 'PREVIA');
  expect(condicion, 'Debe existir la condición PREVIA para validar el permiso de impresión').toBeTruthy();

  const dni = String(70_000_000 + (Date.now() % 19_000_000)).slice(0, 8);
  const apellido = unique('ROLVISTAPREVIA');
  const payload = {
    dni,
    apellido,
    nombre: 'LECTURA PERMISO',
    cursando_id_curso: Number(safe.id_curso),
    cursando_id_division: Number(safe.id_division),
    id_materia: Number(safe.id_materia),
    materia_id_curso: Number(safe.id_curso),
    materia_id_division: Number(safe.id_division),
    id_condicion: Number(condicion.id_condicion),
    anio: 2098,
    fecha_carga: new Date().toISOString().slice(0, 10),
    inscripcion: 1,
  };

  expectOk(await apiPost(request, 'previas_guardar', payload, admin), 'crear previa inscripta para rol vista');
  const listed = expectOk(await apiGet(request, 'previas_listar', {
    activo: 1,
    inscripcion: 1,
    dni,
    pagina: 1,
    por_pagina: 100,
  }, admin), 'resolver previa inscripta para rol vista');
  const row = (listed.data || []).find((item) => String(item.dni) === dni);
  expect(row, `No se encontró la previa inscripta ${dni}`).toBeTruthy();

  return {
    idPrevia: Number(row.id_previa),
    dni,
    apellido,
    idCondicion: Number(condicion.id_condicion),
  };
}

async function expectNoButtons(page, labels) {
  for (const label of labels) {
    await expect(page.getByRole('button', { name: label, exact: true }), `vista no debe ver “${label}”`).toHaveCount(0);
  }
}

test.describe('15 · Roles admin y vista', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.afterEach(() => cleanupAll({ silent: true }));

  test('login API/UI conserva exactamente los roles admin y vista', async ({ page, request }) => {
    const admin = await login(request);
    expect(roleOf(admin)).toBe('admin');

    const vistaSession = await createVistaAuth(request, admin, 'LOGINVISTA');
    expect(roleOf(vistaSession.auth)).toBe('vista');

    const currentAdmin = expectOk(await apiGet(request, 'auth_usuario_actual', {}, admin), 'identidad admin');
    expect(String(currentAdmin.usuario?.rol || '').toLowerCase()).toBe('admin');

    const currentVista = expectOk(await apiGet(request, 'auth_usuario_actual', {}, vistaSession.auth), 'identidad vista');
    expect(String(currentVista.usuario?.rol || '').toLowerCase()).toBe('vista');

    await loginUi(page, { user: vistaSession.user, password: vistaSession.password });
    const storedRole = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('usuario') || '{}').rol || ''; } catch (_) { return ''; }
    });
    expect(String(storedRole).toLowerCase()).toBe('vista');
  });

  test('API aplica lista positiva GET-only a vista y mantiene acceso total para admin', async ({ request }) => {
    const admin = await login(request);
    const previa = await createEnrolledPrevia(request, admin);
    const vista = (await createVistaAuth(request, admin, 'APIVISTA')).auth;

    const allowedSuccess = [
      'auth_usuario_actual',
      'perfil_obtener',
      'obtener_listas',
      'global_obtener_listas',
      'dashbord_resumen',
      'dashboard_resumen',
      'estadisticas_mesas_opciones',
      'estadisticas_historial_mesas_opciones',
      'previas_catalogos',
      'previas_condiciones',
      'previas_listar',
      'previas_obtener_permiso_examen',
      'mesas_examen_listar',
      'mesas_grupos_listar',
      'mesas_armado_grupos_listar',
      'mesas_no_agrupadas_listar',
      'mesas_armado_no_agrupadas_listar',
      'mesas_historial_listar',
      'mesas_historial_resultados_listar',
    ];

    for (const action of VISTA_ALLOWED_GET_ACTIONS) {
      const result = await apiGet(request, action, roleActionParams(action, previa), vista);
      expect(result.status, `GET permitido a vista no debe devolver 403 en ${action}: ${result.text}`).not.toBe(403);
      if (allowedSuccess.includes(action)) expectOk(result, `GET permitido a vista: ${action}`);
    }

    for (const action of VISTA_RESTRICTED_GET_ACTIONS) {
      const params = roleActionParams(action, previa);
      expectFail(await apiGet(request, action, params, vista), 403, /permisos/i, `GET restringido a vista: ${action}`);

      const adminResult = await apiGet(request, action, params, admin);
      expect(adminResult.status, `admin no debe quedar bloqueado por rol en ${action}: ${adminResult.text}`).not.toBe(403);
    }

    for (const action of VISTA_ALLOWED_GET_ACTIONS) {
      expectFail(
        await apiPost(request, action, roleActionParams(action, previa), vista),
        403,
        /permisos/i,
        `vista solo puede usar GET en ${action}`
      );
    }

    expectFail(
      await apiPost(request, 'disponibilidad_docentes_limpiar_todas', { confirmar: 1 }, vista),
      403,
      /permisos/i,
      'vista no puede limpiar indisponibilidades docentes'
    );
  });

  test('UI oculta el menú restringido a vista, protege URLs directas y conserva todo para admin', async ({ page, request }) => {
    const admin = await login(request);
    const vista = (await createVistaAuth(request, admin, 'UIVISTA')).auth;

    await installAuthStorage(page, admin);
    await page.goto('/panel');
    const adminNav = page.getByRole('navigation', { name: 'Navegación principal' });
    for (const label of ['Dashboard', 'Mesas', 'Previas', 'Materias', 'Cátedras', 'Docentes', 'Estadísticas']) {
      await expect(adminNav.getByRole('button', { name: label, exact: true }), `admin ve ${label}`).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Ir a Configuración' })).toBeVisible();

    await installAuthStorage(page, vista);
    await page.goto('/panel');
    const vistaNav = page.getByRole('navigation', { name: 'Navegación principal' });
    for (const label of ['Dashboard', 'Mesas', 'Previas', 'Estadísticas']) {
      await expect(vistaNav.getByRole('button', { name: label, exact: true }), `vista ve ${label}`).toBeVisible();
    }
    for (const label of ['Materias', 'Cátedras', 'Docentes']) {
      await expect(vistaNav.getByRole('button', { name: label, exact: true }), `vista no ve ${label}`).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Ir a Configuración' })).toHaveCount(0);

    for (const route of ['/materias', '/catedras', '/docentes', '/configuracion']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page, `vista no entra directamente a ${route}`).toHaveURL(/\/panel(?:$|[/?#])/);
    }

    await page.goto('/previas');
    await expect(page.getByText('Mesas · Previas', { exact: true })).toBeVisible();
    await page.goto('/mesas-examen');
    await expect(page.getByText('Mesas de Examen', { exact: true })).toBeVisible();
    await page.goto('/estadisticas');
    await expect(page.getByRole('heading', { name: 'Estadísticas de mesas' })).toBeVisible();
  });

  test('UI vista puede ver, buscar y filtrar Previas/Mesas sin controles de modificación', async ({ page, request }) => {
    const admin = await login(request);
    const previa = await createEnrolledPrevia(request, admin);
    const vista = (await createVistaAuth(request, admin, 'READONLYVISTA')).auth;
    const browserMutations = [];

    page.on('request', (req) => {
      if (req.url().includes('/api.php') && req.method() !== 'GET') {
        browserMutations.push(`${req.method()} ${req.url()}`);
      }
    });

    await installAuthStorage(page, vista);
    await page.goto('/previas');
    await expect(page.getByRole('table', { name: 'Listado de previas' })).toBeVisible();
    await expect(page.locator('.previas-filterSelects select')).toHaveCount(3);
    await expectNoButtons(page, ['Agregar previa', 'Exportar / importar', 'Eliminar todos']);

    const searchPrevias = page.getByPlaceholder('Búsqueda');
    await searchPrevias.fill(previa.dni);
    await page.locator('.previas-filterSelects select').first().selectOption(String(previa.idCondicion));
    await expect(page.getByRole('row').filter({ hasText: previa.dni }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Inscriptos', exact: true }).click();
    const enrolledRow = page.getByRole('row').filter({ hasText: previa.dni }).last();
    await expect(enrolledRow).toBeVisible();
    await expect(enrolledRow.getByTitle('Imprimir permiso de examen')).toBeVisible();
    for (const title of [
      'Editar previa',
      'Inscribir manualmente',
      'Dar de baja previa',
      'Dar de alta',
      'Borrar inscripción',
      'Eliminar previa',
    ]) {
      await expect(page.getByTitle(title), `vista no debe disponer de “${title}”`).toHaveCount(0);
    }

    await page.getByRole('button', { name: 'Dados de baja', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Listado de previas' })).toBeVisible();

    await page.goto('/mesas-examen');
    await expect(page.getByText('Mesas de Examen', { exact: true })).toBeVisible();
    await expect(page.locator('select.mesas-filterSelect')).toHaveCount(2);
    await expectNoButtons(page, ['Crear Mesas', 'PDF', 'Notificar', 'Eliminar mesas', 'Exportar historial', 'Eliminar todos']);
    await expect(page.locator('select.mesas-nota-select')).toHaveCount(0);

    const searchMesas = page.getByPlaceholder('Busqueda');
    await searchMesas.fill('PWTEST');
    await page.getByRole('button', { name: 'No agrupadas', exact: true }).click();
    await expect(searchMesas).toHaveValue('PWTEST');
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(searchMesas).toHaveValue('PWTEST');
    await expectNoButtons(page, ['Exportar historial', 'Eliminar todos']);

    expect(browserMutations, `la navegación de solo lectura hizo llamadas mutantes:\n${browserMutations.join('\n')}`).toEqual([]);
  });
});
