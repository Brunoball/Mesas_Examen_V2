<?php
// backend/modules/global/route.php
declare(strict_types=1);

require_once __DIR__ . '/obtener_listas.php';
require_once __DIR__ . '/obtener_materias_por_curso.php';

function route_global(string $action): bool
{
    switch ($action) {
        case 'obtener_listas':
        case 'global_obtener_listas':
            global_obtener_listas();
            return true;

        case 'obtener_materias_por_curso':
        case 'global_obtener_materias_por_curso':
        case 'materias_por_curso':
            global_obtener_materias_por_curso();
            return true;

        default:
            return false;
    }
}