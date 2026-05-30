<?php
// backend/modules/dashbord/dashbord_controller.php
declare(strict_types=1);

function dashbord_tabla_existe(PDO $pdo, string $tabla): bool
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $tabla)) {
        return false;
    }

    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.TABLES\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n    ");
    $stmt->execute([$tabla]);
    return (int)$stmt->fetchColumn() > 0;
}

function dashbord_count(PDO $pdo, string $sql, array $params = []): int
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int)($stmt->fetchColumn() ?: 0);
}

function dashbord_all(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return is_array($rows) ? $rows : [];
}

function dashbord_fecha_label(?string $fecha): string
{
    if (!$fecha) {
        return '-';
    }

    try {
        $dt = new DateTimeImmutable($fecha);
        return $dt->format('d/m');
    } catch (Throwable $e) {
        return (string)$fecha;
    }
}

function dashbord_fecha_larga(?string $fecha): string
{
    if (!$fecha) {
        return '-';
    }

    $meses = [
        1 => 'enero', 2 => 'febrero', 3 => 'marzo', 4 => 'abril',
        5 => 'mayo', 6 => 'junio', 7 => 'julio', 8 => 'agosto',
        9 => 'septiembre', 10 => 'octubre', 11 => 'noviembre', 12 => 'diciembre',
    ];

    try {
        $dt = new DateTimeImmutable($fecha);
        $mes = $meses[(int)$dt->format('n')] ?? $dt->format('m');
        return $dt->format('d') . ' de ' . $mes . ' de ' . $dt->format('Y');
    } catch (Throwable $e) {
        return (string)$fecha;
    }
}

function dashbord_estado_armado(int $mesasRegistros, int $numerosMesa, int $gruposFinales, int $noAgrupadas): array
{
    if ($mesasRegistros <= 0) {
        return [
            'codigo' => 'sin_armado',
            'titulo' => 'Sin armado generado',
            'detalle' => 'Todavía no se generó el borrador de mesas.',
        ];
    }

    if ($numerosMesa <= 0) {
        return [
            'codigo' => 'borrador',
            'titulo' => 'Borrador creado',
            'detalle' => 'Hay registros de mesas, pero todavía falta numerarlas.',
        ];
    }

    if ($gruposFinales <= 0) {
        return [
            'codigo' => 'numerado',
            'titulo' => 'Mesas numeradas',
            'detalle' => 'Ya hay números de mesa. Falta generar los grupos finales.',
        ];
    }

    if ($noAgrupadas > 0) {
        return [
            'codigo' => 'con_observaciones',
            'titulo' => 'Armado con pendientes',
            'detalle' => 'Hay mesas agrupadas, pero todavía quedan números sin agrupar.',
        ];
    }

    return [
        'codigo' => 'completo',
        'titulo' => 'Armado completo',
        'detalle' => 'Las mesas tienen grupos finales generados sin pendientes visibles.',
    ];
}

