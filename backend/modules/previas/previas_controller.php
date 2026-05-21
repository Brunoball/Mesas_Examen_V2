<?php
// backend/modules/previas/previas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function previas_int($value): int
{
    return is_numeric($value) ? (int)$value : 0;
}

function previas_body(): array
{
    if (function_exists('get_json_body')) {
        $body = get_json_body();
        return is_array($body) ? $body : [];
    }

    if (function_exists('request_body')) {
        $body = request_body();
        return is_array($body) ? $body : [];
    }

    $raw = file_get_contents('php://input');
    $json = json_decode((string)$raw, true);
    return is_array($json) ? $json : [];
}

function previas_strtoupper(string $texto): string
{
    return function_exists('mb_strtoupper') ? mb_strtoupper($texto, 'UTF-8') : strtoupper($texto);
}

function previas_mayuscula($texto): string
{
    $texto = trim((string)$texto);
    $texto = preg_replace('/\s+/', ' ', $texto) ?? $texto;
    return $texto === '' ? '' : previas_strtoupper($texto);
}


function previas_tabla_existe(PDO $pdo, string $tabla): bool
{
    static $cache = [];
    $tabla = preg_replace('/[^a-zA-Z0-9_]/', '', $tabla) ?? '';

    if ($tabla === '') {
        return false;
    }

    if (array_key_exists($tabla, $cache)) {
        return $cache[$tabla];
    }

    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla');
        $stmt->execute([':tabla' => $tabla]);
        $cache[$tabla] = ((int)$stmt->fetchColumn()) > 0;
    } catch (Throwable $e) {
        $cache[$tabla] = false;
    }

    return $cache[$tabla];
}

function previas_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    static $cache = [];
    $key = $tabla . '.' . $columna;

    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `{$tabla}` LIKE :columna");
        $stmt->execute([':columna' => $columna]);
        $cache[$key] = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $cache[$key] = true;
    }

    return $cache[$key];
}

function previas_select_columna(PDO $pdo, string $tabla, string $aliasTabla, string $columna, string $aliasColumna, string $fallback = 'NULL'): string
{
    if (previas_columna_existe($pdo, $tabla, $columna)) {
        return "{$aliasTabla}.{$columna} AS {$aliasColumna}";
    }

    return "{$fallback} AS {$aliasColumna}";
}

function previas_fecha_valida($fecha, bool $requerida = false): ?string
{
    $fecha = trim((string)$fecha);

    if ($fecha === '') {
        return $requerida ? null : null;
    }

    $dt = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$dt || $dt->format('Y-m-d') !== $fecha) {
        return null;
    }

    return $fecha;
}

function previas_paginacion(): array
{
    $pagina = max(1, previas_int($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(1, previas_int($_GET['por_pagina'] ?? 20)));

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => ($pagina - 1) * $porPagina,
    ];
}

function previas_ids_desde_body(array $body): array
{
    $ids = [];

    if (isset($body['ids_previas']) && is_array($body['ids_previas'])) {
        $ids = $body['ids_previas'];
    } elseif (isset($body['ids_previas'])) {
        $ids = explode(',', (string)$body['ids_previas']);
    } elseif (isset($body['id_previa'])) {
        $ids = [$body['id_previa']];
    } elseif (isset($body['id'])) {
        $ids = [$body['id']];
    }

    $ids = array_map(static function ($id) {
        $id = previas_int($id);
        return $id > 0 ? $id : null;
    }, $ids);

    return array_values(array_unique(array_filter($ids)));
}

function previas_alumno_desde_payload(array $payload): string
{
    $alumno = previas_mayuscula($payload['alumno'] ?? '');

    if ($alumno !== '') {
        return $alumno;
    }

    $apellido = previas_mayuscula($payload['apellido'] ?? '');
    $nombre = previas_mayuscula($payload['nombre'] ?? '');

    if ($apellido !== '' && $nombre !== '') {
        return $apellido . ', ' . $nombre;
    }

    return trim($apellido . ' ' . $nombre);
}

