<?php
// backend/modules/mesas/armado_mesas/fases/fase_3_agrupar_correlativas.php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Fase 3 - Validar armado y asignar fecha/turno
|--------------------------------------------------------------------------
| Esta fase hace dos cosas, en este orden:
| 1) Valida que las filas ya generadas en `mesas` estén completas y coherentes:
|    numero_mesa, previa, cátedra, docente, materia, taller y estado.
| 2) Si no hay errores bloqueantes, asigna fecha_mesa e id_turno por numero_mesa.
|
| Criterio de calendarización profesional:
| - Nunca usa sábados ni domingos.
| - Taller se maneja como mesa especial y nunca se mezcla dentro del mismo numero_mesa.
| - Correlativa NO es mesa especial aislada: se trata como mesa normal con prioridad académica.
| - Asigna fecha/turno a TODOS los numeros posibles, no deja normales en NULL por comodidad.
| - Compacta por area academica: intenta mandar mesas de la misma area al mismo slot.
| - Las correlativas anteriores y las mesas con más alumnos toman los primeros slots disponibles.
| - Las mesas chicas se ubican después, preferentemente en slots ya abiertos de su misma area.
| - Respeta docentes_bloques_no.
| - Evita que un mismo docente esté en dos mesas en el mismo slot.
| - Evita que un mismo alumno esté en dos mesas en el mismo slot.
| - Si una correlativa posterior depende de una anterior del mismo alumno,
|   la posterior se ubica en un slot posterior.
| - En una futura tabla mesas_grupos, solo se deben agrupar numeros del mismo slot
|   o moverlos juntos mediante reoptimización antes de confirmar.
|--------------------------------------------------------------------------
*/

function mesas_armado_fase_3_agrupar_correlativas(): void
{
    mesas_armado_fase_3_validar_y_calendarizar();
}

/**
 * Endpoint público de la fase 3.
 * Valida el armado actual y asigna fecha/turno. Usa transacción propia.
 */
function mesas_armado_fase_3_validar_y_calendarizar(): void
{
    $pdo = db();
    $body = request_body();

    $fechaInicio = mesas_armado_leer_fecha_parametro($body, ['fecha_inicio', 'fechaInicio', 'inicio', 'desde']);
    $fechaFin = mesas_armado_leer_fecha_parametro($body, ['fecha_fin', 'fechaFin', 'fin', 'hasta']);

    $opciones = [
        'auto_reparar_numeracion' => filter_var($body['auto_reparar_numeracion'] ?? $body['autoRepararNumeracion'] ?? true, FILTER_VALIDATE_BOOLEAN),
        'limpiar_asignacion_previa' => filter_var($body['limpiar_asignacion_previa'] ?? $body['limpiarAsignacionPrevia'] ?? true, FILTER_VALIDATE_BOOLEAN),
        'marcar_armada' => filter_var($body['marcar_armada'] ?? $body['marcarArmada'] ?? false, FILTER_VALIDATE_BOOLEAN),
        // En la acción directa de calendarización mantenemos validación estricta.
        'permitir_observadas' => filter_var($body['permitir_observadas'] ?? $body['permitirObservadas'] ?? false, FILTER_VALIDATE_BOOLEAN),
    ];

    try {
        if ($fechaInicio === null || $fechaFin === null) {
            json_response([
                'exito' => false,
                'mensaje' => 'Debés enviar fecha_inicio y fecha_fin para calendarizar las mesas.',
                'data' => [
                    'ejemplo' => [
                        'action' => 'mesas_armado_fase_3_calendarizar',
                        'fecha_inicio' => '2026-05-07',
                        'fecha_fin' => '2026-05-15',
                    ],
                ],
            ], 422);
        }

        $pdo->beginTransaction();

        $resultado = mesas_armado_fase_3_validar_y_calendarizar_core(
            $pdo,
            (string)$fechaInicio,
            (string)$fechaFin,
            $opciones
        );

        $pdo->commit();

        json_response([
            'exito' => (bool)$resultado['exito'],
            'mensaje' => (string)$resultado['mensaje'],
            'data' => $resultado['data'],
        ], (int)$resultado['http_status']);
    } catch (InvalidArgumentException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'mesas_armado_fase_3_validar_y_calendarizar');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al validar y calendarizar las mesas.',
        ], 500);
    }
}

/**
 * Núcleo reutilizable de calendarización.
 * No abre ni cierra transacción: lo usa tanto el endpoint directo como la acción
 * principal mesas_armado_crear para que el botón del modal ya deje fecha/turno.
 */
