<?php
// backend/modules/mesas/edicion_por_docente/agregar_numero/agregar_numero_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';
require_once __DIR__ . '/../mas/mas_helpers.php';

function mesas_editar_docentes_agregar_numero_int($valor, string $mensaje): int
{
    $numero = (int)($valor ?? 0);
    if ($numero <= 0) {
        throw new InvalidArgumentException($mensaje);
    }
    return $numero;
}

function mesas_editar_docentes_agregar_numero_fecha_texto(?string $fecha): string
{
    $texto = trim((string)$fecha);
    if ($texto === '') {
        return '-';
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', substr($texto, 0, 10));
    return $dt ? $dt->format('d/m/Y') : $texto;
}

function mesas_editar_docentes_agregar_numero_obtener_grupo_destino(PDO $pdo, int $numeroGrupo): ?array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    g.numero_grupo, '
        . '    MIN(g.fecha_mesa) AS fecha_mesa, '
        . '    DATE_FORMAT(MIN(g.fecha_mesa), "%d/%m/%Y") AS fecha, '
        . '    MIN(g.id_turno) AS id_turno, '
        . '    MIN(g.hora) AS hora, '
        . '    MAX(t.turno) AS turno, '
        . '    MIN(g.id_area) AS id_area, '
        . '    MAX(a.area) AS area, '
        . '    COUNT(*) AS cantidad_numeros, '
        . '    SUM(g.cantidad_alumnos) AS cantidad_alumnos '
        . 'FROM mesas_grupos g '
        . 'LEFT JOIN turnos t ON t.id_turno = g.id_turno '
        . 'LEFT JOIN areas a ON a.id_area = g.id_area '
        . 'WHERE g.numero_grupo = ? '
        . 'GROUP BY g.numero_grupo '
        . 'LIMIT 1'
    );
    $stmt->execute([$numeroGrupo]);
    $grupo = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$grupo) {
        return null;
    }

    $grupo = mesas_editar_docentes_aplicar_area_canonica_a_fila_grupo($pdo, $grupo);

    $grupo['numero_grupo'] = (int)$grupo['numero_grupo'];
    $grupo['id_grupo'] = (int)$grupo['numero_grupo'];
    $grupo['id_turno'] = (int)$grupo['id_turno'];
    $grupo['id_area'] = $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null;
    $grupo['cantidad_numeros'] = (int)$grupo['cantidad_numeros'];
    $grupo['cantidad_alumnos'] = (int)$grupo['cantidad_alumnos'];
    $grupo['numeros'] = mesas_editar_docentes_agregar_numero_obtener_numeros_grupo($pdo, $numeroGrupo);

    $esTaller = mesas_editar_docentes_grupo_es_taller_por_numeros($grupo['numeros'], $grupo);
    $capacidad = mesas_editar_docentes_capacidad_slots_calcular(
        $grupo['cantidad_numeros'],
        $esTaller,
        mesas_editar_docentes_slots_extra_obtener($pdo, $numeroGrupo)
    );

    return array_merge($grupo, $capacidad);
}

