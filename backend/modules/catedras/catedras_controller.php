<?php
// backend/modules/catedras/catedras_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

// El helper de avisos de mesas es opcional para que Cátedras no se rompa
// si todavía no se copió la carpeta nueva al servidor.
$__catedrasCambiosDocentesHelper = __DIR__ . '/../mesas/docentes_cambios/docentes_cambios_helpers.php';
if (is_file($__catedrasCambiosDocentesHelper)) {
    require_once $__catedrasCambiosDocentesHelper;
}
unset($__catedrasCambiosDocentesHelper);

function catedras_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function catedras_paginacion(): array
{
    $pagina = max(1, catedras_int($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(1, catedras_int($_GET['por_pagina'] ?? 100)));

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => ($pagina - 1) * $porPagina,
    ];
}

/**
 * Subquery reutilizable para tomar una sola asignación activa por cátedra.
 *
 * La estructura nueva guarda el cargo en catedras_docentes. Por ahora el módulo
 * Cátedras maneja una asignación principal por cátedra. Si en el futuro se
 * permiten titular + suplente simultáneos, este listado se puede ampliar para
 * mostrar varias filas o un detalle agrupado.
 */
function catedras_sql_asignacion_principal(): string
{
    return "
        LEFT JOIN (
            SELECT cd.*
            FROM catedras_docentes cd
            INNER JOIN (
                SELECT id_catedra, MIN(id_catedra_docente) AS id_catedra_docente
                FROM catedras_docentes
                WHERE activo = 1
                GROUP BY id_catedra
            ) cd_min ON cd_min.id_catedra_docente = cd.id_catedra_docente
        ) cd ON cd.id_catedra = cat.id_catedra
    ";
}

/**
 * Registra un aviso pendiente cuando se cambia el docente de una cátedra
 * que ya forma parte de una mesa armada.
 *
 * Se usa un wrapper local para evitar errores si el helper de Mesas todavía
 * no fue copiado y para que el módulo Cátedras no dependa fuerte del módulo Mesas.
 */
function catedras_registrar_cambio_docente_en_mesas(PDO $pdo, int $idCatedra, ?int $idDocenteAnterior, ?int $idDocenteNuevo): int
{
    $funcion = 'mesas_docentes_cambios_registrar_catedra_actualizada';

    if (!function_exists($funcion)) {
        $helper = __DIR__ . '/../mesas/docentes_cambios/docentes_cambios_helpers.php';
        if (is_file($helper)) {
            require_once $helper;
        }
    }

    if (!function_exists($funcion)) {
        if (function_exists('log_error')) {
            log_error(
                new RuntimeException('No se encontró docentes_cambios_helpers.php para registrar cambios pendientes de docente en mesas.'),
                'catedras_registrar_cambio_docente_en_mesas_helper_faltante'
            );
        }
        return 0;
    }

    /** @var callable $callable */
    $callable = $funcion;
    return (int)$callable($pdo, $idCatedra, $idDocenteAnterior, $idDocenteNuevo);
}

