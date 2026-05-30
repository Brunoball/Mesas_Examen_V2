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
 * - Nunca mezclar talleres, nunca generar choque de alumno y evitar que un docente quede en dos salidas separadas del mismo slot.
 * - Las áreas NO bloquean agrupación: en este armado manda la disponibilidad docente; el área solo ordena candidatos como criterio secundario.
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
    $fechaInicioRango = isset($opciones['fecha_inicio']) ? trim((string)$opciones['fecha_inicio']) : null;
    $fechaFinRango = isset($opciones['fecha_fin']) ? trim((string)$opciones['fecha_fin']) : null;
    $modoTurnos = mesas_armado_docentes_normalizar_modo_turnos($opciones['modo_turnos'] ?? $opciones['modoTurnos'] ?? 'combinado');

    $numerosIndex = mesas_armado_docentes_reopt_indexar_numeros(mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo));
    $pendientes = mesas_armado_docentes_reopt_obtener_pendientes($pdo, $numerosIndex);

    $totalPendientesInicial = count($pendientes);

    if ($totalPendientesInicial === 0) {
        $disponibilidadDocentesSinPendientes = mesas_armado_docentes_obtener_disponibilidad_docentes($pdo);
        $blindajeCobertura = function_exists('mesas_armado_docentes_grupos_blindar_cobertura_salida')
            ? mesas_armado_docentes_grupos_blindar_cobertura_salida($pdo, $horasTurnos, $disponibilidadDocentesSinPendientes)
            : null;

        $statsSinPendientes = [
            'grupos_sql_invalidos_por_un_solo_docente_blindados' => [],
            'total_grupos_sql_invalidos_por_un_solo_docente_blindados' => 0,
            'blindaje_choques_docente_alumno' => [],
        ];
        mesas_armado_docentes_reopt_blindar_sql_grupos_con_un_solo_docente($pdo, $horasTurnos, $statsSinPendientes);
        $gruposSinPendientes = mesas_armado_docentes_reopt_obtener_grupos_actuales($pdo, $numerosIndex);
        $slotsSinPendientes = mesas_armado_docentes_reopt_obtener_slots_disponibles($pdo, [], $gruposSinPendientes, $fechaInicioRango, $fechaFinRango, $modoTurnos);
        mesas_armado_docentes_reopt_blindar_choques_docente_alumno_salida(
            $pdo,
            $horasTurnos,
            $disponibilidadDocentesSinPendientes,
            $minNumeros,
            $maxNumeros,
            $slotsSinPendientes,
            $statsSinPendientes
        );

        return [
            'fase' => 7,
            'reoptimizacion_ejecutada' => true,
            'total_no_agrupadas_iniciales' => 0,
            'total_reubicadas_en_grupos_existentes' => 0,
            'total_grupos_nuevos_por_reoptimizacion' => 0,
            'total_numeros_reoptimizados' => 0,
            'blindaje_cobertura' => $blindajeCobertura,
            'total_orfanas_detectadas_por_blindaje' => is_array($blindajeCobertura) ? ($blindajeCobertura['total_orfanas_detectadas'] ?? 0) : 0,
            'total_grupos_sql_invalidos_por_un_solo_docente_blindados' => $statsSinPendientes['total_grupos_sql_invalidos_por_un_solo_docente_blindados'],
            'grupos_sql_invalidos_por_un_solo_docente_blindados' => $statsSinPendientes['grupos_sql_invalidos_por_un_solo_docente_blindados'],
            'total_no_agrupadas_finales' => (int)$pdo->query('SELECT COUNT(*) FROM mesas_no_agrupadas')->fetchColumn(),
            'totales_finales' => mesas_armado_docentes_grupos_totales_finales($pdo),
            'detalle' => 'No había mesas pendientes para reoptimizar; se ejecutó igualmente el blindaje de cobertura y de docentes distintos.',
        ];
    }

    $disponibilidadDocentes = mesas_armado_docentes_obtener_disponibilidad_docentes($pdo);
    $grupos = mesas_armado_docentes_reopt_obtener_grupos_actuales($pdo, $numerosIndex);
    $slotsDisponibles = mesas_armado_docentes_reopt_obtener_slots_disponibles($pdo, $pendientes, $grupos, $fechaInicioRango, $fechaFinRango, $modoTurnos);
    $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
    $estadoGrupo = $confirmarGrupos ? 'validado' : 'borrador';

    $insertGrupo = $pdo->prepare("\n        INSERT INTO mesas_grupos (\n            numero_grupo,\n            numero_mesa,\n            fecha_mesa,\n            id_turno,\n            hora,\n            id_area,\n            orden,\n            tipo_mesa,\n            prioridad,\n            cantidad_alumnos,\n            estado,\n            observacion\n        ) VALUES (\n            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?\n        )\n    ");

    $stats = [
        'fase' => 7,
        'reoptimizacion_ejecutada' => true,
        'criterio' => 'primero completa grupos existentes por misma fecha/turno/disponibilidad; luego usa correlativas como anclas; despues agrupa simples movibles; por ultimo ejecuta busqueda profunda con donantes, pudiendo sacar una mesa simple de un grupo de 3 o 4 para crear otro grupo valido con una no agrupada. El area solo ordena como criterio secundario; no bloquea mezclar materias de areas distintas. Nunca deja una mesa simple con un único docente/persona distinta; mínimo 2 docentes distintos, excepto talleres.',
        'modo_turnos' => $modoTurnos,
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
        'total_reemplazos_en_grupo_lleno' => 0,
        'total_donantes_reubicados_por_reemplazo' => 0,
        'reemplazos_en_grupo_lleno' => [],
        'grupos_sql_invalidos_por_un_solo_docente_blindados' => [],
        'total_grupos_sql_invalidos_por_un_solo_docente_blindados' => 0,
        'pasadas_busqueda_profunda' => 0,
        'numeros_movidos_de_fecha_turno' => [],
        'numeros_insertados_en_grupos_existentes' => [],
        'intercambios_profundos' => [],
        'grupos_nuevos' => [],
        'grupos_invalidos_por_un_solo_docente_blindados' => [],
        'total_grupos_invalidos_por_un_solo_docente_blindados' => 0,
        'blindaje_choques_docente_alumno' => [],
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

    // 4) Reemplazo inteligente en grupos llenos:
    //    si una no agrupada es compatible por disponibilidad con un grupo ya completo,
    //    entra al grupo y se reubica otra mesa simple hacia otro grupo/mesa valida.
    //    Esto evita crear el grupo invalido de 2 numeros con el mismo docente.
    mesas_armado_docentes_reopt_reemplazar_en_grupos_llenos(
        $pdo,
        $insertGrupo,
        $grupos,
        $pendientes,
        $ocupacion,
        $disponibilidadDocentes,
        $slotsDisponibles,
        $horasTurnos,
        $maxNumeros,
        $estadoGrupo,
        $stats
    );

    // 5) Busqueda profunda: puede sacar mesas simples de grupos ya creados
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

    mesas_armado_docentes_reopt_blindar_grupos_con_un_solo_docente($pdo, $grupos, $pendientes, $horasTurnos, $stats);

    $stats['total_grupos_nuevos_por_reoptimizacion'] = $stats['total_grupos_nuevos_por_ancla_prioritaria'] + $stats['total_grupos_nuevos_simples'] + $stats['total_grupos_rearmados_por_intercambio'];

    if (function_exists('mesas_armado_docentes_grupos_blindar_cobertura_salida')) {
        $stats['blindaje_cobertura'] = mesas_armado_docentes_grupos_blindar_cobertura_salida($pdo, $horasTurnos, $disponibilidadDocentes);
        $stats['total_orfanas_detectadas_por_blindaje'] = $stats['blindaje_cobertura']['total_orfanas_detectadas'] ?? 0;
    }

    // Blindaje final a nivel SQL: aunque una fase haya insertado algo mal,
    // ninguna mesa simple puede quedar con un unico docente/persona distinta.
    mesas_armado_docentes_reopt_blindar_sql_grupos_con_un_solo_docente($pdo, $horasTurnos, $stats);

    // Blindaje final operativo: ningún docente/alumno puede quedar en dos salidas
    // distintas del mismo día y turno. Si un mismo docente comparte slot, se intenta
    // primero unir en el mismo grupo; si no entra, se mueve una salida completa.
    mesas_armado_docentes_reopt_blindar_choques_docente_alumno_salida(
        $pdo,
        $horasTurnos,
        $disponibilidadDocentes,
        $minNumeros,
        $maxNumeros,
        $slotsDisponibles,
        $stats
    );

    // Limpieza final: si un numero fue rescatado y quedo en un grupo valido,
    // no debe seguir mostrando la observacion vieja de no agrupada.
    mesas_armado_docentes_reopt_limpiar_observaciones_de_agrupadas($pdo);

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

function mesas_armado_docentes_reopt_obtener_slots_disponibles(PDO $pdo, array $pendientes, array $grupos, ?string $fechaInicioRango = null, ?string $fechaFinRango = null, mixed $modoTurnos = 'combinado'): array
{
    $stmt = $pdo->query("
        SELECT DISTINCT fecha_mesa, id_turno
        FROM mesas
        WHERE fecha_mesa IS NOT NULL
          AND id_turno IS NOT NULL
          AND estado IN ('borrador', 'armada')
        ORDER BY fecha_mesa ASC, id_turno ASC
    ");

    $rangoExplicito = $fechaInicioRango !== null && $fechaFinRango !== null
        && function_exists('mesas_armado_docentes_fecha_valida')
        && mesas_armado_docentes_fecha_valida($fechaInicioRango)
        && mesas_armado_docentes_fecha_valida($fechaFinRango)
        && $fechaFinRango >= $fechaInicioRango;

    $enRango = static function (?string $fecha) use ($rangoExplicito, $fechaInicioRango, $fechaFinRango): bool {
        if (!$rangoExplicito) {
            return true;
        }

        if ($fecha === null || $fecha === '') {
            return false;
        }

        return $fecha >= (string)$fechaInicioRango && $fecha <= (string)$fechaFinRango;
    };

    $turnosPermitidos = [];
    if (function_exists('mesas_armado_docentes_filtrar_turnos_por_modo')) {
        $stmtTurnosPermitidos = $pdo->query("
            SELECT id_turno, turno
            FROM turnos
            WHERE activo = 1
            ORDER BY id_turno ASC
        ");

        foreach (mesas_armado_docentes_filtrar_turnos_por_modo($stmtTurnosPermitidos->fetchAll(PDO::FETCH_ASSOC), $modoTurnos) as $turnoPermitido) {
            $turnosPermitidos[(int)$turnoPermitido['id_turno']] = true;
        }
    }

    $modoNormalizado = function_exists('mesas_armado_docentes_normalizar_modo_turnos')
        ? mesas_armado_docentes_normalizar_modo_turnos($modoTurnos)
        : 'combinado';

    $slots = [];
    $vistos = [];

    $agregar = static function (?string $fecha, mixed $idTurno) use (&$slots, &$vistos, $enRango, $turnosPermitidos, $modoNormalizado): void {
        if ($fecha === null || $fecha === '' || $idTurno === null || (int)$idTurno <= 0) {
            return;
        }

        if (!$enRango($fecha)) {
            return;
        }

        if ($modoNormalizado !== 'combinado' && !isset($turnosPermitidos[(int)$idTurno])) {
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

    /*
     * Regla dura: la reoptimización NUNCA puede inventar días fuera del rango
     * elegido en el modal. Si el armado se pidió de martes a miércoles, solo se
     * prueban slots de martes a miércoles. Si un docente solo puede viernes, la
     * mesa debe quedar en no agrupadas/observada con motivo claro, no moverse a viernes.
     */
    if ($rangoExplicito && function_exists('mesas_armado_docentes_obtener_slots')) {
        foreach (mesas_armado_docentes_obtener_slots($pdo, (string)$fechaInicioRango, (string)$fechaFinRango, true, $modoTurnos) as $slotRango) {
            $agregar((string)($slotRango['fecha_mesa'] ?? $slotRango['fecha'] ?? ''), $slotRango['id_turno'] ?? null);
        }
    } else {
        // Cuando la fase se ejecuta suelta y no se recibe rango, se usan SOLO los slots ya existentes.
        // No se abre una ventana extra de +7 días porque eso genera días no solicitados por el usuario.
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $agregar((string)$row['fecha_mesa'], $row['id_turno']);
        }
    }

    foreach ($grupos as $grupo) {
        $agregar($grupo['fecha_mesa'] ?? null, $grupo['id_turno'] ?? null);
    }

    foreach ($pendientes as $numero) {
        $agregar($numero['fecha_mesa'] ?? null, $numero['id_turno'] ?? null);
    }

    usort($slots, static function (array $a, array $b): int {
        return [(string)$a['fecha_mesa'], (int)$a['id_turno']]
            <=> [(string)$b['fecha_mesa'], (int)$b['id_turno']];
    });

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
    /*
     * Armado por disponibilidad docente:
     * el área NO es una restricción dura. Se conserva esta función por compatibilidad
     * con llamadas existentes, pero siempre permite mezclar áreas distintas.
     * Las reglas duras son: mismo slot viable para los docentes, sin choque de alumno,
     * sin mezclar talleres y mínimo 2 docentes/personas distintas en grupos normales.
     */
    return empty($numero['es_taller']);
}

function mesas_armado_docentes_reopt_docente_compartido_permitido(array $numero, array $actual): bool
{
    if (function_exists('mesas_armado_docentes_grupos_docente_compartido_permitido')) {
        return mesas_armado_docentes_grupos_docente_compartido_permitido($numero, $actual);
    }

    return empty($numero['es_taller'])
        && empty($actual['es_taller'])
        && (int)($numero['prioridad'] ?? 0) === 0
        && (int)($actual['prioridad'] ?? 0) === 0
        && (string)($numero['tipo_mesa'] ?? 'simple') === 'simple'
        && (string)($actual['tipo_mesa'] ?? 'simple') === 'simple'
        && count(array_intersect($numero['docentes'] ?? [], $actual['docentes'] ?? [])) > 0;
}

function mesas_armado_docentes_reopt_misma_area(array $numero, array $actual): bool
{
    return ($numero['id_area'] ?? null) !== null
        && ($actual['id_area'] ?? null) !== null
        && (int)$numero['id_area'] === (int)$actual['id_area'];
}


function mesas_armado_docentes_reopt_cantidad_docentes_distintos(array $numeros): int
{
    if (function_exists('mesas_armado_docentes_grupos_cantidad_docentes_distintos')) {
        return mesas_armado_docentes_grupos_cantidad_docentes_distintos($numeros);
    }

    $docentes = [];
    foreach ($numeros as $numero) {
        foreach (($numero['docentes'] ?? []) as $idDocente) {
            $idDocente = (int)$idDocente;
            if ($idDocente > 0) {
                $docentes[$idDocente] = true;
            }
        }
    }

    return count($docentes);
}

function mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos(array $numeros, int $minDocentes = 2): bool
{
    if (function_exists('mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos')) {
        return mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos($numeros, $minDocentes);
    }

    foreach ($numeros as $numero) {
        if (!empty($numero['es_taller']) || (string)($numero['tipo_mesa'] ?? '') === 'taller' || (int)($numero['prioridad'] ?? 0) === 1) {
            return true;
        }
    }

    if (count($numeros) < 2) {
        return false;
    }

    return mesas_armado_docentes_reopt_cantidad_docentes_distintos($numeros) >= $minDocentes;
}

function mesas_armado_docentes_reopt_score_grupo_para_pendiente(array $numero, array $grupo): int
{
    $score = 0;

    foreach (($grupo['numeros'] ?? []) as $actual) {
        if (mesas_armado_docentes_reopt_docente_compartido_permitido($numero, $actual)) {
            $score += 1000000;
        } elseif (mesas_armado_docentes_reopt_misma_area($numero, $actual)) {
            $score += 10000;
        }
    }

    $score += max(0, 4 - (int)($grupo['cantidad_numeros'] ?? count($grupo['numeros'] ?? []))) * 100;
    $score += (int)($numero['prioridad'] ?? 0) * 10;

    return $score;
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
            if (!mesas_armado_docentes_reopt_docente_compartido_permitido($numero, $actual)) {
                return false;
            }
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
            $clave = mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno);
            $ocupacion['docentes'][$clave] = (int)($ocupacion['docentes'][$clave] ?? 0) + 1;
        }
    }

    foreach ($numero['alumnos'] as $dni) {
        $dni = trim((string)$dni);
        if ($dni !== '') {
            $clave = mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno);
            $ocupacion['alumnos'][$clave] = (int)($ocupacion['alumnos'][$clave] ?? 0) + 1;
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
    // Si una mesa venia observada por no encontrar slot y la reoptimizacion
    // finalmente la ubica en un grupo valido, hay que limpiar esa observacion.
    // Antes solo se actualizaban borrador/armada, por eso quedaba pegado el texto
    // "No se encontro fecha/turno..." aunque el numero ya apareciera agrupado.
    $stmt = $pdo->prepare("\n        UPDATE mesas\n        SET fecha_mesa = ?,\n            id_turno = ?,\n            estado = CASE WHEN estado = 'observada' THEN 'borrador' ELSE estado END,\n            observacion = NULL\n        WHERE numero_mesa = ?\n          AND estado IN ('borrador', 'armada', 'observada')\n    ");
    $stmt->execute([$fecha, $idTurno, $numeroMesa]);
}

function mesas_armado_docentes_reopt_limpiar_observaciones_de_agrupadas(PDO $pdo): void
{
    // Blindaje visual/final: todo numero que termino en mesas_grupos ya no debe
    // mostrar motivos viejos de mesas_no_agrupadas o de la fase 3.
    $pdo->exec("
        UPDATE mesas me
        INNER JOIN mesas_grupos mg
            ON mg.numero_mesa = me.numero_mesa
        SET me.observacion = NULL,
            me.estado = CASE WHEN me.estado = 'observada' THEN 'borrador' ELSE me.estado END
        WHERE me.numero_mesa IS NOT NULL
          AND me.observacion IS NOT NULL
    ");
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

        $ordenGrupos = array_keys($grupos);
        usort($ordenGrupos, static function ($a, $b) use ($numero, $grupos): int {
            $scoreA = mesas_armado_docentes_reopt_score_grupo_para_pendiente($numero, $grupos[$a]);
            $scoreB = mesas_armado_docentes_reopt_score_grupo_para_pendiente($numero, $grupos[$b]);

            if ($scoreA !== $scoreB) {
                return $scoreB <=> $scoreA;
            }

            return (int)$a <=> (int)$b;
        });

        foreach ($ordenGrupos as $numeroGrupo) {
            if (!isset($pendientes[$numeroMesa]) || !isset($grupos[$numeroGrupo])) {
                break;
            }

            $grupo =& $grupos[$numeroGrupo];

            if (!empty($grupo['tiene_taller']) || (int)$grupo['cantidad_numeros'] >= $maxNumeros) {
                unset($grupo);
                continue;
            }

            $fecha = (string)$grupo['fecha_mesa'];
            $idTurno = (int)$grupo['id_turno'];

            if (!mesas_armado_docentes_reopt_area_compatible($numero, $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null)) {
                unset($grupo);
                continue;
            }

            if (!mesas_armado_docentes_reopt_compatible_con_numeros($numero, $grupo['numeros'])) {
                unset($grupo);
                continue;
            }

            if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos(array_merge($grupo['numeros'], [$numero]))) {
                unset($grupo);
                continue;
            }

            /*
             * Para completar un grupo existente se libera temporalmente la
             * ocupación del propio grupo. Así el mismo docente puede sumarse
             * dentro del mismo grupo si la compatibilidad interna lo permite,
             * pero sigue bloqueado si está ocupado en OTRO grupo del slot.
             */
            $ocupacionDisponible = mesas_armado_docentes_reopt_ocupacion_sin_grupo($ocupacion, $grupo);

            if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($numero, $fecha, $idTurno, $ocupacionDisponible, $disponibilidadDocentes)) {
                unset($grupo);
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

            unset($pendientes[$numeroMesa]);
            $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
            unset($grupo);
            break;
        }
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
        if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($ancla, $fecha, $idTurno, $ocupacion, $disponibilidadDocentes)) {
            continue;
        }

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

            if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($candidato, $fecha, $idTurno, $ocupacion, $disponibilidadDocentes)) {
                continue;
            }

            $candidato = mesas_armado_docentes_reopt_marcar_slot_en_numero($candidato, $fecha, $idTurno);
            $grupoTemporal[] = $candidato;
            $seleccionados[(int)$candidatoMesa] = $candidato;
        }

        if (count($grupoTemporal) < $minNumeros || !mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($grupoTemporal)) {
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

        $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
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
                -(int)$a['cantidad_alumnos'],
                (int)($a['id_area'] ?? 0),
                (int)$a['numero_mesa'],
            ] <=> [
                -(int)$b['cantidad_alumnos'],
                (int)($b['id_area'] ?? 0),
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
            foreach ($simples as $candidato) {

                if (count($grupoTemporal) >= $maxNumeros) {
                    break;
                }

                if (count($grupoTemporal) > 0 && !mesas_armado_docentes_reopt_compatible_con_numeros($candidato, $grupoTemporal)) {
                    continue;
                }

                if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($candidato, $fecha, $idTurno, $ocupacion, $disponibilidadDocentes)) {
                    continue;
                }

                $candidato = mesas_armado_docentes_reopt_marcar_slot_en_numero($candidato, $fecha, $idTurno);
                $grupoTemporal[] = $candidato;
                $seleccionados[(int)$candidato['numero_mesa']] = $candidato;
            }

            if (count($grupoTemporal) < $minNumeros || !mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($grupoTemporal)) {
                continue;
            }

            if ($mejor === null || count($grupoTemporal) > count($mejor['grupo'])) {
                $mejor = [
                    'fecha' => $fecha,
                    'id_turno' => $idTurno,
                    'grupo' => $grupoTemporal,
                    'seleccionados' => $seleccionados,
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

        $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
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

            $grupoOrigenRestante = array_values(array_filter(
                $grupo['numeros'] ?? [],
                static fn (array $n): bool => (int)$n['numero_mesa'] !== (int)$donante['numero_mesa']
            ));

            if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($grupoOrigenRestante)) {
                continue;
            }

            if (mesas_armado_docentes_reopt_cantidad_docentes_distintos([$pendiente, $donante]) < 2) {
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

                if (!mesas_armado_docentes_reopt_compatible_con_numeros($donanteDestino, [$pendienteDestino])) {
                    continue;
                }

                if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($pendienteDestino, $fechaDestino, $turnoDestino, $ocupacionTemporal, $disponibilidadDocentes)) {
                    continue;
                }

                if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($donanteDestino, $fechaDestino, $turnoDestino, $ocupacionTemporal, $disponibilidadDocentes)) {
                    continue;
                }

                $grupoNuevo = [$pendienteDestino, $donanteDestino];

                if (count($grupoNuevo) < $minNumeros || count($grupoNuevo) > $maxNumeros) {
                    continue;
                }

                if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($grupoNuevo)) {
                    continue;
                }

                $score = 0;
                $score += ((int)$pendiente['prioridad']) * 100000;
                $score += ((int)$grupo['cantidad_numeros']) * 1000; // preferir sacar de grupos de 4 antes que de 3
                $score += ((int)$pendiente['cantidad_alumnos']) * 10;

                if (mesas_armado_docentes_reopt_docente_compartido_permitido($pendienteDestino, $donanteDestino)) {
                    $score += 500000;
                } elseif (mesas_armado_docentes_reopt_misma_area($pendienteDestino, $donanteDestino)) {
                    $score += 20000;
                }

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
            $clave = mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno);
            if (isset($ocupacion['docentes'][$clave])) {
                $ocupacion['docentes'][$clave] = (int)$ocupacion['docentes'][$clave] - 1;
                if ((int)$ocupacion['docentes'][$clave] <= 0) {
                    unset($ocupacion['docentes'][$clave]);
                }
            }
        }
    }

    foreach ($numero['alumnos'] as $dni) {
        $dni = trim((string)$dni);
        if ($dni !== '') {
            $clave = mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno);
            if (isset($ocupacion['alumnos'][$clave])) {
                $ocupacion['alumnos'][$clave] = (int)$ocupacion['alumnos'][$clave] - 1;
                if ((int)$ocupacion['alumnos'][$clave] <= 0) {
                    unset($ocupacion['alumnos'][$clave]);
                }
            }
        }
    }
}

