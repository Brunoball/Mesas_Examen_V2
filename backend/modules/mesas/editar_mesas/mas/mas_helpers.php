<?php
// backend/modules/mesas/editar_mesas/mas/mas_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';

function mesas_editar_mas_int($valor, string $mensaje): int
{
    $numero = (int)($valor ?? 0);
    if ($numero <= 0) {
        throw new InvalidArgumentException($mensaje);
    }
    return $numero;
}

function mesas_editar_mas_fecha_formato(?string $fecha): ?string
{
    $texto = trim((string)$fecha);
    if ($texto === '') {
        return null;
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', substr($texto, 0, 10));
    return $dt ? $dt->format('d/m/Y') : $texto;
}

function mesas_editar_mas_obtener_meta_numero(PDO $pdo, int $numeroMesa): ?array
{
    $stmtGrupo = $pdo->prepare(''
        . 'SELECT '
        . '    g.numero_mesa, g.numero_grupo, NULL AS id_no_agrupada, '
        . '    g.fecha_mesa, DATE_FORMAT(g.fecha_mesa, "%d/%m/%Y") AS fecha, '
        . '    g.id_turno, g.hora, t.turno, g.id_area, a.area, '
        . '    g.tipo_mesa, g.prioridad, g.cantidad_alumnos, "grupo" AS ubicacion '
        . 'FROM mesas_grupos g '
        . 'LEFT JOIN turnos t ON t.id_turno = g.id_turno '
        . 'LEFT JOIN areas a ON a.id_area = g.id_area '
        . 'WHERE g.numero_mesa = ? '
        . 'LIMIT 1'
    );
    $stmtGrupo->execute([$numeroMesa]);
    $meta = $stmtGrupo->fetch(PDO::FETCH_ASSOC);
    if ($meta) {
        return $meta;
    }

    $stmtNo = $pdo->prepare(''
        . 'SELECT '
        . '    n.numero_mesa, NULL AS numero_grupo, n.id AS id_no_agrupada, '
        . '    n.fecha_mesa, DATE_FORMAT(n.fecha_mesa, "%d/%m/%Y") AS fecha, '
        . '    n.id_turno, n.hora, t.turno, n.id_area, a.area, '
        . '    n.tipo_mesa, n.prioridad, n.cantidad_alumnos, "no_agrupada" AS ubicacion '
        . 'FROM mesas_no_agrupadas n '
        . 'LEFT JOIN turnos t ON t.id_turno = n.id_turno '
        . 'LEFT JOIN areas a ON a.id_area = n.id_area '
        . 'WHERE n.numero_mesa = ? '
        . 'LIMIT 1'
    );
    $stmtNo->execute([$numeroMesa]);
    $meta = $stmtNo->fetch(PDO::FETCH_ASSOC);
    if ($meta) {
        return $meta;
    }

    $stmtMesas = $pdo->prepare(''
        . 'SELECT '
        . '    me.numero_mesa, NULL AS numero_grupo, NULL AS id_no_agrupada, '
        . '    MIN(me.fecha_mesa) AS fecha_mesa, DATE_FORMAT(MIN(me.fecha_mesa), "%d/%m/%Y") AS fecha, '
        . '    MIN(me.id_turno) AS id_turno, NULL AS hora, MAX(t.turno) AS turno, '
        . '    MIN(am.id_area) AS id_area, MAX(a.area) AS area, '
        . '    MAX(me.tipo_mesa) AS tipo_mesa, MAX(me.prioridad) AS prioridad, '
        . '    COUNT(DISTINCT me.id_previa) AS cantidad_alumnos, "mesas" AS ubicacion '
        . 'FROM mesas me '
        . 'LEFT JOIN turnos t ON t.id_turno = me.id_turno '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
        . 'LEFT JOIN areas a ON a.id_area = am.id_area '
        . 'WHERE me.numero_mesa = ? '
        . 'GROUP BY me.numero_mesa '
        . 'LIMIT 1'
    );
    $stmtMesas->execute([$numeroMesa]);
    $meta = $stmtMesas->fetch(PDO::FETCH_ASSOC);

    return $meta ?: null;
}

function mesas_editar_mas_target_area(PDO $pdo, int $numeroMesa, array $meta): int
{
    $idArea = (int)($meta['id_area'] ?? 0);
    if ($idArea > 0) {
        return $idArea;
    }

    $stmt = $pdo->prepare(''
        . 'SELECT MIN(am.id_area) '
        . 'FROM mesas me '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
        . 'WHERE me.numero_mesa = ?'
    );
    $stmt->execute([$numeroMesa]);
    $idArea = (int)($stmt->fetchColumn() ?: 0);

    if ($idArea <= 0) {
        throw new RuntimeException('No se pudo resolver el área del número de mesa destino.');
    }

    return $idArea;
}

function mesas_editar_mas_obtener_previa_base(PDO $pdo, int $idPrevia): ?array
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
            doc.id_docente,
            doc.docente,
            ca.nombre_curso AS curso_alumno,
            da.nombre_division AS division_alumno,
            cm.nombre_curso AS curso_materia,
            dm.nombre_division AS division_materia,
            am.id_area,
            ar.area,
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
                      AND p2.id_previa <> p.id_previa
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
                ) THEN 1 ELSE 0
            END AS tiene_correlativa_alumno
        FROM previas p
        INNER JOIN materias mat ON mat.id_materia = p.id_materia
        LEFT JOIN condicion con ON con.id_condicion = p.id_condicion
        LEFT JOIN curso ca ON ca.id_curso = p.cursando_id_curso
        LEFT JOIN division da ON da.id_division = p.cursando_id_division
        LEFT JOIN curso cm ON cm.id_curso = p.materia_id_curso
        LEFT JOIN division dm ON dm.id_division = p.materia_id_division
        LEFT JOIN areas_materias am ON am.id_materia = p.id_materia AND am.activo = 1
        LEFT JOIN areas ar ON ar.id_area = am.id_area
        LEFT JOIN catedras cat
            ON cat.id_catedra = (
                SELECT c2.id_catedra
                FROM catedras c2
                LEFT JOIN docentes d2 ON d2.id_docente = c2.id_docente
                LEFT JOIN cargos cargo2 ON cargo2.id_cargo = d2.id_cargo
                WHERE c2.id_materia = p.id_materia
                  AND c2.id_curso = p.materia_id_curso
                  AND c2.id_division = p.materia_id_division
                  AND c2.activo = 1
                ORDER BY
                    CASE
                        WHEN d2.activo = 1 AND (d2.id_cargo = 2 OR UPPER(TRIM(COALESCE(cargo2.cargo, ''))) = 'SUPLENTE') THEN 0
                        WHEN d2.activo = 1 AND d2.id_docente IS NOT NULL THEN 1
                        WHEN c2.id_docente IS NULL THEN 2
                        ELSE 3
                    END ASC,
                    c2.id_catedra ASC
                LIMIT 1
            )
        LEFT JOIN docentes doc ON doc.id_docente = cat.id_docente AND doc.activo = 1
        LEFT JOIN (
            SELECT tm.id_catedra, MIN(tm.id_taller) AS id_taller
            FROM talleres_materias tm
            INNER JOIN talleres ta ON ta.id_taller = tm.id_taller AND ta.activo = 1
            WHERE tm.activo = 1
              AND tm.id_catedra IS NOT NULL
            GROUP BY tm.id_catedra
        ) taller_map ON taller_map.id_catedra = cat.id_catedra
        WHERE p.id_previa = ?
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$idPrevia]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function mesas_editar_mas_obtener_previas_base_por_area(PDO $pdo, int $idArea, int $limite = 250): array
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
            doc.id_docente,
            doc.docente,
            ca.nombre_curso AS curso_alumno,
            da.nombre_division AS division_alumno,
            cm.nombre_curso AS curso_materia,
            dm.nombre_division AS division_materia,
            am.id_area,
            ar.area,
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
                      AND p2.id_previa <> p.id_previa
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
                ) THEN 1 ELSE 0
            END AS tiene_correlativa_alumno
        FROM previas p
        INNER JOIN materias mat ON mat.id_materia = p.id_materia
        LEFT JOIN condicion con ON con.id_condicion = p.id_condicion
        LEFT JOIN curso ca ON ca.id_curso = p.cursando_id_curso
        LEFT JOIN division da ON da.id_division = p.cursando_id_division
        LEFT JOIN curso cm ON cm.id_curso = p.materia_id_curso
        LEFT JOIN division dm ON dm.id_division = p.materia_id_division
        INNER JOIN areas_materias am ON am.id_materia = p.id_materia AND am.activo = 1 AND am.id_area = ?
        LEFT JOIN areas ar ON ar.id_area = am.id_area
        LEFT JOIN catedras cat
            ON cat.id_catedra = (
                SELECT c2.id_catedra
                FROM catedras c2
                LEFT JOIN docentes d2 ON d2.id_docente = c2.id_docente
                LEFT JOIN cargos cargo2 ON cargo2.id_cargo = d2.id_cargo
                WHERE c2.id_materia = p.id_materia
                  AND c2.id_curso = p.materia_id_curso
                  AND c2.id_division = p.materia_id_division
                  AND c2.activo = 1
                ORDER BY
                    CASE
                        WHEN d2.activo = 1 AND (d2.id_cargo = 2 OR UPPER(TRIM(COALESCE(cargo2.cargo, ''))) = 'SUPLENTE') THEN 0
                        WHEN d2.activo = 1 AND d2.id_docente IS NOT NULL THEN 1
                        WHEN c2.id_docente IS NULL THEN 2
                        ELSE 3
                    END ASC,
                    c2.id_catedra ASC
                LIMIT 1
            )
        LEFT JOIN docentes doc ON doc.id_docente = cat.id_docente AND doc.activo = 1
        LEFT JOIN (
            SELECT tm.id_catedra, MIN(tm.id_taller) AS id_taller
            FROM talleres_materias tm
            INNER JOIN talleres ta ON ta.id_taller = tm.id_taller AND ta.activo = 1
            WHERE tm.activo = 1
              AND tm.id_catedra IS NOT NULL
            GROUP BY tm.id_catedra
        ) taller_map ON taller_map.id_catedra = cat.id_catedra
        WHERE p.inscripcion = 1
          AND p.activo = 1
          AND p.id_condicion = 3
          AND NOT EXISTS (SELECT 1 FROM mesas me_exist WHERE me_exist.id_previa = p.id_previa)
        ORDER BY p.alumno ASC, mat.materia ASC
        LIMIT " . max(1, min(1000, $limite));

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$idArea]);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_editar_mas_detalle_desde_previa(array $previa, int $numeroMesa): array
{
    $idPrevia = (int)($previa['id_previa'] ?? 0);
    $idDocente = (int)($previa['id_docente'] ?? 0);
    $dni = trim((string)($previa['dni'] ?? ''));
    $alumno = trim((string)($previa['alumno'] ?? ''));

    $docentes = [];
    if ($idDocente > 0) {
        $docentes[$idDocente] = trim((string)($previa['docente'] ?? ('Docente ' . $idDocente)));
    }

    $dnis = [];
    $dniNumeros = [];
    if ($dni !== '') {
        $dnis[$dni] = $alumno ?: $dni;
        $dniNumeros[$dni] = [$numeroMesa => true];
    }

    return [
        'numeros' => [$numeroMesa],
        'ids_mesa' => [],
        'ids_previa' => [$idPrevia],
        'docentes' => $docentes,
        'dnis' => $dnis,
        'dni_numeros' => $dniNumeros,
        'registros' => [[
            'id_mesa' => 0,
            'numero_mesa' => $numeroMesa,
            'id_previa' => $idPrevia,
            'id_docente' => $idDocente,
            'docente' => trim((string)($previa['docente'] ?? '')),
            'dni' => $dni,
            'alumno' => $alumno,
            'id_materia' => (int)($previa['id_materia'] ?? 0),
            'id_curso' => (int)($previa['materia_id_curso'] ?? 0),
            'materia' => trim((string)($previa['materia'] ?? '')),
            'tipo_mesa' => ((int)($previa['tiene_correlativa_alumno'] ?? 0) === 1) ? 'correlativa' : 'simple',
            'prioridad' => ((int)($previa['tiene_correlativa_alumno'] ?? 0) === 1) ? 2 : 0,
        ]],
    ];
}

