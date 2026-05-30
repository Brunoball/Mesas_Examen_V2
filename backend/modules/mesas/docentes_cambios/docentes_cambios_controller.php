<?php
// backend/modules/mesas/docentes_cambios/docentes_cambios_controller.php
declare(strict_types=1);

/**
 * Controlador + utilidades de avisos de cambios de docente.
 *
 * Está todo en este archivo para evitar falsos errores del editor/IntelliSense
 * por funciones declaradas en otro helper, y para que el módulo sea más fácil
 * de copiar a Hostinger sin dependencias cruzadas raras.
 */


/**
 * Avisos de cambios de docente en cátedras que ya tienen mesas armadas.
 *
 * IMPORTANTE:
 * - Esta tabla vive en la DB tenant/colegio, no en la DB master.
 * - El sistema repara la estructura si ya existía una versión vieja de la tabla
 *   creada manualmente, porque CREATE TABLE IF NOT EXISTS no agrega columnas faltantes.
 */
function mesas_docentes_cambios_asegurar_tabla(PDO $pdo): void
{
    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS mesas_docente_cambios_pendientes (\n            id_cambio INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            id_catedra INT NOT NULL,\n            numero_mesa INT NULL,\n            numero_grupo INT UNSIGNED NULL,\n            id_docente_anterior INT NULL,\n            id_docente_nuevo INT NULL,\n            id_docente_en_mesa INT NULL,\n            fecha_mesa DATE NULL,\n            id_turno INT NULL,\n            materia VARCHAR(180) COLLATE utf8mb4_unicode_ci NULL,\n            docente_anterior VARCHAR(180) COLLATE utf8mb4_unicode_ci NULL,\n            docente_nuevo VARCHAR(180) COLLATE utf8mb4_unicode_ci NULL,\n            estado ENUM('pendiente','resuelto','ignorado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',\n            origen VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'catedras_asignar_docente',\n            observacion VARCHAR(255) COLLATE utf8mb4_unicode_ci NULL,\n            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            actualizado_en TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,\n            resuelto_en TIMESTAMP NULL DEFAULT NULL,\n            PRIMARY KEY (id_cambio)\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    mesas_docentes_cambios_reparar_tabla($pdo);
}

function mesas_docentes_cambios_database(PDO $pdo): string
{
    return (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
}

function mesas_docentes_cambios_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.COLUMNS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = :tabla\n          AND COLUMN_NAME = :columna\n    ");
    $stmt->execute([
        ':tabla' => $tabla,
        ':columna' => $columna,
    ]);

    return (int)$stmt->fetchColumn() > 0;
}

function mesas_docentes_cambios_indice_existe(PDO $pdo, string $tabla, string $indice): bool
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.STATISTICS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = :tabla\n          AND INDEX_NAME = :indice\n    ");
    $stmt->execute([
        ':tabla' => $tabla,
        ':indice' => $indice,
    ]);

    return (int)$stmt->fetchColumn() > 0;
}

function mesas_docentes_cambios_agregar_columna_si_falta(PDO $pdo, string $columna, string $definicion): void
{
    if (!mesas_docentes_cambios_columna_existe($pdo, 'mesas_docente_cambios_pendientes', $columna)) {
        $pdo->exec("ALTER TABLE mesas_docente_cambios_pendientes ADD COLUMN {$columna} {$definicion}");
    }
}

function mesas_docentes_cambios_agregar_indice_si_falta(PDO $pdo, string $indice, string $definicion): void
{
    if (!mesas_docentes_cambios_indice_existe($pdo, 'mesas_docente_cambios_pendientes', $indice)) {
        $pdo->exec("ALTER TABLE mesas_docente_cambios_pendientes ADD {$definicion}");
    }
}

function mesas_docentes_cambios_eliminar_indice_si_existe(PDO $pdo, string $indice): void
{
    if (mesas_docentes_cambios_indice_existe($pdo, 'mesas_docente_cambios_pendientes', $indice)) {
        $pdo->exec("ALTER TABLE mesas_docente_cambios_pendientes DROP INDEX {$indice}");
    }
}

/**
 * Repara tablas creadas con la versión anterior del SQL.
 * El problema principal era que la tabla podía existir con columnas como id_grupo,
 * docente_anterior_nombre, docente_nuevo_nombre o materia_nombre, pero el backend
 * nuevo intentaba insertar numero_grupo, docente_anterior, docente_nuevo y materia.
 */
function mesas_docentes_cambios_reparar_tabla(PDO $pdo): void
{
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'id_catedra', 'INT NOT NULL DEFAULT 0');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'numero_mesa', 'INT NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'numero_grupo', 'INT UNSIGNED NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'id_docente_anterior', 'INT NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'id_docente_nuevo', 'INT NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'id_docente_en_mesa', 'INT NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'fecha_mesa', 'DATE NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'id_turno', 'INT NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'materia', 'VARCHAR(180) COLLATE utf8mb4_unicode_ci NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'docente_anterior', 'VARCHAR(180) COLLATE utf8mb4_unicode_ci NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'docente_nuevo', 'VARCHAR(180) COLLATE utf8mb4_unicode_ci NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'estado', "ENUM('pendiente','resuelto','ignorado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente'");
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'origen', "VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'catedras_asignar_docente'");
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'observacion', 'VARCHAR(255) COLLATE utf8mb4_unicode_ci NULL');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'creado_en', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'actualizado_en', 'TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP');
    mesas_docentes_cambios_agregar_columna_si_falta($pdo, 'resuelto_en', 'TIMESTAMP NULL DEFAULT NULL');

    // Compatibilidad con la tabla que se había indicado manualmente al principio.
    if (mesas_docentes_cambios_columna_existe($pdo, 'mesas_docente_cambios_pendientes', 'id_grupo')) {
        $pdo->exec("\n            UPDATE mesas_docente_cambios_pendientes\n            SET numero_grupo = COALESCE(numero_grupo, id_grupo)\n            WHERE numero_grupo IS NULL\n        ");
    }

    if (mesas_docentes_cambios_columna_existe($pdo, 'mesas_docente_cambios_pendientes', 'materia_nombre')) {
        $pdo->exec("\n            UPDATE mesas_docente_cambios_pendientes\n            SET materia = COALESCE(materia, materia_nombre)\n            WHERE materia IS NULL\n        ");
    }

    if (mesas_docentes_cambios_columna_existe($pdo, 'mesas_docente_cambios_pendientes', 'docente_anterior_nombre')) {
        $pdo->exec("\n            UPDATE mesas_docente_cambios_pendientes\n            SET docente_anterior = COALESCE(docente_anterior, docente_anterior_nombre)\n            WHERE docente_anterior IS NULL\n        ");
    }

    if (mesas_docentes_cambios_columna_existe($pdo, 'mesas_docente_cambios_pendientes', 'docente_nuevo_nombre')) {
        $pdo->exec("\n            UPDATE mesas_docente_cambios_pendientes\n            SET docente_nuevo = COALESCE(docente_nuevo, docente_nuevo_nombre)\n            WHERE docente_nuevo IS NULL\n        ");
    }

    // Este índice único bloqueaba más de un número de mesa para la misma cátedra.
    // Lo eliminamos porque el backend ya actualiza el pendiente existente por cátedra+número.
    mesas_docentes_cambios_eliminar_indice_si_existe($pdo, 'uq_cambio_pendiente_catedra');

    mesas_docentes_cambios_agregar_indice_si_falta($pdo, 'idx_estado', 'INDEX idx_estado (estado)');
    mesas_docentes_cambios_agregar_indice_si_falta($pdo, 'idx_numero_mesa', 'INDEX idx_numero_mesa (numero_mesa)');
    mesas_docentes_cambios_agregar_indice_si_falta($pdo, 'idx_numero_grupo', 'INDEX idx_numero_grupo (numero_grupo)');
    mesas_docentes_cambios_agregar_indice_si_falta($pdo, 'idx_catedra_estado', 'INDEX idx_catedra_estado (id_catedra, estado)');
    mesas_docentes_cambios_agregar_indice_si_falta($pdo, 'idx_fecha_turno', 'INDEX idx_fecha_turno (fecha_mesa, id_turno)');
}

