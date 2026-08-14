const { test, expect } = require('./fixtures/auth.fixture');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { cleanupAll, addMesasTeacherBlock } = require('./helpers/cleanup.helper');
const { setupMesasFixture, createArmado, currentState, groupBy } = require('./helpers/mesas.helper');

function normalGroup(state, minimum = 1) {
  const grouped = groupBy(state.grupos, (row) => Number(row.numero_grupo));
  const entry = [...grouped.entries()].find(([, rows]) => rows.length >= minimum
    && rows.every((row) => String(row.tipo_mesa) !== 'taller' && Number(row.prioridad) !== 1));
  expect(entry, `Debe existir un grupo normal de al menos ${minimum} números`).toBeTruthy();
  return { numero_grupo: entry[0], rows: entry[1] };
}

function schedulePayload(group, overrides = {}) {
  const row = group.rows[0];
  return {
    tipo: 'grupo',
    numero_grupo: group.numero_grupo,
    id_grupo: group.numero_grupo,
    fecha_mesa: String(row.fecha_mesa).slice(0, 10),
    id_turno: Number(row.id_turno),
    hora: row.hora || '08:00',
    ...overrides,
  };
}

function validHourForTurn(turn) {
  const name = String(turn?.turno || turn?.nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return Number(turn?.id_turno) === 2 || /tarde|vesp/.test(name) ? '13:15' : '08:00';
}

test.describe('09 · Mesas · edición, capacidad y choques cruzados', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterEach(() => cleanupAll({ silent: true }));

  test('el slot actual siempre es válido, puede guardarse y una fecha fuera del rango se rechaza', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const group = normalGroup(currentState());
    const payload = schedulePayload(group);

    const slots = expectOk(await apiGet(request, 'mesas_editar_slots_validos', {
      tipo: 'grupo', numero_grupo: group.numero_grupo,
      fecha_inicio: fixture.dates[0], fecha_fin: fixture.dates.at(-1),
    }, admin), 'slots válidos');
    expect(slots.data).toBeTruthy();

    const validation = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', payload, admin), 'validar slot actual');
    expect(validation.data.valido, JSON.stringify(validation.data.errores || [])).toBe(true);
    expectOk(await apiPost(request, 'mesas_editar_guardar_programacion', payload, admin), 'guardar slot actual');

    const outside = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', {
      ...payload, fecha_mesa: '2099-12-31',
    }, admin), 'validar fuera de rango');
    expect(outside.data.valido).toBe(false);
    expect((outside.data.errores || []).join(' ')).toMatch(/rango|fecha/i);
    expectFail(await apiPost(request, 'mesas_editar_guardar_programacion', {
      ...payload, fecha_mesa: '2099-12-31',
    }, admin), 422, /conflictos/i, 'guardar fuera de rango');
  });

  test('un bloqueo docente exacto invalida fecha/turno y no modifica la programación', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'docentes');
    const state = currentState();
    const group = normalGroup(state);
    const numbers = new Set(group.rows.map((row) => Number(row.numero_mesa)));
    const teacher = state.mesas.find((row) => numbers.has(Number(row.numero_mesa)) && Number(row.id_docente) > 0);
    expect(teacher).toBeTruthy();

    const current = schedulePayload(group);
    const targetDate = fixture.dates.find((date) => date !== current.fecha_mesa) || fixture.dates[0];
    const targetTurn = fixture.turnos.find((turn) => Number(turn.id_turno) !== current.id_turno) || fixture.turnos[0];
    addMesasTeacherBlock(teacher.id_docente, targetDate, targetTurn.id_turno);

    const payload = schedulePayload(group, {
      fecha_mesa: targetDate,
      id_turno: Number(targetTurn.id_turno),
      hora: validHourForTurn(targetTurn),
    });
    const validation = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', payload, admin), 'validar docente bloqueado');
    expect(validation.data.valido).toBe(false);
    expect((validation.data.errores || []).join(' ')).toMatch(/docente|bloque|disponib/i);
    expectFail(await apiPost(request, 'mesas_editar_guardar_programacion', payload, admin), 422, /conflictos/i, 'guardar docente bloqueado');

    const after = currentState().grupos.filter((row) => Number(row.numero_grupo) === group.numero_grupo);
    expect(new Set(after.map((row) => `${String(row.fecha_mesa).slice(0, 10)}|${Number(row.id_turno)}`)))
      .toEqual(new Set([`${current.fecha_mesa}|${current.id_turno}`]));
  });

  test('quitar un número conserva mesas, crea no agrupadas y permite convertir una en grupo único', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const before = currentState();
    const group = normalGroup(before, 2);
    const target = group.rows[0];
    const originalRows = before.mesas.filter((row) => Number(row.numero_mesa) === Number(target.numero_mesa)).length;

    expectOk(await apiPost(request, 'mesas_editar_eliminar_numero_grupo', {
      modo: 'numero_grupo', numero_grupo: group.numero_grupo, id_grupo: group.numero_grupo,
      numero_mesa: Number(target.numero_mesa),
    }, admin), 'quitar número del grupo');
    const loose = currentState();
    expect(loose.mesas.filter((row) => Number(row.numero_mesa) === Number(target.numero_mesa)).length).toBe(originalRows);
    const noGroup = loose.no_agrupadas.find((row) => Number(row.numero_mesa) === Number(target.numero_mesa));
    expect(noGroup).toBeTruthy();
    expect(loose.grupos.some((row) => Number(row.numero_mesa) === Number(target.numero_mesa))).toBe(false);

    const made = expectOk(await apiPost(request, 'mesas_editar_no_agrupada_crear_grupo_unico', {
      tipo: 'no_agrupada', id_no_agrupada: Number(noGroup.id), numero_mesa: Number(noGroup.numero_mesa),
      fecha_mesa: String(noGroup.fecha_mesa).slice(0, 10), id_turno: Number(noGroup.id_turno), hora: noGroup.hora || '08:00',
    }, admin), 'crear grupo único');
    expect(Number(made.data.numero_grupo)).toBeGreaterThan(0);
    const finalState = currentState();
    expect(finalState.no_agrupadas.some((row) => Number(row.numero_mesa) === Number(target.numero_mesa))).toBe(false);
    expect(finalState.grupos.some((row) => Number(row.numero_mesa) === Number(target.numero_mesa))).toBe(true);
  });

  test('los slots extra incrementan capacidad, persisten y pueden revertirse', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const group = normalGroup(currentState());

    const enabled = expectOk(await apiPost(request, 'mesas_editar_habilitar_slot_extra', {
      numero_grupo: group.numero_grupo, id_grupo: group.numero_grupo,
    }, admin), 'habilitar slot extra');
    expect(Number(enabled.data.slots_extra)).toBe(1);
    expect(Number(currentState().slots_extra.find((row) => Number(row.numero_grupo) === group.numero_grupo)?.slots_extra)).toBe(1);

    const options = expectOk(await apiGet(request, 'mesas_editar_agregar_numero_opciones', {
      numero_grupo: group.numero_grupo,
    }, admin), 'opciones para agregar número');
    expect(options.data).toBeTruthy();

    const removed = expectOk(await apiPost(request, 'mesas_editar_eliminar_slot_extra', {
      numero_grupo: group.numero_grupo,
    }, admin), 'quitar slot extra');
    expect(Number(removed.data.slots_extra)).toBe(0);
  });

  test('mover un número usa sólo destinos validados y el doble envío queda idempotente', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const state = currentState();
    let choice = null;

    for (const number of [...new Set(state.grupos.map((row) => Number(row.numero_mesa)))]) {
      const result = expectOk(await apiGet(request, 'mesas_editar_flechas_destinos', { numero_mesa: number }, admin), `destinos N° ${number}`);
      const destination = (result.data?.destinos || []).find((row) => Number(row.numero_grupo) > 0);
      if (destination) {
        choice = { number, destination };
        break;
      }
    }
    expect(choice, 'El fixture debe producir al menos un movimiento válido entre grupos del área').toBeTruthy();

    const payload = {
      numero_mesa: choice.number,
      numero_grupo_destino: Number(choice.destination.numero_grupo),
    };
    expectOk(await apiPost(request, 'mesas_editar_flechas_mover', payload, admin), 'mover número');
    expectOk(await apiPost(request, 'mesas_editar_flechas_mover', payload, admin), 'repetir movimiento');
    const after = currentState();
    const locations = after.grupos.filter((row) => Number(row.numero_mesa) === choice.number);
    expect(locations).toHaveLength(1);
    expect(Number(locations[0].numero_grupo)).toBe(payload.numero_grupo_destino);
  });
});
