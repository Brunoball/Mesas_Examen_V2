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
 * Host actual sin puerto, normalizado a minusculas.
 */
function request_host_normalizado(): string
{
    $host = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? ''));
    if (strpos($host, ',') !== false) {
        $host = trim(explode(',', $host)[0]);
    }
    $host = preg_replace('/:\d+$/', '', $host) ?: '';
    $host = strtolower(trim($host));
    return $host;
}

function request_host_from_url_or_host(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    if (preg_match('#^https?://#i', $value) === 1) {
        $parsed = parse_url($value);
        $value = is_array($parsed) ? (string)($parsed['host'] ?? '') : '';
    }

    return request_host_normalizado_from_value($value);
}

/**
 * Hosts posibles para resolver el tenant publico.
 * Si el formulario vive en escuela.lerna.com.ar pero llama a una API central
 * (por ejemplo panel.lerna.com.ar/api.php), HTTP_HOST es la API; por eso
 * primero miramos Origin/Referer, que representan el subdominio del formulario.
 */
function request_public_tenant_host_candidates(): array
{
    $raw = [
        $_SERVER['HTTP_ORIGIN'] ?? '',
        $_SERVER['HTTP_REFERER'] ?? '',
        $_SERVER['HTTP_X_FORWARDED_HOST'] ?? '',
        $_SERVER['HTTP_HOST'] ?? '',
    ];

    $hosts = [];
    foreach ($raw as $value) {
        $host = request_host_from_url_or_host((string)$value);
        if ($host !== '') {
            $hosts[] = $host;
        }
    }

    return array_values(array_unique($hosts));
}

function request_public_tenant_es_local(): bool
{
    foreach (request_public_tenant_host_candidates() as $host) {
        if (request_host_es_local($host)) {
            return true;
        }
    }

    return request_host_es_local(request_host_normalizado());
}

function request_host_es_local(string $host): bool
{
    return in_array($host, ['localhost', '127.0.0.1', '::1'], true)
        || preg_match('/\.local$/', $host) === 1
        || preg_match('/^localhost$/', $host) === 1;
}

/**
 * Lee un id de tenant enviado de forma explicita por query/body/header.
 * No usa DEFAULT_TENANT_ID para evitar que un formulario publico caiga
 * accidentalmente en la DB de otra escuela.
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
    ];

    foreach ($candidates as $value) {
        $id = (int)$value;
        if ($id > 0) {
            return $id;
        }
    }

    return 0;
}

function public_tenant_context_by_id(int $idTenant): ?array
{
    if ($idTenant <= 0) {
        return null;
    }

    $master = master_db();
    $stmt = $master->prepare("\n        SELECT\n            t.idTenant,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_url AS logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo,\n            NULL AS dominio_resuelto,\n            'idTenant' AS tenant_resuelto_por\n        FROM tenants t\n        WHERE t.idTenant = :idTenant\n          AND t.activo = 1\n        LIMIT 1\n    ");
    $stmt->execute([':idTenant' => $idTenant]);

    $ctx = $stmt->fetch();
    return $ctx ?: null;
}

/**
 * Resuelve el tenant por dominio/subdominio usando la base MASTER.
 * Este es el camino correcto para formularios publicos:
 * escuela-a.lerna.com.ar -> tenant A -> DB A.
 */
function public_tenant_context_by_host(?string $host = null): ?array
{
    $host = request_host_normalizado_from_value($host ?? request_host_normalizado());
    if ($host === '' || request_host_es_local($host)) {
        return null;
    }

    $candidates = [$host];
    if (strpos($host, 'www.') === 0) {
        $candidates[] = substr($host, 4);
    } else {
        $candidates[] = 'www.' . $host;
    }
    $candidates = array_values(array_unique(array_filter($candidates)));

    $placeholders = implode(',', array_fill(0, count($candidates), '?'));
    $master = master_db();
    $stmt = $master->prepare("\n        SELECT\n            t.idTenant,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_url AS logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo,\n            td.dominio AS dominio_resuelto,\n            td.tipo AS tenant_resuelto_por\n        FROM tenant_dominios td\n        INNER JOIN tenants t ON t.idTenant = td.idTenant\n        WHERE LOWER(td.dominio) IN ({$placeholders})\n          AND td.activo = 1\n          AND t.activo = 1\n        ORDER BY FIELD(LOWER(td.dominio), {$placeholders})\n        LIMIT 1\n    ");
    $stmt->execute(array_merge($candidates, $candidates));

    $ctx = $stmt->fetch();
    return $ctx ?: null;
}

function request_host_normalizado_from_value(string $host): string
{
    $host = trim($host);
    if (strpos($host, ',') !== false) {
        $host = trim(explode(',', $host)[0]);
    }
    $host = preg_replace('/:\d+$/', '', $host) ?: '';
    return strtolower(trim($host));
}