function previas_existe_activo(PDO $pdo, string $tabla, string $pk, int $id): bool
{
    if ($id <= 0) {
        return false;
    }

    $stmt = $pdo->prepare("SELECT {$pk} FROM {$tabla} WHERE {$pk} = :id AND activo = 1 LIMIT 1");
    $stmt->execute([':id' => $id]);

    return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
}

function previas_es_curso_egresado(PDO $pdo, int $idCurso): bool
{
    if ($idCurso <= 0) {
        return false;
    }

    $stmt = $pdo->prepare('SELECT nombre_curso FROM curso WHERE id_curso = :id_curso LIMIT 1');
    $stmt->execute([':id_curso' => $idCurso]);
    $nombre = previas_strtoupper((string)$stmt->fetchColumn());

    return $nombre === 'EGRESADO';
}

function previas_existe_catedra_materia(PDO $pdo, int $idCurso, int $idDivision, int $idMateria): bool
{
    $stmt = $pdo->prepare("\n        SELECT id_catedra\n        FROM catedras\n        WHERE id_curso = :id_curso\n          AND id_division = :id_division\n          AND id_materia = :id_materia\n          AND activo = 1\n        LIMIT 1\n    ");

    $stmt->execute([
        ':id_curso' => $idCurso,
        ':id_division' => $idDivision,
        ':id_materia' => $idMateria,
    ]);

    return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
}

function previas_base_select(PDO $pdo): string
{
    $nota = previas_select_columna($pdo, 'previas', 'p', 'nota', 'nota', 'NULL');
    $fechaNota = previas_select_columna($pdo, 'previas', 'p', 'fecha_nota', 'fecha_nota', 'NULL');
    $fechaBaja = previas_select_columna($pdo, 'previas', 'p', 'fecha_baja', 'fecha_baja', 'NULL');
    $motivoBaja = previas_select_columna($pdo, 'previas', 'p', 'motivo_baja', 'motivo_baja', 'NULL');
    $fechaCarga = previas_select_columna($pdo, 'previas', 'p', 'fecha_carga', 'fecha_carga', 'NULL');

    return "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            COALESCE(cur_cursando.nombre_curso, '') AS cursando_curso,
            p.cursando_id_division,
            COALESCE(div_cursando.nombre_division, '') AS cursando_division,
            p.id_materia,
            COALESCE(mat.materia, '') AS materia,
            p.materia_id_curso,
            COALESCE(cur_materia.nombre_curso, '') AS materia_curso,
            p.materia_id_division,
            COALESCE(div_materia.nombre_division, '') AS materia_division,
            p.id_condicion,
            COALESCE(cond.condicion, '') AS condicion,
            {$nota},
            {$fechaNota},
            p.inscripcion,
            CASE WHEN p.inscripcion = 1 THEN 'Sí' ELSE 'No' END AS inscripcion_texto,
            p.activo,
            p.anio,
            {$fechaCarga},
            {$fechaBaja},
            {$motivoBaja},
            TRIM(CONCAT(COALESCE(cur_materia.nombre_curso, ''), ' ', COALESCE(div_materia.nombre_division, ''))) AS curso_materia,
            TRIM(CONCAT(COALESCE(cur_cursando.nombre_curso, ''), ' ', COALESCE(div_cursando.nombre_division, ''))) AS curso_cursando
        FROM previas p
        LEFT JOIN materias mat ON mat.id_materia = p.id_materia
        LEFT JOIN condicion cond ON cond.id_condicion = p.id_condicion
        LEFT JOIN curso cur_cursando ON cur_cursando.id_curso = p.cursando_id_curso
        LEFT JOIN division div_cursando ON div_cursando.id_division = p.cursando_id_division
        LEFT JOIN curso cur_materia ON cur_materia.id_curso = p.materia_id_curso
        LEFT JOIN division div_materia ON div_materia.id_division = p.materia_id_division
    ";
}

