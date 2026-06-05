<?php
// backend/modules/previas/previas_controller.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';
require_once __DIR__ . '/../formulario/formulario_helpers.php';

$previasNotificacionesCleanup = __DIR__ . '/../mesas/notificaciones_email/notificaciones_email_cleanup.php';
if (is_file($previasNotificacionesCleanup)) {
    require_once $previasNotificacionesCleanup;
}

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
    $filtroInscripcion = array_key_exists('inscripcion', $_GET) ? previas_int($_GET['inscripcion']) : null;

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

    if ($filtroInscripcion !== null) {
        if ($filtroInscripcion === 1) {
            $where[] = 'COALESCE(p.inscripcion, 0) = 1';
        } else {
            $where[] = 'COALESCE(p.inscripcion, 0) <> 1';
        }
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


function previas_ids_inscripcion_desde_body(array $body): array
{
    $ids = [];

    if (isset($body['ids_previas']) && is_array($body['ids_previas'])) {
        $ids = $body['ids_previas'];
    } elseif (isset($body['ids_previas'])) {
        $ids = explode(',', (string)$body['ids_previas']);
    } elseif (isset($body['materias']) && is_array($body['materias'])) {
        foreach ($body['materias'] as $materia) {
            if (is_array($materia) && isset($materia['id_previa'])) {
                $ids[] = $materia['id_previa'];
            }
        }
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

function previas_fetch_materias_inscripcion(PDO $pdo, int $idPrevia, bool $soloNoInscriptas = true): array
{
    if ($idPrevia <= 0) {
        return ['principal' => null, 'materias' => []];
    }

    $sqlPrincipal = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            COALESCE(p.inscripcion, 0) AS inscripcion,
            p.anio,
            COALESCE(mat.materia, '') AS materia,
            COALESCE(cond.condicion, '') AS condicion,
            COALESCE(cur.nombre_curso, '') AS curso,
            COALESCE(divi.nombre_division, '') AS division
        FROM previas p
        LEFT JOIN materias mat ON mat.id_materia = p.id_materia
        LEFT JOIN condicion cond ON cond.id_condicion = p.id_condicion
        LEFT JOIN curso cur ON cur.id_curso = p.materia_id_curso
        LEFT JOIN division divi ON divi.id_division = p.materia_id_division
        WHERE p.id_previa = :id_previa
          AND p.activo = 1
        LIMIT 1
    ";

    $stPrincipal = $pdo->prepare($sqlPrincipal);
    $stPrincipal->execute([':id_previa' => $idPrevia]);
    $principal = $stPrincipal->fetch(PDO::FETCH_ASSOC) ?: null;

    if (!$principal) {
        return ['principal' => null, 'materias' => []];
    }

    $whereInscripcion = $soloNoInscriptas ? 'AND COALESCE(p.inscripcion, 0) <> 1' : '';

    $sqlMaterias = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            COALESCE(p.inscripcion, 0) AS inscripcion,
            p.anio,
            COALESCE(mat.materia, '') AS materia,
            COALESCE(cond.condicion, '') AS condicion,
            COALESCE(cur.nombre_curso, '') AS curso,
            COALESCE(divi.nombre_division, '') AS division,
            TRIM(CONCAT(COALESCE(cur.nombre_curso, ''), ' ', COALESCE(divi.nombre_division, ''))) AS curso_materia
        FROM previas p
        LEFT JOIN materias mat ON mat.id_materia = p.id_materia
        LEFT JOIN condicion cond ON cond.id_condicion = p.id_condicion
        LEFT JOIN curso cur ON cur.id_curso = p.materia_id_curso
        LEFT JOIN division divi ON divi.id_division = p.materia_id_division
        WHERE p.dni = :dni
          AND p.activo = 1
          AND p.id_condicion = 3
          {$whereInscripcion}
        ORDER BY p.alumno ASC, cur.id_curso ASC, divi.id_division ASC, mat.materia ASC
    ";

    $stMaterias = $pdo->prepare($sqlMaterias);
    $stMaterias->execute([':dni' => (string)$principal['dni']]);
    $materias = $stMaterias->fetchAll(PDO::FETCH_ASSOC);

    foreach ($materias as &$materia) {
        $materia['principal'] = ((int)$materia['id_previa'] === (int)$principal['id_previa']) ? 1 : 0;
        $materia['curso_id'] = (int)$materia['materia_id_curso'];
        $materia['division_id'] = (int)$materia['materia_id_division'];
        $materia['materia_nombre'] = (string)$materia['materia'];
    }
    unset($materia);

    return ['principal' => $principal, 'materias' => $materias];
}

function previas_obtener_materias_inscripcion(): void
{
    $pdo = db();
    $idPrevia = previas_int($_GET['id_previa'] ?? $_GET['id'] ?? 0);

    if ($idPrevia <= 0) {
        json_response(['exito' => false, 'mensaje' => 'La previa seleccionada no es válida.'], 422);
    }

    try {
        $data = previas_fetch_materias_inscripcion($pdo, $idPrevia, true);
        $principal = $data['principal'];

        if (!$principal) {
            json_response(['exito' => false, 'mensaje' => 'No se encontró la previa activa seleccionada.'], 404);
        }

        if ((int)($principal['id_condicion'] ?? 0) !== 3) {
            json_response(['exito' => false, 'mensaje' => 'Solo se pueden inscribir manualmente materias con condición PREVIA.'], 422);
        }

        if ((int)($principal['inscripcion'] ?? 0) === 1) {
            json_response(['exito' => false, 'mensaje' => 'Esta previa ya figura como inscripta.'], 409);
        }

        if (count($data['materias']) === 0) {
            json_response(['exito' => false, 'mensaje' => 'El alumno no tiene materias previas pendientes de inscripción.'], 404);
        }

        json_response([
            'exito' => true,
            'data' => [
                'alumno' => (string)$principal['alumno'],
                'dni' => (string)$principal['dni'],
                'id_previa_principal' => (int)$principal['id_previa'],
                'materia_principal' => (string)$principal['materia'],
                'materias' => $data['materias'],
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'No se pudieron obtener las materias para inscribir.'], 500);
    }
}

function previas_inscribir_manual(): void
{
    if (function_exists('require_roles')) {
        require_roles(['admin']);
    }

    $pdo = db();
    $body = previas_body();
    $ids = previas_ids_inscripcion_desde_body($body);
    $gmail = trim((string)($body['gmail'] ?? $body['email'] ?? ''));

    if (count($ids) === 0) {
        json_response(['exito' => false, 'mensaje' => 'Seleccioná al menos una materia para inscribir.'], 422);
    }

    if ($gmail === '' || !filter_var($gmail, FILTER_VALIDATE_EMAIL)) {
        json_response(['exito' => false, 'mensaje' => 'Ingresá un email válido para enviar el comprobante.'], 422);
    }

    try {
        date_default_timezone_set(env_value('APP_TIMEZONE', 'America/Argentina/Cordoba') ?? 'America/Argentina/Cordoba');
        if (function_exists('formulario_asegurar_tablas_inscripcion')) {
            formulario_asegurar_tablas_inscripcion($pdo);
        }

        [$placeholders, $paramsIds] = previas_placeholders_ids($ids);
        $sql = "
            SELECT
                p.id_previa,
                p.dni,
                p.alumno,
                p.id_materia,
                p.materia_id_curso,
                p.materia_id_division,
                p.id_condicion,
                COALESCE(p.inscripcion, 0) AS inscripcion,
                p.anio,
                COALESCE(mat.materia, '') AS materia,
                COALESCE(cur.nombre_curso, '') AS curso,
                COALESCE(divi.nombre_division, '') AS division
            FROM previas p
            LEFT JOIN materias mat ON mat.id_materia = p.id_materia
            LEFT JOIN curso cur ON cur.id_curso = p.materia_id_curso
            LEFT JOIN division divi ON divi.id_division = p.materia_id_division
            WHERE p.id_previa IN (" . implode(',', $placeholders) . ")
              AND p.activo = 1
              AND p.id_condicion = 3
            ORDER BY p.alumno ASC, cur.id_curso ASC, divi.id_division ASC, mat.materia ASC
        ";

        $st = $pdo->prepare($sql);
        foreach ($paramsIds as $key => $value) {
            $st->bindValue($key, $value, PDO::PARAM_INT);
        }
        $st->execute();
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);

        if (count($rows) !== count($ids)) {
            json_response(['exito' => false, 'mensaje' => 'Alguna materia no existe, no está activa o no es condición PREVIA.'], 422);
        }

        $dni = (string)$rows[0]['dni'];
        $alumno = (string)$rows[0]['alumno'];
        foreach ($rows as $row) {
            if ((string)$row['dni'] !== $dni) {
                json_response(['exito' => false, 'mensaje' => 'Todas las materias seleccionadas deben pertenecer al mismo alumno.'], 422);
            }
            if ((int)$row['inscripcion'] === 1) {
                json_response(['exito' => false, 'mensaje' => 'Una de las materias seleccionadas ya está inscripta. Actualizá el listado.'], 409);
            }
        }

        $anioInscripcion = (int)date('Y');
        $host = function_exists('request_host_normalizado') ? request_host_normalizado() : (string)($_SERVER['HTTP_HOST'] ?? '');

        $pdo->beginTransaction();

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
            ':ip' => function_exists('formulario_ip_cliente') ? formulario_ip_cliente() : (string)($_SERVER['REMOTE_ADDR'] ?? ''),
            ':user_agent' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ':total_materias' => count($rows),
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

        $stUpdatePrevia = $pdo->prepare("UPDATE previas SET inscripcion = 1 WHERE id_previa = :id_previa AND activo = 1 AND id_condicion = 3 LIMIT 1");

        $materiasEmail = [];
        foreach ($rows as $row) {
            $stDetalle->execute([
                ':id_inscripcion' => $idInscripcion,
                ':id_previa' => (int)$row['id_previa'],
                ':id_materia' => (int)$row['id_materia'],
                ':materia_nombre' => (string)$row['materia'],
                ':curso_id' => (int)$row['materia_id_curso'],
                ':division_id' => (int)$row['materia_id_division'],
                ':id_condicion' => (int)$row['id_condicion'],
            ]);

            $stUpdatePrevia->execute([':id_previa' => (int)$row['id_previa']]);

            $materiasEmail[] = [
                'id_previa' => (int)$row['id_previa'],
                'id_materia' => (int)$row['id_materia'],
                'curso_id' => (int)$row['materia_id_curso'],
                'division_id' => (int)$row['materia_id_division'],
                'id_condicion' => (int)$row['id_condicion'],
                'materia' => (string)$row['materia'],
                'materia_nombre' => (string)$row['materia'],
                'curso' => (string)($row['curso'] ?? ''),
                'division' => (string)($row['division'] ?? ''),
                'alumno' => $alumno,
                'anio' => (int)$row['anio'],
                'inscripcion' => 1,
            ];
        }

        $stTotal = $pdo->prepare("
            UPDATE formulario_inscripciones fi
               SET total_materias = (
                   SELECT COUNT(*)
                     FROM formulario_inscripciones_detalle fid
                    WHERE fid.id_inscripcion = fi.id_inscripcion
                      AND fid.estado <> 'anulada'
               )
             WHERE fi.id_inscripcion = :id_inscripcion
        ");
        $stTotal->execute([':id_inscripcion' => $idInscripcion]);

        $pdo->commit();

        $emailResultado = function_exists('formulario_enviar_email_confirmacion')
            ? formulario_enviar_email_confirmacion($pdo, $gmail, $dni, $alumno, $materiasEmail, $anioInscripcion)
            : ['enviado' => false, 'error' => 'La función de email no está disponible.'];

        try {
            $stEmail = $pdo->prepare("
                UPDATE formulario_inscripciones
                   SET email_confirmacion_enviado = :enviado,
                       email_confirmacion_enviado_en = CASE WHEN :enviado2 = 1 THEN NOW() ELSE email_confirmacion_enviado_en END,
                       email_confirmacion_error = :error
                 WHERE id_inscripcion = :id_inscripcion
                 LIMIT 1
            ");
            $stEmail->execute([
                ':enviado' => !empty($emailResultado['enviado']) ? 1 : 0,
                ':enviado2' => !empty($emailResultado['enviado']) ? 1 : 0,
                ':error' => !empty($emailResultado['enviado']) ? null : substr((string)($emailResultado['error'] ?? 'Error enviando email.'), 0, 255),
                ':id_inscripcion' => $idInscripcion,
            ]);
        } catch (Throwable $emailUpdateError) {
            log_error($emailUpdateError, __FUNCTION__ . ':update_email_status');
        }

        json_response([
            'exito' => true,
            'mensaje' => !empty($emailResultado['enviado'])
                ? 'Inscripción manual registrada y email enviado correctamente.'
                : 'Inscripción manual registrada, pero no se pudo enviar el email de confirmación.',
            'data' => [
                'id_inscripcion' => $idInscripcion,
                'dni' => $dni,
                'gmail' => $gmail,
                'marcadas' => count($rows),
                'email_enviado' => !empty($emailResultado['enviado']),
                'email_error' => $emailResultado['error'] ?? null,
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'No se pudo registrar la inscripción manual.'], 500);
    }
}

function previas_quitar_inscripcion(): void
{
    if (function_exists('require_roles')) {
        require_roles(['admin']);
    }

    $pdo = db();
    $body = previas_body();
    $idPrevia = previas_int($body['id_previa'] ?? $body['id'] ?? 0);

    if ($idPrevia <= 0) {
        json_response(['exito' => false, 'mensaje' => 'La inscripción seleccionada no es válida.'], 422);
    }

    try {
        $pdo->beginTransaction();

        $stExiste = $pdo->prepare("SELECT id_previa, dni, alumno, id_materia, COALESCE(inscripcion, 0) AS inscripcion FROM previas WHERE id_previa = :id_previa AND activo = 1 LIMIT 1");
        $stExiste->execute([':id_previa' => $idPrevia]);
        $previa = $stExiste->fetch(PDO::FETCH_ASSOC);

        if (!$previa) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'No se encontró la previa activa seleccionada.'], 404);
        }

        if ((int)$previa['inscripcion'] !== 1) {
            $pdo->rollBack();
            json_response(['exito' => false, 'mensaje' => 'Esta previa no figura como inscripta.'], 409);
        }

        $stUpdatePrevia = $pdo->prepare('UPDATE previas SET inscripcion = 0 WHERE id_previa = :id_previa LIMIT 1');
        $stUpdatePrevia->execute([':id_previa' => $idPrevia]);

        $idInscripciones = [];
        if (previas_tabla_existe($pdo, 'formulario_inscripciones_detalle')) {
            $stIds = $pdo->prepare("SELECT id_inscripcion FROM formulario_inscripciones_detalle WHERE id_previa = :id_previa AND estado <> 'anulada'");
            $stIds->execute([':id_previa' => $idPrevia]);
            $idInscripciones = array_values(array_unique(array_map('intval', $stIds->fetchAll(PDO::FETCH_COLUMN))));

            $stDetalle = $pdo->prepare("UPDATE formulario_inscripciones_detalle SET estado = 'anulada', actualizado_en = NOW() WHERE id_previa = :id_previa");
            $stDetalle->execute([':id_previa' => $idPrevia]);
        }

        if (count($idInscripciones) > 0 && previas_tabla_existe($pdo, 'formulario_inscripciones')) {
            [$phIns, $paramsIns] = previas_placeholders_ids($idInscripciones, ':insc');
            $sqlTotal = "
                UPDATE formulario_inscripciones fi
                   SET total_materias = (
                       SELECT COUNT(*)
                         FROM formulario_inscripciones_detalle fid
                        WHERE fid.id_inscripcion = fi.id_inscripcion
                          AND fid.estado <> 'anulada'
                   ),
                   estado = CASE
                       WHEN (
                           SELECT COUNT(*)
                             FROM formulario_inscripciones_detalle fid2
                            WHERE fid2.id_inscripcion = fi.id_inscripcion
                              AND fid2.estado <> 'anulada'
                       ) = 0 THEN 'cancelada'
                       ELSE 'registrada'
                   END,
                   actualizado_en = NOW()
                 WHERE fi.id_inscripcion IN (" . implode(',', $phIns) . ")
            ";
            $stTotal = $pdo->prepare($sqlTotal);
            foreach ($paramsIns as $key => $value) {
                $stTotal->bindValue($key, $value, PDO::PARAM_INT);
            }
            $stTotal->execute();
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Inscripción dada de baja correctamente.',
            'data' => [
                'id_previa' => $idPrevia,
                'inscripcion' => 0,
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        log_error($e, __FUNCTION__);
        json_response(['exito' => false, 'mensaje' => 'No se pudo dar de baja la inscripción.'], 500);
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


function previas_obtener_numeros_grupos_actuales(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($id) => $id > 0)));
    if (count($ids) === 0 || !previas_tabla_existe($pdo, 'mesas') || !previas_columna_existe($pdo, 'mesas', 'id_previa')) {
        return [
            'numeros_mesa' => [],
            'numeros_grupo' => [],
        ];
    }

    [$placeholders, $params] = previas_placeholders_ids($ids, ':previa_ctx');
    $sql = "
        SELECT DISTINCT
            m.numero_mesa,
            g.numero_grupo
        FROM mesas m
        LEFT JOIN mesas_grupos g ON g.numero_mesa = m.numero_mesa
        WHERE m.id_previa IN (" . implode(',', $placeholders) . ")
          AND m.numero_mesa IS NOT NULL
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_INT);
    }
    $stmt->execute();

    $numerosMesa = [];
    $numerosGrupo = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $numeroMesa = (int)($row['numero_mesa'] ?? 0);
        $numeroGrupo = (int)($row['numero_grupo'] ?? 0);
        if ($numeroMesa > 0) {
            $numerosMesa[$numeroMesa] = $numeroMesa;
        }
        if ($numeroGrupo > 0) {
            $numerosGrupo[$numeroGrupo] = $numeroGrupo;
        }
    }

    return [
        'numeros_mesa' => array_values($numerosMesa),
        'numeros_grupo' => array_values($numerosGrupo),
    ];
}

function previas_eliminar_filas_mesas_actuales(PDO $pdo, array $ids): int
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($id) => $id > 0)));
    if (count($ids) === 0 || !previas_tabla_existe($pdo, 'mesas') || !previas_columna_existe($pdo, 'mesas', 'id_previa')) {
        return 0;
    }

    [$placeholders, $params] = previas_placeholders_ids($ids, ':previa_del_mesa');
    $stmt = $pdo->prepare('DELETE FROM mesas WHERE id_previa IN (' . implode(',', $placeholders) . ')');
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_INT);
    }
    $stmt->execute();

    return $stmt->rowCount();
}

