<?php
// backend/modules/formulario/formulario_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

if (!function_exists('formulario_pdo')) {
    function formulario_pdo(): PDO
    {
        if (!function_exists('db')) {
            throw new RuntimeException('La función db() no está disponible. Revisar backend/config/db.php.');
        }

        $action = trim((string)($_GET['action'] ?? $_POST['action'] ?? (request_body()['action'] ?? '')));
        $accionesPublicasFormulario = [
            'form_obtener_config_inscripcion',
            'obtener_config_inscripcion',
            'formulario_obtener_config_inscripcion',
            'form_buscar_previas',
            'buscar_previas',
            'formulario_buscar_previas',
            'form_registrar_inscripcion',
            'registrar_inscripcion',
            'formulario_registrar_inscripcion',
        ];

        $script = basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
        $archivosPublicosFormulario = [
            'obtener_config_inscripcion.php',
            'buscar_previas.php',
            'registrar_inscripcion.php',
        ];

        if ((in_array($action, $accionesPublicasFormulario, true) || in_array($script, $archivosPublicosFormulario, true)) && function_exists('public_tenant_db')) {
            $pdo = public_tenant_db();
        } else {
            $pdo = db();
        }

        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('La conexión obtenida no es una instancia válida de PDO.');
        }

        return $pdo;
    }
}

if (!function_exists('formulario_json')) {
    function formulario_json(array $payload, int $status = 200): void
    {
        json_response($payload, $status);
    }
}

if (!function_exists('formulario_body')) {
    function formulario_body(): array
    {
        return request_body();
    }
}

if (!function_exists('formulario_normalizar_dni')) {
    function formulario_normalizar_dni(mixed $dni): string
    {
        return preg_replace('/\D+/', '', (string)$dni) ?? '';
    }
}

if (!function_exists('formulario_validar_dni')) {
    function formulario_validar_dni(string $dni): bool
    {
        return $dni !== '' && preg_match('/^\d{7,9}$/', $dni) === 1;
    }
}

if (!function_exists('formulario_normalizar_fecha_mysql')) {
    function formulario_normalizar_fecha_mysql(string $valor): string
    {
        $valor = trim(str_replace('T', ' ', $valor));

        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $valor) === 1) {
            return $valor . ':00';
        }

        return $valor;
    }
}

if (!function_exists('formulario_normalizar_color')) {
    function formulario_normalizar_color(mixed $color, string $fallback = '#c6171d'): string
    {
        $color = trim((string)$color);
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1) {
            return strtolower($color);
        }

        return strtolower($fallback);
    }
}

if (!function_exists('formulario_identificador_seguro')) {
    function formulario_identificador_seguro(string $valor, string $tipo = 'identificador'): string
    {
        $valor = trim($valor);

        if ($valor === '' || preg_match('/^[a-zA-Z0-9_]+$/', $valor) !== 1) {
            throw new RuntimeException('Nombre de ' . $tipo . ' inválido para validar estructura de base de datos.');
        }

        return $valor;
    }
}