function mesas_armado_docentes_reopt_ocupacion_sin_grupo(array $ocupacion, array $grupo): array
{
    $ocupacionDisponible = $ocupacion;
    $fecha = (string)($grupo['fecha_mesa'] ?? '');
    $idTurno = (int)($grupo['id_turno'] ?? 0);

    if ($fecha === '' || $idTurno <= 0) {
        return $ocupacionDisponible;
    }

    foreach (($grupo['numeros'] ?? []) as $numero) {
        mesas_armado_docentes_reopt_liberar_numero($ocupacionDisponible, $numero, $fecha, $idTurno);
    }

    return $ocupacionDisponible;
}



function mesas_armado_docentes_reopt_reemplazar_en_grupos_llenos(
    PDO $pdo,
    PDOStatement $insertGrupo,
    array &$grupos,
    array &$pendientes,
    array &$ocupacion,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    array $horasTurnos,
    int $maxNumeros,
    string $estado,
    array &$stats
): void {
    $maxPasadas = 200;
    $pasada = 0;

    while (count($pendientes) > 0 && $pasada < $maxPasadas) {
        $pasada++;
        $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);
        $mejor = null;

        foreach ($pendientes as $numeroMesa => $pendiente) {
            if (!isset($pendientes[(int)$numeroMesa]) || !mesas_armado_docentes_reopt_es_simple_flexible($pendiente)) {
                continue;
            }

            $movimiento = mesas_armado_docentes_reopt_buscar_mejor_reemplazo_en_grupo_lleno(
                $pendiente,
                $grupos,
                $pendientes,
                $ocupacion,
                $disponibilidadDocentes,
                $slotsDisponibles,
                $maxNumeros
            );

            if ($movimiento === null) {
                continue;
            }

            if ($mejor === null || (int)$movimiento['score'] > (int)$mejor['score']) {
                $mejor = $movimiento;
            }
        }

        if ($mejor === null) {
            break;
        }

        mesas_armado_docentes_reopt_aplicar_reemplazo_en_grupo_lleno(
            $pdo,
            $insertGrupo,
            $grupos,
            $pendientes,
            $ocupacion,
            $mejor,
            $horasTurnos,
            $estado,
            $stats
        );
    }
}

