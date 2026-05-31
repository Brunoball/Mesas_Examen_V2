<?php
// backend/modules/mesas/edicion_por_docente/persona/route_persona.php
declare(strict_types=1);

require_once __DIR__ . '/persona_controller.php';

function route_mesas_editar_docentes_persona(string $action): bool
{
    switch ($action) {
        case 'mesas_editar_docentes_persona_previas_numero':
        case 'mesas_edicion_persona_previas_numero':
        case 'mesas_editar_docentes_previas_numero':
            mesas_editar_docentes_persona_previas_numero();
            return true;

        case 'mesas_editar_docentes_persona_destinos_mover':
        case 'mesas_edicion_persona_destinos_mover':
        case 'mesas_editar_docentes_previas_destinos_mover':
            mesas_editar_docentes_persona_destinos_mover();
            return true;

        case 'mesas_editar_docentes_persona_validar_mover':
        case 'mesas_edicion_persona_validar_mover':
            mesas_editar_docentes_persona_validar_mover();
            return true;

        case 'mesas_editar_docentes_persona_mover':
        case 'mesas_edicion_persona_mover':
        case 'mesas_editar_docentes_mover_previa':
            mesas_editar_docentes_persona_mover();
            return true;

        case 'mesas_editar_docentes_persona_eliminar':
        case 'mesas_edicion_persona_eliminar':
        case 'mesas_editar_docentes_eliminar_previa':
            mesas_editar_docentes_persona_eliminar();
            return true;

        default:
            return false;
    }
}
