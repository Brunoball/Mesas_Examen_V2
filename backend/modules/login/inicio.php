<?php
// backend/modules/login/inicio.php
// Login SaaS: autentica contra mesas_master. Después, db() resuelve la DB del tenant.
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';
require_once __DIR__ . '/../../core/auth.php';
require_once __DIR__ . '/../../core/csrf.php';

function login_registrar_auditoria_master(PDO $master, ?int $idUsuarioMaster, ?int $idTenant, string $usuario, bool $exito): void
{
    try {
        $stmt = $master->prepare("
            INSERT INTO login_auditoria (
                idUsuarioMaster,
                idTenant,
                usuario,
                ip,
                user_agent,
                exito,
                creado_en
            ) VALUES (
                :idUsuarioMaster,
                :idTenant,
                :usuario,
                :ip,
                :user_agent,
                :exito,
                NOW()
            )
        ");

        if ($idUsuarioMaster) {
            $stmt->bindValue(':idUsuarioMaster', $idUsuarioMaster, PDO::PARAM_INT);
        } else {
            $stmt->bindValue(':idUsuarioMaster', null, PDO::PARAM_NULL);
        }

        if ($idTenant) {
            $stmt->bindValue(':idTenant', $idTenant, PDO::PARAM_INT);
        } else {
            $stmt->bindValue(':idTenant', null, PDO::PARAM_NULL);
        }

        $stmt->bindValue(':usuario', $usuario);
        $stmt->bindValue(':ip', substr((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 64));
        $stmt->bindValue(':user_agent', substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255));
        $stmt->bindValue(':exito', $exito ? 1 : 0, PDO::PARAM_INT);
        $stmt->execute();
    } catch (Throwable $e) {
        log_error($e, 'login_registrar_auditoria_master');
    }
}


function login_tenant_no_resuelto_response(): void
{
    json_response([
        'exito' => false,
        'mensaje' => 'No se pudo identificar la escuela/tenant para iniciar sesión. Revisá el dominio/subdominio configurado en tenant_dominios o enviá un tenant permitido en entorno local.',
    ], 200);
}

function login_buscar_usuario_en_tenant(PDO $master, int $idTenant, string $usuarioOEmail): ?array
{
    $stmt = $master->prepare("\n        SELECT\n            u.idUsuarioMaster,\n            u.idTenant,\n            u.usuario,\n            u.email_recuperacion,\n            u.hash_contrasena,\n            LOWER(u.rol) AS rol,\n            u.tema,\n            u.activo AS usuario_activo,\n            t.nombre AS tenant_nombre,\n            t.logo_url,\n            t.logo_url AS logo_icono_url,\n            t.db_host,\n            t.db_name,\n            t.activo AS tenant_activo\n        FROM usuarios_master u\n        INNER JOIN tenants t ON t.idTenant = u.idTenant\n        WHERE u.idTenant = :idTenant\n          AND (LOWER(u.usuario) = LOWER(:usuario)\n               OR LOWER(COALESCE(u.email_recuperacion, '')) = LOWER(:usuario2))\n        LIMIT 1\n    ");
    $stmt->execute([
        ':idTenant' => $idTenant,
        ':usuario' => $usuarioOEmail,
        ':usuario2' => $usuarioOEmail,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function login_usuario_actual(): void
{
    $usuario = function_exists('usuario_actual') ? usuario_actual() : null;

    if (!$usuario) {
        json_response([
            'exito' => false,
            'mensaje' => 'Sesión inválida o vencida.',
        ], 401);
    }

    json_response([
        'exito' => true,
        'usuario' => $usuario,
        'tenant' => $usuario['tenant'] ?? null,
    ]);
}

function login_inicio(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $data = request_body();
    $nombre = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');

    if ($nombre === '' || $contrasena === '') {
        json_response(['exito' => false, 'mensaje' => 'Faltan datos.'], 200);
    }

    try {
        $master = master_db();

        $tenantLogin = function_exists('login_tenant_context') ? login_tenant_context() : null;
        if (!$tenantLogin || (int)($tenantLogin['idTenant'] ?? 0) <= 0) {
            login_registrar_auditoria_master($master, null, null, $nombre, false);
            login_tenant_no_resuelto_response();
        }

        $idTenantLogin = (int)$tenantLogin['idTenant'];
        $usuario = login_buscar_usuario_en_tenant($master, $idTenantLogin, $nombre);


        if (!$usuario) {
            login_registrar_auditoria_master($master, null, null, $nombre, false);
            json_response(['exito' => false, 'mensaje' => 'Credenciales incorrectas.'], 200);
        }

        if ((int)$usuario['usuario_activo'] !== 1 || (int)$usuario['tenant_activo'] !== 1) {
            login_registrar_auditoria_master($master, (int)$usuario['idUsuarioMaster'], (int)$usuario['idTenant'], $nombre, false);
            json_response(['exito' => false, 'mensaje' => 'Usuario o sistema desactivado.'], 200);
        }

        $hashGuardado = trim((string)$usuario['hash_contrasena']);
        $loginOk = false;

        // Compatibilidad por si en pruebas pegaste texto plano por error. Para producción usá password_hash.
        if ($hashGuardado !== '' && hash_equals($hashGuardado, $contrasena)) {
            $loginOk = true;
        }

        if (!$loginOk && $hashGuardado !== '' && password_verify($contrasena, $hashGuardado)) {
            $loginOk = true;
        }

        if (!$loginOk) {
            login_registrar_auditoria_master($master, (int)$usuario['idUsuarioMaster'], (int)$usuario['idTenant'], $nombre, false);
            json_response(['exito' => false, 'mensaje' => 'Credenciales incorrectas.'], 200);
        }

        $rol = strtolower((string)($usuario['rol'] ?? 'vista'));
        if (!in_array($rol, ['admin', 'vista'], true)) {
            $rol = 'vista';
        }

        $sessionKey = bin2hex(random_bytes(48));
        $horasSesion = max(1, (int)(env_value('SESSION_HOURS', '24') ?? '24'));

        $stmt = $master->prepare("
            INSERT INTO sesiones (
                session_key,
                idUsuarioMaster,
                idTenant,
                creado_en,
                expira_en,
                ultimo_uso,
                ip,
                user_agent,
                activo
            ) VALUES (
                :session_key,
                :idUsuarioMaster,
                :idTenant,
                NOW(),
                DATE_ADD(NOW(), INTERVAL {$horasSesion} HOUR),
                NOW(),
                :ip,
                :user_agent,
                1
            )
        ");
        $stmt->execute([
            ':session_key'      => $sessionKey,
            ':idUsuarioMaster'  => (int)$usuario['idUsuarioMaster'],
            ':idTenant'         => (int)$usuario['idTenant'],
            ':ip'               => substr((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 60),
            ':user_agent'       => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ]);

        iniciar_sesion_si_falta();
        $_SESSION['usuario_id']       = (int)$usuario['idUsuarioMaster'];
        $_SESSION['idUsuarioMaster']  = (int)$usuario['idUsuarioMaster'];
        $_SESSION['idTenant']         = (int)$usuario['idTenant'];
        $_SESSION['usuario']          = (string)$usuario['usuario'];
        $_SESSION['rol']              = $rol;
        $_SESSION['session_key']      = $sessionKey;

        login_registrar_auditoria_master($master, (int)$usuario['idUsuarioMaster'], (int)$usuario['idTenant'], $nombre, true);

        json_response([
            'exito'      => true,
            'mensaje'    => 'Inicio de sesión correcto.',
            'session_key' => $sessionKey,
            // Se manda también como token para compatibilidad con fronts que usan Authorization Bearer.
            'token'      => $sessionKey,
            'csrf_token' => csrf_token(),
            'usuario'    => [
                'idUsuarioMaster' => (int)$usuario['idUsuarioMaster'],
                // Alias viejos para no romper componentes existentes.
                'idUsuario'         => (int)$usuario['idUsuarioMaster'],
                'Nombre_Completo'   => (string)$usuario['usuario'],
                'usuario'           => (string)$usuario['usuario'],
                'email_recuperacion' => $usuario['email_recuperacion'] ?? null,
                'rol'               => $rol,
                'tema'              => (string)($usuario['tema'] ?? 'claro'),
                'idTenant'          => (int)$usuario['idTenant'],
                'tenant_nombre'     => (string)$usuario['tenant_nombre'],
                'logo_url'          => $usuario['logo_url'] ?? null,
                'logo_icono_url'    => $usuario['logo_icono_url'] ?? ($usuario['logo_url'] ?? null),
                'tenant'            => [
                    'idTenant'      => (int)$usuario['idTenant'],
                    'nombre'        => (string)$usuario['tenant_nombre'],
                    'logo_url'      => $usuario['logo_url'] ?? null,
                    'logo_icono_url' => $usuario['logo_icono_url'] ?? ($usuario['logo_url'] ?? null),
                    'db_name'       => (string)$usuario['db_name'],
                ],
            ],
            'tenant'     => [
                'idTenant'      => (int)$usuario['idTenant'],
                'nombre'        => (string)$usuario['tenant_nombre'],
                'logo_url'      => $usuario['logo_url'] ?? null,
                'logo_icono_url' => $usuario['logo_icono_url'] ?? ($usuario['logo_url'] ?? null),
                'db_name'       => (string)$usuario['db_name'],
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'login_inicio_saas');
        json_response(['exito' => false, 'mensaje' => 'Error del servidor.'], 500);
    }
}