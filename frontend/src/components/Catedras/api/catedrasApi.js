import { apiGet, apiPost } from '../../_shared/api/apiClient';

export const catedrasApi = {
  catalogos: () => apiGet('catedras_catalogos'),

  listar: (pagina = 1, porPagina = 20, filtros = {}) =>
    apiGet('catedras_listar', {
      pagina,
      por_pagina: porPagina,
      ...filtros,
    }),

  asignarDocente: (idCatedra, idDocente) =>
    apiPost('catedras_asignar_docente', {
      id_catedra: idCatedra,
      id_docente: idDocente,
    }),
};
