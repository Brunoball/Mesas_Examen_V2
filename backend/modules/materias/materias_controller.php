<?php
// backend/modules/materias/materias_controller.php
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

function materias_catalogos(): void
{
    $pdo = db();

    try {
        if (function_exists('talleres_asegurar_esquema')) {
            talleres_asegurar_esquema($pdo);
        }

        $areas = $pdo->query("SELECT id_area, area, activo FROM areas ORDER BY area ASC")->fetchAll(PDO::FETCH_ASSOC);
        $cursos = $pdo->query("SELECT id_curso, nombre_curso, activo FROM curso ORDER BY id_curso ASC")->fetchAll(PDO::FETCH_ASSOC);
        $divisiones = $pdo->query("SELECT id_division, nombre_division, activo FROM division ORDER BY id_division ASC")->fetchAll(PDO::FETCH_ASSOC);

        $materias = $pdo->query("\n            SELECT\n                m.id_materia,\n                m.materia,\n                m.activo,\n                COALESCE(GROUP_CONCAT(DISTINCT am.id_area ORDER BY am.id_area ASC SEPARATOR ','), '') AS ids_areas,\n                COALESCE(GROUP_CONCAT(DISTINCT a.area ORDER BY a.area ASC SEPARATOR ', '), '') AS areas,\n                COALESCE(GROUP_CONCAT(DISTINCT cu.id_curso ORDER BY cu.id_curso ASC SEPARATOR ','), '') AS ids_cursos,\n                COALESCE(GROUP_CONCAT(DISTINCT cu.nombre_curso ORDER BY cu.id_curso ASC SEPARATOR ', '), '') AS cursos\n            FROM materias m\n            LEFT JOIN areas_materias am ON am.id_materia = m.id_materia AND am.activo = 1\n            LEFT JOIN areas a ON a.id_area = am.id_area AND a.activo = 1\n            LEFT JOIN catedras ca ON ca.id_materia = m.id_materia AND ca.activo = 1\n            LEFT JOIN curso cu ON cu.id_curso = ca.id_curso AND cu.activo = 1\n            GROUP BY m.id_materia, m.materia, m.activo\n            ORDER BY m.materia ASC\n        ")->fetchAll(PDO::FETCH_ASSOC);

        $talleres = $pdo->query("
            SELECT
                t.id_taller,
                t.id_curso,
                t.id_division,
                cu.nombre_curso AS curso,
                d.nombre_division AS division,
                t.taller,
                t.activo
            FROM talleres t
            LEFT JOIN curso cu ON cu.id_curso = t.id_curso
            LEFT JOIN division d ON d.id_division = t.id_division
            ORDER BY t.id_curso ASC, t.id_division ASC, t.taller ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        json_response([
            'exito' => true,
            'areas' => $areas,
            'cursos' => $cursos,
            'divisiones' => $divisiones,
            'materias' => $materias,
            'talleres' => $talleres,
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al obtener catálogos.',
        ]);
    }
}


function materias_listar(): void
{
    $pdo = db();

    try {
        if (function_exists('talleres_asegurar_esquema')) {
            talleres_asegurar_esquema($pdo);
        }

        $stmt = $pdo->query("\n            SELECT\n                m.id_materia,\n                m.materia,\n                m.activo,\n                m.creado_en,\n                MIN(CASE WHEN am.activo = 1 THEN am.id_area END) AS id_area,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN am.activo = 1 THEN am.id_area END ORDER BY am.id_area ASC SEPARATOR ','), '') AS ids_areas,\n                COALESCE(GROUP_CONCAT(DISTINCT a.area ORDER BY a.area ASC SEPARATOR ', '), '') AS areas,\n                COALESCE(GROUP_CONCAT(DISTINCT cu.nombre_curso ORDER BY cu.id_curso ASC SEPARATOR ', '), '') AS cursos,\n                COALESCE(GROUP_CONCAT(DISTINCT CONCAT(t.taller, ' (', cu_t.nombre_curso, ' ', d_t.nombre_division, ')') ORDER BY t.taller ASC SEPARATOR ', '), '') AS talleres,\n                (\n                    SELECT COUNT(*)\n                    FROM materias_correlativas mc\n                    WHERE mc.activo = 1\n                      AND (mc.id_materia = m.id_materia OR mc.id_materia_relacionada = m.id_materia)\n                ) AS cantidad_correlativas\n            FROM materias m\n            LEFT JOIN areas_materias am ON am.id_materia = m.id_materia AND am.activo = 1\n            LEFT JOIN areas a ON a.id_area = am.id_area AND a.activo = 1\n            LEFT JOIN catedras ca ON ca.id_materia = m.id_materia AND ca.activo = 1\n            LEFT JOIN curso cu ON cu.id_curso = ca.id_curso AND cu.activo = 1\n            LEFT JOIN catedras ca_t\n                ON ca_t.id_materia = m.id_materia\n               AND ca_t.activo = 1\n            LEFT JOIN talleres_materias tm\n                ON tm.id_catedra = ca_t.id_catedra\n               AND tm.activo = 1\n            LEFT JOIN talleres t\n                ON t.id_taller = tm.id_taller\n               AND t.activo = 1\n            LEFT JOIN curso cu_t ON cu_t.id_curso = ca_t.id_curso\n            LEFT JOIN division d_t ON d_t.id_division = ca_t.id_division\n            GROUP BY m.id_materia, m.materia, m.activo, m.creado_en\n            ORDER BY m.materia ASC\n        ");

        json_response([
            'exito' => true,
            'materias' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al listar materias.',
        ]);
    }
}

function materias_guardar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idMateria = materias_int($data['id_materia'] ?? 0);
    $materia = normalizar_mayuscula($data['materia'] ?? '');
    $activo = materias_bool_int($data['activo'] ?? 1, 1);

    $idsAreas = [];
    if (array_key_exists('ids_areas', $data)) {
        $idsAreas = materias_parse_ids($data['ids_areas']);
    } else {
        $idArea = materias_int($data['id_area'] ?? 0);
        if ($idArea > 0) $idsAreas = [$idArea];
    }

    if ($materia === '') {
        json_response(['exito' => false, 'mensaje' => 'El nombre de la materia es obligatorio.']);
    }

    try {
        $pdo->beginTransaction();

        if ($idMateria > 0) {
            $stmt = $pdo->prepare("UPDATE materias SET materia = :materia, activo = :activo WHERE id_materia = :id_materia");
            $stmt->execute([
                ':materia' => $materia,
                ':activo' => $activo,
                ':id_materia' => $idMateria,
            ]);
        } else {
            $stmtExiste = $pdo->prepare("SELECT id_materia FROM materias WHERE materia = :materia LIMIT 1");
            $stmtExiste->execute([':materia' => $materia]);
            $existente = $stmtExiste->fetch(PDO::FETCH_ASSOC);

            if ($existente) {
                $idMateria = (int)$existente['id_materia'];
                $stmt = $pdo->prepare("UPDATE materias SET activo = :activo WHERE id_materia = :id_materia");
                $stmt->execute([':activo' => $activo, ':id_materia' => $idMateria]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO materias (materia, activo) VALUES (:materia, :activo)");
                $stmt->execute([':materia' => $materia, ':activo' => $activo]);
                $idMateria = (int)$pdo->lastInsertId();
            }
        }

        $pdo->prepare("UPDATE areas_materias SET activo = 0 WHERE id_materia = :id_materia")
            ->execute([':id_materia' => $idMateria]);

        if (count($idsAreas) > 0) {
            $stmt = $pdo->prepare("\n                INSERT INTO areas_materias (id_area, id_materia, activo, orden)\n                VALUES (:id_area, :id_materia, 1, :orden)\n                ON DUPLICATE KEY UPDATE activo = 1, orden = VALUES(orden)\n            ");
            $orden = 1;
            foreach ($idsAreas as $idArea) {
                $stmt->execute([
                    ':id_area' => $idArea,
                    ':id_materia' => $idMateria,
                    ':orden' => $orden,
                ]);
                $orden++;
            }
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Materia guardada correctamente.',
            'id_materia' => $idMateria,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al guardar materia.',
        ]);
    }
}

