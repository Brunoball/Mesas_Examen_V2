// src/components/Mesas_examen/api/mesasExamenApi.js
// IMPORTANTE: este módulo debe usar el apiClient global.
// Antes hacía fetch directo y no enviaba Authorization / X-Session, por eso el backend respondía 401.

import { apiGet, apiPost } from "../../_shared/api/apiClient";

export const listarMesasExamen = ({ pagina = 1, porPagina = 100, busqueda = "" } = {}) => {
  return apiGet("mesas_examen_listar", {
    pagina,
    por_pagina: porPagina,
    busqueda,
  });
};

export const listarMesasGruposFinales = ({ busqueda = "" } = {}) => {
  return apiGet("mesas_grupos_listar", { busqueda });
};

export const listarMesasNoAgrupadas = ({ busqueda = "" } = {}) => {
  return apiGet("mesas_no_agrupadas_listar", { busqueda });
};

export const obtenerParametrosArmadoMesas = () => {
  return apiGet("mesas_armado_parametros");
};

export const crearArmadoInicialMesas = ({
  fecha_inicio,
  fecha_fin,
  limpiar_borrador = true,
  excluir_fines_semana = true,
  tipo_armado = "area",
}) => {
  const action = tipo_armado === "docentes"
    ? "mesas_armado_crear_docentes"
    : "mesas_armado_crear";

  return apiPost(action, {
    fecha_inicio,
    fecha_fin,
    limpiar_borrador,
    excluir_fines_semana,
    tipo_armado,
  });
};

export const crearGruposFinalesMesas = ({
  limpiar_grupos = true,
  min_numeros = 2,
  max_numeros = 4,
  confirmar_grupos = false,
  tipo_armado = "area",
} = {}) => {
  const action = tipo_armado === "docentes"
    ? "mesas_armado_grupos_finales_docentes"
    : "mesas_armado_grupos_finales";

  return apiPost(action, {
    limpiar_grupos,
    min_numeros,
    max_numeros,
    confirmar_grupos,
    tipo_armado,
  });
};

export const eliminarBorradorMesas = () => {
  return apiPost("mesas_armado_eliminar_borrador", {});
};