function public_default_tenant_id_permitido(): int
{
    // En local se permite DEFAULT_TENANT_ID para facilitar pruebas.
    if (request_public_tenant_es_local()) {
        return (int)(env_value('DEFAULT_TENANT_ID', '0') ?? '0');
    }

    // En produccion solo se usa si lo habilitas explicitamente.
    if (env_bool('PUBLIC_FORM_ALLOW_DEFAULT_TENANT', false)) {
        return (int)(env_value('DEFAULT_TENANT_ID', '0') ?? '0');
    }

    return 0;
}

function public_query_tenant_permitido(): bool
{
    if (request_public_tenant_es_local()) {
        return true;
    }

    return env_bool('PUBLIC_FORM_ALLOW_QUERY_TENANT', false);
}

/**
 * Resuelve el tenant para acciones publicas del formulario.
 * Prioridad segura:
 * 1) Dominio/subdominio cargado en tenant_dominios.
 * 2) idTenant explicito solo en local o si PUBLIC_FORM_ALLOW_QUERY_TENANT=true.
 * 3) Sesion valida, para el panel/admin.
 * 4) DEFAULT_TENANT_ID solo en local o si PUBLIC_FORM_ALLOW_DEFAULT_TENANT=true.
 */
function public_tenant_context(): ?array
{
    static $cache = [];

    $hostCandidates = request_public_tenant_host_candidates();
    $idFromRequest = public_tenant_id_from_request();
    $sessionKey = request_session_key();
    $cacheKey = implode(',', $hostCandidates) . '|' . $idFromRequest . '|' . substr(hash('sha256', $sessionKey), 0, 16);

    if (array_key_exists($cacheKey, $cache)) {
        return $cache[$cacheKey];
    }

    foreach ($hostCandidates as $hostCandidate) {
        $ctx = public_tenant_context_by_host($hostCandidate);
        if ($ctx) {
            $ctx['host_origen_resuelto'] = $hostCandidate;
            $cache[$cacheKey] = $ctx;
            return $ctx;
        }
    }

    if ($idFromRequest > 0 && public_query_tenant_permitido()) {
        $ctx = public_tenant_context_by_id($idFromRequest);
        if ($ctx) {
            $ctx['tenant_resuelto_por'] = 'idTenant_request';
            $cache[$cacheKey] = $ctx;
            return $ctx;
        }
    }

    if ($sessionKey !== '') {
        $ctx = tenant_context($sessionKey);
        if ($ctx) {
            $ctx['dominio_resuelto'] = null;
            $ctx['tenant_resuelto_por'] = 'session';
            $cache[$cacheKey] = $ctx;
            return $ctx;
        }
    }

    $defaultTenantId = public_default_tenant_id_permitido();
    if ($defaultTenantId > 0) {
        $ctx = public_tenant_context_by_id($defaultTenantId);
        if ($ctx) {
            $ctx['tenant_resuelto_por'] = 'DEFAULT_TENANT_ID';
            $cache[$cacheKey] = $ctx;
            return $ctx;
        }
    }

    $cache[$cacheKey] = null;
    return null;
}

function public_tenant_info(): array
{
    $ctx = public_tenant_context();
    if (!$ctx) {
        return [
            'resuelto' => false,
            'host' => request_host_normalizado(),
            'hosts_candidatos' => request_public_tenant_host_candidates(),
        ];
    }

    return [
        'resuelto' => true,
        'idTenant' => (int)($ctx['idTenant'] ?? 0),
        'nombre' => (string)($ctx['tenant_nombre'] ?? ''),
        'logo_url' => $ctx['logo_url'] ?? null,
        'logo_icono_url' => $ctx['logo_icono_url'] ?? ($ctx['logo_url'] ?? null),
        'dominio' => $ctx['dominio_resuelto'] ?? null,
        'resuelto_por' => $ctx['tenant_resuelto_por'] ?? null,
        'host' => request_host_normalizado(),
        'host_origen_resuelto' => $ctx['host_origen_resuelto'] ?? null,
        'hosts_candidatos' => request_public_tenant_host_candidates(),
    ];
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
        throw new RuntimeException('No se pudo resolver la escuela del formulario. Cargá el subdominio en tenant_dominios o habilitá PUBLIC_FORM_ALLOW_QUERY_TENANT/PUBLIC_FORM_ALLOW_DEFAULT_TENANT para pruebas.');
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


/**
 * Lee tenant explícito para login/recuperación. En producción se recomienda
 * resolver por dominio/subdominio; el id/slug por request queda deshabilitado
 * salvo que se active ALLOW_LOGIN_QUERY_TENANT=true o sea entorno local.
 */
function login_tenant_id_from_request(): int
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

    foreach ($candidates as $value) {
        $id = (int)$value;
        if ($id > 0) {
            return $id;
        }
    }

    return 0;
}

