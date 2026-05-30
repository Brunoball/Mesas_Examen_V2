<?php
// backend/modules/mesas/editar_mesas/persona/persona_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';

function mesas_editar_persona_int($valor, string $mensaje): int
{
    $numero = (int)($valor ?? 0);
    if ($numero <= 0) {
        throw new InvalidArgumentException($mensaje);
    }
    return $numero;
}

function mesas_editar_persona_fecha_formato(?string $fecha): ?string
{
    $fecha = trim((string)$fecha);
    if ($fecha === '') {
        return null;
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', substr($fecha, 0, 10));
    return $dt ? $dt->format('d/m/Y') : $fecha;
}

function mesas_editar_persona_obtener_meta_numero(PDO $pdo, int $numeroMesa): ?array
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

function mesas_editar_persona_obtener_previas_numero(PDO $pdo, int $numeroMesa): array
{
    $meta = mesas_editar_persona_obtener_meta_numero($pdo, $numeroMesa);
    if (!$meta) {
        throw new RuntimeException('No se encontró el número de mesa solicitado.');
    }

    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    MIN(me.id_mesa) AS id_mesa, '
        . '    GROUP_CONCAT(DISTINCT me.id_mesa ORDER BY me.id_mesa SEPARATOR ",") AS ids_mesa, '
        . '    me.numero_mesa, me.id_previa, '
        . '    MAX(me.tipo_mesa) AS tipo_mesa, MAX(me.prioridad) AS prioridad, MAX(me.id_taller) AS id_taller, '
        . '    p.dni, p.alumno, p.nota, p.anio, '
        . '    p.id_materia AS id_materia_previa, p.materia_id_curso, p.materia_id_division, '
        . '    GROUP_CONCAT(DISTINCT COALESCE(cat.id_materia, p.id_materia) ORDER BY COALESCE(cat.id_materia, p.id_materia) SEPARATOR ",") AS ids_materia, '
        . '    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ", ") AS materia, '
        . '    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ", ") AS docente, '
        . '    GROUP_CONCAT(DISTINCT me.id_docente ORDER BY me.id_docente SEPARATOR ",") AS ids_docente, '
        . '    MAX(ca.nombre_curso) AS curso_alumno, MAX(da.nombre_division) AS division_alumno, '
        . '    MAX(cm.nombre_curso) AS curso_materia, MAX(dm.nombre_division) AS division_materia, '
        . '    MAX(cond.condicion) AS condicion, '
        . '    MIN(am.id_area) AS id_area, MAX(ar.area) AS area '
        . 'FROM mesas me '
        . 'INNER JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'LEFT JOIN curso ca ON ca.id_curso = p.cursando_id_curso '
        . 'LEFT JOIN division da ON da.id_division = p.cursando_id_division '
        . 'LEFT JOIN curso cm ON cm.id_curso = p.materia_id_curso '
        . 'LEFT JOIN division dm ON dm.id_division = p.materia_id_division '
        . 'LEFT JOIN condicion cond ON cond.id_condicion = p.id_condicion '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
        . 'LEFT JOIN areas ar ON ar.id_area = am.id_area '
        . 'WHERE me.numero_mesa = ? '
        . 'GROUP BY me.numero_mesa, me.id_previa, p.dni, p.alumno, p.nota, p.anio, p.id_materia, p.materia_id_curso, p.materia_id_division '
        . 'ORDER BY p.alumno ASC, p.dni ASC'
    );
    $stmt->execute([$numeroMesa]);
    $previas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($previas as &$previa) {
        $previa['id_mesa'] = (int)($previa['id_mesa'] ?? 0);
        $previa['id_previa'] = (int)($previa['id_previa'] ?? 0);
        $previa['numero_mesa'] = (int)($previa['numero_mesa'] ?? 0);
        $previa['prioridad'] = (int)($previa['prioridad'] ?? 0);
        $previa['id_taller'] = $previa['id_taller'] !== null ? (int)$previa['id_taller'] : null;
        $previa['id_area'] = $previa['id_area'] !== null ? (int)$previa['id_area'] : null;
        $previa['curso'] = trim((string)(($previa['curso_alumno'] ?? '') . ' ' . ($previa['division_alumno'] ?? '')));
        $previa['curso_materia_texto'] = trim((string)(($previa['curso_materia'] ?? '') . ' ' . ($previa['division_materia'] ?? '')));
    }
    unset($previa);

    return [
        'numero_mesa' => $numeroMesa,
        'meta' => $meta,
        'previas' => $previas,
        'cantidad' => count($previas),
    ];
}

