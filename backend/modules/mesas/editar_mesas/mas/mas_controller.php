<?php
// backend/modules/mesas/editar_mesas/mas/mas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/mas_helpers.php';

function mesas_editar_mas_previas_disponibles(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_input_json());
        $numeroMesa = mesas_editar_mas_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa destino.');

        json_response([
            'exito' => true,
            'data' => mesas_editar_mas_obtener_previas_disponibles($pdo, $numeroMesa),
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_mas_previas_disponibles');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener previas disponibles para agregar.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_mas_agregar(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_input_json();
        $numeroMesa = mesas_editar_mas_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa destino.');
        $idPrevia = mesas_editar_mas_int($data['id_previa'] ?? null, 'Debe indicar la previa a agregar.');

        $pdo->beginTransaction();
        $resultado = mesas_editar_mas_agregar_previa($pdo, $numeroMesa, $idPrevia);

        if (!$resultado['agregada']) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede agregar la previa porque genera conflictos.',
                'errores' => $resultado['validacion']['errores'] ?? [],
                'data' => $resultado,
            ], 422);
            return;
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Previa agregada correctamente al número de mesa.',
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
        log_error($e, 'mesas_editar_mas_agregar');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al agregar la previa al número de mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
