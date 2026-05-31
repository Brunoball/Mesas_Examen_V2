<?php
// backend/modules/mesas/historial_mesas/historial_mesas_helpers.php
declare(strict_types=1);

/**
 * Helpers idempotentes para guardar historial académico y snapshots del armado.
 *
 * Tablas históricas usadas desde esta versión:
 * - historial_mesas_armados
 * - historial_mesas_detalle
 * - historial_previas_resultados
 *
 * Las tablas históricas antiguas de grupos/no agrupadas ya no se usan. El backend
 * reconstruye esos datos desde historial_mesas_detalle cuando necesita mostrarlos.
 */

function mesas_historial_ident(string $name): string
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $name)) {
        throw new RuntimeException('Identificador SQL inválido: ' . $name);
    }

    return '`' . $name . '`';
}

function mesas_historial_db_actual(PDO $pdo): string
{
    $db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($db === '') {
        throw new RuntimeException('No hay una base de datos seleccionada para guardar el historial.');
    }
    return $db;
}

function mesas_historial_tabla_existe(PDO $pdo, string $tabla): bool
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.TABLES\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n        LIMIT 1\n    ");
    $stmt->execute([$tabla]);
    return ((int)$stmt->fetchColumn()) > 0;
}

function mesas_historial_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.COLUMNS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n          AND COLUMN_NAME = ?\n        LIMIT 1\n    ");
    $stmt->execute([$tabla, $columna]);
    return ((int)$stmt->fetchColumn()) > 0;
}

function mesas_historial_asegurar_columna(PDO $pdo, string $tabla, string $columna, string $definicion): void
{
    if (!mesas_historial_tabla_existe($pdo, $tabla)) {
        return;
    }

    if (mesas_historial_columna_existe($pdo, $tabla, $columna)) {
        return;
    }

    try {
        $pdo->exec('ALTER TABLE ' . mesas_historial_ident($tabla) . ' ADD COLUMN ' . $definicion);
    } catch (Throwable $e) {
        // Si otra petición creó la columna entre la verificación y el ALTER, no rompemos el guardado.
        if (!mesas_historial_columna_existe($pdo, $tabla, $columna)) {
            throw $e;
        }
    }
}

function mesas_historial_indice_existe(PDO $pdo, string $tabla, string $indice): bool
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.STATISTICS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n          AND INDEX_NAME = ?\n        LIMIT 1\n    ");
    $stmt->execute([$tabla, $indice]);
    return ((int)$stmt->fetchColumn()) > 0;
}

function mesas_historial_asegurar_indice(PDO $pdo, string $tabla, string $indice, string $sqlAlter): void
{
    if (!mesas_historial_tabla_existe($pdo, $tabla) || mesas_historial_indice_existe($pdo, $tabla, $indice)) {
        return;
    }

    try {
        $pdo->exec($sqlAlter);
    } catch (Throwable $e) {
        // Un índice histórico nunca debe impedir guardar una nota ni abrir el historial.
        if (function_exists('log_error')) {
            log_error($e, 'mesas_historial_asegurar_indice:' . $tabla . ':' . $indice);
        }
    }
}

function mesas_historial_eliminar_indice(PDO $pdo, string $tabla, string $indice, bool $obligatorio = false): void
{
    if (!mesas_historial_tabla_existe($pdo, $tabla) || !mesas_historial_indice_existe($pdo, $tabla, $indice)) {
        return;
    }

    try {
        $pdo->exec('ALTER TABLE ' . mesas_historial_ident($tabla) . ' DROP INDEX ' . mesas_historial_ident($indice));
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'mesas_historial_eliminar_indice:' . $tabla . ':' . $indice);
        }

        if ($obligatorio && mesas_historial_indice_existe($pdo, $tabla, $indice)) {
            throw $e;
        }
    }
}

function mesas_historial_asegurar_columna_previa(PDO $pdo, string $columna, string $definicion): void
{
    if (!mesas_historial_tabla_existe($pdo, 'previas')) {
        return;
    }

    if (mesas_historial_columna_existe($pdo, 'previas', $columna)) {
        return;
    }

    try {
        $pdo->exec('ALTER TABLE previas ADD COLUMN ' . $definicion);
    } catch (Throwable $e) {
        if (!mesas_historial_columna_existe($pdo, 'previas', $columna)) {
            throw $e;
        }
    }
}

