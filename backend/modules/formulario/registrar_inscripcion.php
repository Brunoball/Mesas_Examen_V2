<?php
// backend/modules/formulario/registrar_inscripcion.php
declare(strict_types=1);

require_once __DIR__ . '/formulario_helpers.php';

function form_registrar_inscripcion(): void
{
    formulario_method('POST');

    $pdo = null;

    try {
        date_default_timezone_set('America/Argentina/Cordoba');
        $pdo = formulario_pdo();
        $in = formulario_body();

        if (!formulario_ventana_abierta($pdo)) {
            formulario_json([
                'exito' => false,
                'mensaje' => 'La inscripción está cerrada. Consultá Secretaría.',
            ], 200);
        }

        $dni = formulario_normalizar_dni($in['dni'] ?? '');
        $materias = isset($in['materias']) && is_array($in['materias']) ? $in['materias'] : [];

        if (!formulario_validar_dni($dni)) {
            formulario_json(['exito' => false, 'mensaje' => 'DNI inválido.'], 200);
        }

        if (count($materias) === 0) {
            formulario_json(['exito' => false, 'mensaje' => 'No se enviaron materias a inscribir.'], 200);
        }

        $normalizadas = [];
        foreach ($materias as $materia) {
            $idMateria = isset($materia['id_materia']) ? (int)$materia['id_materia'] : 0;
            $idCurso = isset($materia['curso_id']) ? (int)$materia['curso_id'] : 0;
            $idDivision = isset($materia['division_id']) ? (int)$materia['division_id'] : 0;

            if ($idMateria <= 0 || $idCurso <= 0 || $idDivision <= 0) {
                formulario_json(['exito' => false, 'mensaje' => 'Estructura de materias inválida.'], 200);
            }

            $clave = $idMateria . '_' . $idCurso . '_' . $idDivision;
            $normalizadas[$clave] = [
                'id_materia' => $idMateria,
                'curso_id' => $idCurso,
                'division_id' => $idDivision,
            ];
        }

        $pdo->beginTransaction();

        $materiasValidas = [];
        $materiasFaltantes = [];

        $sqlCheck = "
            SELECT
                p.id_previa,
                p.id_materia,
                p.materia_id_curso,
                p.materia_id_division,
                CASE WHEN COALESCE(p.inscripcion, 0) = 1 THEN 1 ELSE 0 END AS inscripcion,
                m.materia
            FROM previas p
            INNER JOIN materias m ON m.id_materia = p.id_materia
            WHERE p.dni = :dni
              AND p.id_condicion = 3
              AND p.activo = 1
              AND p.id_materia = :id_materia
              AND p.materia_id_curso = :id_curso
              AND p.materia_id_division = :id_division
            LIMIT 1
        ";
        $stCheck = $pdo->prepare($sqlCheck);

        foreach ($normalizadas as $m) {
            $stCheck->execute([
                ':dni' => $dni,
                ':id_materia' => $m['id_materia'],
                ':id_curso' => $m['curso_id'],
                ':id_division' => $m['division_id'],
            ]);

            $row = $stCheck->fetch();

            if ($row) {
                $materiasValidas[] = [
                    'id_previa' => (int)$row['id_previa'],
                    'id_materia' => (int)$row['id_materia'],
                    'curso_id' => (int)$row['materia_id_curso'],
                    'division_id' => (int)$row['materia_id_division'],
                    'materia' => (string)$row['materia'],
                    'inscripcion' => (int)$row['inscripcion'],
                ];
            } else {
                $materiasFaltantes[] = $m;
            }
        }

        if (count($materiasFaltantes) > 0) {
            $pdo->rollBack();
            formulario_json([
                'exito' => false,
                'mensaje' => 'Algunas materias no corresponden a previas activas para ese DNI.',
                'materias_faltantes' => $materiasFaltantes,
            ], 200);
        }

        $yaMarcadas = array_sum(array_map(static fn(array $m): int => $m['inscripcion'] === 1 ? 1 : 0, $materiasValidas));

        if ($yaMarcadas === count($materiasValidas)) {
            $pdo->rollBack();
            formulario_json([
                'exito' => false,
                'mensaje' => 'Este alumno ya fue inscripto en las materias seleccionadas.',
                'ya_inscripto' => true,
                'anio_inscripcion' => (int)date('Y'),
            ], 200);
        }

        $sqlUpdate = "
            UPDATE previas
               SET inscripcion = 1
             WHERE id_previa = :id_previa
               AND dni = :dni
               AND id_condicion = 3
               AND activo = 1
               AND COALESCE(inscripcion, 0) <> 1
        ";
        $stUpdate = $pdo->prepare($sqlUpdate);

        $marcadas = 0;
        foreach ($materiasValidas as $m) {
            if ($m['inscripcion'] === 1) {
                continue;
            }

            $stUpdate->execute([
                ':id_previa' => $m['id_previa'],
                ':dni' => $dni,
            ]);
            $marcadas += $stUpdate->rowCount();
        }

        $pdo->commit();

        formulario_json([
            'exito' => true,
            'mensaje' => 'Inscripción registrada correctamente.',
            'insertados' => $marcadas,
            'marcadas' => $marcadas,
            'anio' => (int)date('Y'),
        ], 200);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        if (function_exists('log_error')) {
            log_error($e, 'formulario:registrar_inscripcion');
        }

        formulario_json([
            'exito' => false,
            'mensaje' => 'Error al registrar la inscripción.',
            'detalle' => $e->getMessage(),
        ], 200);
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    form_registrar_inscripcion();
}
