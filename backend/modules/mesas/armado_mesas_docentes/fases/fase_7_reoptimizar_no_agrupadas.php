<?php
// backend/modules/mesas/armado_mesas_docentes/fases/fase_7_reoptimizar_no_agrupadas.php
declare(strict_types=1);

/**
 * Fase 7 - Reoptimización final de mesas no agrupadas.
 *
 * Objetivo:
 * - Mantener talleres (prioridad 1) como grupos individuales.
 * - Mantener correlativas/prioritarias (prioridad 2) como anclas de fecha/turno.
 * - Usar mesas simples (prioridad 0) como comodines: se les puede mover fecha/turno
 *   para completar grupos existentes o formar grupos nuevos de 2 a 4 números.
 * - Nunca mezclar áreas, nunca mezclar talleres, y nunca generar choque de alumno/docente
 *   en el mismo slot final, respetando disponibilidad docente positiva.
 */
function mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas(): void
{
    $pdo = db();
    $body = request_body();

    $minNumeros = isset($body['min_numeros']) ? (int)$body['min_numeros'] : (isset($_GET['min_numeros']) ? (int)$_GET['min_numeros'] : 2);
    $maxNumeros = isset($body['max_numeros']) ? (int)$body['max_numeros'] : (isset($_GET['max_numeros']) ? (int)$_GET['max_numeros'] : 4);
    $confirmarGrupos = mesas_armado_docentes_grupos_bool($body['confirmar_grupos'] ?? ($_GET['confirmar_grupos'] ?? false));

    try {
        mesas_armado_docentes_grupos_asegurar_tablas($pdo);

        $pdo->beginTransaction();

        $resultado = mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas_core($pdo, [
            'min_numeros' => $minNumeros,
            'max_numeros' => $maxNumeros,
            'confirmar_grupos' => $confirmarGrupos,
        ]);

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Reoptimización final ejecutada correctamente.',
            'data' => $resultado,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al reoptimizar mesas no agrupadas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas_core(PDO $pdo, array $opciones = []): array
{
    $minNumeros = max(2, (int)($opciones['min_numeros'] ?? 2));
    $maxNumeros = min(4, max($minNumeros, (int)($opciones['max_numeros'] ?? 4)));
    $confirmarGrupos = (bool)($opciones['confirmar_grupos'] ?? false);
    $horasTurnos = is_array($opciones['horas_turnos'] ?? null)
        ? $opciones['horas_turnos']
        : mesas_armado_docentes_grupos_obtener_horas_turnos($pdo);

    $numerosIndex = mesas_armado_docentes_reopt_indexar_numeros(mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo));
    $pendientes = mesas_armado_docentes_reopt_obtener_pendientes($pdo, $numerosIndex);

    $totalPendientesInicial = count($pendientes);

    if ($totalPendientesInicial === 0) {
        return [
            'fase' => 7,
            'reoptimizacion_ejecutada' => true,
            'total_no_agrupadas_iniciales' => 0,
            'total_reubicadas_en_grupos_existentes' => 0,
            'total_grupos_nuevos_por_reoptimizacion' => 0,
            'total_numeros_reoptimizados' => 0,
            'total_no_agrupadas_finales' => 0,
            'detalle' => 'No había mesas pendientes para reoptimizar.',
        ];
    }

    $disponibilidadDocentes = mesas_armado_docentes_obtener_disponibilidad_docentes($pdo);
    $grupos = mesas_armado_docentes_reopt_obtener_grupos_actuales($pdo, $numerosIndex);
    $slotsDisponibles = mesas_armado_docentes_reopt_obtener_slots_disponibles($pdo, $pendientes, $grupos);
    $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
    $estadoGrupo = $confirmarGrupos ? 'validado' : 'borrador';

    $insertGrupo = $pdo->prepare("\n        INSERT INTO mesas_grupos (\n            numero_grupo,\n            numero_mesa,\n            fecha_mesa,\n            id_turno,\n            hora,\n            id_area,\n            orden,\n            tipo_mesa,\n            prioridad,\n            cantidad_alumnos,\n            estado,\n            observacion\n        ) VALUES (\n            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?\n        )\n    ");

    $stats = [
        'fase' => 7,
        'reoptimizacion_ejecutada' => true,
        'criterio' => 'primero completa grupos existentes; luego usa correlativas como anclas; despues agrupa simples movibles; por ultimo ejecuta busqueda profunda con donantes, pudiendo sacar una mesa simple de un grupo de 3 o 4 para crear otro grupo valido con una no agrupada.',
        'min_numeros_por_grupo' => $minNumeros,
        'max_numeros_por_grupo' => $maxNumeros,
        'total_no_agrupadas_iniciales' => $totalPendientesInicial,
        'total_reubicadas_en_grupos_existentes' => 0,
        'total_grupos_nuevos_por_ancla_prioritaria' => 0,
        'total_grupos_nuevos_simples' => 0,
        'total_grupos_nuevos_por_reoptimizacion' => 0,
        'total_numeros_reoptimizados' => 0,
        'total_reubicadas_por_intercambio' => 0,
        'total_grupos_rearmados_por_intercambio' => 0,
        'pasadas_busqueda_profunda' => 0,
        'numeros_movidos_de_fecha_turno' => [],
        'numeros_insertados_en_grupos_existentes' => [],
        'intercambios_profundos' => [],
        'grupos_nuevos' => [],
    ];

    // 1) Completar grupos existentes usando pendientes compatibles.
    mesas_armado_docentes_reopt_completar_grupos_existentes(
        $pdo,
        $insertGrupo,
        $grupos,
        $pendientes,
        $ocupacion,
        $disponibilidadDocentes,
        $horasTurnos,
        $maxNumeros,
        $estadoGrupo,
        $stats
    );

    // 2) Crear grupos usando correlativas/prioritarias como ancla fija.
    mesas_armado_docentes_reopt_formar_grupos_con_anclas(
        $pdo,
        $insertGrupo,
        $grupos,
        $pendientes,
        $ocupacion,
        $disponibilidadDocentes,
        $horasTurnos,
        $minNumeros,
        $maxNumeros,
        $estadoGrupo,
        $stats
    );

    // 3) Crear grupos nuevos solamente con simples movibles.
    mesas_armado_docentes_reopt_formar_grupos_simples(
        $pdo,
        $insertGrupo,
        $grupos,
        $pendientes,
        $ocupacion,
        $disponibilidadDocentes,
        $slotsDisponibles,
        $horasTurnos,
        $minNumeros,
        $maxNumeros,
        $estadoGrupo,
        $stats
    );

    // 4) Busqueda profunda: puede sacar mesas simples de grupos ya creados
    //    siempre que el grupo origen siga valido, para rescatar pendientes.
    mesas_armado_docentes_reopt_rearmar_con_donantes(
        $pdo,
        $insertGrupo,
        $grupos,
        $pendientes,
        $ocupacion,
        $disponibilidadDocentes,
        $slotsDisponibles,
        $horasTurnos,
        $minNumeros,
        $maxNumeros,
        $estadoGrupo,
        $stats
    );

    $stats['total_grupos_nuevos_por_reoptimizacion'] = $stats['total_grupos_nuevos_por_ancla_prioritaria'] + $stats['total_grupos_nuevos_simples'] + $stats['total_grupos_rearmados_por_intercambio'];
    $stats['total_no_agrupadas_finales'] = (int)$pdo->query('SELECT COUNT(*) FROM mesas_no_agrupadas')->fetchColumn();
    $stats['totales_finales'] = mesas_armado_docentes_grupos_totales_finales($pdo);

    return $stats;
}

function mesas_armado_docentes_reopt_indexar_numeros(array $numeros): array
{
    $index = [];

    foreach ($numeros as $numero) {
        $index[(int)$numero['numero_mesa']] = $numero;
    }

    return $index;
}

function mesas_armado_docentes_reopt_obtener_pendientes(PDO $pdo, array $numerosIndex): array
{
    $stmt = $pdo->query("\n        SELECT numero_mesa, motivo\n        FROM mesas_no_agrupadas\n        ORDER BY prioridad DESC, cantidad_alumnos DESC, numero_mesa ASC\n    ");

    $pendientes = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $numeroMesa = (int)$row['numero_mesa'];

        if (!isset($numerosIndex[$numeroMesa])) {
            continue;
        }

        $numero = $numerosIndex[$numeroMesa];
        $numero['motivo_no_agrupada'] = (string)($row['motivo'] ?? '');
        $pendientes[$numeroMesa] = $numero;
    }

    uasort($pendientes, static function (array $a, array $b): int {
        return [
            -(int)$a['prioridad'],
            mesas_armado_docentes_reopt_es_simple_flexible($a) ? 1 : 0,
            -(int)$a['cantidad_alumnos'],
            (int)$a['numero_mesa'],
        ] <=> [
            -(int)$b['prioridad'],
            mesas_armado_docentes_reopt_es_simple_flexible($b) ? 1 : 0,
            -(int)$b['cantidad_alumnos'],
            (int)$b['numero_mesa'],
        ];
    });

    return $pendientes;
}

