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

        // FIX: PDO con ATTR_EMULATE_PREPARES=false no permite usar el mismo named parameter
        // dos veces en la misma query. Se usan :usuario y :usuario2 con el mismo valor.
        $stmt = $master->prepare("
            SELECT
                u.idUsuarioMaster,
                u.idTenant,
                u.usuario,
                u.email_recuperacion,
                u.hash_contrasena,
                LOWER(u.rol) AS rol,
                u.tema,
                u.activo AS usuario_activo,
                t.nombre AS tenant_nombre,
                t.logo_url,
                /* Compatibilidad: la columna logo_icono_url fue eliminada de tenants.
                   Se devuelve el mismo logo_url como alias para no romper el frontend viejo. */
                t.logo_url AS logo_icono_url,
                t.db_host,
                t.db_name,
                t.activo AS tenant_activo
            FROM usuarios_master u
            INNER JOIN tenants t ON t.idTenant = u.idTenant
            WHERE (LOWER(u.usuario) = LOWER(:usuario) OR LOWER(COALESCE(u.email_recuperacion, '')) = LOWER(:usuario2))
            LIMIT 1
        ");
        $stmt->execute([':usuario' => $nombre, ':usuario2' => $nombre]);
        $usuario = $stmt->fetch();

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
            ],
            'tenant'     => [
                'idTenant'      => (int)$usuario['idTenant'],
                'nombre'        => (string)$usuario['tenant_nombre'],
                'logo_url'      => $usuario['logo_url'] ?? null,
                'logo_icono_url' => $usuario['logo_icono_url'] ?? null,
                'db_name'       => (string)$usuario['db_name'],
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'login_inicio_saas');
        json_response(['exito' => false, 'mensaje' => 'Error del servidor.'], 500);
    }
}