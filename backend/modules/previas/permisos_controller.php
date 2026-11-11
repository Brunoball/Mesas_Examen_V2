<?php
// Seguimiento administrativo del permiso de examen: un registro por DNI + turno.
declare(strict_types=1);

/**
 * Se normaliza el turno antes de utilizarlo como clave en la base de datos.
 * Nunca se utiliza una fecha de impresión como sustituto del turno de examen.
 */
function previas_permisos_periodo($valor): ?string
{
    $periodo = strtoupper(trim((string)$valor));
    $periodo = str_replace('SETIEMBRE/', 'SEPTIEMBRE/', $periodo);
    $meses = 'ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE';
    return preg_match('/^(?:' . $meses . ')\/(?:20\d{2}|2100)$/D', $periodo) ? $periodo : null;
}

function previas_permisos_dni_sql(string $alias = 'p'): string
{
    // CAST(... AS CHAR) puede heredar utf8mb4_general_ci de la conexión PDO,
    // mientras previas_permisos.dni es utf8mb4_unicode_ci. Eso dispara 1267
    // (Illegal mix of collations) tanto en el listado como en el resumen.
    // Convertimos explícitamente a utf8mb4 y fijamos la colación de la
    // columna de destino sin modificar la tabla ni perder registros.
    return "CONVERT(REPLACE(REPLACE(REPLACE({$alias}.dni, '.', ''), '-', ''), ' ', '') USING utf8mb4) COLLATE utf8mb4_unicode_ci";
}

function previas_permisos_estado_sql(string $alias = 'pp'): string
{
    return "CASE WHEN {$alias}.entregado_en IS NOT NULL THEN 'entregado' WHEN {$alias}.impreso_en IS NOT NULL THEN 'impreso' ELSE 'pendiente' END";
}

function previas_permisos_filtrar_sql(string $estado): string
{
    switch ($estado) {
        case 'pendiente': return 'pp.impreso_en IS NULL AND pp.entregado_en IS NULL';
        case 'impreso': return 'pp.impreso_en IS NOT NULL AND pp.entregado_en IS NULL';
        case 'entregado': return 'pp.entregado_en IS NOT NULL';
        case 'sin_entregar': return 'pp.entregado_en IS NULL';
        default: return '';
    }
}

function previas_permisos_resumen(): void
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $periodo = previas_permisos_periodo($_GET['periodo'] ?? '');
    if ($periodo === null) {
        json_response(['exito' => false, 'mensaje' => 'Seleccioná un mes y año de examen válidos.'], 422);
    }

    try {
        $pdo = db();
        $dniSql = previas_permisos_dni_sql('p');
        $sql = "
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN pp.impreso_en IS NULL AND pp.entregado_en IS NULL THEN 1 ELSE 0 END), 0) AS pendientes,
                COALESCE(SUM(CASE WHEN pp.impreso_en IS NOT NULL AND pp.entregado_en IS NULL THEN 1 ELSE 0 END), 0) AS impresos,
                COALESCE(SUM(CASE WHEN pp.entregado_en IS NOT NULL THEN 1 ELSE 0 END), 0) AS entregados
            FROM (
                SELECT DISTINCT {$dniSql} AS dni
                FROM previas p
                WHERE p.activo = 1 AND COALESCE(p.inscripcion, 0) = 1
            ) alumnos
            LEFT JOIN previas_permisos pp ON pp.dni = alumnos.dni AND pp.periodo = :periodo
        ";
        $st = $pdo->prepare($sql);
        $st->execute([':periodo' => $periodo]);
        json_response(['exito' => true, 'data' => $st->fetch(PDO::FETCH_ASSOC), 'periodo' => $periodo]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'No se pudo consultar el seguimiento de permisos. Verificá la migración SQL.'], 500);
    }
}

function previas_permisos_actualizar(): void
{
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $body = previas_body();
    $idPrevia = previas_int($body['id_previa'] ?? 0);
    $periodo = previas_permisos_periodo($body['periodo'] ?? '');
    $estado = strtolower(trim((string)($body['estado'] ?? '')));
    if ($idPrevia <= 0 || $periodo === null || !in_array($estado, ['pendiente', 'impreso', 'entregado'], true)) {
        json_response(['exito' => false, 'mensaje' => 'Previa, turno o estado de permiso inválido.'], 422);
    }

    $pdo = db();
    try {
        $pdo->beginTransaction();
        // El DNI siempre se resuelve desde la previa activa, nunca desde el navegador.
        $st = $pdo->prepare('SELECT dni, alumno FROM previas WHERE id_previa = :id AND activo = 1 AND inscripcion = 1 LIMIT 1 FOR UPDATE');
        $st->execute([':id' => $idPrevia]);
        $previa = $st->fetch(PDO::FETCH_ASSOC);
        if (!$previa) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'El alumno ya no figura inscripto. Actualizá el listado.'], 409);
        }
        $dni = preg_replace('/\D+/', '', (string)$previa['dni']) ?? '';
        if ($dni === '') {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'El alumno no tiene un DNI válido.'], 422);
        }

        $usuario = usuario_id();
        if ($estado === 'pendiente') {
            // Volver a pendiente borra la constancia activa; la acción queda en auditoría.
            $st = $pdo->prepare('DELETE FROM previas_permisos WHERE dni = :dni AND periodo = :periodo');
            $st->execute([':dni' => $dni, ':periodo' => $periodo]);
        } elseif ($estado === 'impreso') {
            $st = $pdo->prepare("
                INSERT INTO previas_permisos (dni, periodo, impreso_en, impreso_por, actualizado_por)
                VALUES (:dni, :periodo, NOW(), :usuario1, :usuario2)
                ON DUPLICATE KEY UPDATE
                    impreso_en = COALESCE(impreso_en, NOW()),
                    impreso_por = COALESCE(impreso_por, VALUES(impreso_por)),
                    entregado_en = NULL,
                    entregado_por = NULL,
                    actualizado_por = VALUES(actualizado_por)
            ");
            $st->execute([':dni' => $dni, ':periodo' => $periodo, ':usuario1' => $usuario, ':usuario2' => $usuario]);
        } else {
            $st = $pdo->prepare("
                INSERT INTO previas_permisos (dni, periodo, impreso_en, impreso_por, entregado_en, entregado_por, actualizado_por)
                VALUES (:dni, :periodo, NOW(), :usuario1, NOW(), :usuario2, :usuario3)
                ON DUPLICATE KEY UPDATE
                    impreso_en = COALESCE(impreso_en, NOW()),
                    impreso_por = COALESCE(impreso_por, VALUES(impreso_por)),
                    entregado_en = COALESCE(entregado_en, NOW()),
                    entregado_por = COALESCE(entregado_por, VALUES(entregado_por)),
                    actualizado_por = VALUES(actualizado_por)
            ");
            $st->execute([':dni' => $dni, ':periodo' => $periodo, ':usuario1' => $usuario, ':usuario2' => $usuario, ':usuario3' => $usuario]);
        }

        $pdo->commit();
        json_response([
            'exito' => true,
            'mensaje' => 'Estado del permiso actualizado correctamente.',
            'data' => ['dni' => $dni, 'periodo' => $periodo, 'estado' => $estado],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'No se pudo guardar el estado del permiso. Verificá la migración SQL.'], 500);
    }
}