function mesas_docentes_cambios_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function mesas_docentes_cambios_body(): array
{
    if (function_exists('get_json_body')) {
        $body = get_json_body();
        if (is_array($body)) {
            return $body;
        }
    }

    if (function_exists('request_body')) {
        $body = request_body();
        if (is_array($body)) {
            return $body;
        }
    }

    $raw = file_get_contents('php://input');
    $json = json_decode((string)$raw, true);
    return is_array($json) ? $json : [];
}

function mesas_docentes_cambios_nombre_docente(PDO $pdo, ?int $idDocente): string
{
    if ($idDocente === null || $idDocente <= 0) {
        return 'Sin docente';
    }

    $stmt = $pdo->prepare('SELECT docente FROM docentes WHERE id_docente = ? LIMIT 1');
    $stmt->execute([$idDocente]);
    $nombre = trim((string)($stmt->fetchColumn() ?: ''));
    return $nombre !== '' ? $nombre : 'Docente #' . $idDocente;
}

function mesas_docentes_cambios_debe_omitir_por_estado_previo(PDO $pdo, int $idCatedra, int $numeroMesa, ?int $idDocenteEnMesa, ?int $idDocenteNuevo): bool
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM mesas_docente_cambios_pendientes\n        WHERE id_catedra = :id_catedra\n          AND numero_mesa = :numero_mesa\n          AND estado IN ('ignorado', 'resuelto')\n          AND COALESCE(id_docente_en_mesa, 0) = COALESCE(:id_docente_en_mesa, 0)\n          AND COALESCE(id_docente_nuevo, 0) = COALESCE(:id_docente_nuevo, 0)\n    ");
    $stmt->execute([
        ':id_catedra' => $idCatedra,
        ':numero_mesa' => $numeroMesa,
        ':id_docente_en_mesa' => $idDocenteEnMesa,
        ':id_docente_nuevo' => $idDocenteNuevo,
    ]);

    return (int)$stmt->fetchColumn() > 0;
}

