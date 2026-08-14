const { test, expect } = require('./fixtures/auth.fixture');
const { env, unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail, listAll } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards, expectToast } = require('./helpers/diagnostics.helper');
const {
  cleanupAll,
  findSafeCatedra,
  snapshotFormConfig,
  snapshotPreviasInscripciones,
  disableFormConfirmationEmail,
  linkPreviaMesa,
} = require('./helpers/cleanup.helper');
const { makePreviasImportFile } = require('./helpers/xlsx.helper');

const PASS = 'PwTest123!';
let dniCounter = 0;

function testDni() {
  dniCounter += 1;
  const entropy = (Date.now() + process.pid * 997 + dniCounter * 7919) % 19_000_000;
  return String(70_000_000 + entropy).slice(0, 8);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value ?? '').trim().toLocaleUpperCase('es-AR');
}

async function getPreviasCatalogos(request, admin) {
  // Dependencias reales consumidas por previasApi.js. Estos nombres también quedan
  // explícitos para que el release gate detecte si el frontend cambia su contrato.
  expectOk(await apiGet(request, 'global_obtener_listas', {}, admin), 'global_obtener_listas');
  const catalogos = expectOk(await apiGet(request, 'previas_catalogos', {}, admin), 'previas_catalogos');
  const condiciones = expectOk(await apiGet(request, 'previas_condiciones', {}, admin), 'previas_condiciones');
  const condicionesRows = condiciones.data?.condiciones || condiciones.condiciones || [];
  expect(Array.isArray(condicionesRows), 'previas_condiciones debe devolver data.condiciones como lista').toBe(true);
  expect(condicionesRows.length, 'previas_condiciones debe contener condiciones académicas').toBeGreaterThan(0);
  return catalogos.data || catalogos;
}

async function safeContext(request, admin) {
  const safe = findSafeCatedra();
  const catalogos = await getPreviasCatalogos(request, admin);
  const condicionPrevia = (catalogos.condiciones || []).find((row) => normalize(row.condicion) === 'PREVIA');
  expect(condicionPrevia, 'Debe existir la condición PREVIA para probar el módulo').toBeTruthy();

  const materias = expectOk(await apiGet(request, 'global_obtener_materias_por_curso', {
    id_curso: safe.id_curso,
    id_division: safe.id_division,
  }, admin), 'global_obtener_materias_por_curso');
  const rows = materias.data || materias.materias || materias;
  expect(Array.isArray(rows), 'global_obtener_materias_por_curso debe devolver lista').toBe(true);
  expect(rows.some((row) => Number(row.id_materia) === Number(safe.id_materia)), 'La materia de la cátedra segura debe estar en el catálogo global').toBe(true);

  return { safe, catalogos, condicionPrevia };
}

function createPayload(ctx, overrides = {}) {
  const { safe, condicionPrevia } = ctx;
  return {
    dni: testDni(),
    apellido: unique('PREVIAAPELLIDO'),
    nombre: 'ALUMNO TEST',
    cursando_id_curso: Number(safe.id_curso),
    cursando_id_division: Number(safe.id_division),
    id_materia: Number(safe.id_materia),
    materia_id_curso: Number(safe.id_curso),
    materia_id_division: Number(safe.id_division),
    id_condicion: Number(condicionPrevia.id_condicion),
    anio: 2091,
    fecha_carga: hoy(),
    inscripcion: 0,
    ...overrides,
  };
}

async function createPrevia(request, admin, ctx, overrides = {}) {
  const payload = createPayload(ctx, overrides);
  expectOk(await apiPost(request, 'previas_guardar', payload, admin), 'crear previa PWTEST');
  const listado = expectOk(await apiGet(request, 'previas_listar', {
    activo: 1,
    dni: payload.dni,
    anio: payload.anio,
    pagina: 1,
    por_pagina: 100,
  }, admin), 'resolver previa creada');
  const row = (listado.data || []).find((item) => Number(item.id_materia) === Number(payload.id_materia));
  expect(row, `No se encontró la previa creada para DNI ${payload.dni}`).toBeTruthy();
  return { id: Number(row.id_previa), row, payload };
}

async function searchRow(page, term, expectedText = '') {
  const search = page.getByPlaceholder('Búsqueda');
  await search.fill(String(term));
  await page.waitForTimeout(450);
  const row = page.getByRole('row').filter({ hasText: expectedText || String(term) }).last();
  await expect(row).toBeVisible();
  return row;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function modalField(dialog, label, selector) {
  const labelText = dialog.locator('.gm-label').filter({
    hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, 'i'),
  }).first();
  return labelText.locator('..').locator(selector).first();
}