function mesas_armado_docentes_reopt_obtener_grupos_actuales(PDO $pdo, array $numerosIndex): array
{
    $stmt = $pdo->query("\n        SELECT\n            numero_grupo,\n            MIN(fecha_mesa) AS fecha_mesa,\n            MIN(id_turno) AS id_turno,\n            MIN(id_area) AS id_area,\n            COUNT(*) AS cantidad_numeros,\n            MAX(orden) AS max_orden,\n            MAX(prioridad) AS prioridad_max,\n            GROUP_CONCAT(numero_mesa ORDER BY orden ASC SEPARATOR ',') AS numeros_csv\n        FROM mesas_grupos\n        GROUP BY numero_grupo\n        ORDER BY MIN(fecha_mesa), MIN(id_turno), MIN(id_area), numero_grupo\n    ");

    $grupos = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $numeros = [];
        $tieneTaller = false;

        foreach (mesas_armado_docentes_grupos_csv_a_array($row['numeros_csv'] ?? '') as $numeroTexto) {
            $numeroMesa = (int)$numeroTexto;

            if (!isset($numerosIndex[$numeroMesa])) {
                continue;
            }

            $numero = $numerosIndex[$numeroMesa];
            $numeros[] = $numero;

            if (!empty($numero['es_taller'])) {
                $tieneTaller = true;
            }
        }

        $numeroGrupo = (int)$row['numero_grupo'];
        $grupos[$numeroGrupo] = [
            'numero_grupo' => $numeroGrupo,
            'fecha_mesa' => (string)$row['fecha_mesa'],
            'id_turno' => (int)$row['id_turno'],
            'id_area' => $row['id_area'] !== null ? (int)$row['id_area'] : null,
            'cantidad_numeros' => (int)$row['cantidad_numeros'],
            'max_orden' => (int)$row['max_orden'],
            'prioridad_max' => (int)$row['prioridad_max'],
            'tiene_taller' => $tieneTaller,
            'numeros' => $numeros,
        ];
    }

    return $grupos;
}

function mesas_armado_docentes_reopt_obtener_slots_disponibles(PDO $pdo, array $pendientes, array $grupos): array
{
    $stmt = $pdo->query("\n        SELECT DISTINCT fecha_mesa, id_turno\n        FROM mesas\n        WHERE fecha_mesa IS NOT NULL\n          AND id_turno IS NOT NULL\n          AND estado IN ('borrador', 'armada')\n        ORDER BY fecha_mesa ASC, id_turno ASC\n    ");

    $slots = [];
    $vistos = [];

    $agregar = static function (?string $fecha, mixed $idTurno) use (&$slots, &$vistos): void {
        if ($fecha === null || $fecha === '' || $idTurno === null || (int)$idTurno <= 0) {
            return;
        }

        $key = $fecha . '|' . (int)$idTurno;

        if (isset($vistos[$key])) {
            return;
        }

        $vistos[$key] = true;
        $slots[] = [
            'fecha_mesa' => $fecha,
            'fecha' => $fecha,
            'id_turno' => (int)$idTurno,
        ];
    };

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $agregar((string)$row['fecha_mesa'], $row['id_turno']);
    }

    foreach ($grupos as $grupo) {
        $agregar($grupo['fecha_mesa'] ?? null, $grupo['id_turno'] ?? null);
    }

    foreach ($pendientes as $numero) {
        $agregar($numero['fecha_mesa'] ?? null, $numero['id_turno'] ?? null);
    }

    return $slots;
}

function mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos(array $grupos): array
{
    $ocupacion = [
        'docentes' => [],
        'alumnos' => [],
    ];

    foreach ($grupos as $grupo) {
        foreach ($grupo['numeros'] as $numero) {
            mesas_armado_docentes_reopt_ocupar_numero(
                $ocupacion,
                $numero,
                (string)$grupo['fecha_mesa'],
                (int)$grupo['id_turno']
            );
        }
    }

    return $ocupacion;
}

function mesas_armado_docentes_reopt_es_simple_flexible(array $numero): bool
{
    return empty($numero['es_taller'])
        && (int)($numero['prioridad'] ?? 0) === 0
        && (string)($numero['tipo_mesa'] ?? 'simple') === 'simple';
}

function mesas_armado_docentes_reopt_es_ancla_prioritaria(array $numero): bool
{
    return empty($numero['es_taller']) && (int)($numero['prioridad'] ?? 0) >= 2;
}

function mesas_armado_docentes_reopt_area_compatible(array $numero, ?int $idArea): bool
{
    // En la variante por disponibilidad docente, el area deja de ser restriccion dura.
    // Se mantiene en los datos para ordenar/preferir, pero no bloquea la agrupacion.
    return true;
}

function mesas_armado_docentes_reopt_compatible_con_numeros(array $numero, array $grupoNumeros): bool
{
    if (!empty($numero['es_taller'])) {
        return false;
    }

    foreach ($grupoNumeros as $actual) {
        if (!empty($actual['es_taller'])) {
            return false;
        }

        if (!mesas_armado_docentes_reopt_area_compatible($numero, $actual['id_area'] !== null ? (int)$actual['id_area'] : null)) {
            return false;
        }

        if (count(array_intersect($numero['alumnos'], $actual['alumnos'])) > 0) {
            return false;
        }

        if (count(array_intersect($numero['docentes'], $actual['docentes'])) > 0) {
            return false;
        }
    }

    return true;
}

function mesas_armado_docentes_reopt_numero_disponible_en_slot(
    array $numero,
    string $fecha,
    int $idTurno,
    array $ocupacion,
    array $disponibilidadDocentes
): bool {
    if (!mesas_armado_docentes_reopt_es_simple_flexible($numero)) {
        if ($numero['fecha_mesa'] !== $fecha || (int)$numero['id_turno'] !== $idTurno) {
            return false;
        }
    }

    foreach ($numero['docentes'] as $idDocente) {
        $idDocente = (int)$idDocente;

        if ($idDocente <= 0) {
            return false;
        }

        if (mesas_armado_docentes_docente_no_disponible($disponibilidadDocentes, $idDocente, $fecha, $idTurno)) {
            return false;
        }

        $claveDocente = mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno);
        if (isset($ocupacion['docentes'][$claveDocente])) {
            return false;
        }
    }

    foreach ($numero['alumnos'] as $dni) {
        $dni = trim((string)$dni);
        if ($dni === '') {
            continue;
        }

        $claveAlumno = mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno);
        if (isset($ocupacion['alumnos'][$claveAlumno])) {
            return false;
        }
    }

    return true;
}

function mesas_armado_docentes_reopt_ocupar_numero(array &$ocupacion, array $numero, string $fecha, int $idTurno): void
{
    foreach ($numero['docentes'] as $idDocente) {
        $idDocente = (int)$idDocente;
        if ($idDocente > 0) {
            $ocupacion['docentes'][mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno)] = true;
        }
    }

    foreach ($numero['alumnos'] as $dni) {
        $dni = trim((string)$dni);
        if ($dni !== '') {
            $ocupacion['alumnos'][mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno)] = true;
        }
    }
}

function mesas_armado_docentes_reopt_marcar_slot_en_numero(array $numero, string $fecha, int $idTurno): array
{
    $numero['fecha_mesa'] = $fecha;
    $numero['id_turno'] = $idTurno;
    return $numero;
}

function mesas_armado_docentes_reopt_actualizar_slot_numero(PDO $pdo, int $numeroMesa, string $fecha, int $idTurno): void
{
    $stmt = $pdo->prepare("\n        UPDATE mesas\n        SET fecha_mesa = ?,\n            id_turno = ?,\n            observacion = NULL\n        WHERE numero_mesa = ?\n          AND estado IN ('borrador', 'armada')\n    ");
    $stmt->execute([$fecha, $idTurno, $numeroMesa]);
}

function mesas_armado_docentes_reopt_eliminar_pendientes(PDO $pdo, array $numerosMesa): void
{
    $numerosMesa = array_values(array_unique(array_map('intval', $numerosMesa)));

    if (count($numerosMesa) === 0) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($numerosMesa), '?'));
    $stmt = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE numero_mesa IN ({$placeholders})");
    $stmt->execute($numerosMesa);
}

