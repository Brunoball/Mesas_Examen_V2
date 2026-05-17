// src/components/Mesas_examen/api/mesasExamenApi.js
// IMPORTANTE: este módulo debe usar el apiClient global.
// Antes hacía fetch directo y no enviaba Authorization / X-Session, por eso el backend respondía 401.

import { apiGet, apiPost } from "../../_shared/api/apiClient";

const limpiarParams = (params = {}) => {
  const limpio = {};

  Object.entries(params).forEach(([clave, valor]) => {
    if (valor === undefined || valor === null || valor === "" || valor === "undefined" || valor === "null") {
      return;
    }

    limpio[clave] = valor;
  });

  return limpio;
};

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

export const obtenerMesaEdicion = ({ tipo = "grupo", id_grupo, numero_grupo, id_no_agrupada, numero_mesa } = {}) => {
  return apiGet("mesas_editar_obtener", {
    tipo,
    id_grupo,
    numero_grupo,
    id_no_agrupada,
    numero_mesa,
  });
};

export const guardarProgramacionMesa = ({
  tipo = "grupo",
  id_grupo,
  numero_grupo,
  id_no_agrupada,
  numero_mesa,
  fecha_mesa,
  id_turno,
  hora,
} = {}) => {
  return apiPost("mesas_editar_guardar_programacion", {
    tipo,
    id_grupo,
    numero_grupo,
    id_no_agrupada,
    numero_mesa,
    fecha_mesa,
    id_turno,
    hora,
  });
};

export const eliminarMesaEdicion = ({ tipo = "grupo", id_grupo, numero_grupo, id_no_agrupada, numero_mesa } = {}) => {
  return apiPost("mesas_editar_eliminar", {
    tipo,
    id_grupo,
    numero_grupo,
    id_no_agrupada,
    numero_mesa,
  });
};

export const validarProgramacionMesa = ({
  tipo = "grupo",
  id_grupo,
  numero_grupo,
  id_no_agrupada,
  numero_mesa,
  fecha_mesa,
  id_turno,
  hora,
} = {}) => {
  return apiPost("mesas_editar_validar_programacion", {
    tipo,
    id_grupo,
    numero_grupo,
    id_no_agrupada,
    numero_mesa,
    fecha_mesa,
    id_turno,
    hora,
  });
};

export const obtenerSlotsValidosMesa = ({
  tipo = "grupo",
  id_grupo,
  numero_grupo,
  id_no_agrupada,
  numero_mesa,
  anio,
  mes,
  fecha_inicio,
  fecha_fin,
} = {}) => {
  return apiGet("mesas_editar_slots_validos", limpiarParams({
    tipo,
    id_grupo,
    numero_grupo,
    id_no_agrupada,
    numero_mesa,
    anio,
    mes,
    fecha_inicio,
    fecha_fin,
  }));
};

export const obtenerPreviasNumeroMesa = ({ numero_mesa } = {}) => {
  return apiGet("mesas_editar_persona_previas_numero", limpiarParams({ numero_mesa }));
};

export const obtenerDestinosMoverPrevia = ({ numero_mesa, id_previa } = {}) => {
  return apiGet("mesas_editar_persona_destinos_mover", limpiarParams({ numero_mesa, id_previa }));
};

export const moverPreviaMesa = ({ numero_origen, numero_mesa, id_previa, numero_destino } = {}) => {
  return apiPost("mesas_editar_persona_mover", {
    numero_origen,
    numero_mesa,
    id_previa,
    numero_destino,
  });
};

export const eliminarPreviaMesa = ({ numero_mesa, id_previa } = {}) => {
  return apiPost("mesas_editar_persona_eliminar", {
    numero_mesa,
    id_previa,
  });
};