if (!function_exists('formulario_tabla_existe')) {
    function formulario_tabla_existe(PDO $pdo, string $tabla): bool
    {
        $tabla = formulario_identificador_seguro($tabla, 'tabla');

        $st = $pdo->prepare("
            SELECT COUNT(*)
              FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :tabla
             LIMIT 1
        ");
        $st->execute([':tabla' => $tabla]);

        return (int)$st->fetchColumn() > 0;
    }
}

if (!function_exists('formulario_columna_existe')) {
    function formulario_columna_existe(PDO $pdo, string $tabla, string $columna): bool
    {
        $tabla = formulario_identificador_seguro($tabla, 'tabla');
        $columna = formulario_identificador_seguro($columna, 'columna');

        // No usar "SHOW COLUMNS ... LIKE :param" porque en MySQL/Hostinger
        // el placeholder se convierte en "?" dentro de SHOW y genera error 1064.
        // INFORMATION_SCHEMA sí permite parámetros preparados y evita el 500.
        $st = $pdo->prepare("
            SELECT COUNT(*)
              FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :tabla
               AND COLUMN_NAME = :columna
             LIMIT 1
        ");
        $st->execute([
            ':tabla' => $tabla,
            ':columna' => $columna,
        ]);

        return (int)$st->fetchColumn() > 0;
    }
}

if (!function_exists('formulario_asegurar_tabla_mesas_config')) {
    function formulario_asegurar_tabla_mesas_config(PDO $pdo): void
    {
        if (formulario_tabla_existe($pdo, 'mesas_config')) {
            return;
        }

        $pdo->exec("
            CREATE TABLE mesas_config (
                id_config INT NOT NULL AUTO_INCREMENT,
                nombre VARCHAR(80) NOT NULL DEFAULT 'Mesas Examen',
                descripcion TEXT NULL DEFAULT NULL,
                ciclo_lectivo YEAR NULL DEFAULT NULL,
                insc_inicio DATETIME NULL DEFAULT NULL,
                insc_fin DATETIME NULL DEFAULT NULL,
                mensaje_cerrado VARCHAR(255) NOT NULL DEFAULT 'Inscripción cerrada / fuera de término.',
                mensaje_bienvenida TEXT NULL DEFAULT NULL,
                mensaje_confirmacion TEXT NULL DEFAULT NULL,
                requiere_email TINYINT(1) NOT NULL DEFAULT 1,
                permite_reinscripcion TINYINT(1) NOT NULL DEFAULT 0,
                email_confirmacion_activo TINYINT(1) NOT NULL DEFAULT 1,
                email_mesa_asignada_activo TINYINT(1) NOT NULL DEFAULT 1,
                email_remitente_nombre VARCHAR(120) NULL DEFAULT NULL,
                email_remitente VARCHAR(190) NULL DEFAULT NULL,
                asunto_email_inscripcion VARCHAR(190) NULL DEFAULT NULL,
                plantilla_email_inscripcion TEXT NULL DEFAULT NULL,
                asunto_email_mesa VARCHAR(190) NULL DEFAULT NULL,
                plantilla_email_mesa TEXT NULL DEFAULT NULL,
                logo_url VARCHAR(500) NULL DEFAULT NULL,
                fondo_url VARCHAR(500) NULL DEFAULT NULL,
                color_principal VARCHAR(20) NOT NULL DEFAULT '#c6171d',
                activo TINYINT(1) NOT NULL DEFAULT 1,
                creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id_config)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }
}

if (!function_exists('formulario_asegurar_columnas_config')) {
    function formulario_asegurar_columnas_config(PDO $pdo): void
    {
        // La tabla ÚNICA de configuración del formulario es mesas_config.
        // Todo lo que antes estaba en formulario_configuracion se concentra acá.
        formulario_asegurar_tabla_mesas_config($pdo);

        // Sin cláusulas AFTER: así no falla si el orden de columnas del cliente es distinto.
        $columnas = [
            'nombre' => "ALTER TABLE mesas_config ADD COLUMN nombre VARCHAR(80) NOT NULL DEFAULT 'Mesas Examen'",
            'descripcion' => "ALTER TABLE mesas_config ADD COLUMN descripcion TEXT NULL DEFAULT NULL",
            'ciclo_lectivo' => "ALTER TABLE mesas_config ADD COLUMN ciclo_lectivo YEAR NULL DEFAULT NULL",
            'insc_inicio' => "ALTER TABLE mesas_config ADD COLUMN insc_inicio DATETIME NULL DEFAULT NULL",
            'insc_fin' => "ALTER TABLE mesas_config ADD COLUMN insc_fin DATETIME NULL DEFAULT NULL",
            'mensaje_cerrado' => "ALTER TABLE mesas_config ADD COLUMN mensaje_cerrado VARCHAR(255) NOT NULL DEFAULT 'Inscripción cerrada / fuera de término.'",
            'mensaje_bienvenida' => "ALTER TABLE mesas_config ADD COLUMN mensaje_bienvenida TEXT NULL DEFAULT NULL",
            'mensaje_confirmacion' => "ALTER TABLE mesas_config ADD COLUMN mensaje_confirmacion TEXT NULL DEFAULT NULL",
            'requiere_email' => "ALTER TABLE mesas_config ADD COLUMN requiere_email TINYINT(1) NOT NULL DEFAULT 1",
            'permite_reinscripcion' => "ALTER TABLE mesas_config ADD COLUMN permite_reinscripcion TINYINT(1) NOT NULL DEFAULT 0",
            'email_confirmacion_activo' => "ALTER TABLE mesas_config ADD COLUMN email_confirmacion_activo TINYINT(1) NOT NULL DEFAULT 1",
            'email_mesa_asignada_activo' => "ALTER TABLE mesas_config ADD COLUMN email_mesa_asignada_activo TINYINT(1) NOT NULL DEFAULT 1",
            'email_remitente_nombre' => "ALTER TABLE mesas_config ADD COLUMN email_remitente_nombre VARCHAR(120) NULL DEFAULT NULL",
            'email_remitente' => "ALTER TABLE mesas_config ADD COLUMN email_remitente VARCHAR(190) NULL DEFAULT NULL",
            'asunto_email_inscripcion' => "ALTER TABLE mesas_config ADD COLUMN asunto_email_inscripcion VARCHAR(190) NULL DEFAULT NULL",
            'plantilla_email_inscripcion' => "ALTER TABLE mesas_config ADD COLUMN plantilla_email_inscripcion TEXT NULL DEFAULT NULL",
            'asunto_email_mesa' => "ALTER TABLE mesas_config ADD COLUMN asunto_email_mesa VARCHAR(190) NULL DEFAULT NULL",
            'plantilla_email_mesa' => "ALTER TABLE mesas_config ADD COLUMN plantilla_email_mesa TEXT NULL DEFAULT NULL",
            'logo_url' => "ALTER TABLE mesas_config ADD COLUMN logo_url VARCHAR(500) NULL DEFAULT NULL",
            'fondo_url' => "ALTER TABLE mesas_config ADD COLUMN fondo_url VARCHAR(500) NULL DEFAULT NULL",
            'color_principal' => "ALTER TABLE mesas_config ADD COLUMN color_principal VARCHAR(20) NOT NULL DEFAULT '#c6171d'",
            'activo' => "ALTER TABLE mesas_config ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1",
            'creado_en' => "ALTER TABLE mesas_config ADD COLUMN creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
            'actualizado_en' => "ALTER TABLE mesas_config ADD COLUMN actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
        ];

        foreach ($columnas as $columna => $sql) {
            if (!formulario_columna_existe($pdo, 'mesas_config', $columna)) {
                $pdo->exec($sql);
            }
        }
    }
}

if (!function_exists('formulario_tenant_id_resuelto')) {
    function formulario_tenant_id_resuelto(): int
    {
        try {
            if (function_exists('tenant_id_actual')) {
                $id = (int)tenant_id_actual();
                if ($id > 0) return $id;
            }
        } catch (Throwable $e) {
            // En endpoints públicos puede no existir sesión. Seguimos con public_tenant_info().
        }

        try {
            $tenant = formulario_tenant_info();
            $id = (int)($tenant['idTenant'] ?? 0);
            if ($id > 0) return $id;
        } catch (Throwable $e) {
            if (function_exists('log_error')) log_error($e, 'formulario:tenant_id_resuelto');
        }

        return 0;
    }
}

if (!function_exists('formulario_uploads_public_root')) {
    function formulario_uploads_public_root(): string
    {
        $custom = trim((string)(env_value('FORMULARIO_UPLOADS_ROOT', '') ?? ''));
        if ($custom !== '') {
            return rtrim($custom, DIRECTORY_SEPARATOR);
        }

        // __DIR__ = public_html/LERNA/api/modules/formulario
        // dirname(__DIR__, 3) = public_html/LERNA
        return rtrim(dirname(__DIR__, 3), DIRECTORY_SEPARATOR);
    }
}

if (!function_exists('formulario_normalizar_url_publica')) {
    function formulario_normalizar_url_publica(mixed $url): ?string
    {
        $url = trim((string)$url);
        if ($url === '') return null;

        if (preg_match('#^https?://#i', $url) === 1) {
            return $url;
        }

        return '/' . ltrim($url, '/');
    }
}


if (!function_exists('formulario_origen_publico')) {
    function formulario_origen_publico(): string
    {
        // Debe ser el origen desde donde se sirven los archivos públicos (/uploads),
        // no necesariamente el FRONTEND_URL. En desarrollo el front puede estar en
        // localhost:3000 y el backend/imagenes en Hostinger o en otro puerto.
        $assetBase = trim((string)(env_value('PUBLIC_ASSET_URL', '') ?? env_value('APP_PUBLIC_URL', '') ?? ''));
        if ($assetBase !== '' && preg_match('#^https?://#i', $assetBase) === 1) {
            $partes = parse_url($assetBase);
            if (!empty($partes['scheme']) && !empty($partes['host'])) {
                $puerto = isset($partes['port']) ? ':' . $partes['port'] : '';
                return $partes['scheme'] . '://' . $partes['host'] . $puerto;
            }
        }

        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https')
            || ((string)($_SERVER['SERVER_PORT'] ?? '') === '443');

        $scheme = $https ? 'https' : 'http';
        $host = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
        if ($host === '') {
            return '';
        }

        // Si viene una cadena tipo "host1, host2", usamos el primero.
        if (strpos($host, ',') !== false) {
            $host = trim(explode(',', $host)[0]);
        }

        return $scheme . '://' . $host;
    }
}

if (!function_exists('formulario_url_publica_absoluta')) {
    function formulario_url_publica_absoluta(mixed $url): ?string
    {
        $url = formulario_normalizar_url_publica($url);
        if (!$url) return null;

        if (preg_match('#^https?://#i', $url) === 1) {
            return $url;
        }

        $origen = formulario_origen_publico();
        if ($origen === '') {
            return $url;
        }

        return rtrim($origen, '/') . '/' . ltrim($url, '/');
    }
}

if (!function_exists('formulario_eliminar_archivo_publico')) {
    function formulario_eliminar_archivo_publico(?string $url): void
    {
        $url = formulario_normalizar_url_publica($url);
        if (!$url || preg_match('#^https?://#i', $url) === 1) return;

        $root = formulario_uploads_public_root();
        $path = realpath($root . '/' . ltrim($url, '/'));
        $uploadsRoot = realpath($root . '/uploads');

        if ($path && $uploadsRoot && str_starts_with($path, $uploadsRoot) && is_file($path)) {
            @unlink($path);
        }
    }
}

if (!function_exists('formulario_guardar_archivo_visual')) {
    function formulario_guardar_archivo_visual(string $campo, string $tipo): ?string
    {
        if (empty($_FILES[$campo]) || !is_array($_FILES[$campo])) {
            return null;
        }

        $file = $_FILES[$campo];
        $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) return null;
        if ($error !== UPLOAD_ERR_OK) {
            throw new RuntimeException('No se pudo subir la imagen del formulario. Código: ' . $error);
        }

        $tmp = (string)($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new RuntimeException('Archivo subido inválido.');
        }

        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > 5 * 1024 * 1024) {
            throw new RuntimeException('La imagen debe pesar menos de 5 MB.');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($tmp);
        $extPorMime = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
        ];

        if (!isset($extPorMime[$mime])) {
            throw new RuntimeException('Formato no permitido. Usá JPG, PNG, WEBP o GIF.');
        }

        $tenantId = formulario_tenant_id_resuelto();
        $tenantFolder = $tenantId > 0 ? 't_' . $tenantId : 'publico';
        $publicRoot = formulario_uploads_public_root();
        $relativeDir = 'uploads/tenants/' . $tenantFolder . '/formulario';
        $targetDir = $publicRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativeDir);

        if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
            throw new RuntimeException('No se pudo crear la carpeta de imágenes del formulario.');
        }

        $nombre = $tipo . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $extPorMime[$mime];
        $destino = $targetDir . DIRECTORY_SEPARATOR . $nombre;

        if (!move_uploaded_file($tmp, $destino)) {
            throw new RuntimeException('No se pudo guardar la imagen subida.');
        }

        @chmod($destino, 0644);
        return '/' . $relativeDir . '/' . $nombre;
    }
}