function mesas_armado_docentes_reopt_insertar_numero_en_grupo_existente(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupo,
    array $numero,
    string $fecha,
    int $idTurno,
    array $horasTurnos,
    string $estado,
    array &$stats
): void {
    $orden = (int)$grupo['max_orden'] + 1;
    $numeroMesa = (int)$numero['numero_mesa'];

    if (mesas_armado_docentes_reopt_es_simple_flexible($numero)) {
        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, $numeroMesa, $fecha, $idTurno);
        $stats['numeros_movidos_de_fecha_turno'][] = [
            'numero_mesa' => $numeroMesa,
            'fecha_anterior' => $numero['fecha_mesa'] ?? null,
            'id_turno_anterior' => $numero['id_turno'] ?? null,
            'fecha_nueva' => $fecha,
            'id_turno_nuevo' => $idTurno,
            'motivo' => 'completar_grupo_existente',
        ];
        $numero = mesas_armado_docentes_reopt_marcar_slot_en_numero($numero, $fecha, $idTurno);
    }

    $insertGrupo->execute([
        (int)$grupo['numero_grupo'],
        $numeroMesa,
        $fecha,
        $idTurno,
        $horasTurnos[$idTurno] ?? null,
        $numero['id_area'] !== null ? (int)$numero['id_area'] : null,
        $orden,
        (string)$numero['tipo_mesa'],
        (int)$numero['prioridad'],
        (int)$numero['cantidad_alumnos'],
        $estado,
        'Reoptimizada: número incorporado a grupo existente.',
    ]);

    mesas_armado_docentes_reopt_eliminar_pendientes($pdo, [$numeroMesa]);

    $grupo['max_orden'] = $orden;
    $grupo['cantidad_numeros']++;
    $grupo['numeros'][] = $numero;

    $stats['total_reubicadas_en_grupos_existentes']++;
    $stats['total_numeros_reoptimizados']++;
    $stats['numeros_insertados_en_grupos_existentes'][] = [
        'numero_grupo' => (int)$grupo['numero_grupo'],
        'numero_mesa' => $numeroMesa,
    ];
}

function mesas_armado_docentes_reopt_completar_grupos_existentes(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupos,
    array &$pendientes,
    array &$ocupacion,
    array $disponibilidadDocentes,
    array $horasTurnos,
    int $maxNumeros,
    string $estado,
    array &$stats
): void {
    foreach ($pendientes as $numeroMesa => $numero) {
        if (!isset($pendientes[$numeroMesa]) || !empty($numero['es_taller'])) {
            continue;
        }

        foreach ($grupos as &$grupo) {
            if (!isset($pendientes[$numeroMesa])) {
                break;
            }

            if (!empty($grupo['tiene_taller']) || (int)$grupo['cantidad_numeros'] >= $maxNumeros) {
                continue;
            }

            $fecha = (string)$grupo['fecha_mesa'];
            $idTurno = (int)$grupo['id_turno'];

            if (!mesas_armado_docentes_reopt_area_compatible($numero, $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null)) {
                continue;
            }

            if (!mesas_armado_docentes_reopt_compatible_con_numeros($numero, $grupo['numeros'])) {
                continue;
            }

            if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($numero, $fecha, $idTurno, $ocupacion, $disponibilidadDocentes)) {
                continue;
            }

            mesas_armado_docentes_reopt_insertar_numero_en_grupo_existente(
                $pdo,
                $insertGrupo,
                $grupo,
                $numero,
                $fecha,
                $idTurno,
                $horasTurnos,
                $estado,
                $stats
            );

            $numero = mesas_armado_docentes_reopt_marcar_slot_en_numero($numero, $fecha, $idTurno);
            mesas_armado_docentes_reopt_ocupar_numero($ocupacion, $numero, $fecha, $idTurno);
            unset($pendientes[$numeroMesa]);
            break;
        }
        unset($grupo);
    }
}

function mesas_armado_docentes_reopt_formar_grupos_con_anclas(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupos,
    array &$pendientes,
    array &$ocupacion,
    array $disponibilidadDocentes,
    array $horasTurnos,
    int $minNumeros,
    int $maxNumeros,
    string $estado,
    array &$stats
): void {
    $proximoGrupo = mesas_armado_docentes_grupos_proximo_numero($pdo);

    foreach ($pendientes as $numeroMesa => $ancla) {
        if (!isset($pendientes[$numeroMesa]) || !mesas_armado_docentes_reopt_es_ancla_prioritaria($ancla)) {
            continue;
        }

        if ($ancla['fecha_mesa'] === null || $ancla['id_turno'] === null) {
            continue;
        }

        $fecha = (string)$ancla['fecha_mesa'];
        $idTurno = (int)$ancla['id_turno'];
        $grupoTemporal = [$ancla];
        $seleccionados = [(int)$numeroMesa => $ancla];
        $ocupacionTemporal = $ocupacion;

        if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($ancla, $fecha, $idTurno, $ocupacionTemporal, $disponibilidadDocentes)) {
            continue;
        }

        mesas_armado_docentes_reopt_ocupar_numero($ocupacionTemporal, $ancla, $fecha, $idTurno);

        foreach ($pendientes as $candidatoMesa => $candidato) {
            if ((int)$candidatoMesa === (int)$numeroMesa || !mesas_armado_docentes_reopt_es_simple_flexible($candidato)) {
                continue;
            }

            if (count($grupoTemporal) >= $maxNumeros) {
                break;
            }

            if (!mesas_armado_docentes_reopt_compatible_con_numeros($candidato, $grupoTemporal)) {
                continue;
            }

            if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($candidato, $fecha, $idTurno, $ocupacionTemporal, $disponibilidadDocentes)) {
                continue;
            }

            $candidato = mesas_armado_docentes_reopt_marcar_slot_en_numero($candidato, $fecha, $idTurno);
            $grupoTemporal[] = $candidato;
            $seleccionados[(int)$candidatoMesa] = $candidato;
            mesas_armado_docentes_reopt_ocupar_numero($ocupacionTemporal, $candidato, $fecha, $idTurno);
        }

        if (count($grupoTemporal) < $minNumeros) {
            continue;
        }

        foreach ($grupoTemporal as $numero) {
            if (mesas_armado_docentes_reopt_es_simple_flexible($numero)) {
                mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$numero['numero_mesa'], $fecha, $idTurno);
                $stats['numeros_movidos_de_fecha_turno'][] = [
                    'numero_mesa' => (int)$numero['numero_mesa'],
                    'fecha_anterior' => $pendientes[(int)$numero['numero_mesa']]['fecha_mesa'] ?? null,
                    'id_turno_anterior' => $pendientes[(int)$numero['numero_mesa']]['id_turno'] ?? null,
                    'fecha_nueva' => $fecha,
                    'id_turno_nuevo' => $idTurno,
                    'motivo' => 'acompañar_ancla_prioritaria',
                ];
            }
        }

        mesas_armado_docentes_grupos_insertar_grupo_simple(
            $insertGrupo,
            $proximoGrupo,
            $grupoTemporal,
            $estado,
            'Reoptimizada: grupo creado desde correlativa/prioritaria como ancla.',
            $horasTurnos
        );

        mesas_armado_docentes_reopt_eliminar_pendientes($pdo, array_keys($seleccionados));

        $grupos[$proximoGrupo] = [
            'numero_grupo' => $proximoGrupo,
            'fecha_mesa' => $fecha,
            'id_turno' => $idTurno,
            'id_area' => $ancla['id_area'] !== null ? (int)$ancla['id_area'] : null,
            'cantidad_numeros' => count($grupoTemporal),
            'max_orden' => count($grupoTemporal),
            'prioridad_max' => max(array_map(static fn (array $n): int => (int)$n['prioridad'], $grupoTemporal)),
            'tiene_taller' => false,
            'numeros' => $grupoTemporal,
        ];

        $ocupacion = $ocupacionTemporal;
        foreach (array_keys($seleccionados) as $usado) {
            unset($pendientes[(int)$usado]);
        }

        $stats['total_grupos_nuevos_por_ancla_prioritaria']++;
        $stats['total_numeros_reoptimizados'] += count($grupoTemporal);
        $stats['grupos_nuevos'][] = [
            'numero_grupo' => $proximoGrupo,
            'tipo' => 'ancla_prioritaria',
            'numeros_mesa' => array_map(static fn (array $n): int => (int)$n['numero_mesa'], $grupoTemporal),
            'fecha_mesa' => $fecha,
            'id_turno' => $idTurno,
            'id_area' => $ancla['id_area'],
        ];

        $proximoGrupo++;
    }
}

