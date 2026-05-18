<?php
// backend/modules/mesas/editar_mesas/agregar_numero/agregar_numero_controller.php
declare(strict_types=1);

require_once __DIR__ . '/agregar_numero_helpers.php';

function mesas_editar_agregar_numero_opciones_controller(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = array_merge($_GET, mesas_editar_input_json());
        $numeroGrupo = mesas_editar_agregar_numero_int(
            $data['numero_grupo'] ?? $data['id_grupo'] ?? null,
            'Debe indicar el grupo al que querés agregar un número.'
        );

        $opciones = mesas_editar_agregar_numero_opciones($pdo, $numeroGrupo);

        json_response([
            'exito' => true,
            'data' => $opciones,
        ]);
    } catch (InvalidArgumentException $e) {
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        log_error($e, 'mesas_editar_agregar_numero_opciones');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al obtener opciones para agregar número al grupo.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}

function mesas_editar_agregar_numero_confirmar_controller(): void
{
    try {
        $pdo = db();
        mesas_armado_grupos_asegurar_tablas($pdo);

        $data = mesas_editar_input_json();
        $numeroGrupo = mesas_editar_agregar_numero_int(
            $data['numero_grupo'] ?? $data['id_grupo'] ?? null,
            'Debe indicar el grupo al que querés agregar el número.'
        );
        $tipo = trim((string)($data['tipo'] ?? $data['origen'] ?? 'no_agrupada'));

        $pdo->beginTransaction();

        if ($tipo === 'previa' || $tipo === 'previa_sin_mesa') {
            $idPrevia = mesas_editar_agregar_numero_int(
                $data['id_previa'] ?? null,
                'Debe indicar la previa que querés convertir en número de mesa.'
            );
            $resultado = mesas_editar_agregar_numero_crear_grupo_desde_previa($pdo, $numeroGrupo, $idPrevia);
        } else {
            $numeroMesa = mesas_editar_agregar_numero_int(
                $data['numero_mesa'] ?? null,
                'Debe indicar el número de mesa no agrupado que querés agregar.'
            );
            $resultado = mesas_editar_agregar_numero_a_grupo($pdo, $numeroGrupo, $numeroMesa);
        }

        if (empty($resultado['agregado'])) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede agregar porque genera conflictos.',
                'errores' => $resultado['validacion']['errores'] ?? [],
                'advertencias' => $resultado['validacion']['advertencias'] ?? [],
                'data' => $resultado,
            ], 422);
            return;
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => $resultado['tipo'] === 'previa_sin_mesa'
                ? 'Previa convertida en número de mesa y grupo creado correctamente.'
                : 'Número agregado al grupo correctamente.',
            'data' => $resultado,
        ]);
    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response([
            'exito' => false,
            'mensaje' => $e->getMessage(),
        ], 422);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, 'mesas_editar_agregar_numero_confirmar');
        json_response([
            'exito' => false,
            'mensaje' => 'Error interno al agregar el número al grupo.',
            'detalle' => defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : null,
        ], 500);
    }
}
