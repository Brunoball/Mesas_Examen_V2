<?php
// backend/modules/mesas/editar_mesas/helpers_editar_mesas.php
declare(strict_types=1);

function mesas_editar_input_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}


function mesas_editar_parametro_presente($valor): bool
{
    if ($valor === null) {
        return false;
    }

    $texto = mb_strtolower(trim((string)$valor), 'UTF-8');
    return $texto !== '' && $texto !== 'undefined' && $texto !== 'null' && $texto !== 'nan';
}

function mesas_editar_parametro_texto($valor): string
{
    return mesas_editar_parametro_presente($valor) ? trim((string)$valor) : '';
}

function mesas_editar_normalizar_fecha(?string $fecha): string
{
    $fecha = trim((string)$fecha);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        throw new InvalidArgumentException('La fecha de mesa no es válida.');
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        throw new InvalidArgumentException('La fecha de mesa no existe.');
    }

    $diaSemana = (int)$dt->format('N');
    if ($diaSemana >= 6) {
        throw new InvalidArgumentException('No se pueden programar mesas los sábados ni domingos.');
    }

    return $fecha;
}


function mesas_editar_normalizar_fecha_rango(?string $fecha): string
{
    $fecha = trim((string)$fecha);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        throw new InvalidArgumentException('La fecha del rango no es válida.');
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        throw new InvalidArgumentException('La fecha del rango no existe.');
    }

    return $fecha;
}

function mesas_editar_horario_rango_por_turno(string $turno): array
{
    $turnoLower = mb_strtolower(trim($turno), 'UTF-8');

    if (str_contains($turnoLower, 'tarde')) {
        return [
            'min' => '13:15',
            'max' => '18:20',
            'default' => '13:15',
            'texto' => '13:15 a 18:20',
        ];
    }

    return [
        'min' => '07:30',
        'max' => '12:30',
        'default' => '07:30',
        'texto' => '07:30 a 12:30',
    ];
}

function mesas_editar_hora_a_minutos(string $hora): int
{
    if (!preg_match('/^(\d{2}):(\d{2})(?::\d{2})?$/', $hora, $m)) {
        throw new InvalidArgumentException('La hora debe tener formato HH:MM.');
    }

    $hh = (int)$m[1];
    $mm = (int)$m[2];

    if ($hh < 0 || $hh > 23 || $mm < 0 || $mm > 59) {
        throw new InvalidArgumentException('La hora ingresada no es válida.');
    }

    return ($hh * 60) + $mm;
}

function mesas_editar_normalizar_hora(?string $hora, string $turno = ''): string
{
    $rango = mesas_editar_horario_rango_por_turno($turno);
    $hora = trim((string)$hora);

    if ($hora === '') {
        $hora = $rango['default'];
    }

    if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $hora)) {
        $hora = substr($hora, 0, 5);
    }

    if (!preg_match('/^\d{2}:\d{2}$/', $hora)) {
        throw new InvalidArgumentException('La hora debe tener formato HH:MM.');
    }

    $minutos = mesas_editar_hora_a_minutos($hora);
    $min = mesas_editar_hora_a_minutos($rango['min']);
    $max = mesas_editar_hora_a_minutos($rango['max']);

    if ($minutos < $min || $minutos > $max) {
        throw new InvalidArgumentException('El horario del turno ' . trim($turno) . ' debe estar entre ' . $rango['texto'] . '.');
    }

    return $hora . ':00';
}

function mesas_editar_obtener_turno(PDO $pdo, int $idTurno): array
{
    if ($idTurno <= 0) {
        throw new InvalidArgumentException('Debe seleccionar un turno válido.');
    }

    $stmt = $pdo->prepare('
        SELECT id_turno, turno
        FROM turnos
        WHERE id_turno = ?
          AND activo = 1
        LIMIT 1
    ');
    $stmt->execute([$idTurno]);

    $turno = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$turno) {
        throw new InvalidArgumentException('El turno seleccionado no existe o está inactivo.');
    }

    return $turno;
}

function mesas_editar_tipo_desde_payload(array $data): string
{
    $tipo = trim((string)($data['tipo'] ?? $data['origen_tipo'] ?? $data['tipo_mesa_edicion'] ?? 'grupo'));
    return in_array($tipo, ['grupo', 'no_agrupada'], true) ? $tipo : 'grupo';
}

