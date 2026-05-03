<?php
// backend/modules/mesas/armado_mesas/fases/fase_5_validar_y_numerar.php
declare(strict_types=1);

/**
 * Fase 5 - Alias operativo de numeración.
 *
 * Todavía no valida fecha/turno porque en esta etapa se pidió numerar solamente.
 * Reutiliza la misma lógica de Fase 4 para no duplicar criterios.
 */
function mesas_armado_fase_5_validar_y_numerar(): void
{
    try {
        $pdo = db();
        $body = request_body();

        $reiniciarNumeracion = filter_var($body['reiniciar_numeracion'] ?? true, FILTER_VALIDATE_BOOLEAN);
        $limpiarFechaTurno = filter_var($body['limpiar_fecha_turno'] ?? true, FILTER_VALIDATE_BOOLEAN);
        $incluirArmadas = filter_var($body['incluir_armadas'] ?? true, FILTER_VALIDATE_BOOLEAN);

        $resultado = mesas_armado_numerar_por_docente_materia(
            $pdo,
            $reiniciarNumeracion,
            $limpiarFechaTurno,
            $incluirArmadas
        );

        $resultado['fase'] = 5;
        $resultado['nota'] = 'Por ahora esta fase solo numera. La validación completa de fecha/turno queda para una fase posterior.';

        json_response([
            'exito' => true,
            'mensaje' => 'Numeración de mesas generada correctamente.',
            'data' => $resultado,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_fase_5_validar_y_numerar');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al numerar las mesas.',
        ], 500);
    }
}
