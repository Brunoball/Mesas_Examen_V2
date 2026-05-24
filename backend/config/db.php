<?php
// backend/config/db.php
//php -S 127.0.0.1:3001 -t .
// SaaS multitenant: mesas_master guarda usuarios/sesiones/tenants y db() conecta a la DB del tenant logueado.
declare(strict_types=1);

require_once __DIR__ . '/env.php';

function pdo_connect(string $host, string $name, string $user, string $pass): PDO
{
    $dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";

    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

/**
 * Conexión a la base MASTER: usuarios, tenants, sesiones, planes.
 */
function master_db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = env_value('MASTER_DB_HOST', env_value('DB_HOST', 'localhost')) ?? 'localhost';
    $name = env_value('MASTER_DB_NAME', 'mesas_master') ?? 'mesas_master';
    $user = env_value('MASTER_DB_USER', env_value('DB_USER', 'root')) ?? 'root';
    $pass = env_value('MASTER_DB_PASS', env_value('DB_PASS', '')) ?? '';

    $pdo = pdo_connect($host, $name, $user, $pass);
    return $pdo;
}

function bearer_token_from_header(string $authorization): string
{
    $authorization = trim($authorization);
    if ($authorization === '') {
        return '';
    }

    if (stripos($authorization, 'Bearer ') === 0) {
        return trim(substr($authorization, 7));
    }

    return $authorization;
}

