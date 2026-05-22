import { apiGet } from '../../_shared/api/apiClient';

export const perfilApi = {
  obtener: () => apiGet('perfil_obtener'),
};
