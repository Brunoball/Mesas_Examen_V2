<?php
// backend/modules/mesas/armado_mesas/fases/helpers_armado.php
declare(strict_types=1);

function mesas_armado_fecha_valida(string $fecha): bool
{
    $d = DateTimeImmutable::createFromFormat('Y-m-d', $fecha);
    return $d instanceof DateTimeImmutable && $d->format('Y-m-d') === $fecha;
}

function mesas_armado_obtener_slots(PDO $pdo, string $fechaInicio, string $fechaFin, bool $excluirFinesSemana): array
{
    $stmtTurnos = $pdo->query("
        SELECT id_turno, turno
        FROM turnos
        WHERE activo = 1
        ORDER BY id_turno ASC
    ");

    $turnos = $stmtTurnos->fetchAll();

    if (count($turnos) === 0) {
        return [];
    }

    $inicio = new DateTimeImmutable($fechaInicio);
    $fin = new DateTimeImmutable($fechaFin);

    $slots = [];
    $actual = $inicio;

    while ($actual <= $fin) {
        $numeroDia = (int)$actual->format('N');

        if (!$excluirFinesSemana || $numeroDia <= 5) {
            foreach ($turnos as $turno) {
                $slots[] = [
                    'fecha' => $actual->format('Y-m-d'),
                    'id_turno' => (int)$turno['id_turno'],
                    'turno' => $turno['turno'],
                ];
            }
        }

        $actual = $actual->modify('+1 day');
    }

    return $slots;
}

function mesas_armado_obtener_previas_para_armar(PDO $pdo): array
{
    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            p.inscripcion,
            p.activo,
            p.anio,

            mat.materia,

            cat.id_catedra,
            cat.id_docente,

            doc.docente,

            taller_map.id_taller,

            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM materias_correlativas mc
                    INNER JOIN previas p2
                        ON p2.dni = p.dni
                       AND p2.activo = 1
                       AND p2.inscripcion = 1
                       AND p2.id_condicion = 3
                    WHERE mc.activo = 1
                      AND mc.bloquea_armado = 1
                      AND (
                            (
                                mc.id_materia = p.id_materia
                                AND mc.id_curso = p.materia_id_curso
                                AND p2.id_materia = mc.id_materia_relacionada
                                AND p2.materia_id_curso = mc.id_curso_relacionada
                            )
                            OR
                            (
                                mc.id_materia_relacionada = p.id_materia
                                AND mc.id_curso_relacionada = p.materia_id_curso
                                AND p2.id_materia = mc.id_materia
                                AND p2.materia_id_curso = mc.id_curso
                            )
                      )
                    LIMIT 1
                )
                THEN 1
                ELSE 0
            END AS tiene_correlativa_alumno

        FROM previas p
        INNER JOIN materias mat
            ON mat.id_materia = p.id_materia

        LEFT JOIN catedras cat
            ON cat.id_materia = p.id_materia
           AND cat.id_curso = p.materia_id_curso
           AND cat.id_division = p.materia_id_division
           AND cat.activo = 1

        LEFT JOIN docentes doc
            ON doc.id_docente = cat.id_docente
           AND doc.activo = 1

        LEFT JOIN (
            SELECT
                tm.id_materia,
                MIN(tm.id_taller) AS id_taller
            FROM talleres_materias tm
            INNER JOIN talleres ta
                ON ta.id_taller = tm.id_taller
               AND ta.activo = 1
            WHERE tm.activo = 1
            GROUP BY tm.id_materia
        ) taller_map
            ON taller_map.id_materia = p.id_materia

        WHERE p.inscripcion = 1
          AND p.activo = 1
          AND p.id_condicion = 3

        ORDER BY
            tiene_correlativa_alumno DESC,
            taller_map.id_taller IS NOT NULL DESC,
            p.materia_id_curso ASC,
            p.materia_id_division ASC,
            mat.materia ASC,
            p.alumno ASC
    ";

    $stmt = $pdo->query($sql);
    return $stmt->fetchAll();
}

function mesas_armado_obtener_bloqueos_docentes(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT id_docente, id_turno, fecha
        FROM docentes_bloques_no
        ORDER BY id_docente ASC, fecha ASC, id_turno ASC
    ");

    $rows = $stmt->fetchAll();
    $map = [];

    foreach ($rows as $row) {
        $idDocente = (int)$row['id_docente'];

        if (!isset($map[$idDocente])) {
            $map[$idDocente] = [];
        }

        $map[$idDocente][] = [
            'id_turno' => $row['id_turno'] !== null ? (int)$row['id_turno'] : null,
            'fecha' => $row['fecha'] !== null ? (string)$row['fecha'] : null,
        ];
    }

    return $map;
}

function mesas_armado_docente_bloqueado(array $bloqueos, int $idDocente, string $fecha, int $idTurno): bool
{
    if (!isset($bloqueos[$idDocente])) {
        return false;
    }

    foreach ($bloqueos[$idDocente] as $bloqueo) {
        $fechaBloqueo = $bloqueo['fecha'];
        $turnoBloqueo = $bloqueo['id_turno'];

        $coincideFecha = $fechaBloqueo === null || $fechaBloqueo === $fecha;
        $coincideTurno = $turnoBloqueo === null || $turnoBloqueo === $idTurno;

        if ($coincideFecha && $coincideTurno) {
            return true;
        }
    }

    return false;
}

function mesas_armado_buscar_slot_disponible(
    array $slots,
    array $bloqueosDocentes,
    int $idDocente,
    string $dni,
    array $ocupacionAlumno,
    int &$slotIndex
): ?array {
    $totalSlots = count($slots);

    if ($totalSlots === 0) {
        return null;
    }

    for ($i = 0; $i < $totalSlots; $i++) {
        $indice = ($slotIndex + $i) % $totalSlots;
        $slot = $slots[$indice];

        $fecha = $slot['fecha'];
        $idTurno = (int)$slot['id_turno'];

        if (mesas_armado_docente_bloqueado($bloqueosDocentes, $idDocente, $fecha, $idTurno)) {
            continue;
        }

        $claveAlumno = mesas_armado_clave_ocupacion_alumno($dni, $fecha, $idTurno);

        if (isset($ocupacionAlumno[$claveAlumno])) {
            continue;
        }

        $slotIndex = ($indice + 1) % $totalSlots;

        return $slot;
    }

    return null;
}

function mesas_armado_clave_ocupacion_alumno(string $dni, string $fecha, int $idTurno): string
{
    return $dni . '|' . $fecha . '|' . $idTurno;
}

function mesas_armado_obtener_mesa_por_previa(PDO $pdo, int $idPrevia): int
{
    $stmt = $pdo->prepare("
        SELECT id_mesa
        FROM mesas
        WHERE id_previa = ?
        LIMIT 1
    ");
    $stmt->execute([$idPrevia]);

    return (int)($stmt->fetchColumn() ?: 0);
}
