import { apiPost } from '../../_shared/api/apiClient';

export const loginApi = {
  iniciarSesion: ({ nombre, contrasena }) =>
    apiPost('inicio', { nombre, contrasena }),

  registrar: ({ nombre, contrasena, rol }) =>
    apiPost('registro', { nombre, contrasena, rol }),
};
