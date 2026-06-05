<?php
// backend/modules/materias/correlativas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

if (!function_exists('json_response')) {
    function json_response(array $data, int $status = 200): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('get_json_body')) {
    function get_json_body(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode((string)$raw, true);
        if (is_array($data)) return $data;
        return $_POST ?: [];
    }
}

if (!function_exists('materias_int')) {
    function materias_int($value): int
    {
        return is_numeric($value) ? (int)$value : 0;
    }
}

if (!function_exists('materias_bool_int')) {
    function materias_bool_int($value, int $default = 1): int
    {
        if ($value === null || $value === '') return $default;
        return ((int)$value) === 1 ? 1 : 0;
    }
}

if (!function_exists('materias_normalizar_cadena_correlativa')) {
    function materias_normalizar_cadena_correlativa(string $texto): string
    {
        $texto = trim($texto);
        if ($texto === '') return '';

        if (function_exists('mb_strtoupper')) {
            $texto = mb_strtoupper($texto, 'UTF-8');
        } else {
            $texto = strtoupper($texto);
        }

        $reemplazos = [
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
            'À' => 'A', 'È' => 'E', 'Ì' => 'I', 'Ò' => 'O', 'Ù' => 'U',
        ];
        $texto = strtr($texto, $reemplazos);
        $texto = preg_replace('/\s+/u', ' ', $texto) ?: $texto;
        return trim($texto);
    }
}

if (!function_exists('materias_romano_a_entero')) {
    function materias_romano_a_entero(string $valor): int
    {
        $romanos = [
            'I' => 1,
            'II' => 2,
            'III' => 3,
            'IV' => 4,
            'V' => 5,
            'VI' => 6,
            'VII' => 7,
            'VIII' => 8,
            'IX' => 9,
            'X' => 10,
            'XI' => 11,
            'XII' => 12,
        ];

        $clave = materias_normalizar_cadena_correlativa($valor);
        return $romanos[$clave] ?? 0;
    }
}

if (!function_exists('materias_analizar_cadena_correlativa')) {
    function materias_analizar_cadena_correlativa(string $materia): array
    {
        $normalizada = materias_normalizar_cadena_correlativa($materia);
        $base = $normalizada;
        $orden = 0;
        $sufijo = '';
        $tieneNumeracion = false;

        if (preg_match('/^(.*?)(?:\s+|-)(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|[1-9][0-9]?)$/u', $normalizada, $match)) {
            $posibleBase = trim((string)$match[1]);
            $posibleSufijo = trim((string)$match[2]);
            $numero = ctype_digit($posibleSufijo) ? (int)$posibleSufijo : materias_romano_a_entero($posibleSufijo);

            if ($posibleBase !== '' && $numero > 0) {
                $base = $posibleBase;
                $orden = $numero;
                $sufijo = $posibleSufijo;
                $tieneNumeracion = true;
            }
        }

        return [
            'normalizada' => $normalizada,
            'base' => $base,
            'orden' => $orden,
            'sufijo' => $sufijo,
            'tiene_numeracion' => $tieneNumeracion,
        ];
    }
}

if (!function_exists('materias_curso_es_egresado')) {
    function materias_curso_es_egresado(?string $curso): bool
    {
        return strpos(materias_normalizar_cadena_correlativa((string)$curso), 'EGRESADO') !== false;
    }
}