function mesas_docentes_cambios_guardar_pendiente(PDO $pdo, array $fila, ?int $idDocenteAnterior, ?int $idDocenteNuevo, string $origen): int
{
    $idCatedra = (int)($fila['id_catedra'] ?? 0);
    $numeroMesa = (int)($fila['numero_mesa'] ?? 0);

    if ($idCatedra <= 0 || $numeroMesa <= 0) {
        return 0;
    }

    $idDocenteEnMesa = isset($fila['id_docente_en_mesa']) && $fila['id_docente_en_mesa'] !== null
        ? (int)$fila['id_docente_en_mesa']
        : null;

    $numeroGrupo = isset($fila['numero_grupo']) && $fila['numero_grupo'] !== null ? (int)$fila['numero_grupo'] : null;
    $fechaMesa = $fila['fecha_mesa'] ?? null;
    $idTurno = isset($fila['id_turno']) && $fila['id_turno'] !== null ? (int)$fila['id_turno'] : null;
    $materia = trim((string)($fila['materia'] ?? ''));
    $docenteAnteriorNombre = mesas_docentes_cambios_nombre_docente($pdo, $idDocenteAnterior);
    $docenteNuevoNombre = mesas_docentes_cambios_nombre_docente($pdo, $idDocenteNuevo);
    $observacion = 'El docente de la cátedra cambió después de armar mesas. Revisar número de mesa.';

    $stmtExistente = $pdo->prepare("\n        SELECT id_cambio\n        FROM mesas_docente_cambios_pendientes\n        WHERE id_catedra = :id_catedra\n          AND numero_mesa = :numero_mesa\n          AND estado = 'pendiente'\n        ORDER BY id_cambio DESC\n        LIMIT 1\n    ");
    $stmtExistente->execute([
        ':id_catedra' => $idCatedra,
        ':numero_mesa' => $numeroMesa,
    ]);
    $idExistente = (int)($stmtExistente->fetchColumn() ?: 0);

    $params = [
        ':id_catedra' => $idCatedra,
        ':numero_mesa' => $numeroMesa,
        ':numero_grupo' => $numeroGrupo,
        ':id_docente_anterior' => $idDocenteAnterior,
        ':id_docente_nuevo' => $idDocenteNuevo,
        ':id_docente_en_mesa' => $idDocenteEnMesa,
        ':fecha_mesa' => $fechaMesa,
        ':id_turno' => $idTurno,
        ':materia' => $materia !== '' ? $materia : null,
        ':docente_anterior' => $docenteAnteriorNombre,
        ':docente_nuevo' => $docenteNuevoNombre,
        ':origen' => $origen,
        ':observacion' => $observacion,
    ];

    if ($idExistente > 0) {
        $stmtUpdate = $pdo->prepare("\n            UPDATE mesas_docente_cambios_pendientes\n            SET\n                numero_grupo = :numero_grupo,\n                id_docente_anterior = :id_docente_anterior,\n                id_docente_nuevo = :id_docente_nuevo,\n                id_docente_en_mesa = :id_docente_en_mesa,\n                fecha_mesa = :fecha_mesa,\n                id_turno = :id_turno,\n                materia = :materia,\n                docente_anterior = :docente_anterior,\n                docente_nuevo = :docente_nuevo,\n                origen = :origen,\n                observacion = :observacion,\n                actualizado_en = NOW(),\n                resuelto_en = NULL\n            WHERE id_cambio = :id_cambio\n        ");
        $stmtUpdate->execute($params + [':id_cambio' => $idExistente]);
        return 1;
    }

    $stmtInsert = $pdo->prepare("\n        INSERT INTO mesas_docente_cambios_pendientes (\n            id_catedra, numero_mesa, numero_grupo, id_docente_anterior, id_docente_nuevo,\n            id_docente_en_mesa, fecha_mesa, id_turno, materia, docente_anterior, docente_nuevo,\n            estado, origen, observacion\n        ) VALUES (\n            :id_catedra, :numero_mesa, :numero_grupo, :id_docente_anterior, :id_docente_nuevo,\n            :id_docente_en_mesa, :fecha_mesa, :id_turno, :materia, :docente_anterior, :docente_nuevo,\n            'pendiente', :origen, :observacion\n        )\n    ");
    $stmtInsert->execute($params);

    return 1;
}

