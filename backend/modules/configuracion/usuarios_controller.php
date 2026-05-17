<?php
// backend/modules/configuracion/usuarios_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';
require_once __DIR__ . '/../../core/auth.php';

function configuracion_usuarios_body(): array
{
    if (function_exists('get_json_body')) {
        $body = get_json_body();
        return is_array($body) ? $body : [];
    }

    if (function_exists('request_body')) {
        $body = request_body();
        return is_array($body) ? $body : [];
    }

    $raw = file_get_contents('php://input');
    $json = json_decode((string)$raw, true);
    return is_array($json) ? $json : [];
}

function configuracion_usuarios_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function configuracion_usuarios_actual_id(): int
{
    if (function_exists('usuario_id')) {
        return (int)usuario_id();
    }

    iniciar_sesion_si_falta();
    return (int)($_SESSION['idUsuarioMaster'] ?? $_SESSION['usuario_id'] ?? 0);
}

function configuracion_usuarios_tenant_actual(): int
{
    if (function_exists('tenant_id_actual')) {
        return (int)tenant_id_actual();
    }

    iniciar_sesion_si_falta();
    return (int)($_SESSION['idTenant'] ?? 0);
}

function configuracion_usuarios_require_admin(): void
{
    $usuario = function_exists('usuario_actual') ? usuario_actual() : null;
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));

    if ($rol === '') {
        iniciar_sesion_si_falta();
        $rol = strtolower(trim((string)($_SESSION['rol'] ?? '')));
    }

    if ($rol !== 'admin') {
        json_response([
            'exito' => false,
            'mensaje' => 'No tenés permisos para administrar usuarios.',
        ], 403);
    }
}

function configuracion_usuarios_normalizar_usuario(string $usuario): string
{
    $usuario = trim($usuario);
    $usuario = preg_replace('/\s+/', ' ', $usuario) ?? $usuario;
    return $usuario;
}

function configuracion_usuarios_validar_rol(string $rol): string
{
    $rol = strtolower(trim($rol));
    return in_array($rol, ['admin', 'vista'], true) ? $rol : '';
}

function configuracion_usuarios_validar_email(string $email): string
{
    $email = trim($email);
    if ($email === '') {
        return '';
    }

    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        json_response([
            'exito' => false,
            'mensaje' => 'El email de recuperación no es válido.',
        ], 422);
    }

    return $email;
}

function configuracion_usuarios_formatear(array $fila): array
{
    $id = (int)($fila['idUsuarioMaster'] ?? 0);
    $rol = (string)($fila['rol'] ?? 'vista');

    return [
        'id_usuario' => $id,
        'idUsuarioMaster' => $id,
        'idTenant' => (int)($fila['idTenant'] ?? 0),
        'usuario' => (string)($fila['usuario'] ?? ''),
        'email_recuperacion' => $fila['email_recuperacion'] ?? null,
        'rol' => $rol,
        'rol_label' => $rol === 'admin' ? 'Administrador' : 'Vista',
        'tema' => (string)($fila['tema'] ?? 'claro'),
        'activo' => (int)($fila['activo'] ?? 0),
        'fecha_creacion' => (string)($fila['fecha_creacion'] ?? ''),
        'es_usuario_actual' => $id > 0 && $id === configuracion_usuarios_actual_id(),
    ];
}

function configuracion_usuarios_obtener_fila(PDO $pdo, int $idTenant, int $idUsuario): ?array
{
    $stmt = $pdo->prepare("\n        SELECT idUsuarioMaster, idTenant, usuario, email_recuperacion, rol, tema, activo, fecha_creacion\n        FROM usuarios_master\n        WHERE idTenant = :idTenant\n          AND idUsuarioMaster = :idUsuario\n        LIMIT 1\n    ");
    $stmt->execute([
        ':idTenant' => $idTenant,
        ':idUsuario' => $idUsuario,
    ]);

    $fila = $stmt->fetch(PDO::FETCH_ASSOC);
    return $fila ?: null;
}