function materias_correlativas_listar(): void
{
    $pdo = db();

    try {
        $stmt = $pdo->query("\n            SELECT\n                mc.id_materia_correlativa,\n                mc.id_materia,\n                m.materia,\n                mc.id_curso,\n                c.nombre_curso AS curso,\n                mc.id_materia_relacionada,\n                mr.materia AS materia_relacionada,\n                mc.id_curso_relacionada,\n                cr.nombre_curso AS curso_relacionada,\n                mc.tipo,\n                mc.activo,\n                mc.bloquea_inscripcion,\n                mc.bloquea_armado,\n                mc.orden\n            FROM materias_correlativas mc\n            INNER JOIN materias m  ON m.id_materia  = mc.id_materia\n            INNER JOIN curso    c  ON c.id_curso     = mc.id_curso\n            INNER JOIN materias mr ON mr.id_materia  = mc.id_materia_relacionada\n            INNER JOIN curso    cr ON cr.id_curso    = mc.id_curso_relacionada\n            ORDER BY m.materia ASC, cr.id_curso ASC, c.id_curso ASC, mc.orden ASC, mc.id_materia_correlativa ASC\n        ");

        json_response(['exito' => true, 'correlativas' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al listar correlatividades.',
        ]);
    }
}

function materias_correlativas_guardar(): void
{
    $pdo = db();

    $data = get_json_body();
    $id                  = materias_int($data['id_materia_correlativa'] ?? 0);
    $idMateriaPosterior  = materias_int($data['id_materia'] ?? 0);
    $idCursoPosterior    = materias_int($data['id_curso'] ?? 0);
    $idMateriaAnterior   = materias_int($data['id_materia_relacionada'] ?? 0);
    $idCursoAnterior     = materias_int($data['id_curso_relacionada'] ?? 0);
    $tipo                = strtolower(trim((string)($data['tipo'] ?? 'anterior')));
    $activo              = materias_bool_int($data['activo'] ?? 1, 1);
    $bloqueaInscripcion  = materias_bool_int($data['bloquea_inscripcion'] ?? 1, 1);
    $bloqueaArmado       = materias_bool_int($data['bloquea_armado'] ?? 1, 1);
    $orden               = isset($data['orden']) && $data['orden'] !== '' ? (int)$data['orden'] : null;

    if (!in_array($tipo, ['anterior', 'posterior', 'equivalente'], true)) $tipo = 'anterior';

    if ($idMateriaPosterior <= 0 || $idCursoPosterior <= 0 || $idMateriaAnterior <= 0 || $idCursoAnterior <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe completar materia posterior, curso posterior, materia anterior y curso anterior.']);
    }

    if ($idMateriaPosterior === $idMateriaAnterior && $idCursoPosterior === $idCursoAnterior) {
        json_response(['exito' => false, 'mensaje' => 'Una materia no puede ser correlativa de sí misma en el mismo curso.']);
    }

    try {
        if ($id > 0) {
            $stmt = $pdo->prepare("\n                UPDATE materias_correlativas\n                SET id_materia              = :id_materia,\n                    id_curso                = :id_curso,\n                    id_materia_relacionada  = :id_materia_relacionada,\n                    id_curso_relacionada    = :id_curso_relacionada,\n                    tipo                    = :tipo,\n                    activo                  = :activo,\n                    bloquea_inscripcion     = :bloquea_inscripcion,\n                    bloquea_armado          = :bloquea_armado,\n                    orden                   = :orden\n                WHERE id_materia_correlativa = :id\n            ");
            $stmt->execute([
                ':id_materia'             => $idMateriaPosterior,
                ':id_curso'               => $idCursoPosterior,
                ':id_materia_relacionada' => $idMateriaAnterior,
                ':id_curso_relacionada'   => $idCursoAnterior,
                ':tipo'                   => $tipo,
                ':activo'                 => $activo,
                ':bloquea_inscripcion'    => $bloqueaInscripcion,
                ':bloquea_armado'         => $bloqueaArmado,
                ':orden'                  => $orden,
                ':id'                     => $id,
            ]);
            json_response(['exito' => true, 'mensaje' => 'Correlatividad actualizada correctamente.', 'id_materia_correlativa' => $id]);
        }

        $stmt = $pdo->prepare("\n            INSERT INTO materias_correlativas\n                (id_materia, id_curso, id_materia_relacionada, id_curso_relacionada, tipo, activo, bloquea_inscripcion, bloquea_armado, orden)\n            VALUES\n                (:id_materia, :id_curso, :id_materia_relacionada, :id_curso_relacionada, :tipo, :activo, :bloquea_inscripcion, :bloquea_armado, :orden)\n            ON DUPLICATE KEY UPDATE\n                activo              = VALUES(activo),\n                bloquea_inscripcion = VALUES(bloquea_inscripcion),\n                bloquea_armado      = VALUES(bloquea_armado),\n                orden               = VALUES(orden)\n        ");
        $stmt->execute([
            ':id_materia'             => $idMateriaPosterior,
            ':id_curso'               => $idCursoPosterior,
            ':id_materia_relacionada' => $idMateriaAnterior,
            ':id_curso_relacionada'   => $idCursoAnterior,
            ':tipo'                   => $tipo,
            ':activo'                 => $activo,
            ':bloquea_inscripcion'    => $bloqueaInscripcion,
            ':bloquea_armado'         => $bloqueaArmado,
            ':orden'                  => $orden,
        ]);

        $idNuevo = (int)$pdo->lastInsertId();
        if ($idNuevo <= 0) {
            $stmtId = $pdo->prepare("\n                SELECT id_materia_correlativa\n                FROM materias_correlativas\n                WHERE id_materia             = :id_materia\n                  AND id_curso               = :id_curso\n                  AND id_materia_relacionada = :id_materia_relacionada\n                  AND id_curso_relacionada   = :id_curso_relacionada\n                  AND tipo                   = :tipo\n                LIMIT 1\n            ");
            $stmtId->execute([
                ':id_materia'             => $idMateriaPosterior,
                ':id_curso'               => $idCursoPosterior,
                ':id_materia_relacionada' => $idMateriaAnterior,
                ':id_curso_relacionada'   => $idCursoAnterior,
                ':tipo'                   => $tipo,
            ]);
            $idNuevo = (int)$stmtId->fetchColumn();
        }

        json_response(['exito' => true, 'mensaje' => 'Correlatividad guardada correctamente.', 'id_materia_correlativa' => $idNuevo]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al guardar correlatividad.',
        ]);
    }
}

