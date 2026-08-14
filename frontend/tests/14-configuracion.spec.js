const { test, expect } = require('./fixtures/auth.fixture');
const { env, unique } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { loginPageByApi } = require('./helpers/auth.helper');
const { attachRuntimeGuards, expectToast } = require('./helpers/diagnostics.helper');
const { cleanupAll, snapshotFormConfig } = require('./helpers/cleanup.helper');

const PASS = 'PwTest123!';

function usuarioId(row) {
  return Number(row?.id_usuario || row?.idUsuarioMaster || row?.id || 0);
}

async function currentAdminRow(request, auth) {
  const result = expectOk(
    await apiGet(request, 'configuracion_usuarios_listar', { activo: 'todos' }, auth),
    'listar usuarios para resolver sesión actual'
  );
  const current = (result.data || []).find((row) => row.es_usuario_actual);
  expect(current, 'La API de configuración debe marcar el usuario de la sesión actual.').toBeTruthy();
  return current;
}

async function getConfig(request, auth) {
  return expectOk(
    await apiGet(request, 'form_admin_obtener_config_inscripcion', {}, auth),
    'form_admin_obtener_config_inscripcion'
  );
}

function configPayload(current, overrides = {}) {
  return {
    id_config: Number(current?.id_config || 0),
    titulo: current?.titulo || current?.nombre || `${env.prefix} FORMULARIO`,
    inicio: current?.inicio || current?.insc_inicio || '2035-03-01 08:00:00',
    fin: current?.fin || current?.insc_fin || '2035-03-05 18:00:00',
    mensaje_cerrado: current?.mensaje_cerrado || 'INSCRIPCIÓN CERRADA POR TESTING',
    color_principal: current?.color_principal || current?.colorPrincipal || '#c6171d',
    activo: 1,
    ...overrides,
  };
}

function modalField(dialog, text, selector = 'input') {
  return dialog.locator('label').filter({ hasText: text }).locator(selector).first();
}

