<?php
// backend/config/cors.php
// CORS robusto para producción + desarrollo local.
// Permite usar el frontend local contra la API subida en Hostinger.
declare(strict_types=1);

require_once __DIR__ . '/env.php';

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

/*
|--------------------------------------------------------------------------
| Orígenes permitidos
|--------------------------------------------------------------------------
| En producción podés dejar ALLOWED_ORIGIN con uno o varios dominios separados
| por coma. Igualmente se permite localhost/127.0.0.1 para desarrollo local.
|
| Ejemplo:
| ALLOWED_ORIGIN=https://lerna.3devsnet.com,http://localhost:3000
*/
$envAllowedRaw = (string)env_value('ALLOWED_ORIGIN', '');
$envAllowed = array_values(array_filter(array_map('trim', explode(',', $envAllowedRaw))));

$frontendUrl = trim((string)env_value('FRONTEND_URL', ''));
if ($frontendUrl !== '') {
    $envAllowed[] = rtrim($frontendUrl, '/');
}

$defaultAllowed = [
    'https://lerna.3devsnet.com',
    'https://www.lerna.3devsnet.com',
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

    // Desarrollo: permite cualquier puerto local sin tener que tocar el .env.
    if (!$originPermitido && preg_match('#^http://(localhost|127\.0\.0\.1):\d+$#', $origin)) {
        $originPermitido = true;
    }
}

if (!headers_sent()) {
    // Evita duplicados si algún .htaccess o include previo intentó escribir CORS.
    header_remove('Access-Control-Allow-Origin');
    header_remove('Access-Control-Allow-Credentials');
    header_remove('Access-Control-Allow-Methods');
    header_remove('Access-Control-Allow-Headers');
    header_remove('Access-Control-Expose-Headers');
    header_remove('Access-Control-Max-Age');

    if ($originPermitido) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
    } elseif ($origin === '') {
        // Acceso directo/Postman/navegador sin Origin.
        header('Access-Control-Allow-Origin: https://lerna.3devsnet.com');
        header('Access-Control-Allow-Credentials: true');
    }

    header('Vary: Origin, Access-Control-Request-Headers, Access-Control-Request-Method');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

    $baseAllowedHeaders = [
        'Accept',
        'Accept-Language',
        'Content-Language',
        'Content-Type',
        'Authorization',
        'Origin',
        'Cache-Control',
        'Pragma',
        'X-Requested-With',
        'X-CSRF-Token',
        'X-CSRF',
        'X-Auth-Token',
        'X-Session',
        'X-Session-Key',
        'X-Tenant-Id',
        // Variantes en minúscula para hosts/proxies que devuelven headers sensibles a texto.
        'authorization',
        'x-requested-with',
        'x-csrf-token',
        'x-csrf',
        'x-auth-token',
        'x-session',
        'x-session-key',
        'x-tenant-id',
    ];

    $requestedHeadersRaw = trim((string)($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? ''));
    $requestedHeaders = [];

    if ($requestedHeadersRaw !== '') {
        foreach (explode(',', $requestedHeadersRaw) as $headerName) {
            $headerName = trim($headerName);
            if ($headerName !== '') {
                $requestedHeaders[] = $headerName;
            }
        }
    }

    $allowHeaders = array_values(array_unique(array_merge($baseAllowedHeaders, $requestedHeaders)));
    header('Access-Control-Allow-Headers: ' . implode(', ', $allowHeaders));
    header('Access-Control-Expose-Headers: Content-Type, Authorization, X-Session, X-Session-Key');
    header('Access-Control-Max-Age: 86400');
}

if ($method === 'OPTIONS') {
    // Si el origen no está permitido, el navegador igual bloqueará la request.
    // Respondemos 204 para que los orígenes válidos no lleguen al router ni a auth.
    http_response_code(204);
    exit;
}
