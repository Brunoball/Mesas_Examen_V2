# Frontend - Subsistema Disponibilidad Docente

Este frontend conserva el login original y agrega un único módulo principal para dirección/vicedirección:

- Seleccionar docente.
- Marcar días de lunes a viernes.
- Marcar turnos activos de la base (`turnos`).
- Guardar en `docentes_disponibilidad`.
- Limpiar disponibilidad semanal de un docente.
- Preparado visualmente para una futura carga automática por OCR + IA.

## Instalar

```bash
npm install
npm start
```

Si el backend está en otra URL, configurar:

```env
REACT_APP_API_URL=http://localhost:3001/routes
```
