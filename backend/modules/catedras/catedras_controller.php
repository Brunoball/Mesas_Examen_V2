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

function catedras_docente_es_placeholder($value): bool
{
    $texto = strtoupper(trim((string)$value));
    return $texto === 'MATERIA SIN CARGO CUBIERTO' || $texto === 'SIN CARGO CUBIERTO';
}

function catedras_sql_no_placeholder_docente(string $alias): string
{
    return "UPPER(TRIM(COALESCE({$alias}.docente, ''))) NOT IN ('MATERIA SIN CARGO CUBIERTO', 'SIN CARGO CUBIERTO')";
}


function catedras_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    // Defensa: si el usuario todavía no ejecutó la migración o el motor no permite DDL
    // desde el endpoint, no rompemos los GET de cátedras con un 500.
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $tabla) || !preg_match('/^[a-zA-Z0-9_]+$/', $columna)) {
        return false;
    }

    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `{$tabla}` LIKE :columna");
        $stmt->execute([':columna' => $columna]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'catedras_columna_existe');
        }
        return false;
    }
}

function catedras_usar_columna_llamado_mesa(?bool $valor = null): bool
{
    static $usar = false;
    if ($valor !== null) {
        $usar = $valor;
    }
    return $usar;
}

/**
 * Intenta habilitar la columna persistente llamado_mesa sin romper la pantalla.
 * Si el ALTER falla, el sistema sigue funcionando usando catedras.id_docente
 * como fuente del docente elegido para llamar.
 */
