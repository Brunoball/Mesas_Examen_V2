<?php
// backend/modules/formulario/buscar_previas.php
declare(strict_types=1);

require_once __DIR__ . '/formulario_helpers.php';

function form_buscar_previas(): void
{
    formulario_method('POST');

    try {
        date_default_timezone_set('America/Argentina/Cordoba');
        $pdo = formulario_pdo();
        $in = formulario_body();

        $dni = formulario_normalizar_dni($in['dni'] ?? '');
        $gmail = trim((string)($in['gmail'] ?? ''));

        if (!formulario_validar_dni($dni)) {
            formulario_json(['exito' => false, 'mensaje' => 'DNI inválido.'], 200);
        }

        $sql = "
            SELECT
                p.id_previa,
                p.dni,
                p.alumno,
                p.anio,
                p.cursando_id_curso,
                p.cursando_id_division,
                p.id_materia,
                p.materia_id_curso,
                p.materia_id_division,
                p.id_condicion,
                CASE WHEN COALESCE(p.inscripcion, 0) = 1 THEN 1 ELSE 0 END AS inscripcion,
                m.materia,
                c_cur.nombre_curso AS cursando_curso_nombre,
                d_cur.nombre_division AS cursando_division_nombre,
                c_mat.nombre_curso AS materia_curso_nombre,
                d_mat.nombre_division AS materia_division_nombre,
                co.condicion AS condicion_nombre
            FROM previas p
            INNER JOIN materias m ON m.id_materia = p.id_materia
            LEFT JOIN curso c_cur ON c_cur.id_curso = p.cursando_id_curso
            LEFT JOIN division d_cur ON d_cur.id_division = p.cursando_id_division
            LEFT JOIN curso c_mat ON c_mat.id_curso = p.materia_id_curso
            LEFT JOIN division d_mat ON d_mat.id_division = p.materia_id_division
            LEFT JOIN condicion co ON co.id_condicion = p.id_condicion
            WHERE p.dni = :dni
              AND p.id_condicion IN (3, 5, 6)
              AND p.activo = 1
            ORDER BY p.materia_id_curso ASC, p.materia_id_division ASC, m.materia ASC
        ";

        $st = $pdo->prepare($sql);
        $st->execute([':dni' => $dni]);
        $rows = $st->fetchAll();

        if (!$rows) {
            formulario_json([
                'exito' => false,
                'mensaje' => 'No se encontraron materias previas activas para ese DNI.',
                'ya_inscripto' => false,
            ], 200);
        }

        $alumnoNombre = (string)($rows[0]['alumno'] ?? '');
        $anioActual = (int)date('Y');

        $cursando = [
            'curso_id' => isset($rows[0]['cursando_id_curso']) ? (int)$rows[0]['cursando_id_curso'] : null,
            'division_id' => isset($rows[0]['cursando_id_division']) ? (int)$rows[0]['cursando_id_division'] : null,
            'curso' => $rows[0]['cursando_curso_nombre'] ?? null,
            'division' => $rows[0]['cursando_division_nombre'] ?? null,
        ];

        $generarClave = static function (array $r): string {
            return ((int)$r['id_materia']) . '_' . ((int)$r['materia_id_curso']) . '_' . ((int)$r['materia_id_division']);
        };

        $mapRow = static function (array $r) use ($generarClave): array {
            return [
                'id_previa' => (int)$r['id_previa'],
                'id_materia' => (int)$r['id_materia'],
                'materia' => (string)$r['materia'],
                'curso_id' => (int)$r['materia_id_curso'],
                'division_id' => (int)$r['materia_id_division'],
                'curso' => $r['materia_curso_nombre'] ?? null,
                'division' => $r['materia_division_nombre'] ?? null,
                'id_condicion' => (int)$r['id_condicion'],
                'condicion' => $r['condicion_nombre'] ?? null,
                'anio' => (int)$r['anio'],
                'inscripcion' => (int)$r['inscripcion'],
                'clave_unica' => $generarClave($r),
                'es_correlativa' => false,
                'correlativa_orden' => null,
                'correlativa_total' => null,
                'correlativas_anteriores' => [],
                'requiere_correlativa_anterior' => false,
            ];
        };

        $materiasCond3 = [];
        $materiasCond5 = [];
        $materiasCond6 = [];

        foreach ($rows as $r) {
            $cond = (int)$r['id_condicion'];
            if ($cond === 3) {
                $materiasCond3[] = $mapRow($r);
            } elseif ($cond === 5) {
                $materiasCond5[] = $mapRow($r);
            } elseif ($cond === 6) {
                $materiasCond6[] = $mapRow($r);
            }
        }

        [$materiasCond3, $resumenCorrelativas] = formulario_aplicar_correlativas($pdo, $materiasCond3);

        $ordenar = static function (array &$lista): void {
            usort($lista, static function (array $a, array $b): int {
                $curso = ((int)$a['curso_id']) <=> ((int)$b['curso_id']);
                if ($curso !== 0) {
                    return $curso;
                }

                $division = ((int)$a['division_id']) <=> ((int)$b['division_id']);
                if ($division !== 0) {
                    return $division;
                }

                return strcasecmp((string)$a['materia'], (string)$b['materia']);
            });
        };

        $ordenar($materiasCond3);
        $ordenar($materiasCond5);
        $ordenar($materiasCond6);

        $totalCond3 = count($materiasCond3);
        $inscriptasCond3 = array_sum(array_map(static fn(array $m): int => ((int)$m['inscripcion'] === 1 ? 1 : 0), $materiasCond3));
        $yaInscriptas = ($totalCond3 > 0 && $inscriptasCond3 === $totalCond3);

        formulario_json([
            'exito' => true,
            'alumno' => [
                'dni' => $dni,
                'nombre' => $alumnoNombre,
                'anio_actual' => $anioActual,
                'cursando' => $cursando,
                'materias' => $materiasCond3,
                'materias_cond5' => $materiasCond5,
                'materias_cond6' => $materiasCond6,
                'correlativas' => $resumenCorrelativas,
            ],
            'gmail' => $gmail,
            'ya_inscripto' => $yaInscriptas,
            'anio_inscripcion' => $anioActual,
            'resumen' => [
                'total_cond3' => $totalCond3,
                'inscriptas' => $inscriptasCond3,
                'pendientes' => $totalCond3 - $inscriptasCond3,
                'total_cond5' => count($materiasCond5),
                'total_cond6' => count($materiasCond6),
                'total_correlativas' => count($resumenCorrelativas),
            ],
        ], 200);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'formulario:buscar_previas');
        }

        formulario_json([
            'exito' => false,
            'mensaje' => 'Error al consultar previas.',
            'detalle' => $e->getMessage(),
        ], 200);
    }
}

