import { apiGet, apiPost } from '../../_shared/api/apiClient.js';

const POR_PAGINA_MAXIMO = 300;

export const disponibilidadDocentesApi = {
  catalogos: () => apiGet('disponibilidad_docentes_catalogos'),

  listar: (filtros = {}, pagina = 1, porPagina = POR_PAGINA_MAXIMO) =>
    apiGet('disponibilidad_docentes_listar', {
      pagina,
      por_pagina: porPagina,
      ...filtros,
    }),

  obtenerDocente: (idDocente) =>
    apiGet('disponibilidad_docentes_obtener_docente', { id_docente: idDocente }),

  guardarMatriz: ({ id_docente, disponibilidades }) =>
    apiPost('disponibilidad_docentes_guardar_matriz', {
      id_docente,
      disponibilidades,
    }),

  guardarRegistro: (payload) =>
    apiPost('disponibilidad_docentes_guardar', payload),

  eliminar: (idsDisponibilidad) =>
    apiPost('disponibilidad_docentes_eliminar', {
      ids_disponibilidad: Array.isArray(idsDisponibilidad) ? idsDisponibilidad : [idsDisponibilidad],
    }),

  limpiarDocente: (idDocente) =>
    apiPost('disponibilidad_docentes_limpiar_docente', { id_docente: idDocente }),
};
