<?php
// backend/modules/mesas/armado_mesas_docentes/fases/fase_6_agrupar_grupos_finales.php
declare(strict_types=1);

/**
 * Fase 6 - Mesas finales agrupadas con estructura simple.
 *
 * Tablas usadas:
 * - mesas_grupos: una fila por cada numero_mesa que integra un numero_grupo.
 * - mesas_no_agrupadas: numeros normales/correlativos que no pudieron formar grupo.
 *
 * Reglas duras:
 * - Taller SIEMPRE va a mesas_grupos, pero queda solo con un unico numero_mesa.
 * - Simple y correlativa pueden mezclarse.
 * - Mesas normales/correlativas se agrupan de 2 a 4 numeros.
 * - Se agrupa si o si por misma fecha y mismo turno/disponibilidad docente; el area es solo criterio secundario.
 * - No se agrupan numeros que compartan alumnos.
 * - Se valida que los docentes estén disponibles en el día/turno del slot.
 */
function mesas_armado_docentes_grupos_finales(): void
{
    try {
        $pdo = db();
        $body = request_body();

        $resultado = mesas_armado_docentes_grupos_finales_core($pdo, [
            'limpiar_grupos' => mesas_armado_docentes_grupos_bool($body['limpiar_grupos'] ?? ($_GET['limpiar_grupos'] ?? true)),
            'min_numeros' => isset($body['min_numeros']) ? (int)$body['min_numeros'] : (isset($_GET['min_numeros']) ? (int)$_GET['min_numeros'] : 2),
            'max_numeros' => isset($body['max_numeros']) ? (int)$body['max_numeros'] : (isset($_GET['max_numeros']) ? (int)$_GET['max_numeros'] : 4),
            'confirmar_grupos' => mesas_armado_docentes_grupos_bool($body['confirmar_grupos'] ?? ($_GET['confirmar_grupos'] ?? false)),
            'reoptimizar' => mesas_armado_docentes_grupos_bool($body['reoptimizar'] ?? ($_GET['reoptimizar'] ?? true)),
            'fecha_inicio' => $body['fecha_inicio'] ?? $body['fechaInicio'] ?? ($_GET['fecha_inicio'] ?? $_GET['fechaInicio'] ?? null),
            'fecha_fin' => $body['fecha_fin'] ?? $body['fechaFin'] ?? ($_GET['fecha_fin'] ?? $_GET['fechaFin'] ?? null),
            'modo_turnos' => $body['modo_turnos'] ?? $body['modoTurnos'] ?? $body['turno_modo'] ?? $body['turnoModo'] ?? ($_GET['modo_turnos'] ?? $_GET['modoTurnos'] ?? $_GET['turno_modo'] ?? $_GET['turnoModo'] ?? 'combinado'),
        ]);

        json_response([
            'exito' => true,
            'mensaje' => 'Mesas finales agrupadas correctamente.',
            'data' => $resultado,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_armado_docentes_grupos_finales');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al agrupar las mesas finales.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_armado_docentes_grupos_bool(mixed $valor): bool
{
    if (is_bool($valor)) {
        return $valor;
    }

    if (is_int($valor)) {
        return $valor === 1;
    }

    $texto = mb_strtolower(trim((string)$valor), 'UTF-8');

    if ($texto === '' || $texto === '1' || $texto === 'true' || $texto === 'si' || $texto === 'sí' || $texto === 'yes') {
        return true;
    }

    if ($texto === '0' || $texto === 'false' || $texto === 'no') {
        return false;
    }

    return (bool)$valor;
}

function mesas_armado_docentes_grupos_finales_core(PDO $pdo, array $opciones = []): array
{
    $limpiarGrupos = (bool)($opciones['limpiar_grupos'] ?? true);
    $minNumeros = max(2, (int)($opciones['min_numeros'] ?? 2));
    $maxNumeros = min(4, max($minNumeros, (int)($opciones['max_numeros'] ?? 4)));
    $confirmarGrupos = (bool)($opciones['confirmar_grupos'] ?? false);
    $reoptimizar = (bool)($opciones['reoptimizar'] ?? true);
    $fechaInicioRango = isset($opciones['fecha_inicio']) ? trim((string)$opciones['fecha_inicio']) : null;
    $fechaFinRango = isset($opciones['fecha_fin']) ? trim((string)$opciones['fecha_fin']) : null;
    $modoTurnos = mesas_armado_docentes_normalizar_modo_turnos($opciones['modo_turnos'] ?? $opciones['modoTurnos'] ?? 'combinado');

    mesas_armado_docentes_grupos_asegurar_tablas($pdo);

    $manejaTransaccion = !$pdo->inTransaction();

    if ($manejaTransaccion) {
        $pdo->beginTransaction();
    }

    try {
        if ($limpiarGrupos) {
            mesas_armado_docentes_grupos_limpiar($pdo);
        }

        $numeros = mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo);
        $disponibilidadDocentes = mesas_armado_docentes_obtener_disponibilidad_docentes($pdo);
        $horasTurnos = mesas_armado_docentes_grupos_obtener_horas_turnos($pdo);
        $proximoNumeroGrupo = mesas_armado_docentes_grupos_proximo_numero($pdo);

        $insertGrupo = $pdo->prepare("\n            INSERT INTO mesas_grupos (\n                numero_grupo,\n                numero_mesa,\n                fecha_mesa,\n                id_turno,\n                hora,\n                id_area,\n                orden,\n                tipo_mesa,\n                prioridad,\n                cantidad_alumnos,\n                estado,\n                observacion\n            ) VALUES (\n                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?\n            )\n        ");

        $insertNoAgrupada = $pdo->prepare("\n            INSERT INTO mesas_no_agrupadas (\n                numero_mesa,\n                fecha_mesa,\n                id_turno,\n                hora,\n                id_area,\n                tipo_mesa,\n                prioridad,\n                cantidad_alumnos,\n                motivo,\n                estado\n            ) VALUES (\n                ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente'\n            )\n        ");

        $buckets = [];
        $totalNumeros = 0;
        $totalTalleres = 0;
        $totalNormales = 0;
        $totalInvalidos = 0;
        $totalGrupos = 0;
        $totalFilasGrupo = 0;
        $totalNoAgrupadas = 0;
        $motivos = [];

        foreach ($numeros as $numero) {
            $totalNumeros++;
            $motivoInvalido = mesas_armado_docentes_grupos_motivo_invalido($numero, $disponibilidadDocentes, $fechaInicioRango, $fechaFinRango);

            if ($motivoInvalido !== null) {
                mesas_armado_docentes_grupos_insertar_no_agrupada($insertNoAgrupada, $numero, $motivoInvalido, $horasTurnos);
                $totalInvalidos++;
                $totalNoAgrupadas++;
                $motivos[$motivoInvalido] = ($motivos[$motivoInvalido] ?? 0) + 1;
                continue;
            }

            if ($numero['es_taller']) {
                mesas_armado_docentes_grupos_insertar_grupo_simple(
                    $insertGrupo,
                    $proximoNumeroGrupo,
                    [$numero],
                    $confirmarGrupos ? 'validado' : 'borrador',
                    'Mesa de taller: queda sola por regla académica.',
                    $horasTurnos
                );

                $proximoNumeroGrupo++;
                $totalTalleres++;
                $totalGrupos++;
                $totalFilasGrupo++;
                continue;
            }

            $key = $numero['fecha_mesa'] . '|' . $numero['id_turno'];
            $buckets[$key][] = $numero;
            $totalNormales++;
        }

        foreach ($buckets as $bucket) {
            usort($bucket, static function (array $a, array $b): int {
                return [
                    -(int)$a['prioridad'],
                    -(int)$a['cantidad_alumnos'],
                    -(int)$a['cantidad_docentes'],
                    (int)$a['numero_mesa'],
                ] <=> [
                    -(int)$b['prioridad'],
                    -(int)$b['cantidad_alumnos'],
                    -(int)$b['cantidad_docentes'],
                    (int)$b['numero_mesa'],
                ];
            });

            [$grupos, $sobrantes] = mesas_armado_docentes_grupos_formar_subgrupos($bucket, $minNumeros, $maxNumeros);

            foreach ($grupos as $grupo) {
                mesas_armado_docentes_grupos_insertar_grupo_simple(
                    $insertGrupo,
                    $proximoNumeroGrupo,
                    $grupo,
                    $confirmarGrupos ? 'validado' : 'borrador',
                    null,
                    $horasTurnos
                );

                $proximoNumeroGrupo++;
                $totalGrupos++;
                $totalFilasGrupo += count($grupo);
            }

            foreach ($sobrantes as $sobrante) {
                $motivo = 'sin_compatibles_para_formar_grupo_de_2_a_4_en_misma_fecha_turno_disponibilidad_docente';
                mesas_armado_docentes_grupos_insertar_no_agrupada($insertNoAgrupada, $sobrante, $motivo, $horasTurnos);
                $totalNoAgrupadas++;
                $motivos[$motivo] = ($motivos[$motivo] ?? 0) + 1;
            }
        }

        $resultadoReoptimizacion = null;

        if ($reoptimizar && function_exists('mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas_core')) {
            $resultadoReoptimizacion = mesas_armado_docentes_fase_7_reoptimizar_no_agrupadas_core(
                $pdo,
                [
                    'min_numeros' => $minNumeros,
                    'max_numeros' => $maxNumeros,
                    'confirmar_grupos' => $confirmarGrupos,
                    'horas_turnos' => $horasTurnos,
                    'fecha_inicio' => $fechaInicioRango,
                    'fecha_fin' => $fechaFinRango,
                    'modo_turnos' => $modoTurnos,
                ]
            );
        }

        $blindajeCobertura = mesas_armado_docentes_grupos_blindar_cobertura_salida($pdo, $horasTurnos, $disponibilidadDocentes, $fechaInicioRango, $fechaFinRango);

        if ($confirmarGrupos) {
            // Confirmar solo debe dejar como armadas las mesas que realmente quedaron agrupadas.
            // Tambien limpia observaciones viejas de numeros que fueron rescatados por reoptimizacion.
            $pdo->exec("
                UPDATE mesas me
                INNER JOIN mesas_grupos mg
                    ON mg.numero_mesa = me.numero_mesa
                SET me.estado = 'armada',
                    me.observacion = NULL
                WHERE me.numero_mesa IS NOT NULL
            ");
        }

        $totalesFinales = mesas_armado_docentes_grupos_totales_finales($pdo);

        if ($manejaTransaccion) {
            $pdo->commit();
        }

        return [
            'fase' => 6,
            'modo_turnos' => $modoTurnos,
            'fase_final_reoptimizacion' => $resultadoReoptimizacion,
            'agrupacion_final_generada' => true,
            'reoptimizacion_ejecutada' => is_array($resultadoReoptimizacion),
            'estructura' => 'simple_sin_detalle',
            'criterio' => 'mesas_grupos guarda una fila por numero_mesa usando numero_grupo repetido. Todo numero_mesa con prioridad 1/taller queda como grupo individual. Correlativas quedan como anclas de fecha/turno. Las simples funcionan como comodines y la fase 7 puede moverlas de fecha/turno para completar grupos compatibles de 2 a 4 por disponibilidad docente, sin choque de alumnos. El area solo suma score secundario para ordenar candidatos; no bloquea que se agrupen materias de areas distintas. Se permite compartir docente dentro de una misma salida no taller si el grupo final conserva al menos 2 docentes/personas distintas; talleres quedan como excepcion individual.',
            'min_numeros_por_grupo' => $minNumeros,
            'max_numeros_por_grupo' => $maxNumeros,
            'total_numeros_leidos' => $totalNumeros,
            'total_numeros_normales_o_correlativos' => $totalNormales,
            'total_talleres_grupo_individual' => $totalTalleres,
            'total_invalidos' => $totalInvalidos,
            'total_grupos_generados_inicialmente' => $totalGrupos,
            'total_filas_insertadas_inicialmente_en_mesas_grupos' => $totalFilasGrupo,
            'total_no_agrupadas_iniciales' => $totalNoAgrupadas,
            'blindaje_cobertura' => $blindajeCobertura,
            'total_orfanas_detectadas_por_blindaje' => $blindajeCobertura['total_orfanas_detectadas'] ?? 0,
            'total_grupos_generados' => $totalesFinales['total_grupos'],
            'total_filas_insertadas_en_mesas_grupos' => $totalesFinales['total_filas_grupo'],
            'total_no_agrupadas' => $totalesFinales['total_no_agrupadas'],
            'motivos_no_agrupadas' => mesas_armado_docentes_grupos_motivos_no_agrupadas_actuales($pdo),
            'motivos_no_agrupadas_iniciales' => $motivos,
        ];

    } catch (Throwable $e) {
        if ($manejaTransaccion && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }
}

function mesas_armado_docentes_grupos_asegurar_tablas(PDO $pdo): void
{
    /*
     * Este módulo usa la estructura simple:
     * - mesas_grupos: una fila por cada numero_mesa y numero_grupo repetido.
     * - mesas_no_agrupadas: números normales/correlativos que no lograron grupo.
     *
     * Si quedó una estructura vieja instalada (por ejemplo la que tenía
     * id_grupo/cantidad_numeros o mesas_grupos_detalle), se elimina para evitar
     * errores 500 por columnas inexistentes al listar o agrupar.
     */
    $pdo->exec('DROP TABLE IF EXISTS mesas_grupos_detalle');

    $columnasGrupos = mesas_armado_docentes_grupos_columnas_tabla($pdo, 'mesas_grupos');
    $columnasNoAgrupadas = mesas_armado_docentes_grupos_columnas_tabla($pdo, 'mesas_no_agrupadas');

    $requeridasGrupos = [
        'id_mesa_grupo',
        'numero_grupo',
        'numero_mesa',
        'fecha_mesa',
        'id_turno',
        'hora',
        'id_area',
        'orden',
        'tipo_mesa',
        'prioridad',
        'cantidad_alumnos',
        'estado',
        'observacion',
        'creado_en',
    ];

    $requeridasNoAgrupadas = [
        'id',
        'numero_mesa',
        'fecha_mesa',
        'id_turno',
        'hora',
        'id_area',
        'tipo_mesa',
        'prioridad',
        'cantidad_alumnos',
        'motivo',
        'estado',
        'fecha_registro',
    ];

    if ($columnasGrupos !== null && count(array_diff($requeridasGrupos, $columnasGrupos)) > 0) {
        $pdo->exec('DROP TABLE IF EXISTS mesas_grupos');
    }

    if ($columnasNoAgrupadas !== null && count(array_diff($requeridasNoAgrupadas, $columnasNoAgrupadas)) > 0) {
        $pdo->exec('DROP TABLE IF EXISTS mesas_no_agrupadas');
    }

    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS mesas_grupos (\n            id_mesa_grupo INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            numero_grupo INT UNSIGNED NOT NULL,\n            numero_mesa INT NOT NULL,\n            fecha_mesa DATE NOT NULL,\n            id_turno INT NOT NULL,\n            hora TIME DEFAULT NULL,\n            id_area TINYINT DEFAULT NULL,\n            orden TINYINT NOT NULL DEFAULT 1,\n            tipo_mesa ENUM('simple','correlativa','taller') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'simple',\n            prioridad TINYINT NOT NULL DEFAULT 0,\n            cantidad_alumnos INT NOT NULL DEFAULT 0,\n            estado ENUM('borrador','validado','armada','observado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'borrador',\n            observacion VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n            creado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,\n            PRIMARY KEY (id_mesa_grupo),\n            UNIQUE KEY uq_grupo_numero_mesa (numero_grupo, numero_mesa),\n            KEY idx_numero_grupo (numero_grupo),\n            KEY idx_numero_mesa (numero_mesa),\n            KEY idx_fecha_turno (fecha_mesa, id_turno),\n            KEY idx_area (id_area),\n            KEY idx_estado (estado),\n            CONSTRAINT fk_mesas_grupos_turno\n                FOREIGN KEY (id_turno) REFERENCES turnos(id_turno)\n                ON DELETE RESTRICT ON UPDATE CASCADE,\n            CONSTRAINT fk_mesas_grupos_area\n                FOREIGN KEY (id_area) REFERENCES areas(id_area)\n                ON DELETE SET NULL ON UPDATE CASCADE\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    $pdo->exec("\n        CREATE TABLE IF NOT EXISTS mesas_no_agrupadas (\n            id INT UNSIGNED NOT NULL AUTO_INCREMENT,\n            numero_mesa INT NOT NULL,\n            fecha_mesa DATE NULL,\n            id_turno INT NULL,\n            hora TIME DEFAULT NULL,\n            id_area TINYINT DEFAULT NULL,\n            tipo_mesa ENUM('simple','correlativa','taller') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'simple',\n            prioridad TINYINT NOT NULL DEFAULT 0,\n            cantidad_alumnos INT NOT NULL DEFAULT 0,\n            motivo VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n            estado ENUM('pendiente','reoptimizada','confirmada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',\n            fecha_registro TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,\n            PRIMARY KEY (id),\n            KEY idx_numero_mesa (numero_mesa),\n            KEY idx_fecha_turno (fecha_mesa, id_turno),\n            KEY idx_area (id_area),\n            KEY idx_estado (estado),\n            CONSTRAINT fk_no_agrupadas_turno\n                FOREIGN KEY (id_turno) REFERENCES turnos(id_turno)\n                ON DELETE RESTRICT ON UPDATE CASCADE,\n            CONSTRAINT fk_no_agrupadas_area\n                FOREIGN KEY (id_area) REFERENCES areas(id_area)\n                ON DELETE SET NULL ON UPDATE CASCADE\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    // Blindaje estructural: si la tabla ya existía con fecha/turno obligatorios,
    // se flexibiliza para poder mostrar también mesas numeradas incompletas.
    try {
        $pdo->exec('ALTER TABLE mesas_no_agrupadas MODIFY fecha_mesa DATE NULL');
    } catch (Throwable $e) {
        // No interrumpir el armado por una migración ya aplicada o no permitida.
    }

    try {
        $pdo->exec('ALTER TABLE mesas_no_agrupadas MODIFY id_turno INT NULL');
    } catch (Throwable $e) {
        // No interrumpir el armado por una migración ya aplicada o no permitida.
    }
}

function mesas_armado_docentes_grupos_columnas_tabla(PDO $pdo, string $tabla): ?array
{
    $stmt = $pdo->prepare("\n        SELECT COLUMN_NAME\n        FROM INFORMATION_SCHEMA.COLUMNS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n    ");
    $stmt->execute([$tabla]);

    $columnas = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if ($columnas === false || count($columnas) === 0) {
        return null;
    }

    return array_map(static fn ($columna): string => (string)$columna, $columnas);
}

function mesas_armado_docentes_grupos_limpiar(PDO $pdo): void
{
    $pdo->exec('DELETE FROM mesas_no_agrupadas');
    $pdo->exec('DELETE FROM mesas_grupos');
}

function mesas_armado_docentes_grupos_proximo_numero(PDO $pdo): int
{
    $stmt = $pdo->query('SELECT COALESCE(MAX(numero_grupo), 0) + 1 FROM mesas_grupos');
    return max(1, (int)$stmt->fetchColumn());
}

function mesas_armado_docentes_grupos_obtener_horas_turnos(PDO $pdo): array
{
    $stmt = $pdo->query("\n        SELECT id_turno, turno\n        FROM turnos\n        WHERE activo = 1\n        ORDER BY id_turno ASC\n    ");

    $map = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $turno = mb_strtoupper(trim((string)($row['turno'] ?? '')), 'UTF-8');
        $hora = null;

        if (str_contains($turno, 'MAÑANA') || str_contains($turno, 'MANANA')) {
            $hora = '07:30:00';
        } elseif (str_contains($turno, 'TARDE')) {
            $hora = '13:30:00';
        }

        $map[(int)$row['id_turno']] = $hora;
    }

    return $map;
}

function mesas_armado_docentes_grupos_obtener_numeros_mesa(PDO $pdo): array
{
    $sql = "\n        SELECT\n            me.numero_mesa,\n            MIN(me.fecha_mesa) AS fecha_mesa,\n            MIN(me.id_turno) AS id_turno,\n            MAX(me.prioridad) AS prioridad,\n            MAX(CASE WHEN me.tipo_mesa = 'correlativa' THEN 1 ELSE 0 END) AS tiene_correlativa,\n            MAX(CASE WHEN me.tipo_mesa = 'taller' OR me.id_taller IS NOT NULL OR me.prioridad = 1 THEN 1 ELSE 0 END) AS es_taller,\n            MAX(me.id_taller) AS id_taller,\n            MIN(am.id_area) AS id_area,\n            COUNT(*) AS cantidad_registros,\n            COUNT(DISTINCT p.dni) AS cantidad_alumnos,\n            COUNT(DISTINCT me.id_docente) AS cantidad_docentes,\n            COUNT(DISTINCT am.id_area) AS cantidad_areas,\n            COUNT(DISTINCT CONCAT(COALESCE(CAST(me.fecha_mesa AS CHAR), 'NULL'), '|', COALESCE(CAST(me.id_turno AS CHAR), 'NULL'))) AS cantidad_slots,\n            SUM(CASE WHEN me.estado = 'observada' THEN 1 ELSE 0 END) AS cantidad_observadas,\n            SUM(CASE WHEN me.fecha_mesa IS NULL OR me.id_turno IS NULL THEN 1 ELSE 0 END) AS cantidad_sin_slot,\n            GROUP_CONCAT(DISTINCT me.tipo_mesa ORDER BY me.tipo_mesa SEPARATOR ',') AS tipos_csv,\n            GROUP_CONCAT(DISTINCT me.id_docente ORDER BY me.id_docente SEPARATOR ',') AS docentes_csv,\n            GROUP_CONCAT(DISTINCT p.dni ORDER BY p.dni SEPARATOR ',') AS alumnos_csv,\n            GROUP_CONCAT(DISTINCT am.id_area ORDER BY am.id_area SEPARATOR ',') AS areas_csv,
            GROUP_CONCAT(DISTINCT NULLIF(TRIM(me.observacion), '') SEPARATOR ' | ') AS observaciones_csv
        FROM mesas me
        LEFT JOIN previas p\n            ON p.id_previa = me.id_previa
        LEFT JOIN catedras cat
            ON cat.id_catedra = me.id_catedra
        LEFT JOIN areas_materias am
            ON am.id_materia = COALESCE(cat.id_materia, p.id_materia)
           AND am.activo = 1
        LEFT JOIN areas a
            ON a.id_area = am.id_area
           AND a.activo = 1
        WHERE me.numero_mesa IS NOT NULL
          AND me.estado IN ('borrador', 'armada', 'observada')
        GROUP BY me.numero_mesa
        ORDER BY
            MIN(me.fecha_mesa) ASC,
            MIN(me.id_turno) ASC,
            MIN(am.id_area) ASC,
            MAX(me.prioridad) DESC,
            COUNT(DISTINCT p.dni) DESC,
            me.numero_mesa ASC
    ";

    $stmt = $pdo->query($sql);
    $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $numeros = [];

    foreach ($filas as $fila) {
        $esTaller = (int)($fila['es_taller'] ?? 0) === 1 || (int)($fila['prioridad'] ?? 0) === 1;
        $tieneCorrelativa = (int)($fila['tiene_correlativa'] ?? 0) === 1;
        $cantidadAreas = (int)($fila['cantidad_areas'] ?? 0);

        /*
         * Regla pedida para talleres:
         * si el numero_mesa tiene prioridad 1, tipo taller o id_taller,
         * entra a mesas_grupos como grupo individual.
         * Como un taller puede estar compuesto por materias de áreas distintas,
         * no se lo descarta por no tener un área única. En ese caso se guarda
         * id_area NULL para no forzar un área incorrecta.
         */
        $idArea = $fila['id_area'] !== null ? (int)$fila['id_area'] : null;
        if ($esTaller && $cantidadAreas !== 1) {
            $idArea = null;
        }

        $numeros[] = [
            'numero_mesa' => (int)$fila['numero_mesa'],
            'fecha_mesa' => $fila['fecha_mesa'] !== null ? (string)$fila['fecha_mesa'] : null,
            'id_turno' => $fila['id_turno'] !== null ? (int)$fila['id_turno'] : null,
            'id_area' => $idArea,
            'tipo_mesa' => $esTaller ? 'taller' : ($tieneCorrelativa ? 'correlativa' : 'simple'),
            'es_taller' => $esTaller,
            'id_taller' => $fila['id_taller'] !== null ? (int)$fila['id_taller'] : null,
            'prioridad' => (int)($fila['prioridad'] ?? 0),
            'cantidad_registros' => (int)($fila['cantidad_registros'] ?? 0),
            'cantidad_alumnos' => (int)($fila['cantidad_alumnos'] ?? 0),
            'cantidad_docentes' => (int)($fila['cantidad_docentes'] ?? 0),
            'cantidad_areas' => (int)($fila['cantidad_areas'] ?? 0),
            'cantidad_slots' => (int)($fila['cantidad_slots'] ?? 0),
            'cantidad_observadas' => (int)($fila['cantidad_observadas'] ?? 0),
            'cantidad_sin_slot' => (int)($fila['cantidad_sin_slot'] ?? 0),
            'tipos' => mesas_armado_docentes_grupos_csv_a_array($fila['tipos_csv'] ?? ''),
            'docentes' => array_values(array_unique(array_map('intval', mesas_armado_docentes_grupos_csv_a_array($fila['docentes_csv'] ?? '')))),
            'alumnos' => mesas_armado_docentes_grupos_csv_a_array($fila['alumnos_csv'] ?? ''),
            'areas' => array_values(array_unique(array_map('intval', mesas_armado_docentes_grupos_csv_a_array($fila['areas_csv'] ?? '')))),
            'observaciones' => mesas_armado_docentes_grupos_csv_a_array($fila['observaciones_csv'] ?? ''),
        ];
    }

    return $numeros;
}

function mesas_armado_docentes_grupos_csv_a_array(?string $csv): array
{
    $csv = trim((string)$csv);

    if ($csv === '') {
        return [];
    }

    return array_values(array_filter(array_map('trim', explode(',', $csv)), static fn ($v) => $v !== ''));
}
function mesas_armado_docentes_grupos_es_simple_para_compartir_docente(array $numero): bool
{
    /*
     * El nombre de la función queda por compatibilidad, pero la regla ahora es más amplia:
     * se permite priorizar mismo docente para cualquier número NO taller, sin exigir misma área.
     * La validación final sigue exigiendo mínimo 2 docentes distintos en el grupo,
     * por lo que nunca queda un grupo de 2 números atendido por una sola persona.
     */
    return empty($numero['es_taller'])
        && (int)($numero['prioridad'] ?? 0) !== 1
        && (string)($numero['tipo_mesa'] ?? 'simple') !== 'taller'
        ;
}

function mesas_armado_docentes_grupos_comparten_docente(array $a, array $b): bool
{
    return count(array_intersect($a['docentes'] ?? [], $b['docentes'] ?? [])) > 0;
}

function mesas_armado_docentes_grupos_misma_area(array $a, array $b): bool
{
    return ($a['id_area'] ?? null) !== null
        && ($b['id_area'] ?? null) !== null
        && (int)$a['id_area'] === (int)$b['id_area'];
}

function mesas_armado_docentes_grupos_docente_compartido_permitido(array $numero, array $actual): bool
{
    return mesas_armado_docentes_grupos_es_simple_para_compartir_docente($numero)
        && mesas_armado_docentes_grupos_es_simple_para_compartir_docente($actual)
        && mesas_armado_docentes_grupos_comparten_docente($numero, $actual);
}


function mesas_armado_docentes_grupos_cantidad_docentes_distintos(array $numeros): int
{
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

function mesas_armado_docentes_grupos_contiene_taller(array $numeros): bool
{
    foreach ($numeros as $numero) {
        if (!empty($numero['es_taller']) || (string)($numero['tipo_mesa'] ?? '') === 'taller' || (int)($numero['prioridad'] ?? 0) === 1) {
            return true;
        }
    }

    return false;
}

function mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos(array $numeros, int $minDocentes = 2): bool
{
    if (mesas_armado_docentes_grupos_contiene_taller($numeros)) {
        return true;
    }

    if (count($numeros) < 2) {
        return false;
    }

    return mesas_armado_docentes_grupos_cantidad_docentes_distintos($numeros) >= $minDocentes;
}

function mesas_armado_docentes_grupos_score_candidato_para_grupo(array $numero, array $grupo): int
{
    $score = 0;

    foreach ($grupo as $actual) {
        if (mesas_armado_docentes_grupos_docente_compartido_permitido($numero, $actual)) {
            $score += 5000;
        } elseif (mesas_armado_docentes_grupos_misma_area($numero, $actual)) {
            $score += 500;
        }
    }

    $score += (int)($numero['prioridad'] ?? 0) * 100;
    $score += (int)($numero['cantidad_alumnos'] ?? 0);

    return $score;
}

function mesas_armado_docentes_grupos_motivo_invalido(array $numero, array $disponibilidadDocentes, ?string $fechaInicioRango = null, ?string $fechaFinRango = null): ?string
{
    if ((int)$numero['cantidad_observadas'] > 0) {
        $observaciones = $numero['observaciones'] ?? [];
        if (is_array($observaciones) && count($observaciones) > 0) {
            return mb_substr((string)$observaciones[0], 0, 255, 'UTF-8');
        }

        return 'numero_mesa_con_registros_observados';
    }

    if ((int)$numero['cantidad_sin_slot'] > 0 || $numero['fecha_mesa'] === null || $numero['id_turno'] === null) {
        $observaciones = $numero['observaciones'] ?? [];
        if (is_array($observaciones) && count($observaciones) > 0) {
            return mb_substr((string)$observaciones[0], 0, 255, 'UTF-8');
        }

        return 'numero_mesa_sin_fecha_o_turno';
    }

    if (function_exists('mesas_armado_docentes_fecha_valida')
        && $fechaInicioRango !== null
        && $fechaFinRango !== null
        && mesas_armado_docentes_fecha_valida((string)$fechaInicioRango)
        && mesas_armado_docentes_fecha_valida((string)$fechaFinRango)
        && (string)$fechaFinRango >= (string)$fechaInicioRango
        && ($numero['fecha_mesa'] < (string)$fechaInicioRango || $numero['fecha_mesa'] > (string)$fechaFinRango)
    ) {
        return 'fecha_turno_fuera_del_rango_solicitado';
    }

    if ((int)$numero['cantidad_slots'] !== 1) {
        return 'numero_mesa_con_mas_de_una_fecha_o_turno';
    }


    if (!$numero['es_taller'] && (int)$numero['cantidad_alumnos'] <= 0) {
        return 'numero_mesa_sin_alumnos';
    }

    foreach ($numero['docentes'] as $idDocente) {
        if ($idDocente <= 0) {
            return 'numero_mesa_con_docente_no_resuelto';
        }

        if (mesas_armado_docentes_docente_no_disponible($disponibilidadDocentes, $idDocente, (string)$numero['fecha_mesa'], (int)$numero['id_turno'])) {
            return 'docente_sin_disponibilidad_en_dia_turno';
        }
    }

    return null;
}

function mesas_armado_docentes_grupos_formar_subgrupos(array $bucket, int $minNumeros, int $maxNumeros): array
{
    $pendientes = array_values($bucket);
    $grupos = [];
    $sobrantes = [];

    while (count($pendientes) >= $minNumeros) {
        $grupo = [];
        $base = array_shift($pendientes);
        $grupo[] = $base;

        usort($pendientes, static function (array $a, array $b) use ($grupo): int {
            $scoreA = mesas_armado_docentes_grupos_score_candidato_para_grupo($a, $grupo);
            $scoreB = mesas_armado_docentes_grupos_score_candidato_para_grupo($b, $grupo);

            if ($scoreA !== $scoreB) {
                return $scoreB <=> $scoreA;
            }

            return (int)$a['numero_mesa'] <=> (int)$b['numero_mesa'];
        });

        $i = 0;
        while ($i < count($pendientes) && count($grupo) < $maxNumeros) {
            if (mesas_armado_docentes_grupos_es_compatible_con_grupo($pendientes[$i], $grupo)) {
                $grupo[] = $pendientes[$i];
                array_splice($pendientes, $i, 1);
                continue;
            }
            $i++;
        }

        if (count($grupo) >= $minNumeros && mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos($grupo)) {
            $grupos[] = $grupo;
        } else {
            foreach ($grupo as $item) {
                $sobrantes[] = $item;
            }
        }
    }

    foreach ($pendientes as $item) {
        $sobrantes[] = $item;
    }

    return mesas_armado_docentes_grupos_rebalancear_sobrantes($grupos, $sobrantes, $minNumeros, $maxNumeros);
}

function mesas_armado_docentes_grupos_es_compatible_con_grupo(array $numero, array $grupo): bool
{
    if ($numero['es_taller']) {
        return false;
    }

    foreach ($grupo as $actual) {
        if ($actual['es_taller']) {
            return false;
        }

        if ($numero['fecha_mesa'] !== $actual['fecha_mesa']) {
            return false;
        }

        if ((int)$numero['id_turno'] !== (int)$actual['id_turno']) {
            return false;
        }


        if (count(array_intersect($numero['alumnos'], $actual['alumnos'])) > 0) {
            return false;
        }
    }

    return true;
}

function mesas_armado_docentes_grupos_rebalancear_sobrantes(array $grupos, array $sobrantes, int $minNumeros, int $maxNumeros): array
{
    if (count($sobrantes) === 0 || count($grupos) === 0) {
        return [$grupos, $sobrantes];
    }

    $pendientes = [];

    foreach ($sobrantes as $sobrante) {
        $ubicado = false;

        foreach ($grupos as &$grupo) {
            if (count($grupo) >= $maxNumeros) {
                continue;
            }

            if (mesas_armado_docentes_grupos_es_compatible_con_grupo($sobrante, $grupo)
                && mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos(array_merge($grupo, [$sobrante]))
            ) {
                $grupo[] = $sobrante;
                $ubicado = true;
                break;
            }
        }
        unset($grupo);

        if (!$ubicado) {
            $pendientes[] = $sobrante;
        }
    }

    if (count($pendientes) === 1) {
        $sobrante = $pendientes[0];

        for ($idx = count($grupos) - 1; $idx >= 0; $idx--) {
            if (count($grupos[$idx]) <= $minNumeros) {
                continue;
            }

            for ($j = count($grupos[$idx]) - 1; $j >= 0; $j--) {
                $movido = $grupos[$idx][$j];

                if (!mesas_armado_docentes_grupos_es_compatible_con_grupo($movido, [$sobrante])) {
                    continue;
                }

                $grupoOrigenRestante = $grupos[$idx];
                array_splice($grupoOrigenRestante, $j, 1);

                if (!mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos([$sobrante, $movido])
                    || !mesas_armado_docentes_grupos_cumple_minimo_docentes_distintos($grupoOrigenRestante)
                ) {
                    continue;
                }

                array_splice($grupos[$idx], $j, 1);
                $grupos[] = [$sobrante, $movido];
                return [$grupos, []];
            }
        }
    }

    return [$grupos, $pendientes];
}

function mesas_armado_docentes_grupos_insertar_grupo_simple(
    PDOStatement $insertGrupo,
    int $numeroGrupo,
    array $numeros,
    string $estado,
    ?string $observacion,
    array $horasTurnos
): void {
    $orden = 1;

    foreach ($numeros as $numero) {
        $idTurno = (int)$numero['id_turno'];
        $insertGrupo->execute([
            $numeroGrupo,
            (int)$numero['numero_mesa'],
            (string)$numero['fecha_mesa'],
            $idTurno,
            $horasTurnos[$idTurno] ?? null,
            $numero['id_area'] !== null ? (int)$numero['id_area'] : null,
            $orden,
            (string)$numero['tipo_mesa'],
            (int)$numero['prioridad'],
            (int)$numero['cantidad_alumnos'],
            $estado,
            $observacion,
        ]);
        $orden++;
    }
}

function mesas_armado_docentes_grupos_insertar_no_agrupada(PDOStatement $stmt, array $numero, string $motivo, array $horasTurnos): void
{
    $idTurno = $numero['id_turno'] !== null ? (int)$numero['id_turno'] : null;

    $stmt->execute([
        (int)$numero['numero_mesa'],
        $numero['fecha_mesa'] ?? null,
        $idTurno,
        $idTurno !== null && $idTurno > 0 ? ($horasTurnos[$idTurno] ?? null) : null,
        $numero['id_area'] !== null ? (int)$numero['id_area'] : null,
        (string)$numero['tipo_mesa'],
        (int)$numero['prioridad'],
        (int)$numero['cantidad_alumnos'],
        $motivo,
    ]);
}


function mesas_armado_docentes_grupos_blindar_cobertura_salida(PDO $pdo, array $horasTurnos = [], ?array $disponibilidadDocentes = null, ?string $fechaInicioRango = null, ?string $fechaFinRango = null): array
{
    $disponibilidadDocentes = $disponibilidadDocentes ?? mesas_armado_docentes_obtener_disponibilidad_docentes($pdo);
    $numeros = mesas_armado_docentes_grupos_obtener_numeros_mesa($pdo);

    $stmtCubiertos = $pdo->query("
        SELECT DISTINCT numero_mesa
        FROM mesas_grupos
        UNION
        SELECT DISTINCT numero_mesa
        FROM mesas_no_agrupadas
    ");

    $cubiertos = [];
    foreach ($stmtCubiertos->fetchAll(PDO::FETCH_COLUMN) as $numeroMesa) {
        $cubiertos[(int)$numeroMesa] = true;
    }

    $insertNoAgrupada = $pdo->prepare("\n        INSERT INTO mesas_no_agrupadas (\n            numero_mesa,\n            fecha_mesa,\n            id_turno,\n            hora,\n            id_area,\n            tipo_mesa,\n            prioridad,\n            cantidad_alumnos,\n            motivo,\n            estado\n        ) VALUES (\n            ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente'\n        )\n    ");

    $orfas = [];
    $motivos = [];

    foreach ($numeros as $numero) {
        $numeroMesa = (int)$numero['numero_mesa'];

        if (isset($cubiertos[$numeroMesa])) {
            continue;
        }

        $motivo = mesas_armado_docentes_grupos_motivo_invalido($numero, $disponibilidadDocentes, $fechaInicioRango, $fechaFinRango)
            ?? 'blindaje_final_numero_mesa_sin_salida_en_grupos_ni_no_agrupadas';

        mesas_armado_docentes_grupos_insertar_no_agrupada($insertNoAgrupada, $numero, $motivo, $horasTurnos);

        $cubiertos[$numeroMesa] = true;
        $orfas[] = [
            'numero_mesa' => $numeroMesa,
            'motivo' => $motivo,
            'fecha_mesa' => $numero['fecha_mesa'] ?? null,
            'id_turno' => $numero['id_turno'] ?? null,
            'id_area' => $numero['id_area'] ?? null,
            'tipo_mesa' => $numero['tipo_mesa'] ?? 'simple',
        ];
        $motivos[$motivo] = ($motivos[$motivo] ?? 0) + 1;
    }

    return [
        'ejecutado' => true,
        'total_numeros_revisados' => count($numeros),
        'total_orfanas_detectadas' => count($orfas),
        'numeros_orfanos_enviados_a_no_agrupadas' => $orfas,
        'motivos' => $motivos,
    ];
}


function mesas_armado_docentes_grupos_totales_finales(PDO $pdo): array
{
    $totalGrupos = (int)$pdo->query('SELECT COUNT(DISTINCT numero_grupo) FROM mesas_grupos')->fetchColumn();
    $totalFilasGrupo = (int)$pdo->query('SELECT COUNT(*) FROM mesas_grupos')->fetchColumn();
    $totalNoAgrupadas = (int)$pdo->query('SELECT COUNT(*) FROM mesas_no_agrupadas')->fetchColumn();

    return [
        'total_grupos' => $totalGrupos,
        'total_filas_grupo' => $totalFilasGrupo,
        'total_no_agrupadas' => $totalNoAgrupadas,
    ];
}

function mesas_armado_docentes_grupos_motivos_no_agrupadas_actuales(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT motivo, COUNT(*) AS total
        FROM mesas_no_agrupadas
        GROUP BY motivo
        ORDER BY total DESC, motivo ASC
    ");

    $salida = [];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $salida[(string)$row['motivo']] = (int)$row['total'];
    }

    return $salida;
}

function mesas_armado_docentes_grupos_agregar_unico(array &$item, string $coleccion, string $indice, mixed $id, ?string $texto): void
{
    $texto = trim((string)$texto);

    if ($texto === '') {
        return;
    }

    $key = $id !== null && $id !== '' ? (string)$id : mb_strtolower($texto, 'UTF-8');

    if (isset($item[$indice][$key])) {
        return;
    }

    $item[$indice][$key] = true;
    $item[$coleccion][] = [
        'id' => $id !== null && $id !== '' ? (int)$id : null,
        'nombre' => $texto,
    ];
}

function mesas_armado_docentes_grupos_texto_lista(array $items, string $campo = 'nombre'): string
{
    $textos = [];

    foreach ($items as $item) {
        $valor = is_array($item) ? ($item[$campo] ?? '') : $item;
        $valor = trim((string)$valor);

        if ($valor !== '') {
            $textos[] = $valor;
        }
    }

    return implode(' / ', $textos);
}

function mesas_armado_docentes_grupos_inicializar_numero(array $detalle): array
{
    return [
        'id' => 'numero_' . (int)$detalle['numero_mesa'],
        'numero_mesa' => (int)$detalle['numero_mesa'],
        'numero_mesa_texto' => 'Mesa N° ' . (int)$detalle['numero_mesa'],
        'orden' => (int)($detalle['orden'] ?? 1),
        'tipo_mesa' => $detalle['tipo_numero'] ?? ($detalle['tipo_mesa'] ?? 'simple'),
        'prioridad' => (int)($detalle['prioridad_numero'] ?? ($detalle['prioridad'] ?? 0)),
        'cantidad_alumnos' => (int)($detalle['cantidad_alumnos_numero'] ?? ($detalle['cantidad_alumnos'] ?? 0)),
        'observacion' => $detalle['observacion_numero'] ?? ($detalle['observacion'] ?? null),
        'docente' => '',
        'docentes' => [],
        '_docentes_index' => [],
        'materia' => '',
        'materias' => [],
        '_materias_index' => [],
        'alumnos' => [],
        '_alumnos_index' => [],
        '_dni_index' => [],
        'cantidad_previas' => 0,
        'cantidad_alumnos_distintos' => 0,
    ];
}

function mesas_armado_docentes_grupos_limpieza_salida(array $grupo): array
{
    foreach ($grupo['numeros'] as &$numero) {
        $numero['docente'] = mesas_armado_docentes_grupos_texto_lista($numero['docentes']);
        $numero['materia'] = mesas_armado_docentes_grupos_texto_lista($numero['materias']);
        $numero['cantidad_previas'] = count($numero['alumnos']);
        $numero['cantidad_alumnos_distintos'] = count($numero['_dni_index']);

        unset($numero['_docentes_index'], $numero['_materias_index'], $numero['_alumnos_index'], $numero['_dni_index']);
    }
    unset($numero);

    $grupo['docente'] = mesas_armado_docentes_grupos_texto_lista($grupo['docentes']);
    $grupo['materia'] = mesas_armado_docentes_grupos_texto_lista($grupo['materias']);
    $grupo['cantidad_previas'] = count($grupo['alumnos']);
    $grupo['cantidad_alumnos_distintos'] = count($grupo['_dni_index']);

    unset(
        $grupo['_numeros_index'],
        $grupo['_docentes_index'],
        $grupo['_materias_index'],
        $grupo['_alumnos_index'],
        $grupo['_dni_index']
    );

    return $grupo;
}

function mesas_armado_docentes_grupos_busqueda_grupo(array $grupo, string $texto): bool
{
    $texto = mb_strtolower(trim($texto), 'UTF-8');

    if ($texto === '') {
        return true;
    }

    $valores = [
        $grupo['id_grupo'] ?? '',
        $grupo['numero_grupo'] ?? '',
        $grupo['mesa_final_texto'] ?? '',
        $grupo['fecha'] ?? '',
        $grupo['fecha_mesa'] ?? '',
        $grupo['turno'] ?? '',
        $grupo['area'] ?? '',
        $grupo['estado'] ?? '',
        $grupo['observacion'] ?? '',
        $grupo['motivo'] ?? '',
        $grupo['numeros_mesa_texto'] ?? '',
        $grupo['docente'] ?? '',
        $grupo['materia'] ?? '',
    ];

    foreach ($valores as $valor) {
        if (str_contains(mb_strtolower((string)$valor, 'UTF-8'), $texto)) {
            return true;
        }
    }

    foreach (($grupo['numeros'] ?? []) as $numero) {
        $valoresNumero = [
            $numero['numero_mesa'] ?? '',
            $numero['numero_mesa_texto'] ?? '',
            $numero['tipo_mesa'] ?? '',
            $numero['docente'] ?? '',
            $numero['materia'] ?? '',
            $numero['observacion'] ?? '',
        ];

        foreach ($valoresNumero as $valor) {
            if (str_contains(mb_strtolower((string)$valor, 'UTF-8'), $texto)) {
                return true;
            }
        }

        foreach (($numero['alumnos'] ?? []) as $alumno) {
            $valoresAlumno = [
                $alumno['estudiante'] ?? '',
                $alumno['alumno'] ?? '',
                $alumno['dni'] ?? '',
                $alumno['materia'] ?? '',
                $alumno['docente'] ?? '',
                $alumno['curso_alumno'] ?? '',
                $alumno['division_alumno'] ?? '',
                $alumno['curso_materia'] ?? '',
                $alumno['division_materia'] ?? '',
                $alumno['condicion'] ?? '',
                $alumno['numero_mesa'] ?? '',
            ];

            foreach ($valoresAlumno as $valor) {
                if (str_contains(mb_strtolower((string)$valor, 'UTF-8'), $texto)) {
                    return true;
                }
            }
        }
    }

    return false;
}

function mesas_armado_docentes_grupos_hidratar_detalles(PDO $pdo, array $gruposBase, array $numerosGrupo): array
{
    if (count($numerosGrupo) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($numerosGrupo), '?'));

    $stmt = $pdo->prepare("\n        SELECT\n            g.id_mesa_grupo,\n            g.numero_grupo,\n            g.numero_mesa,\n            g.orden,\n            g.tipo_mesa AS tipo_numero,\n            g.prioridad AS prioridad_numero,\n            g.cantidad_alumnos AS cantidad_alumnos_numero,\n            g.observacion AS observacion_numero,\n\n            me.id_mesa,\n            me.prioridad AS prioridad_registro,\n            me.tipo_mesa AS tipo_registro,\n            me.id_taller,\n            me.id_catedra,\n            me.id_previa,\n            me.id_docente,\n            me.fecha_mesa,\n            DATE_FORMAT(me.fecha_mesa, '%d/%m/%Y') AS fecha,\n            me.id_turno,\n            turno_mesa.turno,\n            me.estado AS estado_registro,\n            me.observacion AS observacion_registro,\n\n            p.dni,\n            p.alumno AS estudiante,\n            p.nota,\n            p.anio,\n            p.id_condicion,\n            con.condicion,\n\n            curso_cursando.id_curso AS id_curso_alumno,\n            curso_cursando.nombre_curso AS curso_alumno,\n            division_cursando.id_division AS id_division_alumno,\n            division_cursando.nombre_division AS division_alumno,\n\n            COALESCE(cat.id_materia, p.id_materia) AS id_materia,\n            mat.materia,\n            curso_materia.id_curso AS id_curso_materia,\n            curso_materia.nombre_curso AS curso_materia,\n            division_materia.id_division AS id_division_materia,\n            division_materia.nombre_division AS division_materia,\n\n            doc.id_docente AS id_docente_real,\n            doc.docente\n        FROM mesas_grupos g\n        LEFT JOIN mesas me\n            ON me.numero_mesa = g.numero_mesa\n        LEFT JOIN previas p\n            ON p.id_previa = me.id_previa
        LEFT JOIN catedras cat
            ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias mat\n            ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)\n        LEFT JOIN condicion con\n            ON con.id_condicion = p.id_condicion\n        LEFT JOIN curso curso_cursando\n            ON curso_cursando.id_curso = p.cursando_id_curso\n        LEFT JOIN division division_cursando\n            ON division_cursando.id_division = p.cursando_id_division\n        LEFT JOIN curso curso_materia\n            ON curso_materia.id_curso = COALESCE(cat.id_curso, p.materia_id_curso)\n        LEFT JOIN division division_materia\n            ON division_materia.id_division = COALESCE(cat.id_division, p.materia_id_division)\n        LEFT JOIN docentes doc\n            ON doc.id_docente = me.id_docente\n        LEFT JOIN turnos turno_mesa\n            ON turno_mesa.id_turno = me.id_turno\n        WHERE g.numero_grupo IN ({$placeholders})\n        ORDER BY\n            g.fecha_mesa ASC,\n            g.id_turno ASC,\n            g.numero_grupo ASC,\n            g.orden ASC,\n            g.numero_mesa ASC,\n            mat.materia ASC,\n            p.alumno ASC,\n            me.id_mesa ASC\n    ");
    $stmt->execute($numerosGrupo);

    $grupos = [];

    foreach ($gruposBase as $base) {
        $numeroGrupo = (int)$base['numero_grupo'];
        $grupos[$numeroGrupo] = [
            'id' => 'grupo_' . $numeroGrupo,
            'id_grupo' => $numeroGrupo,
            'numero_grupo' => $numeroGrupo,
            'mesa_final_texto' => 'Mesa final N° ' . $numeroGrupo,
            'fecha_mesa' => $base['fecha_mesa'] ?? null,
            'fecha' => $base['fecha'] ?? null,
            'id_turno' => $base['id_turno'] !== null ? (int)$base['id_turno'] : null,
            'turno' => $base['turno'] ?? null,
            'hora' => $base['hora'] ?? null,
            'id_area' => $base['id_area'] !== null ? (int)$base['id_area'] : null,
            'area' => $base['area'] ?? null,
            'cantidad_numeros' => (int)($base['cantidad_numeros'] ?? 0),
            'cantidad_alumnos' => (int)($base['cantidad_alumnos'] ?? 0),
            'cantidad_previas' => 0,
            'cantidad_alumnos_distintos' => 0,
            'prioridad_max' => (int)($base['prioridad_max'] ?? 0),
            'estado' => $base['estado'] ?? 'borrador',
            'observacion' => $base['observacion'] ?? null,
            'numeros_mesa_texto' => $base['numeros_mesa_texto'] ?? '',
            'tipos_mesa_texto' => $base['tipos_mesa_texto'] ?? '',
            'docente' => '',
            'docentes' => [],
            '_docentes_index' => [],
            'materia' => '',
            'materias' => [],
            '_materias_index' => [],
            'numeros' => [],
            '_numeros_index' => [],
            'alumnos' => [],
            '_alumnos_index' => [],
            '_dni_index' => [],
        ];
    }

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $fila) {
        $numeroGrupo = (int)$fila['numero_grupo'];

        if (!isset($grupos[$numeroGrupo])) {
            continue;
        }

        $grupo =& $grupos[$numeroGrupo];
        $numeroMesa = (int)$fila['numero_mesa'];
        $numeroKey = (string)$numeroMesa;

        if (!isset($grupo['_numeros_index'][$numeroKey])) {
            $grupo['_numeros_index'][$numeroKey] = count($grupo['numeros']);
            $grupo['numeros'][] = mesas_armado_docentes_grupos_inicializar_numero($fila);
        }

        $idxNumero = (int)$grupo['_numeros_index'][$numeroKey];
        $numero =& $grupo['numeros'][$idxNumero];

        mesas_armado_docentes_grupos_agregar_unico($grupo, 'docentes', '_docentes_index', $fila['id_docente_real'] ?? null, $fila['docente'] ?? null);
        mesas_armado_docentes_grupos_agregar_unico($grupo, 'materias', '_materias_index', $fila['id_materia'] ?? null, $fila['materia'] ?? null);
        mesas_armado_docentes_grupos_agregar_unico($numero, 'docentes', '_docentes_index', $fila['id_docente_real'] ?? null, $fila['docente'] ?? null);
        mesas_armado_docentes_grupos_agregar_unico($numero, 'materias', '_materias_index', $fila['id_materia'] ?? null, $fila['materia'] ?? null);

        if ($fila['id_mesa'] === null) {
            unset($numero, $grupo);
            continue;
        }

        $idPrevia = $fila['id_previa'] !== null ? (int)$fila['id_previa'] : null;
        $alumnoKey = $idPrevia !== null ? 'previa_' . $idPrevia . '_mesa_' . (int)$fila['id_mesa'] : 'mesa_' . (int)$fila['id_mesa'];

        if (!isset($numero['_alumnos_index'][$alumnoKey])) {
            $alumno = [
                'id_mesa' => (int)$fila['id_mesa'],
                'id_previa' => $idPrevia,
                'numero_mesa' => $numeroMesa,
                'dni' => trim((string)($fila['dni'] ?? '')),
                'estudiante' => $fila['estudiante'] ?? '',
                'alumno' => $fila['estudiante'] ?? '',
                'id_materia' => $fila['id_materia'] !== null ? (int)$fila['id_materia'] : null,
                'materia' => $fila['materia'] ?? '',
                'id_docente' => $fila['id_docente_real'] !== null ? (int)$fila['id_docente_real'] : null,
                'docente' => $fila['docente'] ?? '',
                'id_curso_alumno' => $fila['id_curso_alumno'] !== null ? (int)$fila['id_curso_alumno'] : null,
                'curso_alumno' => $fila['curso_alumno'] ?? '',
                'id_division_alumno' => $fila['id_division_alumno'] !== null ? (int)$fila['id_division_alumno'] : null,
                'division_alumno' => $fila['division_alumno'] ?? '',
                'curso' => trim((string)(($fila['curso_alumno'] ?? '') . ' ' . ($fila['division_alumno'] ?? ''))),
                'id_curso_materia' => $fila['id_curso_materia'] !== null ? (int)$fila['id_curso_materia'] : null,
                'curso_materia' => $fila['curso_materia'] ?? '',
                'id_division_materia' => $fila['id_division_materia'] !== null ? (int)$fila['id_division_materia'] : null,
                'division_materia' => $fila['division_materia'] ?? '',
                'condicion' => $fila['condicion'] ?? '',
                'nota' => $fila['nota'] ?? null,
                'anio' => $fila['anio'] ?? null,
                'tipo_mesa' => $fila['tipo_registro'] ?? $numero['tipo_mesa'],
                'estado' => $fila['estado_registro'] ?? '',
                'observacion' => $fila['observacion_registro'] ?? null,
                'fecha' => $fila['fecha'] ?? $grupo['fecha'],
                'turno' => $fila['turno'] ?? $grupo['turno'],
            ];

            $numero['_alumnos_index'][$alumnoKey] = true;
            $numero['alumnos'][] = $alumno;

            $grupoAlumnoKey = $alumnoKey . '_num_' . $numeroMesa;
            if (!isset($grupo['_alumnos_index'][$grupoAlumnoKey])) {
                $grupo['_alumnos_index'][$grupoAlumnoKey] = true;
                $grupo['alumnos'][] = $alumno;
            }

            if ($alumno['dni'] !== '') {
                $numero['_dni_index'][$alumno['dni']] = true;
                $grupo['_dni_index'][$alumno['dni']] = true;
            }
        }

        unset($numero, $grupo);
    }

    return array_map('mesas_armado_docentes_grupos_limpieza_salida', array_values($grupos));
}

function mesas_docentes_grupos_listar(): void
{
    try {
        $pdo = db();
        mesas_armado_docentes_grupos_asegurar_tablas($pdo);

        $busqueda = trim((string)($_GET['busqueda'] ?? ''));

        $stmt = $pdo->query("\n            SELECT\n                g.numero_grupo,\n                MIN(g.fecha_mesa) AS fecha_mesa,\n                DATE_FORMAT(MIN(g.fecha_mesa), '%d/%m/%Y') AS fecha,\n                MIN(g.id_turno) AS id_turno,\n                MIN(g.hora) AS hora,\n                MAX(t.turno) AS turno,\n                MIN(g.id_area) AS id_area,\n                MAX(a.area) AS area,\n                COUNT(*) AS cantidad_numeros,\n                SUM(g.cantidad_alumnos) AS cantidad_alumnos,\n                MAX(g.prioridad) AS prioridad_max,\n                CASE\n                    WHEN SUM(CASE WHEN g.estado = 'observado' THEN 1 ELSE 0 END) > 0 THEN 'observado'\n                    WHEN SUM(CASE WHEN g.estado = 'armada' THEN 1 ELSE 0 END) = COUNT(*) THEN 'armada'\n                    WHEN SUM(CASE WHEN g.estado = 'validado' THEN 1 ELSE 0 END) = COUNT(*) THEN 'validado'\n                    ELSE 'borrador'\n                END AS estado,\n                GROUP_CONCAT(DISTINCT g.observacion ORDER BY g.observacion SEPARATOR ' / ') AS observacion,\n                GROUP_CONCAT(g.numero_mesa ORDER BY g.orden SEPARATOR ', ') AS numeros_mesa_texto,\n                GROUP_CONCAT(g.tipo_mesa ORDER BY g.orden SEPARATOR ', ') AS tipos_mesa_texto\n            FROM mesas_grupos g\n            LEFT JOIN turnos t ON t.id_turno = g.id_turno\n            LEFT JOIN areas a ON a.id_area = g.id_area\n            GROUP BY g.numero_grupo\n            ORDER BY MIN(g.fecha_mesa), MIN(g.id_turno), MAX(a.area), g.numero_grupo\n        ");

        $base = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $numerosGrupo = array_map(static fn (array $fila): int => (int)$fila['numero_grupo'], $base);
        $grupos = mesas_armado_docentes_grupos_hidratar_detalles($pdo, $base, $numerosGrupo);

        if ($busqueda !== '') {
            $grupos = array_values(array_filter($grupos, static fn (array $grupo): bool => mesas_armado_docentes_grupos_busqueda_grupo($grupo, $busqueda)));
        }

        json_response([
            'exito' => true,
            'data' => $grupos,
            'resumen' => [
                'total_grupos' => count($grupos),
                'total_numeros' => array_sum(array_map(static fn (array $g): int => count($g['numeros'] ?? []), $grupos)),
                'total_previas' => array_sum(array_map(static fn (array $g): int => (int)($g['cantidad_previas'] ?? 0), $grupos)),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_docentes_grupos_listar');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al listar mesas agrupadas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_docentes_no_agrupadas_listar(): void
{
    try {
        $pdo = db();
        mesas_armado_docentes_grupos_asegurar_tablas($pdo);

        $busqueda = trim((string)($_GET['busqueda'] ?? ''));

        $stmt = $pdo->query("\n            SELECT\n                n.id,\n                n.numero_mesa,\n                n.fecha_mesa,\n                DATE_FORMAT(n.fecha_mesa, '%d/%m/%Y') AS fecha,\n                n.id_turno,\n                n.hora,\n                t.turno,\n                n.id_area,\n                a.area,\n                n.tipo_mesa,\n                n.prioridad,\n                n.cantidad_alumnos,\n                n.motivo,\n                n.estado,\n                n.fecha_registro\n            FROM mesas_no_agrupadas n\n            LEFT JOIN turnos t ON t.id_turno = n.id_turno\n            LEFT JOIN areas a ON a.id_area = n.id_area\n            ORDER BY n.fecha_mesa, n.id_turno, a.area, n.numero_mesa\n        ");

        $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $salida = [];

        foreach ($filas as $fila) {
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
                'numeros' => [mesas_armado_docentes_grupos_inicializar_numero([
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

            $detalle = mesas_armado_docentes_grupos_hidratar_numero_suelto($pdo, $numero);

            foreach ($detalle as $filaDetalle) {
                $idxNumero = 0;
                $num =& $grupo['numeros'][$idxNumero];

                mesas_armado_docentes_grupos_agregar_unico($grupo, 'docentes', '_docentes_index', $filaDetalle['id_docente_real'] ?? null, $filaDetalle['docente'] ?? null);
                mesas_armado_docentes_grupos_agregar_unico($grupo, 'materias', '_materias_index', $filaDetalle['id_materia'] ?? null, $filaDetalle['materia'] ?? null);
                mesas_armado_docentes_grupos_agregar_unico($num, 'docentes', '_docentes_index', $filaDetalle['id_docente_real'] ?? null, $filaDetalle['docente'] ?? null);
                mesas_armado_docentes_grupos_agregar_unico($num, 'materias', '_materias_index', $filaDetalle['id_materia'] ?? null, $filaDetalle['materia'] ?? null);

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

            $salida[] = mesas_armado_docentes_grupos_limpieza_salida($grupo);
        }

        if ($busqueda !== '') {
            $salida = array_values(array_filter($salida, static fn (array $grupo): bool => mesas_armado_docentes_grupos_busqueda_grupo($grupo, $busqueda)));
        }

        json_response([
            'exito' => true,
            'data' => $salida,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'mesas_docentes_no_agrupadas_listar');

        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al listar mesas no agrupadas.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_armado_docentes_grupos_hidratar_numero_suelto(PDO $pdo, int $numeroMesa): array
{
    $stmt = $pdo->prepare("\n        SELECT\n            me.id_mesa,\n            me.numero_mesa,\n            me.prioridad AS prioridad_registro,\n            me.tipo_mesa AS tipo_registro,\n            me.id_taller,\n            me.id_catedra,\n            me.id_previa,\n            me.id_docente,\n            me.fecha_mesa,\n            DATE_FORMAT(me.fecha_mesa, '%d/%m/%Y') AS fecha,\n            me.id_turno,\n            turno_mesa.turno,\n            me.estado AS estado_registro,\n            me.observacion AS observacion_registro,\n            p.dni,\n            p.alumno AS estudiante,\n            p.nota,\n            p.anio,\n            con.condicion,\n            curso_cursando.id_curso AS id_curso_alumno,\n            curso_cursando.nombre_curso AS curso_alumno,\n            division_cursando.id_division AS id_division_alumno,\n            division_cursando.nombre_division AS division_alumno,\n            COALESCE(cat.id_materia, p.id_materia) AS id_materia,\n            mat.materia,\n            curso_materia.id_curso AS id_curso_materia,\n            curso_materia.nombre_curso AS curso_materia,\n            division_materia.id_division AS id_division_materia,\n            division_materia.nombre_division AS division_materia,\n            doc.id_docente AS id_docente_real,\n            doc.docente\n        FROM mesas me\n        LEFT JOIN previas p ON p.id_previa = me.id_previa\n        LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra\n        LEFT JOIN materias mat ON mat.id_materia = COALESCE(cat.id_materia, p.id_materia)\n        LEFT JOIN condicion con ON con.id_condicion = p.id_condicion\n        LEFT JOIN curso curso_cursando ON curso_cursando.id_curso = p.cursando_id_curso\n        LEFT JOIN division division_cursando ON division_cursando.id_division = p.cursando_id_division\n        LEFT JOIN curso curso_materia ON curso_materia.id_curso = COALESCE(cat.id_curso, p.materia_id_curso)\n        LEFT JOIN division division_materia ON division_materia.id_division = COALESCE(cat.id_division, p.materia_id_division)\n        LEFT JOIN docentes doc ON doc.id_docente = me.id_docente\n        LEFT JOIN turnos turno_mesa ON turno_mesa.id_turno = me.id_turno\n        WHERE me.numero_mesa = ?\n        ORDER BY mat.materia, p.alumno, me.id_mesa\n    ");
    $stmt->execute([$numeroMesa]);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
