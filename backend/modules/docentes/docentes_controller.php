<?php
// backend/modules/docentes/docentes_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function docentes_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function docentes_body(): array
{
    if (function_exists('get_json_body')) {
        $body = get_json_body();
        return is_array($body) ? $body : [];
    }

    if (function_exists('request_body')) {
        $body = request_body();
        return is_array($body) ? $body : [];
    }

    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $json = json_decode($raw, true);
    return is_array($json) ? $json : [];
}

function docentes_mayuscula(string $texto): string
{
    $texto = trim($texto);
    $texto = preg_replace('/\s+/', ' ', $texto) ?? $texto;
    return mb_strtoupper($texto, 'UTF-8');
}

function docentes_normalizar_nombre(string $texto): string
{
    $texto = docentes_mayuscula($texto);
    $texto = strtr($texto, [
        'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U',
        'À' => 'A', 'È' => 'E', 'Ì' => 'I', 'Ò' => 'O', 'Ù' => 'U',
        'Ä' => 'A', 'Ë' => 'E', 'Ï' => 'I', 'Ö' => 'O', 'Ü' => 'U',
        'Â' => 'A', 'Ê' => 'E', 'Î' => 'I', 'Ô' => 'O', 'Û' => 'U',
        'Ñ' => 'N',
    ]);

    return preg_replace('/\s+/', ' ', $texto) ?? $texto;
}


function docentes_normalizar_dni($valor): ?string
{
    $dni = preg_replace('/[^0-9]/', '', (string)$valor) ?? '';
    $dni = trim($dni);

    return $dni !== '' ? substr($dni, 0, 20) : null;
}

function docentes_normalizar_email($valor): ?string
{
    $email = mb_strtolower(trim((string)$valor), 'UTF-8');

    return $email !== '' ? $email : null;
}

function docentes_paginacion(): array
{
    $pagina = max(1, docentes_int($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(1, docentes_int($_GET['por_pagina'] ?? 20)));

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => ($pagina - 1) * $porPagina,
    ];
}

function docentes_ids_desde_body(array $body): array
{
    $ids = [];

    if (isset($body['ids_docentes']) && is_array($body['ids_docentes'])) {
        $ids = $body['ids_docentes'];
    } elseif (isset($body['ids_docentes'])) {
        $ids = explode(',', (string)$body['ids_docentes']);
    } elseif (isset($body['id_docente'])) {
        $ids = [$body['id_docente']];
    } elseif (isset($body['id'])) {
        $ids = [$body['id']];
    }

    $ids = array_map(static function ($id) {
        $id = docentes_int($id);
        return $id > 0 ? $id : null;
    }, $ids);

    return array_values(array_unique(array_filter($ids)));
}

function docentes_validar_fecha($fecha): ?string
{
    $fecha = trim((string)$fecha);

    if ($fecha === '') {
        return null;
    }

    $dt = DateTime::createFromFormat('Y-m-d', $fecha);

    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        throw new InvalidArgumentException('La fecha debe tener formato YYYY-MM-DD.');
    }

    return $fecha;
}

function docentes_dia_semana_desde_fecha(string $fecha): int
{
    $dt = DateTime::createFromFormat('Y-m-d', $fecha);

    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        return 0;
    }

    // PHP: 1=Lunes ... 7=Domingo. El sistema de mesas trabaja de lunes a viernes.
    $dia = (int)$dt->format('N');
    return ($dia >= 1 && $dia <= 5) ? $dia : 0;
}

function docentes_obtener_turnos_activos(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT id_turno
        FROM turnos
        WHERE activo = 1
        ORDER BY id_turno ASC
    ");

    return array_values(array_filter(array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [])));
}

function docentes_validar_dia_semana($dia): int
{
    $dia = docentes_int($dia);
    return ($dia >= 1 && $dia <= 5) ? $dia : 0;
}

function docentes_catalogo_dias_semana(): array
{
    return [
        ['id_dia_semana' => 1, 'dia_semana' => 'LUNES'],
        ['id_dia_semana' => 2, 'dia_semana' => 'MARTES'],
        ['id_dia_semana' => 3, 'dia_semana' => 'MIÉRCOLES'],
        ['id_dia_semana' => 4, 'dia_semana' => 'JUEVES'],
        ['id_dia_semana' => 5, 'dia_semana' => 'VIERNES'],
    ];
}

