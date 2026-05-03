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

function talleres_asegurar_esquema(PDO $pdo): void
{
    // Mantiene compatibilidad con bases anteriores: el taller ahora pertenece a un curso.
    if (!materias_columna_existe($pdo, 'talleres', 'id_curso')) {
        $pdo->exec("ALTER TABLE talleres ADD COLUMN id_curso INT NOT NULL DEFAULT 1 AFTER id_taller");
    }

    if (!materias_indice_existe($pdo, 'talleres', 'idx_talleres_curso')) {
        $pdo->exec("ALTER TABLE talleres ADD INDEX idx_talleres_curso (id_curso)");
    }

    // Antes el nombre era único globalmente. Ahora puede existir 'TALLER' para 1°, 2°, 3°, etc.
    if (materias_indice_existe($pdo, 'talleres', 'taller')) {
        try {
            $pdo->exec("ALTER TABLE talleres DROP INDEX taller");
        } catch (Throwable $e) {
            // Si ya fue removido o el motor no lo permite por nombre, seguimos con la operación normal.
            log_error($e, __FUNCTION__ . '_drop_unique_taller');
        }
    }

    if (!materias_indice_existe($pdo, 'talleres', 'uq_taller_curso')) {
        try {
            $pdo->exec("ALTER TABLE talleres ADD UNIQUE KEY uq_taller_curso (taller, id_curso)");
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . '_add_unique_taller_curso');
        }
    }

    if (!materias_columna_existe($pdo, 'talleres_materias', 'id_curso')) {
        $pdo->exec("ALTER TABLE talleres_materias ADD COLUMN id_curso INT NOT NULL DEFAULT 1 AFTER id_taller");
    }

    if (!materias_indice_existe($pdo, 'talleres_materias', 'idx_talleres_materias_curso')) {
        $pdo->exec("ALTER TABLE talleres_materias ADD INDEX idx_talleres_materias_curso (id_curso)");
    }
}

function talleres_listar(): void
{
    $pdo = db();

    try {
        talleres_asegurar_esquema($pdo);

        $stmt = $pdo->query("\n            SELECT\n                t.id_taller,\n                t.id_curso,\n                cu.nombre_curso AS curso,\n                t.taller,\n                t.activo,\n                t.creado_en,\n                COUNT(DISTINCT CASE WHEN tm.activo = 1 THEN tm.id_materia END) AS cantidad_materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN tm.activo = 1 THEN m.materia END ORDER BY tm.orden ASC, m.materia ASC SEPARATOR ', '), '') AS materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN tm.activo = 1 THEN tm.id_materia END ORDER BY tm.orden ASC, tm.id_materia ASC SEPARATOR ','), '') AS ids_materias\n            FROM talleres t\n            INNER JOIN curso cu ON cu.id_curso = t.id_curso\n            LEFT JOIN talleres_materias tm ON tm.id_taller = t.id_taller AND tm.id_curso = t.id_curso\n            LEFT JOIN materias m ON m.id_materia = tm.id_materia\n            GROUP BY t.id_taller, t.id_curso, cu.nombre_curso, t.taller, t.activo, t.creado_en\n            ORDER BY t.id_curso ASC, t.taller ASC\n        ");

        json_response(['exito' => true, 'talleres' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al listar talleres. Ejecutá la migración SQL incluida si la base todavía no tiene id_curso en talleres.',
        ]);
    }
}

