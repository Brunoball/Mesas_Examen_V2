<?php
// backend/modules/disponibilidad_docentes/route.php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Módulo: Disponibilidad Docente
|--------------------------------------------------------------------------
| Permite que dirección / vicedirección cargue los días y turnos en los que
| cada docente puede asistir a la escuela. El armado de mesas ya puede leer
| la tabla docentes_disponibilidad para priorizar esas restricciones.
|--------------------------------------------------------------------------
*/

function route_disponibilidad_docentes(string $action): bool
{
    switch ($action) {
        case 'disponibilidad_docentes_catalogos':
            disponibilidad_docentes_catalogos();
            return true;

        case 'disponibilidad_docentes_listar':
            disponibilidad_docentes_listar();
            return true;

        case 'disponibilidad_docentes_obtener_docente':
            disponibilidad_docentes_obtener_docente();
            return true;

        case 'disponibilidad_docentes_guardar_matriz':
            disponibilidad_docentes_guardar_matriz();
            return true;

        case 'disponibilidad_docentes_guardar':
            disponibilidad_docentes_guardar();
            return true;

        case 'disponibilidad_docentes_eliminar':
            disponibilidad_docentes_eliminar();
            return true;

        case 'disponibilidad_docentes_limpiar_docente':
            disponibilidad_docentes_limpiar_docente();
            return true;
    }

    return false;
}

function disponibilidad_docentes_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return $_POST ?: [];
    }

    $json = json_decode($raw, true);
    return is_array($json) ? $json : ($_POST ?: []);
}

function disponibilidad_docentes_int($value, int $default = 0): int
{
    if ($value === null || $value === '') {
        return $default;
    }
    return (int)$value;
}

function disponibilidad_docentes_str($value): string
{
    return trim((string)($value ?? ''));
}

function disponibilidad_docentes_fecha_nullable($value): ?string
{
    $fecha = trim((string)($value ?? ''));
    if ($fecha === '') {
        return null;
    }

    $dt = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        throw new InvalidArgumentException('La fecha debe tener formato YYYY-MM-DD.');
    }

    return $fecha;
}

function disponibilidad_docentes_dias(): array
{
    return [
        ['dia_semana' => 1, 'nombre' => 'Lunes'],
        ['dia_semana' => 2, 'nombre' => 'Martes'],
        ['dia_semana' => 3, 'nombre' => 'Miércoles'],
        ['dia_semana' => 4, 'nombre' => 'Jueves'],
        ['dia_semana' => 5, 'nombre' => 'Viernes'],
    ];
}

function disponibilidad_docentes_nombre_dia(int $dia): string
{
    foreach (disponibilidad_docentes_dias() as $item) {
        if ((int)$item['dia_semana'] === $dia) {
            return (string)$item['nombre'];
        }
    }
    return 'Día ' . $dia;
}

function disponibilidad_docentes_tabla_existe(PDO $pdo, string $tabla): bool
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $tabla)) {
        return false;
    }

    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.TABLES\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n    ");
    $stmt->execute([$tabla]);
    return (int)$stmt->fetchColumn() > 0;
}

function disponibilidad_docentes_asegurar_tabla(PDO $pdo): void
{
    if (!disponibilidad_docentes_tabla_existe($pdo, 'docentes_disponibilidad')) {
        $pdo->exec("\n            CREATE TABLE docentes_disponibilidad (\n                id_disponibilidad INT NOT NULL AUTO_INCREMENT,\n                id_docente INT NOT NULL,\n                dia_semana TINYINT NOT NULL COMMENT '1=LUNES, 2=MARTES, 3=MIERCOLES, 4=JUEVES, 5=VIERNES',\n                id_turno INT NOT NULL,\n                fecha DATE DEFAULT NULL COMMENT 'Opcional: usar solo para fecha puntual',\n                fecha_clave DATE GENERATED ALWAYS AS (COALESCE(fecha, '1000-01-01')) STORED,\n                origen ENUM('manual','excel','ocr','ia') NOT NULL DEFAULT 'manual',\n                creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n                actualizado_en TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,\n                PRIMARY KEY (id_disponibilidad),\n                UNIQUE KEY uq_doc_disp_docente_dia_turno_fecha (id_docente, dia_semana, id_turno, fecha_clave),\n                KEY idx_doc_disp_docente (id_docente),\n                KEY idx_doc_disp_dia_turno (dia_semana, id_turno),\n                KEY idx_doc_disp_fecha (fecha),\n                KEY fk_doc_disp_turno (id_turno),\n                CONSTRAINT fk_doc_disp_docente FOREIGN KEY (id_docente) REFERENCES docentes (id_docente) ON DELETE CASCADE ON UPDATE CASCADE,\n                CONSTRAINT fk_doc_disp_turno FOREIGN KEY (id_turno) REFERENCES turnos (id_turno) ON DELETE RESTRICT ON UPDATE CASCADE,\n                CONSTRAINT chk_doc_disp_dia_semana CHECK (dia_semana BETWEEN 1 AND 5)\n            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n        ");
    }
}

