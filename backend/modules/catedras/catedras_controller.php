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

function catedras_docente_efectivo_order_sql(string $cdAlias = 'cd3', string $docAlias = 'd3', string $cargoAlias = 'cargo3'): string
{
    return "
        CASE
            WHEN {$docAlias}.activo = 1
             AND {$docAlias}.id_docente IS NOT NULL
             AND (
                    {$cdAlias}.id_cargo = 2
                    OR UPPER(TRIM(COALESCE({$cargoAlias}.cargo, ''))) = 'SUPLENTE'
                 )
            THEN 0
            WHEN {$docAlias}.activo = 1
             AND {$docAlias}.id_docente IS NOT NULL
             AND (
                    {$cdAlias}.id_cargo = 1
                    OR UPPER(TRIM(COALESCE({$cargoAlias}.cargo, ''))) = 'TITULAR'
                 )
            THEN 1
            WHEN {$docAlias}.activo = 1
             AND {$docAlias}.id_docente IS NOT NULL
            THEN 2
            ELSE 3
        END ASC,
        {$cdAlias}.id_catedra_docente ASC
    ";
}

/**
 * Relación efectiva para mesas:
 * - si hay SUPLENTE activo, se llama al suplente;
 * - si no, se llama al TITULAR activo;
 * - si no, se toma cualquier otro docente activo;
 * - como compatibilidad final, queda catedras.id_docente.
 */
function catedras_sql_join_docente_efectivo(string $catAlias = 'cat', string $cdAlias = 'cd_ef', string $docAlias = 'd_ef', string $cargoAlias = 'cargo_ef'): string
{
    $order = catedras_docente_efectivo_order_sql('cd3', 'd3', 'cargo3');

    return "
        LEFT JOIN catedras_docentes {$cdAlias}
            ON {$cdAlias}.id_catedra = {$catAlias}.id_catedra
           AND {$cdAlias}.activo = 1
           AND {$cdAlias}.id_catedra_docente = (
                SELECT cd3.id_catedra_docente
                FROM catedras_docentes cd3
                LEFT JOIN docentes d3
                    ON d3.id_docente = cd3.id_docente
                LEFT JOIN cargos cargo3
                    ON cargo3.id_cargo = cd3.id_cargo
                WHERE cd3.id_catedra = {$catAlias}.id_catedra
                  AND cd3.activo = 1
                ORDER BY {$order}
                LIMIT 1
           )
        LEFT JOIN docentes {$docAlias}
            ON {$docAlias}.id_docente = COALESCE({$cdAlias}.id_docente, {$catAlias}.id_docente)
           AND {$docAlias}.activo = 1
        LEFT JOIN cargos {$cargoAlias}
            ON {$cargoAlias}.id_cargo = {$cdAlias}.id_cargo
    ";
}

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
        $docentes = $pdo->query("
            SELECT
                d.id_docente,
                d.docente,
                d.dni,
                d.email,
                d.activo
            FROM docentes d
            WHERE d.activo = 1
            ORDER BY d.docente ASC, d.id_docente ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $cargos = $pdo->query("
            SELECT id_cargo, cargo, activo
            FROM cargos
            WHERE activo = 1
            ORDER BY
                CASE
                    WHEN id_cargo = 1 OR UPPER(TRIM(cargo)) = 'TITULAR' THEN 1
                    WHEN id_cargo = 2 OR UPPER(TRIM(cargo)) = 'SUPLENTE' THEN 2
                    ELSE 3
                END ASC,
                id_cargo ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $cursos = $pdo->query("
            SELECT id_curso, nombre_curso
            FROM curso
            WHERE activo = 1
              AND UPPER(TRIM(nombre_curso)) <> 'EGRESADO'
            ORDER BY id_curso ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $divisiones = $pdo->query("
            SELECT id_division, nombre_division
            FROM division
            WHERE activo = 1
            ORDER BY nombre_division ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

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

function catedras_cargar_asignaciones_para_catedras(PDO $pdo, array $idsCatedras): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $idsCatedras), static fn($id) => $id > 0)));
    if (count($ids) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $order = catedras_docente_efectivo_order_sql('cd', 'd', 'cargo');

    $stmt = $pdo->prepare("
        SELECT
            cd.id_catedra,
            cd.id_catedra_docente,
            cd.id_docente,
            d.docente,
            cd.id_cargo,
            cargo.cargo,
            cd.activo,
            cd.creado_en
        FROM catedras_docentes cd
        INNER JOIN docentes d
            ON d.id_docente = cd.id_docente
           AND d.activo = 1
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = cd.id_cargo
        WHERE cd.activo = 1
          AND cd.id_catedra IN ({$placeholders})
        ORDER BY cd.id_catedra ASC, {$order}
    ");
    $stmt->execute($ids);

    $porCatedra = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $idCatedra = (int)$row['id_catedra'];
        if (!isset($porCatedra[$idCatedra])) {
            $porCatedra[$idCatedra] = [];
        }

        $porCatedra[$idCatedra][] = [
            'id_catedra_docente' => (int)$row['id_catedra_docente'],
            'id_docente' => (int)$row['id_docente'],
            'docente' => (string)$row['docente'],
            'id_cargo' => $row['id_cargo'] !== null ? (int)$row['id_cargo'] : null,
            'cargo' => (string)($row['cargo'] ?? ''),
            'activo' => (int)$row['activo'],
            'creado_en' => $row['creado_en'] ?? null,
        ];
    }

    return $porCatedra;
}

