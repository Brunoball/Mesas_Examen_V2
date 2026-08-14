<?php
declare(strict_types=1);

/**
 * Limpiador/restore local para la suite Playwright de Lerna.
 *
 * Seguridad:
 * - CLI únicamente.
 * - Solo acepta DB master y tenant en localhost/127.0.0.1/::1.
 * - Solo borra entidades cuyo nombre empieza por PW_TEST_PREFIX (PWTEST por defecto)
 *   y trazas cuyo User-Agent es LernaPlaywright/PWTEST.
 * - Las cátedras/configuración existentes se SNAPSHOTEAN antes de tocarlas y se restauran.
 *
 * Ejemplos:
 *   php testing/cleanup_playwright.php --assert-safe --tenant=1 --prefix=PWTEST --json
 *   php testing/cleanup_playwright.php --cleanup --restore-snapshots --tenant=1 --prefix=PWTEST --json
 *   php testing/cleanup_playwright.php --cleanup --restore-snapshots --cleanup-playwright-sessions --tenant=1 --prefix=PWTEST --json
 *   php testing/cleanup_playwright.php --find-safe-catedra --tenant=1 --json
 *   php testing/cleanup_playwright.php --snapshot-catedra=123 --tenant=1 --json
 *   php testing/cleanup_playwright.php --snapshot-form-config --tenant=1 --json
 *   php testing/cleanup_playwright.php --snapshot-mesas --tenant=1 --json
 *   php testing/cleanup_playwright.php --prepare-mesas-fixture --tenant=1 --prefix=PWTEST --json
 *   php testing/cleanup_playwright.php --mesas-state --tenant=1 --json
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../config/db.php';

const PW_USER_AGENT_MARKER = 'LernaPlaywright/PWTEST';
const SNAPSHOT_FILE = __DIR__ . '/.playwright_snapshots.json';

function pw_arg(string $name, ?string $default = null): ?string
{
    global $argv;
    $needle = '--' . $name;
    foreach ($argv as $arg) {
        if ($arg === $needle) return '1';
        if (strpos($arg, $needle . '=') === 0) return substr($arg, strlen($needle) + 1);
    }
    return $default;
}

function pw_has(string $name): bool
{
    return pw_arg($name) !== null;
}

function pw_output(array $payload, int $code = 0): never
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo ($json === false ? '{"ok":false,"error":"No se pudo serializar la respuesta"}' : $json) . PHP_EOL;
    exit($code);
}

function pw_local_host(string $host): bool
{
    $host = strtolower(trim($host));
    return in_array($host, ['localhost', '127.0.0.1', '::1'], true);
}

function pw_assert_local(string $host, string $label): void
{
    if (!pw_local_host($host)) {
        throw new RuntimeException("SEGURIDAD: {$label} apunta a '{$host}'. Este limpiador solo funciona contra bases LOCALES.");
    }
}

function pw_table_exists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :tabla');
    $stmt->execute([':tabla' => $table]);
    return (int)$stmt->fetchColumn() > 0;
}

function pw_column_exists(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :tabla AND column_name = :columna');
    $stmt->execute([':tabla' => $table, ':columna' => $column]);
    return (int)$stmt->fetchColumn() > 0;
}

function pw_ident(string $name): string
{
    if (preg_match('/^[A-Za-z0-9_]+$/', $name) !== 1) {
        throw new RuntimeException('Identificador SQL inválido: ' . $name);
    }
    return '`' . $name . '`';
}

function pw_insert_row(PDO $pdo, string $table, array $row): void
{
    if (!$row) return;
    static $writableColumns = [];
    if (!isset($writableColumns[$table])) {
        $st = $pdo->prepare("\n            SELECT COLUMN_NAME\n            FROM information_schema.columns\n            WHERE table_schema = DATABASE()\n              AND table_name = :tabla\n              AND EXTRA NOT LIKE '%GENERATED%'\n            ORDER BY ORDINAL_POSITION\n        ");
        $st->execute([':tabla' => $table]);
        $writableColumns[$table] = array_fill_keys($st->fetchAll(PDO::FETCH_COLUMN) ?: [], true);
    }
    $row = array_intersect_key($row, $writableColumns[$table]);
    if (!$row) return;
    $columns = array_keys($row);
    foreach ($columns as $column) pw_ident((string)$column);
    $columnSql = implode(', ', array_map('pw_ident', $columns));
    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $stmt = $pdo->prepare('INSERT INTO ' . pw_ident($table) . " ({$columnSql}) VALUES ({$placeholders})");
    $stmt->execute(array_values($row));
}

function pw_snapshot_load(): array
{
    if (!is_file(SNAPSHOT_FILE)) return ['catedras' => [], 'form_config' => null, 'previas_inscripciones' => null, 'mesas' => null];
    $decoded = json_decode((string)file_get_contents(SNAPSHOT_FILE), true);
    if (!is_array($decoded)) return ['catedras' => [], 'form_config' => null, 'previas_inscripciones' => null, 'mesas' => null];
    $decoded['catedras'] = is_array($decoded['catedras'] ?? null) ? $decoded['catedras'] : [];
    $decoded['form_config'] = $decoded['form_config'] ?? null;
    $decoded['previas_inscripciones'] = $decoded['previas_inscripciones'] ?? null;
    $decoded['mesas'] = $decoded['mesas'] ?? null;
    return $decoded;
}

function pw_snapshot_save(array $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents(SNAPSHOT_FILE, $json . PHP_EOL, LOCK_EX) === false) {
        throw new RuntimeException('No se pudo guardar el snapshot Playwright.');
    }
}

function pw_tenant(PDO $master, int $tenantId): array
{
    $stmt = $master->prepare('SELECT idTenant, nombre, db_host, db_name, db_user, db_pass FROM tenants WHERE idTenant = :id LIMIT 1');
    $stmt->execute([':id' => $tenantId]);
    $tenant = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$tenant) throw new RuntimeException("No existe el tenant {$tenantId} en mesas_master.");
    return $tenant;
}

function pw_snapshot_catedra(PDO $tenantDb, int $idCatedra): void
{
    if ($idCatedra <= 0) throw new RuntimeException('id_catedra inválido para snapshot.');

    $stmt = $tenantDb->prepare('SELECT * FROM catedras WHERE id_catedra = :id LIMIT 1');
    $stmt->execute([':id' => $idCatedra]);
    $catedra = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$catedra) throw new RuntimeException("No existe la cátedra {$idCatedra}.");

    $assignments = [];
    if (pw_table_exists($tenantDb, 'catedras_docentes')) {
        $st = $tenantDb->prepare('SELECT * FROM catedras_docentes WHERE id_catedra = :id ORDER BY id_catedra_docente ASC');
        $st->execute([':id' => $idCatedra]);
        $assignments = $st->fetchAll(PDO::FETCH_ASSOC);
    }

    $pending = [];
    if (pw_table_exists($tenantDb, 'mesas_docente_cambios_pendientes') && pw_column_exists($tenantDb, 'mesas_docente_cambios_pendientes', 'id_catedra')) {
        $st = $tenantDb->prepare('SELECT * FROM mesas_docente_cambios_pendientes WHERE id_catedra = :id ORDER BY id_cambio ASC');
        $st->execute([':id' => $idCatedra]);
        $pending = $st->fetchAll(PDO::FETCH_ASSOC);
    }

    $snap = pw_snapshot_load();
    $key = (string)$idCatedra;
    if (!isset($snap['catedras'][$key])) {
        $snap['catedras'][$key] = [
            'catedra' => $catedra,
            'assignments' => $assignments,
            'pending' => $pending,
        ];
        pw_snapshot_save($snap);
    }
}

function pw_snapshot_form_config(PDO $tenantDb): void
{
    if (!pw_table_exists($tenantDb, 'mesas_config')) return;
    $snap = pw_snapshot_load();
    if ($snap['form_config'] !== null) return;

    $rows = $tenantDb->query('SELECT * FROM mesas_config ORDER BY id_config ASC')->fetchAll(PDO::FETCH_ASSOC);
    $snap['form_config'] = ['rows' => $rows];
    pw_snapshot_save($snap);
}



function pw_disable_form_confirmation_email(PDO $tenantDb): array
{
    if (!pw_table_exists($tenantDb, 'mesas_config') || !pw_column_exists($tenantDb, 'mesas_config', 'email_confirmacion_activo')) {
        return ['actualizadas' => 0];
    }

    // Este cambio es exclusivamente temporal de testing. El snapshot del formulario
    // debe tomarse antes y cleanupAll(--restore-snapshots) lo restaura al finalizar.
    $stmt = $tenantDb->prepare('UPDATE mesas_config SET email_confirmacion_activo = 0 WHERE activo = 1');
    $stmt->execute();
    return ['actualizadas' => $stmt->rowCount()];
}

function pw_table_auto_increment(PDO $pdo, string $table): ?int
{
    $stmt = $pdo->prepare('SELECT AUTO_INCREMENT FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :tabla LIMIT 1');
    $stmt->execute([':tabla' => $table]);
    $value = $stmt->fetchColumn();
    return $value === false || $value === null ? null : (int)$value;
}

function pw_snapshot_previas_inscripciones(PDO $tenantDb): void
{
    if (!pw_table_exists($tenantDb, 'previas')) {
        throw new RuntimeException('No existe la tabla previas para snapshot.');
    }

    $snap = pw_snapshot_load();
    if (is_array($snap['previas_inscripciones'] ?? null)) return;

    $previas = $tenantDb->query('SELECT id_previa, inscripcion FROM previas ORDER BY id_previa ASC')->fetchAll(PDO::FETCH_ASSOC);
    $inscripciones = pw_table_exists($tenantDb, 'formulario_inscripciones')
        ? $tenantDb->query('SELECT * FROM formulario_inscripciones ORDER BY id_inscripcion ASC')->fetchAll(PDO::FETCH_ASSOC)
        : [];
    $detalles = pw_table_exists($tenantDb, 'formulario_inscripciones_detalle')
        ? $tenantDb->query('SELECT * FROM formulario_inscripciones_detalle ORDER BY id_detalle ASC')->fetchAll(PDO::FETCH_ASSOC)
        : [];

    $snap['previas_inscripciones'] = [
        'previas' => $previas,
        'formulario_inscripciones' => $inscripciones,
        'formulario_inscripciones_detalle' => $detalles,
        'auto_increment' => [
            'formulario_inscripciones' => pw_table_auto_increment($tenantDb, 'formulario_inscripciones'),
            'formulario_inscripciones_detalle' => pw_table_auto_increment($tenantDb, 'formulario_inscripciones_detalle'),
        ],
    ];
    pw_snapshot_save($snap);
}

function pw_mesas_snapshot_tables(): array
{
    return [
        'mesas',
        'mesas_grupos',
        'mesas_no_agrupadas',
        'mesas_grupos_slots_extra',
        'mesas_armado_rango_actual',
        'mesas_docente_cambios_pendientes',
        'mesas_validaciones',
        'mesas_notificaciones_email_lotes',
        'mesas_notificaciones_email_items',
        'historial_mesas_armados',
        'historial_mesas_detalle',
        'historial_previas_resultados',
        'docentes_disponibilidad',
        'docentes_bloques_no',
    ];
}

function pw_snapshot_mesas(PDO $tenantDb): void
{
    $snap = pw_snapshot_load();
    if (is_array($snap['mesas'] ?? null)) return;

    $tables = [];
    $autoIncrement = [];
    foreach (pw_mesas_snapshot_tables() as $table) {
        if (!pw_table_exists($tenantDb, $table)) continue;
        $tables[$table] = $tenantDb->query('SELECT * FROM ' . pw_ident($table))->fetchAll(PDO::FETCH_ASSOC);
        $autoIncrement[$table] = pw_table_auto_increment($tenantDb, $table);
    }

    $snap['mesas'] = [
        'tables' => $tables,
        'auto_increment' => $autoIncrement,
    ];
    pw_snapshot_save($snap);
}

function pw_mesas_clear_tables(PDO $tenantDb, bool $includeAvailability = true): array
{
    $order = [
        'mesas_notificaciones_email_items',
        'mesas_notificaciones_email_lotes',
        'mesas_grupos_slots_extra',
        'mesas_grupos',
        'mesas_no_agrupadas',
        'mesas_docente_cambios_pendientes',
        'mesas_validaciones',
        'historial_mesas_detalle',
        'historial_previas_resultados',
        'historial_mesas_armados',
        'mesas',
        'mesas_armado_rango_actual',
    ];
    if ($includeAvailability) {
        $order[] = 'docentes_bloques_no';
        $order[] = 'docentes_disponibilidad';
    }

    $deleted = [];
    foreach ($order as $table) {
        if (!pw_table_exists($tenantDb, $table)) continue;
        $deleted[$table] = (int)$tenantDb->exec('DELETE FROM ' . pw_ident($table));
    }
    return $deleted;
}

function pw_restore_mesas_snapshot(PDO $tenantDb, array $data): bool
{
    if (!is_array($data['tables'] ?? null)) return false;

    $tenantDb->beginTransaction();
    try {
        pw_mesas_clear_tables($tenantDb, true);

        $insertOrder = [
            'docentes_disponibilidad',
            'docentes_bloques_no',
            'mesas',
            'mesas_armado_rango_actual',
            'mesas_grupos',
            'mesas_no_agrupadas',
            'mesas_grupos_slots_extra',
            'mesas_docente_cambios_pendientes',
            'mesas_validaciones',
            'historial_mesas_armados',
            'historial_mesas_detalle',
            'historial_previas_resultados',
            'mesas_notificaciones_email_lotes',
            'mesas_notificaciones_email_items',
        ];

        foreach ($insertOrder as $table) {
            if (!pw_table_exists($tenantDb, $table)) continue;
            foreach (($data['tables'][$table] ?? []) as $row) {
                if (is_array($row)) pw_insert_row($tenantDb, $table, $row);
            }
        }
        $tenantDb->commit();
    } catch (Throwable $e) {
        if ($tenantDb->inTransaction()) $tenantDb->rollBack();
        throw $e;
    }

    foreach (($data['auto_increment'] ?? []) as $table => $value) {
        $value = (int)$value;
        if ($value > 0 && pw_table_exists($tenantDb, (string)$table)) {
            $tenantDb->exec('ALTER TABLE ' . pw_ident((string)$table) . ' AUTO_INCREMENT = ' . $value);
        }
    }
    return true;
}

function pw_mesas_effective_docente_sql(string $alias = 'cat'): string
{
    return "COALESCE(\n        (SELECT cd.id_docente\n           FROM catedras_docentes cd\n           LEFT JOIN cargos ca ON ca.id_cargo = cd.id_cargo\n           LEFT JOIN docentes dd ON dd.id_docente = cd.id_docente\n          WHERE cd.id_catedra = {$alias}.id_catedra AND cd.activo = 1 AND dd.activo = 1\n          ORDER BY CASE\n              WHEN cd.llamado_mesa = 1 THEN 0\n              WHEN UPPER(TRIM(COALESCE(ca.cargo, ''))) = 'SUPLENTE' THEN 1\n              WHEN UPPER(TRIM(COALESCE(ca.cargo, ''))) = 'TITULAR' THEN 2\n              ELSE 3 END, cd.id_catedra_docente ASC\n          LIMIT 1),\n        {$alias}.id_docente\n    )";
}

function pw_mesas_normal_catedras(PDO $pdo, int $limit = 10): array
{
    $effective = pw_mesas_effective_docente_sql('cat');
    $areaSql = "\n        SELECT am.id_area\n          FROM catedras cat\n          INNER JOIN areas_materias am ON am.id_materia = cat.id_materia AND am.activo = 1\n          INNER JOIN docentes d ON d.id_docente = {$effective} AND d.activo = 1\n         WHERE cat.activo = 1\n           AND NOT EXISTS (SELECT 1 FROM talleres_materias tm WHERE tm.id_catedra = cat.id_catedra AND tm.activo = 1)\n         GROUP BY am.id_area\n        HAVING COUNT(DISTINCT cat.id_catedra) >= 4 AND COUNT(DISTINCT d.id_docente) >= 2\n         ORDER BY COUNT(DISTINCT cat.id_catedra) DESC, am.id_area ASC\n         LIMIT 1\n    ";
    $idArea = (int)($pdo->query($areaSql)->fetchColumn() ?: 0);
    if ($idArea <= 0) throw new RuntimeException('Fixture Mesas: no existe un área con al menos 4 cátedras y 2 docentes activos.');

    $sql = "\n        SELECT cat.id_catedra, cat.id_curso, cat.id_division, cat.id_materia,\n               {$effective} AS id_docente, am.id_area, mat.materia, ar.area, d.docente\n          FROM catedras cat\n          INNER JOIN areas_materias am ON am.id_materia = cat.id_materia AND am.activo = 1 AND am.id_area = :area\n          INNER JOIN materias mat ON mat.id_materia = cat.id_materia AND mat.activo = 1\n          INNER JOIN areas ar ON ar.id_area = am.id_area AND ar.activo = 1\n          INNER JOIN docentes d ON d.id_docente = {$effective} AND d.activo = 1\n         WHERE cat.activo = 1\n           AND NOT EXISTS (SELECT 1 FROM talleres_materias tm WHERE tm.id_catedra = cat.id_catedra AND tm.activo = 1)\n         ORDER BY cat.id_docente ASC, cat.id_materia ASC, cat.id_catedra ASC\n         LIMIT " . max(4, min(30, $limit));
    $st = $pdo->prepare($sql);
    $st->execute([':area' => $idArea]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function pw_mesas_other_area_catedras(PDO $pdo, int $excludedArea, int $limit = 3): array
{
    $effective = pw_mesas_effective_docente_sql('cat');
    $sql = "\n        SELECT cat.id_catedra, cat.id_curso, cat.id_division, cat.id_materia,\n               {$effective} AS id_docente, am.id_area, mat.materia, ar.area, d.docente\n          FROM catedras cat\n          INNER JOIN areas_materias am ON am.id_materia = cat.id_materia AND am.activo = 1 AND am.id_area <> :area\n          INNER JOIN materias mat ON mat.id_materia = cat.id_materia AND mat.activo = 1\n          INNER JOIN areas ar ON ar.id_area = am.id_area AND ar.activo = 1\n          INNER JOIN docentes d ON d.id_docente = {$effective} AND d.activo = 1\n         WHERE cat.activo = 1\n           AND NOT EXISTS (SELECT 1 FROM talleres_materias tm WHERE tm.id_catedra = cat.id_catedra AND tm.activo = 1)\n         ORDER BY am.id_area ASC, cat.id_catedra ASC\n         LIMIT " . max(1, min(10, $limit));
    $st = $pdo->prepare($sql);
    $st->execute([':area' => $excludedArea]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function pw_mesas_correlation_pair(PDO $pdo): array
{
    $doc1 = pw_mesas_effective_docente_sql('c1');
    $doc2 = pw_mesas_effective_docente_sql('c2');
    $sql = "\n        SELECT mc.id_materia_correlativa, mc.tipo,
               c1.id_catedra AS base_id_catedra, c1.id_curso AS base_id_curso, c1.id_division AS base_id_division,
               c1.id_materia AS base_id_materia, {$doc1} AS base_id_docente,
               c2.id_catedra AS relacionada_id_catedra, c2.id_curso AS relacionada_id_curso, c2.id_division AS relacionada_id_division,
               c2.id_materia AS relacionada_id_materia, {$doc2} AS relacionada_id_docente
          FROM materias_correlativas mc
          INNER JOIN catedras c1 ON c1.id_materia = mc.id_materia AND c1.id_curso = mc.id_curso AND c1.activo = 1
          INNER JOIN catedras c2 ON c2.id_materia = mc.id_materia_relacionada AND c2.id_curso = mc.id_curso_relacionada AND c2.activo = 1
          INNER JOIN docentes d1 ON d1.id_docente = {$doc1} AND d1.activo = 1
          INNER JOIN docentes d2 ON d2.id_docente = {$doc2} AND d2.activo = 1
         WHERE mc.activo = 1 AND mc.bloquea_armado = 1 AND mc.tipo <> 'equivalente'
           AND NOT EXISTS (SELECT 1 FROM talleres_materias tm WHERE tm.id_catedra IN (c1.id_catedra, c2.id_catedra) AND tm.activo = 1)
         ORDER BY mc.id_materia_correlativa ASC
         LIMIT 1
    ";
    $row = $pdo->query($sql)->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('Fixture Mesas: no existe una correlativa bloqueante con cátedras y docentes activos.');
    return $row;
}

function pw_mesas_workshop(PDO $pdo): array
{
    $effective = pw_mesas_effective_docente_sql('cat');
    $sql = "\n        SELECT ta.id_taller, ta.taller, ta.id_curso AS taller_id_curso, ta.id_division AS taller_id_division,
               cat.id_catedra, cat.id_curso, cat.id_division, cat.id_materia, {$effective} AS id_docente
          FROM talleres ta
          INNER JOIN talleres_materias tm ON tm.id_taller = ta.id_taller AND tm.activo = 1
          INNER JOIN catedras cat ON cat.id_catedra = tm.id_catedra AND cat.activo = 1
          INNER JOIN docentes d ON d.id_docente = {$effective} AND d.activo = 1
         WHERE ta.activo = 1
           AND (SELECT COUNT(*) FROM talleres_materias tx WHERE tx.id_taller = ta.id_taller AND tx.activo = 1) >= 2
         ORDER BY ta.id_taller ASC, COALESCE(tm.orden, 999), tm.id_taller_materia ASC
         LIMIT 1
    ";
    $row = $pdo->query($sql)->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('Fixture Mesas: no existe un taller activo con al menos dos cátedras y docentes activos.');
    return $row;
}

function pw_mesas_insert_previa(PDO $pdo, array $cat, string $dni, string $alumno, int $anio): int
{
    $stmt = $pdo->prepare("\n        INSERT INTO previas (
            dni, alumno, cursando_id_curso, cursando_id_division, id_materia,
            materia_id_curso, materia_id_division, id_condicion, nota, fecha_nota,
            inscripcion, activo, anio, fecha_carga, fecha_baja, motivo_baja
        ) VALUES (
            :dni, :alumno, :curso, :division, :materia, :curso_materia, :division_materia,
            3, NULL, NULL, 1, 1, :anio, CURRENT_DATE, NULL, NULL
        )
    ");
    $stmt->execute([
        ':dni' => $dni,
        ':alumno' => $alumno,
        ':curso' => (int)$cat['id_curso'],
        ':division' => (int)$cat['id_division'],
        ':materia' => (int)$cat['id_materia'],
        ':curso_materia' => (int)$cat['id_curso'],
        ':division_materia' => (int)$cat['id_division'],
        ':anio' => $anio,
    ]);
    return (int)$pdo->lastInsertId();
}

function pw_prepare_mesas_fixture(PDO $pdo, string $prefix): array
{
    pw_snapshot_previas_inscripciones($pdo);
    pw_snapshot_mesas($pdo);
    pw_mesas_clear_tables($pdo, true);
    $pdo->exec('UPDATE previas SET inscripcion = 0 WHERE inscripcion <> 0');

    $normal = pw_mesas_normal_catedras($pdo, 8);
    if (count($normal) < 4) throw new RuntimeException('Fixture Mesas: faltan cátedras normales para armar el escenario.');
    $other = pw_mesas_other_area_catedras($pdo, (int)$normal[0]['id_area'], 3);
    if (count($other) < 1) throw new RuntimeException('Fixture Mesas: se necesita al menos otra área activa.');
    $corr = pw_mesas_correlation_pair($pdo);
    $workshop = pw_mesas_workshop($pdo);

    $today = new DateTimeImmutable('today');
    $start = $today->modify('next monday');
    $dates = [];
    for ($i = 0; $i < 5; $i++) $dates[] = $start->modify("+{$i} day")->format('Y-m-d');
    $turns = $pdo->query('SELECT id_turno, turno FROM turnos WHERE activo = 1 ORDER BY id_turno ASC LIMIT 2')->fetchAll(PDO::FETCH_ASSOC);
    if (!$turns) throw new RuntimeException('Fixture Mesas: no existen turnos activos.');

    $created = [];
    $seq = 0;
    $insert = static function (array $cat, string $role, string $dni) use ($pdo, $prefix, &$created, &$seq): int {
        $seq++;
        $alumno = strtoupper($prefix . ' MESAS ' . $role . ' ' . str_pad((string)$seq, 2, '0', STR_PAD_LEFT));
        $id = pw_mesas_insert_previa($pdo, $cat, $dni, $alumno, 2080 + $seq);
        $created[] = [
            'id_previa' => $id,
            'role' => $role,
            'dni' => $dni,
            'alumno' => $alumno,
            'id_catedra' => (int)$cat['id_catedra'],
            'id_materia' => (int)$cat['id_materia'],
            'id_curso' => (int)$cat['id_curso'],
            'id_division' => (int)$cat['id_division'],
            'id_docente' => (int)($cat['id_docente'] ?? 0),
            'id_area' => isset($cat['id_area']) ? (int)$cat['id_area'] : null,
        ];
        return $id;
    };

    for ($i = 0; $i < min(6, count($normal)); $i++) {
        $insert($normal[$i], 'AREA_' . ($i + 1), (string)(79010000 + $i));
    }
    // Segundo alumno en la misma cátedra: permite probar quitar/agregar persona sin borrar el número completo.
    $insert($normal[0], 'AREA_1_B', '79010050');
    for ($i = 0; $i < min(2, count($other)); $i++) {
        $insert($other[$i], 'OTRA_AREA_' . ($i + 1), (string)(79011000 + $i));
    }

    $base = [
        'id_catedra' => $corr['base_id_catedra'], 'id_curso' => $corr['base_id_curso'],
        'id_division' => $corr['base_id_division'], 'id_materia' => $corr['base_id_materia'],
        'id_docente' => $corr['base_id_docente'],
    ];
    $relacionada = [
        'id_catedra' => $corr['relacionada_id_catedra'], 'id_curso' => $corr['relacionada_id_curso'],
        'id_division' => $corr['relacionada_id_division'], 'id_materia' => $corr['relacionada_id_materia'],
        'id_docente' => $corr['relacionada_id_docente'],
    ];
    // Replica exactamente el sentido operativo usado por armado y edición.
    if ((int)$base['id_curso'] !== (int)$relacionada['id_curso']) {
        $corrAnterior = (int)$base['id_curso'] < (int)$relacionada['id_curso'] ? $base : $relacionada;
        $corrPosterior = (int)$base['id_curso'] < (int)$relacionada['id_curso'] ? $relacionada : $base;
    } elseif ((string)$corr['tipo'] === 'posterior') {
        $corrAnterior = $relacionada;
        $corrPosterior = $base;
    } else {
        $corrAnterior = $base;
        $corrPosterior = $relacionada;
    }
    $sharedCorrelationDni = '79012000';
    $insert($corrAnterior, 'CORRELATIVA_ANTERIOR', $sharedCorrelationDni);
    $insert($corrPosterior, 'CORRELATIVA_POSTERIOR', $sharedCorrelationDni);

    $workshopCat = [
        'id_catedra' => $workshop['id_catedra'], 'id_curso' => $workshop['id_curso'],
        'id_division' => $workshop['id_division'], 'id_materia' => $workshop['id_materia'],
        'id_docente' => $workshop['id_docente'],
    ];
    $workshopPrevia = $insert($workshopCat, 'TALLER', '79013000');

    return [
        'prefix' => $prefix,
        'dates' => $dates,
        'turnos' => $turns,
        'previas' => $created,
        'area_principal' => ['id_area' => (int)$normal[0]['id_area'], 'area' => $normal[0]['area'] ?? ''],
        'otra_area' => ['id_area' => (int)$other[0]['id_area'], 'area' => $other[0]['area'] ?? ''],
        'correlativa' => $corr,
        'taller' => ['id_taller' => (int)$workshop['id_taller'], 'taller' => $workshop['taller'], 'id_previa' => $workshopPrevia],
    ];
}

function pw_mesas_state(PDO $pdo): array
{
    $queries = [
        'mesas' => "SELECT me.*, p.dni, p.alumno, p.id_materia AS previa_id_materia, p.nota, p.fecha_nota, p.activo AS previa_activa, p.inscripcion, cat.id_materia AS catedra_id_materia, am.id_area FROM mesas me LEFT JOIN previas p ON p.id_previa = me.id_previa LEFT JOIN catedras cat ON cat.id_catedra = me.id_catedra LEFT JOIN areas_materias am ON am.id_materia = COALESCE(cat.id_materia, p.id_materia) AND am.activo = 1 ORDER BY me.numero_mesa, me.id_mesa",
        'grupos' => 'SELECT * FROM mesas_grupos ORDER BY numero_grupo, orden, numero_mesa',
        'no_agrupadas' => 'SELECT * FROM mesas_no_agrupadas ORDER BY numero_mesa',
        'slots_extra' => 'SELECT * FROM mesas_grupos_slots_extra ORDER BY numero_grupo',
        'rango' => 'SELECT * FROM mesas_armado_rango_actual ORDER BY id',
        'cambios_docente' => 'SELECT * FROM mesas_docente_cambios_pendientes ORDER BY id_cambio',
        'historial_armados' => 'SELECT * FROM historial_mesas_armados ORDER BY id_armado_historial',
        'historial_detalle' => 'SELECT * FROM historial_mesas_detalle ORDER BY id_historial_detalle',
        'historial_resultados' => 'SELECT * FROM historial_previas_resultados ORDER BY id_resultado',
        'notificaciones_lotes' => 'SELECT * FROM mesas_notificaciones_email_lotes ORDER BY id_lote',
        'notificaciones_items' => 'SELECT * FROM mesas_notificaciones_email_items ORDER BY id_item',
        'test_previas' => "SELECT * FROM previas WHERE anio >= 2080 AND alumno LIKE '% MESAS %' ORDER BY id_previa",
    ];
    $result = [];
    foreach ($queries as $key => $sql) {
        $table = match ($key) {
            'grupos' => 'mesas_grupos', 'no_agrupadas' => 'mesas_no_agrupadas', 'slots_extra' => 'mesas_grupos_slots_extra',
            'rango' => 'mesas_armado_rango_actual', 'cambios_docente' => 'mesas_docente_cambios_pendientes',
            'historial_armados' => 'historial_mesas_armados', 'historial_detalle' => 'historial_mesas_detalle',
            'historial_resultados' => 'historial_previas_resultados', 'notificaciones_lotes' => 'mesas_notificaciones_email_lotes',
            'notificaciones_items' => 'mesas_notificaciones_email_items', 'test_previas' => 'previas', default => 'mesas',
        };
        $result[$key] = pw_table_exists($pdo, $table) ? ($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    }
    return $result;
}

function pw_mesas_add_block(PDO $pdo, string $value): array
{
    $parts = array_map('trim', explode(',', $value));
    if (count($parts) !== 3) throw new RuntimeException('Formato de --mesas-add-block: id_docente,YYYY-MM-DD,id_turno');
    [$idDocente, $fecha, $idTurno] = $parts;
    if ((int)$idDocente <= 0 || (int)$idTurno <= 0 || preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) !== 1) {
        throw new RuntimeException('Bloque docente inválido.');
    }
    $idNo = 0;
    $idDisponibilidad = 0;

    // La edición valida bloqueos puntuales desde docentes_bloques_no.
    if (pw_table_exists($pdo, 'docentes_bloques_no')) {
        $stmt = $pdo->prepare('INSERT INTO docentes_bloques_no (id_docente, id_turno, fecha) VALUES (?, ?, ?)');
        $stmt->execute([(int)$idDocente, (int)$idTurno, $fecha]);
        $idNo = (int)$pdo->lastInsertId();
    }

    // El armado inicial por docente lee sus restricciones desde docentes_disponibilidad.
    if (pw_table_exists($pdo, 'docentes_disponibilidad')) {
        $diaSemana = (int)(new DateTimeImmutable($fecha))->format('N');
        $stmt = $pdo->prepare("\n            INSERT IGNORE INTO docentes_disponibilidad\n                (id_docente, dia_semana, id_turno, fecha, origen)\n            VALUES (?, ?, ?, ?, 'manual')\n        ");
        $stmt->execute([(int)$idDocente, $diaSemana, (int)$idTurno, $fecha]);
        $idDisponibilidad = (int)$pdo->lastInsertId();
    }

    if ($idNo <= 0 && $idDisponibilidad <= 0) {
        throw new RuntimeException('No existe una tabla compatible para registrar el bloqueo docente de testing.');
    }

    return [
        'id_no' => $idNo,
        'id_disponibilidad' => $idDisponibilidad,
        'id_docente' => (int)$idDocente,
        'fecha' => $fecha,
        'id_turno' => (int)$idTurno,
    ];
}

function pw_link_test_previa_mesa(PDO $tenantDb, int $idPrevia, string $prefix): array
{
    if ($idPrevia <= 0) throw new RuntimeException('id_previa inválido para vincular.');

    $stmt = $tenantDb->prepare("
        SELECT
            p.id_previa,
            p.alumno,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            c.id_catedra
        FROM previas p
        INNER JOIN catedras c
            ON c.id_materia = p.id_materia
           AND c.id_curso = p.materia_id_curso
           AND c.id_division = p.materia_id_division
           AND c.activo = 1
        WHERE p.id_previa = :id
          AND UPPER(p.alumno) LIKE UPPER(:prefijo)
        ORDER BY c.id_catedra ASC
        LIMIT 1
    ");
    $stmt->execute([':id' => $idPrevia, ':prefijo' => $prefix . '%']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        throw new RuntimeException('La previa PWTEST no existe o no tiene una cátedra activa compatible para simular un vínculo.');
    }

    $obs = $prefix . ' LINK PREVIA ' . $idPrevia;
    $insert = $tenantDb->prepare("
        INSERT INTO mesas (
            numero_mesa, prioridad, tipo_mesa, id_taller, id_catedra, id_previa,
            id_docente, fecha_mesa, id_turno, estado, observacion
        ) VALUES (
            NULL, 0, 'simple', NULL, :id_catedra, :id_previa,
            NULL, NULL, NULL, 'borrador', :observacion
        )
    ");
    $insert->execute([
        ':id_catedra' => (int)$row['id_catedra'],
        ':id_previa' => $idPrevia,
        ':observacion' => $obs,
    ]);

    return [
        'id_mesa' => (int)$tenantDb->lastInsertId(),
        'id_previa' => $idPrevia,
        'id_catedra' => (int)$row['id_catedra'],
    ];
}

function pw_restore_snapshots(PDO $tenantDb): array
{
    $snap = pw_snapshot_load();
    $restoredCatedras = 0;
    $restoredForm = false;
    $restoredPreviasInscripciones = false;
    $restoredMesas = false;

    if (is_array($snap['mesas'] ?? null)) {
        $restoredMesas = pw_restore_mesas_snapshot($tenantDb, $snap['mesas']);
    }

    foreach (($snap['catedras'] ?? []) as $idText => $data) {
        $id = (int)$idText;
        if ($id <= 0 || !is_array($data)) continue;
        $tenantDb->beginTransaction();
        try {
            if (pw_table_exists($tenantDb, 'mesas_docente_cambios_pendientes') && pw_column_exists($tenantDb, 'mesas_docente_cambios_pendientes', 'id_catedra')) {
                $st = $tenantDb->prepare('DELETE FROM mesas_docente_cambios_pendientes WHERE id_catedra = :id');
                $st->execute([':id' => $id]);
            }
            if (pw_table_exists($tenantDb, 'catedras_docentes')) {
                $st = $tenantDb->prepare('DELETE FROM catedras_docentes WHERE id_catedra = :id');
                $st->execute([':id' => $id]);
            }

            $catedra = $data['catedra'] ?? [];
            if (is_array($catedra) && array_key_exists('id_docente', $catedra)) {
                $st = $tenantDb->prepare('UPDATE catedras SET id_docente = :doc WHERE id_catedra = :id LIMIT 1');
                $doc = $catedra['id_docente'];
                $st->bindValue(':doc', $doc === null ? null : (int)$doc, $doc === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
                $st->bindValue(':id', $id, PDO::PARAM_INT);
                $st->execute();
            }

            foreach (($data['assignments'] ?? []) as $row) {
                if (is_array($row)) pw_insert_row($tenantDb, 'catedras_docentes', $row);
            }
            foreach (($data['pending'] ?? []) as $row) {
                if (is_array($row)) pw_insert_row($tenantDb, 'mesas_docente_cambios_pendientes', $row);
            }
            $tenantDb->commit();
            $restoredCatedras++;
        } catch (Throwable $e) {
            if ($tenantDb->inTransaction()) $tenantDb->rollBack();
            throw $e;
        }
    }

    if (is_array($snap['form_config'] ?? null) && pw_table_exists($tenantDb, 'mesas_config')) {
        $tenantDb->beginTransaction();
        try {
            $tenantDb->exec('DELETE FROM mesas_config');
            foreach (($snap['form_config']['rows'] ?? []) as $row) {
                if (is_array($row)) pw_insert_row($tenantDb, 'mesas_config', $row);
            }
            $tenantDb->commit();
            $restoredForm = true;
        } catch (Throwable $e) {
            if ($tenantDb->inTransaction()) $tenantDb->rollBack();
            throw $e;
        }
    }


    if (is_array($snap['previas_inscripciones'] ?? null)) {
        $data = $snap['previas_inscripciones'];
        $tenantDb->beginTransaction();
        try {
            $stPrev = $tenantDb->prepare('UPDATE previas SET inscripcion = :inscripcion WHERE id_previa = :id LIMIT 1');
            foreach (($data['previas'] ?? []) as $row) {
                if (!is_array($row)) continue;
                $stPrev->execute([
                    ':inscripcion' => (int)($row['inscripcion'] ?? 0),
                    ':id' => (int)($row['id_previa'] ?? 0),
                ]);
            }

            if (pw_table_exists($tenantDb, 'formulario_inscripciones_detalle')) {
                $tenantDb->exec('DELETE FROM formulario_inscripciones_detalle');
            }
            if (pw_table_exists($tenantDb, 'formulario_inscripciones')) {
                $tenantDb->exec('DELETE FROM formulario_inscripciones');
            }

            if (pw_table_exists($tenantDb, 'formulario_inscripciones')) {
                foreach (($data['formulario_inscripciones'] ?? []) as $row) {
                    if (is_array($row)) pw_insert_row($tenantDb, 'formulario_inscripciones', $row);
                }
            }
            if (pw_table_exists($tenantDb, 'formulario_inscripciones_detalle')) {
                foreach (($data['formulario_inscripciones_detalle'] ?? []) as $row) {
                    if (is_array($row)) pw_insert_row($tenantDb, 'formulario_inscripciones_detalle', $row);
                }
            }

            $tenantDb->commit();

            foreach (($data['auto_increment'] ?? []) as $table => $value) {
                $value = (int)$value;
                if ($value > 0 && pw_table_exists($tenantDb, (string)$table)) {
                    $tenantDb->exec('ALTER TABLE ' . pw_ident((string)$table) . ' AUTO_INCREMENT = ' . $value);
                }
            }

            $restoredPreviasInscripciones = true;
        } catch (Throwable $e) {
            if ($tenantDb->inTransaction()) $tenantDb->rollBack();
            throw $e;
        }
    }

    if (is_file(SNAPSHOT_FILE)) @unlink(SNAPSHOT_FILE);
    return [
        'catedras' => $restoredCatedras,
        'form_config' => $restoredForm,
        'previas_inscripciones' => $restoredPreviasInscripciones,
        'mesas' => $restoredMesas,
    ];
}

function pw_find_safe_catedra(PDO $tenantDb): array
{
    $sql = "
        SELECT
            cat.id_catedra,
            cat.id_docente,
            cat.id_curso,
            cu.nombre_curso,
            cat.id_division,
            divi.nombre_division,
            cat.id_materia,
            m.materia
        FROM catedras cat
        INNER JOIN curso cu ON cu.id_curso = cat.id_curso
        INNER JOIN division divi ON divi.id_division = cat.id_division
        INNER JOIN materias m ON m.id_materia = cat.id_materia
        WHERE cat.activo = 1
          AND UPPER(TRIM(cu.nombre_curso)) <> 'EGRESADO'
          AND NOT EXISTS (
              SELECT 1
              FROM mesas me
              WHERE me.id_catedra = cat.id_catedra
                AND me.numero_mesa IS NOT NULL
          )
        ORDER BY
          CASE WHEN NOT EXISTS (
              SELECT 1 FROM catedras_docentes cd WHERE cd.id_catedra = cat.id_catedra AND cd.activo = 1
          ) THEN 0 ELSE 1 END ASC,
          cat.id_catedra ASC
        LIMIT 1
    ";
    $row = $tenantDb->query($sql)->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new RuntimeException('No encontré una cátedra activa sin mesas actuales. Para probar asignaciones sin riesgo necesitás al menos una.');
    }
    return $row;
}

function pw_cleanup_master(PDO $master, int $tenantId, string $prefix, bool $cleanupPlaywrightSessions = false): array
{
    $deleted = ['sesiones' => 0, 'login_auditoria' => 0, 'password_resets' => 0, 'usuarios_master' => 0];
    $like = $prefix . '%';

    $stmt = $master->prepare('SELECT idUsuarioMaster FROM usuarios_master WHERE idTenant = :tenant AND UPPER(usuario) LIKE UPPER(:prefijo)');
    $stmt->execute([':tenant' => $tenantId, ':prefijo' => $like]);
    $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    // Las sesiones del admin usadas por storageState se conservan durante el lote.
    // Solo se eliminan en el cleanup final con --cleanup-playwright-sessions.
    if ($cleanupPlaywrightSessions && pw_table_exists($master, 'sesiones') && pw_column_exists($master, 'sesiones', 'user_agent')) {
        $st = $master->prepare('DELETE FROM sesiones WHERE user_agent LIKE :ua');
        $st->execute([':ua' => '%' . PW_USER_AGENT_MARKER . '%']);
        $deleted['sesiones'] += $st->rowCount();
    }

    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        if (pw_table_exists($master, 'password_resets')) {
            $st = $master->prepare("DELETE FROM password_resets WHERE idUsuarioMaster IN ({$ph})");
            $st->execute($ids);
            $deleted['password_resets'] += $st->rowCount();
        }
        if (pw_table_exists($master, 'sesiones')) {
            $st = $master->prepare("DELETE FROM sesiones WHERE idUsuarioMaster IN ({$ph})");
            $st->execute($ids);
            $deleted['sesiones'] += $st->rowCount();
        }
    }

    if (pw_table_exists($master, 'login_auditoria')) {
        $clauses = ['UPPER(usuario) LIKE UPPER(:prefijo)'];
        $params = [':prefijo' => $like];
        if (pw_column_exists($master, 'login_auditoria', 'user_agent')) {
            $clauses[] = 'user_agent LIKE :ua';
            $params[':ua'] = '%' . PW_USER_AGENT_MARKER . '%';
        }
        $st = $master->prepare('DELETE FROM login_auditoria WHERE ' . implode(' OR ', $clauses));
        $st->execute($params);
        $deleted['login_auditoria'] += $st->rowCount();
    }

    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $st = $master->prepare("DELETE FROM usuarios_master WHERE idUsuarioMaster IN ({$ph})");
        $st->execute($ids);
        $deleted['usuarios_master'] += $st->rowCount();
    }

    return $deleted;
}

function pw_cleanup_tenant(PDO $pdo, string $prefix): array
{
    $deleted = [
        'auditoria' => 0,
        'materias_correlativas' => 0,
        'areas_materias' => 0,
        'talleres_materias' => 0,
        'talleres' => 0,
        'materias' => 0,
        'areas' => 0,
        'catedras_docentes' => 0,
        'docentes_disponibilidad' => 0,
        'docentes_bloques_no' => 0,
        'docentes' => 0,
        'cambios_pendientes' => 0,
        'previas' => 0,
        'formulario_inscripciones' => 0,
        'formulario_inscripciones_detalle' => 0,
        'mesas_previas_test' => 0,
        'historial_previas_resultados' => 0,
    ];

    if (pw_table_exists($pdo, 'auditoria')) {
        $clauses = [];
        $params = [];
        if (pw_column_exists($pdo, 'auditoria', 'user_agent')) {
            $clauses[] = 'user_agent LIKE :ua';
            $params[':ua'] = '%' . PW_USER_AGENT_MARKER . '%';
        }
        if (pw_column_exists($pdo, 'auditoria', 'datos_request')) {
            $clauses[] = 'datos_request LIKE :prefijo';
            $params[':prefijo'] = '%' . $prefix . '%';
        }
        if ($clauses) {
            $st = $pdo->prepare('DELETE FROM auditoria WHERE ' . implode(' OR ', $clauses));
            $st->execute($params);
            $deleted['auditoria'] += $st->rowCount();
        }
    }

    $like = $prefix . '%';

    // Entidades del módulo Materias creadas por Playwright. Se eliminan por nombre
    // PWTEST y en orden de dependencias para no tocar registros reales.
    $idsTalleres = [];
    if (pw_table_exists($pdo, 'talleres') && pw_column_exists($pdo, 'talleres', 'taller')) {
        $st = $pdo->prepare('SELECT id_taller FROM talleres WHERE UPPER(taller) LIKE UPPER(:prefijo)');
        $st->execute([':prefijo' => $like]);
        $idsTalleres = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }

    if ($idsTalleres) {
        $ph = implode(',', array_fill(0, count($idsTalleres), '?'));
        if (pw_table_exists($pdo, 'talleres_materias') && pw_column_exists($pdo, 'talleres_materias', 'id_taller')) {
            $st = $pdo->prepare("DELETE FROM talleres_materias WHERE id_taller IN ({$ph})");
            $st->execute($idsTalleres);
            $deleted['talleres_materias'] += $st->rowCount();
        }
        $st = $pdo->prepare("DELETE FROM talleres WHERE id_taller IN ({$ph})");
        $st->execute($idsTalleres);
        $deleted['talleres'] += $st->rowCount();
    }

    $idsMaterias = [];
    if (pw_table_exists($pdo, 'materias') && pw_column_exists($pdo, 'materias', 'materia')) {
        $st = $pdo->prepare('SELECT id_materia FROM materias WHERE UPPER(materia) LIKE UPPER(:prefijo)');
        $st->execute([':prefijo' => $like]);
        $idsMaterias = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }

    if ($idsMaterias) {
        $ph = implode(',', array_fill(0, count($idsMaterias), '?'));

        if (pw_table_exists($pdo, 'materias_correlativas')) {
            $params = array_merge($idsMaterias, $idsMaterias);
            $st = $pdo->prepare("DELETE FROM materias_correlativas WHERE id_materia IN ({$ph}) OR id_materia_relacionada IN ({$ph})");
            $st->execute($params);
            $deleted['materias_correlativas'] += $st->rowCount();
        }

        if (pw_table_exists($pdo, 'areas_materias') && pw_column_exists($pdo, 'areas_materias', 'id_materia')) {
            $st = $pdo->prepare("DELETE FROM areas_materias WHERE id_materia IN ({$ph})");
            $st->execute($idsMaterias);
            $deleted['areas_materias'] += $st->rowCount();
        }

        if (pw_table_exists($pdo, 'talleres_materias') && pw_table_exists($pdo, 'catedras')) {
            $st = $pdo->prepare("
                DELETE tm
                FROM talleres_materias tm
                INNER JOIN catedras c ON c.id_catedra = tm.id_catedra
                WHERE c.id_materia IN ({$ph})
            ");
            $st->execute($idsMaterias);
            $deleted['talleres_materias'] += $st->rowCount();
        }

        $st = $pdo->prepare("DELETE FROM materias WHERE id_materia IN ({$ph})");
        $st->execute($idsMaterias);
        $deleted['materias'] += $st->rowCount();
    }

    $idsAreas = [];
    if (pw_table_exists($pdo, 'areas') && pw_column_exists($pdo, 'areas', 'area')) {
        $st = $pdo->prepare('SELECT id_area FROM areas WHERE UPPER(area) LIKE UPPER(:prefijo)');
        $st->execute([':prefijo' => $like]);
        $idsAreas = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }

    if ($idsAreas) {
        $ph = implode(',', array_fill(0, count($idsAreas), '?'));
        if (pw_table_exists($pdo, 'areas_materias') && pw_column_exists($pdo, 'areas_materias', 'id_area')) {
            $st = $pdo->prepare("DELETE FROM areas_materias WHERE id_area IN ({$ph})");
            $st->execute($idsAreas);
            $deleted['areas_materias'] += $st->rowCount();
        }
        $st = $pdo->prepare("DELETE FROM areas WHERE id_area IN ({$ph})");
        $st->execute($idsAreas);
        $deleted['areas'] += $st->rowCount();
    }


    // Previas creadas por Playwright: el alumno siempre comienza con PWTEST.
    // Se limpian sus dependencias antes de borrar la previa y nunca se toca una previa real.
    $idsPrevias = [];
    if (pw_table_exists($pdo, 'previas') && pw_column_exists($pdo, 'previas', 'alumno')) {
        $st = $pdo->prepare('SELECT id_previa FROM previas WHERE UPPER(alumno) LIKE UPPER(:prefijo)');
        $st->execute([':prefijo' => $like]);
        $idsPrevias = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }

    if ($idsPrevias) {
        $phPrevias = implode(',', array_fill(0, count($idsPrevias), '?'));

        if (pw_table_exists($pdo, 'formulario_inscripciones_detalle') && pw_column_exists($pdo, 'formulario_inscripciones_detalle', 'id_previa')) {
            $st = $pdo->prepare("DELETE FROM formulario_inscripciones_detalle WHERE id_previa IN ({$phPrevias})");
            $st->execute($idsPrevias);
            $deleted['formulario_inscripciones_detalle'] += $st->rowCount();
        }

        if (pw_table_exists($pdo, 'mesas') && pw_column_exists($pdo, 'mesas', 'id_previa')) {
            $st = $pdo->prepare("DELETE FROM mesas WHERE id_previa IN ({$phPrevias})");
            $st->execute($idsPrevias);
            $deleted['mesas_previas_test'] += $st->rowCount();
        }

        if (pw_table_exists($pdo, 'historial_previas_resultados') && pw_column_exists($pdo, 'historial_previas_resultados', 'id_previa_original')) {
            $st = $pdo->prepare("DELETE FROM historial_previas_resultados WHERE id_previa_original IN ({$phPrevias}) AND UPPER(alumno) LIKE UPPER(?)");
            $paramsHist = array_merge($idsPrevias, [$like]);
            $st->execute($paramsHist);
            $deleted['historial_previas_resultados'] += $st->rowCount();
        }

        $st = $pdo->prepare("DELETE FROM previas WHERE id_previa IN ({$phPrevias})");
        $st->execute($idsPrevias);
        $deleted['previas'] += $st->rowCount();
    }

    if (pw_table_exists($pdo, 'formulario_inscripciones')) {
        $clauses = [];
        $paramsForm = [];
        if (pw_column_exists($pdo, 'formulario_inscripciones', 'alumno')) {
            $clauses[] = 'UPPER(alumno) LIKE UPPER(:prefijo_alumno)';
            $paramsForm[':prefijo_alumno'] = $like;
        }
        if (pw_column_exists($pdo, 'formulario_inscripciones', 'user_agent')) {
            $clauses[] = 'user_agent LIKE :ua_form';
            $paramsForm[':ua_form'] = '%' . PW_USER_AGENT_MARKER . '%';
        }
        if ($clauses) {
            $st = $pdo->prepare('DELETE FROM formulario_inscripciones WHERE ' . implode(' OR ', $clauses));
            $st->execute($paramsForm);
            $deleted['formulario_inscripciones'] += $st->rowCount();
        }
    }

    if (!pw_table_exists($pdo, 'docentes')) return $deleted;
    $st = $pdo->prepare('SELECT id_docente FROM docentes WHERE UPPER(docente) LIKE UPPER(:prefijo)');
    $st->execute([':prefijo' => $prefix . '%']);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) return $deleted;

    $ph = implode(',', array_fill(0, count($ids), '?'));

    if (pw_table_exists($pdo, 'mesas_docente_cambios_pendientes')) {
        $columns = ['id_docente_anterior', 'id_docente_nuevo', 'id_docente_en_mesa'];
        $parts = [];
        $params = [];
        foreach ($columns as $column) {
            if (!pw_column_exists($pdo, 'mesas_docente_cambios_pendientes', $column)) continue;
            $parts[] = pw_ident($column) . " IN ({$ph})";
            array_push($params, ...$ids);
        }
        if ($parts) {
            $st = $pdo->prepare('DELETE FROM mesas_docente_cambios_pendientes WHERE ' . implode(' OR ', $parts));
            $st->execute($params);
            $deleted['cambios_pendientes'] += $st->rowCount();
        }
    }

    if (pw_table_exists($pdo, 'catedras_docentes')) {
        $st = $pdo->prepare("DELETE FROM catedras_docentes WHERE id_docente IN ({$ph})");
        $st->execute($ids);
        $deleted['catedras_docentes'] += $st->rowCount();
    }

    if (pw_table_exists($pdo, 'catedras') && pw_column_exists($pdo, 'catedras', 'id_docente')) {
        $st = $pdo->prepare("UPDATE catedras SET id_docente = NULL WHERE id_docente IN ({$ph})");
        $st->execute($ids);
    }

    foreach (['docentes_disponibilidad', 'docentes_bloques_no'] as $table) {
        if (!pw_table_exists($pdo, $table) || !pw_column_exists($pdo, $table, 'id_docente')) continue;
        $st = $pdo->prepare('DELETE FROM ' . pw_ident($table) . " WHERE id_docente IN ({$ph})");
        $st->execute($ids);
        $deleted[$table] += $st->rowCount();
    }

    // No tocamos mesas ni historial. Los docentes PWTEST jamás deberían llegar allí.
    // Si existe una FK inesperada, el DELETE falla y la suite avisa en lugar de borrar datos reales.
    $st = $pdo->prepare("DELETE FROM docentes WHERE id_docente IN ({$ph})");
    $st->execute($ids);
    $deleted['docentes'] += $st->rowCount();

    return $deleted;
}

try {
    $tenantId = max(1, (int)(pw_arg('tenant', (string)(env_value('DEFAULT_TENANT_ID', '1') ?? '1')) ?? '1'));
    $prefix = trim((string)(pw_arg('prefix', env_value('PW_TEST_PREFIX', 'PWTEST') ?? 'PWTEST') ?? 'PWTEST'));
    if ($prefix === '' || strlen($prefix) < 4) throw new RuntimeException('El prefijo de testing debe tener al menos 4 caracteres.');

    $masterHost = env_value('MASTER_DB_HOST', env_value('DB_HOST', 'localhost')) ?? 'localhost';
    pw_assert_local($masterHost, 'MASTER_DB_HOST');
    $master = master_db();
    $tenant = pw_tenant($master, $tenantId);
    pw_assert_local((string)$tenant['db_host'], 'tenant.db_host');
    $tenantDb = pdo_connect((string)$tenant['db_host'], (string)$tenant['db_name'], (string)$tenant['db_user'], (string)$tenant['db_pass']);

    if (pw_has('assert-safe')) {
        pw_output([
            'ok' => true,
            'message' => 'Entorno Playwright local verificado.',
            'tenant' => [
                'id' => $tenantId,
                'nombre' => $tenant['nombre'] ?? '',
                'db' => $tenant['db_name'],
                'host' => $tenant['db_host'],
            ],
            'master_host' => $masterHost,
        ]);
    }

    if (pw_has('find-safe-catedra')) {
        pw_output(['ok' => true, 'message' => 'Cátedra segura encontrada.', 'catedra' => pw_find_safe_catedra($tenantDb)]);
    }

    $snapshotCatedra = pw_arg('snapshot-catedra');
    if ($snapshotCatedra !== null) {
        pw_snapshot_catedra($tenantDb, (int)$snapshotCatedra);
        pw_output(['ok' => true, 'message' => 'Snapshot de cátedra guardado.', 'id_catedra' => (int)$snapshotCatedra]);
    }

    if (pw_has('snapshot-form-config')) {
        pw_snapshot_form_config($tenantDb);
        pw_output(['ok' => true, 'message' => 'Snapshot de configuración del formulario guardado.']);
    }

    if (pw_has('snapshot-previas-inscripciones')) {
        pw_snapshot_previas_inscripciones($tenantDb);
        pw_output(['ok' => true, 'message' => 'Snapshot de inscripciones de previas guardado.']);
    }

    if (pw_has('snapshot-mesas')) {
        pw_snapshot_mesas($tenantDb);
        pw_output(['ok' => true, 'message' => 'Snapshot completo de Mesas guardado.']);
    }

    if (pw_has('prepare-mesas-fixture')) {
        $fixture = pw_prepare_mesas_fixture($tenantDb, $prefix);
        pw_output(['ok' => true, 'message' => 'Fixture aislado de Mesas preparado.', 'fixture' => $fixture]);
    }

    if (pw_has('mesas-state')) {
        pw_output(['ok' => true, 'message' => 'Estado técnico de Mesas leído.', 'state' => pw_mesas_state($tenantDb)]);
    }

    $mesasBlock = pw_arg('mesas-add-block');
    if ($mesasBlock !== null) {
        $block = pw_mesas_add_block($tenantDb, $mesasBlock);
        pw_output(['ok' => true, 'message' => 'Bloque docente de testing agregado.', 'block' => $block]);
    }

    if (pw_has('disable-form-confirmation-email')) {
        $resultadoEmail = pw_disable_form_confirmation_email($tenantDb);
        pw_output(['ok' => true, 'message' => 'Email de confirmación desactivado temporalmente para Playwright.', 'resultado' => $resultadoEmail]);
    }

    $linkPreviaMesa = pw_arg('link-previa-mesa');
    if ($linkPreviaMesa !== null) {
        $vinculo = pw_link_test_previa_mesa($tenantDb, (int)$linkPreviaMesa, $prefix);
        pw_output(['ok' => true, 'message' => 'Previa PWTEST vinculada a una mesa sintética.', 'vinculo' => $vinculo]);
    }

    $restored = ['catedras' => 0, 'form_config' => false, 'previas_inscripciones' => false, 'mesas' => false];
    if (pw_has('restore-snapshots')) {
        $restored = pw_restore_snapshots($tenantDb);
    }

    $masterDeleted = [];
    $tenantDeleted = [];
    if (pw_has('cleanup')) {
        $tenantDeleted = pw_cleanup_tenant($tenantDb, $prefix);
        $masterDeleted = pw_cleanup_master($master, $tenantId, $prefix, pw_has('cleanup-playwright-sessions'));
    }

    pw_output([
        'ok' => true,
        'message' => 'Limpieza Playwright local terminada.',
        'tenant' => ['id' => $tenantId, 'db' => $tenant['db_name']],
        'restored' => $restored,
        'deleted' => ['tenant' => $tenantDeleted, 'master' => $masterDeleted],
    ]);
} catch (Throwable $e) {
    pw_output(['ok' => false, 'error' => $e->getMessage()], 1);
}