function login_tenant_slug_from_request(): string
{
    $body = function_exists('request_body') ? request_body() : [];

    $candidates = [
        $_SERVER['HTTP_X_TENANT_SLUG'] ?? null,
        $_GET['tenant_slug'] ?? null,
        $_GET['slug'] ?? null,
        $_GET['tenant'] ?? null,
        $_POST['tenant_slug'] ?? null,
        $_POST['slug'] ?? null,
        $_POST['tenant'] ?? null,
        $body['tenant_slug'] ?? null,
        $body['slug'] ?? null,
        $body['tenant'] ?? null,
    ];

    foreach ($candidates as $value) {
        $slug = strtolower(trim((string)$value));
        if ($slug !== '' && preg_match('/^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$/', $slug) === 1) {
            return $slug;
        }
    }

    return '';
}

function login_query_tenant_permitido(): bool
{
    if (request_public_tenant_es_local()) {
        return true;
    }

    return env_bool('ALLOW_LOGIN_QUERY_TENANT', false);
}

function login_default_tenant_id_permitido(): int
{
    if (request_public_tenant_es_local()) {
        return (int)(env_value('DEFAULT_TENANT_ID', '0') ?? '0');
    }

    if (env_bool('ALLOW_LOGIN_DEFAULT_TENANT', false)) {
        return (int)(env_value('DEFAULT_TENANT_ID', '0') ?? '0');
    }

    return 0;
}

function tenant_context_by_slug(string $slug): ?array
{
    $slug = strtolower(trim($slug));
    if ($slug === '') {
        return null;
    }

    $master = master_db();
    $stmt = $master->prepare("\n        SELECT\n            t.idTenant,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_url AS logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo,\n            NULL AS dominio_resuelto,\n            'slug' AS tenant_resuelto_por\n        FROM tenants t\n        WHERE LOWER(t.slug) = LOWER(:slug)\n          AND t.activo = 1\n        LIMIT 1\n    ");
    $stmt->execute([':slug' => $slug]);

    $ctx = $stmt->fetch();
    return $ctx ?: null;
}

function login_single_active_tenant_context(): ?array
{
    if (!env_bool('ALLOW_SINGLE_TENANT_LOGIN_FALLBACK', true)) {
        return null;
    }

    $master = master_db();
    $stmt = $master->query("\n        SELECT COUNT(*)\n        FROM tenants\n        WHERE activo = 1\n    ");
    $total = (int)$stmt->fetchColumn();

    if ($total !== 1) {
        return null;
    }

    $stmt = $master->query("\n        SELECT\n            t.idTenant,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_url AS logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.db_user,\n            t.db_pass,\n            t.activo AS tenant_activo,\n            NULL AS dominio_resuelto,\n            'single_active_tenant' AS tenant_resuelto_por\n        FROM tenants t\n        WHERE t.activo = 1\n        LIMIT 1\n    ");

    $ctx = $stmt->fetch();
    return $ctx ?: null;
}

/**
 * Resuelve el tenant para login y recuperación antes de buscar usuarios.
 * Esto evita que dos escuelas con el mismo usuario/email se crucen por un LIMIT 1.
 */
function login_tenant_context(): ?array
{
    static $cache = null;

    if (is_array($cache)) {
        return $cache;
    }

    foreach (request_public_tenant_host_candidates() as $hostCandidate) {
        $ctx = public_tenant_context_by_host($hostCandidate);
        if ($ctx) {
            $ctx['tenant_resuelto_por'] = $ctx['tenant_resuelto_por'] ?? 'host';
            $ctx['host_origen_resuelto'] = $hostCandidate;
            $cache = $ctx;
            return $cache;
        }
    }

    if (login_query_tenant_permitido()) {
        $idFromRequest = login_tenant_id_from_request();
        if ($idFromRequest > 0) {
            $ctx = public_tenant_context_by_id($idFromRequest);
            if ($ctx) {
                $ctx['tenant_resuelto_por'] = 'idTenant_login_request';
                $cache = $ctx;
                return $cache;
            }
        }

        $slug = login_tenant_slug_from_request();
        if ($slug !== '') {
            $ctx = tenant_context_by_slug($slug);
            if ($ctx) {
                $ctx['tenant_resuelto_por'] = 'slug_login_request';
                $cache = $ctx;
                return $cache;
            }
        }
    }

    $defaultTenantId = login_default_tenant_id_permitido();
    if ($defaultTenantId > 0) {
        $ctx = public_tenant_context_by_id($defaultTenantId);
        if ($ctx) {
            $ctx['tenant_resuelto_por'] = 'DEFAULT_TENANT_ID_LOGIN';
            $cache = $ctx;
            return $cache;
        }
    }

    $ctx = login_single_active_tenant_context();
    if ($ctx) {
        $cache = $ctx;
        return $cache;
    }

    return null;
}

function tenant_db(): PDO
{
    static $connections = [];

    $ctx = tenant_context();

    if (!$ctx) {
        // Fallback opcional para acciones públicas viejas del formulario o pruebas locales.
        // Para SaaS real, dejalo en false.
        $allowFallback = strtolower((string)env_value('ALLOW_DEFAULT_TENANT_DB', 'false')) === 'true';
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
