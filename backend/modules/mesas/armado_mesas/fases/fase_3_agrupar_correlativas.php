<?php
// backend/modules/mesas/armado_mesas/fases/fase_3_agrupar_correlativas.php
declare(strict_types=1);

/**
 * Fase 3 pendiente:
 * Agrupar y ordenar registros correlativos.
 *
 * Objetivo futuro:
 * - Tomar registros con tipo_mesa = 'correlativa' y prioridad = 2.
 * - Respetar correlatividades anteriores/posteriores.
 * - Evitar choques de alumno, docente, fecha y turno.
 */
function mesas_armado_fase_3_agrupar_correlativas(): void
{
    json_response([
        'exito' => false,
        'mensaje' => 'Fase 3 pendiente de implementación: agrupar correlativas.',
        'data' => [
            'fase' => 3,
            'estado' => 'pendiente',
        ],
    ], 501);
}
