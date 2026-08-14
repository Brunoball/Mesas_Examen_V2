const { test, expect } = require('./fixtures/auth.fixture');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');
const {
  setupMesasFixture,
  createArmado,
  currentState,
  fixtureRole,
} = require('./helpers/mesas.helper');

function mesaForRole(state, fixture, role) {
  const previous = fixtureRole(fixture, role);
  const row = state.mesas.find((item) => Number(item.id_previa) === Number(previous.id_previa));
  expect(row, `Debe existir una fila de mesa para ${role}`).toBeTruthy();
  return { previous, row };
}

test.describe('10 · Mesas · alumnos, “más”, movimientos y resultados', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterEach(() => cleanupAll({ silent: true }));

  test('listar, quitar y volver a agregar una previa conserva el número y evita duplicados', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const state = currentState();
    const target = mesaForRole(state, fixture, 'AREA_1_B');
    const number = Number(target.row.numero_mesa);
    const mate = mesaForRole(state, fixture, 'AREA_1');
    expect(Number(mate.row.numero_mesa), 'Ambos alumnos de la misma cátedra deben compartir número').toBe(number);

    const listed = expectOk(await apiGet(request, 'mesas_editar_persona_previas_numero', {
      numero_mesa: number,
    }, admin), 'listar personas del número');
    expect((listed.data?.previas || []).map((row) => Number(row.id_previa))).toEqual(expect.arrayContaining([
      Number(target.previous.id_previa), Number(mate.previous.id_previa),
    ]));

    expectOk(await apiPost(request, 'mesas_editar_persona_eliminar', {
      numero_mesa: number, id_previa: Number(target.previous.id_previa),
    }, admin), 'quitar previa');
    let after = currentState();
    expect(after.mesas.some((row) => Number(row.id_previa) === Number(target.previous.id_previa))).toBe(false);
    expect(after.mesas.some((row) => Number(row.numero_mesa) === number)).toBe(true);

    const available = expectOk(await apiGet(request, 'mesas_editar_mas_previas_disponibles', {
      numero_mesa: number,
    }, admin), 'previas disponibles');
    const options = available.data?.previas || available.data || [];
    expect(options.some((row) => Number(row.id_previa) === Number(target.previous.id_previa))).toBe(true);

    expectOk(await apiPost(request, 'mesas_editar_mas_agregar', {
      numero_mesa: number, id_previas: [Number(target.previous.id_previa)],
    }, admin), 'volver a agregar previa');
    after = currentState();
    expect(after.mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa))).toHaveLength(1);
    expectFail(await apiPost(request, 'mesas_editar_mas_agregar', {
      numero_mesa: number, id_previa: Number(target.previous.id_previa),
    }, admin), [409, 422], /agregar|conflicto|incluida|existe/i, 'no duplicar previa');
  });

  test('una previa individual se mueve sólo a destinos validados y desaparece del origen', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const state = currentState();
    const target = mesaForRole(state, fixture, 'AREA_1_B');
    const origin = Number(target.row.numero_mesa);

    const destinations = expectOk(await apiGet(request, 'mesas_editar_persona_destinos_mover', {
      numero_mesa: origin, numero_origen: origin, id_previa: Number(target.previous.id_previa),
    }, admin), 'destinos para mover previa');
    const destination = (destinations.data?.destinos || []).find((row) => Number(row.numero_mesa) > 0);
    expect(destination, 'Debe existir al menos un destino válido dentro del área').toBeTruthy();

    const moved = expectOk(await apiPost(request, 'mesas_editar_persona_mover', {
      numero_origen: origin,
      numero_mesa: origin,
      id_previa: Number(target.previous.id_previa),
      numero_destino: Number(destination.numero_mesa),
    }, admin), 'mover previa');
    expect(moved.data.movido).toBe(true);
    const after = currentState().mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((row) => Number(row.numero_mesa) === Number(destination.numero_mesa))).toBe(true);
    expect(after.some((row) => Number(row.numero_mesa) === origin)).toBe(false);
  });

  test('nota 1–6 desaprueba, 7–10 aprueba, edita el mismo historial y Ausente revierte', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const target = mesaForRole(currentState(), fixture, 'AREA_2');
    const payload = {
      id_previa: Number(target.previous.id_previa),
      id_mesa: Number(target.row.id_mesa),
      numero_mesa: Number(target.row.numero_mesa),
    };

    expectFail(await apiPost(request, 'mesas_resultado_guardar_nota', { ...payload, nota: 11 }, admin), 422, /1 y 10|nota/i, 'nota fuera de rango');
    let result = expectOk(await apiPost(request, 'mesas_resultado_guardar_nota', { ...payload, nota: 4 }, admin), 'desaprobar');
    expect(result.data.aprobado).toBe(false);
    let state = currentState();
    let row = state.mesas.find((item) => Number(item.id_previa) === payload.id_previa);
    expect(Number(row.nota)).toBe(4);
    expect(Number(row.previa_activa)).toBe(1);
    expect(state.historial_resultados.filter((item) => Number(item.id_previa_original) === payload.id_previa)).toHaveLength(1);

    result = expectOk(await apiPost(request, 'mesas_resultado_guardar_nota', { ...payload, nota: 8 }, admin), 'aprobar/editando nota');
    expect(result.data.aprobado).toBe(true);
    state = currentState();
    row = state.mesas.find((item) => Number(item.id_previa) === payload.id_previa);
    expect(Number(row.nota)).toBe(8);
    expect(Number(row.previa_activa)).toBe(0);
    const histories = state.historial_resultados.filter((item) => Number(item.id_previa_original) === payload.id_previa);
    expect(histories).toHaveLength(1);
    expect(Number(histories[0].nota)).toBe(8);

    result = expectOk(await apiPost(request, 'mesas_resultado_guardar_nota', { ...payload, nota: 'Ausente' }, admin), 'marcar ausente');
    expect(result.data.ausente).toBe(true);
    state = currentState();
    row = state.mesas.find((item) => Number(item.id_previa) === payload.id_previa);
    expect(row.nota).toBeNull();
    expect(Number(row.previa_activa)).toBe(1);
    expect(state.historial_resultados.filter((item) => Number(item.id_previa_original) === payload.id_previa)).toHaveLength(0);
  });

  test('el resultado de taller mantiene todas sus cátedras y reporta replicación', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'docentes');
    const target = mesaForRole(currentState(), fixture, 'TALLER');
    const before = currentState().mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa));
    expect(before.length).toBeGreaterThanOrEqual(2);

    const result = expectOk(await apiPost(request, 'mesas_resultado_guardar_nota', {
      id_previa: Number(target.previous.id_previa),
      id_mesa: Number(target.row.id_mesa),
      numero_mesa: Number(target.row.numero_mesa),
      nota: 9,
    }, admin), 'aprobar taller');
    expect(result.data.replicado_taller).toBe(true);
    const after = currentState().mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa));
    expect(after).toHaveLength(before.length);
    expect(after.every((row) => Number(row.nota) === 9 && Number(row.previa_activa) === 0)).toBe(true);
  });

  test('IDs inexistentes y movimientos cruzados inválidos fallan sin mutar el armado', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const before = currentState();
    expectFail(await apiPost(request, 'mesas_editar_persona_eliminar', {
      numero_mesa: 999999, id_previa: 999999,
    }, admin), [404, 422, 500], /encontr|previa|interno/i, 'eliminar inexistente');
    expectFail(await apiPost(request, 'mesas_editar_persona_mover', {
      numero_origen: 999999, id_previa: 999999, numero_destino: 888888,
    }, admin), [404, 422, 500], /encontr|previa|interno/i, 'mover inexistente');
    const after = currentState();
    expect(after.mesas.map((row) => Number(row.id_mesa))).toEqual(before.mesas.map((row) => Number(row.id_mesa)));
    expect(after.grupos.map((row) => Number(row.id_mesa_grupo))).toEqual(before.grupos.map((row) => Number(row.id_mesa_grupo)));
  });
});
