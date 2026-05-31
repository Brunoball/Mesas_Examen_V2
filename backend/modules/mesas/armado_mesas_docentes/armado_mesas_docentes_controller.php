<?php
// backend/modules/mesas/armado_mesas_docentes/armado_mesas_docentes_controller.php
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
require_once __DIR__ . '/fases/fase_6_agrupar_grupos_finales.php';
require_once __DIR__ . '/fases/fase_7_reoptimizar_no_agrupadas.php';
require_once __DIR__ . '/../historial_mesas/historial_mesas_helpers.php';
require_once __DIR__ . '/../notificaciones_email/notificaciones_email_cleanup.php';

/**
 * Agrega un item único a una colección usando un índice interno.
 */
function mesas_examen_docentes_agregar_unico(array &$grupo, string $coleccion, string $indice, ?int $id, ?string $texto): void
{
    $texto = trim((string)$texto);

    if ($texto === '') {
        return;
    }

    $key = $id !== null && $id > 0 ? (string)$id : mb_strtolower($texto, 'UTF-8');

    if (isset($grupo[$indice][$key])) {
        return;
    }

    $grupo[$indice][$key] = true;
    $grupo[$coleccion][] = [
        'id' => $id,
        'nombre' => $texto,
    ];
}

/**
 * Agrega texto único a una colección plana.
 */
function mesas_examen_docentes_agregar_texto_unico(array &$grupo, string $coleccion, string $indice, ?string $texto): void
{
    $texto = trim((string)$texto);

    if ($texto === '') {
        return;
    }

    $key = mb_strtolower($texto, 'UTF-8');

    if (isset($grupo[$indice][$key])) {
        return;
    }

    $grupo[$indice][$key] = true;
    $grupo[$coleccion][] = $texto;
}

function mesas_examen_docentes_texto_lista(array $items, string $campo = 'nombre'): string
{
    $textos = [];

    foreach ($items as $item) {
        $valor = is_array($item) ? ($item[$campo] ?? '') : $item;
        $valor = trim((string)$valor);

        if ($valor !== '') {
            $textos[] = $valor;
        }
    }

    return implode(' / ', $textos);
}

function mesas_examen_docentes_tipo_grupo(array $tipos): string
{
    // Taller siempre tiene prioridad visual/operativa porque es el único tipo
    // que debe manejarse como mesa especial y separada.
    if (in_array('taller', $tipos, true)) {
        return 'taller';
    }

    // Correlativa no es una mesa especial aislada: puede convivir con simple.
    // Se muestra como correlativa solo para que el usuario vea que el grupo
    // tiene prioridad académica, pero no se valida como tipo incompatible.
    if (in_array('correlativa', $tipos, true)) {
        return 'correlativa';
    }

    return 'simple';
}

function mesas_examen_docentes_estado_grupo(array $estados): string
{
    if (in_array('observada', $estados, true)) {
        return 'observada';
    }

    if (in_array('borrador', $estados, true)) {
        return 'borrador';
    }

    return 'armada';
}

/**
 * Convierte las filas reales de `mesas` en mesas lógicas agrupadas por numero_mesa.
 * La tabla actual no tiene mesa_detalle; por eso cada alumno queda dentro del arreglo `alumnos`.
 */
