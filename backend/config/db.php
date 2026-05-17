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


function saas_env_bool(string $key, bool $default = false): bool
{
    if (function_exists('env_bool')) {
        return env_bool($key, $default);
    }

    $value = strtolower(trim((string)env_value($key, $default ? 'true' : 'false')));
    return in_array($value, ['1', 'true', 'yes', 'on', 'si', 'sí'], true);
}

function request_declared_tenant_id(): int
{
    $body = function_exists('request_body') ? request_body() : [];

    $candidates = [
        $_SERVER['HTTP_X_TENANT_ID'] ?? null,
        $_SERVER['HTTP_X_ID_TENANT'] ?? null,
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

    foreach ($candidates as $value) {
        $value = trim((string)($value ?? ''));
        if ($value !== '' && ctype_digit($value)) {
            return (int)$value;
        }
    }

    return 0;
}

function assert_request_tenant_matches_context(array $ctx): void
{
    $declaredTenant = request_declared_tenant_id();
    if ($declaredTenant <= 0) {
        return;
    }

    $sessionTenant = (int)($ctx['idTenant'] ?? 0);
    if ($sessionTenant > 0 && $declaredTenant !== $sessionTenant) {
        throw new RuntimeException('TENANT_MISMATCH');
    }
}

function current_host_for_tenant_resolution(): string
{
    $host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '')));
    $host = preg_replace('/:\d+$/', '', $host) ?? $host;
    return $host;
}

function request_public_tenant_hint(): string
{
    $body = function_exists('request_body') ? request_body() : [];

    $candidates = [
        $_SERVER['HTTP_X_TENANT_SLUG'] ?? null,
        $_SERVER['HTTP_X_PUBLIC_TENANT'] ?? null,
        $_GET['tenant'] ?? null,
        $_GET['tenant_slug'] ?? null,
        $_GET['slug'] ?? null,
        $_POST['tenant'] ?? null,
        $_POST['tenant_slug'] ?? null,
        $_POST['slug'] ?? null,
        $body['tenant'] ?? null,
        $body['tenant_slug'] ?? null,
        $body['slug'] ?? null,
    ];

    foreach ($candidates as $value) {
        $value = strtolower(trim((string)($value ?? '')));
        if ($value !== '' && preg_match('/^[a-z0-9._-]{2,190}$/', $value) === 1) {
            return $value;
        }
    }

    return '';
}

function tenant_context_by_id(int $idTenant): ?array
{
    if ($idTenant <= 0) {
        return null;
    }

    $master = master_db();
    $stmt = $master->prepare("\n        SELECT\n            NULL AS idSesion,\n            NULL AS session_key,\n            NULL AS idUsuarioMaster,\n            t.idTenant,\n            NULL AS expira_en,\n            NULL AS usuario,\n            NULL AS email_recuperacion,\n            NULL AS rol,\n            NULL AS tema,\n            1 AS usuario_activo,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo\n        FROM tenants t\n        WHERE t.idTenant = :idTenant\n          AND t.activo = 1\n        LIMIT 1\n    ");
    $stmt->execute([':idTenant' => $idTenant]);
    $ctx = $stmt->fetch();

    return $ctx ?: null;
}

