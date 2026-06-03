<?php
// backend/modules/mesas/edicion_por_docente/eliminar/eliminar_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';
require_once __DIR__ . '/eliminar_helpers.php';

function mesas_editar_docentes_eliminar_smart(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_docentes_eliminar_input();
        $modo = trim((string)($data['modo'] ?? $data['tipo_eliminacion'] ?? ''));

        if ($modo === 'numero_grupo' || $modo === 'quitar_numero' || !empty($data['solo_numero_grupo'])) {
            mesas_editar_docentes_eliminar_numero_grupo();
            return;
        }

        $tipo = mesas_editar_docentes_tipo_desde_payload($data);

        $pdo->beginTransaction();

        if ($tipo === 'no_agrupada') {
            $resultado = mesas_editar_docentes_eliminar_no_agrupada($pdo, $data);
            $pdo->commit();

            json_response([
                'exito' => true,
                'mensaje' => 'Número de mesa eliminado del armado actual.',
                'data' => array_merge([
                    'tipo' => $tipo,
                ], $resultado),
            ]);
            return;
        }

        $numeroGrupo = mesas_editar_docentes_eliminar_resolver_grupo($data);
        $filas = mesas_editar_docentes_eliminar_filas_grupo($pdo, $numeroGrupo);

        if (count($filas) === 0) {
            throw new RuntimeException('No se encontró el grupo final solicitado.');
        }

        $numerosGrupo = array_values(array_unique(array_map(static fn(array $fila): int => (int)($fila['numero_mesa'] ?? 0), $filas)));
        $notificacionesLimpiadas = function_exists('mesas_notificaciones_cleanup_por_numeros_mesa')
            ? mesas_notificaciones_cleanup_por_numeros_mesa($pdo, $numerosGrupo)
            : [];

        $numerosPasados = mesas_editar_docentes_eliminar_pasar_filas_a_no_agrupadas($pdo, $filas);

        $stmtDelete = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ?');
        $stmtDelete->execute([$numeroGrupo]);

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Grupo final quitado correctamente. Sus números pasaron a no agrupadas.',
            'data' => [
                'tipo' => $tipo,
                'numero_grupo' => $numeroGrupo,
                'numeros_pasados_a_no_agrupadas' => $numerosPasados,
                'filas_grupo_eliminadas' => $stmtDelete->rowCount(),
                'notificaciones_limpiadas' => $notificacionesLimpiadas ?? [],
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
        log_error($e, 'mesas_editar_docentes_eliminar_smart');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al eliminar la mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_docentes_eliminar_numero_grupo(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_docentes_eliminar_input();
        $numeroGrupo = mesas_editar_docentes_eliminar_resolver_grupo($data);
        $numeroMesa = mesas_editar_docentes_eliminar_resolver_numero($data);

        $pdo->beginTransaction();

        $fila = mesas_editar_docentes_eliminar_fila_numero_grupo($pdo, $numeroGrupo, $numeroMesa);
        if (!$fila) {
            throw new RuntimeException('El número de mesa indicado no pertenece al grupo seleccionado.');
        }

        $numerosNotificacion = [$numeroMesa];

        // El registro de la tabla mesas queda intacto. Solo se quita del grupo final
        // y se registra como no agrupada para no perderlo de la vista del armado.
        mesas_editar_docentes_insertar_no_agrupada_desde_grupo($pdo, $fila);

        $stmtDelete = $pdo->prepare('
            DELETE FROM mesas_grupos
            WHERE numero_grupo = ?
              AND numero_mesa = ?
        ');
        $stmtDelete->execute([$numeroGrupo, $numeroMesa]);

        $filasRestantes = mesas_editar_docentes_eliminar_filas_grupo($pdo, $numeroGrupo);
        $grupoEliminado = false;
        $numerosRestantesPasados = 0;

        // Un grupo simple/correlativo con un solo número queda inválido.
        // Para no dejar grupos rotos, el número restante también pasa a no agrupadas.
        if (count($filasRestantes) === 1 && ($filasRestantes[0]['tipo_mesa'] ?? 'simple') !== 'taller') {
            $numerosNotificacion[] = (int)($filasRestantes[0]['numero_mesa'] ?? 0);
            $numerosRestantesPasados = mesas_editar_docentes_eliminar_pasar_filas_a_no_agrupadas($pdo, $filasRestantes);
            $stmtDeleteResto = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ?');
            $stmtDeleteResto->execute([$numeroGrupo]);
            $grupoEliminado = true;
            $filasRestantes = [];
        } elseif (count($filasRestantes) === 0) {
            $grupoEliminado = true;
        } else {
            mesas_editar_docentes_eliminar_reordenar_grupo($pdo, $numeroGrupo);
        }

        $numerosNotificacion = array_values(array_filter(array_unique(array_map('intval', $numerosNotificacion)), static fn(int $n): bool => $n > 0));
        $notificacionesLimpiadas = function_exists('mesas_notificaciones_cleanup_por_numeros_mesa')
            ? mesas_notificaciones_cleanup_por_numeros_mesa($pdo, $numerosNotificacion)
            : [];

        $pdo->commit();

        $grupoActualizado = $grupoEliminado ? null : mesas_editar_docentes_obtener_grupo_hidratado($pdo, $numeroGrupo);

        json_response([
            'exito' => true,
            'mensaje' => $grupoEliminado
                ? 'Número quitado correctamente. El grupo quedó sin validez y sus números pasaron a no agrupadas.'
                : 'Número de mesa quitado correctamente del grupo.',
            'data' => [
                'tipo' => 'grupo',
                'modo' => 'numero_grupo',
                'numero_grupo' => $numeroGrupo,
                'numero_mesa' => $numeroMesa,
                'grupo_eliminado' => $grupoEliminado,
                'grupo' => $grupoActualizado,
                'numeros_pasados_a_no_agrupadas' => 1 + $numerosRestantesPasados,
                'filas_grupo_eliminadas' => $stmtDelete->rowCount(),
                'notificaciones_limpiadas' => $notificacionesLimpiadas ?? [],
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
        log_error($e, 'mesas_editar_docentes_eliminar_numero_grupo');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al quitar el número de mesa del grupo.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
