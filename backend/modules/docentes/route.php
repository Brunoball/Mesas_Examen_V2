<?php
// backend/modules/docentes/route.php
declare(strict_types=1);

require_once __DIR__ . '/docentes_controller.php';

function route_docentes(string $action): bool
{
    switch ($action) {
        case 'docentes_catalogos':
            docentes_catalogos();
            return true;

        case 'docentes_listar':
            docentes_listar();
            return true;

        case 'docentes_obtener':
            docentes_obtener();
            return true;

        case 'docentes_guardar':
            docentes_guardar();
            return true;

        case 'docentes_cambiar_estado':
        case 'docentes_dar_baja':
        case 'docentes_dar_alta':
            docentes_cambiar_estado();
            return true;

        case 'docentes_eliminar':
            docentes_eliminar();
            return true;

        default:
            return false;
    }
}
