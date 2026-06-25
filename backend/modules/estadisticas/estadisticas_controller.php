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

function estadisticas_ejecutar(PDO $pdo, string $sql, array $params = []): PDOStatement
{
    $stmt = $pdo->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('No se pudo preparar la consulta de estadísticas.');
    }

    $stmt->execute($params);
    return $stmt;
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

function estadisticas_base_actual_deduplicada_sql(string $whereExtra = ''): string
{
    $whereParts = ['m.id_previa IS NOT NULL'];
    $whereExtra = trim($whereExtra);
    if ($whereExtra !== '') {
        $whereParts[] = $whereExtra;
    }
    $where = 'WHERE ' . implode(' AND ', $whereParts);

    return "
        SELECT
            'actual' AS id_armado_historial,
            COALESCE(CAST(m.id_previa AS CHAR), CONCAT('MESA-', m.id_mesa)) AS clave_previa,
            MIN(m.fecha_mesa) AS fecha_mesa,
            MAX(m.fecha_mesa) AS fecha_mesa_fin,
            MIN(m.numero_mesa) AS numero_mesa,
            MIN(g.numero_grupo) AS numero_grupo,
            MIN(NULLIF(TRIM(COALESCE(m.tipo_mesa, '')), '')) AS tipo_mesa,
            MIN(m.creado_en) AS creado_en,
            MAX(CASE WHEN p.nota IS NOT NULL AND p.nota >= 7 THEN 1 ELSE 0 END) AS es_aprobado,
            MAX(CASE WHEN p.nota IS NOT NULL AND p.nota > 0 AND p.nota < 7 THEN 1 ELSE 0 END) AS es_desaprobado,
            MAX(CASE WHEN p.nota IS NOT NULL AND p.nota > 0 THEN 1 ELSE 0 END) AS tiene_nota
        FROM mesas m
        LEFT JOIN previas p ON p.id_previa = m.id_previa
        LEFT JOIN mesas_grupos g ON g.numero_mesa = m.numero_mesa
        {$where}
        GROUP BY
            COALESCE(CAST(m.id_previa AS CHAR), CONCAT('MESA-', m.id_mesa))
    ";
}

function estadisticas_normalizar_opcion(array $opcion, bool $esActual = false): array
{
    $opcion['origen'] = $esActual ? 'actual' : 'historial';
    $opcion['id_armado_historial'] = $esActual
        ? 'actual'
        : (int)($opcion['id_armado_historial'] ?? 0);

    $opcion['total_mesas'] = (int)($opcion['total_mesas'] ?? 0);
    $opcion['total_previas'] = (int)($opcion['total_previas'] ?? 0);
    $opcion['total_grupos'] = (int)($opcion['total_grupos'] ?? 0);
    $opcion['total_no_agrupadas'] = (int)($opcion['total_no_agrupadas'] ?? 0);
    $opcion['total_inscriptos'] = (int)($opcion['total_inscriptos'] ?? 0);
    $opcion['total_aprobados'] = (int)($opcion['total_aprobados'] ?? 0);
    $opcion['total_desaprobados'] = (int)($opcion['total_desaprobados'] ?? 0);
    $opcion['total_ausentes'] = (int)($opcion['total_ausentes'] ?? 0);

    $periodoBase = estadisticas_periodo_texto(
        $opcion['fecha_inicio'] ?? null,
        $opcion['fecha_fin'] ?? null,
        $opcion['creado_en'] ?? null
    );

    $opcion['periodo_base'] = $periodoBase;
    $opcion['periodo'] = $esActual ? ('ARMADO ACTUAL · ' . $periodoBase) : $periodoBase;
    $opcion['label'] = $opcion['periodo'];
    $opcion['fecha_inicio_texto'] = estadisticas_formatear_fecha($opcion['fecha_inicio'] ?? null);
    $opcion['fecha_fin_texto'] = estadisticas_formatear_fecha($opcion['fecha_fin'] ?? null);

    if ($esActual && empty($opcion['creado_en_texto'])) {
        $opcion['creado_en_texto'] = 'Armado actual';
    }

    return $opcion;
}

