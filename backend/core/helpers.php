<?php
// backend/core/helpers.php
declare(strict_types=1);

function json_response(array $data, int $status = 200): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }

    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function log_error(Throwable $e, string $contexto = ''): void
{
    $logDir = __DIR__ . '/../logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }

    $linea = date('Y-m-d H:i:s') . " [{$contexto}] " . $e->getMessage()
        . ' en ' . $e->getFile() . ':' . $e->getLine() . PHP_EOL;

    error_log($linea, 3, $logDir . '/app.log');
}

function request_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode((string)$raw, true);

    if (is_array($data)) {
        return $data;
    }

    return $_POST ?: [];
}

function get_json_body(): array
{
    return request_body();
}

function paginacion(): array
{
    $pagina = max(1, (int)($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(1, (int)($_GET['por_pagina'] ?? 20)));
    $offset = ($pagina - 1) * $porPagina;

    return [
        'pagina' => $pagina,
        'por_pagina' => $porPagina,
        'offset' => $offset,
    ];
}

function normalizar_mayuscula(?string $texto): string
{
    $texto = trim((string)$texto);
    return $texto === '' ? '' : mb_strtoupper($texto, 'UTF-8');
}