function mesas_armado_docentes_reopt_buscar_mejor_reemplazo_en_grupo_lleno(
    array $pendiente,
    array $grupos,
    array $pendientes,
    array $ocupacion,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    int $maxNumeros
): ?array {
    $mejor = null;

    foreach ($grupos as $numeroGrupo => $grupo) {
        if (!empty($grupo['tiene_taller'])) {
            continue;
        }

        if ((int)($grupo['cantidad_numeros'] ?? count($grupo['numeros'] ?? [])) < $maxNumeros) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_area_compatible($pendiente, $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null)) {
            continue;
        }

        // Solo tiene sentido este reemplazo cuando el pendiente comparte docente
        // con algun numero que queda dentro del grupo. Eso resuelve el caso Bosio:
        // entra Analisis Matematico con Bosio en el grupo donde ya esta Matematica/Bosio.
        $comparteDocenteConGrupo = false;
        foreach (($grupo['numeros'] ?? []) as $actual) {
            if (mesas_armado_docentes_reopt_docente_compartido_permitido($pendiente, $actual)) {
                $comparteDocenteConGrupo = true;
                break;
            }
        }

        if (!$comparteDocenteConGrupo) {
            continue;
        }

        $fechaGrupo = (string)$grupo['fecha_mesa'];
        $turnoGrupo = (int)$grupo['id_turno'];
        $pendienteEnGrupo = mesas_armado_docentes_reopt_marcar_slot_en_numero($pendiente, $fechaGrupo, $turnoGrupo);
        $ocupacionSinGrupo = mesas_armado_docentes_reopt_ocupacion_sin_grupo($ocupacion, $grupo);

        if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($pendienteEnGrupo, $fechaGrupo, $turnoGrupo, $ocupacionSinGrupo, $disponibilidadDocentes)) {
            continue;
        }

        foreach (($grupo['numeros'] ?? []) as $expulsado) {
            if (!mesas_armado_docentes_reopt_es_simple_flexible($expulsado)) {
                continue;
            }

            // No expulsar, salvo que no haya alternativa, al numero que comparte docente
            // con el pendiente: si sacamos el 6 de Bosio y metemos el 39 de Bosio,
            // no logramos que Bosio concentre sus mesas.
            $expulsadoComparteDocente = mesas_armado_docentes_reopt_docente_compartido_permitido($pendienteEnGrupo, $expulsado);

            $grupoReemplazado = [];
            foreach (($grupo['numeros'] ?? []) as $n) {
                if ((int)$n['numero_mesa'] !== (int)$expulsado['numero_mesa']) {
                    $grupoReemplazado[] = $n;
                }
            }
            $grupoReemplazado[] = $pendienteEnGrupo;

            if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($grupoReemplazado)) {
                continue;
            }

            $compatible = true;
            for ($i = 0; $i < count($grupoReemplazado); $i++) {
                $resto = $grupoReemplazado;
                $numero = $resto[$i];
                array_splice($resto, $i, 1);
                if (!mesas_armado_docentes_reopt_compatible_con_numeros($numero, $resto)) {
                    $compatible = false;
                    break;
                }
            }

            if (!$compatible) {
                continue;
            }

            $gruposConReemplazo = $grupos;
            $gruposConReemplazo[(int)$numeroGrupo]['numeros'] = array_values($grupoReemplazado);
            $gruposConReemplazo[(int)$numeroGrupo]['cantidad_numeros'] = count($grupoReemplazado);
            $ocupacionConReemplazo = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($gruposConReemplazo);

            $destino = mesas_armado_docentes_reopt_buscar_destino_para_expulsado_de_reemplazo(
                $expulsado,
                (int)$numeroGrupo,
                $gruposConReemplazo,
                $pendientes,
                (int)$pendiente['numero_mesa'],
                $ocupacionConReemplazo,
                $disponibilidadDocentes,
                $slotsDisponibles,
                $maxNumeros
            );

            if ($destino === null) {
                continue;
            }

            $score = 900000;
            $score += $expulsadoComparteDocente ? 0 : 250000;
            $score += (int)($pendiente['cantidad_alumnos'] ?? 0) * 100;
            $score += (int)($grupo['cantidad_numeros'] ?? 0) * 1000;
            $score += (int)($destino['score'] ?? 0);

            $movimiento = [
                'score' => $score,
                'grupo_origen' => (int)$numeroGrupo,
                'pendiente_original' => $pendiente,
                'pendiente_en_grupo' => $pendienteEnGrupo,
                'expulsado_original' => $expulsado,
                'grupo_reemplazado' => $grupoReemplazado,
                'destino_expulsado' => $destino,
                'fecha_grupo' => $fechaGrupo,
                'id_turno_grupo' => $turnoGrupo,
            ];

            if ($mejor === null || (int)$movimiento['score'] > (int)$mejor['score']) {
                $mejor = $movimiento;
            }
        }
    }

    return $mejor;
}

