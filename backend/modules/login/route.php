<?php
// backend/modules/login/route.php
declare(strict_types=1);

require_once __DIR__ . '/inicio.php';
require_once __DIR__ . '/registro.php';
require_once __DIR__ . '/debug_saas.php';

function route_login(string $action): bool
{
    switch ($action) {
        case 'inicio':
            login_inicio();
            return true;

        case 'registro':
            login_registro();
            return true;

        case 'debug_saas_login':
            debug_saas_login();
            return true;

        default:
            return false;
    }
}
