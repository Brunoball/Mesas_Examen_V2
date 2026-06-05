<?php
// backend/core/mailer_hostinger.php
// Envío de emails por SMTP + guardado opcional en carpeta Enviados por IMAP.
declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';

function app_mail_env(string $key, ?string $default = null): string
{
    if (function_exists('env_value')) {
        return (string)(env_value($key, $default) ?? $default ?? '');
    }

    $value = $_ENV[$key] ?? getenv($key);
    return $value === false || $value === null ? (string)($default ?? '') : (string)$value;
}

function app_mail_bool(string $key, bool $default = false): bool
{
    if (function_exists('env_bool')) {
        return env_bool($key, $default);
    }

    $value = strtolower(trim(app_mail_env($key, $default ? 'true' : 'false')));
    return in_array($value, ['1', 'true', 'yes', 'on', 'si', 'sí'], true);
}

function app_mail_log(string $mensaje, string $contexto = 'mailer'): void
{
    $logDir = __DIR__ . '/../logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }

    @error_log(date('Y-m-d H:i:s') . " [{$contexto}] " . $mensaje . PHP_EOL, 3, $logDir . '/app.log');
}

function app_mail_limpia_header(string $valor): string
{
    return trim(str_replace(["\r", "\n"], ' ', $valor));
}

function app_mail_email_valido_o(string $email, string $fallback = ''): string
{
    $email = trim($email);
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return $email;
    }

    $fallback = trim($fallback);
    return ($fallback !== '' && filter_var($fallback, FILTER_VALIDATE_EMAIL)) ? $fallback : '';
}

function app_mail_header_from(string $name, string $email): string
{
    $name = app_mail_limpia_header($name !== '' ? $name : 'Lerna');
    $email = app_mail_limpia_header($email !== '' ? $email : 'no-reply@localhost');
    return '=?UTF-8?B?' . base64_encode($name) . '?= <' . $email . '>';
}

function app_mail_subject(string $subject): string
{
    return '=?UTF-8?B?' . base64_encode(app_mail_limpia_header($subject)) . '?=';
}

function app_mail_message_id(string $fromEmail): string
{
    $domain = 'localhost';
    $parts = explode('@', $fromEmail, 2);
    if (count($parts) === 2 && trim($parts[1]) !== '') {
        $domain = preg_replace('/[^a-zA-Z0-9.\-]/', '', $parts[1]) ?: 'localhost';
    }

    return sprintf('<%s.%s@%s>', bin2hex(random_bytes(12)), time(), $domain);
}

function app_mail_normalizar_crlf(string $texto): string
{
    $texto = str_replace(["\r\n", "\r"], "\n", $texto);
    return str_replace("\n", "\r\n", $texto);
}

function app_mail_armar_mensaje_html(
    string $destino,
    string $subject,
    string $html,
    string $fromEmail,
    string $fromName,
    string $replyToEmail = '',
    string $replyToName = ''
): array {
    $destino = app_mail_limpia_header($destino);
    $subjectEncoded = app_mail_subject($subject);
    $fromHeader = app_mail_header_from($fromName, $fromEmail);
    $replyToEmail = app_mail_email_valido_o($replyToEmail, $fromEmail);
    $replyToName = trim($replyToName) !== '' ? $replyToName : $fromName;
    $replyToHeader = app_mail_header_from($replyToName, $replyToEmail);
    $messageId = app_mail_message_id($fromEmail);

    $headers = [
        'Date: ' . date('r'),
        'Message-ID: ' . $messageId,
        'From: ' . $fromHeader,
        'Reply-To: ' . $replyToHeader,
        'To: ' . $destino,
        'Subject: ' . $subjectEncoded,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'X-Mailer: PHP/' . PHP_VERSION,
    ];

    $raw = implode("\r\n", $headers) . "\r\n\r\n" . app_mail_normalizar_crlf($html);

    $headersParaMail = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . $fromHeader,
        'Reply-To: ' . $replyToHeader,
        'Message-ID: ' . $messageId,
        'X-Mailer: PHP/' . PHP_VERSION,
    ];

    return [
        'raw' => $raw,
        'subject_encoded' => $subjectEncoded,
        'headers_php_mail' => implode("\r\n", $headersParaMail),
    ];
}