/**
 * Se llama desde Cátedras después de cambiar el docente.
 * Si la cátedra aparece dentro de un número de mesa actual, deja un registro pendiente.
 */
function mesas_docentes_cambios_registrar_catedra_actualizada(PDO $pdo, int $idCatedra, ?int $idDocenteAnterior, ?int $idDocenteNuevo): int
{
    if ($idCatedra <= 0) {
        return 0;
    }

    $anteriorNormalizado = $idDocenteAnterior !== null && $idDocenteAnterior > 0 ? $idDocenteAnterior : null;
    $nuevoNormalizado = $idDocenteNuevo !== null && $idDocenteNuevo > 0 ? $idDocenteNuevo : null;

    if ($anteriorNormalizado === $nuevoNormalizado) {
        return 0;
    }

    mesas_docentes_cambios_asegurar_tabla($pdo);

    $stmtMesas = $pdo->prepare("\n        SELECT\n            me.id_catedra,\n            me.numero_mesa,\n            MIN(me.id_docente) AS id_docente_en_mesa,\n            MIN(me.fecha_mesa) AS fecha_mesa,\n            MIN(me.id_turno) AS id_turno,\n            MIN(g.numero_grupo) AS numero_grupo,\n            MAX(m.materia) AS materia\n        FROM mesas me\n        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa\n        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias m ON m.id_materia = cat.id_materia\n        WHERE me.id_catedra = :id_catedra\n          AND me.numero_mesa IS NOT NULL\n        GROUP BY me.id_catedra, me.numero_mesa\n        ORDER BY me.numero_mesa ASC\n    ");
    $stmtMesas->execute([':id_catedra' => $idCatedra]);
    $filas = $stmtMesas->fetchAll(PDO::FETCH_ASSOC) ?: [];

    if (count($filas) === 0) {
        return 0;
    }

    $afectados = 0;
    foreach ($filas as $fila) {
        $idDocenteEnMesa = isset($fila['id_docente_en_mesa']) && $fila['id_docente_en_mesa'] !== null
            ? (int)$fila['id_docente_en_mesa']
            : null;

        // Si la mesa ya tiene el docente nuevo, no hace falta avisar.
        if ($idDocenteEnMesa === $nuevoNormalizado) {
            continue;
        }

        $afectados += mesas_docentes_cambios_guardar_pendiente(
            $pdo,
            $fila,
            $anteriorNormalizado,
            $nuevoNormalizado,
            'catedras_asignar_docente'
        );
    }

    return $afectados;
}

