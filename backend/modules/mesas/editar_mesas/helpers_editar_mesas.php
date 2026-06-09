<?php
// backend/modules/mesas/editar_mesas/helpers_editar_mesas.php
declare(strict_types=1);

require_once __DIR__ . '/../armado_rango_helper.php';

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



function mesas_editar_tipo_armado_actual(PDO $pdo): string
{
    return 'area';
}

function mesas_editar_debe_respetar_area(PDO $pdo): bool
{
    return true;
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


function mesas_editar_slots_extra_asegurar_tabla(PDO $pdo): void
{
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS mesas_grupos_slots_extra (
            numero_grupo INT UNSIGNED NOT NULL,
            slots_extra TINYINT UNSIGNED NOT NULL DEFAULT 0,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (numero_grupo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    // Evita que queden slots extra enganchados a grupos de armados anteriores.
    try {
        $pdo->exec('
            DELETE se
            FROM mesas_grupos_slots_extra se
            LEFT JOIN mesas_grupos g ON g.numero_grupo = se.numero_grupo
            WHERE g.numero_grupo IS NULL
        ');
    } catch (Throwable $e) {
        // No corta la edición si la limpieza auxiliar falla.
    }
}

function mesas_editar_slots_extra_obtener(PDO $pdo, int $numeroGrupo): int
{
    if ($numeroGrupo <= 0) {
        return 0;
    }

    try {
        $stmt = $pdo->prepare('SELECT COALESCE(slots_extra, 0) FROM mesas_grupos_slots_extra WHERE numero_grupo = ? LIMIT 1');
        $stmt->execute([$numeroGrupo]);
        return max(0, (int)($stmt->fetchColumn() ?: 0));
    } catch (Throwable $e) {
        // Si el proyecto todavía no creó la tabla auxiliar, se comporta como antes: sin slots extra.
        return 0;
    }
}

function mesas_editar_slots_extra_incrementar(PDO $pdo, int $numeroGrupo, int $maxExtra = 12): int
{
    if ($numeroGrupo <= 0) {
        throw new InvalidArgumentException('Debe indicar el grupo al que querés habilitarle un nuevo slot.');
    }

    mesas_editar_slots_extra_asegurar_tabla($pdo);

    $maxExtra = max(1, min(20, $maxExtra));
    $stmt = $pdo->prepare('
        INSERT INTO mesas_grupos_slots_extra (numero_grupo, slots_extra)
        VALUES (?, 1)
        ON DUPLICATE KEY UPDATE
            slots_extra = LEAST(slots_extra + 1, ?),
            actualizado_en = CURRENT_TIMESTAMP
    ');
    $stmt->execute([$numeroGrupo, $maxExtra]);

    return mesas_editar_slots_extra_obtener($pdo, $numeroGrupo);
}

function mesas_editar_slots_extra_decrementar(PDO $pdo, int $numeroGrupo): int
{
    if ($numeroGrupo <= 0) {
        throw new InvalidArgumentException('Debe indicar el grupo al que querés quitarle el slot libre.');
    }

    mesas_editar_slots_extra_asegurar_tabla($pdo);

    $actual = mesas_editar_obtener_grupo_hidratado($pdo, $numeroGrupo);
    if (!$actual) {
        throw new RuntimeException('No se encontró el grupo al que querés quitarle el slot libre.');
    }

    $slotsExtra = (int)($actual['slots_extra'] ?? 0);
    $slotsLibres = (int)($actual['slots_libres'] ?? 0);

    if ($slotsExtra <= 0) {
        throw new InvalidArgumentException('Este grupo no tiene slots agregados manualmente para eliminar.');
    }

    if ($slotsLibres <= 0) {
        throw new InvalidArgumentException('No se puede eliminar el slot porque ya está ocupado por un número de mesa.');
    }

    $stmt = $pdo->prepare('
        UPDATE mesas_grupos_slots_extra
        SET slots_extra = GREATEST(slots_extra - 1, 0),
            actualizado_en = CURRENT_TIMESTAMP
        WHERE numero_grupo = ? AND slots_extra > 0
    ');
    $stmt->execute([$numeroGrupo]);

    $pdo->prepare('DELETE FROM mesas_grupos_slots_extra WHERE numero_grupo = ? AND slots_extra <= 0')->execute([$numeroGrupo]);

    return mesas_editar_slots_extra_obtener($pdo, $numeroGrupo);
}

function mesas_editar_grupo_es_taller_por_numeros(array $numeros, array $grupo = []): bool
{
    foreach ($numeros as $numero) {
        $tipo = mb_strtolower(trim((string)($numero['tipo_mesa'] ?? $numero['tipo_numero'] ?? $numero['tipo'] ?? '')), 'UTF-8');
        if ($tipo === 'taller' || str_contains($tipo, 'taller')) {
            return true;
        }

        if ((int)($numero['prioridad'] ?? $numero['prioridad_numero'] ?? 0) === 1) {
            return true;
        }
    }

    $textoTipos = mb_strtolower(trim((string)($grupo['tipos_mesa_texto'] ?? $grupo['tipo_mesa'] ?? '')), 'UTF-8');
    return $textoTipos !== '' && str_contains($textoTipos, 'taller');
}

function mesas_editar_capacidad_slots_calcular(int $cantidadNumeros, bool $esTaller, int $slotsExtra = 0): array
{
    $cantidadNumeros = max(0, $cantidadNumeros);
    $slotsExtra = max(0, $slotsExtra);

    // Mesas comunes: mantienen 4 slots base. Mesas especiales/taller: arrancan con solo sus slots reales.
    $base = $esTaller ? 1 : 4;
    $capacidad = max($cantidadNumeros, $base + $slotsExtra);

    return [
        'es_grupo_taller' => $esTaller,
        'slots_extra' => $slotsExtra,
        'capacidad_base_slots' => $base,
        'capacidad_slots' => $capacidad,
        'slots_libres' => max(0, $capacidad - $cantidadNumeros),
    ];
}

function mesas_editar_capacidad_slots_fila(PDO $pdo, array $grupo): array
{
    $numeroGrupo = (int)($grupo['numero_grupo'] ?? $grupo['id_grupo'] ?? 0);
    $cantidadNumeros = (int)($grupo['cantidad_numeros'] ?? 0);
    $cantidadTalleres = (int)($grupo['cantidad_talleres'] ?? 0);
    $slotsExtra = array_key_exists('slots_extra', $grupo)
        ? (int)$grupo['slots_extra']
        : mesas_editar_slots_extra_obtener($pdo, $numeroGrupo);

    return mesas_editar_capacidad_slots_calcular($cantidadNumeros, $cantidadTalleres > 0, $slotsExtra);
}

function mesas_editar_aplicar_slots_extra_a_grupo(PDO $pdo, array $grupo): array
{
    $numeroGrupo = (int)($grupo['numero_grupo'] ?? $grupo['id_grupo'] ?? 0);
    $numeros = is_array($grupo['numeros'] ?? null) ? $grupo['numeros'] : [];
    $cantidadNumeros = count($numeros) > 0 ? count($numeros) : (int)($grupo['cantidad_numeros'] ?? 0);
    $esTaller = mesas_editar_grupo_es_taller_por_numeros($numeros, $grupo);
    $slotsExtra = mesas_editar_slots_extra_obtener($pdo, $numeroGrupo);
    $capacidad = mesas_editar_capacidad_slots_calcular($cantidadNumeros, $esTaller, $slotsExtra);

    return array_merge($grupo, $capacidad);
}

function mesas_editar_area_nombre_por_id(PDO $pdo, ?int $idArea): string
{
    $idArea = (int)($idArea ?? 0);
    if ($idArea <= 0) {
        return '';
    }

    $stmt = $pdo->prepare('SELECT area FROM areas WHERE id_area = ? LIMIT 1');
    $stmt->execute([$idArea]);
    return trim((string)($stmt->fetchColumn() ?: ''));
}

function mesas_editar_area_canonica_grupo(PDO $pdo, int $numeroGrupo): ?array
{
    if ($numeroGrupo <= 0) {
        return null;
    }

    // mesas_grupos no tiene una cabecera de grupo; el área se guarda repetida por fila.
    // Si por una edición anterior quedó un grupo con filas de áreas distintas, MIN(id_area)
    // puede marcar cualquier cosa y después el backend rechaza movimientos válidos.
    // Tomamos como área del grupo la mayoritaria. Ante empate, la del primer orden.
    $stmt = $pdo->prepare(''
        . 'SELECT g.id_area, COUNT(*) AS cantidad, MIN(g.orden) AS primer_orden, MIN(g.id_mesa_grupo) AS primer_id '
        . 'FROM mesas_grupos g '
        . 'WHERE g.numero_grupo = ? AND g.id_area IS NOT NULL '
        . 'GROUP BY g.id_area '
        . 'ORDER BY cantidad DESC, primer_orden ASC, primer_id ASC, g.id_area ASC '
        . 'LIMIT 1'
    );
    $stmt->execute([$numeroGrupo]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row || (int)($row['id_area'] ?? 0) <= 0) {
        return null;
    }

    $idArea = (int)$row['id_area'];
    return [
        'id_area' => $idArea,
        'area' => mesas_editar_area_nombre_por_id($pdo, $idArea),
    ];
}

function mesas_editar_normalizar_area_grupo(PDO $pdo, int $numeroGrupo): ?array
{
    $area = mesas_editar_area_canonica_grupo($pdo, $numeroGrupo);
    if (!$area) {
        return null;
    }

    // Deja el grupo consistente. Esto corrige estados viejos donde un número quedó
    // dentro de un grupo, pero con id_area propio en vez del área del grupo.
    $stmt = $pdo->prepare(''
        . 'UPDATE mesas_grupos '
        . 'SET id_area = ? '
        . 'WHERE numero_grupo = ? AND (id_area IS NULL OR id_area <> ?)'
    );
    $stmt->execute([(int)$area['id_area'], $numeroGrupo, (int)$area['id_area']]);

    return $area;
}

function mesas_editar_normalizar_areas_grupos_finales(PDO $pdo, ?array $numerosGrupo = null): void
{
    $params = [];
    $where = '';

    if (is_array($numerosGrupo) && count($numerosGrupo) > 0) {
        $numeros = array_values(array_unique(array_filter(array_map('intval', $numerosGrupo), static fn ($n) => $n > 0)));
        if (count($numeros) === 0) {
            return;
        }
        $where = 'WHERE numero_grupo IN (' . implode(',', array_fill(0, count($numeros), '?')) . ')';
        $params = $numeros;
    }

    $stmt = $pdo->prepare('SELECT DISTINCT numero_grupo FROM mesas_grupos ' . $where . ' ORDER BY numero_grupo ASC');
    $stmt->execute($params);

    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $numeroGrupo) {
        mesas_editar_normalizar_area_grupo($pdo, (int)$numeroGrupo);
    }
}

function mesas_editar_aplicar_area_canonica_a_fila_grupo(PDO $pdo, array $grupo): array
{
    $numeroGrupo = (int)($grupo['numero_grupo'] ?? $grupo['id_grupo'] ?? 0);
    if ($numeroGrupo <= 0) {
        return $grupo;
    }

    $area = mesas_editar_normalizar_area_grupo($pdo, $numeroGrupo);
    if ($area) {
        $grupo['id_area'] = (int)$area['id_area'];
        $grupo['area'] = $area['area'];
    }

    return $grupo;
}


function mesas_editar_obtener_grupo_hidratado(PDO $pdo, int $numeroGrupo): ?array
{
    // Importante: esta función también se usa dentro de transacciones de edición.
    // En MySQL/MariaDB los CREATE/ALTER/DROP hacen COMMIT implícito; por eso no
    // se ejecuta el asegurado estructural si ya hay una transacción activa.
    if (!$pdo->inTransaction()) {
        mesas_armado_grupos_asegurar_tablas($pdo);
    }

    mesas_editar_normalizar_area_grupo($pdo, $numeroGrupo);

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

    if (!$pdo->inTransaction()) {
        mesas_editar_slots_extra_asegurar_tabla($pdo);
    }

    $grupos = mesas_armado_grupos_hidratar_detalles($pdo, [$base], [$numeroGrupo]);
    if (empty($grupos[0]) || !is_array($grupos[0])) {
        return null;
    }

    return mesas_editar_aplicar_slots_extra_a_grupo($pdo, $grupos[0]);
}

function mesas_editar_obtener_no_agrupada_hidratada(PDO $pdo, ?int $idNoAgrupada = null, ?int $numeroMesa = null): ?array
{
    // Evita DDL dentro de transacciones de edición para no provocar commits implícitos.
    if (!$pdo->inTransaction()) {
        mesas_armado_grupos_asegurar_tablas($pdo);
    }

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
                'curso' => trim((string)(($filaDetalle['curso_materia'] ?? '') . ' ' . ($filaDetalle['division_materia'] ?? ''))),
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


function mesas_editar_rango_fechas_existentes_armado(PDO $pdo): ?array
{
    try {
        $stmt = $pdo->query("
            SELECT MIN(fecha_mesa) AS fecha_inicio, MAX(fecha_mesa) AS fecha_fin
            FROM (
                SELECT fecha_mesa FROM mesas_grupos WHERE fecha_mesa IS NOT NULL
                UNION ALL
                SELECT fecha_mesa FROM mesas_no_agrupadas WHERE fecha_mesa IS NOT NULL
                UNION ALL
                SELECT fecha_mesa FROM mesas WHERE fecha_mesa IS NOT NULL
            ) fechas_armado
        ");

        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
        if (!$row) {
            return null;
        }

        $inicio = mesas_editar_normalizar_fecha_rango((string)($row['fecha_inicio'] ?? ''));
        $fin = mesas_editar_normalizar_fecha_rango((string)($row['fecha_fin'] ?? ''));

        if ($fin < $inicio) {
            [$inicio, $fin] = [$fin, $inicio];
        }

        return [
            'fecha_inicio' => $inicio,
            'fecha_fin' => $fin,
            'tipo_armado' => '',
            'origen' => 'fechas_reales_del_armado_actual',
        ];
    } catch (Throwable $e) {
        return null;
    }
}

function mesas_editar_rango_contiene_fecha(?array $rango, ?string $fecha): bool
{
    $fecha = trim((string)$fecha);
    if ($fecha === '' || !$rango || empty($rango['fecha_inicio']) || empty($rango['fecha_fin'])) {
        return false;
    }

    return $fecha >= (string)$rango['fecha_inicio'] && $fecha <= (string)$rango['fecha_fin'];
}

function mesas_editar_rango_armado_confiable(PDO $pdo, ?array $rangoBase = null): ?array
{
    $rangoBase = $rangoBase ?? (function_exists('mesas_armado_rango_obtener_actual') ? mesas_armado_rango_obtener_actual($pdo) : null);
    $rangoReal = mesas_editar_rango_fechas_existentes_armado($pdo);

    if (!$rangoBase || empty($rangoBase['fecha_inicio']) || empty($rangoBase['fecha_fin'])) {
        return $rangoReal;
    }

    if (!$rangoReal || empty($rangoReal['fecha_inicio']) || empty($rangoReal['fecha_fin'])) {
        return $rangoBase;
    }

    $inicioBase = (string)$rangoBase['fecha_inicio'];
    $finBase = (string)$rangoBase['fecha_fin'];
    $inicioReal = (string)$rangoReal['fecha_inicio'];
    $finReal = (string)$rangoReal['fecha_fin'];

    if ($finBase < $inicioBase) {
        [$inicioBase, $finBase] = [$finBase, $inicioBase];
    }

    if ($finReal < $inicioReal) {
        [$inicioReal, $finReal] = [$finReal, $inicioReal];
    }

    // Si la tabla/auditoría de rango quedó vieja, puede excluir fechas que ya existen
    // en mesas_grupos/mesas. En edición eso dejaba bloqueado incluso el día real en
    // que la mesa fue armada. Para la edición, el rango confiable nunca debe dejar
    // afuera fechas reales del armado actual.
    if ($inicioReal < $inicioBase || $finReal > $finBase) {
        return [
            'fecha_inicio' => min($inicioBase, $inicioReal),
            'fecha_fin' => max($finBase, $finReal),
            'tipo_armado' => trim((string)($rangoBase['tipo_armado'] ?? '')),
            'origen' => 'rango_expandido_por_fechas_reales_del_armado_actual',
            'rango_configurado' => $rangoBase,
            'rango_real' => $rangoReal,
        ];
    }

    return $rangoBase;
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
        . "    p.id_materia AS id_materia,\n"
        . "    p.materia_id_curso AS id_curso,\n"
        . "    mat.materia,\n"
        . "    doc.docente\n"
        . "FROM mesas me\n"
        . "LEFT JOIN previas p ON p.id_previa = me.id_previa\n"
        . "LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n"
        . "LEFT JOIN materias mat ON mat.id_materia = p.id_materia\n"
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


function mesas_editar_slot_key(string $fechaMesa, int $idTurno): string
{
    return $fechaMesa . '|' . $idTurno;
}

function mesas_editar_slot_actual_desde_item(?array $item): ?array
{
    if (!is_array($item)) {
        return null;
    }

    $fecha = mesas_editar_parametro_texto($item['fecha_mesa'] ?? null);
    if ($fecha === '') {
        $fecha = mesas_editar_parametro_texto($item['fecha'] ?? null);
    }
    $fecha = mesas_editar_fecha_slot_segura($fecha);

    $idTurno = (int)($item['id_turno'] ?? 0);
    if ($fecha === '' || $idTurno <= 0) {
        return null;
    }

    return [
        'fecha_mesa' => $fecha,
        'id_turno' => $idTurno,
    ];
}

function mesas_editar_fecha_slot_segura(?string $fecha): string
{
    $fecha = trim((string)$fecha);
    if (preg_match('/^\d{4}-\d{2}-\d{2}/', $fecha)) {
        return substr($fecha, 0, 10);
    }

    if (preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $fecha)) {
        [$dia, $mes, $anio] = explode('/', $fecha);
        return $anio . '-' . $mes . '-' . $dia;
    }

    return '';
}

function mesas_editar_obtener_slot_actual(PDO $pdo, string $tipo, array $data, ?array $itemActual = null): ?array
{
    $desdeItem = mesas_editar_slot_actual_desde_item($itemActual);
    if ($desdeItem !== null) {
        return $desdeItem;
    }

    try {
        if ($tipo === 'no_agrupada') {
            $idNoAgrupada = isset($data['id_no_agrupada']) ? (int)$data['id_no_agrupada'] : 0;
            $numeroMesa = isset($data['numero_mesa']) ? (int)$data['numero_mesa'] : 0;

            $where = [];
            $params = [];

            if ($idNoAgrupada > 0) {
                $where[] = 'id = ?';
                $params[] = $idNoAgrupada;
            }
            if ($numeroMesa > 0) {
                $where[] = 'numero_mesa = ?';
                $params[] = $numeroMesa;
            }

            if ($where) {
                $stmt = $pdo->prepare(''
                    . 'SELECT fecha_mesa, id_turno '
                    . 'FROM mesas_no_agrupadas '
                    . 'WHERE (' . implode(' OR ', $where) . ') '
                    . '  AND fecha_mesa IS NOT NULL '
                    . '  AND id_turno IS NOT NULL '
                    . 'ORDER BY id ASC '
                    . 'LIMIT 1'
                );
                $stmt->execute($params);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $fecha = mesas_editar_fecha_slot_segura($row['fecha_mesa'] ?? null);
                    $idTurno = (int)($row['id_turno'] ?? 0);
                    if ($fecha !== '' && $idTurno > 0) {
                        return ['fecha_mesa' => $fecha, 'id_turno' => $idTurno];
                    }
                }
            }

            if ($numeroMesa > 0) {
                $stmt = $pdo->prepare(''
                    . 'SELECT fecha_mesa, id_turno '
                    . 'FROM mesas '
                    . 'WHERE numero_mesa = ? '
                    . '  AND fecha_mesa IS NOT NULL '
                    . '  AND id_turno IS NOT NULL '
                    . 'GROUP BY fecha_mesa, id_turno '
                    . 'ORDER BY COUNT(*) DESC, MIN(id_mesa) ASC '
                    . 'LIMIT 1'
                );
                $stmt->execute([$numeroMesa]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $fecha = mesas_editar_fecha_slot_segura($row['fecha_mesa'] ?? null);
                    $idTurno = (int)($row['id_turno'] ?? 0);
                    if ($fecha !== '' && $idTurno > 0) {
                        return ['fecha_mesa' => $fecha, 'id_turno' => $idTurno];
                    }
                }
            }

            return null;
        }

        $numeroGrupo = (int)($data['numero_grupo'] ?? $data['id_grupo'] ?? 0);
        if ($numeroGrupo <= 0) {
            return null;
        }

        // El slot actual sale de la tabla de grupos, no de la validación. Si una mesa
        // ya fue armada ahí, ese día/turno debe quedar habilitado en edición aunque
        // haya una restricción preexistente o un choque heredado del armado anterior.
        $stmt = $pdo->prepare(''
            . 'SELECT fecha_mesa, id_turno '
            . 'FROM mesas_grupos '
            . 'WHERE numero_grupo = ? '
            . '  AND fecha_mesa IS NOT NULL '
            . '  AND id_turno IS NOT NULL '
            . 'GROUP BY fecha_mesa, id_turno '
            . 'ORDER BY COUNT(*) DESC, MIN(orden) ASC, MIN(id_mesa_grupo) ASC '
            . 'LIMIT 1'
        );
        $stmt->execute([$numeroGrupo]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $fecha = mesas_editar_fecha_slot_segura($row['fecha_mesa'] ?? null);
            $idTurno = (int)($row['id_turno'] ?? 0);
            if ($fecha !== '' && $idTurno > 0) {
                return ['fecha_mesa' => $fecha, 'id_turno' => $idTurno];
            }
        }
    } catch (Throwable $e) {
        return null;
    }

    return null;
}

function mesas_editar_es_slot_actual(array $contexto, string $fechaMesa, int $idTurno): bool
{
    $slotActual = is_array($contexto['slot_actual'] ?? null) ? $contexto['slot_actual'] : null;
    if (!$slotActual) {
        return false;
    }

    $fechaActual = mesas_editar_fecha_slot_segura($slotActual['fecha_mesa'] ?? null);
    $turnoActual = (int)($slotActual['id_turno'] ?? 0);

    return $fechaActual !== ''
        && $turnoActual > 0
        && $fechaActual === mesas_editar_fecha_slot_segura($fechaMesa)
        && $turnoActual === $idTurno;
}

function mesas_editar_precargar_bloqueos_docentes(PDO $pdo, array $idsDocentes, string $fechaInicio, string $fechaFin): array
{
    $idsDocentes = array_values(array_filter(array_map('intval', $idsDocentes), static fn ($id) => $id > 0));
    if (count($idsDocentes) === 0 || !mesas_armado_tabla_existe($pdo, 'docentes_bloques_no')) {
        return [];
    }

    $phDocentes = implode(',', array_fill(0, count($idsDocentes), '?'));
    $stmt = $pdo->prepare(""
        . "SELECT DISTINCT dbn.fecha, dbn.id_turno, dbn.id_docente, d.docente\n"
        . "FROM docentes_bloques_no dbn\n"
        . "LEFT JOIN docentes d ON d.id_docente = dbn.id_docente\n"
        . "WHERE dbn.id_docente IN ({$phDocentes})\n"
        . "  AND dbn.fecha BETWEEN ? AND ?"
    );
    $stmt->execute(array_merge($idsDocentes, [$fechaInicio, $fechaFin]));

    $mapa = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $fecha = (string)($row['fecha'] ?? '');
        if ($fecha === '') {
            continue;
        }

        $idTurno = $row['id_turno'] !== null ? (int)$row['id_turno'] : 0;
        $idDocente = (int)($row['id_docente'] ?? 0);
        if ($idDocente <= 0) {
            continue;
        }

        $key = mesas_editar_slot_key($fecha, $idTurno);
        if (!isset($mapa[$key])) {
            $mapa[$key] = [];
        }
        $mapa[$key][$idDocente] = $row;
    }

    return $mapa;
}

function mesas_editar_bloqueos_docentes_desde_contexto(array $contexto, array $idsDocentes, string $fechaMesa, int $idTurno): array
{
    if (!isset($contexto['bloqueos_docentes']) || !is_array($contexto['bloqueos_docentes'])) {
        return [];
    }

    $idsDocentes = array_values(array_filter(array_map('intval', $idsDocentes), static fn ($id) => $id > 0));
    if (count($idsDocentes) === 0) {
        return [];
    }

    $mapa = $contexto['bloqueos_docentes'];
    $keys = [
        mesas_editar_slot_key($fechaMesa, $idTurno),
        mesas_editar_slot_key($fechaMesa, 0), // bloqueo de día completo, sin turno específico
    ];

    $out = [];
    foreach ($keys as $key) {
        if (!isset($mapa[$key]) || !is_array($mapa[$key])) {
            continue;
        }

        foreach ($idsDocentes as $idDocente) {
            if (isset($mapa[$key][$idDocente])) {
                $out[$idDocente . '_' . $key] = $mapa[$key][$idDocente];
            }
        }
    }

    return array_values($out);
}

function mesas_editar_precargar_choques_docentes(PDO $pdo, array $detalle, string $fechaInicio, string $fechaFin): array
{
    $idsDocentes = array_keys($detalle['docentes'] ?? []);
    $idsDocentes = array_values(array_filter(array_map('intval', $idsDocentes), static fn ($id) => $id > 0));
    $numeros = mesas_editar_normalizar_lista_numeros($detalle['numeros'] ?? []);

    if (count($idsDocentes) === 0 || count($numeros) === 0) {
        return [];
    }

    $phDocentes = implode(',', array_fill(0, count($idsDocentes), '?'));
    $phNumeros = implode(',', array_fill(0, count($numeros), '?'));

    $stmt = $pdo->prepare(""
        . "SELECT DISTINCT me.fecha_mesa, me.id_turno, me.numero_mesa, me.id_docente, d.docente\n"
        . "FROM mesas me\n"
        . "LEFT JOIN docentes d ON d.id_docente = me.id_docente\n"
        . "WHERE me.fecha_mesa BETWEEN ? AND ?\n"
        . "  AND me.id_turno IS NOT NULL\n"
        . "  AND me.id_docente IN ({$phDocentes})\n"
        . "  AND me.numero_mesa NOT IN ({$phNumeros})\n"
        . "ORDER BY d.docente ASC, me.numero_mesa ASC"
    );
    $stmt->execute(array_merge([$fechaInicio, $fechaFin], $idsDocentes, $numeros));

    $mapa = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $fecha = (string)($row['fecha_mesa'] ?? '');
        $idTurno = (int)($row['id_turno'] ?? 0);
        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }

        $key = mesas_editar_slot_key($fecha, $idTurno);
        if (!isset($mapa[$key])) {
            $mapa[$key] = [];
        }
        $mapa[$key][] = $row;
    }

    return $mapa;
}

function mesas_editar_precargar_choques_alumnos(PDO $pdo, array $detalle, string $fechaInicio, string $fechaFin): array
{
    $dnis = array_keys($detalle['dnis'] ?? []);
    $dnis = array_values(array_filter(array_map('strval', $dnis), static fn ($dni) => trim($dni) !== ''));
    $numeros = mesas_editar_normalizar_lista_numeros($detalle['numeros'] ?? []);

    if (count($dnis) === 0 || count($numeros) === 0) {
        return [];
    }

    $phDnis = implode(',', array_fill(0, count($dnis), '?'));
    $phNumeros = implode(',', array_fill(0, count($numeros), '?'));

    $stmt = $pdo->prepare(""
        . "SELECT DISTINCT me.fecha_mesa, me.id_turno, p.dni, p.alumno, me.numero_mesa\n"
        . "FROM mesas me\n"
        . "INNER JOIN previas p ON p.id_previa = me.id_previa\n"
        . "WHERE me.fecha_mesa BETWEEN ? AND ?\n"
        . "  AND me.id_turno IS NOT NULL\n"
        . "  AND p.dni IN ({$phDnis})\n"
        . "  AND me.numero_mesa NOT IN ({$phNumeros})\n"
        . "ORDER BY p.alumno ASC, me.numero_mesa ASC"
    );
    $stmt->execute(array_merge([$fechaInicio, $fechaFin], $dnis, $numeros));

    $mapa = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $fecha = (string)($row['fecha_mesa'] ?? '');
        $idTurno = (int)($row['id_turno'] ?? 0);
        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }

        $key = mesas_editar_slot_key($fecha, $idTurno);
        if (!isset($mapa[$key])) {
            $mapa[$key] = [];
        }
        $mapa[$key][] = $row;
    }

    return $mapa;
}

function mesas_editar_preparar_contexto_validacion(PDO $pdo, string $tipo, array $data, ?string $fechaInicio = null, ?string $fechaFin = null, ?array $itemActual = null): array
{
    $numeros = mesas_editar_resolver_numeros_desde_payload($pdo, $tipo, $data);
    $detalle = mesas_editar_obtener_detalle_numeros($pdo, $numeros);

    $contexto = [
        'numeros' => $numeros,
        'detalle' => $detalle,
        'slot_actual' => mesas_editar_obtener_slot_actual($pdo, $tipo, $data, $itemActual),
        'disponibilidad' => mesas_armado_obtener_disponibilidad_docentes($pdo),
        'correlativas' => mesas_editar_obtener_correlativas($pdo),
        'otras_previas' => mesas_editar_obtener_otras_previas_mismos_alumnos($pdo, $detalle),
    ];

    if ($fechaInicio !== null && $fechaFin !== null) {
        $contexto['bloqueos_docentes'] = mesas_editar_precargar_bloqueos_docentes($pdo, array_keys($detalle['docentes']), $fechaInicio, $fechaFin);
        $contexto['choques_docentes'] = mesas_editar_precargar_choques_docentes($pdo, $detalle, $fechaInicio, $fechaFin);
        $contexto['choques_alumnos'] = mesas_editar_precargar_choques_alumnos($pdo, $detalle, $fechaInicio, $fechaFin);
    }

    return $contexto;
}

function mesas_editar_bloqueados_en_slot(PDO $pdo, array $idsDocentes, string $fechaMesa, int $idTurno): array
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

function mesas_editar_validar_docentes(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno, array $contexto = []): array
{
    $errores = [];
    $disponibilidad = isset($contexto['disponibilidad']) && is_array($contexto['disponibilidad'])
        ? $contexto['disponibilidad']
        : mesas_armado_obtener_disponibilidad_docentes($pdo);

    foreach ($detalle['docentes'] as $idDocente => $nombreDocente) {
        $idDocente = (int)$idDocente;
        if ($idDocente <= 0) {
            continue;
        }

        if (mesas_armado_docente_no_disponible($disponibilidad, $idDocente, $fechaMesa, $idTurno)) {
            $errores[] = 'El docente ' . $nombreDocente . ' no tiene disponibilidad para esa fecha y turno.';
        }
    }

    if (array_key_exists('bloqueos_docentes', $contexto)) {
        $bloqueados = mesas_editar_bloqueos_docentes_desde_contexto($contexto, array_keys($detalle['docentes']), $fechaMesa, $idTurno);
    } else {
        $bloqueados = mesas_editar_bloqueados_en_slot($pdo, array_keys($detalle['docentes']), $fechaMesa, $idTurno);
    }

    foreach ($bloqueados as $bloqueado) {
        $errores[] = 'El docente ' . trim((string)($bloqueado['docente'] ?? ('ID ' . $bloqueado['id_docente']))) . ' tiene bloqueado ese día/turno.';
    }

    if (count($detalle['docentes']) > 0) {
        if (array_key_exists('choques_docentes', $contexto) && is_array($contexto['choques_docentes'])) {
            $choques = $contexto['choques_docentes'][mesas_editar_slot_key($fechaMesa, $idTurno)] ?? [];
        } else {
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
        }

        foreach ($choques as $choque) {
            $errores[] = 'El docente ' . trim((string)($choque['docente'] ?? ('ID ' . $choque['id_docente']))) . ' ya está asignado en la mesa N° ' . (int)$choque['numero_mesa'] . ' para ese mismo turno.';
        }
    }

    return $errores;
}

function mesas_editar_validar_alumnos(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno, array $contexto = []): array
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

    if (array_key_exists('choques_alumnos', $contexto) && is_array($contexto['choques_alumnos'])) {
        $choques = $contexto['choques_alumnos'][mesas_editar_slot_key($fechaMesa, $idTurno)] ?? [];
    } else {
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
    }

    foreach ($choques as $choque) {
        $errores[] = 'El alumno ' . trim((string)($choque['alumno'] ?? $choque['dni'])) . ' ya tiene la mesa N° ' . (int)$choque['numero_mesa'] . ' en ese mismo turno.';
    }

    return $errores;
}

