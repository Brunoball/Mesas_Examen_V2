<?php
// backend/modules/mesas/edicion_por_docente/persona/persona_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';
require_once __DIR__ . '/persona_helpers.php';

function mesas_editar_docentes_persona_previas_numero(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_docentes_input_json());
        $numeroMesa = mesas_editar_docentes_persona_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa.');

        json_response([
            'exito' => true,
            'data' => mesas_editar_docentes_persona_obtener_previas_numero($pdo, $numeroMesa),
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_docentes_persona_previas_numero');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener las previas del número de mesa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_docentes_persona_destinos_mover(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_docentes_input_json());
        $numeroMesa = mesas_editar_docentes_persona_int($data['numero_mesa'] ?? $data['numero_origen'] ?? null, 'Debe indicar el número de mesa origen.');
        $idPrevia = mesas_editar_docentes_persona_int($data['id_previa'] ?? null, 'Debe indicar la previa a mover.');

        json_response([
            'exito' => true,
            'data' => mesas_editar_docentes_persona_obtener_destinos($pdo, $numeroMesa, $idPrevia),
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_docentes_persona_destinos_mover');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener destinos disponibles para mover la previa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_docentes_persona_validar_mover(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_docentes_input_json());
        $numeroOrigen = mesas_editar_docentes_persona_int($data['numero_origen'] ?? $data['numero_mesa'] ?? null, 'Debe indicar el número de mesa origen.');
        $idPrevia = mesas_editar_docentes_persona_int($data['id_previa'] ?? null, 'Debe indicar la previa a mover.');
        $numeroDestino = mesas_editar_docentes_persona_int($data['numero_destino'] ?? null, 'Debe indicar el número de mesa destino.');

        json_response([
            'exito' => true,
            'data' => mesas_editar_docentes_persona_validar_movimiento($pdo, $numeroOrigen, $idPrevia, $numeroDestino),
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_docentes_persona_validar_mover');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al validar el movimiento de la previa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_docentes_persona_mover(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_docentes_input_json();
        $numeroOrigen = mesas_editar_docentes_persona_int($data['numero_origen'] ?? $data['numero_mesa'] ?? null, 'Debe indicar el número de mesa origen.');
        $idPrevia = mesas_editar_docentes_persona_int($data['id_previa'] ?? null, 'Debe indicar la previa a mover.');
        $numeroDestino = mesas_editar_docentes_persona_int($data['numero_destino'] ?? null, 'Debe indicar el número de mesa destino.');

        $pdo->beginTransaction();
        $resultado = mesas_editar_docentes_persona_mover_previa($pdo, $numeroOrigen, $idPrevia, $numeroDestino);

        if (!$resultado['movido']) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede mover la previa porque genera conflictos.',
                'errores' => $resultado['validacion']['errores'] ?? [],
                'data' => $resultado,
            ], 422);
            return;
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Previa movida correctamente.',
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
        log_error($e, 'mesas_editar_docentes_persona_mover');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al mover la previa.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_docentes_persona_eliminar(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_docentes_input_json();
        $numeroMesa = mesas_editar_docentes_persona_int($data['numero_mesa'] ?? null, 'Debe indicar el número de mesa.');
        $idPrevia = mesas_editar_docentes_persona_int($data['id_previa'] ?? null, 'Debe indicar la previa a eliminar.');

        $pdo->beginTransaction();
        $eliminadas = mesas_editar_docentes_persona_eliminar_previa($pdo, $numeroMesa, $idPrevia);
        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Previa quitada del armado correctamente.',
            'data' => [
                'numero_mesa' => $numeroMesa,
                'id_previa' => $idPrevia,
                'filas_eliminadas' => $eliminadas,
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
        log_error($e, 'mesas_editar_docentes_persona_eliminar');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al quitar la previa del armado.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