function modalSelect(dialog, label) {
  return modalField(dialog, label, 'select');
}

function modalInput(dialog, label, type = 'input') {
  return modalField(dialog, label, type);
}

test.describe('07 · Previas', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('API: catálogos, listado/filtros, obtener, validaciones, alta múltiple, edición y duplicados', async ({ request }) => {
    const admin = await login(request);
    const ctx = await safeContext(request, admin);

    expectFail(await apiGet(request, 'previas_obtener', { id_previa: 0 }, admin), 422, /previa.*no es válida/i, 'obtener id inválido');
    expectFail(await apiGet(request, 'previas_obtener', { id_previa: 2147483647 }, admin), 404, /no se encontró/i, 'obtener inexistente');
    expectFail(await apiPost(request, 'previas_guardar', createPayload(ctx, { dni: '123' }), admin), 422, /DNI/i, 'DNI inválido');
    expectFail(await apiPost(request, 'previas_guardar', createPayload(ctx, { cursando_id_curso: 2147483647 }), admin), 422, /curso actual/i, 'curso actual inválido');
    expectFail(await apiPost(request, 'previas_guardar', createPayload(ctx, { id_materia: 2147483647 }), admin), 422, /materia seleccionada/i, 'materia inválida');
    expectFail(await apiPost(request, 'previas_guardar', createPayload(ctx, { anio: 1999 }), admin), 422, /año.*no es válido/i, 'año inválido');
    expectFail(await apiPost(request, 'previas_guardar', createPayload(ctx, { nota: 11 }), admin), 422, /nota.*1 y 10/i, 'nota inválida');

    const dni = testDni();
    const alumno = unique('PREVIASMULTI');
    const base = createPayload(ctx, { dni, apellido: alumno, nombre: 'DOS MATERIAS' });
    const multi = {
      dni,
      apellido: alumno,
      nombre: 'DOS MATERIAS',
      cursando_id_curso: base.cursando_id_curso,
      cursando_id_division: base.cursando_id_division,
      previas: [
        {
          id_materia: base.id_materia,
          materia_id_curso: base.materia_id_curso,
          materia_id_division: base.materia_id_division,
          id_condicion: base.id_condicion,
          anio: 2092,
          fecha_carga: base.fecha_carga,
          inscripcion: 0,
        },
        {
          id_materia: base.id_materia,
          materia_id_curso: base.materia_id_curso,
          materia_id_division: base.materia_id_division,
          id_condicion: base.id_condicion,
          anio: 2093,
          fecha_carga: base.fecha_carga,
          inscripcion: 0,
        },
      ],
    };
    const saved = expectOk(await apiPost(request, 'previas_guardar', multi, admin), 'alta múltiple');
    expect(Number(saved.total_guardadas)).toBe(2);

    const filters = [
      { dni },
      { busqueda: alumno },
      { id_condicion: base.id_condicion },
      { materia_id_curso: base.materia_id_curso },
      { materia_id_division: base.materia_id_division },
      { anio: 2092 },
      { inscripcion: 0 },
    ];
    for (const params of filters) {
      const result = expectOk(await apiGet(request, 'previas_listar', { activo: 1, pagina: 1, por_pagina: 100, ...params }, admin), `filtro ${JSON.stringify(params)}`);
      expect(Array.isArray(result.data)).toBe(true);
    }

    const rows = expectOk(await apiGet(request, 'previas_listar', { activo: 1, dni, pagina: 1, por_pagina: 100 }, admin), 'listar creadas').data;
    expect(rows).toHaveLength(2);
    const edit = rows[0];
    const detalle = expectOk(await apiGet(request, 'previas_obtener', { id_previa: edit.id_previa }, admin), 'obtener creada').data;
    expect(String(detalle.dni)).toBe(dni);

    const renamed = unique('PREVIAEDITADA');
    expectOk(await apiPost(request, 'previas_guardar', {
      ...createPayload(ctx),
      id_previa: Number(edit.id_previa),
      dni,
      apellido: renamed,
      nombre: 'EDITADA',
      anio: Number(edit.anio),
      fecha_carga: edit.fecha_carga || hoy(),
    }, admin), 'editar previa');
    const persisted = expectOk(await apiGet(request, 'previas_obtener', { id_previa: edit.id_previa }, admin), 'persistencia edición').data;
    expect(normalize(persisted.alumno)).toContain(normalize(renamed));

    expectFail(await apiPost(request, 'previas_guardar', {
      ...multi,
      previas: [multi.previas[0]],
    }, admin), 409, /ya existe una previa/i, 'duplicado natural');
  });

  test('API: baja/alta, aliases, motivo, inscripción se limpia y eliminación vinculada exige doble confirmación', async ({ request }) => {
    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    const created = await createPrevia(request, admin, ctx, { inscripcion: 1, anio: 2094 });

    expectFail(await apiPost(request, 'previas_cambiar_estado', {}, admin), 422, /ninguna previa válida/i, 'estado sin ids');
    expectOk(await apiPost(request, 'previas_cambiar_estado', {
      id_previa: created.id,
      activo: 0,
      motivo: 'carga incorrecta pwtest',
    }, admin), 'dar baja');
    let state = expectOk(await apiGet(request, 'previas_obtener', { id_previa: created.id }, admin), 'estado baja').data;
    expect(Number(state.activo)).toBe(0);
    expect(Number(state.inscripcion)).toBe(0);
    expect(normalize(state.motivo_baja)).toContain('CARGA INCORRECTA');
    expect(String(state.fecha_baja || '')).toMatch(/^\d{4}-\d{2}-\d{2}/);

    expectOk(await apiPost(request, 'previas_cambiar_estado', { id_previa: created.id, activo: 1 }, admin), 'dar alta');
    state = expectOk(await apiGet(request, 'previas_obtener', { id_previa: created.id }, admin), 'estado alta').data;
    expect(Number(state.activo)).toBe(1);
    expect(Number(state.inscripcion)).toBe(0);
    expect(state.fecha_baja).toBeFalsy();

    // Los aliases deben respetar su semántica incluso si el cliente no manda "activo".
    expectOk(await apiPost(request, 'previas_dar_baja', { id_previa: created.id }, admin), 'alias previas_dar_baja');
    state = expectOk(await apiGet(request, 'previas_obtener', { id_previa: created.id }, admin), 'estado alias baja').data;
    expect(Number(state.activo), 'previas_dar_baja debe dejar activo=0').toBe(0);

    expectOk(await apiPost(request, 'previas_dar_alta', { id_previa: created.id }, admin), 'alias previas_dar_alta');
    state = expectOk(await apiGet(request, 'previas_obtener', { id_previa: created.id }, admin), 'estado alias alta').data;
    expect(Number(state.activo), 'previas_dar_alta debe dejar activo=1').toBe(1);

    let check = expectOk(await apiPost(request, 'previas_verificar_eliminacion', { id_previa: created.id }, admin), 'verificar sin vínculos').data;
    expect(Boolean(check.vinculada)).toBe(false);

    const link = linkPreviaMesa(created.id);
    expect(Number(link.id_mesa)).toBeGreaterThan(0);
    check = expectOk(await apiPost(request, 'previas_verificar_eliminacion', { id_previa: created.id }, admin), 'verificar vinculada').data;
    expect(Boolean(check.vinculada)).toBe(true);
    expect(Number(check.resumen?.mesas_actuales || 0)).toBeGreaterThan(0);

    expectFail(await apiPost(request, 'previas_eliminar', { id_previa: created.id }, admin), 409, /vinculada.*confirm/i, 'eliminar vinculada sin confirmar');
    const deleted = expectOk(await apiPost(request, 'previas_eliminar', { id_previa: created.id, forzar: 1 }, admin), 'eliminar vinculada forzada');
    expect(Number(deleted.data?.eliminadas || 0)).toBe(1);
    expect(Boolean(deleted.data?.eliminacion_forzada)).toBe(true);
    expectFail(await apiGet(request, 'previas_obtener', { id_previa: created.id }, admin), 404, /no se encontró/i, 'previa realmente eliminada');
  });

  test('API: inscripción manual completa, permiso, baja individual y eliminación global restaurable', async ({ request }) => {
    snapshotPreviasInscripciones();
    snapshotFormConfig();
    disableFormConfirmationEmail();

    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    const dni = testDni();
    const alumno = unique('PREVIAINSC');
    const one = await createPrevia(request, admin, ctx, { dni, apellido: alumno, nombre: 'INSCRIPCION', anio: 2095 });
    const two = await createPrevia(request, admin, ctx, { dni, apellido: alumno, nombre: 'INSCRIPCION', anio: 2096 });

    expectFail(await apiGet(request, 'previas_obtener_materias_inscripcion', { id_previa: 0 }, admin), 422, /previa.*no es válida/i, 'materias inscripción id inválido');
    const pending = expectOk(await apiGet(request, 'previas_obtener_materias_inscripcion', { id_previa: one.id }, admin), 'materias inscribibles').data;
    expect(pending.materias.map((row) => Number(row.id_previa))).toEqual(expect.arrayContaining([one.id, two.id]));

    expectFail(await apiPost(request, 'previas_inscribir_manual', { ids_previas: [], gmail: 'pwtest@example.invalid' }, admin), 422, /al menos una materia/i, 'inscribir sin materias');
    expectFail(await apiPost(request, 'previas_inscribir_manual', { ids_previas: [one.id], gmail: 'NO-ES-EMAIL' }, admin), 422, /email válido/i, 'email inválido');

    const inscription = expectOk(await apiPost(request, 'previas_inscribir_manual', {
      ids_previas: [one.id, two.id],
      gmail: 'lerna-pwtest@example.invalid',
    }, admin), 'inscripción manual');
    expect(Number(inscription.data?.marcadas || 0)).toBe(2);
    expect(Boolean(inscription.data?.email_enviado)).toBe(false);

    for (const id of [one.id, two.id]) {
      const row = expectOk(await apiGet(request, 'previas_obtener', { id_previa: id }, admin), `inscripción ${id}`).data;
      expect(Number(row.inscripcion)).toBe(1);
    }

    expectFail(await apiGet(request, 'previas_obtener_materias_inscripcion', { id_previa: one.id }, admin), 409, /ya figura como inscripta/i, 'no reinscribir previa');

    const permit = expectOk(await apiGet(request, 'previas_obtener_permiso_examen', { id_previa: one.id }, admin), 'permiso examen');
    const permitRows = permit.data?.materias || permit.data || [];
    expect(Array.isArray(permitRows)).toBe(true);
    expect(permitRows.length).toBeGreaterThan(0);

    expectOk(await apiPost(request, 'previas_quitar_inscripcion', { id_previa: one.id }, admin), 'quitar inscripción individual');
    let row = expectOk(await apiGet(request, 'previas_obtener', { id_previa: one.id }, admin), 'previa sin inscripción').data;
    expect(Number(row.inscripcion)).toBe(0);
    expectFail(await apiPost(request, 'previas_quitar_inscripcion', { id_previa: one.id }, admin), 409, /no figura como inscripta/i, 'baja duplicada');

    expectFail(await apiPost(request, 'previas_quitar_todas_inscripciones', {}, admin), 422, /confirmación/i, 'global sin confirmación');
    const all = expectOk(await apiPost(request, 'previas_quitar_todas_inscripciones', { confirmar: 1 }, admin), 'eliminar todas inscripciones');
    expect(Number(all.data?.previas_encontradas || 0)).toBeGreaterThanOrEqual(1);
    row = expectOk(await apiGet(request, 'previas_obtener', { id_previa: two.id }, admin), 'segunda sin inscripción').data;
    expect(Number(row.inscripcion)).toBe(0);
  });

  test('API: plantilla, preview e importación Excel crean y actualizan por la clave académica', async ({ request }) => {
    const admin = await login(request);
    const ctx = await safeContext(request, admin);

    const template = expectOk(await apiGet(request, 'previas_plantilla_importacion', {}, admin), 'plantilla importación');
    expect(String(template.archivo_base64 || template.data?.archivo_base64 || '')).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(String(template.nombre_archivo || template.data?.nombre_archivo || '')).toMatch(/\.xlsx$/i);

    expectFail(await apiPost(request, 'previas_previsualizar_excel', {}, admin), 422, /archivo|Excel/i, 'preview sin archivo');
    expectFail(await apiPost(request, 'previas_importar_excel', { nombre_archivo: 'datos.txt', archivo_base64: 'QQ==' }, admin), 422, /xlsx/i, 'import extensión inválida');

    const dni = testDni();
    const alumno = unique('PREVIAIMPORT');
    const row = [
      dni,
      `${alumno}, ALUMNO`,
      ctx.safe.nombre_curso,
      ctx.safe.nombre_division,
      ctx.safe.materia,
      ctx.safe.nombre_curso,
      ctx.safe.nombre_division,
      'PREVIA',
      '2097',
      hoy(),
    ];
    const buffer = makePreviasImportFile(row);
    const body = {
      nombre_archivo: 'pwtest_previas.xlsx',
      archivo_base64: buffer.toString('base64'),
    };

    const preview = expectOk(await apiPost(request, 'previas_previsualizar_excel', body, admin), 'preview válido');
    expect(Number(preview.data?.resumen?.total_procesadas || preview.data?.total_procesadas || 0)).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(preview.data?.filas || preview.data?.preview || [])).toBe(true);

    const imported = expectOk(await apiPost(request, 'previas_importar_excel', body, admin), 'importar nueva');
    expect(Number(imported.data?.nuevas || 0)).toBe(1);

    let listed = expectOk(await apiGet(request, 'previas_listar', { activo: 1, dni, anio: 2097, pagina: 1, por_pagina: 100 }, admin), 'importada listada').data;
    expect(listed).toHaveLength(1);
    expect(normalize(listed[0].alumno)).toContain(normalize(alumno));

    const alumnoEdit = unique('PREVIAIMPORTUPDATE');
    const updateBuffer = makePreviasImportFile([
      dni,
      `${alumnoEdit}, ALUMNO`,
      ctx.safe.nombre_curso,
      ctx.safe.nombre_division,
      ctx.safe.materia,
      ctx.safe.nombre_curso,
      ctx.safe.nombre_division,
      'PREVIA',
      '2097',
      hoy(),
    ]);
    const updated = expectOk(await apiPost(request, 'previas_importar_excel', {
      nombre_archivo: 'pwtest_previas_update.xlsx',
      archivo_base64: updateBuffer.toString('base64'),
    }, admin), 'importar actualización');
    expect(Number(updated.data?.actualizadas || 0)).toBe(1);

    listed = expectOk(await apiGet(request, 'previas_listar', { activo: 1, dni, anio: 2097, pagina: 1, por_pagina: 100 }, admin), 'actualizada listada').data;
    expect(normalize(listed[0].alumno)).toContain(normalize(alumnoEdit));
  });

  test('API: rol vista puede leer pero no mutar Previas y todas las mutaciones exigen CSRF', async ({ request }) => {
    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    const created = await createPrevia(request, admin, ctx, { anio: 2098 });
    const permitCreated = await createPrevia(request, admin, ctx, {
      dni: testDni(),
      apellido: unique('PREVIASVISTAPERMIT'),
      nombre: 'PERMISO VISTA',
      anio: 2086,
      inscripcion: 1,
    });

    const vistaUser = unique('PREVIASVISTA');
    expectOk(await apiPost(request, 'configuracion_usuarios_guardar', {
      usuario: vistaUser,
      rol: 'vista',
      activo: 1,
      contrasena: PASS,
    }, admin), 'crear usuario vista previas');
    const vista = await login(request, vistaUser, PASS);

    for (const [action, params] of [
      ['previas_catalogos', {}],
      ['previas_condiciones', {}],
      ['previas_listar', { activo: 1, pagina: 1, por_pagina: 5 }],
      ['previas_obtener_permiso_examen', { id_previa: permitCreated.id }],
    ]) {
      expectOk(await apiGet(request, action, params, vista), `vista lee ${action}`);
    }

    for (const [action, params] of [
      ['previas_obtener', { id_previa: created.id }],
      ['previas_obtener_materias_inscripcion', { id_previa: created.id }],
      ['previas_plantilla_importacion', {}],
    ]) {
      expectFail(await apiGet(request, action, params, vista), 403, /permisos/i, `vista bloqueado ${action}`);
    }

    const mutations = [
      ['previas_guardar', createPayload(ctx)],
      ['previas_cambiar_estado', { id_previa: created.id, activo: 0 }],
      ['previas_dar_baja', { id_previa: created.id }],
      ['previas_dar_alta', { id_previa: created.id }],
      ['previas_inscribir_manual', { ids_previas: [created.id], gmail: 'pwtest@example.invalid' }],
      ['previas_quitar_inscripcion', { id_previa: created.id }],
      ['previas_quitar_todas_inscripciones', { confirmar: 1 }],
      ['previas_eliminar', { id_previa: created.id }],
      ['previas_importar_excel', { nombre_archivo: 'x.xlsx', archivo_base64: 'QQ==' }],
    ];
    for (const [action, data] of mutations) {
      expectFail(await apiPost(request, action, data, vista), 403, /permisos/i, `vista bloqueado ${action}`);
      expectFail(await apiPost(request, action, data, admin, { csrf: false, headers: { 'X-Requested-With': 'NotAjax' } }), 403, /CSRF/i, `CSRF bloquea ${action}`);
    }

    // El rol vista es estrictamente GET-only: estos POST auxiliares también quedan bloqueados.
    expectFail(
      await apiPost(request, 'previas_verificar_eliminacion', { id_previa: created.id }, vista),
      403,
      /permisos/i,
      'vista no verifica eliminación'
    );
    expectFail(
      await apiPost(request, 'previas_previsualizar_excel', { nombre_archivo: 'x.xlsx', archivo_base64: 'QQ==' }, vista),
      403,
      /permisos/i,
      'vista no previsualiza importaciones'
    );
  });

  test('UI: alta con validaciones, materias dinámicas, edición, búsqueda, filtros, pestañas y paginación', async ({ page, request }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    await loginPageByApi(page);
    await page.goto('/previas');
    await expect(page.getByText('Mesas · Previas', { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Listado de previas' })).toBeVisible();

    await page.getByRole('button', { name: /Agregar previa/i }).click();
    let dialog = page.getByRole('dialog', { name: 'Agregar Previa(s)' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar a materias' }).click();
    await dialog.getByRole('button', { name: /Guardar previa/i }).click();
    await expectToast(page, /Ingresá el DNI del alumno/i);
    await dialog.getByRole('tab', { name: /Datos del alumno/i }).click();

    const dni = testDni();
    const apellido = unique('PREVIAUI');
    await modalInput(dialog, 'DNI').fill(dni);
    await modalInput(dialog, 'Apellido').fill(apellido);
    await modalInput(dialog, 'Nombre').fill('ALUMNO UI');
    await modalSelect(dialog, 'Curso actual').selectOption(String(ctx.safe.id_curso));
    await modalSelect(dialog, 'División actual').selectOption(String(ctx.safe.id_division));

    await dialog.getByRole('tab', { name: /Materias previas/i }).click();
    await modalSelect(dialog, 'Materia: curso').selectOption(String(ctx.safe.id_curso));
    await modalSelect(dialog, 'Materia: división').selectOption(String(ctx.safe.id_division));
    const materiaSelect = modalSelect(dialog, 'Materia');
    await expect.poll(async () => materiaSelect.locator('option').count()).toBeGreaterThan(1);
    await materiaSelect.selectOption(String(ctx.safe.id_materia));
    await modalSelect(dialog, 'Condición').selectOption(String(ctx.condicionPrevia.id_condicion));
    await modalInput(dialog, 'Año (previa)').fill('2099');
    await modalInput(dialog, 'Fecha carga').fill(hoy());

    const materiaTabs = dialog.getByRole('tablist', { name: 'Materias previas cargadas' });
    await dialog.getByRole('button', { name: 'Otra', exact: true }).click();
    await expect(materiaTabs.getByRole('tab')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: 'Quitar materia' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Quitar materia' }).click();
    await expect(materiaTabs.getByRole('tab')).toHaveCount(1);

    await dialog.getByRole('button', { name: /Guardar previa/i }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, /Previa guardada correctamente/i);

    let row = await searchRow(page, dni, apellido);
    await expect(row).toContainText('PREVIA');
    await row.getByTitle('Editar previa').click();
    dialog = page.getByRole('dialog', { name: 'Editar Previa' });
    await expect(dialog).toBeVisible();
    await modalInput(dialog, 'Nombre').fill('ALUMNO UI EDITADO');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    row = await searchRow(page, dni, apellido);
    await expect(row).toContainText('ALUMNO UI EDITADO');

    const filterSelects = page.locator('.previas-filterSelects select');
    await expect(filterSelects).toHaveCount(3);
    await filterSelects.nth(0).selectOption(String(ctx.condicionPrevia.id_condicion));
    await filterSelects.nth(1).selectOption(String(ctx.safe.id_curso));
    await filterSelects.nth(2).selectOption(String(ctx.safe.id_division));
    await expect(page.getByTitle('Limpiar filtros de condición, curso y división')).toBeVisible();
    await page.getByTitle('Limpiar filtros de condición, curso y división').click();
    await expect(filterSelects.nth(0)).toHaveValue('');

    const search = page.getByPlaceholder('Búsqueda');
    await expect(search).toHaveValue(dni);
    await page.getByTitle('Limpiar búsqueda').click();
    await expect(search).toHaveValue('');

    await page.getByRole('button', { name: 'Inscriptos', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Listado de previas' })).toBeVisible();
    await page.getByRole('button', { name: 'Dados de baja', exact: true }).click();
    await page.getByLabel('Cambiar vista de previas').getByRole('button', { name: 'Previas', exact: true }).click();

    const next = page.getByRole('button', { name: 'Siguiente' });
    if (await next.isEnabled()) {
      await next.click();
      await expect(page.getByRole('button', { name: 'Anterior' })).toBeEnabled();
      await page.getByRole('button', { name: 'Anterior' }).click();
    }

    guard.assertClean('Previas UI alta/edición/filtros');
  });

  test('UI: inscripción manual real, permiso de examen, baja individual y limpieza global con doble confirmación', async ({ page, request }) => {
    snapshotPreviasInscripciones();
    snapshotFormConfig();
    disableFormConfirmationEmail();

    const guard = attachRuntimeGuards(page);
    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    const created = await createPrevia(request, admin, ctx, { anio: 2100 });

    await loginPageByApi(page);
    await page.goto('/previas');
    let row = await searchRow(page, created.payload.dni, created.payload.apellido);
    await row.getByTitle('Inscribir manualmente').click();
    let dialog = page.getByRole('dialog', { name: 'Confirmar inscripción' });
    await expect(dialog).toBeVisible();
    const email = dialog.locator('input[type="email"]');
    await email.fill('correo-invalido');
    await expect(dialog.getByRole('button', { name: 'Inscribir' })).toBeDisabled();
    await email.fill('lerna-pwtest@example.invalid');
    await expect(dialog.getByRole('button', { name: 'Inscribir' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Inscribir' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Inscriptos', exact: true }).click();
    row = await searchRow(page, created.payload.dni, created.payload.apellido);
    await expect(row).toContainText('Sí');

    // La previa no tiene mesa/período, por lo que debe pedir mes/año antes de imprimir.
    await row.getByTitle('Imprimir permiso de examen').click();
    dialog = page.getByRole('dialog', { name: 'Turno del permiso de examen' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Imprimir permiso' }).click();
    await expectToast(page, /mes|turno/i);
    await modalSelect(dialog, 'Mes / turno').selectOption('DICIEMBRE');
    await modalInput(dialog, 'Año').fill('2099');
    const popupPromise = page.waitForEvent('popup');
    await dialog.getByRole('button', { name: 'Imprimir permiso' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.close().catch(() => {});
    await expect(dialog).toBeHidden();

    row = await searchRow(page, created.payload.dni, created.payload.apellido);
    await row.getByTitle('Borrar inscripción').click();
    dialog = page.getByRole('dialog', { name: 'Borrar inscripción' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Borrar inscripción' }).click();
    await expect(dialog).toBeHidden();

    // Reinscribir por API para probar el flujo UI de eliminación global real.
    expectOk(await apiPost(request, 'previas_inscribir_manual', {
      ids_previas: [created.id],
      gmail: 'lerna-pwtest@example.invalid',
    }, admin), 'reinscribir para limpieza global');
    await page.reload();
    await page.getByRole('button', { name: 'Inscriptos', exact: true }).click();
    const deleteAllButton = page.locator('.previas-footer').getByTitle('Eliminar todas las inscripciones');
    await expect(deleteAllButton).toBeVisible();
    await deleteAllButton.click();
    dialog = page.getByRole('dialog', { name: 'Eliminar todos los inscriptos' });
    const confirm = dialog.getByRole('button', { name: 'Eliminar todos' });
    await expect(confirm).toBeDisabled();
    const globalCheck = dialog.getByLabel('Confirmo que quiero eliminar todas las inscripciones.');
    await dialog.locator('label').filter({ hasText: /Confirmo que quiero eliminar todas las inscripciones/i }).click();
    await expect(globalCheck).toBeChecked();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('No hay previas inscriptas.')).toBeVisible();

    guard.assertClean('Previas UI inscripción/permiso/limpieza global');
  });

  test('UI: baja/alta, motivo y eliminación vinculada exigen confirmaciones correctas', async ({ page, request }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    const created = await createPrevia(request, admin, ctx, { anio: 2089 });

    await loginPageByApi(page);
    await page.goto('/previas');
    let row = await searchRow(page, created.payload.dni, created.payload.apellido);
    await row.getByTitle('Dar de baja previa').click();
    let dialog = page.getByRole('dialog', { name: 'Dar de baja previa' });
    const reason = dialog.locator('textarea').first();
    await expect(reason).toBeVisible();
    await reason.fill('motivo pwtest de baja');
    await dialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Dados de baja', exact: true }).click();
    row = await searchRow(page, created.payload.dni, created.payload.apellido);
    await expect(row).toContainText('MOTIVO PWTEST DE BAJA');
    await row.getByTitle('Dar de alta').click();
    dialog = page.getByRole('dialog', { name: 'Dar de alta previa' });
    await dialog.getByRole('button', { name: 'Dar de alta' }).click();
    await expect(dialog).toBeHidden();

    await page.getByLabel('Cambiar vista de previas').getByRole('button', { name: 'Previas', exact: true }).click();
    row = await searchRow(page, created.payload.dni, created.payload.apellido);
    linkPreviaMesa(created.id);
    await row.getByTitle('Eliminar previa').click();
    dialog = page.getByRole('dialog', { name: /Eliminar previa vinculada/i });
    const linkedCheck = dialog.getByLabel('Confirmar eliminación de una previa vinculada.');
    await expect(linkedCheck).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Eliminar vinculada' });
    await expect(confirm).toBeDisabled();
    await dialog.locator('label').filter({ hasText: /Confirmar eliminación de una previa vinculada/i }).click();
    await expect(linkedCheck).toBeChecked();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByPlaceholder('Búsqueda')).toHaveValue(created.payload.dni);
    await expect(page.getByRole('row').filter({ hasText: created.payload.apellido })).toHaveCount(0);

    guard.assertClean('Previas UI estados/eliminación vinculada');
  });

  test('UI: exportación actual/todos e importación con plantilla, validación, preview y persistencia', async ({ page, request }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(request);
    const ctx = await safeContext(request, admin);
    const created = await createPrevia(request, admin, ctx, { anio: 2088 });

    await loginPageByApi(page);
    await page.goto('/previas');
    await searchRow(page, created.payload.dni, created.payload.apellido);

    await page.getByRole('button', { name: /Exportar \/ importar/i }).first().click();
    let dialog = page.getByRole('dialog', { name: 'Exportar previas' });
    const currentScope = dialog.getByLabel('Exportar solo actual');
    await dialog.locator('label').filter({ hasText: /Exportar solo actual/i }).click();
    await expect(currentScope).toBeChecked();
    await dialog.getByLabel('Excel').check();
    let downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByRole('button', { name: /Exportar \/ importar/i }).first().click();
    dialog = page.getByRole('dialog', { name: 'Exportar previas' });
    const allScope = dialog.getByLabel('Exportar todos los registros');
    await dialog.locator('label').filter({ hasText: /Exportar todos los registros/i }).click();
    await expect(allScope).toBeChecked();
    await dialog.getByLabel('Excel').check();
    downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByRole('button', { name: /Exportar \/ importar/i }).first().click();
    dialog = page.getByRole('dialog', { name: 'Exportar previas' });
    await dialog.getByRole('button', { name: 'Importar' }).click();
    dialog = page.getByRole('dialog', { name: 'Importación masiva de previas' });
    await expect(dialog).toBeVisible();

    downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Descargar Excel modelo' }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.xlsx$/i);

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'mal.txt', mimeType: 'text/plain', buffer: Buffer.from('mal') });
    await expectToast(page, /extensión \.xlsx/i);

    const importedDni = testDni();
    const importedName = unique('PREVIAUIIMPORT');
    const importBuffer = makePreviasImportFile([
      importedDni,
      `${importedName}, ALUMNO`,
      ctx.safe.nombre_curso,
      ctx.safe.nombre_division,
      ctx.safe.materia,
      ctx.safe.nombre_curso,
      ctx.safe.nombre_division,
      'PREVIA',
      '2087',
      hoy(),
    ]);
    await fileInput.setInputFiles({
      name: 'previas_pwtest.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: importBuffer,
    });
    await expect(dialog.getByText('Vista previa antes de importar', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Resumen de vista previa')).toContainText('Nuevas:');
    await dialog.getByRole('button', { name: 'Confirmar e importar' }).click();
    await expectToast(page, /importación|importad/i);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    const imported = await searchRow(page, importedDni, importedName);
    await expect(imported).toContainText(ctx.safe.materia);

    guard.assertClean('Previas UI exportar/importar');
  });
});