function mesas_armado_docentes_reopt_buscar_destino_para_expulsado_de_reemplazo(
    array $expulsado,
    int $grupoOrigen,
    array $gruposConReemplazo,
    array $pendientes,
    int $numeroPendienteQueEntra,
    array $ocupacionConReemplazo,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    int $maxNumeros
): ?array {
    $mejor = null;

    foreach ($gruposConReemplazo as $numeroGrupoDestino => $grupoDestino) {
        if ((int)$numeroGrupoDestino === $grupoOrigen || !empty($grupoDestino['tiene_taller'])) {
            continue;
        }

        if ((int)($grupoDestino['cantidad_numeros'] ?? count($grupoDestino['numeros'] ?? [])) >= $maxNumeros) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_area_compatible($expulsado, $grupoDestino['id_area'] !== null ? (int)$grupoDestino['id_area'] : null)) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_compatible_con_numeros($expulsado, $grupoDestino['numeros'] ?? [])) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos(array_merge($grupoDestino['numeros'] ?? [], [$expulsado]))) {
            continue;
        }

        $fecha = (string)$grupoDestino['fecha_mesa'];
        $idTurno = (int)$grupoDestino['id_turno'];
        $expulsadoDestino = mesas_armado_docentes_reopt_marcar_slot_en_numero($expulsado, $fecha, $idTurno);
        $ocupacionDisponible = mesas_armado_docentes_reopt_ocupacion_sin_grupo($ocupacionConReemplazo, $grupoDestino);

        if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($expulsadoDestino, $fecha, $idTurno, $ocupacionDisponible, $disponibilidadDocentes)) {
            continue;
        }

        $score = 100000;
        foreach (($grupoDestino['numeros'] ?? []) as $actual) {
            if (mesas_armado_docentes_reopt_docente_compartido_permitido($expulsadoDestino, $actual)) {
                $score += 50000;
            } elseif (mesas_armado_docentes_reopt_misma_area($expulsadoDestino, $actual)) {
                $score += 1000;
            }
        }
        $score += max(0, $maxNumeros - (int)($grupoDestino['cantidad_numeros'] ?? 0)) * 100;

        $destino = [
            'tipo' => 'grupo_existente',
            'score' => $score,
            'numero_grupo_destino' => (int)$numeroGrupoDestino,
            'expulsado_destino' => $expulsadoDestino,
            'fecha_destino' => $fecha,
            'id_turno_destino' => $idTurno,
        ];

        if ($mejor === null || (int)$destino['score'] > (int)$mejor['score']) {
            $mejor = $destino;
        }
    }

    // Segunda opcion: formar un grupo nuevo con otro pendiente compatible.
    $slots = [];
    if (($expulsado['fecha_mesa'] ?? null) !== null && ($expulsado['id_turno'] ?? null) !== null) {
        $slots[] = [
            'fecha_mesa' => (string)$expulsado['fecha_mesa'],
            'fecha' => (string)$expulsado['fecha_mesa'],
            'id_turno' => (int)$expulsado['id_turno'],
        ];
    }
    foreach ($slotsDisponibles as $slot) {
        $slots[] = $slot;
    }
    $slots = mesas_armado_docentes_reopt_normalizar_slots($slots);

    foreach ($pendientes as $numeroMesaAcompaniante => $acompaniante) {
        if ((int)$numeroMesaAcompaniante === $numeroPendienteQueEntra || !mesas_armado_docentes_reopt_es_simple_flexible($acompaniante)) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_compatible_con_numeros($acompaniante, [$expulsado])) {
            continue;
        }

        if (mesas_armado_docentes_reopt_cantidad_docentes_distintos([$expulsado, $acompaniante]) < 2) {
            continue;
        }

        foreach ($slots as $slot) {
            $fecha = (string)($slot['fecha_mesa'] ?? $slot['fecha'] ?? '');
            $idTurno = (int)($slot['id_turno'] ?? 0);
            if ($fecha === '' || $idTurno <= 0) {
                continue;
            }

            $expulsadoDestino = mesas_armado_docentes_reopt_marcar_slot_en_numero($expulsado, $fecha, $idTurno);
            $acompanianteDestino = mesas_armado_docentes_reopt_marcar_slot_en_numero($acompaniante, $fecha, $idTurno);

            if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($expulsadoDestino, $fecha, $idTurno, $ocupacionConReemplazo, $disponibilidadDocentes)) {
                continue;
            }
            if (!mesas_armado_docentes_reopt_numero_disponible_en_slot($acompanianteDestino, $fecha, $idTurno, $ocupacionConReemplazo, $disponibilidadDocentes)) {
                continue;
            }

            $grupoNuevo = [$expulsadoDestino, $acompanianteDestino];
            if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($grupoNuevo)) {
                continue;
            }

            $score = 50000;
            if (mesas_armado_docentes_reopt_docente_compartido_permitido($expulsadoDestino, $acompanianteDestino)) {
                // No deberia pasar por el control de docentes distintos, pero dejamos score bajo.
                $score += 1;
            } else {
                $score += 1000;
            }

            $destino = [
                'tipo' => 'grupo_nuevo_con_pendiente',
                'score' => $score,
                'expulsado_destino' => $expulsadoDestino,
                'acompaniante_destino' => $acompanianteDestino,
                'fecha_destino' => $fecha,
                'id_turno_destino' => $idTurno,
            ];

            if ($mejor === null || (int)$destino['score'] > (int)$mejor['score']) {
                $mejor = $destino;
            }
        }
    }

    return $mejor;
}