function mesas_editar_mas_validar_previa_para_numero(PDO $pdo, int $numeroMesa, array $meta, array $previa): array
{
    $errores = [];
    $advertencias = [];

    $fechaMesa = trim((string)($meta['fecha_mesa'] ?? ''));
    $idTurno = (int)($meta['id_turno'] ?? 0);

    if ($fechaMesa === '' || $idTurno <= 0) {
        $errores[] = 'El número de mesa destino no tiene fecha y turno definidos.';
    }

    try {
        if ($fechaMesa !== '') {
            mesas_editar_normalizar_fecha(substr($fechaMesa, 0, 10));
        }
    } catch (Throwable $e) {
        $errores[] = $e->getMessage();
    }

    if ((int)($previa['id_catedra'] ?? 0) <= 0) {
        $errores[] = 'La previa no tiene cátedra activa para su materia, curso y división.';
    }

    if ((int)($previa['id_docente'] ?? 0) <= 0) {
        $errores[] = 'La previa no tiene docente activo asignado.';
    }

    if ((int)($previa['id_taller'] ?? 0) > 0) {
        $errores[] = 'La previa pertenece a un taller y debe armarse como mesa de taller exclusiva.';
    }

    if ((int)($previa['activo'] ?? 0) !== 1 || (int)($previa['inscripcion'] ?? 0) !== 1 || (int)($previa['id_condicion'] ?? 0) !== 3) {
        $errores[] = 'La previa no está activa, inscripta o no corresponde a condición previa.';
    }

    $stmtExiste = $pdo->prepare('SELECT numero_mesa FROM mesas WHERE id_previa = ? LIMIT 1');
    $stmtExiste->execute([(int)($previa['id_previa'] ?? 0)]);
    $numeroExistente = $stmtExiste->fetchColumn();
    if ($numeroExistente !== false && $numeroExistente !== null) {
        $errores[] = 'La previa ya está incluida en el armado, en la mesa N° ' . (int)$numeroExistente . '.';
    }

    if (count($errores) === 0) {
        $detalle = mesas_editar_mas_detalle_desde_previa($previa, $numeroMesa);
        $errores = array_merge($errores, mesas_editar_validar_docentes($pdo, $detalle, substr($fechaMesa, 0, 10), $idTurno));
        $errores = array_merge($errores, mesas_editar_validar_alumnos($pdo, $detalle, substr($fechaMesa, 0, 10), $idTurno));
        $errores = array_merge($errores, mesas_editar_validar_correlativas($pdo, $detalle, substr($fechaMesa, 0, 10), $idTurno));
    }

    return [
        'valido' => count($errores) === 0,
        'errores' => array_values(array_unique($errores)),
        'advertencias' => $advertencias,
    ];
}

