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
        formulario_asegurar_tablas_inscripcion($pdo);
        $in = formulario_body();

        if (!formulario_ventana_abierta($pdo)) {
            formulario_json([
                'exito' => false,
                'mensaje' => 'La inscripción está cerrada. Consultá Secretaría.',
                'tenant' => formulario_tenant_info(),
            ], 200);
        }

        $dni = formulario_normalizar_dni($in['dni'] ?? '');
        $gmail = trim((string)($in['gmail'] ?? $in['email'] ?? ''));
        $materias = isset($in['materias']) && is_array($in['materias']) ? $in['materias'] : [];

        if (!formulario_validar_dni($dni)) {
            formulario_json(['exito' => false, 'mensaje' => 'DNI inválido.'], 200);
        }

        if ($gmail === '' || !filter_var($gmail, FILTER_VALIDATE_EMAIL)) {
            formulario_json(['exito' => false, 'mensaje' => 'Ingresá un Gmail/email válido para confirmar la inscripción.'], 200);
        }

        if (count($materias) === 0) {
            formulario_json(['exito' => false, 'mensaje' => 'No se enviaron materias a inscribir.'], 200);
        }

        $normalizadas = [];
        foreach ($materias as $materia) {
            $idPrevia = isset($materia['id_previa']) ? (int)$materia['id_previa'] : 0;
            $idMateria = isset($materia['id_materia']) ? (int)$materia['id_materia'] : 0;
            $idCurso = isset($materia['curso_id']) ? (int)$materia['curso_id'] : 0;
            $idDivision = isset($materia['division_id']) ? (int)$materia['division_id'] : 0;

            if ($idMateria <= 0 || $idCurso <= 0 || $idDivision <= 0) {
                formulario_json(['exito' => false, 'mensaje' => 'Estructura de materias inválida.'], 200);
            }

            $clave = ($idPrevia > 0 ? 'p' . $idPrevia : 'm' . $idMateria . '_' . $idCurso . '_' . $idDivision);
            $normalizadas[$clave] = [
                'id_previa' => $idPrevia,
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
                p.dni,
                p.alumno,
                p.id_materia,
                p.materia_id_curso,
                p.materia_id_division,
                p.id_condicion,
                CASE WHEN COALESCE(p.inscripcion, 0) = 1 THEN 1 ELSE 0 END AS inscripcion,
                p.anio,
                m.materia,
                c_mat.nombre_curso AS curso,
                d_mat.nombre_division AS division
            FROM previas p
            INNER JOIN materias m ON m.id_materia = p.id_materia
            LEFT JOIN curso c_mat ON c_mat.id_curso = p.materia_id_curso
            LEFT JOIN division d_mat ON d_mat.id_division = p.materia_id_division
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
                if ($m['id_previa'] > 0 && (int)$row['id_previa'] !== $m['id_previa']) {
                    $materiasFaltantes[] = $m;
                    continue;
                }

                $idMateriaRow = (int)$row['id_materia'];
                $idCursoRow = (int)$row['materia_id_curso'];
                $idDivisionRow = (int)$row['materia_id_division'];

                $materiasValidas[] = [
                    'id_previa' => (int)$row['id_previa'],
                    'id_materia' => $idMateriaRow,
                    'curso_id' => $idCursoRow,
                    'division_id' => $idDivisionRow,
                    'id_condicion' => (int)$row['id_condicion'],
                    'materia' => (string)$row['materia'],
                    'curso' => (string)($row['curso'] ?? ''),
                    'division' => (string)($row['division'] ?? ''),
                    'alumno' => (string)$row['alumno'],
                    'anio' => (int)$row['anio'],
                    'inscripcion' => (int)$row['inscripcion'],
                    'clave_unica' => $idMateriaRow . '_' . $idCursoRow . '_' . $idDivisionRow,
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
                'tenant' => formulario_tenant_info(),
            ], 200);
        }

        // Validación fuerte de correlativas para el formulario público.
        // No alcanza con validar solo las materias enviadas: si el alumno intenta
        // inscribirse únicamente a una posterior (ej. DIGITAL IV), también se debe
        // mirar el resto de sus previas activas para detectar la cadena completa
        // (ej. DIGITAL II -> DIGITAL III -> DIGITAL IV, aunque DIGITAL III no esté pendiente).
        $todasMateriasAlumno = formulario_obtener_previas_condicion3_para_dni($pdo, $dni);
        [$todasMateriasConCorrelativas] = formulario_aplicar_correlativas($pdo, $todasMateriasAlumno);

        $seleccionadasPorClave = [];
        foreach ($materiasValidas as $m) {
            $seleccionadasPorClave[(string)$m['clave_unica']] = true;
        }

        $todasPorClave = [];
        foreach ($todasMateriasConCorrelativas as $m) {
            $todasPorClave[(string)$m['clave_unica']] = $m;
        }

        $bloqueosCorrelativas = [];
        foreach ($todasMateriasConCorrelativas as $m) {
            $clavePosterior = (string)$m['clave_unica'];
            if (!isset($seleccionadasPorClave[$clavePosterior])) {
                continue;
            }

            $anteriores = $m['correlativas_anteriores'] ?? [];
            if (!is_array($anteriores) || count($anteriores) === 0) {
                continue;
            }

            foreach ($anteriores as $claveAnterior) {
                $claveAnterior = (string)$claveAnterior;
                $anterior = $todasPorClave[$claveAnterior] ?? null;

                if (!$anterior) {
                    continue;
                }

                $anteriorYaInscripta = (int)($anterior['inscripcion'] ?? 0) === 1;

                // Regla estricta del formulario: la anterior debe quedar confirmada
                // primero. No alcanza con seleccionar anterior y posterior en el
                // mismo envío, porque la posterior debe habilitarse recién después.
                if ($anteriorYaInscripta) {
                    continue;
                }

                if (!isset($bloqueosCorrelativas[$clavePosterior])) {
                    $bloqueosCorrelativas[$clavePosterior] = [
                        'materia' => (string)($m['materia'] ?? 'Materia posterior'),
                        'curso' => (string)($m['curso'] ?? ''),
                        'division' => (string)($m['division'] ?? ''),
                        'anteriores' => [],
                    ];
                }

                $bloqueosCorrelativas[$clavePosterior]['anteriores'][] = [
                    'materia' => (string)($anterior['materia'] ?? 'Correlativa anterior'),
                    'curso' => (string)($anterior['curso'] ?? ''),
                    'division' => (string)($anterior['division'] ?? ''),
                    'clave_unica' => $claveAnterior,
                ];
            }
        }

        if (count($bloqueosCorrelativas) > 0) {
            $pdo->rollBack();

            $mensajes = [];
            foreach ($bloqueosCorrelativas as $bloqueo) {
                $anterioresTxt = implode(', ', array_values(array_unique(array_map(static function (array $a): string {
                    $detalle = trim((string)$a['materia']);
                    $curso = trim((string)($a['curso'] ?? ''));
                    $division = trim((string)($a['division'] ?? ''));
                    $cursoDivision = trim($curso . ($division !== '' ? ' ' . $division : ''));
                    return $cursoDivision !== '' ? $detalle . ' (' . $cursoDivision . ')' : $detalle;
                }, $bloqueo['anteriores']))));

                $posteriorTxt = trim((string)$bloqueo['materia']);
                $cursoPosterior = trim((string)($bloqueo['curso'] ?? ''));
                $divisionPosterior = trim((string)($bloqueo['division'] ?? ''));
                $cursoDivisionPosterior = trim($cursoPosterior . ($divisionPosterior !== '' ? ' ' . $divisionPosterior : ''));
                if ($cursoDivisionPosterior !== '') {
                    $posteriorTxt .= ' (' . $cursoDivisionPosterior . ')';
                }

                $mensajes[] = $posteriorTxt . ' requiere primero ' . $anterioresTxt;
            }

            formulario_json([
                'exito' => false,
                'mensaje' => 'Hay materias correlativas que deben respetar el orden de inscripción. Primero confirmá la materia anterior y después volvé a inscribirte a la posterior. ' . implode('. ', $mensajes) . '.',
                'correlativas_bloqueadas' => array_values($bloqueosCorrelativas),
                'tenant' => formulario_tenant_info(),
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
                'tenant' => formulario_tenant_info(),
            ], 200);
        }

        $alumno = (string)($materiasValidas[0]['alumno'] ?? '');
        $anioInscripcion = (int)date('Y');
        $host = function_exists('request_host_normalizado') ? request_host_normalizado() : (string)($_SERVER['HTTP_HOST'] ?? '');

        $sqlInscripcion = "
            INSERT INTO formulario_inscripciones (
                dni, gmail, alumno, anio, estado, origen_host, ip, user_agent, total_materias, creado_en, actualizado_en
            ) VALUES (
                :dni, :gmail, :alumno, :anio, 'registrada', :origen_host, :ip, :user_agent, :total_materias, NOW(), NOW()
            )
            ON DUPLICATE KEY UPDATE
                id_inscripcion = LAST_INSERT_ID(id_inscripcion),
                gmail = VALUES(gmail),
                alumno = VALUES(alumno),
                estado = 'registrada',
                origen_host = VALUES(origen_host),
                ip = VALUES(ip),
                user_agent = VALUES(user_agent),
                actualizado_en = NOW()
        ";
        $stInscripcion = $pdo->prepare($sqlInscripcion);
        $stInscripcion->execute([
            ':dni' => $dni,
            ':gmail' => $gmail,
            ':alumno' => $alumno,
            ':anio' => $anioInscripcion,
            ':origen_host' => substr($host, 0, 190),
            ':ip' => formulario_ip_cliente(),
            ':user_agent' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ':total_materias' => count($materiasValidas),
        ]);
        $idInscripcion = (int)$pdo->lastInsertId();

        $sqlDetalle = "
            INSERT INTO formulario_inscripciones_detalle (
                id_inscripcion, id_previa, id_materia, materia_nombre, curso_id, division_id, id_condicion, estado, creado_en, actualizado_en
            ) VALUES (
                :id_inscripcion, :id_previa, :id_materia, :materia_nombre, :curso_id, :division_id, :id_condicion, 'inscripta', NOW(), NOW()
            )
            ON DUPLICATE KEY UPDATE
                id_inscripcion = VALUES(id_inscripcion),
                id_materia = VALUES(id_materia),
                materia_nombre = VALUES(materia_nombre),
                curso_id = VALUES(curso_id),
                division_id = VALUES(division_id),
                id_condicion = VALUES(id_condicion),
                estado = 'inscripta',
                actualizado_en = NOW()
        ";
        $stDetalle = $pdo->prepare($sqlDetalle);

        foreach ($materiasValidas as $m) {
            $stDetalle->execute([
                ':id_inscripcion' => $idInscripcion,
                ':id_previa' => $m['id_previa'],
                ':id_materia' => $m['id_materia'],
                ':materia_nombre' => $m['materia'],
                ':curso_id' => $m['curso_id'],
                ':division_id' => $m['division_id'],
                ':id_condicion' => $m['id_condicion'],
            ]);
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

        $stTotal = $pdo->prepare("\n            UPDATE formulario_inscripciones fi\n               SET total_materias = (\n                   SELECT COUNT(*)\n                     FROM formulario_inscripciones_detalle fid\n                    WHERE fid.id_inscripcion = fi.id_inscripcion\n                      AND fid.estado <> 'anulada'\n               )\n             WHERE fi.id_inscripcion = :id_inscripcion\n        ");
        $stTotal->execute([':id_inscripcion' => $idInscripcion]);

        $pdo->commit();

        $emailResultado = formulario_enviar_email_confirmacion($pdo, $gmail, $dni, $alumno, $materiasValidas, $anioInscripcion);

        try {
            $stEmail = $pdo->prepare("\n                UPDATE formulario_inscripciones\n                   SET email_confirmacion_enviado = :enviado,\n                       email_confirmacion_enviado_en = CASE WHEN :enviado2 = 1 THEN NOW() ELSE email_confirmacion_enviado_en END,\n                       email_confirmacion_error = :error\n                 WHERE id_inscripcion = :id_inscripcion\n                 LIMIT 1\n            ");
            $stEmail->execute([
                ':enviado' => !empty($emailResultado['enviado']) ? 1 : 0,
                ':enviado2' => !empty($emailResultado['enviado']) ? 1 : 0,
                ':error' => !empty($emailResultado['enviado']) ? null : substr((string)($emailResultado['error'] ?? 'Error enviando email.'), 0, 255),
                ':id_inscripcion' => $idInscripcion,
            ]);
        } catch (Throwable $emailUpdateError) {
            if (function_exists('log_error')) {
                log_error($emailUpdateError, 'formulario:registrar_inscripcion:update_email_status');
            }
        }

        formulario_json([
            'exito' => true,
            'mensaje' => !empty($emailResultado['enviado'])
                ? 'Inscripción registrada correctamente. Te enviamos la confirmación al email ingresado.'
                : 'Inscripción registrada correctamente, pero no se pudo enviar el email de confirmación. Consultá Secretaría si necesitás constancia.',
            'id_inscripcion' => $idInscripcion,
            'dni' => $dni,
            'gmail' => $gmail,
            'email_enviado' => !empty($emailResultado['enviado']),
            'email_error' => $emailResultado['error'] ?? null,
            'insertados' => $marcadas,
            'marcadas' => $marcadas,
            'anio' => $anioInscripcion,
            'tenant' => formulario_tenant_info(),
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
            'tenant' => function_exists('formulario_tenant_info') ? formulario_tenant_info() : null,
        ], 200);
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    form_registrar_inscripcion();
}
