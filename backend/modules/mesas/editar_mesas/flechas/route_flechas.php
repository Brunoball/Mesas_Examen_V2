<?php
// backend/modules/mesas/editar_mesas/flechas/route_flechas.php
declare(strict_types=1);

require_once __DIR__ . '/flechas_controller.php';

function route_mesas_editar_flechas(string $action): bool
{
    switch ($action) {
        case 'mesas_editar_flechas_destinos':
        case 'mesas_edicion_flechas_destinos':
        case 'mesas_editar_mover_numero_destinos':
            mesas_editar_flechas_destinos();
            return true;

        case 'mesas_editar_flechas_mover':
        case 'mesas_edicion_flechas_mover':
        case 'mesas_editar_mover_numero':
            mesas_editar_flechas_mover();
            return true;

        default:
            return false;
    }
}
