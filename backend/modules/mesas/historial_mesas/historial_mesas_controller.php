<?php
// backend/modules/mesas/historial_mesas/historial_mesas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/historial_mesas_helpers.php';

function mesas_historial_like_sql(array $expresiones, string $prefijo, string $busqueda, array &$params): string
{
    $partes = [];
    $valor = '%' . $busqueda . '%';

    foreach ($expresiones as $i => $expresion) {
        $placeholder = ':' . $prefijo . $i;
        $partes[] = $expresion . ' LIKE ' . $placeholder;
        $params[$placeholder] = $valor;
    }

    return '(' . implode(' OR ', $partes) . ')';
}

function mesas_historial_limite($valor, int $default, int $max): int
{
    $n = is_numeric($valor) ? (int)$valor : $default;
    if ($n <= 0) {
        return $default;
    }
    return min($n, $max);
}

function mesas_historial_resultado_key_mesa(array $resultado): string
{
    $idPrevia = (int)($resultado['id_previa_original'] ?? 0);
    $idMesa = (int)($resultado['id_mesa'] ?? 0);

    if ($idMesa > 0) {
        return 'mesa:' . $idPrevia . ':' . $idMesa;
    }

    // Fallback para históricos viejos sin id_mesa: se identifica por el contexto real de la mesa.
    // No se usa alumno+materia solos porque eso mezclaría otra mesa del mismo alumno.
    return implode(':', [
        'ctx',
        $idPrevia,
        (int)($resultado['numero_mesa'] ?? 0),
        (string)($resultado['fecha_mesa'] ?? ''),
        (int)($resultado['id_turno'] ?? 0),
        (int)($resultado['id_catedra'] ?? 0),
        (int)($resultado['id_materia'] ?? 0),
    ]);
}

function mesas_historial_resultados_sin_duplicados_de_edicion(array $resultados): array
{
    $vistos = [];
    $limpios = [];

    foreach ($resultados as $resultado) {
        $key = mesas_historial_resultado_key_mesa($resultado);
        if (isset($vistos[$key])) {
            continue;
        }

        $vistos[$key] = true;
        $limpios[] = $resultado;
    }

    return $limpios;
}