function previas_condiciones(): void
{
    $pdo = db();

    try {
        $condiciones = $pdo->query("
            SELECT
                id_condicion,
                condicion
            FROM condicion
            WHERE activo = 1
            ORDER BY id_condicion ASC
        ")->fetchAll(PDO::FETCH_ASSOC);

        json_response([
            'exito' => true,
            'data' => [
                'condiciones' => $condiciones,
            ],
            'condiciones' => $condiciones,
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener las condiciones.',
        ], 500);
    }
}

function previas_catalogos(): void
{
    $pdo = db();

    try {
        $cursos = [];
        $divisiones = [];
        $condiciones = [];
        $catedras = [];

        try {
            $cursos = $pdo->query("
                SELECT id_curso, nombre_curso
                FROM curso
                WHERE activo = 1
                ORDER BY id_curso ASC
            ")->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . ':cursos');
        }

        try {
            $divisiones = $pdo->query("
                SELECT id_division, nombre_division
                FROM division
                WHERE activo = 1
                ORDER BY nombre_division ASC
            ")->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . ':divisiones');
        }

        try {
            $condiciones = $pdo->query("
                SELECT id_condicion, condicion
                FROM condicion
                WHERE activo = 1
                ORDER BY id_condicion ASC
            ")->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            log_error($e, __FUNCTION__ . ':condiciones');
        }

        $incluirCatedras = previas_int($_GET['incluir_catedras'] ?? 0) === 1;

        if ($incluirCatedras) {
            try {
                $catedras = $pdo->query("
                    SELECT DISTINCT
                        cat.id_curso,
                        cu.nombre_curso,
                        cat.id_division,
                        divi.nombre_division,
                        cat.id_materia,
                        mat.materia
                    FROM catedras cat
                    INNER JOIN curso cu ON cu.id_curso = cat.id_curso
                    INNER JOIN division divi ON divi.id_division = cat.id_division
                    INNER JOIN materias mat ON mat.id_materia = cat.id_materia
                    WHERE cat.activo = 1
                      AND cu.activo = 1
                      AND divi.activo = 1
                      AND mat.activo = 1
                    ORDER BY cu.id_curso ASC, divi.nombre_division ASC, mat.materia ASC
                ")->fetchAll(PDO::FETCH_ASSOC);
            } catch (Throwable $e) {
                // Las cátedras son fallback para materias; no deben impedir que carguen condiciones.
                log_error($e, __FUNCTION__ . ':catedras');
            }
        }

        $payload = [
            'cursos' => $cursos,
            'divisiones' => $divisiones,
            'condiciones' => $condiciones,
            'catedras' => $catedras,
        ];

        $response = [
            'exito' => true,
            'data' => $payload,
        ];

        foreach ($payload as $key => $value) {
            $response[$key] = $value;
        }

        json_response($response);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener los catálogos de previas.',
        ], 500);
    }
}

function previas_listar(): void
{
    $pdo = db();
    $pag = previas_paginacion();

    $activo = isset($_GET['activo']) ? previas_int($_GET['activo']) : 1;
    $activo = $activo === 0 ? 0 : 1;
    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $sinPaginacion = false; // Performance: el listado principal siempre trabaja paginado, incluso con búsqueda.
    $idCursoMateria = previas_int($_GET['materia_id_curso'] ?? 0);
    $idDivisionMateria = previas_int($_GET['materia_id_division'] ?? 0);
    $idCondicion = previas_int($_GET['id_condicion'] ?? 0);
    $anio = previas_int($_GET['anio'] ?? 0);

    $where = ['p.activo = :activo'];
    $params = [':activo' => $activo];

    if ($idCursoMateria > 0) {
        $where[] = 'p.materia_id_curso = :materia_id_curso';
        $params[':materia_id_curso'] = $idCursoMateria;
    }

    if ($idDivisionMateria > 0) {
        $where[] = 'p.materia_id_division = :materia_id_division';
        $params[':materia_id_division'] = $idDivisionMateria;
    }

    if ($idCondicion > 0) {
        $where[] = 'p.id_condicion = :id_condicion';
        $params[':id_condicion'] = $idCondicion;
    }

    if ($anio > 0) {
        $where[] = 'p.anio = :anio';
        $params[':anio'] = $anio;
    }

    if ($busqueda !== '') {
        /*
         * IMPORTANTE:
         * No se reutiliza el mismo placeholder (:busqueda) varias veces porque
         * en muchos Hostinger/PDO con prepares nativos eso dispara HY093
         * (Invalid parameter number) y termina como error 500 solo al buscar.
         */
        $camposBusqueda = [
            'p.alumno',
            'p.dni',
            'mat.materia',
            'cond.condicion',
            'cur_materia.nombre_curso',
            'div_materia.nombre_division',
            'cur_cursando.nombre_curso',
            'div_cursando.nombre_division',
            'p.anio',
            'p.id_previa',
        ];

        $orBusqueda = [];
        foreach ($camposBusqueda as $idx => $campo) {
            $placeholder = ':busqueda_' . $idx;
            $orBusqueda[] = "CAST({$campo} AS CHAR) LIKE {$placeholder}";
            $params[$placeholder] = '%' . $busqueda . '%';
        }

        $where[] = '(' . implode(' OR ', $orBusqueda) . ')';
    }

    $whereSql = implode(' AND ', $where);

    try {
        $joinsBusqueda = '';
        if ($busqueda !== '') {
            $joinsBusqueda = "
            LEFT JOIN materias mat ON mat.id_materia = p.id_materia
            LEFT JOIN condicion cond ON cond.id_condicion = p.id_condicion
            LEFT JOIN curso cur_materia ON cur_materia.id_curso = p.materia_id_curso
            LEFT JOIN division div_materia ON div_materia.id_division = p.materia_id_division
            LEFT JOIN curso cur_cursando ON cur_cursando.id_curso = p.cursando_id_curso
            LEFT JOIN division div_cursando ON div_cursando.id_division = p.cursando_id_division
            ";
        }

        $countSql = "
            SELECT COUNT(*)
            FROM previas p
            {$joinsBusqueda}
            WHERE {$whereSql}
        ";

        $stmtCount = $pdo->prepare($countSql);
        foreach ($params as $key => $value) {
            $stmtCount->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmtCount->execute();
        $total = (int)$stmtCount->fetchColumn();

        $sql = previas_base_select($pdo) . "
            WHERE {$whereSql}
            ORDER BY p.alumno ASC, p.dni ASC, cur_materia.id_curso ASC, div_materia.id_division ASC, mat.materia ASC
        ";

        if (!$sinPaginacion) {
            $sql .= "
            LIMIT :limit OFFSET :offset
            ";
        }

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }

        if (!$sinPaginacion) {
            $stmt->bindValue(':limit', $pag['por_pagina'], PDO::PARAM_INT);
            $stmt->bindValue(':offset', $pag['offset'], PDO::PARAM_INT);
        }

        $stmt->execute();
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $porPaginaRespuesta = $sinPaginacion ? max(1, $total) : $pag['por_pagina'];

        json_response([
            'exito' => true,
            'data' => $data,
            'paginacion' => [
                'pagina' => $sinPaginacion ? 1 : $pag['pagina'],
                'por_pagina' => $porPaginaRespuesta,
                'total' => $total,
                'paginas' => $sinPaginacion ? 1 : max(1, (int)ceil($total / $pag['por_pagina'])),
                'sin_paginacion' => $sinPaginacion,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudieron obtener las previas.',
        ], 500);
    }
}

function previas_obtener(): void
{
    $pdo = db();
    $idPrevia = previas_int($_GET['id_previa'] ?? $_GET['id'] ?? 0);

    if ($idPrevia <= 0) {
        json_response([
            'exito' => false,
            'mensaje' => 'La previa seleccionada no es válida.',
        ], 422);
    }

    try {
        $sql = previas_base_select($pdo) . "\n            WHERE p.id_previa = :id_previa\n            LIMIT 1\n        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id_previa' => $idPrevia]);
        $previa = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$previa) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se encontró la previa solicitada.',
            ], 404);
        }

        json_response([
            'exito' => true,
            'data' => $previa,
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo obtener la previa.',
        ], 500);
    }
}

