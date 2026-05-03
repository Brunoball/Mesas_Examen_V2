<?php
// backend/modules/global/obtener_listas.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function global_obtener_listas(): void
{
    try {
        $pdo = db();

        $cursos = $pdo->query("
            SELECT
                id_curso,
                nombre_curso
            FROM curso
            WHERE activo = 1
            ORDER BY id_curso ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $divisiones = $pdo->query("
            SELECT
                id_division,
                nombre_division
            FROM division
            WHERE activo = 1
            ORDER BY nombre_division ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $condiciones = $pdo->query("
            SELECT
                id_condicion,
                condicion
            FROM condicion
            WHERE activo = 1
            ORDER BY id_condicion ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        $especialidad = [];
        try {
            $stmtEspecialidad = $pdo->query("
                SELECT
                    id_especialidad AS id,
                    especialidad AS nombre,
                    cupo
                FROM especialidad
                WHERE activo = 1
                ORDER BY especialidad ASC
            ");

            foreach ($stmtEspecialidad->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $especialidad[] = [
                    'id' => (int)$row['id'],
                    'nombre' => (string)$row['nombre'],
                    'cupo' => $row['cupo'] === null ? null : (int)$row['cupo'],
                ];
            }
        } catch (Throwable $e) {
            // Especialidad no debe romper los catálogos globales básicos.
            log_error($e, 'global_obtener_listas:especialidad');
        }

        $payload = [
            'cursos' => $cursos,
            'divisiones' => $divisiones,
            'condiciones' => $condiciones,
            'especialidad' => $especialidad,
            'especialidades' => $especialidad,
        ];

        json_response([
            'exito' => true,
            'mensaje' => 'Listas globales obtenidas correctamente.',
            'data' => $payload,
            ...$payload,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'global_obtener_listas');

        json_response([
            'exito' => false,
            'mensaje' => 'Error al obtener listas globales.',
        ], 500);
    }
}