function docentes_catalogos(): void
{
    $pdo = db();

    try {
        $cargos = $pdo->query("\n            SELECT id_cargo, cargo\n            FROM cargos\n            WHERE activo = 1\n            ORDER BY cargo ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $turnos = $pdo->query("\n            SELECT id_turno, turno\n            FROM turnos\n            WHERE activo = 1\n            ORDER BY id_turno ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        json_response([
            'exito' => true,
            'data' => [
                'cargos' => $cargos,
                'turnos' => $turnos,
                'dias_semana' => docentes_catalogo_dias_semana(),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener los catálogos de docentes.',
        ], 500);
    }
}

function docentes_listar(): void
{
    $pdo = db();
    $pag = docentes_paginacion();

    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $activo = docentes_int($_GET['activo'] ?? 1) === 0 ? 0 : 1;

    try {
        $where = ['d.activo = :activo'];
        $params = [':activo' => $activo];

        if ($busqueda !== '') {
            $where[] = '(d.docente LIKE :busqueda OR d.dni LIKE :busqueda OR d.email LIKE :busqueda OR cargo.cargo LIKE :busqueda OR d.motivo LIKE :busqueda OR m.materia LIKE :busqueda)';
            $params[':busqueda'] = '%' . $busqueda . '%';
        }

        $whereSql = implode(' AND ', $where);

        $sql = "\n            SELECT\n                d.id_docente,\n                d.id_docente AS ids_docentes_texto,\n                d.docente,\n                d.dni,\n                d.email,\n                d.activo,\n                COALESCE(d.motivo, '') AS observacion,\n                d.fecha_carga AS fecha_registro,\n                COALESCE(\n                    GROUP_CONCAT(DISTINCT cargo.cargo ORDER BY cargo.cargo SEPARATOR ', '),\n                    ''\n                ) AS cargo,\n                COUNT(DISTINCT cat.id_catedra) AS total_catedras,\n                COUNT(DISTINCT disp.id_disponibilidad) AS total_disponibilidades\n            FROM docentes d\n            LEFT JOIN catedras_docentes cd\n                ON cd.id_docente = d.id_docente\n               AND cd.activo = 1\n            LEFT JOIN catedras cat\n                ON cat.id_catedra = cd.id_catedra\n               AND cat.activo = 1\n            LEFT JOIN materias m\n                ON m.id_materia = cat.id_materia\n            LEFT JOIN cargos cargo\n                ON cargo.id_cargo = cd.id_cargo\n            LEFT JOIN docentes_disponibilidad disp\n                ON disp.id_docente = d.id_docente\n            WHERE {$whereSql}\n            GROUP BY\n                d.id_docente,\n                d.docente,\n                d.dni,\n                d.email,\n                d.activo,\n                d.motivo,\n                d.fecha_carga\n            ORDER BY d.docente ASC, d.id_docente ASC\n        ";

        $stmt = $pdo->prepare($sql);

        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }

        $stmt->execute();
        $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($filas as &$fila) {
            $fila['id_docente'] = (int)$fila['id_docente'];
            $fila['ids_docentes'] = [(int)$fila['id_docente']];
            $fila['cantidad_registros'] = 1;
            $fila['docente_normalizado'] = docentes_normalizar_nombre((string)$fila['docente']);
            $fila['dni'] = trim((string)($fila['dni'] ?? ''));
            $fila['email'] = trim((string)($fila['email'] ?? ''));
            $fila['gmail'] = $fila['email'];
            $fila['cargo'] = trim((string)($fila['cargo'] ?? '')) ?: 'Sin cátedras asignadas';
            $fila['total_catedras'] = (int)($fila['total_catedras'] ?? 0);
            $fila['total_disponibilidades'] = (int)($fila['total_disponibilidades'] ?? 0);
            $fila['total_indisponibilidades'] = 0;
        }
        unset($fila);

        $total = count($filas);
        $pagina = array_slice($filas, $pag['offset'], $pag['por_pagina']);

        json_response([
            'exito' => true,
            'data' => $pagina,
            'paginacion' => [
                'pagina' => $pag['pagina'],
                'por_pagina' => $pag['por_pagina'],
                'total' => $total,
                'paginas' => max(1, (int)ceil($total / $pag['por_pagina'])),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener los docentes.',
        ], 500);
    }
}

function docentes_obtener_base(PDO $pdo, int $idDocente): array
{
    $stmt = $pdo->prepare("\n        SELECT\n            d.id_docente,\n            d.id_docente AS ids_docentes_texto,\n            d.docente,\n            d.dni,\n            d.email,\n            d.activo,\n            COALESCE(d.motivo, '') AS observacion,\n            d.fecha_carga AS fecha_registro,\n            COALESCE(\n                GROUP_CONCAT(DISTINCT cargo.cargo ORDER BY cargo.cargo SEPARATOR ', '),\n                ''\n            ) AS cargo,\n            COUNT(DISTINCT cat.id_catedra) AS total_catedras\n        FROM docentes d\n        LEFT JOIN catedras_docentes cd\n            ON cd.id_docente = d.id_docente\n           AND cd.activo = 1\n        LEFT JOIN catedras cat\n            ON cat.id_catedra = cd.id_catedra\n           AND cat.activo = 1\n        LEFT JOIN cargos cargo\n            ON cargo.id_cargo = cd.id_cargo\n        WHERE d.id_docente = :id_docente\n        GROUP BY\n            d.id_docente,\n            d.docente,\n            d.dni,\n            d.email,\n            d.activo,\n            d.motivo,\n            d.fecha_carga\n        LIMIT 1\n    ");

    $stmt->execute([':id_docente' => $idDocente]);
    $docente = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$docente) {
        return [];
    }

    $docente['id_docente'] = (int)$docente['id_docente'];
    $docente['ids_docentes'] = [(int)$docente['id_docente']];
    $docente['cantidad_registros'] = 1;
    $docente['docente_normalizado'] = docentes_normalizar_nombre((string)$docente['docente']);
    $docente['dni'] = trim((string)($docente['dni'] ?? ''));
    $docente['email'] = trim((string)($docente['email'] ?? ''));
    $docente['gmail'] = $docente['email'];
    $docente['cargo'] = trim((string)($docente['cargo'] ?? '')) ?: 'Sin cátedras asignadas';

    return $docente;
}

function docentes_obtener(): void
{
    $pdo = db();
    $idDocente = docentes_int($_GET['id_docente'] ?? $_GET['id'] ?? 0);

    if ($idDocente <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'Debe seleccionar un docente válido.',
        ], 422);
    }

    try {
        $docente = docentes_obtener_base($pdo, $idDocente);

        if (!$docente) {
            json_response([
                'exito' => false,
                'mensaje' => 'El docente seleccionado no existe.',
            ], 404);
        }

        $stmtCatedras = $pdo->prepare("\n            SELECT\n                cd.id_catedra_docente,\n                cd.id_catedra,\n                cd.id_docente,\n                cd.id_cargo AS id_cargo_docente,\n                COALESCE(cargo.cargo, 'SIN CARGO') AS cargo_docente,\n                cat.id_curso,\n                cu.nombre_curso,\n                cat.id_division,\n                divi.nombre_division,\n                cat.id_materia,\n                m.materia\n            FROM catedras_docentes cd\n            INNER JOIN catedras cat\n                ON cat.id_catedra = cd.id_catedra\n               AND cat.activo = 1\n            INNER JOIN curso cu\n                ON cu.id_curso = cat.id_curso\n            INNER JOIN division divi\n                ON divi.id_division = cat.id_division\n            INNER JOIN materias m\n                ON m.id_materia = cat.id_materia\n            LEFT JOIN cargos cargo\n                ON cargo.id_cargo = cd.id_cargo\n            WHERE cd.id_docente = :id_docente\n              AND cd.activo = 1\n            ORDER BY\n                cu.id_curso ASC,\n                divi.nombre_division ASC,\n                cargo.cargo ASC,\n                m.materia ASC\n        ");

        $stmtCatedras->execute([':id_docente' => $idDocente]);
        $catedras = $stmtCatedras->fetchAll(PDO::FETCH_ASSOC);

        $stmtDisponibilidades = $pdo->prepare("\n            SELECT\n                disp.id_disponibilidad,\n                disp.dia_semana AS id_dia_semana,\n                CASE disp.dia_semana\n                    WHEN 1 THEN 'LUNES'\n                    WHEN 2 THEN 'MARTES'\n                    WHEN 3 THEN 'MIÉRCOLES'\n                    WHEN 4 THEN 'JUEVES'\n                    WHEN 5 THEN 'VIERNES'\n                    ELSE ''\n                END AS dia_semana,\n                disp.id_turno,\n                COALESCE(t.turno, '') AS turno,\n                disp.fecha\n            FROM docentes_disponibilidad disp\n            INNER JOIN turnos t\n                ON t.id_turno = disp.id_turno\n            WHERE disp.id_docente = :id_docente\n            ORDER BY\n                disp.dia_semana ASC,\n                t.id_turno ASC,\n                disp.fecha ASC\n        ");

        $stmtDisponibilidades->execute([':id_docente' => $idDocente]);
        $disponibilidades = $stmtDisponibilidades->fetchAll(PDO::FETCH_ASSOC);

        $docente['catedras'] = $catedras;
        $docente['disponibilidades'] = $disponibilidades;
        $docente['total_catedras'] = count($catedras);
        $docente['total_disponibilidades'] = count($disponibilidades);
        $docente['total_indisponibilidades'] = 0;

        json_response([
            'exito' => true,
            'data' => $docente,
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo obtener la información del docente.',
        ], 500);
    }
}

