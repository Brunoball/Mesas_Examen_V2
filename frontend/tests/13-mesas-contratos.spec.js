const { test, expect } = require('./fixtures/auth.fixture');
const fs = require('fs');
const path = require('path');
const { env } = require('./helpers/env.helper');

// Contrato completo, incluyendo aliases históricos que deben seguir ruteando.
const MESAS_ROUTE_ACTIONS = [
  'mesas_examen_listar', 'mesas_armado_parametros',
  'mesas_armado_crear', 'mesas_armado_crear_numerado', 'mesas_armado_fase_1_generar_borrador',
  'mesas_armado_crear_docentes', 'mesas_armado_docentes_crear', 'mesas_armado_crear_por_disponibilidad_docente',
  'mesas_armado_eliminar_borrador', 'mesas_armado_eliminar_mesas', 'mesas_eliminar_armado',
  'mesas_armado_fase_2_talleres', 'mesas_armado_fase_2_agrupar_talleres',
  'mesas_armado_fase_3_correlativas', 'mesas_armado_fase_3_agrupar_correlativas', 'mesas_armado_fase_3_calendarizar',
  'mesas_armado_validar_y_calendarizar', 'mesas_armado_asignar_fechas_turnos', 'mesas_armado_calendarizar',
  'mesas_armado_fase_4_simples', 'mesas_armado_fase_4_agrupar_simples', 'mesas_armado_numerar',
  'mesas_armado_asignar_numeros', 'mesas_armado_numerar_docente_materia', 'mesas_armado_reparar_numeros',
  'mesas_armado_fase_5_validar_numerar', 'mesas_armado_fase_5_validar_y_numerar',
  'mesas_armado_fase_6_grupos_finales', 'mesas_armado_grupos_finales', 'mesas_armado_agrupar_grupos_finales', 'mesas_armado_crear_grupos',
  'mesas_armado_grupos_finales_docentes', 'mesas_armado_docentes_grupos_finales', 'mesas_armado_crear_grupos_docentes',
  'mesas_armado_fase_7_reoptimizar', 'mesas_armado_reoptimizar_no_agrupadas', 'mesas_armado_reoptimizar_grupos_finales',
  'mesas_grupos_listar', 'mesas_armado_grupos_listar', 'mesas_no_agrupadas_listar', 'mesas_armado_no_agrupadas_listar',
];

const MESAS_EDITOR_ACTIONS = [
  'mesas_editar_obtener', 'mesas_editar_obtener_grupo', 'mesas_edicion_obtener_grupo',
  'mesas_editar_guardar_programacion', 'mesas_edicion_guardar_programacion', 'mesas_edicion_actualizar_programacion',
  'mesas_editar_validar_programacion', 'mesas_edicion_validar_programacion',
  'mesas_editar_no_agrupada_crear_grupo_unico', 'mesas_editar_crear_grupo_unico', 'mesas_edicion_no_agrupada_crear_grupo_unico',
  'mesas_editar_slots_validos', 'mesas_edicion_slots_validos', 'mesas_editar_obtener_slots_validos',
  'mesas_editar_eliminar', 'mesas_edicion_eliminar', 'mesas_edicion_eliminar_grupo',
  'mesas_editar_persona_previas_numero', 'mesas_edicion_persona_previas_numero', 'mesas_editar_previas_numero',
  'mesas_editar_persona_destinos_mover', 'mesas_edicion_persona_destinos_mover', 'mesas_editar_previas_destinos_mover',
  'mesas_editar_persona_validar_mover', 'mesas_edicion_persona_validar_mover',
  'mesas_editar_persona_mover', 'mesas_edicion_persona_mover', 'mesas_editar_mover_previa',
  'mesas_editar_persona_eliminar', 'mesas_edicion_persona_eliminar', 'mesas_editar_eliminar_previa',
  'mesas_editar_mas_previas_disponibles', 'mesas_edicion_mas_previas_disponibles', 'mesas_editar_agregar_previas_disponibles',
  'mesas_editar_mas_agregar', 'mesas_edicion_mas_agregar', 'mesas_editar_agregar_previa',
  'mesas_editar_flechas_destinos', 'mesas_edicion_flechas_destinos', 'mesas_editar_mover_numero_destinos',
  'mesas_editar_flechas_mover', 'mesas_edicion_flechas_mover', 'mesas_editar_mover_numero',
  'mesas_editar_agregar_numero_opciones', 'mesas_edicion_agregar_numero_opciones', 'mesas_editar_numero_opciones',
  'mesas_editar_agregar_numero_confirmar', 'mesas_edicion_agregar_numero_confirmar', 'mesas_editar_numero_agregar',
  'mesas_editar_habilitar_slot_extra', 'mesas_edicion_habilitar_slot_extra', 'mesas_editar_agregar_slot_extra',
  'mesas_editar_eliminar_slot_extra', 'mesas_edicion_eliminar_slot_extra', 'mesas_editar_quitar_slot_extra',
  'mesas_editar_eliminar_grupo', 'mesas_editar_eliminar_grupo_completo',
  'mesas_editar_eliminar_numero_grupo', 'mesas_editar_quitar_numero_grupo', 'mesas_edicion_quitar_numero_grupo',
];