function mesas_editar_obtener_grupo_hidratado(PDO $pdo, int $numeroGrupo): ?array
{
    mesas_armado_grupos_asegurar_tablas($pdo);

    $stmt = $pdo->prepare("
        SELECT
            g.numero_grupo,
            MIN(g.fecha_mesa) AS fecha_mesa,
            DATE_FORMAT(MIN(g.fecha_mesa), '%d/%m/%Y') AS fecha,
            MIN(g.id_turno) AS id_turno,
            MIN(g.hora) AS hora,
            MAX(t.turno) AS turno,
            MIN(g.id_area) AS id_area,
            MAX(a.area) AS area,
            COUNT(*) AS cantidad_numeros,
            SUM(g.cantidad_alumnos) AS cantidad_alumnos,
            MAX(g.prioridad) AS prioridad_max,
            CASE
                WHEN SUM(CASE WHEN g.estado = 'observado' THEN 1 ELSE 0 END) > 0 THEN 'observado'
                WHEN SUM(CASE WHEN g.estado = 'armada' THEN 1 ELSE 0 END) = COUNT(*) THEN 'armada'
                WHEN SUM(CASE WHEN g.estado = 'validado' THEN 1 ELSE 0 END) = COUNT(*) THEN 'validado'
                ELSE 'borrador'
            END AS estado,
            GROUP_CONCAT(DISTINCT g.observacion ORDER BY g.observacion SEPARATOR ' / ') AS observacion,
            GROUP_CONCAT(g.numero_mesa ORDER BY g.orden SEPARATOR ', ') AS numeros_mesa_texto,
            GROUP_CONCAT(g.tipo_mesa ORDER BY g.orden SEPARATOR ', ') AS tipos_mesa_texto
        FROM mesas_grupos g
        LEFT JOIN turnos t ON t.id_turno = g.id_turno
        LEFT JOIN areas a ON a.id_area = g.id_area
        WHERE g.numero_grupo = ?
        GROUP BY g.numero_grupo
        LIMIT 1
    ");
    $stmt->execute([$numeroGrupo]);

    $base = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$base) {
        return null;
    }

    $grupos = mesas_armado_grupos_hidratar_detalles($pdo, [$base], [$numeroGrupo]);
    return $grupos[0] ?? null;
}