function mesas_armado_docentes_reopt_aplicar_reemplazo_en_grupo_lleno(
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
    $grupoOrigen = (int)$movimiento['grupo_origen'];
    $pendienteOriginal = $movimiento['pendiente_original'];
    $pendienteEnGrupo = $movimiento['pendiente_en_grupo'];
    $expulsadoOriginal = $movimiento['expulsado_original'];
    $destino = $movimiento['destino_expulsado'];
    $fechaGrupo = (string)$movimiento['fecha_grupo'];
    $idTurnoGrupo = (int)$movimiento['id_turno_grupo'];

    $ordenExpulsado = 1;
    if (isset($grupos[$grupoOrigen])) {
        foreach (($grupos[$grupoOrigen]['numeros'] ?? []) as $idx => $numero) {
            if ((int)$numero['numero_mesa'] === (int)$expulsadoOriginal['numero_mesa']) {
                $ordenExpulsado = $idx + 1;
                break;
            }
        }
    }

    $stmtDelete = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ? AND numero_mesa = ?');
    $stmtDelete->execute([$grupoOrigen, (int)$expulsadoOriginal['numero_mesa']]);

    mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$pendienteEnGrupo['numero_mesa'], $fechaGrupo, $idTurnoGrupo);

    $insertGrupo->execute([
        $grupoOrigen,
        (int)$pendienteEnGrupo['numero_mesa'],
        $fechaGrupo,
        $idTurnoGrupo,
        $horasTurnos[$idTurnoGrupo] ?? null,
        $pendienteEnGrupo['id_area'] !== null ? (int)$pendienteEnGrupo['id_area'] : null,
        $ordenExpulsado,
        (string)$pendienteEnGrupo['tipo_mesa'],
        (int)$pendienteEnGrupo['prioridad'],
        (int)$pendienteEnGrupo['cantidad_alumnos'],
        $estado,
        'Reoptimizada profunda: reemplazo en grupo lleno para juntar mismo slot/disponibilidad docente sin quedar con un solo evaluador.',
    ]);

    mesas_armado_docentes_reopt_eliminar_pendientes($pdo, [(int)$pendienteEnGrupo['numero_mesa']]);
    unset($pendientes[(int)$pendienteEnGrupo['numero_mesa']]);

    $grupos[$grupoOrigen]['numeros'] = array_values($movimiento['grupo_reemplazado']);
    $grupos[$grupoOrigen]['cantidad_numeros'] = count($grupos[$grupoOrigen]['numeros']);
    $grupos[$grupoOrigen]['max_orden'] = count($grupos[$grupoOrigen]['numeros']);
    $grupos[$grupoOrigen]['prioridad_max'] = max(array_map(static fn (array $n): int => (int)$n['prioridad'], $grupos[$grupoOrigen]['numeros']));

    if (($destino['tipo'] ?? '') === 'grupo_existente') {
        $numeroGrupoDestino = (int)$destino['numero_grupo_destino'];
        $expulsadoDestino = $destino['expulsado_destino'];
        $fechaDestino = (string)$destino['fecha_destino'];
        $idTurnoDestino = (int)$destino['id_turno_destino'];

        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$expulsadoDestino['numero_mesa'], $fechaDestino, $idTurnoDestino);
        mesas_armado_docentes_reopt_insertar_numero_en_grupo_existente(
            $pdo,
            $insertGrupo,
            $grupos[$numeroGrupoDestino],
            $expulsadoDestino,
            $fechaDestino,
            $idTurnoDestino,
            $horasTurnos,
            $estado,
            $stats
        );
    } else {
        $expulsadoDestino = $destino['expulsado_destino'];
        $acompanianteDestino = $destino['acompaniante_destino'];
        $fechaDestino = (string)$destino['fecha_destino'];
        $idTurnoDestino = (int)$destino['id_turno_destino'];
        $proximoGrupo = mesas_armado_docentes_grupos_proximo_numero($pdo);

        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$expulsadoDestino['numero_mesa'], $fechaDestino, $idTurnoDestino);
        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$acompanianteDestino['numero_mesa'], $fechaDestino, $idTurnoDestino);

        mesas_armado_docentes_grupos_insertar_grupo_simple(
            $insertGrupo,
            $proximoGrupo,
            [$expulsadoDestino, $acompanianteDestino],
            $estado,
            'Reoptimizada profunda: grupo creado con mesa expulsada de un grupo lleno.',
            $horasTurnos
        );

        mesas_armado_docentes_reopt_eliminar_pendientes($pdo, [(int)$acompanianteDestino['numero_mesa']]);
        unset($pendientes[(int)$acompanianteDestino['numero_mesa']]);

        $grupos[$proximoGrupo] = [
            'numero_grupo' => $proximoGrupo,
            'fecha_mesa' => $fechaDestino,
            'id_turno' => $idTurnoDestino,
            'id_area' => $expulsadoDestino['id_area'] !== null ? (int)$expulsadoDestino['id_area'] : null,
            'cantidad_numeros' => 2,
            'max_orden' => 2,
            'prioridad_max' => max((int)$expulsadoDestino['prioridad'], (int)$acompanianteDestino['prioridad']),
            'tiene_taller' => false,
            'numeros' => [$expulsadoDestino, $acompanianteDestino],
        ];

        $stats['total_grupos_nuevos_simples']++;
        $stats['total_numeros_reoptimizados'] += 2;
    }

    $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_desde_grupos($grupos);

    $stats['total_reemplazos_en_grupo_lleno']++;
    $stats['total_donantes_reubicados_por_reemplazo']++;
    $stats['total_numeros_reoptimizados']++;
    $stats['reemplazos_en_grupo_lleno'][] = [
        'grupo_origen' => $grupoOrigen,
        'numero_mesa_entrante' => (int)$pendienteEnGrupo['numero_mesa'],
        'numero_mesa_expulsada_reubicada' => (int)$expulsadoOriginal['numero_mesa'],
        'destino_expulsada' => $destino['tipo'] ?? null,
        'fecha_grupo' => $fechaGrupo,
        'id_turno_grupo' => $idTurnoGrupo,
        'detalle' => 'La mesa no agrupada entro a un grupo lleno donde es compatible por disponibilidad; se reubico otra mesa simple para mantener minimo 2 docentes distintos.',
    ];

    if (mesas_armado_docentes_reopt_es_simple_flexible($pendienteOriginal)) {
        $stats['numeros_movidos_de_fecha_turno'][] = [
            'numero_mesa' => (int)$pendienteEnGrupo['numero_mesa'],
            'fecha_anterior' => $pendienteOriginal['fecha_mesa'] ?? null,
            'id_turno_anterior' => $pendienteOriginal['id_turno'] ?? null,
            'fecha_nueva' => $fechaGrupo,
            'id_turno_nuevo' => $idTurnoGrupo,
            'motivo' => 'reemplazo_en_grupo_lleno_mismo_slot_disponibilidad_docente',
        ];
    }
}

function mesas_armado_docentes_reopt_blindar_sql_grupos_con_un_solo_docente(PDO $pdo, array $horasTurnos, array &$stats): void
{
    $numerosIndex = mesas_armado_docentes_reopt_indexar_numeros(mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo));

    $stmt = $pdo->query("\n        SELECT\n            mg.numero_grupo,\n            COUNT(DISTINCT mg.numero_mesa) AS cantidad_numeros,\n            SUM(CASE WHEN mg.tipo_mesa = 'taller' OR mg.prioridad = 1 THEN 1 ELSE 0 END) AS cantidad_talleres,\n            COUNT(DISTINCT CASE WHEN me.id_docente IS NOT NULL AND me.id_docente > 0 THEN me.id_docente END) AS docentes_distintos,\n            GROUP_CONCAT(DISTINCT mg.numero_mesa ORDER BY mg.orden ASC SEPARATOR ',') AS numeros_csv\n        FROM mesas_grupos mg\n        LEFT JOIN mesas me\n            ON me.numero_mesa = mg.numero_mesa\n           AND me.estado IN ('borrador', 'armada', 'observada')\n        GROUP BY mg.numero_grupo\n        HAVING cantidad_talleres = 0\n           AND cantidad_numeros >= 2\n           AND docentes_distintos < 2\n        ORDER BY mg.numero_grupo ASC\n    ");

    $invalidos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($invalidos) === 0) {
        return;
    }

    $insertNoAgrupada = $pdo->prepare("\n        INSERT INTO mesas_no_agrupadas (\n            numero_mesa,\n            fecha_mesa,\n            id_turno,\n            hora,\n            id_area,\n            tipo_mesa,\n            prioridad,\n            cantidad_alumnos,\n            motivo,\n            estado\n        ) VALUES (\n            ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente'\n        )\n    ");
    $deleteGrupo = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ?');

    foreach ($invalidos as $grupo) {
        $numeroGrupo = (int)$grupo['numero_grupo'];
        $numerosMesa = array_map('intval', mesas_armado_docentes_grupos_csv_a_array((string)($grupo['numeros_csv'] ?? '')));

        $deleteGrupo->execute([$numeroGrupo]);

        foreach ($numerosMesa as $numeroMesa) {
            if (!isset($numerosIndex[$numeroMesa])) {
                continue;
            }

            mesas_armado_docentes_reopt_eliminar_pendientes($pdo, [$numeroMesa]);
            mesas_armado_docentes_grupos_insertar_no_agrupada(
                $insertNoAgrupada,
                $numerosIndex[$numeroMesa],
                'grupo_simple_invalido_sql_un_solo_docente_distinto_minimo_2_docentes_requeridos',
                $horasTurnos
            );
        }

        $stats['total_grupos_sql_invalidos_por_un_solo_docente_blindados'] = (int)($stats['total_grupos_sql_invalidos_por_un_solo_docente_blindados'] ?? 0) + 1;
        $stats['grupos_sql_invalidos_por_un_solo_docente_blindados'][] = [
            'numero_grupo' => $numeroGrupo,
            'numeros_mesa' => $numerosMesa,
            'docentes_distintos_sql' => (int)($grupo['docentes_distintos'] ?? 0),
            'motivo' => 'Blindaje SQL final: se elimino un grupo simple con un unico docente/persona distinta.',
        ];
    }
}

function mesas_armado_docentes_reopt_blindar_grupos_con_un_solo_docente(
    PDO $pdo,
    array &$grupos,
    array &$pendientes,
    array $horasTurnos,
    array &$stats
): void {
    $insertNoAgrupada = $pdo->prepare("\n        INSERT INTO mesas_no_agrupadas (\n            numero_mesa,\n            fecha_mesa,\n            id_turno,\n            hora,\n            id_area,\n            tipo_mesa,\n            prioridad,\n            cantidad_alumnos,\n            motivo,\n            estado\n        ) VALUES (\n            ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente'\n        )\n    ");

    foreach ($grupos as $numeroGrupo => $grupo) {
        if (!empty($grupo['tiene_taller'])) {
            continue;
        }

        $numerosGrupo = array_values($grupo['numeros'] ?? []);
        if (mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($numerosGrupo)) {
            continue;
        }

        $stmtDelete = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ?');
        $stmtDelete->execute([(int)$numeroGrupo]);

        foreach ($numerosGrupo as $numero) {
            mesas_armado_docentes_reopt_eliminar_pendientes($pdo, [(int)$numero['numero_mesa']]);
            mesas_armado_docentes_grupos_insertar_no_agrupada(
                $insertNoAgrupada,
                $numero,
                'grupo_simple_invalido_un_solo_docente_distinto_minimo_2_docentes_requeridos',
                $horasTurnos
            );
            $pendientes[(int)$numero['numero_mesa']] = $numero;
        }

        $stats['total_grupos_invalidos_por_un_solo_docente_blindados']++;
        $stats['grupos_invalidos_por_un_solo_docente_blindados'][] = [
            'numero_grupo' => (int)$numeroGrupo,
            'numeros_mesa' => array_map(static fn (array $n): int => (int)$n['numero_mesa'], $numerosGrupo),
            'docentes_distintos' => mesas_armado_docentes_reopt_cantidad_docentes_distintos($numerosGrupo),
            'motivo' => 'Mesa simple con un solo docente/persona distinta. Se envio a no agrupadas para evitar mesa con un unico evaluador.',
        ];

        unset($grupos[$numeroGrupo]);
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

    if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos([$pendienteDestino, $donanteDestino])) {
        return;
    }

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

/*
 * Blindaje operativo final de choques.
 * Reglas:
 * - Un docente nunca puede quedar en dos grupos distintos el mismo dia/turno.
 *   Si comparte docente + area + slot, primero se intenta unir en el mismo grupo.
 *   Si el grupo no entra por maximo de numeros, se mueve una salida completa a otro slot.
 * - Un alumno nunca puede quedar en dos salidas distintas el mismo dia/turno, incluyendo no agrupadas.
 * - Las reubicaciones respetan disponibilidad docente y correlatividades anterior/posterior.
 */
function mesas_armado_docentes_reopt_blindar_choques_docente_alumno_salida(
    PDO $pdo,
    array $horasTurnos,
    array $disponibilidadDocentes,
    int $minNumeros,
    int $maxNumeros,
    array $slotsDisponibles,
    array &$stats
): void {
    if (!isset($stats['blindaje_choques_docente_alumno']) || !is_array($stats['blindaje_choques_docente_alumno'])) {
        $stats['blindaje_choques_docente_alumno'] = [];
    }

    $stats['blindaje_choques_docente_alumno'] = array_merge([
        'ejecutado' => true,
        'grupos_unidos_por_mismo_docente_slot' => 0,
        'grupos_movidos_por_choque_docente_slot' => 0,
        'no_agrupadas_movidas_por_choque' => 0,
        'iteraciones_consolidacion' => 0,
        'detalles' => [],
    ], $stats['blindaje_choques_docente_alumno']);

    $iteraciones = 0;
    while ($iteraciones < 80) {
        $numerosIndex = mesas_armado_docentes_reopt_indexar_numeros(mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo));
        $grupos = mesas_armado_docentes_reopt_obtener_grupos_actuales($pdo, $numerosIndex);

        if (!mesas_armado_docentes_reopt_consolidar_un_choque_docente_en_grupos(
            $pdo,
            $grupos,
            $horasTurnos,
            $disponibilidadDocentes,
            $slotsDisponibles,
            $maxNumeros,
            $stats
        )) {
            break;
        }

        $iteraciones++;
    }

    $stats['blindaje_choques_docente_alumno']['iteraciones_consolidacion'] += $iteraciones;

    $numerosIndex = mesas_armado_docentes_reopt_indexar_numeros(mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo));
    $grupos = mesas_armado_docentes_reopt_obtener_grupos_actuales($pdo, $numerosIndex);
    mesas_armado_docentes_reopt_reubicar_no_agrupadas_con_choque(
        $pdo,
        $numerosIndex,
        $grupos,
        $horasTurnos,
        $disponibilidadDocentes,
        $slotsDisponibles,
        $stats
    );
}

