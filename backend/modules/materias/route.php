<?php
// backend/modules/materias/route.php
declare(strict_types=1);

require_once __DIR__ . '/materias_controller.php';
require_once __DIR__ . '/correlativas_controller.php';
require_once __DIR__ . '/talleres_controller.php';
require_once __DIR__ . '/areas_controller.php';

function route_materias(string $action): bool
{
    switch ($action) {
        case 'materias_catalogos':
            materias_catalogos();
            return true;

        case 'materias_listar':
            materias_listar();
            return true;


        case 'materias_guardar':
            materias_guardar();
            return true;

        case 'materias_eliminar':
            materias_eliminar();
            return true;

        case 'materias_cambiar_estado':
            materias_cambiar_estado();
            return true;

        case 'materias_correlativas_listar':
            materias_correlativas_listar();
            return true;

        case 'materias_correlativas_guardar':
            materias_correlativas_guardar();
            return true;

        case 'materias_correlativas_guardar_masivo':
            materias_correlativas_guardar_masivo();
            return true;

        case 'materias_correlativas_autogenerar_por_materia':
            materias_correlativas_autogenerar_por_materia();
            return true;

        case 'materias_correlativas_eliminar':
            materias_correlativas_eliminar();
            return true;

        case 'talleres_listar':
            talleres_listar();
            return true;

        case 'talleres_catedras_por_curso_divisiones':
            talleres_catedras_por_curso_divisiones();
            return true;

        case 'talleres_guardar':
            talleres_guardar();
            return true;

        case 'talleres_eliminar':
            talleres_eliminar();
            return true;

        case 'talleres_materia_agregar':
            talleres_materia_agregar();
            return true;

        case 'talleres_materia_eliminar':
            talleres_materia_eliminar();
            return true;

        case 'talleres_materias_asignar_area':
            talleres_materias_asignar_area();
            return true;

        case 'areas_listar':
            areas_listar();
            return true;

        case 'areas_guardar':
            areas_guardar();
            return true;

        case 'areas_eliminar':
            areas_eliminar();
            return true;

        default:
            return false;
    }
}
