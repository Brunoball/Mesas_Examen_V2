<?php
// backend/modules/estadisticas/estadisticas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../mesas/historial_mesas/historial_mesas_helpers.php';

function estadisticas_meses_espanol(): array
{
    return [
        1 => 'ENERO',
        2 => 'FEBRERO',
        3 => 'MARZO',
        4 => 'ABRIL',
        5 => 'MAYO',
        6 => 'JUNIO',
        7 => 'JULIO',
        8 => 'AGOSTO',
        9 => 'SEPTIEMBRE',
        10 => 'OCTUBRE',
        11 => 'NOVIEMBRE',
        12 => 'DICIEMBRE',
    ];
}

function estadisticas_fecha_valida(?string $fecha): ?DateTimeImmutable
{
    $fecha = trim((string)$fecha);
    if ($fecha === '' || $fecha === '0000-00-00') {
        return null;
    }

    try {
        return new DateTimeImmutable($fecha);
    } catch (Throwable $e) {
        return null;
    }
}

function estadisticas_periodo_texto(?string $fechaInicio, ?string $fechaFin, ?string $creadoEn = null): string
{
    $meses = estadisticas_meses_espanol();
    $inicio = estadisticas_fecha_valida($fechaInicio);
    $fin = estadisticas_fecha_valida($fechaFin);
    $creado = estadisticas_fecha_valida($creadoEn);

    if (!$inicio && $creado) {
        $inicio = $creado;
        $fin = $creado;
    }

    if (!$inicio) {
        return 'MESA DE EXAMEN SIN FECHA';
    }

    $mesInicio = (int)$inicio->format('n');
    $anioInicio = $inicio->format('Y');

    if ($fin) {
        $mesFin = (int)$fin->format('n');
        $anioFin = $fin->format('Y');

        if ($mesFin !== $mesInicio || $anioFin !== $anioInicio) {
            $textoInicio = ($meses[$mesInicio] ?? $inicio->format('m')) . ' ' . $anioInicio;
            $textoFin = ($meses[$mesFin] ?? $fin->format('m')) . ' ' . $anioFin;
            return 'MESAS DE EXAMEN ' . $textoInicio . ' / ' . $textoFin;
        }
    }

    return 'MESAS DE EXAMEN ' . ($meses[$mesInicio] ?? $inicio->format('m')) . ' ' . $anioInicio;
}

function estadisticas_formatear_fecha(?string $fecha): string
{
    $dt = estadisticas_fecha_valida($fecha);
    return $dt ? $dt->format('d/m/Y') : '-';
}

function estadisticas_base_deduplicada_sql(string $whereExtra = ''): string
{
    $where = trim($whereExtra);
    if ($where !== '') {
        $where = 'WHERE ' . $where;
    }

    return "
        SELECT
            d.id_armado_historial,
            COALESCE(CAST(d.id_previa_original AS CHAR), CONCAT('DET-', d.id_historial_detalle)) AS clave_previa,
            MIN(d.fecha_mesa) AS fecha_mesa,
            MAX(d.fecha_mesa) AS fecha_mesa_fin,
            MIN(d.numero_mesa) AS numero_mesa,
            MIN(d.numero_grupo) AS numero_grupo,
            MIN(NULLIF(TRIM(COALESCE(d.tipo_mesa, '')), '')) AS tipo_mesa,
            MAX(CASE WHEN d.nota IS NOT NULL AND d.nota >= 7 THEN 1 ELSE 0 END) AS es_aprobado,
            MAX(CASE WHEN d.nota IS NOT NULL AND d.nota > 0 AND d.nota < 7 THEN 1 ELSE 0 END) AS es_desaprobado,
            MAX(CASE WHEN d.nota IS NOT NULL AND d.nota > 0 THEN 1 ELSE 0 END) AS tiene_nota
        FROM historial_mesas_detalle d
        {$where}
        GROUP BY
            d.id_armado_historial,
            COALESCE(CAST(d.id_previa_original AS CHAR), CONCAT('DET-', d.id_historial_detalle))
    ";
}