async function openUsuarios(page) {
  await page.goto('/configuracion');
  await expect(page.getByRole('heading', { name: 'Configuración de Mesas' })).toBeVisible();
  await page.getByRole('button', { name: /Configuración de usuarios/i }).click();
  await expect(page.getByText('Configuración de usuarios', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Listado de usuarios' })).toBeVisible();
}

async function openFormulario(page) {
  await page.goto('/configuracion');
  await expect(page.getByRole('heading', { name: 'Configuración de Mesas' })).toBeVisible();
  await page.getByRole('button', { name: /Configuración del formulario/i }).click();
  await expect(page.getByText('Mesas · Configuración del formulario', { exact: true })).toBeVisible();
  await expect(page.locator('#cfgFormMainForm')).toBeVisible();
}

async function findUserRow(page, name) {
  const search = page.getByPlaceholder('Usuario, email o rol');
  await search.fill(name);
  const row = page.getByRole('row').filter({ hasText: name }).last();
  await expect(row).toBeVisible();
  return row;
}

test.describe('14 · Configuración (usuarios + formulario)', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('portada: muestra las dos configuraciones y permite entrar/volver sin cambiar de ruta', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await loginPageByApi(page);
    await page.goto('/configuracion');

    await expect(page.getByRole('heading', { name: 'Configuración de Mesas' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Configuración del formulario/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Configuración de usuarios/i })).toBeVisible();

    await page.getByRole('button', { name: /Configuración del formulario/i }).click();
    await expect(page.locator('#cfgFormMainForm')).toBeVisible();
    await page.getByRole('button', { name: 'Volver', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Configuración de Mesas' })).toBeVisible();
    await expect(page).toHaveURL(/\/configuracion(?:$|[?#])/);

    await page.getByRole('button', { name: /Configuración de usuarios/i }).click();
    await expect(page.getByRole('table', { name: 'Listado de usuarios' })).toBeVisible();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Configuración de Mesas' })).toBeVisible();
    await expect(page).toHaveURL(/\/configuracion(?:$|[?#])/);

    guard.assertClean('portada Configuración');
  });

  test('usuarios API: listado/obtener, validaciones, CRUD, aliases, autoprotección y rol vista', async ({ request }) => {
    const admin = await login(request);
    const current = await currentAdminRow(request, admin);
    const currentId = usuarioId(current);

    const list = expectOk(
      await apiGet(request, 'configuracion_usuarios_listar', { activo: 'todos' }, admin),
      'configuracion_usuarios_listar'
    );
    expect(Array.isArray(list.data)).toBe(true);
    expect(list.resumen).toEqual(expect.objectContaining({
      total: expect.any(Number),
      activos: expect.any(Number),
      bajas: expect.any(Number),
      admins: expect.any(Number),
      vista: expect.any(Number),
    }));

    const obtained = expectOk(
      await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: currentId }, admin),
      'configuracion_usuarios_obtener'
    );
    expect(usuarioId(obtained.data)).toBe(currentId);

    expectFail(
      await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: 0 }, admin),
      422,
      /falta el usuario/i,
      'obtener sin id'
    );
    expectFail(
      await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: 999999999 }, admin),
      404,
      /no encontrado/i,
      'obtener inexistente'
    );

    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: '', rol: 'vista', contrasena: PASS }, admin),
      422,
      /nombre de usuario/i,
      'guardar sin usuario'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: 'PW', rol: 'vista', contrasena: PASS }, admin),
      422,
      /entre 3 y 100/i,
      'usuario demasiado corto'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: `${env.prefix}<>`, rol: 'vista', contrasena: PASS }, admin),
      422,
      /caracteres no permitidos/i,
      'caracteres inválidos'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: unique('BADMAIL'), email_recuperacion: 'no-es-email', rol: 'vista', contrasena: PASS }, admin),
      422,
      /email.*no es válido/i,
      'email inválido'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: unique('BADROLE'), rol: 'superadmin', contrasena: PASS }, admin),
      422,
      /rol válido|rol.*inválido/i,
      'rol inválido'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: unique('NOPASS'), rol: 'vista' }, admin),
      422,
      /contraseña.*usuario nuevo|contraseña.*6/i,
      'alta sin contraseña'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: unique('SHORTPASS'), rol: 'vista', contrasena: '12345' }, admin),
      422,
      /6 caracteres/i,
      'contraseña corta'
    );

    const user = unique('CFGAPI');
    const email1 = `${user.toLowerCase()}@example.com`;
    const created = expectOk(await apiPost(request, 'configuracion_usuarios_guardar', {
      usuario: user,
      email_recuperacion: email1,
      rol: 'vista',
      activo: 1,
      contrasena: PASS,
    }, admin), 'crear usuario configuración');
    const createdId = usuarioId(created.data);
    expect(createdId).toBeGreaterThan(0);
    expect(created.data).toEqual(expect.objectContaining({ usuario: user, rol: 'vista', activo: 1 }));

    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', { usuario: user, rol: 'vista', contrasena: PASS }, admin),
      409,
      /ya existe/i,
      'usuario duplicado'
    );

    const email2 = `${user.toLowerCase()}-edit@example.com`;
    const updated = expectOk(await apiPost(request, 'configuracion_usuarios_guardar', {
      id_usuario: createdId,
      usuario: user,
      email_recuperacion: email2,
      rol: 'vista',
      activo: 1,
    }, admin), 'editar usuario sin cambiar contraseña');
    expect(updated.data.email_recuperacion).toBe(email2);

    expectOk(
      await apiPost(request, 'configuracion_usuarios_cambiar_estado', { id_usuario: createdId, activo: 0 }, admin),
      'baja explícita'
    );
    let row = expectOk(
      await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: createdId }, admin),
      'leer usuario dado de baja'
    ).data;
    expect(Number(row.activo)).toBe(0);

    expectOk(await apiPost(request, 'configuracion_usuarios_alta', { id_usuario: createdId }, admin), 'alias alta');
    row = expectOk(await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: createdId }, admin), 'leer usuario alta').data;
    expect(Number(row.activo)).toBe(1);

    expectOk(await apiPost(request, 'configuracion_usuarios_baja', { id_usuario: createdId }, admin), 'alias baja');
    row = expectOk(await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: createdId }, admin), 'leer usuario baja alias').data;
    expect(Number(row.activo)).toBe(0);

    expectOk(await apiPost(request, 'configuracion_usuarios_alta', { id_usuario: createdId }, admin), 'reactivar para login');

    expectFail(
      await apiPost(request, 'configuracion_usuarios_cambiar_estado', { id_usuario: currentId, activo: 0 }, admin),
      422,
      /darte de baja a vos mismo/i,
      'autobaja bloqueada'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_eliminar', { id_usuario: currentId }, admin),
      422,
      /eliminar tu propio usuario/i,
      'autoeliminación bloqueada'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', {
        id_usuario: currentId,
        usuario: current.usuario,
        email_recuperacion: current.email_recuperacion || '',
        rol: 'vista',
        activo: 1,
      }, admin),
      422,
      /propio acceso administrador|propio.*administrador/i,
      'no quitar propio rol admin'
    );

    const vista = await login(request, user, PASS);
    expectFail(
      await apiGet(request, 'configuracion_usuarios_listar', { activo: 'todos' }, vista),
      403,
      /permisos/i,
      'vista no lista usuarios de configuración'
    );
    expectFail(
      await apiPost(request, 'configuracion_usuarios_guardar', {
        usuario: unique('VISTANOCREATE'), rol: 'vista', contrasena: PASS,
      }, vista),
      403,
      /permisos/i,
      'vista no crea usuarios'
    );

    expectOk(await apiPost(request, 'configuracion_usuarios_eliminar', { id_usuario: createdId }, admin), 'eliminar usuario creado');
    expectFail(
      await apiGet(request, 'configuracion_usuarios_obtener', { id_usuario: createdId }, admin),
      404,
      /no encontrado/i,
      'usuario eliminado no existe'
    );
  });

  test('usuarios UI: alta, validaciones, contraseña, edición, búsqueda, pestañas, baja/alta, eliminar y sesión actual protegida', async ({ page }) => {
    const guard = attachRuntimeGuards(page);
    await loginPageByApi(page);
    await openUsuarios(page);

    const user = unique('CFGUI');
    const email1 = `${user.toLowerCase()}@example.com`;
    const email2 = `${user.toLowerCase()}-edit@example.com`;

    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    let dialog = page.getByRole('dialog').filter({ hasText: 'Crear usuario' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expectToast(page, /Ingresá el nombre de usuario/i);

    const userInput = modalField(dialog, 'Usuario');
    const mailInput = modalField(dialog, 'Email de recuperación');
    const roleSelect = modalField(dialog, 'Rol', 'select');
    const stateSelect = modalField(dialog, 'Estado', 'select');
    const passInput = dialog.locator('label.cfgUsersMuField--password').nth(0).locator('input');
    const repeatInput = dialog.locator('label.cfgUsersMuField--password').nth(1).locator('input');

    await userInput.fill('PW');
    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expectToast(page, /al menos 3 caracteres/i);

    await userInput.fill(user);
    await mailInput.fill(email1);
    await roleSelect.selectOption('vista');
    await stateSelect.selectOption('1');
    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expectToast(page, /Ingresá una contraseña/i);

    await passInput.fill('12345');
    await repeatInput.fill('12345');
    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expectToast(page, /al menos 6 caracteres/i);

    await passInput.fill(PASS);
    await repeatInput.fill(`${PASS}X`);
    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expectToast(page, /no coinciden/i);

    // Los toggles deben cambiar realmente el type de los dos inputs.
    await repeatInput.fill(PASS);
    await expect(passInput).toHaveAttribute('type', 'password');
    await dialog.locator('.cfgUsersPasswordToggle').first().click();
    await expect(passInput).toHaveAttribute('type', 'text');
    await dialog.locator('.cfgUsersPasswordToggle').first().click();
    await expect(passInput).toHaveAttribute('type', 'password');

    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, /Usuario guardado correctamente/i);

    let row = await findUserRow(page, user);
    await expect(row).toContainText(email1);
    await expect(row).toContainText('Vista');
    await expect(row).toContainText('Activo');

    await row.getByTitle('Editar usuario').click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Editar usuario' });
    await expect(dialog).toBeVisible();
    await modalField(dialog, 'Email de recuperación').fill(email2);
    await expect(dialog.getByText(/Dejá ambos campos vacíos/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await openUsuarios(page);
    row = await findUserRow(page, user);
    await expect(row).toContainText(email2);

    // Limpiar búsqueda.
    await expect(page.getByTitle('Limpiar búsqueda')).toBeVisible();
    await page.getByTitle('Limpiar búsqueda').click();
    await expect(page.getByPlaceholder('Usuario, email o rol')).toHaveValue('');

    // La sesión actual debe tener estado y eliminación bloqueados.
    const currentRow = page.getByRole('row').filter({ hasText: 'Sesión actual' }).first();
    await expect(currentRow).toBeVisible();
    await expect(currentRow.getByTitle('No podés dar de baja la sesión actual')).toBeDisabled();
    await expect(currentRow.getByTitle('No podés eliminar la sesión actual')).toBeDisabled();

    row = await findUserRow(page, user);
    await row.getByTitle('Dar de baja').click();
    let confirm = page.getByRole('dialog', { name: 'Dar de baja usuario' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();

    row = await findUserRow(page, user);
    await row.getByTitle('Dar de baja').click();
    confirm = page.getByRole('dialog', { name: 'Dar de baja usuario' });
    await confirm.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(confirm).toBeHidden();

    await page.getByRole('button', { name: 'Dados de baja', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Listado de usuarios' })).toBeVisible();
    row = await findUserRow(page, user);
    await expect(row).toContainText('Baja');
    await row.getByTitle('Dar de alta').click();
    confirm = page.getByRole('dialog', { name: 'Dar de alta usuario' });
    await confirm.getByRole('button', { name: 'Dar de alta' }).click();
    await expect(confirm).toBeHidden();

    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    row = await findUserRow(page, user);
    await expect(row).toContainText('Activo');

    await row.getByTitle('Eliminar usuario').click();
    confirm = page.getByRole('dialog', { name: 'Eliminar usuario' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();

    row = await findUserRow(page, user);
    await row.getByTitle('Eliminar usuario').click();
    confirm = page.getByRole('dialog', { name: 'Eliminar usuario' });
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(confirm).toBeHidden();
    await expectToast(page, /Usuario eliminado correctamente/i);
    await expect(page.getByRole('row').filter({ hasText: user })).toHaveCount(0);

    // Crear y cancelar con botón + Escape cubre ambos cierres del modal.
    await page.getByRole('button', { name: 'Activos', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Crear usuario' });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Crear usuario' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    guard.assertClean('Configuración usuarios UI');
  });

  test('formulario API: lectura, validaciones, CSRF, guardado + aliases, persistencia y permisos', async ({ request }) => {
    snapshotFormConfig();
    const admin = await login(request);
    const current = await getConfig(request, admin);

    // La configuración que consume el formulario público debe responder igual
    // por todos los aliases históricos que siguen expuestos por el router.
    for (const action of ['form_obtener_config_inscripcion', 'obtener_config_inscripcion', 'formulario_obtener_config_inscripcion']) {
      const publicConfig = expectOk(await apiGet(request, action), action);
      expect(Number(publicConfig.id_config)).toBe(Number(current.id_config));
      expect(String(publicConfig.titulo || publicConfig.nombre || '')).toBe(String(current.titulo || current.nombre || ''));
    }

    expectFail(
      await apiPost(request, 'form_guardar_config_inscripcion', configPayload(current, { titulo: '' }), admin),
      422,
      /título/i,
      'formulario sin título'
    );
    expectFail(
      await apiPost(request, 'form_guardar_config_inscripcion', configPayload(current, { inicio: '', fin: '' }), admin),
      422,
      /fecha y hora/i,
      'formulario sin fechas'
    );
    expectFail(
      await apiPost(request, 'form_guardar_config_inscripcion', configPayload(current, {
        inicio: '2035-03-05 10:00:00',
        fin: '2035-03-05 09:00:00',
      }), admin),
      422,
      /inicio debe ser anterior/i,
      'orden de fechas inválido'
    );

    const csrf = await apiPost(
      request,
      'form_guardar_config_inscripcion',
      configPayload(current),
      admin,
      { csrf: false, headers: { 'X-Requested-With': 'NotAjax' } }
    );
    expectFail(csrf, 403, /CSRF/i, 'CSRF estricto sin token ni XHR');

    const title1 = unique('FORMAPI');
    const first = expectOk(await apiPost(request, 'form_guardar_config_inscripcion', configPayload(current, {
      titulo: title1,
      inicio: '2035-04-01 08:00:00',
      fin: '2035-04-03 18:30:00',
      mensaje_cerrado: `${env.prefix} MENSAJE CERRADO`,
      color_principal: '#123456',
    }), admin), 'guardar configuración formulario');
    const idConfig = Number(first.id_config || 0);
    expect(idConfig).toBeGreaterThan(0);
    expect(first.titulo).toBe(title1.toUpperCase());
    expect(first.mensaje_cerrado).toBe(`${env.prefix} MENSAJE CERRADO`.toUpperCase());
    expect(first.color_principal).toBe('#123456');

    const titleAlias1 = unique('FORMALIAS1');
    expectOk(await apiPost(request, 'guardar_config_inscripcion', configPayload(first, {
      id_config: idConfig,
      titulo: titleAlias1,
    }), admin), 'alias guardar_config_inscripcion');

    const titleAlias2 = unique('FORMALIAS2');
    expectOk(await apiPost(request, 'formulario_guardar_config_inscripcion', configPayload(first, {
      id_config: idConfig,
      titulo: titleAlias2,
    }), admin), 'alias formulario_guardar_config_inscripcion');

    const persisted = await getConfig(request, admin);
    expect(Number(persisted.id_config)).toBe(idConfig);
    expect(persisted.titulo).toBe(titleAlias2.toUpperCase());

    for (const action of ['form_obtener_config_inscripcion', 'obtener_config_inscripcion', 'formulario_obtener_config_inscripcion']) {
      const publicPersisted = expectOk(await apiGet(request, action), `${action} persistencia pública`);
      expect(Number(publicPersisted.id_config)).toBe(idConfig);
      expect(publicPersisted.titulo).toBe(titleAlias2.toUpperCase());
    }

    const vistaUser = unique('CFGFORMVISTA');
    expectOk(await apiPost(request, 'configuracion_usuarios_guardar', {
      usuario: vistaUser,
      rol: 'vista',
      activo: 1,
      contrasena: PASS,
    }, admin), 'crear vista para permisos formulario');
    const vista = await login(request, vistaUser, PASS);

    // La configuración privada queda completamente fuera del rol vista.
    expectFail(
      await apiGet(request, 'form_admin_obtener_config_inscripcion', {}, vista),
      403,
      /permisos/i,
      'vista no lee configuración privada del formulario'
    );
    expectFail(
      await apiPost(request, 'form_guardar_config_inscripcion', configPayload(persisted, { titulo: unique('VISTANOSAVE') }), vista),
      403,
      /permisos/i,
      'vista no guarda formulario'
    );
  });

  test('formulario UI: carga, validaciones, archivos, quitar visuales localmente, guardar y persistir', async ({ page }) => {
    snapshotFormConfig();
    const guard = attachRuntimeGuards(page);
    const admin = await loginPageByApi(page);
    await openFormulario(page);

    const form = page.locator('#cfgFormMainForm');
    const title = form.locator('label').filter({ hasText: 'Título del formulario' }).locator('input');
    const startBlock = form.locator('.cfgFormDateBlock').filter({ hasText: 'Inicio' }).first();
    const endBlock = form.locator('.cfgFormDateBlock').filter({ hasText: 'Fin' }).first();
    const startDate = startBlock.locator('input[type="date"]');
    const endDate = endBlock.locator('input[type="date"]');
    const startSelects = startBlock.locator('select');
    const endSelects = endBlock.locator('select');
    const message = form.locator('label').filter({ hasText: 'Mensaje cuando está cerrado' }).locator('textarea');
    const colorText = form.locator('.cfgFormColorInputWrap input[type="text"]');
    const uploadBoxes = form.locator('.cfgFormUploadBox');
    const logoFile = uploadBoxes.nth(0).locator('input[type="file"]');
    const fondoFile = uploadBoxes.nth(1).locator('input[type="file"]');
    const save = page.getByRole('button', { name: 'Guardar', exact: true }).first();

    await expect(title).toBeVisible();
    const originalTitle = await title.inputValue();

    await title.fill('');
    await save.click();
    await expectToast(page, /Ingresá un título para el formulario/i);
    await title.fill(originalTitle || `${env.prefix} FORMULARIO`);

    await startDate.fill('2035-05-10');
    await startSelects.nth(0).selectOption('10');
    await startSelects.nth(1).selectOption('00');
    await endDate.fill('2035-05-10');
    await endSelects.nth(0).selectOption('09');
    await endSelects.nth(1).selectOption('00');
    await save.click();
    await expectToast(page, /inicio debe ser anterior/i);

    await logoFile.setInputFiles({
      name: 'no-es-imagen.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('archivo de testing'),
    });
    await expectToast(page, /logo debe ser una imagen/i);

    await fondoFile.setInputFiles({
      name: 'fondo-grande.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
    });
    await expectToast(page, /fondo debe pesar menos de 5 MB/i);

    // Estos botones deben cambiar la previsualización, pero NO guardamos todavía:
    // al volver y reabrir, el backend debe seguir intacto.
    await form.getByRole('button', { name: 'Quitar logo' }).click();
    await form.getByRole('button', { name: 'Quitar fondo' }).click();
    await page.getByRole('button', { name: 'Volver', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Configuración de Mesas' })).toBeVisible();
    await page.getByRole('button', { name: /Configuración del formulario/i }).click();
    await expect(page.locator('#cfgFormMainForm')).toBeVisible();

    const form2 = page.locator('#cfgFormMainForm');
    const title2 = form2.locator('label').filter({ hasText: 'Título del formulario' }).locator('input');
    const start2 = form2.locator('.cfgFormDateBlock').filter({ hasText: 'Inicio' }).first();
    const end2 = form2.locator('.cfgFormDateBlock').filter({ hasText: 'Fin' }).first();
    const testTitle = unique('FORMUI');

    await title2.fill(testTitle);
    await start2.locator('input[type="date"]').fill('2035-06-01');
    await start2.locator('select').nth(0).selectOption('08');
    await start2.locator('select').nth(1).selectOption('15');
    await end2.locator('input[type="date"]').fill('2035-06-04');
    await end2.locator('select').nth(0).selectOption('17');
    await end2.locator('select').nth(1).selectOption('45');
    await form2.locator('label').filter({ hasText: 'Mensaje cuando está cerrado' }).locator('textarea').fill(`${env.prefix} CERRADO UI`);
    await form2.locator('.cfgFormColorInputWrap input[type="text"]').fill('#345678');
    await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
    await expectToast(page, /Configuración guardada correctamente/i);

    const persisted = await getConfig(page.request, admin);
    expect(persisted.titulo).toBe(testTitle.toUpperCase());
    expect(persisted.inicio).toBe('2035-06-01 08:15:00');
    expect(persisted.fin).toBe('2035-06-04 17:45:00');
    expect(persisted.mensaje_cerrado).toBe(`${env.prefix} CERRADO UI`.toUpperCase());
    expect(persisted.color_principal).toBe('#345678');

    // Volver/reabrir fuerza una lectura nueva y comprueba persistencia visual.
    await page.getByRole('button', { name: 'Volver', exact: true }).first().click();
    await page.getByRole('button', { name: /Configuración del formulario/i }).click();
    await expect(page.locator('#cfgFormMainForm').locator('label').filter({ hasText: 'Título del formulario' }).locator('input')).toHaveValue(testTitle.toUpperCase());

    guard.assertClean('Configuración formulario UI');
  });
});