function mesas_editar_docentes_agregar_numero_obtener_numeros_grupo(PDO $pdo, int $numeroGrupo): array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    g.numero_mesa, g.orden, g.tipo_mesa, g.prioridad, g.cantidad_alumnos, '
        . '    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ", ") AS materia, '
        . '    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ", ") AS docente '
        . 'FROM mesas_grupos g '
        . 'LEFT JOIN mesas me ON me.numero_mesa = g.numero_mesa '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'WHERE g.numero_grupo = ? '
        . 'GROUP BY g.numero_mesa, g.orden, g.tipo_mesa, g.prioridad, g.cantidad_alumnos '
        . 'ORDER BY g.orden ASC, g.numero_mesa ASC'
    );
    $stmt->execute([$numeroGrupo]);

    return array_map(static function (array $row): array {
        return [
            'numero_mesa' => (int)$row['numero_mesa'],
            'orden' => (int)$row['orden'],
            'tipo_mesa' => trim((string)($row['tipo_mesa'] ?? 'simple')) ?: 'simple',
            'prioridad' => (int)($row['prioridad'] ?? 0),
            'cantidad_alumnos' => (int)($row['cantidad_alumnos'] ?? 0),
            'materia' => trim((string)($row['materia'] ?? '')),
            'docente' => trim((string)($row['docente'] ?? '')),
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function mesas_editar_docentes_agregar_numero_siguiente_numero(PDO $pdo): int
{
    $stmt = $pdo->query(''
        . 'SELECT COALESCE(MAX(max_numero), 0) + 1 AS siguiente '
        . 'FROM ( '
        . '    SELECT MAX(numero_mesa) AS max_numero FROM mesas '
        . '    UNION ALL SELECT MAX(numero_mesa) AS max_numero FROM mesas_grupos '
        . '    UNION ALL SELECT MAX(numero_mesa) AS max_numero FROM mesas_no_agrupadas '
        . ') x'
    );

    return max(1, (int)$stmt->fetchColumn());
}

function mesas_editar_docentes_agregar_numero_resumen_numero(PDO $pdo, int $numeroMesa): ?array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    me.numero_mesa, '
        . '    MAX(me.tipo_mesa) AS tipo_mesa, '
        . '    MAX(me.prioridad) AS prioridad, '
        . '    COUNT(DISTINCT me.id_previa) AS cantidad_alumnos, '
        . '    MIN(am.id_area) AS id_area, '
        . '    MAX(a.area) AS area, '
        . '    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ", ") AS materia, '
        . '    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ", ") AS docente '
        . 'FROM mesas me '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
        . 'LEFT JOIN areas a ON a.id_area = am.id_area '
        . 'WHERE me.numero_mesa = ? '
        . 'GROUP BY me.numero_mesa '
        . 'LIMIT 1'
    );
    $stmt->execute([$numeroMesa]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        return null;
    }

    return [
        'numero_mesa' => (int)$row['numero_mesa'],
        'tipo_mesa' => trim((string)($row['tipo_mesa'] ?? 'simple')) ?: 'simple',
        'prioridad' => (int)($row['prioridad'] ?? 0),
        'cantidad_alumnos' => (int)($row['cantidad_alumnos'] ?? 0),
        'id_area' => $row['id_area'] !== null ? (int)$row['id_area'] : null,
        'area' => trim((string)($row['area'] ?? '')),
        'materia' => trim((string)($row['materia'] ?? '')),
        'docente' => trim((string)($row['docente'] ?? '')),
    ];
}


function mesas_editar_docentes_agregar_numero_validar_choques_reales_slot(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno): array
{
    $errores = [];

    // Choque interno dentro del grupo destino + número candidato:
    // un mismo alumno no puede quedar dos veces dentro del mismo grupo/turno.
    foreach (($detalle['dni_numeros'] ?? []) as $dni => $numerosMap) {
        if (count($numerosMap) > 1) {
            $alumno = $detalle['dnis'][$dni] ?? $dni;
            $errores[] = 'El alumno ' . $alumno . ' aparece en más de un número dentro de este mismo grupo. No puede rendir dos mesas en el mismo turno.';
        }
    }

    $numerosExcluir = array_values(array_filter(array_map('intval', $detalle['numeros'] ?? []), static fn ($n) => $n > 0));
    if (count($numerosExcluir) === 0) {
        return $errores;
    }

    $phNumeros = implode(',', array_fill(0, count($numerosExcluir), '?'));

    // Importante para el + de "no agrupadas": una mesa no agrupada se considera libre para mover.
    // Por eso los choques se validan únicamente contra mesas que YA están dentro de mesas_grupos
    // en la fecha/turno destino. No se toma la fecha/turno vieja guardada en mesas_no_agrupadas.
    $idsDocentes = array_values(array_filter(array_map('intval', array_keys($detalle['docentes'] ?? [])), static fn ($id) => $id > 0));
    if (count($idsDocentes) > 0) {
        $phDocentes = implode(',', array_fill(0, count($idsDocentes), '?'));
        $stmt = $pdo->prepare(""
            . "SELECT DISTINCT g.numero_mesa, me.id_docente, d.docente\n"
            . "FROM mesas_grupos g\n"
            . "INNER JOIN mesas me ON me.numero_mesa = g.numero_mesa\n"
            . "LEFT JOIN docentes d ON d.id_docente = me.id_docente\n"
            . "WHERE g.fecha_mesa = ?\n"
            . "  AND g.id_turno = ?\n"
            . "  AND me.id_docente IN ({$phDocentes})\n"
            . "  AND g.numero_mesa NOT IN ({$phNumeros})\n"
            . "ORDER BY d.docente ASC, g.numero_mesa ASC"
        );
        $stmt->execute(array_merge([$fechaMesa, $idTurno], $idsDocentes, $numerosExcluir));

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $choque) {
            $errores[] = 'El docente ' . trim((string)($choque['docente'] ?? ('ID ' . $choque['id_docente']))) . ' ya está asignado en la mesa N° ' . (int)$choque['numero_mesa'] . ' para ese mismo turno.';
        }
    }

    $dnis = array_keys($detalle['dnis'] ?? []);
    $dnis = array_values(array_filter(array_map(static fn ($dni) => trim((string)$dni), $dnis), static fn ($dni) => $dni !== ''));
    if (count($dnis) > 0) {
        $phDnis = implode(',', array_fill(0, count($dnis), '?'));
        $stmt = $pdo->prepare(""
            . "SELECT DISTINCT p.dni, p.alumno, g.numero_mesa\n"
            . "FROM mesas_grupos g\n"
            . "INNER JOIN mesas me ON me.numero_mesa = g.numero_mesa\n"
            . "INNER JOIN previas p ON p.id_previa = me.id_previa\n"
            . "WHERE g.fecha_mesa = ?\n"
            . "  AND g.id_turno = ?\n"
            . "  AND p.dni IN ({$phDnis})\n"
            . "  AND g.numero_mesa NOT IN ({$phNumeros})\n"
            . "ORDER BY p.alumno ASC, g.numero_mesa ASC"
        );
        $stmt->execute(array_merge([$fechaMesa, $idTurno], $dnis, $numerosExcluir));

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $choque) {
            $errores[] = 'El alumno ' . trim((string)($choque['alumno'] ?? $choque['dni'])) . ' ya tiene la mesa N° ' . (int)$choque['numero_mesa'] . ' en ese mismo turno.';
        }
    }

    return $errores;
}

