<?php
// backend/modules/mesas/armado_mesas_docentes/fases/fase_2_agrupar_talleres.php
declare(strict_types=1);

/**
 * Fase 2 - Talleres.
 *
 * La expansión real de talleres se hace en Fase 1 al crear el armado:
 * - una fila por cada cátedra activa del taller;
 * - mismo id_previa + mismo id_taller;
 * - numero_mesa exclusivo por previa de taller.
 *
 * Esta acción queda como reparación rápida de numeración para mesas ya creadas.
 */
function mesas_armado_docentes_fase_2_agrupar_talleres(): void
{
    try {
        $pdo = db();

        $resultado = mesas_armado_docentes_numerar_por_docente_materia(
            $pdo,
            true,
            true,
            true
        );

        $resultado['fase'] = 2;
        $resultado['nota'] = 'La expansión completa de cátedras de taller se aplica al ejecutar mesas_armado_docentes_crear. Esta fase solo repara la numeración exclusiva de talleres ya existentes.';

        json_response([
            'exito' => true,
            'mensaje' => 'Numeración de talleres reparada correctamente. Para expandir cátedras del taller, ejecutá nuevamente Armar Mesas.',
            'data' => $resultado,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_docentes_fase_2_agrupar_talleres');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al reparar la numeración de talleres.',
        ], 500);
    }
}
