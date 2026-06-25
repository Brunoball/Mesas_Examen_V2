<?php
// backend/modules/estadisticas/estadisticas_detalle_controller.php
declare(strict_types=1);

function estadisticas_normalizar_tipo_detalle(?string $tipo): string
{
    $tipo = strtolower(trim((string)$tipo));
    if ($tipo === 'taller' || $tipo === 'correlativa') {
        return $tipo;
    }
    return 'simple';
}

function estadisticas_label_tipo_detalle(string $tipo): string
{
    $tipo = estadisticas_normalizar_tipo_detalle($tipo);
    if ($tipo === 'taller') {
        return 'Taller';
    }
    if ($tipo === 'correlativa') {
        return 'Correlativa';
    }
    return 'Simple';
}

function estadisticas_normalizar_estado_detalle(?string $estado): string
{
    $estado = strtolower(trim((string)$estado));
    if (in_array($estado, ['aprobados', 'ausentes', 'desaprobados'], true)) {
        return $estado;
    }
    return 'inscriptos';
}

function estadisticas_label_estado_detalle(string $estado): string
{
    $estado = estadisticas_normalizar_estado_detalle($estado);
    if ($estado === 'aprobados') {
        return 'Aprobadas';
    }
    if ($estado === 'ausentes') {
        return 'Ausentes';
    }
    if ($estado === 'desaprobados') {
        return 'Desaprobadas';
    }
    return 'Inscriptas';
}

function estadisticas_detalle_actual_sql(): string
{
    return "
        SELECT
            CAST(p.id_previa AS CHAR) AS clave_previa,
            p.id_previa,
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            p.cursando_id_division,
            COALESCE(ccur.nombre_curso, CAST(p.cursando_id_curso AS CHAR), '') AS cursando_curso,
            COALESCE(dcur.nombre_division, CAST(p.cursando_id_division AS CHAR), '') AS cursando_division,
            p.id_materia,
            COALESCE(mat.materia, '') AS materia,
            p.materia_id_curso,
            p.materia_id_division,
            COALESCE(cmat.nombre_curso, CAST(p.materia_id_curso AS CHAR), '') AS materia_curso,
            COALESCE(dmat.nombre_division, CAST(p.materia_id_division AS CHAR), '') AS materia_division,
            p.id_condicion,
            COALESCE(cond.condicion, '') AS condicion,
            MAX(p.nota) AS nota,
            DATE_FORMAT(MAX(p.fecha_nota), '%d/%m/%Y') AS fecha_nota_texto,
            p.anio,
            LOWER(COALESCE(NULLIF(MIN(CAST(m.tipo_mesa AS CHAR)), ''), 'simple')) AS tipo_mesa,
            MIN(m.fecha_mesa) AS fecha_mesa,
            DATE_FORMAT(MIN(m.fecha_mesa), '%d/%m/%Y') AS fecha_mesa_texto,
            MIN(m.id_turno) AS id_turno,
            GROUP_CONCAT(DISTINCT t.turno ORDER BY t.turno SEPARATOR ' · ') AS turno,
            MIN(m.numero_mesa) AS numero_mesa,
            NULLIF(MIN(COALESCE(g.numero_grupo, 0)), 0) AS numero_grupo,
            GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ' · ') AS docentes,
            COALESCE(
                NULLIF(GROUP_CONCAT(DISTINCT mat_cat.materia ORDER BY mat_cat.materia SEPARATOR ' · '), ''),
                COALESCE(mat.materia, '')
            ) AS materias_taller,
            CASE
                WHEN MAX(CASE WHEN p.nota IS NOT NULL AND p.nota >= 7 THEN 1 ELSE 0 END) = 1 THEN 'aprobados'
                WHEN MAX(CASE WHEN p.nota IS NOT NULL AND p.nota > 0 AND p.nota < 7 THEN 1 ELSE 0 END) = 1 THEN 'desaprobados'
                ELSE 'ausentes'
            END AS estado_resultado
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        LEFT JOIN materias mat ON mat.id_materia = p.id_materia
        LEFT JOIN curso ccur ON ccur.id_curso = p.cursando_id_curso
        LEFT JOIN division dcur ON dcur.id_division = p.cursando_id_division
        LEFT JOIN curso cmat ON cmat.id_curso = p.materia_id_curso
        LEFT JOIN division dmat ON dmat.id_division = p.materia_id_division
        LEFT JOIN condicion cond ON cond.id_condicion = p.id_condicion
        LEFT JOIN docentes doc ON doc.id_docente = m.id_docente
        LEFT JOIN turnos t ON t.id_turno = m.id_turno
        LEFT JOIN mesas_grupos g ON g.numero_mesa = m.numero_mesa
            AND g.fecha_mesa = m.fecha_mesa
            AND g.id_turno = m.id_turno
        LEFT JOIN catedras cat ON cat.id_catedra = m.id_catedra
        LEFT JOIN materias mat_cat ON mat_cat.id_materia = cat.id_materia
        WHERE m.id_previa IS NOT NULL
        GROUP BY
            p.id_previa,
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            p.cursando_id_division,
            ccur.nombre_curso,
            dcur.nombre_division,
            p.id_materia,
            mat.materia,
            p.materia_id_curso,
            p.materia_id_division,
            cmat.nombre_curso,
            dmat.nombre_division,
            p.id_condicion,
            cond.condicion,
            p.anio
    ";
}