function configuracion_usuarios_resumen(PDO $pdo, int $idTenant): array
{
    $stmt = $pdo->prepare("\n        SELECT\n            COUNT(*) AS total,\n            SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos,\n            SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS bajas,\n            SUM(CASE WHEN rol = 'admin' THEN 1 ELSE 0 END) AS admins,\n            SUM(CASE WHEN rol = 'vista' THEN 1 ELSE 0 END) AS vista\n        FROM usuarios_master\n        WHERE idTenant = :idTenant\n    ");
    $stmt->execute([':idTenant' => $idTenant]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    return [
        'total' => (int)($row['total'] ?? 0),
        'activos' => (int)($row['activos'] ?? 0),
        'bajas' => (int)($row['bajas'] ?? 0),
        'admins' => (int)($row['admins'] ?? 0),
        'vista' => (int)($row['vista'] ?? 0),
    ];
}

function configuracion_usuarios_assert_no_deja_sin_admin(PDO $pdo, int $idTenant, int $idUsuarioExcluir = 0): void
{
    $sql = "\n        SELECT COUNT(*)\n        FROM usuarios_master\n        WHERE idTenant = :idTenant\n          AND activo = 1\n          AND rol = 'admin'\n    ";
    $params = [':idTenant' => $idTenant];

    if ($idUsuarioExcluir > 0) {
        $sql .= " AND idUsuarioMaster <> :idUsuarioExcluir";
        $params[':idUsuarioExcluir'] = $idUsuarioExcluir;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if ((int)$stmt->fetchColumn() <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'No podés dejar al sistema sin un administrador activo.',
        ], 422);
    }
}

function configuracion_usuarios_invalidar_sesiones(PDO $pdo, int $idUsuario): void
{
    $stmt = $pdo->prepare("UPDATE sesiones SET activo = 0 WHERE idUsuarioMaster = :idUsuario");
    $stmt->execute([':idUsuario' => $idUsuario]);
}

function configuracion_usuarios_listar(): void
{
    configuracion_usuarios_require_admin();

    try {
        $pdo = master_db();
        $idTenant = configuracion_usuarios_tenant_actual();

        if ($idTenant <= 0) {
            json_response(['exito' => false, 'mensaje' => 'No se pudo resolver el tenant actual.'], 401);
        }

        $activoParam = $_GET['activo'] ?? 'todos';
        $buscar = trim((string)($_GET['buscar'] ?? $_GET['busqueda'] ?? ''));

        $where = ['idTenant = :idTenant'];
        $params = [':idTenant' => $idTenant];

        if ((string)$activoParam === '1' || (string)$activoParam === '0') {
            $where[] = 'activo = :activo';
            $params[':activo'] = (int)$activoParam;
        }

        if ($buscar !== '') {
            $where[] = '(usuario LIKE :buscar OR email_recuperacion LIKE :buscar OR rol LIKE :buscar)';
            $params[':buscar'] = '%' . $buscar . '%';
        }

        $sql = "\n            SELECT idUsuarioMaster, idTenant, usuario, email_recuperacion, rol, tema, activo, fecha_creacion\n            FROM usuarios_master\n            WHERE " . implode(' AND ', $where) . "\n            ORDER BY activo DESC, rol ASC, usuario ASC\n        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $usuarios = array_map('configuracion_usuarios_formatear', $stmt->fetchAll(PDO::FETCH_ASSOC));

        json_response([
            'exito' => true,
            'data' => $usuarios,
            'resumen' => configuracion_usuarios_resumen($pdo, $idTenant),
        ]);
    } catch (Throwable $e) {
        log_error($e, 'configuracion_usuarios_listar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al listar usuarios.'], 500);
    }
}

