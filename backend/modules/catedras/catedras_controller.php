<?php
// backend/modules/catedras/catedras_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function catedras_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function catedras_paginacion(): array
{
    $pagina = max(1, catedras_int($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(1, catedras_int($_GET['por_pagina'] ?? 20)));

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => ($pagina - 1) * $porPagina,
    ];
}

function catedras_catalogos(): void
{
    $pdo = db();

    try {
        $docentes = $pdo->query("\n            SELECT\n                d.id_docente,\n                d.docente,\n                d.id_cargo,\n                COALESCE(c.cargo, '') AS cargo\n            FROM docentes d\n            LEFT JOIN cargos c ON c.id_cargo = d.id_cargo\n            WHERE d.activo = 1\n            ORDER BY d.docente ASC, d.id_docente ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $cursos = $pdo->query("\n            SELECT id_curso, nombre_curso\n            FROM curso\n            WHERE activo = 1\n            ORDER BY id_curso ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $divisiones = $pdo->query("\n            SELECT id_division, nombre_division\n            FROM division\n            WHERE activo = 1\n            ORDER BY nombre_division ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        json_response([
            'exito' => true,
            'data' => [
                'docentes' => $docentes,
                'cursos' => $cursos,
                'divisiones' => $divisiones,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener los catálogos de cátedras.',
        ], 500);
    }
}

function catedras_listar(): void
{
    $pdo = db();
    $pag = catedras_paginacion();

    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $idCurso = catedras_int($_GET['id_curso'] ?? 0);
    $idDivision = catedras_int($_GET['id_division'] ?? 0);
    $idDocente = catedras_int($_GET['id_docente'] ?? 0);
    $sinDocente = catedras_int($_GET['sin_docente'] ?? 0) === 1;

    $where = ['cat.activo = 1'];
    $params = [];

    if ($idCurso > 0) {
        $where[] = 'cat.id_curso = :id_curso';
        $params[':id_curso'] = $idCurso;
    }

    if ($idDivision > 0) {
        $where[] = 'cat.id_division = :id_division';
        $params[':id_division'] = $idDivision;
    }

    if ($idDocente > 0) {
        $where[] = 'cat.id_docente = :id_docente';
        $params[':id_docente'] = $idDocente;
    }

    if ($sinDocente) {
        $where[] = 'cat.id_docente IS NULL';
    }

    if ($busqueda !== '') {
        $where[] = '(m.materia LIKE :busqueda OR d.docente LIKE :busqueda OR cu.nombre_curso LIKE :busqueda OR divi.nombre_division LIKE :busqueda)';
        $params[':busqueda'] = '%' . $busqueda . '%';
    }

    $whereSql = implode(' AND ', $where);

    try {
        $countSql = "\n            SELECT COUNT(*)\n            FROM catedras cat\n            INNER JOIN curso cu ON cu.id_curso = cat.id_curso\n            INNER JOIN division divi ON divi.id_division = cat.id_division\n            INNER JOIN materias m ON m.id_materia = cat.id_materia\n            LEFT JOIN docentes d ON d.id_docente = cat.id_docente\n            WHERE {$whereSql}\n        ";

        $stmtCount = $pdo->prepare($countSql);
        foreach ($params as $key => $value) {
            $stmtCount->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        $sql = "\n            SELECT\n                cat.id_catedra,\n                cat.id_curso,\n                cu.nombre_curso,\n                cat.id_division,\n                divi.nombre_division,\n                cat.id_materia,\n                m.materia,\n                cat.id_docente,\n                COALESCE(d.docente, '') AS docente,\n                COALESCE(cargo.cargo, '') AS cargo_docente,\n                cat.activo,\n                cat.creado_en\n            FROM catedras cat\n            INNER JOIN curso cu ON cu.id_curso = cat.id_curso\n            INNER JOIN division divi ON divi.id_division = cat.id_division\n            INNER JOIN materias m ON m.id_materia = cat.id_materia\n            LEFT JOIN docentes d ON d.id_docente = cat.id_docente\n            LEFT JOIN cargos cargo ON cargo.id_cargo = d.id_cargo\n            WHERE {$whereSql}\n            ORDER BY cu.id_curso ASC, divi.nombre_division ASC, m.materia ASC\n            LIMIT :limit OFFSET :offset\n        ";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $pag['por_pagina'], PDO::PARAM_INT);
        $stmt->bindValue(':offset', $pag['offset'], PDO::PARAM_INT);
        $stmt->execute();

        json_response([
            'exito' => true,
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
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
            'mensaje' => 'No se pudieron obtener las cátedras.',
        ], 500);
    }
}

function catedras_asignar_docente(): void
{
    $pdo = db();
    $body = get_json_body();

    $idCatedra = catedras_int($body['id_catedra'] ?? 0);
    $idDocente = catedras_int($body['id_docente'] ?? 0);

    if ($idCatedra <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'La cátedra seleccionada no es válida.',
        ], 422);
    }

    try {
        $stmtCat = $pdo->prepare('SELECT id_catedra FROM catedras WHERE id_catedra = :id_catedra AND activo = 1 LIMIT 1');
        $stmtCat->execute([':id_catedra' => $idCatedra]);

        if (!$stmtCat->fetch(PDO::FETCH_ASSOC)) {
            json_response([
                'exito' => false,
                'mensaje' => 'La cátedra no existe o está inactiva.',
            ], 404);
        }

        if ($idDocente > 0) {
            $stmtDoc = $pdo->prepare('SELECT id_docente FROM docentes WHERE id_docente = :id_docente AND activo = 1 LIMIT 1');
            $stmtDoc->execute([':id_docente' => $idDocente]);

            if (!$stmtDoc->fetch(PDO::FETCH_ASSOC)) {
                json_response([
                    'exito' => false,
                    'mensaje' => 'El docente seleccionado no existe o está inactivo.',
                ], 422);
            }
        }

        $stmt = $pdo->prepare('UPDATE catedras SET id_docente = :id_docente WHERE id_catedra = :id_catedra');
        if ($idDocente > 0) {
            $stmt->bindValue(':id_docente', $idDocente, PDO::PARAM_INT);
        } else {
            $stmt->bindValue(':id_docente', null, PDO::PARAM_NULL);
        }
        $stmt->bindValue(':id_catedra', $idCatedra, PDO::PARAM_INT);
        $stmt->execute();

        json_response([
            'exito' => true,
            'mensaje' => $idDocente > 0 ? 'Docente asignado correctamente.' : 'Docente quitado correctamente.',
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo asignar el docente.',
        ], 500);
    }
}
