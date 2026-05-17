<?php
// backend/modules/formulario/formulario_helpers.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

if (!function_exists('formulario_pdo')) {
    function formulario_pdo(): PDO
    {
        if (!function_exists('db')) {
            throw new RuntimeException('La función db() no está disponible. Revisar backend/config/db.php.');
        }

        $action = trim((string)($_GET['action'] ?? $_POST['action'] ?? (request_body()['action'] ?? '')));
        $accionesPublicasFormulario = [
            'form_obtener_config_inscripcion',
            'obtener_config_inscripcion',
            'formulario_obtener_config_inscripcion',
            'form_buscar_previas',
            'buscar_previas',
            'formulario_buscar_previas',
            'form_registrar_inscripcion',
            'registrar_inscripcion',
            'formulario_registrar_inscripcion',
        ];

        $script = basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
        $archivosPublicosFormulario = [
            'obtener_config_inscripcion.php',
            'buscar_previas.php',
            'registrar_inscripcion.php',
        ];

        if ((in_array($action, $accionesPublicasFormulario, true) || in_array($script, $archivosPublicosFormulario, true)) && function_exists('public_tenant_db')) {
            $pdo = public_tenant_db();
        } else {
            $pdo = db();
        }

        if (!($pdo instanceof PDO)) {
            throw new RuntimeException('La conexión obtenida no es una instancia válida de PDO.');
        }

        return $pdo;
    }
}

if (!function_exists('formulario_json')) {
    function formulario_json(array $payload, int $status = 200): void
    {
        json_response($payload, $status);
    }
}

if (!function_exists('formulario_body')) {
    function formulario_body(): array
    {
        return request_body();
    }
}

if (!function_exists('formulario_normalizar_dni')) {
    function formulario_normalizar_dni(mixed $dni): string
    {
        return preg_replace('/\D+/', '', (string)$dni) ?? '';
    }
}

if (!function_exists('formulario_validar_dni')) {
    function formulario_validar_dni(string $dni): bool
    {
        return $dni !== '' && preg_match('/^\d{7,9}$/', $dni) === 1;
    }
}

if (!function_exists('formulario_normalizar_fecha_mysql')) {
    function formulario_normalizar_fecha_mysql(string $valor): string
    {
        $valor = trim(str_replace('T', ' ', $valor));

        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $valor) === 1) {
            return $valor . ':00';
        }

        return $valor;
    }
}

if (!function_exists('formulario_config_actual')) {
    function formulario_config_actual(PDO $pdo): ?array
    {
        $sql = "
            SELECT id_config, nombre, insc_inicio, insc_fin, mensaje_cerrado, activo,
                   creado_en, actualizado_en
              FROM mesas_config
             ORDER BY activo DESC, actualizado_en DESC, id_config DESC
             LIMIT 1
        ";

        $row = $pdo->query($sql)->fetch();
        return $row ?: null;
    }
}

if (!function_exists('formulario_config_payload')) {
    function formulario_config_payload(?array $row): array
    {
        if (!$row) {
            return [
                'exito' => true,
                'hay_config' => false,
                'abierta' => false,
                'mensaje_cerrado' => 'La inscripción todavía no fue configurada.',
            ];
        }

        $tz = new DateTimeZone('America/Argentina/Cordoba');
        $ahora = new DateTimeImmutable('now', $tz);
        $ini = new DateTimeImmutable((string)$row['insc_inicio'], $tz);
        $fin = new DateTimeImmutable((string)$row['insc_fin'], $tz);
        $abierta = ((int)$row['activo'] === 1 && $ahora >= $ini && $ahora <= $fin);

        return [
            'exito' => true,
            'hay_config' => true,
            'id_config' => (int)$row['id_config'],
            'titulo' => (string)$row['nombre'],
            'inicio' => (string)$row['insc_inicio'],
            'fin' => (string)$row['insc_fin'],
            'mensaje_cerrado' => (string)$row['mensaje_cerrado'],
            'activo' => (int)$row['activo'],
            'abierta' => $abierta,
            'creado_en' => $row['creado_en'] ?? null,
            'actualizado_en' => $row['actualizado_en'] ?? null,
        ];
    }
}

if (!function_exists('formulario_ventana_abierta')) {
    function formulario_ventana_abierta(PDO $pdo): bool
    {
        $payload = formulario_config_payload(formulario_config_actual($pdo));
        return (bool)($payload['abierta'] ?? false);
    }
}

if (!function_exists('formulario_method')) {
    function formulario_method(string $method): void
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== strtoupper($method)) {
            formulario_json([
                'exito' => false,
                'mensaje' => 'Método no permitido.',
            ], 405);
        }
    }
}