function configuracion_usuarios_obtener(): void
{
    configuracion_usuarios_require_admin();

    try {
        $pdo = master_db();
        $idTenant = configuracion_usuarios_tenant_actual();
        $idUsuario = configuracion_usuarios_int($_GET['id_usuario'] ?? $_GET['idUsuarioMaster'] ?? 0);

        if ($idTenant <= 0) {
            json_response(['exito' => false, 'mensaje' => 'No se pudo resolver el tenant actual.'], 401);
        }

        if ($idUsuario <= 0) {
            json_response(['exito' => false, 'mensaje' => 'Falta el usuario a obtener.'], 422);
        }

        $fila = configuracion_usuarios_obtener_fila($pdo, $idTenant, $idUsuario);
        if (!$fila) {
            json_response(['exito' => false, 'mensaje' => 'Usuario no encontrado.'], 404);
        }

        json_response([
            'exito' => true,
            'data' => configuracion_usuarios_formatear($fila),
        ]);
    } catch (Throwable $e) {
        log_error($e, 'configuracion_usuarios_obtener');
        json_response(['exito' => false, 'mensaje' => 'Error interno al obtener usuario.'], 500);
    }
}

function configuracion_usuarios_guardar(): void
{
    configuracion_usuarios_require_admin();

    $pdo = null;

    try {
        $pdo = master_db();
        $idTenant = configuracion_usuarios_tenant_actual();
        $idActual = configuracion_usuarios_actual_id();
        $body = configuracion_usuarios_body();

        if ($idTenant <= 0) {
            json_response(['exito' => false, 'mensaje' => 'No se pudo resolver el tenant actual.'], 401);
        }

        $idUsuario = configuracion_usuarios_int($body['id_usuario'] ?? $body['idUsuarioMaster'] ?? $body['id'] ?? 0);
        $usuario = configuracion_usuarios_normalizar_usuario((string)($body['usuario'] ?? $body['nombre'] ?? ''));
        $email = configuracion_usuarios_validar_email((string)($body['email_recuperacion'] ?? $body['email'] ?? ''));
        $rol = configuracion_usuarios_validar_rol((string)($body['rol'] ?? 'vista'));
        $activo = isset($body['activo']) ? ((int)$body['activo'] === 1 ? 1 : 0) : 1;
        $contrasena = (string)($body['contrasena'] ?? $body['password'] ?? $body['clave'] ?? '');

        if ($usuario === '') {
            json_response(['exito' => false, 'mensaje' => 'Ingresá el nombre de usuario.'], 422);
        }

        if (mb_strlen($usuario, 'UTF-8') < 3 || mb_strlen($usuario, 'UTF-8') > 100) {
            json_response(['exito' => false, 'mensaje' => 'El usuario debe tener entre 3 y 100 caracteres.'], 422);
        }

        if (preg_match('/^[\p{L}\p{N}._@ -]+$/u', $usuario) !== 1) {
            json_response(['exito' => false, 'mensaje' => 'El usuario contiene caracteres no permitidos.'], 422);
        }

        if ($rol === '') {
            json_response(['exito' => false, 'mensaje' => 'Seleccioná un rol válido.'], 422);
        }

        if ($idUsuario <= 0 && trim($contrasena) === '') {
            json_response(['exito' => false, 'mensaje' => 'Ingresá una contraseña para el usuario nuevo.'], 422);
        }

        if (trim($contrasena) !== '' && mb_strlen($contrasena, 'UTF-8') < 6) {
            json_response(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 6 caracteres.'], 422);
        }

        $pdo->beginTransaction();

        $existeDuplicado = $pdo->prepare("\n            SELECT idUsuarioMaster\n            FROM usuarios_master\n            WHERE idTenant = :idTenant\n              AND usuario = :usuario\n              AND idUsuarioMaster <> :idUsuario\n            LIMIT 1\n        ");
        $existeDuplicado->execute([
            ':idTenant' => $idTenant,
            ':usuario' => $usuario,
            ':idUsuario' => $idUsuario,
        ]);

        if ($existeDuplicado->fetchColumn()) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'Ya existe un usuario con ese nombre.'], 409);
        }

        if ($idUsuario > 0) {
            $filaActual = configuracion_usuarios_obtener_fila($pdo, $idTenant, $idUsuario);
            if (!$filaActual) {
                $pdo->rollBack();
                json_response(['exito' => false, 'mensaje' => 'Usuario no encontrado.'], 404);
            }

            if ($idUsuario === $idActual && ($activo !== 1 || $rol !== 'admin')) {
                $pdo->rollBack();
                json_response(['exito' => false, 'mensaje' => 'No podés quitarte tu propio acceso administrador.'], 422);
            }

            $requiereVerificarAdmins =
                ((string)$filaActual['rol'] === 'admin' && $rol !== 'admin') ||
                ((int)$filaActual['activo'] === 1 && $activo !== 1);

            if ($requiereVerificarAdmins) {
                configuracion_usuarios_assert_no_deja_sin_admin($pdo, $idTenant, $idUsuario);
            }

            $params = [
                ':usuario' => $usuario,
                ':email' => $email !== '' ? $email : null,
                ':rol' => $rol,
                ':activo' => $activo,
                ':idTenant' => $idTenant,
                ':idUsuario' => $idUsuario,
            ];

            $setPassword = '';
            if (trim($contrasena) !== '') {
                $setPassword = ', hash_contrasena = :hash';
                $params[':hash'] = password_hash($contrasena, PASSWORD_DEFAULT);
            }

            $stmt = $pdo->prepare("\n                UPDATE usuarios_master\n                   SET usuario = :usuario,\n                       email_recuperacion = :email,\n                       rol = :rol,\n                       activo = :activo\n                       {$setPassword}\n                 WHERE idTenant = :idTenant\n                   AND idUsuarioMaster = :idUsuario\n                 LIMIT 1\n            ");
            $stmt->execute($params);

            if ($activo === 0) {
                configuracion_usuarios_invalidar_sesiones($pdo, $idUsuario);
            }
        } else {
            $stmt = $pdo->prepare("\n                INSERT INTO usuarios_master (idTenant, usuario, email_recuperacion, hash_contrasena, rol, tema, activo, fecha_creacion)\n                VALUES (:idTenant, :usuario, :email, :hash, :rol, 'claro', :activo, NOW())\n            ");
            $stmt->execute([
                ':idTenant' => $idTenant,
                ':usuario' => $usuario,
                ':email' => $email !== '' ? $email : null,
                ':hash' => password_hash($contrasena, PASSWORD_DEFAULT),
                ':rol' => $rol,
                ':activo' => $activo,
            ]);

            $idUsuario = (int)$pdo->lastInsertId();
        }

        $fila = configuracion_usuarios_obtener_fila($pdo, $idTenant, $idUsuario);
        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Usuario guardado correctamente.',
            'data' => $fila ? configuracion_usuarios_formatear($fila) : null,
        ]);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'configuracion_usuarios_guardar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al guardar usuario.'], 500);
    }
}

