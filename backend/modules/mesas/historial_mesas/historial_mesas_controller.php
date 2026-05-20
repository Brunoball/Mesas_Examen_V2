<?php
// backend/modules/mesas/historial_mesas/historial_mesas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/historial_mesas_helpers.php';

function mesas_historial_limite($valor, int $default, int $max): int
{
    $n = is_numeric($valor) ? (int)$valor : $default;
    if ($n <= 0) {
        return $default;
    }
    return min($n, $max);
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
            $whereResultados .= " AND (\n                alumno LIKE :busqueda\n                OR dni LIKE :busqueda\n                OR materia LIKE :busqueda\n                OR docente LIKE :busqueda\n                OR condicion LIKE :busqueda\n                OR tipo_mesa LIKE :busqueda\n                OR estado_resultado LIKE :busqueda\n                OR CAST(numero_mesa AS CHAR) LIKE :busqueda\n            )";
            $paramsResultados[':busqueda'] = '%' . $busqueda . '%';
        }

        $stmtResultados = $pdo->prepare("\n            SELECT\n                id_resultado,\n                id_previa_original,\n                id_mesa,\n                numero_mesa,\n                numero_grupo,\n                fecha_mesa,\n                DATE_FORMAT(fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,\n                id_turno,\n                hora,\n                dni,\n                alumno,\n                cursando_id_curso,\n                cursando_id_division,\n                id_materia,\n                materia,\n                materia_id_curso,\n                materia_id_division,\n                id_condicion,\n                condicion,\n                id_catedra,\n                id_docente,\n                docente,\n                tipo_mesa,\n                anio,\n                nota,\n                aprobado,\n                estado_resultado,\n                fecha_nota,\n                DATE_FORMAT(fecha_nota, '%d/%m/%Y') AS fecha_nota_texto,\n                motivo,\n                creado_en\n            FROM historial_previas_resultados\n            WHERE {$whereResultados}\n            ORDER BY fecha_nota DESC, creado_en DESC, id_resultado DESC\n            LIMIT {$limiteResultados}\n        ");
        $stmtResultados->execute($paramsResultados);
        $resultados = $stmtResultados->fetchAll(PDO::FETCH_ASSOC) ?: [];

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
            $whereArmados .= " AND (codigo_armado LIKE :busqueda OR motivo LIKE :busqueda)";
            $paramsArmados[':busqueda'] = '%' . $busqueda . '%';
        }

        $stmtArmados = $pdo->prepare("\n            SELECT\n                id_armado_historial,\n                codigo_armado,\n                motivo,\n                total_mesas,\n                total_previas,\n                total_grupos,\n                total_no_agrupadas,\n                creado_en,\n                DATE_FORMAT(creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto\n            FROM historial_mesas_armados\n            WHERE {$whereArmados}\n            ORDER BY creado_en DESC, id_armado_historial DESC\n            LIMIT {$limiteArmados}\n        ");
        $stmtArmados->execute($paramsArmados);
        $armados = $stmtArmados->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $resumen = [
            'total_resultados' => (int)$pdo->query('SELECT COUNT(*) FROM historial_previas_resultados')->fetchColumn(),
            'total_aprobadas' => (int)$pdo->query('SELECT COUNT(*) FROM historial_previas_resultados WHERE aprobado = 1')->fetchColumn(),
            'total_desaprobadas' => (int)$pdo->query('SELECT COUNT(*) FROM historial_previas_resultados WHERE aprobado = 0')->fetchColumn(),
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

        $stmtDetalle = $pdo->prepare("\n            SELECT\n                d.id_historial_detalle,\n                d.id_armado_historial,\n                d.id_mesa_original,\n                d.numero_mesa,\n                d.numero_grupo,\n                d.prioridad,\n                d.tipo_mesa,\n                d.id_taller,\n                d.id_catedra,\n                d.id_previa_original,\n                d.id_docente,\n                d.fecha_mesa,\n                DATE_FORMAT(d.fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,\n                d.id_turno,\n                t.turno,\n                d.estado,\n                d.observacion,\n                d.dni,\n                d.alumno,\n                d.cursando_id_curso,\n                curso_cur.nombre_curso AS cursando_curso,\n                d.cursando_id_division,\n                div_cur.nombre_division AS cursando_division,\n                d.id_materia,\n                COALESCE(d.materia, mat.materia) AS materia,\n                d.materia_id_curso,\n                curso_mat.nombre_curso AS materia_curso,\n                d.materia_id_division,\n                div_mat.nombre_division AS materia_division,\n                d.id_condicion,\n                COALESCE(d.condicion, con.condicion) AS condicion,\n                d.nota,\n                d.fecha_nota,\n                DATE_FORMAT(d.fecha_nota, '%d/%m/%Y') AS fecha_nota_texto,\n                d.inscripcion,\n                d.previa_activa,\n                d.anio,\n                d.creado_en_original\n            FROM historial_mesas_detalle d\n            LEFT JOIN materias mat ON mat.id_materia = d.id_materia\n            LEFT JOIN condicion con ON con.id_condicion = d.id_condicion\n            LEFT JOIN docentes doc ON doc.id_docente = d.id_docente\n            LEFT JOIN turnos t ON t.id_turno = d.id_turno\n            LEFT JOIN curso curso_cur ON curso_cur.id_curso = d.cursando_id_curso\n            LEFT JOIN division div_cur ON div_cur.id_division = d.cursando_id_division\n            LEFT JOIN curso curso_mat ON curso_mat.id_curso = d.materia_id_curso\n            LEFT JOIN division div_mat ON div_mat.id_division = d.materia_id_division\n            WHERE d.id_armado_historial = :id\n            ORDER BY d.numero_grupo IS NULL ASC, d.numero_grupo ASC, d.numero_mesa ASC, d.alumno ASC, d.materia ASC, d.id_historial_detalle ASC\n        ");
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