function mesas_editar_mas_normalizar_previa_salida(array $previa, array $validacion): array
{
    return [
        'id_previa' => (int)($previa['id_previa'] ?? 0),
        'dni' => trim((string)($previa['dni'] ?? '')),
        'alumno' => trim((string)($previa['alumno'] ?? '')),
        'id_materia' => (int)($previa['id_materia'] ?? 0),
        'materia' => trim((string)($previa['materia'] ?? '')),
        'id_catedra' => $previa['id_catedra'] !== null ? (int)$previa['id_catedra'] : null,
        'id_docente' => $previa['id_docente'] !== null ? (int)$previa['id_docente'] : null,
        'docente' => trim((string)($previa['docente'] ?? '')),
        'id_area' => $previa['id_area'] !== null ? (int)$previa['id_area'] : null,
        'area' => trim((string)($previa['area'] ?? '')),
        'curso' => trim((string)(($previa['curso_alumno'] ?? '') . ' ' . ($previa['division_alumno'] ?? ''))),
        'curso_materia' => trim((string)(($previa['curso_materia'] ?? '') . ' ' . ($previa['division_materia'] ?? ''))),
        'anio' => (int)($previa['anio'] ?? 0),
        'tipo_mesa' => ((int)($previa['tiene_correlativa_alumno'] ?? 0) === 1) ? 'correlativa' : 'simple',
        'prioridad' => ((int)($previa['tiene_correlativa_alumno'] ?? 0) === 1) ? 2 : 0,
        'valido' => (bool)$validacion['valido'],
        'errores' => $validacion['errores'],
        'advertencias' => $validacion['advertencias'],
    ];
}