function catedras_formatear_resumen_asignaciones(array $asignaciones): string
{
    $partes = [];
    foreach ($asignaciones as $asignacion) {
        $docente = trim((string)($asignacion['docente'] ?? ''));
        $cargo = trim((string)($asignacion['cargo'] ?? ''));
        if ($docente === '') {
            continue;
        }
        $partes[] = $cargo !== '' ? $docente . ' (' . $cargo . ')' : $docente;
    }

    return implode(', ', $partes);
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
        $where[] = "(
            EXISTS (
                SELECT 1
                FROM catedras_docentes cd_f
                INNER JOIN docentes d_f ON d_f.id_docente = cd_f.id_docente AND d_f.activo = 1
                WHERE cd_f.id_catedra = cat.id_catedra
                  AND cd_f.activo = 1
                  AND cd_f.id_docente = :id_docente
            )
            OR cat.id_docente = :id_docente_legacy
        )";
        $params[':id_docente'] = $idDocente;
        $params[':id_docente_legacy'] = $idDocente;
    }

    if ($sinDocente) {
        $where[] = "(
            NOT EXISTS (
                SELECT 1
                FROM catedras_docentes cd_sd
                INNER JOIN docentes d_sd ON d_sd.id_docente = cd_sd.id_docente AND d_sd.activo = 1
                WHERE cd_sd.id_catedra = cat.id_catedra
                  AND cd_sd.activo = 1
            )
            AND cat.id_docente IS NULL
        )";
    }

    if ($busqueda !== '') {
        $whereBusqueda = [
            'm.materia LIKE :busqueda_materia',
            'cu.nombre_curso LIKE :busqueda_curso',
            'divi.nombre_division LIKE :busqueda_division',
            "COALESCE(d_ef.docente, '') LIKE :busqueda_docente_efectivo",
            "COALESCE(cargo_ef.cargo, '') LIKE :busqueda_cargo_efectivo",
            "EXISTS (
                SELECT 1
                FROM catedras_docentes cd_b
                INNER JOIN docentes d_b ON d_b.id_docente = cd_b.id_docente AND d_b.activo = 1
                LEFT JOIN cargos cargo_b ON cargo_b.id_cargo = cd_b.id_cargo
                WHERE cd_b.id_catedra = cat.id_catedra
                  AND cd_b.activo = 1
                  AND (
                        d_b.docente LIKE :busqueda_docente_asignado
                        OR COALESCE(cargo_b.cargo, '') LIKE :busqueda_cargo_asignado
                  )
            )",
        ];

        $likeBusqueda = '%' . $busqueda . '%';
        $params[':busqueda_materia'] = $likeBusqueda;
        $params[':busqueda_curso'] = $likeBusqueda;
        $params[':busqueda_division'] = $likeBusqueda;
        $params[':busqueda_docente_efectivo'] = $likeBusqueda;
        $params[':busqueda_cargo_efectivo'] = $likeBusqueda;
        $params[':busqueda_docente_asignado'] = $likeBusqueda;
        $params[':busqueda_cargo_asignado'] = $likeBusqueda;

        if (is_numeric($busqueda)) {
            $whereBusqueda[] = 'cat.id_catedra = :busqueda_id_catedra';
            $params[':busqueda_id_catedra'] = (int)$busqueda;
        }

        $where[] = '(' . implode(' OR ', $whereBusqueda) . ')';
    }

    $whereSql = implode(' AND ', $where);
    $joinDocenteEfectivo = catedras_sql_join_docente_efectivo('cat', 'cd_ef', 'd_ef', 'cargo_ef');

    try {
        $countSql = "
            SELECT COUNT(DISTINCT cat.id_catedra)
            FROM catedras cat
            INNER JOIN curso cu ON cu.id_curso = cat.id_curso
            INNER JOIN division divi ON divi.id_division = cat.id_division
            INNER JOIN materias m ON m.id_materia = cat.id_materia
            {$joinDocenteEfectivo}
            WHERE {$whereSql}
        ";

        $stmtCount = $pdo->prepare($countSql);
        foreach ($params as $key => $value) {
            $stmtCount->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        $sql = "
            SELECT
                cat.id_catedra,
                cat.id_curso,
                cu.nombre_curso,
                cat.id_division,
                divi.nombre_division,
                cat.id_materia,
                m.materia,
                cd_ef.id_catedra_docente,
                d_ef.id_docente AS id_docente,
                cd_ef.id_cargo AS id_cargo,
                COALESCE(d_ef.docente, '') AS docente,
                COALESCE(cargo_ef.cargo, '') AS cargo_docente,
                COALESCE(cargo_ef.cargo, '') AS cargo,
                d_ef.id_docente AS id_docente_llamado,
                cd_ef.id_cargo AS id_cargo_llamado,
                COALESCE(d_ef.docente, '') AS docente_llamado,
                COALESCE(cargo_ef.cargo, '') AS cargo_llamado,
                cat.activo,
                cat.creado_en
            FROM catedras cat
            INNER JOIN curso cu ON cu.id_curso = cat.id_curso
            INNER JOIN division divi ON divi.id_division = cat.id_division
            INNER JOIN materias m ON m.id_materia = cat.id_materia
            {$joinDocenteEfectivo}
            WHERE {$whereSql}
            ORDER BY cu.id_curso ASC, divi.nombre_division ASC, m.materia ASC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $pag['por_pagina'], PDO::PARAM_INT);
        $stmt->bindValue(':offset', $pag['offset'], PDO::PARAM_INT);
        $stmt->execute();

        $filas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $ids = array_map(static fn($fila) => (int)$fila['id_catedra'], $filas);
        $asignacionesPorCatedra = catedras_cargar_asignaciones_para_catedras($pdo, $ids);

        foreach ($filas as &$fila) {
            $idCatedra = (int)$fila['id_catedra'];
            $asignaciones = $asignacionesPorCatedra[$idCatedra] ?? [];
            $fila['docentes_asignados'] = $asignaciones;
            $fila['docentes_resumen'] = catedras_formatear_resumen_asignaciones($asignaciones);

            if ($fila['docentes_resumen'] === '' && trim((string)($fila['docente'] ?? '')) !== '') {
                $cargo = trim((string)($fila['cargo_docente'] ?? ''));
                $fila['docentes_resumen'] = $cargo !== ''
                    ? trim((string)$fila['docente']) . ' (' . $cargo . ')'
                    : trim((string)$fila['docente']);
            }
        }
        unset($fila);

        json_response([
            'exito' => true,
            'data' => $filas,
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

function catedras_obtener_docente_efectivo_desde_relacion(PDO $pdo, int $idCatedra): ?array
{
    $order = catedras_docente_efectivo_order_sql('cd', 'd', 'cargo');
    $stmt = $pdo->prepare("
        SELECT
            cd.id_docente,
            cd.id_cargo,
            d.docente,
            cargo.cargo
        FROM catedras_docentes cd
        INNER JOIN docentes d
            ON d.id_docente = cd.id_docente
           AND d.activo = 1
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = cd.id_cargo
        WHERE cd.id_catedra = :id_catedra
          AND cd.activo = 1
        ORDER BY {$order}
        LIMIT 1
    ");
    $stmt->execute([':id_catedra' => $idCatedra]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function catedras_obtener_docente_efectivo_actual(PDO $pdo, int $idCatedra): ?int
{
    $docenteRelacion = catedras_obtener_docente_efectivo_desde_relacion($pdo, $idCatedra);
    if ($docenteRelacion && (int)$docenteRelacion['id_docente'] > 0) {
        return (int)$docenteRelacion['id_docente'];
    }

    $stmt = $pdo->prepare("
        SELECT d.id_docente
        FROM catedras cat
        INNER JOIN docentes d
            ON d.id_docente = cat.id_docente
           AND d.activo = 1
        WHERE cat.id_catedra = :id_catedra
          AND cat.activo = 1
        LIMIT 1
    ");
    $stmt->execute([':id_catedra' => $idCatedra]);
    $id = $stmt->fetchColumn();

    return $id !== false && $id !== null ? (int)$id : null;
}

function catedras_leer_asignaciones_desde_body(array $body): array
{
    $asignaciones = [];

    if (isset($body['docentes']) && is_array($body['docentes'])) {
        foreach ($body['docentes'] as $fila) {
            if (!is_array($fila)) {
                continue;
            }

            $asignaciones[] = [
                'id_docente' => catedras_int($fila['id_docente'] ?? 0),
                'id_cargo' => catedras_int($fila['id_cargo'] ?? 0),
            ];
        }

        return $asignaciones;
    }

    // Compatibilidad con el frontend anterior, que enviaba una sola asignación.
    $idDocente = catedras_int($body['id_docente'] ?? 0);
    $idCargo = catedras_int($body['id_cargo'] ?? 0);

    if ($idDocente > 0) {
        $asignaciones[] = [
            'id_docente' => $idDocente,
            'id_cargo' => $idCargo,
        ];
    }

    return $asignaciones;
}

function catedras_validar_asignaciones(PDO $pdo, array $asignaciones): array
{
    $resultado = [];
    $docentesUsados = [];
    $cargosUsados = [];

    foreach ($asignaciones as $asignacion) {
        $idDocente = catedras_int($asignacion['id_docente'] ?? 0);
        $idCargo = catedras_int($asignacion['id_cargo'] ?? 0);

        if ($idDocente <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'Hay una asignación con docente inválido.',
            ], 422);
        }

        if ($idCargo <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'Cada docente asignado debe tener un cargo.',
            ], 422);
        }

        if (isset($docentesUsados[$idDocente])) {
            json_response([
                'exito' => false,
                'mensaje' => 'No podés repetir el mismo docente en una cátedra.',
            ], 422);
        }

        if (isset($cargosUsados[$idCargo])) {
            json_response([
                'exito' => false,
                'mensaje' => 'No podés repetir el mismo cargo en una cátedra. Usá un cargo distinto para cada docente.',
            ], 422);
        }

        $stmtDoc = $pdo->prepare('SELECT id_docente FROM docentes WHERE id_docente = :id_docente AND activo = 1 LIMIT 1');
        $stmtDoc->execute([':id_docente' => $idDocente]);
        if (!$stmtDoc->fetch(PDO::FETCH_ASSOC)) {
            json_response([
                'exito' => false,
                'mensaje' => 'Uno de los docentes seleccionados no existe o está inactivo.',
            ], 422);
        }

        $stmtCargo = $pdo->prepare('SELECT id_cargo FROM cargos WHERE id_cargo = :id_cargo AND activo = 1 LIMIT 1');
        $stmtCargo->execute([':id_cargo' => $idCargo]);
        if (!$stmtCargo->fetch(PDO::FETCH_ASSOC)) {
            json_response([
                'exito' => false,
                'mensaje' => 'Uno de los cargos seleccionados no existe o está inactivo.',
            ], 422);
        }

        $docentesUsados[$idDocente] = true;
        $cargosUsados[$idCargo] = true;
        $resultado[] = [
            'id_docente' => $idDocente,
            'id_cargo' => $idCargo,
        ];
    }

    return $resultado;
}

function catedras_asignar_docente(): void
{
    $pdo = db();
    $body = get_json_body();

    $idCatedra = catedras_int($body['id_catedra'] ?? 0);

    if ($idCatedra <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'La cátedra seleccionada no es válida.',
        ], 422);
    }

    try {
        $pdo->beginTransaction();

        $stmtCat = $pdo->prepare('
            SELECT id_catedra
            FROM catedras
            WHERE id_catedra = :id_catedra
              AND activo = 1
            LIMIT 1
        ');
        $stmtCat->execute([':id_catedra' => $idCatedra]);
        $catedraActual = $stmtCat->fetch(PDO::FETCH_ASSOC);

        if (!$catedraActual) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'La cátedra no existe o está inactiva.',
            ], 404);
        }

        $idDocenteAnterior = catedras_obtener_docente_efectivo_actual($pdo, $idCatedra);
        $asignaciones = catedras_validar_asignaciones($pdo, catedras_leer_asignaciones_desde_body($body));

        $stmtDelete = $pdo->prepare('DELETE FROM catedras_docentes WHERE id_catedra = :id_catedra');
        $stmtDelete->execute([':id_catedra' => $idCatedra]);

        if (count($asignaciones) > 0) {
            $stmtInsert = $pdo->prepare("
                INSERT INTO catedras_docentes
                    (id_catedra, id_docente, id_cargo, activo)
                VALUES
                    (:id_catedra, :id_docente, :id_cargo, 1)
            ");

            foreach ($asignaciones as $asignacion) {
                $stmtInsert->execute([
                    ':id_catedra' => $idCatedra,
                    ':id_docente' => (int)$asignacion['id_docente'],
                    ':id_cargo' => (int)$asignacion['id_cargo'],
                ]);
            }
        }

        $docenteEfectivoNuevo = catedras_obtener_docente_efectivo_desde_relacion($pdo, $idCatedra);
        $idDocenteNuevo = $docenteEfectivoNuevo && (int)$docenteEfectivoNuevo['id_docente'] > 0
            ? (int)$docenteEfectivoNuevo['id_docente']
            : null;

        // Compatibilidad: catedras.id_docente queda reflejando el docente efectivo/prioritario.
        // La fuente completa es catedras_docentes; esta columna ayuda a módulos viejos y reportes.
        $stmtUpdateCat = $pdo->prepare('UPDATE catedras SET id_docente = :id_docente WHERE id_catedra = :id_catedra');
        if ($idDocenteNuevo !== null) {
            $stmtUpdateCat->bindValue(':id_docente', $idDocenteNuevo, PDO::PARAM_INT);
        } else {
            $stmtUpdateCat->bindValue(':id_docente', null, PDO::PARAM_NULL);
        }
        $stmtUpdateCat->bindValue(':id_catedra', $idCatedra, PDO::PARAM_INT);
        $stmtUpdateCat->execute();

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
            log_error($e, 'catedras_asignar_docente_registrar_cambio_mesas');
        }

        $cantidad = count($asignaciones);
        json_response([
            'exito' => true,
            'mensaje' => $cantidad > 0
                ? 'Docentes y cargos guardados correctamente.'
                : 'Docentes quitados correctamente.',
            'data' => [
                'cambios_mesas_pendientes' => $cambiosMesas,
                'id_docente_llamado' => $idDocenteNuevo,
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron guardar los docentes y cargos de la cátedra.',
        ], 500);
    }
}
