<?php
// backend/modules/formulario/formulario_controller.php
declare(strict_types=1);

require_once __DIR__ . '/formulario_helpers.php';

function form_obtener_config_inscripcion(): void
{
    try {
        date_default_timezone_set('America/Argentina/Cordoba');
        $pdo = formulario_pdo();
        formulario_asegurar_columnas_config($pdo);
        $payload = formulario_config_payload(formulario_config_actual($pdo));
        $payload['tenant'] = formulario_tenant_info();
        formulario_json($payload);
    } catch (Throwable $e) {
        log_error($e, 'formulario:obtener_config_inscripcion');

        formulario_json([
            'exito' => false,
            'mensaje' => 'Error obteniendo configuración de inscripción.',
            'tenant' => function_exists('formulario_tenant_info') ? formulario_tenant_info() : null,
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
        formulario_asegurar_columnas_config($pdo);

        // Compatible con JSON y con multipart/form-data para subir logo/fondo.
        $in = array_merge(formulario_body(), $_POST);

        $idConfig = isset($in['id_config']) ? (int)$in['id_config'] : 0;
        $nombre = trim((string)($in['nombre'] ?? $in['titulo'] ?? ''));
        $inicio = formulario_normalizar_fecha_mysql((string)($in['insc_inicio'] ?? $in['inicio'] ?? ''));
        $fin = formulario_normalizar_fecha_mysql((string)($in['insc_fin'] ?? $in['fin'] ?? ''));
        $mensajeCerrado = trim((string)($in['mensaje_cerrado'] ?? 'La inscripción está cerrada. Consultá Secretaría.'));
        $activo = isset($in['activo']) ? ((int)$in['activo'] === 1 ? 1 : 0) : 1;
        $colorPrincipal = formulario_normalizar_color($in['color_principal'] ?? $in['colorPrincipal'] ?? '#c6171d');
        $quitarLogo = (int)($in['quitar_logo'] ?? $in['quitarLogo'] ?? 0) === 1;
        $quitarFondo = (int)($in['quitar_fondo'] ?? $in['quitarFondo'] ?? 0) === 1;

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

        $configActual = null;
        if ($idConfig > 0) {
            $stActual = $pdo->prepare('SELECT logo_url, fondo_url FROM mesas_config WHERE id_config = :id_config LIMIT 1');
            $stActual->execute([':id_config' => $idConfig]);
            $configActual = $stActual->fetch() ?: null;
        }

        $logoUrl = formulario_normalizar_url_publica($in['logo_url'] ?? $in['logoUrl'] ?? ($configActual['logo_url'] ?? null));
        $fondoUrl = formulario_normalizar_url_publica($in['fondo_url'] ?? $in['fondoUrl'] ?? ($configActual['fondo_url'] ?? null));

        $logoSubido = formulario_guardar_archivo_visual('logo', 'logo');
        if ($logoSubido !== null) {
            formulario_eliminar_archivo_publico($logoUrl);
            $logoUrl = $logoSubido;
        } elseif ($quitarLogo) {
            formulario_eliminar_archivo_publico($logoUrl);
            $logoUrl = null;
        }

        $fondoSubido = formulario_guardar_archivo_visual('fondo', 'fondo');
        if ($fondoSubido !== null) {
            formulario_eliminar_archivo_publico($fondoUrl);
            $fondoUrl = $fondoSubido;
        } elseif ($quitarFondo) {
            formulario_eliminar_archivo_publico($fondoUrl);
            $fondoUrl = null;
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
                       logo_url = :logo_url,
                       fondo_url = :fondo_url,
                       color_principal = :color_principal,
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
                ':logo_url' => $logoUrl,
                ':fondo_url' => $fondoUrl,
                ':color_principal' => $colorPrincipal,
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
                INSERT INTO mesas_config
                    (nombre, insc_inicio, insc_fin, mensaje_cerrado, logo_url, fondo_url, color_principal, activo, creado_en, actualizado_en)
                VALUES
                    (:nombre, :inicio, :fin, :mensaje, :logo_url, :fondo_url, :color_principal, :activo, NOW(), NOW())
            ";

            $st = $pdo->prepare($sql);
            $st->execute([
                ':nombre' => mb_strtoupper($nombre, 'UTF-8'),
                ':inicio' => $inicio,
                ':fin' => $fin,
                ':mensaje' => mb_strtoupper($mensajeCerrado, 'UTF-8'),
                ':logo_url' => $logoUrl,
                ':fondo_url' => $fondoUrl,
                ':color_principal' => $colorPrincipal,
                ':activo' => $activo,
            ]);

            $idConfig = (int)$pdo->lastInsertId();
        }

        $pdo->commit();

        $st = $pdo->prepare('SELECT id_config, nombre, insc_inicio, insc_fin, mensaje_cerrado, logo_url, fondo_url, color_principal, activo, creado_en, actualizado_en FROM mesas_config WHERE id_config = :id_config LIMIT 1');
        $st->execute([':id_config' => $idConfig]);
        $payload = formulario_config_payload($st->fetch() ?: formulario_config_actual($pdo));
        $payload['mensaje'] = 'Configuración guardada correctamente.';
        $payload['tenant'] = formulario_tenant_info();

        formulario_json($payload);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, 'formulario:guardar_config_inscripcion');

        formulario_json([
            'exito' => false,
            'mensaje' => $e instanceof RuntimeException ? $e->getMessage() : 'Error guardando configuración de inscripción.',
        ], 500);
    }
}