function mesas_historial_listar(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $busqueda = trim((string)($_GET['busqueda'] ?? ''));
        $limiteResultados = mesas_historial_limite($_GET['limite_resultados'] ?? null, 250, 1000);
        $limiteArmados = mesas_historial_limite($_GET['limite_armados'] ?? null, 60, 300);

        $whereResultados = '1 = 1';
        $paramsResultados = [];
        if ($busqueda !== '') {
            $whereResultados .= ' AND ' . mesas_historial_like_sql([
                "COALESCE(alumno, '')",
                "COALESCE(dni, '')",
                "COALESCE(materia, '')",
                "COALESCE(docente, '')",
                "COALESCE(condicion, '')",
                "COALESCE(tipo_mesa, '')",
                "COALESCE(estado_resultado, '')",
                "COALESCE(motivo, '')",
                "CAST(numero_mesa AS CHAR)",
                "CAST(numero_grupo AS CHAR)",
                "DATE_FORMAT(fecha_mesa, '%d/%m/%Y')",
                "DATE_FORMAT(fecha_nota, '%d/%m/%Y')",
            ], 'res_busq_', $busqueda, $paramsResultados);
        }

        $stmtResultados = $pdo->prepare("\n            SELECT\n                id_resultado,\n                id_previa_original,\n                id_mesa,\n                numero_mesa,\n                numero_grupo,\n                fecha_mesa,\n                DATE_FORMAT(fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,\n                id_turno,\n                hora,\n                dni,\n                alumno,\n                cursando_id_curso,\n                cursando_id_division,\n                id_materia,\n                materia,\n                materia_id_curso,\n                materia_id_division,\n                id_condicion,\n                condicion,\n                id_catedra,\n                id_docente,\n                docente,\n                tipo_mesa,\n                anio,\n                nota,\n                aprobado,\n                estado_resultado,\n                fecha_nota,\n                DATE_FORMAT(fecha_nota, '%d/%m/%Y') AS fecha_nota_texto,\n                motivo,\n                creado_en\n            FROM historial_previas_resultados\n            WHERE {$whereResultados}\n            ORDER BY fecha_nota DESC, creado_en DESC, id_resultado DESC\n            LIMIT {$limiteResultados}\n        ");
        $stmtResultados->execute($paramsResultados);
        $resultados = $stmtResultados->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $resultados = mesas_historial_resultados_sin_duplicados_de_edicion($resultados);

        // En el historial general, una fila de tipo taller no debe parecer una materia común.
        // El detalle del armado conserva cada materia individual, pero esta lista resume el
        // resultado como TALLER para que se entienda que la nota corresponde al bloque taller.
        foreach ($resultados as &$resultado) {
            $tipoMesa = strtolower(trim((string)($resultado['tipo_mesa'] ?? '')));
            $materiaOriginal = trim((string)($resultado['materia'] ?? ''));
            $resultado['materia_original'] = $materiaOriginal;
            $resultado['es_taller'] = $tipoMesa === 'taller' ? 1 : 0;
            $resultado['tipo_mesa_texto'] = $tipoMesa === 'taller' ? 'Taller' : ucfirst($tipoMesa ?: 'Mesa');

            if ($tipoMesa === 'taller') {
                $resultado['materia'] = $materiaOriginal !== ''
                    ? 'TALLER COMPLETO · ' . $materiaOriginal
                    : 'TALLER COMPLETO';
            }
        }
        unset($resultado);

        $whereArmados = '1 = 1';
        $paramsArmados = [];
        if ($busqueda !== '') {
            $condicionArmado = mesas_historial_like_sql([
                "COALESCE(a.codigo_armado, '')",
                "COALESCE(a.motivo, '')",
                "CAST(a.total_mesas AS CHAR)",
                "CAST(a.total_previas AS CHAR)",
                "CAST(a.total_grupos AS CHAR)",
                "CAST(a.total_no_agrupadas AS CHAR)",
                "DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i')",
            ], 'arm_busq_', $busqueda, $paramsArmados);

            $condicionDetalleArmado = mesas_historial_like_sql([
                "COALESCE(d.alumno, '')",
                "COALESCE(d.dni, '')",
                "COALESCE(NULLIF(d.materia, ''), mat_det.materia, '')",
                "COALESCE(NULLIF(d.docente, ''), doc_det.docente, '')",
                "COALESCE(NULLIF(d.condicion, ''), con_det.condicion, '')",
                "COALESCE(d.tipo_mesa, '')",
                "COALESCE(d.estado, '')",
                "COALESCE(d.observacion, '')",
                "COALESCE(t_det.turno, '')",
                "CAST(d.nota AS CHAR)",
                "DATE_FORMAT(d.fecha_nota, '%d/%m/%Y')",
                "CAST(d.numero_mesa AS CHAR)",
                "CAST(d.numero_grupo AS CHAR)",
                "DATE_FORMAT(d.fecha_mesa, '%d/%m/%Y')",
            ], 'arm_det_busq_', $busqueda, $paramsArmados);

            $whereArmados .= " AND (
                {$condicionArmado}
                OR EXISTS (
                    SELECT 1
                    FROM historial_mesas_detalle d
                    LEFT JOIN catedras cat_det ON cat_det.id_catedra = d.id_catedra
                    LEFT JOIN materias mat_det ON mat_det.id_materia = COALESCE(NULLIF(d.id_materia, 0), cat_det.id_materia)
                    LEFT JOIN docentes doc_det ON doc_det.id_docente = COALESCE(NULLIF(d.id_docente, 0), cat_det.id_docente)
                    LEFT JOIN condicion con_det ON con_det.id_condicion = d.id_condicion
                    LEFT JOIN turnos t_det ON t_det.id_turno = d.id_turno
                    WHERE d.id_armado_historial = a.id_armado_historial
                      AND {$condicionDetalleArmado}
                    LIMIT 1
                )
            )";
        }

        $stmtArmados = $pdo->prepare("
            SELECT
                a.id_armado_historial,
                a.codigo_armado,
                a.motivo,
                a.total_mesas,
                a.total_previas,
                a.total_grupos,
                a.total_no_agrupadas,
                a.creado_en,
                DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto
            FROM historial_mesas_armados a
            WHERE {$whereArmados}
            ORDER BY a.creado_en DESC, a.id_armado_historial DESC
            LIMIT {$limiteArmados}
        ");
        $stmtArmados->execute($paramsArmados);
        $armados = $stmtArmados->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // El resumen visible del historial se calcula desde la foto de los armados guardados.
        // Así las notas solo cuentan cuando pertenecen a un armado histórico real.
        $resumen = [
            'total_resultados' => (int)$pdo->query('SELECT COUNT(*) FROM historial_mesas_detalle WHERE nota IS NOT NULL AND nota > 0')->fetchColumn(),
            'total_aprobadas' => (int)$pdo->query('SELECT COUNT(*) FROM historial_mesas_detalle WHERE nota IS NOT NULL AND nota >= 7')->fetchColumn(),
            'total_desaprobadas' => (int)$pdo->query('SELECT COUNT(*) FROM historial_mesas_detalle WHERE nota IS NOT NULL AND nota > 0 AND nota < 7')->fetchColumn(),
            'total_armados' => (int)$pdo->query('SELECT COUNT(*) FROM historial_mesas_armados')->fetchColumn(),
        ];

        json_response([
            'exito' => true,
            'data' => [
                'resultados' => $resultados,
                'armados' => $armados,
                'resumen' => $resumen,
            ],
        ]);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'mesas_historial_listar');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al listar el historial de mesas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}


