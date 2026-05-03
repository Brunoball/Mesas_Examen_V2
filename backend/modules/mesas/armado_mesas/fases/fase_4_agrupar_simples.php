<?php
// backend/modules/mesas/armado_mesas/fases/fase_4_agrupar_simples.php
declare(strict_types=1);

/**
 * Fase 4 - Numeración inicial de mesas.
 *
 * Reglas actuales:
 * - NO asigna fecha_mesa.
 * - NO asigna id_turno.
 * - Talleres: numero_mesa exclusivo por id_previa + id_taller.
 *   Esto evita que dos alumnos/precias de taller se unan por mismo docente/materia.
 * - Simples/correlativas: agrupa por mismo docente + misma materia.
 */
function mesas_armado_fase_4_agrupar_simples(): void
{
    try {
        $pdo = db();
        $body = request_body();

        $reiniciarNumeracion = filter_var($body['reiniciar_numeracion'] ?? true, FILTER_VALIDATE_BOOLEAN);
        $limpiarFechaTurno = filter_var($body['limpiar_fecha_turno'] ?? true, FILTER_VALIDATE_BOOLEAN);
        $incluirArmadas = filter_var($body['incluir_armadas'] ?? true, FILTER_VALIDATE_BOOLEAN);

        $resultado = mesas_armado_numerar_por_docente_materia(
            $pdo,
            $reiniciarNumeracion,
            $limpiarFechaTurno,
            $incluirArmadas
        );

        json_response([
            'exito' => true,
            'mensaje' => 'Numeración de mesas generada correctamente. Talleres con mesa exclusiva por previa y resto por docente/materia.',
            'data' => $resultado,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_fase_4_agrupar_simples');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al numerar las mesas.',
        ], 500);
    }
}

/**
 * Wrapper con transacción propia para numerar filas ya existentes en mesas.
 */
function mesas_armado_numerar_por_docente_materia(
    PDO $pdo,
    bool $reiniciarNumeracion = true,
    bool $limpiarFechaTurno = true,
    bool $incluirArmadas = true
): array {
    $pdo->beginTransaction();

    try {
        $resultado = mesas_armado_numerar_por_docente_materia_core(
            $pdo,
            $reiniciarNumeracion,
            $limpiarFechaTurno,
            $incluirArmadas
        );

        $pdo->commit();
        return $resultado;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }
}

/**
 * Núcleo reutilizable. NO abre ni cierra transacción.
 * Esto permite usarlo desde la Fase 1 dentro de la misma transacción.
 */
