const { test, expect } = require('./fixtures/auth.fixture');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { env } = require('./helpers/env.helper');
const { apiGet, apiPost, login, expectOk, expectFail } = require('./helpers/api.helper');
const { cleanupAll } = require('./helpers/cleanup.helper');
const { attachRuntimeGuards } = require('./helpers/diagnostics.helper');
const { assertFrontendUsesConfiguredBackend } = require('./helpers/ui.helper');
const { VISTA_ALLOWED_GET_ACTIONS, createVistaAuth } = require('./helpers/roles.helper');

const CURRENT_SPECS = [
  '00-cobertura-total.spec.js',
  '01-login.spec.js',
  '02-dashboard.spec.js',
  '03-docentes.spec.js',
  '04-catedras.spec.js',
  '05-materias.spec.js',
  '06-estadisticas.spec.js',
  '07-previas.spec.js',
  '08-mesas-armado.spec.js',
  '09-mesas-edicion-choques.spec.js',
  '10-mesas-alumnos-resultados.spec.js',
  '11-mesas-historial-cierre.spec.js',
  '12-mesas-ui.spec.js',
  '13-mesas-edicion-profunda.spec.js',
  '13-mesas-contratos.spec.js',
  '14-configuracion.spec.js',
  '15-roles.spec.js',
];

const ROUTE_CONTRACTS = [
  {
    name: 'Mesas de examen',
    route: 'modules/mesas/route.php',
    spec: '13-mesas-contratos.spec.js',
    strict: false,
    actions: [
      'mesas_examen_listar',
      'mesas_armado_parametros',
      'mesas_armado_crear',
      'mesas_armado_crear_docentes',
      'mesas_armado_eliminar_mesas',
      'mesas_armado_grupos_finales',
      'mesas_armado_grupos_finales_docentes',
      'mesas_grupos_listar',
      'mesas_no_agrupadas_listar',
    ],
  },
  {
    name: 'Login',
    route: 'modules/login/route.php',
    spec: '01-login.spec.js',
    strict: true,
    actions: [
      'inicio',
      'registro',
      'auth_usuario_actual',
      'usuario_actual',
      'recuperar_contrasena_solicitar',
      'recuperar_contrasena_validar',
      'recuperar_contrasena_guardar',
      'debug_saas_login',
    ],
  },
  {
    name: 'Dashboard',
    route: 'modules/dashbord/route.php',
    spec: '02-dashboard.spec.js',
    strict: true,
    actions: ['dashbord_resumen', 'dashboard_resumen'],
  },
  {
    name: 'Docentes',
    route: 'modules/docentes/route.php',
    spec: '03-docentes.spec.js',
    strict: true,
    actions: [
      'docentes_catalogos',
      'docentes_listar',
      'docentes_obtener',
      'docentes_guardar',
      'docentes_cambiar_estado',
      'docentes_dar_baja',
      'docentes_dar_alta',
      'docentes_eliminar',
    ],
  },
  {
    name: 'Cátedras',
    route: 'modules/catedras/route.php',
    spec: '04-catedras.spec.js',
    strict: true,
    actions: [
      'catedras_catalogos',
      'catedras_listar',
      'catedras_asignar_docente',
      'catedras_asignar_docentes',
    ],
  },
  {
    name: 'Materias',
    route: 'modules/materias/route.php',
    spec: '05-materias.spec.js',
    strict: true,
    actions: [
      'materias_catalogos',
      'materias_listar',
      'materias_guardar',
      'materias_eliminar',
      'materias_cambiar_estado',
      'materias_correlativas_listar',
      'materias_correlativas_guardar',
      'materias_correlativas_guardar_masivo',
      'materias_correlativas_autogenerar_por_materia',
      'materias_correlativas_eliminar',
      'talleres_listar',
      'talleres_catedras_por_curso_divisiones',
      'talleres_guardar',
      'talleres_eliminar',
      'talleres_materia_agregar',
      'talleres_materia_eliminar',
      'talleres_materias_asignar_area',
      'areas_listar',
      'areas_guardar',
      'areas_eliminar',
    ],
  },
  {
    name: 'Estadísticas',
    route: 'modules/estadisticas/route.php',
    spec: '06-estadisticas.spec.js',
    strict: true,
    actions: [
      'estadisticas_mesas_opciones',
      'estadisticas_historial_mesas_opciones',
      'estadisticas_mesas_resumen',
      'estadisticas_historial_mesas_resumen',
      'estadisticas_mesas_detalle',
      'estadisticas_historial_mesas_detalle',
    ],
  },
  {
    name: 'Previas',
    route: 'modules/previas/route.php',
    spec: '07-previas.spec.js',
    strict: true,
    actions: [
      'previas_catalogos',
      'previas_condiciones',
      'previas_listar',
      'previas_obtener',
      'previas_obtener_materias_inscripcion',
      'previas_obtener_permiso_examen',
      'previas_inscribir_manual',
      'previas_quitar_inscripcion',
      'previas_quitar_todas_inscripciones',
      'previas_guardar',
      'previas_cambiar_estado',
      'previas_dar_baja',
      'previas_dar_alta',
      'previas_verificar_eliminacion',
      'previas_eliminar',
      'previas_plantilla_importacion',
      'previas_previsualizar_excel',
      'previas_importar_excel',
    ],
  },
  {
    name: 'Configuración · usuarios',
    route: 'modules/configuracion/route.php',
    spec: '14-configuracion.spec.js',
    strict: true,
    actions: [
      'configuracion_usuarios_listar',
      'configuracion_usuarios_obtener',
      'configuracion_usuarios_guardar',
      'configuracion_usuarios_cambiar_estado',
      'configuracion_usuarios_alta',
      'configuracion_usuarios_baja',
      'configuracion_usuarios_eliminar',
    ],
  },
  {
    name: 'Configuración · formulario',
    route: 'modules/formulario/route.php',
    spec: '14-configuracion.spec.js',
    strict: false,
    actions: [
      'form_obtener_config_inscripcion',
      'obtener_config_inscripcion',
      'formulario_obtener_config_inscripcion',
      'form_admin_obtener_config_inscripcion',
      'form_guardar_config_inscripcion',
      'guardar_config_inscripcion',
      'formulario_guardar_config_inscripcion',
    ],
  },
  {
    name: 'Materias · aliases globales',
    route: 'modules/global/route.php',
    spec: '05-materias.spec.js',
    strict: false,
    actions: [
      'obtener_materias_por_curso',
      'global_obtener_materias_por_curso',
      'materias_por_curso',
    ],
  },
];

