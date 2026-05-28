<?php
// backend/modules/mesas/docentes_cambios/route_docentes_cambios.php
declare(strict_types=1);

require_once __DIR__ . '/docentes_cambios_controller.php';

/**
 * Ejecuta un handler del controlador de manera segura.
 *
 * Se usa call_user_func con strings para evitar falsos errores del editor
 * cuando Intelephense/VS Code no resuelve funciones cargadas por require_once.
 * En runtime igual valida que la función exista antes de llamarla.
 */
function mesas_docentes_cambios_ejecutar_handler(string $handler): void
{
    if (is_callable($handler)) {
        call_user_func($handler);
        return;
    }

    json_response([
        'exito' => false,
        'mensaje' => 'El controlador de cambios de docente no está cargado correctamente.',
        'detalle' => defined('APP_DEBUG') && APP_DEBUG ? ('Handler no encontrado: ' . $handler) : null,
    ], 500);
}

function route_mesas_docentes_cambios(string $action): bool
{
    switch ($action) {
        case 'mesas_docentes_cambios_pendientes':
        case 'mesas_docente_cambios_pendientes':
            mesas_docentes_cambios_ejecutar_handler('mesas_docentes_cambios_pendientes');
            return true;

        case 'mesas_docentes_cambios_aplicar':
        case 'mesas_docente_cambios_aplicar':
        case 'mesas_docentes_cambios_resolver':
            mesas_docentes_cambios_ejecutar_handler('mesas_docentes_cambios_aplicar');
            return true;

        case 'mesas_docentes_cambios_ignorar':
        case 'mesas_docente_cambios_ignorar':
            mesas_docentes_cambios_ejecutar_handler('mesas_docentes_cambios_ignorar');
            return true;

        default:
            return false;
    }
}
