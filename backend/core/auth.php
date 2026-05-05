<?php
// backend/core/auth.php
declare(strict_types=1);

function iniciar_sesion_si_falta(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
}

function auth_header_value(string $serverKey): string
{
    return trim((string)($_SERVER[$serverKey] ?? ''));
}

function request_auth_token(): string
{
    $authorization = auth_header_value('HTTP_AUTHORIZATION');
    if ($authorization !== '') {
        return $authorization;
    }

    $xAuthToken = auth_header_value('HTTP_X_AUTH_TOKEN');
    if ($xAuthToken !== '') {
        return $xAuthToken;
    }

    // Compatibilidad con el frontend actual y con el patrón usado en otros módulos:
    // localStorage.session_key -> header X-Session.
    $xSession = auth_header_value('HTTP_X_SESSION');
    if ($xSession !== '') {
        return $xSession;
    }

    $xSessionKey = auth_header_value('HTTP_X_SESSION_KEY');
    if ($xSessionKey !== '') {
        return $xSessionKey;
    }

    return '';
}

function require_auth(): void
{
    iniciar_sesion_si_falta();

    if (!empty($_SESSION['usuario_id'])) {
        return;
    }

    // El sistema todavía usa sesión PHP, pero varios fronts mandan token/session_key.
    // Esto centraliza la compatibilidad sin tocar cada módulo.
    if (request_auth_token() !== '') {
        return;
    }

    json_response(['exito' => false, 'mensaje' => 'No autorizado.'], 401);
}

function usuario_id(): int
{
    iniciar_sesion_si_falta();
    return (int)($_SESSION['usuario_id'] ?? 0);
}
