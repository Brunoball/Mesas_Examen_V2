# Mesas de examen — cobertura Final Boss

Ejecutar desde la carpeta `frontend`:

```powershell
.\tests\run-module.cmd mesas
```

La suite completa ejecuta **50 pruebas** con un solo worker. Las 22 pruebas de
`13-mesas-edicion-profunda.spec.js` repiten la misma matriz para los dos criterios
reales del sistema: **armado por área** y **armado por docentes**.

## Qué comprueba la edición profunda

| Operación | Caso permitido | Caso bloqueado / seguridad | Persistencia verificada |
|---|---|---|---|
| Fecha, turno y hora | Mueve el grupo completo a otro slot validado | Rechaza slots no válidos y bloqueos exactos de cualquiera de sus docentes | `mesas_grupos` y todas las filas de `mesas` quedan sincronizadas |
| Choques cruzados | Mantiene el orden válido | Impide mismo alumno/DNI, correlativas superpuestas y disponibilidad docente | Un HTTP 422 no cambia fecha, turno, hora ni filas |
| Número dentro de grupo | Quita, reubica y vuelve a agregar sólo en destinos compatibles | No ofrece grupos sin capacidad o incompatibles | El número aparece una sola vez y desaparece del origen |
| Mesa no agrupada | Puede reprogramarse y abrir un día nuevo; luego convertirse en mesa única | Sigue usando la matriz de choques antes de guardar | Conserva todos los `id_mesa` y personas del número |
| Crear número | Convierte una previa sin mesa en un número nuevo | La lista previa ya viene filtrada por capacidad y conflictos | Crea una única fila de grupo y programa la previa |
| Mover alumno/previa | Valida y mueve a un número autorizado | Rechaza mover al mismo origen o a un destino con choque | La previa queda sólo en el número destino |
| Mover número completo | Lista únicamente grupos con slots libres y validación positiva | Rechaza por API un grupo taller exclusivo aunque se intente saltear la UI | El fallo deja intacta la ubicación de todos los números |
| Regla área/docentes | Área impide cruces de área; docentes permite un cruce si pasó docentes, alumnos, correlativas y capacidad | Un destino descartado tampoco puede forzarse llamando directo a la API | El cruce docente autorizado queda en un solo grupo |
| Eliminar | Un grupo pasa sus números a no agrupadas | Al eliminar una no agrupada borra sólo ese número | Los demás grupos, mesas y personas permanecen |
| Interfaz visual | Expone acciones de ver, agregar, mover y quitar por cada número | Deshabilita turnos no autorizados | El modal “Mover número” muestra exactamente los destinos devueltos por el backend |

## Resto de la suite de Mesas

- `08`: contratos del armado, elegibilidad, área, docentes, talleres,
  correlativas, modos mañana/tarde/combinado y armado parcial observado.
- `09`: edición base, bloqueos, números no agrupados, mesa única, slots extra e
  idempotencia al mover números.
- `10`: alumnos/previas, agregar/quitar, movimientos, notas, ausente y talleres.
- `11`: cierre con/sin historial, limpieza, email seguro y cambios docentes.
- `12`: creación y navegación visual, filtros, búsqueda, historial y eliminación.
- `13-mesas-contratos`: protege routers, acciones y aliases backend/frontend.

Cada prueba prepara datos `PWTEST`, toma snapshots y ejecuta limpieza/restauración
al finalizar. No usa alumnos reales como fixture y no envía correos.

## Revisión después de la primera corrida de 50 pruebas

La primera ejecución obtuvo 45 aprobadas y permitió ajustar cinco supuestos del
spec profundo sin cambiar código productivo: la hora inválida devuelve 422 desde
la validación, una correlativa puede quedar no agrupada, un área distinta debe
buscarse entre grupos reales y una previa retirada debe agregarse al grupo que el
backend determine compatible según el criterio del armado.