function docentes_guardar_disponibilidades(PDO $pdo, int $idDocente, array $disponibilidades): void
{
    $stmtDeleteDisponibilidades = $pdo->prepare("\n        DELETE FROM docentes_disponibilidad\n        WHERE id_docente = :id_docente\n    ");

    $stmtDeleteDisponibilidades->execute([':id_docente' => $idDocente]);

    $stmtTurno = $pdo->prepare("\n        SELECT id_turno\n        FROM turnos\n        WHERE id_turno = :id_turno\n          AND activo = 1\n        LIMIT 1\n    ");

    $stmtInsertDisponibilidad = $pdo->prepare("\n        INSERT IGNORE INTO docentes_disponibilidad\n            (id_docente, dia_semana, id_turno, fecha)\n        VALUES\n            (:id_docente, :dia_semana, :id_turno, :fecha)\n    ");

    $turnosActivos = docentes_obtener_turnos_activos($pdo);
    $disponibilidadesUnicas = [];

    foreach ($disponibilidades as $bloque) {
        if (!is_array($bloque)) {
            continue;
        }

        $fecha = docentes_validar_fecha($bloque['fecha'] ?? null);
        $diaSemana = docentes_validar_dia_semana($bloque['id_dia_semana'] ?? $bloque['dia_semana'] ?? null);
        $idTurno = docentes_int($bloque['id_turno'] ?? 0);

        // Si hay fecha puntual, el día semanal real se calcula desde esa fecha.
        // Esto evita que el frontend mande fecha sin día y el backend descarte la regla.
        if ($fecha !== null) {
            $diaDesdeFecha = docentes_dia_semana_desde_fecha($fecha);
            if ($diaDesdeFecha <= 0) {
                throw new InvalidArgumentException('La fecha puntual debe caer entre lunes y viernes.');
            }
            $diaSemana = $diaDesdeFecha;
        }

        $turnosParaGuardar = [];

        if ($idTurno > 0) {
            $turnosParaGuardar = [$idTurno];
        } elseif ($fecha !== null) {
            // Fecha sin turno: se guarda para todos los turnos activos de esa fecha.
            $turnosParaGuardar = $turnosActivos;
        }

        if ($fecha === null && $idTurno > 0 && $diaSemana <= 0) {
            // Turno sin día ni fecha: se interpreta como regla semanal para ese turno,
            // de lunes a viernes, porque la tabla no admite día nulo.
            $diasParaGuardar = [1, 2, 3, 4, 5];
        } else {
            $diasParaGuardar = $diaSemana > 0 ? [$diaSemana] : [];
        }

        if (!$turnosParaGuardar || !$diasParaGuardar) {
            continue;
        }

        foreach ($diasParaGuardar as $diaAGuardar) {
            foreach ($turnosParaGuardar as $turnoAGuardar) {
                $stmtTurno->execute([':id_turno' => $turnoAGuardar]);

                if (!$stmtTurno->fetch(PDO::FETCH_ASSOC)) {
                    continue;
                }

                $claveBloque = $diaAGuardar . '|' . $turnoAGuardar . '|' . ($fecha ?? '');

                if (isset($disponibilidadesUnicas[$claveBloque])) {
                    continue;
                }

                $disponibilidadesUnicas[$claveBloque] = true;

                $stmtInsertDisponibilidad->bindValue(':id_docente', $idDocente, PDO::PARAM_INT);
                $stmtInsertDisponibilidad->bindValue(':dia_semana', $diaAGuardar, PDO::PARAM_INT);
                $stmtInsertDisponibilidad->bindValue(':id_turno', $turnoAGuardar, PDO::PARAM_INT);

                if ($fecha !== null) {
                    $stmtInsertDisponibilidad->bindValue(':fecha', $fecha, PDO::PARAM_STR);
                } else {
                    $stmtInsertDisponibilidad->bindValue(':fecha', null, PDO::PARAM_NULL);
                }

                $stmtInsertDisponibilidad->execute();
            }
        }
    }
}

