<?php
// backend/modules/previas/previas_importacion_controller.php
declare(strict_types=1);

require_once __DIR__ . '/previas_controller.php';

function previas_quitar_acentos(string $texto): string
{
    $texto = trim($texto);

    if ($texto === '') {
        return '';
    }

    $reemplazos = [
        'Á' => 'A', 'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Ã' => 'A', 'á' => 'A', 'à' => 'A', 'â' => 'A', 'ä' => 'A', 'ã' => 'A',
        'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'é' => 'E', 'è' => 'E', 'ê' => 'E', 'ë' => 'E',
        'Í' => 'I', 'Ì' => 'I', 'Î' => 'I', 'Ï' => 'I', 'í' => 'I', 'ì' => 'I', 'î' => 'I', 'ï' => 'I',
        'Ó' => 'O', 'Ò' => 'O', 'Ô' => 'O', 'Ö' => 'O', 'Õ' => 'O', 'ó' => 'O', 'ò' => 'O', 'ô' => 'O', 'ö' => 'O', 'õ' => 'O',
        'Ú' => 'U', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U', 'ú' => 'U', 'ù' => 'U', 'û' => 'U', 'ü' => 'U',
        'Ñ' => 'N', 'ñ' => 'N', 'Ç' => 'C', 'ç' => 'C', '°' => '', 'º' => '',
    ];

    return strtr($texto, $reemplazos);
}

function previas_normalizar_importacion($valor, bool $compacto = false): string
{
    $texto = previas_quitar_acentos((string)$valor);
    $texto = previas_strtoupper($texto);
    $texto = str_replace(["\r", "\n", "\t"], ' ', $texto);
    $texto = preg_replace('/[^A-Z0-9]+/u', ' ', $texto) ?? $texto;
    $texto = trim(preg_replace('/\s+/', ' ', $texto) ?? $texto);

    return $compacto ? (preg_replace('/[^A-Z0-9]+/', '', $texto) ?? $texto) : $texto;
}

function previas_importacion_es_numero_puro($valor): bool
{
    $clave = previas_normalizar_importacion($valor, true);
    return $clave !== '' && preg_match('/^\d+$/', $clave) === 1;
}

function previas_headers_importacion(): array
{
    return [
        'DNI',
        'ALUMNO',
        'CURSO_ACTUAL',
        'DIVISION_ACTUAL',
        'MATERIA',
        'CURSO_MATERIA',
        'DIVISION_MATERIA',
        'CONDICION',
        'ANIO_PREVIA',
        'FECHA_CARGA',
    ];
}

function previas_headers_requeridos_importacion(): array
{
    return [
        'DNI',
        'ALUMNO',
        'CURSO_ACTUAL',
        'DIVISION_ACTUAL',
        'MATERIA',
        'CURSO_MATERIA',
        'DIVISION_MATERIA',
        'CONDICION',
        'ANIO_PREVIA',
    ];
}

function previas_header_aliases_importacion(): array
{
    return [
        'DNI' => ['DNI', 'DOCUMENTO', 'NRODOCUMENTO', 'NUMERODOCUMENTO'],
        'ALUMNO' => ['ALUMNO', 'APELLIDOYNOMBRE', 'APELLIDONOMBRE', 'ESTUDIANTE', 'NOMBREALUMNO', 'NOMBREYAPELLIDO'],
        'CURSO_ACTUAL' => ['CURSOACTUAL', 'CURSANDO', 'CURSOCURSANDO', 'CURSOACTUALDELALUMNO'],
        'DIVISION_ACTUAL' => ['DIVISIONACTUAL', 'DIVISIONCURSANDO', 'DIVACTUAL', 'DIVISIONACTUALDELALUMNO'],
        'MATERIA' => ['MATERIA', 'ASIGNATURA', 'ESPACIOCURRICULAR', 'MATERIAADEUDADA'],
        'CURSO_MATERIA' => ['CURSOMATERIA', 'CURSODELAMATERIA', 'ANOMATERIA', 'CURSOADEUDADO'],
        'DIVISION_MATERIA' => ['DIVISIONMATERIA', 'DIVISIONDELAMATERIA', 'DIVMATERIA', 'DIVISIONADEUDADA'],
        'CONDICION' => ['CONDICION', 'CONDICIONPREVIA', 'TIPOCONDICION'],
        'ANIO_PREVIA' => ['ANIOPREVIA', 'ANOPREVIA', 'AÑOPREVIA', 'ANIO', 'ANO', 'AÑO', 'CICLOLECTIVO'],
        'FECHA_CARGA' => ['FECHACARGA', 'FECHADECARGA', 'FECHA'],
    ];
}

function previas_columna_excel_a_indice(string $ref): int
{
    $letras = preg_replace('/[^A-Z]/', '', strtoupper($ref));
    $indice = 0;

    for ($i = 0; $i < strlen($letras); $i++) {
        $indice = ($indice * 26) + (ord($letras[$i]) - 64);
    }

    return max(0, $indice - 1);
}