function public_tenant_context(): ?array
{
    static $cache = null;
    static $loaded = false;

    if ($loaded) {
        return $cache;
    }

    $loaded = true;
    $master = master_db();
    $host = current_host_for_tenant_resolution();
    $hint = request_public_tenant_hint();

    if ($hint !== '') {
        $stmt = $master->prepare("\n            SELECT t.idTenant\n            FROM tenants t\n            LEFT JOIN tenant_dominios td ON td.idTenant = t.idTenant AND td.activo = 1\n            WHERE t.activo = 1\n              AND (LOWER(t.slug) = :hint_slug OR LOWER(td.dominio) = :hint_dominio)\n            ORDER BY CASE WHEN LOWER(t.slug) = :hint_orden THEN 0 ELSE 1 END\n            LIMIT 1\n        ");
        $stmt->execute([
            ':hint_slug' => $hint,
            ':hint_dominio' => $hint,
            ':hint_orden' => $hint,
        ]);
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            $cache = tenant_context_by_id($id);
            return $cache;
        }
    }

    if ($host !== '') {
        $stmt = $master->prepare("\n            SELECT t.idTenant\n            FROM tenant_dominios td\n            INNER JOIN tenants t ON t.idTenant = td.idTenant\n            WHERE td.activo = 1\n              AND t.activo = 1\n              AND LOWER(td.dominio) = :host\n            LIMIT 1\n        ");
        $stmt->execute([':host' => $host]);
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            $cache = tenant_context_by_id($id);
            return $cache;
        }
    }

    // En local se permite resolver el tenant por DEFAULT_TENANT_ID, pero siempre desde mesas_master.
    // No se usan credenciales DB_* directas salvo que ALLOW_DEFAULT_TENANT_DB esté explícitamente habilitado.
    $appEnv = strtolower((string)(env_value('APP_ENV', 'local') ?? 'local'));
    if (in_array($appEnv, ['local', 'development', 'dev'], true)) {
        $defaultTenant = (int)(env_value('DEFAULT_TENANT_ID', '0') ?? '0');
        if ($defaultTenant > 0) {
            $cache = tenant_context_by_id($defaultTenant);
            return $cache;
        }
    }

    return null;
}

function pdo_from_tenant_context(array $ctx, string $prefix = 'tenant'): PDO
{
    static $connections = [];

    $host = (string)$ctx['db_host'];
    $name = (string)$ctx['db_name'];
    $user = (string)$ctx['db_user'];
    $pass = (string)$ctx['db_pass'];

    if ($host === '' || $name === '' || $user === '') {
        throw new RuntimeException('Configuración de base de datos del tenant incompleta.');
    }

    $key = "{$prefix}|{$host}|{$name}|{$user}";
    if (!isset($connections[$key])) {
        $connections[$key] = pdo_connect($host, $name, $user, $pass);
    }

    return $connections[$key];
}

function public_tenant_db(): PDO
{
    $ctx = public_tenant_context();
    if (!$ctx) {
        throw new RuntimeException('No se pudo resolver el tenant público para esta solicitud.');
    }

    return pdo_from_tenant_context($ctx, 'public');
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

    $stmt = $master->prepare("\n        SELECT\n            s.idSesion,\n            s.session_key,\n            s.idUsuarioMaster,\n            s.idTenant,\n            s.expira_en,\n            u.usuario,\n            u.email_recuperacion,\n            u.rol,\n            u.tema,\n            u.activo AS usuario_activo,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo\n        FROM sesiones s\n        INNER JOIN usuarios_master u ON u.idUsuarioMaster = s.idUsuarioMaster\n        INNER JOIN tenants t ON t.idTenant = s.idTenant\n        WHERE s.session_key = :session_key\n          AND s.activo = 1\n        LIMIT 1\n    ");
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

    $upd = $master->prepare("UPDATE sesiones SET ultimo_uso = NOW() WHERE idSesion = :idSesion");
    $upd->execute([':idSesion' => (int)$ctx['idSesion']]);

    $cache[$sessionKey] = $ctx;
    return $ctx;
}

function tenant_db(): PDO
{
    $ctx = tenant_context();

    if (!$ctx) {
        // Fallback directo a DB_* queda reservado solo para desarrollo o migraciones puntuales.
        // En SaaS real, las acciones privadas deben morir sin sesión y las públicas deben usar public_tenant_db().
        if (!saas_env_bool('ALLOW_DEFAULT_TENANT_DB', false)) {
            throw new RuntimeException('No hay sesión SaaS válida para resolver la base del tenant.');
        }

        $host = env_value('DB_HOST', 'localhost') ?? 'localhost';
        $name = env_value('DB_NAME', 'mesas_examen_ena') ?? 'mesas_examen_ena';
        $user = env_value('DB_USER', 'root') ?? 'root';
        $pass = env_value('DB_PASS', '') ?? '';

        return pdo_from_tenant_context([
            'db_host' => $host,
            'db_name' => $name,
            'db_user' => $user,
            'db_pass' => $pass,
        ], 'fallback');
    }

    assert_request_tenant_matches_context($ctx);
    return pdo_from_tenant_context($ctx, 'tenant');
}

/**
 * Conexión principal del sistema.
 * En acciones privadas devuelve SIEMPRE la DB del tenant asociado a la sesión.
 */
function db(): PDO
{
    return tenant_db();
}
