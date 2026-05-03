<?php
// backend/modules/mesas/armado_mesas/armado_mesas_controller.php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Controlador principal del armado de mesas
|--------------------------------------------------------------------------
| Este archivo deja juntas las acciones generales del módulo y carga las
| fases separadas del armado. La fase 1 conserva la lógica que ya funcionaba:
| genera los registros base en la tabla `mesas` con numero_mesa = NULL.
|
| Estructura de prioridad actual:
|   0 = simple / normal
|   1 = taller
|   2 = correlativa
|--------------------------------------------------------------------------
*/

require_once __DIR__ . '/fases/helpers_armado.php';
require_once __DIR__ . '/fases/fase_1_generar_borrador.php';
require_once __DIR__ . '/fases/fase_2_agrupar_talleres.php';
require_once __DIR__ . '/fases/fase_3_agrupar_correlativas.php';
require_once __DIR__ . '/fases/fase_4_agrupar_simples.php';
require_once __DIR__ . '/fases/fase_5_validar_y_numerar.php';

/**
 * Lista las mesas ya creadas en la tabla mesas.
 * Esta vista todavía trabaja sobre la estructura actual:
 * una fila de mesas representa una previa ya cruzada con cátedra/docente.
 */
function mesas_examen_listar(): void
{
    try {
        $pdo = db();

        ['pagina' => $pagina, 'por_pagina' => $porPagina, 'offset' => $offset] = paginacion();

        $busqueda = trim((string)($_GET['busqueda'] ?? ''));

        $where = '1 = 1';
        $params = [];

        if ($busqueda !== '') {
            $where .= " AND (
                mat.materia LIKE ?
                OR p.alumno LIKE ?
                OR p.dni LIKE ?
                OR doc.docente LIKE ?
                OR t.turno LIKE ?
                OR CAST(me.numero_mesa AS CHAR) LIKE ?
                OR me.estado LIKE ?
            )";

            $like = '%' . $busqueda . '%';
            $params = [$like, $like, $like, $like, $like, $like, $like];
        }

        $stmtTotal = $pdo->prepare("
            SELECT COUNT(*)
            FROM mesas me
            LEFT JOIN previas p ON p.id_previa = me.id_previa
            LEFT JOIN materias mat ON mat.id_materia = p.id_materia
            LEFT JOIN docentes doc ON doc.id_docente = me.id_docente
            LEFT JOIN turnos t ON t.id_turno = me.id_turno
            WHERE {$where}
        ");
        $stmtTotal->execute($params);
        $total = (int)$stmtTotal->fetchColumn();

        $sql = "
            SELECT
                me.id_mesa,
                me.numero_mesa,
                me.prioridad,
                me.tipo_mesa,
                me.id_taller,
                me.id_catedra,
                me.id_previa,
                me.id_docente,
                me.fecha_mesa,
                DATE_FORMAT(me.fecha_mesa, '%d/%m/%Y') AS fecha,
                me.id_turno,
                t.turno,
                me.estado,
                me.observacion,
                me.creado_en,

                p.dni,
                p.alumno AS estudiante,
                p.nota,
                p.anio,
                p.inscripcion,
                p.activo AS previa_activa,

                mat.materia,

                curso_materia.nombre_curso AS curso_materia,
                division_materia.nombre_division AS division_materia,
                CONCAT(curso_materia.nombre_curso, ' ', division_materia.nombre_division) AS curso,

                curso_cursando.nombre_curso AS cursando_curso,
                division_cursando.nombre_division AS cursando_division,

                doc.docente,

                cat.id_curso AS catedra_id_curso,
                cat.id_division AS catedra_id_division
            FROM mesas me
            LEFT JOIN previas p ON p.id_previa = me.id_previa
            LEFT JOIN materias mat ON mat.id_materia = p.id_materia

            LEFT JOIN curso curso_materia ON curso_materia.id_curso = p.materia_id_curso
            LEFT JOIN division division_materia ON division_materia.id_division = p.materia_id_division

            LEFT JOIN curso curso_cursando ON curso_cursando.id_curso = p.cursando_id_curso
            LEFT JOIN division division_cursando ON division_cursando.id_division = p.cursando_id_division

            LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra
            LEFT JOIN docentes doc ON doc.id_docente = me.id_docente
            LEFT JOIN turnos t ON t.id_turno = me.id_turno
            WHERE {$where}
            ORDER BY
                me.fecha_mesa IS NULL ASC,
                me.fecha_mesa ASC,
                me.id_turno ASC,
                me.prioridad DESC,
                mat.materia ASC,
                p.alumno ASC
            LIMIT ? OFFSET ?
        ";

        $stmt = $pdo->prepare($sql);

        $i = 1;
        foreach ($params as $param) {
            $stmt->bindValue($i, $param, PDO::PARAM_STR);
            $i++;
        }

        $stmt->bindValue($i, $porPagina, PDO::PARAM_INT);
        $stmt->bindValue($i + 1, $offset, PDO::PARAM_INT);
        $stmt->execute();

        $data = $stmt->fetchAll();

        json_response([
            'exito' => true,
            'data' => $data,
            'paginacion' => [
                'total' => $total,
                'pagina' => $pagina,
                'por_pagina' => $porPagina,
                'paginas' => (int)ceil($total / max(1, $porPagina)),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_examen_listar');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al listar las mesas.',
        ], 500);
    }
}

/**
 * Devuelve los parámetros iniciales del modal:
 * - fechas sugeridas desde backend
 * - turnos activos
 * - cantidad de previas que entran en el armado inicial
 */
function mesas_armado_parametros(): void
{
    try {
        $pdo = db();

        $stmtTurnos = $pdo->query("
            SELECT id_turno, turno
            FROM turnos
            WHERE activo = 1
            ORDER BY id_turno ASC
        ");
        $turnos = $stmtTurnos->fetchAll();

        $stmtPrevias = $pdo->query("
            SELECT COUNT(*)
            FROM previas
            WHERE inscripcion = 1
              AND activo = 1
              AND id_condicion = 3
        ");
        $totalPrevias = (int)$stmtPrevias->fetchColumn();

        $stmtFechas = $pdo->query("
            SELECT
                MIN(fecha_mesa) AS fecha_inicio_existente,
                MAX(fecha_mesa) AS fecha_fin_existente
            FROM mesas
            WHERE fecha_mesa IS NOT NULL
        ");
        $fechas = $stmtFechas->fetch() ?: [];

        $hoy = new DateTimeImmutable('today');
        $fechaInicio = $fechas['fecha_inicio_existente'] ?: $hoy->format('Y-m-d');
        $fechaFin = $fechas['fecha_fin_existente'] ?: $hoy->modify('+7 days')->format('Y-m-d');

        json_response([
            'exito' => true,
            'data' => [
                'fecha_inicio_sugerida' => $fechaInicio,
                'fecha_fin_sugerida' => $fechaFin,
                'turnos' => $turnos,
                'total_previas_para_armar' => $totalPrevias,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_parametros');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener los parámetros de armado.',
        ], 500);
    }
}

/**
 * Elimina solamente el armado borrador/observado sin número de mesa.
 * No toca mesas ya numeradas.
 */
function mesas_armado_eliminar_borrador(): void
{
    try {
        $pdo = db();

        $stmt = $pdo->prepare("
            DELETE FROM mesas
            WHERE numero_mesa IS NULL
              AND estado IN ('borrador', 'observada')
        ");
        $stmt->execute();

        json_response([
            'exito' => true,
            'mensaje' => 'Mesas borrador eliminadas correctamente.',
            'data' => [
                'eliminadas' => $stmt->rowCount(),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_eliminar_borrador');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al eliminar las mesas borrador.',
        ], 500);
    }
}
