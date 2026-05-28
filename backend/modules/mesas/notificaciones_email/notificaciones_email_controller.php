<?php
// backend/modules/mesas/notificaciones_email/notificaciones_email_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../../config/db.php';
require_once __DIR__ . '/../../../config/env.php';
require_once __DIR__ . '/../../../core/helpers.php';
require_once __DIR__ . '/../../../core/auth.php';
require_once __DIR__ . '/../../formulario/formulario_helpers.php';

function mesas_notificaciones_pdo(): PDO
{
    return db();
}

function mesas_notificaciones_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    $tabla = formulario_identificador_seguro($tabla, 'tabla');
    $columna = formulario_identificador_seguro($columna, 'columna');

    // No usar SHOW COLUMNS ... LIKE :param porque en MySQL/MariaDB,
    // según la configuración de PDO, se transforma en SHOW ... LIKE ? y rompe con 1064.
    // INFORMATION_SCHEMA sí permite placeholders preparados.
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

function mesas_notificaciones_asegurar_tablas(PDO $pdo): void
{
    formulario_asegurar_tablas_inscripcion($pdo);

    $columnasDetalle = [
        'estado' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN estado ENUM('inscripta','anulada','mesa_asignada','notificada') NOT NULL DEFAULT 'inscripta'",
        'fecha_mesa' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN fecha_mesa DATE DEFAULT NULL",
        'id_turno' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN id_turno INT DEFAULT NULL",
        'turno_nombre' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN turno_nombre VARCHAR(80) NULL DEFAULT NULL",
        'numero_mesa' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN numero_mesa INT DEFAULT NULL",
        'numero_grupo' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN numero_grupo INT DEFAULT NULL",
        'email_mesa_enviado' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN email_mesa_enviado TINYINT(1) NOT NULL DEFAULT 0",
        'email_mesa_enviado_en' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN email_mesa_enviado_en DATETIME DEFAULT NULL",
        'email_mesa_error' => "ALTER TABLE formulario_inscripciones_detalle ADD COLUMN email_mesa_error VARCHAR(255) NULL DEFAULT NULL",
    ];

    foreach ($columnasDetalle as $columna => $sql) {
        if (!mesas_notificaciones_columna_existe($pdo, 'formulario_inscripciones_detalle', $columna)) {
            $pdo->exec($sql);
        }
    }

    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS mesas_notificaciones_email_lotes (\n            id_lote BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n            codigo_lote VARCHAR(80) NOT NULL,\n            anio SMALLINT NULL DEFAULT NULL,\n            asunto VARCHAR(190) NULL DEFAULT NULL,\n            estado ENUM('preparado','enviando','finalizado','finalizado_con_errores','cancelado') NOT NULL DEFAULT 'preparado',\n            total_destinatarios INT UNSIGNED NOT NULL DEFAULT 0,\n            total_materias INT UNSIGNED NOT NULL DEFAULT 0,\n            enviados INT UNSIGNED NOT NULL DEFAULT 0,\n            pendientes INT UNSIGNED NOT NULL DEFAULT 0,\n            errores INT UNSIGNED NOT NULL DEFAULT 0,\n            omitidos INT UNSIGNED NOT NULL DEFAULT 0,\n            creado_por INT NULL DEFAULT NULL,\n            creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            iniciado_en DATETIME DEFAULT NULL,\n            finalizado_en DATETIME DEFAULT NULL,\n            actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n            PRIMARY KEY (id_lote),\n            UNIQUE KEY uq_mesas_notif_codigo (codigo_lote),\n            KEY idx_mesas_notif_estado (estado),\n            KEY idx_mesas_notif_creado (creado_en)\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS mesas_notificaciones_email_items (\n            id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n            id_lote BIGINT UNSIGNED NOT NULL,\n            id_inscripcion BIGINT UNSIGNED NOT NULL,\n            dni VARCHAR(20) NOT NULL,\n            alumno VARCHAR(150) NULL DEFAULT NULL,\n            email VARCHAR(190) NOT NULL,\n            materias_json LONGTEXT NULL DEFAULT NULL,\n            total_materias INT UNSIGNED NOT NULL DEFAULT 0,\n            estado ENUM('pendiente','enviando','enviado','error','omitido') NOT NULL DEFAULT 'pendiente',\n            intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,\n            ultimo_error VARCHAR(255) NULL DEFAULT NULL,\n            enviado_en DATETIME DEFAULT NULL,\n            creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n            PRIMARY KEY (id_item),\n            UNIQUE KEY uq_mesas_notif_lote_inscripcion (id_lote, id_inscripcion),\n            KEY idx_mesas_notif_item_estado (id_lote, estado),\n            KEY idx_mesas_notif_item_email (email),\n            KEY idx_mesas_notif_item_dni (dni),\n            CONSTRAINT fk_mesas_notif_item_lote\n                FOREIGN KEY (id_lote) REFERENCES mesas_notificaciones_email_lotes (id_lote)\n                ON DELETE CASCADE ON UPDATE CASCADE\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");
}

function mesas_notificaciones_config(PDO $pdo): array
{
    $default = [
        'nombre' => 'Lerna',
        'email_mesa_asignada_activo' => 1,
        'email_remitente_nombre' => env_value('MAIL_FROM_NAME', 'Soporte Lerna') ?? 'Soporte Lerna',
        'email_remitente' => env_value('MAIL_FROM_EMAIL', '') ?? '',
        'asunto_email_mesa' => 'Tu mesa de examen ya fue asignada',
        'plantilla_email_mesa' => 'Hola {{alumno}}, ya está disponible la información de tus mesas de examen. Revisá fecha, turno y hora para presentarte a rendir.',
        'color_principal' => '#1d4ed8',
    ];

    try {
        formulario_asegurar_columnas_config($pdo);
        $row = $pdo->query("\n            SELECT nombre,\n                   email_mesa_asignada_activo,\n                   email_remitente_nombre,\n                   email_remitente,\n                   asunto_email_mesa,\n                   plantilla_email_mesa,\n                   color_principal\n              FROM mesas_config\n             ORDER BY activo DESC, actualizado_en DESC, id_config DESC\n             LIMIT 1\n        ")->fetch();

        if (!$row) return $default;
        return array_merge($default, array_filter($row, static fn($v) => $v !== null && $v !== ''));
    } catch (Throwable $e) {
        if (function_exists('log_error')) log_error($e, 'mesas_notificaciones:config');
        return $default;
    }
}

function mesas_notificaciones_tenant_nombre(): string
{
    try {
        $usuario = usuario_actual();
        $nombre = trim((string)($usuario['tenant']['nombre'] ?? $usuario['tenant_nombre'] ?? ''));
        if ($nombre !== '') return $nombre;
    } catch (Throwable $e) {
        // Fallback por config.
    }

    return 'Lerna';
}

function mesas_notificaciones_fecha_texto(?string $fecha): string
{
    $fecha = trim((string)$fecha);
    if ($fecha === '') return '-';

    try {
        $dt = new DateTime($fecha);
        return $dt->format('d/m/Y');
    } catch (Throwable $e) {
        return $fecha;
    }
}

function mesas_notificaciones_hora_texto(?string $hora, ?string $turno = ''): string
{
    $hora = trim((string)$hora);
    if ($hora !== '') {
        if (preg_match('/^\d{2}:\d{2}/', $hora) === 1) {
            return substr($hora, 0, 5) . ' hs.';
        }
        return $hora;
    }

    $turnoNorm = mb_strtolower(trim((string)$turno), 'UTF-8');
    $turnoNorm = str_replace(['á', 'é', 'í', 'ó', 'ú', 'ñ'], ['a', 'e', 'i', 'o', 'u', 'n'], $turnoNorm);

    if (strpos($turnoNorm, 'manana') !== false || strpos($turnoNorm, 'mañana') !== false) return '07:30 hs.';
    if (strpos($turnoNorm, 'tarde') !== false) return '13:30 hs.';
    return '-';
}

function mesas_notificaciones_sync_detalle(PDO $pdo): void
{
    try {
        $pdo->exec("\n            UPDATE formulario_inscripciones_detalle fid\n            INNER JOIN mesas m ON m.id_previa = fid.id_previa\n            LEFT JOIN turnos t ON t.id_turno = m.id_turno\n            LEFT JOIN mesas_grupos mg ON mg.numero_mesa = m.numero_mesa\n            SET fid.fecha_mesa = m.fecha_mesa,\n                fid.id_turno = m.id_turno,\n                fid.turno_nombre = t.turno,\n                fid.numero_mesa = m.numero_mesa,\n                fid.numero_grupo = mg.numero_grupo,\n                fid.estado = CASE\n                    WHEN fid.email_mesa_enviado = 1 THEN 'notificada'\n                    WHEN m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL THEN 'mesa_asignada'\n                    ELSE fid.estado\n                END\n            WHERE fid.estado <> 'anulada'\n        ");
    } catch (Throwable $e) {
        if (function_exists('log_error')) log_error($e, 'mesas_notificaciones:sync_detalle');
    }
}

function mesas_notificaciones_obtener_filas(PDO $pdo): array
{
    mesas_notificaciones_sync_detalle($pdo);

    $sql = "\n        SELECT\n            fi.id_inscripcion,\n            fi.dni,\n            fi.gmail AS email,\n            COALESCE(NULLIF(fi.alumno, ''), p.alumno, '') AS alumno,\n            fi.anio,\n            fi.email_confirmacion_enviado,\n            fi.email_confirmacion_enviado_en,\n            fid.id_detalle,\n            fid.id_previa,\n            COALESCE(NULLIF(fid.materia_nombre, ''), mat.materia, '') AS materia,\n            COALESCE(curso_mat.nombre_curso, '') AS curso,\n            COALESCE(div_mat.nombre_division, '') AS division,\n            COALESCE(curso_al.nombre_curso, '') AS curso_alumno,\n            COALESCE(div_al.nombre_division, '') AS division_alumno,\n            m.id_mesa,\n            m.numero_mesa,\n            COALESCE(mg.numero_grupo, fid.numero_grupo) AS numero_grupo,\n            COALESCE(mg.fecha_mesa, mna.fecha_mesa, m.fecha_mesa, fid.fecha_mesa) AS fecha_mesa,\n            COALESCE(mg.id_turno, mna.id_turno, m.id_turno, fid.id_turno) AS id_turno,\n            COALESCE(mg.hora, mna.hora) AS hora,\n            COALESCE(t.turno, fid.turno_nombre, '') AS turno,\n            COALESCE(doc.docente, '') AS docente,\n            COALESCE(fid.email_mesa_enviado, 0) AS email_mesa_enviado,\n            fid.email_mesa_enviado_en,\n            fid.email_mesa_error\n        FROM formulario_inscripciones fi\n        INNER JOIN formulario_inscripciones_detalle fid ON fid.id_inscripcion = fi.id_inscripcion\n        LEFT JOIN previas p ON p.id_previa = fid.id_previa\n        LEFT JOIN mesas m ON m.id_previa = fid.id_previa\n        LEFT JOIN mesas_grupos mg ON mg.numero_mesa = m.numero_mesa\n        LEFT JOIN mesas_no_agrupadas mna ON mna.numero_mesa = m.numero_mesa\n        LEFT JOIN turnos t ON t.id_turno = COALESCE(mg.id_turno, mna.id_turno, m.id_turno, fid.id_turno)\n        LEFT JOIN docentes doc ON doc.id_docente = m.id_docente\n        LEFT JOIN materias mat ON mat.id_materia = COALESCE(fid.id_materia, p.id_materia)\n        LEFT JOIN curso curso_mat ON curso_mat.id_curso = COALESCE(fid.curso_id, p.materia_id_curso)\n        LEFT JOIN division div_mat ON div_mat.id_division = COALESCE(fid.division_id, p.materia_id_division)\n        LEFT JOIN curso curso_al ON curso_al.id_curso = p.cursando_id_curso\n        LEFT JOIN division div_al ON div_al.id_division = p.cursando_id_division\n        WHERE fi.estado = 'registrada'\n          AND TRIM(fi.gmail) <> ''\n          AND fid.estado <> 'anulada'\n        ORDER BY fi.alumno ASC, fi.dni ASC, fecha_mesa ASC, id_turno ASC, materia ASC\n    ";

    return $pdo->query($sql)->fetchAll() ?: [];
}

function mesas_notificaciones_agrupar_destinatarios(array $filas): array
{
    $mapa = [];

    foreach ($filas as $row) {
        $idInscripcion = (int)($row['id_inscripcion'] ?? 0);
        if ($idInscripcion <= 0) continue;

        $email = trim((string)($row['email'] ?? ''));
        $dni = trim((string)($row['dni'] ?? ''));
        $alumno = trim((string)($row['alumno'] ?? ''));

        if (!isset($mapa[$idInscripcion])) {
            $mapa[$idInscripcion] = [
                'id_inscripcion' => $idInscripcion,
                'dni' => $dni,
                'alumno' => $alumno,
                'email' => $email,
                'anio' => (int)($row['anio'] ?? date('Y')),
                'email_valido' => filter_var($email, FILTER_VALIDATE_EMAIL) !== false,
                'total_materias' => 0,
                'total_asignadas' => 0,
                'total_notificadas' => 0,
                'total_pendientes' => 0,
                'estado' => 'sin_mesa',
                'materias' => [],
            ];
        }

        $fecha = trim((string)($row['fecha_mesa'] ?? ''));
        $turno = trim((string)($row['turno'] ?? ''));
        $horaRaw = trim((string)($row['hora'] ?? ''));
        $asignada = $fecha !== '' && (int)($row['id_turno'] ?? 0) > 0 && (int)($row['numero_mesa'] ?? 0) > 0;
        $enviada = (int)($row['email_mesa_enviado'] ?? 0) === 1;

        $materia = [
            'id_detalle' => (int)($row['id_detalle'] ?? 0),
            'id_previa' => (int)($row['id_previa'] ?? 0),
            'materia' => trim((string)($row['materia'] ?? '')),
            'curso' => trim((string)($row['curso'] ?? '')),
            'division' => trim((string)($row['division'] ?? '')),
            'curso_alumno' => trim((string)($row['curso_alumno'] ?? '')),
            'division_alumno' => trim((string)($row['division_alumno'] ?? '')),
            'numero_mesa' => (int)($row['numero_mesa'] ?? 0),
            'numero_grupo' => (int)($row['numero_grupo'] ?? 0),
            'fecha_mesa' => $fecha,
            'fecha_texto' => mesas_notificaciones_fecha_texto($fecha),
            'id_turno' => (int)($row['id_turno'] ?? 0),
            'turno' => $turno !== '' ? $turno : '-',
            'hora' => mesas_notificaciones_hora_texto($horaRaw, $turno),
            'docente' => trim((string)($row['docente'] ?? '')),
            'asignada' => $asignada,
            'email_mesa_enviado' => $enviada,
            'email_mesa_enviado_en' => $row['email_mesa_enviado_en'] ?? null,
            'email_mesa_error' => $row['email_mesa_error'] ?? null,
        ];

        $mapa[$idInscripcion]['materias'][] = $materia;
        $mapa[$idInscripcion]['total_materias']++;
        if ($asignada) $mapa[$idInscripcion]['total_asignadas']++;
        if ($asignada && $enviada) $mapa[$idInscripcion]['total_notificadas']++;
        if ($asignada && !$enviada) $mapa[$idInscripcion]['total_pendientes']++;
    }

    foreach ($mapa as &$item) {
        if (!$item['email_valido']) {
            $item['estado'] = 'email_invalido';
        } elseif ($item['total_asignadas'] <= 0) {
            $item['estado'] = 'sin_mesa';
        } elseif ($item['total_notificadas'] >= $item['total_asignadas']) {
            $item['estado'] = 'enviado';
        } elseif ($item['total_notificadas'] > 0) {
            $item['estado'] = 'parcial';
        } else {
            $item['estado'] = 'pendiente';
        }
    }
    unset($item);

    return array_values($mapa);
}

function mesas_notificaciones_obtener_destinatarios(PDO $pdo): array
{
    return mesas_notificaciones_agrupar_destinatarios(mesas_notificaciones_obtener_filas($pdo));
}

function mesas_notificaciones_recalcular_lote(PDO $pdo, int $idLote): array
{
    $st = $pdo->prepare("\n        SELECT\n            COUNT(*) AS total_destinatarios,\n            COALESCE(SUM(total_materias), 0) AS total_materias,\n            SUM(CASE WHEN estado = 'enviado' THEN 1 ELSE 0 END) AS enviados,\n            SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,\n            SUM(CASE WHEN estado = 'error' THEN 1 ELSE 0 END) AS errores,\n            SUM(CASE WHEN estado = 'omitido' THEN 1 ELSE 0 END) AS omitidos\n        FROM mesas_notificaciones_email_items\n        WHERE id_lote = :id_lote\n    ");
    $st->execute([':id_lote' => $idLote]);
    $row = $st->fetch() ?: [];

    $pendientes = (int)($row['pendientes'] ?? 0);
    $errores = (int)($row['errores'] ?? 0);
    $enviados = (int)($row['enviados'] ?? 0);
    $estado = 'enviando';
    $finalizadoEnSql = 'NULL';

    if ($pendientes <= 0) {
        $estado = $errores > 0 ? 'finalizado_con_errores' : 'finalizado';
        $finalizadoEnSql = 'COALESCE(finalizado_en, NOW())';
    }

    if ($enviados <= 0 && $pendientes > 0 && $errores <= 0) {
        $estado = 'preparado';
    }

    $upd = $pdo->prepare("\n        UPDATE mesas_notificaciones_email_lotes\n           SET estado = :estado,\n               total_destinatarios = :total_destinatarios,\n               total_materias = :total_materias,\n               enviados = :enviados,\n               pendientes = :pendientes,\n               errores = :errores,\n               omitidos = :omitidos,\n               finalizado_en = {$finalizadoEnSql}\n         WHERE id_lote = :id_lote\n         LIMIT 1\n    ");
    $upd->execute([
        ':estado' => $estado,
        ':total_destinatarios' => (int)($row['total_destinatarios'] ?? 0),
        ':total_materias' => (int)($row['total_materias'] ?? 0),
        ':enviados' => $enviados,
        ':pendientes' => $pendientes,
        ':errores' => $errores,
        ':omitidos' => (int)($row['omitidos'] ?? 0),
        ':id_lote' => $idLote,
    ]);

    $stLote = $pdo->prepare('SELECT * FROM mesas_notificaciones_email_lotes WHERE id_lote = :id_lote LIMIT 1');
    $stLote->execute([':id_lote' => $idLote]);
    $lote = $stLote->fetch() ?: [];

    return mesas_notificaciones_formatear_lote($lote);
}

function mesas_notificaciones_formatear_lote(array $lote): array
{
    if (!$lote) return [];

    $total = max(0, (int)($lote['total_destinatarios'] ?? 0));
    $enviados = max(0, (int)($lote['enviados'] ?? 0));
    $errores = max(0, (int)($lote['errores'] ?? 0));
    $omitidos = max(0, (int)($lote['omitidos'] ?? 0));
    $pendientes = max(0, (int)($lote['pendientes'] ?? max(0, $total - $enviados - $errores - $omitidos)));
    $procesados = min($total, $enviados + $errores + $omitidos);
    $porcentaje = $total > 0 ? round(($procesados / $total) * 100, 1) : 0;

    return [
        'id_lote' => (int)($lote['id_lote'] ?? 0),
        'codigo_lote' => $lote['codigo_lote'] ?? null,
        'anio' => isset($lote['anio']) ? (int)$lote['anio'] : null,
        'asunto' => $lote['asunto'] ?? null,
        'estado' => $lote['estado'] ?? 'preparado',
        'total_destinatarios' => $total,
        'total_materias' => (int)($lote['total_materias'] ?? 0),
        'enviados' => $enviados,
        'pendientes' => $pendientes,
        'errores' => $errores,
        'omitidos' => $omitidos,
        'procesados' => $procesados,
        'porcentaje' => $porcentaje,
        'creado_en' => $lote['creado_en'] ?? null,
        'iniciado_en' => $lote['iniciado_en'] ?? null,
        'finalizado_en' => $lote['finalizado_en'] ?? null,
        'actualizado_en' => $lote['actualizado_en'] ?? null,
    ];
}

function mesas_notificaciones_ultimo_lote(PDO $pdo): array
{
    $row = $pdo->query("\n        SELECT *\n          FROM mesas_notificaciones_email_lotes\n         ORDER BY id_lote DESC\n         LIMIT 1\n    ")->fetch();

    return $row ? mesas_notificaciones_formatear_lote($row) : [];
}

function mesas_notificaciones_resumen_destinatarios(array $destinatarios): array
{
    $resumen = [
        'total_destinatarios' => count($destinatarios),
        'con_mesa' => 0,
        'pendientes' => 0,
        'enviados' => 0,
        'parciales' => 0,
        'sin_mesa' => 0,
        'email_invalido' => 0,
        'total_materias' => 0,
        'total_materias_asignadas' => 0,
    ];

    foreach ($destinatarios as $item) {
        $resumen['total_materias'] += (int)($item['total_materias'] ?? 0);
        $resumen['total_materias_asignadas'] += (int)($item['total_asignadas'] ?? 0);
        if ((int)($item['total_asignadas'] ?? 0) > 0) $resumen['con_mesa']++;

        $estado = (string)($item['estado'] ?? '');
        if ($estado === 'pendiente') $resumen['pendientes']++;
        elseif ($estado === 'enviado') $resumen['enviados']++;
        elseif ($estado === 'parcial') $resumen['parciales']++;
        elseif ($estado === 'sin_mesa') $resumen['sin_mesa']++;
        elseif ($estado === 'email_invalido') $resumen['email_invalido']++;
    }

    return $resumen;
}

function mesas_notificaciones_listar(): void
{
    $pdo = mesas_notificaciones_pdo();
    mesas_notificaciones_asegurar_tablas($pdo);

    $destinatarios = mesas_notificaciones_obtener_destinatarios($pdo);
    json_response([
        'exito' => true,
        'data' => [
            'destinatarios' => $destinatarios,
            'resumen' => mesas_notificaciones_resumen_destinatarios($destinatarios),
            'ultimo_lote' => mesas_notificaciones_ultimo_lote($pdo),
            'limites' => [
                'batch_size_default' => (int)(env_value('MAIL_MESAS_BATCH_SIZE', '20') ?? '20'),
                'daily_limit' => (int)(env_value('MAIL_MESAS_DAILY_LIMIT', '900') ?? '900'),
            ],
        ],
    ]);
}

function mesas_notificaciones_registrar_lote(): void
{
    $pdo = mesas_notificaciones_pdo();
    mesas_notificaciones_asegurar_tablas($pdo);

    $body = request_body();
    $reenviar = !empty($body['reenviar']);
    $destinatarios = mesas_notificaciones_obtener_destinatarios($pdo);
    $cfg = mesas_notificaciones_config($pdo);

    if ((int)($cfg['email_mesa_asignada_activo'] ?? 1) !== 1) {
        json_response(['exito' => false, 'mensaje' => 'El envío de emails de mesa asignada está desactivado en la configuración del formulario.'], 200);
    }

    $seleccionados = [];
    foreach ($destinatarios as $d) {
        if (!($d['email_valido'] ?? false)) continue;
        if ((int)($d['total_asignadas'] ?? 0) <= 0) continue;
        if (!$reenviar && (string)($d['estado'] ?? '') === 'enviado') continue;

        $materiasAsignadas = array_values(array_filter($d['materias'] ?? [], static fn(array $m): bool => !empty($m['asignada'])));
        if (!$materiasAsignadas) continue;

        $d['materias'] = $materiasAsignadas;
        $d['total_materias'] = count($materiasAsignadas);
        $seleccionados[] = $d;
    }

    if (!$seleccionados) {
        json_response([
            'exito' => false,
            'mensaje' => 'No hay alumnos pendientes con mesa asignada para notificar.',
            'data' => [
                'resumen' => mesas_notificaciones_resumen_destinatarios($destinatarios),
            ],
        ], 200);
    }

    $codigo = 'MESAS-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
    $anio = (int)($body['anio'] ?? date('Y'));
    $asunto = trim((string)($body['asunto'] ?? $cfg['asunto_email_mesa'] ?? 'Tu mesa de examen ya fue asignada'));
    if ($asunto === '') $asunto = 'Tu mesa de examen ya fue asignada';

    $pdo->beginTransaction();
    try {
        $totalMaterias = array_sum(array_map(static fn(array $d): int => count($d['materias'] ?? []), $seleccionados));
        $stLote = $pdo->prepare("\n            INSERT INTO mesas_notificaciones_email_lotes (codigo_lote, anio, asunto, estado, total_destinatarios, total_materias, pendientes, creado_por, creado_en, actualizado_en)\n            VALUES (:codigo, :anio, :asunto, 'preparado', :total_destinatarios, :total_materias, :pendientes, :creado_por, NOW(), NOW())\n        ");
        $stLote->execute([
            ':codigo' => $codigo,
            ':anio' => $anio,
            ':asunto' => $asunto,
            ':total_destinatarios' => count($seleccionados),
            ':total_materias' => $totalMaterias,
            ':pendientes' => count($seleccionados),
            ':creado_por' => usuario_id() ?: null,
        ]);
        $idLote = (int)$pdo->lastInsertId();

        $stItem = $pdo->prepare("\n            INSERT INTO mesas_notificaciones_email_items (id_lote, id_inscripcion, dni, alumno, email, materias_json, total_materias, estado, creado_en, actualizado_en)\n            VALUES (:id_lote, :id_inscripcion, :dni, :alumno, :email, :materias_json, :total_materias, 'pendiente', NOW(), NOW())\n        ");

        foreach ($seleccionados as $d) {
            $stItem->execute([
                ':id_lote' => $idLote,
                ':id_inscripcion' => (int)$d['id_inscripcion'],
                ':dni' => (string)$d['dni'],
                ':alumno' => (string)$d['alumno'],
                ':email' => (string)$d['email'],
                ':materias_json' => json_encode($d['materias'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ':total_materias' => count($d['materias']),
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    json_response([
        'exito' => true,
        'mensaje' => 'Lote de notificaciones preparado correctamente.',
        'data' => [
            'lote' => mesas_notificaciones_recalcular_lote($pdo, $idLote),
        ],
    ]);
}

function mesas_notificaciones_items_lote(PDO $pdo, int $idLote, int $limit): array
{
    $st = $pdo->prepare("\n        SELECT *\n          FROM mesas_notificaciones_email_items\n         WHERE id_lote = :id_lote\n           AND estado IN ('pendiente','error')\n           AND intentos < 3\n         ORDER BY estado ASC, id_item ASC\n         LIMIT {$limit}\n    ");
    $st->execute([':id_lote' => $idLote]);
    return $st->fetchAll() ?: [];
}

function mesas_notificaciones_enviados_hoy(PDO $pdo): int
{
    $st = $pdo->query("\n        SELECT COUNT(*)\n          FROM mesas_notificaciones_email_items\n         WHERE estado = 'enviado'\n           AND enviado_en >= CURDATE()\n    ");
    return (int)$st->fetchColumn();
}

function mesas_notificaciones_html_email(array $item, array $materias, array $cfg, string $subject): string
{
    $escuela = trim((string)($cfg['nombre'] ?? ''));
    if ($escuela === '') $escuela = mesas_notificaciones_tenant_nombre();

    $alumno = htmlspecialchars((string)($item['alumno'] ?? ''), ENT_QUOTES, 'UTF-8');
    $dni = htmlspecialchars((string)($item['dni'] ?? ''), ENT_QUOTES, 'UTF-8');
    $email = htmlspecialchars((string)($item['email'] ?? ''), ENT_QUOTES, 'UTF-8');
    $escuelaHtml = htmlspecialchars($escuela, ENT_QUOTES, 'UTF-8');
    $subjectHtml = htmlspecialchars($subject, ENT_QUOTES, 'UTF-8');
    $colorPrincipal = formulario_normalizar_color($cfg['color_principal'] ?? '#1d4ed8', '#1d4ed8');

    $plantilla = trim((string)($cfg['plantilla_email_mesa'] ?? ''));
    if ($plantilla === '') {
        $plantilla = 'Hola {{alumno}}, ya está disponible la información de tus mesas de examen. Revisá fecha, turno y hora para presentarte a rendir.';
    }

    $materiasTexto = implode(', ', array_values(array_filter(array_map(static fn(array $m): string => trim((string)($m['materia'] ?? '')), $materias))));
    $vars = [
        'alumno' => (string)($item['alumno'] ?? ''),
        'dni' => (string)($item['dni'] ?? ''),
        'gmail' => (string)($item['email'] ?? ''),
        'email' => (string)($item['email'] ?? ''),
        'escuela' => $escuela,
        'materias' => $materiasTexto,
        'materia' => $materiasTexto,
        'fecha' => date('d/m/Y H:i'),
    ];
    $mensajePlano = formulario_render_template($plantilla, $vars);
    $mensajeHtml = nl2br(htmlspecialchars($mensajePlano, ENT_QUOTES, 'UTF-8'));

    $filasHtml = '';
    foreach ($materias as $m) {
        $materia = htmlspecialchars((string)($m['materia'] ?? '-'), ENT_QUOTES, 'UTF-8');
        $curso = trim((string)($m['curso'] ?? ''));
        $division = trim((string)($m['division'] ?? ''));
        $cursoDivision = htmlspecialchars(trim($curso . ($division !== '' ? ' ' . $division : '')), ENT_QUOTES, 'UTF-8');
        $fecha = htmlspecialchars((string)($m['fecha_texto'] ?? mesas_notificaciones_fecha_texto($m['fecha_mesa'] ?? '')), ENT_QUOTES, 'UTF-8');
        $turno = htmlspecialchars((string)($m['turno'] ?? '-'), ENT_QUOTES, 'UTF-8');
        $hora = htmlspecialchars((string)($m['hora'] ?? '-'), ENT_QUOTES, 'UTF-8');
        $numeroMesa = htmlspecialchars((string)($m['numero_mesa'] ?? '-'), ENT_QUOTES, 'UTF-8');
        $numeroGrupo = (int)($m['numero_grupo'] ?? 0);
        $docente = htmlspecialchars((string)($m['docente'] ?? '-'), ENT_QUOTES, 'UTF-8');
        $grupoHtml = $numeroGrupo > 0 ? '<span style="color:#64748b;font-weight:500;">Grupo ' . $numeroGrupo . '</span>' : '<span style="color:#94a3b8;">-</span>';

        $cursoHtml = $cursoDivision !== '' ? '<div style="font-size:12px;color:#64748b;margin-top:3px;">' . $cursoDivision . '</div>' : '';
        $filasHtml .= '\n          <tr>\n            <td style="padding:12px 10px;border-top:1px solid #e2e8f0;vertical-align:top;">\n              <strong style="color:#111827;">' . $materia . '</strong>' . $cursoHtml . '\n            </td>\n            <td style="padding:12px 10px;border-top:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">' . $fecha . '</td>\n            <td style="padding:12px 10px;border-top:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">' . $turno . '</td>\n            <td style="padding:12px 10px;border-top:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;"><strong>' . $hora . '</strong></td>\n            <td style="padding:12px 10px;border-top:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">Mesa ' . $numeroMesa . '<br>' . $grupoHtml . '</td>\n            <td style="padding:12px 10px;border-top:1px solid #e2e8f0;vertical-align:top;">' . $docente . '</td>\n          </tr>';
    }

    if ($filasHtml === '') {
        $filasHtml = '<tr><td colspan="6" style="padding:14px;color:#64748b;border-top:1px solid #e2e8f0;">No se encontraron materias asignadas.</td></tr>';
    }

    return <<<HTML
<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$subjectHtml}</title>
</head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu mesa de examen ya fue asignada en {$escuelaHtml}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3fb;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid #dbe4f0;border-radius:16px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.08);">
          <tr>
            <td style="background:{$colorPrincipal};padding:24px 28px;">
              <h1 style="margin:0;font-size:23px;line-height:1.25;color:#ffffff;letter-spacing:.2px;">{$escuelaHtml}</h1>
              <p style="margin:7px 0 0;font-size:14px;line-height:1.45;color:rgba(255,255,255,.88);">Notificación de mesas de examen</p>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px 28px;">
              <h2 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#111827;">Tu mesa de examen ya fue asignada</h2>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#374151;">{$mensajeHtml}</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe4f0;border-radius:14px;background:#f8fafc;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:18px 18px 8px;font-size:14px;line-height:1.45;color:#334155;">
                    <strong style="display:inline-block;min-width:84px;color:#111827;">Alumno/a:</strong> {$alumno}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 8px;font-size:14px;line-height:1.45;color:#334155;">
                    <strong style="display:inline-block;min-width:84px;color:#111827;">DNI:</strong> {$dni}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 18px;font-size:14px;line-height:1.45;color:#334155;">
                    <strong style="display:inline-block;min-width:84px;color:#111827;">Email:</strong> {$email}
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe4f0;border-radius:14px;background:#ffffff;overflow:hidden;border-collapse:separate;border-spacing:0;">
                <thead>
                  <tr>
                    <th align="left" style="padding:11px 10px;background:#f1f5f9;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Materia</th>
                    <th align="left" style="padding:11px 10px;background:#f1f5f9;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Fecha</th>
                    <th align="left" style="padding:11px 10px;background:#f1f5f9;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Turno</th>
                    <th align="left" style="padding:11px 10px;background:#f1f5f9;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Hora</th>
                    <th align="left" style="padding:11px 10px;background:#f1f5f9;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Mesa</th>
                    <th align="left" style="padding:11px 10px;background:#f1f5f9;color:#0f172a;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Docente</th>
                  </tr>
                </thead>
                <tbody>{$filasHtml}
                </tbody>
              </table>

              <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Presentate con anticipación en la fecha, turno y hora indicados. Este correo fue generado automáticamente por el sistema de la escuela.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
}

function mesas_notificaciones_enviar_email_mesa(array $item, array $cfg): array
{
    $destino = trim((string)($item['email'] ?? ''));
    if ($destino === '' || filter_var($destino, FILTER_VALIDATE_EMAIL) === false) {
        return ['enviado' => false, 'error' => 'Email inválido.'];
    }

    $materias = json_decode((string)($item['materias_json'] ?? '[]'), true);
    if (!is_array($materias)) $materias = [];

    $escuela = trim((string)($cfg['nombre'] ?? mesas_notificaciones_tenant_nombre()));
    $materiasTexto = implode(', ', array_values(array_filter(array_map(static fn(array $m): string => trim((string)($m['materia'] ?? '')), $materias))));
    $vars = [
        'alumno' => (string)($item['alumno'] ?? ''),
        'dni' => (string)($item['dni'] ?? ''),
        'gmail' => $destino,
        'email' => $destino,
        'escuela' => $escuela,
        'materias' => $materiasTexto,
        'materia' => $materiasTexto,
        'fecha' => date('d/m/Y H:i'),
    ];

    $subject = trim((string)($item['asunto'] ?? ''));
    if ($subject === '') {
        $subject = trim((string)($cfg['asunto_email_mesa'] ?? ''));
    }
    if ($subject === '') $subject = 'Tu mesa de examen ya fue asignada';
    $subject = formulario_render_template($subject, $vars);

    $html = mesas_notificaciones_html_email($item, $materias, $cfg, $subject);

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

function mesas_notificaciones_marcar_detalles_enviados(PDO $pdo, array $materias, ?string $error = null): void
{
    $idsPrevias = array_values(array_filter(array_map(static fn(array $m): int => (int)($m['id_previa'] ?? 0), $materias)));
    if (!$idsPrevias) return;

    $placeholders = implode(',', array_fill(0, count($idsPrevias), '?'));

    if ($error === null) {
        $sql = "\n            UPDATE formulario_inscripciones_detalle\n               SET email_mesa_enviado = 1,\n                   email_mesa_enviado_en = NOW(),\n                   email_mesa_error = NULL,\n                   estado = 'notificada'\n             WHERE id_previa IN ({$placeholders})\n        ";
        $pdo->prepare($sql)->execute($idsPrevias);
        return;
    }

    $sql = "\n        UPDATE formulario_inscripciones_detalle\n           SET email_mesa_error = ?\n         WHERE id_previa IN ({$placeholders})\n    ";
    $params = array_merge([substr($error, 0, 255)], $idsPrevias);
    $pdo->prepare($sql)->execute($params);
}

function mesas_notificaciones_registrar_envios(): void
{
    $pdo = mesas_notificaciones_pdo();
    mesas_notificaciones_asegurar_tablas($pdo);

    $body = request_body();
    $idLote = (int)($body['id_lote'] ?? 0);
    if ($idLote <= 0) {
        $ultimo = mesas_notificaciones_ultimo_lote($pdo);
        $idLote = (int)($ultimo['id_lote'] ?? 0);
    }

    if ($idLote <= 0) {
        json_response(['exito' => false, 'mensaje' => 'No hay un lote de notificaciones preparado.'], 200);
    }

    $batchDefault = max(1, min(50, (int)(env_value('MAIL_MESAS_BATCH_SIZE', '20') ?? '20')));
    $limitRequest = (int)($body['limite'] ?? $batchDefault);
    $limit = max(1, min($batchDefault, $limitRequest > 0 ? $limitRequest : $batchDefault));

    $dailyLimit = max(1, (int)(env_value('MAIL_MESAS_DAILY_LIMIT', '900') ?? '900'));
    $enviadosHoy = mesas_notificaciones_enviados_hoy($pdo);
    $restantesHoy = max(0, $dailyLimit - $enviadosHoy);
    if ($restantesHoy <= 0) {
        json_response([
            'exito' => true,
            'mensaje' => 'Se alcanzó el límite diario configurado para el envío de notificaciones.',
            'data' => [
                'lote' => mesas_notificaciones_recalcular_lote($pdo, $idLote),
                'procesados_en_lote' => 0,
                'limite_diario_alcanzado' => true,
                'limite_diario' => $dailyLimit,
                'enviados_hoy' => $enviadosHoy,
            ],
        ]);
    }

    $limit = min($limit, $restantesHoy);
    $items = mesas_notificaciones_items_lote($pdo, $idLote, $limit);
    if (!$items) {
        json_response([
            'exito' => true,
            'mensaje' => 'No quedan emails pendientes en el lote.',
            'data' => [
                'lote' => mesas_notificaciones_recalcular_lote($pdo, $idLote),
                'procesados_en_lote' => 0,
                'limite_diario_alcanzado' => false,
                'limite_diario' => $dailyLimit,
                'enviados_hoy' => $enviadosHoy,
            ],
        ]);
    }

    $cfg = mesas_notificaciones_config($pdo);
    $stLoteAsunto = $pdo->prepare('SELECT asunto FROM mesas_notificaciones_email_lotes WHERE id_lote = :id_lote LIMIT 1');
    $stLoteAsunto->execute([':id_lote' => $idLote]);
    $asuntoLote = trim((string)($stLoteAsunto->fetchColumn() ?: ''));
    if ($asuntoLote !== '') {
        $cfg['asunto_email_mesa'] = $asuntoLote;
    }
    $procesados = 0;

    $pdo->prepare("\n        UPDATE mesas_notificaciones_email_lotes\n           SET estado = 'enviando', iniciado_en = COALESCE(iniciado_en, NOW())\n         WHERE id_lote = :id_lote\n         LIMIT 1\n    ")->execute([':id_lote' => $idLote]);

    foreach ($items as $item) {
        $idItem = (int)$item['id_item'];
        $pdo->prepare("\n            UPDATE mesas_notificaciones_email_items\n               SET estado = 'enviando', intentos = intentos + 1, actualizado_en = NOW()\n             WHERE id_item = :id_item\n             LIMIT 1\n        ")->execute([':id_item' => $idItem]);

        $materias = json_decode((string)($item['materias_json'] ?? '[]'), true);
        if (!is_array($materias)) $materias = [];

        $resultado = mesas_notificaciones_enviar_email_mesa($item, $cfg);
        $procesados++;

        if (!empty($resultado['enviado'])) {
            $pdo->prepare("\n                UPDATE mesas_notificaciones_email_items\n                   SET estado = 'enviado', ultimo_error = NULL, enviado_en = NOW(), actualizado_en = NOW()\n                 WHERE id_item = :id_item\n                 LIMIT 1\n            ")->execute([':id_item' => $idItem]);
            mesas_notificaciones_marcar_detalles_enviados($pdo, $materias, null);
        } else {
            $error = substr((string)($resultado['error'] ?? 'Error enviando email.'), 0, 255);
            $pdo->prepare("\n                UPDATE mesas_notificaciones_email_items\n                   SET estado = 'error', ultimo_error = :error, actualizado_en = NOW()\n                 WHERE id_item = :id_item\n                 LIMIT 1\n            ")->execute([
                ':error' => $error,
                ':id_item' => $idItem,
            ]);
            mesas_notificaciones_marcar_detalles_enviados($pdo, $materias, $error);
        }
    }

    $lote = mesas_notificaciones_recalcular_lote($pdo, $idLote);

    json_response([
        'exito' => true,
        'mensaje' => $procesados > 0 ? 'Lote procesado correctamente.' : 'No se procesaron emails en este lote.',
        'data' => [
            'lote' => $lote,
            'procesados_en_lote' => $procesados,
            'limite_diario_alcanzado' => false,
            'limite_diario' => $dailyLimit,
            'enviados_hoy' => mesas_notificaciones_enviados_hoy($pdo),
        ],
    ]);
}

function mesas_notificaciones_estado(): void
{
    $pdo = mesas_notificaciones_pdo();
    mesas_notificaciones_asegurar_tablas($pdo);

    $idLote = (int)($_GET['id_lote'] ?? 0);
    if ($idLote <= 0) {
        $ultimo = mesas_notificaciones_ultimo_lote($pdo);
        $idLote = (int)($ultimo['id_lote'] ?? 0);
    }

    $lote = $idLote > 0 ? mesas_notificaciones_recalcular_lote($pdo, $idLote) : [];

    json_response([
        'exito' => true,
        'data' => [
            'lote' => $lote,
        ],
    ]);
}
