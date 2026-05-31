<?php
// backend/modules/mesas/edicion_por_docente/agregar_numero/route_agregar_numero.php
declare(strict_types=1);

require_once __DIR__ . '/agregar_numero_controller.php';

function route_mesas_editar_docentes_agregar_numero(string $action): bool
{
    switch ($action) {
        case 'mesas_editar_docentes_agregar_numero_opciones':
        case 'mesas_edicion_agregar_numero_opciones':
        case 'mesas_editar_docentes_numero_opciones':
            mesas_editar_docentes_agregar_numero_opciones_controller();
            return true;

        case 'mesas_editar_docentes_agregar_numero_confirmar':
        case 'mesas_edicion_agregar_numero_confirmar':
        case 'mesas_editar_docentes_numero_agregar':
            mesas_editar_docentes_agregar_numero_confirmar_controller();
            return true;

        case 'mesas_editar_docentes_habilitar_slot_extra':
        case 'mesas_edicion_habilitar_slot_extra':
        case 'mesas_editar_docentes_agregar_slot_extra':
            mesas_editar_docentes_habilitar_slot_extra_controller();
            return true;

        case 'mesas_editar_docentes_eliminar_slot_extra':
        case 'mesas_edicion_eliminar_slot_extra':
        case 'mesas_editar_docentes_quitar_slot_extra':
            mesas_editar_docentes_eliminar_slot_extra_controller();
            return true;

        default:
            return false;
    }
}
