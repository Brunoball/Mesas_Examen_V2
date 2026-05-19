<?php
// backend/modules/mesas/route.php
declare(strict_types=1);

require_once __DIR__ . '/armado_mesas/armado_mesas_controller.php';
require_once __DIR__ . '/armado_mesas_docentes/armado_mesas_docentes_controller.php';
require_once __DIR__ . '/editar_mesas/route.php';
require_once __DIR__ . '/resultados/route_resultados.php';
require_once __DIR__ . '/historial_mesas/route_historial.php';

function route_mesas(string $action): bool
{
    if (route_mesas_editar($action)) {
        return true;
    }

    if (route_mesas_resultados($action)) {
        return true;
    }

    if (route_mesas_historial($action)) {
        return true;
    }

    switch ($action) {
        case 'mesas_examen_listar':
            mesas_examen_listar();
            return true;

        case 'mesas_armado_parametros':
            mesas_armado_parametros();
            return true;

        /*
         * Acción principal del botón/modal.
         * Crea el borrador, numera y, si llegan fecha_inicio/fecha_fin,
         * valida y asigna fecha_mesa + id_turno en la tabla mesas.
         */
        case 'mesas_armado_crear':
        case 'mesas_armado_crear_numerado':
        case 'mesas_armado_fase_1_generar_borrador':
            mesas_armado_crear();
            return true;

        /*
         * Variante alternativa desde el modal:
         * usa la carpeta armado_mesas_docentes y prioriza disponibilidad docente.
         * El armado por area anterior queda intacto en mesas_armado_crear.
         */
        case 'mesas_armado_crear_docentes':
        case 'mesas_armado_docentes_crear':
        case 'mesas_armado_crear_por_disponibilidad_docente':
            mesas_armado_docentes_crear();
            return true;

        case 'mesas_armado_eliminar_borrador':
        case 'mesas_armado_eliminar_mesas':
        case 'mesas_eliminar_armado':
            mesas_armado_eliminar_borrador();
            return true;

        case 'mesas_armado_fase_2_talleres':
        case 'mesas_armado_fase_2_agrupar_talleres':
            mesas_armado_fase_2_agrupar_talleres();
            return true;

        /*
         * Fase 3 real: valida todo el armado actual y asigna fecha/turno
         * por numero_mesa, respetando prioridad, correlativas, talleres,
         * cantidad de alumnos, disponibilidad docente y choques de alumno/docente.
         */
        case 'mesas_armado_fase_3_correlativas':
        case 'mesas_armado_fase_3_agrupar_correlativas':
        case 'mesas_armado_fase_3_calendarizar':
        case 'mesas_armado_validar_y_calendarizar':
        case 'mesas_armado_asignar_fechas_turnos':
        case 'mesas_armado_calendarizar':
            mesas_armado_fase_3_validar_y_calendarizar();
            return true;

        /*
         * Acción para corregir/numerar lo que ya exista en la tabla mesas.
         */
        case 'mesas_armado_fase_4_simples':
        case 'mesas_armado_fase_4_agrupar_simples':
        case 'mesas_armado_numerar':
        case 'mesas_armado_asignar_numeros':
        case 'mesas_armado_numerar_docente_materia':
        case 'mesas_armado_reparar_numeros':
            mesas_armado_fase_4_agrupar_simples();
            return true;

        case 'mesas_armado_fase_5_validar_numerar':
        case 'mesas_armado_fase_5_validar_y_numerar':
            mesas_armado_fase_5_validar_y_numerar();
            return true;

        /*
         * Etapa final: cruza los numero_mesa ya calendarizados y arma la mesa
         * final agrupando 2 a 4 números por misma fecha/turno/área. Taller queda solo.
         */
        case 'mesas_armado_fase_6_grupos_finales':
        case 'mesas_armado_grupos_finales':
        case 'mesas_armado_agrupar_grupos_finales':
        case 'mesas_armado_crear_grupos':
            mesas_armado_grupos_finales();
            return true;

        case 'mesas_armado_grupos_finales_docentes':
        case 'mesas_armado_docentes_grupos_finales':
        case 'mesas_armado_crear_grupos_docentes':
            mesas_armado_docentes_grupos_finales();
            return true;

        /*
         * Fase 7 final: reoptimiza las mesas no agrupadas.
         * Usa las mesas simples como comodines: puede moverles fecha/turno para
         * completar grupos existentes o formar nuevos grupos compatibles.
         */
        case 'mesas_armado_fase_7_reoptimizar':
        case 'mesas_armado_reoptimizar_no_agrupadas':
        case 'mesas_armado_reoptimizar_grupos_finales':
            mesas_armado_fase_7_reoptimizar_no_agrupadas();
            return true;

        case 'mesas_grupos_listar':
        case 'mesas_armado_grupos_listar':
            mesas_grupos_listar();
            return true;

        case 'mesas_no_agrupadas_listar':
        case 'mesas_armado_no_agrupadas_listar':
            mesas_no_agrupadas_listar();
            return true;

    }

    return false;
}