function mesas_editar_mas_obtener_previas_disponibles(PDO $pdo, int $numeroMesa): array
{
    $meta = mesas_editar_mas_obtener_meta_numero($pdo, $numeroMesa);
    if (!$meta) {
        throw new RuntimeException('No se encontró el número de mesa destino.');
    }

    $idArea = mesas_editar_mas_target_area($pdo, $numeroMesa, $meta);
    $previasBase = mesas_editar_mas_obtener_previas_base_por_area($pdo, $idArea);

    $disponibles = [];
    $descartadas = 0;

    foreach ($previasBase as $previa) {
        $validacion = mesas_editar_mas_validar_previa_para_numero($pdo, $numeroMesa, $meta, $previa);
        if (!$validacion['valido']) {
            $descartadas++;
            continue;
        }

        $disponibles[] = mesas_editar_mas_normalizar_previa_salida($previa, $validacion);
    }

    return [
        'numero_mesa' => $numeroMesa,
        'meta' => $meta,
        'id_area' => $idArea,
        'area' => trim((string)($meta['area'] ?? '')),
        'previas' => $disponibles,
        'cantidad' => count($disponibles),
        'descartadas_por_validacion' => $descartadas,
    ];
}

function mesas_editar_mas_recalcular_numero(PDO $pdo, int $numeroMesa): void
{
    $stmt = $pdo->prepare('SELECT COUNT(DISTINCT id_previa) FROM mesas WHERE numero_mesa = ?');
    $stmt->execute([$numeroMesa]);
    $cantidad = (int)$stmt->fetchColumn();

    if ($cantidad <= 0) {
        $stmtDelG = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = ?');
        $stmtDelG->execute([$numeroMesa]);
        $stmtDelN = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
        $stmtDelN->execute([$numeroMesa]);
        return;
    }

    $stmtArea = $pdo->prepare(''
        . 'SELECT MIN(am.id_area) AS id_area, MAX(me.tipo_mesa) AS tipo_mesa, MAX(me.prioridad) AS prioridad '
        . 'FROM mesas me '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
        . 'WHERE me.numero_mesa = ?'
    );
    $stmtArea->execute([$numeroMesa]);
    $meta = $stmtArea->fetch(PDO::FETCH_ASSOC) ?: [];

    $stmtG = $pdo->prepare('UPDATE mesas_grupos SET cantidad_alumnos = ?, id_area = COALESCE(?, id_area), tipo_mesa = COALESCE(?, tipo_mesa), prioridad = COALESCE(?, prioridad) WHERE numero_mesa = ?');
    $stmtG->execute([$cantidad, $meta['id_area'] ?? null, $meta['tipo_mesa'] ?? null, $meta['prioridad'] ?? null, $numeroMesa]);

    $stmtN = $pdo->prepare('UPDATE mesas_no_agrupadas SET cantidad_alumnos = ?, id_area = COALESCE(?, id_area), tipo_mesa = COALESCE(?, tipo_mesa), prioridad = COALESCE(?, prioridad) WHERE numero_mesa = ?');
    $stmtN->execute([$cantidad, $meta['id_area'] ?? null, $meta['tipo_mesa'] ?? null, $meta['prioridad'] ?? null, $numeroMesa]);
}

