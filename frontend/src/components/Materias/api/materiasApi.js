import { apiGet, apiPost } from '../../_shared/api/apiClient';

export const materiasApi = {
  catalogos: () => apiGet('materias_catalogos'),
  listar: () => apiGet('materias_listar'),

  // Global reutilizable: obtiene las materias reales de un curso desde cátedras.
  // No depende del módulo Materias; lo van a poder usar talleres, correlativas,
  // previas, inscripciones y armado de mesas.
  porCurso: (idCurso, idDivision = null) => {
    const params = { id_curso: idCurso };
    if (idDivision) params.id_division = idDivision;
    return apiGet('global_obtener_materias_por_curso', params);
  },

  guardar: (payload) => apiPost('materias_guardar', payload),
  eliminar: (idMateria) => apiPost('materias_eliminar', { id_materia: idMateria }),
  cambiarEstado: (idMateria, activo) => apiPost('materias_cambiar_estado', { id_materia: idMateria, activo }),

  correlativasListar: () => apiGet('materias_correlativas_listar'),
  correlativaGuardar: (payload) => apiPost('materias_correlativas_guardar', payload),
  correlativaGuardarMasivo: (payload) => apiPost('materias_correlativas_guardar_masivo', payload),
  correlativaAutoPorMateria: (payload) => apiPost('materias_correlativas_autogenerar_por_materia', payload),
  correlativaEliminar: (idMateriaCorrelativa) =>
    apiPost('materias_correlativas_eliminar', { id_materia_correlativa: idMateriaCorrelativa }),

  talleresListar: () => apiGet('talleres_listar'),
  talleresCatedrasPorCursoDivisiones: (idCurso, divisiones = []) => {
    const ids = Array.isArray(divisiones) ? divisiones.filter(Boolean).join(',') : divisiones;
    return apiGet('talleres_catedras_por_curso_divisiones', {
      id_curso: idCurso,
      divisiones: ids,
    });
  },
  tallerGuardar: (payload) => apiPost('talleres_guardar', payload),
  tallerEliminar: (idTaller) => apiPost('talleres_eliminar', { id_taller: idTaller }),
  tallerMateriaAgregar: (payload) => apiPost('talleres_materia_agregar', payload),
  tallerMateriaEliminar: (payload) => apiPost('talleres_materia_eliminar', payload),

  areasListar: () => apiGet('areas_listar'),
  areaGuardar: (payload) => apiPost('areas_guardar', payload),
  areaEliminar: (idArea) => apiPost('areas_eliminar', { id_area: idArea }),
};
