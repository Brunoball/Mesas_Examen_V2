<?php
// backend/modules/mesas/armado_mesas/fases/helpers_armado.php
declare(strict_types=1);

function mesas_armado_fecha_valida(string $fecha): bool
{
    $d = DateTimeImmutable::createFromFormat('Y-m-d', $fecha);
    return $d instanceof DateTimeImmutable && $d->format('Y-m-d') === $fecha;
}

function mesas_armado_fecha_es_fin_de_semana(string $fecha): bool
{
    if (!mesas_armado_fecha_valida($fecha)) {
        return false;
    }

    $d = new DateTimeImmutable($fecha);
    $numeroDia = (int)$d->format('N');

    return $numeroDia >= 6;
}

function mesas_armado_ajustar_a_dia_habil(string $fecha, string $direccion = 'siguiente'): string
{
    if (!mesas_armado_fecha_valida($fecha)) {
        return $fecha;
    }

    $d = new DateTimeImmutable($fecha);
    $paso = $direccion === 'anterior' ? '-1 day' : '+1 day';

    while ((int)$d->format('N') >= 6) {
        $d = $d->modify($paso);
    }

    return $d->format('Y-m-d');
}


function mesas_armado_normalizar_texto_turno(mixed $valor): string
{
    $texto = mb_strtolower(trim((string)$valor), 'UTF-8');

    return strtr($texto, [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
        'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o', 'ü' => 'u',
        'ñ' => 'n',
    ]);
}

function mesas_armado_normalizar_modo_turnos(mixed $modo): string
{
    $texto = mesas_armado_normalizar_texto_turno($modo);
    $texto = str_replace([' ', '-'], '_', $texto);

    if ($texto === '' || $texto === 'combinado' || $texto === 'ambos' || $texto === 'todos' || $texto === 'manana_y_tarde') {
        return 'combinado';
    }

    if ($texto === 'manana' || $texto === 'solo_manana' || $texto === 'turno_manana') {
        return 'manana';
    }

    if ($texto === 'tarde' || $texto === 'solo_tarde' || $texto === 'turno_tarde') {
        return 'tarde';
    }

    return 'combinado';
}

function mesas_armado_turno_coincide_modo(array $turno, string $modoTurnos): bool
{
    $modo = mesas_armado_normalizar_modo_turnos($modoTurnos);

    if ($modo === 'combinado') {
        return true;
    }

    $idTurno = (int)($turno['id_turno'] ?? 0);
    $nombre = mesas_armado_normalizar_texto_turno($turno['turno'] ?? $turno['nombre'] ?? $turno['descripcion'] ?? '');

    if ($modo === 'manana') {
        return $idTurno === 1
            || str_contains($nombre, 'manana')
            || str_contains($nombre, 'matut');
    }

    if ($modo === 'tarde') {
        return $idTurno === 2
            || str_contains($nombre, 'tarde')
            || str_contains($nombre, 'vesp');
    }

    return true;
}

function mesas_armado_filtrar_turnos_por_modo(array $turnos, mixed $modoTurnos): array
{
    $modo = mesas_armado_normalizar_modo_turnos($modoTurnos);

    if ($modo === 'combinado') {
        return array_values($turnos);
    }

    return array_values(array_filter(
        $turnos,
        static fn (array $turno): bool => mesas_armado_turno_coincide_modo($turno, $modo)
    ));
}