function mesas_armado_docentes_reopt_consolidar_un_choque_docente_en_grupos(
    PDO $pdo,
    array &$grupos,
    array $horasTurnos,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    int $maxNumeros,
    array &$stats
): bool {
    $porDocenteSlot = [];

    foreach ($grupos as $numeroGrupo => $grupo) {
        $fecha = (string)($grupo['fecha_mesa'] ?? '');
        $idTurno = (int)($grupo['id_turno'] ?? 0);
        if ($fecha === '' || $idTurno <= 0 || !empty($grupo['tiene_taller'])) {
            continue;
        }

        foreach (($grupo['numeros'] ?? []) as $numero) {
            foreach (($numero['docentes'] ?? []) as $idDocente) {
                $idDocente = (int)$idDocente;
                if ($idDocente <= 0) {
                    continue;
                }
                $key = $idDocente . '|' . $fecha . '|' . $idTurno;
                $porDocenteSlot[$key][(int)$numeroGrupo] = true;
            }
        }
    }

    foreach ($porDocenteSlot as $key => $gruposMapa) {
        $idsGrupos = array_values(array_map('intval', array_keys($gruposMapa)));
        if (count($idsGrupos) <= 1) {
            continue;
        }

        sort($idsGrupos);

        for ($i = 0; $i < count($idsGrupos); $i++) {
            for ($j = $i + 1; $j < count($idsGrupos); $j++) {
                if (mesas_armado_docentes_reopt_intentar_unir_grupos_mismo_docente_slot(
                    $pdo,
                    $grupos,
                    $idsGrupos[$i],
                    $idsGrupos[$j],
                    $horasTurnos,
                    $maxNumeros,
                    $stats
                )) {
                    return true;
                }
            }
        }

        // Si no se pudo unir por maximo de numeros o compatibilidad, se mueve una salida completa.
        for ($i = 1; $i < count($idsGrupos); $i++) {
            $gid = $idsGrupos[$i];
            if (isset($grupos[$gid]) && mesas_armado_docentes_reopt_intentar_mover_grupo_a_otro_slot(
                $pdo,
                $grupos,
                $gid,
                $horasTurnos,
                $disponibilidadDocentes,
                $slotsDisponibles,
                $stats
            )) {
                return true;
            }
        }

        // Último blindaje: si no se pudo unir ni mover, NO se deja el docente
        // duplicado en dos grupos del mismo slot. Se saca una salida de grupos
        // y pasa a no agrupadas para que luego se reubique a otro slot posible.
        for ($i = 1; $i < count($idsGrupos); $i++) {
            $gid = $idsGrupos[$i];
            if (isset($grupos[$gid]) && mesas_armado_docentes_reopt_enviar_grupo_a_no_agrupadas_por_choque_docente(
                $pdo,
                $grupos,
                $gid,
                $horasTurnos,
                $stats
            )) {
                return true;
            }
        }
    }

    return false;
}

function mesas_armado_docentes_reopt_intentar_unir_grupos_mismo_docente_slot(
    PDO $pdo,
    array &$grupos,
    int $grupoA,
    int $grupoB,
    array $horasTurnos,
    int $maxNumeros,
    array &$stats
): bool {
    if (!isset($grupos[$grupoA], $grupos[$grupoB])) {
        return false;
    }

    $a = $grupos[$grupoA];
    $b = $grupos[$grupoB];

    if (!empty($a['tiene_taller']) || !empty($b['tiene_taller'])) {
        return false;
    }

    if ((string)$a['fecha_mesa'] !== (string)$b['fecha_mesa'] || (int)$a['id_turno'] !== (int)$b['id_turno']) {
        return false;
    }

    $numerosUnidos = array_values(array_merge($a['numeros'] ?? [], $b['numeros'] ?? []));

    /*
     * Regla operativa dura:
     * si un mismo docente queda en la misma fecha y turno, NO puede aparecer
     * en dos grupos distintos. En ese caso el docente debe quedar en una sola
     * salida física. Por eso este blindaje permite unir esos grupos aunque:
     * - la suma supere el máximo ideal de 4 números;
     * - el área SQL no coincida exactamente.
     *
     * Lo único que no se permite al unir es generar choque real de alumnos
     * dentro de la misma salida, dejar un grupo simple con un solo docente
     * distinto o mezclar talleres.
     */
    if (!mesas_armado_docentes_reopt_numeros_forman_grupo_valido_mismo_docente_slot($numerosUnidos)) {
        return false;
    }

    $fecha = (string)$a['fecha_mesa'];
    $idTurno = (int)$a['id_turno'];
    $hora = $horasTurnos[$idTurno] ?? null;
    $idArea = $a['id_area'] !== null ? (int)$a['id_area'] : null;
    $orden = 1;

    $stmtUpdate = $pdo->prepare('
        UPDATE mesas_grupos
        SET numero_grupo = ?,
            fecha_mesa = ?,
            id_turno = ?,
            hora = ?,
            id_area = ?,
            orden = ?,
            observacion = NULL
        WHERE numero_grupo = ?
          AND numero_mesa = ?
    ');

    foreach ($numerosUnidos as $numero) {
        $grupoOrigen = in_array((int)$numero['numero_mesa'], array_map(static fn (array $n): int => (int)$n['numero_mesa'], $a['numeros'] ?? []), true)
            ? $grupoA
            : $grupoB;
        $stmtUpdate->execute([$grupoA, $fecha, $idTurno, $hora, $idArea, $orden, $grupoOrigen, (int)$numero['numero_mesa']]);
        $orden++;
    }

    $grupos[$grupoA]['numeros'] = $numerosUnidos;
    $grupos[$grupoA]['cantidad_numeros'] = count($numerosUnidos);
    $grupos[$grupoA]['max_orden'] = count($numerosUnidos);
    unset($grupos[$grupoB]);

    $stats['blindaje_choques_docente_alumno']['grupos_unidos_por_mismo_docente_slot']++;
    $stats['blindaje_choques_docente_alumno']['detalles'][] = [
        'tipo' => 'grupos_unidos_mismo_docente_slot',
        'grupo_destino' => $grupoA,
        'grupo_absorbido' => $grupoB,
        'fecha_mesa' => $fecha,
        'id_turno' => $idTurno,
        'numeros_mesa' => array_map(static fn (array $n): int => (int)$n['numero_mesa'], $numerosUnidos),
    ];

    return true;
}

function mesas_armado_docentes_reopt_numeros_forman_grupo_valido_mismo_docente_slot(array $numeros): bool
{
    if (count($numeros) < 2) {
        return false;
    }

    if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($numeros)) {
        return false;
    }

    $alumnos = [];
    $docentesPorNumero = [];
    foreach ($numeros as $numero) {
        if (!empty($numero['es_taller'])) {
            return false;
        }

        foreach (($numero['alumnos'] ?? []) as $dni) {
            $dni = trim((string)$dni);
            if ($dni === '') {
                continue;
            }

            if (isset($alumnos[$dni])) {
                return false;
            }
            $alumnos[$dni] = true;
        }

        foreach (($numero['docentes'] ?? []) as $idDocente) {
            $idDocente = (int)$idDocente;
            if ($idDocente > 0) {
                $docentesPorNumero[] = $idDocente;
            }
        }
    }

    return count(array_unique($docentesPorNumero)) >= 2;
}

function mesas_armado_docentes_reopt_numeros_forman_grupo_valido(array $numeros): bool
{
    if (count($numeros) < 2) {
        return false;
    }

    if (!mesas_armado_docentes_reopt_cumple_minimo_docentes_distintos($numeros)) {
        return false;
    }

    for ($i = 0; $i < count($numeros); $i++) {
        $resto = $numeros;
        $numero = $resto[$i];
        array_splice($resto, $i, 1);
        if (!mesas_armado_docentes_reopt_compatible_con_numeros($numero, $resto)) {
            return false;
        }
    }

    return true;
}