/**
 * Respaldo automático: al entrar a Mesas, escanea si hay números donde el docente
 * guardado en mesas quedó distinto del docente actual de la cátedra. Esto recupera
 * casos donde el aviso no se llegó a insertar por una tabla vieja o por una carga anterior.
 */
function mesas_docentes_cambios_registrar_diferencias_actuales(PDO $pdo): int
{
    mesas_docentes_cambios_asegurar_tabla($pdo);

    $stmt = $pdo->query("\n        SELECT\n            me.id_catedra,\n            me.numero_mesa,\n            MIN(me.id_docente) AS id_docente_en_mesa,\n            COALESCE(cd.id_docente, cat.id_docente) AS id_docente_actual_catedra,\n            MIN(me.fecha_mesa) AS fecha_mesa,\n            MIN(me.id_turno) AS id_turno,\n            MIN(g.numero_grupo) AS numero_grupo,\n            MAX(m.materia) AS materia\n        FROM mesas me\n        INNER JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN catedras_docentes cd\n            ON cd.id_catedra = cat.id_catedra\n           AND cd.activo = 1\n           AND cd.id_catedra_docente = (\n                SELECT cd3.id_catedra_docente\n                FROM catedras_docentes cd3\n                LEFT JOIN docentes d3 ON d3.id_docente = cd3.id_docente\n                LEFT JOIN cargos cargo3 ON cargo3.id_cargo = cd3.id_cargo\n                WHERE cd3.id_catedra = cat.id_catedra\n                  AND cd3.activo = 1\n                ORDER BY\n                    CASE\n                        WHEN d3.activo = 1 AND (cd3.id_cargo = 2 OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'SUPLENTE') THEN 0\n                        WHEN d3.activo = 1 AND d3.id_docente IS NOT NULL THEN 1\n                        ELSE 2\n                    END ASC,\n                    cd3.id_catedra_docente ASC\n                LIMIT 1\n           )\n        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa\n        LEFT JOIN materias m ON m.id_materia = cat.id_materia\n        WHERE me.id_catedra IS NOT NULL\n          AND me.numero_mesa IS NOT NULL\n          AND COALESCE(me.id_docente, 0) <> COALESCE(cd.id_docente, cat.id_docente, 0)\n        GROUP BY me.id_catedra, me.numero_mesa, COALESCE(cd.id_docente, cat.id_docente)\n        ORDER BY me.numero_mesa ASC\n    ");

    $filas = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $afectados = 0;

    foreach ($filas as $fila) {
        $idDocenteEnMesa = isset($fila['id_docente_en_mesa']) && $fila['id_docente_en_mesa'] !== null
            ? (int)$fila['id_docente_en_mesa']
            : null;
        $idDocenteActual = isset($fila['id_docente_actual_catedra']) && $fila['id_docente_actual_catedra'] !== null
            ? (int)$fila['id_docente_actual_catedra']
            : null;

        $afectados += mesas_docentes_cambios_guardar_pendiente(
            $pdo,
            $fila,
            $idDocenteEnMesa,
            $idDocenteActual,
            'scan_mesas_vs_catedras'
        );
    }

    return $afectados;
}

