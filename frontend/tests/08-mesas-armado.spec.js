const { test, expect } = require('./fixtures/auth.fixture');
const { unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { cleanupAll, addMesasTeacherBlock } = require('./helpers/cleanup.helper');
const {
  setupMesasFixture,
  createArmado,
  currentState,
  assertCoreInvariants,
  assertCorrelationOrder,
  assertWorkshopExpansion,
  fixtureRole,
} = require('./helpers/mesas.helper');

const PASS = 'PwTest123!';

test.describe('08 · Mesas · contratos y armado completo', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterEach(() => cleanupAll({ silent: true }));

  test('API: autenticación, permisos, parámetros, aliases y validaciones del rango', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);

    const params = expectOk(await apiGet(request, 'mesas_armado_parametros', {}, admin), 'parámetros armado');
    const data = params.data || params;
    expect(Number(data.total_previas_para_armar ?? data.total_previas_elegibles ?? data.total_previas ?? 0)).toBeGreaterThanOrEqual(fixture.previas.length);
    expect(Array.isArray(data.turnos || [])).toBe(true);

    expectFail(await apiPost(request, 'mesas_armado_crear', {
      fecha_inicio: 'fecha-mala', fecha_fin: fixture.dates[1], modo_turnos: 'combinado',
    }, admin), [400, 422], /fecha/i, 'fecha inválida');
    expectFail(await apiPost(request, 'mesas_armado_crear', {
      fecha_inicio: fixture.dates[2], fecha_fin: fixture.dates[0], modo_turnos: 'combinado',
    }, admin), [400, 422], /fecha.*fin|rango/i, 'rango invertido');

    const vistaName = unique('VISTAMESAS');
    expectOk(await apiPost(request, 'registro', { nombre: vistaName, contrasena: PASS, rol: 'vista' }, admin), 'crear vista mesas');
    const vista = await login(request, vistaName, PASS);
    expectOk(await apiGet(request, 'mesas_examen_listar', { pagina: 1, por_pagina: 10 }, vista), 'vista puede listar mesas');
    expectOk(await apiGet(request, 'mesas_historial_listar', {}, vista), 'vista puede listar historial');
    expectFail(await apiPost(request, 'mesas_armado_crear', {
      fecha_inicio: fixture.dates[0], fecha_fin: fixture.dates[4], modo_turnos: 'combinado',
    }, vista), 403, /permisos/i, 'vista no puede armar');
    expectFail(await apiPost(request, 'mesas_resultado_guardar_nota', {
      id_previa: fixture.previas[0].id_previa, nota: 7,
    }, vista), 403, /permisos/i, 'vista no puede guardar notas');
  });

  test('Elegibilidad vacía: sin previas inscriptas responde 422 y no crea residuos', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    expectOk(await apiPost(request, 'previas_quitar_todas_inscripciones', { confirmar: 1 }, admin), 'quitar inscripciones del fixture');
    expectFail(await apiPost(request, 'mesas_armado_crear', {
      fecha_inicio: fixture.dates[0], fecha_fin: fixture.dates.at(-1),
      limpiar_borrador: true, excluir_fines_semana: true, tipo_armado: 'area', modo_turnos: 'combinado',
    }, admin), 422, /no hay previas inscriptas/i, 'armado sin elegibles');
    const state = currentState();
    expect(state.mesas).toHaveLength(0);
    expect(state.grupos).toHaveLength(0);
    expect(state.no_agrupadas).toHaveLength(0);
  });

  test('Área: elegibilidad, numeración, talleres, correlativas, choques y grupos 2–4', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    const created = await createArmado(request, admin, fixture, 'area');
    expect(created.data.calendarizacion_ejecutada).toBe(true);
    expect(Number(created.data.total_previas_procesadas || 0)).toBe(fixture.previas.length);

    const state = currentState();
    assertCoreInvariants(state, { mode: 'area' });
    assertCorrelationOrder(state, fixture);
    assertWorkshopExpansion(state, fixture);
    expect(String(state.rango?.[0]?.tipo_armado || '')).toMatch(/area/i);

    const expectedIds = new Set(fixture.previas.map((row) => Number(row.id_previa)));
    const generatedIds = new Set(state.mesas.map((row) => Number(row.id_previa)));
    for (const id of expectedIds) expect(generatedIds.has(id), `Previa fixture ${id} debe estar armada`).toBe(true);
  });

  test('Docentes: conserva áreas por número, permite consolidación docente y usa su propio editor', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    const created = await createArmado(request, admin, fixture, 'docentes');
    expect(created.data.calendarizacion_ejecutada).toBe(true);

    const state = currentState();
    assertCoreInvariants(state, { mode: 'docentes' });
    assertCorrelationOrder(state, fixture);
    assertWorkshopExpansion(state, fixture);
    expect(String(state.rango?.[0]?.tipo_armado || '')).toMatch(/docente/i);

    const group = state.grupos.find((row) => Number(row.numero_grupo) > 0);
    expect(group, 'El armado docente debe producir al menos un grupo').toBeTruthy();
    const edit = expectOk(await apiGet(request, 'mesas_editar_obtener', {
      tipo: 'grupo', numero_grupo: group.numero_grupo,
    }, admin), 'enrutamiento edición docente');
    expect(edit.data || edit).toBeTruthy();
  });

  test('Modos de turno: mañana y tarde restringen todos los slots calendarizados', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const morningIds = fixture.turnos
      .filter((turn) => Number(turn.id_turno) === 1 || /manana|matut/.test(normalized(turn.turno)))
      .map((turn) => Number(turn.id_turno));
    const afternoonIds = fixture.turnos
      .filter((turn) => Number(turn.id_turno) === 2 || /tarde|vesp/.test(normalized(turn.turno)))
      .map((turn) => Number(turn.id_turno));
    expect(morningIds.length, 'Debe existir turno mañana activo').toBeGreaterThan(0);
    expect(afternoonIds.length, 'Debe existir turno tarde activo').toBeGreaterThan(0);

    await createArmado(request, admin, fixture, 'area', { modo_turnos: 'manana' });
    let scheduled = currentState().mesas.filter((row) => row.fecha_mesa && Number(row.id_turno) > 0);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every((row) => morningIds.includes(Number(row.id_turno)))).toBe(true);

    expectOk(await apiPost(request, 'mesas_armado_eliminar_mesas', { guardar_historial: 0 }, admin), 'limpiar armado mañana');
    await createArmado(request, admin, fixture, 'area', { modo_turnos: 'tarde' });
    scheduled = currentState().mesas.filter((row) => row.fecha_mesa && Number(row.id_turno) > 0);
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every((row) => afternoonIds.includes(Number(row.id_turno)))).toBe(true);
  });

  test('Armado parcial: bloqueos exactos dejan observadas sólo las mesas imposibles', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    const target = fixtureRole(fixture, 'AREA_1');
    for (const date of fixture.dates) {
      for (const turn of fixture.turnos) {
        addMesasTeacherBlock(target.id_docente, date, turn.id_turno);
      }
    }

    const created = await createArmado(request, admin, fixture, 'docentes');
    const state = currentState();
    const affected = state.mesas.filter((row) => Number(row.id_previa) === Number(target.id_previa));
    expect(affected.length).toBeGreaterThan(0);
    expect(affected.every((row) => row.estado === 'observada' && !row.fecha_mesa && !row.id_turno)).toBe(true);
    expect(state.mesas.some((row) => row.estado !== 'observada' && row.fecha_mesa && row.id_turno), 'Las mesas no bloqueadas deben calendarizarse').toBe(true);
    expect(created.result.status, 'La acción principal conserva HTTP 200 aun cuando el armado es parcial').toBe(200);
    expect(created.data.calendarizacion_completa).toBe(false);
  });
});
