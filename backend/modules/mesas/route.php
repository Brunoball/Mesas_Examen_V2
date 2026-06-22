<?php
// backend/modules/mesas/route.php
declare(strict_types=1);

require_once __DIR__ . '/armado_rango_helper.php';
require_once __DIR__ . '/armado_mesas/armado_mesas_controller.php';
require_once __DIR__ . '/armado_mesas_docentes/armado_mesas_docentes_controller.php';
require_once __DIR__ . '/editar_mesas/route.php';
require_once __DIR__ . '/edicion_por_docente/route.php';
require_once __DIR__ . '/resultados/route_resultados.php';
require_once __DIR__ . '/historial_mesas/route_historial.php';
require_once __DIR__ . '/docentes_cambios/route_docentes_cambios.php';
require_once __DIR__ . '/notificaciones_email/route_notificaciones_email.php';


function route_mesas_es_accion_edicion(string $action): bool
{
    return str_starts_with($action, 'mesas_editar_')
        || str_starts_with($action, 'mesas_edicion_');
}

function route_mesas_accion_edicion_docente(string $action): string
{
    if (str_starts_with($action, 'mesas_editar_')) {
        return 'mesas_editar_docentes_' . substr($action, strlen('mesas_editar_'));
    }

    if (str_starts_with($action, 'mesas_edicion_')) {
        return 'mesas_editar_docentes_' . substr($action, strlen('mesas_edicion_'));
    }

    return $action;
}

function route_mesas_armado_actual_es_docentes(): bool
{
    try {
        $pdo = db();

        // Primero se usa el detector específico de la edición por indisponibilidad docente.
        // Ese helper mira tabla de rango + auditoría y evita caer por error en la edición por área
        // cuando el último armado fue por docentes pero la tabla quedó vieja/incompleta.
        if (function_exists('mesas_editar_docentes_es_armado_por_docentes')) {
            return mesas_editar_docentes_es_armado_por_docentes($pdo);
        }

        if (function_exists('mesas_armado_rango_obtener_actual')) {
            $rango = mesas_armado_rango_obtener_actual($pdo);
            $tipo = mb_strtolower(trim((string)($rango['tipo_armado'] ?? '')), 'UTF-8');
            if ($tipo !== '') {
                return str_contains($tipo, 'docente') || str_contains($tipo, 'dispon');
            }
        }

        if (function_exists('mesas_armado_tabla_existe') && mesas_armado_tabla_existe($pdo, 'mesas_armado_rango_actual')) {
            $stmt = $pdo->query("SELECT tipo_armado FROM mesas_armado_rango_actual WHERE id = 1 LIMIT 1");
            $tipo = mb_strtolower(trim((string)($stmt ? $stmt->fetchColumn() : '')), 'UTF-8');
            return str_contains($tipo, 'docente') || str_contains($tipo, 'dispon');
        }
    } catch (Throwable $e) {
        return false;
    }

    return false;
}

function route_mesas(string $action): bool
{
    if (route_mesas_es_accion_edicion($action) && route_mesas_armado_actual_es_docentes()) {
        if (route_mesas_editar_docentes(route_mesas_accion_edicion_docente($action))) {
            return true;
        }
    }

    if (route_mesas_editar($action)) {
        return true;
    }

    if (route_mesas_resultados($action)) {
        return true;
    }

    if (route_mesas_historial($action)) {
        return true;
    }

    if (route_mesas_docentes_cambios($action)) {
        return true;
    }

    if (route_mesas_notificaciones_email($action)) {
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
         * usa la carpeta armado_mesas_docentes y evita indisponibilidad docente.
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
         * cantidad de alumnos, indisponibilidad docente y choques de alumno/docente.
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
            // Si el armado vigente es por indisponibilidad docente, la reoptimización manual
            // también debe usar el motor de docentes. Antes esta acción genérica caía en
            // la reoptimización por área y podía volver a aplicar criterios incorrectos.
            if (route_mesas_armado_actual_es_docentes() && function_exists('mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas')) {
                mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas();
                return true;
            }

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
