<?php
// backend/modules/mesas/edicion_por_docente/flechas/flechas_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';

function mesas_editar_docentes_flechas_int($valor, string $mensaje): int
{
    $numero = (int)($valor ?? 0);
    if ($numero <= 0) {
        throw new InvalidArgumentException($mensaje);
    }
    return $numero;
}

function mesas_editar_docentes_flechas_fecha_texto(?string $fecha): string
{
    $texto = trim((string)$fecha);
    if ($texto === '') {
        return '-';
    }

    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', substr($texto, 0, 10));
    return $dt ? $dt->format('d/m/Y') : $texto;
}

function mesas_editar_docentes_flechas_obtener_numero_meta(PDO $pdo, int $numeroMesa): ?array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    me.numero_mesa, '
        . '    MIN(me.fecha_mesa) AS fecha_mesa, '
        . '    MIN(me.id_turno) AS id_turno, '
        . '    MAX(t.turno) AS turno, '
        . '    MAX(me.tipo_mesa) AS tipo_mesa, '
        . '    MAX(me.prioridad) AS prioridad, '
        . '    COUNT(DISTINCT me.id_previa) AS cantidad_alumnos, '
        . '    MIN(am.id_area) AS id_area, '
        . '    MAX(ar.area) AS area, '
        . '    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ", ") AS materia, '
        . '    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ", ") AS docente '
        . 'FROM mesas me '
        . 'LEFT JOIN turnos t ON t.id_turno = me.id_turno '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia) '
        . 'LEFT JOIN docentes doc ON doc.id_docente = me.id_docente '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
        . 'LEFT JOIN areas ar ON ar.id_area = am.id_area '
        . 'WHERE me.numero_mesa = ? '
        . 'GROUP BY me.numero_mesa '
        . 'LIMIT 1'
    );
    $stmt->execute([$numeroMesa]);
    $meta = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$meta) {
        return null;
    }

    $stmtGrupo = $pdo->prepare('SELECT numero_grupo, hora FROM mesas_grupos WHERE numero_mesa = ? LIMIT 1');
    $stmtGrupo->execute([$numeroMesa]);
    $grupo = $stmtGrupo->fetch(PDO::FETCH_ASSOC);

    if ($grupo) {
        $meta['ubicacion'] = 'grupo';
        $meta['numero_grupo'] = (int)$grupo['numero_grupo'];
        $meta['hora'] = $grupo['hora'] ?? null;
    } else {
        $stmtNo = $pdo->prepare('SELECT id, hora FROM mesas_no_agrupadas WHERE numero_mesa = ? LIMIT 1');
        $stmtNo->execute([$numeroMesa]);
        $no = $stmtNo->fetch(PDO::FETCH_ASSOC);

        $meta['ubicacion'] = $no ? 'no_agrupada' : 'mesas';
        $meta['id_no_agrupada'] = $no ? (int)$no['id'] : null;
        $meta['numero_grupo'] = null;
        $meta['hora'] = $no['hora'] ?? null;
    }

    $meta['numero_mesa'] = (int)$meta['numero_mesa'];
    $meta['id_area'] = $meta['id_area'] !== null ? (int)$meta['id_area'] : null;
    $meta['id_turno'] = $meta['id_turno'] !== null ? (int)$meta['id_turno'] : null;
    $meta['prioridad'] = (int)($meta['prioridad'] ?? 0);
    $meta['cantidad_alumnos'] = (int)($meta['cantidad_alumnos'] ?? 0);

    return $meta;
}