function mesas_armado_docentes_reopt_formar_grupos_simples(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupos,
    array &$pendientes,
    array &$ocupacion,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    array $horasTurnos,
    int $minNumeros,
    int $maxNumeros,
    string $estado,
    array &$stats
): void {
    $proximoGrupo = mesas_armado_docentes_grupos_proximo_numero($pdo);
    $sinSlotViable = [];

    while (true) {
        $simples = array_values(array_filter(
            $pendientes,
            static fn (array $n): bool => mesas_armado_docentes_reopt_es_simple_flexible($n)
                && !isset($sinSlotViable[(int)$n['numero_mesa']])
        ));

        if (count($simples) < $minNumeros) {
            break;
        }

        usort($simples, static function (array $a, array $b): int {
            return [
                (int)$a['id_area'],
                -(int)$a['cantidad_alumnos'],
                (int)$a['numero_mesa'],
            ] <=> [
                (int)$b['id_area'],
                -(int)$b['cantidad_alumnos'],
                (int)$b['numero_mesa'],
            ];
        });

        $base = $simples[0];
        $mejor = null;

        foreach ($slotsDisponibles as $slot) {
            $fecha = (string)($slot['fecha_mesa'] ?? $slot['fecha'] ?? '');
            $idTurno = (int)($slot['id_turno'] ?? 0);

            if ($fecha === '' || $idTurno <= 0) {
                continue;
            }

            $grupoTemporal = [];
            $seleccionados = [];
            $ocupacionTemporal = $ocupacion;

            foreach ($simples as $candidato) {
                if (count($grupoTemporal) >= $maxNumeros) {
                    break;
                }

                if (count($grupoTemporal) > 0 && !mesas_armado_docentes_reopt_compatible_con_numeros($candidato, $grupoTemporal)) {
                    continue;
                }

                if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($candidato, $fecha, $idTurno, $ocupacionTemporal, $disponibilidadDocentes)) {
                    continue;
                }

                $candidato = mesas_armado_docentes_reopt_marcar_slot_en_numero($candidato, $fecha, $idTurno);
                $grupoTemporal[] = $candidato;
                $seleccionados[(int)$candidato['numero_mesa']] = $candidato;
                mesas_armado_docentes_reopt_ocupar_numero($ocupacionTemporal, $candidato, $fecha, $idTurno);
            }

            if (count($grupoTemporal) < $minNumeros) {
                continue;
            }

            if ($mejor === null || count($grupoTemporal) > count($mejor['grupo'])) {
                $mejor = [
                    'fecha' => $fecha,
                    'id_turno' => $idTurno,
                    'grupo' => $grupoTemporal,
                    'seleccionados' => $seleccionados,
                    'ocupacion' => $ocupacionTemporal,
                ];
            }

            if ($mejor !== null && count($mejor['grupo']) >= $maxNumeros) {
                break;
            }
        }

        if ($mejor === null) {
            // Este simple no pudo entrar en ningún slot viable. Lo dejamos pendiente
            // y seguimos intentando con otros simples/áreas antes de terminar.
            $sinSlotViable[(int)$base['numero_mesa']] = true;
            continue;
        }

        $fecha = (string)$mejor['fecha'];
        $idTurno = (int)$mejor['id_turno'];
        $grupoTemporal = $mejor['grupo'];
        $seleccionados = $mejor['seleccionados'];

        foreach ($grupoTemporal as $numero) {
            mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$numero['numero_mesa'], $fecha, $idTurno);
            $stats['numeros_movidos_de_fecha_turno'][] = [
                'numero_mesa' => (int)$numero['numero_mesa'],
                'fecha_anterior' => $pendientes[(int)$numero['numero_mesa']]['fecha_mesa'] ?? null,
                'id_turno_anterior' => $pendientes[(int)$numero['numero_mesa']]['id_turno'] ?? null,
                'fecha_nueva' => $fecha,
                'id_turno_nuevo' => $idTurno,
                'motivo' => 'formar_grupo_simple_reoptimizado',
            ];
        }

        mesas_armado_docentes_grupos_insertar_grupo_simple(
            $insertGrupo,
            $proximoGrupo,
            $grupoTemporal,
            $estado,
            'Reoptimizada: grupo simple creado moviendo fecha/turno.',
            $horasTurnos
        );

        mesas_armado_docentes_reopt_eliminar_pendientes($pdo, array_keys($seleccionados));

        $grupos[$proximoGrupo] = [
            'numero_grupo' => $proximoGrupo,
            'fecha_mesa' => $fecha,
            'id_turno' => $idTurno,
            'id_area' => $grupoTemporal[0]['id_area'] !== null ? (int)$grupoTemporal[0]['id_area'] : null,
            'cantidad_numeros' => count($grupoTemporal),
            'max_orden' => count($grupoTemporal),
            'prioridad_max' => 0,
            'tiene_taller' => false,
            'numeros' => $grupoTemporal,
        ];

        $ocupacion = $mejor['ocupacion'];
        foreach (array_keys($seleccionados) as $usado) {
            unset($pendientes[(int)$usado]);
        }

        $stats['total_grupos_nuevos_simples']++;
        $stats['total_numeros_reoptimizados'] += count($grupoTemporal);
        $stats['grupos_nuevos'][] = [
            'numero_grupo' => $proximoGrupo,
            'tipo' => 'simples_movibles',
            'numeros_mesa' => array_map(static fn (array $n): int => (int)$n['numero_mesa'], $grupoTemporal),
            'fecha_mesa' => $fecha,
            'id_turno' => $idTurno,
            'id_area' => $grupoTemporal[0]['id_area'],
        ];

        $proximoGrupo++;
    }
}