function mesas_editar_persona_obtener_filas_previa_en_numero(PDO $pdo, int $numeroMesa, int $idPrevia): array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    me.id_mesa, me.numero_mesa, me.id_previa, me.id_docente, me.id_catedra, me.tipo_mesa, me.prioridad, '
        . '    p.dni, p.alumno, COALESCE(cat.id_materia, p.id_materia) AS id_materia, '
        . '    COALESCE(cat.id_curso, p.materia_id_curso) AS id_curso, '
        . '    mat.materia, doc.docente '
        . 'FROM mesas me '
        . 'INNER JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'WHERE me.numero_mesa = ? AND me.id_previa = ? '
        . 'ORDER BY me.id_mesa ASC'
    );
    $stmt->execute([$numeroMesa, $idPrevia]);
    $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($filas) === 0) {
        throw new RuntimeException('No se encontró esa previa dentro del número de mesa indicado.');
    }

    return $filas;
}

function mesas_editar_persona_area_previa(PDO $pdo, array $filas): ?int
{
    $idsMateria = [];
    foreach ($filas as $fila) {
        $idMateria = (int)($fila['id_materia'] ?? 0);
        if ($idMateria > 0) {
            $idsMateria[$idMateria] = $idMateria;
        }
    }

    if (count($idsMateria) === 0) {
        return null;
    }

    $placeholders = implode(',', array_fill(0, count($idsMateria), '?'));
    $stmt = $pdo->prepare("SELECT id_area FROM areas_materias WHERE activo = 1 AND id_materia IN ({$placeholders}) ORDER BY id_area ASC LIMIT 1");
    $stmt->execute(array_values($idsMateria));
    $idArea = $stmt->fetchColumn();

    return $idArea !== false && $idArea !== null ? (int)$idArea : null;
}

function mesas_editar_persona_detalle_numeros(PDO $pdo, array $numeros): array
{
    $numeros = mesas_editar_normalizar_lista_numeros($numeros);
    if (count($numeros) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($numeros), '?'));
    $stmt = $pdo->prepare(""
        . "SELECT "
        . "    me.numero_mesa, "
        . "    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ', ') AS materia, "
        . "    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ', ') AS docente, "
        . "    COUNT(DISTINCT me.id_previa) AS cantidad_previas "
        . "FROM mesas me "
        . "LEFT JOIN previas p ON p.id_previa = me.id_previa "
        . "LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra "
        . "LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) "
        . "LEFT JOIN docentes doc ON doc.id_docente = me.id_docente "
        . "WHERE me.numero_mesa IN ({$placeholders}) "
        . "GROUP BY me.numero_mesa"
    );
    $stmt->execute($numeros);

    $mapa = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $mapa[(int)$row['numero_mesa']] = $row;
    }

    return $mapa;
}

