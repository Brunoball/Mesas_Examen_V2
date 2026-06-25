<?php
// backend/modules/estadisticas/route.php
declare(strict_types=1);

require_once __DIR__ . '/estadisticas_controller.php';
require_once __DIR__ . '/estadisticas_detalle_controller.php';

function route_estadisticas(string $action): bool
{
    switch ($action) {
        case 'estadisticas_mesas_opciones':
        case 'estadisticas_historial_mesas_opciones':
            estadisticas_mesas_opciones();
            return true;

        case 'estadisticas_mesas_resumen':
        case 'estadisticas_historial_mesas_resumen':
            estadisticas_mesas_resumen();
            return true;

        case 'estadisticas_mesas_detalle':
        case 'estadisticas_historial_mesas_detalle':
            estadisticas_mesas_detalle();
            return true;

        default:
            return false;
    }
}
