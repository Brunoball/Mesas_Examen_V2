<?php
// backend/core/helpers.php
declare(strict_types=1);

function json_response(array $data, int $status = 200): void
{
    auditoria_registrar_respuesta($data, $status);

    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }

    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function log_error(Throwable $e, string $contexto = ''): void
{
    $logDir = __DIR__ . '/../logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }

    $linea = date('Y-m-d H:i:s') . " [{$contexto}] " . $e->getMessage()
        . ' en ' . $e->getFile() . ':' . $e->getLine() . PHP_EOL;

    error_log($linea, 3, $logDir . '/app.log');
}

function request_body(): array
{
    static $cache = null;

    if (is_array($cache)) {
        return $cache;
    }

    $raw = file_get_contents('php://input');
    $data = json_decode((string)$raw, true);

    if (is_array($data)) {
        $cache = $data;
        return $cache;
    }

    $cache = $_POST ?: [];
    return $cache;
}

function get_json_body(): array
{
    return request_body();
}

function paginacion(): array
{
    $pagina = max(1, (int)($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(1, (int)($_GET['por_pagina'] ?? 20)));
    $offset = ($pagina - 1) * $porPagina;

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => $offset,
    ];
}

function normalizar_mayuscula(?string $texto): string
{
    $texto = trim((string)$texto);
    return $texto === '' ? '' : mb_strtoupper($texto, 'UTF-8');
}

function auditoria_activa(): bool
{
    if (!function_exists('env_value')) {
        return true;
    }

    return strtolower((string)env_value('AUDITORIA_ACTIVA', 'true')) !== 'false';
}

function auditoria_log_get(): bool
{
    // Por defecto NO se auditan consultas ni listados.
    // La auditoría queda enfocada en acciones importantes: crear, editar, eliminar,
    // dar de baja/alta, asignar, numerar, generar, registrar, etc.
    if (!function_exists('env_value')) {
        return false;
    }

    return strtolower((string)env_value('AUDITORIA_LOG_GET', 'false')) === 'true';
}

function auditoria_debe_registrar(string $action, string $metodo): bool
{
    if (!auditoria_activa()) {
        return false;
    }

    $metodo = strtoupper($metodo);
    $a = strtolower(trim($action));

    if ($a === '' || $metodo === 'OPTIONS') {
        return false;
    }

    // En SaaS el login/registro se audita en mesas_master.login_auditoria.
    // No se audita acá porque db() apunta a la DB del tenant.
    if (in_array($a, ['inicio', 'registro'], true) || strpos($a, 'auth_') === 0) {
        return false;
    }

    // Nunca auditar acciones de lectura/listado/consulta, aunque vengan por POST.
    $accionesLectura = [
        'listar',
        'obtener',
        'catalogo',
        'catalogos',
        'condiciones',
        'buscar',
        'consulta',
        'consultar',
        'materias_por_curso',
        'por_curso',
        'por_curso_divisiones',
        'parametros',
        'auth_csrf_token',
    ];

    foreach ($accionesLectura as $palabra) {
        if (strpos($a, $palabra) !== false) {
            return false;
        }
    }

    // Si en algún momento querés auditar GET puntuales, podés activar AUDITORIA_LOG_GET=true,
    // pero los listados/obtener/catalogos siguen excluidos por la regla anterior.
    if ($metodo === 'GET' && !auditoria_log_get()) {
        return false;
    }

    // Acciones importantes que sí quedan registradas.
    $accionesImportantes = [
        'guardar',
        'crear',
        'agregar',
        'editar',
        'actualizar',
        'modificar',
        'eliminar',
        'baja',
        'alta',
        'activar',
        'desactivar',
        'estado',
        'asignar',
        'autogenerar',
        'generar',
        'registrar',
        'registro',
        'numerar',
        'reparar',
        'armado',
        'fase_',
        'confirmar',
        'importar',
    ];

    foreach ($accionesImportantes as $palabra) {
        if (strpos($a, $palabra) !== false) {
            return true;
        }
    }

    // Fallback por método: solo métodos mutables.
    return in_array($metodo, ['POST', 'PUT', 'PATCH', 'DELETE'], true);
}

function auditoria_action_actual(): string
{
    $body = request_body();
    return trim((string)($_GET['action'] ?? $_POST['action'] ?? $body['action'] ?? ''));
}

function auditoria_modulo_desde_action(string $action): string
{
    $action = strtolower($action);

    if ($action === 'inicio' || $action === 'registro' || strpos($action, 'auth_') === 0) {
        return 'login';
    }

    $prefijos = [
        'materias_' => 'materias',
        'areas_' => 'areas',
        'correlativas_' => 'correlativas',
        'talleres_' => 'talleres',
        'catedras_' => 'catedras',
        'docentes_' => 'docentes',
        'previas_' => 'previas',
        'mesas_' => 'mesas',
        'auditoria_' => 'auditoria',
        'configuracion_' => 'configuracion',
        'global_' => 'global',
    ];

    foreach ($prefijos as $prefijo => $modulo) {
        if (strpos($action, $prefijo) === 0) {
            return $modulo;
        }
    }

    if (in_array($action, ['obtener_listas', 'obtener_materias_por_curso', 'materias_por_curso'], true)) {
        return 'global';
    }

    return 'sistema';
}