function docentes_guardar(): void
{
    $pdo = db();
    $body = docentes_body();

    $idDocente = docentes_int($body['id_docente'] ?? $body['id'] ?? 0);
    $docente = docentes_mayuscula((string)($body['docente'] ?? ''));
    $dni = docentes_normalizar_dni($body['dni'] ?? '');
    $email = docentes_normalizar_email($body['email'] ?? $body['gmail'] ?? '');
    $observacion = trim((string)($body['observacion'] ?? $body['comentarios'] ?? $body['comentario'] ?? $body['motivo'] ?? ''));
    $activo = docentes_int($body['activo'] ?? 1) === 0 ? 0 : 1;
    $disponibilidades = is_array($body['disponibilidades'] ?? null) ? $body['disponibilidades'] : [];

    if ($docente === '') {
        json_response([
            'exito' => false,
            'mensaje' => 'El nombre del docente es obligatorio.',
        ], 422);
    }

    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response([
            'exito' => false,
            'mensaje' => 'El email/Gmail ingresado no tiene un formato válido.',
        ], 422);
    }

    try {
        $stmtDuplicado = $pdo->prepare("\n            SELECT id_docente\n            FROM docentes\n            WHERE UPPER(TRIM(docente)) = UPPER(TRIM(:docente))\n              AND id_docente <> :id_docente\n            LIMIT 1\n        ");

        $stmtDuplicado->execute([
            ':docente' => $docente,
            ':id_docente' => $idDocente,
        ]);

        if ($stmtDuplicado->fetch(PDO::FETCH_ASSOC)) {
            json_response([
                'exito' => false,
                'mensaje' => 'Ya existe un docente cargado con ese nombre. Usá la ficha existente para editarlo.',
            ], 409);
        }

        $pdo->beginTransaction();

        if ($idDocente <= 0) {
            $stmt = $pdo->prepare("\n                INSERT INTO docentes\n                    (docente, dni, email, activo, motivo, fecha_carga)\n                VALUES\n                    (:docente, :dni, :email, :activo, :motivo, CURDATE())\n            ");

            $stmt->execute([
                ':docente' => $docente,
                ':dni' => $dni,
                ':email' => $email,
                ':activo' => $activo,
                ':motivo' => $observacion !== '' ? $observacion : null,
            ]);

            $idDocente = (int)$pdo->lastInsertId();
        } else {
            $stmtExiste = $pdo->prepare("\n                SELECT id_docente\n                FROM docentes\n                WHERE id_docente = :id_docente\n                LIMIT 1\n            ");

            $stmtExiste->execute([':id_docente' => $idDocente]);

            if (!$stmtExiste->fetch(PDO::FETCH_ASSOC)) {
                $pdo->rollBack();
                json_response([
                    'exito' => false,
                    'mensaje' => 'El docente seleccionado no existe.',
                ], 404);
            }

            $stmt = $pdo->prepare("\n                UPDATE docentes\n                SET\n                    docente = :docente,\n                    dni = :dni,\n                    email = :email,\n                    activo = :activo,\n                    motivo = :motivo\n                WHERE id_docente = :id_docente\n            ");

            $stmt->execute([
                ':docente' => $docente,
                ':dni' => $dni,
                ':email' => $email,
                ':activo' => $activo,
                ':motivo' => $observacion !== '' ? $observacion : null,
                ':id_docente' => $idDocente,
            ]);
        }

        docentes_guardar_disponibilidades($pdo, $idDocente, $disponibilidades);

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Docente guardado correctamente.',
            'id_docente' => $idDocente,
        ]);
    } catch (InvalidArgumentException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo guardar el docente.',
        ], 500);
    }
}