function previas_validar_payload(PDO $pdo, array $payload, bool $editar): array
{
    $idPrevia = previas_int($payload['id_previa'] ?? $payload['id'] ?? 0);
    $dni = preg_replace('/\D+/', '', (string)($payload['dni'] ?? '')) ?? '';
    $alumno = previas_alumno_desde_payload($payload);

    $cursandoIdCurso = previas_int($payload['cursando_id_curso'] ?? 0);
    $cursandoIdDivision = previas_int($payload['cursando_id_division'] ?? 0);

    $idMateria = previas_int($payload['id_materia'] ?? 0);
    $materiaIdCurso = previas_int($payload['materia_id_curso'] ?? 0);
    $materiaIdDivision = previas_int($payload['materia_id_division'] ?? 0);
    $idCondicion = previas_int($payload['id_condicion'] ?? 0);
    $anio = previas_int($payload['anio'] ?? 0);

    $fechaCarga = previas_fecha_valida($payload['fecha_carga'] ?? '', true);
    $nota = isset($payload['nota']) && $payload['nota'] !== '' ? previas_int($payload['nota']) : null;
    $fechaNota = previas_fecha_valida($payload['fecha_nota'] ?? '', false);
    $inscripcion = previas_int($payload['inscripcion'] ?? 0) === 1 ? 1 : 0;

    if ($editar && $idPrevia <= 0) {
        json_response(['exito' => false, 'mensaje' => 'La previa a editar no es válida.'], 422);
    }

    if ($dni === '' || strlen($dni) < 6) {
        json_response(['exito' => false, 'mensaje' => 'El DNI del alumno es obligatorio y debe ser válido.'], 422);
    }

    if ($alumno === '') {
        json_response(['exito' => false, 'mensaje' => 'El apellido y nombre del alumno son obligatorios.'], 422);
    }

    if (!previas_existe_activo($pdo, 'curso', 'id_curso', $cursandoIdCurso)) {
        json_response(['exito' => false, 'mensaje' => 'El curso actual seleccionado no es válido.'], 422);
    }

    if (!previas_es_curso_egresado($pdo, $cursandoIdCurso)) {
        if (!previas_existe_activo($pdo, 'division', 'id_division', $cursandoIdDivision)) {
            json_response(['exito' => false, 'mensaje' => 'La división actual seleccionada no es válida.'], 422);
        }
    } else {
        $cursandoIdDivision = 0;
    }

    if (!previas_existe_activo($pdo, 'curso', 'id_curso', $materiaIdCurso)) {
        json_response(['exito' => false, 'mensaje' => 'El curso de la materia seleccionada no es válido.'], 422);
    }

    if (!previas_existe_activo($pdo, 'division', 'id_division', $materiaIdDivision)) {
        json_response(['exito' => false, 'mensaje' => 'La división de la materia seleccionada no es válida.'], 422);
    }

    if (!previas_existe_activo($pdo, 'materias', 'id_materia', $idMateria)) {
        json_response(['exito' => false, 'mensaje' => 'La materia seleccionada no es válida.'], 422);
    }

    if (!previas_existe_catedra_materia($pdo, $materiaIdCurso, $materiaIdDivision, $idMateria)) {
        json_response(['exito' => false, 'mensaje' => 'La materia no pertenece al curso y división seleccionados.'], 422);
    }

    if (!previas_existe_activo($pdo, 'condicion', 'id_condicion', $idCondicion)) {
        json_response(['exito' => false, 'mensaje' => 'La condición seleccionada no es válida.'], 422);
    }

    if ($anio < 2000 || $anio > 2100) {
        json_response(['exito' => false, 'mensaje' => 'El año de la previa no es válido.'], 422);
    }

    if ($fechaCarga === null) {
        json_response(['exito' => false, 'mensaje' => 'La fecha de carga no es válida.'], 422);
    }

    if ($nota !== null && ($nota < 1 || $nota > 10)) {
        json_response(['exito' => false, 'mensaje' => 'La nota debe estar entre 1 y 10.'], 422);
    }

    return [
        'id_previa' => $idPrevia,
        'dni' => $dni,
        'alumno' => $alumno,
        'cursando_id_curso' => $cursandoIdCurso,
        'cursando_id_division' => $cursandoIdDivision > 0 ? $cursandoIdDivision : null,
        'id_materia' => $idMateria,
        'materia_id_curso' => $materiaIdCurso,
        'materia_id_division' => $materiaIdDivision,
        'id_condicion' => $idCondicion,
        'nota' => $nota,
        'fecha_nota' => $fechaNota,
        'inscripcion' => $inscripcion,
        'anio' => $anio,
        'fecha_carga' => $fechaCarga,
    ];
}