function mesas_editar_persona_armar_detalle_movimiento(array $filas, int $numeroOrigen): array
{
    $detalle = [
        'numeros' => [$numeroOrigen],
        'ids_mesa' => [],
        'ids_previa' => [],
        'docentes' => [],
        'dnis' => [],
        'registros' => [],
        'dni_numeros' => [],
    ];

    foreach ($filas as $fila) {
        $idMesa = (int)($fila['id_mesa'] ?? 0);
        $idPrevia = (int)($fila['id_previa'] ?? 0);
        $idDocente = (int)($fila['id_docente'] ?? 0);
        $dni = trim((string)($fila['dni'] ?? ''));
        $numeroMesa = (int)($fila['numero_mesa'] ?? $numeroOrigen);

        if ($idMesa > 0) {
            $detalle['ids_mesa'][] = $idMesa;
        }
        if ($idPrevia > 0) {
            $detalle['ids_previa'][$idPrevia] = $idPrevia;
        }
        if ($idDocente > 0) {
            $detalle['docentes'][$idDocente] = trim((string)($fila['docente'] ?? 'Docente ' . $idDocente));
        }
        if ($dni !== '') {
            $detalle['dnis'][$dni] = trim((string)($fila['alumno'] ?? $dni));
            $detalle['dni_numeros'][$dni][$numeroMesa] = true;
        }

        $detalle['registros'][] = [
            'id_mesa' => $idMesa,
            'numero_mesa' => $numeroMesa,
            'id_previa' => $idPrevia,
            'id_docente' => $idDocente,
            'docente' => trim((string)($fila['docente'] ?? '')),
            'dni' => $dni,
            'alumno' => trim((string)($fila['alumno'] ?? '')),
            'id_materia' => (int)($fila['id_materia'] ?? 0),
            'id_curso' => (int)($fila['id_curso'] ?? 0),
            'materia' => trim((string)($fila['materia'] ?? '')),
            'tipo_mesa' => (string)($fila['tipo_mesa'] ?? 'simple'),
            'prioridad' => (int)($fila['prioridad'] ?? 0),
        ];
    }

    $detalle['ids_previa'] = array_values($detalle['ids_previa']);

    return $detalle;
}


function mesas_editar_persona_obtener_modelo_destino(PDO $pdo, int $numeroDestino, array $filasOrigen): array
{
    $idsMateriaOrigen = [];
    $idsCursoOrigen = [];

    foreach ($filasOrigen as $fila) {
        $idMateria = (int)($fila['id_materia'] ?? 0);
        $idCurso = (int)($fila['id_curso'] ?? 0);

        if ($idMateria > 0) {
            $idsMateriaOrigen[$idMateria] = true;
        }

        if ($idCurso > 0) {
            $idsCursoOrigen[$idCurso] = true;
        }
    }

    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    me.id_mesa, me.numero_mesa, me.id_previa, me.id_docente, me.id_catedra, '
        . '    me.tipo_mesa, me.prioridad, me.id_taller, '
        . '    COALESCE(cat.id_materia, p.id_materia) AS id_materia, '
        . '    COALESCE(cat.id_curso, p.materia_id_curso) AS id_curso, '
        . '    mat.materia, doc.docente '
        . 'FROM mesas me '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'WHERE me.numero_mesa = ? '
        . 'ORDER BY me.id_mesa ASC'
    );
    $stmt->execute([$numeroDestino]);
    $filasDestino = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($filasDestino) === 0) {
        throw new RuntimeException('No se encontraron registros base dentro del número de mesa destino.');
    }

    $mejor = null;
    $mejorScore = PHP_INT_MAX;

    foreach ($filasDestino as $fila) {
        $idMateria = (int)($fila['id_materia'] ?? 0);
        $idCurso = (int)($fila['id_curso'] ?? 0);
        $idDocente = (int)($fila['id_docente'] ?? 0);
        $idCatedra = (int)($fila['id_catedra'] ?? 0);

        $score = 0;

        if ($idMateria <= 0 || !isset($idsMateriaOrigen[$idMateria])) {
            $score += 100;
        }

        if ($idCurso <= 0 || !isset($idsCursoOrigen[$idCurso])) {
            $score += 10;
        }

        if ($idDocente <= 0) {
            $score += 1000;
        }

        if ($idCatedra <= 0) {
            $score += 1000;
        }

        if ($score < $mejorScore) {
            $mejor = $fila;
            $mejorScore = $score;
        }
    }

    if (!$mejor || (int)($mejor['id_docente'] ?? 0) <= 0 || (int)($mejor['id_catedra'] ?? 0) <= 0) {
        throw new RuntimeException('El número de mesa destino no tiene docente/cátedra válida para recibir la previa.');
    }

    $tipoMesa = trim((string)($mejor['tipo_mesa'] ?? 'simple'));
    if (!in_array($tipoMesa, ['simple', 'taller', 'correlativa'], true)) {
        $tipoMesa = 'simple';
    }

    return [
        'id_mesa_modelo' => (int)($mejor['id_mesa'] ?? 0),
        'numero_mesa' => $numeroDestino,
        'id_docente' => (int)$mejor['id_docente'],
        'docente' => trim((string)($mejor['docente'] ?? ('Docente ' . (int)$mejor['id_docente']))),
        'id_catedra' => (int)$mejor['id_catedra'],
        'id_materia' => (int)($mejor['id_materia'] ?? 0),
        'id_curso' => (int)($mejor['id_curso'] ?? 0),
        'materia' => trim((string)($mejor['materia'] ?? '')),
        'tipo_mesa' => $tipoMesa,
        'prioridad' => (int)($mejor['prioridad'] ?? 0),
        'id_taller' => $mejor['id_taller'] !== null ? (int)$mejor['id_taller'] : null,
    ];
}