const FRONTEND_ACTION_CONTRACTS = [
  ['src/components/Login/api/loginApi.js', '01-login.spec.js'],
  ['src/components/Dashbord/api/dashbordApi.js', '02-dashboard.spec.js'],
  ['src/components/Docentes/api/docentesApi.js', '03-docentes.spec.js'],
  ['src/components/Catedras/api/catedrasApi.js', '04-catedras.spec.js'],
  ['src/components/Materias/api/materiasApi.js', '05-materias.spec.js'],
  ['src/components/Estadisticas/Estadisticas.jsx', '06-estadisticas.spec.js'],
  ['src/components/Previas/api/previasApi.js', '07-previas.spec.js'],
  ['src/components/Mesas_examen/api/mesasExamenApi.js', '13-mesas-contratos.spec.js'],
  ['src/components/Configuracion/Usuarios/api/configuracionUsuariosApi.js', '14-configuracion.spec.js'],
  ['src/components/Configuracion/Formulario/api/configuracionFormularioApi.js', '14-configuracion.spec.js'],
];

const VISTA_MUTATIONS = [
  'registro',
  'docentes_guardar',
  'docentes_cambiar_estado',
  'docentes_dar_baja',
  'docentes_dar_alta',
  'docentes_eliminar',
  'catedras_asignar_docente',
  'catedras_asignar_docentes',
  'materias_guardar',
  'materias_eliminar',
  'materias_cambiar_estado',
  'materias_correlativas_guardar',
  'materias_correlativas_guardar_masivo',
  'materias_correlativas_autogenerar_por_materia',
  'materias_correlativas_eliminar',
  'talleres_guardar',
  'talleres_eliminar',
  'talleres_materia_agregar',
  'talleres_materia_eliminar',
  'talleres_materias_asignar_area',
  'areas_guardar',
  'areas_eliminar',
  'previas_inscribir_manual',
  'previas_quitar_inscripcion',
  'previas_quitar_todas_inscripciones',
  'previas_guardar',
  'previas_cambiar_estado',
  'previas_dar_baja',
  'previas_dar_alta',
  'previas_eliminar',
  'previas_importar_excel',
  'mesas_armado_crear',
  'mesas_armado_crear_docentes',
  'mesas_armado_eliminar_mesas',
  'mesas_armado_grupos_finales',
  'mesas_armado_grupos_finales_docentes',
  'mesas_editar_guardar_programacion',
  'mesas_editar_no_agrupada_crear_grupo_unico',
  'mesas_editar_eliminar_grupo',
  'mesas_editar_eliminar_numero_grupo',
  'mesas_editar_persona_mover',
  'mesas_editar_persona_eliminar',
  'mesas_editar_mas_agregar',
  'mesas_editar_flechas_mover',
  'mesas_editar_agregar_numero_confirmar',
  'mesas_editar_habilitar_slot_extra',
  'mesas_editar_eliminar_slot_extra',
  'mesas_resultado_guardar_nota',
  'mesas_historial_eliminar_todos',
  'mesas_docentes_cambios_aplicar',
  'mesas_docentes_cambios_ignorar',
  'mesas_notificaciones_email_registrar_lote',
  'mesas_notificaciones_email_registrar_envios',
  'configuracion_usuarios_guardar',
  'configuracion_usuarios_cambiar_estado',
  'configuracion_usuarios_alta',
  'configuracion_usuarios_baja',
  'configuracion_usuarios_eliminar',
  'form_guardar_config_inscripcion',
  'guardar_config_inscripcion',
  'formulario_guardar_config_inscripcion',
];