function mesas_historial_asegurar_columnas_previas_resultado(PDO $pdo): void
{
    // Algunas instalaciones viejas no tienen estas columnas. Se intenta reparar,
    // pero el historial no debe caerse si alguna columna opcional no puede agregarse.
    $columnasPrevias = [
        'nota' => 'nota TINYINT NULL',
        'fecha_nota' => 'fecha_nota DATE NULL',
        'fecha_baja' => 'fecha_baja DATE NULL',
        'motivo_baja' => 'motivo_baja VARCHAR(255) NULL',
    ];

    foreach ($columnasPrevias as $columna => $definicion) {
        try {
            mesas_historial_asegurar_columna_previa($pdo, $columna, $definicion);
        } catch (Throwable $e) {
            if (function_exists('log_error')) {
                log_error($e, 'mesas_historial_asegurar_columna_previa:' . $columna);
            }
        }
    }
}

function mesas_historial_asegurar_tablas(PDO $pdo): void
{
    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS historial_previas_resultados (\n            id_resultado INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            id_previa_original INT NULL,\n            id_mesa INT NULL,\n            numero_mesa INT NULL,\n            numero_grupo INT UNSIGNED NULL,\n            fecha_mesa DATE NULL,\n            id_turno INT NULL,\n            hora TIME NULL,\n            dni VARCHAR(20) NOT NULL DEFAULT '',\n            alumno VARCHAR(150) NOT NULL DEFAULT '',\n            cursando_id_curso INT NULL,\n            cursando_id_division INT NULL,\n            id_materia INT NULL,\n            materia VARCHAR(150) NULL,\n            materia_id_curso INT NULL,\n            materia_id_division INT NULL,\n            id_condicion TINYINT NULL,\n            condicion VARCHAR(80) NULL,\n            id_catedra INT NULL,\n            id_docente INT NULL,\n            docente VARCHAR(150) NULL,\n            tipo_mesa VARCHAR(30) NULL,\n            anio SMALLINT NULL,\n            nota TINYINT NOT NULL,\n            aprobado TINYINT(1) NOT NULL DEFAULT 0,\n            estado_resultado VARCHAR(30) NOT NULL DEFAULT 'desaprobada',\n            fecha_nota DATE NOT NULL,\n            motivo VARCHAR(255) NULL,\n            snapshot_json LONGTEXT NULL,\n            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            PRIMARY KEY (id_resultado)\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS historial_mesas_armados (\n            id_armado_historial INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            codigo_armado VARCHAR(60) NOT NULL,\n            motivo VARCHAR(80) NOT NULL DEFAULT 'eliminacion_armado',\n            total_mesas INT NOT NULL DEFAULT 0,\n            total_previas INT NOT NULL DEFAULT 0,\n            total_grupos INT NOT NULL DEFAULT 0,\n            total_no_agrupadas INT NOT NULL DEFAULT 0,\n            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            PRIMARY KEY (id_armado_historial),\n            UNIQUE KEY uq_historial_codigo_armado (codigo_armado)\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS historial_mesas_detalle (\n            id_historial_detalle INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            id_armado_historial INT UNSIGNED NOT NULL,\n            id_mesa_original INT NULL,\n            numero_mesa INT NULL,\n            numero_grupo INT UNSIGNED NULL,\n            prioridad TINYINT NULL,\n            tipo_mesa VARCHAR(30) NULL,\n            id_taller INT NULL,\n            id_catedra INT NULL,\n            id_previa_original INT NULL,\n            id_docente INT NULL,\n            fecha_mesa DATE NULL,\n            id_turno INT NULL,\n            estado VARCHAR(30) NULL,\n            observacion VARCHAR(255) NULL,\n            dni VARCHAR(20) NULL,\n            alumno VARCHAR(150) NULL,\n            cursando_id_curso INT NULL,\n            cursando_id_division INT NULL,\n            id_materia INT NULL,\n            materia VARCHAR(150) NULL,\n            docente VARCHAR(150) NULL,\n            condicion VARCHAR(80) NULL,\n            materia_id_curso INT NULL,\n            materia_id_division INT NULL,\n            id_condicion TINYINT NULL,\n            nota TINYINT NULL,\n            fecha_nota DATE NULL,\n            inscripcion TINYINT NULL,\n            previa_activa TINYINT(1) NULL,\n            anio SMALLINT NULL,\n            creado_en_original TIMESTAMP NULL,\n            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            PRIMARY KEY (id_historial_detalle)\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    mesas_historial_asegurar_columnas_previas_resultado($pdo);

    // Reparación de columnas faltantes si una versión anterior creó tablas incompletas.
    $columnas = [
        'historial_previas_resultados' => [
            'id_previa_original' => 'id_previa_original INT NULL',
            'id_mesa' => 'id_mesa INT NULL',
            'numero_mesa' => 'numero_mesa INT NULL',
            'numero_grupo' => 'numero_grupo INT UNSIGNED NULL',
            'fecha_mesa' => 'fecha_mesa DATE NULL',
            'id_turno' => 'id_turno INT NULL',
            'hora' => 'hora TIME NULL',
            'dni' => "dni VARCHAR(20) NOT NULL DEFAULT ''",
            'alumno' => "alumno VARCHAR(150) NOT NULL DEFAULT ''",
            'cursando_id_curso' => 'cursando_id_curso INT NULL',
            'cursando_id_division' => 'cursando_id_division INT NULL',
            'id_materia' => 'id_materia INT NULL',
            'materia' => 'materia VARCHAR(150) NULL',
            'materia_id_curso' => 'materia_id_curso INT NULL',
            'materia_id_division' => 'materia_id_division INT NULL',
            'id_condicion' => 'id_condicion TINYINT NULL',
            'condicion' => 'condicion VARCHAR(80) NULL',
            'id_catedra' => 'id_catedra INT NULL',
            'id_docente' => 'id_docente INT NULL',
            'docente' => 'docente VARCHAR(150) NULL',
            'tipo_mesa' => 'tipo_mesa VARCHAR(30) NULL',
            'anio' => 'anio SMALLINT NULL',
            'nota' => 'nota TINYINT NOT NULL DEFAULT 0',
            'aprobado' => 'aprobado TINYINT(1) NOT NULL DEFAULT 0',
            'estado_resultado' => "estado_resultado VARCHAR(30) NOT NULL DEFAULT 'desaprobada'",
            'fecha_nota' => "fecha_nota DATE NOT NULL DEFAULT '2025-01-01'",
            'motivo' => 'motivo VARCHAR(255) NULL',
            'snapshot_json' => 'snapshot_json LONGTEXT NULL',
            'creado_en' => 'creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ],
        'historial_mesas_armados' => [
            'codigo_armado' => 'codigo_armado VARCHAR(60) NOT NULL DEFAULT ""',
            'motivo' => "motivo VARCHAR(80) NOT NULL DEFAULT 'eliminacion_armado'",
            'total_mesas' => 'total_mesas INT NOT NULL DEFAULT 0',
            'total_previas' => 'total_previas INT NOT NULL DEFAULT 0',
            'total_grupos' => 'total_grupos INT NOT NULL DEFAULT 0',
            'total_no_agrupadas' => 'total_no_agrupadas INT NOT NULL DEFAULT 0',
            'creado_en' => 'creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ],
        'historial_mesas_detalle' => [
            'id_armado_historial' => 'id_armado_historial INT UNSIGNED NOT NULL DEFAULT 0',
            'id_mesa_original' => 'id_mesa_original INT NULL',
            'numero_mesa' => 'numero_mesa INT NULL',
            'numero_grupo' => 'numero_grupo INT UNSIGNED NULL',
            'prioridad' => 'prioridad TINYINT NULL',
            'tipo_mesa' => 'tipo_mesa VARCHAR(30) NULL',
            'id_taller' => 'id_taller INT NULL',
            'id_catedra' => 'id_catedra INT NULL',
            'id_previa_original' => 'id_previa_original INT NULL',
            'id_docente' => 'id_docente INT NULL',
            'fecha_mesa' => 'fecha_mesa DATE NULL',
            'id_turno' => 'id_turno INT NULL',
            'estado' => 'estado VARCHAR(30) NULL',
            'observacion' => 'observacion VARCHAR(255) NULL',
            'dni' => 'dni VARCHAR(20) NULL',
            'alumno' => 'alumno VARCHAR(150) NULL',
            'cursando_id_curso' => 'cursando_id_curso INT NULL',
            'cursando_id_division' => 'cursando_id_division INT NULL',
            'id_materia' => 'id_materia INT NULL',
            'materia' => 'materia VARCHAR(150) NULL',
            'docente' => 'docente VARCHAR(150) NULL',
            'condicion' => 'condicion VARCHAR(80) NULL',
            'materia_id_curso' => 'materia_id_curso INT NULL',
            'materia_id_division' => 'materia_id_division INT NULL',
            'id_condicion' => 'id_condicion TINYINT NULL',
            'nota' => 'nota TINYINT NULL',
            'fecha_nota' => 'fecha_nota DATE NULL',
            'inscripcion' => 'inscripcion TINYINT NULL',
            'previa_activa' => 'previa_activa TINYINT(1) NULL',
            'anio' => 'anio SMALLINT NULL',
            'creado_en_original' => 'creado_en_original TIMESTAMP NULL',
            'creado_en' => 'creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ],
    ];

    foreach ($columnas as $tabla => $cols) {
        foreach ($cols as $columna => $definicion) {
            try {
                mesas_historial_asegurar_columna($pdo, $tabla, $columna, $definicion);
            } catch (Throwable $e) {
                // No dejamos que una reparación secundaria corte el guardado/listado.
                if (function_exists('log_error')) {
                    log_error($e, 'mesas_historial_asegurar_columna:' . $tabla . ':' . $columna);
                }
            }
        }
    }

    // Versiones anteriores tenían este UNIQUE por previa + número + fecha.
    // Eso rompe cuando el mismo alumno rinde la misma previa en otro armado
    // con la misma fecha/número de mesa: debe crearse otro historial.
    // La edición de una nota se identifica por id_mesa, no por id_previa sola.
    mesas_historial_eliminar_indice($pdo, 'historial_previas_resultados', 'uq_resultado_previa_mesa', true);

    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_previa', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_previa (id_previa_original)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_dni', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_dni (dni)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_alumno', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_alumno (alumno)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_materia', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_materia (id_materia)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_aprobado', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_aprobado (aprobado)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_fecha', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_fecha (fecha_nota)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_mesa', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_mesa (numero_mesa, numero_grupo)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_previa_id_mesa', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_previa_id_mesa (id_previa_original, id_mesa)');
    mesas_historial_asegurar_indice($pdo, 'historial_previas_resultados', 'idx_resultado_contexto_mesa', 'ALTER TABLE historial_previas_resultados ADD INDEX idx_resultado_contexto_mesa (id_previa_original, numero_mesa, fecha_mesa, id_turno, id_catedra)');

    mesas_historial_asegurar_indice($pdo, 'historial_mesas_armados', 'idx_historial_armados_fecha', 'ALTER TABLE historial_mesas_armados ADD INDEX idx_historial_armados_fecha (creado_en)');
    mesas_historial_asegurar_indice($pdo, 'historial_mesas_armados', 'idx_historial_armados_motivo', 'ALTER TABLE historial_mesas_armados ADD INDEX idx_historial_armados_motivo (motivo)');

    mesas_historial_asegurar_indice($pdo, 'historial_mesas_detalle', 'idx_hist_detalle_armado', 'ALTER TABLE historial_mesas_detalle ADD INDEX idx_hist_detalle_armado (id_armado_historial)');
    mesas_historial_asegurar_indice($pdo, 'historial_mesas_detalle', 'idx_hist_detalle_previa', 'ALTER TABLE historial_mesas_detalle ADD INDEX idx_hist_detalle_previa (id_previa_original)');
    mesas_historial_asegurar_indice($pdo, 'historial_mesas_detalle', 'idx_hist_detalle_dni', 'ALTER TABLE historial_mesas_detalle ADD INDEX idx_hist_detalle_dni (dni)');
    mesas_historial_asegurar_indice($pdo, 'historial_mesas_detalle', 'idx_hist_detalle_mesa', 'ALTER TABLE historial_mesas_detalle ADD INDEX idx_hist_detalle_mesa (numero_mesa, numero_grupo)');
    mesas_historial_asegurar_indice($pdo, 'historial_mesas_detalle', 'idx_hist_detalle_fecha_turno', 'ALTER TABLE historial_mesas_detalle ADD INDEX idx_hist_detalle_fecha_turno (fecha_mesa, id_turno)');
    mesas_historial_asegurar_indice($pdo, 'historial_mesas_detalle', 'idx_hist_detalle_materia', 'ALTER TABLE historial_mesas_detalle ADD INDEX idx_hist_detalle_materia (id_materia)');
}

function mesas_historial_fecha_hoy(): string
{
    return (new DateTimeImmutable('today'))->format('Y-m-d');
}

function mesas_historial_json(array $data): string
{
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $json === false ? '{}' : $json;
}


/**
 * Limpia el resultado temporal de las previas desaprobadas del armado operativo actual.
 *
 * Importante:
 * - Se llama DESPUÉS de guardar la foto en historial_mesas_detalle.
 * - Solo toca previas que todavía están dentro de la tabla mesas actual.
 * - Las notas 1 a 6 ya quedan guardadas en historial_previas_resultados / historial_mesas_detalle.
 * - La previa queda activa para que vuelva a entrar en próximos armados.
 */

/**
 * Elimina del historial de resultados las notas cargadas para el armado operativo actual.
 *
 * Se usa cuando el usuario elige eliminar mesas SIN guardar historial: la previa aprobada
 * puede quedar dada de baja en `previas`, pero las notas no deben quedar como registros
 * históricos sueltos sin un armado que las contenga.
 */
function mesas_historial_eliminar_resultados_armado_actual(PDO $pdo): int
{
    if (!mesas_historial_tabla_existe($pdo, 'historial_previas_resultados') || !mesas_historial_tabla_existe($pdo, 'mesas')) {
        return 0;
    }

    $eliminados = 0;

    // Caso normal actual: el historial de nota queda vinculado al id_mesa real.
    $stmt = $pdo->prepare("
        DELETE h
        FROM historial_previas_resultados h
        INNER JOIN mesas me ON me.id_mesa = h.id_mesa
    ");
    $stmt->execute();
    $eliminados += (int)$stmt->rowCount();

    // Respaldo para registros viejos que pudieron guardarse sin id_mesa.
    // Se limita al mismo contexto exacto de la mesa actual para no borrar históricos reales.
    $stmtFallback = $pdo->prepare("
        DELETE h
        FROM historial_previas_resultados h
        INNER JOIN mesas me ON me.id_previa = h.id_previa_original
            AND (h.id_mesa IS NULL OR h.id_mesa = 0)
            AND h.numero_mesa <=> me.numero_mesa
            AND h.fecha_mesa <=> me.fecha_mesa
            AND h.id_turno <=> me.id_turno
            AND (
                h.id_catedra <=> me.id_catedra
                OR h.id_docente <=> me.id_docente
            )
    ");
    $stmtFallback->execute();
    $eliminados += (int)$stmtFallback->rowCount();

    return $eliminados;
}


/**
 * Cuando el usuario elimina mesas SIN guardar historial, una previa aprobada debe quedar
 * dada de baja, pero la nota cargada no debe quedar guardada como dato histórico.
 */
function mesas_historial_limpiar_notas_aprobadas_sin_historial_armado_actual(PDO $pdo): int
{
    if (!mesas_historial_columna_existe($pdo, 'previas', 'nota')) {
        return 0;
    }

    $sets = [
        'p.nota = NULL',
        'p.activo = 0',
    ];

    if (mesas_historial_columna_existe($pdo, 'previas', 'fecha_nota')) {
        $sets[] = 'p.fecha_nota = NULL';
    }

    if (mesas_historial_columna_existe($pdo, 'previas', 'motivo_baja')) {
        $sets[] = "p.motivo_baja = 'Aprobada en mesa de examen.'";
    }

    $sql = "
        UPDATE previas p
        INNER JOIN (
            SELECT DISTINCT id_previa
            FROM mesas
            WHERE id_previa IS NOT NULL
        ) me ON me.id_previa = p.id_previa
        SET " . implode(', ', $sets) . "
        WHERE p.nota IS NOT NULL
          AND p.nota >= 7
    ";

    return (int)$pdo->exec($sql);
}

function mesas_historial_limpiar_notas_desaprobadas_armado_actual(PDO $pdo): int
{
    if (!mesas_historial_columna_existe($pdo, 'previas', 'nota')) {
        return 0;
    }

    $sets = [
        'p.nota = NULL',
        'p.activo = 1',
    ];

    if (mesas_historial_columna_existe($pdo, 'previas', 'fecha_nota')) {
        $sets[] = 'p.fecha_nota = NULL';
    }

    if (mesas_historial_columna_existe($pdo, 'previas', 'fecha_baja')) {
        $sets[] = 'p.fecha_baja = NULL';
    }

    if (mesas_historial_columna_existe($pdo, 'previas', 'motivo_baja')) {
        $sets[] = 'p.motivo_baja = NULL';
    }

    $sql = "
        UPDATE previas p
        INNER JOIN (
            SELECT DISTINCT id_previa
            FROM mesas
            WHERE id_previa IS NOT NULL
        ) me ON me.id_previa = p.id_previa
        SET " . implode(', ', $sets) . "
        WHERE p.nota IS NOT NULL
          AND p.nota <= 6
    ";

    return (int)$pdo->exec($sql);
}

function mesas_historial_crear_armado_actual(PDO $pdo, string $motivo = 'eliminacion_armado'): ?int
{
    mesas_historial_asegurar_tablas($pdo);

    $totalMesas = (int)$pdo->query('SELECT COUNT(*) FROM mesas')->fetchColumn();
    $totalGrupos = 0;
    $totalNoAgrupadas = 0;

    try {
        $totalGrupos = (int)$pdo->query('SELECT COUNT(DISTINCT numero_grupo) FROM mesas_grupos')->fetchColumn();
    } catch (Throwable $e) {
        $totalGrupos = 0;
    }

    try {
        $totalNoAgrupadas = (int)$pdo->query('SELECT COUNT(*) FROM mesas_no_agrupadas')->fetchColumn();
    } catch (Throwable $e) {
        $totalNoAgrupadas = 0;
    }

    if ($totalMesas <= 0 && $totalGrupos <= 0 && $totalNoAgrupadas <= 0) {
        return null;
    }

    $totalPrevias = (int)$pdo->query('SELECT COUNT(DISTINCT id_previa) FROM mesas WHERE id_previa IS NOT NULL')->fetchColumn();
    $codigo = 'ARM-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(4)), 0, 8);

    $stmtArmado = $pdo->prepare("\n        INSERT INTO historial_mesas_armados (codigo_armado, motivo, total_mesas, total_previas, total_grupos, total_no_agrupadas)\n        VALUES (:codigo_armado, :motivo, :total_mesas, :total_previas, :total_grupos, :total_no_agrupadas)\n    ");
    $stmtArmado->execute([
        ':codigo_armado' => $codigo,
        ':motivo' => $motivo,
        ':total_mesas' => $totalMesas,
        ':total_previas' => $totalPrevias,
        ':total_grupos' => $totalGrupos,
        ':total_no_agrupadas' => $totalNoAgrupadas,
    ]);

    $idHistorial = (int)$pdo->lastInsertId();

    $stmtDetalle = $pdo->prepare("\n        INSERT INTO historial_mesas_detalle (\n            id_armado_historial, id_mesa_original, numero_mesa, numero_grupo, prioridad, tipo_mesa,\n            id_taller, id_catedra, id_previa_original, id_docente, fecha_mesa, id_turno, estado, observacion,\n            dni, alumno, cursando_id_curso, cursando_id_division, id_materia, materia, docente, condicion,\n            materia_id_curso, materia_id_division, id_condicion, nota, fecha_nota, inscripcion, previa_activa, anio, creado_en_original\n        )\n        SELECT\n            :id_armado_historial, me.id_mesa, me.numero_mesa, g.numero_grupo, me.prioridad, me.tipo_mesa,\n            me.id_taller, me.id_catedra, me.id_previa, COALESCE(NULLIF(me.id_docente, 0), cat.id_docente), me.fecha_mesa, me.id_turno, me.estado, me.observacion,\n            p.dni, p.alumno, p.cursando_id_curso, p.cursando_id_division, COALESCE(cat.id_materia, p.id_materia), mat.materia, doc.docente, con.condicion,\n            COALESCE(cat.id_curso, p.materia_id_curso), COALESCE(cat.id_division, p.materia_id_division),\n            p.id_condicion, p.nota, p.fecha_nota, p.inscripcion, p.activo, p.anio, me.creado_en\n        FROM mesas me\n        LEFT JOIN previas p ON p.id_previa = me.id_previa\n        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)\n        LEFT JOIN condicion con ON con.id_condicion = p.id_condicion\n        LEFT JOIN docentes doc ON doc.id_docente = COALESCE(NULLIF(me.id_docente, 0), cat.id_docente)\n        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa\n    ");
    $stmtDetalle->execute([':id_armado_historial' => $idHistorial]);

    return $idHistorial;
}