function mesas_editar_persona_armar_detalle_movimiento_destino(array $filas, int $numeroOrigen, int $numeroDestino, array $modeloDestino): array
{
    $filaBase = $filas[0] ?? [];
    $idPrevia = (int)($filaBase['id_previa'] ?? 0);
    $dni = trim((string)($filaBase['dni'] ?? ''));
    $alumno = trim((string)($filaBase['alumno'] ?? ''));
    $idDocente = (int)($modeloDestino['id_docente'] ?? 0);
    $docente = trim((string)($modeloDestino['docente'] ?? ('Docente ' . $idDocente)));

    $detalle = [
        // Se excluye el número origen porque la previa sale de ahí, y el número destino porque entra dentro de ese mismo número.
        // Esto evita confundir el movimiento individual de una previa con el movimiento completo del número de mesa.
        'numeros' => array_values(array_unique([$numeroOrigen, $numeroDestino])),
        'ids_mesa' => [],
        'ids_previa' => $idPrevia > 0 ? [$idPrevia] : [],
        'docentes' => $idDocente > 0 ? [$idDocente => $docente] : [],
        'dnis' => $dni !== '' ? [$dni => ($alumno ?: $dni)] : [],
        'registros' => [],
        'dni_numeros' => $dni !== '' ? [$dni => [$numeroDestino => true]] : [],
    ];

    $detalle['registros'][] = [
        'id_mesa' => 0,
        'numero_mesa' => $numeroDestino,
        'id_previa' => $idPrevia,
        'id_docente' => $idDocente,
        'docente' => $docente,
        'dni' => $dni,
        'alumno' => $alumno,
        'id_materia' => (int)($modeloDestino['id_materia'] ?? 0),
        'id_curso' => (int)($modeloDestino['id_curso'] ?? 0),
        'materia' => trim((string)($modeloDestino['materia'] ?? '')),
        'tipo_mesa' => (string)($modeloDestino['tipo_mesa'] ?? 'simple'),
        'prioridad' => (int)($modeloDestino['prioridad'] ?? 0),
    ];

    return $detalle;
}

