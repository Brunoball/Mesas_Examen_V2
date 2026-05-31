<?php
// backend/modules/mesas/armado_mesas_docentes/fases/fase_1_generar_borrador.php
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
function mesas_armado_docentes_crear(): void
{
    $pdo = db();
    $body = request_body();

    $fechaInicio = mesas_armado_docentes_leer_fecha_parametro($body, ['fecha_inicio', 'fechaInicio', 'inicio', 'desde']);
    $fechaFin = mesas_armado_docentes_leer_fecha_parametro($body, ['fecha_fin', 'fechaFin', 'fin', 'hasta']);
    $modoTurnos = mesas_armado_docentes_normalizar_modo_turnos($body['modo_turnos'] ?? $body['modoTurnos'] ?? $body['turno_modo'] ?? $body['turnoModo'] ?? 'combinado');
    $debeCalendarizar = $fechaInicio !== null && $fechaFin !== null;
    // Por defecto, si se calendariza correctamente, también se genera la mesa final agrupada.
    // Se puede desactivar enviando generar_grupos=false.
    $generarGruposFinales = filter_var($body['generar_grupos'] ?? true, FILTER_VALIDATE_BOOLEAN);

    // Por defecto se limpia todo el armado operativo anterior para que no queden restos.
    $limpiarBorrador = filter_var($body['limpiar_borrador'] ?? true, FILTER_VALIDATE_BOOLEAN);

    try {
        $previas = mesas_armado_docentes_obtener_previas_para_armar($pdo);

        if (count($previas) === 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No hay previas inscriptas para armar mesas.',
            ], 422);
        }

        // IMPORTANTE: mesas_armado_docentes_grupos_asegurar_tablas ejecuta CREATE TABLE IF NOT EXISTS,
        // que en MySQL/MariaDB dispara un commit implícito y rompe cualquier transacción activa.
        // Por eso se llama ANTES de beginTransaction().
        if (function_exists('mesas_armado_rango_asegurar_tabla')) {
            mesas_armado_rango_asegurar_tabla($pdo);
        }

        if ($limpiarBorrador && function_exists('mesas_armado_docentes_grupos_asegurar_tablas')) {
            mesas_armado_docentes_grupos_asegurar_tablas($pdo);
        }

        $pdo->beginTransaction();

        if ($limpiarBorrador) {
            if (function_exists('mesas_notificaciones_cleanup_todo')) {
                mesas_notificaciones_cleanup_todo($pdo);
            }

            if (function_exists('mesas_armado_docentes_grupos_asegurar_tablas')) {
                $pdo->exec('DELETE FROM mesas_no_agrupadas');
                $pdo->exec('DELETE FROM mesas_grupos');
            }

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
                $actualizados += mesas_armado_docentes_eliminar_mesas_por_previa($pdo, $idPrevia);
            }

            /**
             * TALLER: mesa especial, exclusiva por previa.
             * Se expande a todas las materias del taller correspondiente al curso.
             */
            if ($idTaller !== null) {
                $tipoTaller++;
                $previasTallerExpandidas++;

                $materiasTaller = mesas_armado_docentes_obtener_materias_de_taller(
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
        $resultadoNumeracion = mesas_armado_docentes_numerar_por_docente_materia_core(
            $pdo,
            true,   // reiniciar numeración
            true,   // limpiar fecha/turno
            true    // incluir armadas si existieran
        );

        $resultadoCalendarizacion = null;

        /*
         * Importante:
         * El modal ya envía fecha_inicio y fecha_fin. Por eso esta acción principal
         * no debe quedarse solamente en numero_mesa: después de numerar valida el
         * armado y asigna fecha_mesa/id_turno en la misma tabla `mesas`.
         */
        if ($debeCalendarizar) {
            $resultadoCalendarizacion = mesas_armado_docentes_fase_3_validar_y_calendarizar_core(
                $pdo,
                (string)$fechaInicio,
                (string)$fechaFin,
                [
                    'auto_reparar_numeracion' => false,
                    'limpiar_asignacion_previa' => true,
                    'marcar_armada' => false,
                    // La acción principal calendariza las mesas válidas y deja observadas las problemáticas.
                    'permitir_observadas' => true,
                    'modo_turnos' => $modoTurnos,
                ]
            );
        }

        if ($debeCalendarizar && function_exists('mesas_armado_rango_guardar_actual')) {
            mesas_armado_rango_guardar_actual($pdo, (string)$fechaInicio, (string)$fechaFin, 'docentes');
        }

        $pdo->commit();

        $resultadoGruposFinales = null;
        $errorGruposFinales = null;

        if ($debeCalendarizar && $generarGruposFinales) {
            try {
                $resultadoGruposFinales = mesas_armado_docentes_grupos_finales_core($pdo, [
                    'limpiar_grupos' => true,
                    'min_numeros' => 2,
                    'max_numeros' => 4,
                    'confirmar_grupos' => false,
                    'fecha_inicio' => $fechaInicio,
                    'fecha_fin' => $fechaFin,
                    'modo_turnos' => $modoTurnos,
                ]);
            } catch (Throwable $eGrupos) {
                log_error($eGrupos, 'mesas_armado_docentes_crear_grupos_finales');
                $errorGruposFinales = 'El armado fue generado y calendarizado, pero falló la agrupación final de mesas.';
            }
        }

        $calendarizacionEjecutada = is_array($resultadoCalendarizacion)
            && (bool)($resultadoCalendarizacion['data']['calendarizacion_ejecutada'] ?? false);

        $calendarizacionCompleta = $calendarizacionEjecutada
            && (int)($resultadoCalendarizacion['data']['calendarizacion']['total_no_calendarizadas'] ?? 0) === 0;

        json_response([
            'exito' => true,
            'mensaje' => $calendarizacionEjecutada
                ? ($calendarizacionCompleta
                    ? 'Armado generado, numerado y calendarizado correctamente con fecha y turno.'
                    : 'Armado generado y calendarizado parcialmente. Algunas mesas quedaron observadas.')
                : 'Armado generado y numerado correctamente. No se calendarizó porque no se enviaron fecha_inicio y fecha_fin.',
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
                'fecha_mesa_generada' => $calendarizacionEjecutada,
                'turno_generado' => $calendarizacionEjecutada,
                'numero_mesa_generado' => true,
                'calendarizacion_ejecutada' => $calendarizacionEjecutada,
                'calendarizacion_completa' => $calendarizacionCompleta,
                'fecha_inicio' => $fechaInicio,
                'fecha_fin' => $fechaFin,
                'modo_turnos' => $modoTurnos,
                'criterio_numero_mesa' => 'taller_exclusivo_por_previa_y_docente_materia_para_el_resto',
                'numeracion' => $resultadoNumeracion,
                'fase_3_calendarizacion' => $resultadoCalendarizacion['data'] ?? null,
                'grupos_finales_generados' => is_array($resultadoGruposFinales),
                'fase_6_grupos_finales' => $resultadoGruposFinales,
                'error_grupos_finales' => $errorGruposFinales,
                'detalle' => 'Esta fase cruza previas con cátedras/docentes, numera, asigna fecha/turno y genera mesas_grupos cuando se enviaron fechas.',
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'mesas_armado_docentes_crear');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al crear y numerar el armado inicial de mesas.',
        ], 500);
    }
}
