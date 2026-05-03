<?php
// backend/routes/api.php
declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../core/helpers.php';
require_once __DIR__ . '/../core/auth.php';
require_once __DIR__ . '/../core/csrf.php';

date_default_timezone_set(env_value('APP_TIMEZONE', 'America/Argentina/Cordoba') ?? 'America/Argentina/Cordoba');
mb_internal_encoding('UTF-8');

ini_set('display_errors', env_value('APP_DEBUG', 'false') === 'true' ? '1' : '0');
ini_set('log_errors', '1');

$body = request_body();
$action = trim((string)($_GET['action'] ?? $_POST['action'] ?? $body['action'] ?? ''));

$accionesPublicas = [
    'inicio',
    'registro',
    'auth_csrf_token',
];

try {
    if ($action === '') {
        json_response(['exito' => false, 'mensaje' => 'Falta el parámetro action.'], 400);
    }

    if ($action === 'auth_csrf_token') {
        json_response(['exito' => true, 'csrf_token' => csrf_token()]);
    }

    if (!in_array($action, $accionesPublicas, true)) {
        require_auth();

        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            validar_csrf();
        }
    }

    require_once __DIR__ . '/../modules/login/route.php';
    require_once __DIR__ . '/../modules/global/route.php';
    require_once __DIR__ . '/../modules/materias/route.php';
    require_once __DIR__ . '/../modules/catedras/route.php';
    require_once __DIR__ . '/../modules/docentes/route.php';
    require_once __DIR__ . '/../modules/mesas/route.php';

    if (route_login($action)) {
        exit;
    }

    if (route_global($action)) {
        exit;
    }

    if (route_materias($action)) {
        exit;
    }

    if (route_catedras($action)) {
        exit;
    }

    if (route_docentes($action)) {
        exit;
    }

    if (route_mesas($action)) {
        exit;
    }

    json_response(['exito' => false, 'mensaje' => 'Acción no encontrada.'], 404);
} catch (Throwable $e) {
    log_error($e, 'router:' . $action);

    json_response([
        'exito' => false,
        'mensaje' => 'Error interno del servidor.',
    ], 500);
}