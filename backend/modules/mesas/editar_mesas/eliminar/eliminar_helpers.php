<?php
// backend/modules/mesas/editar_mesas/eliminar/eliminar_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../helpers_editar_mesas.php';

function mesas_editar_eliminar_input(): array
{
    $data = mesas_editar_input_json();
    if (!is_array($data)) {
        $data = [];
    }
    return array_merge($_GET ?? [], $data);
}

function mesas_editar_eliminar_resolver_grupo(array $data): int
{
    $numeroGrupo = (int)($data['numero_grupo'] ?? $data['id_grupo'] ?? $data['grupo'] ?? 0);
    if ($numeroGrupo <= 0) {
        throw new InvalidArgumentException('Debe indicar el grupo de mesa a eliminar.');
    }
    return $numeroGrupo;
}

function mesas_editar_eliminar_resolver_numero(array $data): int
{
    $numeroMesa = (int)($data['numero_mesa'] ?? $data['numero'] ?? 0);
    if ($numeroMesa <= 0) {
        throw new InvalidArgumentException('Debe indicar el número de mesa a quitar del grupo.');
    }
    return $numeroMesa;
}

function mesas_editar_eliminar_filas_grupo(PDO $pdo, int $numeroGrupo): array
{
    $stmt = $pdo->prepare('
        SELECT numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area, tipo_mesa, prioridad, cantidad_alumnos, orden
        FROM mesas_grupos
        WHERE numero_grupo = ?
        ORDER BY orden ASC, numero_mesa ASC
    ');
    $stmt->execute([$numeroGrupo]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_editar_eliminar_fila_numero_grupo(PDO $pdo, int $numeroGrupo, int $numeroMesa): ?array
{
    $stmt = $pdo->prepare('
        SELECT numero_grupo, numero_mesa, fecha_mesa, id_turno, hora, id_area, tipo_mesa, prioridad, cantidad_alumnos, orden
        FROM mesas_grupos
        WHERE numero_grupo = ?
          AND numero_mesa = ?
        LIMIT 1
    ');
    $stmt->execute([$numeroGrupo, $numeroMesa]);
    $fila = $stmt->fetch(PDO::FETCH_ASSOC);
    return $fila ?: null;
}

function mesas_editar_eliminar_reordenar_grupo(PDO $pdo, int $numeroGrupo): void
{
    $stmt = $pdo->prepare('
        SELECT numero_mesa
        FROM mesas_grupos
        WHERE numero_grupo = ?
        ORDER BY orden ASC, numero_mesa ASC
    ');
    $stmt->execute([$numeroGrupo]);
    $numeros = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    $orden = 1;
    $stmtUpdate = $pdo->prepare('
        UPDATE mesas_grupos
        SET orden = ?
        WHERE numero_grupo = ?
          AND numero_mesa = ?
    ');

    foreach ($numeros as $numeroMesa) {
        if ($numeroMesa <= 0) {
            continue;
        }
        $stmtUpdate->execute([$orden, $numeroGrupo, $numeroMesa]);
        $orden++;
    }
}

function mesas_editar_eliminar_pasar_filas_a_no_agrupadas(PDO $pdo, array $filas): int
{
    $cantidad = 0;
    foreach ($filas as $fila) {
        if ((int)($fila['numero_mesa'] ?? 0) <= 0) {
            continue;
        }
        mesas_editar_insertar_no_agrupada_desde_grupo($pdo, $fila);
        $cantidad++;
    }
    return $cantidad;
}

function mesas_editar_eliminar_no_agrupada(PDO $pdo, array $data): array
{
    $idNoAgrupada = (int)($data['id_no_agrupada'] ?? 0);
    $numeroMesa = (int)($data['numero_mesa'] ?? 0);

    if ($idNoAgrupada <= 0 && $numeroMesa <= 0) {
        throw new InvalidArgumentException('Debe indicar el número sin agrupar a eliminar.');
    }

    $where = $idNoAgrupada > 0 ? 'id = ?' : 'numero_mesa = ?';
    $valor = $idNoAgrupada > 0 ? $idNoAgrupada : $numeroMesa;

    $stmtSelect = $pdo->prepare("SELECT numero_mesa FROM mesas_no_agrupadas WHERE {$where} LIMIT 1");
    $stmtSelect->execute([$valor]);
    $numeroMesaReal = (int)($stmtSelect->fetchColumn() ?: 0);

    if ($numeroMesaReal <= 0) {
        throw new RuntimeException('No se encontró el número sin agrupar solicitado.');
    }

    $stmtDeleteNo = $pdo->prepare("DELETE FROM mesas_no_agrupadas WHERE {$where}");
    $stmtDeleteNo->execute([$valor]);

    // Para una no agrupada eliminada desde la vista principal se quita el número del armado.
    // Esta es la misma lógica segura que tenía el módulo antes de separar eliminar.
    $stmtDeleteMesas = $pdo->prepare('DELETE FROM mesas WHERE numero_mesa = ?');
    $stmtDeleteMesas->execute([$numeroMesaReal]);

    return [
        'numero_mesa' => $numeroMesaReal,
        'filas_mesas_eliminadas' => $stmtDeleteMesas->rowCount(),
        'filas_no_agrupadas_eliminadas' => $stmtDeleteNo->rowCount(),
    ];
}
