<?php
// backend/modules/mesas/armado_mesas/fases/helpers_armado.php
declare(strict_types=1);

function mesas_armado_fecha_valida(string $fecha): bool
{
    $d = DateTimeImmutable::createFromFormat('Y-m-d', $fecha);
    return $d instanceof DateTimeImmutable && $d->format('Y-m-d') === $fecha;
}

function mesas_armado_fecha_es_fin_de_semana(string $fecha): bool
{
    if (!mesas_armado_fecha_valida($fecha)) {
        return false;
    }

    $d = new DateTimeImmutable($fecha);
    $numeroDia = (int)$d->format('N');

    return $numeroDia >= 6;
}

function mesas_armado_ajustar_a_dia_habil(string $fecha, string $direccion = 'siguiente'): string
{
    if (!mesas_armado_fecha_valida($fecha)) {
        return $fecha;
    }

    $d = new DateTimeImmutable($fecha);
    $paso = $direccion === 'anterior' ? '-1 day' : '+1 day';

    while ((int)$d->format('N') >= 6) {
        $d = $d->modify($paso);
    }

    return $d->format('Y-m-d');
}

function mesas_armado_obtener_slots(PDO $pdo, string $fechaInicio, string $fechaFin, bool $excluirFinesSemana = true): array
{
    // Regla obligatoria del armado: nunca se generan mesas sábado ni domingo.
    // Aunque el frontend envíe otro valor, el backend siempre descarta fines de semana.
    $excluirFinesSemana = true;

    $stmtTurnos = $pdo->query("
        SELECT id_turno, turno
        FROM turnos
        WHERE activo = 1
        ORDER BY id_turno ASC
    ");

    $turnos = $stmtTurnos->fetchAll(PDO::FETCH_ASSOC);

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
                    'turno' => (string)$turno['turno'],
                ];
            }
        }

        $actual = $actual->modify('+1 day');
    }

    return $slots;
}

