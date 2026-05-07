<?php
// backend/config/env.php
declare(strict_types=1);

function env_load_file(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim((string)$line);
        if ($line === '' || substr($line, 0, 1) === '#') {
            continue;
        }

        $pos = strpos($line, '=');
        if ($pos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));

        // Permite: CLAVE=valor # comentario, sin romper URLs http://
        if ($value !== '' && $value[0] !== '"' && $value[0] !== "'") {
            $hashPos = strpos($value, ' #');
            if ($hashPos !== false) {
                $value = trim(substr($value, 0, $hashPos));
            }
        }

        $value = trim($value, "\"'");

        if ($key !== '') {
            $_ENV[$key] = $value;
            putenv($key . '=' . $value);
        }
    }
}

// Carga robusta: sirve tanto con `php -S localhost:3001 -t .` desde backend,
// como si se levanta desde otra carpeta.
$possibleEnvFiles = [
    __DIR__ . '/../.env',
    getcwd() . '/.env',
    dirname(__DIR__) . '/.env',
];

foreach (array_unique($possibleEnvFiles) as $envFile) {
    env_load_file($envFile);
}

function env_value(string $key, ?string $default = null): ?string
{
    $value = $_ENV[$key] ?? getenv($key);
    return $value === false || $value === null ? $default : (string)$value;
}

function env_bool(string $key, bool $default = false): bool
{
    $value = strtolower(trim((string)env_value($key, $default ? 'true' : 'false')));
    return in_array($value, ['1', 'true', 'yes', 'on', 'si', 'sí'], true);
}