function mesas_armado_numerar_por_docente_materia_core(
    PDO $pdo,
    bool $reiniciarNumeracion = true,
    bool $limpiarFechaTurno = true,
    bool $incluirArmadas = true
): array {
    $estadosValidos = $incluirArmadas
        ? "('borrador', 'armada')"
        : "('borrador')";

    if ($reiniciarNumeracion) {
        $pdo->exec("
            UPDATE mesas
            SET numero_mesa = NULL
            WHERE estado IN ('borrador', 'armada', 'observada')
        ");
    }

    if ($limpiarFechaTurno) {
        // Esta fase NO calendariza. Si venían fechas/turnos de una prueba anterior, se limpian.
        $pdo->exec("
            UPDATE mesas
            SET fecha_mesa = NULL,
                id_turno = NULL
            WHERE estado IN ('borrador', 'armada', 'observada')
        ");
    }

    $stmt = $pdo->query("
        SELECT
            me.id_mesa,
            me.id_previa,
            me.tipo_mesa,
            me.id_taller,
            me.prioridad,
            me.id_catedra,
            me.id_docente AS mesa_id_docente,
            cat.id_docente AS catedra_id_docente,
            cat.id_materia,
            mat.materia,
            doc.docente,
            p.dni,
            p.alumno
        FROM mesas me
        INNER JOIN catedras cat
            ON cat.id_catedra = me.id_catedra
           AND cat.activo = 1
        INNER JOIN materias mat
            ON mat.id_materia = cat.id_materia
        LEFT JOIN docentes doc
            ON doc.id_docente = COALESCE(me.id_docente, cat.id_docente)
        LEFT JOIN previas p
            ON p.id_previa = me.id_previa
        WHERE me.id_previa IS NOT NULL
          AND me.id_catedra IS NOT NULL
          AND COALESCE(me.id_docente, cat.id_docente) IS NOT NULL
          AND cat.id_materia IS NOT NULL
          AND me.estado IN {$estadosValidos}
        ORDER BY
            CASE
                WHEN me.tipo_mesa = 'correlativa' THEN 0
                WHEN me.tipo_mesa = 'taller' THEN 1
                ELSE 2
            END ASC,
            me.prioridad DESC,
            me.id_taller ASC,
            me.id_previa ASC,
            cat.id_materia ASC,
            COALESCE(me.id_docente, cat.id_docente) ASC,
            me.id_mesa ASC
    ");

    $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $mapaNumeros = [];
    $grupos = [];
    $siguienteNumero = 1;
    $actualizadas = 0;
    $totalFilasTaller = 0;
    $totalMesasTaller = 0;
    $totalFilasDocenteMateria = 0;
    $totalMesasDocenteMateria = 0;

    $stmtUpdate = $pdo->prepare("
        UPDATE mesas
        SET numero_mesa = ?,
            id_docente = ?
        WHERE id_mesa = ?
    ");

    foreach ($filas as $fila) {
        $idMesa = (int)$fila['id_mesa'];
        $tipoMesa = (string)$fila['tipo_mesa'];
        $idPrevia = (int)$fila['id_previa'];
        $idTaller = $fila['id_taller'] !== null ? (int)$fila['id_taller'] : null;
        $idMateria = (int)$fila['id_materia'];
        $idDocente = $fila['mesa_id_docente'] !== null
            ? (int)$fila['mesa_id_docente']
            : (int)$fila['catedra_id_docente'];

        if ($tipoMesa === 'taller' && $idTaller !== null) {
            // Mesa especial: una mesa lógica por cada previa de taller.
            // No se mezcla con otras previas aunque tenga mismo docente/materia.
            $claveGrupo = 'taller|' . $idPrevia . '|' . $idTaller;
            $totalFilasTaller++;
        } else {
            // Mesas normales/correlativas: misma materia + mismo docente comparten número.
            $claveGrupo = 'docente_materia|' . $idDocente . '|' . $idMateria;
            $totalFilasDocenteMateria++;
        }

        if (!isset($mapaNumeros[$claveGrupo])) {
            $mapaNumeros[$claveGrupo] = $siguienteNumero;
            $grupos[$claveGrupo] = [
                'numero_mesa' => $siguienteNumero,
                'criterio' => $tipoMesa === 'taller' && $idTaller !== null ? 'taller_exclusivo_por_previa' : 'docente_materia',
                'tipo_mesa' => $tipoMesa,
                'id_taller' => $idTaller,
                'id_previa' => $tipoMesa === 'taller' ? $idPrevia : null,
                'dni' => $tipoMesa === 'taller' ? (string)($fila['dni'] ?? '') : null,
                'alumno' => $tipoMesa === 'taller' ? (string)($fila['alumno'] ?? '') : null,
                'id_docente' => $tipoMesa === 'taller' ? null : $idDocente,
                'docente' => $tipoMesa === 'taller' ? null : (string)($fila['docente'] ?? ''),
                'id_materia' => $tipoMesa === 'taller' ? null : $idMateria,
                'materia' => $tipoMesa === 'taller' ? null : (string)($fila['materia'] ?? ''),
                'cantidad_filas' => 0,
                'materias' => [],
                '_materias_index' => [],
                'docentes' => [],
                '_docentes_index' => [],
            ];

            if ($tipoMesa === 'taller' && $idTaller !== null) {
                $totalMesasTaller++;
            } else {
                $totalMesasDocenteMateria++;
            }

            $siguienteNumero++;
        }

        $numeroMesa = (int)$mapaNumeros[$claveGrupo];
        $grupos[$claveGrupo]['cantidad_filas']++;

        mesas_examen_agregar_unico(
            $grupos[$claveGrupo],
            'materias',
            '_materias_index',
            $idMateria,
            (string)($fila['materia'] ?? '')
        );

        mesas_examen_agregar_unico(
            $grupos[$claveGrupo],
            'docentes',
            '_docentes_index',
            $idDocente,
            (string)($fila['docente'] ?? '')
        );

        $stmtUpdate->execute([
            $numeroMesa,
            $idDocente,
            $idMesa,
        ]);

        $actualizadas += $stmtUpdate->rowCount();
    }

    $stmtObservadas = $pdo->query("
        SELECT COUNT(*)
        FROM mesas me
        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra
        WHERE me.estado IN ('borrador', 'armada', 'observada')
          AND (
                me.id_previa IS NULL
                OR me.id_catedra IS NULL
                OR cat.id_materia IS NULL
                OR COALESCE(me.id_docente, cat.id_docente) IS NULL
          )
    ");
    $sinDatosParaNumerar = (int)$stmtObservadas->fetchColumn();

    $gruposOrdenados = array_values($grupos);

    foreach ($gruposOrdenados as &$grupo) {
        $grupo['materia'] = $grupo['materia'] ?: mesas_examen_texto_lista($grupo['materias']);
        $grupo['docente'] = $grupo['docente'] ?: mesas_examen_texto_lista($grupo['docentes']);
        unset($grupo['_materias_index'], $grupo['_docentes_index']);
    }
    unset($grupo);

    usort($gruposOrdenados, static fn(array $a, array $b): int => $a['numero_mesa'] <=> $b['numero_mesa']);

    return [
        'fase' => 4,
        'criterio' => 'taller_exclusivo_por_previa_y_docente_materia_para_el_resto',
        'descripcion' => 'Los talleres usan un numero_mesa exclusivo por id_previa + id_taller. El resto agrupa por mismo docente y misma materia obtenida desde la cátedra.',
        'reiniciar_numeracion' => $reiniciarNumeracion,
        'fecha_turno_limpiados' => $limpiarFechaTurno,
        'total_filas_validas' => count($filas),
        'total_filas_actualizadas' => $actualizadas,
        'total_mesas_generadas' => count($gruposOrdenados),
        'total_filas_taller' => $totalFilasTaller,
        'total_mesas_taller_exclusivas' => $totalMesasTaller,
        'total_filas_docente_materia' => $totalFilasDocenteMateria,
        'total_mesas_docente_materia' => $totalMesasDocenteMateria,
        'sin_datos_para_numerar' => $sinDatosParaNumerar,
        'primeros_grupos' => array_slice($gruposOrdenados, 0, 25),
    ];
}