function catedras_catalogos(): void
{
    $pdo = db();

    try {
        // Docentes ahora representa persona única. El cargo no se toma desde docentes,
        // se elige por cátedra y se guarda en catedras_docentes.
        $docentes = $pdo->query("\n            SELECT\n                d.id_docente,\n                d.docente,\n                d.activo\n            FROM docentes d\n            WHERE d.activo = 1\n            ORDER BY d.docente ASC, d.id_docente ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $cargos = $pdo->query("\n            SELECT id_cargo, cargo\n            FROM cargos\n            WHERE activo = 1\n            ORDER BY id_cargo ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $cursos = $pdo->query("\n            SELECT id_curso, nombre_curso\n            FROM curso\n            WHERE activo = 1\n            ORDER BY id_curso ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $divisiones = $pdo->query("\n            SELECT id_division, nombre_division\n            FROM division\n            WHERE activo = 1\n            ORDER BY nombre_division ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        json_response([
            'exito' => true,
            'data' => [
                'docentes' => $docentes,
                'cargos' => $cargos,
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
        $where[] = 'COALESCE(cd.id_docente, cat.id_docente) = :id_docente';
        $params[':id_docente'] = $idDocente;
    }

    if ($sinDocente) {
        $where[] = 'COALESCE(cd.id_docente, cat.id_docente) IS NULL';
    }

    if ($busqueda !== '') {
        /*
         * IMPORTANTE:
         * No se reutiliza el mismo placeholder (:busqueda) varias veces en el OR.
         * En varias configuraciones PDO/MySQL eso genera SQLSTATE[HY093] / 500
         * cuando se busca, aunque el listado sin búsqueda funcione.
         */
        $whereBusqueda = [
            'm.materia LIKE :busqueda_materia',
            "COALESCE(d.docente, '') LIKE :busqueda_docente",
            "COALESCE(cargo.cargo, '') LIKE :busqueda_cargo",
            'cu.nombre_curso LIKE :busqueda_curso',
            'divi.nombre_division LIKE :busqueda_division',
        ];

        $likeBusqueda = '%' . $busqueda . '%';
        $params[':busqueda_materia'] = $likeBusqueda;
        $params[':busqueda_docente'] = $likeBusqueda;
        $params[':busqueda_cargo'] = $likeBusqueda;
        $params[':busqueda_curso'] = $likeBusqueda;
        $params[':busqueda_division'] = $likeBusqueda;

        if (is_numeric($busqueda)) {
            $whereBusqueda[] = 'cat.id_catedra = :busqueda_id_catedra';
            $params[':busqueda_id_catedra'] = (int)$busqueda;
        }

        $where[] = '(' . implode(' OR ', $whereBusqueda) . ')';
    }

    $whereSql = implode(' AND ', $where);
    $joinAsignacion = catedras_sql_asignacion_principal();

    try {
        $countSql = "\n            SELECT COUNT(DISTINCT cat.id_catedra)\n            FROM catedras cat\n            INNER JOIN curso cu ON cu.id_curso = cat.id_curso\n            INNER JOIN division divi ON divi.id_division = cat.id_division\n            INNER JOIN materias m ON m.id_materia = cat.id_materia\n            {$joinAsignacion}\n            LEFT JOIN docentes d ON d.id_docente = COALESCE(cd.id_docente, cat.id_docente)\n            LEFT JOIN cargos cargo ON cargo.id_cargo = COALESCE(cd.id_cargo, d.id_cargo)\n            WHERE {$whereSql}\n        ";

        $stmtCount = $pdo->prepare($countSql);
        foreach ($params as $key => $value) {
            $stmtCount->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        $sql = "\n            SELECT\n                cat.id_catedra,\n                cat.id_curso,\n                cu.nombre_curso,\n                cat.id_division,\n                divi.nombre_division,\n                cat.id_materia,\n                m.materia,\n                cd.id_catedra_docente,\n                COALESCE(cd.id_docente, cat.id_docente) AS id_docente,\n                COALESCE(cd.id_cargo, d.id_cargo) AS id_cargo,\n                COALESCE(d.docente, '') AS docente,\n                COALESCE(cargo.cargo, '') AS cargo_docente,\n                COALESCE(cargo.cargo, '') AS cargo,\n                cat.activo,\n                cat.creado_en\n            FROM catedras cat\n            INNER JOIN curso cu ON cu.id_curso = cat.id_curso\n            INNER JOIN division divi ON divi.id_division = cat.id_division\n            INNER JOIN materias m ON m.id_materia = cat.id_materia\n            {$joinAsignacion}\n            LEFT JOIN docentes d ON d.id_docente = COALESCE(cd.id_docente, cat.id_docente)\n            LEFT JOIN cargos cargo ON cargo.id_cargo = COALESCE(cd.id_cargo, d.id_cargo)\n            WHERE {$whereSql}\n            ORDER BY cu.id_curso ASC, divi.nombre_division ASC, m.materia ASC\n            LIMIT :limit OFFSET :offset\n        ";

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
    $idCargo = catedras_int($body['id_cargo'] ?? 0);

    if ($idCatedra <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'La cátedra seleccionada no es válida.',
        ], 422);
    }

    try {
        $pdo->beginTransaction();

        $stmtCat = $pdo->prepare("\n            SELECT\n                cat.id_catedra,\n                cat.id_docente AS id_docente_legacy,\n                cd.id_docente AS id_docente_asignado,\n                cd.id_cargo AS id_cargo_asignado\n            FROM catedras cat\n            LEFT JOIN (\n                SELECT cd1.*\n                FROM catedras_docentes cd1\n                INNER JOIN (\n                    SELECT id_catedra, MIN(id_catedra_docente) AS id_catedra_docente\n                    FROM catedras_docentes\n                    WHERE activo = 1\n                    GROUP BY id_catedra\n                ) cd_min ON cd_min.id_catedra_docente = cd1.id_catedra_docente\n            ) cd ON cd.id_catedra = cat.id_catedra\n            WHERE cat.id_catedra = :id_catedra AND cat.activo = 1\n            LIMIT 1\n        ");
        $stmtCat->execute([':id_catedra' => $idCatedra]);
        $catedraActual = $stmtCat->fetch(PDO::FETCH_ASSOC);

        if (!$catedraActual) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'La cátedra no existe o está inactiva.',
            ], 404);
        }

        $idDocenteAnterior = isset($catedraActual['id_docente_asignado']) && $catedraActual['id_docente_asignado'] !== null
            ? (int)$catedraActual['id_docente_asignado']
            : (isset($catedraActual['id_docente_legacy']) && $catedraActual['id_docente_legacy'] !== null
                ? (int)$catedraActual['id_docente_legacy']
                : null);

        $idDocenteNuevo = $idDocente > 0 ? $idDocente : null;

        if ($idDocente > 0) {
            $stmtDoc = $pdo->prepare('SELECT id_docente, id_cargo FROM docentes WHERE id_docente = :id_docente AND activo = 1 LIMIT 1');
            $stmtDoc->execute([':id_docente' => $idDocente]);
            $docenteSeleccionado = $stmtDoc->fetch(PDO::FETCH_ASSOC);

            if (!$docenteSeleccionado) {
                $pdo->rollBack();
                json_response([
                    'exito' => false,
                    'mensaje' => 'El docente seleccionado no existe o está inactivo.',
                ], 422);
            }

            // Compatibilidad: si por algún motivo el frontend viejo no manda id_cargo,
            // se intenta conservar el cargo actual; si no existe, se usa el legado del docente
            // y finalmente el primer cargo activo.
            if ($idCargo <= 0) {
                $idCargo = catedras_int($catedraActual['id_cargo_asignado'] ?? 0);
            }
            if ($idCargo <= 0) {
                $idCargo = catedras_int($docenteSeleccionado['id_cargo'] ?? 0);
            }
            if ($idCargo <= 0) {
                $idCargo = (int)$pdo->query('SELECT MIN(id_cargo) FROM cargos WHERE activo = 1')->fetchColumn();
            }

            $stmtCargo = $pdo->prepare('SELECT id_cargo FROM cargos WHERE id_cargo = :id_cargo AND activo = 1 LIMIT 1');
            $stmtCargo->execute([':id_cargo' => $idCargo]);

            if (!$stmtCargo->fetch(PDO::FETCH_ASSOC)) {
                $pdo->rollBack();
                json_response([
                    'exito' => false,
                    'mensaje' => 'El cargo seleccionado no existe o está inactivo.',
                ], 422);
            }
        }

        // Compatibilidad con módulos todavía no migrados: catedras.id_docente sigue reflejando
        // el docente principal. El cargo real queda guardado en catedras_docentes.
        $stmtUpdateCat = $pdo->prepare('UPDATE catedras SET id_docente = :id_docente WHERE id_catedra = :id_catedra');
        if ($idDocente > 0) {
            $stmtUpdateCat->bindValue(':id_docente', $idDocente, PDO::PARAM_INT);
        } else {
            $stmtUpdateCat->bindValue(':id_docente', null, PDO::PARAM_NULL);
        }
        $stmtUpdateCat->bindValue(':id_catedra', $idCatedra, PDO::PARAM_INT);
        $stmtUpdateCat->execute();

        // La relación nueva es la fuente correcta: cátedra + docente + cargo.
        $stmtDelete = $pdo->prepare('DELETE FROM catedras_docentes WHERE id_catedra = :id_catedra');
        $stmtDelete->execute([':id_catedra' => $idCatedra]);

        if ($idDocente > 0) {
            $stmtInsert = $pdo->prepare("\n                INSERT INTO catedras_docentes\n                    (id_catedra, id_docente, id_cargo, activo)\n                VALUES\n                    (:id_catedra, :id_docente, :id_cargo, 1)\n            ");
            $stmtInsert->execute([
                ':id_catedra' => $idCatedra,
                ':id_docente' => $idDocente,
                ':id_cargo' => $idCargo,
            ]);
        }

        $pdo->commit();

        $cambiosMesas = 0;
        try {
            $cambiosMesas = catedras_registrar_cambio_docente_en_mesas(
                $pdo,
                $idCatedra,
                $idDocenteAnterior,
                $idDocenteNuevo
            );
        } catch (Throwable $e) {
            // El cambio de cátedra no debe fallar por el aviso de mesas. Lo dejamos logueado.
            log_error($e, 'catedras_asignar_docente_registrar_cambio_mesas');
        }

        json_response([
            'exito' => true,
            'mensaje' => $idDocente > 0 ? 'Docente y cargo asignados correctamente.' : 'Docente quitado correctamente.',
            'data' => [
                'cambios_mesas_pendientes' => $cambiosMesas,
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo asignar el docente y cargo.',
        ], 500);
    }
}