function previas_guardar(): void
{
    $pdo = db();
    $body = previas_body();

    $idPrevia = previas_int($body['id_previa'] ?? $body['id'] ?? 0);
    $editar = $idPrevia > 0;

    try {
        $pdo->beginTransaction();

        if ($editar) {
            $data = previas_validar_payload($pdo, $body, true);

            $stmtExiste = $pdo->prepare('SELECT id_previa FROM previas WHERE id_previa = :id_previa LIMIT 1');
            $stmtExiste->execute([':id_previa' => $data['id_previa']]);

            if (!$stmtExiste->fetch(PDO::FETCH_ASSOC)) {
                $pdo->rollBack();
                json_response(['exito' => false, 'mensaje' => 'La previa que querés editar no existe.'], 404);
            }

            $stmt = $pdo->prepare("\n                UPDATE previas SET\n                    dni = :dni,\n                    alumno = :alumno,\n                    cursando_id_curso = :cursando_id_curso,\n                    cursando_id_division = :cursando_id_division,\n                    id_materia = :id_materia,\n                    materia_id_curso = :materia_id_curso,\n                    materia_id_division = :materia_id_division,\n                    id_condicion = :id_condicion,\n                    nota = :nota,\n                    fecha_nota = :fecha_nota,\n                    inscripcion = :inscripcion,\n                    anio = :anio,\n                    fecha_carga = :fecha_carga\n                WHERE id_previa = :id_previa\n            ");

            $stmt->execute([
                ':dni' => $data['dni'],
                ':alumno' => $data['alumno'],
                ':cursando_id_curso' => $data['cursando_id_curso'],
                ':cursando_id_division' => $data['cursando_id_division'],
                ':id_materia' => $data['id_materia'],
                ':materia_id_curso' => $data['materia_id_curso'],
                ':materia_id_division' => $data['materia_id_division'],
                ':id_condicion' => $data['id_condicion'],
                ':nota' => $data['nota'],
                ':fecha_nota' => $data['fecha_nota'],
                ':inscripcion' => $data['inscripcion'],
                ':anio' => $data['anio'],
                ':fecha_carga' => $data['fecha_carga'],
                ':id_previa' => $data['id_previa'],
            ]);

            $pdo->commit();
            json_response(['exito' => true, 'mensaje' => 'Previa actualizada correctamente.']);
        }

        $previas = [];
        if (isset($body['previas']) && is_array($body['previas']) && count($body['previas']) > 0) {
            foreach ($body['previas'] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $previas[] = array_merge($body, $item);
            }
        } else {
            $previas[] = $body;
        }

        if (count($previas) === 0) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'No hay materias previas para guardar.'], 422);
        }

        $stmt = $pdo->prepare("\n            INSERT INTO previas (\n                dni, alumno, cursando_id_curso, cursando_id_division,\n                id_materia, materia_id_curso, materia_id_division, id_condicion,\n                nota, fecha_nota, inscripcion, activo, anio, fecha_carga\n            ) VALUES (\n                :dni, :alumno, :cursando_id_curso, :cursando_id_division,\n                :id_materia, :materia_id_curso, :materia_id_division, :id_condicion,\n                :nota, :fecha_nota, :inscripcion, 1, :anio, :fecha_carga\n            )\n        ");

        $guardadas = 0;
        foreach ($previas as $payload) {
            $data = previas_validar_payload($pdo, $payload, false);
            $stmt->execute([
                ':dni' => $data['dni'],
                ':alumno' => $data['alumno'],
                ':cursando_id_curso' => $data['cursando_id_curso'],
                ':cursando_id_division' => $data['cursando_id_division'],
                ':id_materia' => $data['id_materia'],
                ':materia_id_curso' => $data['materia_id_curso'],
                ':materia_id_division' => $data['materia_id_division'],
                ':id_condicion' => $data['id_condicion'],
                ':nota' => $data['nota'],
                ':fecha_nota' => $data['fecha_nota'],
                ':inscripcion' => $data['inscripcion'],
                ':anio' => $data['anio'],
                ':fecha_carga' => $data['fecha_carga'],
            ]);
            $guardadas++;
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => $guardadas === 1 ? 'Previa guardada correctamente.' : "Se guardaron {$guardadas} previas correctamente.",
            'total_guardadas' => $guardadas,
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);

        if ($e->getCode() === '23000') {
            json_response([
                'exito' => false,
                'mensaje' => 'Ya existe una previa cargada para ese DNI, materia, curso, división y año.',
            ], 409);
        }

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo guardar la previa.',
        ], 500);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo guardar la previa.',
        ], 500);
    }
}