const MESAS_AUX_ACTIONS = [
  'mesas_resultado_guardar_nota', 'mesas_resultados_guardar_nota', 'mesas_guardar_nota_previa',
  'mesas_historial_listar', 'mesas_historial_resultados_listar', 'mesas_historial_detalle_armado', 'mesas_historial_armado_detalle',
  'mesas_historial_exportar', 'mesas_historial_armados_exportar', 'mesas_historial_eliminar_todos', 'mesas_historial_borrar_todos',
  'mesas_docentes_cambios_pendientes', 'mesas_docente_cambios_pendientes',
  'mesas_docentes_cambios_aplicar', 'mesas_docente_cambios_aplicar', 'mesas_docentes_cambios_resolver',
  'mesas_docentes_cambios_ignorar', 'mesas_docente_cambios_ignorar',
  'mesas_notificaciones_email_listar', 'mesas_notificaciones_listar',
  'mesas_notificaciones_email_registrar_lote', 'mesas_notificaciones_registrar_lote',
  'mesas_notificaciones_email_registrar_envios', 'mesas_notificaciones_registrar_envios', 'mesas_notificaciones_email_enviar_lote',
  'mesas_notificaciones_email_estado', 'mesas_notificaciones_estado',
];

const FRONTEND_MESAS_ACTIONS = [
  'mesas_examen_listar', 'mesas_grupos_listar', 'mesas_no_agrupadas_listar', 'mesas_armado_parametros',
  'mesas_armado_crear', 'mesas_armado_crear_docentes', 'mesas_armado_grupos_finales', 'mesas_armado_grupos_finales_docentes',
  'mesas_armado_eliminar_mesas', 'mesas_editar_obtener', 'mesas_editar_guardar_programacion',
  'mesas_editar_no_agrupada_crear_grupo_unico', 'mesas_editar_eliminar_grupo', 'mesas_editar_eliminar_numero_grupo',
  'mesas_editar_validar_programacion', 'mesas_editar_slots_validos', 'mesas_editar_persona_previas_numero',
  'mesas_editar_persona_destinos_mover', 'mesas_editar_persona_mover', 'mesas_editar_persona_eliminar',
  'mesas_editar_mas_previas_disponibles', 'mesas_editar_mas_agregar', 'mesas_editar_flechas_destinos', 'mesas_editar_flechas_mover',
  'mesas_editar_agregar_numero_opciones', 'mesas_editar_agregar_numero_confirmar',
  'mesas_editar_habilitar_slot_extra', 'mesas_editar_eliminar_slot_extra', 'mesas_resultado_guardar_nota',
  'mesas_historial_listar', 'mesas_historial_detalle_armado', 'mesas_historial_exportar', 'mesas_historial_eliminar_todos',
  'mesas_docentes_cambios_pendientes', 'mesas_docentes_cambios_aplicar', 'mesas_docentes_cambios_ignorar',
  'perfil_obtener', 'perfil_logo_institucional', 'mesas_notificaciones_email_listar',
  'mesas_notificaciones_email_registrar_lote', 'mesas_notificaciones_email_registrar_envios', 'mesas_notificaciones_email_estado',
];

function extractActions(source) {
  return [...source.matchAll(/case\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test.describe('13 · Mesas · contratos backend/frontend', () => {
  test('todos los routers mantienen exactamente sus acciones y aliases documentados', async () => {
    const routeFiles = [
      'modules/mesas/route.php',
      'modules/mesas/editar_mesas/route.php',
      'modules/mesas/editar_mesas/persona/route_persona.php',
      'modules/mesas/editar_mesas/mas/route_mas.php',
      'modules/mesas/editar_mesas/flechas/route_flechas.php',
      'modules/mesas/editar_mesas/agregar_numero/route_agregar_numero.php',
      'modules/mesas/editar_mesas/eliminar/route_eliminar.php',
      'modules/mesas/resultados/route_resultados.php',
      'modules/mesas/historial_mesas/route_historial.php',
      'modules/mesas/docentes_cambios/route_docentes_cambios.php',
      'modules/mesas/notificaciones_email/route_notificaciones_email.php',
    ];
    const exposed = routeFiles.flatMap((relative) => extractActions(fs.readFileSync(path.join(env.backendDir, relative), 'utf8')));
    const expected = [...new Set([...MESAS_ROUTE_ACTIONS, ...MESAS_EDITOR_ACTIONS, ...MESAS_AUX_ACTIONS])];
    expect([...new Set(exposed)].sort()).toEqual(expected.sort());
  });

  test('cada acción literal consumida por el frontend está incluida en el contrato', async () => {
    const apiFile = path.join(env.root, 'src/components/Mesas_examen/api/mesasExamenApi.js');
    const source = fs.readFileSync(apiFile, 'utf8');
    const literal = [...source.matchAll(/(?:apiGet|apiPost)\s*\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    for (const action of literal) expect(FRONTEND_MESAS_ACTIONS).toContain(action);
    for (const action of FRONTEND_MESAS_ACTIONS.filter((item) => !['mesas_armado_crear', 'mesas_armado_crear_docentes', 'mesas_armado_grupos_finales', 'mesas_armado_grupos_finales_docentes'].includes(item))) {
      expect(source, `El frontend dejó de consumir ${action}`).toContain(action);
    }
  });
});

module.exports = {
  MESAS_ROUTE_ACTIONS,
  MESAS_EDITOR_ACTIONS,
  MESAS_AUX_ACTIONS,
  FRONTEND_MESAS_ACTIONS,
};