function disponibilidad_docentes_validar_docente(PDO $pdo, int $idDocente): void
{
    if ($idDocente <= 0) {
        throw new InvalidArgumentException('Seleccioná un docente válido.');
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM docentes WHERE id_docente = ? AND activo = 1');
    $stmt->execute([$idDocente]);

    if ((int)$stmt->fetchColumn() === 0) {
        throw new InvalidArgumentException('El docente seleccionado no existe o está dado de baja.');
    }
}

function disponibilidad_docentes_validar_turno(PDO $pdo, int $idTurno): void
{
    if ($idTurno <= 0) {
        throw new InvalidArgumentException('Seleccioná un turno válido.');
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM turnos WHERE id_turno = ? AND activo = 1');
    $stmt->execute([$idTurno]);

    if ((int)$stmt->fetchColumn() === 0) {
        throw new InvalidArgumentException('El turno seleccionado no existe o está inactivo.');
    }
}

function disponibilidad_docentes_mapear_registro(array $row): array
{
    $diaSemana = (int)($row['dia_semana'] ?? 0);
    return [
        'id_disponibilidad' => (int)($row['id_disponibilidad'] ?? 0),
        'id_docente' => (int)($row['id_docente'] ?? 0),
        'docente' => (string)($row['docente'] ?? ''),
        'id_cargo' => isset($row['id_cargo']) ? (int)$row['id_cargo'] : null,
        'cargo' => (string)($row['cargo'] ?? ''),
        'dia_semana' => $diaSemana,
        'dia_nombre' => disponibilidad_docentes_nombre_dia($diaSemana),
        'id_turno' => (int)($row['id_turno'] ?? 0),
        'turno' => (string)($row['turno'] ?? ''),
        'fecha' => $row['fecha'] ?? null,
        'origen' => (string)($row['origen'] ?? 'manual'),
        'creado_en' => $row['creado_en'] ?? null,
        'actualizado_en' => $row['actualizado_en'] ?? null,
    ];
}

function disponibilidad_docentes_resumen(array $disponibilidades): string
{
    if (!$disponibilidades) {
        return 'Sin disponibilidad cargada';
    }

    $items = [];
    foreach ($disponibilidades as $disp) {
        if (!empty($disp['fecha'])) {
            $items[] = $disp['fecha'] . ' · ' . ($disp['turno'] ?? '');
            continue;
        }
        $items[] = ($disp['dia_nombre'] ?? '') . ' · ' . ($disp['turno'] ?? '');
    }

    return implode(' | ', array_unique(array_filter($items)));
}

function disponibilidad_docentes_catalogos(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        $stmtTurnos = $pdo->query("\n            SELECT id_turno, turno\n            FROM turnos\n            WHERE activo = 1\n            ORDER BY id_turno ASC\n        ");
        $turnos = $stmtTurnos->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $stmtDocentes = $pdo->query("
            SELECT
                d.id_docente,
                d.docente,
                MIN(cd.id_cargo) AS id_cargo,
                COALESCE(GROUP_CONCAT(DISTINCT c.cargo ORDER BY c.cargo SEPARATOR ', '), '-') AS cargo,
                COUNT(DISTINCT dd.id_disponibilidad) AS total_disponibilidades
            FROM docentes d
            LEFT JOIN catedras_docentes cd
                ON cd.id_docente = d.id_docente
               AND cd.activo = 1
            LEFT JOIN cargos c
                ON c.id_cargo = cd.id_cargo
            LEFT JOIN docentes_disponibilidad dd
                ON dd.id_docente = d.id_docente
            WHERE d.activo = 1
            GROUP BY d.id_docente, d.docente
            ORDER BY d.docente ASC, d.id_docente ASC
        ");
        $docentes = $stmtDocentes->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $stmtStats = $pdo->query("\n            SELECT\n                (SELECT COUNT(*) FROM docentes WHERE activo = 1) AS docentes_activos,\n                COUNT(DISTINCT dd.id_docente) AS docentes_con_disponibilidad,\n                COUNT(dd.id_disponibilidad) AS bloques_cargados\n            FROM docentes_disponibilidad dd\n            INNER JOIN docentes d ON d.id_docente = dd.id_docente AND d.activo = 1\n        ");
        $stats = $stmtStats->fetch(PDO::FETCH_ASSOC) ?: [];

        json_response([
            'exito' => true,
            'data' => [
                'dias' => disponibilidad_docentes_dias(),
                'turnos' => $turnos,
                'docentes' => $docentes,
                'estadisticas' => [
                    'docentes_activos' => (int)($stats['docentes_activos'] ?? count($docentes)),
                    'docentes_con_disponibilidad' => (int)($stats['docentes_con_disponibilidad'] ?? 0),
                    'bloques_cargados' => (int)($stats['bloques_cargados'] ?? 0),
                ],
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'disponibilidad_docentes_catalogos');
        json_response(['exito' => false, 'mensaje' => 'Error interno al obtener los catálogos de disponibilidad.'], 500);
    }
}

function disponibilidad_docentes_listar(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        if (function_exists('paginacion')) {
            ['pagina' => $pagina, 'por_pagina' => $porPagina, 'offset' => $offset] = paginacion();
        } else {
            $pagina = max(1, (int)($_GET['pagina'] ?? 1));
            $porPagina = max(1, min(500, (int)($_GET['por_pagina'] ?? 300)));
            $offset = ($pagina - 1) * $porPagina;
        }

        $busqueda = disponibilidad_docentes_str($_GET['busqueda'] ?? '');
        $idDocente = disponibilidad_docentes_int($_GET['id_docente'] ?? 0);
        $soloConCarga = disponibilidad_docentes_int($_GET['solo_con_carga'] ?? 0);

        $where = ['d.activo = 1'];
        $params = [];

        if ($idDocente > 0) {
            $where[] = 'd.id_docente = ?';
            $params[] = $idDocente;
        }

        if ($busqueda !== '') {
            $where[] = "(
                d.docente LIKE ?
                OR EXISTS (
                    SELECT 1
                    FROM catedras_docentes cdb
                    INNER JOIN cargos cb ON cb.id_cargo = cdb.id_cargo
                    WHERE cdb.id_docente = d.id_docente
                      AND cdb.activo = 1
                      AND cb.cargo LIKE ?
                )
            )";
            $like = '%' . $busqueda . '%';
            $params[] = $like;
            $params[] = $like;
        }

        if ($soloConCarga === 1) {
            $where[] = 'EXISTS (SELECT 1 FROM docentes_disponibilidad x WHERE x.id_docente = d.id_docente)';
        }

        $whereSql = implode(' AND ', $where);

        $stmtTotal = $pdo->prepare("
            SELECT COUNT(*)
            FROM docentes d
            WHERE {$whereSql}
        ");
        $stmtTotal->execute($params);
        $total = (int)$stmtTotal->fetchColumn();

        $sql = "
            SELECT
                d.id_docente,
                d.docente,
                MIN(cd.id_cargo) AS id_cargo,
                COALESCE(GROUP_CONCAT(DISTINCT c.cargo ORDER BY c.cargo SEPARATOR ', '), '-') AS cargo,
                d.activo,
                COUNT(DISTINCT dd.id_disponibilidad) AS total_disponibilidades
            FROM docentes d
            LEFT JOIN catedras_docentes cd
                ON cd.id_docente = d.id_docente
               AND cd.activo = 1
            LEFT JOIN cargos c
                ON c.id_cargo = cd.id_cargo
            LEFT JOIN docentes_disponibilidad dd
                ON dd.id_docente = d.id_docente
            WHERE {$whereSql}
            GROUP BY d.id_docente, d.docente, d.activo
            ORDER BY d.docente ASC, d.id_docente ASC
            LIMIT {$porPagina} OFFSET {$offset}
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $docentes = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $ids = array_map(static fn($row) => (int)$row['id_docente'], $docentes);
        $disponibilidadesPorDocente = [];

        if ($ids) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmtDisp = $pdo->prepare("
                SELECT
                    dd.*,
                    d.docente,
                    dc.id_cargo,
                    COALESCE(dc.cargo, '-') AS cargo,
                    t.turno
                FROM docentes_disponibilidad dd
                INNER JOIN docentes d ON d.id_docente = dd.id_docente
                LEFT JOIN (
                    SELECT
                        cd.id_docente,
                        MIN(cd.id_cargo) AS id_cargo,
                        GROUP_CONCAT(DISTINCT c.cargo ORDER BY c.cargo SEPARATOR ', ') AS cargo
                    FROM catedras_docentes cd
                    LEFT JOIN cargos c ON c.id_cargo = cd.id_cargo
                    WHERE cd.activo = 1
                    GROUP BY cd.id_docente
                ) dc ON dc.id_docente = d.id_docente
                INNER JOIN turnos t ON t.id_turno = dd.id_turno
                WHERE dd.id_docente IN ({$placeholders})
                ORDER BY dd.id_docente ASC, dd.fecha IS NOT NULL ASC, dd.fecha ASC, dd.dia_semana ASC, dd.id_turno ASC
            ");
            $stmtDisp->execute($ids);
            $rowsDisp = $stmtDisp->fetchAll(PDO::FETCH_ASSOC) ?: [];

            foreach ($rowsDisp as $row) {
                $disp = disponibilidad_docentes_mapear_registro($row);
                $disponibilidadesPorDocente[$disp['id_docente']][] = $disp;
            }
        }

        $data = [];
        foreach ($docentes as $row) {
            $id = (int)$row['id_docente'];
            $disponibilidades = $disponibilidadesPorDocente[$id] ?? [];
            $data[] = [
                'id_docente' => $id,
                'docente' => (string)$row['docente'],
                'id_cargo' => isset($row['id_cargo']) ? (int)$row['id_cargo'] : null,
                'cargo' => (string)$row['cargo'],
                'activo' => (int)$row['activo'],
                'total_disponibilidades' => (int)$row['total_disponibilidades'],
                'disponibilidades' => $disponibilidades,
                'resumen' => disponibilidad_docentes_resumen($disponibilidades),
            ];
        }

        json_response([
            'exito' => true,
            'data' => $data,
            'paginacion' => [
                'total' => $total,
                'pagina' => $pagina,
                'por_pagina' => $porPagina,
                'paginas' => (int)ceil($total / max(1, $porPagina)),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'disponibilidad_docentes_listar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al listar disponibilidad docente.'], 500);
    }
}

function disponibilidad_docentes_obtener_docente(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        $idDocente = disponibilidad_docentes_int($_GET['id_docente'] ?? 0);
        disponibilidad_docentes_validar_docente($pdo, $idDocente);

        $stmtDocente = $pdo->prepare("
            SELECT
                d.id_docente,
                d.docente,
                dc.id_cargo,
                COALESCE(dc.cargo, '-') AS cargo,
                d.activo,
                d.motivo,
                d.fecha_carga
            FROM docentes d
            LEFT JOIN (
                SELECT
                    cd.id_docente,
                    MIN(cd.id_cargo) AS id_cargo,
                    GROUP_CONCAT(DISTINCT c.cargo ORDER BY c.cargo SEPARATOR ', ') AS cargo
                FROM catedras_docentes cd
                LEFT JOIN cargos c ON c.id_cargo = cd.id_cargo
                WHERE cd.activo = 1
                GROUP BY cd.id_docente
            ) dc ON dc.id_docente = d.id_docente
            WHERE d.id_docente = ?
            LIMIT 1
        ");
        $stmtDocente->execute([$idDocente]);
        $docente = $stmtDocente->fetch(PDO::FETCH_ASSOC);

        $stmtDisp = $pdo->prepare("
            SELECT
                dd.*,
                d.docente,
                dc.id_cargo,
                COALESCE(dc.cargo, '-') AS cargo,
                t.turno
            FROM docentes_disponibilidad dd
            INNER JOIN docentes d ON d.id_docente = dd.id_docente
            LEFT JOIN (
                SELECT
                    cd.id_docente,
                    MIN(cd.id_cargo) AS id_cargo,
                    GROUP_CONCAT(DISTINCT c.cargo ORDER BY c.cargo SEPARATOR ', ') AS cargo
                FROM catedras_docentes cd
                LEFT JOIN cargos c ON c.id_cargo = cd.id_cargo
                WHERE cd.activo = 1
                GROUP BY cd.id_docente
            ) dc ON dc.id_docente = d.id_docente
            INNER JOIN turnos t ON t.id_turno = dd.id_turno
            WHERE dd.id_docente = ?
            ORDER BY dd.fecha IS NOT NULL ASC, dd.fecha ASC, dd.dia_semana ASC, dd.id_turno ASC
        ");
        $stmtDisp->execute([$idDocente]);
        $disponibilidades = array_map('disponibilidad_docentes_mapear_registro', $stmtDisp->fetchAll(PDO::FETCH_ASSOC) ?: []);

        $stmtCatedras = $pdo->prepare("
            SELECT COUNT(DISTINCT cat.id_catedra)
            FROM catedras_docentes cd
            INNER JOIN catedras cat
                ON cat.id_catedra = cd.id_catedra
               AND cat.activo = 1
            WHERE cd.id_docente = ?
              AND cd.activo = 1
        ");
        $stmtCatedras->execute([$idDocente]);

        $data = [
            'id_docente' => (int)$docente['id_docente'],
            'docente' => (string)$docente['docente'],
            'id_cargo' => isset($docente['id_cargo']) ? (int)$docente['id_cargo'] : null,
            'cargo' => (string)$docente['cargo'],
            'activo' => (int)$docente['activo'],
            'motivo' => $docente['motivo'] ?? null,
            'fecha_carga' => $docente['fecha_carga'] ?? null,
            'total_catedras' => (int)$stmtCatedras->fetchColumn(),
            'total_disponibilidades' => count($disponibilidades),
            'disponibilidades' => $disponibilidades,
            'resumen' => disponibilidad_docentes_resumen($disponibilidades),
        ];

        json_response(['exito' => true, 'data' => $data]);
    } catch (InvalidArgumentException $e) {
        json_response(['exito' => false, 'mensaje' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        log_error($e, 'disponibilidad_docentes_obtener_docente');
        json_response(['exito' => false, 'mensaje' => 'Error interno al obtener la disponibilidad del docente.'], 500);
    }
}

function disponibilidad_docentes_guardar_matriz(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        $input = disponibilidad_docentes_input();
        $idDocente = disponibilidad_docentes_int($input['id_docente'] ?? 0);
        $disponibilidades = $input['disponibilidades'] ?? [];

        disponibilidad_docentes_validar_docente($pdo, $idDocente);

        if (!is_array($disponibilidades)) {
            throw new InvalidArgumentException('El formato de disponibilidad enviado no es válido.');
        }

        $normalizadas = [];
        $index = [];

        foreach ($disponibilidades as $item) {
            if (!is_array($item)) {
                continue;
            }

            $diaSemana = disponibilidad_docentes_int($item['dia_semana'] ?? 0);
            $idTurno = disponibilidad_docentes_int($item['id_turno'] ?? 0);

            if ($diaSemana < 1 || $diaSemana > 5) {
                throw new InvalidArgumentException('El día seleccionado no es válido.');
            }

            disponibilidad_docentes_validar_turno($pdo, $idTurno);

            $key = $diaSemana . '-' . $idTurno;
            if (isset($index[$key])) {
                continue;
            }
            $index[$key] = true;
            $normalizadas[] = [$diaSemana, $idTurno];
        }

        $pdo->beginTransaction();

        // Esta pantalla maneja la disponibilidad semanal. Las fechas puntuales futuras quedan preservadas.
        $stmtDelete = $pdo->prepare('DELETE FROM docentes_disponibilidad WHERE id_docente = ? AND fecha IS NULL');
        $stmtDelete->execute([$idDocente]);

        if ($normalizadas) {
            $stmtInsert = $pdo->prepare("\n                INSERT INTO docentes_disponibilidad (id_docente, dia_semana, id_turno, fecha, origen)\n                VALUES (?, ?, ?, NULL, 'manual')\n            ");

            foreach ($normalizadas as [$diaSemana, $idTurno]) {
                $stmtInsert->execute([$idDocente, $diaSemana, $idTurno]);
            }
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Disponibilidad docente guardada correctamente.',
            'data' => [
                'id_docente' => $idDocente,
                'bloques_guardados' => count($normalizadas),
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(['exito' => false, 'mensaje' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, 'disponibilidad_docentes_guardar_matriz');
        json_response(['exito' => false, 'mensaje' => 'Error interno al guardar la disponibilidad docente.'], 500);
    }
}

function disponibilidad_docentes_guardar(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        $input = disponibilidad_docentes_input();
        $idDisponibilidad = disponibilidad_docentes_int($input['id_disponibilidad'] ?? 0);
        $idDocente = disponibilidad_docentes_int($input['id_docente'] ?? 0);
        $diaSemana = disponibilidad_docentes_int($input['dia_semana'] ?? 0);
        $idTurno = disponibilidad_docentes_int($input['id_turno'] ?? 0);
        $fecha = disponibilidad_docentes_fecha_nullable($input['fecha'] ?? null);
        $origen = disponibilidad_docentes_str($input['origen'] ?? 'manual');

        if (!in_array($origen, ['manual', 'excel', 'ocr', 'ia'], true)) {
            $origen = 'manual';
        }

        disponibilidad_docentes_validar_docente($pdo, $idDocente);
        disponibilidad_docentes_validar_turno($pdo, $idTurno);

        if ($diaSemana < 1 || $diaSemana > 5) {
            throw new InvalidArgumentException('El día seleccionado no es válido.');
        }

        if ($idDisponibilidad > 0) {
            $stmt = $pdo->prepare("\n                UPDATE docentes_disponibilidad\n                SET id_docente = ?, dia_semana = ?, id_turno = ?, fecha = ?, origen = ?\n                WHERE id_disponibilidad = ?\n            ");
            $stmt->execute([$idDocente, $diaSemana, $idTurno, $fecha, $origen, $idDisponibilidad]);
        } else {
            $stmt = $pdo->prepare("\n                INSERT INTO docentes_disponibilidad (id_docente, dia_semana, id_turno, fecha, origen)\n                VALUES (?, ?, ?, ?, ?)\n            ");
            $stmt->execute([$idDocente, $diaSemana, $idTurno, $fecha, $origen]);
            $idDisponibilidad = (int)$pdo->lastInsertId();
        }

        json_response([
            'exito' => true,
            'mensaje' => 'Registro de disponibilidad guardado correctamente.',
            'data' => ['id_disponibilidad' => $idDisponibilidad],
        ]);
    } catch (InvalidArgumentException $e) {
        json_response(['exito' => false, 'mensaje' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        // 23000 suele ser clave única duplicada.
        if (($e instanceof PDOException) && (string)$e->getCode() === '23000') {
            json_response(['exito' => false, 'mensaje' => 'Ese docente ya tiene cargado ese día y turno.'], 409);
            return;
        }

        log_error($e, 'disponibilidad_docentes_guardar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al guardar el registro de disponibilidad.'], 500);
    }
}

function disponibilidad_docentes_eliminar(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        $input = disponibilidad_docentes_input();
        $ids = $input['ids_disponibilidad'] ?? [];
        if (!is_array($ids)) {
            $ids = [$ids];
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($id) => $id > 0)));
        if (!$ids) {
            throw new InvalidArgumentException('No se seleccionó ningún registro para eliminar.');
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM docentes_disponibilidad WHERE id_disponibilidad IN ({$placeholders})");
        $stmt->execute($ids);

        json_response([
            'exito' => true,
            'mensaje' => 'Disponibilidad eliminada correctamente.',
            'data' => ['eliminados' => $stmt->rowCount()],
        ]);
    } catch (InvalidArgumentException $e) {
        json_response(['exito' => false, 'mensaje' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        log_error($e, 'disponibilidad_docentes_eliminar');
        json_response(['exito' => false, 'mensaje' => 'Error interno al eliminar disponibilidad docente.'], 500);
    }
}

function disponibilidad_docentes_limpiar_docente(): void
{
    try {
        $pdo = db();
        disponibilidad_docentes_asegurar_tabla($pdo);

        $input = disponibilidad_docentes_input();
        $idDocente = disponibilidad_docentes_int($input['id_docente'] ?? 0);
        disponibilidad_docentes_validar_docente($pdo, $idDocente);

        $stmt = $pdo->prepare('DELETE FROM docentes_disponibilidad WHERE id_docente = ? AND fecha IS NULL');
        $stmt->execute([$idDocente]);

        json_response([
            'exito' => true,
            'mensaje' => 'Disponibilidad semanal del docente limpiada correctamente.',
            'data' => ['eliminados' => $stmt->rowCount()],
        ]);
    } catch (InvalidArgumentException $e) {
        json_response(['exito' => false, 'mensaje' => $e->getMessage()], 422);
    } catch (Throwable $e) {
        log_error($e, 'disponibilidad_docentes_limpiar_docente');
        json_response(['exito' => false, 'mensaje' => 'Error interno al limpiar disponibilidad docente.'], 500);
    }
}
