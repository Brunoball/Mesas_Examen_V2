<?php
// backend/modules/mesas/notificaciones_email/route_notificaciones_email.php
declare(strict_types=1);

require_once __DIR__ . '/notificaciones_email_controller.php';

function route_mesas_notificaciones_email(string $action): bool
{
    switch ($action) {
        case 'mesas_notificaciones_email_listar':
        case 'mesas_notificaciones_email_obtener':
            mesas_notificaciones_listar();
            return true;

        case 'mesas_notificaciones_email_registrar_lote':
        case 'mesas_notificaciones_email_crear_lote':
            mesas_notificaciones_registrar_lote();
            return true;

        case 'mesas_notificaciones_email_registrar_envios':
        case 'mesas_notificaciones_email_procesar_lote':
            mesas_notificaciones_registrar_envios();
            return true;

        case 'mesas_notificaciones_email_estado':
            mesas_notificaciones_estado();
            return true;
    }

    return false;
}