function app_mail_smtp_leer_respuesta($socket): string
{
    $respuesta = '';
    while (!feof($socket)) {
        $linea = fgets($socket, 515);
        if ($linea === false) {
            break;
        }
        $respuesta .= $linea;
        if (strlen($linea) >= 4 && $linea[3] === ' ') {
            break;
        }
    }
    return $respuesta;
}

function app_mail_smtp_codigo(string $respuesta): int
{
    return (int)substr(trim($respuesta), 0, 3);
}

function app_mail_smtp_comando($socket, string $comando, array $codigosOk): string
{
    fwrite($socket, $comando . "\r\n");
    $respuesta = app_mail_smtp_leer_respuesta($socket);
    $codigo = app_mail_smtp_codigo($respuesta);
    if (!in_array($codigo, $codigosOk, true)) {
        throw new RuntimeException('SMTP respondió ' . trim($respuesta));
    }
    return $respuesta;
}

function app_mail_smtp_escape_data(string $raw): string
{
    $raw = app_mail_normalizar_crlf($raw);
    $lineas = explode("\r\n", $raw);
    foreach ($lineas as &$linea) {
        if (isset($linea[0]) && $linea[0] === '.') {
            $linea = '.' . $linea;
        }
    }
    unset($linea);
    return implode("\r\n", $lineas);
}

