<?php
// backend/modules/formulario/obtener_config_inscripcion.php
// Compatibilidad para accesos directos viejos. La lógica real vive en formulario_controller.php.
declare(strict_types=1);

require_once __DIR__ . '/formulario_controller.php';

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    form_obtener_config_inscripcion();
}