function mesas_examen_docentes_agrupar_por_numero(array $filas): array
{
    $grupos = [];

    foreach ($filas as $fila) {
        $numeroMesa = $fila['numero_mesa'] !== null ? (int)$fila['numero_mesa'] : null;
        $key = $numeroMesa !== null ? 'mesa_' . $numeroMesa : 'sin_numero_' . (int)$fila['id_mesa'];

        if (!isset($grupos[$key])) {
            $grupos[$key] = [
                'id' => $key,
                'numero_mesa' => $numeroMesa,
                'numero_mesa_texto' => $numeroMesa !== null ? 'Mesa N° ' . $numeroMesa : 'Sin número',
                'fecha_mesa' => $fila['fecha_mesa'] ?? null,
                'fecha' => $fila['fecha'] ?? null,
                'id_turno' => $fila['id_turno'] !== null ? (int)$fila['id_turno'] : null,
                'turno' => $fila['turno'] ?? null,
                'estado' => $fila['estado'] ?? 'borrador',
                'tipo_mesa' => $fila['tipo_mesa'] ?? 'simple',
                'prioridad' => (int)($fila['prioridad'] ?? 0),
                'observacion' => null,

                'docente' => null,
                'docentes' => [],
                '_docentes_index' => [],

                'materia' => null,
                'materias' => [],
                '_materias_index' => [],

                'curso' => null,
                'cursos' => [],
                '_cursos_index' => [],

                'fechas' => [],
                '_fechas_index' => [],
                'turnos' => [],
                '_turnos_index' => [],
                'observaciones' => [],
                '_observaciones_index' => [],

                '_tipos' => [],
                '_estados' => [],
                '_alumnos_dni_index' => [],
                '_previas_index' => [],
                '_alumnos_index' => [],

                'cantidad_alumnos' => 0,
                'cantidad_alumnos_distintos' => 0,
                'cantidad_previas' => 0,
                'cantidad_registros' => 0,
                'alumnos' => [],
                'registros' => [],
            ];
        }

        $grupo =& $grupos[$key];

        $grupo['_tipos'][] = (string)($fila['tipo_mesa'] ?? 'simple');
        $grupo['_estados'][] = (string)($fila['estado'] ?? 'borrador');
        $grupo['prioridad'] = max((int)$grupo['prioridad'], (int)($fila['prioridad'] ?? 0));
        $grupo['cantidad_registros']++;

        mesas_examen_docentes_agregar_unico(
            $grupo,
            'docentes',
            '_docentes_index',
            $fila['id_docente'] !== null ? (int)$fila['id_docente'] : null,
            $fila['docente'] ?? null
        );

        mesas_examen_docentes_agregar_unico(
            $grupo,
            'materias',
            '_materias_index',
            $fila['id_materia'] !== null ? (int)$fila['id_materia'] : null,
            $fila['materia'] ?? null
        );

        mesas_examen_docentes_agregar_texto_unico($grupo, 'cursos', '_cursos_index', $fila['curso'] ?? null);
        mesas_examen_docentes_agregar_texto_unico($grupo, 'fechas', '_fechas_index', $fila['fecha'] ?? null);
        mesas_examen_docentes_agregar_texto_unico($grupo, 'turnos', '_turnos_index', $fila['turno'] ?? null);
        mesas_examen_docentes_agregar_texto_unico($grupo, 'observaciones', '_observaciones_index', $fila['observacion'] ?? null);

        $dni = trim((string)($fila['dni'] ?? ''));
        $idPrevia = $fila['id_previa'] !== null ? (int)$fila['id_previa'] : null;

        if ($dni !== '') {
            $grupo['_alumnos_dni_index'][$dni] = true;
        }

        if ($idPrevia !== null) {
            $grupo['_previas_index'][(string)$idPrevia] = true;
        }

        $alumnoKey = $idPrevia !== null ? 'previa_' . $idPrevia : 'mesa_' . (int)$fila['id_mesa'];

        if (!isset($grupo['_alumnos_index'][$alumnoKey])) {
            $grupo['_alumnos_index'][$alumnoKey] = count($grupo['alumnos']);
            $grupo['alumnos'][] = [
                'id_mesa' => (int)$fila['id_mesa'],
                'id_mesas' => [(int)$fila['id_mesa']],
                'id_previa' => $idPrevia,
                'dni' => $dni,
                'estudiante' => $fila['estudiante'] ?? '',
                'alumno' => $fila['estudiante'] ?? '',
                'materia' => '',
                'materias' => [],
                '_materias_index' => [],
                'id_materia' => $fila['id_materia'] !== null ? (int)$fila['id_materia'] : null,
                'curso' => $fila['curso'] ?? '',
                'curso_materia' => $fila['curso_materia'] ?? '',
                'division_materia' => $fila['division_materia'] ?? '',
                'cursando_curso' => $fila['cursando_curso'] ?? '',
                'cursando_division' => $fila['cursando_division'] ?? '',
                'condicion' => $fila['condicion'] ?? '',
                'nota' => $fila['nota'] ?? null,
                'anio' => $fila['anio'] ?? null,
                'tipo_mesa' => $fila['tipo_mesa'] ?? 'simple',
                'estado' => $fila['estado'] ?? 'borrador',
                'observacion' => $fila['observacion'] ?? null,
                'docente' => '',
                'docentes' => [],
                '_docentes_index' => [],
                'fecha' => $fila['fecha'] ?? null,
                'turno' => $fila['turno'] ?? null,
                'cantidad_registros' => 0,
            ];
        }

        $idxAlumno = (int)$grupo['_alumnos_index'][$alumnoKey];
        $alumno =& $grupo['alumnos'][$idxAlumno];

        $alumno['cantidad_registros']++;

        if (!in_array((int)$fila['id_mesa'], $alumno['id_mesas'], true)) {
            $alumno['id_mesas'][] = (int)$fila['id_mesa'];
        }

        mesas_examen_docentes_agregar_unico(
            $alumno,
            'materias',
            '_materias_index',
            $fila['id_materia'] !== null ? (int)$fila['id_materia'] : null,
            $fila['materia'] ?? null
        );

        mesas_examen_docentes_agregar_unico(
            $alumno,
            'docentes',
            '_docentes_index',
            $fila['id_docente'] !== null ? (int)$fila['id_docente'] : null,
            $fila['docente'] ?? null
        );

        unset($alumno, $grupo);
    }

    foreach ($grupos as &$grupo) {
        $grupo['tipo_mesa'] = mesas_examen_docentes_tipo_grupo($grupo['_tipos']);
        $grupo['estado'] = mesas_examen_docentes_estado_grupo($grupo['_estados']);
        $grupo['docente'] = mesas_examen_docentes_texto_lista($grupo['docentes']);
        $grupo['materia'] = mesas_examen_docentes_texto_lista($grupo['materias']);
        $grupo['curso'] = mesas_examen_docentes_texto_lista($grupo['cursos'], '');
        $grupo['fecha'] = mesas_examen_docentes_texto_lista($grupo['fechas'], '');
        $grupo['turno'] = mesas_examen_docentes_texto_lista($grupo['turnos'], '');
        $grupo['observacion'] = mesas_examen_docentes_texto_lista($grupo['observaciones'], '');

        $grupo['cantidad_previas'] = count($grupo['_previas_index']);
        $grupo['cantidad_alumnos'] = count($grupo['alumnos']);
        $grupo['cantidad_alumnos_distintos'] = count($grupo['_alumnos_dni_index']);

        foreach ($grupo['alumnos'] as &$alumno) {
            $alumno['materia'] = mesas_examen_docentes_texto_lista($alumno['materias']);
            $alumno['docente'] = mesas_examen_docentes_texto_lista($alumno['docentes']);
            unset($alumno['_materias_index'], $alumno['_docentes_index']);
        }
        unset($alumno);

        unset(
            $grupo['_docentes_index'],
            $grupo['_materias_index'],
            $grupo['_cursos_index'],
            $grupo['_fechas_index'],
            $grupo['_turnos_index'],
            $grupo['_observaciones_index'],
            $grupo['_tipos'],
            $grupo['_estados'],
            $grupo['_alumnos_dni_index'],
            $grupo['_previas_index'],
            $grupo['_alumnos_index']
        );
    }
    unset($grupo);

    return array_values($grupos);
}

