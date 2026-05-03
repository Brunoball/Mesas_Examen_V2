<?php
// backend/modules/docentes/docentes_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function docentes_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function docentes_string($value): string
{
    return trim((string)$value);
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
    $texto = mb_strtoupper(trim($texto), 'UTF-8');

    $texto = strtr($texto, [
        'Á' => 'A',
        'É' => 'E',
        'Í' => 'I',
        'Ó' => 'O',
        'Ú' => 'U',
        'À' => 'A',
        'È' => 'E',
        'Ì' => 'I',
        'Ò' => 'O',
        'Ù' => 'U',
        'Ä' => 'A',
        'Ë' => 'E',
        'Ï' => 'I',
        'Ö' => 'O',
        'Ü' => 'U',
        'Â' => 'A',
        'Ê' => 'E',
        'Î' => 'I',
        'Ô' => 'O',
        'Û' => 'U',
        'Ñ' => 'N',
    ]);

    $texto = preg_replace('/\s+/', ' ', $texto) ?? $texto;

    return $texto;
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

    $ids = array_filter($ids);
    $ids = array_values(array_unique($ids));

    return $ids;
}

function docentes_validar_fecha($fecha): ?string
{
    $fecha = trim((string)$fecha);

    if ($fecha === '') {
        return null;
    }

    $dt = DateTime::createFromFormat('Y-m-d', $fecha);

    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        return null;
    }

    return $fecha;
}

