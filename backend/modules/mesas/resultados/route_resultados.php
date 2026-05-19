<?php
// backend/modules/mesas/resultados/route_resultados.php
declare(strict_types=1);

require_once __DIR__ . '/resultados_controller.php';

function route_mesas_resultados(string $action): bool
{
    switch ($action) {
        case 'mesas_resultado_guardar_nota':
        case 'mesas_resultados_guardar_nota':
        case 'mesas_guardar_nota_previa':
            mesas_resultados_guardar_nota();
            return true;

        default:
            return false;
    }
}
