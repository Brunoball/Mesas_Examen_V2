# Roles admin y vista — Playwright

Ejecutar desde la carpeta `frontend`:

```powershell
.\tests\run-module.cmd roles
```

El módulo `login` también incluye estas pruebas:

```powershell
.\tests\run-module.cmd login
```

## Cobertura

- Login API y visual con verificación exacta de `admin` y `vista`.
- Lista positiva completa del backend para `vista`, exclusivamente por GET.
- Bloqueo 403 de endpoints de Docentes, Cátedras, Materias, Configuración y acciones administrativas de Previas/Mesas.
- Menú lateral de `vista`: solamente Dashboard, Mesas, Previas y Estadísticas.
- Botón Configuración oculto y rutas administrativas directas redirigidas a `/panel`.
- Previas en solo lectura: listado, búsqueda, filtros e impresión de permiso; sin alta, edición, bajas, eliminación, inscripción, importación ni exportación.
- Mesas en solo lectura: grupos, no agrupadas, historial, búsqueda y filtros; sin armado, edición, eliminación, notas, notificaciones ni exportación.
- Control adicional que falla si la navegación de `vista` dispara una llamada HTTP mutante.
- Confirmación de que `admin` conserva el menú completo y no queda bloqueado por el control de rol.

## Credenciales de vista

En `.env.test`, `PW_VISTA_USER` y `PW_VISTA_PASSWORD` son opcionales. Si ambos
quedan vacíos, la suite crea un usuario `vista` temporal con prefijo `PWTEST` y
lo elimina mediante la limpieza normal. Si se define uno, deben definirse ambos.

