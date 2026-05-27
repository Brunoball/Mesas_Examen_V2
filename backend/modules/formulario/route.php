<?php
// backend/modules/formulario/route.php
declare(strict_types=1);

require_once __DIR__ . '/formulario_controller.php';
require_once __DIR__ . '/buscar_previas.php';
require_once __DIR__ . '/registrar_inscripcion.php';

function route_formulario(string $action): bool
{
    switch ($action) {
        case 'form_obtener_config_inscripcion':
        case 'obtener_config_inscripcion':
        case 'formulario_obtener_config_inscripcion':
        case 'form_admin_obtener_config_inscripcion':
            form_obtener_config_inscripcion();
            return true;

        case 'form_guardar_config_inscripcion':
        case 'guardar_config_inscripcion':
        case 'formulario_guardar_config_inscripcion':
            form_guardar_config_inscripcion();
            return true;

        case 'form_buscar_previas':
        case 'buscar_previas':
        case 'formulario_buscar_previas':
            form_buscar_previas();
            return true;

        case 'form_registrar_inscripcion':
        case 'registrar_inscripcion':
        case 'formulario_registrar_inscripcion':
            form_registrar_inscripcion();
            return true;

        default:
            return false;
    }
}
