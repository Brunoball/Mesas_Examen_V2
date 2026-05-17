<?php
// backend/modules/dashbord/route.php
declare(strict_types=1);

require_once __DIR__ . '/dashbord_controller.php';

function route_dashbord(string $action): bool
{
    switch ($action) {
        case 'dashbord_resumen':
        case 'dashboard_resumen':
            dashbord_resumen();
            return true;

        default:
            return false;
    }
}