function previas_reordenar_grupo_mesas(PDO $pdo, int $numeroGrupo): void
{
    if ($numeroGrupo <= 0 || !previas_tabla_existe($pdo, 'mesas_grupos')) {
        return;
    }

    $stmt = $pdo->prepare('
        SELECT id_mesa_grupo
        FROM mesas_grupos
        WHERE numero_grupo = :numero_grupo
        ORDER BY orden ASC, numero_mesa ASC, id_mesa_grupo ASC
    ');
    $stmt->execute([':numero_grupo' => $numeroGrupo]);
    $ids = array_values(array_filter(array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [])));

    if (!$ids) {
        return;
    }

    $upd = $pdo->prepare('UPDATE mesas_grupos SET orden = :orden WHERE id_mesa_grupo = :id LIMIT 1');
    $orden = 1;
    foreach ($ids as $id) {
        $upd->execute([
            ':orden' => $orden,
            ':id' => $id,
        ]);
        $orden++;
    }
}

function previas_recalcular_numeros_mesa_actuales(PDO $pdo, array $numerosMesa, array $numerosGrupo = []): array
{
    $numerosMesa = array_values(array_unique(array_filter(array_map('intval', $numerosMesa), static fn($n) => $n > 0)));
    $numerosGrupo = array_values(array_unique(array_filter(array_map('intval', $numerosGrupo), static fn($n) => $n > 0)));

    $resultado = [
        'numeros_revisados' => count($numerosMesa),
        'numeros_eliminados' => 0,
        'numeros_actualizados' => 0,
        'filas_huerfanas_eliminadas' => 0,
        'grupos_vacios_limpiados' => 0,
    ];

    if (!$numerosMesa || !previas_tabla_existe($pdo, 'mesas')) {
        return $resultado;
    }

    $stmtCantidad = $pdo->prepare('SELECT COUNT(DISTINCT id_previa) FROM mesas WHERE numero_mesa = :numero_mesa AND id_previa IS NOT NULL');
    $stmtDelHuerfanas = $pdo->prepare('DELETE FROM mesas WHERE numero_mesa = :numero_mesa AND id_previa IS NULL');
    $stmtDelMesasNumero = $pdo->prepare('DELETE FROM mesas WHERE numero_mesa = :numero_mesa');
    $stmtDelGrupo = previas_tabla_existe($pdo, 'mesas_grupos')
        ? $pdo->prepare('DELETE FROM mesas_grupos WHERE numero_mesa = :numero_mesa')
        : null;
    $stmtUpdGrupo = previas_tabla_existe($pdo, 'mesas_grupos')
        ? $pdo->prepare('UPDATE mesas_grupos SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa')
        : null;
    $stmtDelNoAgrupada = previas_tabla_existe($pdo, 'mesas_no_agrupadas')
        ? $pdo->prepare('DELETE FROM mesas_no_agrupadas WHERE numero_mesa = :numero_mesa')
        : null;
    $stmtUpdNoAgrupada = previas_tabla_existe($pdo, 'mesas_no_agrupadas')
        ? $pdo->prepare('UPDATE mesas_no_agrupadas SET cantidad_alumnos = :cantidad WHERE numero_mesa = :numero_mesa')
        : null;

    foreach ($numerosMesa as $numeroMesa) {
        $stmtCantidad->execute([':numero_mesa' => $numeroMesa]);
        $cantidad = (int)$stmtCantidad->fetchColumn();

        if ($cantidad <= 0) {
            $stmtDelMesasNumero->execute([':numero_mesa' => $numeroMesa]);
            $resultado['filas_huerfanas_eliminadas'] += $stmtDelMesasNumero->rowCount();

            if ($stmtDelGrupo) {
                $stmtDelGrupo->execute([':numero_mesa' => $numeroMesa]);
            }
            if ($stmtDelNoAgrupada) {
                $stmtDelNoAgrupada->execute([':numero_mesa' => $numeroMesa]);
            }

            $resultado['numeros_eliminados']++;
            continue;
        }

        $stmtDelHuerfanas->execute([':numero_mesa' => $numeroMesa]);
        $resultado['filas_huerfanas_eliminadas'] += $stmtDelHuerfanas->rowCount();

        if ($stmtUpdGrupo) {
            $stmtUpdGrupo->execute([
                ':cantidad' => $cantidad,
                ':numero_mesa' => $numeroMesa,
            ]);
        }
        if ($stmtUpdNoAgrupada) {
            $stmtUpdNoAgrupada->execute([
                ':cantidad' => $cantidad,
                ':numero_mesa' => $numeroMesa,
            ]);
        }

        $resultado['numeros_actualizados']++;
    }

    if ($numerosGrupo && previas_tabla_existe($pdo, 'mesas_grupos')) {
        $stmtGrupoTieneMesas = $pdo->prepare('SELECT COUNT(*) FROM mesas_grupos WHERE numero_grupo = :numero_grupo');
        $stmtDelSlots = previas_tabla_existe($pdo, 'mesas_grupos_slots_extra')
            ? $pdo->prepare('DELETE FROM mesas_grupos_slots_extra WHERE numero_grupo = :numero_grupo')
            : null;

        foreach ($numerosGrupo as $numeroGrupo) {
            $stmtGrupoTieneMesas->execute([':numero_grupo' => $numeroGrupo]);
            $cantidadGrupo = (int)$stmtGrupoTieneMesas->fetchColumn();

            if ($cantidadGrupo <= 0) {
                if ($stmtDelSlots) {
                    $stmtDelSlots->execute([':numero_grupo' => $numeroGrupo]);
                }
                $resultado['grupos_vacios_limpiados']++;
            } else {
                previas_reordenar_grupo_mesas($pdo, $numeroGrupo);
            }
        }
    }

    return $resultado;
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

        if (previas_columna_existe($pdo, 'previas', 'inscripcion')) {
            // Al dar de baja o volver a dar de alta una previa, siempre queda como no inscripta.
            $set[] = 'inscripcion = 0';
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

        $pdo->beginTransaction();

        $contextoMesas = previas_obtener_numeros_grupos_actuales($pdo, $ids);
        $numerosMesaAfectados = $contextoMesas['numeros_mesa'] ?? [];
        $numerosGrupoAfectados = $contextoMesas['numeros_grupo'] ?? [];

        $cleanupNotificaciones = function_exists('mesas_notificaciones_cleanup_por_previas')
            ? mesas_notificaciones_cleanup_por_previas($pdo, $ids, true)
            : null;

        // Evita que el FK ON DELETE SET NULL deje filas de mesas sin alumno.
        // Si el número de mesa tenía solamente esta previa, se elimina también el número/grupo.
        // Si tenía más previas, solo se saca esta previa y se actualiza la cantidad de alumnos.
        $filasMesasEliminadas = previas_eliminar_filas_mesas_actuales($pdo, $ids);
        $cleanupMesas = previas_recalcular_numeros_mesa_actuales($pdo, $numerosMesaAfectados, $numerosGrupoAfectados);

        [$placeholders, $params] = previas_placeholders_ids($ids);

        $stmt = $pdo->prepare('DELETE FROM previas WHERE id_previa IN (' . implode(',', $placeholders) . ')');
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        }
        $stmt->execute();

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => 'Previa eliminada correctamente.',
            'data' => [
                'eliminadas' => $stmt->rowCount(),
                'eliminacion_forzada' => $forzar && $vinculos['vinculada'],
                'vinculos_detectados' => $vinculos,
                'mesas_actuales_limpiadas' => [
                    'filas_mesas_eliminadas' => $filasMesasEliminadas,
                    'numeros_mesa_afectados' => $numerosMesaAfectados,
                    'numeros_grupo_afectados' => $numerosGrupoAfectados,
                    'resultado' => $cleanupMesas,
                ],
                'notificaciones_limpiadas' => $cleanupNotificaciones,
            ],
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);

        if ($e->getCode() === '23000') {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede eliminar la previa porque ya está relacionada con otra información sensible. Podés darla de baja.',
            ], 409);
        }

        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo eliminar la previa.',
        ], 500);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo eliminar la previa.',
        ], 500);
    }
}

