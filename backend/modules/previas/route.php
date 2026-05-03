<?php
// backend/modules/previas/route.php
declare(strict_types=1);

require_once __DIR__ . '/previas_controller.php';

function route_previas(string $action): bool
{
    switch ($action) {
        case 'previas_catalogos':
            previas_catalogos();
            return true;

        case 'previas_condiciones':
            previas_condiciones();
            return true;

        case 'previas_listar':
            previas_listar();
            return true;

        case 'previas_obtener':
            previas_obtener();
            return true;

        case 'previas_guardar':
            previas_guardar();
            return true;

        case 'previas_cambiar_estado':
        case 'previas_dar_baja':
        case 'previas_dar_alta':
            previas_cambiar_estado();
            return true;

        case 'previas_eliminar':
            previas_eliminar();
            return true;

        default:
            return false;
    }
}