function previas_placeholders_ids(array $ids, string $prefix = ':id'): array
{
    $placeholders = [];
    $params = [];

    foreach ($ids as $i => $id) {
        $key = $prefix . $i;
        $placeholders[] = $key;
        $params[$key] = (int)$id;
    }

    return [$placeholders, $params];
}

function previas_contar_vinculos(PDO $pdo, string $tabla, string $columna, array $ids): array
{
    if (count($ids) === 0 || !previas_tabla_existe($pdo, $tabla) || !previas_columna_existe($pdo, $tabla, $columna)) {
        return ['total' => 0, 'ids' => []];
    }

    try {
        [$placeholders, $params] = previas_placeholders_ids($ids);
        $sql = "SELECT {$columna} AS id_previa, COUNT(*) AS total FROM `{$tabla}` WHERE {$columna} IN (" . implode(',', $placeholders) . ") GROUP BY {$columna}";
        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        }
        $stmt->execute();

        $total = 0;
        $idsVinculados = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $cantidad = (int)($row['total'] ?? 0);
            $id = (int)($row['id_previa'] ?? 0);
            $total += $cantidad;
            if ($id > 0 && $cantidad > 0) {
                $idsVinculados[$id] = true;
            }
        }

        return ['total' => $total, 'ids' => array_keys($idsVinculados)];
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__ . '_' . $tabla);
        return ['total' => 0, 'ids' => []];
    }
}