function request_session_key(): string
{
    $body = function_exists('request_body') ? request_body() : [];

    $authorization = bearer_token_from_header((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($authorization !== '') return $authorization;

    $headers = [
        'HTTP_X_SESSION',
        'HTTP_X_SESSION_KEY',
        'HTTP_X_AUTH_TOKEN',
    ];

    foreach ($headers as $header) {
        $value = trim((string)($_SERVER[$header] ?? ''));
        if ($value !== '') {
            return $value;
        }
    }

    $queryValue = trim((string)($_GET['session_key'] ?? $_GET['token'] ?? ''));
    if ($queryValue !== '') return $queryValue;

    $bodyValue = trim((string)($body['session_key'] ?? $body['token'] ?? ''));
    return $bodyValue;
}

/**
 * Devuelve el contexto SaaS actual usando session_key contra mesas_master.
 * También actualiza ultimo_uso para mantener viva la sesión.
 */
function tenant_context(?string $sessionKey = null): ?array
{
    static $cache = [];

    $sessionKey = trim((string)($sessionKey ?? request_session_key()));
    if ($sessionKey === '') {
        return null;
    }

    if (isset($cache[$sessionKey])) {
        return $cache[$sessionKey];
    }

    $master = master_db();

    $stmt = $master->prepare("\n        SELECT\n            s.idSesion,\n            s.session_key,\n            s.idUsuarioMaster,\n            s.idTenant,\n            s.expira_en,\n            s.ultimo_uso,\n            u.usuario,\n            u.email_recuperacion,\n            u.rol,\n            u.tema,\n            u.activo AS usuario_activo,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_url AS logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo\n        FROM sesiones s\n        INNER JOIN usuarios_master u ON u.idUsuarioMaster = s.idUsuarioMaster\n        INNER JOIN tenants t ON t.idTenant = s.idTenant\n        WHERE s.session_key = :session_key\n          AND s.activo = 1\n        LIMIT 1\n    ");
    $stmt->execute([':session_key' => $sessionKey]);
    $ctx = $stmt->fetch();

    if (!$ctx) {
        return null;
    }

    if ((int)$ctx['usuario_activo'] !== 1 || (int)$ctx['tenant_activo'] !== 1) {
        return null;
    }

    $expira = strtotime((string)$ctx['expira_en']);
    if ($expira !== false && $expira < time()) {
        $upd = $master->prepare("UPDATE sesiones SET activo = 0 WHERE idSesion = :idSesion");
        $upd->execute([':idSesion' => (int)$ctx['idSesion']]);
        return null;
    }

    // Expiración por inactividad: si pasa 1 hora sin uso real de la sesión, se invalida.
    // Se puede cambiar desde .env con SESSION_IDLE_MINUTES, pero por defecto es 60 minutos.
    $idleMinutes = max(1, (int)(env_value('SESSION_IDLE_MINUTES', '60') ?? '60'));
    $ultimoUso = strtotime((string)($ctx['ultimo_uso'] ?? ''));

    if ($ultimoUso !== false && $ultimoUso < (time() - ($idleMinutes * 60))) {
        $upd = $master->prepare("UPDATE sesiones SET activo = 0 WHERE idSesion = :idSesion");
        $upd->execute([':idSesion' => (int)$ctx['idSesion']]);
        return null;
    }

    $horasSesion = max(1, (int)(env_value('SESSION_HOURS', '24') ?? '24'));
    $upd = $master->prepare("
        UPDATE sesiones
        SET ultimo_uso = NOW(),
            expira_en = DATE_ADD(NOW(), INTERVAL {$horasSesion} HOUR)
        WHERE idSesion = :idSesion
    " );
    $upd->execute([':idSesion' => (int)$ctx['idSesion']]);

    $cache[$sessionKey] = $ctx;
    return $ctx;
}



/**
 * Intenta leer un id de tenant para endpoints publicos.
 * Prioridad: query/body/header y, si no viene nada, DEFAULT_TENANT_ID del .env.
 */
function public_tenant_id_from_request(): int
{
    $body = function_exists('request_body') ? request_body() : [];

    $candidates = [
        $_GET['idTenant'] ?? null,
        $_GET['id_tenant'] ?? null,
        $_GET['tenant_id'] ?? null,
        $_POST['idTenant'] ?? null,
        $_POST['id_tenant'] ?? null,
        $_POST['tenant_id'] ?? null,
        $body['idTenant'] ?? null,
        $body['id_tenant'] ?? null,
        $body['tenant_id'] ?? null,
        $_SERVER['HTTP_X_TENANT_ID'] ?? null,
        env_value('DEFAULT_TENANT_ID', '0'),
    ];

    foreach ($candidates as $value) {
        $id = (int)$value;
        if ($id > 0) {
            return $id;
        }
    }

    return 0;
}

/**
 * Resuelve el tenant para acciones publicas del formulario.
 * Si viene Authorization/X-Session valido, usa ese tenant. Si no, usa DEFAULT_TENANT_ID.
 */
function public_tenant_context(): ?array
{
    $sessionKey = request_session_key();
    if ($sessionKey !== '') {
        $ctx = tenant_context($sessionKey);
        if ($ctx) {
            return $ctx;
        }
    }

    $idTenant = public_tenant_id_from_request();
    if ($idTenant <= 0) {
        return null;
    }

    $master = master_db();
    $stmt = $master->prepare("
        SELECT
            t.idTenant,
            t.nombre AS tenant_nombre,
            t.logo_url,
            t.logo_url AS logo_icono_url,
            t.db_host,
            t.db_name,
            t.db_user,
            t.db_pass,
            t.activo AS tenant_activo
        FROM tenants t
        WHERE t.idTenant = :idTenant
          AND t.activo = 1
        LIMIT 1
    ");
    $stmt->execute([':idTenant' => $idTenant]);

    $ctx = $stmt->fetch();
    if (!$ctx) {
        return null;
    }

    return $ctx;
}

/**
 * Conexion segura para endpoints publicos del formulario.
 * Evita que form_obtener_config_inscripcion explote cuando no hay sesion,
 * pero conserva el tenant correcto si el panel esta logueado y envia token.
 */
function public_tenant_db(): PDO
{
    static $connections = [];

    $ctx = public_tenant_context();
    if ($ctx) {
        $host = trim((string)$ctx['db_host']);
        $name = trim((string)$ctx['db_name']);
        $user = trim((string)$ctx['db_user']);
        $pass = trim((string)$ctx['db_pass']);

        $key = "public_tenant|{$host}|{$name}|{$user}";
        if (!isset($connections[$key])) {
            $connections[$key] = pdo_connect($host, $name, $user, $pass);
        }

        return $connections[$key];
    }

    $allowFallback = strtolower((string)env_value('ALLOW_DEFAULT_TENANT_DB', 'false')) === 'true';
    if (!$allowFallback) {
        throw new RuntimeException('No se pudo resolver el tenant publico del formulario. Revisar DEFAULT_TENANT_ID o enviar X-Tenant-Id.');
    }

    $host = env_value('DB_HOST', 'localhost') ?? 'localhost';
    $name = env_value('DB_NAME', 'mesas_examen_ena') ?? 'mesas_examen_ena';
    $user = env_value('DB_USER', 'root') ?? 'root';
    $pass = env_value('DB_PASS', '') ?? '';
    $key = "public_fallback|{$host}|{$name}|{$user}";

    if (!isset($connections[$key])) {
        $connections[$key] = pdo_connect($host, $name, $user, $pass);
    }

    return $connections[$key];
}



/**
 * Valida, cuando el frontend envía idTenant/id_tenant/tenant_id, que coincida
 * con el tenant real asociado a la sesión. No se usa para resolver la sesión:
 * la sesión siempre manda por Authorization/X-Session.
 */
function assert_request_tenant_matches_context(array $ctx): void
{
    $body = function_exists('request_body') ? request_body() : [];

    $candidates = [
        $_SERVER['HTTP_X_TENANT_ID'] ?? null,
        $_GET['idTenant'] ?? null,
        $_GET['id_tenant'] ?? null,
        $_GET['tenant_id'] ?? null,
        $_POST['idTenant'] ?? null,
        $_POST['id_tenant'] ?? null,
        $_POST['tenant_id'] ?? null,
        $body['idTenant'] ?? null,
        $body['id_tenant'] ?? null,
        $body['tenant_id'] ?? null,
    ];

    $requestTenantId = 0;
    foreach ($candidates as $value) {
        $id = (int)$value;
        if ($id > 0) {
            $requestTenantId = $id;
            break;
        }
    }

    if ($requestTenantId > 0 && $requestTenantId !== (int)($ctx['idTenant'] ?? 0)) {
        throw new RuntimeException('TENANT_MISMATCH');
    }
}

function tenant_db(): PDO
{
    static $connections = [];

    $ctx = tenant_context();

    if (!$ctx) {
        // Fallback opcional para acciones públicas viejas del formulario o pruebas locales.
        // Para SaaS real, dejalo en false.
        $allowFallback = strtolower((string)env_value('ALLOW_DEFAULT_TENANT_DB', 'true')) === 'true';
        if (!$allowFallback) {
            throw new RuntimeException('No hay sesión SaaS válida para resolver la base del tenant.');
        }

        $host = env_value('DB_HOST', 'localhost') ?? 'localhost';
        $name = env_value('DB_NAME', 'mesas_examen_ena') ?? 'mesas_examen_ena';
        $user = env_value('DB_USER', 'root') ?? 'root';
        $pass = env_value('DB_PASS', '') ?? '';
        $key = "fallback|{$host}|{$name}|{$user}";

        if (!isset($connections[$key])) {
            $connections[$key] = pdo_connect($host, $name, $user, $pass);
        }

        return $connections[$key];
    }

    $host = trim((string)$ctx['db_host']);
    $name = trim((string)$ctx['db_name']);
    $user = trim((string)$ctx['db_user']);
    $pass = trim((string)$ctx['db_pass']);

    $key = "tenant|{$host}|{$name}|{$user}";
    if (!isset($connections[$key])) {
        $connections[$key] = pdo_connect($host, $name, $user, $pass);
    }

    return $connections[$key];
}

/**
 * Conexión principal del sistema.
 * En acciones privadas devuelve SIEMPRE la DB del tenant asociado a la sesión.
 */
function db(): PDO
{
    return tenant_db();
}