function mesas_editar_docentes_agregar_numero_validar_numero_en_grupo(PDO $pdo, int $numeroMesa, array $grupoDestino, array $opciones = []): array
{
    $errores = [];
    $advertencias = [];

    // En el armado por indisponibilidad docente el área es secundaria: no bloquea.
    // En el armado por área sí se respeta como restricción dura.
    $validarSoloChoquesSlot = !empty($opciones['solo_choques_slot']);
    $esArmadoDocentes = mesas_editar_docentes_es_armado_por_docentes($pdo);
    $ignorarArea = $esArmadoDocentes || !empty($opciones['ignorar_area']);

    $numeroGrupo = (int)($grupoDestino['numero_grupo'] ?? 0);
    $fechaDestino = substr((string)($grupoDestino['fecha_mesa'] ?? ''), 0, 10);
    $idTurnoDestino = (int)($grupoDestino['id_turno'] ?? 0);
    $cantidadDestino = (int)($grupoDestino['cantidad_numeros'] ?? 0);

    if ($numeroGrupo <= 0) {
        $errores[] = 'El grupo destino no es válido.';
    }

    $capacidadDestino = (int)($grupoDestino['capacidad_slots'] ?? 4);
    if ($cantidadDestino >= $capacidadDestino) {
        $errores[] = 'El grupo destino no tiene slots libres. Habilitá un nuevo slot desde edición para poder agregar otro número.';
    }

    try {
        if ($fechaDestino !== '') {
            mesas_editar_docentes_normalizar_fecha($fechaDestino);
        } else {
            $errores[] = 'El grupo destino no tiene fecha definida.';
        }
    } catch (Throwable $e) {
        $errores[] = $e->getMessage();
    }

    if ($idTurnoDestino <= 0) {
        $errores[] = 'El grupo destino no tiene turno definido.';
    }

    $numerosGrupo = array_map(static fn ($item) => (int)($item['numero_mesa'] ?? 0), $grupoDestino['numeros'] ?? []);
    $numerosGrupo = array_values(array_filter($numerosGrupo, static fn ($n) => $n > 0));

    if (in_array($numeroMesa, $numerosGrupo, true)) {
        $errores[] = 'El número de mesa ya pertenece a este grupo.';
    }

    $resumen = mesas_editar_docentes_agregar_numero_resumen_numero($pdo, $numeroMesa);
    if (!$resumen) {
        $errores[] = 'No se encontraron registros en mesas para el número seleccionado.';
    } else {
        $tipo = trim((string)($resumen['tipo_mesa'] ?? 'simple'));
        if ($tipo === 'taller') {
            $errores[] = 'Las mesas de taller son exclusivas y no se pueden agregar a otro grupo.';
        }

        $idAreaGrupo = (int)($grupoDestino['id_area'] ?? 0);
        $idAreaNumero = (int)($resumen['id_area'] ?? 0);
        if ($idAreaGrupo > 0 && $idAreaNumero > 0 && $idAreaGrupo !== $idAreaNumero) {
            if ($ignorarArea) {
                $advertencias[] = 'El número pertenece a otra área, pero se permite agregarlo manualmente desde esta edición.';
            } else {
                $errores[] = 'El número de mesa no pertenece al área del grupo seleccionado.';
            }
        }
    }

    if (count($errores) === 0) {
        $numerosFinales = array_values(array_unique(array_merge($numerosGrupo, [$numeroMesa])));
        $detalleFinal = mesas_editar_docentes_obtener_detalle_numeros($pdo, $numerosFinales);

        // Siempre se validan reglas duras: disponibilidad/bloqueos/choques de docentes,
        // choque de alumnos por DNI y correlatividades. Lo único variable es el área:
        // en el armado por indisponibilidad docente se ignora; por área se respeta arriba.
        $errores = array_merge($errores, mesas_editar_docentes_validar_docentes($pdo, $detalleFinal, $fechaDestino, $idTurnoDestino));
        $errores = array_merge($errores, mesas_editar_docentes_validar_alumnos($pdo, $detalleFinal, $fechaDestino, $idTurnoDestino));
        $errores = array_merge($errores, mesas_editar_docentes_validar_correlativas($pdo, $detalleFinal, $fechaDestino, $idTurnoDestino));
    }

    return [
        'valido' => count($errores) === 0,
        'errores' => array_values(array_unique($errores)),
        'advertencias' => array_values(array_unique($advertencias)),
    ];
}

