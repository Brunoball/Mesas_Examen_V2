<?php
// backend/modules/login/route.php
declare(strict_types=1);

require_once __DIR__ . '/inicio.php';
require_once __DIR__ . '/registro.php';
require_once __DIR__ . '/debug_saas.php';
require_once __DIR__ . '/recuperar_contrasena.php';

function route_login(string $action): bool
{
    $routes = [
        'inicio' => 'login_inicio',
        'registro' => 'login_registro',

        // Alias para consultar el usuario autenticado desde el frontend.
        'auth_usuario_actual' => 'login_usuario_actual',
        'usuario_actual' => 'login_usuario_actual',

        // Recuperación de contraseña.
        'recuperar_contrasena_solicitar' => 'login_recuperar_contrasena_solicitar',
        'recuperar_contrasena_validar' => 'login_recuperar_contrasena_validar',
        'recuperar_contrasena_guardar' => 'login_recuperar_contrasena_guardar',

        // Debug opcional SaaS.
        'debug_saas_login' => 'debug_saas_login',
    ];

    if (!isset($routes[$action])) {
        return false;
    }

    $handler = $routes[$action];

    if (!function_exists($handler)) {
        throw new RuntimeException("No existe el handler de login: {$handler}");
    }

    $handler();
    return true;
}