function catedras_asegurar_columna_llamado_mesa(PDO $pdo): bool
{
    try {
        if (!catedras_columna_existe($pdo, 'catedras_docentes', 'llamado_mesa')) {
            try {
                $pdo->exec("ALTER TABLE catedras_docentes ADD COLUMN llamado_mesa TINYINT(1) NOT NULL DEFAULT 0 AFTER activo");
            } catch (Throwable $e) {
                if (function_exists('log_error')) {
                    log_error($e, 'catedras_asegurar_columna_llamado_mesa_alter');
                }
            }
        }

        $existe = catedras_columna_existe($pdo, 'catedras_docentes', 'llamado_mesa');
        catedras_usar_columna_llamado_mesa($existe);

        if ($existe) {
            // Migración suave: si ya había un docente efectivo guardado en catedras.id_docente,
            // lo marcamos como llamado solamente cuando la cátedra todavía no tiene ninguna marca.
            $pdo->exec("
                UPDATE catedras_docentes cd
                INNER JOIN catedras cat
                    ON cat.id_catedra = cd.id_catedra
                   AND cat.id_docente = cd.id_docente
                LEFT JOIN (
                    SELECT id_catedra
                    FROM catedras_docentes
                    WHERE activo = 1
                      AND llamado_mesa = 1
                    GROUP BY id_catedra
                ) marcadas
                    ON marcadas.id_catedra = cd.id_catedra
                SET cd.llamado_mesa = 1
                WHERE cd.activo = 1
                  AND cat.id_docente IS NOT NULL
                  AND marcadas.id_catedra IS NULL
            ");
        }

        return $existe;
    } catch (Throwable $e) {
        if (function_exists('log_error')) {
            log_error($e, 'catedras_asegurar_columna_llamado_mesa');
        }
        catedras_usar_columna_llamado_mesa(false);
        return false;
    }
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

function catedras_docente_efectivo_order_sql(string $cdAlias = 'cd3', string $docAlias = 'd3', string $cargoAlias = 'cargo3', ?string $catAlias = null): string
{
    $prioridadManual = $catAlias !== null && trim($catAlias) !== ''
        ? "WHEN {$docAlias}.activo = 1 AND {$docAlias}.id_docente IS NOT NULL AND {$cdAlias}.id_docente = {$catAlias}.id_docente THEN -1"
        : '';

    return "
        CASE
            WHEN {$docAlias}.activo = 1
             AND {$docAlias}.id_docente IS NOT NULL
             AND " . (catedras_usar_columna_llamado_mesa()
                    ? "COALESCE({$cdAlias}.llamado_mesa, 0) = 1"
                    : ($catAlias !== null && trim($catAlias) !== '' ? "{$cdAlias}.id_docente = {$catAlias}.id_docente" : "0 = 1")) . "
            THEN -2
            {$prioridadManual}
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
        {$cdAlias}.id_catedra_docente DESC
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
    $order = catedras_docente_efectivo_order_sql('cd3', 'd3', 'cargo3', $catAlias);

    return "
        LEFT JOIN catedras_docentes {$cdAlias}
            ON {$cdAlias}.id_catedra = {$catAlias}.id_catedra
           AND {$cdAlias}.activo = 1
           AND {$cdAlias}.id_catedra_docente = (
                SELECT cd3.id_catedra_docente
                FROM catedras_docentes cd3
                LEFT JOIN docentes d3
                    ON d3.id_docente = cd3.id_docente
                   AND d3.activo = 1
                   AND " . catedras_sql_no_placeholder_docente('d3') . "
                LEFT JOIN cargos cargo3
                    ON cargo3.id_cargo = cd3.id_cargo
                WHERE cd3.id_catedra = {$catAlias}.id_catedra
                  AND cd3.activo = 1
                  AND d3.id_docente IS NOT NULL
                ORDER BY {$order}
                LIMIT 1
           )
        LEFT JOIN docentes {$docAlias}
            ON {$docAlias}.id_docente = COALESCE({$cdAlias}.id_docente, {$catAlias}.id_docente)
           AND {$docAlias}.activo = 1
           AND " . catedras_sql_no_placeholder_docente($docAlias) . "
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
    catedras_asegurar_columna_llamado_mesa($pdo);

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
              AND " . catedras_sql_no_placeholder_docente('d') . "
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
    $stmt = $pdo->prepare("
        SELECT
            cd.id_catedra,
            cd.id_catedra_docente,
            cd.id_docente,
            d.docente,
            cd.id_cargo,
            cargo.cargo,
            cd.activo,
            " . (catedras_asegurar_columna_llamado_mesa($pdo)
                ? 'cd.llamado_mesa'
                : 'CASE WHEN cat.id_docente = cd.id_docente THEN 1 ELSE 0 END') . " AS llamado_mesa,
            cat.id_docente AS id_docente_llamado_guardado,
            cd.creado_en
        FROM catedras_docentes cd
        INNER JOIN catedras cat
            ON cat.id_catedra = cd.id_catedra
        INNER JOIN docentes d
            ON d.id_docente = cd.id_docente
           AND d.activo = 1
           AND " . catedras_sql_no_placeholder_docente('d') . "
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = cd.id_cargo
        WHERE cd.activo = 1
          AND cd.id_catedra IN ({$placeholders})
        ORDER BY cd.id_catedra ASC, cd.id_catedra_docente ASC
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
            'id_docente_llamado_guardado' => $row['id_docente_llamado_guardado'] !== null ? (int)$row['id_docente_llamado_guardado'] : null,
            'llamado_mesa' => !empty($row['llamado_mesa']),
        ];
    }

    foreach ($porCatedra as $idCatedra => $asignaciones) {
        $idDocenteGuardado = 0;
        foreach ($asignaciones as $asignacion) {
            $idDocenteGuardado = (int)($asignacion['id_docente_llamado_guardado'] ?? 0);
            if ($idDocenteGuardado > 0) {
                break;
            }
        }

        $hayMarcadoReal = false;
        foreach ($asignaciones as $asignacion) {
            if (!empty($asignacion['llamado_mesa'])) {
                $hayMarcadoReal = true;
                break;
            }
        }

        if (!$hayMarcadoReal && $idDocenteGuardado > 0) {
            foreach ($porCatedra[$idCatedra] as $idx => $asignacion) {
                $porCatedra[$idCatedra][$idx]['llamado_mesa'] = (int)$asignacion['id_docente'] === $idDocenteGuardado;
            }
        }

        $llamado = catedras_obtener_docente_llamado_desde_asignaciones($porCatedra[$idCatedra]);
        $idDocenteLlamado = $llamado ? (int)($llamado['id_docente'] ?? 0) : 0;

        foreach ($porCatedra[$idCatedra] as $idx => $asignacion) {
            $porCatedra[$idCatedra][$idx]['llamado_mesa'] = $idDocenteLlamado > 0 && (int)$asignacion['id_docente'] === $idDocenteLlamado;
            unset($porCatedra[$idCatedra][$idx]['id_docente_llamado_guardado']);
        }
    }

    return $porCatedra;
}


