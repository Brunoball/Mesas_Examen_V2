<?php
// backend/config/cors.php
// CORS robusto para producción + desarrollo local.
// Permite usar el frontend local (localhost:3000/5173) contra la API subida en Hostinger.
declare(strict_types=1);

require_once __DIR__ . '/env.php';

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));

/*
|--------------------------------------------------------------------------
| Orígenes permitidos
|--------------------------------------------------------------------------
| ALLOWED_ORIGIN puede venir del .env, por ejemplo:
| ALLOWED_ORIGIN=https://lerna.3devsnet.com,http://localhost:3000
|
| Además se agregan siempre los orígenes locales típicos para poder probar
| desde React local contra la API de Hostinger sin romper producción.
*/
$envAllowedRaw = (string)env_value('ALLOWED_ORIGIN', '');
$envAllowed = array_values(array_filter(array_map('trim', explode(',', $envAllowedRaw))));

$defaultAllowed = [
    'https://lerna.3devsnet.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
];

$allowedOrigins = array_values(array_unique(array_filter(array_merge($defaultAllowed, $envAllowed))));

$originPermitido = false;

if ($origin !== '') {
    if (in_array('*', $allowedOrigins, true) || in_array($origin, $allowedOrigins, true)) {
        $originPermitido = true;
    }

    // Modo desarrollo: permite cualquier puerto de localhost/127.0.0.1.
    if (!$originPermitido && preg_match('#^http://(localhost|127\.0\.0\.1):\d+$#', $origin)) {
        $originPermitido = true;
    }
}

if ($originPermitido) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    // Sin Origin normalmente es acceso directo/navegador/Postman.
    // No forzamos un Origin incorrecto porque eso rompe el preflight.
    if ($origin === '') {
        header('Access-Control-Allow-Origin: https://lerna.3devsnet.com');
    }
}

header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

$allowedHeaders = [
    'Accept',
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'X-CSRF',
    'X-Auth-Token',
    'X-Session',
    'X-Session-Key',
    'X-Tenant-Id',
];

// Si el navegador pide headers específicos en el preflight, se respetan.
$requestHeaders = trim((string)($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? ''));
if ($requestHeaders !== '') {
    header('Access-Control-Allow-Headers: ' . $requestHeaders);
} else {
    header('Access-Control-Allow-Headers: ' . implode(', ', $allowedHeaders));
}

header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