/**
 * Lista las mesas ya creadas agrupadas por numero_mesa.
 * Cada elemento devuelto representa una mesa lógica y trae dentro el arreglo `alumnos`.
 */
function mesas_examen_docentes_listar(): void
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
                OR con.condicion LIKE ?
                OR t.turno LIKE ?
                OR CAST(me.numero_mesa AS CHAR) LIKE ?
                OR me.estado LIKE ?
                OR me.tipo_mesa LIKE ?
                OR CONCAT(curso_materia.nombre_curso, ' ', division_materia.nombre_division) LIKE ?
            )";

            $like = '%' . $busqueda . '%';
            $params = [$like, $like, $like, $like, $like, $like, $like, $like, $like, $like];
        }

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
                p.id_condicion,
                con.condicion,

                COALESCE(cat.id_materia, p.id_materia) AS id_materia,
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
            LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra
            LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)
            LEFT JOIN condicion con ON con.id_condicion = p.id_condicion

            LEFT JOIN curso curso_materia ON curso_materia.id_curso = COALESCE(cat.id_curso, p.materia_id_curso)
            LEFT JOIN division division_materia ON division_materia.id_division = COALESCE(cat.id_division, p.materia_id_division)

            LEFT JOIN curso curso_cursando ON curso_cursando.id_curso = p.cursando_id_curso
            LEFT JOIN division division_cursando ON division_cursando.id_division = p.cursando_id_division

            LEFT JOIN docentes doc ON doc.id_docente = me.id_docente
            LEFT JOIN turnos t ON t.id_turno = me.id_turno
            WHERE {$where}
            ORDER BY
                me.numero_mesa IS NULL ASC,
                me.numero_mesa ASC,
                me.fecha_mesa ASC,
                me.id_turno ASC,
                doc.docente ASC,
                mat.materia ASC,
                p.alumno ASC,
                me.id_mesa ASC
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $grupos = mesas_examen_docentes_agrupar_por_numero($filas);

        $total = count($grupos);
        $data = array_slice($grupos, $offset, $porPagina);

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
        log_error($e, 'mesas_examen_docentes_listar');

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
function mesas_armado_docentes_parametros(): void
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

        $fechaInicio = (string)($fechas['fecha_inicio_existente'] ?: $hoy->format('Y-m-d'));
        $fechaFin = (string)($fechas['fecha_fin_existente'] ?: $hoy->modify('+7 days')->format('Y-m-d'));

        $fechaInicio = mesas_armado_docentes_ajustar_a_dia_habil($fechaInicio, 'siguiente');
        $fechaFin = mesas_armado_docentes_ajustar_a_dia_habil($fechaFin, 'siguiente');

        if ($fechaFin < $fechaInicio) {
            $fechaFin = $fechaInicio;
        }

        json_response([
            'exito' => true,
            'data' => [
                'fecha_inicio_sugerida' => $fechaInicio,
                'fecha_fin_sugerida' => $fechaFin,
                'excluir_fines_semana_obligatorio' => true,
                'turnos' => $turnos,
                'total_previas_para_armar' => $totalPrevias,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_docentes_parametros');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener los parámetros de armado.',
        ], 500);
    }
}

