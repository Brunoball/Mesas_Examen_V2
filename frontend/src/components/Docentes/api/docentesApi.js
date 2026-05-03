import { apiGet, apiPost } from '../../_shared/api/apiClient.js';

const POR_PAGINA_MAXIMO = 100;
const LIMITE_PAGINAS_SEGURIDAD = 100;

export const docentesApi = {
  catalogos: () => apiGet('docentes_catalogos'),

  listar: (pagina = 1, porPagina = POR_PAGINA_MAXIMO, filtros = {}) =>
    apiGet('docentes_listar', {
      pagina,
      por_pagina: porPagina,
      ...filtros,
    }),

  async listarTodos(activo = 1) {
    let pagina = 1;
    let docentes = [];
    let totalPaginas = 1;

    do {
      const res = await docentesApi.listar(pagina, POR_PAGINA_MAXIMO, { activo });
      const data = Array.isArray(res.data) ? res.data : [];

      docentes = docentes.concat(data);

      const paginasBackend = Number(
        res?.paginacion?.paginas ||
        res?.paginacion?.total_paginas ||
        res?.paginacion?.totalPaginas ||
        1
      );

      totalPaginas = Number.isFinite(paginasBackend) && paginasBackend > 0
        ? paginasBackend
        : 1;

      if (data.length === 0) break;

      pagina += 1;
    } while (pagina <= totalPaginas && pagina <= LIMITE_PAGINAS_SEGURIDAD);

    return {
      exito: true,
      data: docentes,
      paginacion: {
        pagina: 1,
        por_pagina: docentes.length,
        total: docentes.length,
        paginas: 1,
      },
    };
  },

  obtener: (idDocente) =>
    apiGet('docentes_obtener', { id_docente: idDocente }),

  guardar: (payload) =>
    apiPost('docentes_guardar', payload),

  cambiarEstado: (idsDocentes, activo, motivo = '') =>
    apiPost('docentes_cambiar_estado', {
      ids_docentes: Array.isArray(idsDocentes) ? idsDocentes : [idsDocentes],
      activo,
      motivo,
    }),

  eliminar: (idsDocentes) =>
    apiPost('docentes_eliminar', {
      ids_docentes: Array.isArray(idsDocentes) ? idsDocentes : [idsDocentes],
    }),
};
