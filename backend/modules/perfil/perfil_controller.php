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
         * Importante: se devuelve logo_icono_url como alias de logo_url.
         * En algunas bases productivas viejas no existe la columna logo_icono_url,
         * entonces no la consultamos directamente para evitar errores 1054.
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
                t.logo_url AS logo_icono_url,
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
