<?php
// backend/modules/mesas/route.php
declare(strict_types=1);

require_once __DIR__ . '/armado_mesas/armado_mesas_controller.php';

function route_mesas(string $action): bool
{
    switch ($action) {
        case 'mesas_examen_listar':
            mesas_examen_listar();
            return true;

        case 'mesas_armado_parametros':
            mesas_armado_parametros();
            return true;

        /*
         * Fase 1 actual: genera el borrador base en la tabla mesas.
         * Mantengo el action original para no romper el frontend.
         */
        case 'mesas_armado_crear':
        case 'mesas_armado_fase_1_generar_borrador':
            mesas_armado_crear();
            return true;

        case 'mesas_armado_eliminar_borrador':
            mesas_armado_eliminar_borrador();
            return true;

        /*
         * Acciones preparadas para las fases siguientes.
         * Por ahora responden pendiente de implementación.
         */
        case 'mesas_armado_fase_2_talleres':
        case 'mesas_armado_fase_2_agrupar_talleres':
            mesas_armado_fase_2_agrupar_talleres();
            return true;

        case 'mesas_armado_fase_3_correlativas':
        case 'mesas_armado_fase_3_agrupar_correlativas':
            mesas_armado_fase_3_agrupar_correlativas();
            return true;

        case 'mesas_armado_fase_4_simples':
        case 'mesas_armado_fase_4_agrupar_simples':
            mesas_armado_fase_4_agrupar_simples();
            return true;

        case 'mesas_armado_fase_5_validar_numerar':
        case 'mesas_armado_fase_5_validar_y_numerar':
            mesas_armado_fase_5_validar_y_numerar();
            return true;
    }

    return false;
}