function estadisticas_obtener_opcion_armado_actual(PDO $pdo): ?array
{
    $baseActual = estadisticas_base_actual_deduplicada_sql();

    $sql = "
        SELECT
            'actual' AS id_armado_historial,
            'ARMADO-ACTUAL' AS codigo_armado,
            'armado_actual' AS motivo,
            COUNT(DISTINCT b.numero_mesa) AS total_mesas,
            COUNT(b.clave_previa) AS total_previas,
            COUNT(DISTINCT b.numero_grupo) AS total_grupos,
            (SELECT COUNT(*) FROM mesas_no_agrupadas) AS total_no_agrupadas,
            MIN(b.creado_en) AS creado_en,
            DATE_FORMAT(MIN(b.creado_en), '%d/%m/%Y %H:%i') AS creado_en_texto,
            MIN(b.fecha_mesa) AS fecha_inicio,
            MAX(b.fecha_mesa_fin) AS fecha_fin,
            COUNT(b.clave_previa) AS total_inscriptos,
            COALESCE(SUM(b.es_aprobado), 0) AS total_aprobados,
            COALESCE(SUM(b.es_desaprobado), 0) AS total_desaprobados,
            COALESCE(SUM(CASE WHEN b.tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS total_ausentes
        FROM ({$baseActual}) b
        HAVING COUNT(b.clave_previa) > 0
    ";

    $stmt = $pdo->query($sql);
    $opcion = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;

    return $opcion ? estadisticas_normalizar_opcion($opcion, true) : null;
}

function estadisticas_obtener_meta_armado_actual(PDO $pdo): ?array
{
    $baseActual = estadisticas_base_actual_deduplicada_sql();

    $sql = "
        SELECT
            'actual' AS id_armado_historial,
            'ARMADO-ACTUAL' AS codigo_armado,
            'armado_actual' AS motivo,
            COUNT(DISTINCT b.numero_mesa) AS total_mesas,
            COUNT(b.clave_previa) AS total_previas,
            COUNT(DISTINCT b.numero_grupo) AS total_grupos,
            (SELECT COUNT(*) FROM mesas_no_agrupadas) AS total_no_agrupadas,
            MIN(b.creado_en) AS creado_en,
            DATE_FORMAT(MIN(b.creado_en), '%d/%m/%Y %H:%i') AS creado_en_texto,
            MIN(b.fecha_mesa) AS fecha_inicio,
            MAX(b.fecha_mesa_fin) AS fecha_fin
        FROM ({$baseActual}) b
        HAVING COUNT(b.clave_previa) > 0
    ";

    $stmt = $pdo->query($sql);
    $armado = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;

    return $armado ? estadisticas_normalizar_opcion($armado, true) : null;
}

function estadisticas_obtener_armado_historial(PDO $pdo, int $idArmado): ?array
{
    $stmtArmado = estadisticas_ejecutar($pdo, "
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
    ", [':id' => $idArmado]);

    $armado = $stmtArmado->fetch(PDO::FETCH_ASSOC);
    return $armado ? estadisticas_normalizar_opcion($armado, false) : null;
}


function estadisticas_responder_resumen(PDO $pdo, array $armado, string $base, array $params = []): void
{
    $stmtResumen = estadisticas_ejecutar($pdo, "
        SELECT
            COUNT(*) AS inscriptos,
            COALESCE(SUM(es_aprobado), 0) AS aprobados,
            COALESCE(SUM(es_desaprobado), 0) AS desaprobados,
            COALESCE(SUM(CASE WHEN tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS ausentes
        FROM ({$base}) b
    ", $params);
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

    $stmtFechas = estadisticas_ejecutar($pdo, "
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
    ", $params);
    $porFechas = $stmtFechas->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($porFechas as &$fecha) {
        $fecha['label'] = $fecha['fecha_mesa_texto'] ?: 'Sin fecha';
        $fecha['inscriptos'] = (int)($fecha['inscriptos'] ?? 0);
        $fecha['aprobados'] = (int)($fecha['aprobados'] ?? 0);
        $fecha['ausentes'] = (int)($fecha['ausentes'] ?? 0);
        $fecha['desaprobados'] = (int)($fecha['desaprobados'] ?? 0);
    }
    unset($fecha);

    $stmtTipos = estadisticas_ejecutar($pdo, "
        SELECT
            COALESCE(NULLIF(TRIM(b.tipo_mesa), ''), 'simple') AS tipo_mesa,
            COUNT(*) AS inscriptos,
            COALESCE(SUM(b.es_aprobado), 0) AS aprobados,
            COALESCE(SUM(b.es_desaprobado), 0) AS desaprobados,
            COALESCE(SUM(CASE WHEN b.tiene_nota = 0 THEN 1 ELSE 0 END), 0) AS ausentes
        FROM ({$base}) b
        GROUP BY COALESCE(NULLIF(TRIM(b.tipo_mesa), ''), 'simple')
        ORDER BY inscriptos DESC, tipo_mesa ASC
    ", $params);
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
}


function estadisticas_mesas_opciones(): void
{
    try {
        $pdo = db();
        mesas_historial_asegurar_tablas($pdo);

        $opciones = [];
        $armadoActual = estadisticas_obtener_opcion_armado_actual($pdo);
        if ($armadoActual) {
            $opciones[] = $armadoActual;
        }

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
        $historiales = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        foreach ($historiales as $historial) {
            $opciones[] = estadisticas_normalizar_opcion($historial, false);
        }

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

        $idParam = trim((string)($_GET['id_armado_historial'] ?? ''));
        if ($idParam === '') {
            json_response(['exito' => false, 'mensaje' => 'Seleccioná una mesa de examen válida.'], 422);
            return;
        }

        if (strtolower($idParam) === 'actual') {
            $armado = estadisticas_obtener_meta_armado_actual($pdo);
            if (!$armado) {
                json_response(['exito' => false, 'mensaje' => 'No hay mesas armadas actualmente para graficar.'], 404);
                return;
            }

            $baseActual = estadisticas_base_actual_deduplicada_sql();
            estadisticas_responder_resumen($pdo, $armado, $baseActual);
            return;
        }

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
        $base = estadisticas_base_deduplicada_sql('d.id_armado_historial = :id_armado');
        estadisticas_responder_resumen($pdo, $armado, $base, [':id_armado' => $idArmado]);
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
