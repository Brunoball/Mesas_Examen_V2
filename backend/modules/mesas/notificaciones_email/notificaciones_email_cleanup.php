<?php
// backend/modules/mesas/notificaciones_email/notificaciones_email_cleanup.php
declare(strict_types=1);

/**
 * Limpieza de estados internos de notificación de mesas.
 *
 * Importante: esto NO puede borrar emails que ya salieron del servidor/casilla del alumno.
 * Lo que limpia es el registro operativo del sistema para que una mesa eliminada o rearmada
 * no siga figurando como "notificada/enviada" dentro del panel.
 */

function mesas_notificaciones_cleanup_tabla_existe(PDO $pdo, string $tabla): bool
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $tabla)) {
        return false;
    }

    try {
        $stmt = $pdo->prepare('
            SELECT COUNT(*)
              FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :tabla
             LIMIT 1
        ');
        $stmt->execute([':tabla' => $tabla]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function mesas_notificaciones_cleanup_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $tabla) || !preg_match('/^[a-zA-Z0-9_]+$/', $columna)) {
        return false;
    }

    try {
        $stmt = $pdo->prepare('
            SELECT COUNT(*)
              FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :tabla
               AND COLUMN_NAME = :columna
             LIMIT 1
        ');
        $stmt->execute([
            ':tabla' => $tabla,
            ':columna' => $columna,
        ]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function mesas_notificaciones_cleanup_ids(array $ids): array
{
    $salida = [];
    foreach ($ids as $id) {
        $valor = (int)$id;
        if ($valor > 0) {
            $salida[$valor] = $valor;
        }
    }
    return array_values($salida);
}

function mesas_notificaciones_cleanup_placeholders(array $ids): string
{
    return implode(',', array_fill(0, count($ids), '?'));
}

function mesas_notificaciones_cleanup_recalcular_o_eliminar_lote(PDO $pdo, int $idLote): void
{
    if ($idLote <= 0 || !mesas_notificaciones_cleanup_tabla_existe($pdo, 'mesas_notificaciones_email_items')) {
        return;
    }

    if (!mesas_notificaciones_cleanup_tabla_existe($pdo, 'mesas_notificaciones_email_lotes')) {
        return;
    }

    $stmt = $pdo->prepare('
        SELECT
            COUNT(*) AS total_destinatarios,
            COALESCE(SUM(total_materias), 0) AS total_materias,
            COALESCE(SUM(CASE WHEN estado = "enviado" THEN 1 ELSE 0 END), 0) AS enviados,
            COALESCE(SUM(CASE WHEN estado = "pendiente" THEN 1 ELSE 0 END), 0) AS pendientes,
            COALESCE(SUM(CASE WHEN estado = "error" THEN 1 ELSE 0 END), 0) AS errores,
            COALESCE(SUM(CASE WHEN estado = "omitido" THEN 1 ELSE 0 END), 0) AS omitidos
        FROM mesas_notificaciones_email_items
        WHERE id_lote = ?
    ');
    $stmt->execute([$idLote]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $total = (int)($row['total_destinatarios'] ?? 0);
    if ($total <= 0) {
        $del = $pdo->prepare('DELETE FROM mesas_notificaciones_email_lotes WHERE id_lote = ?');
        $del->execute([$idLote]);
        return;
    }

    $pendientes = (int)($row['pendientes'] ?? 0);
    $errores = (int)($row['errores'] ?? 0);
    $enviados = (int)($row['enviados'] ?? 0);
    $estado = 'preparado';
    $finalizadoSql = 'NULL';

    if ($pendientes <= 0) {
        $estado = $errores > 0 ? 'finalizado_con_errores' : 'finalizado';
        $finalizadoSql = 'COALESCE(finalizado_en, NOW())';
    } elseif ($enviados > 0 || $errores > 0) {
        $estado = 'enviando';
    }

    $upd = $pdo->prepare("
        UPDATE mesas_notificaciones_email_lotes
           SET estado = :estado,
               total_destinatarios = :total_destinatarios,
               total_materias = :total_materias,
               enviados = :enviados,
               pendientes = :pendientes,
               errores = :errores,
               omitidos = :omitidos,
               finalizado_en = {$finalizadoSql}
         WHERE id_lote = :id_lote
         LIMIT 1
    ");
    $upd->execute([
        ':estado' => $estado,
        ':total_destinatarios' => $total,
        ':total_materias' => (int)($row['total_materias'] ?? 0),
        ':enviados' => $enviados,
        ':pendientes' => $pendientes,
        ':errores' => $errores,
        ':omitidos' => (int)($row['omitidos'] ?? 0),
        ':id_lote' => $idLote,
    ]);
}

function mesas_notificaciones_cleanup_items_por_inscripciones(PDO $pdo, array $idsInscripciones): array
{
    $idsInscripciones = mesas_notificaciones_cleanup_ids($idsInscripciones);
    if (!$idsInscripciones || !mesas_notificaciones_cleanup_tabla_existe($pdo, 'mesas_notificaciones_email_items')) {
        return [
            'items_eliminados' => 0,
            'lotes_afectados' => 0,
        ];
    }

    $ph = mesas_notificaciones_cleanup_placeholders($idsInscripciones);

    $stmtLotes = $pdo->prepare("SELECT DISTINCT id_lote FROM mesas_notificaciones_email_items WHERE id_inscripcion IN ({$ph})");
    $stmtLotes->execute($idsInscripciones);
    $idsLotes = mesas_notificaciones_cleanup_ids($stmtLotes->fetchAll(PDO::FETCH_COLUMN) ?: []);

    $stmtDelete = $pdo->prepare("DELETE FROM mesas_notificaciones_email_items WHERE id_inscripcion IN ({$ph})");
    $stmtDelete->execute($idsInscripciones);
    $itemsEliminados = $stmtDelete->rowCount();

    foreach ($idsLotes as $idLote) {
        mesas_notificaciones_cleanup_recalcular_o_eliminar_lote($pdo, $idLote);
    }

    return [
        'items_eliminados' => $itemsEliminados,
        'lotes_afectados' => count($idsLotes),
    ];
}

function mesas_notificaciones_cleanup_reset_inscripciones(PDO $pdo, array $idsInscripciones): int
{
    $idsInscripciones = mesas_notificaciones_cleanup_ids($idsInscripciones);
    if (!$idsInscripciones || !mesas_notificaciones_cleanup_tabla_existe($pdo, 'formulario_inscripciones_detalle')) {
        return 0;
    }

    $sets = [];
    if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'email_mesa_enviado')) {
        $sets[] = 'email_mesa_enviado = 0';
    }
    if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'email_mesa_enviado_en')) {
        $sets[] = 'email_mesa_enviado_en = NULL';
    }
    if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'email_mesa_error')) {
        $sets[] = 'email_mesa_error = NULL';
    }
    if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'estado')) {
        $tieneMesa = mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'fecha_mesa')
            && mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'id_turno')
            && mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'numero_mesa');

        $sets[] = $tieneMesa
            ? "estado = CASE WHEN fecha_mesa IS NOT NULL AND id_turno IS NOT NULL AND numero_mesa IS NOT NULL THEN 'mesa_asignada' ELSE 'inscripta' END"
            : "estado = 'inscripta'";
    }

    if (!$sets) {
        return 0;
    }

    $ph = mesas_notificaciones_cleanup_placeholders($idsInscripciones);
    $whereEstado = mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'estado')
        ? " AND estado <> 'anulada'"
        : '';

    $stmt = $pdo->prepare("
        UPDATE formulario_inscripciones_detalle
           SET " . implode(', ', $sets) . "
         WHERE id_inscripcion IN ({$ph}){$whereEstado}
    ");
    $stmt->execute($idsInscripciones);
    return $stmt->rowCount();
}