function mesas_docentes_cambios_listar_pendientes_data(PDO $pdo): array
{
    // Consulta rápida: solo lee la tabla temporal de pendientes.
    // No escaneamos toda la tabla mesas acá, para que ignorar/aplicar realmente elimine el aviso.
    mesas_docentes_cambios_asegurar_tabla($pdo);

    $stmt = $pdo->query("\n        SELECT\n            c.id_cambio,\n            c.id_catedra,\n            c.numero_mesa,\n            c.numero_grupo,\n            c.id_docente_anterior,\n            c.id_docente_nuevo,\n            c.id_docente_en_mesa,\n            c.fecha_mesa,\n            DATE_FORMAT(c.fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,\n            c.id_turno,\n            t.turno,\n            c.materia,\n            c.docente_anterior,\n            c.docente_nuevo,\n            c.estado,\n            c.origen,\n            c.observacion,\n            c.creado_en,\n            DATE_FORMAT(c.creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto\n        FROM mesas_docente_cambios_pendientes c\n        LEFT JOIN turnos t ON t.id_turno = c.id_turno\n        WHERE c.estado = 'pendiente'\n        ORDER BY c.creado_en DESC, c.numero_mesa ASC\n    ");

    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function mesas_docentes_cambios_obtener(PDO $pdo, int $idCambio): ?array
{
    mesas_docentes_cambios_asegurar_tabla($pdo);

    $stmt = $pdo->prepare("\n        SELECT *\n        FROM mesas_docente_cambios_pendientes\n        WHERE id_cambio = :id_cambio\n          AND estado = 'pendiente'\n        LIMIT 1\n    ");
    $stmt->execute([':id_cambio' => $idCambio]);
    $fila = $stmt->fetch(PDO::FETCH_ASSOC);

    return $fila ?: null;
}

function mesas_docentes_cambios_resolver_target(PDO $pdo, int $numeroMesa): array
{
    $stmtGrupo = $pdo->prepare('SELECT numero_grupo FROM mesas_grupos WHERE numero_mesa = ? ORDER BY numero_grupo ASC LIMIT 1');
    $stmtGrupo->execute([$numeroMesa]);
    $numeroGrupo = (int)($stmtGrupo->fetchColumn() ?: 0);

    if ($numeroGrupo > 0) {
        return [
            'tipo' => 'grupo',
            'numero_grupo' => $numeroGrupo,
            'id_grupo' => $numeroGrupo,
            'numero_mesa' => $numeroMesa,
        ];
    }

    $stmtNoAgrupada = $pdo->prepare('SELECT id FROM mesas_no_agrupadas WHERE numero_mesa = ? ORDER BY id ASC LIMIT 1');
    $stmtNoAgrupada->execute([$numeroMesa]);
    $idNoAgrupada = (int)($stmtNoAgrupada->fetchColumn() ?: 0);

    return [
        'tipo' => 'no_agrupada',
        'id_no_agrupada' => $idNoAgrupada ?: null,
        'numero_mesa' => $numeroMesa,
    ];
}


function mesas_docentes_cambios_pendientes(): void
{
    try {
        $pdo = db();
        $data = mesas_docentes_cambios_listar_pendientes_data($pdo);

        json_response([
            'exito' => true,
            'data' => $data,
            'total' => count($data),
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_docentes_cambios_pendientes');
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener los cambios de docente pendientes.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_docentes_cambios_aplicar(): void
{
    try {
        $pdo = db();
        $body = mesas_docentes_cambios_body();
        $idCambio = mesas_docentes_cambios_int($body['id_cambio'] ?? 0);

        if ($idCambio <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'El cambio de docente seleccionado no es válido.',
            ], 422);
            return;
        }

        mesas_docentes_cambios_asegurar_tabla($pdo);
        $cambio = mesas_docentes_cambios_obtener($pdo, $idCambio);

        if (!$cambio) {
            json_response([
                'exito' => false,
                'mensaje' => 'El cambio de docente ya fue resuelto, ignorado o no existe.',
            ], 404);
            return;
        }

        $idCatedra = (int)$cambio['id_catedra'];
        $numeroMesa = (int)$cambio['numero_mesa'];
        $idDocenteNuevo = isset($cambio['id_docente_nuevo']) && $cambio['id_docente_nuevo'] !== null
            ? (int)$cambio['id_docente_nuevo']
            : null;

        if ($idCatedra <= 0 || $numeroMesa <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'El cambio pendiente tiene datos incompletos.',
            ], 422);
            return;
        }

        $pdo->beginTransaction();

        $stmtMesas = $pdo->prepare('UPDATE mesas SET id_docente = :id_docente WHERE id_catedra = :id_catedra AND numero_mesa = :numero_mesa');
        if ($idDocenteNuevo !== null && $idDocenteNuevo > 0) {
            $stmtMesas->bindValue(':id_docente', $idDocenteNuevo, PDO::PARAM_INT);
        } else {
            $stmtMesas->bindValue(':id_docente', null, PDO::PARAM_NULL);
        }
        $stmtMesas->bindValue(':id_catedra', $idCatedra, PDO::PARAM_INT);
        $stmtMesas->bindValue(':numero_mesa', $numeroMesa, PDO::PARAM_INT);
        $stmtMesas->execute();
        $filasActualizadas = $stmtMesas->rowCount();
        $stmtResolver = $pdo->prepare("
            DELETE FROM mesas_docente_cambios_pendientes
            WHERE id_cambio = :id_cambio
        ");
        $stmtResolver->execute([':id_cambio' => $idCambio]);

        $target = mesas_docentes_cambios_resolver_target($pdo, $numeroMesa);

        $pdo->commit();

        $grupo = null;
        $tipo = $target['tipo'] ?? 'grupo';

        // La hidratación del grupo es opcional: si el helper de edición no está disponible,
        // el cambio igual queda aplicado y el frontend recarga Mesas normalmente.
        try {
            $helperEditar = __DIR__ . '/../editar_mesas/helpers_editar_mesas.php';
            if (is_file($helperEditar)) {
                require_once $helperEditar;
            }

            if ($tipo === 'no_agrupada' && function_exists('mesas_editar_obtener_no_agrupada_hidratada')) {
                $grupo = mesas_editar_obtener_no_agrupada_hidratada(
                    $pdo,
                    isset($target['id_no_agrupada']) ? (int)$target['id_no_agrupada'] : null,
                    $numeroMesa
                );
            } elseif ($tipo !== 'no_agrupada' && function_exists('mesas_editar_obtener_grupo_hidratado')) {
                $grupo = mesas_editar_obtener_grupo_hidratado($pdo, (int)$target['numero_grupo']);
            }
        } catch (Throwable $e) {
            log_error($e, 'mesas_docentes_cambios_aplicar_hidratar');
        }

        json_response([
            'exito' => true,
            'mensaje' => 'Cambio de docente aplicado al número de mesa. Revisá la mesa para confirmar si debe reubicarse.',
            'data' => [
                'filas_actualizadas' => $filasActualizadas,
                'tipo' => $tipo,
                'target' => $target,
                'grupo' => $grupo,
                'numero_mesa' => $numeroMesa,
            ],
        ]);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, 'mesas_docentes_cambios_aplicar');
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo aplicar el cambio de docente.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_docentes_cambios_ignorar(): void
{
    try {
        $pdo = db();
        $body = mesas_docentes_cambios_body();
        $idCambio = mesas_docentes_cambios_int($body['id_cambio'] ?? 0);

        if ($idCambio <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'El cambio de docente seleccionado no es válido.',
            ], 422);
            return;
        }

        mesas_docentes_cambios_asegurar_tabla($pdo);
        $stmt = $pdo->prepare("\n            DELETE FROM mesas_docente_cambios_pendientes\n            WHERE id_cambio = :id_cambio\n              AND estado = 'pendiente'\n        ");
        $stmt->execute([':id_cambio' => $idCambio]);

        json_response([
            'exito' => true,
            'mensaje' => $stmt->rowCount() > 0 ? 'Aviso ignorado y eliminado correctamente.' : 'El aviso ya no estaba pendiente.',
            'data' => [
                'id_cambio' => $idCambio,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_docentes_cambios_ignorar');
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo ignorar el aviso de cambio de docente.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