function mesas_editar_docentes_agregar_numero_obtener_no_agrupadas_disponibles(PDO $pdo, array $grupoDestino): array
{
    // En edición manual, el + debe listar todas las mesas no agrupadas reales,
    // aunque pertenezcan a otra área. El área solo queda como dato visual.
    // Se mantienen las validaciones fuertes de choques de alumnos/docentes/correlativas
    // para evitar guardar combinaciones imposibles.
    $stmt = $pdo->query(''
        . 'SELECT '
        . '    n.id AS id_no_agrupada, n.numero_mesa, n.fecha_mesa, DATE_FORMAT(n.fecha_mesa, "%d/%m/%Y") AS fecha, '
        . '    n.id_turno, n.hora, t.turno, n.id_area, a.area, n.tipo_mesa, n.prioridad, '
        . '    n.cantidad_alumnos, n.motivo, n.estado, '
        . '    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ", ") AS materia, '
        . '    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ", ") AS docente, '
        . '    GROUP_CONCAT(DISTINCT p.alumno ORDER BY p.alumno SEPARATOR ", ") AS alumnos_texto '
        . 'FROM mesas_no_agrupadas n '
        . 'LEFT JOIN turnos t ON t.id_turno = n.id_turno '
        . 'LEFT JOIN areas a ON a.id_area = n.id_area '
        . 'LEFT JOIN mesas me ON me.numero_mesa = n.numero_mesa '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'WHERE NOT EXISTS (SELECT 1 FROM mesas_grupos g WHERE g.numero_mesa = n.numero_mesa) '
        . 'GROUP BY n.id, n.numero_mesa, n.fecha_mesa, n.id_turno, n.hora, t.turno, n.id_area, a.area, n.tipo_mesa, n.prioridad, n.cantidad_alumnos, n.motivo, n.estado '
        . 'ORDER BY n.fecha_mesa ASC, n.id_turno ASC, n.numero_mesa ASC'
    );

    $salida = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $numeroMesa = (int)($row['numero_mesa'] ?? 0);
        if ($numeroMesa <= 0) {
            continue;
        }

        $validacion = mesas_editar_docentes_agregar_numero_validar_numero_en_grupo($pdo, $numeroMesa, $grupoDestino, [
            'ignorar_area' => mesas_editar_docentes_es_armado_por_docentes($pdo),
        ]);

        if (empty($validacion['valido'])) {
            continue;
        }

        $salida[] = [
            'id_no_agrupada' => (int)$row['id_no_agrupada'],
            'numero_mesa' => $numeroMesa,
            'fecha_mesa' => $row['fecha_mesa'] ?? null,
            'fecha' => $row['fecha'] ?? mesas_editar_docentes_agregar_numero_fecha_texto($row['fecha_mesa'] ?? null),
            'id_turno' => $row['id_turno'] !== null ? (int)$row['id_turno'] : null,
            'hora' => $row['hora'] ?? null,
            'turno' => trim((string)($row['turno'] ?? '')),
            'id_area' => $row['id_area'] !== null ? (int)$row['id_area'] : null,
            'area' => trim((string)($row['area'] ?? '')),
            'tipo_mesa' => trim((string)($row['tipo_mesa'] ?? 'simple')) ?: 'simple',
            'prioridad' => (int)($row['prioridad'] ?? 0),
            'cantidad_alumnos' => (int)($row['cantidad_alumnos'] ?? 0),
            'materia' => trim((string)($row['materia'] ?? '')),
            'docente' => trim((string)($row['docente'] ?? '')),
            'alumnos_texto' => trim((string)($row['alumnos_texto'] ?? '')),
            'motivo' => trim((string)($row['motivo'] ?? '')),
            // Si llegó hasta acá, no tiene choques reales en el slot destino.
            // Por eso el frontend debe dejar el + habilitado siempre.
            'agregable' => true,
            'validacion' => $validacion,
        ];
    }

    return $salida;
}

function mesas_editar_docentes_agregar_numero_detalle_previa(array $previa, int $numeroMesa): array
{
    $idDocente = (int)($previa['id_docente'] ?? 0);
    $dni = trim((string)($previa['dni'] ?? ''));

    $detalle = [
        'numeros' => [$numeroMesa],
        'ids_mesa' => [],
        'ids_previa' => [(int)$previa['id_previa']],
        'docentes' => [],
        'dnis' => [],
        'registros' => [],
        'dni_numeros' => [],
    ];

    if ($idDocente > 0) {
        $detalle['docentes'][$idDocente] = trim((string)($previa['docente'] ?? ('Docente ' . $idDocente)));
    }

    if ($dni !== '') {
        $detalle['dnis'][$dni] = trim((string)($previa['alumno'] ?? $dni));
        $detalle['dni_numeros'][$dni] = [$numeroMesa => true];
    }

    $detalle['registros'][] = [
        'id_mesa' => 0,
        'numero_mesa' => $numeroMesa,
        'id_previa' => (int)$previa['id_previa'],
        'id_docente' => $idDocente,
        'docente' => trim((string)($previa['docente'] ?? '')),
        'dni' => $dni,
        'alumno' => trim((string)($previa['alumno'] ?? '')),
        'id_materia' => (int)($previa['id_materia'] ?? 0),
        'id_curso' => (int)($previa['materia_id_curso'] ?? 0),
        'materia' => trim((string)($previa['materia'] ?? '')),
        'tipo_mesa' => 'simple',
        'prioridad' => 0,
    ];

    return $detalle;
}


