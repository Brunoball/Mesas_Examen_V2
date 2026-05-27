<?php
// backend/modules/perfil/route.php
declare(strict_types=1);

require_once __DIR__ . '/perfil_controller.php';

function route_perfil(string $action): bool
{
    switch ($action) {
        case 'perfil_obtener':
            perfil_obtener();
            return true;

        case 'perfil_logo_institucional':
            perfil_logo_institucional();
            return true;

        default:
            return false;
    }
}