function mesas_editar_obtener_no_agrupada_hidratada(PDO $pdo, ?int $idNoAgrupada = null, ?int $numeroMesa = null): ?array
{
    mesas_armado_grupos_asegurar_tablas($pdo);

    $where = [];
    $params = [];

    if ($idNoAgrupada !== null && $idNoAgrupada > 0) {
        $where[] = 'n.id = ?';
        $params[] = $idNoAgrupada;
    }

    if ($numeroMesa !== null && $numeroMesa > 0) {
        $where[] = 'n.numero_mesa = ?';
        $params[] = $numeroMesa;
    }

    if (!$where) {
        return null;
    }

    $stmt = $pdo->prepare("
        SELECT
            n.id,
            n.numero_mesa,
            n.fecha_mesa,
            DATE_FORMAT(n.fecha_mesa, '%d/%m/%Y') AS fecha,
            n.id_turno,
            n.hora,
            t.turno,
            n.id_area,
            a.area,
            n.tipo_mesa,
            n.prioridad,
            n.cantidad_alumnos,
            n.motivo,
            n.estado,
            n.fecha_registro
        FROM mesas_no_agrupadas n
        LEFT JOIN turnos t ON t.id_turno = n.id_turno
        LEFT JOIN areas a ON a.id_area = n.id_area
        WHERE " . implode(' OR ', $where) . "
        ORDER BY n.id ASC
        LIMIT 1
    ");
    $stmt->execute($params);

    $fila = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$fila) {
        return null;
    }

    $numero = (int)$fila['numero_mesa'];
    $grupo = [
        'id' => 'no_agrupada_' . (int)$fila['id'],
        'id_no_agrupada' => (int)$fila['id'],
        'id_grupo' => null,
        'numero_grupo' => null,
        'mesa_final_texto' => 'Sin agrupar',
        'fecha_mesa' => $fila['fecha_mesa'] ?? null,
        'fecha' => $fila['fecha'] ?? null,
        'id_turno' => $fila['id_turno'] !== null ? (int)$fila['id_turno'] : null,
        'hora' => $fila['hora'] ?? null,
        'turno' => $fila['turno'] ?? null,
        'id_area' => $fila['id_area'] !== null ? (int)$fila['id_area'] : null,
        'area' => $fila['area'] ?? null,
        'cantidad_numeros' => 1,
        'cantidad_alumnos' => (int)($fila['cantidad_alumnos'] ?? 0),
        'cantidad_previas' => 0,
        'cantidad_alumnos_distintos' => 0,
        'prioridad_max' => (int)($fila['prioridad'] ?? 0),
        'estado' => $fila['estado'] ?? 'pendiente',
        'observacion' => $fila['motivo'] ?? null,
        'motivo' => $fila['motivo'] ?? null,
        'numeros_mesa_texto' => (string)$numero,
        'tipos_mesa_texto' => $fila['tipo_mesa'] ?? '',
        'docente' => '',
        'docentes' => [],
        '_docentes_index' => [],
        'materia' => '',
        'materias' => [],
        '_materias_index' => [],
        'numeros' => [mesas_armado_grupos_inicializar_numero([
            'numero_mesa' => $numero,
            'orden' => 1,
            'tipo_numero' => $fila['tipo_mesa'] ?? 'simple',
            'prioridad_numero' => $fila['prioridad'] ?? 0,
            'cantidad_alumnos_numero' => $fila['cantidad_alumnos'] ?? 0,
            'observacion_numero' => $fila['motivo'] ?? null,
        ])],
        '_numeros_index' => [(string)$numero => 0],
        'alumnos' => [],
        '_alumnos_index' => [],
        '_dni_index' => [],
    ];

    $detalle = mesas_armado_grupos_hidratar_numero_suelto($pdo, $numero);
    foreach ($detalle as $filaDetalle) {
        $num =& $grupo['numeros'][0];

        mesas_armado_grupos_agregar_unico($grupo, 'docentes', '_docentes_index', $filaDetalle['id_docente_real'] ?? null, $filaDetalle['docente'] ?? null);
        mesas_armado_grupos_agregar_unico($grupo, 'materias', '_materias_index', $filaDetalle['id_materia'] ?? null, $filaDetalle['materia'] ?? null);
        mesas_armado_grupos_agregar_unico($num, 'docentes', '_docentes_index', $filaDetalle['id_docente_real'] ?? null, $filaDetalle['docente'] ?? null);
        mesas_armado_grupos_agregar_unico($num, 'materias', '_materias_index', $filaDetalle['id_materia'] ?? null, $filaDetalle['materia'] ?? null);

        if ($filaDetalle['id_mesa'] !== null) {
            $alumno = [
                'id_mesa' => (int)$filaDetalle['id_mesa'],
                'id_previa' => $filaDetalle['id_previa'] !== null ? (int)$filaDetalle['id_previa'] : null,
                'numero_mesa' => $numero,
                'dni' => trim((string)($filaDetalle['dni'] ?? '')),
                'estudiante' => $filaDetalle['estudiante'] ?? '',
                'alumno' => $filaDetalle['estudiante'] ?? '',
                'materia' => $filaDetalle['materia'] ?? '',
                'docente' => $filaDetalle['docente'] ?? '',
                'curso_alumno' => $filaDetalle['curso_alumno'] ?? '',
                'division_alumno' => $filaDetalle['division_alumno'] ?? '',
                'curso' => trim((string)(($filaDetalle['curso_alumno'] ?? '') . ' ' . ($filaDetalle['division_alumno'] ?? ''))),
                'curso_materia' => $filaDetalle['curso_materia'] ?? '',
                'division_materia' => $filaDetalle['division_materia'] ?? '',
                'condicion' => $filaDetalle['condicion'] ?? '',
                'nota' => $filaDetalle['nota'] ?? null,
                'anio' => $filaDetalle['anio'] ?? null,
                'tipo_mesa' => $filaDetalle['tipo_registro'] ?? ($fila['tipo_mesa'] ?? 'simple'),
                'estado' => $filaDetalle['estado_registro'] ?? '',
                'observacion' => $filaDetalle['observacion_registro'] ?? null,
                'fecha' => $filaDetalle['fecha'] ?? $fila['fecha'],
                'turno' => $filaDetalle['turno'] ?? $fila['turno'],
            ];

            $num['alumnos'][] = $alumno;
            $grupo['alumnos'][] = $alumno;

            if ($alumno['dni'] !== '') {
                $num['_dni_index'][$alumno['dni']] = true;
                $grupo['_dni_index'][$alumno['dni']] = true;
            }
        }

        unset($num);
    }

    return mesas_armado_grupos_limpieza_salida($grupo);
}

function mesas_editar_resolver_item(PDO $pdo, string $tipo, array $data): ?array
{
    if ($tipo === 'no_agrupada') {
        $idNoAgrupada = isset($data['id_no_agrupada']) ? (int)$data['id_no_agrupada'] : null;
        $numeroMesa = isset($data['numero_mesa']) ? (int)$data['numero_mesa'] : null;
        return mesas_editar_obtener_no_agrupada_hidratada($pdo, $idNoAgrupada, $numeroMesa);
    }

    $numeroGrupo = (int)($data['numero_grupo'] ?? $data['id_grupo'] ?? 0);
    if ($numeroGrupo <= 0) {
        return null;
    }

    return mesas_editar_obtener_grupo_hidratado($pdo, $numeroGrupo);
}

function mesas_editar_obtener_numero_siguiente_grupo(PDO $pdo): int
{
    $stmt = $pdo->query('SELECT COALESCE(MAX(numero_grupo), 0) + 1 FROM mesas_grupos');
    return max(1, (int)$stmt->fetchColumn());
}

