<?php
// backend/modules/mesas/edicion_por_docente/route.php
declare(strict_types=1);

require_once __DIR__ . '/editar_mesas_controller.php';
require_once __DIR__ . '/persona/route_persona.php';
require_once __DIR__ . '/mas/route_mas.php';
require_once __DIR__ . '/flechas/route_flechas.php';
require_once __DIR__ . '/eliminar/route_eliminar.php';
require_once __DIR__ . '/agregar_numero/route_agregar_numero.php';

function route_mesas_editar_docentes(string $action): bool
{
    if (route_mesas_editar_docentes_persona($action)) {
        return true;
    }

    if (route_mesas_editar_docentes_mas($action)) {
        return true;
    }

    if (route_mesas_editar_docentes_flechas($action)) {
        return true;
    }

    if (route_mesas_editar_docentes_eliminar($action)) {
        return true;
    }

    if (route_mesas_editar_docentes_agregar_numero($action)) {
        return true;
    }

    switch ($action) {
        case 'mesas_editar_docentes_obtener':
        case 'mesas_editar_docentes_obtener_grupo':
        case 'mesas_edicion_obtener_grupo':
            mesas_editar_docentes_obtener_grupo();
            return true;

        case 'mesas_editar_docentes_guardar_programacion':
        case 'mesas_edicion_guardar_programacion':
        case 'mesas_edicion_actualizar_programacion':
            mesas_editar_docentes_guardar_programacion();
            return true;

        case 'mesas_editar_docentes_validar_programacion':
        case 'mesas_edicion_validar_programacion':
            mesas_editar_docentes_validar_programacion();
            return true;

        case 'mesas_editar_docentes_no_agrupada_crear_grupo_unico':
        case 'mesas_editar_docentes_crear_grupo_unico':
        case 'mesas_edicion_no_agrupada_crear_grupo_unico':
            mesas_editar_docentes_crear_grupo_unico_no_agrupada();
            return true;

        case 'mesas_editar_docentes_slots_validos':
        case 'mesas_edicion_slots_validos':
        case 'mesas_editar_docentes_obtener_slots_validos':
            mesas_editar_docentes_slots_validos();
            return true;

        case 'mesas_editar_docentes_eliminar':
        case 'mesas_edicion_eliminar':
        case 'mesas_edicion_eliminar_grupo':
            mesas_editar_docentes_eliminar();
            return true;

        default:
            return false;
    }
}
