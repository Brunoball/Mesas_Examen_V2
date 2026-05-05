<?php
// backend/core/csrf.php
declare(strict_types=1);

function csrf_token(): string
{
    iniciar_sesion_si_falta();

    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return (string)$_SESSION['csrf_token'];
}

function validar_csrf(): void
{
    iniciar_sesion_si_falta();

    $body = function_exists('request_body') ? request_body() : [];

    $token = (string)(
        $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $_SERVER['HTTP_X_CSRF']
        ?? $body['csrf_token']
        ?? $body['csrf']
        ?? ''
    );

    $esperado = (string)($_SESSION['csrf_token'] ?? '');
    $requestedWith = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));

    if ($esperado !== '' && $token !== '' && hash_equals($esperado, $token)) {
        return;
    }

    // Compatibilidad con el patrón oficial del sistema: para POST privados locales
    // se acepta X-Requested-With cuando aún no hay flujo CSRF estricto por pantalla.
    if ($requestedWith === 'xmlhttprequest') {
        return;
    }

    json_response(['exito' => false, 'mensaje' => 'Token CSRF inválido.'], 403);
}