function mesas_editar_persona_validar_movimiento(PDO $pdo, int $numeroOrigen, int $idPrevia, int $numeroDestino): array
{
    if ($numeroOrigen === $numeroDestino) {
        return [
            'valido' => false,
            'errores' => ['La previa ya pertenece a ese número de mesa.'],
            'advertencias' => [],
        ];
    }

    $filas = mesas_editar_persona_obtener_filas_previa_en_numero($pdo, $numeroOrigen, $idPrevia);
    $metaDestino = mesas_editar_persona_obtener_meta_numero($pdo, $numeroDestino);
    if (!$metaDestino) {
        throw new RuntimeException('No se encontró el número de mesa destino.');
    }

    $fechaDestino = trim((string)($metaDestino['fecha_mesa'] ?? ''));
    $idTurnoDestino = (int)($metaDestino['id_turno'] ?? 0);
    $idAreaOrigen = mesas_editar_persona_area_previa($pdo, $filas);
    $idAreaDestino = $metaDestino['id_area'] !== null ? (int)$metaDestino['id_area'] : 0;
    if ($fechaDestino === '' || $idTurnoDestino <= 0) {
        return [
            'valido' => false,
            'errores' => ['La mesa destino no tiene fecha y turno definidos.'],
            'advertencias' => [],
        ];
    }

    $errores = [];
    $advertencias = [];

    if (mesas_editar_debe_respetar_area($pdo)
        && $idAreaOrigen !== null
        && $idAreaOrigen > 0
        && $idAreaDestino > 0
        && $idAreaOrigen !== $idAreaDestino
    ) {
        $errores[] = 'La mesa destino no pertenece al área de esta previa.';
    }

    $modeloDestino = mesas_editar_persona_obtener_modelo_destino($pdo, $numeroDestino, $filas);
    $detalle = mesas_editar_persona_armar_detalle_movimiento_destino($filas, $numeroOrigen, $numeroDestino, $modeloDestino);

    $errores = array_merge($errores, mesas_editar_validar_docentes($pdo, $detalle, $fechaDestino, $idTurnoDestino));
    $errores = array_merge($errores, mesas_editar_validar_correlativas($pdo, $detalle, $fechaDestino, $idTurnoDestino));

    $dni = trim((string)($filas[0]['dni'] ?? ''));
    if ($dni !== '') {
        $stmtChoqueAlumno = $pdo->prepare(''
            . 'SELECT DISTINCT me.numero_mesa, p.alumno '
            . 'FROM mesas me '
            . 'INNER JOIN previas p ON p.id_previa = me.id_previa '
            . 'WHERE p.dni = ? '
            . '  AND me.fecha_mesa = ? '
            . '  AND me.id_turno = ? '
            . '  AND NOT (me.numero_mesa = ? AND me.id_previa = ?) '
            . 'ORDER BY me.numero_mesa ASC'
        );
        $stmtChoqueAlumno->execute([$dni, $fechaDestino, $idTurnoDestino, $numeroOrigen, $idPrevia]);
        foreach ($stmtChoqueAlumno->fetchAll(PDO::FETCH_ASSOC) as $choque) {
            $errores[] = 'El alumno ' . trim((string)($choque['alumno'] ?? $dni)) . ' ya tiene la mesa N° ' . (int)$choque['numero_mesa'] . ' en ese mismo turno.';
        }
    }

    $stmtDuplicada = $pdo->prepare('SELECT COUNT(*) FROM mesas WHERE numero_mesa = ? AND id_previa = ?');
    $stmtDuplicada->execute([$numeroDestino, $idPrevia]);
    if ((int)$stmtDuplicada->fetchColumn() > 0) {
        $errores[] = 'La previa seleccionada ya existe dentro del número de mesa destino.';
    }

    $stmtDuplicadaCatedra = $pdo->prepare(''
        . 'SELECT COUNT(*) '
        . 'FROM mesas '
        . 'WHERE id_previa = ? '
        . '  AND id_catedra = ? '
        . '  AND fecha_mesa = ? '
        . '  AND id_turno = ? '
        . '  AND NOT (numero_mesa = ? AND id_previa = ?)'
    );
    $stmtDuplicadaCatedra->execute([
        $idPrevia,
        (int)$modeloDestino['id_catedra'],
        $fechaDestino,
        $idTurnoDestino,
        $numeroOrigen,
        $idPrevia,
    ]);
    if ((int)$stmtDuplicadaCatedra->fetchColumn() > 0) {
        $errores[] = 'La previa seleccionada ya está vinculada a esa cátedra en la misma fecha y turno.';
    }

    return [
        'valido' => count($errores) === 0,
        'errores' => array_values(array_unique($errores)),
        'advertencias' => $advertencias,
        'meta_destino' => $metaDestino,
        'modelo_destino' => $modeloDestino,
    ];
}

