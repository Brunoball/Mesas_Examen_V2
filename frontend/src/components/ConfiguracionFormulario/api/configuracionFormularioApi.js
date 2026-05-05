// src/components/ConfiguracionFormulario/api/configuracionFormularioApi.js
import { apiGet, apiPost } from "../../_shared/api/apiClient";

export const configuracionFormularioApi = {
  obtener: () => apiGet("form_obtener_config_inscripcion"),

  guardar: (payload) => apiPost("form_guardar_config_inscripcion", payload, { auth: true }),
};

export const obtenerConfiguracionFormulario = configuracionFormularioApi.obtener;
export const guardarConfiguracionFormulario = configuracionFormularioApi.guardar;