function mesas_editar_docentes_agregar_numero_combinar_detalles(array $detalleGrupo, array $detallePrevia): array
{
    $detalle = [
        'numeros' => array_values(array_unique(array_merge($detalleGrupo['numeros'] ?? [], $detallePrevia['numeros'] ?? []))),
        'ids_mesa' => array_values(array_unique(array_merge($detalleGrupo['ids_mesa'] ?? [], $detallePrevia['ids_mesa'] ?? []))),
        'ids_previa' => array_values(array_unique(array_merge($detalleGrupo['ids_previa'] ?? [], $detallePrevia['ids_previa'] ?? []))),
        'docentes' => $detalleGrupo['docentes'] ?? [],
        'dnis' => $detalleGrupo['dnis'] ?? [],
        'registros' => array_values(array_merge($detalleGrupo['registros'] ?? [], $detallePrevia['registros'] ?? [])),
        'dni_numeros' => $detalleGrupo['dni_numeros'] ?? [],
    ];

    foreach (($detallePrevia['docentes'] ?? []) as $idDocente => $nombreDocente) {
        $detalle['docentes'][(int)$idDocente] = $nombreDocente;
    }

    foreach (($detallePrevia['dnis'] ?? []) as $dni => $alumno) {
        $detalle['dnis'][(string)$dni] = $alumno;
    }

    foreach (($detallePrevia['dni_numeros'] ?? []) as $dni => $numerosMap) {
        $dni = (string)$dni;
        if (!isset($detalle['dni_numeros'][$dni]) || !is_array($detalle['dni_numeros'][$dni])) {
            $detalle['dni_numeros'][$dni] = [];
        }

        foreach ($numerosMap as $numero => $valor) {
            $detalle['dni_numeros'][$dni][(int)$numero] = $valor;
        }
    }

    return $detalle;
}

function mesas_editar_docentes_agregar_numero_detalle_grupo_mas_previa(PDO $pdo, array $previa, array $grupoDestino, int $numeroMesa): array
{
    $detallePrevia = mesas_editar_docentes_agregar_numero_detalle_previa($previa, $numeroMesa);

    $numerosGrupo = array_map(static fn ($item) => (int)($item['numero_mesa'] ?? 0), $grupoDestino['numeros'] ?? []);
    $numerosGrupo = array_values(array_filter($numerosGrupo, static fn ($numero) => $numero > 0));

    if (count($numerosGrupo) === 0) {
        return $detallePrevia;
    }

    $detalleGrupo = mesas_editar_docentes_obtener_detalle_numeros($pdo, $numerosGrupo);
    return mesas_editar_docentes_agregar_numero_combinar_detalles($detalleGrupo, $detallePrevia);
}

