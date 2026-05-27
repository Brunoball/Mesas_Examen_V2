<?php
// backend/core/auth.php
// Auth SaaS: valida session_key en mesas_master y deja disponible usuario/tenant actual.
declare(strict_types=1);

require_once __DIR__ . '/../config/db.php';

function iniciar_sesion_si_falta(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
}

function auth_header_value(string $serverKey): string
{
    return trim((string)($_SERVER[$serverKey] ?? ''));
}

function request_auth_token(): string
{
    if (function_exists('request_session_key')) {
        return request_session_key();
    }

    $authorization = auth_header_value('HTTP_AUTHORIZATION');
    if ($authorization !== '') {
        if (stripos($authorization, 'Bearer ') === 0) {
            return trim(substr($authorization, 7));
        }
        return $authorization;
    }

    foreach (['HTTP_X_AUTH_TOKEN', 'HTTP_X_SESSION', 'HTTP_X_SESSION_KEY'] as $header) {
        $value = auth_header_value($header);
        if ($value !== '') return $value;
    }

    return '';
}

function auth_context(): ?array
{
    if (!function_exists('tenant_context')) {
        return null;
    }

    return tenant_context(request_auth_token());
}

function require_auth(): void
{
    iniciar_sesion_si_falta();

    $ctx = auth_context();
    if ($ctx) {
        try {
            if (function_exists('assert_request_tenant_matches_context')) {
                assert_request_tenant_matches_context($ctx);
            }
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'TENANT_MISMATCH') {
                json_response([
                    'exito' => false,
                    'mensaje' => 'El tenant enviado no coincide con la sesión activa.',
                ], 403);
            }

            throw $e;
        }

        $_SESSION['usuario_id'] = (int)$ctx['idUsuarioMaster'];
        $_SESSION['idUsuarioMaster'] = (int)$ctx['idUsuarioMaster'];
        $_SESSION['idTenant'] = (int)$ctx['idTenant'];
        $_SESSION['usuario'] = (string)$ctx['usuario'];
        $_SESSION['rol'] = (string)$ctx['rol'];
        return;
    }

    json_response(['exito' => false, 'mensaje' => 'Sesión expirada.'], 401);
}

function usuario_id(): int
{
    iniciar_sesion_si_falta();

    $id = (int)($_SESSION['idUsuarioMaster'] ?? $_SESSION['usuario_id'] ?? 0);
    if ($id > 0) {
        return $id;
    }

    $ctx = auth_context();
    return $ctx ? (int)$ctx['idUsuarioMaster'] : 0;
}

function tenant_id_actual(): int
{
    iniciar_sesion_si_falta();

    $id = (int)($_SESSION['idTenant'] ?? 0);
    if ($id > 0) return $id;

    $ctx = auth_context();
    return $ctx ? (int)$ctx['idTenant'] : 0;
}

function usuario_actual(): ?array
{
    $ctx = auth_context();
    if (!$ctx) return null;

    return [
        'idUsuarioMaster' => (int)$ctx['idUsuarioMaster'],
        'idUsuario' => (int)$ctx['idUsuarioMaster'],
        'usuario' => (string)$ctx['usuario'],
        'Nombre_Completo' => (string)$ctx['usuario'],
        'email_recuperacion' => $ctx['email_recuperacion'] ?? null,
        'rol' => (string)$ctx['rol'],
        'tema' => (string)$ctx['tema'],
        'idTenant' => (int)$ctx['idTenant'],
        'tenant_nombre' => (string)$ctx['tenant_nombre'],
        'logo_url' => $ctx['logo_url'] ?? null,
        'logo_icono_url' => $ctx['logo_icono_url'] ?? ($ctx['logo_url'] ?? null),
        'tenant' => [
            'idTenant' => (int)$ctx['idTenant'],
            'nombre' => (string)$ctx['tenant_nombre'],
            'logo_url' => $ctx['logo_url'] ?? null,
            'logo_icono_url' => $ctx['logo_icono_url'] ?? ($ctx['logo_url'] ?? null),
            'db_name' => (string)$ctx['db_name'],
        ],
    ];
}

function usuario_rol_actual(): string
{
    iniciar_sesion_si_falta();

    $rol = strtolower(trim((string)($_SESSION['rol'] ?? '')));
    if ($rol !== '') {
        return $rol;
    }

    $ctx = auth_context();
    return $ctx ? strtolower(trim((string)($ctx['rol'] ?? 'vista'))) : 'vista';
}

function require_roles(array $rolesPermitidos): void
{
    $rolesPermitidos = array_values(array_unique(array_map(
        static fn($rol) => strtolower(trim((string)$rol)),
        $rolesPermitidos
    )));

    if (!$rolesPermitidos) {
        return;
    }

    $rolActual = usuario_rol_actual();
    if (in_array($rolActual, $rolesPermitidos, true)) {
        return;
    }

    json_response([
        'exito' => false,
        'mensaje' => 'No tenés permisos para realizar esta acción.',
    ], 403);
}

function action_requiere_admin(string $action): bool
{
    $a = strtolower(trim($action));
    if ($a === '') {
        return false;
    }

    // Secciones sensibles: configuración de usuarios y auditoría solo admin.
    foreach (['configuracion_usuarios_', 'auditoria_'] as $prefijoAdmin) {
        if (strpos($a, $prefijoAdmin) === 0) {
            return true;
        }
    }

    // Configuración del formulario público: lectura pública/admin permitida; escritura solo admin.
    if (in_array($a, ['form_guardar_config_inscripcion', 'guardar_config_inscripcion', 'formulario_guardar_config_inscripcion'], true)) {
        return true;
    }

    // Acciones claramente mutables. Un usuario vista puede leer, pero no modificar datos.
    $palabrasMutables = [
        'guardar', 'crear', 'agregar', 'editar', 'actualizar', 'modificar',
        'eliminar', 'baja', 'alta', 'cambiar_estado', 'estado', 'asignar',
        'autogenerar', 'generar', 'registrar', 'numerar', 'reparar', 'armado',
        'fase_', 'confirmar', 'importar', 'mover', 'quitar', 'habilitar',
        'limpiar', 'nota',
    ];

    foreach ($palabrasMutables as $palabra) {
        if (strpos($a, $palabra) !== false) {
            return true;
        }
    }

    return false;
}

function require_action_permission(string $action): void
{
    if (action_requiere_admin($action)) {
        require_roles(['admin']);
    }
}

