import { apiPost } from '../../_shared/api/apiClient';

export const loginApi = {
  iniciarSesion: ({ nombre, contrasena }) =>
    apiPost('inicio', { nombre, contrasena }),

  registrar: ({ nombre, contrasena, rol }) =>
    apiPost('registro', { nombre, contrasena, rol }),

  solicitarRecuperacion: ({ usuario }) =>
    apiPost('recuperar_contrasena_solicitar', { usuario }),

  validarTokenRecuperacion: ({ token }) =>
    apiPost('recuperar_contrasena_validar', { token }),

  guardarNuevaContrasena: ({ token, contrasena, confirmarContrasena }) =>
    apiPost('recuperar_contrasena_guardar', {
      token,
      contrasena,
      confirmarContrasena,
    }),
};
