<?php
// backend/modules/login/recuperar_contrasena.php
// Recuperación de contraseña SaaS contra mesas_master.
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function login_password_reset_minutos(): int
{
    return max(5, min(240, (int)(env_value('PASSWORD_RESET_MINUTES', '30') ?? '30')));
}

function login_password_reset_asegurar_tabla(PDO $master): void
{
    $master->exec("\n        CREATE TABLE IF NOT EXISTS password_resets (\n            idReset INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            idUsuarioMaster INT UNSIGNED NOT NULL,\n            token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,\n            expiracion DATETIME NOT NULL,\n            usado TINYINT(1) NOT NULL DEFAULT 0,\n            creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            usado_en DATETIME NULL DEFAULT NULL,\n            ip_solicitud VARCHAR(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,\n            user_agent VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,\n            PRIMARY KEY (idReset),\n            KEY idx_password_resets_usuario (idUsuarioMaster),\n            KEY idx_password_resets_token (token_hash),\n            KEY idx_password_resets_expiracion (expiracion),\n            CONSTRAINT fk_password_resets_usuario\n                FOREIGN KEY (idUsuarioMaster)\n                REFERENCES usuarios_master (idUsuarioMaster)\n                ON DELETE CASCADE\n                ON UPDATE CASCADE\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");
}

function login_password_reset_ip(): string
{
    $ip = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }
    return substr($ip, 0, 45);
}

function login_password_reset_base_url(): string
{
    $frontend = trim((string)(env_value('FRONTEND_URL', '') ?? ''));

    if ($frontend === '') {
        $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($origin !== '') {
            $frontend = $origin;
        }
    }

    if ($frontend === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme = $https ? 'https' : 'http';
        $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
        $frontend = $scheme . '://' . $host;
    }

    return rtrim($frontend, '/');
}

function login_password_reset_link(string $token): string
{
    $path = trim((string)(env_value('PASSWORD_RESET_PATH', '/restablecer-contrasena') ?? '/restablecer-contrasena'));
    if ($path === '') {
        $path = '/restablecer-contrasena';
    }
    if ($path[0] !== '/') {
        $path = '/' . $path;
    }

    return login_password_reset_base_url() . $path . '?token=' . rawurlencode($token);
}

function login_password_reset_mask_email(string $email): string
{
    $email = trim($email);
    $parts = explode('@', $email, 2);
    if (count($parts) !== 2) return $email;

    [$name, $domain] = $parts;
    $nameLen = mb_strlen($name, 'UTF-8');
    if ($nameLen <= 2) {
        $maskedName = mb_substr($name, 0, 1, 'UTF-8') . '***';
    } else {
        $maskedName = mb_substr($name, 0, 2, 'UTF-8') . str_repeat('*', max(3, $nameLen - 2));
    }

    return $maskedName . '@' . $domain;
}

function login_password_reset_header_from(string $name, string $email): string
{
    $name = trim($name) !== '' ? trim($name) : 'Soporte';
    $email = trim($email) !== '' ? trim($email) : 'no-reply@localhost';

    $encodedName = '=?UTF-8?B?' . base64_encode($name) . '?=';
    return $encodedName . ' <' . $email . '>';
}

function login_password_reset_enviar_email(string $destino, string $usuario, string $link): bool
{
    $appName = trim((string)(env_value('APP_NAME', 'Lerna') ?? 'Lerna'));
    $fromEmail = trim((string)(env_value('MAIL_FROM_EMAIL', '') ?? ''));
    $fromName = trim((string)(env_value('MAIL_FROM_NAME', '') ?? ''));

    if ($fromName === '') {
        $fromName = 'Soporte ' . $appName;
    }

    if ($fromEmail === '') {
        $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
        $host = preg_replace('/:\d+$/', '', $host) ?: 'localhost';
        $fromEmail = 'no-reply@' . $host;
    }

    $minutos = login_password_reset_minutos();
    $subject = 'Recuperar contraseña - ' . $appName;

    $usuarioHtml = htmlspecialchars($usuario, ENT_QUOTES, 'UTF-8');
    $appHtml = htmlspecialchars($appName, ENT_QUOTES, 'UTF-8');
    $linkHtml = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');

    $html = <<<HTML
<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="padding:32px 16px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dfe5ef;border-radius:14px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.08);">
      <div style="padding:26px 28px;border-bottom:1px solid #e5e7eb;">
        <h1 style="margin:0;font-size:24px;color:#111827;">{$appHtml}</h1>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 18px;font-size:22px;color:#111827;">Restablecer contraseña</h2>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hola {$usuarioHtml}, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">Hacé clic en el siguiente botón para continuar:</p>
        <p style="margin:0 0 26px;">
          <a href="{$linkHtml}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:15px 24px;">Restablecer contraseña</a>
        </p>
        <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#475569;">Este enlace expira en {$minutos} minutos.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Si no solicitaste este cambio, podés ignorar este correo.</p>
      </div>
    </div>
  </div>
</body>
</html>
HTML;

    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/html; charset=UTF-8';
    $headers[] = 'From: ' . login_password_reset_header_from($fromName, $fromEmail);
    $headers[] = 'Reply-To: ' . login_password_reset_header_from($fromName, $fromEmail);
    $headers[] = 'X-Mailer: PHP/' . PHP_VERSION;

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    return @mail($destino, $encodedSubject, $html, implode("\r\n", $headers));
}

