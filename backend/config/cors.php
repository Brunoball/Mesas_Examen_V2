<?php
// backend/config/cors.php
declare(strict_types=1);

require_once __DIR__ . '/env.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedRaw = env_value('ALLOWED_ORIGIN', 'http://localhost:5173,http://localhost:3000,http://localhost:3001');
$allowed = array_values(array_filter(array_map('trim', explode(',', (string)$allowedRaw))));

if ($origin !== '' && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) {
    header('Access-Control-Allow-Origin: ' . $origin);
} elseif ($origin === '') {
    header('Access-Control-Allow-Origin: ' . ($allowed[0] ?? 'http://localhost:3000'));
} else {
    header('Access-Control-Allow-Origin: ' . ($allowed[0] ?? 'http://localhost:3000'));
}

header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

// IMPORTANTE: acá deben estar TODOS los headers personalizados que manda React.
// El error venía porque el frontend enviaba X-Session y el preflight no lo tenía permitido.
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
];

header('Access-Control-Allow-Headers: ' . implode(', ', $allowedHeaders));
header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