function previas_xml_decode(string $texto): string
{
    return html_entity_decode($texto, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function previas_xml_atributo(string $attrs, string $nombre): string
{
    if (preg_match('/\s' . preg_quote($nombre, '/') . '="([^"]*)"/i', ' ' . $attrs, $m)) {
        return previas_xml_decode($m[1]);
    }

    return '';
}

function previas_xml_textos_t(string $xml): string
{
    if (!preg_match_all('/<t\b[^>]*>(.*?)<\/t>/is', $xml, $m)) {
        return '';
    }

    return previas_xml_decode(implode('', $m[1]));
}

function previas_xlsx_leer_filas(string $binario): array
{
    if (!class_exists('ZipArchive')) {
        json_response([
            'exito' => false,
            'mensaje' => 'El servidor no tiene habilitada la extensión ZipArchive de PHP, necesaria para leer archivos .xlsx.',
        ], 500);
    }

    $tmp = tempnam(sys_get_temp_dir(), 'previas_xlsx_');
    if ($tmp === false) {
        json_response(['exito' => false, 'mensaje' => 'No se pudo preparar el archivo temporal de importación.'], 500);
    }

    file_put_contents($tmp, $binario);
    $zip = new ZipArchive();

    if ($zip->open($tmp) !== true) {
        @unlink($tmp);
        json_response(['exito' => false, 'mensaje' => 'El archivo no es un Excel .xlsx válido.'], 422);
    }

    $sharedStrings = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($sharedXml !== false && preg_match_all('/<si\b[^>]*>(.*?)<\/si>/is', $sharedXml, $items)) {
        foreach ($items[1] as $siXml) {
            $sharedStrings[] = previas_xml_textos_t($siXml);
        }
    }

    $sheetName = 'xl/worksheets/sheet1.xml';
    if ($zip->locateName($sheetName) === false) {
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $name = (string)($stat['name'] ?? '');
            if (preg_match('#^xl/worksheets/sheet\d+\.xml$#', $name)) {
                $sheetName = $name;
                break;
            }
        }
    }

    $sheetXml = $zip->getFromName($sheetName);
    $zip->close();
    @unlink($tmp);

    if ($sheetXml === false) {
        json_response(['exito' => false, 'mensaje' => 'No se encontró una hoja válida dentro del Excel.'], 422);
    }

    if (!preg_match_all('/<row\b[^>]*>(.*?)<\/row>/is', $sheetXml, $rowMatches)) {
        return [];
    }

    $filas = [];
    foreach ($rowMatches[1] as $rowXml) {
        $fila = [];
        if (!preg_match_all('/<c\b([^>]*)>(.*?)<\/c>/is', $rowXml, $cellMatches, PREG_SET_ORDER)) {
            continue;
        }

        foreach ($cellMatches as $cell) {
            $attrs = $cell[1];
            $cellXml = $cell[2];
            $ref = previas_xml_atributo($attrs, 'r');
            $tipo = previas_xml_atributo($attrs, 't');
            $indice = previas_columna_excel_a_indice($ref);
            $valor = '';

            if ($tipo === 's') {
                $idx = 0;
                if (preg_match('/<v[^>]*>(.*?)<\/v>/is', $cellXml, $v)) {
                    $idx = (int)trim(previas_xml_decode($v[1]));
                }
                $valor = $sharedStrings[$idx] ?? '';
            } elseif ($tipo === 'inlineStr') {
                $valor = previas_xml_textos_t($cellXml);
            } elseif ($tipo === 'b') {
                $valor = preg_match('/<v[^>]*>1<\/v>/is', $cellXml) ? '1' : '0';
            } elseif (preg_match('/<v[^>]*>(.*?)<\/v>/is', $cellXml, $v)) {
                $valor = previas_xml_decode($v[1]);
            }

            $fila[$indice] = trim((string)$valor);
        }

        if (count($fila) > 0) {
            $max = max(array_keys($fila));
            $normalizada = [];
            for ($i = 0; $i <= $max; $i++) {
                $normalizada[] = $fila[$i] ?? '';
            }
            $filas[] = $normalizada;
        }
    }

    return $filas;
}

function previas_importacion_mapa_headers(array $filaHeader): array
{
    $aliases = previas_header_aliases_importacion();
    $mapaAlias = [];

    foreach ($aliases as $headerReal => $lista) {
        $mapaAlias[previas_normalizar_importacion($headerReal, true)] = $headerReal;
        foreach ($lista as $alias) {
            $mapaAlias[previas_normalizar_importacion($alias, true)] = $headerReal;
        }
    }

    $headersEncontrados = [];
    foreach ($filaHeader as $idx => $header) {
        $clave = previas_normalizar_importacion($header, true);
        if ($clave === '') {
            continue;
        }
        if (isset($mapaAlias[$clave])) {
            $headersEncontrados[$mapaAlias[$clave]] = $idx;
        }
    }

    $faltantes = [];
    foreach (previas_headers_requeridos_importacion() as $header) {
        if (!array_key_exists($header, $headersEncontrados)) {
            $faltantes[] = $header;
        }
    }

    return [$headersEncontrados, $faltantes];
}

function previas_catalogo_importacion(PDO $pdo): array
{
    $cursos = $pdo->query('SELECT id_curso, nombre_curso FROM curso WHERE activo = 1')->fetchAll(PDO::FETCH_ASSOC);
    $divisiones = $pdo->query('SELECT id_division, nombre_division FROM division WHERE activo = 1')->fetchAll(PDO::FETCH_ASSOC);
    $condiciones = $pdo->query('SELECT id_condicion, condicion FROM condicion WHERE activo = 1')->fetchAll(PDO::FETCH_ASSOC);
    $materias = $pdo->query('SELECT id_materia, materia FROM materias WHERE activo = 1')->fetchAll(PDO::FETCH_ASSOC);
    $catedras = $pdo->query('SELECT id_curso, id_division, id_materia FROM catedras WHERE activo = 1')->fetchAll(PDO::FETCH_ASSOC);

    $cursoPorClave = [];
    $cursoPorId = [];
    $cursoNombrePorId = [];
    $cursoPorNumero = [];
    $cursoEgresadoId = 0;
    foreach ($cursos as $curso) {
        $id = (int)$curso['id_curso'];
        $nombre = (string)$curso['nombre_curso'];
        $cursoPorId[$id] = $id;
        $cursoNombrePorId[$id] = $nombre;
        $clave = previas_normalizar_importacion($nombre, true);
        $cursoPorClave[$clave] = $id;
        if (preg_match('/(\d+)/', $clave, $m)) {
            $cursoPorNumero[(int)$m[1]] = $id;
        }
        if ($clave === 'EGRESADO') {
            $cursoEgresadoId = $id;
            foreach (['EGRESADO', 'EGRESADA', 'EGRESADOS', 'EGRESADAS'] as $alias) {
                $cursoPorClave[$alias] = $id;
            }
        }
    }

    $divisionPorClave = [];
    $divisionPorId = [];
    $divisionNombrePorId = [];
    foreach ($divisiones as $division) {
        $id = (int)$division['id_division'];
        $nombre = (string)$division['nombre_division'];
        $divisionPorId[$id] = $id;
        $divisionNombrePorId[$id] = $nombre;
        $divisionPorClave[previas_normalizar_importacion($nombre, true)] = $id;
    }

    $condicionPorClave = [];
    $condicionPorId = [];
    $condicionNombrePorId = [];
    foreach ($condiciones as $condicion) {
        $id = (int)$condicion['id_condicion'];
        $nombre = (string)$condicion['condicion'];
        $condicionPorId[$id] = $id;
        $condicionNombrePorId[$id] = $nombre;
        $condicionPorClave[previas_normalizar_importacion($nombre, true)] = $id;
    }
    $sinonimosCondicion = [
        'PREVIA' => 'PREVIA',
        'REGULAR' => 'REGULAR',
        'COLOQUIO' => 'COLOQUIO',
        'LIBRE' => 'PLIB',
        'PLIBRE' => 'PLIB',
        'PLIB' => 'PLIB',
        'PENDIENTE' => 'PENDIENTE',
        'TERMAT' => 'TERMAT',
        'TERMINAMATERIA' => 'TERMAT',
    ];
    foreach ($sinonimosCondicion as $alias => $destino) {
        if (isset($condicionPorClave[$destino])) {
            $condicionPorClave[$alias] = $condicionPorClave[$destino];
        }
    }

    $materiaPorClave = [];
    $materiaPorId = [];
    $materiaNombrePorId = [];
    foreach ($materias as $materia) {
        $id = (int)$materia['id_materia'];
        $nombre = (string)$materia['materia'];
        $materiaPorId[$id] = $id;
        $materiaNombrePorId[$id] = $nombre;
        $clave = previas_normalizar_importacion($nombre, true);
        if (!isset($materiaPorClave[$clave])) {
            $materiaPorClave[$clave] = [];
        }
        $materiaPorClave[$clave][] = $id;
    }

    $catedrasPorClave = [];
    foreach ($catedras as $cat) {
        $catedrasPorClave[(int)$cat['id_curso'] . '|' . (int)$cat['id_division'] . '|' . (int)$cat['id_materia']] = true;
    }

    return [
        'curso_por_clave' => $cursoPorClave,
        'curso_por_id' => $cursoPorId,
        'curso_nombre_por_id' => $cursoNombrePorId,
        'curso_por_numero' => $cursoPorNumero,
        'curso_egresado_id' => $cursoEgresadoId,
        'division_por_clave' => $divisionPorClave,
        'division_por_id' => $divisionPorId,
        'division_nombre_por_id' => $divisionNombrePorId,
        'condicion_por_clave' => $condicionPorClave,
        'condicion_por_id' => $condicionPorId,
        'condicion_nombre_por_id' => $condicionNombrePorId,
        'materia_por_clave' => $materiaPorClave,
        'materia_por_id' => $materiaPorId,
        'materia_nombre_por_id' => $materiaNombrePorId,
        'catedras_por_clave' => $catedrasPorClave,
    ];
}

function previas_resolver_curso_importacion(array $catalogo, $valor): int
{
    $valorTexto = trim((string)$valor);
    if ($valorTexto === '') {
        return 0;
    }

    if (is_numeric($valorTexto) && isset($catalogo['curso_por_id'][(int)$valorTexto])) {
        return (int)$valorTexto;
    }

    $clave = previas_normalizar_importacion($valorTexto, true);
    if (isset($catalogo['curso_por_clave'][$clave])) {
        return (int)$catalogo['curso_por_clave'][$clave];
    }

    if (strpos($clave, 'EGRES') !== false) {
        return (int)($catalogo['curso_por_clave']['EGRESADO'] ?? 0);
    }

    if (preg_match('/([1-9])/', $clave, $m)) {
        $numero = (int)$m[1];
        return (int)($catalogo['curso_por_numero'][$numero] ?? 0);
    }

    return 0;
}

function previas_resolver_division_importacion(array $catalogo, $valor): int
{
    $valorTexto = trim((string)$valor);
    if ($valorTexto === '') {
        return 0;
    }

    $clave = previas_normalizar_importacion($valorTexto, true);

    // Importante: en el Excel la división debe venir como dato visible para el usuario
    // (A, B, C, 1° B, 6 A, etc.). No se aceptan IDs internos como 22 porque pueden
    // mapear por accidente a otra división real de la base y ocultar errores de carga.
    if (previas_importacion_es_numero_puro($valorTexto)) {
        return 0;
    }

    if (isset($catalogo['division_por_clave'][$clave])) {
        return (int)$catalogo['division_por_clave'][$clave];
    }

    if (preg_match('/([A-Z])$/', $clave, $m) && isset($catalogo['division_por_clave'][$m[1]])) {
        return (int)$catalogo['division_por_clave'][$m[1]];
    }

    return 0;
}

function previas_resolver_condicion_importacion(array $catalogo, $valor): int
{
    $valorTexto = trim((string)$valor);
    if ($valorTexto === '') {
        return 0;
    }

    if (is_numeric($valorTexto) && isset($catalogo['condicion_por_id'][(int)$valorTexto])) {
        return (int)$valorTexto;
    }

    $clave = previas_normalizar_importacion($valorTexto, true);
    return (int)($catalogo['condicion_por_clave'][$clave] ?? 0);
}

function previas_resolver_materia_importacion(array $catalogo, $valor, int $fila, array &$errores, int $idCursoMateria = 0, int $idDivisionMateria = 0): int
{
    $valorTexto = trim((string)$valor);
    if ($valorTexto === '') {
        return 0;
    }

    if (is_numeric($valorTexto) && isset($catalogo['materia_por_id'][(int)$valorTexto])) {
        return (int)$valorTexto;
    }

    $clave = previas_normalizar_importacion($valorTexto, true);
    $ids = $catalogo['materia_por_clave'][$clave] ?? [];

    if (count($ids) === 1) {
        return (int)$ids[0];
    }

    if (count($ids) > 1 && $idCursoMateria > 0 && $idDivisionMateria > 0) {
        $idsCompatibles = [];
        foreach ($ids as $idPosible) {
            $claveCatedra = $idCursoMateria . '|' . $idDivisionMateria . '|' . (int)$idPosible;
            if (isset($catalogo['catedras_por_clave'][$claveCatedra])) {
                $idsCompatibles[] = (int)$idPosible;
            }
        }

        if (count($idsCompatibles) === 1) {
            return (int)$idsCompatibles[0];
        }
    }

    if (count($ids) > 1) {
        $errores[] = "Fila {$fila}: la materia \"{$valorTexto}\" es ambigua. Usá el id de materia exacto o verificá curso/división de la materia.";
        return 0;
    }

    return 0;
}

function previas_fecha_importacion($valor, bool $requerida = false, ?string $default = null): ?string
{
    $texto = trim((string)$valor);
    if ($texto === '') {
        return $requerida ? null : $default;
    }

    if (is_numeric($texto)) {
        $num = (float)$texto;
        if ($num > 20000 && $num < 90000) {
            $timestamp = (int)round(($num - 25569) * 86400);
            return gmdate('Y-m-d', $timestamp);
        }
    }

    $formatos = ['Y-m-d', 'd/m/Y', 'd-m-Y', 'd.m.Y', 'm/d/Y'];
    foreach ($formatos as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $texto);
        if ($dt instanceof DateTime) {
            return $dt->format('Y-m-d');
        }
    }

    return null;
}

