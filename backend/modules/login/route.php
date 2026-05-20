<?php
// backend/modules/login/route.php
declare(strict_types=1);

require_once __DIR__ . '/inicio.php';
require_once __DIR__ . '/registro.php';
require_once __DIR__ . '/debug_saas.php';
require_once __DIR__ . '/recuperar_contrasena.php';

function route_login(string $action): bool
{
    switch ($action) {
        case 'inicio':
            login_inicio();
            return true;

        case 'registro':
            login_registro();
            return true;

        case 'recuperar_contrasena_solicitar':
            login_recuperar_contrasena_solicitar();
            return true;

        case 'recuperar_contrasena_validar':
            login_recuperar_contrasena_validar();
            return true;

        case 'recuperar_contrasena_guardar':
            login_recuperar_contrasena_guardar();
            return true;

        case 'debug_saas_login':
            debug_saas_login();
            return true;

        default:
            return false;
    }
}
