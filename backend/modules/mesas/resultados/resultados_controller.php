<?php
// backend/modules/mesas/resultados/resultados_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../historial_mesas/historial_mesas_helpers.php';

function mesas_resultados_body(): array
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

function mesas_resultados_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function mesas_resultados_obtener_contexto(PDO $pdo, int $idPrevia, ?int $idMesa = null, ?int $numeroMesa = null): ?array
{
    $params = [':id_previa' => $idPrevia];
    $whereMesa = '';

    if ($idMesa !== null && $idMesa > 0) {
        $whereMesa .= ' AND me.id_mesa = :id_mesa';
        $params[':id_mesa'] = $idMesa;
    }

    if ($numeroMesa !== null && $numeroMesa > 0) {
        $whereMesa .= ' AND me.numero_mesa = :numero_mesa';
        $params[':numero_mesa'] = $numeroMesa;
    }

    $stmt = $pdo->prepare("\n        SELECT\n            me.id_mesa,\n            me.numero_mesa,\n            me.id_previa,\n            me.id_taller,\n            me.id_catedra,\n            me.id_docente,\n            me.fecha_mesa,\n            me.id_turno,\n            me.tipo_mesa,\n            me.estado,\n            me.observacion,\n            g.numero_grupo,\n            g.hora,\n            p.dni,\n            p.alumno,\n            p.cursando_id_curso,\n            p.cursando_id_division,\n            p.id_materia AS previa_id_materia,\n            p.materia_id_curso AS previa_materia_id_curso,\n            p.materia_id_division AS previa_materia_id_division,\n            p.id_condicion,\n            p.nota AS nota_actual,\n            p.fecha_nota AS fecha_nota_actual,\n            p.inscripcion,\n            p.activo,\n            p.anio,\n            COALESCE(cat.id_materia, p.id_materia) AS id_materia,\n            mat.materia,\n            COALESCE(cat.id_curso, p.materia_id_curso) AS materia_id_curso,\n            COALESCE(cat.id_division, p.materia_id_division) AS materia_id_division,\n            con.condicion,\n            doc.docente\n        FROM previas p\n        LEFT JOIN mesas me ON me.id_previa = p.id_previa\n        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa\n        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)\n        LEFT JOIN condicion con ON con.id_condicion = p.id_condicion\n        LEFT JOIN docentes doc ON doc.id_docente = me.id_docente\n        WHERE p.id_previa = :id_previa {$whereMesa}\n        ORDER BY\n            me.id_mesa IS NULL ASC,\n            me.fecha_mesa IS NULL ASC,\n            me.fecha_mesa ASC,\n            me.id_turno ASC,\n            me.numero_mesa ASC,\n            me.id_mesa ASC\n        LIMIT 1\n    ");
    $stmt->execute($params);
    $fila = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($fila || $idMesa === null) {
        return $fila ?: null;
    }

    // Si el selector mandó un id_mesa viejo o ya no coincide, no rompemos: buscamos por previa.
    return mesas_resultados_obtener_contexto($pdo, $idPrevia, null, $numeroMesa);
}