/**
 * Busqueda profunda final.
 *
 * Esta etapa intenta resolver el caso mas fino: queda una mesa sin agrupar,
 * pero podria formar un grupo si se libera una mesa simple que ya estaba dentro
 * de un grupo de 3 o 4. Solo mueve numeros simples/prioridad 0, nunca talleres
 * ni correlativas. El grupo origen debe quedar con al menos $minNumeros.
 */
function mesas_armado_docentes_reopt_rearmar_con_donantes(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupos,
    array &$pendientes,
    array &$ocupacion,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    array $horasTurnos,
    int $minNumeros,
    int $maxNumeros,
    string $estado,
    array &$stats
): void {
    $pasadas = 0;
    $maxPasadas = 200;

    while (count($pendientes) > 0 && $pasadas < $maxPasadas) {
        $pasadas++;
        $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
        $mejorMovimiento = null;

        $pendientesOrdenados = $pendientes;
        uasort($pendientesOrdenados, static function (array $a, array $b): int {
            return [
                -(int)$a['prioridad'],
                mesas_armado_docentes_reopt_es_simple_flexible($a) ? 1 : 0,
                -(int)$a['cantidad_alumnos'],
                (int)$a['numero_mesa'],
            ] <=> [
                -(int)$b['prioridad'],
                mesas_armado_docentes_reopt_es_simple_flexible($b) ? 1 : 0,
                -(int)$b['cantidad_alumnos'],
                (int)$b['numero_mesa'],
            ];
        });

        foreach ($pendientesOrdenados as $numeroMesa => $pendiente) {
            if (!isset($pendientes[(int)$numeroMesa]) || !empty($pendiente['es_taller'])) {
                continue;
            }

            $movimiento = mesas_armado_docentes_reopt_buscar_mejor_movimiento_con_donante(
                $pendiente,
                $grupos,
                $ocupacion,
                $disponibilidadDocentes,
                $slotsDisponibles,
                $minNumeros,
                $maxNumeros
            );

            if ($movimiento === null) {
                continue;
            }

            if ($mejorMovimiento === null || $movimiento['score'] > $mejorMovimiento['score']) {
                $mejorMovimiento = $movimiento;
            }
        }

        if ($mejorMovimiento === null) {
            break;
        }

        mesas_armado_docentes_reopt_aplicar_movimiento_con_donante(
            $pdo,
            $insertGrupo,
            $grupos,
            $pendientes,
            $ocupacion,
            $mejorMovimiento,
            $horasTurnos,
            $estado,
            $stats
        );
    }

    $stats['pasadas_busqueda_profunda'] = (int)$pasadas;
}