function previas_fila_vacia_importacion(array $fila): bool
{
    foreach ($fila as $valor) {
        if (trim((string)$valor) !== '') {
            return false;
        }
    }
    return true;
}

function previas_valor_fila_importacion(array $fila, array $mapa, string $header): string
{
    if (!array_key_exists($header, $mapa)) {
        return '';
    }
    return trim((string)($fila[$mapa[$header]] ?? ''));
}

function previas_preparar_importacion(PDO $pdo, array $filas): array
{
    if (count($filas) < 2) {
        return [[], ['El Excel no tiene registros para importar.'], []];
    }

    [$mapaHeaders, $faltantes] = previas_importacion_mapa_headers($filas[0]);
    if (count($faltantes) > 0) {
        return [[], ['Faltan cabeceras obligatorias: ' . implode(', ', $faltantes) . '. Descargá la plantilla y respetá esos nombres.'], []];
    }

    $catalogo = previas_catalogo_importacion($pdo);
    $errores = [];
    $registros = [];
    $clavesExcel = [];
    $hoy = date('Y-m-d');

    for ($i = 1; $i < count($filas); $i++) {
        $filaExcel = $i + 1;
        $fila = $filas[$i];

        if (previas_fila_vacia_importacion($fila)) {
            continue;
        }

        $dni = preg_replace('/\D+/', '', previas_valor_fila_importacion($fila, $mapaHeaders, 'DNI')) ?? '';
        $alumno = previas_mayuscula(previas_valor_fila_importacion($fila, $mapaHeaders, 'ALUMNO'));
        $cursoActualRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'CURSO_ACTUAL');
        $divisionActualRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'DIVISION_ACTUAL');
        $materiaRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'MATERIA');
        $cursoMateriaRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'CURSO_MATERIA');
        $divisionMateriaRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'DIVISION_MATERIA');
        $condicionRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'CONDICION');
        $anioRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'ANIO_PREVIA');
        $fechaCargaRaw = previas_valor_fila_importacion($fila, $mapaHeaders, 'FECHA_CARGA');

        if ($dni === '' || strlen($dni) < 6) {
            $errores[] = "Fila {$filaExcel}: DNI inválido u obligatorio.";
        }
        if ($alumno === '') {
            $errores[] = "Fila {$filaExcel}: ALUMNO es obligatorio.";
        }

        $cursandoIdCurso = previas_resolver_curso_importacion($catalogo, $cursoActualRaw);
        if ($cursandoIdCurso <= 0) {
            $errores[] = "Fila {$filaExcel}: CURSO_ACTUAL no existe en el sistema ({$cursoActualRaw}).";
        }

        $cursandoIdDivision = null;
        $esEgresado = $cursandoIdCurso > 0 && (int)($catalogo['curso_egresado_id'] ?? 0) === $cursandoIdCurso;
        $divisionActualTexto = trim((string)$divisionActualRaw);
        $divisionActualNoAplica = in_array(
            previas_normalizar_importacion($divisionActualTexto, true),
            ['', 'NOAPLICA', 'NA', 'NOCORRESPONDE', 'SIN', 'SINDIVISION', 'EGRESADO'],
            true
        );

        if ($esEgresado) {
            // Para EGRESADO no se guarda división actual, pero si el Excel trae basura
            // como "22" igualmente se informa para que el usuario corrija el archivo.
            if (!$divisionActualNoAplica) {
                $divActual = previas_resolver_division_importacion($catalogo, $divisionActualRaw);
                if ($divActual <= 0) {
                    $detalleDivision = previas_importacion_es_numero_puro($divisionActualRaw)
                        ? ' Las divisiones deben cargarse como A, B, C, etc.'
                        : '';
                    $errores[] = "Fila {$filaExcel}: DIVISION_ACTUAL no existe en el sistema ({$divisionActualRaw}).{$detalleDivision}";
                }
            }
        } else {
            $divActual = previas_resolver_division_importacion($catalogo, $divisionActualRaw);
            if ($divActual <= 0) {
                $detalleDivision = previas_importacion_es_numero_puro($divisionActualRaw)
                    ? ' Las divisiones deben cargarse como A, B, C, etc.'
                    : '';
                $errores[] = "Fila {$filaExcel}: DIVISION_ACTUAL no existe en el sistema ({$divisionActualRaw}).{$detalleDivision}";
            } else {
                $cursandoIdDivision = $divActual;
            }
        }

        $materiaIdCurso = previas_resolver_curso_importacion($catalogo, $cursoMateriaRaw);
        if ($materiaIdCurso <= 0) {
            $errores[] = "Fila {$filaExcel}: CURSO_MATERIA no existe en el sistema ({$cursoMateriaRaw}).";
        }

        $materiaIdDivision = previas_resolver_division_importacion($catalogo, $divisionMateriaRaw);
        if ($materiaIdDivision <= 0) {
            $detalleDivision = previas_importacion_es_numero_puro($divisionMateriaRaw)
                ? ' Las divisiones deben cargarse como A, B, C, etc.'
                : '';
            $errores[] = "Fila {$filaExcel}: DIVISION_MATERIA no existe en el sistema ({$divisionMateriaRaw}).{$detalleDivision}";
        }

        $idMateria = previas_resolver_materia_importacion($catalogo, $materiaRaw, $filaExcel, $errores, $materiaIdCurso, $materiaIdDivision);
        if ($idMateria <= 0) {
            $errores[] = "Fila {$filaExcel}: MATERIA no coincide con ninguna materia activa del sistema ({$materiaRaw}).";
        }

        if ($materiaIdCurso > 0 && $materiaIdDivision > 0 && $idMateria > 0) {
            $claveCatedra = $materiaIdCurso . '|' . $materiaIdDivision . '|' . $idMateria;
            if (!isset($catalogo['catedras_por_clave'][$claveCatedra])) {
                $errores[] = "Fila {$filaExcel}: la materia no pertenece al curso y división indicados según cátedras.";
            }
        }

        $idCondicion = previas_resolver_condicion_importacion($catalogo, $condicionRaw);
        if ($idCondicion <= 0) {
            $errores[] = "Fila {$filaExcel}: CONDICION no existe en el sistema ({$condicionRaw}).";
        }

        $anio = (int)preg_replace('/\D+/', '', $anioRaw);
        if ($anio < 2000 || $anio > 2100) {
            $errores[] = "Fila {$filaExcel}: ANIO_PREVIA debe ser un año válido.";
        }

        $fechaCarga = previas_fecha_importacion($fechaCargaRaw, false, $hoy);
        if ($fechaCarga === null) {
            $errores[] = "Fila {$filaExcel}: FECHA_CARGA no tiene formato válido. Usá DD/MM/AAAA o AAAA-MM-DD.";
        }

        // La importación masiva no carga nota ni fecha de nota.
        // Esos campos quedan siempre en NULL, tanto para registros nuevos como actualizados.
        $nota = null;
        $fechaNota = null;

        if ($dni !== '' && $idMateria > 0 && $anio > 0 && $materiaIdCurso > 0 && $materiaIdDivision > 0) {
            $claveNatural = $dni . '|' . $idMateria . '|' . $anio . '|' . $materiaIdCurso . '|' . $materiaIdDivision;
            if (isset($clavesExcel[$claveNatural])) {
                $errores[] = "Fila {$filaExcel}: registro duplicado en el Excel. Ya aparece en la fila {$clavesExcel[$claveNatural]}.";
            } else {
                $clavesExcel[$claveNatural] = $filaExcel;
            }
        }

        $registros[] = [
            'fila' => $filaExcel,
            'dni' => $dni,
            'alumno' => $alumno,
            'cursando_id_curso' => $cursandoIdCurso,
            'cursando_id_division' => $cursandoIdDivision,
            'id_materia' => $idMateria,
            'materia_id_curso' => $materiaIdCurso,
            'materia_id_division' => $materiaIdDivision,
            'id_condicion' => $idCondicion,
            'nota' => $nota,
            'fecha_nota' => $fechaNota,
            'anio' => $anio,
            'fecha_carga' => $fechaCarga,
        ];
    }

    if (count($registros) === 0 && count($errores) === 0) {
        $errores[] = 'El Excel no contiene filas con datos para importar.';
    }

    return [$registros, $errores, $catalogo];
}

