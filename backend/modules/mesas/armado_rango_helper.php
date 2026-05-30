<?php
// backend/modules/mesas/armado_rango_helper.php
declare(strict_types=1);

if (!function_exists('mesas_armado_rango_normalizar_fecha')) {
    function mesas_armado_rango_normalizar_fecha(?string $fecha): ?string
    {
        $fecha = trim((string)$fecha);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            return null;
        }

        $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
        if (!$dt || $dt->format('Y-m-d') !== $fecha) {
            return null;
        }

        return $fecha;
    }
}

if (!function_exists('mesas_armado_rango_asegurar_tabla')) {
    function mesas_armado_rango_asegurar_tabla(PDO $pdo): void
    {
        $pdo->exec(""
            . "CREATE TABLE IF NOT EXISTS mesas_armado_rango_actual (\n"
            . "    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,\n"
            . "    fecha_inicio DATE NOT NULL,\n"
            . "    fecha_fin DATE NOT NULL,\n"
            . "    tipo_armado VARCHAR(30) NULL DEFAULT NULL,\n"
            . "    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }
}

if (!function_exists('mesas_armado_rango_guardar_actual')) {
    function mesas_armado_rango_guardar_actual(PDO $pdo, ?string $fechaInicio, ?string $fechaFin, string $tipoArmado = ''): void
    {
        $inicio = mesas_armado_rango_normalizar_fecha($fechaInicio);
        $fin = mesas_armado_rango_normalizar_fecha($fechaFin);

        if ($inicio === null || $fin === null) {
            return;
        }

        if ($fin < $inicio) {
            [$inicio, $fin] = [$fin, $inicio];
        }

        $stmt = $pdo->prepare(""
            . "INSERT INTO mesas_armado_rango_actual (id, fecha_inicio, fecha_fin, tipo_armado)\n"
            . "VALUES (1, ?, ?, ?)\n"
            . "ON DUPLICATE KEY UPDATE\n"
            . "    fecha_inicio = VALUES(fecha_inicio),\n"
            . "    fecha_fin = VALUES(fecha_fin),\n"
            . "    tipo_armado = VALUES(tipo_armado),\n"
            . "    actualizado_en = CURRENT_TIMESTAMP"
        );
        $stmt->execute([$inicio, $fin, trim($tipoArmado) ?: null]);
    }
}


if (!function_exists('mesas_armado_docentes_rango_asegurar_tabla')) {
    function mesas_armado_docentes_rango_asegurar_tabla(PDO $pdo): void
    {
        // Compatibilidad: el armado por docentes debe usar la misma tabla global
        // donde se guarda el rango y el tipo de armado vigente.
        mesas_armado_rango_asegurar_tabla($pdo);
    }
}

if (!function_exists('mesas_armado_docentes_rango_guardar_actual')) {
    function mesas_armado_docentes_rango_guardar_actual(PDO $pdo, ?string $fechaInicio, ?string $fechaFin, string $tipoArmado = 'docentes'): void
    {
        // Compatibilidad con versiones anteriores que llamaban funciones con prefijo docentes.
        // Sin este puente, function_exists() devolvía false y el sistema quedaba como armado por área.
        mesas_armado_rango_guardar_actual($pdo, $fechaInicio, $fechaFin, trim($tipoArmado) ?: 'docentes');
    }
}
if (!function_exists('mesas_armado_rango_obtener_tabla')) {
    function mesas_armado_rango_obtener_tabla(PDO $pdo): ?array
    {
        try {
            mesas_armado_rango_asegurar_tabla($pdo);
            $stmt = $pdo->query('SELECT fecha_inicio, fecha_fin, tipo_armado, actualizado_en FROM mesas_armado_rango_actual WHERE id = 1 LIMIT 1');
            $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
            if (!$row) {
                return null;
            }

            $inicio = mesas_armado_rango_normalizar_fecha((string)($row['fecha_inicio'] ?? ''));
            $fin = mesas_armado_rango_normalizar_fecha((string)($row['fecha_fin'] ?? ''));
            if ($inicio === null || $fin === null) {
                return null;
            }

            if ($fin < $inicio) {
                [$inicio, $fin] = [$fin, $inicio];
            }

            return [
                'fecha_inicio' => $inicio,
                'fecha_fin' => $fin,
                'tipo_armado' => trim((string)($row['tipo_armado'] ?? '')),
                'origen' => 'tabla_rango_actual',
                'actualizado_en' => trim((string)($row['actualizado_en'] ?? '')),
            ];
        } catch (Throwable $e) {
            return null;
        }
    }
}

if (!function_exists('mesas_armado_rango_extraer_fecha_payload')) {
    function mesas_armado_rango_extraer_fecha_payload(array $payload, array $claves): ?string
    {
        foreach ($claves as $clave) {
            if (isset($payload[$clave])) {
                $fecha = mesas_armado_rango_normalizar_fecha((string)$payload[$clave]);
                if ($fecha !== null) {
                    return $fecha;
                }
            }
        }
        return null;
    }
}

if (!function_exists('mesas_armado_rango_obtener_auditoria')) {
    function mesas_armado_rango_obtener_auditoria(PDO $pdo): ?array
    {
        try {
            $stmt = $pdo->query(""
                . "SELECT datos_request, accion, fecha_hora\n"
                . "FROM auditoria\n"
                . "WHERE modulo = 'mesas'\n"
                . "  AND resultado = 1\n"
                . "  AND accion IN ('mesas_armado_crear', 'mesas_armado_crear_numerado', 'mesas_armado_crear_docentes', 'mesas_armado_docentes_crear', 'mesas_armado_crear_por_disponibilidad_docente')\n"
                . "ORDER BY fecha_hora DESC, id_auditoria DESC\n"
                . "LIMIT 20"
            );

            if (!$stmt) {
                return null;
            }

            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $json = trim((string)($row['datos_request'] ?? ''));
                if ($json === '') {
                    continue;
                }

                $datos = json_decode($json, true);
                if (!is_array($datos)) {
                    continue;
                }

                $body = is_array($datos['body'] ?? null) ? $datos['body'] : [];
                $post = is_array($datos['post'] ?? null) ? $datos['post'] : [];
                $get = is_array($datos['get'] ?? null) ? $datos['get'] : [];
                $payload = array_merge($get, $post, $body);

                $inicio = mesas_armado_rango_extraer_fecha_payload($payload, ['fecha_inicio', 'fechaInicio', 'inicio', 'desde']);
                $fin = mesas_armado_rango_extraer_fecha_payload($payload, ['fecha_fin', 'fechaFin', 'fin', 'hasta']);

                if ($inicio !== null && $fin !== null) {
                    if ($fin < $inicio) {
                        [$inicio, $fin] = [$fin, $inicio];
                    }

                    return [
                        'fecha_inicio' => $inicio,
                        'fecha_fin' => $fin,
                        'tipo_armado' => trim((string)($payload['tipo_armado'] ?? $row['accion'] ?? '')),
                        'origen' => 'auditoria',
                        'actualizado_en' => trim((string)($row['fecha_hora'] ?? '')),
                    ];
                }
            }
        } catch (Throwable $e) {
            return null;
        }

        return null;
    }
}

if (!function_exists('mesas_armado_rango_obtener_por_fechas_actuales')) {
    function mesas_armado_rango_obtener_por_fechas_actuales(PDO $pdo): ?array
    {
        try {
            $stmt = $pdo->query(""
                . "SELECT MIN(fecha_mesa) AS fecha_inicio, MAX(fecha_mesa) AS fecha_fin\n"
                . "FROM (\n"
                . "    SELECT fecha_mesa FROM mesas WHERE fecha_mesa IS NOT NULL\n"
                . "    UNION ALL\n"
                . "    SELECT fecha_mesa FROM mesas_grupos WHERE fecha_mesa IS NOT NULL\n"
                . "    UNION ALL\n"
                . "    SELECT fecha_mesa FROM mesas_no_agrupadas WHERE fecha_mesa IS NOT NULL\n"
                . ") fechas"
            );
            $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
            if (!$row) {
                return null;
            }

            $inicio = mesas_armado_rango_normalizar_fecha((string)($row['fecha_inicio'] ?? ''));
            $fin = mesas_armado_rango_normalizar_fecha((string)($row['fecha_fin'] ?? ''));
            if ($inicio === null || $fin === null) {
                return null;
            }

            if ($fin < $inicio) {
                [$inicio, $fin] = [$fin, $inicio];
            }

            return [
                'fecha_inicio' => $inicio,
                'fecha_fin' => $fin,
                'tipo_armado' => '',
                'origen' => 'fechas_operativas',
            ];
        } catch (Throwable $e) {
            return null;
        }
    }
}

if (!function_exists('mesas_armado_rango_timestamp_seguro')) {
    function mesas_armado_rango_timestamp_seguro(?string $fechaHora): int
    {
        $fechaHora = trim((string)$fechaHora);
        if ($fechaHora === '') {
            return 0;
        }

        $ts = strtotime($fechaHora);
        return $ts === false ? 0 : (int)$ts;
    }
}

if (!function_exists('mesas_armado_rango_obtener_actual')) {
    function mesas_armado_rango_obtener_actual(PDO $pdo): ?array
    {
        $rangoTabla = mesas_armado_rango_obtener_tabla($pdo);
        $rangoAuditoria = mesas_armado_rango_obtener_auditoria($pdo);

        if ($rangoAuditoria !== null) {
            $tsTabla = is_array($rangoTabla)
                ? mesas_armado_rango_timestamp_seguro((string)($rangoTabla['actualizado_en'] ?? ''))
                : 0;
            $tsAuditoria = mesas_armado_rango_timestamp_seguro((string)($rangoAuditoria['actualizado_en'] ?? ''));

            // En versiones anteriores el armado por docentes no actualizaba la tabla de rango.
            // Si la auditoría del armado es posterior, se toma como fuente vigente.
            if ($rangoTabla === null || $tsTabla === 0 || $tsAuditoria >= $tsTabla) {
                return $rangoAuditoria;
            }
        }

        if ($rangoTabla !== null) {
            return $rangoTabla;
        }

        if ($rangoAuditoria !== null) {
            return $rangoAuditoria;
        }

        return mesas_armado_rango_obtener_por_fechas_actuales($pdo);
    }
}

if (!function_exists('mesas_armado_rango_intersectar')) {
    function mesas_armado_rango_intersectar(string $inicioA, string $finA, string $inicioB, string $finB): ?array
    {
        $inicio = max($inicioA, $inicioB);
        $fin = min($finA, $finB);

        if ($fin < $inicio) {
            return null;
        }

        return [$inicio, $fin];
    }
}

if (!function_exists('mesas_armado_rango_fecha_dentro_actual')) {
    function mesas_armado_rango_fecha_dentro_actual(PDO $pdo, string $fecha): array
    {
        $fechaNormalizada = mesas_armado_rango_normalizar_fecha($fecha);
        $rango = mesas_armado_rango_obtener_actual($pdo);

        if ($fechaNormalizada === null || $rango === null) {
            return [
                'valido' => true,
                'rango' => $rango,
                'mensaje' => '',
            ];
        }

        $inicio = (string)$rango['fecha_inicio'];
        $fin = (string)$rango['fecha_fin'];
        $dentro = $fechaNormalizada >= $inicio && $fechaNormalizada <= $fin;

        return [
            'valido' => $dentro,
            'rango' => $rango,
            'mensaje' => $dentro ? '' : 'La fecha seleccionada está fuera de los días definidos para este armado de mesas (' . $inicio . ' a ' . $fin . ').',
        ];
    }
}