if (!function_exists('formulario_config_actual')) {
    function formulario_config_actual(PDO $pdo): ?array
    {
        formulario_asegurar_columnas_config($pdo);

        $sql = "
            SELECT id_config, nombre, descripcion, ciclo_lectivo,
                   insc_inicio, insc_fin, mensaje_cerrado,
                   logo_url, fondo_url, color_principal,
                   mensaje_bienvenida, mensaje_confirmacion,
                   requiere_email, permite_reinscripcion,
                   email_confirmacion_activo, email_mesa_asignada_activo,
                   email_remitente_nombre, email_remitente,
                   asunto_email_inscripcion, plantilla_email_inscripcion,
                   asunto_email_mesa, plantilla_email_mesa,
                   activo, creado_en, actualizado_en
              FROM mesas_config
             ORDER BY activo DESC, actualizado_en DESC, id_config DESC
             LIMIT 1
        ";

        $row = $pdo->query($sql)->fetch();
        return $row ?: null;
    }
}

if (!function_exists('formulario_config_payload')) {
    function formulario_config_payload(?array $row): array
    {
        if (!$row) {
            return [
                'exito' => true,
                'hay_config' => false,
                'abierta' => false,
                'mensaje_cerrado' => 'La inscripción todavía no fue configurada.',
            ];
        }

        $tz = new DateTimeZone('America/Argentina/Cordoba');
        $ahora = new DateTimeImmutable('now', $tz);
        $ini = new DateTimeImmutable((string)$row['insc_inicio'], $tz);
        $fin = new DateTimeImmutable((string)$row['insc_fin'], $tz);
        $abierta = ((int)$row['activo'] === 1 && $ahora >= $ini && $ahora <= $fin);

        $logoUrl = formulario_normalizar_url_publica($row['logo_url'] ?? null);
        $fondoUrl = formulario_normalizar_url_publica($row['fondo_url'] ?? null);
        $colorPrincipal = formulario_normalizar_color($row['color_principal'] ?? '#c6171d');

        return [
            'exito' => true,
            'hay_config' => true,
            'id_config' => (int)$row['id_config'],
            'titulo' => (string)$row['nombre'],
            'nombre' => (string)$row['nombre'],
            'descripcion' => $row['descripcion'] ?? null,
            'ciclo_lectivo' => $row['ciclo_lectivo'] ?? null,
            'inicio' => (string)$row['insc_inicio'],
            'fin' => (string)$row['insc_fin'],
            'insc_inicio' => (string)$row['insc_inicio'],
            'insc_fin' => (string)$row['insc_fin'],
            'mensaje_cerrado' => (string)$row['mensaje_cerrado'],
            'mensaje_bienvenida' => $row['mensaje_bienvenida'] ?? null,
            'mensaje_confirmacion' => $row['mensaje_confirmacion'] ?? null,
            'requiere_email' => (int)($row['requiere_email'] ?? 1),
            'permite_reinscripcion' => (int)($row['permite_reinscripcion'] ?? 0),
            'email_confirmacion_activo' => (int)($row['email_confirmacion_activo'] ?? 1),
            'email_mesa_asignada_activo' => (int)($row['email_mesa_asignada_activo'] ?? 1),
            'email_remitente_nombre' => $row['email_remitente_nombre'] ?? null,
            'email_remitente' => $row['email_remitente'] ?? null,
            'asunto_email_inscripcion' => $row['asunto_email_inscripcion'] ?? null,
            'plantilla_email_inscripcion' => $row['plantilla_email_inscripcion'] ?? null,
            'asunto_email_mesa' => $row['asunto_email_mesa'] ?? null,
            'plantilla_email_mesa' => $row['plantilla_email_mesa'] ?? null,
            'logo_url' => $logoUrl,
            'fondo_url' => $fondoUrl,
            'color_principal' => $colorPrincipal,
            'logoUrl' => $logoUrl,
            'fondoUrl' => $fondoUrl,
            'colorPrincipal' => $colorPrincipal,
            'logo_url_absoluta' => formulario_url_publica_absoluta($logoUrl),
            'fondo_url_absoluta' => formulario_url_publica_absoluta($fondoUrl),
            'logoUrlAbsoluta' => formulario_url_publica_absoluta($logoUrl),
            'fondoUrlAbsoluta' => formulario_url_publica_absoluta($fondoUrl),
            'logoUrlAbsolute' => formulario_url_publica_absoluta($logoUrl),
            'fondoUrlAbsolute' => formulario_url_publica_absoluta($fondoUrl),
            'activo' => (int)$row['activo'],
            'abierta' => $abierta,
            'creado_en' => $row['creado_en'] ?? null,
            'actualizado_en' => $row['actualizado_en'] ?? null,
        ];
    }
}

