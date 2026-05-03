<?php
// backend/modules/global/obtener_materias_por_curso.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';

function global_json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function global_request_body(): array
{
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

function global_obtener_materias_por_curso(): void
{
    try {
        $body = global_request_body();

        $idCurso = (int)($_GET['id_curso'] ?? $_POST['id_curso'] ?? $body['id_curso'] ?? 0);
        $idDivision = (int)($_GET['id_division'] ?? $_POST['id_division'] ?? $body['id_division'] ?? 0);

        if ($idCurso <= 0) {
            global_json_response([
                'exito' => false,
                'mensaje' => 'Debe seleccionar un curso válido.'
            ], 400);
        }

        $pdo = db();

        $where = [
            'c.activo = 1',
            'm.activo = 1',
            'cu.activo = 1',
            'c.id_curso = :id_curso'
        ];

        $params = [
            ':id_curso' => $idCurso
        ];

        if ($idDivision > 0) {
            $where[] = 'c.id_division = :id_division';
            $params[':id_division'] = $idDivision;
        }

        $sql = "
            SELECT
                m.id_materia,
                m.materia,

                cu.id_curso,
                cu.nombre_curso,

                GROUP_CONCAT(DISTINCT d.id_division ORDER BY d.id_division SEPARATOR ',') AS ids_divisiones,
                GROUP_CONCAT(DISTINCT d.nombre_division ORDER BY d.nombre_division SEPARATOR ', ') AS divisiones,

                COUNT(DISTINCT c.id_catedra) AS cantidad_catedras
            FROM catedras c
            INNER JOIN materias m ON m.id_materia = c.id_materia
            INNER JOIN curso cu ON cu.id_curso = c.id_curso
            INNER JOIN division d ON d.id_division = c.id_division
            WHERE " . implode(' AND ', $where) . "
            GROUP BY
                m.id_materia,
                m.materia,
                cu.id_curso,
                cu.nombre_curso
            ORDER BY
                m.materia ASC
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $materias = $stmt->fetchAll(PDO::FETCH_ASSOC);

        global_json_response([
            'exito' => true,
            'mensaje' => 'Materias obtenidas correctamente.',
            'id_curso' => $idCurso,
            'id_division' => $idDivision > 0 ? $idDivision : null,
            'total' => count($materias),
            'materias' => $materias,
            'data' => $materias
        ]);
    } catch (Throwable $e) {
        error_log('[global_obtener_materias_por_curso] ' . $e->getMessage());

        global_json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener las materias del curso.'
        ], 500);
    }
}