function mesas_editar_insertar_no_agrupada_desde_grupo(PDO $pdo, array $fila): void
{
    $numeroMesa = (int)$fila['numero_mesa'];

    // La estructura vieja y la nueva no siempre tienen el mismo índice único.
    // Para que sea estable en ambos casos, primero quitamos el registro previo
    // de ese número y luego insertamos la nueva versión como pendiente.
    $stmtDelete = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
    $stmtDelete->execute([$numeroMesa]);

    $stmt = $pdo->prepare('
        INSERT INTO mesas_no_agrupadas
            (numero_mesa, fecha_mesa, id_turno, hora, id_area, tipo_mesa, prioridad, cantidad_alumnos, motivo, estado)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');

    $stmt->execute([
        $numeroMesa,
        $fila['fecha_mesa'] ?? null,
        $fila['id_turno'] !== null ? (int)$fila['id_turno'] : null,
        $fila['hora'] ?? null,
        $fila['id_area'] !== null ? (int)$fila['id_area'] : null,
        $fila['tipo_mesa'] ?? 'simple',
        (int)($fila['prioridad'] ?? 0),
        (int)($fila['cantidad_alumnos'] ?? 0),
        'Quitada manualmente del grupo final. Pendiente de reagrupar.',
        'pendiente',
    ]);
}

function mesas_editar_fecha_a_indice_slot(string $fecha, int $idTurno): int
{
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
    if (!$dt) {
        return 0;
    }

    return ((int)$dt->format('Ymd') * 1000) + max(0, $idTurno);
}

function mesas_editar_normalizar_lista_numeros(array $numeros): array
{
    $out = [];
    foreach ($numeros as $numero) {
        $n = (int)$numero;
        if ($n > 0) {
            $out[$n] = $n;
        }
    }
    return array_values($out);
}

function mesas_editar_resolver_numeros_desde_payload(PDO $pdo, string $tipo, array $data): array
{
    if ($tipo === 'no_agrupada') {
        $idNoAgrupada = isset($data['id_no_agrupada']) ? (int)$data['id_no_agrupada'] : 0;
        $numeroMesa = isset($data['numero_mesa']) ? (int)$data['numero_mesa'] : 0;

        $actual = mesas_editar_obtener_no_agrupada_hidratada(
            $pdo,
            $idNoAgrupada > 0 ? $idNoAgrupada : null,
            $numeroMesa > 0 ? $numeroMesa : null
        );

        if (!$actual) {
            throw new RuntimeException('No se encontró el número sin agrupar solicitado.');
        }

        $numeroMesaReal = (int)($actual['numeros'][0]['numero_mesa'] ?? $numeroMesa);
        if ($numeroMesaReal <= 0) {
            throw new RuntimeException('No se pudo resolver el número de mesa sin agrupar.');
        }

        return [$numeroMesaReal];
    }

    $numeroGrupo = (int)($data['numero_grupo'] ?? $data['id_grupo'] ?? 0);
    if ($numeroGrupo <= 0) {
        throw new InvalidArgumentException('Debe indicar el grupo final que desea editar.');
    }

    $stmtNumeros = $pdo->prepare('SELECT numero_mesa FROM mesas_grupos WHERE numero_grupo = ? ORDER BY orden ASC');
    $stmtNumeros->execute([$numeroGrupo]);

    $numeros = mesas_editar_normalizar_lista_numeros($stmtNumeros->fetchAll(PDO::FETCH_COLUMN));
    if (count($numeros) === 0) {
        throw new RuntimeException('No se encontraron números de mesa dentro del grupo final.');
    }

    return $numeros;
}

function mesas_editar_obtener_detalle_numeros(PDO $pdo, array $numeros): array
{
    $numeros = mesas_editar_normalizar_lista_numeros($numeros);
    if (count($numeros) === 0) {
        throw new InvalidArgumentException('No hay números de mesa para validar.');
    }

    $placeholders = implode(',', array_fill(0, count($numeros), '?'));
    $stmt = $pdo->prepare(""
        . "SELECT\n"
        . "    me.id_mesa,\n"
        . "    me.numero_mesa,\n"
        . "    me.id_previa,\n"
        . "    me.id_docente,\n"
        . "    me.tipo_mesa,\n"
        . "    me.prioridad,\n"
        . "    p.dni,\n"
        . "    p.alumno,\n"
        . "    COALESCE(cat.id_materia, p.id_materia) AS id_materia,\n"
        . "    COALESCE(cat.id_curso, p.materia_id_curso) AS id_curso,\n"
        . "    mat.materia,\n"
        . "    doc.docente\n"
        . "FROM mesas me\n"
        . "LEFT JOIN previas p ON p.id_previa = me.id_previa\n"
        . "LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n"
        . "LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)\n"
        . "LEFT JOIN docentes doc ON doc.id_docente = me.id_docente\n"
        . "WHERE me.numero_mesa IN ({$placeholders})\n"
        . "ORDER BY me.numero_mesa ASC, me.id_mesa ASC"
    );
    $stmt->execute($numeros);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) === 0) {
        throw new RuntimeException('No se encontraron registros en mesas para validar la programación.');
    }

    $detalle = [
        'numeros' => $numeros,
        'ids_mesa' => [],
        'ids_previa' => [],
        'docentes' => [],
        'dnis' => [],
        'registros' => [],
        'dni_numeros' => [],
    ];

    foreach ($rows as $row) {
        $numeroMesa = (int)($row['numero_mesa'] ?? 0);
        $idMesa = (int)($row['id_mesa'] ?? 0);
        $idPrevia = (int)($row['id_previa'] ?? 0);
        $idDocente = (int)($row['id_docente'] ?? 0);
        $dni = trim((string)($row['dni'] ?? ''));

        if ($idMesa > 0) {
            $detalle['ids_mesa'][$idMesa] = $idMesa;
        }

        if ($idPrevia > 0) {
            $detalle['ids_previa'][$idPrevia] = $idPrevia;
        }

        if ($idDocente > 0) {
            $detalle['docentes'][$idDocente] = trim((string)($row['docente'] ?? 'Docente ' . $idDocente));
        }

        if ($dni !== '') {
            $detalle['dnis'][$dni] = trim((string)($row['alumno'] ?? $dni));
            if (!isset($detalle['dni_numeros'][$dni])) {
                $detalle['dni_numeros'][$dni] = [];
            }
            $detalle['dni_numeros'][$dni][$numeroMesa] = true;
        }

        $detalle['registros'][] = [
            'id_mesa' => $idMesa,
            'numero_mesa' => $numeroMesa,
            'id_previa' => $idPrevia,
            'id_docente' => $idDocente,
            'docente' => trim((string)($row['docente'] ?? '')),
            'dni' => $dni,
            'alumno' => trim((string)($row['alumno'] ?? '')),
            'id_materia' => (int)($row['id_materia'] ?? 0),
            'id_curso' => (int)($row['id_curso'] ?? 0),
            'materia' => trim((string)($row['materia'] ?? '')),
            'tipo_mesa' => (string)($row['tipo_mesa'] ?? 'simple'),
            'prioridad' => (int)($row['prioridad'] ?? 0),
        ];
    }

    $detalle['ids_mesa'] = array_values($detalle['ids_mesa']);
    $detalle['ids_previa'] = array_values($detalle['ids_previa']);

    return $detalle;
}

