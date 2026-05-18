<?php
// backend/modules/mesas/editar_mesas/eliminar/route_eliminar.php
declare(strict_types=1);

require_once __DIR__ . '/eliminar_controller.php';

function route_mesas_editar_eliminar(string $action): bool
{
    switch ($action) {
        case 'mesas_editar_eliminar':
        case 'mesas_edicion_eliminar':
        case 'mesas_edicion_eliminar_grupo':
        case 'mesas_editar_eliminar_grupo':
        case 'mesas_editar_eliminar_grupo_completo':
            mesas_editar_eliminar_smart();
            return true;

        case 'mesas_editar_eliminar_numero_grupo':
        case 'mesas_editar_quitar_numero_grupo':
        case 'mesas_edicion_quitar_numero_grupo':
            mesas_editar_eliminar_numero_grupo();
            return true;

        default:
            return false;
    }
}
