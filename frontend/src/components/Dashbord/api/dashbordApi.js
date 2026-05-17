// src/components/Dashbord/api/dashbordApi.js
import { apiGet } from "../../_shared/api/apiClient";

export const obtenerResumenDashbord = () => {
  return apiGet("dashbord_resumen");
};