function estadisticas_detalle_historial_sql(): string
{
    return "
        SELECT
            COALESCE(CAST(d.id_previa_original AS CHAR), CONCAT('DET-', MIN(d.id_historial_detalle))) AS clave_previa,
            MIN(d.id_previa_original) AS id_previa,
            MIN(d.dni) AS dni,
            MIN(d.alumno) AS alumno,
            MIN(d.cursando_id_curso) AS cursando_id_curso,
            MIN(d.cursando_id_division) AS cursando_id_division,
            COALESCE(MIN(ccur.nombre_curso), CAST(MIN(d.cursando_id_curso) AS CHAR), '') AS cursando_curso,
            COALESCE(MIN(dcur.nombre_division), CAST(MIN(d.cursando_id_division) AS CHAR), '') AS cursando_division,
            MIN(d.id_materia) AS id_materia,
            COALESCE(MIN(NULLIF(TRIM(d.materia), '')), '') AS materia,
            MIN(d.materia_id_curso) AS materia_id_curso,
            MIN(d.materia_id_division) AS materia_id_division,
            COALESCE(MIN(cmat.nombre_curso), CAST(MIN(d.materia_id_curso) AS CHAR), '') AS materia_curso,
            COALESCE(MIN(dmat.nombre_division), CAST(MIN(d.materia_id_division) AS CHAR), '') AS materia_division,
            MIN(d.id_condicion) AS id_condicion,
            COALESCE(MIN(NULLIF(TRIM(d.condicion), '')), '') AS condicion,
            MAX(d.nota) AS nota,
            DATE_FORMAT(MAX(d.fecha_nota), '%d/%m/%Y') AS fecha_nota_texto,
            MIN(d.anio) AS anio,
            LOWER(COALESCE(NULLIF(MIN(TRIM(d.tipo_mesa)), ''), 'simple')) AS tipo_mesa,
            MIN(d.fecha_mesa) AS fecha_mesa,
            DATE_FORMAT(MIN(d.fecha_mesa), '%d/%m/%Y') AS fecha_mesa_texto,
            MIN(d.id_turno) AS id_turno,
            GROUP_CONCAT(DISTINCT t.turno ORDER BY t.turno SEPARATOR ' · ') AS turno,
            MIN(d.numero_mesa) AS numero_mesa,
            NULLIF(MIN(COALESCE(d.numero_grupo, 0)), 0) AS numero_grupo,
            GROUP_CONCAT(DISTINCT NULLIF(TRIM(d.docente), '') ORDER BY NULLIF(TRIM(d.docente), '') SEPARATOR ' · ') AS docentes,
            COALESCE(
                NULLIF(GROUP_CONCAT(DISTINCT NULLIF(TRIM(d.materia), '') ORDER BY NULLIF(TRIM(d.materia), '') SEPARATOR ' · '), ''),
                COALESCE(MIN(NULLIF(TRIM(d.materia), '')), '')
            ) AS materias_taller,
            CASE
                WHEN MAX(CASE WHEN d.nota IS NOT NULL AND d.nota >= 7 THEN 1 ELSE 0 END) = 1 THEN 'aprobados'
                WHEN MAX(CASE WHEN d.nota IS NOT NULL AND d.nota > 0 AND d.nota < 7 THEN 1 ELSE 0 END) = 1 THEN 'desaprobados'
                ELSE 'ausentes'
            END AS estado_resultado
        FROM historial_mesas_detalle d
        LEFT JOIN curso ccur ON ccur.id_curso = d.cursando_id_curso
        LEFT JOIN division dcur ON dcur.id_division = d.cursando_id_division
        LEFT JOIN curso cmat ON cmat.id_curso = d.materia_id_curso
        LEFT JOIN division dmat ON dmat.id_division = d.materia_id_division
        LEFT JOIN turnos t ON t.id_turno = d.id_turno
        WHERE d.id_armado_historial = :id_armado
        GROUP BY
            d.id_armado_historial,
            COALESCE(CAST(d.id_previa_original AS CHAR), CONCAT('DET-', d.id_historial_detalle))
    ";
}