function mesas_notificaciones_cleanup_limpiar_asignacion_previas(PDO $pdo, array $idsPrevias): int
{
    $idsPrevias = mesas_notificaciones_cleanup_ids($idsPrevias);
    if (!$idsPrevias || !mesas_notificaciones_cleanup_tabla_existe($pdo, 'formulario_inscripciones_detalle')) {
        return 0;
    }

    $sets = [];
    foreach (['fecha_mesa', 'id_turno', 'turno_nombre', 'numero_mesa', 'numero_grupo', 'email_mesa_enviado_en', 'email_mesa_error'] as $columna) {
        if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', $columna)) {
            $sets[] = "{$columna} = NULL";
        }
    }

    if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'email_mesa_enviado')) {
        $sets[] = 'email_mesa_enviado = 0';
    }
    if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'estado')) {
        $sets[] = "estado = 'inscripta'";
    }

    if (!$sets) {
        return 0;
    }

    $ph = mesas_notificaciones_cleanup_placeholders($idsPrevias);
    $whereEstado = mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'estado')
        ? " AND estado <> 'anulada'"
        : '';

    $stmt = $pdo->prepare("
        UPDATE formulario_inscripciones_detalle
           SET " . implode(', ', $sets) . "
         WHERE id_previa IN ({$ph}){$whereEstado}
    ");
    $stmt->execute($idsPrevias);
    return $stmt->rowCount();
}