function login_password_reset_buscar_usuario(PDO $master, string $usuarioOEmail): ?array
{
    $stmt = $master->prepare("\n        SELECT\n            u.idUsuarioMaster,\n            u.idTenant,\n            u.usuario,\n            u.email_recuperacion,\n            u.activo AS usuario_activo,\n            t.activo AS tenant_activo\n        FROM usuarios_master u\n        INNER JOIN tenants t ON t.idTenant = u.idTenant\n        WHERE (LOWER(u.usuario) = LOWER(:valor) OR LOWER(COALESCE(u.email_recuperacion, '')) = LOWER(:valor2))\n        LIMIT 1\n    ");
    $stmt->execute([
        ':valor' => $usuarioOEmail,
        ':valor2' => $usuarioOEmail,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function login_password_reset_buscar_token(PDO $master, string $token): ?array
{
    if ($token === '' || strlen($token) < 32 || strlen($token) > 200) {
        return null;
    }

    $hash = hash('sha256', $token);

    $stmt = $master->prepare("\n        SELECT\n            pr.idReset,\n            pr.idUsuarioMaster,\n            pr.expiracion,\n            pr.usado,\n            u.usuario,\n            u.email_recuperacion,\n            u.activo AS usuario_activo,\n            t.activo AS tenant_activo\n        FROM password_resets pr\n        INNER JOIN usuarios_master u ON u.idUsuarioMaster = pr.idUsuarioMaster\n        INNER JOIN tenants t ON t.idTenant = u.idTenant\n        WHERE pr.token_hash = :token_hash\n        LIMIT 1\n    ");
    $stmt->execute([':token_hash' => $hash]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) return null;
    if ((int)$row['usado'] === 1) return null;
    if ((int)$row['usuario_activo'] !== 1 || (int)$row['tenant_activo'] !== 1) return null;

    $expiracion = strtotime((string)$row['expiracion']);
    if ($expiracion === false || $expiracion < time()) {
        return null;
    }

    return $row;
}

function login_recuperar_contrasena_solicitar(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $data = request_body();
    $usuarioOEmail = trim((string)($data['usuario'] ?? $data['nombre'] ?? $data['email'] ?? ''));

    if ($usuarioOEmail === '') {
        json_response(['exito' => false, 'mensaje' => 'Ingresá tu usuario o email de recuperación.'], 200);
    }

    try {
        $master = master_db();
        login_password_reset_asegurar_tabla($master);

        $usuario = login_password_reset_buscar_usuario($master, $usuarioOEmail);

        if (!$usuario || (int)$usuario['usuario_activo'] !== 1 || (int)$usuario['tenant_activo'] !== 1) {
            json_response(['exito' => false, 'mensaje' => 'No encontramos un usuario activo con esos datos.'], 200);
        }

        $email = trim((string)($usuario['email_recuperacion'] ?? ''));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['exito' => false, 'mensaje' => 'Ese usuario no tiene un email de recuperación válido cargado.'], 200);
        }

        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $minutos = login_password_reset_minutos();

        $master->beginTransaction();

        $stmt = $master->prepare("\n            UPDATE password_resets\n            SET usado = 1, usado_en = NOW()\n            WHERE idUsuarioMaster = :idUsuarioMaster\n              AND usado = 0\n        ");
        $stmt->execute([':idUsuarioMaster' => (int)$usuario['idUsuarioMaster']]);

        $stmt = $master->prepare("\n            INSERT INTO password_resets (\n                idUsuarioMaster,\n                token_hash,\n                expiracion,\n                usado,\n                creado_en,\n                ip_solicitud,\n                user_agent\n            ) VALUES (\n                :idUsuarioMaster,\n                :token_hash,\n                DATE_ADD(NOW(), INTERVAL {$minutos} MINUTE),\n                0,\n                NOW(),\n                :ip_solicitud,\n                :user_agent\n            )\n        ");
        $stmt->execute([
            ':idUsuarioMaster' => (int)$usuario['idUsuarioMaster'],
            ':token_hash' => $tokenHash,
            ':ip_solicitud' => login_password_reset_ip(),
            ':user_agent' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ]);

        $master->commit();

        $link = login_password_reset_link($token);
        $enviado = login_password_reset_enviar_email($email, (string)$usuario['usuario'], $link);

        if (env_bool('PASSWORD_RESET_LOG_LINK', false)) {
            error_log(date('Y-m-d H:i:s') . ' [password_reset_link] usuario=' . $usuario['usuario'] . ' email=' . $email . ' link=' . $link . PHP_EOL, 3, __DIR__ . '/../../logs/app.log');
        }

        if (!$enviado) {
            log_error(new RuntimeException('No se pudo enviar el email de recuperación con mail().'), 'recuperar_contrasena_solicitar');
            json_response(['exito' => false, 'mensaje' => 'Se generó el enlace, pero no se pudo enviar el email. Revisá la configuración de correo del servidor.'], 500);
        }

        json_response([
            'exito' => true,
            'mensaje' => 'Te enviamos un enlace para restablecer la contraseña al email registrado.',
            'email' => login_password_reset_mask_email($email),
        ]);
    } catch (Throwable $e) {
        if (isset($master) && $master instanceof PDO && $master->inTransaction()) {
            $master->rollBack();
        }
        log_error($e, 'recuperar_contrasena_solicitar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al solicitar la recuperación.'], 500);
    }
}

