// src/components/Configuracion/Formulario/api/configuracionFormularioApi.js
import { apiGet, apiPost } from "../../../_shared/api/apiClient";

export const configuracionFormularioApi = {
  // Acción privada para el panel interno: usa la sesión y la DB del tenant logueado.
  // El formulario público sigue usando form_obtener_config_inscripcion.
  obtener: () => apiGet("form_admin_obtener_config_inscripcion"),

  // Puede recibir JSON o FormData. apiClient detecta FormData y no fuerza Content-Type,
  // así el navegador envía correctamente el boundary para subir logo/fondo.
  guardar: (payload) => apiPost("form_guardar_config_inscripcion", payload, { auth: true }),
};

export const obtenerConfiguracionFormulario = configuracionFormularioApi.obtener;
export const guardarConfiguracionFormulario = configuracionFormularioApi.guardar;