function mesas_editar_obtener_otras_previas_mismos_alumnos(PDO $pdo, array $detalle): array
{
    $dnis = array_keys($detalle['dnis'] ?? []);
    if (count($dnis) === 0) {
        return [];
    }

    $idsPrevias = [];
    foreach (($detalle['ids_previa'] ?? []) as $idPrevia) {
        $idPrevia = (int)$idPrevia;
        if ($idPrevia > 0) {
            $idsPrevias[$idPrevia] = $idPrevia;
        }
    }
    $idsPrevias = array_values($idsPrevias);

    $phDnis = implode(',', array_fill(0, count($dnis), '?'));
    $whereExcluirPrevias = '';
    $params = $dnis;

    if (count($idsPrevias) > 0) {
        $phPrevias = implode(',', array_fill(0, count($idsPrevias), '?'));
        $whereExcluirPrevias = "  AND (me.id_previa IS NULL OR me.id_previa NOT IN ({$phPrevias}))\n";
        $params = array_merge($params, $idsPrevias);
    }

    $stmt = $pdo->prepare(""
        . "SELECT\n"
        . "    me.id_previa,\n"
        . "    me.numero_mesa,\n"
        . "    me.fecha_mesa,\n"
        . "    me.id_turno,\n"
        . "    p.dni,\n"
        . "    p.alumno,\n"
        . "    p.id_materia AS id_materia,\n"
        . "    p.materia_id_curso AS id_curso,\n"
        . "    mat.materia\n"
        . "FROM mesas me\n"
        . "INNER JOIN previas p ON p.id_previa = me.id_previa\n"
        . "LEFT JOIN materias mat ON mat.id_materia = p.id_materia\n"
        . "WHERE p.dni IN ({$phDnis})\n"
        . $whereExcluirPrevias
        . "  AND me.fecha_mesa IS NOT NULL\n"
        . "  AND me.id_turno IS NOT NULL\n"
        . "ORDER BY p.dni ASC, me.fecha_mesa ASC, me.id_turno ASC"
    );
    $stmt->execute($params);

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

function mesas_editar_validar_correlativas(PDO $pdo, array $detalle, string $fechaMesa, int $idTurno, array $contexto = []): array
{
    $errores = [];
    $correlativas = isset($contexto['correlativas']) && is_array($contexto['correlativas'])
        ? $contexto['correlativas']
        : mesas_editar_obtener_correlativas($pdo);

    if (count($correlativas) === 0) {
        return $errores;
    }

    $claveMateriaCurso = static function (array $registro): string {
        $idMateria = (int)($registro['id_materia'] ?? 0);
        $idCurso = (int)($registro['id_curso'] ?? 0);

        return $idMateria . '|' . $idCurso;
    };

    $registroValido = static function (array $registro): bool {
        return trim((string)($registro['dni'] ?? '')) !== ''
            && (int)($registro['id_materia'] ?? 0) > 0
            && (int)($registro['id_curso'] ?? 0) > 0;
    };

    $grafo = [];

    foreach ($correlativas as $corr) {
        $idMateriaA = (int)($corr['id_materia'] ?? 0);
        $idCursoA = (int)($corr['id_curso'] ?? 0);
        $idMateriaB = (int)($corr['id_materia_relacionada'] ?? 0);
        $idCursoB = (int)($corr['id_curso_relacionada'] ?? 0);
        $tipo = (string)($corr['tipo'] ?? '');

        if ($idMateriaA <= 0 || $idCursoA <= 0 || $idMateriaB <= 0 || $idCursoB <= 0) {
            continue;
        }

        $claveA = $idMateriaA . '|' . $idCursoA;
        $claveB = $idMateriaB . '|' . $idCursoB;

        if ($claveA === $claveB || $tipo === 'equivalente') {
            continue;
        }

        // Misma regla del armado: si los cursos difieren, el curso menor siempre es anterior.
        // Si no se puede decidir por curso, se respeta el sentido operativo usado por el armado.
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
    }

    if (count($grafo) === 0) {
        return $errores;
    }

    $hayCamino = static function (string $origen, string $destino) use (&$grafo): bool {
        if ($origen === $destino) {
            return false;
        }

        $cola = [$origen];
        $visitados = [$origen => true];

        while (count($cola) > 0) {
            $actual = array_shift($cola);
            foreach (($grafo[$actual] ?? []) as $siguiente => $_) {
                $siguiente = (string)$siguiente;
                if ($siguiente === $destino) {
                    return true;
                }
                if (isset($visitados[$siguiente])) {
                    continue;
                }
                $visitados[$siguiente] = true;
                $cola[] = $siguiente;
            }
        }

        return false;
    };

    $nombreRegistro = static function (array $registro, string $fallback): string {
        $materia = trim((string)($registro['materia'] ?? ''));
        return $materia !== '' ? $materia : $fallback;
    };

    $agregarErrorOrden = static function (array $anterior, array $posterior) use (&$errores, $nombreRegistro): void {
        $alumno = trim((string)($anterior['alumno'] ?? ''));
        if ($alumno === '') {
            $alumno = trim((string)($posterior['alumno'] ?? ''));
        }
        if ($alumno === '') {
            $alumno = trim((string)($anterior['dni'] ?? $posterior['dni'] ?? ''));
        }

        $errores[] = 'Correlativa: ' . ($alumno !== '' ? $alumno : 'el alumno')
            . ' debe rendir ' . $nombreRegistro($anterior, 'la correlativa anterior')
            . ' antes de ' . $nombreRegistro($posterior, 'la correlativa posterior') . '.';
    };

    $indiceDestino = mesas_editar_fecha_a_indice_slot($fechaMesa, $idTurno);
    $actuales = array_values(array_filter($detalle['registros'] ?? [], $registroValido));

    // Validación interna: si al agregar un número quedan anterior y posterior dentro
    // del mismo grupo/fecha/turno, se bloquea porque no existe orden posible en el mismo slot.
    $totalActuales = count($actuales);
    for ($i = 0; $i < $totalActuales; $i++) {
        for ($j = $i + 1; $j < $totalActuales; $j++) {
            $a = $actuales[$i];
            $b = $actuales[$j];

            if ((string)($a['dni'] ?? '') !== (string)($b['dni'] ?? '')) {
                continue;
            }

            if ((int)($a['id_previa'] ?? 0) > 0 && (int)($a['id_previa'] ?? 0) === (int)($b['id_previa'] ?? 0)) {
                continue;
            }

            $claveA = $claveMateriaCurso($a);
            $claveB = $claveMateriaCurso($b);

            if ($hayCamino($claveA, $claveB)) {
                $agregarErrorOrden($a, $b);
            } elseif ($hayCamino($claveB, $claveA)) {
                $agregarErrorOrden($b, $a);
            }
        }
    }

    $otras = isset($contexto['otras_previas']) && is_array($contexto['otras_previas'])
        ? $contexto['otras_previas']
        : mesas_editar_obtener_otras_previas_mismos_alumnos($pdo, $detalle);

    foreach ($actuales as $actual) {
        $claveActual = $claveMateriaCurso($actual);

        foreach ($otras as $otra) {
            if (!$registroValido($otra)) {
                continue;
            }

            if ((string)($otra['dni'] ?? '') !== (string)($actual['dni'] ?? '')) {
                continue;
            }

            if ((int)($actual['id_previa'] ?? 0) > 0 && (int)($actual['id_previa'] ?? 0) === (int)($otra['id_previa'] ?? 0)) {
                continue;
            }

            $claveOtra = $claveMateriaCurso($otra);
            $indiceOtra = mesas_editar_fecha_a_indice_slot((string)$otra['fecha_mesa'], (int)$otra['id_turno']);

            if ($hayCamino($claveActual, $claveOtra) && $indiceDestino >= $indiceOtra) {
                $agregarErrorOrden($actual, $otra);
            }

            if ($hayCamino($claveOtra, $claveActual) && $indiceOtra >= $indiceDestino) {
                $agregarErrorOrden($otra, $actual);
            }
        }
    }

    return array_values(array_unique($errores));
}



function mesas_editar_resumen_numero_para_grupo_unico(PDO $pdo, int $numeroMesa): ?array
{
    $stmt = $pdo->prepare(''
        . 'SELECT '
        . '    me.numero_mesa, '
        . '    MAX(me.tipo_mesa) AS tipo_mesa, '
        . '    MAX(me.prioridad) AS prioridad, '
        . '    COUNT(DISTINCT me.id_previa) AS cantidad_alumnos, '
        . '    MIN(am.id_area) AS id_area '
        . 'FROM mesas me '
        . 'LEFT JOIN previas p ON p.id_previa = me.id_previa '
        . 'LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra '
        . 'LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 '
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
    ];
}


function mesas_editar_validar_fecha_en_rango_armado(PDO $pdo, string $fechaMesa, array $contexto = []): array
{
    $rangoBase = isset($contexto['rango_armado']) && is_array($contexto['rango_armado'])
        ? $contexto['rango_armado']
        : (function_exists('mesas_armado_rango_obtener_actual') ? mesas_armado_rango_obtener_actual($pdo) : null);

    $rango = mesas_editar_rango_armado_confiable($pdo, $rangoBase);

    if (!$rango || empty($rango['fecha_inicio']) || empty($rango['fecha_fin'])) {
        return [];
    }

    $inicio = (string)$rango['fecha_inicio'];
    $fin = (string)$rango['fecha_fin'];

    if ($fechaMesa < $inicio || $fechaMesa > $fin) {
        return ['La fecha seleccionada está fuera de los días definidos para este armado de mesas (' . $inicio . ' a ' . $fin . ').'];
    }

    return [];
}

function mesas_editar_validar_programacion_completa(PDO $pdo, string $tipo, array $data, string $fechaMesa, int $idTurno, string $hora, array $turno, array $contexto = []): array
{
    $errores = [];
    $advertencias = [];

    if (isset($contexto['numeros'], $contexto['detalle']) && is_array($contexto['numeros']) && is_array($contexto['detalle'])) {
        $numeros = $contexto['numeros'];
        $detalle = $contexto['detalle'];
    } else {
        $numeros = mesas_editar_resolver_numeros_desde_payload($pdo, $tipo, $data);
        $detalle = mesas_editar_obtener_detalle_numeros($pdo, $numeros);
    }

    if (!array_key_exists('slot_actual', $contexto)) {
        $contexto['slot_actual'] = mesas_editar_obtener_slot_actual($pdo, $tipo, $data);
    }

    $esSlotActual = mesas_editar_es_slot_actual($contexto, $fechaMesa, $idTurno);

    $errores = array_merge($errores, mesas_editar_validar_fecha_en_rango_armado($pdo, $fechaMesa, $contexto));
    $errores = array_merge($errores, mesas_editar_validar_docentes($pdo, $detalle, $fechaMesa, $idTurno, $contexto));
    $errores = array_merge($errores, mesas_editar_validar_alumnos($pdo, $detalle, $fechaMesa, $idTurno, $contexto));
    $errores = array_merge($errores, mesas_editar_validar_correlativas($pdo, $detalle, $fechaMesa, $idTurno, $contexto));

    $errores = array_values(array_unique($errores));
    $erroresIgnoradosSlotActual = [];

    // Regla de edición: el slot donde la mesa YA fue armada siempre debe quedar
    // habilitado. Si el armado anterior dejó un choque preexistente o la validación
    // detecta otra mesa del mismo turno, no se bloquea el calendario ni el guardado
    // sin moverla; se informa como advertencia interna pero no como error.
    if ($esSlotActual && count($errores) > 0) {
        $erroresIgnoradosSlotActual = $errores;
        $advertencias = array_values(array_unique(array_merge($advertencias, $errores)));
        $errores = [];
    }

    return [
        'valido' => count($errores) === 0,
        'errores' => $errores,
        'advertencias' => $advertencias,
        'errores_ignorados_slot_actual' => $erroresIgnoradosSlotActual,
        'es_slot_actual' => $esSlotActual,
        'slot_actual' => $contexto['slot_actual'] ?? null,
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

    if ($fechaInicio !== '' && $fechaFin !== '') {
        $inicioSolicitado = mesas_editar_normalizar_fecha_rango($fechaInicio);
        $finSolicitado = mesas_editar_normalizar_fecha_rango($fechaFin);
    } else {
        $anio = mesas_editar_parametro_presente($data['anio'] ?? null) ? (int)$data['anio'] : 0;
        $mes = mesas_editar_parametro_presente($data['mes'] ?? null) ? (int)$data['mes'] : 0;

        if ($anio > 1900 && $mes >= 1 && $mes <= 12) {
            $inicio = new DateTimeImmutable(sprintf('%04d-%02d-01', $anio, $mes));
            $fin = $inicio->modify('last day of this month');
            $inicioSolicitado = $inicio->format('Y-m-d');
            $finSolicitado = $fin->format('Y-m-d');
        } else {
            $fechaBase = mesas_editar_parametro_texto($grupo['fecha_mesa'] ?? null);
            if ($fechaBase === '') {
                $rangoReal = mesas_editar_rango_fechas_existentes_armado($pdo);
                $fechaBase = mesas_editar_parametro_texto($rangoReal['fecha_inicio'] ?? null);
            }

            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaBase)) {
                $fechaBase = (new DateTimeImmutable('today'))->format('Y-m-d');
            }

            $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $fechaBase) ?: new DateTimeImmutable('today');
            $inicioSolicitado = $dt->modify('first day of this month')->format('Y-m-d');
            $finSolicitado = $dt->modify('last day of this month')->format('Y-m-d');
        }
    }

    if ($finSolicitado < $inicioSolicitado) {
        [$inicioSolicitado, $finSolicitado] = [$finSolicitado, $inicioSolicitado];
    }

    $rangoArmado = mesas_editar_rango_armado_confiable(
        $pdo,
        function_exists('mesas_armado_rango_obtener_actual') ? mesas_armado_rango_obtener_actual($pdo) : null
    );

    if (is_array($rangoArmado)
        && !empty($rangoArmado['fecha_inicio'])
        && !empty($rangoArmado['fecha_fin'])
        && function_exists('mesas_armado_rango_intersectar')
    ) {
        $interseccion = mesas_armado_rango_intersectar(
            $inicioSolicitado,
            $finSolicitado,
            (string)$rangoArmado['fecha_inicio'],
            (string)$rangoArmado['fecha_fin']
        );

        if ($interseccion !== null) {
            return [$interseccion[0], $interseccion[1]];
        }

        // Si el usuario está mirando el mes real de la mesa, no devolvemos un rango viejo
        // de auditoría/tabla porque eso hace que el calendario muestre "sin fechas" aunque
        // la mesa ya esté armada en ese mes. Se devuelve el mes solicitado y la validación
        // posterior marca cada día como válido o bloqueado según restricciones reales.
        $fechaGrupo = mesas_editar_parametro_texto($grupo['fecha_mesa'] ?? null);
        if ($fechaGrupo !== '' && $fechaGrupo >= $inicioSolicitado && $fechaGrupo <= $finSolicitado) {
            return [$inicioSolicitado, $finSolicitado];
        }

        $inicioArmado = (string)$rangoArmado['fecha_inicio'];
        $finArmado = (string)$rangoArmado['fecha_fin'];
        if ($finArmado < $inicioArmado) {
            [$inicioArmado, $finArmado] = [$finArmado, $inicioArmado];
        }
        return [$inicioArmado, $finArmado];
    }

    return [$inicioSolicitado, $finSolicitado];
}