function configuracion_usuarios_cambiar_estado(): void
{
    configuracion_usuarios_require_admin();

    $pdo = null;

    try {
        $pdo = master_db();
        $idTenant = configuracion_usuarios_tenant_actual();
        $idActual = configuracion_usuarios_actual_id();
        $body = configuracion_usuarios_body();
        $idUsuario = configuracion_usuarios_int($body['id_usuario'] ?? $body['idUsuarioMaster'] ?? $body['id'] ?? 0);

        $action = strtolower(trim((string)($_GET['action'] ?? $body['action'] ?? '')));
        if ($action === 'configuracion_usuarios_alta') {
            $activo = 1;
        } elseif ($action === 'configuracion_usuarios_baja') {
            $activo = 0;
        } else {
            $activo = (int)($body['activo'] ?? 1) === 1 ? 1 : 0;
        }

        if ($idTenant <= 0) {
            json_response(['exito' => false, 'mensaje' => 'No se pudo resolver el tenant actual.'], 401);
        }

        if ($idUsuario <= 0) {
            json_response(['exito' => false, 'mensaje' => 'Falta el usuario a modificar.'], 422);
        }

        if ($idUsuario === $idActual && $activo === 0) {
            json_response(['exito' => false, 'mensaje' => 'No podés darte de baja a vos mismo.'], 422);
        }

        $pdo->beginTransaction();

        $fila = configuracion_usuarios_obtener_fila($pdo, $idTenant, $idUsuario);
        if (!$fila) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'Usuario no encontrado.'], 404);
        }

        if ($activo === 0 && (string)$fila['rol'] === 'admin' && (int)$fila['activo'] === 1) {
            configuracion_usuarios_assert_no_deja_sin_admin($pdo, $idTenant, $idUsuario);
        }

        $stmt = $pdo->prepare("\n            UPDATE usuarios_master\n               SET activo = :activo\n             WHERE idTenant = :idTenant\n               AND idUsuarioMaster = :idUsuario\n             LIMIT 1\n        ");
        $stmt->execute([
            ':activo' => $activo,
            ':idTenant' => $idTenant,
            ':idUsuario' => $idUsuario,
        ]);

        if ($activo === 0) {
            configuracion_usuarios_invalidar_sesiones($pdo, $idUsuario);
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => $activo === 1 ? 'Usuario dado de alta correctamente.' : 'Usuario dado de baja correctamente.',
        ]);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'configuracion_usuarios_cambiar_estado');
        json_response(['exito' => false, 'mensaje' => 'Error interno al cambiar el estado del usuario.'], 500);
    }
}