function mesas_notificaciones_cleanup_por_previas(PDO $pdo, array $idsPrevias, bool $limpiarAsignacion = true): array
{
    $idsPrevias = mesas_notificaciones_cleanup_ids($idsPrevias);
    if (!$idsPrevias || !mesas_notificaciones_cleanup_tabla_existe($pdo, 'formulario_inscripciones_detalle')) {
        return [
            'previas_afectadas' => 0,
            'inscripciones_afectadas' => 0,
            'detalles_limpiados' => 0,
            'detalles_reiniciados' => 0,
            'items_eliminados' => 0,
            'lotes_afectados' => 0,
        ];
    }

    $ph = mesas_notificaciones_cleanup_placeholders($idsPrevias);
    $stmtInscripciones = $pdo->prepare("SELECT DISTINCT id_inscripcion FROM formulario_inscripciones_detalle WHERE id_previa IN ({$ph})");
    $stmtInscripciones->execute($idsPrevias);
    $idsInscripciones = mesas_notificaciones_cleanup_ids($stmtInscripciones->fetchAll(PDO::FETCH_COLUMN) ?: []);

    $detallesLimpiados = $limpiarAsignacion
        ? mesas_notificaciones_cleanup_limpiar_asignacion_previas($pdo, $idsPrevias)
        : 0;

    $detallesReiniciados = mesas_notificaciones_cleanup_reset_inscripciones($pdo, $idsInscripciones);
    $items = mesas_notificaciones_cleanup_items_por_inscripciones($pdo, $idsInscripciones);

    return [
        'previas_afectadas' => count($idsPrevias),
        'inscripciones_afectadas' => count($idsInscripciones),
        'detalles_limpiados' => $detallesLimpiados,
        'detalles_reiniciados' => $detallesReiniciados,
        'items_eliminados' => (int)($items['items_eliminados'] ?? 0),
        'lotes_afectados' => (int)($items['lotes_afectados'] ?? 0),
    ];
}

function mesas_notificaciones_cleanup_por_numeros_mesa(PDO $pdo, array $numerosMesa): array
{
    $numerosMesa = mesas_notificaciones_cleanup_ids($numerosMesa);
    if (!$numerosMesa) {
        return [
            'numeros_mesa_afectados' => 0,
            'previas_afectadas' => 0,
            'inscripciones_afectadas' => 0,
            'detalles_limpiados' => 0,
            'detalles_reiniciados' => 0,
            'items_eliminados' => 0,
            'lotes_afectados' => 0,
        ];
    }

    $idsPrevias = [];
    $ph = mesas_notificaciones_cleanup_placeholders($numerosMesa);

    if (mesas_notificaciones_cleanup_tabla_existe($pdo, 'mesas')) {
        $stmt = $pdo->prepare("SELECT DISTINCT id_previa FROM mesas WHERE numero_mesa IN ({$ph}) AND id_previa IS NOT NULL");
        $stmt->execute($numerosMesa);
        $idsPrevias = array_merge($idsPrevias, $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
    }

    if (mesas_notificaciones_cleanup_tabla_existe($pdo, 'formulario_inscripciones_detalle')
        && mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'numero_mesa')) {
        $stmt = $pdo->prepare("SELECT DISTINCT id_previa FROM formulario_inscripciones_detalle WHERE numero_mesa IN ({$ph})");
        $stmt->execute($numerosMesa);
        $idsPrevias = array_merge($idsPrevias, $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
    }

    $resultado = mesas_notificaciones_cleanup_por_previas($pdo, $idsPrevias, true);
    $resultado['numeros_mesa_afectados'] = count($numerosMesa);
    return $resultado;
}

function mesas_notificaciones_cleanup_todo(PDO $pdo): array
{
    $detallesLimpiados = 0;
    $itemsEliminados = 0;
    $lotesEliminados = 0;

    if (mesas_notificaciones_cleanup_tabla_existe($pdo, 'formulario_inscripciones_detalle')) {
        $sets = [];
        foreach (['fecha_mesa', 'id_turno', 'turno_nombre', 'numero_mesa', 'numero_grupo', 'email_mesa_enviado_en', 'email_mesa_error'] as $columna) {
            if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', $columna)) {
                $sets[] = "{$columna} = NULL";
            }
        }
        if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'email_mesa_enviado')) {
            $sets[] = 'email_mesa_enviado = 0';
        }
        if (mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'estado')) {
            $sets[] = "estado = 'inscripta'";
        }

        if ($sets) {
            $whereEstado = mesas_notificaciones_cleanup_columna_existe($pdo, 'formulario_inscripciones_detalle', 'estado')
                ? " WHERE estado <> 'anulada'"
                : '';
            $detallesLimpiados = (int)$pdo->exec('UPDATE formulario_inscripciones_detalle SET ' . implode(', ', $sets) . $whereEstado);
        }
    }

    if (mesas_notificaciones_cleanup_tabla_existe($pdo, 'mesas_notificaciones_email_items')) {
        $itemsEliminados = (int)$pdo->exec('DELETE FROM mesas_notificaciones_email_items');
    }

    if (mesas_notificaciones_cleanup_tabla_existe($pdo, 'mesas_notificaciones_email_lotes')) {
        $lotesEliminados = (int)$pdo->exec('DELETE FROM mesas_notificaciones_email_lotes');
    }

    return [
        'detalles_limpiados' => $detallesLimpiados,
        'items_eliminados' => $itemsEliminados,
        'lotes_eliminados' => $lotesEliminados,
    ];
}