function previas_importacion_archivo_desde_body(): array
{
    $body = previas_body();

    $nombreArchivo = (string)($body['nombre_archivo'] ?? '');
    $base64 = (string)($body['archivo_base64'] ?? '');

    if ($base64 === '') {
        json_response(['exito' => false, 'mensaje' => 'No se recibió ningún archivo para procesar.'], 422);
    }

    if ($nombreArchivo !== '' && !preg_match('/\.xlsx$/i', $nombreArchivo)) {
        json_response(['exito' => false, 'mensaje' => 'Por seguridad, solo se aceptan archivos Excel .xlsx.'], 422);
    }

    if (strpos($base64, ',') !== false) {
        $base64 = substr($base64, strpos($base64, ',') + 1);
    }

    $binario = base64_decode($base64, true);
    if ($binario === false || strlen($binario) === 0) {
        json_response(['exito' => false, 'mensaje' => 'El archivo recibido no se pudo leer correctamente.'], 422);
    }

    if (strlen($binario) > 8 * 1024 * 1024) {
        json_response(['exito' => false, 'mensaje' => 'El Excel es demasiado pesado. Dividí la carga en archivos más chicos.'], 422);
    }

    return [$nombreArchivo, $binario];
}

function previas_nombre_catalogo(array $catalogo, string $mapa, int $id): string
{
    return (string)($catalogo[$mapa][$id] ?? ($id > 0 ? (string)$id : ''));
}