function mesas_armado_docentes_reopt_intentar_mover_grupo_a_otro_slot(
    PDO $pdo,
    array &$grupos,
    int $numeroGrupo,
    array $horasTurnos,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    array &$stats
): bool {
    if (!isset($grupos[$numeroGrupo]) || !empty($grupos[$numeroGrupo]['tiene_taller'])) {
        return false;
    }

    $grupo = $grupos[$numeroGrupo];
    foreach ($slotsDisponibles as $slot) {
        $fecha = (string)($slot['fecha_mesa'] ?? $slot['fecha'] ?? '');
        $idTurno = (int)($slot['id_turno'] ?? 0);

        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }

        if ($fecha === (string)$grupo['fecha_mesa'] && $idTurno === (int)$grupo['id_turno']) {
            continue;
        }

        if (!mesas_armado_docentes_reopt_grupo_disponible_en_slot($pdo, $grupo, $fecha, $idTurno, $grupos, $numeroGrupo, $disponibilidadDocentes)) {
            continue;
        }

        mesas_armado_docentes_reopt_actualizar_slot_grupo_completo($pdo, $numeroGrupo, $grupo, $fecha, $idTurno, $horasTurnos);

        $grupos[$numeroGrupo]['fecha_mesa'] = $fecha;
        $grupos[$numeroGrupo]['id_turno'] = $idTurno;
        foreach ($grupos[$numeroGrupo]['numeros'] as &$numero) {
            $numero = mesas_armado_docentes_reopt_marcar_slot_en_numero($numero, $fecha, $idTurno);
        }
        unset($numero);

        $stats['blindaje_choques_docente_alumno']['grupos_movidos_por_choque_docente_slot']++;
        $stats['blindaje_choques_docente_alumno']['detalles'][] = [
            'tipo' => 'grupo_movido_por_choque_docente_slot',
            'numero_grupo' => $numeroGrupo,
            'fecha_anterior' => $grupo['fecha_mesa'] ?? null,
            'id_turno_anterior' => $grupo['id_turno'] ?? null,
            'fecha_nueva' => $fecha,
            'id_turno_nuevo' => $idTurno,
            'numeros_mesa' => array_map(static fn (array $n): int => (int)$n['numero_mesa'], $grupo['numeros'] ?? []),
        ];

        return true;
    }

    return false;
}

function mesas_armado_docentes_reopt_grupo_disponible_en_slot(
    PDO $pdo,
    array $grupo,
    string $fecha,
    int $idTurno,
    array $grupos,
    int $grupoExcluido,
    array $disponibilidadDocentes
): bool {
    $noAgrupadas = mesas_armado_docentes_reopt_obtener_no_agrupadas_actuales($pdo, mesas_armado_docentes_reopt_indexar_numeros(mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo)));
    $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_salidas($grupos, $noAgrupadas, 'g_' . $grupoExcluido);

    foreach (($grupo['numeros'] ?? []) as $numero) {
        if (!mesas_armado_docentes_reopt_numero_disponible_en_salida($pdo, $numero, $fecha, $idTurno, $ocupacion, $disponibilidadDocentes, 'g_' . $grupoExcluido)) {
            return false;
        }
    }

    return true;
}


function mesas_armado_docentes_reopt_enviar_grupo_a_no_agrupadas_por_choque_docente(
    PDO $pdo,
    array &$grupos,
    int $numeroGrupo,
    array $horasTurnos,
    array &$stats
): bool {
    if (!isset($grupos[$numeroGrupo]) || !empty($grupos[$numeroGrupo]['tiene_taller'])) {
        return false;
    }

    $grupo = $grupos[$numeroGrupo];
    $numeros = array_values($grupo['numeros'] ?? []);
    if (count($numeros) === 0) {
        return false;
    }

    $stmtDeleteNo = $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = ?');
    $stmtInsertNo = $pdo->prepare("
        INSERT INTO mesas_no_agrupadas (
            numero_mesa,
            fecha_mesa,
            id_turno,
            hora,
            id_area,
            tipo_mesa,
            prioridad,
            cantidad_alumnos,
            motivo,
            estado
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente'
        )
    ");
    $stmtDeleteGrupo = $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_grupo = ? AND numero_mesa = ?');

    $fecha = (string)($grupo['fecha_mesa'] ?? '');
    $idTurno = (int)($grupo['id_turno'] ?? 0);
    $idArea = $grupo['id_area'] !== null ? (int)$grupo['id_area'] : null;
    $hora = $idTurno > 0 ? ($horasTurnos[$idTurno] ?? null) : null;
    $motivo = 'reubicacion_forzada_por_docente_en_dos_grupos_mismo_dia_turno';
    $numerosMesa = [];

    foreach ($numeros as $numero) {
        $numeroMesa = (int)($numero['numero_mesa'] ?? 0);
        if ($numeroMesa <= 0) {
            continue;
        }

        $stmtDeleteNo->execute([$numeroMesa]);
        $stmtInsertNo->execute([
            $numeroMesa,
            $fecha !== '' ? $fecha : null,
            $idTurno > 0 ? $idTurno : null,
            $hora,
            $idArea,
            (string)($numero['tipo_mesa'] ?? 'simple'),
            (int)($numero['prioridad'] ?? 0),
            (int)($numero['cantidad_alumnos'] ?? 0),
            $motivo,
        ]);
        $stmtDeleteGrupo->execute([$numeroGrupo, $numeroMesa]);
        $numerosMesa[] = $numeroMesa;
    }

    unset($grupos[$numeroGrupo]);

    $stats['blindaje_choques_docente_alumno']['grupos_movidos_por_choque_docente_slot']++;
    $stats['blindaje_choques_docente_alumno']['detalles'][] = [
        'tipo' => 'grupo_enviado_a_no_agrupadas_por_docente_duplicado_irresoluble',
        'numero_grupo' => $numeroGrupo,
        'fecha_mesa' => $fecha,
        'id_turno' => $idTurno,
        'numeros_mesa' => $numerosMesa,
        'motivo' => $motivo,
    ];

    return count($numerosMesa) > 0;
}

function mesas_armado_docentes_reopt_actualizar_slot_grupo_completo(PDO $pdo, int $numeroGrupo, array $grupo, string $fecha, int $idTurno, array $horasTurnos): void
{
    $hora = $horasTurnos[$idTurno] ?? null;
    $stmtGrupo = $pdo->prepare('UPDATE mesas_grupos SET fecha_mesa = ?, id_turno = ?, hora = ? WHERE numero_grupo = ?');
    $stmtGrupo->execute([$fecha, $idTurno, $hora, $numeroGrupo]);

    foreach (($grupo['numeros'] ?? []) as $numero) {
        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$numero['numero_mesa'], $fecha, $idTurno);
    }
}

function mesas_armado_docentes_reopt_obtener_no_agrupadas_actuales(PDO $pdo, array $numerosIndex): array
{
    $stmt = $pdo->query('
        SELECT id, numero_mesa, fecha_mesa, id_turno, motivo
        FROM mesas_no_agrupadas
        ORDER BY id ASC
    ');

    $items = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $numeroMesa = (int)$row['numero_mesa'];
        if (!isset($numerosIndex[$numeroMesa])) {
            continue;
        }
        $numero = $numerosIndex[$numeroMesa];
        $numero['id_no_agrupada'] = (int)$row['id'];
        $numero['fecha_mesa'] = $row['fecha_mesa'] !== null ? (string)$row['fecha_mesa'] : ($numero['fecha_mesa'] ?? null);
        $numero['id_turno'] = $row['id_turno'] !== null ? (int)$row['id_turno'] : ($numero['id_turno'] ?? null);
        $numero['motivo_no_agrupada'] = (string)($row['motivo'] ?? '');
        $items[(int)$row['id']] = $numero;
    }

    return $items;
}

function mesas_armado_docentes_reopt_crear_ocupacion_salidas(array $grupos, array $noAgrupadas = [], ?string $salidaExcluida = null): array
{
    $ocupacion = ['docentes' => [], 'alumnos' => []];

    $agregarNumero = static function (array $numero, string $fecha, int $idTurno, string $salidaKey) use (&$ocupacion, $salidaExcluida): void {
        if ($salidaExcluida !== null && $salidaKey === $salidaExcluida) {
            return;
        }
        foreach (($numero['docentes'] ?? []) as $idDocente) {
            $idDocente = (int)$idDocente;
            if ($idDocente > 0) {
                $clave = mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno);
                $ocupacion['docentes'][$clave][$salidaKey] = true;
            }
        }
        foreach (($numero['alumnos'] ?? []) as $dni) {
            $dni = trim((string)$dni);
            if ($dni !== '') {
                $clave = mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno);
                $ocupacion['alumnos'][$clave][$salidaKey] = true;
            }
        }
    };

    foreach ($grupos as $numeroGrupo => $grupo) {
        $fecha = (string)($grupo['fecha_mesa'] ?? '');
        $idTurno = (int)($grupo['id_turno'] ?? 0);
        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }
        foreach (($grupo['numeros'] ?? []) as $numero) {
            $agregarNumero($numero, $fecha, $idTurno, 'g_' . (int)$numeroGrupo);
        }
    }

    foreach ($noAgrupadas as $id => $numero) {
        $fecha = (string)($numero['fecha_mesa'] ?? '');
        $idTurno = (int)($numero['id_turno'] ?? 0);
        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }
        $agregarNumero($numero, $fecha, $idTurno, 'n_' . (int)$id);
    }

    return $ocupacion;
}

function mesas_armado_docentes_reopt_ocupacion_libre_para_salida(array $ocupacion, string $tipo, string $clave, string $salidaKey): bool
{
    if (!isset($ocupacion[$tipo][$clave]) || !is_array($ocupacion[$tipo][$clave])) {
        return true;
    }

    $salidas = array_keys($ocupacion[$tipo][$clave]);
    foreach ($salidas as $salida) {
        if ((string)$salida !== $salidaKey) {
            return false;
        }
    }

    return true;
}