if (!function_exists('formulario_ventana_abierta')) {
    function formulario_ventana_abierta(PDO $pdo): bool
    {
        $payload = formulario_config_payload(formulario_config_actual($pdo));
        return (bool)($payload['abierta'] ?? false);
    }
}

if (!function_exists('formulario_method')) {
    function formulario_method(string $method): void
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== strtoupper($method)) {
            formulario_json([
                'exito' => false,
                'mensaje' => 'Método no permitido.',
            ], 405);
        }
    }
}

if (!function_exists('formulario_tenant_info')) {
    function formulario_tenant_info(): array
    {
        try {
            if (function_exists('public_tenant_info')) {
                return public_tenant_info();
            }
        } catch (Throwable $e) {
            if (function_exists('log_error')) {
                log_error($e, 'formulario:tenant_info');
            }
        }

        return [
            'resuelto' => false,
            'host' => $_SERVER['HTTP_HOST'] ?? null,
        ];
    }
}

if (!function_exists('formulario_asegurar_tablas_inscripcion')) {
    function formulario_asegurar_tablas_inscripcion(PDO $pdo): void
    {
        $pdo->exec("\n            CREATE TABLE IF NOT EXISTS formulario_inscripciones (\n                id_inscripcion BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n                dni VARCHAR(20) NOT NULL,\n                gmail VARCHAR(190) NOT NULL,\n                alumno VARCHAR(150) DEFAULT NULL,\n                anio SMALLINT NOT NULL,\n                estado ENUM('registrada','cancelada') NOT NULL DEFAULT 'registrada',\n                origen_host VARCHAR(190) DEFAULT NULL,\n                ip VARCHAR(45) DEFAULT NULL,\n                user_agent VARCHAR(255) DEFAULT NULL,\n                total_materias INT UNSIGNED NOT NULL DEFAULT 0,\n                email_confirmacion_enviado TINYINT(1) NOT NULL DEFAULT 0,\n                email_confirmacion_enviado_en DATETIME DEFAULT NULL,\n                email_confirmacion_error VARCHAR(255) DEFAULT NULL,\n                creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n                actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n                PRIMARY KEY (id_inscripcion),\n                UNIQUE KEY uq_form_inscripciones_dni_anio (dni, anio),\n                KEY idx_form_inscripciones_gmail (gmail),\n                KEY idx_form_inscripciones_estado (estado),\n                KEY idx_form_inscripciones_creado (creado_en)\n            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n        ");

        $pdo->exec("\n            CREATE TABLE IF NOT EXISTS formulario_inscripciones_detalle (\n                id_detalle BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n                id_inscripcion BIGINT UNSIGNED NOT NULL,\n                id_previa INT NOT NULL,\n                id_materia INT NOT NULL,\n                materia_nombre VARCHAR(180) NOT NULL,\n                curso_id INT NOT NULL,\n                division_id INT NOT NULL,\n                id_condicion TINYINT NOT NULL DEFAULT 3,\n                estado ENUM('inscripta','anulada','mesa_asignada','notificada') NOT NULL DEFAULT 'inscripta',\n                fecha_mesa DATE DEFAULT NULL,\n                id_turno INT DEFAULT NULL,\n                turno_nombre VARCHAR(80) DEFAULT NULL,\n                numero_mesa INT DEFAULT NULL,\n                numero_grupo INT DEFAULT NULL,\n                email_mesa_enviado TINYINT(1) NOT NULL DEFAULT 0,\n                email_mesa_enviado_en DATETIME DEFAULT NULL,\n                creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n                actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n                PRIMARY KEY (id_detalle),\n                UNIQUE KEY uq_form_detalle_previa (id_previa),\n                UNIQUE KEY uq_form_detalle_insc_previa (id_inscripcion, id_previa),\n                KEY idx_form_detalle_inscripcion (id_inscripcion),\n                KEY idx_form_detalle_materia (id_materia),\n                KEY idx_form_detalle_mesa (fecha_mesa, id_turno, numero_mesa),\n                CONSTRAINT fk_form_detalle_inscripcion\n                    FOREIGN KEY (id_inscripcion)\n                    REFERENCES formulario_inscripciones (id_inscripcion)\n                    ON DELETE CASCADE\n                    ON UPDATE CASCADE\n            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n        ");
    }
}