function mesas_editar_construir_slots_validos(PDO $pdo, string $tipo, array $data, string $fechaInicio, string $fechaFin, ?array $itemActual = null): array
{
    $turnos = $pdo->query('SELECT id_turno, turno FROM turnos WHERE activo = 1 ORDER BY id_turno ASC')->fetchAll(PDO::FETCH_ASSOC);
    $inicio = DateTimeImmutable::createFromFormat('!Y-m-d', $fechaInicio);
    $fin = DateTimeImmutable::createFromFormat('!Y-m-d', $fechaFin);

    if (!$inicio || !$fin || $fin < $inicio) {
        throw new InvalidArgumentException('El rango de fechas para validar no es correcto.');
    }

    // Optimización clave: antes se recalculaban números, alumnos, docentes,
    // correlativas, disponibilidad y choques para cada día/turno del calendario.
    // Ahora ese contexto se arma una sola vez por rango y cada slot solo consulta mapas en memoria.
    $contexto = mesas_editar_preparar_contexto_validacion($pdo, $tipo, $data, $fechaInicio, $fechaFin, $itemActual);
    $rangoArmado = mesas_editar_rango_armado_confiable(
        $pdo,
        function_exists('mesas_armado_rango_obtener_actual') ? mesas_armado_rango_obtener_actual($pdo) : null
    );
    if (is_array($rangoArmado)) {
        $contexto['rango_armado'] = $rangoArmado;
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
                $validacion = mesas_editar_validar_programacion_completa($pdo, $tipo, $data, $fechaYmd, $idTurno, $hora, $turno, $contexto);
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
                    'es_actual' => (bool)($validacion['es_slot_actual'] ?? false),
                    'errores' => $validacion['errores'],
                    'advertencias' => $validacion['advertencias'] ?? [],
                    'errores_ignorados_slot_actual' => $validacion['errores_ignorados_slot_actual'] ?? [],
                    'rango_horario' => $rango,
                ];
            } catch (Throwable $e) {
                $slots[] = [
                    'fecha_mesa' => $fechaYmd,
                    'id_turno' => $idTurno,
                    'turno' => $turno['turno'],
                    'hora_sugerida' => $hora,
                    'valido' => false,
                    'es_actual' => false,
                    'errores' => [$e->getMessage()],
                    'advertencias' => [],
                    'errores_ignorados_slot_actual' => [],
                    'rango_horario' => $rango,
                ];
            }
        }
    }

    return [
        'fecha_inicio' => $fechaInicio,
        'fecha_fin' => $fechaFin,
        'rango_armado' => $rangoArmado,
        'slots' => $slots,
        'total_validos' => $totalValidos,
    ];
}
