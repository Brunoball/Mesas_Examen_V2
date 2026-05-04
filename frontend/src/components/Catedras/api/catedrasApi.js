import { apiGet, apiPost } from '../../_shared/api/apiClient';

const POR_PAGINA_MAXIMO = 100;

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

  asignarDocente: (idCatedra, idDocente) =>
    apiPost('catedras_asignar_docente', {
      id_catedra: idCatedra,
      id_docente: idDocente,
    }),
};
