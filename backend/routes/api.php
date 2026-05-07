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

$action = trim((string)(
    $_GET['action']
    ?? $_POST['action']
    ?? $body['action']
    ?? ''
));

$accionesPublicas = [
    'inicio',
    'registro',
    'auth_csrf_token',
    'debug_saas_login',

    // Formulario público de inscripción a mesas.
    'form_obtener_config_inscripcion',
    'form_buscar_previas',
    'form_registrar_inscripcion',

    // Alias compatibles con el formulario viejo.
    'obtener_config_inscripcion',
    'buscar_previas',
    'registrar_inscripcion',
    'formulario_obtener_config_inscripcion',
    'formulario_buscar_previas',
    'formulario_registrar_inscripcion',
];

try {
    if ($action === '') {
        json_response([
            'exito' => false,
            'mensaje' => 'Falta el parámetro action.',
        ], 400);
    }


/*
|--------------------------------------------------------------------------
| Debug SaaS público forzado
|--------------------------------------------------------------------------
| Esto va antes del require_auth. Si esta URL devuelve "Sesión expirada",
| entonces NO se está ejecutando este api.php.
*/
if ($action === 'debug_saas_login') {
    require_once __DIR__ . '/../modules/login/route.php';
    route_login($action);
    exit;
}

    if ($action === 'auth_csrf_token') {
        json_response([
            'exito' => true,
            'csrf_token' => csrf_token(),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Seguridad general
    |--------------------------------------------------------------------------
    | Todas las acciones que no sean públicas requieren sesión.
    | En métodos distintos de GET también se valida CSRF.
    */
    if (!in_array($action, $accionesPublicas, true)) {
        require_auth();

        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            validar_csrf();
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Rutas de módulos
    |--------------------------------------------------------------------------
    */
    require_once __DIR__ . '/../modules/login/route.php';
    require_once __DIR__ . '/../modules/global/route.php';
    require_once __DIR__ . '/../modules/formulario/route.php';
    require_once __DIR__ . '/../modules/materias/route.php';
    require_once __DIR__ . '/../modules/catedras/route.php';
    require_once __DIR__ . '/../modules/docentes/route.php';
    require_once __DIR__ . '/../modules/disponibilidad_docentes/route.php';
    require_once __DIR__ . '/../modules/previas/route.php';
    require_once __DIR__ . '/../modules/mesas/route.php';
    require_once __DIR__ . '/../modules/auditoria/route.php';

    /*
    |--------------------------------------------------------------------------
    | Despacho de acciones
    |--------------------------------------------------------------------------
    */
    if (route_login($action)) {
        exit;
    }

    if (route_global($action)) {
        exit;
    }

    if (route_formulario($action)) {
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

    if (route_disponibilidad_docentes($action)) {
        exit;
    }

    if (route_previas($action)) {
        exit;
    }

    if (route_mesas($action)) {
        exit;
    }

    if (route_auditoria($action)) {
        exit;
    }

    json_response([
        'exito' => false,
        'mensaje' => 'Acción no encontrada.',
    ], 404);

} catch (Throwable $e) {
    log_error($e, 'router:' . $action);

    
    $debug = strtolower((string)(env_value('APP_DEBUG', 'false') ?? 'false')) === 'true';
    $payload = [
        'exito' => false,
        'mensaje' => 'Error interno del servidor.',
    ];
    if ($debug) {
        $payload['detalle'] = $e->getMessage();
        $payload['archivo'] = basename($e->getFile()) . ':' . $e->getLine();
    }
    json_response($payload, 500);
}