<?php
// backend/modules/perfil/perfil_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';
require_once __DIR__ . '/../../core/auth.php';

function perfil_rol_label(string $rol): string
{
    $rol = strtolower(trim($rol));

    if ($rol === 'admin') {
        return 'Administrador';
    }

    if ($rol === 'vista') {
        return 'Vista';
    }

    return $rol !== '' ? ucfirst($rol) : 'Usuario';
}

function perfil_normalizar_logo_valor(?string $valor): string
{
    $valor = trim((string)$valor);

    if ($valor === '' || strtolower($valor) === 'null' || strtolower($valor) === 'undefined' || $valor === '-') {
        return '';
    }

    return str_replace('\\', '/', $valor);
}

function perfil_logo_mime_desde_extension(string $path): string
{
    $ext = strtolower(pathinfo(parse_url($path, PHP_URL_PATH) ?: $path, PATHINFO_EXTENSION));

    return match ($ext) {
        'jpg', 'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'gif' => 'image/gif',
        default => 'image/png',
    };
}

function perfil_logo_resolver_archivo_local(string $logo): string
{
    $logo = perfil_normalizar_logo_valor($logo);
    if ($logo === '' || preg_match('#^https?://#i', $logo) || str_starts_with($logo, 'data:')) {
        return '';
    }

    $relative = ltrim($logo, '/');
    $candidatos = [];

    $documentRoot = trim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($documentRoot !== '') {
        $candidatos[] = rtrim($documentRoot, '/\\') . DIRECTORY_SEPARATOR . $relative;
    }

    // En Hostinger normalmente: public_html/api/modules/perfil -> public_html
    $candidatos[] = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . $relative;
    $candidatos[] = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . $relative;

    foreach (array_unique($candidatos) as $path) {
        if (is_file($path) && is_readable($path)) {
            return $path;
        }
    }

    return '';
}

function perfil_logo_a_data_url(string $logo): string
{
    $logo = perfil_normalizar_logo_valor($logo);
    if ($logo === '') return '';

    if (str_starts_with($logo, 'data:image/')) {
        return $logo;
    }

    $source = '';
    $mime = perfil_logo_mime_desde_extension($logo);

    if (preg_match('#^https?://#i', $logo)) {
        $source = $logo;
    } else {
        $local = perfil_logo_resolver_archivo_local($logo);
        if ($local === '') return '';
        $source = $local;

        if (function_exists('mime_content_type')) {
            $detected = @mime_content_type($local);
            if (is_string($detected) && str_starts_with($detected, 'image/')) {
                $mime = $detected;
            }
        }
    }

    $context = stream_context_create([
        'http' => ['timeout' => 4],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
    ]);

    $contenido = @file_get_contents($source, false, $context);
    if ($contenido === false || $contenido === '') {
        return '';
    }

    return 'data:' . $mime . ';base64,' . base64_encode($contenido);
}

