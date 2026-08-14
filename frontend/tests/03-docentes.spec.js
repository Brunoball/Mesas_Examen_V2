const { test, expect } = require('./fixtures/auth.fixture');
const { unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail, listAll } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');

const PASS = 'PwTest123!';

async function createDocente(request, auth, overrides = {}) {
  const name = overrides.docente || `${unique('DOCENTE')} PRUEBA`;
  const result = await apiPost(request, 'docentes_guardar', {
    docente: name,
    dni: overrides.dni || '40111222',
    email: overrides.email || `${name.replace(/\s+/g, '').toLowerCase()}@example.com`,
    activo: overrides.activo ?? 1,
    observacion: overrides.observacion || 'CREADO POR PLAYWRIGHT',
    indisponibilidades: overrides.indisponibilidades || [],
  }, auth);
  const data = expectOk(result, 'crear docente de testing');
  return { id: Number(data.id_docente), name };
}

function modalField(dialog, text, selector = 'input, textarea, select') {
  return dialog.locator('label').filter({ hasText: text }).locator(selector).first();
}

test.describe('03 · Docentes', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('API: catálogos, listado, obtener, validaciones, CRUD, disponibilidad y permisos', async ({ request }) => {
    const admin = await login(request);

    const catalogs = expectOk(await apiGet(request, 'docentes_catalogos', {}, admin), 'docentes_catalogos');
    expect(catalogs.data).toBeTruthy();
    expect(Array.isArray(catalogs.data.turnos || catalogs.data.turnos_disponibles || [])).toBe(true);

    const list = expectOk(await apiGet(request, 'docentes_listar', { pagina: 1, por_pagina: 10, activo: 1 }, admin), 'docentes_listar');
    expect(Array.isArray(list.data)).toBe(true);
    expect(list.paginacion).toBeTruthy();

    expectFail(
      await apiPost(request, 'docentes_guardar', { docente: '', email: '' }, admin),
      422,
      /nombre.*obligatorio/i,
      'docente sin nombre'
    );
    expectFail(
      await apiPost(request, 'docentes_guardar', { docente: unique('BADMAIL'), email: 'correo-invalido' }, admin),
      422,
      /formato válido/i,
      'email inválido'
    );

    const created = await createDocente(request, admin, {
      indisponibilidades: [{ id_dia_semana: 1, id_turno: null, fecha: null }],
    });

    const obtained = expectOk(
      await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin),
      'docentes_obtener'
    );
    expect(Number(obtained.data.id_docente)).toBe(created.id);
    expect(String(obtained.data.docente)).toBe(created.name.toUpperCase());
    expect(Array.isArray(obtained.data.indisponibilidades || obtained.data.disponibilidades || [])).toBe(true);

    expectFail(
      await apiPost(request, 'docentes_guardar', { docente: created.name, email: 'otro@example.com' }, admin),
      409,
      /ya existe un docente/i,
      'docente duplicado'
    );

    const updatedName = `${created.name} EDITADO`;
    expectOk(await apiPost(request, 'docentes_guardar', {
      id_docente: created.id,
      docente: updatedName,
      dni: '40999888',
      email: 'pwtest.docente.editado@example.com',
      activo: 1,
      observacion: 'EDITADO POR PLAYWRIGHT',
      indisponibilidades: [{ id_dia_semana: 2, id_turno: null, fecha: null }],
    }, admin), 'editar docente');

    const afterUpdate = expectOk(await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin), 'obtener editado');
    expect(afterUpdate.data.docente).toBe(updatedName.toUpperCase());
    expect(afterUpdate.data.email).toBe('pwtest.docente.editado@example.com');

    expectOk(await apiPost(request, 'docentes_cambiar_estado', {
      ids_docentes: [created.id], activo: 0, motivo: 'BAJA PLAYWRIGHT',
    }, admin), 'dar de baja');
    let state = expectOk(await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin), 'obtener baja');
    expect(Number(state.data.activo)).toBe(0);

    expectOk(await apiPost(request, 'docentes_cambiar_estado', {
      ids_docentes: [created.id], activo: 1,
    }, admin), 'dar de alta');
    state = expectOk(await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin), 'obtener alta');
    expect(Number(state.data.activo)).toBe(1);

    // Contrato de aliases. Si docentes_dar_baja no interpreta el nombre de la acción,
    // este assert detecta inmediatamente la regresión.
    expectOk(await apiPost(request, 'docentes_dar_baja', { ids_docentes: [created.id] }, admin), 'alias docentes_dar_baja');
    state = expectOk(await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin), 'estado tras alias baja');
    expect(Number(state.data.activo), 'docentes_dar_baja debe dejar activo=0').toBe(0);

    expectOk(await apiPost(request, 'docentes_dar_alta', { ids_docentes: [created.id] }, admin), 'alias docentes_dar_alta');
    state = expectOk(await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin), 'estado tras alias alta');
    expect(Number(state.data.activo)).toBe(1);

    const vistaUser = unique('VISTADOC');
    expectOk(await apiPost(request, 'registro', { nombre: vistaUser, contrasena: PASS, rol: 'vista' }, admin), 'crear usuario vista');
    const vista = await login(request, vistaUser, PASS);
    expectFail(
      await apiGet(request, 'docentes_listar', { pagina: 1, por_pagina: 5 }, vista),
      403,
      /permisos/i,
      'vista no puede leer docentes'
    );
    expectFail(
      await apiPost(request, 'docentes_guardar', { docente: `${unique('DENIED')} DOCENTE` }, vista),
      403,
      /permisos/i,
      'vista no puede guardar docente'
    );

    expectOk(await apiPost(request, 'docentes_eliminar', { ids_docentes: [created.id] }, admin), 'eliminar docente');
    expectFail(
      await apiGet(request, 'docentes_obtener', { id_docente: created.id }, admin),
      [404, 422],
      /no existe|no encontrado/i,
      'docente eliminado no debe existir'
    );
  });

  test('UI: alta, restricciones de campos, indisponibilidad, persistencia, info, edición, baja/alta y eliminación', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await loginPageByApi(page);
    await page.goto('/docentes');
    await expect(page.getByRole('table', { name: 'Listado de docentes' })).toBeVisible();

    const name = `${unique('DOCUI')} DOCENTE PRUEBA`;
    const email = `${name.replace(/\s+/g, '').toLowerCase()}@example.com`;

    await page.getByRole('button', { name: /Agregar docente/i }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Nuevo docente|Agregar docente|Cargar docente/i).first()).toBeVisible();

    await dialog.getByRole('button', { name: 'Guardar docente' }).click();
    await expect(page.getByText('El nombre del docente es obligatorio.')).toBeVisible();

    await modalField(dialog, 'Nombre y apellido').fill(name.toLowerCase());
    await expect(modalField(dialog, 'Nombre y apellido')).toHaveValue(name.toUpperCase());

    const dni = modalField(dialog, 'DNI');
    await dni.fill('40ab11-22.33');
    await expect(dni).toHaveValue('40112233');

    const mail = modalField(dialog, 'Gmail / email');
    await mail.fill('MAIL-INVALIDO');
    await dialog.getByRole('button', { name: 'Guardar docente' }).click();
    await expect(page.getByText(/Gmail\/email ingresado no tiene un formato válido/i)).toBeVisible();
    await mail.fill(email);
    await modalField(dialog, 'Comentarios opcionales', 'textarea').fill('DOCENTE CREADO DESDE PLAYWRIGHT');

    await dialog.getByRole('tab', { name: 'Indisponibilidad' }).click();
    await expect(dialog.getByText('Sin indisponibilidades cargadas')).toBeVisible();
    await dialog.getByRole('button', { name: 'Agregar regla' }).click();
    const rule = dialog.locator('.gm-scheduleCard').first();
    await rule.locator('label').filter({ hasText: 'Día semanal' }).locator('select').selectOption({ index: 1 });
    await rule.locator('label').filter({ hasText: 'Turno' }).locator('select').selectOption({ index: 1 });

    await dialog.getByRole('button', { name: /Ver ayuda de indisponibilidad/i }).click();
    await expect(page.getByRole('dialog').filter({ hasText: /indisponibilidad/i }).last()).toBeVisible();
    await page.keyboard.press('Escape');

    dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Guardar docente' }) });
    await dialog.getByRole('button', { name: 'Guardar docente' }).click();
    await expect(page.getByText('Docente agregado correctamente.')).toBeVisible();

    const search = page.getByPlaceholder('Busqueda');
    await search.fill(name);
    let row = page.getByRole('row').filter({ hasText: name }).last();
    await expect(row).toBeVisible();

    await page.reload();
    await page.getByPlaceholder('Busqueda').fill(name);
    row = page.getByRole('row').filter({ hasText: name }).last();
    await expect(row).toBeVisible();

    await row.getByTitle('Ver información').click();
    const info = page.getByRole('dialog').filter({ hasText: name });
    await expect(info).toBeVisible();
    await expect(info.getByText(email, { exact: false })).toBeVisible();
    await info.getByRole('button', { name: 'Cerrar' }).last().click();

    row = page.getByRole('row').filter({ hasText: name }).last();
    await row.getByTitle('Editar docente').click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Ficha principal' }).click();
    await modalField(dialog, 'Comentarios opcionales', 'textarea').fill('EDITADO POR PLAYWRIGHT');
    await dialog.getByRole('tab', { name: 'Indisponibilidad' }).click();
    await expect(dialog.locator('.gm-scheduleCard')).toHaveCount(1);
    await dialog.getByTitle('Quitar regla').click();
    await expect(dialog.locator('.gm-scheduleCard')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Guardar docente' }).click();
    await expect(page.getByText('Docente actualizado correctamente.')).toBeVisible();

    await page.getByPlaceholder('Busqueda').fill(name);
    row = page.getByRole('row').filter({ hasText: name }).last();
    await row.getByTitle('Dar de baja').click();
    let confirm = page.getByRole('dialog', { name: 'Dar de baja docente' });
    await confirm.locator('textarea').fill('BAJA AUTOMATIZADA');
    await confirm.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByText('Docente dado de baja correctamente.').last()).toBeVisible();

    await page.getByRole('button', { name: /Dados de baja/i }).click();
    await page.getByPlaceholder('Busqueda').fill(name);
    row = page.getByRole('row').filter({ hasText: name }).last();
    await expect(row).toBeVisible();
    await row.getByTitle('Dar de alta').click();
    confirm = page.getByRole('dialog', { name: 'Dar de alta docente' });
    await confirm.getByRole('button', { name: 'Dar de alta' }).click();
    await expect(page.getByText('Docente dado de alta correctamente.').last()).toBeVisible();

    await page.getByRole('button', { name: /Activos/i }).click();
    await page.getByPlaceholder('Busqueda').fill(name);
    row = page.getByRole('row').filter({ hasText: name }).last();
    await row.getByTitle('Eliminar').click();
    confirm = page.getByRole('dialog', { name: /Eliminar docente/i });
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Docente eliminado correctamente.').last()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);

    guard.assertClean('Docentes UI');
  });

  test('UI: búsqueda, limpiar búsqueda, tabs y exportación Excel de página actual y todos', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(page.request);
    const seeded = await createDocente(page.request, admin, { docente: `${unique('DOCEXPORT')} DOCENTE EXPORT` });

    await loginPageByApi(page);
    await page.goto('/docentes');
    await expect(page.getByRole('table', { name: 'Listado de docentes' })).toBeVisible();

    const rows = await listAll(page.request, 'docentes_listar', admin, { activo: 1 });
    expect(rows.some((row) => Number(row.id_docente) === seeded.id), 'El docente PWTEST de exportación debe estar listado').toBe(true);

    const search = page.getByPlaceholder('Busqueda');
    await search.fill(String(rows[0].docente || '').slice(0, 8));
    await expect(page.getByTitle('Limpiar búsqueda')).toBeVisible();
    await page.getByTitle('Limpiar búsqueda').click();
    await expect(search).toHaveValue('');

    await page.getByRole('button', { name: /Dados de baja/i }).click();
    await page.getByRole('button', { name: /Activos/i }).click();

    await page.getByRole('button', { name: 'Exportar' }).click();
    let dialog = page.getByRole('dialog', { name: 'Exportar docentes' });
    const currentScope = dialog.getByLabel('Exportar solo actual');
    await dialog.locator('label').filter({ hasText: /Exportar solo actual/i }).click();
    await expect(currentScope).toBeChecked();
    await dialog.getByLabel('Excel').check();
    const download1 = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await download1).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByRole('button', { name: 'Exportar' }).click();
    dialog = page.getByRole('dialog', { name: 'Exportar docentes' });
    const all = dialog.getByLabel('Exportar todos los registros');
    await expect(all).toBeVisible();
    await dialog.locator('label').filter({ hasText: /Exportar todos los registros/i }).click();
    await expect(all).toBeChecked();
    await dialog.getByLabel('Excel').check();
    const download2 = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await download2).suggestedFilename()).toMatch(/\.xlsx$/i);

    guard.assertClean('Docentes exportación');
  });
});