function mesas_armado_docentes_reopt_buscar_mejor_movimiento_con_donante(
    array $pendiente,
    array $grupos,
    array $ocupacion,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    int $minNumeros,
    int $maxNumeros
): ?array {
    if (!empty($pendiente['es_taller'])) {
        return null;
    }

    $mejor = null;
    $slotsBase = mesas_armado_docentes_reopt_slots_para_pendiente_profundo($pendiente, $slotsDisponibles, $grupos);

    foreach ($grupos as $numeroGrupo => $grupo) {
        if (!empty($grupo['tiene_taller'])) {
            continue;
        }

        if ((int)($grupo['cantidad_numeros'] ?? count($grupo['numeros'] ?? [])) <= $minNumeros) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_area_compatible($pendiente, $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null)) {
            continue;
        }

        $fechaOrigen = (string)$grupo['fecha_mesa'];
        $turnoOrigen = (int)$grupo['id_turno'];

        foreach (($grupo['numeros'] ?? []) as $donante) {
            if (!mesas_armado_docentes_reopt_es_simple_flexible($donante)) {
                continue;
            }

            if (!mesas_armado_docentes_reopt_compatible_con_numeros($donante, [$pendiente])) {
                continue;
            }

            $slots = $slotsBase;
            $slots[] = [
                'fecha_mesa' => $fechaOrigen,
                'fecha' => $fechaOrigen,
                'id_turno' => $turnoOrigen,
            ];
            $slots = mesas_armado_docentes_reopt_normalizar_slots($slots);

            foreach ($slots as $slot) {
                $fechaDestino = (string)($slot['fecha_mesa'] ?? $slot['fecha'] ?? '');
                $turnoDestino = (int)($slot['id_turno'] ?? 0);

                if ($fechaDestino === '' || $turnoDestino <= 0) {
                    continue;
                }

                $ocupacionTemporal = $ocupacion;
                mesas_armado_docentes_reopt_liberar_numero($ocupacionTemporal, $donante, $fechaOrigen, $turnoOrigen);

                $pendienteDestino = mesas_armado_docentes_reopt_es_simple_flexible($pendiente)
                    ? mesas_armado_docentes_reopt_marcar_slot_en_numero($pendiente, $fechaDestino, $turnoDestino)
                    : $pendiente;

                $donanteDestino = mesas_armado_docentes_reopt_marcar_slot_en_numero($donante, $fechaDestino, $turnoDestino);

                if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($pendienteDestino, $fechaDestino, $turnoDestino, $ocupacionTemporal, $disponibilidadDocentes)) {
                    continue;
                }

                mesas_armado_docentes_reopt_ocupar_numero($ocupacionTemporal, $pendienteDestino, $fechaDestino, $turnoDestino);

                if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($donanteDestino, $fechaDestino, $turnoDestino, $ocupacionTemporal, $disponibilidadDocentes)) {
                    continue;
                }

                if (!mesas_armado_docentes_reopt_compatible_con_numeros($donanteDestino, [$pendienteDestino])) {
                    continue;
                }

                $grupoNuevo = [$pendienteDestino, $donanteDestino];

                if (count($grupoNuevo) < $minNumeros || count($grupoNuevo) > $maxNumeros) {
                    continue;
                }

                $score = 0;
                $score += ((int)$pendiente['prioridad']) * 100000;
                $score += ((int)$grupo['cantidad_numeros']) * 1000; // preferir sacar de grupos de 4 antes que de 3
                $score += ((int)$pendiente['cantidad_alumnos']) * 10;

                if ($fechaDestino === (string)($pendiente['fecha_mesa'] ?? '') && $turnoDestino === (int)($pendiente['id_turno'] ?? 0)) {
                    $score += 250;
                }

                if ($fechaDestino === $fechaOrigen && $turnoDestino === $turnoOrigen) {
                    $score += 100; // menos cambios de calendario si tambien sirve
                }

                $movimiento = [
                    'score' => $score,
                    'pendiente' => $pendiente,
                    'pendiente_destino' => $pendienteDestino,
                    'donante' => $donante,
                    'donante_destino' => $donanteDestino,
                    'grupo_origen' => (int)$numeroGrupo,
                    'fecha_origen' => $fechaOrigen,
                    'id_turno_origen' => $turnoOrigen,
                    'fecha_destino' => $fechaDestino,
                    'id_turno_destino' => $turnoDestino,
                    'grupo_nuevo' => $grupoNuevo,
                    'ocupacion_final' => $ocupacionTemporal,
                ];

                if ($mejor === null || $movimiento['score'] > $mejor['score']) {
                    $mejor = $movimiento;
                }
            }
        }
    }

    return $mejor;
}

function mesas_armado_docentes_reopt_slots_para_pendiente_profundo(array $pendiente, array $slotsDisponibles, array $grupos): array
{
    if (!mesas_armado_docentes_reopt_es_simple_flexible($pendiente)) {
        if ($pendiente['fecha_mesa'] === null || $pendiente['id_turno'] === null) {
            return [];
        }

        return [[
            'fecha_mesa' => (string)$pendiente['fecha_mesa'],
            'fecha' => (string)$pendiente['fecha_mesa'],
            'id_turno' => (int)$pendiente['id_turno'],
        ]];
    }

    $slots = [];

    if ($pendiente['fecha_mesa'] !== null && $pendiente['id_turno'] !== null) {
        $slots[] = [
            'fecha_mesa' => (string)$pendiente['fecha_mesa'],
            'fecha' => (string)$pendiente['fecha_mesa'],
            'id_turno' => (int)$pendiente['id_turno'],
        ];
    }

    foreach ($slotsDisponibles as $slot) {
        $slots[] = $slot;
    }

    foreach ($grupos as $grupo) {
        if (!empty($grupo['tiene_taller'])) {
            continue;
        }

        $slots[] = [
            'fecha_mesa' => (string)$grupo['fecha_mesa'],
            'fecha' => (string)$grupo['fecha_mesa'],
            'id_turno' => (int)$grupo['id_turno'],
        ];
    }

    return mesas_armado_docentes_reopt_normalizar_slots($slots);
}

function mesas_armado_docentes_reopt_normalizar_slots(array $slots): array
{
    $normalizados = [];
    $vistos = [];

    foreach ($slots as $slot) {
        $fecha = (string)($slot['fecha_mesa'] ?? $slot['fecha'] ?? '');
        $idTurno = (int)($slot['id_turno'] ?? 0);

        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }

        $key = $fecha . '|' . $idTurno;
        if (isset($vistos[$key])) {
            continue;
        }

        $vistos[$key] = true;
        $normalizados[] = [
            'fecha_mesa' => $fecha,
            'fecha' => $fecha,
            'id_turno' => $idTurno,
        ];
    }

    usort($normalizados, static function (array $a, array $b): int {
        return [
            (string)$a['fecha_mesa'],
            (int)$a['id_turno'],
        ] <=> [
            (string)$b['fecha_mesa'],
            (int)$b['id_turno'],
        ];
    });

    return $normalizados;
}

function mesas_armado_docentes_reopt_liberar_numero(array &$ocupacion, array $numero, string $fecha, int $idTurno): void
{
    foreach ($numero['docentes'] as $idDocente) {
        $idDocente = (int)$idDocente;
        if ($idDocente > 0) {
            unset($ocupacion['docentes'][mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno)]);
        }
    }

    foreach ($numero['alumnos'] as $dni) {
        $dni = trim((string)$dni);
        if ($dni !== '') {
            unset($ocupacion['alumnos'][mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno)]);
        }
    }
}