function estadisticas_preparar_filtro_detalle(string $dimension, string $value, array &$params): array
{
    $dimension = strtolower(trim($dimension));
    $value = trim($value);
    $where = [];
    $label = 'Todas las previas inscriptas';

    if ($dimension === 'tipo') {
        $tipo = estadisticas_normalizar_tipo_detalle($value);
        $params[':filtro_tipo'] = $tipo;
        $where[] = 'x.tipo_mesa = :filtro_tipo';
        $label = 'Previas de tipo ' . estadisticas_label_tipo_detalle($tipo);
        return [$where, ['dimension' => 'tipo', 'value' => $tipo, 'label' => $label]];
    }

    if ($dimension === 'estado') {
        $estado = estadisticas_normalizar_estado_detalle($value);
        if ($estado !== 'inscriptos') {
            $params[':filtro_estado'] = $estado;
            $where[] = 'x.estado_resultado = :filtro_estado';
        }
        $label = 'Previas ' . strtolower(estadisticas_label_estado_detalle($estado));
        return [$where, ['dimension' => 'estado', 'value' => $estado, 'label' => $label]];
    }

    if ($dimension === 'fecha') {
        if ($value === '__sin_fecha__' || $value === '') {
            $where[] = 'x.fecha_mesa IS NULL';
            $label = 'Previas sin fecha asignada';
            return [$where, ['dimension' => 'fecha', 'value' => '__sin_fecha__', 'label' => $label]];
        }

        $fecha = estadisticas_fecha_valida($value);
        if (!$fecha) {
            throw new InvalidArgumentException('La fecha seleccionada no es válida.');
        }

        $fechaSql = $fecha->format('Y-m-d');
        $params[':filtro_fecha'] = $fechaSql;
        $where[] = 'x.fecha_mesa = :filtro_fecha';
        $label = 'Previas del ' . $fecha->format('d/m/Y');
        return [$where, ['dimension' => 'fecha', 'value' => $fechaSql, 'label' => $label]];
    }

    return [$where, ['dimension' => 'todos', 'value' => '', 'label' => $label]];
}

function estadisticas_normalizar_detalle_previa(array $previa): array
{
    $previa['id_previa'] = isset($previa['id_previa']) ? (int)$previa['id_previa'] : null;
    $previa['id_materia'] = isset($previa['id_materia']) ? (int)$previa['id_materia'] : null;
    $previa['id_condicion'] = isset($previa['id_condicion']) ? (int)$previa['id_condicion'] : null;
    $previa['cursando_id_curso'] = isset($previa['cursando_id_curso']) ? (int)$previa['cursando_id_curso'] : null;
    $previa['cursando_id_division'] = isset($previa['cursando_id_division']) ? (int)$previa['cursando_id_division'] : null;
    $previa['materia_id_curso'] = isset($previa['materia_id_curso']) ? (int)$previa['materia_id_curso'] : null;
    $previa['materia_id_division'] = isset($previa['materia_id_division']) ? (int)$previa['materia_id_division'] : null;
    $previa['nota'] = $previa['nota'] === null || $previa['nota'] === '' ? null : (int)$previa['nota'];
    $previa['anio'] = isset($previa['anio']) ? (int)$previa['anio'] : null;
    $previa['id_turno'] = isset($previa['id_turno']) ? (int)$previa['id_turno'] : null;
    $previa['numero_mesa'] = isset($previa['numero_mesa']) ? (int)$previa['numero_mesa'] : null;
    $previa['numero_grupo'] = isset($previa['numero_grupo']) ? (int)$previa['numero_grupo'] : null;
    $previa['tipo_mesa'] = estadisticas_normalizar_tipo_detalle($previa['tipo_mesa'] ?? 'simple');
    $previa['tipo_label'] = estadisticas_label_tipo_detalle($previa['tipo_mesa']);
    $previa['estado_resultado'] = estadisticas_normalizar_estado_detalle($previa['estado_resultado'] ?? 'ausentes');
    $previa['estado_label'] = estadisticas_label_estado_detalle($previa['estado_resultado']);

    foreach (['dni', 'alumno', 'materia', 'materia_curso', 'materia_division', 'cursando_curso', 'cursando_division', 'condicion', 'fecha_nota_texto', 'fecha_mesa_texto', 'turno', 'docentes', 'materias_taller'] as $campo) {
        $previa[$campo] = trim((string)($previa[$campo] ?? ''));
    }

    return $previa;
}


