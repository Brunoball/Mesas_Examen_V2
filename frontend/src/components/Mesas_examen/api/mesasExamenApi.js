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
  modo_turnos = "combinado",
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
    modo_turnos,
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

export const eliminarBorradorMesas = ({ guardar_historial = true } = {}) => {
  return apiPost("mesas_armado_eliminar_mesas", {
    guardar_historial: guardar_historial ? 1 : 0,
  });
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

export const crearGrupoUnicoNoAgrupada = ({
  id_no_agrupada,
  numero_mesa,
  fecha_mesa,
  id_turno,
  hora,
} = {}) => {
  return apiPost("mesas_editar_no_agrupada_crear_grupo_unico", {
    tipo: "no_agrupada",
    id_no_agrupada,
    numero_mesa,
    fecha_mesa,
    id_turno,
    hora,
  });
};

export const eliminarMesaEdicion = ({ tipo = "grupo", id_grupo, numero_grupo, id_no_agrupada, numero_mesa } = {}) => {
  return apiPost("mesas_editar_eliminar_grupo", {
    tipo,
    id_grupo,
    numero_grupo,
    id_no_agrupada,
    numero_mesa,
  });
};

export const eliminarNumeroGrupoEdicion = ({ numero_grupo, id_grupo, numero_mesa } = {}) => {
  return apiPost("mesas_editar_eliminar_numero_grupo", {
    modo: "numero_grupo",
    numero_grupo: numero_grupo || id_grupo,
    id_grupo: id_grupo || numero_grupo,
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

export const obtenerDestinosMoverPrevia = ({ numero_mesa, numero_origen, id_previa } = {}) => {
  return apiGet("mesas_editar_persona_destinos_mover", limpiarParams({
    numero_mesa,
    numero_origen,
    id_previa,
  }));
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

export const obtenerPreviasDisponiblesMas = ({ numero_mesa } = {}) => {
  return apiGet("mesas_editar_mas_previas_disponibles", limpiarParams({ numero_mesa }));
};

export const agregarPreviaMas = ({ numero_mesa, id_previa, id_previas } = {}) => {
  const payload = { numero_mesa };

  if (Array.isArray(id_previas) && id_previas.length > 0) {
    payload.id_previas = id_previas;
  } else {
    payload.id_previa = id_previa;
  }

  return apiPost("mesas_editar_mas_agregar", payload);
};

export const obtenerDestinosMoverNumero = ({ numero_mesa } = {}) => {
  return apiGet("mesas_editar_flechas_destinos", limpiarParams({ numero_mesa }));
};

export const moverNumeroMesaGrupo = ({ numero_mesa, numero_grupo_destino } = {}) => {
  return apiPost("mesas_editar_flechas_mover", {
    numero_mesa,
    numero_grupo_destino,
  });
};

export const obtenerOpcionesAgregarNumeroGrupo = ({ numero_grupo, id_grupo } = {}) => {
  return apiGet("mesas_editar_agregar_numero_opciones", limpiarParams({
    numero_grupo: numero_grupo || id_grupo,
    id_grupo: id_grupo || numero_grupo,
  }));
};

export const confirmarAgregarNumeroGrupo = ({ numero_grupo, id_grupo, tipo = "no_agrupada", numero_mesa, id_previa } = {}) => {
  return apiPost("mesas_editar_agregar_numero_confirmar", {
    numero_grupo: numero_grupo || id_grupo,
    id_grupo: id_grupo || numero_grupo,
    tipo,
    numero_mesa,
    id_previa,
  });
};

export const habilitarSlotExtraGrupo = ({ numero_grupo, id_grupo } = {}) => {
  return apiPost("mesas_editar_habilitar_slot_extra", {
    numero_grupo: numero_grupo || id_grupo,
    id_grupo: id_grupo || numero_grupo,
  });
};


export const eliminarSlotExtraGrupo = ({ numero_grupo, id_grupo } = {}) => {
  return apiPost("mesas_editar_eliminar_slot_extra", {
    numero_grupo: numero_grupo || id_grupo,
    id_grupo: id_grupo || numero_grupo,
  });
};


export const guardarNotaPreviaMesa = ({ id_previa, id_mesa, numero_mesa, nota } = {}) => {
  return apiPost("mesas_resultado_guardar_nota", {
    id_previa,
    id_mesa,
    numero_mesa,
    nota,
  });
};


export const listarHistorialMesas = ({ busqueda = "", limite_resultados = 250, limite_armados = 60 } = {}) => {
  return apiGet("mesas_historial_listar", limpiarParams({
    busqueda,
    limite_resultados,
    limite_armados,
  }));
};

export const obtenerDetalleHistorialArmado = ({ id_armado_historial } = {}) => {
  return apiGet("mesas_historial_detalle_armado", limpiarParams({
    id_armado_historial,
  }));
};

export const obtenerExportacionHistorialMesas = ({ busqueda = "", limite_armados = 1000 } = {}) => {
  return apiGet("mesas_historial_exportar", limpiarParams({
    busqueda,
    limite_armados,
  }));
};

export const eliminarTodosHistorialesMesas = () => {
  return apiPost("mesas_historial_eliminar_todos", {});
};


export const listarCambiosDocenteMesasPendientes = () => {
  return apiGet("mesas_docentes_cambios_pendientes");
};

export const aplicarCambioDocenteMesa = ({ id_cambio } = {}) => {
  return apiPost("mesas_docentes_cambios_aplicar", { id_cambio });
};

export const ignorarCambioDocenteMesa = ({ id_cambio } = {}) => {
  return apiPost("mesas_docentes_cambios_ignorar", { id_cambio });
};

export const obtenerPerfilInstitucional = () => {
  return apiGet("perfil_obtener");
};

export const obtenerLogoInstitucionalMesas = () => {
  return apiGet("perfil_logo_institucional");
};

export const listarNotificacionesEmailMesas = () => {
  return apiGet("mesas_notificaciones_email_listar");
};

export const crearLoteNotificacionesEmailMesas = ({ reenviar = false, asunto = "" } = {}) => {
  return apiPost("mesas_notificaciones_email_registrar_lote", {
    reenviar: reenviar ? 1 : 0,
    asunto,
  });
};

export const procesarLoteNotificacionesEmailMesas = ({ id_lote, limite = 20 } = {}) => {
  return apiPost("mesas_notificaciones_email_registrar_envios", limpiarParams({
    id_lote,
    limite,
  }));
};

export const obtenerEstadoLoteNotificacionesEmailMesas = ({ id_lote } = {}) => {
  return apiGet("mesas_notificaciones_email_estado", limpiarParams({ id_lote }));
};
