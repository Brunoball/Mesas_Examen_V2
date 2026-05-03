// src/components/Mesas_examen/hooks/useMesasExamen.js
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crearArmadoInicialMesas,
  eliminarBorradorMesas,
  listarMesasExamen,
  obtenerParametrosArmadoMesas,
} from "../api/mesasExamenApi";

export const useMesasExamen = () => {
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState("contador");

  const [mesas, setMesas] = useState([]);
  const [paginacion, setPaginacion] = useState(null);

  const [parametrosArmado, setParametrosArmado] = useState(null);
  const [resumenArmado, setResumenArmado] = useState(null);

  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);

  const [cargando, setCargando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState("");

  const cargarMesas = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const response = await listarMesasExamen({
        pagina: 1,
        porPagina: 100,
        busqueda: "",
      });

      setMesas(response.data || []);
      setPaginacion(response.paginacion || null);
    } catch (err) {
      setError(err.message || "Error al cargar las mesas.");
      setMesas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarParametrosArmado = useCallback(async () => {
    setError("");

    try {
      const response = await obtenerParametrosArmadoMesas();
      setParametrosArmado(response.data || null);
      return response.data || null;
    } catch (err) {
      setError(err.message || "Error al obtener los parámetros de armado.");
      return null;
    }
  }, []);

  const abrirModalCrear = useCallback(async () => {
    const data = await cargarParametrosArmado();

    if (data) {
      setModalCrearAbierto(true);
    }
  }, [cargarParametrosArmado]);

  const cerrarModalCrear = useCallback(() => {
    if (!armando) {
      setModalCrearAbierto(false);
    }
  }, [armando]);

  const crearMesas = useCallback(
    async (payload) => {
      setArmando(true);
      setError("");
      setResumenArmado(null);

      try {
        const response = await crearArmadoInicialMesas(payload);

        setResumenArmado(response.data || null);
        setModalCrearAbierto(false);

        await cargarMesas();

        return response;
      } catch (err) {
        setError(err.message || "Error al crear el armado inicial.");
        throw err;
      } finally {
        setArmando(false);
      }
    },
    [cargarMesas]
  );

  const eliminarBorrador = useCallback(async () => {
    const confirmar = window.confirm(
      "¿Seguro que querés eliminar las mesas borrador/observadas sin número de mesa?"
    );

    if (!confirmar) {
      return;
    }

    setArmando(true);
    setError("");
    setResumenArmado(null);

    try {
      const response = await eliminarBorradorMesas();

      setResumenArmado({
        eliminadas: response?.data?.eliminadas || 0,
      });

      await cargarMesas();
    } catch (err) {
      setError(err.message || "Error al eliminar las mesas borrador.");
    } finally {
      setArmando(false);
    }
  }, [cargarMesas]);

  useEffect(() => {
    cargarMesas();
    cargarParametrosArmado();
  }, [cargarMesas, cargarParametrosArmado]);

  const mesasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    let base = [...mesas];

    if (tab === "grupos") {
      base = base.filter((item) => item.estado !== "observada");
    }

    if (tab === "no-agrupadas") {
      base = base.filter((item) => item.estado === "observada");
    }

    if (!texto) {
      return base;
    }

    return base.filter((item) => {
      const valores = [
        item.numero_mesa,
        item.fecha,
        item.fecha_mesa,
        item.turno,
        item.materia,
        item.estudiante,
        item.alumno,
        item.dni,
        item.curso,
        item.curso_materia,
        item.division_materia,
        item.docente,
        item.estado,
        item.observacion,
        item.tipo_mesa,
      ];

      return valores.some((valor) =>
        String(valor || "").toLowerCase().includes(texto)
      );
    });
  }, [busqueda, mesas, tab]);

  const totalObservadas = useMemo(() => {
    return mesas.filter((item) => item.estado === "observada").length;
  }, [mesas]);

  const totalArmadas = useMemo(() => {
    return mesas.filter((item) => item.estado !== "observada").length;
  }, [mesas]);

  return {
    busqueda,
    setBusqueda,

    tab,
    setTab,

    mesas,
    mesasFiltradas,
    paginacion,

    totalObservadas,
    totalArmadas,

    parametrosArmado,
    resumenArmado,

    modalCrearAbierto,
    abrirModalCrear,
    cerrarModalCrear,

    crearMesas,
    eliminarBorrador,

    cargarMesas,

    cargando,
    armando,
    error,
  };
};