function mesas_resultados_obtener_snapshot_previa(PDO $pdo, int $idPrevia, ?int $numeroMesa = null): array
{
    $params = [':id_previa' => $idPrevia];
    $where = 'me.id_previa = :id_previa';

    if ($numeroMesa !== null && $numeroMesa > 0) {
        $where .= ' AND me.numero_mesa = :numero_mesa';
        $params[':numero_mesa'] = $numeroMesa;
    }

    $stmt = $pdo->prepare("\n        SELECT\n            me.id_mesa, me.numero_mesa, me.id_taller, me.id_catedra, me.id_docente, me.fecha_mesa, me.id_turno,\n            me.tipo_mesa, me.estado, me.observacion,\n            g.numero_grupo, g.hora,\n            cat.id_materia AS catedra_id_materia,\n            mat.materia,\n            doc.docente\n        FROM mesas me\n        LEFT JOIN mesas_grupos g ON g.numero_mesa = me.numero_mesa\n        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias mat ON mat.id_materia = cat.id_materia\n        LEFT JOIN docentes doc ON doc.id_docente = me.id_docente\n        WHERE {$where}\n        ORDER BY me.numero_mesa, mat.materia, me.id_mesa\n    ");
    $stmt->execute($params);

    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function mesas_resultados_obtener_previas_afectadas(PDO $pdo, array $ctx): array
{
    $idPrevia = (int)($ctx['id_previa'] ?? 0);
    if ($idPrevia <= 0) {
        return [];
    }

    $ids = [$idPrevia];
    $esTaller = (string)($ctx['tipo_mesa'] ?? '') === 'taller' || !empty($ctx['id_taller']);
    $dni = trim((string)($ctx['dni'] ?? ''));
    $idTaller = isset($ctx['id_taller']) && $ctx['id_taller'] !== null ? (int)$ctx['id_taller'] : 0;

    if ($esTaller && $dni !== '' && $idTaller > 0) {
        $stmt = $pdo->prepare("\n            SELECT DISTINCT p.id_previa\n            FROM mesas me\n            INNER JOIN previas p ON p.id_previa = me.id_previa\n            WHERE p.activo = 1\n              AND p.dni = :dni\n              AND me.id_taller = :id_taller\n        ");
        $stmt->execute([
            ':dni' => $dni,
            ':id_taller' => $idTaller,
        ]);
        $ids = array_merge($ids, array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []));
    }

    $ids = array_values(array_unique(array_filter($ids, static fn (int $id): bool => $id > 0)));
    sort($ids);
    return $ids;
}

function mesas_resultados_recalcular_numero(PDO $pdo, int $numeroMesa): void
{
    if ($numeroMesa <= 0) {
        return;
    }

    $stmtCantidad = $pdo->prepare('SELECT COUNT(DISTINCT id_previa) FROM mesas WHERE numero_mesa = :numero_mesa AND id_previa IS NOT NULL');
    $stmtCantidad->execute([':numero_mesa' => $numeroMesa]);
    $cantidad = (int)$stmtCantidad->fetchColumn();

    if ($cantidad <= 0) {
        $stmtDelGrupo = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = :numero_mesa');
        $stmtDelGrupo->execute([':numero_mesa' => $numeroMesa]);

        $stmtDelNoAgrupada = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = :numero_mesa');
        $stmtDelNoAgrupada->execute([':numero_mesa' => $numeroMesa]);
        return;
    }

    $stmtGrupo = $pdo->prepare('UPDATE mesas_grupos SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa');
    $stmtGrupo->execute([':cantidad' => $cantidad, ':numero_mesa' => $numeroMesa]);

    $stmtNoAgrupada = $pdo->prepare('UPDATE mesas_no_agrupadas SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa');
    $stmtNoAgrupada->execute([':cantidad' => $cantidad, ':numero_mesa' => $numeroMesa]);
}