function previas_obtener_vinculos_eliminacion(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($id) => $id > 0)));

    $mesas = previas_contar_vinculos($pdo, 'mesas', 'id_previa', $ids);
    $historialMesas = previas_contar_vinculos($pdo, 'historial_mesas_detalle', 'id_previa_original', $ids);
    $historialResultados = previas_contar_vinculos($pdo, 'historial_previas_resultados', 'id_previa_original', $ids);

    $idsVinculados = [];
    foreach ([$mesas['ids'], $historialMesas['ids'], $historialResultados['ids']] as $lista) {
        foreach ($lista as $id) {
            $idsVinculados[(int)$id] = true;
        }
    }

    $resumen = [
        'mesas_actuales' => (int)$mesas['total'],
        'historial_mesas' => (int)$historialMesas['total'],
        'historial_resultados' => (int)$historialResultados['total'],
    ];
    $resumen['total_vinculos'] = array_sum($resumen);

    return [
        'vinculada' => $resumen['total_vinculos'] > 0,
        'requiere_doble_confirmacion' => $resumen['total_vinculos'] > 0,
        'ids_vinculadas' => array_values(array_map('intval', array_keys($idsVinculados))),
        'resumen' => $resumen,
        'mensaje_advertencia' => $resumen['total_vinculos'] > 0
            ? 'La previa seleccionada aparece en una mesa armada o en el historial. Para eliminarla se requiere una segunda confirmación.'
            : 'La previa no tiene vínculos detectados en mesas ni historial.',
    ];
}

