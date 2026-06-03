<?php
// backend/modules/mesas/edicion_por_docente/mas/mas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';
require_once __DIR__ . '/mas_helpers.php';

function mesas_editar_docentes_mas_previas_disponibles(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_docentes_input_json());
        $numeroMesa = mesas_editar_docentes_mas_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa destino.');

        json_response([
            'exito' => true,
            'data' => mesas_editar_docentes_mas_obtener_previas_disponibles($pdo, $numeroMesa),
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_docentes_mas_previas_disponibles');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener previas disponibles para agregar.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_docentes_mas_agregar(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_docentes_input_json();
        $numeroMesa = mesas_editar_docentes_mas_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa destino.');
        $idsPrevias = mesas_editar_docentes_mas_normalizar_ids_previas($data);

        $pdo->beginTransaction();
        $resultado = mesas_editar_docentes_mas_agregar_previas($pdo, $numeroMesa, $idsPrevias);

        if (!$resultado['agregadas']) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'No se pueden agregar las previas porque generan conflictos.',
                'errores' => $resultado['errores'] ?? [],
                'data' => $resultado,
            ], 422);
            return;
        }

        $pdo->commit();

        $cantidad = (int)($resultado['cantidad_agregada'] ?? 0);
        json_response([
            'exito' => true,
            'mensaje' => $cantidad === 1
                ? 'Previa agregada correctamente al número de mesa.'
                : $cantidad . ' previas agregadas correctamente al número de mesa.',
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
        log_error($e, 'mesas_editar_docentes_mas_agregar');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al agregar la previa al número de mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