function configuracion_usuarios_eliminar(): void
{
    configuracion_usuarios_require_admin();

    $pdo = null;

    try {
        $pdo = master_db();
        $idTenant = configuracion_usuarios_tenant_actual();
        $idActual = configuracion_usuarios_actual_id();
        $body = configuracion_usuarios_body();
        $idUsuario = configuracion_usuarios_int($body['id_usuario'] ?? $body['idUsuarioMaster'] ?? $body['id'] ?? 0);

        if ($idTenant <= 0) {
            json_response(['exito' => false, 'mensaje' => 'No se pudo resolver el tenant actual.'], 401);
        }

        if ($idUsuario <= 0) {
            json_response(['exito' => false, 'mensaje' => 'Falta el usuario a eliminar.'], 422);
        }

        if ($idUsuario === $idActual) {
            json_response(['exito' => false, 'mensaje' => 'No podés eliminar tu propio usuario.'], 422);
        }

        $pdo->beginTransaction();

        $fila = configuracion_usuarios_obtener_fila($pdo, $idTenant, $idUsuario);
        if (!$fila) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'Usuario no encontrado.'], 404);
        }

        if ((string)$fila['rol'] === 'admin' && (int)$fila['activo'] === 1) {
            configuracion_usuarios_assert_no_deja_sin_admin($pdo, $idTenant, $idUsuario);
        }

        $stmt = $pdo->prepare("DELETE FROM sesiones WHERE idUsuarioMaster = :idUsuario");
        $stmt->execute([':idUsuario' => $idUsuario]);

        $stmt = $pdo->prepare("\n            DELETE FROM usuarios_master\n            WHERE idTenant = :idTenant\n              AND idUsuarioMaster = :idUsuario\n            LIMIT 1\n        ");
        $stmt->execute([
            ':idTenant' => $idTenant,
            ':idUsuario' => $idUsuario,
        ]);

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Usuario eliminado correctamente.',
        ]);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'configuracion_usuarios_eliminar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al eliminar usuario.'], 500);
    }
}
