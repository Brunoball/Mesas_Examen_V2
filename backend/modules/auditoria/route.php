<?php
// backend/modules/auditoria/route.php
declare(strict_types=1);

require_once __DIR__ . '/auditoria_controller.php';

function route_auditoria(string $action): bool
{
    switch ($action) {
        case 'auditoria_listar':
            auditoria_listar();
            return true;

        case 'auditoria_obtener':
            auditoria_obtener();
            return true;

        default:
            return false;
    }
}