function mesas_resultados_buscar_historial_existente(PDO $pdo, int $idPrevia, ?int $idMesa, ?int $numeroMesa, $fechaMesa, ?int $idTurno, ?int $idCatedra): int
{
    if ($idPrevia <= 0) {
        return 0;
    }

    // Misma mesa operativa = se edita la nota del mismo registro histórico.
    // Otro armado genera otro id_mesa, por lo tanto se inserta otro historial.
    if ($idMesa !== null && $idMesa > 0) {
        $stmt = $pdo->prepare("\n            SELECT id_resultado\n            FROM historial_previas_resultados\n            WHERE id_previa_original = :id_previa\n              AND id_mesa = :id_mesa\n            ORDER BY id_resultado DESC\n            LIMIT 1\n        ");
        $stmt->execute([
            ':id_previa' => $idPrevia,
            ':id_mesa' => $idMesa,
        ]);

        $id = (int)$stmt->fetchColumn();
        if ($id > 0) {
            return $id;
        }

        return 0;
    }

    // Fallback solo para registros muy viejos sin id_mesa. No se usa para mesas actuales.
    if ($numeroMesa !== null && $numeroMesa > 0 && !empty($fechaMesa)) {
        $sql = "\n            SELECT id_resultado\n            FROM historial_previas_resultados\n            WHERE id_previa_original = :id_previa\n              AND numero_mesa = :numero_mesa\n              AND fecha_mesa = :fecha_mesa\n        ";
        $params = [
            ':id_previa' => $idPrevia,
            ':numero_mesa' => $numeroMesa,
            ':fecha_mesa' => $fechaMesa,
        ];

        if ($idTurno !== null && $idTurno > 0) {
            $sql .= " AND id_turno = :id_turno";
            $params[':id_turno'] = $idTurno;
        }

        if ($idCatedra !== null && $idCatedra > 0) {
            $sql .= " AND id_catedra = :id_catedra";
            $params[':id_catedra'] = $idCatedra;
        }

        $sql .= "\n            ORDER BY id_resultado DESC\n            LIMIT 1\n        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    }

    return 0;
}

function mesas_resultados_guardar_historial(PDO $pdo, array $ctx, int $nota, bool $aprobado, string $fechaNota, array $snapshot): int
{
    $estadoResultado = $aprobado ? 'aprobada' : 'desaprobada';
    $motivo = $aprobado
        ? 'Aprobada en mesa de examen con nota mayor o igual a 7.'
        : 'Se presentó a rendir, pero no aprobó la previa.';

    $idPrevia = (int)($ctx['id_previa'] ?? 0);
    $numeroMesa = isset($ctx['numero_mesa']) && $ctx['numero_mesa'] !== null ? (int)$ctx['numero_mesa'] : null;
    $fechaMesa = $ctx['fecha_mesa'] ?? null;

    $idMesaHistorial = isset($ctx['id_mesa']) && $ctx['id_mesa'] !== null ? (int)$ctx['id_mesa'] : null;
    $idTurnoHistorial = isset($ctx['id_turno']) && $ctx['id_turno'] !== null ? (int)$ctx['id_turno'] : null;
    $idCatedraHistorial = isset($ctx['id_catedra']) && $ctx['id_catedra'] !== null ? (int)$ctx['id_catedra'] : null;

    $idResultado = mesas_resultados_buscar_historial_existente(
        $pdo,
        $idPrevia,
        $idMesaHistorial,
        $numeroMesa,
        $fechaMesa,
        $idTurnoHistorial,
        $idCatedraHistorial
    );

    $params = [
        ':id_previa_original' => $idPrevia > 0 ? $idPrevia : null,
        ':id_mesa' => isset($ctx['id_mesa']) && $ctx['id_mesa'] !== null ? (int)$ctx['id_mesa'] : null,
        ':numero_mesa' => $numeroMesa,
        ':numero_grupo' => isset($ctx['numero_grupo']) && $ctx['numero_grupo'] !== null ? (int)$ctx['numero_grupo'] : null,
        ':fecha_mesa' => $fechaMesa,
        ':id_turno' => isset($ctx['id_turno']) && $ctx['id_turno'] !== null ? (int)$ctx['id_turno'] : null,
        ':hora' => $ctx['hora'] ?? null,
        ':dni' => (string)($ctx['dni'] ?? ''),
        ':alumno' => (string)($ctx['alumno'] ?? ''),
        ':cursando_id_curso' => isset($ctx['cursando_id_curso']) && $ctx['cursando_id_curso'] !== null ? (int)$ctx['cursando_id_curso'] : null,
        ':cursando_id_division' => isset($ctx['cursando_id_division']) && $ctx['cursando_id_division'] !== null ? (int)$ctx['cursando_id_division'] : null,
        ':id_materia' => isset($ctx['id_materia']) && $ctx['id_materia'] !== null ? (int)$ctx['id_materia'] : null,
        ':materia' => $ctx['materia'] ?? null,
        ':materia_id_curso' => isset($ctx['materia_id_curso']) && $ctx['materia_id_curso'] !== null ? (int)$ctx['materia_id_curso'] : null,
        ':materia_id_division' => isset($ctx['materia_id_division']) && $ctx['materia_id_division'] !== null ? (int)$ctx['materia_id_division'] : null,
        ':id_condicion' => isset($ctx['id_condicion']) && $ctx['id_condicion'] !== null ? (int)$ctx['id_condicion'] : null,
        ':condicion' => $ctx['condicion'] ?? null,
        ':id_catedra' => isset($ctx['id_catedra']) && $ctx['id_catedra'] !== null ? (int)$ctx['id_catedra'] : null,
        ':id_docente' => isset($ctx['id_docente']) && $ctx['id_docente'] !== null ? (int)$ctx['id_docente'] : null,
        ':docente' => $ctx['docente'] ?? null,
        ':tipo_mesa' => $ctx['tipo_mesa'] ?? null,
        ':anio' => isset($ctx['anio']) && $ctx['anio'] !== null ? (int)$ctx['anio'] : null,
        ':nota' => $nota,
        ':aprobado' => $aprobado ? 1 : 0,
        ':estado_resultado' => $estadoResultado,
        ':fecha_nota' => $fechaNota,
        ':motivo' => $motivo,
        ':snapshot_json' => mesas_historial_json([
            'previa' => $ctx,
            'registros_mesa' => $snapshot,
        ]),
    ];

    if ($idResultado > 0) {
        $paramsUpdate = $params;
        $paramsUpdate[':id_resultado'] = $idResultado;
        unset($paramsUpdate[':id_previa_original']);

        $stmt = $pdo->prepare("\n            UPDATE historial_previas_resultados SET\n                id_mesa = :id_mesa,\n                numero_mesa = :numero_mesa,\n                numero_grupo = :numero_grupo,\n                fecha_mesa = :fecha_mesa,\n                id_turno = :id_turno,\n                hora = :hora,\n                dni = :dni,\n                alumno = :alumno,\n                cursando_id_curso = :cursando_id_curso,\n                cursando_id_division = :cursando_id_division,\n                id_materia = :id_materia,\n                materia = :materia,\n                materia_id_curso = :materia_id_curso,\n                materia_id_division = :materia_id_division,\n                id_condicion = :id_condicion,\n                condicion = :condicion,\n                id_catedra = :id_catedra,\n                id_docente = :id_docente,\n                docente = :docente,\n                tipo_mesa = :tipo_mesa,\n                anio = :anio,\n                nota = :nota,\n                aprobado = :aprobado,\n                estado_resultado = :estado_resultado,\n                fecha_nota = :fecha_nota,\n                motivo = :motivo,\n                snapshot_json = :snapshot_json\n            WHERE id_resultado = :id_resultado\n        ");
        $stmt->execute($paramsUpdate);
        return $idResultado;
    }

    $stmt = $pdo->prepare("\n        INSERT INTO historial_previas_resultados (\n            id_previa_original, id_mesa, numero_mesa, numero_grupo, fecha_mesa, id_turno, hora,\n            dni, alumno, cursando_id_curso, cursando_id_division, id_materia, materia, materia_id_curso, materia_id_division,\n            id_condicion, condicion, id_catedra, id_docente, docente, tipo_mesa, anio,\n            nota, aprobado, estado_resultado, fecha_nota, motivo, snapshot_json\n        ) VALUES (\n            :id_previa_original, :id_mesa, :numero_mesa, :numero_grupo, :fecha_mesa, :id_turno, :hora,\n            :dni, :alumno, :cursando_id_curso, :cursando_id_division, :id_materia, :materia, :materia_id_curso, :materia_id_division,\n            :id_condicion, :condicion, :id_catedra, :id_docente, :docente, :tipo_mesa, :anio,\n            :nota, :aprobado, :estado_resultado, :fecha_nota, :motivo, :snapshot_json\n        )\n    ");
    $stmt->execute($params);

    return (int)$pdo->lastInsertId();
}

function mesas_resultados_guardar_nota(): void
{
    $body = mesas_resultados_body();
    $idPrevia = mesas_resultados_int($body['id_previa'] ?? 0);
    $idMesa = mesas_resultados_int($body['id_mesa'] ?? 0);
    $numeroMesa = mesas_resultados_int($body['numero_mesa'] ?? 0);
    $nota = mesas_resultados_int($body['nota'] ?? 0);

    if ($idPrevia <= 0) {
        json_response(['exito' => false, 'mensaje' => 'La previa seleccionada no es válida.'], 422);
        return;
    }

    if ($nota < 1 || $nota > 10) {
        json_response(['exito' => false, 'mensaje' => 'La nota debe estar entre 1 y 10.'], 422);
        return;
    }

    $pdo = db();
    $fechaNota = mesas_historial_fecha_hoy();
    $aprobado = $nota >= 7;

    try {
        // DDL antes de la transacción: CREATE/ALTER en MySQL hace commit implícito.
        // Si se ejecuta dentro de beginTransaction(), después explota al commit/rollback.
        mesas_historial_asegurar_tablas($pdo);

        $pdo->beginTransaction();

        $ctxInicial = mesas_resultados_obtener_contexto(
            $pdo,
            $idPrevia,
            $idMesa > 0 ? $idMesa : null,
            $numeroMesa > 0 ? $numeroMesa : null
        );

        if (!$ctxInicial) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'No se encontró la previa para cargar la nota.'], 404);
            return;
        }

        $ctxInicialEstaEnMesa = isset($ctxInicial['id_mesa']) && (int)$ctxInicial['id_mesa'] > 0;
        if ((int)($ctxInicial['activo'] ?? 0) !== 1 && !$ctxInicialEstaEnMesa) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'La previa ya no está activa o no pertenece a una mesa vigente.'], 409);
            return;
        }

        $idsAfectadas = mesas_resultados_obtener_previas_afectadas($pdo, $ctxInicial);
        if (count($idsAfectadas) === 0) {
            $idsAfectadas = [$idPrevia];
        }

        $idsResultados = [];
        $numerosAfectados = [];
        $idsMesasAfectadas = [];

        foreach ($idsAfectadas as $idPreviaAfectada) {
            $ctx = $idPreviaAfectada === $idPrevia
                ? $ctxInicial
                : mesas_resultados_obtener_contexto($pdo, $idPreviaAfectada, null, null);

            $ctxEstaEnMesa = $ctx && isset($ctx['id_mesa']) && (int)$ctx['id_mesa'] > 0;
            if (!$ctx || ((int)($ctx['activo'] ?? 0) !== 1 && !$ctxEstaEnMesa)) {
                continue;
            }

            $numeroMesaReal = isset($ctx['numero_mesa']) && $ctx['numero_mesa'] !== null
                ? (int)$ctx['numero_mesa']
                : ($numeroMesa > 0 ? $numeroMesa : null);

            $snapshot = mesas_resultados_obtener_snapshot_previa($pdo, $idPreviaAfectada, $numeroMesaReal);
            foreach ($snapshot as $filaSnap) {
                if (isset($filaSnap['id_mesa']) && $filaSnap['id_mesa'] !== null) {
                    $idsMesasAfectadas[] = (int)$filaSnap['id_mesa'];
                }
                if (isset($filaSnap['numero_mesa']) && $filaSnap['numero_mesa'] !== null) {
                    $numerosAfectados[] = (int)$filaSnap['numero_mesa'];
                }
            }

            $idsResultados[] = mesas_resultados_guardar_historial($pdo, $ctx, $nota, $aprobado, $fechaNota, $snapshot);
        }

        $idsAfectadas = array_values(array_unique($idsAfectadas));
        $numerosAfectados = array_values(array_unique(array_filter(array_map('intval', $numerosAfectados))));
        $idsMesasAfectadas = array_values(array_unique(array_filter(array_map('intval', $idsMesasAfectadas))));

        $placeholders = implode(',', array_fill(0, count($idsAfectadas), '?'));

        $tieneFechaBaja = function_exists('mesas_historial_columna_existe')
            ? mesas_historial_columna_existe($pdo, 'previas', 'fecha_baja')
            : false;
        $tieneMotivoBaja = function_exists('mesas_historial_columna_existe')
            ? mesas_historial_columna_existe($pdo, 'previas', 'motivo_baja')
            : false;

        if ($aprobado) {
            $setsPrevia = [
                'nota = ?',
                'fecha_nota = ?',
                'activo = 0',
            ];
            $paramsPrevia = [$nota, $fechaNota];

            if ($tieneFechaBaja) {
                $setsPrevia[] = 'fecha_baja = ?';
                $paramsPrevia[] = $fechaNota;
            }

            if ($tieneMotivoBaja) {
                $setsPrevia[] = 'motivo_baja = ?';
                $paramsPrevia[] = 'Aprobada en mesa de examen con nota ' . $nota;
            }

            $stmtPrevia = $pdo->prepare("\n                UPDATE previas\n                SET " . implode(', ', $setsPrevia) . "\n                WHERE id_previa IN ({$placeholders})\n            ");
            $stmtPrevia->execute(array_merge($paramsPrevia, $idsAfectadas));

            // La previa aprobada se da de baja para que no vuelva a entrar en próximos armados,
            // pero NO se elimina de la mesa operativa actual. Así queda visible con su nota
            // hasta que el usuario elimine/cierre las mesas, momento en el que se guarda la foto
            // completa en historial y se borran las filas de `mesas`.
        } else {
            $setsPrevia = [
                'nota = ?',
                'fecha_nota = ?',
                'activo = 1',
            ];
            $paramsPrevia = [$nota, $fechaNota];

            if ($tieneFechaBaja) {
                $setsPrevia[] = 'fecha_baja = NULL';
            }

            if ($tieneMotivoBaja) {
                $setsPrevia[] = 'motivo_baja = NULL';
            }

            $stmtPrevia = $pdo->prepare("\n                UPDATE previas\n                SET " . implode(', ', $setsPrevia) . "\n                WHERE id_previa IN ({$placeholders})\n            ");
            $stmtPrevia->execute(array_merge($paramsPrevia, $idsAfectadas));
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => $aprobado
                ? 'Nota guardada. La previa fue aprobada y dada de baja, pero queda visible en la mesa actual hasta eliminar/cerrar las mesas.'
                : 'Nota guardada. La previa queda pendiente porque no alcanzó 7.',
            'data' => [
                'id_resultado' => $idsResultados[0] ?? null,
                'ids_resultados' => $idsResultados,
                'id_previa' => $idPrevia,
                'ids_previas_afectadas' => $idsAfectadas,
                'ids_mesas_afectadas' => $idsMesasAfectadas,
                'numeros_mesa_afectados' => $numerosAfectados,
                'nota' => $nota,
                'aprobado' => $aprobado,
                'fecha_nota' => $fechaNota,
                'previa_activa' => $aprobado ? 0 : 1,
                'replicado_taller' => count($idsAfectadas) > 1 || (string)($ctxInicial['tipo_mesa'] ?? '') === 'taller',
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        if (function_exists('log_error')) {
            log_error($e, 'mesas_resultados_guardar_nota');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al guardar la nota de la mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