function mesas_editar_docentes_bloqueados_en_slot(PDO $pdo, array $idsDocentes, string $fechaMesa, int $idTurno): array
{
    $idsDocentes = array_values(array_filter(array_map('intval', $idsDocentes), static fn ($id) => $id > 0));
    if (count($idsDocentes) === 0 || !mesas_armado_tabla_existe($pdo, 'docentes_bloques_no')) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));
    $stmt = $pdo->prepare(""
        . "SELECT DISTINCT dbn.id_docente, d.docente\n"
        . "FROM docentes_bloques_no dbn\n"
        . "LEFT JOIN docentes d ON d.id_docente = dbn.id_docente\n"
        . "WHERE dbn.id_docente IN ({$placeholders})\n"
        . "  AND dbn.fecha = ?\n"
        . "  AND (dbn.id_turno IS NULL OR dbn.id_turno = ?)"
    );
    $stmt->execute(array_merge($idsDocentes, [$fechaMesa, $idTurno]));

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_editar_validar_docentes(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno): array
{
    $errores = [];
    $disponibilidad = mesas_armado_obtener_disponibilidad_docentes($pdo);

    foreach ($detalle['docentes'] as $idDocente => $nombreDocente) {
        $idDocente = (int)$idDocente;
        if ($idDocente <= 0) {
            continue;
        }

        if (mesas_armado_docente_no_disponible($disponibilidad, $idDocente, $fechaMesa, $idTurno)) {
            $errores[] = 'El docente ' . $nombreDocente . ' no tiene disponibilidad para esa fecha y turno.';
        }
    }

    $bloqueados = mesas_editar_docentes_bloqueados_en_slot($pdo, array_keys($detalle['docentes']), $fechaMesa, $idTurno);
    foreach ($bloqueados as $bloqueado) {
        $errores[] = 'El docente ' . trim((string)($bloqueado['docente'] ?? ('ID ' . $bloqueado['id_docente']))) . ' tiene bloqueado ese día/turno.';
    }

    if (count($detalle['docentes']) > 0) {
        $idsDocentes = array_keys($detalle['docentes']);
        $phDocentes = implode(',', array_fill(0, count($idsDocentes), '?'));
        $phNumeros = implode(',', array_fill(0, count($detalle['numeros']), '?'));

        $stmt = $pdo->prepare(""
            . "SELECT DISTINCT me.numero_mesa, me.id_docente, d.docente\n"
            . "FROM mesas me\n"
            . "LEFT JOIN docentes d ON d.id_docente = me.id_docente\n"
            . "WHERE me.fecha_mesa = ?\n"
            . "  AND me.id_turno = ?\n"
            . "  AND me.id_docente IN ({$phDocentes})\n"
            . "  AND me.numero_mesa NOT IN ({$phNumeros})\n"
            . "ORDER BY d.docente ASC, me.numero_mesa ASC"
        );
        $stmt->execute(array_merge([$fechaMesa, $idTurno], $idsDocentes, $detalle['numeros']));
        $choques = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($choques as $choque) {
            $errores[] = 'El docente ' . trim((string)($choque['docente'] ?? ('ID ' . $choque['id_docente']))) . ' ya está asignado en la mesa N° ' . (int)$choque['numero_mesa'] . ' para ese mismo turno.';
        }
    }

    return $errores;
}