function talleres_guardar(): void
{
    $pdo = db();

    $data            = get_json_body();
    $idTaller        = materias_int($data['id_taller'] ?? 0);
    $idCurso         = materias_int($data['id_curso'] ?? 0);
    $taller          = normalizar_mayuscula($data['taller'] ?? '');
    $activo          = materias_bool_int($data['activo'] ?? 1, 1);
    $recibioMaterias = array_key_exists('materias', $data);
    $materias        = [];

    if ($recibioMaterias && is_array($data['materias'])) {
        $materias = array_values(array_unique(
            array_filter(array_map('intval', $data['materias']), static fn($id) => $id > 0)
        ));
    }

    if ($taller === '') json_response(['exito' => false, 'mensaje' => 'El nombre del taller es obligatorio.']);
    if ($idCurso <= 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar el curso/año del taller.']);
    if ($recibioMaterias && count($materias) === 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar al menos una materia del curso para el taller.']);

    try {
        talleres_asegurar_esquema($pdo);

        // Validación clave: no se guardan materias globales; deben existir en cátedras del curso elegido.
        if ($recibioMaterias && count($materias) > 0) {
            $in = implode(',', array_fill(0, count($materias), '?'));
            $stmtValidar = $pdo->prepare("\n                SELECT DISTINCT id_materia\n                FROM catedras\n                WHERE activo = 1\n                  AND id_curso = ?\n                  AND id_materia IN ($in)\n            ");
            $stmtValidar->execute(array_merge([$idCurso], $materias));
            $validas = array_map('intval', $stmtValidar->fetchAll(PDO::FETCH_COLUMN));

            if (count($validas) !== count($materias)) {
                json_response([
                    'exito' => false,
                    'mensaje' => 'Hay materias seleccionadas que no pertenecen al curso elegido. Volvé a seleccionar el curso y las materias.',
                ]);
            }
        }

        $pdo->beginTransaction();

        if ($idTaller > 0) {
            $stmt = $pdo->prepare("\n                UPDATE talleres\n                SET id_curso = :id_curso, taller = :taller, activo = :activo\n                WHERE id_taller = :id_taller\n            ");
            $stmt->execute([
                ':id_curso' => $idCurso,
                ':taller' => $taller,
                ':activo' => $activo,
                ':id_taller' => $idTaller,
            ]);
        } else {
            $stmtExiste = $pdo->prepare("SELECT id_taller FROM talleres WHERE taller = :taller AND id_curso = :id_curso LIMIT 1");
            $stmtExiste->execute([':taller' => $taller, ':id_curso' => $idCurso]);
            $existente = $stmtExiste->fetch(PDO::FETCH_ASSOC);

            if ($existente) {
                $idTaller = (int)$existente['id_taller'];
                $pdo->prepare("UPDATE talleres SET activo = :activo WHERE id_taller = :id_taller")
                    ->execute([':activo' => $activo, ':id_taller' => $idTaller]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO talleres (id_curso, taller, activo) VALUES (:id_curso, :taller, :activo)");
                $stmt->execute([':id_curso' => $idCurso, ':taller' => $taller, ':activo' => $activo]);
                $idTaller = (int)$pdo->lastInsertId();
            }
        }

        if ($recibioMaterias) {
            $pdo->prepare("UPDATE talleres_materias SET activo = 0 WHERE id_taller = :id_taller")
                ->execute([':id_taller' => $idTaller]);

            $stmt = $pdo->prepare("\n                INSERT INTO talleres_materias (id_taller, id_curso, id_materia, activo, orden)\n                VALUES (:id_taller, :id_curso, :id_materia, 1, :orden)\n                ON DUPLICATE KEY UPDATE id_curso = VALUES(id_curso), activo = 1, orden = VALUES(orden)\n            ");
            $orden = 1;
            foreach ($materias as $idMateria) {
                $stmt->execute([
                    ':id_taller' => $idTaller,
                    ':id_curso' => $idCurso,
                    ':id_materia' => $idMateria,
                    ':orden' => $orden,
                ]);
                $orden++;
            }
        }

        $pdo->commit();
        json_response([
            'exito' => true,
            'mensaje' => $recibioMaterias
                ? 'Taller, curso y materias guardados correctamente.'
                : 'Taller guardado correctamente.',
            'id_taller' => $idTaller,
            'materias_guardadas' => count($materias),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al guardar taller. Revisá que la migración SQL de talleres esté aplicada.',
        ]);
    }
}

function talleres_eliminar(): void
{
    $pdo = db();

    $data     = get_json_body();
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
            $pdo->prepare("UPDATE talleres SET activo = 0 WHERE id_taller = :id_taller")
                ->execute([':id_taller' => $idTaller]);
            json_response(['exito' => true, 'mensaje' => 'El taller tiene mesas relacionadas. Se desactivó correctamente.']);
        }

        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM talleres_materias WHERE id_taller = :id_taller")->execute([':id_taller' => $idTaller]);
        $pdo->prepare("DELETE FROM talleres WHERE id_taller = :id_taller")->execute([':id_taller' => $idTaller]);
        $pdo->commit();

        json_response(['exito' => true, 'mensaje' => 'Taller eliminado correctamente.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al eliminar taller.',
        ]);
    }
}

function talleres_materia_agregar(): void
{
    $pdo = db();

    $data      = get_json_body();
    $idTaller  = materias_int($data['id_taller']  ?? 0);
    $idCurso   = materias_int($data['id_curso']   ?? 0);
    $idMateria = materias_int($data['id_materia'] ?? 0);
    $orden     = isset($data['orden']) && $data['orden'] !== '' ? (int)$data['orden'] : null;

    if ($idTaller <= 0 || $idCurso <= 0 || $idMateria <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar taller, curso y materia.']);
    }

    try {
        talleres_asegurar_esquema($pdo);

        $stmtValidar = $pdo->prepare("\n            SELECT COUNT(*)\n            FROM catedras\n            WHERE activo = 1 AND id_curso = :id_curso AND id_materia = :id_materia\n        ");
        $stmtValidar->execute([':id_curso' => $idCurso, ':id_materia' => $idMateria]);
        if ((int)$stmtValidar->fetchColumn() === 0) {
            json_response(['exito' => false, 'mensaje' => 'La materia seleccionada no pertenece al curso del taller.']);
        }

        if ($orden === null) {
            $stmtOrden = $pdo->prepare("SELECT COALESCE(MAX(orden), 0) + 1 FROM talleres_materias WHERE id_taller = :id_taller");
            $stmtOrden->execute([':id_taller' => $idTaller]);
            $orden = (int)$stmtOrden->fetchColumn();
        }

        $stmt = $pdo->prepare("\n            INSERT INTO talleres_materias (id_taller, id_curso, id_materia, activo, orden)\n            VALUES (:id_taller, :id_curso, :id_materia, 1, :orden)\n            ON DUPLICATE KEY UPDATE id_curso = VALUES(id_curso), activo = 1, orden = VALUES(orden)\n        ");
        $stmt->execute([
            ':id_taller' => $idTaller,
            ':id_curso' => $idCurso,
            ':id_materia' => $idMateria,
            ':orden' => $orden,
        ]);

        json_response(['exito' => true, 'mensaje' => 'Materia agregada al taller correctamente.']);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al agregar materia al taller.',
        ]);
    }
}

