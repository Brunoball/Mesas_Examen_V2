<?php
// backend/modules/global/obtener_listas.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function global_obtener_listas(): void
{
    try {
        $pdo = db();

        $stmt = $pdo->query("\n            SELECT\n                id_especialidad AS id,\n                especialidad AS nombre,\n                cupo\n            FROM especialidad\n            ORDER BY nombre ASC\n        ");

        $especialidad = [];
        foreach ($stmt->fetchAll() as $row) {
            $especialidad[] = [
                'id' => (int)$row['id'],
                'nombre' => (string)$row['nombre'],
                'cupo' => $row['cupo'] === null ? null : (int)$row['cupo'],
            ];
        }

        json_response([
            'exito' => true,
            'especialidad' => $especialidad,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'global_obtener_listas');
        json_response(['exito' => false, 'mensaje' => 'Error al obtener listas.'], 500);
    }
}