function mesas_editar_validar_alumnos(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno): array
{
    $errores = [];

    foreach ($detalle['dni_numeros'] as $dni => $numerosMap) {
        if (count($numerosMap) > 1) {
            $alumno = $detalle['dnis'][$dni] ?? $dni;
            $errores[] = 'El alumno ' . $alumno . ' aparece en más de un número dentro de este mismo grupo. No puede rendir dos mesas en el mismo turno.';
        }
    }

    $dnis = array_keys($detalle['dnis']);
    if (count($dnis) === 0) {
        return $errores;
    }

    $phDnis = implode(',', array_fill(0, count($dnis), '?'));
    $phNumeros = implode(',', array_fill(0, count($detalle['numeros']), '?'));

    $stmt = $pdo->prepare(""
        . "SELECT DISTINCT p.dni, p.alumno, me.numero_mesa\n"
        . "FROM mesas me\n"
        . "INNER JOIN previas p ON p.id_previa = me.id_previa\n"
        . "WHERE me.fecha_mesa = ?\n"
        . "  AND me.id_turno = ?\n"
        . "  AND p.dni IN ({$phDnis})\n"
        . "  AND me.numero_mesa NOT IN ({$phNumeros})\n"
        . "ORDER BY p.alumno ASC, me.numero_mesa ASC"
    );
    $stmt->execute(array_merge([$fechaMesa, $idTurno], $dnis, $detalle['numeros']));
    $choques = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($choques as $choque) {
        $errores[] = 'El alumno ' . trim((string)($choque['alumno'] ?? $choque['dni'])) . ' ya tiene la mesa N° ' . (int)$choque['numero_mesa'] . ' en ese mismo turno.';
    }

    return $errores;
}

