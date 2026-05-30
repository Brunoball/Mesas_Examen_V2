<?php
// backend/modules/materias/talleres_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

if (!function_exists('json_response')) {
    function json_response(array $data, int $status = 200): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('get_json_body')) {
    function get_json_body(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode((string)$raw, true);
        if (is_array($data)) return $data;
        return $_POST ?: [];
    }
}

if (!function_exists('normalizar_mayuscula')) {
    function normalizar_mayuscula(?string $texto): string
    {
        $texto = trim((string)$texto);
        return $texto === '' ? '' : mb_strtoupper($texto, 'UTF-8');
    }
}

if (!function_exists('materias_int')) {
    function materias_int($value): int
    {
        return is_numeric($value) ? (int)$value : 0;
    }
}

if (!function_exists('materias_bool_int')) {
    function materias_bool_int($value, int $default = 1): int
    {
        if ($value === null || $value === '') return $default;
        return ((int)$value) === 1 ? 1 : 0;
    }
}

if (!function_exists('materias_parse_ids')) {
    function materias_parse_ids($input): array
    {
        if (is_array($input)) {
            return array_values(array_unique(array_filter(array_map('intval', $input), static fn($id) => $id > 0)));
        }

        if (is_string($input) && trim($input) !== '') {
            return array_values(array_unique(array_filter(array_map('intval', explode(',', $input)), static fn($id) => $id > 0)));
        }

        return [];
    }
}

if (!function_exists('materias_columna_existe')) {
    function materias_columna_existe(PDO $pdo, string $tabla, string $columna): bool
    {
        $stmt = $pdo->prepare("\n            SELECT COUNT(*)\n            FROM INFORMATION_SCHEMA.COLUMNS\n            WHERE TABLE_SCHEMA = DATABASE()\n              AND TABLE_NAME = :tabla\n              AND COLUMN_NAME = :columna\n        ");
        $stmt->execute([':tabla' => $tabla, ':columna' => $columna]);
        return (int)$stmt->fetchColumn() > 0;
    }
}

if (!function_exists('materias_indice_existe')) {
    function materias_indice_existe(PDO $pdo, string $tabla, string $indice): bool
    {
        $stmt = $pdo->prepare("\n            SELECT COUNT(*)\n            FROM INFORMATION_SCHEMA.STATISTICS\n            WHERE TABLE_SCHEMA = DATABASE()\n              AND TABLE_NAME = :tabla\n              AND INDEX_NAME = :indice\n        ");
        $stmt->execute([':tabla' => $tabla, ':indice' => $indice]);
        return (int)$stmt->fetchColumn() > 0;
    }
}

if (!function_exists('materias_tabla_existe')) {
    function materias_tabla_existe(PDO $pdo, string $tabla): bool
    {
        $stmt = $pdo->prepare("\n            SELECT COUNT(*)\n            FROM INFORMATION_SCHEMA.TABLES\n            WHERE TABLE_SCHEMA = DATABASE()\n              AND TABLE_NAME = :tabla\n        ");
        $stmt->execute([':tabla' => $tabla]);
        return (int)$stmt->fetchColumn() > 0;
    }
}

function talleres_drop_index_si_existe(PDO $pdo, string $tabla, string $indice): void
{
    if (!materias_indice_existe($pdo, $tabla, $indice)) return;

    try {
        $pdo->exec("ALTER TABLE {$tabla} DROP INDEX {$indice}");
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__ . '_' . $tabla . '_' . $indice);
    }
}

function talleres_drop_fk_si_existe(PDO $pdo, string $tabla, string $fk): void
{
    $stmt = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = :tabla\n          AND CONSTRAINT_NAME = :fk\n          AND CONSTRAINT_TYPE = 'FOREIGN KEY'\n    ");
    $stmt->execute([':tabla' => $tabla, ':fk' => $fk]);

    if ((int)$stmt->fetchColumn() <= 0) return;

    try {
        $pdo->exec("ALTER TABLE {$tabla} DROP FOREIGN KEY {$fk}");
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__ . '_' . $tabla . '_' . $fk);
    }
}