function previas_importacion_previsualizar_registros(PDO $pdo, array $registros, array $catalogo, int $limite = 60): array
{
    $stmtExiste = $pdo->prepare('
        SELECT id_previa
        FROM previas
        WHERE dni = :dni
          AND id_materia = :id_materia
          AND anio = :anio
          AND materia_id_curso = :materia_id_curso
          AND materia_id_division = :materia_id_division
        LIMIT 1
    ');

    $filas = [];
    $nuevas = 0;
    $actualizadas = 0;

    foreach ($registros as $r) {
        $stmtExiste->execute([
            ':dni' => $r['dni'],
            ':id_materia' => $r['id_materia'],
            ':anio' => $r['anio'],
            ':materia_id_curso' => $r['materia_id_curso'],
            ':materia_id_division' => $r['materia_id_division'],
        ]);
        $idExistente = (int)$stmtExiste->fetchColumn();

        if ($idExistente > 0) {
            $actualizadas++;
            $accion = 'Actualizar';
        } else {
            $nuevas++;
            $accion = 'Nueva';
        }

        if (count($filas) >= $limite) {
            continue;
        }

        $cursoActual = previas_nombre_catalogo($catalogo, 'curso_nombre_por_id', (int)$r['cursando_id_curso']);
        $divisionActual = $r['cursando_id_division'] ? previas_nombre_catalogo($catalogo, 'division_nombre_por_id', (int)$r['cursando_id_division']) : '';
        $cursoMateria = previas_nombre_catalogo($catalogo, 'curso_nombre_por_id', (int)$r['materia_id_curso']);
        $divisionMateria = previas_nombre_catalogo($catalogo, 'division_nombre_por_id', (int)$r['materia_id_division']);

        $filas[] = [
            'fila' => (int)$r['fila'],
            'accion' => $accion,
            'id_previa_existente' => $idExistente > 0 ? $idExistente : null,
            'dni' => (string)$r['dni'],
            'alumno' => (string)$r['alumno'],
            'materia' => previas_nombre_catalogo($catalogo, 'materia_nombre_por_id', (int)$r['id_materia']),
            'id_materia' => (int)$r['id_materia'],
            'curso_materia' => trim($cursoMateria . ' ' . $divisionMateria),
            'curso_actual' => trim($cursoActual . ' ' . $divisionActual),
            'condicion' => previas_nombre_catalogo($catalogo, 'condicion_nombre_por_id', (int)$r['id_condicion']),
            'anio' => (int)$r['anio'],
            'fecha_carga' => (string)$r['fecha_carga'],
            'nota' => null,
            'fecha_nota' => null,
        ];
    }

    return [
        'filas' => $filas,
        'resumen' => [
            'total_procesadas' => count($registros),
            'nuevas' => $nuevas,
            'actualizadas' => $actualizadas,
            'mostradas' => count($filas),
        ],
    ];
}

function previas_previsualizar_excel(): void
{
    $pdo = db();

    try {
        [, $binario] = previas_importacion_archivo_desde_body();
        $filas = previas_xlsx_leer_filas($binario);
        [$registros, $errores, $catalogo] = previas_preparar_importacion($pdo, $filas);

        if (count($errores) > 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se puede generar la vista previa porque hay errores en el Excel.',
                'errores' => array_slice($errores, 0, 120),
                'total_errores' => count($errores),
            ], 422);
        }

        $preview = previas_importacion_previsualizar_registros($pdo, $registros, $catalogo, 60);

        json_response([
            'exito' => true,
            'mensaje' => 'Vista previa generada correctamente. Revisá los datos antes de confirmar la importación.',
            'data' => [
                'valido' => true,
                'filas' => $preview['filas'],
                'resumen' => $preview['resumen'],
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo generar la vista previa del Excel.',
        ], 500);
    }
}