function mesas_editar_obtener_otras_previas_mismos_alumnos(PDO $pdo, array $detalle): array
{
    $dnis = array_keys($detalle['dnis']);
    if (count($dnis) === 0) {
        return [];
    }

    $phDnis = implode(',', array_fill(0, count($dnis), '?'));
    $phNumeros = implode(',', array_fill(0, count($detalle['numeros']), '?'));

    $stmt = $pdo->prepare(""
        . "SELECT\n"
        . "    me.id_previa,\n"
        . "    me.numero_mesa,\n"
        . "    me.fecha_mesa,\n"
        . "    me.id_turno,\n"
        . "    p.dni,\n"
        . "    p.alumno,\n"
        . "    COALESCE(cat.id_materia, p.id_materia) AS id_materia,\n"
        . "    COALESCE(cat.id_curso, p.materia_id_curso) AS id_curso,\n"
        . "    mat.materia\n"
        . "FROM mesas me\n"
        . "INNER JOIN previas p ON p.id_previa = me.id_previa\n"
        . "LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n"
        . "LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)\n"
        . "WHERE p.dni IN ({$phDnis})\n"
        . "  AND me.numero_mesa NOT IN ({$phNumeros})\n"
        . "  AND me.fecha_mesa IS NOT NULL\n"
        . "  AND me.id_turno IS NOT NULL\n"
        . "ORDER BY p.dni ASC, me.fecha_mesa ASC, me.id_turno ASC"
    );
    $stmt->execute(array_merge($dnis, $detalle['numeros']));

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_editar_obtener_correlativas(PDO $pdo): array
{
    if (!mesas_armado_tabla_existe($pdo, 'materias_correlativas')) {
        return [];
    }

    $stmt = $pdo->query(""
        . "SELECT id_materia, id_curso, id_materia_relacionada, id_curso_relacionada, tipo\n"
        . "FROM materias_correlativas\n"
        . "WHERE activo = 1\n"
        . "  AND bloquea_armado = 1"
    );

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_editar_registro_coincide_materia_curso(array $registro, int $idMateria, int $idCurso): bool
{
    return (int)($registro['id_materia'] ?? 0) === $idMateria
        && (int)($registro['id_curso'] ?? 0) === $idCurso;
}

function mesas_editar_validar_correlativas(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno): array
{
    $errores = [];
    $correlativas = mesas_editar_obtener_correlativas($pdo);
    if (count($correlativas) === 0) {
        return $errores;
    }

    $otras = mesas_editar_obtener_otras_previas_mismos_alumnos($pdo, $detalle);
    if (count($otras) === 0) {
        return $errores;
    }

    $indiceDestino = mesas_editar_fecha_a_indice_slot($fechaMesa, $idTurno);

    foreach ($detalle['registros'] as $actual) {
        if (($actual['dni'] ?? '') === '' || (int)($actual['id_materia'] ?? 0) <= 0 || (int)($actual['id_curso'] ?? 0) <= 0) {
            continue;
        }

        foreach ($otras as $otra) {
            if ((string)$otra['dni'] !== (string)$actual['dni']) {
                continue;
            }

            $indiceOtra = mesas_editar_fecha_a_indice_slot((string)$otra['fecha_mesa'], (int)$otra['id_turno']);

            foreach ($correlativas as $corr) {
                $idMateria = (int)$corr['id_materia'];
                $idCurso = (int)$corr['id_curso'];
                $idMateriaRel = (int)$corr['id_materia_relacionada'];
                $idCursoRel = (int)$corr['id_curso_relacionada'];
                $tipo = (string)$corr['tipo'];

                if ($tipo === 'anterior') {
                    // id_materia/id_curso es la materia posterior; id_materia_relacionada/id_curso_relacionada es la anterior.
                    if (mesas_editar_registro_coincide_materia_curso($actual, $idMateria, $idCurso)
                        && mesas_editar_registro_coincide_materia_curso($otra, $idMateriaRel, $idCursoRel)
                        && $indiceDestino <= $indiceOtra
                    ) {
                        $errores[] = 'Correlativa: ' . ($actual['alumno'] ?: $actual['dni']) . ' debe rendir ' . ($otra['materia'] ?: 'la correlativa anterior') . ' antes de ' . ($actual['materia'] ?: 'esta materia') . '.';
                    }

                    if (mesas_editar_registro_coincide_materia_curso($actual, $idMateriaRel, $idCursoRel)
                        && mesas_editar_registro_coincide_materia_curso($otra, $idMateria, $idCurso)
                        && $indiceDestino >= $indiceOtra
                    ) {
                        $errores[] = 'Correlativa: ' . ($actual['alumno'] ?: $actual['dni']) . ' debe rendir ' . ($actual['materia'] ?: 'esta materia') . ' antes de ' . ($otra['materia'] ?: 'la correlativa posterior') . '.';
                    }
                } elseif ($tipo === 'posterior') {
                    // id_materia_relacionada/id_curso_relacionada es la posterior.
                    if (mesas_editar_registro_coincide_materia_curso($actual, $idMateria, $idCurso)
                        && mesas_editar_registro_coincide_materia_curso($otra, $idMateriaRel, $idCursoRel)
                        && $indiceDestino >= $indiceOtra
                    ) {
                        $errores[] = 'Correlativa: ' . ($actual['alumno'] ?: $actual['dni']) . ' debe rendir ' . ($actual['materia'] ?: 'esta materia') . ' antes de ' . ($otra['materia'] ?: 'la correlativa posterior') . '.';
                    }

                    if (mesas_editar_registro_coincide_materia_curso($actual, $idMateriaRel, $idCursoRel)
                        && mesas_editar_registro_coincide_materia_curso($otra, $idMateria, $idCurso)
                        && $indiceDestino <= $indiceOtra
                    ) {
                        $errores[] = 'Correlativa: ' . ($actual['alumno'] ?: $actual['dni']) . ' debe rendir ' . ($otra['materia'] ?: 'la correlativa anterior') . ' antes de ' . ($actual['materia'] ?: 'esta materia') . '.';
                    }
                }
            }
        }
    }

    return array_values(array_unique($errores));
}

function mesas_editar_validar_programacion_completa(PDO $pdo, string $tipo, array $data, string $fechaMesa, int $idTurno, string $hora, array $turno): array
{
    $errores = [];
    $advertencias = [];
    $numeros = mesas_editar_resolver_numeros_desde_payload($pdo, $tipo, $data);
    $detalle = mesas_editar_obtener_detalle_numeros($pdo, $numeros);

    $errores = array_merge($errores, mesas_editar_validar_docentes($pdo, $detalle, $fechaMesa, $idTurno));
    $errores = array_merge($errores, mesas_editar_validar_alumnos($pdo, $detalle, $fechaMesa, $idTurno));
    $errores = array_merge($errores, mesas_editar_validar_correlativas($pdo, $detalle, $fechaMesa, $idTurno));

    return [
        'valido' => count($errores) === 0,
        'errores' => array_values(array_unique($errores)),
        'advertencias' => $advertencias,
        'numeros' => $numeros,
        'docentes' => $detalle['docentes'],
        'alumnos' => $detalle['dnis'],
        'hora' => $hora,
        'rango_horario' => mesas_editar_horario_rango_por_turno((string)$turno['turno']),
    ];
}

function mesas_editar_rango_fechas_para_slots(PDO $pdo, array $data, ?array $grupo = null): array
{
    $fechaInicio = mesas_editar_parametro_texto($data['fecha_inicio'] ?? null);
    $fechaFin = mesas_editar_parametro_texto($data['fecha_fin'] ?? null);

    // Solo se usa rango explícito cuando vienen las dos fechas reales.
    // Si el frontend manda undefined/null como texto, se ignora y se calcula por mes.
    if ($fechaInicio !== '' && $fechaFin !== '') {
        return [mesas_editar_normalizar_fecha_rango($fechaInicio), mesas_editar_normalizar_fecha_rango($fechaFin)];
    }

    $anio = mesas_editar_parametro_presente($data['anio'] ?? null) ? (int)$data['anio'] : 0;
    $mes = mesas_editar_parametro_presente($data['mes'] ?? null) ? (int)$data['mes'] : 0;

    if ($anio > 1900 && $mes >= 1 && $mes <= 12) {
        $inicio = new DateTimeImmutable(sprintf('%04d-%02d-01', $anio, $mes));
        $fin = $inicio->modify('last day of this month');
        return [$inicio->format('Y-m-d'), $fin->format('Y-m-d')];
    }

    $fechaBase = mesas_editar_parametro_texto($grupo['fecha_mesa'] ?? null);
    if ($fechaBase === '') {
        $stmt = $pdo->query('SELECT MIN(fecha_mesa) AS inicio, MAX(fecha_mesa) AS fin FROM mesas WHERE fecha_mesa IS NOT NULL');
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $fechaBase = mesas_editar_parametro_texto($row['inicio'] ?? null);
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaBase)) {
        $fechaBase = (new DateTimeImmutable('today'))->format('Y-m-d');
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $fechaBase) ?: new DateTimeImmutable('today');
    $inicio = $dt->modify('first day of this month');
    $fin = $dt->modify('last day of this month');

    return [$inicio->format('Y-m-d'), $fin->format('Y-m-d')];
}

function mesas_editar_construir_slots_validos(PDO $pdo, string $tipo, array $data, string $fechaInicio, string $fechaFin): array
{
    $turnos = $pdo->query('SELECT id_turno, turno FROM turnos WHERE activo = 1 ORDER BY id_turno ASC')->fetchAll(PDO::FETCH_ASSOC);
    $inicio = DateTimeImmutable::createFromFormat('!Y-m-d', $fechaInicio);
    $fin = DateTimeImmutable::createFromFormat('!Y-m-d', $fechaFin);

    if (!$inicio || !$fin || $fin < $inicio) {
        throw new InvalidArgumentException('El rango de fechas para validar no es correcto.');
    }

    $slots = [];
    $totalValidos = 0;

    for ($fecha = $inicio; $fecha <= $fin; $fecha = $fecha->modify('+1 day')) {
        $fechaYmd = $fecha->format('Y-m-d');
        $diaSemana = (int)$fecha->format('N');
        if ($diaSemana >= 6) {
            continue;
        }

        foreach ($turnos as $turno) {
            $idTurno = (int)$turno['id_turno'];
            $rango = mesas_editar_horario_rango_por_turno((string)$turno['turno']);
            $hora = $rango['default'] . ':00';

            try {
                $validacion = mesas_editar_validar_programacion_completa($pdo, $tipo, $data, $fechaYmd, $idTurno, $hora, $turno);
                $valido = (bool)$validacion['valido'];
                if ($valido) {
                    $totalValidos++;
                }

                $slots[] = [
                    'fecha_mesa' => $fechaYmd,
                    'id_turno' => $idTurno,
                    'turno' => $turno['turno'],
                    'hora_sugerida' => $hora,
                    'valido' => $valido,
                    'errores' => $validacion['errores'],
                    'rango_horario' => $rango,
                ];
            } catch (Throwable $e) {
                $slots[] = [
                    'fecha_mesa' => $fechaYmd,
                    'id_turno' => $idTurno,
                    'turno' => $turno['turno'],
                    'hora_sugerida' => $hora,
                    'valido' => false,
                    'errores' => [$e->getMessage()],
                    'rango_horario' => $rango,
                ];
            }
        }
    }

    return [
        'fecha_inicio' => $fechaInicio,
        'fecha_fin' => $fechaFin,
        'slots' => $slots,
        'total_validos' => $totalValidos,
    ];
}