function mesas_editar_docentes_flechas_obtener_numeros_grupo(PDO $pdo, int $numeroGrupo): array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    g.numero_mesa, g.orden, g.tipo_mesa, g.prioridad, g.cantidad_alumnos, '
        . '    GROUP_CONCAT(DISTINCT mat.materia ORDER BY mat.materia SEPARATOR ", ") AS materia, '
        . '    GROUP_CONCAT(DISTINCT doc.docente ORDER BY doc.docente SEPARATOR ", ") AS docente '
        . 'FROM mesas_grupos g '
        . 'LEFT JOIN mesas me ON me.numero_mesa = g.numero_mesa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
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
            'tipo_mesa' => $row['tipo_mesa'] ?? 'simple',
            'prioridad' => (int)($row['prioridad'] ?? 0),
            'cantidad_alumnos' => (int)($row['cantidad_alumnos'] ?? 0),
            'materia' => trim((string)($row['materia'] ?? '')),
            'docente' => trim((string)($row['docente'] ?? '')),
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function mesas_editar_docentes_flechas_obtener_docentes_numeros(PDO $pdo, array $numeros): array
{
    $numeros = mesas_editar_docentes_normalizar_lista_numeros($numeros);
    if (count($numeros) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($numeros), '?'));
    $stmt = $pdo->prepare(''
        . "SELECT DISTINCT me.id_docente, d.docente "
        . "FROM mesas me "
        . "LEFT JOIN docentes d ON d.id_docente = me.id_docente "
        . "WHERE me.numero_mesa IN ({$placeholders}) "
        . "  AND me.id_docente IS NOT NULL"
    );
    $stmt->execute($numeros);

    $docentes = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $id = (int)($row['id_docente'] ?? 0);
        if ($id > 0) {
            $docentes[$id] = trim((string)($row['docente'] ?? ('Docente ' . $id)));
        }
    }

    return $docentes;
}

function mesas_editar_docentes_flechas_reordenar_grupo(PDO $pdo, int $numeroGrupo): void
{
    $stmt = $pdo->prepare('SELECT id_mesa_grupo FROM mesas_grupos WHERE numero_grupo = ? ORDER BY orden ASC, numero_mesa ASC');
    $stmt->execute([$numeroGrupo]);
    $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $orden = 1;
    $update = $pdo->prepare('UPDATE mesas_grupos SET orden = ? WHERE id_mesa_grupo = ?');
    foreach ($ids as $id) {
        $update->execute([$orden, (int)$id]);
        $orden++;
    }
}