function previas_verificar_eliminacion(): void
{
    $pdo = db();
    $body = previas_body();
    $ids = previas_ids_desde_body($body);

    if (count($ids) === 0) {
        $idGet = previas_int($_GET['id_previa'] ?? $_GET['id'] ?? 0);
        if ($idGet > 0) {
            $ids = [$idGet];
        }
    }

    if (count($ids) === 0) {
        json_response(['exito' => false, 'mensaje' => 'No se seleccionó ninguna previa válida para verificar.'], 422);
    }

    try {
        $data = previas_obtener_vinculos_eliminacion($pdo, $ids);
        json_response([
            'exito' => true,
            'mensaje' => $data['mensaje_advertencia'],
            'data' => $data,
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo verificar si la previa tiene mesas o historial.',
        ], 500);
    }
}

function previas_cambiar_estado(): void
{
    $pdo = db();
    $body = previas_body();
    $ids = previas_ids_desde_body($body);
    $activo = previas_int($body['activo'] ?? 1) === 1 ? 1 : 0;
    $motivo = previas_mayuscula($body['motivo'] ?? $body['motivo_baja'] ?? '');

    if (count($ids) === 0) {
        json_response(['exito' => false, 'mensaje' => 'No se seleccionó ninguna previa válida.'], 422);
    }

    try {
        $placeholders = [];
        $params = [];
        foreach ($ids as $i => $id) {
            $key = ':id' . $i;
            $placeholders[] = $key;
            $params[$key] = $id;
        }

        $set = ['activo = :activo'];
        $params[':activo'] = $activo;

        if (previas_columna_existe($pdo, 'previas', 'fecha_baja')) {
            $set[] = $activo === 1 ? 'fecha_baja = NULL' : 'fecha_baja = CURDATE()';
        }

        if (previas_columna_existe($pdo, 'previas', 'motivo_baja')) {
            $set[] = 'motivo_baja = :motivo';
            $params[':motivo'] = $activo === 1 ? null : ($motivo !== '' ? $motivo : null);
        }

        $sql = 'UPDATE previas SET ' . implode(', ', $set) . ' WHERE id_previa IN (' . implode(',', $placeholders) . ')';

        $stmt = $pdo->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : ($value === null ? PDO::PARAM_NULL : PDO::PARAM_STR));
        }
        $stmt->execute();

        json_response([
            'exito' => true,
            'mensaje' => $activo === 1 ? 'Previa dada de alta correctamente.' : 'Previa dada de baja correctamente.',
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => $activo === 1 ? 'No se pudo dar de alta la previa.' : 'No se pudo dar de baja la previa.',
        ], 500);
    }
}

function previas_eliminar(): void
{
    $pdo = db();
    $body = previas_body();
    $ids = previas_ids_desde_body($body);
    $forzar = previas_int($body['forzar'] ?? $body['confirmar_eliminacion_vinculada'] ?? 0) === 1;

    if (count($ids) === 0) {
        json_response(['exito' => false, 'mensaje' => 'No se seleccionó ninguna previa válida.'], 422);
    }

    try {
        $vinculos = previas_obtener_vinculos_eliminacion($pdo, $ids);

        if ($vinculos['vinculada'] && !$forzar) {
            json_response([
                'exito' => false,
                'mensaje' => 'La previa está vinculada a mesas o historial. Revisá la advertencia y confirmá nuevamente para eliminarla.',
                'data' => $vinculos,
            ], 409);
        }

        [$placeholders, $params] = previas_placeholders_ids($ids);

        $stmt = $pdo->prepare('DELETE FROM previas WHERE id_previa IN (' . implode(',', $placeholders) . ')');
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        }
        $stmt->execute();

        json_response([
            'exito' => true,
            'mensaje' => 'Previa eliminada correctamente.',
            'data' => [
                'eliminadas' => $stmt->rowCount(),
                'eliminacion_forzada' => $forzar && $vinculos['vinculada'],
                'vinculos_detectados' => $vinculos,
            ],
        ]);
    } catch (PDOException $e) {
        log_error($e, __FUNCTION__);

        if ($e->getCode() === '23000') {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede eliminar la previa porque ya está relacionada con una mesa de examen. Podés darla de baja.',
            ], 409);
        }

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo eliminar la previa.',
        ], 500);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo eliminar la previa.',
        ], 500);
    }
}

