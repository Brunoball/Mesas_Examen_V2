<?php
// backend/modules/mesas/editar_mesas/flechas/flechas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/flechas_helpers.php';

function mesas_editar_flechas_destinos(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);
        mesas_editar_slots_extra_asegurar_tabla($pdo);

        $data = array_merge($_GET, mesas_editar_input_json());
        $numeroMesa = mesas_editar_flechas_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa que desea mover.');

        json_response([
            'exito' => true,
            'data' => mesas_editar_flechas_obtener_destinos($pdo, $numeroMesa),
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_flechas_destinos');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener grupos destino para mover el número de mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_flechas_mover(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);
        mesas_editar_slots_extra_asegurar_tabla($pdo);

        $data = mesas_editar_input_json();
        $numeroMesa = mesas_editar_flechas_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa que desea mover.');
        $numeroGrupoDestino = mesas_editar_flechas_int($data['numero_grupo_destino'] ?? $data['id_grupo_destino'] ?? null, 'Debe indicar el grupo destino.');

        $pdo->beginTransaction();
        $resultado = mesas_editar_flechas_mover_numero($pdo, $numeroMesa, $numeroGrupoDestino);

        if (!$resultado['movido']) {
            // Si por doble click/carrera el backend alcanzó a moverlo pero la segunda
            // petición cayó en validación, verificamos el estado real antes de devolver 422.
            if (mesas_editar_flechas_numero_en_grupo($pdo, $numeroMesa, $numeroGrupoDestino)) {
                $resultado = mesas_editar_flechas_respuesta_estado_actual(
                    $pdo,
                    $numeroMesa,
                    $numeroGrupoDestino,
                    null,
                    'Número de mesa movido correctamente.'
                );
            } else {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                json_response([
                    'exito' => false,
                    'mensaje' => 'No se puede mover este número de mesa al grupo seleccionado.',
                    'errores' => $resultado['validacion']['errores'] ?? [],
                    'data' => $resultado,
                ], 422);
                return;
            }
        }

        if ($pdo->inTransaction()) {
            $pdo->commit();
        }

        json_response([
            'exito' => true,
            'mensaje' => $resultado['mensaje'] ?? 'Número de mesa movido correctamente.',
            'data' => $resultado,
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
        log_error($e, 'mesas_editar_flechas_mover');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al mover el número de mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
