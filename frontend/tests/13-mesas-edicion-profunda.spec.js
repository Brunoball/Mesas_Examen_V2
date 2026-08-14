const { test, expect } = require('./fixtures/auth.fixture');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { cleanupAll, addMesasTeacherBlock } = require('./helpers/cleanup.helper');
const {
  setupMesasFixture,
  createArmado,
  currentState,
  fixtureRole,
  groupBy,
  ymd,
} = require('./helpers/mesas.helper');

const MODES = [
  { key: 'area', label: 'área' },
  { key: 'docentes', label: 'docentes' },
];

function normalGroups(state) {
  return [...groupBy(state.grupos, (row) => Number(row.numero_grupo)).entries()]
    .filter(([, rows]) => rows.length > 0
      && rows.every((row) => String(row.tipo_mesa) !== 'taller' && Number(row.prioridad) !== 1))
    .map(([numeroGrupo, rows]) => ({ numero_grupo: numeroGrupo, rows }));
}

function workshopGroup(state) {
  const grouped = groupBy(state.grupos, (row) => Number(row.numero_grupo));
  const entry = [...grouped.entries()].find(([, rows]) => rows.some((row) => (
    String(row.tipo_mesa) === 'taller' || Number(row.prioridad) === 1
  )));
  expect(entry, 'El fixture debe generar un grupo exclusivo para el taller').toBeTruthy();
  return { numero_grupo: entry[0], rows: entry[1] };
}

function groupForNumber(state, numeroMesa) {
  const row = state.grupos.find((item) => Number(item.numero_mesa) === Number(numeroMesa));
  expect(row, `La mesa N° ${numeroMesa} debe pertenecer a un grupo`).toBeTruthy();
  return normalGroups(state).find((group) => group.numero_grupo === Number(row.numero_grupo))
    || { numero_grupo: Number(row.numero_grupo), rows: state.grupos.filter((item) => Number(item.numero_grupo) === Number(row.numero_grupo)) };
}

function editableLocationForNumber(state, numeroMesa) {
  const grouped = state.grupos.find((item) => Number(item.numero_mesa) === Number(numeroMesa));
  if (grouped) {
    return {
      tipo: 'grupo',
      numero_grupo: Number(grouped.numero_grupo),
      id_grupo: Number(grouped.numero_grupo),
      numero_mesa: Number(numeroMesa),
      rows: state.grupos.filter((item) => Number(item.numero_grupo) === Number(grouped.numero_grupo)),
    };
  }

  const loose = state.no_agrupadas.find((item) => Number(item.numero_mesa) === Number(numeroMesa));
  expect(loose, `La mesa N° ${numeroMesa} debe estar agrupada o no agrupada`).toBeTruthy();
  return {
    tipo: 'no_agrupada',
    id_no_agrupada: Number(loose.id),
    numero_mesa: Number(numeroMesa),
    rows: [loose],
  };
}

function mesaForRole(state, fixture, role) {
  const previous = fixtureRole(fixture, role);
  const row = state.mesas.find((item) => Number(item.id_previa) === Number(previous.id_previa));
  expect(row, `Debe existir la mesa sintética ${role}`).toBeTruthy();
  return { previous, row };
}

function schedulePayload(group, overrides = {}) {
  const row = group.rows[0];
  return {
    tipo: 'grupo',
    numero_grupo: Number(group.numero_grupo),
    id_grupo: Number(group.numero_grupo),
    fecha_mesa: ymd(row.fecha_mesa),
    id_turno: Number(row.id_turno),
    hora: String(row.hora || '08:00').slice(0, 5),
    ...overrides,
  };
}

function slotPayload(group, slot) {
  return schedulePayload(group, {
    fecha_mesa: ymd(slot.fecha_mesa),
    id_turno: Number(slot.id_turno),
    hora: String(slot.hora_sugerida || slot.hora || group.rows[0].hora || '08:00').slice(0, 5),
  });
}

function locationSchedulePayload(location, overrides = {}) {
  if (location.tipo === 'grupo') return schedulePayload(location, overrides);
  const row = location.rows[0];
  return {
    tipo: 'no_agrupada',
    id_no_agrupada: Number(location.id_no_agrupada),
    numero_mesa: Number(location.numero_mesa),
    fecha_mesa: ymd(row.fecha_mesa),
    id_turno: Number(row.id_turno),
    hora: String(row.hora || '08:00').slice(0, 5),
    ...overrides,
  };
}

