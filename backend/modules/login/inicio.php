<?php
// backend/modules/login/inicio.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../../core/helpers.php';
require_once __DIR__ . '/../../core/auth.php';
require_once __DIR__ . '/../../core/csrf.php';

function login_inicio(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
    }

    $data = request_body();
    $nombre = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');

    if ($nombre === '' || $contrasena === '') {
        json_response(['exito' => false, 'mensaje' => 'Faltan datos.'], 200);
    }

    try {
        $pdo = db();

        $stmt = $pdo->prepare("\n            SELECT\n                idUsuario,\n                Nombre_Completo,\n                Hash_Contrasena,\n                LOWER(rol) AS rol\n            FROM usuarios\n            WHERE LOWER(Nombre_Completo) = LOWER(:nombre)\n            LIMIT 1\n        ");
        $stmt->execute([':nombre' => $nombre]);
        $usuario = $stmt->fetch();

        if (!$usuario) {
            json_response(['exito' => false, 'mensaje' => 'Credenciales incorrectas.'], 200);
        }

        $hashGuardado = trim((string)$usuario['Hash_Contrasena']);
        $loginOk = false;

        if ($hashGuardado !== '' && hash_equals($hashGuardado, $contrasena)) {
            $loginOk = true;
        }

        if (!$loginOk && $hashGuardado !== '' && password_verify($contrasena, $hashGuardado)) {
            $loginOk = true;
        }

        if (!$loginOk) {
            json_response(['exito' => false, 'mensaje' => 'Credenciales incorrectas.'], 200);
        }

        $rol = strtolower((string)($usuario['rol'] ?? 'vista'));
        if (!in_array($rol, ['admin', 'vista'], true)) {
            $rol = 'vista';
        }

        iniciar_sesion_si_falta();
        $_SESSION['usuario_id'] = (int)$usuario['idUsuario'];
        $_SESSION['usuario_nombre'] = (string)$usuario['Nombre_Completo'];
        $_SESSION['usuario_rol'] = $rol;

        json_response([
            'exito' => true,
            'csrf_token' => csrf_token(),
            'usuario' => [
                'idUsuario' => (int)$usuario['idUsuario'],
                'Nombre_Completo' => (string)$usuario['Nombre_Completo'],
                'rol' => $rol,
            ],
        ]);
    } catch (Throwable $e) {
        log_error($e, 'login_inicio');
        json_response(['exito' => false, 'mensaje' => 'Error del servidor.'], 500);
    }
}
