<?php
// backend/modules/mesas/editar_mesas/persona/route_persona.php
declare(strict_types=1);

require_once __DIR__ . '/persona_controller.php';

function route_mesas_editar_persona(string $action): bool
{
    switch ($action) {
        case 'mesas_editar_persona_previas_numero':
        case 'mesas_edicion_persona_previas_numero':
        case 'mesas_editar_previas_numero':
            mesas_editar_persona_previas_numero();
            return true;

        case 'mesas_editar_persona_destinos_mover':
        case 'mesas_edicion_persona_destinos_mover':
        case 'mesas_editar_previas_destinos_mover':
            mesas_editar_persona_destinos_mover();
            return true;

        case 'mesas_editar_persona_validar_mover':
        case 'mesas_edicion_persona_validar_mover':
            mesas_editar_persona_validar_mover();
            return true;

        case 'mesas_editar_persona_mover':
        case 'mesas_edicion_persona_mover':
        case 'mesas_editar_mover_previa':
            mesas_editar_persona_mover();
            return true;

        case 'mesas_editar_persona_eliminar':
        case 'mesas_edicion_persona_eliminar':
        case 'mesas_editar_eliminar_previa':
            mesas_editar_persona_eliminar();
            return true;

        default:
            return false;
    }
}