function docentes_cambiar_estado(): void
{
    $pdo = db();
    $body = docentes_body();

    $idsDocentes = docentes_ids_desde_body($body);
    $activo = docentes_int($body['activo'] ?? 1) === 0 ? 0 : 1;
    $motivo = trim((string)($body['motivo'] ?? $body['observacion'] ?? ''));

    if (empty($idsDocentes)) {
        json_response([
            'exito' => false,
            'mensaje' => 'Debe seleccionar un docente válido.',
        ], 422);
    }

    try {
        $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));

        if ($activo === 1) {
            $params = array_merge([$activo], $idsDocentes);

            $stmt = $pdo->prepare("\n                UPDATE docentes\n                SET activo = ?, motivo = NULL\n                WHERE id_docente IN ({$placeholders})\n            ");

            $stmt->execute($params);
        } else {
            $params = array_merge([$activo, $motivo !== '' ? $motivo : null], $idsDocentes);

            $stmt = $pdo->prepare("\n                UPDATE docentes\n                SET activo = ?, motivo = ?\n                WHERE id_docente IN ({$placeholders})\n            ");

            $stmt->execute($params);
        }

        json_response([
            'exito' => true,
            'mensaje' => $activo === 1
                ? 'Docente dado de alta correctamente.'
                : 'Docente dado de baja correctamente.',
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo cambiar el estado del docente.',
        ], 500);
    }
}