function app_mail_enviar_smtp(string $fromEmail, string $destino, string $raw): array
{
    $host = trim(app_mail_env('SMTP_HOST', app_mail_env('MAIL_HOST', '')));
    $port = (int)app_mail_env('SMTP_PORT', app_mail_env('MAIL_PORT', '465'));
    $encryption = strtolower(trim(app_mail_env('SMTP_ENCRYPTION', app_mail_env('MAIL_ENCRYPTION', 'ssl'))));
    $user = trim(app_mail_env('SMTP_USER', app_mail_env('MAIL_USERNAME', app_mail_env('MAIL_FROM_EMAIL', $fromEmail))));
    $pass = (string)app_mail_env('SMTP_PASS', app_mail_env('MAIL_PASSWORD', ''));

    if ($host === '') {
        return ['ok' => false, 'error' => 'SMTP_HOST no está configurado.'];
    }
    if ($port <= 0) {
        $port = $encryption === 'tls' || $encryption === 'starttls' ? 587 : 465;
    }

    $transportHost = ($encryption === 'ssl' || $encryption === 'smtps') ? 'ssl://' . $host : $host;
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($transportHost . ':' . $port, $errno, $errstr, 25, STREAM_CLIENT_CONNECT);

    if (!$socket) {
        return ['ok' => false, 'error' => 'No se pudo conectar al SMTP: ' . ($errstr ?: ('error ' . $errno))];
    }

    stream_set_timeout($socket, 25);

    try {
        $bienvenida = app_mail_smtp_leer_respuesta($socket);
        if (app_mail_smtp_codigo($bienvenida) !== 220) {
            throw new RuntimeException('SMTP respondió ' . trim($bienvenida));
        }

        $serverName = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
        app_mail_smtp_comando($socket, 'EHLO ' . $serverName, [250]);

        if ($encryption === 'tls' || $encryption === 'starttls') {
            app_mail_smtp_comando($socket, 'STARTTLS', [220]);
            if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('No se pudo iniciar STARTTLS con el servidor SMTP.');
            }
            app_mail_smtp_comando($socket, 'EHLO ' . $serverName, [250]);
        }

        if ($user !== '') {
            app_mail_smtp_comando($socket, 'AUTH LOGIN', [334]);
            app_mail_smtp_comando($socket, base64_encode($user), [334]);
            app_mail_smtp_comando($socket, base64_encode($pass), [235]);
        }

        $envelopeFrom = app_mail_email_valido_o($user, $fromEmail);
        app_mail_smtp_comando($socket, 'MAIL FROM:<' . $envelopeFrom . '>', [250]);
        app_mail_smtp_comando($socket, 'RCPT TO:<' . $destino . '>', [250, 251]);
        app_mail_smtp_comando($socket, 'DATA', [354]);
        fwrite($socket, app_mail_smtp_escape_data($raw) . "\r\n.\r\n");
        $dataRespuesta = app_mail_smtp_leer_respuesta($socket);
        if (!in_array(app_mail_smtp_codigo($dataRespuesta), [250], true)) {
            throw new RuntimeException('SMTP respondió ' . trim($dataRespuesta));
        }

        @app_mail_smtp_comando($socket, 'QUIT', [221, 250]);
        fclose($socket);
        return ['ok' => true, 'error' => null];
    } catch (Throwable $e) {
        @fwrite($socket, "QUIT\r\n");
        @fclose($socket);
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function app_mail_enviar_php_mail(string $destino, string $subjectEncoded, string $html, string $headers, string $fromEmail): array
{
    $params = '';
    if (filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        $params = '-f' . $fromEmail;
    }

    $ok = $params !== ''
        ? @mail($destino, $subjectEncoded, $html, $headers, $params)
        : @mail($destino, $subjectEncoded, $html, $headers);

    return [
        'ok' => (bool)$ok,
        'error' => $ok ? null : 'No se pudo enviar el email con mail().',
    ];
}

function app_mail_imap_base(): string
{
    $host = trim(app_mail_env('MAIL_IMAP_HOST', app_mail_env('IMAP_HOST', '')));
    if ($host === '') {
        $smtpHost = trim(app_mail_env('SMTP_HOST', app_mail_env('MAIL_HOST', '')));
        $host = stripos($smtpHost, 'hostinger') !== false ? 'imap.hostinger.com' : $smtpHost;
    }
    if ($host === '') {
        return '';
    }

    $port = (int)app_mail_env('MAIL_IMAP_PORT', app_mail_env('IMAP_PORT', '993'));
    if ($port <= 0) $port = 993;

    $flags = trim(app_mail_env('MAIL_IMAP_FLAGS', app_mail_env('IMAP_FLAGS', '/imap/ssl')));
    if ($flags === '') $flags = '/imap/ssl';
    if ($flags[0] !== '/') $flags = '/' . $flags;

    return '{' . $host . ':' . $port . $flags . '}';
}

function app_mail_guardar_enviados(string $raw, string $fromEmail): array
{
    // Activado por defecto porque el objetivo del sistema es poder auditar desde webmail.
    if (!app_mail_bool('MAIL_SAVE_SENT', true)) {
        return ['ok' => true, 'omitido' => true, 'error' => null];
    }

    if (!function_exists('imap_open') || !function_exists('imap_append')) {
        app_mail_log('No se pudo guardar en Enviados: la extensión IMAP de PHP no está habilitada.', 'mailer_sent');
        return ['ok' => false, 'omitido' => false, 'error' => 'La extensión IMAP de PHP no está habilitada.'];
    }

    $base = app_mail_imap_base();
    if ($base === '') {
        return ['ok' => false, 'omitido' => false, 'error' => 'MAIL_IMAP_HOST/IMAP_HOST no está configurado.'];
    }

    $user = trim(app_mail_env('MAIL_IMAP_USER', app_mail_env('IMAP_USER', app_mail_env('SMTP_USER', app_mail_env('MAIL_USERNAME', $fromEmail)))));
    $pass = (string)app_mail_env('MAIL_IMAP_PASS', app_mail_env('IMAP_PASS', app_mail_env('SMTP_PASS', app_mail_env('MAIL_PASSWORD', ''))));

    if ($user === '' || $pass === '') {
        return ['ok' => false, 'omitido' => false, 'error' => 'Usuario o contraseña IMAP no configurados.'];
    }

    $folderEnv = trim(app_mail_env('MAIL_SENT_FOLDER', app_mail_env('IMAP_SENT_FOLDER', 'Sent')));
    $candidatas = array_values(array_unique(array_filter([
        $folderEnv,
        'Sent',
        'INBOX.Sent',
        'Enviados',
        'INBOX.Enviados',
        'Sent Items',
        'INBOX.Sent Items',
    ], static fn(string $v): bool => trim($v) !== '')));

    $imap = @imap_open($base, $user, $pass, OP_HALFOPEN, 1);
    if (!$imap) {
        $error = imap_last_error() ?: 'No se pudo abrir conexión IMAP.';
        app_mail_log('No se pudo abrir IMAP para guardar Enviados: ' . $error, 'mailer_sent');
        return ['ok' => false, 'omitido' => false, 'error' => $error];
    }

    $raw = app_mail_normalizar_crlf($raw) . "\r\n";
    foreach ($candidatas as $folder) {
        $mailbox = $base . $folder;
        if (@imap_append($imap, $mailbox, $raw, '\\Seen')) {
            @imap_close($imap);
            return ['ok' => true, 'omitido' => false, 'folder' => $folder, 'error' => null];
        }
    }

    $error = imap_last_error() ?: 'No se pudo guardar el email en ninguna carpeta de enviados.';
    @imap_close($imap);
    app_mail_log('No se pudo guardar en Enviados. Carpetas probadas: ' . implode(', ', $candidatas) . '. Error: ' . $error, 'mailer_sent');
    return ['ok' => false, 'omitido' => false, 'error' => $error];
}

/**
 * Envía un email HTML. Si MAIL_MAILER=smtp o hay SMTP_HOST configurado, usa SMTP.
 * Luego intenta guardar una copia en la carpeta Enviados del webmail por IMAP.
 * El fallo al guardar en Enviados se registra en logs, pero no marca el envío como fallido.
 */
function app_mail_enviar_html(
    string $destino,
    string $subject,
    string $html,
    string $fromEmail,
    string $fromName,
    string $replyToEmail = '',
    string $replyToName = ''
): array {
    $destino = app_mail_email_valido_o($destino);
    if ($destino === '') {
        return ['enviado' => false, 'guardado_enviados' => false, 'error' => 'Email inválido.'];
    }

    $smtpUser = app_mail_env('SMTP_USER', app_mail_env('MAIL_USERNAME', ''));
    $fromEmail = app_mail_email_valido_o($fromEmail, app_mail_env('MAIL_FROM_EMAIL', $smtpUser));
    if ($fromEmail === '') {
        $host = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
        $fromEmail = 'no-reply@' . $host;
    }

    $fromName = trim($fromName) !== '' ? trim($fromName) : app_mail_env('MAIL_FROM_NAME', 'Soporte Lerna');
    $mensaje = app_mail_armar_mensaje_html($destino, $subject, $html, $fromEmail, $fromName, $replyToEmail, $replyToName);

    $mailer = strtolower(trim(app_mail_env('MAIL_MAILER', '')));
    $usarSmtp = $mailer === 'smtp' || trim(app_mail_env('SMTP_HOST', app_mail_env('MAIL_HOST', ''))) !== '';

    $resultadoEnvio = $usarSmtp
        ? app_mail_enviar_smtp($fromEmail, $destino, $mensaje['raw'])
        : app_mail_enviar_php_mail($destino, $mensaje['subject_encoded'], $html, $mensaje['headers_php_mail'], $fromEmail);

    if (empty($resultadoEnvio['ok'])) {
        return [
            'enviado' => false,
            'guardado_enviados' => false,
            'error' => $resultadoEnvio['error'] ?? 'No se pudo enviar el email.',
        ];
    }

    $resultadoSent = app_mail_guardar_enviados($mensaje['raw'], $fromEmail);
    if (empty($resultadoSent['ok']) && empty($resultadoSent['omitido'])) {
        app_mail_log('Email enviado a ' . $destino . ', pero no se guardó copia en Enviados: ' . ($resultadoSent['error'] ?? 'sin detalle'), 'mailer_sent');
    }

    return [
        'enviado' => true,
        'guardado_enviados' => !empty($resultadoSent['ok']) && empty($resultadoSent['omitido']),
        'carpeta_enviados' => $resultadoSent['folder'] ?? null,
        'advertencia' => (!empty($resultadoSent['ok']) || !empty($resultadoSent['omitido'])) ? null : ($resultadoSent['error'] ?? null),
        'error' => null,
    ];
}