function mesas_editar_docentes_flechas_obtener_grupos_candidatos(PDO $pdo, int $numeroMesa, array $metaOrigen): array
{
    $esArmadoDocentes = mesas_editar_docentes_es_armado_por_docentes($pdo);
    $idArea = (int)($metaOrigen['id_area'] ?? 0);
    if (!$esArmadoDocentes && $idArea <= 0) {
        throw new RuntimeException('No se pudo resolver el área del número de mesa origen.');
    }

    $numeroGrupoOrigen = (int)($metaOrigen['numero_grupo'] ?? 0);

    $whereArea = $esArmadoDocentes ? '' : 'g.id_area = ? AND ';

    $sql = ''
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
        . '    SUM(g.cantidad_alumnos) AS cantidad_alumnos, '
        . '    SUM(CASE WHEN g.tipo_mesa = "taller" OR g.prioridad = 1 THEN 1 ELSE 0 END) AS cantidad_talleres, '
        . '    COALESCE(MAX(se.slots_extra), 0) AS slots_extra '
        . 'FROM mesas_grupos g '
        . 'LEFT JOIN turnos t ON t.id_turno = g.id_turno '
        . 'LEFT JOIN areas a ON a.id_area = g.id_area '
        . 'LEFT JOIN mesas_grupos_slots_extra se ON se.numero_grupo = g.numero_grupo '
        . 'WHERE ' . $whereArea . 'g.numero_mesa <> ? '
        . ($numeroGrupoOrigen > 0 ? '  AND g.numero_grupo <> ? ' : '')
        . 'GROUP BY g.numero_grupo '
        . 'ORDER BY MIN(g.fecha_mesa) ASC, MIN(g.id_turno) ASC, g.numero_grupo ASC';

    $params = $esArmadoDocentes ? [$numeroMesa] : [$idArea, $numeroMesa];
    if ($numeroGrupoOrigen > 0) {
        $params[] = $numeroGrupoOrigen;
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_editar_docentes_flechas_validar_destino(PDO $pdo, int $numeroMesa, array $metaOrigen, array $grupoDestino): array
{
    $errores = [];
    $advertencias = [];

    $tipoOrigen = trim((string)($metaOrigen['tipo_mesa'] ?? 'simple'));
    if ($tipoOrigen === 'taller') {
        $errores[] = 'Las mesas de taller son exclusivas y no se pueden unir a otro grupo.';
    }

    $numeroGrupoDestino = (int)($grupoDestino['numero_grupo'] ?? 0);
    if ($numeroGrupoDestino > 0) {
        $grupoDestino = mesas_editar_docentes_aplicar_area_canonica_a_fila_grupo($pdo, $grupoDestino);
    }

    $cantidadDestino = (int)($grupoDestino['cantidad_numeros'] ?? 0);
    $fechaDestino = substr((string)($grupoDestino['fecha_mesa'] ?? ''), 0, 10);
    $idTurnoDestino = (int)($grupoDestino['id_turno'] ?? 0);

    if ($numeroGrupoDestino <= 0) {
        $errores[] = 'El grupo destino no es válido.';
    }

    $capacidadDestino = mesas_editar_docentes_capacidad_slots_fila($pdo, $grupoDestino);
    if ($cantidadDestino >= (int)$capacidadDestino['capacidad_slots']) {
        $errores[] = 'El grupo destino no tiene slots libres. Habilitá un nuevo slot desde edición para poder mover otro número.';
    }

    if (mesas_editar_docentes_debe_respetar_area($pdo) && (int)($grupoDestino['id_area'] ?? 0) !== (int)($metaOrigen['id_area'] ?? 0)) {
        $errores[] = 'El grupo destino no pertenece al área de este número de mesa.';
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

    $numerosDestino = [];
    if ($numeroGrupoDestino > 0) {
        foreach (mesas_editar_docentes_flechas_obtener_numeros_grupo($pdo, $numeroGrupoDestino) as $num) {
            $n = (int)($num['numero_mesa'] ?? 0);
            if ($n > 0) {
                $numerosDestino[] = $n;
            }
        }
    }

    if (in_array($numeroMesa, $numerosDestino, true)) {
        $errores[] = 'El número de mesa ya pertenece al grupo destino.';
    }

    if (count($errores) === 0) {
        // En edición por disponibilidad docente se valida el estado FINAL del grupo,
        // no solo el número origen. Así, si el docente ya está dentro del grupo destino,
        // no se toma como choque falso; se controla disponibilidad, alumnos y correlativas
        // sobre el conjunto real que quedaría después del movimiento.
        $numerosFinales = array_values(array_unique(array_merge($numerosDestino, [$numeroMesa])));
        $detalleFinal = mesas_editar_docentes_obtener_detalle_numeros($pdo, $numerosFinales);

        $errores = array_merge($errores, mesas_editar_docentes_validar_docentes($pdo, $detalleFinal, $fechaDestino, $idTurnoDestino));
        $errores = array_merge($errores, mesas_editar_docentes_validar_alumnos($pdo, $detalleFinal, $fechaDestino, $idTurnoDestino));
        $errores = array_merge($errores, mesas_editar_docentes_validar_correlativas($pdo, $detalleFinal, $fechaDestino, $idTurnoDestino));

        $docentesFinales = $detalleFinal['docentes'] ?? [];
        if (($cantidadDestino + 1) >= 2 && count($docentesFinales) < 2) {
            $errores[] = 'El grupo resultante debe tener al menos 2 docentes distintos.';
        }
    }

    return [
        'valido' => count($errores) === 0,
        'errores' => array_values(array_unique($errores)),
        'advertencias' => $advertencias,
    ];
}

function mesas_editar_docentes_flechas_normalizar_destino_salida(PDO $pdo, array $grupo, array $validacion): array
{
    $numeroGrupo = (int)($grupo['numero_grupo'] ?? 0);
    $capacidad = mesas_editar_docentes_capacidad_slots_fila($pdo, $grupo);

    return [
        'numero_grupo' => $numeroGrupo,
        'id_grupo' => $numeroGrupo,
        'fecha_mesa' => substr((string)($grupo['fecha_mesa'] ?? ''), 0, 10),
        'fecha' => $grupo['fecha'] ?? mesas_editar_docentes_flechas_fecha_texto($grupo['fecha_mesa'] ?? null),
        'id_turno' => (int)($grupo['id_turno'] ?? 0),
        'hora' => $grupo['hora'] ?? null,
        'turno' => trim((string)($grupo['turno'] ?? '')),
        'id_area' => $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null,
        'area' => trim((string)($grupo['area'] ?? '')),
        'cantidad_numeros' => (int)($grupo['cantidad_numeros'] ?? 0),
        'slots_libres' => (int)$capacidad['slots_libres'],
        'slots_extra' => (int)$capacidad['slots_extra'],
        'capacidad_slots' => (int)$capacidad['capacidad_slots'],
        'capacidad_base_slots' => (int)$capacidad['capacidad_base_slots'],
        'es_grupo_taller' => !empty($capacidad['es_grupo_taller']),
        'cantidad_alumnos' => (int)($grupo['cantidad_alumnos'] ?? 0),
        'numeros' => mesas_editar_docentes_flechas_obtener_numeros_grupo($pdo, $numeroGrupo),
        'valido' => (bool)$validacion['valido'],
        'errores' => $validacion['errores'],
        'advertencias' => $validacion['advertencias'],
    ];
}

function mesas_editar_docentes_flechas_obtener_destinos(PDO $pdo, int $numeroMesa): array
{
    mesas_editar_docentes_normalizar_areas_grupos_finales($pdo);

    $metaOrigen = mesas_editar_docentes_flechas_obtener_numero_meta($pdo, $numeroMesa);
    if (!$metaOrigen) {
        throw new RuntimeException('No se encontró el número de mesa origen.');
    }

    $candidatos = mesas_editar_docentes_flechas_obtener_grupos_candidatos($pdo, $numeroMesa, $metaOrigen);
    $destinos = [];
    $descartados = 0;

    foreach ($candidatos as $grupo) {
        $validacion = mesas_editar_docentes_flechas_validar_destino($pdo, $numeroMesa, $metaOrigen, $grupo);
        if (!$validacion['valido']) {
            $descartados++;
            continue;
        }

        $destinos[] = mesas_editar_docentes_flechas_normalizar_destino_salida($pdo, $grupo, $validacion);
    }

    return [
        'numero_mesa' => $numeroMesa,
        'meta' => [
            'numero_mesa' => $numeroMesa,
            'numero_grupo' => $metaOrigen['numero_grupo'] ?? null,
            'ubicacion' => $metaOrigen['ubicacion'] ?? null,
            'fecha_mesa' => $metaOrigen['fecha_mesa'] ?? null,
            'fecha' => mesas_editar_docentes_flechas_fecha_texto($metaOrigen['fecha_mesa'] ?? null),
            'id_turno' => $metaOrigen['id_turno'] ?? null,
            'turno' => $metaOrigen['turno'] ?? null,
            'hora' => $metaOrigen['hora'] ?? null,
            'id_area' => $metaOrigen['id_area'] ?? null,
            'area' => $metaOrigen['area'] ?? null,
            'materia' => $metaOrigen['materia'] ?? null,
            'docente' => $metaOrigen['docente'] ?? null,
            'tipo_mesa' => $metaOrigen['tipo_mesa'] ?? null,
            'prioridad' => $metaOrigen['prioridad'] ?? 0,
            'cantidad_alumnos' => $metaOrigen['cantidad_alumnos'] ?? 0,
        ],
        'destinos' => $destinos,
        'cantidad' => count($destinos),
        'descartados_por_validacion' => $descartados,
    ];
}


function mesas_editar_docentes_flechas_numero_en_grupo(PDO $pdo, int $numeroMesa, int $numeroGrupo): bool
{
    if ($numeroMesa <= 0 || $numeroGrupo <= 0) {
        return false;
    }

    $stmt = $pdo->prepare('SELECT 1 FROM mesas_grupos WHERE numero_mesa = ? AND numero_grupo = ? LIMIT 1');
    $stmt->execute([$numeroMesa, $numeroGrupo]);
    return (bool)$stmt->fetchColumn();
}

function mesas_editar_docentes_flechas_consolidar_numero_en_destino(PDO $pdo, int $numeroMesa, int $numeroGrupoDestino): array
{
    $stmtGruposOrigen = $pdo->prepare('SELECT DISTINCT numero_grupo FROM mesas_grupos WHERE numero_mesa = ? AND numero_grupo <> ?');
    $stmtGruposOrigen->execute([$numeroMesa, $numeroGrupoDestino]);
    $gruposOrigen = array_values(array_filter(array_map('intval', $stmtGruposOrigen->fetchAll(PDO::FETCH_COLUMN)), static fn ($n) => $n > 0));

    // Si por un doble click o por un commit implícito quedó la mesa en dos grupos,
    // dejamos una sola pertenencia: la del grupo destino solicitado por el usuario.
    $stmtDeleteOtros = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = ? AND numero_grupo <> ?');
    $stmtDeleteOtros->execute([$numeroMesa, $numeroGrupoDestino]);

    $stmtDeleteNo = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
    $stmtDeleteNo->execute([$numeroMesa]);

    // Si por carrera quedaron dos filas iguales en el destino, conservamos la más antigua.
    $stmtDuplicados = $pdo->prepare('SELECT id_mesa_grupo FROM mesas_grupos WHERE numero_mesa = ? AND numero_grupo = ? ORDER BY id_mesa_grupo ASC');
    $stmtDuplicados->execute([$numeroMesa, $numeroGrupoDestino]);
    $ids = array_map('intval', $stmtDuplicados->fetchAll(PDO::FETCH_COLUMN));
    if (count($ids) > 1) {
        $idsBorrar = array_slice($ids, 1);
        $ph = implode(',', array_fill(0, count($idsBorrar), '?'));
        $pdo->prepare("DELETE FROM mesas_grupos WHERE id_mesa_grupo IN ({$ph})")->execute($idsBorrar);
    }

    // Sincronizamos fecha/turno/hora/área de la mesa con el grupo destino real.
    $stmtDestino = $pdo->prepare('SELECT fecha_mesa, id_turno, hora, id_area FROM mesas_grupos WHERE numero_grupo = ? ORDER BY orden ASC, id_mesa_grupo ASC LIMIT 1');
    $stmtDestino->execute([$numeroGrupoDestino]);
    $destino = $stmtDestino->fetch(PDO::FETCH_ASSOC) ?: [];

    if (!empty($destino)) {
        $stmtUpdateMesas = $pdo->prepare('UPDATE mesas SET fecha_mesa = ?, id_turno = ?, estado = IF(estado = "observada", estado, "borrador") WHERE numero_mesa = ?');
        $stmtUpdateMesas->execute([
            substr((string)($destino['fecha_mesa'] ?? ''), 0, 10),
            (int)($destino['id_turno'] ?? 0),
            $numeroMesa,
        ]);

        $metaNumero = mesas_editar_docentes_flechas_obtener_numero_meta($pdo, $numeroMesa);
        $idAreaNumero = mesas_editar_docentes_es_armado_por_docentes($pdo)
            ? (($metaNumero['id_area'] ?? null) !== null ? (int)$metaNumero['id_area'] : null)
            : ($destino['id_area'] !== null ? (int)$destino['id_area'] : null);

        $stmtUpdateGrupo = $pdo->prepare('UPDATE mesas_grupos SET fecha_mesa = ?, id_turno = ?, hora = ?, id_area = ? WHERE numero_mesa = ? AND numero_grupo = ?');
        $stmtUpdateGrupo->execute([
            substr((string)($destino['fecha_mesa'] ?? ''), 0, 10),
            (int)($destino['id_turno'] ?? 0),
            $destino['hora'] ?? null,
            $idAreaNumero,
            $numeroMesa,
            $numeroGrupoDestino,
        ]);
    }

    mesas_editar_docentes_flechas_reordenar_grupo($pdo, $numeroGrupoDestino);
    foreach ($gruposOrigen as $numeroGrupoOrigen) {
        mesas_editar_docentes_flechas_reparar_grupo_origen($pdo, $numeroGrupoOrigen);
    }

    return $gruposOrigen;
}

function mesas_editar_docentes_flechas_respuesta_estado_actual(PDO $pdo, int $numeroMesa, int $numeroGrupoDestino, ?int $numeroGrupoOrigen = null, string $mensaje = 'Número de mesa movido correctamente.'): array
{
    $gruposOrigen = mesas_editar_docentes_flechas_consolidar_numero_en_destino($pdo, $numeroMesa, $numeroGrupoDestino);
    $grupoDestino = mesas_editar_docentes_obtener_grupo_hidratado($pdo, $numeroGrupoDestino);

    return [
        'movido' => true,
        'sin_cambios' => true,
        'idempotente' => true,
        'mensaje' => $mensaje,
        'numero_mesa' => $numeroMesa,
        'numero_grupo_origen' => $numeroGrupoOrigen ?: ($gruposOrigen[0] ?? $numeroGrupoDestino),
        'numero_grupo_destino' => $numeroGrupoDestino,
        'fecha_mesa' => $grupoDestino['fecha_mesa'] ?? null,
        'id_turno' => $grupoDestino['id_turno'] ?? null,
        'validacion' => [
            'valido' => true,
            'errores' => [],
            'advertencias' => [],
        ],
        'grupo_destino' => $grupoDestino,
        'grupo_origen' => null,
        'reparacion_origen' => ['accion' => 'estado_final_ya_cumplido'],
    ];
}

function mesas_editar_docentes_flechas_resumen_numero_para_grupo(PDO $pdo, int $numeroMesa, array $metaOrigen): array
{
    $cantidad = (int)($metaOrigen['cantidad_alumnos'] ?? 0);
    if ($cantidad <= 0) {
        $stmt = $pdo->prepare('SELECT COUNT(DISTINCT id_previa) FROM mesas WHERE numero_mesa = ?');
        $stmt->execute([$numeroMesa]);
        $cantidad = (int)$stmt->fetchColumn();
    }

    return [
        'numero_mesa' => $numeroMesa,
        'tipo_mesa' => trim((string)($metaOrigen['tipo_mesa'] ?? 'simple')) ?: 'simple',
        'prioridad' => (int)($metaOrigen['prioridad'] ?? 0),
        'cantidad_alumnos' => $cantidad,
        'id_area' => $metaOrigen['id_area'] ?? null,
    ];
}

function mesas_editar_docentes_flechas_reparar_grupo_origen(PDO $pdo, int $numeroGrupoOrigen): array
{
    if ($numeroGrupoOrigen <= 0) {
        return ['accion' => 'sin_grupo_origen'];
    }

    $stmt = $pdo->prepare('SELECT * FROM mesas_grupos WHERE numero_grupo = ? ORDER BY orden ASC, numero_mesa ASC');
    $stmt->execute([$numeroGrupoOrigen]);
    $restantes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $cantidad = count($restantes);

    if ($cantidad === 0) {
        return ['accion' => 'grupo_origen_eliminado'];
    }

    if ($cantidad === 1) {
        mesas_editar_docentes_insertar_no_agrupada_desde_grupo($pdo, $restantes[0]);
        $delete = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ?');
        $delete->execute([$numeroGrupoOrigen]);
        return [
            'accion' => 'grupo_origen_convertido_a_no_agrupada',
            'numero_mesa_no_agrupada' => (int)$restantes[0]['numero_mesa'],
        ];
    }

    mesas_editar_docentes_flechas_reordenar_grupo($pdo, $numeroGrupoOrigen);
    return ['accion' => 'grupo_origen_reordenado', 'cantidad_restante' => $cantidad];
}

function mesas_editar_docentes_flechas_mover_numero(PDO $pdo, int $numeroMesa, int $numeroGrupoDestino): array
{
    $metaOrigen = mesas_editar_docentes_flechas_obtener_numero_meta($pdo, $numeroMesa);
    if (!$metaOrigen) {
        throw new RuntimeException('No se encontró el número de mesa origen.');
    }

    mesas_editar_docentes_normalizar_areas_grupos_finales($pdo, [$numeroGrupoDestino]);

    $stmtDestino = $pdo->prepare(''
        . 'SELECT '
        . '    g.numero_grupo, MIN(g.fecha_mesa) AS fecha_mesa, DATE_FORMAT(MIN(g.fecha_mesa), "%d/%m/%Y") AS fecha, '
        . '    MIN(g.id_turno) AS id_turno, MIN(g.hora) AS hora, MAX(t.turno) AS turno, '
        . '    MIN(g.id_area) AS id_area, MAX(a.area) AS area, COUNT(*) AS cantidad_numeros, '
        . '    SUM(g.cantidad_alumnos) AS cantidad_alumnos, '
        . '    SUM(CASE WHEN g.tipo_mesa = "taller" OR g.prioridad = 1 THEN 1 ELSE 0 END) AS cantidad_talleres, '
        . '    COALESCE(MAX(se.slots_extra), 0) AS slots_extra '
        . 'FROM mesas_grupos g '
        . 'LEFT JOIN turnos t ON t.id_turno = g.id_turno '
        . 'LEFT JOIN areas a ON a.id_area = g.id_area '
        . 'LEFT JOIN mesas_grupos_slots_extra se ON se.numero_grupo = g.numero_grupo '
        . 'WHERE g.numero_grupo = ? '
        . 'GROUP BY g.numero_grupo '
        . 'LIMIT 1'
    );
    $stmtDestino->execute([$numeroGrupoDestino]);
    $grupoDestino = $stmtDestino->fetch(PDO::FETCH_ASSOC);

    if (!$grupoDestino) {
        throw new RuntimeException('No se encontró el grupo destino.');
    }

    $grupoDestino = mesas_editar_docentes_aplicar_area_canonica_a_fila_grupo($pdo, $grupoDestino);

    $numeroGrupoOrigen = (int)($metaOrigen['numero_grupo'] ?? 0);

    // Blindaje idempotente fuerte: si el frontend dispara dos POST iguales o si el
    // primer intento ya alcanzó a insertar la mesa en el destino, el segundo intento
    // NO debe devolver 422. Se consolida el estado final pedido y se responde éxito.
    if ($numeroGrupoOrigen === $numeroGrupoDestino || mesas_editar_docentes_flechas_numero_en_grupo($pdo, $numeroMesa, $numeroGrupoDestino)) {
        return mesas_editar_docentes_flechas_respuesta_estado_actual(
            $pdo,
            $numeroMesa,
            $numeroGrupoDestino,
            $numeroGrupoOrigen,
            'El número de mesa ya está en el grupo destino.'
        );
    }

    $validacion = mesas_editar_docentes_flechas_validar_destino($pdo, $numeroMesa, $metaOrigen, $grupoDestino);
    if (!$validacion['valido']) {
        // Segundo blindaje: si la validación falla porque otra llamada simultánea ya
        // dejó la mesa en el destino, el estado final es correcto. Respondemos éxito.
        if (mesas_editar_docentes_flechas_numero_en_grupo($pdo, $numeroMesa, $numeroGrupoDestino)) {
            return mesas_editar_docentes_flechas_respuesta_estado_actual(
                $pdo,
                $numeroMesa,
                $numeroGrupoDestino,
                $numeroGrupoOrigen,
                'El número de mesa ya había sido movido al grupo destino.'
            );
        }

        return [
            'movido' => false,
            'validacion' => $validacion,
            'numero_mesa' => $numeroMesa,
            'numero_grupo_destino' => $numeroGrupoDestino,
        ];
    }

    $resumen = mesas_editar_docentes_flechas_resumen_numero_para_grupo($pdo, $numeroMesa, $metaOrigen);
    $fechaDestino = substr((string)$grupoDestino['fecha_mesa'], 0, 10);
    $idTurnoDestino = (int)$grupoDestino['id_turno'];
    $horaDestino = $grupoDestino['hora'] ?? null;
    $idAreaDestino = mesas_editar_docentes_es_armado_por_docentes($pdo)
        ? ($resumen['id_area'] !== null ? (int)$resumen['id_area'] : null)
        : ($grupoDestino['id_area'] !== null ? (int)$grupoDestino['id_area'] : null);

    $stmtDelGrupo = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = ?');
    $stmtDelGrupo->execute([$numeroMesa]);

    $stmtDelNo = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
    $stmtDelNo->execute([$numeroMesa]);

    $stmtUpdateMesas = $pdo->prepare(''
        . 'UPDATE mesas '
        . 'SET fecha_mesa = ?, id_turno = ?, estado = IF(estado = "observada", estado, "borrador") '
        . 'WHERE numero_mesa = ?'
    );
    $stmtUpdateMesas->execute([$fechaDestino, $idTurnoDestino, $numeroMesa]);

    $stmtOrden = $pdo->prepare('SELECT COALESCE(MAX(orden), 0) + 1 FROM mesas_grupos WHERE numero_grupo = ?');
    $stmtOrden->execute([$numeroGrupoDestino]);
    $orden = max(1, (int)$stmtOrden->fetchColumn());

    $stmtInsert = $pdo->prepare(''
        . 'INSERT INTO mesas_grupos '
        . '    (numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area, orden, tipo_mesa, prioridad, cantidad_alumnos, estado, observacion) '
        . 'VALUES '
        . '    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "borrador", NULL)'
    );
    $stmtInsert->execute([
        $numeroGrupoDestino,
        $numeroMesa,
        $fechaDestino,
        $idTurnoDestino,
        $horaDestino,
        $idAreaDestino,
        $orden,
        $resumen['tipo_mesa'],
        $resumen['prioridad'],
        $resumen['cantidad_alumnos'],
    ]);

    mesas_editar_docentes_flechas_reordenar_grupo($pdo, $numeroGrupoDestino);
    $reparacionOrigen = $numeroGrupoOrigen !== $numeroGrupoDestino
        ? mesas_editar_docentes_flechas_reparar_grupo_origen($pdo, $numeroGrupoOrigen)
        : ['accion' => 'mismo_grupo'];

    return [
        'movido' => true,
        'numero_mesa' => $numeroMesa,
        'numero_grupo_origen' => $numeroGrupoOrigen ?: null,
        'numero_grupo_destino' => $numeroGrupoDestino,
        'fecha_mesa' => $fechaDestino,
        'id_turno' => $idTurnoDestino,
        'validacion' => $validacion,
        'grupo_destino' => mesas_editar_docentes_obtener_grupo_hidratado($pdo, $numeroGrupoDestino),
        'grupo_origen' => $numeroGrupoOrigen > 0 ? mesas_editar_docentes_obtener_grupo_hidratado($pdo, $numeroGrupoOrigen) : null,
        'reparacion_origen' => $reparacionOrigen,
    ];
}
