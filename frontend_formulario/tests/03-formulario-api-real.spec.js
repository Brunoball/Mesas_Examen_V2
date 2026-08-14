const { test, expect } = require('@playwright/test');
const { env, assertSafeLocalConfiguration, unique } = require('./helpers/env.helper');
const { get, post, login, expectOk, expectFail } = require('./helpers/api.helper');
const {
  assertSafeDatabase,
  cleanupAll,
  snapshotFormConfig,
  snapshotPrevias,
  disableConfirmationEmail,
  findSafeCatedra,
} = require('./helpers/cleanup.helper');

function mysqlDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function testDni() {
  return String(70_000_000 + ((Date.now() + process.pid * 7919) % 19_000_000)).slice(0, 8);
}

test.describe.serial('03 · Formulario · integración real local', () => {
  let admin;
  let safe;

  test.beforeAll(async ({ request }) => {
    assertSafeLocalConfiguration();
    assertSafeDatabase();
    cleanupAll();
    snapshotFormConfig();
    snapshotPrevias();
    disableConfirmationEmail();

    admin = await login(request);
    const authTenantId = Number(
      admin.tenant?.idTenant
      ?? admin.usuario?.idTenant
      ?? admin.usuario?.id_tenant
      ?? admin.usuario?.tenant_id
      ?? 0,
    );
    expect(authTenantId, 'El admin inició sesión en otro tenant').toBe(env.expectedTenantId);

    const current = expectOk(
      await get(request, 'form_obtener_config_inscripcion'),
      'configuración pública inicial',
    );
    expectOk(await post(request, 'form_guardar_config_inscripcion', {
      id_config: Number(current.id_config || 0),
      nombre: `${env.prefix} FORMULARIO AUTOMÁTICO`,
      insc_inicio: mysqlDate(new Date(Date.now() - 60 * 60 * 1000)),
      insc_fin: mysqlDate(new Date(Date.now() + 6 * 60 * 60 * 1000)),
      mensaje_cerrado: 'CERRADO POR TESTING',
      color_principal: '#13579b',
      activo: 1,
    }, admin), 'abrir ventana temporal de testing');
    safe = findSafeCatedra();
  });

  test.afterAll(() => {
    cleanupAll();
  });

  test('configuración y sus aliases son públicos, coherentes y resuelven el tenant correcto', async ({ request }) => {
    const actions = [
      'form_obtener_config_inscripcion',
      'obtener_config_inscripcion',
      'formulario_obtener_config_inscripcion',
    ];
    for (const action of actions) {
      const data = expectOk(await get(request, action), action);
      expect(data.hay_config).toBe(true);
      expect(data.abierta).toBe(true);
      expect(Number(data.tenant?.idTenant), `${action}: tenant incorrecto`).toBe(env.expectedTenantId);
      expect(data.tenant?.resuelto).toBe(true);
      expect(data.titulo).toContain(env.prefix);
      expect(data.color_principal).toBe('#13579b');
    }
  });

  test('métodos y validaciones públicas rechazan entradas inválidas sin autenticación', async ({ request }) => {
    for (const action of ['form_buscar_previas', 'buscar_previas', 'formulario_buscar_previas']) {
      expectFail(await get(request, action), 405, /Método no permitido/i, `${action} por GET`);
      expectFail(await post(request, action, { dni: '123', gmail: 'x@gmail.com' }), 200, /DNI inválido/i, `${action} DNI inválido`);
    }

    const missing = await post(request, 'form_buscar_previas', { dni: '79999999', gmail: 'nadie@gmail.com' });
    expectFail(missing, 200, /No se encontraron.*previas.*DNI/i, 'DNI inexistente');

    expectFail(await post(request, 'form_registrar_inscripcion', {
      dni: '123', gmail: 'x@gmail.com', materias: [{ id_materia: 1, curso_id: 1, division_id: 1 }],
    }), 200, /DNI inválido/i, 'registro DNI inválido');
    expectFail(await post(request, 'form_registrar_inscripcion', {
      dni: '79999999', gmail: 'correo-invalido', materias: [{ id_materia: 1, curso_id: 1, division_id: 1 }],
    }), 200, /email válido/i, 'registro email inválido');
    expectFail(await post(request, 'form_registrar_inscripcion', {
      dni: '79999999', gmail: 'x@gmail.com', materias: [],
    }), 200, /No se enviaron materias/i, 'registro sin materias');
  });

  test('flujo real completo: crea previa aislada, busca, inscribe, persiste, bloquea duplicado y limpia', async ({ request }) => {
    const dni = testDni();
    const apellido = unique('ALUMNO');
    const today = mysqlDate(new Date()).slice(0, 10);

    expectOk(await post(request, 'previas_guardar', {
      dni,
      apellido,
      nombre: 'FORMULARIO AUTOMÁTICO',
      cursando_id_curso: Number(safe.id_curso),
      cursando_id_division: Number(safe.id_division),
      id_materia: Number(safe.id_materia),
      materia_id_curso: Number(safe.id_curso),
      materia_id_division: Number(safe.id_division),
      id_condicion: 3,
      anio: new Date().getFullYear(),
      fecha_carga: today,
      inscripcion: 0,
    }, admin), 'crear previa aislada');

    const listed = expectOk(await get(request, 'previas_listar', {
      activo: 1, dni, pagina: 1, por_pagina: 100,
    }, admin), 'resolver previa aislada');
    const previa = (listed.data || []).find((row) => Number(row.id_materia) === Number(safe.id_materia));
    expect(previa, 'No se encontró la previa creada').toBeTruthy();

    const searched = expectOk(await post(request, 'form_buscar_previas', {
      dni, gmail: 'pwform@gmail.com',
    }), 'buscar previa pública');
    expect(searched.alumno.dni).toBe(dni);
    expect(searched.alumno.nombre.toUpperCase()).toContain(apellido.toUpperCase());
    expect(searched.alumno.materias).toHaveLength(1);
    expect(Number(searched.alumno.materias[0].inscripcion)).toBe(0);

    const selected = searched.alumno.materias[0];
    const registration = expectOk(await post(request, 'form_registrar_inscripcion', {
      dni,
      gmail: 'pwform@gmail.com',
      nombre_alumno: searched.alumno.nombre,
      materias: [{
        id_previa: selected.id_previa,
        id_materia: selected.id_materia,
        curso_id: selected.curso_id,
        division_id: selected.division_id,
        materia: selected.materia,
      }],
      materias_nombres: [selected.materia],
    }), 'registrar inscripción pública');
    expect(Number(registration.id_inscripcion)).toBeGreaterThan(0);
    expect(registration.dni).toBe(dni);
    expect(registration.gmail).toBe('pwform@gmail.com');
    expect(Number(registration.marcadas)).toBe(1);

    const persisted = expectOk(await post(request, 'form_buscar_previas', {
      dni, gmail: 'pwform@gmail.com',
    }), 'verificar persistencia');
    expect(Number(persisted.alumno.materias[0].inscripcion)).toBe(1);
    expect(persisted.ya_inscripto).toBe(true);

    const duplicate = await post(request, 'form_registrar_inscripcion', {
      dni,
      gmail: 'pwform@gmail.com',
      materias: [{
        id_previa: selected.id_previa,
        id_materia: selected.id_materia,
        curso_id: selected.curso_id,
        division_id: selected.division_id,
      }],
    });
    const duplicateData = expectFail(duplicate, 200, /ya fue inscripto/i, 'duplicado');
    expect(duplicateData.ya_inscripto).toBe(true);
  });
});
