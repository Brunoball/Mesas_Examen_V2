<?php
// backend/core/auth.php
declare(strict_types=1);

function iniciar_sesion_si_falta(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
}

function require_auth(): void
{
    iniciar_sesion_si_falta();

    if (!empty($_SESSION['usuario_id'])) {
        return;
    }

    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($token !== '') {
        // Compatibilidad actual: el frontend puede mandar token, pero este backend usa sesión PHP.
        // Acá queda el punto central para reemplazar por JWT real sin tocar módulos.
        return;
    }

    json_response(['exito' => false, 'mensaje' => 'No autorizado.'], 401);
}

function usuario_id(): int
{
    iniciar_sesion_si_falta();
    return (int)($_SESSION['usuario_id'] ?? 0);
}
