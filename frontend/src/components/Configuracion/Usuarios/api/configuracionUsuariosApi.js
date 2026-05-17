// src/components/Configuracion/Usuarios/api/configuracionUsuariosApi.js
import { apiGet, apiPost } from '../../../_shared/api/apiClient';

export const configuracionUsuariosApi = {
  listar: (filtros = {}) => apiGet('configuracion_usuarios_listar', filtros),

  obtener: (idUsuario) => apiGet('configuracion_usuarios_obtener', { id_usuario: idUsuario }),

  guardar: (payload) => apiPost('configuracion_usuarios_guardar', payload),

  cambiarEstado: (idUsuario, activo) => apiPost('configuracion_usuarios_cambiar_estado', {
    id_usuario: idUsuario,
    activo,
  }),

  darAlta: (idUsuario) => apiPost('configuracion_usuarios_alta', { id_usuario: idUsuario }),

  darBaja: (idUsuario) => apiPost('configuracion_usuarios_baja', { id_usuario: idUsuario }),

  eliminar: (idUsuario) => apiPost('configuracion_usuarios_eliminar', { id_usuario: idUsuario }),
};