function auditoria_tipo_operacion(string $action, string $metodo): string
{
    $a = strtolower($action);

    if ($a === 'inicio') return 'LOGIN';
    if ($a === 'registro') return 'REGISTRO_USUARIO';
    if ($metodo === 'GET' || strpos($a, 'listar') !== false || strpos($a, 'obtener') !== false || strpos($a, 'catalogos') !== false || strpos($a, 'condiciones') !== false) return 'LECTURA';
    if (strpos($a, 'guardar') !== false || strpos($a, 'crear') !== false || strpos($a, 'agregar') !== false) return 'GUARDAR';
    if (strpos($a, 'eliminar') !== false) return 'ELIMINAR';
    if (strpos($a, 'baja') !== false) return 'BAJA';
    if (strpos($a, 'alta') !== false) return 'ALTA';
    if (strpos($a, 'estado') !== false) return 'CAMBIO_ESTADO';
    if (strpos($a, 'asignar') !== false) return 'ASIGNAR';
    if ($metodo === 'DELETE') return 'ELIMINAR';
    if ($metodo === 'PUT' || $metodo === 'PATCH') return 'ACTUALIZAR';
    if ($metodo === 'POST') return 'EJECUCION';

    return $metodo;
}

function auditoria_limpiar_datos($valor)
{
    $clavesSensibles = [
        'password', 'contrasena', 'contraseña', 'hash_contrasena', 'hash', 'token',
        'csrf', 'csrf_token', 'authorization', 'x_auth_token', 'secret', 'api_key', 'apikey'
    ];

    if (is_array($valor)) {
        $limpio = [];
        foreach ($valor as $clave => $item) {
            $claveString = strtolower((string)$clave);
            $esSensible = false;
            foreach ($clavesSensibles as $sensible) {
                if (strpos($claveString, $sensible) !== false) {
                    $esSensible = true;
                    break;
                }
            }

            $limpio[$clave] = $esSensible ? '[OCULTO]' : auditoria_limpiar_datos($item);
        }
        return $limpio;
    }

    if (is_string($valor) && mb_strlen($valor, 'UTF-8') > 1000) {
        return mb_substr($valor, 0, 1000, 'UTF-8') . '... [TRUNCADO]';
    }

    return $valor;
}

function auditoria_json($valor): ?string
{
    $json = json_encode(auditoria_limpiar_datos($valor), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($json === false) {
        return null;
    }

    if (strlen($json) > 65000) {
        return substr($json, 0, 65000) . '... [TRUNCADO]';
    }

    return $json;
}

function auditoria_obtener_id_usuario_desde_sesion(): ?int
{
    if (function_exists('iniciar_sesion_si_falta')) {
        iniciar_sesion_si_falta();
    } elseif (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }

    $idUsuario = isset($_SESSION['usuario_id']) ? (int)$_SESSION['usuario_id'] : 0;
    return $idUsuario > 0 ? $idUsuario : null;
}

function auditoria_registrar_respuesta(array $respuesta, int $status = 200): void
{
    static $registrando = false;

    if ($registrando) {
        return;
    }

    $action = auditoria_action_actual();
    $metodo = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? ''));

    if (!auditoria_debe_registrar($action, $metodo)) {
        return;
    }

    if (!function_exists('db')) {
        return;
    }

    $registrando = true;

    try {
        $pdo = db();
        $idUsuario = auditoria_obtener_id_usuario_desde_sesion();
        $body = request_body();

        $requestData = [
            'get' => $_GET,
            'post' => $_POST,
            'body' => $body,
        ];

        $mensaje = isset($respuesta['mensaje']) ? (string)$respuesta['mensaje'] : null;
        $exito = array_key_exists('exito', $respuesta) ? ((bool)$respuesta['exito'] ? 1 : 0) : ($status >= 200 && $status < 400 ? 1 : 0);
        $stmt = $pdo->prepare("
            INSERT INTO auditoria (
                id_usuario,
                modulo,
                accion,
                tipo_operacion,
                metodo_http,
                ruta,
                ip,
                user_agent,
                datos_request,
                resultado,
                codigo_http,
                mensaje_respuesta,
                fecha_hora
            ) VALUES (
                :id_usuario,
                :modulo,
                :accion,
                :tipo_operacion,
                :metodo_http,
                :ruta,
                :ip,
                :user_agent,
                :datos_request,
                :resultado,
                :codigo_http,
                :mensaje_respuesta,
                NOW()
            )
        ");

        if ($idUsuario !== null) {
            $stmt->bindValue(':id_usuario', $idUsuario, PDO::PARAM_INT);
        } else {
            $stmt->bindValue(':id_usuario', null, PDO::PARAM_NULL);
        }

        $stmt->bindValue(':modulo', auditoria_modulo_desde_action($action));
        $stmt->bindValue(':accion', $action !== '' ? $action : '[sin_action]');
        $stmt->bindValue(':tipo_operacion', auditoria_tipo_operacion($action, $metodo));
        $stmt->bindValue(':metodo_http', $metodo);
        $stmt->bindValue(':ruta', (string)($_SERVER['REQUEST_URI'] ?? ''));
        $stmt->bindValue(':ip', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''));
        $stmt->bindValue(':user_agent', substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500));
        $stmt->bindValue(':datos_request', auditoria_json($requestData));
        $stmt->bindValue(':resultado', $exito, PDO::PARAM_INT);
        $stmt->bindValue(':codigo_http', $status, PDO::PARAM_INT);
        $stmt->bindValue(':mensaje_respuesta', $mensaje);
        $stmt->execute();
    } catch (Throwable $e) {
        // La auditoría nunca debe romper el sistema principal.
        log_error($e, 'auditoria_registrar_respuesta');
    } finally {
        $registrando = false;
    }
}