function talleres_materia_eliminar(): void
{
    $pdo = db();

    $data      = get_json_body();
    $idTaller  = materias_int($data['id_taller']  ?? 0);
    $idMateria = materias_int($data['id_materia'] ?? 0);

    if ($idTaller <= 0 || $idMateria <= 0) json_response(['exito' => false, 'mensaje' => 'Debe seleccionar taller y materia.']);

    try {
        talleres_asegurar_esquema($pdo);
        $stmt = $pdo->prepare("UPDATE talleres_materias SET activo = 0 WHERE id_taller = :id_taller AND id_materia = :id_materia");
        $stmt->execute([':id_taller' => $idTaller, ':id_materia' => $idMateria]);
        json_response(['exito' => true, 'mensaje' => 'Materia quitada del taller correctamente.']);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al quitar materia del taller.',
        ]);
    }
}

function talleres_materias_asignar_area(): void
{
    $pdo = db();

    $data     = get_json_body();
    $idTaller = materias_int($data['id_taller'] ?? 0);
    $idCurso  = materias_int($data['id_curso']  ?? 0);
    $idArea   = materias_int($data['id_area']   ?? 0);

    if ($idTaller <= 0 || $idCurso <= 0 || $idArea <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar taller, curso y área.']);
    }

    try {
        talleres_asegurar_esquema($pdo);

        $stmtMaterias = $pdo->prepare("\n            SELECT DISTINCT m.id_materia\n            FROM catedras ca\n            INNER JOIN materias m ON m.id_materia = ca.id_materia AND m.activo = 1\n            INNER JOIN areas_materias am ON am.id_materia = m.id_materia AND am.activo = 1\n            WHERE ca.activo = 1\n              AND ca.id_curso = :id_curso\n              AND am.id_area = :id_area\n            ORDER BY m.id_materia ASC\n        ");
        $stmtMaterias->execute([':id_curso' => $idCurso, ':id_area' => $idArea]);
        $ids = array_map('intval', $stmtMaterias->fetchAll(PDO::FETCH_COLUMN));

        if (count($ids) === 0) {
            json_response(['exito' => false, 'mensaje' => 'El área seleccionada no tiene materias activas en ese curso.']);
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("\n            INSERT INTO talleres_materias (id_taller, id_curso, id_materia, activo, orden)\n            VALUES (:id_taller, :id_curso, :id_materia, 1, :orden)\n            ON DUPLICATE KEY UPDATE id_curso = VALUES(id_curso), activo = 1, orden = VALUES(orden)\n        ");
        $orden = 1;
        foreach ($ids as $idMateria) {
            $stmt->execute([
                ':id_taller' => $idTaller,
                ':id_curso' => $idCurso,
                ':id_materia' => $idMateria,
                ':orden' => $orden,
            ]);
            $orden++;
        }

        $pdo->commit();
        json_response(['exito' => true, 'mensaje' => 'Materias del área y curso asignadas al taller correctamente.', 'cantidad' => count($ids)]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al asignar área al taller.',
        ]);
    }
}
