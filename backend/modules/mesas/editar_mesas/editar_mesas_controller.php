<?php
// backend/modules/mesas/editar_mesas/editar_mesas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/helpers_editar_mesas.php';

function mesas_editar_obtener_grupo(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_input_json());
        $tipo = mesas_editar_tipo_desde_payload($data);
        $grupo = mesas_editar_resolver_item($pdo, $tipo, $data);

        if (!$grupo) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se encontró la mesa solicitada para edición.',
            ], 404);
            return;
        }

        json_response([
            'exito' => true,
            'data' => [
                'tipo' => $tipo,
                'grupo' => $grupo,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_obtener_grupo');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener la mesa para edición.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_guardar_programacion(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_input_json();
        $tipo = mesas_editar_tipo_desde_payload($data);
        $fechaMesa = mesas_editar_normalizar_fecha($data['fecha_mesa'] ?? null);
        $idTurno = (int)($data['id_turno'] ?? 0);
        $turno = mesas_editar_obtener_turno($pdo, $idTurno);
        $hora = mesas_editar_normalizar_hora($data['hora'] ?? null, (string)$turno['turno']);

        $validacionProgramacion = mesas_editar_validar_programacion_completa($pdo, $tipo, $data, $fechaMesa, $idTurno, $hora, $turno);
        if (!$validacionProgramacion['valido']) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede guardar esta fecha/turno porque genera conflictos.',
                'errores' => $validacionProgramacion['errores'],
                'advertencias' => $validacionProgramacion['advertencias'],
                'data' => [
                    'validacion' => $validacionProgramacion,
                ],
            ], 422);
            return;
        }

        $pdo->beginTransaction();

        if ($tipo === 'no_agrupada') {
            $idNoAgrupada = isset($data['id_no_agrupada']) ? (int)$data['id_no_agrupada'] : 0;
            $numeroMesa = isset($data['numero_mesa']) ? (int)$data['numero_mesa'] : 0;

            $actual = mesas_editar_obtener_no_agrupada_hidratada(
                $pdo,
                $idNoAgrupada > 0 ? $idNoAgrupada : null,
                $numeroMesa > 0 ? $numeroMesa : null
            );

            if (!$actual) {
                throw new RuntimeException('No se encontró el número sin agrupar solicitado.');
            }

            $numeroMesaReal = (int)($actual['numeros'][0]['numero_mesa'] ?? $numeroMesa);
            if ($numeroMesaReal <= 0) {
                throw new RuntimeException('No se pudo resolver el número de mesa sin agrupar.');
            }

            if ($idNoAgrupada > 0) {
                $stmt = $pdo->prepare('
                    UPDATE mesas_no_agrupadas
                    SET fecha_mesa = ?, id_turno = ?, hora = ?, estado = ?
                    WHERE id = ?
                ');
                $stmt->execute([$fechaMesa, $idTurno, $hora, 'confirmada', $idNoAgrupada]);
            } else {
                $stmt = $pdo->prepare('
                    UPDATE mesas_no_agrupadas
                    SET fecha_mesa = ?, id_turno = ?, hora = ?, estado = ?
                    WHERE numero_mesa = ?
                ');
                $stmt->execute([$fechaMesa, $idTurno, $hora, 'confirmada', $numeroMesaReal]);
            }

            $stmtMesas = $pdo->prepare("
                UPDATE mesas
                SET fecha_mesa = ?, id_turno = ?, estado = IF(estado = 'observada', estado, 'borrador')
                WHERE numero_mesa = ?
            ");
            $stmtMesas->execute([$fechaMesa, $idTurno, $numeroMesaReal]);

            $pdo->commit();

            $grupoActualizado = mesas_editar_obtener_no_agrupada_hidratada(
                $pdo,
                $idNoAgrupada > 0 ? $idNoAgrupada : null,
                $numeroMesaReal
            );
        } else {
            $numeroGrupo = (int)($data['numero_grupo'] ?? $data['id_grupo'] ?? 0);
            if ($numeroGrupo <= 0) {
                throw new InvalidArgumentException('Debe indicar el grupo final que desea editar.');
            }

            $numeros = mesas_editar_normalizar_lista_numeros($validacionProgramacion['numeros'] ?? []);
            if (count($numeros) === 0) {
                throw new RuntimeException('No se encontraron números de mesa dentro del grupo final.');
            }

            $stmtGrupo = $pdo->prepare('
                UPDATE mesas_grupos
                SET fecha_mesa = ?, id_turno = ?, hora = ?
                WHERE numero_grupo = ?
            ');
            $stmtGrupo->execute([$fechaMesa, $idTurno, $hora, $numeroGrupo]);

            $placeholders = implode(',', array_fill(0, count($numeros), '?'));
            $stmtMesas = $pdo->prepare("
                UPDATE mesas
                SET fecha_mesa = ?, id_turno = ?, estado = IF(estado = 'observada', estado, 'borrador')
                WHERE numero_mesa IN ({$placeholders})
            ");
            $stmtMesas->execute(array_merge([$fechaMesa, $idTurno], $numeros));

            $pdo->commit();

            $grupoActualizado = mesas_editar_obtener_grupo_hidratado($pdo, $numeroGrupo);
        }

        json_response([
            'exito' => true,
            'mensaje' => 'Programación actualizada correctamente.',
            'data' => [
                'tipo' => $tipo,
                'grupo' => $grupoActualizado,
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, 'mesas_editar_guardar_programacion');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al guardar la programación de la mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}


function mesas_editar_crear_grupo_unico_no_agrupada(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_input_json();
        $data['tipo'] = 'no_agrupada';

        $fechaMesa = mesas_editar_normalizar_fecha($data['fecha_mesa'] ?? null);
        $idTurno = (int)($data['id_turno'] ?? 0);
        $turno = mesas_editar_obtener_turno($pdo, $idTurno);
        $hora = mesas_editar_normalizar_hora($data['hora'] ?? null, (string)$turno['turno']);

        $validacionProgramacion = mesas_editar_validar_programacion_completa($pdo, 'no_agrupada', $data, $fechaMesa, $idTurno, $hora, $turno);
        if (!$validacionProgramacion['valido']) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede crear el grupo único porque genera conflictos.',
                'errores' => $validacionProgramacion['errores'],
                'advertencias' => $validacionProgramacion['advertencias'],
                'data' => [
                    'validacion' => $validacionProgramacion,
                ],
            ], 422);
            return;
        }

        $idNoAgrupada = isset($data['id_no_agrupada']) ? (int)$data['id_no_agrupada'] : 0;
        $numeroMesa = isset($data['numero_mesa']) ? (int)$data['numero_mesa'] : 0;

        $actual = mesas_editar_obtener_no_agrupada_hidratada(
            $pdo,
            $idNoAgrupada > 0 ? $idNoAgrupada : null,
            $numeroMesa > 0 ? $numeroMesa : null
        );

        if (!$actual) {
            throw new RuntimeException('No se encontró el número sin agrupar solicitado.');
        }

        $numeroMesaReal = (int)($actual['numeros'][0]['numero_mesa'] ?? $numeroMesa);
        if ($numeroMesaReal <= 0) {
            throw new RuntimeException('No se pudo resolver el número de mesa sin agrupar.');
        }

        $resumen = mesas_editar_resumen_numero_para_grupo_unico($pdo, $numeroMesaReal);
        if (!$resumen) {
            throw new RuntimeException('No se encontraron registros en mesas para crear el grupo único.');
        }

        $numeroGrupoNuevo = mesas_editar_obtener_numero_siguiente_grupo($pdo);
        $idArea = $resumen['id_area'] !== null
            ? (int)$resumen['id_area']
            : ($actual['id_area'] !== null ? (int)$actual['id_area'] : null);
        $tipoMesa = trim((string)($resumen['tipo_mesa'] ?? $actual['tipos_mesa_texto'] ?? 'simple')) ?: 'simple';
        if (!in_array($tipoMesa, ['simple', 'correlativa', 'taller'], true)) {
            $tipoMesa = 'simple';
        }
        $prioridad = (int)($resumen['prioridad'] ?? $actual['prioridad_max'] ?? 0);
        $cantidadAlumnos = (int)($resumen['cantidad_alumnos'] ?? $actual['cantidad_alumnos'] ?? 0);

        $pdo->beginTransaction();

        // Blindaje: el número no debe quedar duplicado entre grupos y no agrupadas.
        $stmtDeleteGrupoPrevio = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = ?');
        $stmtDeleteGrupoPrevio->execute([$numeroMesaReal]);

        $stmtDeleteNo = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
        $stmtDeleteNo->execute([$numeroMesaReal]);

        $stmtMesas = $pdo->prepare("
            UPDATE mesas
            SET fecha_mesa = ?, id_turno = ?, estado = IF(estado = 'observada', estado, 'borrador')
            WHERE numero_mesa = ?
        ");
        $stmtMesas->execute([$fechaMesa, $idTurno, $numeroMesaReal]);

        $stmtInsert = $pdo->prepare('
            INSERT INTO mesas_grupos
                (numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area, orden, tipo_mesa, prioridad, cantidad_alumnos, estado, observacion)
            VALUES
                (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, "borrador", "Grupo único creado manualmente desde mesa no agrupada.")
        ');
        $stmtInsert->execute([
            $numeroGrupoNuevo,
            $numeroMesaReal,
            $fechaMesa,
            $idTurno,
            $hora,
            $idArea,
            $tipoMesa,
            $prioridad,
            $cantidadAlumnos,
        ]);

        $pdo->commit();

        $grupoActualizado = mesas_editar_obtener_grupo_hidratado($pdo, $numeroGrupoNuevo);

        json_response([
            'exito' => true,
            'mensaje' => 'Mesa no agrupada convertida en grupo único correctamente.',
            'data' => [
                'tipo' => 'grupo',
                'numero_grupo' => $numeroGrupoNuevo,
                'id_grupo' => $numeroGrupoNuevo,
                'numero_mesa' => $numeroMesaReal,
                'grupo' => $grupoActualizado,
                'validacion' => $validacionProgramacion,
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, 'mesas_editar_crear_grupo_unico_no_agrupada');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al crear el grupo único desde la mesa no agrupada.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_validar_programacion(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_input_json());
        $tipo = mesas_editar_tipo_desde_payload($data);
        $fechaMesa = mesas_editar_normalizar_fecha($data['fecha_mesa'] ?? null);
        $idTurno = (int)($data['id_turno'] ?? 0);
        $turno = mesas_editar_obtener_turno($pdo, $idTurno);
        $hora = mesas_editar_normalizar_hora($data['hora'] ?? null, (string)$turno['turno']);

        $validacion = mesas_editar_validar_programacion_completa($pdo, $tipo, $data, $fechaMesa, $idTurno, $hora, $turno);

        json_response([
            'exito' => true,
            'data' => [
                'valido' => $validacion['valido'],
                'errores' => $validacion['errores'],
                'advertencias' => $validacion['advertencias'],
                'numeros' => $validacion['numeros'],
                'rango_horario' => $validacion['rango_horario'],
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_validar_programacion');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al validar la programación de la mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_slots_validos(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_input_json());
        $tipo = mesas_editar_tipo_desde_payload($data);
        $grupo = mesas_editar_resolver_item($pdo, $tipo, $data);
        [$fechaInicio, $fechaFin] = mesas_editar_rango_fechas_para_slots($pdo, $data, $grupo);
        $slots = mesas_editar_construir_slots_validos($pdo, $tipo, $data, $fechaInicio, $fechaFin);

        json_response([
            'exito' => true,
            'data' => $slots,
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_slots_validos');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener los turnos disponibles para edición.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_eliminar(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_input_json();
        $tipo = mesas_editar_tipo_desde_payload($data);

        $pdo->beginTransaction();

        if ($tipo === 'no_agrupada') {
            $idNoAgrupada = (int)($data['id_no_agrupada'] ?? 0);
            $numeroMesa = (int)($data['numero_mesa'] ?? 0);

            if ($idNoAgrupada <= 0 && $numeroMesa <= 0) {
                throw new InvalidArgumentException('Debe indicar el número sin agrupar a eliminar.');
            }

            $where = $idNoAgrupada > 0 ? 'id = ?' : 'numero_mesa = ?';
            $valor = $idNoAgrupada > 0 ? $idNoAgrupada : $numeroMesa;

            $stmtSelect = $pdo->prepare("SELECT numero_mesa FROM mesas_no_agrupadas WHERE {$where} LIMIT 1");
            $stmtSelect->execute([$valor]);
            $numeroMesaReal = (int)($stmtSelect->fetchColumn() ?: 0);

            if ($numeroMesaReal <= 0) {
                throw new RuntimeException('No se encontró el número sin agrupar solicitado.');
            }

            $stmtDeleteNo = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE {$where}");
            $stmtDeleteNo->execute([$valor]);

            $stmtDeleteMesas = $pdo->prepare('DELETE FROM mesas WHERE numero_mesa = ?');
            $stmtDeleteMesas->execute([$numeroMesaReal]);

            $pdo->commit();

            json_response([
                'exito' => true,
                'mensaje' => 'Número de mesa eliminado del armado actual.',
                'data' => [
                    'tipo' => $tipo,
                    'numero_mesa' => $numeroMesaReal,
                    'filas_mesas_eliminadas' => $stmtDeleteMesas->rowCount(),
                    'filas_no_agrupadas_eliminadas' => $stmtDeleteNo->rowCount(),
                ],
            ]);
            return;
        }

        $numeroGrupo = (int)($data['numero_grupo'] ?? $data['id_grupo'] ?? 0);
        if ($numeroGrupo <= 0) {
            throw new InvalidArgumentException('Debe indicar el grupo final a eliminar.');
        }

        $stmtSelect = $pdo->prepare('
            SELECT numero_mesa, fecha_mesa, id_turno, hora, id_area, tipo_mesa, prioridad, cantidad_alumnos
            FROM mesas_grupos
            WHERE numero_grupo = ?
            ORDER BY orden ASC
        ');
        $stmtSelect->execute([$numeroGrupo]);
        $filas = $stmtSelect->fetchAll(PDO::FETCH_ASSOC);

        if (count($filas) === 0) {
            throw new RuntimeException('No se encontró el grupo final solicitado.');
        }

        foreach ($filas as $fila) {
            mesas_editar_insertar_no_agrupada_desde_grupo($pdo, $fila);
        }

        $stmtDelete = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ?');
        $stmtDelete->execute([$numeroGrupo]);

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Grupo final quitado correctamente. Sus números pasaron a no agrupadas.',
            'data' => [
                'tipo' => $tipo,
                'numero_grupo' => $numeroGrupo,
                'numeros_pasados_a_no_agrupadas' => count($filas),
                'filas_grupo_eliminadas' => $stmtDelete->rowCount(),
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, 'mesas_editar_eliminar');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al eliminar la mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