function catedras_prioridad_asignacion_para_llamado(array $asignacion): int
{
    $idCargo = catedras_int($asignacion['id_cargo'] ?? 0);
    $cargo = strtoupper(trim((string)($asignacion['cargo'] ?? '')));

    if ($idCargo === 2 || $cargo === 'SUPLENTE') {
        return 0;
    }

    if ($idCargo === 1 || $cargo === 'TITULAR') {
        return 1;
    }

    return 2;
}

function catedras_obtener_docente_llamado_desde_asignaciones(array $asignaciones): ?array
{
    if (count($asignaciones) === 0) {
        return null;
    }

    $marcada = null;
    foreach ($asignaciones as $asignacion) {
        if (!empty($asignacion['llamado_mesa'])) {
            $marcada = $asignacion;
        }
    }

    if ($marcada !== null) {
        return $marcada;
    }

    $mejor = null;
    foreach ($asignaciones as $asignacion) {
        if ($mejor === null) {
            $mejor = $asignacion;
            continue;
        }

        $prioridadActual = catedras_prioridad_asignacion_para_llamado($asignacion);
        $prioridadMejor = catedras_prioridad_asignacion_para_llamado($mejor);

        if ($prioridadActual < $prioridadMejor) {
            $mejor = $asignacion;
            continue;
        }

        if ($prioridadActual === $prioridadMejor && (int)($asignacion['id_catedra_docente'] ?? 0) > (int)($mejor['id_catedra_docente'] ?? 0)) {
            $mejor = $asignacion;
        }
    }

    return $mejor;
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
    catedras_asegurar_columna_llamado_mesa($pdo);
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
                INNER JOIN docentes d_f ON d_f.id_docente = cd_f.id_docente AND d_f.activo = 1 AND " . catedras_sql_no_placeholder_docente('d_f') . "
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
                INNER JOIN docentes d_sd ON d_sd.id_docente = cd_sd.id_docente AND d_sd.activo = 1 AND " . catedras_sql_no_placeholder_docente('d_sd') . "
                WHERE cd_sd.id_catedra = cat.id_catedra
                  AND cd_sd.activo = 1
            )
            AND NOT EXISTS (
                SELECT 1
                FROM docentes d_legacy_sd
                WHERE d_legacy_sd.id_docente = cat.id_docente
                  AND d_legacy_sd.activo = 1
                  AND " . catedras_sql_no_placeholder_docente('d_legacy_sd') . "
            )
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
                INNER JOIN docentes d_b ON d_b.id_docente = cd_b.id_docente AND d_b.activo = 1 AND " . catedras_sql_no_placeholder_docente('d_b') . "
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
    $order = catedras_docente_efectivo_order_sql('cd', 'd', 'cargo', 'cat');
    $stmt = $pdo->prepare("
        SELECT
            cd.id_docente,
            cd.id_cargo,
            d.docente,
            cargo.cargo
        FROM catedras_docentes cd
        INNER JOIN catedras cat
            ON cat.id_catedra = cd.id_catedra
        INNER JOIN docentes d
            ON d.id_docente = cd.id_docente
           AND d.activo = 1
           AND " . catedras_sql_no_placeholder_docente('d') . "
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
           AND " . catedras_sql_no_placeholder_docente('d') . "
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
                'llamado_mesa' => !empty($fila['llamado_mesa']),
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
            'llamado_mesa' => true,
        ];
    }

    return $asignaciones;
}