function login_recuperar_contrasena_validar(): void
{
    $data = request_body();
    $token = trim((string)($_GET['token'] ?? $data['token'] ?? ''));

    try {
        $master = master_db();
        login_password_reset_asegurar_tabla($master);

        $row = login_password_reset_buscar_token($master, $token);
        if (!$row) {
            json_response(['exito' => false, 'mensaje' => 'El enlace es inválido, ya fue usado o está vencido.'], 200);
        }

        json_response([
            'exito' => true,
            'mensaje' => 'Token válido.',
            'usuario' => (string)$row['usuario'],
            'email' => login_password_reset_mask_email((string)($row['email_recuperacion'] ?? '')),
        ]);
    } catch (Throwable $e) {
        log_error($e, 'recuperar_contrasena_validar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al validar el enlace.'], 500);
    }
}

function login_recuperar_contrasena_guardar(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $data = request_body();
    $token = trim((string)($data['token'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');
    $confirmar = (string)($data['confirmarContrasena'] ?? $data['confirmar_contrasena'] ?? $data['confirmar'] ?? '');

    if ($token === '') {
        json_response(['exito' => false, 'mensaje' => 'Falta el token de recuperación.'], 200);
    }

    if (strlen($contrasena) < 6) {
        json_response(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 6 caracteres.'], 200);
    }

    if ($confirmar !== '' && $contrasena !== $confirmar) {
        json_response(['exito' => false, 'mensaje' => 'Las contraseñas no coinciden.'], 200);
    }

    try {
        $master = master_db();
        login_password_reset_asegurar_tabla($master);

        $row = login_password_reset_buscar_token($master, $token);
        if (!$row) {
            json_response(['exito' => false, 'mensaje' => 'El enlace es inválido, ya fue usado o está vencido.'], 200);
        }

        $hash = password_hash($contrasena, PASSWORD_BCRYPT);

        $master->beginTransaction();

        $stmt = $master->prepare("\n            UPDATE usuarios_master\n            SET hash_contrasena = :hash_contrasena\n            WHERE idUsuarioMaster = :idUsuarioMaster\n            LIMIT 1\n        ");
        $stmt->execute([
            ':hash_contrasena' => $hash,
            ':idUsuarioMaster' => (int)$row['idUsuarioMaster'],
        ]);

        $stmt = $master->prepare("\n            UPDATE password_resets\n            SET usado = 1, usado_en = NOW()\n            WHERE idReset = :idReset\n            LIMIT 1\n        ");
        $stmt->execute([':idReset' => (int)$row['idReset']]);

        $stmt = $master->prepare("\n            UPDATE sesiones\n            SET activo = 0\n            WHERE idUsuarioMaster = :idUsuarioMaster\n        ");
        $stmt->execute([':idUsuarioMaster' => (int)$row['idUsuarioMaster']]);

        $master->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Contraseña actualizada correctamente. Ya podés iniciar sesión.',
        ]);
    } catch (Throwable $e) {
        if (isset($master) && $master instanceof PDO && $master->inTransaction()) {
            $master->rollBack();
        }
        log_error($e, 'recuperar_contrasena_guardar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al guardar la nueva contraseña.'], 500);
    }
}
