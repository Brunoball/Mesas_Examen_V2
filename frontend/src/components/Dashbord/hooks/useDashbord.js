// src/components/Dashbord/hooks/useDashbord.js
import { useCallback, useEffect, useState } from "react";
import { obtenerResumenDashbord } from "../api/dashbordApi";

export function useDashbord() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await obtenerResumenDashbord();

      if (!res?.exito) {
        throw new Error(res?.mensaje || "No se pudo obtener el dashboard.");
      }

      setData(res.data || null);
    } catch (err) {
      setError(err?.data?.mensaje || err?.message || "No se pudo obtener el dashboard.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return {
    data,
    loading,
    error,
    recargar: cargar,
  };
}
