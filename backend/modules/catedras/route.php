<?php
// backend/modules/catedras/route.php
declare(strict_types=1);

require_once __DIR__ . '/catedras_controller.php';

function route_catedras(string $action): bool
{
    switch ($action) {
        case 'catedras_catalogos':
            catedras_catalogos();
            return true;

        case 'catedras_listar':
            catedras_listar();
            return true;

        case 'catedras_asignar_docente':
        case 'catedras_asignar_docentes':
            catedras_asignar_docente();
            return true;

        default:
            return false;
    }
}