function docentes_catalogos(): void
{
    $pdo = db();

    try {
        $cargos = $pdo->query("
            SELECT 
                id_cargo, 
                cargo
            FROM cargos
            WHERE activo = 1
            ORDER BY cargo ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $turnos = $pdo->query("
            SELECT 
                id_turno, 
                turno
            FROM turnos
            WHERE activo = 1
            ORDER BY id_turno ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        json_response([
            'exito' => true,
            'data' => [
                'cargos' => $cargos,
                'turnos' => $turnos,
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

function docentes_armar_grupos(array $filas): array
{
    $grupos = [];

    foreach ($filas as $fila) {
        $clave = docentes_normalizar_nombre((string)($fila['docente'] ?? ''));

        if ($clave === '') {
            $clave = 'DOCENTE_' . (string)($fila['id_docente'] ?? '');
        }

        if (!isset($grupos[$clave])) {
            $grupos[$clave] = [
                'id_docente' => (int)($fila['id_docente'] ?? 0),
                'ids_docentes' => [],
                'ids_docentes_texto' => '',
                'docente' => (string)($fila['docente'] ?? ''),
                'docente_normalizado' => $clave,
                'id_cargo' => (int)($fila['id_cargo'] ?? 0),
                'cargo' => (string)($fila['cargo'] ?? ''),
                'cargos' => [],
                'activo' => (int)($fila['activo'] ?? 1),
                'observacion' => (string)($fila['observacion'] ?? ''),
                'observaciones' => [],
                'fecha_registro' => (string)($fila['fecha_registro'] ?? ''),
                'cantidad_registros' => 0,
                'total_catedras' => 0,
                'total_indisponibilidades' => 0,
            ];
        }

        $idDocente = (int)($fila['id_docente'] ?? 0);

        if ($idDocente > 0) {
            $grupos[$clave]['ids_docentes'][] = $idDocente;

            if ((int)$grupos[$clave]['id_docente'] <= 0) {
                $grupos[$clave]['id_docente'] = $idDocente;
            } else {
                $grupos[$clave]['id_docente'] = min((int)$grupos[$clave]['id_docente'], $idDocente);
            }
        }

        $grupos[$clave]['cantidad_registros']++;
        $grupos[$clave]['total_catedras'] += (int)($fila['total_catedras'] ?? 0);
        $grupos[$clave]['total_indisponibilidades'] += (int)($fila['total_indisponibilidades'] ?? 0);

        if (!empty($fila['cargo'])) {
            $grupos[$clave]['cargos'][(string)$fila['cargo']] = true;
        }

        if (!empty($fila['observacion'])) {
            $grupos[$clave]['observaciones'][(string)$fila['observacion']] = true;
        }

        if (
            mb_strlen((string)($fila['docente'] ?? ''), 'UTF-8') >
            mb_strlen((string)$grupos[$clave]['docente'], 'UTF-8')
        ) {
            $grupos[$clave]['docente'] = (string)$fila['docente'];
        }
    }

    $resultado = [];

    foreach ($grupos as $grupo) {
        sort($grupo['ids_docentes'], SORT_NUMERIC);

        $grupo['ids_docentes_texto'] = implode(',', $grupo['ids_docentes']);
        $grupo['cargo'] = implode(', ', array_keys($grupo['cargos']));
        $grupo['observacion'] = implode(' | ', array_keys($grupo['observaciones']));

        unset($grupo['cargos'], $grupo['observaciones']);

        $resultado[] = $grupo;
    }

    usort($resultado, static function ($a, $b) {
        return strnatcasecmp((string)$a['docente'], (string)$b['docente']);
    });

    return $resultado;
}

function docentes_listar(): void
{
    $pdo = db();
    $pag = docentes_paginacion();

    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $activo = docentes_int($_GET['activo'] ?? 1) === 0 ? 0 : 1;

    try {
        $where = ['d.activo = :activo'];

        $params = [
            ':activo' => $activo,
        ];

        if ($busqueda !== '') {
            $where[] = '(d.docente LIKE :busqueda OR cargo.cargo LIKE :busqueda OR d.motivo LIKE :busqueda)';
            $params[':busqueda'] = '%' . $busqueda . '%';
        }

        $whereSql = implode(' AND ', $where);

        $sql = "
            SELECT
                d.id_docente,
                d.docente,
                d.id_cargo,
                COALESCE(cargo.cargo, '') AS cargo,
                d.activo,
                COALESCE(d.motivo, '') AS observacion,
                d.fecha_carga AS fecha_registro,
                COUNT(DISTINCT cat.id_catedra) AS total_catedras,
                COUNT(DISTINCT bloq.id_no) AS total_indisponibilidades
            FROM docentes d
            LEFT JOIN cargos cargo 
                ON cargo.id_cargo = d.id_cargo
            LEFT JOIN catedras cat 
                ON cat.id_docente = d.id_docente
               AND cat.activo = 1
            LEFT JOIN docentes_bloques_no bloq 
                ON bloq.id_docente = d.id_docente
            WHERE {$whereSql}
            GROUP BY
                d.id_docente,
                d.docente,
                d.id_cargo,
                cargo.cargo,
                d.activo,
                d.motivo,
                d.fecha_carga
            ORDER BY 
                d.docente ASC,
                d.id_docente ASC
        ";

        $stmt = $pdo->prepare($sql);

        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }

        $stmt->execute();

        $grupos = docentes_armar_grupos($stmt->fetchAll(PDO::FETCH_ASSOC));

        $total = count($grupos);
        $pagina = array_slice($grupos, $pag['offset'], $pag['por_pagina']);

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

function docentes_obtener_grupo_por_id(PDO $pdo, int $idDocente): array
{
    $stmt = $pdo->prepare("
        SELECT 
            id_docente, 
            docente, 
            activo
        FROM docentes
        WHERE id_docente = :id_docente
        LIMIT 1
    ");

    $stmt->execute([
        ':id_docente' => $idDocente,
    ]);

    $base = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$base) {
        return [];
    }

    $clave = docentes_normalizar_nombre((string)$base['docente']);
    $activo = (int)$base['activo'];

    $stmtTodos = $pdo->prepare("
        SELECT
            d.id_docente,
            d.docente,
            d.id_cargo,
            COALESCE(cargo.cargo, '') AS cargo,
            d.activo,
            COALESCE(d.motivo, '') AS observacion,
            d.fecha_carga AS fecha_registro,
            0 AS total_catedras,
            0 AS total_indisponibilidades
        FROM docentes d
        LEFT JOIN cargos cargo 
            ON cargo.id_cargo = d.id_cargo
        WHERE d.activo = :activo
        ORDER BY 
            d.docente ASC,
            d.id_docente ASC
    ");

    $stmtTodos->execute([
        ':activo' => $activo,
    ]);

    $coincidentes = [];

    foreach ($stmtTodos->fetchAll(PDO::FETCH_ASSOC) as $fila) {
        if (docentes_normalizar_nombre((string)$fila['docente']) === $clave) {
            $coincidentes[] = $fila;
        }
    }

    $grupos = docentes_armar_grupos($coincidentes);

    return $grupos[0] ?? [];
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
        $docente = docentes_obtener_grupo_por_id($pdo, $idDocente);

        if (!$docente) {
            json_response([
                'exito' => false,
                'mensaje' => 'El docente seleccionado no existe.',
            ], 404);
        }

        $ids = $docente['ids_docentes'];

        if (empty($ids)) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se pudieron resolver los registros del docente.',
            ], 422);
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        $stmtCatedras = $pdo->prepare("
            SELECT
                cat.id_catedra,
                cat.id_curso,
                cu.nombre_curso,
                cat.id_division,
                divi.nombre_division,
                cat.id_materia,
                m.materia,
                cat.id_docente
            FROM catedras cat
            INNER JOIN curso cu 
                ON cu.id_curso = cat.id_curso
            INNER JOIN division divi 
                ON divi.id_division = cat.id_division
            INNER JOIN materias m 
                ON m.id_materia = cat.id_materia
            WHERE cat.activo = 1
              AND cat.id_docente IN ({$placeholders})
            ORDER BY 
                cu.id_curso ASC,
                divi.nombre_division ASC,
                m.materia ASC
        ");

        $stmtCatedras->execute($ids);
        $catedras = $stmtCatedras->fetchAll(PDO::FETCH_ASSOC);

        $stmtBloques = $pdo->prepare("
            SELECT
                MIN(b.id_no) AS id_no,
                b.fecha,
                b.id_turno,
                COALESCE(t.turno, 'TODOS') AS turno
            FROM docentes_bloques_no b
            LEFT JOIN turnos t 
                ON t.id_turno = b.id_turno
            WHERE b.id_docente IN ({$placeholders})
            GROUP BY 
                b.fecha,
                b.id_turno,
                t.turno
            ORDER BY 
                b.fecha ASC,
                COALESCE(t.id_turno, 0) ASC
        ");

        $stmtBloques->execute($ids);
        $bloques = $stmtBloques->fetchAll(PDO::FETCH_ASSOC);

        $docente['catedras'] = $catedras;
        $docente['indisponibilidades'] = $bloques;
        $docente['total_catedras'] = count($catedras);
        $docente['total_indisponibilidades'] = count($bloques);

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

function docentes_guardar(): void
{
    $pdo = db();
    $body = docentes_body();

    $idDocente = docentes_int($body['id_docente'] ?? $body['id'] ?? 0);
    $idsDocentes = docentes_ids_desde_body($body);

    $docente = docentes_mayuscula((string)($body['docente'] ?? ''));

    $idCargo = docentes_int($body['id_cargo'] ?? 0);

    $observacion = trim((string)($body['observacion'] ?? $body['motivo'] ?? ''));

    $activo = docentes_int($body['activo'] ?? 1) === 0 ? 0 : 1;

    $indisponibilidades = is_array($body['indisponibilidades'] ?? null)
        ? $body['indisponibilidades']
        : [];

    if ($docente === '') {
        json_response([
            'exito' => false,
            'mensaje' => 'El nombre del docente es obligatorio.',
        ], 422);
    }

    if ($idCargo <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'Debe seleccionar un cargo válido.',
        ], 422);
    }

    try {
        $stmtCargo = $pdo->prepare("
            SELECT id_cargo
            FROM cargos
            WHERE id_cargo = :id_cargo
              AND activo = 1
            LIMIT 1
        ");

        $stmtCargo->execute([
            ':id_cargo' => $idCargo,
        ]);

        if (!$stmtCargo->fetch(PDO::FETCH_ASSOC)) {
            json_response([
                'exito' => false,
                'mensaje' => 'El cargo seleccionado no existe o está inactivo.',
            ], 422);
        }

        $pdo->beginTransaction();

        if ($idDocente <= 0 && empty($idsDocentes)) {
            $stmt = $pdo->prepare("
                INSERT INTO docentes 
                    (docente, id_cargo, activo, motivo, fecha_carga)
                VALUES 
                    (:docente, :id_cargo, :activo, :motivo, CURDATE())
            ");

            $stmt->execute([
                ':docente' => $docente,
                ':id_cargo' => $idCargo,
                ':activo' => $activo,
                ':motivo' => $observacion !== '' ? $observacion : null,
            ]);

            $idsDocentes = [(int)$pdo->lastInsertId()];
            $idDocente = $idsDocentes[0];
        } else {
            if (empty($idsDocentes)) {
                $idsDocentes = [$idDocente];
            }

            $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));

            $params = array_merge(
                [
                    $docente,
                    $idCargo,
                    $activo,
                    $observacion !== '' ? $observacion : null,
                ],
                $idsDocentes
            );

            $stmt = $pdo->prepare("
                UPDATE docentes
                SET 
                    docente = ?,
                    id_cargo = ?,
                    activo = ?,
                    motivo = ?
                WHERE id_docente IN ({$placeholders})
            ");

            $stmt->execute($params);

            $idDocente = min($idsDocentes);
        }

        $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));

        $stmtDeleteBloques = $pdo->prepare("
            DELETE FROM docentes_bloques_no
            WHERE id_docente IN ({$placeholders})
        ");

        $stmtDeleteBloques->execute($idsDocentes);

        $stmtTurno = $pdo->prepare("
            SELECT id_turno
            FROM turnos
            WHERE id_turno = :id_turno
              AND activo = 1
            LIMIT 1
        ");

        $stmtInsertBloque = $pdo->prepare("
            INSERT IGNORE INTO docentes_bloques_no 
                (id_docente, id_turno, fecha)
            VALUES 
                (:id_docente, :id_turno, :fecha)
        ");

        $bloquesUnicos = [];

        foreach ($indisponibilidades as $bloque) {
            if (!is_array($bloque)) {
                continue;
            }

            $fecha = docentes_validar_fecha($bloque['fecha'] ?? null);
            $idTurno = docentes_int($bloque['id_turno'] ?? 0);

            if ($fecha === null) {
                continue;
            }

            $claveBloque = $fecha . '|' . $idTurno;

            if (isset($bloquesUnicos[$claveBloque])) {
                continue;
            }

            $bloquesUnicos[$claveBloque] = true;

            if ($idTurno > 0) {
                $stmtTurno->execute([
                    ':id_turno' => $idTurno,
                ]);

                if (!$stmtTurno->fetch(PDO::FETCH_ASSOC)) {
                    continue;
                }
            }

            foreach ($idsDocentes as $idDocenteBloque) {
                $stmtInsertBloque->bindValue(':id_docente', $idDocenteBloque, PDO::PARAM_INT);

                if ($idTurno > 0) {
                    $stmtInsertBloque->bindValue(':id_turno', $idTurno, PDO::PARAM_INT);
                } else {
                    $stmtInsertBloque->bindValue(':id_turno', null, PDO::PARAM_NULL);
                }

                $stmtInsertBloque->bindValue(':fecha', $fecha, PDO::PARAM_STR);
                $stmtInsertBloque->execute();
            }
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Docente guardado correctamente.',
            'id_docente' => $idDocente,
        ]);
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

            $stmt = $pdo->prepare("
                UPDATE docentes
                SET 
                    activo = ?,
                    motivo = NULL
                WHERE id_docente IN ({$placeholders})
            ");

            $stmt->execute($params);
        } else {
            $params = array_merge(
                [
                    $activo,
                    $motivo !== '' ? $motivo : null,
                ],
                $idsDocentes
            );

            $stmt = $pdo->prepare("
                UPDATE docentes
                SET 
                    activo = ?,
                    motivo = ?
                WHERE id_docente IN ({$placeholders})
            ");

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
        $placeholders = implode(',', array_fill(0, count($idsDocentes), '?'));

        $stmtMesas = $pdo->prepare("
            SELECT COUNT(*) AS total
            FROM mesas
            WHERE id_docente IN ({$placeholders})
        ");

        $stmtMesas->execute($idsDocentes);

        $totalMesas = (int)($stmtMesas->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

        if ($totalMesas > 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede eliminar el docente porque tiene mesas asociadas. Podés darlo de baja para conservar el historial.',
            ], 409);
        }

        $pdo->beginTransaction();

        $stmtBloques = $pdo->prepare("
            DELETE FROM docentes_bloques_no
            WHERE id_docente IN ({$placeholders})
        ");

        $stmtBloques->execute($idsDocentes);

        $stmtDocentes = $pdo->prepare("
            DELETE FROM docentes
            WHERE id_docente IN ({$placeholders})
        ");

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