<?php
// backend/modules/auditoria/auditoria_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function auditoria_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function auditoria_paginacion(): array
{
    $pagina = max(1, auditoria_int($_GET['pagina'] ?? 1));
    $porPagina = min(200, max(1, auditoria_int($_GET['por_pagina'] ?? 50)));

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => ($pagina - 1) * $porPagina,
    ];
}

function auditoria_listar(): void
{
    $pdo = db();
    $pag = auditoria_paginacion();

    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $modulo = trim((string)($_GET['modulo'] ?? ''));
    $accion = trim((string)($_GET['accion'] ?? ''));
    $tipoOperacion = trim((string)($_GET['tipo_operacion'] ?? ''));
    $idUsuario = auditoria_int($_GET['id_usuario'] ?? 0);
    $resultado = isset($_GET['resultado']) && $_GET['resultado'] !== '' ? auditoria_int($_GET['resultado']) : null;
    $fechaDesde = trim((string)($_GET['fecha_desde'] ?? ''));
    $fechaHasta = trim((string)($_GET['fecha_hasta'] ?? ''));

    $where = ['1 = 1'];
    $params = [];

    if ($busqueda !== '') {
        $where[] = '(
            u.Nombre_Completo LIKE :busqueda_usuario
            OR u.rol LIKE :busqueda_rol
            OR a.modulo LIKE :busqueda_modulo
            OR a.accion LIKE :busqueda_accion
            OR a.tipo_operacion LIKE :busqueda_tipo
            OR a.mensaje_respuesta LIKE :busqueda_mensaje
            OR a.ip LIKE :busqueda_ip
        )';
        $like = '%' . $busqueda . '%';
        $params[':busqueda_usuario'] = $like;
        $params[':busqueda_rol'] = $like;
        $params[':busqueda_modulo'] = $like;
        $params[':busqueda_accion'] = $like;
        $params[':busqueda_tipo'] = $like;
        $params[':busqueda_mensaje'] = $like;
        $params[':busqueda_ip'] = $like;
    }

    if ($modulo !== '') {
        $where[] = 'a.modulo = :modulo';
        $params[':modulo'] = $modulo;
    }

    if ($accion !== '') {
        $where[] = 'a.accion = :accion';
        $params[':accion'] = $accion;
    }

    if ($tipoOperacion !== '') {
        $where[] = 'a.tipo_operacion = :tipo_operacion';
        $params[':tipo_operacion'] = $tipoOperacion;
    }

    if ($idUsuario > 0) {
        $where[] = 'a.id_usuario = :id_usuario';
        $params[':id_usuario'] = $idUsuario;
    }

    if ($resultado !== null && in_array($resultado, [0, 1], true)) {
        $where[] = 'a.resultado = :resultado';
        $params[':resultado'] = $resultado;
    }

    if ($fechaDesde !== '') {
        $where[] = 'a.fecha_hora >= :fecha_desde';
        $params[':fecha_desde'] = $fechaDesde . ' 00:00:00';
    }

    if ($fechaHasta !== '') {
        $where[] = 'a.fecha_hora <= :fecha_hasta';
        $params[':fecha_hasta'] = $fechaHasta . ' 23:59:59';
    }

    $whereSql = implode(' AND ', $where);

    try {
        $stmtCount = $pdo->prepare("\n            SELECT COUNT(*)\n            FROM auditoria a\n            LEFT JOIN usuarios u ON u.idUsuario = a.id_usuario\n            WHERE {$whereSql}\n        ");
        foreach ($params as $key => $value) {
            $stmtCount->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        $sql = "
            SELECT
                a.id_auditoria,
                a.id_usuario,
                u.Nombre_Completo,
                u.rol,
                a.modulo,
                a.accion,
                a.tipo_operacion,
                a.metodo_http,
                a.ruta,
                a.ip,
                a.user_agent,
                a.datos_request,
                a.resultado,
                a.codigo_http,
                a.mensaje_respuesta,
                a.fecha_hora
            FROM auditoria a
            LEFT JOIN usuarios u ON u.idUsuario = a.id_usuario
            WHERE {$whereSql}
            ORDER BY a.fecha_hora DESC, a.id_auditoria DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $pag['por_pagina'], PDO::PARAM_INT);
        $stmt->bindValue(':offset', $pag['offset'], PDO::PARAM_INT);
        $stmt->execute();

        json_response([
            'exito' => true,
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'paginacion' => [
                'pagina' => $pag['pagina'],
                'por_pagina' => $pag['por_pagina'],
                'total' => $total,
                'paginas' => max(1, (int)ceil($total / $pag['por_pagina'])),
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo obtener la auditoría.',
        ], 500);
    }
}

function auditoria_obtener(): void
{
    $pdo = db();
    $idAuditoria = auditoria_int($_GET['id_auditoria'] ?? $_GET['id'] ?? 0);

    if ($idAuditoria <= 0) {
        json_response(['exito' => false, 'mensaje' => 'ID de auditoría inválido.'], 422);
    }

    try {
        $stmt = $pdo->prepare('
            SELECT
                a.id_auditoria,
                a.id_usuario,
                u.Nombre_Completo,
                u.rol,
                a.modulo,
                a.accion,
                a.tipo_operacion,
                a.metodo_http,
                a.ruta,
                a.ip,
                a.user_agent,
                a.datos_request,
                a.resultado,
                a.codigo_http,
                a.mensaje_respuesta,
                a.fecha_hora
            FROM auditoria a
            LEFT JOIN usuarios u ON u.idUsuario = a.id_usuario
            WHERE a.id_auditoria = :id_auditoria
            LIMIT 1
        ');
        $stmt->execute([':id_auditoria' => $idAuditoria]);
        $registro = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$registro) {
            json_response(['exito' => false, 'mensaje' => 'Registro de auditoría no encontrado.'], 404);
        }

        json_response(['exito' => true, 'data' => $registro]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'No se pudo obtener el registro de auditoría.'], 500);
    }
}
