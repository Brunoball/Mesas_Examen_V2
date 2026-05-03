<?php
// backend/modules/materias/areas_controller.php
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

function areas_asegurar_auto_increment(PDO $pdo): void
{
    // En algunos dumps la tabla areas quedó con AUTO_INCREMENT = 1000 aunque id_area es tinyint.
    // Esto evita que falle el alta de nuevas áreas por rango fuera de tipo.
    try {
        $next = (int)$pdo->query('SELECT COALESCE(MAX(id_area), 0) + 1 FROM areas')->fetchColumn();
        if ($next > 0 && $next < 250) {
            $pdo->exec('ALTER TABLE areas AUTO_INCREMENT = ' . $next);
        }
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
    }
}

function areas_listar(): void
{
    $pdo = db();

    try {
        areas_asegurar_auto_increment($pdo);

        $stmt = $pdo->query("\n            SELECT\n                a.id_area,\n                a.area,\n                a.activo,\n                a.creado_en,\n                COUNT(DISTINCT CASE WHEN am.activo = 1 THEN am.id_materia END) AS cantidad_materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN am.activo = 1 THEN m.id_materia END ORDER BY m.materia ASC SEPARATOR ','), '') AS ids_materias,\n                COALESCE(GROUP_CONCAT(DISTINCT CASE WHEN am.activo = 1 THEN m.materia END ORDER BY m.materia ASC SEPARATOR ', '), '') AS materias\n            FROM areas a\n            LEFT JOIN areas_materias am ON am.id_area = a.id_area\n            LEFT JOIN materias m ON m.id_materia = am.id_materia\n            GROUP BY a.id_area, a.area, a.activo, a.creado_en\n            ORDER BY a.area ASC\n        ");

        json_response(['exito' => true, 'areas' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al listar áreas.']);
    }
}

function areas_guardar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idArea = materias_int($data['id_area'] ?? 0);
    $area = normalizar_mayuscula($data['area'] ?? '');
    $activo = materias_bool_int($data['activo'] ?? 1, 1);
    $recibioMaterias = array_key_exists('materias', $data) || array_key_exists('ids_materias', $data);
    $materiasInput = $data['materias'] ?? $data['ids_materias'] ?? [];

    $materias = [];
    if (is_array($materiasInput)) {
        $materias = array_values(array_unique(array_filter(array_map('intval', $materiasInput), static fn($id) => $id > 0)));
    }

    if ($area === '') {
        json_response(['exito' => false, 'mensaje' => 'El nombre del área es obligatorio.']);
    }

    try {
        areas_asegurar_auto_increment($pdo);
        $pdo->beginTransaction();

        if ($idArea > 0) {
            $stmt = $pdo->prepare("\n                UPDATE areas\n                SET area = :area, activo = :activo\n                WHERE id_area = :id_area\n            ");
            $stmt->execute([
                ':area' => $area,
                ':activo' => $activo,
                ':id_area' => $idArea,
            ]);
        } else {
            $stmtExiste = $pdo->prepare('SELECT id_area FROM areas WHERE area = :area LIMIT 1');
            $stmtExiste->execute([':area' => $area]);
            $existente = $stmtExiste->fetch(PDO::FETCH_ASSOC);

            if ($existente) {
                $idArea = (int)$existente['id_area'];
                $pdo->prepare('UPDATE areas SET activo = :activo WHERE id_area = :id_area')
                    ->execute([':activo' => $activo, ':id_area' => $idArea]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO areas (area, activo) VALUES (:area, :activo)');
                $stmt->execute([':area' => $area, ':activo' => $activo]);
                $idArea = (int)$pdo->lastInsertId();
            }
        }

        if ($recibioMaterias) {
            $pdo->prepare('UPDATE areas_materias SET activo = 0 WHERE id_area = :id_area')
                ->execute([':id_area' => $idArea]);

            if (count($materias) > 0) {
                $stmt = $pdo->prepare("\n                    INSERT INTO areas_materias (id_area, id_materia, activo, orden)\n                    VALUES (:id_area, :id_materia, 1, :orden)\n                    ON DUPLICATE KEY UPDATE activo = 1, orden = VALUES(orden)\n                ");

                $orden = 1;
                foreach ($materias as $idMateria) {
                    $stmt->execute([
                        ':id_area' => $idArea,
                        ':id_materia' => $idMateria,
                        ':orden' => $orden,
                    ]);
                    $orden++;
                }
            }
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Área guardada correctamente.',
            'id_area' => $idArea,
            'materias_guardadas' => count($materias),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al guardar área.']);
    }
}

function areas_eliminar(): void
{
    $pdo = db();

    $data = get_json_body();
    $idArea = materias_int($data['id_area'] ?? 0);

    if ($idArea <= 0) {
        json_response(['exito' => false, 'mensaje' => 'ID de área inválido.']);
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM areas_materias WHERE id_area = :id_area')->execute([':id_area' => $idArea]);
        $pdo->prepare('DELETE FROM areas WHERE id_area = :id_area')->execute([':id_area' => $idArea]);
        $pdo->commit();

        json_response(['exito' => true, 'mensaje' => 'Área eliminada correctamente.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();

        try {
            $stmt = $pdo->prepare('UPDATE areas SET activo = 0 WHERE id_area = :id_area');
            $stmt->execute([':id_area' => $idArea]);
            json_response(['exito' => true, 'mensaje' => 'No se pudo borrar físicamente. El área fue desactivada.']);
        } catch (Throwable $inner) {
            log_error($inner, __FUNCTION__ . '_desactivar');
        }

        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'Error al eliminar área.']);
    }
}