function dashbord_resumen(): void
{
    try {
        $pdo = db();

        $tieneMesas = dashbord_tabla_existe($pdo, 'mesas');
        $tieneGrupos = dashbord_tabla_existe($pdo, 'mesas_grupos');
        $tieneNoAgrupadas = dashbord_tabla_existe($pdo, 'mesas_no_agrupadas');
        $tieneDisponibilidad = dashbord_tabla_existe($pdo, 'docentes_disponibilidad');
        $tieneCatedrasDocentes = dashbord_tabla_existe($pdo, 'catedras_docentes');

        $previasActivas = dashbord_count($pdo, "SELECT COUNT(*) FROM previas WHERE activo = 1");
        $previasInscriptas = dashbord_count($pdo, "SELECT COUNT(*) FROM previas WHERE activo = 1 AND inscripcion = 1");
        $alumnosInscriptos = dashbord_count($pdo, "SELECT COUNT(DISTINCT dni) FROM previas WHERE activo = 1 AND inscripcion = 1");

        // Docentes ya se manejan como persona única. El DISTINCT por nombre evita inflar el panel si
        // quedó algún registro histórico duplicado mientras terminamos de migrar todos los módulos.
        $docentesActivos = dashbord_count($pdo, "
            SELECT COUNT(*)
            FROM (
                SELECT UPPER(TRIM(docente)) AS docente_clave
                FROM docentes
                WHERE activo = 1
                GROUP BY UPPER(TRIM(docente))
            ) x
        " );

        $materiasActivas = dashbord_count($pdo, "SELECT COUNT(*) FROM materias WHERE activo = 1");
        $catedrasActivas = dashbord_count($pdo, "SELECT COUNT(*) FROM catedras WHERE activo = 1");

        // La asignación real del cargo/docente ahora está en catedras_docentes.
        // catedras.id_docente queda solo como compatibilidad para módulos pendientes de migración.
        $catedrasSinDocente = $tieneCatedrasDocentes
            ? dashbord_count($pdo, "
                SELECT COUNT(*)
                FROM catedras cat
                WHERE cat.activo = 1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM catedras_docentes cd
                    INNER JOIN docentes d
                        ON d.id_docente = cd.id_docente
                       AND d.activo = 1
                    WHERE cd.id_catedra = cat.id_catedra
                      AND cd.activo = 1
                    LIMIT 1
                  )
            " )
            : dashbord_count($pdo, "SELECT COUNT(*) FROM catedras WHERE activo = 1 AND (id_docente IS NULL OR id_docente = 0)");

        $areasActivas = dashbord_count($pdo, "SELECT COUNT(*) FROM areas WHERE activo = 1");
        $turnosActivos = dashbord_count($pdo, "SELECT COUNT(*) FROM turnos WHERE activo = 1");
        $docentesConDisponibilidad = $tieneDisponibilidad
            ? dashbord_count($pdo, "
                SELECT COUNT(*)
                FROM (
                    SELECT UPPER(TRIM(d.docente)) AS docente_clave
                    FROM docentes_disponibilidad dd
                    INNER JOIN docentes d
                        ON d.id_docente = dd.id_docente
                       AND d.activo = 1
                    GROUP BY UPPER(TRIM(d.docente))
                ) x
            " )
            : 0;

        $mesasRegistros = $tieneMesas ? dashbord_count($pdo, "SELECT COUNT(*) FROM mesas") : 0;
        $numerosMesa = $tieneMesas ? dashbord_count($pdo, "SELECT COUNT(DISTINCT numero_mesa) FROM mesas WHERE numero_mesa IS NOT NULL") : 0;
        $mesasSinNumero = $tieneMesas ? dashbord_count($pdo, "SELECT COUNT(*) FROM mesas WHERE numero_mesa IS NULL") : 0;
        $previasEnMesas = $tieneMesas ? dashbord_count($pdo, "SELECT COUNT(DISTINCT id_previa) FROM mesas WHERE id_previa IS NOT NULL") : 0;
        $previasSinMesa = $tieneMesas
            ? dashbord_count($pdo, "\n                SELECT COUNT(*)\n                FROM previas p\n                WHERE p.activo = 1\n                  AND p.inscripcion = 1\n                  AND NOT EXISTS (\n                    SELECT 1\n                    FROM mesas m\n                    WHERE m.id_previa = p.id_previa\n                    LIMIT 1\n                  )\n            ")
            : $previasInscriptas;

        $gruposFinales = $tieneGrupos ? dashbord_count($pdo, "SELECT COUNT(DISTINCT numero_grupo) FROM mesas_grupos") : 0;
        $numerosAgrupados = $tieneGrupos ? dashbord_count($pdo, "SELECT COUNT(DISTINCT numero_mesa) FROM mesas_grupos") : 0;
        $alumnosEnGrupos = $tieneGrupos ? dashbord_count($pdo, "SELECT COALESCE(SUM(cantidad_alumnos), 0) FROM mesas_grupos") : 0;
        $noAgrupadas = $tieneNoAgrupadas ? dashbord_count($pdo, "SELECT COUNT(*) FROM mesas_no_agrupadas WHERE estado = 'pendiente'") : 0;
        $noAgrupadasTotal = $tieneNoAgrupadas ? dashbord_count($pdo, "SELECT COUNT(*) FROM mesas_no_agrupadas") : 0;

        $rango = $tieneMesas ? (dashbord_all($pdo, "\n            SELECT MIN(fecha_mesa) AS fecha_inicio, MAX(fecha_mesa) AS fecha_fin\n            FROM mesas\n            WHERE fecha_mesa IS NOT NULL\n        ")[0] ?? []) : [];

        $porcentajeAgrupado = $numerosMesa > 0 ? min(100, (int)round(($numerosAgrupados / max(1, $numerosMesa)) * 100)) : 0;
        $porcentajeNumerado = $mesasRegistros > 0 ? min(100, (int)round((($mesasRegistros - $mesasSinNumero) / max(1, $mesasRegistros)) * 100)) : 0;
        $porcentajeCatedrasConDocente = $catedrasActivas > 0 ? min(100, (int)round((($catedrasActivas - $catedrasSinDocente) / max(1, $catedrasActivas)) * 100)) : 0;
        $porcentajeDocentesConDisponibilidad = $docentesActivos > 0 ? min(100, (int)round(($docentesConDisponibilidad / max(1, $docentesActivos)) * 100)) : 0;

        $graficoDias = [];
        if ($tieneGrupos && $gruposFinales > 0) {
            $graficoDias = dashbord_all($pdo, "\n                SELECT\n                    g.fecha_mesa,\n                    COUNT(DISTINCT g.numero_grupo) AS grupos,\n                    COUNT(DISTINCT g.numero_mesa) AS numeros,\n                    COALESCE(SUM(g.cantidad_alumnos), 0) AS alumnos\n                FROM mesas_grupos g\n                WHERE g.fecha_mesa IS NOT NULL\n                GROUP BY g.fecha_mesa\n                ORDER BY g.fecha_mesa ASC\n                LIMIT 12\n            ");
        } elseif ($tieneMesas && $numerosMesa > 0) {
            $graficoDias = dashbord_all($pdo, "\n                SELECT\n                    m.fecha_mesa,\n                    0 AS grupos,\n                    COUNT(DISTINCT m.numero_mesa) AS numeros,\n                    COUNT(DISTINCT m.id_previa) AS alumnos\n                FROM mesas m\n                WHERE m.fecha_mesa IS NOT NULL\n                GROUP BY m.fecha_mesa\n                ORDER BY m.fecha_mesa ASC\n                LIMIT 12\n            ");
        }

        $noAgrupadasPorDia = [];
        if ($tieneNoAgrupadas) {
            foreach (dashbord_all($pdo, "\n                SELECT fecha_mesa, COUNT(*) AS no_agrupadas, COALESCE(SUM(cantidad_alumnos), 0) AS alumnos_no_agrupadas\n                FROM mesas_no_agrupadas\n                WHERE fecha_mesa IS NOT NULL\n                GROUP BY fecha_mesa\n            ") as $row) {
                $noAgrupadasPorDia[(string)$row['fecha_mesa']] = [
                    'no_agrupadas' => (int)($row['no_agrupadas'] ?? 0),
                    'alumnos_no_agrupadas' => (int)($row['alumnos_no_agrupadas'] ?? 0),
                ];
            }
        }

        $graficoDias = array_map(static function (array $row) use ($noAgrupadasPorDia): array {
            $fecha = (string)($row['fecha_mesa'] ?? '');
            $extra = $noAgrupadasPorDia[$fecha] ?? ['no_agrupadas' => 0, 'alumnos_no_agrupadas' => 0];
            return [
                'fecha_mesa' => $fecha,
                'label' => dashbord_fecha_label($fecha),
                'grupos' => (int)($row['grupos'] ?? 0),
                'numeros' => (int)($row['numeros'] ?? 0),
                'alumnos' => (int)($row['alumnos'] ?? 0),
                'no_agrupadas' => (int)$extra['no_agrupadas'],
                'alumnos_no_agrupadas' => (int)$extra['alumnos_no_agrupadas'],
            ];
        }, $graficoDias);

        $distribucionTipos = $tieneMesas ? dashbord_all($pdo, "\n            SELECT\n                tipo_mesa AS tipo,\n                COUNT(*) AS registros,\n                COUNT(DISTINCT CASE WHEN numero_mesa IS NOT NULL THEN numero_mesa END) AS numeros\n            FROM mesas\n            GROUP BY tipo_mesa\n            ORDER BY FIELD(tipo_mesa, 'simple', 'correlativa', 'taller'), tipo_mesa\n        ") : [];

        $distribucionTipos = array_map(static function (array $row): array {
            $tipo = (string)($row['tipo'] ?? 'simple');
            $labels = [
                'taller' => 'Talleres',
                'correlativa' => 'Correlativas',
                'simple' => 'Simples',
            ];

            return [
                'tipo' => $tipo,
                'label' => $labels[$tipo] ?? 'Simples',
                'registros' => (int)($row['registros'] ?? 0),
                'numeros' => (int)($row['numeros'] ?? 0),
            ];
        }, $distribucionTipos);

        $rankingCursos = dashbord_all($pdo, "\n            SELECT\n                COALESCE(c.nombre_curso, '-') AS curso,\n                COALESCE(d.nombre_division, '') AS division,\n                COUNT(*) AS total_previas,\n                COUNT(DISTINCT p.dni) AS alumnos\n            FROM previas p\n            LEFT JOIN curso c ON c.id_curso = p.cursando_id_curso\n            LEFT JOIN division d ON d.id_division = p.cursando_id_division\n            WHERE p.activo = 1\n              AND p.inscripcion = 1\n            GROUP BY p.cursando_id_curso, p.cursando_id_division, c.nombre_curso, d.nombre_division\n            ORDER BY total_previas DESC, alumnos DESC\n            LIMIT 6\n        ");

        $rankingCursos = array_map(static fn(array $row): array => [
            'curso' => trim((string)($row['curso'] ?? '-') . ' ' . (string)($row['division'] ?? '')),
            'total_previas' => (int)($row['total_previas'] ?? 0),
            'alumnos' => (int)($row['alumnos'] ?? 0),
        ], $rankingCursos);

        $rankingAreas = [];
        if ($tieneGrupos && $gruposFinales > 0) {
            $rankingAreas = dashbord_all($pdo, "\n                SELECT\n                    COALESCE(a.area, 'Sin área') AS area,\n                    COUNT(DISTINCT g.numero_mesa) AS numeros,\n                    COALESCE(SUM(g.cantidad_alumnos), 0) AS alumnos\n                FROM mesas_grupos g\n                LEFT JOIN areas a ON a.id_area = g.id_area\n                GROUP BY g.id_area, a.area\n                ORDER BY numeros DESC, alumnos DESC\n                LIMIT 6\n            ");
        } elseif ($tieneMesas) {
            $rankingAreas = dashbord_all($pdo, "\n                SELECT\n                    COALESCE(a.area, 'Sin área') AS area,\n                    COUNT(DISTINCT m.numero_mesa) AS numeros,\n                    COUNT(DISTINCT m.id_previa) AS alumnos\n                FROM mesas m\n                LEFT JOIN catedras c ON c.id_catedra = m.id_catedra\n                LEFT JOIN areas_materias am ON am.id_materia = COALESCE(c.id_materia, (SELECT p.id_materia FROM previas p WHERE p.id_previa = m.id_previa LIMIT 1)) AND am.activo = 1\n                LEFT JOIN areas a ON a.id_area = am.id_area\n                GROUP BY a.id_area, a.area\n                ORDER BY numeros DESC, alumnos DESC\n                LIMIT 6\n            ");
        }

        $rankingAreas = array_map(static fn(array $row): array => [
            'area' => (string)($row['area'] ?? 'Sin área'),
            'numeros' => (int)($row['numeros'] ?? 0),
            'alumnos' => (int)($row['alumnos'] ?? 0),
        ], $rankingAreas);

        $agenda = [];
        if ($tieneGrupos && $gruposFinales > 0) {
            $agenda = dashbord_all($pdo, "\n                SELECT\n                    g.fecha_mesa,\n                    g.id_turno,\n                    COALESCE(t.turno, '-') AS turno,\n                    COUNT(DISTINCT g.numero_grupo) AS grupos,\n                    COUNT(DISTINCT g.numero_mesa) AS numeros,\n                    COALESCE(SUM(g.cantidad_alumnos), 0) AS alumnos,\n                    GROUP_CONCAT(DISTINCT COALESCE(a.area, 'Sin área') ORDER BY a.area SEPARATOR ' / ') AS areas\n                FROM mesas_grupos g\n                LEFT JOIN turnos t ON t.id_turno = g.id_turno\n                LEFT JOIN areas a ON a.id_area = g.id_area\n                WHERE g.fecha_mesa IS NOT NULL\n                GROUP BY g.fecha_mesa, g.id_turno, t.turno\n                ORDER BY g.fecha_mesa ASC, g.id_turno ASC\n                LIMIT 8\n            ");
        } elseif ($tieneMesas && $numerosMesa > 0) {
            $agenda = dashbord_all($pdo, "\n                SELECT\n                    m.fecha_mesa,\n                    m.id_turno,\n                    COALESCE(t.turno, '-') AS turno,\n                    0 AS grupos,\n                    COUNT(DISTINCT m.numero_mesa) AS numeros,\n                    COUNT(DISTINCT m.id_previa) AS alumnos,\n                    '-' AS areas\n                FROM mesas m\n                LEFT JOIN turnos t ON t.id_turno = m.id_turno\n                WHERE m.fecha_mesa IS NOT NULL\n                GROUP BY m.fecha_mesa, m.id_turno, t.turno\n                ORDER BY m.fecha_mesa ASC, m.id_turno ASC\n                LIMIT 8\n            ");
        }

        $agenda = array_map(static fn(array $row): array => [
            'fecha_mesa' => (string)($row['fecha_mesa'] ?? ''),
            'fecha_label' => dashbord_fecha_larga((string)($row['fecha_mesa'] ?? '')),
            'id_turno' => isset($row['id_turno']) ? (int)$row['id_turno'] : null,
            'turno' => (string)($row['turno'] ?? '-'),
            'grupos' => (int)($row['grupos'] ?? 0),
            'numeros' => (int)($row['numeros'] ?? 0),
            'alumnos' => (int)($row['alumnos'] ?? 0),
            'areas' => (string)($row['areas'] ?? '-'),
        ], $agenda);

        $alertas = [];
        if ($previasSinMesa > 0) {
            $alertas[] = [
                'tipo' => 'danger',
                'titulo' => 'Previas sin mesa',
                'detalle' => $previasSinMesa . ' previa/s inscripta/s todavía no tienen mesa generada.',
            ];
        }
        if ($mesasSinNumero > 0) {
            $alertas[] = [
                'tipo' => 'warning',
                'titulo' => 'Registros sin número',
                'detalle' => $mesasSinNumero . ' registro/s de mesa quedaron sin número asignado.',
            ];
        }
        if ($noAgrupadas > 0) {
            $alertas[] = [
                'tipo' => 'warning',
                'titulo' => 'Mesas no agrupadas',
                'detalle' => $noAgrupadas . ' número/s de mesa siguen pendientes de reoptimización.',
            ];
        }
        if ($gruposFinales === 0 && $numerosMesa > 0) {
            $alertas[] = [
                'tipo' => 'info',
                'titulo' => 'Faltan grupos finales',
                'detalle' => 'Ya hay mesas numeradas, pero todavía no se generaron los grupos finales.',
            ];
        }
        if ($catedrasSinDocente > 0) {
            $alertas[] = [
                'tipo' => 'info',
                'titulo' => 'Cátedras sin docente',
                'detalle' => $catedrasSinDocente . ' cátedra/s activas no tienen docente asignado.',
            ];
        }
        if (!$alertas) {
            $alertas[] = [
                'tipo' => 'success',
                'titulo' => 'Sin alertas críticas',
                'detalle' => 'No se detectan pendientes principales en el panel general.',
            ];
        }

        $estadoArmado = dashbord_estado_armado($mesasRegistros, $numerosMesa, $gruposFinales, $noAgrupadas);

        $meses = [
            1 => 'Enero', 2 => 'Febrero', 3 => 'Marzo', 4 => 'Abril',
            5 => 'Mayo', 6 => 'Junio', 7 => 'Julio', 8 => 'Agosto',
            9 => 'Septiembre', 10 => 'Octubre', 11 => 'Noviembre', 12 => 'Diciembre',
        ];
        $ahora = new DateTimeImmutable('now');

        json_response([
            'exito' => true,
            'data' => [
                'periodo' => [
                    'anio_actual' => (int)$ahora->format('Y'),
                    'mes_actual' => $meses[(int)$ahora->format('n')] ?? $ahora->format('m'),
                    'fecha_actual' => $ahora->format('Y-m-d'),
                    'rango_armado' => [
                        'fecha_inicio' => $rango['fecha_inicio'] ?? null,
                        'fecha_fin' => $rango['fecha_fin'] ?? null,
                        'label' => !empty($rango['fecha_inicio'])
                            ? dashbord_fecha_label((string)$rango['fecha_inicio']) . ' al ' . dashbord_fecha_label((string)($rango['fecha_fin'] ?? $rango['fecha_inicio']))
                            : 'Sin fechas asignadas',
                    ],
                ],
                'tarjetas' => [
                    'previas_inscriptas' => $previasInscriptas,
                    'alumnos_inscriptos' => $alumnosInscriptos,
                    'numeros_mesa' => $numerosMesa,
                    'grupos_finales' => $gruposFinales,
                    'no_agrupadas' => $noAgrupadas,
                    'docentes_activos' => $docentesActivos,
                ],
                'indicadores' => [
                    'previas_activas' => $previasActivas,
                    'previas_en_mesas' => $previasEnMesas,
                    'previas_sin_mesa' => $previasSinMesa,
                    'mesas_registros' => $mesasRegistros,
                    'mesas_sin_numero' => $mesasSinNumero,
                    'numeros_agrupados' => $numerosAgrupados,
                    'alumnos_en_grupos' => $alumnosEnGrupos,
                    'no_agrupadas_total' => $noAgrupadasTotal,
                    'materias_activas' => $materiasActivas,
                    'catedras_activas' => $catedrasActivas,
                    'catedras_sin_docente' => $catedrasSinDocente,
                    'areas_activas' => $areasActivas,
                    'turnos_activos' => $turnosActivos,
                    'docentes_con_disponibilidad' => $docentesConDisponibilidad,
                    'porcentaje_agrupado' => $porcentajeAgrupado,
                    'porcentaje_numerado' => $porcentajeNumerado,
                    'porcentaje_catedras_con_docente' => $porcentajeCatedrasConDocente,
                    'porcentaje_docentes_con_disponibilidad' => $porcentajeDocentesConDisponibilidad,
                ],
                'estado_armado' => $estadoArmado,
                'grafico_dias' => $graficoDias,
                'distribucion_tipos' => $distribucionTipos,
                'ranking_cursos' => $rankingCursos,
                'ranking_areas' => $rankingAreas,
                'agenda' => $agenda,
                'alertas' => $alertas,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'dashbord_resumen');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener el dashboard.',
        ], 500);
    }
}