function groupSnapshot(state, numeroGrupo) {
  const rows = state.grupos
    .filter((row) => Number(row.numero_grupo) === Number(numeroGrupo))
    .map((row) => ({
      numero_mesa: Number(row.numero_mesa),
      fecha_mesa: ymd(row.fecha_mesa),
      id_turno: Number(row.id_turno),
      hora: String(row.hora || '').slice(0, 5),
    }))
    .sort((a, b) => a.numero_mesa - b.numero_mesa);
  const numbers = new Set(rows.map((row) => row.numero_mesa));
  const mesas = state.mesas
    .filter((row) => numbers.has(Number(row.numero_mesa)))
    .map((row) => ({
      id_mesa: Number(row.id_mesa),
      numero_mesa: Number(row.numero_mesa),
      fecha_mesa: ymd(row.fecha_mesa),
      id_turno: Number(row.id_turno),
    }))
    .sort((a, b) => a.id_mesa - b.id_mesa);
  return { rows, mesas };
}

function locationSnapshot(state, location) {
  if (location.tipo === 'grupo') return groupSnapshot(state, location.numero_grupo);
  const number = Number(location.numero_mesa);
  return {
    loose: state.no_agrupadas
      .filter((row) => Number(row.numero_mesa) === number)
      .map((row) => ({
        id: Number(row.id), numero_mesa: number, fecha_mesa: ymd(row.fecha_mesa),
        id_turno: Number(row.id_turno), hora: String(row.hora || '').slice(0, 5),
      })),
    mesas: state.mesas
      .filter((row) => Number(row.numero_mesa) === number)
      .map((row) => ({
        id_mesa: Number(row.id_mesa), numero_mesa: number,
        fecha_mesa: ymd(row.fecha_mesa), id_turno: Number(row.id_turno),
      }))
      .sort((a, b) => a.id_mesa - b.id_mesa),
  };
}

async function slotsFor(request, admin, fixture, group) {
  const response = expectOk(await apiGet(request, 'mesas_editar_slots_validos', {
    tipo: 'grupo',
    numero_grupo: Number(group.numero_grupo),
    id_grupo: Number(group.numero_grupo),
    fecha_inicio: fixture.dates[0],
    fecha_fin: fixture.dates.at(-1),
  }, admin), `slots válidos del grupo ${group.numero_grupo}`);
  expect(Array.isArray(response.data?.slots)).toBe(true);
  return response.data;
}

async function findMovableNumber(request, admin, state) {
  const numbers = [...new Set(state.grupos.map((row) => Number(row.numero_mesa)))];
  for (const number of numbers) {
    const response = expectOk(await apiGet(request, 'mesas_editar_flechas_destinos', {
      numero_mesa: number,
    }, admin), `destinos para mover N° ${number}`);
    const destination = (response.data?.destinos || []).find((row) => Number(row.numero_grupo) > 0);
    if (destination) return { number, destination, data: response.data };
  }
  return null;
}

