const { test, expect } = require('./fixtures/auth.fixture');
const { env, unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { findSafeCatedra, cleanupAll } = require('./helpers/cleanup.helper');
const { createVistaAuth } = require('./helpers/roles.helper');
const { loginPageByApi } = require('./helpers/auth.helper');

// Requiere haber aplicado migraciones/2026-11-11_previas_permisos.sql
// al tenant local de pruebas. Nunca ejecutar contra producción.
function testDni() {
  return String(75000000 + (Date.now() % 15000000)).slice(0, 8);
}

async function crearInscriptas(request, admin, cantidad = 2) {
  const safe = findSafeCatedra();
  const datos = expectOk(await apiGet(request, 'previas_catalogos', {}, admin));
  const condiciones = datos.data?.condiciones || [];
  const previa = condiciones.find((c) => String(c.condicion).trim().toUpperCase() === 'PREVIA');
  expect(previa, 'Falta la condición PREVIA en el catálogo').toBeTruthy();
  const dni = testDni();
  const apellido = unique('PERMISOS');
  const ids = [];
  for (let i = 0; i < cantidad; i += 1) {
    const payload = {
      dni,
      apellido,
      nombre: 'ALUMNO TEST',
      cursando_id_curso: Number(safe.id_curso),
      cursando_id_division: Number(safe.id_division),
      id_materia: Number(safe.id_materia),
      materia_id_curso: Number(safe.id_curso),
      materia_id_division: Number(safe.id_division),
      id_condicion: Number(previa.id_condicion),
      anio: 2081 + i,
      fecha_carga: new Date().toISOString().slice(0, 10),
      inscripcion: 1,
    };
    expectOk(await apiPost(request, 'previas_guardar', payload, admin), 'alta previa inscripta para permisos');
    const result = expectOk(await apiGet(request, 'previas_listar', {
      activo: 1, inscripcion: 1, dni, anio: payload.anio, pagina: 1, por_pagina: 100,
    }, admin), 'obtener previa recién creada');
    const row = result.data.find((r) => Number(r.id_materia) === Number(safe.id_materia));
    expect(row, `Falta la previa de prueba año ${payload.anio}`).toBeTruthy();
    ids.push(Number(row.id_previa));
  }
  return { dni, apellido, ids };
}

async function filasPorDni(request, admin, dni, periodo, estado = '') {
  const result = expectOk(await apiGet(request, 'previas_listar', {
    activo: 1, inscripcion: 1, dni, periodo_permiso: periodo,
    ...(estado ? { estado_permiso: estado } : {}),
    pagina: 1, por_pagina: 100,
  }, admin), `listado de permisos ${estado || 'todos'} / ${periodo}`);
  return result.data;
}

test.describe('16 · Entrega de permisos de examen', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('API: DNI único por turno, filtros del servidor, historial por turno, validaciones, resumen y permisos de rol', async ({ request }) => {
    const admin = await login(request);
    const alumno = await crearInscriptas(request, admin);
    const marzo = 'MARZO/2099';
    const abril = 'ABRIL/2099';

    expect((await filasPorDni(request, admin, alumno.dni, marzo)).map((r) => r.permiso_estado))
      .toEqual(['pendiente', 'pendiente']);
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'pendiente')).toHaveLength(2);
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'entregado')).toHaveLength(0);

    expectFail(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: 'INVALIDO', estado: 'impreso',
    }, admin), 422, /inválido/i, 'turno inválido');
    expectFail(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: marzo, estado: 'otro',
    }, admin), 422, /inválido/i, 'estado inválido');
    expectFail(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: 2147483647, periodo: marzo, estado: 'entregado',
    }, admin), 409, /ya no figura inscripto/i, 'previa no inscripta');
    expectFail(await apiGet(request, 'previas_listar', {
      inscripcion: 1, periodo_permiso: 'MARZO/2099', estado_permiso: 'inyeccion',
    }, admin), 422, /inválido/i, 'estado de filtro inválido');
    expectFail(await apiGet(request, 'previas_permisos_resumen', { periodo: '2099-03' }, admin), 422, /válidos/i);

    const antes = expectOk(await apiGet(request, 'previas_permisos_resumen', { periodo: marzo }, admin)).data;
    expect(Number(antes.total)).toBeGreaterThanOrEqual(1);

    expectOk(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: marzo, estado: 'impreso',
    }, admin));
    const impresos = await filasPorDni(request, admin, alumno.dni, marzo);
    expect(impresos).toHaveLength(2);
    expect(impresos.every((r) => r.permiso_estado === 'impreso' && r.permiso_impreso_en)).toBe(true);
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'sin_entregar')).toHaveLength(2);
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'pendiente')).toHaveLength(0);

    // Un nuevo turno nunca hereda el permiso del turno anterior.
    expect((await filasPorDni(request, admin, alumno.dni, abril)).every((r) => r.permiso_estado === 'pendiente')).toBe(true);

    expectOk(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[1], periodo: marzo, estado: 'entregado',
    }, admin));
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'entregado')).toHaveLength(2);
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'sin_entregar')).toHaveLength(0);
    const entregados = await filasPorDni(request, admin, alumno.dni, marzo);
    expect(entregados.every((r) => r.permiso_entregado_en && r.permiso_impreso_en)).toBe(true);
    const despues = expectOk(await apiGet(request, 'previas_permisos_resumen', { periodo: marzo }, admin)).data;
    expect(Number(despues.entregados)).toBe(Number(antes.entregados) + 1);
    expect(Number(despues.total)).toBe(Number(antes.total)); // alumnos únicos, no materias.

    // Volver a impreso quita la entrega y volver a pendiente deja el registro limpio.
    expectOk(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: marzo, estado: 'impreso',
    }, admin));
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'impreso')).toHaveLength(2);
    expectOk(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: marzo, estado: 'pendiente',
    }, admin));
    expect(await filasPorDni(request, admin, alumno.dni, marzo, 'pendiente')).toHaveLength(2);
    expect((await filasPorDni(request, admin, alumno.dni, abril)).every((r) => r.permiso_estado === 'pendiente')).toBe(true);

    const vista = (await createVistaAuth(request, admin, 'PERMISOVISTA')).auth;
    expectOk(await apiGet(request, 'previas_permisos_resumen', { periodo: marzo }, vista));
    expectOk(await apiGet(request, 'previas_listar', { inscripcion: 1, periodo_permiso: marzo, dni: alumno.dni }, vista));
    expectFail(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: marzo, estado: 'entregado',
    }, vista), 403, /permisos/i, 'vista no modifica');
    expectFail(await apiPost(request, 'previas_permisos_actualizar', {
      id_previa: alumno.ids[0], periodo: marzo, estado: 'entregado',
    }, admin, { csrf: false, headers: { 'X-Requested-With': 'NotAjax' } }), 403, /CSRF/i, 'mutación protegida');
  });

  test('UI: filtro compacto de permisos (sin barra de turnos ni resumen) y persistencia', async ({ page, request }) => {
    const admin = await login(request);
    const alumno = await crearInscriptas(request, admin, 1);
    await loginPageByApi(page);
    await page.goto('/previas');
    await page.getByRole('button', { name: 'Inscriptos', exact: true }).click();

    // No debe quedar la barra grande que tenía turno, año y contadores.
    await expect(page.getByLabel('Mes de examen')).toHaveCount(0);
    await expect(page.getByLabel('Año del permiso')).toHaveCount(0);
    await expect(page.getByText('Alumnos del turno:')).toHaveCount(0);
    await expect(page.locator('.previas-permisos-toolbar')).toHaveCount(0);
    const filtro = page.getByLabel('Filtrar permisos por estado');
    await expect(filtro).toBeVisible();
    await expect(filtro.locator('option')).toHaveText(['Todos', 'PENDIENTE', 'IMPRESO', 'ENTREGADO']);
    await page.getByPlaceholder('Búsqueda').fill(alumno.dni);
    const selector = page.getByRole('combobox', { name: new RegExp(`Estado del permiso de .*DNI ${alumno.dni}`) });
    await expect(selector).toBeVisible();
    await expect(selector).toHaveValue('pendiente');
    await expect(selector.locator('option')).toHaveText(['PENDIENTE', 'IMPRESO', 'ENTREGADO']);

    // Capturamos el turno que la app determina internamente para verificar DB sin necesitar selector visual.
    const guardado = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('action=previas_permisos_actualizar'));
    await selector.selectOption('impreso');
    const solicitud = await guardado;
    const periodo = solicitud.postDataJSON()?.periodo;
    expect(periodo).toMatch(/^[A-Z]+\/20\d{2}$/);
    await expect(selector).toHaveValue('impreso');
    expect(await filasPorDni(request, admin, alumno.dni, periodo, 'impreso')).toHaveLength(1);

    await filtro.selectOption('pendiente');
    await expect(page.getByText('No hay permisos con ese estado.')).toBeVisible();
    await filtro.selectOption('impreso');
    await expect(selector).toHaveValue('impreso');
    await filtro.selectOption('entregado');
    await expect(page.getByText('No hay permisos con ese estado.')).toBeVisible();
    await filtro.selectOption('');
    await selector.selectOption('entregado');
    await expect(selector).toHaveValue('entregado');
    expect(await filasPorDni(request, admin, alumno.dni, periodo, 'entregado')).toHaveLength(1);

    await page.reload();
    await page.getByRole('button', { name: 'Inscriptos', exact: true }).click();
    await page.getByPlaceholder('Búsqueda').fill(alumno.dni);
    await expect(selector).toHaveValue('entregado');
    await expect(page.getByTitle('Imprimir permiso de examen').first()).toBeVisible();
  });
});