function mesas_editar_docentes_agregar_numero_validar_previa_para_slot(PDO $pdo, array $previa, array $grupoDestino, ?int $numeroMesa = null): array
{
    $errores = [];
    $advertencias = [];

    $numeroValidacion = $numeroMesa ?: mesas_editar_docentes_agregar_numero_siguiente_numero($pdo);
    $fechaDestino = substr((string)($grupoDestino['fecha_mesa'] ?? ''), 0, 10);
    $idTurnoDestino = (int)($grupoDestino['id_turno'] ?? 0);

    if ((int)($previa['activo'] ?? 0) !== 1 || (int)($previa['inscripcion'] ?? 0) !== 1 || (int)($previa['id_condicion'] ?? 0) !== 3) {
        $errores[] = 'La previa no está activa, inscripta o no tiene condición previa válida.';
    }

    if ((int)($previa['id_catedra'] ?? 0) <= 0) {
        $errores[] = 'La previa no tiene una cátedra activa asociada.';
    }

    if ((int)($previa['id_docente'] ?? 0) <= 0) {
        $errores[] = 'La previa no tiene un docente activo asociado.';
    }

    $idAreaGrupo = (int)($grupoDestino['id_area'] ?? 0);
    $idAreaPrevia = (int)($previa['id_area'] ?? 0);
    if ($idAreaGrupo > 0 && $idAreaPrevia > 0 && $idAreaGrupo !== $idAreaPrevia) {
        if (mesas_editar_docentes_debe_respetar_area($pdo)) {
            $errores[] = 'La previa no pertenece al área del grupo seleccionado.';
        } else {
            $advertencias[] = 'La previa pertenece a otra área, pero se permite porque el armado actual es por indisponibilidad docente.';
        }
    }

    if ((int)($previa['id_taller'] ?? 0) > 0) {
        $errores[] = 'Las previas de taller deben armarse como mesa exclusiva y no se agregan desde este modal.';
    }

    if ((int)($previa['tiene_correlativa_alumno'] ?? 0) === 1) {
        $errores[] = 'La previa tiene correlativas del mismo alumno y debe reprogramarse con el flujo de correlativas.';
    }

    try {
        if ($fechaDestino !== '') {
            mesas_editar_docentes_normalizar_fecha($fechaDestino);
        } else {
            $errores[] = 'El grupo de referencia no tiene fecha definida.';
        }
    } catch (Throwable $e) {
        $errores[] = $e->getMessage();
    }

    if ($idTurnoDestino <= 0) {
        $errores[] = 'El grupo de referencia no tiene turno definido.';
    }

    $stmtExiste = $pdo->prepare('SELECT 1 FROM mesas WHERE id_previa = ? LIMIT 1');
    $stmtExiste->execute([(int)$previa['id_previa']]);
    if ($stmtExiste->fetchColumn()) {
        $errores[] = 'La previa ya está vinculada a una mesa.';
    }

    if (count($errores) === 0) {
        // Para crear un número nuevo desde una previa suelta se valida el CANDIDATO
        // contra el slot real del grupo destino, no se revalida todo el grupo existente.
        // Esto evita que una mesa ya armada con algún dato viejo o advertencia preexistente
        // esconda previas válidas. Aun así, al validar solo el candidato contra tablas reales,
        // se siguen detectando choques con cualquier número del grupo o de otros grupos:
        // - si el docente ya está en ese día/turno, no aparece;
        // - si el alumno ya rinde en ese día/turno, no aparece;
        // - si el docente tiene indisponibilidad cargada para ese día/turno, no aparece.
        $detalle = mesas_editar_docentes_agregar_numero_detalle_previa($previa, $numeroValidacion);
        $errores = array_merge($errores, mesas_editar_docentes_validar_docentes($pdo, $detalle, $fechaDestino, $idTurnoDestino));
        $errores = array_merge($errores, mesas_editar_docentes_validar_alumnos($pdo, $detalle, $fechaDestino, $idTurnoDestino));
        $errores = array_merge($errores, mesas_editar_docentes_validar_correlativas($pdo, $detalle, $fechaDestino, $idTurnoDestino));
    }

    return [
        'valido' => count($errores) === 0,
        'errores' => array_values(array_unique($errores)),
        'advertencias' => $advertencias,
        'numero_sugerido' => $numeroValidacion,
    ];
}

function mesas_editar_docentes_agregar_numero_obtener_previas_sin_mesa(PDO $pdo, array $grupoDestino, int $limite = 1500): array
{
    // Antes se hacía LIMIT antes de validar. Eso podía dejar afuera previas nuevas
    // aunque fueran válidas, simplemente porque quedaban después de las primeras 300
    // filas ordenadas por alumno. En edición por indisponibilidad docente se escanean
    // todas las previas sueltas y recién después se corta la salida.
    $limite = max(1, min(3000, $limite));

    $sql = "
        SELECT p.id_previa
        FROM previas p
        WHERE p.activo = 1
          AND p.inscripcion = 1
          AND p.id_condicion = 3
          AND NOT EXISTS (SELECT 1 FROM mesas me WHERE me.id_previa = p.id_previa)
        ORDER BY p.alumno ASC, p.id_previa ASC
    ";

    $ids = $pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN);
    $salida = [];

    foreach ($ids as $idPrevia) {
        $previa = mesas_editar_docentes_mas_obtener_previa_base($pdo, (int)$idPrevia);
        if (!$previa) {
            continue;
        }

        $validacion = mesas_editar_docentes_agregar_numero_validar_previa_para_slot($pdo, $previa, $grupoDestino);
        if (!$validacion['valido']) {
            continue;
        }

        $salida[] = mesas_editar_docentes_agregar_numero_normalizar_previa($previa, $validacion);
        if (count($salida) >= $limite) {
            break;
        }
    }

    return $salida;
}

function mesas_editar_docentes_agregar_numero_normalizar_previa(array $previa, array $validacion): array
{
    $cursoAlumno = trim((string)(($previa['curso_alumno'] ?? '') . ' ' . ($previa['division_alumno'] ?? '')));
    $cursoMateria = trim((string)(($previa['curso_materia'] ?? '') . ' ' . ($previa['division_materia'] ?? '')));
    $curso = $cursoMateria !== '' ? $cursoMateria : $cursoAlumno;

    return [
        'id_previa' => (int)$previa['id_previa'],
        'dni' => trim((string)($previa['dni'] ?? '')),
        'alumno' => trim((string)($previa['alumno'] ?? '')),
        'materia' => trim((string)($previa['materia'] ?? '')),
        'id_materia' => (int)($previa['id_materia'] ?? 0),
        'id_catedra' => (int)($previa['id_catedra'] ?? 0),
        'id_docente' => (int)($previa['id_docente'] ?? 0),
        'docente' => trim((string)($previa['docente'] ?? '')),
        'curso' => $curso,
        'curso_materia' => $cursoMateria,
        'id_area' => $previa['id_area'] !== null ? (int)$previa['id_area'] : null,
        'area' => trim((string)($previa['area'] ?? '')),
        'anio' => $previa['anio'] ?? null,
        'numero_sugerido' => (int)($validacion['numero_sugerido'] ?? 0),
        'validacion' => $validacion,
    ];
}

