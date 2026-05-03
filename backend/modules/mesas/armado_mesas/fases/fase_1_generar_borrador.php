<?php
// backend/modules/mesas/armado_mesas/fases/fase_1_generar_borrador.php
declare(strict_types=1);

/**
 * Primera fase real de armado:
 *
 * 1. Toma previas inscriptas:
 *      inscripcion = 1
 *      activo = 1
 *      id_condicion = 3
 *
 * 2. Cruza:
 *      previas.id_materia
 *      previas.materia_id_curso
 *      previas.materia_id_division
 *
 *    contra:
 *      catedras.id_materia
 *      catedras.id_curso
 *      catedras.id_division
 *
 * 3. Obtiene docente desde catedras.id_docente.
 *
 * 4. Inserta/actualiza registros en mesas.
 *
 * Todavía NO numera mesas finales.
 * numero_mesa queda NULL para una fase posterior.
 */
function mesas_armado_crear(): void
{
    $pdo = db();
    $body = request_body();

    $fechaInicio = trim((string)($body['fecha_inicio'] ?? ''));
    $fechaFin = trim((string)($body['fecha_fin'] ?? ''));
    $limpiarBorrador = filter_var($body['limpiar_borrador'] ?? true, FILTER_VALIDATE_BOOLEAN);
    $excluirFinesSemana = filter_var($body['excluir_fines_semana'] ?? true, FILTER_VALIDATE_BOOLEAN);

    if (!mesas_armado_fecha_valida($fechaInicio)) {
        json_response([
            'exito' => false,
            'mensaje' => 'La fecha de inicio no es válida.',
        ], 422);
    }

    if (!mesas_armado_fecha_valida($fechaFin)) {
        json_response([
            'exito' => false,
            'mensaje' => 'La fecha de finalización no es válida.',
        ], 422);
    }

    if ($fechaFin < $fechaInicio) {
        json_response([
            'exito' => false,
            'mensaje' => 'La fecha de finalización no puede ser menor que la fecha de inicio.',
        ], 422);
    }

    try {
        $slots = mesas_armado_obtener_slots($pdo, $fechaInicio, $fechaFin, $excluirFinesSemana);

        if (count($slots) === 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No hay fechas/turnos disponibles para el rango seleccionado.',
            ], 422);
        }

        $previas = mesas_armado_obtener_previas_para_armar($pdo);

        if (count($previas) === 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No hay previas inscriptas para armar mesas.',
            ], 422);
        }

        $bloqueosDocentes = mesas_armado_obtener_bloqueos_docentes($pdo);

        $pdo->beginTransaction();

        if ($limpiarBorrador) {
            $pdo->exec("
                DELETE FROM mesas
                WHERE numero_mesa IS NULL
                  AND estado IN ('borrador', 'observada')
            ");
        }

        $insertados = 0;
        $actualizados = 0;
        $observados = 0;
        $sinCatedra = 0;
        $sinDocente = 0;
        $sinSlot = 0;

        $slotIndex = 0;
        $slotsPorCatedra = [];
        $ocupacionAlumno = [];

        foreach ($previas as $previa) {
            $idPrevia = (int)$previa['id_previa'];
            $idCatedra = $previa['id_catedra'] !== null ? (int)$previa['id_catedra'] : null;
            $idDocente = $previa['id_docente'] !== null ? (int)$previa['id_docente'] : null;
            $idTaller = $previa['id_taller'] !== null ? (int)$previa['id_taller'] : null;
            $dni = (string)$previa['dni'];

            $tieneCorrelativa = (int)$previa['tiene_correlativa_alumno'] === 1;

            if ($tieneCorrelativa) {
                $tipoMesa = 'correlativa';
                $prioridad = 2;
            } elseif ($idTaller !== null) {
                $tipoMesa = 'taller';
                $prioridad = 1;
            } else {
                $tipoMesa = 'simple';
                $prioridad = 0;
            }

            $estado = 'borrador';
            $observacion = null;
            $fechaMesa = null;
            $idTurno = null;

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
            } else {
                $slot = null;
                $claveCatedra = (string)$idCatedra;

                if (isset($slotsPorCatedra[$claveCatedra])) {
                    $slotCatedra = $slotsPorCatedra[$claveCatedra];

                    $claveAlumno = mesas_armado_clave_ocupacion_alumno(
                        $dni,
                        $slotCatedra['fecha'],
                        (int)$slotCatedra['id_turno']
                    );

                    if (
                        !isset($ocupacionAlumno[$claveAlumno])
                        && !mesas_armado_docente_bloqueado(
                            $bloqueosDocentes,
                            $idDocente,
                            $slotCatedra['fecha'],
                            (int)$slotCatedra['id_turno']
                        )
                    ) {
                        $slot = $slotCatedra;
                    }
                }

                if ($slot === null) {
                    $slot = mesas_armado_buscar_slot_disponible(
                        $slots,
                        $bloqueosDocentes,
                        $idDocente,
                        $dni,
                        $ocupacionAlumno,
                        $slotIndex
                    );

                    if ($slot !== null && !isset($slotsPorCatedra[$claveCatedra])) {
                        $slotsPorCatedra[$claveCatedra] = $slot;
                    }
                }

                if ($slot === null) {
                    $estado = 'observada';
                    $observacion = 'No se encontró fecha/turno disponible para el docente dentro del rango.';
                    $sinSlot++;
                    $observados++;
                } else {
                    $fechaMesa = $slot['fecha'];
                    $idTurno = (int)$slot['id_turno'];

                    $claveAlumno = mesas_armado_clave_ocupacion_alumno($dni, $fechaMesa, $idTurno);
                    $ocupacionAlumno[$claveAlumno] = true;
                }
            }

            $idMesaExistente = mesas_armado_obtener_mesa_por_previa($pdo, $idPrevia);

            if ($idMesaExistente > 0) {
                $stmtUpdate = $pdo->prepare("
                    UPDATE mesas
                    SET
                        prioridad = ?,
                        tipo_mesa = ?,
                        id_taller = ?,
                        id_catedra = ?,
                        id_docente = ?,
                        fecha_mesa = ?,
                        id_turno = ?,
                        estado = ?,
                        observacion = ?
                    WHERE id_mesa = ?
                ");

                $stmtUpdate->execute([
                    $prioridad,
                    $tipoMesa,
                    $idTaller,
                    $idCatedra,
                    $idDocente,
                    $fechaMesa,
                    $idTurno,
                    $estado,
                    $observacion,
                    $idMesaExistente,
                ]);

                $actualizados++;
            } else {
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
                        ?,
                        ?,
                        ?,
                        ?
                    )
                ");

                $stmtInsert->execute([
                    $prioridad,
                    $tipoMesa,
                    $idTaller,
                    $idCatedra,
                    $idPrevia,
                    $idDocente,
                    $fechaMesa,
                    $idTurno,
                    $estado,
                    $observacion,
                ]);

                $insertados++;
            }
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Primera fase de armado generada correctamente.',
            'data' => [
                'total_previas_procesadas' => count($previas),
                'insertados' => $insertados,
                'actualizados' => $actualizados,
                'observados' => $observados,
                'sin_catedra' => $sinCatedra,
                'sin_docente' => $sinDocente,
                'sin_fecha_turno' => $sinSlot,
                'fecha_inicio' => $fechaInicio,
                'fecha_fin' => $fechaFin,
                'numero_mesa_generado' => false,
                'detalle' => 'Esta fase cruza previas con cátedras/docentes e inserta registros base en mesas. La numeración final de mesas queda pendiente.',
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'mesas_armado_crear');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al crear el armado inicial de mesas.',
        ], 500);
    }
}