function estadisticas_mesas_opciones(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $base = estadisticas_base_deduplicada_sql();

        $sql = "
            SELECT
                a.id_armado_historial,
                a.codigo_armado,
                a.motivo,
                a.total_mesas,
                a.total_previas,
                a.total_grupos,
                a.total_no_agrupadas,
                a.creado_en,
                DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto,
                MIN(b.fecha_mesa) AS fecha_inicio,
                MAX(b.fecha_mesa_fin) AS fecha_fin,
                COUNT(b.clave_previa) AS total_inscriptos,
                COALESCE(SUM(b.es_aprobado), 0) AS total_aprobados,
                COALESCE(SUM(b.es_desaprobado), 0) AS total_desaprobados,
                COALESCE(SUM(CASE WHEN b.tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS total_ausentes
            FROM historial_mesas_armados a
            LEFT JOIN ({$base}) b ON b.id_armado_historial = a.id_armado_historial
            GROUP BY
                a.id_armado_historial,
                a.codigo_armado,
                a.motivo,
                a.total_mesas,
                a.total_previas,
                a.total_grupos,
                a.total_no_agrupadas,
                a.creado_en
            ORDER BY COALESCE(MAX(b.fecha_mesa_fin), DATE(a.creado_en)) DESC, a.creado_en DESC, a.id_armado_historial DESC
        ";

        $stmt = $pdo->query($sql);
        $opciones = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        foreach ($opciones as &$opcion) {
            $opcion['id_armado_historial'] = (int)$opcion['id_armado_historial'];
            $opcion['total_mesas'] = (int)($opcion['total_mesas'] ?? 0);
            $opcion['total_previas'] = (int)($opcion['total_previas'] ?? 0);
            $opcion['total_grupos'] = (int)($opcion['total_grupos'] ?? 0);
            $opcion['total_no_agrupadas'] = (int)($opcion['total_no_agrupadas'] ?? 0);
            $opcion['total_inscriptos'] = (int)($opcion['total_inscriptos'] ?? 0);
            $opcion['total_aprobados'] = (int)($opcion['total_aprobados'] ?? 0);
            $opcion['total_desaprobados'] = (int)($opcion['total_desaprobados'] ?? 0);
            $opcion['total_ausentes'] = (int)($opcion['total_ausentes'] ?? 0);
            $opcion['periodo'] = estadisticas_periodo_texto(
                $opcion['fecha_inicio'] ?? null,
                $opcion['fecha_fin'] ?? null,
                $opcion['creado_en'] ?? null
            );
            $opcion['label'] = $opcion['periodo'];
            $opcion['fecha_inicio_texto'] = estadisticas_formatear_fecha($opcion['fecha_inicio'] ?? null);
            $opcion['fecha_fin_texto'] = estadisticas_formatear_fecha($opcion['fecha_fin'] ?? null);
        }
        unset($opcion);

        json_response([
            'exito' => true,
            'data' => [
                'opciones' => $opciones,
                'total' => count($opciones),
            ],
        ]);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'estadisticas_mesas_opciones');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener las mesas disponibles para estadísticas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function estadisticas_mesas_resumen(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $idArmado = is_numeric($_GET['id_armado_historial'] ?? null) ? (int)$_GET['id_armado_historial'] : 0;
        if ($idArmado <= 0) {
            json_response(['exito' => false, 'mensaje' => 'Seleccioná una mesa de examen válida.'], 422);
            return;
        }

        $stmtArmado = $pdo->prepare("
            SELECT
                a.id_armado_historial,
                a.codigo_armado,
                a.motivo,
                a.total_mesas,
                a.total_previas,
                a.total_grupos,
                a.total_no_agrupadas,
                a.creado_en,
                DATE_FORMAT(a.creado_en, '%d/%m/%Y %H:%i') AS creado_en_texto,
                MIN(d.fecha_mesa) AS fecha_inicio,
                MAX(d.fecha_mesa) AS fecha_fin
            FROM historial_mesas_armados a
            LEFT JOIN historial_mesas_detalle d ON d.id_armado_historial = a.id_armado_historial
            WHERE a.id_armado_historial = :id
            GROUP BY
                a.id_armado_historial,
                a.codigo_armado,
                a.motivo,
                a.total_mesas,
                a.total_previas,
                a.total_grupos,
                a.total_no_agrupadas,
                a.creado_en
            LIMIT 1
        ");
        $stmtArmado->execute([':id' => $idArmado]);
        $armado = $stmtArmado->fetch(PDO::FETCH_ASSOC);

        if (!$armado) {
            json_response(['exito' => false, 'mensaje' => 'No se encontró el historial seleccionado.'], 404);
            return;
        }

        $base = estadisticas_base_deduplicada_sql('d.id_armado_historial = :id_armado');

        $stmtResumen = $pdo->prepare("
            SELECT
                COUNT(*) AS inscriptos,
                COALESCE(SUM(es_aprobado), 0) AS aprobados,
                COALESCE(SUM(es_desaprobado), 0) AS desaprobados,
                COALESCE(SUM(CASE WHEN tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS ausentes
            FROM ({$base}) b
        ");
        $stmtResumen->execute([':id_armado' => $idArmado]);
        $resumen = $stmtResumen->fetch(PDO::FETCH_ASSOC) ?: [];

        $totales = [
            'inscriptos' => (int)($resumen['inscriptos'] ?? 0),
            'aprobados' => (int)($resumen['aprobados'] ?? 0),
            'ausentes' => (int)($resumen['ausentes'] ?? 0),
            'desaprobados' => (int)($resumen['desaprobados'] ?? 0),
        ];

        $inscriptos = max(0, $totales['inscriptos']);
        $totales['porcentajes'] = [
            'aprobados' => $inscriptos > 0 ? round(($totales['aprobados'] * 100) / $inscriptos, 1) : 0,
            'ausentes' => $inscriptos > 0 ? round(($totales['ausentes'] * 100) / $inscriptos, 1) : 0,
            'desaprobados' => $inscriptos > 0 ? round(($totales['desaprobados'] * 100) / $inscriptos, 1) : 0,
        ];

        $stmtFechas = $pdo->prepare("
            SELECT
                b.fecha_mesa,
                DATE_FORMAT(b.fecha_mesa, '%d/%m/%Y') AS fecha_mesa_texto,
                COUNT(*) AS inscriptos,
                COALESCE(SUM(b.es_aprobado), 0) AS aprobados,
                COALESCE(SUM(b.es_desaprobado), 0) AS desaprobados,
                COALESCE(SUM(CASE WHEN b.tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS ausentes
            FROM ({$base}) b
            GROUP BY b.fecha_mesa
            ORDER BY b.fecha_mesa IS NULL ASC, b.fecha_mesa ASC
        ");
        $stmtFechas->execute([':id_armado' => $idArmado]);
        $porFechas = $stmtFechas->fetchAll(PDO::FETCH_ASSOC) ?: [];

        foreach ($porFechas as &$fecha) {
            $fecha['label'] = $fecha['fecha_mesa_texto'] ?: 'Sin fecha';
            $fecha['inscriptos'] = (int)($fecha['inscriptos'] ?? 0);
            $fecha['aprobados'] = (int)($fecha['aprobados'] ?? 0);
            $fecha['ausentes'] = (int)($fecha['ausentes'] ?? 0);
            $fecha['desaprobados'] = (int)($fecha['desaprobados'] ?? 0);
        }
        unset($fecha);

        $stmtTipos = $pdo->prepare("
            SELECT
                COALESCE(NULLIF(TRIM(b.tipo_mesa), ''), 'simple') AS tipo_mesa,
                COUNT(*) AS inscriptos,
                COALESCE(SUM(b.es_aprobado), 0) AS aprobados,
                COALESCE(SUM(b.es_desaprobado), 0) AS desaprobados,
                COALESCE(SUM(CASE WHEN b.tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS ausentes
            FROM ({$base}) b
            GROUP BY COALESCE(NULLIF(TRIM(b.tipo_mesa), ''), 'simple')
            ORDER BY inscriptos DESC, tipo_mesa ASC
        ");
        $stmtTipos->execute([':id_armado' => $idArmado]);
        $porTipo = $stmtTipos->fetchAll(PDO::FETCH_ASSOC) ?: [];

        foreach ($porTipo as &$tipo) {
            $tipoMesa = strtolower(trim((string)($tipo['tipo_mesa'] ?? 'simple')));
            $tipo['tipo_mesa'] = $tipoMesa;
            if ($tipoMesa === 'taller') {
                $tipo['label'] = 'Taller';
            } elseif ($tipoMesa === 'correlativa') {
                $tipo['label'] = 'Correlativa';
            } else {
                $tipo['label'] = 'Simple';
            }
            $tipo['inscriptos'] = (int)($tipo['inscriptos'] ?? 0);
            $tipo['aprobados'] = (int)($tipo['aprobados'] ?? 0);
            $tipo['ausentes'] = (int)($tipo['ausentes'] ?? 0);
            $tipo['desaprobados'] = (int)($tipo['desaprobados'] ?? 0);
        }
        unset($tipo);

        $armado['id_armado_historial'] = (int)$armado['id_armado_historial'];
        $armado['total_mesas'] = (int)($armado['total_mesas'] ?? 0);
        $armado['total_previas'] = (int)($armado['total_previas'] ?? 0);
        $armado['total_grupos'] = (int)($armado['total_grupos'] ?? 0);
        $armado['total_no_agrupadas'] = (int)($armado['total_no_agrupadas'] ?? 0);
        $armado['periodo'] = estadisticas_periodo_texto(
            $armado['fecha_inicio'] ?? null,
            $armado['fecha_fin'] ?? null,
            $armado['creado_en'] ?? null
        );
        $armado['fecha_inicio_texto'] = estadisticas_formatear_fecha($armado['fecha_inicio'] ?? null);
        $armado['fecha_fin_texto'] = estadisticas_formatear_fecha($armado['fecha_fin'] ?? null);

        json_response([
            'exito' => true,
            'data' => [
                'armado' => $armado,
                'totales' => $totales,
                'por_estado' => [
                    ['key' => 'aprobados', 'label' => 'Aprobados', 'valor' => $totales['aprobados'], 'porcentaje' => $totales['porcentajes']['aprobados']],
                    ['key' => 'ausentes', 'label' => 'Ausentes', 'valor' => $totales['ausentes'], 'porcentaje' => $totales['porcentajes']['ausentes']],
                    ['key' => 'desaprobados', 'label' => 'Desaprobados', 'valor' => $totales['desaprobados'], 'porcentaje' => $totales['porcentajes']['desaprobados']],
                ],
                'por_fechas' => $porFechas,
                'por_tipo' => $porTipo,
            ],
        ]);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'estadisticas_mesas_resumen');
        }

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener el resumen estadístico.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