function materias_correlativas_guardar_masivo(): void
{
    $pdo = db();

    $data = get_json_body();
    $idMateriaAnterior = materias_int($data['id_materia_anterior'] ?? $data['id_materia_relacionada'] ?? 0);
    $idCursoAnterior   = materias_int($data['id_curso_anterior']   ?? $data['id_curso_relacionada']   ?? 0);
    $relaciones        = $data['relaciones'] ?? $data['posteriores'] ?? [];
    $tipo              = strtolower(trim((string)($data['tipo'] ?? 'anterior')));
    if (!in_array($tipo, ['anterior', 'posterior', 'equivalente'], true)) $tipo = 'anterior';

    $bloqueaInscripcion = materias_bool_int($data['bloquea_inscripcion'] ?? 1, 1);
    $bloqueaArmado      = materias_bool_int($data['bloquea_armado']      ?? 1, 1);

    if ($idMateriaAnterior <= 0 || $idCursoAnterior <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar curso y materia anterior.']);
    }

    if (!is_array($relaciones) || count($relaciones) === 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar al menos una materia posterior.']);
    }

    try {
        $pdo->beginTransaction();
        $guardadas = 0;
        $saltadas  = 0;
        $orden     = 1;

        $stmt = $pdo->prepare("\n            INSERT INTO materias_correlativas\n                (id_materia, id_curso, id_materia_relacionada, id_curso_relacionada, tipo, activo, bloquea_inscripcion, bloquea_armado, orden)\n            VALUES\n                (:id_materia, :id_curso, :id_materia_relacionada, :id_curso_relacionada, :tipo, 1, :bloquea_inscripcion, :bloquea_armado, :orden)\n            ON DUPLICATE KEY UPDATE\n                activo              = 1,\n                bloquea_inscripcion = VALUES(bloquea_inscripcion),\n                bloquea_armado      = VALUES(bloquea_armado),\n                orden               = VALUES(orden)\n        ");

        foreach ($relaciones as $rel) {
            $idMateriaPosterior = materias_int($rel['id_materia_posterior'] ?? $rel['id_materia'] ?? 0);
            $idCursoPosterior   = materias_int($rel['id_curso_posterior']   ?? $rel['id_curso']   ?? 0);

            if (
                $idMateriaPosterior <= 0 ||
                $idCursoPosterior   <= 0 ||
                ($idMateriaPosterior === $idMateriaAnterior && $idCursoPosterior === $idCursoAnterior)
            ) {
                $saltadas++;
                continue;
            }

            $relBloqueaInscripcion = materias_bool_int($rel['bloquea_inscripcion'] ?? $bloqueaInscripcion, $bloqueaInscripcion);
            $relBloqueaArmado = materias_bool_int($rel['bloquea_armado'] ?? $bloqueaArmado, $bloqueaArmado);

            $stmt->execute([
                ':id_materia'             => $idMateriaPosterior,
                ':id_curso'               => $idCursoPosterior,
                ':id_materia_relacionada' => $idMateriaAnterior,
                ':id_curso_relacionada'   => $idCursoAnterior,
                ':tipo'                   => $tipo,
                ':bloquea_inscripcion'    => $relBloqueaInscripcion,
                ':bloquea_armado'         => $relBloqueaArmado,
                ':orden'                  => $orden,
            ]);
            $guardadas++;
            $orden++;
        }

        $pdo->commit();
        json_response([
            'exito'     => true,
            'mensaje'   => "Correlatividades guardadas: {$guardadas}.",
            'guardadas' => $guardadas,
            'saltadas'  => $saltadas,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al guardar correlatividades masivas.',
        ]);
    }
}

