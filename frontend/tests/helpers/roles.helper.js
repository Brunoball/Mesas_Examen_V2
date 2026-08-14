const { expect } = require('@playwright/test');
const { env, unique, assertCredentialsConfigured } = require('./env.helper');
const { apiPost, login, expectOk } = require('./api.helper');

const TEST_ROLE_PASSWORD = 'PwTest123!';

const VISTA_ALLOWED_GET_ACTIONS = Object.freeze([
  'auth_usuario_actual',
  'perfil_obtener',
  'perfil_logo_institucional',
  'obtener_listas',
  'global_obtener_listas',
  'dashbord_resumen',
  'dashboard_resumen',
  'estadisticas_mesas_opciones',
  'estadisticas_historial_mesas_opciones',
  'estadisticas_mesas_resumen',
  'estadisticas_historial_mesas_resumen',
  'estadisticas_mesas_detalle',
  'estadisticas_historial_mesas_detalle',
  'previas_catalogos',
  'previas_condiciones',
  'previas_listar',
  'previas_obtener_permiso_examen',
  'mesas_examen_listar',
  'mesas_grupos_listar',
  'mesas_armado_grupos_listar',
  'mesas_no_agrupadas_listar',
  'mesas_armado_no_agrupadas_listar',
  'mesas_historial_listar',
  'mesas_historial_resultados_listar',
  'mesas_historial_detalle_armado',
  'mesas_historial_armado_detalle',
]);

const VISTA_RESTRICTED_GET_ACTIONS = Object.freeze([
  'usuario_actual',
  'global_obtener_materias_por_curso',
  'docentes_catalogos',
  'docentes_listar',
  'docentes_obtener',
  'catedras_catalogos',
  'catedras_listar',
  'materias_catalogos',
  'materias_listar',
  'materias_correlativas_listar',
  'talleres_listar',
  'areas_listar',
  'configuracion_usuarios_listar',
  'configuracion_usuarios_obtener',
  'form_admin_obtener_config_inscripcion',
  'previas_obtener',
  'previas_obtener_materias_inscripcion',
  'previas_plantilla_importacion',
  'mesas_armado_parametros',
  'mesas_editar_obtener',
  'mesas_docentes_cambios_pendientes',
  'mesas_historial_exportar',
  'auditoria_listar',
]);

function roleOf(auth) {
  return String(auth?.usuario?.rol || '').trim().toLowerCase();
}

async function createVistaAuth(request, adminAuth = null, label = 'ROLVISTA') {
  assertCredentialsConfigured();

  if (env.vistaUser && env.vistaPassword) {
    const auth = await login(request, env.vistaUser, env.vistaPassword);
    expect(roleOf(auth), 'PW_VISTA_USER debe pertenecer al rol vista').toBe('vista');
    return { auth, user: env.vistaUser, password: env.vistaPassword, created: false };
  }

  const admin = adminAuth || await login(request);
  const user = unique(label);
  const password = TEST_ROLE_PASSWORD;
  expectOk(await apiPost(request, 'registro', {
    nombre: user,
    contrasena: password,
    rol: 'vista',
  }, admin), 'crear usuario vista temporal');

  const auth = await login(request, user, password);
  expect(roleOf(auth), 'el usuario temporal debe iniciar como vista').toBe('vista');
  return { auth, user, password, created: true };
}

module.exports = {
  TEST_ROLE_PASSWORD,
  VISTA_ALLOWED_GET_ACTIONS,
  VISTA_RESTRICTED_GET_ACTIONS,
  createVistaAuth,
  roleOf,
};
