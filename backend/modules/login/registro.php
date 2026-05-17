<?php
// backend/modules/login/registro.php
// Registro SaaS básico: crea usuarios en mesas_master. Usar principalmente para pruebas/local.
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';
require_once __DIR__ . '/../../core/auth.php';
require_once __DIR__ . '/../../core/csrf.php';

function login_registro(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $data = request_body();
    $nombre = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));
    $email = trim((string)($data['email_recuperacion'] ?? $data['email'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');
    $rol = strtolower(trim((string)($data['rol'] ?? 'vista')));

    $registroPublico = function_exists('env_bool') ? env_bool('ALLOW_PUBLIC_REGISTRATION', false) : false;
    if ($registroPublico) {
        $idTenant = (int)($data['idTenant'] ?? env_value('DEFAULT_TENANT_ID', '1'));
    } else {
        $ctx = auth_context();
        if (!$ctx) {
            json_response(['exito' => false, 'mensaje' => 'Sesión expirada.'], 401);
        }

        if (strtolower((string)($ctx['rol'] ?? '')) !== 'admin') {
            json_response(['exito' => false, 'mensaje' => 'No tenés permisos para crear usuarios.'], 403);
        }

        if (function_exists('assert_request_tenant_matches_context')) {
            try {
                assert_request_tenant_matches_context($ctx);
            } catch (RuntimeException $e) {
                if ($e->getMessage() === 'TENANT_MISMATCH') {
                    json_response(['exito' => false, 'mensaje' => 'El tenant enviado no coincide con la sesión activa.'], 403);
                }
                throw $e;
            }
        }

        $idTenant = (int)$ctx['idTenant'];
    }

    if ($nombre === '' || $contrasena === '' || $rol === '' || $idTenant <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Faltan datos.']);
    }

    if (mb_strlen($nombre) < 4 || mb_strlen($nombre) > 100) {
        json_response(['exito' => false, 'mensaje' => 'El usuario debe tener entre 4 y 100 caracteres.']);
    }

    if (strlen($contrasena) < 6) {
        json_response(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 6 caracteres.']);
    }

    if (!in_array($rol, ['vista', 'admin'], true)) {
        json_response(['exito' => false, 'mensaje' => 'Rol inválido (use "vista" o "admin").']);
    }

    try {
        $master = master_db();

        $stmt = $master->prepare("SELECT COUNT(*) FROM tenants WHERE idTenant = :idTenant AND activo = 1");
        $stmt->execute([':idTenant' => $idTenant]);
        if ((int)$stmt->fetchColumn() === 0) {
            json_response(['exito' => false, 'mensaje' => 'Tenant inexistente o desactivado.']);
        }

        $stmt = $master->prepare("\n            SELECT COUNT(*)\n            FROM usuarios_master\n            WHERE idTenant = :idTenant\n              AND LOWER(usuario) = LOWER(:usuario)\n        ");
        $stmt->execute([
            ':idTenant' => $idTenant,
            ':usuario' => $nombre,
        ]);

        if ((int)$stmt->fetchColumn() > 0) {
            json_response(['exito' => false, 'mensaje' => 'Ya existe un usuario con ese nombre en este sistema.']);
        }

        $hash = password_hash($contrasena, PASSWORD_BCRYPT);

        $stmt = $master->prepare("\n            INSERT INTO usuarios_master (\n                idTenant,\n                usuario,\n                email_recuperacion,\n                hash_contrasena,\n                rol,\n                tema,\n                activo,\n                fecha_creacion\n            ) VALUES (\n                :idTenant,\n                :usuario,\n                :email_recuperacion,\n                :hash_contrasena,\n                :rol,\n                'claro',\n                1,\n                NOW()\n            )\n        ");
        $stmt->execute([
            ':idTenant' => $idTenant,
            ':usuario' => $nombre,
            ':email_recuperacion' => $email !== '' ? $email : null,
            ':hash_contrasena' => $hash,
            ':rol' => $rol,
        ]);

        json_response([
            'exito' => true,
            'mensaje' => 'Usuario creado correctamente.',
            'usuario' => [
                'idUsuarioMaster' => (int)$master->lastInsertId(),
                'idUsuario' => (int)$master->lastInsertId(),
                'Nombre_Completo' => $nombre,
                'usuario' => $nombre,
                'rol' => $rol,
                'idTenant' => $idTenant,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'login_registro_saas');
        json_response(['exito' => false, 'mensaje' => 'Error del servidor.'], 500);
    }
}