/**
 * Obtiene las previas que entran al armado.
 *
 * Regla para obtener docente:
 * - Si hay una sola cátedra/docente para materia + curso + división, usa ese.
 * - Si hay más de una cátedra/docente para la misma materia + curso + división,
 *   prioriza SIEMPRE el docente con cargo SUPLENTE.
 * - Si no hay suplente activo, usa el docente activo disponible.
 *
 * En tu tabla cargos:
 * 1 = TITULAR
 * 2 = SUPLENTE
 * 3 = ROTACIÓN
 * 4 = VACANTE
 */
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
            con.condicion,
            p.inscripcion,
            p.activo,
            p.anio,

            mat.materia,

            cat.id_catedra,
            cat.id_docente AS id_docente_catedra,
            doc.id_docente AS id_docente,

            doc.docente,
            doc.id_cargo,
            cargo_doc.cargo AS cargo_docente,

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

        LEFT JOIN condicion con
            ON con.id_condicion = p.id_condicion

        LEFT JOIN catedras cat
            ON cat.id_catedra = (
                SELECT c2.id_catedra
                FROM catedras c2

                LEFT JOIN docentes d2
                    ON d2.id_docente = c2.id_docente

                LEFT JOIN cargos cargo2
                    ON cargo2.id_cargo = d2.id_cargo

                WHERE c2.id_materia = p.id_materia
                  AND c2.id_curso = p.materia_id_curso
                  AND c2.id_division = p.materia_id_division
                  AND c2.activo = 1

                ORDER BY
                    CASE
                        WHEN d2.activo = 1
                         AND (
                                d2.id_cargo = 2
                                OR UPPER(TRIM(COALESCE(cargo2.cargo, ''))) = 'SUPLENTE'
                             )
                        THEN 0

                        WHEN d2.activo = 1
                         AND d2.id_docente IS NOT NULL
                        THEN 1

                        WHEN c2.id_docente IS NULL
                        THEN 2

                        ELSE 3
                    END ASC,
                    c2.id_catedra ASC

                LIMIT 1
            )

        LEFT JOIN docentes doc
            ON doc.id_docente = cat.id_docente
           AND doc.activo = 1

        LEFT JOIN cargos cargo_doc
            ON cargo_doc.id_cargo = doc.id_cargo

        LEFT JOIN (
            SELECT
                tm.id_catedra,
                MIN(tm.id_taller) AS id_taller
            FROM talleres_materias tm
            INNER JOIN talleres ta
                ON ta.id_taller = tm.id_taller
               AND ta.activo = 1
            WHERE tm.activo = 1
              AND tm.id_catedra IS NOT NULL
            GROUP BY tm.id_catedra
        ) taller_map
            ON taller_map.id_catedra = cat.id_catedra

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
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function mesas_armado_obtener_bloqueos_docentes(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT id_docente, id_turno, fecha
        FROM docentes_bloques_no
        ORDER BY id_docente ASC, fecha ASC, id_turno ASC
    ");

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
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

        $fecha = (string)$slot['fecha'];
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
    // Reutiliza cualquier fila operativa de esa previa.
    // Si no se limpia el borrador, evita insertar duplicados al rearmar.
    $stmt = $pdo->prepare("
        SELECT id_mesa
        FROM mesas
        WHERE id_previa = ?
          AND estado IN ('borrador', 'observada', 'armada')
        ORDER BY id_mesa DESC
        LIMIT 1
    ");

    $stmt->execute([$idPrevia]);

    return (int)($stmt->fetchColumn() ?: 0);
}

function mesas_armado_eliminar_mesas_por_previa(PDO $pdo, int $idPrevia): int
{
    $stmt = $pdo->prepare("
        DELETE FROM mesas
        WHERE id_previa = ?
          AND estado IN ('borrador', 'observada', 'armada')
    ");
    $stmt->execute([$idPrevia]);

    return $stmt->rowCount();
}

function mesas_armado_obtener_materias_de_taller(PDO $pdo, int $idTaller, int $idCurso, int $idDivision): array
{
    /**
     * talleres_materias guarda solo id_catedra como vínculo real.
     * Curso, división y materia salen siempre desde catedras.
     */
    $stmt = $pdo->prepare("
        SELECT
            tm.id_taller,
            tm.id_catedra,
            ca.id_curso,
            ca.id_division,
            ca.id_materia,
            mat.materia,
            ca.id_docente AS id_docente_catedra,
            doc.id_docente,
            doc.docente,
            doc.id_cargo,
            cargo.cargo AS cargo_docente,
            tm.orden
        FROM talleres_materias tm
        INNER JOIN talleres ta
            ON ta.id_taller = tm.id_taller
           AND ta.activo = 1
        INNER JOIN catedras ca
            ON ca.id_catedra = tm.id_catedra
           AND ca.activo = 1
        INNER JOIN materias mat
            ON mat.id_materia = ca.id_materia
           AND mat.activo = 1
        LEFT JOIN docentes doc
            ON doc.id_docente = ca.id_docente
           AND doc.activo = 1
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = doc.id_cargo
        WHERE tm.id_taller = ?
          AND ca.id_curso = ?
          AND ca.id_division = ?
          AND tm.activo = 1
        ORDER BY
            COALESCE(tm.orden, 999999) ASC,
            mat.materia ASC,
            ca.id_catedra ASC
    ");

    $stmt->execute([$idTaller, $idCurso, $idDivision]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Busca la cátedra/docente para una materia concreta del taller.
 * Mantiene la misma regla del armado base: si hubiera más de una opción,
 * prioriza docente suplente activo; si no, el docente activo disponible.
 */
function mesas_armado_obtener_catedra_para_materia_curso_division(
    PDO $pdo,
    int $idMateria,
    int $idCurso,
    int $idDivision
): ?array {
    $stmt = $pdo->prepare("
        SELECT
            c.id_catedra,
            c.id_materia,
            c.id_curso,
            c.id_division,
            c.id_docente AS id_docente_catedra,
            d.id_docente,
            d.docente,
            d.id_cargo,
            cargo.cargo AS cargo_docente
        FROM catedras c
        LEFT JOIN docentes d
            ON d.id_docente = c.id_docente
        LEFT JOIN cargos cargo
            ON cargo.id_cargo = d.id_cargo
        WHERE c.id_materia = ?
          AND c.id_curso = ?
          AND c.id_division = ?
          AND c.activo = 1
        ORDER BY
            CASE
                WHEN d.activo = 1
                 AND (
                        d.id_cargo = 2
                        OR UPPER(TRIM(COALESCE(cargo.cargo, ''))) = 'SUPLENTE'
                     )
                THEN 0

                WHEN d.activo = 1
                 AND d.id_docente IS NOT NULL
                THEN 1

                WHEN c.id_docente IS NULL
                THEN 2

                ELSE 3
            END ASC,
            c.id_catedra ASC
        LIMIT 1
    ");

    $stmt->execute([$idMateria, $idCurso, $idDivision]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        return null;
    }

    return [
        'id_catedra' => (int)$row['id_catedra'],
        'id_materia' => (int)$row['id_materia'],
        'id_docente' => $row['id_docente'] !== null ? (int)$row['id_docente'] : null,
        'docente' => $row['docente'] ?? null,
        'id_cargo' => $row['id_cargo'] !== null ? (int)$row['id_cargo'] : null,
        'cargo_docente' => $row['cargo_docente'] ?? null,
    ];
}