function mesas_armado_fase_3_validar_y_calendarizar_core(
    PDO $pdo,
    string $fechaInicio,
    string $fechaFin,
    array $opciones = []
): array {
    $autoRepararNumeracion = (bool)($opciones['auto_reparar_numeracion'] ?? true);
    $limpiarAsignacionPrevia = (bool)($opciones['limpiar_asignacion_previa'] ?? true);
    $marcarArmada = (bool)($opciones['marcar_armada'] ?? false);
    $permitirObservadas = (bool)($opciones['permitir_observadas'] ?? false);

    if (!mesas_armado_fecha_valida($fechaInicio) || !mesas_armado_fecha_valida($fechaFin)) {
        throw new InvalidArgumentException('Las fechas deben tener formato válido YYYY-MM-DD.');
    }

    if ($fechaFin < $fechaInicio) {
        throw new InvalidArgumentException('La fecha de fin no puede ser menor que la fecha de inicio.');
    }

    $slots = mesas_armado_obtener_slots($pdo, $fechaInicio, $fechaFin, true);

    if (count($slots) === 0) {
        return [
            'exito' => false,
            'http_status' => 422,
            'mensaje' => 'No hay slots hábiles disponibles en el rango enviado. El backend descarta sábados y domingos automáticamente.',
            'data' => [
                'fase' => 3,
                'fecha_inicio' => $fechaInicio,
                'fecha_fin' => $fechaFin,
                'excluir_fines_semana' => true,
                'calendarizacion_ejecutada' => false,
            ],
        ];
    }

    $numeracionReparada = null;
    $sinNumero = mesas_armado_contar_mesas_sin_numero($pdo);

    if ($sinNumero > 0 && $autoRepararNumeracion) {
        $numeracionReparada = mesas_armado_numerar_por_docente_materia_core(
            $pdo,
            true,
            true,
            true
        );
    }

    if ($limpiarAsignacionPrevia) {
        mesas_armado_limpiar_fechas_turnos($pdo);
    }

    $docentesNormalizados = mesas_armado_normalizar_docente_desde_catedra($pdo);
    $validacion = mesas_armado_validar_armado_actual_core($pdo);

    if (!$permitirObservadas && $validacion['errores_bloqueantes'] > 0) {
        return [
            'exito' => false,
            'http_status' => 422,
            'mensaje' => 'No se calendarizó porque primero hay que corregir observaciones del armado actual.',
            'data' => [
                'fase' => 3,
                'validacion' => $validacion,
                'numeracion_reparada' => $numeracionReparada,
                'docentes_normalizados' => $docentesNormalizados,
                'calendarizacion_ejecutada' => false,
            ],
        ];
    }

    $bloqueosDocentes = mesas_armado_obtener_bloqueos_docentes($pdo);
    $relacionesCorrelativas = mesas_armado_obtener_relaciones_correlativas_para_calendarizar($pdo);
    $grupos = mesas_armado_obtener_grupos_calendarizables($pdo, $relacionesCorrelativas, $bloqueosDocentes);

    if (count($grupos) === 0) {
        return [
            'exito' => false,
            'http_status' => 422,
            'mensaje' => 'No hay mesas válidas para calendarizar. Revisá que existan mesas en borrador con número, previa, cátedra y docente.',
            'data' => [
                'fase' => 3,
                'validacion' => $validacion,
                'numeracion_reparada' => $numeracionReparada,
                'docentes_normalizados' => $docentesNormalizados,
                'calendarizacion_ejecutada' => false,
            ],
        ];
    }

    $resultadoCalendarizacion = mesas_armado_calendarizar_grupos(
        $pdo,
        $grupos,
        $slots,
        $bloqueosDocentes,
        $relacionesCorrelativas,
        $marcarArmada
    );

    $exitoCompleto = $resultadoCalendarizacion['total_no_calendarizadas'] === 0;
    $hayCalendarizadas = $resultadoCalendarizacion['total_calendarizadas'] > 0;

    return [
        'exito' => $hayCalendarizadas,
        'http_status' => $exitoCompleto ? 200 : ($hayCalendarizadas ? 207 : 422),
        'mensaje' => $exitoCompleto
            ? 'Fase 3 completada: armado validado y fechas/turnos asignados correctamente.'
            : ($hayCalendarizadas
                ? 'Fase 3 ejecutada con observaciones: algunas mesas no pudieron ubicarse, pero las válidas ya tienen fecha y turno.'
                : 'Fase 3 no pudo asignar fecha/turno a ninguna mesa.'),
        'data' => [
            'fase' => 3,
            'criterio' => 'compactacion_por_area_prioridad_volumen_disponibilidad',
            'fecha_inicio' => $fechaInicio,
            'fecha_fin' => $fechaFin,
            'slots_habiles' => $slots,
            'total_slots_habiles' => count($slots),
            'excluir_fines_semana' => true,
            'marcar_armada' => $marcarArmada,
            'auto_reparar_numeracion' => $autoRepararNumeracion,
            'numeracion_reparada' => $numeracionReparada,
            'docentes_normalizados' => $docentesNormalizados,
            'validacion' => $validacion,
            'calendarizacion' => $resultadoCalendarizacion,
            'calendarizacion_ejecutada' => true,
        ],
    ];
}

function mesas_armado_leer_fecha_parametro(array $body, array $nombres): ?string
{
    foreach ($nombres as $nombre) {
        if (isset($body[$nombre]) && trim((string)$body[$nombre]) !== '') {
            return trim((string)$body[$nombre]);
        }

        if (isset($_GET[$nombre]) && trim((string)$_GET[$nombre]) !== '') {
            return trim((string)$_GET[$nombre]);
        }

        if (isset($_POST[$nombre]) && trim((string)$_POST[$nombre]) !== '') {
            return trim((string)$_POST[$nombre]);
        }
    }

    return null;
}

