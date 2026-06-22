import { apiGet, apiPost } from '../../_shared/api/apiClient';

const POR_PAGINA_MAXIMO = 100;
const LIMITE_PAGINAS_SEGURIDAD = 150;

function limpiarFiltros(filtros = {}) {
  const result = {};

  Object.entries(filtros || {}).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      result[key] = value;
    }
  });

  return result;
}

export const catedrasApi = {
  catalogos: () => apiGet('catedras_catalogos'),

  listar: (pagina = 1, porPagina = POR_PAGINA_MAXIMO, filtros = {}) =>
    apiGet('catedras_listar', limpiarFiltros({
      pagina,
      por_pagina: Math.min(POR_PAGINA_MAXIMO, Number(porPagina || POR_PAGINA_MAXIMO)),
      ...filtros,
    })),

  async listarTodos(filtros = {}) {
    let pagina = 1;
    let catedras = [];
    let totalPaginas = 1;

    do {
      const res = await catedrasApi.listar(pagina, POR_PAGINA_MAXIMO, filtros);
      const data = Array.isArray(res.data) ? res.data : [];
      catedras = catedras.concat(data);

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
      data: catedras,
      paginacion: {
        pagina: 1,
        por_pagina: catedras.length,
        total: catedras.length,
        paginas: 1,
      },
    };
  },

  asignarDocente: (idCatedra, docentes = []) => {
    const docentesPayload = Array.isArray(docentes)
      ? docentes.map((asignacion) => ({
        id_docente: Number(asignacion.id_docente || 0),
        id_cargo: Number(asignacion.id_cargo || 0),
        llamado_mesa: Boolean(asignacion.llamado_mesa),
      }))
      : [];

    return apiPost('catedras_asignar_docente', {
      id_catedra: idCatedra,
      docentes: docentesPayload,
    });
  },
};