function mesas_editar_docentes_agregar_numero_opciones(PDO $pdo, int $numeroGrupo): array
{
    $grupo = mesas_editar_docentes_agregar_numero_obtener_grupo_destino($pdo, $numeroGrupo);
    if (!$grupo) {
        throw new RuntimeException('No se encontró el grupo al que querés agregar un número.');
    }

    if ((int)$grupo['cantidad_numeros'] >= (int)($grupo['capacidad_slots'] ?? 4)) {
        throw new InvalidArgumentException('El grupo no tiene slots libres. Habilitá un nuevo slot desde edición para poder agregar otro número.');
    }

    return [
        'meta' => [
            'numero_grupo' => (int)$grupo['numero_grupo'],
            'id_grupo' => (int)$grupo['numero_grupo'],
            'fecha_mesa' => $grupo['fecha_mesa'] ?? null,
            'fecha' => $grupo['fecha'] ?? mesas_editar_docentes_agregar_numero_fecha_texto($grupo['fecha_mesa'] ?? null),
            'id_turno' => (int)$grupo['id_turno'],
            'turno' => trim((string)($grupo['turno'] ?? '')),
            'hora' => $grupo['hora'] ?? null,
            'cantidad_numeros' => (int)$grupo['cantidad_numeros'],
            'slots_libres' => (int)$grupo['slots_libres'],
            'slots_extra' => (int)($grupo['slots_extra'] ?? 0),
            'capacidad_slots' => (int)($grupo['capacidad_slots'] ?? 4),
            'capacidad_base_slots' => (int)($grupo['capacidad_base_slots'] ?? 4),
            'es_grupo_taller' => !empty($grupo['es_grupo_taller']),
            'id_area' => $grupo['id_area'],
            'area' => trim((string)($grupo['area'] ?? '')),
            'numeros' => $grupo['numeros'],
        ],
        'no_agrupadas' => mesas_editar_docentes_agregar_numero_obtener_no_agrupadas_disponibles($pdo, $grupo),
        'previas_sin_mesa' => mesas_editar_docentes_agregar_numero_obtener_previas_sin_mesa($pdo, $grupo),
    ];
}

function mesas_editar_docentes_agregar_numero_a_grupo(PDO $pdo, int $numeroGrupo, int $numeroMesa): array
{
    $grupo = mesas_editar_docentes_agregar_numero_obtener_grupo_destino($pdo, $numeroGrupo);
    if (!$grupo) {
        throw new RuntimeException('No se encontró el grupo destino.');
    }

    $validacion = mesas_editar_docentes_agregar_numero_validar_numero_en_grupo($pdo, $numeroMesa, $grupo, [
        'ignorar_area' => mesas_editar_docentes_es_armado_por_docentes($pdo),
    ]);
    if (!$validacion['valido']) {
        return [
            'agregado' => false,
            'validacion' => $validacion,
        ];
    }

    $resumen = mesas_editar_docentes_agregar_numero_resumen_numero($pdo, $numeroMesa);
    if (!$resumen) {
        throw new RuntimeException('No se encontró el número de mesa seleccionado.');
    }

    $fecha = substr((string)$grupo['fecha_mesa'], 0, 10);
    $idTurno = (int)$grupo['id_turno'];
    $hora = $grupo['hora'] ?? null;

    $stmtDeleteGrupo = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = ?');
    $stmtDeleteGrupo->execute([$numeroMesa]);

    $stmtDeleteNo = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
    $stmtDeleteNo->execute([$numeroMesa]);

    $stmtMesas = $pdo->prepare(''
        . 'UPDATE mesas '
        . 'SET fecha_mesa = ?, id_turno = ?, estado = IF(estado = "observada", estado, "borrador") '
        . 'WHERE numero_mesa = ?'
    );
    $stmtMesas->execute([$fecha, $idTurno, $numeroMesa]);

    $stmtOrden = $pdo->prepare('SELECT COALESCE(MAX(orden), 0) + 1 FROM mesas_grupos WHERE numero_grupo = ?');
    $stmtOrden->execute([$numeroGrupo]);
    $orden = max(1, (int)$stmtOrden->fetchColumn());

    $stmtInsert = $pdo->prepare(''
        . 'INSERT INTO mesas_grupos '
        . '    (numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area, orden, tipo_mesa, prioridad, cantidad_alumnos, estado, observacion) '
        . 'VALUES '
        . '    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "borrador", NULL)'
    );
    $idAreaInsert = mesas_editar_docentes_es_armado_por_docentes($pdo)
        ? ($resumen['id_area'] !== null ? (int)$resumen['id_area'] : null)
        : ($grupo['id_area'] !== null ? (int)$grupo['id_area'] : null);

    $stmtInsert->execute([
        $numeroGrupo,
        $numeroMesa,
        $fecha,
        $idTurno,
        $hora,
        $idAreaInsert,
        $orden,
        $resumen['tipo_mesa'],
        $resumen['prioridad'],
        $resumen['cantidad_alumnos'],
    ]);

    if (function_exists('mesas_editar_docentes_flechas_reordenar_grupo')) {
        mesas_editar_docentes_flechas_reordenar_grupo($pdo, $numeroGrupo);
    }

    return [
        'agregado' => true,
        'tipo' => 'no_agrupada',
        'numero_mesa' => $numeroMesa,
        'numero_grupo' => $numeroGrupo,
        'validacion' => $validacion,
        // No se hidrata el grupo dentro de la transacción: esa función asegura tablas
        // y MySQL/MariaDB puede hacer COMMIT implícito. El frontend recarga el grupo al terminar.
    ];
}

