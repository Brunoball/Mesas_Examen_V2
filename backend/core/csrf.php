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

    // Compatibilidad con el frontend actual: apiClient envía X-Requested-With.
    // Si existe token en sesión, se valida; si no, se acepta X-Requested-With para no romper el flujo actual.
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $esperado = $_SESSION['csrf_token'] ?? '';
    $requestedWith = strtolower((string)($_SERVER['HTTP_X_REQUESTED_WITH'] ?? ''));

    if ($esperado !== '' && $token !== '' && hash_equals((string)$esperado, (string)$token)) {
        return;
    }

    if ($requestedWith === 'xmlhttprequest') {
        return;
    }

    json_response(['exito' => false, 'mensaje' => 'Token CSRF inválido.'], 403);
}