function formulario_aplicar_correlativas(PDO $pdo, array $materias): array
{
    if (count($materias) < 2) {
        return [$materias, []];
    }

    $porClave = [];
    $porMateriaCurso = [];

    foreach ($materias as $idx => $m) {
        $clave = (string)$m['clave_unica'];
        $porClave[$clave] = $idx;
        $mcKey = ((int)$m['id_materia']) . ':' . ((int)$m['curso_id']);
        $porMateriaCurso[$mcKey][] = $clave;
    }

    $relaciones = $pdo->query("
        SELECT id_materia, id_curso, id_materia_relacionada, id_curso_relacionada, tipo, orden
        FROM materias_correlativas
        WHERE activo = 1
          AND bloquea_inscripcion = 1
          AND tipo IN ('anterior', 'posterior')
        ORDER BY COALESCE(orden, 9999), id_materia_correlativa
    ")->fetchAll();

    $anterioresPorClave = [];
    $grafo = [];

    foreach ($materias as $m) {
        $clave = (string)$m['clave_unica'];
        $anterioresPorClave[$clave] = [];
        $grafo[$clave] = [];
    }

    foreach ($relaciones as $rel) {
        $tipo = (string)$rel['tipo'];

        if ($tipo === 'anterior') {
            // La materia actual depende de la materia relacionada.
            $posteriores = $porMateriaCurso[((int)$rel['id_materia']) . ':' . ((int)$rel['id_curso'])] ?? [];
            $anteriores = $porMateriaCurso[((int)$rel['id_materia_relacionada']) . ':' . ((int)$rel['id_curso_relacionada'])] ?? [];
        } else {
            // La materia relacionada es posterior a la materia actual.
            $anteriores = $porMateriaCurso[((int)$rel['id_materia']) . ':' . ((int)$rel['id_curso'])] ?? [];
            $posteriores = $porMateriaCurso[((int)$rel['id_materia_relacionada']) . ':' . ((int)$rel['id_curso_relacionada'])] ?? [];
        }

        foreach ($posteriores as $posteriorClave) {
            foreach ($anteriores as $anteriorClave) {
                if ($posteriorClave === $anteriorClave) {
                    continue;
                }

                $anterioresPorClave[$posteriorClave][$anteriorClave] = true;
                $grafo[$anteriorClave][$posteriorClave] = true;
                $grafo[$posteriorClave][$anteriorClave] = true;
            }
        }
    }

    // Componentes conectados para mostrar resumen visual de grupos correlativos.
    $visitados = [];
    $componentes = [];

    foreach (array_keys($grafo) as $claveInicio) {
        if (isset($visitados[$claveInicio])) {
            continue;
        }

        $stack = [$claveInicio];
        $visitados[$claveInicio] = true;
        $comp = [];

        while ($stack) {
            $clave = array_pop($stack);
            $comp[] = $clave;

            foreach (array_keys($grafo[$clave] ?? []) as $vecino) {
                if (!isset($visitados[$vecino])) {
                    $visitados[$vecino] = true;
                    $stack[] = $vecino;
                }
            }
        }

        if (count($comp) >= 2) {
            $componentes[] = $comp;
        }
    }

    $resumen = [];
    $nroGrupo = 1;

    foreach ($componentes as $comp) {
        usort($comp, static function (string $claveA, string $claveB) use ($materias, $porClave): int {
            $a = $materias[$porClave[$claveA]];
            $b = $materias[$porClave[$claveB]];

            $curso = ((int)$a['curso_id']) <=> ((int)$b['curso_id']);
            if ($curso !== 0) {
                return $curso;
            }

            $division = ((int)$a['division_id']) <=> ((int)$b['division_id']);
            if ($division !== 0) {
                return $division;
            }

            return strcasecmp((string)$a['materia'], (string)$b['materia']);
        });

        $total = count($comp);

        foreach ($comp as $orden => $clave) {
            $idx = $porClave[$clave];
            $materias[$idx]['es_correlativa'] = true;
            $materias[$idx]['correlativa_orden'] = $orden + 1;
            $materias[$idx]['correlativa_total'] = $total;
            $materias[$idx]['correlativas_anteriores'] = array_values(array_keys($anterioresPorClave[$clave] ?? []));
            $materias[$idx]['requiere_correlativa_anterior'] = count($materias[$idx]['correlativas_anteriores']) > 0;
        }

        $resumen[] = [
            'correlativa' => $nroGrupo++,
            'materias' => array_map(static function (string $clave) use ($materias, $porClave): array {
                $m = $materias[$porClave[$clave]];
                return [
                    'clave_unica' => $m['clave_unica'],
                    'id_materia' => $m['id_materia'],
                    'materia' => $m['materia'],
                    'curso_id' => $m['curso_id'],
                    'division_id' => $m['division_id'],
                    'curso' => $m['curso'],
                    'division' => $m['division'],
                    'inscripcion' => $m['inscripcion'],
                ];
            }, $comp),
        ];
    }

    return [$materias, $resumen];
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    form_buscar_previas();
}
