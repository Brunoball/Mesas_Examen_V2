<?php
// backend/modules/mesas/armado_mesas/fases/fase_1_generar_borrador.php
declare(strict_types=1);

/**
 * Fase 1 actual - Crear borrador base y numerar mesas.
 *
 * Regla especial de TALLER:
 * - Si la previa pertenece a un taller, NO se inserta una sola fila.
 * - Se expanden todas las cátedras activas de ese taller.
 * - Cada materia del taller ya viene definida por id_catedra en talleres_materias.
 * - Todas esas filas conservan el MISMO id_previa e id_taller.
 * - La numeración posterior asigna un numero_mesa exclusivo por id_previa + id_taller.
 * - De esta forma, dos alumnos/precias del mismo taller NO quedan juntos por docente/materia.
 */
function mesas_armado_crear(): void
{
    $pdo = db();
    $body = request_body();

    // Por defecto se limpia todo el armado operativo anterior para que no queden restos.
    $limpiarBorrador = filter_var($body['limpiar_borrador'] ?? true, FILTER_VALIDATE_BOOLEAN);

    try {
        $previas = mesas_armado_obtener_previas_para_armar($pdo);

        if (count($previas) === 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No hay previas inscriptas para armar mesas.',
            ], 422);
        }

        $pdo->beginTransaction();

        if ($limpiarBorrador) {
            // Se limpia también lo numerado porque esta etapa recalcula desde cero.
            $pdo->exec("
                DELETE FROM mesas
                WHERE estado IN ('borrador', 'observada', 'armada')
            ");
        }

        $insertados = 0;
        $actualizados = 0;
        $observados = 0;
        $sinCatedra = 0;
        $sinDocente = 0;
        $tipoSimple = 0;
        $tipoTaller = 0;
        $tipoCorrelativa = 0;
        $previasTallerExpandidas = 0;
        $filasTallerGeneradas = 0;
        $materiasTallerSinCatedra = 0;
        $materiasTallerSinDocente = 0;

        $stmtInsert = $pdo->prepare("
            INSERT INTO mesas (
                numero_mesa,
                prioridad,
                tipo_mesa,
                id_taller,
                id_catedra,
                id_previa,
                id_docente,
                fecha_mesa,
                id_turno,
                estado,
                observacion
            ) VALUES (
                NULL,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                NULL,
                NULL,
                ?,
                ?
            )
        ");

        foreach ($previas as $previa) {
            $idPrevia = (int)$previa['id_previa'];
            $idCatedra = $previa['id_catedra'] !== null ? (int)$previa['id_catedra'] : null;
            $idDocente = $previa['id_docente'] !== null ? (int)$previa['id_docente'] : null;
            $idTaller = $previa['id_taller'] !== null ? (int)$previa['id_taller'] : null;
            $tieneCorrelativa = (int)$previa['tiene_correlativa_alumno'] === 1;

            // Si no se limpió todo el borrador, igual se limpian las filas de esta previa
            // para poder rearmar correctamente talleres expandidos sin dejar registros viejos.
            if (!$limpiarBorrador) {
                $actualizados += mesas_armado_eliminar_mesas_por_previa($pdo, $idPrevia);
            }

            /**
             * TALLER: mesa especial, exclusiva por previa.
             * Se expande a todas las materias del taller correspondiente al curso.
             */
            if ($idTaller !== null) {
                $tipoTaller++;
                $previasTallerExpandidas++;

                $materiasTaller = mesas_armado_obtener_materias_de_taller(
                    $pdo,
                    $idTaller,
                    (int)$previa['materia_id_curso'],
                    (int)$previa['materia_id_division']
                );

                if (count($materiasTaller) === 0) {
                    $stmtInsert->execute([
                        1,
                        'taller',
                        $idTaller,
                        $idCatedra,
                        $idPrevia,
                        $idDocente,
                        'observada',
                        'La previa pertenece a un taller, pero el taller no tiene materias activas cargadas para ese curso/división.',
                    ]);

                    $insertados++;
                    $observados++;
                    continue;
                }

                foreach ($materiasTaller as $materiaTaller) {
                    $idCatedraTaller = $materiaTaller['id_catedra'] !== null ? (int)$materiaTaller['id_catedra'] : null;
                    $idDocenteTaller = $materiaTaller['id_docente'] !== null ? (int)$materiaTaller['id_docente'] : null;

                    $estado = 'borrador';
                    $observacion = null;

                    if ($idCatedraTaller === null) {
                        $estado = 'observada';
                        $observacion = 'Materia de taller sin id_catedra configurado en talleres_materias.';
                        $materiasTallerSinCatedra++;
                        $sinCatedra++;
                        $observados++;
                    } elseif ($idDocenteTaller === null) {
                        $estado = 'observada';
                        $observacion = 'Cátedra de taller sin docente activo asignado.';
                        $materiasTallerSinDocente++;
                        $sinDocente++;
                        $observados++;
                    }

                    $stmtInsert->execute([
                        1,
                        'taller',
                        $idTaller,
                        $idCatedraTaller,
                        $idPrevia,
                        $idDocenteTaller,
                        $estado,
                        $observacion,
                    ]);

                    $insertados++;
                    $filasTallerGeneradas++;
                }

                continue;
            }

            if ($tieneCorrelativa) {
                $tipoMesa = 'correlativa';
                $prioridad = 2;
                $tipoCorrelativa++;
            } else {
                $tipoMesa = 'simple';
                $prioridad = 0;
                $tipoSimple++;
            }

            $estado = 'borrador';
            $observacion = null;

            if ($idCatedra === null) {
                $estado = 'observada';
                $observacion = 'No se encontró cátedra para materia + curso + división.';
                $sinCatedra++;
                $observados++;
            } elseif ($idDocente === null) {
                $estado = 'observada';
                $observacion = 'La cátedra existe, pero no tiene docente activo asignado.';
                $sinDocente++;
                $observados++;
            }

            $stmtInsert->execute([
                $prioridad,
                $tipoMesa,
                null,
                $idCatedra,
                $idPrevia,
                $idDocente,
                $estado,
                $observacion,
            ]);

            $insertados++;
        }

        // Numeración dentro de la misma transacción.
        $resultadoNumeracion = mesas_armado_numerar_por_docente_materia_core(
            $pdo,
            true,   // reiniciar numeración
            true,   // limpiar fecha/turno
            true    // incluir armadas si existieran
        );

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Armado generado y numerado correctamente. Los talleres se expanden por todas sus materias y quedan con mesa exclusiva por previa.',
            'data' => [
                'total_previas_procesadas' => count($previas),
                'insertados' => $insertados,
                'actualizados' => $actualizados,
                'observados' => $observados,
                'sin_catedra' => $sinCatedra,
                'sin_docente' => $sinDocente,
                'tipo_simple' => $tipoSimple,
                'tipo_taller' => $tipoTaller,
                'tipo_correlativa' => $tipoCorrelativa,
                'previas_taller_expandidas' => $previasTallerExpandidas,
                'filas_taller_generadas' => $filasTallerGeneradas,
                'materias_taller_sin_catedra' => $materiasTallerSinCatedra,
                'materias_taller_sin_docente' => $materiasTallerSinDocente,
                'fecha_mesa_generada' => false,
                'turno_generado' => false,
                'numero_mesa_generado' => true,
                'criterio_numero_mesa' => 'taller_exclusivo_por_previa_y_docente_materia_para_el_resto',
                'numeracion' => $resultadoNumeracion,
                'detalle' => 'Esta fase cruza previas con cátedras/docentes. Si la previa es taller, crea una fila por cada id_catedra del taller con el mismo id_previa y un numero_mesa exclusivo para esa previa.',
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'mesas_armado_crear');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al crear y numerar el armado inicial de mesas.',
        ], 500);
    }
}
