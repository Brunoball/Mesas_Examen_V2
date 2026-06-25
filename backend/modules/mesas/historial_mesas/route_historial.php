<?php
// backend/modules/mesas/historial_mesas/route_historial.php
declare(strict_types=1);

require_once __DIR__ . '/historial_mesas_controller.php';

function route_mesas_historial(string $action): bool
{
    switch ($action) {
        case 'mesas_historial_listar':
        case 'mesas_historial_resultados_listar':
            mesas_historial_listar();
            return true;

        case 'mesas_historial_detalle_armado':
        case 'mesas_historial_armado_detalle':
            mesas_historial_detalle_armado();
            return true;

        case 'mesas_historial_exportar':
        case 'mesas_historial_armados_exportar':
            mesas_historial_exportar();
            return true;

        case 'mesas_historial_eliminar_todos':
        case 'mesas_historial_borrar_todos':
            mesas_historial_eliminar_todos();
            return true;

        default:
            return false;
    }
}