function mesas_editar_mas_agregar_previa(PDO $pdo, int $numeroMesa, int $idPrevia): array
{
    $meta = mesas_editar_mas_obtener_meta_numero($pdo, $numeroMesa);
    if (!$meta) {
        throw new RuntimeException('No se encontró el número de mesa destino.');
    }

    $idAreaDestino = mesas_editar_mas_target_area($pdo, $numeroMesa, $meta);
    $previa = mesas_editar_mas_obtener_previa_base($pdo, $idPrevia);
    if (!$previa) {
        throw new RuntimeException('No se encontró la previa solicitada.');
    }

    if ((int)($previa['id_area'] ?? 0) !== $idAreaDestino) {
        throw new InvalidArgumentException('La previa no pertenece al área de este número de mesa.');
    }

    $validacion = mesas_editar_mas_validar_previa_para_numero($pdo, $numeroMesa, $meta, $previa);
    if (!$validacion['valido']) {
        return [
            'agregada' => false,
            'validacion' => $validacion,
            'filas_insertadas' => 0,
        ];
    }

    $tipoMesa = ((int)($previa['tiene_correlativa_alumno'] ?? 0) === 1) ? 'correlativa' : 'simple';
    $prioridad = $tipoMesa === 'correlativa' ? 2 : 0;

    $stmt = $pdo->prepare(''
        . 'INSERT INTO mesas '
        . '    (numero_mesa, prioridad, tipo_mesa, id_taller, id_catedra, id_previa, id_docente, fecha_mesa, id_turno, estado, observacion) '
        . 'VALUES '
        . '    (?, ?, ?, NULL, ?, ?, ?, ?, ?, "borrador", NULL)'
    );
    $stmt->execute([
        $numeroMesa,
        $prioridad,
        $tipoMesa,
        (int)$previa['id_catedra'],
        (int)$previa['id_previa'],
        (int)$previa['id_docente'],
        substr((string)$meta['fecha_mesa'], 0, 10),
        (int)$meta['id_turno'],
    ]);

    $filas = $stmt->rowCount();
    mesas_editar_mas_recalcular_numero($pdo, $numeroMesa);

    return [
        'agregada' => true,
        'validacion' => $validacion,
        'filas_insertadas' => $filas,
        'numero_mesa' => $numeroMesa,
        'id_previa' => $idPrevia,
        'previa' => mesas_editar_mas_normalizar_previa_salida($previa, $validacion),
    ];
}
