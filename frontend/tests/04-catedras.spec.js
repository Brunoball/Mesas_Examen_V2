const { test, expect } = require('./fixtures/auth.fixture');
const { unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { cleanupAll, findSafeCatedra, snapshotCatedra } = require('./helpers/cleanup.helper');

const PASS = 'PwTest123!';

async function createDocente(request, auth, label = 'CATDOC') {
  const name = `${unique(label)} DOCENTE`;
  const res = await apiPost(request, 'docentes_guardar', {
    docente: name,
    dni: '40222333',
    email: `${name.replace(/\s+/g, '').toLowerCase()}@example.com`,
    activo: 1,
    observacion: 'DOCENTE PARA TEST DE CATEDRAS',
    indisponibilidades: [],
  }, auth);
  return { id: Number(expectOk(res, 'crear docente para cátedra').id_docente), name };
}

async function getCatedra(request, auth, id) {
  const res = await apiGet(request, 'catedras_listar', { pagina: 1, por_pagina: 100, busqueda: id }, auth);
  const data = expectOk(res, `buscar cátedra ${id}`);
  return (data.data || []).find((row) => Number(row.id_catedra) === Number(id));
}

test.describe('04 · Cátedras', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('API: catálogos/listado, validaciones, asignar/quitar, alias y permisos de vista', async ({ request }) => {
    const admin = await login(request);
    const safe = findSafeCatedra();
    snapshotCatedra(safe.id_catedra);

    const catalogs = expectOk(await apiGet(request, 'catedras_catalogos', {}, admin), 'catedras_catalogos');
    const cargos = catalogs.data?.cargos || [];
    expect(cargos.length, 'Se necesita al menos un cargo activo para probar cátedras').toBeGreaterThan(0);
    const cargo = cargos[0];

    const listing = expectOk(await apiGet(request, 'catedras_listar', { pagina: 1, por_pagina: 10 }, admin), 'catedras_listar');
    expect(Array.isArray(listing.data)).toBe(true);
    expect(listing.paginacion).toBeTruthy();

    const d1 = await createDocente(request, admin, 'CATAPI1');
    const d2 = await createDocente(request, admin, 'CATAPI2');

    expectFail(
      await apiPost(request, 'catedras_asignar_docente', { id_catedra: 0, docentes: [] }, admin),
      422,
      /cátedra.*válida/i,
      'id cátedra inválido'
    );
    expectFail(
      await apiPost(request, 'catedras_asignar_docente', {
        id_catedra: safe.id_catedra,
        docentes: [{ id_docente: 999999999, id_cargo: cargo.id_cargo, llamado_mesa: true }],
      }, admin),
      422,
      /docentes.*no existe|inactivo/i,
      'docente inexistente'
    );
    expectFail(
      await apiPost(request, 'catedras_asignar_docente', {
        id_catedra: safe.id_catedra,
        docentes: [{ id_docente: d1.id, id_cargo: 999999999, llamado_mesa: true }],
      }, admin),
      422,
      /cargo.*no existe|inactivo/i,
      'cargo inexistente'
    );
    expectFail(
      await apiPost(request, 'catedras_asignar_docente', {
        id_catedra: safe.id_catedra,
        docentes: [
          { id_docente: d1.id, id_cargo: cargo.id_cargo, llamado_mesa: false },
          { id_docente: d1.id, id_cargo: cargo.id_cargo, llamado_mesa: true },
        ],
      }, admin),
      422,
      /repetir el mismo docente/i,
      'docente repetido'
    );

    expectOk(await apiPost(request, 'catedras_asignar_docente', {
      id_catedra: safe.id_catedra,
      docentes: [
        { id_docente: d1.id, id_cargo: cargo.id_cargo, llamado_mesa: false },
        { id_docente: d2.id, id_cargo: cargo.id_cargo, llamado_mesa: true },
      ],
    }, admin), 'asignar dos docentes');

    let current = await getCatedra(request, admin, safe.id_catedra);
    expect(current).toBeTruthy();
    expect((current.docentes_asignados || []).map((x) => Number(x.id_docente))).toEqual(expect.arrayContaining([d1.id, d2.id]));
    expect((current.docentes_asignados || []).filter((x) => x.llamado_mesa)).toHaveLength(1);
    expect(Number((current.docentes_asignados || []).find((x) => x.llamado_mesa)?.id_docente)).toBe(d2.id);

    expectOk(await apiPost(request, 'catedras_asignar_docente', { id_catedra: safe.id_catedra, docentes: [] }, admin), 'quitar todos');
    current = await getCatedra(request, admin, safe.id_catedra);
    expect(current.docentes_asignados || []).toHaveLength(0);

    expectOk(await apiPost(request, 'catedras_asignar_docentes', {
      id_catedra: safe.id_catedra,
      docentes: [{ id_docente: d1.id, id_cargo: cargo.id_cargo, llamado_mesa: true }],
    }, admin), 'alias catedras_asignar_docentes');
    current = await getCatedra(request, admin, safe.id_catedra);
    expect((current.docentes_asignados || []).some((x) => Number(x.id_docente) === d1.id)).toBe(true);

    const vistaUser = unique('VISTACAT');
    expectOk(await apiPost(request, 'registro', { nombre: vistaUser, contrasena: PASS, rol: 'vista' }, admin), 'crear vista cátedra');
    const vista = await login(request, vistaUser, PASS);
    expectFail(
      await apiGet(request, 'catedras_listar', { pagina: 1, por_pagina: 5 }, vista),
      403,
      /permisos/i,
      'vista no puede leer cátedras'
    );
    expectFail(
      await apiPost(request, 'catedras_asignar_docente', { id_catedra: safe.id_catedra, docentes: [] }, vista),
      403,
      /permisos/i,
      'vista no asigna cátedras'
    );
  });

  test('UI: búsqueda exacta, modal completo, agregar, llamado, editar, quitar y persistir', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(page.request);
    const safe = findSafeCatedra();
    snapshotCatedra(safe.id_catedra);
    const testDoc = await createDocente(page.request, admin, 'CATUI');

    await loginPageByApi(page);
    await page.goto('/catedras');
    await expect(page.getByRole('table', { name: 'Listado de cátedras' })).toBeVisible();

    const search = page.getByPlaceholder('Búsqueda');
    await search.fill(String(safe.id_catedra));
    let row = page.getByRole('row').filter({ hasText: safe.materia }).last();
    await expect(row).toBeVisible();
    await row.getByTitle('Asignar docentes y cargos').click();

    let dialog = page.getByRole('dialog').filter({ hasText: /Asignar docentes y cargos/i });
    await expect(dialog).toBeVisible();
    const docSearch = dialog.locator('label').filter({ hasText: 'Buscar docente activo' }).locator('input');
    await docSearch.fill(testDoc.name);
    const docenteSelect = dialog.getByRole('combobox', { name: 'Docente' });
    await expect(docenteSelect).toBeVisible();
    await docenteSelect.selectOption({ label: testDoc.name.toUpperCase() });
    const cargoSelect = dialog.getByRole('combobox', { name: 'Cargo en esta cátedra' });
    await expect(cargoSelect).toBeVisible();
    await cargoSelect.selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Agregar' }).click();

    const assignment = dialog.locator('.catedras-modal-asignacionItem').filter({ hasText: testDoc.name });
    await expect(assignment).toBeVisible();
    const callButton = assignment.getByRole('button', { name: /Llamar|Llamado/ });
    if (await callButton.isEnabled()) await callButton.click();
    await expect(assignment.getByRole('button', { name: 'Llamado' })).toBeVisible();

    // Editar la asignación y cancelar edición cubre ambos estados del formulario interno.
    await assignment.click();
    await expect(dialog.getByRole('button', { name: 'Actualizar' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar edición' }).click();
    await expect(dialog.getByRole('button', { name: 'Agregar' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Guardar asignaciones' }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await page.getByPlaceholder('Búsqueda').fill(String(safe.id_catedra));
    row = page.getByRole('row').filter({ hasText: safe.materia }).last();
    await expect(row).toContainText(testDoc.name);

    await row.getByTitle('Asignar docentes y cargos').click();
    dialog = page.getByRole('dialog').filter({ hasText: /Asignar docentes y cargos/i });
    await expect(dialog.locator('.catedras-modal-asignacionItem').filter({ hasText: testDoc.name })).toBeVisible();
    await dialog.getByRole('button', { name: 'Quitar todos' }).click();
    await expect(dialog.getByText('Todavía no hay docentes asignados a esta cátedra.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Guardar asignaciones' }).click();

    await page.reload();
    await page.getByPlaceholder('Búsqueda').fill(String(safe.id_catedra));
    row = page.getByRole('row').filter({ hasText: safe.materia }).last();
    await expect(row).toContainText('Sin docentes');

    guard.assertClean('Cátedras UI');
  });

  test('UI: filtros, limpiar búsqueda, modal cancelar/Escape y exportación Excel', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const safe = findSafeCatedra();
    snapshotCatedra(safe.id_catedra);
    await loginPageByApi(page);
    await page.goto('/catedras');
    await expect(page.getByRole('table', { name: 'Listado de cátedras' })).toBeVisible();

    const filters = page.locator('.catedras-filterSelect');
    await expect(filters).toHaveCount(2);
    if ((await filters.nth(0).locator('option').count()) > 1) {
      await filters.nth(0).selectOption({ index: 1 });
      await filters.nth(0).selectOption('');
    }
    if ((await filters.nth(1).locator('option').count()) > 1) {
      await filters.nth(1).selectOption({ index: 1 });
      await filters.nth(1).selectOption('');
    }

    const search = page.getByPlaceholder('Búsqueda');
    await search.fill('PWTEST SIN RESULTADO');
    await expect(page.getByTitle('Limpiar búsqueda')).toBeVisible();
    await page.getByTitle('Limpiar búsqueda').click();
    await expect(search).toHaveValue('');

    await search.fill(String(safe.id_catedra));
    const safeRow = page.getByRole('row').filter({ hasText: safe.materia }).last();
    await expect(safeRow, 'La cátedra segura debe existir para probar modal/exportación').toBeVisible();
    const firstAssign = safeRow.getByTitle('Asignar docentes y cargos');
    await expect(firstAssign).toBeVisible();
    await firstAssign.click();
    let dialog = page.getByRole('dialog').filter({ hasText: /Asignar docentes y cargos/i });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await firstAssign.click();
    dialog = page.getByRole('dialog').filter({ hasText: /Asignar docentes y cargos/i });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Exportar' }).click();
    dialog = page.getByRole('dialog', { name: 'Exportar cátedras' });
    const currentScope = dialog.getByLabel('Exportar solo actual');
    await expect(currentScope).toBeVisible();
    await dialog.locator('label').filter({ hasText: /Exportar solo actual/i }).click();
    await expect(currentScope).toBeChecked();
    await dialog.getByLabel('Excel').check();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByRole('button', { name: 'Exportar' }).click();
    dialog = page.getByRole('dialog', { name: 'Exportar cátedras' });
    const allScope = dialog.getByLabel('Exportar todos los registros');
    await expect(allScope).toBeVisible();
    await dialog.locator('label').filter({ hasText: /Exportar todos los registros/i }).click();
    await expect(allScope).toBeChecked();
    await dialog.getByLabel('Excel').check();
    const downloadAll = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await downloadAll).suggestedFilename()).toMatch(/\.xlsx$/i);

    guard.assertClean('Cátedras filtros/exportación');
  });
});