const PUBLIC_CURRENT_ACTIONS = new Set([
  'inicio',
  'recuperar_contrasena_solicitar',
  'recuperar_contrasena_validar',
  'recuperar_contrasena_guardar',
  'form_obtener_config_inscripcion',
  'obtener_config_inscripcion',
  'formulario_obtener_config_inscripcion',
]);

function currentContractActions() {
  const result = new Set();
  for (const contract of ROUTE_CONTRACTS) {
    for (const action of contract.actions) result.add(action);
  }
  return [...result];
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function specPath(name) {
  return path.join(env.root, 'tests', name);
}

function backendPath(relative) {
  return path.join(env.backendDir, relative);
}

function extractRouteActions(source) {
  const actions = new Set();
  for (const match of source.matchAll(/case\s+['"]([^'"]+)['"]/g)) actions.add(match[1]);
  for (const match of source.matchAll(/^\s*['"]([^'"]+)['"]\s*=>\s*['"][^'"]+['"]/gm)) actions.add(match[1]);
  return [...actions];
}

function extractFrontendActions(source) {
  const actions = new Set();
  for (const match of source.matchAll(/(?:apiGet|apiPost)\s*\(\s*['"]([^'"]+)['"]/g)) actions.add(match[1]);
  for (const match of source.matchAll(/action=([A-Za-z0-9_]+)/g)) actions.add(match[1]);
  return [...actions];
}

function phpFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...phpFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.php')) result.push(full);
  }
  return result;
}

function runProductionBuild() {
  const options = {
    cwd: env.root,
    env: { ...process.env, CI: 'false', BROWSER: 'none' },
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 20 * 1024 * 1024,
  };

  if (process.platform === 'win32') {
    const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return spawnSync(shell, ['/d', '/s', '/c', 'npm run build'], options);
  }
  return spawnSync('npm', ['run', 'build'], options);
}

