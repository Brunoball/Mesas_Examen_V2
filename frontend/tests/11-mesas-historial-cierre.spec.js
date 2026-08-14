const { test, expect } = require('./fixtures/auth.fixture');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');
const { setupMesasFixture, createArmado, currentState, fixtureRole } = require('./helpers/mesas.helper');

async function noteRole(request, admin, fixture, role, note) {
  const previous = fixtureRole(fixture, role);
  const row = currentState().mesas.find((item) => Number(item.id_previa) === Number(previous.id_previa));
  expect(row).toBeTruthy();
  return expectOk(await apiPost(request, 'mesas_resultado_guardar_nota', {
    id_previa: Number(previous.id_previa),
    id_mesa: Number(row.id_mesa),
    numero_mesa: Number(row.numero_mesa),
    nota: note,
  }, admin), `guardar nota ${role}`);
}

test.describe('11 · Mesas · cierre, historial, exportación y email seguro', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterEach(() => cleanupAll({ silent: true }));

  test('cerrar con historial guarda una foto completa y elimina sólo el armado operativo', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    await noteRole(request, admin, fixture, 'AREA_2', 6);
    const before = currentState();
    const previousCount = new Set(before.mesas.map((row) => Number(row.id_previa))).size;

    const removed = expectOk(await apiPost(request, 'mesas_armado_eliminar_mesas', {
      guardar_historial: 1,
    }, admin), 'cerrar guardando historial');
    expect(Number(removed.data.id_historial_armado)).toBeGreaterThan(0);
    const after = currentState();
    expect(after.mesas).toHaveLength(0);
    expect(after.grupos).toHaveLength(0);
    expect(after.no_agrupadas).toHaveLength(0);
    expect(after.historial_armados).toHaveLength(1);
    expect(new Set(after.historial_detalle.map((row) => Number(row.id_previa_original))).size).toBe(previousCount);

    const listed = expectOk(await apiGet(request, 'mesas_historial_listar', {
      busqueda: 'PWTEST', limite_resultados: 1000, limite_armados: 100,
    }, admin), 'listar historial');
    expect(listed.data.armados).toHaveLength(1);
    expect(Number(listed.data.resumen.total_armados)).toBe(1);
    expect(Number(listed.data.resumen.total_desaprobadas)).toBeGreaterThanOrEqual(1);

    const historyId = Number(after.historial_armados[0].id_armado_historial);
    const detail = expectOk(await apiGet(request, 'mesas_historial_detalle_armado', {
      id_armado_historial: historyId,
    }, admin), 'detalle historial');
    expect((detail.data?.detalle || detail.data?.filas || []).length).toBeGreaterThan(0);

    const exported = expectOk(await apiGet(request, 'mesas_historial_exportar', {
      busqueda: 'PWTEST', limite_armados: 100,
    }, admin), 'exportar historial');
    expect(exported.data).toBeTruthy();
    expect(JSON.stringify(exported.data)).toContain('PWTEST');
  });

  test('cerrar sin historial limpia resultados técnicos y reactiva una desaprobada', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'docentes');
    const target = fixtureRole(fixture, 'AREA_3');
    await noteRole(request, admin, fixture, 'AREA_3', 5);

    const removed = expectOk(await apiPost(request, 'mesas_armado_eliminar_mesas', {
      guardar_historial: 0,
    }, admin), 'cerrar sin historial');
    expect(removed.data.id_historial_armado).toBeNull();
    const after = currentState();
    expect(after.mesas).toHaveLength(0);
    expect(after.historial_armados).toHaveLength(0);
    expect(after.historial_detalle).toHaveLength(0);
    expect(after.historial_resultados).toHaveLength(0);
    const previous = after.test_previas.find((row) => Number(row.id_previa) === Number(target.id_previa));
    expect(previous).toBeTruthy();
    expect(previous.nota).toBeNull();
    expect(Number(previous.activo)).toBe(1);
  });

  test('cerrar sin historial mantiene inactiva una aprobada y limpia su nota técnica', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    const target = fixtureRole(fixture, 'AREA_4');
    await noteRole(request, admin, fixture, 'AREA_4', 10);
    expectOk(await apiPost(request, 'mesas_armado_eliminar_mesas', { guardar_historial: 0 }, admin), 'cerrar aprobada sin historial');

    const after = currentState();
    const previous = after.test_previas.find((row) => Number(row.id_previa) === Number(target.id_previa));
    expect(previous).toBeTruthy();
    expect(previous.nota).toBeNull();
    expect(Number(previous.activo)).toBe(0);
    expect(after.historial_resultados).toHaveLength(0);
  });

  test('el historial puede eliminarse completo sin tocar el nuevo armado', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');
    expectOk(await apiPost(request, 'mesas_armado_eliminar_mesas', { guardar_historial: 1 }, admin), 'crear historial');
    await createArmado(request, admin, fixture, 'area');
    const operationalIds = currentState().mesas.map((row) => Number(row.id_mesa));
    expect(operationalIds.length).toBeGreaterThan(0);

    expectOk(await apiPost(request, 'mesas_historial_eliminar_todos', {}, admin), 'eliminar historiales');
    const after = currentState();
    expect(after.historial_armados).toHaveLength(0);
    expect(after.historial_detalle).toHaveLength(0);
    expect(after.historial_resultados).toHaveLength(0);
    expect(after.mesas.map((row) => Number(row.id_mesa))).toEqual(operationalIds);
  });

  test('sin inscripciones de formulario no crea ni procesa lotes de email accidentalmente', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'area');

    const listed = expectOk(await apiGet(request, 'mesas_notificaciones_email_listar', {}, admin), 'listar email');
    expect(listed.data).toBeTruthy();
    const attempted = await apiPost(request, 'mesas_notificaciones_email_registrar_lote', {
      reenviar: 0, asunto: 'PWTEST NO ENVIAR',
    }, admin);
    expect(attempted.status).toBe(200);
    expect(attempted.data.exito, 'No debe existir destinatario real para el fixture sintético').toBe(false);
    expect(currentState().notificaciones_lotes).toHaveLength(0);

    const processed = await apiPost(request, 'mesas_notificaciones_email_registrar_envios', {
      id_lote: 999999, limite: 1,
    }, admin);
    expect(processed.status).toBe(200);
    expect(processed.data.exito).toBe(true);
    expect(Number(processed.data.data?.procesados_en_lote || 0)).toBe(0);
    expect(currentState().notificaciones_items).toHaveLength(0);
  });

  test('cambios docentes inexistentes: aplicar falla e ignorar es idempotente sin crear residuos', async ({ request }) => {
    const fixture = await setupMesasFixture();
    const admin = await login(request);
    await createArmado(request, admin, fixture, 'docentes');
    const pending = expectOk(await apiGet(request, 'mesas_docentes_cambios_pendientes', {}, admin), 'listar cambios docentes');
    expect(Array.isArray(pending.data?.cambios || pending.data)).toBe(true);

    expectFail(await apiPost(request, 'mesas_docentes_cambios_aplicar', { id_cambio: 999999 }, admin), [404, 422, 500], /cambio|encontr|interno/i, 'aplicar cambio inexistente');
    const ignored = expectOk(await apiPost(request, 'mesas_docentes_cambios_ignorar', { id_cambio: 999999 }, admin), 'ignorar cambio inexistente');
    expect(ignored.mensaje).toMatch(/ya no estaba pendiente/i);
    expect(currentState().cambios_docente).toHaveLength(0);
  });
});