function talleres_drop_fk_por_columnas(PDO $pdo, string $tabla, array $columnas): void
{
    $columnas = array_values(array_unique(array_filter(array_map('strval', $columnas))));
    if (count($columnas) === 0) return;

    $in = implode(',', array_fill(0, count($columnas), '?'));
    $stmt = $pdo->prepare("\n        SELECT DISTINCT CONSTRAINT_NAME\n        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE\n        WHERE TABLE_SCHEMA = DATABASE()\n          AND TABLE_NAME = ?\n          AND REFERENCED_TABLE_NAME IS NOT NULL\n          AND COLUMN_NAME IN ($in)\n    ");
    $stmt->execute(array_merge([$tabla], $columnas));

    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $fk) {
        talleres_drop_fk_si_existe($pdo, $tabla, (string)$fk);
    }
}

function talleres_drop_columna_si_existe(PDO $pdo, string $tabla, string $columna): void
{
    if (!materias_columna_existe($pdo, $tabla, $columna)) return;

    try {
        $pdo->exec("ALTER TABLE {$tabla} DROP COLUMN {$columna}");
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__ . '_' . $tabla . '_' . $columna);
    }
}

/**
 * Esquema final de talleres:
 * - talleres mantiene curso/división para listar y editar por división.
 * - talleres_materias guarda SOLO id_taller + id_catedra + activo + orden.
 * - materia/curso/división se obtienen siempre desde catedras.
 */
function talleres_asegurar_esquema(PDO $pdo): void
{
    if (!materias_columna_existe($pdo, 'talleres', 'id_curso')) {
        $pdo->exec("ALTER TABLE talleres ADD COLUMN id_curso INT NOT NULL DEFAULT 1 AFTER id_taller");
    }

    if (!materias_columna_existe($pdo, 'talleres', 'id_division')) {
        $pdo->exec("ALTER TABLE talleres ADD COLUMN id_division INT NOT NULL DEFAULT 1 AFTER id_curso");
    }

    if (!materias_columna_existe($pdo, 'talleres_materias', 'id_catedra')) {
        $pdo->exec("ALTER TABLE talleres_materias ADD COLUMN id_catedra INT NULL AFTER id_taller");
    }

    // Migración desde esquemas viejos antes de eliminar columnas auxiliares.
    if (materias_columna_existe($pdo, 'talleres_materias', 'id_materia')) {
        $colCursoTm = materias_columna_existe($pdo, 'talleres_materias', 'id_curso') ? 'tm.id_curso' : 'ta.id_curso';
        $colDivisionTm = materias_columna_existe($pdo, 'talleres_materias', 'id_division') ? 'tm.id_division' : 'ta.id_division';

        try {
            $pdo->exec("\n                UPDATE talleres_materias tm\n                INNER JOIN talleres ta ON ta.id_taller = tm.id_taller\n                INNER JOIN catedras ca\n                    ON ca.id_curso = {$colCursoTm}\n                   AND ca.id_division = {$colDivisionTm}\n                   AND ca.id_materia = tm.id_materia\n                   AND ca.activo = 1\n                SET tm.id_catedra = ca.id_catedra\n                WHERE tm.id_catedra IS NULL\n            ");
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . '_migrar_id_catedra');
        }
    }

    // Si quedaron filas antiguas sin cátedra, se desactivan para no romper el armado.
    try {
        $pdo->exec("UPDATE talleres_materias SET activo = 0 WHERE id_catedra IS NULL");
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__ . '_desactivar_sin_catedra');
    }

    talleres_drop_index_si_existe($pdo, 'talleres', 'taller');
    talleres_drop_index_si_existe($pdo, 'talleres', 'uq_taller_curso');

    if (!materias_indice_existe($pdo, 'talleres', 'idx_talleres_curso')) {
        $pdo->exec("ALTER TABLE talleres ADD INDEX idx_talleres_curso (id_curso)");
    }
    if (!materias_indice_existe($pdo, 'talleres', 'idx_talleres_division')) {
        $pdo->exec("ALTER TABLE talleres ADD INDEX idx_talleres_division (id_division)");
    }
    if (!materias_indice_existe($pdo, 'talleres', 'idx_talleres_curso_division')) {
        $pdo->exec("ALTER TABLE talleres ADD INDEX idx_talleres_curso_division (id_curso, id_division)");
    }
    if (!materias_indice_existe($pdo, 'talleres', 'uq_taller_curso_division')) {
        try {
            $pdo->exec("ALTER TABLE talleres ADD UNIQUE KEY uq_taller_curso_division (taller, id_curso, id_division)");
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . '_unique_taller_curso_division');
        }
    }

    talleres_drop_fk_por_columnas($pdo, 'talleres_materias', ['id_materia', 'id_curso', 'id_division']);
    talleres_drop_index_si_existe($pdo, 'talleres_materias', 'uq_taller_materia');
    talleres_drop_index_si_existe($pdo, 'talleres_materias', 'uq_taller_materia_curso_division');
    talleres_drop_index_si_existe($pdo, 'talleres_materias', 'idx_talleres_materias_materia');
    talleres_drop_index_si_existe($pdo, 'talleres_materias', 'idx_talleres_materias_curso');
    talleres_drop_index_si_existe($pdo, 'talleres_materias', 'idx_talleres_materias_division');
    talleres_drop_index_si_existe($pdo, 'talleres_materias', 'idx_talleres_materias_curso_division');

    if (!materias_indice_existe($pdo, 'talleres_materias', 'idx_talleres_materias_taller')) {
        $pdo->exec("ALTER TABLE talleres_materias ADD INDEX idx_talleres_materias_taller (id_taller)");
    }
    if (!materias_indice_existe($pdo, 'talleres_materias', 'idx_talleres_materias_catedra')) {
        $pdo->exec("ALTER TABLE talleres_materias ADD INDEX idx_talleres_materias_catedra (id_catedra)");
    }

    try {
        $pdo->exec("
            DELETE tm_dup
            FROM talleres_materias tm_dup
            INNER JOIN talleres_materias tm_keep
                ON tm_keep.id_taller = tm_dup.id_taller
               AND tm_keep.id_catedra = tm_dup.id_catedra
               AND tm_keep.id_taller_materia < tm_dup.id_taller_materia
            WHERE tm_dup.id_catedra IS NOT NULL
        ");
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__ . '_deduplicar_taller_catedra');
    }

    if (!materias_indice_existe($pdo, 'talleres_materias', 'uq_taller_catedra')) {
        try {
            $pdo->exec("ALTER TABLE talleres_materias ADD UNIQUE KEY uq_taller_catedra (id_taller, id_catedra)");
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . '_unique_taller_catedra');
        }
    }

    // Limpieza final de columnas viejas. Si una FK externa no prevista lo impide, queda logueado sin romper la API.
    talleres_drop_columna_si_existe($pdo, 'talleres_materias', 'id_curso');
    talleres_drop_columna_si_existe($pdo, 'talleres_materias', 'id_division');
    talleres_drop_columna_si_existe($pdo, 'talleres_materias', 'id_materia');
}