function previas_importar_excel(): void
{
    $pdo = db();
    $body = previas_body();

    $nombreArchivo = (string)($body['nombre_archivo'] ?? '');
    $base64 = (string)($body['archivo_base64'] ?? '');

    if ($base64 === '') {
        json_response(['exito' => false, 'mensaje' => 'No se recibió ningún archivo para importar.'], 422);
    }

    if ($nombreArchivo !== '' && !preg_match('/\.xlsx$/i', $nombreArchivo)) {
        json_response(['exito' => false, 'mensaje' => 'Por seguridad, la importación acepta únicamente archivos Excel .xlsx.'], 422);
    }

    if (strpos($base64, ',') !== false) {
        $base64 = substr($base64, strpos($base64, ',') + 1);
    }

    $binario = base64_decode($base64, true);
    if ($binario === false || strlen($binario) === 0) {
        json_response(['exito' => false, 'mensaje' => 'El archivo recibido no se pudo leer correctamente.'], 422);
    }

    if (strlen($binario) > 8 * 1024 * 1024) {
        json_response(['exito' => false, 'mensaje' => 'El Excel es demasiado pesado. Dividí la carga en archivos más chicos.'], 422);
    }

    try {
        $filas = previas_xlsx_leer_filas($binario);
        [$registros, $errores] = previas_preparar_importacion($pdo, $filas);

        if (count($errores) > 0) {
            json_response([
                'exito' => false,
                'mensaje' => 'No se importó nada porque hay errores en el Excel. Corregí las filas marcadas y volvé a intentar.',
                'errores' => array_slice($errores, 0, 120),
                'total_errores' => count($errores),
            ], 422);
        }

        $stmtExiste = $pdo->prepare('
            SELECT id_previa
            FROM previas
            WHERE dni = :dni
              AND id_materia = :id_materia
              AND anio = :anio
              AND materia_id_curso = :materia_id_curso
              AND materia_id_division = :materia_id_division
            LIMIT 1
        ');

        $stmtInsert = $pdo->prepare('
            INSERT INTO previas (
                dni, alumno, cursando_id_curso, cursando_id_division,
                id_materia, materia_id_curso, materia_id_division, id_condicion,
                nota, fecha_nota, inscripcion, activo, anio, fecha_carga
            ) VALUES (
                :dni, :alumno, :cursando_id_curso, :cursando_id_division,
                :id_materia, :materia_id_curso, :materia_id_division, :id_condicion,
                :nota, :fecha_nota, 0, 1, :anio, :fecha_carga
            )
        ');

        $stmtUpdate = $pdo->prepare('
            UPDATE previas SET
                alumno = :alumno,
                cursando_id_curso = :cursando_id_curso,
                cursando_id_division = :cursando_id_division,
                id_condicion = :id_condicion,
                nota = :nota,
                fecha_nota = :fecha_nota,
                fecha_carga = :fecha_carga,
                activo = 1,
                fecha_baja = NULL,
                motivo_baja = NULL
            WHERE id_previa = :id_previa
        ');

        $pdo->beginTransaction();

        $nuevas = 0;
        $actualizadas = 0;

        foreach ($registros as $r) {
            $keyParams = [
                ':dni' => $r['dni'],
                ':id_materia' => $r['id_materia'],
                ':anio' => $r['anio'],
                ':materia_id_curso' => $r['materia_id_curso'],
                ':materia_id_division' => $r['materia_id_division'],
            ];
            $stmtExiste->execute($keyParams);
            $idExistente = (int)$stmtExiste->fetchColumn();

            $params = [
                ':dni' => $r['dni'],
                ':alumno' => $r['alumno'],
                ':cursando_id_curso' => $r['cursando_id_curso'],
                ':cursando_id_division' => $r['cursando_id_division'],
                ':id_materia' => $r['id_materia'],
                ':materia_id_curso' => $r['materia_id_curso'],
                ':materia_id_division' => $r['materia_id_division'],
                ':id_condicion' => $r['id_condicion'],
                ':nota' => $r['nota'],
                ':fecha_nota' => $r['fecha_nota'],
                ':anio' => $r['anio'],
                ':fecha_carga' => $r['fecha_carga'],
            ];

            if ($idExistente > 0) {
                unset($params[':dni'], $params[':id_materia'], $params[':materia_id_curso'], $params[':materia_id_division'], $params[':anio']);
                $params[':id_previa'] = $idExistente;
                $stmtUpdate->execute($params);
                $actualizadas++;
            } else {
                $stmtInsert->execute($params);
                $nuevas++;
            }
        }

        $pdo->commit();

        json_response([
            'exito' => true,
            'mensaje' => "Importación completada: {$nuevas} nuevas y {$actualizadas} actualizadas.",
            'data' => [
                'total_procesadas' => count($registros),
                'nuevas' => $nuevas,
                'actualizadas' => $actualizadas,
            ],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        log_error($e, __FUNCTION__);
        json_response([
            'exito' => false,
            'mensaje' => 'No se pudo completar la importación masiva de previas.',
        ], 500);
    }
}

function previas_xlsx_xml_escape(string $texto): string
{
    return htmlspecialchars($texto, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function previas_xlsx_columna(int $index): string
{
    $index++;
    $col = '';
    while ($index > 0) {
        $mod = ($index - 1) % 26;
        $col = chr(65 + $mod) . $col;
        $index = intdiv($index - $mod - 1, 26);
    }
    return $col;
}

function previas_xlsx_sheet_xml(array $rows): string
{
    $xmlRows = [];
    foreach ($rows as $rIndex => $row) {
        $cells = [];
        foreach ($row as $cIndex => $value) {
            $ref = previas_xlsx_columna($cIndex) . ($rIndex + 1);
            $safe = previas_xlsx_xml_escape((string)$value);
            $cells[] = "<c r=\"{$ref}\" t=\"inlineStr\"><is><t>{$safe}</t></is></c>";
        }
        $num = $rIndex + 1;
        $cellsXml = implode('', $cells);
        $xmlRows[] = "<row r=\"{$num}\">{$cellsXml}</row>";
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        . '<sheetFormatPr defaultRowHeight="18"/>'
        . '<cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="32" customWidth="1"/><col min="3" max="10" width="18" customWidth="1"/></cols>'
        . '<sheetData>' . implode('', $xmlRows) . '</sheetData>'
        . '</worksheet>';
}

function previas_crear_xlsx_base64(array $rows): string
{
    if (!class_exists('ZipArchive')) {
        json_response([
            'exito' => false,
            'mensaje' => 'El servidor no tiene habilitada la extensión ZipArchive de PHP, necesaria para crear la plantilla .xlsx.',
        ], 500);
    }

    $tmp = tempnam(sys_get_temp_dir(), 'previas_tpl_');
    if ($tmp === false) {
        json_response(['exito' => false, 'mensaje' => 'No se pudo generar la plantilla temporal.'], 500);
    }

    $zip = new ZipArchive();
    $zip->open($tmp, ZipArchive::OVERWRITE);
    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Previas" sheetId="1" r:id="rId1"/></sheets></workbook>');
    $zip->addFromString('xl/worksheets/sheet1.xml', previas_xlsx_sheet_xml($rows));
    $zip->close();

    $contenido = file_get_contents($tmp);
    @unlink($tmp);

    return base64_encode((string)$contenido);
}

function previas_plantilla_importacion(): void
{
    $headers = previas_headers_importacion();
    $rows = [
        $headers,
        ['47039811', 'BALLARINO, BRUNO', '7°', 'B', 'MATEMÁTICA', '5°', 'B', 'PREVIA', (string)date('Y'), date('d/m/Y')],
        ['50000000', 'PEREZ, JUAN', 'EGRESADO', '', 'FÍSICA', '6°', 'A', 'REGULAR', (string)date('Y'), date('d/m/Y')],
    ];

    json_response([
        'exito' => true,
        'nombre_archivo' => 'plantilla_importacion_previas.xlsx',
        'mime' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'archivo_base64' => previas_crear_xlsx_base64($rows),
        'headers' => $headers,
        'requeridos' => previas_headers_requeridos_importacion(),
    ]);
}


