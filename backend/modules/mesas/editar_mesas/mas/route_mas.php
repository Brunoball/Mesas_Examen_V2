<?php
// backend/modules/mesas/editar_mesas/mas/route_mas.php
declare(strict_types=1);

require_once __DIR__ . '/mas_controller.php';

function route_mesas_editar_mas(string $action): bool
{
    switch ($action) {
        case 'mesas_editar_mas_previas_disponibles':
        case 'mesas_edicion_mas_previas_disponibles':
        case 'mesas_editar_agregar_previas_disponibles':
            mesas_editar_mas_previas_disponibles();
            return true;

        case 'mesas_editar_mas_agregar':
        case 'mesas_edicion_mas_agregar':
        case 'mesas_editar_agregar_previa':
            mesas_editar_mas_agregar();
            return true;

        default:
            return false;
    }
}