function mesas_armado_docentes_reopt_aplicar_movimiento_con_donante(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupos,
    array &$pendientes,
    array &$ocupacion,
    array $movimiento,
    array $horasTurnos,
    string $estado,
    array &$stats
): void {
    $numeroGrupoOrigen = (int)$movimiento['grupo_origen'];
    $donanteOriginal = $movimiento['donante'];
    $donanteDestino = $movimiento['donante_destino'];
    $pendienteOriginal = $movimiento['pendiente'];
    $pendienteDestino = $movimiento['pendiente_destino'];
    $fechaDestino = (string)$movimiento['fecha_destino'];
    $turnoDestino = (int)$movimiento['id_turno_destino'];
    $proximoGrupo = mesas_armado_docentes_grupos_proximo_numero($pdo);

    mesas_armado_docentes_reopt_quitar_donante_de_grupo_origen(
        $pdo,
        $grupos,
        $numeroGrupoOrigen,
        (int)$donanteOriginal['numero_mesa']
    );

    if (mesas_armado_docentes_reopt_es_simple_flexible($pendienteDestino)) {
        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$pendienteDestino['numero_mesa'], $fechaDestino, $turnoDestino);
    }

    mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$donanteDestino['numero_mesa'], $fechaDestino, $turnoDestino);

    mesas_armado_docentes_grupos_insertar_grupo_simple(
        $insertGrupo,
        $proximoGrupo,
        [$pendienteDestino, $donanteDestino],
        $estado,
        'Reoptimizada profunda: grupo creado moviendo una mesa simple desde otro grupo.',
        $horasTurnos
    );

    mesas_armado_docentes_reopt_eliminar_pendientes($pdo, [(int)$pendienteDestino['numero_mesa']]);
    unset($pendientes[(int)$pendienteDestino['numero_mesa']]);

    $grupos[$proximoGrupo] = [
        'numero_grupo' => $proximoGrupo,
        'fecha_mesa' => $fechaDestino,
        'id_turno' => $turnoDestino,
        'id_area' => $pendienteDestino['id_area'] !== null ? (int)$pendienteDestino['id_area'] : null,
        'cantidad_numeros' => 2,
        'max_orden' => 2,
        'prioridad_max' => max((int)$pendienteDestino['prioridad'], (int)$donanteDestino['prioridad']),
        'tiene_taller' => false,
        'numeros' => [$pendienteDestino, $donanteDestino],
    ];

    $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);

    $stats['total_reubicadas_por_intercambio']++;
    $stats['total_grupos_rearmados_por_intercambio']++;
    $stats['total_numeros_reoptimizados'] += 2;

    $stats['numeros_movidos_de_fecha_turno'][] = [
        'numero_mesa' => (int)$donanteDestino['numero_mesa'],
        'fecha_anterior' => $movimiento['fecha_origen'],
        'id_turno_anterior' => $movimiento['id_turno_origen'],
        'fecha_nueva' => $fechaDestino,
        'id_turno_nuevo' => $turnoDestino,
        'motivo' => 'donante_para_rescatar_no_agrupada',
    ];

    if (mesas_armado_docentes_reopt_es_simple_flexible($pendienteOriginal)) {
        $stats['numeros_movidos_de_fecha_turno'][] = [
            'numero_mesa' => (int)$pendienteDestino['numero_mesa'],
            'fecha_anterior' => $pendienteOriginal['fecha_mesa'] ?? null,
            'id_turno_anterior' => $pendienteOriginal['id_turno'] ?? null,
            'fecha_nueva' => $fechaDestino,
            'id_turno_nuevo' => $turnoDestino,
            'motivo' => 'pendiente_rescatada_por_intercambio',
        ];
    }

    $stats['intercambios_profundos'][] = [
        'grupo_origen' => $numeroGrupoOrigen,
        'grupo_nuevo' => $proximoGrupo,
        'numero_mesa_pendiente' => (int)$pendienteDestino['numero_mesa'],
        'numero_mesa_donante' => (int)$donanteDestino['numero_mesa'],
        'fecha_destino' => $fechaDestino,
        'id_turno_destino' => $turnoDestino,
        'area' => $pendienteDestino['id_area'] !== null ? (int)$pendienteDestino['id_area'] : null,
        'detalle' => 'Se saco una mesa simple de un grupo valido y se creo un grupo nuevo de 2 numeros para reducir no agrupadas.',
    ];

    $stats['grupos_nuevos'][] = [
        'numero_grupo' => $proximoGrupo,
        'tipo' => 'intercambio_profundo_con_donante',
        'numeros_mesa' => [(int)$pendienteDestino['numero_mesa'], (int)$donanteDestino['numero_mesa']],
        'fecha_mesa' => $fechaDestino,
        'id_turno' => $turnoDestino,
        'id_area' => $pendienteDestino['id_area'],
    ];
}

function mesas_armado_docentes_reopt_quitar_donante_de_grupo_origen(
    PDO $pdo,
    array &$grupos,
    int $numeroGrupo,
    int $numeroMesa
): void {
    if (!isset($grupos[$numeroGrupo])) {
        return;
    }

    $stmt = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ? AND numero_mesa = ?');
    $stmt->execute([$numeroGrupo, $numeroMesa]);

    $nuevosNumeros = [];
    foreach ($grupos[$numeroGrupo]['numeros'] as $numero) {
        if ((int)$numero['numero_mesa'] !== $numeroMesa) {
            $nuevosNumeros[] = $numero;
        }
    }

    $grupos[$numeroGrupo]['numeros'] = array_values($nuevosNumeros);
    $grupos[$numeroGrupo]['cantidad_numeros'] = count($nuevosNumeros);
    $grupos[$numeroGrupo]['max_orden'] = count($nuevosNumeros);
    $grupos[$numeroGrupo]['prioridad_max'] = count($nuevosNumeros) > 0
        ? max(array_map(static fn (array $n): int => (int)$n['prioridad'], $nuevosNumeros))
        : 0;

    $stmtOrden = $pdo->prepare('UPDATE mesas_grupos SET orden = ? WHERE numero_grupo = ? AND numero_mesa = ?');
    $orden = 1;
    foreach ($nuevosNumeros as $numero) {
        $stmtOrden->execute([$orden, $numeroGrupo, (int)$numero['numero_mesa']]);
        $orden++;
    }
}
