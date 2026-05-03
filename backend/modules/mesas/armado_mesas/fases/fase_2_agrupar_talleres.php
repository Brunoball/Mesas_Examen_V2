<?php
// backend/modules/mesas/armado_mesas/fases/fase_2_agrupar_talleres.php
declare(strict_types=1);

/**
 * Fase 2 pendiente:
 * Agrupar registros de tipo_mesa = 'taller' por id_taller.
 *
 * Objetivo futuro:
 * - Tomar registros borrador de mesas con tipo_mesa = 'taller'.
 * - Unificarlos por id_taller.
 * - Asignar el mismo numero_mesa a todas las materias/docentes del taller.
 * - Forzar misma fecha_mesa e id_turno dentro del grupo.
 */
function mesas_armado_fase_2_agrupar_talleres(): void
{
    json_response([
        'exito' => false,
        'mensaje' => 'Fase 2 pendiente de implementación: agrupar talleres por id_taller.',
        'data' => [
            'fase' => 2,
            'estado' => 'pendiente',
        ],
    ], 501);
}