function mesas_editar_persona_obtener_destinos(PDO $pdo, int $numeroOrigen, int $idPrevia): array
{
    $filas = mesas_editar_persona_obtener_filas_previa_en_numero($pdo, $numeroOrigen, $idPrevia);
    $idArea = mesas_editar_persona_area_previa($pdo, $filas);

    $debeRespetarArea = mesas_editar_debe_respetar_area($pdo);
    if ($debeRespetarArea && ($idArea === null || $idArea <= 0)) {
        throw new RuntimeException('No se pudo resolver el área de la materia de esta previa.');
    }

    $area = '';
    if ($idArea !== null && $idArea > 0) {
        $stmtArea = $pdo->prepare('SELECT area FROM areas WHERE id_area = ? LIMIT 1');
        $stmtArea->execute([$idArea]);
        $area = (string)($stmtArea->fetchColumn() ?: '');
    }

    $whereGrupo = $debeRespetarArea ? 'g.id_area = ? AND g.numero_mesa <> ?' : 'g.numero_mesa <> ?';
    $whereNoAgrupada = $debeRespetarArea ? 'n.id_area = ? AND n.numero_mesa <> ?' : 'n.numero_mesa <> ?';
    $params = $debeRespetarArea ? [$idArea, $numeroOrigen, $idArea, $numeroOrigen] : [$numeroOrigen, $numeroOrigen];

    $stmt = $pdo->prepare(''
        . 'SELECT * FROM ( '
        . '    SELECT g.numero_mesa, g.numero_grupo, NULL AS id_no_agrupada, g.fecha_mesa, DATE_FORMAT(g.fecha_mesa, "%d/%m/%Y") AS fecha, g.id_turno, g.hora, t.turno, g.id_area, a.area, "grupo" AS ubicacion '
        . '    FROM mesas_grupos g '
        . '    LEFT JOIN turnos t ON t.id_turno = g.id_turno '
        . '    LEFT JOIN areas a ON a.id_area = g.id_area '
        . '    WHERE ' . $whereGrupo . ' '
        . '    UNION ALL '
        . '    SELECT n.numero_mesa, NULL AS numero_grupo, n.id AS id_no_agrupada, n.fecha_mesa, DATE_FORMAT(n.fecha_mesa, "%d/%m/%Y") AS fecha, n.id_turno, n.hora, t.turno, n.id_area, a.area, "no_agrupada" AS ubicacion '
        . '    FROM mesas_no_agrupadas n '
        . '    LEFT JOIN turnos t ON t.id_turno = n.id_turno '
        . '    LEFT JOIN areas a ON a.id_area = n.id_area '
        . '    WHERE ' . $whereNoAgrupada . ' '
        . ') destinos '
        . 'ORDER BY fecha_mesa ASC, id_turno ASC, numero_mesa ASC'
    );
    $stmt->execute($params);
    $destinosBase = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $numeros = array_map(static fn($row) => (int)$row['numero_mesa'], $destinosBase);
    $detalles = mesas_editar_persona_detalle_numeros($pdo, $numeros);

    $destinos = [];
    foreach ($destinosBase as $row) {
        $numeroDestino = (int)$row['numero_mesa'];
        $validacion = mesas_editar_persona_validar_movimiento($pdo, $numeroOrigen, $idPrevia, $numeroDestino);
        $detalle = $detalles[$numeroDestino] ?? [];

        $destinos[] = [
            'numero_mesa' => $numeroDestino,
            'numero_grupo' => $row['numero_grupo'] !== null ? (int)$row['numero_grupo'] : null,
            'id_no_agrupada' => $row['id_no_agrupada'] !== null ? (int)$row['id_no_agrupada'] : null,
            'ubicacion' => $row['ubicacion'],
            'fecha_mesa' => $row['fecha_mesa'],
            'fecha' => $row['fecha'],
            'id_turno' => $row['id_turno'] !== null ? (int)$row['id_turno'] : null,
            'turno' => $row['turno'],
            'hora' => $row['hora'],
            'id_area' => $row['id_area'] !== null ? (int)$row['id_area'] : null,
            'area' => $row['area'],
            'materia' => $detalle['materia'] ?? '',
            'docente' => $detalle['docente'] ?? '',
            'cantidad_previas' => (int)($detalle['cantidad_previas'] ?? 0),
            'valido' => (bool)$validacion['valido'],
            'errores' => $validacion['errores'],
            'advertencias' => $validacion['advertencias'],
        ];
    }

    return [
        'numero_origen' => $numeroOrigen,
        'id_previa' => $idPrevia,
        'id_area' => $idArea,
        'area' => $area,
        'previa' => $filas[0],
        'destinos' => $destinos,
    ];
}

