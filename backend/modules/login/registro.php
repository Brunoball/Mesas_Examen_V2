<?php
// backend/modules/login/registro.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';

function login_registro(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $data = request_body();
    $nombre = trim((string)($data['nombre'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? '');
    $rol = strtolower(trim((string)($data['rol'] ?? '')));

    if ($nombre === '' || $contrasena === '' || $rol === '') {
        json_response(['exito' => false, 'mensaje' => 'Faltan datos.']);
    }

    if (mb_strlen($nombre) < 4 || mb_strlen($nombre) > 100) {
        json_response(['exito' => false, 'mensaje' => 'El usuario debe tener entre 4 y 100 caracteres.']);
    }

    if (strlen($contrasena) < 6) {
        json_response(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 6 caracteres.']);
    }

    if (!in_array($rol, ['vista', 'admin'], true)) {
        json_response(['exito' => false, 'mensaje' => 'Rol inválido (use "vista" o "admin").']);
    }

    try {
        $pdo = db();

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM usuarios WHERE UPPER(Nombre_Completo) = UPPER(:nombre)");
        $stmt->execute([':nombre' => $nombre]);

        if ((int)$stmt->fetchColumn() > 0) {
            json_response(['exito' => false, 'mensaje' => 'El usuario ya existe.']);
        }

        $hash = password_hash($contrasena, PASSWORD_BCRYPT);

        $stmt = $pdo->prepare("\n            INSERT INTO usuarios (Nombre_Completo, Hash_Contrasena, rol)\n            VALUES (:nombre, :hash, :rol)\n        ");
        $stmt->execute([
            ':nombre' => $nombre,
            ':hash' => $hash,
            ':rol' => $rol,
        ]);

        json_response([
            'exito' => true,
            'usuario' => [
                'idUsuario' => (int)$pdo->lastInsertId(),
                'Nombre_Completo' => $nombre,
                'rol' => $rol,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'login_registro');
        json_response(['exito' => false, 'mensaje' => 'Error del servidor.'], 500);
    }
}