/**
 * Elimina el armado operativo actual.
 * En esta etapa también elimina filas numeradas porque numero_mesa se recalcula desde cero.
 */
function mesas_armado_docentes_valor_booleano($valor, bool $default = false): bool
{
    if ($valor === null || $valor === '') {
        return $default;
    }

    if (is_bool($valor)) {
        return $valor;
    }

    if (is_numeric($valor)) {
        return ((int)$valor) === 1;
    }

    $texto = strtolower(trim((string)$valor));
    if (in_array($texto, ['1', 'true', 'si', 'sí', 'yes', 'on'], true)) {
        return true;
    }

    if (in_array($texto, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return $default;
}

function mesas_armado_docentes_body(): array
{
    if (function_exists('get_json_body')) {
        $body = get_json_body();
        if (is_array($body)) {
            return $body;
        }
    }

    if (function_exists('request_body')) {
        $body = request_body();
        if (is_array($body)) {
            return $body;
        }
    }

    $raw = file_get_contents('php://input');
    $json = json_decode((string)$raw, true);
    return is_array($json) ? $json : [];
}

function mesas_armado_docentes_eliminar_borrador(): void
{
    try {
        $pdo = db();
        $body = mesas_armado_docentes_body();
        $guardarHistorialArmado = mesas_armado_docentes_valor_booleano($body['guardar_historial'] ?? true, true);

        $gruposEliminados = 0;
        $noAgrupadasEliminadas = 0;

        if (function_exists('mesas_armado_docentes_grupos_asegurar_tablas')) {
            mesas_armado_docentes_grupos_asegurar_tablas($pdo);
        }

        $idHistorialArmado = null;
        $notasDesaprobadasLimpiadas = 0;
        $notasAprobadasSinHistorialLimpiadas = 0;
        $notasHistorialEliminadas = 0;
        $notificacionesLimpiadas = [];
        if ($guardarHistorialArmado && function_exists('mesas_historial_crear_armado_actual')) {
            $idHistorialArmado = mesas_historial_crear_armado_actual($pdo, 'eliminacion_armado');
        }

        // Si se guarda historial, la foto del armado conserva las notas dentro del detalle.
        // Si NO se guarda historial, se eliminan las notas del historial técnico para que no
        // queden resultados sueltos de mesas que ya no existen. La baja de previas aprobadas
        // queda intacta porque esa información vive en `previas`.
        if (!$guardarHistorialArmado && function_exists('mesas_historial_eliminar_resultados_armado_actual')) {
            $notasHistorialEliminadas = mesas_historial_eliminar_resultados_armado_actual($pdo);
        }

        if (!$guardarHistorialArmado && function_exists('mesas_historial_limpiar_notas_aprobadas_sin_historial_armado_actual')) {
            $notasAprobadasSinHistorialLimpiadas = mesas_historial_limpiar_notas_aprobadas_sin_historial_armado_actual($pdo);
        }

        // Las desaprobadas vuelven limpias para próximos armados. Las aprobadas no se reactivan.
        if (function_exists('mesas_historial_limpiar_notas_desaprobadas_armado_actual')) {
            $notasDesaprobadasLimpiadas = mesas_historial_limpiar_notas_desaprobadas_armado_actual($pdo);
        }

        if (function_exists('mesas_notificaciones_cleanup_todo')) {
            $notificacionesLimpiadas = mesas_notificaciones_cleanup_todo($pdo);
        }

        if (function_exists('mesas_armado_docentes_grupos_asegurar_tablas')) {
            $noAgrupadasEliminadas = (int)$pdo->exec('DELETE FROM mesas_no_agrupadas');
            $gruposEliminados = (int)$pdo->exec('DELETE FROM mesas_grupos');
        }

        $stmt = $pdo->prepare("
            DELETE FROM mesas
            WHERE estado IN ('borrador', 'observada', 'armada')
        ");
        $stmt->execute();

        json_response([
            'exito' => true,
            'mensaje' => 'Mesas borrador eliminadas correctamente.',
            'data' => [
                'eliminadas' => $stmt->rowCount(),
                'grupos_eliminados' => $gruposEliminados,
                'no_agrupadas_eliminadas' => $noAgrupadasEliminadas,
                'guardar_historial_armado' => $guardarHistorialArmado,
                'id_historial_armado' => $idHistorialArmado,
                'notas_desaprobadas_limpiadas' => $notasDesaprobadasLimpiadas,
                'notas_aprobadas_sin_historial_limpiadas' => $notasAprobadasSinHistorialLimpiadas,
                'notas_historial_eliminadas' => $notasHistorialEliminadas,
                'notificaciones_limpiadas' => $notificacionesLimpiadas,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_docentes_eliminar_borrador');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al eliminar las mesas borrador.',
        ], 500);
    }
}