function mesas_editar_persona_recalcular_numero(PDO $pdo, int $numeroMesa): void
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

function mesas_editar_persona_eliminar_previa(PDO $pdo, int $numeroMesa, int $idPrevia): int
{
    mesas_editar_persona_obtener_filas_previa_en_numero($pdo, $numeroMesa, $idPrevia);

    $stmt = $pdo->prepare('DELETE FROM mesas WHERE numero_mesa = ? AND id_previa = ?');
    $stmt->execute([$numeroMesa, $idPrevia]);
    $eliminadas = $stmt->rowCount();

    mesas_editar_persona_recalcular_numero($pdo, $numeroMesa);
    return $eliminadas;
}

function mesas_editar_persona_mover_previa(PDO $pdo, int $numeroOrigen, int $idPrevia, int $numeroDestino): array
{
    $validacion = mesas_editar_persona_validar_movimiento($pdo, $numeroOrigen, $idPrevia, $numeroDestino);
    if (!$validacion['valido']) {
        return [
            'movido' => false,
            'validacion' => $validacion,
            'filas_actualizadas' => 0,
        ];
    }

    $metaDestino = $validacion['meta_destino'];
    $modeloDestino = $validacion['modelo_destino'];

    $stmtDelete = $pdo->prepare('DELETE FROM mesas WHERE numero_mesa = ? AND id_previa = ?');
    $stmtDelete->execute([$numeroOrigen, $idPrevia]);
    $eliminadas = $stmtDelete->rowCount();

    if ($eliminadas <= 0) {
        throw new RuntimeException('No se pudo quitar la previa del número de mesa origen.');
    }

    $stmtInsert = $pdo->prepare(''
        . 'INSERT INTO mesas '
        . '    (numero_mesa, prioridad, tipo_mesa, id_taller, id_catedra, id_previa, id_docente, fecha_mesa, id_turno, estado, observacion) '
        . 'VALUES '
        . '    (?, ?, ?, ?, ?, ?, ?, ?, ?, "borrador", NULL)'
    );
    $stmtInsert->execute([
        $numeroDestino,
        (int)$modeloDestino['prioridad'],
        (string)$modeloDestino['tipo_mesa'],
        $modeloDestino['id_taller'],
        (int)$modeloDestino['id_catedra'],
        $idPrevia,
        (int)$modeloDestino['id_docente'],
        substr((string)$metaDestino['fecha_mesa'], 0, 10),
        (int)$metaDestino['id_turno'],
    ]);

    $insertadas = $stmtInsert->rowCount();
    mesas_editar_persona_recalcular_numero($pdo, $numeroOrigen);
    mesas_editar_persona_recalcular_numero($pdo, $numeroDestino);

    return [
        'movido' => true,
        'modo' => 'previa_individual',
        'validacion' => $validacion,
        'filas_eliminadas_origen' => $eliminadas,
        'filas_insertadas_destino' => $insertadas,
        'filas_actualizadas' => $insertadas,
        'numero_origen' => $numeroOrigen,
        'numero_destino' => $numeroDestino,
        'docente_destino' => $modeloDestino['docente'],
        'id_docente_destino' => $modeloDestino['id_docente'],
        'id_catedra_destino' => $modeloDestino['id_catedra'],
    ];
}
