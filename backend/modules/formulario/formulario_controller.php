<?php
// backend/modules/formulario/formulario_controller.php
declare(strict_types=1);

require_once __DIR__ . '/formulario_helpers.php';

function form_obtener_config_inscripcion(): void
{
    try {
        date_default_timezone_set('America/Argentina/Cordoba');
        $pdo = formulario_pdo();
        formulario_json(formulario_config_payload(formulario_config_actual($pdo)));
    } catch (Throwable $e) {
        log_error($e, 'formulario:obtener_config_inscripcion');

        formulario_json([
            'exito' => false,
            'mensaje' => 'Error obteniendo configuración de inscripción.',
        ], 500);
    }
}

function form_guardar_config_inscripcion(): void
{
    formulario_method('POST');

    $pdo = null;

    try {
        date_default_timezone_set('America/Argentina/Cordoba');
        $pdo = formulario_pdo();
        $in = formulario_body();

        $idConfig = isset($in['id_config']) ? (int)$in['id_config'] : 0;
        $nombre = trim((string)($in['nombre'] ?? $in['titulo'] ?? ''));
        $inicio = formulario_normalizar_fecha_mysql((string)($in['insc_inicio'] ?? $in['inicio'] ?? ''));
        $fin = formulario_normalizar_fecha_mysql((string)($in['insc_fin'] ?? $in['fin'] ?? ''));
        $mensajeCerrado = trim((string)($in['mensaje_cerrado'] ?? 'La inscripción está cerrada. Consultá Secretaría.'));
        $activo = isset($in['activo']) ? ((int)$in['activo'] === 1 ? 1 : 0) : 1;

        if ($nombre === '') {
            formulario_json(['exito' => false, 'mensaje' => 'Ingresá un título para el formulario.'], 422);
        }

        if ($inicio === '' || $fin === '') {
            formulario_json(['exito' => false, 'mensaje' => 'Completá fecha y hora de inicio y fin.'], 422);
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $inicio) !== 1) {
            formulario_json(['exito' => false, 'mensaje' => 'Formato inválido en la fecha de inicio.'], 422);
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $fin) !== 1) {
            formulario_json(['exito' => false, 'mensaje' => 'Formato inválido en la fecha de fin.'], 422);
        }

        $tsInicio = strtotime($inicio);
        $tsFin = strtotime($fin);

        if ($tsInicio === false || $tsFin === false || $tsInicio >= $tsFin) {
            formulario_json(['exito' => false, 'mensaje' => 'La fecha de inicio debe ser anterior a la fecha de fin.'], 422);
        }

        if ($mensajeCerrado === '') {
            $mensajeCerrado = 'La inscripción está cerrada. Consultá Secretaría.';
        }

        $pdo->beginTransaction();

        if ($activo === 1) {
            $pdo->exec('UPDATE mesas_config SET activo = 0');
        }

        if ($idConfig > 0) {
            $sql = "
                UPDATE mesas_config
                   SET nombre = :nombre,
                       insc_inicio = :inicio,
                       insc_fin = :fin,
                       mensaje_cerrado = :mensaje,
                       activo = :activo,
                       actualizado_en = NOW()
                 WHERE id_config = :id_config
                 LIMIT 1
            ";

            $st = $pdo->prepare($sql);
            $st->execute([
                ':nombre' => mb_strtoupper($nombre, 'UTF-8'),
                ':inicio' => $inicio,
                ':fin' => $fin,
                ':mensaje' => mb_strtoupper($mensajeCerrado, 'UTF-8'),
                ':activo' => $activo,
                ':id_config' => $idConfig,
            ]);

            if ($st->rowCount() === 0) {
                $existe = $pdo->prepare('SELECT COUNT(*) FROM mesas_config WHERE id_config = ?');
                $existe->execute([$idConfig]);

                if ((int)$existe->fetchColumn() === 0) {
                    throw new RuntimeException('La configuración indicada no existe.');
                }
            }
        } else {
            $sql = "
                INSERT INTO mesas_config (nombre, insc_inicio, insc_fin, mensaje_cerrado, activo, creado_en, actualizado_en)
                VALUES (:nombre, :inicio, :fin, :mensaje, :activo, NOW(), NOW())
            ";

            $st = $pdo->prepare($sql);
            $st->execute([
                ':nombre' => mb_strtoupper($nombre, 'UTF-8'),
                ':inicio' => $inicio,
                ':fin' => $fin,
                ':mensaje' => mb_strtoupper($mensajeCerrado, 'UTF-8'),
                ':activo' => $activo,
            ]);

            $idConfig = (int)$pdo->lastInsertId();
        }

        $pdo->commit();

        formulario_json([
            'exito' => true,
            'id_config' => $idConfig,
            'mensaje' => 'Configuración guardada correctamente.',
        ]);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'formulario:guardar_config_inscripcion');

        formulario_json([
            'exito' => false,
            'mensaje' => 'Error guardando configuración de inscripción.',
        ], 500);
    }
}