function materias_correlativas_autogenerar_por_materia(): void
{
    $pdo = db();

    $data = get_json_body();
    $idMateria = materias_int($data['id_materia'] ?? 0);
    $tipo = strtolower(trim((string)($data['tipo'] ?? 'anterior')));
    if (!in_array($tipo, ['anterior', 'posterior', 'equivalente'], true)) $tipo = 'anterior';

    $activo = materias_bool_int($data['activo'] ?? 1, 1);
    $bloqueaInscripcion = materias_bool_int($data['bloquea_inscripcion'] ?? 1, 1);
    $bloqueaArmado = materias_bool_int($data['bloquea_armado'] ?? 1, 1);

    if ($idMateria <= 0) {
        json_response(['exito' => false, 'mensaje' => 'Debe seleccionar una materia para autogenerar la cadena.']);
    }

    try {
        $stmtSeleccionada = $pdo->prepare("\n            SELECT id_materia, materia\n            FROM materias\n            WHERE id_materia = :id_materia\n              AND activo = 1\n            LIMIT 1\n        ");
        $stmtSeleccionada->execute([':id_materia' => $idMateria]);
        $materiaSeleccionada = $stmtSeleccionada->fetch(PDO::FETCH_ASSOC);

        if (!$materiaSeleccionada) {
            json_response(['exito' => false, 'mensaje' => 'La materia seleccionada no existe o está inactiva.']);
        }

        $analisisSeleccionada = materias_analizar_cadena_correlativa((string)$materiaSeleccionada['materia']);

        $stmtCatedras = $pdo->query("\n            SELECT DISTINCT\n                ca.id_curso,\n                cu.nombre_curso,\n                m.id_materia,\n                m.materia\n            FROM catedras ca\n            INNER JOIN curso cu ON cu.id_curso = ca.id_curso AND cu.activo = 1\n            INNER JOIN materias m ON m.id_materia = ca.id_materia AND m.activo = 1\n            WHERE ca.activo = 1\n            ORDER BY ca.id_curso ASC, m.materia ASC, m.id_materia ASC\n        ");

        $candidatas = [];
        $vistas = [];

        while ($fila = $stmtCatedras->fetch(PDO::FETCH_ASSOC)) {
            $nombreCurso = (string)($fila['nombre_curso'] ?? '');
            if (materias_curso_es_egresado($nombreCurso)) continue;

            $analisis = materias_analizar_cadena_correlativa((string)$fila['materia']);
            $pertenece = false;

            if ($analisisSeleccionada['tiene_numeracion']) {
                $pertenece = $analisis['tiene_numeracion'] && $analisis['base'] === $analisisSeleccionada['base'];
            } else {
                $pertenece = $analisis['normalizada'] === $analisisSeleccionada['normalizada'];
            }

            if (!$pertenece) continue;

            $idCurso = (int)$fila['id_curso'];
            $idMat = (int)$fila['id_materia'];
            $clave = $idCurso . '-' . $idMat;
            if (isset($vistas[$clave])) continue;
            $vistas[$clave] = true;

            $candidatas[] = [
                'id_curso' => $idCurso,
                'nombre_curso' => $nombreCurso,
                'id_materia' => $idMat,
                'materia' => (string)$fila['materia'],
                'orden_numeracion' => (int)$analisis['orden'],
                'tiene_numeracion' => (bool)$analisis['tiene_numeracion'],
            ];
        }

        usort($candidatas, static function (array $a, array $b) use ($analisisSeleccionada): int {
            if ($analisisSeleccionada['tiene_numeracion']) {
                $ordenA = (int)($a['orden_numeracion'] ?: 9999);
                $ordenB = (int)($b['orden_numeracion'] ?: 9999);
                if ($ordenA !== $ordenB) return $ordenA <=> $ordenB;
            }

            $cursoA = (int)$a['id_curso'];
            $cursoB = (int)$b['id_curso'];
            if ($cursoA !== $cursoB) return $cursoA <=> $cursoB;

            return (int)$a['id_materia'] <=> (int)$b['id_materia'];
        });

        if (count($candidatas) < 2) {
            $detalle = $analisisSeleccionada['tiene_numeracion']
                ? 'No se encontraron dos o más materias con la misma base y numeración correlativa.'
                : 'La materia seleccionada no aparece en dos o más cursos.';

            json_response([
                'exito' => false,
                'mensaje' => $detalle . ' No se puede generar una cadena automática.',
            ]);
        }

        $pdo->beginTransaction();

        $stmtExiste = $pdo->prepare("\n            SELECT id_materia_correlativa, activo, bloquea_inscripcion, bloquea_armado, orden\n            FROM materias_correlativas\n            WHERE id_materia             = :id_materia\n              AND id_curso               = :id_curso\n              AND id_materia_relacionada = :id_materia_relacionada\n              AND id_curso_relacionada   = :id_curso_relacionada\n              AND tipo                   = :tipo\n            LIMIT 1\n        ");

        $stmtInsertar = $pdo->prepare("\n            INSERT INTO materias_correlativas\n                (id_materia, id_curso, id_materia_relacionada, id_curso_relacionada, tipo, activo, bloquea_inscripcion, bloquea_armado, orden)\n            VALUES\n                (:id_materia, :id_curso, :id_materia_relacionada, :id_curso_relacionada, :tipo, :activo, :bloquea_inscripcion, :bloquea_armado, :orden)\n        ");

        $stmtActualizar = $pdo->prepare("\n            UPDATE materias_correlativas\n            SET activo = :activo,\n                bloquea_inscripcion = :bloquea_inscripcion,\n                bloquea_armado = :bloquea_armado,\n                orden = :orden\n            WHERE id_materia_correlativa = :id\n        ");

        $guardadas = 0;
        $saltadas = 0;
        $relaciones = [];
        $existentes = [];

        for ($i = 0; $i < count($candidatas) - 1; $i++) {
            $anterior = $candidatas[$i];
            $posterior = $candidatas[$i + 1];

            if (
                (int)$anterior['id_materia'] === (int)$posterior['id_materia'] &&
                (int)$anterior['id_curso'] === (int)$posterior['id_curso']
            ) {
                $saltadas++;
                continue;
            }

            $orden = $i + 1;
            $paramsBase = [
                ':id_materia' => (int)$posterior['id_materia'],
                ':id_curso' => (int)$posterior['id_curso'],
                ':id_materia_relacionada' => (int)$anterior['id_materia'],
                ':id_curso_relacionada' => (int)$anterior['id_curso'],
                ':tipo' => $tipo,
            ];

            $stmtExiste->execute($paramsBase);
            $existente = $stmtExiste->fetch(PDO::FETCH_ASSOC);

            if ($existente && (int)$existente['activo'] === 1) {
                $saltadas++;
                $existentes[] = [
                    'anterior' => $anterior['nombre_curso'] . ' - ' . $anterior['materia'],
                    'posterior' => $posterior['nombre_curso'] . ' - ' . $posterior['materia'],
                ];
                continue;
            }

            if ($existente) {
                $stmtActualizar->execute([
                    ':activo' => $activo,
                    ':bloquea_inscripcion' => $bloqueaInscripcion,
                    ':bloquea_armado' => $bloqueaArmado,
                    ':orden' => $orden,
                    ':id' => (int)$existente['id_materia_correlativa'],
                ]);
            } else {
                $stmtInsertar->execute(array_merge($paramsBase, [
                    ':activo' => $activo,
                    ':bloquea_inscripcion' => $bloqueaInscripcion,
                    ':bloquea_armado' => $bloqueaArmado,
                    ':orden' => $orden,
                ]));
            }

            $guardadas++;
            $relaciones[] = [
                'anterior' => $anterior['nombre_curso'] . ' - ' . $anterior['materia'],
                'posterior' => $posterior['nombre_curso'] . ' - ' . $posterior['materia'],
            ];
        }

        if ($guardadas <= 0) {
            $pdo->rollBack();
            json_response([
                'exito' => false,
                'mensaje' => 'Todas las correlatividades automáticas de esta cadena ya están realizadas. No había relaciones nuevas para guardar.',
                'guardadas' => 0,
                'saltadas' => $saltadas,
                'existentes' => $existentes,
            ]);
        }

        $pdo->commit();

        $mensaje = "Cadena correlativa generada correctamente. Relaciones nuevas guardadas: {$guardadas}.";
        if ($saltadas > 0) {
            $mensaje .= " Ya existían o se omitieron: {$saltadas}.";
        }

        json_response([
            'exito' => true,
            'mensaje' => $mensaje,
            'guardadas' => $guardadas,
            'saltadas' => $saltadas,
            'relaciones' => $relaciones,
            'existentes' => $existentes,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'Error al autogenerar correlatividades por materia.',
        ]);
    }
}

function materias_correlativas_eliminar(): void
{
    $pdo = db();

    $data = get_json_body();
    $id   = materias_int($data['id_materia_correlativa'] ?? 0);

    if ($id <= 0) json_response(['exito' => false, 'mensaje' => 'ID de correlatividad inválido.']);

    try {
        $stmt = $pdo->prepare("DELETE FROM materias_correlativas WHERE id_materia_correlativa = :id");
        $stmt->execute([':id' => $id]);

        if ($stmt->rowCount() <= 0) {
            json_response([
                'exito'   => false,
                'mensaje' => 'No se eliminó ninguna correlatividad porque el registro no existe o ya fue eliminado.',
            ]);
        }

        json_response(['exito' => true, 'mensaje' => 'Correlatividad eliminada correctamente.']);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito'   => false,
            'mensaje' => 'Error al eliminar correlatividad.',
        ]);
    }
}
