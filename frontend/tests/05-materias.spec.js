const { test, expect } = require('./fixtures/auth.fixture');
const { unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards, expectToast } = require('./helpers/diagnostics.helper');
const { cleanupAll, findSafeCatedra } = require('./helpers/cleanup.helper');

const PASS = 'PwTest123!';

async function createArea(request, auth, label = 'AREA') {
  const name = unique(label).toUpperCase();
  const result = expectOk(await apiPost(request, 'areas_guardar', {
    area: name,
    activo: 1,
    materias: [],
  }, auth), 'crear área de testing');
  return { id: Number(result.id_area), name };
}

async function createMateria(request, auth, options = {}) {
  const name = (options.name || unique(options.label || 'MAT')).toUpperCase();
  const result = expectOk(await apiPost(request, 'materias_guardar', {
    materia: name,
    activo: options.activo ?? 1,
    ids_areas: options.idsAreas || [],
  }, auth), 'crear materia de testing');
  return { id: Number(result.id_materia), name };
}

async function listMaterias(request, auth) {
  return expectOk(await apiGet(request, 'materias_listar', {}, auth), 'materias_listar').materias || [];
}

async function listAreas(request, auth) {
  return expectOk(await apiGet(request, 'areas_listar', {}, auth), 'areas_listar').areas || [];
}

async function listCorrelativas(request, auth) {
  return expectOk(await apiGet(request, 'materias_correlativas_listar', {}, auth), 'materias_correlativas_listar').correlativas || [];
}

async function listTalleres(request, auth) {
  return expectOk(await apiGet(request, 'talleres_listar', {}, auth), 'talleres_listar').talleres || [];
}

async function createCorrelativaConMateriaTest(request, auth, safe, testMateria) {
  const result = expectOk(await apiPost(request, 'materias_correlativas_guardar', {
    id_materia: testMateria.id,
    id_curso: Number(safe.id_curso),
    id_materia_relacionada: Number(safe.id_materia),
    id_curso_relacionada: Number(safe.id_curso),
    tipo: 'anterior',
    activo: 1,
    bloquea_inscripcion: 1,
    bloquea_armado: 1,
    orden: 1,
  }, auth), 'crear correlativa de testing');
  return Number(result.id_materia_correlativa);
}