function mesas_armado_obtener_slots(PDO $pdo, string $fechaInicio, string $fechaFin, bool $excluirFinesSemana = true, mixed $modoTurnos = 'combinado'): array
{
    // Regla obligatoria del armado: nunca se generan mesas sábado ni domingo.
    // Aunque el frontend envíe otro valor, el backend siempre descarta fines de semana.
    $excluirFinesSemana = true;

    $stmtTurnos = $pdo->query("
        SELECT id_turno, turno
        FROM turnos
        WHERE activo = 1
        ORDER BY id_turno ASC
    ");

    $turnos = mesas_armado_filtrar_turnos_por_modo(
        $stmtTurnos->fetchAll(PDO::FETCH_ASSOC),
        $modoTurnos
    );

    if (count($turnos) === 0) {
        return [];
    }

    $inicio = new DateTimeImmutable($fechaInicio);
    $fin = new DateTimeImmutable($fechaFin);

    $slots = [];
    $actual = $inicio;

    while ($actual <= $fin) {
        $numeroDia = (int)$actual->format('N');

        if (!$excluirFinesSemana || $numeroDia <= 5) {
            foreach ($turnos as $turno) {
                $slots[] = [
                    'fecha' => $actual->format('Y-m-d'),
                    'id_turno' => (int)$turno['id_turno'],
                    'turno' => (string)$turno['turno'],
                ];
            }
        }

        $actual = $actual->modify('+1 day');
    }

    return $slots;
}

/**
 * Obtiene las previas que entran al armado.
 *
 * Regla para obtener docente:
 * - Si hay una sola cátedra/docente para materia + curso + división, usa ese.
 * - Si hay más de una cátedra/docente para la misma materia + curso + división,
 *   prioriza SIEMPRE el docente con cargo SUPLENTE.
 * - Si no hay suplente activo, usa el docente activo disponible.
 *
 * En tu tabla cargos:
 * 1 = TITULAR
 * 2 = SUPLENTE
 * 3 = ROTACIÓN
 * 4 = VACANTE
 */
function mesas_armado_obtener_previas_para_armar(PDO $pdo): array
{
    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            con.condicion,
            p.inscripcion,
            p.activo,
            p.anio,

            mat.materia,

            cat.id_catedra,
            COALESCE(cd.id_docente, cat.id_docente) AS id_docente_catedra,
            doc.id_docente AS id_docente,

            doc.docente,
            cd.id_cargo AS id_cargo,
            cargo_doc.cargo AS cargo_docente,

            taller_map.id_taller,

            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM materias_correlativas mc
                    INNER JOIN previas p2
                        ON p2.dni = p.dni
                       AND p2.activo = 1
                       AND p2.inscripcion = 1
                       AND p2.id_condicion = 3
                    WHERE mc.activo = 1
                      AND mc.bloquea_armado = 1
                      AND (
                            (
                                mc.id_materia = p.id_materia
                                AND mc.id_curso = p.materia_id_curso
                                AND p2.id_materia = mc.id_materia_relacionada
                                AND p2.materia_id_curso = mc.id_curso_relacionada
                            )
                            OR
                            (
                                mc.id_materia_relacionada = p.id_materia
                                AND mc.id_curso_relacionada = p.materia_id_curso
                                AND p2.id_materia = mc.id_materia
                                AND p2.materia_id_curso = mc.id_curso
                            )
                      )
                    LIMIT 1
                )
                THEN 1
                ELSE 0
            END AS tiene_correlativa_alumno

        FROM previas p

        INNER JOIN materias mat
            ON mat.id_materia = p.id_materia

        LEFT JOIN condicion con
            ON con.id_condicion = p.id_condicion

        LEFT JOIN catedras cat
            ON cat.id_catedra = (
                SELECT c2.id_catedra
                FROM catedras c2

                LEFT JOIN catedras_docentes cd2
                    ON cd2.id_catedra = c2.id_catedra
                   AND cd2.activo = 1

                LEFT JOIN docentes d2
                    ON d2.id_docente = COALESCE(cd2.id_docente, c2.id_docente)

                LEFT JOIN cargos cargo2
                    ON cargo2.id_cargo = cd2.id_cargo

                WHERE c2.id_materia = p.id_materia
                  AND c2.id_curso = p.materia_id_curso
                  AND c2.id_division = p.materia_id_division
                  AND c2.activo = 1

                ORDER BY
                    CASE
                        WHEN d2.activo = 1
                         AND d2.id_docente IS NOT NULL
                         AND (
                                cd2.id_cargo = 2
                                OR UPPER(TRIM(COALESCE(cargo2.cargo, ''))) = 'SUPLENTE'
                             )
                        THEN 0

                        WHEN d2.activo = 1
                         AND d2.id_docente IS NOT NULL
                         AND (
                                cd2.id_cargo = 1
                                OR UPPER(TRIM(COALESCE(cargo2.cargo, ''))) = 'TITULAR'
                             )
                        THEN 1

                        WHEN d2.activo = 1
                         AND d2.id_docente IS NOT NULL
                        THEN 2

                        WHEN COALESCE(cd2.id_docente, c2.id_docente) IS NULL
                        THEN 3

                        ELSE 4
                    END ASC,
                    c2.id_catedra ASC

                LIMIT 1
            )

        LEFT JOIN catedras_docentes cd
            ON cd.id_catedra = cat.id_catedra
           AND cd.activo = 1
           AND cd.id_catedra_docente = (
                SELECT cd3.id_catedra_docente
                FROM catedras_docentes cd3
                LEFT JOIN docentes d3
                    ON d3.id_docente = cd3.id_docente
                LEFT JOIN cargos cargo3
                    ON cargo3.id_cargo = cd3.id_cargo
                WHERE cd3.id_catedra = cat.id_catedra
                  AND cd3.activo = 1
                ORDER BY
                    CASE
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                         AND (
                                cd3.id_cargo = 2
                                OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'SUPLENTE'
                             )
                        THEN 0
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                         AND (
                                cd3.id_cargo = 1
                                OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'TITULAR'
                             )
                        THEN 1
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                        THEN 2
                        ELSE 3
                    END ASC,
                    cd3.id_catedra_docente ASC
                LIMIT 1
           )

        LEFT JOIN docentes doc
            ON doc.id_docente = COALESCE(cd.id_docente, cat.id_docente)
           AND doc.activo = 1

        LEFT JOIN cargos cargo_doc
            ON cargo_doc.id_cargo = cd.id_cargo

        LEFT JOIN (
            SELECT
                tm.id_catedra,
                MIN(tm.id_taller) AS id_taller
            FROM talleres_materias tm
            INNER JOIN talleres ta
                ON ta.id_taller = tm.id_taller
               AND ta.activo = 1
            WHERE tm.activo = 1
              AND tm.id_catedra IS NOT NULL
            GROUP BY tm.id_catedra
        ) taller_map
            ON taller_map.id_catedra = cat.id_catedra

        WHERE p.inscripcion = 1
          AND p.activo = 1
          AND p.id_condicion = 3

        ORDER BY
            tiene_correlativa_alumno DESC,
            taller_map.id_taller IS NOT NULL DESC,
            p.materia_id_curso ASC,
            p.materia_id_division ASC,
            mat.materia ASC,
            p.alumno ASC
    ";

    $stmt = $pdo->query($sql);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Obtiene relaciones de correlatividad desde las filas operativas de `mesas`.
 *
 * IMPORTANTE para TALLER:
 * - En talleres, la previa original puede ser "TALLER - LABORATORIO", pero la fila
 *   operativa de `mesas` se expande a cátedras reales (ej. ELECTRÓNICA DIGITAL IV).
 * - Por eso la correlativa se calcula con la materia/curso de la CÁTEDRA (`cat`),
 *   no solo con `previas.id_materia`.
 * - Así, si el alumno debe rendir DIGITAL II y también un taller que contiene
 *   DIGITAL IV, el sistema detecta DIGITAL II -> DIGITAL IV y obliga el orden.
 */
function mesas_armado_obtener_correlativas_operativas_desde_mesas(PDO $pdo): array
{
    if (!mesas_armado_tabla_existe($pdo, 'materias_correlativas')) {
        return [];
    }

    /*
     * Correlativas operativas reales, incluyendo cadenas transitivas.
     *
     * Caso que se corrige:
     * DIGITAL II -> DIGITAL III -> DIGITAL IV.
     * Si el alumno debe DIGITAL II y también un taller que contiene DIGITAL IV,
     * aunque no deba DIGITAL III, DIGITAL II debe rendirse antes que el taller.
     *
     * Por eso no alcanza con buscar solo relaciones directas en SQL. Se arma un
     * grafo anterior -> posterior y se compara cada materia efectiva de las mesas
     * actuales, usando la cátedra expandida del taller.
     */
    $stmtMesas = $pdo->query("
        SELECT
            me.id_mesa,
            me.id_previa,
            me.tipo_mesa,
            me.numero_mesa,
            p.dni,
            p.alumno,
            cat.id_materia,
            cat.id_curso,
            mat.materia
        FROM mesas me
        INNER JOIN previas p
            ON p.id_previa = me.id_previa
           AND p.activo = 1
           AND p.inscripcion = 1
           AND p.id_condicion = 3
        INNER JOIN catedras cat
            ON cat.id_catedra = me.id_catedra
           AND cat.activo = 1
        INNER JOIN materias mat
            ON mat.id_materia = cat.id_materia
           AND mat.activo = 1
        WHERE me.id_previa IS NOT NULL
          AND me.id_catedra IS NOT NULL
          AND me.estado IN ('borrador', 'armada', 'observada')
        ORDER BY p.dni ASC, me.id_mesa ASC
    ");

    $filasMesas = $stmtMesas->fetchAll(PDO::FETCH_ASSOC);

    if (count($filasMesas) === 0) {
        return [];
    }

    $stmtCorrelativas = $pdo->query("
        SELECT
            id_materia,
            id_curso,
            id_materia_relacionada,
            id_curso_relacionada,
            tipo,
            COALESCE(orden, 999999) AS orden
        FROM materias_correlativas
        WHERE activo = 1
          AND bloquea_armado = 1
        ORDER BY COALESCE(orden, 999999) ASC, id_materia_correlativa ASC
    ");

    $correlativas = $stmtCorrelativas->fetchAll(PDO::FETCH_ASSOC);

    if (count($correlativas) === 0) {
        return [];
    }

    $claveMateriaCurso = static function (int $idMateria, int $idCurso): string {
        return $idMateria . '|' . $idCurso;
    };

    $grafo = [];
    $equivalentes = [];
    $ordenEdge = [];

    foreach ($correlativas as $corr) {
        $idMateriaA = (int)$corr['id_materia'];
        $idCursoA = (int)$corr['id_curso'];
        $idMateriaB = (int)$corr['id_materia_relacionada'];
        $idCursoB = (int)$corr['id_curso_relacionada'];
        $tipo = (string)$corr['tipo'];
        $orden = (int)$corr['orden'];

        if ($idMateriaA <= 0 || $idCursoA <= 0 || $idMateriaB <= 0 || $idCursoB <= 0) {
            continue;
        }

        $claveA = $claveMateriaCurso($idMateriaA, $idCursoA);
        $claveB = $claveMateriaCurso($idMateriaB, $idCursoB);

        if ($claveA === $claveB) {
            continue;
        }

        if ($tipo === 'equivalente') {
            $equivalentes[$claveA][$claveB] = true;
            $equivalentes[$claveB][$claveA] = true;
            continue;
        }

        /*
         * Regla obligatoria: el curso menor es anterior. Esto evita que una
         * materia de 7° dentro de taller quede antes que una correlativa de 5°.
         * Si no se puede decidir por curso, se usa un fallback compatible con el
         * alta visible anterior -> posterior.
         */
        if ($idCursoA !== $idCursoB) {
            $desde = $idCursoA < $idCursoB ? $claveA : $claveB;
            $hacia = $idCursoA < $idCursoB ? $claveB : $claveA;
        } elseif ($tipo === 'posterior') {
            $desde = $claveB;
            $hacia = $claveA;
        } else {
            $desde = $claveA;
            $hacia = $claveB;
        }

        if (!isset($grafo[$desde])) {
            $grafo[$desde] = [];
        }

        $grafo[$desde][$hacia] = true;
        $ordenEdge[$desde . '>' . $hacia] = min($ordenEdge[$desde . '>' . $hacia] ?? 999999, $orden);
    }

    $buscarCamino = static function (string $origen, string $destino) use (&$grafo): ?array {
        if ($origen === $destino) {
            return null;
        }

        $cola = [[$origen, []]];
        $visitados = [$origen => true];

        while (count($cola) > 0) {
            [$actual, $camino] = array_shift($cola);
            $vecinos = $grafo[$actual] ?? [];

            foreach ($vecinos as $siguiente => $_) {
                if (isset($visitados[$siguiente])) {
                    continue;
                }

                $nuevoCamino = array_merge($camino, [[$actual, (string)$siguiente]]);

                if ((string)$siguiente === $destino) {
                    return $nuevoCamino;
                }

                $visitados[$siguiente] = true;
                $cola[] = [(string)$siguiente, $nuevoCamino];
            }
        }

        return null;
    };

    $ordenDesdeCamino = static function (?array $camino) use (&$ordenEdge): int {
        if (!is_array($camino) || count($camino) === 0) {
            return 999999;
        }

        $orden = 999999;
        foreach ($camino as $edge) {
            $orden = min($orden, (int)($ordenEdge[$edge[0] . '>' . $edge[1]] ?? 999999));
        }

        return $orden;
    };

    $porDni = [];
    foreach ($filasMesas as $fila) {
        $dni = trim((string)$fila['dni']);
        if ($dni === '') {
            continue;
        }

        $porDni[$dni][] = $fila;
    }

    $relaciones = [];
    $relacionesIndex = [];

    foreach ($porDni as $dni => $filasAlumno) {
        $total = count($filasAlumno);

        for ($i = 0; $i < $total; $i++) {
            for ($j = $i + 1; $j < $total; $j++) {
                $a = $filasAlumno[$i];
                $b = $filasAlumno[$j];

                $idPreviaA = (int)$a['id_previa'];
                $idPreviaB = (int)$b['id_previa'];

                if ($idPreviaA <= 0 || $idPreviaB <= 0 || $idPreviaA === $idPreviaB) {
                    continue;
                }

                $claveA = $claveMateriaCurso((int)$a['id_materia'], (int)$a['id_curso']);
                $claveB = $claveMateriaCurso((int)$b['id_materia'], (int)$b['id_curso']);

                if ($claveA === $claveB) {
                    continue;
                }

                $caminoAB = $buscarCamino($claveA, $claveB);
                $caminoBA = $buscarCamino($claveB, $claveA);
                $esEquivalente = isset($equivalentes[$claveA][$claveB]) || isset($equivalentes[$claveB][$claveA]);

                if ($caminoAB !== null && $caminoBA === null) {
                    $anterior = $a;
                    $posterior = $b;
                    $orden = $ordenDesdeCamino($caminoAB);
                    $tipoRelacion = count($caminoAB) > 1 ? 'anterior_transitiva' : 'anterior';
                } elseif ($caminoBA !== null && $caminoAB === null) {
                    $anterior = $b;
                    $posterior = $a;
                    $orden = $ordenDesdeCamino($caminoBA);
                    $tipoRelacion = count($caminoBA) > 1 ? 'anterior_transitiva' : 'anterior';
                } elseif ($esEquivalente) {
                    $anterior = $a;
                    $posterior = $b;
                    $orden = 999999;
                    $tipoRelacion = 'equivalente';
                } else {
                    continue;
                }

                $idMesaAnterior = (int)$anterior['id_mesa'];
                $idMesaPosterior = (int)$posterior['id_mesa'];
                $indexKey = $idMesaAnterior . '>' . $idMesaPosterior . '|' . $tipoRelacion;

                if (isset($relacionesIndex[$indexKey])) {
                    continue;
                }

                $relacionesIndex[$indexKey] = true;
                $relaciones[] = [
                    'id_mesa_base' => $idMesaAnterior,
                    'id_previa_base' => (int)$anterior['id_previa'],
                    'tipo_mesa_base' => (string)$anterior['tipo_mesa'],
                    'numero_mesa_base' => $anterior['numero_mesa'] !== null ? (int)$anterior['numero_mesa'] : null,
                    'dni' => (string)$anterior['dni'],
                    'alumno' => (string)$anterior['alumno'],
                    'id_materia_base' => (int)$anterior['id_materia'],
                    'id_curso_base' => (int)$anterior['id_curso'],
                    'materia_base' => (string)$anterior['materia'],

                    'id_mesa_relacionada' => $idMesaPosterior,
                    'id_previa_relacionada' => (int)$posterior['id_previa'],
                    'tipo_mesa_relacionada' => (string)$posterior['tipo_mesa'],
                    'numero_mesa_relacionada' => $posterior['numero_mesa'] !== null ? (int)$posterior['numero_mesa'] : null,
                    'id_materia_relacionada_real' => (int)$posterior['id_materia'],
                    'id_curso_relacionada_real' => (int)$posterior['id_curso'],
                    'materia_relacionada' => (string)$posterior['materia'],

                    // Para el resto del motor se comporta como correlativa anterior.
                    'tipo' => $tipoRelacion === 'equivalente' ? 'equivalente' : 'anterior',
                    'tipo_origen' => $tipoRelacion,
                    'orden' => $orden,
                ];
            }
        }
    }

    usort($relaciones, static function (array $a, array $b): int {
        return [(string)$a['dni'], (int)$a['orden'], (int)$a['id_mesa_base'], (int)$a['id_mesa_relacionada']]
            <=> [(string)$b['dni'], (int)$b['orden'], (int)$b['id_mesa_base'], (int)$b['id_mesa_relacionada']];
    });

    return $relaciones;
}

/**
 * Recalcula prioridad/tipo correlativa usando las filas operativas de `mesas`.
 * Esto corrige el caso clave: una correlativa simple contra una materia expandida
 * dentro de un taller. El taller sigue siendo `tipo_mesa = taller`, pero la otra
 * materia deja de quedar como simple y pasa a prioridad correlativa.
 */
function mesas_armado_recalcular_correlativas_operativas(PDO $pdo): array
{
    $relaciones = mesas_armado_obtener_correlativas_operativas_desde_mesas($pdo);

    if (count($relaciones) === 0) {
        return [
            'total_relaciones_operativas' => 0,
            'filas_marcadas_correlativas' => 0,
            'filas_taller_en_correlativa' => 0,
            'nota' => 'No se detectaron correlativas operativas entre las mesas actuales.',
        ];
    }

    $idsNoTaller = [];
    $idsTaller = [];

    foreach ($relaciones as $relacion) {
        $pares = [
            [(int)$relacion['id_mesa_base'], (string)$relacion['tipo_mesa_base']],
            [(int)$relacion['id_mesa_relacionada'], (string)$relacion['tipo_mesa_relacionada']],
        ];

        foreach ($pares as [$idMesa, $tipoMesa]) {
            if ($idMesa <= 0) {
                continue;
            }

            if ($tipoMesa === 'taller') {
                $idsTaller[$idMesa] = true;
            } else {
                $idsNoTaller[$idMesa] = true;
            }
        }
    }

    $filasMarcadas = 0;

    if (count($idsNoTaller) > 0) {
        $ids = array_map('intval', array_keys($idsNoTaller));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("
            UPDATE mesas
            SET tipo_mesa = 'correlativa',
                prioridad = CASE WHEN prioridad < 2 THEN 2 ELSE prioridad END
            WHERE id_mesa IN ({$placeholders})
              AND tipo_mesa <> 'taller'
        ");
        $stmt->execute($ids);
        $filasMarcadas = $stmt->rowCount();
    }

    return [
        'total_relaciones_operativas' => count($relaciones),
        'filas_marcadas_correlativas' => $filasMarcadas,
        'filas_taller_en_correlativa' => count($idsTaller),
        'nota' => 'Correlativas recalculadas por materia/curso efectivo de cátedra. Si una correlativa cruza con taller, la anterior queda como correlativa y el taller conserva su tipo especial.',
    ];
}

/**
 * Obtiene la disponibilidad positiva de los docentes.
 *
 * Regla del armado:
 * - Si un docente NO tiene registros en docentes_disponibilidad, puede ir
 *   cualquier dia habil y cualquier turno.
 * - Si un docente SI tiene registros, solamente puede ser ubicado en los
 *   dia_semana + id_turno cargados.
 * - El armado no trabaja por fecha puntual de disponibilidad: calcula el dia
 *   de la semana desde fecha_mesa y compara contra dia_semana.
 */
function mesas_armado_obtener_disponibilidad_docentes(PDO $pdo): array
{
    if (!mesas_armado_tabla_existe($pdo, 'docentes_disponibilidad')) {
        return [];
    }

    $stmt = $pdo->query("
        SELECT id_docente, dia_semana, id_turno
        FROM docentes_disponibilidad
        WHERE dia_semana BETWEEN 1 AND 5
          AND id_turno IS NOT NULL
        ORDER BY id_docente ASC, dia_semana ASC, id_turno ASC
    ");

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $map = [];

    foreach ($rows as $row) {
        $idDocente = (int)$row['id_docente'];
        $diaSemana = (int)$row['dia_semana'];
        $idTurno = (int)$row['id_turno'];

        if ($idDocente <= 0 || $diaSemana < 1 || $diaSemana > 5 || $idTurno <= 0) {
            continue;
        }

        if (!isset($map[$idDocente])) {
            $map[$idDocente] = [];
        }

        $map[$idDocente][] = [
            'dia_semana' => $diaSemana,
            'id_turno' => $idTurno,
        ];
    }

    return $map;
}

function mesas_armado_tabla_existe(PDO $pdo, string $tabla): bool
{
    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
    ");
    $stmt->execute([$tabla]);

    return (int)$stmt->fetchColumn() > 0;
}

function mesas_armado_dia_semana_desde_fecha(string $fecha): ?int
{
    if (!mesas_armado_fecha_valida($fecha)) {
        return null;
    }

    return (int)(new DateTimeImmutable($fecha))->format('N');
}

function mesas_armado_docente_disponible(array $disponibilidadDocentes, int $idDocente, string $fecha, int $idTurno): bool
{
    if ($idDocente <= 0 || $idTurno <= 0) {
        return false;
    }

    // Sin registros cargados = disponible siempre.
    if (!isset($disponibilidadDocentes[$idDocente]) || count($disponibilidadDocentes[$idDocente]) === 0) {
        return true;
    }

    $diaSemana = mesas_armado_dia_semana_desde_fecha($fecha);

    if ($diaSemana === null || $diaSemana < 1 || $diaSemana > 5) {
        return false;
    }

    foreach ($disponibilidadDocentes[$idDocente] as $registro) {
        $diaRegistro = (int)($registro['dia_semana'] ?? 0);
        $turnoRegistro = (int)($registro['id_turno'] ?? 0);

        if ($diaRegistro === $diaSemana && $turnoRegistro === $idTurno) {
            return true;
        }
    }

    return false;
}

function mesas_armado_docente_no_disponible(array $disponibilidadDocentes, int $idDocente, string $fecha, int $idTurno): bool
{
    return !mesas_armado_docente_disponible($disponibilidadDocentes, $idDocente, $fecha, $idTurno);
}

function mesas_armado_buscar_slot_disponible(
    array $slots,
    array $disponibilidadDocentes,
    int $idDocente,
    string $dni,
    array $ocupacionAlumno,
    int &$slotIndex
): ?array {
    $totalSlots = count($slots);

    if ($totalSlots === 0) {
        return null;
    }

    for ($i = 0; $i < $totalSlots; $i++) {
        $indice = ($slotIndex + $i) % $totalSlots;
        $slot = $slots[$indice];

        $fecha = (string)$slot['fecha'];
        $idTurno = (int)$slot['id_turno'];

        if (mesas_armado_docente_no_disponible($disponibilidadDocentes, $idDocente, $fecha, $idTurno)) {
            continue;
        }

        $claveAlumno = mesas_armado_clave_ocupacion_alumno($dni, $fecha, $idTurno);

        if (isset($ocupacionAlumno[$claveAlumno])) {
            continue;
        }

        $slotIndex = ($indice + 1) % $totalSlots;

        return $slot;
    }

    return null;
}

function mesas_armado_clave_ocupacion_alumno(string $dni, string $fecha, int $idTurno): string
{
    return $dni . '|' . $fecha . '|' . $idTurno;
}

function mesas_armado_obtener_mesa_por_previa(PDO $pdo, int $idPrevia): int
{
    // Reutiliza cualquier fila operativa de esa previa.
    // Si no se limpia el borrador, evita insertar duplicados al rearmar.
    $stmt = $pdo->prepare("
        SELECT id_mesa
        FROM mesas
        WHERE id_previa = ?
          AND estado IN ('borrador', 'observada', 'armada')
        ORDER BY id_mesa DESC
        LIMIT 1
    ");

    $stmt->execute([$idPrevia]);

    return (int)($stmt->fetchColumn() ?: 0);
}

function mesas_armado_eliminar_mesas_por_previa(PDO $pdo, int $idPrevia): int
{
    if (function_exists('mesas_notificaciones_cleanup_por_previas')) {
        mesas_notificaciones_cleanup_por_previas($pdo, [$idPrevia], true);
    }

    $stmt = $pdo->prepare("
        DELETE FROM mesas
        WHERE id_previa = ?
          AND estado IN ('borrador', 'observada', 'armada')
    ");
    $stmt->execute([$idPrevia]);

    return $stmt->rowCount();
}

function mesas_armado_obtener_materias_de_taller(PDO $pdo, int $idTaller, int $idCurso, int $idDivision): array
{
    /**
     * talleres_materias guarda solo id_catedra como vínculo real.
     * Curso, división y materia salen siempre desde catedras.
     */
    $stmt = $pdo->prepare("
        SELECT
            tm.id_taller,
            tm.id_catedra,
            ca.id_curso,
            ca.id_division,
            ca.id_materia,
            mat.materia,
            COALESCE(cd.id_docente, ca.id_docente) AS id_docente_catedra,
            doc.id_docente,
            doc.docente,
            cd.id_cargo AS id_cargo,
            cargo.cargo AS cargo_docente,
            tm.orden
        FROM talleres_materias tm
        INNER JOIN talleres ta
            ON ta.id_taller = tm.id_taller
           AND ta.activo = 1
        INNER JOIN catedras ca
            ON ca.id_catedra = tm.id_catedra
           AND ca.activo = 1
        INNER JOIN materias mat
            ON mat.id_materia = ca.id_materia
           AND mat.activo = 1
        LEFT JOIN catedras_docentes cd
            ON cd.id_catedra = ca.id_catedra
           AND cd.activo = 1
           AND cd.id_catedra_docente = (
                SELECT cd3.id_catedra_docente
                FROM catedras_docentes cd3
                LEFT JOIN docentes d3
                    ON d3.id_docente = cd3.id_docente
                LEFT JOIN cargos cargo3
                    ON cargo3.id_cargo = cd3.id_cargo
                WHERE cd3.id_catedra = ca.id_catedra
                  AND cd3.activo = 1
                ORDER BY
                    CASE
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                         AND (
                                cd3.id_cargo = 2
                                OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'SUPLENTE'
                             )
                        THEN 0
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                         AND (
                                cd3.id_cargo = 1
                                OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'TITULAR'
                             )
                        THEN 1
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                        THEN 2
                        ELSE 3
                    END ASC,
                    cd3.id_catedra_docente ASC
                LIMIT 1
           )
        LEFT JOIN docentes doc
            ON doc.id_docente = COALESCE(cd.id_docente, ca.id_docente)
           AND doc.activo = 1
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = cd.id_cargo
        WHERE tm.id_taller = ?
          AND ca.id_curso = ?
          AND ca.id_division = ?
          AND tm.activo = 1
        ORDER BY
            COALESCE(tm.orden, 999999) ASC,
            mat.materia ASC,
            ca.id_catedra ASC
    ");

    $stmt->execute([$idTaller, $idCurso, $idDivision]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Busca la cátedra/docente para una materia concreta del taller.
 * Mantiene la misma regla del armado base: si hubiera más de una opción,
 * prioriza docente suplente activo; si no, el docente activo disponible.
 */
function mesas_armado_obtener_catedra_para_materia_curso_division(
    PDO $pdo,
    int $idMateria,
    int $idCurso,
    int $idDivision
): ?array {
    $stmt = $pdo->prepare("
        SELECT
            c.id_catedra,
            c.id_materia,
            c.id_curso,
            c.id_division,
            COALESCE(cd.id_docente, c.id_docente) AS id_docente_catedra,
            d.id_docente,
            d.docente,
            cd.id_cargo AS id_cargo,
            cargo.cargo AS cargo_docente
        FROM catedras c
        LEFT JOIN catedras_docentes cd
            ON cd.id_catedra = c.id_catedra
           AND cd.activo = 1
           AND cd.id_catedra_docente = (
                SELECT cd3.id_catedra_docente
                FROM catedras_docentes cd3
                LEFT JOIN docentes d3
                    ON d3.id_docente = cd3.id_docente
                LEFT JOIN cargos cargo3
                    ON cargo3.id_cargo = cd3.id_cargo
                WHERE cd3.id_catedra = c.id_catedra
                  AND cd3.activo = 1
                ORDER BY
                    CASE
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                         AND (
                                cd3.id_cargo = 2
                                OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'SUPLENTE'
                             )
                        THEN 0
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                         AND (
                                cd3.id_cargo = 1
                                OR UPPER(TRIM(COALESCE(cargo3.cargo, ''))) = 'TITULAR'
                             )
                        THEN 1
                        WHEN d3.activo = 1
                         AND d3.id_docente IS NOT NULL
                        THEN 2
                        ELSE 3
                    END ASC,
                    cd3.id_catedra_docente ASC
                LIMIT 1
           )
        LEFT JOIN docentes d
            ON d.id_docente = COALESCE(cd.id_docente, c.id_docente)
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = cd.id_cargo
        WHERE c.id_materia = ?
          AND c.id_curso = ?
          AND c.id_division = ?
          AND c.activo = 1
        ORDER BY
            CASE
                WHEN d.activo = 1
                 AND d.id_docente IS NOT NULL
                 AND (
                        cd.id_cargo = 2
                        OR UPPER(TRIM(COALESCE(cargo.cargo, ''))) = 'SUPLENTE'
                     )
                THEN 0

                WHEN d.activo = 1
                 AND d.id_docente IS NOT NULL
                 AND (
                        cd.id_cargo = 1
                        OR UPPER(TRIM(COALESCE(cargo.cargo, ''))) = 'TITULAR'
                     )
                THEN 1

                WHEN d.activo = 1
                 AND d.id_docente IS NOT NULL
                THEN 2

                WHEN COALESCE(cd.id_docente, c.id_docente) IS NULL
                THEN 3

                ELSE 4
            END ASC,
            c.id_catedra ASC
        LIMIT 1
    ");

    $stmt->execute([$idMateria, $idCurso, $idDivision]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        return null;
    }

    return [
        'id_catedra' => (int)$row['id_catedra'],
        'id_materia' => (int)$row['id_materia'],
        'id_docente' => $row['id_docente'] !== null ? (int)$row['id_docente'] : null,
        'docente' => $row['docente'] ?? null,
        'id_cargo' => $row['id_cargo'] !== null ? (int)$row['id_cargo'] : null,
        'cargo_docente' => $row['cargo_docente'] ?? null,
    ];
}