function perfil_obtener(): void
{
    $idUsuario = usuario_id();
    $idTenant = tenant_id_actual();

    if ($idUsuario <= 0 || $idTenant <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo identificar la sesión activa.',
        ], 401);
    }

    try {
        $master = master_db();

        /*
         * Se devuelve el logo institucional del tenant desde master.
         * Primero se intenta logo_icono_url y si está vacío se usa logo_url.
         */
        $stmt = $master->prepare("
            SELECT
                u.idUsuarioMaster,
                u.idTenant,
                u.usuario,
                u.email_recuperacion,
                LOWER(u.rol) AS rol,
                u.tema,
                u.activo AS usuario_activo,
                u.fecha_creacion,
                t.nombre AS tenant_nombre,
                t.slug AS tenant_slug,
                t.logo_url,
                COALESCE(t.logo_icono_url, t.logo_url) AS logo_icono_url,
                t.db_name,
                t.idPlan,
                t.activo AS tenant_activo,
                p.nombre AS plan_nombre,
                p.nivel AS plan_nivel,
                p.activo AS plan_activo
            FROM usuarios_master u
            INNER JOIN tenants t ON t.idTenant = u.idTenant
            LEFT JOIN planes_saas p ON p.idPlan = t.idPlan
            WHERE u.idUsuarioMaster = :idUsuario
              AND u.idTenant = :idTenant
            LIMIT 1
        ");

        $stmt->execute([
            ':idUsuario' => $idUsuario,
            ':idTenant' => $idTenant,
        ]);

        $row = $stmt->fetch();

        if (!$row) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se encontró la información del perfil.',
            ], 404);
        }

        $rol = strtolower((string)($row['rol'] ?? 'vista'));
        $planNombre = (string)($row['plan_nombre'] ?? 'Plan no informado');

        $tenant = [
            'idTenant' => (int)$row['idTenant'],
            'nombre' => (string)$row['tenant_nombre'],
            'slug' => $row['tenant_slug'] ?? null,
            'logo_url' => $row['logo_url'] ?? null,
            'logo_icono_url' => $row['logo_icono_url'] ?? ($row['logo_url'] ?? null),
            'db_name' => (string)$row['db_name'],
            'activo' => (int)$row['tenant_activo'],
        ];

        $plan = [
            'idPlan' => (int)($row['idPlan'] ?? 0),
            'nombre' => $planNombre,
            'nivel' => (int)($row['plan_nivel'] ?? 0),
            'activo' => (int)($row['plan_activo'] ?? 0),
        ];

        $usuario = [
            'idUsuarioMaster' => (int)$row['idUsuarioMaster'],
            'idUsuario' => (int)$row['idUsuarioMaster'],
            'Nombre_Completo' => (string)$row['usuario'],
            'usuario' => (string)$row['usuario'],
            'email_recuperacion' => $row['email_recuperacion'] ?? null,
            'rol' => $rol,
            'rol_label' => perfil_rol_label($rol),
            'tema' => (string)($row['tema'] ?? 'claro'),
            'activo' => (int)$row['usuario_activo'],
            'fecha_creacion' => $row['fecha_creacion'] ?? null,
            'idTenant' => (int)$row['idTenant'],
            'tenant_nombre' => (string)$row['tenant_nombre'],
            'logo_url' => $row['logo_url'] ?? null,
            'logo_icono_url' => $row['logo_icono_url'] ?? ($row['logo_url'] ?? null),
            'tenant' => $tenant,
            'plan' => $plan,
        ];

        $perfil = array_merge($usuario, [
            'plan_nombre' => $planNombre,
            'tenant' => $tenant,
            'plan' => $plan,
        ]);

        json_response([
            'exito' => true,
            'perfil' => $perfil,
            'usuario' => $usuario,
            'tenant' => $tenant,
            'plan' => $plan,
        ]);
    } catch (Throwable $e) {
        log_error($e, 'perfil_obtener');
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo cargar el perfil del usuario.',
        ], 500);
    }
}

function perfil_logo_institucional(): void
{
    $idUsuario = usuario_id();
    $idTenant = tenant_id_actual();

    if ($idUsuario <= 0 || $idTenant <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo identificar la sesión activa.',
        ], 401);
    }

    try {
        $master = master_db();
        $stmt = $master->prepare("
            SELECT
                t.idTenant,
                t.nombre,
                t.logo_url,
                COALESCE(t.logo_icono_url, t.logo_url) AS logo_icono_url
            FROM tenants t
            INNER JOIN usuarios_master u ON u.idTenant = t.idTenant
            WHERE t.idTenant = :idTenant
              AND u.idUsuarioMaster = :idUsuario
            LIMIT 1
        ");

        $stmt->execute([
            ':idTenant' => $idTenant,
            ':idUsuario' => $idUsuario,
        ]);

        $row = $stmt->fetch();
        if (!$row) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se encontró la información institucional.',
            ], 404);
        }

        $logoIcono = perfil_normalizar_logo_valor($row['logo_icono_url'] ?? '');
        $logoUrl = perfil_normalizar_logo_valor($row['logo_url'] ?? '');
        $logoElegido = $logoIcono !== '' ? $logoIcono : $logoUrl;

        json_response([
            'exito' => true,
            'tenant' => [
                'idTenant' => (int)$row['idTenant'],
                'nombre' => (string)$row['nombre'],
                'logo_url' => $logoUrl ?: null,
                'logo_icono_url' => $logoIcono ?: ($logoUrl ?: null),
                'logo_data_url' => $logoElegido !== '' ? perfil_logo_a_data_url($logoElegido) : '',
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'perfil_logo_institucional');
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo cargar el logo institucional.',
        ], 500);
    }
}