function talleres_catedras_por_curso_divisiones(): void
{
    $pdo = db();

    $body = get_json_body();
    $idCurso = materias_int($_GET['id_curso'] ?? $body['id_curso'] ?? 0);
    $idsDivisiones = materias_parse_ids($_GET['divisiones'] ?? $_GET['ids_divisiones'] ?? $body['divisiones'] ?? $body['ids_divisiones'] ?? null);

    if (count($idsDivisiones) === 0) {
        $idDivision = materias_int($_GET['id_division'] ?? $body['id_division'] ?? 0);
        if ($idDivision > 0) $idsDivisiones = [$idDivision];
    }

    if ($idCurso <= 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar un curso.']);
    if (count($idsDivisiones) === 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar al menos una división.']);

    try {
        talleres_asegurar_esquema($pdo);

        $in = implode(',', array_fill(0, count($idsDivisiones), '?'));
        $stmt = $pdo->prepare("\n            SELECT\n                ca.id_catedra,\n                ca.id_curso,\n                cu.nombre_curso AS curso,\n                ca.id_division,\n                d.nombre_division AS division,\n                ca.id_materia,\n                m.materia,\n                m.activo,\n                COALESCE(cd.id_docente, ca.id_docente) AS id_docente,\n                doc.docente,\n                cd.id_cargo,\n                cargo.cargo AS cargo_docente,\n                COALESCE(GROUP_CONCAT(DISTINCT am.id_area ORDER BY am.id_area ASC SEPARATOR ','), '') AS ids_areas,\n                COALESCE(GROUP_CONCAT(DISTINCT a.area ORDER BY a.area ASC SEPARATOR ', '), '') AS areas\n            FROM catedras ca\n            INNER JOIN materias m\n                ON m.id_materia = ca.id_materia\n               AND m.activo = 1\n            INNER JOIN curso cu\n                ON cu.id_curso = ca.id_curso\n               AND cu.activo = 1\n            INNER JOIN division d\n                ON d.id_division = ca.id_division\n               AND d.activo = 1\n            LEFT JOIN (\n                SELECT cd1.id_catedra_docente, cd1.id_catedra, cd1.id_docente, cd1.id_cargo\n                FROM catedras_docentes cd1\n                INNER JOIN (\n                    SELECT id_catedra, MIN(id_catedra_docente) AS id_catedra_docente\n                    FROM catedras_docentes\n                    WHERE activo = 1\n                    GROUP BY id_catedra\n                ) cd_min\n                    ON cd_min.id_catedra_docente = cd1.id_catedra_docente\n            ) cd\n                ON cd.id_catedra = ca.id_catedra\n            LEFT JOIN docentes doc\n                ON doc.id_docente = COALESCE(cd.id_docente, ca.id_docente)\n               AND doc.activo = 1\n            LEFT JOIN cargos cargo\n                ON cargo.id_cargo = cd.id_cargo\n            LEFT JOIN areas_materias am\n                ON am.id_materia = m.id_materia\n               AND am.activo = 1\n            LEFT JOIN areas a\n                ON a.id_area = am.id_area\n               AND a.activo = 1\n            WHERE ca.activo = 1\n              AND ca.id_curso = ?\n              AND ca.id_division IN ($in)\n            GROUP BY\n                ca.id_catedra, ca.id_curso, cu.nombre_curso, ca.id_division, d.nombre_division,\n                ca.id_materia, m.materia, m.activo, ca.id_docente, cd.id_docente, cd.id_cargo,\n                doc.docente, cargo.cargo\n            ORDER BY ca.id_division ASC, m.materia ASC, ca.id_catedra ASC\n        ");
        $stmt->execute(array_merge([$idCurso], $idsDivisiones));

        json_response(['exito' => true, 'catedras' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al obtener cátedras para talleres.']);
    }
}

function talleres_resolver_catedras_por_materias(PDO $pdo, int $idCurso, int $idDivision, array $idsMaterias): array
{
    $idsMaterias = array_values(array_unique(array_filter(array_map('intval', $idsMaterias), static fn($id) => $id > 0)));
    if (count($idsMaterias) === 0) return [];

    $in = implode(',', array_fill(0, count($idsMaterias), '?'));
    $stmt = $pdo->prepare("\n        SELECT id_catedra, id_curso, id_division, id_materia\n        FROM catedras\n        WHERE activo = 1\n          AND id_curso = ?\n          AND id_division = ?\n          AND id_materia IN ($in)\n        ORDER BY id_materia ASC, id_catedra ASC\n    ");
    $stmt->execute(array_merge([$idCurso, $idDivision], $idsMaterias));

    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $map[(int)$row['id_materia']] = [
            'id_catedra' => (int)$row['id_catedra'],
            'id_curso' => (int)$row['id_curso'],
            'id_division' => (int)$row['id_division'],
            'id_materia' => (int)$row['id_materia'],
        ];
    }

    return $map;
}

function talleres_validar_catedras(PDO $pdo, int $idCurso, array $idsDivisiones, array $idsCatedras): array
{
    $idsDivisiones = array_values(array_unique(array_filter(array_map('intval', $idsDivisiones), static fn($id) => $id > 0)));
    $idsCatedras = array_values(array_unique(array_filter(array_map('intval', $idsCatedras), static fn($id) => $id > 0)));

    if (count($idsDivisiones) === 0 || count($idsCatedras) === 0) return [];

    $inDiv = implode(',', array_fill(0, count($idsDivisiones), '?'));
    $inCat = implode(',', array_fill(0, count($idsCatedras), '?'));

    $stmt = $pdo->prepare("\n        SELECT id_catedra, id_curso, id_division, id_materia\n        FROM catedras\n        WHERE activo = 1\n          AND id_curso = ?\n          AND id_division IN ($inDiv)\n          AND id_catedra IN ($inCat)\n        ORDER BY id_division ASC, id_materia ASC, id_catedra ASC\n    ");
    $stmt->execute(array_merge([$idCurso], $idsDivisiones, $idsCatedras));

    $porDivision = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $idDivision = (int)$row['id_division'];
        if (!isset($porDivision[$idDivision])) $porDivision[$idDivision] = [];
        $porDivision[$idDivision][] = [
            'id_catedra' => (int)$row['id_catedra'],
            'id_materia' => (int)$row['id_materia'],
        ];
    }

    return $porDivision;
}

function talleres_obtener_o_crear_taller(PDO $pdo, ?int $idTallerBase, int $idCurso, int $idDivision, string $taller, int $activo): int
{
    if ($idTallerBase !== null && $idTallerBase > 0) {
        $stmtBase = $pdo->prepare("SELECT id_taller FROM talleres WHERE id_taller = :id_taller LIMIT 1");
        $stmtBase->execute([':id_taller' => $idTallerBase]);
        $idEncontrado = (int)($stmtBase->fetchColumn() ?: 0);

        if ($idEncontrado > 0) {
            $stmt = $pdo->prepare("\n                UPDATE talleres\n                SET id_curso = :id_curso, id_division = :id_division, taller = :taller, activo = :activo\n                WHERE id_taller = :id_taller\n            ");
            $stmt->execute([
                ':id_curso' => $idCurso,
                ':id_division' => $idDivision,
                ':taller' => $taller,
                ':activo' => $activo,
                ':id_taller' => $idEncontrado,
            ]);
            return $idEncontrado;
        }
    }

    $stmtExiste = $pdo->prepare("\n        SELECT id_taller\n        FROM talleres\n        WHERE taller = :taller\n          AND id_curso = :id_curso\n          AND id_division = :id_division\n        LIMIT 1\n    ");
    $stmtExiste->execute([':taller' => $taller, ':id_curso' => $idCurso, ':id_division' => $idDivision]);
    $existente = $stmtExiste->fetch(PDO::FETCH_ASSOC);

    if ($existente) {
        $id = (int)$existente['id_taller'];
        $pdo->prepare("UPDATE talleres SET activo = :activo WHERE id_taller = :id_taller")
            ->execute([':activo' => $activo, ':id_taller' => $id]);
        return $id;
    }

    $stmt = $pdo->prepare("\n        INSERT INTO talleres (id_curso, id_division, taller, activo)\n        VALUES (:id_curso, :id_division, :taller, :activo)\n    ");
    $stmt->execute([
        ':id_curso' => $idCurso,
        ':id_division' => $idDivision,
        ':taller' => $taller,
        ':activo' => $activo,
    ]);

    return (int)$pdo->lastInsertId();
}

function talleres_reemplazar_catedras(PDO $pdo, int $idTaller, array $catedras): int
{
    $pdo->prepare("UPDATE talleres_materias SET activo = 0 WHERE id_taller = :id_taller")
        ->execute([':id_taller' => $idTaller]);

    $stmt = $pdo->prepare("\n        INSERT INTO talleres_materias (id_taller, id_catedra, activo, orden)\n        VALUES (:id_taller, :id_catedra, 1, :orden)\n        ON DUPLICATE KEY UPDATE\n            activo = 1,\n            orden = VALUES(orden)\n    ");

    $orden = 1;
    foreach ($catedras as $cat) {
        $stmt->execute([
            ':id_taller' => $idTaller,
            ':id_catedra' => (int)$cat['id_catedra'],
            ':orden' => $orden,
        ]);
        $orden++;
    }

    return count($catedras);
}

function talleres_listar(): void
{
    $pdo = db();

    try {
        talleres_asegurar_esquema($pdo);

        $stmt = $pdo->query("\n            SELECT\n                t.id_taller,\n                t.id_curso,\n                t.id_division,\n                cu.nombre_curso AS curso,\n                d.nombre_division AS division,\n                t.taller,\n                t.activo,\n                t.creado_en,\n                COUNT(DISTINCT CASE WHEN tm.activo = 1 THEN tm.id_catedra END) AS cantidad_materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN tm.activo = 1 THEN m.materia END ORDER BY tm.orden ASC, m.materia ASC SEPARATOR ', '), '') AS materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN tm.activo = 1 THEN ca.id_materia END ORDER BY tm.orden ASC, ca.id_materia ASC SEPARATOR ','), '') AS ids_materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN tm.activo = 1 THEN tm.id_catedra END ORDER BY tm.orden ASC, tm.id_catedra ASC SEPARATOR ','), '') AS ids_catedras\n            FROM talleres t\n            INNER JOIN curso cu ON cu.id_curso = t.id_curso\n            INNER JOIN division d ON d.id_division = t.id_division\n            LEFT JOIN talleres_materias tm\n                ON tm.id_taller = t.id_taller\n            LEFT JOIN catedras ca\n                ON ca.id_catedra = tm.id_catedra\n            LEFT JOIN materias m\n                ON m.id_materia = ca.id_materia\n            GROUP BY t.id_taller, t.id_curso, t.id_division, cu.nombre_curso, d.nombre_division, t.taller, t.activo, t.creado_en\n            ORDER BY t.id_curso ASC, t.id_division ASC, t.taller ASC\n        ");

        json_response(['exito' => true, 'talleres' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al listar talleres. Ejecutá la migración SQL incluida para dejar talleres_materias solo con id_catedra.']);
    }
}

function talleres_guardar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idTaller = materias_int($data['id_taller'] ?? 0);
    $idCurso = materias_int($data['id_curso'] ?? 0);
    $taller = normalizar_mayuscula($data['taller'] ?? '');
    $activo = materias_bool_int($data['activo'] ?? 1, 1);

    $idsDivisiones = materias_parse_ids($data['divisiones'] ?? $data['ids_divisiones'] ?? null);
    if (count($idsDivisiones) === 0) {
        $idDivision = materias_int($data['id_division'] ?? 0);
        if ($idDivision > 0) $idsDivisiones = [$idDivision];
    }

    $idsCatedras = materias_parse_ids($data['catedras'] ?? $data['ids_catedras'] ?? null);
    $idsMaterias = materias_parse_ids($data['materias'] ?? $data['ids_materias'] ?? null);

    if ($taller === '') json_response(['exito' => false, 'mensaje' => 'El nombre del taller es obligatorio.']);
    if ($idCurso <= 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar el curso/año del taller.']);
    if (count($idsDivisiones) === 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar al menos una división.']);
    if (count($idsCatedras) === 0 && count($idsMaterias) === 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar al menos una cátedra para el taller.']);

    try {
        talleres_asegurar_esquema($pdo);

        $catedrasPorDivision = [];

        if (count($idsCatedras) > 0) {
            $catedrasPorDivision = talleres_validar_catedras($pdo, $idCurso, $idsDivisiones, $idsCatedras);
        } else {
            foreach ($idsDivisiones as $idDivision) {
                $map = talleres_resolver_catedras_por_materias($pdo, $idCurso, (int)$idDivision, $idsMaterias);
                if (count($map) > 0) {
                    $catedrasPorDivision[(int)$idDivision] = array_values($map);
                }
            }
        }

        foreach ($idsDivisiones as $idDivision) {
            if (empty($catedrasPorDivision[(int)$idDivision])) {
                json_response([
                    'exito' => false,
                    'mensaje' => 'Hay una división seleccionada sin cátedras válidas para el taller. Revisá curso, división y materias/cátedras seleccionadas.',
                ]);
            }
        }

        $pdo->beginTransaction();

        $divisionActualTaller = null;
        if ($idTaller > 0) {
            $stmtActual = $pdo->prepare("SELECT id_division FROM talleres WHERE id_taller = :id_taller LIMIT 1");
            $stmtActual->execute([':id_taller' => $idTaller]);
            $valorActual = $stmtActual->fetchColumn();
            $divisionActualTaller = $valorActual !== false ? (int)$valorActual : null;
        }

        $idsTalleres = [];
        $totalCatedrasGuardadas = 0;
        $idsDivisionesInt = array_map('intval', $idsDivisiones);
        $actualIncluida = $divisionActualTaller !== null && in_array($divisionActualTaller, $idsDivisionesInt, true);

        foreach ($idsDivisionesInt as $index => $idDivision) {
            $idBase = null;

            if ($idTaller > 0) {
                if ($actualIncluida && $idDivision === $divisionActualTaller) {
                    $idBase = $idTaller;
                } elseif (!$actualIncluida && $index === 0) {
                    $idBase = $idTaller;
                }
            }

            $idTallerActual = talleres_obtener_o_crear_taller($pdo, $idBase, $idCurso, (int)$idDivision, $taller, $activo);
            $idsTalleres[] = $idTallerActual;
            $totalCatedrasGuardadas += talleres_reemplazar_catedras($pdo, $idTallerActual, $catedrasPorDivision[(int)$idDivision]);
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => count($idsDivisiones) === 1
                ? 'Taller guardado correctamente usando solo cátedras.'
                : 'Taller guardado correctamente para las divisiones seleccionadas usando solo cátedras.',
            'id_taller' => $idsTalleres[0] ?? $idTaller,
            'ids_talleres' => $idsTalleres,
            'materias_guardadas' => $totalCatedrasGuardadas,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al guardar taller. Revisá que la migración SQL de cátedras esté aplicada.']);
    }
}

function talleres_eliminar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idTaller = materias_int($data['id_taller'] ?? 0);

    if ($idTaller <= 0) json_response(['exito' => false, 'mensaje' => 'ID de taller inválido.']);

    try {
        talleres_asegurar_esquema($pdo);

        $enUso = 0;
        if (materias_tabla_existe($pdo, 'mesas') && materias_columna_existe($pdo, 'mesas', 'id_taller')) {
            $stmtUso = $pdo->prepare("SELECT COUNT(*) FROM mesas WHERE id_taller = :id_taller");
            $stmtUso->execute([':id_taller' => $idTaller]);
            $enUso = (int)$stmtUso->fetchColumn();
        }

        if ($enUso > 0) {
            $stmtDesactivar = $pdo->prepare("UPDATE talleres SET activo = 0 WHERE id_taller = :id_taller");
            $stmtDesactivar->execute([':id_taller' => $idTaller]);

            if ($stmtDesactivar->rowCount() <= 0) {
                json_response([
                    'exito' => false,
                    'mensaje' => 'No se eliminó ni desactivó ningún taller porque el registro no existe o ya fue procesado.',
                ]);
            }

            json_response(['exito' => true, 'mensaje' => 'El taller tiene mesas relacionadas. Se desactivó correctamente.']);
        }

        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM talleres_materias WHERE id_taller = :id_taller")->execute([':id_taller' => $idTaller]);
        $stmtDelete = $pdo->prepare("DELETE FROM talleres WHERE id_taller = :id_taller");
        $stmtDelete->execute([':id_taller' => $idTaller]);

        if ($stmtDelete->rowCount() <= 0) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'No se eliminó ningún taller porque el registro no existe o ya fue eliminado.',
            ]);
        }

        $pdo->commit();

        json_response(['exito' => true, 'mensaje' => 'Taller eliminado correctamente.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al eliminar taller.']);
    }
}

function talleres_materia_agregar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idTaller = materias_int($data['id_taller'] ?? 0);
    $idCatedra = materias_int($data['id_catedra'] ?? 0);
    $idCurso = materias_int($data['id_curso'] ?? 0);
    $idDivision = materias_int($data['id_division'] ?? 0);
    $idMateria = materias_int($data['id_materia'] ?? 0);
    $orden = isset($data['orden']) && $data['orden'] !== '' ? (int)$data['orden'] : null;

    if ($idTaller <= 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar un taller.']);

    try {
        talleres_asegurar_esquema($pdo);

        if ($idCatedra <= 0 && $idCurso > 0 && $idDivision > 0 && $idMateria > 0) {
            $map = talleres_resolver_catedras_por_materias($pdo, $idCurso, $idDivision, [$idMateria]);
            $idCatedra = isset($map[$idMateria]) ? (int)$map[$idMateria]['id_catedra'] : 0;
        }

        if ($idCatedra <= 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar una cátedra válida.']);

        $stmtVal = $pdo->prepare("\n            SELECT COUNT(*)\n            FROM catedras ca\n            INNER JOIN talleres t ON t.id_taller = :id_taller\n            WHERE ca.id_catedra = :id_catedra\n              AND ca.id_curso = t.id_curso\n              AND ca.id_division = t.id_division\n              AND ca.activo = 1\n        ");
        $stmtVal->execute([':id_taller' => $idTaller, ':id_catedra' => $idCatedra]);
        if ((int)$stmtVal->fetchColumn() <= 0) {
            json_response(['exito' => false, 'mensaje' => 'La cátedra no corresponde al curso/división de ese taller.']);
        }

        if ($orden === null) {
            $stmtOrden = $pdo->prepare("SELECT COALESCE(MAX(orden), 0) + 1 FROM talleres_materias WHERE id_taller = :id_taller");
            $stmtOrden->execute([':id_taller' => $idTaller]);
            $orden = (int)$stmtOrden->fetchColumn();
        }

        $stmt = $pdo->prepare("\n            INSERT INTO talleres_materias (id_taller, id_catedra, activo, orden)\n            VALUES (:id_taller, :id_catedra, 1, :orden)\n            ON DUPLICATE KEY UPDATE activo = 1, orden = VALUES(orden)\n        ");
        $stmt->execute([':id_taller' => $idTaller, ':id_catedra' => $idCatedra, ':orden' => $orden]);

        json_response(['exito' => true, 'mensaje' => 'Cátedra agregada al taller correctamente.']);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al agregar cátedra al taller.']);
    }
}

function talleres_materia_eliminar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idTaller = materias_int($data['id_taller'] ?? 0);
    $idCatedra = materias_int($data['id_catedra'] ?? 0);
    $idMateria = materias_int($data['id_materia'] ?? 0);

    if ($idTaller <= 0 || ($idCatedra <= 0 && $idMateria <= 0)) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar taller y cátedra.']);
    }

    try {
        talleres_asegurar_esquema($pdo);

        if ($idCatedra > 0) {
            $stmt = $pdo->prepare("UPDATE talleres_materias SET activo = 0 WHERE id_taller = :id_taller AND id_catedra = :id_catedra AND activo <> 0");
            $stmt->execute([':id_taller' => $idTaller, ':id_catedra' => $idCatedra]);
        } else {
            $stmt = $pdo->prepare("
                UPDATE talleres_materias tm
                INNER JOIN catedras ca ON ca.id_catedra = tm.id_catedra
                SET tm.activo = 0
                WHERE tm.id_taller = :id_taller
                  AND ca.id_materia = :id_materia
                  AND tm.activo <> 0
            ");
            $stmt->execute([':id_taller' => $idTaller, ':id_materia' => $idMateria]);
        }

        if ($stmt->rowCount() <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se quitó ninguna cátedra porque el registro no existe o ya fue quitado.',
            ]);
        }

        json_response(['exito' => true, 'mensaje' => 'Cátedra quitada del taller correctamente.']);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al quitar cátedra del taller.']);
    }
}

function talleres_materias_asignar_area(): void
{
    $pdo = db();

    $data = get_json_body();
    $idTaller = materias_int($data['id_taller'] ?? 0);
    $idCurso = materias_int($data['id_curso'] ?? 0);
    $idDivision = materias_int($data['id_division'] ?? 0);
    $idArea = materias_int($data['id_area'] ?? 0);

    if ($idTaller <= 0 || $idCurso <= 0 || $idDivision <= 0 || $idArea <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar taller, curso, división y área.']);
    }

    try {
        talleres_asegurar_esquema($pdo);

        $stmtCatedras = $pdo->prepare("\n            SELECT ca.id_catedra\n            FROM catedras ca\n            INNER JOIN materias m ON m.id_materia = ca.id_materia AND m.activo = 1\n            INNER JOIN areas_materias am ON am.id_materia = m.id_materia AND am.activo = 1\n            WHERE ca.activo = 1\n              AND ca.id_curso = :id_curso\n              AND ca.id_division = :id_division\n              AND am.id_area = :id_area\n            ORDER BY m.materia ASC, ca.id_catedra ASC\n        ");
        $stmtCatedras->execute([':id_curso' => $idCurso, ':id_division' => $idDivision, ':id_area' => $idArea]);
        $catedras = $stmtCatedras->fetchAll(PDO::FETCH_ASSOC);

        if (count($catedras) === 0) {
            json_response(['exito' => false, 'mensaje' => 'El área seleccionada no tiene cátedras activas en ese curso/división.']);
        }

        $pdo->beginTransaction();
        $total = talleres_reemplazar_catedras($pdo, $idTaller, $catedras);
        $pdo->commit();

        json_response(['exito' => true, 'mensaje' => 'Cátedras del área asignadas al taller correctamente.', 'cantidad' => $total]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al asignar área al taller.']);
    }
}
