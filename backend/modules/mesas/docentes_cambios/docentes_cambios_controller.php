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
 * - La tabla vive en la DB tenant/colegio.
 * - La estructura ya existe en la base y no se modifica desde código.
 */
function mesas_docentes_cambios_asegurar_tabla(PDO $pdo): void
{
    // La tabla mesas_docente_cambios_pendientes ya existe en la base de datos.
    // No se crea ni se modifica estructura desde código para evitar cambios inesperados.
    $pdo->query('SELECT 1 FROM mesas_docente_cambios_pendientes LIMIT 1');
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


function mesas_docentes_cambios_sql_no_placeholder_docente(string $alias): string
{
    return "UPPER(TRIM(COALESCE({$alias}.docente, ''))) NOT IN ('MATERIA SIN CARGO CUBIERTO', 'SIN CARGO CUBIERTO')";
}

function mesas_docentes_cambios_docente_actual_catedra(PDO $pdo, int $idCatedra): ?int
{
    if ($idCatedra <= 0) {
        return null;
    }

    // Fuente principal: catedras.id_docente. En Cátedras se guarda ahí el docente marcado
    // como "Llamado", aunque existan varios titulares o varios suplentes.
    $stmtManual = $pdo->prepare("
        SELECT cat.id_docente
        FROM catedras cat
        INNER JOIN docentes d
            ON d.id_docente = cat.id_docente
           AND d.activo = 1
           AND " . mesas_docentes_cambios_sql_no_placeholder_docente('d') . "
        WHERE cat.id_catedra = :id_catedra
          AND cat.activo = 1
          AND cat.id_docente IS NOT NULL
          AND (
                NOT EXISTS (
                    SELECT 1
                    FROM catedras_docentes cd_check
                    WHERE cd_check.id_catedra = cat.id_catedra
                      AND cd_check.activo = 1
                )
                OR EXISTS (
                    SELECT 1
                    FROM catedras_docentes cd_check
                    WHERE cd_check.id_catedra = cat.id_catedra
                      AND cd_check.id_docente = cat.id_docente
                      AND cd_check.activo = 1
                )
          )
        LIMIT 1
    ");
    $stmtManual->execute([':id_catedra' => $idCatedra]);
    $idManual = $stmtManual->fetchColumn();
    if ($idManual !== false && $idManual !== null && (int)$idManual > 0) {
        return (int)$idManual;
    }

    // Respaldo para datos viejos: suplente primero, titular después, y dentro de iguales el último agregado.
    $stmtRelacion = $pdo->prepare("
        SELECT cd.id_docente
        FROM catedras_docentes cd
        INNER JOIN docentes d
            ON d.id_docente = cd.id_docente
           AND d.activo = 1
           AND " . mesas_docentes_cambios_sql_no_placeholder_docente('d') . "
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = cd.id_cargo
        WHERE cd.id_catedra = :id_catedra
          AND cd.activo = 1
        ORDER BY
            CASE
                WHEN cd.id_cargo = 2 OR UPPER(TRIM(COALESCE(cargo.cargo, ''))) = 'SUPLENTE' THEN 0
                WHEN cd.id_cargo = 1 OR UPPER(TRIM(COALESCE(cargo.cargo, ''))) = 'TITULAR' THEN 1
                ELSE 2
            END ASC,
            cd.id_catedra_docente DESC
        LIMIT 1
    ");
    $stmtRelacion->execute([':id_catedra' => $idCatedra]);
    $idRelacion = $stmtRelacion->fetchColumn();

    return $idRelacion !== false && $idRelacion !== null && (int)$idRelacion > 0 ? (int)$idRelacion : null;
}


/**
 * Elimina avisos pendientes cuando ya no hay diferencia real entre Mesas y Cátedras.
 *
 * Caso clave:
 * - La mesa quedó armada con MELANO.
 * - En Cátedras se cambió a ORTIZ => se avisa MELANO -> ORTIZ.
 * - En Cátedras se vuelve a MELANO => el aviso ya no corresponde y se borra.
 */
function mesas_docentes_cambios_eliminar_pendiente_actual(PDO $pdo, int $idCatedra, int $numeroMesa): int
{
    if ($idCatedra <= 0 || $numeroMesa <= 0) {
        return 0;
    }

    $stmt = $pdo->prepare("
        DELETE FROM mesas_docente_cambios_pendientes
        WHERE id_catedra = :id_catedra
          AND numero_mesa = :numero_mesa
          AND estado = 'pendiente'
    ");
    $stmt->execute([
        ':id_catedra' => $idCatedra,
        ':numero_mesa' => $numeroMesa,
    ]);

    return $stmt->rowCount();
}

/**
 * Limpieza defensiva para avisos viejos que quedaron pendientes por versiones anteriores.
 * No crea avisos nuevos: solo borra los que ya están resueltos por la realidad actual.
 */
function mesas_docentes_cambios_limpiar_pendientes_resueltos(PDO $pdo): int
{
    mesas_docentes_cambios_asegurar_tabla($pdo);

    $stmt = $pdo->query("\n        SELECT
            c.id_cambio,
            c.id_catedra,
            c.numero_mesa,
            mesa_actual.id_docente_en_mesa
        FROM mesas_docente_cambios_pendientes c
        LEFT JOIN (
            SELECT
                me.id_catedra,
                me.numero_mesa,
                MIN(me.id_docente) AS id_docente_en_mesa
            FROM mesas me
            WHERE me.id_catedra IS NOT NULL
              AND me.numero_mesa IS NOT NULL
            GROUP BY me.id_catedra, me.numero_mesa
        ) mesa_actual
            ON mesa_actual.id_catedra = c.id_catedra
           AND mesa_actual.numero_mesa = c.numero_mesa
        WHERE c.estado = 'pendiente'
    ");

    $pendientes = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $stmtDelete = $pdo->prepare("\n        DELETE FROM mesas_docente_cambios_pendientes
        WHERE id_cambio = :id_cambio
          AND estado = 'pendiente'
    ");

    $borrados = 0;
    foreach ($pendientes as $pendiente) {
        $idCambio = (int)($pendiente['id_cambio'] ?? 0);
        $idCatedra = (int)($pendiente['id_catedra'] ?? 0);
        $idMesa = isset($pendiente['id_docente_en_mesa']) && $pendiente['id_docente_en_mesa'] !== null
            ? (int)$pendiente['id_docente_en_mesa']
            : null;
        $idActual = mesas_docentes_cambios_docente_actual_catedra($pdo, $idCatedra);

        // Si la mesa ya no existe, o ya coincide con el docente actualmente marcado para llamar,
        // el aviso no corresponde más.
        if ($idCambio > 0 && ($idMesa === null || $idMesa === $idActual)) {
            $stmtDelete->execute([':id_cambio' => $idCambio]);
            $borrados += $stmtDelete->rowCount();
        }
    }

    return $borrados;
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

    mesas_docentes_cambios_asegurar_tabla($pdo);

    $stmtMesas = $pdo->prepare("\n        SELECT\n            me.id_catedra,\n            me.numero_mesa,\n            MIN(me.id_docente) AS id_docente_en_mesa,\n            MIN(me.fecha_mesa) AS fecha_mesa,\n            MIN(me.id_turno) AS id_turno,\n            MIN(g.numero_grupo) AS numero_grupo,\n            MAX(m.materia) AS materia\n        FROM mesas me\n        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa\n        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias m ON m.id_materia = cat.id_materia\n        WHERE me.id_catedra = :id_catedra\n          AND me.numero_mesa IS NOT NULL\n        GROUP BY me.id_catedra, me.numero_mesa\n        ORDER BY me.numero_mesa ASC\n    ");
    $stmtMesas->execute([':id_catedra' => $idCatedra]);
    $filas = $stmtMesas->fetchAll(PDO::FETCH_ASSOC) ?: [];

    if (count($filas) === 0) {
        $stmtLimpiar = $pdo->prepare("\n            DELETE FROM mesas_docente_cambios_pendientes\n            WHERE id_catedra = :id_catedra\n              AND estado = 'pendiente'\n        ");
        $stmtLimpiar->execute([':id_catedra' => $idCatedra]);
        return 0;
    }

    // Si no cambió el docente de la cátedra, no generamos avisos nuevos.
    // La limpieza defensiva general se ejecuta al listar pendientes en Mesas.
    if ($anteriorNormalizado === $nuevoNormalizado) {
        return 0;
    }

    $afectados = 0;
    foreach ($filas as $fila) {
        $idDocenteEnMesa = isset($fila['id_docente_en_mesa']) && $fila['id_docente_en_mesa'] !== null
            ? (int)$fila['id_docente_en_mesa']
            : null;
        $numeroMesa = (int)($fila['numero_mesa'] ?? 0);

        // Si la mesa ya tiene el mismo docente que quedó en Cátedras,
        // el cambio pendiente quedó resuelto por reversión y debe desaparecer.
        if ($idDocenteEnMesa === $nuevoNormalizado) {
            mesas_docentes_cambios_eliminar_pendiente_actual($pdo, $idCatedra, $numeroMesa);
            continue;
        }

        // Fuente de verdad del aviso: docente guardado en la mesa -> docente actual de la cátedra.
        // Esto evita que queden avisos invertidos o viejos cuando se cambia varias veces.
        $afectados += mesas_docentes_cambios_guardar_pendiente(
            $pdo,
            $fila,
            $idDocenteEnMesa,
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

    $stmt = $pdo->query("\n        SELECT
            me.id_catedra,
            me.numero_mesa,
            MIN(me.id_docente) AS id_docente_en_mesa,
            MIN(me.fecha_mesa) AS fecha_mesa,
            MIN(me.id_turno) AS id_turno,
            MIN(g.numero_grupo) AS numero_grupo,
            MAX(m.materia) AS materia
        FROM mesas me
        INNER JOIN catedras cat ON cat.id_catedra = me.id_catedra
        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa
        LEFT JOIN materias m ON m.id_materia = cat.id_materia
        WHERE me.id_catedra IS NOT NULL
          AND me.numero_mesa IS NOT NULL
        GROUP BY me.id_catedra, me.numero_mesa
        ORDER BY me.numero_mesa ASC
    ");

    $filas = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $afectados = 0;

    foreach ($filas as $fila) {
        $idCatedra = (int)($fila['id_catedra'] ?? 0);
        $numeroMesa = (int)($fila['numero_mesa'] ?? 0);
        $idDocenteEnMesa = isset($fila['id_docente_en_mesa']) && $fila['id_docente_en_mesa'] !== null
            ? (int)$fila['id_docente_en_mesa']
            : null;
        $idDocenteActual = mesas_docentes_cambios_docente_actual_catedra($pdo, $idCatedra);

        if ($numeroMesa <= 0 || $idDocenteEnMesa === $idDocenteActual) {
            mesas_docentes_cambios_eliminar_pendiente_actual($pdo, $idCatedra, $numeroMesa);
            continue;
        }

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
    // No escaneamos toda la tabla mesas para crear avisos nuevos, así ignorar/aplicar no reaparece.
    // Sí limpiamos avisos viejos que ya no tienen diferencia real entre Mesas y Cátedras.
    mesas_docentes_cambios_asegurar_tabla($pdo);
    mesas_docentes_cambios_limpiar_pendientes_resueltos($pdo);

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
        $numeroMesaOriginal = (int)$cambio['numero_mesa'];
        $idDocenteNuevo = isset($cambio['id_docente_nuevo']) && $cambio['id_docente_nuevo'] !== null
            ? (int)$cambio['id_docente_nuevo']
            : null;

        if ($idCatedra <= 0 || $numeroMesaOriginal <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'El cambio pendiente tiene datos incompletos.',
            ], 422);
            return;
        }

        $pdo->beginTransaction();

        $stmtCantidadAfectada = $pdo->prepare('
            SELECT COUNT(*)
            FROM mesas
            WHERE id_catedra = :id_catedra
              AND numero_mesa = :numero_mesa
        ');
        $stmtCantidadAfectada->execute([
            ':id_catedra' => $idCatedra,
            ':numero_mesa' => $numeroMesaOriginal,
        ]);
        $cantidadAfectada = (int)$stmtCantidadAfectada->fetchColumn();

        if ($cantidadAfectada <= 0) {
            throw new RuntimeException('No se encontraron alumnos/previas de esa cátedra dentro del número de mesa original.');
        }

        $stmtOtras = $pdo->prepare('
            SELECT COUNT(*)
            FROM mesas
            WHERE numero_mesa = :numero_mesa
              AND COALESCE(id_catedra, 0) <> :id_catedra
        ');
        $stmtOtras->execute([
            ':numero_mesa' => $numeroMesaOriginal,
            ':id_catedra' => $idCatedra,
        ]);
        $tieneOtrasCatedras = (int)$stmtOtras->fetchColumn() > 0;

        /*
         * Caso importante:
         * Si al quitar un suplente vuelve el titular y ese titular ya estaba dentro
         * del mismo número de mesa por otra cátedra, NO hay que separar ni crear
         * un slot/número nuevo. Solo se actualiza el docente de las filas afectadas.
         */
        $docenteNuevoYaEstaEnElNumero = false;
        if ($tieneOtrasCatedras && $idDocenteNuevo !== null && $idDocenteNuevo > 0) {
            $stmtDocenteEnNumero = $pdo->prepare('
                SELECT COUNT(*)
                FROM mesas
                WHERE numero_mesa = :numero_mesa
                  AND id_docente = :id_docente
                  AND COALESCE(id_catedra, 0) <> :id_catedra
            ');
            $stmtDocenteEnNumero->execute([
                ':numero_mesa' => $numeroMesaOriginal,
                ':id_docente' => $idDocenteNuevo,
                ':id_catedra' => $idCatedra,
            ]);
            $docenteNuevoYaEstaEnElNumero = (int)$stmtDocenteEnNumero->fetchColumn() > 0;
        }

        $debeSepararEnNumeroNuevo = $tieneOtrasCatedras && !$docenteNuevoYaEstaEnElNumero;

        $numeroMesaFinal = $numeroMesaOriginal;
        $seCreoNumeroNuevo = false;
        $target = mesas_docentes_cambios_resolver_target($pdo, $numeroMesaOriginal);
        $modo = $docenteNuevoYaEstaEnElNumero
            ? 'actualizado_en_mismo_numero_docente_ya_presente'
            : 'actualizado_en_mismo_numero';

        if ($debeSepararEnNumeroNuevo) {
            $stmtNuevoNumero = $pdo->query('
                SELECT COALESCE(MAX(numero_mesa), 0) + 1
                FROM (
                    SELECT numero_mesa FROM mesas WHERE numero_mesa IS NOT NULL
                    UNION ALL
                    SELECT numero_mesa FROM mesas_grupos WHERE numero_mesa IS NOT NULL
                    UNION ALL
                    SELECT numero_mesa FROM mesas_no_agrupadas WHERE numero_mesa IS NOT NULL
                ) numeros_usados
            ');
            $numeroMesaFinal = max(1, (int)($stmtNuevoNumero->fetchColumn() ?: 1));
            $seCreoNumeroNuevo = true;

            $stmtResumen = $pdo->prepare('
                SELECT
                    COUNT(*) AS cantidad_alumnos,
                    MIN(fecha_mesa) AS fecha_mesa,
                    MIN(id_turno) AS id_turno,
                    MAX(CASE WHEN tipo_mesa = \'taller\' THEN 1 ELSE 0 END) AS tiene_taller,
                    MAX(CASE WHEN tipo_mesa = \'correlativa\' THEN 1 ELSE 0 END) AS tiene_correlativa,
                    MAX(prioridad) AS prioridad
                FROM mesas
                WHERE id_catedra = :id_catedra
                  AND numero_mesa = :numero_mesa
            ');
            $stmtResumen->execute([
                ':id_catedra' => $idCatedra,
                ':numero_mesa' => $numeroMesaOriginal,
            ]);
            $resumen = $stmtResumen->fetch(PDO::FETCH_ASSOC) ?: [];
            $tipoMesaNuevo = 'simple';
            if ((int)($resumen['tiene_taller'] ?? 0) > 0) {
                $tipoMesaNuevo = 'taller';
            } elseif ((int)($resumen['tiene_correlativa'] ?? 0) > 0) {
                $tipoMesaNuevo = 'correlativa';
            }

            $stmtGrupoOriginal = $pdo->prepare('
                SELECT *
                FROM mesas_grupos
                WHERE numero_mesa = :numero_mesa
                ORDER BY id_mesa_grupo ASC
                LIMIT 1
            ');
            $stmtGrupoOriginal->execute([':numero_mesa' => $numeroMesaOriginal]);
            $grupoOriginal = $stmtGrupoOriginal->fetch(PDO::FETCH_ASSOC) ?: null;

            if ($grupoOriginal) {
                $numeroGrupo = (int)$grupoOriginal['numero_grupo'];
                $stmtOrden = $pdo->prepare('SELECT COALESCE(MAX(orden), 0) + 1 FROM mesas_grupos WHERE numero_grupo = :numero_grupo');
                $stmtOrden->execute([':numero_grupo' => $numeroGrupo]);
                $ordenNuevo = max(1, (int)($stmtOrden->fetchColumn() ?: 1));

                $stmtInsertGrupo = $pdo->prepare('
                    INSERT INTO mesas_grupos (
                        numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area,
                        orden, tipo_mesa, prioridad, cantidad_alumnos, estado, observacion
                    ) VALUES (
                        :numero_grupo, :numero_mesa, :fecha_mesa, :id_turno, :hora, :id_area,
                        :orden, :tipo_mesa, :prioridad, :cantidad_alumnos, :estado, :observacion
                    )
                ');
                $stmtInsertGrupo->execute([
                    ':numero_grupo' => $numeroGrupo,
                    ':numero_mesa' => $numeroMesaFinal,
                    ':fecha_mesa' => $grupoOriginal['fecha_mesa'] ?? ($resumen['fecha_mesa'] ?? null),
                    ':id_turno' => isset($grupoOriginal['id_turno']) ? (int)$grupoOriginal['id_turno'] : (int)($resumen['id_turno'] ?? 0),
                    ':hora' => $grupoOriginal['hora'] ?? null,
                    ':id_area' => isset($grupoOriginal['id_area']) && $grupoOriginal['id_area'] !== null ? (int)$grupoOriginal['id_area'] : null,
                    ':orden' => $ordenNuevo,
                    ':tipo_mesa' => $tipoMesaNuevo,
                    ':prioridad' => (int)($resumen['prioridad'] ?? $grupoOriginal['prioridad'] ?? 0),
                    ':cantidad_alumnos' => $cantidadAfectada,
                    ':estado' => $grupoOriginal['estado'] ?? 'borrador',
                    ':observacion' => 'Número creado automáticamente por cambio de docente.',
                ]);

                $stmtCapacidad = $pdo->prepare('
                    SELECT
                        COUNT(*) AS cantidad_numeros,
                        SUM(CASE WHEN tipo_mesa = \'taller\' OR prioridad = 1 THEN 1 ELSE 0 END) AS cantidad_talleres
                    FROM mesas_grupos
                    WHERE numero_grupo = :numero_grupo
                ');
                $stmtCapacidad->execute([':numero_grupo' => $numeroGrupo]);
                $capacidad = $stmtCapacidad->fetch(PDO::FETCH_ASSOC) ?: [];
                $cantidadNumerosGrupo = (int)($capacidad['cantidad_numeros'] ?? 0);
                $cantidadTalleresGrupo = (int)($capacidad['cantidad_talleres'] ?? 0);
                $capacidadBase = $cantidadTalleresGrupo > 0 ? 1 : 4;
                $slotsExtraNecesarios = max(0, $cantidadNumerosGrupo - $capacidadBase);

                if ($slotsExtraNecesarios > 0) {
                    $stmtSlots = $pdo->prepare('
                        INSERT INTO mesas_grupos_slots_extra (numero_grupo, slots_extra)
                        VALUES (:numero_grupo, :slots_extra)
                        ON DUPLICATE KEY UPDATE
                            slots_extra = GREATEST(slots_extra, VALUES(slots_extra)),
                            actualizado_en = CURRENT_TIMESTAMP
                    ');
                    $stmtSlots->execute([
                        ':numero_grupo' => $numeroGrupo,
                        ':slots_extra' => $slotsExtraNecesarios,
                    ]);
                }

                $target = [
                    'tipo' => 'grupo',
                    'numero_grupo' => $numeroGrupo,
                    'id_grupo' => $numeroGrupo,
                    'numero_mesa_original' => $numeroMesaOriginal,
                    'numero_mesa' => $numeroMesaFinal,
                    'numero_mesa_final' => $numeroMesaFinal,
                    'numero_mesa_nuevo' => $numeroMesaFinal,
                    'slot_agregado' => true,
                    'slots_extra' => $slotsExtraNecesarios,
                    'orden' => $ordenNuevo,
                ];
                $modo = 'separado_en_numero_nuevo_grupo';
            } else {
                $stmtNoAgrupadaOriginal = $pdo->prepare('
                    SELECT *
                    FROM mesas_no_agrupadas
                    WHERE numero_mesa = :numero_mesa
                    ORDER BY id ASC
                    LIMIT 1
                ');
                $stmtNoAgrupadaOriginal->execute([':numero_mesa' => $numeroMesaOriginal]);
                $noAgrupadaOriginal = $stmtNoAgrupadaOriginal->fetch(PDO::FETCH_ASSOC) ?: null;

                if ($noAgrupadaOriginal) {
                    $stmtInsertNoAgrupada = $pdo->prepare('
                        INSERT INTO mesas_no_agrupadas (
                            numero_mesa, fecha_mesa, id_turno, hora, id_area,
                            tipo_mesa, prioridad, cantidad_alumnos, motivo, estado
                        ) VALUES (
                            :numero_mesa, :fecha_mesa, :id_turno, :hora, :id_area,
                            :tipo_mesa, :prioridad, :cantidad_alumnos, :motivo, :estado
                        )
                    ');
                    $stmtInsertNoAgrupada->execute([
                        ':numero_mesa' => $numeroMesaFinal,
                        ':fecha_mesa' => $noAgrupadaOriginal['fecha_mesa'] ?? ($resumen['fecha_mesa'] ?? null),
                        ':id_turno' => isset($noAgrupadaOriginal['id_turno']) ? (int)$noAgrupadaOriginal['id_turno'] : (int)($resumen['id_turno'] ?? 0),
                        ':hora' => $noAgrupadaOriginal['hora'] ?? null,
                        ':id_area' => isset($noAgrupadaOriginal['id_area']) && $noAgrupadaOriginal['id_area'] !== null ? (int)$noAgrupadaOriginal['id_area'] : null,
                        ':tipo_mesa' => $tipoMesaNuevo,
                        ':prioridad' => (int)($resumen['prioridad'] ?? $noAgrupadaOriginal['prioridad'] ?? 0),
                        ':cantidad_alumnos' => $cantidadAfectada,
                        ':motivo' => 'separada_automaticamente_por_cambio_docente',
                        ':estado' => $noAgrupadaOriginal['estado'] ?? 'pendiente',
                    ]);
                    $idNoAgrupadaNueva = (int)$pdo->lastInsertId();
                } else {
                    $idNoAgrupadaNueva = null;
                }

                $target = [
                    'tipo' => 'no_agrupada',
                    'id_no_agrupada' => $idNoAgrupadaNueva,
                    'numero_mesa_original' => $numeroMesaOriginal,
                    'numero_mesa' => $numeroMesaFinal,
                    'numero_mesa_final' => $numeroMesaFinal,
                    'numero_mesa_nuevo' => $numeroMesaFinal,
                    'slot_agregado' => false,
                ];
                $modo = 'separado_en_numero_nuevo_no_agrupado';
            }
        }

        $stmtMesas = $pdo->prepare('
            UPDATE mesas
            SET numero_mesa = :numero_mesa_final,
                id_docente = :id_docente
            WHERE id_catedra = :id_catedra
              AND numero_mesa = :numero_mesa_original
        ');
        $stmtMesas->bindValue(':numero_mesa_final', $numeroMesaFinal, PDO::PARAM_INT);
        if ($idDocenteNuevo !== null && $idDocenteNuevo > 0) {
            $stmtMesas->bindValue(':id_docente', $idDocenteNuevo, PDO::PARAM_INT);
        } else {
            $stmtMesas->bindValue(':id_docente', null, PDO::PARAM_NULL);
        }
        $stmtMesas->bindValue(':id_catedra', $idCatedra, PDO::PARAM_INT);
        $stmtMesas->bindValue(':numero_mesa_original', $numeroMesaOriginal, PDO::PARAM_INT);
        $stmtMesas->execute();
        $filasActualizadas = $stmtMesas->rowCount();

        if ($seCreoNumeroNuevo) {
            $stmtCantidadOriginal = $pdo->prepare('SELECT COUNT(*) FROM mesas WHERE numero_mesa = :numero_mesa');
            $stmtCantidadOriginal->execute([':numero_mesa' => $numeroMesaOriginal]);
            $cantidadOriginal = (int)$stmtCantidadOriginal->fetchColumn();

            $stmtActualizarGrupoOriginal = $pdo->prepare('UPDATE mesas_grupos SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa');
            $stmtActualizarGrupoOriginal->execute([
                ':cantidad' => $cantidadOriginal,
                ':numero_mesa' => $numeroMesaOriginal,
            ]);

            $stmtActualizarGrupoNuevo = $pdo->prepare('UPDATE mesas_grupos SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa');
            $stmtActualizarGrupoNuevo->execute([
                ':cantidad' => $cantidadAfectada,
                ':numero_mesa' => $numeroMesaFinal,
            ]);

            $stmtActualizarNoAgrupadaOriginal = $pdo->prepare('UPDATE mesas_no_agrupadas SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa');
            $stmtActualizarNoAgrupadaOriginal->execute([
                ':cantidad' => $cantidadOriginal,
                ':numero_mesa' => $numeroMesaOriginal,
            ]);

            $stmtActualizarNoAgrupadaNueva = $pdo->prepare('UPDATE mesas_no_agrupadas SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa');
            $stmtActualizarNoAgrupadaNueva->execute([
                ':cantidad' => $cantidadAfectada,
                ':numero_mesa' => $numeroMesaFinal,
            ]);
        }

        $stmtResolver = $pdo->prepare('
            DELETE FROM mesas_docente_cambios_pendientes
            WHERE id_cambio = :id_cambio
        ');
        $stmtResolver->execute([':id_cambio' => $idCambio]);

        $tipo = $target['tipo'] ?? 'grupo';

        $pdo->commit();

        $grupo = null;

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
                    $numeroMesaFinal
                );
            } elseif ($tipo !== 'no_agrupada' && function_exists('mesas_editar_obtener_grupo_hidratado')) {
                $grupo = mesas_editar_obtener_grupo_hidratado($pdo, (int)$target['numero_grupo']);
            }
        } catch (Throwable $e) {
            log_error($e, 'mesas_docentes_cambios_aplicar_hidratar');
        }

        $mensaje = $seCreoNumeroNuevo
            ? 'Cambio aplicado: se creó un nuevo número de mesa para el docente nuevo y se agregó al mismo grupo.'
            : 'Cambio de docente aplicado al número de mesa.';

        json_response([
            'exito' => true,
            'mensaje' => $mensaje,
            'data' => [
                'filas_actualizadas' => $filasActualizadas,
                'cantidad_afectada' => $cantidadAfectada,
                'se_creo_numero_nuevo' => $seCreoNumeroNuevo,
                'docente_nuevo_ya_estaba_en_numero' => $docenteNuevoYaEstaEnElNumero,
                'numero_mesa_original' => $numeroMesaOriginal,
                'numero_mesa_final' => $numeroMesaFinal,
                'numero_mesa_nuevo' => $seCreoNumeroNuevo ? $numeroMesaFinal : null,
                'modo' => $modo,
                'tipo' => $tipo,
                'target' => $target,
                'grupo' => $grupo,
                'numero_mesa' => $numeroMesaFinal,
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