async function createTallerConCatedraSegura(request, auth, safe, label = 'TALLER') {
  const name = unique(label).toUpperCase();
  const result = expectOk(await apiPost(request, 'talleres_guardar', {
    taller: name,
    id_curso: Number(safe.id_curso),
    divisiones: [Number(safe.id_division)],
    catedras: [Number(safe.id_catedra)],
    activo: 1,
  }, auth), 'crear taller de testing');
  return { id: Number(result.id_taller), name };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchBox(page) {
  return page.getByPlaceholder('Buscar por materia, área, taller, curso o correlatividad');
}

test.describe('05 · Materias, áreas, correlativas y talleres', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('API: materias y áreas · catálogos, validaciones, CRUD, estado, asociaciones y permisos', async ({ request }) => {
    const admin = await login(request);

    const catalogs = expectOk(await apiGet(request, 'materias_catalogos', {}, admin), 'materias_catalogos');
    expect(Array.isArray(catalogs.areas)).toBe(true);
    expect(Array.isArray(catalogs.cursos)).toBe(true);
    expect(Array.isArray(catalogs.divisiones)).toBe(true);
    expect(Array.isArray(catalogs.materias)).toBe(true);

    // Contrato del endpoint global que usa el selector de materias por curso.
    // Probamos sus tres aliases para detectar regresiones del router.
    const safeGlobal = findSafeCatedra();
    for (const action of ['global_obtener_materias_por_curso', 'obtener_materias_por_curso', 'materias_por_curso']) {
      const byCourse = expectOk(await apiGet(request, action, {
        id_curso: Number(safeGlobal.id_curso),
        id_division: Number(safeGlobal.id_division),
      }, admin), action);
      const rows = byCourse.materias || byCourse.data || [];
      expect(Array.isArray(rows), `${action} debe devolver materias`).toBe(true);
      expect(rows.some((row) => Number(row.id_materia) === Number(safeGlobal.id_materia)), `${action} debe incluir la materia de la cátedra segura`).toBe(true);
    }

    expectFail(
      await apiPost(request, 'areas_guardar', { area: '', activo: 1 }, admin),
      null,
      /nombre del área.*obligatorio/i,
      'área sin nombre'
    );
    expectFail(
      await apiPost(request, 'materias_guardar', { materia: '', activo: 1 }, admin),
      null,
      /nombre de la materia.*obligatorio/i,
      'materia sin nombre'
    );
    const area = await createArea(request, admin, 'AREAAPI');
    const materia = await createMateria(request, admin, { label: 'MATAPI', idsAreas: [area.id] });

    let materias = await listMaterias(request, admin);
    let current = materias.find((row) => Number(row.id_materia) === materia.id);
    expect(current).toBeTruthy();
    expect(String(current.materia)).toBe(materia.name);
    expect(String(current.ids_areas || '').split(',').map(Number)).toContain(area.id);
    expect(String(current.areas || '').toUpperCase()).toContain(area.name);

    const renamed = `${materia.name} EDITADA`;
    expectOk(await apiPost(request, 'materias_guardar', {
      id_materia: materia.id,
      materia: renamed,
      activo: 1,
      ids_areas: [area.id],
    }, admin), 'editar materia');

    expectOk(await apiPost(request, 'materias_cambiar_estado', {
      id_materia: materia.id,
      activo: 0,
    }, admin), 'desactivar materia');
    materias = await listMaterias(request, admin);
    current = materias.find((row) => Number(row.id_materia) === materia.id);
    expect(Number(current.activo)).toBe(0);

    expectOk(await apiPost(request, 'materias_cambiar_estado', {
      id_materia: materia.id,
      activo: 1,
    }, admin), 'reactivar materia');

    expectOk(await apiPost(request, 'areas_guardar', {
      id_area: area.id,
      area: `${area.name} EDITADA`,
      activo: 1,
      materias: [materia.id],
    }, admin), 'editar área y asociar materia');

    const areas = await listAreas(request, admin);
    const currentArea = areas.find((row) => Number(row.id_area) === area.id);
    expect(currentArea).toBeTruthy();
    expect(String(currentArea.ids_materias || '').split(',').map(Number)).toContain(materia.id);

    const vistaUser = unique('VISTAMAT');
    expectOk(await apiPost(request, 'registro', { nombre: vistaUser, contrasena: PASS, rol: 'vista' }, admin), 'crear usuario vista materias');
    const vista = await login(request, vistaUser, PASS);
    expectFail(await apiGet(request, 'materias_listar', {}, vista), 403, /permisos/i, 'vista no lista materias');
    expectFail(await apiGet(request, 'areas_listar', {}, vista), 403, /permisos/i, 'vista no lista áreas');
    expectFail(
      await apiPost(request, 'materias_guardar', { materia: unique('VISTANO').toUpperCase(), activo: 1 }, vista),
      403,
      /permisos/i,
      'vista no guarda materia'
    );
    expectFail(
      await apiPost(request, 'areas_guardar', { area: unique('VISTAAREA').toUpperCase(), activo: 1 }, vista),
      403,
      /permisos/i,
      'vista no guarda área'
    );

    expectOk(await apiPost(request, 'materias_eliminar', { id_materia: materia.id }, admin), 'eliminar materia test');
    expectOk(await apiPost(request, 'areas_eliminar', { id_area: area.id }, admin), 'eliminar área test');
  });

  test('API: correlativas y talleres · validaciones, CRUD, cátedras reales y permisos', async ({ request }) => {
    const admin = await login(request);
    const safe = findSafeCatedra();
    const testMateria = await createMateria(request, admin, { label: 'MATCORR' });

    expectFail(
      await apiPost(request, 'materias_correlativas_guardar', {}, admin),
      null,
      /debe completar/i,
      'correlativa incompleta'
    );
    const corrId = await createCorrelativaConMateriaTest(request, admin, safe, testMateria);
    let correlativas = await listCorrelativas(request, admin);
    let corr = correlativas.find((row) => Number(row.id_materia_correlativa) === corrId);
    expect(corr).toBeTruthy();
    expect(Number(corr.id_materia)).toBe(testMateria.id);
    expect(Number(corr.id_materia_relacionada)).toBe(Number(safe.id_materia));

    expectOk(await apiPost(request, 'materias_correlativas_guardar', {
      id_materia_correlativa: corrId,
      id_materia: testMateria.id,
      id_curso: Number(safe.id_curso),
      id_materia_relacionada: Number(safe.id_materia),
      id_curso_relacionada: Number(safe.id_curso),
      tipo: 'anterior',
      activo: 1,
      bloquea_inscripcion: 0,
      bloquea_armado: 1,
      orden: 2,
    }, admin), 'editar correlativa');
    correlativas = await listCorrelativas(request, admin);
    corr = correlativas.find((row) => Number(row.id_materia_correlativa) === corrId);
    expect(Number(corr.bloquea_inscripcion)).toBe(0);
    expect(Number(corr.bloquea_armado)).toBe(1);

    const masivo = expectOk(await apiPost(request, 'materias_correlativas_guardar_masivo', {
      id_materia_anterior: Number(safe.id_materia),
      id_curso_anterior: Number(safe.id_curso),
      relaciones: [{
        id_materia: testMateria.id,
        id_curso: Number(safe.id_curso),
        bloquea_inscripcion: 1,
        bloquea_armado: 0,
      }],
      tipo: 'anterior',
    }, admin), 'guardar correlativa masiva');
    expect(Number(masivo.guardadas)).toBeGreaterThanOrEqual(1);
    correlativas = await listCorrelativas(request, admin);
    corr = correlativas.find((row) => Number(row.id_materia_correlativa) === corrId);
    expect(corr).toBeTruthy();
    expect(Number(corr.bloquea_inscripcion)).toBe(1);
    expect(Number(corr.bloquea_armado)).toBe(0);

    expectFail(
      await apiPost(request, 'materias_correlativas_autogenerar_por_materia', { id_materia: testMateria.id }, admin),
      null,
      /dos o más|dos o mas|no se puede generar/i,
      'autogenerado sin cadena en cátedras'
    );

    expectFail(
      await apiPost(request, 'talleres_guardar', { taller: '', id_curso: safe.id_curso }, admin),
      null,
      /nombre del taller.*obligatorio/i,
      'taller sin nombre'
    );
    expectFail(
      await apiPost(request, 'talleres_guardar', {
        taller: unique('TALLERINVALIDO').toUpperCase(),
        id_curso: Number(safe.id_curso),
        divisiones: [Number(safe.id_division)],
        catedras: [],
      }, admin),
      null,
      /al menos una cátedra/i,
      'taller sin cátedras'
    );

    const taller = await createTallerConCatedraSegura(request, admin, safe, 'TALLERAPI');
    let talleres = await listTalleres(request, admin);
    let current = talleres.find((row) => Number(row.id_taller) === taller.id);
    expect(current).toBeTruthy();
    expect(String(current.taller)).toBe(taller.name);
    expect(String(current.ids_catedras || '').split(',').map(Number)).toContain(Number(safe.id_catedra));

    // Endpoints incrementales/legacy que siguen expuestos por el backend.
    expectOk(await apiPost(request, 'talleres_materia_eliminar', {
      id_taller: taller.id,
      id_catedra: Number(safe.id_catedra),
    }, admin), 'quitar cátedra individual del taller');
    talleres = await listTalleres(request, admin);
    current = talleres.find((row) => Number(row.id_taller) === taller.id);
    expect(String(current.ids_catedras || '').split(',').filter(Boolean).map(Number)).not.toContain(Number(safe.id_catedra));

    expectOk(await apiPost(request, 'talleres_materia_agregar', {
      id_taller: taller.id,
      id_catedra: Number(safe.id_catedra),
    }, admin), 'agregar cátedra individual al taller');
    talleres = await listTalleres(request, admin);
    current = talleres.find((row) => Number(row.id_taller) === taller.id);
    expect(String(current.ids_catedras || '').split(',').filter(Boolean).map(Number)).toContain(Number(safe.id_catedra));

    const areaTaller = await createArea(request, admin, 'AREATALLER');
    expectOk(await apiPost(request, 'areas_guardar', {
      id_area: areaTaller.id,
      area: areaTaller.name,
      activo: 1,
      materias: [Number(safe.id_materia)],
    }, admin), 'vincular área PWTEST a materia segura');
    const assignedArea = expectOk(await apiPost(request, 'talleres_materias_asignar_area', {
      id_taller: taller.id,
      id_curso: Number(safe.id_curso),
      id_division: Number(safe.id_division),
      id_area: areaTaller.id,
    }, admin), 'asignar área completa al taller');
    expect(Number(assignedArea.cantidad)).toBeGreaterThanOrEqual(1);
    talleres = await listTalleres(request, admin);
    current = talleres.find((row) => Number(row.id_taller) === taller.id);
    expect(String(current.ids_catedras || '').split(',').filter(Boolean).map(Number)).toContain(Number(safe.id_catedra));

    const catedras = expectOk(await apiGet(request, 'talleres_catedras_por_curso_divisiones', {
      id_curso: Number(safe.id_curso),
      divisiones: Number(safe.id_division),
    }, admin), 'cátedras disponibles para taller');
    const listaCatedras = catedras.catedras || catedras.data || [];
    expect(listaCatedras.some((row) => Number(row.id_catedra) === Number(safe.id_catedra))).toBe(true);

    const tallerRenamed = `${taller.name} EDITADO`;
    expectOk(await apiPost(request, 'talleres_guardar', {
      id_taller: taller.id,
      taller: tallerRenamed,
      id_curso: Number(safe.id_curso),
      divisiones: [Number(safe.id_division)],
      catedras: [Number(safe.id_catedra)],
      activo: 1,
    }, admin), 'editar taller');
    talleres = await listTalleres(request, admin);
    current = talleres.find((row) => Number(row.id_taller) === taller.id);
    expect(String(current.taller)).toBe(tallerRenamed);

    const vistaUser = unique('VISTATALLER');
    expectOk(await apiPost(request, 'registro', { nombre: vistaUser, contrasena: PASS, rol: 'vista' }, admin), 'crear vista taller');
    const vista = await login(request, vistaUser, PASS);
    expectFail(await apiGet(request, 'materias_correlativas_listar', {}, vista), 403, /permisos/i, 'vista no lista correlativas');
    expectFail(await apiGet(request, 'talleres_listar', {}, vista), 403, /permisos/i, 'vista no lista talleres');
    expectFail(
      await apiPost(request, 'talleres_guardar', {
        taller: unique('VISTAT').toUpperCase(),
        id_curso: Number(safe.id_curso),
        divisiones: [Number(safe.id_division)],
        catedras: [Number(safe.id_catedra)],
      }, vista),
      403,
      /permisos/i,
      'vista no guarda taller'
    );
    expectFail(
      await apiPost(request, 'materias_correlativas_eliminar', { id_materia_correlativa: corrId }, vista),
      403,
      /permisos/i,
      'vista no elimina correlativa'
    );

    expectOk(await apiPost(request, 'materias_correlativas_eliminar', { id_materia_correlativa: corrId }, admin), 'eliminar correlativa test');
    expectOk(await apiPost(request, 'talleres_eliminar', { id_taller: taller.id }, admin), 'eliminar taller test');
  });

  test('UI: materias · listado, áreas, edición, estado, búsqueda y exportación', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(page.request);
    const area = await createArea(page.request, admin, 'AREAUI');
    const materia = await createMateria(page.request, admin, { label: 'MATUI', idsAreas: [area.id] });
    const materiaEdited = `${materia.name} EDITADA`;

    await loginPageByApi(page);
    await page.goto('/materias');
    await expect(page.getByRole('table', { name: 'Listado de materias' })).toBeVisible();

    let search = searchBox(page);
    await search.fill(materia.name);
    let row = page.getByRole('row').filter({ hasText: materia.name }).last();
    await expect(row).toBeVisible();
    await expect(row).toContainText(area.name);
    await expect(row).toContainText('ACTIVA');

    await row.getByTitle('Editar').click();
    let dialog = page.getByRole('dialog', { name: 'Editar materia' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Nombre de la materia').fill(materiaEdited);
    await dialog.getByRole('button', { name: 'Inactiva' }).click();
    await dialog.getByRole('button', { name: 'Guardar materia' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, /materia guardada correctamente/i);

    search = searchBox(page);
    await search.fill(materiaEdited);
    row = page.getByRole('row').filter({ hasText: materiaEdited }).last();
    await expect(row).toBeVisible();
    await expect(row).toContainText('INACTIVA');

    // La UI original cambia el estado desde el modal de edición. No agregamos botones nuevos a la tabla.
    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar materia' });
    await dialog.getByRole('button', { name: 'Activa', exact: true }).click();
    await dialog.getByRole('button', { name: 'Guardar materia' }).click();
    await expect(dialog).toBeHidden();

    search = searchBox(page);
    await search.fill(materiaEdited);
    row = page.getByRole('row').filter({ hasText: materiaEdited }).last();
    await expect(row).toBeVisible();
    await expect(row).toContainText('ACTIVA');

    await page.getByTitle('Limpiar búsqueda').click();
    await expect(searchBox(page)).toHaveValue('');

    await page.getByRole('button', { name: 'Exportar' }).click();
    let exportDialog = page.getByRole('dialog', { name: /Exportar materias/i });
    await exportDialog.locator('label').filter({ hasText: /Exportar solo actual/i }).click();
    await exportDialog.getByLabel('Excel').check();
    const downloadCurrent = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await downloadCurrent).suggestedFilename()).toMatch(/\.xlsx$/i);

    await page.getByRole('button', { name: 'Exportar' }).click();
    exportDialog = page.getByRole('dialog', { name: /Exportar materias/i });
    await exportDialog.locator('label').filter({ hasText: /Exportar todos los registros/i }).click();
    await exportDialog.getByLabel('Excel').check();
    const downloadAll = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: 'Exportar' }).click();
    expect((await downloadAll).suggestedFilename()).toMatch(/\.xlsx$/i);

    guard.assertClean('Materias UI');
  });

  test('UI: áreas · alta, validación, vincular materia, editar, buscar y eliminar', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(page.request);
    const materia = await createMateria(page.request, admin, { label: 'MATPARAAREA' });
    const areaName = unique('AREAUIFULL').toUpperCase();
    const areaEdited = `${areaName} EDITADA`;

    await loginPageByApi(page);
    await page.goto('/materias?seccion=areas');
    await expect(page.getByRole('table', { name: 'Listado de áreas' })).toBeVisible();

    await page.getByRole('button', { name: 'Nueva área' }).click();
    let dialog = page.getByRole('dialog', { name: 'Nueva área' });
    await dialog.getByRole('button', { name: 'Guardar área' }).click();
    await expectToast(page, /nombre del área es obligatorio/i);

    await dialog.getByLabel('Nombre del área').fill(areaName.toLowerCase());
    await dialog.getByRole('tab', { name: /Materias del área/i }).click();
    await dialog.getByLabel('Buscar materia').fill(materia.name);
    const add = dialog.getByRole('button', { name: 'Agregar' });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(dialog.getByText(materia.name, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Guardar área' }).click();
    await expect(dialog).toBeHidden();

    let search = searchBox(page);
    await search.fill(areaName);
    let row = page.getByRole('row').filter({ hasText: areaName }).last();
    await expect(row).toBeVisible();
    await expect(row).toContainText(materia.name);

    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar área' });
    await dialog.getByLabel('Nombre del área').fill(areaEdited);
    await dialog.getByRole('button', { name: 'Guardar área' }).click();
    await expect(dialog).toBeHidden();

    search = searchBox(page);
    await search.fill(areaEdited);
    row = page.getByRole('row').filter({ hasText: areaEdited }).last();
    await expect(row).toBeVisible();

    await row.getByTitle('Eliminar').click();
    const confirm = page.getByRole('dialog', { name: 'Eliminar área' });
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: areaEdited })).toHaveCount(0);

    guard.assertClean('Áreas UI');
  });

  test('UI: correlativas · pestañas, validaciones, búsqueda, edición/cancelación y eliminación segura', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const admin = await login(page.request);
    const safe = findSafeCatedra();
    const materia = await createMateria(page.request, admin, { label: 'MATCORRUI' });
    await createCorrelativaConMateriaTest(page.request, admin, safe, materia);

    await loginPageByApi(page);
    await page.goto('/materias?seccion=correlativas');
    await expect(page.getByRole('table', { name: 'Listado de correlativas' })).toBeVisible();

    await page.getByRole('button', { name: 'Nueva correlatividad' }).click();
    let dialog = page.getByRole('dialog', { name: 'Nueva correlatividad' });
    await dialog.getByRole('button', { name: /Guardar/i }).click();
    await expectToast(page, /seleccionar el curso\/año anterior/i);
    await dialog.getByRole('tab', { name: /Autogenerar por materia/i }).click();
    await expect(dialog.getByRole('tab', { name: /Autogenerar por materia/i })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('tab', { name: /Manual \/ varias juntas/i }).click();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    const search = searchBox(page);
    await search.fill(materia.name);
    let row = page.getByRole('row').filter({ hasText: materia.name }).last();
    await expect(row).toBeVisible();

    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar correlatividad' });
    await expect(dialog.getByText(/Materia anterior \/ correlativa base/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    row = page.getByRole('row').filter({ hasText: materia.name }).last();
    await row.getByTitle('Eliminar').click();
    const confirm = page.getByRole('dialog', { name: 'Eliminar correlatividad' });
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: materia.name })).toHaveCount(0);

    await page.getByTitle('Limpiar búsqueda').click();
    await expect(searchBox(page)).toHaveValue('');

    guard.assertClean('Correlativas UI');
  });

  test('UI: talleres · alta con curso/división/cátedra real, validaciones, edición, búsqueda y eliminación', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    const safe = findSafeCatedra();
    const tallerName = unique('TALLERUI').toUpperCase();
    const tallerEdited = `${tallerName} EDITADO`;

    await loginPageByApi(page);
    await page.goto('/materias?seccion=talleres');
    await expect(page.getByRole('table', { name: 'Listado de talleres' })).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo taller' }).click();
    let dialog = page.getByRole('dialog', { name: 'Nuevo taller' });
    await dialog.getByRole('button', { name: 'Guardar taller' }).click();
    await expectToast(page, /nombre del taller es obligatorio/i);

    await dialog.getByLabel('Nombre del taller').fill(tallerName.toLowerCase());
    await dialog.getByLabel('Curso / año del taller').selectOption(String(safe.id_curso));

    const divisionLabel = dialog.locator('label.materia-check').filter({ hasText: new RegExp(escapeRegex(safe.nombre_division), 'i') }).first();
    await expect(divisionLabel).toBeVisible();
    const divisionCheckbox = divisionLabel.getByRole('checkbox');
    await divisionLabel.click();
    await expect(divisionCheckbox).toBeChecked();

    await dialog.getByRole('tab', { name: /Cátedras/i }).click();
    const catedraLabel = dialog.locator('label.materia-check').filter({ hasText: new RegExp(escapeRegex(safe.materia), 'i') }).first();
    await expect(catedraLabel).toBeVisible();
    const catedraCheckbox = catedraLabel.getByRole('checkbox');
    await catedraLabel.click();
    await expect(catedraCheckbox).toBeChecked();
    await dialog.getByRole('button', { name: 'Guardar taller' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, /taller guardado correctamente/i);

    let search = searchBox(page);
    await search.fill(tallerName);
    let row = page.getByRole('row').filter({ hasText: tallerName }).last();
    await expect(row).toBeVisible();
    await expect(row).toContainText(String(safe.nombre_curso));
    await expect(row).toContainText(String(safe.nombre_division));

    await row.getByTitle('Editar').click();
    dialog = page.getByRole('dialog', { name: 'Editar taller' });
    await dialog.getByLabel('Nombre del taller').fill(tallerEdited);
    await dialog.getByRole('button', { name: 'Guardar taller' }).click();
    await expect(dialog).toBeHidden();

    search = searchBox(page);
    await search.fill(tallerEdited);
    row = page.getByRole('row').filter({ hasText: tallerEdited }).last();
    await expect(row).toBeVisible();

    await row.getByTitle('Eliminar').click();
    const confirm = page.getByRole('dialog', { name: 'Eliminar taller' });
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: tallerEdited })).toHaveCount(0);

    guard.assertClean('Talleres UI');
  });
});
