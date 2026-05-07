<?php
// backend/modules/login/debug_saas.php
// Diagnóstico local para detectar por qué falla el login SaaS.
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function debug_saas_login(): void
{
    $env = strtolower((string)(env_value('APP_ENV', 'local') ?? 'local'));
    $debug = function_exists('env_bool') ? env_bool('APP_DEBUG', false) : strtolower((string)env_value('APP_DEBUG', 'false')) === 'true';

    if ($env !== 'local' && !$debug) {
        json_response(['exito' => false, 'mensaje' => 'Debug deshabilitado.'], 403);
    }

    $data = request_body();
    $usuarioPrueba = trim((string)($_GET['usuario'] ?? $data['usuario'] ?? $data['nombre'] ?? 'admin'));
    $passPrueba = (string)($_GET['contrasena'] ?? $data['contrasena'] ?? 'admin123');

    $out = [
        'exito' => true,
        'mensaje' => 'Diagnóstico SaaS login.',
        'php' => PHP_VERSION,
        'env' => [
            'APP_ENV' => env_value('APP_ENV', null),
            'APP_DEBUG' => env_value('APP_DEBUG', null),
            'MASTER_DB_HOST' => env_value('MASTER_DB_HOST', null),
            'MASTER_DB_NAME' => env_value('MASTER_DB_NAME', null),
            'MASTER_DB_USER' => env_value('MASTER_DB_USER', null),
            'MASTER_DB_PASS_largo' => strlen((string)env_value('MASTER_DB_PASS', '')),
            'DB_NAME' => env_value('DB_NAME', null),
            'DB_USER' => env_value('DB_USER', null),
            'DB_PASS_largo' => strlen((string)env_value('DB_PASS', '')),
        ],
        'checks' => [],
    ];

    try {
        $master = master_db();
        $out['checks']['conexion_master'] = 'OK';

        foreach (['planes_saas', 'tenants', 'usuarios_master', 'sesiones', 'login_auditoria'] as $tabla) {
            try {
                $stmt = $master->prepare('SHOW TABLES LIKE :tabla');
                $stmt->execute([':tabla' => $tabla]);
                $out['checks']['tabla_' . $tabla] = (bool)$stmt->fetchColumn() ? 'OK' : 'NO_EXISTE';
            } catch (Throwable $e) {
                $out['checks']['tabla_' . $tabla] = 'ERROR: ' . $e->getMessage();
            }
        }

        try {
            $stmt = $master->query("SELECT idTenant, nombre, db_host, db_name, db_user, LENGTH(db_pass) AS db_pass_largo, activo FROM tenants ORDER BY idTenant LIMIT 10");
            $out['tenants'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            $out['tenants_error'] = $e->getMessage();
        }

        try {
            $stmt = $master->prepare("\n                SELECT\n                    u.idUsuarioMaster,\n                    u.idTenant,\n                    u.usuario,\n                    u.rol,\n                    u.activo,\n                    LENGTH(u.hash_contrasena) AS hash_largo,\n                    t.db_name,\n                    t.activo AS tenant_activo\n                FROM usuarios_master u\n                LEFT JOIN tenants t ON t.idTenant = u.idTenant\n                WHERE LOWER(u.usuario) = LOWER(:usuario)\n                LIMIT 1\n            ");
            $stmt->execute([':usuario' => $usuarioPrueba]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            $out['usuario_prueba'] = $user ?: null;

            if ($user) {
                $stmtHash = $master->prepare('SELECT hash_contrasena FROM usuarios_master WHERE idUsuarioMaster = :id LIMIT 1');
                $stmtHash->execute([':id' => (int)$user['idUsuarioMaster']]);
                $hash = (string)$stmtHash->fetchColumn();
                $out['checks']['password_' . $usuarioPrueba] = (hash_equals($hash, $passPrueba) || password_verify($passPrueba, $hash)) ? 'OK' : 'NO_COINCIDE';
            }
        } catch (Throwable $e) {
            $out['usuario_prueba_error'] = $e->getMessage();
        }

        try {
            $stmt = $master->prepare("INSERT INTO sesiones (session_key, idUsuarioMaster, idTenant, creado_en, expira_en, ultimo_uso, ip, user_agent, activo) VALUES (:session_key, 1, 1, NOW(), DATE_ADD(NOW(), INTERVAL 5 MINUTE), NOW(), 'debug', 'debug', 0)");
            $debugKey = 'debug_' . bin2hex(random_bytes(8));
            $stmt->execute([':session_key' => $debugKey]);
            $out['checks']['insert_sesiones'] = 'OK';
        } catch (Throwable $e) {
            $out['checks']['insert_sesiones'] = 'ERROR: ' . $e->getMessage();
        }
    } catch (Throwable $e) {
        $out['exito'] = false;
        $out['checks']['conexion_master'] = 'ERROR: ' . $e->getMessage();
        $out['archivo'] = basename($e->getFile()) . ':' . $e->getLine();
    }

    json_response($out, $out['exito'] ? 200 : 500);
}