function catedras_validar_asignaciones(PDO $pdo, array $asignaciones): array
{
    $resultado = [];
    $orden = 0;
    $docentesUsados = [];
    foreach ($asignaciones as $asignacion) {
        $idDocente = catedras_int($asignacion['id_docente'] ?? 0);
        $idCargo = catedras_int($asignacion['id_cargo'] ?? 0);
        $orden++;

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
        $stmtDoc = $pdo->prepare("SELECT id_docente, docente FROM docentes WHERE id_docente = :id_docente AND activo = 1 LIMIT 1");
        $stmtDoc->execute([':id_docente' => $idDocente]);
        $docenteValidado = $stmtDoc->fetch(PDO::FETCH_ASSOC);
        if (!$docenteValidado || catedras_docente_es_placeholder($docenteValidado['docente'] ?? '')) {
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
        $resultado[] = [
            'id_docente' => $idDocente,
            'id_cargo' => $idCargo,
            // IMPORTANTE: conservar solamente el docente que el usuario marcó como "Llamado".
            // Antes se ponía true para todos y, al cambiar solo el llamado, podía no dispararse
            // correctamente el aviso de cambio de docente en Mesas.
            'llamado_mesa' => !empty($asignacion['llamado_mesa']),
            '_orden' => $orden,
        ];
    }

    return $resultado;
}

function catedras_asignar_docente(): void
{
    $pdo = db();
    catedras_asegurar_columna_llamado_mesa($pdo);
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

        // Defensa por si llega un frontend viejo o un payload sin llamado_mesa:
        // marcamos automáticamente el docente que correspondería llamar por la regla normal.
        if (count($asignaciones) > 0 && !array_reduce($asignaciones, static fn($carry, $item) => $carry || !empty($item['llamado_mesa']), false)) {
            $fallback = catedras_obtener_docente_llamado_desde_asignaciones($asignaciones);
            $idFallback = $fallback ? (int)($fallback['id_docente'] ?? 0) : 0;
            foreach ($asignaciones as &$asignacionFallback) {
                $asignacionFallback['llamado_mesa'] = $idFallback > 0 && (int)$asignacionFallback['id_docente'] === $idFallback;
            }
            unset($asignacionFallback);
        }

        $stmtDelete = $pdo->prepare('DELETE FROM catedras_docentes WHERE id_catedra = :id_catedra');
        $stmtDelete->execute([':id_catedra' => $idCatedra]);

        // Si se marcó un docente para llamar a mesa, lo guardamos al final dentro de su mismo cargo/prioridad.
        // El armado usa catedras.id_docente como fuente principal y, como compatibilidad, también
        // queda último en catedras_docentes dentro de su prioridad.
        usort($asignaciones, static function (array $a, array $b): int {
            $prioridadA = catedras_prioridad_asignacion_para_llamado($a);
            $prioridadB = catedras_prioridad_asignacion_para_llamado($b);
            if ($prioridadA !== $prioridadB) {
                return $prioridadA <=> $prioridadB;
            }

            $llamadoA = !empty($a['llamado_mesa']);
            $llamadoB = !empty($b['llamado_mesa']);
            if ($llamadoA !== $llamadoB) {
                return $llamadoA ? 1 : -1;
            }

            return (int)($a['_orden'] ?? 0) <=> (int)($b['_orden'] ?? 0);
        });

        if (count($asignaciones) > 0) {
            $usarColumnaLlamado = catedras_usar_columna_llamado_mesa();
            if ($usarColumnaLlamado) {
                $stmtInsert = $pdo->prepare("
                    INSERT INTO catedras_docentes
                        (id_catedra, id_docente, id_cargo, activo, llamado_mesa)
                    VALUES
                        (:id_catedra, :id_docente, :id_cargo, 1, :llamado_mesa)
                ");
            } else {
                $stmtInsert = $pdo->prepare("
                    INSERT INTO catedras_docentes
                        (id_catedra, id_docente, id_cargo, activo)
                    VALUES
                        (:id_catedra, :id_docente, :id_cargo, 1)
                ");
            }

            foreach ($asignaciones as $asignacion) {
                $paramsInsert = [
                    ':id_catedra' => $idCatedra,
                    ':id_docente' => (int)$asignacion['id_docente'],
                    ':id_cargo' => (int)$asignacion['id_cargo'],
                ];
                if ($usarColumnaLlamado) {
                    $paramsInsert[':llamado_mesa'] = !empty($asignacion['llamado_mesa']) ? 1 : 0;
                }
                $stmtInsert->execute($paramsInsert);
            }
        }

        $docenteMarcadoNuevo = null;
        foreach ($asignaciones as $asignacion) {
            if (!empty($asignacion['llamado_mesa']) && (int)$asignacion['id_docente'] > 0) {
                $docenteMarcadoNuevo = (int)$asignacion['id_docente'];
            }
        }

        $docenteEfectivoNuevo = catedras_obtener_docente_efectivo_desde_relacion($pdo, $idCatedra);
        $idDocenteNuevo = $docenteMarcadoNuevo !== null
            ? $docenteMarcadoNuevo
            : ($docenteEfectivoNuevo && (int)$docenteEfectivoNuevo['id_docente'] > 0
                ? (int)$docenteEfectivoNuevo['id_docente']
                : null);

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