function materias_eliminar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idMateria = materias_int($data['id_materia'] ?? 0);

    if ($idMateria <= 0) {
        json_response(['exito' => false, 'mensaje' => 'ID de materia inválido.']);
    }

    try {
        $stmtUso = $pdo->prepare("\n            SELECT\n                (SELECT COUNT(*) FROM previas  WHERE id_materia = :id_mat_1) +\n                (SELECT COUNT(*) FROM catedras WHERE id_materia = :id_mat_2) +\n                (SELECT COUNT(*) FROM mesas\n                    WHERE id_previa IN (\n                        SELECT id_previa FROM previas WHERE id_materia = :id_mat_3\n                    )\n                ) AS total\n        ");
        $stmtUso->execute([
            ':id_mat_1' => $idMateria,
            ':id_mat_2' => $idMateria,
            ':id_mat_3' => $idMateria,
        ]);
        $enUso = (int)$stmtUso->fetchColumn();

        if ($enUso > 0) {
            $stmt = $pdo->prepare("UPDATE materias SET activo = 0 WHERE id_materia = :id_materia");
            $stmt->execute([':id_materia' => $idMateria]);

            if ($stmt->rowCount() <= 0) {
                json_response([
                    'exito' => false,
                    'mensaje' => 'No se eliminó ni desactivó ninguna materia porque el registro no existe o ya fue procesado.',
                ]);
            }

            json_response(['exito' => true, 'mensaje' => 'La materia está en uso. Se desactivó correctamente.']);
        }

        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM areas_materias WHERE id_materia = :id_materia")->execute([':id_materia' => $idMateria]);
        $stmtDeleteTalleres = $pdo->prepare("
            DELETE tm
            FROM talleres_materias tm
            INNER JOIN catedras ca ON ca.id_catedra = tm.id_catedra
            WHERE ca.id_materia = :id_materia
        ");
        $stmtDeleteTalleres->execute([':id_materia' => $idMateria]);
        $pdo->prepare("DELETE FROM materias_correlativas WHERE id_materia = :id_materia OR id_materia_relacionada = :id_materia_rel")
            ->execute([':id_materia' => $idMateria, ':id_materia_rel' => $idMateria]);
        $stmtDelete = $pdo->prepare("DELETE FROM materias WHERE id_materia = :id_materia");
        $stmtDelete->execute([':id_materia' => $idMateria]);

        if ($stmtDelete->rowCount() <= 0) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'No se eliminó ninguna materia porque el registro no existe o ya fue eliminado.',
            ]);
        }

        $pdo->commit();

        json_response(['exito' => true, 'mensaje' => 'Materia eliminada correctamente.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al eliminar materia.',
        ]);
    }
}

function materias_cambiar_estado(): void
{
    $pdo = db();

    $data = get_json_body();
    $idMateria = materias_int($data['id_materia'] ?? 0);
    $activo = materias_bool_int($data['activo'] ?? 1, 1);

    if ($idMateria <= 0) {
        json_response(['exito' => false, 'mensaje' => 'ID de materia inválido.']);
    }

    try {
        $stmt = $pdo->prepare("UPDATE materias SET activo = :activo WHERE id_materia = :id_materia");
        $stmt->execute([':activo' => $activo, ':id_materia' => $idMateria]);

        if ($stmt->rowCount() <= 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se cambió el estado porque la materia no existe o ya tenía ese estado.',
            ]);
        }

        json_response([
            'exito' => true,
            'mensaje' => $activo ? 'Materia activada correctamente.' : 'Materia desactivada correctamente.',
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al cambiar estado de materia.',
        ]);
    }
}