test.describe('99 · Release gate · módulos cubiertos', () => {
  test.afterEach(() => cleanupAll({ silent: true }));

  test('contrato: cada endpoint expuesto de los módulos actuales tiene una prueba que lo nombra', async () => {
    for (const contract of ROUTE_CONTRACTS) {
      const routeFile = backendPath(contract.route);
      const testFile = specPath(contract.spec);
      expect(fs.existsSync(routeFile), `${contract.name}: falta ${routeFile}`).toBe(true);
      expect(fs.existsSync(testFile), `${contract.name}: falta ${testFile}`).toBe(true);

      const exposed = extractRouteActions(read(routeFile));
      for (const action of contract.actions) {
        expect(exposed, `${contract.name}: el contrato declara una acción que ya no existe: ${action}`).toContain(action);
        expect(read(testFile), `${contract.name}: falta prueba explícita para ${action}`).toContain(action);
      }

      if (contract.strict) {
        expect([...exposed].sort(), `${contract.name}: cambió el router; actualizá la suite antes de liberar`)
          .toEqual([...contract.actions].sort());
      }
    }
  });

  test('contrato: toda acción consumida por el frontend actual aparece cubierta en el spec de su módulo', async () => {
    for (const [relativeSource, specName] of FRONTEND_ACTION_CONTRACTS) {
      const sourceFile = path.join(env.root, relativeSource);
      expect(fs.existsSync(sourceFile), `Falta frontend ${relativeSource}`).toBe(true);
      const actions = extractFrontendActions(read(sourceFile));
      expect(actions.length, `${relativeSource} no expuso acciones detectables`).toBeGreaterThan(0);

      const specSource = read(specPath(specName));
      for (const action of actions) {
        expect(specSource, `${relativeSource}: ${action} no aparece en ${specName}`).toContain(action);
      }
    }
  });

  test('calidad de suite: no permite skip/only en los módulos que se consideran listos', async () => {
    const forbidden = /(?:test|describe)\.(?:skip|only)\s*\(|\.skip\s*\(|\.only\s*\(/;
    for (const name of CURRENT_SPECS) {
      const source = read(specPath(name));
      expect(forbidden.test(source), `${name} contiene skip/only y no puede considerarse gate de release`).toBe(false);
    }
  });

  test('contrato de rol vista: el allowlist GET del test coincide exactamente con el backend', async () => {
    const authSource = read(backendPath('core/auth.php'));
    const block = authSource.match(/\$accionesVistaPermitidas\s*=\s*\[([\s\S]*?)\];/);
    expect(block, 'No se encontró $accionesVistaPermitidas en core/auth.php').toBeTruthy();

    const backendActions = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect([...backendActions].sort(), 'Cambió el allowlist de vista: actualizar backend y pruebas en conjunto')
      .toEqual([...VISTA_ALLOWED_GET_ACTIONS].sort());
  });

  test('seguridad: sesión, tenant, CSRF y rol vista bloquean correctamente todos los endpoints actuales', async ({ request }) => {
    for (const action of currentContractActions()) {
      if (PUBLIC_CURRENT_ACTIONS.has(action)) continue;
      if (action === 'debug_saas_login') {
        const debug = await apiGet(request, action);
        expectFail(debug, [401, 403], /sesión|autoriz|debug deshabilitado/i, 'debug no público');
        continue;
      }
      const unauthenticated = await apiGet(request, action);
      expectFail(unauthenticated, 401, /sesión|autoriz/i, `sin sesión bloqueado en ${action}`);
    }

    const admin = await login(request);
    const wrongTenant = await apiGet(request, 'docentes_listar', { id_tenant: env.tenantId + 999999 }, admin);
    expectFail(wrongTenant, 403, /tenant/i, 'sesión no puede cruzar tenant');

    for (const action of VISTA_MUTATIONS) {
      const noCsrf = await apiPost(request, action, {}, admin, {
        csrf: false,
        headers: { 'X-Requested-With': 'NotAjax' },
      });
      expectFail(noCsrf, 403, /CSRF/i, `CSRF bloquea ${action}`);
    }

    const vista = (await createVistaAuth(request, admin, 'RELEASEVISTA')).auth;

    for (const action of VISTA_MUTATIONS) {
      const result = await apiPost(request, action, {}, vista);
      expectFail(result, 403, /permisos/i, `vista bloqueado en ${action}`);
    }
  });

  test('backend: router, core y PHP de los módulos cubiertos pasan php -l', async () => {
    const targets = [
      backendPath('routes/api.php'),
      ...phpFiles(backendPath('core')),
      ...phpFiles(backendPath('config')),
      ...['login', 'dashbord', 'docentes', 'catedras', 'materias', 'estadisticas', 'previas', 'mesas', 'configuracion', 'formulario', 'global']
        .flatMap((module) => phpFiles(backendPath(`modules/${module}`))),
      backendPath('testing/cleanup_playwright.php'),
    ];

    const uniqueFiles = [...new Set(targets)].filter((file) => fs.existsSync(file));
    expect(uniqueFiles.length).toBeGreaterThan(10);

    for (const file of uniqueFiles) {
      const result = spawnSync('php', ['-l', file], { cwd: env.backendDir, encoding: 'utf8', timeout: 20_000 });
      expect(result.status, `PHP inválido en ${path.relative(env.backendDir, file)}\n${result.stdout || ''}\n${result.stderr || ''}`).toBe(0);
    }
  });

  test('smoke UI autenticado: todas las pantallas cubiertas abren sin errores técnicos', async ({ page }) => {
    const routes = [
      ['/panel', () => page.getByRole('heading', { name: 'Dashboard de Mesas de Examen' })],
      ['/docentes', () => page.getByRole('table', { name: 'Listado de docentes' })],
      ['/catedras', () => page.getByRole('table', { name: 'Listado de cátedras' })],
      ['/materias', () => page.getByRole('table', { name: 'Listado de materias' })],
      ['/estadisticas', () => page.getByRole('heading', { name: 'Estadísticas de mesas' }), true],
      ['/previas', () => page.getByRole('table', { name: 'Listado de previas' })],
      ['/mesas-examen', () => page.getByText('Mesas de Examen', { exact: true })],
      ['/configuracion', () => page.getByRole('heading', { name: 'Configuración de Mesas' }), false],
    ];

    for (const [route, locator, expectsBackend = true] of routes) {
      const guard = attachRuntimeGuards(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[/?#])`));
      await expect(locator(), `${route} debe renderizar su contenido principal`).toBeVisible();

      // La portada de Configuración no consulta API hasta entrar en Formulario/Usuarios.
      // Esos flujos y endpoints ya se prueban exhaustivamente en 14-configuracion.spec.js.
      if (expectsBackend) await assertFrontendUsesConfiguredBackend(page);

      guard.assertClean(`release smoke ${route}`);
    }
  });

  test('frontend: npm run build compila correctamente sin dejar un build de testing para desplegar por error', async () => {
    test.setTimeout(300_000);
    const buildDir = path.join(env.root, 'build');
    const backupDir = path.join(env.root, `.pwtest-build-backup-${process.pid}`);

    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
    if (fs.existsSync(buildDir)) fs.renameSync(buildDir, backupDir);

    try {
      const result = runProductionBuild();
      const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
      expect(result.error, `No se pudo ejecutar npm run build: ${result.error?.message || ''}\n${output}`).toBeFalsy();
      expect(result.status, `npm run build falló\n${output}`).toBe(0);

      const index = path.join(buildDir, 'index.html');
      const jsDir = path.join(buildDir, 'static', 'js');
      expect(fs.existsSync(index), 'El build no generó build/index.html').toBe(true);
      expect(fs.existsSync(jsDir), 'El build no generó build/static/js').toBe(true);
      expect(fs.readdirSync(jsDir).some((name) => name.endsWith('.js')), 'El build no generó bundles JS').toBe(true);
    } finally {
      if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
      if (fs.existsSync(backupDir)) fs.renameSync(backupDir, buildDir);
    }
  });
});
