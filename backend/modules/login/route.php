<?php
// backend/modules/login/route.php
declare(strict_types=1);

require_once __DIR__ . '/inicio.php';
require_once __DIR__ . '/registro.php';

function route_login(string $action): bool
{
    switch ($action) {
        case 'inicio':
            login_inicio();
            return true;

        case 'registro':
            login_registro();
            return true;

        default:
            return false;
    }
}