function docentes_contar_relaciones(PDO $pdo, string $tabla, string $columna, array $idsDocentes): int
{
    if (empty($idsDocentes)) {
        return 0;
    }

    $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));
    $stmt = $pdo->prepare("SELECT COUNT(*) AS total FROM {$tabla} WHERE {$columna} IN ({$placeholders})");
    $stmt->execute($idsDocentes);

    return (int)($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
}

function docentes_eliminar(): void
{
    $pdo = db();
    $body = docentes_body();
    $idsDocentes = docentes_ids_desde_body($body);

    if (empty($idsDocentes)) {
        json_response([
            'exito' => false,
            'mensaje' => 'Debe seleccionar un docente válido.',
        ], 422);
    }

    try {
        $totalMesas = docentes_contar_relaciones($pdo, 'mesas', 'id_docente', $idsDocentes);
        $totalCatedrasNueva = docentes_contar_relaciones($pdo, 'catedras_docentes', 'id_docente', $idsDocentes);
        $totalCatedrasLegacy = docentes_contar_relaciones($pdo, 'catedras', 'id_docente', $idsDocentes);

        if ($totalMesas > 0 || $totalCatedrasNueva > 0 || $totalCatedrasLegacy > 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede eliminar el docente porque tiene cátedras o mesas asociadas. Podés darlo de baja para conservar la información.',
            ], 409);
        }

        $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));

        $pdo->beginTransaction();

        $stmtDisponibilidad = $pdo->prepare("\n            DELETE FROM docentes_disponibilidad\n            WHERE id_docente IN ({$placeholders})\n        ");
        $stmtDisponibilidad->execute($idsDocentes);

        $stmtBloques = $pdo->prepare("\n            DELETE FROM docentes_bloques_no\n            WHERE id_docente IN ({$placeholders})\n        ");
        $stmtBloques->execute($idsDocentes);

        $stmtDocentes = $pdo->prepare("\n            DELETE FROM docentes\n            WHERE id_docente IN ({$placeholders})\n        ");
        $stmtDocentes->execute($idsDocentes);

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Docente eliminado correctamente.',
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo eliminar el docente.',
        ], 500);
    }
}