function mesas_armado_contar_mesas_sin_numero(PDO $pdo): int
{
    $stmt = $pdo->query("
        SELECT COUNT(*)
        FROM mesas
        WHERE estado IN ('borrador', 'armada')
          AND numero_mesa IS NULL
    ");

    return (int)$stmt->fetchColumn();
}

function mesas_armado_limpiar_fechas_turnos(PDO $pdo): void
{
    $pdo->exec("
        UPDATE mesas
        SET fecha_mesa = NULL,
            id_turno = NULL,
            estado = CASE WHEN estado = 'armada' THEN 'borrador' ELSE estado END
        WHERE estado IN ('borrador', 'armada')
    ");
}

function mesas_armado_normalizar_docente_desde_catedra(PDO $pdo): int
{
    $stmt = $pdo->prepare("
        UPDATE mesas me
        INNER JOIN catedras cat
            ON cat.id_catedra = me.id_catedra
           AND cat.activo = 1
        INNER JOIN docentes doc
            ON doc.id_docente = cat.id_docente
           AND doc.activo = 1
        SET me.id_docente = cat.id_docente
        WHERE me.estado IN ('borrador', 'armada', 'observada')
          AND cat.id_docente IS NOT NULL
          AND (me.id_docente IS NULL OR me.id_docente <> cat.id_docente)
    ");
    $stmt->execute();

    return $stmt->rowCount();
}

function mesas_armado_obtener_filas_para_validar(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT
            me.id_mesa,
            me.numero_mesa,
            me.prioridad,
            me.tipo_mesa,
            me.id_taller,
            me.id_catedra,
            me.id_previa,
            me.id_docente,
            me.fecha_mesa,
            me.id_turno,
            me.estado,
            me.observacion,

            p.dni,
            p.alumno,
            p.inscripcion,
            p.activo AS previa_activa,
            p.id_condicion,
            p.id_materia AS previa_id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.anio,

            cat.id_catedra AS cat_id_catedra,
            cat.id_materia AS cat_id_materia,
            cat.id_curso AS cat_id_curso,
            cat.id_division AS cat_id_division,
            cat.id_docente AS cat_id_docente,
            cat.activo AS cat_activa,

            mat.materia,
            mat.activo AS materia_activa,

            doc.docente,
            doc.activo AS docente_activo,

            tm.id_taller_materia AS taller_materia_valida
        FROM mesas me
        LEFT JOIN previas p
            ON p.id_previa = me.id_previa
        LEFT JOIN catedras cat
            ON cat.id_catedra = me.id_catedra
        LEFT JOIN materias mat
            ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)
        LEFT JOIN docentes doc
            ON doc.id_docente = me.id_docente
        LEFT JOIN talleres_materias tm
            ON tm.id_taller = me.id_taller
           AND tm.id_catedra = me.id_catedra
           AND tm.activo = 1
        WHERE me.estado IN ('borrador', 'armada', 'observada')
        ORDER BY
            me.numero_mesa IS NULL ASC,
            me.numero_mesa ASC,
            me.id_mesa ASC
    ");

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_armado_validar_armado_actual_core(PDO $pdo): array
{
    $filas = mesas_armado_obtener_filas_para_validar($pdo);

    $erroresPorMesa = [];
    $erroresPorGrupo = [];
    $grupos = [];
    $idsConError = [];
    $idsSinError = [];

    foreach ($filas as $fila) {
        $idMesa = (int)$fila['id_mesa'];
        $numeroMesa = $fila['numero_mesa'] !== null ? (int)$fila['numero_mesa'] : null;
        $tipoMesa = (string)$fila['tipo_mesa'];
        $errores = [];

        if ($numeroMesa === null || $numeroMesa <= 0) {
            $errores[] = 'sin_numero_mesa';
        }

        if ($fila['id_previa'] === null || $fila['dni'] === null) {
            $errores[] = 'previa_no_encontrada';
        } else {
            if ((int)$fila['previa_activa'] !== 1) {
                $errores[] = 'previa_inactiva';
            }

            if ((int)$fila['inscripcion'] !== 1) {
                $errores[] = 'previa_no_inscripta';
            }

            if ((int)$fila['id_condicion'] !== 3) {
                $errores[] = 'condicion_no_corresponde_a_previa';
            }
        }

        if ($fila['id_catedra'] === null || $fila['cat_id_catedra'] === null) {
            $errores[] = 'catedra_no_encontrada';
        } else {
            if ((int)$fila['cat_activa'] !== 1) {
                $errores[] = 'catedra_inactiva';
            }

            if ((int)$fila['cat_id_curso'] !== (int)$fila['materia_id_curso'] || (int)$fila['cat_id_division'] !== (int)$fila['materia_id_division']) {
                $errores[] = 'catedra_no_coincide_con_curso_division_de_la_previa';
            }

            if ($tipoMesa !== 'taller' && (int)$fila['cat_id_materia'] !== (int)$fila['previa_id_materia']) {
                $errores[] = 'catedra_no_coincide_con_materia_de_la_previa';
            }
        }

        if ($fila['id_docente'] === null || $fila['docente'] === null) {
            $errores[] = 'docente_no_resuelto';
        } else {
            if ((int)$fila['docente_activo'] !== 1) {
                $errores[] = 'docente_inactivo';
            }

            if ($fila['cat_id_docente'] !== null && (int)$fila['id_docente'] !== (int)$fila['cat_id_docente']) {
                $errores[] = 'docente_no_coincide_con_catedra';
            }
        }

        if ($fila['materia'] === null) {
            $errores[] = 'materia_no_encontrada';
        } elseif ((int)$fila['materia_activa'] !== 1) {
            $errores[] = 'materia_inactiva';
        }

        if ($tipoMesa === 'taller') {
            if ($fila['id_taller'] === null) {
                $errores[] = 'taller_sin_id_taller';
            } elseif ($fila['taller_materia_valida'] === null) {
                $errores[] = 'catedra_no_pertenece_al_taller';
            }
        }

        if ($numeroMesa !== null) {
            $grupoKey = (string)$numeroMesa;

            if (!isset($grupos[$grupoKey])) {
                $grupos[$grupoKey] = [
                    'numero_mesa' => $numeroMesa,
                    'ids_mesa' => [],
                    'tipos' => [],
                    'id_talleres' => [],
                    'id_previas' => [],
                    'id_docentes' => [],
                    'id_materias' => [],
                    'filas' => [],
                ];
            }

            $grupos[$grupoKey]['ids_mesa'][] = $idMesa;
            $grupos[$grupoKey]['tipos'][$tipoMesa] = true;

            if ($fila['id_taller'] !== null) {
                $grupos[$grupoKey]['id_talleres'][(string)$fila['id_taller']] = true;
            }

            if ($fila['id_previa'] !== null) {
                $grupos[$grupoKey]['id_previas'][(string)$fila['id_previa']] = true;
            }

            if ($fila['id_docente'] !== null) {
                $grupos[$grupoKey]['id_docentes'][(string)$fila['id_docente']] = true;
            }

            if ($fila['cat_id_materia'] !== null) {
                $grupos[$grupoKey]['id_materias'][(string)$fila['cat_id_materia']] = true;
            }

            $grupos[$grupoKey]['filas'][] = $fila;
        }

        if (count($errores) > 0) {
            $erroresPorMesa[] = [
                'id_mesa' => $idMesa,
                'numero_mesa' => $numeroMesa,
                'errores' => $errores,
            ];
            $idsConError[$idMesa] = implode(' | ', $errores);
        } else {
            $idsSinError[$idMesa] = true;
        }
    }

    foreach ($grupos as $grupo) {
        $erroresGrupo = [];
        $tipos = array_keys($grupo['tipos']);

        $tieneTaller = in_array('taller', $tipos, true);
        $tieneNormal = in_array('simple', $tipos, true) || in_array('correlativa', $tipos, true);

        /*
         * Regla corregida:
         * - simple + correlativa ES válido. Una correlativa no deja de ser una
         *   materia normal; solo se usa como prioridad/orden académico.
         * - taller NO se mezcla con nada. Taller sí es mesa especial: va solo,
         *   con sus cátedras/materias expandidas y el mismo id_previa/id_taller.
         */
        if ($tieneTaller && $tieneNormal) {
            $erroresGrupo[] = 'numero_mesa_con_taller_mezclado_con_mesa_normal';
        }

        if ($tieneTaller) {
            if (count($grupo['id_previas']) !== 1) {
                $erroresGrupo[] = 'taller_con_mas_de_una_previa_en_el_mismo_numero';
            }

            if (count($grupo['id_talleres']) !== 1) {
                $erroresGrupo[] = 'taller_con_mas_de_un_id_taller_en_el_mismo_numero';
            }
        } else {
            if (count($grupo['id_docentes']) !== 1) {
                $erroresGrupo[] = 'mesa_normal_con_mas_de_un_docente';
            }

            if (count($grupo['id_materias']) !== 1) {
                $erroresGrupo[] = 'mesa_normal_con_mas_de_una_materia';
            }
        }

        if (count($erroresGrupo) > 0) {
            $erroresPorGrupo[] = [
                'numero_mesa' => $grupo['numero_mesa'],
                'errores' => $erroresGrupo,
                'ids_mesa' => $grupo['ids_mesa'],
            ];

            foreach ($grupo['ids_mesa'] as $idMesaGrupo) {
                $idsConError[(int)$idMesaGrupo] = implode(' | ', $erroresGrupo);
                unset($idsSinError[(int)$idMesaGrupo]);
            }
        }
    }

    mesas_armado_actualizar_estado_validacion($pdo, $idsConError, array_keys($idsSinError));

    return [
        'total_filas_revisadas' => count($filas),
        'total_mesas_logicas_revisadas' => count($grupos),
        'errores_bloqueantes' => count($idsConError),
        'total_errores_por_fila' => count($erroresPorMesa),
        'total_errores_por_grupo' => count($erroresPorGrupo),
        'errores_por_fila' => array_slice($erroresPorMesa, 0, 50),
        'errores_por_grupo' => array_slice($erroresPorGrupo, 0, 50),
        'detalle' => count($idsConError) === 0
            ? 'El armado actual está completo: todas las filas tienen número, previa, cátedra y docente coherentes.'
            : 'Hay filas o grupos observados. Corregí esos casos antes de calendarizar.',
    ];
}

function mesas_armado_actualizar_estado_validacion(PDO $pdo, array $idsConError, array $idsSinError): void
{
    if (count($idsConError) > 0) {
        $stmtError = $pdo->prepare("
            UPDATE mesas
            SET estado = 'observada',
                observacion = ?
            WHERE id_mesa = ?
        ");

        foreach ($idsConError as $idMesa => $observacion) {
            $stmtError->execute([
                mb_substr($observacion, 0, 255, 'UTF-8'),
                (int)$idMesa,
            ]);
        }
    }

    if (count($idsSinError) > 0) {
        $placeholders = implode(',', array_fill(0, count($idsSinError), '?'));
        $stmtOk = $pdo->prepare("
            UPDATE mesas
            SET estado = 'borrador',
                observacion = NULL
            WHERE id_mesa IN ({$placeholders})
              AND estado IN ('borrador', 'armada', 'observada')
        ");
        $stmtOk->execute(array_map('intval', $idsSinError));
    }
}

function mesas_armado_obtener_relaciones_correlativas_para_calendarizar(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT
            p1.id_previa AS id_previa_base,
            p2.id_previa AS id_previa_relacionada,
            p1.dni,
            mc.tipo,
            COALESCE(mc.orden, 999999) AS orden
        FROM materias_correlativas mc
        INNER JOIN previas p1
            ON p1.id_materia = mc.id_materia
           AND p1.materia_id_curso = mc.id_curso
           AND p1.activo = 1
           AND p1.inscripcion = 1
           AND p1.id_condicion = 3
        INNER JOIN previas p2
            ON p2.dni = p1.dni
           AND p2.id_materia = mc.id_materia_relacionada
           AND p2.materia_id_curso = mc.id_curso_relacionada
           AND p2.activo = 1
           AND p2.inscripcion = 1
           AND p2.id_condicion = 3
        WHERE mc.activo = 1
          AND mc.bloquea_armado = 1
        ORDER BY p1.dni ASC, orden ASC
    ");

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $roles = [];
    $anterioresPorPosterior = [];
    $pares = [];

    foreach ($rows as $row) {
        $idBase = (int)$row['id_previa_base'];
        $idRelacionada = (int)$row['id_previa_relacionada'];
        $tipo = (string)$row['tipo'];

        if ($tipo === 'anterior') {
            $idAnterior = $idBase;
            $idPosterior = $idRelacionada;
            $roles[$idAnterior] = min($roles[$idAnterior] ?? 9, 0);
            $roles[$idPosterior] = min($roles[$idPosterior] ?? 9, 2);
        } elseif ($tipo === 'posterior') {
            $idAnterior = $idRelacionada;
            $idPosterior = $idBase;
            $roles[$idAnterior] = min($roles[$idAnterior] ?? 9, 0);
            $roles[$idPosterior] = min($roles[$idPosterior] ?? 9, 2);
        } else {
            $idAnterior = null;
            $idPosterior = null;
            $roles[$idBase] = min($roles[$idBase] ?? 9, 1);
            $roles[$idRelacionada] = min($roles[$idRelacionada] ?? 9, 1);
        }

        if ($idAnterior !== null && $idPosterior !== null) {
            if (!isset($anterioresPorPosterior[$idPosterior])) {
                $anterioresPorPosterior[$idPosterior] = [];
            }

            $anterioresPorPosterior[$idPosterior][$idAnterior] = true;
        }

        $pares[] = [
            'id_previa_base' => $idBase,
            'id_previa_relacionada' => $idRelacionada,
            'tipo' => $tipo,
            'orden' => (int)$row['orden'],
            'dni' => (string)$row['dni'],
        ];
    }

    return [
        'roles' => $roles,
        'anteriores_por_posterior' => $anterioresPorPosterior,
        'pares' => $pares,
    ];
}

function mesas_armado_obtener_grupos_calendarizables(PDO $pdo, array $relacionesCorrelativas, array $bloqueosDocentes): array
{
    $stmt = $pdo->query("
        SELECT
            me.id_mesa,
            me.numero_mesa,
            me.prioridad,
            me.tipo_mesa,
            me.id_taller,
            me.id_catedra,
            me.id_previa,
            me.id_docente,

            p.dni,
            p.alumno,
            p.id_materia AS previa_id_materia,
            p.materia_id_curso,
            p.materia_id_division,

            cat.id_materia AS cat_id_materia,
            mat.materia,
            doc.docente,
            area_map.id_area,
            area.area
        FROM mesas me
        INNER JOIN previas p
            ON p.id_previa = me.id_previa
           AND p.activo = 1
           AND p.inscripcion = 1
           AND p.id_condicion = 3
        INNER JOIN catedras cat
            ON cat.id_catedra = me.id_catedra
           AND cat.activo = 1
        INNER JOIN docentes doc
            ON doc.id_docente = me.id_docente
           AND doc.activo = 1
        INNER JOIN materias mat
            ON mat.id_materia = cat.id_materia
           AND mat.activo = 1
        LEFT JOIN (
            SELECT
                am.id_materia,
                MIN(am.id_area) AS id_area
            FROM areas_materias am
            INNER JOIN areas a2
                ON a2.id_area = am.id_area
               AND a2.activo = 1
            WHERE am.activo = 1
            GROUP BY am.id_materia
        ) area_map
            ON area_map.id_materia = cat.id_materia
        LEFT JOIN areas area
            ON area.id_area = area_map.id_area
           AND area.activo = 1
        WHERE me.estado = 'borrador'
          AND me.numero_mesa IS NOT NULL
          AND me.id_docente IS NOT NULL
        ORDER BY me.numero_mesa ASC, me.id_mesa ASC
    ");

    $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $roles = $relacionesCorrelativas['roles'] ?? [];
    $grupos = [];

    foreach ($filas as $fila) {
        $numeroMesa = (int)$fila['numero_mesa'];
        $key = (string)$numeroMesa;

        if (!isset($grupos[$key])) {
            $grupos[$key] = [
                'numero_mesa' => $numeroMesa,
                'prioridad' => (int)$fila['prioridad'],
                'tipo_mesa' => (string)$fila['tipo_mesa'],
                'tipos' => [],
                'id_taller' => $fila['id_taller'] !== null ? (int)$fila['id_taller'] : null,
                'ids_mesa' => [],
                'ids_previa' => [],
                'docentes' => [],
                'docentes_nombres' => [],
                'dnis' => [],
                'alumnos' => [],
                'materias' => [],
                'areas' => [],
                'id_areas' => [],
                'area_key' => 'sin_area',
                'area_principal' => 'SIN ÁREA',
                'cantidad_registros' => 0,
                'cantidad_previas' => 0,
                'cantidad_alumnos' => 0,
                'cantidad_docentes' => 0,
                'cantidad_bloqueos_docentes' => 0,
                'orden_correlativa' => 9,
                'rol_correlativa_texto' => 'sin_correlativa',
            ];
        }

        $grupo =& $grupos[$key];
        $grupo['prioridad'] = max((int)$grupo['prioridad'], (int)$fila['prioridad']);
        $grupo['tipos'][(string)$fila['tipo_mesa']] = true;

        $idMesa = (int)$fila['id_mesa'];
        $idPrevia = (int)$fila['id_previa'];
        $idDocente = (int)$fila['id_docente'];
        $dni = trim((string)$fila['dni']);
        $alumno = trim((string)$fila['alumno']);
        $materia = trim((string)$fila['materia']);
        $idArea = $fila['id_area'] !== null ? (int)$fila['id_area'] : null;
        $area = trim((string)($fila['area'] ?? ''));

        $grupo['ids_mesa'][$idMesa] = true;
        $grupo['ids_previa'][$idPrevia] = true;
        $grupo['docentes'][$idDocente] = true;

        if ($fila['docente'] !== null) {
            $grupo['docentes_nombres'][$idDocente] = (string)$fila['docente'];
        }

        if ($dni !== '') {
            $grupo['dnis'][$dni] = true;
        }

        if ($alumno !== '') {
            $grupo['alumnos'][$dni !== '' ? $dni : $alumno] = $alumno;
        }

        if ($materia !== '') {
            $grupo['materias'][(string)$fila['cat_id_materia']] = $materia;
        }

        if ($idArea !== null) {
            $grupo['id_areas'][$idArea] = true;
            $grupo['areas'][$idArea] = $area !== '' ? $area : ('Área ' . $idArea);
        }

        $rol = (int)($roles[$idPrevia] ?? 9);
        $grupo['orden_correlativa'] = min((int)$grupo['orden_correlativa'], $rol);

        $grupo['cantidad_registros']++;
        unset($grupo);
    }

    foreach ($grupos as &$grupo) {
        $tiposGrupo = array_keys($grupo['tipos']);

        if (in_array('taller', $tiposGrupo, true)) {
            $grupo['tipo_mesa'] = 'taller';
        } elseif (in_array('correlativa', $tiposGrupo, true)) {
            $grupo['tipo_mesa'] = 'correlativa';
        } else {
            $grupo['tipo_mesa'] = 'simple';
        }

        unset($grupo['tipos']);

        $idsDocentes = array_keys($grupo['docentes']);
        $grupo['ids_mesa'] = array_map('intval', array_keys($grupo['ids_mesa']));
        $grupo['ids_previa'] = array_map('intval', array_keys($grupo['ids_previa']));
        $grupo['docentes'] = array_map('intval', $idsDocentes);
        $grupo['docentes_nombres'] = array_values($grupo['docentes_nombres']);
        $grupo['dnis'] = array_keys($grupo['dnis']);
        $grupo['alumnos'] = array_values($grupo['alumnos']);
        $grupo['materias'] = array_values($grupo['materias']);
        $grupo['id_areas'] = array_map('intval', array_keys($grupo['id_areas']));
        $grupo['areas'] = array_values($grupo['areas']);
        $grupo['area_principal'] = count($grupo['areas']) > 0 ? (string)$grupo['areas'][0] : 'SIN ÁREA';
        $grupo['area_key'] = count($grupo['id_areas']) > 0
            ? 'area_' . (string)$grupo['id_areas'][0]
            : 'sin_area';
        if ($grupo['tipo_mesa'] === 'taller' && $grupo['id_taller'] !== null) {
            $grupo['area_key'] = 'taller_' . (string)$grupo['id_taller'];
            $grupo['area_principal'] = count($grupo['areas']) > 0 ? (string)$grupo['areas'][0] : 'TALLER';
        }
        $grupo['cantidad_previas'] = count($grupo['ids_previa']);
        $grupo['cantidad_alumnos'] = count($grupo['dnis']);
        $grupo['cantidad_docentes'] = count($grupo['docentes']);
        $grupo['cantidad_bloqueos_docentes'] = mesas_armado_contar_bloqueos_de_docentes($bloqueosDocentes, $grupo['docentes']);
        $grupo['rol_correlativa_texto'] = mesas_armado_texto_rol_correlativa((int)$grupo['orden_correlativa']);
    }
    unset($grupo);

    $grupos = array_values($grupos);

    usort($grupos, static function (array $a, array $b): int {
        $tipoOrden = static function (array $g): int {
            if ((int)$g['prioridad'] === 2 || $g['tipo_mesa'] === 'correlativa') {
                return 0;
            }

            if ((int)$g['prioridad'] === 1 || $g['tipo_mesa'] === 'taller') {
                return 1;
            }

            return 2;
        };

        return [$tipoOrden($a), (int)$a['orden_correlativa'], -(int)$a['cantidad_alumnos'], -(int)$a['cantidad_previas'], -(int)$a['cantidad_bloqueos_docentes'], (string)$a['area_key'], (int)$a['numero_mesa']]
            <=> [$tipoOrden($b), (int)$b['orden_correlativa'], -(int)$b['cantidad_alumnos'], -(int)$b['cantidad_previas'], -(int)$b['cantidad_bloqueos_docentes'], (string)$b['area_key'], (int)$b['numero_mesa']];
    });

    return $grupos;
}

function mesas_armado_texto_rol_correlativa(int $rol): string
{
    if ($rol === 0) {
        return 'correlativa_anterior';
    }

    if ($rol === 1) {
        return 'correlativa_equivalente';
    }

    if ($rol === 2) {
        return 'correlativa_posterior';
    }

    return 'sin_correlativa';
}

function mesas_armado_contar_bloqueos_de_docentes(array $bloqueosDocentes, array $idsDocentes): int
{
    $total = 0;

    foreach ($idsDocentes as $idDocente) {
        $total += isset($bloqueosDocentes[(int)$idDocente]) ? count($bloqueosDocentes[(int)$idDocente]) : 0;
    }

    return $total;
}

function mesas_armado_calendarizar_grupos(
    PDO $pdo,
    array $grupos,
    array $slots,
    array $bloqueosDocentes,
    array $relacionesCorrelativas,
    bool $marcarArmada
): array {
    $ocupacionDocente = [];
    $ocupacionAlumno = [];
    $previaSlotIndex = [];
    $slotsPorArea = [];
    $resumenSlots = [];
    $asignadas = [];
    $noCalendarizadas = [];

    foreach ($grupos as $grupo) {
        $slotAsignado = mesas_armado_buscar_slot_disponible_para_grupo(
            $grupo,
            $slots,
            $bloqueosDocentes,
            $ocupacionDocente,
            $ocupacionAlumno,
            $previaSlotIndex,
            $relacionesCorrelativas,
            $slotsPorArea
        );

        if ($slotAsignado === null) {
            mesas_armado_marcar_grupo_observado(
                $pdo,
                $grupo['ids_mesa'],
                'No se encontró fecha/turno disponible respetando docentes, alumnos, bloqueos, correlativas y compactación por área.'
            );

            $noCalendarizadas[] = [
                'numero_mesa' => $grupo['numero_mesa'],
                'tipo_mesa' => $grupo['tipo_mesa'],
                'prioridad' => $grupo['prioridad'],
                'rol_correlativa' => $grupo['rol_correlativa_texto'],
                'area' => $grupo['area_principal'],
                'cantidad_alumnos' => $grupo['cantidad_alumnos'],
                'cantidad_previas' => $grupo['cantidad_previas'],
                'docentes' => $grupo['docentes_nombres'],
                'materias' => $grupo['materias'],
                'motivo' => 'sin_slot_disponible',
            ];

            continue;
        }

        $fecha = (string)$slotAsignado['fecha'];
        $idTurno = (int)$slotAsignado['id_turno'];
        $slotIndex = (int)$slotAsignado['_slot_index'];
        $areaKey = (string)($grupo['area_key'] ?? 'sin_area');

        mesas_armado_actualizar_grupo_calendarizado(
            $pdo,
            $grupo['ids_mesa'],
            $fecha,
            $idTurno,
            $marcarArmada ? 'armada' : 'borrador'
        );

        foreach ($grupo['docentes'] as $idDocente) {
            $ocupacionDocente[mesas_armado_clave_ocupacion_docente((int)$idDocente, $fecha, $idTurno)] = true;
        }

        foreach ($grupo['dnis'] as $dni) {
            $ocupacionAlumno[mesas_armado_clave_ocupacion_alumno((string)$dni, $fecha, $idTurno)] = true;
        }

        foreach ($grupo['ids_previa'] as $idPrevia) {
            $previaSlotIndex[(int)$idPrevia] = $slotIndex;
        }

        if (!isset($slotsPorArea[$areaKey])) {
            $slotsPorArea[$areaKey] = [];
        }
        $slotsPorArea[$areaKey][$slotIndex] = true;

        $slotResumenKey = $fecha . '|' . $idTurno . '|' . $areaKey;
        if (!isset($resumenSlots[$slotResumenKey])) {
            $resumenSlots[$slotResumenKey] = [
                'fecha_mesa' => $fecha,
                'id_turno' => $idTurno,
                'turno' => $slotAsignado['turno'],
                'area' => $grupo['area_principal'],
                'area_key' => $areaKey,
                'cantidad_numeros_mesa' => 0,
                'cantidad_alumnos' => 0,
                'numeros_mesa' => [],
            ];
        }
        $resumenSlots[$slotResumenKey]['cantidad_numeros_mesa']++;
        $resumenSlots[$slotResumenKey]['cantidad_alumnos'] += (int)$grupo['cantidad_alumnos'];
        $resumenSlots[$slotResumenKey]['numeros_mesa'][] = (int)$grupo['numero_mesa'];

        $asignadas[] = [
            'numero_mesa' => $grupo['numero_mesa'],
            'tipo_mesa' => $grupo['tipo_mesa'],
            'prioridad' => $grupo['prioridad'],
            'rol_correlativa' => $grupo['rol_correlativa_texto'],
            'area' => $grupo['area_principal'],
            'area_key' => $areaKey,
            'cantidad_alumnos' => $grupo['cantidad_alumnos'],
            'cantidad_previas' => $grupo['cantidad_previas'],
            'cantidad_docentes' => $grupo['cantidad_docentes'],
            'docentes' => $grupo['docentes_nombres'],
            'materias' => $grupo['materias'],
            'fecha_mesa' => $fecha,
            'id_turno' => $idTurno,
            'turno' => $slotAsignado['turno'],
            'slot_index' => $slotIndex,
        ];
    }

    $resumenSlots = array_values($resumenSlots);
    usort($resumenSlots, static function (array $a, array $b): int {
        return [$a['fecha_mesa'], (int)$a['id_turno'], (string)$a['area']]
            <=> [$b['fecha_mesa'], (int)$b['id_turno'], (string)$b['area']];
    });

    return [
        'total_mesas_evaluadas' => count($grupos),
        'total_calendarizadas' => count($asignadas),
        'total_no_calendarizadas' => count($noCalendarizadas),
        'primeras_calendarizadas' => array_slice($asignadas, 0, 50),
        'no_calendarizadas' => array_slice($noCalendarizadas, 0, 50),
        'resumen_para_futura_agrupacion' => array_slice($resumenSlots, 0, 80),
        'criterio_profesional' => [
            'fecha_turno_en_mesas' => 'La fecha_mesa/id_turno cargada en mesas es la propuesta operativa del numero_mesa. En mesas_grupos solo se deben unir numeros que ya comparten ese mismo slot, salvo que una reoptimización los mueva juntos.',
            'compactacion' => 'Para maximizar agrupación futura, las mesas no prioritarias buscan primero slots ya abiertos de su misma area.',
            'prioridad' => 'Correlativa anterior, correlativas y mesas con mayor cantidad de alumnos se procesan antes para quedarse con los primeros slots disponibles.',
            'taller' => 'Taller sigue siendo especial: no se mezcla dentro del mismo numero_mesa, pero puede compartir fecha/turno con otros numeros si no chocan docentes ni alumnos.',
        ],
        'orden_aplicado' => [
            '1_prioridad_academica' => 'correlativa anterior/equivalente/posterior como prioridad de orden; no como tipo aislado obligatorio',
            '2_volumen' => 'mayor cantidad de alumnos y previas primero',
            '3_restriccion_docente' => 'docentes con más bloqueos primero',
            '4_compactacion_area' => 'misma area intenta quedar en mismo slot para facilitar mesas_grupos',
            '5_disponibilidad' => 'slot hábil sin choque de docente, alumno, bloqueo ni correlativa posterior antes de anterior',
        ],
    ];
}

function mesas_armado_buscar_slot_disponible_para_grupo(
    array $grupo,
    array $slots,
    array $bloqueosDocentes,
    array $ocupacionDocente,
    array $ocupacionAlumno,
    array $previaSlotIndex,
    array $relacionesCorrelativas,
    array $slotsPorArea
): ?array {
    $indicesCandidatos = mesas_armado_indices_slots_para_grupo($grupo, $slots, $slotsPorArea);

    foreach ($indicesCandidatos as $idx) {
        if (!isset($slots[$idx])) {
            continue;
        }

        $slot = $slots[$idx];
        $fecha = (string)$slot['fecha'];
        $idTurno = (int)$slot['id_turno'];

        if (!mesas_armado_slot_respeta_correlativas($grupo, (int)$idx, $previaSlotIndex, $relacionesCorrelativas)) {
            continue;
        }

        $docenteDisponible = true;

        foreach ($grupo['docentes'] as $idDocente) {
            $idDocente = (int)$idDocente;

            if (mesas_armado_docente_bloqueado($bloqueosDocentes, $idDocente, $fecha, $idTurno)) {
                $docenteDisponible = false;
                break;
            }

            if (isset($ocupacionDocente[mesas_armado_clave_ocupacion_docente($idDocente, $fecha, $idTurno)])) {
                $docenteDisponible = false;
                break;
            }
        }

        if (!$docenteDisponible) {
            continue;
        }

        $alumnoDisponible = true;

        foreach ($grupo['dnis'] as $dni) {
            if (isset($ocupacionAlumno[mesas_armado_clave_ocupacion_alumno((string)$dni, $fecha, $idTurno)])) {
                $alumnoDisponible = false;
                break;
            }
        }

        if (!$alumnoDisponible) {
            continue;
        }

        $slot['_slot_index'] = (int)$idx;
        return $slot;
    }

    return null;
}

function mesas_armado_indices_slots_para_grupo(array $grupo, array $slots, array $slotsPorArea): array
{
    $total = count($slots);

    if ($total === 0) {
        return [];
    }

    $todos = range(0, $total - 1);
    $areaKey = (string)($grupo['area_key'] ?? 'sin_area');
    $slotsMismaArea = isset($slotsPorArea[$areaKey]) ? array_map('intval', array_keys($slotsPorArea[$areaKey])) : [];
    sort($slotsMismaArea);

    $esCorrelativaPrioritaria = (int)($grupo['prioridad'] ?? 0) >= 2 || (int)($grupo['orden_correlativa'] ?? 9) <= 1;
    $esTaller = (string)($grupo['tipo_mesa'] ?? '') === 'taller';

    // Las prioritarias buscan el primer slot real disponible. Las normales chicas
    // intentan compactarse primero con su area para que la futura mesa_grupo sea más fácil.
    if ($esCorrelativaPrioritaria || $esTaller) {
        return $todos;
    }

    $vistos = [];
    $ordenados = [];

    foreach (array_merge($slotsMismaArea, $todos) as $idx) {
        $idx = (int)$idx;
        if (!isset($vistos[$idx])) {
            $vistos[$idx] = true;
            $ordenados[] = $idx;
        }
    }

    return $ordenados;
}

function mesas_armado_slot_respeta_correlativas(array $grupo, int $slotIndex, array $previaSlotIndex, array $relacionesCorrelativas): bool
{
    $anterioresPorPosterior = $relacionesCorrelativas['anteriores_por_posterior'] ?? [];

    foreach ($grupo['ids_previa'] as $idPrevia) {
        $idPrevia = (int)$idPrevia;

        if (!isset($anterioresPorPosterior[$idPrevia])) {
            continue;
        }

        foreach ($anterioresPorPosterior[$idPrevia] as $idAnterior => $_) {
            $idAnterior = (int)$idAnterior;

            if (isset($previaSlotIndex[$idAnterior]) && $slotIndex <= (int)$previaSlotIndex[$idAnterior]) {
                return false;
            }
        }
    }

    return true;
}

function mesas_armado_clave_ocupacion_docente(int $idDocente, string $fecha, int $idTurno): string
{
    return $idDocente . '|' . $fecha . '|' . $idTurno;
}

function mesas_armado_actualizar_grupo_calendarizado(PDO $pdo, array $idsMesa, string $fecha, int $idTurno, string $estado): void
{
    if (count($idsMesa) === 0) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($idsMesa), '?'));
    $params = array_merge([$fecha, $idTurno, $estado], array_map('intval', $idsMesa));

    $stmt = $pdo->prepare("
        UPDATE mesas
        SET fecha_mesa = ?,
            id_turno = ?,
            estado = ?,
            observacion = NULL
        WHERE id_mesa IN ({$placeholders})
    ");
    $stmt->execute($params);
}

function mesas_armado_marcar_grupo_observado(PDO $pdo, array $idsMesa, string $observacion): void
{
    if (count($idsMesa) === 0) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($idsMesa), '?'));
    $params = array_merge([mb_substr($observacion, 0, 255, 'UTF-8')], array_map('intval', $idsMesa));

    $stmt = $pdo->prepare("
        UPDATE mesas
        SET estado = 'observada',
            observacion = ?,
            fecha_mesa = NULL,
            id_turno = NULL
        WHERE id_mesa IN ({$placeholders})
    ");
    $stmt->execute($params);
}