function mesas_armado_docentes_reopt_numero_disponible_en_salida(
    PDO $pdo,
    array $numero,
    string $fecha,
    int $idTurno,
    array $ocupacion,
    array $disponibilidadDocentes,
    string $salidaKey
): bool {
    if (!empty($numero['es_taller'])) {
        return false;
    }

    foreach (($numero['docentes'] ?? []) as $idDocente) {
        $idDocente = (int)$idDocente;
        if ($idDocente <= 0 || mesas_armado_docentes_docente_no_disponible($disponibilidadDocentes, $idDocente, $fecha, $idTurno)) {
            return false;
        }
        $clave = mesas_armado_docentes_clave_ocupacion_docente($idDocente, $fecha, $idTurno);
        if (!mesas_armado_docentes_reopt_ocupacion_libre_para_salida($ocupacion, 'docentes', $clave, $salidaKey)) {
            return false;
        }
    }

    foreach (($numero['alumnos'] ?? []) as $dni) {
        $dni = trim((string)$dni);
        if ($dni === '') {
            continue;
        }
        $clave = mesas_armado_docentes_clave_ocupacion_alumno($dni, $fecha, $idTurno);
        if (!mesas_armado_docentes_reopt_ocupacion_libre_para_salida($ocupacion, 'alumnos', $clave, $salidaKey)) {
            return false;
        }
    }

    return mesas_armado_docentes_reopt_slot_respeta_correlativas_numero($pdo, (int)$numero['numero_mesa'], $fecha, $idTurno);
}

function mesas_armado_docentes_reopt_reubicar_no_agrupadas_con_choque(
    PDO $pdo,
    array $numerosIndex,
    array $grupos,
    array $horasTurnos,
    array $disponibilidadDocentes,
    array $slotsDisponibles,
    array &$stats
): void {
    $noAgrupadas = mesas_armado_docentes_reopt_obtener_no_agrupadas_actuales($pdo, $numerosIndex);
    if (count($noAgrupadas) === 0) {
        return;
    }

    $stmtUpdate = $pdo->prepare('
        UPDATE mesas_no_agrupadas
        SET fecha_mesa = ?,
            id_turno = ?,
            hora = ?,
            motivo = ?
        WHERE id = ?
    ');

    foreach ($noAgrupadas as $idNoAgrupada => $numero) {
        $fechaActual = (string)($numero['fecha_mesa'] ?? '');
        $turnoActual = (int)($numero['id_turno'] ?? 0);
        if ($fechaActual === '' || $turnoActual <= 0) {
            continue;
        }

        $ocupacionActual = mesas_armado_docentes_reopt_crear_ocupacion_salidas($grupos, $noAgrupadas, 'n_' . (int)$idNoAgrupada);
        if (mesas_armado_docentes_reopt_numero_disponible_en_salida($pdo, $numero, $fechaActual, $turnoActual, $ocupacionActual, $disponibilidadDocentes, 'n_' . (int)$idNoAgrupada)) {
            continue;
        }

        $nuevoSlot = mesas_armado_docentes_reopt_buscar_slot_para_numero_sin_choque(
            $pdo,
            $numero,
            $slotsDisponibles,
            $grupos,
            $noAgrupadas,
            'n_' . (int)$idNoAgrupada,
            $disponibilidadDocentes
        );

        if ($nuevoSlot === null) {
            continue;
        }

        $fechaNueva = (string)$nuevoSlot['fecha_mesa'];
        $turnoNuevo = (int)$nuevoSlot['id_turno'];
        $motivoBase = trim((string)($numero['motivo_no_agrupada'] ?? 'sin_compatibles_para_formar_grupo_de_2_a_4_en_misma_fecha_turno_disponibilidad_docente'));
        $motivoNuevo = mb_substr('reubicada_por_choque_alumno_o_docente__' . $motivoBase, 0, 255, 'UTF-8');

        $stmtUpdate->execute([$fechaNueva, $turnoNuevo, $horasTurnos[$turnoNuevo] ?? null, $motivoNuevo, (int)$idNoAgrupada]);
        mesas_armado_docentes_reopt_actualizar_slot_numero($pdo, (int)$numero['numero_mesa'], $fechaNueva, $turnoNuevo);

        $noAgrupadas[$idNoAgrupada]['fecha_mesa'] = $fechaNueva;
        $noAgrupadas[$idNoAgrupada]['id_turno'] = $turnoNuevo;

        $stats['blindaje_choques_docente_alumno']['no_agrupadas_movidas_por_choque']++;
        $stats['blindaje_choques_docente_alumno']['detalles'][] = [
            'tipo' => 'no_agrupada_movida_por_choque_alumno_o_docente',
            'numero_mesa' => (int)$numero['numero_mesa'],
            'fecha_anterior' => $fechaActual,
            'id_turno_anterior' => $turnoActual,
            'fecha_nueva' => $fechaNueva,
            'id_turno_nuevo' => $turnoNuevo,
        ];
    }
}

function mesas_armado_docentes_reopt_buscar_slot_para_numero_sin_choque(
    PDO $pdo,
    array $numero,
    array $slotsDisponibles,
    array $grupos,
    array $noAgrupadas,
    string $salidaKey,
    array $disponibilidadDocentes
): ?array {
    foreach ($slotsDisponibles as $slot) {
        $fecha = (string)($slot['fecha_mesa'] ?? $slot['fecha'] ?? '');
        $idTurno = (int)($slot['id_turno'] ?? 0);
        if ($fecha === '' || $idTurno <= 0) {
            continue;
        }

        if ($fecha === (string)($numero['fecha_mesa'] ?? '') && $idTurno === (int)($numero['id_turno'] ?? 0)) {
            continue;
        }

        $ocupacion = mesas_armado_docentes_reopt_crear_ocupacion_salidas($grupos, $noAgrupadas, $salidaKey);
        $numeroDestino = mesas_armado_docentes_reopt_marcar_slot_en_numero($numero, $fecha, $idTurno);
        if (mesas_armado_docentes_reopt_numero_disponible_en_salida($pdo, $numeroDestino, $fecha, $idTurno, $ocupacion, $disponibilidadDocentes, $salidaKey)) {
            return [
                'fecha_mesa' => $fecha,
                'fecha' => $fecha,
                'id_turno' => $idTurno,
            ];
        }
    }

    return null;
}

function mesas_armado_docentes_reopt_slot_respeta_correlativas_numero(PDO $pdo, int $numeroMesa, string $fechaCandidata, int $turnoCandidato): bool
{
    $stmt = $pdo->prepare("
        SELECT
            me_actual.numero_mesa AS numero_actual,
            me_otro.numero_mesa AS numero_otro,
            me_otro.fecha_mesa AS fecha_otro,
            me_otro.id_turno AS turno_otro,
            CASE
                WHEN pa.id_materia = mc.id_materia
                 AND pa.materia_id_curso = mc.id_curso
                 AND mc.tipo = 'anterior' THEN 'actual_posterior'
                WHEN pa.id_materia = mc.id_materia_relacionada
                 AND pa.materia_id_curso = mc.id_curso_relacionada
                 AND mc.tipo = 'anterior' THEN 'actual_anterior'
                WHEN pa.id_materia = mc.id_materia
                 AND pa.materia_id_curso = mc.id_curso
                 AND mc.tipo = 'posterior' THEN 'actual_anterior'
                WHEN pa.id_materia = mc.id_materia_relacionada
                 AND pa.materia_id_curso = mc.id_curso_relacionada
                 AND mc.tipo = 'posterior' THEN 'actual_posterior'
                ELSE 'equivalente'
            END AS rol_actual
        FROM mesas me_actual
        INNER JOIN previas pa
            ON pa.id_previa = me_actual.id_previa
        INNER JOIN materias_correlativas mc
            ON mc.activo = 1
           AND mc.bloquea_armado = 1
           AND (
                (pa.id_materia = mc.id_materia AND pa.materia_id_curso = mc.id_curso)
                OR
                (pa.id_materia = mc.id_materia_relacionada AND pa.materia_id_curso = mc.id_curso_relacionada)
           )
        INNER JOIN previas po
            ON po.dni = pa.dni
           AND po.activo = 1
           AND po.inscripcion = 1
           AND po.id_condicion = 3
           AND (
                (pa.id_materia = mc.id_materia AND pa.materia_id_curso = mc.id_curso
                 AND po.id_materia = mc.id_materia_relacionada AND po.materia_id_curso = mc.id_curso_relacionada)
                OR
                (pa.id_materia = mc.id_materia_relacionada AND pa.materia_id_curso = mc.id_curso_relacionada
                 AND po.id_materia = mc.id_materia AND po.materia_id_curso = mc.id_curso)
           )
        INNER JOIN mesas me_otro
            ON me_otro.id_previa = po.id_previa
           AND me_otro.numero_mesa IS NOT NULL
           AND me_otro.numero_mesa <> me_actual.numero_mesa
           AND me_otro.estado IN ('borrador', 'armada', 'observada')
        WHERE me_actual.numero_mesa = ?
          AND me_actual.estado IN ('borrador', 'armada', 'observada')
    " );
    $stmt->execute([$numeroMesa]);

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $fechaOtra = $row['fecha_otro'] !== null ? (string)$row['fecha_otro'] : null;
        $turnoOtro = $row['turno_otro'] !== null ? (int)$row['turno_otro'] : null;
        if ($fechaOtra === null || $turnoOtro === null || $turnoOtro <= 0) {
            continue;
        }

        $comparacion = mesas_armado_docentes_reopt_comparar_slots($fechaCandidata, $turnoCandidato, $fechaOtra, $turnoOtro);
        $rolActual = (string)($row['rol_actual'] ?? 'equivalente');

        if ($rolActual === 'actual_posterior' && $comparacion <= 0) {
            return false;
        }

        if ($rolActual === 'actual_anterior' && $comparacion >= 0) {
            return false;
        }
    }

    return true;
}

function mesas_armado_docentes_reopt_comparar_slots(string $fechaA, int $turnoA, string $fechaB, int $turnoB): int
{
    return [$fechaA, $turnoA] <=> [$fechaB, $turnoB];
}