if (!function_exists('formulario_tabla_existe')) {
    function formulario_tabla_existe(PDO $pdo, string $tabla): bool
    {
        $st = $pdo->prepare('SHOW TABLES LIKE :tabla');
        $st->execute([':tabla' => $tabla]);
        return (bool)$st->fetchColumn();
    }
}

if (!function_exists('formulario_email_config')) {
    function formulario_email_config(PDO $pdo): array
    {
        $default = [
            'activo' => 1,
            'titulo' => 'Formulario de inscripción a mesas de examen',
            'mensaje_confirmacion' => 'Tu inscripción fue registrada correctamente.',
            'email_confirmacion_activo' => 1,
            'email_remitente_nombre' => env_value('MAIL_FROM_NAME', 'Soporte Lerna') ?? 'Soporte Lerna',
            'email_remitente' => env_value('MAIL_FROM_EMAIL', '') ?? '',
            'asunto_email_inscripcion' => 'Confirmación de inscripción a mesa de examen',
            'plantilla_email_inscripcion' => null,
        ];

        try {
            formulario_asegurar_columnas_config($pdo);

            $row = $pdo->query("\n                SELECT activo,
                       nombre AS titulo,
                       mensaje_confirmacion,
                       email_confirmacion_activo,
                       email_remitente_nombre,
                       email_remitente,
                       asunto_email_inscripcion,
                       plantilla_email_inscripcion
                  FROM mesas_config
                 ORDER BY activo DESC, actualizado_en DESC, id_config DESC
                 LIMIT 1
            ")->fetch();

            if (!$row) {
                return $default;
            }

            return array_merge($default, array_filter($row, static fn($v) => $v !== null && $v !== ''));
        } catch (Throwable $e) {
            if (function_exists('log_error')) {
                log_error($e, 'formulario:email_config');
            }
            return $default;
        }
    }
}

if (!function_exists('formulario_ip_cliente')) {
    function formulario_ip_cliente(): string
    {
        $ip = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
        if (strpos($ip, ',') !== false) {
            $ip = trim(explode(',', $ip)[0]);
        }
        return substr($ip, 0, 45);
    }
}

if (!function_exists('formulario_mail_header_from')) {
    function formulario_mail_header_from(string $name, string $email): string
    {
        $name = trim($name) !== '' ? trim($name) : 'Lerna';
        $email = trim($email) !== '' ? trim($email) : 'no-reply@localhost';
        $encodedName = '=?UTF-8?B?' . base64_encode($name) . '?=';
        return $encodedName . ' <' . $email . '>';
    }
}

if (!function_exists('formulario_render_template')) {
    function formulario_render_template(string $template, array $vars): string
    {
        foreach ($vars as $key => $value) {
            $template = str_replace('{{' . $key . '}}', (string)$value, $template);
        }
        return $template;
    }
}

if (!function_exists('formulario_enviar_email_confirmacion')) {
    function formulario_enviar_email_confirmacion(PDO $pdo, string $destino, string $dni, string $alumno, array $materias, int $anio): array
    {
        if (!filter_var($destino, FILTER_VALIDATE_EMAIL)) {
            return ['enviado' => false, 'error' => 'Email inválido.'];
        }

        $cfg = formulario_email_config($pdo);
        if ((int)($cfg['email_confirmacion_activo'] ?? 1) !== 1) {
            return ['enviado' => false, 'error' => 'El envío de confirmación está desactivado.'];
        }

        $tenant = formulario_tenant_info();
        $escuela = trim((string)($tenant['nombre'] ?? 'Lerna'));
        if ($escuela === '') {
            $escuela = 'Lerna';
        }

        $listaMateriasTexto = implode(', ', array_map(static fn(array $m): string => (string)($m['materia'] ?? $m['materia_nombre'] ?? ''), $materias));
        $listaMateriasHtml = '<ul style="margin:12px 0 0;padding-left:22px;">';
        foreach ($materias as $m) {
            $materia = htmlspecialchars((string)($m['materia'] ?? $m['materia_nombre'] ?? ''), ENT_QUOTES, 'UTF-8');
            $curso = htmlspecialchars((string)($m['curso'] ?? $m['curso_id'] ?? ''), ENT_QUOTES, 'UTF-8');
            $division = htmlspecialchars((string)($m['division'] ?? $m['division_id'] ?? ''), ENT_QUOTES, 'UTF-8');
            $detalleCurso = trim($curso . ($division !== '' ? ' ' . $division : ''));
            $listaMateriasHtml .= '<li style="margin-bottom:8px;"><strong>' . $materia . '</strong>' . ($detalleCurso !== '' ? ' <span style="color:#64748b;">(' . $detalleCurso . ')</span>' : '') . '</li>';
        }
        $listaMateriasHtml .= '</ul>';

        $fecha = date('d/m/Y H:i');
        $vars = [
            'alumno' => $alumno,
            'dni' => $dni,
            'gmail' => $destino,
            'email' => $destino,
            'materias' => $listaMateriasTexto,
            'materias_html' => $listaMateriasHtml,
            'escuela' => $escuela,
            'anio' => (string)$anio,
            'fecha' => $fecha,
        ];

        $subject = trim((string)($cfg['asunto_email_inscripcion'] ?? ''));
        if ($subject === '') {
            $subject = 'Confirmación de inscripción a mesa de examen';
        }
        $subject = formulario_render_template($subject, $vars);

        $plantilla = trim((string)($cfg['plantilla_email_inscripcion'] ?? ''));
        if ($plantilla === '') {
            $plantilla = 'Hola {{alumno}}, tu inscripción fue registrada correctamente para el ciclo {{anio}}. Materias: {{materias}}.';
        }
        $mensajePlano = formulario_render_template($plantilla, $vars);

        $alumnoHtml = htmlspecialchars($alumno, ENT_QUOTES, 'UTF-8');
        $dniHtml = htmlspecialchars($dni, ENT_QUOTES, 'UTF-8');
        $gmailHtml = htmlspecialchars($destino, ENT_QUOTES, 'UTF-8');
        $escuelaHtml = htmlspecialchars($escuela, ENT_QUOTES, 'UTF-8');
        $mensajeHtml = nl2br(htmlspecialchars($mensajePlano, ENT_QUOTES, 'UTF-8'));
        $subjectHtml = htmlspecialchars($subject, ENT_QUOTES, 'UTF-8');

        $html = <<<HTML
<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$subjectHtml}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="padding:32px 16px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dfe5ef;border-radius:14px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.08);">
      <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;background:#fff7ed;">
        <h1 style="margin:0;font-size:22px;color:#111827;">{$escuelaHtml}</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#64748b;">Confirmación de inscripción a mesas de examen</p>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 16px;font-size:21px;color:#111827;">Inscripción registrada correctamente</h2>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">{$mensajeHtml}</p>
        <div style="margin:20px 0;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">
          <p style="margin:0 0 8px;font-size:14px;"><strong>Alumno/a:</strong> {$alumnoHtml}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>DNI:</strong> {$dniHtml}</p>
          <p style="margin:0;font-size:14px;"><strong>Email registrado:</strong> {$gmailHtml}</p>
        </div>
        <h3 style="margin:18px 0 8px;font-size:16px;color:#111827;">Materias inscriptas</h3>
        {$listaMateriasHtml}
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Más adelante, cuando la escuela asigne las mesas, este correo podrá usarse para enviarte fecha, turno y materia.</p>
      </div>
    </div>
  </div>
</body>
</html>
HTML;

        $fromEmail = trim((string)($cfg['email_remitente'] ?? ''));
        if ($fromEmail === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            $fromEmail = trim((string)(env_value('MAIL_FROM_EMAIL', '') ?? ''));
        }
        if ($fromEmail === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            $host = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
            $fromEmail = 'no-reply@' . $host;
        }

        $fromName = trim((string)($cfg['email_remitente_nombre'] ?? ''));
        if ($fromName === '') {
            $fromName = trim((string)(env_value('MAIL_FROM_NAME', 'Soporte Lerna') ?? 'Soporte Lerna'));
        }

        $headers = [];
        $headers[] = 'MIME-Version: 1.0';
        $headers[] = 'Content-Type: text/html; charset=UTF-8';
        $headers[] = 'From: ' . formulario_mail_header_from($fromName, $fromEmail);
        $headers[] = 'Reply-To: ' . formulario_mail_header_from($fromName, $fromEmail);
        $headers[] = 'X-Mailer: PHP/' . PHP_VERSION;

        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $ok = @mail($destino, $encodedSubject, $html, implode("\r\n", $headers));

        return [
            'enviado' => (bool)$ok,
            'error' => $ok ? null : 'No se pudo enviar el email con mail(). Revisá MAIL_FROM_EMAIL y el correo del hosting.',
        ];
    }
}