function mesas_historial_obtener_armados_exportacion(PDO $pdo, string $busqueda, int $limiteArmados): array
{
    $whereArmados = '1 = 1';
    $paramsArmados = [];

    if ($busqueda !== '') {
        $condicionArmado = mesas_historial_like_sql([
            "COALESCE(a.codigo_armado, '')",
            "COALESCE(a.motivo, '')",
            "CAST(a.total_mesas AS CHAR)",
            "CAST(a.total_previas AS CHAR)",
            "CAST(a.total_grupos AS CHAR)",
            "CAST(a.total_no_agrupadas AS CHAR)",
            "DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i')",
        ], 'exp_arm_busq_', $busqueda, $paramsArmados);

        $condicionDetalleArmado = mesas_historial_like_sql([
            "COALESCE(d.alumno, '')",
            "COALESCE(d.dni, '')",
            "COALESCE(NULLIF(d.materia, ''), mat_det.materia, '')",
            "COALESCE(NULLIF(d.docente, ''), doc_det.docente, '')",
            "COALESCE(NULLIF(d.condicion, ''), con_det.condicion, '')",
            "COALESCE(d.tipo_mesa, '')",
            "COALESCE(d.estado, '')",
            "COALESCE(d.observacion, '')",
            "COALESCE(t_det.turno, '')",
            "CAST(d.numero_mesa AS CHAR)",
            "CAST(d.numero_grupo AS CHAR)",
            "DATE_FORMAT(d.fecha_mesa, '%d/%m/%Y')",
        ], 'exp_arm_det_busq_', $busqueda, $paramsArmados);

        $whereArmados .= " AND (
            {$condicionArmado}
            OR EXISTS (
                SELECT 1
                FROM historial_mesas_detalle d
                LEFT JOIN catedras cat_det ON cat_det.id_catedra = d.id_catedra
                LEFT JOIN materias mat_det ON mat_det.id_materia = COALESCE(NULLIF(d.id_materia, 0), cat_det.id_materia)
                LEFT JOIN docentes doc_det ON doc_det.id_docente = COALESCE(NULLIF(d.id_docente, 0), cat_det.id_docente)
                LEFT JOIN condicion con_det ON con_det.id_condicion = d.id_condicion
                LEFT JOIN turnos t_det ON t_det.id_turno = d.id_turno
                WHERE d.id_armado_historial = a.id_armado_historial
                  AND {$condicionDetalleArmado}
                LIMIT 1
            )
        )";
    }

    $stmtArmados = $pdo->prepare("
        SELECT
            a.id_armado_historial,
            a.codigo_armado,
            a.motivo,
            a.total_mesas,
            a.total_previas,
            a.total_grupos,
            a.total_no_agrupadas,
            a.creado_en,
            DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto
        FROM historial_mesas_armados a
        WHERE {$whereArmados}
        ORDER BY a.creado_en DESC, a.id_armado_historial DESC
        LIMIT {$limiteArmados}
    ");
    $stmtArmados->execute($paramsArmados);

    return $stmtArmados->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function mesas_historial_exportar(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $busqueda = trim((string)($_GET['busqueda'] ?? ''));
        $limiteArmados = mesas_historial_limite($_GET['limite_armados'] ?? null, 1000, 3000);
        $limiteResultados = mesas_historial_limite($_GET['limite_resultados'] ?? null, 10000, 50000);

        $whereResultados = '1 = 1';
        $paramsResultados = [];
        if ($busqueda !== '') {
            $whereResultados .= ' AND ' . mesas_historial_like_sql([
                "COALESCE(alumno, '')",
                "COALESCE(dni, '')",
                "COALESCE(materia, '')",
                "COALESCE(docente, '')",
                "COALESCE(condicion, '')",
                "COALESCE(tipo_mesa, '')",
                "COALESCE(estado_resultado, '')",
                "COALESCE(motivo, '')",
                "CAST(numero_mesa AS CHAR)",
                "CAST(numero_grupo AS CHAR)",
                "DATE_FORMAT(fecha_mesa, '%d/%m/%Y')",
                "DATE_FORMAT(fecha_nota, '%d/%m/%Y')",
            ], 'exp_res_busq_', $busqueda, $paramsResultados);
        }

        $stmtResultados = $pdo->prepare("
            SELECT
                id_resultado,
                id_previa_original,
                id_mesa,
                numero_mesa,
                numero_grupo,
                fecha_mesa,
                DATE_FORMAT(fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,
                id_turno,
                hora,
                dni,
                alumno,
                cursando_id_curso,
                cursando_id_division,
                id_materia,
                materia,
                materia_id_curso,
                materia_id_division,
                id_condicion,
                condicion,
                id_catedra,
                id_docente,
                docente,
                tipo_mesa,
                anio,
                nota,
                aprobado,
                estado_resultado,
                fecha_nota,
                DATE_FORMAT(fecha_nota, '%d/%m/%Y') AS fecha_nota_texto,
                motivo,
                creado_en
            FROM historial_previas_resultados
            WHERE {$whereResultados}
            ORDER BY fecha_nota DESC, creado_en DESC, id_resultado DESC
            LIMIT {$limiteResultados}
        ");
        $stmtResultados->execute($paramsResultados);
        $resultados = $stmtResultados->fetchAll(PDO::FETCH_ASSOC) ?: [];

        foreach ($resultados as &$resultado) {
            $tipoMesa = strtolower(trim((string)($resultado['tipo_mesa'] ?? '')));
            $materiaOriginal = trim((string)($resultado['materia'] ?? ''));
            $resultado['materia_original'] = $materiaOriginal;
            $resultado['es_taller'] = $tipoMesa === 'taller' ? 1 : 0;
            $resultado['tipo_mesa_texto'] = $tipoMesa === 'taller' ? 'Taller' : ucfirst($tipoMesa ?: 'Mesa');

            if ($tipoMesa === 'taller') {
                $resultado['materia'] = $materiaOriginal !== ''
                    ? 'TALLER COMPLETO · ' . $materiaOriginal
                    : 'TALLER COMPLETO';
            }
        }
        unset($resultado);

        $armados = mesas_historial_obtener_armados_exportacion($pdo, $busqueda, $limiteArmados);
        $idsArmados = array_values(array_filter(array_map(static function ($item) {
            return is_numeric($item['id_armado_historial'] ?? null) ? (int)$item['id_armado_historial'] : 0;
        }, $armados)));

        $detalle = [];

        if (count($idsArmados) > 0) {
            $paramsDetalle = [];
            $placeholders = [];

            foreach ($idsArmados as $i => $idArmado) {
                $placeholder = ':id_export_' . $i;
                $placeholders[] = $placeholder;
                $paramsDetalle[$placeholder] = $idArmado;
            }

            $stmtDetalle = $pdo->prepare("
                SELECT
                    d.id_historial_detalle,
                    d.id_armado_historial,
                    a.codigo_armado,
                    a.motivo AS motivo_armado,
                    a.creado_en,
                    DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto,
                    d.id_mesa_original,
                    d.numero_mesa,
                    d.numero_grupo,
                    d.prioridad,
                    d.tipo_mesa,
                    d.id_taller,
                    d.id_catedra,
                    d.id_previa_original,
                    d.id_docente,
                    d.fecha_mesa,
                    DATE_FORMAT(d.fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,
                    d.id_turno,
                    t.turno,
                    d.estado,
                    d.observacion,
                    d.dni,
                    d.alumno,
                    d.cursando_id_curso,
                    curso_cur.nombre_curso AS cursando_curso,
                    d.cursando_id_division,
                    div_cur.nombre_division AS cursando_division,
                    d.id_materia,
                    COALESCE(NULLIF(d.materia, ''), mat.materia) AS materia,
                    COALESCE(NULLIF(d.docente, ''), doc.docente, '') AS docente,
                    d.materia_id_curso,
                    curso_mat.nombre_curso AS materia_curso,
                    d.materia_id_division,
                    div_mat.nombre_division AS materia_division,
                    d.id_condicion,
                    COALESCE(NULLIF(d.condicion, ''), con.condicion) AS condicion,
                    d.nota,
                    d.fecha_nota,
                    DATE_FORMAT(d.fecha_nota, '%d/%m/%Y') AS fecha_nota_texto,
                    d.inscripcion,
                    d.previa_activa,
                    d.anio,
                    d.creado_en_original
                FROM historial_mesas_detalle d
                INNER JOIN historial_mesas_armados a ON a.id_armado_historial = d.id_armado_historial
                LEFT JOIN catedras cat_detalle ON cat_detalle.id_catedra = d.id_catedra
                LEFT JOIN materias mat ON mat.id_materia = COALESCE(NULLIF(d.id_materia, 0), cat_detalle.id_materia)
                LEFT JOIN condicion con ON con.id_condicion = d.id_condicion
                LEFT JOIN docentes doc ON doc.id_docente = COALESCE(NULLIF(d.id_docente, 0), cat_detalle.id_docente)
                LEFT JOIN turnos t ON t.id_turno = d.id_turno
                LEFT JOIN curso curso_cur ON curso_cur.id_curso = d.cursando_id_curso
                LEFT JOIN division div_cur ON div_cur.id_division = d.cursando_id_division
                LEFT JOIN curso curso_mat ON curso_mat.id_curso = d.materia_id_curso
                LEFT JOIN division div_mat ON div_mat.id_division = d.materia_id_division
                WHERE d.id_armado_historial IN (" . implode(',', $placeholders) . ")
                ORDER BY a.creado_en DESC, d.id_armado_historial DESC, d.numero_grupo IS NULL ASC, d.numero_grupo ASC, d.numero_mesa ASC, d.alumno ASC, d.materia ASC, d.id_historial_detalle ASC
            ");
            $stmtDetalle->execute($paramsDetalle);
            $detalle = $stmtDetalle->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        json_response([
            'exito' => true,
            'data' => [
                'resultados' => $resultados,
                'armados' => $armados,
                'detalle' => $detalle,
                'total_resultados' => count($resultados),
                'total_armados' => count($armados),
                'total_detalle' => count($detalle),
                'busqueda' => $busqueda,
            ],
        ]);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'mesas_historial_exportar');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al preparar la exportación del historial.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_historial_eliminar_todos(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $conteos = [
            'armados' => (int)$pdo->query('SELECT COUNT(*) FROM historial_mesas_armados')->fetchColumn(),
            'detalle' => (int)$pdo->query('SELECT COUNT(*) FROM historial_mesas_detalle')->fetchColumn(),
            'resultados' => (int)$pdo->query('SELECT COUNT(*) FROM historial_previas_resultados')->fetchColumn(),
        ];

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM historial_previas_resultados');
        $pdo->exec('DELETE FROM historial_mesas_detalle');
        $pdo->exec('DELETE FROM historial_mesas_armados');
        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Historial de mesas eliminado correctamente.',
            'data' => [
                'eliminados' => $conteos,
                'resumen' => [
                    'total_resultados' => 0,
                    'total_aprobadas' => 0,
                    'total_desaprobadas' => 0,
                    'total_armados' => 0,
                ],
            ],
        ]);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        if (function_exists('log_error')) {
            log_error($e, 'mesas_historial_eliminar_todos');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al eliminar el historial de mesas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_historial_detalle_armado(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $idArmado = is_numeric($_GET['id_armado_historial'] ?? null) ? (int)$_GET['id_armado_historial'] : 0;
        if ($idArmado <= 0) {
            json_response(['exito' => false, 'mensaje' => 'El historial de armado solicitado no es válido.'], 422);
            return;
        }

        $stmtArmado = $pdo->prepare("\n            SELECT\n                id_armado_historial, codigo_armado, motivo, total_mesas, total_previas, total_grupos, total_no_agrupadas,\n                creado_en, DATE_FORMAT(creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto\n            FROM historial_mesas_armados\n            WHERE id_armado_historial = :id\n            LIMIT 1\n        ");
        $stmtArmado->execute([':id' => $idArmado]);
        $armado = $stmtArmado->fetch(PDO::FETCH_ASSOC);

        if (!$armado) {
            json_response(['exito' => false, 'mensaje' => 'No se encontró el historial de armado.'], 404);
            return;
        }

        $stmtDetalle = $pdo->prepare("\n            SELECT\n                d.id_historial_detalle,\n                d.id_armado_historial,\n                d.id_mesa_original,\n                d.numero_mesa,\n                d.numero_grupo,\n                d.prioridad,\n                d.tipo_mesa,\n                d.id_taller,\n                d.id_catedra,\n                d.id_previa_original,\n                d.id_docente,\n                d.fecha_mesa,\n                DATE_FORMAT(d.fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,\n                d.id_turno,\n                t.turno,\n                d.estado,\n                d.observacion,\n                d.dni,\n                d.alumno,\n                d.cursando_id_curso,\n                curso_cur.nombre_curso AS cursando_curso,\n                d.cursando_id_division,\n                div_cur.nombre_division AS cursando_division,\n                d.id_materia,\n                COALESCE(NULLIF(d.materia, ''), mat.materia) AS materia,\n                COALESCE(NULLIF(d.docente, ''), doc.docente, '') AS docente,\n                d.materia_id_curso,\n                curso_mat.nombre_curso AS materia_curso,\n                d.materia_id_division,\n                div_mat.nombre_division AS materia_division,\n                d.id_condicion,\n                COALESCE(NULLIF(d.condicion, ''), con.condicion) AS condicion,\n                d.nota,\n                d.fecha_nota,\n                DATE_FORMAT(d.fecha_nota, '%d/%m/%Y') AS fecha_nota_texto,\n                d.inscripcion,\n                d.previa_activa,\n                d.anio,\n                d.creado_en_original\n            FROM historial_mesas_detalle d\n            LEFT JOIN catedras cat_detalle ON cat_detalle.id_catedra = d.id_catedra\n            LEFT JOIN materias mat ON mat.id_materia = COALESCE(NULLIF(d.id_materia, 0), cat_detalle.id_materia)\n            LEFT JOIN condicion con ON con.id_condicion = d.id_condicion\n            LEFT JOIN docentes doc ON doc.id_docente = COALESCE(NULLIF(d.id_docente, 0), cat_detalle.id_docente)\n            LEFT JOIN turnos t ON t.id_turno = d.id_turno\n            LEFT JOIN curso curso_cur ON curso_cur.id_curso = d.cursando_id_curso\n            LEFT JOIN division div_cur ON div_cur.id_division = d.cursando_id_division\n            LEFT JOIN curso curso_mat ON curso_mat.id_curso = d.materia_id_curso\n            LEFT JOIN division div_mat ON div_mat.id_division = d.materia_id_division\n            WHERE d.id_armado_historial = :id\n            ORDER BY d.numero_grupo IS NULL ASC, d.numero_grupo ASC, d.numero_mesa ASC, d.alumno ASC, d.materia ASC, d.id_historial_detalle ASC\n        ");
        $stmtDetalle->execute([':id' => $idArmado]);
        $detalle = $stmtDetalle->fetchAll(PDO::FETCH_ASSOC) ?: [];
        // Desde esta versión no se guardan tablas separadas para grupos/no agrupadas.
        // Se reconstruyen desde historial_mesas_detalle para mantener la misma respuesta del frontend
        // con menos tablas históricas y menos puntos de falla.
        $stmtGrupos = $pdo->prepare("
            SELECT
                id_armado_historial,
                NULL AS id_mesa_grupo_original,
                numero_grupo,
                numero_mesa,
                MIN(fecha_mesa) AS fecha_mesa,
                MIN(id_turno) AS id_turno,
                NULL AS hora,
                NULL AS id_area,
                0 AS orden,
                MIN(tipo_mesa) AS tipo_mesa,
                MIN(prioridad) AS prioridad,
                COUNT(DISTINCT id_previa_original) AS cantidad_alumnos,
                MIN(estado) AS estado,
                MIN(observacion) AS observacion,
                MIN(creado_en_original) AS creado_en_original
            FROM historial_mesas_detalle
            WHERE id_armado_historial = :id
              AND numero_grupo IS NOT NULL
            GROUP BY id_armado_historial, numero_grupo, numero_mesa
            ORDER BY numero_grupo ASC, numero_mesa ASC
        ");
        $stmtGrupos->execute([':id' => $idArmado]);
        $gruposReconstruidos = $stmtGrupos->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $stmtNoAgrupadas = $pdo->prepare("
            SELECT
                id_armado_historial,
                NULL AS id_no_agrupada_original,
                numero_mesa,
                MIN(fecha_mesa) AS fecha_mesa,
                MIN(id_turno) AS id_turno,
                NULL AS hora,
                NULL AS id_area,
                MIN(tipo_mesa) AS tipo_mesa,
                MIN(prioridad) AS prioridad,
                COUNT(DISTINCT id_previa_original) AS cantidad_alumnos,
                MIN(observacion) AS motivo,
                MIN(estado) AS estado,
                MIN(creado_en_original) AS fecha_registro_original
            FROM historial_mesas_detalle
            WHERE id_armado_historial = :id
              AND numero_grupo IS NULL
              AND numero_mesa IS NOT NULL
            GROUP BY id_armado_historial, numero_mesa
            ORDER BY MIN(fecha_mesa) ASC, MIN(id_turno) ASC, numero_mesa ASC
        ");
        $stmtNoAgrupadas->execute([':id' => $idArmado]);
        $noAgrupadasReconstruidas = $stmtNoAgrupadas->fetchAll(PDO::FETCH_ASSOC) ?: [];

        json_response([
            'exito' => true,
            'data' => [
                'armado' => $armado,
                'detalle' => $detalle,
                'grupos' => $gruposReconstruidos,
                'no_agrupadas' => $noAgrupadasReconstruidas,
            ],
        ]);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'mesas_historial_detalle_armado');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener el detalle del historial de armado.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
