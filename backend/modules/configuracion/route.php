<?php
// backend/modules/configuracion/route.php
declare(strict_types=1);

require_once __DIR__ . '/usuarios_controller.php';

function route_configuracion(string $action): bool
{
    switch ($action) {
        case 'configuracion_usuarios_listar':
            configuracion_usuarios_listar();
            return true;

        case 'configuracion_usuarios_obtener':
            configuracion_usuarios_obtener();
            return true;

        case 'configuracion_usuarios_guardar':
            configuracion_usuarios_guardar();
            return true;

        case 'configuracion_usuarios_cambiar_estado':
        case 'configuracion_usuarios_alta':
        case 'configuracion_usuarios_baja':
            configuracion_usuarios_cambiar_estado();
            return true;

        case 'configuracion_usuarios_eliminar':
            configuracion_usuarios_eliminar();
            return true;

        default:
            return false;
    }
}