function mesas_editar_docentes_agregar_numero_crear_grupo_desde_previa(PDO $pdo, int $numeroGrupoReferencia, int $idPrevia): array
{
    $grupoReferencia = mesas_editar_docentes_agregar_numero_obtener_grupo_destino($pdo, $numeroGrupoReferencia);
    if (!$grupoReferencia) {
        throw new RuntimeException('No se encontró el grupo de referencia.');
    }

    $previa = mesas_editar_docentes_mas_obtener_previa_base($pdo, $idPrevia);
    if (!$previa) {
        throw new RuntimeException('No se encontró la previa seleccionada.');
    }

    $numeroMesa = mesas_editar_docentes_agregar_numero_siguiente_numero($pdo);
    $validacion = mesas_editar_docentes_agregar_numero_validar_previa_para_slot($pdo, $previa, $grupoReferencia, $numeroMesa);
    if (!$validacion['valido']) {
        return [
            'agregado' => false,
            'validacion' => $validacion,
        ];
    }

    $fecha = substr((string)$grupoReferencia['fecha_mesa'], 0, 10);
    $idTurno = (int)$grupoReferencia['id_turno'];
    $hora = $grupoReferencia['hora'] ?? null;

    $stmtMesas = $pdo->prepare(''
        . 'INSERT INTO mesas '
        . '    (numero_mesa, prioridad, tipo_mesa, id_taller, id_catedra, id_previa, id_docente, fecha_mesa, id_turno, estado, observacion) '
        . 'VALUES '
        . '    (?, 0, "simple", NULL, ?, ?, ?, ?, ?, "borrador", NULL)'
    );
    $stmtMesas->execute([
        $numeroMesa,
        (int)$previa['id_catedra'],
        (int)$previa['id_previa'],
        (int)$previa['id_docente'],
        $fecha,
        $idTurno,
    ]);

    $stmtOrden = $pdo->prepare('SELECT COALESCE(MAX(orden), 0) + 1 FROM mesas_grupos WHERE numero_grupo = ?');
    $stmtOrden->execute([$numeroGrupoReferencia]);
    $orden = max(1, (int)$stmtOrden->fetchColumn());

    $stmtGrupo = $pdo->prepare(''
        . 'INSERT INTO mesas_grupos '
        . '    (numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area, orden, tipo_mesa, prioridad, cantidad_alumnos, estado, observacion) '
        . 'VALUES '
        . '    (?, ?, ?, ?, ?, ?, ?, "simple", 0, 1, "borrador", "Número creado manualmente desde previa sin número de mesa y agregado al grupo.")'
    );
    $idAreaInsert = mesas_editar_docentes_es_armado_por_docentes($pdo)
        ? ($previa['id_area'] !== null ? (int)$previa['id_area'] : null)
        : ($grupoReferencia['id_area'] !== null ? (int)$grupoReferencia['id_area'] : null);

    $stmtGrupo->execute([
        $numeroGrupoReferencia,
        $numeroMesa,
        $fecha,
        $idTurno,
        $hora,
        $idAreaInsert,
        $orden,
    ]);

    if (function_exists('mesas_editar_docentes_flechas_reordenar_grupo')) {
        mesas_editar_docentes_flechas_reordenar_grupo($pdo, $numeroGrupoReferencia);
    }

    return [
        'agregado' => true,
        'tipo' => 'previa_sin_mesa',
        'id_previa' => (int)$previa['id_previa'],
        'numero_mesa' => $numeroMesa,
        'numero_grupo' => $numeroGrupoReferencia,
        'validacion' => $validacion,
        // No se hidrata el grupo dentro de la transacción: el frontend recarga el grupo abierto
        // y lo muestra actualizado después de cerrar el modal interno.
    ];
}
