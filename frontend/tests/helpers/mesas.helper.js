const { expect } = require('@playwright/test');
const { apiGet, apiPost, expectOk } = require('./api.helper');
const { prepareMesasFixture, mesasState } = require('./cleanup.helper');

function payloadData(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
}

function ymd(value) {
  return String(value || '').slice(0, 10);
}

function slotKey(row) {
  return `${ymd(row?.fecha_mesa)}|${Number(row?.id_turno || 0)}`;
}

function groupBy(rows, keyFn) {
  const result = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}

function uniqueNumbers(rows) {
  return [...new Set((rows || []).map((row) => Number(row.numero_mesa)).filter((value) => value > 0))];
}

function fixtureRole(fixture, role) {
  const row = (fixture?.previas || []).find((item) => item.role === role);
  expect(row, `El fixture debe contener ${role}`).toBeTruthy();
  return row;
}

function nextBusinessDate(date, days = 1) {
  const cursor = new Date(`${ymd(date)}T12:00:00`);
  let remaining = days;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

async function setupMesasFixture() {
  const fixture = prepareMesasFixture();
  expect(Array.isArray(fixture.previas)).toBe(true);
  expect(fixture.previas.length).toBeGreaterThanOrEqual(10);
  expect(Array.isArray(fixture.dates)).toBe(true);
  expect(fixture.dates.length).toBeGreaterThanOrEqual(3);
  expect(Array.isArray(fixture.turnos)).toBe(true);
  expect(fixture.turnos.length).toBeGreaterThan(0);
  return fixture;
}

async function createArmado(request, admin, fixture, tipoArmado = 'area', overrides = {}) {
  const action = tipoArmado === 'docentes' ? 'mesas_armado_crear_docentes' : 'mesas_armado_crear';
  const result = await apiPost(request, action, {
    fecha_inicio: fixture.dates[0],
    fecha_fin: fixture.dates[fixture.dates.length - 1],
    limpiar_borrador: true,
    excluir_fines_semana: true,
    tipo_armado: tipoArmado,
    modo_turnos: 'combinado',
    ...overrides,
  }, admin);
  const response = expectOk(result, `crear armado ${tipoArmado}`);
  return { result, response, data: payloadData(response) };
}

async function listMesasApi(request, admin) {
  const mesas = expectOk(await apiGet(request, 'mesas_examen_listar', {
    pagina: 1,
    por_pagina: 1000,
  }, admin), 'mesas_examen_listar');
  const grupos = expectOk(await apiGet(request, 'mesas_grupos_listar', {}, admin), 'mesas_grupos_listar');
  const noAgrupadas = expectOk(await apiGet(request, 'mesas_no_agrupadas_listar', {}, admin), 'mesas_no_agrupadas_listar');
  return {
    mesas: Array.isArray(mesas.data) ? mesas.data : [],
    grupos: grupos.data || grupos.grupos || [],
    noAgrupadas: noAgrupadas.data || noAgrupadas.no_agrupadas || [],
  };
}

function assertCoreInvariants(state, { mode = 'area', automaticCapacity = true } = {}) {
  const mesas = state.mesas || [];
  const grupos = state.grupos || [];
  const noAgrupadas = state.no_agrupadas || [];
  expect(mesas.length, 'El armado debe generar filas operativas').toBeGreaterThan(0);

  const byNumber = groupBy(mesas, (row) => Number(row.numero_mesa));
  expect([...byNumber.keys()].every((number) => number > 0), 'Toda fila debe quedar numerada').toBe(true);

  for (const [number, rows] of byNumber) {
    const slots = new Set(rows.map(slotKey));
    expect(slots.size, `Mesa N° ${number}: todas las filas deben compartir fecha/turno`).toBe(1);

    const isWorkshop = rows.some((row) => String(row.tipo_mesa) === 'taller' || Number(row.prioridad) === 1);
    if (!isWorkshop) {
      const teachers = new Set(rows.map((row) => Number(row.id_docente)).filter(Boolean));
      const subjects = new Set(rows.map((row) => Number(row.catedra_id_materia || row.previa_id_materia)).filter(Boolean));
      expect(teachers.size, `Mesa normal N° ${number}: debe tener un docente`).toBe(1);
      expect(subjects.size, `Mesa normal N° ${number}: debe tener una materia`).toBe(1);
    }
  }

  const groupedNumbers = grupos.map((row) => Number(row.numero_mesa));
  const looseNumbers = noAgrupadas.map((row) => Number(row.numero_mesa));
  const coverage = [...groupedNumbers, ...looseNumbers];
  expect(new Set(coverage).size, 'Un número no puede estar simultáneamente agrupado y no agrupado').toBe(coverage.length);
  expect(new Set(coverage), 'Todos los números deben quedar cubiertos por grupos o no agrupadas').toEqual(new Set([...byNumber.keys()]));

  const groupRows = groupBy(grupos, (row) => Number(row.numero_grupo));
  for (const [groupNumber, rows] of groupRows) {
    expect(new Set(rows.map(slotKey)).size, `Grupo ${groupNumber}: fecha y turno únicos`).toBe(1);
    const workshopRows = rows.filter((row) => String(row.tipo_mesa) === 'taller' || Number(row.prioridad) === 1);
    if (workshopRows.length) expect(rows.length, `Grupo taller ${groupNumber}: debe ser exclusivo`).toBe(1);
    if (automaticCapacity && !workshopRows.length) {
      expect(rows.length, `Grupo ${groupNumber}: máximo automático de cuatro números`).toBeLessThanOrEqual(4);
    }
    if (mode === 'area' && !workshopRows.length) {
      expect(new Set(rows.map((row) => Number(row.id_area)).filter(Boolean)).size, `Grupo ${groupNumber}: una sola área`).toBeLessThanOrEqual(1);
      const numbers = rows.map((row) => Number(row.numero_mesa));
      const teachers = new Set(mesas.filter((row) => numbers.includes(Number(row.numero_mesa))).map((row) => Number(row.id_docente)).filter(Boolean));
      expect(teachers.size, `Grupo por área ${groupNumber}: requiere dos docentes`).toBeGreaterThanOrEqual(2);
    }
  }

  // Ningún DNI puede rendir dos números distintos en fecha/turno iguales.
  const studentSlots = new Map();
  for (const row of mesas) {
    const dni = String(row.dni || '').trim();
    if (!dni || !row.fecha_mesa || !row.id_turno) continue;
    const key = `${dni}|${slotKey(row)}`;
    if (!studentSlots.has(key)) studentSlots.set(key, new Set());
    studentSlots.get(key).add(Number(row.numero_mesa));
  }
  for (const [key, numbers] of studentSlots) {
    expect(numbers.size, `Choque de alumno en ${key}`).toBe(1);
  }
}

function assertCorrelationOrder(state, fixture) {
  const previous = fixtureRole(fixture, 'CORRELATIVA_ANTERIOR');
  const next = fixtureRole(fixture, 'CORRELATIVA_POSTERIOR');
  const beforeRow = (state.mesas || []).find((row) => Number(row.id_previa) === Number(previous.id_previa));
  const afterRow = (state.mesas || []).find((row) => Number(row.id_previa) === Number(next.id_previa));
  expect(beforeRow, 'Debe existir la correlativa anterior').toBeTruthy();
  expect(afterRow, 'Debe existir la correlativa posterior').toBeTruthy();

  if (beforeRow.fecha_mesa && afterRow.fecha_mesa) {
    const turns = (fixture.turnos || []).map((row) => Number(row.id_turno));
    const rank = (row) => (
      Number(ymd(row.fecha_mesa).replace(/-/g, '')) * 1000
      + Math.max(0, turns.indexOf(Number(row.id_turno)))
    );
    expect(rank(beforeRow), 'La correlativa anterior debe estar en un slot previo').toBeLessThan(rank(afterRow));
  } else {
    expect([beforeRow.estado, afterRow.estado]).toContain('observada');
  }
}

function assertWorkshopExpansion(state, fixture) {
  const workshop = fixtureRole(fixture, 'TALLER');
  const rows = (state.mesas || []).filter((row) => Number(row.id_previa) === Number(workshop.id_previa));
  expect(rows.length, 'La previa taller debe expandirse en sus cátedras').toBeGreaterThanOrEqual(2);
  expect(new Set(rows.map((row) => Number(row.numero_mesa))).size).toBe(1);
  expect(rows.every((row) => String(row.tipo_mesa) === 'taller')).toBe(true);
}

function currentState() {
  return mesasState();
}

module.exports = {
  payloadData,
  ymd,
  slotKey,
  groupBy,
  uniqueNumbers,
  fixtureRole,
  nextBusinessDate,
  setupMesasFixture,
  createArmado,
  listMesasApi,
  assertCoreInvariants,
  assertCorrelationOrder,
  assertWorkshopExpansion,
  currentState,
};
