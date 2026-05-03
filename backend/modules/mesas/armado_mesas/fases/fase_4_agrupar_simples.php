<?php
// backend/modules/mesas/armado_mesas/fases/fase_4_agrupar_simples.php
declare(strict_types=1);

/**
 * Fase 4 pendiente:
 * Agrupar mesas simples.
 *
 * Objetivo futuro:
 * - Tomar registros con tipo_mesa = 'simple' y prioridad = 0.
 * - Agruparlos por criterios normales de cátedra/docente/fecha/turno.
 * - Completar numero_mesa para las mesas comunes.
 */
function mesas_armado_fase_4_agrupar_simples(): void
{
    json_response([
        'exito' => false,
        'mensaje' => 'Fase 4 pendiente de implementación: agrupar mesas simples.',
        'data' => [
            'fase' => 4,
            'estado' => 'pendiente',
        ],
    ], 501);
}