function estadisticas_detalle_order_by_sql(array $filtro): string
{
    $dimension = strtolower(trim((string)($filtro['dimension'] ?? '')));
    $value = estadisticas_normalizar_tipo_detalle((string)($filtro['value'] ?? ''));

    if ($dimension === 'tipo' && $value === 'correlativa') {
        return "
            ORDER BY
                NULLIF(TRIM(x.dni), '') IS NULL ASC,
                NULLIF(TRIM(x.dni), '') ASC,
                LOWER(TRIM(COALESCE(x.alumno, ''))) ASC,
                x.materia_id_curso IS NULL ASC,
                CAST(x.materia_id_curso AS UNSIGNED) ASC,
                LOWER(TRIM(COALESCE(x.materia_division, ''))) ASC,
                x.anio IS NULL ASC,
                CAST(x.anio AS UNSIGNED) ASC,
                LOWER(TRIM(COALESCE(x.materia, ''))) ASC,
                x.fecha_mesa IS NULL ASC,
                x.fecha_mesa ASC,
                x.id_turno IS NULL ASC,
                x.id_turno ASC,
                x.numero_grupo IS NULL ASC,
                x.numero_grupo ASC,
                x.numero_mesa IS NULL ASC,
                x.numero_mesa ASC
        ";
    }

    return "
        ORDER BY
            x.fecha_mesa IS NULL ASC,
            x.fecha_mesa ASC,
            x.id_turno IS NULL ASC,
            x.id_turno ASC,
            x.numero_grupo IS NULL ASC,
            x.numero_grupo ASC,
            x.numero_mesa IS NULL ASC,
            x.numero_mesa ASC,
            x.alumno ASC,
            x.materia ASC
    ";
}

function estadisticas_mesas_detalle(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $idParam = trim((string)($_GET['id_armado_historial'] ?? ''));
        if ($idParam === '') {
            json_response(['exito' => false, 'mensaje' => 'Seleccioná una mesa de examen válida.'], 422);
            return;
        }

        $params = [];
        if (strtolower($idParam) === 'actual') {
            $armado = estadisticas_obtener_meta_armado_actual($pdo);
            if (!$armado) {
                json_response(['exito' => false, 'mensaje' => 'No hay mesas armadas actualmente para consultar.'], 404);
                return;
            }
            $base = estadisticas_detalle_actual_sql();
        } else {
            $idArmado = is_numeric($idParam) ? (int)$idParam : 0;
            if ($idArmado <= 0) {
                json_response(['exito' => false, 'mensaje' => 'Seleccioná una mesa de examen válida.'], 422);
                return;
            }

            $armado = estadisticas_obtener_armado_historial($pdo, $idArmado);
            if (!$armado) {
                json_response(['exito' => false, 'mensaje' => 'No se encontró el historial seleccionado.'], 404);
                return;
            }

            $params[':id_armado'] = $idArmado;
            $base = estadisticas_detalle_historial_sql();
        }

        $dimension = (string)($_GET['dimension'] ?? 'todos');
        $value = (string)($_GET['value'] ?? '');
        [$where, $filtro] = estadisticas_preparar_filtro_detalle($dimension, $value, $params);

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $stmt = estadisticas_ejecutar($pdo, "
            SELECT x.*
            FROM ({$base}) x
            {$whereSql}
            " . estadisticas_detalle_order_by_sql($filtro) . "
            LIMIT 2000
        ", $params);

        $previas = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $previas = array_map('estadisticas_normalizar_detalle_previa', $previas);

        $filtro['total'] = count($previas);

        json_response([
            'exito' => true,
            'data' => [
                'armado' => $armado,
                'filtro' => $filtro,
                'previas' => $previas,
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        json_response(['exito' => false, 'mensaje' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'estadisticas_mesas_detalle');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener el detalle de previas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