for (const mode of MODES) {
  test.describe(`13 · Mesas · edición profunda por ${mode.label}`, () => {
    test.afterEach(() => cleanupAll({ silent: true }));

    test('los slots ofrecidos validan, un slot válido se guarda y uno bloqueado jamás muta el grupo', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const before = currentState();
      const group = normalGroups(before)[0];
      expect(group, 'Debe existir un grupo normal editable').toBeTruthy();

      const slotsData = await slotsFor(request, admin, fixture, group);
      const currentKey = `${ymd(group.rows[0].fecha_mesa)}|${Number(group.rows[0].id_turno)}`;
      const valid = slotsData.slots.find((slot) => slot.valido
        && `${ymd(slot.fecha_mesa)}|${Number(slot.id_turno)}` !== currentKey);
      expect(valid, 'Debe existir por lo menos un destino horario alternativo válido').toBeTruthy();

      for (const offered of slotsData.slots.filter((slot) => slot.valido || slot.es_actual)) {
        const validation = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', slotPayload(group, offered), admin), 'validar slot ofrecido');
        expect(validation.data.valido, JSON.stringify(validation.data.errores || [])).toBe(true);
      }

      const savedPayload = slotPayload(group, valid);
      expectOk(await apiPost(request, 'mesas_editar_guardar_programacion', savedPayload, admin), 'guardar cambio de fecha/turno');
      let after = currentState();
      const persisted = after.grupos.filter((row) => Number(row.numero_grupo) === group.numero_grupo);
      expect(persisted.length).toBe(group.rows.length);
      expect(persisted.every((row) => ymd(row.fecha_mesa) === savedPayload.fecha_mesa
        && Number(row.id_turno) === savedPayload.id_turno
        && String(row.hora || '').slice(0, 5) === savedPayload.hora)).toBe(true);
      const groupNumbers = new Set(group.rows.map((row) => Number(row.numero_mesa)));
      expect(after.mesas.filter((row) => groupNumbers.has(Number(row.numero_mesa))).every((row) => (
        ymd(row.fecha_mesa) === savedPayload.fecha_mesa && Number(row.id_turno) === savedPayload.id_turno
      ))).toBe(true);

      let stable = groupSnapshot(after, group.numero_grupo);
      const badHour = { ...savedPayload, hora: '00:01' };
      expectFail(
        await apiPost(request, 'mesas_editar_validar_programacion', badHour, admin),
        422,
        /hora|horario|turno/i,
        'validar hora fuera del turno',
      );
      expectFail(
        await apiPost(request, 'mesas_editar_guardar_programacion', badHour, admin),
        422,
        /hora|horario|turno|conflicto/i,
        'impedir hora fuera del turno',
      );
      expect(groupSnapshot(currentState(), group.numero_grupo)).toEqual(stable);

      const refreshedSlots = await slotsFor(request, admin, fixture, { ...group, rows: persisted });
      const invalid = refreshedSlots.slots.find((slot) => !slot.valido && !slot.es_actual);
      expect(invalid, 'La matriz debe contener al menos un slot descartado').toBeTruthy();
      stable = groupSnapshot(currentState(), group.numero_grupo);
      const invalidPayload = slotPayload({ ...group, rows: persisted }, invalid);
      const validation = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', invalidPayload, admin), 'validar slot descartado');
      expect(validation.data.valido).toBe(false);
      expectFail(await apiPost(request, 'mesas_editar_guardar_programacion', invalidPayload, admin), 422, /conflicto/i, 'impedir slot descartado');
      after = currentState();
      expect(groupSnapshot(after, group.numero_grupo)).toEqual(stable);
    });

    test('un bloqueo exacto de cualquier docente invalida el destino y deja programación, hora y filas intactas', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const state = currentState();
      const group = normalGroups(state)[0];
      expect(group).toBeTruthy();
      const numbers = new Set(group.rows.map((row) => Number(row.numero_mesa)));
      const teacher = state.mesas.find((row) => numbers.has(Number(row.numero_mesa)) && Number(row.id_docente) > 0);
      expect(teacher, 'El grupo debe tener un docente real').toBeTruthy();
      const other = state.grupos.find((row) => Number(row.numero_grupo) !== group.numero_grupo
        && ymd(row.fecha_mesa)
        && `${ymd(row.fecha_mesa)}|${Number(row.id_turno)}` !== `${ymd(group.rows[0].fecha_mesa)}|${Number(group.rows[0].id_turno)}`);
      expect(other, 'Debe existir otro slot activo para probar el bloqueo').toBeTruthy();
      addMesasTeacherBlock(teacher.id_docente, ymd(other.fecha_mesa), Number(other.id_turno));

      const payload = schedulePayload(group, {
        fecha_mesa: ymd(other.fecha_mesa),
        id_turno: Number(other.id_turno),
        hora: String(other.hora || '08:00').slice(0, 5),
      });
      const stable = groupSnapshot(currentState(), group.numero_grupo);
      const validation = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', payload, admin), 'validar bloqueo docente');
      expect(validation.data.valido).toBe(false);
      expect((validation.data.errores || []).join(' ')).toMatch(/docente|bloque|disponib/i);
      expectFail(await apiPost(request, 'mesas_editar_guardar_programacion', payload, admin), 422, /conflicto/i, 'guardar con bloqueo docente');
      expect(groupSnapshot(currentState(), group.numero_grupo)).toEqual(stable);
    });

    test('un choque del mismo alumno y el orden de correlativas impiden superponer grupos sin dejar cambios parciales', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const state = currentState();
      const previous = mesaForRole(state, fixture, 'CORRELATIVA_ANTERIOR');
      const next = mesaForRole(state, fixture, 'CORRELATIVA_POSTERIOR');
      const candidates = [
        { current: previous, other: next },
        { current: next, other: previous },
      ];
      const selected = candidates.find(({ current }) => state.grupos.some((row) => (
        Number(row.numero_mesa) === Number(current.row.numero_mesa)
      ))) || candidates[0];
      const source = editableLocationForNumber(state, selected.current.row.numero_mesa);
      const destination = selected.other.row;
      expect(`${ymd(destination.fecha_mesa)}|${Number(destination.id_turno)}`)
        .not.toBe(`${ymd(source.rows[0].fecha_mesa)}|${Number(source.rows[0].id_turno)}`);

      const payload = locationSchedulePayload(source, {
        fecha_mesa: ymd(destination.fecha_mesa),
        id_turno: Number(destination.id_turno),
        hora: String(destination.hora || '08:00').slice(0, 5),
      });
      const stable = locationSnapshot(state, source);
      const validation = expectOk(await apiPost(request, 'mesas_editar_validar_programacion', payload, admin), 'validar choque correlativo');
      expect(validation.data.valido).toBe(false);
      expect((validation.data.errores || []).join(' ')).toMatch(/alumn|correlativ|DNI/i);
      expectFail(await apiPost(request, 'mesas_editar_guardar_programacion', payload, admin), 422, /conflicto/i, 'guardar choque correlativo');
      expect(locationSnapshot(currentState(), source)).toEqual(stable);
    });

    test('quitar un número, mover la no agrupada a un día nuevo y convertirla en mesa única conserva todas sus personas', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const before = currentState();
      const group = normalGroups(before).find((item) => item.rows.length >= 2);
      expect(group).toBeTruthy();
      const target = group.rows[0];
      const number = Number(target.numero_mesa);
      const ids = before.mesas.filter((row) => Number(row.numero_mesa) === number).map((row) => Number(row.id_mesa)).sort((a, b) => a - b);

      expectOk(await apiPost(request, 'mesas_editar_eliminar_numero_grupo', {
        modo: 'numero_grupo',
        numero_grupo: group.numero_grupo,
        id_grupo: group.numero_grupo,
        numero_mesa: number,
      }, admin), 'quitar número del grupo');
      let state = currentState();
      const loose = state.no_agrupadas.find((row) => Number(row.numero_mesa) === number);
      expect(loose).toBeTruthy();
      expect(state.mesas.filter((row) => Number(row.numero_mesa) === number).map((row) => Number(row.id_mesa)).sort((a, b) => a - b)).toEqual(ids);

      const monthDate = new Date(`${fixture.dates[0]}T12:00:00`);
      const monthStart = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
      const monthEndDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
      const response = expectOk(await apiGet(request, 'mesas_editar_slots_validos', {
        tipo: 'no_agrupada', id_no_agrupada: Number(loose.id), numero_mesa: number,
        fecha_inicio: monthStart, fecha_fin: monthEnd,
      }, admin), 'slots para no agrupada');
      const newDay = (response.data?.slots || []).find((slot) => slot.valido && slot.es_dia_nuevo);
      expect(newDay, 'Una no agrupada debe poder abrir un día nuevo sin choques').toBeTruthy();
      const loosePayload = {
        tipo: 'no_agrupada', id_no_agrupada: Number(loose.id), numero_mesa: number,
        fecha_mesa: ymd(newDay.fecha_mesa), id_turno: Number(newDay.id_turno),
        hora: String(newDay.hora_sugerida || '08:00').slice(0, 5),
      };
      expectOk(await apiPost(request, 'mesas_editar_guardar_programacion', loosePayload, admin), 'reprogramar no agrupada');
      state = currentState();
      expect(state.mesas.filter((row) => Number(row.numero_mesa) === number).every((row) => (
        ymd(row.fecha_mesa) === loosePayload.fecha_mesa && Number(row.id_turno) === loosePayload.id_turno
      ))).toBe(true);

      const currentLoose = state.no_agrupadas.find((row) => Number(row.numero_mesa) === number);
      const created = expectOk(await apiPost(request, 'mesas_editar_no_agrupada_crear_grupo_unico', {
        ...loosePayload, id_no_agrupada: Number(currentLoose.id),
      }, admin), 'crear mesa única');
      expect(Number(created.data.numero_grupo)).toBeGreaterThan(0);
      state = currentState();
      expect(state.no_agrupadas.some((row) => Number(row.numero_mesa) === number)).toBe(false);
      expect(state.grupos.filter((row) => Number(row.numero_grupo) === Number(created.data.numero_grupo))).toHaveLength(1);
      expect(state.mesas.filter((row) => Number(row.numero_mesa) === number).map((row) => Number(row.id_mesa)).sort((a, b) => a - b)).toEqual(ids);
    });

    test('agregar número muestra sólo candidatos compatibles y permite volver a insertar una no agrupada válida', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const initial = currentState();
      const choice = await findMovableNumber(request, admin, initial);
      expect(choice, 'Debe existir un movimiento compatible para probar agregar número').toBeTruthy();
      const originGroup = groupForNumber(initial, choice.number);
      const destinationGroup = Number(choice.destination.numero_grupo);

      expectOk(await apiPost(request, 'mesas_editar_eliminar_numero_grupo', {
        modo: 'numero_grupo', numero_grupo: originGroup.numero_grupo,
        id_grupo: originGroup.numero_grupo, numero_mesa: choice.number,
      }, admin), 'pasar número a no agrupadas');
      const options = expectOk(await apiGet(request, 'mesas_editar_agregar_numero_opciones', {
        numero_grupo: destinationGroup,
      }, admin), 'opciones filtradas para agregar');
      expect((options.data?.no_agrupadas || []).every((row) => row.valido !== false)).toBe(true);
      expect((options.data?.no_agrupadas || []).some((row) => Number(row.numero_mesa) === choice.number)).toBe(true);

      expectOk(await apiPost(request, 'mesas_editar_agregar_numero_confirmar', {
        numero_grupo: destinationGroup, tipo: 'no_agrupada', numero_mesa: choice.number,
      }, admin), 'agregar no agrupada válida');
      const after = currentState();
      expect(after.no_agrupadas.some((row) => Number(row.numero_mesa) === choice.number)).toBe(false);
      expect(after.grupos.filter((row) => Number(row.numero_mesa) === choice.number)).toHaveLength(1);
      expect(Number(after.grupos.find((row) => Number(row.numero_mesa) === choice.number).numero_grupo)).toBe(destinationGroup);
    });

    test('una previa sin mesa puede recibir un número nuevo; el número se agrega una sola vez y queda programado en el grupo', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const before = currentState();
      const extra = mesaForRole(before, fixture, 'AREA_1_B');
      const base = mesaForRole(before, fixture, 'AREA_1');
      expect(Number(extra.row.numero_mesa)).toBe(Number(base.row.numero_mesa));
      const group = groupForNumber(before, base.row.numero_mesa);

      expectOk(await apiPost(request, 'mesas_editar_persona_eliminar', {
        numero_mesa: Number(extra.row.numero_mesa), id_previa: Number(extra.previous.id_previa),
      }, admin), 'separar previa del número existente');
      let targetGroup = null;
      for (const candidate of normalGroups(currentState())) {
        expectOk(await apiPost(request, 'mesas_editar_habilitar_slot_extra', {
          numero_grupo: candidate.numero_grupo, id_grupo: candidate.numero_grupo,
        }, admin), `garantizar capacidad en grupo ${candidate.numero_grupo}`);
        const options = expectOk(await apiGet(request, 'mesas_editar_agregar_numero_opciones', {
          numero_grupo: candidate.numero_grupo,
        }, admin), `previas compatibles para grupo ${candidate.numero_grupo}`);
        if ((options.data?.previas_sin_mesa || []).some((row) => (
          Number(row.id_previa) === Number(extra.previous.id_previa)
        ))) {
          targetGroup = candidate;
          break;
        }
      }
      expect(targetGroup, 'El backend debe ofrecer al menos un grupo realmente compatible para crear el número').toBeTruthy();

      const created = expectOk(await apiPost(request, 'mesas_editar_agregar_numero_confirmar', {
        numero_grupo: targetGroup.numero_grupo, tipo: 'previa_sin_mesa', id_previa: Number(extra.previous.id_previa),
      }, admin), 'crear número desde previa');
      const newNumber = Number(created.data.numero_mesa);
      expect(newNumber).toBeGreaterThan(0);
      expect(newNumber).not.toBe(Number(base.row.numero_mesa));
      const after = currentState();
      expect(after.mesas.filter((row) => Number(row.id_previa) === Number(extra.previous.id_previa))).toHaveLength(1);
      expect(Number(after.mesas.find((row) => Number(row.id_previa) === Number(extra.previous.id_previa)).numero_mesa)).toBe(newNumber);
      expect(after.grupos.filter((row) => Number(row.numero_mesa) === newNumber)).toHaveLength(1);
      expect(Number(after.grupos.find((row) => Number(row.numero_mesa) === newNumber).numero_grupo)).toBe(targetGroup.numero_grupo);
    });

    test('eliminar un grupo conserva sus mesas como no agrupadas; eliminar luego una no agrupada borra sólo ese número', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const before = currentState();
      const group = normalGroups(before)[0];
      expect(group).toBeTruthy();
      const numbers = group.rows.map((row) => Number(row.numero_mesa));
      const idsByNumber = new Map(numbers.map((number) => [number, before.mesas.filter((row) => Number(row.numero_mesa) === number).map((row) => Number(row.id_mesa))]));

      expectOk(await apiPost(request, 'mesas_editar_eliminar_grupo', {
        tipo: 'grupo', numero_grupo: group.numero_grupo, id_grupo: group.numero_grupo,
      }, admin), 'eliminar grupo completo');
      let state = currentState();
      expect(state.grupos.some((row) => Number(row.numero_grupo) === group.numero_grupo)).toBe(false);
      for (const number of numbers) {
        expect(state.no_agrupadas.some((row) => Number(row.numero_mesa) === number)).toBe(true);
        expect(state.mesas.filter((row) => Number(row.numero_mesa) === number).map((row) => Number(row.id_mesa))).toEqual(idsByNumber.get(number));
      }

      const target = state.no_agrupadas.find((row) => Number(row.numero_mesa) === numbers[0]);
      expectOk(await apiPost(request, 'mesas_editar_eliminar_grupo', {
        tipo: 'no_agrupada', id_no_agrupada: Number(target.id), numero_mesa: Number(target.numero_mesa),
      }, admin), 'eliminar número no agrupado');
      state = currentState();
      expect(state.no_agrupadas.some((row) => Number(row.numero_mesa) === Number(target.numero_mesa))).toBe(false);
      expect(state.mesas.some((row) => Number(row.numero_mesa) === Number(target.numero_mesa))).toBe(false);
      for (const number of numbers.slice(1)) {
        expect(state.mesas.some((row) => Number(row.numero_mesa) === number)).toBe(true);
      }
    });

    test('mover una previa valida primero el destino, rechaza el origen y persiste únicamente el movimiento autorizado', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const before = currentState();
      const target = mesaForRole(before, fixture, 'AREA_1_B');
      const origin = Number(target.row.numero_mesa);
      const destinations = expectOk(await apiGet(request, 'mesas_editar_persona_destinos_mover', {
        numero_origen: origin, numero_mesa: origin, id_previa: Number(target.previous.id_previa),
      }, admin), 'destinos de previa');
      const destination = (destinations.data?.destinos || [])[0];
      expect(destination, 'Debe existir un destino válido para la previa').toBeTruthy();

      const invalid = expectOk(await apiPost(request, 'mesas_editar_persona_validar_mover', {
        numero_origen: origin, numero_mesa: origin, id_previa: Number(target.previous.id_previa), numero_destino: origin,
      }, admin), 'validar mismo origen');
      expect(invalid.data.valido).toBe(false);
      const stable = before.mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa)).map((row) => Number(row.id_mesa));
      expectFail(await apiPost(request, 'mesas_editar_persona_mover', {
        numero_origen: origin, id_previa: Number(target.previous.id_previa), numero_destino: origin,
      }, admin), 422, /conflicto/i, 'impedir mover al origen');
      expect(currentState().mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa)).map((row) => Number(row.id_mesa))).toEqual(stable);

      const payload = {
        numero_origen: origin, numero_mesa: origin, id_previa: Number(target.previous.id_previa),
        numero_destino: Number(destination.numero_mesa),
      };
      const valid = expectOk(await apiPost(request, 'mesas_editar_persona_validar_mover', payload, admin), 'validar destino permitido');
      expect(valid.data.valido, JSON.stringify(valid.data.errores || [])).toBe(true);
      expectOk(await apiPost(request, 'mesas_editar_persona_mover', payload, admin), 'mover previa validada');
      const after = currentState().mesas.filter((row) => Number(row.id_previa) === Number(target.previous.id_previa));
      expect(after.length).toBeGreaterThan(0);
      expect(after.every((row) => Number(row.numero_mesa) === payload.numero_destino)).toBe(true);
    });

    test('mover un número expone sólo grupos con capacidad y rechaza por API un grupo taller exclusivo', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      const before = currentState();
      const workshop = workshopGroup(before);
      const number = normalGroups(before)[0].rows[0].numero_mesa;
      const response = expectOk(await apiGet(request, 'mesas_editar_flechas_destinos', {
        numero_mesa: Number(number),
      }, admin), 'destinos filtrados de número');
      const destinations = response.data?.destinos || [];
      expect(destinations.every((row) => Number(row.numero_grupo) > 0
        && Number(row.slots_libres) > 0
        && row.valido !== false)).toBe(true);
      expect(destinations.some((row) => Number(row.numero_grupo) === workshop.numero_grupo)).toBe(false);

      const stableGroups = before.grupos.map((row) => ({ id: Number(row.id_mesa_grupo), group: Number(row.numero_grupo), number: Number(row.numero_mesa) }));
      expectFail(await apiPost(request, 'mesas_editar_flechas_mover', {
        numero_mesa: Number(number), numero_grupo_destino: workshop.numero_grupo,
      }, admin), 422, /mover|seleccionado/i, 'impedir mezclar mesa normal con taller');
      expect(currentState().grupos.map((row) => ({ id: Number(row.id_mesa_grupo), group: Number(row.numero_grupo), number: Number(row.numero_mesa) }))).toEqual(stableGroups);
    });

    test('la regla de área se aplica sólo al armado por área; docentes permite un cruce compatible sin desactivar controles', async ({ request }) => {
      const fixture = await setupMesasFixture();
      const admin = await login(request);
      await createArmado(request, admin, fixture, mode.key);
      let before = currentState();

      if (mode.key === 'area') {
        const findAreaPair = (state) => {
          const groups = normalGroups(state);
          for (const sourceGroup of groups) {
            const destinationGroup = groups.find((candidate) => Number(candidate.rows[0].id_area) > 0
            && Number(sourceGroup.rows[0].id_area) > 0
            && Number(candidate.rows[0].id_area) !== Number(sourceGroup.rows[0].id_area));
            if (destinationGroup) return { sourceGroup, destinationGroup };
          }
          return null;
        };

        let pair = findAreaPair(before);
        if (!pair) {
          const otherArea = mesaForRole(before, fixture, 'OTRA_AREA_1');
          const loose = before.no_agrupadas.find((row) => Number(row.numero_mesa) === Number(otherArea.row.numero_mesa));
          expect(loose, 'La mesa de la otra área debe estar disponible como no agrupada').toBeTruthy();
          expectOk(await apiPost(request, 'mesas_editar_no_agrupada_crear_grupo_unico', {
            tipo: 'no_agrupada', id_no_agrupada: Number(loose.id), numero_mesa: Number(loose.numero_mesa),
            fecha_mesa: ymd(loose.fecha_mesa), id_turno: Number(loose.id_turno),
            hora: String(loose.hora || '08:00').slice(0, 5),
          }, admin), 'crear grupo de contraste para la otra área');
          before = currentState();
          pair = findAreaPair(before);
        }
        expect(pair, 'El fixture por área debe generar grupos de dos áreas distintas').toBeTruthy();
        const { sourceGroup, destinationGroup } = pair;
        const sourceNumber = Number(sourceGroup.rows[0].numero_mesa);
        expect(Number(sourceGroup.rows[0].id_area)).not.toBe(Number(destinationGroup.rows[0].id_area));
        const listed = expectOk(await apiGet(request, 'mesas_editar_flechas_destinos', {
          numero_mesa: sourceNumber,
        }, admin), 'destinos sujetos al área');
        expect((listed.data?.destinos || []).some((row) => Number(row.numero_grupo) === destinationGroup.numero_grupo)).toBe(false);
        const stable = before.grupos.map((row) => `${Number(row.numero_grupo)}|${Number(row.numero_mesa)}`);
        const rejected = expectFail(await apiPost(request, 'mesas_editar_flechas_mover', {
          numero_mesa: sourceNumber, numero_grupo_destino: destinationGroup.numero_grupo,
        }, admin), 422, /mover|seleccionado/i, 'impedir cruce de áreas');
        expect(JSON.stringify(rejected)).toMatch(/área|area/i);
        expect(currentState().grupos.map((row) => `${Number(row.numero_grupo)}|${Number(row.numero_mesa)}`)).toEqual(stable);
        return;
      }

      for (const destinationGroup of normalGroups(before)) {
        expectOk(await apiPost(request, 'mesas_editar_habilitar_slot_extra', {
          numero_grupo: destinationGroup.numero_grupo,
          id_grupo: destinationGroup.numero_grupo,
        }, admin), `habilitar capacidad de cruce en grupo ${destinationGroup.numero_grupo}`);
      }
      before = currentState();
      let crossing = null;
      for (const sourceGroup of normalGroups(before)) {
        for (const sourceRow of sourceGroup.rows) {
          const listed = expectOk(await apiGet(request, 'mesas_editar_flechas_destinos', {
            numero_mesa: Number(sourceRow.numero_mesa),
          }, admin), `destinos docentes N° ${sourceRow.numero_mesa}`);
          const destination = (listed.data?.destinos || []).find((row) => Number(row.id_area) > 0
            && Number(sourceRow.id_area) > 0
            && Number(row.id_area) !== Number(sourceRow.id_area));
          if (destination) {
            crossing = { number: Number(sourceRow.numero_mesa), destination };
            break;
          }
        }
        if (crossing) break;
      }
      expect(crossing, 'El fixture docente debe ofrecer al menos un cruce de área compatible').toBeTruthy();
      expectOk(await apiPost(request, 'mesas_editar_flechas_mover', {
        numero_mesa: crossing.number,
        numero_grupo_destino: Number(crossing.destination.numero_grupo),
      }, admin), 'mover por docentes entre áreas compatibles');
      const locations = currentState().grupos.filter((row) => Number(row.numero_mesa) === crossing.number);
      expect(locations).toHaveLength(1);
      expect(Number(locations[0].numero_grupo)).toBe(Number(crossing.destination.numero_grupo));
    });

    test('la UI deshabilita turnos no autorizados y el modal de mover muestra exactamente los destinos validados', async ({ page }) => {
      const guard = attachRuntimeGuards(page);
      const fixture = await setupMesasFixture();
      const admin = await login(page.request);
      await createArmado(page.request, admin, fixture, mode.key);
      await loginPageByApi(page);
      await page.goto('/mesas-examen');

      await page.getByRole('button', { name: 'Editar' }).first().click();
      const editor = page.locator('.editar-mesa-overlay');
      await expect(editor).toBeVisible();
      await expect(editor.getByText('Programación', { exact: true })).toBeVisible();
      await expect(editor.locator('.editar-mesa-day.available').first()).toBeVisible();
      const chips = editor.locator('.editar-mesa-numero-chip');
      expect(await chips.count()).toBeGreaterThan(0);
      const firstNumber = Number((await chips.first().innerText()).match(/\d+/)?.[0]);
      expect(firstNumber).toBeGreaterThan(0);

      const state = currentState();
      const group = groupForNumber(state, firstNumber);
      const slotsData = await slotsFor(page.request, admin, fixture, group);
      const selectedDate = ymd(group.rows[0].fecha_mesa);
      const enabledTurns = new Set(slotsData.slots
        .filter((slot) => ymd(slot.fecha_mesa) === selectedDate && (slot.valido || slot.es_actual))
        .map((slot) => Number(slot.id_turno)));
      const turnOptions = editor.locator('.editar-mesa-fields select').first().locator('option');
      for (let index = 0; index < await turnOptions.count(); index += 1) {
        const option = turnOptions.nth(index);
        const value = Number(await option.getAttribute('value'));
        expect(await option.isDisabled(), `Turno ${value}: disabled debe coincidir con la matriz del backend`).toBe(!enabledTurns.has(value));
      }

      const actionCards = editor.locator('.editar-mesa-slot-card');
      expect(await editor.getByTitle('Ver previas / alumnos').count()).toBe(await actionCards.count());
      expect(await editor.getByTitle('Agregar previa / alumno').count()).toBe(await actionCards.count());
      expect(await editor.getByTitle('Mover número a otro grupo').count()).toBe(await actionCards.count());
      expect(await editor.getByTitle('Quitar número del grupo').count()).toBe(await actionCards.count());

      const expected = expectOk(await apiGet(page.request, 'mesas_editar_flechas_destinos', {
        numero_mesa: firstNumber,
      }, admin), 'destinos esperados para UI').data?.destinos || [];
      await editor.getByTitle('Mover número a otro grupo').first().click();
      const mover = page.locator('.flechas-overlay');
      await expect(mover).toBeVisible();
      await expect(mover.getByText(/únicamente grupos compatibles/i)).toBeVisible();
      await expect(mover.locator('.flechas-destino:not(.flechas-destino-skeleton)')).toHaveCount(expected.length);
      if (expected.length === 0) {
        await expect(mover.getByText(/No hay grupos disponibles/i)).toBeVisible();
      }
      await mover.locator('.mesa-submodal-close').click();
      await expect(mover).toBeHidden();
      await editor.getByRole('button', { name: 'Cerrar' }).click();
      guard.assertClean(`UI edición profunda por ${mode.label}`);
    });
  });
}
